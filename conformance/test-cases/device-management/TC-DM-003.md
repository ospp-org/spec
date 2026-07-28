# TC-DM-003 — Reset

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles Soft and Hard reset commands, rejects Reset when active sessions exist with `3016 ACTIVE_SESSIONS_PRESENT`, and performs the correct post-reset behavior — which **differs between the two reset types**. A Soft reset preserves the provisioned identity and the station boots normally. A Hard reset destroys it: the station **MUST NOT** send a BootNotification on the restart that follows, because it no longer holds the credentials Boot requires, and it recovers only through operator-driven re-provisioning.

## References

- `spec/profiles/device-management/reset.md` §5 — Reset processing rules (rule 4 Soft, rule 5 Hard, rule 6 the server's token obligation)
- `spec/profiles/device-management/reset.md` §5.1 — what a Hard reset clears and what it **MUST** preserve
- `spec/03-messages.md` §6.3 — Reset payload (timeout 30s)
- `spec/04-flows.md` §1 — Boot preconditions (valid TLS certificate and private key in NVS; completed provisioning)
- `spec/04-flows.md` §2 — Station Provisioning, and *Re-provisioning an already provisioned station*
- `spec/07-errors.md` §3.3 — Error code 3016 `ACTIVE_SESSIONS_PRESENT`
- `spec/07-errors.md` §3.5 — Error codes 5107 `OPERATION_IN_PROGRESS`, 5110 `RESET_FAILED`
- `spec/profiles/core/boot-notification.md` — BootNotification, and the `bootReason` enum
- `schemas/mqtt/reset-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Bay `bay_c1d2e3f4a5b6` is in `Available` state.
3. MQTT connection is stable; Heartbeat exchange is functioning.
4. Test harness can send Reset, StartService, and StopService commands.
5. Station firmware version is `1.2.5` (pre-reset).
6. The harness can observe the **absence** of MQTT CONNECT attempts and of BootNotification over a bounded window, not only their presence. Part B turns on a negative assertion.
7. **For Part C only** — the harness can additionally act as the **provisioning endpoint** (`POST /api/v1/stations/provision`) at the origin the station was configured with, and an operator can mint a provisioning token for `stn_a1b2c3d4` and deliver it to the station out of band. Both are required by `reset.md` §5 rule 6: re-provisioning needs a **new** token, and the station has no in-band way to request one. A harness without these capabilities **MUST** skip Part C and record it as skipped — see *Coverage* below.
8. The station's out-of-band bootstrap inputs — `stationId`, network configuration, provisioning endpoint origin, HTTPS trust policy, initial time source (`reset.md` §5.1, second table) — are configured, and the harness knows the `stationId` it expects to see.

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
4. Wait for the station to reboot (MQTT connection drops and reconnects). **Record the interval `T_boot`** between the Reset response and the BootNotification in step 5; Part B calibrates its observation window from it.
5. Observe the station sends BootNotification as the first message after reconnect.
6. Verify `firmwareVersion` in BootNotification is still `"1.2.5"` (Soft reset preserves firmware).
7. Verify `bootReason` is `"ManualReset"` — the value `reset.md` §5 rule 4 requires, and the only reset-related member of the `bootReason` enum in `schemas/mqtt/boot-notification-request.schema.json`. `"SoftReset"` is **not** an enum member and **MUST** be rejected.
8. Send BootNotification response:
   ```json
   {
     "status": "Accepted",
     "heartbeatIntervalSec": 30,
     "serverTime": "2026-01-15T12:00:00.000Z"
   }
   ```
9. Verify the station resumes Heartbeat and sends StatusNotification for all bays.

### Part B — Hard Reset Leaves the Station Unprovisioned

> This Part asserts what a Hard reset **destroys**, and it does so mostly by absence. It is fully runnable by any harness. Part C asserts recovery and needs an operator.

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
    The response is sent **before** the reset is performed (`reset.md` §5 rule 7), which is the only reason a Hard reset is observable in band at all.
13. Verify the MQTT connection drops.
14. Verify that for an observation window of **at least 120 seconds, and at least 4 × `T_boot`, whichever is longer**, the station sends **no BootNotification**. `reset.md` §5 rule 5: the station **MUST NOT** send a BootNotification on the restart that follows a Hard reset. The window is calibrated from Part A so that silence is evidence of the unprovisioned state rather than of a slow reboot.
15. Verify that within the same window the station establishes **no mTLS session** with the broker. It may attempt TCP or TLS and fail; it **MUST NOT** complete a handshake, because the client certificate and private key were cleared (`reset.md` §5.1, first table).
16. Verify the station does **not** present the pre-reset client certificate on any handshake attempt during the window. A station that still holds it did not clear what §5.1 requires it to clear.

### Part C — Hard Reset Recovery: Operator-Driven Re-Provisioning (CONDITIONAL)

> Applicable only where precondition 7 holds. Skip otherwise, and **record it as skipped** — the coverage lost is stated under *Coverage*.

17. **Operator step.** Mint a new provisioning token for `stn_a1b2c3d4` and deliver it to the station out of band. This is a server obligation, not a station behaviour: `reset.md` §5 rule 6 requires a server that issues a Hard reset to be prepared to do exactly this, and a consumed token **MUST NOT** be reused.
18. Verify the station sends `POST /api/v1/stations/provision` to the configured origin. It reaching the endpoint at all demonstrates that the provisioning origin, HTTPS trust policy and initial time source survived the reset (`reset.md` §5.1, second table).
19. Verify the CSR's Subject CN is **`stn_a1b2c3d4`** — the **same** `stationId` as before the reset. This is the load-bearing assertion of §5.1: `stationId` **MUST** survive, the server **MUST NOT** allocate a new one, and a station that presents a different one has bricked itself in the manner §5.1 forbids.
20. Verify the submitted `receiptSigningPublicKey` **differs** from the one bound before the reset — the receipt-signing key pair is cleared and regenerated on-device (`reset.md` §5.1, first table).
21. Answer with a valid provisioning response and verify the station stores it.
22. Verify the station reboots and **now** sends BootNotification, with `bootReason: "ManualReset"` — `reset.md` §5 rule 5: the intervening provisioning is not why the station rebooted.
23. Send BootNotification `Accepted` response.
24. Send GetConfiguration to verify local configuration was cleared:
    ```json
    {
      "keys": ["StationName"]
    }
    ```
25. Verify the station returns the default value for `StationName` (empty string `""` per factory defaults).

### Part D — Reset with Active Sessions (Rejected, 3016)

26. Start an active session:
    ```json
    {
      "sessionId": "sess_b1c2d3e4f5a6",
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_basic",
      "durationSeconds": 300,
      "sessionSource": "MobileApp"
    }
    ```
27. Verify StartService response `status: "Accepted"`.
28. Send Reset while session is active:
    ```json
    {
      "type": "Soft"
    }
    ```
29. Verify Reset response within 30 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3016,
      "errorText": "ACTIVE_SESSIONS_PRESENT"
    }
    ```
30. Verify the station is still operational (session continues, Heartbeat active).

### Part E — Reset After Stopping Active Session

31. Send StopService for the active session:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "sessionId": "sess_b1c2d3e4f5a6"
    }
    ```
32. Verify StopService response `status: "Accepted"`.
33. Wait for bay to return to `Available` (StatusNotification).
34. Re-issue Reset:
    ```json
    {
      "type": "Soft"
    }
    ```
35. Verify Reset response `status: "Accepted"`.
36. Verify the station reboots and sends BootNotification.

## Expected Results

1. Soft Reset with no active sessions returns `Accepted` and the station reboots, preserving firmware and sending BootNotification with `bootReason: "ManualReset"`.
2. Hard Reset with no active sessions returns `Accepted`, and the station then goes **silent**: no BootNotification and no completed mTLS session for the observation window, because the credentials Boot requires were cleared.
3. After an operator supplies a new provisioning token, the station re-provisions under the **same** `stationId`, with a **regenerated** receipt-signing key, and only then sends BootNotification.
4. Local configuration is at factory defaults after a Hard reset, observable once the station is back in band.
5. Reset with active sessions returns `Rejected` with `3016 ACTIVE_SESSIONS_PRESENT`.
6. After stopping all sessions, Reset succeeds.
7. All Reset responses arrive within the 30-second timeout.

## Failure Criteria

The implementation **fails** this test case if any of the following occur:

1. Reset is accepted while active sessions exist.
2. Station does not reboot after accepting a Reset command.
3. **A Hard reset is followed by a BootNotification** on the restart that follows it, or by any completed mTLS session, before re-provisioning. Either proves the station retained credentials `reset.md` §5.1 requires it to clear.
4. After a Hard reset the station presents a **different** `stationId`, or cannot reach the provisioning endpoint at all. Both mean it cleared a row of §5.1's second table and is unrecoverable.
5. After a Hard reset the station re-submits the **same** receipt-signing public key, which it was required to clear and regenerate.
6. Hard Reset does not clear local configuration to factory defaults.
7. `bootReason` on any post-reset BootNotification is a value outside the `boot-notification-request.schema.json` enum, or is not `"ManualReset"`.
8. Reset response exceeds the 30-second timeout.
9. Wrong error code returned when active sessions are present.

## Coverage

**What this case covers.** The full Soft-reset cycle; the Hard-reset command and response; the unprovisioned state a Hard reset leaves, asserted by absence; and — where precondition 7 holds — the whole recovery path including the two §5.1 assertions that matter most, that `stationId` survives and that the receipt-signing key does not.

**What it cannot verify without an operator.** Everything after the reset that requires a credential: the provisioning call, the `stationId` continuity check, the post-re-provisioning BootNotification, and the factory-defaults check via GetConfiguration. All of these live in Part C. This is not a gap in the case but a property of the protocol — `reset.md` §5 rule 6 makes token delivery an out-of-band operator action by construction, so no harness can drive it in band. The former version of this case appeared to test the factory-defaults check without an operator only because it assumed a BootNotification that the specification now forbids.

**A harness that skips Part C** still verifies that a Hard reset is accepted, that it destroys the provisioned identity, and that the station does not attempt to boot without it — which is the behaviour the specification changed. It does **not** verify that the station is recoverable. Those are different claims, and a report **MUST NOT** present the first as the second.
