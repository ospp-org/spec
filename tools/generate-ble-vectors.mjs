#!/usr/bin/env node
// =============================================================================
// generate-ble-vectors.mjs — OSPP BLE conformance vector generator
// =============================================================================
//
// Produces the BLE handshake corpus for BLE protocol version 0.3.0
// (06-security.md §6.5 – §6.5.4; profiles/offline/ble-handshake.md):
//
//   1. The cross-platform crypto ORACLE:
//        conformance/test-vectors/crypto/ble-handshake-keyschedule.json
//        conformance/test-vectors/crypto/rfc-primitive-anchors.json
//      Seven handshakes (Full Offline, Partial B, the forwards a Partial-B
//      station sends, the examples, a station that holds no catalog): Hello,
//      Challenge with the station's certificate and signature, transcript,
//      key schedule, sessionProof, device proof, AEAD frames, and the
//      AuthorizeOfflinePass forward the server re-checks. Then the negative
//      cases of the app's verification gate and of the device proof, each
//      with a positive control on the same code path.
//   2. The schema fixtures cut from those handshakes:
//        valid/offline/{hello,challenge}-{full,minimal,empty-catalog}.json
//        valid/offline/offline-auth-request-{full,minimal}.json
//        valid/offline/ble-secure-frame-{full,minimal}.json
//        valid/security/authorize-offline-pass-request-{full,minimal}.json
//      and the invalid vectors derived from them, each wrong in exactly the
//      one way its name states.
//   3. The examples of the same messages:
//        examples/payloads/ble/{hello,challenge,offline-auth-request}.json
//        examples/payloads/mqtt/authorize-offline-pass.request.json
//
// DETERMINISTIC: re-running produces byte-identical output (ephemeral keys and
// nonces derived from labels via SHA-256; RFC 6979 deterministic ECDSA with
// low-s; fixed timestamps; the committed test PKI of conformance/test-keys/).
// `git diff` after a re-run is a no-op.
//
// ─── NON-CIRCULAR BY CONSTRUCTION ────────────────────────────────────────────
// Step 0 reproduces the RFC 5903 / 5869 / 8439 test vectors (ble-crypto.mjs
// runRfcAnchors). If a primitive does not reproduce its RFC vector the run
// ABORTS — a wrong primitive can never reach the output. The test PKI is
// cross-checked against `openssl verify` (chain, validity, revocation) before
// any certificate is used, so the JS gate is never the only judge of its own
// verdicts. Only then is the OSPP glue built on top.
//
// Usage:  node tools/generate-ble-vectors.mjs           (from spec repo root)
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { p384 } from '@noble/curves/nist.js';
import { ecdsaSign, ecdsaVerify, SIGNATURE_ALGORITHM } from '@ospp/protocol/server';
import { canonicalForm } from './canonical-form.mjs';
import {
  runRfcAnchors, RFC_ANCHOR_SOURCES, BLE_VERSION,
  SALT_V3, KDF_LABEL_A2S, KDF_LABEL_S2A, SESSION_CONFIRM_LABEL,
  STATION_SIGNATURE_CONTEXT, DEVICE_PROOF_LABEL, OID_OSPP_BLE_STATION,
  sha256, nonce96, wireBytes, ecdhSharedX, deriveKeyPair,
  transcriptHashOf, deriveSessionKeys, sessionProofMessage, sessionProofOf, hmacSha256,
  chachaPolySeal, chachaPolyOpen, isLowS, pemToDer, parseCertificate,
  stationSignedContent, signStationChallenge, stationVerificationGate,
  deviceTestKey, deviceProofInput, deviceProofFormats, syntheticAuthenticatorData,
  makeDeviceProof, verifyDeviceProof,
} from './ble-crypto.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OFFLINE_VALID = `${ROOT}/conformance/test-vectors/valid/offline`;
const OFFLINE_INVALID = `${ROOT}/conformance/test-vectors/invalid/offline`;
const SECURITY_VALID = `${ROOT}/conformance/test-vectors/valid/security`;
const SECURITY_INVALID = `${ROOT}/conformance/test-vectors/invalid/security`;
const CRYPTO_DIR = `${ROOT}/conformance/test-vectors/crypto`;
const EX_BLE = `${ROOT}/examples/payloads/ble`;
const EX_MQTT = `${ROOT}/examples/payloads/mqtt`;
const KEYS = `${ROOT}/conformance/test-keys`;
const rel = (p) => p.slice(ROOT.length + 1);

// The instant every gate and every certificate is evaluated at: the time of the
// worked sessions (2026-02-13). A fixed value, never the clock of the machine
// running this, so the corpus does not expire.
export const EVALUATION_TIME = '2026-02-13T10:00:00.000Z';
const APP_ATTEST_APP_ID = 'OSPPTEST01.org.ospp.app';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));
const writeJson = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
const read = (p) => readFileSync(p, 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
// Step 0 — RFC ANCHOR GATE (external truth before any OSPP value)
// ─────────────────────────────────────────────────────────────────────────────

const anchorReport = runRfcAnchors(); // throws on any RFC mismatch → run aborts
console.log('✓ RFC anchors reproduced (RFC 5903 / 5869 / 8439) — primitives validated');

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — the test PKI, cross-checked against openssl before it is used
// ─────────────────────────────────────────────────────────────────────────────

const PKI = {
  caCert: 'conformance/test-keys/station-ca-test-cert.pem',
  bundleCrl: 'conformance/test-keys/station-ca-test-crl.pem',
  revokingCrl: 'conformance/test-keys/station-ca-test-crl-revoking.pem',
  stationKey: 'conformance/test-keys/station-mtls-test-key.pem',
  stationMtlsCert: 'conformance/test-keys/station-mtls-test-cert.pem',
  noOsppEku: 'conformance/test-keys/station-mtls-test-cert-no-ospp-eku.pem',
  revoked: 'conformance/test-keys/station-mtls-test-cert-revoked.pem',
  expired: 'conformance/test-keys/station-mtls-test-cert-expired.pem',
  noDigitalSignature: 'conformance/test-keys/station-mtls-test-cert-no-digital-signature.pem',
  otherCa: 'conformance/test-keys/station-mtls-test-cert-other-ca.pem',
  p384Cert: 'conformance/test-keys/station-mtls-test-cert-p384.pem',
  p384Key: 'conformance/test-keys/station-mtls-test-p384-key.pem',
  receiptKey: 'conformance/test-keys/station-test-key.pem',
  receiptPub: 'conformance/test-keys/station-test-pub.pem',
};
const pkiText = (k) => read(`${ROOT}/${PKI[k]}`);
const certB64 = (k) => pemToDer(pkiText(k)).toString('base64');

// openssl's verdict on chain + validity + revocation at EVALUATION_TIME, against the CRL
// that revokes serial 0A03 and, for the genuine certificate, the bundle's CRL too — both
// current then. The expected verdicts are fixed here, from how each certificate was made
// (conformance/test-keys/README.md); a disagreement stops the run. The OSPP-specific
// checks (key usage, the OSPP purpose, P-256) are not openssl's to judge and are left to
// the gate, which the negative cases exercise.
function opensslCrossCheck() {
  const at = String(Math.floor(Date.parse(EVALUATION_TIME) / 1000));
  const expect = [
    ['stationMtlsCert', 'bundleCrl', 'OK'],
    ['stationMtlsCert', 'revokingCrl', 'OK'],
    ['noOsppEku', 'revokingCrl', 'OK'],
    ['noDigitalSignature', 'revokingCrl', 'OK'],
    ['p384Cert', 'revokingCrl', 'OK'],
    ['revoked', 'revokingCrl', 'certificate revoked'],
    ['expired', 'revokingCrl', 'certificate has expired'],
    ['otherCa', 'revokingCrl', 'unable to get local issuer certificate'],
  ];
  let checked = 0;
  for (const [k, crl, want] of expect) {
    let out;
    try {
      out = execFileSync('openssl', ['verify', '-attime', at, '-CAfile', `${ROOT}/${PKI.caCert}`, '-crl_check',
        '-CRLfile', `${ROOT}/${PKI[crl]}`, `${ROOT}/${PKI[k]}`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    const ok = want === 'OK' ? /: OK\s*$/.test(out.trim()) : out.includes(want);
    if (!ok) throw new Error(`openssl cross-check: ${PKI[k]} with ${PKI[crl]} expected "${want}", openssl said: ${out.trim()}`);
    checked++;
  }
  return { checked, of: expect.length };
}
const openssl = opensslCrossCheck();
console.log(`✓ test PKI cross-checked against openssl verify (${openssl.checked}/${openssl.of} verdicts)`);

const STATION_ID = parseCertificate(pemToDer(pkiText('stationMtlsCert'))).subjectCN;
if (STATION_ID !== 'stn_a1b2c3d4') throw new Error(`station test certificate names ${STATION_ID}`);

const FORMATS = deviceProofFormats(readJson(`${ROOT}/schemas/common/device-proof.schema.json`));
const SESSION_TEST_KEY = readFileSync(`${KEYS}/session-test-key.bin`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — the handshakes
// ─────────────────────────────────────────────────────────────────────────────

const nonceFor = (label) => sha256(Buffer.from(label, 'utf-8')); // 32-byte deterministic nonce
const shortHex = (label, n) => sha256(Buffer.from(label, 'utf-8')).subarray(0, n).toString('hex');

// The passes come from fixtures that already carry them, signed by the server test key.
const passOf = (path) => {
  const doc = readJson(path);
  return { pass: doc.offlinePass, counter: doc.counter };
};

const SCENARIOS = [
  {
    name: 'full', label: 'FULL', connectivity: 'Offline', proof: 'android', appVersion: '2.5.3',
    source: `${OFFLINE_VALID}/offline-auth-request-full.json`,
    request: { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_basic', requestedDurationSeconds: 300 },
    // Every service the catalog of available-services-full.json binds to each bay.
    availableServices: [
      { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_basic', available: true },
      { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_premium', available: true },
      { bayId: 'bay_f6e5d4c3b2a1', serviceId: 'svc_auxiliary', available: false },
    ],
    session: true,
    fixtures: { hello: `${OFFLINE_VALID}/hello-full.json`, challenge: `${OFFLINE_VALID}/challenge-full.json`, oar: `${OFFLINE_VALID}/offline-auth-request-full.json`, frame: { file: `${OFFLINE_VALID}/ble-secure-frame-full.json`, index: 0 } },
  },
  {
    name: 'minimal', label: 'MINIMAL', connectivity: 'Online', proof: 'apple', appVersion: '1.0.0',
    source: `${OFFLINE_VALID}/offline-auth-request-minimal.json`,
    request: { bayId: 'bay_c1d2e3f4a5b6', serviceId: 'svc_eco', requestedDurationSeconds: 60 },
    availableServices: [{ bayId: 'bay_c1d2e3f4a5b6', serviceId: 'svc_eco', available: true }],
    forward: { file: null },
    fixtures: { hello: `${OFFLINE_VALID}/hello-minimal.json`, challenge: `${OFFLINE_VALID}/challenge-minimal.json`, oar: `${OFFLINE_VALID}/offline-auth-request-minimal.json`, frame: { file: `${OFFLINE_VALID}/ble-secure-frame-minimal.json`, index: 1 } },
  },
  {
    name: 'forward-full', label: 'FORWARD_FULL', connectivity: 'Online', proof: 'android', appVersion: '3.0.1',
    source: `${SECURITY_VALID}/authorize-offline-pass-request-full.json`,
    request: { bayId: 'bay_f9e8d7c6b5a4', serviceId: 'svc_premium', requestedDurationSeconds: 600 },
    availableServices: [
      { bayId: 'bay_f9e8d7c6b5a4', serviceId: 'svc_premium', available: true },
      { bayId: 'bay_f9e8d7c6b5a4', serviceId: 'svc_basic', available: true },
    ],
    forward: { file: `${SECURITY_VALID}/authorize-offline-pass-request-full.json` },
  },
  {
    name: 'forward-minimal', label: 'FORWARD_MINIMAL', connectivity: 'Online', proof: 'apple', appVersion: '3.0.1',
    source: `${SECURITY_VALID}/authorize-offline-pass-request-minimal.json`,
    request: { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_basic', requestedDurationSeconds: 120 },
    availableServices: [{ bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_basic', available: true }],
    forward: { file: `${SECURITY_VALID}/authorize-offline-pass-request-minimal.json` },
  },
  {
    name: 'example', label: 'EXAMPLE', connectivity: 'Offline', proof: 'android', appVersion: '2.1.0',
    source: `${EX_BLE}/offline-auth-request.json`,
    request: { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_eco', requestedDurationSeconds: 300 },
    // Every service the catalog of examples/payloads/ble/available-services.json binds to each bay.
    availableServices: [
      { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_eco', available: true },
      { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_standard', available: true },
      { bayId: 'bay_f6e5d4c3b2a1', serviceId: 'svc_eco', available: false },
      { bayId: 'bay_f6e5d4c3b2a1', serviceId: 'svc_deluxe', available: false },
    ],
    fixtures: { hello: `${EX_BLE}/hello.json`, challenge: `${EX_BLE}/challenge.json`, oar: `${EX_BLE}/offline-auth-request.json` },
  },
  {
    name: 'example-partial-b', label: 'EXAMPLE_PARTIAL_B', connectivity: 'Online', proof: 'android', appVersion: '2.1.0',
    source: `${EX_MQTT}/authorize-offline-pass.request.json`,
    request: { bayId: 'bay_a1b2c3d4', serviceId: 'svc_eco', requestedDurationSeconds: 300 },
    availableServices: [{ bayId: 'bay_a1b2c3d4', serviceId: 'svc_eco', available: true }],
    forward: { file: `${EX_MQTT}/authorize-offline-pass.request.json` },
  },
  {
    name: 'empty-catalog', label: 'EMPTY_CATALOG', connectivity: 'Offline', appVersion: '2.5.3',
    availableServices: [],
    fixtures: { hello: `${OFFLINE_VALID}/hello-empty-catalog.json`, challenge: `${OFFLINE_VALID}/challenge-empty-catalog.json` },
  },
];

function keyInfo(kp) {
  return {
    label: kp.label,
    privateKeyHex: kp.priv.toString('hex'),
    publicKeyCompressedBase64: kp.pubCompressed.toString('base64'),
    publicKeyUncompressedHex: kp.pubUncompressed.toString('hex'),
  };
}

function buildFrame(direction, keyRef, key, counter, characteristic, transcriptHash, message) {
  const plaintext = wireBytes(message);
  const nonce = nonce96(counter);
  const sealed = chachaPolySeal(key, nonce, plaintext, transcriptHash);
  const frame = { n: counter, ct: sealed.toString('base64') };
  // Self-check: open must round-trip to the exact plaintext under the same key/nonce/AAD.
  const opened = chachaPolyOpen(key, nonce, Buffer.from(frame.ct, 'base64'), transcriptHash);
  if (!opened.equals(plaintext)) throw new Error(`AEAD self-check failed for ${direction} #${counter}`);
  return {
    direction, keyRef, counter, characteristic,
    nonce96Hex: nonce.toString('hex'),
    aad: 'transcriptHash',
    plaintextUtf8: plaintext.toString('utf-8'),
    frame,
  };
}

function deriveScenario(sc) {
  const appEph = deriveKeyPair(`OSPP_BLE_APP_EPH_${sc.label}_V1`);
  const stationEph = deriveKeyPair(`OSPP_BLE_STATION_EPH_${sc.label}_V1`);
  const appNonce = nonceFor(`OSPP_BLE_APP_NONCE_${sc.label}_V1`);
  const stationNonce = nonceFor(`OSPP_BLE_STATION_NONCE_${sc.label}_V1`);

  // Hello and Challenge, in wire key order.
  const hello = {
    type: 'Hello',
    bleVersions: [BLE_VERSION],
    appNonce: appNonce.toString('base64'),
    appVersion: sc.appVersion,
    appEphemeralPubKey: appEph.pubCompressed.toString('base64'),
  };
  const challenge = {
    type: 'Challenge',
    bleVersion: BLE_VERSION,
    stationNonce: stationNonce.toString('base64'),
    stationEphemeralPubKey: stationEph.pubCompressed.toString('base64'),
    stationCertificate: certB64('stationMtlsCert'),
    stationConnectivity: sc.connectivity,
    availableServices: sc.availableServices,
    stationSignature: '',
  };
  const helloWire = wireBytes(hello);
  const signedContent = stationSignedContent(helloWire, challenge);
  challenge.stationSignature = signStationChallenge(pkiText('stationKey'), helloWire, challenge);
  const challengeWire = wireBytes(challenge);
  const transcriptHash = transcriptHashOf(helloWire, challengeWire);

  // The app's gate, before any key or credential.
  const gate = stationVerificationGate({
    challenge, helloBytes: helloWire, caCertPem: pkiText('caCert'), crlPem: pkiText('bundleCrl'), at: EVALUATION_TIME,
  });
  if (!gate.ok) throw new Error(`scenario ${sc.name}: the gate refused the genuine Challenge at step ${gate.step}: ${gate.reason}`);

  // One ECDH, both ends.
  const eeApp = ecdhSharedX(appEph.priv, stationEph.pubUncompressed);
  const eeStation = ecdhSharedX(stationEph.priv, appEph.pubUncompressed);
  if (!eeApp.equals(eeStation)) throw new Error(`scenario ${sc.name}: the two ends derive different ee`);
  const keys = deriveSessionKeys({ ee: eeApp, appNonce, stationNonce, transcriptHash });

  const out = {
    scenario: sc.name,
    stationConnectivity: sc.connectivity,
    keys: { appEphemeral: keyInfo(appEph), stationEphemeral: keyInfo(stationEph) },
    hello: { message: hello, wireBase64: helloWire.toString('base64'), wireByteLength: helloWire.length },
    challenge: {
      message: challenge,
      wireBase64: challengeWire.toString('base64'),
      wireByteLength: challengeWire.length,
      signedContentHex: signedContent.toString('hex'),
      stationSignatureLowS: isLowS(challenge.stationSignature),
    },
    gate: { at: EVALUATION_TIME, ok: true, stationId: gate.stationId },
    transcript: {
      construction: 'SHA-256( U16BE(len(helloWire))‖helloWire ‖ U16BE(len(challengeWire))‖challengeWire )',
      transcriptHashHex: transcriptHash.toString('hex'),
      transcriptHashBase64: transcriptHash.toString('base64'),
    },
    ecdh: {
      eeHex: eeApp.toString('hex'),
      note: 'ee = ECDH(appEphemeralPriv, stationEphemeralPub) = ECDH(stationEphemeralPriv, appEphemeralPub); X-only, 32B, left-padded (Pin 1)',
    },
    keySchedule: {
      ikmHex: keys.ikm.toString('hex'),
      saltUtf8: SALT_V3.toString('utf-8'),
      infoHex: keys.info.toString('hex'),
      infoNote: 'LP(transcriptHash); LP(x)=U16BE(len)‖x (Pin 3)',
      sessionKeyHex: keys.sessionKey.toString('hex'),
      sessionKeyBase64: keys.sessionKey.toString('base64'),
      kAppToStationHex: keys.kAppToStation.toString('hex'),
      kStationToAppHex: keys.kStationToApp.toString('hex'),
      sessionKeyConfirmationBase64: keys.sessionKeyConfirmation,
    },
  };
  const fixtures = { hello, challenge };

  if (!sc.source) return { out, fixtures };

  // The presentation: the pass, its counter, the customer's request, the device proof.
  const { pass, counter } = passOf(sc.source);
  const deviceKey = deviceTestKey(pass.deviceId);
  if (deviceKey.devicePublicKey !== pass.devicePublicKey) {
    throw new Error(`scenario ${sc.name}: the pass's devicePublicKey is not the test device key of ${pass.deviceId}`);
  }
  const proofInput = deviceProofInput({ transcriptHash, stationId: gate.stationId, passId: pass.passId, counter, ...sc.request });
  const authenticatorData = sc.proof === 'apple' ? syntheticAuthenticatorData(APP_ATTEST_APP_ID, 1) : null;
  const deviceProof = makeDeviceProof({ kind: sc.proof, formats: FORMATS, deviceKey, proofInput, authenticatorData });
  const stationCheck = verifyDeviceProof({ deviceProof, devicePublicKey: pass.devicePublicKey, proofInput, formats: FORMATS });
  if (!stationCheck.ok) throw new Error(`scenario ${sc.name}: the device proof does not verify: ${stationCheck.reason}`);

  const sessionProof = sessionProofOf(keys.sessionKey, pass.passId, counter);
  const oar = {
    type: 'OfflineAuthRequest', offlinePass: pass, counter, ...sc.request, sessionProof, deviceProof,
  };
  out.sessionProof = {
    passId: pass.passId,
    counter,
    messageHex: sessionProofMessage(pass.passId, counter).toString('hex'),
    sessionProofBase64: sessionProof,
    note: 'HMAC-SHA256(SessionKey, LP("OfflineAuthRequest")‖LP(passId)‖LP(decimal(counter))) (§6.5.1)',
  };
  out.deviceProof = {
    deviceId: pass.deviceId,
    devicePublicKey: pass.devicePublicKey,
    stationId: gate.stationId,
    request: { passId: pass.passId, counter, ...sc.request },
    proofInputHex: proofInput.toString('hex'),
    ...(sc.proof === 'apple'
      ? { clientDataHashHex: sha256(proofInput).toString('hex'), signedNonceHex: stationCheck.signedBytes.toString('hex') }
      : {}),
    proof: deviceProof,
    signatureLowS: isLowS(deviceProof.signature),
  };
  fixtures.oar = { ...oar, sessionProof: sessionProofOf(SESSION_TEST_KEY, pass.passId, counter) };

  // AEAD frames. Each direction counts its own frames, whichever characteristic carries them.
  const authResponse = { type: 'AuthResponse', result: 'Accepted', sessionKeyConfirmation: keys.sessionKeyConfirmation };
  const frames = [
    buildFrame('app->station', 'kAppToStation', keys.kAppToStation, 0, 'FFF3', transcriptHash, oar),
    buildFrame('station->app', 'kStationToApp', keys.kStationToApp, 0, 'FFF4', transcriptHash, authResponse),
  ];
  if (sc.session) {
    // A Full Offline session to its receipt: start, the ReceiptReady status, the
    // request for the receipt on FFF6 and the station's answer carrying it.
    const sessionId = `sess_${shortHex(`OSPP_BLE_SESSION_ID_${sc.label}_V1`, 8)}`;
    const offlineTxId = `otx_${shortHex(`OSPP_BLE_OFFLINE_TX_ID_${sc.label}_V1`, 8)}`;
    const startReq = { type: 'StartServiceRequest', ...sc.request };
    const startResp = { type: 'StartServiceResponse', result: 'Accepted', sessionId, offlineTxId };
    const status = { bayId: sc.request.bayId, status: 'ReceiptReady', sessionId, elapsedSeconds: sc.request.requestedDurationSeconds, remainingSeconds: 0 };
    const receiptReq = { type: 'ReceiptRequest', sessionId };
    const receipt = signedReceipt({ pass, counter, request: sc.request, offlineTxId });
    const receiptResp = { type: 'ReceiptResponse', result: 'Accepted', receipt };
    frames.push(
      buildFrame('app->station', 'kAppToStation', keys.kAppToStation, 1, 'FFF3', transcriptHash, startReq),
      buildFrame('station->app', 'kStationToApp', keys.kStationToApp, 1, 'FFF4', transcriptHash, startResp),
      buildFrame('station->app', 'kStationToApp', keys.kStationToApp, 2, 'FFF5', transcriptHash, status),
      buildFrame('app->station', 'kAppToStation', keys.kAppToStation, 2, 'FFF6', transcriptHash, receiptReq),
      buildFrame('station->app', 'kStationToApp', keys.kStationToApp, 3, 'FFF6', transcriptHash, receiptResp),
    );
  }
  out.aeadFrames = frames;

  if (sc.forward) {
    // The Partial-B forward: the pass, the request and the proof unchanged, with the
    // handshake's transcriptHash. The server verifies the proof over the identity of
    // the station that forwarded it — its mTLS certificate's subject CN.
    const forward = {
      offlinePassId: pass.passId, offlinePass: pass, counter, ...sc.request, deviceProof,
      transcriptHash: transcriptHash.toString('base64'),
    };
    const serverInput = deviceProofInput({
      transcriptHash: Buffer.from(forward.transcriptHash, 'base64'), stationId: STATION_ID,
      passId: forward.offlinePass.passId, counter: forward.counter,
      bayId: forward.bayId, serviceId: forward.serviceId, requestedDurationSeconds: forward.requestedDurationSeconds,
    });
    const serverCheck = verifyDeviceProof({ deviceProof: forward.deviceProof, devicePublicKey: forward.offlinePass.devicePublicKey, proofInput: serverInput, formats: FORMATS });
    if (!serverCheck.ok) throw new Error(`scenario ${sc.name}: the server cannot verify the forwarded proof: ${serverCheck.reason}`);
    out.forward = { payload: forward, serverCheck: { forwardingStationId: STATION_ID, ok: true } };
    fixtures.forward = forward;
  }
  return { out, fixtures };
}

// A pass-form receipt for the Full Offline session, signed with the station's
// receipt key (06-security.md §6.2) — a key separate from the certificate key.
function signedReceipt({ pass, counter, request, offlineTxId }) {
  const outer = {
    offlineTxId,
    offlinePassId: pass.passId,
    passCounter: counter,
    userId: pass.sub,
    deviceId: pass.deviceId,
    bayId: request.bayId,
    serviceId: request.serviceId,
    startedAt: '2026-02-13T10:00:00.000Z',
    endedAt: '2026-02-13T10:05:00.000Z',
    durationSeconds: request.requestedDurationSeconds,
    creditsCharged: 50,
    txCounter: 1,
  };
  const body = {
    ...outer,
    stationId: STATION_ID,
    bookedDurationSeconds: request.requestedDurationSeconds,
    endReason: 'TimerExpired',
    clockState: 'Synchronized',
  };
  const bytes = Buffer.from(canonicalForm(body), 'utf-8');
  const signature = ecdsaSign(pkiText('receiptKey'), bytes);
  if (!ecdsaVerify(pkiText('receiptPub'), bytes, signature)) throw new Error('receipt self-verify failed');
  return { ...outer, receipt: { data: bytes.toString('base64'), signature, signatureAlgorithm: SIGNATURE_ALGORITHM } };
}

const derived = SCENARIOS.map((sc) => ({ sc, ...deriveScenario(sc) }));
const byName = Object.fromEntries(derived.map((d) => [d.sc.name, d]));
console.log(`✓ derived ${derived.length} handshakes: ${derived.map((d) => d.sc.name).join(', ')}`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — the negative cases, each after a positive control on its code path
// ─────────────────────────────────────────────────────────────────────────────

const full = byName.full;
const minimal = byName.minimal;
const fullHello = full.out.hello.message;
const fullHelloWire = wireBytes(fullHello);

// A Challenge re-signed for a given certificate and key: the station's honest act,
// with whatever certificate the case needs.
function resign(base, { cert = certB64('stationMtlsCert'), signer = 'p256', keyPem = pkiText('stationKey'), helloWire = fullHelloWire, edit = null } = {}) {
  const c = JSON.parse(JSON.stringify(base));
  c.stationCertificate = cert;
  if (edit) edit(c);
  c.stationSignature = '';
  const content = stationSignedContent(helloWire, c);
  if (signer === 'p384') {
    const d = Buffer.from(crypto.createPrivateKey(keyPem).export({ format: 'jwk' }).d, 'base64url');
    c.stationSignature = Buffer.from(p384.sign(content, d, { format: 'der', prehash: true })).toString('base64');
  } else {
    c.stationSignature = ecdsaSign(keyPem, content);
  }
  return c;
}

const genuine = full.out.challenge.message;
const otherHello = { ...fullHello, appVersion: '2.5.4' };
const STATION_CASES = [
  // Positive controls: the code path accepts a genuine Challenge, under each CRL used below.
  { id: 'genuine-bundle-crl', positive: true, what: 'genuine Challenge, the bundle CRL', challenge: genuine, crl: 'bundleCrl' },
  { id: 'genuine-revoking-crl', positive: true, what: 'genuine Challenge, the CRL that revokes another certificate', challenge: genuine, crl: 'revokingCrl' },
  { id: 'genuine-intended-station', positive: true, what: 'genuine Challenge, the intended stationId of a scanned code equal to the certificate', challenge: genuine, crl: 'bundleCrl', intendedStationId: 'stn_a1b2c3d4' },
  // Step 1.
  { id: 'certificate-from-another-ca', step: 1, what: 'the station key, certified by a CA the bundle does not hold', challenge: resign(genuine, { cert: certB64('otherCa') }), crl: 'bundleCrl' },
  { id: 'certificate-expired', step: 1, what: 'a certificate that expired before the handshake', challenge: resign(genuine, { cert: certB64('expired') }), crl: 'bundleCrl' },
  // Step 2.
  { id: 'certificate-revoked', step: 2, what: 'a certificate whose serial the CRL lists', challenge: resign(genuine, { cert: certB64('revoked') }), crl: 'revokingCrl' },
  // Step 3.
  { id: 'certificate-without-ospp-purpose', step: 3, what: 'extended key usage clientAuth only, without id-kp-osppBleStation', challenge: resign(genuine, { cert: certB64('noOsppEku') }), crl: 'bundleCrl' },
  { id: 'certificate-without-digital-signature', step: 3, what: 'key usage keyAgreement, without digitalSignature', challenge: resign(genuine, { cert: certB64('noDigitalSignature') }), crl: 'bundleCrl' },
  { id: 'certificate-p384-key', step: 3, what: 'a P-384 key, signed with it', challenge: resign(genuine, { cert: certB64('p384Cert'), signer: 'p384', keyPem: pkiText('p384Key') }), crl: 'bundleCrl' },
  // Step 4.
  { id: 'certificate-names-another-station', step: 4, what: 'a genuine certificate of another station than the one the code scanned names', challenge: genuine, crl: 'bundleCrl', intendedStationId: 'stn_e5f6a7b8c9d0' },
  // Step 5.
  { id: 'replayed-certificate-signed-by-another-key', step: 5, what: 'a genuine certificate replayed, the Challenge signed by a key that is not its key (the station receipt key)', challenge: resign(genuine, { keyPem: pkiText('receiptKey') }), crl: 'bundleCrl' },
  { id: 'signature-over-another-hello', step: 5, what: 'a genuine signature over a different Hello (appVersion 2.5.4), presented with this one', challenge: resign(genuine, { helloWire: wireBytes(otherHello) }), crl: 'bundleCrl' },
  { id: 'available-services-altered', step: 5, what: 'availableServices altered after signing (bay 2 shown available)', challenge: (() => { const c = JSON.parse(JSON.stringify(genuine)); c.availableServices[2].available = true; return c; })(), crl: 'bundleCrl' },
  { id: 'connectivity-altered', step: 5, what: 'stationConnectivity altered after signing (Offline shown as Online, steering the app to Partial B)', challenge: { ...genuine, stationConnectivity: 'Online' }, crl: 'bundleCrl' },
  { id: 'ble-version-altered', step: 5, what: 'bleVersion altered after signing', challenge: { ...genuine, bleVersion: '0.2.1' }, crl: 'bundleCrl' },
];

const stationCases = STATION_CASES.map((c) => {
  const r = stationVerificationGate({
    challenge: c.challenge, helloBytes: fullHelloWire, caCertPem: pkiText('caCert'), crlPem: pkiText(c.crl),
    at: EVALUATION_TIME, intendedStationId: c.intendedStationId ?? null,
  });
  if (c.positive && !r.ok) throw new Error(`positive control ${c.id} refused at step ${r.step}: ${r.reason}`);
  if (!c.positive && (r.ok || r.step !== c.step)) throw new Error(`negative case ${c.id}: expected refusal at step ${c.step}, got ${r.ok ? 'ACCEPTED' : `step ${r.step} (${r.reason})`}`);
  return {
    id: c.id,
    what: c.what,
    hello: 'scenarios[full].hello',
    crl: PKI[c.crl],
    at: EVALUATION_TIME,
    intendedStationId: c.intendedStationId ?? null,
    challenge: c.challenge,
    expected: c.positive ? { ok: true, stationId: r.stationId } : { ok: false, step: c.step, errorCode: r.errorCode, errorText: r.errorText },
    observedReason: r.ok ? null : r.reason,
  };
});
const positives = stationCases.filter((c) => c.expected.ok).length;
console.log(`✓ station gate: ${positives} positive controls accepted, ${stationCases.length - positives} negative cases refused at their step (of ${stationCases.length})`);

// Device-proof cases: the proof of the 'full' (android) and 'minimal' (apple)
// presentations, verified with one input changed at a time.
const dpBase = (d) => ({
  proof: d.out.deviceProof.proof,
  devicePublicKey: d.out.deviceProof.devicePublicKey,
  input: { transcriptHash: Buffer.from(d.out.transcript.transcriptHashHex, 'hex'), stationId: d.out.deviceProof.stationId, ...d.out.deviceProof.request },
});
const otherDevice = deviceTestKey('device_other_0000');
const DEVICE_CASES = [
  { id: 'android-genuine', positive: true, base: full, what: 'the android-key proof of the full presentation' },
  { id: 'apple-genuine', positive: true, base: minimal, what: 'the apple-appattest proof of the minimal presentation' },
  { id: 'android-other-transcript', base: full, what: 'replayed into another handshake (the minimal transcript)', change: (x) => { x.input.transcriptHash = Buffer.from(minimal.out.transcript.transcriptHashHex, 'hex'); } },
  { id: 'android-other-station', base: full, what: 'presented by a station that learnt it to another station', change: (x) => { x.input.stationId = 'stn_e5f6a7b8c9d0'; } },
  { id: 'android-duration-raised', base: full, what: 'requestedDurationSeconds raised after the proof (300 to 600)', change: (x) => { x.input.requestedDurationSeconds = 600; } },
  { id: 'android-other-device-key', base: full, what: 'signed by another device key over the same input', change: (x) => { x.proof = makeDeviceProof({ kind: 'android', formats: FORMATS, deviceKey: otherDevice, proofInput: deviceProofInput(x.input) }); } },
  { id: 'android-counter-replayed', base: full, what: 'the counter changed (the same proof with counter + 1)', change: (x) => { x.input.counter += 1; } },
  { id: 'apple-other-bay', base: minimal, what: 'bayId changed after the proof', change: (x) => { x.input.bayId = 'bay_f6e5d4c3b2a1'; } },
  { id: 'apple-authenticator-data-altered', base: minimal, what: 'authenticatorData counter altered', change: (x) => { const a = Buffer.from(x.proof.authenticatorData, 'base64'); a[a.length - 1] ^= 0x01; x.proof = { ...x.proof, authenticatorData: a.toString('base64') }; } },
  { id: 'apple-without-authenticator-data', base: minimal, what: 'authenticatorData removed', change: (x) => { const { authenticatorData: _a, ...p } = x.proof; x.proof = p; } },
];
const deviceCases = DEVICE_CASES.map((c) => {
  const x = dpBase(c.base);
  x.proof = JSON.parse(JSON.stringify(x.proof));
  if (c.change) c.change(x);
  const r = verifyDeviceProof({ deviceProof: x.proof, devicePublicKey: x.devicePublicKey, proofInput: deviceProofInput(x.input), formats: FORMATS });
  if (c.positive && !r.ok) throw new Error(`positive control ${c.id} refused: ${r.reason}`);
  if (!c.positive && r.ok) throw new Error(`negative case ${c.id}: the device proof VERIFIED`);
  return {
    id: c.id,
    what: c.what,
    devicePublicKey: x.devicePublicKey,
    input: { ...x.input, transcriptHash: x.input.transcriptHash.toString('hex') },
    proofInputHex: deviceProofInput(x.input).toString('hex'),
    deviceProof: x.proof,
    expected: { ok: !!c.positive },
    observedReason: r.ok ? null : r.reason,
  };
});
const dpPositives = deviceCases.filter((c) => c.expected.ok).length;
console.log(`✓ device proof: ${dpPositives} positive controls verified, ${deviceCases.length - dpPositives} negative cases refused (of ${deviceCases.length})`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — write the oracle and the RFC anchors
// ─────────────────────────────────────────────────────────────────────────────

mkdirSync(CRYPTO_DIR, { recursive: true });

writeJson(`${CRYPTO_DIR}/rfc-primitive-anchors.json`, {
  _comment:
    'External-truth anchors for the OSPP BLE crypto corpus. Each primitive (ECDH P-256, ' +
    'HKDF-SHA256, ChaCha20-Poly1305 IETF) reproduces a PUBLISHED RFC test vector byte-for-byte. ' +
    'This is what makes the conformance corpus non-circular: generate-ble-vectors.mjs and ' +
    'verify-ble-crypto.mjs both reproduce these before trusting any OSPP-specific value. If a ' +
    'primitive ever fails to reproduce its RFC vector, both tools abort. Regenerate: ' +
    'node tools/generate-ble-vectors.mjs ; re-check: node tools/verify-ble-crypto.mjs',
  specRef: `BLE protocol version ${BLE_VERSION}`,
  sources: RFC_ANCHOR_SOURCES,
  anchors: anchorReport,
});

writeJson(`${CRYPTO_DIR}/ble-handshake-keyschedule.json`, {
  _comment:
    `OSPP BLE handshake ORACLE for BLE protocol version ${BLE_VERSION} (the cross-platform golden corpus). ` +
    'Every value is reproducible from the inputs by any conformant implementation; verify-ble-crypto.mjs ' +
    're-derives all of it. hello.wireBase64 / challenge.wireBase64 are the EXACT octets the transcript (Pin 4) ' +
    'hashes — compact JSON, the Challenge with its stationSignature, not OSPP-canonicalised (Pin 4 hashes raw ' +
    'wire bytes; the station signature covers the Hello wire bytes and the OSPP Canonical Form of the Challenge ' +
    'without its signature, 06-security.md §6.5.2). The schema fixtures under conformance/test-vectors/valid/ carry ' +
    'the same messages. Ephemeral private keys are test-only, derived as scalar = SHA-256(label) reduced into ' +
    '[1,n-1]; the station key and certificates are the files named under trust; a device key is derived from its ' +
    'deviceId (conformance/test-keys/README.md). The fixture OfflineAuthRequests carry a sessionProof under the ' +
    'synthetic session key (session-test-key.bin); the frames carry the one under each handshake\'s own SessionKey. ' +
    '*Hex = lowercase hex of raw bytes.',
  specRef: `BLE protocol version ${BLE_VERSION}`,
  specSection: '06-security.md §6.5 (Pins 1-7), §6.5.1, §6.5.2, §6.5.3, §6.5.4; profiles/offline/ble-handshake.md §2-§6',
  evaluationTime: EVALUATION_TIME,
  constants: {
    saltUtf8: SALT_V3.toString('utf-8'),
    kdfLabelAppToStation: KDF_LABEL_A2S.toString('utf-8'),
    kdfLabelStationToApp: KDF_LABEL_S2A.toString('utf-8'),
    sessionKeyConfirmationLabel: SESSION_CONFIRM_LABEL.toString('utf-8'),
    stationSignatureContext: STATION_SIGNATURE_CONTEXT,
    deviceProofLabel: DEVICE_PROOF_LABEL,
    idKpOsppBleStation: OID_OSPP_BLE_STATION,
    deviceProofFormats: FORMATS,
    appAttestAppId: APP_ATTEST_APP_ID,
  },
  trust: {
    stationCaCertificate: PKI.caCert,
    crl: PKI.bundleCrl,
    stationCertificate: PKI.stationMtlsCert,
    stationKey: PKI.stationKey,
    stationId: STATION_ID,
    receiptKey: PKI.receiptPub,
    note: 'The app holds the Station CA certificate and its CRL from its trust bundle; the station presents its mTLS certificate in the Challenge and signs with its key. The receipt is signed with the separate station receipt key.',
  },
  scenarios: derived.map((d) => d.out),
  stationAuthentication: {
    note: 'The app verification gate of 06-security.md §6.5.2, steps 1-6, over the Hello of the full scenario. Positive controls first: a refusal is evidence only when the same path accepts the genuine Challenge.',
    caCertificate: PKI.caCert,
    cases: stationCases,
  },
  deviceProofCases: {
    note: 'The device proof of 06-security.md §6.5.4, verified under the pass devicePublicKey with one input changed at a time. Positive controls first.',
    cases: deviceCases,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — schema fixtures, invalid vectors derived from them, and examples
// ─────────────────────────────────────────────────────────────────────────────

const written = [];
const put = (path, obj) => { writeJson(path, obj); written.push(rel(path)); };

for (const d of derived) {
  const f = d.sc.fixtures;
  if (!f) continue;
  if (f.hello) put(f.hello, d.fixtures.hello);
  if (f.challenge) put(f.challenge, d.fixtures.challenge);
  if (f.oar) put(f.oar, d.fixtures.oar);
  if (f.frame) put(f.frame.file, d.out.aeadFrames[f.frame.index].frame);
}
for (const d of derived) if (d.sc.forward?.file) put(d.sc.forward.file, d.fixtures.forward);

// Invalid vectors: a valid message, wrong in exactly one way.
const without = (o, k) => { const { [k]: _drop, ...rest } = o; return rest; };
const fullOar = full.fixtures.oar;
const fullFwd = byName['forward-full'].fixtures.forward;
const fullChallenge = full.fixtures.challenge;
const INVALID = {
  [`${OFFLINE_INVALID}/hello-missing-required.json`]: without(fullHello, 'bleVersions'),
  [`${OFFLINE_INVALID}/hello-invalid-type.json`]: { ...fullHello, bleVersions: BLE_VERSION },
  [`${OFFLINE_INVALID}/hello-additional-properties.json`]: { ...fullHello, deviceId: 'd7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2' },
  [`${OFFLINE_INVALID}/challenge-missing-required.json`]: without(fullChallenge, 'stationSignature'),
  [`${OFFLINE_INVALID}/challenge-invalid-type.json`]: { ...fullChallenge, availableServices: 'svc_basic' },
  [`${OFFLINE_INVALID}/challenge-invalid-enum.json`]: { ...fullChallenge, stationConnectivity: 'Degraded' },
  [`${OFFLINE_INVALID}/offline-auth-request-missing-required.json`]: without(fullOar, 'deviceProof'),
  [`${OFFLINE_INVALID}/offline-auth-request-invalid-type.json`]: { ...fullOar, requestedDurationSeconds: '300' },
  [`${OFFLINE_INVALID}/offline-auth-request-invalid-device-proof-android-with-authenticator-data.json`]:
    { ...fullOar, deviceProof: { ...fullOar.deviceProof, authenticatorData: minimal.fixtures.oar.deviceProof.authenticatorData } },
  [`${OFFLINE_INVALID}/offline-auth-request-invalid-device-proof-apple-without-authenticator-data.json`]:
    { ...minimal.fixtures.oar, deviceProof: without(minimal.fixtures.oar.deviceProof, 'authenticatorData') },
  [`${OFFLINE_INVALID}/ble-secure-frame-missing-required.json`]: without(full.out.aeadFrames[0].frame, 'ct'),
  [`${OFFLINE_INVALID}/ble-secure-frame-invalid-type.json`]: { ...full.out.aeadFrames[0].frame, n: '0' },
  [`${OFFLINE_INVALID}/ble-secure-frame-additional-properties.json`]: { ...full.out.aeadFrames[0].frame, aad: full.out.transcript.transcriptHashBase64 },
  [`${SECURITY_INVALID}/authorize-offline-pass-request-missing-required.json`]: without(fullFwd, 'transcriptHash'),
  [`${SECURITY_INVALID}/authorize-offline-pass-request-invalid-type.json`]: { ...fullFwd, counter: '3' },
  [`${SECURITY_INVALID}/authorize-offline-pass-request-invalid-pattern.json`]: { ...fullFwd, transcriptHash: full.out.transcript.transcriptHashHex },
  [`${SECURITY_INVALID}/authorize-offline-pass-request-additional-properties.json`]: { ...fullFwd, deviceId: fullFwd.offlinePass.deviceId },
};
for (const [path, obj] of Object.entries(INVALID)) put(path, obj);

console.log(`✓ wrote the oracle, the RFC anchors and ${written.length} fixture files:`);
for (const w of written) console.log(`    ${w}`);
console.log(`\nStation: ${STATION_ID}  (certificate ${PKI.stationMtlsCert})`);
for (const d of derived) console.log(`SessionKey (${d.sc.name}): ${d.out.keySchedule.sessionKeyHex}`);
