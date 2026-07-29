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

### Part E — txCounter Discontinuity Settles Normally (Positive Test)

Parts A-D leave the server holding recorded counters 5, 6, 7 for this station and the user's wallet at `23.0` credits. This part verifies the §4.2 rule directly: the counter is recorded, it gates nothing, and money is never withheld on its account.

**E.1 — Forward discontinuity (a transaction is genuinely missing)**

30. Inject a TransactionEvent with `offlineTxId: "otx_d4e5f6a7b8c9"`, `txCounter: 9` (skipping 8), `creditsCharged: 8`, and a valid receipt signature.
31. Verify the server responds `{ "status": "Accepted" }`. The server **MUST NOT** withhold, hold, or re-order the transaction on counter grounds, and **MUST NOT** make any response status conditional on the counter (`reconciliation.md` §4.2 step 2).
32. Verify the money is recorded: the wallet moves `23.0 - 8 = 15.0`, and the transaction is persisted with `txCounter: 9` and its receipt.
33. Verify an **operator alert on the station** is raised, recording the discontinuity (expected 8, received 9).
34. Verify the discontinuity contributes **nothing** to the transaction's fraud score, and triggers no user-facing sanction (no offline-mode disable, no pass revocation, no account block). It is a station-fault signal, not a user-fraud signal (`06-security.md` §7.4).
35. Verify the response body carries `status` and `reason` only — the schema is closed, and no error code is emitted for this condition (`07-errors.md` `1005` is **not** applicable).

**E.2 — Counter reset after a station reboot**

This is the path that destroyed money before 0.9.0: §4.1 step 1 resets the counter on boot, and the retired §4.2 step 5 answered a counter at-or-below the watermark with `Duplicate`, which obliges the station to delete its local copy.

36. Simulate a station reboot. The station restarts its counter at 1 and sends a **new, never-settled** transaction: `offlineTxId: "otx_e5f6a7b8c9d0"`, `txCounter: 1`, `creditsCharged: 5`, valid receipt signature.
37. Verify the server responds `{ "status": "Accepted" }` — **not** `Duplicate`. The counter is at or below every counter previously recorded for this station, and the transaction is nonetheless new and unsettled. `Duplicate` here would direct the station to delete a payment the server never recorded.
38. Verify the wallet moves `15.0 - 5 = 10.0` and the transaction is persisted with `txCounter: 1`.
39. Verify deduplication still works on its own key: re-send the same `offlineTxId` and confirm it is answered idempotently without a second debit.

### Part F — Negative Balance Handling

40. Set up a scenario where the user's wallet has `5.0` credits remaining.
41. Reconcile an offline transaction with `creditsCharged: 12`.
42. Verify the server allows the debit (negative balance permitted per spec: "allows negative balance").
43. Verify the user's wallet is now `-7.0` credits.
44. Verify the server triggers a top-up reminder notification for the user.

## Expected Results

1. Station sends BootNotification on reconnect, followed by StatusNotification for each bay.
2. Buffered TransactionEvents are sent in ascending `txCounter` order. This is RECOMMENDED, not required — out-of-order arrival is not a conformance failure.
3. The server records each `txCounter` and settles every transaction on its own merits. No response status is conditional on the counter's value, its continuity, or its ordering.
4. All receipt signatures (ECDSA-P256-SHA256) are valid when verified with the station's public key.
5. Duplicate `offlineTxId` submissions are handled idempotently (Accepted without re-processing).
6. The server correctly calculates total charges and debits the user's wallet.
7. A transaction whose `txCounter` is discontinuous with the station's recorded history is settled normally, its money recorded, and an operator alert raised **on the station** — contributing nothing to the user's fraud score.
8. A transaction whose `txCounter` is at or below previously recorded counters (station reboot) is settled and **never** answered `Duplicate`. Deduplication is keyed on `offlineTxId`, not on the counter.
9. Negative wallet balances are permitted; the server notifies the user to top up.

## Failure Criteria

1. Station does not send BootNotification on reconnect.
2. The server withholds, holds, re-orders, or answers `Duplicate` on `txCounter` grounds. A station that reboots legitimately restarts its counter at 1 (`reconciliation.md` §4.1), and `Duplicate` directs the station to delete its local copy — so gating on the counter destroys a payment that was never settled.
3. The station's `txCounter` is discontinuous across legitimate transactions, indicating it failed to persist the counter. This is a **station** defect and is reported to the operator as one; it is never a reason for the server to withhold settlement.
4. Receipt signature verification fails for legitimate (non-tampered) receipts.
5. Duplicate `offlineTxId` causes double-billing (deducted twice from wallet).
6. Server answers `Duplicate` to a new, unsettled transaction because its `txCounter` is at or below a previously recorded counter — this destroys the payment, since `Duplicate` obliges the station to delete its local copy.
7. Server accepts a discontinuous counter **silently**, raising no operator alert. The counter's whole remaining purpose is forensic; recording it without surfacing a discontinuity loses the only value it still has.
8. Server rejects a transaction that would cause a negative wallet balance (should allow it).
9. Station does not retransmit unacknowledged transactions after a reconnection.
10. Total wallet deduction does not match the sum of `creditsCharged` across all reconciled transactions.
