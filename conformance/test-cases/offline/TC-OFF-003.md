# TC-OFF-003 — Reconciliation

## Profile

Offline/BLE Profile

## Purpose

Verify that when a station reconnects to the server after an offline period, it correctly sends buffered offline transactions via TransactionEvent (ordered by `txCounter`), the server deduplicates by `offlineTxId`, the `txCounter` continuity is verified for integrity (no gaps), receipt signatures are validated, and wallet billing reconciliation is performed accurately.

## References

- `spec/profiles/offline/reconciliation.md` — Sync procedure, deduplication, txCounter gap detection, fraud detection, wallet reconciliation
- `spec/profiles/transaction/transaction-event.md` — TransactionEvent with `offlineTxId`, `txCounter`
- `spec/profiles/core/boot-notification.md` — BootNotification on reconnect
- `spec/profiles/core/status-notification.md` — Bay state sync after reconnect
- `spec/07-errors.md` §5.1 — MQTT connection recovery and event replay
- `schemas/mqtt/transaction-event-request.schema.json`
- `schemas/mqtt/transaction-event-response.schema.json`
- `schemas/common/receipt.schema.json`

## Preconditions

1. Station has been operating offline and has completed 3 offline BLE sessions:
   - **TX-A:** `offlineTxId: "otx_a1b2c3d4e5f6"`, `txCounter: 5`, `creditsCharged: 9`.
   - **TX-B:** `offlineTxId: "otx_b2c3d4e5f6a7"`, `txCounter: 6`, `creditsCharged: 12`.
   - **TX-C:** `offlineTxId: "otx_c3d4e5f6a7b8"`, `txCounter: 7`, `creditsCharged: 6`.
2. Each transaction has a signed receipt (ECDSA-P256-SHA256 with station private key).
3. The server has the station's ECDSA public key for receipt verification.
4. The server knows the station's last reconciled `txCounter` is `4`.
5. The user's wallet balance on the server is `50.0` credits.
6. The MQTT broker is now reachable (connectivity restored).

## Steps

### Part A — Reconnection and BootNotification

1. Restore MQTT connectivity for the station.
2. Observe the station establishes a TLS connection and MQTT session.
3. Observe the station sends BootNotification.
4. Verify the BootNotification payload is valid.
5. Send BootNotification Accepted with `heartbeatIntervalSec` and `serverTime`.
6. Observe StatusNotification for each bay (reporting current bay states after offline period).

### Part B — Buffered Transaction Replay

7. Observe the station sends TransactionEvent(Ended) for TX-A:
   ```json
   {
     "offlineTxId": "otx_a1b2c3d4e5f6",
     "offlinePassId": "<offline_pass_id>",
     "userId": "<user_id>",
     "bayId": "bay_a1b2c3d4",
     "serviceId": "svc_basic",
     "startedAt": "<ISO 8601>",
     "endedAt": "<ISO 8601>",
     "durationSeconds": 120,
     "creditsCharged": 9,
     "receipt": { "data": "<canonical payload>", "signature": "<ECDSA sig>", "signatureAlgorithm": "ECDSA-P256-SHA256" },
     "txCounter": 5
   }
   ```
8. Verify TX-A is received BEFORE TX-B and TX-C (ordered by `txCounter`).
9. Server validates:
   - `txCounter` (5) == station's last reconciled counter (4) + 1 (no gap).
   - Receipt signature (ECDSA-P256-SHA256) is valid.
10. Respond to TX-A: `{ "status": "Accepted" }`.
11. Observe TransactionEvent(Ended) for TX-B (`txCounter: 6`).
12. Verify `txCounter` (6) == previous txCounter (5) + 1 (no gap).
13. Verify receipt signature for TX-B.
14. Respond Accepted.
15. Observe TransactionEvent(Ended) for TX-C (`txCounter: 7`).
16. Verify the complete txCounter sequence: 4(known) -> 5 -> 6 -> 7 (no gaps).
17. Verify receipt signature for TX-C.
18. Respond Accepted.

### Part C — Deduplication

19. Simulate a network interruption: drop the MQTT connection after TX-C is sent but before the station receives the Accepted response.
20. Restore connectivity.
21. Observe the station reconnects and sends BootNotification again.
22. Respond Accepted.
23. Observe the station retransmits TX-C (`offlineTxId: "otx_c3d4e5f6a7b8"`).
24. Server detects `offlineTxId: "otx_c3d4e5f6a7b8"` has already been processed.
25. Respond Accepted (idempotent — no re-processing).
26. Verify the station marks TX-C as reconciled and does NOT retransmit it again.

### Part D — Billing Reconciliation

27. After all 3 transactions are reconciled, verify the server calculates total offline charges:
    - TX-A: 9 credits + TX-B: 12 credits + TX-C: 6 credits = **27 credits total**.
28. Verify the server debits the user's wallet: `50.0 - 27 = 23.0` credits remaining.
29. Verify the server stores each transaction with its receipt for audit purposes.

### Part E — txCounter Gap Detection (Negative Test)

30. Simulate a missing transaction: inject a TransactionEvent with `txCounter: 9` (skipping 8) after the last reconciled counter was 7.
31. Server detects the txCounter gap (expected 8, received 9).
32. Verify the server flags this transaction for fraud investigation (does not auto-accept).
33. Verify the server logs a security alert indicating a txCounter gap (possible deleted transaction).

### Part F — Negative Balance Handling

34. Set up a scenario where the user's wallet has `5.0` credits remaining.
35. Reconcile an offline transaction with `creditsCharged: 12`.
36. Verify the server allows the debit (negative balance permitted per spec: "allows negative balance").
37. Verify the user's wallet is now `-7.0` credits.
38. Verify the server triggers a top-up reminder notification for the user.

## Expected Results

1. Station sends BootNotification on reconnect, followed by StatusNotification for each bay.
2. Buffered TransactionEvents are sent in strict `txCounter` order (ascending).
3. Each transaction's `txCounter` increments by exactly 1 from the previous (no gaps).
4. All receipt signatures (ECDSA-P256-SHA256) are valid when verified with the station's public key.
5. Duplicate `offlineTxId` submissions are handled idempotently (Accepted without re-processing).
6. The server correctly calculates total charges and debits the user's wallet.
7. A txCounter gap is detected and flagged for fraud investigation.
8. Negative wallet balances are permitted; the server notifies the user to top up.

## Failure Criteria

1. Station does not send BootNotification on reconnect.
2. Buffered transactions are sent out of `txCounter` order.
3. `txCounter` sequence has unexpected gaps for legitimate transactions.
4. Receipt signature verification fails for legitimate (non-tampered) receipts.
5. Duplicate `offlineTxId` causes double-billing (deducted twice from wallet).
6. Server does not detect a txCounter gap on a missing transaction.
7. Server rejects a transaction that would cause a negative wallet balance (should allow it).
8. Station does not retransmit unacknowledged transactions after a reconnection.
9. Total wallet deduction does not match the sum of `creditsCharged` across all reconciled transactions.
