#!/usr/bin/env node
// =============================================================================
// verify-example-signatures.mjs — verify station-signed OSPP receipt examples
// =============================================================================
//
// For each input JSON file containing a `receipt` wrapper, this tool:
//
//   1. Reads `receipt.data` (base64-encoded canonical body) and decodes it.
//   2. Verifies `receipt.signature` against the provided public key over the
//      decoded canonical bytes, using ECDSA-P256-SHA256 (spec §6.2 Verification).
//   3. Cross-checks the decoded body against the outer wrapper fields: every
//      field that appears in BOTH must compare equal. This catches drift
//      between the signed body and the human-visible envelope.
//   4. Re-canonicalises the decoded body and asserts the bytes round-trip
//      (no whitespace, no key-order drift inside the canonical bytes).
//
// Exit non-zero on any failure. Designed for CI.
//
// Usage:
//   node tools/verify-example-signatures.mjs --key <pub.pem> <file...>
//
// =============================================================================

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { canonicalize } from '@ospp/protocol';
import { ecdsaVerify } from '@ospp/protocol/server';

function parseArgs(args) {
  const opts = { key: null, files: [] };
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--key') opts.key = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: verify-example-signatures.mjs --key <pub.pem> <file...>');
      exit(0);
    } else opts.files.push(a);
  }
  if (!opts.key) {
    console.error('error: --key <pub.pem> is required');
    exit(2);
  }
  if (opts.files.length === 0) {
    console.error('error: at least one input file is required');
    exit(2);
  }
  return opts;
}

function verifyFile(file, pubPem) {
  const outer = JSON.parse(readFileSync(file, 'utf-8'));
  const receipt = outer.receipt;
  if (!receipt || typeof receipt !== 'object') {
    return { file, ok: false, reason: 'missing .receipt wrapper' };
  }
  for (const k of ['data', 'signature', 'signatureAlgorithm']) {
    if (typeof receipt[k] !== 'string') {
      return { file, ok: false, reason: `receipt.${k} missing or not a string` };
    }
  }
  if (receipt.signatureAlgorithm !== 'ECDSA-P256-SHA256') {
    return { file, ok: false, reason: `signatureAlgorithm "${receipt.signatureAlgorithm}" != ECDSA-P256-SHA256` };
  }

  const canonicalBytes = Buffer.from(receipt.data, 'base64');

  // Signature verification (spec §6.2 Verification step 4).
  if (!ecdsaVerify(pubPem, canonicalBytes, receipt.signature)) {
    return { file, ok: false, reason: 'signature failed to verify against the provided public key' };
  }

  // Round-trip canonicality — the decoded body re-canonicalises to the same bytes.
  let body;
  try {
    body = JSON.parse(canonicalBytes.toString('utf-8'));
  } catch (e) {
    return { file, ok: false, reason: `decoded receipt.data is not valid JSON: ${e.message}` };
  }
  const recanonical = canonicalize(body);
  if (recanonical !== canonicalBytes.toString('utf-8')) {
    return { file, ok: false, reason: 'receipt.data is not OSPP-canonical (re-canonicalisation produced different bytes)' };
  }

  // Body/outer cross-check on shared fields — drift detection (§6.2 Note 5
  // semantics: pass / user / device claims are cryptographically bound; the
  // server cross-checks signed body against the envelope). Compare via the
  // canonical form so a key-order difference inside a nested object (the
  // signed body is alphabetically sorted by spec; the human-edited outer
  // wrapper preserves insertion order) is not flagged as drift.
  const mismatches = [];
  for (const k of Object.keys(body)) {
    if (k in outer) {
      const bv = canonicalize({ v: body[k] });
      const ov = canonicalize({ v: outer[k] });
      if (bv !== ov) mismatches.push(`${k}: body=${bv} outer=${ov}`);
    }
  }
  if (mismatches.length > 0) {
    return { file, ok: false, reason: `body/outer drift on shared fields: ${mismatches.join('; ')}` };
  }

  return {
    file,
    ok: true,
    bodyFields: Object.keys(body),
    canonicalBytes: canonicalBytes.length,
  };
}

function main() {
  const opts = parseArgs(argv);
  const pubPem = readFileSync(opts.key, 'utf-8');

  let failures = 0;
  for (const file of opts.files) {
    const r = verifyFile(file, pubPem);
    if (r.ok) {
      console.log(`  OK  ${r.file}  (body=${r.bodyFields.length} fields, canonical=${r.canonicalBytes}B)`);
    } else {
      console.error(`  FAIL ${r.file}: ${r.reason}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures}/${opts.files.length} file(s) failed verification`);
    exit(1);
  }
  console.log(`\nAll ${opts.files.length} signature(s) verified.`);
}

main();
