# DiagnosticsNotification

> **Status:** Draft

Station reports diagnostics collection and upload progress at each stage of the lifecycle.

## 1. Overview

DiagnosticsNotification is a station-initiated event that reports the progress of a diagnostics upload initiated by GetDiagnostics. The server uses these notifications to track whether the diagnostics archive was successfully collected and uploaded.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT (no response expected)

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | Current diagnostics status (see section 4). |
| `progress` | integer | Cond. | Upload progress percentage (0--100). Permitted **only** when `status` is `Uploading`; **MUST** be absent for every other status (rule 4). |
| `fileName` | string | No | Name of the diagnostics archive file. Permitted on **any** status: the station knows the name from the moment it answers `Accepted`, and it is as useful on a failure as on a success. |
| `errorText` | string | Cond. | Human-readable error description. **REQUIRED** when `status` is `Failed` (rule 5); **MUST** be absent for every other status. |

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
4. The `progress` field is only meaningful during the `Uploading` status. It **MUST** be omitted for `Collecting`, `Uploaded`, and `Failed`. This is enforced by [`diagnostics-notification.schema.json`](../../../schemas/mqtt/diagnostics-notification.schema.json), not left to prose: a rule stated only here is a rule a validator cannot apply, and a payload carrying `progress` on `Collecting` validated clean for as long as that was the arrangement.
5. On transition to `Failed`, the station **MUST** include a descriptive `errorText`, and it **MUST NOT** carry `errorText` on any other status. The second half is the one that was missing: without it the field is a free-text slot on a success, and the server column it lands in ends up holding three different registers of text at once. Both halves are enforced by the schema.
6. If the station does not send a DiagnosticsNotification within 5 minutes of the last notification, the server **SHOULD** consider the operation stalled and **MAY** re-issue the GetDiagnostics command. **The clock does not run while the station is restricted.** A `Pending` station is answered `Accepted` for GetDiagnostics [MSG-018] and the events that would report its progress are suppressed ([`05-state-machines.md` §1.4](../../05-state-machines.md)), so there is no last notification to measure from and this rule would fire on every such upload. The server **MUST NOT** apply it to a restricted station. There is no later message that carries the result here, and none is needed: the archive is an HTTP PUT to a URL the command supplied, so the upload either lands there or it does not, and that is where the server looks. Stated in `0.21.0` alongside the same defect in the firmware twin ([`firmware-status.md` §6](firmware-status.md) rule 3), though here it has been live since GetDiagnostics was first answered `Accepted` while restricted.

### 5.1 Expected State Transition Sequence

The machine is [`05-state-machines.md` §8](../../05-state-machines.md#8-diagnostics-upload-state-machine)
— five states and seven edges, with the notification value of each state in
[§8.4](../../05-state-machines.md#84-diagnosticsnotification-mapping). That table is canonical and is
not restated here. Until `0.23.0` there was no such table and this section carried arrows instead;
two SDKs each built a machine from them and the two disagreed on three edges, both suites green.

The sequences below are illustrations of it, not a second definition. The normal (success) sequence
is:

```
Collecting -> Uploading (0%) -> Uploading (10%) -> ... -> Uploading (100%) -> Uploaded
```

The repeated `Uploading` entries are one state re-reporting itself, not transitions
([§8.4](../../05-state-machines.md#84-diagnosticsnotification-mapping)).

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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Failed",
    "fileName": "diag_stn_a1b2c3d4_20260212_20260213.tar.gz",
    "errorText": "HTTP PUT returned 503 Service Unavailable after 3 retries"
  }
}
```

## 7. Related Schemas

- Event: [`diagnostics-notification.schema.json`](../../../schemas/mqtt/diagnostics-notification.schema.json)
- State machine: [`05-state-machines.md` §8](../../05-state-machines.md#8-diagnostics-upload-state-machine)
- Trigger: [GetDiagnostics](get-diagnostics.md)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5019--5021)
