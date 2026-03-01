# StopService

> **Status:** Draft

## 1. Overview

StopService is a server-initiated REQUEST that instructs a station to stop an active service on a given bay. It may be triggered by the user, by timer expiry, or by server-side logic (e.g., insufficient balance). On success the station reports actual usage and credits charged.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------------|--------|----------|--------------------------------------|
| `sessionId` | string | Yes | Session to stop (`sess_` prefix). |
| `bayId` | string | Yes | Target bay identifier (`bay_` prefix). |

## 4. Response Payload (Accepted)

| Field | Type | Description |
|--------------------------|---------|-----------------------------------------------|
| `status` | string | `Accepted` |
| `actualDurationSeconds` | integer | Actual service duration in seconds (minimum 0). |
| `creditsCharged` | integer | Final credits charged for the session. |
| `meterValues` | object | Final meter readings (optional, see MeterValues). |

## 5. Response Payload (Rejected)

| Field | Type | Description |
|--------------|---------|-----------------------------------------------|
| `status` | string | `Rejected` |
| `errorCode` | integer | OSPP error code (see section 7). |
| `errorText` | string | Machine-readable error name in `UPPER_SNAKE_CASE`. |

## 6. Processing Rules

1. The station **MUST** validate that the `bayId` exists; if not, it **MUST** respond with `3005 BAY_NOT_FOUND`.
2. The station **MUST** validate that there is an active session on the specified bay. If no session is active, it **MUST** respond with `3006 SESSION_NOT_FOUND`.
3. The station **MUST** validate that the `sessionId` matches the currently active session on the bay. If there is a mismatch, it **MUST** respond with `3007 SESSION_MISMATCH`.
4. Upon acceptance, the station **MUST** immediately deactivate the hardware (pump, valve, motor) on the bay.
5. The station **MUST** calculate `actualDurationSeconds` from the service start time to the moment of deactivation.
6. The station **MUST** calculate `creditsCharged` based on the actual duration and the service rate.
7. The station **SHOULD** include final `meterValues` in the response if metering is supported.
8. After successfully stopping the service, the station **MUST** transition the bay from `Occupied` to `Finishing` and then to `Available` once hardware shutdown is confirmed.
9. If hardware deactivation fails, the station **MUST** still respond with `Accepted` (the stop was processed) but **SHOULD** report the hardware fault via a SecurityEvent.

## 7. Error Codes

| Code | errorText | Severity | Description |
|:----:|----------------------|:--------:|-----------------------------------------------|
| 3005 | `BAY_NOT_FOUND` | Error | `bayId` does not match any bay on this station. |
| 3006 | `SESSION_NOT_FOUND` | Error | No active session exists on the specified bay, or the session has already ended. |
| 3007 | `SESSION_MISMATCH` | Error | `sessionId` does not match the currently active session on the bay. |
| 3011 | `BAY_MAINTENANCE` | Warning | Bay is in maintenance mode and cannot process stop requests. |

## 8. Examples

### 8.1 Request

```json
{
  "messageId": "msg_a6b7c8d9-e0f1-2345-abcd-678901234ef0",
  "messageType": "Request",
  "action": "StopService",
  "timestamp": "2026-02-13T10:14:58.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "bayId": "bay_a1b2c3d4"
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_a6b7c8d9-e0f1-2345-abcd-678901234ef0",
  "messageType": "Response",
  "action": "StopService",
  "timestamp": "2026-02-13T10:14:58.420Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted",
    "actualDurationSeconds": 298,
    "creditsCharged": 50,
    "meterValues": {
      "liquidMl": 45200,
      "consumableMl": 500,
      "energyWh": 150
    }
  }
}
```

### 8.3 Response (Rejected)

```json
{
  "messageId": "msg_a6b7c8d9-e0f1-2345-abcd-678901234ef0",
  "messageType": "Response",
  "action": "StopService",
  "timestamp": "2026-02-13T10:14:58.420Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3006,
    "errorText": "SESSION_NOT_FOUND"
  }
}
```

## 9. Related Schemas

- Request: [`stop-service-request.schema.json`](../../../schemas/mqtt/stop-service-request.schema.json)
- Response: [`stop-service-response.schema.json`](../../../schemas/mqtt/stop-service-response.schema.json)
- Session ID: [`session-id.schema.json`](../../../schemas/common/session-id.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Meter Values: [`meter-values.schema.json`](../../../schemas/common/meter-values.schema.json)
- Credit Amount: [`credit-amount.schema.json`](../../../schemas/common/credit-amount.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3005, 3006, 3007, 3011)
