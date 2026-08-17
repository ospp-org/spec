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
| `Downloaded` | Download is complete, the SHA-256 checksum has been verified, and the ECDSA P-256 `signature` has been verified against the Firmware Signing Certificate ([Update Firmware §5](update-firmware.md) rule 4). |
| `Installing` | The firmware is being written to the inactive partition. |
| `Installed` | Installation is complete. The station will reboot into the new firmware. |
| `Failed` | The update failed at any stage. The `errorText` field provides details. |

## 5. Progress Reporting

The station **MUST** send a FirmwareStatusNotification at each status transition. In addition, the station **SHOULD** send intermediate progress updates:

1. **During `Downloading`:** The station **SHOULD** send a notification at every 10% increment of download progress (i.e., at progress values 10, 20, 30, ..., 90, 100), and **SHOULD** send one at least every 30 seconds — whichever falls sooner. The two are a rate and a floor, not alternatives: a fast download crosses 10% marks more often than every 30 seconds and the marks bind; a slow one goes minutes between marks and the floor binds. Without the floor a stalled multi-hour download is indistinguishable from a healthy one until §6 rule 3's five minutes elapse; without the marks a short download reports once and says nothing about its shape.
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
3. If the station does not send a FirmwareStatusNotification within 5 minutes of the last notification, the server **SHOULD** consider the update stalled and **MAY** re-issue the UpdateFirmware command or initiate a Reset. **The clock does not run while the station is legitimately waiting to install.** A verified image waits in the `Verified` state until every bay is idle and, if `scheduledAt` was given, until that time ([`05-state-machines.md` §7.4](../../05-state-machines.md)) — and `Verified` has no notification value, so a station doing exactly as instructed sends nothing for as long as the wait lasts. The server **MUST NOT** read that silence as a stall: it issued the `scheduledAt` itself and it holds the bay states the gate turns on. Measure the five minutes from the later of the last notification and the moment the gate opens.

   **And the clock does not run at all while the station is restricted — this is a suspension, not a second scoping.** A `Pending` station accepts UpdateFirmware and sends no FirmwareStatusNotification for the whole update ([`05-state-machines.md` §1.4](../../05-state-machines.md)), so **both** anchors of the sentence above are *absent* rather than late. There is no last notification to measure from, because none is ever sent. And the moment the gate opens cannot be located either: the server holds every bay of a restricted station at `Unknown` (§1.4), so the very thing the previous paragraph relies on — *"it holds the bay states the gate turns on"* — is what it does not have. A server that ran the timer anyway would fire on **every** such update, and the remedies this rule authorises are re-issuing UpdateFirmware or a Reset — a Reset during `Installing` is an interrupted partition write. The server therefore **MUST NOT** apply this rule to a restricted station, and its instrument is the one the restriction compels instead: BootNotification arrives at `retryInterval` and carries the running `firmwareVersion`, which is the update's outcome and not a proxy for it.
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
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Downloading",
    "firmwareVersion": "1.3.0",
    "progress": 45
  }
}
```

### 7.2 Downloaded (Checksum and Signature Verified)

```json
{
  "messageId": "msg_f7a8b9c0-d1e2-3456-0121-789012345ab1",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T10:28:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Failed",
    "firmwareVersion": "1.3.0",
    "errorText": "Download failed: connection timeout after 30s on https://firmware.example.com/v2.4.0.bin"
  }
}
```

## 8. Related Schemas

- Event: [`firmware-status-notification.schema.json`](../../../schemas/mqtt/firmware-status-notification.schema.json)
- Trigger: [UpdateFirmware](update-firmware.md)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5014--5018)
