# Chapter 06 — Security

> **Status:** Draft | **OSPP Version:** 0.13.0

This chapter defines the complete security model for the OSPP protocol, covering threat analysis, authentication, authorization, cryptographic requirements, message integrity, offline security, anti-abuse mechanisms, and data protection.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

For message references, see [Chapter 03 — Message Catalog](03-messages.md). Messages are referenced as **[MSG-XXX]**.

---

## 1. Threat Model

OSPP operates in a **hostile physical environment** — self-service points are deployed in public spaces, communicate over untrusted networks, and must handle financial transactions both online and offline. This section enumerates the threats specific to this domain and maps each to the countermeasures defined in subsequent sections.

### 1.1 Threat Summary

| ID | Threat | Impact | Severity | Countermeasure |
|:--:|--------|--------|:--------:|----------------|
| T01 | [Replay Attack](#t01---replay-attack) | Duplicate service activation or credit deduction | High | §5.3 HMAC with messageId, §6.3 monotonic counter |
| T02 | [Man-in-the-Middle](#t02---man-in-the-middle) | Eavesdrop or modify station commands | Critical | §2.1 mTLS (TLS 1.2+), §5 HMAC-SHA256 |
| T03 | [Credit Fraud / Double-Spend](#t03---credit-fraud--double-spend) | Unauthorized service without payment | Critical | §6.1 OfflinePass limits, §6.2 signed receipts with txCounter, §6.6 epoch revocation, §7.4 fraud scoring |
| T04 | [Unauthorized Station Access](#t04---unauthorized-station-access) | Rogue station impersonation or topic hijacking | Critical | §2.1 mTLS + CN-based ACL, §4.2 PKI |
| T05 | [Session Hijacking](#t05---session-hijacking) | Take over another user's session | High | §2.2 JWT short-lived, §2.3 session token UUID, §5 HMAC |
| T06 | [Offline Abuse](#t06---offline-abuse) | Exploit offline mode for unlimited free services | High | §6.1-§6.6 OfflinePass constraints, §7.4 fraud detection |
| T07 | [Payment Fraud](#t07---payment-fraud) | Bypass payment via forged webhooks or repeated attempts | High | §2.5 HMAC-SHA512 webhook, §7.3 anti-abuse layers |
| T08 | [Firmware Tampering](#t08---firmware-tampering) | Install malicious firmware to bypass security | Critical | §4.6 firmware code-signing, §4.5 secure storage, A/B rollback, SecurityEvent [MSG-012] |
| T09 | [Physical Tampering](#t09---physical-tampering) | Access internal components, extract keys | Critical | §4.5 secure element, tamper detection, SecurityEvent [MSG-012] |
| T10 | [Certificate Compromise](#t10---certificate-compromise) | Impersonate a station after private key extraction | Critical | §4.3 CRL/OCSP, on-device key generation, §4.5 secure storage |
| T11 | [Webhook Spoofing](#t11---webhook-spoofing) | Forge payment confirmations | High | §2.5 HMAC-SHA512 + IP whitelist + timing-safe comparison |
| T12 | [BLE Eavesdropping](#t12---ble-eavesdropping) | Intercept offline pass or session data over-the-air | Medium | §6.5.3 application-layer AEAD (ChaCha20-Poly1305) over an ECDH-authenticated channel, §6.5.2 StationIdentity verification |
| T13 | [Denial of Service](#t13---denial-of-service) | Station becomes unresponsive to legitimate users | High | §7.1 rate limiting, BLE connection throttling, MQTT message rate cap |
| T14 | [BLE Presence Tracking](#t14---ble-presence-tracking) | Track a device's physical presence via the plaintext `deviceId` in Hello | Low | Accepted residual for v0.6.0; mitigation deferred to a future design revision (see T14) |

### T01 - Replay Attack

**Description:** An attacker captures a valid MQTT message or BLE message and retransmits it to trigger duplicate actions (e.g., replay a StartService to get a free service, replay a TransactionEvent to double-charge a user).

**Countermeasures:**
- Every MQTT message carries a unique `messageId` (RFC 4122 UUID). Receivers maintain a deduplication window (last 1000 IDs or 1 hour) and reject duplicates (see [Chapter 02](02-transport.md), §3.3).
- HMAC-SHA256 binds the `messageId` and `timestamp` to the session key — replayed messages with old timestamps are detectable.
- BLE OfflineAuthRequest [MSG-031] includes a **monotonic counter** that MUST be strictly greater than the last seen counter; replaying an old counter value triggers error `2005 OFFLINE_COUNTER_REPLAY`.
- BLE session keys are derived per-handshake from fresh ephemeral ECDH keys and nonces (§6.5), so captured messages from a previous session are invalid and cannot be decrypted later (forward secrecy).

### T02 - Man-in-the-Middle

**Description:** An attacker intercepts the network path between the station and broker (or between the app and server) to eavesdrop, modify, or inject messages.

**Countermeasures:**
- **TLS 1.2+ mandatory** on all MQTT and HTTPS connections; TLS 1.3 RECOMMENDED. 0-RTT MUST NOT be used (replay risk).
- **mTLS** (mutual TLS) — both the station and broker present X.509 certificates. The station verifies the broker's certificate, and the broker verifies the station's certificate, preventing impersonation on either side.
- **HMAC-SHA256 defense-in-depth** — even if TLS were compromised, message tampering is detectable via the MAC field.
- **BLE application-layer AEAD** (ChaCha20-Poly1305 over an ECDH-authenticated channel, §6.5) protects all post-Challenge traffic end-to-end; an active MITM cannot derive the session key without the station's certified static key, and the app refuses to send a credential to any station whose StationIdentity certificate does not verify (§6.5.2).

### T03 - Credit Fraud / Double-Spend

**Description:** A malicious user or device attempts to obtain service without payment, or to spend the same credits multiple times (especially in offline mode where real-time balance checks are not possible).

**Countermeasures:**
- **OfflinePass** (see §6.1) enforces hard limits: `maxUses`, `maxTotalCredits`, `maxCreditsPerTx` — [§6.1.1](#611-offlinepass-validation--10-checks) checks #6, #7 and #8 respectively. (`offlineAllowance.allowedServiceTypes` is carried and signed but read by no check in any of the three gates; it is not a limit this countermeasure can claim — see §6.1.1.)
- **Epoch-based revocation** (§6.6) — incrementing the global `RevocationEpoch` invalidates ALL passes issued before that epoch. Constant-time check on station; no CRL distribution required.
- **ECDSA P-256 signed receipts with txCounter** (§6.2) — stations cryptographically sign every transaction including a monotonic counter. Unsigned or incorrectly signed transactions are flagged as CRITICAL. The counter itself is forensic (§6.3): a discontinuity raises an operator alert on the station and never withholds settlement.
- **Fraud scoring** (§7.4) — post-reconciliation scoring with automatic response (disable offline, revoke pass, block user).

### T04 - Unauthorized Station Access

**Description:** A rogue device impersonates a legitimate station to receive commands, intercept session data, or inject fake telemetry.

**Countermeasures:**
- **mTLS with CN-based ACL** — the broker verifies the station's X.509 certificate and enforces that CN = `stn_{station_id}`. A station can ONLY subscribe to its own `to-station` topic and publish to its own `to-server` topic.
- **Private keys generated on-device** (§4.5) — TLS and ECDSA private keys never leave the station. Even the provisioning server never sees the private key.
- **CRL/OCSP revocation** — compromised certificates are revoked and rejected by the broker.

### T05 - Session Hijacking

**Description:** An attacker takes over another user's active session to control the service (start/stop) or receive their receipts.

**Countermeasures:**
- **JWT access tokens** (§2.2) expire in 15 minutes, limiting the window of a stolen token.
- **Web payment session tokens** (§2.3) are RFC 4122 UUIDs (any version), 10-minute TTL, stored in Redis (not cookies or localStorage), and scoped to a single payment flow.
- **MQTT session isolation** — each station's messages flow through its own topic pair. There is no station-to-station communication.

### T06 - Offline Abuse

**Description:** A user exploits offline mode to obtain unlimited free services — e.g., by modifying the OfflinePass, replaying passes, or using a pass after it has been revoked.

**Countermeasures:**
- **10-check OfflinePass validation** (§6.1) performed by the station: signature, expiry, epoch, device binding, limits, interval, and counter.
- **Monotonic counter** — prevents replay of the same pass data.
- **Per-pass constraints**: `maxUses`, `maxTotalCredits`, `maxCreditsPerTx`, `minIntervalSec`, `stationOfflineWindowHours`, `stationMaxOfflineTx`.
- **Epoch revocation** — one server-side increment invalidates all outstanding passes.
- **Negative wallet balance allowed** during reconciliation — the user is charged even if their balance goes negative (collected as debt).

### T07 - Payment Fraud

**Description:** Attacker forges payment webhooks, exploits the web payment flow to lock bays without paying, or performs card testing attacks.

**Countermeasures:**
- **HMAC-SHA512 webhook verification** (§2.5) with timing-safe comparison.
- **IP whitelist** — the server SHOULD accept webhook traffic only from known processor IP ranges ([§2.5](#25-payment-processor--server--hmac-sha512-webhook)). This is a SHOULD, not a filter this specification guarantees.
- **5-layer anti-abuse** (§7.3): IP rate limiting, device fingerprinting, progressive CAPTCHA, abandon scoring, and bay-lock-at-payment-only.

### T08 - Firmware Tampering

**Description:** Attacker installs modified firmware to bypass security checks, disable offline validation, or exfiltrate keys.

**Countermeasures:**
- **ECDSA P-256 firmware code-signing** — see §4.6.
- **SHA-256 checksum verification** before installation.
- **A/B partition scheme** with automatic rollback when the new image fails to send a BootNotification within the watchdog window ([Chapter 05 §6.4–§6.5](05-state-machines.md#64-ab-partition-scheme)). The trigger is that timeout, not a self-test.
- **FirmwareIntegrityFailure** SecurityEvent [MSG-012] on checksum mismatch or signature failure.
- Firmware URL uses HTTPS — binary is integrity-protected in transit.

### T09 - Physical Tampering

**Description:** Attacker opens the station enclosure to access the hardware, extract keys from storage, or modify the hardware.

**Countermeasures:**
- **Secure element / TPM** for private key storage (§4.5) — keys are non-extractable **where the hardware supports it**. §4.5 requires an SE/TPM/TEE only "if available"; a station without one stores keys in encrypted NVS, and those keys are not non-extractable.
- **Tamper detection switch** — enclosure opening triggers `TamperDetected` SecurityEvent [MSG-012] (severity: Critical).
- **Encrypted NVS** — even if storage is accessed, data is encrypted at rest.

### T10 - Certificate Compromise

**Description:** Station's TLS private key is extracted (e.g., via physical access or firmware exploit), allowing impersonation.

**Countermeasures:**
- **On-device key generation** — private keys are generated on the station's secure element and never transmitted.
- **CRL/OCSP revocation** — compromised certificates are revoked; the broker rejects connections from revoked certificates.
- **Certificate renewal alerts** — background job alerts when a certificate is within 30 days of expiry.

### T11 - Webhook Spoofing

**Description:** Attacker sends forged payment webhooks to trigger service activation without actual payment.

**Countermeasures:**
- **HMAC-SHA512** signature verification (`X-PG-Signature` header).
- **Timing-safe comparison** prevents timing attacks on HMAC verification.
- **IP whitelist** — the server SHOULD accept only traffic from payment processor IP ranges ([§2.5](#25-payment-processor--server--hmac-sha512-webhook)). Unlike the two rows above, this is a SHOULD.
- **Idempotency** — duplicate webhooks for the same payment are safely ignored.

### T12 - BLE Eavesdropping

**Description:** Attacker within BLE range captures over-the-air traffic to steal OfflinePass data or session credentials.

**Countermeasures:**
- **Application-layer AEAD** (ChaCha20-Poly1305 IETF, §6.5.3) encrypts and authenticates all post-Challenge traffic end-to-end, independent of any BLE link-layer pairing. The OfflinePass and receipt are never exposed in plaintext over the air.
- **Authenticated, forward-secret key agreement** (§6.5): the per-handshake ECDH (ephemeral-static + ephemeral-ephemeral) means a passive capture cannot be decrypted even if a station's static key is later compromised, and an active attacker cannot impersonate the station without a valid StationIdentity certificate (§6.5.2).
- **Per-connection isolation** — handshake and session state are scoped to the single GATT connection that established them and discarded on disconnect, and a command **MUST NOT** be honoured on a connection that did not establish its session ([ble-transport.md §12](profiles/offline/ble-transport.md#12-connection-lifecycle-and-isolation)). A station **MAY** additionally bound how many concurrent central connections it accepts; that bound is optional and this specification sets no default or ceiling for it.

### T13 - Denial of Service

**Description:** Attacker floods the station with BLE connection requests, malformed MQTT messages, or rapid connect/disconnect cycles, rendering it unresponsive to legitimate users.

**Countermeasures:**
- Station **SHOULD** implement rate limiting on BLE connections (max 5 connection attempts per 30 seconds per device, max 20 total per minute).
- Station **SHOULD** implement MQTT message rate limiting (max 100 messages per second; excess messages logged and dropped).
- Station **SHOULD** implement connection rate limiting (max 3 MQTT reconnection attempts per minute from same IP, if detectable).
- Broker **SHOULD** enforce per-client rate limits: max 100 PUBLISH/minute per station. Excess messages **SHOULD** be dropped with MQTT DISCONNECT reason code `0x96` (Message rate too high). This default assumes ≤4 bays at the registry default `MeterValuesInterval` of 60s ([Chapter 08 §3](08-configuration.md#3-transaction-configuration-keys)). Operators deploying stations with more bays or `MeterValuesInterval` below 10 seconds **SHOULD** increase this limit proportionally (recommended formula: `bays × 60/MeterValuesInterval + 20` overhead).
- Station **SHOULD** implement exponential backoff on repeated failures (initial delay 1 second, max delay 60 seconds, jitter ±20%).
- Server **SHOULD** monitor for anomalous traffic patterns (message frequency spikes, unusual topic access) and alert operators.

### T14 - BLE Presence Tracking

**Description:** The `Hello` message ([ble-handshake.md §2](profiles/offline/ble-handshake.md)) is sent in **plaintext**, as the first handshake step — **before** the AEAD channel exists and before the app verifies the station's certificate. It carries `deviceId`, a **stable** device identifier. Any BLE radio within range (~10–20 m) — including a passive fake station or a dedicated tracker that merely advertises the OSPP service UUID — can capture `deviceId` from the `Hello` write and use it to track the physical presence and movement of that device over time.

This is a **privacy** exposure, **not** a credential compromise: the OfflinePass, the receipt, and all session data remain confidential (they travel only inside the AEAD channel, §6.5.3); only the `deviceId` identifier leaks.

**Severity: Low.** Exploitation requires the attacker to operate BLE-range hardware at locations of interest and to correlate `deviceId` with a real-world identity to be meaningful; it yields presence/movement metadata, never the credential or funds.

**Status — accepted residual for v0.6.0.** Mitigation is a **future design revision**, deliberately not taken now because it would touch the (Red-Team-validated) key schedule: `deviceId` is bound into the HKDF `info` (§6.5 Pin 3) and is the app-chosen client identity used in the device-binding checks (§6.1.1 #4). Replacing it with an ephemeral/rotating identifier — or removing it from the plaintext `Hello` — is coupled with (a) the intended-station binding (§6.5.2) and (b) the real mobile client (B6), since all three concern *what an unauthenticated peer can observe or assume before the channel exists*. Changing it now — against a mock-only app with no field deployment — is disproportionate risk to the validated construction for a small metadata leak. Tracked for a future revision.

**Partial measures available today (non-normative):** an app MAY reduce exposure by minimizing BLE scan/advertising footprint and by not reusing the same `deviceId` across unrelated accounts; these reduce but do not eliminate the leak.

---

## 2. Authentication Mechanisms

OSPP uses **channel-specific authentication** — each communication channel has its own authentication mechanism appropriate to its threat model and operational constraints.

### 2.1 Station ↔ Server — Mutual TLS (mTLS)

| Property | Value |
|----------|-------|
| **Protocol** | TLS 1.2+ (1.3 recommended) |
| **Authentication** | Mutual — both station and broker present X.509 certificates |
| **Station Certificate CN** | `stn_{station_id}` (e.g., `stn_a1b2c3d4`) |
| **Applies to** | MQTT (port 8883), Station REST fallback (mTLS), and — for the station-side certificate-validation requirements below only — the pre-credential HTTPS provisioning call ([Chapter 04 — Flows §2](04-flows.md#2-station-provisioning)), which is server-authenticated rather than mutual |

**Requirements:**
- The station MUST present a valid X.509 client certificate signed by the OSPP Station CA.
- The broker MUST verify the station certificate against the OSPP trust chain (Root CA → Station CA → Station Cert).
- The station MUST verify the broker's server certificate. If the provisioning response includes `brokerRootCa`, the station MUST use it as the trust anchor for this verification; otherwise, the station MAY use its system trust store.
- **Server identity verification — the station MUST check the name, not only the chain.** After the chain validates, the station **MUST** verify that the presented certificate actually identifies the host it meant to reach, per [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525): it **MUST** match the reference identity against the certificate's `subjectAltName` extension — a `dNSName` entry for a hostname, an `iPAddress` entry for an IP literal — and **MUST NOT** fall back to the Subject Common Name. The reference identity is the host the station was configured with: `mqttConfig.brokerHost` from the provisioning response for the MQTT leg, and the host of the provisioning endpoint URL for the HTTPS leg. A wildcard `dNSName` matches at most one label, and only the leftmost. **On mismatch the station MUST refuse**, exactly as for a chain failure.

  This requirement applies to **both** legs, and it matters **most** on the HTTPS provisioning call: that call carries the provisioning token, the one bearer credential that authorises certificate issuance, and it happens **before** the station holds any credential of its own with which to detect an impostor.

  It is stated because chain validation alone does not imply it and, on the embedded TLS stacks these stations use, does not perform it. mbedTLS and wolfSSL require the expected name to be set explicitly — `mbedtls_ssl_set_hostname()`, `wolfSSL_check_domain_name()` — and if it is omitted the handshake still succeeds and the chain still validates. A station that verifies the chain but not the name therefore accepts **any** certificate from **any** publicly-trusted CA for **any** domain, which reduces the system trust store fallback above to no authentication at all against an attacker who can obtain one certificate for one domain they control.

- **A station that cannot validate MUST refuse.** This applies to both legs and to both failure modes: on the MQTT connection and on the HTTPS provisioning call ([Chapter 04 — Flows §2](04-flows.md#2-station-provisioning)), whether no trust anchor is obtainable at all or an anchor is present and the presented chain does not validate against it. *Refuse* means the connection is not completed and the call is not made — the station **MUST NOT** proceed on an unvalidated certificate. Recording the failure and continuing is **not** a conforming outcome. Where no anchor is obtainable the deployment has failed to supply a required row of [Chapter 01 — Architecture §7.2](01-architecture.md#72-physical-configuration) (*Broker trust policy*, *HTTPS trust policy*); the station's obligation is unchanged by that.
- The broker MUST extract the CN from the client certificate and use it for **topic ACL enforcement** (see §3.3).
- TLS session resumption is RECOMMENDED for reconnection performance. **0-RTT MUST NOT be used** (replay risk).

**TLS cipher suites** (broker offers exactly these, in preference order):

| Priority | TLS | Cipher Suite |
|:--------:|:---:|--------------|
| 1 | 1.3 | `TLS_AES_256_GCM_SHA384` |
| 2 | 1.3 | `TLS_AES_128_GCM_SHA256` |
| 3 | 1.2 | `ECDHE-ECDSA-AES256-GCM-SHA384` |
| 4 | 1.2 | `ECDHE-ECDSA-AES128-GCM-SHA256` |

The TLS 1.2 suites are ECDHE-ECDSA with AEAD-GCM only, matching the ECDSA P-256 server certificate. CBC-mode, RSA-key-exchange, and 3DES suites MUST NOT be offered or accepted. (`TLS_CHACHA20_POLY1305_SHA256` is dropped from the offered set under the TLS-1.2-floor hardening.)

**Key exchange groups:** X25519 (preferred), secp256r1.

### 2.2 User ↔ Server — JWT (Mobile App)

| Property | Value |
|----------|-------|
| **Protocol** | HTTPS REST |
| **Header** | `Authorization: Bearer {access_token}` |
| **Access Token** | ES256 (ECDSA P-256), 15-minute expiry |
| **Refresh Token** | ES256 (ECDSA P-256), 30-day expiry, one-time-use, server-stored, revocable |

**Access token payload:**

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | User identifier (`sub_{uuid}`) |
| `email` | string | User email |
| `iat` | integer | Issued-at timestamp (Unix epoch) |
| `exp` | integer | Expiration timestamp (Unix epoch) |

**Requirements:**
- Access tokens MUST be short-lived (15 minutes).
- Refresh tokens MUST be one-time-use — each refresh generates a new refresh token and invalidates the old one.
- Refresh tokens MUST be stored server-side (Redis or database) and revocable.
- The server MUST reject expired access tokens with `401 Unauthorized`.
- The server MUST reject revoked or reused refresh tokens with `401 Unauthorized` and SHOULD invalidate all sessions for that user (refresh token reuse indicates compromise).

### 2.3 User ↔ Server — Session Token (Web Payment)

| Property | Value |
|----------|-------|
| **Protocol** | HTTPS REST |
| **Token** | RFC 4122 UUID (any version) in URL path (e.g., `/pay/sessions/{sessionToken}/status`) |
| **TTL** | 10 minutes |
| **Storage** | Redis with TTL |
| **Scope** | Single payment flow only |

**Requirements:**
- Session tokens MUST be a valid RFC 4122 UUID; version 4 (122 bits of entropy) is RECOMMENDED.
- Tokens MUST NOT be stored in cookies, localStorage, or sessionStorage (URL-only).
- Tokens MUST expire after 10 minutes.
- Tokens MUST be scoped to a single station + bay + service combination.
- The server MUST invalidate the token after the session completes.
- **CORS policy:** `https://pay.{domain}` only — no wildcard origins.

### 2.4 User ↔ Station — BLE Challenge-Response

| Property | Value |
|----------|-------|
| **Protocol** | BLE GATT |
| **Mechanism** | HELLO/CHALLENGE handshake (ECDH P-256 + StationIdentity cert) + OfflinePass or ServerSignedAuth |
| **Encryption** | Application-layer AEAD — ChaCha20-Poly1305 IETF (§6.5.3). LESC link encryption OPTIONAL (§6.4), not assumed. |

**Authentication flows** (see [Chapter 04 — Flows](04-flows.md), §5a/b/c):

| Scenario | Auth Message | Validation |
|----------|-------------|------------|
| Full Offline | OfflineAuthRequest [MSG-031] | Station validates ECDSA P-256 signature + 10 checks locally |
| Partial A (phone online) | ServerSignedAuth [MSG-032] | Station verifies ECDSA P-256 server signature |
| Partial B (station online) | OfflineAuthRequest [MSG-031] | Station forwards to server via AuthorizeOfflinePass [MSG-002] |

**Handshake security:**
- Fresh ephemeral P-256 key pairs and 32-byte nonces on every handshake prevent replay and provide forward secrecy.
- The app **verifies the StationIdentity certificate before sending any credential** (§6.5.2), so a pass is never leaked to an impersonating station.
- The session key is derived via ECDH P-256 + HKDF-SHA256 (§6.5), binding the session to the authenticated station identity and the full handshake transcript.
- `sessionProof` proves participation, and all post-Challenge traffic is encrypted/authenticated by the AEAD channel (§6.5.3).

### 2.5 Payment Processor → Server — HMAC-SHA512 Webhook

| Property | Value |
|----------|-------|
| **Protocol** | HTTPS POST (server-to-server) |
| **Endpoint** | `POST /webhooks/{processor}/payment` |
| **Signature Header** | `X-PG-Signature` (or processor-specific) |
| **Algorithm** | HMAC-SHA512 |

**Requirements:**
- The server MUST verify the HMAC-SHA512 signature using the processor's shared secret.
- Verification MUST use **timing-safe comparison** (constant-time) to prevent timing attacks.
- The server SHOULD enforce **IP whitelist** — only accept webhook traffic from known processor IP ranges.
- Duplicate webhooks (same payment ID) MUST be idempotently handled (do not double-credit or double-start).

### 2.6 Management Dashboard — JWT + RBAC + MFA

| Property | Value |
|----------|-------|
| **Protocol** | HTTPS |
| **Authentication** | JWT (same mechanism as §2.2) |
| **Authorization** | Role-Based Access Control (see §3.1) |
| **MFA** | TOTP (Time-based One-Time Password) REQUIRED for admin roles |

---

## 3. Authorization Model

### 3.1 RBAC Roles

OSPP defines 7 roles with scoped permissions:

| Role | Scope | Description |
|------|-------|-------------|
| **Platform Admin** | Global | Full access to all resources across all organizations |
| **Operator Admin** | All owned locations | Manage stations, bays, prices, sessions for their locations |
| **Location Manager** | Assigned locations | Bay status, maintenance mode, view sessions |
| **Accounting** | Financial data | View transactions, reports, issue refunds |
| **Corporate Admin** | Their organization | Manage vehicles, policy, view usage |
| **Support Agent** | Read + user actions | View sessions, issue refunds, assist users |
| **User** | Own data | Profile, wallet, sessions, vehicles, offline pass |

### 3.2 Per-Message Authorization

Each MQTT message has an implicit authorization based on its direction and the authenticated identity:

| Message | Authorized Sender | Verified By |
|---------|-------------------|-------------|
| BootNotification [MSG-001] | Station (via mTLS CN) | Server verifies CN matches `stationId` in payload |
| Heartbeat [MSG-008] | Station (via mTLS CN) | Server verifies topic matches CN |
| StatusNotification [MSG-009] | Station (via mTLS CN) | Server verifies `bayId` belongs to station |
| MeterValues [MSG-010] | Station (via mTLS CN) | Server verifies `sessionId` belongs to station |
| TransactionEvent [MSG-007] | Station (via mTLS CN) | Server verifies receipt signature |
| SecurityEvent [MSG-012] | Station (via mTLS CN) | Server logs unconditionally |
| StartService [MSG-005] | Server | Station verifies HMAC (session key) |
| StopService [MSG-006] | Server | Station verifies HMAC (session key) |
| ReserveBay [MSG-003] | Server | Station verifies HMAC (session key) |
| ChangeConfiguration [MSG-013] | Server | Station verifies HMAC (session key) |
| UpdateFirmware [MSG-016] | Server | Station verifies HMAC + checksum |
| All server→station commands | Server | Station MUST verify HMAC before execution, and MUST reject rather than execute when the MAC is absent or unverifiable ([§5.7](#57-failure-handling--both-directions-fail-closed)) |
| All station→server messages | Station (via mTLS CN) | Server MUST verify HMAC before processing, on the same terms |

### 3.3 MQTT Topic ACL

The MQTT broker MUST enforce topic-level access control based on the client certificate CN:

| Client | Subscribe | Publish | Deny |
|--------|-----------|---------|------|
| Station `stn_X` | `ospp/v1/stations/stn_X/to-station` | `ospp/v1/stations/stn_X/to-server` | All other topics |
| Server | `$share/ospp-servers/ospp/v1/stations/+/to-server` | `ospp/v1/stations/+/to-station` | All other topics |

**Rules:**
- A station MUST NOT subscribe to another station's topics.
- A station MUST NOT publish to another station's topics.
- ACL enforcement MUST be at the broker level, based on the mTLS client certificate CN.
- ACL violations MUST be logged by the broker and SHOULD trigger a SecurityEvent [MSG-012].

### 3.4 REST API Authorization

| Endpoint Group | Required Role | Auth Method |
|----------------|--------------|-------------|
| `/sessions/*` | User | JWT Bearer |
| `/wallet/*` | User | JWT Bearer |
| `/me/*` | User | JWT Bearer |
| `/pay/*` | Anonymous | Session token (UUID) |
| `/admin/stations/*` | Operator Admin+ | JWT Bearer + RBAC |
| `/admin/users/*` | Support Agent+ | JWT Bearer + RBAC |
| `/webhooks/*` | Payment Processor | HMAC-SHA512 signature |
| `/station/{id}/offline-txs` | Station | mTLS certificate |
| `/station/{id}/config` | Station | mTLS certificate |
| `/api/v1/stations/provision` | Station (unprovisioned) | Provisioning token |

---

## 4. Cryptographic Requirements

### 4.1 Algorithm Inventory

| # | Key / Operation | Algorithm | Key Size | Standard | Purpose |
|:-:|-----------------|-----------|:--------:|----------|---------|
| 1 | TLS transport | TLS 1.2+ (1.3 recommended) | — | RFC 5246 / RFC 8446 | Channel encryption (all connections) |
| 2 | Station TLS cert | ECDSA P-256 | 256 bit | X.509 v3 | mTLS authentication |
| 3 | MQTT HMAC session key | HMAC-SHA256 | 256 bit (32 bytes) | FIPS 198-1 | Per-boot message integrity (selective — see §5) |
| 4 | OfflinePass signing | ECDSA P-256 (RFC 6979) | 256 bit | FIPS 186-4, RFC 6979 | Server signs offline authorization |
| 5 | Receipt signing | ECDSA P-256 (RFC 6979) | 256 bit | FIPS 186-4, RFC 6979 | Station signs transaction receipts (includes txCounter) |
| 6 | BLE session key | ECDH P-256 + HKDF-SHA256 | 256 bit (32 bytes) | RFC 5903, RFC 5869 | Per-handshake BLE session key (ephemeral-static + ephemeral-ephemeral ECDH; §6.5). Replaces the v0.5.x LTK input. |
| 7 | BLE channel AEAD | ChaCha20-Poly1305 (IETF) | 256-bit key | RFC 8439 | Post-Challenge BLE message confidentiality + integrity (§6.5.3). LESC AES-CCM link encryption is now OPTIONAL (§6.4), not a security premise. |
| 8 | Webhook verification | HMAC-SHA512 | 512 bit | FIPS 198-1 | Payment webhook integrity |
| 9 | JWT signing | ES256 (ECDSA P-256) | 256 bit | RFC 7518 | Access/refresh token signing |
| 10 | Root CA | ECDSA P-384 | 384 bit | X.509 v3 | Trust anchor (offline, air-gapped) |

> **Note:** All software-based ECDSA signing operations **MUST** use **RFC 6979** deterministic nonce generation. This eliminates the catastrophic failure mode where a reused or weak random nonce leaks the private key. Hardware secure elements (e.g., ATECC608B) that use internal hardware RNG for nonce generation are exempt from this requirement, as hardware RNG prevents software nonce reuse.

**Deprecated/prohibited algorithms:**
- MD5 — MUST NOT be used anywhere
- SHA-1 — MUST NOT be used for signatures or HMAC
- TLS 1.1 or earlier (SSLv3, TLS 1.0, TLS 1.1) — MUST NOT be used
- RC4, DES, 3DES — MUST NOT be used
- RSA key exchange (non-PFS) — MUST NOT be used
- Ed25519 — MUST NOT be used (replaced by ECDSA P-256 for secure element compatibility)
- RSA (any key size) — MUST NOT be used for station certificates or signing operations (replaced by ECDSA P-256/P-384)

### 4.2 PKI Architecture

```
OSPP Root CA (ECDSA P-384, OFFLINE, air-gapped HSM, 20-year validity)
  └── OSPP Station CA (ECDSA P-256, online HSM, 5-year validity)
        ├── stn_a1b2c3d4.pem (ECDSA P-256, 1-year validity)
        ├── stn_e5f6a7b8c9d0.pem (ECDSA P-256, 1-year validity)
        └── ... (one certificate per station)

Server Signing Key (ECDSA P-256, server-side HSM)
  └── OfflinePass signatures
  └── ServerSignedAuth (Partial A)
```

| CA Level | Algorithm | Validity | Storage | Purpose |
|----------|-----------|:--------:|---------|---------|
| Root CA | ECDSA P-384 | 20 years | Air-gapped HSM | Signs Station CA only |
| Station CA | ECDSA P-256 | 5 years | Online HSM | Signs station certificates |
| Station Cert | ECDSA P-256 | 1 year | Station secure element | mTLS authentication **only** — the receipt-signing key is a separate, uncertified key pair (§4.3) |
| Server Signing Key | ECDSA P-256 | Annual rotation | Server HSM / Vault | OfflinePass + ServerSignedAuth signing |

**Trust distribution:**
- Root CA public certificate is embedded in station firmware and server trust store.
- Station CA public certificate is distributed during provisioning.
- Station certificates are issued during provisioning ([Flow §2](04-flows.md#2-station-provisioning)).
- Server signing public key is distributed via provisioning and ChangeConfiguration [MSG-013].
- Broker server CA trust anchor is delivered via the provisioning response `brokerRootCa` field when the broker uses a private CA hierarchy. When that field is absent the broker uses a publicly-trusted CA hierarchy and the station's anchor is its system trust store. This is a **summary of §2.1**, which states the requirement normatively and is authoritative: the system trust store is a fallback for the **anchor** only, and it does **not** relax anything else — a station that cannot validate **MUST refuse** (§2.1), and chain validity alone is never sufficient, because the station **MUST** also verify the certificate's identity against the host it meant to reach (§2.1, *Server identity verification*).

### 4.3 Key Management Lifecycle

#### Station mTLS Client Key Pair (ECDSA P-256)

| Phase | Action |
|-------|--------|
| **Generation** | On-device during provisioning (private key NEVER leaves the station) |
| **Distribution** | Public key submitted **inside the provisioning CSR** (`tlsCsr`), whose self-signature proves possession; the server certifies it as the station's X.509 client certificate. It is never distributed as a bare public key. |
| **Storage** | Secure element, TPM, or encrypted NVS (non-extractable where the hardware supports it) |
| **Lifetime** | Bound to the certificate issued over it; how many may be valid simultaneously is bounded by §4.7.6 |
| **Renewal** | Station generates new CSR; server signs via Station CA. Background alert when cert < 30 days to expiry. |
| **Revocation** | CRL published by Station CA (checked by MQTT broker). OCSP RECOMMENDED. |
| **Rotation** | Annual (1-year certificate validity) |

#### HMAC Session Key (per-boot)

| Phase | Action |
|-------|--------|
| **Generation** | Server generates 32 random bytes at BootNotification `Accepted` |
| **Distribution** | Sent in BootNotification RESPONSE [MSG-001] `sessionKey` field (protected by TLS) |
| **Storage** | Station: volatile memory (RAM). Server: in-memory session store. |
| **Lifetime** | Exactly one MQTT session, from boot to disconnect. **No independent TTL** — neither peer expires it while the session is alive ([§5.9](#59-session-key-lifetime)) |
| **Rotation** | Only by re-boot: every reconnection produces a BootNotification and therefore a new key. There is no separate rotation mechanism and none is needed ([§5.9](#59-session-key-lifetime)) |

#### Server ECDSA P-256 Key (OfflinePass + ServerSignedAuth signing)

| Phase | Action |
|-------|--------|
| **Generation** | Server generates ECDSA P-256 key pair (RFC 6979 deterministic nonces for signing) |
| **Distribution** | Public key sent to stations via provisioning and ChangeConfiguration [MSG-013] |
| **Storage** | Private: server HSM / Vault. Public: station NVS (`OfflinePassPublicKey`). |
| **Rotation** | Annual. See §6.7 for the rotation protocol. |

#### Station Receipt-Signing Key Pair (ECDSA P-256)

| Phase | Action |
|-------|--------|
| **Generation** | On-device during provisioning (private key NEVER leaves the station) |
| **Distribution** | Public key submitted **directly** in the provisioning request as `receiptSigningPublicKey` — a bare public key, not carried in a CSR, and never certified as a TLS credential |
| **Storage** | Station secure element (non-extractable); ATECC608B fully supports ECDSA P-256. Server: held against the station record and used to verify offline receipt signatures (§6.2). |
| **Lifetime** | Independent of the station certificate. The server **MUST** retain **every** receipt-signing key it has bound to the station — not only the current one — for at least as long as receipts signed under each must remain verifiable. See *Historical retention* below. |
| **Rotation** | **No in-band rotation path exists.** The key is established at provisioning and is fixed for the life of the provisioned identity; changing it **REQUIRES** [re-provisioning](04-flows.md#re-provisioning-an-already-provisioned-station) with a **new** provisioning token. The certificate renewal arc of §4.7 covers the mTLS certificate **only** and cannot carry this key. See *Known gap* below. |

**Key separation — the two station ECDSA keys MUST be distinct.** A station's mTLS client key and its receipt-signing key **MUST** be different key pairs. A station **MUST NOT** submit the same public key as both the subject key of its `tlsCsr` and its `receiptSigningPublicKey`.

The reason is lifecycle independence. A signed receipt must remain verifiable after the station's TLS certificate has been rotated or revoked, and a compromise of the TLS key **MUST NOT** retroactively make every historical receipt forgeable. Sharing one key ties receipt verification — an audit and settlement concern with a multi-year horizon — to a credential that is deliberately rotated annually and revoked on demand. The cost of separation is one additional key slot on the secure element.

This is a **different and weaker** requirement than the BLE key separation of §6.5.2, which is unaffected by it: that rule forbids using a single P-256 key for both ECDSA signing and ECDH key agreement (NIST SP 800-56A), a stronger prohibition that continues to apply to all three station keys. The two rules differ in rationale but share a single enforcement point — the server rejects **any** pair of identical submitted keys with `4016`, below.

**Server behaviour on identical keys.** The keys a provisioning request submits **MUST** be **pairwise distinct**. A server that receives a request in which **any two** of them are the same key **MUST** reject it with `422 Unprocessable Entity` and error `4016 PROVISIONING_KEY_REUSE` ([Chapter 07 §3.4](07-errors.md)). All three pairs are covered: the CSR subject key with `receiptSigningPublicKey` (this section), the CSR subject key with `stationPubKey`, and `receiptSigningPublicKey` with `stationPubKey` (both §6.5.2). Servers **SHOULD** name the colliding pair in `details`. It **MUST NOT** issue a certificate and **MUST NOT** bind any key on that token. Since the token is consumed only on a **successful** provision ([Flows §2](04-flows.md#single-use-and-idempotent-retry)), a rejected request does **not** consume it: the station may correct its keys and retry on the same token.

Distinctness is a conformance requirement on the **station** — it is the only party able to satisfy it, since both key pairs are generated on-device — but it is **enforced at the server**, where the check costs nothing: **decode each submitted key and compare the decoded values** — the DER `SubjectPublicKeyInfo` of the CSR's subject key against the DER `SubjectPublicKeyInfo` of the `receiptSigningPublicKey`, which arrives PEM-encoded, and — when `stationPubKey` is present — the P-256 point it decodes to (compressed SEC1, Base64) against the point of each of the other two. Compare like with like: testing the CSR's DER against the PEM text as transmitted can never match, and would silently never fire. This is the same decoded-key basis the retry comparison uses ([Flows §2](04-flows.md#single-use-and-idempotent-retry)) — a re-encoding of the same point is the same key. Rejecting fails closed, so a station that has not implemented key separation cannot enter the fleet.

This specification defines **no grace period** and no migration path for stations already provisioned with a shared key. When a given deployment begins enforcing is a rollout decision, not a protocol rule.

**Historical retention — a superseded receipt-signing key MUST NOT be discarded.** Re-provisioning replaces the station's receipt-signing key. A server that overwrites the previous key **in place** destroys its own ability to verify anything signed under it — and offline receipts are long-lived fiscal artefacts that may be presented, audited, reconciled, or disputed long after the key that signed them was superseded.

Therefore, for each station the server **MUST** retain **every** receipt-signing key it has bound, together with the **validity window** during which that key was current — the instant it was bound and the instant it was superseded. Retention **MUST** last at least as long as receipts signed under that key must remain verifiable; a key **MUST NOT** be deleted merely because a newer one has replaced it.

**Key selection at verification.** The server **MUST** verify a receipt against the key that was bound to the station during the period in which that receipt could legitimately have been produced — not against the station's present key. Two rules govern how that key is chosen, and both are load-bearing:

1. **The candidate set MUST be derived from a server-authoritative anchor.** A station-supplied timestamp — including the `startedAt` and `endedAt` that arrive on an envelope whose signature has *not yet been checked* — **MUST NOT** determine which key verifies a signature. Permitting it would let a caller holding a superseded, compromised key nominate that key simply by choosing a time inside its window.
2. **The candidate set MUST be bounded by that anchor.** The server **MUST NOT** attempt every key it has ever retained for the station: try-all makes every superseded key permanently valid and defeats supersession entirely.

The anchor differs by receipt form. In both cases it is a **server-issued** artefact the station cannot alter:

| Receipt form | Server-authoritative anchor |
|---|---|
| **Pass form** (`offlinePassId`, `passCounter`) | The **OfflinePass**'s own validity window. The pass is issued and ECDSA-signed by the server (§6.1), so its `issuedAt`/`expiresAt` are authoritative and tamper-evident. Select the key(s) bound during that window — **not** the receipt's claimed `endedAt`. |
| **Auth form** (`authId`, `sessionId`) | The **server-issued authorization record** named by `authId`, and its issuance time. |

Where an anchor's window spans a supersession and therefore admits more than one bound key, the server **MAY** try each key the anchor admits — **and only those**.

**`keyId` — OPTIONAL disambiguation hint.** A receipt **MAY** carry `keyId` ([`receipt.schema.json`](../schemas/common/receipt.schema.json)). It sits beside `signature`, **outside** the signed `data`, so it changes no signed field and invalidates no existing signature.

Its construction is fixed, and stated here in full so that two independent implementations produce byte-identical output:

| Step | Definition |
|---|---|
| **Hash input** | The **DER encoding of the complete `SubjectPublicKeyInfo` structure** ([RFC 5280 §4.1.2.7](https://www.rfc-editor.org/rfc/rfc5280)) of the signing public key — the full `SEQUENCE` including the `AlgorithmIdentifier`, **not** the bare EC point, **not** any PEM wrapper or base64 layer, and **not** a JWK. |
| **Digest** | `SHA-256` over those DER bytes. |
| **Truncation** | The **first 16 bytes** (leftmost 128 bits) of the 32-byte digest. |
| **Encoding** | **base64url** ([RFC 4648 §5](https://www.rfc-editor.org/rfc/rfc4648#section-5), the URL/filename-safe alphabet using `-` and `_`), with **padding removed** — yielding exactly **22 characters**. |
| **Comparison** | Exact, case-sensitive string equality. Implementations **MUST NOT** re-encode or normalise before comparing. |

> **Not a JWK thumbprint.** This is deliberately **not** [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638), which hashes a canonical JWK JSON object (`{"crv","kty","x","y"}` for P-256) rather than the DER `SubjectPublicKeyInfo`. The two produce different digests for the same key. An implementer reaching for a JOSE library's thumbprint helper will get a value that never matches — hash the DER, not the JWK.

`keyId` is a **hint only**. It **MUST NOT** select the verification key and **MUST NOT** widen the candidate set. The server **MUST** select the key from the anchor above *first*; then, if `keyId` is present, it **MUST** check that it matches the selected key, and where the two **disagree it MUST reject the receipt** rather than follow `keyId`. A `keyId` naming a key outside the anchor's candidate set is itself grounds for rejection.

**Emission is OPTIONAL, and servers MUST NOT require it.** A station **MAY** emit `keyId` on any receipt and **SHOULD** emit it once it has been re-provisioned at least once — that is the only condition under which the server can hold more than one retained key for it, and therefore the only condition under which the hint carries information. A station that has never been re-provisioned gains nothing by emitting it and loses nothing by omitting it. A server **MUST NOT** reject a receipt for lacking `keyId`, **MUST NOT** treat its absence as a signal about the key, and **MUST** verify an omitting receipt exactly as it verifies one that carries a matching hint — by anchor-bound selection alone. The field is a convenience for the server's disambiguation, never a precondition for verification — which is precisely what makes it safe to carry unsigned.

Stated this way the field is safe despite being unsigned: tampering with `keyId` can only cause a rejection, never acceptance under an attacker-nominated key. A `keyId` that could steer selection would be *worse* than no field at all — it would hand an attacker the same key-nomination attack as a forged timestamp, without even needing to calibrate one.

> **Known gap — receipt-key rotation.** The station mTLS key has a renewal arc (§4.7) and the server signing key has a rotation protocol (§6.7). The station receipt-signing key has **neither**. No message defined in this revision carries a replacement receipt-signing key in either direction, so the key is fixed for the life of the provisioned identity unless the station is re-provisioned. This is a stated limitation, not an omission — implementers should plan around it rather than assume a rotation exists:
>
> - A suspected compromise of a receipt-signing key **cannot** be remediated in band. Remediation is an operator-minted provisioning token plus a full re-provisioning cycle, per affected station.
> - The mTLS key and the receipt-signing key rotate on **different schedules** — the former annually (§4.3), the latter not at all. An implementation **MUST NOT** assume the two are replaced together, or infer anything about one from a replacement of the other.
> - Because the key does not rotate, the **Lifetime** row above is the binding constraint on how long the server must retain it: for as long as receipts signed under it must remain verifiable.
>
> Closing this gap requires a wire-level decision — whether a replacement key can ride an existing message or needs a new action — and is deliberately deferred to a future revision rather than pre-empted here.

### 4.4 Certificate Requirements

Station certificates MUST comply with:

| Field | Requirement |
|-------|-------------|
| Version | X.509 v3 |
| Subject CN | `stn_{station_id}` (e.g., `stn_a1b2c3d4`). Current serial number available via read-only key `CertificateSerialNumber` (see §8 Configuration). |
| Key Algorithm | ECDSA P-256 |
| Signature Algorithm | ECDSA with SHA-256 (minimum) or SHA-384 |
| Validity | Maximum 1 year (RECOMMENDED) |
| Key Usage | digitalSignature |
| Extended Key Usage | clientAuth |
| Subject Alternative Name | OPTIONAL (DNS name or IP of station) |
| CRL Distribution Points | REQUIRED (URL to CRL published by Station CA) |
| Authority Info Access | RECOMMENDED (OCSP responder URL) |

If a TLS certificate expires during an active MQTT session, the TLS connection will terminate at the next renegotiation or keepalive. The station treats this as a standard connection loss and follows the reconnection procedure in [Chapter 02 — Transport](02-transport.md), §4.4.

### 4.7 Certificate Lifecycle Management

Certificate renewal enables stations to obtain new TLS certificates before their current certificates expire, without requiring physical access or manual provisioning. The protocol is inspired by OCPP 2.0.1 Security Profile 3 certificate management, adapted to the OSPP architecture.

Three MQTT messages support the certificate lifecycle:

| Message | Direction | Purpose |
|---------|-----------|---------|
| SignCertificate [MSG-022] | Station → Server | Station submits a PKCS#10 CSR for signing |
| CertificateInstall [MSG-023] | Server → Station | Server delivers the signed certificate and CA chain |
| TriggerCertificateRenewal [MSG-024] | Server → Station | Server instructs the station to initiate renewal |

#### 4.7.1 Automatic Renewal

The station **SHOULD** initiate certificate renewal automatically when the current certificate is within `CertificateRenewalThresholdDays` (default: 30 days, configurable 7–90) of expiry. See [Chapter 08 — Configuration](08-configuration.md), §4.

**Automatic renewal flow:**

1. Station generates a new ECDSA P-256 keypair on-device (the private key **MUST NOT** leave the station)
2. Station creates a PKCS#10 CSR with Subject CN = `stn_{station_id}`
3. Station sends the CSR via SignCertificate REQUEST [MSG-022]
4. Server validates the CSR (correct format, CN matches mTLS station ID, ECDSA P-256)
5. Server forwards the CSR to the Certificate Authority
6. CA signs the certificate and returns it to the server
7. Server delivers the signed certificate (and optionally the CA chain) via CertificateInstall REQUEST [MSG-023]
8. Station validates the certificate chain, CN match, key usage, and validity period
9. Station installs the certificate to its secure element, TPM, or encrypted NVS
10. Station updates the `CertificateSerialNumber` configuration key
11. On the next TLS reconnection, the station uses the new certificate

#### 4.7.2 Server-Triggered Renewal

The server **MAY** trigger a certificate renewal at any time using TriggerCertificateRenewal [MSG-024]. Use cases include:

- The server detects an approaching expiry that the station has not yet addressed
- The CA has been rotated and all station certificates need reissuing
- A certificate has been compromised and must be replaced immediately

Upon receiving a TriggerCertificateRenewal REQUEST, the station responds with `Accepted` and initiates the automatic renewal flow (steps 1–11 above).

#### 4.7.3 Emergency Renewal

| Days to Expiry | Priority | Behavior |
|:-:|:---:|---|
| > 30 | Normal | Station checks daily. No action unless server-triggered. |
| 7–30 | Elevated | Station initiates automatic renewal. Server logs a background alert. |
| < 7 | High | Station initiates renewal immediately. Server sends TriggerCertificateRenewal if station has not already started. Server alerts operator. |
| 0 (expired) | Emergency | Certificate has expired. Station enters offline-only mode (BLE). Recovery requires server-triggered renewal over an existing session or physical [re-provisioning](04-flows.md#re-provisioning-an-already-provisioned-station). |

#### 4.7.4 Failure Handling

- **CSR Rejected:** Station retries once after 60 seconds. If retry fails, log SecurityEvent with `type: CertificateError`.
- **Certificate Installation Failed:** Station continues using current certificate and reports CertificateInstall RESPONSE with `status: Rejected`.
- **CA Unreachable:** Server responds to SignCertificate with `status: Accepted` (acknowledging receipt), retries internally. Alerts operator after 24 hours.
- **Keypair Generation Failed:** Station rejects TriggerCertificateRenewal with error `4014 KEYPAIR_GENERATION_FAILED` and logs SecurityEvent with `type: HardwareFault`.

#### 4.7.5 Certificate Renewal Security Requirements

- The station **MUST** generate the new private key on-device. The private key **MUST NOT** be transmitted to the server or included in the CSR.
- The CSR **MUST** use ECDSA P-256. Other algorithms **MUST** be rejected by the server.
- The server **MUST** verify that the CSR's Subject CN matches the station ID from the mTLS session.
- All three certificate lifecycle messages **MUST** be HMAC-signed, like every other message (see §5.6).
- The station **SHOULD** keep the old certificate until the new certificate is successfully used for a TLS connection — and no longer; the retention window is bounded by §4.7.6.

For the complete certificate renewal profile, see [Certificate Renewal](profiles/security/certificate-renewal.md).

#### 4.7.6 Certificate Multiplicity

Rotation (§4.7.1–§4.7.3) and [re-provisioning](04-flows.md#re-provisioning-an-already-provisioned-station) both open a window in which a station holds more than one certificate. That window is **bounded**.

A station **MUST NOT** hold more than **one CURRENT and one PREVIOUS** certificate valid at the same time:

- **CURRENT** — the certificate the station presents on new TLS connections.
- **PREVIOUS** — the immediately preceding certificate, retained solely as the rollback target of §4.7.5. The station **SHOULD** retain it until the CURRENT certificate has been successfully used for a TLS connection, and **MUST** discard it once that has occurred.

A third certificate is never simultaneously valid. Beginning a new issuance while a PREVIOUS certificate is still retained **MUST** retire that PREVIOUS certificate first — the two slots do not accumulate, and retention is never indefinite.

The server side of the same bound: for any one station the server **MUST NOT** treat more than two certificates as simultaneously valid.

**Scope — this bound is stated per certificate type.** It governs the station's mTLS client certificate: `StationCertificate`, and independently `MQTTClientCertificate` in deployments that separate transport-layer from application-layer identity ([Certificate Renewal §2](profiles/security/certificate-renewal.md)). Each type carries its own CURRENT/PREVIOUS pair; holding one of each type is **not** a violation. The BLE StationIdentity certificate (§6.5.2) is a distinct credential with its own re-issuance window and is not counted against this bound.

### 4.5 Key Storage Requirements

- Private keys (TLS, ECDSA) MUST be stored in a **secure element**, TPM, or TEE if available.
- If no hardware security module is available, keys MUST be stored in **encrypted NVS** with access controls.
- Keys MUST NOT be:
  - Logged in any log file
  - Included in diagnostics uploads (GetDiagnostics [MSG-018])
  - Transmitted in plaintext over any channel
  - Accessible to unprivileged firmware components
- The HMAC session key MUST be stored in **volatile memory only** (RAM) — it MUST NOT be persisted to non-volatile storage.

### 4.6 Firmware Code-Signing

Firmware images **MUST** be cryptographically signed by the manufacturer or operator using ECDSA P-256. The station **MUST** verify the firmware signature against a trusted signing certificate before installation. SHA-256 checksum verification alone is **NOT** sufficient — it protects against corruption but not against malicious replacement.

**Firmware signing certificate chain:**

```
Operator / Manufacturer Root CA
  └── Firmware Signing Certificate (ECDSA P-256, annual rotation)
        └── Signs each firmware image
```

The station validates the firmware signature against a pre-provisioned Firmware Signing Certificate (or its CA) stored in the station's secure element or encrypted NVS.

The UpdateFirmware [MSG-016] message **MUST** include a `signature` field containing the Base64-encoded ECDSA P-256 signature of the firmware image. If the signature is invalid, the station **MUST** reject the update with error `5112 FIRMWARE_SIGNATURE_INVALID` and send a `FirmwareIntegrityFailure` SecurityEvent [MSG-012].

#### 4.6.1 Anti-Downgrade Protection

The station **SHOULD** reject firmware updates where the offered `firmwareVersion` is older than the currently installed version (downgrade). If a downgrade is rejected, the station **MUST** respond with error `5016 VERSION_ALREADY_INSTALLED` and log a SecurityEvent [MSG-012] with `type: FirmwareDowngradeAttempt`.

To support legitimate rollback scenarios (e.g., reverting a faulty update), the server **MAY** include a `forceDowngrade` flag in the UpdateFirmware request. When `forceDowngrade` is `true`, the station **SHOULD** accept the older version after signature verification. The station **MUST** log a `FirmwareDowngradeAttempt` SecurityEvent regardless of whether the downgrade is forced or not.

#### 4.6.2 Unrecoverable Firmware Failure

If firmware installation fails and rollback to the previous version also fails, the station **MUST** enter `Faulted` state, send a SecurityEvent [MSG-012] with `type: FirmwareIntegrityFailure` and `severity: Critical`, and await manual intervention via physical access. The station **MUST NOT** attempt to continue normal operation with potentially corrupted firmware.

### 4.8 OSPP Canonical Form

OSPP defines a single deterministic JSON serialization — the **OSPP Canonical Form** — used wherever a JSON value must be reduced to a stable byte sequence for cryptographic operations (HMAC-SHA256 of MQTT messages in §5, ECDSA-P256 of transaction receipts in §6.2, ECDSA-P256 of OfflinePass payloads in [`profiles/offline/offline-pass.md`](profiles/offline/offline-pass.md), and any future signature primitive). All OSPP cryptographic flows that compute a signature or MAC over a JSON value **MUST** use this form.

#### 4.8.1 Algorithm

Given a JSON value `V`:

1. **Recursively sort object keys** at every nesting level using lexicographic byte ordering of the UTF-8 encoded key strings. Array element order is preserved (arrays are not reordered).
2. **Serialize compactly**: emit the JSON without any insignificant whitespace (no spaces, tabs, or newlines between tokens). Field separators are `,` and `:` only.
3. **Use canonical scalar forms**:
    - Strings: emit as JSON strings with the minimal required escaping — exactly `"`, `\`, and the C0 range `U+0000`–`U+001F`, which are the only characters [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) §7 requires escaped. Where RFC 8259 defines a two-character form (`\b` `\t` `\n` `\f` `\r`) it is the minimal one and **MUST** be used; the remaining C0 characters take `\u00XX`. Every other character **MUST** be emitted literally — a JSON escape sequence (e.g. `\u0041` for `A`) **MUST NOT** be used for a character that does not require escaping.
        - **`U+007F` DELETE and the C1 range `U+0080`–`U+009F` are emitted literally**, although Unicode classes them as control characters (category `Cc`). "Minimal required" is required *by RFC 8259*, and RFC 8259 mandates escaping only below `U+0020`; escaping DEL would therefore be a JSON escape sequence used for a character that does not require one, which the sentence above forbids. This resolves the only overlap between the two halves of that sentence. It also keeps the rule implementable without a Unicode character-class table, which matters on the hardware this protocol targets.
        - `U+2028` LINE SEPARATOR and `U+2029` PARAGRAPH SEPARATOR are likewise literal: they are categories `Zl`/`Zp`, not control characters, and RFC 8259 does not require escaping them. (They must be escaped to embed JSON in a JavaScript source file, which is a property of that host language, not of JSON.)
    - Integers: emit without leading zeros, without a leading `+`, and without a trailing decimal point.
    - Booleans / null: emit as `true`, `false`, `null`.
    - OSPP messages do not currently use floating-point numbers in fields subject to canonicalization; if added in a future version, IEEE 754 number serialization rules will be defined here.
4. **Encode as UTF-8 bytes**. The resulting byte sequence is the canonical form.

#### 4.8.2 Worked Example

Input JSON value (key order non-canonical):

```json
{
  "protocolVersion": "0.3.0",
  "messageId": "cmd_550e8400",
  "action": "StartService",
  "payload": {
    "sessionId": "sess_a1b2c3d4",
    "bayId": "bay_c1d2e3f4a5b6",
    "durationSeconds": 300
  }
}
```

OSPP Canonical Form (sorted keys, compact, UTF-8):

```
{"action":"StartService","messageId":"cmd_550e8400","payload":{"bayId":"bay_c1d2e3f4a5b6","durationSeconds":300,"sessionId":"sess_a1b2c3d4"},"protocolVersion":"0.3.0"}
```

The canonical byte sequence is then fed into HMAC-SHA256 (§5), SHA-256-then-ECDSA-P256 (§6.2), or any other signature primitive that requires deterministic input.

#### 4.8.3 Relationship to RFC 8785 (JCS)

OSPP Canonical Form is **materially similar to RFC 8785 JCS but does not require Unicode NFKC normalization** of string content. For payloads where string content is restricted to ASCII (the dominant case for OSPP messages — UUIDs, ISO 8601 timestamps, `PascalCase` enum values, identifier strings), implementations that target RFC 8785 JCS produce output identical to OSPP Canonical Form.

OSPP does not pin RFC 8785 normatively because:

- Existing OSPP message vocabulary is ASCII-only; Unicode normalization adds implementation cost without observable behavior.
- IEEE 754 number serialization rules from JCS apply only to floating-point numbers, which OSPP does not use in canonicalized fields today.

A future OSPP version MAY adopt RFC 8785 strictly if message vocabulary is extended with non-ASCII strings or floating-point numbers.

---

## 5. Message Integrity — HMAC-SHA256

### 5.1 Overview

**Everything on the wire is signed.** Every MQTT message MUST carry an HMAC-SHA256 message authentication code in the `mac` envelope field, except the three that structurally cannot — see [§5.6](#56-message-signing-classification). This provides **defense-in-depth**: message integrity independent of TLS.

The `MessageSigningMode` configuration key selects between that and no signing at all. Two modes are defined:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `All` **(default)** | HMAC on every MQTT message except the three structural exemptions (§5.6) | Every deployment |
| `None` | No HMAC — TLS-only integrity | Development and test harnesses only |

`None` exists so that a test suite can exercise the message layer without a key-management fixture, and for no other reason. It **MUST NOT** be used in production, and a deployment running it has no defence against a publish-capable adversary (§5.6).

The middle mode, `Critical`, is **removed** rather than deprecated. With everything signed it selected nothing, and the protocol is unreleased, so there is no installed base a compatibility window would serve. Both values are **PascalCase** — `"All"`, `"None"` — as every enumeration in OSPP is ([Chapter 00 §Conventions](00-introduction.md)); lowercase spellings that appeared in three places were drift, not an alternative form, and a receiver **MUST NOT** accept them.

> **Why signing is not selective, and what replaced the criterion that made it so.**
>
> The threat HMAC answers is precise. The MQTT broker terminates TLS on both sides — Server↔Broker and Broker↔Station are separate TLS sessions — so TLS alone protects each hop and nothing end to end. HMAC does **not** defend against a fully compromised broker, because the session key is itself delivered through it ([§5.2](#52-session-key-establishment)) — the broker is **inside** the trust boundary and [§5.8](#58-the-broker-is-inside-the-trust-boundary) says so explicitly, with what that does and does not leave the MAC worth. What it defends against is an adversary that can **publish** to the broker without intercepting its traffic: a leaked management-API credential, an ACL regression, another publish-capable service on the same broker. That adversary can inject any message the ACL lets through, on any topic the ACL lets through.
>
> An earlier revision exempted messages judged to have **zero financial impact** — naming Heartbeat, StatusNotification and MeterValues. That criterion has been withdrawn, and not because it was applied carelessly. It was applied carefully and it was wrong twice:
>
> - **StatusNotification does not have zero financial impact.** Bay status and program availability are what [start-service.md §4](profiles/transaction/start-service.md) checks before a paid service may start. A forged `Faulted` denies revenue on a working bay. A forged `Available` induces a start that fails into `3009 HARDWARE_ACTIVATION_FAILED`, whose registry entry directs the server to refund 100%. Availability gates money; it is not adjacent to money.
> - **Heartbeat is worse.** Forged heartbeats keep a dead station looking alive, so [CORE-007](profiles/core/README.md)'s 3.5× timeout never fires, [CORE-008](profiles/core/README.md) never marks its bays `Unknown`, and the server keeps selling sessions on hardware that is not there. A message with no payload of its own turns out to gate every sale on the station.
>
> A third exemption was as bad in a direction the criterion could not see at all: **GetDiagnostics** was exempt as "non-financial", and it is — it is an *exfiltration* primitive. [get-diagnostics.md](profiles/device-management/get-diagnostics.md) has the station upload an archive containing its complete configuration dump and its session history to a URL **the command supplies**. Unsigned, under exactly the publish-capable adversary named above, that is one message to make a station post its customer records anywhere.
>
> **The new criterion is that there is no criterion.** A rule requiring per-message judgement produced three wrong answers out of forty-seven, each defensible when written, each discovered later and separately, and each discovered because someone happened to look. The failure mode is structural: the judgement is made once, at authoring time, against the uses a message has *then*, and it is never revisited when a new use makes an informational message load-bearing — which is precisely what happened to StatusNotification when program availability began gating starts. The only exemptions that survive are the ones that cannot be otherwise, and they are enumerated exhaustively rather than reasoned about.
>
> The cost is small and is stated rather than assumed. The MAC adds **53 bytes** per message — `,"mac":"…"` with 44 base64 characters — and nothing else: no `keyId`, no `alg`, no nonce, no signing-only timestamp. At one station's normal cadence that is roughly **16 KB per hour**. On constrained hardware the bytes are not the cost either: canonical re-serialization is, and it is heavier **inbound**, which is the direction verification runs. That work was already mandatory for most message types, so widening the rule adds no new firmware code path — it runs the existing one more often.

### 5.2 Session Key Establishment

1. Station sends BootNotification REQUEST [MSG-001] (exempt from signing — no key yet)
2. Server generates a cryptographically random 32-byte key
3. Server includes `sessionKey` (Base64-encoded) in the BootNotification RESPONSE [MSG-001]. This is **unconditional on every `Accepted` and every `Pending` response** — not conditional on `MessageSigningMode`, which is station configuration and therefore unreachable from this message's schema. `Pending` is included because a `Pending` station answers signed commands ([Chapter 05 §1.4](05-state-machines.md#14-the-restricted-states)); without a key that channel could not exist. Under `None` the key is issued and unused.
4. The session key is protected in transit by TLS 1.2+ encryption
5. Both sides store the key in volatile memory for the duration of the MQTT session, and discard it when that session ends

A station that receives `Accepted` or `Pending` **without** a `sessionKey` treats the response as malformed and re-boots rather than proceeding keyless — [`boot-notification.md` §5.3](profiles/core/boot-notification.md) is normative. Proceeding keyless is the worst of the available failures: the station cannot sign, every message it sends is rejected, and the MAC-failure events raised against it name it as the suspect.

### 5.3 Canonical Form

To compute the HMAC, the message MUST first be reduced to canonical form:

1. **Remove** the `mac` field from the message envelope if present (HMAC-specific — the MAC field cannot be part of the input that produces it).
2. Apply the **OSPP Canonical Form** algorithm defined in §4.8 to the resulting object.

The output is a UTF-8 byte sequence suitable for HMAC-SHA256 input.

**Example:**

Original message:
```json
{
  "protocolVersion": "0.3.0",
  "messageId": "cmd_550e8400",
  "action": "StartService",
  "timestamp": "2026-01-30T12:00:00.000Z",
  "source": "Server",
  "messageType": "Request",
  "payload": { "sessionId": "sess_a1b2c3d4", "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "programNumber": 1, "durationSeconds": 300, "sessionSource": "MobileApp" },
  "mac": "will-be-removed"
}
```

Canonical form (sorted keys, no `mac`, compact):
```
{"action":"StartService","messageId":"cmd_550e8400","messageType":"Request","payload":{"bayId":"bay_c1d2e3f4a5b6","durationSeconds":300,"programNumber":1,"serviceId":"svc_eco","sessionId":"sess_a1b2c3d4","sessionSource":"MobileApp"},"protocolVersion":"0.3.0","source":"Server","timestamp":"2026-01-30T12:00:00.000Z"}
```

### 5.4 MAC Computation

```
mac = Base64(HMAC-SHA256(Base64Decode(sessionKey), UTF8(canonical_json)))
```

The HMAC key is the **decoded 32-byte value**, NOT the 44-character Base64 text that carries it on the wire. `sessionKey` travels as Base64 ([§5.2](#52-session-key-establishment), [`boot-notification.md` §4](profiles/core/boot-notification.md)), and an implementation that passes those 44 characters to HMAC-SHA256 as the key produces a MAC that no conforming peer will verify. The same applies wherever `sessionKey` keys an HMAC, including the BLE `sessionKeyConfirmation` of [`ble-handshake.md` §5](profiles/offline/ble-handshake.md). This mirrors the rule already stated for the BLE nonces in [§6.5](#65-ble-session-key-derivation--hkdf-sha256) and for the receipt in [`reconciliation.md` §5](profiles/offline/reconciliation.md#5-receipt-signature-verification).

`conformance/test-vectors/crypto/mqtt-mac.json` pins this with the worked example of §5.3, and records the value the literal reading produces so the two cannot be confused.

The computed `mac` string is placed in the top-level `mac` field of the message envelope before transmission.

### 5.5 Verification

The receiver MUST verify the MAC before processing the payload:

1. Extract and remove the `mac` field from the received message
2. Compute the canonical form of the remaining message
3. Compute `expected_mac = HMAC-SHA256(Base64Decode(sessionKey), canonical_bytes)` — the key is the decoded 32 bytes, per §5.4
4. Compare `expected_mac` with the received `mac` using **timing-safe comparison** (constant-time)
5. If the comparison fails → reject the message

**Critical:** Implementations MUST use constant-time comparison to prevent timing attacks. Language-specific examples:
- Python: `hmac.compare_digest()`
- Node.js: `crypto.timingSafeEqual()`
- C: `CRYPTO_memcmp()` (OpenSSL)

### 5.6 Message Signing Classification

**Rule:** every MQTT message MUST carry a valid `mac`, in either direction, with exactly three exceptions. There are no other exemptions, no per-message judgement, and no "informational" category ([§5.1](#51-overview) records why).

Of the **47** message types in [Chapter 03](03-messages.md)'s catalogue, **44 are signed and 3 are exempt**.

#### The Three Structural Exemptions

These three cannot carry a verifiable MAC. Each is exempt because of what it *is*, not because of what it is judged to be worth.

| Message | Why no MAC is possible |
|---------|------------------------|
| BootNotification **REQUEST** [MSG-001] | It **precedes** the session key. There is no key to sign with. |
| BootNotification **RESPONSE** [MSG-001] | It **carries** the session key. A MAC computed with the key delivered inside the same message is cryptographically void — a forger who could substitute the message could substitute the key and produce a matching MAC. |
| ConnectionLost (LWT) [MSG-011] | It **replaces** the station. It is registered with the broker at CONNECT time and published by the broker after the station is gone. On a first connection there is no key yet; on a reconnect the station holds the *previous* key, and by the time the will is delivered the server has rotated to the new one — so a will-MAC is not merely absent, it is guaranteed stale on arrival. |

Integrity for all three is provided by mTLS, not by HMAC. Their exemption is unconditional: it holds in `All` mode, and it is not something a deployment can turn off.

> **The rule is machine-expressible and is nonetheless prose. This is a known cost.**
> The exemption keys on `action`, which *is* a field of the envelope, so an `if`/`then` on
> [`mqtt-envelope.schema.json`](../schemas/common/mqtt-envelope.schema.json) could require `mac`
> everywhere else. What blocks it is the `None` mode: under `None` no message carries a `mac`, so a
> schema that required one would make every `None`-mode message invalid and would take the test
> harness `None` exists for with it. `mac` therefore stays optional in the envelope schema, and the
> requirement is enforced by implementations rather than by validation. A reader should know that a
> message passing schema validation has **not** been checked for a MAC.

#### Mode `None`

No message carries a MAC. TLS provides the only integrity protection, and there is none end to end: a publish-capable adversary can inject any message the broker's ACL permits, in either direction, and neither peer can tell. This mode exists for development and test harnesses and **MUST NOT** be used in production.

### 5.7 Failure Handling — Both Directions Fail Closed

The signing path and the verification path **MUST** both fail closed. Neither peer may substitute an unsigned message for a signed one, and neither may accept an unverified message in place of a verified one.

Everything in this section applies **while `MessageSigningMode` is `All`** — that is, in every production deployment. Under `None` no message carries a MAC and none is expected, so none of these conditions can arise; that mode is development and test only ([§5.6](#56-message-signing-classification)).

#### Receiving

| Condition | Error Code | Action |
|-----------|------------|--------|
| `mac` field missing on a message that is not one of the three structural exemptions | `1013 MAC_MISSING` | Reject the message, log SecurityEvent [MSG-012]. Do **not** process it |
| `mac` verification fails | `1012 MAC_VERIFICATION_FAILED` | Reject the message, log SecurityEvent [MSG-012] |
| No session key held for the peer | `1013 MAC_MISSING` | Reject the message. A receiver that holds no key cannot verify, and cannot therefore accept |
| 3+ MAC failures from the same station in 60s | — | Flag the station as potentially compromised, alert the operator |

#### Sending

| Condition | Action |
|-----------|--------|
| No session key held for the peer | **Refuse to send.** The sender **MUST NOT** publish the message unsigned. It **MUST** log the refusal and surface it to the operator, and **MUST NOT** silently drop it without a record |
| Sender is a **server** with no key for the target station | Withhold the command. The station is not in a state where it can act on one: no key means the station is `Rejected`, or its session has ended — a `Pending` station holds a key precisely so this case does not close its repair channel ([`boot-notification.md` §5.3](profiles/core/boot-notification.md)). Treat the command as undeliverable and fail whatever operation depended on it, rather than emitting something the station must reject |
| Sender is a **station** with no key | It is not `Operational` — it is `Booting`, restricted, or disconnected ([Chapter 05 §1](05-state-machines.md#1-station-state-machine)) — and in none of those states is it permitted to originate a message anyway. Boot first |

> **Why the sending half is normative, and why it is the more important half.**
>
> The two paths are not symmetric by accident: it is easy to write a verifier that
> fails closed and a signer that shrugs. A signer with no key faces a choice between
> sending nothing and sending something unsigned, and "send it anyway" is the option
> that makes the immediate symptom go away.
>
> It is also the option that hands the attacker the whole mechanism. The threat the
> MAC exists to stop is an adversary who can publish a `StartService` the station will
> act on. A server that publishes unsigned when it has no key has produced exactly
> that message itself — and worse, has taught the fleet to accept it. A station that
> tolerated one unsigned `StartService` for compatibility would have no defence left,
> because "unsigned" is precisely what a forgery looks like.
>
> Note the asymmetry this rule removes. A receiver rejecting an unsigned message and a
> sender emitting one are the same condition — no usable key — read from two ends. If
> only the receiver fails closed, every such message is generated, published, delivered,
> rejected, and logged as a **security event naming the peer that could not have
> prevented it**. The fault is at the sender and the alarm rings at the receiver.
>
> The correct recovery is always the same and it already exists: get a key, which means
> boot. For a station that is [CORE-011](profiles/core/README.md)'s retry. For a server
> that means waiting for the station's next boot, or forcing one with
> TriggerMessage(`BootNotification`) — which is itself signed, so it is available only
> while a key is held, and a server with no key must simply wait.

---

### 5.8 The Broker Is Inside the Trust Boundary

State it plainly, because every claim about what the MAC is worth depends on it.

**The MQTT broker is inside the OSPP trust boundary.** It is not a hostile intermediary that HMAC defends against, and it cannot be, for a structural reason: the session key is delivered in the BootNotification RESPONSE ([§5.2](#52-session-key-establishment)), which passes through the broker in plaintext to it. A broker that reads that message holds the key, and a party holding the key can forge in **both** directions — station messages the server will verify, and server commands the station will verify. No arrangement of the current design changes this.

Placing it inside is the correct call rather than a concession. The broker is operator-run infrastructure on the same footing as the server, and it already terminates both TLS legs, already derives station identity from the mTLS client certificate's Subject CN, and already enforces the topic ACL. [RFC 6733 §13.3](https://www.rfc-editor.org/rfc/rfc6733#section-13.3) states the test for tolerating an intermediary of this kind — it must sit inside the same trust boundary, *"so that an ability to successfully compromise the intermediary would imply a high probability of being able to compromise the endpoints as well."* Ours does: the broker and the server are the same deployment, run by the same operator, reachable by the same credentials.

#### What the MAC still buys

1. **Defence against an ACL regression — partial, and the limit matters.** A misconfigured ACL that lets station A publish on station B's topic is caught, because A does not hold B's key. This is the realistic accident, and it is what the MAC is for. It does **not** hold if the same regression also grants *subscribe*: B's session key is delivered on B's own topic, unsigned, so an attacker who can subscribe there reads the key and then forges perfectly. MQTT ACLs are commonly authored per topic filter covering both directions, so a wildcard mistake typically grants both. The MAC covers the narrower half. **The primary control for this threat is the ACL itself, audited directly** — the MAC is a backstop, not a substitute.
2. **A cheap integrity check.** It detects corruption, truncation and replay-with-modification independently of TLS, at 53 bytes and one hash per message.

#### What the MAC does NOT buy

**It does not provide non-repudiation, and this specification does not claim that it does.** HMAC is symmetric. The server holds the same key it verifies with, so it can produce any MAC a station could produce. A symmetric MAC authenticates between the two parties who share the key and proves nothing to any third party — an auditor, an arbitrator, a court. Any future text describing a MAC as evidence of a station's action is wrong and should be removed on sight.

Where OSPP does have non-repudiation it comes from an **asymmetric** signature, not from this: the ECDSA P-256 transaction receipt of [§6.2](#62-transaction-receipt-signing--ecdsa-p-256), signed with a private key the station alone holds. That mechanism is currently wired only to the offline path; extending it to the online money path is not part of this revision and is recorded as open work.

### 5.9 Session Key Lifetime

**The session key lives exactly as long as the MQTT session.** There is no independent TTL and no rotation mechanism.

1. The key is issued in the BootNotification RESPONSE and both peers hold it in volatile memory only ([§4.3](#43-key-management-lifecycle)).
2. Both peers **MUST** discard it when the MQTT session ends — the station on disconnect, the server on the LWT or on any broker-reported disconnect.
3. A peer **MUST NOT** expire the key while the MQTT session is alive. A clock-based TTL on this key is forbidden. A key that outlives nothing and expires on a clock is a fuse that can only ever fire early: the station is online and healthy, its messages start being rejected, the server's commands start being refused, and the security events raised name the station.
4. Any reconnect produces a BootNotification ([CORE-001](profiles/core/README.md)), which issues a new key. That is the whole of the rotation story, and it is why no separate mechanism is needed: the event that would justify re-keying is the same event that already re-keys.

> **Divergence from TLS, SSH and IPsec, and why none of their drivers apply.**
>
> All three bound key lifetime, and it is worth saying why OSPP does not, so the absence reads as a decision rather than an omission.
>
> - **No confidentiality role.** The session key is used for a MAC and nothing else; confidentiality is TLS's job on both legs. So the AEAD usage bounds that force rekeying in TLS 1.3 — the limits on how much data a single key may protect before ciphertext distinguishability becomes a concern — have no analogue here.
> - **No counter to exhaust.** OSPP's MAC input carries no sequence number, so there is no counter space to run out of. What could exhaust is the birthday bound on distinct messages under one key, and at OSPP volumes — a few hundred messages per station per hour — that is on the order of **10⁶ years**. It is not a design constraint at any fleet size this protocol will see.
> - **The one driver that does apply is the compromise window**, and [§5.8](#58-the-broker-is-inside-the-trust-boundary) answers it. Rotation bounds how long a stolen key stays useful. But the key is RAM-only and never leaves an mTLS session, so the ways to steal it are to compromise the broker — which is inside the trust boundary, where rotation is no defence — or to compromise an endpoint, which rotation also does not survive, since the compromised endpoint receives the new key.
>
> What follows is a **trade, and it is stated rather than left implicit**: a station that never disconnects holds one key indefinitely, so a key compromised in RAM stays valid until that station reboots. Given where the key can be stolen from, that window is not the exposure it looks like — but a deployment that wants it bounded has a mechanism already: TriggerMessage(`BootNotification`) forces a re-boot and therefore a new key, on demand, with no new wire surface.

---

## 6. Offline Security

Offline mode introduces unique security challenges: the station cannot contact the server for real-time authorization, so cryptographic credentials must be validated locally. This section defines the complete offline security model.

### 6.1 OfflinePass Structure

The OfflinePass is a server-signed credential that authorizes offline service usage within strict constraints. It is issued to the mobile app while online and presented to the station via BLE [MSG-031].

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `passId` | string | Unique pass identifier (`opass_{uuid}`) |
| `sub` | string | User subject identifier (`sub_{uuid}`) |
| `deviceId` | string | Bound mobile device identifier |
| `issuedAt` | string | ISO 8601 UTC — when the pass was issued |
| `expiresAt` | string | ISO 8601 UTC — when the pass expires (max 24 hours from issuance — [`offline-pass.md` §6](profiles/offline/offline-pass.md#6-lifecycle), issuance rule 1) |
| `policyVersion` | integer | Policy version for backward compatibility |
| `revocationEpoch` | integer | Epoch at time of issuance (pass is invalid if station epoch is higher) |
| `offlineAllowance` | object | Spending limits — see below |
| `offlineAllowance.maxTotalCredits` | integer | Maximum total credits across all transactions |
| `offlineAllowance.maxUses` | integer | Maximum number of transactions |
| `offlineAllowance.maxCreditsPerTx` | integer | Maximum credits per single transaction |
| `offlineAllowance.allowedServiceTypes` | array | List of permitted service IDs |
| `constraints` | object | Operational constraints — see below |
| `constraints.minIntervalSec` | integer | Minimum seconds between transactions from this pass |
| `constraints.stationOfflineWindowHours` | integer | Max hours a station can be offline and still accept this pass |
| `constraints.stationMaxOfflineTx` | integer | Max offline transactions a station can accumulate |
| `signatureAlgorithm` | string | Signature algorithm identifier. MUST be `"ECDSA-P256-SHA256"` for v0.1. |
| `signature` | string | ECDSA P-256 signature over all fields above (Base64-encoded, RFC 6979 deterministic nonces) |

#### Example

```json
{
  "passId": "opass_a8b9c0d1e2f3",
  "sub": "sub_xyz789",
  "deviceId": "device_uuid_123",
  "issuedAt": "2026-02-05T10:00:00.000Z",
  "expiresAt": "2026-02-06T10:00:00.000Z",
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
  "signature": "MEUCIQDXKT0ewRBp/nkPY/qh6mBjwSn4BE7fmjDTdjcP1dhIyQIgPyXM1VnFZtrG6WaOgpRwiQIeFF2I2zeFsb05dyel1rE="
}
```

### 6.1.1 OfflinePass Validation — 10 Checks

The station MUST perform all 10 checks when validating an OfflinePass locally (Full Offline scenario). If any check fails, the station MUST reject the pass with the corresponding error code.

> **Implementation note:** Before performing the checks below, implementations SHOULD validate structural integrity first (required fields present, correct types, valid base64 encoding of the signature). Rejecting malformed passes before the expensive ECDSA verification (check #1) mitigates denial-of-service via crafted payloads. Structural validation failures SHOULD use error code `2002 OFFLINE_PASS_INVALID`.

| # | Check | Error Code | Description |
|:-:|-------|:----------:|-------------|
| 1 | **ECDSA P-256 signature** | `2002` | Verify signature against the current `OfflinePassPublicKey` (or the internally cached previous key during the grace period; see §6.7) |
| 2 | **Expiry** | `2003` | `expiresAt` MUST be in the future |
| 3 | **Revocation epoch** | `2004` | `revocationEpoch` >= station's `RevocationEpoch` configuration value |
| 4 | **Device binding** | `2002` | `deviceId` MUST match the `deviceId` from the Hello [MSG-029] message |
| 5 | **Station restriction** | `2006` | **Not locally evaluable — see below.** Station scoping lives in `allowed_station_ids` on the *server's stored pass record*, not in the pass; a station validating offline cannot read it |
| 6 | **Max uses** | `4002` | Number of transactions using this pass MUST be < `maxUses` |
| 7 | **Max total credits** | `4002` | Cumulative credits charged MUST be < `maxTotalCredits` |
| 8 | **Max per-tx credits** | `4004` | Requested service cost MUST be <= `maxCreditsPerTx` |
| 9 | **Min interval** | `4003` | Time since last transaction from this pass MUST be >= `minIntervalSec` |
| 10 | **Counter anti-replay (station-local horizon)** | `2005` | `counter` MUST be strictly greater than `lastSeenCounter` for this pass on this station. See the counter-model note below. |

**Implementation note:** Implementations SHOULD perform structural and temporal checks before cryptographic verification to mitigate denial-of-service. The error code returned SHOULD correspond to the first failed check in the canonical order (1–10).

**Check #5 is not evaluable on this path (KNOWN-ISSUES [B-2](../KNOWN-ISSUES.md#b-2--a-station-scoped-offlinepass-is-unrepresentable-in-the-authoritative-schema)).** Station scoping is held as `allowed_station_ids` on the server's stored pass record, which [`authorize-offline-pass.md` §5](profiles/offline/authorize-offline-pass.md#5-validation-checks-11-checks) check #5 calls out as "not a wire field". [`offline-pass.schema.json`](../schemas/common/offline-pass.schema.json) has no member that can carry it and is `additionalProperties: false` at both levels, so a station validating locally over BLE has nothing to check and no server to ask. The list above is therefore **ten checks, nine of which a station can perform**; the scoping constraint is enforced server-side at authorize-time and at reconcile ([`reconciliation.md` §6.1](profiles/offline/reconciliation.md#61-check-list) check #8).

**Nothing here reads `offlineAllowance.allowedServiceTypes`.** The pass carries the list, the schema requires it and `minItems: 1` keeps it non-empty, and it is covered by the signature — but no check in this list, in the authorize-time eleven, or in the reconcile-time thirteen compares a requested `serviceId` against it. Whether it should be checked is an open decision, not a property this section may be read as providing.

**Counter model — app-global value, station-local horizon (finding N7).** The `counter` carried in `OfflineAuthRequest` is a **single app-global monotonic value per pass**: the app — the sole holder of the pass — increments it on **every** use, regardless of which station the pass is presented to. The phrase "for this pass on this station" in check #10 describes the **offline station's verification horizon, not a per-station scoping of the value**. An offline station can only compare `counter` against what its own NVS has seen (it has no cross-station knowledge), so its anti-replay is necessarily local; because the value is app-global and strictly increasing, it trivially passes each station's local `>` check, and a station seeing this pass for the first time uses `lastSeenCounter = -1` so any value passes. The **cross-station** guarantee — that a cloned pass replayed across multiple stations is caught — is **not** provided by this local check; it is enforced **server-side at reconcile** via global `(offlinePassId, passCounter)` uniqueness ([`profiles/offline/reconciliation.md` §6.1](profiles/offline/reconciliation.md#61-check-list) checks #12/#13). The station **MUST** echo the `counter` it verified into the signed receipt as `passCounter` (§6.2 `receipt_fields`), so the server performs that global check on a value it can cryptographically trust.

**Client-conformance consequence (finding M4, named explicitly).** The app's global-increment is a normative MUST that nothing cryptographically enforces. A buggy or modified app that **resets the counter per station** would emit `(pass, 1)` at station A and `(pass, 1)` at station B — and the reconcile gate (check #13) would hard-reject the second as a replay (`2005`), even though that second use was legitimate. This is **intended**: a non-global counter is indistinguishable from a clone, so it is treated as one. The app **MUST** maintain a single global monotonic counter per pass; the consequence of not doing so is reconcile-time rejection of the app's *own* legitimate transactions, not a false acceptance.

### 6.2 Transaction Receipt Signing — ECDSA P-256

Every offline transaction produces a cryptographically signed receipt, ensuring non-repudiation, tamper detection, and reconcile-time identity binding (pass / user / device) during reconciliation.

#### Signing Process

```
1. receipt_fields — discriminated by session type (one of two forms):

   pass-form (Full Offline / Partial B) =
     {offlineTxId, offlinePassId, passCounter, userId, deviceId,
      bayId, serviceId, startedAt, endedAt,
      durationSeconds, creditsCharged, meterValues, txCounter}

   auth-form (Partial A — ServerSignedAuth, no pass) =
     {offlineTxId, authId, sessionId, userId, deviceId,
      bayId, serviceId, startedAt, endedAt,
      durationSeconds, creditsCharged, meterValues, txCounter}

   // A Partial-A session carries no OfflinePass: the auth-form replaces the
   // {offlinePassId, passCounter} pair with the server-issued {authId, sessionId}
   // join key (findings N2 / Q4), binding the buffered transaction back to its
   // ServerSignedAuth authorization and its issue-time debit. All other fields
   // are shared. The two forms are mutually exclusive (schema `oneOf`); the
   // reconcile gate branches on which pair is present (reconciliation.md §6.1
   // checks #2 / #4).
   // `meterValues` is OMITTED from the canonical body when not present (Note 4).
   // In each form, every field except `meterValues` is REQUIRED and signed.
   // `authId` / `sessionId` are signed (finding Q4) so the Partial-A join key is
   // non-spoofable at reconcile (the envelope copy alone is forgeable).
   // For the auth-form, `sessionId` MUST be the SERVER-issued session identifier
   // (the value the server minted at POST /sessions/offline-auth and signed into
   // the ServerSignedAuth claims), NOT a station-local id (finding F2). The station
   // adopts this server sessionId for the whole session — StartServiceResponse and
   // the signed receipt — so it is the settle-once correlation key
   // (reconciliation.md §6.7 / §8.2). (Full-Offline / pass-form sessions, which
   // have no server-issued sessionId, mint a station-local one — ble-session.md §1.)
   // `passCounter` (finding N7) is the pass's app-global monotonic usage counter,
   // signed so the server enforces global (offlinePassId, passCounter) uniqueness
   // at reconcile (reconciliation.md §6.1 checks #12/#13). Distinct from
   // `txCounter`, the per-station boot counter.
2. receipt_data = OSPP_Canonical_Form(receipt_fields)  // see §4.8
3. digest       = SHA-256(receipt_data)                // hash the canonical bytes directly
4. (r, s)       = ECDSA-P256-Sign(station_private_key, digest)  // RFC 6979 deterministic nonces
5. if s > n/2 then s := n - s                          // low-s normalisation (see Note 6)
6. signature    = DER_Encode(r, s)
7. receipt = {
     data:               base64(receipt_data),
     signature:          base64(signature),
     signatureAlgorithm: "ECDSA-P256-SHA256"
   }
```

> **Note 1 (v0.4.2):** The digest is computed over the **canonical bytes** (`receipt_data`), NOT over the base64-encoded form. Base64 is the wire encoding for the `receipt.data` field only; it is not part of the cryptographic input. Implementations MUST NOT hash `base64(receipt_data)`. Prior pseudocode (carried since v0.2.x) inadvertently hashed the base64 form; v0.4.2 aligns the spec with the implementation-level behavior shared by csms-server `EcdsaService` and the OSPP receipt-signing path. See CHANGELOG (M) fix.

> **Note 2:** The mandatory fields listed in `receipt_fields` for the applicable form — pass-form or auth-form (plus `meterValues` when present — see Note 4) — are the only fields canonicalized for signing. The receipt envelope's `data`, `signature`, and `signatureAlgorithm` fields are **not** part of the signed input — they are the output container produced by the signing process. Implementations MUST NOT include them in the canonicalized receipt body.

> **Note 3:** The `txCounter` field is included in the signed receipt data so that the counter a station emitted is bound to the transaction and cannot be restated afterwards. It gives an operator a reconstructable view of the station's offline log without a hash chain. It is **not** a completeness proof and is not used as one — see §6.3.1.

> **Note 4 (v0.4.2):** `meterValues` is signed **when present** in the transaction payload and **omitted from the canonical body when absent** — implementations MUST NOT emit an empty `meterValues: {}` object into the canonical form (doing so would change the canonical bytes and break signature verification on the server). The server-side verifier reconstructs the canonical body conditionally on `meterValues` presence, matching the station's omit-when-absent behavior.

> **Note 5 (v0.4.2):** `offlinePassId`, `userId`, and `deviceId` are signed to provide cryptographic binding of the receipt to the offline pass, the user, and the device — not merely envelope claims. The server's reconcile-time re-validation gate (`profiles/offline/reconciliation.md` §6) cross-checks these signed values against the TransactionEvent envelope (for `offlinePassId` and `userId`) and against the pass record's `device_id` field (for `deviceId`). This closes the cross-station-replay attack class where a station could wrap an authentic receipt with arbitrary pass / user / device claims in the envelope. v0.6.0 extends the same signed-and-cross-checked binding to `passCounter` (pass-form, finding N7 — gate check #12) and to the `authId` / `sessionId` join key (auth-form / Partial A, finding Q4 — gate check #2), so neither the app-global counter value nor the authorization a buffered transaction settles against can be forged in the envelope.

> **Firmware-timing note (v0.4.2 migration):** Firmware MUST sign per the v0.4.2 `receipt_fields` definition and the canonical-bytes digest rule from initial integration. Receipts signed under the v0.4.1 9-field shape OR with the v0.4.1 base64-hash rule will fail server-side signature verification (`2002 OFFLINE_PASS_INVALID`) or reconcile-time cross-checks (`2017 OFFLINE_RECEIPT_MISMATCH`). The v0.4.1 → v0.4.2 stack upgrade is a coordinated break — pre-launch context (no v0.4.1 firmware deployments) makes the wire-format + digest-rule expansion clean.

> **Note 6 (low-s normalisation, MUST):** After RFC 6979 produces `(r, s)`, software implementations **MUST** normalise `s` to the lower half of the curve order — if `s > n/2`, replace it with `n - s` (where `n` is the order of the P-256 base point). RFC 6979 alone leaves `s` in either half; the unmodified `s` and its complement are BOTH valid signatures over the same `(key, digest)` pair (ECDSA signature malleability). Two RFC 6979 implementations that differ on this single step produce the same `r` but a complemented `s` — each verifies on either side, but the DER bytes diverge, which breaks the byte-reproducibility property published conformance vectors and signed examples rely on. Low-s normalisation is the industry convention (BIP-66 in Bitcoin, `@noble/curves` p256 default, OpenSSL ≥ 1.1) and the OSPP cross-language test corpus (`sdk-ts` ↔ `sdk-php`) is locked to it. This requirement applies identically to all OSPP ECDSA P-256 signing flows: receipt signing (this section), OfflinePass signing (`profiles/offline/offline-pass.md` §3), ServerSignedAuth signing (`profiles/offline/ble-handshake.md` §4.2.1), and any future signature primitive defined under §4.8. Hardware secure elements that produce both halves of `s` MUST apply the normalisation in firmware before publishing the DER bytes; SEs that already produce the low-s form natively (a common configuration) satisfy this requirement intrinsically.

#### Verification (Server-Side)

During reconciliation ([Flow §10](04-flows.md#10-offline--online-reconciliation)), the server verifies each receipt:

```
1. **Select** the station's receipt-signing ECDSA P-256 public key **for this receipt** — from the server-authoritative anchor defined in §4.3, over the retained key set; **not** simply the station's current key, and **not** the mTLS key
2. canonical_bytes = base64_decode(receipt.data)   // decode wire encoding
3. digest          = SHA-256(canonical_bytes)      // hash the canonical bytes (NOT the receipt.data field directly)
4. Verify(receipt.signature, digest, stationPublicKey) using ECDSA-P256
   // Verification is malleability-agnostic: it MUST accept any valid DER
   // ECDSA P-256 signature regardless of which half of the order `s` lies
   // in. Low-s normalisation (Note 6) is a signing-time requirement only.
5. If verification fails → CRITICAL alert, flag transaction for investigation
                          (errorCode 2002 OFFLINE_PASS_INVALID at reconcile-time)
```

The cross-check semantics on the verified canonical body (`receipt_fields` decoded from `canonical_bytes`) are defined in `profiles/offline/reconciliation.md` §6 (Reconcile-Time Re-validation Gate) checks #1, #2, #3, #6.

### 6.3 Signed Counter — Forensic Evidence

Each offline transaction includes a monotonically increasing `txCounter` (per station) in the ECDSA-signed receipt data (§6.2). It is an **audit aid, not an access control**: it lets an operator reconstruct a station's offline log and see that something is missing, without the complexity of a hash chain.

**Properties:**
- **Reconstruction:** The `txCounter` lets an operator order a station's offline transactions as they occurred, after the fact.
- **Discontinuity is a signal to a human.** A gap (e.g., 5 → 7) is visible, and worth an operator alert on the station. It is **not** a control: the server settles the transaction regardless, and the counter gates nothing. See [reconciliation.md §4.2](profiles/offline/reconciliation.md#42-what-the-server-does-with-it), which is normative and which this chapter does not restate.
- **Non-repudiation:** The `txCounter` is included in the ECDSA-signed receipt data. A station cannot retroactively change the counter without invalidating the signature — but note this binds a station to a counter it *did* emit; it does not oblige a station to emit one for every transaction (§6.3.1).
- **Crash resilience:** The station only needs to persist a single integer (`txCounter`) atomically to NVS. No hash chain state to corrupt on power loss.

#### 6.3.1 What the counter does not defend against

The `txCounter` is generated by the station and signed with a key the station holds. Against a firmware-level adversary it therefore proves nothing about **completeness**: an adversary suppressing a transaction does not create a gap, it simply never assigns that transaction a counter, and the sequence it emits is contiguous. The observable causes of a real discontinuity are overwhelmingly benign — reboot, NVS corruption, board replacement — so a discontinuity is evidence of a **station fault**, not of fraud, and must not be treated as an accusation against the user.

Completeness and anti-replay are carried elsewhere, on values the station does not choose:

- **`(offlinePassId, passCounter)` uniqueness** — `reconciliation.md` §6.1 check #13, a deterministic hard reject (`2005`). `passCounter` is generated by the **app** and merely echoed by the station into the signed receipt.
- **Cross-station cumulative `maxUses` / `maxTotalCredits`** — §7.4, which catches the disjoint-counter-stream clone that check #13 cannot see.
- **The app-side receipt upload path**, which puts a station-signed receipt in the hands of an independent party before the station reconciles at all. A station cannot renumber bytes it has already signed and handed to a third party.

**Station requirements:**
- The station MUST maintain a monotonically increasing `txCounter` per station, starting at 1.
- The `txCounter` MUST be persisted to NVS before the transaction receipt is signed.
- The `txCounter` MUST be included in the `receipt_fields` before signing (see §6.2).

**Server handling during reconciliation:**
1. Receive TransactionEvent [MSG-007] with `txCounter` and `receipt`
2. Verify ECDSA signature on the receipt (§6.2) — this is the check that gates
3. Persist the `txCounter` on the transaction record as forensic evidence
4. If the counter is discontinuous with what is already recorded for this station, raise an **operator alert on the station** and settle the transaction normally. The server **MUST NOT** condition settlement, deduplication or response status on the `txCounter`. [reconciliation.md §4.2](profiles/offline/reconciliation.md#42-what-the-server-does-with-it) is the single source of truth; this chapter does not restate it.

### 6.4 BLE Transport Security

**The security of the BLE channel is provided end-to-end at the application layer** — the ECDH P-256 handshake (§6.5), the StationIdentity certificate (§6.5.2), and the AEAD channel (§6.5.3). **BLE pairing is OPTIONAL and MUST NOT be relied upon as a security premise.** This is a deliberate change from v0.5.x: the prior model leaned on LESC pairing (and the unobtainable LTK), which is unenforceable from a third-party mobile app, does not scale for public self-service (bond-table exhaustion across thousands of distinct phones), and triggers an OS pairing dialog mid-handshake that breaks the time budget. Confidentiality, integrity, and authentication now come from §6.5, not from the link layer.

| Property | Value |
|----------|-------|
| **Pairing** | **OPTIONAL.** If a deployment enables it, it **MUST** be LE Secure Connections (LESC); it provides defense-in-depth only and is never assumed by the protocol. |
| **Legacy Pairing** | **MUST NOT** be used (if any pairing is enabled). |
| **Link-layer encryption** | OPTIONAL (a side effect of LESC if enabled). The protocol does not require it; all sensitive traffic is already encrypted by the §6.5.3 AEAD channel. |
| **Bonding** | OPTIONAL; **MUST NOT** be required. Every session performs a fresh handshake regardless of bonding state (no bond-table dependency). |
| **MITM / impersonation protection** | Provided by the StationIdentity certificate + ECDH (§6.5.2), **not** by pairing. Numeric Comparison / Passkey Entry are neither required nor assumed (stations are NoInputNoOutput). |
| **GATT characteristic security** | Characteristics operate without link-layer encryption requirements; per-characteristic confidentiality is provided by the AEAD channel for post-Challenge traffic. |

**Pin 8 — canonical JSON (byte-exact).** Every BLE artifact that is signed or MAC'd over a JSON value — the StationIdentity certificate (§6.5.2) and the transaction receipt (§6.2) — uses the **OSPP Canonical Form** (§4.8): recursively sorted object keys, compact separators, UTF-8, integers without leading zeros. Station firmware **MUST** replicate this canonicalization byte-for-byte; the reference implementations are the `CanonicalJsonSerializer` in the PHP and TypeScript SDKs. (The handshake *transcript* of §6.5 Pin 4 is the one place that deliberately uses **raw wire bytes** rather than canonical JSON — see that pin.)

### 6.5 BLE Session Key Derivation — HKDF-SHA256

A per-handshake session key is derived from an **ephemeral-static + ephemeral-ephemeral ECDH P-256 exchange** combined with the nonces exchanged in Hello [MSG-029] / Challenge [MSG-030]. This construction replaces the BLE Long-Term Key (LTK) derivation used through v0.5.x. The LTK is **unobtainable by a third-party mobile application** on both iOS (Core Bluetooth exposes no key material) and Android (link keys live in the system Bluetooth stack), so the v0.5.x derivation was never executable by a real app — and reducing the LTK to a public/zero value collapses the session key onto values every endpoint knows, turning the OfflinePass into a bearer token. The design rationale is recorded in [ADR-002](../adr/ADR-002-ble-handshake-security-architecture.md). Security no longer depends on BLE pairing (§6.4); it is provided end-to-end at the application layer by this exchange, the StationIdentity certificate (§6.5.2), and the AEAD channel (§6.5.3).

**Two ECDH operations — full forward secrecy:**

| Secret | Computation | Property |
|--------|-------------|----------|
| `es` | `ECDH(appEphemeralPriv, stationStaticPub)` | **Authenticates the station** — only the holder of the certified static BLE key (§6.5.2) can compute it. |
| `ee` | `ECDH(appEphemeralPriv, stationEphemeralPub)` | **Forward secrecy** — both ephemeral keys are destroyed after the session, so a later static-key compromise cannot decrypt recorded sessions. |

`stationStaticPub` is the `stationPubKey` carried in the **verified** StationIdentity certificate (§6.5.2). The app's ephemeral key pair (`appEphemeralPriv`/`appEphemeralPubKey`) and the station's ephemeral key pair (`stationEphemeralPriv`/`stationEphemeralPubKey`) are freshly generated per handshake and carried in Hello and Challenge respectively (see [ble-handshake.md](profiles/offline/ble-handshake.md)).

**Pin 1 — ECDH shared-secret encoding (byte-exact).** Each ECDH secret (`es`, `ee`) is encoded as the **X-coordinate of the shared point, big-endian, exactly 32 bytes, zero-left-padded** (RFC 5903 §8.1). Implementations MUST take the X-coordinate only and left-pad it to 32 bytes. Library behaviour differs and MUST be normalised: `@noble/curves` `getSharedSecret` returns a **33-byte compressed point** (`0x02`/`0x03` prefix) — the prefix byte MUST be stripped and the remaining X left-padded to 32 bytes; PHP `openssl_pkey_derive` and mbedTLS return the X coordinate **without a prefix byte** and at **fixed 32-byte width** — `openssl_pkey_derive` does **NOT** strip leading zeros on the ECDH path (empirically confirmed: an 8000-iteration brute force produced no short output; OpenSSL writes the field element at the curve's full byte width). The ~1/256 leading-zero strip that motivates this pin is a property of the **ECDSA private scalar** read via `openssl_pkey_get_details` (`ec.d`) — a *different* code path, already handled by the `ospp/protocol` 0.5.7 left-pad in `EcdsaService` — **not** the ECDH derive path. Implementations **MUST nevertheless left-pad the ECDH X coordinate to exactly 32 bytes unconditionally, on every backend** — a no-op on OpenSSL/mbedTLS full-width output, kept as the correct cross-backend rule because another curve library or MCU stack may emit a minimal-length X — and **MUST NOT assume a particular backend either strips or is fixed-width**. (Same byte-exactness class as the EC-scalar fix in `ospp/protocol` 0.5.7; the reference `tools/ble-crypto.mjs` applies `leftPad32` unconditionally.)

**Pin 3 — Key schedule (byte-exact).**

```
IKM  = es ‖ ee ‖ appNonce ‖ stationNonce          // 4 × 32 bytes = 128 bytes, in exactly this order
salt = UTF8("OSPP_BLE_SESSION_V2")                 // the _V2 suffix domain-separates this ECDH
                                                    // construction from the retired LTK one (_V1)
info = LP(deviceId) ‖ LP(transcriptHash)           // stationId is NOT duplicated here — it is
                                                    // already bound by transcriptHash (Pin 4)
SessionKey = HKDF-SHA256(IKM, salt, info, L = 32)  // RFC 5869 (Extract-then-Expand), 32-byte output
```

- `appNonce` / `stationNonce` are the **decoded 32-byte nonce values**, NOT their Base64 text.
- `LP(x)` denotes a **length-prefixed field**: `U16BE(byteLength(x)) ‖ x`, where `U16BE` is an unsigned 16-bit big-endian length. Length-prefixing every `info` component removes the concatenation ambiguity that an attacker-chosen `deviceId` would otherwise introduce (this closes finding N23 — the v0.5.x `info = deviceId || stationId` had no delimiter).
- `deviceId` is taken from Hello [MSG-029] and is bound explicitly (it is the app-chosen client identity). `stationId` is **deliberately not a separate `info` component**: it is already bound by `transcriptHash` (Pin 4), which hashes the entire Challenge — including the StationIdentity certificate that carries the authenticated `stationId`. Duplicating it in `info` would add nothing.
- `transcriptHash` is defined in Pin 4.

**Pin 4 — Handshake transcript (byte-exact).**

```
transcriptHash = SHA-256( LP16(helloBytes) ‖ LP16(challengeBytes) )
```

where `LP16(x) = U16BE(byteLength(x)) ‖ x`, and `helloBytes` / `challengeBytes` are the Hello and Challenge messages, concatenated in that fixed order.

**`helloBytes` / `challengeBytes` MUST be the fully-reassembled wire octets of each message, exactly as transmitted and received** — the byte sequence obtained after fragment reassembly ([ble-transport.md §11](profiles/offline/ble-transport.md)) and before any AEAD framing, with **no further processing**. Concretely:

- Each party **MUST** hash, for the message it **sent**, the exact octets it placed on the wire, and for the message it **received**, the exact octets it received (post-reassembly). On the lossless, in-order GATT link these are byte-identical on both ends, which is why the two parties derive the same `transcriptHash`.
- An implementation **MUST NOT** parse the received JSON and re-serialize it, apply the OSPP Canonical Form (§4.8), pretty-print, re-order keys, or perform any other normalization before hashing. The transcript is over the **raw message bytes**, not a canonical or re-encoded form.
- This is the deliberate opposite of Pin 8 / §4.8 (canonical JSON), and for a different reason: the canonical form exists so that parties who never shared the exact bytes can reproduce a **signature** input (cert, receipt); the transcript exists to detect that the two handshake endpoints saw the **same bytes**, so it must hash those bytes verbatim. Mixing the two — canonicalizing the transcript — would break it.
- **Capture the trap (class N1):** two implementations that disagree on *how* to reduce a message to bytes fail at the **first** handshake (this is exactly the N1 failure mode — a spec ambiguity that two conformant implementations resolve differently). The firmware, the app, and the simulator all hash **what they received on the wire**, never what they would have re-generated.
- The hash is over the **complete reassembled message**, never over individual fragments.

Binding `transcriptHash` into `info` makes the SessionKey depend on **every field of both handshake messages** — both ephemeral public keys, both nonces, the certificate, `stationConnectivity`, `availableServices`, `appVersion` — so tampering with any plaintext handshake field produces divergent keys on the two ends and the handshake fails at the first AEAD frame or the `sessionProof` check.

**Directional AEAD sub-keys.** The 256-bit `SessionKey` is expanded into two independent directional keys for the AEAD channel (§6.5.3):

```
k_app_to_station = HKDF-Expand(SessionKey, UTF8("OSPP-BLE-v0.6.0-key-app-to-station"), 32)
k_station_to_app = HKDF-Expand(SessionKey, UTF8("OSPP-BLE-v0.6.0-key-station-to-app"), 32)
```

The two `info` labels are distinct fixed ASCII constants (no length-prefix needed — each is a single fixed string, not a concatenation of variable fields). `SessionKey` itself keys the `sessionProof` (§6.5.1) and the `sessionKeyConfirmation` (`HMAC-SHA256(SessionKey, UTF8("AuthResponse_OK"))`). These two HMAC data inputs and the two HKDF-Expand labels are mutually domain-separated by distinct leading bytes, so deriving the directional keys from `SessionKey` while also using it for the proofs leaks nothing between them (HMAC-SHA256 is a PRF).

**Derivation timing.** The app has all inputs once it receives Challenge; the station has all inputs once it has received Hello and generated/sent Challenge. Both parties therefore derive `SessionKey` immediately after Challenge, before any Authentication message. Station authentication is **implicit** — only the holder of the certified static key can compute `es` and hence `SessionKey` — and is confirmed **explicitly** by `sessionKeyConfirmation` in the AuthResponse and by the first AEAD frame the station emits (model: "Noise-N(X) + key confirmation").

| Parameter | Source |
|-----------|--------|
| `es`, `ee` | ECDH P-256 shared secrets (Pin 1) |
| `appNonce` | 32 random bytes from Hello [MSG-029] |
| `stationNonce` | 32 random bytes from Challenge [MSG-030] |
| `appEphemeralPubKey` | Hello [MSG-029] — compressed SEC1 (Pin 2, §6.5.2) |
| `stationEphemeralPubKey` | Challenge [MSG-030] — compressed SEC1 (Pin 2, §6.5.2) |
| `stationStaticPub` | `stationPubKey` from the verified StationIdentity (§6.5.2) |
| `deviceId` | Hello [MSG-029] (the only standalone `info` component besides the transcript) |

**Purpose:** The session key binds the authentication to this specific handshake **and** to the cryptographically authenticated station identity (a stronger binding than the v0.5.x LTK channel binding). The `sessionProof` in OfflineAuthRequest [MSG-031] is an HMAC computed with this key (§6.5.1), and all post-Challenge traffic is encrypted and authenticated under the directional keys (§6.5.3).

**Rationale — HMAC here vs ECDSA elsewhere.** OSPP uses ECDSA-P256 wherever the verifier holds only the signer's *public* key and the artifact must be transferable and non-repudiable across parties that never shared a secret — the OfflinePass, the transaction receipt, and the ServerSignedAuth blob. It uses HMAC-SHA256 wherever both parties already hold a *fresh shared secret* (the per-handshake session key) and the only property required is ephemeral proof-of-participation — the `sessionProof` and the `sessionKeyConfirmation`, neither of which has to outlive the BLE session or convince a third party. Using ECDSA for those would force a per-app key pair plus certificate distribution while buying nothing (the proof is deliberately non-transferable), and symmetric MAC verification is also markedly cheaper on the station MCU.

### 6.5.1 sessionProof Computation (Normative)

> **The canonical `sessionProof` construction is defined once, in [`ble-handshake.md` §4.1](profiles/offline/ble-handshake.md). That section governs; this is a pointer (finding N1).**

For convenience, the construction is:

```
sessionProof = Base64( HMAC-SHA256( SessionKey,
                 LP(UTF8("OfflineAuthRequest")) ‖ LP(UTF8(passId)) ‖ LP(UTF8(decimal(counter))) ) )
```

— a Base64-encoded 256-bit HMAC keyed by the `SessionKey` of §6.5, over three **length-prefixed** components, where `LP(x) = U16BE(byteLength(x)) ‖ x` is the same length-prefix used for the HKDF `info` and the transcript (§6.5 Pin 3 / Pin 4): the message-type literal `"OfflineAuthRequest"`, the `offlinePass.passId`, and the **counter rendered as its shortest base-10 ASCII string** (no leading zeros, no sign). Length-prefixing makes the input injective — no two distinct `(passId, counter)` tuples can collide. Output is exactly 44 Base64 characters.

**N1 reconciliation — the prior 4-input hex form is WITHDRAWN.** Through v0.5.x this section carried a different construction — `HMAC` over `offlinePassId | BE32(counter) | bayId | serviceId`, output as 64 lowercase hex characters — and `ble-handshake.md §4.1` was made to defer to it. v0.6.0 **inverts that**: §4.1 is canonical and this section points to it. The reasons:

- Under the AEAD channel (§6.5.3) the `bayId`/`serviceId` selection happens at `StartService`, *inside* the authenticated channel where in-flight tampering is impossible — so the proof no longer needs to bind bay/service at authentication time.
- The Base64/3-input *structure* (`type`, `passId`, `counter`, keyed by a raw session key — independent of the §6.5 key-derivation change) is what the conformance vectors and `tools/*.mjs` have always used; v0.6.0 refines it to the **length-prefixed** form above (Decision #1) for injectivity, updating the spec prose, the reference tooling, and the regenerated sessionProof vectors in lockstep.

**Relationship to the AEAD channel.** Because `OfflineAuthRequest` now travels inside the §6.5.3 AEAD channel, the frame's Poly1305 tag already proves the sender holds a key derived from `SessionKey`. The `sessionProof` is retained as an explicit, deliberately non-transferable proof-of-participation that additionally binds the specific `(passId, counter)` tuple under the session key (rationale: HMAC vs ECDSA, below).

### 6.5.2 StationIdentity Certificate

The **StationIdentity certificate** is a server-signed credential that binds a station's business identity and issuing organization to its **dedicated static BLE ECDH public key**. It is the trust anchor that lets a mobile app authenticate a station offline, before transmitting any OfflinePass. It is carried in the BLE Challenge [MSG-030] and is defined by [`station-identity.schema.json`](../schemas/ble/station-identity.schema.json).

**Certificate body (signed):**

| Field | Type | Description |
|-------|------|-------------|
| `stationId` | string | Business station ID (`stn_<hex>`). Becomes the authenticated `stationId` in the key-derivation `info` (§6.5 Pin 3). |
| `organizationId` | string | Issuing organization (`org_<uuid>`). |
| `stationPubKey` | string | The station's **static BLE ECDH P-256** public key, compressed SEC1, Base64 (Pin 2 below). This is `stationStaticPub` in `es = ECDH(appEphemeral, stationStaticPub)` (§6.5). |
| `issuedAt` | string | ISO 8601 UTC issuance time. |
| `expiresAt` | string | ISO 8601 UTC expiry — SHOULD be short (see residual risks). |

The wrapper adds `signatureAlgorithm` (`"ECDSA-P256-SHA256"`) and `signature`. The signature is computed over the **OSPP Canonical Form** (§4.8) of the body (all fields above, excluding `signature`/`signatureAlgorithm`), using **the same server signing key that signs OfflinePasses and ServerSignedAuth** (§4.2), with RFC 6979 deterministic nonces and low-s normalisation (§6.2 Note 6). No new server key is introduced.

**Pin 2 — public-key wire encoding (byte-exact).** Every P-256 public key transmitted on the BLE wire — `stationPubKey` in this certificate, `appEphemeralPubKey` in Hello, and `stationEphemeralPubKey` in Challenge — MUST be **compressed SEC1** (33 bytes: a `0x02`/`0x03` prefix byte followed by the 32-byte big-endian X coordinate), Base64-encoded to exactly 44 characters with no padding. NOTE: `@noble/curves` emits compressed points by default; the 65-byte uncompressed (`0x04`-prefixed) form MUST NOT be used on the BLE wire. The 65-byte uncompressed form remains reserved for the PEM-delivered server signing key (`serverVerifyKey`, unchanged), which is an ECDSA verify key, not an ECDH key.

**Public-key validation (Normative).** Before using any received P-256 public key in an ECDH operation — `appEphemeralPubKey` (Hello), `stationEphemeralPubKey` (Challenge), and the certificate's `stationPubKey` — the receiver **MUST** validate it: the compressed-SEC1 point **MUST** decompress to a valid point on the P-256 curve (a non-decompressable X is rejected), and the point **MUST NOT** be the identity / point at infinity. On failure the receiver **MUST** abort the handshake with `2013 BLE_AUTH_FAILED`. On P-256 (prime order, cofactor 1 — no small-order subgroups) with single-use ephemeral keys, invalid-curve and small-subgroup attacks are already inapplicable by construction, and a compliant library (`@noble/curves`, mbedTLS) rejects bad points on decode; this explicit MUST is **defense-in-depth**, stated so that no implementation silently skips the check. No conformance case currently exercises it. It adds a validation obligation only — the wire encoding (Pin 2) is unchanged.

**Dedicated BLE key pair (key separation).** `stationPubKey` is a key pair **distinct from both** of the station's ECDSA P-256 keys — the mTLS client key and the receipt-signing key (§4.3): one P-256 key MUST NOT be used for both ECDSA signing and ECDH key agreement (NIST SP 800-56A key-separation). The station generates this ECDH key pair **on-device** at provisioning (the private key never leaves the station, exactly as for the TLS key) and submits the public key in the provisioning request alongside its TLS CSR. A request submitting this key as one of the other two is rejected with `422` / `4016 PROVISIONING_KEY_REUSE` — the server checks all three pairs (§4.3).

> **Note (proof-of-possession).** The provisioning request submits the BLE ECDH *public* key, but v0.6.0 does not mandate an explicit proof that the station holds the corresponding *private* key (unlike the TLS CSR, which is self-signed). This is benign: a certificate issued over a public key whose private key the requester does not control is cryptographically useless — `es = ECDH(appEphemeral, stationPubKey)` cannot be reproduced by anyone lacking that private key, so no station gains anything by certifying a key it cannot use. An explicit proof-of-possession (e.g. signing the provisioning request with the BLE key, or an ECDH challenge at issuance) would be cleaner defense-in-depth and **MAY** be added in a future revision; it is not required for v0.6.0.

**Issuance, delivery, and rotation.**
- **Issuance.** At provisioning the server signs the StationIdentity over the station-submitted `stationPubKey` and returns it in the provisioning response `stationIdentity` field ([`provisioning-response.schema.json`](../schemas/provisioning-response.schema.json)). Server-side this reuses the existing OfflinePass signing path; no new cryptographic machinery is added.
- **Delivery to the station.** Provisioning response, and thereafter ChangeConfiguration [MSG-013] (key `StationIdentityCertificate`) for re-issuance — mirroring `OfflinePassPublicKey` distribution (§6.7).
- **Rotation.** `expiresAt` SHOULD be short; the server re-issues before expiry. During the re-issuance window a station MAY hold both its current and previous certificate. **Server-key** rotation (§6.7) interacts with verification: the app MUST accept a StationIdentity whose signature verifies under **any** server signing key currently in its trusted set (the overlap set the server publishes during rotation), exactly as a station accepts OfflinePasses under the current or previous server key.

**What the app holds (no per-station keys).** The mobile app holds only the **server signing public key(s)** — obtained when it last fetched OfflinePasses (it is online by definition then) — plus one freshly generated ephemeral key per handshake. It verifies *every* station with the server key, root-CA style; it stores **zero** per-station keys. The app SHOULD refresh the server-key set on every online contact.

**App verification gate (Normative).** Before transmitting any OfflinePass [MSG-031] or ServerSignedAuth [MSG-032], the app **MUST**:
1. verify the StationIdentity `signature` (ECDSA P-256) over the canonical body against a server signing key it trusts;
2. verify `expiresAt` is in the future (with a small clock-skew margin);
3. **if the app holds an intended `stationId` from an out-of-band channel** — e.g. a QR code on the physical station, an NFC tag, or a deep link the user opened — verify `cert.stationId == intended_stationId`;
4. on any of the checks above failing, **abort the handshake and send no credential**, surfacing error `2013 BLE_AUTH_FAILED`.

**Intended-station binding (Normative, with its limit).** Step 3 is what binds the cryptographic identity to the *physical* station the user chose, narrowing the relay/wrong-station gap (the certificate alone proves "a legitimate provisioned station of the organization", not "the station in front of the user"). Its limit MUST be understood honestly: the `stationId` read from **StationInfo (FFF1) is delivered before the handshake and is unauthenticated** — a fake or relaying station can advertise any `stationId` — so the app **MUST NOT** treat a `cert.stationId == StationInfo.stationId` comparison as a security binding; against an unauthenticated source it is purely advisory. Only an **out-of-band** intended `stationId` (QR/NFC/deep-link, established through a channel the attacker does not control) provides a real binding in step 3. When no out-of-band `stationId` is available, the certificate's `stationId` is informational only and the **Relay** residual below applies in full.

Only after the gate passes does the app use `stationPubKey` as `stationStaticPub` (§6.5); the certificate's `stationId` is bound into the session key via the transcript (§6.5 Pin 4), not as a separate `info` component.

**What this gate stops — and what it does not.** The gate stops a **fake / unprovisioned** station from harvesting a pass: such a station cannot produce a certificate that verifies under the server key, and even if it **replays a genuine station's certificate** it cannot compute `es = ECDH(appEph, stationStaticPub)` (it lacks that station's static private key), so when the app transmits the AEAD-encrypted OfflineAuthRequest the fake station receives only **opaque ciphertext** — it cannot decrypt the pass. (This is the single property no symmetric arrangement provides without an extra round-trip.) The gate does **NOT** stop a **provisioned-but-malicious or compromised** station: such a station presents its *own* valid certificate, computes `es` with its own static key, and **does** decrypt the pass presented to it. The certificate authenticates that the peer is *a provisioned station of the organization*, **not that it is honest**. A malicious provisioned station that harvests a pass can then replay it across stations — finding **N7 (cross-station double-spend)**, which the per-station anti-replay counter does not prevent. v0.6.0 (S2/D2) closes this **at settlement**: the station echoes the pass's app-global `counter` into the signed receipt as `passCounter`, and the reconcile gate enforces global `(offlinePassId, passCounter)` uniqueness ([`profiles/offline/reconciliation.md` §6.1](profiles/offline/reconciliation.md#61-check-list) check #13 — a same-value replay/clone hard-reject — plus the complementary cross-station cumulative `maxUses` / `maxTotalCredits` fraud factor (§7.4) for the disjoint-counter-stream clone). The gate's guarantee is therefore precise: *no pass leakage to fake/unprovisioned stations*; and cross-station replay of a harvested pass is **detected and hard-rejected at reconcile** (the harvesting station still cannot decrypt a pass it was never presented — see above).

**Residual risks (Normative acknowledgement).** The certificate authenticates *identity*; it does not make the channel unconditionally safe. Implementers MUST account for:
- **Offline revocation is best-effort.** An offline app cannot fetch a CRL/OCSP. A station whose static BLE key is compromised remains impersonatable until its certificate `expiresAt`. Mitigation = short `expiresAt` + rotation; this is a deliberate availability/security trade-off, not an oversight.
- **Server-key freshness on the phone.** A phone that has been offline since before a server-key rotation holds only the old key. Mitigation = the server publishes an **overlapping set** of valid signing keys and the app refreshes on every online contact (above).
- **Blast radius is one station.** Compromise of a single station's static BLE key permits impersonation of **that station only**, bounded by its `expiresAt` + rotation — not a fleet-wide break.
- **Relay is not prevented; impersonation is.** The certificate proves "a legitimate station of this organization", not "the station physically in front of the user". A pure relay that forwards a genuine station's Challenge is not stopped by the certificate; it establishes an end-to-end channel between the app and the *real* (possibly distant) station through a passive conduit — the relay cannot read or alter the traffic (any modification is fail-closed, §6.5 Pin 4). OSPP is **more resistant than the proximity-unlock class** (e.g. Tesla/Kwikset): there, possession-by-proximity *is* the authorization (passive); here, authorization requires the user's **explicit, deliberate action** — the OfflinePass plus the biometric/PIN confirmation taken before the OfflineAuthRequest. It is **not immune**, however: a relay can solicit a remote victim's authorization for a session at a station the victim never physically approached (range extension), which a single honest station cannot do. The residual risk is therefore **relay + social engineering** (the user induced to authorize a session they did not intend); the explicit-authorization requirement **reduces but does not eliminate** it. Where an out-of-band intended `stationId` is available (e.g. a scanned QR code), the intended-station binding (App verification gate, above) narrows this further.

### 6.5.3 BLE AEAD Channel

Every BLE message **after** the Challenge — `OfflineAuthRequest`, `ServerSignedAuth`, `AuthResponse`, `StartServiceRequest`/`StartServiceResponse`, `StopServiceRequest`/`StopServiceResponse`, the FFF5 ServiceStatus notifications, and the FFF6 Receipt value — **MUST** be encrypted and authenticated with the directional keys derived in §6.5. Hello and Challenge themselves are sent in plaintext (they establish the keys) and are instead integrity-bound by the transcript hash (§6.5 Pin 4). **No post-Challenge message may travel in plaintext.** This makes the "optionally encrypt subsequent payloads" gesture of earlier drafts a hard requirement and closes the unauthenticated-command findings (N4, N15, N17).

**Pin 6 — AEAD algorithm (byte-exact).** The AEAD is **ChaCha20-Poly1305, IETF construction, RFC 8439**, with a **96-bit (12-byte) nonce**. The **XChaCha20-Poly1305** variant (24-byte nonce) **MUST NOT** be used — it is a different construction and a known cross-implementation drift point. ChaCha20-Poly1305 is chosen over AES-GCM because it needs no AES hardware acceleration and is byte-identical across `@noble/ciphers`, libsodium (`crypto_aead_chacha20poly1305_ietf_*`), and mbedTLS (`MBEDTLS_CHACHAPOLY_C`).

**Directional keys.** `k_app_to_station` and `k_station_to_app` are the two keys from §6.5. Frames written by the app (FFF3) use `k_app_to_station`; frames sent by the station (FFF4/FFF5/FFF6) use `k_station_to_app`. The two directions therefore never share a (key, nonce) pair.

**Pin 5 — nonce construction (byte-exact).** Each direction maintains its **own** 64-bit frame counter, starting at **0** and incrementing by **1 per frame** emitted in that direction. The 96-bit AEAD nonce is:

```
nonce96 = 0x00 00 00 00 ‖ U64BE(counter)     // 4 zero bytes ‖ big-endian uint64
```

An endpoint **MUST** abort the session (no wraparound) before a direction's counter would exceed 2^64−1. This frame counter is **distinct from** the 32-bit little-endian block counter internal to ChaCha20 (which RFC 8439 fixes and which implementations manage internally); the value pinned here is the OSPP frame nonce, not the cipher's block counter.

**Pin 7 — AAD (byte-exact).** The Additional Authenticated Data for **every** frame is the 32-byte `transcriptHash` (§6.5 Pin 4): `AAD = transcriptHash`. This binds each frame to the exact handshake instance, so a frame can never be lifted into a different session even in the theoretical event of a key collision.

**Frame format.** A secure frame is the JSON object defined by [`ble-secure-frame.schema.json`](../schemas/ble/ble-secure-frame.schema.json):

```
plaintext = UTF8(<the inner message's exact JSON bytes>)
sealed    = ChaCha20-Poly1305-IETF-Encrypt(key = k_<direction>, nonce = nonce96,
                                            plaintext = plaintext, aad = transcriptHash)
            // `sealed` is ciphertext ‖ 16-byte Poly1305 tag (the standard
            //  libsodium / @noble output order)
frame     = { "n": <counter>, "ct": base64(sealed) }
```

`n` is the same per-direction counter used to build `nonce96`. On receipt an endpoint **MUST**: (1) check `n` equals the next expected counter for that direction (a mismatch is a drop/replay/desync → abort); (2) reconstruct `nonce96` from `n`; (3) decrypt-and-verify with the directional key and `AAD = transcriptHash`. Any authentication-tag failure or counter mismatch **MUST** abort the session with `2013 BLE_AUTH_FAILED`; the plaintext **MUST NOT** be processed.

**Encrypt-then-fragment.** The `{n, ct}` frame is the unit handed to the fragmentation layer ([ble-transport.md §11](profiles/offline/ble-transport.md)) — encryption happens first, fragmentation second, and the frame JSON is the "valid JSON" the reassembler validates. Reassembly never sees plaintext for post-Challenge messages.

**Findings closed.** Because Start/Stop and every other post-Challenge message now travel only inside this authenticated, per-connection channel: a co-located central without the session key can neither forge nor replay a `StopServiceRequest` against another central's session (**N4**); the FFF6 receipt (which carries `userId`/`deviceId`/amounts) is confidential to the handshake peer and a reconnecting app must complete a fresh handshake to read it, because the per-connection key is discarded on disconnect ([ble-transport.md §13](profiles/offline/ble-transport.md); receipt retention and re-handshake pickup in [ble-session.md](profiles/offline/ble-session.md)) (**N15**); and a forged post-Challenge `Rejected` cannot be injected without the key (**N17**). The residual unauthenticated surface is limited to pre-key rejections (malformed Hello, etc.), which is acceptable and disclosed.

### 6.6 Epoch-Based Revocation

OSPP uses a global **revocation epoch** for batch OfflinePass invalidation, avoiding the complexity of Certificate Revocation Lists:

| Property | Value |
|----------|-------|
| **Mechanism** | Global monotonically increasing integer |
| **Storage** | Station: `RevocationEpoch` configuration key. Server: database. |
| **Distribution** | Pushed to stations via ChangeConfiguration [MSG-013] or BootNotification RESPONSE [MSG-001] |
| **Validation** | OfflinePass `revocationEpoch` MUST be >= station's `RevocationEpoch` |

**Workflow:**
1. Security incident occurs (e.g., compromised user account, mass fraud)
2. Server increments the global `RevocationEpoch`
3. Server pushes new epoch to all online stations via ChangeConfiguration [MSG-013] (`key: "RevocationEpoch"`)
4. Offline stations receive the new epoch on next BootNotification [MSG-001]
5. All OfflinePasses issued before the new epoch are now invalid
6. Users must re-arm their OfflinePass (which will include the new epoch)

**Advantages over CRL:**
- Constant-time check on station (`pass.epoch >= station.epoch`)
- No list to distribute or search
- Single integer covers all users
- Works without network connectivity

### 6.7 Server Signing Key Rotation (ECDSA P-256)

The server's ECDSA P-256 key (used for signing OfflinePasses and ServerSignedAuth [MSG-032]) MUST be rotated periodically:

```mermaid
sequenceDiagram
    participant Server
    participant SSP as Station

    Server->>Server: Generate new ECDSA P-256 key pair (keyNew)
    Server->>SSP: ChangeConfiguration [MSG-013] {OfflinePassPublicKey = keyNew}
    SSP->>SSP: Cache previous key internally, store keyNew as active
    SSP-->>Server: Accepted

    Note over SSP: Grace period — station accepts signatures from BOTH<br/>the new key and the cached previous key (default 300 s)

    Note over Server: After every station has returned Accepted to the ChangeConfiguration
    Server->>Server: Revoke old key, stop signing with it
```

**Steps:**
1. Server generates a new ECDSA P-256 key pair (RFC 6979 deterministic nonces for signing)
2. Push the **new** public key as `OfflinePassPublicKey` via ChangeConfiguration [MSG-013]
3. Upon receiving the new key, the station MUST store it as the active key and SHOULD cache the previous key internally for a configurable grace period (default 300 seconds). No separate configuration key is required for the previous key.
4. **Grace period:** During the grace period the station accepts ECDSA P-256 signatures from both the new and the cached previous key. After the grace period expires the station MUST discard the cached key.
5. After ALL stations have been updated, revoke the old key. **There is no read-back:** `OfflinePassPublicKey` is a **WriteOnly** key and **MUST NOT** be returned in a GetConfiguration [MSG-014] response ([Chapter 08 — Configuration](08-configuration.md), §2), precisely so that credentials cannot be harvested from a config dump. The server therefore tracks rollout from the **ChangeConfiguration [MSG-013] RESPONSE it received from each station** — a station counts as updated when, and only when, it has returned `Accepted`. A station that is offline, or has not answered, **MUST** be treated as not yet updated, and the old key **MUST NOT** be revoked while any such station remains within the retention window for passes it may still hold.

---

## 7. Anti-Abuse Mechanisms

### 7.1 Rate Limiting

| Channel | Limit | Scope | Action on Exceed |
|---------|-------|-------|------------------|
| Mobile API (general) | 60 req/min | Per user (JWT `sub`) | 429 Too Many Requests |
| Mobile API (auth) | 5 attempts / 15 min | Per email | 429 + progressive delay |
| Web Payment sessions | 5 sessions / 30 min | Per IP | 429 |
| Web Payment sessions | 3 sessions / 30 min | Per device fingerprint | 429 |
| BLE connections | 3 attempts / 5 min | Per device | Station ignores further attempts |
| MQTT commands per station | No explicit limit | Per station | Server-controlled sending rate |

### 7.2 Deduplication

Both the station and server maintain a deduplication window to handle at-least-once delivery (QoS 1):

| Property | Value |
|----------|-------|
| **Window size** | Last 1000 `messageId` values OR 1 hour (whichever is larger) |
| **Duplicate REQUEST** | Receiver MUST re-send the same cached RESPONSE (do NOT re-process) |
| **Duplicate RESPONSE** | Receiver MUST discard |
| **Duplicate EVENT** | Receiver MUST discard |
| **Implementation** | Hash map or LRU cache keyed by `messageId` |

### 7.3 Web Payment Anti-Abuse (5 Layers)

The web payment flow is vulnerable to abuse because it is anonymous and publicly accessible. OSPP implements 5 layers of protection:

| Layer | Mechanism | Configuration | Action |
|:-----:|-----------|---------------|--------|
| 1 | **IP rate limiting** | 5 sessions / 30 min per IP | Block IP temporarily |
| 2 | **Device fingerprint** | 3 sessions / 30 min per fingerprint | Block fingerprint temporarily |
| 3 | **Progressive CAPTCHA** | Cloudflare Turnstile or equivalent | Show CAPTCHA on suspicious patterns |
| 4 | **Abandon scoring** | 5+ abandoned payment flows | 15-minute block |
| 5 | **Lock-at-payment only** | Bay NOT reserved at browse, only at `POST /pay/{code}/start` | Prevent browse-based bay locking |

**Key principle:** Bay reservation occurs **only** when the user initiates payment (Layer 5). Browsing station info and selecting services does NOT lock any bays. This prevents browse-based denial-of-service attacks.

### 7.4 Fraud Detection — Offline Transactions

During reconciliation ([Flow §10](04-flows.md#10-offline--online-reconciliation)), the server computes a **fraud score** (0.00 — 1.00) for each offline transaction:

| Factor | Score | Detection |
|--------|------:|-----------|
| Invalid timestamps | +0.50 | Timestamps out of order, in the future, or impossibly spaced |
| Duration exceeds allowance | +0.20 | `durationSeconds` exceeds `maxSessionDuration` or pass limits |
| High offline frequency | +0.20 | > 10 transactions from same user in 24 hours |
| Rapid consecutive (< `minIntervalSec`) | +0.15 | Two transactions for the same `offlinePassId` spaced less than `minIntervalSec` apart — the reconcile-time backstop for the per-pass rate limit (authorize-time hard check, `4003`) |
| Exceeds per-tx credit limit | +0.15 | `creditsCharged` > `maxCreditsPerTx` from OfflinePass |
| Station not in allowlist | +0.10 | Transaction from a station the user has not previously used |
| Pass was revoked at tx time | +0.30 | `revocationEpoch` was already incremented before `startedAt` |
| Cumulative uses exceed `maxUses` (cross-station) | +0.30 | Total reconciled transactions for this `offlinePassId` across **all** stations exceed `maxUses` |
| Cumulative credits exceed `maxTotalCredits` (cross-station) | +0.30 | Total reconciled credits for this `offlinePassId` across **all** stations exceed `maxTotalCredits` |
| User has negative wallet balance | +0.10 | Wallet balance below zero after deduction |

> **`txCounter` discontinuity is deliberately absent from this table.** It carried `+0.30` up to 0.8.1 and was removed in 0.9.0, not overlooked. Two reasons, either sufficient. First, **wiring**: `txCounter` is a **station** property, while every automated response below acts on the **user** — *disable offline mode for user*, *revoke pass, block user account*. A station reboot or an NVS fault would have been scored against the account of whoever happened to charge next. Second, **the signal does not carry**: the counter is generated and signed by the station itself, so an adversary with firmware control emits a contiguous sequence and never produces a gap (§6.3.1); the discontinuities that actually occur are hardware faults. A discontinuity is now an **operator alert on the station**, scored against nothing — see [`profiles/offline/reconciliation.md` §4.2](profiles/offline/reconciliation.md#42-what-the-server-does-with-it). The clone and replay coverage this factor was imagined to provide is delivered by check #13 and by the two cumulative factors below, neither of which reads `txCounter`.

> **Cross-station cumulative computation (finding N7).** The two cumulative factors are evaluated **server-side across the full fleet**, not per-station: at each reconcile the server sums the count of distinct reconciled `offlineTxId`s (and the sum of settled credits) for the transaction's `offlinePassId` **over all stations**, then compares to the pass's `maxUses` / `maxTotalCredits`. This is what catches the **disjoint-counter-stream clone** — two copies of a pass run on separate, non-overlapping counter ranges never collide on `(offlinePassId, passCounter)`, so the `reconciliation.md` §6.1 check #13 hard-gate misses them, but their transactions sum past `maxUses` in the aggregate. The hard gate (check #13) stops the same-value replay/clone; this soft cumulative signal flags the disjoint clone for manual review. Together they deliver the N7 "complementary defenses" (§6.5.2; `reconciliation.md` §6.1 check #13 + §7).

**Thresholds and automated responses:**

| Score Range | Classification | Automated Response |
|-------------|---------------|-------------------|
| 0.00 — 0.29 | **Normal** | Accept silently |
| 0.30 — 0.59 | **Review** | Flag for manual review, accept transaction |
| 0.60 — 0.79 | **Alert** | Disable offline mode for user, notify admin, accept transaction |
| 0.80 — 1.00 | **Block** | Revoke OfflinePass, block user account, notify security team |

### 7.5 Automated Security Responses

| Trigger | Response |
|---------|----------|
| 3+ MAC failures from same station in 60s | Flag station as potentially compromised |
| Certificate approaching expiry (< 30 days) | Background alert to operator |
| BootNotification from revoked certificate | Reject with `1004 CERTIFICATE_ERROR` |
| Repeated OFFLINE_COUNTER_REPLAY from same device | Revoke that device's OfflinePass |
| FirmwareIntegrityFailure SecurityEvent [MSG-012] | Alert operator, quarantine station |
| FirmwareDowngradeAttempt SecurityEvent [MSG-012] | Log event, alert operator if `forceDowngrade` was not set |
| TamperDetected SecurityEvent [MSG-012] | Alert operator, disable offline mode for station |

---

## 8. Data Protection

### 8.1 PII Handling

| Data Category | Classification | Storage | Encryption |
|---------------|---------------|---------|------------|
| Email address | PII | Server database | At rest (AES-256) |
| Phone number | PII | Server database | At rest (AES-256) |
| JWT tokens | Credential | Redis (access), DB (refresh) | TLS in transit |
| OfflinePass | Credential | App secure storage, station RAM | TLS/BLE encryption in transit |
| Payment card data | PCI | Never stored — handled by payment processor | N/A |
| Station telemetry | Operational | Server database | At rest |
| IP addresses (web payment) | PII | Hashed (SHA-256), 24h TTL | Hashed at collection |
| Device fingerprints (web) | PII | Hashed (SHA-256), 24h TTL | Hashed at collection |

**Principles:**
- **Data minimization:** Collect only what is necessary. Web payments require no PII by default.
- **No payment card storage:** Card data is never stored or processed by OSPP servers — all card handling is delegated to the PCI-compliant payment processor.
- **Hash before store:** IP addresses and device fingerprints used for anti-abuse are hashed before storage.

### 8.2 Data Retention

| Data | Retention Period | After Retention |
|------|:----------------:|-----------------|
| User account data | Duration of account + 30-day deletion grace | Anonymize (see §8.3) |
| Transaction records | 2 years | Archive or anonymize |
| Audit logs | 2 years | Delete |
| Session telemetry (MeterValues) | 90 days | Aggregate and delete raw data |
| Web payment anti-abuse data | 24 hours | Auto-delete (Redis TTL) |
| Diagnostics uploads | 30 days | Delete |
| Offline transaction receipts | 2 years (aligned with transaction records) | Archive |

### 8.3 GDPR Compliance

OSPP is designed for deployment in the European Union and MUST comply with the General Data Protection Regulation (GDPR):

| Requirement | Implementation |
|-------------|---------------|
| **Right to be informed** | Privacy policy at signup and at web payment entry |
| **Right of access** | `GET /me` returns all user data; data export available (JSON) |
| **Right to erasure** | Account deletion: 30-day grace period → anonymize user record, retain transactions for 2 years (legal obligation) |
| **Right to data portability** | JSON export of profile, wallet history, session history |
| **Data minimization** | Web payments are anonymous by default (no PII required) |
| **Purpose limitation** | Anti-abuse data (IP hash, fingerprint hash) used only for fraud prevention, 24h TTL |
| **Consent** | Explicit consent for optional data collection (e.g., marketing email) |
| **Data protection by design** | Hashing of PII at collection, encryption at rest, minimal data retention |

**Account deletion flow:**
1. User requests account deletion via `DELETE /me`
2. Server marks account for deletion (30-day grace period)
3. User can cancel deletion within 30 days
4. After 30 days: anonymize user record (replace PII with hashes), revoke all tokens, revoke OfflinePass
5. Transaction records are retained for 2 years (legal obligation) but with anonymized user reference

### 8.4 Web Payment Privacy

Web payments are designed to be **anonymous by default**:

- No account required
- No PII required (email is optional, for receipt only)
- No cookies or localStorage tokens
- Session token is URL-path only (no query parameters for sensitive data)
- IP addresses are hashed before storage (SHA-256, 24h TTL)
- Device fingerprints are hashed before storage (SHA-256, 24h TTL)
- No tracking cookies or third-party analytics on payment pages
- CORS restricted to payment domain only
- When redirecting users to external payment pages, the server **SHOULD** set the HTTP header `Referrer-Policy: no-referrer` to prevent session tokens or payment identifiers from leaking via the Referer header. Payment callback URLs **SHOULD** use POST method with tokens in the request body, not GET parameters.

### 8.5 Log Redaction

Implementations **MUST** redact sensitive data in security event logs, application logs, and diagnostic reports. Specifically:

| Data Type | Redaction Rule |
|-----------|---------------|
| Session tokens / session IDs | Show only first 8 characters (e.g., `sess_a1b2****`) |
| Payment credentials | **MUST NOT** be logged under any circumstances |
| MAC values (`mac` field) | Show only first 8 characters |
| Certificate private keys | **MUST NOT** be logged |
| OfflinePass content | Log only `passId`, not cryptographic material or allowance details |
| HMAC session keys | **MUST NOT** be logged |
| User email / phone | Mask after first 3 characters (e.g., `use****@example.com`) |

Diagnostic uploads via GetDiagnostics [MSG-018] **MUST** apply the same redaction rules before transmission.

### 8.6 Compliance Considerations

| Regulation | Relevance | OSPP Approach |
|------------|-----------|---------------|
| **GDPR** (EU) | User data, PII handling | Full compliance (see §8.3) |
| **PSD2** (EU Payment Services Directive) | Strong Customer Authentication | 3D Secure for card payments; credit purchases are pre-paid (no direct payment per service) |
| **EMD2** (EU E-Money Directive) | Credits as stored value | Credits are non-refundable, non-transferable, used within a closed-loop system. Under the limited network exemption (Article 3(k) of PSD2 / EMD2), OSPP credits **SHOULD** qualify as exempt when usage is restricted to a single operator's stations. Implementers **MUST** consult local legal counsel to confirm exemption applicability in their jurisdiction. |
| **PCI DSS** | Card data handling | OSPP servers never store, process, or transmit card data — fully delegated to PCI-compliant payment processor |
| **ePrivacy Directive** | Cookies, tracking | No cookies used in web payment flow; no tracking pixels |

---

## Appendix A — Security Checklist for Implementers

### Station Implementation

- [ ] TLS 1.2+ mandatory; TLS 1.3 RECOMMENDED and negotiated when supported; 0-RTT MUST NOT be enabled
- [ ] mTLS client certificate with CN = `stn_{station_id}`
- [ ] Private keys stored in secure element / TPM (never exported)
- [ ] HMAC-SHA256 verification on **every** incoming message except the LWT and BootNotification RESPONSE — and reject, never accept-unverified, when the MAC is absent or the key is not held (§5.7)
- [ ] HMAC-SHA256 signing on **every** outgoing message except BootNotification REQUEST, which is always exempt — and refuse to send, never send unsigned, when no key is held (§5.7)
- [ ] Timing-safe HMAC comparison
- [ ] OfflinePass 10-check validation for Full Offline mode
- [ ] ECDSA P-256 signature verification for ServerSignedAuth
- [ ] ECDSA P-256 receipt signing for all offline transactions
- [ ] All submitted provisioning keys are **pairwise distinct** key pairs — no public key is submitted as more than one of the `tlsCsr` subject key, `receiptSigningPublicKey`, and (BLE stations) `stationPubKey`; the server rejects any collision with `422` / `4016` (§4.3, §6.5.2); costs one additional secure-element slot per role
- [ ] txCounter maintenance (monotonically increasing, persisted to NVS)
- [ ] BLE handshake: ECDH P-256 (ephemeral) + StationIdentity certificate + ChaCha20-Poly1305 AEAD channel (§6.5); dedicated static BLE ECDH key (separate from **both** ECDSA keys — the mTLS client key and the receipt-signing key, §4.3); BLE pairing OPTIONAL (never assumed)
- [ ] Tamper detection (if hardware supports it)
- [ ] Diagnostics exclude private keys
- [ ] Firmware checksum verification before installation
- [ ] Firmware ECDSA P-256 signature verification before installation (§4.6)

### Server Implementation

- [ ] TLS 1.2+ for all external connections (TLS 1.3 RECOMMENDED)
- [ ] mTLS verification for station connections (CN extraction for ACL)
- [ ] JWT ES256 signing with key rotation
- [ ] Refresh token one-time-use enforcement
- [ ] ECDSA P-256 key generation and rotation for OfflinePass signing
- [ ] ECDSA P-256 receipt verification during reconciliation
- [ ] Reject provisioning requests in which **any two** submitted keys are the same key — CSR subject key / `receiptSigningPublicKey`, CSR subject key / `stationPubKey`, or `receiptSigningPublicKey` / `stationPubKey` — comparing **decoded** keys, not transmitted encodings; `422` / `4016 PROVISIONING_KEY_REUSE`, no certificate issued, token NOT consumed (§4.3, §6.5.2)
- [ ] Retain **every** receipt-signing key ever bound to a station, with each key's validity window; never overwrite a superseded key in place (§4.3)
- [ ] Select the verification key from a **server-authoritative anchor** (the OfflinePass's validity window, or the authorization record for the auth form) — never from a station-supplied timestamp, and never by trying every retained key (§4.3)
- [ ] txCounter persisted on the transaction record as forensic evidence — and **not** used to gate settlement, deduplication or response status (§6.3, §6.3.1)
- [ ] Operator alert on the **station** when the txCounter is discontinuous, with the transaction settled normally
- [ ] Fraud scoring for offline transactions
- [ ] Webhook HMAC-SHA512 verification (timing-safe)
- [ ] IP whitelist for webhook endpoints
- [ ] Rate limiting on all public endpoints
- [ ] CORS restricted to payment domain
- [ ] PII encryption at rest
- [ ] Data retention enforcement (auto-delete expired data)
- [ ] GDPR data export and deletion support

### BLE Implementation (Mobile App)

- [ ] StationIdentity certificate verification BEFORE sending any pass (§6.5.2); abort on failure
- [ ] ECDH P-256 (ephemeral) + HKDF-SHA256 session key derivation (§6.5); BLE pairing OPTIONAL
- [ ] sessionProof generation + ChaCha20-Poly1305 AEAD framing of all post-Challenge messages (§6.5.3)
- [ ] Biometric/PIN confirmation before OfflineAuthRequest
- [ ] OfflinePass secure storage (platform keychain / keystore)
- [ ] Receipt storage in local encrypted database
