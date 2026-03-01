# Flow 09: Heartbeat Monitoring and Offline Detection

## Scenario

Station `stn_a1b2c3d4` ("SSP-3000") sends heartbeat messages to the server every 30 seconds. The server uses these heartbeats to monitor station health and synchronize clocks. After three normal heartbeats, the station experiences a power supply issue and goes silent. The server detects the missed heartbeat after 105 seconds (3.5 x the 30-second interval) and marks the station as Offline. Operator Charlie sees the alert on his dashboard.

## Participants

| Actor | Identity |
|-------|----------|
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| Server | CSMS (`api.example.com`) |
| Operator | Charlie, station manager (dashboard at `dashboard.example.com`) |

## Pre-conditions

- Station `stn_a1b2c3d4` is online and healthy
- Heartbeat interval configured: 30 seconds
- Server offline threshold: 3.5 x interval = 105 seconds
- All 3 bays are `Available`
- No active sessions

## Timeline

```
10:00:00.000  Station sends Heartbeat #1
10:00:00.150  Server responds with Accepted (clock sync)
10:00:30.000  Station sends Heartbeat #2
10:00:30.120  Server responds with Accepted (clock sync)
10:01:00.000  Station sends Heartbeat #3
10:01:00.130  Server responds with Accepted (clock sync)
10:01:05.000  --- Station power supply fails, station goes dark ---
10:01:30.000  Heartbeat #4 expected but NOT received
10:02:00.000  Heartbeat #5 expected but NOT received
10:01:08.000  Server receives LWT, immediately marks station Offline
10:01:08.100  Server marks all bays as Unknown
10:01:08.200  Server sends push notification to operator Charlie
10:01:08.300  Dashboard updates: station status -> Offline (red indicator)
```

## Step-by-Step Detail

---

### Step 1: Heartbeat #1 (10:00:00.000)

The station sends its periodic heartbeat, reporting its current time so the server can check for clock drift.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_hb_001_a1b2c3d4",
  "messageType": "Request",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:00:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {}
}
```

**Server Response:**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_hb_001_a1b2c3d4",
  "messageType": "Response",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:00:00.150Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "serverTime": "2026-02-13T10:00:00.150Z"
  }
}
```

**Server internal state update:**

```
Station stn_a1b2c3d4:
  lastHeartbeat: 2026-02-13T10:00:00.000Z
  status: Online
  healthScore: 100
  clockDriftMs: 0
```

---

### Step 2: Heartbeat #2 (10:00:30.000)

Exactly 30 seconds later, the station sends its second heartbeat. The station's uptime has increased by 30 seconds.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_hb_002_a1b2c3d4",
  "messageType": "Request",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:00:30.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {}
}
```

**Server Response:**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_hb_002_a1b2c3d4",
  "messageType": "Response",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:00:30.120Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "serverTime": "2026-02-13T10:00:30.120Z"
  }
}
```

---

### Step 3: Heartbeat #3 (10:01:00.000)

Third heartbeat arrives on time. The CPU temperature has risen slightly (still within normal range).

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_hb_003_a1b2c3d4",
  "messageType": "Request",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:01:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {}
}
```

**Server Response:**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_hb_003_a1b2c3d4",
  "messageType": "Response",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:01:00.130Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "serverTime": "2026-02-13T10:01:00.130Z"
  }
}
```

**Server internal state after 3 consecutive healthy heartbeats:**

```
Station stn_a1b2c3d4:
  lastHeartbeat: 2026-02-13T10:01:00.000Z
  status: Online
  healthScore: 100
  consecutiveHeartbeats: 3
  avgLatencyMs: 133
  clockDriftMs: 0
```

---

### Step 4: Station Power Failure (10:01:05.000)

Five seconds after the last heartbeat, the station's power supply unit experiences a voltage drop. The station shuts down abruptly. There is no graceful shutdown -- the MQTT connection is simply dropped (TCP FIN/RST).

The MQTT broker detects the disconnection via the TCP keepalive timeout and publishes the station's Last Will and Testament (LWT) message:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "lwt_stn_a1b2c3d4",
  "messageType": "Event",
  "action": "ConnectionLost",
  "timestamp": "2026-02-13T10:01:08.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "reason": "UnexpectedDisconnect"
  }
}
```

> **Note:** The LWT is published by the MQTT broker, not the station. The timestamp is when the broker detected the disconnection (approximately 3 seconds after the TCP connection was lost, due to keepalive settings).

The server receives the LWT and:
1. Logs the unexpected disconnection
2. Immediately marks the station as `Offline` per spec (ConnectionLost LWT triggers immediate offline transition)
3. Marks all bay statuses as `Unknown`

---

### Step 5: Heartbeat #4 -- MISSED (10:01:30.000)

The server expected a heartbeat at 10:01:30.000. None arrives.

**Server internal log:**

```
[10:01:30.000] WARN  Heartbeat missed for stn_a1b2c3d4
                     Expected at: 10:01:30.000Z
                     Last received: 10:01:00.000Z (30s ago)
                     LWT received: 10:01:08.000Z
                     Status: Online (grace period active)
```

---

### Step 6: Heartbeat #5 -- MISSED (10:02:00.000)

A second consecutive heartbeat is missed. The server escalates the warning level.

**Server internal log:**

```
[10:02:00.000] WARN  Heartbeat missed (2nd) for stn_a1b2c3d4
                     Expected at: 10:02:00.000Z
                     Last received: 10:01:00.000Z (60s ago)
                     Missed count: 2
                     Threshold: 105s (3.5 × 30s)
                     Status: Online (degraded)
```

---

### Step 7: Server Marks Station Offline on LWT (10:01:08.000)

The server receives the ConnectionLost LWT and immediately marks the station as Offline per spec.

**Server internal log:**

```
[10:01:08.000] ERROR Station stn_a1b2c3d4 offline
                     Last heartbeat: 10:01:00.000Z
                     LWT received: 10:01:08.000Z
                     Trigger: ConnectionLost LWT (immediate offline)
                     Action: Marking station OFFLINE, all bays Unknown
```

**Server state update:**

```
Station stn_a1b2c3d4:
  lastHeartbeat: 2026-02-13T10:01:00.000Z
  status: Offline          (was: Online)
  offlineSince: 2026-02-13T10:01:08.000Z
  healthScore: 0           (was: 100)
  activeSessions: 0
  reason: heartbeat_timeout
```

---

### Step 8: Server Sends Operator Alert (10:01:08.200)

The server sends a push notification to operator Charlie and creates an alert in the dashboard.

**Push notification to Charlie's device:**

```json
{
  "title": "Station offline",
  "body": "SSP-3000 (Example City) has been offline since 10:01:08. Last heartbeat: 10:01:00.",
  "data": {
    "type": "station_offline",
    "stationId": "stn_a1b2c3d4",
    "stationName": "SSP-3000",
    "locationName": "Station Alpha — Example City",
    "offlineSince": "2026-02-13T10:01:08.000Z",
    "lastHeartbeat": "2026-02-13T10:01:00.000Z"
  }
}
```

**Dashboard alert record:**

```json
{
  "alertId": "alert_s1t2u3v4",
  "type": "station_offline",
  "severity": "Critical",
  "stationId": "stn_a1b2c3d4",
  "stationName": "SSP-3000",
  "locationName": "Station Alpha — Example City",
  "message": "Station disconnected unexpectedly (LWT received). Marked offline immediately.",
  "createdAt": "2026-02-13T10:01:08.200Z",
  "acknowledged": false,
  "metadata": {
    "lastHeartbeat": "2026-02-13T10:01:00.000Z",
    "lastLwt": "2026-02-13T10:01:08.000Z",
    "missedHeartbeats": 2,
    "watchdogThresholdSeconds": 105
  }
}
```

---

### Step 9: What the Operator Dashboard Shows (10:01:08.300)

**What Charlie sees on dashboard.example.com:**

```
+------------------------------------------------------------------+
|  Station Alpha — Example City                                   |
|                                                                    |
|  SSP-3000 (stn_a1b2c3d4)                                  |
|  Status: [!!!] OFFLINE                     Since: 10:01:08        |
|  Last heartbeat: 10:01:00 (8s ago)                                |
|  Firmware: v1.2.5                                                  |
|                                                                    |
|  +------+  +------+  +------+                                     |
|  | Bay 1|  | Bay 2|  | Bay 3|                                     |
|  | [?]  |  | [?]  |  | [?]  |    <- grey/unknown (station offline)|
|  +------+  +------+  +------+                                     |
|                                                                    |
|  ALERTS:                                                           |
|  [!] 10:01:08 - Station offline (LWT received, immediate offline)     |
|  [i] 10:01:08 - MQTT connection lost (LWT)                          |
|                                                                    |
|  Heartbeat History (last 5 min):                                   |
|  10:00:00 [OK] latency 150ms  drift 0ms                          |
|  10:00:30 [OK] latency 120ms  drift 0ms                          |
|  10:01:00 [OK] latency 130ms  drift 0ms                          |
|  10:01:30 [MISS] --                                                |
|  10:02:00 [MISS] --                                                |
|                                                                    |
|  [Send restart command]  [Contact technical support]              |
+------------------------------------------------------------------+
```

**What the app shows to users:**

If a user (e.g., Alice) tries to start a session at this station, the app shows:

```
+----------------------------------+
|  Station Alpha — Example City  |
|                                  |
|  Station currently unavailable   |
|  Please try again later.         |
|                                  |
|  Last checked: 10:02             |
+----------------------------------+
```

## Message Sequence Diagram

```
  Station (stn_a1b2c3d4)       MQTT Broker          Server            Dashboard
     |                            |                    |                   |
     |  Heartbeat #1              |                    |                   |
     |--------------------------->|                    |                   |
     |                            |------------------->|                   |
     |                            |  HB Response       |                   |
     |                            |<-------------------|                   |
     |<---------------------------|                    |                   |
     |                            |                    |                   |
     |  Heartbeat #2 (+30s)       |                    |                   |
     |--------------------------->|------------------->|                   |
     |<---------------------------|<-------------------|                   |
     |                            |                    |                   |
     |  Heartbeat #3 (+60s)       |                    |                   |
     |--------------------------->|------------------->|                   |
     |<---------------------------|<-------------------|                   |
     |                            |                    |                   |
     |  POWER FAILURE (+65s)      |                    |                   |
     |  X--(TCP dies)---X         |                    |                   |
     |                            |  LWT published     |                   |
     |                            |------------------->|                   |
     |                            |                    | mark Offline      |
     |                            |                    |-----> Offline     |
     |                            |                    |------------------->|
     |                            |                    | push to operator  |
     |                            |                    |                   |
```

## Heartbeat Timing Math

| Parameter | Value |
|-----------|-------|
| Heartbeat interval | 30 seconds |
| Offline threshold multiplier | 3.5x |
| Offline threshold | 3.5 x 30 = **105 seconds** |
| Last heartbeat received | 10:01:00.000 |
| 3.5x watchdog would fire at | 10:01:00 + 105s = **10:02:45.000** |
| LWT received at | 10:01:08.000 |
| Server marked offline at | **10:01:08.000** (immediately on LWT receipt) |

> **Note:** The server marked the station offline at 10:01:08.000 upon receiving the LWT. The spec defines two independent offline detection mechanisms: (1) immediate offline on LWT receipt, and (2) 3.5× heartbeat timeout (105s for 30s interval) for silent disconnections where no LWT is received. In this case, the LWT arrived first, so the station was marked offline immediately.

## Key Design Decisions

1. **3.5x threshold, not 3x.** Using exactly 3x (90s) would cause false positives if a heartbeat is slightly delayed due to network jitter. The 0.5x buffer (15s) absorbs normal variance while still detecting genuine outages within a reasonable time.

2. **LWT triggers immediate offline.** The MQTT Last Will and Testament triggers an immediate transition to Offline per spec. The server marks the station offline and sets all bay statuses to Unknown as soon as the LWT is received. The 3.5× heartbeat timeout serves as a separate backup mechanism for detecting silent disconnections where no LWT is published.

3. **Bay status becomes unknown.** When a station goes offline, its bay statuses are shown as unknown (grey) rather than their last known state. This prevents users from attempting to start sessions at bays that may have changed state while offline.

5. **No active sessions = simpler handling.** If there were active sessions when the station went offline, the server would also need to handle session timeout/refund logic (see Flow 10 for error recovery during active sessions).
