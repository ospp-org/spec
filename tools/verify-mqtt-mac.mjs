#!/usr/bin/env node
/**
 * Verify conformance/test-vectors/crypto/mqtt-mac.json against spec/06-security.md §5.4.
 *
 * A vector nothing recomputes is a claim, not a check. This is the caller. It runs
 * standalone and as Category 19 of tools/verify-protocol.sh.
 *
 * What it pins:
 *   1. Canonicalizing `message` (minus `mac`) per §4.8 reproduces `canonicalJson` byte for byte.
 *   2. HMAC-SHA256 over those bytes, keyed with the DECODED sessionKey, reproduces `mac`.
 *   3. Keying with the 44-character Base64 TEXT instead — the literal reading of the formula
 *      before 0.13.0 — reproduces `macIfKeyNotDecoded` and does NOT equal `mac`.
 *
 * Check 3 is the one that matters. Without it the vector would still pass for an
 * implementation that decoded by luck, and would not distinguish the two readings at all.
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VECTOR = 'conformance/test-vectors/crypto/mqtt-mac.json';

/** OSPP Canonical Form (06-security.md §4.8): recursive key sort, compact, arrays in order. */
function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ':' + canonicalize(value[k]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

export function verifyMqttMacVector(root = ROOT) {
  const failures = [];
  const fail = (what, expected, actual) =>
    failures.push({ what, expected: String(expected), actual: String(actual) });

  let v;
  try {
    v = JSON.parse(readFileSync(path.join(root, VECTOR), 'utf8'));
  } catch (e) {
    return { checks: 0, failures: [{ what: 'read ' + VECTOR, expected: 'readable JSON', actual: e.message }] };
  }

  const keyBytes = Buffer.from(v.key.sessionKeyBase64, 'base64');
  let checks = 0;

  // 0. The key is what the file says it is.
  checks++;
  if (keyBytes.length !== v.key.decodedLengthBytes) {
    fail('decoded key length', v.key.decodedLengthBytes + ' bytes', keyBytes.length + ' bytes');
  }
  checks++;
  if (keyBytes.toString('hex') !== v.key.hex) {
    fail('decoded key bytes', v.key.hex, keyBytes.toString('hex'));
  }

  // 1. Canonical form reproduces, byte for byte.
  const { mac: _dropped, ...withoutMac } = v.message;
  const canonical = canonicalize(withoutMac);
  checks++;
  if (canonical !== v.canonicalJson) {
    fail('canonical form (§4.8) of message minus `mac`', v.canonicalJson, canonical);
  }
  checks++;
  if (Buffer.byteLength(v.canonicalJson, 'utf8') !== v.canonicalLengthBytes) {
    fail('canonicalLengthBytes', v.canonicalLengthBytes, Buffer.byteLength(v.canonicalJson, 'utf8'));
  }

  // 2. The decoded key produces the recorded MAC.
  const decodedMac = createHmac('sha256', keyBytes).update(v.canonicalJson, 'utf8').digest('base64');
  checks++;
  if (decodedMac !== v.mac) {
    fail('HMAC-SHA256(Base64Decode(sessionKey), canonical)', v.mac, decodedMac);
  }

  // 3. The literal reading produces the recorded non-conforming value, and differs.
  const literalMac = createHmac('sha256', Buffer.from(v.key.sessionKeyBase64, 'utf8'))
    .update(v.canonicalJson, 'utf8').digest('base64');
  checks++;
  if (literalMac !== v.macIfKeyNotDecoded.value) {
    fail('HMAC-SHA256(UTF8(sessionKey), canonical) — the literal reading',
      v.macIfKeyNotDecoded.value, literalMac);
  }
  checks++;
  if (literalMac === v.mac) {
    fail('the two readings must differ — otherwise this vector distinguishes nothing',
      'two different MACs', 'identical');
  }

  return { checks, failures };
}

// Standalone entry point. `--json` is how Category 19 of verify-protocol.sh consumes this:
// that harness runs as CommonJS from stdin and cannot `require` an ES module, so it spawns
// this file rather than growing a second copy of the checks.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { checks, failures } = verifyMqttMacVector();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ vector: VECTOR, checks, failures }));
    process.exit(0); // the caller decides what a failure means; parse errors stay parse errors
  }
  for (const f of failures) {
    console.error(`FAIL: ${f.what}\n  expected: ${f.expected}\n  actual:   ${f.actual}`);
  }
  console.log(`${VECTOR}: ${checks - failures.length}/${checks} checks passed`);
  process.exit(failures.length ? 1 : 0);
}
