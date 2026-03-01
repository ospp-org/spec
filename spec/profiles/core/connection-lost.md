# ConnectionLost

> **Status:** Draft

## 1. Overview

ConnectionLost is a server-side detection mechanism, not a station-initiated message. When a station becomes unreachable, the server detects the disconnection through one of two mechanisms -- MQTT Last Will and Testament (LWT) or heartbeat timeout -- and takes corrective action to maintain system consistency.

Upon detection, the server marks all bays on the affected station as `Unknown`, notifies operators, and handles any active sessions according to the session recovery policy.

## 2. Direction and Type

- **Direction:** Server-detected (broker publishes LWT on behalf of the station)
- **Type:** EVENT

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------|--------|----------|-----------------------------------------------|
| `stationId` | string | Yes | Unique station identifier (`stn_` prefix). |
| `reason` | string | Yes | Disconnection reason. Fixed value: `UnexpectedDisconnect`. |

## 4. Detection Mechanisms

### 4.1 MQTT Last Will and Testament (LWT)

1. When a station connects to the MQTT broker, it **MUST** configure a Last Will and Testament message as part of the MQTT CONNECT packet.
2. The LWT message **MUST** be published to the topic `ospp/v1/stations/{station_id}/to-server` with QoS 1 and `retain: false`.
3. The LWT payload **MUST** conform to the `connection-lost.schema.json` schema, containing `stationId` and `reason: "UnexpectedDisconnect"`.
4. The broker publishes the LWT automatically when the station's TCP connection drops without a clean MQTT DISCONNECT.
5. The server **MUST** subscribe to `ospp/v1/stations/+/to-server` to receive LWT messages for all stations.
6. LWT provides **near-instant** detection (typically within the broker's keep-alive timeout, 1.5x the MQTT keep-alive interval).

### 4.2 Heartbeat Timeout

1. The server **MUST** track the timestamp of the last received message (Heartbeat or any other) from each station.
2. If no message is received from a station for **3.5 × `heartbeatIntervalSec`** seconds, the server **MUST** treat the station as disconnected.
3. Heartbeat timeout detection is a fallback for cases where the LWT is not triggered (e.g., the broker itself fails, or the station performs a clean MQTT DISCONNECT without sending an explicit offline notification).
4. The server **SHOULD** use both mechanisms concurrently. LWT provides fast detection; heartbeat timeout provides reliability.

## 5. Server-Side Handling

When the server detects a ConnectionLost event (via LWT or heartbeat timeout), it **MUST** perform the following steps in order:

1. **Mark all bays as `Unknown`:** The server **MUST** set the status of every bay on the disconnected station to `Unknown`. This prevents new sessions or reservations from being accepted for those bays.
2. **Record the disconnect timestamp:** The server **MUST** store the time of disconnection for audit and billing purposes.
3. **Notify operators:** The server **MUST** send an operator alert via the fleet management dashboard. The alert **SHOULD** include the station ID, last known bay states, and time of disconnection.
4. **Handle active sessions:** For each active session on the disconnected station:
   - The server **MUST** start a **session recovery timer** (default: 300 seconds, configurable via `ConnectionLostGracePeriod`).
   - If the station reconnects before the timer expires, the session is reconciled (see section 6).
   - If the timer expires without reconnection, the server **MUST** close the session with status `failed` and apply pro-rated billing: 100% refund if less than 50% of the requested duration was delivered, otherwise bill for actual time delivered.
5. **Update fleet dashboard:** The server **MUST** update the station's connection status to `offline` in the real-time fleet view.
6. **Log the event:** The server **MUST** log the ConnectionLost event with severity `Warning` for monitoring and analytics.

## 6. Session Recovery on Reconnect

When a previously disconnected station reconnects:

1. The station **MUST** send a BootNotification as the first message on the new connection (standard boot sequence).
2. After the server responds with `Accepted`, the station **MUST** send a StatusNotification for each bay to report the current actual bay states.
3. The server **MUST** compare the reported bay states against the `Unknown` states set during disconnection and reconcile:
   - If a bay reports `Available` and the server had an active session, the session ended during the disconnection. The server **MUST** close the session and apply pro-rated billing based on the estimated time delivered.
   - If a bay reports `Occupied` and the server has a matching active session, the session is still running. The server **MUST** resume tracking and cancel the recovery timer.
   - If a bay reports `Faulted`, the server **MUST** log the fault and notify operators.
4. The station **MUST** replay any buffered events (StatusNotification, MeterValues, TransactionEvent) in chronological order after the initial bay state reports.
5. The server **MUST** process replayed events to fill in gaps in session metering data and transaction records.

## 7. Offline Detection Timing

| Parameter | Default | Range | Description |
|-------------------------------|---------|-----------|-----------------------------------------------|
| MQTT keep-alive | 30s | 10--60s | MQTT-level keep-alive for TCP liveness. |
| LWT detection latency | ~45s | 15--90s | 1.5x MQTT keep-alive before broker publishes LWT. |
| Heartbeat timeout threshold | 3.5× `heartbeatIntervalSec` | 35--12600s | No-message threshold before server declares offline. |
| Session recovery timer | 300s | 60--600s | Grace period before closing orphaned sessions. |

**Trade-offs:**

- **Shorter detection times** (lower keep-alive, lower heartbeat interval) provide faster fault detection but increase network overhead and risk false positives during transient network issues.
- **Longer detection times** reduce false positives but delay operator notification and session recovery.
- The **RECOMMENDED** configuration is a 30-second MQTT keep-alive with a 30-second `heartbeatIntervalSec`, yielding a worst-case detection time of approximately 105 seconds (3.5× heartbeatIntervalSec).

## 8. Examples

### 8.1 LWT Event

```json
{
  "messageId": "lwt_f1a2b3c4-d5e6-7890-lmno-123456789jkl",
  "messageType": "Event",
  "action": "ConnectionLost",
  "timestamp": "2026-02-13T10:18:45.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4e5f6",
    "reason": "UnexpectedDisconnect"
  }
}
```

## 9. Related Schemas

- Payload: [`connection-lost.schema.json`](../../../schemas/mqtt/connection-lost.schema.json)
- Station ID: [`station-id.schema.json`](../../../schemas/common/station-id.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1001, 1010, 6003)
