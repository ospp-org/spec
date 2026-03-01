# Flow 05: Partial A Session (Phone Online, Station Offline)

## Scenario

Alice is at "Station Alpha -- Example City" and wants to start the Eco Program service on Bay 1. Her phone has 4G connectivity, but the station's MQTT connection is down due to an ISP fiber cut in the area. The station has been offline for about 20 minutes, but its BLE radio is advertising normally. Alice opens the app, which detects the station via BLE and reads that it reports `connectivity: "Offline"`. Since her phone is online, the app uses the **Partial A** strategy: it calls `POST /sessions/offline-auth` to obtain a server-signed ECDSA P-256 authorization, then delivers it to the station over BLE. The station verifies the signature locally using the server's public key stored in NVS. Alice runs a 3-minute Eco Program session on Bay 1, stops, and receives a signed receipt. Credits were debited server-side at step 1, so no reconciliation is needed for billing.

## Participants

| Actor | Identity |
|-------|----------|
| User | Alice (`sub_alice2026`), device `device_a8f3bc12e4567890` |
| App | the mobile app v2.1.0 (React Native / Expo) |
| Server | CSMS (`api.example.com`) |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp (MQTT offline, BLE active) |
| Bay | `bay_c1d2e3f4a5b6` (Bay 1) |
| Service | `svc_eco` (Eco Program, 10 credits/min, metered) |

## Pre-conditions

- Alice is authenticated in the app (valid JWT access token)
- Alice's wallet balance: 120 credits
- Station `stn_a1b2c3d4` has been offline (MQTT disconnected) for ~20 minutes
- Station BLE is advertising as `OSPP-b2c3d4`
- Station has the server's ECDSA P-256 verify key (`OfflinePassPublicKey`) stored in NVS
- Station `OfflineModeEnabled` configuration is `true`
- Bay 1 status: `Available`

## Timeline

```
14:30:00.000  Alice opens the app near the station
14:30:01.500  App discovers BLE device OSPP-b2c3d4
14:30:02.000  App establishes BLE connection to station
14:30:02.300  App reads FFF1 (StationInfo) — sees connectivity: "Offline"
14:30:02.600  App reads FFF2 (AvailableServices) — sees Bay 1 Available with svc_eco
14:30:03.000  Alice selects Bay 1, Eco Program, 5 minutes
14:30:05.000  App detects Partial A scenario (phone online + station offline)
14:30:05.200  App sends POST /sessions/offline-auth to server
14:30:05.800  Server validates, debits 50 credits, signs ECDSA P-256 authorization
14:30:06.000  Server responds with signedAuthorization + sessionId
14:30:06.500  App writes Hello to FFF3
14:30:06.800  Station responds with Challenge on FFF4 (connectivity: "Offline")
14:30:07.200  App writes ServerSignedAuth to FFF3
14:30:07.500  Station verifies ECDSA P-256 signature — valid
14:30:07.600  Station sends AuthResponse (Accepted) on FFF4
14:30:08.000  App writes StartServiceRequest to FFF3
14:30:08.400  Station activates dispenser on Bay 1
14:30:08.500  Station sends StartServiceResponse (Accepted) on FFF4
14:30:08.500  Eco Program service begins — timer starts at 300 seconds
14:31:08.000  ServiceStatus update: 60s elapsed, 240s remaining
14:32:08.000  ServiceStatus update: 120s elapsed, 180s remaining
14:33:02.000  Alice taps "Stop service" — app writes StopServiceRequest
14:33:02.400  Station deactivates dispenser, reads meters
14:33:02.600  Station sends StopServiceResponse (174s, 30 credits)
14:33:03.000  Station generates ECDSA receipt, increments txCounter
14:33:03.200  Station sends ServiceStatus (ReceiptReady)
14:33:03.500  App reads Receipt from FFF6, stores in offline tx log
14:33:04.000  App disconnects BLE
14:33:04.500  App displays session summary to Alice
```

## Step-by-Step Detail

---

### Step 1: App Discovers Station via BLE (14:30:01.500)

**What Alice sees:**

Alice opens the app at the station. The app begins a BLE scan and discovers a device advertising as `OSPP-b2c3d4`. The HomeScreen shows a card: "Station found: SSP-3000 — Station Alpha -- Example City".

---

### Step 2: App Reads StationInfo from FFF1 (14:30:02.300)

The app establishes a BLE connection and reads the StationInfo characteristic.

**BLE Read FFF1 [MSG-027]:**

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "1.2.3",
  "bayCount": 2,
  "bleProtocolVersion": "0.1.0",
  "connectivity": "Offline"
}
```

The app sees `connectivity: "Offline"` — the station's MQTT is down. Since the phone has internet, the app's ConnectivityDetector identifies this as a **Partial A** scenario.

---

### Step 3: App Reads AvailableServices from FFF2 (14:30:02.600)

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
        }
      ]
    }
  ]
}
```

Alice sees the service catalog. She selects Bay 1 and "Eco Program" (10 credits/min) for 5 minutes (50 credits max).

---

### Step 4: App Requests Server-Signed Authorization (14:30:05.200)

Since this is Partial A (phone online, station offline), the app calls the server to obtain a signed authorization before the BLE handshake proceeds.

**HTTP Request:**

```http
POST /api/v1/sessions/offline-auth HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_offauth_7d8e9f01

{
  "stationId": "stn_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300
}
```

---

### Step 5: Server Validates and Signs Authorization (14:30:05.800)

The server performs the following:

1. Validates the JWT — user is `sub_alice2026`
2. Confirms user has sufficient balance: 120 credits >= 50 credits (5 min x 10 credits/min)
3. Confirms user has no other active session
4. Notes that station `stn_a1b2c3d4` is currently offline (last heartbeat missed) — proceeds optimistically
5. Debits 50 credits from Alice's wallet (balance: 120 - 50 = 70)
6. Creates session record `sess_c4d5e6f7a8b9` with `status: pending` (awaiting reconciliation from station)
7. Signs an authorization blob with the server's ECDSA P-256 private key

The authorization blob contains `stationId`, `bayId`, `serviceId`, `durationSeconds`, `issuedAt`, `expiresAt` (5-minute validity window), and the ECDSA P-256 signature.

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_offauth_7d8e9f01

{
  "sessionId": "sess_c4d5e6f7a8b9",
  "signedAuthorization": "eyJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJiYXlJZCI6ImJheV94MXkyejMiLCJzZXJ2aWNlSWQiOiJzdmNfZm9hbSIsImR1cmF0aW9uU2Vjb25kcyI6MzAwLCJpc3N1ZWRBdCI6IjIwMjYtMDItMTNUMTQ6MzA6MDUuODAwWiIsImV4cGlyZXNBdCI6IjIwMjYtMDItMTNUMTQ6MzU6MDUuODAwWiIsInNpZ25hdHVyZSI6IlRWUnNWbFV5VVhsUFJFVjNUa1JCTlUxRVVURk9SRTB4VGtSbk1rNTZaM2hOYWxrd1RtcEJNVTFVVVRWTmVtUm9UbnBKZVU1dFJUMD0ifQ==",
  "wallet": {
    "previousBalance": 120,
    "newBalance": 70
  }
}
```

---

### Step 6: App Sends Hello via BLE (14:30:06.500)

With the signed authorization in hand, the app proceeds with the BLE handshake.

**BLE Write FFF3 [MSG-029]:**

```json
{
  "type": "Hello",
  "deviceId": "device_a8f3bc12e4567890",
  "appNonce": "k7Rz2mPqXvN8dF5sYwB1cA0hJ6tL9oKe3iGnUxMpWbQ=",
  "appVersion": "2.1.0"
}
```

---

### Step 7: Station Responds with Challenge (14:30:06.800)

The station generates its own nonce and reports its connectivity status.

**BLE Notify FFF4 [MSG-030]:**

```json
{
  "type": "Challenge",
  "stationNonce": "Qm4xR9vTfH2wLpZjK0sNcYgX5uOdA8rE1iBn6CtJkWe=",
  "stationConnectivity": "Offline",
  "availableServices": [
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_deluxe", "available": true },
    { "bayId": "bay_a2b3c4d5e6f7", "serviceId": "svc_eco", "available": true }
  ]
}
```

The `stationConnectivity: "Offline"` confirms the Partial A scenario. The app derives the BLE session key:

```
SessionKey = HKDF-SHA256(
  ikm   = LTK || appNonce || stationNonce,
  salt  = "OSPP_BLE_SESSION_V1",
  info  = "device_a8f3bc12e4567890" || "stn_a1b2c3d4",
  length = 32
)
```

---

### Step 8: App Sends ServerSignedAuth via BLE (14:30:07.200)

The app delivers the server-signed authorization obtained in Step 5.

**BLE Write FFF3 [MSG-032]:**

```json
{
  "type": "ServerSignedAuth",
  "signedAuthorization": "eyJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJiYXlJZCI6ImJheV94MXkyejMiLCJzZXJ2aWNlSWQiOiJzdmNfZm9hbSIsImR1cmF0aW9uU2Vjb25kcyI6MzAwLCJpc3N1ZWRBdCI6IjIwMjYtMDItMTNUMTQ6MzA6MDUuODAwWiIsImV4cGlyZXNBdCI6IjIwMjYtMDItMTNUMTQ6MzU6MDUuODAwWiIsInNpZ25hdHVyZSI6IlRWUnNWbFV5VVhsUFJFVjNUa1JCTlUxRVVURk9SRTB4VGtSbk1rNTZaM2hOYWxrd1RtcEJNVTFVVVRWTmVtUm9UbnBKZVU1dFJUMD0ifQ==",
  "sessionId": "sess_c4d5e6f7a8b9"
}
```

---

### Step 9: Station Verifies ECDSA P-256 Signature (14:30:07.500)

The station decodes the `signedAuthorization` Base64 blob and performs the following checks:

1. **ECDSA P-256 signature verification** — using `OfflinePassPublicKey` stored in NVS (cached previous key also accepted during the grace period)
2. **stationId matches** — the authorization is for `stn_a1b2c3d4` (this station)
3. **bayId is valid** — `bay_c1d2e3f4a5b6` exists on this station
4. **serviceId is valid** — `svc_eco` is in the local catalog
5. **Not expired** — `expiresAt` (14:35:05.800Z) is in the future
6. **Duration is within limits** — 300 seconds does not exceed `MaxSessionDurationSeconds`

All checks pass. The station accepts the authorization.

---

### Step 10: Station Sends AuthResponse (Accepted) (14:30:07.600)

**BLE Notify FFF4 [MSG-033]:**

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "pLm3KxNv8dRqWz0hYcFj5sTbAeOiG7nU2JfBwXtIk6o="
}
```

The `sessionKeyConfirmation` proves both sides derived the same session key via HKDF-SHA256.

**What Alice sees:**

The app shows a brief green checkmark animation with "Authorization accepted".

---

### Step 11: App Sends StartServiceRequest (14:30:08.000)

**BLE Write FFF3 [MSG-034]:**

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300
}
```

---

### Step 12: Station Starts Eco Program Service (14:30:08.400)

The station's bay controller:

1. Validates that Bay 1 is still `Available`
2. Activates the dispenser relay on Bay 1
3. Starts the session timer at 300 seconds
4. Assigns local session ID `sess_f1a2b3c4d5e6` and offline transaction ID `otx_e5f6a7b8c9d0`

**BLE Notify FFF4 [MSG-038]:**

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_f1a2b3c4d5e6",
  "offlineTxId": "otx_e5f6a7b8c9d0"
}
```

**What Alice sees:**

The app transitions to the SessionActiveScreen. The dispenser starts, and Alice hears the service start up. The screen shows:

```
+----------------------------------+
|        Service in progress           |
|                                  |
|   Eco Program - Bay 1           |
|   [=========>          ]         |
|   0:00 elapsed   5:00 remaining  |
|                                  |
|   Mode: Partial Offline           |
|   Station: offline (BLE)          |
|                                  |
|   [Stop service]             |
+----------------------------------+
```

---

### Step 13: ServiceStatus Updates During Service (14:31:08.000 - 14:32:08.000)

The station sends periodic status updates over BLE FFF5.

**BLE Notify FFF5 [MSG-038] — at 60 seconds:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_f1a2b3c4d5e6",
  "elapsedSeconds": 60,
  "remainingSeconds": 240,
  "meterValues": {
    "liquidMl": 15200,
    "consumableMl": 180
  }
}
```

**BLE Notify FFF5 [MSG-038] — at 120 seconds:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_f1a2b3c4d5e6",
  "elapsedSeconds": 120,
  "remainingSeconds": 180,
  "meterValues": {
    "liquidMl": 30100,
    "consumableMl": 360
  }
}
```

Alice sees the timer tick up and the progress bar advance. The meter readings update in real time.

---

### Step 14: Alice Taps Stop (14:33:02.000)

**What Alice sees:**

At about 2 minutes 54 seconds, Alice decides the car is clean. She taps "Stop service". The app shows a confirmation dialog:

> **Stop service?**
> Unused credits have already been processed by the server.
> [Cancel] [Stop]

Alice taps "Stop".

**BLE Write FFF3 [MSG-036]:**

```json
{
  "type": "StopServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "sessionId": "sess_f1a2b3c4d5e6"
}
```

---

### Step 15: Station Stops Service and Reports (14:33:02.400)

The station's bay controller:

1. Sends relay-off signal to the dispenser on Bay 1
2. Reads final meter values
3. Calculates actual duration: started at 14:30:08.500, stopped at 14:33:02.400 = 174 seconds
4. Calculates credits: `ceil(174 / 60) * 10 = 3 * 10 = 30 credits`

**BLE Notify FFF4 [MSG-037]:**

```json
{
  "type": "StopServiceResponse",
  "result": "Accepted",
  "actualDurationSeconds": 174,
  "creditsCharged": 30
}
```

---

### Step 16: Station Generates Receipt (14:33:03.000)

The station generates a signed receipt:

1. Serializes the transaction data as canonical JSON
2. Encodes as Base64 (`receipt.data`)
3. Computes SHA-256 digest of the data
4. Signs with the station's ECDSA P-256 private key
5. Increments `txCounter` to 8

**BLE Notify FFF5 [MSG-038] — ReceiptReady:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_f1a2b3c4d5e6",
  "elapsedSeconds": 174,
  "remainingSeconds": 0
}
```

---

### Step 17: App Reads Receipt from FFF6 (14:33:03.500)

**BLE Read FFF6 [MSG-039]:**

```json
{
  "offlineTxId": "otx_e5f6a7b8c9d0",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-02-13T14:30:08.500Z",
  "endedAt": "2026-02-13T14:33:02.400Z",
  "durationSeconds": 174,
  "creditsCharged": 30,
  "meterValues": {
    "liquidMl": 39800,
    "consumableMl": 470,
    "energyWh": 120
  },
  "receipt": {
    "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9wYV9lNWY2ZzdoOCIsImJheUlkIjoiYmF5X3gxeTJ6MyIsInNlcnZpY2VJZCI6InN2Y19mb2FtIiwiZHVyYXRpb24iOjE3NCwiY3JlZGl0cyI6MzB9",
    "signature": "MEQCIGpXvN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQAiALvHaRH3A/PmY28encskVtipPWxdwDSMp7p9mhacGBQh",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 8
}
```

The app stores this receipt in its offline transaction log. Since Alice's phone is online, the app can also immediately sync this receipt with the server.

---

### Step 18: App Displays Session Summary (14:33:04.500)

**What Alice sees:**

The app transitions to the SessionCompletedScreen:

```
+----------------------------------+
|        Service completed        |
|                                  |
|   Eco Program - Bay 1           |
|   Duration: 2m 54s                 |
|                                  |
|   Credits debited (server): 50   |
|   Credits used:            30    |
|   Refund pending:          +20   |
|                                  |
|   Current balance: 70 credits        |
|   (refund: ~90 credits)      |
|                                  |
|   Liquid: 39.8L | Consumable: 470mL     |
|                                  |
|   Mode: Partial Offline (BLE)     |
|                                  |
|  [Rate service]  [Home]   |
+----------------------------------+
```

Since the server pre-debited 50 credits but only 30 were used, the app notifies the server of the actual usage. The server will refund the remaining 20 credits once it receives the reconciliation data from the station (or from the app's own sync).

---

### Step 19: App Syncs with Server (14:33:05.000)

Since Alice's phone is online, the app immediately sends the receipt to the server as a backup reconciliation path:

**HTTP Request:**

```http
POST /api/v1/me/offline-txs HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_sync_9e0f1a2b

{
  "transactions": [
    {
      "offlineTxId": "otx_e5f6a7b8c9d0",
      "sessionId": "sess_c4d5e6f7a8b9",
      "stationId": "stn_a1b2c3d4",
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_eco",
      "startedAt": "2026-02-13T14:30:08.500Z",
      "endedAt": "2026-02-13T14:33:02.400Z",
      "durationSeconds": 174,
      "creditsCharged": 30,
      "receipt": {
        "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9wYV9lNWY2ZzdoOCIsImJheUlkIjoiYmF5X3gxeTJ6MyIsInNlcnZpY2VJZCI6InN2Y19mb2FtIiwiZHVyYXRpb24iOjE3NCwiY3JlZGl0cyI6MzB9",
        "signature": "MEQCIGpXvN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQAiALvHaRH3A/PmY28encskVtipPWxdwDSMp7p9mhacGBQh",
        "signatureAlgorithm": "ECDSA-P256-SHA256"
      },
      "txCounter": 8
    }
  ]
}
```

The server receives this, verifies the ECDSA receipt, and processes the refund:

| Field | Value |
|-------|-------|
| Pre-debited credits | 50 |
| Actual credits used | 30 |
| Refund | 50 - 30 = **20 credits** |
| Alice's new balance | 70 + 20 = **90 credits** |

---

### Step 20: What the Operator Sees

On the Operator Dashboard, Charlie sees:

1. Station `stn_a1b2c3d4` is marked as **Offline** (red indicator) — MQTT disconnected
2. A new session log entry appears (from the app-side sync):

```
[14:33:05] Session sess_c4d5e6f7a8b9 completed (Partial A)
           User: Alice | Bay 1 | Eco Program
           Duration: 2m 54s | Credits: 30/50 (20 refunded)
           Liquid: 39.8L | Consumable: 470mL
           Auth: Server-signed ECDSA P-256 (delivered via BLE)
           Station sync: Pending (station offline)
```

3. The session is marked as `completed` but flagged "Station sync pending" — full reconciliation will occur when the station's MQTT reconnects and sends TransactionEvent [MSG-007]

## Message Sequence Diagram

```
  Alice(App)              Server                  Station (stn_a1b2c3d4)
     |                      |                          |
     |                      |              [MQTT down]  |
     |                      |                          |
     | -- BLE connect ------|------------------------->|
     |                      |                          |
     | -- Read FFF1 --------|------------------------->|
     |<-------- StationInfo (offline) -----------------|
     |                      |                          |
     | -- Read FFF2 --------|------------------------->|
     |<-------- AvailableServices ---------------------|
     |                      |                          |
     |  POST /offline-auth  |                          |
     |--------------------->|                          |
     |                      | validate, debit 50cr     |
     |                      | sign ECDSA P-256 auth        |
     |  200 OK (signedAuth) |                          |
     |<---------------------|                          |
     |                      |                          |
     | -- Write FFF3: Hello -------------------------->|
     |<-------- FFF4: Challenge (offline) -------------|
     |                      |                          |
     | -- Write FFF3: ServerSignedAuth ------------->|
     |                      |                  verify  |
     |                      |                 ECDSA P-256  |
     |<-------- FFF4: AuthResponse (Accepted) --------|
     |                      |                          |
     | -- Write FFF3: StartServiceRequest ---------->|
     |                      |                  start   |
     |                      |                  pump    |
     |<-------- FFF4: StartServiceResponse ----------|
     |                      |                          |
     |<-------- FFF5: ServiceStatus (Running, 60s) ----|
     |<-------- FFF5: ServiceStatus (Running, 120s) ---|
     |                      |                          |
     | -- Write FFF3: StopServiceRequest ----------->|
     |                      |                  stop    |
     |                      |                  pump    |
     |<-------- FFF4: StopServiceResponse (174s) ----|
     |<-------- FFF5: ServiceStatus (ReceiptReady) ---|
     |                      |                          |
     | -- Read FFF6: Receipt ------------------------->|
     |<-------- Receipt (ECDSA signed) ----------------|
     |                      |                          |
     | -- BLE disconnect -->|                          |
     |                      |                          |
     |  POST /me/offline-txs|                          |
     |--------------------->|                          |
     |                      | verify receipt           |
     |                      | refund 20 credits        |
     |  200 OK              |                          |
     |<---------------------|                          |
     |                      |                          |
```

## Key Design Decisions

1. **Credits are debited server-side before the BLE handshake.** In Partial A, the server is reachable, so billing happens upfront at step 5. This means the station does not need to make credit decisions locally. The server pre-debits the maximum (50 credits for 5 minutes) and refunds the difference after actual usage is known.

2. **ECDSA P-256 signature provides server trust without connectivity.** The station trusts the authorization because it can verify the server's ECDSA P-256 signature using `OfflinePassPublicKey` stored in NVS during provisioning. No network round-trip is needed. During key rotation the station also accepts the internally cached previous key for a grace period (300 seconds).

3. **The signed authorization has a 5-minute expiry window.** The `expiresAt` field prevents replay attacks. If Alice takes more than 5 minutes between obtaining the authorization and presenting it to the station via BLE, the station will reject it. This is a deliberate trade-off between security and usability.

4. **App-side sync provides a fast reconciliation path.** Since Alice's phone is online, the app can immediately sync the receipt with the server. This means the refund happens within seconds, not hours. The station will also send a TransactionEvent when MQTT reconnects, but the server will deduplicate it as `Duplicate`.

5. **The receipt is signed with ECDSA P-256 regardless of online status.** Even though the server already knows about this session (it created it at step 5), the station still generates a cryptographic receipt. This provides non-repudiation and allows the server to verify that the station actually delivered the service as authorized.

6. **The station continues to operate in BLE-only mode.** The MQTT outage does not prevent the station from serving customers. As long as users can reach the server (Partial A) or have an OfflinePass (Full Offline), the station remains functional through BLE.
