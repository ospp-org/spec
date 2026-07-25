# Versioning Policy

OSPP uses [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) (SemVer).

## Version Format

`MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

## Version Semantics

| Component | When to increment | Examples |
|-----------|-------------------|----------|
| **MAJOR** | Breaking changes to wire format, required fields, or behavior | Remove a required field, change message structure, rename an action |
| **MINOR** | Backward-compatible additions | New optional field, new action in a profile, new error code |
| **PATCH** | Non-normative fixes | Clarification of spec text, schema correction without wire change, typo fix |

## Pre-1.0 Policy (0.x)

During `0.x` development, breaking changes MAY occur between minor versions. Each release MUST document breaking changes in [CHANGELOG.md](CHANGELOG.md) under `### Changed` or `### Removed`.

## Protocol Version Negotiation

The message envelope contains a `protocolVersion` field (e.g., `"0.2.1"`).

At boot, the station sends its supported version in `BootNotification`. If versions are compatible (same MAJOR), the server responds with `Accepted`. If versions are incompatible (different MAJOR), the server MUST reject with error code `1007` (`PROTOCOL_VERSION_MISMATCH`) and include the `supportedVersions` array in the BootNotification RESPONSE, listing all protocol versions the server supports (e.g., `["0.1.0", "0.2.0"]`). The station MUST continue retrying BootNotification at the `retryInterval` carried in that response (default 30 s), per [CORE-011](spec/profiles/core/README.md), and remains in limited mode until a boot is accepted. Resolution may come from either side — the station's firmware is upgraded to a supported MAJOR, or the server adds or restores support for the station's MAJOR — and the continued retry is what allows the second case to recover without a site visit. A rejected station accepts no commands and therefore cannot be sent a firmware update over the protocol, so it MUST NOT stop retrying.

## Schema Versioning

Schemas are organized under `schemas/` with subdirectories by transport (`mqtt/`, `ble/`, `common/`). The schema `$id` includes the major version: `https://ospp-standard.org/schemas/v{MAJOR}/...`. A new MAJOR version creates new `$id` URIs. MINOR and PATCH versions update schemas in-place (no wire change for PATCH).

## Vendor Extensions

OSPP provides a defined extension point for error codes:

- **Vendor error codes (9000–9999):** Vendors MAY define custom error codes in this reserved range. See [Chapter 07 — Error Codes & Resilience](spec/07-errors.md), Section 8 for registration rules.
- **`vendorErrorCode` field:** Error objects include an optional `vendorErrorCode` field for vendor-specific sub-codes.

Vendor-specific message types and payload fields are **not supported** in OSPP v0.1.0. Vendors requiring custom messages **SHOULD** use a separate MQTT topic namespace outside `ospp/v1/` to avoid conflicts with the standard protocol. A formal vendor message extension mechanism is planned for a future MINOR version.
