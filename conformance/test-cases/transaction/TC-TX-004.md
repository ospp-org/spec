# TC-TX-004 — Cancel Reservation

## Profile

Transaction Profile

## Purpose

Verify that the station correctly handles CancelReservation for valid reservations, expired reservations, nonexistent reservations, and already-used reservations (active session on the bay).

## References

- `spec/profiles/transaction/cancel-reservation.md` — CancelReservation behavior
- `spec/profiles/transaction/reserve-bay.md` — ReserveBay for test setup
- `spec/03-messages.md` §3.2 — CancelReservation payload (timeout 5s)
- `spec/03-messages.md` §3.1 — ReserveBay payload (timeout 5s)
- `spec/07-errors.md` §3.3 — Error codes 3012, 3013, 3014
- `spec/08-configuration.md` §3 — `ReservationDefaultTTL` (default 180s)
- `schemas/mqtt/cancel-reservation-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Bay `bay_c1d2e3f4a5b6` is in `Available` state.
3. MQTT connection is stable; Heartbeat exchange is functioning.
4. `ReservationDefaultTTL` is set to 180 seconds (default).
5. Test harness can inject ReserveBay, CancelReservation, and StartService commands.

## Steps

### Part A — Cancel Valid Reservation (Accepted)

1. Send ReserveBay to the station:
   ```json
   {
     "bayId": "bay_c1d2e3f4a5b6",
     "reservationId": "rsv_e5f6a7b8c9d0",
     "expirationTime": "2026-01-15T12:10:00.000Z",
     "sessionSource": "MobileApp"
   }
   ```
2. Verify ReserveBay response `status: "Accepted"`.
3. Observe StatusNotification: `bayId: "bay_c1d2e3f4a5b6"`, `status: "Reserved"`.
4. Send CancelReservation within the 5s timeout:
   ```json
   {
     "bayId": "bay_c1d2e3f4a5b6",
     "reservationId": "rsv_e5f6a7b8c9d0"
   }
   ```
5. Verify CancelReservation response within 5 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
6. Observe StatusNotification: `bayId: "bay_c1d2e3f4a5b6"`, `status: "Available"`, `previousStatus: "Reserved"`.

### Part B — Cancel Expired Reservation (3013)

7. Send ReserveBay with a short TTL:
   ```json
   {
     "bayId": "bay_c1d2e3f4a5b6",
     "reservationId": "rsv_f6a7b8c9d0e1",
     "expirationTime": "2026-01-15T12:00:05.000Z",
     "sessionSource": "MobileApp"
   }
   ```
8. Verify ReserveBay response `status: "Accepted"`.
9. Wait for the reservation to expire (wait until after `expirationTime`).
10. Observe StatusNotification: bay returns to `Available` (auto-release on expiry).
11. Send CancelReservation:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "reservationId": "rsv_f6a7b8c9d0e1"
    }
    ```
12. Verify CancelReservation response within 5 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3013,
      "errorText": "RESERVATION_EXPIRED"
    }
    ```

### Part C — Cancel Nonexistent Reservation (3012)

13. Send CancelReservation with a reservation ID that was never created:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "reservationId": "rsv_00000000dead"
    }
    ```
14. Verify CancelReservation response within 5 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3012,
      "errorText": "RESERVATION_NOT_FOUND"
    }
    ```
15. Verify bay remains in `Available` state (no StatusNotification change).

### Part D — Cancel Already-Used Reservation (Active Session)

16. Send ReserveBay:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "reservationId": "rsv_a7b8c9d0e1f2",
      "expirationTime": "2026-01-15T12:15:00.000Z",
      "sessionSource": "MobileApp"
    }
    ```
17. Verify ReserveBay response `status: "Accepted"`.
18. Send StartService consuming the reservation:
    ```json
    {
      "sessionId": "sess_b1c2d3e4f5a6",
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_basic",
      "durationSeconds": 300,
      "sessionSource": "MobileApp",
      "reservationId": "rsv_a7b8c9d0e1f2"
    }
    ```
19. Verify StartService response `status: "Accepted"`.
20. Observe StatusNotification: bay transitions to `Occupied`.
21. Send CancelReservation for the now-consumed reservation:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "reservationId": "rsv_a7b8c9d0e1f2"
    }
    ```
22. Verify CancelReservation response within 5 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 3012,
      "errorText": "RESERVATION_NOT_FOUND"
    }
    ```
23. Verify bay remains in `Occupied` state (active session unaffected).
24. Send StopService to clean up:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "sessionId": "sess_b1c2d3e4f5a6"
    }
    ```
25. Verify StopService response `status: "Accepted"`.

## Expected Results

1. CancelReservation for a valid, active reservation returns `Accepted` and bay returns to `Available`.
2. CancelReservation for an expired reservation returns `Rejected` with `3013 RESERVATION_EXPIRED`.
3. CancelReservation for a nonexistent reservation returns `Rejected` with `3012 RESERVATION_NOT_FOUND`.
4. CancelReservation for a reservation consumed by StartService returns `Rejected` with `3012 RESERVATION_NOT_FOUND` (reservation no longer exists).
5. All CancelReservation responses arrive within the 5-second timeout.
6. Bay state transitions are correctly reflected in StatusNotification.

## Failure Criteria

1. CancelReservation for a valid reservation returns `Rejected`.
2. Bay does not return to `Available` after successful cancellation.
3. Wrong error code returned for expired or nonexistent reservation.
4. CancelReservation response exceeds the 5-second timeout.
5. Active session is disrupted by CancelReservation on a consumed reservation.
