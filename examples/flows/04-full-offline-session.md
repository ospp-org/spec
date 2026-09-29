# Flow 04: Full Offline BLE Session

## Scenario

It is a winter evening in Example City. Heavy snowfall has knocked out the internet at "Station Alpha -- Example City" and Bob's mobile carrier is also down in the area. Bob pulls into bay 1 and wants to use the Eco Program service. He opens the the app, which detects no internet connectivity. The app has a pre-armed OfflinePass (`opass_a8b9c0d1e2f3`) that was refreshed this morning while Bob was on WiFi. The app discovers the station via BLE, connects, reads station info and available services, performs the HELLO/CHALLENGE handshake, authenticates with the OfflinePass (the station validates it locally with the nine checks that apply), starts "Eco Program" on bay 1, monitors progress via BLE ServiceStatus notifications, and stops after 3 minutes. The station generates a signed receipt with ECDSA P-256 and increments the txCounter. Bob reads the receipt from FFF6 and the app stores it in the offline transaction log, to upload it to the server once it has a network.

## Participants

| Actor | Identity |
|-------|----------|
| User | Bob (`sub_bob2026`), device `device_b7c4de89f0123456` |
| App | the mobile app (React Native / Expo), version 2.1.0 |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp (BLE advertising, MQTT disconnected) |
| Bay | `bay_c1d2e3f4a5b6` (Bay 1) |
| Service | `svc_eco` (Eco Program, 10 credits/min, metered) |

## Pre-conditions

- Bob has a valid OfflinePass `opass_a8b9c0d1e2f3` in the app, issued at 06:00 UTC today. It expires tomorrow because this example platform sets its pass lifetime to one day; the default is three days, and never more than ten ([`offline-pass.md` §6](../../spec/profiles/offline/offline-pass.md#6-lifecycle))
- OfflinePass allowance: 100 credits total, 5 max uses, 30 credits max per transaction
- Bob's OfflinePass counter is at 2 (he has done 2 previous offline sessions)
- Station BLE is advertising as `OSPP-b2c3d4` (last 6 hex chars of station ID)
- Station holds the server key set (`OfflinePassPublicKey`) in NVS, including the key the pass's `keyId` names
- Station `OfflineModeEnabled` configuration is `true`
- Station is within its own offline limits: it holds 7 offline transactions the server has not yet answered, well under its `OfflineTransactionLimit` (1000), and it has been offline for far less than its `OfflineWindowHours` (240). Both are station configuration, not pass fields ([`08-configuration.md` §5](../../spec/08-configuration.md#5-offline--ble-configuration-keys))
- Station holds the platform `RevocationEpoch` 42 (matches the pass)
- Station clock is synchronized to within 5 seconds (last synced before internet dropped)
- Neither the phone nor the station has internet connectivity

## Timeline

```
18:32:00.000  Bob opens the app, sees "Offline Mode" banner
18:32:03.000  App starts BLE scan, discovers OSPP-b2c3d4
18:32:04.500  App establishes BLE connection to station
18:32:05.000  App reads FFF1 (StationInfo) — confirms station identity and offline status
18:32:05.500  App reads FFF2 (AvailableServices) — displays service catalog
18:32:12.000  Bob selects Bay 1, Eco Program, 3 min duration
18:32:12.500  App writes Hello to FFF3
18:32:13.000  Station notifies Challenge on FFF4 (stationConnectivity: "Offline")
18:32:13.200  App derives session key via HKDF-SHA256
18:32:14.000  App requests biometric confirmation (Face ID)
18:32:15.000  App writes OfflineAuthRequest to FFF3 with OfflinePass
18:32:15.500  Station performs the nine OfflinePass checks — all pass
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
  "bleProtocolVersion": "0.2.1",
  "connectivity": "Offline"
}
```

The app verifies:
- `stationId` matches the expected station from the scan
- `bleProtocolVersion` is one the app supports. There is no compatibility relation derived from a version component — a shared MAJOR implies nothing ([VERSIONING.md](../../VERSIONING.md)) — and this station reports `0.2.1`
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

The app displays two bay cards. Both show "Available" (Available) in green. Under Bay 1, Bob sees "Eco Program (10 credits/min)" and "Standard Program (8 credits/min)". Before he chooses, the app shows the pass's limits, as it must ([`offline-pass.md` §2.1](../../spec/profiles/offline/offline-pass.md#21-offlineallowance-object)): 30 credits per session, 80 of 100 credits remaining, 3 of 5 uses remaining. He taps Bay 1, then selects "Eco Program". A duration picker appears, bounded at 3 minutes: the pass the app is already holding carries `offlineAllowance.maxCreditsPerTx` (30) in plaintext, so the app can read the limit and shape its offer to fit **before** it asks the station for anything — a request above a limit would be refused, never reduced. He sets it to 3 minutes (30 credits). The app shows: "Estimated cost: 30 credits. Estimated offline balance: 72 credits."

---

### Step 6: App Writes Hello to FFF3 (18:32:12.500)

**BLE GATT Write:** Characteristic `0000FFF3-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "Hello",
  "deviceId": "device_b7c4de89f0123456",
  "appNonce": "sH5WmIMfOYRb4zfrKESykXKz0UF5XR5HgU/iKijUAUg=",
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
  "stationNonce": "nl+FBpL/lU0181wqYJgSi8QFcbi5ZZMRz0XrZhPUpvw=",
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

Both the app and station independently derive the BLE session key using HKDF-SHA256 over the ECDH secrets (the BLE LTK is **not** used — see `spec/06-security.md` §6.5):

```
SessionKey = HKDF-SHA256(
  ikm   = es ‖ ee ‖ appNonce ‖ stationNonce,   // es=ECDH(appEph, stnStatic[cert]); ee=ECDH(appEph, stnEph)
  salt  = "OSPP_BLE_SESSION_V2",
  info  = LP("device_b7c4de89f0123456") ‖ LP(transcriptHash),   // LP(x)=U16BE(len)‖x; stationId bound via transcript
  length = 32
)
```

This produces a 32-byte symmetric key used for the `sessionProof` HMAC in the next step, for the `sessionKeyConfirmation` in the AuthResponse, and to expand the per-direction AEAD keys that encrypt every post-Challenge message.

> **Note (v0.6.0 / T1-pending):** The BLE message JSON shown in this walkthrough (Hello/Challenge fields, `sessionProof` values) still reflects the v0.5.x handshake shape and is regenerated as a coherent set in the T1 vector batch (it must carry `appEphemeralPubKey`, `stationCert`, `stationEphemeralPubKey`, length-prefixed `sessionProof`, and AEAD framing). The derivation above is the v0.6.0 construction.

---

### Step 9: Biometric Confirmation (18:32:14.000)

**What Bob sees:**

The app displays a biometric prompt:

> **Confirm offline payment**
> Eco Program - Bay 1
> Estimated: 30 credits (3 min)
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
    "devicePublicKey": "A/h6jULcl8Sq6+dJE1aS5RFXBrrbdfl8odxzkH3y2CuW",
    "keyId": "YjX5pR0TzmU3ubs17wImQQ",
    "issuedAt": "2026-02-13T06:00:00.000Z",
    "expiresAt": "2026-02-14T06:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30
    },
    "constraints": {
      "minIntervalSec": 60
    },
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEQCIG2bOeuUibBTP/iHL+5rR9Nmea9zVnY7Co6/Hq+91rR3AiAn0pFVBCXzdNnPR9ndho4b3iMLsemDrWLs+pLUc4TKPw=="
  },
  "counter": 3,
  "sessionProof": "hAW4BhA445dJmlLG78qcEn36DHEhkjIDNt3fZOGGh0c="
}
```

Key fields:
- `counter: 3` -- monotonically increasing, this is Bob's 3rd offline session with this pass
- `sessionProof` -- HMAC over the session parameters using the derived session key, binding this request to the BLE handshake

---

### Step 11: Station Validates OfflinePass - Nine Checks (18:32:15.500)

The station performs the nine checks that apply, in order, stopping at the first failure. The list has ten numbered checks and #5 is withdrawn ([`06-security.md` §6.1.1](../../spec/06-security.md#611-offlinepass-validation--10-checks)):

| # | Check | Input | Result |
|--:|-------|-------|--------|
| 1 | ECDSA P-256 signature valid | `signature` verified with the key of the station's server key set named by the pass's `keyId` (`YjX5pR0TzmU3ubs17wImQQ`) | PASS |
| 2 | Within its temporal bounds | `expiresAt` (2026-02-14T06:00:00.000Z) > station clock (2026-02-13T18:32:15.000Z), and the pass's age (12 h 32 min) is within the station's `OfflinePassMaxAge` (864000 s) | PASS |
| 3 | Revocation epoch valid | Pass `revocationEpoch` (42) >= the platform `RevocationEpoch` the station holds (42) | PASS |
| 4 | Device ID matches Hello | Pass `deviceId` == Hello `deviceId` (`device_b7c4de89f0123456`) | PASS |
| 5 | *(withdrawn)* | A pass carries no station or organization scope ([`offline-pass.md` §2.3](../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)); the number is not reused | — |
| 6 | Max uses not exceeded | Uses already counted (2) < `maxUses` (5) | PASS |
| 7 | Max total credits not exceeded | Credits already counted (20) + this transaction's estimated cost (30) = 50, not above `maxTotalCredits` (100) | PASS |
| 8 | Max credits per tx ok | Estimated cost for the requested 3 minutes (30 credits) does not exceed `maxCreditsPerTx` (30) | PASS |
| 9 | Min interval elapsed | Last tx from this pass was >60s ago (last was hours ago) | PASS |
| 10 | Counter anti-replay | `counter` (3) > station's `lastSeenCounter` for this pass (2) | PASS |

All nine checks pass, and the station is within its own offline limits (see Pre-conditions). The station:
1. Updates `lastSeenCounter` for `opass_a8b9c0d1e2f3` to 3
2. Authorizes the session as requested — 3 minutes, 30 credits at 10 credits/min

---

### Step 12: Station Notifies AuthResponse Accepted on FFF4 (18:32:16.000)

**BLE GATT Notify:** Characteristic `0000FFF4-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "uo31nIXlLPNLPc8rCOeJWYwbDh/ycVRE692174J5jp0="
}
```

The `sessionKeyConfirmation` is an HMAC computed by the station using the same derived session key. The app verifies it matches its own computation, confirming both sides share the same key. The BLE connection state transitions: `HANDSHAKE` -> `READY`.

**What Bob sees:**

A green checkmark animation and "Authentication successful" (Authentication successful).

---

### Step 13: App Writes StartServiceRequest to FFF3 (18:32:16.500)

Note: the request is for 180 s — 30 credits at 10 credits/min, exactly `maxCreditsPerTx`. The app sized it from the pass before asking. Had it asked for 300 s, check #8 would have **rejected** the pass with `4004 OFFLINE_PER_TX_EXCEEDED` ([`offline-pass.md` §4](../../spec/profiles/offline/offline-pass.md) check #8); the station does not reduce an over-limit request to fit.

**BLE GATT Write:** Characteristic `0000FFF3-0000-1000-8000-00805F9B34FB`

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 180
}
```

---

### Step 14: Station Notifies StartServiceResponse on FFF4 (18:32:17.000)

The station controller:
1. Validates bay 1 is Available
2. Authorizes the requested 180 seconds unchanged — check #8 already established that the estimated cost is within `maxCreditsPerTx`, so there is nothing to reduce
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

The app transitions to the SessionActiveScreen. A large timer shows "3:00" — the duration Bob asked for, authorized as asked. A note reads: "Offline session (limit: 30 credits)". The service icon pulses. A red "Stop service" button is visible at the bottom.

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

The station performs the following operations:

**1. Assign the txCounter.** `txCounter` becomes 8 (the station's 8th offline transaction) and is persisted to NVS before the receipt is signed ([`06-security.md` §6.3](../../spec/06-security.md#63-signed-counter--forensic-evidence)).

**2. Serialize the receipt fields.** The station serializes the pass-form `receipt_fields` of [`06-security.md` §6.2](../../spec/06-security.md#62-transaction-receipt-signing--ecdsa-p-256) in the OSPP Canonical Form: `offlineTxId`, `offlinePassId`, `passCounter`, `userId`, `deviceId`, `stationId`, `bayId`, `serviceId`, `startedAt`, `endedAt`, `durationSeconds`, `bookedDurationSeconds`, `endReason`, `clockState`, `creditsCharged`, `meterValues` and `txCounter`. Four of them are **signed only**: they appear in no envelope, neither the FFF6 Receipt's nor the TransactionEvent's, and the server reads them from the signed body — `stationId` (`stn_a1b2c3d4`), `endReason` (`TimerExpired`: the service ran its booked time), `bookedDurationSeconds` (180) and `clockState` (`Synchronized`: the clock has been set from the server since the station last booted). `durationSeconds` (180) is measured on the station's monotonic timer.

**3. Base64-encode the canonical bytes.** The result is `receipt.data`, shown in Step 21.

**4. Sign with ECDSA P-256:**

```
digest    = SHA-256(canonical bytes)       // the canonical bytes, not their Base64 form
signature = ECDSA-P256-Sign(station_private_key, digest)
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
  "offlinePassId": "opass_a8b9c0d1e2f3",
  "passCounter": 3,
  "userId": "sub_bob2026",
  "deviceId": "device_b7c4de89f0123456",
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
    "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjE4MCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjozMCwiZGV2aWNlSWQiOiJkZXZpY2VfYjdjNGRlODlmMDEyMzQ1NiIsImR1cmF0aW9uU2Vjb25kcyI6MTgwLCJlbmRSZWFzb24iOiJUaW1lckV4cGlyZWQiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxODozNToxNy4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjozNzUsImVuZXJneVdoIjo4NSwibGlxdWlkTWwiOjMzNDAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2E4YjljMGQxZTJmMyIsIm9mZmxpbmVUeElkIjoib3R4X2EzYjRjNWQ2ZTdmOCIsInBhc3NDb3VudGVyIjozLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic3RhcnRlZEF0IjoiMjAyNi0wMi0xM1QxODozMjoxNy4wMDBaIiwic3RhdGlvbklkIjoic3RuX2ExYjJjM2Q0IiwidHhDb3VudGVyIjo4LCJ1c2VySWQiOiJzdWJfYm9iMjAyNiJ9",
    "signature": "MEQCICMak9WpvoXhB461m1fRcir+k0RKKG1swqI+oEt9bS2GAiAJKrmeam0uyUykofWMu5M8GokaX2Y7tSI3HDQxGBQ+SQ==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 8
}
```

The app:
1. Stores the complete receipt in the offline transaction log (`offlineTxLogStore`)
2. Updates the local OfflinePass usage: counter = 3, credits used = 20 + 30 = 50
3. Updates `walletStore.getEstimatedBalance`: previous estimated balance minus 30 credits
4. Keeps the receipt to upload as soon as it has connectivity, as it does every receipt it holds ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload))

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
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_a3b4c5d6e7f8",
    "offlinePassId": "opass_a8b9c0d1e2f3",
    "passCounter": 3,
    "userId": "sub_bob2026",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T18:32:17.000Z",
    "endedAt": "2026-02-13T18:35:17.000Z",
    "durationSeconds": 180,
    "creditsCharged": 30,
    "receipt": {
      "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjE4MCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjozMCwiZGV2aWNlSWQiOiJkZXZpY2VfYjdjNGRlODlmMDEyMzQ1NiIsImR1cmF0aW9uU2Vjb25kcyI6MTgwLCJlbmRSZWFzb24iOiJUaW1lckV4cGlyZWQiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxODozNToxNy4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjozNzUsImVuZXJneVdoIjo4NSwibGlxdWlkTWwiOjMzNDAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2E4YjljMGQxZTJmMyIsIm9mZmxpbmVUeElkIjoib3R4X2EzYjRjNWQ2ZTdmOCIsInBhc3NDb3VudGVyIjozLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic3RhcnRlZEF0IjoiMjAyNi0wMi0xM1QxODozMjoxNy4wMDBaIiwic3RhdGlvbklkIjoic3RuX2ExYjJjM2Q0IiwidHhDb3VudGVyIjo4LCJ1c2VySWQiOiJzdWJfYm9iMjAyNiJ9",
      "signature": "MEQCICMak9WpvoXhB461m1fRcir+k0RKKG1swqI+oEt9bS2GAiAJKrmeam0uyUykofWMu5M8GokaX2Y7tSI3HDQxGBQ+SQ==",
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
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

The server, in the order of [`reconciliation.md` §2](../../spec/profiles/offline/reconciliation.md#2-sync-procedure):
1. Deduplicates by `offlineTxId` (`otx_a3b4c5d6e7f8`). Whichever copy of a receipt arrives first — the station's TransactionEvent or the app's upload — may settle, and once one has settled the other is answered `Duplicate` ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload))
2. Verifies the receipt signature with the receipt-signing key of the station the signed receipt names (`stationId`)
3. Records txCounter 8 as forensic evidence (contiguous with the last known counter — noted, not gated on)
4. Applies the reconcile-time gate: the OfflinePass was valid at the transaction's signed `endedAt`, read through the station's clock offset ([`reconciliation.md` §6.8](../../spec/profiles/offline/reconciliation.md#68-station-clock-offset))
5. Settles: recomputes the cost from the signed receipt — 30 credits, not above `maxCreditsPerTx` (30) — and debits 30 credits from Bob's wallet
6. Scores the settled transaction for fraud ([`06-security.md` §7.4](../../spec/06-security.md#74-fraud-detection--offline-transactions)); the score is in the Normal band, so no `FraudDetected` record is written
7. Creates a session record
8. Responds `Accepted`

The station stops sending the transaction and deletes its record; the deletion **MAY** be deferred by up to 72 hours ([`transaction-event.md` §5.1](../../spec/profiles/transaction/transaction-event.md)).

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
     |                          nine-check validation
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

1. **Station validates locally, not the server.** In the Full Offline flow, the station is the sole authority. It performs the nine OfflinePass checks that apply, using the server key set (`OfflinePassPublicKey`) it holds. There is no round-trip to the server. This means the station must maintain its own counter tracking, the platform revocation epoch it last received, and usage limits per pass. The tradeoff is that the station cannot check what only the server knows — a block or an individual revocation, whenever issued, an epoch the platform moved after the station last received configuration, use of the pass at other stations, or the user's live wallet balance ([`offline-pass.md` §5](../../spec/profiles/offline/offline-pass.md#5-revocation)) — which is why the OfflinePass has conservative credit limits, and why settlement never charges above them ([`reconciliation.md` §8](../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)).

2. **`maxCreditsPerTx` is refused at the wash and capped at settlement — a request is never reduced to fit.** Check #8 compares the estimated cost against the limit and **rejects** with `4004 OFFLINE_PER_TX_EXCEEDED` when it is exceeded; it never trims the request to fit ([`offline-pass.md` §2.1](../../spec/profiles/offline/offline-pass.md#21-offlineallowance-object)). All three normative statements of the check say so — [`offline-pass.md` §4](../../spec/profiles/offline/offline-pass.md#4-validation-checks-10) check #8 station-side, [`authorize-offline-pass.md` §5](../../spec/profiles/offline/authorize-offline-pass.md#5-validation-checks) check #8 server-side, and [`06-security.md` §6.1.1](../../spec/06-security.md#611-offlinepass-validation--10-checks) check #8 — and [`07-errors.md`](../../spec/07-errors.md) records `4004` as **not recoverable**, which a silently reduced session would contradict. Reducing unasked also charges a user for a service they did not agree to. At reconciliation the limit is a cap, not a gate: the server settles no more than `maxCreditsPerTx` ([`reconciliation.md` §8](../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)) and scores a recomputed cost above it as the fraud factor `ExceedsPerTxLimit` ([`06-security.md` §7.4](../../spec/06-security.md#74-fraud-detection--offline-transactions)). The app is the right place to fit the offer to the limit, and it has what it needs: the pass carries `maxCreditsPerTx` in plaintext from the moment it is issued, and the app **MUST** show the pass's limits before the customer chooses, so a client can bound its own picker before it ever asks. The one clamp the offline path does permit is `requestedDurationSeconds` against a **server-authorized** `durationSeconds` on Partial A / Partial B ([`ble-session.md` §1](../../spec/profiles/offline/ble-session.md#1-starting-a-service)) — Full Offline has no server-authorized value to clamp against.

3. **ECDSA P-256 receipts for non-repudiation.** The station signs every offline transaction receipt with its ECDSA P-256 private key (generated during provisioning, never leaves the device). This means neither the station operator nor the user can forge a receipt. During reconciliation, the server verifies the signature against the station's registered public key.

4. **Monotonic txCounter as forensic evidence.** Each receipt includes a `txCounter` that increments by exactly 1 for each offline transaction, signed into the receipt so it cannot be restated later. A discontinuity is surfaced to the operator as a **station** alert and never withholds settlement. Note what it does *not* prove: an operator who suppresses transactions before they are counted produces no gap at all, so this is an aid to reconstruction, not a completeness guarantee — the guarantees live in point 5 and in `(offlinePassId, passCounter)` uniqueness (`06-security.md` §6.3.1).

5. **Two copies of one signed receipt.** The station sends the transaction as a TransactionEvent over MQTT, and the app uploads its copy of the same station-signed receipt over HTTPS (`POST /api/v1/offline/receipts`, [`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload)) — it **MUST** upload every receipt it holds. Whichever copy arrives first may settle; the other, byte-identical under the signature, is answered `Duplicate` ([`reconciliation.md` §3](../../spec/profiles/offline/reconciliation.md#3-deduplication-offlinetxid)). This redundancy ensures that even if one path fails (e.g., the station is decommissioned before reconnecting), the transaction is still settled.

6. **Biometric gate before OfflinePass transmission.** The app requires Face ID, Touch ID, or PIN before sending the OfflineAuthRequest. This prevents a stolen unlocked phone from being used for offline sessions. The biometric confirmation is a local device operation and does not require network access.

7. **Session key derivation binds handshake to auth.** The HKDF-SHA256 session key — derived from the ECDH secrets (`es ‖ ee`) and the nonces, and bound to the full handshake transcript — is used to compute the `sessionProof` in the OfflineAuthRequest. This cryptographically binds the authentication to the specific BLE handshake and to the authenticated station identity, preventing replay attacks where an attacker captures an OfflineAuthRequest and tries to use it on a different connection.
