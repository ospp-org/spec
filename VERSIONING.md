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

## The document version, and the sites that carry it

The number in each chapter header — *OSPP Version: 0.12.0* — is the
**specification-document version**. It identifies **the release**, and it is the
only thing in a checkout that tells a reader which release they are holding.

**It equals the release tag, and it moves on every release, including PATCH.**
Tag `vX.Y.Z` and document version `X.Y.Z` are the same number by construction. A
PATCH release moves it exactly as a MINOR does: `PATCH` in the table above is
defined as *clarification of spec text* — which is a change to the document, and
therefore a change the document's own version must show.

This is not a "contract generation" that deliberately holds still while the tag
advances. It has never been one. `v0.6.2` was a release with **no spec content
change at all** — its schemas were byte-identical to `v0.6.1` — and it moved this
number anyway; moving it was the release's entire deliverable. A number that
holds still across releases cannot identify one.

> **Why this is written down.** It was practice and nothing more, so it was
> skipped without anyone dissenting — at `v0.3.0`, `v0.5.1`, `v0.5.2`, `v0.8.1`
> and `v0.11.1`. Twice the omission was later caught and repaired as a defect
> (the `0.4.0` and `0.11.0` entries in [CHANGELOG.md](CHANGELOG.md) say so in
> those words), which is the tell that it was always meant to be a rule. The
> `v0.11.1` skip was the one that did damage: two releases ran with the headers
> reading `0.11.0`, so `KNOWN-ISSUES.md` had to print the document version and
> the release tag side by side to stay truthful, and a reader with a checkout had
> no way to tell `v0.11.1` from `v0.11.0`. An unmoving version is not a
> conservative choice; it is a document asserting something untrue about itself.

**Every site MUST carry the same value.** As of `0.12.0` there are **29**, across
26 files — the count is stated so that a sweep can be checked rather than
trusted:

| Sites | Where | Form |
|------:|-------|------|
| 22 | the 9 numbered chapters, `spec/glossary.md`, the 7 profile documents under `spec/profiles/`, and the `README`/`SECURITY` of `conformance/`, `conformance/test-vectors/`, `schemas/`, `examples/` | `**OSPP Version:** X.Y.Z` on line 3 |
| 1 | `README.md` | the version badge — the number appears **twice** on that line, in the alt text and in the shields.io URL |
| 2 | `spec/README.md` | the `ospp-version:` front-matter key **and** the *OSPP Version* table row; these have disagreed with each other before, at `0.8.0` and `0.9.0` |
| 2 | `guides/implementors-guide.md` | `**Spec Version:** X.Y.Z` in the header **and** *"This guide covers OSPP X.Y.Z"* in the closing line; the closing line was unchecked until `0.12.0` and had gone stale unnoticed |
| 1 | `spec/02-transport.md` §2.2 | a worked *example* of the header, in italics — a bold-only grep misses it |
| 1 | `KNOWN-ISSUES.md` | `**Specification-document version:**` |

Documents that carry **no** version header — the conformance test cases, the
worked examples under `examples/flows/` and `examples/error-scenarios/`, and the
per-message profile documents — are outside this set by design and MUST NOT gain
one; they are versioned by the release they ship in.

`tools/verify-protocol.sh` checks that every site agrees with `spec/README.md`'s
front-matter and that the newest `## [X.Y.Z]` heading in `CHANGELOG.md` agrees
with both. It cannot check the git tag, which does not exist until the release is
cut — **that last step is the releaser's**, and it is the one this rule exists to
stop anyone skipping.

Two things this version is **not**:

- It is **not** the wire `protocolVersion`. See
  [`02-transport.md` §2.2](spec/02-transport.md) — the two evolve separately and
  need not match, and at `0.12.0` they do not (`0.12.0` against `0.3.0`).
- It is **not** either SDK's version. See *SDK Versions Are Not This Version*
  below.

## Protocol Version Negotiation

The message envelope contains a `protocolVersion` field (e.g., `"0.3.0"`).

**Negotiation is exact match.** At boot the station declares one version in `BootNotification`'s envelope. The server holds a **set** of versions it supports. If the declared version is a member of that set, the server responds `Accepted`. If it is not, the server MUST reject with error code `1007` (`PROTOCOL_VERSION_MISMATCH`) and MUST include the `supportedVersions` array in the BootNotification RESPONSE, listing every version the server supports (e.g. `["0.3.0", "0.4.0"]`), so the station and its operator can see what to move to.

There is no compatibility relation. `0.3.0` and `0.4.0` are different versions and neither implies the other; a server that supports both says so by listing both.

> **Why not "same MAJOR is compatible", which this replaces.** MAJOR is `0` for every version OSPP has ever shipped, so a MAJOR gate classified `0.1.0` and `0.10.0` as compatible and obliged the server to accept the pair — while the section directly above this one licences breaking changes between `0.x` minors, and [`spec/03-messages.md` §5.4](spec/03-messages.md) names a concrete breaking pair. The rule and the policy contradicted each other outright, and the contradiction cost money rather than clarity: a `0.4.0` station boots against a `0.3.0` server, is accepted on the MAJOR gate, delivers a full session, and emits `SessionEnded` with a `reason` value the older schema does not know. The server rejects it on validation. `SessionEnded` is the sole billing source when no StopService was issued, so the session is delivered and never billed — on a pairing the negotiation rule itself told the server to accept. Exact match refuses the pairing at boot, where refusing is cheap and visible, instead of at settlement, where it is neither.
>
> Exact match is also what a `0.x` protocol can actually honour. Restoring a compatibility relation is a post-1.0 decision, and it belongs with the guarantee that makes one meaningful.

The station MUST continue retrying BootNotification at the `retryInterval` carried in that response (default 30 s), per [CORE-011](spec/profiles/core/README.md), and remains in the `Rejected` restricted state until a boot is accepted. Resolution may come from either side — the station's firmware is upgraded to a version the server supports, or the server adds that version to its set — and the continued retry is what allows the second case to recover without a site visit. A rejected station accepts no commands and therefore cannot be sent a firmware update over the protocol, so it MUST NOT stop retrying.

> **Deployment order, and it is not optional.** Widening the server's supported set is backward compatible; enforcing exact match is not. A server MUST be configured to accept a version **before** any station is expected to emit it, and the enforcement change MUST NOT ship ahead of the configuration change. Enforcing first rejects every station whose version is not already in the set — which, on a fleet that has never been audited for what it actually emits, is potentially all of them.

### Adding a REQUIRED field, and which side moves first

The note above is one instance of a rule this document had left implicit, and
leaving it implicit cost two releases their rollout story.

**A receiver MUST accept the new form before any sender emits it.** That is the
whole rule, and it is directional — which side is "the receiver" depends on which
side ORIGINATES the message, not on which side the change was designed for.

For a field added to a message the **station** originates, the SERVER is the
receiver. If the field is REQUIRED and the server validates inbound payloads, the
server rejects every message from every station still emitting the old form, from
the instant it ships. `programs` on StatusNotification is exactly this shape: an
entire fleet's bay-status reporting stops on the day the server deploys, and the
symptom — `INVALID_MESSAGE_FORMAT` on a message the station has always sent — does
not point at the schema change that caused it. **Firmware ships the field first.**

For a field added to a message the **server** originates, the STATION is the
receiver, and the ordering reverses. `programNumber` on StartService is this
shape. Note that a server usually cannot supply such a field on day one either —
`programNumber` is resolved from a service→program binding an operator has to
create, per station — so the rollout has a third step that is neither a deploy nor
a firmware flash but human work, and it belongs in the plan explicitly.

A field that is OPTIONAL on arrival does not have this problem in either
direction, which is why making a field REQUIRED is the change that needs the
plan, not adding the field.

Exact-match negotiation does not remove the need for this. It refuses a mismatched
PAIRING at boot, cheaply and visibly. It says nothing about the order in which the
two sides are moved to the matching version, and a fleet is never moved
atomically.


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
