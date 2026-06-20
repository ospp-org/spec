#!/usr/bin/env node
// =============================================================================
// generate-ble-vectors.mjs — OSPP BLE v0.6.0 conformance vector generator
// =============================================================================
//
// Produces the BLE handshake conformance corpus for spec v0.6.0:
//   1. The 4 schema fixtures the v0.6.0 schemas made RED (missing the new
//      crypto fields):
//        conformance/test-vectors/valid/offline/hello-{full,minimal}.json
//        conformance/test-vectors/valid/offline/challenge-{full,minimal}.json
//   2. The cross-platform crypto ORACLE (the real proof the 8 pins hold):
//        conformance/test-vectors/crypto/ble-handshake-keyschedule.json
//        conformance/test-vectors/crypto/rfc-primitive-anchors.json
//
// DETERMINISTIC: re-running produces byte-identical output (fixed test keys
// derived from labels via SHA-256; RFC 6979 deterministic ECDSA; fixed
// timestamps). `git diff` after a re-run is a no-op.
//
// ─── NON-CIRCULAR BY CONSTRUCTION ────────────────────────────────────────────
// Step 0 reproduces the RFC 5903 / 5869 / 8439 test vectors (ble-crypto.mjs
// runRfcAnchors). If a primitive does not reproduce its RFC vector the run
// ABORTS — a wrong primitive can never reach the output. Only on a green gate
// is the OSPP glue (cert, key schedule, transcript, AEAD frame) built on top.
//
// Usage:  node tools/generate-ble-vectors.mjs           (from spec repo root)
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { canonicalize } from '@ospp/protocol';
import { ecdsaSign, ecdsaVerify, SIGNATURE_ALGORITHM } from '@ospp/protocol/server';
import {
  runRfcAnchors, RFC_ANCHOR_SOURCES,
  sha256, hmacSha256, lp, nonce96,
  ecdhSharedX, hkdf, hkdfExpand, deriveKeyPair,
  chachaPolySeal, chachaPolyOpen,
} from './ble-crypto.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OFFLINE_DIR = `${ROOT}/conformance/test-vectors/valid/offline`;
const CRYPTO_DIR = `${ROOT}/conformance/test-vectors/crypto`;
const EXAMPLE_BLE_DIR = `${ROOT}/examples/payloads/ble`;
const SERVER_KEY = `${ROOT}/conformance/test-keys/server-test-key.pem`;
const SERVER_PUB = `${ROOT}/conformance/test-keys/server-test-pub.pem`;

// Domain-separation labels for the key schedule (Pin 3) — fixed ASCII constants.
const SALT_V2 = Buffer.from('OSPP_BLE_SESSION_V2', 'utf-8');
const KDF_LABEL_A2S = Buffer.from('OSPP-BLE-v0.6.0-key-app-to-station', 'utf-8');
const KDF_LABEL_S2A = Buffer.from('OSPP-BLE-v0.6.0-key-station-to-app', 'utf-8');
const SESSION_CONFIRM_LABEL = Buffer.from('AuthResponse_OK', 'utf-8');

const writeJson = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
const compactWire = (obj) => Buffer.from(JSON.stringify(obj), 'utf-8'); // realistic BLE wire octets

// ─────────────────────────────────────────────────────────────────────────────
// Step 0 — RFC ANCHOR GATE (external truth before any OSPP value)
// ─────────────────────────────────────────────────────────────────────────────

const anchorReport = runRfcAnchors(); // throws on any RFC mismatch → run aborts
console.log('✓ RFC anchors reproduced (RFC 5903 / 5869 / 8439) — primitives validated\n');

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — deterministic test material
// ─────────────────────────────────────────────────────────────────────────────

const serverKeyPem = readFileSync(SERVER_KEY, 'utf-8');
const serverPubPem = readFileSync(SERVER_PUB, 'utf-8');

// One station, one dedicated static BLE ECDH key pair (≠ the ECDSA receipt key).
const stationStatic = deriveKeyPair('OSPP_BLE_STATION_STATIC_V1');

// Per-handshake ephemerals — distinct for the two scenarios (two real handshakes).
const appEphFull = deriveKeyPair('OSPP_BLE_APP_EPH_FULL_V1');
const stationEphFull = deriveKeyPair('OSPP_BLE_STATION_EPH_FULL_V1');
const appEphMin = deriveKeyPair('OSPP_BLE_APP_EPH_MINIMAL_V1');
const stationEphMin = deriveKeyPair('OSPP_BLE_STATION_EPH_MINIMAL_V1');

const nonceFor = (label) => sha256(Buffer.from(label, 'utf-8')); // 32-byte deterministic nonce
const appNonceFull = nonceFor('OSPP_BLE_APP_NONCE_FULL_V1');
const stationNonceFull = nonceFor('OSPP_BLE_STATION_NONCE_FULL_V1');
const appNonceMin = nonceFor('OSPP_BLE_APP_NONCE_MINIMAL_V1');
const stationNonceMin = nonceFor('OSPP_BLE_STATION_NONCE_MINIMAL_V1');

// Station business identity (deterministic, schema-valid).
const STATION_ID = 'stn_' + sha256(Buffer.from('OSPP_BLE_STATION_ID_V1')).subarray(0, 6).toString('hex');
const ORG_ID = 'org_' + sha256(Buffer.from('OSPP_BLE_ORG_ID_V1')).subarray(0, 8).toString('hex');
const CERT_ISSUED_AT = '2026-02-13T10:00:00.000Z';
const CERT_EXPIRES_AT = '2026-03-15T10:00:00.000Z'; // 30 days — SHOULD be short; rotation covers expiry (§6.5.2)

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — StationIdentity certificate (§6.5.2, Pin 8 canonical, ECDSA P-256)
// ─────────────────────────────────────────────────────────────────────────────

function signStationIdentity() {
  const body = {
    stationId: STATION_ID,
    organizationId: ORG_ID,
    stationPubKey: stationStatic.pubCompressed.toString('base64'), // compressed SEC1, 44 chars (Pin 2)
    issuedAt: CERT_ISSUED_AT,
    expiresAt: CERT_EXPIRES_AT,
  };
  const canonicalBytes = Buffer.from(canonicalize(body), 'utf-8');
  const signature = ecdsaSign(serverKeyPem, canonicalBytes);
  // Self-check: the cert MUST verify under the server signing key before we ship it.
  if (!ecdsaVerify(serverPubPem, canonicalBytes, signature)) {
    throw new Error('StationIdentity self-verify failed — signature does not verify under server-test-pub.pem');
  }
  return {
    ...body,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    signature,
    _canonical: canonicalBytes.toString('utf-8'),
  };
}

const certWithMeta = signStationIdentity();
const { _canonical: certCanonical, ...stationCert } = certWithMeta;

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — per-scenario handshake derivation (key schedule + AEAD + proofs)
// ─────────────────────────────────────────────────────────────────────────────

function deriveScenario(name, { deviceId, appVersion, appEph, stationEph, appNonce, stationNonce, stationConnectivity, availableServices, innerSourceFile }) {
  // 3a. Build the two handshake messages (key order = wire order).
  const helloMsg = {
    type: 'Hello',
    deviceId,
    appNonce: appNonce.toString('base64'),
    appVersion,
    appEphemeralPubKey: appEph.pubCompressed.toString('base64'),
  };
  const challengeMsg = {
    type: 'Challenge',
    stationNonce: stationNonce.toString('base64'),
    stationConnectivity,
    stationCert,
    stationEphemeralPubKey: stationEph.pubCompressed.toString('base64'),
  };
  if (availableServices) challengeMsg.availableServices = availableServices;

  // 3b. Transcript (Pin 4) over the EXACT wire octets (compact JSON, raw bytes).
  const helloWire = compactWire(helloMsg);
  const challengeWire = compactWire(challengeMsg);
  const transcriptHash = sha256(lp(helloWire), lp(challengeWire)); // SHA-256(LP16(hello)‖LP16(challenge))

  // 3c. Two ECDH secrets (Pin 1).
  const es = ecdhSharedX(appEph.priv, stationStatic.pubUncompressed); // authenticates the station
  const ee = ecdhSharedX(appEph.priv, stationEph.pubUncompressed);    // forward secrecy

  // 3d. Key schedule (Pin 3).
  const ikm = Buffer.concat([es, ee, appNonce, stationNonce]); // 4 × 32 = 128 bytes
  const info = Buffer.concat([lp(Buffer.from(deviceId, 'utf-8')), lp(transcriptHash)]);
  const sessionKey = hkdf(SALT_V2, ikm, info, 32);

  // 3e. Directional AEAD sub-keys (HKDF-Expand with SessionKey as PRK).
  const kAppToStation = hkdfExpand(sessionKey, KDF_LABEL_A2S, 32);
  const kStationToApp = hkdfExpand(sessionKey, KDF_LABEL_S2A, 32);

  // 3f. sessionKeyConfirmation = HMAC(SessionKey, "AuthResponse_OK") (§6.5).
  const sessionKeyConfirmation = hmacSha256(sessionKey, SESSION_CONFIRM_LABEL).toString('base64');

  // 3g. sessionProof over LP(type)‖LP(passId)‖LP(decimal(counter)) (§6.5.1 / §4.1).
  const inner = JSON.parse(readFileSync(`${OFFLINE_DIR}/${innerSourceFile}`, 'utf-8'));
  const passId = inner.offlinePass.passId;
  const counter = inner.counter;
  const proofMsg = Buffer.concat([lp('OfflineAuthRequest'), lp(passId), lp(String(counter))]);
  const sessionProof = hmacSha256(sessionKey, proofMsg).toString('base64');

  // 3h. Two AEAD frames (Pin 5/6/7), counter 0 in each direction.
  //   app→station: the real first encrypted message — an OfflineAuthRequest whose
  //                sessionProof is keyed by THIS handshake's SessionKey.
  //   station→app: an AuthResponse carrying the real sessionKeyConfirmation.
  const innerAuthReq = { type: 'OfflineAuthRequest', offlinePass: inner.offlinePass, counter, sessionProof };
  const innerAuthResp = { type: 'AuthResponse', result: 'Accepted', sessionKeyConfirmation };

  const frames = [
    buildFrame('app->station', 'kAppToStation', kAppToStation, 0, transcriptHash, compactWire(innerAuthReq)),
    buildFrame('station->app', 'kStationToApp', kStationToApp, 0, transcriptHash, compactWire(innerAuthResp)),
  ];

  return {
    scenario: name,
    hello: { message: helloMsg, wireBase64: helloWire.toString('base64'), wireByteLength: helloWire.length },
    challenge: { message: challengeMsg, wireBase64: challengeWire.toString('base64'), wireByteLength: challengeWire.length },
    transcript: {
      construction: 'SHA-256( U16BE(len(helloWire))‖helloWire ‖ U16BE(len(challengeWire))‖challengeWire )',
      transcriptHashHex: transcriptHash.toString('hex'),
    },
    ecdh: {
      esHex: es.toString('hex'),
      eeHex: ee.toString('hex'),
      note: 'es = ECDH(appEphemeralPriv, stationStaticPub); ee = ECDH(appEphemeralPriv, stationEphemeralPub); X-only, 32B, left-padded (Pin 1)',
    },
    keySchedule: {
      ikmHex: ikm.toString('hex'),
      saltUtf8: SALT_V2.toString('utf-8'),
      infoHex: info.toString('hex'),
      infoNote: 'LP(deviceId)‖LP(transcriptHash); LP(x)=U16BE(len)‖x (Pin 3)',
      sessionKeyHex: sessionKey.toString('hex'),
      sessionKeyBase64: sessionKey.toString('base64'),
      kAppToStationHex: kAppToStation.toString('hex'),
      kStationToAppHex: kStationToApp.toString('hex'),
      sessionKeyConfirmationBase64: sessionKeyConfirmation,
    },
    sessionProof: {
      passId,
      counter,
      messageHex: proofMsg.toString('hex'),
      sessionProofBase64: sessionProof,
      note: 'HMAC-SHA256(SessionKey, LP("OfflineAuthRequest")‖LP(passId)‖LP(decimal(counter))) (§6.5.1)',
    },
    aeadFrames: frames,
    // The 4 RED schema fixtures are these two messages, written separately.
    _fixtures: { helloMsg, challengeMsg },
  };
}

function buildFrame(direction, keyRef, key, counter, transcriptHash, plaintext) {
  const nonce = nonce96(counter);
  const sealed = chachaPolySeal(key, nonce, plaintext, transcriptHash);
  const frame = { n: counter, ct: sealed.toString('base64') };
  // Self-check: open must round-trip to the exact plaintext under the same key/nonce/AAD.
  const opened = chachaPolyOpen(key, nonce, Buffer.from(frame.ct, 'base64'), transcriptHash);
  if (!opened.equals(plaintext)) throw new Error(`AEAD self-check failed for ${direction}`);
  return {
    direction,
    keyRef,
    counter,
    nonce96Hex: nonce.toString('hex'),
    aad: 'transcriptHash',
    aadHex: transcriptHash.toString('hex'),
    plaintextUtf8: plaintext.toString('utf-8'),
    frame,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — derive both scenarios
// ─────────────────────────────────────────────────────────────────────────────

const full = deriveScenario('full', {
  deviceId: 'd7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
  appVersion: '2.5.3',
  appEph: appEphFull,
  stationEph: stationEphFull,
  appNonce: appNonceFull,
  stationNonce: stationNonceFull,
  stationConnectivity: 'Offline',
  availableServices: [
    { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_basic', available: true },
    { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_premium', available: false },
    { bayId: 'bay_f6e5d4c3b2a1', serviceId: 'svc_auxiliary', available: true },
  ],
  innerSourceFile: 'offline-auth-request-full.json',
});

const minimal = deriveScenario('minimal', {
  deviceId: 'd7e8f9a0b1c2d3e4f5a6b7c8',
  appVersion: '1.0.0',
  appEph: appEphMin,
  stationEph: stationEphMin,
  appNonce: appNonceMin,
  stationNonce: stationNonceMin,
  stationConnectivity: 'Online',
  availableServices: null,
  innerSourceFile: 'offline-auth-request-minimal.json',
});

// Illustrative spec examples (examples/payloads/ble/) — same v0.6.0 schema, own
// sample values. Brings the two examples that were stale vs the v0.6.0 hello/
// challenge schemas (the ONLY two examples failing on CONTENT, per Python
// jsonschema; the other validate-examples.sh "failures" are the absent ajv-cli)
// up to date with real, cert-verifying crypto.
const example = deriveScenario('example', {
  deviceId: 'device_a8f3bc12e4567890',
  appVersion: '2.1.0',
  appEph: deriveKeyPair('OSPP_BLE_APP_EPH_EXAMPLE_V1'),
  stationEph: deriveKeyPair('OSPP_BLE_STATION_EPH_EXAMPLE_V1'),
  appNonce: nonceFor('OSPP_BLE_APP_NONCE_EXAMPLE_V1'),
  stationNonce: nonceFor('OSPP_BLE_STATION_NONCE_EXAMPLE_V1'),
  stationConnectivity: 'Offline',
  availableServices: [
    { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_eco', available: true },
    { bayId: 'bay_a1b2c3d4e5f6', serviceId: 'svc_standard', available: true },
  ],
  innerSourceFile: 'offline-auth-request-full.json',
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — write the 4 RED schema fixtures + the 2 v0.6.0-stale BLE examples
// ─────────────────────────────────────────────────────────────────────────────

writeJson(`${OFFLINE_DIR}/hello-full.json`, full._fixtures.helloMsg);
writeJson(`${OFFLINE_DIR}/hello-minimal.json`, minimal._fixtures.helloMsg);
writeJson(`${OFFLINE_DIR}/challenge-full.json`, full._fixtures.challengeMsg);
writeJson(`${OFFLINE_DIR}/challenge-minimal.json`, minimal._fixtures.challengeMsg);

writeJson(`${EXAMPLE_BLE_DIR}/hello.json`, example._fixtures.helloMsg);
writeJson(`${EXAMPLE_BLE_DIR}/challenge.json`, example._fixtures.challengeMsg);

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — write the crypto oracle + RFC anchors
// ─────────────────────────────────────────────────────────────────────────────

mkdirSync(CRYPTO_DIR, { recursive: true });

writeJson(`${CRYPTO_DIR}/rfc-primitive-anchors.json`, {
  _comment:
    'External-truth anchors for the OSPP BLE v0.6.0 crypto corpus. Each primitive (ECDH P-256, ' +
    'HKDF-SHA256, ChaCha20-Poly1305 IETF) reproduces a PUBLISHED RFC test vector byte-for-byte. ' +
    'This is what makes the conformance corpus non-circular: generate-ble-vectors.mjs and ' +
    'verify-ble-crypto.mjs both reproduce these before trusting any OSPP-specific value. If a ' +
    'primitive ever fails to reproduce its RFC vector, both tools abort. Regenerate: ' +
    'node tools/generate-ble-vectors.mjs ; re-check: node tools/verify-ble-crypto.mjs',
  specRef: 'v0.6.0',
  sources: RFC_ANCHOR_SOURCES,
  anchors: anchorReport,
});

writeJson(`${CRYPTO_DIR}/ble-handshake-keyschedule.json`, {
  _comment:
    'OSPP BLE v0.6.0 handshake key-schedule + AEAD ORACLE (the cross-platform golden corpus). ' +
    'Every value is reproducible from the inputs by any conformant implementation; verify-ble-crypto.mjs ' +
    're-derives all of it. helloWire/challengeWire (Base64) are the EXACT octets the transcript (Pin 4) ' +
    'hashes — compact JSON, NOT the pretty-printed schema fixture, NOT OSPP-canonicalised (Pin 4 hashes ' +
    'raw wire bytes; the schema fixtures conformance/test-vectors/valid/offline/{hello,challenge}-*.json ' +
    'carry the SAME logical message for schema validation). Private keys are test-only, derived ' +
    'deterministically as scalar = SHA-256(label) reduced into [1,n-1]. *Hex = lowercase hex of raw bytes.',
  specRef: 'v0.6.0',
  specSection: '06-security.md §6.5 (Pin 1/2/3/4), §6.5.1 (sessionProof), §6.5.3 (Pin 5/6/7 AEAD); ble-handshake.md §4.1',
  serverSigningKey: 'conformance/test-keys/server-test-pub.pem (the SAME key that signs OfflinePasses)',
  stationIdentity: {
    cert: stationCert,
    canonicalBodyUtf8: certCanonical,
    note: 'signature = ECDSA-P256-SHA256 (RFC 6979, low-s) over OSPP Canonical Form of the body (Pin 8); verifies under server-test-pub.pem',
  },
  keys: {
    note: 'P-256. privateKeyHex = raw 32-byte scalar; publicKeyCompressedBase64 = on-wire encoding (compressed SEC1, Pin 2)',
    stationStatic: keyInfo(stationStatic),
    appEphemeralFull: keyInfo(appEphFull),
    stationEphemeralFull: keyInfo(stationEphFull),
    appEphemeralMinimal: keyInfo(appEphMin),
    stationEphemeralMinimal: keyInfo(stationEphMin),
  },
  scenarios: [stripFixtures(full), stripFixtures(minimal)],
});

function keyInfo(kp) {
  return {
    label: kp.label,
    privateKeyHex: kp.priv.toString('hex'),
    publicKeyCompressedBase64: kp.pubCompressed.toString('base64'),
    publicKeyUncompressedHex: kp.pubUncompressed.toString('hex'),
  };
}
function stripFixtures(s) {
  const { _fixtures, ...rest } = s;
  return rest;
}

console.log('✓ wrote 4 schema fixtures:');
console.log('    conformance/test-vectors/valid/offline/hello-{full,minimal}.json');
console.log('    conformance/test-vectors/valid/offline/challenge-{full,minimal}.json');
console.log('✓ wrote crypto oracle:');
console.log('    conformance/test-vectors/crypto/ble-handshake-keyschedule.json');
console.log('    conformance/test-vectors/crypto/rfc-primitive-anchors.json');
console.log(`\nStationIdentity: ${STATION_ID} / ${ORG_ID}`);
console.log(`SessionKey (full):    ${full.keySchedule.sessionKeyHex}`);
console.log(`SessionKey (minimal): ${minimal.keySchedule.sessionKeyHex}`);
