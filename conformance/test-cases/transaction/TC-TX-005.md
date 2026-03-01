# TC-TX-005 — Meter Values

## Profile

Transaction Profile

## Purpose

Verify that the station sends periodic MeterValues events at the configured `MeterValuesInterval` during active sessions, includes correct payload fields, and stops emitting MeterValues after the session ends.

## References

- `spec/profiles/transaction/meter-values.md` — MeterValues behavior
- `spec/03-messages.md` §5.3 — MeterValues payload (EVENT, no response)
- `spec/08-configuration.md` §3 — `MeterValuesInterval` (default 15s), `MeterValuesSampleInterval` (default 10s)
- `schemas/mqtt/meter-values-event.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Bay `bay_c1d2e3f4a5b6` is in `Available` state.
3. `MeterValuesInterval` is set to 5 seconds (for faster test execution).
4. MQTT connection is stable; Heartbeat exchange is functioning.
5. The station supports meter values (`meterValuesSupported: true` in capabilities).

## Steps

### Part A — Periodic Meter Values During Active Session

1. Send StartService:
   ```json
   {
     "sessionId": "sess_b1c2d3e4f5a6",
     "bayId": "bay_c1d2e3f4a5b6",
     "serviceId": "svc_basic",
     "durationSeconds": 60,
     "sessionSource": "MobileApp"
   }
   ```
2. Verify StartService response `status: "Accepted"`.
3. Observe StatusNotification: bay transitions to `Occupied`.
4. Wait for `MeterValuesInterval` seconds (5s).
5. Observe the first MeterValues event. Validate payload:
   ```json
   {
     "bayId": "bay_c1d2e3f4a5b6",
     "sessionId": "sess_b1c2d3e4f5a6",
     "timestamp": "<ISO 8601 UTC with milliseconds>",
     "values": {
       "liquidMl": 0,
       "energyWh": 0
     }
   }
   ```
6. Verify `bayId` matches the active session bay.
7. Verify `sessionId` matches the active session.
8. Verify `timestamp` is a valid ISO 8601 UTC string with milliseconds.
9. Verify `values` object is present with at least one meter reading field.
10. Wait another `MeterValuesInterval` (5s).
11. Observe the second MeterValues event.
12. Verify the interval between the first and second MeterValues is within `MeterValuesInterval` +/- 20% (5s +/- 1s).
13. Verify `values` are cumulative (second reading >= first reading).

### Part B — Final Meter Values at Session End

14. After at least 3 MeterValues events have been emitted, send StopService:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "sessionId": "sess_b1c2d3e4f5a6"
    }
    ```
15. Verify StopService response `status: "Accepted"`.
16. Verify `actualDurationSeconds` > 0.
17. Verify `creditsCharged` >= 0.
18. If `meterValues` is present in StopService response, verify it contains final readings >= last MeterValues event readings.
19. Observe StatusNotification: bay transitions `Occupied` -> `Finishing` -> `Available`.
20. Wait 2x `MeterValuesInterval` (10s) after session end.
21. Verify NO further MeterValues events are emitted for `sess_b1c2d3e4f5a6`.

### Part C — No Meter Values Without Active Session

22. Verify bay is in `Available` state (no active session).
23. Wait 3x `MeterValuesInterval` (15s).
24. Verify NO MeterValues events are emitted (station only sends during active sessions).

## Expected Results

1. MeterValues events are emitted at the configured `MeterValuesInterval` during an active session.
2. Each MeterValues event contains `bayId`, `sessionId`, `timestamp`, and `values`.
3. `values` are cumulative — each reading is >= the previous reading.
4. Interval between consecutive MeterValues is within `MeterValuesInterval` +/- 20%.
5. StopService response includes final `actualDurationSeconds` and `creditsCharged`.
6. No MeterValues events are emitted after the session ends.
7. No MeterValues events are emitted when no session is active.

## Failure Criteria

1. No MeterValues events are emitted during an active session.
2. MeterValues payload is missing required fields (`bayId`, `sessionId`, `timestamp`, `values`).
3. Interval between MeterValues exceeds `MeterValuesInterval` +/- 20%.
4. `values` are not cumulative (reading decreases between events).
5. MeterValues events continue after the session has ended.
6. MeterValues events are emitted when no session is active.
