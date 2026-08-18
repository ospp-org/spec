# OfflinePass Structure

> **Status:** Draft | **OSPP Version:** 0.24.0

## 1. Overview

An **OfflinePass** is a server-signed credential that authorizes a user to start sessions on specific stations without real-time server connectivity. It is issued by the server, stored on the mobile app in encrypted secure storage, and validated by the station (either locally in the Full Offline scenario or via MQTT in the Partial B scenario). The OfflinePass is the cornerstone of OSPP's offline authorization model.

## 2. OfflinePass Fields

| Field | Type | Required | Description |
|----------------------|----------|----------|-----------------------------------------------|
| `passId` | string | Yes | Unique pass identifier (`opass_` prefix). |
| `sub` | string | Yes | User subject identifier the pass is issued to (`sub_` prefix). |
| `deviceId` | string | Yes | Bound device identifier (prevents sharing across devices). |
| `issuedAt` | string | Yes | ISO 8601 timestamp of when the pass was issued. |
| `expiresAt` | string | Yes | ISO 8601 timestamp of when the pass expires. Maximum validity is 24 hours from `issuedAt`. |
| `policyVersion` | integer | Yes | Version of the offline policy used to generate this pass (minimum 1). |
| `revocationEpoch` | integer | Yes | Revocation epoch number at time of issuance (minimum 0). |
| `offlineAllowance` | object | Yes | Spending and usage limits (see below). |
| `constraints` | object | Yes | Operational constraints (see below). |
| `signatureAlgorithm` | string | Yes | Signature algorithm identifier. **MUST** be `ECDSA-P256-SHA256`. |
| `signature` | string | Yes | ECDSA P-256 signature over all fields above (excluding `signature` and `signatureAlgorithm`), Base64-encoded. |

### 2.1 offlineAllowance Object

| Field | Type | Required | Description |
|------------------------|----------|----------|-----------------------------------------------|
| `maxTotalCredits` | integer | Yes | Maximum total credits across all sessions (minimum 1). |
| `maxUses` | integer | Yes | Maximum number of sessions allowed (minimum 1). |
| `maxCreditsPerTx` | integer | Yes | Maximum credits per single session (minimum 1). |
| `allowedServiceTypes` | string[] | Yes | Service IDs permitted for offline use (minimum 1). |

### 2.2 constraints Object

| Field | Type | Required | Description |
|------------------------------|---------|----------|-----------------------------------------------|
| `minIntervalSec` | integer | Yes | Minimum seconds between consecutive uses (minimum 0). |
| `stationOfflineWindowHours` | integer | Yes | Maximum hours a station can operate offline (minimum 1). |
| `stationMaxOfflineTx` | integer | Yes | Maximum offline transactions a station accepts before requiring sync (minimum 1). |

### 2.3 Server-Side Record Fields (not on the wire)

The tables above are the **complete** OfflinePass wire structure: they match
[`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json) member for member, and that
schema sets `additionalProperties: false` at both levels, so a pass carrying anything else is
schema-invalid and its signature (§3) covers nothing else.

Two constraints bind a pass without appearing in it. Both live on the **server's stored pass record**
and are read from there by the gates that enforce them — never from the presented pass:

| Record field | Bounds the pass to | Enforced by |
|---|---|---|
| `organization_id` | its issuing organization (`org_<uuid>`), for scoped and unscoped passes alike | [`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks-11-checks) check #11 and [`reconciliation.md` §6.1](reconciliation.md#61-check-list) check #7, both `2015 OFFLINE_ORG_MISMATCH` |
| `allowed_station_ids` | the listed stations, when non-empty | [`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks-11-checks) check #5 and [`reconciliation.md` §6.1](reconciliation.md#61-check-list) check #8, both `2006 OFFLINE_STATION_MISMATCH` |

A station validating a pass locally over BLE has no server to ask and can read only the pass itself,
so it can perform neither check. For `organization_id` that is the deferred **D5** decision recorded in
§4; for `allowed_station_ids` it is [`KNOWN-ISSUES.md` B-2](../../../KNOWN-ISSUES.md#b-2--a-station-scoped-offlinepass-is-unrepresentable-in-the-authoritative-schema),
which §4 check #5 states as a station obligation the wire format cannot support.

## 3. Signing (ECDSA P-256)

The server signs the OfflinePass using ECDSA P-256 with SHA-256 (FIPS 186-4). The signing process is as follows:

1. **Canonical JSON serialization** -- all fields of the OfflinePass (excluding `signature` and `signatureAlgorithm`) are serialized using the **OSPP Canonical Form** defined in [`06-security.md §4.8`](../../06-security.md). The canonicalization is applied recursively across the whole pass body; the resulting UTF-8 byte sequence is the input to the SHA-256 + ECDSA-P256 signing primitive in step 2.
2. **ECDSA P-256 signing** -- the SHA-256 digest of the canonical JSON byte sequence is signed using the server's ECDSA P-256 private key. Software implementations **MUST** use RFC 6979 deterministic nonces and **MUST** apply low-s normalisation (`s := n - s` when `s > n/2`) before DER-encoding, per [`06-security.md §6.2 Note 6`](../../06-security.md). These two requirements together make the produced signature byte-reproducible across compliant implementations.
3. **Base64 encoding** -- the resulting DER-encoded signature is Base64-encoded and placed in the `signature` field.
4. **Verification** -- the station verifies the signature using the server's ECDSA P-256 public key, which is provisioned during BootNotification or via ChangeConfiguration. The station **MUST** reject any pass that fails signature verification with error `2002 OFFLINE_PASS_INVALID`. Verification is malleability-agnostic — it MUST accept any valid DER ECDSA P-256 signature regardless of which half of the order `s` lies in; low-s normalisation is a signing-time requirement only.

The server **MUST** rotate signing keys periodically. Key rotation is communicated to stations via ChangeConfiguration with the `OfflinePassPublicKey` key (an ECDSA P-256 public key in uncompressed or compressed SEC1 format). Stations **MUST** accept passes signed by the current key, and the immediately previous key **for the grace period only** (to handle rotation race conditions). The window is bounded by [`06-security.md` §6.7](../../06-security.md) step 4, which is its only statement; when the grace period expires the station **MUST** discard the cached previous key. An unbounded reading would leave a superseded key — including one an attacker holds ([`06-security.md` §6.7.1](../../06-security.md)) — acceptable indefinitely, until a second rotation displaced it.

## 4. Validation Checks (10)

**Who performs how many.** The list below is ten checks, and the count a validator owes depends on what it can read:

| Validator | Checks it **MUST** perform | Why the difference |
|---|---|---|
| **Station**, validating locally over BLE (Full Offline) | **nine** — #1--#4 and #6--#10 | Check #5 compares against `allowed_station_ids`, which lives on the server's stored pass record and has no member in the signed pass (§2.3). A station has nothing to read and no server to ask: the obligation is not waived for convenience, it is unrepresentable ([`KNOWN-ISSUES.md` B-2](../../../KNOWN-ISSUES.md#b-2--a-station-scoped-offlinepass-is-unrepresentable-in-the-authoritative-schema)). |
| **Server**, at Partial-B authorize-time | **eleven** — all ten, plus org binding | It reads the stored pass record, so #5 is evaluable, and it adds check #11 (`2015 OFFLINE_ORG_MISMATCH`) — see [`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks-11-checks). |

Processing **MUST** stop at the first failure. The org check is server-side because it compares against the server's stored pass record; the station, validating offline, cannot perform it without `organization_id` in the signed pass, which is deferred to D5.

This is stated as a table because the sentence it replaces — *"the station MUST perform all 10 checks below"* — was contradicted by §2.3 of this same document sixteen lines above it, and by the note under the [`06-security.md` §6.1.1](../../06-security.md#611-offlinepass-validation--10-checks) copy of the same table, which already called the list *"ten checks, nine of which a station can perform"*. The analysis was right in both places; only the count-bearing sentence had not been brought into line with it.

> **Implementation note:** Implementations **SHOULD** validate structural integrity (required fields, types, valid base64 signature) before check #1. This avoids the expensive ECDSA verification on malformed payloads. Structural failures use `2002 OFFLINE_PASS_INVALID`.

| # | Check | Error on Failure | Description |
|:--:|-----------------------------------------------|-------------------------------|-----------------------------------------------|
| 1 | **Signature verification** | `2002 OFFLINE_PASS_INVALID` | Verify ECDSA P-256 signature against server public key. |
| 2 | **Within its temporal bounds** | `2003 OFFLINE_PASS_EXPIRED` | Both bounds, and either failing is this check failing: `expiresAt` **MUST** be greater than the current time, **and** `now - issuedAt` **MUST NOT** exceed the station's `OfflinePassMaxAge` (§8). See the note below on why the age bound lives here rather than as an eleventh check. |
| 3 | **Revocation epoch valid** | `2004 OFFLINE_EPOCH_REVOKED` | `revocationEpoch` **MUST** be >= the station's stored `RevocationEpoch`. |
| 4 | **Device binding** | `2002 OFFLINE_PASS_INVALID` | `deviceId` in the pass **MUST** match the device presenting it. |
| 5 | **Station allowed** | `2006 OFFLINE_STATION_MISMATCH` | The station's ID **MUST** be permitted by pass constraints (when station-scoped). |
| 6 | **Usage count** | `4002 OFFLINE_LIMIT_EXCEEDED` | The transactions **already** counted against this pass **MUST** be fewer than `maxUses`; a pass permits `maxUses` transactions in total. |
| 7 | **Total credits** | `4002 OFFLINE_LIMIT_EXCEEDED` | The credits already counted **plus** this transaction's estimated cost **MUST NOT** exceed `maxTotalCredits`; a pass permits `maxTotalCredits` credits in total. |
| 8 | **Per-transaction credits** | `4004 OFFLINE_PER_TX_EXCEEDED` | This transaction's estimated cost **MUST NOT** exceed `maxCreditsPerTx`. |
| 9 | **Rate limit** | `4003 OFFLINE_RATE_LIMITED` | At least `minIntervalSec` seconds **MUST** have elapsed since last use of this pass. |
| 10 | **Counter anti-replay** | `2005 OFFLINE_COUNTER_REPLAY` | `counter` **MUST** be strictly greater than `lastSeenCounter` for this pass on this station. |

> **Why the age bound is part of check #2 and not a check #11.** It is the same question — is this
> pass temporally valid — with the same error code, and for a **conformant** pass the expiry bound
> already implies it, because §6 step 1 caps issued validity at `OfflinePassMaxAge`. What the age
> bound catches is the pass issued under a *longer* cap than this station currently holds: an
> operator who has just lowered the policy, or a station whose configuration has not caught up.
> That is a belt on the same buckle, not a separate obligation. It is also the reason the list is
> still ten: "10 checks" is a cited count — it names a conformance case (`TC-OFF-002`), two chapter
> cross-references and ten further citations across the specification and the implementor's guide —
> and an ordinal that is cited is an identifier.

## 5. Epoch Revocation

The epoch-based revocation mechanism provides a lightweight way to invalidate all outstanding OfflinePasses without distributing a Certificate Revocation List (CRL):

1. The server maintains a global integer `RevocationEpoch`, starting at 0.
2. When the server issues an OfflinePass, it embeds the current `RevocationEpoch` in the pass's `revocationEpoch` field.
3. To revoke all outstanding passes, the server increments `RevocationEpoch` by 1 and pushes the new value to all connected stations via ChangeConfiguration.
4. Stations store the latest `RevocationEpoch` in non-volatile memory. During validation check #3, any pass with `revocationEpoch` less than the station's stored epoch is rejected with `2004 OFFLINE_EPOCH_REVOKED`.
5. Stations that are offline when the epoch is bumped will receive the updated epoch upon their next BootNotification or ChangeConfiguration.

**Trade-off:** Epoch revocation is coarse-grained -- it revokes ALL passes issued before the bump, not individual passes. This is acceptable because OfflinePasses have short lifetimes (maximum 24 hours). For individual pass revocation, the server relies on the `maxUses` limit and pass expiry.

## 6. Lifecycle

The full lifecycle of an OfflinePass is as follows:

1. **Issuance:** The server creates the pass, populates all fields based on the user's wallet balance and the operator's offline policy, signs it with ECDSA P-256, and delivers it to the app via HTTPS. The server **MUST NOT** issue a pass whose `expiresAt` is more than 24 hours after its `issuedAt`. (§2 and [`06-security.md` §6.1](../../06-security.md) both state this cap; it is stated normatively here because JSON Schema cannot express a relation between two members, so no schema can enforce it.)

   **Consistency with `OfflinePassMaxAge` (Normative).** Signed validity and the station's age
   refusal are **independent**: validity is the issuer's, fixed at signing; `OfflinePassMaxAge`
   (§8) is a station's own refusal threshold, which an operator may change at any time. They are
   not one bound and neither caps the other. What the server owes is consistency **at the moment it
   signs**: it **MUST NOT** issue a pass whose signed validity exceeds the `OfflinePassMaxAge`
   configured on the stations that will validate it. Signing longer than that is signing a
   credential its own fleet refuses — and the refusal lands at the station, in the window where the
   app has no network to ask for another, with the user standing in front of it.

   > This is an obligation on the **issuer at issue time**, not a ceiling that rewrites pass
   > lifetime. Where the fleet's `OfflinePassMaxAge` is at or above 24 hours the obligation is
   > satisfied by the 24-hour cap alone and constrains nothing further. Lowering the fleet's
   > `OfflinePassMaxAge` **does** shorten the usable life of passes already issued above the new
   > value; that is the intended effect and the reason the key exists — it is how an operator
   > withdraws stale spending authority without waiting for expiry.
2. **Storage:** The app stores the pass in encrypted secure storage (e.g., Android Keystore / iOS Keychain). The pass **MUST NOT** be stored in plaintext or in application-accessible storage.
3. **Pre-arming:** The app **MAY** request a new OfflinePass proactively (background pre-arming) before going offline, ensuring the user always has a valid pass available.

   3a. **Re-issuance (Normative).** The allowance in a pass is a **snapshot of the wallet at issue
   time**, and a snapshot is only as good as its age. Whenever it has connectivity, the app
   **MUST** request a fresh pass on each of the following, and the server **MUST** issue one
   reflecting the wallet as it stands at that moment:

   | Trigger | Why |
   |---|---|
   | Application start | The wallet may have moved through any other channel while the app was closed — a web payment, a second device, an operator adjustment. |
   | Each consumption of the pass | The allowance the previous pass carried is now partly spent; re-issuing is what keeps the remaining figure true rather than letting the station's local counters be the only record. |
   | Each wallet top-up | The user has just paid to raise the ceiling, and expects it to apply. Without re-issuance the top-up is invisible offline until the pass expires. |

   The app **SHOULD** treat a failed re-issuance as non-fatal and keep the pass it holds: the
   existing pass is still valid within its own bounds, and refusing to use it would deny service
   for a network failure. This cadence is what makes the recomputation in
   [`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)
   affordable — for as long as the app has had a network, the figure the station validates against
   tracks the wallet, and the only divergence left is the window in which it has not, which §4
   check #2 bounds.
4. **Presentation:** During the BLE handshake, the app presents the OfflinePass to the station via the OfflineAuthRequest message.
5. **Consumption:** The station (or server) decrements the remaining uses and credits. The station tracks per-pass usage locally via the `passId` and `counter`.

   > **One transaction consumes exactly one use (Normative).** A single offline transaction is counted against `maxUses` and `maxTotalCredits` **once**, however many times the server sees it. The server may meet the same transaction twice — at authorize-time in Partial B ([`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks-11-checks) check #6, where the count is the server's cumulative usage) and again at reconcile ([`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions), where the cumulative factors sum reconciled transactions fleet-wide) — and those are two views of one counter, not two counters. An implementation **MUST NOT** advance usage twice for one transaction. The value that makes this decidable is already on both wires and under the station's signature: `(passId, counter)` at authorize-time is `(offlinePassId, passCounter)` at reconcile, and [`reconciliation.md` §6.1](reconciliation.md#61-check-list) check #13 already requires that pair be globally unique. Advancing the counter under that key is idempotent by construction.
   >
   > **The two counters also hold two different quantities, and that is the second half of the
   > defect.** At authorize-time the only figure available is an **estimate** — the cost the server
   > projects for the requested service and duration. At reconcile the figure is the **actual**
   > delivered cost, recomputed by the server from the signed duration
   > ([`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)).
   > Adding the second to the first counts one transaction twice **and** at two different
   > valuations. The authorize-time advance is therefore **provisional**: the server **MUST**
   > replace it with the recomputed actual when the transaction settles, and **MUST NOT** add to
   > it. A pass that was authorized and never reconciled keeps its provisional figure, which is the
   > conservative direction and the one that cannot overspend.
   >
   > This is stated because the two sites read as independent obligations and were implemented as
   > independent counters — measured, a `maxUses: 5` pass burns two uses per transaction and sums
   > an estimate with an actual into one `maxTotalCredits` total.
6. **Expiry:** The pass becomes invalid after `expiresAt`, and separately once it is older than `OfflinePassMaxAge` (§4 check #2 applies both bounds; §8 Configuration holds the key). These are two **independent** bounds: `expiresAt` is signed into the pass and fixed at issue, while `OfflinePassMaxAge` is station configuration the operator can lower at any time. Neither caps the other; step 1's consistency obligation only keeps the server from signing a validity its own fleet would refuse on the day it is issued. The app **SHOULD** request a new pass before the current one expires, and step 3a makes that the normal case rather than the exception.
7. **Revocation:** The pass becomes invalid when the server bumps the `RevocationEpoch` above the pass's `revocationEpoch`.

## 7. Security Properties

The OfflinePass provides the following security guarantees:

| Property | Mechanism | Description |
|----------------------|-----------------------------|--------------------------------------------|
| **Non-transferable** | `deviceId` binding | The pass is bound to a specific device. A different device presenting the same pass will fail validation check #4. |
| **Non-forgeable** | ECDSA P-256 signature | The pass is cryptographically signed by the server. Modifying any field invalidates the signature (check #1). |
| **Time-limited** | `expiresAt` | The pass has a maximum validity of 24 hours. After expiry, it is rejected (check #2). |
| **Revocable** | `revocationEpoch` | All passes can be batch-revoked by incrementing the global epoch (check #3). |
| **Usage-limited** | `maxUses`, `maxTotalCredits` | The pass limits the total number of sessions and credits that can be consumed (checks #6, #7). |
| **Rate-limited** | `minIntervalSec` | Prevents rapid consecutive use that could indicate abuse (check #9). |
| **Station-scoped** | Station ID validation | When the **pass record's** `allowed_station_ids` (§2.3 — server-side, not a wire field) is non-empty, the pass is only valid at the listed stations. Enforced at authorize-time per `authorize-offline-pass.md` §5 check #5 AND at reconcile-time per `reconciliation.md` §6 check #8. Both read the server record; a station validating offline cannot (§2.3). |
| **Org-scoped** | Organization binding via `organization_id` | The pass is bound to its issuing organization by the **pass record's** `organization_id` (§2.3 — server-side, not a wire field). Enforced at authorize-time per `authorize-offline-pass.md` §5 check #11 AND at reconcile-time per `reconciliation.md` §6 check #7. This applies to ALL passes — scoped and unscoped. An "unscoped" pass (`allowed_station_ids` `null` or `[]`) means "any station of the issuing organization," not "any station globally." |
| **Replay-protected** | Monotonic counter | The `counter` field in OfflineAuthRequest prevents replaying the same pass presentation (check #10). |

## 8. Related Schemas

- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- OfflinePass ID: [`offline-pass-id.schema.json`](../../../schemas/common/offline-pass-id.schema.json)
- BLE Auth Request: [`offline-auth-request.schema.json`](../../../schemas/ble/offline-auth-request.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2002--2006, 4002--4004)
- Security model: [Chapter 06 — Security](../../06-security.md) (section 6, Offline Security)
