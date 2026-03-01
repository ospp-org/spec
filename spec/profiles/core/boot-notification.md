# BootNotification

> **Status:** Draft

## 1. Overview

BootNotification is the first message a station sends after establishing an MQTT connection. It announces the station identity, firmware version, hardware capabilities, and network information. The server responds with an acceptance status, a heartbeat interval, the current server time for clock synchronization, and optionally a session key and configuration parameters.

The station **MUST NOT** process any incoming commands until it receives an `Accepted` response. If the response is `Rejected` or `Pending`, the station **MUST** retry according to the retry policy defined in section 5.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------------------------------|----------|----------|-----------------------------------------------|
| `stationId` | string | Yes | Unique station identifier (`stn_` prefix). |
| `firmwareVersion` | string | Yes | Semantic version of the station firmware (e.g., `1.2.3`). |
| `stationModel` | string | Yes | Model identifier of the station hardware. |
| `stationVendor` | string | Yes | Name of the station manufacturer. |
| `serialNumber` | string | Yes | Unique serial number of the station unit. |
| `bayCount` | integer | Yes | Number of service bays available (minimum 1). |
| `uptimeSeconds` | integer | Yes | Seconds elapsed since the station last booted. |
| `pendingOfflineTransactions` | integer | Yes | Number of offline transactions queued for sync. |
| `timezone` | string | Yes | IANA timezone identifier (e.g., `Europe/London`). |
| `bootReason` | string | Yes | Reason the station booted. One of: `PowerOn`, `Watchdog`, `FirmwareUpdate`, `ManualReset`, `ScheduledReset`, `ErrorRecovery`. |
| `capabilities` | object | Yes | Feature flags (see below). |
| `networkInfo` | object | Yes | Current network connection details (see below). |

### 3.1 Capabilities Object

| Field | Type | Required | Description |
|-------------------------|---------|----------|-----------------------------------------------|
| `bleSupported` | boolean | Yes | Whether the station supports BLE communication. |
| `offlineModeSupported` | boolean | Yes | Whether the station supports offline session authorization. |
| `meterValuesSupported` | boolean | Yes | Whether the station supports reporting meter values. |
| `deviceManagementSupported` | boolean | No | Whether the station supports the Device Management profile. |

### 3.2 NetworkInfo Object

| Field | Type | Required | Description |
|-------------------|---------------|----------|-----------------------------------------------|
| `connectionType` | string | Yes | One of: `Ethernet`, `Wifi`, `Cellular`. |
| `signalStrength` | integer\|null | No | Signal strength in dBm, or `null` if not applicable. |

## 4. Response Payload

| Field | Type | Required | Description |
|-----------------------|----------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted`, `Rejected`, or `Pending`. |
| `serverTime` | string | Yes | ISO 8601 UTC server timestamp for clock sync. |
| `heartbeatIntervalSec` | integer | Yes | Heartbeat interval in seconds (10--3600). |
| `retryInterval` | integer | Cond. | Seconds to wait before retrying. Required when `status` is `Rejected` or `Pending`. |
| `configuration` | object | No | Key-value configuration pairs pushed to the station. |
| `sessionKey` | string | Cond. | Base64-encoded 32-byte HMAC session key for message authentication. Required when `MessageSigningMode` is `"Critical"` or `"All"`. |

## 5. Processing Rules

1. The station **MUST** send a BootNotification as the first message after every MQTT connection (including reconnections).
2. The station **MUST NOT** send any other messages before receiving a BootNotification response.
3. On `Accepted`: the station **MUST** store the `heartbeatIntervalSec`, apply any `configuration` values, store the `sessionKey` (if present), synchronize its internal clock to `serverTime`, and transition to normal operation.
4. On `Rejected`: the station **MUST** wait `retryInterval` seconds (default 30s) and retry the BootNotification. The station **MUST NOT** accept any commands while in `Rejected` state. Retries are unlimited.
5. On `Pending`: the station **MUST** wait `retryInterval` seconds (default 30s) and retry. The station **MAY** operate normally but **SHOULD** expect configuration updates.
6. If no response is received within 30 seconds, the station **MUST** log error `1010 MESSAGE_TIMEOUT`, wait 60 seconds, and retry indefinitely.
7. After a successful `Accepted` response, the station **MUST** send a StatusNotification for each bay to report current bay states.
8. If `pendingOfflineTransactions` > 0, the server **SHOULD** schedule offline transaction synchronization after acceptance.

## 6. Error Handling

| Condition | Error Code | Behaviour |
|-------------------------------------|---------------------|-----------------------------------------------|
| Station ID not recognized by server | `2001 STATION_NOT_REGISTERED` | Server responds with `Rejected`. Station **SHOULD** enter provisioning mode. |
| Invalid message format | `1005 INVALID_MESSAGE_FORMAT` | Server drops the message. Station does not receive a response and retries after timeout. |
| Protocol version mismatch | `1007 PROTOCOL_VERSION_MISMATCH` | Server responds with `Rejected`. Station **MUST** await firmware update. |
| Server internal error | `6001 SERVER_INTERNAL_ERROR` | Server responds with `Rejected` and `retryInterval`. Station retries. |

## 7. Examples

### 7.1 Request

```json
{
  "messageId": "msg_b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "Request",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:00:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4e5f6",
    "firmwareVersion": "1.2.3",
    "stationModel": "SSP-3000",
    "stationVendor": "AcmeCorp",
    "serialNumber": "ACME-SSP-20250187",
    "bayCount": 3,
    "uptimeSeconds": 42,
    "pendingOfflineTransactions": 2,
    "timezone": "Europe/London",
    "bootReason": "PowerOn",
    "capabilities": {
      "bleSupported": true,
      "offlineModeSupported": true,
      "meterValuesSupported": true,
      "deviceManagementSupported": true
    },
    "networkInfo": {
      "connectionType": "Ethernet",
      "signalStrength": null
    }
  }
}
```

### 7.2 Response (Accepted)

```json
{
  "messageId": "msg_b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "Response",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:00:00.250Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted",
    "serverTime": "2026-02-13T10:00:00.250Z",
    "heartbeatIntervalSec": 30,
    "configuration": {
      "RevocationEpoch": "42",
      "MaxSessionDurationSeconds": "600",
      "BLEAdvertisingEnabled": "true",
      "MeterValuesInterval": "15"
    },
    "sessionKey": "dGFwbHktc2Vzc2lvbi1rZXktMjAyNi0wMi0xM1QxMDowMDowMC4wMDBa"
  }
}
```

## 8. Related Schemas

- Request: [`boot-notification-request.schema.json`](../../../schemas/mqtt/boot-notification-request.schema.json)
- Response: [`boot-notification-response.schema.json`](../../../schemas/mqtt/boot-notification-response.schema.json)
- Station ID: [`station-id.schema.json`](../../../schemas/common/station-id.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2001, 1005, 1007, 6001)
