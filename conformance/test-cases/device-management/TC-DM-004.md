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
- `spec/05-state-machines.md` §6 — Firmware watchdog timer (5 minutes)
- `schemas/mqtt/update-firmware-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
2. Station firmware version is `1.2.5`.
3. No active sessions on any bay.
4. `FirmwareUpdateEnabled` is set to `true`.
5. Test harness can serve firmware binaries over HTTPS and control the download server.
6. Firmware binary `v1.3.0` is available at a test HTTPS endpoint with known SHA-256 checksum and valid ECDSA P-256 signature. The binary is `conformance/test-firmware/test-firmware.bin`, its checksum is the `sha256:928de7ea…` value used throughout this case, and its signature verifies against `conformance/test-keys/firmware-test-pub.pem` — the key the station is provisioned with for this run.
7. The payloads below are the **reference** payloads: their `checksum` and `signature` are reproducible from the committed key material above, so a harness can check its own tooling before it drives any hardware. A harness driving a real station substitutes its own binaries and recomputes `checksum` and `signature` for each part — **except in Part E**, where the corrupted signature is the artefact under test and **MUST** be carried through as a deliberate one-bit corruption of whatever valid signature that harness produced. What each part varies is stated in the part: reachability (B), the health of the installed image (C), the URL scheme (D), the signature (E).

## Steps

### Part A — Successful Firmware Update

1. Send UpdateFirmware:
   ```json
{
  "firmwareUrl": "https://firmware.example.com/station/v1.3.0.bin",
  "firmwareVersion": "1.3.0",
  "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
  "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
}
```
2. Verify UpdateFirmware response within 300 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
3. Observe FirmwareStatusNotification with `status: "Downloading"` (may include `progress`).
4. Station verifies the SHA-256 checksum, then verifies the ECDSA P-256 firmware signature over the downloaded binary against the trusted Firmware Signing Certificate (see `spec/06-security.md` §4.6). **Both** checks happen before `Downloaded` is reported and before installation begins.
5. Observe FirmwareStatusNotification with `status: "Downloaded"` — which asserts that the checksum matched **and** the signature verified (`spec/profiles/device-management/firmware-status.md` §4; `update-firmware.md` §6 stage 3: a station **MUST NOT** report `Downloaded` on the strength of the checksum alone).
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
  "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
  "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
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
  "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
  "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
}
```
20. Verify UpdateFirmware response `status: "Accepted"`.
21. Observe FirmwareStatusNotification progression: `Downloading` -> `Downloaded` -> `Installing` -> `Installed`.
22. Station reboots with new firmware. `Installed` is sent **before** the reboot, on the same connection (`spec/profiles/device-management/firmware-status.md` §6 rule 4; `spec/05-state-machines.md` §6.3, `Installed -> Rebooting`).
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
  "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
  "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
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

> **The expected `errorCode` in step 29 is unsettled and this case does not settle it.** `1011` is
> defined as *"a remote URL … is not reachable"*, and a station that refuses on the `^https://`
> pattern never attempts the fetch, so it has learned nothing about reachability. `1005` is scoped
> to *"unintelligible messages only"*, and this message is understood completely. The registry's
> best fit is `3015 PAYLOAD_INVALID`, which is not listed for UpdateFirmware. See
> [KNOWN-ISSUES](../../../KNOWN-ISSUES.md). **What this part actually measures is Failure Criterion
> 5** — that the station refuses at all — and that criterion holds whichever code is chosen. A
> harness **SHOULD** assert `status: "Rejected"` and record the code the station returned rather
> than failing the station on it.

### Part E — Invalid Firmware Signature (5112)

The harness serves, at the URL below, the **same** binary whose SHA-256 is the `checksum` given —
so the download succeeds and the checksum matches, and the signature is the only thing at fault.

32. Send UpdateFirmware with a valid URL and checksum but an invalid (corrupted) signature:

<!-- ospp-sign: firmware-corrupted -->

    ```json
{
  "firmwareUrl": "https://firmware.example.com/station/v1.5.0.bin",
  "firmwareVersion": "1.5.0",
  "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
  "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtw=="
}
```

> **This `signature` is not the one Parts A–D use, and that is the whole point of Part E.**
> It is the valid signature with the **low bit of the final byte of `s` flipped** — one bit in
> 70 DER bytes. The DER framing is untouched (`30 44 02 20 <r> 02 20 <s>`), so it parses as a
> well-formed ECDSA P-256 signature and then fails the verification *maths*; a station that
> rejects it for being malformed has not exercised this case. It differs from the Part A value
> in exactly its last two base64 characters — `…XHAQtw==` here against `…XHAQtg==` there — and a
> harness that copies the Part A payload and edits only the URL will **pass this part without
> verifying anything**, which is the defect this note exists to stop.
>
> Reproduce both values from the committed key material:
> ```
> node tools/verify-example-signatures.mjs --key conformance/test-keys/firmware-test-pub.pem \
>   conformance/test-vectors/valid/device-management/update-firmware-request-full.json
> ```
> That vector carries the **valid** signature over `conformance/test-firmware/test-firmware.bin`
> and verifies. Flip the last bit of `s` and the same command fails. The pair is the positive and
> negative control: an implementation that accepts anything passes the first and **must** fail
> the second.

33. Verify UpdateFirmware response `status: "Accepted"` (station accepts the command and begins download).
34. Observe FirmwareStatusNotification with `status: "Downloading"`.
35. Station verifies the SHA-256 checksum — it matches — then verifies the ECDSA P-256 signature over the downloaded binary, which **fails**.
36. Verify the station does **NOT** send `Downloaded`. `Downloaded` asserts checksum **and** signature (`spec/profiles/device-management/firmware-status.md` §4), and `update-firmware.md` §6 stage 3 forbids reporting it on the checksum alone. The next notification after `Downloading` is `Failed`.
37. Observe FirmwareStatusNotification with `status: "Failed"` and an `errorText` describing the signature failure. `errorText` on this message is free prose, not a machine-readable name (`firmware-status.md` §3; `update-firmware.md` §5 rule 4) — do not match it programmatically.
38. Verify the station sends a SecurityEvent [MSG-012] with type `FirmwareIntegrityFailure` carrying `5112 FIRMWARE_SIGNATURE_INVALID`. The SecurityEvent is the **only** channel that can carry the code: FirmwareStatusNotification has no `errorCode` member and is closed to additional properties.
39. Verify the station does NOT install the firmware (no reboot, no partition write).
40. Verify the station remains on current firmware version and continues normal operation.

## Expected Results

1. Successful firmware update follows the progression: `Downloading` -> checksum **and** signature verification -> `Downloaded` -> `Installing` -> `Installed`, followed by reboot with new `firmwareVersion` in BootNotification. Verification precedes `Downloaded`; it is what `Downloaded` reports.
2. Download failure produces FirmwareStatusNotification `Failed` and the station remains on the current firmware.
3. Installation failure triggers auto-rollback within the 5-minute watchdog timer, reverting to the previous firmware version.
4. Non-HTTPS firmware URL is rejected with `1011 URL_UNREACHABLE`.
5. Invalid firmware signature is rejected with `5112 FIRMWARE_SIGNATURE_INVALID` after download completes. The station goes `Downloading` -> `Failed` **without** an intervening `Downloaded`, sends a `FirmwareIntegrityFailure` SecurityEvent carrying the code, and does not install the firmware.
6. All UpdateFirmware responses arrive within the 300-second timeout.

## Failure Criteria

1. FirmwareStatusNotification does not follow the expected progression.
2. Station does not reboot after successful firmware installation.
3. BootNotification after update does not reflect the new firmware version.
4. Station does not auto-rollback within 5 minutes when the new firmware fails health check.
5. Station accepts an HTTP (non-HTTPS) firmware URL.
6. Station installs firmware with an invalid ECDSA P-256 signature.
7. Station reports `Downloaded` for a binary whose signature did not verify. This is the criterion that separates a station which verifies the signature from one which verifies only the checksum, and it fails **before** any installation is attempted — a station caught here would have been caught by criterion 6 only if it also went on to install.
8. Station does not send SecurityEvent on firmware signature failure.
9. Station rejects the Part E signature as **malformed** rather than as failing verification. The value is well-formed DER; a parse-level rejection means the verification path was never reached.
10. UpdateFirmware response exceeds the 300-second timeout.
