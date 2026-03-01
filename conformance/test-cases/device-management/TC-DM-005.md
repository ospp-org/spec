# TC-DM-005 — Get Diagnostics

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles GetDiagnostics requests including successful diagnostics collection and upload, upload URL unreachable error, and upload failure when the remote server rejects the upload.

## References

- `spec/profiles/device-management/get-diagnostics.md` — GetDiagnostics behavior
- `spec/03-messages.md` §6.6 — GetDiagnostics payload (timeout 300s)
- `spec/03-messages.md` §6.7 — DiagnosticsNotification event
- `spec/07-errors.md` §3.5 — Error codes 5019 `UPLOAD_FAILED`, 1011 `URL_UNREACHABLE`
- `schemas/mqtt/get-diagnostics-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. MQTT connection is stable; Heartbeat exchange is functioning.
3. Test harness has an HTTPS endpoint that accepts file uploads (PUT) for diagnostics.
4. Station has diagnostic data available for upload.
5. No other long-running operations (firmware update, other diagnostics) are in progress.

## Steps

### Part A — Successful Diagnostics Upload

1. Send GetDiagnostics:
   ```json
   {
     "uploadUrl": "https://diag.example.com/upload/stn_a1b2c3d4",
     "startTime": "2026-01-29T00:00:00.000Z",
     "endTime": "2026-01-30T00:00:00.000Z"
   }
   ```
2. Verify GetDiagnostics response within 300 seconds:
   ```json
   {
     "status": "Accepted",
     "fileName": "diag_stn_a1b2c3d4_20260130.tar.gz"
   }
   ```
3. Verify `fileName` is present (REQUIRED when `Accepted`).
4. Observe DiagnosticsNotification with `status: "Collecting"`.
5. Observe DiagnosticsNotification with `status: "Uploading"` (may include `progress`).
6. Observe DiagnosticsNotification with `status: "Uploaded"` and `fileName` matching the response.
7. Verify the test harness received the uploaded file at the provided `uploadUrl`.
8. Verify the uploaded file is a `tar.gz` archive.

### Part B — Upload URL Unreachable (1011)

9. Send GetDiagnostics with an unreachable URL:
   ```json
   {
     "uploadUrl": "https://unreachable.invalid/upload/stn_a1b2c3d4",
     "startTime": "2026-01-29T00:00:00.000Z",
     "endTime": "2026-01-30T00:00:00.000Z"
   }
   ```
10. Verify GetDiagnostics response within 300 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 1011,
      "errorText": "URL_UNREACHABLE"
    }
    ```
11. Verify the station continues normal operation.

### Part C — Diagnostics Upload Failure (5019)

12. Send GetDiagnostics to a URL that will reject the upload (HTTP 403):
    ```json
    {
      "uploadUrl": "https://diag.example.com/upload/forbidden",
      "startTime": "2026-01-29T00:00:00.000Z",
      "endTime": "2026-01-30T00:00:00.000Z"
    }
    ```
13. Verify GetDiagnostics response `status: "Accepted"` (station begins collection).
14. Observe DiagnosticsNotification with `status: "Collecting"`.
15. Observe DiagnosticsNotification with `status: "Uploading"`.
16. Observe DiagnosticsNotification with `status: "Failed"` and `errorText` describing the upload failure.
17. Verify the station continues normal operation.

## Expected Results

1. Successful diagnostics upload follows: `Collecting` -> `Uploading` -> `Uploaded`.
2. Response includes `fileName` when `Accepted`.
3. Uploaded file is a `tar.gz` archive.
4. Unreachable upload URL returns `Rejected` with `1011 URL_UNREACHABLE`.
5. Upload rejection (HTTP 403) produces DiagnosticsNotification `Failed`.
6. All GetDiagnostics responses arrive within the 300-second timeout.
7. Station remains operational after any failure scenario.

## Failure Criteria

1. DiagnosticsNotification does not follow the expected progression.
2. `fileName` is missing from the `Accepted` response.
3. Station does not upload a valid `tar.gz` file.
4. Wrong error code returned for unreachable URL.
5. Station becomes unresponsive after a diagnostics failure.
6. GetDiagnostics response exceeds the 300-second timeout.
