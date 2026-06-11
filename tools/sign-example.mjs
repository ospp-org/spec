#!/usr/bin/env node
// =============================================================================
// sign-example.mjs — produce REAL ECDSA-P256 signatures for OSPP examples
// =============================================================================
//
// Auto-detects the wrapper shape and signs the appropriate canonical body
// with the supplied PEM private key. Idempotent (RFC 6979 deterministic),
// re-runs are reviewable as no-ops in `git diff`.
//
// Modes:
//
//   1. RECEIPT  — input has a `receipt = {data, signature, signatureAlgorithm}`
//      wrapper. The signed body is the outer wrapper's 11 receipt fields
//      (spec §6.2 v0.4.2) plus `meterValues` when present (omitted from the
//      canonical body when absent per Note 4). MQTT TransactionEvent envelopes
//      omit `deviceId` outer; we synthesise it from `offlineTxId` so the inner
//      signed body is well-formed.  → typically signed with `station-test-key`.
//
//   2. OFFLINE_PASS — input has an `offlinePass` object containing the 11
//      required pass fields per `schemas/common/offline-pass.schema.json` plus
//      `signature` + `signatureAlgorithm`. The signed body is the pass object
//      with those two output fields stripped, canonicalised per spec §4.8.
//      The output `signature` lives at `offlinePass.signature`.
//        → signed with `server-test-key` (the SERVER produces OfflinePasses).
//
// Output for both modes:
//   {
//     data fields ...,    // wrapper-specific
//     signature:          base64(DER ECDSA-P256-SHA256),
//     signatureAlgorithm: "ECDSA-P256-SHA256",
//   }
//
// Usage:
//   node tools/sign-example.mjs --key <key.pem> <file...>
//   node tools/sign-example.mjs --key <key.pem> --in <file>
//
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { canonicalize } from '@ospp/protocol';
import { ecdsaSign, SIGNATURE_ALGORITHM } from '@ospp/protocol/server';

// -----------------------------------------------------------------------------
// Receipt mode (spec §6.2 v0.4.2)
// -----------------------------------------------------------------------------

const RECEIPT_REQUIRED_FIELDS = [
  'offlineTxId',
  'offlinePassId',
  'userId',
  'deviceId',
  'bayId',
  'serviceId',
  'startedAt',
  'endedAt',
  'durationSeconds',
  'creditsCharged',
  'txCounter',
];

function deriveDeviceId(offlineTxId) {
  if (typeof offlineTxId !== 'string' || !offlineTxId.startsWith('otx_')) {
    throw new Error(`cannot derive deviceId without a valid otx_-prefixed offlineTxId (got ${offlineTxId})`);
  }
  return `dev_${offlineTxId.slice(4, 12)}`;
}

function buildReceiptBody(outer, file) {
  const body = {};
  for (const field of RECEIPT_REQUIRED_FIELDS) {
    if (field === 'deviceId' && !(field in outer)) {
      body.deviceId = deriveDeviceId(outer.offlineTxId);
      continue;
    }
    if (!(field in outer)) {
      throw new Error(`${file}: missing required outer field "${field}"`);
    }
    body[field] = outer[field];
  }
  // §6.2 Note 4: meterValues signed when present, OMITTED when absent.
  if (outer.meterValues !== undefined && outer.meterValues !== null) {
    body.meterValues = outer.meterValues;
  }
  return body;
}

function signReceipt(outer, keyPem) {
  const body = buildReceiptBody(outer, '<inline>');
  const canonicalBytes = Buffer.from(canonicalize(body), 'utf-8');
  const signature = ecdsaSign(keyPem, canonicalBytes);
  outer.receipt = {
    data: canonicalBytes.toString('base64'),
    signature,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
  };
  return { mode: 'receipt', bodyFields: Object.keys(body), signatureLength: signature.length };
}

// -----------------------------------------------------------------------------
// OfflinePass mode (schemas/common/offline-pass.schema.json + spec §6.1)
// -----------------------------------------------------------------------------

const OFFLINE_PASS_REQUIRED_FIELDS = [
  'passId',
  'sub',
  'deviceId',
  'issuedAt',
  'expiresAt',
  'policyVersion',
  'revocationEpoch',
  'offlineAllowance',
  'constraints',
];

function buildOfflinePassBody(pass, file) {
  const body = {};
  for (const field of OFFLINE_PASS_REQUIRED_FIELDS) {
    if (!(field in pass)) {
      throw new Error(`${file}: missing required offlinePass field "${field}"`);
    }
    body[field] = pass[field];
  }
  // The signature + signatureAlgorithm are the OUTPUT — must NOT be part of
  // the canonical input (spec §6.1, mirrors §6.2 Note 2 for receipts).
  return body;
}

function signOfflinePass(outer, keyPem) {
  const pass = outer.offlinePass;
  const body = buildOfflinePassBody(pass, '<inline>');
  const canonicalBytes = Buffer.from(canonicalize(body), 'utf-8');
  const signature = ecdsaSign(keyPem, canonicalBytes);
  // Rebuild the pass object in canonical-required-field order, then trail with
  // signatureAlgorithm + signature (the conventional human-visible order in
  // the existing examples and conformance fixtures).
  const signedPass = {};
  for (const field of OFFLINE_PASS_REQUIRED_FIELDS) signedPass[field] = body[field];
  signedPass.signatureAlgorithm = SIGNATURE_ALGORITHM;
  signedPass.signature = signature;
  outer.offlinePass = signedPass;
  return { mode: 'offline-pass', bodyFields: Object.keys(body), signatureLength: signature.length };
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

function detectMode(outer, file) {
  if (outer && typeof outer === 'object' && typeof outer.receipt === 'object' && outer.receipt !== null) {
    return 'receipt';
  }
  if (outer && typeof outer === 'object' && typeof outer.offlinePass === 'object' && outer.offlinePass !== null) {
    return 'offline-pass';
  }
  throw new Error(`${file}: cannot detect signing mode (no .receipt or .offlinePass wrapper found)`);
}

function parseArgs(args) {
  const opts = { key: null, files: [] };
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--key') opts.key = args[++i];
    else if (a === '--in') opts.files.push(args[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: sign-example.mjs --key <key.pem> [--in <file>] <file...>');
      exit(0);
    } else opts.files.push(a);
  }
  if (!opts.key) {
    console.error('error: --key <key.pem> is required');
    exit(2);
  }
  if (opts.files.length === 0) {
    console.error('error: at least one input file is required');
    exit(2);
  }
  return opts;
}

function signFile(file, keyPem) {
  const raw = readFileSync(file, 'utf-8');
  const outer = JSON.parse(raw);
  const mode = detectMode(outer, file);

  let result;
  if (mode === 'receipt') result = signReceipt(outer, keyPem);
  else if (mode === 'offline-pass') result = signOfflinePass(outer, keyPem);
  else throw new Error(`${file}: unsupported mode ${mode}`);

  const trailing = raw.endsWith('\n') ? '\n' : '';
  writeFileSync(file, JSON.stringify(outer, null, 2) + trailing);
  return { file, ...result };
}

function main() {
  const opts = parseArgs(argv);
  const keyPem = readFileSync(opts.key, 'utf-8');

  for (const file of opts.files) {
    const r = signFile(file, keyPem);
    console.log(`  signed ${r.file}  [mode=${r.mode}]`);
    console.log(`    body fields (${r.bodyFields.length}): ${r.bodyFields.join(', ')}`);
    console.log(`    signature base64 length: ${r.signatureLength}`);
  }
}

main();
