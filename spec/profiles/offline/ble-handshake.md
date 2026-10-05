# BLE Handshake Protocol

> **Status: EXPERIMENTAL** | **OSPP Version:** 0.44.0
>
> Published for review, **not** for implementation. May change incompatibly without a MAJOR
> bump. See [Release status](../../../README.md#ble-is-experimental).

## 1. Handshake Overview

The BLE handshake establishes a secure, authenticated session between the mobile app and the station. It follows a four-step sequence: Hello, Challenge, Authentication, and AuthResponse. The station authenticates itself in the Challenge, with its certificate and a signature over the handshake; the two ephemeral keys agree the session key; and the app authenticates its user and device with the credential it presents inside the channel ([06-security.md §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256), [§6.5.2](../../06-security.md#652-station-authentication--the-stations-certificate), [§6.5.4](../../06-security.md#654-device-proof-of-possession)). The handshake **MUST** complete within 10 seconds from the first Hello write; if it does not, both parties **MUST** abort: the station closes the connection without a response and logs `2013 BLE_AUTH_FAILED`.

**Timing model (Non-normative).** The station measures the 10-second budget from **t₀ = reception of the first `Hello` write**; the app measures the same budget from when it issues that write. Implementers MAY apportion the budget across the four steps as internal sub-deadlines (for example, a small fixed share to reach `Challenge` and the remainder for `Authentication` + `AuthResponse`), but any such per-step figures are guidance only, not normative limits. The 5-second fragmentation/reassembly timeout ([ble-transport.md §11](ble-transport.md#11-fragmentation-protocol)) is a **per-message** bound that runs *inside* this total budget rather than in addition to it: a single message whose fragments take longer than 5 s aborts the session, and the handshake as a whole still has only the one 10-second envelope to complete.

**Version (Normative).** The handshake negotiates the BLE protocol version. The Hello lists the versions the app supports, the Challenge names the one the station chose, and both are inside the transcript the session key binds, so neither can be altered unseen ([VERSIONING.md, *BLE Protocol Version*](../../../VERSIONING.md#ble-protocol-version)). This revision is BLE protocol version `0.3.0`.

## 2. Step 1: Hello

The app initiates the handshake by writing a Hello message to characteristic FFF3.

**Payload:**

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `Hello` (constant). |
| `bleVersions` | array of string | Yes | The BLE protocol versions the app supports, most preferred first (1 to 8, each a semantic version). |
| `appNonce` | string | Yes | Base64-encoded 32-byte cryptographically random nonce (exactly 44 Base64 characters). |
| `appVersion` | string | Yes | Semantic version of the mobile application. |
| `appEphemeralPubKey` | string | Yes | App's per-handshake ephemeral P-256 public key, compressed SEC1, Base64 (44 chars; [06-security.md §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256) Pin 2). Its ECDH with the station's ephemeral key is the session key's input (§6). Freshly generated per handshake; discarded after the session. |

**Nothing in the Hello identifies the device or its user (Normative).** The Hello is plaintext and any radio in range can read it ([06-security.md T14](../../06-security.md#t14---ble-presence-tracking)); the app **MUST NOT** add to it anything that identifies the device, the user or the pass. The device is identified inside the channel, by the credential the app presents — the pass's `deviceId` or the authorization's — and, for a pass, by its device proof (§4.1).

The `appNonce` serves three purposes:
1. **Replay protection** -- ensures each handshake is unique.
2. **Key derivation input** -- combined with the station nonce in the IKM (see section 6).
3. **Partial-A binding** -- a ServerSignedAuth names the `appNonce` of the handshake it is relayed in (§4.2.2 check #2).

**Example:**

```json
{
  "type": "Hello",
  "bleVersions": [
    "0.3.0"
  ],
  "appNonce": "bKsxxAOCCNkWNpyePge8Npt7OkX3PsFJFEhcgW2rpII=",
  "appVersion": "2.1.0",
  "appEphemeralPubKey": "ArqbFBft5MOhMV/H0NwuDn7c4ZySkf0v2CZx8twJKys2"
}
```

## 3. Step 2: Challenge

The station responds to the Hello by sending a Challenge notification on characteristic FFF4.

**Payload:**

| Field | Type | Required | Description |
|-----------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `Challenge` (constant). |
| `bleVersion` | string | Yes | The BLE protocol version of this session — one of the Hello's `bleVersions`, chosen by the station. |
| `stationNonce` | string | Yes | Base64-encoded 32-byte cryptographically random nonce (exactly 44 Base64 characters). |
| `stationEphemeralPubKey` | string | Yes | Station's per-handshake ephemeral P-256 public key, compressed SEC1, Base64 (44 chars; Pin 2). Its ECDH with the app's ephemeral key is the session key's input (§6). Freshly generated per handshake. |
| `stationCertificate` | string | Yes | The station's mTLS client certificate, DER, Base64 ([06-security.md §4.4](../../06-security.md#44-certificate-requirements)), carrying the extended key usage `id-kp-osppBleStation`. |
| `stationConnectivity` | string | Yes | `"Online"` or `"Offline"` -- determines which auth path the app **MUST** use. |
| `availableServices` | array | Yes | Every service the station's catalog binds to each of its bays, each `{bayId, serviceId, available}`, `available` saying whether the station can start it now — empty while the station holds no catalog. The app's one source of availability ([ble-transport.md §4](ble-transport.md#4-available-services-fff2)). |
| `catalogDigest` | string | Yes | SHA-256 of the OSPP Canonical Form ([06-security.md §4.8](../../06-security.md#48-ospp-canonical-form)) of the catalog the station serves on FFF2 now, Base64 (44 chars) ([ble-transport.md §4](ble-transport.md#4-available-services-fff2)). It binds that catalog — its bays, their numbers, the services and their names and prices — to the handshake: the station signs it with the rest of the Challenge. |
| `stationSignature` | string | Yes | The station's ECDSA P-256 signature, with its certificate key, over the Hello and this Challenge without this member ([06-security.md §6.5.2](../../06-security.md#652-station-authentication--the-stations-certificate)). |

**Version selection (Normative).** The station **MUST** name in `bleVersion` a version that is in the Hello's `bleVersions`, the first of them it supports. If it supports none, it **MUST NOT** send a Challenge: it refuses the Hello with `1007 PROTOCOL_VERSION_MISMATCH` (§5) and closes the connection. An app that receives a Challenge whose `bleVersion` is not one it offered **MUST** abort the handshake and send no credential. This is the shape of TLS 1.3's version negotiation, where a client lists the versions it supports in preference order and *"Servers `MUST` only select a version of TLS present in that extension"* ([RFC 9846 §4.3.1](https://www.rfc-editor.org/rfc/rfc9846#section-4.3.1)), and of the Matter Bluetooth Transport Protocol's handshake ([Matter Specification 1.4.1](https://csa-iot.org/wp-content/uploads/2025/05/23-27349-007_matter-1-4-1-core-specification.pdf), §4.19.4.3).

**The station's signature (Normative).** The station builds the signed content itself, from the Hello as it received it and from this Challenge, and signs it with the key of its certificate; it never signs a digest the app supplies ([06-security.md §6.5.2](../../06-security.md#652-station-authentication--the-stations-certificate), which defines the content).

**The catalog check (Normative).** FFF2 is read before the Hello and outside the transcript ([ble-transport.md §4](ble-transport.md#4-available-services-fff2)); the Challenge's `catalogDigest` is what binds it. Before it sends a credential, an app that chose the bay, the service or the duration from the catalog it read on FFF2 **MUST** compare `catalogDigest` with the SHA-256 of the OSPP Canonical Form of that catalog. If they differ — a relay altered or replaced the catalog the app read, or the operator changed the station's catalog since the app read it — the app **MUST NOT** send a credential: it closes the connection, reads FFF2 again on a new connection, and starts a new handshake. An app that asks for a receipt in place of a credential ([ble-transport.md §8](ble-transport.md#8-receipt-fff6)) chose nothing from it and compares nothing.

The `stationConnectivity` field is critical for path selection:
- **`"Online"`** -- the station has MQTT connectivity. A phone with no network uses OfflineAuthRequest, which the station forwards to the server (Partial B).
- **`"Offline"`** -- the station has no MQTT connectivity. A phone with no network uses OfflineAuthRequest with its stored OfflinePass (Full Offline); a phone with a network **MAY** obtain and use ServerSignedAuth instead (Partial A).

A phone and a station that are both online use the online session flow, not BLE.

**App verification gate (Normative).** Before it derives the session key, and before it sends any OfflinePass or ServerSignedAuth, the app **MUST** pass the gate of [06-security.md §6.5.2](../../06-security.md#652-station-authentication--the-stations-certificate): the certificate chains to a Station CA of its trust bundle, is valid now, is on no entry of that CA's CRL, carries `digitalSignature` and `id-kp-osppBleStation`, names the intended station where the app holds one from an out-of-band channel, and `stationSignature` verifies under it. On any failure it aborts with `2013 BLE_AUTH_FAILED` and sends no credential.

**Example**, whose `catalogDigest` names the catalog of the example in [ble-transport.md §4](ble-transport.md#4-available-services-fff2):

<!-- ospp-catalog: spec/profiles/offline/ble-transport.md -->
```json
{
  "type": "Challenge",
  "bleVersion": "0.3.0",
  "stationNonce": "bt8L0mYAoDDqk+6swnQMgM0lDWMe+tPXBvaj8A4TfR0=",
  "stationEphemeralPubKey": "AwwZpLQ0CxbV0HOXDPuQEv+418VzE/RupNS7oUHka6AX",
  "stationCertificate": "MIICFzCCAb6gAwIBAgICCgEwCgYIKoZIzj0EAwIwMzESMBAGA1UECgwJT1NQUCBUZXN0MR0wGwYDVQQDDBRPU1BQIFRlc3QgU3RhdGlvbiBDQTAeFw0yNjAxMDEwMDAwMDBaFw0yNjEyMzEyMzU5NTlaMCsxEjAQBgNVBAoMCU9TUFAgVGVzdDEVMBMGA1UEAwwMc3RuX2ExYjJjM2Q0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvW5xVrFUPqbSVgurekEFGU2vEdAnOKiJzzxcmZca3/sbE4e/85+t+d3uIbRGsrihNUJo/HPf/t6YnM1w8yTbcKOByTCBxjAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIHgDAoBgNVHSUEITAfBggrBgEFBQcDAgYTadau1fTCl9KOm5GCxfv1z/qsYzA8BgNVHR8ENTAzMDGgL6AthitodHRwOi8vY3JsLm9zcHAtdGVzdC5pbnZhbGlkL3N0YXRpb24tY2EuY3JsMB0GA1UdDgQWBBQesPd2I89FqUwav1HnI6MMFu/wPjAfBgNVHSMEGDAWgBQXxwEaDwCqARDb92VgH180MkvGWDAKBggqhkjOPQQDAgNHADBEAiB/ntacff4AkpoCFeG36be3OPq/SnS36Yx4J0+xyD6S1wIgT2Cr612Wv5BpWdeXae80hgOpvRPvcZ9UQCs41T2eFSI=",
  "stationConnectivity": "Offline",
  "availableServices": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_eco",
      "available": true
    },
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_standard",
      "available": true
    }
  ],
  "catalogDigest": "di1rJvk5MMuI0K6zbQb/pVJnc5QQB8NSFAENH+R5goI=",
  "stationSignature": "MEUCIQCDMgEktywuiGPdndfl0zVDO/ixGnZ1XruNp1B6TahM1QIgUngZJRX3Ldv1KHkaW3UyhxyVPcE5nlQjRQEGyHHnwAs="
}
```

## 4. Step 3: Authentication

After receiving the Challenge and passing its verification gate (§3), the app **MUST** derive the session key (section 6) and then send one of two authentication messages depending on the connectivity scenario.

### 4.1 OfflineAuthRequest (Full Offline / Partial B)

Used when the app has a locally-stored OfflinePass. In the **Full Offline** scenario, the station validates the pass locally. In the **Partial B** scenario (station online), the station forwards the pass to the server via the AuthorizeOfflinePass MQTT action, with the bay, the service, the requested duration and the device proof ([authorize-offline-pass.md §3](authorize-offline-pass.md#3-request-payload)).

**Payload:**

| Field | Type | Required | Description |
|----------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `OfflineAuthRequest` (constant). |
| `offlinePass` | object | Yes | Full OfflinePass object (see [offline-pass.md](offline-pass.md)). |
| `counter` | integer | Yes | Monotonic usage counter (minimum 0). **MUST** be strictly greater than the last counter seen by the station for this pass. The app increments it on every presentation of the pass, accepted or refused, at any station ([06-security.md §6.1.1](../../06-security.md#611-offlinepass-validation--10-checks), counter model). |
| `bayId` | string | Yes | The bay the customer chose. |
| `serviceId` | string | Yes | The service the customer chose. |
| `requestedDurationSeconds` | integer | Yes | The duration the customer chose, in seconds (minimum 1). The validator estimates the cost from it ([offline-pass.md §4](offline-pass.md#4-validation-checks-10) checks #7 and #8), and an authorization is for exactly this duration — refused, never reduced. |
| `sessionProof` | string | Yes | Base64-encoded HMAC-SHA256 (exactly 44 chars) binding this request to the derived session key. Canonical construction defined in this section. |
| `deviceProof` | object | Yes | Proof that the phone holds the private key of the pass's `devicePublicKey`, over this handshake, the station, the pass, the counter and the requested service ([06-security.md §6.5.4](../../06-security.md#654-device-proof-of-possession); [`device-proof.schema.json`](../../../schemas/common/device-proof.schema.json)). |

The bay, the service and the duration are chosen before the handshake, from the station's catalog (FFF2), with the pass's limits shown ([offline-pass.md §2.1](offline-pass.md#21-offlineallowance-object)); after the Challenge the app confirms that the catalog it chose from is the one the Challenge's `catalogDigest` names (§3) and that the chosen service is available on the chosen bay in its `availableServices`, and sends no request when either fails. The session's StartServiceRequest names the same bay and service ([ble-session.md §1](ble-session.md#1-starting-a-service)). A station refuses, before it validates or forwards the pass, a request naming a bay it does not have (`3005 BAY_NOT_FOUND`) or a service its catalog does not bind to a program of that bay (`3004 INVALID_SERVICE`): it can neither estimate the cost of such a service nor start it. It refuses the same way a `requestedDurationSeconds` above its `MaxSessionDurationSeconds` (`3010 MAX_DURATION_EXCEEDED`; [Chapter 08 §3](../../08-configuration.md#3-transaction-configuration-keys)): an authorization is for exactly the duration requested, and a Partial-B session starts only at that duration ([ble-session.md §1](ble-session.md#1-starting-a-service) rule 2), so one the station cannot run would never start.

The `sessionProof` construction is **canonical and defined here** ([06-security.md §6.5.1](../../06-security.md#651-sessionproof-computation-normative) points to this section — finding N1):

```
sessionProof = Base64( HMAC-SHA256( SessionKey,
                 LP(UTF8("OfflineAuthRequest")) ‖ LP(UTF8(passId)) ‖ LP(UTF8(decimal(counter))) ) )
```

where `SessionKey` is the ECDH-derived session key ([06-security.md §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256)); `LP(x) = U16BE(byteLength(x)) ‖ x` is **the same length-prefix encoding used for the HKDF `info` and the transcript** ([06-security.md §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256) Pin 3 / Pin 4); `"OfflineAuthRequest"` is the literal message-type string; `passId` is `offlinePass.passId`; and `decimal(counter)` is the `counter` value rendered as its **shortest base-10 ASCII string** (no leading zeros, no sign). Length-prefixing each component makes the input **injective** — no two distinct `(passId, counter)` tuples can ever produce the same byte string — which the v0.5.x empty concatenation did not guarantee (e.g. `("opass_a", 15)` and `("opass_a1", 5)` both concatenated to `…opass_a15`). The output is Base64 (RFC 4648, standard alphabet, with padding) — exactly **44 characters**. A `sessionProof` that does not match the station's own computation **MUST** be rejected with error `2013 BLE_AUTH_FAILED`.

The prior 4-input hex construction (which additionally bound `bayId`/`serviceId`, output as 64 hex chars) is **withdrawn** in v0.6.0: under the AEAD channel ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel)) the request travels inside the authenticated channel, so the proof binds only `(passId, counter)` to the session; the device proof binds the bay, the service and the duration ([06-security.md §6.5.4](../../06-security.md#654-device-proof-of-possession)). The reference tooling (`tools/verify-example-signatures.mjs`, `tools/sign-example.mjs`, `tools/sign-inline-md.mjs`) computes exactly this length-prefixed form.

**The device proof (Normative).** The `deviceProof` is defined in [06-security.md §6.5.4](../../06-security.md#654-device-proof-of-possession), which governs: on Android, a signature by the device key in the Android Keystore; on iOS, where the device key is the App Attest key, an App Attest assertion. The station verifies it before it accepts or forwards the pass — it is check #4, device binding ([offline-pass.md §4](offline-pass.md#4-validation-checks-10)) — and a station that forwards the pass forwards the proof unchanged, with this handshake's `transcriptHash`.

**Example:**

```json
{
  "type": "OfflineAuthRequest",
  "offlinePass": {
    "passId": "opass_a8b9c0d1e2f3",
    "sub": "sub_xyz789",
    "deviceId": "device_a8f3bc12e4567890",
    "devicePublicKey": "A0xX3DTR7Imb4hzGyaH1WyUX/5U/CIghk7B/cZV11KFi",
    "keyId": "YjX5pR0TzmU3ubs17wImQQ",
    "issuedAt": "2026-02-13T06:00:00.000Z",
    "expiresAt": "2026-02-14T06:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30
    },
    "constraints": {
      "minIntervalSec": 60
    },
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEQCIHHpbSBL42of8rUg+uBwTpxVYDJGPQ6oRlCZ+LuNmCkNAiA4AFsU/P4RvojF7wj2GG9wDxgQRDscL9T5pu8S8EvFPQ=="
  },
  "counter": 5,
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300,
  "sessionProof": "ObgxpE1Ad+xl6P8fRWtBstqMY2Tjan9oK/LIWofxvrI=",
  "deviceProof": {
    "format": "android-key",
    "signature": "MEUCIQCuPvU1IfXnkwx3wHRvhXkFEOvgQKF2tYDaMtKHFTqb5QIgVn3kd+dkOBDPUHHpgVCncV+gckIrotS8AixULTVIazU="
  }
}
```

> The `sessionProof` above is computed under the synthetic test session key of `conformance/test-keys/`, as every worked document's is, and the `deviceProof` under the test device key of the pass's `deviceId` ([`conformance/test-keys/README.md`](../../../conformance/test-keys/README.md)), over the Hello and Challenge of §2 and §3. On the wire this `OfflineAuthRequest` travels inside the §6.5.3 AEAD frame; the plaintext is shown here for clarity.

### 4.2 ServerSignedAuth (Partial A)

Used when the app is online but the station is offline. The app obtains a server-signed authorization (via `POST /sessions/offline-auth`, supplying the same `appNonce` it uses in the `Hello` of this handshake so the server binds the authorization to it — see **Acquisition ordering** below), with the trust bundle it authenticates the station against ([`app-contract.md` §5](app-contract.md#5-the-partial-a-authorization)), and relays the authorization to the station over BLE. The station verifies the ECDSA P-256 signature using a key of the server key set it holds ([06-security.md §6.7](../../06-security.md#67-server-signing-key-rotation-ecdsa-p-256)) and re-checks each claim against the live handshake state. Like every post-Challenge message, `ServerSignedAuth` is relayed **inside the AEAD channel** ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel)). An authorization names no device key, so a Partial-A session carries no device proof ([06-security.md §6.5.4](../../06-security.md#654-device-proof-of-possession)).

**Acquisition ordering (Normative).** The `appNonce` is chosen by the app and is the sole binding between the `POST` and the BLE handshake (§4.2.2 check #2), so the `POST /sessions/offline-auth` and the `Hello` write **MAY** occur in either order, provided the `appNonce` in the POST body equals the `appNonce` in the `Hello`. Two orderings are conformant:

- **Pre-fetch** (RECOMMENDED when the app already knows the target `stationId` — e.g. from a scanned code): POST first, then write `Hello` carrying the same `appNonce`. This keeps the server round-trip out of the 10-second handshake budget (§1).
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
| 1 | ECDSA P-256 signature verifies over `base64_decode(signedAuthorization.data)` against a key of the server key set the station holds (`OfflinePassPublicKey`, [06-security.md §6.7](../../06-security.md#67-server-signing-key-rotation-ecdsa-p-256)); a `ServerSignedAuth` names no key, so the station tries the keys of the set | `2002 OFFLINE_PASS_INVALID` |
| 2 | `claims.appNonce == Hello.appNonce` from the current handshake | **`2018 SERVER_AUTH_NONCE_MISMATCH`** |
| 3 | `claims.stationId == STATION_OWN_ID` (no cross-station replay) | `2002 OFFLINE_PASS_INVALID` |
| 4 | **Withdrawn** — the Hello carries no device identifier to compare `claims.deviceId` with, and the comparison bound nothing: the app chose both values. The authorization is bound to this handshake by check #2. The number is not reused. | — |
| 5 | `claims.sessionId == envelope.sessionId` (envelope binding) | `2002 OFFLINE_PASS_INVALID` |
| 6 | `claims.expiresAt > NOW` (clock-skew margin; `appNonce` is the primary defence) | `2002 OFFLINE_PASS_INVALID` |

**Anti-replay model (layered).** Since v0.6.0 `ServerSignedAuth` is relayed **inside the AEAD channel** (§6.5.3), which is the **first** anti-replay barrier: a captured frame is ciphertext under the originating session's directional key and cannot be injected into a different handshake (each handshake derives a fresh key). **Behind** the channel, the `appNonce` check (#2) is the **claim-layer** defence and is clock-independent: because every `Hello.appNonce` is a 32-byte cryptographically random value never reused across handshakes (§2), a `ServerSignedAuth` whose `appNonce` claim does not match the current `Hello.appNonce` is rejected regardless of system clock state — even in the (now-redundant) event the channel protection were bypassed. `expiresAt` is a **secondary** time bound limiting the same-handshake window against the server's clock; it is not a substitute for the nonce check. (Pre-v0.6.0, before the AEAD channel existed, the `appNonce` check was itself the primary barrier; v0.6.0 places the channel in front of it as defense-in-depth.)

**Example:**

```json
{
  "type": "ServerSignedAuth",
  "signedAuthorization": {
    "data": "eyJhcHBOb25jZSI6ImJLc3h4QU9DQ05rV05weWVQZ2U4TnB0N09rWDNQc0ZKRkVoY2dXMnJwSUk9IiwiYXV0aElkIjoiYXV0aF80YzE1OWMxNTlkNzAiLCJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJjcmVkaXRzQXV0aG9yaXplZCI6NTAsImRldmljZUlkIjoiZGV2aWNlX2E4ZjNiYzEyZTQ1Njc4OTAiLCJkdXJhdGlvblNlY29uZHMiOjMwMCwiZXhwaXJlc0F0IjoiMjAyNi0wMi0xM1QxMDowNTowMC4wMDBaIiwiaXNzdWVkQXQiOiIyMDI2LTAyLTEzVDEwOjAwOjAwLjAwMFoiLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic2Vzc2lvbklkIjoic2Vzc19iM2M0ZDVlNiIsInN0YXRpb25JZCI6InN0bl9hMWIyYzNkNCIsInN1YiI6InN1Yl94eXo3ODkifQ==",
    "signature": "MEUCIQDrjdWh6AXFZ4npsSZOK29h1tycMWyJ/4EoosdMI6ExUwIgMIL3phvPewSCee1jNZtRchnNIP7PYG79qIG3hicQ7JY=",
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
| `durationSeconds` | integer | No | Advisory copy of the authorized duration for the app's display, when `result` is `Accepted` (finding N3). Unsigned: the station checks a StartServiceRequest against the signed claim or the server's value, never against this copy. |
| `creditsAuthorized` | integer | No | Advisory copy of the authorized credit budget, when `result` is `Accepted`. Unsigned, like `durationSeconds`. |
| `errorCode` | integer | Cond. | The registry code of the refusal. **MUST** be present when `result` is `Rejected`. |
| `errorText` | string | Cond. | The registry name of `errorCode`, in `UPPER_SNAKE_CASE` ([Chapter 07 §1.3](../../07-errors.md#13-error-object-fields)). **MUST** be present when `result` is `Rejected`. |
| `details` | object | Cond. | Per-occurrence context of the refusal. Required with `4002`, whose `details.constraint` names the limit that refused ([Chapter 07 §2.3](../../07-errors.md#23-ble-error-response)); otherwise optional when `result` is `Rejected`. |

On `Accepted`, the `sessionKeyConfirmation` field proves to the app that the station also derived the same session key. It is computed as `HMAC-SHA256(sessionKey, "AuthResponse_OK")`, Base64-encoded (44 chars), where the key is the **raw 32-byte session key** — the derived value itself, never its Base64 text ([`06-security.md` §5.4](../../06-security.md#54-mac-computation)). It **MUST** be present when `result` is `Accepted` and **MUST NOT** be present when `result` is `Rejected`. Because this AuthResponse travels inside the AEAD channel (§6.5.3), the frame's own Poly1305 tag already proves the station holds a key derived from the session key; `sessionKeyConfirmation` is therefore an explicit, defense-in-depth key-confirmation behind the channel, not the primary proof.

**A refusal carries the one BLE error shape.** `errorCode`, `errorText` and, where the code calls for it, `details` — the shape every BLE response uses ([Chapter 07 §2.3](../../07-errors.md#23-ble-error-response)). In Partial B the station relays the server's refusal with the server's `errorCode`, `errorText` and `details` unchanged ([authorize-offline-pass.md §6](authorize-offline-pass.md#6-processing-rules) rule 5). The codes are those of [Chapter 07 §4.3](../../07-errors.md#43-ble-message-types).

**A refusal before the session key (Normative).** A station that refuses a Hello — it supports none of the Hello's `bleVersions` (`1007 PROTOCOL_VERSION_MISMATCH`), or the Hello is malformed or carries an ephemeral key that fails validation, or the station cannot serve a handshake now (`2013 BLE_AUTH_FAILED`) — notifies, **instead of the Challenge**, a plaintext AuthResponse with `result: "Rejected"`, `errorCode` and `errorText`, fragmented by [ble-transport.md §11](ble-transport.md#11-fragmentation-protocol) and outside any secure frame, and then closes the connection. The station decides `1007` from the Hello's `bleVersions` alone, before it validates the rest of the Hello against its own version's schema, since a Hello of another BLE version may carry members that schema does not know ([`VERSIONING.md`](../../../VERSIONING.md#ble-protocol-version)). It is the one refusal that is not authenticated, because no key exists yet: the app **MUST** treat it as an indication, not as evidence — it **MAY** show it and **MUST NOT** act on it beyond ending the attempt. Every refusal after the Challenge is an AuthResponse inside the AEAD channel ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel)), authenticated by the channel — a third party cannot forge or inject it (finding N17).

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
  "errorCode": 2003,
  "errorText": "OFFLINE_PASS_EXPIRED"
}
```

## 6. Session Key Derivation (HKDF-SHA256)

> **Note:** The normative key-derivation construction is defined in [Chapter 06 — Security §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256). This section mirrors it for implementer convenience; on any discrepancy, §6.5 governs.

Both the app and the station **MUST** derive a shared session key using HKDF-SHA256 (RFC 5869) over an **ephemeral-ephemeral ECDH P-256 exchange** authenticated by the station's signature (the BLE Long-Term Key is NOT used — it is unobtainable by a mobile app; see [ADR-002](../../../adr/ADR-002-ble-handshake-security-architecture.md), [ADR-003](../../../adr/ADR-003-ble-station-authentication-by-certificate.md)) with the following parameters:

| Parameter | Value |
|-----------|-----------------------------------------------|
| **IKM** | `ee ‖ appNonce ‖ stationNonce` (3 × 32 bytes). `ee = ECDH(appEphemeralPriv, stationEphemeralPub)`, the X-coordinate, big-endian, 32 bytes, zero-left-padded (06-security §6.5 Pin 1). `appNonce`/`stationNonce` are the decoded 32-byte nonce values. |
| **Salt** | UTF-8 bytes of `"OSPP_BLE_SESSION_V3"` |
| **Info** | `LP(transcriptHash)`, where `LP(x) = U16BE(len(x)) ‖ x` and `transcriptHash = SHA-256(LP16(helloBytes) ‖ LP16(challengeBytes))` over the raw reassembled wire bytes (06-security §6.5 Pin 3/Pin 4). The station's identity is bound through `transcriptHash`, which covers the whole Challenge — its certificate and its signature. No device identifier enters it. |
| **Output** | 32 bytes (256-bit session key) |

**Pseudocode:**

```
ee = ECDH(appEphemeralPriv, stationEphemeralPub) // the only ECDH: both keys ephemeral
SessionKey = HKDF-SHA256(
  ikm    = ee ‖ appNonce ‖ stationNonce,          // each 32 bytes, in this order
  salt   = "OSPP_BLE_SESSION_V3",
  info   = LP(transcriptHash),                    // binds every byte of Hello and Challenge
  length = 32 bytes
)
```

The derived session key is used for:
1. Computing the `sessionProof` in OfflineAuthRequest (§4.1).
2. Computing the `sessionKeyConfirmation` in AuthResponse (§5).
3. Expanding the directional AEAD keys `k_app_to_station` / `k_station_to_app` that encrypt-and-authenticate **all** post-Challenge messages (06-security §6.5.3). Post-Challenge plaintext is NOT permitted.

The app **MUST** pass the verification gate of §3 before it derives the key or sends any credential. Both parties **MUST** use cryptographically secure random number generators for the ephemeral key pairs and nonces. Ephemeral keys and nonces **MUST NOT** be reused across handshakes.

## 7. Error Codes

The codes a BLE response carries, for every BLE message, are listed once, in [Chapter 07 §4.3](../../07-errors.md#43-ble-message-types). The AuthResponse's are those of the station's refusals before it validates or forwards a pass (§4.1), of the station's pass validation ([offline-pass.md §4](offline-pass.md#4-validation-checks-10)), of the Partial-A verification (§4.2.2), the station's own `1010` for a forward that went unanswered, of the server's refusal that a Partial-B station relays ([authorize-offline-pass.md §7](authorize-offline-pass.md#7-error-codes)), and of a refused Hello (§5).

## 8. Sequence Diagrams

### 8.1 Full Offline Handshake

```
  App (Central)                       Station (Peripheral)
      |                                       |
      |--- Hello (FFF3 Write) -------------->|
      |    { type, bleVersions, appNonce,     |
      |      appVersion, appEphemeralPubKey } |
      |                                       |
      |<-- Challenge (FFF4 Notify) ----------|
      |    { type, bleVersion, stationNonce,  |
      |      stationEphemeralPubKey,          |
      |      stationCertificate,              |
      |      stationConnectivity: "Offline",  |
      |      availableServices, catalogDigest,|
      |      stationSignature }               |
      |                                       |
      |  [App verifies the certificate        |
      |   against its bundle's CAs and CRLs,  |
      |   the signature and the catalog       |
      |   digest; sends no pass on a failure] |
      |  [Both derive SessionKey via ECDH+    |
      |   HKDF; AEAD channel established]     |
      |                                       |
      |=== OfflineAuthRequest (FFF3) ======>|   (AEAD frame {n, ct})
      |    { type, offlinePass, counter,      |
      |      bayId, serviceId,                |
      |      requestedDurationSeconds,        |
      |      sessionProof, deviceProof }      |
      |                                       |
      |    [Station validates locally:        |
      |     signature, expiry, epoch, device  |
      |     proof, limits, interval, counter, |
      |     sessionProof]                     |
      |                                       |
      |<== AuthResponse (FFF4 Notify) ======|   (AEAD frame {n, ct})
      |    { type, result: "Accepted",        |
      |      sessionKeyConfirmation }         |
      |                                       |
      |  ( === = encrypted AEAD channel,      |
      |    §6.5.3; --- = plaintext )          |
```

> The Partial A and Partial B diagrams below share §8.1's Hello and Challenge, the same mandatory verification of the station's certificate and signature before any credential is sent, and the same AEAD channel (§6.5.3) for every post-Challenge message. They omit those details for brevity.

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
      |    + sessionId, trustBundle      |           |
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
      |    { offlinePass, counter, bayId,|               |
      |      serviceId,                  |               |
      |      requestedDurationSeconds,   |               |
      |      sessionProof, deviceProof } |               |
      |                        |                          |
      |   [Station verifies the device proof]             |
      |                        |                          |
      |                        |--- AuthorizeOfflinePass ->|
      |                        |    (MQTT REQUEST: the pass,|
      |                        |     bay, service, duration,|
      |                        |     device proof and       |
      |                        |     transcriptHash)        |
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
- Device Proof: [`device-proof.schema.json`](../../../schemas/common/device-proof.schema.json)
- Server Signed Auth: [`server-signed-auth.schema.json`](../../../schemas/ble/server-signed-auth.schema.json)
- Auth Response: [`auth-response.schema.json`](../../../schemas/ble/auth-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) §4.3
