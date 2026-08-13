# BLE Handshake Protocol

> **Status: EXPERIMENTAL** | **OSPP Version:** 0.19.0
>
> Published for review, **not** for implementation. May change incompatibly without a MAJOR
> bump. See [Release status](../../../README.md#ble-is-experimental-in-08) and the three
> blockers in [KNOWN-ISSUES](../../../KNOWN-ISSUES.md#blocker--the-ble-surface-is-not-implementable-as-written-three-defects).
>
> Two bear directly on this document: the `AuthResponse` rejection shape is blocker
> [B-3](../../../KNOWN-ISSUES.md#b-3--the-three-ble-response-schemas-disagree-with-each-other-and-with-chapter-07)
> (its schema carries flat `reason` + `errorCode`, where [Chapter 07 §2.3](../../07-errors.md)
> mandates a nested seven-field `error` object), and the `2006 OFFLINE_STATION_MISMATCH`
> row in this document's error table is blocker
> [B-2](../../../KNOWN-ISSUES.md#b-2--a-station-scoped-offlinepass-is-unrepresentable-in-the-authoritative-schema)
> (the pass cannot carry the constraint the station is asked to check).

## 1. Handshake Overview

The BLE handshake establishes a secure, authenticated session between the mobile app and the station. It follows a four-step sequence: HELLO, CHALLENGE, Authentication, and AuthResponse. The handshake **MUST** complete within 10 seconds from the first Hello write; if it does not, both parties **MUST** abort and the station **MUST** report error `2013 BLE_AUTH_FAILED`.

**Timing model (Non-normative).** The station measures the 10-second budget from **t₀ = reception of the first `Hello` write**; the app measures the same budget from when it issues that write. Implementers MAY apportion the budget across the four steps as internal sub-deadlines (for example, a small fixed share to reach `Challenge` and the remainder for `Authentication` + `AuthResponse`), but any such per-step figures are guidance only, not normative limits. The 5-second fragmentation/reassembly timeout ([ble-transport.md §11](ble-transport.md)) is a **per-message** bound that runs *inside* this total budget rather than in addition to it: the fragments of any single message that take longer than 5 s are discarded, and the handshake as a whole still has only the one 10-second envelope to complete.

## 2. Step 1: Hello

The app initiates the handshake by writing a Hello message to characteristic FFF3.

**Payload:**

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `Hello` (constant). |
| `deviceId` | string | Yes | Unique device identifier for the mobile app. |
| `appNonce` | string | Yes | Base64-encoded 32-byte cryptographically random nonce (exactly 44 Base64 characters). |
| `appVersion` | string | Yes | Semantic version of the mobile application. |
| `appEphemeralPubKey` | string | Yes | App's per-handshake ephemeral P-256 public key, compressed SEC1, Base64 (44 chars; [06-security.md §6.5.2](../../06-security.md#652-stationidentity-certificate) Pin 2). Combined with the station's keys to derive the session key (§6). Freshly generated per handshake; discarded after the session. |

The `appNonce` serves two purposes:
1. **Replay protection** -- ensures each handshake is unique.
2. **Key derivation input** -- combined with the station nonce in the IKM (see section 6).

`appEphemeralPubKey` is the app's contribution to the ECDH exchange (§6); the app generates a fresh P-256 key pair per handshake.

**Example:**

```json
{
  "type": "Hello",
  "deviceId": "dev_a8f3bc12e4567890",
  "appNonce": "k7Rz2mPqXvN8dF5sYwB1cA0hJ6tL9oKe3iGnUxMpWbQ=",
  "appVersion": "2.1.0",
  "appEphemeralPubKey": "AjRkc2Vzc2lvbi1lcGhlbWVyYWwtcHVia2V5LWFwcDEy"
}
```

> The `appEphemeralPubKey` above is an illustrative 44-character Base64 placeholder; conformance vectors carry real compressed-SEC1 keys (regenerated under [`tools/`](../../../tools) per the v0.6.0 vector batch).

## 3. Step 2: Challenge

The station responds to the Hello by sending a Challenge notification on characteristic FFF4.

**Payload:**

| Field | Type | Required | Description |
|-----------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `Challenge` (constant). |
| `stationNonce` | string | Yes | Base64-encoded 32-byte cryptographically random nonce (exactly 44 Base64 characters). |
| `stationCert` | object | Yes | Server-signed StationIdentity certificate ([06-security.md §6.5.2](../../06-security.md#652-stationidentity-certificate); [`station-identity.schema.json`](../../../schemas/ble/station-identity.schema.json)). The app **MUST** verify its signature and expiry before sending any credential. Carries the station's static BLE ECDH key (`stationPubKey`) and authenticated `stationId`/`organizationId`. |
| `stationEphemeralPubKey` | string | Yes | Station's per-handshake ephemeral P-256 public key, compressed SEC1, Base64 (44 chars; §6.5.2 Pin 2). Provides forward secrecy (`ee` in §6). Freshly generated per handshake. |
| `stationConnectivity` | string | Yes | `"Online"` or `"Offline"` -- determines which auth path the app **MUST** use. |
| `availableServices` | array | No | Optional snapshot of bay/service availability. |

The `stationConnectivity` field is critical for path selection:
- **`"Online"`** -- the station has MQTT connectivity. The app **MAY** use ServerSignedAuth (Partial A) or OfflineAuthRequest (Partial B, relayed to server).
- **`"Offline"`** -- the station has no MQTT connectivity. The app **MUST** use OfflineAuthRequest with a locally-stored OfflinePass (Full Offline).

`stationCert` and `stationEphemeralPubKey` together let the app authenticate the station and complete the ECDH exchange (§6). The app **MUST** verify `stationCert` (§6.5.2 app verification gate) **before** transmitting any OfflinePass or ServerSignedAuth; on verification failure it aborts with `2013 BLE_AUTH_FAILED` and sends no credential.

**Example:**

```json
{
  "type": "Challenge",
  "stationNonce": "Qm4xR9vTfH2wLpZjK0sNcYgX5uOdA8rE1iBn6CtJkWe=",
  "stationCert": {
    "stationId": "stn_a1b2c3d4",
    "organizationId": "org_7f3a9c2e1b5d",
    "stationPubKey": "AymtZXJ2ZXItZXBoZW1lcmFsLXB1YmtleS1zdGF0aW9u",
    "issuedAt": "2026-02-13T00:00:00.000Z",
    "expiresAt": "2026-02-20T00:00:00.000Z",
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEUCIQDXKT0ewRBp/nkPY/qh6mBjwSn4BE7fmjDTdjcP1dhIyQIgPyXM1VnFZtrG6WaOgpRwiQIeFF2I2zeFsb05dyel1rE="
  },
  "stationEphemeralPubKey": "AzN0YXRpb24tZXBoZW1lcmFsLXB1YmtleS1jaGFsbGVu",
  "stationConnectivity": "Offline",
  "availableServices": [
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_standard", "available": true }
  ]
}
```

> The `stationCert` signature and the two compressed-SEC1 public keys above are illustrative placeholders; conformance vectors carry real values regenerated under the v0.6.0 vector batch.

## 4. Step 3: Authentication

After receiving the CHALLENGE, the app **MUST** derive the session key (section 6) and then send one of two authentication messages depending on the connectivity scenario.

### 4.1 OfflineAuthRequest (Full Offline / Partial B)

Used when the app has a locally-stored OfflinePass. In the **Full Offline** scenario, the station validates the pass locally. In the **Partial B** scenario (station online), the station forwards the pass to the server via the AuthorizeOfflinePass MQTT action.

**Payload:**

| Field | Type | Required | Description |
|----------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `OfflineAuthRequest` (constant). |
| `offlinePass` | object | Yes | Full OfflinePass object (see [offline-pass.md](offline-pass.md)). |
| `counter` | integer | Yes | Monotonic usage counter (minimum 0). **MUST** be strictly greater than the last counter seen by the station for this pass. |
| `sessionProof` | string | Yes | Base64-encoded HMAC-SHA256 (exactly 44 chars) binding this request to the derived session key. Canonical construction defined in this section. |

The `sessionProof` construction is **canonical and defined here** ([06-security.md §6.5.1](../../06-security.md#651-sessionproof-computation-normative) points to this section — finding N1):

```
sessionProof = Base64( HMAC-SHA256( SessionKey,
                 LP(UTF8("OfflineAuthRequest")) ‖ LP(UTF8(passId)) ‖ LP(UTF8(decimal(counter))) ) )
```

where `SessionKey` is the ECDH-derived session key ([06-security.md §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256)); `LP(x) = U16BE(byteLength(x)) ‖ x` is **the same length-prefix encoding used for the HKDF `info` and the transcript** ([06-security.md §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256) Pin 3 / Pin 4); `"OfflineAuthRequest"` is the literal message-type string; `passId` is `offlinePass.passId`; and `decimal(counter)` is the `counter` value rendered as its **shortest base-10 ASCII string** (no leading zeros, no sign). Length-prefixing each component makes the input **injective** — no two distinct `(passId, counter)` tuples can ever produce the same byte string — which the v0.5.x empty concatenation did not guarantee (e.g. `("opass_a", 15)` and `("opass_a1", 5)` both concatenated to `…opass_a15`). The output is Base64 (RFC 4648, standard alphabet, with padding) — exactly **44 characters**. A `sessionProof` that does not match the station's own computation **MUST** be rejected with error `2013 BLE_AUTH_FAILED`.

The prior 4-input hex construction (which additionally bound `bayId`/`serviceId`, output as 64 hex chars) is **withdrawn** in v0.6.0: under the AEAD channel ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel)) bay/service selection happens at the authenticated `StartService` step, so the proof binds only `(passId, counter)` to the session. The reference tooling (`tools/verify-example-signatures.mjs`, `tools/sign-example.mjs`, `tools/sign-inline-md.mjs`) computes exactly this length-prefixed form; spec and tooling are aligned in the same change.

**Example:**

```json
{
  "type": "OfflineAuthRequest",
  "offlinePass": {
    "passId": "opass_a8b9c0d1e2f3",
    "sub": "sub_xyz789",
    "deviceId": "device_a8f3bc12e4567890",
    "issuedAt": "2026-02-13T06:00:00.000Z",
    "expiresAt": "2026-02-14T06:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30,
      "allowedServiceTypes": [
        "svc_eco",
        "svc_standard"
      ]
    },
    "constraints": {
      "minIntervalSec": 60,
      "stationOfflineWindowHours": 72,
      "stationMaxOfflineTx": 100
    },
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEUCIQD6sC/bKX/fkNskHHEGr01INojLAlu4I6zsEm1keSjYoQIgJAjdhwiYhlQOX/BAqsFq9RRgxpXGSXJU6BeL0qMBnMc="
  },
  "counter": 5,
  "sessionProof": "ObgxpE1Ad+xl6P8fRWtBstqMY2Tjan9oK/LIWofxvrI="
}
```

> The `sessionProof` above is illustrative (Base64-encoded HMAC-SHA256, 44 chars). It does not correspond to the example fields shown; the canonical construction is defined in §4.1 above. (On the wire this `OfflineAuthRequest` travels inside the §6.5.3 AEAD frame; the plaintext is shown here for clarity.)

### 4.2 ServerSignedAuth (Partial A)

Used when the app is online but the station is offline. The app obtains a server-signed authorization (via `POST /sessions/offline-auth`, supplying the same `appNonce` it uses in the `Hello` of this handshake so the server binds the authorization to it — see **Acquisition ordering** below) and relays it to the station over BLE. The station verifies the ECDSA P-256 signature using the server's public key (provisioned at boot) and re-checks each claim against the live handshake state. Like every post-Challenge message, `ServerSignedAuth` is relayed **inside the AEAD channel** ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel)).

**Acquisition ordering (Normative).** The `appNonce` is chosen by the app and is the sole binding between the `POST` and the BLE handshake (§4.2.2 check #2), so the `POST /sessions/offline-auth` and the `Hello` write **MAY** occur in either order, provided the `appNonce` in the POST body equals the `appNonce` in the `Hello`. Two orderings are conformant:

- **Pre-fetch** (RECOMMENDED when the app already knows the target `stationId` — e.g. from a scanned code or a prior advertisement): POST first, then write `Hello` carrying the same `appNonce`. This keeps the server round-trip out of the 10-second handshake budget (§1).
- **Post-Challenge**: write `Hello`, read the `Challenge`, then POST and relay `ServerSignedAuth`. This is the ordering drawn in §8.2; here the POST and the relay both run inside the handshake budget, and the server's `expiresAt ≤ issuedAt + 5 min` bound (§4.2.1) must still hold when the station evaluates the relayed authorization.

The sequence diagrams in §8.2 and [04-flows.md §5b](../../04-flows.md) each show one valid ordering and are illustrative, not exclusive.

**Payload:**

| Field | Type | Required | Description |
|----------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `ServerSignedAuth` (constant). |
| `signedAuthorization` | object | Yes | Signed authorization wrapper — see [`server-signed-auth.schema.json`](../../../schemas/common/server-signed-auth.schema.json). |
| `sessionId` | string | Yes | Session identifier assigned by the server. |

The `signedAuthorization` object has shape `{data, signature, signatureAlgorithm}` — sibling to the receipt wrapper (`06-security.md` §6.2). `data` is a Base64-encoded OSPP-canonical JSON body (the claims defined in §4.2.1); `signature` is a Base64-encoded DER ECDSA P-256 signature over the canonical bytes; `signatureAlgorithm` is `"ECDSA-P256-SHA256"`.

#### 4.2.1 Signing Process (Server-Side)

The server **MUST** sign the authorization following the same canonical-form + ECDSA-P256 + RFC 6979 pattern used for transaction receipts (`06-security.md` §6.2):

```
1. claims = {
     authId, sub, deviceId, sessionId, stationId,
     bayId, serviceId, durationSeconds, creditsAuthorized,
     appNonce, issuedAt, expiresAt,
   }                                  // 12 claims — see server-signed-auth-claims.schema.json (N3)
2. data_bytes = OSPP_Canonical_Form(claims)       // §4.8
3. digest     = SHA-256(data_bytes)               // hash the canonical bytes directly
4. signature  = ECDSA-P256-Sign(server_private_key, digest)  // RFC 6979 deterministic nonce
5. signedAuthorization = {
     data:               base64(data_bytes),
     signature:          base64(signature),
     signatureAlgorithm: "ECDSA-P256-SHA256",
   }
```

The `appNonce` claim **MUST** equal the `appNonce` the app uses in the `Hello` message of this handshake (in either acquisition order — see §4.2) — the server reads it from the `POST /sessions/offline-auth` request body. The `expiresAt` claim **MUST** be no later than five minutes after `issuedAt`; `appNonce` provides the primary, clock-independent replay defence (§4.2.2 check #2) and `expiresAt` is a secondary bound.

#### 4.2.2 Verification (Station-Side)

The station **MUST** apply the following checks before accepting a `ServerSignedAuth`. Checks **MUST** be evaluated in the listed order; on the first failure the station **MUST** reject with the indicated error code.

| # | Check | Error code |
|:-:|---|---|
| 1 | ECDSA P-256 signature verifies against the server's verify key over `base64_decode(signedAuthorization.data)` | `2002 OFFLINE_PASS_INVALID` |
| 2 | `claims.appNonce == Hello.appNonce` from the current handshake | **`2018 SERVER_AUTH_NONCE_MISMATCH`** |
| 3 | `claims.stationId == STATION_OWN_ID` (no cross-station replay) | `2002 OFFLINE_PASS_INVALID` |
| 4 | `claims.deviceId == Hello.deviceId` (device binding) | `2002 OFFLINE_PASS_INVALID` |
| 5 | `claims.sessionId == envelope.sessionId` (envelope binding) | `2002 OFFLINE_PASS_INVALID` |
| 6 | `claims.expiresAt > NOW` (clock-skew margin; `appNonce` is the primary defence) | `2002 OFFLINE_PASS_INVALID` |

**Anti-replay model (layered).** Since v0.6.0 `ServerSignedAuth` is relayed **inside the AEAD channel** (§6.5.3), which is the **first** anti-replay barrier: a captured frame is ciphertext under the originating session's directional key and cannot be injected into a different handshake (each handshake derives a fresh key). **Behind** the channel, the `appNonce` check (#2) is the **claim-layer** defence and is clock-independent: because every `Hello.appNonce` is a 32-byte cryptographically random value never reused across handshakes (§2), a `ServerSignedAuth` whose `appNonce` claim does not match the current `Hello.appNonce` is rejected regardless of system clock state — even in the (now-redundant) event the channel protection were bypassed. `expiresAt` is a **secondary** time bound limiting the same-handshake window against the server's clock; it is not a substitute for the nonce check. (Pre-v0.6.0, before the AEAD channel existed, the `appNonce` check was itself the primary barrier; v0.6.0 places the channel in front of it as defense-in-depth.)

**Example:**

```json
{
  "type": "ServerSignedAuth",
  "signedAuthorization": {
    "data": "eyJhcHBOb25jZSI6IjdKbm1rUlNyUkw0MmZocVI4VklYeTBMbmJFRHN4U2FYMTlOK1Y5b2dJUWc9IiwiYXV0aElkIjoiYXV0aF80YzE1OWMxNTlkNzAiLCJiYXlJZCI6ImJheV9lZDMwOTY5ZDljMGIiLCJjcmVkaXRzQXV0aG9yaXplZCI6MjAwLCJkZXZpY2VJZCI6ImRldl82NmU5Zjg4MzliODhhNWQ1IiwiZHVyYXRpb25TZWNvbmRzIjozMDAsImV4cGlyZXNBdCI6IjIwMjYtMDItMTNUMTA6MDU6MDAuMDAwWiIsImlzc3VlZEF0IjoiMjAyNi0wMi0xM1QxMDowMDowMC4wMDBaIiwic2VydmljZUlkIjoic3ZjX2VjbyIsInNlc3Npb25JZCI6InNlc3NfYjNjNGQ1ZTYiLCJzdGF0aW9uSWQiOiJzdG5fYWFlMTc3YjUiLCJzdWIiOiJzdWJfZTMxZTc3ZjMxZTkyMjY3NiJ9",
    "signature": "MEQCIFITZQ1OSAW5H0RbWVm5sd5mfhI6NxmxMEP8T5y4f2m/AiBi6eJozvUjYO7L4I777IC1b8FCwX6fJD1oW48Tr1jgaA==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "sessionId": "sess_b3c4d5e6"
}
```

> Conformance vectors (`conformance/test-vectors/valid/offline/server-signed-auth-*.json`) carry signatures produced by the synthetic `conformance/test-keys/server-test-key.pem`; verify with `conformance/test-keys/server-test-pub.pem` via `tools/verify-example-signatures.mjs`.

## 5. Step 4: AuthResponse

The station evaluates the authentication request and sends an AuthResponse notification on characteristic FFF4.

**Payload:**

| Field | Type | Required | Description |
|--------------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `AuthResponse` (constant). |
| `result` | string | Yes | `Accepted` or `Rejected`. |
| `sessionKeyConfirmation` | string | Cond. | HMAC confirmation of the shared session key. **MUST** be present when `result` is `Accepted`; **MUST NOT** be present when `result` is `Rejected`. |
| `reason` | string | Cond. | Human-readable rejection reason code. Present when `result` is `Rejected`. |
| `errorCode` | integer | Cond. | Numeric OSPP error code. Present when `result` is `Rejected`. |

On `Accepted`, the `sessionKeyConfirmation` field proves to the app that the station also derived the same session key. It is computed as `HMAC-SHA256(sessionKey, "AuthResponse_OK")`, Base64-encoded (44 chars), where the key is the **raw 32-byte session key** — the derived value itself, never its Base64 text ([`06-security.md` §5.4](../../06-security.md#54-mac-computation)). It **MUST** be present when `result` is `Accepted` and **MUST NOT** be present when `result` is `Rejected`. Because this AuthResponse travels inside the AEAD channel (§6.5.3), the frame's own Poly1305 tag already proves the station holds a key derived from the session key; `sessionKeyConfirmation` is therefore an explicit, defense-in-depth key-confirmation behind the channel, not the primary proof.

The AuthResponse, like all post-Challenge messages, travels **inside the AEAD channel** ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel)). A `Rejected` AuthResponse emitted after a completed handshake is therefore authenticated by the channel — a third party cannot forge or inject a fake rejection (finding N17). Only a pre-key rejection (e.g. a malformed Hello, rejected before any key is derived) is unauthenticated; this residual is acceptable and disclosed.

**Example (Accepted):**

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "uo31nIXlLPNLPc8rCOeJWYwbDh/ycVRE692174J5jp0="
}
```

**Example (Rejected):**

```json
{
  "type": "AuthResponse",
  "result": "Rejected",
  "reason": "OFFLINE_PASS_EXPIRED",
  "errorCode": 2003
}
```

## 6. Session Key Derivation (HKDF-SHA256)

> **Note:** The normative key-derivation construction is defined in [Chapter 06 — Security §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256). This section mirrors it for implementer convenience; on any discrepancy, §6.5 governs.

Both the app and the station **MUST** derive a shared session key using HKDF-SHA256 (RFC 5869) over a **two-operation ECDH P-256 exchange** (the BLE Long-Term Key is NOT used — it is unobtainable by a mobile app; see [ADR-002](../../../adr/ADR-002-ble-handshake-security-architecture.md)) with the following parameters:

| Parameter | Value |
|-----------|-----------------------------------------------|
| **IKM** | `es ‖ ee ‖ appNonce ‖ stationNonce` (4 × 32 bytes). `es = ECDH(appEphemeralPriv, stationStaticPub)`, `ee = ECDH(appEphemeralPriv, stationEphemeralPub)`. Each ECDH secret is the X-coordinate, big-endian, 32 bytes, zero-left-padded (06-security §6.5 Pin 1). `appNonce`/`stationNonce` are the decoded 32-byte nonce values. |
| **Salt** | UTF-8 bytes of `"OSPP_BLE_SESSION_V2"` |
| **Info** | `LP(deviceId) ‖ LP(transcriptHash)`, where `LP(x) = U16BE(len(x)) ‖ x` and `transcriptHash = SHA-256(LP16(helloBytes) ‖ LP16(challengeBytes))` over the raw reassembled wire bytes (06-security §6.5 Pin 3/Pin 4). `stationId` is **not** a separate `info` component — it is already bound via `transcriptHash`, which covers the whole Challenge including the StationIdentity certificate that carries the authenticated `stationId` (§3; [06-security.md §6.5.2](../../06-security.md#652-stationidentity-certificate)). |
| **Output** | 32 bytes (256-bit session key) |

**Pseudocode:**

```
es = ECDH(appEphemeralPriv, stationStaticPub)    // station's certified static BLE key
ee = ECDH(appEphemeralPriv, stationEphemeralPub) // forward secrecy
SessionKey = HKDF-SHA256(
  ikm    = es ‖ ee ‖ appNonce ‖ stationNonce,    // each 32 bytes, in this order
  salt   = "OSPP_BLE_SESSION_V2",
  info   = LP(deviceId) ‖ LP(transcriptHash),     // stationId is bound via transcriptHash, not duplicated
  length = 32 bytes
)
```

The derived session key is used for:
1. Computing the `sessionProof` in OfflineAuthRequest (§4.1).
2. Computing the `sessionKeyConfirmation` in AuthResponse (§5).
3. Expanding the directional AEAD keys `k_app_to_station` / `k_station_to_app` that encrypt-and-authenticate **all** post-Challenge messages (06-security §6.5.3). Post-Challenge plaintext is NOT permitted.

The app **MUST** verify the StationIdentity certificate (06-security §6.5.2) before sending any OfflinePass. Both parties **MUST** use cryptographically secure random number generators for the ephemeral key pairs and nonces. Ephemeral keys and nonces **MUST NOT** be reused across handshakes.

## 7. Rejection Reasons

The following rejection reason codes **MAY** appear in the AuthResponse `reason` field:

| Reason Code | Error Code | Description |
|----------------------------|:----------:|-----------------------------------------------|
| `OFFLINE_PASS_INVALID` | 2002 | ECDSA P-256 signature verification failed. |
| `OFFLINE_PASS_EXPIRED` | 2003 | Pass `expiresAt` has passed. |
| `OFFLINE_EPOCH_REVOKED` | 2004 | Pass revocation epoch is below the station's stored epoch. |
| `OFFLINE_COUNTER_REPLAY` | 2005 | Counter is not greater than the last seen value. |
| `OFFLINE_STATION_MISMATCH` | 2006 | Station not permitted by the pass constraints. |
| `BLE_AUTH_FAILED` | 2013 | Session key derivation or session proof is invalid. |
| `OFFLINE_LIMIT_EXCEEDED` | 4002 | Pass `maxUses` or `maxTotalCredits` exhausted. |
| `OFFLINE_RATE_LIMITED` | 4003 | `minIntervalSec` not elapsed since last use. |
| `OFFLINE_PER_TX_EXCEEDED` | 4004 | Requested service exceeds `maxCreditsPerTx`. |

## 8. Sequence Diagrams

### 8.1 Full Offline Handshake

```
  App (Central)                       Station (Peripheral)
      |                                       |
      |--- Hello (FFF3 Write) -------------->|
      |    { type, deviceId, appNonce,        |
      |      appVersion, appEphemeralPubKey } |
      |                                       |
      |<-- Challenge (FFF4 Notify) ----------|
      |    { type, stationNonce, stationCert, |
      |      stationEphemeralPubKey,          |
      |      stationConnectivity: "Offline" } |
      |                                       |
      |  [App verifies stationCert; aborts    |
      |   if invalid — no pass is sent]       |
      |  [Both derive SessionKey via ECDH+    |
      |   HKDF; AEAD channel established]      |
      |                                       |
      |=== OfflineAuthRequest (FFF3) ======>|   (AEAD frame {n, ct})
      |    { type, offlinePass, counter,      |
      |      sessionProof }                   |
      |                                       |
      |    [Station validates locally:        |
      |     signature, expiry, epoch,         |
      |     counter, limits, sessionProof]    |
      |                                       |
      |<== AuthResponse (FFF4 Notify) ======|   (AEAD frame {n, ct})
      |    { type, result: "Accepted",        |
      |      sessionKeyConfirmation }         |
      |                                       |
      |  ( === = encrypted AEAD channel,      |
      |    §6.5.3; --- = plaintext )          |
```

> The Partial A and Partial B diagrams below share §8.1's extended Hello/Challenge (carrying the ephemeral public keys and `stationCert`), the same mandatory `stationCert` verification before any credential is sent, and the same AEAD channel (§6.5.3) for every post-Challenge message. They omit those details for brevity.

### 8.2 Partial A Handshake (Station Offline, App Online)

```
  App (Central)           Server              Station (Peripheral)
      |                      |                        |
      |--- Hello (FFF3) --------------------------->|
      |                      |                        |
      |<-- Challenge (FFF4) ------------------------|
      |    stationConnectivity: "Offline"             |
      |                      |                        |
      |--- POST /sessions/offline-auth -->|           |
      |                      |            |           |
      |<-- signedAuthorization ----------|           |
      |                      |                        |
      |--- ServerSignedAuth (FFF3) --------------->|
      |    { signedAuthorization, sessionId }         |
      |                      |                        |
      |    [Station verifies ECDSA P-256 signature     |
      |     using server public key]                  |
      |                      |                        |
      |<-- AuthResponse (FFF4) --------------------|
      |    { result: "Accepted" }                     |
      |                      |                        |
```

### 8.3 Partial B Handshake (App Offline, Station Online)

```
  App (Central)           Station (Peripheral)          Server
      |                        |                          |
      |--- Hello (FFF3) ----->|                          |
      |                        |                          |
      |<-- Challenge (FFF4) --|                          |
      |    stationConnectivity: "Online"                  |
      |                        |                          |
      |--- OfflineAuthRequest (FFF3) -->|               |
      |    { offlinePass, counter,       |               |
      |      sessionProof }              |               |
      |                        |                          |
      |                        |--- AuthorizeOfflinePass ->|
      |                        |    (MQTT REQUEST)         |
      |                        |                          |
      |                        |<-- RESPONSE (Accepted) --|
      |                        |    { sessionId,           |
      |                        |      durationSeconds,     |
      |                        |      creditsAuthorized }  |
      |                        |                          |
      |<-- AuthResponse ------|                          |
      |    { result: "Accepted" }                         |
      |                        |                          |
```

## 9. Related Schemas

- Hello: [`hello.schema.json`](../../../schemas/ble/hello.schema.json)
- Challenge: [`challenge.schema.json`](../../../schemas/ble/challenge.schema.json)
- Offline Auth Request: [`offline-auth-request.schema.json`](../../../schemas/ble/offline-auth-request.schema.json)
- Server Signed Auth: [`server-signed-auth.schema.json`](../../../schemas/ble/server-signed-auth.schema.json)
- Auth Response: [`auth-response.schema.json`](../../../schemas/ble/auth-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2002--2006, 2013, 4002--4004)
