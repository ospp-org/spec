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

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { canonicalize } from '@ospp/protocol';
import { ecdsaVerify } from '@ospp/protocol/server';

// Compressed SEC1 P-256 public key on the BLE wire: 33 bytes → 44 Base64 chars,
// no padding (06-security.md §6.5 Pin 2).
const EC_PUBKEY_RE = /^[A-Za-z0-9+/]{44}$/;
const STATION_IDENTITY_BODY_FIELDS = ['stationId', 'organizationId', 'stationPubKey', 'issuedAt', 'expiresAt'];

const FIRMWARE_BIN_PATH = 'conformance/test-firmware/test-firmware.bin';
const SESSION_KEY_PATH = 'conformance/test-keys/session-test-key.bin';
const AUTH_RESPONSE_OK_LABEL = 'AuthResponse_OK';

function parseArgs(args) {
  const opts = { key: null, mode: null, files: [] };
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === '--key') opts.key = args[++i];
    else if (a === '--mode') opts.mode = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: verify-example-signatures.mjs --key <pub.pem|key.bin> [--mode <mode>] <file...>');
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
  // StationIdentity certificate — either embedded in a Challenge (FFF4) as
  // `stationCert`, or a bare cert object (stationPubKey + signature wrapper).
  if (outer && typeof outer === 'object' && outer.type === 'Challenge' && outer.stationCert && typeof outer.stationCert === 'object') {
    return 'station-identity';
  }
  if (outer && typeof outer === 'object' && typeof outer.stationPubKey === 'string' && typeof outer.signature === 'string' && typeof outer.signatureAlgorithm === 'string') {
    return 'station-identity';
  }
  if (outer && typeof outer === 'object' && typeof outer.firmwareUrl === 'string') {
    return 'firmware';
  }
  return null;
}

function verifyStationIdentity(outer, file, pubPem) {
  // Accept the cert directly, or pull it out of a Challenge wrapper.
  const cert = (outer.stationCert && typeof outer.stationCert === 'object') ? outer.stationCert : outer;

  for (const k of [...STATION_IDENTITY_BODY_FIELDS, 'signatureAlgorithm', 'signature']) {
    if (typeof cert[k] !== 'string') {
      return { file, ok: false, reason: `stationCert.${k} missing or not a string` };
    }
  }
  if (cert.signatureAlgorithm !== 'ECDSA-P256-SHA256') {
    return { file, ok: false, reason: `signatureAlgorithm "${cert.signatureAlgorithm}" != ECDSA-P256-SHA256` };
  }

  // Signed body = cert MINUS signature + signatureAlgorithm, OSPP-canonical (§4.8 / Pin 8).
  const { signature, signatureAlgorithm, ...body } = cert;
  void signatureAlgorithm;
  const canonicalBytes = Buffer.from(canonicalize(body), 'utf-8');
  if (!ecdsaVerify(pubPem, canonicalBytes, signature)) {
    return { file, ok: false, reason: 'stationCert.signature failed to verify against the server public key' };
  }

  // stationPubKey is the static ECDH key — MUST be compressed SEC1 (Pin 2).
  if (!EC_PUBKEY_RE.test(body.stationPubKey)) {
    return { file, ok: false, reason: 'stationPubKey is not a 44-char compressed-SEC1 Base64 key (§6.5 Pin 2)' };
  }
  // If embedded in a Challenge, the ephemeral key MUST also be compressed SEC1.
  if (outer.stationCert && !EC_PUBKEY_RE.test(outer.stationEphemeralPubKey ?? '')) {
    return { file, ok: false, reason: 'Challenge.stationEphemeralPubKey is not a 44-char compressed-SEC1 Base64 key (§6.5 Pin 2)' };
  }

  // Structural profile (a timeless vector): issuedAt < expiresAt. The absolute
  // freshness check (expiresAt > now, with clock-skew) is the app's RUNTIME gate
  // (§6.5.2 step 2) — it cannot be asserted on a fixed vector and is exercised
  // live in B5, not here. Stated, not hidden.
  const issuedMs = Date.parse(body.issuedAt);
  const expiresMs = Date.parse(body.expiresAt);
  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs)) {
    return { file, ok: false, reason: 'issuedAt/expiresAt is not a parseable timestamp' };
  }
  if (!(expiresMs > issuedMs)) {
    return { file, ok: false, reason: `expiresAt (${body.expiresAt}) must be after issuedAt (${body.issuedAt})` };
  }

  return { file, ok: true, mode: 'station-identity', bodyFields: Object.keys(body), canonicalBytes: canonicalBytes.length };
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

  // Profile constraint (beyond JSON-schema validity): a "valid" OfflinePass
  // vector MUST also satisfy the offline-pass profile. Maximum validity is
  // 24 hours from issuedAt (offline-pass.md §2). Schema-validity is necessary
  // but not sufficient — this guards a vector marked "valid" from silently
  // shipping a profile violation (N14: both offline-auth-request vectors
  // shipped a 7-day window). Other profile invariants can be added here.
  if (typeof body.issuedAt === 'string' && typeof body.expiresAt === 'string') {
    const issuedMs = Date.parse(body.issuedAt);
    const expiresMs = Date.parse(body.expiresAt);
    if (Number.isFinite(issuedMs) && Number.isFinite(expiresMs)) {
      const MAX_VALIDITY_MS = 24 * 60 * 60 * 1000;
      if (expiresMs - issuedMs > MAX_VALIDITY_MS) {
        const hours = ((expiresMs - issuedMs) / 3_600_000).toFixed(1);
        return { file, ok: false, reason: `offlinePass validity ${hours}h exceeds the 24h profile maximum (offline-pass.md §2)` };
      }
    }
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
  if (canonicalize(claims) !== canonicalBytes.toString('utf-8')) {
    return { file, ok: false, reason: 'signedAuthorization.data is not OSPP-canonical' };
  }

  // Cross-checks mandated by §4.2.2 for the parts visible from the envelope.
  // Station-side checks (Hello.appNonce, Hello.deviceId, STATION_OWN_ID, NOW
  // vs expiresAt) require live handshake state that conformance fixtures
  // cannot capture, so we only assert the envelope binding here:
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

function verifyFile(file, key, modeOverride) {
  const outer = JSON.parse(readFileSync(file, 'utf-8'));
  const mode = modeOverride ?? detectMode(outer);
  if (mode === 'receipt') return verifyReceipt(outer, file, key);
  if (mode === 'offline-pass') return verifyOfflinePass(outer, file, key);
  if (mode === 'server-signed-auth') return verifyServerSignedAuth(outer, file, key);
  if (mode === 'station-identity') return verifyStationIdentity(outer, file, key);
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
    const r = verifyFile(file, key, opts.mode);
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
