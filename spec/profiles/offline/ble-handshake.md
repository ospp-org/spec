# BLE Handshake Protocol

> **Status:** Draft

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
      "allowedServiceTypes": ["svc_eco", "svc_standard"]
    },
    "constraints": {
      "minIntervalSec": 60,
      "stationOfflineWindowHours": 72,
      "stationMaxOfflineTx": 100
    },
    "signature": "V2hYcE9wR3FkN21MbjZzWnRKdUF4Q2JrRjVlUmlXZ0g4VTNQYW9EeUtsTXZCOXdmMGpBaFRjSWxFcDNyTnlPZA==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "counter": 5,
  "sessionProof": "dG1SZ1VXMXB5THNrQWZKZU9jTmhCNndiRHhpWnZLcTk="
}
```

### 4.2 ServerSignedAuth (Partial A)

Used when the app is online but the station is offline. The app requests a server-signed authorization blob from the server (via HTTPS) and relays it to the station over BLE. The station verifies the ECDSA P-256 signature using the server's public key (provisioned at boot).

**Payload:**

| Field | Type | Required | Description |
|----------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `ServerSignedAuth` (constant). |
| `signedAuthorization` | string | Yes | Base64-encoded server-signed ECDSA P-256 authorization blob. |
| `sessionId` | string | Yes | Session identifier assigned by the server. |

**Example:**

```json
{
  "type": "ServerSignedAuth",
  "signedAuthorization": "ZXlKaGJHY2lPaUpGWkRJMU5URTVJaXdpZEhsd0lqb2lTbGRVSW4wLmV5SnpkV0lpT2lKemRXSmZlSGw2TnpnNUlpd2ljM1J1SWpvaWMzUnVYMkV4WWpKak0=",
  "sessionId": "sess_b3c4d5e6"
}
```

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
  "sessionKeyConfirmation": "pLm3KxNv8dRqWz0hYcFj5sTbAeOiG7nU2JfBwXtIk6o="
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
