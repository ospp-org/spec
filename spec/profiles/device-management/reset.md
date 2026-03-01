# Reset

> **Status:** Draft

Perform a soft or hard reset on the station. The station **MUST** handle active sessions gracefully before resetting.

## 1. Overview

Reset is a server-initiated command that instructs the station to perform either a soft reset (firmware restart) or a hard reset (factory defaults). A soft reset restarts the station firmware while preserving all configuration and data. A hard reset restores the station to factory defaults, clearing all local configuration and cached data. Automatic reboot after configuration changes is configurable via `AutoRebootEnabled` (see §8 Configuration).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|--------|--------|----------|-----------------------------------------------|
| `type` | string | Yes | `Soft` (firmware restart) or `Hard` (factory reset). |

## 4. Response Payload

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Processing Rules

1. On receiving a Reset command, the station **MUST** first check for active sessions.
2. If active sessions exist, the station **MUST** respond with `Rejected` and error code `3016 ACTIVE_SESSIONS_PRESENT`. The server **MAY** re-issue the command after sessions have completed.
3. If no active sessions exist, the station **MUST** respond with `Accepted` and then initiate the reset.
4. For a **Soft** reset: the station **MUST** restart its firmware process. Configuration, logs, and persisted data **MUST** be preserved. After restart, the station **MUST** send a BootNotification with `bootReason: "ManualReset"`.
5. For a **Hard** reset: the station **MUST** restore factory defaults and clear all local configuration, cached credentials, and session history. After restart, the station **MUST** send a BootNotification with `bootReason: "ManualReset"`. The server **SHOULD** expect a re-provisioning flow after a hard reset.
6. The station **MUST** send the `Accepted` response before performing the reset to ensure the server receives acknowledgement.
7. The response `messageId` **MUST** match the request `messageId`.

## 6. Active Session Handling

When the station has active sessions at the time of a Reset request:

1. The station **MUST** respond with `Rejected` and error code `3016 ACTIVE_SESSIONS_PRESENT`.
2. The server **SHOULD** wait for active sessions to complete naturally, then re-issue the Reset command.
3. Alternatively, the server **MAY** send StopService commands for each active session first, wait for confirmation, and then re-issue the Reset command.
4. If the server needs an immediate reset regardless of active sessions, it **SHOULD** first stop all active sessions via StopService and then re-issue the Reset command.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `3016` | `ACTIVE_SESSIONS_PRESENT` | Warning | The station has active sessions and cannot reset. Stop sessions first. |
| `5107` | `OPERATION_IN_PROGRESS` | Warning | Another operation is already in progress on the station. |
| `5110` | `RESET_FAILED` | Critical | The station encountered a hardware or software error during reset. |

## 8. Examples

### 8.1 Request (Soft Reset)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cdef-567890123ab0",
  "messageType": "Request",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "type": "Soft"
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cdef-567890123ab0",
  "messageType": "Response",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.150Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 8.3 Request (Hard Reset)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cde1-567890123ab1",
  "messageType": "Request",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "type": "Hard"
  }
}
```

### 8.4 Response (Rejected -- Active Sessions)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cde1-567890123ab1",
  "messageType": "Response",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.150Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3016,
    "errorText": "ACTIVE_SESSIONS_PRESENT"
  }
}
```

## 9. Related Schemas

- Request: [`reset-request.schema.json`](../../../schemas/mqtt/reset-request.schema.json)
- Response: [`reset-response.schema.json`](../../../schemas/mqtt/reset-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3016, 5107, 5110)
