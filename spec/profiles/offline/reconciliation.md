# Offline Transaction Reconciliation

> **Status:** Draft

## 1. Overview

When a station regains connectivity after operating offline, it **MUST** synchronize all offline transactions with the server. This process ensures accurate billing, detects potential fraud, and maintains ledger consistency. Reconciliation uses the existing TransactionEvent action with additional offline-specific fields (`offlineTxId`, `txCounter`, and a signed `receipt`).

## 2. Sync Procedure

The reconciliation sync follows this ordered flow:

1. **Station reconnects** and sends a BootNotification with `pendingOfflineTransactions` > 0.
2. **Server acknowledges** with `Accepted`. The server notes the pending count and prepares for incoming offline transaction events.
3. **Station sends TransactionEvent(Ended)** for each offline transaction, ordered by `txCounter` (ascending). Each event includes the full offline payload: `offlineTxId`, `offlinePassId`, `userId`, `bayId`, `serviceId`, timing data, `creditsCharged`, signed `receipt`, `txCounter`, and optional `meterValues`.
4. **Server processes each event** -- performs deduplication, txCounter gap detection, receipt signature verification, and fraud scoring. The server responds with `Accepted` for each valid event.
5. **Station marks synced transactions** as reconciled in its local storage. Successfully synced transactions **MAY** be purged from local storage after 72 hours.

**Retry logic:** If the station does not receive a response within 30 seconds for any TransactionEvent, it **MUST** retry with exponential backoff (initial 5s, max 60s (offline batch reconciliation -- optimized for throughput), up to 10 retries). If all retries fail, the station **MUST** retain the transaction and attempt sync on the next successful connection.

> **Note:** This profile uses a shorter response timeout (30s) than the standard TransactionEvent timeout (60s). During reconciliation, the server performs validation, deduplication, and record-keeping but does not make external payment authorization calls, allowing faster processing. The shorter timeout optimizes batch upload throughput when clearing large offline queues.

**Ordering guarantee:** The station **MUST** send offline transactions in strict `txCounter` order. The server **MUST** reject out-of-order transactions with error `1005 INVALID_MESSAGE_FORMAT` until the missing transactions are received.

## 3. Deduplication (offlineTxId)

The server uses the `offlineTxId` field to deduplicate offline transaction events:

1. Each offline transaction is assigned a unique `offlineTxId` (format: `otx_` prefix + random alphanumeric) by the station at the time of service start.
2. When the server receives a TransactionEvent with an `offlineTxId`, it checks whether a transaction with that ID has already been processed.
3. If the `offlineTxId` already exists in the server's ledger, the server **MUST** respond with `Accepted` without re-processing (idempotent acknowledgement). This handles retransmission after network failures.
4. The server **MUST** retain `offlineTxId` values for at least 30 days for deduplication purposes.

## 4. Transaction Counter Verification

### 4.1 txCounter

The station maintains a monotonically increasing transaction counter per station:

1. The counter starts at 1 for the first offline transaction after a station boot or sync.
2. The counter increments by exactly 1 for each subsequent offline transaction.
3. The server verifies that received `txCounter` values form a contiguous sequence with no gaps.
4. **Gaps in the counter** indicate missing transactions -- this is a HIGH-severity fraud signal. The server **MUST** flag the gap and defer reconciliation of subsequent transactions until the missing ones are received or the gap is manually resolved.

### 4.2 txCounter Gap Detection

The server detects missing offline transactions by monitoring `txCounter` continuity:

1. For each station, the server tracks the last successfully reconciled `txCounter` value.
2. When a TransactionEvent arrives, the server compares its `txCounter` to `lastReconciledCounter + 1`.
3. If `txCounter` equals `lastReconciledCounter + 1`, the sequence is intact and the server proceeds normally.
4. If `txCounter` is greater than `lastReconciledCounter + 1`, the server **MUST** flag the gap, log a SecurityEvent, and defer reconciliation of subsequent transactions until the missing ones are received or the gap is manually resolved.
5. If `txCounter` is less than or equal to `lastReconciledCounter`, the server **MUST** treat it as a duplicate or replay and respond with `Duplicate`.

## 5. Receipt Signature Verification

The server verifies the ECDSA-P256-SHA256 signature on each offline transaction receipt:

1. The server retrieves the station's ECDSA P-256 public key from the station registry (provisioned during manufacturing or BootNotification).
2. The server reconstructs the canonical receipt payload by Base64-decoding the `receipt.data` field.
3. The server verifies the `receipt.signature` (Base64-decoded) against the reconstructed payload using ECDSA-P256-SHA256.
4. **Invalid signatures** are a CRITICAL-severity fraud signal. The server **MUST** immediately flag the transaction, log a SecurityEvent (`type: "OfflinePassRejected"`), and **MAY** disable offline mode for the affected station until manual investigation is complete.

## 6. Fraud Detection

The server **MUST** apply a fraud scoring model to each reconciled offline transaction. The following signals contribute to the fraud score:

| Signal | Severity | Score | Description |
|------------------------------------------|----------|:-----:|-----------------------------------------------|
| Invalid receipt signature | Critical | 100 | Receipt was not signed by the station's key. Immediate flag. |
| txCounter gap | High | 80 | Missing transactions in the counter sequence. |
| Expired pass used | Low | 20 | Pass `expiresAt` was before the transaction timestamp. May indicate clock drift. |
| Credits exceed `maxCreditsPerTx` | Medium | 50 | Transaction charged more than the pass allows per session. |
| Rapid consecutive transactions | Medium | 40 | Transactions spaced less than `minIntervalSec` apart. |
| Usage beyond `maxUses` | Medium | 50 | More transactions than `maxUses` for the same pass. |
| Credits beyond `maxTotalCredits` | Medium | 50 | Cumulative credits exceed the pass limit. |

**Scoring thresholds:**

| Total Score | Action |
|:-----------:|-----------------------------------------------|
| >= 100 | **Automatic:** disable offline mode for the station, revoke user's OfflinePass, notify operator immediately. |
| 50 -- 99 | **Automatic:** flag for manual operator review within 24 hours. Continue accepting transactions but log enhanced audit data. |
| < 50 | **Automatic:** log and accept. No immediate action required. |

## 7. Wallet Reconciliation

After a transaction passes fraud scoring, the server debits the user's wallet:

1. The server reads the `creditsCharged` from the transaction event.
2. The server debits the user's server-side wallet balance by `creditsCharged`.
3. **Negative balance is allowed.** The server **MUST NOT** reject a debit that would result in a negative balance. This prevents service denial for legitimate users who consumed more credits offline than expected.
4. The user is notified of the charges upon the next app open or push notification.
5. If the user's balance goes negative, the server **MUST** trigger a top-up reminder. The user's account **MAY** be restricted from future offline pass issuance until the balance is positive.

## 8. Conflict Resolution

The following edge cases require special handling:

| Scenario | Resolution |
|------------------------------------------------------|-----------------------------------------------|
| Same session reported by both app and station | **Prefer station data.** The station's signed receipt is the authoritative record. The app's record is used for display purposes only. |
| Duplicate `offlineTxId` with different data | **Flag for investigation.** This indicates either a collision (extremely unlikely with UUID-quality IDs) or data tampering. The server **MUST** retain both records and alert the operator. |
| Clock drift between station and server | **Use server time for billing, station time for audit.** The `startedAt` and `endedAt` timestamps from the station are stored for audit, but the server's receipt processing time is used for wallet debit timing. |
| Station replaced/reset between offline period and sync | **Use hardware serial number for identity.** If the station's `stationId` matches but the serial number differs (detected via BootNotification), the server **MUST** flag all pending offline transactions from the old serial for manual review. |
| Station offline window exceeded | If the station has been offline for longer than `stationOfflineWindowHours`, the server **SHOULD** accept the transactions but flag them for enhanced review. |

## 9. Example (TransactionEvent for Offline Reconciliation)

```json
{
  "messageId": "msg_b7c8d9e0-f1a2-3456-abcd-789012345def",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T10:15:30.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "offlineTxId": "otx_d4e5f6a7",
    "offlinePassId": "opass_a8b9c0d1e2f3",
    "userId": "sub_9a8b7c6d",
    "bayId": "bay_a1b2c3d4",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T09:52:00.000Z",
    "endedAt": "2026-02-13T09:56:45.000Z",
    "durationSeconds": 285,
    "creditsCharged": 48,
    "receipt": {
      "data": "eyJ0eElkIjoib3R4X2Q0ZTVmNmE3IiwiY3JlZGl0cyI6NDh9",
      "signature": "MEUCIQDtjLkM5bXhZA1rQ7vYzN0cBpL2hUwF9jD6tG3nKm4xRgIgWpRf8sT2aHb3cKdV5eYnM6jLqNwO7xPzU1iS0kA9vE=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 5,
    "meterValues": {
      "liquidMl": 42800,
      "consumableMl": 470,
      "energyWh": 138
    }
  }
}
```

## 10. Related Schemas

- TransactionEvent Request: [`transaction-event-request.schema.json`](../../../schemas/mqtt/transaction-event-request.schema.json)
- TransactionEvent Response: [`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json)
- Receipt: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md)
- Security model: [Chapter 06 — Security](../../06-security.md) (section 7, Fraud Detection)
