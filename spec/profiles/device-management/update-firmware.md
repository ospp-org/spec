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
| `scheduledAt` | string | No | ISO 8601 UTC timestamp at which to **install**. The station downloads and verifies immediately on receipt regardless; this field defers only the partition write and the reboot that follows it (§5 rules 5 and 7). If omitted, the station **MUST** install as soon as the bay gate permits. |

## 4. Response Payload

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Processing Rules

1. The station **MUST** validate the request fields before responding. If the request is valid, the station **MUST** respond with `Accepted` and begin the download **immediately** — the download is not deferred by `scheduledAt` and is not gated on bay state.
2. The station **MUST** send a FirmwareStatusNotification at each stage transition (see section 6).
3. The station **MUST** verify the downloaded binary against the provided `checksum` before proceeding to installation. If verification fails, the station **MUST** send a FirmwareStatusNotification with `Failed` status.
4. The station **MUST** verify the `signature` over the downloaded binary before proceeding to installation, and **MUST NOT** install a binary whose signature it has not verified. Verification is ECDSA P-256 against the pre-provisioned Firmware Signing Certificate, or its CA, held in the station's secure element or encrypted NVS ([Chapter 06 — Security §4.6](../../06-security.md)). If the signature does not verify — or if the station holds no Firmware Signing Certificate to verify it against — the station **MUST** treat the binary as untrusted, **MUST NOT** write it to the inactive partition, **MUST** send a FirmwareStatusNotification with `Failed` status and a descriptive `errorText`, and **MUST** report `5112 FIRMWARE_SIGNATURE_INVALID` by sending a `FirmwareIntegrityFailure` SecurityEvent [MSG-012] ([Chapter 07 §3](../../07-errors.md)).

   `5112` travels on the SecurityEvent, not on the FirmwareStatusNotification: that message carries no `errorCode` field and is closed to additional properties, so the SecurityEvent is the only channel on which the code can be reported. Its `errorText` stays free prose, as §6 requires.

   The checksum of rule 3 does **not** discharge this. A checksum establishes that the bytes arrived intact; it is computed over content that whoever controls `firmwareUrl` also controls, and it travels in the same message as the URL, so an attacker able to substitute the binary can substitute the checksum with it. Only the signature establishes **origin**. Both checks are required, and passing one is never grounds for skipping the other.
5. `scheduledAt` defers the **installation**, not the download. The station **MUST** download and verify on receipt, hold the verified image, and begin writing the inactive partition at `scheduledAt` — or immediately if `scheduledAt` is absent or in the past — subject to rule 7.
6. If the station is already running the requested `firmwareVersion`, it **MUST** respond with `Rejected` and error code `5016 VERSION_ALREADY_INSTALLED`.
7. The station **MUST NOT** begin installation while active sessions are in progress. It **MUST** wait for sessions to complete or time out before installing. This is the same gate as [`05-state-machines.md` §7.4](../../05-state-machines.md) and it is the **only** one: downloading and verifying are not gated on bay state, because they touch the network and the staging area and not the partition the station boots from. A station that could not prepare while busy could never prepare at all, and the busiest stations in a fleet would be the last to be patched.
8. The response `messageId` **MUST** match the request `messageId`.
9. A station in `Pending` **MUST** answer a firmware update on the same terms as an `Operational` one — so the ordinary refusals still apply, `5016`, `5017`, `5107` and `FirmwareUpdateEnabled` among them — and **MUST NOT** send any FirmwareStatusNotification [MSG-017] for as long as it stays restricted ([`05-state-machines.md` §1.4](../../05-state-machines.md)). Nothing about the update itself changes: it downloads on receipt, verifies, installs behind the gate of rule 7, and reboots. What is lost is the intermediate reporting, and what stands in for it is the `firmwareVersion` of the next BootNotification — REQUIRED on every one ([`boot-notification.md` §3](../core/boot-notification.md)), and a restricted station **MUST** keep sending those at `retryInterval` without limit, so the result arrives whether the station comes back `Pending` or `Operational`. The stall rule of [`firmware-status.md` §6](firmware-status.md) rule 3 **MUST NOT** be applied while the station is restricted; a server that applied it would be timing the update against the messages it had itself suppressed, and that rule's remedies are a re-issue or a Reset.

   **`Rejected` is not covered by this and cannot be.** Such a station processes no command at all, so no firmware reaches it by any path — the limit is structural rather than chosen, since `Rejected` holds no session key and signing fails closed in both directions ([Chapter 06 §5.7](../../06-security.md)). It is why `1007 PROTOCOL_VERSION_MISMATCH` still names on-site service as the recovery for a station that stops retrying ([`07-errors.md` §3.1](../../07-errors.md)), and a firmware defect that lands a station in `Rejected` rather than `Pending` is outside what this rule can repair.

## 6. Download and Install Flow

The update opens with the **RESPONSE**, not with a notification. The station acknowledges the
request by answering `Accepted` on the UpdateFirmware RESPONSE (§4) and schedules the download.
`Accepted` is a value of the RESPONSE's `status`; it is **not** a FirmwareStatusNotification
status, and a station **MUST NOT** attempt to send one. The notification's `status` is a closed
enumeration of the four stages below plus `Failed`
([`firmware-status-notification.schema.json`](../../../schemas/mqtt/firmware-status-notification.schema.json)),
and that schema is `additionalProperties: false`.

The update then proceeds through the following stages. The station **MUST** send a
FirmwareStatusNotification at each transition:

1. **Downloading** -- The station begins downloading the firmware binary from `firmwareUrl`. Progress updates **SHOULD** be sent at every 10% increment, and at least every 30 seconds while the download is running — whichever falls sooner. On a slow link the 30-second floor is the binding one; on a fast link the 10% marks are.
2. **Downloaded** -- Download is complete, the SHA-256 checksum has been verified successfully, and the ECDSA P-256 `signature` has been verified against the Firmware Signing Certificate (§5 rule 4). A station **MUST NOT** report `Downloaded` on the strength of the checksum alone.
3. **Installing** -- The firmware is being written to the inactive partition. The station **SHOULD** report progress at key milestones (25%, 50%, 75%, 100%).
4. **Installed** -- Installation is complete. The station sends this notification **before** it reboots, on the connection it is about to drop; it then reboots into the new partition and sends a BootNotification with the new `firmwareVersion`. See [`firmware-status.md` §6](firmware-status.md) rule 4.

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
3. **Manual trigger:** The server sends a Reset command to reboot the station, which boots the previous known-good partition. Rollback is a property of the A/B partition scheme, not of the reset command: no value of Reset selects a partition, and none clears credentials.

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
  "protocolVersion": "0.3.0",
  "payload": {
    "firmwareUrl": "https://firmware.example.com/station/v1.3.0.bin",
    "firmwareVersion": "1.3.0",
    "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
    "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg==",
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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
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
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1011, 5014--5018, 5103, 5107, 5112)
