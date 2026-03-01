# TriggerMessage

> **Status:** Draft

## 1. Overview

The TriggerMessage action allows the server to request the station to send a specific message immediately, outside of its normal schedule. This is useful for on-demand diagnostics, status checks, and operational verification without waiting for the next scheduled interval.

## 2. Direction and Type

- **Direction:** Server → Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `requestedMessage` | string | Yes | The message type to trigger. One of: `"BootNotification"`, `"StatusNotification"`, `"MeterValues"`, `"Heartbeat"`, `"DiagnosticsNotification"`, `"FirmwareStatusNotification"`, `"SecurityEvent"`, `"SignCertificate"`. |
| `bayId` | string | No | Bay identifier for bay-specific messages (`StatusNotification`, `MeterValues`). If omitted for a bay-specific message, the station SHOULD send the message for all bays. |

## 4. Response Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `"Accepted"`, `"Rejected"`, or `"NotImplemented"`. |

**Status values:**

| Status | Meaning |
|--------|---------|
| `Accepted` | The station will send the requested message within 5 seconds. |
| `Rejected` | The station cannot send the requested message at this time (e.g., no active session for MeterValues). |
| `NotImplemented` | The station does not support triggering this message type. |

## 5. Processing Rules

1. After responding `Accepted`, the station MUST send the requested message within **5 seconds**.
2. The triggered message is a normal message instance — it uses the same format, topic, and processing rules as if it were sent on schedule.
3. If `requestedMessage` is `StatusNotification` and `bayId` is provided, the station MUST send a StatusNotification only for the specified bay.
4. If `requestedMessage` is `MeterValues` and no session is active on the specified bay (or any bay if `bayId` is omitted), the station SHOULD respond `Rejected`.
5. If `requestedMessage` is `SignCertificate`, the station MUST generate a new CSR and initiate the certificate renewal flow.
6. If `requestedMessage` is `DiagnosticsNotification` or `FirmwareStatusNotification`, the station MUST send the current status of the most recent diagnostics or firmware update operation. If no operation has occurred, the station SHOULD respond `Rejected`.
7. The station MUST NOT queue multiple triggered messages for the same `requestedMessage` — if a new TriggerMessage arrives while the previous triggered message has not yet been sent, the station MAY discard the older trigger.
8. TriggerMessage is HMAC-signed in both `Critical` and `All` modes (server command that causes station behavior change).
9. The server **SHOULD NOT** send more than **1 TriggerMessage per `requestedMessage` type per 30-second window**. The station **MAY** ignore duplicate triggers for the same `requestedMessage` within this window.

## 6. Error Handling

TriggerMessage does not define message-specific error codes. The `NotImplemented` status value is used instead of an error code.

| Condition | Error Code | Behaviour |
|-----------|------------|-----------|
| Response timeout (10s) | `1010 MESSAGE_TIMEOUT` | Server logs warning. Station did not respond within 10 seconds. |
| Invalid message format | `1005 INVALID_MESSAGE_FORMAT` | Station drops the message. |
| Unsupported feature | `2007 COMMAND_NOT_SUPPORTED` | Station does not implement TriggerMessage at all. |
| Server internal error | `6001 SERVER_INTERNAL_ERROR` | Server returns error response. |

## 7. Examples

### 7.1 Trigger StatusNotification

**REQUEST payload:**

```json
{
  "requestedMessage": "StatusNotification",
  "bayId": "bay_c1d2e3f4a5b6"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

### 7.2 Trigger Heartbeat

**REQUEST payload:**

```json
{
  "requestedMessage": "Heartbeat"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

### 7.3 Unsupported Message Type

**REQUEST payload:**

```json
{
  "requestedMessage": "SecurityEvent"
}
```

**RESPONSE:**

```json
{
  "status": "NotImplemented"
}
```

## 8. Related Schemas

- Request: [`trigger-message-request.schema.json`](../../../schemas/mqtt/trigger-message-request.schema.json)
- Response: [`trigger-message-response.schema.json`](../../../schemas/mqtt/trigger-message-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1005, 2007, 6001)
