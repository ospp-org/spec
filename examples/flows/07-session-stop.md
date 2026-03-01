# Flow 07: Session Stop (Early Termination)

## Scenario

Alice is using bay 1 of "Station Alpha -- Example City". She started a Eco Program session (`sess_f7e8d9c0`) and pre-paid 50 credits for an estimated 5-minute session at 10 credits/minute. After about 3 minutes, she decides she is done and taps "Stop" in the app. The server sends a StopService command to the station, the station deactivates the dispenser, reports actual usage, and the server calculates a pro-rated refund of 10 credits.

## Participants

| Actor | Identity |
|-------|----------|
| User | Alice (`sub_alice2026`), device `device_a8f3bc12e4567890` |
| App | the mobile app (React Native / Expo) |
| Server | CSMS (`api.example.com`) |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| Bay | `bay_c1d2e3f4a5b6` (Bay 1) |
| Service | `svc_eco` (Eco Program, 10 credits/min, metered) |

## Pre-conditions

- Session `sess_f7e8d9c0` is active since 10:15:00 UTC
- Bay 1 status: `Occupied`
- Alice pre-paid 50 credits (estimated 5 minutes of service)
- Dispenser is running, meter is counting

## Timeline

```
10:18:02.000  Alice taps "Stop service" (Stop service) in the app
10:18:02.200  App sends POST /sessions/f7e8d9c0/stop to server
10:18:02.450  Server validates request, publishes StopService REQUEST via MQTT
10:18:02.800  Station receives StopService, deactivates dispenser on bay 1
10:18:03.200  Station sends StopService RESPONSE (Accepted, actual usage)
10:18:03.500  Station sends StatusNotification: Occupied -> Finishing
10:18:04.000  Server receives StopService RESPONSE, calculates pro-rated credits
10:18:04.200  Server processes refund: 50 paid - 40 charged = 10 credits refunded
10:18:04.500  Server sends HTTP response to app with session summary
10:18:05.000  App displays: "Service stopped. Duration: 3m 2s. Credits: 40 (refund 10 credits)"
10:18:06.500  Station finishes drain cycle on bay 1
10:18:06.500  Station sends StatusNotification: Finishing -> Available
10:18:06.800  Server updates bay status, bay 1 is now available for next user
```

## Step-by-Step Detail

---

### Step 1: Alice Taps Stop (10:18:02.000)

**What Alice sees:**

The SessionActiveScreen shows a live timer at `03:02`, the service icon, and a large red "Stop service" button. Alice taps it. The app shows a confirmation dialog:

> **Stop service?**
> Unused credits will be refunded.
> [Cancel] [Stop]

Alice taps "Stop".

---

### Step 2: App Sends Stop Request (10:18:02.200)

**HTTP Request:**

```http
POST /api/v1/sessions/sess_f7e8d9c0/stop HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_stop_8a3b1c2d

{
  "reason": "user_requested",
  "timestamp": "2026-02-13T10:18:02.200Z"
}
```

---

### Step 3: Server Publishes StopService REQUEST (10:18:02.450)

The server validates that:
- Session `sess_f7e8d9c0` exists and is active
- The requesting user (`sub_alice2026`) owns this session
- The session is running on station `stn_a1b2c3d4`, bay 1

Then it publishes the MQTT command:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_stop_4f5e6d7c",
  "messageType": "Request",
  "action": "StopService",
  "timestamp": "2026-02-13T10:18:02.450Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_c1d2e3f4a5b6"
  }
}
```

---

### Step 4: Station Deactivates Dispenser (10:18:02.800)

The station's bay controller receives the StopService command. It:

1. Sends the relay-off signal to the dispenser on bay 1
2. Reads the final meter values (water flow, electricity, duration)
3. Calculates actual duration: started at 10:15:00.000, stopped at 10:18:02.800 = 182.8 seconds
4. Calculates credits charged: `ceil(182.8 / 60) * 10 = 4 * 10 = 40 credits` (but station reports raw seconds; server does the billing math)

---

### Step 5: Station Sends StopService RESPONSE (10:18:03.200)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_stop_4f5e6d7c",
  "messageType": "Response",
  "action": "StopService",
  "timestamp": "2026-02-13T10:18:03.200Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted",
    "actualDurationSeconds": 182,
    "creditsCharged": 40,
    "meterValues": {
      "liquidMl": 45200,
      "consumableMl": 1200,
      "energyWh": 850
    }
  }
}
```

---

### Step 6: Station Sends StatusNotification - Finishing (10:18:03.500)

The bay transitions from `Occupied` to `Finishing` while the drain cycle completes and nozzles retract.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_9a8b7c6d",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:18:03.500Z",
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

### Step 7: Server Calculates Pro-Rated Credits (10:18:04.000)

The server receives the StopService RESPONSE and performs billing:

| Field | Value |
|-------|-------|
| Pre-paid credits | 50 |
| Service rate | 10 credits/min (metered) |
| Actual duration | 182 seconds (3m 2s) |
| Billing granularity | Per-minute, rounded up |
| Billed minutes | ceil(182/60) = 4 minutes |
| Credits charged | 4 x 10 = 40 credits |
| Refund | 50 - 40 = **10 credits** |

The server:
1. Marks session `sess_f7e8d9c0` as `completed`
2. Credits 10 credits back to Alice's wallet (balance: old + 10)
3. Creates a transaction record for the refund
4. Prepares the HTTP response

---

### Step 8: Server Responds to App (10:18:04.500)

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_stop_8a3b1c2d

{
  "sessionId": "sess_f7e8d9c0",
  "status": "completed",
  "stoppedBy": "user",
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
    "startedAt": "2026-02-13T10:15:00.000Z",
    "stoppedAt": "2026-02-13T10:18:02.800Z",
    "durationSeconds": 182,
    "durationFormatted": "3m 2s"
  },
  "billing": {
    "creditsPrepaid": 50,
    "creditsCharged": 40,
    "creditsRefunded": 10,
    "billedMinutes": 4,
    "ratePerMinute": 10
  },
  "wallet": {
    "previousBalance": 70,
    "newBalance": 80
  },
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 1200,
    "energyWh": 850
  }
}
```

---

### Step 9: App Displays Session Summary (10:18:05.000)

**What Alice sees:**

The app transitions to the SessionCompletedScreen showing:

```
+----------------------------------+
|        Service stopped            |
|                                  |
|   Eco Program - Bay 1           |
|   Duration: 3m 2s                  |
|                                  |
|   Credits charged:    50         |
|   Credits used:  40         |
|   Refund:        +10         |
|                                  |
|   Current balance: 80 credits        |
|                                  |
|   Liquid: 45.2L | Energy: 0.85kWh |
|                                  |
|  [Rate service]  [Home]   |
+----------------------------------+
```

The key message: **"Service stopped. Duration: 3m 2s. Credits: 40 (refund 10 credits)"**

---

### Step 10: Station Sends StatusNotification - Available (10:18:06.500)

After the drain cycle completes (about 3 seconds), bay 1 returns to `Available`.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_2d3e4f5a",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:18:06.500Z",
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

### Step 11: What the Operator Sees

On the Operator Dashboard, Charlie sees:

1. Bay 1 indicator transitions from green-pulsing ("In use") to yellow ("Finishing") to green-solid ("Available")
2. The session log updates with a new completed entry:

```
[10:18:04] Session sess_f7e8d9c0 completed
           User: Alice | Bay 1 | Eco Program
           Duration: 3m 2s | Credits: 40/50 (10 refunded)
           Liquid: 45.2L | Consumable: 1.2L | Energy: 0.85kWh
```

3. The station revenue counter updates: +40 credits for this session

## Message Sequence Diagram

```
  Alice(App)              Server                  Station (stn_a1b2c3d4)
     |                      |                          |
     |  POST /stop          |                          |
     |--------------------->|                          |
     |                      |  StopService REQUEST     |
     |                      |------------------------->|
     |                      |                          | deactivate pump
     |                      |                          | read meters
     |                      |  StopService RESPONSE    |
     |                      |<-------------------------|
     |                      |  StatusNotif (Finishing)  |
     |                      |<-------------------------|
     |                      |                          |
     |                      | calculate billing        |
     |                      | refund 10 credits        |
     |                      |                          |
     |  200 OK (summary)    |                          |
     |<---------------------|                          |
     |                      |                          |
     | show summary screen  |                          |
     |                      |  StatusNotif (Available)  |
     |                      |<-------------------------|
     |                      |                          |
```

## Key Design Decisions

1. **Station reports raw duration; server does billing.** The station reports `actualDurationSeconds: 182` and `creditsCharged: 40` as an estimate, but the server is the authoritative billing engine. This prevents station firmware bugs from affecting revenue.

2. **Finishing state allows drain cycle.** The bay does not go directly from `Occupied` to `Available`. The `Finishing` intermediate state gives the hardware time to complete the drain cycle and retract nozzles safely.

3. **Refunds are immediate.** Credits are refunded to Alice's wallet as soon as the server processes the StopService RESPONSE. There is no pending/delayed refund state.

4. **Per-minute rounding.** The billing granularity is per-minute, rounded up. 182 seconds = 3.03 minutes, billed as 4 minutes. This is displayed transparently to the user.
