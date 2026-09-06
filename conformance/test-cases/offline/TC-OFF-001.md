# TC-OFF-001 — Full Offline BLE Session

> **Status: EXPERIMENTAL artefact.** This case exercises the BLE surface, which is EXPERIMENTAL in 0.33 and carries three blockers — see [Release status](../../../README.md#ble-is-experimental) and [KNOWN-ISSUES](../../../KNOWN-ISSUES.md#blocker--the-ble-surface-is-not-implementable-as-written-three-defects). It is published for review, not for certification, and **Extended and Complete compliance cannot be claimed against 0.33**.


## Profile

Offline/BLE Profile

## Purpose

Verify the complete full-offline BLE session lifecycle: BLE scan and discovery, GATT connection, ECDH-based handshake (HELLO/CHALLENGE), OfflinePass authentication via OfflineAuthRequest, service start, real-time service status monitoring via FFF5, service stop, receipt generation and retrieval via FFF6, and graceful BLE disconnect. Verify all BLE connection state transitions (IDLE -> SCANNING -> DISCOVERED -> CONNECTING -> CONNECTED -> HANDSHAKE -> READY -> DISCONNECTED).

## References

- `spec/profiles/offline/ble-transport.md` — GATT service (UUID 0000FFF0), characteristics FFF1-FFF6, MTU negotiation
- `spec/profiles/offline/ble-handshake.md` — HELLO/CHALLENGE/AUTH sequence, HKDF-SHA256 key derivation
- **`spec/06-security.md` §6.5 — the NORMATIVE key-derivation construction. `ble-handshake.md` §6 mirrors it for convenience and states that on any discrepancy §6.5 governs; this case follows §6.5.**
- **`spec/06-security.md` §6.5.2 — StationIdentity certificate, and the app verification gate that precedes any credential transmission.**
- `spec/profiles/offline/ble-session.md` — START_SERVICE, SERVICE_STATUS, STOP_SERVICE, Receipt
- `spec/profiles/offline/offline-pass.md` — OfflinePass structure and ECDSA P-256 signature
- `spec/07-errors.md` §5.4 — BLE retry policies
- `spec/07-errors.md` §3.2 — Error codes 2002-2006, 2013 for BLE auth failures
- `schemas/common/offline-pass.schema.json`
- `schemas/common/receipt.schema.json`
- **`schemas/ble/hello.schema.json`, `schemas/ble/challenge.schema.json`, `schemas/ble/auth-response.schema.json`, `schemas/ble/start-service-request.schema.json` — the fixtures below are members of these schemas, which are closed (`additionalProperties: false`).**
- **`conformance/test-vectors/crypto/ble-handshake-keyschedule.json` — the golden key-schedule vector. The fixture values in Part B are taken from its `full` scenario, so a harness can check its derivation against a known-good answer rather than only against its own arithmetic.**

## Preconditions

1. Station is powered on but MQTT is disconnected (simulating full offline mode).
2. Station BLE radio is active and advertising the OSPP service UUID (0000FFF0).
3. The app (test client) has a valid OfflinePass:
   - Signed with ECDSA P-256 by the server.
   - `expiresAt` is in the future, `revocationEpoch` >= station's stored epoch.
   - `maxUses` > 0, `maxTotalCredits` sufficient for the test session.
   - Station-scoping constraint includes the test station.
   - `deviceId` matches the test client device.
4. Station has at least one bay (`bay_a1b2c3d4`) in `Available` state.
5. Service catalog includes `svc_basic` on `bay_a1b2c3d4`.
6. The test client BLE stack is initialized and ready to scan.

## Steps

### Part A — BLE Discovery and Connection

1. Start BLE scan on the test client. (State: IDLE -> SCANNING)
2. Observe station advertisement containing the OSPP service UUID and station identifier.
3. Client discovers the station. (State: SCANNING -> DISCOVERED)
4. Initiate GATT connection. (State: DISCOVERED -> CONNECTING)
5. Wait for GATT connection confirmation. (State: CONNECTING -> CONNECTED)
6. Negotiate MTU (request 247 bytes; confirm negotiated MTU >= 185 bytes).
7. Discover the OSPP GATT service (UUID 0000FFF0) and all 6 characteristics (FFF1-FFF6).
8. Read FFF1 (Station Info): verify `stationId`, `firmwareVersion`, `bayCount`, and `connectivity: "Offline"`.
9. Read FFF2 (Available Services): verify the service catalog includes `svc_basic`.
10. Subscribe to FFF4 (TX Response) and FFF5 (Service Status) notifications.

### Part B — Handshake and Authentication

11. Generate a fresh ephemeral P-256 key pair and a 32-byte random nonce, then write Hello to FFF3 (TX Request). `appEphemeralPubKey` is REQUIRED — the handshake is a two-operation ECDH exchange and there is no key agreement without it. Nonces and public keys are Base64 (compressed SEC1 for keys), not hex:
    ```json
    {
      "type": "Hello",
      "deviceId": "d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
      "appNonce": "yxY2RQiyfmbyxGwwd0rO7H5u/O6x3my1LJ8VGicpSZ4=",
      "appVersion": "2.5.3",
      "appEphemeralPubKey": "A/cUFXImC4RNsZ73h9F3OC7NlDkjONgQqYt893+O8ijr"
    }
    ```
    (State: CONNECTED -> HANDSHAKE)
12. Receive Challenge notification on FFF4. It carries the station's StationIdentity certificate and its ephemeral public key, both REQUIRED:
    ```json
    {
      "type": "Challenge",
      "stationNonce": "eoQTd0FoObkoooF6h9mlyyyARv+s9OjTbhyhp2A+nWQ=",
      "stationConnectivity": "Offline",
      "stationCert": {
        "stationId": "stn_b68ec15330c6",
        "organizationId": "org_f10717404764df62",
        "stationPubKey": "A4uNiuL54JiaHTu74LVygnWNTorzDF2U2pBZaW085HD9",
        "issuedAt": "2026-02-13T10:00:00.000Z",
        "expiresAt": "2026-03-15T10:00:00.000Z",
        "signatureAlgorithm": "ECDSA-P256-SHA256",
        "signature": "MEUCIQCnquT+s/g6e11zNBzgR7UhmK4f42FQVrIuTLwQGIZMEgIgTIYCZFRfqmQy9Gv4p9216oxT31UEBF43CiIO/TCTEcU="
      },
      "stationEphemeralPubKey": "A9tT1OlHC4jTuZVY8YkQAd1f7Kr/nKhvnxI+7VQt0HkY"
    }
    ```
    **Verify `stationCert` now, before step 14 transmits the OfflinePass.** The app **MUST** verify its signature against a server signing key in its trusted set and check that it is unexpired ([`ble-handshake.md` §3](../../../spec/profiles/offline/ble-handshake.md), [`06-security.md` §6.5.2](../../../spec/06-security.md#652-stationidentity-certificate)). On failure the app aborts with `2013 BLE_AUTH_FAILED` **and sends no credential**. This is the only thing authenticating the station; a handshake that skips it hands an OfflinePass to whatever answered the advertisement.
13. Derive the session key via HKDF-SHA256 over a **two-operation ECDH P-256 exchange**. The BLE Long-Term Key is **not** an input — it is unobtainable by a mobile app ([ADR-002](../../../adr/ADR-002-ble-handshake-security-architecture.md)):
    - `es = ECDH(appEphemeralPriv, stationCert.stationPubKey)` — the certified static key
    - `ee = ECDH(appEphemeralPriv, stationEphemeralPubKey)` — forward secrecy
    - IKM: `es ‖ ee ‖ appNonce ‖ stationNonce` (4 × 32 bytes)
    - Salt: UTF-8 bytes of `"OSPP_BLE_SESSION_V2"`
    - Info: `LP(deviceId) ‖ LP(transcriptHash)`, where `LP(x) = U16BE(len(x)) ‖ x` and `transcriptHash = SHA-256(LP16(helloBytes) ‖ LP16(challengeBytes))` over the raw reassembled wire bytes. `stationId` is **not** a separate `info` component — it is already bound through `transcriptHash`, which covers the whole Challenge including the certificate that carries the authenticated `stationId`.
    - Output: 32-byte session key
    - Check the result against the `full` scenario of `conformance/test-vectors/crypto/ble-handshake-keyschedule.json`, whose `saltUtf8`, `infoHex` and `sessionKeyHex` are the known-good answer for exactly these inputs.
14. Write OfflineAuthRequest to FFF3:
    ```json
    {
      "type": "OfflineAuthRequest",
      "offlinePass": { "<full OfflinePass object>" },
      "counter": 11,
      "sessionProof": "<HMAC of session key>"
    }
    ```
15. Receive AuthResponse notification on FFF4:
    - `type: "AuthResponse"`, `result: "Accepted"`, `sessionKeyConfirmation: "<Base64, 44 chars>"`, and the authorized envelope `durationSeconds` / `creditsAuthorized`.
    - **There is no `sessionId` on AuthResponse.** `auth-response.schema.json` is closed and does not carry one; the session identifier is minted at service start and arrives on StartServiceResponse (step 17).
    (State: HANDSHAKE -> READY)

### Part C — Service Delivery

16. Write StartServiceRequest to FFF3. `programNumber` is REQUIRED — it names the firmware program the bay runs, and a station that does not hold a service→program binding for `serviceId` rejects with `3017 PROGRAM_NOT_DECLARED`:
    ```json
    {
      "type": "StartServiceRequest",
      "bayId": "bay_a1b2c3d4",
      "serviceId": "svc_basic",
      "programNumber": 1,
      "requestedDurationSeconds": 120
    }
    ```
17. Receive StartServiceResponse on FFF4: `result: "Accepted"`, carrying the `sessionId` the station mints locally for this Full Offline session, and `offlineTxId`. Retain both — step 19 needs the `sessionId` and Part D matches the receipt on `offlineTxId`.
18. Observe SERVICE_STATUS notifications on FFF5 (periodic updates):
    - `elapsedSeconds` increasing, `remainingSeconds` decreasing.
    - `meterValues.liquidMl` increasing.
    - `status: "Running"`.
19. After ~30 seconds, write StopServiceRequest to FFF3:
    ```json
    {
      "type": "StopServiceRequest",
      "sessionId": "<session_id>",
      "bayId": "bay_a1b2c3d4"
    }
    ```
20. Receive StopServiceResponse on FFF4:
    - `result: "Accepted"`, `actualDurationSeconds` > 0, `creditsCharged` > 0.

### Part D — Receipt Retrieval and Disconnect

21. Read FFF6 (Receipt) characteristic.
22. Verify the receipt contains:
    - `offlineTxId`, `bayId`, `serviceId`.
    - `startedAt`, `endedAt` (valid ISO 8601, `endedAt > startedAt`).
    - `durationSeconds` matching the StopServiceResponse `actualDurationSeconds`.
    - `creditsCharged` matching the StopServiceResponse.
    - `receipt` (nested object with `data`, `signature`, `signatureAlgorithm`).
    - `txCounter` (monotonic integer).
23. Verify the receipt `signature` by computing ECDSA-P256-SHA256 over the `receipt.data` using the station's public key.
24. Disconnect the BLE connection gracefully. (State: READY -> DISCONNECTED)
25. Verify the station resumes BLE advertising after disconnect.

## Expected Results

1. BLE states transition correctly: IDLE -> SCANNING -> DISCOVERED -> CONNECTING -> CONNECTED -> HANDSHAKE -> READY -> DISCONNECTED.
2. Station advertises the correct OSPP service UUID and station identifier.
3. FFF1 and FFF2 characteristics return valid station info and service catalog.
4. HELLO/CHALLENGE exchange completes within 10 seconds, and the Challenge carries `stationCert` and `stationEphemeralPubKey`.
5. The app verifies `stationCert` (signature and expiry) **before** transmitting the OfflinePass.
6. The derived session key equals `sessionKeyHex` in the `full` scenario of `conformance/test-vectors/crypto/ble-handshake-keyschedule.json` for the fixture inputs in Part B.
7. OfflineAuthRequest with a valid OfflinePass returns AuthResponse Accepted, carrying `sessionKeyConfirmation` and no `sessionId`.
8. StartServiceRequest is accepted and SERVICE_STATUS notifications are emitted periodically.
9. StopServiceRequest returns Accepted with accurate `actualDurationSeconds` and `creditsCharged`.
10. Receipt on FFF6 is complete, correctly signed (ECDSA-P256-SHA256), and includes a valid `txCounter`.
11. Station resumes advertising after BLE disconnect.

## Failure Criteria

1. Station does not advertise the OSPP service UUID.
2. GATT connection fails or MTU negotiation results in MTU < 185 bytes.
3. Hello does not receive a Challenge response within 10 seconds.
4. **The Challenge omits `stationCert` or `stationEphemeralPubKey`** — the app then has nothing to authenticate the station with and no second ECDH operand.
5. **The app transmits the OfflinePass without first verifying `stationCert`**, or transmits it after verification fails instead of aborting with `2013 BLE_AUTH_FAILED`. This is a failure of the test client, and it is the one that loses a credential to an impersonating station.
6. The derived session key does not match the golden vector for the fixture inputs.
7. AuthResponse is Rejected for a valid OfflinePass.
8. StartServiceResponse is Rejected when bay is Available and OfflinePass is authorized.
9. No SERVICE_STATUS notifications are emitted during the active session.
10. StopServiceResponse `actualDurationSeconds` deviates from real elapsed time by > 3 seconds.
11. Receipt is missing required fields or has an invalid ECDSA signature.
12. `txCounter` is not monotonically increasing relative to the station's last offline transaction.
13. Station does not resume BLE advertising after client disconnects.
