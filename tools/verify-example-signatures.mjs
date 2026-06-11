#!/usr/bin/env node
// =============================================================================
// verify-example-signatures.mjs — verify ECDSA-P256 signed OSPP examples
// =============================================================================
//
// Auto-detects the wrapper shape and verifies the appropriate signature with
// the supplied PEM public key. Designed for CI: exits non-zero on any failure.
//
// Modes:
//
//   1. RECEIPT  (`outer.receipt = {data, signature, signatureAlgorithm}`)
//      - Decode receipt.data as base64 → canonical bytes
//      - Verify receipt.signature against canonical bytes
//      - Round-trip canonicality: re-canonicalise the decoded body, must match
//      - Cross-check body / outer on shared fields (drift detection)
//
//   2. OFFLINE_PASS  (`outer.offlinePass` with inline signature + signatureAlgorithm)
//      - Strip signature + signatureAlgorithm from the pass object
//      - Canonicalise the remainder → canonical bytes
//      - Verify offlinePass.signature against canonical bytes
//      - Re-canonicalise yields the same bytes
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

function detectMode(outer) {
  if (outer && typeof outer === 'object' && typeof outer.receipt === 'object' && outer.receipt !== null) {
    return 'receipt';
  }
  if (outer && typeof outer === 'object' && typeof outer.offlinePass === 'object' && outer.offlinePass !== null) {
    return 'offline-pass';
  }
  return null;
}

function verifyReceipt(outer, file, pubPem) {
  const receipt = outer.receipt;
  for (const k of ['data', 'signature', 'signatureAlgorithm']) {
    if (typeof receipt[k] !== 'string') {
      return { file, ok: false, reason: `receipt.${k} missing or not a string` };
    }
  }
  if (receipt.signatureAlgorithm !== 'ECDSA-P256-SHA256') {
    return { file, ok: false, reason: `signatureAlgorithm "${receipt.signatureAlgorithm}" != ECDSA-P256-SHA256` };
  }

  const canonicalBytes = Buffer.from(receipt.data, 'base64');
  if (!ecdsaVerify(pubPem, canonicalBytes, receipt.signature)) {
    return { file, ok: false, reason: 'signature failed to verify against the provided public key' };
  }

  let body;
  try {
    body = JSON.parse(canonicalBytes.toString('utf-8'));
  } catch (e) {
    return { file, ok: false, reason: `decoded receipt.data is not valid JSON: ${e.message}` };
  }
  const recanonical = canonicalize(body);
  if (recanonical !== canonicalBytes.toString('utf-8')) {
    return { file, ok: false, reason: 'receipt.data is not OSPP-canonical' };
  }

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
    mode: 'receipt',
    bodyFields: Object.keys(body),
    canonicalBytes: canonicalBytes.length,
  };
}

function verifyOfflinePass(outer, file, pubPem) {
  const pass = outer.offlinePass;
  for (const k of ['signature', 'signatureAlgorithm']) {
    if (typeof pass[k] !== 'string') {
      return { file, ok: false, reason: `offlinePass.${k} missing or not a string` };
    }
  }
  if (pass.signatureAlgorithm !== 'ECDSA-P256-SHA256') {
    return { file, ok: false, reason: `signatureAlgorithm "${pass.signatureAlgorithm}" != ECDSA-P256-SHA256` };
  }

  // Build the canonical body the way the signer must have built it: pass
  // minus signature + signatureAlgorithm. canonicalize sorts keys so the
  // input field order does not affect the bytes.
  const { signature, signatureAlgorithm, ...body } = pass;
  void signatureAlgorithm;
  const canonicalJson = canonicalize(body);
  const canonicalBytes = Buffer.from(canonicalJson, 'utf-8');

  if (!ecdsaVerify(pubPem, canonicalBytes, signature)) {
    return { file, ok: false, reason: 'offlinePass.signature failed to verify against the provided public key' };
  }

  // Cross-check pass fields against any outer-level fields that mirror them
  // (e.g. authorize-offline-pass.request has top-level offlinePassId, deviceId
  // that mirror pass.passId / pass.deviceId, where present).
  const mirror = {
    passId: 'offlinePassId',
    deviceId: 'deviceId',
  };
  const mismatches = [];
  for (const [passField, outerField] of Object.entries(mirror)) {
    if (passField in body && outerField in outer) {
      const bv = canonicalize({ v: body[passField] });
      const ov = canonicalize({ v: outer[outerField] });
      if (bv !== ov) mismatches.push(`${passField}↔${outerField}: pass=${bv} outer=${ov}`);
    }
  }
  if (mismatches.length > 0) {
    return { file, ok: false, reason: `pass/outer drift on mirrored fields: ${mismatches.join('; ')}` };
  }

  return {
    file,
    ok: true,
    mode: 'offline-pass',
    bodyFields: Object.keys(body),
    canonicalBytes: canonicalBytes.length,
  };
}

function verifyFile(file, pubPem) {
  const outer = JSON.parse(readFileSync(file, 'utf-8'));
  const mode = detectMode(outer);
  if (mode === 'receipt') return verifyReceipt(outer, file, pubPem);
  if (mode === 'offline-pass') return verifyOfflinePass(outer, file, pubPem);
  return { file, ok: false, reason: 'no .receipt or .offlinePass wrapper detected' };
}

function main() {
  const opts = parseArgs(argv);
  const pubPem = readFileSync(opts.key, 'utf-8');

  let failures = 0;
  for (const file of opts.files) {
    const r = verifyFile(file, pubPem);
    if (r.ok) {
      console.log(`  OK  ${r.file}  [mode=${r.mode}, body=${r.bodyFields.length} fields, canonical=${r.canonicalBytes}B]`);
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
