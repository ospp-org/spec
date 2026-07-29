# TC-OFF-003 — Reconciliation: Server-Side Processing

## Profile

Offline/BLE Profile

## Purpose

Verify that when a station reconnects to the server after an offline period, it correctly sends buffered offline transactions via TransactionEvent, the server deduplicates by `offlineTxId`, receipt signatures are validated, the `txCounter` is recorded as forensic evidence **without gating any outcome**, and wallet billing reconciliation is performed accurately.

## References

- `spec/profiles/offline/reconciliation.md` — Sync procedure, deduplication, §4.2 (txCounter is forensic and gates nothing), fraud detection, wallet reconciliation
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
4. The server has previously recorded `txCounter: 4` for this station (forensic history only — the server keeps no watermark and does not compare against it).
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
  "receipt": {
    "data": "eyJiYXlJZCI6ImJheV9hMWIyYzNkNCIsImNyZWRpdHNDaGFyZ2VkIjo5LCJkZXZpY2VJZCI6ImRldl9hMWIyYzNkNCIsImR1cmF0aW9uU2Vjb25kcyI6MTIwLCJlbmRlZEF0IjoiPElTTyA4NjAxPiIsIm9mZmxpbmVQYXNzSWQiOiI8b2ZmbGluZV9wYXNzX2lkPiIsIm9mZmxpbmVUeElkIjoib3R4X2ExYjJjM2Q0ZTVmNiIsInBhc3NDb3VudGVyIjo0LCJzZXJ2aWNlSWQiOiJzdmNfYmFzaWMiLCJzdGFydGVkQXQiOiI8SVNPIDg2MDE+IiwidHhDb3VudGVyIjo1LCJ1c2VySWQiOiI8dXNlcl9pZD4ifQ==",
    "signature": "MEUCIQCsMDPQTOWl3u/ls+JQDzkFOzIz7uPMfdh8ZjyLQruNXAIgD5bMlaoIDgvtm8cdLDFLa/mL5iHNV3PABekcuJxqDJQ=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5,
  "deviceId": "dev_a1b2c3d4",
  "passCounter": 4
}
```
8. Observe the arrival order. Ascending `txCounter` is RECOMMENDED, so TX-A is expected first — but arrival order is **not** a pass/fail condition here (`reconciliation.md` §2).
9. Server validates:
   - Receipt signature (ECDSA-P256-SHA256) is valid — this is the check that gates.
   - `txCounter` (5) is recorded on the transaction row. Verify the server does **not** compare it to any prior counter and does **not** condition its response on it.
10. Respond to TX-A: `{ "status": "Accepted" }`.
11. Observe TransactionEvent(Ended) for TX-B (`txCounter: 6`).
12. Verify `txCounter` (6) is recorded, and that the response would be identical had it been any other value.
13. Verify receipt signature for TX-B.
14. Respond Accepted.
15. Observe TransactionEvent(Ended) for TX-C (`txCounter: 7`).
16. Verify the complete recorded sequence 4 -> 5 -> 6 -> 7 is available to an operator as forensic history.
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

### Part E — Negative Balance Handling

30. Set up a scenario where the user's wallet has `5.0` credits remaining.
31. Reconcile an offline transaction with `creditsCharged: 12`.
32. Verify the server allows the debit (negative balance permitted per spec: "allows negative balance").
33. Verify the user's wallet is now `-7.0` credits.
34. Verify the server triggers a top-up reminder notification for the user.

## Expected Results

1. Station sends BootNotification on reconnect, followed by StatusNotification for each bay.
2. Buffered TransactionEvents are sent in ascending `txCounter` order. This is RECOMMENDED, not required — out-of-order arrival is not a conformance failure.
3. The server records each `txCounter` and settles every transaction on its own merits. No response status is conditional on the counter's value, its continuity, or its ordering.
4. All receipt signatures (ECDSA-P256-SHA256) are valid when verified with the station's public key.
5. Duplicate `offlineTxId` submissions are handled idempotently (Accepted without re-processing).
6. The server correctly calculates total charges and debits the user's wallet.
7. Negative wallet balances are permitted; the server notifies the user to top up.

## Failure Criteria

1. Station does not send BootNotification on reconnect.
2. The server withholds, holds, re-orders, or answers `Duplicate` on `txCounter` grounds. A station that reboots legitimately restarts its counter at 1 (`reconciliation.md` §4.1), and `Duplicate` directs the station to delete its local copy — so gating on the counter destroys a payment that was never settled.
3. The station's `txCounter` is discontinuous across legitimate transactions, indicating it failed to persist the counter. This is a **station** defect and is reported to the operator as one; it is never a reason for the server to withhold settlement.
4. Receipt signature verification fails for legitimate (non-tampered) receipts.
5. Duplicate `offlineTxId` causes double-billing (deducted twice from wallet).
6. Server rejects a transaction that would cause a negative wallet balance (should allow it).
7. Station does not retransmit unacknowledged transactions after a reconnection.
8. Total wallet deduction does not match the sum of `creditsCharged` across all reconciled transactions.
