# TC-DM-003 — Reset

## Profile

Device Management Profile

## Purpose

Verify that the station handles Reset correctly: that it is a **reboot** which preserves everything persisted, that an active session is refused without `force` and settled under the operator-disable policy with it, and that **no** value of the command clears credentials.

The last of those is the point of Part D. OSPP has no remote factory reset and no remote credential wipe ([`reset.md` §5.1](../../../spec/profiles/device-management/reset.md)), and a station that treats any Reset as authority to clear its identity strands itself: it would hold no credential and no in-band way to obtain one.

## References

- `spec/profiles/device-management/reset.md` §3, §5, §5.1, §5.2, §6
- `spec/03-messages.md` — Reset [MSG-015]
- `spec/07-errors.md` §3.3 — error code 3016 `ACTIVE_SESSIONS_PRESENT`
- `schemas/mqtt/reset-request.schema.json` — closed; `force` is its only member

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Bay `bay_c1d2e3f4a5b6` is in `Available` state.
3. MQTT connection is stable; Heartbeat exchange is functioning.
4. Test harness can send Reset, StartService and StopService commands.
5. Station firmware version is `1.2.5`.
6. The harness can observe both the presence and the **absence** of messages over a bounded window.

## Steps

### Part A — Reboot with no active sessions

1. Verify no active sessions exist (all bays `Available`).
2. Send Reset with `{"force": false}`.
3. Verify the response is `Accepted` within 30 seconds and that its `messageId` matches the request.
4. Verify the response arrives **before** the MQTT connection drops — the station answers first, then reboots.
5. Wait for the station to reboot. **Record the interval `T_boot`** between the Reset response and the BootNotification in step 6.
6. Verify the station sends BootNotification as the first message after reconnect.
7. Verify `firmwareVersion` is still `"1.2.5"` — a reboot preserves firmware.
8. Verify `bootReason` is `"RemoteReset"`, the value that says the server asked for this return. A spontaneous restart carries a different member, and that distinction is why the value exists.
9. Verify the station resumes Heartbeat and sends StatusNotification for every bay.

### Part B — An active session is refused without `force`

10. Start a session on `bay_c1d2e3f4a5b6` via StartService and verify the bay reports `Occupied`.
11. Send Reset with `{"force": false}`.
12. Verify the response is `Rejected` with `errorCode: 3016` and `errorText: "ACTIVE_SESSIONS_PRESENT"`.
13. Verify over a window of at least **4 × `T_boot`** that the station does **not** reboot: the MQTT connection does not drop and no BootNotification arrives.
14. Verify the session is still running and the bay still reports `Occupied` — a refused Reset must have no side effect on the session.
15. Send Reset with the `force` member **omitted entirely**. Verify the result is identical to step 12: the default is `false`.

### Part C — `force` settles the session, then reboots

16. With the session from Part B still running, send Reset with `{"force": true}`.
17. Verify the response is `Accepted`.
18. Verify the station **settles the session before rebooting**: it sends SessionEnded EVENT [MSG-040]
    with `reason: "OperatorStopped"`, the `actualDurationSeconds` actually delivered, and the
    `creditsCharged` those seconds earned — so the customer is billed for what they received. The
    reason value is asserted explicitly because it is the one member of the enum that bills
    non-zero for a session the station did not run to completion; `Deauthorized`, which reads as
    the nearest alternative, mandates billing at **zero** and would deliver a wash for free.
19. Verify that settlement completes before the MQTT connection drops. A station that reboots first and reports afterwards — or not at all — fails: `force` is a licence to end a session without waiting, not to drop it.
20. Verify the station reboots and sends BootNotification with `bootReason: "RemoteReset"`.
21. Verify the bay left `Occupied` **via `Finishing`**, not straight to `Available`: there is no
    `Occupied` -> `Available` edge in [05-state-machines.md §2.3](../../../spec/05-state-machines.md#23-transition-table),
    and the wind-down is physical regardless of what ended the session.
22. Verify the bay is no longer `Occupied` after the reboot.

### Part D — No Reset clears credentials

23. Verify that after **every** reset in Parts A and C the station reconnects over **mTLS using the same client certificate** it held before. It **MUST NOT** re-enter provisioning and **MUST NOT** call `POST /api/v1/stations/provision`.
24. Verify the station's configuration keys, service catalog and `bays` mapping survive the reboot — read them back and compare against their pre-reset values.
25. Verify the station rejects a Reset request carrying a `type` member — `{"type": "Hard"}` and `{"type": "Soft"}`. The schema is `additionalProperties: false` and `type` is not a member of it. A station that accepts one, and worse acts on it, is implementing a command this protocol does not define.
26. Verify the station rejects `{"force": "yes"}` — `force` is a boolean.

> Steps 23 and 25 are what this Part exists for. `Hard`/`Soft` was borrowed from OCPP 1.6, where the pair means abrupt versus graceful **restart** and touches no credential; the wipe meaning was attached later, in a conformance case rather than in a design decision. This case is where that is unwound, so it asserts the absence explicitly rather than merely omitting the old steps.

## Expected Results

1. Reset with no active session returns `Accepted`, the response precedes the reboot, and the station returns with `bootReason: "RemoteReset"` and unchanged firmware.
2. An active session causes `Rejected` / `3016` without `force`, with no reboot and no effect on the session. An omitted `force` behaves exactly as `false`.
3. `force: true` settles the session under the operator-disable policy — reported as
   `reason: "OperatorStopped"` and metered on delivered time — and only then reboots.
4. Credentials, configuration, catalog and the `bays` mapping survive every reset.
5. A request carrying `type` is rejected, under either of its former values.
6. All Reset responses arrive within the 30-second timeout.

## Failure Criteria

The implementation **fails** this test case if any of the following occur:

1. The station clears any credential, re-enters provisioning, or calls the provisioning endpoint after any Reset. **This is the criterion the case was rewritten to add**, and it is the one that matters: the previous version of this case *required* that behaviour.
2. The station reboots while a session is active and `force` is absent or `false`.
3. The station reboots on `force: true` without settling the running session first, or settles it as anything other than an operator-initiated stop.
4. The station reboots before sending its response.
5. `bootReason` after a commanded reset is anything other than `"RemoteReset"`.
6. The station accepts `{"type": "Hard"}` or `{"type": "Soft"}`, or acts on either.
7. Configuration, catalog or the `bays` mapping is lost across a reboot.
8. Reset response exceeds the 30-second timeout.
9. Wrong error code returned when active sessions are present.

## Coverage

**What this case covers.** The whole of Reset, in band, with no operator step required. That is new: the previous version needed an operator to mint a provisioning token before its Part C could run at all, because a Hard reset destroyed the station's identity and the protocol offers no in-band way to obtain a new token. With remote wipe removed there is nothing left that a harness cannot drive.

**What it does not cover.** Physical factory reset — the button or SD-card path that replaced the remote wipe — is out of band by construction and out of scope for this protocol. [`reset.md` §5.2](../../../spec/profiles/device-management/reset.md) states normatively what such a reset must preserve, but no OSPP message reaches it, so no conformance case can drive it. A report **MUST NOT** present this case as evidence about that path.
