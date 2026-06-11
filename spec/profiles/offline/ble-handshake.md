# BLE Handshake Protocol

> **Status:** Draft | **OSPP Version:** 0.5.0

## 1. Handshake Overview

The BLE handshake establishes a secure, authenticated session between the mobile app and the station. It follows a four-step sequence: HELLO, CHALLENGE, Authentication, and AuthResponse. The handshake **MUST** complete within 10 seconds from the first Hello write; if it does not, both parties **MUST** abort and the station **MUST** report error `2013 BLE_AUTH_FAILED`.

## 2. Step 1: Hello

The app initiates the handshake by writing a Hello message to characteristic FFF3.

**Payload:**

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `Hello` (constant). |
| `deviceId` | string | Yes | Unique device identifier for the mobile app. |
| `appNonce` | string | Yes | Base64-encoded 32-byte cryptographically random nonce. |
| `appVersion` | string | Yes | Semantic version of the mobile application. |

The `appNonce` serves two purposes:
1. **Replay protection** -- ensures each handshake is unique.
2. **Key derivation input** -- combined with the station nonce to derive the session key (see section 6).

**Example:**

```json
{
  "type": "Hello",
  "deviceId": "device_a8f3bc12e4567890",
  "appNonce": "k7Rz2mPqXvN8dF5sYwB1cA0hJ6tL9oKe3iGnUxMpWbQ=",
  "appVersion": "2.1.0"
}
```

## 3. Step 2: Challenge

The station responds to the Hello by sending a Challenge notification on characteristic FFF4.

**Payload:**

| Field | Type | Required | Description |
|-----------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `Challenge` (constant). |
| `stationNonce` | string | Yes | Base64-encoded 32-byte cryptographically random nonce. |
| `stationConnectivity` | string | Yes | `"Online"` or `"Offline"` -- determines which auth path the app **MUST** use. |
| `availableServices` | array | No | Optional snapshot of bay/service availability. |

The `stationConnectivity` field is critical for path selection:
- **`"Online"`** -- the station has MQTT connectivity. The app **MAY** use ServerSignedAuth (Partial A) or OfflineAuthRequest (Partial B, relayed to server).
- **`"Offline"`** -- the station has no MQTT connectivity. The app **MUST** use OfflineAuthRequest with a locally-stored OfflinePass (Full Offline).

**Example:**

```json
{
  "type": "Challenge",
  "stationNonce": "Qm4xR9vTfH2wLpZjK0sNcYgX5uOdA8rE1iBn6CtJkWe=",
  "stationConnectivity": "Offline",
  "availableServices": [
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_standard", "available": true }
  ]
}
```

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
| `sessionProof` | string | Yes | HMAC-SHA256 proof binding this request to the derived session key. Computed as `HMAC-SHA256(sessionKey, type || offlinePass.passId || counter)`. |

The HMAC input is the concatenation, in order, of the UTF-8 bytes of `type`, `offlinePass.passId`, and `counter` (no delimiters, no length prefixes). The `counter` integer **MUST** be serialized as its shortest decimal ASCII representation with no leading zeros and no sign character (e.g. `5` → bytes `"5"`, `42` → bytes `"42"`, `0` → bytes `"0"`). The resulting HMAC tag is base64-encoded for transport. This binding is canonical: any deviation (binary encoding, hexadecimal, zero-padding, locale-specific digits) produces an incompatible proof and **MUST** be rejected with error `2013 BLE_AUTH_FAILED`.

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
  "sessionProof": "Iy0WMLx+39Vf5zEyStf2Qxls/7qqnVvVejKK0GsSTSo="
}
```

### 4.2 ServerSignedAuth (Partial A)

Used when the app is online but the station is offline. The app obtains a server-signed authorization (via `POST /sessions/offline-auth`, supplying the same `appNonce` it will write in the upcoming `Hello` so the server binds the authorization to this handshake) and relays it to the station over BLE. The station verifies the ECDSA P-256 signature using the server's public key (provisioned at boot) and re-checks each claim against the live handshake state.

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
     bayId, serviceId, appNonce, issuedAt, expiresAt,
   }                                              // see server-signed-auth-claims.schema.json
2. data_bytes = OSPP_Canonical_Form(claims)       // §4.8
3. digest     = SHA-256(data_bytes)               // hash the canonical bytes directly
4. signature  = ECDSA-P256-Sign(server_private_key, digest)  // RFC 6979 deterministic nonce
5. signedAuthorization = {
     data:               base64(data_bytes),
     signature:          base64(signature),
     signatureAlgorithm: "ECDSA-P256-SHA256",
   }
```

The `appNonce` claim **MUST** equal the `appNonce` the app will write in the upcoming `Hello` message — the server reads it from the `POST /sessions/offline-auth` request body. The `expiresAt` claim **MUST** be no later than five minutes after `issuedAt`; `appNonce` provides the primary, clock-independent replay defence (§4.2.2 check #2) and `expiresAt` is a secondary bound.

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

**Anti-replay model.** `appNonce` is the **primary, clock-independent** anti-replay defence: because every `Hello.appNonce` is a 32-byte cryptographically random value never reused across handshakes (§2), a captured `ServerSignedAuth` cannot be relayed into a different handshake whose `Hello` carries a different `appNonce`, regardless of system clock state. `expiresAt` is a **secondary** bound that limits the window in which a same-handshake passive replay would still be evaluated against the server's clock; it is not a substitute for the nonce check.

**Example:**

```json
{
  "type": "ServerSignedAuth",
  "signedAuthorization": {
    "data": "eyJhcHBOb25jZSI6IjdKbm1rUlNyUkw0MmZocVI4VklYeTBMbmJFRHN4U2FYMTlOK1Y5b2dJUWc9IiwiYXV0aElkIjoiYXV0aF80YzE1OWMxNTlkNzAiLCJiYXlJZCI6ImJheV9lZDMwOTY5ZDljMGIiLCJkZXZpY2VJZCI6ImRldl82NmU5Zjg4MzliODhhNWQ1IiwiZXhwaXJlc0F0IjoiMjAyNi0wMi0xM1QxMDowNTowMC4wMDBaIiwiaXNzdWVkQXQiOiIyMDI2LTAyLTEzVDEwOjAwOjAwLjAwMFoiLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic2Vzc2lvbklkIjoic2Vzc19iM2M0ZDVlNiIsInN0YXRpb25JZCI6InN0bl9hYWUxNzdiNSIsInN1YiI6InN1Yl9lMzFlNzdmMzFlOTIyNjc2In0=",
    "signature": "MEUCIQCDzVN4jGzqtCVi3r2+gSxu8oR3b8Qa5I8X0xgFZrHH7wIgbJIlYiU1Qj+HAUyFJP+XHJvotV89+C96WHPLHDLS+cY=",
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
| `sessionKeyConfirmation` | string | Cond. | HMAC confirmation of the shared session key. Present when `result` is `Accepted`. |
| `reason` | string | Cond. | Human-readable rejection reason code. Present when `result` is `Rejected`. |
| `errorCode` | integer | Cond. | Numeric OSPP error code. Present when `result` is `Rejected`. |

On `Accepted`, the `sessionKeyConfirmation` field proves to the app that the station also derived the same session key. It is computed as `HMAC-SHA256(sessionKey, "AuthResponse_OK")`.

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

> **Note:** The normative HKDF parameters are defined in [Chapter 06 — Security](../../06-security.md). This section mirrors those values for implementer convenience.

Both the app and the station **MUST** derive a shared session key using HKDF-SHA256 (RFC 5869) with the following parameters:

| Parameter | Value |
|-----------|-----------------------------------------------|
| **IKM** | `LTK \|\| appNonce \|\| stationNonce` (LTK from BLE pairing concatenated with the decoded nonce bytes) |
| **Salt** | UTF-8 bytes of `"OSPP_BLE_SESSION_V1"` |
| **Info** | `deviceId \|\| stationId` |
| **Output** | 32 bytes (256-bit session key) |

**Pseudocode:**

```
SessionKey = HKDF-SHA256(
  ikm    = LTK || appNonce || stationNonce,
  salt   = "OSPP_BLE_SESSION_V1",
  info   = deviceId || stationId,
  length = 32 bytes
)
```

The derived session key is used for:
1. Computing the `sessionProof` in OfflineAuthRequest.
2. Computing the `sessionKeyConfirmation` in AuthResponse.
3. Optionally encrypting subsequent BLE payloads if payload-level encryption is enabled.

Both parties **MUST** use cryptographically secure random number generators for nonce generation. Nonces **MUST NOT** be reused across handshakes.

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
      |      appVersion }                     |
      |                                       |
      |<-- Challenge (FFF4 Notify) ----------|
      |    { type, stationNonce,              |
      |      stationConnectivity: "Offline" } |
      |                                       |
      |  [App derives session key via HKDF]   |
      |                                       |
      |--- OfflineAuthRequest (FFF3) ------>|
      |    { type, offlinePass, counter,      |
      |      sessionProof }                   |
      |                                       |
      |    [Station validates locally:        |
      |     signature, expiry, epoch,         |
      |     counter, limits, sessionProof]    |
      |                                       |
      |<-- AuthResponse (FFF4 Notify) ------|
      |    { type, result: "Accepted",        |
      |      sessionKeyConfirmation }         |
      |                                       |
```

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
