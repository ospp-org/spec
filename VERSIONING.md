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

The message envelope contains a `protocolVersion` field (e.g., `"0.3.0"`).

At boot, the station sends its supported version in `BootNotification`. If versions are compatible (same MAJOR), the server responds with `Accepted`. If versions are incompatible (different MAJOR), the server MUST reject with error code `1007` (`PROTOCOL_VERSION_MISMATCH`) and include the `supportedVersions` array in the BootNotification RESPONSE, listing all protocol versions the server supports (e.g., `["0.1.0", "0.2.0"]`). The station MUST continue retrying BootNotification at the `retryInterval` carried in that response (default 30 s), per [CORE-011](spec/profiles/core/README.md), and remains in limited mode until a boot is accepted. Resolution may come from either side — the station's firmware is upgraded to a supported MAJOR, or the server adds or restores support for the station's MAJOR — and the continued retry is what allows the second case to recover without a site visit. A rejected station accepts no commands and therefore cannot be sent a firmware update over the protocol, so it MUST NOT stop retrying.

## SDK Versions Are Not This Version

This document versions the **specification**. The two SDKs — `ospp-sdk-php`
(`ospp/protocol` on Packagist) and `sdk-ts` (`@ospp/protocol` on npm) — carry their
own version line and are **not** required to match the number on the spec tag they
implement.

- The two SDKs release **at the same version as each other**. A consumer pairs them,
  so an identical number is what tells them which pair is coherent.
- Each SDK records the spec revision it implements in its own **`.spec-ref`** file,
  which names a spec tag and is enforced by that SDK's CI: the gate clones the spec
  at that tag and requires the vendored schemas to be byte-identical to it. A
  `.spec-ref` naming a tag that does not exist breaks the gate rather than failing
  it, so a pin **MUST NOT** anticipate an unreleased spec version.
- The SDK version and the spec version therefore move independently. The SDKs may
  release for reasons the spec has no part in — a re-vendor, a bug fix, an enum
  correction — without the spec being re-tagged, and the spec may be tagged without
  an immediate SDK release.

**Worked example.** Spec `v0.8.0` is implemented by `ospp-sdk-php v0.9.0` and
`@ospp/protocol 0.9.0`, both pinning `.spec-ref = v0.8.0`. The version numbers differ
by design and the difference carries no meaning: `0.9.0` identifies the SDK pair,
`v0.8.0` identifies the contract.

See [ADR-001](adr/ADR-001-cross-repo-lockstep-versioning.md), *SDK-pair releases
against a spec tag*, for what makes such a release complete.

## Schema Versioning

Schemas are organized under `schemas/` with subdirectories by transport (`mqtt/`, `ble/`, `common/`). The schema `$id` includes the major version: `https://ospp-standard.org/schemas/v{MAJOR}/...`. A new MAJOR version creates new `$id` URIs. MINOR and PATCH versions update schemas in-place (no wire change for PATCH).

## Vendor Extensions

OSPP provides a defined extension point for error codes:

- **Vendor error codes (9000–9999):** Vendors MAY define custom error codes in this reserved range. See [Chapter 07 — Error Codes & Resilience](spec/07-errors.md), Section 8 for registration rules.
- **`vendorErrorCode` field:** Error objects include an optional `vendorErrorCode` field for vendor-specific sub-codes.

Vendor-specific message types and payload fields are **not supported** in OSPP v0.1.0. Vendors requiring custom messages **SHOULD** use a separate MQTT topic namespace outside `ospp/v1/` to avoid conflicts with the standard protocol. A formal vendor message extension mechanism is planned for a future MINOR version.
