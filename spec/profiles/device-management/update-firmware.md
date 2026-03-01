# UpdateFirmware

> **Status:** Draft

Initiate an OTA firmware update on the station. The station downloads, verifies, and installs the firmware using an A/B partition strategy with automatic rollback on failure.

## 1. Overview

UpdateFirmware is a server-initiated command that instructs the station to download and install a new firmware version from a remote URL. The station uses an A/B partition strategy to ensure safe updates with rollback capability. The update **MAY** be scheduled for a future time. Progress is reported via FirmwareStatusNotification events. Firmware updates can be disabled via `FirmwareUpdateEnabled` (see §8 Configuration).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------------------|--------|----------|-----------------------------------------------|
| `firmwareUrl` | string | Yes | HTTPS URL to download the firmware binary. |
| `firmwareVersion` | string | Yes | Target firmware version in semver format (e.g., `1.3.0`). |
| `checksum` | string | Yes | SHA-256 hex digest prefixed with `sha256:` (e.g., `sha256:a3f2...`). |
| `signature` | string | Yes | Base64-encoded ECDSA P-256 signature of the firmware image (see [Chapter 06 — Security](../../06-security.md), §4.6). |
| `forceDowngrade` | boolean | No | When `true`, override anti-downgrade protection and allow installing an older firmware version (default: `false`). See [Chapter 06 — Security](../../06-security.md), §4.6. |
| `scheduledAt` | string | No | ISO 8601 UTC timestamp to begin the update. If omitted, the station **MUST** begin immediately. |

## 4. Response Payload

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Processing Rules

1. The station **MUST** validate the request fields before responding. If the request is valid, the station **MUST** respond with `Accepted` and begin the download at the scheduled time (or immediately).
2. The station **MUST** send a FirmwareStatusNotification at each stage transition (see section 6).
3. The station **MUST** verify the downloaded binary against the provided `checksum` before proceeding to installation. If verification fails, the station **MUST** send a FirmwareStatusNotification with `Failed` status.
4. If `scheduledAt` is in the past, the station **MUST** begin the update immediately.
5. If the station is already running the requested `firmwareVersion`, it **MUST** respond with `Rejected` and error code `5016 VERSION_ALREADY_INSTALLED`.
6. The station **MUST NOT** begin installation while active sessions are in progress. It **MUST** wait for sessions to complete or time out before installing.
7. The response `messageId` **MUST** match the request `messageId`.

## 6. Download and Install Flow

The firmware update proceeds through the following stages. The station **MUST** send a FirmwareStatusNotification at each transition:

1. **Accepted** -- The station acknowledges the request and schedules the download.
2. **Downloading** -- The station begins downloading the firmware binary from `firmwareUrl`. Progress updates **SHOULD** be sent at every 10% increment.
3. **Downloaded** -- Download is complete and the SHA-256 checksum has been verified successfully.
4. **Installing** -- The firmware is being written to the inactive partition. The station **SHOULD** report progress at key milestones (25%, 50%, 75%, 100%).
5. **Installed** -- Installation is complete. The station reboots into the new partition and sends a BootNotification with the new `firmwareVersion`.

If any stage fails, the station **MUST** send a FirmwareStatusNotification with `Failed` status and a descriptive `errorText`.

## 7. A/B Partition Strategy

The station **MUST** maintain two firmware partitions:

- **Active partition (A):** Runs the current firmware.
- **Inactive partition (B):** Receives the new firmware during an update.

On successful installation, the station marks partition B as the boot target and reboots. After a successful boot with health check validation, partition B becomes the new active partition. The previous partition A is retained as a rollback target.

## 8. Rollback

Automatic rollback to the previous partition **MUST** occur under any of the following conditions:

1. **Boot failure:** The station fails to boot from the new partition within 60 seconds.
2. **Health check failure:** The station boots but fails its self-diagnostic health check within 120 seconds of boot.
3. **Manual trigger:** The server sends a Reset command with `type: "Hard"` to force rollback to the previous known-good firmware.

After a rollback, the station **MUST** send a BootNotification with the previous (rolled-back) firmware version and a `bootReason` of `"ErrorRecovery"`.

If the watchdog timer expires and automatic rollback fails (e.g., both firmware partitions are corrupted), the station enters an unrecoverable state. This condition is outside the scope of the OSPP protocol and requires physical service intervention by a technician (e.g., JTAG/UART reflash, SD card replacement).

## 9. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `1011` | `URL_UNREACHABLE` | Error | The provided firmware URL is unreachable or returned a non-success status. |
| `5014` | `DOWNLOAD_FAILED` | Error | The firmware binary could not be downloaded from the provided URL. |
| `5015` | `CHECKSUM_MISMATCH` | Error | The downloaded binary does not match the provided SHA-256 checksum. |
| `5016` | `VERSION_ALREADY_INSTALLED` | Warning | The requested firmware version is already running on the station. |
| `5017` | `INSUFFICIENT_STORAGE` | Error | The station does not have enough storage to download or install the firmware. |
| `5018` | `INSTALLATION_FAILED` | Critical | The firmware could not be written to the inactive partition. |
| `5103` | `STORAGE_ERROR` | Error | Insufficient or inaccessible storage for the firmware binary. |
| `5107` | `OPERATION_IN_PROGRESS` | Warning | Another firmware update or operation is already in progress. |
| `5112` | `FIRMWARE_SIGNATURE_INVALID` | Critical | ECDSA P-256 firmware signature verification failed after download. |

## 10. Examples

### 10.1 Request (Scheduled Update)

```json
{
  "messageId": "msg_e6f7a8b9-c0d1-2345-ef01-678901234abc",
  "messageType": "Request",
  "action": "UpdateFirmware",
  "timestamp": "2026-02-13T10:24:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "firmwareUrl": "https://firmware.example.com/station/v1.3.0.bin",
    "firmwareVersion": "1.3.0",
    "checksum": "sha256:a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    "scheduledAt": "2026-02-14T03:00:00.000Z"
  }
}
```

### 10.2 Response (Accepted)

```json
{
  "messageId": "msg_e6f7a8b9-c0d1-2345-ef01-678901234abc",
  "messageType": "Response",
  "action": "UpdateFirmware",
  "timestamp": "2026-02-13T10:24:00.200Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 10.3 Response (Rejected -- Version Already Installed)

```json
{
  "messageId": "msg_e6f7a8b9-c0d1-2345-ef01-678901234abc",
  "messageType": "Response",
  "action": "UpdateFirmware",
  "timestamp": "2026-02-13T10:24:00.200Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 5016,
    "errorText": "VERSION_ALREADY_INSTALLED"
  }
}
```

## 11. Related Schemas

- Request: [`update-firmware-request.schema.json`](../../../schemas/mqtt/update-firmware-request.schema.json)
- Response: [`update-firmware-response.schema.json`](../../../schemas/mqtt/update-firmware-response.schema.json)
- FirmwareStatusNotification: [`firmware-status-notification.schema.json`](../../../schemas/mqtt/firmware-status-notification.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5014--5018, 5112)
