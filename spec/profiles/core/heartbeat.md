# Heartbeat

> **Status:** Draft

## 1. Overview

The Heartbeat action is a periodic keep-alive message sent by the station to the server at the interval specified in the BootNotification response (`heartbeatIntervalSec`). It serves two purposes: connection liveness detection and clock synchronization.

The request payload is empty -- the station identity is derived from the MQTT topic and mTLS certificate. The server responds with the current UTC timestamp so the station can correct clock drift.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

The Heartbeat request has an **empty payload** (`{}`). The station identity is determined from the MQTT topic (e.g., `ospp/v1/stations/{station_id}/to-server`) and the mTLS client certificate.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| *(none)* | | | Payload **MUST** be an empty object. |

## 4. Response Payload

| Field | Type | Required | Description |
|--------------|--------|----------|--------------------------------------|
| `serverTime` | string | Yes | ISO 8601 UTC timestamp with millisecond precision. |

## 5. Interval Configuration

1. The `heartbeatIntervalSec` is initially set in the BootNotification response (range: 10--3600 seconds).
2. The server **MAY** update the interval at runtime via ChangeConfiguration with the key `HeartbeatIntervalSeconds`.
3. When the interval changes, the station **MUST** apply the new value starting from the next heartbeat cycle. The station **MUST NOT** reset an in-progress timer; the new interval takes effect after the current cycle completes.
4. A value arriving via **ChangeConfiguration** outside the 10--3600 second range is **rejected, not clamped**: [Chapter 08](../../08-configuration.md) §8.2 rule 4 requires `status: "Rejected"` with `5109 INVALID_CONFIGURATION_VALUE`, and [`TC-DM-006`](../../../conformance/test-cases/device-management/TC-DM-006.md) Part E tests exactly that. For an interval the station holds from any **other** source — a BootNotification RESPONSE from a non-conforming server, or a value recovered from NVS — the station **MUST** clamp it to the nearest boundary (10 or 3600) and log a `5102 CONFIGURATION_ERROR`. Values above 300 seconds are permitted but **SHOULD** only be used in low-bandwidth environments. The server **SHOULD** clamp values to operational needs.
5. The station **MUST** send heartbeats regardless of other message traffic. Heartbeats **MUST NOT** be suppressed even if the station recently sent other messages.

## 6. Clock Synchronization

1. On receiving a Heartbeat response, the station **MUST** compare `serverTime` with its local clock.
2. If the absolute drift exceeds **2 seconds**, the station **SHOULD** adjust its internal clock to match `serverTime`.
3. If the absolute drift exceeds **5 minutes**, the station **MUST** log a `5106 CLOCK_ERROR` warning. This **MAY** indicate an RTC battery failure or prolonged network partition.
4. The station **MUST** use the synchronized clock for all subsequent timestamps in StatusNotification, MeterValues, and TransactionEvent messages.
5. Clock adjustments **MUST NOT** affect the duration of active sessions. **The station MUST** track session elapsed time using a monotonic timer, not the wall clock.

   > **Whose obligation this is, and what the other party does instead.** This rule had no subject until `0.39.0`, and the omission mattered because both parties measure sessions. It is the **station's**, as [`session-ended.md` §5](../transaction/session-ended.md) rule 2 and [`stop-service.md` §5](../transaction/stop-service.md) rule 5 both say in terms — and it is the station's because only the station holds both ends of the interval in one uninterrupted process.
   >
   > **A receiver cannot be held to it, and requiring it would be requiring something unimplementable.** When a station reports no duration — the session ended in a way that produced no StopService RESPONSE and no SessionEnded — the receiver still has to settle, and its only anchor is a **stored** `startedAt`. That value survives restarts and may not have been written by the process now reading it, so no monotonic timer spans the interval. A receiver in that position **MUST** derive the figure from its own wall clock; there is nothing else to derive it from.
   >
   > **What follows from that, and it is the reason this is written down.** Such a figure carries the receiver's own clock risk: an adjustment landing between `startedAt` and settlement moves it, exactly as a station-side adjustment would. A receiver **SHOULD** therefore record, alongside the settled duration, whether the figure was **reported** by the station or **derived** from its own clock — they have different provenance and different failure modes, and an operator auditing a bill cannot tell them apart otherwise. `SHOULD` and not `MUST`: the distinction is an audit property rather than a wire one, no message carries it, and no conformance test can observe it.
6. **`actualDurationSeconds` is the field rule 5 exists for, and the receiver takes it verbatim.** It is the operand a settlement is computed from, and no receiver obligation anywhere in this specification bounds it or cross-checks it: [`session-ended-event.schema.json`](../../../schemas/mqtt/session-ended-event.schema.json), [`stop-service-response.schema.json`](../../../schemas/mqtt/stop-service-response.schema.json) and [`ble/stop-service-response.schema.json`](../../../schemas/ble/stop-service-response.schema.json) constrain it to `integer, minimum 0` and give it **no `maximum`**, and no rule asks a receiver to compare it against the interval between the session's own `startedAt` and `endedAt`. **A station that derives it from the wall clock therefore ships every correction that lands mid-session straight into the invoice**, in whichever direction the correction went, with nothing downstream to catch it — which is why rule 5 is a `MUST` and not a recommendation. The wall clock's job in a session is to stamp values that get **ordered** — the envelope `timestamp`, `startedAt`, `endedAt`; the monotonic timer's job is to produce the one that gets **differenced**. A station whose time source is a network the operator does not control — cellular `NITZ`, `NTP` over a metered link — **MUST** assume a correction can land at any point inside a session and **MUST NOT** let the two jobs share a clock.

7. **The rule generalises, and this is the general form.** Rules 5 and 6 settle one quantity,
   `actualDurationSeconds`, and the principle they settle it on is not specific to it: *the wall
   clock's job is to stamp values that get **ordered**; a monotonic source's job is to produce values
   that get **differenced***. Applied to the whole specification, that gives one rule and one
   discriminator, and an implementer needs no per-field table to use it:

   - A quantity this specification expresses as an **instant** — anything compared for order, stamped
     into a message, or evaluated against a value another party produced — is **wall-clock UTC**. The
     envelope `timestamp`, `startedAt`, `endedAt`, `scheduledAt`, a reservation's `expirationTime`,
     an OfflinePass's `issuedAt` and `expiresAt`, and a certificate's `notBefore`/`notAfter` are all
     of this kind. Two parties can only agree about order on a shared scale, and a monotonic source
     has none.
   - A quantity expressed as an **elapsed duration or a repeat interval**, measured and consumed
     **inside one uninterrupted process**, is taken from a **monotonic** source: session duration,
     `uptimeSeconds`, `heartbeatIntervalSec`, the reconnect backoff ladder, `MeterValuesInterval`,
     `SessionTimeout`, `MaxSessionDurationSeconds` and the firmware polling cadence. A clock
     correction landing mid-interval **MUST NOT** move any of them.

   > **The discriminator is "must it survive a restart", and it is why this is not a blanket rule.**
   > A monotonic source restarts when the process does, so an interval that has to outlive a reboot
   > cannot be taken from one — it has to be a difference between two **stored wall-clock instants**,
   > and it inherits the wall clock's correction risk in exchange for surviving at all. Two rules in
   > this specification are of that kind and are deliberately **not** monotonic:
   > `constraints.minIntervalSec` (check #9 of [`06-security.md` §6.1.1](../../06-security.md)),
   > which compares against the instant of the last transaction from a pass — a value the station is
   > required to persist — and `CertificateRenewalThresholdDays`, which is a distance from a
   > certificate's `notAfter` and therefore lives on the certificate's own scale.
   > `stationOfflineWindowHours` is monotonic **because** it bounds one continuous offline stretch;
   > a station that reboots has not continued that stretch, it has started a new one.
   >
   > **What this closes.** Before it, three quantities in this specification had a clock named and
   > the rest had none, so each was a separate decision for an integrator on a board whose clock the
   > cellular network corrects without asking. The rule above names the clock for all of them, and
   > names the two exceptions rather than leaving them to be discovered.

> **Why rule 2 is `SHOULD` and not `MUST`.** Nothing in the protocol breaks at 2.1 seconds of drift. Billing does not ride the wall clock (rule 5 puts session duration on a monotonic timer); anti-replay does not either (it is `messageId` binding and monotonic counters — [`06-security.md` §5.3, §6.3](../../06-security.md) — and a clock-based TTL on the session key is expressly forbidden). **One thing does ride it, and this enumeration used to omit it:** OfflinePass temporal validity — `expiresAt` and the `OfflinePassMaxAge` age bound of check #2 ([`offline-pass.md` §4](../offline/offline-pass.md#4-validation-checks-10)) — is a wall-clock comparison, and it is evaluated in the one mode where rules 1-3 above cannot run at all, because a Heartbeat response is what they consume. `offline-pass.md` §4 states what a station does about that; the short form is that it uses the clock it has and does not refuse for want of a better one, while `stationOfflineWindowHours` is put on a monotonic timer under rule 5's own logic. The one mechanism that does consume station timestamps is the StatusNotification ordering floor, and it states its own tolerance as a number: a report below the floor by more than the message's own MQTT Expiry Interval and by at most **300 seconds** is *accepted* as skew ([`02-transport.md` §3.2](../../02-transport.md#32-message-ordering)). That 300 is rule 3's five minutes, read from the other side — which is the whole reason the boundary is rule 3's and it **is** a `MUST`. Two seconds is a quality target for timestamp accuracy. Making it a `MUST` would also fail stations for their network rather than their clock: the drift a station measures includes the server's processing time plus the downlink delay, which on a cellular link can approach the threshold on its own. Rule 1 stays a `MUST` because rule 3 cannot be satisfied without it.

## 7. Processing Rules

1. The station **MUST** send a Heartbeat every `heartbeatIntervalSec` seconds after receiving BootNotification `Accepted`.
2. The station **MUST NOT** send Heartbeat messages before BootNotification has been accepted.
3. If the server does not respond within 30 seconds, the station **MUST** log `1010 MESSAGE_TIMEOUT` and continue sending heartbeats at the configured interval.
4. The server **MUST** track the last heartbeat timestamp per station. If no message is received for `3.5 × heartbeatIntervalSec` seconds, the server **MUST** treat the station as disconnected (see [ConnectionLost](connection-lost.md)).
5. During MQTT reconnection backoff, the station **MUST NOT** send heartbeats. Heartbeats resume only after a successful BootNotification `Accepted` exchange on the new connection.

## 8. Error Handling

| Condition | Error Code | Behaviour |
|---------------------------------|---------------------|-----------------------------------------------|
| Invalid message format | `1005 INVALID_MESSAGE_FORMAT` | Server drops the message. Station retries on next interval. |
| Server internal error | `6001 SERVER_INTERNAL_ERROR` | Server **MAY** omit the response. Station continues heartbeat cycle. |
| No response within 30 seconds | `1010 MESSAGE_TIMEOUT` | Station logs warning and continues sending heartbeats. |
| Clock drift > 5 minutes | `5106 CLOCK_ERROR` | Station logs warning and adjusts clock from response. |

## 9. Examples

### 9.1 Request

```json
{
  "messageId": "hb_c8d9e0f1-a2b3-4567-ijkl-890123456ghi",
  "messageType": "Request",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:16:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {}
}
```

### 9.2 Response

```json
{
  "messageId": "hb_c8d9e0f1-a2b3-4567-ijkl-890123456ghi",
  "messageType": "Response",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:16:00.150Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "serverTime": "2026-02-13T10:16:00.150Z"
  }
}
```

## 10. Related Schemas

- Request: [`heartbeat-request.schema.json`](../../../schemas/mqtt/heartbeat-request.schema.json)
- Response: [`heartbeat-response.schema.json`](../../../schemas/mqtt/heartbeat-response.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1005, 1010, 5106, 6001 — the conditions of [§8](#8-error-handling); none of them is carried in a Heartbeat RESPONSE, which is `serverTime` and nothing else)
