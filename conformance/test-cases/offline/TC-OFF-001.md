# TC-OFF-001 — Full Offline BLE Session

> **Status: EXPERIMENTAL artefact.** This case exercises the BLE surface, which is EXPERIMENTAL until its cryptographic construction has passed the review of [Chapter 06, Appendix B](../../../spec/06-security.md#appendix-b--ble-cryptographic-review-checklist) — see [Release status](../../../README.md#ble-is-experimental). Its two blockers are closed ([KNOWN-ISSUES](../../../KNOWN-ISSUES.md#closed--the-ble-surface-was-not-implementable-as-written-two-defects)). It is published for review, not for certification, and **Complete compliance cannot be claimed against this revision**.


## Profile

Offline/BLE Profile

## Purpose

Verify the complete full-offline BLE session lifecycle: BLE scan and discovery, GATT connection, the handshake — BLE version negotiation, the station's certificate and signature verified before any credential, the ephemeral ECDH key agreement — OfflinePass authentication via OfflineAuthRequest with its device proof, service start, real-time service status monitoring via FFF5, service stop, receipt generation and retrieval via FFF6, and graceful BLE disconnect. Verify all BLE connection state transitions (IDLE -> SCANNING -> DISCOVERED -> CONNECTING -> CONNECTED -> HANDSHAKE -> READY -> DISCONNECTED).

## References

- `spec/profiles/offline/ble-transport.md` — the GATT service and its characteristics (§2), advertising (§9), MTU negotiation (§10), fragmentation (§11)
- `spec/profiles/offline/ble-handshake.md` — Hello, Challenge, authentication and AuthResponse; BLE version negotiation (§3)
- **`spec/06-security.md` §6.5 — the NORMATIVE key-derivation construction. `ble-handshake.md` §6 mirrors it for convenience and states that on any discrepancy §6.5 governs; this case follows §6.5.**
- **`spec/06-security.md` §6.5.2 — the station's certificate and signature, and the app verification gate that precedes any credential transmission; §6.5.4 — the device proof.**
- `spec/profiles/offline/ble-session.md` — StartService, ServiceStatus, StopService, the receipt
- `spec/profiles/offline/offline-pass.md` — OfflinePass structure and ECDSA P-256 signature
- `spec/07-errors.md` §5.4 — BLE retry policies
- `spec/07-errors.md` §3.2 — Error codes 2002-2005, 2013 for BLE auth failures; §4.3 — the codes each BLE response carries
- `schemas/common/offline-pass.schema.json`, `schemas/common/device-proof.schema.json`
- `schemas/common/receipt.schema.json`
- **`schemas/ble/hello.schema.json`, `schemas/ble/challenge.schema.json`, `schemas/ble/offline-auth-request.schema.json`, `schemas/ble/auth-response.schema.json`, `schemas/ble/start-service-request.schema.json`, `schemas/ble/receipt-request.schema.json`, `schemas/ble/receipt-response.schema.json` — the messages below are members of these schemas, which are closed (`additionalProperties: false`).**
- **`conformance/test-vectors/crypto/ble-handshake-keyschedule.json` — the golden handshake vector. The fixture Hello and Challenge of Part B are its `full` scenario, also given as `conformance/test-vectors/valid/offline/hello-full.json` and `challenge-full.json`, and its `deviceProof` is the known answer for the request of step 15, so a harness can check its derivation and its verification against a known-good answer rather than only against its own arithmetic. The station certificate it carries is `conformance/test-keys/station-mtls-test-cert.pem`, issued by the test Station CA of `conformance/test-keys/`.**

## Preconditions

1. Station is powered on but MQTT is disconnected (simulating full offline mode).
2. Station BLE radio is active and advertising the OSPP service UUID (`6645FFF0-5AEB-4709-ACD5-02E03C3000F6`).
3. The station holds its mTLS certificate, whose extended key usage carries `clientAuth` and `id-kp-osppBleStation`, and its key ([`06-security.md` §4.4](../../../spec/06-security.md#44-certificate-requirements)).
4. The app (test client) holds the trust bundle of its last pass issuance — the test Station CA certificate and its CRL — and a valid OfflinePass:
   - Signed with ECDSA P-256 by a key of the server key set the station holds (`OfflinePassPublicKey`), named by the pass's `keyId`.
   - `expiresAt` is in the future, the pass is no older than the station's `OfflinePassMaxAge` ([`08-configuration.md` §5](../../../spec/08-configuration.md#5-offline--ble-configuration-keys)), and `revocationEpoch` >= the platform epoch the station holds.
   - `maxUses` > 0, `maxTotalCredits` sufficient for the test session.
   - Names no station and no organization: a pass carries no station or organization scope ([`offline-pass.md` §2.3](../../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)).
   - `devicePublicKey` is the key of the test client's device key, which it uses for the device proof.
5. Station has at least one bay (`bay_a1b2c3d4e5f6`) in `Available` state.
6. Service catalog includes `svc_basic` on `bay_a1b2c3d4e5f6`.
7. The test client BLE stack is initialized and ready to scan.
8. No station limit is reached: the station's `OfflineModeEnabled` is `true`, fewer than `OfflineWindowHours` have elapsed since its last MQTT connection, and it holds fewer than `OfflineTransactionLimit` offline transactions the server has not yet answered `Accepted`, `Duplicate` or `Rejected` ([`offline-pass.md` §2.2](../../../spec/profiles/offline/offline-pass.md#22-constraints-object)).

## Steps

### Part A — BLE Discovery and Connection

1. Start BLE scan on the test client, filtered on the OSPP service UUID. (State: IDLE -> SCANNING)
2. Observe the station advertisement: Flags and the OSPP service UUID in the advertising data, the name `OSPP-{station_id_last6}` and the TX power level in the scan response ([`ble-transport.md` §9](../../../spec/profiles/offline/ble-transport.md#9-advertising-data)).
3. Client discovers the station. (State: SCANNING -> DISCOVERED)
4. Initiate GATT connection. (State: DISCOVERED -> CONNECTING)
5. Wait for GATT connection confirmation. (State: CONNECTING -> CONNECTED)
6. Negotiate MTU (request 247 bytes; confirm negotiated MTU >= 185 bytes).
7. Discover the OSPP GATT service and all 6 characteristics (FFF1-FFF6), each the base UUID with its alias.
8. Read FFF1 (Station Info): verify `stationId`, `stationModel`, `firmwareVersion` and `connectivity: "Offline"`, and that it carries nothing else.
9. Subscribe to FFF2, write `0x01` to it, and verify the station notifies the service catalog, fragmented by [`ble-transport.md` §11](../../../spec/profiles/offline/ble-transport.md#11-fragmentation-protocol), including `svc_basic` on `bay_a1b2c3d4e5f6`. Choose `svc_basic` on `bay_a1b2c3d4e5f6` for 300 seconds.
10. Subscribe to FFF4 (TX Response), FFF5 (Service Status) and FFF6 (Receipt) notifications.

### Part B — Handshake and Authentication

11. Write the Hello of the `full` scenario to FFF3 (TX Request): `bleVersions` listing `"0.3.0"`, a fresh `appNonce`, `appVersion`, and a fresh ephemeral P-256 key in `appEphemeralPubKey` — and nothing that identifies the device or its user. (State: CONNECTED -> HANDSHAKE)
12. Receive the Challenge on FFF4. Verify it carries `bleVersion` `"0.3.0"`, one of the versions offered; `stationNonce`; `stationEphemeralPubKey`; `stationCertificate`; `stationConnectivity: "Offline"`; `availableServices`, with `svc_basic` on `bay_a1b2c3d4e5f6` available; and `stationSignature`.
13. **Verify the station now, before step 15 transmits the OfflinePass** ([`06-security.md` §6.5.2](../../../spec/06-security.md#652-station-authentication--the-stations-certificate)): the certificate chains to the Station CA of the trust bundle, is valid now, and is on no entry of the bundle's CRL; it carries `digitalSignature` and `id-kp-osppBleStation`; its subject CN is the station's `stationId`; and `stationSignature` verifies, under its key, over the content §6.5.2 defines — built from the Hello the client wrote and the Challenge without `stationSignature`. On any failure the app aborts with `2013 BLE_AUTH_FAILED` **and sends no credential**. This is the only thing authenticating the station; a handshake that skips it hands an OfflinePass to whatever answered the advertisement.
14. Derive the session key via HKDF-SHA256 over **one ECDH P-256 operation, between the two ephemeral keys**. The BLE Long-Term Key is **not** an input — it is unobtainable by a mobile app ([ADR-002](../../../adr/ADR-002-ble-handshake-security-architecture.md), [ADR-003](../../../adr/ADR-003-ble-station-authentication-by-certificate.md)):
    - `ee = ECDH(appEphemeralPriv, stationEphemeralPubKey)`
    - IKM: `ee ‖ appNonce ‖ stationNonce` (3 × 32 bytes)
    - Salt: UTF-8 bytes of `"OSPP_BLE_SESSION_V3"`
    - Info: `LP(transcriptHash)`, where `LP(x) = U16BE(len(x)) ‖ x` and `transcriptHash = SHA-256(LP16(helloBytes) ‖ LP16(challengeBytes))` over the raw reassembled wire bytes. The station's identity is bound through `transcriptHash`, which covers the whole Challenge — its certificate and its signature.
    - Output: 32-byte session key
    - Check the result against the `full` scenario of `conformance/test-vectors/crypto/ble-handshake-keyschedule.json`, whose `saltUtf8`, `infoHex` and `sessionKeyHex` are the known-good answer for exactly these inputs.
15. Write OfflineAuthRequest to FFF3, inside the AEAD channel, with the OfflinePass, `counter`, `bayId` `bay_a1b2c3d4e5f6`, `serviceId` `svc_basic`, `requestedDurationSeconds` `300`, the `sessionProof`, and the `deviceProof` — the device key's proof over this handshake's transcript, the station's `stationId`, the pass, the counter and the request ([`06-security.md` §6.5.4](../../../spec/06-security.md#654-device-proof-of-possession)). For the fixture inputs, check the proof input and the proof against the `deviceProof` of the `full` scenario, made over `counter` `7`, `bay_a1b2c3d4e5f6`, `svc_basic` and `300`.
16. Receive AuthResponse notification on FFF4:
    - `type: "AuthResponse"`, `result: "Accepted"`, `sessionKeyConfirmation: "<Base64, 44 chars>"`, and the advisory `durationSeconds` / `creditsAuthorized` where present.
    - **There is no `sessionId` on AuthResponse.** `auth-response.schema.json` is closed and does not carry one; the session identifier is minted at service start and arrives on StartServiceResponse (step 18).
    (State: HANDSHAKE -> READY)

### Part C — Service Delivery

17. Write StartServiceRequest to FFF3 with the bay and the service of the OfflineAuthRequest — the station resolves the program from its own bindings, and no BLE message carries a `programNumber`:
    ```json
    {
      "type": "StartServiceRequest",
      "bayId": "bay_a1b2c3d4e5f6",
      "serviceId": "svc_basic",
      "requestedDurationSeconds": 300
    }
    ```
18. Receive StartServiceResponse on FFF4: `result: "Accepted"`, carrying the `sessionId` the station mints locally for this Full Offline session, and `offlineTxId`. Retain both — steps 20 and 22 need the `sessionId`, and Part D matches the receipt on `offlineTxId`.
19. Observe ServiceStatus notifications on FFF5 (periodic updates):
    - `elapsedSeconds` increasing, `remainingSeconds` decreasing.
    - `meterValues.liquidMl` increasing.
    - `status: "Running"`.
20. After ~30 seconds, write StopServiceRequest to FFF3:
    ```json
    {
      "type": "StopServiceRequest",
      "sessionId": "<session_id>",
      "bayId": "bay_a1b2c3d4e5f6"
    }
    ```
21. Receive StopServiceResponse on FFF4:
    - `result: "Accepted"`, `actualDurationSeconds` > 0, `creditsCharged` > 0.

### Part D — Receipt Retrieval and Disconnect

22. After the `ReceiptReady` notification on FFF5, write a ReceiptRequest naming the session to FFF6, and receive the ReceiptResponse notified on FFF6 with `result: "Accepted"`.
23. Verify the receipt it carries contains:
    - `offlineTxId`, `bayId`, `serviceId`.
    - `startedAt`, `endedAt` (valid ISO 8601, `endedAt > startedAt`).
    - `durationSeconds` matching the StopServiceResponse `actualDurationSeconds`.
    - `creditsCharged` matching the StopServiceResponse.
    - `receipt` (nested object with `data`, `signature`, `signatureAlgorithm`).
    - `txCounter` (monotonic integer).
24. Verify the receipt `signature` by computing ECDSA-P256-SHA256 over the `receipt.data` using the station's receipt-signing public key.
25. Disconnect the BLE connection gracefully. (State: READY -> DISCONNECTED)
26. Verify the station resumes BLE advertising after disconnect.

## Expected Results

1. BLE states transition correctly: IDLE -> SCANNING -> DISCOVERED -> CONNECTING -> CONNECTED -> HANDSHAKE -> READY -> DISCONNECTED.
2. Station advertises the OSPP service UUID, and names itself in its scan response.
3. FFF1 returns valid, unauthenticated station info; FFF2 notifies the service catalog on request.
4. HELLO/CHALLENGE exchange completes within 10 seconds, and the Challenge names a BLE version the Hello offered and carries `stationCertificate`, `stationEphemeralPubKey` and `stationSignature`.
5. The app verifies the certificate against the Station CA and CRL of its trust bundle, and the station's signature, **before** transmitting the OfflinePass.
6. The derived session key equals `sessionKeyHex` in the `full` scenario of `conformance/test-vectors/crypto/ble-handshake-keyschedule.json` for the fixture inputs in Part B.
7. OfflineAuthRequest with a valid OfflinePass and device proof returns AuthResponse Accepted, carrying `sessionKeyConfirmation` and no `sessionId`.
8. StartServiceRequest is accepted and ServiceStatus notifications are emitted periodically.
9. StopServiceRequest returns Accepted with accurate `actualDurationSeconds` and `creditsCharged`.
10. The receipt the ReceiptResponse carries is complete, correctly signed (ECDSA-P256-SHA256), and includes a valid `txCounter`.
11. Station resumes advertising after BLE disconnect.

## Failure Criteria

1. Station does not advertise the OSPP service UUID.
2. GATT connection fails or MTU negotiation results in MTU < 185 bytes.
3. Hello does not receive a Challenge response within 10 seconds.
4. **The Challenge omits `stationCertificate`, `stationEphemeralPubKey` or `stationSignature`, or names a BLE version the Hello did not offer** — the app then has nothing to authenticate the station with.
5. **The app transmits the OfflinePass without first verifying the certificate and the station's signature**, or transmits it after verification fails instead of aborting with `2013 BLE_AUTH_FAILED`. This is a failure of the test client, and it is the one that loses a credential to an impersonating station.
6. The derived session key does not match the golden vector for the fixture inputs.
7. AuthResponse is Rejected for a valid OfflinePass with a valid device proof.
8. StartServiceResponse is Rejected when bay is Available and OfflinePass is authorized.
9. No ServiceStatus notifications are emitted during the active session.
10. StopServiceResponse `actualDurationSeconds` deviates from real elapsed time by > 3 seconds.
11. Receipt is missing required fields or has an invalid ECDSA signature.
12. `txCounter` is not monotonically increasing relative to the station's last offline transaction.
13. Station does not resume BLE advertising after client disconnects.
