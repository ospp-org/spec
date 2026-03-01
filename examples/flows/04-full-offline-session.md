# Flow 04: Full Offline BLE Session

## Scenario

It is a winter evening in Example City. Heavy snowfall has knocked out the internet at "Station Alpha -- Example City" and Bob's mobile carrier is also down in the area. Bob pulls into bay 1 and wants to use the Eco Program service. He opens the the app, which detects no internet connectivity. The app has a pre-armed OfflinePass (`opass_a8b9c0d1e2f3`) that was refreshed this morning while Bob was on WiFi. The app discovers the station via BLE, connects, reads station info and available services, performs the HELLO/CHALLENGE handshake, authenticates with the OfflinePass (the station validates it locally with all 10 checks), starts "Eco Program" on bay 1, monitors progress via BLE ServiceStatus notifications, and stops after 3 minutes. The station generates a signed receipt with ECDSA P-256 and increments the txCounter. Bob reads the receipt from FFF6 and the app stores it in the offline transaction log for later reconciliation.

## Participants

| Actor | Identity |
|-------|----------|
| User | Bob (`sub_bob2026`), device `device_b7c4de89f0123456` |
| App | the mobile app (React Native / Expo), version 2.1.0 |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp (BLE advertising, MQTT disconnected) |
| Bay | `bay_c1d2e3f4a5b6` (Bay 1) |
| Service | `svc_eco` (Eco Program, 10 credits/min, metered) |

## Pre-conditions

- Bob has a valid OfflinePass `opass_a8b9c0d1e2f3` in the app (issued at 06:00 UTC today, expires tomorrow)
- OfflinePass allowance: 100 credits total, 5 max uses, 30 credits max per transaction
- Bob's OfflinePass counter is at 2 (he has done 2 previous offline sessions)
- Station BLE is advertising as `OSPP-b2c3d4` (last 6 hex chars of station ID)
- Station has the server's ECDSA P-256 verify key in NVS
- Station `OfflineModeEnabled` configuration is `true`
- Station has 7 offline transactions logged (well under the 100-transaction limit)
- Station's `RevocationEpoch` is 42 (matches the pass)
- Station clock is synchronized to within 5 seconds (last synced before internet dropped)
- Neither the phone nor the station has internet connectivity

## Timeline

```
18:32:00.000  Bob opens the app, sees "Offline Mode" banner
18:32:03.000  App starts BLE scan, discovers OSPP-b2c3d4
18:32:04.500  App establishes BLE connection to station
18:32:05.000  App reads FFF1 (StationInfo) — confirms station identity and offline status
18:32:05.500  App reads FFF2 (AvailableServices) — displays service catalog
18:32:12.000  Bob selects Bay 1, Eco Program, 5 min duration
18:32:12.500  App writes Hello to FFF3
18:32:13.000  Station notifies Challenge on FFF4 (stationConnectivity: "Offline")
18:32:13.200  App derives session key via HKDF-SHA256
18:32:14.000  App requests biometric confirmation (Face ID)
18:32:15.000  App writes OfflineAuthRequest to FFF3 with OfflinePass
18:32:15.500  Station performs 10-check OfflinePass validation — all pass
18:32:16.000  Station notifies AuthResponse Accepted on FFF4
18:32:16.500  App writes StartServiceRequest to FFF3
18:32:17.000  Station activates dispenser, notifies StartServiceResponse Accepted on FFF4
18:32:20.000  Station notifies ServiceStatus Running on FFF5 (3s elapsed)
18:33:17.000  Station notifies ServiceStatus Running on FFF5 (60s elapsed)
18:34:17.000  Station notifies ServiceStatus Running on FFF5 (120s elapsed)
18:35:17.000  Station notifies ServiceStatus Running on FFF5 (180s elapsed)
18:35:17.500  Bob taps "Stop service" in the app
18:35:18.000  App writes StopServiceRequest to FFF3
18:35:18.500  Station deactivates dispenser, notifies StopServiceResponse on FFF4
18:35:19.000  Station generates ECDSA-signed receipt, increments txCounter
18:35:19.500  Station notifies ServiceStatus ReceiptReady on FFF5
18:35:20.000  App reads FFF6 (Receipt) — stores in offline transaction log
18:35:20.500  App disconnects BLE
18:35:21.000  App displays session summary to Bob
```

## Step-by-Step Detail

---

### Step 1: Bob Opens the App (18:32:00.000)

**What Bob sees:**

The app opens to the HomeScreen. A yellow banner at the top reads "Offline mode — no connection". Below the banner, the app shows "OfflinePass active" with a green checkmark and the expiration: "Valid until 14 Feb 2026, 06:00". The "Connect BLE" button pulses blue.

---

### Step 2: BLE Discovery (18:32:03.000)

The app starts scanning for BLE devices advertising the OSPP service UUID (`0000FFF0-0000-1000-8000-00805F9B34FB`). It discovers a device named `OSPP-b2c3d4` with RSSI -42 dBm (very close range, as expected at a service bay).

---

### Step 3: BLE Connection Established (18:32:04.500)

The app connects to the station over BLE. The BLE connection state transitions: `SCANNING` -> `DISCOVERED` -> `CONNECTING` -> `CONNECTED`.

---

### Step 4: Read StationInfo from FFF1 (18:32:05.000)

**BLE GATT Read:** Characteristic `0000FFF1-0000-1000-8000-00805F9B34FB`

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "2.4.1",
  "bayCount": 3,
  "bleProtocolVersion": "0.1.0",
  "connectivity": "Offline"
}
```

The app verifies:
- `stationId` matches the expected station from the scan
- `bleProtocolVersion` is compatible (major version 1)
- `connectivity` is `"Offline"` -- confirms the Full Offline flow is needed

The BLE connection state transitions: `CONNECTED` -> `HANDSHAKE`.

---

### Step 5: Read AvailableServices from FFF2 (18:32:05.500)

**BLE GATT Read:** Characteristic `0000FFF2-0000-1000-8000-00805F9B34FB`

```json
{
  "catalogVersion": "2026-02-13-01",
  "bays": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "bayNumber": 1,
      "status": "Available",
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 10,
          "priceLocalPerMinute": 50,
          "available": true
        },
        {
          "serviceId": "svc_standard",
          "serviceName": "Standard Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 8,
          "priceLocalPerMinute": 40,
          "available": true
        }
      ]
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "bayNumber": 2,
      "status": "Available",
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 10,
          "priceLocalPerMinute": 50,
          "available": true
        },
        {
          "serviceId": "svc_standard",
          "serviceName": "Standard Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 8,
          "priceLocalPerMinute": 40,
          "available": true
        }
      ]
    }
  ]
}
```

**What Bob sees:**

The app displays two bay cards. Both show "Available" (Available) in green. Under Bay 1, Bob sees "Eco Program (10 credits/min)" and "Standard Program (8 credits/min)". He taps Bay 1, then selects "Eco Program". A duration picker appears; he sets it to 5 minutes (50 credits). The app shows: "Estimated cost: 50 credits. Estimated offline balance: 72 credits."

---

### Step 6: App Writes Hello to FFF3 (18:32:12.500)

**BLE GATT Write:** Characteristic `0000FFF3-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "Hello",
  "deviceId": "device_b7c4de89f0123456",
  "appNonce": "k7Rz2mPqXvN8dF5sYwB1cA0hJ6tL9oKe3iGnUxMpWbQ=",
  "appVersion": "2.1.0"
}
```

The app generates a cryptographically random 32-byte nonce (`appNonce`) for session key derivation.

---

### Step 7: Station Notifies Challenge on FFF4 (18:32:13.000)

**BLE GATT Notify:** Characteristic `0000FFF4-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "Challenge",
  "stationNonce": "Qm4xR9vTfH2wLpZjK0sNcYgX5uOdA8rE1iBn6CtJkWe=",
  "stationConnectivity": "Offline",
  "availableServices": [
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_standard", "available": true },
    { "bayId": "bay_a2b3c4d5e6f7", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_a2b3c4d5e6f7", "serviceId": "svc_standard", "available": true }
  ]
}
```

The station generates its own 32-byte random nonce. The `stationConnectivity: "Offline"` confirms that the app must use the OfflineAuthRequest flow (not ServerSignedAuth).

---

### Step 8: Session Key Derivation (18:32:13.200)

Both the app and station independently derive the BLE session key using HKDF-SHA256:

```
SessionKey = HKDF-SHA256(
  ikm   = LTK || appNonce || stationNonce,
  salt  = "OSPP_BLE_SESSION_V1",
  info  = "device_b7c4de89f0123456" || "stn_a1b2c3d4",
  length = 32
)
```

This produces a 32-byte symmetric key used for the `sessionProof` HMAC in the next step and for the `sessionKeyConfirmation` in the AuthResponse.

---

### Step 9: Biometric Confirmation (18:32:14.000)

**What Bob sees:**

The app displays a biometric prompt:

> **Confirm offline payment**
> Eco Program - Bay 1
> Estimated: 50 credits (5 min)
> [Authenticate with Face ID]

Bob looks at his phone. Face ID succeeds. The app proceeds to send the OfflinePass.

---

### Step 10: App Writes OfflineAuthRequest to FFF3 (18:32:15.000)

**BLE GATT Write:** Characteristic `0000FFF3-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "OfflineAuthRequest",
  "offlinePass": {
    "passId": "opass_a8b9c0d1e2f3",
    "sub": "sub_bob2026",
    "deviceId": "device_b7c4de89f0123456",
    "issuedAt": "2026-02-13T06:00:00.000Z",
    "expiresAt": "2026-02-14T06:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30,
      "allowedServiceTypes": [
        "svc_eco",
        "svc_standard"
      ]
    },
    "constraints": {
      "minIntervalSec": 60,
      "stationOfflineWindowHours": 72,
      "stationMaxOfflineTx": 100
    },
    "signature": "V2hYcE9wR3FkN21MbjZzWnRKdUF4Q2JrRjVlUmlXZ0g4VTNQYW9EeUtsTXZCOXdmMGpBaFRjSWxFcDNyTnlPZA==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "counter": 3,
  "sessionProof": "dG1SZ1VXMXB5THNrQWZKZU9jTmhCNndiRHhpWnZLcTk="
}
```

Key fields:
- `counter: 3` -- monotonically increasing, this is Bob's 3rd offline session with this pass
- `sessionProof` -- HMAC over the session parameters using the derived session key, binding this request to the BLE handshake

---

### Step 11: Station Validates OfflinePass - 10 Checks (18:32:15.500)

The station performs all 10 validation checks sequentially:

| # | Check | Input | Result |
|--:|-------|-------|--------|
| 1 | ECDSA P-256 signature valid | `signature` verified against server's ECDSA P-256 public key in NVS | PASS |
| 2 | Pass not expired | `expiresAt` (2026-02-14T06:00:00Z) > station clock (2026-02-13T18:32:15Z) | PASS |
| 3 | Revocation epoch valid | Pass `revocationEpoch` (42) >= station's `RevocationEpoch` config (42) | PASS |
| 4 | Device ID matches Hello | Pass `deviceId` == Hello `deviceId` (`device_b7c4de89f0123456`) | PASS |
| 5 | Station allowed | Pass has no station restriction (applies to all stations) | PASS |
| 6 | Max uses not exceeded | 3rd use <= `maxUses` (5) | PASS |
| 7 | Max total credits not exceeded | Previous credits used (20) + this tx max (30) <= `maxTotalCredits` (100) | PASS |
| 8 | Max credits per tx ok | Requested 50 credits, capped to `maxCreditsPerTx` (30) = 3 min max | PASS |
| 9 | Min interval elapsed | Last tx from this pass was >60s ago (last was hours ago) | PASS |
| 10 | Counter anti-replay | `counter` (3) > station's `lastSeenCounter` for this pass (2) | PASS |

All 10 checks pass. The station:
1. Updates `lastSeenCounter` for `opass_a8b9c0d1e2f3` to 3
2. Authorizes the session with a cap of 30 credits (3 minutes at 10 credits/min)

---

### Step 12: Station Notifies AuthResponse Accepted on FFF4 (18:32:16.000)

**BLE GATT Notify:** Characteristic `0000FFF4-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "pLm3KxNv8dRqWz0hYcFj5sTbAeOiG7nU2JfBwXtIk6o="
}
```

The `sessionKeyConfirmation` is an HMAC computed by the station using the same derived session key. The app verifies it matches its own computation, confirming both sides share the same key. The BLE connection state transitions: `HANDSHAKE` -> `READY`.

**What Bob sees:**

A green checkmark animation and "Authentication successful" (Authentication successful).

---

### Step 13: App Writes StartServiceRequest to FFF3 (18:32:16.500)

Note: The app requested 5 minutes (300s), but the station will cap to 3 minutes (180s) based on the `maxCreditsPerTx` limit of 30 credits at 10 credits/min.

**BLE GATT Write:** Characteristic `0000FFF3-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300
}
```

---

### Step 14: Station Notifies StartServiceResponse on FFF4 (18:32:17.000)

The station controller:
1. Validates bay 1 is Available
2. Calculates authorized duration: `min(requestedDurationSeconds, maxCreditsPerTx / priceCreditsPerMinute * 60)` = `min(300, 30/10*60)` = `min(300, 180)` = 180 seconds
3. Activates the dispenser relay on bay 1
4. Starts the 180-second session timer
5. Assigns a local session ID and offline transaction ID

**BLE GATT Notify:** Characteristic `0000FFF4-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_a8b9c0d1e2f3",
  "offlineTxId": "otx_a3b4c5d6e7f8"
}
```

**What Bob sees:**

The app transitions to the SessionActiveScreen. A large timer shows "3:00" (the station-authorized duration, not the requested 5 minutes). A note reads: "Duration adjusted to 3 min (offline limit: 30 credits)". The service icon pulses. A red "Stop service" button is visible at the bottom.

---

### Step 15: Station Sends ServiceStatus Updates on FFF5 (periodic)

The station sends periodic status updates via BLE notifications on FFF5.

**At 18:32:20.000 (3 seconds elapsed):**

**BLE GATT Notify:** Characteristic `0000FFF5-0000-1000-8000-00805F9B34FB`

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 3,
  "remainingSeconds": 177,
  "meterValues": {
    "liquidMl": 550,
    "consumableMl": 15
  }
}
```

**At 18:33:17.000 (60 seconds elapsed):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 60,
  "remainingSeconds": 120,
  "meterValues": {
    "liquidMl": 11200,
    "consumableMl": 125
  }
}
```

**At 18:34:17.000 (120 seconds elapsed):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 120,
  "remainingSeconds": 60,
  "meterValues": {
    "liquidMl": 22100,
    "consumableMl": 250
  }
}
```

**At 18:35:17.000 (180 seconds elapsed):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 180,
  "remainingSeconds": 0,
  "meterValues": {
    "liquidMl": 33400,
    "consumableMl": 375
  }
}
```

**What Bob sees:**

The timer counts down: 2:57... 2:00... 1:00... 0:00. The water and chemical consumption updates in real time. At 1:00 remaining, the timer turns yellow. At 0:10, it turns red with a pulsing animation.

---

### Step 16: Bob Stops the Session (18:35:17.500)

At the 3-minute mark the timer has hit zero. Bob sees the car is clean and taps "Stop service". (In this case the timer already expired, but Bob taps stop explicitly to confirm. If he had not tapped, the station would auto-stop.)

**What Bob sees:**

A confirmation dialog appears:

> **Stop service?**
> Duration: ~3m 0s. Credits calculated at stop.
> [Cancel] [Stop]

Bob taps "Stop".

---

### Step 17: App Writes StopServiceRequest to FFF3 (18:35:18.000)

**BLE GATT Write:** Characteristic `0000FFF3-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "StopServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "sessionId": "sess_a8b9c0d1e2f3"
}
```

---

### Step 18: Station Deactivates Dispenser, Sends StopServiceResponse (18:35:18.500)

The station's dispenser was already auto-stopped at the 180-second mark (the authorized duration). When the StopServiceRequest arrives at 18:35:18.000, the station acknowledges it but the hardware is already off. The station controller:

1. Confirms the pump relay is already off (auto-stopped at 18:35:17.000)
2. Reads the final meter values from the sensors
3. Reports `actualDurationSeconds: 180` (the pump ran for exactly the authorized 180 seconds)
4. Calculates credits: `ceil(180 / 60) * 10 = 3 * 10 = 30 credits` (within `maxCreditsPerTx` of 30)

**BLE GATT Notify:** Characteristic `0000FFF4-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "StopServiceResponse",
  "result": "Accepted",
  "actualDurationSeconds": 180,
  "creditsCharged": 30
}
```

---

### Step 19: Station Generates Signed Receipt (18:35:19.000)

The station performs the following cryptographic operations:

**1. Construct receipt data (canonical JSON):**

```json
{"offlineTxId":"otx_a3b4c5d6e7f8","bayId":"bay_c1d2e3f4a5b6","serviceId":"svc_eco","startedAt":"2026-02-13T18:32:17.000Z","endedAt":"2026-02-13T18:35:17.000Z","durationSeconds":180,"creditsCharged":30}
```

**2. Base64-encode the canonical JSON:**

```
receipt.data = base64(canonical_json) = "eyJvZmZsaW5lVHhJZCI6Im90eF9tM240bzVwNiIsImJheUlkIjoiYmF5X3gxeTJ6MyIsInNlcnZpY2VJZCI6InN2Y19mb2FtIiwic3RhcnRlZEF0IjoiMjAyNi0wMi0xM1QxODozMjoxNy4wMDBaIiwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMTg6MzU6MTcuMDAwWiIsImR1cmF0aW9uU2Vjb25kcyI6MTgwLCJjcmVkaXRzQ2hhcmdlZCI6MzB9"
```

**3. Sign with ECDSA P-256:**

```
digest = SHA-256(receipt.data)
signature = ECDSA-P256-Sign(station_private_key, digest)
```

**4. Increment txCounter:**

```
txCounter:           8 (station's 8th offline transaction)
```

---

### Step 20: Station Notifies ServiceStatus ReceiptReady on FFF5 (18:35:19.500)

**BLE GATT Notify:** Characteristic `0000FFF5-0000-1000-8000-00805F9B34FB`

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 180,
  "remainingSeconds": 0
}
```

---

### Step 21: App Reads Receipt from FFF6 (18:35:20.000)

**BLE GATT Read:** Characteristic `0000FFF6-0000-1000-8000-00805F9B34FB`

```json
{
  "offlineTxId": "otx_a3b4c5d6e7f8",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-02-13T18:32:17.000Z",
  "endedAt": "2026-02-13T18:35:17.000Z",
  "durationSeconds": 180,
  "creditsCharged": 30,
  "meterValues": {
    "liquidMl": 33400,
    "consumableMl": 375,
    "energyWh": 85
  },
  "receipt": {
    "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9tM240bzVwNiIsImJheUlkIjoiYmF5X3gxeTJ6MyIsInNlcnZpY2VJZCI6InN2Y19mb2FtIiwic3RhcnRlZEF0IjoiMjAyNi0wMi0xM1QxODozMjoxNy4wMDBaIiwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMTg6MzU6MTcuMDAwWiIsImR1cmF0aW9uU2Vjb25kcyI6MTgwLCJjcmVkaXRzQ2hhcmdlZCI6MzB9",
    "signature": "MEUCIQC7x2kR9wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIQIgRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 8
}
```

The app:
1. Verifies the ECDSA signature using the station's public key (obtained during provisioning)
2. Stores the complete receipt in the offline transaction log (`offlineTxLogStore`)
3. Updates the local OfflinePass usage: counter = 3, credits used = 20 + 30 = 50
4. Updates `walletStore.getEstimatedBalance`: previous estimated balance minus 30 credits

---

### Step 22: App Disconnects BLE (18:35:20.500)

The app cleanly disconnects the BLE connection. The station's bay 1 transitions back to `Available` after the drain cycle completes.

---

### Step 23: App Displays Session Summary (18:35:21.000)

**What Bob sees:**

The app transitions to the SessionCompletedScreen:

```
+----------------------------------+
|      Offline service completed    |
|                                  |
|   Eco Program - Bay 1           |
|   Duration: 3m 0s                  |
|                                  |
|   Credits debited:      30       |
|   Estimated balance:    42       |
|                                  |
|   Liquid: 33.4L | Consumable: 375mL |
|                                  |
|   Receipt saved locally.        |
|   Will sync when connection      |
|   is restored.                   |
|                                  |
|          [Home]                   |
+----------------------------------+
```

---

### Step 24: Later — Reconciliation (when connectivity is restored)

When the station regains MQTT connectivity, it performs the reconciliation flow (Flow 10):

**Station sends TransactionEvent REQUEST:**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "tx_m3n4o5p6-a1b2-c3d4-e5f6-g7h8i9j0k1l2",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-14T08:15:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "offlineTxId": "otx_a3b4c5d6e7f8",
    "offlinePassId": "opass_a8b9c0d1e2f3",
    "userId": "sub_bob2026",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T18:32:17.000Z",
    "endedAt": "2026-02-13T18:35:17.000Z",
    "durationSeconds": 180,
    "creditsCharged": 30,
    "receipt": {
      "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9tM240bzVwNiIsImJheUlkIjoiYmF5X3gxeTJ6MyIsInNlcnZpY2VJZCI6InN2Y19mb2FtIiwic3RhcnRlZEF0IjoiMjAyNi0wMi0xM1QxODozMjoxNy4wMDBaIiwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMTg6MzU6MTcuMDAwWiIsImR1cmF0aW9uU2Vjb25kcyI6MTgwLCJjcmVkaXRzQ2hhcmdlZCI6MzB9",
      "signature": "MEUCIQC7x2kR9wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIQIgRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ==",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 8,
    "meterValues": {
      "liquidMl": 33400,
      "consumableMl": 375,
      "energyWh": 85
    }
  }
}
```

**Server responds:**

```json
{
  "messageId": "tx_m3n4o5p6-a1b2-c3d4-e5f6-g7h8i9j0k1l2",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-14T08:15:00.500Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

The server:
1. Deduplicates by `offlineTxId` (`otx_a3b4c5d6e7f8`)
2. Verifies the ECDSA receipt signature against the station's registered public key
3. Verifies txCounter continuity (txCounter 8, no gaps from last known counter)
4. Validates the OfflinePass was valid at transaction time
5. Debits 30 credits from Bob's wallet
6. Creates a session record
7. Responds `Accepted`

The station removes the transaction from its local queue.

## Message Sequence Diagram

```
  Bob(App)                           Station (stn_a1b2c3d4)
     |                                        |
     |  BLE scan → discover OSPP-b2c3d4         |
     |                                        |
     |  BLE CONNECT                           |
     |--------------------------------------->|
     |                                        |
     |  Read FFF1 (StationInfo)               |
     |--------------------------------------->|
     |  {stationId, connectivity: "Offline"}  |
     |<---------------------------------------|
     |                                        |
     |  Read FFF2 (AvailableServices)         |
     |--------------------------------------->|
     |  {bays, services, prices}              |
     |<---------------------------------------|
     |                                        |
     |  user selects Bay 1 + Eco Program     |
     |                                        |
     |  Write FFF3: Hello                     |
     |--------------------------------------->|
     |  Notify FFF4: Challenge (offline)      |
     |<---------------------------------------|
     |                                        |
     |  derive session key (HKDF-SHA256)      |
     |  biometric confirmation (Face ID)      |
     |                                        |
     |  Write FFF3: OfflineAuthRequest       |
     |--------------------------------------->|
     |                          10-check validation
     |                          all checks PASS
     |  Notify FFF4: AuthResponse (Accepted) |
     |<---------------------------------------|
     |                                        |
     |  Write FFF3: StartServiceRequest      |
     |--------------------------------------->|
     |                          activate dispenser
     |  Notify FFF4: StartServiceResponse   |
     |<---------------------------------------|
     |                                        |
     |  Notify FFF5: ServiceStatus (Running)  |
     |<---------------------------------------|
     |         ... (every few seconds) ...    |
     |  Notify FFF5: ServiceStatus (Running)  |
     |<---------------------------------------|
     |                                        |
     |  user taps stop                        |
     |                                        |
     |  Write FFF3: StopServiceRequest       |
     |--------------------------------------->|
     |                          deactivate pump
     |  Notify FFF4: StopServiceResponse    |
     |<---------------------------------------|
     |                                        |
     |                          generate receipt
     |                          sign ECDSA P-256
     |                          increment txCounter
     |                                        |
     |  Notify FFF5: ServiceStatus (ReceiptReady)
     |<---------------------------------------|
     |                                        |
     |  Read FFF6 (Receipt)                   |
     |--------------------------------------->|
     |  {receipt, signature, txCounter}        |
     |<---------------------------------------|
     |                                        |
     |  store in offline tx log               |
     |                                        |
     |  BLE DISCONNECT                        |
     |--------------------------------------->|
     |                                        |
```

## Key Design Decisions

1. **Station validates locally, not the server.** In the Full Offline flow, the station is the sole authority. It performs all 10 OfflinePass checks using the server's ECDSA P-256 public key stored in NVS. There is no round-trip to the server. This means the station must maintain its own counter tracking, revocation epoch, and usage limits per pass. The tradeoff is that the station cannot check the user's live wallet balance, which is why the OfflinePass has conservative credit limits.

2. **maxCreditsPerTx caps the session duration.** Even though Bob requested 5 minutes (50 credits), the station authorized only 3 minutes (30 credits) because `maxCreditsPerTx` is 30. This hard cap protects against excessive offline spending. The app gracefully displays the adjusted duration rather than rejecting the request.

3. **ECDSA P-256 receipts for non-repudiation.** The station signs every offline transaction receipt with its ECDSA P-256 private key (generated during provisioning, never leaves the device). This means neither the station operator nor the user can forge a receipt. During reconciliation, the server verifies the signature against the station's registered public key.

4. **Monotonic txCounter for tamper detection.** Each receipt includes a `txCounter` that increments by exactly 1 for each offline transaction. If a station operator tries to delete transactions, the server will detect gaps in the txCounter sequence during reconciliation and flag a WARNING.

5. **Dual reconciliation paths.** Both the station (via TransactionEvent over MQTT) and the app (via `POST /me/offline-txs` over HTTPS) can submit the offline transaction to the server. The server deduplicates by `offlineTxId`. This redundancy ensures that even if one path fails (e.g., the station is decommissioned before reconnecting), the transaction is still settled.

6. **Biometric gate before OfflinePass transmission.** The app requires Face ID, Touch ID, or PIN before sending the OfflineAuthRequest. This prevents a stolen unlocked phone from being used for offline sessions. The biometric confirmation is a local device operation and does not require network access.

7. **Session key derivation binds handshake to auth.** The HKDF-SHA256 session key derived from the LTK, appNonce, and stationNonce is used to compute the `sessionProof` in the OfflineAuthRequest. This cryptographically binds the authentication to the specific BLE handshake, preventing replay attacks where an attacker captures an OfflineAuthRequest and tries to use it on a different connection.
