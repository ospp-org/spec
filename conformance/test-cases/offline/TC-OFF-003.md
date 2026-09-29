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
7. The tariff of each service is set so that the server's recomputation of every transaction in this case, from its signed receipt, equals the `creditsCharged` the station reports, and so that each transaction stays within its pass's `maxCreditsPerTx` and what remains of its `maxTotalCredits`. The server settles on its recomputation, capped by the pass limits, and never on the station's figure ([`reconciliation.md` §8, §8.1](../../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)); this precondition is what lets the arithmetic below use the station's figures.

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
    "data": "eyJiYXlJZCI6ImJheV9hMWIyYzNkNCIsImJvb2tlZER1cmF0aW9uU2Vjb25kcyI6MTIwLCJjbG9ja1N0YXRlIjoiU3luY2hyb25pemVkIiwiY3JlZGl0c0NoYXJnZWQiOjksImRldmljZUlkIjoiZGV2X2ExYjJjM2Q0IiwiZHVyYXRpb25TZWNvbmRzIjoxMjAsImVuZFJlYXNvbiI6IlRpbWVyRXhwaXJlZCIsImVuZGVkQXQiOiI8SVNPIDg2MDE+Iiwib2ZmbGluZVBhc3NJZCI6IjxvZmZsaW5lX3Bhc3NfaWQ+Iiwib2ZmbGluZVR4SWQiOiJvdHhfYTFiMmMzZDRlNWY2IiwicGFzc0NvdW50ZXIiOjQsInNlcnZpY2VJZCI6InN2Y19iYXNpYyIsInN0YXJ0ZWRBdCI6IjxJU08gODYwMT4iLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjUsInVzZXJJZCI6Ijx1c2VyX2lkPiJ9",
    "signature": "MEUCIQDBa4eOuZTZuAR6tLM413cIwbXrSHVXSHFW4KWPnx5vEQIgEEaypb3N9YaIFacW4habNzcOcV5baO6kxsAKiuJa83E=",
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
24. Server detects `offlineTxId: "otx_c3d4e5f6a7b8"` has already been processed, and compares the arriving signed `receipt.data` against the stored one. They are byte-identical — this is the same transaction arriving twice.
25. Respond `Duplicate` (idempotent — no re-processing, no second debit), with a `reason`; `reason` is REQUIRED on `Duplicate`.
26. Verify the station does NOT retransmit TX-C again, and deletes its local record of it — a deletion it **MAY** defer by up to 72 hours ([`transaction-event.md` §5.1](../../../spec/profiles/transaction/transaction-event.md#51-response-status-values)).
27. **Different data under the same identifier.** Re-send `offlineTxId: "otx_c3d4e5f6a7b8"` a third time, this time carrying a **different** signed receipt — a validly signed receipt for the same `offlineTxId` whose `creditsCharged` differs from the stored one.
28. Verify the server responds `Rejected`, does **not** debit the wallet a second time, and does **not** overwrite the stored record. Two distinct claims under one identifier is a collision or tampering (`reconciliation.md` §3, §9).
29. Verify the server **retains both records** and raises an operator alert, and emits an `OfflinePassRejected` SecurityEvent whose `details` carry `errorCode` `2017` and `field: "receipt.data"`.
30. Verify the station **retains** its local copy, marked rejected — `Rejected` never orders a deletion, and that copy is the second of the two records the operator compares.

### Part D — Billing Reconciliation

31. After all 3 transactions are reconciled, verify the server settles each at its own recomputation from the signed receipt — by service kind on the signed `endReason`, from `durationSeconds` or `bookedDurationSeconds` — capped by the pass limits ([`reconciliation.md` §8.1](../../../spec/profiles/offline/reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)). Under Precondition 7 the totals are:
    - TX-A: 9 credits + TX-B: 12 credits + TX-C: 6 credits = **27 credits total**.
32. Verify the server debits the user's wallet: `50.0 - 27 = 23.0` credits remaining.
33. Verify the server stores each transaction with its receipt for audit purposes.

### Part E — txCounter Discontinuity Settles Normally (Positive Test)

Parts A-D leave the server holding recorded counters 5, 6, 7 for this station and the user's wallet at `23.0` credits. This part verifies the §4.2 rule directly: the counter is recorded, it gates nothing, and money is never withheld on its account.

**E.1 — Forward discontinuity (a transaction is genuinely missing)**

34. Inject a TransactionEvent with `offlineTxId: "otx_d4e5f6a7b8c9"`, `txCounter: 9` (skipping 8), `creditsCharged: 8`, and a valid receipt signature.
35. Verify the server responds `{ "status": "Accepted" }`. The server **MUST NOT** withhold, hold, or re-order the transaction on counter grounds, and **MUST NOT** make any response status conditional on the counter (`reconciliation.md` §4.2 step 2).
36. Verify the money is recorded: the wallet moves `23.0 - 8 = 15.0`, and the transaction is persisted with `txCounter: 9` and its receipt.
37. Verify an **operator alert on the station** is raised, recording the discontinuity (expected 8, received 9).
38. Verify the discontinuity contributes **nothing** to the transaction's fraud score, and triggers no user-facing sanction (no offline-mode disable, no pass revocation, no account block). It is a station-fault signal, not a user-fraud signal (`06-security.md` §7.4).
39. Verify the response body carries `status` and `reason` only — the schema is closed, and no error code is emitted for this condition (`07-errors.md` `1005` is **not** applicable).

**E.2 — Counter restart after a lost store or a replaced board**

This is the path that destroyed money before 0.9.0, when a retired rule of §4.2 answered a counter at-or-below the watermark with `Duplicate`, which obliges the station to delete its local copy. The counter continues across reboots and across syncs ([`reconciliation.md` §4.1](../../../spec/profiles/offline/reconciliation.md#41-txcounter)); a station whose store was lost or whose board was replaced starts it again at 1 ([`reconciliation.md` §4](../../../spec/profiles/offline/reconciliation.md#4-transaction-counter-forensic)).

40. Simulate a station whose store was lost, or whose board was replaced. The station restarts its counter at 1 and sends a **new, never-settled** transaction: `offlineTxId: "otx_e5f6a7b8c9d0"`, `txCounter: 1`, `creditsCharged: 5`, valid receipt signature.
41. Verify the server responds `{ "status": "Accepted" }` — **not** `Duplicate`. The counter is at or below every counter previously recorded for this station, and the transaction is nonetheless new and unsettled. `Duplicate` here would direct the station to delete a payment the server never recorded.
42. Verify the wallet moves `15.0 - 5 = 10.0` and the transaction is persisted with `txCounter: 1`.
43. Verify deduplication still works on its own key: re-send the same `offlineTxId` with the same signed receipt and confirm it is answered `Duplicate` without a second debit.

### Part F — Negative Balance Handling

44. Set up a scenario where the user's wallet has `5.0` credits remaining.
45. Reconcile an offline transaction with `creditsCharged: 12`.
46. Verify the server allows the debit: a debit that would result in a negative balance is not rejected ([`reconciliation.md` §8.1](../../../spec/profiles/offline/reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)).
47. Verify the user's wallet is now `-7.0` credits.
48. Verify the server triggers a top-up reminder notification for the user, records the transaction as **pending collection** — collected by neither the station's tenant nor the platform until the user next tops up — and issues the user no offline pass while the balance is below zero ([`reconciliation.md` §8.1](../../../spec/profiles/offline/reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)).

## Expected Results

1. Station sends BootNotification on reconnect, followed by StatusNotification for each bay.
2. Buffered TransactionEvents are sent in ascending `txCounter` order. This is RECOMMENDED, not required — out-of-order arrival is not a conformance failure.
3. The server records each `txCounter` and settles every transaction on its own merits. No response status is conditional on the counter's value, its continuity, or its ordering.
4. All receipt signatures (ECDSA-P256-SHA256) are valid when verified with the station's public key.
5. A retransmission of the same transaction — same `offlineTxId`, byte-identical signed `receipt.data` — is answered `Duplicate` without re-processing, and the station deletes its copy. A **different** signed receipt under an `offlineTxId` the server already holds is answered `Rejected`, both records are retained, an operator alert is raised, and the station keeps its copy.
6. The server settles each transaction at its own recomputation from the signed receipt, capped by the pass limits, and debits the user's wallet by the settled amounts.
7. A transaction whose `txCounter` is discontinuous with the station's recorded history is settled normally, its money recorded, and an operator alert raised **on the station** — contributing nothing to the user's fraud score.
8. A transaction whose `txCounter` is at or below previously recorded counters (a station whose store was lost or whose board was replaced) is settled and **never** answered `Duplicate`. Deduplication is keyed on `offlineTxId`, not on the counter.
9. Negative wallet balances are permitted; the transaction whose debit took the wallet below zero stays pending until the user next tops up, the server notifies the user to top up, and it issues no offline pass while the balance is below zero.

## Failure Criteria

1. Station does not send BootNotification on reconnect.
2. The server withholds, holds, re-orders, or answers `Duplicate` on `txCounter` grounds. A station whose store was lost or whose board was replaced legitimately restarts its counter at 1 (`reconciliation.md` §4), and `Duplicate` directs the station to delete its local copy — so gating on the counter destroys a payment that was never settled.
3. The station's `txCounter` is discontinuous across legitimate transactions, indicating it failed to persist the counter. This is a **station** defect and is reported to the operator as one; it is never a reason for the server to withhold settlement.
4. Receipt signature verification fails for legitimate (non-tampered) receipts.
5. Duplicate `offlineTxId` causes double-billing (deducted twice from wallet).
6. A second, **differing** signed receipt under an existing `offlineTxId` is answered `Duplicate`, or silently overwrites the stored record, or is answered without retaining both records. `Duplicate` orders the station to delete its copy, which destroys one of the two records the comparison needs.
7. Server answers `Duplicate` to a new, unsettled transaction because its `txCounter` is at or below a previously recorded counter — this destroys the payment, since `Duplicate` obliges the station to delete its local copy.
8. Server accepts a discontinuous counter **silently**, raising no operator alert. The counter's whole remaining purpose is forensic; recording it without surfacing a discontinuity loses the only value it still has.
9. Server rejects a transaction that would cause a negative wallet balance (should allow it).
10. Station does not retransmit unacknowledged transactions after a reconnection.
11. Total wallet deduction does not match the sum of the server's recomputed, capped amounts across all reconciled transactions — equal here, by Precondition 7, to the sum of the reported `creditsCharged`.
12. The server expires, writes off or collects by any other route a transaction left pending below zero before the user tops up, or issues the user an offline pass while the balance is below zero.
