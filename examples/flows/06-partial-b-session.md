# Flow 06: Partial B Session (Phone Offline, Station Online)

> **Compliance Level:** This flow is REQUIRED only at **Complete** compliance level. For Extended compliance, this scenario falls back to Full Offline (see [Flow 04](04-full-offline-session.md)).

## Scenario

Bob is at "Station Alpha -- Example City" and wants a deluxe treatment on Bay 2. His phone has no cellular signal — the area has a dead zone behind the building where he parked. However, the station's MQTT connection is healthy over its dedicated Ethernet line. Bob has an OfflinePass pre-armed in his the app from earlier today when he had WiFi. He opens the app, connects to the station via BLE, and sees that the station reports `connectivity: "Online"`. The app's ConnectivityDetector identifies this as a **Partial B** scenario: the app sends an OfflineAuthRequest with the OfflinePass over BLE, and the station forwards it to the server via MQTT for real-time validation. The server validates the pass, debits Bob's wallet, and responds to the station, which relays the acceptance to the app over BLE. Bob runs a 4-minute Deluxe Program session on Bay 2, the timer expires naturally, and a receipt is generated. Since the station is online throughout, the session is tracked in real-time by the server and no later reconciliation is needed.

## Participants

| Actor | Identity |
|-------|----------|
| User | Bob (`sub_bob2026`), device `device_b7c4de89f0123456` |
| App | the mobile app v2.1.0 (React Native / Expo) |
| Server | CSMS (`api.example.com`) |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp (MQTT online, BLE active) |
| Bay | `bay_a2b3c4d5e6f7` (Bay 2) |
| Service | `svc_deluxe` (Deluxe Program, 12 credits/min, metered) |

## Pre-conditions

- Bob has a valid OfflinePass (`opass_a8b9c0d1e2f3`) pre-armed in the app
- Bob's wallet balance: 95 credits (server-side)
- Bob's phone has no internet connectivity (no cellular, no WiFi)
- Station `stn_a1b2c3d4` is online (MQTT connected, last heartbeat 10 seconds ago)
- Station BLE is advertising as `OSPP-b2c3d4`
- Bay 2 status: `Available`
- Bob has completed biometric/PIN setup in the app
- OfflinePass `opass_a8b9c0d1e2f3` was issued today with 3 remaining uses

## Timeline

```
15:10:00.000  Bob opens the app near the station
15:10:01.200  App discovers BLE device OSPP-b2c3d4
15:10:01.800  App establishes BLE connection to station
15:10:02.100  App reads FFF1 (StationInfo) — sees connectivity: "Online"
15:10:02.400  App reads FFF2 (AvailableServices) — sees Bay 2 Available with svc_deluxe
15:10:03.000  Bob selects Bay 2, Deluxe Program, 4 minutes
15:10:04.000  App detects Partial B scenario (phone offline + station online)
15:10:04.500  App prompts biometric confirmation — Bob confirms with fingerprint
15:10:05.000  App writes Hello to FFF3
15:10:05.300  Station responds with Challenge on FFF4 (connectivity: "Online")
15:10:05.800  App writes OfflineAuthRequest to FFF3 (with OfflinePass)
15:10:06.000  Station forwards OfflinePass to server via MQTT AuthorizeOfflinePass
15:10:06.600  Server validates pass, debits 48 credits from Bob's wallet
15:10:06.800  Server responds via MQTT AuthorizeOfflinePass RESPONSE (Accepted)
15:10:07.000  Station relays AuthResponse (Accepted) to app via BLE FFF4
15:10:07.500  App writes StartServiceRequest to FFF3
15:10:07.900  Station activates dispenser on Bay 2
15:10:08.000  Station sends StartServiceResponse (Accepted) on FFF4
15:10:08.000  Deluxe Program session begins — timer starts at 240 seconds
15:11:08.000  ServiceStatus update: 60s elapsed, 180s remaining
15:12:08.000  ServiceStatus update: 120s elapsed, 120s remaining
15:13:08.000  ServiceStatus update: 180s elapsed, 60s remaining
15:14:08.000  Timer expires — station auto-stops dispenser
15:14:08.400  Station sends StopServiceResponse (240s, 48 credits)
15:14:09.000  Station generates ECDSA receipt, increments txCounter
15:14:09.200  Station sends ServiceStatus (ReceiptReady)
15:14:09.500  App reads Receipt from FFF6, stores locally
15:14:10.000  App disconnects BLE
15:14:10.500  App displays session summary to Bob
```

## Step-by-Step Detail

---

### Step 1: App Discovers Station via BLE (15:10:01.200)

**What Bob sees:**

Bob opens the app. The app detects it has no internet connectivity and shows a banner: "No internet — offline mode available". The BLE scan discovers `OSPP-b2c3d4`. The app shows: "Station found: SSP-3000".

---

### Step 2: App Reads StationInfo from FFF1 (15:10:02.100)

The app establishes a BLE connection and reads the StationInfo characteristic.

**BLE Read FFF1 [MSG-027]:**

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "1.2.3",
  "bayCount": 2,
  "bleProtocolVersion": "0.1.0",
  "connectivity": "Online"
}
```

The app sees `connectivity: "Online"` — the station has an active MQTT connection to the server. Combined with the phone being offline, the ConnectivityDetector identifies this as a **Partial B** scenario. In this mode, the station acts as a relay: the app sends an OfflinePass via BLE, and the station forwards it to the server via MQTT for real-time validation.

---

### Step 3: App Reads AvailableServices from FFF2 (15:10:02.400)

**BLE Read FFF2 [MSG-028]:**

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
          "serviceId": "svc_deluxe",
          "serviceName": "Deluxe Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 12,
          "priceLocalPerMinute": 60,
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
          "serviceId": "svc_deluxe",
          "serviceName": "Deluxe Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 12,
          "priceLocalPerMinute": 60,
          "available": true
        }
      ]
    }
  ]
}
```

Bob sees the service catalog. He selects Bay 2 and "Deluxe Program" (12 credits/min) for 4 minutes (48 credits max).

---

### Step 4: App Prompts Biometric Confirmation (15:10:04.500)

**What Bob sees:**

Because the app is using an OfflinePass (a pre-armed credential), the app requires biometric confirmation before proceeding. A system fingerprint dialog appears:

> **Confirm identity**
> Use fingerprint to authorize offline service.

Bob places his finger on the sensor. The biometric check passes.

---

### Step 5: App Sends Hello via BLE (15:10:05.000)

**BLE Write FFF3 [MSG-029]:**

```json
{
  "type": "Hello",
  "deviceId": "device_b7c4de89f0123456",
  "appNonce": "Xp9Tm3KqWvR7eG4sLwC8bA1hN6uJ2oYf5iDnSxZpHcE=",
  "appVersion": "2.1.0"
}
```

---

### Step 6: Station Responds with Challenge (15:10:05.300)

The station generates its nonce and reports its connectivity status.

**BLE Notify FFF4 [MSG-030]:**

```json
{
  "type": "Challenge",
  "stationNonce": "Hn7kV3wYfA9xRpQjM2sUcBgZ8uLdE1rI4oCn5FtKmWe=",
  "stationConnectivity": "Online",
  "availableServices": [
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_deluxe", "available": true },
    { "bayId": "bay_a2b3c4d5e6f7", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_a2b3c4d5e6f7", "serviceId": "svc_deluxe", "available": true }
  ]
}
```

The `stationConnectivity: "Online"` confirms the Partial B scenario. Both sides derive the BLE session key:

```
SessionKey = HKDF-SHA256(
  ikm   = LTK || appNonce || stationNonce,
  salt  = "OSPP_BLE_SESSION_V1",
  info  = "device_b7c4de89f0123456" || "stn_a1b2c3d4",
  length = 32
)
```

---

### Step 7: App Sends OfflineAuthRequest via BLE (15:10:05.800)

The app presents the pre-armed OfflinePass. In Partial B, the station does NOT validate locally — it forwards the pass to the server.

**BLE Write FFF3 [MSG-031]:**

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
      "maxTotalCredits": 200,
      "maxUses": 5,
      "maxCreditsPerTx": 60,
      "allowedServiceTypes": ["svc_eco", "svc_deluxe", "svc_standard"]
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
  "sessionProof": "aG1BeFRrTnBjSEJyV2taemRFcHVRWGhEWW10R05XVlNhVmRuU0RoVk0="
}
```

---

### Step 8: Station Forwards OfflinePass to Server via MQTT (15:10:06.000)

Because the station is online (`stationConnectivity: "Online"`), it does NOT perform local validation of the OfflinePass. Instead, it forwards the complete pass to the server for real-time validation via the AuthorizeOfflinePass MQTT message.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_authpass_2a3b4c5d",
  "messageType": "Request",
  "action": "AuthorizeOfflinePass",
  "timestamp": "2026-02-13T15:10:06.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "offlinePassId": "opass_a8b9c0d1e2f3",
    "offlinePass": {
      "passId": "opass_a8b9c0d1e2f3",
      "sub": "sub_bob2026",
      "deviceId": "device_b7c4de89f0123456",
      "issuedAt": "2026-02-13T06:00:00.000Z",
      "expiresAt": "2026-02-14T06:00:00.000Z",
      "policyVersion": 1,
      "revocationEpoch": 42,
      "offlineAllowance": {
        "maxTotalCredits": 200,
        "maxUses": 5,
        "maxCreditsPerTx": 60,
        "allowedServiceTypes": ["svc_eco", "svc_deluxe", "svc_standard"]
      },
      "constraints": {
        "minIntervalSec": 60,
        "stationOfflineWindowHours": 72,
        "stationMaxOfflineTx": 100
      },
      "signature": "V2hYcE9wR3FkN21MbjZzWnRKdUF4Q2JrRjVlUmlXZ0g4VTNQYW9EeUtsTXZCOXdmMGpBaFRjSWxFcDNyTnlPZA==",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "deviceId": "device_b7c4de89f0123456",
    "counter": 3,
    "bayId": "bay_a2b3c4d5e6f7",
    "serviceId": "svc_deluxe"
  }
}
```

---

### Step 9: Server Validates OfflinePass in Real-Time (15:10:06.600)

The server performs full validation of the OfflinePass:

1. **ECDSA P-256 signature** — verifies the pass was signed by the server's own key
2. **Expiry check** — `expiresAt` (2026-02-14T06:00:00Z) is in the future
3. **Revocation epoch** — pass epoch (42) matches current server epoch (42)
4. **Device ID** — `device_b7c4de89f0123456` matches the BLE Hello device ID
5. **Usage limits** — pass has been used 2 times (maxUses: 5), so 3 remaining
6. **Credit limits** — 48 credits for this tx (maxCreditsPerTx: 60), total used so far: 80 (maxTotalCredits: 200)
7. **Rate limiting** — last use was 45 minutes ago (minIntervalSec: 60), passes
8. **Counter** — counter 3 > last seen counter 2, no replay
9. **User balance** — Bob has 95 credits, sufficient for 48 credits (4 min x 12 credits/min)
10. **Service allowed** — `svc_deluxe` is in `allowedServiceTypes`

All checks pass. The server:
- Debits 48 credits from Bob's wallet (balance: 95 - 48 = 47)
- Creates session record `sess_d5e6f7a8b9c0` with `status: active`
- Records the OfflinePass usage (counter: 3, uses: 3/5, total credits: 128/200)

---

### Step 10: Server Responds via MQTT (15:10:06.800)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_authpass_2a3b4c5d",
  "messageType": "Response",
  "action": "AuthorizeOfflinePass",
  "timestamp": "2026-02-13T15:10:06.800Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted",
    "sessionId": "sess_d5e6f7a8b9c0",
    "durationSeconds": 240,
    "creditsAuthorized": 48
  }
}
```

---

### Step 11: Station Relays AuthResponse to App via BLE (15:10:07.000)

The station receives the server's acceptance and relays it to the app over BLE.

**BLE Notify FFF4 [MSG-033]:**

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "rKn4LxOw9eSsRz1iYdGk6uTcBfPjH8nV3JgCwYtMk7p="
}
```

**What Bob sees:**

The app shows a green checkmark with "Authorization accepted by server". The fact that the server validated the pass in real-time is shown as an extra trust indicator.

---

### Step 12: App Sends StartServiceRequest (15:10:07.500)

**BLE Write FFF3 [MSG-034]:**

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_a2b3c4d5e6f7",
  "serviceId": "svc_deluxe",
  "requestedDurationSeconds": 240
}
```

---

### Step 13: Station Starts Deluxe Program Service (15:10:07.900)

The station's bay controller:

1. Validates that Bay 2 is still `Available`
2. Activates the dispenser relay on Bay 2
3. Starts the session timer at 240 seconds
4. Assigns local session ID `sess_a2b3c4d5e6f7` and offline transaction ID `otx_f6a7b8c9d0e1`

**BLE Notify FFF4 [MSG-038]:**

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_a2b3c4d5e6f7",
  "offlineTxId": "otx_f6a7b8c9d0e1"
}
```

Since the station is online, it also reports the session start to the server via MQTT:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_3b4c5d6e",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T15:10:08.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Occupied",
    "previousStatus": "Available",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

**What Bob sees:**

The app transitions to the SessionActiveScreen. The dispenser starts, and Bob hears the motor engage. The screen shows:

```
+----------------------------------+
|        Service in progress           |
|                                  |
|   Deluxe Program - Bay 2       |
|   [=>                     ]      |
|   0:00 elapsed   4:00 remaining  |
|                                  |
|   Mode: Partial Offline           |
|   Station: online (BLE + MQTT)    |
|                                  |
|   [Stop service]             |
+----------------------------------+
```

---

### Step 14: ServiceStatus Updates During Service (15:11:08.000 - 15:13:08.000)

The station sends periodic BLE status updates and MQTT meter values simultaneously.

**BLE Notify FFF5 [MSG-038] -- at 60 seconds:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "Running",
  "sessionId": "sess_a2b3c4d5e6f7",
  "elapsedSeconds": 60,
  "remainingSeconds": 180,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 85,
    "energyWh": 45
  }
}
```

**BLE Notify FFF5 [MSG-038] -- at 120 seconds:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "Running",
  "sessionId": "sess_a2b3c4d5e6f7",
  "elapsedSeconds": 120,
  "remainingSeconds": 120,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 170,
    "energyWh": 90
  }
}
```

**BLE Notify FFF5 [MSG-038] -- at 180 seconds:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "Running",
  "sessionId": "sess_a2b3c4d5e6f7",
  "elapsedSeconds": 180,
  "remainingSeconds": 60,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 255,
    "energyWh": 135
  }
}
```

Meanwhile, the station also sends periodic MQTT MeterValues [MSG-010] to the server every 60 seconds (MeterValuesInterval configured to 60s for this example; default is 15s):

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server` (at 60s)

```json
{
  "messageId": "msg_meter_4c5d6e7f",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T15:11:08.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "sessionId": "sess_d5e6f7a8b9c0",
    "timestamp": "2026-02-13T15:11:08.000Z",
    "values": {
      "consumableMl": 85,
      "energyWh": 45
    }
  }
}
```

Bob sees the timer count up and the progress bar advance steadily.

---

### Step 15: Timer Expires -- Station Auto-Stops (15:14:08.000)

The 240-second timer expires. The station automatically stops the dispenser without waiting for a StopServiceRequest from the app.

The station's bay controller:

1. Detects timer expiry at 240 seconds
2. Sends relay-off signal to the dispenser on Bay 2
3. Reads final meter values
4. Calculates actual duration: exactly 240 seconds
5. Calculates credits: `ceil(240 / 60) * 12 = 4 * 12 = 48 credits`

**BLE Notify FFF4 [MSG-037]:**

```json
{
  "type": "StopServiceResponse",
  "result": "Accepted",
  "actualDurationSeconds": 240,
  "creditsCharged": 48
}
```

**What Bob sees:**

The app timer reaches `4:00` and the progress bar fills completely. A notification appears: "Service completed — time expired" (Service complete — time expired).

---

### Step 16: Station Reports Completion via MQTT (15:14:08.200)

Since the station is online, it reports the bay status change in real-time:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_5d6e7f8a",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T15:14:08.200Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Finishing",
    "previousStatus": "Occupied",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

The server updates session `sess_d5e6f7a8b9c0` to `completed`. Since the full 4 minutes were used, there is no refund.

| Field | Value |
|-------|-------|
| Pre-debited credits | 48 |
| Actual credits used | 48 |
| Refund | 0 |
| Bob's balance | 47 credits (unchanged) |

---

### Step 17: Station Generates Receipt (15:14:09.000)

The station generates a signed receipt:

1. Serializes the transaction data as canonical JSON
2. Encodes as Base64 (`receipt.data`)
3. Computes SHA-256 digest of the data
4. Signs with the station's ECDSA P-256 private key
5. Increments `txCounter` to 9

**BLE Notify FFF5 [MSG-038] -- ReceiptReady:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "ReceiptReady",
  "sessionId": "sess_a2b3c4d5e6f7",
  "elapsedSeconds": 240,
  "remainingSeconds": 0
}
```

---

### Step 18: App Reads Receipt from FFF6 (15:14:09.500)

**BLE Read FFF6 [MSG-039]:**

```json
{
  "offlineTxId": "otx_f6a7b8c9d0e1",
  "bayId": "bay_a2b3c4d5e6f7",
  "serviceId": "svc_deluxe",
  "startedAt": "2026-02-13T15:10:08.000Z",
  "endedAt": "2026-02-13T15:14:08.000Z",
  "durationSeconds": 240,
  "creditsCharged": 48,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 340,
    "energyWh": 180
  },
  "receipt": {
    "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9wYl9mNmc3aDhpOSIsImJheUlkIjoiYmF5X2EyYjNjNCIsInNlcnZpY2VJZCI6InN2Y193YXgiLCJkdXJhdGlvbiI6MjQwLCJjcmVkaXRzIjo0OH0=",
    "signature": "MEUCIQDnKp3TvR8yWz0aOxCqFb5sE7nGdT2fYiJwKxQhRgAiEAK7x2kR9wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgU=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 9
}
```

The app stores the receipt locally. Since the phone is offline, the app cannot sync immediately, but it does not need to — the station already reported everything to the server via MQTT in real-time.

---

### Step 19: Station Sends Bay Available via MQTT (15:14:10.000)

After the hardware wind-down, Bay 2 returns to `Available`:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_6e7f8a9b",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T15:14:10.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Available",
    "previousStatus": "Finishing",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

---

### Step 20: App Displays Session Summary (15:14:10.500)

**What Bob sees:**

The app transitions to the SessionCompletedScreen:

```
+----------------------------------+
|        Service completed        |
|                                  |
|   Deluxe Program - Bay 2       |
|   Duration: 4m 0s (complete)      |
|                                  |
|   Credits used:        48   |
|   Refund:                    0   |
|                                  |
|   Estimated balance: ~47 credits      |
|   (exact balance on reconnect)   |
|                                  |
|   Consumable: 340mL | Energy: 180Wh |
|                                  |
|   Mode: Partial Offline (BLE)     |
|   Server: validated in real-time   |
|                                  |
|  [Rate service]  [Home]   |
+----------------------------------+
```

The app shows an "estimated" balance because Bob's phone is offline and cannot query the server. The actual balance (47 credits) is confirmed when connectivity is restored. The "Server: validated in real-time" note tells Bob that his OfflinePass was verified by the server, providing full billing accuracy.

---

### Step 21: What the Operator Sees

On the Operator Dashboard, Charlie sees the session in real-time because the station is online:

1. Bay 2 indicator transitions from green-solid ("Available") to green-pulsing ("In use") to yellow ("Finishing") to green-solid ("Available")
2. The session log shows the full lifecycle:

```
[15:10:07] Session sess_d5e6f7a8b9c0 started (Partial B)
           User: Bob | Bay 2 | Deluxe Program
           Auth: OfflinePass opass_a8b9c0d1e2f3 (validated by server)

[15:14:08] Session sess_d5e6f7a8b9c0 completed
           Duration: 4m 0s | Credits: 48/48 (no refund)
           Consumable: 340mL | Energy: 180Wh
           Station sync: Complete (online throughout)
```

3. The station revenue counter updates: +48 credits for this session
4. No reconciliation flags — the session was tracked in real-time over MQTT

## Message Sequence Diagram

```
  Bob (App)            Station (stn_a1b2c3d4)          Server
     |                          |                          |
     | -- BLE connect --------->|                          |
     |                          |                          |
     | -- Read FFF1 ----------->|                          |
     |<------ StationInfo (online) ---|                    |
     |                          |                          |
     | -- Read FFF2 ----------->|                          |
     |<------ AvailableServices |                          |
     |                          |                          |
     | [biometric confirm]      |                          |
     |                          |                          |
     | -- Write FFF3: Hello --->|                          |
     |<------ FFF4: Challenge (online)                     |
     |                          |                          |
     | -- Write FFF3: OfflineAuthRequest ---------------->|
     |                          |  AuthorizeOfflinePass    |
     |                          |  REQUEST [MQTT] -------->|
     |                          |                  validate |
     |                          |                  pass     |
     |                          |                  debit 48 |
     |                          |  AuthorizeOfflinePass    |
     |                          |  RESPONSE (Accepted) <---|
     |<------ FFF4: AuthResponse (Accepted)               |
     |                          |                          |
     | -- Write FFF3: StartServiceRequest --------------->|
     |                          | start service                |
     |<------ FFF4: StartServiceResponse                 |
     |                          |  StatusNotif (Occupied)  |
     |                          |------------------------->|
     |                          |                          |
     |<------ FFF5: ServiceStatus (Running, 60s)           |
     |                          |  MeterValues [MQTT]      |
     |                          |------------------------->|
     |<------ FFF5: ServiceStatus (Running, 120s)          |
     |                          |  MeterValues [MQTT]      |
     |                          |------------------------->|
     |<------ FFF5: ServiceStatus (Running, 180s)          |
     |                          |  MeterValues [MQTT]      |
     |                          |------------------------->|
     |                          |                          |
     |                          | timer expires (240s)     |
     |                          | stop service                 |
     |<------ FFF4: StopServiceResponse (240s, 48cr)     |
     |                          |  StatusNotif (Finishing)  |
     |                          |------------------------->|
     |                          |                          |
     |                          |  StatusNotif (Available)  |
     |                          |------------------------->|
     |                          |                          |
     |<------ FFF5: ServiceStatus (ReceiptReady)          |
     |                          |                          |
     | -- Read FFF6: Receipt -->|                          |
     |<------ Receipt (ECDSA)   |                          |
     |                          |                          |
     | -- BLE disconnect ------>|                          |
     |                          |                          |
```

## Key Design Decisions

1. **Station does NOT validate locally in Partial B.** When the station is online, it always forwards the OfflinePass to the server for real-time validation. This is strictly better than local validation because the server can check the user's current balance, verify the pass has not been revoked since issuance, and debit the wallet immediately. The 10 local validation checks (see Flow 5a) are only used as a fallback.

2. **Server debits wallet at authorization time.** The server debits Bob's wallet at step 9, before the service even starts. This matches the online flow behavior and prevents the user from starting multiple sessions with the same credits. There is no risk of over-billing because the amount is calculated from the requested duration.

3. **No reconciliation needed.** Because the station is online throughout the session, all events (StatusNotification, MeterValues) are sent to the server in real-time via MQTT. The session is fully tracked server-side. The receipt generated on FFF6 serves as a local record for Bob but does not trigger a TransactionEvent reconciliation.

4. **MQTT fallback if AuthorizeOfflinePass times out.** If the server does not respond within 15 seconds, the station falls back to local validation (as in Full Offline, Flow 5a). This graceful degradation ensures the user is not stuck if MQTT has a momentary hiccup. The spec defines this in section 5c error paths.

5. **Dual-channel reporting.** During the session, the station sends updates on both BLE (ServiceStatus on FFF5 to the app) and MQTT (MeterValues to the server). These are independent channels. The BLE updates provide real-time UI feedback to Bob, while the MQTT events feed the operator dashboard and billing system.

6. **Timer expiry triggers auto-stop.** Bob did not manually stop the session — the 240-second timer expired naturally. The station auto-stops and generates the receipt without requiring a StopServiceRequest from the app. The app detects the stop via the StopServiceResponse notification on FFF4 and the ReceiptReady status on FFF5.
