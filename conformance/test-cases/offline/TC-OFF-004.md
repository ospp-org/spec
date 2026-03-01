# TC-OFF-004 — Reconciliation

## Profile

Offline Profile

## Purpose

Verify that the station correctly performs offline transaction reconciliation after MQTT reconnection: uploading accumulated TransactionEvents in chronological `txCounter` order, handling `Duplicate` deduplication, retrying on `RetryLater` with backoff, and correctly transitioning from BLE offline mode back to online operation.

## References

- `spec/profiles/offline/reconciliation.md` — Reconciliation behavior
- `spec/profiles/transaction/transaction-event.md` — TransactionEvent message
- `spec/03-messages.md` §4.1 — TransactionEvent payload (timeout 60s)
- `spec/07-errors.md` §5 — Retry policies
- `schemas/mqtt/transaction-event-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` has been operating in offline mode (MQTT disconnected) for a period.
2. During the outage, 5 BLE offline sessions were completed with valid OfflinePasses.
3. Each session has a signed receipt (ECDSA P-256) and monotonically increasing `txCounter` values (1, 2, 3, 4, 5).
4. Station has all 5 TransactionEvents queued locally.
5. MQTT connection is now re-established; station has completed BootNotification `Accepted`.
6. Test harness is ready to inject TransactionEvent responses.

## Steps

### Part A — Normal Batch Upload (Chronological Order)

1. Observe the station begins reconciliation automatically after BootNotification `Accepted`.
2. Observe the first TransactionEvent (txCounter=1):
   ```json
   {
     "offlineTxId": "otx_a1b2c3d4e5f6",
     "offlinePassId": "opass_f1e2d3c4b5a6",
     "userId": "sub_alice001",
     "bayId": "bay_c1d2e3f4a5b6",
     "serviceId": "svc_eco",
     "startedAt": "2026-01-30T10:30:00.000Z",
     "endedAt": "2026-01-30T10:35:00.000Z",
     "durationSeconds": 298,
     "creditsCharged": 50,
     "receipt": {
       "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9hMWIyYzNkNGU1ZjYiLCJiYXlJZCI6...",
       "signature": "MEUCIQD8a7XK1e5Zj1bJnKLm5P3nRv4kZwE...",
       "signatureAlgorithm": "ECDSA-P256-SHA256"
     },
     "txCounter": 1,
     "meterValues": {
       "liquidMl": 45200,
       "energyWh": 150
     }
   }
   ```
3. Verify `txCounter` is 1 (first in sequence).
4. Send `Accepted` response within 60 seconds.
5. Observe TransactionEvent with `txCounter: 2`.
6. Verify `txCounter` is sequential (2 follows 1).
7. Send `Accepted` response.
8. Observe TransactionEvent with `txCounter: 3`.
9. Send `Accepted` response.
10. Observe TransactionEvent with `txCounter: 4`.
11. Send `Accepted` response.
12. Observe TransactionEvent with `txCounter: 5`.
13. Send `Accepted` response.
14. Verify no more TransactionEvent messages are sent (all 5 reconciled).
15. Verify the station waits for each RESPONSE before sending the next TransactionEvent.

### Part B — Server Responds Duplicate

16. Simulate the station re-sending a previously reconciled transaction (txCounter=1, same `offlineTxId`).
17. Send Duplicate response:
    ```json
    {
      "status": "Duplicate",
      "reason": "Transaction otx_a1b2c3d4e5f6 already reconciled"
    }
    ```
18. Verify the station removes the transaction from its local queue.
19. Verify the station proceeds to the next transaction without retry.

### Part C — Partial Failure with RetryLater

20. Queue 3 new transactions (txCounter 6, 7, 8) and trigger reconciliation.
21. Observe TransactionEvent with `txCounter: 6`.
22. Send `Accepted` response.
23. Observe TransactionEvent with `txCounter: 7`.
24. Send RetryLater response:
    ```json
    {
      "status": "RetryLater",
      "reason": "Server temporarily overloaded"
    }
    ```
25. Verify the station keeps txCounter=7 in the queue.
26. Wait for the station to retry txCounter=7 (after backoff delay).
27. On retry, send `Accepted` response.
28. Observe TransactionEvent with `txCounter: 8`.
29. Send `Accepted` response.
30. Verify the reconciliation queue is fully drained.

### Part D — Full Offline-to-Online Transition

31. Verify the station is now in full online mode after reconciliation.
32. Send StartService to verify normal operation:
    ```json
    {
      "sessionId": "sess_d3e4f5a6b7c8",
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_eco",
      "durationSeconds": 120,
      "sessionSource": "MobileApp"
    }
    ```
33. Verify StartService response `status: "Accepted"`.
34. Observe StatusNotification: bay transitions to `Occupied`.
35. Send StopService to clean up:
    ```json
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "sessionId": "sess_d3e4f5a6b7c8"
    }
    ```
36. Verify StopService response `status: "Accepted"`.

## Expected Results

1. TransactionEvents are sent in strict `txCounter` order (chronological).
2. Station waits for each RESPONSE before sending the next TransactionEvent.
3. `Duplicate` response causes the station to skip the transaction (no retry).
4. `RetryLater` response causes the station to retry with backoff.
5. All 5 transactions in Part A are successfully reconciled.
6. After reconciliation, the station operates normally in online mode.
7. TransactionEvent response timeout is 60 seconds per message.

## Failure Criteria

1. TransactionEvents are sent out of `txCounter` order.
2. Station sends the next TransactionEvent before receiving RESPONSE for the previous one.
3. Station retries after `Duplicate` response.
4. Station does not retry after `RetryLater` response.
5. Reconciliation queue is not fully drained after all responses are sent.
6. Station does not resume normal online operation after reconciliation.
