# ConnectionLost

> **Status:** Draft

## 1. Overview

ConnectionLost reports that a station is no longer connected. It reaches the server three ways: the broker publishes it as the station's Last Will and Testament (LWT) when the link drops without a clean MQTT DISCONNECT; the **station publishes it itself, immediately before a clean DISCONNECT it performs on purpose**; or the server infers the condition from a heartbeat timeout, in which case no message crosses the wire at all. The `reason` field says which of the first two occurred, and the server takes the same corrective action in every case.

**Why the station-published form exists.** A clean MQTT DISCONNECT suppresses the will -- that is what MQTT's `sessionExpiryInterval: 0` means -- so a station shutting down on purpose used to have two options and neither was correct: stay silent, and the server believes it is alive until the heartbeat timeout expires; or drop the link ungracefully so the broker fires a will that reports `UnexpectedDisconnect`, which is false. A station that leaves on purpose **MUST** be able to say so, and §4.3 is how.

Upon detection, the server marks all bays on the affected station as `Unknown`, notifies operators, and holds the station away for its active sessions, none of which the loss ends (§5).

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

1. The server **MUST** track the timestamp of the last message it accepted from each station (Heartbeat or any other), a signed one once its MAC has verified ([Chapter 06 §5.5](../../06-security.md#55-verification)); the ConnectionLost the broker publishes is not one.
2. If no message is received from a station for **3.5 × `heartbeatIntervalSec`** seconds, the server **MUST** treat the station as disconnected, except as the next sentence states. Between a boot answered `Accepted` and the station's first Heartbeat after it, the server **MUST NOT** treat it as disconnected on this timeout before it has received no message for the longer of 3.5 × `heartbeatIntervalSec` and 360 seconds. During that replay the station sends no Heartbeat (§6 step 4), and it can be silent while it waits on the server: the server may take up to the TransactionEvent's 60-second response timeout ([`03-messages.md` §4.1](../../03-messages.md#41-transactionevent)) to answer a replayed TransactionEvent `RetryLater`, the station then retries with exponential backoff, initial 5 s and capped at 300 s, and it does not proceed to the next transaction before that one is acknowledged ([`transaction-event.md` §6](../transaction/transaction-event.md#6-processing-rules) rules 3 and 6). The server last heard the station when the TransactionEvent arrived, so the silence it sees is about that timeout plus that cap, 360 s, plus the retry's transit; the 30-second retry of [`reconciliation.md` §2](../offline/reconciliation.md#2-sync-procedure) is that profile's shorter timeout and does not bound it. The will (§4.1) still reports a lost connection at once.
3. Heartbeat timeout detection is a fallback for cases where no ConnectionLost message arrives at all -- the broker itself fails, or a station disconnects cleanly without sending the §4.3 notification. It is a fallback and not the mechanism: it costs `3.5 x heartbeatIntervalSec` (105 s at the RECOMMENDED settings; 360 s between a boot answered `Accepted` and the station's first Heartbeat after it, rule 2) during which the server reports a departed station as online.
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
4. **Handle active sessions:** The loss ends no session, and the server **MUST NOT** end one on it: the station runs a service it started to its end on its local timer ([Chapter 02 — Transport §4.4](../../02-transport.md#44-reconnection-strategy)) and sends the session's end record once it is back (§6). For each active session on the disconnected station:
   - The server **MUST NOT** close the session before the deadline the sweep gives a session whose station is away: the session's end ([`05-state-machines.md` §3.4](../../05-state-machines.md#34-timeouts)) plus 60 seconds plus `ConnectionLostGracePeriod` (default: 300 seconds) — except for a **Partial-B session**, one the server authorized through AuthorizeOfflinePass. The loss does not end such a session, and its timer is its authorized duration, not this one: the server settles it once, on the first of its end records to arrive — the SessionEnded the station sends when it reconnects, the StopService RESPONSE of a stop the server commanded, which the station sends again when the server repeats the REQUEST after the reconnection, or the session's signed receipt, which the app uploads ([`reconciliation.md` §3](../offline/reconciliation.md#3-deduplication-offlinetxid)) — and closes it at the end of its authorized duration when none has arrived by then, as [`authorize-offline-pass.md` §6](../offline/authorize-offline-pass.md#6-processing-rules) rule 4a states.
   - **A station is away for its sessions from the start of its absence until it is back, and it is back only at a boot answered `Accepted`.** Its absence starts at the disconnection, or at a boot answered `Pending` or `Rejected` when the station was back before it. A station answered `Pending` or `Rejected` replays and reports nothing ([`05-state-machines.md` §1.4](../../05-state-machines.md#14-the-restricted-states)) and may stay so indefinitely, so the server **MUST** hold its sessions, a Partial-B session excepted (first bullet), away until a boot is answered `Accepted`, exactly as while the station is disconnected. Once the station is back, a session settles on the end record it replays or sends (§6 step 3), and the sweep gives it the deadline of a station that is not away.
   - If that deadline passes before the session's end record has arrived, the server **MUST** close the session with status `completed`, charge the **full pre-authorized amount**, and mark the close as an anomaly for an operator to review. The station runs a service it started to its end through a loss of its connection, on its local timer, so the customer received the whole service; the mark surfaces the exception, a session whose end record never came.
   - The low-delivery full-refund override (`faultFullRefundThreshold`, [`04-flows.md §6`](../../04-flows.md)) **MUST NOT** be applied here. That override is keyed on the service reported as faulted — a SessionEnded `reason` of `Fault` — and a close at the sweep's deadline reports none. What failed here is the *communication*, not the service, which the station ran on without it. An earlier revision applied the override on this path, which made a station's network fault a free wash.
5. **Update fleet dashboard:** The server **MUST** update the station's connection status to `offline` in the real-time fleet view.
6. **Log the event:** The server **MUST** log the ConnectionLost event with severity `Warning` for monitoring and analytics -- except for a `PlannedShutdown`, which the server **SHOULD** log at `Info`: nothing is wrong with a station that said it was leaving.
7. **Record which mechanism reported it.** The server **MUST** record whether the station was declared offline on a `PlannedShutdown`, on an `UnexpectedDisconnect` will, or on a heartbeat timeout, and **MUST NOT** collapse the three into one record. They assert opposite things about the station -- one says its firmware or network is implicated, one says nothing about the connection at all, and one says the departure was intended -- and an operator explaining an outage cannot recover the distinction afterwards from `is_online = false`.

Steps 1 to 5 are identical for all three. **A planned shutdown is not a lighter event for a customer mid-wash**: a station that announces its departure with a session running owes exactly the settlement of step 4, as step 4 states it for that session. What the announcement changes is the diagnosis, not the money.

## 6. Session Recovery on Reconnect

When a previously disconnected station reconnects:

1. The station **MUST** send a BootNotification as the first message on the new connection (standard boot sequence).
2. After the server responds with `Accepted`, the station **MUST** send a StatusNotification for each bay to report the current actual bay states.
3. The server **MUST** update each bay from its report, replacing the `Unknown` set during the disconnection. **A report updates its bay and ends no session**: the station reports its bays first and sends the end records it owes after them (step 4), so a bay reported `Available` or `Faulted` here is not the delivery record of an online session.
   - If a bay reports `Available` and the server had an active session, the session may have ended while the station was away, and for an online session its end record, not this report, settles it (last bullet). A Partial-B session is closed on this report, with pro-rated billing based on the estimated time delivered — except a Partial-B session whose station did not reboot, which it settles on the first of its end records, the SessionEnded the station buffered among them, or closes at the end of its authorized duration (§5); one whose station rebooted is settled as this bullet settles an online session, and an end record the station replays after its bay reports (step 4) is a duplicate ([`authorize-offline-pass.md` §6](../offline/authorize-offline-pass.md#6-processing-rules) rule 4a).
   - If a bay reports `Occupied` and the server has a matching active session, the session is still running, and the server **MUST** go on tracking it.
   - If a bay reports `Faulted`, the server **MUST** log the fault and notify operators. An online session the server had on the bay is not closed on the report: the station that faulted it ends it with a SessionEnded `Fault` (last bullet). A Partial-B session is settled as [`authorize-offline-pass.md` §6](../offline/authorize-offline-pass.md#6-processing-rules) rule 4a states.
   - **An online session is settled on its end record, whatever its bay reports, or closed by the sweep.** A station that kept a session through a boot, because it did not restart or because it restarted and resumed the wash ([`05-state-machines.md` §3.5](../../05-state-machines.md#35-per-session-sequence-number-seqno-and-crash-resilience) rule 2), replays the SessionEnded of a session that ended while it was away after its bay reports (step 4), and sends that of a resumed wash when the wash ends; a station that restarted and could not resume the wash sends a SessionEnded `Fault` for it at once, with the delivered time it last persisted (rule 6 there). That event, not a StatusNotification, is the delivery record ([`03-messages.md` §5.4](../../03-messages.md#54-sessionended)), and a wash that ran to its timer during the disconnection is charged in full on it. The server **MUST** settle the session on that end record, **MUST NOT** settle, close or fail it on a report of its bay or on the boot, whatever the `bootReason` ([`boot-notification.md` §5.2](boot-notification.md#52-bootreason--seven-boots-and-one-non-boot) rule 3), and **MUST NOT** start another session on that bay until the session has ended. A session whose end record does not come is closed by the sweep, `completed`, in full and marked as an anomaly: 60 seconds after the later of its end — the end of its booked duration, or that of a wash the station may have resumed after a restart — and the station's last boot, for a station that is back, or at its end plus 60 seconds plus `ConnectionLostGracePeriod` while the station is away (§5) ([`05-state-machines.md` §3.4](../../05-state-machines.md#34-timeouts)). An end record that arrives after that close is ignored, the session already settled ([`session-ended.md` §5](../transaction/session-ended.md#5-processing-rules) rule 4).
4. The station **MUST** replay any buffered events (StatusNotification, SessionStarted, MeterValues, SessionEnded, TransactionEvent) in chronological order after the initial bay state reports. After a restart, the SessionEnded of every session it held and could not resume comes first among the session records it sends, and a resumed wash ends with its SessionEnded when the wash ends ([`05-state-machines.md` §3.5](../../05-state-machines.md#35-per-session-sequence-number-seqno-and-crash-resilience) rules 2 and 6). **The station's first Heartbeat after the boot marks the end of its replay.** On a connection whose boot was answered `Accepted`, the station **MUST NOT** send a Heartbeat before the StatusNotifications of step 2 and every message it replays have been acknowledged (PUBACK), and **MUST** send one as soon as they have been: at once after the reports of step 2 when it has nothing to replay, a first boot included. A Heartbeat the server asks for with TriggerMessage during the replay is sent then, not before, and the next Heartbeats follow every `heartbeatIntervalSec` seconds after it ([`heartbeat.md` §7](heartbeat.md#7-processing-rules) rule 1). A server that can process a station's messages out of the order the station published them ([Chapter 02 §3.2](../../02-transport.md#32-message-ordering)) **MUST** process that Heartbeat after every message the station published before it.
5. The server **MUST** process replayed events to fill in gaps in session metering data and transaction records.

## 7. Offline Detection Timing

| Parameter | Default | Range | Description |
|-------------------------------|---------|-----------|-----------------------------------------------|
| MQTT keep-alive | 30s | 10--60s | MQTT-level keep-alive for TCP liveness. |
| LWT detection latency | ~45s | 15--90s | 1.5x MQTT keep-alive before broker publishes LWT. |
| Heartbeat timeout threshold | 3.5× `heartbeatIntervalSec` | 35--12600s | No-message threshold before server declares offline; between a boot answered `Accepted` and the station's first Heartbeat after it, the longer of this and 360 s (§4.2). |
| Session recovery grace | 300s | 60--600s | What the sweep adds to the deadline of a session whose station is away, beyond its end and the 60-second margin (§5) — a Partial-B session is closed at the end of its authorized duration instead (§5). |

**Trade-offs:**

- **Shorter detection times** (lower keep-alive, lower heartbeat interval) provide faster fault detection but increase network overhead and risk false positives during transient network issues.
- **Longer detection times** reduce false positives but delay operator notification and session recovery.
- The **RECOMMENDED** configuration is a 30-second MQTT keep-alive with a 30-second `heartbeatIntervalSec`, yielding a worst-case detection time of approximately 105 seconds (3.5× heartbeatIntervalSec), and 360 s between a boot answered `Accepted` and the station's first Heartbeat after it (§4.2 rule 2).

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
