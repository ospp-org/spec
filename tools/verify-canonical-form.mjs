#!/usr/bin/env node
/**
 * Verify tools/canonical-form.mjs against conformance/test-vectors/crypto/canonical-form.json.
 *
 * The direction matters. The vector file's `canonical` strings are the ORACLE — recomputed
 * from `06-security.md` §4.8.1 independently of any implementation — and the module is the
 * thing under test. Not the other way round.
 *
 * Three checks, because the first alone is not enough:
 *
 *   1. Every vector: module output must equal the recorded canonical string, byte for byte.
 *
 *   2. The comparator directly. Step 1 is the rule both SDKs got wrong, and routing every
 *      assertion through `canonicalForm` would let a broken comparator hide behind a vector
 *      whose keys happen not to discriminate. These pin `compareKeysUtf8` itself.
 *
 *   3. FALSIFIABILITY. A corpus that no longer separates right from wrong passes silently.
 *      So the harness runs a deliberately-broken canonicalizer — the exact `Object.keys().sort()`
 *      defect — over the same corpus and asserts that it FAILS. If it passes, the vectors that
 *      discriminate have been removed or weakened, and this check says so rather than
 *      reporting green. This is what stops the corpus from rotting into decoration.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canonicalForm, compareKeysUtf8, encodeString } from './canonical-form.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VECTOR = 'conformance/test-vectors/crypto/canonical-form.json';

/** The defect, reproduced on purpose: UTF-16 ordering plus rebuild-a-sorted-object. */
function brokenCanonicalForm(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return encodeString(value);
  if (Array.isArray(value)) return '[' + value.map(brokenCanonicalForm).join(',') + ']';
  const rebuilt = {};
  for (const k of Object.keys(value).sort()) rebuilt[k] = value[k];
  return '{' + Object.keys(rebuilt)
    .map(k => encodeString(k) + ':' + brokenCanonicalForm(rebuilt[k])).join(',') + '}';
}

export function verifyCanonicalFormVectors(root = ROOT) {
  const failures = [];
  const fail = (what, expected, actual) =>
    failures.push({ what, expected: String(expected), actual: String(actual) });

  let doc;
  try {
    doc = JSON.parse(readFileSync(path.join(root, VECTOR), 'utf8'));
  } catch (e) {
    return { checks: 0, failures: [{ what: 'read ' + VECTOR, expected: 'readable JSON', actual: e.message }] };
  }

  let checks = 0;

  // 1 — the corpus.
  for (const v of doc.vectors) {
    checks++;
    let got;
    try { got = canonicalForm(v.input); }
    catch (e) { fail(`vector ${v.name}: threw`, v.canonical, e.message); continue; }
    if (got !== v.canonical) fail(`vector ${v.name}`, v.canonical, got);
  }

  // 2 — the comparator, directly (06-security.md:679).
  const pairs = [
    // UTF-8 byte order puts U+FFFD (EF BF BD) before U+1D400 (F0 9D 90 80).
    // Array.prototype.sort() puts them the other way: D835 < FFFD in UTF-16.
    ['\uFFFD', '\u{1D400}', 'astral key must sort AFTER a high BMP key'],
    // Byte order is not numeric order.
    ['1', '10', "'1' before '10'"],
    ['10', '2', "'10' before '2' — byte order, not numeric"],
    // U+2028 encodes E2 80 A8, so it follows ASCII.
    ['b', '\u2028', 'U+2028 must sort after ASCII b'],
    ['A', 'a', 'uppercase before lowercase (0x41 < 0x61)'],
  ];
  for (const [lo, hi, why] of pairs) {
    checks++;
    if (!(compareKeysUtf8(lo, hi) < 0)) {
      fail(`comparator: ${why}`, 'compareKeysUtf8(lo, hi) < 0', compareKeysUtf8(lo, hi));
    }
  }

  // 3 — falsifiability: the broken implementation must be caught by this corpus.
  checks++;
  const caught = doc.vectors.filter(v => {
    try { return brokenCanonicalForm(v.input) !== v.canonical; } catch { return true; }
  });
  if (caught.length === 0) {
    fail('corpus no longer separates the UTF-16 defect from the UTF-8 rule',
      'at least one vector rejects a broken canonicalizer',
      'every vector accepts it — the discriminating vectors are gone');
  }

  return { checks, failures, discriminating: caught.map(v => v.name) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { checks, failures, discriminating } = verifyCanonicalFormVectors();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ vector: VECTOR, checks, failures, discriminating }));
    process.exit(0);
  }
  for (const f of failures) {
    console.error(`FAIL: ${f.what}\n  expected: ${f.expected}\n  actual:   ${f.actual}`);
  }
  console.log(`${VECTOR}: ${checks - failures.length}/${checks} checks passed`);
  console.log(`vectors that reject a UTF-16-sorting implementation: ${discriminating.length} ` +
    `(${discriminating.join(', ')})`);
  process.exit(failures.length ? 1 : 0);
}
