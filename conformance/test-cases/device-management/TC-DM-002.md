# TC-DM-002 — Firmware Update

## Profile

Device Management Profile

## Purpose

Verify the complete firmware update flow: UpdateFirmware command is accepted, the station downloads the binary, verifies the SHA-256 checksum, installs to the inactive partition, reboots, and sends BootNotification with the new firmware version. Also verify that a checksum mismatch results in a Failed status and that a firmware update is rejected when another operation is already in progress.

## References

- `spec/profiles/device-management/update-firmware.md` — UpdateFirmware command, A/B partition strategy
- `spec/profiles/device-management/firmware-status.md` — FirmwareStatusNotification states
- `spec/profiles/core/boot-notification.md` — BootNotification after reboot
- `spec/07-errors.md` §4.2 — Error codes: 5107 `OPERATION_IN_PROGRESS`, 5103 `STORAGE_ERROR`, 1011 `URL_UNREACHABLE`
- `schemas/mqtt/boot-notification-request.schema.json`

## Preconditions

1. Station is booted and has received BootNotification Accepted.
2. Current firmware version is known (e.g., `"1.0.0"` from BootNotification or GetConfiguration).
3. No active sessions on any bay (firmware update should not be initiated during active sessions).
4. Test harness hosts a firmware binary at an HTTPS endpoint:
   - Valid binary at `https://test-server/firmware/v1.1.0.bin` with known SHA-256 hash.
   - Corrupt binary at `https://test-server/firmware/v1.1.0-bad.bin` with a different SHA-256 hash.
5. Station has sufficient storage on the inactive partition.

## Steps

### Part A — Successful Firmware Update

1. Record the current firmware version from BootNotification (e.g., `"1.0.0"`).
2. Send UpdateFirmware:
   ```json
   {
     "firmwareUrl": "https://test-server/firmware/v1.1.0.bin",
     "checksum": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
     "firmwareVersion": "1.1.0"
   }
   ```
3. Receive UpdateFirmware RESPONSE: `status: "Accepted"`.
4. Observe FirmwareStatusNotification: `status: "Downloading"`.
5. Optionally observe progress updates during download (e.g., `progress: 25`, `50`, `75`).
6. Observe FirmwareStatusNotification: `status: "Downloaded"` — indicates checksum verified.
7. Observe FirmwareStatusNotification: `status: "Installing"`.
8. Observe FirmwareStatusNotification: `status: "Installed"`.
9. Station reboots. Observe MQTT disconnect (or LWT).
10. Station reconnects and sends BootNotification.
11. Verify the `firmwareVersion` in the BootNotification request is `"1.1.0"`.
12. Send BootNotification Accepted.
13. Verify station resumes normal operation (StatusNotification for all bays, Heartbeat resumed).

### Part B — Checksum Mismatch (Download Corruption)

14. Send UpdateFirmware with the corrupt binary URL but the valid checksum:
    ```json
    {
      "firmwareUrl": "https://test-server/firmware/v1.1.0-bad.bin",
      "checksum": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "firmwareVersion": "1.2.0"
    }
    ```
15. Receive UpdateFirmware RESPONSE: `status: "Accepted"` (accepted for processing).
16. Observe FirmwareStatusNotification: `status: "Downloading"`.
17. Observe FirmwareStatusNotification: `status: "Failed"` with an `errorText` indicating checksum mismatch.
18. Verify the station does NOT reboot.
19. Verify the station continues operating on the current firmware version (`"1.1.0"` from Part A).
20. Send GetConfiguration for `FirmwareVersion`.
21. Verify the value remains `"1.1.0"`.

### Part C — Concurrent Operation Rejection

22. Send UpdateFirmware with a valid payload.
23. Receive Accepted — station begins downloading.
24. Immediately send a second UpdateFirmware command.
25. Verify the second command is Rejected with error code `5107` (`OPERATION_IN_PROGRESS`).

### Part D — Unreachable URL

26. Wait for Part C download to complete (or cancel).
27. Send UpdateFirmware with an unreachable URL:
    ```json
    {
      "firmwareUrl": "https://nonexistent.invalid/firmware.bin",
      "checksum": "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "firmwareVersion": "2.0.0"
    }
    ```
28. Receive UpdateFirmware Accepted (accepted for processing).
29. Observe FirmwareStatusNotification: `status: "Downloading"`.
30. Observe FirmwareStatusNotification: `status: "Failed"` with an `errorText` indicating download failure.
31. Verify the station remains on its current firmware version.

## Expected Results

1. UpdateFirmware is accepted and the station progresses through: Downloading -> Downloaded -> Installing -> Installed.
2. After installation, the station reboots and sends BootNotification with the new firmware version.
3. The SHA-256 checksum is verified after download; a mismatch triggers Failed without reboot.
4. A second UpdateFirmware during an active update is rejected with `5107 OPERATION_IN_PROGRESS`.
5. An unreachable URL results in Failed without affecting current firmware.
6. FirmwareStatusNotification events are sent at each stage transition.
7. The station remains fully operational (and on the previous firmware) after any update failure.

## Failure Criteria

1. Station does not send FirmwareStatusNotification at each stage.
2. Station reboots despite a checksum mismatch.
3. BootNotification after successful update does not report the new firmware version.
4. Station accepts a second UpdateFirmware while one is already in progress.
5. Station enters a non-recoverable state after a failed firmware update (A/B rollback failure).
6. Station stops normal operation (session handling, heartbeat) during firmware download.
7. Checksum mismatch is not detected (station proceeds to install corrupt firmware).
