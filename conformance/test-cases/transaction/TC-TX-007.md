# TC-TX-007 — Autonomous Session Termination (SessionEnded EVENT)

## Profile

Transaction Profile

## Purpose

Verify that a station correctly sends SessionEnded EVENT [MSG-040] when a session ends autonomously — either by timer expiry or hardware fault — and that the event payload contains accurate billing data (`actualDurationSeconds`, `creditsCharged`, `meterValues`).

## References

- `spec/03-messages.md` §5.4 — SessionEnded EVENT [MSG-040]
- `spec/04-flows.md` §6 — Session Stop & Completion (timer expiry and fault paths)
- `spec/05-state-machines.md` §2.3 — Session SM transitions: Timer elapsed, Hardware fault
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

## Expected Results

1. Station sends SessionEnded EVENT autonomously when timer elapses — without waiting for StopService.
2. SessionEnded `reason` is `"TimerExpired"` for timer expiry and `"Fault"` for hardware fault.
3. `actualDurationSeconds` accurately reflects real elapsed time (+/- 3 seconds).
4. `creditsCharged` is present and non-negative.
5. SessionEnded EVENT is always sent BEFORE the subsequent StatusNotification.
6. No StopService RESPONSE is sent for autonomous terminations.
7. Bay returns to `Available` after timer expiry, or `Faulted` after hardware fault.
8. All SessionEnded payloads validate against `session-ended-event.schema.json`.

## Failure Criteria

1. Station does NOT send SessionEnded EVENT when timer elapses.
2. Station sends StopService RESPONSE instead of SessionEnded EVENT for timer expiry.
3. `reason` field is absent or contains an invalid value.
4. `actualDurationSeconds` deviates more than 3 seconds from real elapsed time.
5. StatusNotification is received BEFORE SessionEnded EVENT.
6. SessionEnded payload fails JSON schema validation.
7. Station sends SessionEnded for a server-initiated StopService (SessionEnded MUST NOT be sent when StopService command was received).
