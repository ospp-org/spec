# OfflinePass Structure

> **Status:** Draft

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

## 3. Signing (ECDSA P-256)

The server signs the OfflinePass using ECDSA P-256 with SHA-256 (FIPS 186-4). The signing process is as follows:

1. **Canonical JSON serialization** -- all fields of the OfflinePass (excluding `signature` and `signatureAlgorithm`) are serialized to a canonical JSON string. Keys **MUST** be sorted lexicographically, and no extraneous whitespace **MUST** be present.
2. **ECDSA P-256 signing** -- the SHA-256 digest of the canonical JSON byte sequence is signed using the server's ECDSA P-256 private key.
3. **Base64 encoding** -- the resulting DER-encoded signature is Base64-encoded and placed in the `signature` field.
4. **Verification** -- the station verifies the signature using the server's ECDSA P-256 public key, which is provisioned during BootNotification or via ChangeConfiguration. The station **MUST** reject any pass that fails signature verification with error `2002 OFFLINE_PASS_INVALID`.

The server **MUST** rotate signing keys periodically. Key rotation is communicated to stations via ChangeConfiguration with the `OfflinePassPublicKey` key (an ECDSA P-256 public key in uncompressed or compressed SEC1 format). Stations **MUST** accept passes signed by the current key or the immediately previous key (to handle rotation race conditions).

## 4. Validation Checks (10)

The station (or server, in Partial B) **MUST** perform all 10 checks. Processing **MUST** stop at the first failure.

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

1. **Issuance:** The server creates the pass, populates all fields based on the user's wallet balance and the operator's offline policy, signs it with ECDSA P-256, and delivers it to the app via HTTPS.
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
| **Station-scoped** | Station ID validation | When station-scoped, the pass is only valid at specific stations (check #5). |
| **Replay-protected** | Monotonic counter | The `counter` field in OfflineAuthRequest prevents replaying the same pass presentation (check #10). |

## 8. Related Schemas

- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- OfflinePass ID: [`offline-pass-id.schema.json`](../../../schemas/common/offline-pass-id.schema.json)
- BLE Auth Request: [`offline-auth-request.schema.json`](../../../schemas/ble/offline-auth-request.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2002--2006, 4002--4004)
- Security model: [Chapter 06 — Security](../../06-security.md) (section 6, Offline Security)
