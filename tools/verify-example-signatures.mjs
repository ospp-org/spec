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
//   3. STATION_SIGNATURE  (a BLE Challenge; 06-security.md §6.5.2)
//      - --key is the Station CA certificate the app trusts; the CRL is --crl
//        (default: the trust bundle's), the time --at (default: the worked
//        sessions' 2026-02-13T10:00:00.000Z, never the clock of the machine)
//      - The Hello it answers is --hello, or the file beside it whose name has
//        `hello` in place of `challenge`; its wire bytes are its compact JSON
//      - Runs the app's verification gate, steps 1-6, and requires low-s
//
//   4. DEVICE_PROOF  (--mode device-proof; 06-security.md §6.5.4)
//      - --key is the server key that signed the pass (the pass anchors devicePublicKey)
//      - An OfflineAuthRequest takes its transcript from --hello/--challenge, or
//        the files beside it named `hello`/`challenge` in place of
//        `offline-auth-request`, and the stationId from that Challenge's
//        certificate, which must pass the gate
//      - An AuthorizeOfflinePass REQUEST carries its transcriptHash; the stationId
//        is the subject CN of --station-cert (default: the test station's mTLS
//        certificate), the identity of the station that forwarded it
//
//   Also: SERVER_SIGNED_AUTH, FIRMWARE, SESSION_PROOF, SESSION_KEY_CONFIRMATION,
//   and a ReceiptResponse, whose receipt is verified as in mode 1.
//
// Usage:
//   node tools/verify-example-signatures.mjs --key <pub.pem> [--mode <mode>]
//        [--hello <file>] [--challenge <file>] [--crl <file>] [--ca <file>]
//        [--station-cert <file>] [--at <ISO time>] [--intended-station-id <id>] <file...>
//
// =============================================================================

import { createHash, createHmac, createPublicKey, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { canonicalForm } from './canonical-form.mjs';
import { ecdsaVerify } from '@ospp/protocol/server';
import {
  wireBytes, validatePublicKey, isLowS, transcriptHashOf, stationVerificationGate,
  parseCertificate, pemToDer, deviceProofInput, deviceProofFormats, verifyDeviceProof,
} from './ble-crypto.mjs';

// Compressed SEC1 P-256 public key on the BLE wire: 33 bytes → 44 Base64 chars,
// no padding (06-security.md §6.5 Pin 2).
const EC_PUBKEY_RE = /^[A-Za-z0-9+/]{44}$/;

// The BLE trust material and the instant every station certificate is judged at:
// the worked sessions' time, fixed, so no fixture expires with the calendar.
const DEFAULT_CRL = 'conformance/test-keys/station-ca-test-crl.pem';
const DEFAULT_CA = 'conformance/test-keys/station-ca-test-cert.pem';
const DEFAULT_STATION_CERT = 'conformance/test-keys/station-mtls-test-cert.pem';
const DEFAULT_AT = '2026-02-13T10:00:00.000Z';
const DEVICE_PROOF_SCHEMA = new URL('../schemas/common/device-proof.schema.json', import.meta.url);

const FIRMWARE_BIN_PATH = 'conformance/test-firmware/test-firmware.bin';
const SESSION_KEY_PATH = 'conformance/test-keys/session-test-key.bin';
const AUTH_RESPONSE_OK_LABEL = 'AuthResponse_OK';

function parseArgs(args) {
  const opts = { key: null, mode: null, files: [], hello: null, challenge: null, crl: null, ca: null, stationMtlsCert: null, at: null, intendedStationId: null };
  const flags = { '--key': 'key', '--mode': 'mode', '--hello': 'hello', '--challenge': 'challenge', '--crl': 'crl', '--ca': 'ca', '--station-cert': 'stationMtlsCert', '--at': 'at', '--intended-station-id': 'intendedStationId' };
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a in flags) opts[flags[a]] = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: verify-example-signatures.mjs --key <pub.pem|ca.pem|key.bin> [--mode <mode>] [--hello <file>] [--challenge <file>] [--crl <file>] [--ca <file>] [--station-cert <file>] [--at <ISO>] [--intended-station-id <id>] <file...>');
      exit(0);
    } else opts.files.push(a);
  }
  if (!opts.key) {
    console.error('error: --key is required');
    exit(2);
  }
  if (opts.files.length === 0) {
    console.error('error: at least one input file is required');
    exit(2);
  }
  return opts;
}

// Decoded receipt bodies are validated against receipt-data.schema.json with the ajv the
// repository already installs for verify-protocol.sh. Built once, on first use.
const require = createRequire(import.meta.url);
let receiptDataValidator = null;
let receiptDataAjv = null;
function receiptDataErrors(body) {
  if (!receiptDataValidator) {
    const Ajv2020 = require('ajv/dist/2020').default;
    const addFormatsModule = require('ajv-formats');
    const addFormats = addFormatsModule.default ?? addFormatsModule;
    receiptDataAjv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(receiptDataAjv);
    const dir = new URL('../schemas/common/', import.meta.url);
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.schema.json')) receiptDataAjv.addSchema(JSON.parse(readFileSync(new URL(f, dir), 'utf-8')));
    }
    receiptDataValidator = receiptDataAjv.getSchema('https://ospp-standard.org/schemas/v1/common/receipt-data.schema.json');
  }
  return receiptDataValidator(body) ? null : receiptDataAjv.errorsText(receiptDataValidator.errors);
}

// Decoded ServerSignedAuth claims are held to server-signed-auth-claims.schema.json the same way,
// on the same ajv instance: a fixture's claims must agree with the specification, not merely verify.
function ssaClaimsErrors(claims) {
  receiptDataErrors({});
  const v = receiptDataAjv.getSchema('https://ospp-standard.org/schemas/v1/common/server-signed-auth-claims.schema.json');
  return v(claims) ? null : receiptDataAjv.errorsText(v.errors);
}

function hmacBase64(keyBytes, msg) {
  return createHmac('sha256', keyBytes).update(msg).digest('base64');
}

// Length-prefix a string: U16BE(byteLength) ‖ UTF-8 bytes — the same LP used
// for the HKDF info and transcript (06-security.md §6.5 Pin 3 / Pin 4).
function lp(s) {
  const b = Buffer.from(s, 'utf-8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
}

function verifySessionProof(outer, file, sessionKey) {
  if (typeof outer.sessionProof !== 'string') {
    return { file, ok: false, reason: 'sessionProof missing or not a string' };
  }
  if (outer.type !== 'OfflineAuthRequest') {
    return { file, ok: false, reason: 'sessionProof verify requires type === OfflineAuthRequest' };
  }
  if (typeof outer?.offlinePass?.passId !== 'string') {
    return { file, ok: false, reason: 'sessionProof verify requires offlinePass.passId' };
  }
  if (!Number.isInteger(outer.counter)) {
    return { file, ok: false, reason: 'sessionProof verify requires integer counter' };
  }
  // LP(type) ‖ LP(passId) ‖ LP(decimal(counter)) — length-prefixed, injective
  // (ble-handshake.md §4.1; 06-security.md §6.5.1).
  const msg = Buffer.concat([lp(outer.type), lp(outer.offlinePass.passId), lp(String(outer.counter))]);
  const expected = hmacBase64(sessionKey, msg);
  const a = Buffer.from(outer.sessionProof, 'base64');
  const b = Buffer.from(expected, 'base64');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { file, ok: false, reason: `sessionProof mismatch — got ${outer.sessionProof}, expected ${expected}` };
  }
  return { file, ok: true, mode: 'session-proof', bodyFields: ['type', 'passId', 'counter'], canonicalBytes: msg.length };
}

function verifySessionKeyConfirmation(outer, file, sessionKey) {
  if (outer.type !== 'AuthResponse') {
    return { file, ok: false, reason: 'sessionKeyConfirmation verify requires type === AuthResponse' };
  }
  if (outer.result !== 'Accepted') {
    // §5: present only when Accepted. If absent on a Rejected vector, that's
    // spec-compliant — verify is a no-op success.
    if (!('sessionKeyConfirmation' in outer)) {
      return {
        file,
        ok: true,
        mode: 'session-key-confirmation',
        bodyFields: ['(skipped — result=Rejected, no HMAC expected)'],
        canonicalBytes: 0,
      };
    }
    return { file, ok: false, reason: 'sessionKeyConfirmation present but result=Rejected (§5 forbids)' };
  }
  if (typeof outer.sessionKeyConfirmation !== 'string') {
    return { file, ok: false, reason: 'sessionKeyConfirmation missing or not a string' };
  }
  const msg = Buffer.from(AUTH_RESPONSE_OK_LABEL, 'utf-8');
  const expected = hmacBase64(sessionKey, msg);
  const a = Buffer.from(outer.sessionKeyConfirmation, 'base64');
  const b = Buffer.from(expected, 'base64');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { file, ok: false, reason: `sessionKeyConfirmation mismatch — got ${outer.sessionKeyConfirmation}, expected ${expected}` };
  }
  return { file, ok: true, mode: 'session-key-confirmation', bodyFields: ['"AuthResponse_OK" literal'], canonicalBytes: msg.length };
}

function detectMode(outer) {
  // A ReceiptResponse carries the receipt object the app stores and uploads; its
  // signed wrapper is one level further in.
  if (outer && typeof outer === 'object' && outer.type === 'ReceiptResponse') {
    return 'receipt-response';
  }
  if (outer && typeof outer === 'object' && typeof outer.receipt === 'object' && outer.receipt !== null) {
    return 'receipt';
  }
  if (outer && typeof outer === 'object' && typeof outer.offlinePass === 'object' && outer.offlinePass !== null) {
    // OfflinePass-bearing files may ALSO carry a sessionProof HMAC (Tranșa 4).
    // Auto-detect returns the ECDSA mode; callers needing the HMAC step pass
    // --mode session-proof explicitly.
    return 'offline-pass';
  }
  if (outer && typeof outer === 'object' && outer.type === 'ServerSignedAuth') {
    return 'server-signed-auth';
  }
  if (outer && typeof outer === 'object' && outer.type === 'AuthResponse') {
    return 'session-key-confirmation';
  }
  // The station's signature over the handshake, carried in the Challenge (FFF4)
  // with the station's certificate (06-security.md §6.5.2).
  if (outer && typeof outer === 'object' && outer.type === 'Challenge') {
    return 'station-signature';
  }
  if (outer && typeof outer === 'object' && typeof outer.firmwareUrl === 'string') {
    return 'firmware';
  }
  return null;
}

// The file a fixture pairs with: the same directory, `from` replaced by `to` in its name.
function sibling(file, from, to) {
  const base = path.basename(file);
  if (!base.includes(from)) return null;
  const candidate = path.join(path.dirname(file), base.replace(from, to));
  return existsSync(candidate) ? candidate : null;
}

function verifyStationSignature(outer, file, caPem, opts) {
  const helloFile = opts.hello ?? sibling(file, 'challenge', 'hello');
  if (!helloFile) {
    return { file, ok: false, reason: 'no Hello to verify the Challenge against: pass --hello <file> or keep a hello-* file beside it' };
  }
  const hello = JSON.parse(readFileSync(helloFile, 'utf-8'));
  for (const [name, b64] of [['Hello.appEphemeralPubKey', hello.appEphemeralPubKey], ['Challenge.stationEphemeralPubKey', outer.stationEphemeralPubKey]]) {
    if (!EC_PUBKEY_RE.test(b64 ?? '')) return { file, ok: false, reason: `${name} is not a 44-char compressed-SEC1 Base64 key (§6.5 Pin 2)` };
    try { validatePublicKey(b64); } catch (e) { return { file, ok: false, reason: `${name} is not a valid P-256 point: ${e.message}` }; }
  }
  const gate = stationVerificationGate({
    challenge: outer,
    helloBytes: wireBytes(hello),
    caCertPem: caPem,
    crlPem: readFileSync(opts.crl ?? DEFAULT_CRL, 'utf-8'),
    at: opts.at ?? DEFAULT_AT,
    intendedStationId: opts.intendedStationId ?? null,
  });
  if (!gate.ok) {
    return { file, ok: false, reason: `the app's verification gate refuses it at step ${gate.step}: ${gate.reason}` };
  }
  if (!isLowS(outer.stationSignature)) {
    return { file, ok: false, reason: 'stationSignature is not low-s (06-security.md §6.2 Note 6)' };
  }
  return { file, ok: true, mode: 'station-signature', bodyFields: [`stationId=${gate.stationId}`, `hello=${path.basename(helloFile)}`], canonicalBytes: gate.signedContent.length };
}

function verifyDeviceProofFile(outer, file, serverPubPem, opts) {
  // The pass anchors devicePublicKey: it must verify first.
  const passResult = verifyOfflinePass(outer, file, serverPubPem);
  if (!passResult.ok) return passResult;
  const formats = deviceProofFormats(JSON.parse(readFileSync(DEVICE_PROOF_SCHEMA, 'utf-8')));
  let transcriptHash;
  let stationId;
  if (outer.type === 'OfflineAuthRequest') {
    const helloFile = opts.hello ?? sibling(file, 'offline-auth-request', 'hello');
    const challengeFile = opts.challenge ?? sibling(file, 'offline-auth-request', 'challenge');
    if (!helloFile || !challengeFile) {
      return { file, ok: false, reason: 'no handshake to verify the device proof over: pass --hello and --challenge, or keep hello-*/challenge-* files beside it' };
    }
    const hello = JSON.parse(readFileSync(helloFile, 'utf-8'));
    const challenge = JSON.parse(readFileSync(challengeFile, 'utf-8'));
    const gate = stationVerificationGate({
      challenge, helloBytes: wireBytes(hello),
      caCertPem: readFileSync(opts.ca ?? DEFAULT_CA, 'utf-8'),
      crlPem: readFileSync(opts.crl ?? DEFAULT_CRL, 'utf-8'),
      at: opts.at ?? DEFAULT_AT,
    });
    if (!gate.ok) return { file, ok: false, reason: `the handshake's Challenge fails the gate at step ${gate.step}: ${gate.reason}` };
    transcriptHash = transcriptHashOf(wireBytes(hello), wireBytes(challenge));
    stationId = gate.stationId;
  } else if (typeof outer.transcriptHash === 'string') {
    transcriptHash = Buffer.from(outer.transcriptHash, 'base64');
    if (transcriptHash.length !== 32) return { file, ok: false, reason: 'transcriptHash is not 32 bytes' };
    stationId = parseCertificate(pemToDer(readFileSync(opts.stationMtlsCert ?? DEFAULT_STATION_CERT, 'utf-8'))).subjectCN;
  } else {
    return { file, ok: false, reason: 'device-proof mode needs an OfflineAuthRequest or an AuthorizeOfflinePass REQUEST carrying transcriptHash' };
  }
  const proofInput = deviceProofInput({
    transcriptHash, stationId, passId: outer.offlinePass.passId, counter: outer.counter,
    bayId: outer.bayId, serviceId: outer.serviceId, requestedDurationSeconds: outer.requestedDurationSeconds,
  });
  const r = verifyDeviceProof({ deviceProof: outer.deviceProof, devicePublicKey: outer.offlinePass.devicePublicKey, proofInput, formats });
  if (!r.ok) return { file, ok: false, reason: `deviceProof: ${r.reason}` };
  if (!isLowS(outer.deviceProof.signature)) return { file, ok: false, reason: 'deviceProof.signature is not low-s' };
  return { file, ok: true, mode: 'device-proof', bodyFields: [`format=${outer.deviceProof.format}`, `stationId=${stationId}`], canonicalBytes: proofInput.length };
}

function verifyReceiptResponse(outer, file, pubPem) {
  if (outer.result !== 'Accepted') {
    if ('receipt' in outer) return { file, ok: false, reason: 'a Rejected ReceiptResponse carries no receipt' };
    return { file, ok: true, mode: 'receipt-response', bodyFields: ['(no receipt — result=Rejected)'], canonicalBytes: 0 };
  }
  if (!outer.receipt || typeof outer.receipt !== 'object') return { file, ok: false, reason: 'ReceiptResponse Accepted without a receipt' };
  const r = verifyReceipt(outer.receipt, file, pubPem);
  return r.ok ? { ...r, mode: 'receipt-response' } : r;
}

function verifyFirmware(outer, file, pubPem) {
  if (typeof outer.checksum !== 'string' || !outer.checksum.startsWith('sha256:')) {
    return { file, ok: false, reason: 'checksum missing or not in "sha256:<hex>" form' };
  }
  if (typeof outer.signature !== 'string') {
    return { file, ok: false, reason: 'signature missing' };
  }

  const binary = readFileSync(FIRMWARE_BIN_PATH);
  const expectedDigestHex = createHash('sha256').update(binary).digest('hex');
  const expectedChecksum = `sha256:${expectedDigestHex}`;
  if (outer.checksum !== expectedChecksum) {
    return {
      file,
      ok: false,
      reason: `checksum mismatch: file says ${outer.checksum}, binary digests to ${expectedChecksum}`,
    };
  }

  // ecdsaVerify hashes its input internally; passing the raw binary verifies
  // ECDSA-P256-Verify(pub, SHA-256(binary), sig) — the canonical firmware
  // verification primitive of §4.6.
  if (!ecdsaVerify(pubPem, binary, outer.signature)) {
    return { file, ok: false, reason: 'signature failed to verify against the firmware binary' };
  }

  return {
    file,
    ok: true,
    mode: 'firmware',
    bodyFields: ['<test-firmware.bin>'],
    canonicalBytes: binary.length,
  };
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
  const recanonical = canonicalForm(body);
  if (recanonical !== canonicalBytes.toString('utf-8')) {
    return { file, ok: false, reason: 'receipt.data is not OSPP-canonical' };
  }

  // The signed body is itself a schema instance, and no other gate decodes it: the vector
  // validators see only the Base64 string. Validate it against receipt-data.schema.json here,
  // which is what proves every signed receipt carries the fields settlement reads
  // (06-security.md §6.2) and nothing the closed body forbids.
  const bodyErrors = receiptDataErrors(body);
  if (bodyErrors) {
    return { file, ok: false, reason: `decoded receipt.data fails receipt-data.schema.json: ${bodyErrors}` };
  }

  const mismatches = [];
  for (const k of Object.keys(body)) {
    if (k in outer) {
      const bv = canonicalForm({ v: body[k] });
      const ov = canonicalForm({ v: outer[k] });
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
  // minus signature + signatureAlgorithm. canonicalForm sorts keys so the
  // input field order does not affect the bytes.
  const { signature, signatureAlgorithm, ...body } = pass;
  void signatureAlgorithm;
  const canonicalJson = canonicalForm(body);
  const canonicalBytes = Buffer.from(canonicalJson, 'utf-8');

  if (!ecdsaVerify(pubPem, canonicalBytes, signature)) {
    return { file, ok: false, reason: 'offlinePass.signature failed to verify against the provided public key' };
  }

  // Profile constraint (beyond JSON-schema validity): a "valid" OfflinePass
  // vector MUST also satisfy the offline-pass profile. Maximum validity is
  // the maximum platform pass lifetime, 864000 s — ten days — from issuedAt
  // (offline-pass.md §6). Schema-validity is necessary but not
  // sufficient — this guards a vector marked "valid" from silently shipping a
  // profile violation. Other profile invariants can be added here.
  if (typeof body.issuedAt === 'string' && typeof body.expiresAt === 'string') {
    const issuedMs = Date.parse(body.issuedAt);
    const expiresMs = Date.parse(body.expiresAt);
    if (Number.isFinite(issuedMs) && Number.isFinite(expiresMs)) {
      const MAX_VALIDITY_MS = 864000 * 1000;
      if (expiresMs - issuedMs > MAX_VALIDITY_MS) {
        const hours = ((expiresMs - issuedMs) / 3_600_000).toFixed(1);
        return { file, ok: false, reason: `offlinePass validity ${hours}h exceeds the 240h (10-day) maximum lifetime (offline-pass.md §6)` };
      }
    }
  }

  // The pass names the key that signed it (offline-pass.md §3). The name must be the
  // keyId of the key it verified under — the 06-security.md §4.3 construction over that
  // key's DER SubjectPublicKeyInfo — or a station selecting by keyId would pick nothing.
  const expectedKeyId = createHash('sha256')
    .update(createPublicKey(pubPem).export({ type: 'spki', format: 'der' }))
    .digest().subarray(0, 16).toString('base64url');
  if (body.keyId !== expectedKeyId) {
    return { file, ok: false, reason: `offlinePass.keyId ${body.keyId} is not the keyId of the verifying key (${expectedKeyId})` };
  }

  // Cross-check pass fields against any outer-level fields that mirror them
  // (authorize-offline-pass.request's top-level offlinePassId mirrors pass.passId;
  // a deviceId beside the pass is checked the same way where one is present).
  const mirror = {
    passId: 'offlinePassId',
    deviceId: 'deviceId',
  };
  const mismatches = [];
  for (const [passField, outerField] of Object.entries(mirror)) {
    if (passField in body && outerField in outer) {
      const bv = canonicalForm({ v: body[passField] });
      const ov = canonicalForm({ v: outer[outerField] });
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

function verifyServerSignedAuth(outer, file, pubPem) {
  const wrapper = outer.signedAuthorization;
  if (!wrapper || typeof wrapper !== 'object') {
    return { file, ok: false, reason: 'signedAuthorization missing or not an object' };
  }
  for (const k of ['data', 'signature', 'signatureAlgorithm']) {
    if (typeof wrapper[k] !== 'string') {
      return { file, ok: false, reason: `signedAuthorization.${k} missing or not a string` };
    }
  }
  if (wrapper.signatureAlgorithm !== 'ECDSA-P256-SHA256') {
    return { file, ok: false, reason: `signatureAlgorithm "${wrapper.signatureAlgorithm}" != ECDSA-P256-SHA256` };
  }

  const canonicalBytes = Buffer.from(wrapper.data, 'base64');
  if (!ecdsaVerify(pubPem, canonicalBytes, wrapper.signature)) {
    return { file, ok: false, reason: 'signedAuthorization.signature failed to verify' };
  }

  let claims;
  try {
    claims = JSON.parse(canonicalBytes.toString('utf-8'));
  } catch (e) {
    return { file, ok: false, reason: `decoded signedAuthorization.data is not valid JSON: ${e.message}` };
  }
  if (canonicalForm(claims) !== canonicalBytes.toString('utf-8')) {
    return { file, ok: false, reason: 'signedAuthorization.data is not OSPP-canonical' };
  }

  // The claims are held to their schema and to ble-handshake.md §4.2.1's bound: an
  // authorization expires no later than five minutes after it was issued.
  const claimErrors = ssaClaimsErrors(claims);
  if (claimErrors) {
    return { file, ok: false, reason: `decoded signedAuthorization.data fails server-signed-auth-claims.schema.json: ${claimErrors}` };
  }
  const lifetimeMs = Date.parse(claims.expiresAt) - Date.parse(claims.issuedAt);
  if (!(lifetimeMs > 0 && lifetimeMs <= 300 * 1000)) {
    return { file, ok: false, reason: `§4.2.1: expiresAt is not within five minutes after issuedAt (${lifetimeMs} ms)` };
  }

  // Cross-checks mandated by §4.2.2 for the parts visible from the envelope.
  // Station-side checks (Hello.appNonce, STATION_OWN_ID, NOW vs expiresAt)
  // require live handshake state that conformance fixtures cannot capture, so
  // only the envelope binding is asserted here:
  //   §4.2.2 check #5  —  claims.sessionId == envelope.sessionId
  if (claims.sessionId !== outer.sessionId) {
    return {
      file,
      ok: false,
      reason: `§4.2.2 #5: claims.sessionId="${claims.sessionId}" != outer.sessionId="${outer.sessionId}"`,
    };
  }

  return {
    file,
    ok: true,
    mode: 'server-signed-auth',
    bodyFields: Object.keys(claims),
    canonicalBytes: canonicalBytes.length,
  };
}

function verifyFile(file, key, modeOverride, opts) {
  const outer = JSON.parse(readFileSync(file, 'utf-8'));
  const mode = modeOverride ?? detectMode(outer);
  if (mode === 'receipt') return verifyReceipt(outer, file, key);
  if (mode === 'receipt-response') return verifyReceiptResponse(outer, file, key);
  if (mode === 'offline-pass') return verifyOfflinePass(outer, file, key);
  if (mode === 'server-signed-auth') return verifyServerSignedAuth(outer, file, key);
  if (mode === 'station-signature') return verifyStationSignature(outer, file, key, opts);
  if (mode === 'device-proof') return verifyDeviceProofFile(outer, file, key, opts);
  if (mode === 'firmware') return verifyFirmware(outer, file, key);
  if (mode === 'session-proof') return verifySessionProof(outer, file, key);
  if (mode === 'session-key-confirmation') return verifySessionKeyConfirmation(outer, file, key);
  return { file, ok: false, reason: `no detectable wrapper and no --mode override (got ${mode})` };
}

function loadKey(path) {
  return path.endsWith('.bin') ? readFileSync(path) : readFileSync(path, 'utf-8');
}

function main() {
  const opts = parseArgs(argv);
  const key = loadKey(opts.key);

  let failures = 0;
  for (const file of opts.files) {
    const r = verifyFile(file, key, opts.mode, opts);
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
