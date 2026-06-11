# Offline Transaction Reconciliation

> **Status:** Draft | **OSPP Version:** 0.5.0

## 1. Overview

When a station regains connectivity after operating offline, it **MUST** synchronize all offline transactions with the server. This process ensures accurate billing, detects potential fraud, and maintains ledger consistency. Reconciliation uses the existing TransactionEvent action with additional offline-specific fields (`offlineTxId`, `txCounter`, and a signed `receipt`).

## 2. Sync Procedure

The reconciliation sync follows this ordered flow:

1. **Station reconnects** and sends a BootNotification with `pendingOfflineTransactions` > 0.
2. **Server acknowledges** with `Accepted`. The server notes the pending count and prepares for incoming offline transaction events.
3. **Station sends TransactionEvent(Ended)** for each offline transaction, ordered by `txCounter` (ascending). Each event includes the full offline payload: `offlineTxId`, `offlinePassId`, `userId`, `bayId`, `serviceId`, timing data, `creditsCharged`, signed `receipt`, `txCounter`, and optional `meterValues`.
4. **Server processes each event** -- performs (a) deduplication (§3), (b) txCounter gap detection (§4), (c) receipt signature verification (§5), (d) **reconcile-time re-validation gate (§6)**, and (e) fraud scoring (§7). The server responds with `Accepted` for each valid event. Any gate failure (§6) produces a `Rejected` response with the listed error code and emits a SecurityEvent.
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
4. **Gaps in the counter** indicate missing transactions -- this is a HIGH-severity fraud signal. The server **MUST** flag the gap and defer reconciliation of subsequent transactions until the missing ones are received or the gap is manually resolved. The wire response on this path is `status: "Deferred"` (see §4.2 step 4).

### 4.2 txCounter Gap Detection

The server detects missing offline transactions by monitoring `txCounter` continuity:

1. For each station, the server tracks the last successfully reconciled `txCounter` value.
2. When a TransactionEvent arrives, the server compares its `txCounter` to `lastReconciledCounter + 1`.
3. If `txCounter` equals `lastReconciledCounter + 1`, the sequence is intact and the server proceeds normally.
4. If `txCounter` is greater than `lastReconciledCounter + 1`, the server **MUST** flag the gap, log a SecurityEvent, and defer reconciliation of subsequent transactions until the missing ones are received or the gap is manually resolved. The wire response **MUST** be:

   ```json
   {
     "status": "Deferred",
     "reason": "<short human-readable explanation referencing the gap>"
   }
   ```

   `Deferred` is distinct from `RetryLater` in semantics: `RetryLater` directs the station to back off and re-send the same transaction (transient server condition); `Deferred` directs the station that the transaction is held server-side pending operator-manual unblock or arrival of the missing in-sequence transactions, and the station **MUST NOT** auto-resend the same offline transaction. Re-arrivals of a previously-deferred `offlineTxId` **MUST** continue to return `Deferred` (without re-emitting the `§4.2:52` SecurityEvent) until the operator-manual unblock occurs.
5. If `txCounter` is less than or equal to `lastReconciledCounter`, the server **MUST** treat it as a duplicate or replay and respond with `Duplicate`.

## 5. Receipt Signature Verification

The server verifies the ECDSA-P256-SHA256 signature on each offline transaction receipt:

1. The server retrieves the station's ECDSA P-256 public key from the station registry (provisioned during manufacturing or BootNotification).
2. The server reconstructs the canonical receipt payload by Base64-decoding the `receipt.data` field.
3. The server verifies the `receipt.signature` (Base64-decoded) against the reconstructed payload using ECDSA-P256-SHA256.
4. **Invalid signatures** are a CRITICAL-severity fraud signal. The server **MUST** immediately flag the transaction, log a SecurityEvent (`type: "OfflinePassRejected"`), and **MAY** disable offline mode for the affected station until manual investigation is complete.

## 6. Reconcile-Time Re-validation Gate

Before fraud scoring (§7) and wallet reconciliation (§8), the server **MUST** apply a deterministic **hard-reject gate** to every TransactionEvent. This gate is distinct from fraud scoring: it consists of confirmed security-property violations (not probabilistic signals), and each failure **MUST** result in `Rejected` status, no persistence, no wallet debit, and a `SecurityEvent` emission (per §6.3). The gate runs after receipt signature verification (§5) and before fraud scoring (§7).

### 6.1 Check List

The server **MUST** apply the 11 checks below in the listed dependency-ordered canonical order. Processing **MUST** stop at the first failure. Checks #1–#3 reference only envelope-vs-signed-body fields and do not require pass resolution; they may run before the DB lookup. Check #4 resolves the pass and gates all pass-derived checks (#5–#11).

| # | Check | Failure Condition | Error Code |
|:--:|---|---|---|
| 1 | **Receipt-envelope `offlineTxId` cross-check** | The `offlineTxId` decoded from the signed `receipt.data` ≠ the envelope's `offlineTxId`. | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="offlineTxId"`) |
| 2 | **Receipt-envelope `offlinePassId` cross-check** | The `offlinePassId` decoded from the signed `receipt.data` ≠ the envelope's `offlinePassId`. | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="offlinePassId"`) |
| 3 | **Receipt-envelope `userId` cross-check** | The `userId` decoded from the signed `receipt.data` ≠ the envelope's `userId`. | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="userId"`) |
| 4 | **Pass-found** | The envelope's `offlinePassId` does not resolve to a row in the server's `offline_passes` store. (Storage-layer FK enforcement provides a second guard; see §6.5.) | `2002 OFFLINE_PASS_INVALID` |
| 5 | **Pass-user match** | The resolved pass's `user_id` ≠ the resolved envelope `userId`. | `2016 OFFLINE_USER_MISMATCH` |
| 6 | **Receipt-pass `deviceId` cross-check** | The `deviceId` decoded from the signed `receipt.data` ≠ the resolved pass's `device_id`. | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="deviceId"`) |
| 7 | **Org binding** | The resolved pass's `organization_id` ≠ the reporting station's `organization_id`. This check applies to ALL passes — scoped and unscoped. | `2015 OFFLINE_ORG_MISMATCH` |
| 8 | **Station binding (scoped passes only)** | If the pass's `allowed_station_ids` is non-empty, the reporting station's `stationId` MUST be a member. If `allowed_station_ids` is `null` or `[]`, this check is skipped — see §6.2 on "unscoped" semantics. | `2006 OFFLINE_STATION_MISMATCH` |
| 9 | **Pass not expired at transaction time** | The pass's `expiresAt` MUST be greater than the envelope's `endedAt` timestamp. The transaction's claimed completion time MUST fall within the pass's validity window. | `2003 OFFLINE_PASS_EXPIRED` (severity `Error`, non-recoverable at reconcile-time — see `07-errors.md` §3.2 context note) |
| 10 | **Revocation epoch** | The pass's `revocation_epoch` MUST be greater than or equal to the server's current `RevocationEpoch`. | `2004 OFFLINE_EPOCH_REVOKED` |
| 11 | **Individual revocation** | The pass's `is_revoked` flag MUST be `false`. | `2014 OFFLINE_PASS_REVOKED` |

### 6.2 Station Binding Format and Unscoped Semantics

**Format (check #8).** `allowed_station_ids` stores **business station IDs** — the `stn_<hex>` form the station uses to identify itself in the MQTT envelope and BootNotification (the same identifier referenced throughout the OSPP identity scheme) — NOT server-internal UUIDs. The check #8 membership test compares the envelope's `stationId` (already a business ID on the wire) by **string equality** against the entries in `allowed_station_ids`. Implementations MUST NOT convert either side to UUID before comparison; both sides are business IDs. (A server may internally resolve the envelope `stationId` to a UUID for downstream persistence, but the gate-check comparison is against the business-ID array as stored.)

**Unscoped semantics.** A pass with `allowed_station_ids = null` or `allowed_station_ids = []` is **unscoped**. Unscoped passes are valid at **any station of the issuing organization** — bounded by the Org binding check (§6.1 #7), NOT by globally any station. Implementations MUST treat `null` and `[]` identically (semantic equivalence); both skip check #8 (station binding) but remain subject to check #7 (org binding).

This semantic prevents "unscoped" from becoming a cross-organization hole: an unscoped pass issued by org-A is valid at any of org-A's stations but rejected at org-B's stations.

### 6.3 SecurityEvent Emission

Each gate failure on checks #1–#11 **MUST** emit an `OfflinePassRejected` SecurityEvent. The emission occurs at the gate-rejection point — **before** any persistence attempt — for all 11 checks, including check #4 (pass-found). The storage-layer FK described in §6.5 is a defense-in-depth guard for **non-gate code paths** (direct DB writes, admin tooling, batch importers) and never co-fires with the gate's emission on the conforming reconciliation path.

The emitted SecurityEvent **MUST** conform to the SecurityEvent profile (`profiles/security/security-event.md`) with the following constraints (mirroring `authorize-offline-pass.md` §6.7 v0.4.1 pattern):

a. The `type` **MUST** be `OfflinePassRejected` (from the spec-defined enum in `security-event.md` §4).

b. The `eventId` **MUST** be deterministically derived from the originating TransactionEvent REQUEST's `messageId` (not from the underlying `offlinePassId` or `offlineTxId`), so that every distinct gate failure on a distinct REQUEST produces a distinct audit row. True wire-level retransmits (QoS 1 redelivery of the same REQUEST with the same `messageId`) are collapsed by transport-layer dedup (`02-transport.md` §3.3) before this handler executes; the audit dedup at this layer is defense-in-depth for cases beyond the transport dedup window.

   Recommended derivation (parameterized over the failed check number `N`, `1 ≤ N ≤ 11`):

   ```
   eventId = "sec_" || lowerhex(SHA-256("ospp:reconcile_tx:check_" || N || ":" || messageId))[0:16]
   ```

   Implementations **MAY** use a different derivation scheme provided the four conformance properties from `authorize-offline-pass.md` §6.7 are satisfied: (i) `sec_` + 16-hex-character format per `security-event.md` §6.2; (ii) determinism for the same `(messageId, N)` pair; (iii) collision-resistance across distinct `messageId`s; (iv) documented derivation in the implementation's deployment manifest.

c. The `details` object **SHOULD** include `offlinePassId`, the failed check number, the rejection `errorCode`, the originating `messageId`, and check-specific forensic context:
   - Checks #1/#2/#3/#6 (`OFFLINE_RECEIPT_MISMATCH`): `details.field` (which signed field mismatched), `details.signedValue`, `details.expectedValue`.
   - Check #5 (`OFFLINE_USER_MISMATCH`): `passUserId`, `envelopeUserId`.
   - Check #7 (`OFFLINE_ORG_MISMATCH`): `passOrganizationId`, `stationOrganizationId`.
   - Check #8 (`OFFLINE_STATION_MISMATCH`): `passAllowedStationIds`, `reportingStationId`.
   - Check #9 (`OFFLINE_PASS_EXPIRED`, reconcile-context): `passExpiresAt`, `txEndedAt`, `driftSeconds`, `details.context: "reconcile"`.
   - Check #10 (`OFFLINE_EPOCH_REVOKED`): `passRevocationEpoch`, `serverCurrentEpoch`.
   - Check #11 (`OFFLINE_PASS_REVOKED`): `passRevokedAt` (if present).

d. The `timestamp` field **MUST** reflect when the gate check failed at the server, not when the originating REQUEST was sent by the station.

### 6.4 Response

On any gate failure the server **MUST** respond with:

```json
{
  "status": "Rejected",
  "errorCode": <code from §6.1>,
  "errorText": "<corresponding errorText from 07-errors.md §3.2>",
  "reason": "<short human-readable reason; full forensic detail in the SecurityEvent>"
}
```

The station, on receiving `Rejected`, **MUST NOT** retry the same TransactionEvent. The transaction is permanently rejected at the server; the station MAY flag it for manual investigation.

### 6.5 Storage-Layer FK Enforcement (Belt-and-Suspenders for Non-Gate Paths)

Implementations **SHOULD** enforce `offline_transactions.offline_pass_id` → `offline_passes.id` via a database foreign key. This is a defense-in-depth guard for code paths that **bypass** the §6 reconciliation gate — direct DB writes, admin tooling, batch importers, or any future ingress that lands rows in `offline_transactions` without traversing the application-layer Reconciler.

Ordering on the conforming reconciliation path is unambiguous: gate check #4 (pass-found) **MUST** emit its `OfflinePassRejected` SecurityEvent and return the §6.4 `2002 OFFLINE_PASS_INVALID` response **before** any INSERT is attempted. The FK never fires on the gate's path — there is no INSERT for it to reject. The "double-emission" concern that motivated earlier `SHOULD/MAY-suppress` wording (carried since v0.4.2) does not apply: the gate's emit and the FK's reject are mutually exclusive on a given REQUEST.

The FK's value materializes only when something other than the gate is the entry point. When the FK fires there, it rejects the partial write at the storage layer; whatever code path triggered it is responsible for its own audit emission (the application-layer Reconciler is not in the call stack).

## 7. Fraud Detection

The server **MUST** apply a fraud scoring model to each reconciled offline transaction. The following signals contribute to the fraud score:

| Signal                                  | Severity | Score | Description |
|-----------------------------------------|----------|:-----:|-------------|
| Invalid receipt signature               | Critical | 100   | Receipt was not signed by the station's key. Immediate flag. |
| txCounter gap                           | High     | 80    | Missing transactions in the counter sequence. |
| Credits exceed `maxCreditsPerTx`        | Medium   | 50    | Transaction charged more than the pass allows per session. |
| Rapid consecutive transactions          | Medium   | 40    | Transactions spaced less than `minIntervalSec` apart. |
| Usage beyond `maxUses`                  | Medium   | 50    | More transactions than `maxUses` for the same pass. |
| Credits beyond `maxTotalCredits`        | Medium   | 50    | Cumulative credits exceed the pass limit. |

> **Note (v0.4.2):** "Expired pass used" was removed from this table — expiry is now a hard-reject gate check (§6 check #9, errorCode `2003 OFFLINE_PASS_EXPIRED`). A pass that expired before `tx.endedAt` indicates either a station clock-drift bug or a transaction retained beyond the pass's 24-hour validity window — both are deterministic policy violations, not probabilistic fraud signals.

**Scoring thresholds:**

| Total Score | Action |
|:-----------:|-----------------------------------------------|
| >= 100 | **Automatic:** disable offline mode for the station, revoke user's OfflinePass, notify operator immediately. |
| 50 -- 99 | **Automatic:** flag for manual operator review within 24 hours. Continue accepting transactions but log enhanced audit data. |
| < 50 | **Automatic:** log and accept. No immediate action required. |

## 8. Wallet Reconciliation

After a transaction passes fraud scoring, the server debits the user's wallet:

1. The server reads the `creditsCharged` from the transaction event.
2. The server debits the user's server-side wallet balance by `creditsCharged`.
3. **Negative balance is allowed.** The server **MUST NOT** reject a debit that would result in a negative balance. This prevents service denial for legitimate users who consumed more credits offline than expected.
4. The user is notified of the charges upon the next app open or push notification.
5. If the user's balance goes negative, the server **MUST** trigger a top-up reminder. The user's account **MAY** be restricted from future offline pass issuance until the balance is positive.

## 9. Conflict Resolution

The following edge cases require special handling:

| Scenario | Resolution |
|------------------------------------------------------|-----------------------------------------------|
| Same session reported by both app and station | **Prefer station data.** The station's signed receipt is the authoritative record. The app's record is used for display purposes only. |
| Duplicate `offlineTxId` with different data | **Flag for investigation.** This indicates either a collision (extremely unlikely with UUID-quality IDs) or data tampering. The server **MUST** retain both records and alert the operator. |
| Clock drift between station and server | **Use server time for billing, station time for audit.** The `startedAt` and `endedAt` timestamps from the station are stored for audit, but the server's receipt processing time is used for wallet debit timing. |
| Station replaced/reset between offline period and sync | **Use hardware serial number for identity.** If the station's `stationId` matches but the serial number differs (detected via BootNotification), the server **MUST** flag all pending offline transactions from the old serial for manual review. |
| Station offline window exceeded | If the station has been offline for longer than `stationOfflineWindowHours`, the server **SHOULD** accept the transactions but flag them for enhanced review. |

## 10. Example (TransactionEvent for Offline Reconciliation)

```json
{
  "messageId": "msg_b7c8d9e0-f1a2-3456-abcd-789012345def",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T10:15:30.000Z",
  "source": "Station",
  "protocolVersion": "0.2.1",
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
      "data": "eyJiYXlJZCI6ImJheV9hMWIyYzNkNCIsImNyZWRpdHNDaGFyZ2VkIjo0OCwiZGV2aWNlSWQiOiJkZXZfZDRlNWY2YTciLCJkdXJhdGlvblNlY29uZHMiOjI4NSwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMDk6NTY6NDUuMDAwWiIsIm1ldGVyVmFsdWVzIjp7ImNvbnN1bWFibGVNbCI6NDcwLCJlbmVyZ3lXaCI6MTM4LCJsaXF1aWRNbCI6NDI4MDB9LCJvZmZsaW5lUGFzc0lkIjoib3Bhc3NfYThiOWMwZDFlMmYzIiwib2ZmbGluZVR4SWQiOiJvdHhfZDRlNWY2YTciLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic3RhcnRlZEF0IjoiMjAyNi0wMi0xM1QwOTo1MjowMC4wMDBaIiwidHhDb3VudGVyIjo1LCJ1c2VySWQiOiJzdWJfOWE4YjdjNmQifQ==",
      "signature": "MEUCIQCpl62Tv5tdn1Zs2kKEFJ5o3SUlEjHdWlQBgcTxGXMS5gIgVu3ua5oaGZVuZS+RbQkvEGjDD7cq2O+DkF/IIdlPgUg=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 5,
    "meterValues": {
      "liquidMl": 42800,
      "consumableMl": 470,
      "energyWh": 138
    },
    "deviceId": "dev_d4e5f6a7"
  }
}
```

## 11. Related Schemas

- TransactionEvent Request: [`transaction-event-request.schema.json`](../../../schemas/mqtt/transaction-event-request.schema.json)
- TransactionEvent Response: [`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json)
- Receipt: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md)
- Security model: [Chapter 06 — Security](../../06-security.md) (section 7, Fraud Detection)
