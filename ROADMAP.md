# OSPP Roadmap

## Milestone Plan

| Version | Milestone | Description |
|---------|-----------|-------------|
| v0.1.0 | Protocol specification published | Initial public draft with full message catalog, schemas, and test vectors |
| v0.2.0 | SessionEnded EVENT + Unknown bay state | New message for autonomous session termination, authoring fixes, example validation |
| v0.2.1 | Version negotiation fix | `supportedVersions` field in BootNotification RESPONSE for protocol version mismatch |
| v0.3.0 | Provisioning trust anchor split + brokerUri MUST | Schema rename `caCert` → `stationCaChain`, new optional `brokerRootCa`, normative MUST on `mqttConfig.brokerUri` consumption |
| v0.4.0 | Online authorization + device model | RFID/NFC credential verification, local auth list, inventory reporting |
| v0.5.0 | First station implementation | Embedded firmware reference implementation |
| v0.6.0 | End-to-end testing complete | Full integration testing across MQTT, BLE, and offline flows |
| v0.7.0 | Pilot deployment | Field testing with real hardware and users |
| v1.0.0 | Stable release | Backwards compatibility commitment begins |

---

## v0.1.0 (Delivered)

- 39 messages (26 MQTT + 13 BLE)
- 102 error codes
- 29 configuration keys
- Full offline/BLE support
- Certificate lifecycle management
- DataTransfer extensibility
- TriggerMessage remote diagnostics

## v0.2.0 (Delivered)

### Added

- **SessionEnded EVENT** (MSG-040) — station-to-server notification for autonomous session termination (timer expiry or hardware fault)
- `SessionEndReason` enum: `TimerExpired`, `Fault`
- `schemas/mqtt/session-ended-event.schema.json`
- Conformance test case TC-TX-007 (autonomous session termination)
- Session SM transitions: `Timer elapsed → Completed`, `Hardware fault → Failed` now reference SessionEnded

### Fixed

- 5 authoring errors in `05-state-machines.md` — incorrect TransactionEvent references replaced with StatusNotification/StopService Response/SessionEnded
- `StartService`: bay in `Unknown` state now explicitly returns `3002 BAY_NOT_READY`
- `ReserveBay`: bay in `Unknown` state now explicitly returns `3002 BAY_NOT_READY`
- `07-errors.md`: `3002 BAY_NOT_READY` description updated to include `Unknown` state
- Pre-existing example validation errors corrected in reconciliation, MAC-failure, implementors guide, security, errors, update-firmware, and authorize-offline-pass examples
- Implementors guide, session state diagram, and error scenario 02 updated for SessionEnded

## v0.2.1 (Delivered)

### Added

- `supportedVersions` field in BootNotification RESPONSE — array of semver strings, required when `Rejected` with `1007 PROTOCOL_VERSION_MISMATCH`
- Test vector: `boot-notification-response-rejected-version-mismatch.json`
- TC-CORE-001 Part E: protocol version mismatch test scenario

### Fixed

- `1007 PROTOCOL_VERSION_MISMATCH` remediation now explicitly references `supportedVersions` array
- `VERSIONING.md` protocol version negotiation section clarified
- `guides/implementors-guide.md` BootNotification handling updated for version mismatch
- `spec/profiles/core/boot-notification.md` error table updated

## v0.3.0 (Delivered)

### Provisioning trust anchor split + brokerUri MUST consumption

Status: shipped 2026-05-06.

Purpose: resolve a load-bearing semantic ambiguity in the provisioning response schema and close §17.4a's open consumption mandate.

### Changes

- **BREAKING — schema rename:** `caCert` → `stationCaChain` in `provisioning-response.schema.json`. The former field's description claimed station→broker validation purpose, but its content (Station CA + Root CA) was the chain used for broker→station validation. Renaming clarifies actual purpose; wire payload unchanged.
- **Added — schema field:** new optional `brokerRootCa` in `provisioning-response.schema.json`. Trust anchor used by the station to validate the broker's TLS server certificate. Permits PROD-A (private CA broker certs) and PROD-B (publicly-trusted CA broker certs) deployments with single station firmware. When present, station MUST use as trust anchor; when absent, station MAY use system trust store.
- **Added — normative MUST:** station MUST use `response.mqttConfig.brokerUri` as the MQTT connection target when the field is present in the provisioning response. MAY use pre-configured fallback when absent. Same MUST/MAY pattern extended to sibling `mqttConfig` fields.

### Out of scope (deferred to follow-up implementations)

- csms-server: populate `brokerRootCa` in provisioning response, rename `caCert` → `stationCaChain`.
- ts-station-simulator: persist `brokerRootCa` from provisioning response, consume as trust anchor at connect time, consume `mqttConfig.brokerUri` from response.

### Migration

See [CHANGELOG.md](CHANGELOG.md) `[0.3.0]` entry.

## v0.4.0 (Planned)

### Online Authorization

- **Authorize** message (Station → Server) — RFID/NFC/PIN credential verification
- **Local Authorization List** — server pushes authorized credential list for offline RFID (SendLocalList, GetLocalListVersion)
- **Authorization Cache** — station caches recent auth decisions with configurable TTL

### Device Model

- Inventory reporting (station describes physical components, connectors, meters)
- Plug-and-play provisioning enhancement

### Display Message

- Server-controlled station display messages
- Tariff display, user greetings, error messages

### Deployment Chapter (Chapter 09)

- Consolidated deployment guide: broker configuration, HA topology, network segmentation, certificate management operations, monitoring stack recommendations

### Specification Refinements

- **stationOfflineWindowHours enforcement:** Define how the station tracks its own offline duration for OfflinePass validation (e.g., monotonic clock delta from last MQTT disconnect)
- **Reconciliation backpressure:** Specify batch size and flow control for offline TransactionEvent upload on reconnect (e.g., 50 events per batch, server-side acknowledgment before next batch)
- **Error code 2002 split:** Split `2002 OFFLINE_PASS_INVALID` into separate codes for ECDSA signature failure vs. device binding mismatch for improved machine-readable diagnostics

## v0.5.0 (Future)

- Smart Charging profile (if EV charging scope)
- Real-time cost updates
- Bidirectional energy (V2X) considerations

---

## Unscheduled (recorded, not planned)

Known work with no target version. Recorded so it is not rediscovered from scratch.

### Rebuild `07-errors.md` §4 so reachability is derived, not hand-maintained

§4 ("Error Code Usage per Message") is three hand-maintained tables — Station→Server MQTT, Server→Station MQTT, BLE message types, plus REST endpoints — that must agree with the per-message error lists in `03-messages.md` and with each profile's own error table. Nothing enforces that agreement, so the four surfaces drift independently, and §4 is the surface most likely to be stale because it is the only one not co-located with the message it describes.

This matters more than presentation. §1.4's every-path rule is written **in terms of §4**: a `recommendedAction` must be correct in every context from which its code is reachable, "([§4](#4-error-code-usage-per-message))". If §4 does not actually enumerate reachability, the rule has no reliable oracle and cannot be checked mechanically.

Proposed direction: make the profile check-lists and per-message error tables the single source, and **generate** §4 from them (the repo already generates and verifies other artifacts — `tools/verify-schemas.py`, `tools/generate-types.sh`), with a CI check that fails on divergence rather than a periodic manual sweep.

Starting point, to be **re-derived rather than trusted**: a pass over §4 during the 0.8.0 closing-fixes cycle reported roughly two dozen codes appearing in no §4 row, a smaller number of those being genuinely reachable, and a handful of outright row defects. Those figures came from the same unrecorded pass described in the CHANGELOG's every-path entry, whose findings were not retained and could not be reverified — they are a hypothesis about the size of the problem, not a result. Re-derive them as the first step of the rebuild; do not carry them into any deliverable as fact.

### If a registry-wide conformance pass is ever run

A registry-wide audit was attempted in the 0.8.0 cycle and its output was discarded as unsound. The failure modes are known, and any future pass should be built against them **before** it starts:

1. **Findings are written to disk as they are produced.** The discarded pass held its findings only in working context, so nothing could be reverified afterwards and the whole result had to be dropped rather than corrected.
2. **Each verdict is given a written definition before the pass begins.** That pass graded against a rule authored in the same session, so the standard moved while it was being applied.
3. **The auditor MUST follow outbound links from a cell before declaring a remedy absent.** Of five findings withdrawn on re-read, **three** were refuted by text one link away from the cell being judged — the cell was read, the document it pointed at was not.
4. **Withdrawal is explicitly permitted and expected.** The re-read that retracted five of eleven sampled findings only worked because retraction was allowed; a pass that treats its own output as something to defend will over-report.
5. **Report what the pass does not cover.** Reachability depends on §4, which is itself unsound (above), so any reachability-based verdict inherits that uncertainty and should say so rather than presenting a count.
