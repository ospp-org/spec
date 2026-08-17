# OfflinePass Structure

> **Status:** Draft | **OSPP Version:** 0.20.2

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

The station **MUST** perform all 10 checks below. Processing **MUST** stop at the first failure. (In the **Partial B** scenario the **server** runs the same credential checks and additionally applies an org-binding check — see [`authorize-offline-pass.md` §5](authorize-offline-pass.md#5-validation-checks-11-checks) check #11, errorCode `2015` — for 11 checks total. The org check is server-side because it compares against the server's stored pass record; the station, validating offline, cannot perform it without `organization_id` in the signed pass, which is deferred to D5.)

> **Implementation note:** Implementations **SHOULD** validate structural integrity (required fields, types, valid base64 signature) before check #1. This avoids the expensive ECDSA verification on malformed payloads. Structural failures use `2002 OFFLINE_PASS_INVALID`.

| # | Check | Error on Failure | Description |
|:--:|-----------------------------------------------|-------------------------------|-----------------------------------------------|
| 1 | **Signature verification** | `2002 OFFLINE_PASS_INVALID` | Verify ECDSA P-256 signature against server public key. |
| 2 | **Not expired** | `2003 OFFLINE_PASS_EXPIRED` | `expiresAt` **MUST** be greater than the current time. |
| 3 | **Revocation epoch valid** | `2004 OFFLINE_EPOCH_REVOKED` | `revocationEpoch` **MUST** be >= the station's stored `RevocationEpoch`. |
| 4 | **Device binding** | `2002 OFFLINE_PASS_INVALID` | `deviceId` in the pass **MUST** match the device presenting it. |
| 5 | **Station allowed** | `2006 OFFLINE_STATION_MISMATCH` | The station's ID **MUST** be permitted by pass constraints (when station-scoped). |
| 6 | **Usage count** | `4002 OFFLINE_LIMIT_EXCEEDED` | Number of uses **MUST NOT** exceed `maxUses`. |
| 7 | **Total credits** | `4002 OFFLINE_LIMIT_EXCEEDED` | Cumulative credits charged **MUST NOT** exceed `maxTotalCredits`. |
| 8 | **Per-transaction credits** | `4004 OFFLINE_PER_TX_EXCEEDED` | Estimated cost for the requested service **MUST NOT** exceed `maxCreditsPerTx`. |
| 9 | **Rate limit** | `4003 OFFLINE_RATE_LIMITED` | At least `minIntervalSec` seconds **MUST** have elapsed since last use of this pass. |
| 10 | **Counter anti-replay** | `2005 OFFLINE_COUNTER_REPLAY` | `counter` **MUST** be strictly greater than `lastSeenCounter` for this pass on this station. |

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
2. **Storage:** The app stores the pass in encrypted secure storage (e.g., Android Keystore / iOS Keychain). The pass **MUST NOT** be stored in plaintext or in application-accessible storage.
3. **Pre-arming:** The app **MAY** request a new OfflinePass proactively (background pre-arming) before going offline, ensuring the user always has a valid pass available.
4. **Presentation:** During the BLE handshake, the app presents the OfflinePass to the station via the OfflineAuthRequest message.
5. **Consumption:** The station (or server) decrements the remaining uses and credits. The station tracks per-pass usage locally via the `passId` and `counter`.
6. **Expiry:** The pass becomes invalid after `expiresAt`, configurable via `OfflinePassMaxAge` (see §8 Configuration). The app **SHOULD** request a new pass before the current one expires.
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
