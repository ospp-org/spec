# GetDiagnostics

> **Status:** Draft

Request the station to collect and upload diagnostic data to a remote URL for troubleshooting.

## 1. Overview

GetDiagnostics is a server-initiated command that requests the station to collect and upload diagnostic data to a specified URL. This enables remote troubleshooting without physical station access. The station collects logs, configuration state, hardware status, and session history, packages them into a compressed archive, and uploads it via HTTP PUT to the provided URL. Progress is reported via DiagnosticsNotification events. Default upload URL is configurable via `DiagnosticsUploadUrl` (see §8 Configuration).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------------|--------|----------|-----------------------------------------------|
| `uploadUrl` | string | Yes | HTTPS URL for diagnostics upload (HTTP PUT). |
| `startTime` | string | No | ISO 8601 UTC start of the diagnostic time window. |
| `endTime` | string | No | ISO 8601 UTC end of the diagnostic time window. |

If `startTime` and `endTime` are omitted, the station **MUST** include all available diagnostic data. If only `startTime` is provided, the station **MUST** include data from `startTime` to the current time. If both are provided, the station **MUST** include data within the specified window.

## 4. Response Payload

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `fileName` | string | No | Name of the diagnostics file being prepared (present when `Accepted`). |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Upload Format

The diagnostics archive **MUST** be a gzip-compressed tar file (`.tar.gz`) and **MUST** follow this naming convention:

```
diag_{station_id}_{startDate}_{endDate}.tar.gz
```

For example: `diag_stn_a1b2c3d4_20260212_20260213.tar.gz`

The archive **MUST** contain the following files where available:

| File | Description |
|-------------------------------|-----------------------------------------------|
| `logs/system.log` | System log entries for the requested time window. |
| `logs/mqtt.log` | MQTT message log (sent/received actions, timestamps, messageIds). |
| `config/current.json` | Complete configuration dump at the time of collection. |
| `hardware/status.json` | Hardware component status (pump, valves, sensors, BLE module). |
| `sessions/history.json` | Session records for the requested time window. |
| `network/connectivity.json` | Network connectivity statistics and error counts. |

The station **MUST** upload the archive via HTTP PUT to the provided `uploadUrl`. The `Content-Type` header **MUST** be set to `application/gzip`.

## 6. Processing Rules

1. The station **MUST** validate the `uploadUrl` before responding. If the URL is unreachable or malformed, the station **MUST** respond with `Rejected`.
2. On `Accepted`, the station **MUST** begin collecting diagnostics and send DiagnosticsNotification events to report progress.
3. If `startTime` is after `endTime`, the station **MUST** respond with `Rejected` and error code `5020 INVALID_TIME_WINDOW`.
4. The station **MUST NOT** interrupt active sessions to collect diagnostics.
5. The response `messageId` **MUST** match the request `messageId`.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `1011` | `URL_UNREACHABLE` | Error | The upload URL is not reachable. |
| `5019` | `UPLOAD_FAILED` | Error | The diagnostics archive could not be uploaded to the provided URL. |
| `5020` | `INVALID_TIME_WINDOW` | Warning | The `startTime` is after `endTime`, or the time window is otherwise invalid. |
| `5021` | `NO_DIAGNOSTICS_AVAILABLE` | Warning | No diagnostic data is available for the requested time window. |
| `5103` | `STORAGE_ERROR` | Error | Insufficient or inaccessible storage for diagnostic data collection. |
| `5107` | `OPERATION_IN_PROGRESS` | Warning | Another diagnostics collection or operation is already in progress. |

## 8. Examples

### 8.1 Request

```json
{
  "messageId": "msg_a8b9c0d1-e2f3-4567-4567-890123456abc",
  "messageType": "Request",
  "action": "GetDiagnostics",
  "timestamp": "2026-02-13T10:26:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "uploadUrl": "https://diagnostics.example.com/upload/stn_a1b2c3d4",
    "startTime": "2026-02-12T00:00:00.000Z",
    "endTime": "2026-02-13T10:26:00.000Z"
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_a8b9c0d1-e2f3-4567-4567-890123456abc",
  "messageType": "Response",
  "action": "GetDiagnostics",
  "timestamp": "2026-02-13T10:26:00.300Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted",
    "fileName": "diag_stn_a1b2c3d4_20260212_20260213.tar.gz"
  }
}
```

### 8.3 Response (Rejected -- Invalid Time Window)

```json
{
  "messageId": "msg_a8b9c0d1-e2f3-4567-4567-890123456abc",
  "messageType": "Response",
  "action": "GetDiagnostics",
  "timestamp": "2026-02-13T10:26:00.300Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 5020,
    "errorText": "INVALID_TIME_WINDOW"
  }
}
```

## 9. Related Schemas

- Request: [`get-diagnostics-request.schema.json`](../../../schemas/mqtt/get-diagnostics-request.schema.json)
- Response: [`get-diagnostics-response.schema.json`](../../../schemas/mqtt/get-diagnostics-response.schema.json)
- DiagnosticsNotification: [`diagnostics-notification.schema.json`](../../../schemas/mqtt/diagnostics-notification.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5019--5021)
