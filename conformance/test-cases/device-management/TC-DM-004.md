# TC-DM-004 — Update Firmware

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles firmware update lifecycle including successful download and installation, download failure, installation failure with auto-rollback (5-minute watchdog), and rejection of non-HTTPS firmware URLs.

## References

- `spec/profiles/device-management/update-firmware.md` — UpdateFirmware behavior
- `spec/03-messages.md` §6.4 — UpdateFirmware payload (timeout 300s)
- `spec/03-messages.md` §6.5 — FirmwareStatusNotification event
- `spec/06-security.md` §4.6 — Firmware code-signing (ECDSA P-256)
- `spec/07-errors.md` §3.5 — Error codes 5014, 5015, 5112, 1011
- `spec/05-state-machines.md` §3 — Firmware watchdog timer (5 minutes)
- `schemas/mqtt/update-firmware-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Station firmware version is `1.2.5`.
3. No active sessions on any bay.
4. `FirmwareUpdateEnabled` is set to `true`.
5. Test harness can serve firmware binaries over HTTPS and control the download server.
6. Firmware binary `v1.3.0` is available at a test HTTPS endpoint with known SHA-256 checksum and valid ECDSA P-256 signature.

## Steps

### Part A — Successful Firmware Update

1. Send UpdateFirmware:
   ```json
   {
     "firmwareUrl": "https://firmware.example.com/station/v1.3.0.bin",
     "firmwareVersion": "1.3.0",
     "checksum": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
     "signature": "MEUCIQC7x2kR9wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIQIgRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ=="
   }
   ```
2. Verify UpdateFirmware response within 300 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
3. Observe FirmwareStatusNotification with `status: "Downloading"` (may include `progress`).
4. Observe FirmwareStatusNotification with `status: "Downloaded"` (checksum verified).
5. Station verifies ECDSA P-256 firmware signature against trusted signing certificate (see `spec/06-security.md` §4.6). Verification occurs after checksum passes and before installation begins.
6. Observe FirmwareStatusNotification with `status: "Installing"`.
7. Observe FirmwareStatusNotification with `status: "Installed"`.
8. Wait for the station to reboot.
9. Observe BootNotification after reboot.
10. Verify `firmwareVersion` in BootNotification is `"1.3.0"`.
11. Send BootNotification `Accepted` response.
12. Verify the station resumes normal operation.

### Part B — Download Failure (5014)

13. Send UpdateFirmware with a URL that will return HTTP 404:
    ```json
    {
      "firmwareUrl": "https://firmware.example.com/station/nonexistent.bin",
      "firmwareVersion": "1.4.0",
      "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "signature": "MEQCIHrN5kR8wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIIBRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ=="
    }
    ```
14. Verify UpdateFirmware response `status: "Accepted"` (station accepts the command and begins download).
15. Observe FirmwareStatusNotification with `status: "Downloading"`.
16. Observe FirmwareStatusNotification with `status: "Failed"` and `errorText` indicating download failure.
17. Verify the station remains on firmware `1.3.0` (no reboot, no change).
18. Verify the station continues normal operation.

### Part C — Installation Failure with Auto-Rollback

19. Send UpdateFirmware with a firmware binary that will fail the health check after boot:
    ```json
    {
      "firmwareUrl": "https://firmware.example.com/station/v1.4.0-bad.bin",
      "firmwareVersion": "1.4.0",
      "checksum": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "signature": "MEUCIQD3kR8wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIQIgRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ=="
    }
    ```
20. Verify UpdateFirmware response `status: "Accepted"`.
21. Observe FirmwareStatusNotification progression: `Downloading` -> `Downloaded` -> `Installing`.
22. Station reboots with new firmware.
23. New firmware fails the health check within the 5-minute watchdog timer.
24. Station auto-rolls back to previous firmware partition.
25. Observe BootNotification after rollback.
26. Verify `firmwareVersion` in BootNotification reverts to the previous version (e.g., `"1.3.0"`).
27. Observe FirmwareStatusNotification with `status: "Failed"`.

### Part D — Invalid Firmware URL (Not HTTPS)

28. Send UpdateFirmware with an HTTP (not HTTPS) URL:
    ```json
    {
      "firmwareUrl": "http://firmware.example.com/station/v1.5.0.bin",
      "firmwareVersion": "1.5.0",
      "checksum": "sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
      "signature": "MEQCIHrN5kR8wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIIBRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ=="
    }
    ```
29. Verify UpdateFirmware response within 300 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 1011,
      "errorText": "URL_UNREACHABLE"
    }
    ```
30. Verify the station does not attempt to download the firmware.
31. Verify the station remains on current firmware version.

### Part E — Invalid Firmware Signature (5112)

32. Send UpdateFirmware with a valid URL and checksum but an invalid (corrupted) signature:
    ```json
    {
      "firmwareUrl": "https://firmware.example.com/station/v1.3.0.bin",
      "firmwareVersion": "1.5.0",
      "checksum": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "signature": "INVALID_BASE64_SIGNATURE_DATA=="
    }
    ```
33. Verify UpdateFirmware response `status: "Accepted"` (station accepts the command and begins download).
34. Observe FirmwareStatusNotification with `status: "Downloading"`.
35. Observe FirmwareStatusNotification with `status: "Downloaded"` (checksum passes).
36. Station verifies ECDSA P-256 firmware signature — verification fails.
37. Observe FirmwareStatusNotification with `status: "Failed"` and `errorText: "FIRMWARE_SIGNATURE_INVALID"`.
38. Verify the station sends a SecurityEvent [MSG-012] with type `FirmwareIntegrityFailure`.
39. Verify the station does NOT install the firmware (no reboot, no partition write).
40. Verify the station remains on current firmware version and continues normal operation.

## Expected Results

1. Successful firmware update follows the progression: `Downloading` -> `Downloaded` -> signature verification -> `Installing` -> `Installed`, followed by reboot with new `firmwareVersion` in BootNotification.
2. Download failure produces FirmwareStatusNotification `Failed` and the station remains on the current firmware.
3. Installation failure triggers auto-rollback within the 5-minute watchdog timer, reverting to the previous firmware version.
4. Non-HTTPS firmware URL is rejected with `1011 URL_UNREACHABLE`.
5. Invalid firmware signature is rejected with `5112 FIRMWARE_SIGNATURE_INVALID` after download completes. The station sends a `FirmwareIntegrityFailure` SecurityEvent and does not install the firmware.
6. All UpdateFirmware responses arrive within the 300-second timeout.

## Failure Criteria

1. FirmwareStatusNotification does not follow the expected progression.
2. Station does not reboot after successful firmware installation.
3. BootNotification after update does not reflect the new firmware version.
4. Station does not auto-rollback within 5 minutes when the new firmware fails health check.
5. Station accepts an HTTP (non-HTTPS) firmware URL.
6. Station installs firmware with an invalid ECDSA P-256 signature.
7. Station does not send SecurityEvent on firmware signature failure.
8. UpdateFirmware response exceeds the 300-second timeout.
