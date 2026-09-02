#!/usr/bin/env node
// =============================================================================
// generate-tamper-vectors.mjs — (re)generate the cryptographic tamper corpus
// =============================================================================
//
// WHY THIS EXISTS. conformance/test-cases asks an implementer, in four places, to
// prove that a tampered message is REJECTED:
//
//   TC-SEC-001.md:50-51  "alter one byte of the `mac` value"
//   TC-SEC-004.md:34
//   TC-OFF-002.md:122
//   TC-OFF-005.md:220
//
// Until this file existed the corpus could not answer that request. Every vector
// under invalid/ is SCHEMA-invalid — a missing field, a wrong type — and all three
// vector gates assert only "validation failed", never WHICH failure. Nothing
// anywhere held a message that is structurally perfect and cryptographically wrong.
// So the corpus asked the integrator for a test the corpus itself could not pass.
//
// WHAT A TAMPER VECTOR IS, AND WHY IT CANNOT LIVE IN invalid/. A tampered message
// still satisfies its JSON Schema — that is the entire point. Dropping one into
// invalid/ would turn verify-schemas.py RED, because that gate's contract is
// "everything here must fail schema validation". These belong in crypto/, beside
// mqtt-mac.json, which is the other vector whose truth is arithmetic rather than
// structural.
//
// DETERMINISM. No randomness anywhere. Every mutation is a stated rule applied to a
// committed base vector, so this script reproduces the corpus byte for byte from
// nothing but the repository. Re-run it after any base vector is re-signed; the
// verifier fails loudly if the recorded bytes and the derived bytes disagree, which
// is the signal that a base moved underneath a tamper case.
//
// Usage:  node tools/generate-tamper-vectors.mjs [--check]
//         --check re-derives and diffs without writing (used by CI).
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canonicalize } from '@ospp/protocol';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'conformance/test-vectors/crypto/tamper-rejection.json';

const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

// ── mutation primitives ──────────────────────────────────────────────────────

/**
 * Flip the low bit of the LAST byte of a Base64 blob.
 *
 * For a DER ECDSA signature the last byte is the final octet of the `s` INTEGER.
 * Flipping it leaves every DER length byte untouched, so the signature still
 * PARSES and the rejection can only come from the curve arithmetic. That
 * distinction is the whole value of the case: a mutation that broke DER framing
 * would be refused by the parser and would prove nothing about verification.
 *
 * For a 32-byte HMAC there is no structure to preserve, and the same rule applies
 * unchanged.
 */
function flipLastBit(b64) {
  const b = Buffer.from(b64, 'base64');
  if (b.length === 0) throw new Error('empty blob');
  const out = Buffer.from(b);
  out[out.length - 1] ^= 0x01;
  return out.toString('base64');
}

/** Edit one field inside a Base64-wrapped canonical JSON body and re-wrap it. */
function editSignedBody(dataB64, field, newValue) {
  const body = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
  if (!(field in body)) throw new Error(`signed body has no field ${field}`);
  const was = body[field];
  body[field] = newValue;
  return { data: Buffer.from(canonicalize(body), 'utf8').toString('base64'), was };
}

/** Set a value at a slash-path, returning a deep copy. Refuses to create keys. */
function setAt(doc, pointer, value) {
  const copy = JSON.parse(JSON.stringify(doc));
  const parts = pointer.split('/').filter(Boolean);
  let node = copy;
  for (const p of parts.slice(0, -1)) {
    if (!(p in node)) throw new Error(`no such path segment: ${p} in ${pointer}`);
    node = node[p];
  }
  const leaf = parts[parts.length - 1];
  if (!(leaf in node)) throw new Error(`no such leaf: ${pointer}`);
  const was = node[leaf];
  node[leaf] = value;
  return { doc: copy, was };
}

const getAt = (doc, pointer) =>
  pointer.split('/').filter(Boolean).reduce((n, p) => n?.[p], doc);

/**
 * Resolve a vector's schema by CALLING tools/verify-schemas.py's own mapper rather
 * than restating it here. Three implementations of one rule is three chances to get
 * it wrong — the note tools/verify-mqtt-mac.mjs carries about canonical form, for
 * exactly the reason it carries it.
 */
function schemaFor(vectorPath) {
  const py = `
import sys, os
sys.path.insert(0, os.path.join(${JSON.stringify(ROOT)}, 'tools'))
import importlib.util
spec = importlib.util.spec_from_file_location('vs', os.path.join(${JSON.stringify(ROOT)}, 'tools', 'verify-schemas.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
p = m.vector_to_schema_path(os.path.join(${JSON.stringify(ROOT)}, ${JSON.stringify(vectorPath)}))
print(os.path.relpath(p, ${JSON.stringify(ROOT)}) if p and os.path.isfile(p) else '')
`;
  try {
    // PYTHONDONTWRITEBYTECODE: without it the import leaves tools/__pycache__/ behind,
    // which is an untracked directory this generator has no business creating.
    return execFileSync('python3', ['-c', py], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    }).trim() || null;
  } catch {
    return null;
  }
}

// ── portable form: the bytes a verifier actually has to check ────────────────
//
// The whole point of shipping this corpus to the SDKs is that a consumer should not
// have to re-derive six different "what is signed here" rules to use it. Each rule
// lives ONCE — in tools/verify-example-signatures.mjs — and is mirrored here to
// EXTRACT the bytes, so every downstream test is the same three lines:
//
//     verify(key, signedBytes, signature)  →  must be false
//
// Without this an SDK test would need its own copy of six canonicalisation rules,
// which is six more chances to get one wrong and a green test that proves the copy
// agrees with itself.

const STATION_IDENTITY_BODY_FIELDS = ['stationId', 'organizationId', 'stationPubKey', 'issuedAt', 'expiresAt'];
const AUTH_RESPONSE_OK_LABEL = 'AuthResponse_OK';
const FIRMWARE_BIN = 'conformance/test-firmware/test-firmware.bin';

/** U16BE(len) ‖ UTF-8 — the length prefix of 06-security.md §6.5.1. */
function lp(str) {
  const b = Buffer.from(str, 'utf-8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
}

/**
 * The key itself, not a path to it. A `.pem` travels as its text; the symmetric
 * session key travels as Base64 of its bytes.
 */
function keyMaterialOf(ref) {
  const buf = readFileSync(path.join(ROOT, ref));
  return ref.endsWith('.pem') ? buf.toString('utf8') : buf.toString('base64');
}

/** {bytes, signature, algorithm} — what a verifier is handed, per surface. */
function portableForm(surface, doc) {
  switch (surface) {
    case 'receipt':
      return { bytes: Buffer.from(doc.receipt.data, 'base64'), signature: doc.receipt.signature, algorithm: 'ECDSA-P256-SHA256' };
    case 'offlinePass': {
      const { signature, signatureAlgorithm: _a, ...body } = doc.offlinePass;
      return { bytes: Buffer.from(canonicalize(body), 'utf-8'), signature, algorithm: 'ECDSA-P256-SHA256' };
    }
    case 'serverSignedAuth':
      return { bytes: Buffer.from(doc.signedAuthorization.data, 'base64'), signature: doc.signedAuthorization.signature, algorithm: 'ECDSA-P256-SHA256' };
    case 'stationIdentity': {
      const body = {};
      for (const k of STATION_IDENTITY_BODY_FIELDS) body[k] = doc.stationCert[k];
      return { bytes: Buffer.from(canonicalize(body), 'utf-8'), signature: doc.stationCert.signature, algorithm: 'ECDSA-P256-SHA256' };
    }
    case 'firmware':
      // The signature is over the IMAGE, not over the request that points at it.
      return { bytes: readFileSync(path.join(ROOT, FIRMWARE_BIN)), signature: doc.signature, algorithm: 'ECDSA-P256-SHA256' };
    case 'sessionProof':
      return { bytes: Buffer.concat([lp(doc.type), lp(doc.offlinePass.passId), lp(String(doc.counter))]), signature: doc.sessionProof, algorithm: 'HMAC-SHA256' };
    case 'sessionKeyConfirmation':
      return { bytes: Buffer.from(AUTH_RESPONSE_OK_LABEL, 'utf-8'), signature: doc.sessionKeyConfirmation, algorithm: 'HMAC-SHA256' };
    default:
      throw new Error(`no portable form for surface ${surface}`);
  }
}

// ── the cases ────────────────────────────────────────────────────────────────
// One per (surface × mutation class). Two classes, and both are needed:
//
//   BODY   — the message changes, the signature stays well-formed. This is the
//            case the TC documents describe, and the only one that proves the
//            verifier binds the signature to the CONTENT.
//   SIG    — the signature changes, the message stays byte-identical. Proves the
//            verifier actually checks the signature rather than its presence.
//   KEY    — nothing is tampered; a different published test key is used. Proves
//            the verifier binds to an IDENTITY, not merely to "some valid signature".

const CASES = [
  // ── station receipt (ECDSA P-256, station key) ────────────────────────────
  {
    id: 'receipt-body-credits-raised',
    surface: 'receipt', class: 'BODY',
    base: 'conformance/test-vectors/valid/offline/receipt-full.json',
    key: 'conformance/test-keys/station-test-pub.pem',
    what: 'creditsCharged raised 200 → 201 inside the signed body; signature untouched',
    apply: (d) => {
      const { data, was } = editSignedBody(d.receipt.data, 'creditsCharged', 201);
      const r = setAt(d, 'receipt/data', data);
      return { doc: r.doc, pointer: 'receipt/data', was, note: `body.creditsCharged ${was} → 201` };
    },
  },
  {
    id: 'receipt-signature-bitflip',
    surface: 'receipt', class: 'SIG',
    base: 'conformance/test-vectors/valid/offline/receipt-full.json',
    key: 'conformance/test-keys/station-test-pub.pem',
    what: 'low bit of the final octet of the DER `s` scalar flipped; DER framing intact',
    apply: (d) => {
      const r = setAt(d, 'receipt/signature', flipLastBit(d.receipt.signature));
      return { doc: r.doc, pointer: 'receipt/signature', was: r.was, note: 'signature[-1] ^= 0x01' };
    },
  },
  {
    id: 'receipt-verified-with-server-key',
    surface: 'receipt', class: 'KEY',
    base: 'conformance/test-vectors/valid/offline/receipt-full.json',
    key: 'conformance/test-keys/server-test-pub.pem',
    baseKey: 'conformance/test-keys/station-test-pub.pem',
    what: 'pristine station receipt offered to the SERVER key — identity binding, not integrity',
    apply: (d) => ({ doc: d, pointer: null, was: null, note: 'no mutation; wrong key' }),
  },

  // ── OfflinePass (ECDSA P-256, server key) ─────────────────────────────────
  {
    id: 'offlinepass-signature-bitflip',
    surface: 'offlinePass', class: 'SIG',
    base: 'conformance/test-vectors/valid/offline/offline-auth-request-full.json',
    key: 'conformance/test-keys/server-test-pub.pem',
    what: 'OfflinePass signature s-scalar bit flipped',
    apply: (d) => {
      const r = setAt(d, 'offlinePass/signature', flipLastBit(d.offlinePass.signature));
      return { doc: r.doc, pointer: 'offlinePass/signature', was: r.was, note: 'signature[-1] ^= 0x01' };
    },
  },

  // ── sessionProof (HMAC-SHA256, session key) ───────────────────────────────
  {
    id: 'sessionproof-bitflip',
    surface: 'sessionProof', class: 'SIG',
    mode: 'session-proof',
    base: 'conformance/test-vectors/valid/offline/offline-auth-request-full.json',
    key: 'conformance/test-keys/session-test-key.bin',
    what: 'sessionProof HMAC last byte flipped — the same envelope carries TWO signatures, and this is the other one',
    apply: (d) => {
      const r = setAt(d, 'sessionProof', flipLastBit(d.sessionProof));
      return { doc: r.doc, pointer: 'sessionProof', was: r.was, note: 'sessionProof[-1] ^= 0x01' };
    },
  },

  // ── ServerSignedAuth (ECDSA P-256, server key) ────────────────────────────
  {
    id: 'serversignedauth-body-credits-raised',
    surface: 'serverSignedAuth', class: 'BODY',
    base: 'conformance/test-vectors/valid/offline/server-signed-auth-full.json',
    key: 'conformance/test-keys/server-test-pub.pem',
    what: 'creditsAuthorized raised 200 → 400 inside the signed authorization body',
    apply: (d) => {
      const { data, was } = editSignedBody(d.signedAuthorization.data, 'creditsAuthorized', 400);
      const r = setAt(d, 'signedAuthorization/data', data);
      return { doc: r.doc, pointer: 'signedAuthorization/data', was, note: `body.creditsAuthorized ${was} → 400` };
    },
  },
  {
    id: 'serversignedauth-signature-bitflip',
    surface: 'serverSignedAuth', class: 'SIG',
    base: 'conformance/test-vectors/valid/offline/server-signed-auth-full.json',
    key: 'conformance/test-keys/server-test-pub.pem',
    what: 'signedAuthorization signature s-scalar bit flipped',
    apply: (d) => {
      const r = setAt(d, 'signedAuthorization/signature', flipLastBit(d.signedAuthorization.signature));
      return { doc: r.doc, pointer: 'signedAuthorization/signature', was: r.was, note: 'signature[-1] ^= 0x01' };
    },
  },

  // ── StationIdentity certificate (ECDSA P-256, server key) ─────────────────
  {
    id: 'stationidentity-expiry-extended',
    surface: 'stationIdentity', class: 'BODY',
    base: 'conformance/test-vectors/valid/offline/challenge-full.json',
    key: 'conformance/test-keys/server-test-pub.pem',
    what: 'stationCert.expiresAt pushed out by a year — forging a longer-lived identity, the attack the field exists to stop',
    apply: (d) => {
      const r = setAt(d, 'stationCert/expiresAt', '2027-03-15T10:00:00.000Z');
      return { doc: r.doc, pointer: 'stationCert/expiresAt', was: r.was, note: `expiresAt ${r.was} → 2027-03-15T10:00:00.000Z` };
    },
  },
  {
    id: 'stationidentity-signature-bitflip',
    surface: 'stationIdentity', class: 'SIG',
    base: 'conformance/test-vectors/valid/offline/challenge-full.json',
    key: 'conformance/test-keys/server-test-pub.pem',
    what: 'stationCert signature s-scalar bit flipped',
    apply: (d) => {
      const r = setAt(d, 'stationCert/signature', flipLastBit(d.stationCert.signature));
      return { doc: r.doc, pointer: 'stationCert/signature', was: r.was, note: 'signature[-1] ^= 0x01' };
    },
  },

  // ── firmware (ECDSA P-256, firmware key, over the image) ──────────────────
  {
    id: 'firmware-signature-bitflip',
    surface: 'firmware', class: 'SIG',
    base: 'conformance/test-vectors/valid/device-management/update-firmware-request-full.json',
    key: 'conformance/test-keys/firmware-test-pub.pem',
    what: 'firmware image signature s-scalar bit flipped — OSPP ships pointers, so this signature is the only thing standing between a station and an unauthenticated image',
    apply: (d) => {
      const r = setAt(d, 'signature', flipLastBit(d.signature));
      return { doc: r.doc, pointer: 'signature', was: r.was, note: 'signature[-1] ^= 0x01' };
    },
  },

  // ── sessionKeyConfirmation (HMAC-SHA256, session key) ─────────────────────
  {
    id: 'sessionkeyconfirmation-bitflip',
    surface: 'sessionKeyConfirmation', class: 'SIG',
    base: 'conformance/test-vectors/valid/offline/auth-response-minimal.json',
    key: 'conformance/test-keys/session-test-key.bin',
    what: 'AuthResponse sessionKeyConfirmation HMAC last byte flipped',
    apply: (d) => {
      const r = setAt(d, 'sessionKeyConfirmation', flipLastBit(d.sessionKeyConfirmation));
      return { doc: r.doc, pointer: 'sessionKeyConfirmation', was: r.was, note: 'sessionKeyConfirmation[-1] ^= 0x01' };
    },
  },
];

// The MQTT message MAC is not an envelope verify-example-signatures.mjs handles;
// it is HMAC over §4.8 canonical form. Its tamper case is carried alongside and
// checked by the verifier with node crypto directly, so that §5.4 — the surface
// TC-SEC-001 actually names — is not the one surface left without a negative.
function mqttMacCase() {
  const v = read('conformance/test-vectors/crypto/mqtt-mac.json');
  return {
    id: 'mqtt-mac-bitflip',
    surface: 'mqttMessageMac', class: 'SIG',
    base: 'conformance/test-vectors/crypto/mqtt-mac.json',
    key: 'inline: mqtt-mac.json .key.sessionKeyBase64',
    what: 'the §5.4 message MAC with its last byte flipped — literally "alter one byte of the `mac` value" (TC-SEC-001.md:50-51)',
    mutatedPointer: 'mac',
    was: v.mac,
    now: flipLastBit(v.mac),
    schema: null,
    // Same portable shape as every other surface, so a consumer's loop has no special
    // case. The key is inline rather than a file because this vector carries its own.
    portable: {
      algorithm: 'HMAC-SHA256',
      key: 'inline',
      keyInlineBase64: v.key.sessionKeyBase64,
      base: {
        signedBytesBase64: Buffer.from(v.canonicalJson, 'utf-8').toString('base64'),
        signature: v.mac,
        key: 'inline',
        keyMaterial: v.key.sessionKeyBase64,
        mustVerify: true,
      },
      tampered: {
        signedBytesBase64: Buffer.from(v.canonicalJson, 'utf-8').toString('base64'),
        signature: flipLastBit(v.mac),
        key: 'inline',
        keyMaterial: v.key.sessionKeyBase64,
        mustVerify: false,
      },
    },
  };
}

// ── build ────────────────────────────────────────────────────────────────────

function build() {
  const vectors = [];
  for (const c of CASES) {
    const base = read(c.base);
    const { doc, pointer, was, note } = c.apply(base);
    vectors.push({
      id: c.id,
      surface: c.surface,
      class: c.class,
      base: c.base,
      key: c.key,
      // The key the BASE verifies under. Differs from `key` only for class KEY, where
      // the point is that a pristine document must be refused by the wrong identity.
      // The verifier needs both: without a passing base the failing tamper proves nothing.
      baseKey: c.baseKey ?? c.key,
      ...(c.mode ? { mode: c.mode } : {}),
      what: c.what,
      mutation: note,
      mutatedPointer: pointer,
      was: pointer ? String(was) : null,
      now: pointer ? String(getAt(doc, pointer)) : null,
      schema: schemaFor(c.base),
      // Everything a verifier needs, with no OSPP-specific derivation left to do.
      // `mustVerify` is the assertion, stated in the data rather than in each
      // consumer's test file.
      portable: {
        algorithm: portableForm(c.surface, doc).algorithm,
        key: c.key,
        base: {
          signedBytesBase64: portableForm(c.surface, base).bytes.toString('base64'),
          signature: portableForm(c.surface, base).signature,
          key: c.baseKey ?? c.key,
          // Inlined so the corpus travels as ONE file. The SDKs vendor test-vectors/
          // and not test-keys/, and an integrator reading this should not have to
          // resolve a path into a repository he may not have cloned. These are the
          // published PUBLIC test keys (and the published symmetric test key); the
          // spec repo has always shipped them in the clear.
          keyMaterial: keyMaterialOf(c.baseKey ?? c.key),
          mustVerify: true,
        },
        tampered: {
          signedBytesBase64: portableForm(c.surface, doc).bytes.toString('base64'),
          signature: portableForm(c.surface, doc).signature,
          key: c.key,
          keyMaterial: keyMaterialOf(c.key),
          mustVerify: false,
        },
      },
      document: doc,
    });
  }
  vectors.push(mqttMacCase());
  return {
    _comment:
      'Cryptographic TAMPER-REJECTION vectors. Each document below is STRUCTURALLY VALID — it satisfies its JSON Schema — and CRYPTOGRAPHICALLY WRONG. That is what separates this file from everything under invalid/, where every vector fails schema validation and all three vector gates assert only that SOMETHING failed. Verification of each document here MUST be refused. Regenerate with `node tools/generate-tamper-vectors.mjs`; check with `node tools/verify-tamper-rejection.mjs`.',
    _why:
      'conformance/test-cases/security/TC-SEC-001.md:50-51, TC-SEC-004.md:34, and conformance/test-cases/offline/TC-OFF-002.md:122, TC-OFF-005.md:220 each instruct an implementer to prove a tampered message is rejected. Before this file, no machine-readable vector and no gate existed for any of them: tools/verify-all-signatures.sh names only conformance/test-vectors/valid/** paths, and tools/verify-ble-crypto.mjs has no tamper branch. The corpus asked for a test it could not itself pass.',
    _classes: {
      BODY: 'the message changes, the signature stays well-formed — proves the signature is bound to CONTENT',
      SIG: 'the signature changes, the message stays byte-identical — proves the signature is CHECKED, not merely present',
      KEY: 'nothing is tampered; a different published test key is offered — proves binding to an IDENTITY',
    },
    specRef: '06-security.md §5.4, §6.5',
    generatedBy: 'tools/generate-tamper-vectors.mjs',
    count: vectors.length,
    vectors,
  };
}

const out = build();
const text = JSON.stringify(out, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const existing = readFileSync(path.join(ROOT, OUT), 'utf8');
  if (existing !== text) {
    console.error(`FAIL: ${OUT} is not what tools/generate-tamper-vectors.mjs produces.`);
    console.error('       A base vector was re-signed or edited without regenerating the tamper corpus.');
    console.error('       Fix: node tools/generate-tamper-vectors.mjs');
    process.exit(1);
  }
  console.log(`${OUT}: reproduces byte for byte (${out.count} vectors)`);
  process.exit(0);
}

writeFileSync(path.join(ROOT, OUT), text);
console.log(`${OUT}: wrote ${out.count} tamper vectors across ${new Set(out.vectors.map((v) => v.surface)).size} crypto surfaces`);
