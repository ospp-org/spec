# SessionEnded

> **Status:** Draft

## 1. Overview

SessionEnded [MSG-040] is the EVENT a station emits when a session terminates **without** a server-initiated StopService — the timer ran out, hardware faulted, the user pressed Stop at the bay, offline credit ran out, or the pass was revoked mid-session. It carries the delivered duration, the credits the station computed, and the final meter readings.

It is the **sole billing source** for those terminations. A session ended autonomously has no StopService RESPONSE to carry its numbers, so a lost SessionEnded is a service delivered and never billed. [Chapter 01 §6.5](../../01-architecture.md#65-offline-message-buffering) therefore forbids discarding it while buffered, and [Chapter 02 §5.1](../../02-transport.md) classifies it as a critical event that never expires.

This message is **not** sent when the server stopped the session: StopService RESPONSE [MSG-006] already carries the final billing data, and emitting both for one stop would make the settlement ambiguous.

> **Profile membership.** SessionEnded belongs to **Transaction**, and did not belong to any profile before 0.13.0. Chapter 03 groups it under "Status & Monitoring", which is a documentation taxonomy and not a profile assignment — MeterValues sits in the same chapter section and has always been a Transaction action. Membership follows the session lifecycle and the billing surface, both of which are this profile's subject.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT (fire-and-forget; no response)
- **Topic:** `ospp/v1/stations/{station_id}/to-server`
- **Message expiry:** never expires ([`02-transport.md` §5.1](../../02-transport.md))

## 3. Payload Fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `sessionId` | string | Yes | Session identifier (`sess_{uuid}`). |
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`). |
| `reason` | string | Yes | Why the session ended — see §4. |
| `actualDurationSeconds` | integer | Yes | Service time actually delivered, in seconds. |
| `creditsCharged` | integer | Yes | Credits the station computed. **Advisory** — see §5. |
| `meterValues` | object | No | Final meter readings, when the station has meters. |
| `meterValues.liquidMl` | integer | No | Total liquid consumed, millilitres. |
| `meterValues.consumableMl` | integer | No | Total consumable consumed, millilitres. |
| `meterValues.energyWh` | integer | No | Total energy consumed, watt-hours. |
| `seqNo` | integer | No | Per-session monotonic counter, continuing the session's MeterValues sequence ([`02-transport.md` §3.2](../../02-transport.md#32-message-ordering)). |
| `finalSeqNo` | integer | No | Highest `seqNo` emitted for this session, including this event's own. Servers **MUST** discard later MeterValues for the same `sessionId` carrying `seqNo > finalSeqNo`. |

The authoritative field list is [Chapter 03 §5.4](../../03-messages.md#54-sessionended); the table above restates it and the schema below is what validates.

## 4. Reasons

| Value | Billing |
|-------|---------|
| `TimerExpired` | Full booked duration delivered. |
| `Fault` | Pro-rated on delivered duration; the low-delivery override applies below `faultFullRefundThreshold` of the booked duration. |
| `Local` | Pro-rated; unused pre-authorization refunded. |
| `LocalOutOfCredit` | **Zero.** |
| `Deauthorized` | **Zero.** |
| `Inactivity` | Pro-rated on delivered duration. The customer received service and then stopped engaging with it; that is the same shape as `Local`, and it is billed the same way. |
| `OperatorStopped` | Pro-rated — one of two reasons here that bill a non-zero amount for a session the station did not run to completion. |

The **Billing** column above is the `UserDuration` case — the pro-rata baseline. It is **not** the whole settlement rule: under *Settlement by Service Kind* ([Chapter 04 §6](../../04-flows.md)), a `FixedDuration` or `MultiUnit` session settles all-or-nothing, which changes the `Local`, `Fault` and `OperatorStopped` rows. That section governs where this table is read as unconditional.

The normative descriptions of each value, and the reasoning behind `OperatorStopped`, are in [Chapter 03 §5.4](../../03-messages.md#54-sessionended). Server-side state transitions for each are in [Chapter 05 §3](../../05-state-machines.md).

## 5. Processing Rules

1. The station **MUST** emit SessionEnded for every session that terminates without a StopService command, and **MUST NOT** emit it for one that terminates with one.
2. The station **MUST** compute `actualDurationSeconds` from a monotonic timer, not the wall clock ([`heartbeat.md` §6](../core/heartbeat.md#6-clock-synchronization) rule 5).
3. If the station cannot transmit — offline, or in a restricted state ([Chapter 05 §1.4](../../05-state-machines.md#14-the-restricted-states)) — it **MUST** buffer the event and **MUST NOT** discard it, and **MUST** retain the original payload so a retransmission after a long outage carries the terminal values rather than recomputed ones ([`02-transport.md` §5.3](../../02-transport.md)).
4. The server **MUST** deduplicate by `sessionId`: a repeated SessionEnded for a session already settled **MUST** be ignored, not settled twice.
5. The server **MUST** treat `creditsCharged` as advisory input and apply the active tariff itself. The server is the billing authority ([`04-flows.md`](../../04-flows.md)); a station-reported amount is evidence of what was delivered, not an invoice.
6. The server **MUST** process SessionEnded before acting on the StatusNotification [MSG-009] that follows it, which reports the bay's new state.

## 6. Compliance

SessionEnded is REQUIRED at **Standard** compliance and above, on the same terms as the rest of this profile ([README §4.1](README.md#41-mandatory-implementation)). A station is conformant on this action when it emits the event for every autonomous termination and for no server-initiated one, and buffers an undeliverable one without discarding it (rules 1 and 3). A server is conformant when it settles at most once per `sessionId` and bills from its own tariff (rules 4 and 5).

## 7. Example

Timer expiry:

```json
{
  "sessionId": "sess_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "reason": "TimerExpired",
  "actualDurationSeconds": 300,
  "creditsCharged": 50,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  }
}
```

## 8. Related Schemas

- Event: [`session-ended-event.schema.json`](../../../schemas/mqtt/session-ended-event.schema.json)
- Meter Values: [`meter-values.schema.json`](../../../schemas/common/meter-values.schema.json)
- Session ID: [`session-id.schema.json`](../../../schemas/common/session-id.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
