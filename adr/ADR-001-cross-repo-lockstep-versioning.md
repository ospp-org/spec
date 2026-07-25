---
adr: 001
status: Accepted (amended 2026-07-25)
date: 2026-06-06
deciders: OSPP Authors
supersedes: —
superseded-by: —
---

# ADR-001 — Cross-Repository Lockstep Versioning From 0.5.0

## Context

The OSPP standard is published across three Git repositories that together form one
release surface:

- `ospp-org/spec` — normative spec markdown, JSON Schemas, conformance test vectors.
- `ospp-org/ospp-sdk-php` — PHP SDK consumed by csms-server via Composer (`ospp/protocol`).
- `ospp-org/sdk-ts` — TypeScript SDK consumed by ts-station-simulator and the wider
  Node-side ecosystem.

Through `0.4.x` these three repositories drifted out of step:

- `spec`: `v0.2.0 → v0.4.2`. The most recent bump (`0.4.2`, 2026-06-05) added the
  Reconcile-Time Re-validation Gate (`profiles/offline/reconciliation.md §6`) — a
  wire-affecting feature that downstream SDKs would have had to mirror to be
  spec-conformant.
- `ospp-sdk-php`: `v0.1.0 → v0.4.3`. Its `v0.4.2` (2026-05-10) was an
  implementation-correctness fix for `MessageId` + `ProtocolVersion` (unrelated to
  the spec at the same number); `v0.4.3` (2026-05-14) added `CAPABILITY_NOT_SUPPORTED`
  + `httpStatus` coherence (unrelated to the spec). No SDK PHP release tracked
  spec's `0.4.2` Reconcile-Time Gate.
- `sdk-ts`: `v0.1.0 → v0.4.0`. Has not released against any spec change since the
  v0.4.0 jump — `0.4.1` and `0.4.2` are unrepresented; the package CHANGELOG is empty.

Two consequences of this drift surfaced in the v0.4.3 Deferred-enum batch
(2026-06-06):

1. **Number collision.** The Deferred enum addition would have landed naturally as
   spec `v0.4.3`, but `ospp-sdk-php v0.4.3` was already taken for an unrelated
   change. There was no shared place to read "what is the canonical 0.4.3 of OSPP?"
2. **Implicit ordering.** Coordinated releases required hand-tracking which SDK
   was where, which spec features each SDK actually implemented, and which SDK
   would need to skip versions to catch up.

The drift is not a bug in any individual release — each SDK was making
self-consistent decisions. The drift is the result of treating the three
repositories as independent products instead of as one release surface.

## Decision

Starting at **OSPP `0.5.0`**, the three repositories release **lockstep**:

- A release version number (`MAJOR.MINOR.PATCH`) is owned by the OSPP surface as
  a whole, not by any one repository.
- A change in any of the three repositories that affects the public release surface
  (wire-affecting spec changes; SDK enum / schema / payload type changes; conformance
  test vector additions) is **published** as a coordinated release in which all three
  repositories carry the same version.
- A release tag `vX.Y.Z` MUST exist on all three repositories before the release
  is considered published.
- Repository-private internal changes (developer tooling, lint config, CI YAML,
  README typos) MAY land between releases without a version bump. They are not
  the release surface.

### Scope — lockstep binds at publication, not during development

The requirements above define what it means to **publish** an OSPP release. They
place no constraint on work in flight:

- The SDKs **MAY** tag and release independently while a spec version is being
  developed, including versions the other repositories never carry. A tag cut
  mid-development is not a release of the OSPP surface, and obliges the other two
  repositories to do nothing.
- The spec tag for a version is cut **once**, when the spec for that version is
  done. It is not staged, and it is not held open waiting for the SDKs to catch up.
- No repository is ever blocked from merging or tagging because another repository
  has not yet reached the same version.

What lockstep guarantees is that a version number, **once published as an OSPP
release**, means the same thing in all three repositories. It does not guarantee —
and does not require — that the three are at the same version at any moment in
between. The original wording ("bumps all three repositories to the same new
version, in the same release window") read as a constraint on development order;
that was never the point, and at the current number of implementers it is pure
coordination cost.

A release is **complete** when:

1. The CHANGELOG entry exists in all three repositories under the same version
   header.
2. The version anchor is updated in all three repositories (`spec/spec/README.md`
   `ospp-version`; `ospp-sdk-php/CHANGELOG.md` entry; `sdk-ts/package.json`
   `version` + `CHANGELOG.md`).
3. The git tag `vX.Y.Z` is pushed on all three repositories.

The first lockstep release is `0.5.0`. It folds in:

- the Deferred-enum batch on `spec` (extends `transaction-event-response.schema.json`
  `status` enum + `reconciliation.md §6.5` wording fix);
- the SDK-PHP carry-over of `CAPABILITY_NOT_SUPPORTED` + `httpStatus` mapping that
  shipped in `ospp-sdk-php v0.4.3` but was never represented in spec / SDK TS;
- the SDK-TS first release since `v0.4.0` (no intervening releases — `0.5.0` jumps
  past `0.4.1` and `0.4.2`).

## Why 0.5.0 and not 0.4.4

The Deferred enum addition is on its own a PATCH-shaped change (additive to an
enum; existing wire values keep their meaning; no required-field break). The
MINOR bump to `0.5.0` is policy, not protocol — it marks the lockstep
re-synchronization. From `0.5.0` forward, version arithmetic is back to standard
SemVer, with the three repositories converging on one number **at each published
release** (see *Scope*).

Documenting this as a deliberate MINOR bump (instead of attempting `0.4.4`
across three repos with different histories) avoids:

- the next collision the moment one SDK lands a patch the others don't need;
- consumers reading the changelog and asking "why did SDK PHP go from `0.4.3` to
  `0.4.4` when nothing in SDK PHP changed beyond a CHANGELOG entry?".

## Consequences

**Positive.** A single version number describes the entire OSPP surface. Drift
becomes visible (a missing tag is a release defect, not a silent skip).
Consumers can pin one version across all three packages and trust the matrix.

**Negative.** Some repositories will publish "empty-feature" releases — a
spec-only change still bumps SDK TS, even if no `.ts` file changed. This is the
intentional cost: the version number now communicates "this is the canonical
OSPP surface as of this date", not "this SDK changed". With lockstep scoped to
publication this cost is paid once per release, not continuously during
development.

**Operational.** Release tooling MUST verify all three tags exist before
**announcing** a release — that is the one check lockstep needs, and it runs at
publication.

No CI gate should block merging or tagging on another repository's state. The gate
originally recommended here — refuse a "release" commit unless the same `vX.Y.Z` is
already on the other two repositories' default branches — cannot work: every
repository would wait for the other two to reach a version none of them is allowed
to reach first. It is removed rather than reworded.

## Status

Accepted, effective `0.5.0`. **Amended 2026-07-25** — lockstep scoped to
publication (see *Scope*), and the circular mid-development CI gate removed. The
coordination the original wording imposed was written for a multi-implementer
ecosystem; the SDKs have one implementer, and the external implementer of the wire
protocol consumes the spec documents rather than the SDKs, so the cost was real and
the benefit was not. What a published release means across the three repositories is
unchanged.

## References

- `spec/CHANGELOG.md` — `0.5.0` release entry (lockstep re-sync motivation).
- `spec/VERSIONING.md` — SemVer policy (this ADR scopes lockstep on top of SemVer).
- `ospp-sdk-php/CHANGELOG.md` — `0.5.0` entry (notes `CAPABILITY_NOT_SUPPORTED`
  carry-over from the unrepresented `v0.4.3`).
- `sdk-ts/CHANGELOG.md` — `0.5.0` entry (first SDK TS release since `v0.4.0`).
