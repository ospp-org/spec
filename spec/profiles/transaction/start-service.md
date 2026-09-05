# StartService

> **Status:** Draft

## 1. Overview

StartService is a server-initiated REQUEST that instructs a station to activate a specific service on a given bay. It is the primary mechanism for beginning a service session. The station validates bay availability, service compatibility, and hardware readiness before activating the service. Default credit authorization is configurable via `DefaultCreditsPerSession` (see §8 Configuration).

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------------------|---------|----------|-----------------------------------------------|
| `sessionId` | string | Yes | Unique session identifier (server-generated, `sess_` prefix). |
| `bayId` | string | Yes | Target bay identifier (`bay_` prefix). |
| `serviceId` | string | Yes | Catalog service to activate (`svc_` prefix) — the commercial offering, minted by the server. Not the station's physical program; see `programNumber`. |
| `programNumber` | integer | Yes | Ordinal of the **physical program** to run on the target bay, as the station declared it at provisioning. Carried so the station acts on a field rather than indexing its catalog by `serviceId`, and so a service minted since the last catalog push still starts. |
| `durationSeconds` | integer | Yes | Authorized duration in seconds (minimum 1). |
| `sessionSource` | string | Yes | Origin of the session: `MobileApp` or `WebPayment`. |
| `reservationId` | string | No | Associated reservation identifier, if the bay was pre-reserved. |
| `params` | object | No | Service-specific parameters (e.g., temperature, pressure). |

## 4. Response Payload (Accepted)

| Field | Type | Description |
|------------|---------|-----------------------------------------------|
| `status` | string | `Accepted` |

## 5. Response Payload (Rejected)

| Field | Type | Description |
|--------------|---------|-----------------------------------------------|
| `status` | string | `Rejected` |
| `errorCode` | integer | OSPP error code (see section 7). |
| `errorText` | string | Machine-readable error name in `UPPER_SNAKE_CASE`. |
| `programNumber` | integer | **Echo** of the requested ordinal. The rejection names the ordinal it refused, so an operator need not correlate against the request to find out which one was wrong. |

## 6. Processing Rules

1. The station **MUST** validate that the `bayId` exists; if not, it **MUST** respond with `3005 BAY_NOT_FOUND`.
2. The station **MUST** validate that the bay is in `Available` or `Reserved` state. If the bay is `Occupied` or `Finishing`, it **MUST** respond with `3001 BAY_BUSY`. If the bay is `Faulted`, `Unknown`, or transitioning, it **MUST** respond with `3002 BAY_NOT_READY`.
3. If the bay has an active reservation, the station **MUST** respond with `3014 BAY_RESERVED` unless the request carries a `reservationId` matching that reservation. A request that **omits** `reservationId` entirely is not the holder and is refused the same way — the field being absent is not a licence to start on a reserved bay.
4. If the bay is in `Unavailable` state due to maintenance, the station **MUST** respond with `3011 BAY_MAINTENANCE`.
5. The station **MUST** validate that the `serviceId` exists in its service catalog. If not, it **MUST** respond with `3004 INVALID_SERVICE`.
5a. The **server MUST NOT dispatch this message at all** unless it holds a service->program binding
   for the (bay, service) pair. It **MUST NOT** substitute a default ordinal, guess one from the
   catalog, or omit the field — `programNumber` is REQUIRED, and each of those three either starts
   the wrong hardware or produces a message no conforming station accepts. With no binding the
   server answers its own caller `3019 SERVICE_NOT_BOUND` and sends nothing to the station, which
   has no part in the fault. This is the mirror of rule 6: rule 6 is the station refusing an ordinal
   it was sent, and this is the server unable to send one.

6. The station **MUST** validate that `programNumber` was **declared for that bay** at provisioning. If it was not, the station **MUST** respond with `3017 PROGRAM_NOT_DECLARED`, echoing the refused ordinal, and **MUST NOT** activate any hardware. It **MUST NOT** substitute a neighbouring ordinal or clamp to the highest declared one — that charges for one thing and delivers another.
7. The station **MUST** validate that the requested service is physically available on the specified bay. If not, it **MUST** respond with `3003 SERVICE_UNAVAILABLE`. This is availability, not existence: the program **is** declared, it is merely not deliverable right now.
8. The station **MUST** validate that `durationSeconds` is positive and does not exceed `MaxSessionDurationSeconds`. If zero or negative, respond with `3008 DURATION_INVALID`. If exceeding the maximum, respond with `3010 MAX_DURATION_EXCEEDED`.
9. Upon accepting the request, and **before energising anything**, the station **MUST** durably record the command — at minimum the envelope `messageId`, the `sessionId`, the `bayId` and the `programNumber` — to non-volatile storage. If it cannot, it **MUST** refuse with `5103 STORAGE_ERROR` and **MUST NOT** activate. This is the MQTT twin of the BLE obligation in [`ble-session.md` §1](../offline/ble-session.md) rule 3, and it is what makes a mid-activation power loss recoverable: on the next boot an uncompleted record is the anchor that tells the station whether the command already ran, so it neither re-executes it (dispensing twice against one authorisation) nor loses it. **A station that energises first has no way to answer that question, and the protocol offers it no other source.**

    It **MUST** then attempt to physically activate the hardware (pump, valve, motor). **The activation timeout is bounded by the response deadline and is not a free parameter:** the server waits **10 seconds** for the StartService RESPONSE ([`03-messages.md` §2](../../03-messages.md), [`05-state-machines.md` §3.4](../../05-state-machines.md)), so the station's activation timeout **MUST NOT** exceed it, and **SHOULD** be short enough to leave time to compose the answer — **5 seconds** is the RECOMMENDED default. If hardware fails to start within it, the station **MUST** respond with `3009 HARDWARE_ACTIVATION_FAILED` and transition the bay to `Faulted`. The phrase *"the activation timeout"* named no value at all until 0.30.0: it occurred three times in this specification and in no registry, so every vendor picked one, and the server refunds in full on the outcome.
10. On success, the station **MUST** respond with `status: "Accepted"` and transition the bay to `Occupied` state.
11. If a `reservationId` is present and matches an active reservation, the station **MUST** consume the reservation upon successful activation.
12. An uncompleted record from rule 9 that the next boot cannot resolve either way **MUST** be reported, and this rule says how. Rule 9 mandates the record and names its consumer — *on the next boot an uncompleted record is the anchor that tells the station whether the command already ran* — and until 0.32.0 nothing said what the station does when the anchor answers *maybe*. [`05-state-machines.md` §3.5](../../05-state-machines.md#35-per-session-sequence-number-seqno-and-crash-resilience) rules 2 and 3 partition on whether the prior state is **recoverable**, and this case is neither arm: the record survived, so rule 3's orphaning does not apply, while the delivery it describes stopped at the power loss, so rule 2's *resume the session* would assert a service that is not running. The station **MUST NOT** take either arm by default. It **MUST** report through the two messages that already exist, and needs no new field to do it:

    - a SecurityEvent [MSG-012] with `type: "HardwareFault"`, whose `details` object is open (`additionalProperties: true`) and **MUST** carry the `sessionId`, the `bayId` and the `programNumber` from the rule 9 record. Without the `sessionId` the report cannot be bound to the settlement it qualifies, which is the whole of its value;
    - a StatusNotification [MSG-009] reporting the bay `Faulted`, per the *Hardware error detected* transition of [`05-state-machines.md` §2.3](../../05-state-machines.md#23-transition-table).

    **This is the activation twin of [`stop-service.md` §6](stop-service.md) rule 9**, which 0.30.0 wrote for the mirror-image condition — a stop answered `Accepted` that did not physically stop — and it is deliberately the same two messages, because the failure is the same failure seen from the other end: **settlement runs on a figure nobody measured.** There, the station reports a duration it did not observe. Here, [`connection-lost.md` §6](../core/connection-lost.md) has the server settle on *estimated time delivered* — and an estimate the server had no way to know was an estimate is worse than one it did.

    **What this rule does not do**, stated because the absence is deliberate: it gives the condition no terminal value of its own. A SessionEnded [MSG-040] reporting it would need a `reason`, and none of the seven is true; a station in this state therefore emits **no** SessionEnded, exactly as an orphaning station does not. The server closes the session on its own timer, and the SecurityEvent is what tells it the closing figure is unmeasured. Widening the `reason` enum was considered at 0.32.0 and refused with its cost — see [KNOWN-ISSUES.md](../../../KNOWN-ISSUES.md).

## 7. Error Codes

| Code | errorText | Severity | Description |
|:----:|---------------------------|:--------:|-----------------------------------------------|
| 3001 | `BAY_BUSY` | Warning | Bay is currently occupied by another session. |
| 3002 | `BAY_NOT_READY` | Warning | Bay is not in `Available` state. |
| 3003 | `SERVICE_UNAVAILABLE` | Warning | The service is declared on this bay and is not deliverable right now (delivering hardware faulted, disabled by configuration, or consumables depleted). Availability, not existence — rule 7 above. |
| 3004 | `INVALID_SERVICE` | Error | `serviceId` not found in the station's service catalog. |
| 3017 | `PROGRAM_NOT_DECLARED` | Error | `programNumber` was never declared for the target bay. Fail closed — reject, never accept and do nothing. |
| 3005 | `BAY_NOT_FOUND` | Error | `bayId` does not match any bay on this station. |
| 3006 | `SESSION_NOT_FOUND` | Error | The `sessionId` names a session that has already completed or failed. |
| 3008 | `DURATION_INVALID` | Error | `durationSeconds` is zero, negative, or below the service minimum. |
| 3009 | `HARDWARE_ACTIVATION_FAILED` | Error | Hardware failed to start within the activation timeout — at most the 10 s response deadline, 5 s RECOMMENDED (rule 9). |
| 3010 | `MAX_DURATION_EXCEEDED` | Warning | `durationSeconds` exceeds `MaxSessionDurationSeconds`. |
| 3011 | `BAY_MAINTENANCE` | Warning | Bay is in maintenance mode. |
| 3012 | `RESERVATION_NOT_FOUND` | Error | The provided `reservationId` does not match any active reservation. |
| 3013 | `RESERVATION_EXPIRED` | Warning | The reservation associated with this session has expired. |
| 3014 | `BAY_RESERVED` | Warning | Bay is reserved by another user. |
| 5001 | `PUMP_SYSTEM` | Critical | Actuator malfunction detected during activation. |
| 5004 | `ELECTRICAL_SYSTEM` | Critical | Power supply fault during activation. |
| 5103 | `STORAGE_ERROR` | Error | Non-volatile storage read or write failure — including a failure to persist the pending transaction record before confirming `Accepted` ([`ble-session.md` §3](../offline/ble-session.md) rule 3). |
| 5111 | `BUFFER_FULL` | Critical | Offline transaction buffer at or above 90% capacity; station rejects new sessions to prevent data loss. |

## 8. Idempotency

If the station receives a duplicate StartService REQUEST with the same `sessionId` as an already-active session on the same bay, it **MUST** return the same `Accepted` response without restarting the hardware or resetting timers. This ensures safe retries in case of network-level message duplication.

If the `sessionId` matches a completed or failed session, the station **MUST** respond with `3006 SESSION_NOT_FOUND`.

## 9. Examples

### 9.1 Request

```json
{
  "messageId": "msg_f5a6b7c8-d9e0-1234-abcd-567890123def",
  "messageType": "Request",
  "action": "StartService",
  "timestamp": "2026-02-13T10:10:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_a1b2c3d4",
    "serviceId": "svc_eco",
    "programNumber": 2,
    "durationSeconds": 300,
    "sessionSource": "MobileApp",
    "reservationId": "rsv_e5f6a7b8",
    "params": {
      "temperature": 35,
      "pressure": 80
    }
  }
}
```

### 9.2 Response (Accepted)

```json
{
  "messageId": "msg_f5a6b7c8-d9e0-1234-abcd-567890123def",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-02-13T10:10:00.350Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 9.3 Response (Rejected)

```json
{
  "messageId": "msg_f5a6b7c8-d9e0-1234-abcd-567890123def",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-02-13T10:10:00.350Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3001,
    "errorText": "BAY_BUSY",
    "programNumber": 2
  }
}
```

## 10. Related Schemas

- Request: [`start-service-request.schema.json`](../../../schemas/mqtt/start-service-request.schema.json)
- Response: [`start-service-response.schema.json`](../../../schemas/mqtt/start-service-response.schema.json)
- Session ID: [`session-id.schema.json`](../../../schemas/common/session-id.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Service ID: [`service-id.schema.json`](../../../schemas/common/service-id.schema.json)
- Reservation ID: [`reservation-id.schema.json`](../../../schemas/common/reservation-id.schema.json)
- Error codes: the StartService row of [Chapter 07 — Error Codes & Resilience §4.2](../../07-errors.md#42-server--station-mqtt-actions) is the
  authoritative set. §7 above lists the ones this action raises in its own right, with the meaning it gives them; it is a
  subset and not a second definition. This line previously restated the set as *"3001--3014, 3017, 5001, 5004, 5111"*, which
  swept in `3007 SESSION_MISMATCH` — a StopService code absent from §7 above — and omitted eight `50xx` codes §4.2 permits.
