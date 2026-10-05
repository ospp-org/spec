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
// The BLE handshake of a document (06-security.md §6.5 – §6.5.4), in document order:
//   - hello             (type "Hello": an appEphemeralPubKey that is not a valid
//                        compressed P-256 point is replaced by one derived from the
//                        document's label; a valid one is kept)
//   - station-signature (type "Challenge": the same rule for stationEphemeralPubKey;
//                        stationCertificate := the test station's mTLS certificate;
//                        stationSignature := its key's signature over the Hello
//                        before it, as compact JSON, and this Challenge)
//   - device-proof      (an OfflineAuthRequest with a deviceProof: over the Hello and
//                        Challenge before it — or, with none in the document, a
//                        transcript derived from the label — and the station of that
//                        Challenge's certificate; the pass's devicePublicKey is set to
//                        the test device key of its deviceId before the pass is signed)
//   - forward           (an AuthorizeOfflinePass REQUEST with deviceProof and
//                        transcriptHash: the transcript of the document's
//                        OfflineAuthRequest with the same pass and counter, or a
//                        derived one, and the same device proof)
//   - ssa-nonce         (a ServerSignedAuth in a document with a Hello: its signed
//                        appNonce claim follows that Hello's appNonce, check #2)
//   - trust-bundle      (a trustBundle's stationCaCertificate and stationCaCrl := the
//                        test Station CA's certificate and CRL)
// Handshake nonces are not invented here: a document's Hello and Challenge nonces
// come from tools/verify-test-nonces.mjs --write, or are typed; a placeholder stops
// the run.
//
// Each mode uses the appropriate synthetic test key from conformance/test-keys/.
//
// Usage:
//   node tools/sign-inline-md.mjs <file.md...>          # explicit list
//   node tools/sign-inline-md.mjs --all                  # every file in ALL_FILES
//   node tools/sign-inline-md.mjs --check <files|--all>  # write nothing; list what
//                                                        # would change; exit 1 if any
//
// =============================================================================

import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { canonicalForm } from './canonical-form.mjs';
import { envelopeAbsentDeviceId, signedOnlyFields } from './receipt-fields.mjs';
import { ecdsaSign, SIGNATURE_ALGORITHM } from '@ospp/protocol/server';
import {
  deriveKeyPair, validatePublicKey, wireBytes, transcriptHashOf, signStationChallenge,
  parseCertificate, pemToDer, sha256, deviceTestKey, deviceProofInput, deviceProofFormats,
  makeDeviceProof, syntheticAuthenticatorData,
} from './ble-crypto.mjs';
import { HANDSHAKES } from './verify-test-nonces.mjs';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';

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
  // The reconciliation walkthrough carried three TransactionEvents whose receipt.data decoded to
  // a four-field body no schema admits, under signatures that verified nothing. It is the one
  // flow document about settling signed receipts, so its receipts are signed like the rest.
  'examples/flows/11-reconciliation.md',
];

const STATION_KEY = readFileSync(`${KEY_DIR}/station-test-key.pem`, 'utf-8');
const SERVER_KEY  = readFileSync(`${KEY_DIR}/server-test-key.pem`,  'utf-8');
const FIRMWARE_KEY = readFileSync(`${KEY_DIR}/firmware-test-key.pem`, 'utf-8');
const SESSION_KEY = readFileSync(`${KEY_DIR}/session-test-key.bin`);
// The station's mTLS key and certificate sign the BLE Challenge (06-security.md §6.5.2);
// STATION_KEY above is the separate receipt key.
const STATION_MTLS_KEY = readFileSync(`${KEY_DIR}/station-mtls-test-key.pem`, 'utf-8');
const STATION_MTLS_CERT_B64 = pemToDer(readFileSync(`${KEY_DIR}/station-mtls-test-cert.pem`, 'utf-8')).toString('base64');
const STATION_MTLS_ID = parseCertificate(Buffer.from(STATION_MTLS_CERT_B64, 'base64')).subjectCN;
const STATION_CA_CERT = readFileSync(`${KEY_DIR}/station-ca-test-cert.pem`, 'utf-8');
const STATION_CA_CRL = readFileSync(`${KEY_DIR}/station-ca-test-crl.pem`, 'utf-8');
const DEVICE_PROOF_FORMATS = deviceProofFormats(JSON.parse(readFileSync('schemas/common/device-proof.schema.json', 'utf-8')));
const APP_ATTEST_APP_ID = 'OSPPTEST01.org.ospp.app';
const NONCE_RE = /^[A-Za-z0-9+/]{43}=$/;

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
  'passId','sub','deviceId','devicePublicKey','keyId','issuedAt','expiresAt','policyVersion',
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
  if (!('deviceId' in outer))    { outer.deviceId      = envelopeAbsentDeviceId(outer, deriveDeviceId); synthesised.add('deviceId'); }
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
  // The four signed-only fields (06-security.md §6.2) are in no envelope; see receipt-fields.mjs.
  Object.assign(body, signedOnlyFields(outer));
  const bytes = Buffer.from(canonicalForm(body), 'utf-8');
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
  const bytes = Buffer.from(canonicalForm(body), 'utf-8');
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

// The claims a fixture already signs win, as in sign-example.mjs: an inline
// ServerSignedAuth depicts one authorization, and its claims must agree with the
// document around it (ble-handshake.md §4.2.1, §4.2.2). Only a block that carries no
// complete claim set yet gets synthetic claims derived from its sessionId.
const SSA_CLAIM_KEYS = [
  'appNonce', 'authId', 'bayId', 'creditsAuthorized', 'deviceId', 'durationSeconds',
  'expiresAt', 'issuedAt', 'serviceId', 'sessionId', 'stationId', 'sub',
];

function signedSsaClaims(outer) {
  const data = outer.signedAuthorization && outer.signedAuthorization.data;
  if (typeof data !== 'string') return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;
  const keys = Object.keys(claims).sort();
  if (keys.length !== SSA_CLAIM_KEYS.length || keys.some((k, i) => k !== SSA_CLAIM_KEYS[i])) return null;
  return claims;
}

function deriveSsaClaims(outer) {
  if (typeof outer.sessionId !== 'string') {
    throw new Error('ServerSignedAuth requires outer.sessionId');
  }
  const signed = signedSsaClaims(outer);
  if (signed) return signed;
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
  const bytes = Buffer.from(canonicalForm(claims), 'utf-8');
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
    const bytes = Buffer.from(canonicalForm(body), 'utf-8');
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
// BLE handshake of a document (06-security.md §6.5 – §6.5.4)
// -----------------------------------------------------------------------------

// The label a document's derived test values hang from: its verify-test-nonces
// label, or its path.
function labelOf(file) {
  return HANDSHAKES.find((h) => h.file === file)?.label ?? file;
}

const isHello = (n) => n && n.type === 'Hello';
const isChallenge = (n) => n && n.type === 'Challenge';
const isOar = (n) => n && n.type === 'OfflineAuthRequest' && n.deviceProof && typeof n.deviceProof === 'object' &&
  n.offlinePass && typeof n.offlinePass.passId === 'string';
// An AuthorizeOfflinePass REQUEST payload, bare or in its MQTT envelope.
const forwardTarget = (n) => {
  const t = n && typeof n === 'object' && n.payload && typeof n.payload === 'object' ? n.payload : n;
  return t && typeof t === 'object' && !t.type && t.offlinePass && typeof t.offlinePass.passId === 'string' &&
    'deviceProof' in t && 'transcriptHash' in t ? t : null;
};
const trustBundleOf = (n) => {
  const t = n && typeof n === 'object' && n.payload && typeof n.payload === 'object' ? n.payload : n;
  return t && t.trustBundle && typeof t.trustBundle === 'object' && 'stationCaCertificate' in t.trustBundle ? t.trustBundle : null;
};

// A handshake message is signed only once it has the shape of its schema: a Hello or a
// Challenge still in an earlier revision's shape would otherwise come out signed and
// invalid at once.
const require = createRequire(import.meta.url);
let ajvInstance = null;
function schemaErrors(schemaFile, value) {
  if (!ajvInstance) {
    const Ajv2020 = require('ajv/dist/2020').default;
    const addFormatsModule = require('ajv-formats');
    ajvInstance = new Ajv2020({ allErrors: true, strict: false });
    (addFormatsModule.default ?? addFormatsModule)(ajvInstance);
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    for (const f of walk('schemas').filter((f) => f.endsWith('.schema.json'))) {
      const sch = JSON.parse(readFileSync(f, 'utf-8'));
      if (sch.$id && !ajvInstance.getSchema(sch.$id)) ajvInstance.addSchema(sch);
    }
  }
  const id = JSON.parse(readFileSync(schemaFile, 'utf-8')).$id;
  const v = ajvInstance.getSchema(id);
  return v(value) ? null : ajvInstance.errorsText(v.errors);
}
function requireShape(file, schemaFile, value, what) {
  const errors = schemaErrors(schemaFile, value);
  if (errors) throw new Error(`${file}: the ${what} does not satisfy ${schemaFile}: ${errors}`);
}

function validKey(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]{44}$/.test(b64)) return false;
  try { validatePublicKey(b64); return true; } catch { return false; }
}

function ephemeral(label, ordinal, role) {
  return deriveKeyPair(`OSPP_TEST_EPH_V1:${label}:${ordinal}:${role}`).pubCompressed.toString('base64');
}

function requireNonce(file, node, field) {
  if (!NONCE_RE.test(node[field] ?? '')) {
    throw new Error(`${file}: ${node.type}.${field} is not a 32-byte Base64 nonce (${JSON.stringify(node[field])}) — run node tools/verify-test-nonces.mjs --write, or type one`);
  }
}

// A device proof for a pass presented over a transcript at a station. The pass's
// devicePublicKey is set to the test key of its deviceId first: the proof can only
// be made with that key, and the pass is then re-signed over it.
function proveDevice(file, target, transcriptHash, stationId) {
  const deviceKey = deviceTestKey(target.offlinePass.deviceId);
  target.offlinePass.devicePublicKey = deviceKey.devicePublicKey;
  for (const k of ['counter', 'requestedDurationSeconds']) {
    if (!Number.isInteger(target[k])) throw new Error(`${file}: a device proof needs an integer ${k}`);
  }
  for (const k of ['bayId', 'serviceId']) {
    if (typeof target[k] !== 'string') throw new Error(`${file}: a device proof needs ${k}`);
  }
  const kind = target.deviceProof?.format === DEVICE_PROOF_FORMATS.apple ? 'apple' : 'android';
  const proofInput = deviceProofInput({
    transcriptHash, stationId, passId: target.offlinePass.passId, counter: target.counter,
    bayId: target.bayId, serviceId: target.serviceId, requestedDurationSeconds: target.requestedDurationSeconds,
  });
  const proof = makeDeviceProof({
    kind, formats: DEVICE_PROOF_FORMATS, deviceKey, proofInput,
    authenticatorData: kind === 'apple' ? syntheticAuthenticatorData(APP_ATTEST_APP_ID, 1) : null,
  });
  target.deviceProof = proof;
}

// A transcript for a presentation the document does not show the handshake of.
function syntheticTranscript(label, ordinal) {
  return sha256(Buffer.from(`OSPP_TEST_TRANSCRIPT_V1:${label}:${ordinal}`, 'utf-8'));
}

// -----------------------------------------------------------------------------
// .md block extraction + re-injection
// -----------------------------------------------------------------------------

// A block may be preceded by `<!-- ospp-sign: <mode> -->` to select a non-default signing
// mode. The marker is claimed by the block that follows it, and an unclaimed marker is a
// hard error rather than a silent no-op: a directive that quietly does nothing is how a
// negative fixture reverts to a positive one without anybody seeing it.
const SIGN_DIRECTIVE = /<!--\s*ospp-sign:\s*([a-z][a-z0-9-]*)\s*-->/g;

const STANDARD_SIG_FIELDS = ['"signature"', '"signedAuthorization"', '"sessionProof"', '"sessionKeyConfirmation"'];

function processFile(file, { write = true } = {}) {
  const original = readFileSync(file, 'utf-8');
  const fence = /(```json\s*\n)([\s\S]*?)(```)/g;
  const label = labelOf(file);
  const stats = { blocks: 0, signed: 0, modes: [], changed: [] };

  // 1. Collect every block, the directive before it, and its JSON when it parses.
  const blocks = [];
  let lastIndex = 0;
  for (const match of original.matchAll(fence)) {
    const [whole, open, body, close] = match;
    const gap = original.slice(lastIndex, match.index);
    const found = [...gap.matchAll(SIGN_DIRECTIVE)];
    const directive = found.length ? found[found.length - 1][1] : undefined;
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      if (directive) throw new Error(`${file}: ospp-sign: ${directive} precedes a block that is not valid JSON`);
    }
    blocks.push({ start: match.index, whole, open, body, close, gap, directive, parsed, before: parsed === null ? null : JSON.stringify(parsed), ops: [] });
    lastIndex = match.index + whole.length;
  }
  stats.blocks = blocks.length;

  // 2. The document's Hello: the one a ServerSignedAuth's appNonce claim follows.
  const hellos = blocks.filter((b) => isHello(b.parsed));
  const docAppNonce = hellos.length ? hellos[0].parsed.appNonce : null;

  // 3. Document order: the handshake, the presentations and every standard signature.
  const ctx = { hello: null, ordinal: -1, transcript: null, stationId: null, synthetic: 0 };
  const presentations = [];
  for (const b of blocks) {
    const node = b.parsed;
    if (node === null) continue;
    if (forwardTarget(node)) continue; // after the presentations (step 4)

    if (isHello(node)) {
      ctx.ordinal++;
      requireNonce(file, node, 'appNonce');
      if (!validKey(node.appEphemeralPubKey)) node.appEphemeralPubKey = ephemeral(label, ctx.ordinal, 'app');
      requireShape(file, 'schemas/ble/hello.schema.json', node, 'Hello');
      ctx.hello = node;
      ctx.transcript = null;
      b.ops.push('hello');
      continue;
    }
    if (isChallenge(node)) {
      if (!ctx.hello) throw new Error(`${file}: a Challenge with no Hello before it — the station signs the Hello it answers`);
      requireNonce(file, node, 'stationNonce');
      if (!validKey(node.stationEphemeralPubKey)) node.stationEphemeralPubKey = ephemeral(label, ctx.ordinal, 'station');
      node.stationCertificate = STATION_MTLS_CERT_B64;
      node.stationSignature = '';
      node.stationSignature = signStationChallenge(STATION_MTLS_KEY, wireBytes(ctx.hello), node);
      requireShape(file, 'schemas/ble/challenge.schema.json', node, 'Challenge');
      ctx.transcript = transcriptHashOf(wireBytes(ctx.hello), wireBytes(node));
      ctx.stationId = STATION_MTLS_ID;
      b.ops.push('station-signature');
      continue;
    }
    if (isOar(node)) {
      let transcript = ctx.transcript;
      let stationId = ctx.stationId;
      if (!transcript) {
        transcript = syntheticTranscript(label, ctx.synthetic++);
        stationId = STATION_MTLS_ID;
      }
      proveDevice(file, node, transcript, stationId);
      b.ops.push(...signBody(node, b.directive), 'device-proof');
      requireShape(file, 'schemas/ble/offline-auth-request.schema.json', node, 'OfflineAuthRequest');
      presentations.push({ passId: node.offlinePass.passId, counter: node.counter, node, transcript, stationId });
      continue;
    }
    if (node.type === 'ServerSignedAuth' && docAppNonce && typeof node.signedAuthorization?.data === 'string') {
      // Check #2: the authorization names the appNonce of the Hello it is relayed with.
      try {
        const claims = JSON.parse(Buffer.from(node.signedAuthorization.data, 'base64').toString('utf-8'));
        if (claims && typeof claims === 'object' && 'appNonce' in claims && claims.appNonce !== docAppNonce) {
          claims.appNonce = docAppNonce;
          node.signedAuthorization.data = Buffer.from(canonicalForm(claims), 'utf-8').toString('base64');
          b.ops.push('ssa-nonce');
        }
      } catch { /* a block whose data is not claims is signed as it is */ }
    }
    const tb = trustBundleOf(node);
    if (tb) {
      tb.stationCaCertificate = STATION_CA_CERT;
      if ('stationCaCrl' in tb) tb.stationCaCrl = STATION_CA_CRL;
      b.ops.push('trust-bundle');
    }
    const flat = JSON.stringify(node);
    if (STANDARD_SIG_FIELDS.some((f) => flat.includes(f))) b.ops.push(...signBody(node, b.directive));
  }

  // 4. Forwards: the transcript of the presentation they forward, the proof unchanged.
  for (const b of blocks) {
    const target = b.parsed === null ? null : forwardTarget(b.parsed);
    if (!target) continue;
    const p = presentations.find((x) => x.passId === target.offlinePass.passId && x.counter === target.counter);
    let transcript;
    let stationId;
    if (p) {
      for (const k of ['bayId', 'serviceId', 'requestedDurationSeconds']) {
        if (target[k] !== p.node[k]) throw new Error(`${file}: the AuthorizeOfflinePass REQUEST forwards ${p.passId}/${p.counter} with ${k} ${JSON.stringify(target[k])}, the OfflineAuthRequest asked ${JSON.stringify(p.node[k])}`);
      }
      transcript = p.transcript;
      stationId = p.stationId;
    } else {
      transcript = syntheticTranscript(label, ctx.synthetic++);
      stationId = STATION_MTLS_ID;
    }
    target.transcriptHash = transcript.toString('base64');
    proveDevice(file, target, transcript, stationId);
    b.ops.push(...signBody(b.parsed, b.directive), 'forward');
    requireShape(file, 'schemas/mqtt/authorize-offline-pass-request.schema.json', target, 'AuthorizeOfflinePass REQUEST payload');
  }

  // 5. Directives, and the text.
  let out = '';
  let cursor = 0;
  for (const b of blocks) {
    out += original.slice(cursor, b.start);
    cursor = b.start + b.whole.length;
    if (b.directive && b.parsed !== null && b.ops.length === 0) {
      throw new Error(`${file}: ospp-sign: ${b.directive} precedes a block that carries no signature field`);
    }
    if (b.directive && !b.ops.includes(b.directive)) {
      throw new Error(
        `${file}: ospp-sign: ${b.directive} matched no signing mode on the block that follows it ` +
        `(the block was signed as: ${b.ops.join(', ') || 'nothing'}). ` +
        `An unclaimed directive would leave a negative fixture silently signed as a valid one.`,
      );
    }
    if (b.parsed === null || b.ops.length === 0) {
      out += b.whole;
      continue;
    }
    stats.signed++;
    stats.modes.push(...b.ops);
    if (JSON.stringify(b.parsed) === b.before) {
      out += b.whole; // nothing moved: the block keeps its own layout
      continue;
    }
    stats.changed.push(`${b.ops.join('+')} @ offset ${b.start}`);
    // Reserialise with 2-space indent (the project convention), at the indentation
    // the block's own lines and closing fence already had.
    const bodyIndent = (b.body.match(/^([ \t]*)\S/m) || [null, ''])[1];
    const closeIndent = b.body.slice(b.body.lastIndexOf('\n') + 1);
    const json = JSON.stringify(b.parsed, null, 2).split('\n').map((l) => bodyIndent + l).join('\n');
    out += b.open + json + '\n' + (/^[ \t]*$/.test(closeIndent) ? closeIndent : '') + b.close;
  }
  out += original.slice(cursor);

  stats.wouldChange = out !== original;
  if (write && stats.wouldChange) writeFileSync(file, out);
  return stats;
}

function main() {
  const args = argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter((a) => a !== '--check').flatMap((a) => (a === '--all' ? ALL_FILES : [a]));
  if (files.length === 0) {
    console.error('usage: sign-inline-md.mjs [--check] <file.md...>  OR  [--check] --all');
    exit(2);
  }
  let drift = 0;
  for (const file of files) {
    const s = processFile(file, { write: !check });
    const tag = check ? (s.wouldChange ? ' WOULD CHANGE' : ' unchanged') : '';
    console.log(`  ${file}: ${s.blocks} block(s), ${s.signed} signed [${s.modes.join(', ')}]${tag}`);
    if (check && s.wouldChange) {
      drift++;
      for (const c of s.changed) console.log(`      ${c}`);
    }
  }
  if (check) {
    console.log(`\n${drift} of ${files.length} file(s) would change.`);
    exit(drift ? 1 : 0);
  }
}

main();
