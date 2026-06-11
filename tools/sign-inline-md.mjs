#!/usr/bin/env node
// =============================================================================
// sign-inline-md.mjs — repair signature placeholders in inline ```json blocks
// of OSPP spec .md files. Mirror of sign-example.mjs for the doc surface.
// =============================================================================
//
// For each fenced ```json block carrying a placeholder signature / HMAC tag,
// this tool parses the block as JSON, identifies the wrapper shape, and
// regenerates the appropriate signature using the same canonical-form +
// ECDSA-P256 + RFC 6979 + low-s pipeline that signs the conformance vectors
// (`tools/sign-example.mjs`). The block content is then re-stringified at the
// same indentation level and substituted back into the .md byte-for-byte
// outside the block boundaries.
//
// Idempotent (RFC 6979 deterministic) — re-runs reduce to a no-op `git diff`.
//
// Auto-detected modes (recursing through MQTT envelopes when the outer has a
// `payload` field):
//   - receipt           (outer has `.receipt = {data, signature, ...}`)
//   - offline-pass      (outer has `.offlinePass = {... signature}`)
//   - server-signed-auth (outer.type === "ServerSignedAuth")
//   - firmware          (outer.firmwareUrl + outer.signature)
//   - session-proof     (OfflineAuthRequest — outer.sessionProof)
//   - session-key-confirmation (AuthResponse Accepted — outer.sessionKeyConfirmation)
//
// Each mode uses the appropriate synthetic test key from conformance/test-keys/.
//
// Usage:
//   node tools/sign-inline-md.mjs <file.md...>          # explicit list
//   node tools/sign-inline-md.mjs --all                  # the eight known files
//
// =============================================================================

import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { canonicalize } from '@ospp/protocol';
import { ecdsaSign, SIGNATURE_ALGORITHM } from '@ospp/protocol/server';

const KEY_DIR = 'conformance/test-keys';
const FIRMWARE_BIN_PATH = 'conformance/test-firmware/test-firmware.bin';
const SIG_ALG = SIGNATURE_ALGORITHM;
const AUTH_RESPONSE_OK_LABEL = 'AuthResponse_OK';
const SSA_ISSUED_AT = '2026-02-13T10:00:00.000Z';
const SSA_EXPIRES_AT = '2026-02-13T10:05:00.000Z';

const ALL_FILES = [
  'spec/06-security.md',
  'spec/profiles/offline/ble-handshake.md',
  'spec/profiles/offline/ble-session.md',
  'spec/profiles/offline/ble-transport.md',
  'spec/profiles/offline/reconciliation.md',
  'spec/profiles/offline/authorize-offline-pass.md',
  'spec/profiles/transaction/transaction-event.md',
  'spec/profiles/device-management/update-firmware.md',
  'spec/03-messages.md',
  // Conformance test-case walkthroughs carry illustrative inline payloads;
  // sign them too so the CI guard stays a clean tripwire.
  'conformance/test-cases/offline/TC-OFF-001.md',
  'conformance/test-cases/offline/TC-OFF-003.md',
  'conformance/test-cases/offline/TC-OFF-004.md',
  'conformance/test-cases/transaction/TC-TX-006.md',
  'conformance/test-cases/security/TC-SEC-004.md',
  'conformance/test-cases/device-management/TC-DM-004.md',
];

const STATION_KEY = readFileSync(`${KEY_DIR}/station-test-key.pem`, 'utf-8');
const SERVER_KEY  = readFileSync(`${KEY_DIR}/server-test-key.pem`,  'utf-8');
const FIRMWARE_KEY = readFileSync(`${KEY_DIR}/firmware-test-key.pem`, 'utf-8');
const SESSION_KEY = readFileSync(`${KEY_DIR}/session-test-key.bin`);

// -----------------------------------------------------------------------------
// Sign helpers (mirror of tools/sign-example.mjs)
// -----------------------------------------------------------------------------

const RECEIPT_FIELDS = [
  'offlineTxId','offlinePassId','userId','deviceId','bayId','serviceId',
  'startedAt','endedAt','durationSeconds','creditsCharged','txCounter',
];
const OFFLINE_PASS_FIELDS = [
  'passId','sub','deviceId','issuedAt','expiresAt','policyVersion',
  'revocationEpoch','offlineAllowance','constraints',
];

function deriveDeviceId(offlineTxId) {
  if (!offlineTxId?.startsWith('otx_')) throw new Error(`bad offlineTxId: ${offlineTxId}`);
  return `dev_${offlineTxId.slice(4, 12)}`;
}

// Deterministic field derivation for stale pre-v0.4.2 inline receipt bodies
// (offlinePassId, userId added to the v0.4.2 wrapper). Hashes the otx so the
// same `otx_*` always yields the same synthetic claim values — keeps re-runs
// idempotent without forcing reviewers to invent illustrative IDs.
function deriveReceiptStaleFields(outer) {
  const seed = outer.offlineTxId ?? '';
  const h = (label) => createHash('sha256').update(`${label}|${seed}`).digest('hex');
  if (!('offlinePassId' in outer)) outer.offlinePassId = `opass_${h('offlinePassId').slice(0, 16)}`;
  if (!('userId' in outer))        outer.userId        = `sub_${h('userId').slice(0, 16)}`;
  if (!('deviceId' in outer))      outer.deviceId      = deriveDeviceId(outer.offlineTxId);
}

function signReceipt(outer) {
  deriveReceiptStaleFields(outer);
  const body = {};
  for (const f of RECEIPT_FIELDS) {
    if (!(f in outer)) throw new Error(`receipt missing field: ${f}`);
    body[f] = outer[f];
  }
  if (outer.meterValues != null) body.meterValues = outer.meterValues;
  const bytes = Buffer.from(canonicalize(body), 'utf-8');
  outer.receipt = {
    data: bytes.toString('base64'),
    signature: ecdsaSign(STATION_KEY, bytes),
    signatureAlgorithm: SIG_ALG,
  };
  return 'receipt';
}

function signOfflinePass(outer) {
  const pass = outer.offlinePass;
  const body = {};
  for (const f of OFFLINE_PASS_FIELDS) {
    if (!(f in pass)) throw new Error(`offlinePass missing field: ${f}`);
    body[f] = pass[f];
  }
  const bytes = Buffer.from(canonicalize(body), 'utf-8');
  const sig = ecdsaSign(SERVER_KEY, bytes);
  const signedPass = {};
  for (const f of OFFLINE_PASS_FIELDS) signedPass[f] = body[f];
  signedPass.signatureAlgorithm = SIG_ALG;
  signedPass.signature = sig;
  outer.offlinePass = signedPass;
  return 'offline-pass';
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function deriveSsaClaims(outer) {
  if (typeof outer.sessionId !== 'string') {
    throw new Error('ServerSignedAuth requires outer.sessionId');
  }
  const seed = outer.sessionId;
  const h = (label) => sha256Hex(`${label}|${seed}`);
  return {
    authId:    `auth_${h('authId').slice(0, 12)}`,
    sub:       `sub_${h('sub').slice(0, 16)}`,
    deviceId:  `dev_${h('deviceId').slice(0, 16)}`,
    sessionId: outer.sessionId,
    stationId: `stn_${h('stationId').slice(0, 8)}`,
    bayId:     `bay_${h('bayId').slice(0, 12)}`,
    serviceId: 'svc_eco',
    appNonce:  Buffer.from(h('appNonce').slice(0, 64), 'hex').toString('base64'),
    issuedAt:  SSA_ISSUED_AT,
    expiresAt: SSA_EXPIRES_AT,
  };
}

function signServerSignedAuth(outer) {
  const claims = deriveSsaClaims(outer);
  const bytes = Buffer.from(canonicalize(claims), 'utf-8');
  outer.signedAuthorization = {
    data: bytes.toString('base64'),
    signature: ecdsaSign(SERVER_KEY, bytes),
    signatureAlgorithm: SIG_ALG,
  };
  return 'server-signed-auth';
}

function signFirmware(outer) {
  const binary = readFileSync(FIRMWARE_BIN_PATH);
  outer.checksum = `sha256:${createHash('sha256').update(binary).digest('hex')}`;
  outer.signature = ecdsaSign(FIRMWARE_KEY, binary);
  return 'firmware';
}

function signSessionProof(outer) {
  if (!outer.offlinePass?.passId || !Number.isInteger(outer.counter)) {
    throw new Error('sessionProof requires offlinePass.passId + integer counter');
  }
  const msg = Buffer.from(`${outer.type}${outer.offlinePass.passId}${outer.counter}`, 'utf-8');
  outer.sessionProof = createHmac('sha256', SESSION_KEY).update(msg).digest('base64');
  return 'session-proof';
}

function signSessionKeyConfirmation(outer) {
  if (outer.result !== 'Accepted') {
    if ('sessionKeyConfirmation' in outer) delete outer.sessionKeyConfirmation;
    return 'session-key-confirmation (skipped — Rejected)';
  }
  const msg = Buffer.from(AUTH_RESPONSE_OK_LABEL, 'utf-8');
  outer.sessionKeyConfirmation = createHmac('sha256', SESSION_KEY).update(msg).digest('base64');
  return 'session-key-confirmation';
}

// -----------------------------------------------------------------------------
// Mode dispatcher — handles MQTT-envelope unwrap
// -----------------------------------------------------------------------------

function signBody(node) {
  const ops = [];
  // MQTT envelope: recurse into payload
  if (node && typeof node === 'object' && node !== null && 'payload' in node && typeof node.payload === 'object') {
    ops.push(...signBody(node.payload));
    return ops;
  }
  // Mode dispatch — order matters (some payloads carry multiple things)
  if (node.receipt && typeof node.receipt === 'object') {
    ops.push(signReceipt(node));
  }
  if (node.offlinePass && typeof node.offlinePass === 'object') {
    ops.push(signOfflinePass(node));
  }
  if (node.type === 'ServerSignedAuth') {
    ops.push(signServerSignedAuth(node));
  }
  if (typeof node.firmwareUrl === 'string' && typeof node.signature === 'string') {
    ops.push(signFirmware(node));
  }
  if (node.type === 'OfflineAuthRequest' && 'sessionProof' in node) {
    ops.push(signSessionProof(node));
  }
  if (node.type === 'AuthResponse') {
    ops.push(signSessionKeyConfirmation(node));
  }
  // Standalone OfflinePass (the 06-security.md §6.1 example):
  if (!('payload' in node) && !node.receipt && !node.offlinePass && !node.type && OFFLINE_PASS_FIELDS.every(f => f in node)) {
    // Treat the node as an inline OfflinePass — sign in place via the same logic.
    const body = {};
    for (const f of OFFLINE_PASS_FIELDS) body[f] = node[f];
    const bytes = Buffer.from(canonicalize(body), 'utf-8');
    const sig = ecdsaSign(SERVER_KEY, bytes);
    // Rebuild node preserving field order: required + sigAlg + signature
    for (const k of Object.keys(node)) delete node[k];
    for (const f of OFFLINE_PASS_FIELDS) node[f] = body[f];
    node.signatureAlgorithm = SIG_ALG;
    node.signature = sig;
    ops.push('offline-pass-standalone');
  }
  return ops;
}

// -----------------------------------------------------------------------------
// .md block extraction + re-injection
// -----------------------------------------------------------------------------

function processFile(file) {
  const original = readFileSync(file, 'utf-8');
  const fence = /(```json\s*\n)([\s\S]*?)(```)/g;
  let out = '';
  let lastIndex = 0;
  const stats = { blocks: 0, signed: 0, modes: [] };

  for (const match of original.matchAll(fence)) {
    const [whole, open, body, close] = match;
    const blockStart = match.index;
    stats.blocks++;

    // Append everything before this block unchanged
    out += original.slice(lastIndex, blockStart);

    // Try to parse + sign
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      out += whole;
      lastIndex = blockStart + whole.length;
      continue;
    }

    // Only process blocks that look signed (have at least one sig field anywhere)
    const flat = JSON.stringify(parsed);
    const hasSig =
      flat.includes('"signature"') ||
      flat.includes('"signedAuthorization"') ||
      flat.includes('"sessionProof"') ||
      flat.includes('"sessionKeyConfirmation"');
    if (!hasSig) {
      out += whole;
      lastIndex = blockStart + whole.length;
      continue;
    }

    const ops = signBody(parsed);
    if (ops.length === 0) {
      out += whole;
      lastIndex = blockStart + whole.length;
      continue;
    }

    stats.signed++;
    stats.modes.push(...ops);

    // Reserialise with 2-space indent (matches the project convention)
    const newBody = JSON.stringify(parsed, null, 2) + '\n';
    out += open + newBody + close;
    lastIndex = blockStart + whole.length;
  }
  out += original.slice(lastIndex);

  if (out !== original) writeFileSync(file, out);
  return stats;
}

function main() {
  const files = argv.slice(2).flatMap((a) => (a === '--all' ? ALL_FILES : [a]));
  if (files.length === 0) {
    console.error('usage: sign-inline-md.mjs <file.md...>  OR  --all');
    exit(2);
  }
  for (const file of files) {
    const s = processFile(file);
    console.log(`  ${file}: ${s.blocks} block(s), ${s.signed} signed [${s.modes.join(', ')}]`);
  }
}

main();
