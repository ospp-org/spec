#!/usr/bin/env node
/**
 * verify-test-nonces.mjs — the handshake nonces in the worked documents are derived, and distinct.
 *
 * Why this exists
 * ---------------
 * `ble-handshake.md` §4.2.2 makes `appNonce` the claim-layer replay defence and rests it on one
 * property: *"every `Hello.appNonce` is a 32-byte cryptographically random value **never reused
 * across handshakes**"*. The corpus contradicted that. One `appNonce` and one `stationNonce`
 * literal appeared in **four** documents depicting four different handshakes — the normative
 * profile, two worked flows, and the negative scenario that exists to show a rejection. Nothing
 * detected it, because a nonce is schema-valid whatever its value.
 *
 * The cost is the same as any fixture that does not discriminate: since the corpus never exhibited
 * a *different* nonce for a *different* handshake, there was no case in which a replayed nonce
 * was distinguishable from a fresh one, and an implementation that never recorded an `appNonce`
 * satisfied every document.
 *
 * How it is fixed
 * ---------------
 * The nonces are **derived**, not typed, from a documented seed — the same pattern
 * `conformance/test-keys/session-test-key.bin` already uses:
 *
 *     nonce = Base64( SHA-256( "OSPP_TEST_NONCE_V1:<label>:<field>" ) )
 *
 * SHA-256 is 32 bytes, which is exactly what the schemas require (`^[A-Za-z0-9+/]{43}=$`). One
 * label per handshake, so distinctness is a property of the derivation rather than of anyone
 * remembering to vary it. `--write` regenerates them; the default run verifies.
 *
 * Scope, deliberately narrow
 * --------------------------
 * Only documents that *depict a handshake in prose* are derived and checked for cross-document
 * reuse. `conformance/test-vectors/**` is **out of scope on purpose**: the nonces in
 * `crypto/ble-handshake-keyschedule.json` are the anchored inputs of a key schedule and are shared
 * with `offline/hello-*.json` and `offline/challenge-*.json` *because* the schedule is derived from
 * those exact bytes. That sharing is the vector's correctness, not a defect, and rewriting it would
 * break `verify-ble-crypto.mjs`.
 *
 * Exit status: 0 all derived values match and no literal is shared across documents; 1 otherwise.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const SEED = 'OSPP_TEST_NONCE_V1';

// One label per handshake. The label is what makes the value distinct, so two documents must
// never share one.
const HANDSHAKES = [
  { label: 'ble-handshake-profile', file: 'spec/profiles/offline/ble-handshake.md' },
  { label: 'flow-04-full-offline', file: 'examples/flows/04-full-offline-session.md' },
  { label: 'flow-05-partial-a', file: 'examples/flows/05-partial-a-session.md' },
  { label: 'flow-06-partial-b', file: 'examples/flows/06-partial-b-session.md' },
  { label: 'error-03-pass-expired', file: 'examples/error-scenarios/03-offline-pass-expired.md' },
];

// Scanned for cross-document reuse but not derived — these carry one handshake each and are
// already distinct.
const SCAN_ONLY = ['examples/payloads/ble/hello.json', 'examples/payloads/ble/challenge.json'];

const FIELDS = ['appNonce', 'stationNonce'];

function derive(label, field) {
  return createHash('sha256').update(`${SEED}:${label}:${field}`).digest('base64');
}

function literalsIn(text, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([A-Za-z0-9+/]{43}=)"`, 'g');
  return [...text.matchAll(re)].map((m) => m[1]);
}

function main() {
  const write = argv.includes('--write');
  let fail = 0;
  const seen = new Map(); // literal -> [file...]

  for (const { label, file } of HANDSHAKES) {
    let text = readFileSync(file, 'utf-8');
    const before = text;
    for (const field of FIELDS) {
      const want = derive(label, field);
      const found = literalsIn(text, field);
      if (found.length === 0) continue;
      if (write) {
        text = text.replace(
          new RegExp(`("${field}"\\s*:\\s*")[A-Za-z0-9+/]{43}=(")`, 'g'),
          `$1${want}$2`,
        );
      } else {
        for (const got of found) {
          if (got !== want) {
            console.log(`  FAIL ${file} ${field}: not the derived value for label "${label}"`);
            console.log(`       want ${want}`);
            console.log(`       got  ${got}`);
            fail++;
          }
        }
      }
    }
    if (write && text !== before) {
      writeFileSync(file, text);
      console.log(`  wrote ${file}`);
    }
  }

  // Cross-document reuse — the property the profile's replay argument actually rests on.
  for (const file of [...HANDSHAKES.map((h) => h.file), ...SCAN_ONLY]) {
    const text = readFileSync(file, 'utf-8');
    for (const field of FIELDS) {
      for (const lit of literalsIn(text, field)) {
        if (!seen.has(lit)) seen.set(lit, []);
        if (!seen.get(lit).includes(file)) seen.get(lit).push(file);
      }
    }
  }
  for (const [lit, files] of seen) {
    if (files.length > 1) {
      console.log(`  FAIL nonce reused across ${files.length} documents: ${lit.slice(0, 16)}…`);
      for (const f of files) console.log(`       ${f}`);
      fail++;
    }
  }

  if (write) {
    console.log('\nRe-run without --write to verify.');
    return 0;
  }
  console.log(
    `\n${HANDSHAKES.length} handshake document(s) derived, ` +
      `${seen.size} distinct nonce literal(s) across ${HANDSHAKES.length + SCAN_ONLY.length} documents.`,
  );
  if (fail) {
    console.log(`${fail} failure(s). Regenerate with --write, or give the document its own label.`);
    return 1;
  }
  console.log('All derived nonces match their labels and no literal is shared across documents.');
  return 0;
}

exit(main());
