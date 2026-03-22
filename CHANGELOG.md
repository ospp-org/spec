# Changelog

All notable changes to the OSPP specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](VERSIONING.md).

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
