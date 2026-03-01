# Flow 10: Error Recovery (MQTT Disconnect During Active Session)

## Scenario

Station `stn_a1b2c3d4` is running an active Eco Program session (`sess_f7e8d9c0`) for Alice on bay 1. Three minutes into the session, the MQTT connection between the station and the server drops due to a broken TCP link (ISP router reset). Critically, the station does **not** stop the service hardware -- the dispenser continues running. The station buffers all status notifications and meter values locally. After 15 seconds, the MQTT connection is re-established with exponential backoff. The station replays its buffered messages, and the session completes normally without any interruption to Alice's service experience.

## Participants

| Actor | Identity |
|-------|----------|
| User | Alice (`sub_alice2026`), device `device_a8f3bc12e4567890` |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| Server | CSMS (`api.example.com`) |
| MQTT Broker | `broker.example.com` (MQTT 5.0 cluster) |

## Pre-conditions

- Session `sess_f7e8d9c0` is active since 10:00:00
- Service: `svc_eco` (Eco Program, 10 credits/min)
- Bay 1 (`bay_c1d2e3f4a5b6`) status: `Occupied`
- Alice pre-paid 50 credits for an estimated 5-minute session
- Station connected to MQTT broker, heartbeats normal

## Timeline

```
10:03:00.000  MQTT TCP connection breaks (ISP router reset)
10:03:00.000  Station detects TCP disconnect
10:03:00.000  Station: dispenser continues running (hardware NOT stopped)
10:03:00.100  Station: starts local message buffer
10:03:01.000  Station: reconnect attempt #1 (backoff: 1s) -- FAIL
10:03:03.000  Station: reconnect attempt #2 (backoff: 2s) -- FAIL
10:03:05.000  Station: buffers MeterValues locally (5-second interval reading)
10:03:07.000  Station: reconnect attempt #3 (backoff: 4s) -- FAIL
10:03:10.000  Station: buffers MeterValues locally
10:03:15.000  Station: reconnect attempt #4 (backoff: 8s) -- SUCCESS
10:03:15.200  Station: re-subscribes to command topics
10:03:15.400  Station: sends BootNotification (reconnect)
10:03:15.600  Server: responds Accepted (clock sync)
10:03:15.800  Station: replays buffered StatusNotification #1
10:03:16.000  Station: replays buffered MeterValues #1 (from 10:03:05)
10:03:16.200  Station: replays buffered MeterValues #2 (from 10:03:10)
10:03:16.400  Station: replays buffered StatusNotification #2 (current state)
10:03:16.600  Server: processes all buffered messages, session state reconciled
10:03:20.000  Station: sends live MeterValues (normal 5s interval resumes)
10:03:25.000  Station: sends live MeterValues
```

## Step-by-Step Detail

---

### Step 1: MQTT Connection Breaks (10:03:00.000)

The ISP router serving the station location resets, causing the TCP connection between the station and the MQTT broker to drop. The station's MQTT client detects the disconnection via a failed TCP write or keepalive timeout.

**Station internal log:**

```
[10:03:00.000] ERROR MQTT connection lost
                     Broker: broker.example.com:8883
                     Reason: TCP connection reset
                     Session active: sess_f7e8d9c0 (bay 1, svc_eco)
                     Action: CONTINUE HARDWARE, BUFFER MESSAGES
```

**Critical design rule:** The station firmware follows the principle of **"never stop hardware due to connectivity loss."** The dispenser, water flow, and all bay hardware continue operating normally. The station buffers all outgoing MQTT messages to local flash storage.

---

### Step 2: Station Continues Operating (10:03:00.100)

The station's bay controller is completely independent of the MQTT connection. It:

1. Continues running the dispenser on bay 1
2. Continues reading meter values every 5 seconds
3. Starts buffering messages that would normally be sent via MQTT

**Station local buffer initialized:**

```
Buffer: stn_a1b2c3d4_offline_buffer_1739443380
  maxSize: 1000 messages
  persistTo: /data/mqtt_buffer/
  currentCount: 0
```

---

### Step 3: Reconnect Attempt #1 -- FAIL (10:03:01.000)

After a 1-second initial backoff, the station attempts to reconnect. The ISP router is still restarting.

**Station internal log:**

```
[10:03:01.000] WARN  MQTT reconnect attempt #1
                     Broker: broker.example.com:8883
                     Backoff: 1000ms
                     Result: ECONNREFUSED (router not ready)
                     Next attempt in: 2000ms
```

---

### Step 4: Reconnect Attempt #2 -- FAIL (10:03:03.000)

**Station internal log:**

```
[10:03:03.000] WARN  MQTT reconnect attempt #2
                     Broker: broker.example.com:8883
                     Backoff: 2000ms
                     Result: ETIMEDOUT
                     Next attempt in: 4000ms
```

---

### Step 5: Station Buffers MeterValues (10:03:05.000)

The station's meter reading cycle fires every 5 seconds. Since MQTT is disconnected, the MeterValues are buffered locally.

**Buffered message #1:**

```json
{
  "bufferId": "buf_001",
  "bufferedAt": "2026-02-13T10:03:05.000Z",
  "originalTopic": "ospp/v1/stations/stn_a1b2c3d4/to-server",
  "message": {
    "messageId": "msg_mv_buf_001",
    "messageType": "Event",
    "action": "MeterValues",
    "timestamp": "2026-02-13T10:03:05.000Z",
    "source": "Station",
    "protocolVersion": "0.1.0",
    "payload": {
      "sessionId": "sess_f7e8d9c0",
      "bayId": "bay_c1d2e3f4a5b6",
      "values": {
        "liquidMl": 27800,
        "consumableMl": 740,
        "energyWh": 520
      },
      "timestamp": "2026-02-13T10:03:05.000Z"
    }
  }
}
```

---

### Step 6: Reconnect Attempt #3 -- FAIL (10:03:07.000)

**Station internal log:**

```
[10:03:07.000] WARN  MQTT reconnect attempt #3
                     Broker: broker.example.com:8883
                     Backoff: 4000ms
                     Result: ETIMEDOUT
                     Buffer size: 1 messages
                     Next attempt in: 8000ms
```

---

### Step 7: Station Buffers More MeterValues (10:03:10.000)

**Buffered message #2:**

```json
{
  "bufferId": "buf_002",
  "bufferedAt": "2026-02-13T10:03:10.000Z",
  "originalTopic": "ospp/v1/stations/stn_a1b2c3d4/to-server",
  "message": {
    "messageId": "msg_mv_buf_002",
    "messageType": "Event",
    "action": "MeterValues",
    "timestamp": "2026-02-13T10:03:10.000Z",
    "source": "Station",
    "protocolVersion": "0.1.0",
    "payload": {
      "sessionId": "sess_f7e8d9c0",
      "bayId": "bay_c1d2e3f4a5b6",
      "values": {
        "liquidMl": 32100,
        "consumableMl": 860,
        "energyWh": 600
      },
      "timestamp": "2026-02-13T10:03:10.000Z"
    }
  }
}
```

---

### Step 8: Reconnect Attempt #4 -- SUCCESS (10:03:15.000)

The ISP router has finished rebooting. The station's MQTT client successfully connects.

**Station internal log:**

```
[10:03:15.000] INFO  MQTT reconnect attempt #4
                     Broker: broker.example.com:8883
                     Backoff: 8000ms
                     Result: CONNECTED
                     Session: clean=false (resume existing MQTT session)
                     Disconnected for: 15.0 seconds
                     Buffered messages: 2
```

---

### Step 9: Station Re-subscribes (10:03:15.200)

The station re-subscribes to its command topics to receive any pending server requests.

**MQTT Subscriptions:**

```
SUBSCRIBE ospp/v1/stations/stn_a1b2c3d4/to-station     QoS 1
```

---

### Step 10: Station Sends BootNotification (10:03:15.400)

After any reconnection, the station sends a BootNotification to re-announce itself and synchronize clocks.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_boot_reconn_a1b2c3d4",
  "messageType": "Request",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:03:15.400Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "stationModel": "SSP-3000",
    "stationVendor": "AcmeCorp",
    "firmwareVersion": "1.2.5",
    "serialNumber": "ACME-SSP-2024-0042",
    "bayCount": 3,
    "uptimeSeconds": 86595,
    "pendingOfflineTransactions": 0,
    "timezone": "Europe/London",
    "bootReason": "ErrorRecovery",
    "capabilities": {
      "bleSupported": true,
      "offlineModeSupported": true,
      "meterValuesSupported": true
    },
    "networkInfo": {
      "connectionType": "Ethernet",
      "signalStrength": null
    }
  }
}
```

---

### Step 11: Server Responds Accepted (10:03:15.600)

The server recognizes this as a reconnection (not a cold boot) based on `bootReason: "ErrorRecovery"` and the presence of active sessions. It does **not** reset session state.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_boot_reconn_a1b2c3d4",
  "messageType": "Response",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:03:15.600Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted",
    "serverTime": "2026-02-13T10:03:15.600Z",
    "heartbeatIntervalSec": 30,
    "configuration": {
      "sessionReconciliation": "{\"sess_f7e8d9c0\":{\"serverStatus\":\"Active\",\"action\":\"continue\",\"message\":\"Session still active on server. Continue normally.\"}}",
      "replayBufferedMessages": "true"
    }
  }
}
```

**Server internal log:**

```
[10:03:15.600] INFO  Station stn_a1b2c3d4 reconnected
                     Downtime: 15s
                     Active sessions confirmed: sess_f7e8d9c0
                     Action: continue session, accept buffered replay
                     Status: Online (restored)
```

---

### Step 12: Station Replays Buffered Messages (10:03:15.800 - 10:03:16.400)

The station replays all buffered messages in chronological order. The server identifies buffered messages by comparing timestamps against the known disconnection period.

**Buffered StatusNotification #1 (connectivity status during disconnect):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_buf_001",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:03:00.500Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Occupied",
    "previousStatus": "Occupied",
    "services": [
      { "serviceId": "svc_eco", "available": false },
      { "serviceId": "svc_standard", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

**Buffered MeterValues #1 (from 10:03:05):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_mv_buf_001",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T10:03:05.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_c1d2e3f4a5b6",
    "values": {
      "liquidMl": 27800,
      "consumableMl": 740,
      "energyWh": 520
    },
    "timestamp": "2026-02-13T10:03:05.000Z"
  }
}
```

**Buffered MeterValues #2 (from 10:03:10):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_mv_buf_002",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T10:03:10.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_c1d2e3f4a5b6",
    "values": {
      "liquidMl": 32100,
      "consumableMl": 860,
      "energyWh": 600
    },
    "timestamp": "2026-02-13T10:03:10.000Z"
  }
}
```

**Current-state StatusNotification #2 (confirms bay is still occupied):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_current_001",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:03:16.400Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Occupied",
    "previousStatus": "Occupied",
    "services": [
      { "serviceId": "svc_eco", "available": false },
      { "serviceId": "svc_standard", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

---

### Step 13: Server Reconciles Session State (10:03:16.600)

The server processes all buffered messages and confirms the session is intact:

**Server internal log:**

```
[10:03:16.600] INFO  Buffered message replay complete for stn_a1b2c3d4
                     Messages replayed: 4 (2 StatusNotification, 2 MeterValues)
                     Session sess_f7e8d9c0: RECONCILED
                       - Hardware ran continuously (no gap)
                       - MeterValues gap: 10:03:00 to 10:03:05 (5s, within tolerance)
                       - Duration continuity: 180s -> 185s -> 190s (OK)
                       - Water continuity: 25000mL -> 27800mL -> 32100mL (OK)
                     Result: Session continues normally, no billing adjustment needed
```

---

### Step 14: Normal Operation Resumes (10:03:20.000+)

From this point, the station sends live MeterValues at the normal 5-second interval:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_mv_live_001",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T10:03:20.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_c1d2e3f4a5b6",
    "values": {
      "liquidMl": 36500,
      "consumableMl": 980,
      "energyWh": 680
    },
    "timestamp": "2026-02-13T10:03:20.000Z"
  }
}
```

---

### What Alice Experiences

**Alice notices nothing.** The dispenser never stopped. The service continues uninterrupted. Her app may have shown a brief "Intermittent connection..." warning for a few seconds (if the app was polling the server for session status), but the hardware experience was seamless.

```
+----------------------------------+
|        Service active            |
|                                  |
|   Eco Program - Bay 1           |
|   03:20 / ~05:00                 |
|   ||||||||||||||||.............   |
|                                  |
|   Credits: ~33 / 50 used        |
|                                  |
|   [Stop service]             |
+----------------------------------+
```

### What Charlie Sees on the Dashboard

The dashboard shows a brief connectivity gap:

```
Station Timeline:
  10:00:00  Session started (Alice, Eco Program, Bay 1)
  10:03:00  [!] MQTT disconnected (15s)
  10:03:15  [OK] MQTT reconnected
            Buffered messages: 4 replayed
            Session sess_f7e8d9c0: no interruption
  10:03:20  Live telemetry resumed
```

## Message Sequence Diagram

```
  Station (stn_a1b2c3d4)    MQTT Broker          Server
     |                          |                    |
     |  (session active)        |                    |
     |  MeterValues (live)      |                    |
     |------------------------->|------------------->|
     |                          |                    |
     |  === TCP BREAKS ===      |                    |
     |  X--------X              |                    |
     |                          |  LWT published     |
     |                          |------------------->|
     |                          |                    |
     |  [dispenser running]     |                    |
     |  [buffer: StatusNotif]   |                    |
     |                          |                    |
     |  reconnect #1 FAIL (1s)  |                    |
     |  reconnect #2 FAIL (2s)  |                    |
     |  [buffer: MeterValues]   |                    |
     |  reconnect #3 FAIL (4s)  |                    |
     |  [buffer: MeterValues]   |                    |
     |  reconnect #4 OK   (8s)  |                    |
     |------------------------->|                    |
     |                          |                    |
     |  re-subscribe            |                    |
     |------------------------->|                    |
     |                          |                    |
     |  BootNotification        |                    |
     |------------------------->|------------------->|
     |                          |  Accepted          |
     |                          |<-------------------|
     |<-------------------------|                    |
     |                          |                    |
     |  replay: StatusNotif #1  |                    |
     |------------------------->|------------------->|
     |  replay: MeterValues #1  |                    |
     |------------------------->|------------------->|
     |  replay: MeterValues #2  |                    |
     |------------------------->|------------------->|
     |  current: StatusNotif #2 |                    |
     |------------------------->|------------------->|
     |                          |                    | reconcile OK
     |                          |                    |
     |  MeterValues (live)      |                    |
     |------------------------->|------------------->|
     |                          |                    |
```

## Exponential Backoff Schedule

| Attempt | Delay | Cumulative | Result |
|---------|-------|------------|--------|
| 1 | 1s | 1s | FAIL |
| 2 | 2s | 3s | FAIL |
| 3 | 4s | 7s | FAIL |
| 4 | 8s | 15s | SUCCESS |
| (5) | (16s) | (31s) | (not needed) |
| (max) | (30s) | - | (capped at 30s) |

Backoff formula: `min(initialDelay * 2^(attempt-1), maxDelay)` with `initialDelay=1s`, `maxDelay=30s`, plus 30% jitter.

## Key Design Decisions

1. **Never stop hardware on connectivity loss.** This is the most critical rule. The customer is physically at the bay with the service running. Stopping the dispenser because of a server connectivity issue would create a terrible user experience and could leave a job half-finished.

2. **Buffer to flash, not RAM.** Messages are buffered to persistent flash storage, not volatile RAM. If the station crashes during the disconnect period, buffered messages survive the reboot.

3. **Replay with timestamp comparison.** The server distinguishes between real-time and historical messages by comparing message timestamps against the known disconnection period. This prevents the server from acting on stale data as if it were current (e.g., triggering alerts for a status that has already changed).

4. **BootNotification on reconnect.** Even for a brief disconnection, the station sends a BootNotification to re-announce its state and synchronize clocks. The `bootReason: "ErrorRecovery"` tells the server not to reset session state.

5. **Server reconciliation.** After receiving all buffered messages, the server checks meter value continuity (values should be monotonically increasing) and duration continuity. Any gaps or anomalies would trigger a reconciliation alert.
