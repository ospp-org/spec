# GetConfiguration

> **Status:** Draft

Read one or more configuration keys from the station. If no keys are specified, the station returns all known configuration entries except WriteOnly keys, which are never returned.

## 1. Overview

GetConfiguration is a server-initiated command that reads one or more configuration keys from the station. If the `keys` array is empty or absent, the station **MUST** return all known configuration entries **except WriteOnly keys** ([Chapter 08 — Configuration](../../08-configuration.md), §1.3 and §8.1). This enables operators to audit station configuration remotely without physical access.

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------|----------|----------|-----------------------------------------------|
| `keys` | string[] | No | Specific configuration keys to read. If empty or absent, the station **MUST** return all known keys except WriteOnly keys. |

## 4. Response Payload

| Field | Type | Required | Description |
|----------------|----------|----------|-----------------------------------------------|
| `configuration` | object[] | Yes | Array of configuration entries (see below). |
| `unknownKeys` | string[] | No | Keys from the request that the station does not recognize. |

### 4.1 Configuration Entry Object

| Field | Type | Required | Description |
|------------|---------|----------|-----------------------------------------------|
| `key` | string | Yes | Configuration key name (non-empty). |
| `value` | string | Yes | Current value as a string. |
| `readonly` | boolean | Yes | `true` if the key cannot be changed via ChangeConfiguration. |

## 5. Processing Rules

1. The station **MUST** respond with all requested keys that it recognizes, each accompanied by the current value and read-only flag — except WriteOnly keys, which are governed by §5.1.
2. If `keys` is absent or an empty array, the station **MUST** return every configuration entry it supports **except WriteOnly keys** (§5.1).
3. Keys that the station does not recognize **MUST** be placed in the `unknownKeys` array rather than causing an error response.
4. The station **MUST NOT** return duplicate keys in the `configuration` array.
5. The response `messageId` **MUST** match the request `messageId`.

### 5.1 WriteOnly Keys Are Never Returned

A WriteOnly key's entry **MUST NOT** appear in the `configuration` array of any GetConfiguration RESPONSE. This holds however the key was reached — whether the request named it explicitly or asked for everything by sending an empty or absent `keys` array. The rule and its rationale are normative in [Chapter 08 — Configuration](../../08-configuration.md), §1.3: WriteOnly keys are security credentials, and a configuration dump that carries them is a credential dump. `OfflinePassPublicKey` is currently the only WriteOnly key in the registry.

Rules 1 and 2 are subordinate to this one. Neither "all requested keys that it recognizes" nor "every configuration entry it supports" reaches a WriteOnly key.

> **What a request that explicitly names a WriteOnly key should report is not yet specified.** The value must not be returned, but this specification does not say whether the station omits the key silently, lists it in `unknownKeys` — which would be untrue, since the key *is* recognized — or answers an error. [Chapter 08](../../08-configuration.md) §8.1 rule 2 is silent on the same point. Until it is settled, a server **MUST NOT** depend on any particular reporting behaviour for a by-name request.

## 6. Unknown Keys Handling

When the request contains keys that the station does not recognize, the station **MUST** include them in the `unknownKeys` array. The presence of unknown keys **MUST NOT** cause the entire request to fail -- recognized keys **MUST** still be returned in the `configuration` array alongside the `unknownKeys` list.

If all requested keys are unknown, the station **MUST** respond with an empty `configuration` array and a populated `unknownKeys` array. This is not considered an error condition.

## 7. Error Handling

This message uses implicit error codes only (1005, 2007, 6001 — see `spec/03-messages.md` §Introduction).

## 8. Examples

### 8.1 Request (Specific Keys)

```json
{
  "messageId": "msg_c4d5e6f7-a8b9-0123-9abc-456789012abc",
  "messageType": "Request",
  "action": "GetConfiguration",
  "timestamp": "2026-02-13T10:22:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "keys": [
      "HeartbeatIntervalSeconds",
      "OfflineModeEnabled",
      "FirmwareVersion"
    ]
  }
}
```

### 8.2 Response (Specific Keys)

```json
{
  "messageId": "msg_c4d5e6f7-a8b9-0123-9abc-456789012abc",
  "messageType": "Response",
  "action": "GetConfiguration",
  "timestamp": "2026-02-13T10:22:00.200Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "configuration": [
      {
        "key": "HeartbeatIntervalSeconds",
        "value": "60",
        "readonly": false
      },
      {
        "key": "OfflineModeEnabled",
        "value": "true",
        "readonly": false
      },
      {
        "key": "FirmwareVersion",
        "value": "1.2.3",
        "readonly": true
      }
    ],
    "unknownKeys": []
  }
}
```

### 8.3 Request (All Keys)

```json
{
  "messageId": "msg_a1b2c3d4-e5f6-7890-abcd-111222333aaa",
  "messageType": "Request",
  "action": "GetConfiguration",
  "timestamp": "2026-02-13T10:30:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {}
}
```

## 9. Related Schemas

- Request: [`get-configuration-request.schema.json`](../../../schemas/mqtt/get-configuration-request.schema.json)
- Response: [`get-configuration-response.schema.json`](../../../schemas/mqtt/get-configuration-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1005, 2007, 6001)
