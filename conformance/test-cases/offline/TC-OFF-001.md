# TC-OFF-001 — Full Offline BLE Session

## Profile

Offline/BLE Profile

## Purpose

Verify the complete full-offline BLE session lifecycle: BLE scan and discovery, GATT connection, ECDH-based handshake (HELLO/CHALLENGE), OfflinePass authentication via OfflineAuthRequest, service start, real-time service status monitoring via FFF5, service stop, receipt generation and retrieval via FFF6, and graceful BLE disconnect. Verify all BLE connection state transitions (IDLE -> SCANNING -> DISCOVERED -> CONNECTING -> CONNECTED -> HANDSHAKE -> READY -> DISCONNECTED).

## References

- `spec/profiles/offline/ble-transport.md` — GATT service (UUID 0000FFF0), characteristics FFF1-FFF6, MTU negotiation
- `spec/profiles/offline/ble-handshake.md` — HELLO/CHALLENGE/AUTH sequence, HKDF-SHA256 key derivation
- `spec/profiles/offline/ble-session.md` — START_SERVICE, SERVICE_STATUS, STOP_SERVICE, Receipt
- `spec/profiles/offline/offline-pass.md` — OfflinePass structure and ECDSA P-256 signature
- `spec/07-errors.md` §5.4 — BLE retry policies
- `spec/07-errors.md` §3.2 — Error codes 2002-2006, 2013 for BLE auth failures
- `schemas/common/offline-pass.schema.json`
- `schemas/common/receipt.schema.json`

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

11. Write Hello to FFF3 (TX Request):
    ```json
    {
      "type": "Hello",
      "deviceId": "<test client device ID>",
      "appVersion": "1.2.0",
      "appNonce": "<32-byte random hex>"
    }
    ```
    (State: CONNECTED -> HANDSHAKE)
12. Receive Challenge notification on FFF4:
    ```json
    {
      "type": "Challenge",
      "stationNonce": "<32-byte random hex>",
      "stationConnectivity": "Offline"
    }
    ```
13. Derive session key via HKDF-SHA256:
    - IKM: `LTK || appNonce || stationNonce`
    - Salt: `"OSPP_BLE_SESSION_V1"`
    - Info: `deviceId || stationId`
    - Output: 32-byte session key
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
    - `type: "AuthResponse"`, `result: "Accepted"`, `sessionId: "<local_session_id>"`.
    (State: HANDSHAKE -> READY)

### Part C — Service Delivery

16. Write StartServiceRequest to FFF3:
    ```json
    {
      "type": "StartServiceRequest",
      "serviceId": "svc_basic",
      "bayId": "bay_a1b2c3d4",
      "requestedDurationSeconds": 120
    }
    ```
17. Receive StartServiceResponse on FFF4: `result: "Accepted"`.
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
4. HELLO/CHALLENGE exchange completes within 10 seconds.
5. OfflineAuthRequest with a valid OfflinePass returns AuthResponse Accepted.
6. StartServiceRequest is accepted and SERVICE_STATUS notifications are emitted periodically.
7. StopServiceRequest returns Accepted with accurate `actualDurationSeconds` and `creditsCharged`.
8. Receipt on FFF6 is complete, correctly signed (ECDSA-P256-SHA256), and includes a valid `txCounter`.
9. Station resumes advertising after BLE disconnect.

## Failure Criteria

1. Station does not advertise the OSPP service UUID.
2. GATT connection fails or MTU negotiation results in MTU < 185 bytes.
3. Hello does not receive a Challenge response within 10 seconds.
4. AuthResponse is Rejected for a valid OfflinePass.
5. StartServiceResponse is Rejected when bay is Available and OfflinePass is authorized.
6. No SERVICE_STATUS notifications are emitted during the active session.
7. StopServiceResponse `actualDurationSeconds` deviates from real elapsed time by > 3 seconds.
8. Receipt is missing required fields or has an invalid ECDSA signature.
9. `txCounter` is not monotonically increasing relative to the station's last offline transaction.
10. Station does not resume BLE advertising after client disconnects.
