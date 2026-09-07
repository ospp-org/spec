# ConnectionLost

> **Status:** Draft

## 1. Overview

ConnectionLost reports that a station is no longer connected. It reaches the server three ways: the broker publishes it as the station's Last Will and Testament (LWT) when the link drops without a clean MQTT DISCONNECT; the **station publishes it itself, immediately before a clean DISCONNECT it performs on purpose**; or the server infers the condition from a heartbeat timeout, in which case no message crosses the wire at all. The `reason` field says which of the first two occurred, and the server takes the same corrective action in every case.

**Why the station-published form exists.** A clean MQTT DISCONNECT suppresses the will -- that is what MQTT's `sessionExpiryInterval: 0` means -- so a station shutting down on purpose used to have two options and neither was correct: stay silent, and the server believes it is alive until the heartbeat timeout expires; or drop the link ungracefully so the broker fires a will that reports `UnexpectedDisconnect`, which is false. A station that leaves on purpose **MUST** be able to say so, and §4.3 is how.

Upon detection, the server marks all bays on the affected station as `Unknown`, notifies operators, and handles any active sessions according to the session recovery policy.

## 2. Direction and Type

- **Direction:** Broker to Server (LWT, §4.1), or Station to Server (planned shutdown, §4.3). Also server-inferred with no message at all (heartbeat timeout, §4.2).
- **Type:** EVENT

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------|--------|----------|-----------------------------------------------|
| `stationId` | string | Yes | Unique station identifier (`stn_` prefix). |
| `reason` | string | Yes | Why the station is gone. One of `UnexpectedDisconnect` (§4.1) or `PlannedShutdown` (§4.3). |

## 4. Detection Mechanisms

### 4.1 MQTT Last Will and Testament (LWT)

1. When a station connects to the MQTT broker, it **MUST** configure a Last Will and Testament message as part of the MQTT CONNECT packet.
2. The LWT message **MUST** be published to the topic `ospp/v1/stations/{station_id}/to-server` with QoS 1 and `retain: false`.
3. The LWT payload **MUST** conform to the `connection-lost.schema.json` schema, containing `stationId` and `reason: "UnexpectedDisconnect"`. The will is registered in the CONNECT packet and cannot be changed without reconnecting, so `UnexpectedDisconnect` is the only value it **MAY** carry: at the moment it is written the station cannot know how the connection will end. A station **MUST NOT** register a will claiming `PlannedShutdown`.
4. The broker publishes the LWT automatically when the station's TCP connection drops without a clean MQTT DISCONNECT.
5. The server **MUST** subscribe to `ospp/v1/stations/+/to-server` to receive LWT messages for all stations.
6. LWT provides **near-instant** detection (typically within the broker's keep-alive timeout, 1.5x the MQTT keep-alive interval).

### 4.2 Heartbeat Timeout

1. The server **MUST** track the timestamp of the last received message (Heartbeat or any other) from each station.
2. If no message is received from a station for **3.5 × `heartbeatIntervalSec`** seconds, the server **MUST** treat the station as disconnected.
3. Heartbeat timeout detection is a fallback for cases where no ConnectionLost message arrives at all -- the broker itself fails, or a station disconnects cleanly without sending the §4.3 notification. It is a fallback and not the mechanism: it costs `3.5 x heartbeatIntervalSec` (105 s at the RECOMMENDED settings) during which the server reports a departed station as online.
4. The server **SHOULD** use all three mechanisms concurrently. The station's own notification and the LWT provide fast detection; heartbeat timeout provides reliability when neither arrives.

### 4.3 Station-Announced Planned Shutdown

1. A station that is about to disconnect **deliberately** -- a scheduled power-down, an operator-commanded halt, entering a maintenance state, a controlled restart -- **MUST** publish a ConnectionLost EVENT with `reason: "PlannedShutdown"` to `ospp/v1/stations/{station_id}/to-server` with QoS 1 before sending the MQTT DISCONNECT packet.
2. The station **MUST** publish it as its **last** OSPP message, after any SessionEnded, TransactionEvent or StatusNotification it still owes. Everything the station has to report is about a period that ended before it left; announcing the departure first would place those messages after the server has already begun closing the station out.
3. The station **SHOULD** wait for the QoS 1 PUBACK before sending DISCONNECT. If the PUBACK does not arrive within a bounded time the station **MAY** disconnect anyway -- the heartbeat timeout of §4.2 remains the backstop, and a shutdown **MUST NOT** be blocked by an unreachable server.
4. A station that disconnects cleanly **without** publishing this message is not non-conforming; it is detected by §4.2 instead, at that section's cost. The obligation in rule 1 binds a station that *chooses* to announce, and the announcement is the only way the server can tell a planned departure from a fault.
5. The station **MUST NOT** publish `PlannedShutdown` and then remain connected. If the shutdown is aborted after the message was sent, the station **MUST** reconnect with a BootNotification carrying `bootReason: "Reconnect"` rather than resume the old session silently, because the server has already marked it offline.
6. ConnectionLost is **exempt** from message signing, and the exemption is on the ACTION, so it covers this form too ([`03-messages.md` §5.5](../../03-messages.md#55-connectionlost)). The station **MAY** carry a `mac` on a `PlannedShutdown`, and a server **MUST NOT** refuse the message for the absence of one. Authentication does not rest on the `mac` here: the broker binds `ospp/v1/stations/{station_id}/to-server` to the station's client certificate, so no other party can publish a ConnectionLost naming this station.

## 5. Server-Side Handling

When the server detects a ConnectionLost event (via LWT or heartbeat timeout), it **MUST** perform the following steps in order:

1. **Mark all bays as `Unknown`:** The server **MUST** set the status of every bay on the disconnected station to `Unknown`. This prevents new sessions or reservations from being accepted for those bays.
2. **Record the disconnect timestamp:** The server **MUST** store the time of disconnection for audit and billing purposes.
3. **Notify operators:** The server **MUST** send an operator alert via the fleet management dashboard. The alert **SHOULD** include the station ID, last known bay states, and time of disconnection.
4. **Handle active sessions:** For each active session on the disconnected station:
   - The server **MUST** start a **session recovery timer** (default: 300 seconds, configurable via `ConnectionLostGracePeriod`).
   - If the station reconnects before the timer expires, the session is reconciled (see section 6).
   - If the timer expires without reconnection, the server **MUST** close the session with status `failed` and bill **pro-rata on the time delivered**, refunding the remainder of the pre-authorization.
   - The low-delivery full-refund override (`faultFullRefundThreshold`, [`04-flows.md §6`](../../04-flows.md)) **MUST NOT** be applied here, however little was delivered. That override is keyed on a SessionEnded `reason` of `Fault` — the service itself failing — and a grace-period expiry produces no SessionEnded at all. What failed here is the *communication*, which says nothing about what the customer received; they received what they received, and are billed for it. An earlier revision applied the override on this path, which made a station's network fault a free wash.
5. **Update fleet dashboard:** The server **MUST** update the station's connection status to `offline` in the real-time fleet view.
6. **Log the event:** The server **MUST** log the ConnectionLost event with severity `Warning` for monitoring and analytics -- except for a `PlannedShutdown`, which the server **SHOULD** log at `Info`: nothing is wrong with a station that said it was leaving.
7. **Record which mechanism reported it.** The server **MUST** record whether the station was declared offline on a `PlannedShutdown`, on an `UnexpectedDisconnect` will, or on a heartbeat timeout, and **MUST NOT** collapse the three into one record. They assert opposite things about the station -- one says its firmware or network is implicated, one says nothing about the connection at all, and one says the departure was intended -- and an operator explaining an outage cannot recover the distinction afterwards from `is_online = false`.

Steps 1 to 5 are identical for all three. **A planned shutdown is not a lighter event for a customer mid-wash**: a station that announces its departure with a session running owes exactly the settlement of step 4, on the same timer. What the announcement changes is the diagnosis, not the money.

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
| Session recovery timer | 300s | 60--600s | Grace period before closing a session whose station has not returned. |

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
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4e5f6",
    "reason": "UnexpectedDisconnect"
  }
}
```

### 8.2 Station-Announced Planned Shutdown

Published by the station on its own topic, as its last message before DISCONNECT.
Unlike the will above, `source` is `Station`, the `messageId` is freshly generated and
the `timestamp` is live. No `mac` is shown: ConnectionLost is exempt as an action
(rule 6), and a station **MAY** add one.

```json
{
  "messageId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "messageType": "Event",
  "action": "ConnectionLost",
  "timestamp": "2026-02-13T10:18:45.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4e5f6",
    "reason": "PlannedShutdown"
  }
}
```

## 9. Related Schemas

- Payload: [`connection-lost.schema.json`](../../../schemas/mqtt/connection-lost.schema.json)
- Station ID: [`station-id.schema.json`](../../../schemas/common/station-id.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1001, 1010, 6003)
