# TC-TX-006 — Transaction Event Lifecycle

## Profile

Transaction Profile

## Purpose

Verify that the station correctly sends TransactionEvent messages for offline transaction reconciliation, handles all four response statuses (`Accepted`, `Duplicate`, `Rejected`, `RetryLater`), sends events in `txCounter` order, and respects retry policies for offline batch processing.

## References

- `spec/profiles/transaction/transaction-event.md` — TransactionEvent behavior
- `spec/profiles/offline/reconciliation.md` — Offline reconciliation flow
- `spec/03-messages.md` §4.1 — TransactionEvent payload (timeout 60s)
- `spec/07-errors.md` §5 — Retry policies
- `schemas/mqtt/transaction-event-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Station has 3 offline transactions stored locally (accumulated during a prior MQTT outage).
3. Each transaction has a valid ECDSA P-256 signed receipt and monotonically increasing `txCounter` (values 5, 6, 7).
4. MQTT connection has just been re-established (triggering reconciliation).
5. Test harness can inject TransactionEvent responses.

## Steps

### Part A — Normal Reconciliation (Accepted)

1. Observe the station sends the first TransactionEvent (txCounter=5):
   ```json
   {
     "offlineTxId": "otx_d4e5f6a7b8c9",
     "offlinePassId": "opass_a8b9c0d1e2f3",
     "userId": "sub_xyz789",
     "bayId": "bay_c1d2e3f4a5b6",
     "serviceId": "svc_eco",
     "startedAt": "2026-01-30T14:00:00.000Z",
     "endedAt": "2026-01-30T14:05:00.000Z",
     "durationSeconds": 298,
     "creditsCharged": 50,
     "receipt": {
       "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9kNGU1ZjZhN2I4YzkiLCJiYXlJZCI6...",
       "signature": "MEUCIQD8a7XK1e5Zj1bJnKLm5P3nRv4kZwE...",
       "signatureAlgorithm": "ECDSA-P256-SHA256"
     },
     "txCounter": 5
   }
   ```
2. Verify all required fields are present: `offlineTxId`, `offlinePassId`, `userId`, `bayId`, `serviceId`, `startedAt`, `endedAt`, `durationSeconds`, `creditsCharged`, `receipt`, `txCounter`.
3. Verify `receipt.signatureAlgorithm` is `"ECDSA-P256-SHA256"`.
4. Send TransactionEvent response within 60 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
5. Observe the station sends the second TransactionEvent (txCounter=6).
6. Verify `txCounter` is 6 (sequential after 5).
7. Send `Accepted` response.
8. Observe the station sends the third TransactionEvent (txCounter=7).
9. Send `Accepted` response.
10. Verify no more TransactionEvent messages are sent (queue is drained).

### Part B — Duplicate Response

11. Simulate the station resending a previously accepted transaction (e.g., due to network glitch — station didn't receive the ACK for txCounter=5).
12. Observe the station sends TransactionEvent with `offlineTxId: "otx_d4e5f6a7b8c9"` and `txCounter: 5`.
13. Send Duplicate response:
    ```json
    {
      "status": "Duplicate",
      "reason": "Transaction already processed"
    }
    ```
14. Verify the station removes the transaction from its local queue (does NOT retry).
15. Verify the station proceeds to the next transaction in the queue.

### Part C — RetryLater Response with Backoff

16. Trigger the station to send a TransactionEvent.
17. Send RetryLater response:
    ```json
    {
      "status": "RetryLater",
      "reason": "Server overloaded, try again later"
    }
    ```
18. Verify the station keeps the transaction in its local queue.
19. Verify the station retries after a backoff delay.
20. On the retry, send `Accepted` response.
21. Verify the station removes the transaction and proceeds to the next.

### Part D — Rejected Response

22. Trigger the station to send a TransactionEvent.
23. Send Rejected response:
    ```json
    {
      "status": "Rejected",
      "reason": "Receipt signature verification failed"
    }
    ```
24. Verify the station flags the transaction for manual investigation (does NOT retry).
25. Verify the station proceeds to the next transaction in the queue.

## Expected Results

1. TransactionEvent messages are sent in `txCounter` order (chronological).
2. Station waits for each RESPONSE before sending the next TransactionEvent.
3. All required fields are present in each TransactionEvent request.
4. `Accepted` — station removes transaction from queue and proceeds.
5. `Duplicate` — station removes transaction from queue (already processed) and proceeds.
6. `RetryLater` — station keeps transaction in queue and retries with backoff.
7. `Rejected` — station flags transaction for investigation and proceeds (no retry).
8. TransactionEvent response timeout is 60 seconds.

## Failure Criteria

1. Station sends TransactionEvents out of `txCounter` order.
2. Station sends the next TransactionEvent before receiving RESPONSE for the previous one.
3. TransactionEvent payload is missing required fields.
4. Station retries after receiving `Rejected` status.
5. Station retries after receiving `Duplicate` status.
6. Station does not retry after receiving `RetryLater` status.
7. Station does not send TransactionEvent response within the 60-second timeout window.
