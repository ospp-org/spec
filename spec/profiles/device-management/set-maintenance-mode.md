# SetMaintenanceMode

> **Status:** Draft

Enable or disable maintenance mode on a specific bay or the entire station. When enabled, the affected bay(s) transition to Unavailable and **MUST NOT** accept new sessions.

## 1. Overview

SetMaintenanceMode is a server-initiated command that enables or disables maintenance mode on a specific bay or, if no `bayId` is provided, on all bays of the station. When maintenance mode is enabled, the bay transitions to `Unavailable` and will not accept new sessions. When disabled, the bay transitions back to `Available`.

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-----------|---------|----------|-----------------------------------------------|
| `bayId` | string | No | Target bay identifier. If absent, maintenance mode applies to all bays. |
| `enabled` | boolean | Yes | `true` to enable maintenance mode, `false` to disable. |
| `reason` | string | No | Human-readable reason for the maintenance (e.g., "Pump replacement"). |

## 4. Response Payload

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Processing Rules

1. If `bayId` is provided and the bay does not exist, the station **MUST** respond with `Rejected` and error code `3005 BAY_NOT_FOUND`.
2. If the target bay is currently `Occupied` (has an active session), the station **MUST** respond with `Rejected` and error code `3001 BAY_BUSY`. Maintenance mode **MUST NOT** be set on an occupied bay.
3. If `bayId` is absent, the station **MUST** apply the maintenance mode to all bays. If any bay is `Occupied`, the station **MUST** respond with `Rejected` and error code `3001 BAY_BUSY`.
4. On `Accepted`, the station **MUST** send a StatusNotification for each affected bay reflecting the new state.
5. When `enabled` is `true`, the bay **MUST** transition to `Unavailable`. The legal sources are `Available` **and `Faulted`** — see the `SetMaintenanceMode ON` row of [`05-state-machines.md` §2.3](../../05-state-machines.md#23-transition-table), which is the only place the sources are enumerated. A faulted bay is the ordinary case, not an edge case: taking a bay out of service is usually what an operator does *because* it faulted, and a station that accepts maintenance only from `Available` cannot be told to stop offering the one bay that is broken.
6. When `enabled` is `false`, the bay **MUST** transition from `Unavailable` to `Available`.
7. If the bay is already in the requested state (e.g., already in maintenance and `enabled` is `true`), the station **MUST** respond with `Accepted` (idempotent).
8. The response `messageId` **MUST** match the request `messageId`.

## 6. Bay State Transitions

The two transitions this command effects are the `SetMaintenanceMode ON` and `SetMaintenanceMode OFF` rows of [`05-state-machines.md` §2.3](../../05-state-machines.md#23-transition-table). That table is canonical and is not restated here. What is local to this command is which refusals apply to which source state:

| Bay is | `enabled: true` | `enabled: false` |
|---|---|---|
| `Available` | → `Unavailable` | `Accepted`, no change (rule 7) |
| `Faulted` | → `Unavailable` | `Accepted`, no change (rule 7) |
| `Unavailable` | `Accepted`, no change (rule 7) | → `Available` |
| `Occupied`, `Finishing` | `Rejected`, `3001 BAY_BUSY` (rule 2) | `Accepted`, no change (rule 7) |
| `Reserved` | `Rejected`, `3014 BAY_RESERVED` | `Accepted`, no change (rule 7) |
| `Unknown` | `Rejected`, `3002 BAY_NOT_READY` | `Rejected`, `3002 BAY_NOT_READY` |

`Reserved` and `Unknown` are refused because §2.3 contains no transition from either to `Unavailable`, not because maintenance is undesirable on them: a reservation is a commitment to a named user and the station cancels it explicitly ([CancelReservation](../transaction/cancel-reservation.md)) before the bay can be taken out of service, and an `Unknown` bay has not yet been evaluated at all.

When maintenance mode is enabled, the station **MUST** set the bay status to `Unavailable` with the reason stored internally for diagnostics. The bay **MUST NOT** accept StartService commands while in maintenance mode.

When maintenance mode is disabled, the bay **MUST** return to `Available` status and resume accepting StartService commands.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `3001` | `BAY_BUSY` | Warning | The bay has an active session and cannot enter maintenance mode. |
| `3002` | `BAY_NOT_READY` | Warning | The bay is `Unknown` — the station has not finished evaluating it and has no state to move it out of. |
| `3005` | `BAY_NOT_FOUND` | Error | The specified `bayId` does not exist on this station. |
| `3014` | `BAY_RESERVED` | Warning | The bay is held for a named user. Cancel the reservation first ([CancelReservation](../transaction/cancel-reservation.md)); the release is explicit, never a side effect of maintenance. |

## 8. Examples

### 8.1 Request (Enable Maintenance)

```json
{
  "messageId": "msg_c0d1e2f3-a4b5-6789-cde0-012345678ab0",
  "messageType": "Request",
  "action": "SetMaintenanceMode",
  "timestamp": "2026-02-13T10:28:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a1b2c3d4e5f6",
    "enabled": true,
    "reason": "Pump replacement"
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_c0d1e2f3-a4b5-6789-cde0-012345678ab0",
  "messageType": "Response",
  "action": "SetMaintenanceMode",
  "timestamp": "2026-02-13T10:28:00.200Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 8.3 Request (Disable Maintenance)

```json
{
  "messageId": "msg_c0d1e2f3-a4b5-6789-cde1-012345678ab1",
  "messageType": "Request",
  "action": "SetMaintenanceMode",
  "timestamp": "2026-02-13T14:00:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a1b2c3d4e5f6",
    "enabled": false
  }
}
```

### 8.4 Response (Rejected -- Bay Occupied)

```json
{
  "messageId": "msg_c0d1e2f3-a4b5-6789-cde2-012345678ab2",
  "messageType": "Response",
  "action": "SetMaintenanceMode",
  "timestamp": "2026-02-13T10:28:00.200Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3001,
    "errorText": "BAY_BUSY"
  }
}
```

## 9. Related Schemas

- Request: [`set-maintenance-mode-request.schema.json`](../../../schemas/mqtt/set-maintenance-mode-request.schema.json)
- Response: [`set-maintenance-mode-response.schema.json`](../../../schemas/mqtt/set-maintenance-mode-response.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3001, 3005)
