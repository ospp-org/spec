# Offline App–Server Contract

> **Status:** Draft | **OSPP Version:** 0.44.0

## 1. Overview

The offline model depends on these exchanges between the mobile app and the server, and this document defines them normatively:

- **pass issuance** (§3) — the server returns an OfflinePass together with the **trust bundle** the app needs while it has no network, for a device key whose hardware backing the platform has attested (§3.6);
- **receipt upload** (§4) — the app sends the server its own copy of every receipt a station signed for it;
- **the trust bundle of a Partial-A authorization** (§5) — the server's answer that carries a ServerSignedAuth carries the trust bundle too.

Everything else between the app and the server remains implementation-specific ([Chapter 02 §9](../../02-transport.md#9-https-transport-server--clients)). Each uses the transport rules of [Chapter 02 §9.1](../../02-transport.md#91-general-requirements) and the mobile-app JWT of [Chapter 02 §9.2.1](../../02-transport.md#921-mobile-app--jwt-bearer); an error is answered with the REST Error Object of [Chapter 07 §2.4](../../07-errors.md#24-rest-api-error-response).

This document binds the **server** and the **app**. It places no obligation on a station, which never takes part in any of them.

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
| `deviceKeyAttestation` | object | No | The platform's attestation that the device key is hardware-backed (§3.6). The first request for a key carries it; a later request for a key whose attestation the server has verified needs none. |

Schema: [`offline-pass-issuance-request.schema.json`](../../../schemas/offline-pass-issuance-request.schema.json).

### 3.2 The device key

The app **MUST** generate the device key as an ECDSA P-256 key pair in the phone's **hardware-backed keystore**, with a private key that cannot be exported — on iOS, the key App Attest generates in the Secure Enclave; on Android, a key of the Android Keystore bound to secure hardware, in StrongBox where the device has it — and **MUST** have the platform attest it to the server (§3.6). It **MUST** reuse that key for every pass it requests on that device, and **MUST NOT** request an offline pass from a phone that cannot hold and attest such a key. The server copies `devicePublicKey` into the pass it issues ([`offline-pass.md` §6](offline-pass.md#6-lifecycle)), and **MUST NOT** issue a pass without one, nor for a key whose attestation it has not verified (§3.6).

Both platforms provide the key this requires. The platform documentation, as published on 2026-09-29 for Android and on 2026-10-05 for iOS:

| Property | iOS | Android |
|---|---|---|
| Hardware-held P-256 keys | *"Create a cryptographic key in the Secure Enclave by calling the `generateKey(completionHandler:)` method."* — [DCAppAttestService](https://developer.apple.com/documentation/devicecheck/dcappattestservice); a Secure Enclave key *"Works only with NIST P-256 elliptic curve keys"* — [Protecting keys with the Secure Enclave](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave) | *"Key material can be bound to the secure hardware of the Android device, such as the Trusted Execution Environment (TEE) or Secure Element (SE)."* — [Android Keystore system](https://developer.android.com/privacy-and-security/keystore); StrongBox supports *"ECDSA, ECDH P-256"* (same page) |
| Private key not exportable | *"The device automatically stores the associated private key in the Secure Enclave, from where the App Attest service can use it to create signatures, but from where no process can ever directly read or modify it, ensuring its security."* — [Establishing your app's integrity](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) | *"Key material never enters the application process."* — [Android Keystore system](https://developer.android.com/privacy-and-security/keystore) |
| ECDSA P-256 / SHA-256 signing | *"Then you use the service to cryptographically sign server requests using the certified key."* — [Establishing your app's integrity](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity); a verifier *"Use the public key that you store from the attestation object to verify that the assertion's signature is valid for nonce"* — [Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) | *"This example illustrates how to generate a NIST P-256 (aka secp256r1 aka prime256v1) EC key pair in the Android KeyStore system"*, *"authorized to be used only for signing using SHA-256, SHA-384, or SHA-512 digest"* — [KeyGenParameterSpec](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec) |
| The app can tell whether the hardware is there | *"Not all devices can use the App Attest service, so it's important to have your app run a compatibility check before accessing the service."*, *"You check for availability by reading the `isSupported` property."* — [Establishing your app's integrity](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) | *"KeyProperties.SecurityLevelEnum.TRUSTED_ENVIRONMENT and KeyProperties.SecurityLevelEnum.STRONGBOX indicate that the key material resides in secure hardware."* — [KeyInfo.getSecurityLevel](https://developer.android.com/reference/android/security/keystore/KeyInfo) |

Both platforms also let a **server** verify that the key is hardware-backed, and the server **MUST** do so before it issues a pass for it (§3.6). On iOS that is why the device key is the App Attest key: App Attest attests only the keys it generates.

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
| `stationCas` | array | Yes | The Station CA set ([`06-security.md` §4.2.1](../../06-security.md#421-station-ca-rotation)): every Station CA the app accepts a station certificate from, each an object with `certificate` — the CA certificate ([`06-security.md` §4.2](../../06-security.md#42-pki-architecture)), PEM — and `crl` — that CA's current certificate revocation list ([`06-security.md` §2.1.1](../../06-security.md#211-revocation-checking)), PEM. |

1. The server **MUST** return a trust bundle with every pass it issues, current at the moment of issuance.
2. The app **MUST** replace the trust bundle it holds with the one received, on **every** issuance and with every Partial-A authorization (§5). It **MUST NOT** merge the two: a Station CA the server has removed from the set, or a certificate a CA has revoked, stays out only if the app forgets the old bundle.
3. The app authenticates a station against the bundle it holds: the station's certificate chains to the `certificate` of an entry of `stationCas`, and its serial number is on no entry of that entry's `crl` — the CRL the app holds, also once its `nextUpdate` has passed ([`06-security.md` §6.5.2](../../06-security.md#652-station-authentication--the-stations-certificate)). Until this revision the app authenticated a station by a StationIdentity that verified under a key of the server key set the bundle then carried, `serverKeys`, and did not read the Station CA certificate or its CRL. The StationIdentity is withdrawn, and the server key set with it: nothing the app verifies is signed by a server key — the station and the server verify a pass and a Partial-A authorization, the app never does. The bundle held one Station CA, `stationCaCertificate` with `stationCaCrl`, until the set replaced it, so that a rotation of the Station CA does not refuse the stations certified by the other ([`06-security.md` §4.2.1](../../06-security.md#421-station-ca-rotation)).

**Why a bundle that is replaced, and never refreshed separately.** An app holds only passes it fetched while online, each fetch — of a pass, or of a Partial-A authorization (§5) — replaces the bundle, and a pass lives at most ten days ([`offline-pass.md` §6](offline-pass.md#6-lifecycle)). The app's anchors are therefore never older than its newest usable pass, and the Station CA windows — a new CA in every bundle at least the maximum pass lifetime before it issues, an old one kept until everything it issued has expired ([`06-security.md` §4.2.1](../../06-security.md#421-station-ca-rotation)) — guarantee that the bundle holds the CA of every station certificate the app may meet.

### 3.5 Refusals

| HTTP | Code | When |
|:---:|---|---|
| `401` | `2009 JWT_EXPIRED`, `2010 JWT_INVALID` | The app is not authenticated. |
| `402` | `4001 INSUFFICIENT_BALANCE` | The user's wallet balance is not positive — zero or below; no pass is issued until it is ([`reconciliation.md` §8.1](reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)). |
| `403` | `2008 ACTION_NOT_PERMITTED` | The server has not enabled offline use for this user, or has blocked the user; or it has verified no attestation of `devicePublicKey`, or the attestation the request carries does not verify (§3.6). |

The four codes every REST endpoint can return apply here too ([Chapter 07 §4.4](../../07-errors.md#44-rest-api-endpoints)).

### 3.6 Device key attestation

**No pass without an attested device key (Normative).** The server **MUST NOT** issue a pass for a `devicePublicKey` until it has verified the platform's attestation that the key is held in the phone's hardware-backed keystore — Android Key Attestation on Android, Apple App Attest on iOS — and **MUST** refuse a request for a key it has not verified with `403` and `2008 ACTION_NOT_PERMITTED` (§3.5). The app sends the attestation, `deviceKeyAttestation`, with its first pass request for a key. The server records the key it verified, bound to the user it verified it for: a later request from that user for that key needs no attestation, and a key verified for one user is not verified for another.

1. **Challenge.** Before it generates the device key, the app obtains a one-time challenge from the server: `POST /api/v1/offline/attestation-challenges`, with no body, answered `200` with `challenge` — 32 random bytes, Base64 — and `expiresAt` ([`offline-attestation-challenge-response.schema.json`](../../../schemas/offline-attestation-challenge-response.schema.json)). The attestation names the challenge it carries in `deviceKeyAttestation.challenge`, and the server **MUST** accept a challenge once, from the user it issued it to, before its `expiresAt`.
2. **Android** (`format: "android-key"`). The app generates the device key in the Android Keystore with the challenge as its attestation challenge, and sends the key's attestation certificate chain, leaf first, each certificate DER and Base64, as `certificateChain`. The server **MUST** verify that each certificate signs the next and that the chain roots in a certificate signed with the Google attestation root key; that no certificate of it is revoked on Google's attestation status list; that the leaf's public key is `devicePublicKey`; and that the leaf's key description carries the challenge as its attestation challenge and `TrustedEnvironment` or `StrongBox` as its attestation security level.
3. **iOS** (`format: "apple-appattest"`). The device key is the App Attest key (§3.2). The app asks Apple to attest it, with the SHA-256 of the challenge as the client data hash, and sends the App Attest key identifier as `keyId` and the attestation object, Base64, as `attestationObject`. The server **MUST** verify the attestation object as Apple documents it — the certificate chain to Apple's App Attestation root, the nonce over the authenticator data and the hash of the challenge, the key identifier, the App ID, the counter and the environment — and that the public key of its credential certificate is `devicePublicKey`.

The platform documentation this rests on, as published on 2026-10-05:

| | Android | iOS |
|---|---|---|
| What the server learns | *"Key attestation gives you more confidence that the keys you use in your app are stored in a device's hardware-backed keystore."* — [Verify hardware-backed key pairs with key attestation](https://developer.android.com/privacy-and-security/security-key-attestation) | *"Ask Apple to certify the key by calling the `attestKey(_:clientDataHash:completionHandler:)` method."* — [DCAppAttestService](https://developer.apple.com/documentation/devicecheck/dcappattestservice) |
| The challenge | *"The purpose of the challenge value is to enable relying parties to verify that the key was created in response to a specific request."* — [KeyGenParameterSpec.Builder.setAttestationChallenge](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setAttestationChallenge(byte[])) | *"Every time your app needs to communicate attestation data to your server, the app first asks the server for a unique, one-time challenge."* — [Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) |
| The chain and its root | *"Verify that the root public certificate is trustworthy and that each certificate signs the next certificate in the chain."* — [Verify hardware-backed key pairs with key attestation](https://developer.android.com/privacy-and-security/security-key-attestation) | *"Verify that the `x5c` array contains the intermediate and leaf certificates for App Attest, starting from the credential certificate in the first data buffer in the array (`credcert`)."* — [Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) |
| Hardware backing, and the key | *"the `attestationSecurityLevel` element within the key description data structure is set to the `TrustedEnvironment` security level or to the `StrongBox` security level"* — [Verify hardware-backed key pairs with key attestation](https://developer.android.com/privacy-and-security/security-key-attestation) | *"Create the SHA256 hash of the public key in `credCert` with X9.62 uncompressed point format, and verify that it matches the key identifier from your app."* — [Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) |
| Revocation | *"it's critical that the status of each certificate in an attestation chain be checked against the official certificate revocation status list (CRL)"* — [Verify hardware-backed key pairs with key attestation](https://developer.android.com/privacy-and-security/security-key-attestation) | *"As an added protection against replay attacks, make sure that the public key doesn't already have an association with another user."* — [Validating apps that connect to your server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) |

## 4. Receipt Upload

`POST /api/v1/offline/receipts`

### 4.1 Request

The body is the Receipt exactly as the app received it from the station (the `receipt` of the ReceiptResponse on characteristic FFF6, [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)): the signed `receipt` and the identifiers beside it, unaltered.

### 4.2 Response

`200 OK` with the body of a TransactionEvent RESPONSE — `status` and, when it is not `Accepted`, `reason` ([`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json)) — with the meanings [`transaction-event.md` §5.1](../transaction/transaction-event.md#51-response-status-values) gives them; the receipt of a Partial-B session that its station's end record already settled, or that the server closed itself, is answered `Duplicate` too (§4.3).

### 4.3 Rules

1. **The app MUST upload every receipt it holds**, as soon as it has connectivity, and before it requests a pass (§3), so that the pass it is issued reflects the washes it has already taken. An upload answered `RetryLater` has been made, so it does not hold back the pass request of [`offline-pass.md` §6](offline-pass.md#6-lifecycle); the app uploads that receipt again after the backoff. It **MUST NOT** upload a receipt again once the server has answered `Accepted`, `Duplicate` or `Rejected`, and **MUST** upload it again, after a backoff, when the server answers `RetryLater`.
2. **The server processes an uploaded receipt as it processes a station's TransactionEvent** — deduplication, receipt signature verification, the reconcile-time gate, settlement and fraud scoring ([`reconciliation.md` §3--§8](reconciliation.md#3-deduplication-offlinetxid)). The receipt names the station that signed it (`stationId`, inside the signature — [`06-security.md` §6.2](../../06-security.md#62-transaction-receipt-signing--ecdsa-p-256)), and that is the station the gate and settlement read, not the uploader.
3. **Whichever copy arrives first may settle, and once one has settled the other is a `Duplicate`.** The app's copy and the station's TransactionEvent carry the same station-signed `receipt.data`. [`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid) compares an arrival under an `offlineTxId` the ledger holds with the stored one, whichever channel either came by: byte-identical signed data is answered `Duplicate` — the station deletes its record ([`transaction-event.md` §5.1](../transaction/transaction-event.md#51-response-status-values)) — and different data is answered `Rejected`, with both records kept. The receipt of a Partial-B session has one more counterpart: the station's SessionEnded, or StopService RESPONSE, under the session's `sessionId`. Whichever of them arrives first settles the session, and once it has settled the app's upload is a `Duplicate` with no effect ([`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid)). When the server closed the session itself and the upload is the first of its records to arrive after that close, it is a `Duplicate` too, and trues the close down when it settles below it, never up ([`authorize-offline-pass.md` §6](authorize-offline-pass.md#6-processing-rules) rule 4b).
4. **The server MUST refuse an upload whose signed `userId` is not the authenticated user** with `403` and `2008 ACTION_NOT_PERMITTED`, and **MUST NOT** process it. An app uploads its own receipts only.

> **Why the app's copy counts.** A station that never reconnects, or loses its store, would otherwise take every receipt of its offline period with it. The app's copy puts a station-signed receipt in the hands of a second party before the station reconciles at all, and a station cannot renumber bytes it has already signed and handed over ([`06-security.md` §6.3.1](../../06-security.md#631-what-the-counter-does-not-defend-against)).

### 4.4 Refusals

| HTTP | Code | When |
|:---:|---|---|
| `401` | `2009 JWT_EXPIRED`, `2010 JWT_INVALID` | The app is not authenticated. |
| `403` | `2008 ACTION_NOT_PERMITTED` | The receipt's signed `userId` is not the authenticated user (§4.3). |

A receipt the server refuses on its merits — a signature that does not verify, a failed gate check — is not an HTTP error: it is answered `200` with `status: "Rejected"`, as the station would be.

## 5. The Partial-A Authorization

When the phone is online and the station is not, the app obtains a ServerSignedAuth from the server — `POST /sessions/offline-auth` ([`04-flows.md` §5b](../../04-flows.md#5b-partial-a--phone-online-station-offline); [`ble-handshake.md` §4.2](ble-handshake.md#42-serversignedauth-partial-a)) — and relays it to the station over BLE. Before it relays it, it authenticates the station against a trust bundle ([`06-security.md` §6.5.2](../../06-security.md#652-station-authentication--the-stations-certificate)), and the phone may hold no pass, and so no bundle, at all.

**The phone receives the trust bundle with its authorization (Normative).** The server's response that carries the authorization — its `signedAuthorization` and `sessionId` — **MUST** also carry `trustBundle`, the object of §3.4, current at that moment: the Station CA set, each CA with its CRL. The app **MUST** replace the bundle it holds with it, as on every issuance, and authenticates the station against it before it relays the authorization. This document defines that member of the response; the request and the authorization are those of [`04-flows.md` §5b](../../04-flows.md#5b-partial-a--phone-online-station-offline) and [`ble-handshake.md` §4.2](ble-handshake.md#42-serversignedauth-partial-a).

## 6. Related Schemas

- Attestation challenge response: [`offline-attestation-challenge-response.schema.json`](../../../schemas/offline-attestation-challenge-response.schema.json)
- Pass issuance request: [`offline-pass-issuance-request.schema.json`](../../../schemas/offline-pass-issuance-request.schema.json)
- Pass issuance response, and the trust bundle a Partial-A authorization carries too: [`offline-pass-issuance-response.schema.json`](../../../schemas/offline-pass-issuance-response.schema.json)
- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- Receipt upload request: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
- Receipt upload response: [`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json)
