# TC-DM-003 — Reset

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles Soft and Hard reset commands, rejects Reset when active sessions exist with `3016 ACTIVE_SESSIONS_PRESENT`, and performs the correct post-reset behavior including BootNotification.

## References

- `spec/profiles/device-management/reset.md` — Reset behavior
- `spec/03-messages.md` §6.3 — Reset payload (timeout 30s)
- `spec/07-errors.md` §3.3 — Error code 3016 `ACTIVE_SESSIONS_PRESENT`
- `spec/07-errors.md` §3.5 — Error codes 5107 `OPERATION_IN_PROGRESS`, 5110 `RESET_FAILED`
- `spec/profiles/core/boot-notification.md` — Post-reset BootNotification
- `schemas/mqtt/reset-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Bay `bay_c1d2e3f4a5b6` is in `Available` state.
3. MQTT connection is stable; Heartbeat exchange is functioning.
4. Test harness can send Reset, StartService, and StopService commands.
5. Station firmware version is `1.2.5` (pre-reset).

## Steps

### Part A — Soft Reset, No Active Sessions (Accepted)

1. Verify no active sessions exist (all bays `Available`).
2. Send Reset:
   ```json
   {
     "type": "Soft"
   }
   ```
3. Verify Reset response within 30 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
4. Wait for the station to reboot (MQTT connection drops and reconnects).
5. Observe the station sends BootNotification as the first message after reconnect.
6. Verify `firmwareVersion` in BootNotification is still `"1.2.5"` (Soft reset preserves firmware).
7. Verify `bootReason` is `"SoftReset"` or equivalent.
8. Send BootNotification response:
   ```json
   {
     "status": "Accepted",
     "heartbeatIntervalSec": 30,
     "serverTime": "2026-01-15T12:00:00.000Z"
   }
   ```
9. Verify the station resumes Heartbeat and sends StatusNotification for all bays.

### Part B — Hard Reset, No Active Sessions (Accepted)

10. Verify no active sessions exist.
11. Send Reset:
    ```json
    {
      "type": "Hard"
    }
    ```
12. Verify Reset response within 30 seconds:
    ```json
    {
      "status": "Accepted"
    }
    ```
13. Wait for the station to perform a full hardware reboot.
14. Observe the station sends BootNotification.
15. Verify `bootReason` indicates a hard reset.
16. Send BootNotification `Accepted` response.
17. Send GetConfiguration to verify local configuration was cleared:
    ```json
    {
      "keys": ["StationName"]
    }
    ```
18. Verify the station returns the default value for `StationName` (empty string `""` per factory defaults).

### Part C — Reset with Active Sessions (Rejected, 3016)

19. Start an active session:
    ```json
    {
      "sessionId": "sess_b1c2d3e4f5a6",
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_basic",
      "durationSeconds": 300,
      "sessionSource": "MobileApp"
    }
    ```
20. Verify StartService response `status: "Accepted"`.
21. Send Reset while session is active:
    ```json
    {
      "type": "Soft"
    }
    ```
22. Verify Reset response within 30 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3016,
      "errorText": "ACTIVE_SESSIONS_PRESENT"
    }
    ```
23. Verify the station is still operational (session continues, Heartbeat active).

### Part D — Reset After Stopping Active Session

24. Send StopService for the active session:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "sessionId": "sess_b1c2d3e4f5a6"
    }
    ```
25. Verify StopService response `status: "Accepted"`.
26. Wait for bay to return to `Available` (StatusNotification).
27. Re-issue Reset:
    ```json
    {
      "type": "Soft"
    }
    ```
28. Verify Reset response `status: "Accepted"`.
29. Verify the station reboots and sends BootNotification.

## Expected Results

1. Soft Reset with no active sessions returns `Accepted` and the station reboots, preserving firmware and sending BootNotification.
2. Hard Reset with no active sessions returns `Accepted`, clears local configuration to factory defaults, and the station sends BootNotification.
3. Reset with active sessions returns `Rejected` with `3016 ACTIVE_SESSIONS_PRESENT`.
4. After stopping all sessions, Reset succeeds.
5. All Reset responses arrive within the 30-second timeout.
6. Post-reset BootNotification is the first message after reconnection.

## Failure Criteria

1. Reset is accepted while active sessions exist.
2. Station does not reboot after accepting a Reset command.
3. BootNotification is not the first message after reboot.
4. Hard Reset does not clear local configuration to factory defaults.
5. Reset response exceeds the 30-second timeout.
6. Wrong error code returned when active sessions are present.
