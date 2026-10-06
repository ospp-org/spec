#!/usr/bin/env node
// =============================================================================
// verify-ble-crypto.mjs — re-derive + check the OSPP BLE crypto oracle
// =============================================================================
//
// The cross-platform proof that the BLE construction of 06-security.md §6.5 –
// §6.5.4 holds in conformance/test-vectors/crypto/ble-handshake-keyschedule.json.
// It:
//   1. Reproduces the RFC 5903 / 5869 / 8439 anchors (external truth — the
//      anti-circularity guarantee; shared with the generator via ble-crypto.mjs).
//   2. Re-derives EVERY value of every handshake from its inputs (ephemeral
//      private keys, nonces, the committed test PKI, the fixture passes) and
//      asserts byte-equality with the stored oracle: the station's signed content
//      and signature (§6.5.2, verified under the certificate key, low-s), the
//      app's verification gate (§6.5.2 steps 1-6), the transcript (Pin 4), ee
//      from BOTH ends (Pin 1), IKM / info / SessionKey (Pin 3), directional keys,
//      sessionKeyConfirmation, sessionProof (§6.5.1), the device proof (§6.5.4)
//      as the station verifies it and, for a forward, as the server verifies it
//      over the forwarding station's identity, and each AEAD frame (Pin 5/6/7)
//      by re-seal AND open — and refuses each frame with one bit of its
//      ciphertext flipped.
//   3. Re-runs every negative case of the gate and of the device proof, after
//      the positive controls on the same code path: a refusal counts only where
//      the genuine input is accepted, and each gate refusal must come at the
//      step the case names.
//   4. Checks the oracle stays coherent with the schema fixtures and examples
//      cut from it (hello, challenge, offline-auth-request, ble-secure-frame,
//      authorize-offline-pass-request).
//
// Exits non-zero on any mismatch. Designed for CI from the spec repo root.
// =============================================================================

import { readFileSync } from 'node:fs';
import { canonicalForm } from './canonical-form.mjs';
import { ecdsaVerify } from '@ospp/protocol/server';
import {
  runRfcAnchors, SALT_V3, KDF_LABEL_A2S, KDF_LABEL_S2A, SESSION_CONFIRM_LABEL,
  STATION_SIGNATURE_CONTEXT, DEVICE_PROOF_LABEL,
  sha256, hmacSha256, lp, nonce96, wireBytes, ecdhSharedX, hkdf, hkdfExpand,
  transcriptHashOf, sessionProofMessage, chachaPolySeal, chachaPolyOpen, validatePublicKey,
  isLowS, stationSignedContent, stationVerificationGate, certificatePublicKey,
  deviceTestKey, deviceProofInput, deviceProofFormats, verifyDeviceProof, catalogDigestOf, catalogCheck,
} from './ble-crypto.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ORACLE = `${ROOT}/conformance/test-vectors/crypto/ble-handshake-keyschedule.json`;
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf-8');
const readJson = (p) => JSON.parse(read(p));

let failures = 0;
let checks = 0;
const fromHex = (h) => Buffer.from(h, 'hex');
const fromB64 = (s) => Buffer.from(s, 'base64');

function check(label, got, expected) {
  checks++;
  const g = Buffer.isBuffer(got) ? got.toString('hex') : String(got);
  const e = Buffer.isBuffer(expected) ? expected.toString('hex') : String(expected);
  if (g === e) {
    console.log(`    ✓ ${label}`);
  } else {
    console.error(`    ✗ ${label}\n        got:      ${g}\n        expected: ${e}`);
    failures++;
  }
}
function assert(label, cond, detail = '') {
  checks++;
  if (cond) console.log(`    ✓ ${label}`);
  else { console.error(`    ✗ ${label}${detail ? `\n        ${detail}` : ''}`); failures++; }
}

// ── 1. RFC anchors (external truth) ──────────────────────────────────────────
console.log('═══ RFC primitive anchors (external truth) ═══');
try {
  for (const r of runRfcAnchors()) console.log(`    ✓ ${r.rfc} — ${r.primitive}`);
} catch (e) {
  console.error(`    ✗ RFC anchor failed: ${e.message}`);
  process.exit(1);
}

// ── 2. Load the oracle and the trust material ────────────────────────────────
const oracle = readJson('conformance/test-vectors/crypto/ble-handshake-keyschedule.json');
const AT = oracle.evaluationTime;
const caCertPem = read(oracle.trust.stationCaCertificate);
const bundleCrlPem = read(oracle.trust.crl);
const FORMATS = deviceProofFormats(readJson('schemas/common/device-proof.schema.json'));
const SESSION_TEST_KEY = readFileSync(`${ROOT}/conformance/test-keys/session-test-key.bin`);

console.log('\n═══ Constants (06-security.md §6.5 – §6.5.4, §4.4) ═══');
check('salt', oracle.constants.saltUtf8, SALT_V3.toString('utf-8'));
check('k_app_to_station label', oracle.constants.kdfLabelAppToStation, KDF_LABEL_A2S.toString('utf-8'));
check('k_station_to_app label', oracle.constants.kdfLabelStationToApp, KDF_LABEL_S2A.toString('utf-8'));
check('station signature context', oracle.constants.stationSignatureContext, STATION_SIGNATURE_CONTEXT);
check('device proof label', oracle.constants.deviceProofLabel, DEVICE_PROOF_LABEL);
check('device proof formats == device-proof.schema.json enum', canonicalForm(oracle.constants.deviceProofFormats), canonicalForm(FORMATS));

const scenarioByName = {};

// ── 3. Re-derive each handshake ──────────────────────────────────────────────
for (const sc of oracle.scenarios) {
  scenarioByName[sc.scenario] = sc;
  console.log(`\n═══ Scenario: ${sc.scenario} (${sc.stationConnectivity}) ═══`);
  const appPriv = fromHex(sc.keys.appEphemeral.privateKeyHex);
  const appPubU = fromHex(sc.keys.appEphemeral.publicKeyUncompressedHex);
  const stationEphPriv = fromHex(sc.keys.stationEphemeral.privateKeyHex);
  const stationEphPubU = fromHex(sc.keys.stationEphemeral.publicKeyUncompressedHex);

  // 3a. Wire bytes are the compact JSON of the stored messages (raw-bytes pin).
  const helloWire = fromB64(sc.hello.wireBase64);
  const challengeWire = fromB64(sc.challenge.wireBase64);
  check('helloWire == compact(hello.message)', helloWire.toString('utf-8'), JSON.stringify(sc.hello.message));
  check('challengeWire == compact(challenge.message)', challengeWire.toString('utf-8'), JSON.stringify(sc.challenge.message));
  check('Hello.appEphemeralPubKey == the app ephemeral key', sc.hello.message.appEphemeralPubKey, p256Compress(appPubU).toString('base64'));
  check('Challenge.stationEphemeralPubKey == the station ephemeral key', sc.challenge.message.stationEphemeralPubKey, p256Compress(stationEphPubU).toString('base64'));
  for (const [name, b64] of [['appEphemeralPubKey', sc.hello.message.appEphemeralPubKey], ['stationEphemeralPubKey', sc.challenge.message.stationEphemeralPubKey]]) {
    try {
      if (!/^[A-Za-z0-9+/]{44}$/.test(b64)) throw new Error('not a 44-char compressed-SEC1 Base64 key (Pin 2)');
      validatePublicKey(b64);
      assert(`${name} is a valid compressed P-256 point (Pin 2)`, true);
    } catch (e) {
      assert(`${name} is a valid compressed P-256 point (Pin 2)`, false, e.message);
    }
  }

  // 3b. The station's signature (§6.5.2) and the app's gate.
  const content = stationSignedContent(helloWire, sc.challenge.message);
  check('station signed content (64 spaces ‖ context ‖ 0x00 ‖ th_sig)', content, fromHex(sc.challenge.signedContentHex));
  const certKeyPem = certificatePublicKey(fromB64(sc.challenge.message.stationCertificate)).export({ type: 'spki', format: 'pem' });
  assert('stationSignature verifies under the certificate key', ecdsaVerify(certKeyPem, content, sc.challenge.message.stationSignature));
  assert('stationSignature is low-s (§6.2 Note 6)', isLowS(sc.challenge.message.stationSignature));
  const gate = stationVerificationGate({ challenge: sc.challenge.message, helloBytes: helloWire, caCertPem, crlPem: bundleCrlPem, at: AT });
  assert(`gate accepts the Challenge at ${AT}`, gate.ok, gate.reason ?? '');
  check('gate stationId (certificate subject CN)', gate.stationId, sc.gate.stationId);
  check('stationId == trust.stationId', gate.stationId, oracle.trust.stationId);

  // 3b'. The catalog the Challenge names (ble-handshake.md §3): its digest re-derived from
  // the catalog's OSPP Canonical Form, and its bay-service pairs those of availableServices.
  check('catalog canonical form', Buffer.from(canonicalForm(sc.catalog.value), 'utf-8'), fromB64(sc.catalog.canonicalFormBase64));
  check('catalogDigest = SHA-256(canonical catalog)', catalogDigestOf(sc.catalog.value), sc.challenge.message.catalogDigest);
  check('catalog digest recorded', sc.catalog.digestBase64, sc.challenge.message.catalogDigest);
  if (sc.catalog.source !== 'inline') check(`catalog = ${sc.catalog.source}`, canonicalForm(readJson(sc.catalog.source)), canonicalForm(sc.catalog.value));
  {
    const pairs = (xs) => xs.map(([b, s]) => `${b}/${s}`).sort().join(',');
    check('catalog pairs = availableServices pairs',
      pairs(sc.catalog.value.bays.flatMap((b) => b.services.map((s) => [b.bayId, s.serviceId]))),
      pairs(sc.challenge.message.availableServices.map((a) => [a.bayId, a.serviceId])));
  }
  assert('catalog check accepts the catalog the station serves', catalogCheck({ challenge: sc.challenge.message, catalog: sc.catalog.value }).ok);

  // 3c. Transcript (Pin 4) over the full wire Challenge.
  const transcriptHash = transcriptHashOf(helloWire, challengeWire);
  check('transcriptHash (Pin 4)', transcriptHash, fromHex(sc.transcript.transcriptHashHex));
  check('transcriptHash Base64', transcriptHash.toString('base64'), sc.transcript.transcriptHashBase64);

  // 3d. ECDH (Pin 1) — and BOTH ends agree.
  const eeApp = ecdhSharedX(appPriv, stationEphPubU);
  const eeStation = ecdhSharedX(stationEphPriv, appPubU);
  check('ee (app side, Pin 1)', eeApp, fromHex(sc.ecdh.eeHex));
  check('ee (station side == app side)', eeStation, eeApp);

  // 3e. Key schedule (Pin 3).
  const appNonce = fromB64(sc.hello.message.appNonce);
  const stationNonce = fromB64(sc.challenge.message.stationNonce);
  const ikm = Buffer.concat([eeApp, appNonce, stationNonce]);
  check('IKM = ee‖appNonce‖stationNonce (96B)', ikm, fromHex(sc.keySchedule.ikmHex));
  check('salt', sc.keySchedule.saltUtf8, SALT_V3.toString('utf-8'));
  const info = lp(transcriptHash);
  check('info = LP(transcriptHash)', info, fromHex(sc.keySchedule.infoHex));
  const sessionKey = hkdf(SALT_V3, ikm, info, 32);
  check('SessionKey = HKDF-SHA256(...)', sessionKey, fromHex(sc.keySchedule.sessionKeyHex));
  const kA2S = hkdfExpand(sessionKey, KDF_LABEL_A2S, 32);
  const kS2A = hkdfExpand(sessionKey, KDF_LABEL_S2A, 32);
  check('k_app_to_station', kA2S, fromHex(sc.keySchedule.kAppToStationHex));
  check('k_station_to_app', kS2A, fromHex(sc.keySchedule.kStationToAppHex));
  check('sessionKeyConfirmation', hmacSha256(sessionKey, SESSION_CONFIRM_LABEL).toString('base64'), sc.keySchedule.sessionKeyConfirmationBase64);

  if (!sc.sessionProof) continue;

  // 3f. sessionProof (§6.5.1).
  const proofMsg = sessionProofMessage(sc.sessionProof.passId, sc.sessionProof.counter);
  check('sessionProof message bytes', proofMsg, fromHex(sc.sessionProof.messageHex));
  check('sessionProof = HMAC(SessionKey, ...)', hmacSha256(sessionKey, proofMsg).toString('base64'), sc.sessionProof.sessionProofBase64);

  // 3g. Device proof (§6.5.4), as the station verifies it.
  const dp = sc.deviceProof;
  const deviceKey = deviceTestKey(dp.deviceId);
  check('devicePublicKey == the test device key of deviceId', deviceKey.devicePublicKey, dp.devicePublicKey);
  const proofInput = deviceProofInput({ transcriptHash, stationId: gate.stationId, ...dp.request });
  check('device proof input', proofInput, fromHex(dp.proofInputHex));
  const v = verifyDeviceProof({ deviceProof: dp.proof, devicePublicKey: dp.devicePublicKey, proofInput, formats: FORMATS });
  assert(`device proof (${dp.proof.format}) verifies under devicePublicKey`, v.ok, v.reason ?? '');
  if (dp.proof.format === FORMATS.apple) {
    check('clientDataHash = SHA-256(proof input)', sha256(proofInput), fromHex(dp.clientDataHashHex));
    check('signed nonce = SHA-256(authenticatorData ‖ clientDataHash)', sha256(fromB64(dp.proof.authenticatorData), sha256(proofInput)), fromHex(dp.signedNonceHex));
  }
  assert('device proof signature is low-s', isLowS(dp.proof.signature));

  // 3h. AEAD frames (Pin 5/6/7) — re-seal, open, and refuse a flipped bit.
  const keyRefs = { kAppToStation: kA2S, kStationToApp: kS2A };
  const next = { 'app->station': 0, 'station->app': 0 };
  for (const f of sc.aeadFrames) {
    const tag = `AEAD ${f.direction} #${f.counter} (${f.characteristic})`;
    check(`${tag}: counter is the next of its direction (Pin 5)`, f.counter, next[f.direction]);
    next[f.direction]++;
    const key = keyRefs[f.keyRef];
    const nonce = nonce96(f.counter);
    check(`${tag}: nonce96`, nonce, fromHex(f.nonce96Hex));
    check(`${tag}: frame.n == counter`, f.frame.n, f.counter);
    const pt = Buffer.from(f.plaintextUtf8, 'utf-8');
    const sealed = chachaPolySeal(key, nonce, pt, transcriptHash);
    check(`${tag}: re-seal ct (Pin 6, AAD = transcriptHash)`, sealed.toString('base64'), f.frame.ct);
    let opened = null;
    try { opened = chachaPolyOpen(key, nonce, fromB64(f.frame.ct), transcriptHash).toString('utf-8'); } catch (e) { opened = `(refused: ${e.message})`; }
    check(`${tag}: open == plaintext`, opened, f.plaintextUtf8);
    const flipped = fromB64(f.frame.ct);
    flipped[flipped.length - 1] ^= 0x01;
    let refused = false;
    try { chachaPolyOpen(key, nonce, flipped, transcriptHash); } catch { refused = true; }
    assert(`${tag}: one flipped tag bit is refused`, refused);
  }
  // The first app→station frame is this presentation, with the derived sessionProof.
  const first = JSON.parse(sc.aeadFrames[0].plaintextUtf8);
  check('frame #0 carries the sessionProof under this SessionKey', first.sessionProof, sc.sessionProof.sessionProofBase64);
  check('frame #0 carries this device proof', canonicalForm(first.deviceProof), canonicalForm(dp.proof));

  // 3i. Partial-B forward: the server re-verifies over the forwarding station's identity.
  if (sc.forward) {
    const f = sc.forward.payload;
    check('forward transcriptHash == the handshake transcript', f.transcriptHash, transcriptHash.toString('base64'));
    check('forward carries the proof unchanged', canonicalForm(f.deviceProof), canonicalForm(dp.proof));
    const serverInput = deviceProofInput({
      transcriptHash: fromB64(f.transcriptHash), stationId: sc.forward.serverCheck.forwardingStationId,
      passId: f.offlinePass.passId, counter: f.counter, bayId: f.bayId, serviceId: f.serviceId,
      requestedDurationSeconds: f.requestedDurationSeconds,
    });
    const sv = verifyDeviceProof({ deviceProof: f.deviceProof, devicePublicKey: f.offlinePass.devicePublicKey, proofInput: serverInput, formats: FORMATS });
    assert('server check #4: the forwarded proof verifies', sv.ok, sv.reason ?? '');
  }
}

// p256 compression without @noble import here: the station/app keys in the oracle
// carry their uncompressed form; compress = prefix by the parity of y.
function p256Compress(u) {
  return Buffer.concat([Buffer.from([u[64] & 1 ? 0x03 : 0x02]), u.subarray(1, 33)]);
}

// ── 4. The gate's negative cases ─────────────────────────────────────────────
console.log('\n═══ Station authentication — the app verification gate (§6.5.2) ═══');
{
  const helloWire = fromB64(scenarioByName.full.hello.wireBase64);
  const cases = oracle.stationAuthentication.cases;
  const pos = cases.filter((c) => c.expected.ok);
  const neg = cases.filter((c) => !c.expected.ok);
  assert(`at least one positive control precedes the negatives (${pos.length} of ${cases.length})`, pos.length >= 1);
  let posOk = 0;
  const setOf = (c) => (c.stationCas ? c.stationCas.map((e) => ({ caCertPem: read(e.certificate), crlPem: read(e.crl) })) : null);
  for (const c of pos) {
    const r = stationVerificationGate({ challenge: c.challenge, helloBytes: helloWire, caCertPem, crlPem: c.crl ? read(c.crl) : null, stationCas: setOf(c), at: c.at, intendedStationId: c.intendedStationId });
    assert(`positive control ${c.id}: accepted`, r.ok, r.reason ?? '');
    if (r.ok) posOk++;
  }
  if (posOk !== pos.length) {
    console.error('    ✗ a positive control was refused — the negative results below would prove nothing; stopping this section');
    failures++;
  } else {
    let refused = 0;
    for (const c of neg) {
      const r = stationVerificationGate({ challenge: c.challenge, helloBytes: helloWire, caCertPem, crlPem: c.crl ? read(c.crl) : null, stationCas: setOf(c), at: c.at, intendedStationId: c.intendedStationId });
      const ok = !r.ok && r.step === c.expected.step && r.errorCode === c.expected.errorCode;
      assert(`negative ${c.id}: refused at step ${c.expected.step} with ${c.expected.errorCode}`, ok, r.ok ? 'ACCEPTED' : `step ${r.step}: ${r.reason}`);
      if (ok) refused++;
    }
    console.log(`    ${refused}/${neg.length} negative cases refused at their step, after ${posOk}/${pos.length} positive controls`);
  }
}

// ── 4b. The catalog check's cases ───────────────────────────────────────────
console.log('\n═══ The catalog check (ble-handshake.md §3) ═══');
{
  const challenge = scenarioByName.full.challenge.message;
  const cases = oracle.catalogCases.cases;
  const pos = cases.filter((c) => c.expected.ok);
  const neg = cases.filter((c) => !c.expected.ok);
  assert(`at least one positive control precedes the negatives (${pos.length} of ${cases.length})`, pos.length >= 1);
  let posOk = 0;
  for (const c of pos) {
    check(`${c.id}: digest re-derived`, catalogDigestOf(c.catalog), c.digestBase64);
    const r = catalogCheck({ challenge, catalog: c.catalog });
    assert(`positive control ${c.id}: accepted`, r.ok, r.reason ?? '');
    if (r.ok) posOk++;
  }
  if (posOk !== pos.length) {
    console.error('    ✗ a positive control was refused — the negative results below would prove nothing; stopping this section');
    failures++;
  } else {
    let refused = 0;
    for (const c of neg) {
      check(`${c.id}: digest re-derived`, catalogDigestOf(c.catalog), c.digestBase64);
      const r = catalogCheck({ challenge, catalog: c.catalog });
      assert(`negative ${c.id}: refused`, !r.ok, 'ACCEPTED');
      if (!r.ok) refused++;
    }
    console.log(`    ${refused}/${neg.length} altered catalogs refused, after ${posOk}/${pos.length} positive controls`);
  }
}

// ── 5. The device proof's negative cases ─────────────────────────────────────
console.log('\n═══ Device proof (§6.5.4) ═══');
{
  const cases = oracle.deviceProofCases.cases;
  const run = (c) => {
    const input = { ...c.input, transcriptHash: fromHex(c.input.transcriptHash) };
    const pi = deviceProofInput(input);
    checks++;
    if (!pi.equals(fromHex(c.proofInputHex))) { console.error(`    ✗ ${c.id}: proof input does not re-derive`); failures++; }
    return verifyDeviceProof({ deviceProof: c.deviceProof, devicePublicKey: c.devicePublicKey, proofInput: pi, formats: FORMATS });
  };
  const pos = cases.filter((c) => c.expected.ok);
  const neg = cases.filter((c) => !c.expected.ok);
  const formatsCovered = new Set(pos.map((c) => c.deviceProof.format));
  assert(`positive controls cover both formats (${[...formatsCovered].join(', ')})`, formatsCovered.has(FORMATS.android) && formatsCovered.has(FORMATS.apple));
  let posOk = 0;
  for (const c of pos) { const r = run(c); assert(`positive control ${c.id}: verifies`, r.ok, r.reason ?? ''); if (r.ok) posOk++; }
  if (posOk !== pos.length) {
    console.error('    ✗ a positive control was refused — stopping this section');
    failures++;
  } else {
    let refused = 0;
    for (const c of neg) { const r = run(c); assert(`negative ${c.id}: refused`, !r.ok, r.ok ? 'VERIFIED' : ''); if (!r.ok) refused++; }
    console.log(`    ${refused}/${neg.length} negative cases refused, after ${posOk}/${pos.length} positive controls`);
  }
}

// ── 6. Oracle ↔ fixture coherence (no drift) ─────────────────────────────────
console.log('\n═══ Oracle ↔ fixtures and examples ═══');
{
  const same = (label, file, obj) => check(label, canonicalForm(readJson(file)), canonicalForm(obj));
  const sc = scenarioByName;
  for (const name of ['full', 'minimal', 'empty-catalog']) {
    same(`hello-${name}.json == oracle`, `conformance/test-vectors/valid/offline/hello-${name}.json`, sc[name].hello.message);
    same(`challenge-${name}.json == oracle`, `conformance/test-vectors/valid/offline/challenge-${name}.json`, sc[name].challenge.message);
  }
  same('examples hello.json == oracle example', 'examples/payloads/ble/hello.json', sc.example.hello.message);
  same('examples challenge.json == oracle example', 'examples/payloads/ble/challenge.json', sc.example.challenge.message);
  const oarFixture = (name, file) => {
    const doc = readJson(file);
    const inner = JSON.parse(sc[name].aeadFrames[0].plaintextUtf8);
    check(`${file}: members other than sessionProof == the presented message`, canonicalForm({ ...doc, sessionProof: null }), canonicalForm({ ...inner, sessionProof: null }));
    check(`${file}: sessionProof under the synthetic session key`, doc.sessionProof, hmacSha256(SESSION_TEST_KEY, sessionProofMessage(doc.offlinePass.passId, doc.counter)).toString('base64'));
  };
  oarFixture('full', 'conformance/test-vectors/valid/offline/offline-auth-request-full.json');
  oarFixture('minimal', 'conformance/test-vectors/valid/offline/offline-auth-request-minimal.json');
  oarFixture('example', 'examples/payloads/ble/offline-auth-request.json');
  same('ble-secure-frame-full.json == full frame #0', 'conformance/test-vectors/valid/offline/ble-secure-frame-full.json', sc.full.aeadFrames[0].frame);
  same('ble-secure-frame-minimal.json == minimal frame #1', 'conformance/test-vectors/valid/offline/ble-secure-frame-minimal.json', sc.minimal.aeadFrames[1].frame);
  same('authorize-offline-pass-request-full.json == forward-full', 'conformance/test-vectors/valid/security/authorize-offline-pass-request-full.json', sc['forward-full'].forward.payload);
  same('authorize-offline-pass-request-minimal.json == forward-minimal', 'conformance/test-vectors/valid/security/authorize-offline-pass-request-minimal.json', sc['forward-minimal'].forward.payload);
  same('examples authorize-offline-pass.request.json == example-partial-b', 'examples/payloads/mqtt/authorize-offline-pass.request.json', sc['example-partial-b'].forward.payload);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log();
if (failures === 0) {
  console.log(`═══ BLE CRYPTO ORACLE: ALL ${checks} CHECKS GREEN across ${oracle.scenarios.length} handshakes (re-derived from inputs, anchored on RFC) ═══`);
  process.exit(0);
} else {
  console.error(`═══ ${failures} of ${checks} CHECK(S) FAILED ═══`);
  process.exit(1);
}
