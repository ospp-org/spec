# TC-DM-007 — Set Maintenance Mode

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles SetMaintenanceMode for enabling and disabling maintenance on bays, rejects maintenance when active sessions are present, and emits correct StatusNotification transitions.

## References

- `spec/profiles/device-management/set-maintenance-mode.md` — SetMaintenanceMode behavior
- `spec/03-messages.md` §6.8 — SetMaintenanceMode payload (timeout 30s)
- `spec/03-messages.md` §5.2 — StatusNotification bay status enum (`Unavailable`)
- `spec/05-state-machines.md` §2.3 — the bay transition table: the `SetMaintenanceMode` rows, and the hardware-error row for which `Unavailable` is a legal source
- `spec/07-errors.md` §3.3 — Error codes 3001 `BAY_BUSY`, 3002 `BAY_NOT_READY`, 3005 `BAY_NOT_FOUND`, 3014 `BAY_RESERVED`
- `spec/07-errors.md` §4.2 — the SetMaintenanceMode row, which lists all four
- `spec/05-state-machines.md` §1.4 — the restricted states, and the SetMaintenanceMode row of its command table
- `spec/profiles/device-management/set-maintenance-mode.md` §6 — the refusal-by-source-state table
- `schemas/mqtt/set-maintenance-mode-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
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
     "programNumber": 1,
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
      "programNumber": 1,
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

### Part E — Fault Detected During Maintenance (`Unavailable` → `Faulted`)

> Isolates one rule and one only: that `Unavailable` is a legal **source** for a hardware
> fault ([`05-state-machines.md` §2.3](../../../spec/05-state-machines.md), the hardware-error
> row). It asserts nothing about `previousStatus` presence (Part A covers that), nothing about
> the maintenance command itself (Parts A--D), and nothing about server-side handling of an
> invalid transition — a fault reported from `Unavailable` **is** valid, which is the point.

28. Return `bay_c1d2e3f4a5b6` to maintenance: send SetMaintenanceMode with `enabled: true`, and
    confirm the bay reports `status: "Unavailable"`.
29. With the bay still in maintenance, induce a bay-level hardware fault by the vendor's
    documented means (for example, disconnect the pump sensor loop, or trip the bay's
    emergency stop).
30. Observe a StatusNotification for `bay_c1d2e3f4a5b6` within 1 second:
    - `status: "Faulted"`
    - `previousStatus: "Unavailable"`
    - `errorCode` present, from the 5xxx range
    - `errorText` present, `UPPER_SNAKE_CASE`, matching the code's registry name
31. Verify the station does **not** suppress the report, and does not first return the bay to
    `Available` in order to report the fault from there.

### Part F — `Reserved` (3014), `Unknown` (3002), and the Faulted Source

> Three rows of [`set-maintenance-mode.md` §6](../../../spec/profiles/device-management/set-maintenance-mode.md)
> that no step above reaches. The two codes are mandated by that profile and are listed in
> [`07-errors.md` §4.2](../../../spec/07-errors.md); until `0.23.0` that row named only `3001`
> and `3005`, so a station implementing exactly the registry could not have passed this Part.

32. Place `bay_c1d2e3f4a5b6` in `Reserved` (ReserveBay [MSG-003]) and confirm the bay reports
    `status: "Reserved"`.
33. Send SetMaintenanceMode with `enabled: true` for that bay. Verify:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3014,
      "errorText": "BAY_RESERVED"
    }
    ```
34. Verify the reservation is **not** released as a side effect — the release is explicit
    (CancelReservation [MSG-004]) and never a consequence of a refused maintenance command.
35. Reboot the station and, in the post-boot window **before** the bay's first StatusNotification
    (while the bay is `Unknown`), send SetMaintenanceMode with `enabled: true`. Verify:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3002,
      "errorText": "BAY_NOT_READY"
    }
    ```
36. Send the same command with `enabled: false` against the `Unknown` bay and verify it is refused
    with `3002` as well — the refusal is symmetric, because there is no evaluated state to move out
    of in either direction.
37. Induce a bay-level hardware fault so the bay reports `Faulted`. Send SetMaintenanceMode with
    `enabled: true`. Verify the response is **`Accepted`** and the bay transitions
    `Faulted -> Unavailable`. This is the ordinary case, not an edge case: taking a bay out of
    service is usually what an operator does *because* it faulted.

### Part G — All Bays, Idempotent Re-emission, and the Restricted Station

38. With every bay idle, send SetMaintenanceMode **without** `bayId` and `enabled: true`. Verify a
    single `Accepted`, and one StatusNotification `Unavailable` per bay — the command applies to
    all bays when `bayId` is absent (`set-maintenance-mode.md` §5 rule 3).
39. Start a session on one bay, then repeat the no-`bayId` command with `enabled: true`. Verify it
    is `Rejected` with `3001 BAY_BUSY`, and that **no bay** changed state — the all-bays form is
    all-or-nothing.
40. With the bay already `Unavailable`, send SetMaintenanceMode `enabled: true` for it again.
    Verify the response is `Accepted` (rule 7, idempotent) and that the station emits **no** second
    StatusNotification: nothing changed, so there is nothing to report.
41. Bring the station to the **`Pending`** restricted state (see `TC-DM-005` Part F for the
    procedure). Send SetMaintenanceMode `enabled: true` for an idle bay.
42. Verify the response is **`Accepted`** and that **zero** StatusNotification events are emitted
    for the affected bay — a restricted station applies the change and originates nothing
    (`spec/05-state-machines.md` §1.4; `set-maintenance-mode.md` §5 rule 4).
43. Return the station to `Operational` and verify the post-boot report carries the bay as
    `Unavailable`. The state was never lost; it was carried by the boot report rather than by an
    event the restriction forbids.

## Expected Results

1. Enabling maintenance on an idle bay returns `Accepted` and bay transitions to `Unavailable`.
2. StartService on a maintenance bay is rejected with `3011 BAY_MAINTENANCE`.
3. Enabling maintenance on a bay with an active session returns `Rejected` with `3001 BAY_BUSY`.
4. Disabling maintenance returns `Accepted` and bay transitions to `Available`.
5. SetMaintenanceMode with a nonexistent bay ID returns `Rejected` with `3005 BAY_NOT_FOUND`.
6. All responses arrive within the 30-second timeout.
7. StatusNotification correctly reflects `Unavailable`/`Available` transitions.
8. A hardware fault detected while the bay is `Unavailable` is reported as
   `Unavailable` → `Faulted`, with `errorCode` and `errorText`.
9. Maintenance on a `Reserved` bay is refused with `3014 BAY_RESERVED`, and the reservation survives.
10. Maintenance on an `Unknown` bay is refused with `3002 BAY_NOT_READY` in **both** directions.
11. Maintenance on a `Faulted` bay is `Accepted`: `Faulted` is a legal source for `Unavailable`.
12. The no-`bayId` form applies to every bay, and is all-or-nothing when one bay is busy.
13. A repeat of the current state is `Accepted` and emits no second StatusNotification.
14. A `Pending` station accepts the command, applies it, and emits **zero** StatusNotifications.

## Failure Criteria

1. Maintenance is enabled while a session is active (no rejection).
2. Bay does not transition to `Unavailable` after maintenance is enabled.
3. Bay does not transition to `Available` after maintenance is disabled.
4. Wrong error code returned for busy bay, maintenance-mode bay, or nonexistent bay.
5. SetMaintenanceMode response exceeds the 30-second timeout.
6. Nonexistent bay ID is accepted without `3005` error.
7. A fault detected while the bay is `Unavailable` is not reported, or is reported only after
   routing the bay through another state first. `Unavailable` is a legal source for the
   hardware-error transition; a bay under maintenance is where a fault is most likely to be
   found, and suppressing the report would suppress a true state.
8. A `Reserved` bay is accepted into maintenance, or is refused with a code other than `3014`; or
   the reservation is released as a side effect of the refusal.
9. An `Unknown` bay is accepted into maintenance, or is refused with a code other than `3002`, in
   either direction.
10. A `Faulted` bay is refused maintenance. A station that accepts maintenance only from
    `Available` cannot be told to stop offering the one bay that is broken.
11. The no-`bayId` form applies to some bays but not others when one is busy.
12. A repeat of the current state is refused, or emits a second StatusNotification.
13. A `Pending` station emits **any** StatusNotification for the affected bay, or refuses the
    command.
