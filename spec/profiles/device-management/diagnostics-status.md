# DiagnosticsNotification

> **Status:** Draft

Station reports diagnostics collection and upload progress at each stage of the lifecycle.

## 1. Overview

DiagnosticsStatusNotification (action: `DiagnosticsNotification`) is a station-initiated event that reports the progress of a diagnostics upload initiated by GetDiagnostics. The server uses these notifications to track whether the diagnostics archive was successfully collected and uploaded.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT (no response expected)

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | Current diagnostics status (see section 4). |
| `progress` | integer | No | Upload progress percentage (0--100). |
| `fileName` | string | No | Name of the diagnostics archive file. |
| `errorText` | string | No | Human-readable error description (present when `status` is `Failed`). |

## 4. Status Values

| Status | Description |
|---------------|---------------------------------------------------------------|
| `Collecting` | The station is gathering diagnostic data into an archive. |
| `Uploading` | The diagnostics archive is being uploaded to the remote URL. |
| `Uploaded` | Upload completed successfully. |
| `Failed` | Collection or upload failed. The `errorText` field provides details. |

## 5. Processing Rules

1. The station **MUST** send a DiagnosticsNotification at each status transition.
2. The server **MUST NOT** send a response to DiagnosticsNotification events (fire-and-forget).
3. During `Uploading`, the station **SHOULD** send progress updates at every 10% increment.
4. The `progress` field is only meaningful during the `Uploading` status. It **MUST** be omitted for `Collecting`, `Uploaded`, and `Failed`.
5. On transition to `Failed`, the station **MUST** include a descriptive `errorText`.
6. If the station does not send a DiagnosticsNotification within 5 minutes of the last notification, the server **SHOULD** consider the operation stalled and **MAY** re-issue the GetDiagnostics command.

### 5.1 Expected State Transition Sequence

The normal (success) sequence is:

```
Collecting -> Uploading (0%) -> Uploading (10%) -> ... -> Uploading (100%) -> Uploaded
```

On failure:

```
Collecting -> Failed (errorText: "Insufficient disk space for archive")
```

or:

```
Uploading (60%) -> Failed (errorText: "HTTP PUT returned 503 Service Unavailable")
```

## 6. Examples

### 6.1 Uploading (In Progress)

```json
{
  "messageId": "msg_b9c0d1e2-f3a4-5678-89a0-901234567ab0",
  "messageType": "Event",
  "action": "DiagnosticsNotification",
  "timestamp": "2026-02-13T10:27:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Uploading",
    "progress": 60,
    "fileName": "diag_stn_a1b2c3d4_20260212_20260213.tar.gz"
  }
}
```

### 6.2 Uploaded (Success)

```json
{
  "messageId": "msg_b9c0d1e2-f3a4-5678-89a1-901234567ab1",
  "messageType": "Event",
  "action": "DiagnosticsNotification",
  "timestamp": "2026-02-13T10:29:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Uploaded",
    "fileName": "diag_stn_a1b2c3d4_20260212_20260213.tar.gz"
  }
}
```

### 6.3 Failed (Upload Error)

```json
{
  "messageId": "msg_b9c0d1e2-f3a4-5678-89a2-901234567ab2",
  "messageType": "Event",
  "action": "DiagnosticsNotification",
  "timestamp": "2026-02-13T10:28:30.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Failed",
    "fileName": "diag_stn_a1b2c3d4_20260212_20260213.tar.gz",
    "errorText": "HTTP PUT returned 503 Service Unavailable after 3 retries"
  }
}
```

## 7. Related Schemas

- Event: [`diagnostics-notification.schema.json`](../../../schemas/mqtt/diagnostics-notification.schema.json)
- Trigger: [GetDiagnostics](get-diagnostics.md)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5019--5021)
