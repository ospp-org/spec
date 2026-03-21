# OSPP Roadmap

## Milestone Plan

| Version | Milestone | Description |
|---------|-----------|-------------|
| v0.1.0 | Protocol specification published | Initial public draft with full message catalog, schemas, and test vectors |
| v0.2.0 | SessionEnded EVENT + Unknown bay state | New message for autonomous session termination, authoring fixes, example validation |
| v0.2.1 | Version negotiation fix | `supportedVersions` field in BootNotification RESPONSE for protocol version mismatch |
| v0.3.0 | Online authorization + device model | RFID/NFC credential verification, local auth list, inventory reporting |
| v0.4.0 | First station implementation | Embedded firmware reference implementation |
| v0.5.0 | End-to-end testing complete | Full integration testing across MQTT, BLE, and offline flows |
| v0.6.0 | Pilot deployment | Field testing with real hardware and users |
| v1.0.0 | Stable release | Backwards compatibility commitment begins |

---

## v0.1.0 (Delivered)

- 39 messages (26 MQTT + 13 BLE)
- 102 error codes
- 41 configuration keys
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

## v0.3.0 (Planned)

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

## v0.4.0 (Future)

- Smart Charging profile (if EV charging scope)
- Real-time cost updates
- Bidirectional energy (V2X) considerations
