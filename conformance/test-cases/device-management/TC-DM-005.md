# TC-DM-005 — Get Diagnostics

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles GetDiagnostics requests including successful diagnostics collection and upload, upload URL unreachable error, upload failure when the remote server rejects the upload, the field restrictions the DiagnosticsNotification schema now enforces, refusal of a second concurrent collection and of an inverted time window, and complete suppression of progress reporting while the station is restricted.

## References

- `spec/profiles/device-management/get-diagnostics.md` — GetDiagnostics behavior
- `spec/03-messages.md` §6.6 — GetDiagnostics payload (timeout 300s)
- `spec/03-messages.md` §6.7 — DiagnosticsNotification event
- `spec/05-state-machines.md` §8 — Diagnostics Upload State Machine (5 states, 7 edges) and §8.4, the notification mapping
- `spec/05-state-machines.md` §1.4 — the restricted states, and the GetDiagnostics row of its command table
- `spec/07-errors.md` §3.5 — Error codes 5019 `UPLOAD_FAILED`, 5020 `INVALID_TIME_WINDOW`, 5107 `OPERATION_IN_PROGRESS`, 1011 `URL_UNREACHABLE`
- `schemas/mqtt/get-diagnostics-response.schema.json`
- `schemas/mqtt/diagnostics-notification.schema.json` — the `progress` and `errorText` conditionals

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
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
     "fileName": "diag_stn_a1b2c3d4_20260129_20260130.tar.gz"
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

### Part D — Field Restrictions on DiagnosticsNotification

18. Re-run Part A. For **every** DiagnosticsNotification observed in that run, verify:
    - `progress` is **absent** on `Collecting`, on `Uploaded`, and on any `Failed`;
    - `progress` is present **only** on `Uploading`, and only there;
    - `errorText` is **absent** on `Collecting`, `Uploading` and `Uploaded`;
    - `errorText` is **present** on `Failed` (re-use the `Failed` from Part C).
19. Validate each observed notification against
    `schemas/mqtt/diagnostics-notification.schema.json`. A station emitting `progress` on
    `Collecting` — the case this test exists for — fails schema validation, not merely this step.
20. Verify that the repeated `Uploading` notifications of a single upload all carry
    `status: "Uploading"` and a **non-decreasing** `progress`, and that the station does **not**
    interleave any other status between them. They are one state re-reporting itself
    (`spec/05-state-machines.md` §8.4), not transitions.

### Part E — Concurrent Collection (5107) and Inverted Window (5020)

21. Start a collection as in Part A and, **while it is still running**, send a second GetDiagnostics
    with a different `uploadUrl`.
22. Verify the second response is:
    ```json
    {
      "status": "Rejected",
      "errorCode": 5107,
      "errorText": "OPERATION_IN_PROGRESS"
    }
    ```
23. Verify the **first** collection completes unaffected and reaches `Uploaded`, and that the second
    request produced **no** DiagnosticsNotification of its own — a `Rejected` response leaves the
    machine in `Idle` and there is no transition to report (`spec/05-state-machines.md` §8.3).
24. After the first collection has finished, send GetDiagnostics with `startTime` **after**
    `endTime`:
    ```json
    {
      "uploadUrl": "https://diag.example.com/upload/stn_a1b2c3d4",
      "startTime": "2026-01-30T00:00:00.000Z",
      "endTime": "2026-01-29T00:00:00.000Z"
    }
    ```
25. Verify the response is `Rejected` with `errorCode` `5020` and `errorText`
    `"INVALID_TIME_WINDOW"` (`get-diagnostics.md` §6 rule 3), and that no DiagnosticsNotification
    is emitted.

### Part F — Restricted Station: the Upload Runs and Reports Nothing

The firmware twin gained this Part at `0.21.0` (`TC-DM-002` Part E). It is the same rule and the
same reason: the substantive effect completes, the reporting does not.

26. Bring the station to the **`Pending`** restricted state — reboot it against a server that
    answers BootNotification `Pending` (for example with `3018 TOPOLOGY_MISMATCH`, per
    `spec/profiles/core/boot-notification.md` §6.1). Confirm the station is answering commands and
    originating nothing but BootNotification retries.
27. Send GetDiagnostics exactly as in Part A step 1.
28. Verify the response is **`Accepted`** with `fileName` — a restricted station answers this
    command normally (`spec/05-state-machines.md` §1.4, GetDiagnostics row).
29. Verify the test harness **receives the archive** at the provided `uploadUrl`, and that it is a
    valid `tar.gz` whose contents match the manifest of `get-diagnostics.md` §5. The substantive
    effect **MUST** complete.
30. Verify that **zero** DiagnosticsNotification events are received for the whole of that upload —
    not a `Collecting`, not one `Uploading`, not the terminating `Uploaded`. Every row of
    `spec/05-state-machines.md` §8.4 is suppressed while the station is restricted.
31. Verify the server does **not** apply the stall rule of `diagnostics-status.md` §5 rule 6 to this
    upload. There is no last notification to measure from, so a server that runs the timer here
    re-issues GetDiagnostics against a station that is uploading correctly.
32. Return the station to `Operational` and verify a subsequent GetDiagnostics reports normally
    again — the suppression is a property of the restriction, not a latched state.

## Expected Results

1. Successful diagnostics upload follows: `Collecting` -> `Uploading` -> `Uploaded`.
2. Response includes `fileName` when `Accepted`.
3. Uploaded file is a `tar.gz` archive.
4. Unreachable upload URL returns `Rejected` with `1011 URL_UNREACHABLE`.
5. Upload rejection (HTTP 403) produces DiagnosticsNotification `Failed`.
6. All GetDiagnostics responses arrive within the 300-second timeout.
7. Station remains operational after any failure scenario.
8. `progress` appears only on `Uploading`; `errorText` appears only on `Failed`; every observed notification validates against `schemas/mqtt/diagnostics-notification.schema.json`.
9. Repeated `Uploading` notifications carry non-decreasing `progress` and no interleaved status.
10. A second GetDiagnostics during a running collection is `Rejected` with `5107`, and the running collection is unaffected.
11. An inverted time window is `Rejected` with `5020`, with no notification emitted.
12. A `Pending` station accepts GetDiagnostics, delivers the archive to the `uploadUrl`, and emits **zero** DiagnosticsNotification events.

## Failure Criteria

1. DiagnosticsNotification does not follow the expected progression.
2. `fileName` is missing from the `Accepted` response.
3. Station does not upload a valid `tar.gz` file.
4. Wrong error code returned for unreachable URL.
5. Station becomes unresponsive after a diagnostics failure.
6. GetDiagnostics response exceeds the 300-second timeout.
7. `progress` is present on `Collecting`, `Uploaded` or `Failed`, or `errorText` on any status other than `Failed`.
8. A `Failed` notification omits `errorText`.
9. A second concurrent GetDiagnostics is accepted, or is refused with a code other than `5107`.
10. An inverted time window is accepted, or is refused with a code other than `5020`.
11. A `Pending` station emits **any** DiagnosticsNotification, or fails to deliver the archive.
12. The first DiagnosticsNotification of an accepted collection is `Failed` — `get-diagnostics.md` §6 rule 2 compels `Collecting` first, and `spec/05-state-machines.md` §8.3 has no `Idle -> Failed` edge.
