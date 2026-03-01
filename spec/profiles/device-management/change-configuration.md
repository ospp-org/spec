# ChangeConfiguration

> **Status:** Draft

Set one or more configuration keys on the station atomically. The station responds with per-key status indicating whether each change was applied, requires a reboot, or was rejected. If any key is rejected or unsupported, no changes are applied.

## 1. Overview

ChangeConfiguration is a server-initiated command that sets one or more configuration keys on the station in a single atomic operation. The station validates each key and value, and applies all changes only if every key passes validation. The response contains per-key status for diagnostics.

Single-key requests (array of 1) are the common case. The array format enables atomic multi-key updates for correlated settings (e.g., `OfflinePassPublicKey` + `RevocationEpoch`). Maximum 20 keys per request.

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|---------|--------|----------|-----------------------------------------------|
| `keys` | array | Yes | Array of key-value pairs (minItems: 1, maxItems: 20). |
| `keys[].key` | string | Yes | Configuration key name (non-empty). |
| `keys[].value` | string | Yes | New value as a string. The station parses it to the appropriate type. |

## 4. Response Payload

| Field | Type | Required | Description |
|---------|--------|----------|-----------------------------------------------|
| `results` | array | Yes | Per-key results in the same order as the request `keys` array. |
| `results[].key` | string | Yes | Configuration key name (echoed from request). |
| `results[].status` | string | Yes | One of: `Accepted`, `RebootRequired`, `Rejected`, `NotSupported`. |
| `results[].errorCode` | integer | No | OSPP error code (present when `status` is `Rejected` or `NotSupported`). |
| `results[].errorText` | string | No | Machine-readable error name (present when `status` is `Rejected` or `NotSupported`). |

## 5. Per-Key Status

| Status | Description |
|---------------------|---------------------------------------------------------------|
| `Accepted` | The key was set successfully and is effective immediately. |
| `RebootRequired` | The key was set successfully but requires a station reboot to take effect. The server **MAY** send a Reset command to apply the change. |
| `Rejected` | The key is read-only, the value is invalid, or the station cannot apply the change. The `errorCode` and `errorText` fields provide details. |
| `NotSupported` | The key is not recognized by the station. |

## 6. Processing Rules

1. The station **MUST** validate ALL keys in the `keys` array before applying any changes.
2. If ANY key would result in `Rejected` or `NotSupported`, the station **MUST NOT** apply any changes from the batch (atomic all-or-nothing semantics).
3. The response `results` array **MUST** contain one entry per request key, in the same order, so the server can identify which key(s) caused the failure.
4. If a key is read-only, the station **MUST** report `Rejected` with error code `5108 CONFIGURATION_KEY_READONLY` for that key.
5. If a key is unknown, the station **MUST** report `NotSupported` for that key.
6. If a value cannot be parsed to the expected type or is outside the acceptable range, the station **MUST** report `Rejected` with error code `5109 INVALID_CONFIGURATION_VALUE` for that key.
7. When any key returns `RebootRequired`, the station **MUST** persist all values so they take effect on the next boot (provided the entire batch passes validation).
8. The response `messageId` **MUST** match the request `messageId`.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `1012` | `MAC_VERIFICATION_FAILED` | Critical | HMAC-SHA256 verification failed on the received message. |
| `2008` | `ACTION_NOT_PERMITTED` | Error | The authenticated entity does not have the required permissions for this action. |
| `3015` | `PAYLOAD_INVALID` | Error | The key or value is semantically invalid. |
| `5108` | `CONFIGURATION_KEY_READONLY` | Error | Attempted to change a read-only configuration key. |
| `5109` | `INVALID_CONFIGURATION_VALUE` | Error | The provided value is not valid for this key (wrong type, out of range). |

## 8. Examples

### 8.1 Request (single key)

```json
{
  "messageId": "msg_b3c4d5e6-f7a8-9012-5678-345678901abc",
  "messageType": "Request",
  "action": "ChangeConfiguration",
  "timestamp": "2026-02-13T10:21:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "keys": [
      { "key": "HeartbeatIntervalSeconds", "value": "60" }
    ]
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_b3c4d5e6-f7a8-9012-5678-345678901abc",
  "messageType": "Response",
  "action": "ChangeConfiguration",
  "timestamp": "2026-02-13T10:21:00.180Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "results": [
      { "key": "HeartbeatIntervalSeconds", "status": "Accepted" }
    ]
  }
}
```

### 8.3 Request (atomic multi-key — correlated settings)

```json
{
  "messageId": "msg_c4d5e6f7-a8b9-0123-6789-456789012bcd",
  "messageType": "Request",
  "action": "ChangeConfiguration",
  "timestamp": "2026-02-13T10:22:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "keys": [
      { "key": "OfflinePassPublicKey", "value": "BPkKbj...base64..." },
      { "key": "RevocationEpoch", "value": "5" }
    ]
  }
}
```

### 8.4 Response (one rejected — no changes applied)

```json
{
  "messageId": "msg_c4d5e6f7-a8b9-0123-6789-456789012bcd",
  "messageType": "Response",
  "action": "ChangeConfiguration",
  "timestamp": "2026-02-13T10:22:00.180Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "results": [
      { "key": "OfflinePassPublicKey", "status": "Accepted" },
      { "key": "FirmwareVersion", "status": "Rejected", "errorCode": 5108, "errorText": "CONFIGURATION_KEY_READONLY" }
    ]
  }
}
```

### 8.5 Response (RebootRequired)

```json
{
  "messageId": "msg_b3c4d5e6-f7a8-9012-5678-345678901abc",
  "messageType": "Response",
  "action": "ChangeConfiguration",
  "timestamp": "2026-02-13T10:21:00.180Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "results": [
      { "key": "HeartbeatIntervalSeconds", "status": "RebootRequired" }
    ]
  }
}
```

## 9. Related Schemas

- Request: [`change-configuration-request.schema.json`](../../../schemas/mqtt/change-configuration-request.schema.json)
- Response: [`change-configuration-response.schema.json`](../../../schemas/mqtt/change-configuration-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5108, 5109)
