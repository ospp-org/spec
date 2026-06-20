#!/usr/bin/env node
// =============================================================================
// verify-ble-crypto.mjs — re-derive + check the OSPP BLE crypto oracle
// =============================================================================
//
// The cross-platform proof that the v0.6.0 handshake pins hold. It:
//   1. Reproduces the RFC 5903 / 5869 / 8439 anchors (external truth — the
//      anti-circularity guarantee; shared with the generator via ble-crypto.mjs).
//   2. Re-derives EVERY value in conformance/test-vectors/crypto/
//      ble-handshake-keyschedule.json from its inputs (private keys + wire
//      octets + nonces) and asserts byte-equality with the stored oracle:
//        - transcriptHash (Pin 4), es/ee (Pin 1), IKM/info/SessionKey (Pin 3),
//          directional keys, sessionKeyConfirmation, sessionProof (§6.5.1),
//          and each AEAD frame (Pin 5/6/7) by re-seal AND open.
//   3. Confirms both handshake ends derive the SAME es/ee (the app computes
//      ECDH(appEph, station*); the station computes ECDH(station*, appEph)).
//   4. Verifies the StationIdentity signature under the server key and checks
//      the oracle stays coherent with the schema fixtures (hello/challenge).
//
// Exits non-zero on any mismatch. Designed for CI from the spec repo root.
// =============================================================================

import { readFileSync } from 'node:fs';
import { canonicalize } from '@ospp/protocol';
import { ecdsaVerify } from '@ospp/protocol/server';
import {
  runRfcAnchors,
  sha256, hmacSha256, lp, nonce96,
  ecdhSharedX, hkdf, hkdfExpand,
  chachaPolySeal, chachaPolyOpen, validatePublicKey,
} from './ble-crypto.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ORACLE = `${ROOT}/conformance/test-vectors/crypto/ble-handshake-keyschedule.json`;
const OFFLINE_DIR = `${ROOT}/conformance/test-vectors/valid/offline`;
const SERVER_PUB = `${ROOT}/conformance/test-keys/server-test-pub.pem`;

const SALT_V2 = Buffer.from('OSPP_BLE_SESSION_V2', 'utf-8');
const KDF_LABEL_A2S = Buffer.from('OSPP-BLE-v0.6.0-key-app-to-station', 'utf-8');
const KDF_LABEL_S2A = Buffer.from('OSPP-BLE-v0.6.0-key-station-to-app', 'utf-8');
const SESSION_CONFIRM_LABEL = Buffer.from('AuthResponse_OK', 'utf-8');

let failures = 0;
const fromHex = (h) => Buffer.from(h, 'hex');
const fromB64 = (s) => Buffer.from(s, 'base64');

function check(label, got, expected) {
  const g = Buffer.isBuffer(got) ? got.toString('hex') : String(got);
  const e = Buffer.isBuffer(expected) ? expected.toString('hex') : String(expected);
  if (g === e) {
    console.log(`    ✓ ${label}`);
  } else {
    console.error(`    ✗ ${label}\n        got:      ${g}\n        expected: ${e}`);
    failures++;
  }
}

// ── 1. RFC anchors (external truth) ──────────────────────────────────────────
console.log('═══ RFC primitive anchors (external truth) ═══');
try {
  for (const r of runRfcAnchors()) console.log(`    ✓ ${r.rfc} — ${r.primitive}`);
} catch (e) {
  console.error(`    ✗ RFC anchor failed: ${e.message}`);
  process.exit(1);
}

// ── 2. Load oracle + server key ──────────────────────────────────────────────
const oracle = JSON.parse(readFileSync(ORACLE, 'utf-8'));
const serverPubPem = readFileSync(SERVER_PUB, 'utf-8');

// ── 3. StationIdentity certificate ───────────────────────────────────────────
console.log('\n═══ StationIdentity certificate ═══');
{
  const { signature, signatureAlgorithm, ...body } = oracle.stationIdentity.cert;
  void signatureAlgorithm;
  const canonicalBytes = Buffer.from(canonicalize(body), 'utf-8');
  check('canonical body matches oracle.canonicalBodyUtf8', canonicalBytes.toString('utf-8'), oracle.stationIdentity.canonicalBodyUtf8);
  if (ecdsaVerify(serverPubPem, canonicalBytes, signature)) console.log('    ✓ ECDSA signature verifies under server-test-pub.pem');
  else { console.error('    ✗ ECDSA signature does NOT verify'); failures++; }
}

// ── 3b. Public-key validation (§6.5.2 normative MUST) ─────────────────────────
console.log('\n═══ Public-key validation (§6.5.2: on-curve, compressed SEC1 Pin 2, not identity) ═══');
{
  const wireKeys = [['stationPubKey (cert static ECDH)', oracle.stationIdentity.cert.stationPubKey]];
  for (const sc of oracle.scenarios) {
    wireKeys.push([`appEphemeralPubKey (${sc.scenario})`, sc.hello.message.appEphemeralPubKey]);
    wireKeys.push([`stationEphemeralPubKey (${sc.scenario})`, sc.challenge.message.stationEphemeralPubKey]);
  }
  for (const [name, b64] of wireKeys) {
    try {
      if (!/^[A-Za-z0-9+/]{44}$/.test(b64)) throw new Error('not a 44-char compressed-SEC1 Base64 key (Pin 2)');
      validatePublicKey(b64); // decompress → on-curve → reject identity
      console.log(`    ✓ ${name}`);
    } catch (e) {
      console.error(`    ✗ ${name}: ${e.message}`);
      failures++;
    }
  }
}

// ── 4. Re-derive each scenario ───────────────────────────────────────────────
const keyByLabelRole = {
  full: { app: oracle.keys.appEphemeralFull, station: oracle.keys.stationEphemeralFull },
  minimal: { app: oracle.keys.appEphemeralMinimal, station: oracle.keys.stationEphemeralMinimal },
};
const stationStaticPriv = fromHex(oracle.keys.stationStatic.privateKeyHex);
const stationStaticPubU = fromHex(oracle.keys.stationStatic.publicKeyUncompressedHex);

for (const sc of oracle.scenarios) {
  console.log(`\n═══ Scenario: ${sc.scenario} ═══`);
  const ks = keyByLabelRole[sc.scenario];
  const appPriv = fromHex(ks.app.privateKeyHex);
  const appPubU = fromHex(ks.app.publicKeyUncompressedHex);
  const stationEphPriv = fromHex(ks.station.privateKeyHex);
  const stationEphPubU = fromHex(ks.station.publicKeyUncompressedHex);

  // 4a. Transcript (Pin 4) from the EXACT wire octets.
  const helloWire = fromB64(sc.hello.wireBase64);
  const challengeWire = fromB64(sc.challenge.wireBase64);
  // wire octets must equal compact JSON of the stored message (raw-bytes pin).
  check('helloWire == compact(hello.message)', helloWire.toString('utf-8'), JSON.stringify(sc.hello.message));
  check('challengeWire == compact(challenge.message)', challengeWire.toString('utf-8'), JSON.stringify(sc.challenge.message));
  const transcriptHash = sha256(lp(helloWire), lp(challengeWire));
  check('transcriptHash (Pin 4)', transcriptHash, fromHex(sc.transcript.transcriptHashHex));

  // 4b. ECDH (Pin 1) — and prove BOTH ends agree.
  const esApp = ecdhSharedX(appPriv, stationStaticPubU);      // app side: ECDH(appEph, stationStatic)
  const esStation = ecdhSharedX(stationStaticPriv, appPubU);  // station side: ECDH(stationStatic, appEph)
  check('es (app side, Pin 1)', esApp, fromHex(sc.ecdh.esHex));
  check('es (station side == app side)', esStation, esApp);
  const eeApp = ecdhSharedX(appPriv, stationEphPubU);         // app side: ECDH(appEph, stationEph)
  const eeStation = ecdhSharedX(stationEphPriv, appPubU);     // station side: ECDH(stationEph, appEph)
  check('ee (app side, Pin 1)', eeApp, fromHex(sc.ecdh.eeHex));
  check('ee (station side == app side)', eeStation, eeApp);

  // 4c. Key schedule (Pin 3).
  const appNonce = fromB64(sc.hello.message.appNonce);
  const stationNonce = fromB64(sc.challenge.message.stationNonce);
  const ikm = Buffer.concat([esApp, eeApp, appNonce, stationNonce]);
  check('IKM = es‖ee‖appNonce‖stationNonce (128B)', ikm, fromHex(sc.keySchedule.ikmHex));
  const info = Buffer.concat([lp(Buffer.from(sc.hello.message.deviceId, 'utf-8')), lp(transcriptHash)]);
  check('info = LP(deviceId)‖LP(transcriptHash)', info, fromHex(sc.keySchedule.infoHex));
  const sessionKey = hkdf(SALT_V2, ikm, info, 32);
  check('SessionKey = HKDF-SHA256(...)', sessionKey, fromHex(sc.keySchedule.sessionKeyHex));

  // 4d. Directional keys + confirmations.
  check('k_app_to_station', hkdfExpand(sessionKey, KDF_LABEL_A2S, 32), fromHex(sc.keySchedule.kAppToStationHex));
  check('k_station_to_app', hkdfExpand(sessionKey, KDF_LABEL_S2A, 32), fromHex(sc.keySchedule.kStationToAppHex));
  check('sessionKeyConfirmation', hmacSha256(sessionKey, SESSION_CONFIRM_LABEL).toString('base64'), sc.keySchedule.sessionKeyConfirmationBase64);

  // 4e. sessionProof (§6.5.1).
  const proofMsg = Buffer.concat([lp('OfflineAuthRequest'), lp(sc.sessionProof.passId), lp(String(sc.sessionProof.counter))]);
  check('sessionProof message bytes', proofMsg, fromHex(sc.sessionProof.messageHex));
  check('sessionProof = HMAC(SessionKey, ...)', hmacSha256(sessionKey, proofMsg).toString('base64'), sc.sessionProof.sessionProofBase64);

  // 4f. AEAD frames (Pin 5/6/7) — re-seal AND open.
  const keyRefs = { kAppToStation: hkdfExpand(sessionKey, KDF_LABEL_A2S, 32), kStationToApp: hkdfExpand(sessionKey, KDF_LABEL_S2A, 32) };
  for (const f of sc.aeadFrames) {
    const key = keyRefs[f.keyRef];
    const nonce = nonce96(f.counter);
    check(`AEAD ${f.direction}: nonce96 (Pin 5)`, nonce, fromHex(f.nonce96Hex));
    check(`AEAD ${f.direction}: aad == transcriptHash (Pin 7)`, fromHex(f.aadHex), transcriptHash);
    const pt = Buffer.from(f.plaintextUtf8, 'utf-8');
    const sealed = chachaPolySeal(key, nonce, pt, transcriptHash);
    check(`AEAD ${f.direction}: re-seal ct (Pin 6)`, sealed.toString('base64'), f.frame.ct);
    const opened = chachaPolyOpen(key, nonce, fromB64(f.frame.ct), transcriptHash);
    check(`AEAD ${f.direction}: open == plaintext`, opened.toString('utf-8'), f.plaintextUtf8);
  }
}

// ── 5. Oracle ↔ schema-fixture coherence (no drift) ──────────────────────────
console.log('\n═══ Oracle ↔ schema-fixture coherence ═══');
for (const sc of oracle.scenarios) {
  const helloFile = JSON.parse(readFileSync(`${OFFLINE_DIR}/hello-${sc.scenario}.json`, 'utf-8'));
  const challengeFile = JSON.parse(readFileSync(`${OFFLINE_DIR}/challenge-${sc.scenario}.json`, 'utf-8'));
  check(`hello-${sc.scenario}.json == oracle.hello.message`, canonicalize(helloFile), canonicalize(sc.hello.message));
  check(`challenge-${sc.scenario}.json == oracle.challenge.message`, canonicalize(challengeFile), canonicalize(sc.challenge.message));
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log();
if (failures === 0) {
  console.log('═══ BLE CRYPTO ORACLE: ALL CHECKS GREEN (re-derived from inputs, anchored on RFC) ═══');
  process.exit(0);
} else {
  console.error(`═══ ${failures} CHECK(S) FAILED ═══`);
  process.exit(1);
}
