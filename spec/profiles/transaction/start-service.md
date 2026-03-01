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
| `serviceId` | string | Yes | Service program to activate (`svc_` prefix). |
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
| `errorCode` | integer | OSPP error code (see section 6). |
| `errorText` | string | Machine-readable error name in `UPPER_SNAKE_CASE`. |

## 6. Processing Rules

1. The station **MUST** validate that the `bayId` exists; if not, it **MUST** respond with `3005 BAY_NOT_FOUND`.
2. The station **MUST** validate that the bay is in `Available` or `Reserved` state. If the bay is `Occupied` or `Finishing`, it **MUST** respond with `3001 BAY_BUSY`. If the bay is `Faulted` or transitioning, it **MUST** respond with `3002 BAY_NOT_READY`.
3. If the bay has an active reservation held by a different `reservationId`, the station **MUST** respond with `3014 BAY_RESERVED`.
4. If the bay is in `Unavailable` state due to maintenance, the station **MUST** respond with `3011 BAY_MAINTENANCE`.
5. The station **MUST** validate that the `serviceId` exists in its service catalog. If not, it **MUST** respond with `3004 INVALID_SERVICE`.
6. The station **MUST** validate that the requested service is physically available on the specified bay. If not, it **MUST** respond with `3003 SERVICE_UNAVAILABLE`.
7. The station **MUST** validate that `durationSeconds` is positive and does not exceed `MaxSessionDurationSeconds`. If zero or negative, respond with `3008 DURATION_INVALID`. If exceeding the maximum, respond with `3010 MAX_DURATION_EXCEEDED`.
8. Upon accepting the request, the station **MUST** attempt to physically activate the hardware (pump, valve, motor). If hardware fails to start within the activation timeout, the station **MUST** respond with `3009 HARDWARE_ACTIVATION_FAILED` and transition the bay to `Faulted`.
9. On success, the station **MUST** respond with `status: "Accepted"` and transition the bay to `Occupied` state.
10. If a `reservationId` is present and matches an active reservation, the station **MUST** consume the reservation upon successful activation.

## 7. Error Codes

| Code | errorText | Severity | Description |
|:----:|---------------------------|:--------:|-----------------------------------------------|
| 3001 | `BAY_BUSY` | Warning | Bay is currently occupied by another session. |
| 3002 | `BAY_NOT_READY` | Warning | Bay is not in `Available` state. |
| 3003 | `SERVICE_UNAVAILABLE` | Warning | Service not available on this bay (hardware absent or consumables depleted). |
| 3004 | `INVALID_SERVICE` | Error | `serviceId` not found in the station's service catalog. |
| 3005 | `BAY_NOT_FOUND` | Error | `bayId` does not match any bay on this station. |
| 3008 | `DURATION_INVALID` | Error | `durationSeconds` is zero, negative, or below the service minimum. |
| 3009 | `HARDWARE_ACTIVATION_FAILED` | Error | Hardware failed to start within the activation timeout. |
| 3010 | `MAX_DURATION_EXCEEDED` | Warning | `durationSeconds` exceeds `MaxSessionDurationSeconds`. |
| 3011 | `BAY_MAINTENANCE` | Warning | Bay is in maintenance mode. |
| 3012 | `RESERVATION_NOT_FOUND` | Error | The provided `reservationId` does not match any active reservation. |
| 3013 | `RESERVATION_EXPIRED` | Warning | The reservation associated with this session has expired. |
| 3014 | `BAY_RESERVED` | Warning | Bay is reserved by another user. |
| 5001 | `PUMP_SYSTEM` | Critical | Actuator malfunction detected during activation. |
| 5004 | `ELECTRICAL_SYSTEM` | Critical | Power supply fault during activation. |
| 5111 | `BUFFER_FULL` | Warning | Offline transaction buffer near capacity; station rejects new sessions to prevent data loss. |

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
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_a1b2c3d4",
    "serviceId": "svc_eco",
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
  "protocolVersion": "0.1.0",
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
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3001,
    "errorText": "BAY_BUSY"
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
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3001--3014, 5001, 5004)
