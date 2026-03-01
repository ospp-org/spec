# TC-DM-007 — Set Maintenance Mode

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles SetMaintenanceMode for enabling and disabling maintenance on bays, rejects maintenance when active sessions are present, and emits correct StatusNotification transitions.

## References

- `spec/profiles/device-management/set-maintenance-mode.md` — SetMaintenanceMode behavior
- `spec/03-messages.md` §6.8 — SetMaintenanceMode payload (timeout 30s)
- `spec/03-messages.md` §5.2 — StatusNotification bay status enum (`Unavailable`)
- `spec/07-errors.md` §3.3 — Error codes 3001 `BAY_BUSY`, 3005 `BAY_NOT_FOUND`
- `schemas/mqtt/set-maintenance-mode-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Bay `bay_c1d2e3f4a5b6` is in `Available` state.
3. MQTT connection is stable; Heartbeat exchange is functioning.
4. Test harness can send SetMaintenanceMode, StartService, and StopService commands.

## Steps

### Part A — Enable Maintenance, No Active Sessions (Accepted)

1. Verify bay `bay_c1d2e3f4a5b6` is in `Available` state.
2. Send SetMaintenanceMode:
   ```json
   {
     "bayId": "bay_c1d2e3f4a5b6",
     "enabled": true,
     "reason": "Scheduled cleaning"
   }
   ```
3. Verify SetMaintenanceMode response within 30 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
4. Observe StatusNotification for `bay_c1d2e3f4a5b6`:
   - `status: "Unavailable"`
   - `previousStatus: "Available"`
5. Attempt StartService on the maintenance bay:
   ```json
   {
     "sessionId": "sess_b1c2d3e4f5a6",
     "bayId": "bay_c1d2e3f4a5b6",
     "serviceId": "svc_basic",
     "durationSeconds": 120,
     "sessionSource": "MobileApp"
   }
   ```
6. Verify StartService response:
   ```json
   {
     "status": "Rejected",
     "errorCode": 3011,
     "errorText": "BAY_MAINTENANCE"
   }
   ```

### Part B — Enable Maintenance, Active Session Present (Rejected)

7. First, disable maintenance on `bay_c1d2e3f4a5b6`:
   ```json
   {
     "bayId": "bay_c1d2e3f4a5b6",
     "enabled": false
   }
   ```
8. Verify response `status: "Accepted"`.
9. Observe StatusNotification: bay returns to `Available`.
10. Start an active session:
    ```json
    {
      "sessionId": "sess_c2d3e4f5a6b7",
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_basic",
      "durationSeconds": 300,
      "sessionSource": "MobileApp"
    }
    ```
11. Verify StartService response `status: "Accepted"`.
12. Observe StatusNotification: bay transitions to `Occupied`.
13. Attempt to enable maintenance while session is active:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "enabled": true,
      "reason": "Emergency maintenance"
    }
    ```
14. Verify SetMaintenanceMode response within 30 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3001,
      "errorText": "BAY_BUSY"
    }
    ```
15. Verify the session continues uninterrupted.

### Part C — Disable Maintenance (Accepted)

16. Send StopService to end the active session:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "sessionId": "sess_c2d3e4f5a6b7"
    }
    ```
17. Verify StopService response `status: "Accepted"`.
18. Wait for bay to return to `Available`.
19. Enable maintenance:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "enabled": true,
      "reason": "Post-session inspection"
    }
    ```
20. Verify response `status: "Accepted"`.
21. Observe StatusNotification: `status: "Unavailable"`.
22. Disable maintenance:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "enabled": false
    }
    ```
23. Verify SetMaintenanceMode response within 30 seconds:
    ```json
    {
      "status": "Accepted"
    }
    ```
24. Observe StatusNotification for `bay_c1d2e3f4a5b6`:
    - `status: "Available"`
    - `previousStatus: "Unavailable"`

### Part D — Bay Not Found (3005)

25. Send SetMaintenanceMode with a nonexistent bay ID:
    ```json
    {
      "bayId": "bay_000000000000",
      "enabled": true,
      "reason": "Testing invalid bay"
    }
    ```
26. Verify SetMaintenanceMode response within 30 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3005,
      "errorText": "BAY_NOT_FOUND"
    }
    ```
27. Verify no StatusNotification is generated (no bay state change).

## Expected Results

1. Enabling maintenance on an idle bay returns `Accepted` and bay transitions to `Unavailable`.
2. StartService on a maintenance bay is rejected with `3011 BAY_MAINTENANCE`.
3. Enabling maintenance on a bay with an active session returns `Rejected` with `3001 BAY_BUSY`.
4. Disabling maintenance returns `Accepted` and bay transitions to `Available`.
5. SetMaintenanceMode with a nonexistent bay ID returns `Rejected` with `3005 BAY_NOT_FOUND`.
6. All responses arrive within the 30-second timeout.
7. StatusNotification correctly reflects `Unavailable`/`Available` transitions.

## Failure Criteria

1. Maintenance is enabled while a session is active (no rejection).
2. Bay does not transition to `Unavailable` after maintenance is enabled.
3. Bay does not transition to `Available` after maintenance is disabled.
4. Wrong error code returned for busy bay, maintenance-mode bay, or nonexistent bay.
5. SetMaintenanceMode response exceeds the 30-second timeout.
6. Nonexistent bay ID is accepted without `3005` error.
