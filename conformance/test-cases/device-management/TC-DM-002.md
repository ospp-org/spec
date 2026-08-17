# TC-DM-002 — Firmware Update

## Profile

Device Management Profile

## Purpose

Verify the complete firmware update flow: UpdateFirmware command is accepted, the station downloads the binary, verifies the SHA-256 checksum, installs to the inactive partition, reboots, and sends BootNotification with the new firmware version. Also verify that a checksum mismatch results in a Failed status and that a firmware update is rejected when another operation is already in progress. Part E verifies the same flow against a **restricted** station: accepted, run to completion, every progress notification suppressed, and the outcome read from the `firmwareVersion` of the next BootNotification.

## References

- `spec/profiles/device-management/update-firmware.md` — UpdateFirmware command, A/B partition strategy
- `spec/profiles/device-management/firmware-status.md` — FirmwareStatusNotification states
- `spec/profiles/core/boot-notification.md` — BootNotification after reboot
- **`spec/05-state-machines.md` §1.4 — a `Pending` station answers UpdateFirmware `Accepted` and suppresses every FirmwareStatusNotification; the outcome is read from the `firmwareVersion` of the next BootNotification. Part E runs this. `firmware-status.md` §6 rule 3's stall timer **MUST NOT** be applied while the station is restricted.**
- `spec/07-errors.md` §4.2 — Error codes: 5107 `OPERATION_IN_PROGRESS`, 5103 `STORAGE_ERROR`, 1011 `URL_UNREACHABLE`, 5112 `FIRMWARE_SIGNATURE_INVALID`
- **`spec/06-security.md` §4.6 — firmware code-signing. `signature` is REQUIRED on UpdateFirmware, and "SHA-256 checksum verification alone is **NOT** sufficient — it protects against corruption but not against malicious replacement." An absent or non-verifying signature is rejected with `5112 FIRMWARE_SIGNATURE_INVALID` and a `FirmwareIntegrityFailure` SecurityEvent.**
- `schemas/mqtt/boot-notification-request.schema.json`
- **`schemas/mqtt/update-firmware-request.schema.json` — `required: [firmwareUrl, firmwareVersion, checksum, signature]`. The illustrative `signature` values below are signatures produced by `conformance/test-keys/firmware-test-key.pem` over `conformance/test-firmware/test-firmware.bin` (ECDSA is randomised, so any valid signature over the same binary serves); a harness driving real binaries substitutes its own, and `conformance/test-vectors/invalid/device-management/update-firmware-request-missing-signature.json` is the negative vector for omitting the field.**

## Preconditions

1. Station is booted and has received BootNotification Accepted, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
2. Current firmware version is known (e.g., `"1.0.0"` from BootNotification or GetConfiguration).
3. No active sessions on any bay. This keeps the timings below deterministic; it is **not** an acceptance condition — the gate is on the install and not the download (`spec/05-state-machines.md` §7.4), so a station servicing a bay accepts and prepares, then waits.
4. Test harness hosts a firmware binary at an HTTPS endpoint:
   - Valid binary at `https://test-server/firmware/v1.1.0.bin` with known SHA-256 hash.
   - Corrupt binary at `https://test-server/firmware/v1.1.0-bad.bin` with a different SHA-256 hash.
5. Station has sufficient storage on the inactive partition.
6. **For Part E only:** the harness can put the station into `Pending` — alter the server-side topology record so the station's declared `bays[]` disagrees with it, then reboot the station, which the server answers `Pending` with `3018 TOPOLOGY_MISMATCH`. This is the same setup `TC-SEC-003` Part F uses. A harness that cannot reach `Pending` records Part E as **not run**, never as a pass.

## Steps

### Part A — Successful Firmware Update

1. Record the current firmware version from BootNotification (e.g., `"1.0.0"`).
2. Send UpdateFirmware:
   ```json
   {
     "firmwareUrl": "https://test-server/firmware/v1.1.0.bin",
     "firmwareVersion": "1.1.0",
     "checksum": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
     "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
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
      "firmwareVersion": "1.2.0",
      "checksum": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
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
      "firmwareVersion": "2.0.0",
      "checksum": "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
    }
    ```
28. Receive UpdateFirmware Accepted (accepted for processing).
29. Observe FirmwareStatusNotification: `status: "Downloading"`.
30. Observe FirmwareStatusNotification: `status: "Failed"` with an `errorText` indicating download failure.
31. Verify the station remains on its current firmware version.

### Part E — Firmware Update While `Pending`

Parts A--D all run against an `Operational` station. This one does not, and it is the only Part
here whose subject is the *absence* of messages.

32. Put the station into `Pending` per precondition 6. Verify the BootNotification response carries `3018 TOPOLOGY_MISMATCH` **and** a `sessionKey` — without the key no signed command could be delivered, and the rest of this Part would be untestable rather than failing.
33. Send UpdateFirmware with a valid payload for version `"1.2.0"`, signed as in Part A.
34. Verify the response is **`Accepted`**. A `Rejected` here is a failure of this Part.
35. Verify that **no** FirmwareStatusNotification arrives at any point — none for `Downloading`, `Downloaded`, `Installing` or `Installed`. Watch for the whole download and install plus a further **5 minutes**, so that a server applying `firmware-status.md` §6 rule 3 would have declared a stall inside the observation window.
36. Verify the server does **not** re-issue UpdateFirmware and does **not** send a Reset during that window. A Reset arriving mid-`Installing` is the failure this suspension exists to prevent.
37. Observe the station reboot and send BootNotification with `firmwareVersion: "1.2.0"` and `bootReason: "FirmwareUpdate"`. The topology record is still wrong, so this boot is answered `Pending` again — and the new version is reported regardless. **This is the step that carries the whole Part:** the update's outcome reaches the server on the one message the restriction compels.
38. Verify the station keeps sending BootNotification retries at `retryInterval`, each carrying `"1.2.0"`.
39. Correct the server-side topology record. Verify the next BootNotification is answered `Accepted`, the station reaches `Operational` on the new firmware, and only now does it begin sending the reports a restricted station withheld.

## Expected Results

1. UpdateFirmware is accepted and the station progresses through: Downloading -> Downloaded -> Installing -> Installed.
2. After installation, the station reboots and sends BootNotification with the new firmware version.
3. The SHA-256 checksum is verified after download; a mismatch triggers Failed without reboot.
4. **Every UpdateFirmware in this case carries `signature`, and the station verifies it against its trusted Firmware Signing Certificate before installing.** Checksum verification does not substitute for it — the checksum is supplied by the same message as the URL, so an attacker who can choose one can choose both.
5. A second UpdateFirmware during an active update is rejected with `5107 OPERATION_IN_PROGRESS`.
6. An unreachable URL results in Failed without affecting current firmware.
7. FirmwareStatusNotification events are sent at each stage transition.
8. The station remains fully operational (and on the previous firmware) after any update failure.
9. **A `Pending` station answers UpdateFirmware `Accepted` and runs the update to completion**, on the same terms as an `Operational` one.
10. **No FirmwareStatusNotification is emitted while the station is restricted**, and neither side treats that silence as a stall.
11. **The outcome is carried by the `firmwareVersion` of the next BootNotification**, whether that boot is answered `Pending` or `Accepted`.

## Failure Criteria

1. Station does not send FirmwareStatusNotification at each stage.
2. Station reboots despite a checksum mismatch.
3. BootNotification after successful update does not report the new firmware version.
4. Station accepts a second UpdateFirmware while one is already in progress.
5. Station enters a non-recoverable state after a failed firmware update (A/B rollback failure).
6. Station stops normal operation (session handling, heartbeat) during firmware download.
7. Checksum mismatch is not detected (station proceeds to install corrupt firmware).
8. **The station accepts an UpdateFirmware with no `signature`, or with one that does not verify, instead of rejecting it with `5112 FIRMWARE_SIGNATURE_INVALID` and emitting a `FirmwareIntegrityFailure` SecurityEvent.** This is the code-signing gate: a station that installs on checksum alone can be made to install anything the commanding party can also hash.
9. **The station answers `Rejected` to UpdateFirmware because it is `Pending`.** Note what such a response would have to contain and cannot: `update-firmware-response.schema.json` requires `errorCode` **and** `errorText` whenever `status` is `Rejected`, and no code in `07-errors.md` §4's list for UpdateFirmware describes a restricted station — so an implementation failing this criterion emits either a schema-invalid response or a code that means something else.
10. **The station sends any FirmwareStatusNotification while restricted**, or buffers them and flushes them later. They are suppressed, not deferred.
11. **The station does not reboot, or its post-update BootNotification does not report the new `firmwareVersion`.** Either leaves the server with no account of an update it authorised.
12. **The server re-issues UpdateFirmware or sends a Reset during the silent window**, having applied a stall timer to a station whose notifications it suppressed.
