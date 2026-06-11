#!/usr/bin/env node
// =============================================================================
// sign-example.mjs — produce REAL station-signed receipts for OSPP examples
// =============================================================================
//
// For each input JSON file containing a `receipt` wrapper (`{data, signature,
// signatureAlgorithm}`), this tool:
//
//   1. Builds the canonical signed body from the outer wrapper fields,
//      following spec/06-security.md §6.2 v0.4.2 (11 required fields plus
//      meterValues when present; meterValues OMITTED from canonical body when
//      absent per Note 4).
//   2. Canonicalises via `@ospp/protocol` (OSPP Canonical Form, §4.8).
//   3. ECDSA-P256-SHA256 signs the canonical bytes with RFC 6979 deterministic
//      nonce (via `@ospp/protocol/server` ecdsaSign — same path the SDK and
//      production CSMS take, so signatures are byte-reproducible cross-language
//      and across runs).
//   4. Writes the result back into the file's `.receipt` wrapper:
//        receipt.data               = base64(canonical bytes)
//        receipt.signature          = base64(DER ECDSA-P256-SHA256)
//        receipt.signatureAlgorithm = "ECDSA-P256-SHA256"
//
// The tool is idempotent: running it twice over the same file with the same
// key produces byte-identical output (RFC 6979). Re-runs are reviewable as
// no-ops in `git diff`.
//
// Schema asymmetry handled (MQTT TransactionEvent):
//   The MQTT TransactionEvent envelope (`transaction-event-request.schema.json`)
//   has 11 outer fields and does NOT include `deviceId` — the server reads it
//   from the signed body and from the pass record (spec/06-security.md §6.2
//   Note 5). The BLE receipt envelope (`ble/receipt.schema.json`) DOES include
//   `deviceId` outer for human inspection. Both share the SAME signed body
//   shape. When the outer wrapper lacks `deviceId`, this tool derives a stable
//   illustrative value from `offlineTxId` so the inner body is well-formed.
//
// Usage:
//   node tools/sign-example.mjs --in <file.json> --key <key.pem>
//   node tools/sign-example.mjs --key <key.pem> <file1.json> <file2.json> ...
//
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { canonicalize } from '@ospp/protocol';
import { ecdsaSign, SIGNATURE_ALGORITHM } from '@ospp/protocol/server';

const REQUIRED_FIELDS = [
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

function deriveDeviceId(offlineTxId) {
  if (typeof offlineTxId !== 'string' || !offlineTxId.startsWith('otx_')) {
    throw new Error(`cannot derive deviceId without a valid otx_-prefixed offlineTxId (got ${offlineTxId})`);
  }
  return `dev_${offlineTxId.slice(4, 12)}`;
}

function buildSignedBody(outer, file) {
  if (typeof outer !== 'object' || outer === null) {
    throw new Error(`${file}: top-level value is not an object`);
  }
  if (typeof outer.receipt !== 'object' || outer.receipt === null) {
    throw new Error(`${file}: missing .receipt wrapper`);
  }
  const body = {};
  for (const field of REQUIRED_FIELDS) {
    if (field === 'deviceId' && !(field in outer)) {
      body.deviceId = deriveDeviceId(outer.offlineTxId);
      continue;
    }
    if (!(field in outer)) {
      throw new Error(`${file}: missing required outer field "${field}"`);
    }
    body[field] = outer[field];
  }
  // §6.2 Note 4: meterValues is signed when present, OMITTED from canonical
  // body when absent. MUST NOT serialise empty `{}` or `null` — that would
  // change canonical bytes and break server verification.
  if (outer.meterValues !== undefined && outer.meterValues !== null) {
    body.meterValues = outer.meterValues;
  }
  return body;
}

function signFile(file, keyPem) {
  const raw = readFileSync(file, 'utf-8');
  const outer = JSON.parse(raw);

  const body = buildSignedBody(outer, file);
  const canonicalJson = canonicalize(body);
  const canonicalBytes = Buffer.from(canonicalJson, 'utf-8');

  const signature = ecdsaSign(keyPem, canonicalBytes);

  outer.receipt = {
    data: canonicalBytes.toString('base64'),
    signature,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
  };

  // Preserve the input file's trailing newline convention (most repos use one).
  const trailing = raw.endsWith('\n') ? '\n' : '';
  writeFileSync(file, JSON.stringify(outer, null, 2) + trailing);

  return { file, bodyFields: Object.keys(body), signatureLength: signature.length };
}

function main() {
  const opts = parseArgs(argv);
  const keyPem = readFileSync(opts.key, 'utf-8');

  for (const file of opts.files) {
    const r = signFile(file, keyPem);
    console.log(`  signed ${r.file}`);
    console.log(`    body fields (${r.bodyFields.length}): ${r.bodyFields.join(', ')}`);
    console.log(`    signature base64 length: ${r.signatureLength}`);
  }
}

main();
