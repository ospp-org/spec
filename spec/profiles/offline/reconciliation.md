# Offline Transaction Reconciliation

> **Status:** Draft | **OSPP Version:** 0.6.0

## 1. Overview

When a station regains connectivity after operating offline, it **MUST** synchronize all offline transactions with the server. This process ensures accurate billing, detects potential fraud, and maintains ledger consistency. Reconciliation uses the existing TransactionEvent action with additional offline-specific fields (`offlineTxId`, `txCounter`, `passCounter`, and a signed `receipt`).

## 2. Sync Procedure

The reconciliation sync follows this ordered flow:

1. **Station reconnects** and sends a BootNotification with `pendingOfflineTransactions` > 0.
2. **Server acknowledges** with `Accepted`. The server notes the pending count and prepares for incoming offline transaction events.
3. **Station sends TransactionEvent(Ended)** for each offline transaction, ordered by `txCounter` (ascending). Each event includes the full offline payload: `offlineTxId`, `offlinePassId`, `passCounter`, `userId`, `bayId`, `serviceId`, timing data, `creditsCharged`, signed `receipt`, `txCounter`, and optional `meterValues`.
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

The server **MUST** apply the 13 checks below in the listed dependency-ordered canonical order. Processing **MUST** stop at the first failure. Checks #1–#3 reference only envelope-vs-signed-body fields and do not require pass resolution; they may run before the DB lookup. Check #4 resolves the pass and gates all pass-derived checks (#5–#13).

| # | Check | Failure Condition | Error Code |
|:--:|---|---|---|
| 1 | **Receipt-envelope `offlineTxId` cross-check** | The `offlineTxId` decoded from the signed `receipt.data` ≠ the envelope's `offlineTxId`. | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="offlineTxId"`) |
| 2 | **Receipt-envelope authorization-key cross-check** | **Pass-form:** the `offlinePassId` decoded from the signed `receipt.data` ≠ the envelope's `offlinePassId`. **Auth-form (Partial A):** the signed `authId` or `sessionId` ≠ the envelope's. (The gate selects the form by which discriminator pair the envelope carries — §6.7.) | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field` = the mismatched key) |
| 3 | **Receipt-envelope `userId` cross-check** | The `userId` decoded from the signed `receipt.data` ≠ the envelope's `userId`. | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="userId"`) |
| 4 | **Authorization-found** | **Pass-form:** the envelope's `offlinePassId` does not resolve to a row in the server's `offline_passes` store (storage-layer FK is a second guard, §6.5). **Auth-form (Partial A):** the signed `authId` does not resolve to a live row in the issued-authorization registry, or the registry row's `sessionId` ≠ the receipt's `sessionId` (§6.7). Resolves the authorization record that gates all derived checks (#5–#13). | `2002 OFFLINE_PASS_INVALID` |
| 5 | **Pass-user match** | The resolved pass's `user_id` ≠ the resolved envelope `userId`. | `2016 OFFLINE_USER_MISMATCH` |
| 6 | **Receipt-pass `deviceId` cross-check** | The `deviceId` decoded from the signed `receipt.data` ≠ the resolved pass's `device_id`. | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="deviceId"`) |
| 7 | **Org binding** | The resolved pass's `organization_id` ≠ the reporting station's `organization_id`. This check applies to ALL passes — scoped and unscoped. | `2015 OFFLINE_ORG_MISMATCH` |
| 8 | **Station binding (scoped passes only)** | If the pass's `allowed_station_ids` is non-empty, the reporting station's `stationId` MUST be a member. If `allowed_station_ids` is `null` or `[]`, this check is skipped — see §6.2 on "unscoped" semantics. | `2006 OFFLINE_STATION_MISMATCH` |
| 9 | **Pass not expired at transaction time** | The pass's `expiresAt` MUST be greater than the envelope's `endedAt` timestamp. The transaction's claimed completion time MUST fall within the pass's validity window. | `2003 OFFLINE_PASS_EXPIRED` (severity `Error`, non-recoverable at reconcile-time — see `07-errors.md` §3.2 context note) |
| 10 | **Revocation epoch (at transaction time)** | The pass's `revocation_epoch` MUST be greater than or equal to `epoch_active_at(endedAt)` — the server's `RevocationEpoch` *in effect at the transaction's `endedAt`*, NOT the current epoch. A bulk revocation issued **after** the offline transaction completed MUST NOT retroactively hard-reject it; that post-transaction case is an accept-but-flag outcome, see §6.6 (finding N8). | `2004 OFFLINE_EPOCH_REVOKED` |
| 11 | **Individual revocation** | The pass's `is_revoked` flag MUST be `false`. | `2014 OFFLINE_PASS_REVOKED` |
| 12 | **passCounter receipt-envelope cross-check** | The `passCounter` decoded from the signed `receipt.data` ≠ the envelope's `passCounter`. (Binds the global counter value to the station signature; the envelope copy alone is spoofable.) | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="passCounter"`) |
| 13 | **passCounter uniqueness (cross-station replay, finding N7)** | The signed `(offlinePassId, passCounter)` tuple has **already been settled** for this pass at **any** station — the app-global usage counter value was reused, which only a cloned or replayed pass does. (True wire retransmits carry the same `offlineTxId` and are collapsed by §3 dedup **before** the gate, so this check only ever sees a distinct `offlineTxId` reusing a counter value.) Detects what the per-station offline anti-replay (`06-security.md` §6.1 #10) structurally cannot. | `2005 OFFLINE_COUNTER_REPLAY` |

> **Org binding is one canonical invariant (finding N9).** Check #7 here and check #11 of the authorize-time gate ([`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks-11-checks)) are the **same** organization-binding invariant, keyed by the **same** wire error code `2015 OFFLINE_ORG_MISMATCH`. Both compare the pass's issuing `organization_id` (from the server's stored pass record) against the reporting station's `organization_id`, for scoped and unscoped passes alike. The positional index differs only because the two gates run different check sets; the semantics and error code are identical.

### 6.2 Station Binding Format and Unscoped Semantics

**Format (check #8).** `allowed_station_ids` stores **business station IDs** — the `stn_<hex>` form the station uses to identify itself in the MQTT envelope and BootNotification (the same identifier referenced throughout the OSPP identity scheme) — NOT server-internal UUIDs. The check #8 membership test compares the envelope's `stationId` (already a business ID on the wire) by **string equality** against the entries in `allowed_station_ids`. Implementations MUST NOT convert either side to UUID before comparison; both sides are business IDs. (A server may internally resolve the envelope `stationId` to a UUID for downstream persistence, but the gate-check comparison is against the business-ID array as stored.)

**Unscoped semantics.** A pass with `allowed_station_ids = null` or `allowed_station_ids = []` is **unscoped**. Unscoped passes are valid at **any station of the issuing organization** — bounded by the Org binding check (§6.1 #7), NOT by globally any station. Implementations MUST treat `null` and `[]` identically (semantic equivalence); both skip check #8 (station binding) but remain subject to check #7 (org binding).

This semantic prevents "unscoped" from becoming a cross-organization hole: an unscoped pass issued by org-A is valid at any of org-A's stations but rejected at org-B's stations.

### 6.3 SecurityEvent Emission

Each gate failure on checks #1–#13 **MUST** emit an `OfflinePassRejected` SecurityEvent. The emission occurs at the gate-rejection point — **before** any persistence attempt — for all 13 checks, including check #4 (pass-found). The storage-layer FK described in §6.5 is a defense-in-depth guard for **non-gate code paths** (direct DB writes, admin tooling, batch importers) and never co-fires with the gate's emission on the conforming reconciliation path.

The emitted SecurityEvent **MUST** conform to the SecurityEvent profile (`profiles/security/security-event.md`) with the following constraints (mirroring `authorize-offline-pass.md` §6.7 v0.4.1 pattern):

a. The `type` **MUST** be `OfflinePassRejected` (from the spec-defined enum in `security-event.md` §4).

b. The `eventId` **MUST** be deterministically derived from the originating TransactionEvent REQUEST's `messageId` (not from the underlying `offlinePassId` or `offlineTxId`), so that every distinct gate failure on a distinct REQUEST produces a distinct audit row. True wire-level retransmits (QoS 1 redelivery of the same REQUEST with the same `messageId`) are collapsed by transport-layer dedup (`02-transport.md` §3.3) before this handler executes; the audit dedup at this layer is defense-in-depth for cases beyond the transport dedup window.

   Recommended derivation (parameterized over the failed check number `N`, `1 ≤ N ≤ 13`):

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
   - Check #10 (`OFFLINE_EPOCH_REVOKED`): `passRevocationEpoch`, `epochActiveAtEndedAt`, `serverCurrentEpoch`, `txEndedAt`.
   - Check #11 (`OFFLINE_PASS_REVOKED`): `passRevokedAt` (if present).
   - Check #12 (`OFFLINE_RECEIPT_MISMATCH`, passCounter): `signedPassCounter`, `envelopePassCounter`.
   - Check #13 (`OFFLINE_COUNTER_REPLAY`): `offlinePassId`, `passCounter`, `priorOfflineTxId` (the already-settled transaction that first claimed this `(offlinePassId, passCounter)` tuple).

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

### 6.6 Revocation Epoch at Transaction Time (finding N8)

Check #10 anchors the revocation-epoch comparison to **transaction time** (`endedAt`), mirroring check #9 (expiry). This closes finding N8: a station that operated offline across a bulk-revocation **MUST NOT** have its legitimate, already-completed transactions retroactively destroyed at settlement. Without this anchoring, a single epoch bump during a multi-hour offline window would hard-reject every unreconciled transaction taken before the bump — turning a routine revocation into "lose all unreconciled revenue", while denying service records to users who were legitimately served.

**`epoch_active_at(t)` (Normative).** The server maintains the history of its `RevocationEpoch` increments — each bump is recorded with the timestamp at which it took effect. `epoch_active_at(t)` is the value of `RevocationEpoch` that was in effect at instant `t`: the epoch of the most recent bump whose effective time is ≤ `t`, or `0` if no bump preceded `t`. The server has this history by construction (it performs the bumps); **no additional wire field is required** — the station already reports `endedAt` in the envelope and the signed receipt.

**Hard-reject condition (check #10).** The gate **MUST** hard-reject with `2004 OFFLINE_EPOCH_REVOKED` when `pass.revocation_epoch < epoch_active_at(tx.endedAt)` — i.e. a bulk revocation covering this pass had **already taken effect before** the transaction completed. Such a transaction was served against an already-revoked pass and is a genuine policy violation, handled exactly as the other §6 hard-reject checks (Rejected, no persistence, no debit, `OfflinePassRejected` SecurityEvent per §6.3).

**Revocation-window flag (accept-but-flag — a check-#10 PASS outcome, NOT a rejection).** When the pass was valid at transaction time (`pass.revocation_epoch ≥ epoch_active_at(tx.endedAt)`, so check #10 passes) **but has since been bulk-revoked** (`pass.revocation_epoch < currentRevocationEpoch`), the transaction completed legitimately during a window the operator later revoked — the dominant real cause being a stolen-device report filed *after* the thief's last offline use. The server **MUST** accept and settle the transaction (the service was delivered) **but MUST flag it for manual operator review**, recording a deterministic review marker on the settled record (recommended marker `revoked_after_tx`, carrying `passRevocationEpoch`, `epochActiveAtEndedAt`, `currentRevocationEpoch`, `txEndedAt`). This is a **gate-level review flag — not a fraud score (§7) and not a rejection (§6.4)**: it is an audit-grade, deterministic signal that this specific settled transaction sits in the post-revocation window and may warrant operator clawback. The choice between "legitimate late reconciliation" and "fraudulent use in the theft window" is an operator decision the protocol does not pre-judge; placing it in `§7` probabilistic scoring would be wrong (the condition is deterministic, the same rationale that moved expiry out of §7 in v0.4.2 — see §7 Note).

### 6.7 Partial-A Reconciliation (auth-form — findings N2 / N3 / Q4)

A **Partial A** session is authorized fully offline against a server-signed `ServerSignedAuth` blob: the app pre-fetched it from `POST /sessions/offline-auth` while online, and the station validated it locally with **no pass and no server contact** (`04-flows.md` §5b). Such a session has no OfflinePass, so its buffered TransactionEvent and signed receipt take the **auth-form** — the `{offlinePassId, passCounter}` discriminator pair is replaced by `{authId, sessionId}` (schema `oneOf`, finding Q4). This makes Partial-A reconcilable end-to-end, which it was **not** before v0.6.0 (finding N2: the schemas required `offlinePassId`, so a no-pass session could not even build a conforming envelope and was hard-rejected at check #4).

**Issued-authorization registry.** When the server issues a ServerSignedAuth at `POST /sessions/offline-auth`, it records a registry row keyed by `authId`, carrying `sub`, `deviceId`, `sessionId`, `stationId`, `bayId`, `serviceId`, the signed authorized budget (`durationSeconds`, `creditsAuthorized`), `expiresAt`, the **issue-time debit amount**, and a status (`pending` → `reconciled` / `expired`). The wallet is **debited at issue** (`04-flows.md` §5b postconditions), not at reconcile.

**Gate branch (check #4 auth-branch).** For an auth-form envelope the gate resolves `authId` against this registry instead of `offline_passes`, and cross-checks the registry row's `sessionId` against the receipt's signed `sessionId`. The derived checks read the **registry row** in place of the pass record:
- #5 user match — `registry.sub` == receipt `userId`.
- #6 deviceId — `registry.deviceId` == signed receipt `deviceId`.
- #7 org binding — `registry.organization_id` == reporting station's org.
- #8 station binding — `registry.stationId` == reporting station.
- #9 not-expired-at-tx — `registry.expiresAt` > `endedAt`.
- #10 / #11 (epoch / individual revocation) — **not applicable** (no pass); the registry's own `status` is the validity gate (a row cancelled/revoked before settlement is rejected with `2014 OFFLINE_PASS_REVOKED`).
- #12 / #13 (passCounter) — **not applicable** (no pass counter). Partial-A anti-replay is the `appNonce` bound into the handshake plus the one-shot `(authId, sessionId)`: the gate rejects a second TransactionEvent that settles an already-reconciled `(authId, sessionId)` as a replay (`2005 OFFLINE_COUNTER_REPLAY`).

**Settle-once (true-up, not re-debit — finding N11).** Because the wallet was already debited at issue, the gate **MUST NOT** debit again at reconcile. It performs the §8 **true-up**: it reconciles the final `creditsCharged` against the issue-time `creditsAuthorized` debit and adjusts the wallet by the **difference only** — a refund if the session cost less than authorized, an additional debit (bounded by the signed `creditsAuthorized`) if it cost more. Correlation is server-side on `sessionId` (`reconciled_session_id`), never a fresh debit keyed on `offlineTxId`. See §8.

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

> **Note (finding N7 — complementary counter defenses):** The hard-gate check #13 (§6.1, `(offlinePassId, passCounter)` uniqueness) and the **"Usage beyond `maxUses`"** signal above are **complementary**, covering the two ways a cloned pass manifests at reconcile. Check #13 deterministically hard-rejects the **same-value** case — a replay, or a naive clone whose copies reuse counter values. It does **not** catch a sophisticated clone whose second device starts its counter **above** the first device's high-water mark (two disjoint, non-overlapping counter streams never collide on a value). That case surfaces only in the **aggregate**: two valid monotone streams for one pass inflate the cumulative use count, tripping "Usage beyond `maxUses`" (and "Credits beyond `maxTotalCredits`") into the manual-review band. The hard gate stops the cheap attack outright; the soft aggregate signal flags the expensive one for review. Neither alone is sufficient; together they bound cross-station double-spend.

**Scoring thresholds:**

| Total Score | Action |
|:-----------:|-----------------------------------------------|
| >= 100 | **Automatic:** disable offline mode for the station, revoke user's OfflinePass, notify operator immediately. |
| 50 -- 99 | **Automatic:** flag for manual operator review within 24 hours. Continue accepting transactions but log enhanced audit data. |
| < 50 | **Automatic:** log and accept. No immediate action required. |

## 8. Wallet Reconciliation

After a transaction passes fraud scoring, the server settles the user's wallet. **Settlement is settle-once.** A session whose wallet was already debited at authorization time — Partial A always (`04-flows.md` §5b; §6.7), and any Partial-B session that fell back to offline after an authorize-time debit (finding N11) — **MUST NOT** be debited a second time at reconcile. The server distinguishes the two paths by correlating the transaction to a prior authorization **server-side on `sessionId`** (persisted as `reconciled_session_id`), never by issuing a fresh debit keyed on `offlineTxId`.

### 8.1 No prior debit (Full Offline / direct Partial B)

1. The server reads the `creditsCharged` from the transaction event.
2. The server debits the user's server-side wallet balance by `creditsCharged`.
3. **Negative balance is allowed.** The server **MUST NOT** reject a debit that would result in a negative balance. This prevents service denial for legitimate users who consumed more credits offline than expected.
4. The user is notified of the charges upon the next app open or push notification.
5. If the user's balance goes negative, the server **MUST** trigger a top-up reminder. The user's account **MAY** be restricted from future offline pass issuance until the balance is positive.

### 8.2 Prior authorization debit (settle-once true-up — Partial A; Partial-B offline fallback)

When the gate resolved the transaction to a prior authorization that was **already debited at issue** (the issued-authorization registry row for Partial A, §6.7; or a Partial-B session that debited at authorize-time, then lost MQTT mid-session and reconciled offline):

1. The server reads `creditsCharged` (actual) and the issue-time debit amount (the signed `creditsAuthorized` for Partial A; the recorded authorize-time debit for Partial B).
2. The server applies a **true-up**: it adjusts the wallet by `creditsCharged − priorDebit` **only** — a **refund** when the session cost less than authorized, an **additional debit** when it cost more (bounded, for Partial A, by the signed `creditsAuthorized`). It **MUST NOT** re-debit the full `creditsCharged`.
3. The true-up shares the **same idempotency key** as the authorize-time debit (derived from `sessionId`), so a retried reconcile or a late-arriving duplicate cannot double-apply it. Steps 3–5 of §8.1 (negative balance, notification, top-up) apply to the net adjustment.
4. The server marks the authorization `reconciled` and records `reconciled_session_id` on the transaction.

> **Forward-guard note (finding N11).** The Partial-B authorize-time-debit path this rule guards is **not yet implemented server-side** (the offline session-creation path is a placeholder at the time of writing), so no double-debit exists today. The rule is specified now so that when that path lands it is built settle-once-correct from the start: the authorize-time debit and the reconcile true-up **MUST** present the same `sessionId`-derived idempotency key. Partial A (§6.7) exercises the rule from its first implementation, since it always debits at issue.

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
      "data": "eyJiYXlJZCI6ImJheV9hMWIyYzNkNCIsImNyZWRpdHNDaGFyZ2VkIjo0OCwiZGV2aWNlSWQiOiJkZXZfZDRlNWY2YTciLCJkdXJhdGlvblNlY29uZHMiOjI4NSwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMDk6NTY6NDUuMDAwWiIsIm1ldGVyVmFsdWVzIjp7ImNvbnN1bWFibGVNbCI6NDcwLCJlbmVyZ3lXaCI6MTM4LCJsaXF1aWRNbCI6NDI4MDB9LCJvZmZsaW5lUGFzc0lkIjoib3Bhc3NfYThiOWMwZDFlMmYzIiwib2ZmbGluZVR4SWQiOiJvdHhfZDRlNWY2YTciLCJwYXNzQ291bnRlciI6Nywic2VydmljZUlkIjoic3ZjX2VjbyIsInN0YXJ0ZWRBdCI6IjIwMjYtMDItMTNUMDk6NTI6MDAuMDAwWiIsInR4Q291bnRlciI6NSwidXNlcklkIjoic3ViXzlhOGI3YzZkIn0=",
      "signature": "MEUCIQDJqpr+TRAF2ZrcQxtLrpfPOzWvHKSvLmeyZcWNdwApNwIge7pIaiE+fs+rC+fHSP6krvyLG9jG9ny6pL6WqQBiE/A=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 5,
    "meterValues": {
      "liquidMl": 42800,
      "consumableMl": 470,
      "energyWh": 138
    },
    "deviceId": "dev_d4e5f6a7",
    "passCounter": 7
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
