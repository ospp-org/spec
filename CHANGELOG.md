# Changelog

All notable changes to the OSPP specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](VERSIONING.md).

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
