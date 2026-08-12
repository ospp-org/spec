# TC-TX-003 — Early Stop with Refund

## Profile

Transaction Profile

## Purpose

Verify that when a session is stopped before its natural expiry (early stop), the station correctly reports `actualDurationSeconds` less than the requested `durationSeconds`, `creditsCharged` is pro-rated to reflect only the delivered service time, final meter values are accurate, and the server can calculate the correct refund amount (`creditsAuthorized - creditsCharged`).

## References

- `spec/profiles/transaction/start-service.md` — StartService with `durationSeconds`
- `spec/profiles/transaction/stop-service.md` — StopService response with `actualDurationSeconds` and `creditsCharged`
- `spec/profiles/transaction/meter-values.md` — MeterValues for progress verification
- `spec/04-flows.md` §6 — Refund Policy: the governing matrix, and the low-delivery override, which is `Fault`-only and therefore does **not** apply to a server-commanded stop
- `spec/03-messages.md` §3.4 — the credit formula `ceil(actualDurationSeconds / 60 * priceCreditsPerMinute)`
- `spec/07-errors.md` §3.3 — Error code 3006 `SESSION_NOT_FOUND`, 3007 `SESSION_MISMATCH`
- `spec/profiles/transaction/stop-service.md` §6 rule 10 — the cached StopService RESPONSE and the OSPP Session Retention Horizon
- `spec/05-state-machines.md` §2.3 — the bay transition table (canonical): a bay leaves `Occupied` only via `Finishing`

## Preconditions

1. Station is booted and has received BootNotification ACCEPTED.
2. Bay `bay_a1b2c3d4` is in `Available` state.
3. Service catalog includes `svc_basic` with a known credits-per-second rate.
4. `MeterValuesInterval` is set to 10 seconds.
5. Test harness has `sessionId: "sess_b3c4d5e6f7a8"` ready.
6. The server-side `creditsAuthorized` for a 300-second session is known (e.g., 50 credits).

## Steps

### Part A — Early Stop, Small Fraction Delivered

1. Send StartService:
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "serviceId": "svc_basic",
     "programNumber": 1,
     "sessionId": "sess_b3c4d5e6f7a8",
     "sessionSource": "MobileApp",
     "durationSeconds": 300
   }
   ```
2. Receive StartService ACCEPTED.
3. Observe StatusNotification: `bay_a1b2c3d4` -> `Occupied`.
4. Wait for at least 2 MeterValues events (confirming service is running).
5. Record the last MeterValues: note `values.liquidMl`.
6. After ~30 seconds (a tenth of the booked 300s), send StopService:
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "sessionId": "sess_b3c4d5e6f7a8"
   }
   ```
7. Receive StopService ACCEPTED. Record:
   - `actualDurationSeconds` — should be approximately 30 seconds (+/- 3s)
   - `creditsCharged` — should be the delivered time priced by the normative credit formula,
     `ceil(actualDurationSeconds / 60 * priceCreditsPerMinute)` (`spec/03-messages.md` §3.4).
     Note this is rounded up to the minute, so it is **not** a strict linear proportion of
     `creditsAuthorized`
8. Verify `creditsCharged` < `creditsAuthorized` (50 credits).
9. Verify `actualDurationSeconds` < `durationSeconds` (300 seconds).
10. Observe StatusNotification transitions: `Occupied` -> `Finishing` -> `Available`.
11. Calculate expected refund: `creditsAuthorized - creditsCharged`.
12. Verify the refund is the pro-rated remainder, `creditsAuthorized - creditsCharged`, and **not** a
    100% refund. The low-delivery override in `spec/04-flows.md` §6 is `Fault`-only: it is keyed on a
    SessionEnded `reason` of `Fault`, and a session stopped by a server-commanded StopService emits no
    SessionEnded at all. A small delivered fraction does not by itself make a commanded stop free.

### Part B — Early Stop, Larger Fraction Delivered

13. Start a new session `sess_b4c5d6e7f8a9` with `durationSeconds: 60` and `sessionSource: "MobileApp"`.
14. Receive StartService ACCEPTED.
15. Wait ~40 seconds (two thirds of the booked 60s).
16. Send StopService for `sess_b4c5d6e7f8a9`.
17. Receive StopService ACCEPTED.
18. Verify `actualDurationSeconds` is approximately 40s.
19. Verify `creditsCharged` reflects the delivered time under the normative credit formula (for 40s at
    the catalog rate, `ceil(40 / 60 * priceCreditsPerMinute)`).
20. Verify the refund is again the pro-rated remainder, `creditsAuthorized - creditsCharged`. Parts A and
    B differ only in how much was delivered; both are commanded stops and both settle pro-rata, which is
    the point of running them as a pair.

### Part C — Duplicate Stop Inside the Retention Horizon

21. Send StopService for `sess_b3c4d5e6f7a8` again (already completed). This is a new `messageId`
    targeting a `sessionId` this station stopped moments ago — well inside the 24-hour OSPP Session
    Retention Horizon.
22. Verify the response is `Accepted`, carrying the **same cached payload** as step 7 — identical
    `actualDurationSeconds`, `creditsCharged` and final `meterValues` — per
    `spec/profiles/transaction/stop-service.md` §6 rule 10. The station **MUST NOT** re-run the stop logic.
23. Verify the bay state is unchanged by step 21 (no second `Occupied` -> `Finishing` -> `Available`
    cycle, no second StatusNotification).

> `3006 SESSION_NOT_FOUND` is the correct answer only **beyond** the horizon, where rule 10 makes it a
> `MAY`. Inside the horizon it is a failure. Verifying the *beyond* branch requires a 24-hour wait and is
> therefore out of scope for this case.

## Expected Results

1. `actualDurationSeconds` accurately reflects the real elapsed time between start and stop (+/- 3 seconds).
2. `creditsCharged` equals `ceil(actualDurationSeconds / 60 * priceCreditsPerMinute)` — the delivered time
   priced by the normative credit formula, rounded up to the minute.
3. `creditsCharged` < `creditsAuthorized` when the session is stopped early.
4. Final MeterValues in StopService response are >= the last periodic MeterValues reading (monotonically increasing).
5. Both commanded stops settle pro-rata: the refund is `creditsAuthorized - creditsCharged` in Part A and
   in Part B alike. The delivered fraction does not change which rule applies.
6. The low-delivery override is not triggered by either part, because neither produces a SessionEnded with
   `reason: Fault`.
7. A duplicate StopService inside the retention horizon returns the cached `Accepted` payload, byte-identical
   to the original response.
8. Bay returns to `Available` after early stop through `Finishing` state.

## Failure Criteria

1. `creditsCharged` equals `creditsAuthorized` despite early stop (full charge on partial service).
2. `actualDurationSeconds` does not match the real elapsed time (> 3 seconds deviation).
3. `creditsCharged` does not match the normative credit formula for the delivered time.
4. Final meter values in StopService response are less than the last periodic MeterValues reading.
5. Station does not return to `Available` after early stop.
6. Station returns `3006` to a duplicate StopService inside the retention horizon instead of the cached
   `Accepted` payload, or re-runs the stop logic and emits a second StatusNotification cycle.
