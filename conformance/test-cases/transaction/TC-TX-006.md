# TC-TX-006 — Transaction Event Lifecycle

## Profile

Transaction Profile

## Purpose

Verify that the station correctly sends TransactionEvent messages for offline transaction reconciliation, handles all four response statuses (`Accepted`, `Duplicate`, `Rejected`, `RetryLater`), sends events in `txCounter` order, and respects retry policies for offline batch processing.

## References

- `spec/profiles/transaction/transaction-event.md` — TransactionEvent behavior
- `spec/profiles/offline/reconciliation.md` — Offline reconciliation flow
- `spec/profiles/offline/reconciliation.md` §2 — **response timeout 60 s**: the TransactionEvent timeout of `spec/03-messages.md` §4.1, which is the only timeout this action has, since TransactionEvent is used for reconciliation alone.
- `spec/03-messages.md` §4.1 — TransactionEvent payload
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
    "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjMwMCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjo1MCwiZGV2aWNlSWQiOiJkZXZfZDRlNWY2YTciLCJkdXJhdGlvblNlY29uZHMiOjI5OCwiZW5kUmVhc29uIjoiTG9jYWwiLCJlbmRlZEF0IjoiMjAyNi0wMS0zMFQxNDowNTowMC4wMDBaIiwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2E4YjljMGQxZTJmMyIsIm9mZmxpbmVUeElkIjoib3R4X2Q0ZTVmNmE3YjhjOSIsInBhc3NDb3VudGVyIjozNiwic2VydmljZUlkIjoic3ZjX2VjbyIsInN0YXJ0ZWRBdCI6IjIwMjYtMDEtMzBUMTQ6MDA6MDAuMDAwWiIsInN0YXRpb25JZCI6InN0bl9hMWIyYzNkNCIsInR4Q291bnRlciI6NSwidXNlcklkIjoic3ViX3h5ejc4OSJ9",
    "signature": "MEUCIQDTepfJXfoeTqspxbFmLCmkpXB8ziUk8ngizi5+Hq/nGgIgZfjJvkLYzNMak0Ss1jhpY2UBjcMv7oUom3/liHAoYAs=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5,
  "passCounter": 36
}
```
2. Verify all required fields are present: `offlineTxId`, `offlinePassId`, `passCounter`, `userId`, `bayId`, `serviceId`, `startedAt`, `endedAt`, `durationSeconds`, `creditsCharged`, `receipt`, `txCounter`. (`offlinePassId` + `passCounter` are the **pass-form** pair; an auth-form message carries `authId` + `sessionId` instead and forbids both of these.)
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
10. Verify no more TransactionEvent messages are sent (nothing remains to be sent).

### Part B — Duplicate Response

11. Simulate the station resending a previously accepted transaction (e.g., due to network glitch — station didn't receive the ACK for txCounter=5). The resend carries the **same signed `receipt.data`** as the original, which is what makes it a retransmission rather than a second claim (`reconciliation.md` §3).
12. Observe the station sends TransactionEvent with `offlineTxId: "otx_d4e5f6a7b8c9"` and `txCounter: 5`.
13. Send Duplicate response:
    ```json
    {
      "status": "Duplicate",
      "reason": "Transaction already processed"
    }
    ```
14. Verify the station does NOT send the transaction again, and deletes its local record of it — a deletion it **MAY** defer by up to 72 hours ([`transaction-event.md` §5.1](../../../spec/profiles/transaction/transaction-event.md)).
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
21. Verify the station does not send the transaction again, deletes its local record of it (deferral of up to 72 hours allowed), and proceeds to the next.

### Part D — Rejected Response

22. Trigger the station to send a TransactionEvent.
23. Send Rejected response:
    ```json
    {
      "status": "Rejected",
      "reason": "Receipt signature verification failed"
    }
    ```
24. Verify the station flags the transaction for manual investigation (does NOT retry) and retains its local record, marked rejected — `Rejected` never orders a deletion ([`transaction-event.md` §5.1](../../../spec/profiles/transaction/transaction-event.md)).
25. Verify the station proceeds to the next transaction in the queue.

## Expected Results

1. TransactionEvent messages are sent in `txCounter` order (chronological).
2. Station waits for each RESPONSE before sending the next TransactionEvent.
3. All required fields are present in each TransactionEvent request.
4. `Accepted` — station does not send the transaction again, deletes its record (deferral of up to 72 hours allowed) and proceeds.
5. `Duplicate` — station does not send the transaction again (already processed), deletes its record (deferral of up to 72 hours allowed) and proceeds.
6. `RetryLater` — station keeps transaction in queue and retries with backoff.
7. `Rejected` — station flags transaction for investigation, retains its record, and proceeds (no retry).
8. TransactionEvent response timeout is 60 seconds (`reconciliation.md` §2).

## Failure Criteria

1. Station sends TransactionEvents out of `txCounter` order.
2. Station sends the next TransactionEvent before receiving RESPONSE for the previous one.
3. TransactionEvent payload is missing required fields.
4. Station retries after receiving `Rejected` status.
5. Station retries after receiving `Duplicate` status.
6. Station does not retry after receiving `RetryLater` status.
7. Server does not send the TransactionEvent response within the 60-second timeout window.
