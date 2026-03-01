# TC-TX-003 — Early Stop with Refund

## Profile

Transaction Profile

## Purpose

Verify that when a session is stopped before its natural expiry (early stop), the station correctly reports `actualDurationSeconds` less than the requested `durationSeconds`, `creditsCharged` is pro-rated to reflect only the delivered service time, final meter values are accurate, and the server can calculate the correct refund amount (`creditsAuthorized - creditsCharged`).

## References

- `spec/profiles/transaction/start-service.md` — StartService with `durationSeconds`
- `spec/profiles/transaction/stop-service.md` — StopService response with `actualDurationSeconds` and `creditsCharged`
- `spec/profiles/transaction/meter-values.md` — MeterValues for progress verification
- `spec/07-errors.md` §7.4 — Refund policies: 100% refund if `actualDurationSeconds < 0.5 x durationSeconds`
- `spec/07-errors.md` §3.3 — Error code 3006 `SESSION_NOT_FOUND`, 3007 `SESSION_MISMATCH`

## Preconditions

1. Station is booted and has received BootNotification ACCEPTED.
2. Bay `bay_a1b2c3d4` is in `Available` state.
3. Service catalog includes `svc_basic` with a known credits-per-second rate.
4. `MeterValuesInterval` is set to 5 seconds.
5. Test harness has `sessionId: "sess_b3c4d5e6f7a8"` ready.
6. The server-side `creditsAuthorized` for a 300-second session is known (e.g., 50 credits).

## Steps

### Part A — Early Stop (< 50% Delivered)

1. Send StartService:
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "serviceId": "svc_basic",
     "sessionId": "sess_b3c4d5e6f7a8",
     "sessionSource": "MobileApp",
     "durationSeconds": 300
   }
   ```
2. Receive StartService ACCEPTED.
3. Observe StatusNotification: `bay_a1b2c3d4` -> `Occupied`.
4. Wait for at least 2 MeterValues events (confirming service is running).
5. Record the last MeterValues: note `values.liquidMl`.
6. After ~30 seconds (well under 50% of 300s), send StopService:
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "sessionId": "sess_b3c4d5e6f7a8"
   }
   ```
7. Receive StopService ACCEPTED. Record:
   - `actualDurationSeconds` — should be approximately 30 seconds (+/- 3s)
   - `creditsCharged` — should be proportional to `actualDurationSeconds / durationSeconds * creditsAuthorized`
8. Verify `creditsCharged` < `creditsAuthorized` (50 credits).
9. Verify `actualDurationSeconds` < `durationSeconds` (300 seconds).
10. Observe StatusNotification transitions: `Occupied` -> `Finishing` -> `Available`.
11. Calculate expected refund: `creditsAuthorized - creditsCharged`.
12. Verify that since `actualDurationSeconds` (30s) < 0.5 x `durationSeconds` (150s), the refund policy specifies 100% refund is applicable.

### Part B — Early Stop (> 50% Delivered)

13. Start a new session `sess_b4c5d6e7f8a9` with `durationSeconds: 60` and `sessionSource: "MobileApp"`.
14. Receive StartService ACCEPTED.
15. Wait ~40 seconds (> 50% of 60s).
16. Send StopService for `sess_b4c5d6e7f8a9`.
17. Receive StopService ACCEPTED.
18. Verify `actualDurationSeconds` is approximately 40s.
19. Verify `creditsCharged` reflects pro-rated usage (approximately 40/60 of the authorized amount).
20. Since `actualDurationSeconds` (40s) >= 0.5 x `durationSeconds` (30s), the refund is pro-rated (not 100%).

### Part C — Stop Already-Stopped Session

21. Send StopService for `sess_b3c4d5e6f7a8` again (already completed).
22. Verify the response is REJECTED with error code `3006` (`SESSION_NOT_FOUND`).

## Expected Results

1. `actualDurationSeconds` accurately reflects the real elapsed time between start and stop (+/- 3 seconds).
2. `creditsCharged` is strictly proportional to `actualDurationSeconds / durationSeconds * creditsAuthorized`.
3. `creditsCharged` < `creditsAuthorized` when the session is stopped early.
4. Final MeterValues in StopService response are >= the last periodic MeterValues reading (monotonically increasing).
5. The 100% refund rule applies when `actualDurationSeconds < 0.5 x durationSeconds`.
6. Pro-rated refund applies when `actualDurationSeconds >= 0.5 x durationSeconds`.
7. Stopping an already-completed session returns `3006 SESSION_NOT_FOUND`.
8. Bay returns to `Available` after early stop through `Finishing` state.

## Failure Criteria

1. `creditsCharged` equals `creditsAuthorized` despite early stop (full charge on partial service).
2. `actualDurationSeconds` does not match the real elapsed time (> 3 seconds deviation).
3. `creditsCharged` is not proportional to the actual service delivered.
4. Final meter values in StopService response are less than the last periodic MeterValues reading.
5. Station does not return to `Available` after early stop.
6. Station accepts a StopService for an already-completed session instead of returning `3006`.
