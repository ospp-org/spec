---
status: Draft
ospp-version: 0.1.0-draft.1
---

# OSPP Specification — Reading Guide

> **Open Self-Service Point Protocol (OSPP)** is an open specification for secure,
> interoperable communication between self-service stations and a central management
> system.

## Status

| Field | Value |
|-------|-------|
| Status | Draft |
| OSPP Version | 0.1.0-draft.1 |
| Last Updated | 2026-02-13 |

## Document Map

The specification is organized into the following chapters and companion resources.
Chapters are numbered for stable cross-referencing; profiles extend the core with
domain-specific behavior.

### Chapters

| # | File | Title | Status | Summary |
|---|------|-------|--------|---------|
| -- | [glossary.md](glossary.md) | Glossary | Draft | Normative definitions of all terms used across the specification. |
| 00 | [00-introduction.md](00-introduction.md) | Introduction | Draft | Scope, audience, document conventions, normative and informative references. |
| 01 | [01-architecture.md](01-architecture.md) | Architecture | Draft | System topology, hardware model, identity scheme, controller topologies, communication stack. |
| 02 | [02-transport.md](02-transport.md) | Transport | Draft | MQTT 5.0 / TLS 1.3, BLE GATT, HTTPS REST, topic structure, QoS, connection lifecycle, ACL. |
| 03 | [03-messages.md](03-messages.md) | Message Catalog | Draft | Normative reference for every OSPP message: payload schemas, metadata, examples. |
| 04 | [04-flows.md](04-flows.md) | Protocol Flows | Draft | End-to-end protocol flows for boot, sessions, reservations, offline scenarios. |
| 05 | [05-state-machines.md](05-state-machines.md) | State Machines | Draft | Bay, Session, Reservation, BLE Connection, and Firmware Update FSMs. |
| 06 | [06-security.md](06-security.md) | Security | Draft | Four-layer security model, PKI trust chain, crypto key inventory, provisioning. |
| 07 | [07-errors.md](07-errors.md) | Error Codes & Resilience | Draft | Error codes across categories with severity, recoverability, and recommended actions. |
| 08 | [08-configuration.md](08-configuration.md) | Configuration | Draft | Configuration keys with types, defaults, access modes, and value ranges. |

### Profiles

| Profile | File | Summary |
|---------|------|---------|
| Core | [profiles/core/README.md](profiles/core/README.md) | Heartbeat, status notification, boot notification — mandatory for all stations. |
| Transaction | [profiles/transaction/README.md](profiles/transaction/README.md) | Session start/stop, meter values, reservation lifecycle. |
| Device Management | [profiles/device-management/README.md](profiles/device-management/README.md) | Configuration, firmware update, diagnostics, remote commands. |
| Security | [profiles/security/README.md](profiles/security/README.md) | Security event reporting — real-time incident notifications (tamper, auth failure, firmware integrity). |
| Offline | [profiles/offline/README.md](profiles/offline/README.md) | BLE transport, OfflinePass authorization, offline transaction log. |

## Normative Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** in this specification are to be interpreted as described in
[BCP 14](https://www.rfc-editor.org/info/bcp14)
[[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)]
[[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)]
when, and only when, they appear in **BOLD UPPERCASE**.

## Companion Resources

| Resource | Location | Description |
|----------|----------|-----------|
| JSON Schemas | `../schemas/` | Machine-readable schema definitions for all message types. |
| Message Examples | `../examples/` | Validated example payloads for every message type. |
| Test Vectors | `../conformance/test-vectors/` | Valid and invalid payload sets for conformance testing. |
| Conformance Suite | `../conformance/` | Automated test harness for implementer validation. |

## How to Read This Specification

1. Start with **Chapter 00 — Introduction** for scope, audience, and conventions.
2. Read **Chapter 01 — Architecture** to understand the system model.
3. Proceed through Chapters 02-07 in order for the core protocol mechanics.
4. Consult the **Glossary** for any unfamiliar terms.
5. Review the **Profiles** relevant to your implementation scope.
6. Use the **JSON Schemas** and **Test Vectors** to validate your implementation.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities to security@ospp-standard.org (see [SECURITY.md](../SECURITY.md)).

## License

All content licensed under Apache-2.0 — see [LICENSE](../LICENSE).
