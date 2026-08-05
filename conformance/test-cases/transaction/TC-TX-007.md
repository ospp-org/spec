# TC-TX-007 — Autonomous Session Termination (SessionEnded EVENT)

## Profile

Transaction Profile

## Purpose

Verify that a station correctly sends SessionEnded EVENT [MSG-040] when a session ends autonomously — either by timer expiry or hardware fault — and that the event payload contains accurate billing data (`actualDurationSeconds`, `creditsCharged`, `meterValues`).

## References

- `spec/03-messages.md` §5.4 — SessionEnded EVENT [MSG-040]
- `spec/04-flows.md` §6 — Session Stop & Completion (timer expiry and fault paths)
- `spec/05-state-machines.md` §3.3 — Session SM transitions: Timer elapsed, Hardware fault
- `schemas/mqtt/session-ended-event.schema.json`
- `spec/07-errors.md` §7.4 — Refund policies

## Preconditions

1. Station is booted and has received BootNotification Accepted.
2. Bay `bay_a1b2c3d4` is in `Available` state (confirmed via StatusNotification).
3. Service catalog includes `svc_basic` on `bay_a1b2c3d4`.
4. MQTT connection is stable.
5. Test harness has valid session IDs ready.

## Steps

### Part A — Timer Expiry

1. Send StartService with a short `durationSeconds` (e.g., 30):
```json
   {
     "bayId": "bay_a1b2c3d4",
     "serviceId": "svc_basic",
     "sessionId": "sess_timer01",
     "sessionSource": "MobileApp",
     "durationSeconds": 30
   }
```
2. Receive StartService RESPONSE with `status: "Accepted"`.
3. Observe StatusNotification: `bay_a1b2c3d4` → `Occupied`.
4. Do NOT send StopService. Wait for `durationSeconds` (30s) to elapse.
5. Observe SessionEnded EVENT from station. Validate:
   - `action: "SessionEnded"`
   - `payload.sessionId: "sess_timer01"`
   - `payload.bayId: "bay_a1b2c3d4"`
   - `payload.reason: "TimerExpired"`
   - `payload.actualDurationSeconds` is approximately 30 (+/- 3s)
   - `payload.creditsCharged` >= 0
   - Payload validates against `schemas/mqtt/session-ended-event.schema.json`
6. Observe StatusNotification: `Occupied` → `Finishing`.
7. Observe StatusNotification: `Finishing` → `Available`.
8. Verify no StopService RESPONSE is sent by the station (SessionEnded replaces it for autonomous stops).
9. Verify no further MeterValues events are emitted for `sess_timer01` after SessionEnded.

### Part B — Hardware Fault During Session

10. Send StartService:
```json
    {
      "bayId": "bay_a1b2c3d4",
      "serviceId": "svc_basic",
      "sessionId": "sess_fault01",
      "sessionSource": "MobileApp",
      "durationSeconds": 300
    }
```
11. Receive StartService RESPONSE with `status: "Accepted"`.
12. Observe StatusNotification: `bay_a1b2c3d4` → `Occupied`.
13. Trigger a hardware fault on the test station (implementation-specific method).
14. Observe SessionEnded EVENT from station. Validate:
    - `action: "SessionEnded"`
    - `payload.sessionId: "sess_fault01"`
    - `payload.reason: "Fault"`
    - `payload.actualDurationSeconds` > 0
    - `payload.creditsCharged` >= 0
    - Payload validates against `schemas/mqtt/session-ended-event.schema.json`
15. Observe StatusNotification: `Occupied` → `Faulted` (with `errorCode` present).
16. Verify SessionEnded EVENT is received BEFORE StatusNotification `Faulted`.
17. Verify server applies refund policy: if `actualDurationSeconds < 0.5 * durationSeconds` → full refund.

### Part C — Local User Stop at Station (v0.4.0+)

18. Send StartService with a long `durationSeconds` (e.g., 300):
```json
    {
      "bayId": "bay_a1b2c3d4",
      "serviceId": "svc_basic",
      "sessionId": "sess_local01",
      "sessionSource": "MobileApp",
      "durationSeconds": 300
    }
```
19. Receive StartService RESPONSE with `status: "Accepted"`.
20. Observe StatusNotification: `bay_a1b2c3d4` → `Occupied`.
21. After ~30 seconds elapsed, trigger a manual stop at the station (e.g., simulate physical Stop button press; implementation-specific method).
22. Observe SessionEnded EVENT from station. Validate:
    - `payload.reason: "Local"`
    - `payload.actualDurationSeconds` ≈ 30 (+/- 3s)
    - `payload.creditsCharged` reflects pro-rated charge for the elapsed duration
    - Payload validates against `schemas/mqtt/session-ended-event.schema.json`
23. Verify no StopService RESPONSE is sent (this is autonomous from the server's perspective).

### Part D — Offline Credit Exhausted (v0.4.0+)

24. Configure the station for offline mode with an OfflinePass that has low remaining credits (e.g., enough for ~20 seconds of `svc_basic`).
25. Send StartService with `durationSeconds: 300` via the BLE offline path (or simulate offline mode and a local StartService).
26. Wait for the station to consume the available credits and stop the session autonomously.
27. Observe SessionEnded EVENT from station. Validate:
    - `payload.reason: "LocalOutOfCredit"`
    - `payload.creditsCharged: 0` (MUST be zero)
    - `payload.actualDurationSeconds` reflects elapsed time before exhaustion
    - Payload validates against `schemas/mqtt/session-ended-event.schema.json`

### Part E — Mid-Session Deauthorization (v0.4.0+)

28. Configure the station for offline mode with an OfflinePass.
29. Start an offline session via BLE.
30. Mid-session, increment the station's `RevocationEpoch` (e.g., via ChangeConfiguration with a higher `RevocationEpoch` value, simulating server-issued revocation).
31. Verify the station detects the revocation, stops the session, and emits SessionEnded:
    - `payload.reason: "Deauthorized"`
    - `payload.creditsCharged: 0` (MUST be zero — pass invalid)
    - Payload validates against `schemas/mqtt/session-ended-event.schema.json`

### Part F — Forward-Compatibility Negative Test (v0.3.0 server)

32. With the test harness configured to enforce the v0.3.0 schema (`reason` enum = `["TimerExpired", "Fault"]`), receive a SessionEnded payload from a v0.4.0 station with `reason: "Local"`.
33. Verify the v0.3.0-conforming receiver REJECTS the payload (JSON schema validation failure on the unknown enum value). This documents the v0.3.0 → v0.4.0 coordinated upgrade requirement; the test asserts that v0.3.0 servers do not silently accept new reason values.

## Expected Results

1. Station sends SessionEnded EVENT autonomously when timer elapses, hardware faults, the user stops at the station, offline credits are exhausted, or the offline pass is revoked mid-session — without waiting for StopService.
2. SessionEnded `reason` is one of `"TimerExpired"`, `"Fault"`, `"Local"`, `"LocalOutOfCredit"`, `"Deauthorized"` (v0.4.0).
3. `actualDurationSeconds` accurately reflects real elapsed time (+/- 3 seconds).
4. `creditsCharged` is present and non-negative; for `LocalOutOfCredit` and `Deauthorized` the value MUST be `0`.
5. SessionEnded EVENT is always sent BEFORE the subsequent StatusNotification.
6. No StopService RESPONSE is sent for autonomous terminations (Parts A–E).
7. Bay returns to `Available` after timer expiry / Local / LocalOutOfCredit, `Faulted` after Fault, `Available` after Deauthorized (with security flag on the server side).
8. All SessionEnded payloads validate against `session-ended-event.schema.json` (v0.4.0).
9. v0.3.0-conforming receivers REJECT v0.4.0 reason values (Part F) — coordinated upgrade required.

## Failure Criteria

1. Station does NOT send SessionEnded EVENT when timer elapses.
2. Station sends StopService RESPONSE instead of SessionEnded EVENT for timer expiry.
3. `reason` field is absent or contains an invalid value (any value not in the v0.4.0 enum).
4. `actualDurationSeconds` deviates more than 3 seconds from real elapsed time.
5. StatusNotification is received BEFORE SessionEnded EVENT.
6. SessionEnded payload fails JSON schema validation.
7. Station sends SessionEnded for a server-initiated StopService (SessionEnded MUST NOT be sent when StopService command was received).
8. Station emits non-zero `creditsCharged` for `LocalOutOfCredit` or `Deauthorized` reasons.
