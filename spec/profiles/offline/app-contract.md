# Offline App–Server Contract

> **Status:** Draft | **OSPP Version:** 0.44.0

## 1. Overview

The offline model depends on two exchanges between the mobile app and the server, and this document defines both normatively:

- **pass issuance** (§3) — the server returns an OfflinePass together with the **trust bundle** the app needs while it has no network;
- **receipt upload** (§4) — the app sends the server its own copy of every receipt a station signed for it.

Everything else between the app and the server remains implementation-specific ([Chapter 02 §9](../../02-transport.md#9-https-transport-server--clients)). Both operations use the transport rules of [Chapter 02 §9.1](../../02-transport.md#91-general-requirements) and the mobile-app JWT of [Chapter 02 §9.2.1](../../02-transport.md#921-mobile-app--jwt-bearer); an error is answered with the REST Error Object of [Chapter 07 §2.4](../../07-errors.md#24-rest-api-error-response).

This document binds the **server** and the **app**. It places no obligation on a station, which never takes part in either exchange.

## 2. Direction and Type

- **Direction:** App to Server
- **Type:** HTTPS request / response

## 3. Pass Issuance

`POST /api/v1/offline/passes`

### 3.1 Request

| Field | Type | Required | Description |
|---|---|---|---|
| `deviceId` | string | Yes | Identifier of the device requesting the pass ([`device-id.schema.json`](../../../schemas/common/device-id.schema.json)). |
| `devicePublicKey` | string | Yes | The P-256 public key of the device key (§3.2), compressed SEC1, Base64 (44 characters). |

Schema: [`offline-pass-issuance-request.schema.json`](../../../schemas/offline-pass-issuance-request.schema.json).

### 3.2 The device key

The app **MUST** generate the device key as an ECDSA P-256 key pair in the phone's **hardware-backed keystore**, with a private key that cannot be exported — the Secure Enclave on iOS; the Android Keystore bound to secure hardware on Android, in StrongBox where the device has it. It **MUST** reuse that key for every pass it requests on that device, and **MUST NOT** request an offline pass from a phone that cannot hold such a key. The server copies `devicePublicKey` into the pass it issues ([`offline-pass.md` §6](offline-pass.md#6-lifecycle)), and **MUST NOT** issue a pass without one.

Both platforms provide the key this requires. The platform documentation, as published on 2026-09-29:

| Property | iOS | Android |
|---|---|---|
| Hardware-held P-256 keys | *"Works only with NIST P-256 elliptic curve keys. These keys can only be used for creating and verifying cryptographic signatures, or for elliptic curve Diffie-Hellman key exchange"* — [Protecting keys with the Secure Enclave](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave) | *"Key material can be bound to the secure hardware of the Android device, such as the Trusted Execution Environment (TEE) or Secure Element (SE)."* — [Android Keystore system](https://developer.android.com/privacy-and-security/keystore); StrongBox supports *"ECDSA, ECDH P-256"* (same page) |
| Private key not exportable | *"Not having a mechanism to transfer plain-text key data into or out of the Secure Enclave is fundamental to its security."* — [Protecting keys with the Secure Enclave](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave) | *"Key material never enters the application process."* — [Android Keystore system](https://developer.android.com/privacy-and-security/keystore) |
| ECDSA P-256 / SHA-256 signing | *"Generates an elliptic curve digital signature algorithm (ECDSA) signature of the given data over the P-256 elliptic curve, using SHA-256 as the hash function."* — [SecureEnclave.P256.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/secureenclave/p256/signing/privatekey) | *"This example illustrates how to generate a NIST P-256 (aka secp256r1 aka prime256v1) EC key pair in the Android KeyStore system"*, *"authorized to be used only for signing using SHA-256, SHA-384, or SHA-512 digest"* — [KeyGenParameterSpec](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec) |
| The app can tell whether the hardware is there | *"A Boolean value that indicates if the device supports Secure Enclave access."* — [SecureEnclave.isAvailable](https://developer.apple.com/documentation/cryptokit/secureenclave/isavailable) | *"KeyProperties.SecurityLevelEnum.TRUSTED_ENVIRONMENT and KeyProperties.SecurityLevelEnum.STRONGBOX indicate that the key material resides in secure hardware."* — [KeyInfo.getSecurityLevel](https://developer.android.com/reference/android/security/keystore/KeyInfo) |

Android also lets a **server** verify that a key is hardware-backed: its key attestation certificate chain states the key's security level — *"the attestationSecurityLevel element within the key description data structure is set to the TrustedEnvironment security level or to the StrongBox security level"* ([Verify hardware-backed key pairs with key attestation](https://developer.android.com/privacy-and-security/security-key-attestation)). iOS offers remote attestation only for the keys its App Attest service generates ([DCAppAttestService](https://developer.apple.com/documentation/devicecheck/dcappattestservice)).

### 3.3 Response

`200 OK` with:

| Field | Type | Required | Description |
|---|---|---|---|
| `offlinePass` | object | Yes | The signed OfflinePass ([`offline-pass.md`](offline-pass.md)). |
| `trustBundle` | object | Yes | What the app needs to authenticate stations while it has no network (§3.4). |

Schema: [`offline-pass-issuance-response.schema.json`](../../../schemas/offline-pass-issuance-response.schema.json).

### 3.4 The trust bundle

| Field | Type | Required | Description |
|---|---|---|---|
| `stationCaCertificate` | string | Yes | The Station CA certificate ([`06-security.md` §4.2](../../06-security.md#42-pki-architecture)), PEM. |
| `stationCaCrl` | string | Yes | The Station CA's current certificate revocation list ([`06-security.md` §2.1.1](../../06-security.md#211-revocation-checking)), PEM. |
| `serverKeys` | array | Yes | The server key set ([`06-security.md` §6.7](../../06-security.md#67-server-signing-key-rotation-ecdsa-p-256)): one entry per key, each with its `keyId` and its `publicKey` — the key's DER SubjectPublicKeyInfo, point uncompressed, Base64. |

1. The server **MUST** return a trust bundle with every pass it issues, current at the moment of issuance.
2. The app **MUST** replace the trust bundle it holds with the one received, on **every** issuance. It **MUST NOT** merge the two: a key the server has withdrawn from its set, or a certificate the CA has revoked, stays withdrawn only if the app forgets the old bundle.
3. The app authenticates a station against the bundle it holds: a StationIdentity certificate verifies under a key of `serverKeys` ([`06-security.md` §6.5.2](../../06-security.md#652-stationidentity-certificate)). The Station CA certificate and its CRL are the anchor for authenticating a station by its own X.509 certificate; the BLE handshake of this revision authenticates stations by StationIdentity, and does not yet read them.

**Why a bundle that is replaced, and never refreshed separately.** An app holds only passes it fetched while online, each fetch replaces the bundle, and a pass lives at most ten days ([`offline-pass.md` §6](offline-pass.md#6-lifecycle)). The app's anchors are therefore never older than its newest usable pass, and the server's key windows (a new key published at least the maximum pass lifetime before it signs, an old key kept until everything it signed has expired — [`06-security.md` §6.7](../../06-security.md#67-server-signing-key-rotation-ecdsa-p-256)) guarantee that the bundle holds every key a pass the app holds, or a station it meets, may need.

### 3.5 Refusals

| HTTP | Code | When |
|:---:|---|---|
| `401` | `2009 JWT_EXPIRED`, `2010 JWT_INVALID` | The app is not authenticated. |
| `402` | `4001 INSUFFICIENT_BALANCE` | The user's wallet is below zero; no pass is issued until it is covered ([`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)). |
| `403` | `2008 ACTION_NOT_PERMITTED` | The server has not enabled offline use for this user, or has blocked the user. |

The four codes every REST endpoint can return apply here too ([Chapter 07 §4.4](../../07-errors.md#44-rest-api-endpoints)).

## 4. Receipt Upload

`POST /api/v1/offline/receipts`

### 4.1 Request

The body is the Receipt exactly as the app read it from the station (characteristic FFF6, [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)): the signed `receipt` and the identifiers beside it, unaltered.

### 4.2 Response

`200 OK` with the body of a TransactionEvent RESPONSE — `status` and, when it is not `Accepted`, `reason` ([`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json)) — with the meanings [`transaction-event.md` §5.1](../transaction/transaction-event.md) gives them.

### 4.3 Rules

1. **The app MUST upload every receipt it holds**, as soon as it has connectivity, and before it requests a pass (§3), so that the pass it is issued reflects the washes it has already taken. It **MUST NOT** upload a receipt again once the server has answered `Accepted`, `Duplicate` or `Rejected`, and **MUST** upload it again, after a backoff, when the server answers `RetryLater`.
2. **The server processes an uploaded receipt as it processes a station's TransactionEvent** — deduplication, receipt signature verification, the reconcile-time gate, settlement and fraud scoring ([`reconciliation.md` §3--§8](reconciliation.md#3-deduplication-offlinetxid)). The receipt names the station that signed it (`stationId`, inside the signature — [`06-security.md` §6.2](../../06-security.md#62-transaction-receipt-signing--ecdsa-p-256)), and that is the station the gate and settlement read, not the uploader.
3. **Whichever copy arrives first may settle, and once one has settled the other is a `Duplicate`.** The app's copy and the station's TransactionEvent carry the same station-signed `receipt.data`. [`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid) compares a second arrival under a known `offlineTxId` with the first, whichever channel either came by: byte-identical signed data is answered `Duplicate` — the station deletes its record ([`transaction-event.md` §5.1](../transaction/transaction-event.md)) — and different data is answered `Rejected`, with both records kept.
4. **The server MUST refuse an upload whose signed `userId` is not the authenticated user** with `403` and `2008 ACTION_NOT_PERMITTED`, and **MUST NOT** process it. An app uploads its own receipts only.

> **Why the app's copy counts.** A station that never reconnects, or loses its store, would otherwise take every receipt of its offline period with it. The app's copy puts a station-signed receipt in the hands of a second party before the station reconciles at all, and a station cannot renumber bytes it has already signed and handed over ([`06-security.md` §6.3.1](../../06-security.md#631-what-the-counter-does-not-defend-against)).

### 4.4 Refusals

| HTTP | Code | When |
|:---:|---|---|
| `401` | `2009 JWT_EXPIRED`, `2010 JWT_INVALID` | The app is not authenticated. |
| `403` | `2008 ACTION_NOT_PERMITTED` | The receipt's signed `userId` is not the authenticated user (§4.3). |

A receipt the server refuses on its merits — a signature that does not verify, a failed gate check — is not an HTTP error: it is answered `200` with `status: "Rejected"`, as the station would be.

## 5. Related Schemas

- Pass issuance request: [`offline-pass-issuance-request.schema.json`](../../../schemas/offline-pass-issuance-request.schema.json)
- Pass issuance response: [`offline-pass-issuance-response.schema.json`](../../../schemas/offline-pass-issuance-response.schema.json)
- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- Receipt upload request: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
- Receipt upload response: [`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json)
