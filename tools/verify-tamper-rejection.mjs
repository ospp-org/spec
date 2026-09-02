#!/usr/bin/env node
// =============================================================================
// verify-tamper-rejection.mjs — the caller for the tamper corpus
// =============================================================================
//
// A vector nothing recomputes is a claim, not a check — the sentence
// tools/verify-mqtt-mac.mjs opens with, and the reason this file exists beside
// conformance/test-vectors/crypto/tamper-rejection.json rather than after it.
//
// Every other gate over the vector corpus proves that VALID things verify.
// tools/verify-all-signatures.sh names only conformance/test-vectors/valid/**;
// tools/verify-ble-crypto.mjs has no tamper branch; and all three schema gates
// (verify-schemas.py:185-187, sdk-ts SchemaValidator.test.ts, php-sdk
// ConformanceVectorTest.php) count ANY error as success, so none of them can tell
// a bad signature from a missing field. This one proves the opposite direction:
// that a structurally perfect, cryptographically wrong message is REFUSED.
//
// FOUR CHECKS PER VECTOR, and the first is the one that makes the rest mean
// anything:
//
//   1. ANTI-VACUITY — the BASE document, untampered, VERIFIES under its own key.
//      Without this a mistyped path, a missing key file or a renamed vector would
//      all produce "verification failed" and be scored as a pass. A proof of
//      refusal that cannot distinguish refusal from breakage proves nothing.
//   2. REFUSAL — the tampered document does NOT verify under the stated key.
//   3. MINIMALITY — the mutation is exactly what the vector says it is: for class
//      SIG exactly ONE BIT differs and the message is byte-identical; for class
//      BODY the signature is byte-identical and only the body moved; for class KEY
//      nothing moved at all. A tamper case that quietly broke two things would
//      still be refused, and would no longer be evidence about the thing it names.
//   4. STRUCTURAL VALIDITY — the tampered document still satisfies its JSON Schema.
//      This is the check that separates this corpus from invalid/. If a tampered
//      document failed schema validation, its refusal would be structural and would
//      say nothing about crypto.
//
// Usage:  node tools/verify-tamper-rejection.mjs [--json]
// =============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';
import { ecdsaVerify } from '@ospp/protocol/server';
import addFormats from 'ajv-formats';
import { canonicalForm } from './canonical-form.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VECTOR = 'conformance/test-vectors/crypto/tamper-rejection.json';
const VERIFIER = path.join(ROOT, 'tools', 'verify-example-signatures.mjs');

// Anti-vacuity floors. These are not decoration: a corpus that silently shrank to
// one surface would still report "all passed" without them. Raise them when the
// corpus grows; a raise is a deliberate edit, a shrink is a red build.
const MIN_VECTORS = 12;
const MIN_SURFACES = 8;
const REQUIRED_CLASSES = ['BODY', 'SIG', 'KEY'];

const failures = [];
let checks = 0;
const fail = (id, what, expected, actual) => {
  failures.push({ id, what, expected: String(expected), actual: String(actual) });
};

// ── schema store: every schema in the repo, so $ref resolves ─────────────────
function buildAjv() {
  const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false });
  addFormats(ajv);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.schema.json')) {
        const s = JSON.parse(readFileSync(p, 'utf8'));
        if (s.$id && !ajv.getSchema(s.$id)) ajv.addSchema(s, s.$id);
      }
    }
  };
  walk(path.join(ROOT, 'schemas'));
  return ajv;
}

/** Run verify-example-signatures.mjs over one document. Returns true iff it verified. */
function verifies(doc, keyPath, mode, tmp) {
  const file = path.join(tmp, `v-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(doc, null, 2));
  const args = [VERIFIER, '--key', path.join(ROOT, keyPath)];
  if (mode) args.push('--mode', mode);
  args.push(file);
  try {
    execFileSync('node', args, { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  } finally {
    rmSync(file, { force: true });
  }
}

/** Count differing bits between two Base64 blobs. -1 if lengths differ. */
function bitsDiffer(a, b) {
  const x = Buffer.from(a, 'base64');
  const y = Buffer.from(b, 'base64');
  if (x.length !== y.length) return -1;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    let v = x[i] ^ y[i];
    while (v) { n += v & 1; v >>= 1; }
  }
  return n;
}

const getAt = (doc, pointer) =>
  pointer.split('/').filter(Boolean).reduce((n, p) => n?.[p], doc);

// ── the MQTT §5.4 message MAC, checked in-process ────────────────────────────
// Not an envelope verify-example-signatures.mjs handles; §5.4 is the surface
// TC-SEC-001 actually names, so it must not be the one left without a negative.
function checkMqttMac(v) {
  const src = JSON.parse(readFileSync(path.join(ROOT, v.base), 'utf8'));
  const keyBytes = Buffer.from(src.key.sessionKeyBase64, 'base64');
  const { mac: _drop, ...withoutMac } = src.message;
  const computed = createHmac('sha256', keyBytes)
    .update(canonicalForm(withoutMac), 'utf8').digest('base64');

  checks++;
  if (computed !== v.was) {
    fail(v.id, 'ANTI-VACUITY: the untampered MAC must recompute', v.was, computed);
  }
  checks++;
  if (computed === v.now) {
    fail(v.id, 'REFUSAL: the tampered MAC must not equal the computed MAC', 'different', 'identical');
  }
  checks++;
  const a = Buffer.from(computed, 'base64');
  const b = Buffer.from(v.now, 'base64');
  const equal = a.length === b.length && timingSafeEqual(a, b);
  if (equal) {
    fail(v.id, 'REFUSAL: constant-time compare must reject the tampered MAC', 'reject', 'accept');
  }
  checks++;
  const bits = bitsDiffer(v.was, v.now);
  if (bits !== 1) {
    fail(v.id, 'MINIMALITY: exactly one bit must differ', '1 bit', `${bits} bit(s)`);
  }
}

/**
 * Verify the portable {bytes, signature, key} triple in BOTH directions, with the
 * primitive a consumer would use — not with verify-example-signatures.mjs. Two
 * methods over one claim: if they ever disagree, the corpus is lying to whichever
 * consumer trusts the other one.
 */
function checkPortable(v) {
  const p = v.portable;
  if (!p) {
    checks++;
    fail(v.id, 'every vector must carry a portable form for the SDKs', 'present', 'absent');
    return;
  }
  // Deliberately the INLINE material, not the file on disk: that is what every
  // downstream consumer will use, so it is what has to be proven correct here.
  // If the inlining ever drifted from the key files, the file-based section above
  // would still pass and this would not.
  const keyBytes = (s) => Buffer.from(s.keyMaterial, 'base64');

  const check = (side) => {
    const s = p[side];
    const bytes = Buffer.from(s.signedBytesBase64, 'base64');
    let ok;
    if (p.algorithm === 'HMAC-SHA256') {
      const expected = createHmac('sha256', keyBytes(s)).update(bytes).digest('base64');
      const a = Buffer.from(expected, 'base64');
      const b = Buffer.from(s.signature, 'base64');
      ok = a.length === b.length && timingSafeEqual(a, b);
    } else {
      ok = ecdsaVerify(s.keyMaterial, bytes, s.signature);
    }
    checks++;
    if (ok !== s.mustVerify) {
      fail(v.id, `PORTABLE (${side}): ${p.algorithm} over ${bytes.length}B with ${s.key} must ` +
        (s.mustVerify ? 'VERIFY' : 'be REFUSED'), s.mustVerify, ok);
    }
  };
  check('base');
  check('tampered');
}

// ── main ─────────────────────────────────────────────────────────────────────
export function verifyTamperRejection() {
  let corpus;
  try {
    corpus = JSON.parse(readFileSync(path.join(ROOT, VECTOR), 'utf8'));
  } catch (e) {
    return { checks: 0, failures: [{ id: '-', what: 'read ' + VECTOR, expected: 'readable JSON', actual: e.message }] };
  }

  const vectors = corpus.vectors ?? [];
  const surfaces = new Set(vectors.map((v) => v.surface));
  const classes = new Set(vectors.map((v) => v.class));

  checks++;
  if (vectors.length < MIN_VECTORS) {
    fail('-', `ANTI-VACUITY: corpus must hold at least ${MIN_VECTORS} vectors`, MIN_VECTORS, vectors.length);
  }
  checks++;
  if (surfaces.size < MIN_SURFACES) {
    fail('-', `ANTI-VACUITY: corpus must cover at least ${MIN_SURFACES} crypto surfaces`, MIN_SURFACES, surfaces.size);
  }
  for (const c of REQUIRED_CLASSES) {
    checks++;
    if (!classes.has(c)) {
      fail('-', `ANTI-VACUITY: mutation class ${c} must be represented`, 'present', 'absent');
    }
  }
  checks++;
  if (vectors.length !== corpus.count) {
    fail('-', 'declared count matches the array', corpus.count, vectors.length);
  }

  const ajv = buildAjv();
  const tmp = mkdtempSync(path.join(tmpdir(), 'ospp-tamper-'));
  try {
    for (const v of vectors) {
      if (v.surface === 'mqttMessageMac') { checkMqttMac(v); checkPortable(v); continue; }

      const base = JSON.parse(readFileSync(path.join(ROOT, v.base), 'utf8'));

      // 1. ANTI-VACUITY — the base verifies under its own key.
      checks++;
      if (!verifies(base, v.baseKey, v.mode, tmp)) {
        fail(v.id, 'ANTI-VACUITY: the untampered base must VERIFY under ' + v.baseKey,
          'verifies', 'refused — so the refusal below proves nothing');
        continue; // every later check on this vector is now meaningless
      }

      // 2. REFUSAL — the tampered document does not verify.
      checks++;
      if (verifies(v.document, v.key, v.mode, tmp)) {
        fail(v.id, `REFUSAL: ${v.what}`, 'refused', 'ACCEPTED — a tampered message verified');
      }

      // 3. MINIMALITY — the mutation is exactly what the vector claims.
      if (v.class === 'SIG') {
        checks++;
        const bits = bitsDiffer(v.was, v.now);
        if (bits !== 1) {
          fail(v.id, 'MINIMALITY: class SIG must differ by exactly one bit', '1 bit', `${bits} bit(s)`);
        }
        checks++;
        const wasLen = Buffer.from(v.was, 'base64').length;
        const nowLen = Buffer.from(v.now, 'base64').length;
        if (wasLen !== nowLen) {
          fail(v.id, 'MINIMALITY: class SIG must preserve blob length (DER framing intact)', wasLen, nowLen);
        }
      } else if (v.class === 'BODY') {
        // The signature must be untouched: the refusal has to come from the content.
        // The signature is the SIBLING of the mutated field, not the field with its
        // last segment rewritten. The first version of this line was
        // `mutatedPointer.replace(/data$/,'signature')`, which resolves correctly only
        // when the tampered field is literally named `data` — and for
        // stationidentity-expiry-extended it left the pointer unchanged, so the check
        // compared expiresAt to itself and could only ever pass. A minimality check
        // that cannot fail is not a check.
        checks++;
        const parent = v.mutatedPointer.split('/').slice(0, -1).join('/');
        const sigPath = parent ? `${parent}/signature` : 'signature';
        const beforeSig = getAt(base, sigPath);
        const afterSig = getAt(v.document, sigPath);
        if (beforeSig === undefined) {
          fail(v.id, 'MINIMALITY: class BODY must have a sibling signature at ' + sigPath,
            'a signature to hold still', 'no such field');
        } else if (beforeSig !== afterSig) {
          fail(v.id, 'MINIMALITY: class BODY must leave the signature byte-identical', beforeSig, afterSig);
        }
        checks++;
        if (getAt(base, v.mutatedPointer) === getAt(v.document, v.mutatedPointer)) {
          fail(v.id, 'MINIMALITY: class BODY must actually change the signed body', 'changed', 'identical');
        }
      } else if (v.class === 'KEY') {
        checks++;
        if (JSON.stringify(base) !== JSON.stringify(v.document)) {
          fail(v.id, 'MINIMALITY: class KEY must not mutate the document at all', 'identical', 'mutated');
        }
        checks++;
        if (v.key === v.baseKey) {
          fail(v.id, 'MINIMALITY: class KEY must offer a DIFFERENT key', 'different key', v.key);
        }
      }

      // 3b. THE PORTABLE FORM AGREES WITH THE DOCUMENT FORM.
      //     The `portable` block is what the SDKs consume — raw bytes plus a
      //     signature, no OSPP-specific derivation. If the extraction were wrong,
      //     every downstream SDK test would be green against bytes nobody signs, and
      //     the fact that the document-level check above passed would hide it. So the
      //     portable form is checked HERE, by a second method, against the same keys.
      checkPortable(v);

      // 4. STRUCTURAL VALIDITY — this is why the vector cannot live in invalid/.
      if (v.schema) {
        checks++;
        const schema = JSON.parse(readFileSync(path.join(ROOT, v.schema), 'utf8'));
        const validate = schema.$id && ajv.getSchema(schema.$id)
          ? ajv.getSchema(schema.$id)
          : ajv.compile(schema);
        if (!validate(v.document)) {
          fail(v.id,
            'STRUCTURAL: the tampered document must STILL satisfy ' + v.schema +
            ' — otherwise its refusal is structural, not cryptographic',
            'valid', ajv.errorsText(validate.errors, { separator: '; ' }).slice(0, 200));
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  return { checks, failures, vectors: vectors.length, surfaces: surfaces.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = verifyTamperRejection();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ vector: VECTOR, checks: r.checks, failures: r.failures }));
    process.exit(0); // the caller decides what a failure means
  }
  for (const f of r.failures) {
    console.error(`FAIL [${f.id}]: ${f.what}\n  expected: ${f.expected}\n  actual:   ${f.actual}`);
  }
  console.log(
    `${VECTOR}: ${r.checks - r.failures.length}/${r.checks} checks passed ` +
    `(${r.vectors} vectors, ${r.surfaces} crypto surfaces)`
  );
  process.exit(r.failures.length ? 1 : 0);
}
