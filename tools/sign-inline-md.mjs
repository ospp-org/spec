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
  // The one worked example that carries a firmware payload. It was outside this list and
  // its `checksum` was the SHA-256 of the empty string — a digest of nothing, presented as
  // the digest of a 12 MB image. Unsigned files do not drift; they simply were never true.
  'examples/flows/12-firmware-update.md',
  // Four narrative documents that were in neither this list nor verify-all-signatures.sh's,
  // so their crypto literals were never regenerated and never verified. One `signature` was
  // shared by an EXPIRED pass and three valid ones -- and was not DER at all, so the negative
  // scenario proved the parser rather than the rule.
  'examples/error-scenarios/03-offline-pass-expired.md',
  'examples/flows/04-full-offline-session.md',
  'examples/flows/05-partial-a-session.md',
  'examples/flows/06-partial-b-session.md',
];

const STATION_KEY = readFileSync(`${KEY_DIR}/station-test-key.pem`, 'utf-8');
const SERVER_KEY  = readFileSync(`${KEY_DIR}/server-test-key.pem`,  'utf-8');
const FIRMWARE_KEY = readFileSync(`${KEY_DIR}/firmware-test-key.pem`, 'utf-8');
const SESSION_KEY = readFileSync(`${KEY_DIR}/session-test-key.bin`);

// -----------------------------------------------------------------------------
// Sign helpers (mirror of tools/sign-example.mjs)
// -----------------------------------------------------------------------------

const RECEIPT_SHARED_FIELDS = [
  'offlineTxId','userId','deviceId','bayId','serviceId',
  'startedAt','endedAt','durationSeconds','creditsCharged','txCounter',
];
// Discriminated forms (schema oneOf): pass-form +{offlinePassId,passCounter};
// auth-form (Partial A — ServerSignedAuth) +{authId,sessionId}.
const RECEIPT_PASS_FORM_FIELDS = ['offlinePassId','passCounter'];
const RECEIPT_AUTH_FORM_FIELDS = ['authId','sessionId'];
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
// Returns the set of keys this function had to invent, so the caller can put the
// envelope back the way it found it. `deviceId` in particular is a RECEIPT field and
// is NOT a member of transaction-event-request.schema.json, which is
// `additionalProperties: false` — leaving a synthesised one behind makes the very
// payload this tool just signed invalid against its own schema.
function deriveReceiptStaleFields(outer) {
  const seed = outer.offlineTxId ?? '';
  const h = (label) => createHash('sha256').update(`${label}|${seed}`).digest('hex');
  const synthesised = new Set();
  if (!('userId' in outer))        outer.userId        = `sub_${h('userId').slice(0, 16)}`;
  if (!('deviceId' in outer))    { outer.deviceId      = deriveDeviceId(outer.offlineTxId); synthesised.add('deviceId'); }
  // Auth-form (Partial A) bodies carry {authId, sessionId} and no pass; synthesise
  // the pass-form {offlinePassId, passCounter} only for pass-form bodies.
  const isAuthForm = ('authId' in outer) || ('sessionId' in outer);
  if (!isAuthForm) {
    if (!('offlinePassId' in outer)) outer.offlinePassId = `opass_${h('offlinePassId').slice(0, 16)}`;
    // passCounter (finding N7): app-global pass usage counter, signed into the receipt.
    if (!('passCounter' in outer))   outer.passCounter   = (parseInt(h('passCounter').slice(0, 6), 16) % 64) + 1;
  }
  return synthesised;
}

function signReceipt(outer) {
  const synthesised = deriveReceiptStaleFields(outer);
  const isAuthForm = ('authId' in outer) || ('sessionId' in outer);
  const fields = [...RECEIPT_SHARED_FIELDS, ...(isAuthForm ? RECEIPT_AUTH_FORM_FIELDS : RECEIPT_PASS_FORM_FIELDS)];
  const body = {};
  for (const f of fields) {
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
  // Remove only what we invented above. A `deviceId` the document already carried is
  // left alone (BLE receipt wrappers legitimately carry one); a synthesised one is
  // dropped, because it lives in the signed body and not on the envelope.
  for (const k of synthesised) delete outer[k];
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
    durationSeconds: 300,
    creditsAuthorized: 200,
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

// A negative fixture has to be *derived*, not typed in.
//
// A conformance case that tests the rejection of a bad firmware signature needs a
// signature that fails verification. Typing one in does not survive: this signer runs
// over the same file and overwrites `signature` with the valid one, and the CI
// idempotency guard then reports a clean tree. TC-DM-004 Part E carried the valid
// signature under the label "corrupted" for exactly that reason, so the part passed
// against any implementation, including one that never verified anything.
//
// So the corruption is generated here, from the same key and the same binary as the
// valid value, and re-derived on every run. It cannot drift from the key material and
// it cannot be silently repaired.
//
// The corruption is one bit: the low bit of the final byte of `s`. The DER framing
// (`30 44 02 20 <r> 02 20 <s>`) is untouched, so the value still parses as a well-formed
// ECDSA P-256 signature and fails the verification *maths* rather than the parser. A
// station that rejects it as malformed has not exercised the signature path, which is
// the thing the case exists to measure.
function signFirmwareCorrupted(outer) {
  signFirmware(outer);
  const der = Buffer.from(outer.signature, 'base64');
  if (der[0] !== 0x30 || der[1] >= 0x80) {
    throw new Error('firmware-corrupted: signature is not a short-form DER SEQUENCE');
  }
  let i = 2;
  if (der[i] !== 0x02) throw new Error('firmware-corrupted: no INTEGER r');
  i += 2 + der[i + 1];
  if (der[i] !== 0x02) throw new Error('firmware-corrupted: no INTEGER s');
  const sEnd = i + 2 + der[i + 1];
  if (sEnd !== der.length) throw new Error('firmware-corrupted: trailing bytes after s');
  der[sEnd - 1] ^= 0x01;
  outer.signature = der.toString('base64');
  return 'firmware-corrupted';
}

// Length-prefix: U16BE(byteLength) ‖ UTF-8 bytes (06-security.md §6.5 Pin 3 / Pin 4).
function lp(s) {
  const b = Buffer.from(s, 'utf-8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
}

function signSessionProof(outer) {
  if (!outer.offlinePass?.passId || !Number.isInteger(outer.counter)) {
    throw new Error('sessionProof requires offlinePass.passId + integer counter');
  }
  // LP(type) ‖ LP(passId) ‖ LP(decimal(counter)) — length-prefixed, injective
  // (ble-handshake.md §4.1).
  const msg = Buffer.concat([lp(outer.type), lp(outer.offlinePass.passId), lp(String(outer.counter))]);
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

function signBody(node, directive) {
  const ops = [];
  // MQTT envelope: recurse into payload
  if (node && typeof node === 'object' && node !== null && 'payload' in node && typeof node.payload === 'object') {
    ops.push(...signBody(node.payload, directive));
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
    ops.push(directive === 'firmware-corrupted' ? signFirmwareCorrupted(node) : signFirmware(node));
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

// A block may be preceded by `<!-- ospp-sign: <mode> -->` to select a non-default signing
// mode. The marker is claimed by the block that follows it, and an unclaimed marker is a
// hard error rather than a silent no-op: a directive that quietly does nothing is how a
// negative fixture reverts to a positive one without anybody seeing it.
const SIGN_DIRECTIVE = /<!--\s*ospp-sign:\s*([a-z][a-z0-9-]*)\s*-->/g;

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

    // Everything between the previous block and this one, unchanged — and the place a
    // signing directive for this block would live.
    const gap = original.slice(lastIndex, blockStart);
    out += gap;
    const found = [...gap.matchAll(SIGN_DIRECTIVE)];
    const directive = found.length ? found[found.length - 1][1] : undefined;

    // Try to parse + sign
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      if (directive) throw new Error(`${file}: ospp-sign: ${directive} precedes a block that is not valid JSON`);
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
      if (directive) throw new Error(`${file}: ospp-sign: ${directive} precedes a block that carries no signature field`);
      out += whole;
      lastIndex = blockStart + whole.length;
      continue;
    }

    const ops = signBody(parsed, directive);
    if (directive && !ops.includes(directive)) {
      throw new Error(
        `${file}: ospp-sign: ${directive} matched no signing mode on the block that follows it ` +
        `(the block was signed as: ${ops.join(', ') || 'nothing'}). ` +
        `An unclaimed directive would leave a negative fixture silently signed as a valid one.`,
      );
    }
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
