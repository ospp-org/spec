# TC-TX-001 — Online Session Full Lifecycle

## Profile

Transaction Profile

## Purpose

Verify that a station correctly handles the complete online session lifecycle from StartService through MeterValues reporting, StopService, session completion events, and StatusNotification bay state transitions (Available -> Occupied -> Finishing -> Available).

## References

- `spec/profiles/transaction/start-service.md` — StartService command and response
- `spec/profiles/transaction/stop-service.md` — StopService command and response
- `spec/profiles/transaction/meter-values.md` — MeterValues periodic events
- `spec/profiles/core/status-notification.md` — Bay state transitions
- `spec/07-errors.md` §5.3 — StartService/StopService retry policies
- `schemas/mqtt/status-notification.schema.json`
- `schemas/mqtt/meter-values-event.schema.json`

## Preconditions

1. Station is booted and has received BootNotification Accepted.
2. Bay `bay_a1b2c3d4` is in `Available` state (confirmed via StatusNotification).
3. The station's service catalog includes `svc_basic` on `bay_a1b2c3d4`.
4. MQTT connection is stable; Heartbeat exchange is functioning.
5. Test harness has a valid `sessionId` (`sess_b1c2d3e4f5a6`) ready to use.
6. Station `MeterValuesInterval` configuration is set to 5 seconds.

## Steps

1. Verify `bay_a1b2c3d4` reports `Available` via its most recent StatusNotification.
2. Send StartService to the station:
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "serviceId": "svc_basic",
     "sessionId": "sess_b1c2d3e4f5a6",
     "sessionSource": "MobileApp",
     "durationSeconds": 120
   }
   ```
3. Receive and validate the StartService RESPONSE with `status: "Accepted"`.
4. Observe a StatusNotification from the station:
   - `bayId: "bay_a1b2c3d4"`
   - `status: "Occupied"`
   - `previousStatus: "Available"`
5. Wait for `MeterValuesInterval` seconds (5s).
6. Observe a MeterValues event:
   - `sessionId: "sess_b1c2d3e4f5a6"`, `bayId: "bay_a1b2c3d4"`
   - `values` object present (e.g., `liquidMl` >= 0)
7. Wait for at least one additional MeterValues event to confirm periodicity.
8. After ~30 seconds of the session running, send StopService:
    ```json
    {
      "bayId": "bay_a1b2c3d4",
      "sessionId": "sess_b1c2d3e4f5a6"
    }
    ```
9. Receive and validate the StopService RESPONSE:
    - `status: "Accepted"`
    - `actualDurationSeconds` > 0 and <= 120
    - `creditsCharged` >= 0
10. Observe a StatusNotification transition: `Occupied` -> `Finishing`.
11. Observe a StatusNotification transition: `Finishing` -> `Available`.
12. Verify that MeterValues events have stopped (no more events for `sess_b1c2d3e4f5a6` after 2x MeterValuesInterval).

## Expected Results

1. StartService returns Accepted.
2. Bay transitions: `Available` -> `Occupied` (on start) -> `Finishing` (on stop) -> `Available` (after cooldown).
3. MeterValues are emitted at the configured `MeterValuesInterval`.
4. StopService returns Accepted with `actualDurationSeconds` reflecting actual elapsed time and `creditsCharged` reflecting the pro-rated cost.
5. After session ends, the bay returns to `Available` and no further MeterValues are emitted.
6. All message payloads validate against their respective JSON schemas.

## Failure Criteria

1. StartService returns Rejected when bay is Available and request is valid.
2. StatusNotification does not show `Occupied` after StartService Accepted.
3. No MeterValues events are emitted during the active session.
4. MeterValues are not emitted periodically between consecutive events.
5. StopService returns Rejected for a valid active session.
6. `actualDurationSeconds` in StopService response does not reflect the elapsed time (+/- 3 seconds tolerance).
7. Bay does not return to `Available` within 30 seconds after session ends.
8. MeterValues events continue after the session has ended.
