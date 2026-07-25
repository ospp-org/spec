# Changelog

All notable changes to the OSPP specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](VERSIONING.md).

---

## [0.8.0] — 2026-07-13

> **Configuration vocabulary alignment.** Reconciles the `08-configuration.md` catalog with the keys the SDKs and server actually implement: removes 12 configuration keys that were documented but never wired to any behaviour, corrects the defaults/ranges of 4 surviving keys to their canonical values, and relaxes the web-payment / idempotency token format from "UUID v4" to any RFC 4122 UUID. Configuration-key total drops **41 → 29**. The wire `protocolVersion` field is **unchanged at `0.2.1`**, no message schema changes, and `spec/schemas/` is byte-identical (`verify-schemas.py` stays `306/306`).

> **Provisioning idempotency & station identity.** Splits the provisioning-retry rule so that descriptive body drift stays ignored while **public-key** drift — a different key, or a change in which key kinds are present — is rejected instead of silently replayed (new `4015 PROVISIONING_KEY_MISMATCH`, HTTP `409`); redefines a **Station** as a *logical* installation whose `stationId` outlives the hardware serving it; defines **re-provisioning** as a supported flow; **bounds** how many certificates may be valid at once; and defines **one canonical flat REST error envelope**. Driven by a production incident: a station re-provisioned six times over three days with a fresh keypair each time and received `200 OK` every time, carrying the certificate issued to an *earlier* key — a failure the requester had no way to detect. `verify-schemas.py` stays `306/306` and the wire `protocolVersion` stays `0.2.1`, but `spec/schemas/` is **no longer byte-identical** to the vendored SDK copies — one description string changed (see *Changed*), so `ospp-sdk-php` and `sdk-ts` require a re-vendor at the 0.8.0 lockstep tag. One REST response body changes shape (error bodies only — success bodies are untouched).

### Added

- **`4015 PROVISIONING_KEY_MISMATCH`** (`07-errors.md` §3.4, sub-block "4.01x — Certificate Management Errors"). Severity `Error`, `recoverable: false`, HTTP **`409 Conflict`**. Placed in the 4xxx range because §1.1 already assigns "certificate management" there and the code's closest sibling is `4010 CSR_INVALID` — deliberately **not** 400, whose documented station action ("regenerate keys, retry") would loop forever on this error. `07-errors.md` §4.4 also gains the `POST /api/v1/stations/provision` row it never had.
- **Optional `keyId` on the receipt envelope** (`schemas/common/receipt.schema.json`). A disambiguation hint for the receipt-signing key, placed **outside** the signed `data` so it changes no signed field and invalidates no existing signature. Construction is pinned exactly — DER `SubjectPublicKeyInfo` (RFC 5280 §4.1.2.7, the full SEQUENCE including the AlgorithmIdentifier) → SHA-256 → first 16 bytes → base64url (RFC 4648 §5) unpadded → exactly 22 characters, compared by exact string equality. An explicit note disclaims **RFC 7638**, which hashes canonical JWK JSON and yields a different digest for the same key. Critically, `keyId` **MUST NOT** select the key or widen the candidate set: the server selects from the server-authoritative anchor first and **rejects** on disagreement — a `keyId` that could steer selection would hand an attacker the same key-nomination attack as a forged timestamp. Added now because the schemas are closed (`additionalProperties: false`) with no minor-version negotiation, making a later addition a coordinated fleet upgrade; receipts are not yet implemented on the station side, so today it costs nothing.
- **Absent capability semantics** (`profiles/core/boot-notification.md` §5.1). A capability omitted from the BootNotification `capabilities` object is **NOT STATED**, not `false`: `true` records a declared positive, `false` a declared negative, and absence the absence of information. A server **MUST NOT** overwrite a previously declared value with an absent one, and **MAY** treat not-stated as unsupported for *withholding* commands (consistent with [Profiles §3](spec/profiles/README.md)) but **MUST NOT** persist it as a declared `false`. Stated over the whole object, so it governs `bleSupported`, `offlineModeSupported`, `meterValuesSupported` and anything added later. Rationale: a boot **reports**; it does not rewrite authoritative state — under the coerce-to-`false` reading a station that declared a capability once is silently downgraded by any later boot omitting it, and where that capability gates remote management the downgrade removes the channel that could repair it. Capability *negotiation* remains explicitly out of scope.
- **`4016 PROVISIONING_KEY_REUSE`** (`07-errors.md` §3.4). Severity `Error`, `recoverable: **true**`, HTTP **`422 Unprocessable Entity`**. Emitted when a provisioning request submits the same public key as both the `tlsCsr` subject key and `receiptSigningPublicKey`. Distinct in class from `4015`, which is a state *conflict* with an existing binding on a **retry** (`409`); this is a request that is unprocessable on its own terms at **first** provision (`422`). Uniquely among the three provisioning codes it is **recoverable**: the caller fixes it by generating a separate key pair, and because the token is consumed only on success, the rejection does not burn it.
- **`2019 PROVISIONING_TOKEN_INVALID`** (`07-errors.md` §3.2). Severity `Error`, `recoverable: false`, HTTP **`401 Unauthorized`**. Closes a gap this amendment itself opened: §2.4 now makes a machine-readable `errorCode` mandatory on every REST error, and the provisioning `401` — documented since 0.7.0 for an expired / superseded / revoked token — had **no registered code at all**. A sweep of every other REST error condition in the spec found no second instance (`429` → `6006`; expired/revoked access and refresh tokens → `2009`/`2010`). Placed in 2xxx rather than 4xxx on the registry's own precedent: §3.2 is credential validation, §2.4 maps `401` to 2xxx, and the token pairs `2009`/`2010` (JWT) and `2011`/`2012` (session token) are its siblings — whereas `4015` is certificate management. Registered as **one** code rather than an EXPIRED/INVALID pair, because all three causes are terminal for the token and share one recovery; the discriminator rides in `details.reason`. Precedence pinned: token validity is checked **before** the key comparison, so `409`/`4015` is reachable only on an otherwise-valid token. Standard-code total **106 → 110** (see *Fixed* — one of those four is a pre-existing miscount).
- **Re-provisioning defined** (`04-flows.md` §2, "Re-provisioning an already provisioned station"). Previously referenced from three places (`reset.md` §5, `06-security.md` §4.7.3, `certificate-renewal.md` §4.7.3 table) and defined in none. States when it applies and its preconditions: a **new** token (a consumed one **MUST NOT** be reused), an **unchanged** `stationId`, and deliberate operator initiation. The three dangling references now link to it.
- **Certificate multiplicity bound** (`06-security.md` §4.7.6). At most **one CURRENT plus one PREVIOUS** certificate valid simultaneously; PREVIOUS is discarded once CURRENT has been proven on a TLS connection; a new issuance retires any retained PREVIOUS first. Stated **per certificate type**, because `StationCertificate` / `MQTTClientCertificate` (`certificate-renewal.md` §2) and the BLE StationIdentity certificate (§6.5.2, which has its own overlap window) would each have contradicted a flat ceiling.
- **Hardware-replacement cross-reference** (`01-architecture.md` §7.6). The board-swap rule was normative only inside the offline profile (`reconciliation.md` §9) and invisible from the lifecycle chapter. Referenced, deliberately not restated.
- **Canonical flat REST error envelope** (`07-errors.md` §2.4). The Error Object **is** the top-level response body: no wrapper, no sibling members, extra context in the object's own `details`. The field set was already normative and already flat (§1.3 — "Every error … MUST include the following fields"); only the *envelope* was undefined, having appeared nested by example alone with no RFC 2119 keyword. MQTT (§2.1) and BLE (§2.3) nesting is unchanged — each nests because its body carries other members; a REST body carries only the error.

### Changed

- **12 unused configuration keys** deleted from `08-configuration.md` and every dangling reference across the spec chapters, conformance test cases, and implementor's guide: `SecurityProfile`; the eight BLE keys `BLEAdvertisingEnabled`, `BLEAdvertisingInterval`, `BLETxPower`, `MaxConcurrentBLEConnections`, `BLEConnectionTimeout`, `BLEMTUPreferred`, `BLEStatusInterval`, `BLEMaxRetries`; `Locale`; `StatusNotificationInterval`; and `EventThrottleSeconds`. None of these keys drove any specified behaviour — the prose that referenced them (BLE advertising/TX-power conditionals, StatusNotification throttling and periodic triggers, station locale, the active security profile) is reworded or dropped so the surviving text stands on its own; worked configuration examples that used a removed key now use a surviving key (`OfflineModeEnabled`, `MeterValuesInterval`). Config-key total: **41 → 29** (Core 12 → 9, Security 6, Offline/BLE 12 → 4, Transaction 6, Device Management 4).

### Changed

- **Four surviving config-key defaults/ranges corrected** to the canonical values shared by the spec, `sdk-ts`, and `ospp-sdk-php`: `HeartbeatIntervalSeconds` range floor raised to **30** (30–3600); `MeterValuesInterval` default **60**, range **10–3600**; `MaxSessionDurationSeconds` default **900**, range **60–3600**; `ReservationDefaultTTL` default **300** (range 60–1800).
- **Token format relaxed from "UUID v4" to any RFC 4122 UUID** in the web-payment session-token and idempotency-key prose (`02-transport.md`, `06-security.md`, `07-errors.md`, `04-flows.md`), matching the already-relaxed normative statements — any RFC 4122 version is accepted; any "122 bits of entropy" / RECOMMENDED nuance stated elsewhere is unchanged.
- **Per-service-kind settlement clause** added to `04-flows.md` §6: `UserDuration` settles pro-rata on elapsed time, `FixedDuration` bills the full authorized amount, `MultiUnit` settles per delivered unit, and `Fault` yields a full refund.
- Version cascade `0.7.0 → 0.8.0` across the remaining spec document headers, the root `README` badge, and `package.json`'s `@ospp/protocol` dependency (`^0.7.0` → `^0.8.0`). The wire `protocolVersion` field stays `0.2.1`.
- **Provisioning-retry idempotency split (BREAKING for server implementations)** — `04-flows.md` §2. Descriptive drift (`serialNumber`, `bayCount`) **MUST** still be ignored, unchanged. A retry presenting a **different public key** than the one bound to the already-issued certificate **MUST NOT** be replayed: it is rejected with `409` / `4015`, and no second certificate is minted. Same keys → replay, byte-identical certificate, unchanged. Applies to every key kind in the **bound set** — `tlsCsr`, `receiptSigningPublicKey`, and (BLE stations only) the static BLE ECDH key — because the token binds the station's *complete* provisioned identity; ignoring drift in any one of the three yields the same undetectable failure, respectively a dead mTLS connection, offline receipts that fail at reconciliation days later, and a BLE handshake whose ECDH never reproduces. The comparison is **per key kind, against the bound set**: a retry is a replay only if it presents the same set of key kinds, each carrying the same key. A key kind absent from **both** the bound set and the retry is never compared — a station declaring `capabilities.bleSupported: false` submits no BLE key at first provision and none on retry — but absence on one side only is drift. A **change** in the set between provision and retry is itself drift, in both directions — a key kind added asks to be certified for a broader identity than the token bound, one dropped presents a narrower one — and both are rejected with `409` / `4015`. Retention is scoped to the token's **TTL**, not to Transport §9.3's generic ≥ 24 h floor: production issues 7-day tokens, so the old wording left retries permitted but undecidable between hour 24 and expiry. The fixed "24-hour TTL" is genericised throughout — the TTL is set at issuance and is deployment policy, not a protocol constant. Flow §2's postconditions now also state what provisioning persists — including the retention obligation the rule implies: the server **MUST** retain every submitted public key bound to the consumed token, since that binding is what a retry is compared against. Comparison is on the **decoded** key — for the CSR, the DER `SubjectPublicKeyInfo`, **not** raw CSR bytes, since ECDSA signatures are randomised and two honest CSRs for the same key differ byte-wise. `02-transport.md` §9.3 reconciled: the token alone is no longer the whole idempotency key.
- **Station redefined as a logical installation** — `glossary.md`, `01-architecture.md` §1 + §2.1, `guides/implementors-guide.md`. A Station is a service installation identified by a **stable `stationId`**; the hardware serving it (`serialNumber`, `stationModel`, `stationVendor`) **MAY** change without changing the `stationId`. The former "physical installation" wording contradicted both the flows (the server allocates `stationId` at registration, before hardware exists) and the offline profile (`stationId` stable across a board swap). `reconciliation.md` §9's rubric "Use hardware serial number for identity" is reworded to "Treat a serial-number change as a hardware swap, not a new station" — its normative **MUST** is untouched.
- **Station mTLS key and receipt-signing key MUST be distinct (BREAKING for stations).** `06-security.md` §4.3 carried ONE inventory entry, "Station ECDSA P-256 Key (mTLS + Receipt signing)", whose Distribution row said the provisioning-submitted public key was "also used as TLS client cert" — while Flow §2 generates two key pairs and the request carries two independent fields. Flow §2 was correct; the inventory was stale (and duplicated the mTLS key, which it also described separately as "Station TLS Key Pair"). Split into **Station mTLS Client Key Pair** (submitted inside the CSR, which proves possession; certified as the X.509 client certificate) and **Station Receipt-Signing Key Pair** (submitted as a bare public key, never certified), each with its own generation / distribution / storage / lifetime / rotation rows. Rationale for distinctness: a signed receipt must remain verifiable after the TLS certificate is rotated or revoked, and a TLS key compromise **MUST NOT** retroactively make every historical receipt forgeable — sharing one key ties a multi-year audit concern to a credential rotated annually and revoked on demand. Distinctness is a conformance requirement on the **station** (both key pairs are generated on-device) but is **enforced at the server**, which **MUST reject** identical keys with `422` / `4016 PROVISIONING_KEY_REUSE` and issue no certificate. A `MAY` was considered and rejected: an unenforced key-separation rule is decorative, the check costs the server nothing, and rejecting fails closed so no non-conformant station enters the fleet. The token is **not** consumed by the rejection, so a corrected station retries on the same token. No grace period and no migration path are written into the protocol — when a deployment starts enforcing is a rollout decision. **Historical retention:** the server **MUST** retain *every* receipt-signing key it has bound to a station, with each key's validity window, and verify a receipt against the key current **when it was signed** — the reference implementation overwrites the key in place on every re-provision, so receipts signed under a superseded key are already unverifiable. Receipt-key **rotation** has no in-band path at all and is stated as a known limitation with its consequences, rather than left silent or invented. BLE key separation (§6.5.2) is unchanged and explicitly the different, stronger rule; its "mTLS/receipt key" singular is reworded to name both ECDSA keys, in prose and in `schemas/ble/station-identity.schema.json`. Swept: §4.2's PKI table said the station certificate covers "mTLS authentication + receipt signing" (it certifies the mTLS key only); §6.2, `reconciliation.md` §6 and the implementor's guide now name the **receipt-signing** key at the verification lookup; `conformance/test-keys/README.md` described the receipt key but claimed its CSR is signed by the Station CA.
- **Receipt-key selection bound to a server-authoritative anchor** (`06-security.md` §4.3). Tightens the historical-retention rule: the candidate key set **MUST** derive from a server-authoritative anchor and **MUST** be bounded by it. A station-supplied timestamp — including `startedAt`/`endedAt`, which arrive on an envelope whose signature has *not yet been verified* — **MUST NOT** determine which key verifies a signature, and the server **MUST NOT** try every retained key (try-all would make every superseded key permanently valid). Anchors: the **OfflinePass's own validity window** for the pass form, the server-issued authorization record for the auth form. The two procedures that implement this — `06-security.md` §6.2 step 1 and `reconciliation.md` §5 step 1 — were still describing a single-key lookup and now describe anchor-bound selection.
- **Provisioning request body corrected** — `04-flows.md` §2 sequence diagram and Happy Path steps 5–7 omitted the **static BLE ECDH public key**, which `06-security.md` §6.5.2 already states normatively is submitted "alongside its TLS CSR" and is what the server signs the StationIdentity certificate over. The two chapters disagreed about the request's contents; now they agree.

### Fixed

- **Error-code count off-by-one (pre-existing).** `07-errors.md` §1.1's range table gave 2xxx as **18**, but the registry holds `2000`–`2018` = **19**, so the stated "Total: 106" was already wrong before this amendment — the true pre-amendment total was **107**, independently corroborated by the `ospp/protocol` SDK enum docblock, which already said 107. Corrected alongside the 4xxx and 2xxx increments: range-table sum, stated total, registry, and Appendix A now all agree at **109**, with Appendix A set-identical to the registry.
- **`06-security.md` §6.7's rotation audit step was unexecutable.** Step 5 instructed the server to verify server-key rollout "via GetConfiguration [MSG-014]", but `OfflinePassPublicKey` is **WriteOnly** and `08-configuration.md` §2 forbids returning WriteOnly keys in a GetConfiguration response — deliberately, so credentials cannot be harvested from a config dump. Replaced with the ChangeConfiguration [MSG-013] RESPONSE the server actually receives per station, plus the safety consequence: a station that is offline or unanswered counts as not updated, and the old key **MUST NOT** be revoked while such a station may still hold passes signed under it. Pre-existing, unrelated to provisioning; found while scoping receipt-key rotation against this precedent.
- **The message catalogue was missing a message, so every count derived from it was wrong.** `03-messages.md`'s MQTT index claimed "26 actions" and omitted **SessionEnded**, which §5.4 defines in full as `Transport: MQTT`, EVENT, with its own schema. The omission also shifted two anchors — ConnectionLost pointed at `#54` (SessionEnded) and SecurityEvent at `#55` (ConnectionLost). True counts, corroborated three ways (40 message sections, MSG-001…MSG-040 in use, and the README badge which was already right): **40 messages = 27 MQTT + 13 BLE**. The README was wrong in the opposite direction — it had SessionEnded but omitted SignCertificate, CertificateInstall, TriggerCertificateRenewal, DataTransfer and TriggerMessage, headed a 22-row table "21 MQTT", and claimed MSG-022–039 were "security and BLE" when 022–026 are MQTT. Corrected across `03-messages.md`, `README.md` (7 claims), `guides/implementors-guide.md`, and `schemas/README.md`; schema directory counts also corrected to 21/47/15, total **84**.
- **`06-security.md` Appendix A omitted every obligation added this cycle.** The implementers' checklist still carried the singular "separate from the mTLS/receipt key" corrected elsewhere, and listed none of the new rules — station-side key distinctness (the one that costs a secure-element slot), and server-side reject-on-reuse, retain-every-key, and anchor-bound selection. A checklist that omits the new rules reads as confirmation that a pre-amendment implementation is complete.
- **Stale factual counts and one bad citation.** `README.md` claimed "67 JSON Schemas" (actual: **84**) and "95 error codes" (actual: **109**). `conformance/README.md`'s Test Case Index listed **11 of 27** cases; completed and verified set-identical to the files on disk. The [0.7.0] entry cited `07-errors.md` §3.1 as a home for the provisioning-token rule — §3.1 is Transport Errors, and 0.7.0 added no error code at all; the false citation is struck rather than repointed, since `2019` did not exist then.
- **Non-conformant REST error examples.** `examples/error-scenarios/01-bay-busy-race-condition.md` and `04-ack-timeout-station-unresponsive.md` both omitted the **REQUIRED** `timestamp` field (§1.3) and both carried a top-level `success: false` that no part of the spec defines. Their `refund` / `circuitBreaker` siblings move into `details`, the Error Object's designated extension point. `04-flows.md`'s mermaid shorthand used `error` for a bare string where §2.4 defines an object.

### Verification

- `tools/verify-schemas.py`: `306/306 PASS, 0 FAIL, 0 SKIP` — unchanged. Configuration keys are freeform string key-value pairs with no JSON-schema surface, so no schema or conformance-vector regeneration was required. The two new error codes touch no schema: `errorCode` is a plain bounded integer in every schema that carries it (no enum to extend), and the Error Object schema exists only inline in `07-errors.md` Appendix C — there is no `schemas/**/error.schema.json` to regenerate. **One** schema file did change: `schemas/ble/station-identity.schema.json`, a `description` string only (no property, type, required list, or constraint), so validation is unaffected — but it does break byte-identity with the vendored SDK copies and obliges a re-vendor at the lockstep tag.

## [0.7.0] — 2026-07-10

> **TLS 1.2 floor + provisioning-token idempotency.** Lowers the MQTT/mTLS transport floor from TLS-1.3-only to **TLS 1.2 minimum (TLS 1.3 recommended, negotiated when both peers support it)** so cellular modems capped at TLS 1.2 (e.g. SIMCom A7608E-H) can connect. Sub-1.2 remains rejected, 0-RTT remains forbidden, and mTLS is unchanged — reinforced as mandatory on every connection regardless of negotiated TLS version. Also formalises provisioning-token §2 (single-use + TTL-bounded idempotent retry). `spec/schemas/provisioning-response.schema.json` changes (`tlsVersion` enum widened + re-described as a floor), so the SDK schemas re-vendor at the **v0.7.0** lockstep tag.

### Changed (BREAKING)

- **`tlsVersion` (provisioning-response schema) widened `["1.3"]` → `["1.2", "1.3"]`, default `"1.3"` → `"1.2"`, and its semantics changed from "the TLS version" to a **minimum floor** ("the station must support this version; the broker accepts this version or higher").** `06-security.md` §2.1 cipher table now offers exactly four suites — TLS 1.3: `TLS_AES_256_GCM_SHA384`, `TLS_AES_128_GCM_SHA256`; TLS 1.2: `ECDHE-ECDSA-AES256-GCM-SHA384`, `ECDHE-ECDSA-AES128-GCM-SHA256` (ECDHE-ECDSA / AEAD-GCM only, matching the ECDSA P-256 server certificate; `TLS_CHACHA20_POLY1305_SHA256` dropped from the offered set). Sub-1.2 (TLS 1.0/1.1, SSLv3), CBC-mode, RSA-key-exchange and 3DES suites MUST NOT be offered or accepted; TLS 0-RTT remains MUST-NOT.

### Added

- **Provisioning-token §2 — single-use + idempotent retry (`04-flows.md`).** A provisioning token authorises exactly one certificate and is consumed on first success; a retry within the token's 24-hour TTL is idempotent (returns the byte-identical certificate and MUST NOT mint a second identity); once the TTL elapses, or if the token is superseded or administratively revoked, it is invalid for all purposes and MUST be rejected with `401 Unauthorized` (`04-flows.md` §2 "Single-use and idempotent retry" + its Error Paths table).

### Changed

- Version cascade `0.6.2 → 0.7.0` across all spec document headers. Doc-consistency cascade: the implementor's guide, conformance suite, root `README`, and architecture diagrams updated from the former TLS-1.3-only wording to the TLS 1.2 floor. The TLS `spec/schemas/` change is limited to `provisioning-response.schema.json`; the conformance-vector corpus is **unchanged** (BLE crypto / HKDF domain-separation labels and the `specRef: v0.6.0` crypto vectors are deliberately left as-is — bumping them would break the key schedule / corpus). `verify-schemas.py` stays `306/306`.

### SDK (lockstep, ADR-001)

- `ospp-sdk-php` + `sdk-ts`: `schemas/provisioning-response.schema.json` re-vendored at the **v0.7.0** lockstep tag (`tlsVersion` enum `["1.2","1.3"]`, default `"1.2"`, floor semantics). Byte-identical to the canonical `spec/schemas/provisioning-response.schema.json`.

## [0.6.2] — 2026-06-22

> **SDK enum catch-up (lockstep, ADR-001).** No spec content change. `ServerSignedAuthReplay` (SecurityEvent type) and error `2018 SERVER_AUTH_NONCE_MISMATCH` were both fully specified in [0.6.1] — schema enum, `security-event.md` §4, `07-errors.md` §3.2, and `03-messages.md` Appendix C — but the hand-maintained enum types in `ospp-sdk-php` and `sdk-ts` had not yet mirrored them. v0.6.2 catches the SDK enums up to the already-vendored schema and bumps all three repos to the same lockstep tag. No wire change; `spec/schemas/` is byte-identical to [0.6.1].

### Changed

- Version cascade `0.6.1 → 0.6.2` across all spec document headers. `spec/schemas/` and the conformance-vector corpus are **unchanged** — schema validation and `verify-all-signatures.sh` stay green on the [0.6.1] corpus (no regeneration).

### SDK (lockstep, no spec change)

- `ospp-sdk-php` + `sdk-ts`: `SecurityEventType` gains `ServerSignedAuthReplay`; `OsppErrorCode` gains `SERVER_AUTH_NONCE_MISMATCH = 2018` (Critical, non-recoverable per `07-errors.md` §3.2, `httpStatus` 401, `auth` category). Values are cross-SDK identical and byte-consistent with the vendored schema. For the BLE Partial-A ServerSignedAuth replay defence (`ble-handshake.md` §4.2.2 check #2).

## [0.6.1] — 2026-06-21

> **Reconciliation + Partial-A (S2 — decisions D2/D3).** Folds reconciliation + Partial-A onto the v0.6.0 BLE-handshake work: reconcile-time financial semantics (N7/N8/N11) and the Partial-A representation (N2/N3/Q4), plus the N9 `eventId` alignment. All signed-format changes ride a **single** conformance-vector regeneration (receipts, transaction-event, ServerSignedAuth + every inline example); `verify-all-signatures.sh` is green (signatures, BLE crypto oracle untouched, schema vectors `306/306`, inline-md idempotent). S2 **does** change `spec/schemas/`, so the SDK schemas re-vendor at the **v0.6.1** lockstep tag — no SDK signing *code* changes (the canonical-JSON serializer is field-agnostic). Server-side build (csms B1/B3) follows in its own window.

### Changed (BREAKING)

- **Signed receipt + envelope are now discriminated (`oneOf`) by session type (N2/Q4).** They carry **either** `{offlinePassId, passCounter}` (pass-form — Full Offline / Partial B) **or** `{authId, sessionId}` (auth-form — Partial A). `receipt-data`, `ble/receipt`, and `transaction-event-request` schemas restructured; `offlinePassId` is no longer unconditionally required. Makes Partial-A reconcilable end-to-end (previously impossible — a no-pass session could not build a conforming envelope and was hard-rejected at gate check #4).
- **`passCounter` added to the signed receipt + envelope (N7).** The pass's app-global monotonic usage counter, echoed by the station into the ECDSA-signed receipt body and the envelope. `06-security.md` §6.1 #10 clarified: "for this pass on this station" is the offline station's *local* anti-replay horizon, not a per-station scoping of the value (the counter is app-global).
- **`authId` + `sessionId` added to the signed receipt + envelope (Q4).** The server-issued Partial-A join key, signed so it is non-spoofable at reconcile.
- **ServerSignedAuth claims gain `durationSeconds` + `creditsAuthorized` (N3).** The authorized budget is now in the **signed** 12-claim body (was 10), so the station's duration clamp (`ble-session.md` §3/§6) is enforceable against a server-authorized value, not an app request — resolving the prose↔schema contradiction (`04-flows.md` §5b vs the claims schema). `ble/auth-response` gains an **unsigned advisory** budget copy for app UX only.
- **Counter-replay `eventId` derivation aligned `check_5 → check_10` (N9).** `authorize-offline-pass.md` §6 now derives the counter-replay SecurityEvent `eventId` over `…check_10:` to match the §5 table (counter-replay = check #10). Deterministic on `(messageId, N)`, so only future audit identifiers change; emitted rows are immutable.

### Added

- **Reconcile gate checks #12 / #13 (N7).** #12 cross-checks the envelope `passCounter` against the signed receipt; #13 hard-rejects a reused `(offlinePassId, passCounter)` tuple (cross-station replay / clone), with a complementary §7 aggregate fraud signal for the disjoint-counter-stream clone. The gate is now 13 checks; `eventId` domain `…reconcile_tx:check_N:` for `1 ≤ N ≤ 13`.
- **Reconcile gate #10 epoch-at-tx-time + revocation-window flag (N8, §6.6).** #10 compares `pass.revocation_epoch` against `epoch_active_at(endedAt)` (server-side bump history; no wire field) instead of the current epoch — a bulk revocation issued after a legitimate offline transaction no longer retroactively rejects it. A pass valid at tx time but since revoked is **accepted-but-flagged** (`revoked_after_tx`) for operator review: a deterministic gate marker, not a §7 score and not a rejection.
- **Partial-A reconciliation branch (§6.7, N2/N3).** Checks #2/#4 branch on the discriminator; the auth-form resolves `authId` against an issued-authorization registry (created + wallet-debited at `POST /sessions/offline-auth`), and derived checks read the registry row.
- **Settle-once wallet reconciliation (§8.2, N11).** A session debited at authorization time (Partial A always; Partial-B offline fallback) is **trued-up** at reconcile (the difference vs the issue-time debit), never re-debited; correlation is server-side on `sessionId` (`reconciled_session_id`) with a shared idempotency key. Specified as a forward guard — the Partial-B authorize-debit path is not yet implemented server-side, so no double-debit exists today.
- **`ServerSignedAuthReplay` SecurityEvent type.** Added across `security-event.md` §4, `schemas/mqtt/security-event.schema.json`, and `03-messages.md`, with a conformance vector — closing the dangling reference from error `2018 SERVER_AUTH_NONCE_MISMATCH`.

### Fixed (S2 adversarial-review corrections)

An independent hostile review of S2 found 2 wire-contract blockers + 9 incompleteness/financial gaps + 4 minors — the green suite was pass-form-only and validated no SecurityEvent, so it missed them. All fixed on `main` before tag:

- **Blockers.** (B1) `2005 OFFLINE_COUNTER_REPLAY`, emitted by reconcile gate check #13 on TransactionEvent, was authorize-time-only in the catalog — added to the `07-errors.md` / `03-messages.md` TransactionEvent scope and its definition generalised to reconcile-time `(offlinePassId, passCounter)` / `(authId, sessionId)` reuse. (B2) `ServerSignedAuthReplay` was in the markdown enum only — added to the JSON schema enum + `03-messages.md` + a vector (above).
- **Financial.** (F1) The §8.2 / §6.7 true-up no longer claims to be "bounded by `creditsAuthorized`": per the **Billing Authority** (`04-flows.md` §6) the server recomputes from the run-time tariff and the user pays the real delivered cost; `creditsAuthorized` caps the authorized *duration*, not settlement credits. (F2) The auth-form receipt **MUST** sign the **server-issued** `sessionId` (not a station-local one), so settle-once correlation holds on every Partial-A reconcile. (F3) Built the real cross-station cumulative `maxUses` / `maxTotalCredits` fraud signal in the authoritative `06-security.md` §7.4 (with the fleet-wide computation that catches the disjoint-counter-stream clone) and collapsed the divergent fraud tables to one source (`reconciliation.md` §7, `04-flows.md` §10, and `guides/implementors-guide.md` §3.6 are now pointers).
- **Completeness.** (F4) The §4.2.1 signing pseudocode is now 12 claims. (F5) The auth-form skip of gate checks #10–#13 is **normative** in §6.1, not just §6.7 prose. (F6) §6.6 settlement is conditional on the full gate (resolves the revocation-window-flag vs later-reject collision). (F7) `offline_pass_id` **MUST** be nullable for Partial-A rows. (F8) The reference signer is now **branch-aware**, and the first **valid auth-form vectors** (signed, verified) + an invalid hybrid close the Partial-A coverage gap. (F9) Stale claim/field counts fixed. Plus 4 minors (citation, #4 wording, `2014`-reuse note, per-station-reset disclosure).

---

## [0.6.0] — Unreleased

> **Status: pending the remaining cryptographic-review gates** before tag/release. v0.6.0 is a **breaking** revision of the BLE / Offline profile handshake (the profile has no executable implementation yet, so this is the cheapest possible moment for a wire break). The **adversarial design review (gate §9.1, design half) PASSED** — zero design break found on paper across impersonation, MITM, replay, AEAD-nonce, downgrade, and forward-secrecy; it produced only honesty/claim-scoping corrections (folded in below), not construction changes. Still required before release: the **executable half at B5** (seven re-confirmation items, listed below) and a **human-cryptographer review** of the final construction. Lockstep SDK (`ospp-sdk-php`, `sdk-ts`) implementation and full conformance-vector regeneration follow in their own change windows; the three repositories tag `v0.6.0` together once the gates pass (ADR-001).

The BLE session-key derivation used `IKM = LTK || appNonce || stationNonce`, but the BLE Long-Term Key is unobtainable by a third-party mobile app on iOS and Android — the derivation was never executable by a real app, and a zero/public LTK turns the OfflinePass into a bearer token. v0.6.0 adopts an authenticated application-layer construction (decision **D1**, [ADR-002](adr/ADR-002-ble-handshake-security-architecture.md)).

### Changed (BREAKING)

- **BLE session key (§6.5).** Derivation is now `IKM = es ‖ ee ‖ appNonce ‖ stationNonce` over a two-operation ECDH P-256 exchange (ephemeral-app × certified-static-station for authentication, plus ephemeral-app × ephemeral-station for full forward secrecy); `salt = "OSPP_BLE_SESSION_V2"`; `info = LP(deviceId) ‖ LP(transcriptHash)` (length-prefixed, closing N23; `stationId` is **not** duplicated — it is already bound via the transcript). Byte-exact pins spelled out: ECDH X-only-left-pad (Pin 1), key-schedule order/widths (Pin 3), and a **normative-MUST** handshake transcript over the **raw reassembled wire bytes** — never a re-canonicalized form, the deliberate opposite of Pin 8 (Pin 4).
- **`Hello` / `Challenge` wire format.** `Hello += appEphemeralPubKey`; `Challenge += stationCert (StationIdentity) + stationEphemeralPubKey`. Compressed-SEC1 P-256 wire encoding pinned (Pin 2). Nonces tightened to exactly 32 bytes (N16).
- **`sessionProof` (N1).** Canonical definition moves to `ble-handshake.md` §4.1: `Base64(HMAC-SHA256(SessionKey, LP(UTF8("OfflineAuthRequest")) ‖ LP(UTF8(passId)) ‖ LP(UTF8(decimal(counter)))))`, where `LP(x) = U16BE(byteLength(x)) ‖ x` — the same length-prefix as the HKDF `info`/transcript, making the input **injective** (no `(passId, counter)` concatenation collisions); `06-security.md` §6.5.1 becomes a pointer. The prior 4-input hex form (`offlinePassId | BE32(counter) | bayId | serviceId`) is **withdrawn** — bay/service binding moves to the authenticated `StartService` in-channel. Spec, the reference tooling (`verify-example-signatures.mjs`, `sign-example.mjs`, `sign-inline-md.mjs`), and the three `sessionProof` vectors were updated **together** (proven by `verify-all-signatures.sh`: HMAC sessionProof ✓, sign-inline-md idempotent ✓).
- **BLE pairing (§6.4).** Demoted to **OPTIONAL** and never a security premise (LESC-only-if-enabled; legacy pairing MUST NOT; no bond-table dependency). Channel security is the application-layer ECDH + StationIdentity certificate + AEAD. Algorithm inventory (§4.1), threat model (T01/T02/T12), §2.4, the implementer checklists, `02-transport` §8.2/§8.8, and `01-architecture` updated to match; the stale `AES-256-GCM` mention in `02-transport` §8.8.2 corrected to ChaCha20-Poly1305.

### Added

- **§6.5.2 StationIdentity certificate.** Server-signed `{stationId, organizationId, stationPubKey, issuedAt, expiresAt}` (OSPP Canonical Form + ECDSA P-256, signed by the same key as OfflinePasses), binding a station's identity to a **dedicated** static BLE ECDH key (key-separated from the mTLS/receipt key, SP 800-56A). Specifies on-device keygen + provisioning issuance, ChangeConfiguration rotation with overlap, the normative **app verification gate** (verify before sending any pass — abort on failure), and a normative residual-risk model (offline-revocation window, server-key freshness, one-station blast radius, relay-not-prevented/impersonation-is). New schema `ble/station-identity.schema.json`; delivered via `provisioning-response.stationIdentity`.
- **§6.5.3 BLE AEAD channel.** Every post-Challenge message is sealed with ChaCha20-Poly1305 IETF (Pin 6, NOT XChaCha) under per-direction keys; 12-byte counter nonce with hard-fail no-wrap (Pin 5); `AAD = transcriptHash` (Pin 7); `{n, ct}` frame (`ble/ble-secure-frame.schema.json`), encrypt-then-fragment over §11. Closes N4 (unauthenticated Start/Stop), N15 (FFF6 receipt confidentiality + re-handshake pickup; resolves the `ble-session` §5 ↔ §13 reconnect contradiction), N17 (unauthenticated rejections).
- **`organization_id` binding at authorize-time** (`authorize-offline-pass.md` §5 check #11, errorCode `2015`), unified with the reconcile-time gate check #7 as one canonical invariant (N9). Also aligns §5 check #5 to read station scoping from the server's stored pass record (N6 spec text).
- New common schema `common/ec-public-key.schema.json` (compressed-SEC1 P-256, Pin 2). Pin 8: canonical-JSON reuse (§4.8) pinned for the certificate and receipt — firmware replicates byte-for-byte; the handshake transcript deliberately uses raw wire bytes instead.
- **Defense-in-depth normative additions (from the design review):** (1) an **intended-station binding** in the §6.5.2 app verification gate — when the app holds an *out-of-band* `stationId` (e.g. a QR code on the physical station) it MUST verify `cert.stationId == intended_stationId`; the unauthenticated StationInfo `stationId` is explicitly advisory-only, never a binding; (2) an explicit **public-key validation MUST** — receivers MUST validate every received P-256 key decompresses to a valid, non-identity curve point (safe-by-construction on P-256 + ephemeral keys, but stated as a mandated B5 conformance test); (3) an explicit **message-ordering MUST** — a station MUST reject a `StartServiceRequest`/session command before an `Accepted` AuthResponse. All three are validation/state obligations — **no** wire-encoding or key-schedule change. A proof-of-possession note was added at §6.5.2 provisioning (PoP not required for v0.6.0; benign, MAY be added later).

### Security review — design gate §9.1 (adversarial, on paper)

The adversarial design review found **no break** in the analyzed classes (impersonation, MITM, replay, AEAD-nonce, downgrade, forward-secrecy); it produced honesty/claim-scoping corrections only — the construction is unchanged:

- **Anti-harvesting claim (§6.5.2)** scoped to fake/unprovisioned stations; the malicious/compromised *provisioned* station that decrypts a presented pass → **N7** (cross-station double-spend, deferred S2/D2) is now named explicitly.
- **Relay claim (§6.5.2)** reformulated: "more resistant than proximity-unlock, **not immune**" — a relay can solicit a remote victim's authorization (range extension); residual = relay + social engineering; explicit user authorization reduces, not eliminates.
- **Anti-replay layering wording** corrected (§4.2.2, §5): the AEAD channel is the first barrier; `appNonce` and `sessionKeyConfirmation` are defense-in-depth behind it (§6.5.1 already framed `sessionProof` this way).
- **T14 (new threat, disclosure):** the plaintext `Hello` leaks the stable `deviceId` before the channel exists → BLE presence-tracking. Privacy, not credential compromise; **accepted residual** for v0.6.0 (a mitigation would touch the validated key schedule — deferred to a future revision, coupled with intended-station binding + the real mobile client B6).

**Executable re-confirmation required at B5** (the verdict above is on paper; sim↔sim must confirm): (1) nonce uniqueness on the wire; (2) altered-frame / tampered-handshake fail-closed; (3) fake-station / cert-replay yields only opaque ciphertext (pass not leaked); (4) whole-session replay blocked by station fresh randomness — test station **and** app RNG; (5) public-key validation rejects bad points; (6) N7 reproduced in sim (confirm it is the only such path, caught by the S2 reconcile gate); (7) forward secrecy empirically (leaked static key + recorded session ⇏ plaintext). A human-cryptographer review of the final construction also remains warranted before tag/release.

### Deferred (tracked, not in this revision)

- **Conformance vectors (T1):** full regeneration for the ECDH / HKDF / AEAD / certificate paths. The `sessionProof` vectors **were** regenerated to the length-prefixed form (raw test key) and the inline §4.1/§7.5 examples recomputed; `sessionKeyConfirmation` is unchanged. **Known-pending:** `verify-schemas.py` fails 4 handshake vectors — `hello-{full,minimal}`, `challenge-{full,minimal}` — which lack `appEphemeralPubKey` / `stationCert` / `stationEphemeralPubKey`. The schema correctly requires the new D1 fields ahead of the vectors; the Challenge vector needs a **signed** StationIdentity (cert-signing tooling is part of T1) and the ephemeral keys must be coherent with the ECDH-derived sessionProof/AEAD corpus, so the handshake vectors regenerate as one coherent T1 batch. (The signature gates — receipts, OfflinePass, ServerSignedAuth, firmware, sessionKeyConfirmation, sessionProof, idempotency, placeholder scan — are green.)
- **N22 / D5:** `organization_id` in the **signed** pass body — `offline-pass.schema.json` does not yet carry it while the prose marks it required (live N5). Adding it to examples awaits the schema + signature + vector change (D5 / S2 / T1).
- **N18:** `common/device-id.schema.json` tightening (cross-cutting common schema; coupled with example/vector normalization → T1). The length-prefixed `info` (Pin 3) already removes the security concern.
- Non-normative mirrors are now aligned: `guides/implementors-guide.md`, the `diagrams/` (README + `.mmd`), and the `examples/flows/**` narrative/derivation blocks are on the v0.6.0 model; **all `spec/**.md` per-doc version headers are 0.6.0**. Remaining at 0.5.x: `conformance/**.md` headers (the vector suite is T1-pending). The `examples/flows/**` embedded BLE message JSON (signed payloads) regenerates in T1.
- Counter-replay `eventId` single-ordinal alignment (`check_5 → check_10`) — **delivered in [0.6.1]**: `authorize-offline-pass.md` §6 derives the counter-replay SecurityEvent `eventId` over `…check_10:` to match the §5 table. The authorize-time §5 positional list is intentionally left as-is; org binding stays unified by `errorCode 2015` + cross-reference, not by index.
- `ServerSignedAuthReplay` SecurityEvent enum entry — error `2018` (`07-errors.md` §3.2) named it as a SecurityEvent `type`, but it was **not yet present in the SecurityEvent enum** (`security-event.md` §4). **Delivered in [0.6.1]**: added to `security-event.md` §4, `schemas/mqtt/security-event.schema.json`, and `03-messages.md` with a conformance vector. (The replay itself was already *rejected* by the §4.2.2 `appNonce` check + the AEAD channel; this completes the SecurityEvent *logging*.)
- **deviceId presence-tracking (T14)** — the plaintext `Hello` leaks the stable `deviceId` (BLE-range privacy metadata, not credential). Accepted residual for v0.6.0; mitigation (ephemeral/rotating `deviceId`, or removing it from the plaintext `Hello`) is a **future design revision** — it would touch the validated key schedule (`deviceId` is in the HKDF `info`) and is coupled with the intended-station binding (§6.5.2) and the real mobile client (B6).

This release subsumes the prior unreleased prose/conformance alignment (below), which on its own required no bump.

---

## Unreleased — prose/conformance alignment + BootNotification HMAC exemption (no wire change, no bump)

Post-Wave-3 consistency audit identified 4 documentation/conformance
gaps where the prose and the conformance test-vectors had not caught
up with schema changes that already shipped in `v0.5.0`. Those
conformance fixes (under **Fixed** below) are **prose-only or
test-vector-only** — the wire-format schemas are unchanged, the
contract that integrators sign against is unchanged.
**No spec version bump.** Same drift-closure pattern as `sdk-ts`
v0.5.1 / v0.5.2 / v0.5.3 explicitly stated "spec NOT bumped" — the
inverse rationale applies here: when the schemas are correct and
only the prose lags, prose-fix without bump preserves semver
discipline (each tag = a wire contract; this lot doesn't change
the wire).

### Changed

- **§5.6 signing classification (normative):** `BootNotification`
  RESPONSE is reclassified from HMAC-critical to **always-exempt** — the
  whole action is now exempt in every `MessageSigningMode`. Its MAC is
  cryptographically void: the session key that would verify the RESPONSE
  is delivered *in* that message, so delivery integrity comes from
  **mTLS**, not HMAC (the REQUEST was already exempt — no key yet). A
  normative correction, but **no wire change** (`mac` is already optional
  in the envelope schema) and **no schema change**, so the no-bump
  rationale above applies. Critical-mode count moves 32→31 (16 exempt).
  Lands lockstep with `ospp-sdk-php` and `sdk-ts` **v0.5.5**.

### Fixed

- **prose/contradiction-resolution:** `profiles/offline/ble-handshake.md` §4.1
  `sessionProof` deviated from the normative `06-security.md §6.5.1`. §4.1
  specified **base64** over a **3-input** HMAC (`type || passId || counter`,
  decimal-ASCII counter) plus a MUST-reject-hex clause — directly contradicting
  §6.5.1's canonical **hex / 4-input** construction (`offlinePassId | BE32(txCounter)
  | bayId | serviceId`, pipe-delimited, hex-lowercase 64 chars). §4.1 now defers to
  §6.5.1 as the single normative definition, and the base64 examples in §4.1 and
  `03-messages.md §4.1` are converted to illustrative hex. `06-security.md §6.5.1`
  is unchanged and is already the reference impl (`ospp-sdk-php
  SessionProofCalculator` follows it verbatim). **No schema change** (the
  OfflineAuthRequest `sessionProof` field carried no encoding `pattern`, enforcing
  neither side) and **no wire change** — the canonical reading was always §6.5.1;
  this only removes the contradicting prose. No-bump rationale above applies.
- **prose:** `profiles/transaction/transaction-event.md` §5 (Response
  Payload) + §5.1 (Response Status Values) + §6 (Processing Rules)
  now enumerate `Deferred` as the 5th `status` value (was 4),
  matching `transaction-event-response.schema.json` since `v0.5.0`.
  §6 step 7 articulates the `Deferred`-vs-`RetryLater` station-side
  contract (no auto-resend; do not delete local copy; cross-links
  to `reconciliation.md §4.2` for the upstream state machine). A
  firmware vendor reading the profile page in isolation now sees
  the same 5-value enum the schema validator enforces.
- **prose:** `03-messages.md §4.1` TransactionEvent response payload
  table + `status` behavior table now include the `Deferred` row,
  mirroring the profile page. Closes the same blind spot for
  vendors using `03-messages.md` as the master message catalog.
- **prose:** `07-errors.md` Appendix A — Quick Reference now lists
  codes 4010 `CSR_INVALID`, 4011 `CERTIFICATE_CHAIN_INVALID`, 4012
  `CERTIFICATE_TYPE_MISMATCH`, 4013 `RENEWAL_DENIED`, 4014
  `KEYPAIR_GENERATION_FAILED`. §3.4 §4.01x has had these since
  `v0.4.x` but Appendix A skipped 4008 → 5000, leaving 5 cert-
  management codes invisible to integrators scraping the Quick
  Reference as the canonical list. Appendix A row count is now
  106, matching §1.1 totals and §3.x details.
- **conformance:** `test-vectors/valid/offline/receipt-full.json` +
  `receipt-minimal.json` now carry `offlinePassId`, `userId`, and
  `deviceId` at the outer level, matching `ble/receipt.schema.json`
  since `v0.4.2`. Prior vectors omitted all three and produced
  2 spurious FAILs on the "valid" side of `tools/verify-schemas.py`;
  re-run now reports `155/155 valid PASS, 147/147 invalid correctly
  rejected, total 302/302 PASS`. The signed inner body
  (`receipt.data`) is unchanged — outer-level identity fields are
  schema-required for symmetry with the signed receipt body per
  `06-security.md §6.2` and do not require re-signing.
- **cosmetic:** `README.md` badges now reflect the actual count of
  messages (`### N.M MessageName` subsections under `03-messages.md`
  = 40, badge was 34) and schemas (47 mqtt + 13 ble + 18 common + 1
  top-level = 79, badge was 67).
- **prose (schema description):** `schemas/common/mqtt-envelope.schema.json`
  — the `source` field description used lowercase `'station'`/`'server'` under a
  PascalCase `enum` (`["Server","Station"]`) and called the LWT a "retained will
  message" (Will Retain is `false`, `02-transport.md §3.4`). The description now
  uses the PascalCase literals and states the broker publishes the will message
  on the station's behalf when it detects the disconnection. Description-only —
  no `enum`/`required`/`pattern` change, no wire change.
- **prose:** `02-transport.md §2.2` now states that the specification-document
  version in each chapter header (e.g. *OSPP Version: 0.5.0*) is independent of
  the wire `protocolVersion` field (e.g. `0.2.1`) — the two evolve separately and
  need not match. Removes a recurring reader trap (header `0.5.0` vs every wire
  example `0.2.1`); the examples are correct and unchanged.
- **prose:** `06-security.md §5.1` selective-signing rationale corrected — it
  claimed "HMAC protects against broker compromise", but §5.2 delivers the
  per-station session key *through* the broker at boot, so a fully-compromised
  broker can forge HMACs. The rationale now scopes HMAC to publish-capable-but-
  not-intercept-capable adversaries (a leaked management-API credential, an ACL
  regression). Explanatory prose only; the signing classification is unchanged.

### Verification

- `tools/verify-schemas.py`: `302/302 PASS, 0 FAIL, 0 SKIP`.
- Wire-format schemas, error-code numeric assignments, enum
  semantics: **unchanged**.
- Cross-repo: `ospp-sdk-php v0.5.3` + `sdk-ts v0.5.3` schemas
  remain byte-identical to `spec/schemas/`; no SDK re-vendoring
  required.

---

## [0.5.0] — 2026-06-06

Lockstep re-synchronization release. The three OSPP repositories (`spec`, `ospp-sdk-php`, `sdk-ts`) drifted out of step through `0.4.x` — `spec` shipped the v0.4.2 Reconcile-Time Gate without matching SDK releases, `ospp-sdk-php` consumed `v0.4.2`/`v0.4.3` for SDK-internal fixes unrelated to spec, and `sdk-ts` stagnated at `v0.4.0`. The next protocol-affecting change (TransactionEventResponse status enum addition) would have collided on `0.4.3` across spec + ospp-sdk-php. v0.5.0 deliberately re-syncs all three to a single version number; see [ADR-001 — Cross-Repository Lockstep Versioning From 0.5.0](adr/ADR-001-cross-repo-lockstep-versioning.md) for the convention going forward.

The wire-affecting change in this release is small and additive: the `TransactionEventResponse.status` enum gains `Deferred`, closing the literal spec gap where `reconciliation.md §4.2:52` mandated the server "MUST flag the gap and defer reconciliation" but the response schema admitted only `Accepted / Duplicate / Rejected / RetryLater`. csms-server already emits `Deferred` on the wire; the schema was the missing piece.

### Added

- **schema:** `transaction-event-response.schema.json` `status` enum extended from `[Accepted, Duplicate, Rejected, RetryLater]` to add `Deferred`, with the same conditional-`reason`-required rule the other three non-`Accepted` values carry. The wire payload for `Deferred` is `{status, reason}` only; per-gap arithmetic (`counterGapExpected`, `counterGapReceived`, `counterGapSize`) flows into the `§6.3` `SecurityEvent.details` object, NOT into the wire response.
- **spec:** `reconciliation.md §4.1` step 4 + `§4.2` step 4 — the wire response on a `txCounter` gap is now stated explicitly as `status: "Deferred"` + a `reason`. `§4.2` step 4 also articulates the `Deferred`-vs-`RetryLater` distinction (operator-manual unblock vs. transient-backoff-retry) and the re-arrival rule: a previously-`Deferred` `offlineTxId` continues to return `Deferred` without re-emitting the `§4.2:52` SecurityEvent.
- **conformance:** `test-vectors/valid/transaction/transaction-event-response-deferred.json` — a positive vector for the new enum value.
- **process:** `adr/ADR-001-cross-repo-lockstep-versioning.md` — formalizes the cross-repo lockstep convention from `0.5.0` forward.

### Fixed

- **spec:** `reconciliation.md §6.3` + `§6.5` — gate-emit-before-INSERT ordering for check #4 (pass-found). Prior wording (v0.4.2) made check #4 the odd one out (SHOULD emit, MAY suppress when FK has fired); that suppression case described a scenario the conforming reconciliation path cannot reach, because the emit happens at the gate-rejection point BEFORE any INSERT is attempted. `§6.3` now states the same MUST + before-INSERT ordering for all 11 checks; `§6.5` (retitled "Belt-and-Suspenders for Non-Gate Paths", was "Pass-Found Belt-and-Suspenders") restructures to make the storage-layer FK's role explicit: it guards code paths that BYPASS the §6 gate (direct DB writes, admin tooling, batch importers), not the conforming reconciliation path. Implementation note: csms-server already emits at handler boundary before any INSERT — the spec wording now matches the de-facto behavior.

### Changed

- **spec / schema / conformance / guides:** version cascade `0.4.2` → `0.5.0` across all spec chapter headers, profile sub-page headers (reconciliation, authorize-offline-pass, offline-pass, ble-transport, ble-session, ble-handshake), guides (Implementor's Guide), and conformance docs. Status anchors only — historical "(v0.4.2)" feature references in note bodies, table cells, and `00-introduction.md` history rows remain as-is.

### Migration

- **csms-server:** none required — the `Deferred` wire value was already being emitted (this release closes the spec gap, not the implementation gap). Outbound schema-validator log noise on `Deferred` responses (logged via `MessageDispatcher.php:151`, non-blocking) goes silent once `ospp/protocol` updates to `v0.5.0`.
- **csms-app / firmware:** the next-gen station MUST treat `Deferred` as "do not auto-resend"; the offline transaction sits in the station's outbox awaiting operator-manual unblock or the missing in-sequence transactions, not exponential backoff. A station that mis-treats `Deferred` as `RetryLater` will re-send the same transaction and re-trigger the `§4.2:52` gap-SecurityEvent path; the server's re-arrival branch returns `Deferred` again without re-emitting, but the client-side behavior is wrong.

### Coordinated with

- `ospp-sdk-php` `v0.5.0` — `TransactionEventStatus::DEFERRED` enum case + `CAPABILITY_NOT_SUPPORTED` + `httpStatus` mapping carry-over from the orphaned `v0.4.3`.
- `sdk-ts` `v0.5.0` — `TransactionEventResponse` discriminated union gains a `Deferred` variant; first release since `v0.4.0`.

---

## [0.4.2] — 2026-06-05

Closes the Phase-3 offline reconcile-time validation gap surfaced post-Phase-3-persist-fix, and folds in the (M) signing-vs-verification inconsistency carried since v0.2.x. The reconciliation profile previously mandated only 4 server actions (dedup, counter-gap, receipt-sig, fraud-scoring) and was silent on re-validation of the offline pass at TransactionEvent time. Mature peer protocol (OCPP 1.6 §4.8 / OCPP 2.0.1 E01.FR.11/FR.12) mandates CSMS re-validation. This release adds a deterministic "Reconcile-Time Re-validation Gate" between receipt-sig verification and fraud-scoring, closes the cross-station replay + cross-organization replay + revoked-after-issuance + fabricated-pass + receipt-payload-tampering + expired-pass-as-fraud-signal gaps, expands the canonically-signed `receipt_fields` to bind the pass / user / device cryptographically, and fixes §6.2 signing pseudocode to hash the canonical bytes directly (matching every existing implementation; closing the (M) base64-vs-canonical interop hole before firmware integration).

Pre-launch context: prod has 0 offline_passes and 0 offline_transactions; no firmware deployments yet. This release is a coordinated upgrade — same shape as v0.3.0 → v0.4.0 SessionEnded vocabulary break. Firmware integration is sequenced after this release to ship against the post-amendment signing format and BLE FFF6 wrapper once, not retrofit.

### Added

- **spec:** `profiles/offline/reconciliation.md` §6 (NEW) "Reconcile-Time Re-validation Gate" — deterministic hard-reject checks applied after receipt signature verification (§5) and before fraud scoring (§7). 11 checks in dependency-ordered canonical order: receipt-envelope cross-checks on envelope-only fields (offlineTxId, offlinePassId, userId) → pass-found → pass-derived checks (pass-user match, signed-deviceId vs pass.device_id, org binding, station binding, expiry, revocation epoch, individual revocation). All failures emit `OfflinePassRejected` SecurityEvent with deterministic `eventId` derived from REQUEST `messageId` per check, mirroring v0.4.1 authorize-time pattern (§6.7).
- **spec:** `profiles/offline/offline-pass.md` §2 — new field `organization_id` (required) on the OfflinePass. Bounds the pass to the issuing organization; enforced at reconcile-time §6 check #7.
- **spec:** `profiles/offline/offline-pass.md` §7 (UPDATED) — "Station-scoped" property clarified to enforce at BOTH authorize-time AND reconcile-time. New "Org-scoped" property row defining organization binding. "Unscoped" semantics: `allowed_station_ids` `null` or `[]` means "any station of the issuing organization" — bounded by org binding, NOT globally any station.
- **error codes:** `07-errors.md` §3.2 — four new codes in the 2xxx range:
  - `2014 OFFLINE_PASS_REVOKED` (Error, non-recoverable) — individual revocation (`is_revoked`), distinct from `2004 OFFLINE_EPOCH_REVOKED` (batch)
  - `2015 OFFLINE_ORG_MISMATCH` (Error, non-recoverable) — pass-org ≠ station-org
  - `2016 OFFLINE_USER_MISMATCH` (Error, non-recoverable) — pass.user_id ≠ envelope.userId
  - `2017 OFFLINE_RECEIPT_MISMATCH` (Critical, non-recoverable) — signed receipt body field ≠ corresponding cross-check target; `details.field` identifies which of `offlineTxId`, `offlinePassId`, `userId`, `deviceId` mismatched
- **schema:** NEW `schemas/common/receipt-data.schema.json` — canonical body that gets serialized via OSPP Canonical Form (§4.8) and base64-encoded into `receipt.data` for ECDSA P-256 signing. 11 required fields + `meterValues` optional (when present); up to 12 signed fields.

### Changed

- **spec:** `06-security.md` §6.2 — **(M) fix:** signing pseudocode rewritten to hash the canonical bytes directly (`digest = SHA-256(receipt_data)`), dropping the prior base64 intermediate. Verification pseudocode clarified to decode-then-hash the canonical bytes (matching the new signing definition). Both sides now converge on canonical-bytes hash, aligning the spec with `EcdsaService` (csms-server + ts-simulator share the same `Ospp\Protocol\Crypto\EcdsaService` from `ospp-sdk-php`) and every other existing implementation. Closes the long-standing (M) interop hole; firmware integrating v0.4.2 will compute the same digest as the server. No implementation changes required.
- **spec:** `06-security.md` §6.2 — `receipt_fields` expanded from 9 fields to **up to 12 fields**: `{offlineTxId, offlinePassId, userId, deviceId, bayId, serviceId, startedAt, endedAt, durationSeconds, creditsCharged, meterValues, txCounter}`. The three new identity fields (`offlinePassId`, `userId`, `deviceId`) are signed to provide cryptographic binding of the receipt to the pass, the user, and the device — not merely envelope claims. `meterValues` remains optional (when present in the transaction payload, it is signed; when absent, it is omitted from the canonical body — implementations MUST NOT sign an empty `meterValues` object). New firmware-timing paragraph: firmware MUST sign per the v0.4.2 receipt_fields definition and the canonical-bytes digest rule from initial integration.
- **spec:** `profiles/offline/reconciliation.md` §2 step 4 — updated server-side processing list from "deduplication, txCounter gap detection, receipt signature verification, and fraud scoring" to include reconcile-time re-validation gate between sig verification and fraud scoring.
- **spec:** `profiles/offline/reconciliation.md` §7 (renumbered from §6) Fraud Detection — "Expired pass used" signal REMOVED (was Low, 20pt). Expiry is now a hard-reject gate check (§6 check #9, errorCode `2003 OFFLINE_PASS_EXPIRED`, severity `Error` and recoverable=`false` at reconcile-time per the context note in `07-errors.md` §3.2). Remaining 6 fraud signals unchanged.
- **spec:** `profiles/offline/reconciliation.md` §8/§9/§10/§11 — mechanical renumber from §7/§8/§9/§10 (Wallet Reconciliation, Conflict Resolution, Example, Related Schemas).
- **error codes:** `07-errors.md` §3.2 — `2003 OFFLINE_PASS_EXPIRED` row retained as-is for the authorize-time semantic (Warning, recoverable=true). Added a context note: at reconcile-time (`profiles/offline/reconciliation.md` §6 gate check #9) the same code is emitted with effective severity `Error`, recoverable=`false`, and SHOULD carry `details.context: "reconcile"` for log clarity.
- **error codes:** `07-errors.md` §1.1 — "2xxx Authentication & Authorization Errors" count updated from 14 to 18 codes. Total updated from 102 to 106 standard error codes.
- **error codes:** `07-errors.md` §4 (Error Code Usage per Message) — TransactionEvent row extended with the new codes + 2003 + 2006. Appendix A Quick Reference updated.
- **schema:** `schemas/common/receipt.schema.json` `data` field description — updated to reference the new `receipt-data.schema.json` and the canonical 11-required + meterValues-optional shape.
- **schema:** `schemas/ble/receipt.schema.json` — `offlinePassId`, `userId`, `deviceId` added to the BLE FFF6 outer wrapper required+properties. Firmware emits the final v0.4.2 wrapper on first integration; no second wire-break.
- **spec:** `profiles/offline/ble-transport.md` §8 Receipt (FFF6) — field table updated to include `offlinePassId`, `userId`, `deviceId` rows matching the BLE schema.
- **spec / schema / conformance / guides:** version cascade `0.4.1` → `0.4.2` across all spec chapter headers, profile sub-page headers (reconciliation, authorize-offline-pass, offline-pass, ble-transport, ble-session, ble-handshake), guides, conformance docs, READMEs.

### Fixed

- **spec:** `06-security.md` §6.2 (M) — see "Changed" entry above. Carried since v0.2.x; closed here because v0.4.2 already opens §6.2 for receipt_fields expansion. Firmware integrating v0.4.1 would have signed `SHA-256(base64(canonical))` while csms-server `EcdsaService` computes `SHA-256(canonical)` — interop break at first integration. The fix aligns spec to the de facto implementation behavior (csms-server + ts-simulator share the same `Ospp\Protocol\Crypto\EcdsaService`); no implementation changes required.

### Flagged as known follow-ups (not in this release)

- Server-originated `FraudDetected` SecurityEvent type — already flagged in v0.4.1; unchanged.

### Migration

This release requires a **coordinated v0.4.1 → v0.4.2 stack upgrade**:

1. **Receipt signing format expansion AND canonical-bytes hash (`06-security.md` §6.2):** firmware MUST (a) sign all 11 required fields plus `meterValues` when present per the new `receipt_fields`, (b) compute the digest over the **canonical bytes directly**, not over the base64-encoded form. Receipts signed under the prior v0.4.1 pseudocode (9-field set, or SHA-256 of base64) will fail signature verification AND the reconcile-time receipt-envelope cross-checks. The server MUST reject such receipts with `2002 OFFLINE_PASS_INVALID` (sig fail) or `2017 OFFLINE_RECEIPT_MISMATCH` (cross-check fail).
2. **Issuance MUST populate `pass.organization_id`** — implementations of the offline-pass issuance path MUST write the issuing organization's id to each new pass. Pre-launch context (no historical passes on prod) — no grace period.
3. **Reconcile-time gate adoption** — server implementations MUST apply the 11 gate checks per `reconciliation.md` §6 before fraud scoring. No transaction may persist if any gate check fails.
4. **BLE FFF6 wrapper** — firmware emits `offlinePassId`, `userId`, `deviceId` at the BLE outer wrapper alongside the signed inner.

Pre-launch context (no firmware deployments; prod `offline_passes` and `offline_transactions` rows = 0) makes the coordinated break clean — no historical receipts to grandfather. The firmware integration sequence is: (a) spec push 0.4.2, (b) server adoption, (c) UAT proof through simulator (negative cases for each gate check), (d) prod deploy, (e) firmware development against the post-amendment server, (f) firmware integration. Order chosen so firmware signs the final format on its first integration run.

---

## [0.4.1] — 2026-06-04

Focused tightening of the SecurityEvent dedup contract — closes one implicit-but-unstated stability rule in the SecurityEvent profile and one SHOULD-level conformance gap in the AuthorizeOfflinePass profile. Both amendments make existing implicit rules explicit and normative; no wire-format change, no schema change, no conformance-test change required. Compliant stations and servers see no behavior change; non-compliant implementations that previously slipped through the SHOULD-level rules now have a clear MUST-level contract to conform to.

### Changed

- **spec:** `profiles/security/security-event.md` §6.2 — added normative **MUST** that the `eventId` assigned at incident detection **MUST** remain stable across all subsequent transmissions and buffered replays of the same logical incident. Closes the implicit-but-unstated stability requirement on which the server's dedup-by-`eventId` contract (`profiles/security/README.md` §3) relies. A fresh `eventId` per transmission attempt is now explicitly forbidden as a protocol-level dedup-defeat. No behavior change for compliant stations.

- **spec:** `profiles/offline/authorize-offline-pass.md` §6.7 — upgraded the server-side SecurityEvent emit from **SHOULD** to **MUST** for signature verification failures (check #1) and counter-replay failures (check #5). Made explicit that these are the only two cases in which the server itself emits a SecurityEvent on behalf of a station-presented credential — other `Rejected` outcomes (expiry, epoch revocation, station mismatch, usage limits, rate limit) are policy decisions, not security incidents, and **MUST NOT** be emitted as SecurityEvents by the server. Added normative requirements on the emitted SecurityEvent: `type` **MUST** be `OfflinePassRejected` (from the spec-defined enum in `security-event.md` §4); `eventId` **MUST** be deterministically derived from the originating REQUEST's `messageId` so that N distinct authorization REQUESTs produce N distinct audit rows (preserving attack-attempt visibility — an attacker probing different forged signatures or replaying the same credential across multiple stations is recorded as N incidents, not collapsed to one); recommended SHA-256-based derivation provided. True QoS 1 retransmits of the same REQUEST collapse via the transport-layer dedup at `02-transport.md` §3.3 before reaching the handler; the audit-layer dedup is defense-in-depth for cases beyond the transport dedup window.

- **spec:** version cascade `0.4.0` → `0.4.1` across all spec chapter headers, guides, conformance docs, READMEs, and badges, matching the v0.4.0 cascade convention.

### Flagged as known follow-ups (not in this release)

- `profiles/core/session-ended.md` profile is missing entirely — the `SessionEnded` action is referenced from `04-flows.md`, the SessionEndReason vocabulary was extended in v0.4.0 (Item 8), and crash-resilience rules were added in v0.4.0 (`05-state-machines.md §2.5`), but no dedicated profile markdown exists. To be authored in a future release.

- Server-originated `FraudDetected` SecurityEvent type — when a server detects fraud via offline-tx reconciliation scoring, no SecurityEvent currently records the **incident** (the server's **reaction** — auto-disable of offline mode, revocation of active passes — is an administrative action and out of scope for SecurityEvent; the incident itself currently has no spec-defined SecurityEvent representation). A new server-originated type and emit rule will be considered in a future release.

### Migration

- No coordinated upgrade required. v0.4.0 implementations interoperate with v0.4.1 implementations on the wire (no schema or message-shape changes). The amendments tighten existing soft rules into hard requirements that compliant implementations already satisfy.

---

## [0.4.0] — 2026-05-07

Comprehensive patch covering 8 spec gaps surfaced by the Phase 0.5 + 0.6 OSPP investigation. Five clarifications/structural changes, one verified-stale (no work needed), two architectural extensions. Pre-launch context (no field deployments) reframes the prior backwards-compat mandate as post-launch only — Items 7 (SessionEnded expiry) and 8 (reason vocabulary) ship as strict, coordinated-upgrade changes; future minor cycles will revisit backwards-compat strategy as the ecosystem matures.

### Added

- **spec:** `04-flows.md §6` "Billing Authority" subsection — explicit normative statement that the CSMS is the cost authority. Station-reported `creditsCharged` is advisory; server applies the active tariff and produces the final invoice. Promotes prior implementors-guide guidance to normative spec text. Cross-referenced from `03-messages.md` MSG-040 and `profiles/transaction/README.md` + `stop-service.md` (Item 1).
- **spec:** `02-transport.md §5.3` "OSPP Session Retention Horizon" (24 hours) — normative concept distinct from MQTT Session Expiry Interval (1h) and from transport-level dedup window. Stations MUST retain completed-session records for at least 24h to support idempotent StopService responses + billing-audit lookups. Cross-referenced from `profiles/transaction/README.md §4.3` and `profiles/transaction/stop-service.md §6` (Item 6).
- **spec:** `02-transport.md §5.1` Periodic reporting row added for MeterValues (Station Max Age 60s, MQTT Expiry Interval 120s). SessionEnded added to existing Critical events row (Never expires) (Item 7).
- **spec:** `06-security.md §4.8` "OSPP Canonical Form" subsection — formal pseudocode (recursive lexicographic key sort, compact JSON, canonical scalar forms, UTF-8) and worked example. Designated as the single canonical serialization for all OSPP cryptographic flows. Includes RFC 8785 (JCS) relationship note: materially similar but does not require Unicode NFKC normalization. Existing references in `§5.3` (HMAC), `§6.2` (ECDSA receipt), and `profiles/offline/offline-pass.md §3` updated to reference `§4.8` instead of restating the algorithm inline. csms-server `CanonicalJsonSerializer` already implements this scheme — consolidation, not behavior change (Item 4).
- **schema:** optional `seqNo` (integer ≥ 0) on `meter-values-event.schema.json` and `session-ended-event.schema.json` — per-session monotonic counter starting at 0, incrementing by 1 per session-scoped EVENT (Item 3).
- **schema:** optional `finalSeqNo` (integer ≥ 0) on `session-ended-event.schema.json` and `stop-service-response.schema.json` — canonical session-final marker. Servers MUST discard MeterValues with `seqNo > finalSeqNo` for the same `sessionId` post-stop (Item 3).
- **spec:** `02-transport.md §3.2` ordering rule for seqNo — server verifies `seqNo` increments by 1, logs warning on gap, MUST flag HIGH-severity reconciliation audit when missing range crosses a billing-milestone boundary (mirrors txCounter rule at `transaction-event.md §7.1`). finalSeqNo discard rule defined here too (Item 3).
- **spec:** `05-state-machines.md §2.5` Session FSM crash-resilience rules — station MUST persist seqNo to NVS before publishing the corresponding event; MUST resume the prior counter on reboot during Active/Stopping; MUST orphan the prior session if the persisted state is unrecoverable; sessionId MUST NOT be reused across station reboot; finalSeqNo MUST be set on terminal events when the station has emitted any seqNo-bearing events (Item 3).
- **spec:** `profiles/transaction/transaction-event.md §7.1` clarifies that `txCounter` (offline, per-pass, per-station) and `seqNo` (online, per-session) are independent counters in disjoint scopes (Item 3).
- **schema:** `session-ended-event.schema.json` reason enum extended from `["TimerExpired", "Fault"]` to `["TimerExpired", "Fault", "Local", "LocalOutOfCredit", "Deauthorized"]` (Item 8).
- **spec:** `03-messages.md` MSG-040 trigger list expanded to 5 cases (timer expiry, hardware fault, local user stop, offline credit exhausted, mid-session deauthorization). Enum table includes 3 new value descriptions. Version note documents the coordinated v0.3.0 → v0.4.0 stack upgrade requirement (Item 8).
- **spec:** `04-flows.md §6` refund policy table expanded with explicit rows for Local (pro-rated), LocalOutOfCredit (full refund — `creditsCharged` MUST be 0), Deauthorized (full refund — `creditsCharged` MUST be 0), and TimerExpired (charge full pre-auth) (Items 2 + 8 cross-interaction).
- **spec:** `05-state-machines.md §2.3` Session FSM transition rows for Local (Active → Completed), LocalOutOfCredit (Active → Completed), Deauthorized (Active → Failed). Existing terminal states reused with reason field as discriminator — no new FSM states (Item 8).
- **conformance:** `TC-TX-007` Parts C (Local), D (LocalOutOfCredit), E (Deauthorized), F (forward-compat negative test against v0.3.0 schema) (Item 8).
- **guides:** `implementors-guide.md §3.4` server-side SessionEnded handling — switch-on-reason covers all 5 values; LocalOutOfCredit and Deauthorized mandate `creditsCharged: 0` with CRITICAL anomaly logging if the station emits non-zero; Deauthorized triggers security review flag. seqNo gap detection, billing-milestone audit flag, finalSeqNo stale-event discard rule (Items 3 + 8).

### Changed

- **spec:** `04-flows.md §6` refund table — `If < 50% duration delivered` row qualified with `AND reason=Fault`. Clarification paragraph after the table makes the override scope explicit: applies only to Fault; TimerExpired sessions are billed for the full pre-authorized duration regardless of meter values (Item 2).
- **spec:** `02-transport.md §5.1` message-expiry table — SessionEnded promoted from prior 30-second expiry (declared in `03-messages.md` MSG-040 but not reflected in the transport table) to "Never expires" alongside other Critical events. `03-messages.md` MSG-040 Message Expiry line corrected to match (Item 7).
- **spec:** `06-security.md §5.3` HMAC canonical form simplified to two steps — (1) remove the `mac` envelope field, (2) apply OSPP Canonical Form per §4.8. Original example preserved (Item 4).
- **spec:** `06-security.md §6.2` receipt signing process references §4.8 for canonicalization. Added clarifying note that the receipt envelope's `data`/`signature`/`signatureAlgorithm` fields are output containers, not part of the signed input (Item 4).
- **spec:** `profiles/transaction/README.md §4.3` StopService idempotency bullet expanded with retention horizon reference (Item 6).
- **spec:** `profiles/transaction/stop-service.md §6` new Processing Rule 10 mandating cached-response retention for the OSPP Session Retention Horizon (Item 6).
- **schema:** `schemas/common/receipt.schema.json` `data` field description clarified — "Base64-encoded OSPP Canonical Form of the receipt_fields object" with explicit field list and pointer to §4.8 + §6.2 (Item 4).
- **spec / schema / conformance / guides:** all `OSPP Version: 0.2.4`/`0.2.5` headers and the spec/README ospp-version field updated to `0.4.0`. The v0.3.0 bump did not cascade these; this release catches up.

### Verified (no changes required)

- **schemas:** `cancel-reservation-request.schema.json`, `cancel-reservation-response.schema.json`, `reserve-bay-request.schema.json`, `reserve-bay-response.schema.json` — all four already exist in `schemas/mqtt/`, are well-formed, follow envelope conventions, and require no updates for the Item 1/Item 2 clarifications (no cost/billing fields touched). Phase 0 verification (Item 5).

### Migration

This release requires **coordinated v0.3.0 → v0.4.0 stack upgrade** for two reasons:

1. **SessionEnded reason vocabulary (Item 8):** v0.3.0 servers will reject SessionEnded payloads carrying `Local`, `LocalOutOfCredit`, or `Deauthorized` via JSON-schema validation. Stations upgraded to v0.4.0 firmware in v0.3.0 server fleets MUST be configured to emit only legacy reasons (`TimerExpired`, `Fault`) until the server fleet is upgraded.
2. **SessionEnded message expiry (Item 7):** SessionEnded promoted from 30s to "Never expires"; clients that strictly enforced the prior 30s expiry will see longer broker queues for backlogged SessionEnded events.

Pre-launch context (no field deployments, single-team coordinated upgrade) makes both acceptable. Future minor cycles will revisit backwards-compat strategy as the ecosystem matures (e.g., per-message envelope `protocolVersion` discrimination, BootNotification capability negotiation).

Additive changes (Items 1, 2, 3, 4, 6) are backwards-compatible:

- Item 3 (seqNo / finalSeqNo): all new fields are OPTIONAL. v0.3.0 stations don't emit them; v0.4.0 servers accept payloads with or without. v0.3.0 servers ignore unknown fields per `02-transport.md §10.1` forward-compatibility rule.
- Item 4 (OSPP Canonical Form): consolidation of existing informal text — no behavior change. csms-server's `CanonicalJsonSerializer` already implements this scheme.
- Items 1, 2, 6: clarifications make implicit rules explicit; no behavior change for compliant v0.3.0 implementations.

Excluded from v0.4.0 (deferred):

- `Remote` reason value — would require a flow refactor to disambiguate StopService RESPONSE vs SessionEnded for server-initiated stops.
- `EnergyLimitReached` reason value — pending consumable-meter implementation maturity.
- RFC 8785 (JCS) strict adoption — current OSPP message vocabulary is ASCII-only; Unicode normalization adds implementation cost without observable behavior. May be revisited if message vocabulary is extended with non-ASCII strings or floating-point numbers.

---

## [0.3.0] — 2026-05-06

### Changed (BREAKING)

- **schema:** rename `caCert` → `stationCaChain` in `provisioning-response.schema.json`. Wire payload unchanged (Station CA chain for broker→station validation); rename clarifies actual purpose. Closes the ambiguity where the former description claimed station→broker validation but content was for the opposite direction.

### Added

- **schema:** new optional `brokerRootCa` field in `provisioning-response.schema.json` for station→broker server certificate validation. When present, station MUST use as trust anchor; when absent, station MAY use system trust store. Permits PROD-A (private CA broker certs) and PROD-B (publicly-trusted CA broker certs) deployments with single station firmware.
- **spec:** normative MUST clause requiring the station to consume `mqttConfig.brokerUri` from the provisioning response (`04-flows.md §2` — new "Consumption Requirements" subsection). Same MUST/MAY pattern extended to sibling `mqttConfig` fields. Closes the silence that left `§17.4a`'s advertisement intent ambiguous.

### Migration

Implementers updating from 0.2.x:

- **Schema field rename:** replace `caCert` with `stationCaChain` in implementations parsing or producing provisioning responses. Wire payload structure unchanged.
- **New optional field:** server SHOULD populate `brokerRootCa` for private-CA broker deployments. Station SHOULD persist `brokerRootCa` at provisioning time and use it as trust anchor when connecting to the broker.
- **mqttConfig consumption:** station implementations MUST now use `response.mqttConfig.brokerUri` when present. Implementations using hardcoded broker URLs need updating to read from the provisioning response.

---

## [0.2.5] — 2026-04-30

### Added
- `schemas/provisioning-response.schema.json` — canonical JSON Schema (Draft 2020-12) for the HTTP `POST /api/v1/stations/provision` response body defined in `04-flows.md §2`. Defines the response shape `{stationId, bayIds[], clientCert, caCert, serverVerifyKey, mqttConfig}` with strict typing, PEM regex validation for certificates and the server verify key, and a 12-field `mqttConfig` block (broker host/port/URI, client-ID template, topic prefix, QoS level, keep-alive, clean-start, session-expiry, TLS version, MQTT protocol version, optional Last Will topic). Defaults align with `02-transport.md §1.2` normative connection parameters (`cleanStart=false`, `sessionExpirySeconds=3600`, `keepAliveSeconds=30`), `§1.4` (port 8883), `§3.1` (`qosLevel=1`), `§1.1` (`mqttVersion="5.0"`), `§1.3` / `06-security.md §4.1` (`tlsVersion="1.3"`).
- Top-level schema validation pass added to `tools/validate-schemas.sh` (handles transport-agnostic schemas living directly under `schemas/`).
- New "HTTP Schemas (top-level)" section in `schemas/README.md` and updated cross-reference table linking the new schema to `02-transport.md` and `04-flows.md §2`.

### Fixed
- `01-architecture.md §7.1` (manufacturing-time enrollment) and `04-flows.md §2` (runtime token flow) are now bidirectionally cross-referenced. `§7.1` gains an explicit pointer to `§2` as authoritative for the HTTP runtime path; `§2` step 8 now references the new schema for the canonical response field set. Both patterns remain admissible under §7.0's "implementation-specific" classification — no normative change to the protocol surface.

---

## [0.2.4] — 2026-03-22

### Fixed
- Reclassify SessionEnded EVENT as HMAC-signed (**YES**) in `06-security.md` §5.6 — contains `creditsCharged` used directly for online billing at timer expiry, sole billing source when no StopService command is issued
- Update signing count: 32 of 47 signed, 15 exempt (was 31 of 47, 16 exempt)
- Update `guides/implementors-guide.md` signing counts

---

## [0.2.3] — 2026-03-22

### Added
- SessionEnded EVENT added to HMAC signing table in `06-security.md` §5.6 (row 19)
- Rows renumbered 20–46 → 21–47 to accommodate new entry

### Fixed
- Signing table summary updated from 46 to 47 message types
- `guides/implementors-guide.md` signing counts updated

---

## [0.2.2] — 2026-03-22

### Fixed
- Update all `protocolVersion` values from `"0.1.0"` to `"0.2.1"` in 172 JSON examples across 44 files
- Update all `bleProtocolVersion` values from `"0.1.0"` to `"0.2.1"` in 11 examples across 8 files
- Update `ProtocolVersion` configuration key default from `"0.1.0"` to `"0.2.1"` in `08-configuration.md`
- Update conformance test assertions for `ProtocolVersion` in TC-DM-006 and TC-DM-009
- Update canonical form example in `06-security.md`
- Update `VERSIONING.md` example version string

---

## [0.2.1] — 2026-03-21

### Added
- `supportedVersions` field in BootNotification RESPONSE payload — array of semver strings listing protocol versions the server supports. REQUIRED when `Rejected` with error `1007 PROTOCOL_VERSION_MISMATCH`.
- Test vector: `boot-notification-response-rejected-version-mismatch.json`
- TC-CORE-001 Part E: protocol version mismatch test scenario (non-recoverable rejection with `supportedVersions`)

### Fixed
- Error code `1007 PROTOCOL_VERSION_MISMATCH` remediation now explicitly references `supportedVersions` array in BootNotification RESPONSE
- `VERSIONING.md` protocol version negotiation section clarified with `supportedVersions` mechanism
- `spec/profiles/core/boot-notification.md` error table updated for 1007
- `guides/implementors-guide.md` BootNotification handling step 3 now documents version mismatch rejection with `supportedVersions`

---

## [0.2.0] — 2026-03-20

### Added
- **SessionEnded EVENT** (MSG-040) — new station-to-server EVENT for autonomous session termination (timer expiry or hardware fault). Schema: `schemas/mqtt/session-ended-event.schema.json`
- `reason` enum values: `TimerExpired`, `Fault`
- Session SM transitions in `05-state-machines.md`: `Timer elapsed → Completed` and `Hardware fault → Failed` now reference SessionEnded EVENT [MSG-040]
- Flow §6 sequence diagram and happy path updated with SessionEnded for timer expiry path
- Implementors guide: station-side step 8 (timer expiry) and server-side SessionEnded handler
- Session state diagram (`diagrams/state-machine-session.mmd`) updated with SessionEnded references
- Error scenario 02 (hardware failure mid-session) updated with SessionEnded EVENT and billing data source
- Conformance test case TC-TX-007: autonomous session termination (timer expiry + hardware fault)
- MSG-040 added to master message index table in `04-flows.md`

### Fixed
- 5 authoring errors in `05-state-machines.md` — incorrect TransactionEvent references in online session contexts replaced with StatusNotification, StopService Response, or SessionEnded
- Error scenario 02 heading: "TransactionEvent REQUEST" corrected to "StatusNotification EVENT"
- `StartService` [MSG-005]: bay in `Unknown` state now explicitly returns `3002 BAY_NOT_READY`
- `ReserveBay` [MSG-003]: bay in `Unknown` state now explicitly returns `3002 BAY_NOT_READY`
- `07-errors.md`: `3002 BAY_NOT_READY` description updated to include `Unknown` state
- Pre-existing example validation errors corrected in `examples/flows/11-reconciliation.md` (3 `offlinePassId` values), `examples/error-scenarios/05-mac-verification-failure.md` (ChangeConfiguration payloads, SecurityEvent eventIds, stationAction nesting), `guides/implementors-guide.md`, `spec/06-security.md`, `spec/07-errors.md`, `spec/profiles/device-management/update-firmware.md`, `spec/profiles/offline/authorize-offline-pass.md`

---

## [0.1.0-draft.1] — 2026-02-16

### Added
- Initial draft specification: 9 chapters (00-08) + glossary
- 34 message definitions: 21 MQTT + 13 BLE across 5 profiles
- 67 JSON Schema definitions (Draft 2020-12, strict validation)
- 68 example payloads with realistic production data
- 12 protocol flow narratives covering all connectivity scenarios
- 5 error scenario walkthroughs
- 5 compliance profiles: Core, Transaction, Security, Device Management, Offline/BLE
- 4-tier compliance model: Development, Standard, Extended, Complete
- 4 connectivity scenarios: Online, Partial A, Partial B, Full Offline
- Complete security model: mTLS, HMAC-SHA256 (selective), ECDSA P-256 (OfflinePass + receipts + ServerSignedAuth)
- 95 error codes across 6 categories with retry policies and circuit breaker
- 30 standard configuration keys with data types and access modes
- Implementor's guide for station, server, and user agent development
- Conformance test framework: 11 test cases, 226 test vectors (valid + invalid)
- CI validation: schema compilation, example validation, test vector validation
- Project infrastructure: governance, contributing guide, security policy, versioning policy
