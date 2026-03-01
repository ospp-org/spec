# TC-TX-002 — Reservation and Conversion

## Profile

Transaction Profile

## Purpose

Verify the complete reservation lifecycle: ReserveBay transitions the bay to Reserved, StartService with a matching `reservationId` converts the reservation to an active session, the session completes normally, and the bay returns to Available. Also verify that non-holder StartService requests on a reserved bay are rejected.

## References

- `spec/profiles/transaction/reserve-bay.md` — ReserveBay command and lifecycle
- `spec/profiles/transaction/start-service.md` — StartService with `reservationId`
- `spec/profiles/transaction/cancel-reservation.md` — CancelReservation
- `spec/profiles/core/status-notification.md` — Bay state transitions (Available -> Reserved -> Occupied)
- `spec/07-errors.md` §3.3 — Error codes 3012 `RESERVATION_NOT_FOUND`, 3013 `RESERVATION_EXPIRED`, 3014 `BAY_RESERVED`
- `spec/07-errors.md` Appendix B — Reserved -> 3DS timeout (3 min), Reserved -> payment timeout (30s)

## Preconditions

1. Station is booted and has received BootNotification Accepted.
2. Bay `bay_a1b2c3d4` is in `Available` state.
3. Service catalog includes `svc_premium` on `bay_a1b2c3d4`.
4. MQTT connection is stable.
5. Test harness has prepared `reservationId: "rsv_b1c2d3e4f5a6"` and `sessionId: "sess_b2c3d4e5f6a7"`.

## Steps

### Part A — Successful Reservation and Conversion

1. Verify `bay_a1b2c3d4` is in `Available` state.
2. Send ReserveBay to the station:
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "reservationId": "rsv_b1c2d3e4f5a6",
     "sessionSource": "WebPayment",
     "expirationTime": "2026-02-13T10:10:30.000Z"
   }
   ```
3. Receive and validate the ReserveBay RESPONSE: `status: "Accepted"`.
4. Observe a StatusNotification: `bayId: "bay_a1b2c3d4"`, `status: "Reserved"`, `previousStatus: "Available"`.
5. Attempt a StartService WITHOUT a `reservationId` on `bay_a1b2c3d4` (simulating a different user):
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "serviceId": "svc_premium",
     "sessionId": "sess_d1e2f3a4b5c6",
     "sessionSource": "MobileApp",
     "durationSeconds": 120
   }
   ```
6. Verify the response is Rejected with error code `3014` (`BAY_RESERVED`).
7. Send StartService WITH the matching `reservationId`:
   ```json
   {
     "bayId": "bay_a1b2c3d4",
     "serviceId": "svc_premium",
     "sessionId": "sess_b2c3d4e5f6a7",
     "sessionSource": "MobileApp",
     "durationSeconds": 180,
     "reservationId": "rsv_b1c2d3e4f5a6"
   }
   ```
8. Receive StartService Accepted: `status: "Accepted"`.
9. Observe StatusNotification: `status: "Occupied"`, `previousStatus: "Reserved"`.
10. Allow the session to run for ~20 seconds.
11. Send StopService for `sess_b2c3d4e5f6a7`.
12. Receive StopService Accepted with `actualDurationSeconds` and `creditsCharged`.
13. Observe bay transitions: `Occupied` -> `Finishing` -> `Available`.

### Part B — Reservation Expiry

14. Verify `bay_a1b2c3d4` is in `Available` state.
15. Send ReserveBay with a short expiration time:
    ```json
    {
      "bayId": "bay_a1b2c3d4",
      "reservationId": "rsv_c2d3e4f5a6b7",
      "sessionSource": "WebPayment",
      "expirationTime": "2026-02-13T10:10:30.000Z"
    }
    ```
16. Receive ReserveBay Accepted.
17. Observe StatusNotification: `status: "Reserved"`.
18. Wait 12 seconds (past the expiry).
19. Observe StatusNotification: `status: "Available"`, `previousStatus: "Reserved"` (auto-released).
20. Send StartService with `reservationId: "rsv_c2d3e4f5a6b7"`.
21. Verify the response is Rejected with error code `3013` (`RESERVATION_EXPIRED`).

## Expected Results

1. ReserveBay Accepted transitions the bay from `Available` to `Reserved`.
2. A StartService without a matching `reservationId` on a reserved bay is rejected with `3014 BAY_RESERVED`.
3. A StartService with the correct `reservationId` is accepted and transitions the bay from `Reserved` to `Occupied`.
4. The session completes normally through the full lifecycle after reservation conversion.
5. An expired reservation auto-releases the bay back to `Available`.
6. Using an expired `reservationId` in StartService results in `3013` (`RESERVATION_EXPIRED`).

## Failure Criteria

1. ReserveBay does not transition bay to `Reserved`.
2. An unauthorized StartService (no `reservationId`) on a reserved bay is accepted instead of rejected.
3. StartService with a valid `reservationId` is rejected.
4. Bay does not transition from `Reserved` to `Occupied` on successful StartService.
5. Reservation does not auto-expire after `expirationTime` elapses.
6. Bay remains in `Reserved` state after expiry.
7. Station accepts a StartService with an expired `reservationId`.
