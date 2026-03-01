# Flow 02: Online Session via Mobile App

## Scenario

Alice opens the app on her phone while parked at "Station Alpha -- Example City". She selects Bay 1, chooses "Eco Program" (eco program) at 10 credits/minute, and starts a 5-minute session. The server validates her request, debits 50 credits from her wallet, and sends a StartService command to the station via MQTT. The station activates the dispenser, and Alice watches the live timer in the app. Every fifteen seconds the station reports meter values. After exactly 5 minutes the timer expires, the station automatically stops the dispenser, and the session completes with zero refund (full duration consumed). This flow covers the happy path from tap-to-start through natural timer expiry — early user-initiated stops are covered in Flow 07.

## Participants

| Actor | Identity |
|-------|----------|
| User | Alice (`sub_alice2026`), device `device_a8f3bc12e4567890` |
| App | the mobile app (React Native / Expo) |
| Server | CSMS (`api.example.com`) — CSMS |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| Bay | `bay_c1d2e3f4a5b6` (Bay 1) |
| Service | `svc_eco` (Eco Program, 10 credits/min, metered) |

## Pre-conditions

- Station `stn_a1b2c3d4` is online (BootNotification Accepted, heartbeat running)
- Bay 1 (`bay_c1d2e3f4a5b6`) status: `Available`
- Alice is authenticated (valid JWT access token)
- Alice's wallet balance: 120 credits
- Alice has no other active session
- Protocol version: 1.0.0

## Timeline

```
10:00:00.000  Alice opens the app, views the station map
10:00:05.000  Alice selects Bay 1 and "Eco Program" service
10:00:08.000  Alice taps "Start service" (Start service)
10:00:08.200  App sends POST /sessions/start to server
10:00:08.500  Server validates, debits 50 credits, creates session (pending_ack)
10:00:08.700  Server publishes StartService REQUEST via MQTT
10:00:09.100  Station receives StartService, activates dispenser on Bay 1
10:00:09.400  Station sends StartService RESPONSE (Accepted)
10:00:09.500  Station sends StatusNotification: Available -> Occupied
10:00:09.800  Server updates session to active, responds 201 to app
10:00:10.000  App displays SessionActiveScreen with live timer
10:00:13.000  App polls GET /sessions/sess_f7e8d9c0/status (first poll)
10:00:24.100  Station sends first MeterValues (15s into session)
10:00:39.100  Station sends second MeterValues (30s)
10:00:54.100  Station sends third MeterValues (45s)
              ... MeterValues every 15s ...
10:04:54.100  Station sends 19th MeterValues (285s)
10:05:09.100  Timer expires — station auto-stops dispenser
10:05:09.400  Station sends StatusNotification: Occupied -> Finishing
10:05:10.800  Station sends StatusNotification: Finishing -> Available
10:05:11.000  Server marks session completed, no refund (full duration used)
10:05:13.000  App polls, receives status: completed
10:05:13.500  App displays SessionCompletedScreen
```

## Step-by-Step Detail

---

### Step 1: Alice Selects Bay and Service (10:00:05.000)

**What Alice sees:**

Alice opens the app and sees the station "Station Alpha -- Example City" on the map. She taps it and sees the bay list:

```
+----------------------------------+
|  Station Alpha -- Example City  |
|  SSP-3000                 |
|                                  |
|  Bay 1  [Available]             |
|  Bay 2  [Available]             |
|  Bay 3  [Available]             |
|                                  |
|  Balance: 120 credits               |
+----------------------------------+
```

She taps Bay 1, then sees the service selection screen:

```
+----------------------------------+
|  Bay 1 - Select service        |
|                                  |
|  [*] Eco Program    10 cr/min   |
|  [ ] Standard Program       8 cr/min   |
|  [ ] Deluxe Program           12 cr/min   |
|                                  |
|  Duration: 5 minutes                |
|  Estimated cost: 50 credits        |
|                                  |
|  [Start service]               |
+----------------------------------+
```

Alice selects "Eco Program" for 5 minutes (50 credits estimated) and taps "Start service".

---

### Step 2: App Sends Start Request (10:00:08.200)

**HTTP Request:**

```http
POST /api/v1/sessions/start HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_start_2c3d4e5f

{
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "durationMinutes": 5
}
```

---

### Step 3: Server Validates and Debits Credits (10:00:08.500)

The server performs the following validation checks:

| Check | Result |
|-------|--------|
| Bay `bay_c1d2e3f4a5b6` exists on station `stn_a1b2c3d4` | Pass |
| Bay status is `Available` | Pass |
| Station is online (MQTT connected) | Pass |
| Service `svc_eco` is in the station's catalog | Pass |
| User `sub_alice2026` has no active session | Pass |
| Wallet balance (120) >= cost (50) | Pass |

All checks pass. The server:

1. Debits 50 credits from Alice's wallet (120 - 50 = 70 remaining)
2. Creates session `sess_f7e8d9c0` with status `pending_ack`
3. Records the pre-authorization: 50 credits for 5 minutes at 10 credits/min

---

### Step 4: Server Publishes StartService REQUEST (10:00:08.700)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_start_6a7b8c9d",
  "messageType": "Request",
  "action": "StartService",
  "timestamp": "2026-02-13T10:00:08.700Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "durationSeconds": 300,
    "sessionSource": "MobileApp"
  }
}
```

The server starts a 10-second timer. If no response arrives, the session transitions to `failed` and 50 credits are refunded.

---

### Step 5: Station Activates Dispenser (10:00:09.100)

The station's bay controller receives the StartService command. It:

1. Verifies bay 1 is Available (hardware check, not just cached state)
2. Opens the relay for the dispenser on bay 1
3. Starts the water pressure pump
4. Arms the flow meter and energy meter
5. Starts the internal session timer for 300 seconds

---

### Step 6: Station Sends StartService RESPONSE (10:00:09.400)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_start_6a7b8c9d",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-02-13T10:00:09.400Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

---

### Step 7: Station Sends StatusNotification - Occupied (10:00:09.500)

Bay 1 transitions from `Available` to `Occupied`.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_occ_1b2c3d4e",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:00:09.500Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Occupied",
    "previousStatus": "Available",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

---

### Step 8: Server Responds to App (10:00:09.800)

The server receives the Accepted response, updates the session from `pending_ack` to `active`, and responds to Alice's app.

**HTTP Response:**

```http
HTTP/1.1 201 Created
Content-Type: application/json
X-Request-Id: req_start_2c3d4e5f

{
  "sessionId": "sess_f7e8d9c0",
  "status": "active",
  "bay": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1
  },
  "service": {
    "serviceId": "svc_eco",
    "name": "Eco Program",
    "ratePerMinute": 10,
    "rateType": "metered"
  },
  "timing": {
    "startedAt": "2026-02-13T10:00:09.100Z",
    "durationSeconds": 300,
    "estimatedEndAt": "2026-02-13T10:05:09.100Z"
  },
  "billing": {
    "creditsAuthorized": 50,
    "ratePerMinute": 10
  },
  "wallet": {
    "previousBalance": 120,
    "newBalance": 70
  }
}
```

---

### Step 9: App Displays Active Session (10:00:10.000)

**What Alice sees:**

The app transitions to the SessionActiveScreen:

```
+----------------------------------+
|        Service in progress           |
|                                  |
|   Eco Program - Bay 1           |
|                                  |
|         [00:01]                  |
|      of 05:00 minutes            |
|                                  |
|   ========>-----------           |
|   (progress bar)                 |
|                                  |
|   Credits: 50                    |
|   Remaining balance: 70                 |
|                                  |
|  [Stop service]              |
+----------------------------------+
```

The timer counts up from 00:00 toward 05:00. The progress bar fills from left to right.

---

### Step 10: App Polls Session Status (10:00:13.000)

The app begins polling every 3 seconds (6 seconds when in background) to track session progress.

**HTTP Request:**

```http
GET /api/v1/sessions/sess_f7e8d9c0/status HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
X-Device-Id: device_a8f3bc12e4567890
```

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "sessionId": "sess_f7e8d9c0",
  "status": "active",
  "service": {
    "serviceId": "svc_eco",
    "name": "Eco Program"
  },
  "timing": {
    "startedAt": "2026-02-13T10:00:09.100Z",
    "elapsedSeconds": 4,
    "remainingSeconds": 296,
    "durationSeconds": 300
  },
  "billing": {
    "creditsAuthorized": 50,
    "creditsConsumedEstimate": 1
  }
}
```

The app updates the timer display. This polling continues every 3 seconds for the entire session.

---

### Step 11: First MeterValues (10:00:24.100)

Fifteen seconds into the session, the station sends its first periodic meter reading.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_meter_1_a1b2c3d4",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T10:00:24.100Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "sessionId": "sess_f7e8d9c0",
    "timestamp": "2026-02-13T10:00:24.100Z",
    "values": {
      "liquidMl": 3700,
      "consumableMl": 100,
      "energyWh": 70
    }
  }
}
```

The server records these values. They are used for consumption analytics and operator reporting — billing is based on time, not meter readings.

---

### Step 12: Subsequent MeterValues (10:00:39.100 - 10:04:54.100)

The station sends a MeterValues notification every 15 seconds (`MeterValuesInterval` from boot config). Here are selected cumulative readings:

| Time | Elapsed | Water (mL) | Chemical (mL) | Energy (Wh) |
|------|---------|------------|---------------|-------------|
| 10:00:24 | 15s | 3700 | 100 | 70 |
| 10:00:39 | 30s | 7400 | 200 | 140 |
| 10:01:09 | 60s | 14800 | 400 | 280 |
| 10:02:09 | 120s | 30100 | 800 | 550 |
| 10:03:09 | 180s | 44700 | 1200 | 820 |
| 10:04:09 | 240s | 59900 | 1600 | 1100 |
| 10:04:54 | 285s | 71600 | 1900 | 1310 |

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server` (at 10:04:54.100)

```json
{
  "messageId": "msg_meter_19_d4e5f6a7",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T10:04:54.100Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "sessionId": "sess_f7e8d9c0",
    "timestamp": "2026-02-13T10:04:54.100Z",
    "values": {
      "liquidMl": 71600,
      "consumableMl": 1900,
      "energyWh": 1310
    }
  }
}
```

---

### Step 13: Timer Expires - Station Auto-Stops (10:05:09.100)

The station's internal timer reaches 300 seconds. The station automatically:

1. Closes the relay for the dispenser
2. Shuts down the water pressure pump
3. Reads final meter values
4. Begins the drain cycle (actuator retraction, residual fluid flush)

No StopService command from the server is needed — the station knows the authorized duration and handles timer expiry locally.

**Final meter readings at auto-stop:**

| Measurand | Value | Unit |
|-----------|-------|------|
| liquidMl | 75300 | mL |
| consumableMl | 2000 | mL |
| energyWh | 1380 | Wh |

---

### Step 14: Station Sends StatusNotification - Finishing (10:05:09.400)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_fin_4e5f6a7b",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:05:09.400Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Finishing",
    "previousStatus": "Occupied",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

---

### Step 15: Station Sends StatusNotification - Available (10:05:10.800)

After the drain cycle completes (about 1.4 seconds), bay 1 returns to `Available`.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_avl_8b9c0d1e",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:05:10.800Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Available",
    "previousStatus": "Finishing",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

---

### Step 16: Server Finalizes Session (10:05:11.000)

The server receives the Finishing notification with final meter values and billing data. It calculates:

| Field | Value |
|-------|-------|
| Pre-authorized credits | 50 |
| Service rate | 10 credits/min (metered) |
| Actual duration | 300 seconds (5m 0s) |
| Billed minutes | 300 / 60 = 5 minutes exactly |
| Credits charged | 5 x 10 = 50 credits |
| Refund | 50 - 50 = **0 credits** (full duration consumed) |

The server:
1. Marks session `sess_f7e8d9c0` as `completed`
2. No wallet adjustment needed (pre-auth equals actual charge)
3. Creates the final session record with meter values

---

### Step 17: App Receives Completion (10:05:13.000)

On the next poll (every 3 seconds), the app receives the completed status.

**HTTP Request:**

```http
GET /api/v1/sessions/sess_f7e8d9c0/status HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
X-Device-Id: device_a8f3bc12e4567890
```

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "sessionId": "sess_f7e8d9c0",
  "status": "completed",
  "stoppedBy": "timer",
  "service": {
    "serviceId": "svc_eco",
    "name": "Eco Program",
    "ratePerMinute": 10,
    "rateType": "metered"
  },
  "bay": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1
  },
  "timing": {
    "startedAt": "2026-02-13T10:00:09.100Z",
    "stoppedAt": "2026-02-13T10:05:09.100Z",
    "durationSeconds": 300,
    "durationFormatted": "5m 0s"
  },
  "billing": {
    "creditsPrepaid": 50,
    "creditsCharged": 50,
    "creditsRefunded": 0,
    "billedMinutes": 5,
    "ratePerMinute": 10
  },
  "wallet": {
    "previousBalance": 120,
    "newBalance": 70
  },
  "meterValues": {
    "liquidMl": 75300,
    "consumableMl": 2000,
    "energyWh": 1380
  }
}
```

---

### Step 18: App Displays Session Summary (10:05:13.500)

**What Alice sees:**

The app transitions to the SessionCompletedScreen:

```
+----------------------------------+
|       Service completed         |
|                                  |
|   Eco Program - Bay 1           |
|   Duration: 5m 0s                  |
|                                  |
|   Credits paid:    50         |
|   Credits used:  50         |
|   Refund:          0         |
|                                  |
|   Current balance: 70 credits        |
|                                  |
|   Liquid: 75.3L | Consumable: 2.0L  |
|                                  |
|  [Rate service]  [Home]   |
+----------------------------------+
```

The key message: **"Service completed. Duration: 5m 0s. Credits used: 50."**

---

### Step 19: What the Operator Sees

On the Operator Dashboard, Charlie sees:

1. At 10:00:09, Bay 1 indicator transitions from green ("Available") to blue-pulsing ("In use")
2. The active session card appears:

```
[10:00:09] Session sess_f7e8d9c0 started
           User: Alice | Bay 1 | Eco Program
           Duration: 5:00 | Credits: 50
```

3. At 10:05:09, Bay 1 transitions from blue to yellow ("Finishing") to green ("Available")
4. The session log updates:

```
[10:05:11] Session sess_f7e8d9c0 completed
           User: Alice | Bay 1 | Eco Program
           Duration: 5m 0s | Credits: 50/50 (0 refunded)
           Liquid: 75.3L | Consumable: 2.0L | Energy: 1.38kWh
```

5. The station revenue counter updates: +50 credits for this session

## Message Sequence Diagram

```
  Alice(App)              Server                  Station (stn_a1b2c3d4)
     |                      |                          |
     |  POST /sessions/     |                          |
     |  start               |                          |
     |--------------------->|                          |
     |                      | validate, debit 50 cr    |
     |                      | session: pending_ack     |
     |                      |                          |
     |                      |  StartService REQUEST    |
     |                      |------------------------->|
     |                      |                          | activate dispenser
     |                      |                          | start 300s timer
     |                      |  StartService RESPONSE   |
     |                      |<-------------------------|
     |                      |  StatusNotif (Occupied)   |
     |                      |<-------------------------|
     |                      |                          |
     |                      | session: active          |
     |  201 Created         |                          |
     |<---------------------|                          |
     |                      |                          |
     | show active screen   |                          |
     |                      |                          |
     |  GET /status (poll)  |                          |
     |--------------------->|                          |
     |  200 {active, 4s}    |                          |
     |<---------------------|                          |
     |                      |                          |
     |     ... polling every 3s ...                    |
     |                      |                          |
     |                      |  MeterValues (15s)       |
     |                      |<-------------------------|
     |                      |  MeterValues (30s)       |
     |                      |<-------------------------|
     |                      |  ... every 15s ...       |
     |                      |  MeterValues (285s)      |
     |                      |<-------------------------|
     |                      |                          |
     |                      |                          | timer expires (300s)
     |                      |                          | stop dispenser
     |                      |                          | drain cycle
     |                      |                          |
     |                      |  StatusNotif (Finishing)  |
     |                      |  + final meter values    |
     |                      |<-------------------------|
     |                      |                          |
     |                      | calculate billing        |
     |                      | session: completed       |
     |                      |                          |
     |                      |  StatusNotif (Available)  |
     |                      |<-------------------------|
     |                      |                          |
     |  GET /status (poll)  |                          |
     |--------------------->|                          |
     |  200 {completed}     |                          |
     |<---------------------|                          |
     |                      |                          |
     | show summary screen  |                          |
     |                      |                          |
```

## Key Design Decisions

1. **Server debits before sending StartService.** Credits are deducted at step 3, before the MQTT command reaches the station. This prevents a race condition where the station starts the service but the wallet debit fails. If the station rejects or times out, the server issues an automatic full refund.

2. **Timer expiry is station-side.** The station runs its own countdown timer. When `durationSeconds` elapses, the station stops the service autonomously — no StopService command from the server is needed. This ensures the service stops even if the MQTT connection drops mid-session.

3. **Polling, not WebSocket.** The app discovers session completion via polling (`GET /sessions/{id}/status` every 3 seconds). This is simpler than maintaining a WebSocket for the occasional 5-minute session, and the 3-second latency is imperceptible for a service session. In background, the interval doubles to 6 seconds to conserve battery.

4. **MeterValues are informational, not billing.** The station sends meter readings every 15 seconds for analytics and operator dashboards. Billing is strictly time-based: `creditsCharged = ceil(actualDurationSeconds / 60) * priceCreditsPerMinute`. This avoids disputes over meter calibration.

5. **Finishing state ensures clean shutdown.** After the dispenser stops, the bay enters `Finishing` for the drain cycle (residual fluid flush, actuator retraction). The bay does not return to `Available` until the hardware is fully idle. This prevents a new session from starting while equipment is still resetting.

6. **Zero refund on full consumption.** When the timer runs to completion (300 seconds = 5 minutes exactly), the billed amount equals the pre-authorized amount: `ceil(300/60) * 10 = 50 credits`. No wallet adjustment is needed. Partial refunds only occur when the user stops early (see Flow 07).

7. **Session source tracking.** The StartService REQUEST includes `sessionSource: "MobileApp"` so the server can distinguish between mobile app sessions, web payment sessions, and BLE offline sessions. This enables per-channel analytics and different retry policies (mobile app: single attempt; web payment: 4 retries).
