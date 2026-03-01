# OSPP Roadmap

## Milestone Plan

| Version | Milestone | Description |
|---------|-----------|-------------|
| v0.1.0 | Protocol specification published | Initial public draft with full message catalog, schemas, and test vectors |
| v0.2.0 | First server implementation + feedback integration | Server-side reference implementation, community feedback incorporated |
| v0.3.0 | First station implementation | Embedded firmware reference implementation |
| v0.4.0 | End-to-end testing complete | Full integration testing across MQTT, BLE, and offline flows |
| v0.5.0 | Pilot deployment | Field testing with real hardware and users |
| v1.0.0 | Stable release | Backwards compatibility commitment begins |

---

## v0.1.0 (Current)

- 39 messages (26 MQTT + 13 BLE)
- 102 error codes
- 41 configuration keys
- Full offline/BLE support
- Certificate lifecycle management
- DataTransfer extensibility
- TriggerMessage remote diagnostics

## v0.2.0 (Planned)

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

## v0.3.0 (Future)

- Smart Charging profile (if EV charging scope)
- Real-time cost updates
- Bidirectional energy (V2X) considerations
