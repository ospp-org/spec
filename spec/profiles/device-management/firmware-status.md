# FirmwareStatusNotification

> **Status:** Draft

Station reports firmware update progress at each stage of the download, verification, and installation lifecycle.

## 1. Overview

FirmwareStatusNotification is a station-initiated event that reports the progress of a firmware update initiated by UpdateFirmware. The server uses these notifications to track update status across the fleet and to detect stalled or failed updates.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT (no response expected)

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | Current firmware update status (see section 4). |
| `firmwareVersion` | string | Yes | Target firmware version being installed (semver format). |
| `progress` | integer | No | Download or install progress percentage (0--100). |
| `errorText` | string | No | Human-readable error description (present when `status` is `Failed`). |

## 4. Status Values

| Status | Description |
|----------------|---------------------------------------------------------------|
| `Downloading` | The firmware binary is being downloaded from the remote URL. |
| `Downloaded` | Download is complete and the SHA-256 checksum has been verified. |
| `Installing` | The firmware is being written to the inactive partition. |
| `Installed` | Installation is complete. The station will reboot into the new firmware. |
| `Failed` | The update failed at any stage. The `errorText` field provides details. |

## 5. Progress Reporting

The station **MUST** send a FirmwareStatusNotification at each status transition. In addition, the station **SHOULD** send intermediate progress updates:

1. **During `Downloading`:** The station **SHOULD** send a notification at every 10% increment of download progress (i.e., at progress values 10, 20, 30, ..., 90, 100).
2. **During `Installing`:** The station **SHOULD** send a notification at key milestones (25%, 50%, 75%, 100%).
3. The `progress` field **MUST** be omitted or set to `0` when the status is `Downloaded`, `Installed`, or `Failed`.
4. On transition to `Failed`, the station **MUST** include a descriptive `errorText`.

### 5.1 Expected State Transition Sequence

The normal (success) sequence is:

```
Downloading (0%) -> Downloading (10%) -> ... -> Downloading (100%)
  -> Downloaded
  -> Installing (0%) -> Installing (25%) -> ... -> Installing (100%)
  -> Installed
```

On failure at any stage:

```
Downloading (45%) -> Failed (errorText: "Connection timeout")
```

or:

```
Downloaded -> Installing (50%) -> Failed (errorText: "Write error on partition B")
```

## 6. Processing Rules

1. The station **MUST** send at least one FirmwareStatusNotification per status transition.
2. The server **MUST NOT** send a response to FirmwareStatusNotification events (fire-and-forget).
3. If the station does not send a FirmwareStatusNotification within 5 minutes of the last notification, the server **SHOULD** consider the update stalled and **MAY** re-issue the UpdateFirmware command or initiate a Reset.
4. After `Installed`, the station reboots. The next message from the station **MUST** be a BootNotification with the new `firmwareVersion`.

## 7. Examples

### 7.1 Downloading (In Progress)

```json
{
  "messageId": "msg_f7a8b9c0-d1e2-3456-0120-789012345ab0",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T10:25:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Downloading",
    "firmwareVersion": "1.3.0",
    "progress": 45
  }
}
```

### 7.2 Downloaded (Checksum Verified)

```json
{
  "messageId": "msg_f7a8b9c0-d1e2-3456-0121-789012345ab1",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T10:28:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Downloaded",
    "firmwareVersion": "1.3.0"
  }
}
```

### 7.3 Installed (Ready to Reboot)

```json
{
  "messageId": "msg_f7a8b9c0-d1e2-3456-0122-789012345ab2",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T10:35:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Installed",
    "firmwareVersion": "1.3.0"
  }
}
```

### 7.4 Failed (Download Error)

```json
{
  "messageId": "msg_f7a8b9c0-d1e2-3456-0123-789012345ab3",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T10:26:30.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Failed",
    "firmwareVersion": "1.3.0",
    "errorText": "Download failed: connection timeout after 3 retries"
  }
}
```

## 8. Related Schemas

- Event: [`firmware-status-notification.schema.json`](../../../schemas/mqtt/firmware-status-notification.schema.json)
- Trigger: [UpdateFirmware](update-firmware.md)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5014--5018)
