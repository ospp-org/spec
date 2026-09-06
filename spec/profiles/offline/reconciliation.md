# Offline Transaction Reconciliation

> **Status:** Draft | **OSPP Version:** 0.35.0

## 1. Overview

When a station regains connectivity after operating offline, it **MUST** synchronize all offline transactions with the server. This process ensures accurate billing, detects potential fraud, and maintains ledger consistency. Reconciliation uses the existing TransactionEvent action with additional offline-specific fields (`offlineTxId`, `txCounter`, `passCounter`, and a signed `receipt`).

## 2. Sync Procedure

The reconciliation sync follows this ordered flow:

1. **Station reconnects** and sends a BootNotification with `pendingOfflineTransactions` > 0.
2. **Server acknowledges** with `Accepted`. The server notes the pending count and prepares for incoming offline transaction events.
3. **Station sends TransactionEvent(Ended)** for each offline transaction. Each event includes the full offline payload: `offlineTxId`, `offlinePassId`, `passCounter`, `userId`, `bayId`, `serviceId`, timing data, `creditsCharged`, signed `receipt`, `txCounter`, and optional `meterValues`.
4. **Server processes each event** -- performs (a) deduplication (§3), (b) receipt signature verification (§5), (c) **reconcile-time re-validation gate (§6)**, and (d) fraud scoring (§7). The `txCounter` is recorded as forensic evidence (§4) and gates nothing. The server responds with `Accepted` for each valid event. Any gate failure (§6) produces a `Rejected` response with the listed error code and emits a SecurityEvent.
5. **Station marks synced transactions** as reconciled in its local storage. A transaction answered `Accepted` or `Duplicate` **MUST NOT** be sent again; its local record **MUST** be deleted, and that deletion **MAY** be deferred by up to 72 hours to leave a short local audit window. The two obligations are separate and only the first is immediate — [`transaction-event.md` §5.1](../transaction/transaction-event.md) is the canonical statement, and a transaction answered `Rejected` is retained rather than deleted.

**Retry logic:** If the station does not receive a response within 30 seconds for any TransactionEvent, it **MUST** retry with exponential backoff (initial 5s, max 60s (offline batch reconciliation -- optimized for throughput), up to 10 retries). If all retries fail, the station **MUST** retain the transaction and attempt sync on the next successful connection.

> **Note:** This profile uses a shorter response timeout (30s) than the standard TransactionEvent timeout (60s). During reconciliation, the server performs validation, deduplication, and record-keeping but does not make external payment authorization calls, allowing faster processing. The shorter timeout optimizes batch upload throughput when clearing large offline queues.

**No ordering obligation.** The station **SHOULD** send offline transactions in ascending `txCounter` order, because doing so keeps the operator's forensic view (§4) in the order events occurred. It is a transmission preference, not a correctness requirement: **each transaction is settled on its own merits, in the order it arrives.** A station that sends out of order, or whose counter is discontinuous, is answered exactly as one that does not — the server **MUST NOT** withhold, hold, or re-order settlement on counter grounds, and **MUST NOT** answer an out-of-order arrival with `1005 INVALID_MESSAGE_FORMAT`: such a transaction is well-formed and was understood, so the sender has nothing to correct.

Replay and clone protection does **not** depend on this ordering, and never did — it is delivered by the global `(offlinePassId, passCounter)` uniqueness hard-gate, §6.1 check #13, on a counter the **app** generates and the station cannot choose. See §4.

## 3. Deduplication (offlineTxId)

The server uses the `offlineTxId` field to deduplicate offline transaction events:

1. Each offline transaction is assigned a unique `offlineTxId` (format: `otx_` prefix + random alphanumeric) by the station at the time of service start.
2. When the server receives a TransactionEvent with an `offlineTxId`, it checks whether a transaction with that ID has already been processed.
3. If the `offlineTxId` already exists in the server's ledger, the server **MUST** compare the arriving submission against the stored one before answering, and the two outcomes are different:
   - **Same transaction** — the arriving signed `receipt.data` is **byte-identical** to the stored one. This is a retransmission after a network failure, and it is the common case. The server **MUST** respond `Duplicate` without re-processing (idempotent acknowledgement): no second debit, no second ledger row, no re-validation. The station deletes its copy ([`transaction-event.md` §5.1](../transaction/transaction-event.md)).
   - **Different transaction** — the arriving signed `receipt.data` differs from the stored one. Two distinct claims are being made under one `offlineTxId`, which is either an identifier collision or tampering. The server **MUST** respond `Rejected`, **MUST NOT** debit or persist the arriving claim, **MUST** retain both records, and **MUST** alert the operator (§9). It **MUST** emit an `OfflinePassRejected` SecurityEvent carrying the same forensic detail as any other §6 rejection (§6.3), with `errorCode` `2017 OFFLINE_RECEIPT_MISMATCH` and `details.field: "receipt.data"`, plus the `offlineTxId` and the stored record's identifiers. The station **retains** its copy — `Rejected` never orders a deletion — and that copy is the second of the two records the operator compares.
4. The server **MUST** retain `offlineTxId` values for at least 30 days for deduplication purposes.

> **Why the comparison is on the signed `receipt.data` and not field-by-field.** The receipt body is the station's signed statement of what happened; two submissions that agree on it are the same transaction by construction, whatever the envelope around them looks like. Byte equality over that one value is cheap, needs no field list to keep in step with the schema, and cannot be defeated by an attacker who controls the envelope — the receipt is signed and the envelope is not. A submission whose receipt signature does not verify never reaches this comparison: signature verification is §5, and it rejects first.
>
> **This comparison is deduplication, not a §6 gate check.** It runs at §3, before the gate, and it is the reason check #13 (`passCounter` uniqueness) only ever sees a *distinct* `offlineTxId` reusing a counter value. `Rejected` is reused here as the answer because its station-side obligation — stop sending, keep your record — is exactly what this case needs, and because a status value that no deployed station already understands would be a wire change.

## 4. Transaction Counter (Forensic)

### 4.1 txCounter

The station maintains a monotonically increasing transaction counter per station:

1. The counter starts at 1 for the first offline transaction after a station boot or sync.
2. The counter increments by exactly 1 for each subsequent offline transaction.
3. The `txCounter` is included in the ECDSA-signed receipt (§5, `06-security.md` §6.2), so a station cannot retroactively restate it without invalidating the signature.

### 4.2 What the server does with it

**The `txCounter` is evidence, not a control. It gates nothing.**

1. The server **MUST** persist the received `txCounter` on the transaction record.
2. The server **MUST NOT** make settlement, deduplication, or any response status conditional on the `txCounter`'s value, its continuity with previously received counters, or its ordering relative to them. There is no server-side "last reconciled counter" watermark, and a transaction is never withheld, held, or re-ordered on counter grounds.
3. Where the counter is discontinuous with what the server has already recorded for that station, the server **SHOULD** raise an **operator alert on the station** and **MAY** log a SecurityEvent. It **MUST** settle the transaction normally regardless.
4. A discontinuity is **not** a fraud-score input. See §7 and [`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions).

**Why the counter cannot be a control.** It is generated by the station — the party a fraud control would be auditing — and signed with a key that station holds. An adversary with firmware control never produces a gap; it simply never assigns a counter to the transaction it is hiding. What *does* produce discontinuities is ordinary hardware behaviour: reboots, NVS corruption, board replacement. Blocking settlement on the counter therefore penalises only honest stations, and the missing transaction it waits for can never arrive.

**What actually stops a replay.** Clone and replay protection is delivered by the global `(offlinePassId, passCounter)` uniqueness hard-gate — §6.1 **check #13**, error `2005 OFFLINE_COUNTER_REPLAY` — and by the cross-station cumulative factors of [`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions). Both key on `passCounter`, which the **app** generates and the station only echoes into the signed receipt; a station cannot renumber a value it did not choose. Neither depends on `txCounter`, and neither is affected by anything in this section.

> **A repeated `offlineTxId`** is handled by deduplication (§3), whatever its `txCounter` says — `Duplicate` when the signed receipt matches the stored one, `Rejected` when it does not. A **lower or repeated `txCounter` is not, by itself, a duplicate** and **MUST NOT** be answered `Duplicate`: a station that reboots legitimately restarts its counter at 1 (§4.1 step 1), and answering that `Duplicate` would direct the station to delete a payment that was never settled (`profiles/transaction/transaction-event.md` §5.1).

## 5. Receipt Signature Verification

The server verifies the ECDSA-P256-SHA256 signature on each offline transaction receipt:

1. The server **selects** the station's **receipt-signing** ECDSA P-256 public key for this transaction from the retained key set, using the server-authoritative anchor of [Chapter 06 — Security §4.3](../../06-security.md) — for a pass-form receipt, the OfflinePass's own validity window; **never** the station's current key by default, **never** a station-supplied timestamp, and **never** the station's mTLS key.
2. The server reconstructs the canonical receipt payload by Base64-decoding the `receipt.data` field.
3. The server verifies the `receipt.signature` (Base64-decoded) against the reconstructed payload using ECDSA-P256-SHA256.
4. **Invalid signatures** are a CRITICAL-severity fraud signal. The server **MUST** immediately flag the transaction, log a SecurityEvent (`type: "OfflinePassRejected"`), and **MAY** disable offline mode for the affected station until manual investigation is complete.

## 6. Reconcile-Time Re-validation Gate

Before fraud scoring (§7) and wallet reconciliation (§8), the server **MUST** apply a deterministic **hard-reject gate** to every TransactionEvent. This gate is distinct from fraud scoring: it consists of confirmed security-property violations (not probabilistic signals), and each failure **MUST** result in `Rejected` status, no persistence, no wallet debit, and a `SecurityEvent` emission (per §6.3). The gate runs after receipt signature verification (§5) and before fraud scoring (§7).

### 6.1 Check List

The server **MUST** apply the checks below **applicable to the resolved form**, in the listed dependency-ordered canonical order, stopping at the first failure. The form is fixed by the envelope's discriminator (schema `oneOf`) at message-parse, **before** any check runs (not "at #4"). Checks #1–#3 reference only envelope-vs-signed-body fields and do not require record resolution; they may run before the DB lookup. Check #4 resolves the **authorization record** — the pass row (pass-form) or the issued-authorization registry row (auth-form, §6.7) — and gates the derived checks.

**Per-form applicability (Normative).** The **pass-form** applies all 13 checks. The **auth-form (Partial A)** applies checks #1–#9 — with #4–#9 read against the **registry row** (§6.7) — plus the registry `status`; checks **#10–#13 are N/A for the auth-form** and an implementation **MUST NOT** evaluate them against an auth-form record (there is no pass epoch/revocation and no `passCounter`; Partial-A epoch/revocation is the registry `status`, and its anti-replay is `appNonce` + the one-shot `(authId, sessionId)`, §6.7).

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
| 9 | **Pass not expired at transaction time** | The pass's `expiresAt` MUST be greater than the envelope's `endedAt` timestamp. The transaction's claimed completion time MUST fall within the pass's validity window. **`endedAt` is station-supplied, so this check is not independent of station clock drift** — see [`offline-pass.md` §4](offline-pass.md#4-validation-checks-10). A station whose wall clock runs slow passes check #2 on an expired pass and then reports an `endedAt` this check also accepts. The guards that read no clock — #10-#13 and the §7.4 cumulative factors — are the independent ones. | `2003 OFFLINE_PASS_EXPIRED` (severity `Error`, non-recoverable at reconcile-time — see `07-errors.md` §3.2 context note) |
| 10 | **Revocation epoch (at transaction time)** | The pass's `revocation_epoch` MUST be greater than or equal to `epoch_active_at(endedAt)` — the server's `RevocationEpoch` *in effect at the transaction's `endedAt`*, NOT the current epoch. A bulk revocation issued **after** the offline transaction completed MUST NOT retroactively hard-reject it; that post-transaction case is an accept-but-flag outcome, see §6.6 (finding N8). | `2004 OFFLINE_EPOCH_REVOKED` |
| 11 | **Individual revocation** | The pass's `is_revoked` flag MUST be `false`. | `2014 OFFLINE_PASS_REVOKED` |
| 12 | **passCounter receipt-envelope cross-check** | The `passCounter` decoded from the signed `receipt.data` ≠ the envelope's `passCounter`. (Binds the global counter value to the station signature; the envelope copy alone is spoofable.) | `2017 OFFLINE_RECEIPT_MISMATCH` (`details.field="passCounter"`) |
| 13 | **passCounter uniqueness (cross-station replay, finding N7)** | The signed `(offlinePassId, passCounter)` tuple has **already been settled** for this pass at **any** station — the app-global usage counter value was reused, which only a cloned or replayed pass does. (True wire retransmits carry the same `offlineTxId` and are collapsed by §3 dedup **before** the gate, so this check only ever sees a distinct `offlineTxId` reusing a counter value.) Detects what the per-station offline anti-replay (`06-security.md` §6.1.1 #10) structurally cannot. | `2005 OFFLINE_COUNTER_REPLAY` |

> **Org binding is one canonical invariant (finding N9).** Check #7 here and check #11 of the authorize-time gate ([`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks-11-checks)) are the **same** organization-binding invariant, keyed by the **same** wire error code `2015 OFFLINE_ORG_MISMATCH`. Both compare the pass's issuing `organization_id` (from the server's stored pass record) against the reporting station's `organization_id`, for scoped and unscoped passes alike. The positional index differs only because the two gates run different check sets; the semantics and error code are identical.

### 6.2 Station Binding Format and Unscoped Semantics

**Format (check #8).** `allowed_station_ids` stores **business station IDs** — the `stn_<hex>` form the station uses to identify itself in the MQTT envelope and BootNotification (the same identifier referenced throughout the OSPP identity scheme) — NOT server-internal UUIDs. The check #8 membership test compares the envelope's `stationId` (already a business ID on the wire) by **string equality** against the entries in `allowed_station_ids`. Implementations MUST NOT convert either side to UUID before comparison; both sides are business IDs. (A server may internally resolve the envelope `stationId` to a UUID for downstream persistence, but the gate-check comparison is against the business-ID array as stored.)

**Unscoped semantics.** A pass with `allowed_station_ids = null` or `allowed_station_ids = []` is **unscoped**. Unscoped passes are valid at **any station of the issuing organization** — bounded by the Org binding check (§6.1 #7), NOT by globally any station. Implementations MUST treat `null` and `[]` identically (semantic equivalence); both skip check #8 (station binding) but remain subject to check #7 (org binding).

This semantic prevents "unscoped" from becoming a cross-organization hole: an unscoped pass issued by org-A is valid at any of org-A's stations but rejected at org-B's stations.

### 6.3 SecurityEvent Emission

Each gate failure on a check **applicable to the resolved form** (§6.1 — all 13 for the pass-form; #1–#9 for the auth-form, plus the auth-form `(authId, sessionId)` replay reject of §6.7) **MUST** emit an `OfflinePassRejected` SecurityEvent. The emission occurs at the gate-rejection point — **before** any persistence attempt — for every applicable check, including check #4 (authorization-found). The storage-layer FK described in §6.5 is a defense-in-depth guard for **non-gate code paths** (direct DB writes, admin tooling, batch importers) and never co-fires with the gate's emission on the conforming reconciliation path.

The emitted SecurityEvent **MUST** conform to the SecurityEvent profile (`profiles/security/security-event.md`) with the following constraints (mirroring `authorize-offline-pass.md` §6 rule 7, the v0.4.1 authorize-time pattern):

a. The `type` **MUST** be `OfflinePassRejected` (from the spec-defined enum in `security-event.md` §4).

b. The `eventId` **MUST** be deterministically derived from the originating TransactionEvent REQUEST's `messageId` (not from the underlying `offlinePassId` or `offlineTxId`), so that every distinct gate failure on a distinct REQUEST produces a distinct audit row. True wire-level retransmits (QoS 1 redelivery of the same REQUEST with the same `messageId`) are collapsed by transport-layer dedup (`02-transport.md` §3.3) before this handler executes; the audit dedup at this layer is defense-in-depth for cases beyond the transport dedup window.

   Recommended derivation (parameterized over the failed check number `N`, `1 ≤ N ≤ 13`):

   ```
   eventId = "sec_" || lowerhex(SHA-256("ospp:reconcile_tx:check_" || N || ":" || messageId))[0:16]
   ```

   Implementations **MAY** use a different derivation scheme provided the four conformance properties from `authorize-offline-pass.md` §6 (rule 7) are satisfied: (i) the `sec_` + hexadecimal format of `security-event.md` §6 (rule 2), at the 16 characters rule 7 derives; (ii) determinism for the same `(messageId, N)` pair; (iii) collision-resistance across distinct `messageId`s; (iv) documented derivation in the implementation's deployment manifest.

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
  "reason": "<short human-readable reason identifying the failed check; full forensic detail in the SecurityEvent>"
}
```

The response carries **no** `errorCode` and **no** `errorText`. [`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json) is closed (`additionalProperties: false`) over exactly `status` and `reason`, so a response carrying either member is not schema-valid and no conforming body could satisfy both this section and the wire contract.

The failing gate remains identifiable, by two routes. On the wire, the `reason` **MUST** identify the failed check — its §6.1 number, or its `errorText` as free text — well enough to be actionable without opening the audit trail; the schema bounds it at 256 characters. For machine-readable detail, the `OfflinePassRejected` SecurityEvent that [§6.3](#63-securityevent-emission) already **MUST** emit for the same failure carries the failed check number and the rejection `errorCode` in its `details`, and correlates to this response through the originating REQUEST's `messageId`. The §6.1 error codes are therefore recorded rather than transmitted: they identify the check in the audit trail, not on the TransactionEvent response.

The station, on receiving `Rejected`, **MUST NOT** retry the same TransactionEvent, and **MUST** retain the transaction in its local log marked as rejected and flagged for manual investigation ([`transaction-event.md` §5.1 and §6 rule 5](../transaction/transaction-event.md), which are canonical). The transaction is permanently rejected at the server, but the station's copy is not therefore worthless: for a §3 different-data collision it is the second of the two records the operator compares, and for a gate failure it is the only station-side account of what the station believes it delivered. `Rejected` stops the sending; it never orders a deletion.

### 6.5 Storage-Layer FK Enforcement (Belt-and-Suspenders for Non-Gate Paths)

Implementations **SHOULD** enforce `offline_transactions.offline_pass_id` → `offline_passes.id` via a database foreign key. This is a defense-in-depth guard for code paths that **bypass** the §6 reconciliation gate — direct DB writes, admin tooling, batch importers, or any future ingress that lands rows in `offline_transactions` without traversing the application-layer Reconciler.

**The `offline_pass_id` column MUST be NULLABLE (finding F7).** A Partial-A (auth-form) settled row has no OfflinePass — the schema forbids `offlinePassId` — so it persists with `offline_pass_id = NULL`, correlated instead by `reconciled_session_id` (the server-issued `sessionId`, §6.7 / §8.2). SQL foreign keys do not fire on `NULL`, so the FK above coexists with Partial-A rows; but a `NOT NULL` column would make **every** Partial-A settlement fail to persist. Any implementation that supports Partial A **MUST** declare `offline_pass_id` nullable.

Ordering on the conforming reconciliation path is unambiguous: gate check #4 (pass-found) **MUST** emit its `OfflinePassRejected` SecurityEvent and return the §6.4 `2002 OFFLINE_PASS_INVALID` response **before** any INSERT is attempted. The FK never fires on the gate's path — there is no INSERT for it to reject. The "double-emission" concern that motivated earlier `SHOULD/MAY-suppress` wording (carried since v0.4.2) does not apply: the gate's emit and the FK's reject are mutually exclusive on a given REQUEST.

The FK's value materializes only when something other than the gate is the entry point. When the FK fires there, it rejects the partial write at the storage layer; whatever code path triggered it is responsible for its own audit emission (the application-layer Reconciler is not in the call stack).

### 6.6 Revocation Epoch at Transaction Time (finding N8)

Check #10 anchors the revocation-epoch comparison to **transaction time** (`endedAt`), mirroring check #9 (expiry). This closes finding N8: a station that operated offline across a bulk-revocation **MUST NOT** have its legitimate, already-completed transactions retroactively destroyed at settlement. Without this anchoring, a single epoch bump during a multi-hour offline window would hard-reject every unreconciled transaction taken before the bump — turning a routine revocation into "lose all unreconciled revenue", while denying service records to users who were legitimately served.

**`epoch_active_at(t)` (Normative).** The server maintains the history of its `RevocationEpoch` increments — each bump is recorded with the timestamp at which it took effect. `epoch_active_at(t)` is the value of `RevocationEpoch` that was in effect at instant `t`: the epoch of the most recent bump whose effective time is ≤ `t`, or `0` if no bump preceded `t`. The server has this history by construction (it performs the bumps); **no additional wire field is required** — the station already reports `endedAt` in the envelope and the signed receipt.

**Hard-reject condition (check #10).** The gate **MUST** hard-reject with `2004 OFFLINE_EPOCH_REVOKED` when `pass.revocation_epoch < epoch_active_at(tx.endedAt)` — i.e. a bulk revocation covering this pass had **already taken effect before** the transaction completed. Such a transaction was served against an already-revoked pass and is a genuine policy violation, handled exactly as the other §6 hard-reject checks (Rejected, no persistence, no debit, `OfflinePassRejected` SecurityEvent per §6.3).

**Revocation-window flag (accept-but-flag — a check-#10 PASS outcome, NOT a rejection).** When the pass was valid at transaction time (`pass.revocation_epoch ≥ epoch_active_at(tx.endedAt)`, so check #10 passes) **but has since been bulk-revoked** (`pass.revocation_epoch < currentRevocationEpoch`), the transaction completed legitimately during a window the operator later revoked — the dominant real cause being a stolen-device report filed *after* the thief's last offline use. Check #10 **MUST NOT** hard-reject on epoch grounds here; it **MUST** record a deterministic review marker (recommended `revoked_after_tx`, carrying `passRevocationEpoch`, `epochActiveAtEndedAt`, `currentRevocationEpoch`, `txEndedAt`) and let the gate continue. **Settlement is conditional on the rest of the gate (finding F6).** Because the gate runs stop-at-first-failure, the flagged transaction is settled **only if checks #11–#13 also pass**: a pass that is *also* individually revoked (#11, `is_revoked = true` — a field distinct from `revocation_epoch`, see `07-errors.md` 2004 vs 2014) is still hard-rejected with `2014` and **not** settled, leaving the flag moot. When the full gate passes, the server settles the (flagged) transaction and surfaces the marker for manual operator review. This is a **gate-level review marker — not a fraud score (§7) and not a rejection (§6.4)**: an audit-grade, deterministic signal that this settled transaction sits in the post-revocation window and may warrant operator clawback. The choice between "legitimate late reconciliation" and "fraudulent use in the theft window" is an operator decision the protocol does not pre-judge; placing it in `§7` probabilistic scoring would be wrong (the condition is deterministic, the same rationale that moved expiry out of §7 in v0.4.2 — see §7 Note).

### 6.7 Partial-A Reconciliation (auth-form — findings N2 / N3 / Q4)

A **Partial A** session is authorized fully offline against a server-signed `ServerSignedAuth` blob: the app pre-fetched it from `POST /sessions/offline-auth` while online, and the station validated it locally with **no pass and no server contact** (`04-flows.md` §5b). Such a session has no OfflinePass, so its buffered TransactionEvent and signed receipt take the **auth-form** — the `{offlinePassId, passCounter}` discriminator pair is replaced by `{authId, sessionId}` (schema `oneOf`, finding Q4). This makes Partial-A reconcilable end-to-end, which it was **not** before v0.6.0 (finding N2: the schemas required `offlinePassId`, so a no-pass session could not even build a conforming envelope and was hard-rejected at check #4).

**Issued-authorization registry.** When the server issues a ServerSignedAuth at `POST /sessions/offline-auth`, it records a registry row keyed by `authId`, carrying `sub`, `deviceId`, `sessionId`, `stationId`, `bayId`, `serviceId`, the signed authorized budget (`durationSeconds`, `creditsAuthorized`), `expiresAt`, the **issue-time debit amount**, and a status (`pending` → `reconciled` / `expired`). The wallet is **debited at issue** (`04-flows.md` §5b postconditions), not at reconcile.

**Gate branch (check #4 auth-branch).** For an auth-form envelope the gate resolves `authId` against this registry instead of `offline_passes`, and cross-checks the registry row's `sessionId` (the **server-issued** value) against the receipt's signed `sessionId`. The receipt **MUST** carry the server-issued `sessionId` (§6.2, F2) — the value the server minted at `POST /sessions/offline-auth` and signed into the claims — for this cross-check to pass; a station that signed a locally-minted identifier instead is rejected at check #4 (`2002`). The derived checks read the **registry row** in place of the pass record:
- #5 user match — `registry.sub` == receipt `userId`.
- #6 deviceId — `registry.deviceId` == signed receipt `deviceId`.
- #7 org binding — `registry.organization_id` == reporting station's org.
- #8 station binding — `registry.stationId` == reporting station.
- #9 not-expired-at-tx — `registry.expiresAt` > `endedAt`.
- #10 / #11 (epoch / individual revocation) — **not applicable** (no pass); the registry's own `status` is the validity gate (a row cancelled/revoked before settlement is rejected with `2014 OFFLINE_PASS_REVOKED` — the code is reused here for the registry-status case; the auth-form has no pass `is_revoked` flag, so `2014` denotes "authorization revoked before settlement", finding M3).
- #12 / #13 (passCounter) — **not applicable** (no pass counter). Partial-A anti-replay is the `appNonce` bound into the handshake plus the one-shot `(authId, sessionId)`: the gate rejects a second TransactionEvent that settles an already-reconciled `(authId, sessionId)` as a replay (`2005 OFFLINE_COUNTER_REPLAY`). Like every §6 gate rejection, this replay reject **MUST** emit an `OfflinePassRejected` SecurityEvent (§6.3) before the `Rejected` response: the `eventId` is deterministically derived from the TransactionEvent REQUEST's `messageId` over the `check_13` domain (`2005` is the counter-replay check in both forms — the auth-form keys it on `(authId, sessionId)`, the pass-form on `(offlinePassId, passCounter)`), and `details` **SHOULD** carry `authId`, `sessionId`, and the `priorOfflineTxId` that first settled the tuple.

**Settle-once (true-up, not re-debit — finding N11).** Because the wallet was already debited at issue, the gate **MUST NOT** debit again at reconcile. It performs the §8.2 **true-up**: it recomputes the final cost (Billing Authority, `04-flows.md` §6) and adjusts the wallet by the difference vs the issue-time pre-debit — a refund if it cost less, an additional debit if it cost more (`creditsAuthorized` is **not** a settlement cap; see §8.2). Correlation is server-side on the **server-issued** `sessionId` (`reconciled_session_id`) — the same `sessionId` the server minted at `POST /sessions/offline-auth`, signed into the ServerSignedAuth claims and echoed into the signed auth-form receipt (see check #4 and §6.2) — never a fresh debit keyed on `offlineTxId`. See §8.2.

## 7. Fraud Detection

The server **MUST** apply a fraud scoring model to each reconciled offline transaction. The **authoritative** model — its factors, the cross-station cumulative computation, the `0.00`–`1.00` score scale, and the threshold→action bands — is defined **once** in [`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions). The offline reconciliation path uses that model verbatim; this section does not restate it. (Finding F3: the previously divergent integer table here and the float mirror in `04-flows.md` §10 are **subsumed by §7.4** — one authoritative source, the other two are pointers.)

Two reconcile-time anchors connect that model to this profile:

- **Deterministic violations are §6 hard-reject gate checks, not fraud factors.** Invalid receipt signature (§5), expiry (#9, `2003`), epoch-at-tx (#10, `2004` / §6.6), user/org/station/device mismatches (#5–#8), and **same-value** counter reuse (#13, `2005`) are deterministic security-property violations the §6 gate handles with `Rejected` + a SecurityEvent — never probabilistic scoring.
- **A `txCounter` discontinuity is neither.** It is not a gate check and it is not a fraud factor. The counter is persisted as forensic evidence and **gates nothing** (§4.2); a discontinuity raises an operator alert **on the station** and the transaction settles normally. It is deliberately absent from the §7.4 factor table: `txCounter` is a **station** property, whereas §7.4's automated responses (*disable offline mode for user*; *revoke pass, block user account*) are **user** sanctions — scoring a station's reboot against a user's account was a wiring error, not a policy. The replay guard that does the work here is check #13's `(offlinePassId, passCounter)` uniqueness, on an **app**-generated counter (§4.2).
- **Note (finding N7 — complementary counter defenses).** The §6.1 check #13 hard-gate (`(offlinePassId, passCounter)` uniqueness) and the §7.4 **cumulative cross-station `maxUses` / `maxTotalCredits`** factors are **complementary**: check #13 deterministically hard-rejects the *same-value* clone/replay; the §7.4 cumulative factors flag the *disjoint-counter-stream* clone — whose copies run on non-overlapping counter ranges and never collide on a `(offlinePassId, passCounter)` tuple — once the **fleet-wide** aggregate exceeds `maxUses`. Neither alone is sufficient; together they bound cross-station double-spend (the N7 guarantee, now delivered by a defined computation — §7.4).

## 8. Wallet Reconciliation

After a transaction passes fraud scoring, the server settles the user's wallet. **Settlement is settle-once.** A session whose wallet was already debited at authorization time — Partial A always (`04-flows.md` §5b; §6.7), and any Partial-B session that fell back to offline after an authorize-time debit (finding N11) — **MUST NOT** be debited a second time at reconcile. The server distinguishes the two paths by correlating the transaction to a prior authorization **server-side, on the correlation key its resolved form actually carries**, never by issuing a fresh debit keyed on `offlineTxId` — that identifier is chosen by the station at service start (§3 rule 1) and does not exist when the authorization is issued, so it cannot join the two.

**The correlation key, per form (Normative).**

| Resolved form | Correlation key | Why it joins |
|---|---|---|
| **auth-form** (Partial A) | the signed `(authId, sessionId)` pair | Both are server-issued at authorization, both are signed into `receipt.data` and echoed in the envelope (finding Q4), and §6.1 check #2 already binds envelope to signature. |
| **pass-form** (Full Offline; Partial B, including the offline fallback this rule guards) | the signed `(offlinePassId, passCounter)` pair | `passCounter` **is** the `counter` the station presented at authorize time ([`authorize-offline-pass.md` §3](authorize-offline-pass.md#3-request-payload)), echoed into the signed receipt ([`06-security.md` §6.1.1](../../06-security.md#611-offlinepass-validation--10-checks), counter-model note). §6.1 check #13 already requires the pair be globally unique across the fleet, so it names exactly one authorization and exactly one settlement. |

**`sessionId` is not available on the pass-form and MUST NOT be required there.** The pass-form branch of both [`transaction-event-request.schema.json`](../../../schemas/mqtt/transaction-event-request.schema.json) and [`receipt-data.schema.json`](../../../schemas/common/receipt-data.schema.json) sets `"sessionId": false`, and both close with `additionalProperties: false` — so a Partial-B session that fell back to offline reconciles in a form no `sessionId` can reach, in the envelope or under the signature. An earlier revision of this rule named `sessionId` as the sole key; on the one form the rule was written to guard, no implementation could have satisfied it.

### 8.1 No prior debit (Full Offline / direct Partial B)

1. **The server recomputes the settled cost. It does not read it off the wire.** Per the
   **Billing Authority** rule ([`04-flows.md` §6](../../04-flows.md#billing-authority)), the server
   **MUST** compute the amount from the delivered `durationSeconds` in the signed receipt and the
   tariff for that receipt's `serviceId`, by the formula in
   [`03-messages.md` §MSG-007](../../03-messages.md) —
   `ceil(durationSeconds / 60 × priceCreditsPerMinute)` for `PerMinute` pricing,
   `priceCreditsFixed` for `Fixed`. The station-reported `creditsCharged` is **advisory**: it is a
   cross-check and an operator signal, and it **MUST NOT** be the settled amount, whether or not it
   agrees with the recomputation.
2. **Which tariff.** The server **MUST** use the tariff in force at the transaction's `endedAt`
   where it retains a time-indexed catalog history — the `epoch_active_at(t)` construction of §6.6
   applies unchanged, and needs no wire field for the same reason. Where it does not, the server
   **MUST** use the tariff currently in force and **MUST** record which basis it used on the
   transaction record. It **MUST NOT** withhold, defer, or fall back to the station's figure for
   want of the history: a tariff change inside the offline window moves the amount by a bounded
   difference that then **shows up as balance and is collectable**, whereas a deferred settlement
   is a delivered service with no record of what it cost.
3. The server debits the user's server-side wallet balance by the **recomputed** amount.
4. **Negative balance is allowed.** The server **MUST NOT** reject a debit that would result in a
   negative balance. A session already delivered cannot be un-delivered by refusing to record it,
   and refusing the debit would lose the only record of what was owed.
5. **A negative balance is a debt, and it restricts service until it is covered.** The server
   **MUST** trigger a top-up reminder, and **MUST** restrict the account from further offline pass
   issuance while the balance is below zero. This is not a dispute over the amount — the amount is
   the server's own recomputation — so it is settled by payment, not by adjudication.
6. The user is notified of the charges upon the next app open or push notification.

> **Why recomputation is affordable here, and why the offline value is not stale in practice.**
> The pass carries the user's allowance, and [`offline-pass.md` §6](offline-pass.md#6-lifecycle)
> step 3a **re-issues it** on every event that can change that allowance — application start, each
> consumption, each wallet top-up. So for as long as the application has had a network, the figure
> the station validates against tracks the wallet. What remains is the window in which it has not,
> and that window is bounded by the pass's own 24-hour validity, and more tightly wherever an
> operator has lowered `OfflinePassMaxAge` (§8 of the same document; at its default that key is
> deliberately inert, and the 24-hour bound is the one doing the work).
>
> What the window can cost is **not** further offline spending — that is bounded by the pass's own
> `maxTotalCredits` and lands as balance either way. It is spending through a **second channel**
> while the application is off-network: a web payment, a second device, an operator adjustment. The
> residue after all of it is a difference, not an exposure: it lands as negative balance, which
> rule 5 makes a debt that blocks service rather than a loss that is written off.
>
> **The magnitudes here are policy, not protocol.** `maxUses`, `maxCreditsPerTx`, `maxTotalCredits`
> and `minIntervalSec` are set per operator and appear in no configuration registry. Where this
> specification quotes figures to size the trade-off, they are the reference implementation's and
> are **representative, not normative**; a deployment on different numbers has a different bound
> and should redo the arithmetic rather than inherit it.

### 8.2 Prior authorization debit (settle-once true-up — Partial A; Partial-B offline fallback)

When the gate resolved the transaction to a prior authorization that was **already debited at issue** (the issued-authorization registry row for Partial A, §6.7; or a Partial-B session that debited at authorize-time, then lost MQTT mid-session and reconciled offline):

1. The server reads the issue-time debit amount (`priorDebit`): the pre-authorized maximum (the signed `creditsAuthorized`) for Partial A; the recorded authorize-time debit for Partial B.
2. The server recomputes the final cost per the **Billing Authority** rule (`04-flows.md` §6 — actual delivered duration × the tariff in force when the session ran; the station-reported `creditsCharged` is advisory, and the server **MUST** recompute regardless of it). It then applies a **true-up**: it adjusts the wallet by `recomputedCost − priorDebit` **only** — a **refund** when the session cost less than the pre-authorized maximum, an **additional debit** when it cost more. It **MUST NOT** re-debit the full amount. The signed `creditsAuthorized` is **not** a settlement cap: it sets the issue-time pre-debit and (via the duration clamp, `ble-session.md` §3) bounds the authorized *duration*, but settled credits follow the Billing Authority recomputation — a tariff change during the offline window can yield a settled cost **above** `creditsAuthorized`, and the user pays the real delivered cost.
3. The true-up shares the **same idempotency key** as the authorize-time debit, derived from the form's correlation key above — `(authId, sessionId)` for the auth-form, `(offlinePassId, passCounter)` for the pass-form — so a retried reconcile or a late-arriving duplicate cannot double-apply it. Steps 3–5 of §8.1 (negative balance, notification, top-up) apply to the net adjustment.
4. The server marks the authorization `reconciled` and records the correlation on the transaction: `reconciled_session_id` on the auth-form, where a `sessionId` exists; the resolved authorization's own identifier on the pass-form, where one does not.

> **Forward-guard note (finding N11).** The Partial-B authorize-time-debit path this rule guards is **not yet implemented server-side** (the offline session-creation path is a placeholder at the time of writing), so no double-debit exists today. The rule is specified now so that when that path lands it is built settle-once-correct from the start: the authorize-time debit and the reconcile true-up **MUST** present the same idempotency key — **the one rule 3 above names for the resolved form**, `(authId, sessionId)` for the auth-form and `(offlinePassId, passCounter)` for the pass-form. Until `0.25.0` this sentence said *"the same `sessionId`-derived idempotency key"*, which `0.24.0` had already made unsatisfiable everywhere it mattered: the case this note guards is the **Partial-B offline fallback**, which reconciles in the **pass-form**, and §8 states in terms that `sessionId` *"is not available on the pass-form and **MUST NOT** be required there"*. `0.24.0` re-keyed the rule and repaired the table above; this note kept the old key, and it is the only normative sentence an implementer of the unbuilt path reads. It was the same defect in a second site — see the class index in [`KNOWN-ISSUES.md`](../../../KNOWN-ISSUES.md#class--an-obligation-no-field-no-code-and-no-actor-can-carry), instance 7. Partial A (§6.7) exercises the rule from its first implementation, since it always debits at issue.

## 9. Conflict Resolution

The following edge cases require special handling:

| Scenario | Resolution |
|------------------------------------------------------|-----------------------------------------------|
| Same session reported by both app and station | **Prefer station data.** The station's signed receipt is the authoritative record. The app's record is used for display purposes only — it does not settle, and therefore does not create a ledger entry that would make the station's later TransactionEvent a duplicate under §3. §3's comparison is keyed on `offlineTxId` and is channel-agnostic: whichever submission created the settling entry, a second arrival is compared against it by the same rule. **The app→server submission path itself is not specified in this version.** No chapter or profile defines it; `examples/flows/05-partial-a-session.md` and the implementors guide describe a `POST /me/offline-txs` endpoint that the specification does not define, and that example also has the app's upload settling ahead of the station, which this row does not permit. Until that path is specified, an implementation **MUST NOT** rely on an app-submitted record to settle an offline transaction. |
| Duplicate `offlineTxId` with different data | **Answered `Rejected`, and flagged for investigation** (§3 rule 3, second bullet — that rule is normative and this row summarises it). This indicates either a collision (extremely unlikely with UUID-quality IDs) or data tampering. The server **MUST** retain both records and alert the operator. It **MUST NOT** answer `Duplicate`: that status orders the station to delete its local copy, which is the second of the two records this row requires be retained, and the only one not under the control of whoever submitted the second claim. |
| Clock drift between station and server | **Use server time for billing, station time for audit.** The `startedAt` and `endedAt` timestamps from the station are stored for audit, but the server's receipt processing time is used for wallet debit timing. |
| Station replaced/reset between offline period and sync | **Treat a serial-number change as a hardware swap, not a new station.** If the station's `stationId` matches but the serial number differs (detected via BootNotification), the server **MUST** flag all pending offline transactions from the old serial for manual review. |
| Station offline window exceeded | If the station has been offline for longer than `stationOfflineWindowHours`, the server **SHOULD** accept the transactions but flag them for enhanced review. |

## 10. Example (TransactionEvent for Offline Reconciliation)

```json
{
  "messageId": "msg_b7c8d9e0-f1a2-3456-abcd-789012345def",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T10:15:30.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
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
