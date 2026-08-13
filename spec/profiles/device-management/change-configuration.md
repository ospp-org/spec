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
| `results[].errorCode` | integer | Cond. | OSPP error code. **Required** for the two causes §6 names — `5108` for a ReadOnly key (rule 4) and `5109` for an unparseable or out-of-range value (rule 6). SHOULD accompany any other `Rejected` or `NotSupported` entry ([`08-configuration.md`](../../08-configuration.md) §8.2). Absent otherwise. |
| `results[].errorText` | string | Cond. | Machine-readable error name in `UPPER_SNAKE_CASE`. Accompanies `errorCode` whenever that is present. |

## 5. Per-Key Status

Each entry is this station's **validation verdict for one key**. Whether the value is stored depends on the whole batch: rule 2 applies none of them if any entry is `Rejected` or `NotSupported`.

| Status | Description |
|---------------------|---------------------------------------------------------------|
| `Accepted` | The value passed validation for a Dynamic key. It takes effect immediately **provided no entry in this `results` array is `Rejected` or `NotSupported`**; otherwise it is discarded with the rest of the batch. |
| `RebootRequired` | The value passed validation for a Static key. It is persisted under the same proviso, and takes effect after a station reboot. The server **MAY** send a Reset command to apply the change. |
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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
  "payload": {
    "keys": [
      { "key": "OfflinePassPublicKey", "value": "BPkKbj...base64..." },
      { "key": "RevocationEpoch", "value": "-1" }
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
  "protocolVersion": "0.3.0",
  "payload": {
    "results": [
      { "key": "OfflinePassPublicKey", "status": "Accepted" },
      { "key": "RevocationEpoch", "status": "Rejected", "errorCode": 5109, "errorText": "INVALID_CONFIGURATION_VALUE" }
    ]
  }
}
```

**`OfflinePassPublicKey` was not applied.** Its entry reports that the value passed validation; the batch carried a `Rejected` entry, so rule 2 applies and the station stored nothing. A server rotating its OfflinePass signing key **MUST NOT** read this `Accepted` as evidence that the station holds the new key — see [Chapter 06 — Security](../../06-security.md) §6.7, whose rollout tracking depends on that distinction.

### 8.5 Request and Response (Static key — RebootRequired)

`RebootRequired` is the answer for a **Static** key (§5). `StationName` is Static; `HeartbeatIntervalSeconds` in §8.1 is Dynamic, which is why that exchange answers `Accepted`.

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-789a-56789012cdef",
  "messageType": "Request",
  "action": "ChangeConfiguration",
  "timestamp": "2026-02-13T10:23:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "keys": [
      { "key": "StationName", "value": "Bay Alpha - Downtown" }
    ]
  }
}
```

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-789a-56789012cdef",
  "messageType": "Response",
  "action": "ChangeConfiguration",
  "timestamp": "2026-02-13T10:23:00.180Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "results": [
      { "key": "StationName", "status": "RebootRequired" }
    ]
  }
}
```

## 9. Related Schemas

- Request: [`change-configuration-request.schema.json`](../../../schemas/mqtt/change-configuration-request.schema.json)
- Response: [`change-configuration-response.schema.json`](../../../schemas/mqtt/change-configuration-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1012, 2008, 3015, 5108, 5109)
