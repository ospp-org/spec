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

import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { canonicalize } from '@ospp/protocol';
import { ecdsaSign, SIGNATURE_ALGORITHM } from '@ospp/protocol/server';

const SESSION_KEY_PATH = 'conformance/test-keys/session-test-key.bin';
const AUTH_RESPONSE_OK_LABEL = 'AuthResponse_OK';

// -----------------------------------------------------------------------------
// Receipt mode (spec §6.2 v0.4.2)
// -----------------------------------------------------------------------------

const RECEIPT_SHARED_FIELDS = [
  'offlineTxId',
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
// Discriminated receipt forms (06-security.md §6.2 receipt_fields, schema oneOf):
//   pass-form (Full Offline / Partial B): + {offlinePassId, passCounter}
//   auth-form (Partial A — ServerSignedAuth, no pass): + {authId, sessionId}
const RECEIPT_PASS_FORM_FIELDS = ['offlinePassId', 'passCounter'];
const RECEIPT_AUTH_FORM_FIELDS = ['authId', 'sessionId'];

function deriveDeviceId(offlineTxId) {
  if (typeof offlineTxId !== 'string' || !offlineTxId.startsWith('otx_')) {
    throw new Error(`cannot derive deviceId without a valid otx_-prefixed offlineTxId (got ${offlineTxId})`);
  }
  return `dev_${offlineTxId.slice(4, 12)}`;
}

function buildReceiptBody(outer, file) {
  // Discriminate: auth-form iff the auth-key pair is present (Partial A, no pass).
  const isAuthForm = ('authId' in outer) || ('sessionId' in outer);
  const formFields = isAuthForm ? RECEIPT_AUTH_FORM_FIELDS : RECEIPT_PASS_FORM_FIELDS;
  const body = {};
  for (const field of [...RECEIPT_SHARED_FIELDS, ...formFields]) {
    if (field === 'deviceId' && !(field in outer)) {
      body.deviceId = deriveDeviceId(outer.offlineTxId);
      continue;
    }
    if (!(field in outer)) {
      throw new Error(`${file}: missing required outer field "${field}" (${isAuthForm ? 'auth' : 'pass'}-form)`);
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
// ServerSignedAuth mode (profiles/offline/ble-handshake.md §4.2.1)
// -----------------------------------------------------------------------------
//
// 10 required claims canonicalised and signed by the server. Claim values for
// this synthetic conformance corpus are derived deterministically from the
// outer envelope's sessionId so the test vectors are reproducible end-to-end
// without external inputs (the production server sources them from the
// `POST /sessions/offline-auth` request + its own state).

const SSA_ISSUED_AT = '2026-02-13T10:00:00.000Z';
const SSA_EXPIRES_AT = '2026-02-13T10:05:00.000Z'; // issuedAt + 5 min — §4.2.1 cap

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function deriveSsaClaims(outer, file) {
  if (typeof outer.sessionId !== 'string' || outer.sessionId.length === 0) {
    throw new Error(`${file}: outer.sessionId is required for ServerSignedAuth claim derivation`);
  }
  const seed = outer.sessionId;
  const h = (label) => sha256Hex(`${label}|${seed}`);

  // 32-byte appNonce, base64 — matches the appNonce the app would write in
  // the upcoming Hello (and supply to POST /sessions/offline-auth).
  const appNonce = Buffer.from(h('appNonce').slice(0, 64), 'hex').toString('base64');

  return {
    authId: `auth_${h('authId').slice(0, 12)}`,
    sub: `sub_${h('sub').slice(0, 16)}`,
    deviceId: `dev_${h('deviceId').slice(0, 16)}`,
    sessionId: outer.sessionId,
    stationId: `stn_${h('stationId').slice(0, 8)}`,
    bayId: `bay_${h('bayId').slice(0, 12)}`,
    serviceId: 'svc_eco',
    durationSeconds: 300,
    creditsAuthorized: 200,
    appNonce,
    issuedAt: SSA_ISSUED_AT,
    expiresAt: SSA_EXPIRES_AT,
  };
}

function signServerSignedAuth(outer, keyPem, file) {
  const claims = deriveSsaClaims(outer, file);
  const canonicalBytes = Buffer.from(canonicalize(claims), 'utf-8');
  const signature = ecdsaSign(keyPem, canonicalBytes);
  outer.signedAuthorization = {
    data: canonicalBytes.toString('base64'),
    signature,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
  };
  return { mode: 'server-signed-auth', bodyFields: Object.keys(claims), signatureLength: signature.length };
}

// -----------------------------------------------------------------------------
// Firmware mode (spec §4.6 — signature is over the firmware BINARY, not over
// any JSON canonical body)
// -----------------------------------------------------------------------------
//
// Per `spec/06-security.md` §4.6 the `signature` field of an UpdateFirmware
// message MUST contain the Base64-encoded ECDSA P-256 signature of the
// firmware image itself. The conformance corpus signs a single committed
// synthetic binary (`conformance/test-firmware/test-firmware.bin`) so the
// vectors are reproducible end-to-end without anyone pulling a real release
// artifact down at verification time.

const FIRMWARE_BIN_PATH = 'conformance/test-firmware/test-firmware.bin';

function signFirmware(outer, keyPem) {
  const binary = readFileSync(FIRMWARE_BIN_PATH);
  const sha256Hex = createHash('sha256').update(binary).digest('hex');

  // ecdsaSign hashes its input internally (SHA-256), so passing the raw
  // binary produces ECDSA-P256-Sign(key, SHA-256(binary)) — the canonical
  // firmware code-signing primitive of §4.6.
  const signature = ecdsaSign(keyPem, binary);
  outer.checksum = `sha256:${sha256Hex}`;
  outer.signature = signature;

  return { mode: 'firmware', bodyFields: ['<test-firmware.bin>'], signatureLength: signature.length };
}

// -----------------------------------------------------------------------------
// HMAC modes (BLE handshake — sessionProof + sessionKeyConfirmation)
// -----------------------------------------------------------------------------
//
// `sessionProof` (ble-handshake.md §4.1):
//   HMAC-SHA256(sessionKey, LP(type) || LP(passId) || LP(decimal(counter)))
//   where LP(x) = U16BE(byteLength(x)) || x  (06-security.md §6.5 Pin 3 / Pin 4)
//   — UTF-8 ASCII concatenation, counter as decimal string.
//
// `sessionKeyConfirmation` (ble-handshake.md §5):
//   HMAC-SHA256(sessionKey, "AuthResponse_OK")
//
// Output is base64-encoded HMAC tag. The conformance corpus uses the
// deterministic session key at `conformance/test-keys/session-test-key.bin`
// (SHA-256 of the literal "OSPP_TEST_SESSION_KEY_V1"), so any verifier with
// the same key can recompute the tag and confirm byte-equality.

function hmacBase64(keyBytes, msg) {
  return createHmac('sha256', keyBytes).update(msg).digest('base64');
}

// Length-prefix a string: U16BE(byteLength) ‖ UTF-8 bytes — same LP as the
// HKDF info / transcript (06-security.md §6.5 Pin 3 / Pin 4).
function lp(s) {
  const b = Buffer.from(s, 'utf-8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
}

function signSessionProof(outer, sessionKey) {
  if (outer.type !== 'OfflineAuthRequest') {
    throw new Error('sessionProof requires outer.type === "OfflineAuthRequest"');
  }
  if (typeof outer?.offlinePass?.passId !== 'string') {
    throw new Error('sessionProof requires outer.offlinePass.passId');
  }
  if (!Number.isInteger(outer.counter)) {
    throw new Error('sessionProof requires outer.counter (integer)');
  }
  // LP(type) || LP(passId) || LP(decimal(counter)) — length-prefixed, injective
  // (ble-handshake.md §4.1; 06-security.md §6.5.1).
  const msg = Buffer.concat([lp(outer.type), lp(outer.offlinePass.passId), lp(String(outer.counter))]);
  outer.sessionProof = hmacBase64(sessionKey, msg);
  return { mode: 'session-proof', bodyFields: ['type', 'passId', 'counter'], signatureLength: outer.sessionProof.length };
}

function signSessionKeyConfirmation(outer, sessionKey) {
  if (outer.type !== 'AuthResponse') {
    throw new Error('sessionKeyConfirmation requires outer.type === "AuthResponse"');
  }
  if (outer.result !== 'Accepted') {
    // Per ble-handshake.md §5, sessionKeyConfirmation is conditional —
    // "Present when result is Accepted." Skip silently on Rejected vectors
    // and strip any leftover placeholder so the file stays spec-coherent.
    if ('sessionKeyConfirmation' in outer) delete outer.sessionKeyConfirmation;
    return {
      mode: 'session-key-confirmation',
      bodyFields: ['(skipped — result != Accepted, sessionKeyConfirmation stripped)'],
      signatureLength: 0,
    };
  }
  const msg = Buffer.from(AUTH_RESPONSE_OK_LABEL, 'utf-8');
  outer.sessionKeyConfirmation = hmacBase64(sessionKey, msg);
  return { mode: 'session-key-confirmation', bodyFields: ['"AuthResponse_OK" literal'], signatureLength: outer.sessionKeyConfirmation.length };
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

function detectMode(outer, file) {
  if (outer && typeof outer === 'object' && typeof outer.receipt === 'object' && outer.receipt !== null) {
    return 'receipt';
  }
  if (outer && typeof outer === 'object' && typeof outer.offlinePass === 'object' && outer.offlinePass !== null) {
    // OfflinePass-bearing — may also carry a sessionProof HMAC. Mode dispatch
    // happens at the operation level (--mode flag), so the bare detect returns
    // the ECDSA mode here. Callers needing the HMAC step pass --mode session-proof.
    return 'offline-pass';
  }
  if (outer && typeof outer === 'object' && outer.type === 'ServerSignedAuth') {
    return 'server-signed-auth';
  }
  if (outer && typeof outer === 'object' && outer.type === 'AuthResponse') {
    return 'session-key-confirmation';
  }
  if (outer && typeof outer === 'object' && typeof outer.firmwareUrl === 'string') {
    return 'firmware';
  }
  throw new Error(`${file}: cannot detect signing mode`);
}

function parseArgs(args) {
  const opts = { key: null, mode: null, files: [] };
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--key') opts.key = args[++i];
    else if (a === '--mode') opts.mode = args[++i];
    else if (a === '--in') opts.files.push(args[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: sign-example.mjs --key <key.pem|key.bin> [--mode <mode>] [--in <file>] <file...>');
      console.log('  modes (auto-detected; override with --mode):');
      console.log('    receipt, offline-pass, server-signed-auth, firmware, session-proof, session-key-confirmation');
      exit(0);
    } else opts.files.push(a);
  }
  if (!opts.key) {
    console.error('error: --key <key.pem|key.bin> is required');
    exit(2);
  }
  if (opts.files.length === 0) {
    console.error('error: at least one input file is required');
    exit(2);
  }
  return opts;
}

function signFile(file, key, modeOverride) {
  const raw = readFileSync(file, 'utf-8');
  const outer = JSON.parse(raw);
  const mode = modeOverride ?? detectMode(outer, file);

  let result;
  if (mode === 'receipt') result = signReceipt(outer, key);
  else if (mode === 'offline-pass') result = signOfflinePass(outer, key);
  else if (mode === 'server-signed-auth') result = signServerSignedAuth(outer, key, file);
  else if (mode === 'firmware') result = signFirmware(outer, key);
  else if (mode === 'session-proof') result = signSessionProof(outer, key);
  else if (mode === 'session-key-confirmation') result = signSessionKeyConfirmation(outer, key);
  else throw new Error(`${file}: unsupported mode ${mode}`);

  const trailing = raw.endsWith('\n') ? '\n' : '';
  writeFileSync(file, JSON.stringify(outer, null, 2) + trailing);
  return { file, ...result };
}

function loadKey(path) {
  // HMAC modes use a raw 32-byte session key (.bin); ECDSA modes use a PEM string.
  return path.endsWith('.bin') ? readFileSync(path) : readFileSync(path, 'utf-8');
}

function main() {
  const opts = parseArgs(argv);
  const key = loadKey(opts.key);

  for (const file of opts.files) {
    const r = signFile(file, key, opts.mode);
    console.log(`  signed ${r.file}  [mode=${r.mode}]`);
    console.log(`    body fields (${r.bodyFields.length}): ${r.bodyFields.join(', ')}`);
    console.log(`    signature base64 length: ${r.signatureLength}`);
  }
}

main();
