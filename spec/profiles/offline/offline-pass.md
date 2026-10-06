# OfflinePass Structure

> **Status:** Draft | **OSPP Version:** 0.44.0

## 1. Overview

An **OfflinePass** is a server-signed credential that authorizes a user to start sessions without real-time server connectivity, at **any station that accepts offline passes** (§2.3). It belongs to the user it is issued to and to that user's device, and to nothing else: it names no station and no organization. It is issued by the server together with a trust bundle ([`app-contract.md`](app-contract.md)), stored on the mobile app in encrypted secure storage, and validated either by the station locally (Full Offline) or by the server over MQTT (Partial B). The OfflinePass is the cornerstone of OSPP's offline authorization model.

## 2. OfflinePass Fields

| Field | Type | Required | Description |
|----------------------|----------|----------|-----------------------------------------------|
| `passId` | string | Yes | Unique pass identifier (`opass_` prefix). |
| `sub` | string | Yes | User subject identifier the pass is issued to (`sub_` prefix). |
| `deviceId` | string | Yes | Identifier of the device the pass is issued to. It travels only inside the BLE channel, where the station keys its per-device limits on it ([`06-security.md` §7.1](../../06-security.md#71-rate-limiting)); what binds a presentation to the device is the proof of `devicePublicKey` (§4 check #4). |
| `devicePublicKey` | string | Yes | The device's P-256 public key, compressed SEC1, Base64 (44 characters; [`06-security.md` §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256), Pin 2). Its private key was generated in, and cannot be exported from, the phone's hardware-backed keystore (§6), and every presentation proves possession of it (§4 check #4), so the key binds the pass to the one device that holds it. |
| `keyId` | string | Yes | Identifier of the server signing key that signed the pass (§3; [`06-security.md` §6.7](../../06-security.md#67-server-signing-key-rotation-ecdsa-p-256)). |
| `issuedAt` | string | Yes | ISO 8601 timestamp of when the pass was issued. |
| `expiresAt` | string | Yes | ISO 8601 timestamp of when the pass expires: `issuedAt` plus the platform pass lifetime — 3 days by default, never more than 10 days (§6). |
| `policyVersion` | integer | Yes | Version of the offline policy used to generate this pass (minimum 1). |
| `revocationEpoch` | integer | Yes | The platform revocation epoch at the time of issuance (minimum 0; §5). |
| `offlineAllowance` | object | Yes | The pass's limits (see below). |
| `constraints` | object | Yes | The pass's rate constraint (see below). |
| `signatureAlgorithm` | string | Yes | Signature algorithm identifier. **MUST** be `ECDSA-P256-SHA256`. |
| `signature` | string | Yes | ECDSA P-256 signature over all fields above (excluding `signature` and `signatureAlgorithm`), Base64-encoded. |

### 2.1 offlineAllowance Object

| Field | Type | Required | Description |
|------------------------|----------|----------|-----------------------------------------------|
| `maxTotalCredits` | integer | Yes | Maximum total credits across all sessions — any number of sessions until it is reached (minimum 1). Never more than the user's wallet balance at issuance (§6). |
| `maxUses` | integer | Yes | Maximum number of sessions allowed (minimum 1). |
| `maxCreditsPerTx` | integer | Yes | Maximum credits for a single session — the per-session limit (minimum 1). |
| `allowedServiceTypes` | string[] | **No — withdrawn** | **WITHDRAWN in `0.25.0`.** Accepted and ignored for one transition step, then removed. Servers **MUST NOT** issue it; receivers **MUST NOT** reject on it. No validation check in this specification has ever read it — see [`06-security.md` §6.1.1](../../06-security.md#611-offlinepass-validation--10-checks). |

**A request above a limit is refused, never reduced (Normative).** A validator that finds the cost of a requested service above `maxCreditsPerTx`, or above what remains of `maxTotalCredits`, **MUST** refuse the request (§4 checks #7 and #8) and **MUST NOT** shorten the service, lower its price or otherwise reduce the request until it fits. The customer chooses; the protocol does not choose for them. The app **MUST** show the pass's limits — the per-session limit, the credits remaining under `maxTotalCredits` and the uses remaining under `maxUses` — before the customer chooses a service, so that a refusal on a limit is one the customer could have foreseen. A station counts only its own use of a pass (§5), so across stations it is the app that keeps the pass within its limits: the app **MUST NOT** request a service when, by its own count — the receipts it has read against that pass, whether or not it has uploaded them — the pass has no use left, the service's estimated cost exceeds the credits it has left, or less than `minIntervalSec` has passed since its last use, and **MUST** present only the latest pass it was issued.

### 2.2 constraints Object

| Field | Type | Required | Description |
|------------------------------|---------|----------|-----------------------------------------------|
| `minIntervalSec` | integer | Yes | Minimum seconds between consecutive uses of this pass (minimum 0). |

**The station's own offline limits are configuration, not pass fields.** Whether a station accepts a pass on its own validation, for how long after losing its server connection it may keep doing so, and how many offline transactions the server has not yet answered `Accepted`, `Duplicate` or `Rejected` it may hold are properties of the **station**. Its operator sets them and the server pushes them as configuration — `OfflineModeEnabled`, `OfflineWindowHours` and `OfflineTransactionLimit` ([`08-configuration.md` §5](../../08-configuration.md#5-offline--ble-configuration-keys)). A pass carries none of them: it is presented at stations of every tenant (§2.3), so no issuer could sign one station's limits into it. Earlier revisions carried two of them in the pass, as `constraints.stationOfflineWindowHours` and `constraints.stationMaxOfflineTx`; both are removed.

**Refusing on a station limit (Normative).** A station **MUST** refuse an OfflinePass it would otherwise accept on its own validation when `OfflineModeEnabled` is `false`, when more than `OfflineWindowHours` have elapsed since its last successful MQTT connection — measured on its **monotonic** timer, not its wall clock (the note on §4 check #2) — or when it already holds `OfflineTransactionLimit` offline transactions the server has not yet answered `Accepted`, `Duplicate` or `Rejected` — one answered `RetryLater` still counts ([`08-configuration.md` §5](../../08-configuration.md#5-offline--ble-configuration-keys)). It refuses with `4002 OFFLINE_LIMIT_EXCEEDED` and **MUST** name the limit in `details.constraint`, using the configuration key name verbatim. **No new code is introduced**: the condition is an offline ceiling being reached, which is what `4002` already means.

**Why the distinction has to travel, and why a second code is the wrong way to carry it.** The two families of ceiling differ in what the app can do about the refusal. A pass ceiling (§2.1) is exhausted for **that pass**, and a newly issued pass clears it. A station ceiling is a property of the **station** — its operator has switched local acceptance off, or it has been offline too long, or it holds too many transactions the server has not yet answered `Accepted`, `Duplicate` or `Rejected` — and no pass issued to anyone clears it until that station reconnects or its operator changes it. An app that retries with a fresh pass against a station refusal loops without progress, and the user is told nothing. Splitting the code would make that visible at the cost of a registry entry, a conformance vector set and a lockstep SDK release ([ADR-001](../../../adr/ADR-001-cross-repo-lockstep-versioning.md)); `details` is already an open object on the MQTT carriers and already the place per-occurrence context travels, so the distinction is carried there. A BLE refusal carries it the same way: every BLE response that refuses carries `errorCode`, `errorText` and `details` ([`07-errors.md` §2.3](../../07-errors.md#23-ble-error-response)).

**Upper bounds.** The station's configuration bounds the station and the pass bounds the user; neither raises the other, and a station **MUST NOT** raise a local limit because a pass asked it to. `minIntervalSec` **MUST NOT** exceed **864000**, the maximum pass lifetime (§6): a longer interval could never elapse inside a valid pass. `maxUses` and `maxCreditsPerTx` are **issuer policy** and this specification sets no ceiling on them. That is deliberate — a protocol maximum on money would be a limit on the operator's business rather than on the wire — and it is stated rather than left silent, because the absence otherwise reads as an oversight. `maxTotalCredits` is issuer policy below one bound, the user's own money: it never exceeds the wallet balance at issuance (§6).

None of this is written into [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json): the ceiling on `minIntervalSec` is normative prose enforced at issuance and re-checked at validation, exactly as the lifetime cap is. Writing it into the schema instead would bind receivers that vendored an older copy to a different verdict on the same pass.

### 2.3 Scope: any station that accepts offline passes (Normative)

**An OfflinePass belongs to the user it is issued to (`sub`) and to that user's device (`deviceId`, `devicePublicKey`), and to nothing else.** It names no station and no organization, and no server record binds it to either. A user whose offline use the server has enabled may present it at **any** station that accepts offline passes, whatever tenant operates that station. Therefore:

- a station **MUST NOT** refuse a pass, and a server **MUST NOT** refuse a pass at authorize time or a transaction at reconciliation, on the ground of which station or which organization presented or reported it;
- a server **MUST NOT** issue a pass restricted to stations or to an organization, and **MUST NOT** require the user to belong to an organization in order to issue one ([`app-contract.md` §3](app-contract.md#3-pass-issuance)).

The tables above are the **complete** OfflinePass wire structure: they match [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json) member for member, and that schema sets `additionalProperties: false` at both levels, so a pass carrying anything else is schema-invalid and its signature (§3) covers nothing else.

> **What this replaced.** Earlier revisions bound every pass to its issuing organization, and optionally to a list of stations, through two fields of the server's stored pass record — `organization_id` and `allowed_station_ids` — checked at authorize time and at reconciliation with `2015 OFFLINE_ORG_MISMATCH` and `2006 OFFLINE_STATION_MISMATCH`. A station validating offline could perform neither check, because neither value was in the pass. The scope, the checks and both codes are withdrawn together, and the check numbers they held are not reused (§4).

## 3. Signing (ECDSA P-256)

The server signs the OfflinePass using ECDSA P-256 with SHA-256 (FIPS 186-4). The signing process is as follows:

1. **Canonical JSON serialization** -- all fields of the OfflinePass (excluding `signature` and `signatureAlgorithm`) are serialized using the **OSPP Canonical Form** defined in [`06-security.md §4.8`](../../06-security.md). The canonicalization is applied recursively across the whole pass body; the resulting UTF-8 byte sequence is the input to the SHA-256 + ECDSA-P256 signing primitive in step 2.
2. **ECDSA P-256 signing** -- the SHA-256 digest of the canonical JSON byte sequence is signed using the private key of the server signing key named by `keyId`. Software implementations **MUST** use RFC 6979 deterministic nonces and **MUST** apply low-s normalisation (`s := n - s` when `s > n/2`) before DER-encoding, per [`06-security.md` §6.2](../../06-security.md#62-transaction-receipt-signing--ecdsa-p-256). These two requirements together make the produced signature byte-reproducible across compliant implementations.
3. **Base64 encoding** -- the resulting DER-encoded signature is Base64-encoded and placed in the `signature` field.
4. **Verification** -- the verifier selects, from the server key set it holds, the key whose identifier equals the pass's `keyId`, and verifies the signature with it. The station holds the set as `OfflinePassPublicKey` ([`08-configuration.md` §4](../../08-configuration.md#4-security-configuration-keys)). The station **MUST** reject a pass whose `keyId` names no key of its set, or whose signature does not verify, with error `2002 OFFLINE_PASS_INVALID`. Verification is malleability-agnostic — it **MUST** accept any valid DER ECDSA P-256 signature regardless of which half of the order `s` lies in; low-s normalisation is a signing-time requirement only.

The server **MUST** rotate its signing key periodically, and it manages its keys as a **set**: a new key enters the set well before it signs anything, and an old key leaves only when everything it signed has expired. [`06-security.md` §6.7](../../06-security.md#67-server-signing-key-rotation-ecdsa-p-256) states the windows, how the set reaches stations — at provisioning, at every boot and by ChangeConfiguration — and the compromise response; it is the only statement of them.

## 4. Validation Checks (10)

**Who performs how many.** The list below has ten numbered checks. Check #5 is **withdrawn** — a pass carries no station or organization scope (§2.3) — and its number is not reused: a check number is cited as an identifier (see the note on check #2 below). The count a validator owes:

| Validator | Checks it **MUST** perform |
|---|---|
| **Station**, validating locally over BLE (Full Offline) | **nine** — #1--#4 and #6--#10 |
| **Server**, at Partial-B authorize-time | the same nine — the age bound of #2 against the forwarding station's `OfflinePassMaxAge` — and individual revocation — [`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks) |

Processing **MUST** stop at the first failure.

> **Implementation note:** Implementations **SHOULD** validate structural integrity (required fields, types, valid base64 signature) before check #1. This avoids the expensive ECDSA verification on malformed payloads. Structural failures use `2002 OFFLINE_PASS_INVALID`.

| # | Check | Error on Failure | Description |
|:--:|-----------------------------------------------|-------------------------------|-----------------------------------------------|
| 1 | **Signature verification** | `2002 OFFLINE_PASS_INVALID` | Verify the ECDSA P-256 signature with the key of the server key set named by the pass's `keyId` (§3). |
| 2 | **Within its temporal bounds** | `2003 OFFLINE_PASS_EXPIRED` | Both bounds, and either failing is this check failing: `expiresAt` **MUST** be greater than the current time, **and** `now - issuedAt` **MUST NOT** exceed the station's `OfflinePassMaxAge` ([`08-configuration.md` §5](../../08-configuration.md#5-offline--ble-configuration-keys)). See the note below on why the age bound lives here rather than as an eleventh check. |
| 3 | **Revocation epoch valid** | `2004 OFFLINE_EPOCH_REVOKED` | `revocationEpoch` **MUST** be >= the platform `RevocationEpoch` the station holds (§5). |
| 4 | **Device binding** | `2002 OFFLINE_PASS_INVALID` | The presentation's device proof **MUST** verify under the pass's `devicePublicKey` ([`06-security.md` §6.5.4](../../06-security.md#654-device-proof-of-possession)). **EXPERIMENTAL**, with the BLE handshake the proof signs. See the note below. |
| 5 | **Withdrawn** | — | A pass carries no station or organization scope (§2.3). The number is not reused. |
| 6 | **Usage count** | `4002 OFFLINE_LIMIT_EXCEEDED` | The transactions **already** counted against this pass **MUST** be fewer than `maxUses`; a pass permits `maxUses` transactions in total. |
| 7 | **Total credits** | `4002 OFFLINE_LIMIT_EXCEEDED` | The credits already counted **plus** this transaction's estimated cost **MUST NOT** exceed `maxTotalCredits`; a pass permits `maxTotalCredits` credits in total. |
| 8 | **Per-transaction credits** | `4004 OFFLINE_PER_TX_EXCEEDED` | This transaction's estimated cost **MUST NOT** exceed `maxCreditsPerTx`. |
| 9 | **Rate limit** | `4003 OFFLINE_RATE_LIMITED` | At least `minIntervalSec` seconds **MUST** have elapsed since last use of this pass. |
| 10 | **Counter anti-replay** | `2005 OFFLINE_COUNTER_REPLAY` | `counter` **MUST** be strictly greater than `lastSeenCounter` for this pass on this station. |

> **Check #4 and the device key.** The pass carries `devicePublicKey`, the public half of a key the phone's hardware-backed keystore generated and will not export (§6). The device that holds the private key is the pass's device, and using that key is what proves it: a `deviceId` alone proves nothing, because every copy of the pass carries it. The OfflineAuthRequest carries a proof of possession of the key, made over the handshake, the station's identity, the pass, the counter and the requested service ([`06-security.md` §6.5.4](../../06-security.md#654-device-proof-of-possession)), so a copied pass presented by another device fails check #4, and a proof made for one station cannot be presented at another. Earlier revisions compared the pass's `deviceId` with an identifier the plaintext Hello carried, which the app chose and any radio in range could read ([`06-security.md` T14](../../06-security.md#t14---ble-presence-tracking)); that comparison bound nothing and is withdrawn with the identifier.

> **The estimated cost (Normative; EXPERIMENTAL, with the BLE request it reads).** Checks #7 and #8 read the estimated cost of the presentation: the price, in the service catalog the validator holds, of the OfflineAuthRequest's `serviceId` on its `bayId` for its `requestedDurationSeconds` — `ceil(requestedDurationSeconds / 60 × priceCreditsPerMinute)` for a `PerMinute` service, the formula settlement applies to the time delivered ([`04-flows.md` §6](../../04-flows.md#settlement-by-service-kind)), and `priceCreditsFixed` for a `Fixed` one. An authorization is for exactly that service, bay and duration, and its credits are that estimate (§2.1, *refused, never reduced*).

> **Which clock check #2 reads, and what happens when it cannot be trusted.** Both bounds are
> **wall-clock** comparisons, and the station evaluating them is by definition offline: its only
> two protocol clock sources — `serverTime` on the BootNotification and Heartbeat responses — arrive
> only over an established mTLS session ([`01-architecture.md` §7.2](../../01-architecture.md)), and
> the drift detector that would report the problem, `5106 CLOCK_ERROR`, is defined as *"detected at
> Heartbeat [MSG-008] time sync"* ([Chapter 07 §3](../../07-errors.md)). Offline, the station has no
> correction source and no detector. The rules are therefore:
>
> 1. The station **MUST** evaluate check #2 against its best available wall clock, and **MUST NOT**
>    refuse a pass for want of confidence in that clock. A rule that withheld service whenever the
>    clock was unverified would withhold it for the whole of every outage, which is the one condition
>    this profile exists to serve.
> 2. `OfflineWindowHours` (§2.2) is **not** a wall-clock quantity and **MUST NOT** be
>    evaluated as one. It is an elapsed duration, and the station **MUST** measure it as a
>    **monotonic** delta from its last successful MQTT connection — the same mechanism
>    [`heartbeat.md` §6](../core/heartbeat.md#6-clock-synchronization) rule 5 already mandates for
>    session elapsed time. A monotonic timer is unaffected by the drift and by any correction applied
>    on reconnection, so this bound stays sound exactly where the wall-clock ones weaken.
> 3. The station **MUST** record, in each receipt it signs, the state of its clock — `clockState`
>    ([`06-security.md` §6.2](../../06-security.md#62-transaction-receipt-signing--ecdsa-p-256)) — so
>    that the server knows whether the offset it measures at reconnection applies to that receipt's
>    timestamps.
>
> **What the server does about it.** The server's backstop for temporal validity is
> [`reconciliation.md` §6.1](reconciliation.md#61-check-list) check #9, and it does not read the
> station's clock alone: it judges the signed `endedAt` corrected by the offset the server measured
> when the station reconnected, for a receipt whose clock was synchronized, and flags the receipt for
> review when its clock was not ([`reconciliation.md` §6.8](reconciliation.md#68-station-clock-offset)).
> The signed times themselves are never rewritten. The guards that read no clock at all — checks
> #10-#13 at reconciliation and the cumulative cross-station factors of
> [`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions) — are
> unchanged.

> **Why the age bound is part of check #2 and not a check #11.** It is the same question — is this
> pass temporally valid — with the same error code. A pass is valid until its `expiresAt`, up to ten
> days after issue (§6); what the age bound adds is the **station's own stricter limit**: an
> operator who wants a station to hold offline authority to a shorter window lowers its
> `OfflinePassMaxAge`, and the station refuses passes older than that. That is a belt on the same
> buckle, not a separate obligation. It is also the reason the list is still ten, and the reason
> check #5 is withdrawn in place rather than removed: "10 checks" is a cited count — it names a
> conformance case (`TC-OFF-002`), two chapter cross-references and further citations across the
> specification and the implementor's guide — and an ordinal that is cited is an identifier.

## 5. Revocation

**The revocation epoch belongs to the platform.** [Chapter 06 §6.6](../../06-security.md#66-epoch-based-revocation) is normative and this section summarizes it:

1. The platform holds **one** `RevocationEpoch`, starting at 0. Raising it is a platform governance action: only a Platform Admin ([`06-security.md` §3.1](../../06-security.md#31-rbac-roles)) raises it — no organization-scoped role can — and every station of every tenant holds the platform value.
2. When the server issues an OfflinePass, it embeds the current platform epoch in the pass's `revocationEpoch` field.
3. To revoke every outstanding pass, a Platform Admin raises `RevocationEpoch` by 1 and the server pushes the new value to every connected station via ChangeConfiguration.
4. Stations store the latest `RevocationEpoch` in non-volatile memory. During validation check #3, any pass with `revocationEpoch` less than the stored epoch is rejected with `2004 OFFLINE_EPOCH_REVOKED`.
5. A station that is offline when the epoch moves receives the new value when it reconnects, in the configuration of its BootNotification RESPONSE, or by ChangeConfiguration.

**Per-user revocation is enforced where the server is reachable.** Revoking one user's passes — one pass, or every pass of a user the server has blocked — marks the passes revoked on the server, from a recorded revocation moment, and that mark is read wherever the server is in the loop: on the online path, at Partial-B authorize time ([`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks) check #12, `2014 OFFLINE_PASS_REVOKED`) and at reconciliation ([`reconciliation.md` §6.1](reconciliation.md#61-check-list) check #11, `2014`). **A revocation applies to the washes after its moment (Normative):** at reconciliation the server judges a wash's time through the station's clock offset ([`reconciliation.md` §6.8](reconciliation.md#68-station-clock-offset)), refuses a wash that ended after the revocation moment, and settles normally a wash that ended before it. A station validating offline has no server to ask and does not learn it.

**What an offline station can refuse, and what it cannot.** A station validating a pass with no server connection can refuse on what it holds:

- the signature, against its server key set (check #1);
- expiry, and age against its own `OfflinePassMaxAge`, on its own clock (check #2);
- the last platform epoch it received (check #3);
- device binding (check #4);
- its own offline switch and limits (§2.2);
- the per-pass counters it keeps itself (checks #6--#10);
- the availability of the bay and service requested.

It **cannot** refuse on what only the server knows: a block or an individual revocation, whenever it was issued; an epoch the platform moved after the station last received configuration; use of the same pass at other stations; the user's current wallet balance; or which tenant's customer the user is — the last by design (§2.3). The server acts on the first three where it is reachable: at Partial-B authorize time, where each refuses ([`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks)), and at reconciliation, where revocation and the epoch refuse ([`reconciliation.md` §6.1](reconciliation.md#61-check-list)) and use at other stations is scored, never a cap: a wash that takes the pass past its totals is charged in full ([`reconciliation.md` §8](reconciliation.md#8-wallet-reconciliation)). The wallet balance gates no wash on a pass, on either path: a debit that leaves the wallet below zero leaves its transaction pending until a credit to the wallet covers it ([`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)).

**Trade-off.** Epoch revocation is coarse-grained: it revokes every pass issued before the bump, not one user's. That is acceptable because a pass that escapes a revocation — one presented to a station that has not heard of it — is still **bound to its device** (§2, `devicePublicKey`, whose possession every presentation proves — §4 check #4) and **limited at every station** (§2.1): what it can be delivered is bounded at each station by that station's own count of the pass (checks #6--#8) and its own offline limits (§2.2), and no wash is charged more than its station authorized for it ([`reconciliation.md` §8](reconciliation.md#8-wallet-reconciliation)). Washes at stations that could not see each other's use may together take the pass past its totals; each is charged in full, to the user's wallet. Its acceptability does not rest on a short lifetime: a pass may live ten days.

## 6. Lifecycle

The full lifecycle of an OfflinePass is as follows:

1. **Issuance:** The server issues the pass through the operation of [`app-contract.md` §3](app-contract.md#3-pass-issuance), which also returns the trust bundle the app needs offline. The server **MUST**:

   - issue a pass only to a user whose offline use it has enabled, and **MUST NOT** bind the pass to, or require the user to belong to, an organization (§2.3);
   - bind the pass to a device key: `devicePublicKey` **MUST** be the P-256 public key of a key pair the app generated in the phone's **hardware-backed keystore** with a **non-exportable** private key — on iOS the key App Attest generates in the Secure Enclave, on Android the hardware-backed Android Keystore, StrongBox where the device has it — and the server **MUST** have verified the platform's attestation that the key is hardware-backed, Android Key Attestation or Apple App Attest, before it issues a pass for it ([`app-contract.md` §3.6](app-contract.md#36-device-key-attestation)). A phone that cannot hold and attest such a key **MUST NOT** be issued an offline pass;
   - set `expiresAt` to `issuedAt` plus the **platform pass lifetime** — one platform-wide value, `offlinePassLifetimeSeconds`, applied to every pass at issuance. It defaults to **3 days** (`259200`) and **MUST NOT** exceed **10 days** (`864000`); a server **MUST NOT** issue a pass whose `expiresAt` is more than 864000 seconds after its `issuedAt`;
   - sign with a key of its current key set and set `keyId` to that key's identifier (§3);
   - populate the allowance from the user's wallet and the platform's offline policy, with `maxTotalCredits` never above the wallet balance at issuance; and issue no pass while that balance is not positive — zero or below ([`app-contract.md` §3.5](app-contract.md#35-refusals)) — issuing one again as soon as it is.

   `offlinePassLifetimeSeconds` is a **server-local** value, like `faultFullRefundThreshold` ([`04-flows.md` §6](../../04-flows.md#refund-policy)): named where an operator can find it and read from configuration, and deliberately **not** a Chapter 08 key, because no station holds it. JSON Schema cannot express a relation between two members, so no schema enforces the cap; it is stated normatively here.

   Both mobile platforms provide such a key, and attest it. On iOS, App Attest generates a P-256 key in the Secure Enclave, from which no process can read it, signs with it, and has Apple attest it to the server. On Android the Keystore generates EC P-256 keys whose key material never enters the application process, can bind them to secure hardware — the Trusted Execution Environment, or StrongBox — and states the key's security level in a key attestation certificate chain the server verifies. The platform documentation this rests on is cited in [`app-contract.md` §3.2](app-contract.md#32-the-device-key) and [§3.6](app-contract.md#36-device-key-attestation).

   **A station's own age limit is not the issuer's concern.** `OfflinePassMaxAge` ([`08-configuration.md` §5](../../08-configuration.md#5-offline--ble-configuration-keys)) is each station's own, stricter refusal threshold, which its operator may change at any time. The issuer cannot know which station will validate a pass — any station that accepts offline passes may (§2.3) — so it signs the platform lifetime and nothing else. A station whose `OfflinePassMaxAge` is below a pass's age refuses that pass with `2003` — on the Partial-B path the server refuses it for the station, with the same code, which the station relays to the app ([`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks), [§7](authorize-offline-pass.md#7-error-codes)) — and the refusal tells the app that its pass is too old for that station, not what the station's limit is.
2. **Storage:** The app stores the pass in encrypted secure storage (e.g., Android Keystore / iOS Keychain). The pass **MUST NOT** be stored in plaintext or in application-accessible storage. The private half of the device key never leaves the hardware-backed keystore.
3. **Pre-arming:** The app **MAY** request a new OfflinePass proactively (background pre-arming) before going offline, ensuring the user always has a valid pass available.

   3a. **Re-issuance (Normative).** The allowance in a pass is a **snapshot of the wallet at issue
   time**, and a snapshot is only as good as its age. Whenever it has connectivity, the app
   **MUST** request a fresh pass on each of the following, after uploading the receipts it holds
   ([`app-contract.md` §4.3](app-contract.md#43-rules)), and the server **MUST** issue one
   reflecting the wallet as it stands at that moment, unless it refuses issuance
   ([`app-contract.md` §3.5](app-contract.md#35-refusals)):

   | Trigger | Why |
   |---|---|
   | Application start | The wallet may have moved through any other channel while the app was closed — a web payment, a second device, an operator adjustment. |
   | Each consumption of the pass | The allowance the previous pass carried is now partly spent; re-issuing is what keeps the remaining figure true rather than letting the station's local counters be the only record. |
   | Each credit to the wallet the app learns of — a top-up it made, a refund it is told of | The balance, and with it the ceiling, has risen, and a credit that makes the balance positive is what allows a pass at all ([`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)). Without re-issuance the credit is invisible offline until the pass expires. |

   The app **SHOULD** treat a failed re-issuance as non-fatal and keep the pass it holds: the
   existing pass is still valid within its own bounds, and refusing to use it would deny service
   for a network failure. A re-issuance the server refuses ([`app-contract.md` §3.5](app-contract.md#35-refusals))
   leaves the pass the app holds as it was: valid within its own bounds unless the server revokes it, and
   still the latest the app was issued. This cadence is what makes the recomputation in
   [`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)
   affordable — for as long as the app has had a network, the figure the station validates against
   tracks the wallet, and the only divergence left is the window in which it has not, which §4
   check #2 bounds.
4. **Presentation:** During the BLE handshake, the app presents the OfflinePass to the station via the OfflineAuthRequest message. Before the customer chooses a service, the app **MUST** show the pass's limits (§2.1).
5. **Consumption:** The station (or server) decrements the remaining uses and credits. The station tracks per-pass usage locally via the `passId` and `counter`.

   > **One transaction consumes exactly one use (Normative).** A single offline transaction is counted against `maxUses` and `maxTotalCredits` **once**, however many times the server sees it. The server may meet the same transaction twice — at authorize-time in Partial B ([`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks) check #6, where the count is the server's cumulative usage, which a refused presentation does not advance) and again when the transaction settles ([`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions), whose cumulative factors count the pass's settled transactions fleet-wide) — and those are two views of one counter, not two counters. An implementation **MUST NOT** advance usage twice for one transaction. The value that makes this decidable is already on both wires and under the station's signature: `(passId, counter)` at authorize-time is `(offlinePassId, passCounter)` at reconcile, and [`reconciliation.md` §6.1](reconciliation.md#61-check-list) check #13 already requires that pair be globally unique. Advancing the counter under that key is idempotent by construction. A Partial-B session that settles online reports its end in a SessionEnded — or in the StopService RESPONSE, when the server stopped it — and neither carries that pair; the server joins it to its authorization through the `sessionId` of its AuthorizeOfflinePass answer, which the station uses in the session's MeterValues and SessionEnded and which a server StopService names ([`authorize-offline-pass.md` §6](authorize-offline-pass.md#6-processing-rules); [`04-flows.md` §5c](../../04-flows.md#5c-partial-b--phone-offline-station-online)). The session's receipt carries the pair, and the session settles once, on whichever of its end records arrives first, or on the server's close at the end of its authorized duration when none has ([`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid)).
   >
   > **The two counters also hold two different quantities, and that is the second half of the
   > defect.** At authorize-time the only figure available is an **estimate** — the cost the server
   > projects for the requested service and duration. At settlement the figure is what the transaction
   > **settled** for: the actual delivered cost, recomputed by the server — from the signed receipt at
   > reconciliation ([`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)), or from the
   > reported end when a Partial-B session settles online
   > ([`04-flows.md` §5c](../../04-flows.md#5c-partial-b--phone-offline-station-online)) — and capped as [`reconciliation.md` §8](reconciliation.md#8-wallet-reconciliation) states,
   > at what its station authorized for the wash.
   > Adding the second to the first counts one transaction twice **and** at two different
   > valuations. The authorize-time advance is therefore **provisional**: the server **MUST**
   > replace it with the settled amount when the transaction settles, and **MUST NOT** add to
   > it. A pass that was authorized and whose transaction never settled keeps its provisional figure, which is the
   > conservative direction and the one that cannot overspend. The cumulative credits factor of
   > [`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions) reads the same transactions at their cost before the cap,
   > which is what each wash delivered.
   >
   > This is stated because the two sites read as independent obligations and were implemented as
   > independent counters — measured, a `maxUses: 5` pass burns two uses per transaction and sums
   > an estimate with an actual into one `maxTotalCredits` total.
6. **Expiry:** The pass becomes invalid after `expiresAt`, and at a given station once it is older than that station's `OfflinePassMaxAge` (§4 check #2 applies both bounds). These are two **independent** bounds: `expiresAt` is the platform lifetime, signed into the pass at issue, while `OfflinePassMaxAge` is the station's own stricter limit, which its operator can lower at any time. Neither caps the other. The app **SHOULD** request a new pass before the current one expires, and re-issuing it at every app start, use and credit to the wallet the app learns of makes that the normal case rather than the exception.
7. **Revocation:** The pass becomes invalid at every station once the platform epoch exceeds the pass's `revocationEpoch`, and wherever the server is reachable, for the washes after it is individually revoked (§5).

## 7. Security Properties

The OfflinePass provides the following security guarantees:

| Property | Mechanism | Description |
|----------------------|-----------------------------|--------------------------------------------|
| **Non-transferable** | `devicePublicKey` and the device proof | The pass is bound to the device whose hardware-backed keystore holds the private key of `devicePublicKey` (§6). Every presentation proves possession of that key over its own handshake and station (check #4), so a copied pass presented by another device is refused, and a proof is never valid at a second station. |
| **Non-forgeable** | ECDSA P-256 signature, `keyId` | The pass is signed by a key of the server's key set, named by `keyId`. Modifying any field invalidates the signature (check #1). |
| **Time-limited** | `expiresAt`, `OfflinePassMaxAge` | The pass is valid for the platform lifetime — 3 days by default, never more than 10 days — and at each station for no longer than that station's own `OfflinePassMaxAge` (check #2). |
| **Revocable** | `revocationEpoch`, the server's revoked mark | Every outstanding pass can be batch-revoked by incrementing the platform epoch (check #3); one user's passes are revoked individually wherever the server is reachable (§5). |
| **Usage-limited** | `maxUses`, `maxTotalCredits`, `maxCreditsPerTx` | The pass limits the number of sessions, the credits across them and the credits of any one (checks #6, #7, #8). A request above a limit is refused, never reduced (§2.1), and settlement never charges a wash more than its station authorized ([`reconciliation.md` §8](reconciliation.md#8-wallet-reconciliation)). |
| **Rate-limited** | `minIntervalSec` | Prevents rapid consecutive use that could indicate abuse (check #9). |
| **Replay-protected** | Monotonic counter | The `counter` field in OfflineAuthRequest prevents replaying the same pass presentation (check #10). |

## 8. Related Schemas

- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- OfflinePass ID: [`offline-pass-id.schema.json`](../../../schemas/common/offline-pass-id.schema.json)
- BLE Auth Request: [`offline-auth-request.schema.json`](../../../schemas/ble/offline-auth-request.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2002--2005, 2014, 4002--4004)
- Security model: [Chapter 06 — Security](../../06-security.md) (section 6, Offline Security)
