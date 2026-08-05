# Changelog

All notable changes to the OSPP specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](VERSIONING.md).

---

## [Unreleased]

> **Partial.** This section covers the decisions landed so far in the topology-and-signing
> arc. Groups 2 (errors), 3 (signing), 4 (boot) and 5 (reset) are **not** in it — see
> *Deferred* below. The wire `protocolVersion` is **unchanged**; the document version is
> **not** bumped here.

### Added

- **The station declares its physical topology, and the server pairs it back explicitly.**
  `provisioning-request.schema.json` and `boot-notification-request.schema.json` gain a
  required `bays[]`; `provisioning-response.schema.json` gains a required `bays[]` whose
  members carry `bayId` and `bayNumber` **together**.

  The old shape could not express a station's actual hardware. `bayCount` is a scalar, and
  the `bayId`↔`bayNumber` correspondence was carried by the **order** of `bayIds`. Both are
  definable only for a **dense** bay set. A station whose second bay was never fitted has
  bays `{1,3}`: declaring `bayCount: 2` asserts a bay 2 it does not have, and a positional
  array must invent one to reach index 2. The positional rule was also the only place in the
  whole protocol where array position was the sole carrier of a correspondence, and the only
  one required to survive a message, a reboot and a write to NVS — everywhere else the
  protocol uses order it *also* echoes the identifier.

  At provisioning the station declares bay numbers and, per bay, each program's
  `programNumber` **and** `label`. At boot it re-declares bay numbers and program ordinals
  **only** — labels are descriptive and are deliberately **not** compared, so a corrected
  typo in a firmware constant cannot put a station into `Pending`. The declaration **MUST**
  be stable between boots while the hardware is unchanged; the contract is the stability, not
  how firmware achieves it. A faulted bay or program is declared **present-but-unavailable**,
  never omitted — omission means the hardware changed and requires re-provisioning.

- **A separate concept of Program, distinct from Service.** A **program** is a complete,
  station-defined *physical* operation ("simple wash") — not a composable element ("brush",
  "water") — owned by the station, which is the only party that knows its own hardware. A
  **service** is *commercial* and server-minted. The **binding** between them is created on
  the server by an operator; the station never originates it and receives it in the catalog.
  One program **MAY** carry several services — the same hardware sold at a standard and a
  promotional rate — which is why a receipt names the `serviceId` and never the program: the
  `serviceId` is what identifies the price actually paid. New glossary entry **Program**;
  **Bay** and **Service** rewritten around it; `01-architecture.md` §4.2 gains *Programs and
  Services*.

- **`TC-SEC-009` — Station Refuses a Certificate Whose Name Does Not Match.** Every assertion
  in it is a **refusal**. A case asserting that a connection *succeeds* proves nothing: a
  harness built on a general-purpose TLS library name-checks by default and passes whether or
  not the firmware ever asked for the check. Covers both legs, wildcard scope, the
  `dNSName`-vs-IP-literal confusion, CN fallback, and that the provisioning token does not
  leave the station. This is the companion case `TC-SEC-008` said should exist.

### Changed (BREAKING)

- **The station MUST verify the server certificate's identity, not only its chain**
  (`06-security.md` §2.1, *Server identity verification*). Normative over
  [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525): match the reference identity against
  `subjectAltName` — `dNSName` for a hostname, `iPAddress` for an IP literal — **MUST NOT**
  fall back to Subject CN, and **refuse on mismatch**. Binds **both** the MQTT leg and the
  pre-credential HTTPS provisioning call.

  No normative clause required this before. Chain validation does not imply it and, on the
  embedded stacks these stations use, does not perform it: mbedTLS and wolfSSL require the
  expected name to be set explicitly and the handshake succeeds if it is omitted. A station
  that verified the chain but not the name accepted **any** certificate from **any**
  publicly-trusted CA for **any** domain — which reduced §2.1's system-trust-store fallback
  to no authentication at all. It matters most on the HTTPS leg, which carries the
  provisioning token and runs *before* the station holds any credential of its own.

  **Breaking for conformance claims; no wire change.** Measured as satisfiable: both
  deployed environments advertise hostnames rather than IP literals, and both hostnames are
  `dNSName` SANs on the certificate actually presented on 8883.

- **Maximum bays per controller: 255 → 64**, and a new maximum of **32 programs per bay**.
  Stated in all four sites that carried a bound (`01-architecture.md` §4.2,
  `provisioning-request`, `provisioning-response`; `boot-notification-request` had **none**).
  A real installation has 4–8 bays. At 255 bays the boot re-declaration exceeded the 64 KB
  MQTT Maximum Packet Size of `02-transport.md` §1.2 at roughly 4 programs per bay; at 64×32
  it is under 8 KB.

- **`4020 BAY_COUNT_MISMATCH` compares topology, not a count.** The declared `bayNumber` set
  **MUST** equal the registered set **as a set** — `{1,3}` against a registered `{1,2}` is a
  mismatch though both have two bays.

- **`serviceId` is the catalog service, not "the service program."** Corrected in all three
  prose sites plus the glossary (`start-service-request.schema.json`,
  `profiles/transaction/start-service.md`, `profiles/transaction/transaction-event.md`).

- **`TC-SEC-007` Part D converged.** It named an array of `{bayId, bayNumber}` objects a
  conformance **FAILURE** for the provisioning response, while
  `ble/available-services.schema.json` already carried exactly that shape — two surfaces
  contradicting each other at HEAD. Part D now asserts the explicit pairing, that order is
  **not** significant, and adds the non-dense case the positional scheme could not express.

### Deprecated

*(First use of this section. The repo had no deprecation convention; the one adopted here is
`"deprecated": true` — the standard JSON Schema 2020-12 annotation — plus a
`DEPRECATED (since X, removed in Y):` prefix in `description`, a
`> **Deprecated (X).**` admonition in prose matching the repo's existing admonition style,
and this Keep a Changelog section.)*

- **`bayIds`** in the provisioning response — superseded by `bays`, **removed in 0.12.0**. It
  stays **required** for this one release, deliberately: the **server** emits it and a 0.10.0
  station reads it, so dropping it in the release that introduces the replacement would break
  every deployed station. Both **MUST** be emitted and **MUST** agree. A server that cannot
  produce a conforming `bayIds` because the bay set is **not dense MUST reject the
  provisioning request** rather than misstate the mapping — so a non-dense topology is usable
  only once both parties have moved to `bays`. A station on 0.11.0+ **MUST** read `bays` and
  **MUST** ignore `bayIds`.
- **`bayCount`** in the provisioning request and in BootNotification — superseded by `bays`,
  **removed in 0.12.0**. Unlike `bayIds` it becomes **optional**, not retained-required: the
  **station** emits it, and keeping it required would force a conforming new station to emit
  a field that lies about a non-dense set. Where present it **MUST** equal `bays.length`.

### Fixed

- **`03-messages.md` said the catalog arrives "via BootNotification response."** That schema
  is closed and declares no field that could carry it — the only candidate, `configuration`,
  is a string-to-string configuration map. Corrected to what actually happens: the catalog
  arrives **only** through `UpdateServiceCatalog`, and a freshly provisioned station has none
  until the server pushes one, which is why the server **SHOULD** push promptly after
  accepting a boot.
- **`06-security.md` §4.2 still named the system trust store as the sole fallback**, two
  hundred lines from the §2.1 clause that qualifies it. Marked as a summary of §2.1, which is
  authoritative, and now states what the fallback does **not** relax.

### Deferred (tracked, not in this revision)

- **Groups 2–5 in full**: the undeclared-ordinal and boot-mismatch error codes; the signing
  decisions; version negotiation, `bootReason`, `Pending`, the station state machine and
  StatusNotification-carries-programs; and the reset/credential-wipe removal.
- **Program-level fault reporting (T11)** — deliberately held with **StatusNotification
  carrying programs rather than services**. Landing an optional per-program `errorCode` on a
  message that still enumerates *services* would attach program diagnostics to a field that
  does not name programs. The two are one change.
- **Asymmetric evidence on the online money path (G7)** — scoped only, not written.

### Verification

- `tools/verify-schemas.py`: **306/306 PASS, 0 FAIL, 0 SKIP**.
- Example payloads against their schemas (CI's `validate-examples` script): **51/51**.
- All schemas compile (CI's `validate-schemas` job): **85/85**.
- `tools/verify-protocol.sh`: **3192/3212**, with the **same 15 pre-existing failures** as
  the `v0.10.0` baseline — the failure set is byte-identical, so **+0 regressions**. Those 15
  predate this arc and are unrelated to it.
- Not run locally, unavailable in this environment: `markdownlint`, `lychee` link check.
  `tools/validate-schemas.sh` and `tools/validate-examples.sh` mass-fail here for want of the
  **`ajv` CLI**, which is an environment artefact and not a defect — the CI jobs they mirror
  were replicated against the repo's own `ajv` module and pass, as recorded above.

---

## [0.10.0] — 2026-07-30

> **One change, breaking for stations only: `Unknown` is no longer a value any message can
> carry.** The bay state machine still has seven states and its transition table is untouched.
> What narrowed is the wire — `bay-status.schema.json` now enumerates the six **reportable**
> states, and `previousStatus` is omitted on the post-boot report rather than merely permitted to
> be. No SDK loses an enum member; `protocolVersion` does not move.

### Removed

- **`Unknown` from `schemas/common/bay-status.schema.json`.** The enum goes from seven values to
  six: `Available`, `Reserved`, `Occupied`, `Finishing`, `Faulted`, `Unavailable`.

  `Unknown` is entered from exactly two places and neither is a message. A station enters it at
  power-on ([`01-architecture.md` §7.3](spec/01-architecture.md), First Boot step 1) and leaves it
  by self-test; a server enters it on connection loss
  ([CORE-008](spec/profiles/core/README.md)) and leaves it on the next accepted report. Both
  parties hold it, neither transmits it. The three transitions *out* of it are all
  StatusNotification-triggered and all target a determinate state, and `Unknown → Unknown` was
  never in the transition table, which [§1.5](spec/05-state-machines.md) makes invalid.

  So a station reporting `Unknown` was already non-conforming — but the schema accepted it, no
  prose forbade it, `TC-CORE-001` asserted only that a message arrived and never its value, and
  the conformance corpus shipped `status-notification-unknown.json` as a **valid** vector. A
  firmware author reading the schema was led into a message the protocol does not permit and
  nothing caught them. This is not hypothetical: the reference station simulator emits it today,
  on its default boot path, by reading its bay state machine's power-on value straight into the
  payload.

  Two schemas consume this enum and both are wire, so both narrow:
  `status-notification.schema.json` (`status` **and** `previousStatus`) and
  `ble/available-services.schema.json` (`bays[].status`). A station advertising its own bays over
  BLE is as authoritative about them as it is over MQTT.

  This follows settled practice for a state one party infers rather than observes. TR-069 names
  the same case (§1.6, *Seen Missing*) and gives it no wire slot, noting the device cannot
  determine it about itself; OCPP defines no connector status for connection loss in either 1.6-J
  or 2.0.1. The process-control protocols carry such a fact as a companion quality flag beside
  the value rather than as a member of the value's own vocabulary — and OSPP already has that
  channel, since the LWT is itself the freshness signal. Recorded in
  [§1.2](spec/05-state-machines.md) so it is not re-litigated.

### Changed

- **`previousStatus` is omitted on the post-boot report, not merely permitted to be**
  ([`status-notification.md` §5 rule 2](spec/profiles/core/status-notification.md)). `MAY be
  omitted` → `MUST omit`. This is the field the narrowing would otherwise have broken: the
  post-boot report *is* the station leaving `Unknown`, so `Unknown` was the truthful value there,
  and it was schema-valid. Narrowing while the field stayed permitted would have made a conforming
  station's mandatory first report fail validation — and on a receiver that validates inbound
  messages, a schema-invalid EVENT has no RESPONSE path, so the whole message is dropped and the
  bay holds no report at all.

  The two documents already disagreed: [`03-messages.md`](spec/03-messages.md) described the field
  as *"absent on post-boot report"* while the profile said `MAY`. The catalog was right.

  Absence is now load-bearing: no `previousStatus` on a StatusNotification means *this is the boot
  report*, and a server MAY read it that way.

- **The StatusNotification ordering floor is named, and its provenance constrained**
  ([`02-transport.md` §3.2](spec/02-transport.md)). `last processed` → `last **accepted**`, plus
  two rules that were previously absent: a *discarded* report MUST NOT advance the floor, and **no
  server-internal state change advances it** — not a boot reset, not CORE-008, not a heartbeat
  sweep, not a row-modification timestamp any of them touch. The floor is a station-clock value
  that arrived on the wire and a server-clock event is not commensurable with it. Where no report
  has been accepted there is no floor, and a bay's first report MUST NOT be discarded on ordering
  grounds.

  Discarding stays a SHOULD. What is now a MUST is what the floor is *made of*, because a floor
  built from the wrong clock domain makes the discard unsound rather than merely lenient.

  [`status-notification.md`](spec/profiles/core/status-notification.md) rule 6 stated a second,
  weaker rule — *"latest timestamp wins"*, naming no floor and no provenance. It now points at the
  transport chapter. One rule, one home. The reference server built the defect from exactly this
  split: the provenance-bearing rule sat in the chapter a server implementer does not read.

- **`TC-CORE-001` and `TC-CORE-002` assert the reported value**, not merely that a message
  arrived. Both cases previously passed a station that reported `Unknown` for every bay.
  `TC-CORE-002` is the more important of the two — it is the reconnect path, where the server has
  just set every bay to `Unknown` and a station that mirrors server state will echo it back.

- **`conformance/test-vectors/valid/core/status-notification-unknown.json`** moves to
  `invalid/core/`, unannotated, matching how 0.9.0 retired `Deferred`. Vector counts: valid
  157 → 156, invalid 149 → 150, total **306** unchanged. `tools/verify-schemas.py`: **306/306
  PASS, 0 FAIL, 0 SKIP**.

### What breaks

| Audience | Breaks? | What |
|---|:---:|---|
| **Stations** | **yes** | A station reporting `Unknown` in `status` or `previousStatus` now fails schema validation. A station sending `previousStatus` on its post-boot report is now non-conforming. |
| **Servers** | no | The wire narrows; a server's *internal* `Unknown` is untouched and still required by CORE-008. Servers that validate inbound messages will begin rejecting a message they previously accepted — which is the point. |
| **SDK consumers** | **partly** | Neither SDK loses its `BayStatus` enum member: it remains the FSM's power-on state and, in PHP, a persisted domain value. What narrows is the *wire boundary* — PHP's `BayStatus::fromOspp('Unknown')` will throw, and TypeScript's `StatusNotificationPayload.status` no longer accepts `BayStatus.UNKNOWN`. Code that only *holds* the state is unaffected. |
| **`protocolVersion`** | no | Unchanged. This is an enum narrowing, not a structural wire change — the same call 0.9.0 made for `Deferred`. |

Both SDKs require a re-vendor: their CI gates clone the spec at `.spec-ref` and demand
byte-identical schemas. They release as a pair at **0.11.0** against `.spec-ref = v0.10.0`, and
the spec must be tagged first — a `.spec-ref` naming an unreleased tag breaks the gate rather
than failing it ([VERSIONING.md](VERSIONING.md)).

### Not changed, deliberately

The bay FSM still has **seven** states and [§1.3](spec/05-state-machines.md)'s transition table is
untouched. This narrows the wire, not the model.

Found and **recorded rather than fixed** — see [KNOWN-ISSUES.md](KNOWN-ISSUES.md): the bay FSM is
specified twice and the two copies disagree, on `Unavailable → Faulted`, on whether anything
transitions *into* `Unknown`, and — in four separate statements, two of them 23 lines apart in one
file — on whether an invalid transition is rejected or accepted as authoritative. Each SDK
implemented one copy exactly: `ospp-sdk-php` has the profile's 18 transitions, `sdk-ts` has
Chapter 05's 23. The root cause is that Chapter 05 §1 merges the station's physical FSM with the
server's belief about it into one table, and separating them is a design question with a
wire-visible answer, not a text edit.

Also recorded, not built: no conformance case asserts CORE-008 itself — that a server marks all
bays `Unknown` when a station disconnects. Both core cases are station-facing; CORE-008 is a
server obligation and wants its own case.

---

## [0.9.0] — 2026-07-29

> **Three independent bodies of work share this tag, and all three are breaking — each for a
> different audience.** They share it because none of them cut a tag of their own: `v0.8.1`
> (2026-07-28) predates all three, and every commit in this release is dated 2026-07-29.
>
> | | Body | Breaking for | Wire change |
> |:-:|---|---|:-:|
> **A** | A station that cannot validate a server certificate **MUST refuse** | **conformance claims** | none |
> **B** | `Deferred` retired from `TransactionEventResponse.status` | **consumers** | enum narrowed |
> **C** | `errorText` constrained to UPPER_SNAKE_CASE on 15 schemas | **producers** | validation tightened |
>
> A and C are **not** consequences of B and are not scoped by it. Read each on its own.

> **A — Station certificate validation is now fail-closed.** The specification required
> verification and never stated the consequence of its failure. §2.1 mandated that the station
> verify the broker's server certificate and fixed which anchor to use; it said nothing about what
> happens when no anchor validates the presented chain. `01-architecture.md` bound the
> **deployment** to supply a trust policy and never bound the **station** to behave any particular
> way when that policy failed. Both existing TLS-failure rows in `04-flows.md` were on the
> MQTT/mTLS leg; nothing covered the provisioning HTTPS leg, and nothing on either leg said
> *refuse*. **Under that gap, a station that connects without authenticating the server was a
> conforming outcome — and on hardware with no system trust store it was the *default* outcome,
> because it was the only one that connected.** The omission did not degrade to "does not
> connect"; it degraded to "connects without verifying", the exact failure mTLS exists to prevent.
> That is how it reached production. The new clause covers **all four cells** — no anchor
> obtainable, and anchor present with a failing chain, on each of two legs (MQTT, and the
> pre-credential HTTPS provisioning call) — and defines *refuse* as the connection not completed
> and the call not made. *"Recording the failure and continuing is not a conforming outcome"* is
> stated explicitly, because that is the reading the silence permitted.
>
> **This is breaking for conformance claims, not for the wire.** No schema, field or value
> changed. An implementation previously conforming may now be non-conforming.

> **B — `Deferred` is retired, and so is the machinery it was invented to express.** The
> `TransactionEventResponse.status` enum returns to four values. A station or SDK that switches
> exhaustively over five arms will no longer compile or match, so this requires a re-vendor and a
> release of both SDKs. Nothing else on the wire changes: no request schema, no error code, no
> `protocolVersion`.

> **C — `errorText` is a machine-readable name, and is now enforced as one.** §1.3 defines it as
> *"Machine-readable error name in UPPER_SNAKE_CASE (e.g. `BAY_BUSY`). Stable across versions —
> clients MAY use this for programmatic matching"*, and §2.1 requires it on every MQTT rejection.
> Exactly **one** of the sixteen schemas declaring it enforced that shape. The other fifteen
> constrained length only, so any string passed — which is how a raw validator diagnostic,
> `"/payload: The data (array) must match the type: object"`, reached firmware in the reference
> server, in the field the spec reserves for programmatic matching. The schema had no opinion, so
> nothing caught it.
>
> **This is breaking for producers.** A previously-valid payload carrying prose in `errorText` is
> now invalid. No *shipped valid vector* breaks — all 158 still validate — so the break falls on
> emitters, not on the conformance corpus. It is a different audience from B's consumers and the
> two must not be read together.

### Added

- **`01-architecture.md` §7.2 gains a *Broker trust policy* row.** The Required-configuration
  manifest gave the provisioning server's anchor its own row (*HTTPS trust policy*) and gave the
  broker none. Because §7.2 binds a deployment to "supply every row by some means", an absent row
  was an **absent obligation**: nothing required a deployment to tell the station what validates
  the broker's certificate. That asymmetry is what a station with no system trust store falls
  through — `brokerRootCa` is absent by design under a publicly-trusted hierarchy, and no row
  obliged anyone to supply the anchor another way. Placement was chosen, not defaulted: inserted
  as **row 5** so the footnote's "Rows 3 and 4" still names TLS credentials and `stationId`, and
  the "last three rows" sentence still names origin/trust-policy/clock. Appending would have
  falsified both sentences silently. `brokerRootCa` itself is unchanged.
- **`profiles/device-management/reset.md`: the Broker trust policy survives a reset**, as the
  HTTPS row already did. That table states its rows **are** §7.2's manifest, so adding a row to
  §7.2 left it one row short of what it claims to reproduce. Without it, a Hard reset on a
  public-CA deployment was permitted to discard the only anchor the station has for the broker,
  with nothing to restore it — the in-band `brokerRootCa` path does not exist in that deployment
  shape. That is the bricking failure the section's closing paragraph already warns about, reached
  through a row the table did not list. The **field** and the **policy** are kept distinct and the
  field is untouched: `brokerRootCa` remains in the first table, cleared by a reset and restored
  by the provisioning response.
- **`conformance/TC-SEC-008` — the station side of broker certificate validation.** The first case
  in the suite with the **station as implementation under test**; every one of the previous 29
  treated the station as the harness and the server as the subject, so §2.1's single station-side
  MUST had never been expressible as a test and no implementation was ever asked to demonstrate
  it. *That is why the defect reached production rather than being caught: nothing was pointed at
  it.* Covers both failure modes, requires refusal in both, and defines refusal as a non-completed
  handshake with no MQTT CONNECT. Part A is **two isolation controls** that gate every later
  observation, because the trap has a side facing each way: on the **harness** side `openssl
  verify` consults the default trust store alongside `-CAfile` and `-no-CAfile -no-CApath` is
  insufficient on OpenSSL 3.x without `-no-CAstore` (a recon pass returned six false PASSes to
  exactly this), so a run whose negative control passed is declared **VOID**; on the **station**
  side a system trust store containing a validating root makes every refusal test false-PASS, so
  enumeration is by **SHA-256 fingerprint, not subject name**, and the case is recorded **NOT RUN**
  rather than PASS when the store cannot be excluded. Parts B and F are positive controls and
  refusing either is a listed failure — a station that refuses everything would otherwise satisfy
  the negative parts without implementing anything. Part E pins the incident itself:
  `stationCaChain` loaded into the server-anchor slot must refuse, a substitution **two integrators
  made independently** with nothing in the suite testing it.
- **`conformance/TC-SEC-007` — what a successful provision returns.** TC-SEC-005/006 covered this
  endpoint's error paths thoroughly and between them traversed four successful provisions without
  looking past `clientCert`; nothing pinned the success response, and *the absence was hard to see
  precisely because the error coverage looked like coverage*. Pins every member of
  `provisioning-response.schema.json` plus three relationships a schema-valid response can still
  violate: `bayIds` **order is** the `bayNumber` mapping (a server returning the right ids in the
  wrong order silently re-points every bay); `stationCaChain` verifies the `clientCert` in the
  **same** response, with `rootCaThumbprint` pinning that chain's apex; and the three-group replay
  split (frozen / current / regenerated). TC-SEC-007 is **server-side by its own statement** and is
  not edited by TC-SEC-008 — it is correct for what it tests.
- **`errorText` pattern `^[A-Z][A-Z0-9_]+$`** on the 16 declarations across 15 files where
  `errorText` is **paired with `errorCode` at the same object level** — which is what makes it the
  §1.3 field. `boot-notification-response` already had it.

### Changed

- **`06-security.md` §2.1 — the fail-closed clause** (body A above), plus three cross-references
  placed where an implementer actually looks rather than only in §2.1: `04-flows.md` §2
  preconditions (the bullet naming the HTTPS trust policy now states the consequence of its
  failure); `04-flows.md` §2 Error Paths (a row beside "Network unreachable", the other
  pre-response transport condition, marked a **station-side refusal with no error code** since no
  request reaches the server); and `01-architecture.md` §7.2 (one sentence turning the deployment
  obligation into the station obligation it never implied).
- **§2.1's "Applies to" row** now names the pre-credential HTTPS provisioning call as in scope for
  the station-side validation requirements **only**, and records that it is server-authenticated
  rather than mutual. The section is titled mTLS and that call is not mTLS; without the row a
  later reader would take the mismatch for a drafting slip and remove it.
- **`profiles/offline/reconciliation.md` §4 is now "Transaction Counter (Forensic)".** The counter
  is persisted as evidence and **gates nothing**: the server **MUST NOT** condition settlement,
  deduplication or response status on its value, continuity or ordering. A discontinuity **SHOULD**
  raise an **operator alert on the station** and the transaction settles normally. §2's "Ordering
  guarantee" MUST becomes a SHOULD — transmission preference, not correctness — and states that
  each transaction is settled on its own merits in arrival order. `transaction-event.md` §6 rule 2
  and `03-messages.md` §4.1 follow, as do `02-transport.md`, `04-flows.md` §10, `glossary.md`,
  `profiles/offline/README.md`, `ble-session.md`, `guides/implementors-guide.md`, two `examples/`
  flows and two diagram labels.
- **`06-security.md` §6.3 is reframed** from "Transaction Ordering and Gap Detection" to "Forensic
  Evidence", and gains **§6.3.1 — What the counter does not defend against**, which states plainly
  that a station-generated, station-signed counter carries no completeness guarantee against the
  party generating it, and names the three mechanisms that do the work instead.
- **`07-errors.md` `1005`** no longer routes the out-of-order condition to `Deferred`. There is no
  error condition there at all: such a transaction settles normally.
- **`schemas/provisioning-response.schema.json` — `stationCaChain` description.** It told the
  reader what the field is not and named `brokerRootCa` as what the station's own anchor **is** —
  true only under a private CA hierarchy. Under a public one `brokerRootCa` is absent by design, so
  the sentence pointed at a field not in the response, leaving the one PEM-chain-shaped field that
  **is** present as the only candidate for a `cacert` slot. **Two integrators independently made
  exactly that substitution.** The negative half is the load-bearing half and is strengthened
  rather than softened: this field is not the station's anchor under **any** deployment shape.
  **Description-only — no validation behaviour changes.**
- **Eight `errorText` descriptions** that contradicted §1.3 outright, calling the field
  "Human-readable error description" or "Error description when status is Rejected". A schema
  describing the field as prose while the spec defines it as a machine-readable name is how the
  divergence stayed invisible.
- **Five invalid conformance vectors** carried prose `errorText` incidentally. They still rejected,
  but for two reasons instead of the one they are named for, so each now carries the registry name
  of the `errorCode` it already declared: `3016 ACTIVE_SESSIONS_PRESENT`, `3001 BAY_BUSY`,
  `5017 INSUFFICIENT_STORAGE`, `3012 RESERVATION_NOT_FOUND`, `3014 BAY_RESERVED`.
- **`03-messages.md` §6.4's UpdateFirmware example** was missing the `signature` the same section
  lists as Required. An implementer building from the example — as implementers do — ships a
  firmware-update path that transmits no signature, and discovers it only when a station that
  checks rejects the update, or worse, when one that does not check accepts an unsigned image.
  Value reused verbatim from the profile document's complete example, so the corpus carries one
  placeholder rather than two.
- **`conformance/TC-OFF-003` / `TC-OFF-004`** — gap-detection steps and criteria retired; two
  failure criteria rewritten from dead assertions into live ones, and a positive part added. See
  **Verification**.

### Removed

- **`Deferred` (`transaction-event-response.schema.json`).** The `status` enum drops from five
  values to `Accepted` / `Duplicate` / `Rejected` / `RetryLater`, and the fourth `allOf` branch that
  made `reason` required on `Deferred` goes with it. **The value never had a design rationale of its
  own.** `00-introduction.md` records what it was: added to the schema in 0.5.0 on 2026-06-06 to
  close a gap where *"server already emitted the value, schema didn't admit it"* — the server
  shipped it 2026-06-04, the schema was amended to admit it two days later. It was invented solely
  to give the §4.2 gap rule an emittable wire value. Remove the gap rule and there is nothing for
  it to express.
- **The `txCounter` gap-blocking rule (`reconciliation.md` §4.2).** With it: the
  `lastReconciledCounter` watermark, the `txCounter > lastReconciledCounter + 1 → Deferred` branch,
  the sticky per-`offlineTxId` deferred state and its re-arrival rule, and the
  `txCounter <= lastReconciledCounter → Duplicate` branch. That last one was **actively
  dangerous**: §4.1 step 1 resets the counter "after a station boot **or** sync", and `Duplicate`
  obliges the station to delete its local copy, so a station that power-cycled had every subsequent
  offline payment answered `Duplicate` and deleted — with no server-side row. No adversary
  required.
- **"Operator-manual unblock."** `Deferred`'s only reachable exit, referenced normatively in
  `reconciliation.md`, `transaction-event.md`, `03-messages.md`, `06-security.md` and
  `00-introduction.md` — and **defined nowhere**, in violation of `07-errors.md`'s own "Mention is
  not definition". No route, command, admin action or state transition implements it in any of the
  four repositories. Every reference is removed.
- **The `Counter gap detected` `+0.30` fraud factor (`06-security.md` §7.4).** Removed on two
  independent grounds, either sufficient. **Wiring:** `txCounter` is a *station* property while
  every §7.4 automated response is a *user* sanction (*disable offline mode for user*; *revoke
  pass, block user account*) — a reboot would have been scored against whoever charged next.
  **Signal:** the counter is generated and signed by the station, so a firmware-level adversary
  emits a contiguous sequence and never produces a gap; the discontinuities that actually occur are
  hardware faults. The factor also **contradicted `reconciliation.md` §7**, which asserted a gap was
  "handled by §4.2 (`Deferred`), **not a score**" while §7.4 — which §7 itself names as the
  authoritative model — scored it.

### Deferred (tracked, not in this revision)

- **The HTTPS-leg companion to TC-SEC-008.** §2.1's refusal requirement binds both legs and the
  pre-credential HTTPS call is subject to the identical four conditions, but the harness is
  different in kind: it requires a provisioning **server** presenting a controllable certificate
  rather than an MQTT broker, and the station's *HTTPS trust policy* rather than its *Broker trust
  policy*. **No such harness exists anywhere in the suite.** Folding both into one case would
  produce a fixture that tests neither cleanly. Recorded in TC-SEC-008's own Scope section rather
  than left implicit.
- **`errorText` on `diagnostics-notification` and `firmware-status-notification`.** Both declare
  `errorText` with **no `errorCode` anywhere in the message**, so they are not carrying the §1.3
  pair at all — there is no code for the name to be derived from and nothing for a client to match
  against. Their own valid vectors hold per-occurrence prose, and the firmware vector settles what
  the field is being used for: a value carrying two runtime SHA-256 digests cannot be a stable
  per-code name, and no registry entry could ever supply it. §1.3 has a field for exactly that text
  and it is `errorDescription`. Renaming is a breaking schema change and a naming decision the spec
  has to make, so both are left alone and both valid vectors still pass.
- **`httpStatus()` and `category()` model what the spec declines to define.** Enumerating both SDK
  registries against each other for the 0.9.0 SDK release turned up **51 of 114 codes disagreeing
  on `httpStatus`**, and the 5xxx category label differing outright. The cause both share: each
  accessor answers a question §4.4 says has no answer — *"the status is not a property of the
  code"* — and one code can honestly appear with more than one status (§2.4's own table lists
  `2008` under both 401 and 403, which no code→status function can represent). The open question is
  not which mapping is right but whether these accessors should exist, and if so whether each code
  declares its values in the registry instead of having them inferred by rule.

### Verification

**A — how the gap was found, and what it cost.** The premise is recorded in
`RECON-TRUST-ANCHOR-PRE-AMENDMENT.md` (R2a–R2d) and `AUDIT-BROKER-TRUST-ANCHOR.md`, whose ABSENT
verdicts were re-confirmed at HEAD before each amendment rather than inherited. Both documents live
in the reference server's repository, not this one — a cross-repository citation worth knowing about
if these commits are ever re-read. The decisive framing came from the conformance side: *no case
among the 29 asked a station to validate a broker certificate*, and the one whose title suggested it
tested the opposite direction. A requirement no test can express is a requirement no implementation
is ever asked to demonstrate.

**B — no safeguard is lost, and the claim is checkable.** OSPP has two counters and only one of them
ever worked. `txCounter` is generated by the **station** — the party a fraud control would be
auditing. `passCounter` is generated by the **app**, an independent party, and merely echoed by the
station into the signed receipt; a station cannot renumber a value it did not choose. Clone and
replay protection is carried entirely by the global `(offlinePassId, passCounter)` uniqueness
hard-gate (`reconciliation.md` §6.1 **check #13**, error `2005`) and by §7.4's cross-station
cumulative `maxUses` / `maxTotalCredits` factors — for the disjoint-counter-stream clone check #13
cannot see. **Neither reads `txCounter`, and neither is touched by this release.** The accurate
description of this change is not *"a safeguard is removed"* but *"a broken duplicate of a safeguard
that lives elsewhere and works is removed"*.

**B — precedent.** OCPP 1.6 §3.6 carried a normative chronological-ordering requirement; OCPP 2.0.1
deliberately removed it (*Part 2 Specification Ed2* §E.1.2 p.116; OCA whitepaper *"What is new in
OCPP 2.0.1"* v1.0 §2.3.4: *"The restriction that transaction-related messages be transmitted in
chronological order has also been lifted"*), keeping a per-transaction sequence number for
**reconstruction only**. OCPP has never used it to withhold settlement — in 2.0.1
`TransactionEventResponse` has no status field at all, so a CSMS cannot decline, hold or re-request a
transaction. This release makes the same trade: ordering guarantee out, counter retained as evidence.

**B — timing.** No firmware has implemented offline. Removing an obligation no implementer has met
costs nothing today and removes three items from their list — maintain a never-resetting global
counter across reboots and board swaps, transmit in strict counter order, and handle a fifth
response status with bespoke non-retry semantics.

**B — conformance.** `TC-OFF-003`'s gap-detection part, its Expected Result and its Failure
Criterion are deleted, and two criteria were rewritten from dead assertions into live ones: a
failure criterion for a rule that became a SHOULD asserted nothing, and now names the live defect
(**the server answering `Duplicate` on counter grounds**). A **positive** part replaces the deleted
negative one, in the same slot for a reason that is correctness rather than tidiness — the preceding
part leaves the wallet at `23.0` credits, so the new assertions read a positive balance rather than a
debt. It covers both a forward discontinuity and **the counter reset after a reboot**, then
re-sends the same `offlineTxId` so the change cannot be read as having weakened deduplication. A
second new criterion fails a server that accepts a discontinuity **silently**: recording the counter
without surfacing a discontinuity would make its retention a fiction.

**C — enforcement proven non-hollow.** The registry name is accepted; both the prose and the raw
validator diagnostic above are rejected. `reset-response-missing-required` was verified to fail
**only** on the missing `status` rather than incidentally on its `errorText`.

**Mechanical check.** `tools/verify-schemas.py` **306/306 PASS, 0 FAIL** — the same total as
`v0.8.1`, reached differently. The enum change's single downstream consequence was the positive
vector minted for `Deferred` in 0.5.0, which no longer validates; it is **deleted and replaced by
its inverse** under `invalid/`, so the count is preserved and the retirement is pinned. That
replacement was **falsified before being trusted**: re-adding `Deferred` to the enum makes the gate
fail by name (`schema accepted an invalid test vector`), then reverted. Deletion alone would have
left `305/305`.

**Not a gate.** `tools/validate-schemas.sh` (85 FAIL) and `tools/validate-examples.sh` (52 FAIL)
fail blanket because `npx ajv` is unavailable, **identically at `v0.8.1`** — verified against a
detached worktree, so `+0` differential. They look like gates and are not. `verify-schemas.py` is
the gate.

---

## [0.8.1] — 2026-07-28

> **§4.4's per-endpoint code lists were incomplete, and the table is now readable.** A
> correctness patch to the endpoint tables in `07-errors.md` §4.4. **No behaviour change, no
> schema change, no new or altered error code** — `spec/schemas/` is byte-identical to `v0.8.0`,
> so the SDKs re-pin `.spec-ref` without re-vendoring.

### Fixed

- **§4.4's session rows omitted the relayed failure domain.** `POST /sessions/start` and `POST /pay/{code}/start` dispatch **StartService [MSG-005]** and relay its outcome; `POST /sessions/{id}/stop` relays **StopService [MSG-006]**. Their rows listed only failures the *server* originates — 3–7 codes each — and omitted the action's own set from §4.1, including the `5000–5009` / `5111` hardware faults the station raises that reach the REST caller unchanged. `3004 INVALID_SERVICE` was absent from `/sessions/start` while the reference server emits it from exactly that path, and `3000 SESSION_GENERIC` appeared in **no** row in the table. Each session row is now the dispatched action's set from §4.1 plus the REST-specific codes, and the HTTP column is widened to match (`422`, `500`, `503`, `504` where the codes now listed require them).
- **Four codes reachable from every endpoint were repeated inconsistently or omitted.** `6004 VALIDATION_ERROR`, `6001 SERVER_INTERNAL_ERROR`, `6006 RATE_LIMIT_EXCEEDED` and `6007 SERVICE_DEGRADED` are properties of serving an HTTP request, not of any one endpoint. They are hoisted into a note at the head of §4.4 and removed from the rows, so a row now carries only what is **particular** to its endpoint. `6004`'s note records the one exception: an endpoint that registers its own schema-validation code, as `POST /api/v1/stations/provision` does with `4017`.

### Changed

- **§4.4 opens with a normative reading note.** Three points, stated before the table and referenced from its own header (`Particular Error Codes (+ the four universal codes above)`): a row is not the complete set; read each row as *its own codes plus the four*; and absence from a row is not a claim of unreachability. Placement is deliberate — the previous *What these lists are* paragraph sat **below** the table, where a reader who took a row at face value never reached it.

### Verification

Found by using §4.4 as a strict allowlist while scoping an SDK change, which immediately produced a false result: 15 codes carrying deliberate REST statuses in `ospp-sdk-php` would have been discarded, five of them (`3004`, `3008`, `3010`, `3012`, `3014`) reachable from endpoints §4.4 itself carries. Confirmed from the other direction by enumerating every `OsppErrorCode` the reference server emits from a REST controller and comparing against the table.

**How §4.4 should be read, for anyone revisiting earlier conclusions.** It is reliable in the **positive** direction — every code it names is genuinely reachable from that endpoint. It was **not** reliable in the **negative**: before 0.8.1, absence from a row did not mean a code was unreachable there. Any earlier reasoning that used "absent from §4.4" to conclude "not reachable over REST" was drawn against incomplete rows and should be re-checked. Reasoning that used §4.4 positively — including the REST-reachable set behind `ospp-sdk-php`'s `httpStatus()` arms — is unaffected.

**Limitations of the fix, stated rather than left to be discovered.** Both are reductions, not eliminations:

1. **The four universal codes are not machine-verifiable against a row.** They live in the note, not in the table, so a generator or conformance check that reads rows alone will under-approximate every endpoint by those four. The header cross-reference tells a *reader*; it does not tell a parser. A machine-readable form of §4.4 would need them expanded per row or expressed as a separate declared set.
2. **The note is still missable.** It is stated before the table and referenced from the header, which is the most discoverable placement available in prose — but a reader who scrolls to the table and reads one row can still take that row as complete. The previous placement (below the table) made this near-certain; this makes it unlikely. It does not make it impossible.

---

## [0.8.0] — 2026-07-28

> **BLE ships EXPERIMENTAL; the rest of 0.8 is stable.** The BLE transport, handshake and session
> carry three defects that make them unimplementable as written, and BLE is implemented nowhere —
> the reference server rejects the BLE key at provisioning, issues no `StationIdentity`, and no
> second implementation exercises the transport. Rather than design repairs against nothing to
> validate them, the BLE artefacts are **marked** and their blockers **declared**: `ble-transport.md`,
> `ble-handshake.md`, `ble-session.md`, `schemas/ble/` (15), Chapter 02 §8, ADR-002, and conformance
> cases TC-OFF-001 / TC-OFF-002. **Extended and Complete compliance cannot be claimed against 0.8**;
> Development and Standard are unaffected. The marking is per-document, **not** profile-wide: the
> Offline profile's MQTT half — `offline-pass.md`, `authorize-offline-pass.md`, `reconciliation.md` —
> is implemented and exercised against a second implementation, and marking it experimental would
> have declared running code provisional. The compliance ladder itself is **unchanged**; restructuring
> it belongs in the revision that implements BLE. The marking itself changes **no** schema — it is
> prose, headers and links only, and no BLE schema was edited to carry it. One schema did change
> elsewhere in this pass: `provisioning-request.schema.json`'s `receiptSigningPublicKey`
> **description** gained the forward-compatibility rationale below. It is a description string, so
> it changes no validation behaviour, but it does add to the re-vendor delta the SDKs already owe
> at the 0.8.0 lockstep tag (see the provisioning blockquote below, which lists the others).

> **Configuration vocabulary alignment.** Reconciles the `08-configuration.md` catalog with the keys the SDKs and server actually implement: removes 12 configuration keys that were documented but never wired to any behaviour, corrects the defaults/ranges of 4 surviving keys to their canonical values, and relaxes the web-payment / idempotency token format from "UUID v4" to any RFC 4122 UUID. Configuration-key total drops **41 → 29**. The wire `protocolVersion` field is **unchanged at `0.2.1`**, no message schema changes, and `spec/schemas/` is byte-identical (`verify-schemas.py` stays `306/306`).

> **Provisioning idempotency & station identity.** Splits the provisioning-retry rule so that descriptive body drift stays ignored while **public-key** drift — a different key, or a change in which key kinds are present — is rejected instead of silently replayed (new `4015 PROVISIONING_KEY_MISMATCH`, HTTP `409`); redefines a **Station** as a *logical* installation whose `stationId` outlives the hardware serving it; defines **re-provisioning** as a supported flow; **bounds** how many certificates may be valid at once; and defines **one canonical flat REST error envelope**. Driven by a production incident: a station re-provisioned six times over three days with a fresh keypair each time and received `200 OK` every time, carrying the certificate issued to an *earlier* key — a failure the requester had no way to detect. `verify-schemas.py` stays `306/306` and the wire `protocolVersion` stays `0.2.1`, but `spec/schemas/` is **no longer byte-identical** to the vendored SDK copies — description strings changed in `provisioning-request`, `provisioning-response` and `common/receipt`, and `provisioning-request.schema.json` is new (see *Changed*), so `ospp-sdk-php` and `sdk-ts` require a re-vendor at the 0.8.0 lockstep tag. One REST response body changes shape (error bodies only — success bodies are untouched).

### Added

- **Release-status statements at both entry points** (`README.md`, `spec/README.md`). Name what is stable — MQTT station↔server, HTTPS provisioning, offline reconciliation, each implemented and exercised against a second implementation — and what is not. The three BLE blockers are named inline at each entry point, each linking to its full statement in `KNOWN-ISSUES.md`, so the marking declares the defects rather than concealing them. Chapter 02's row in the reading-guide chapter table points at **B-1** specifically, because BLE material is not contained to the offline profile: §8.6 is one of the two conflicting fragmentation definitions.
- **The three BLE blockers recorded** (`KNOWN-ISSUES.md`). **B-1** — `02-transport.md` §8.6 and `profiles/offline/ble-transport.md` §11 both define BLE fragmentation as a MUST and disagree on header encoding (printable `{F:M/N}` vs 3 binary bytes), numbering base (1 vs 0), terminator, and whether the 5 s timeout runs from the previous fragment or the first; nothing ranks them. **B-2** — validation check 5 and `TC-OFF-002` steps 17-19 both require a station-scoped OfflinePass, but `offline-pass.schema.json` has no member that can carry the constraint and is closed at both levels; this bites on the BLE path only, since on MQTT the constraint is server-side state and not a wire field (`authorize-offline-pass.md` §4). **B-3** — the three BLE response schemas define rejections three different ways, none matching `07-errors.md` §2.3's nested seven-field `error` object, and `stop-service-response.schema.json` declares no error member at all while `ble-session.md` §3 mandates a `Rejected` reply on an unknown `sessionId`.

- **`4015 PROVISIONING_KEY_MISMATCH`** (`07-errors.md` §3.4, sub-block "4.01x — Certificate Management Errors"). Severity `Error`, `recoverable: false`, HTTP **`409 Conflict`**. Placed in the 4xxx range because §1.1 already assigns "certificate management" there and the code's closest sibling is `4010 CSR_INVALID` — deliberately **not** 400, whose documented station action ("regenerate keys, retry") would loop forever on this error. `07-errors.md` §4.4 also gains the `POST /api/v1/stations/provision` row it never had.
- **Optional `keyId` on the receipt envelope** (`schemas/common/receipt.schema.json`). A disambiguation hint for the receipt-signing key, placed **outside** the signed `data` so it changes no signed field and invalidates no existing signature. Construction is pinned exactly — DER `SubjectPublicKeyInfo` (RFC 5280 §4.1.2.7, the full SEQUENCE including the AlgorithmIdentifier) → SHA-256 → first 16 bytes → base64url (RFC 4648 §5) unpadded → exactly 22 characters, compared by exact string equality. An explicit note disclaims **RFC 7638**, which hashes canonical JWK JSON and yields a different digest for the same key. Critically, `keyId` **MUST NOT** select the key or widen the candidate set: the server selects from the server-authoritative anchor first and **rejects** on disagreement — a `keyId` that could steer selection would hand an attacker the same key-nomination attack as a forged timestamp. Emission is specified too: **OPTIONAL**, and a station **SHOULD** emit it once it has been re-provisioned at least once — the only condition under which the server can hold more than one retained key for it, and one the station can actually observe. A server **MUST NOT** require it or reject a receipt for omitting it. Without a producer rule nothing was ever obliged to emit it, so the disambiguation the field exists to provide was not obtainable in practice. Added now because the schemas are closed (`additionalProperties: false`) with no minor-version negotiation, making a later addition a coordinated fleet upgrade; receipts are not yet implemented on the station side, so today it costs nothing.
- **Absent capability semantics** (`profiles/core/boot-notification.md` §5.1). A capability omitted from the BootNotification `capabilities` object is **NOT STATED**, not `false`: `true` records a declared positive, `false` a declared negative, and absence the absence of information. A server **MUST NOT** overwrite a previously declared value with an absent one, and **MAY** treat not-stated as unsupported for *withholding* commands (consistent with [Profiles §3](spec/profiles/README.md)) but **MUST NOT** persist it as a declared `false`. Stated over the whole object, so it governs `bleSupported`, `offlineModeSupported`, `meterValuesSupported` and anything added later. Rationale: a boot **reports**; it does not rewrite authoritative state — under the coerce-to-`false` reading a station that declared a capability once is silently downgraded by any later boot omitting it, and where that capability gates remote management the downgrade removes the channel that could repair it. Capability *negotiation* remains explicitly out of scope.
- **`4016 PROVISIONING_KEY_REUSE`** (`07-errors.md` §3.4). Severity `Error`, `recoverable: **true**`, HTTP **`422 Unprocessable Entity`**. Emitted when a provisioning request submits the same public key for two roles. Covers **all three** pairwise collisions among the `tlsCsr` subject key, `receiptSigningPublicKey`, and (BLE stations) `stationPubKey`. Distinct in class from `4015`, which is a state *conflict* with an existing binding (`409`); this is a request unprocessable on its own terms, whichever provision it arrives on (`422`). Uniquely among the three provisioning codes it is **recoverable**: the caller fixes it by generating a separate key pair, and because the token is consumed only on success, the rejection does not burn it.
- **`2019 PROVISIONING_TOKEN_INVALID`** (`07-errors.md` §3.2). Severity `Error`, `recoverable: false`, HTTP **`401 Unauthorized`**. Closes a gap this amendment itself opened: §2.4 now makes a machine-readable `errorCode` mandatory on every REST error, and the provisioning `401` — documented since 0.7.0 for an expired / superseded / revoked token — had **no registered code at all**. A sweep of every other REST error condition in the spec found no second instance (`429` → `6006`; expired/revoked access and refresh tokens → `2009`/`2010`). Placed in 2xxx rather than 4xxx on the registry's own precedent: §3.2 is credential validation, §2.4 maps `401` to 2xxx, and the token pairs `2009`/`2010` (JWT) and `2011`/`2012` (session token) are its siblings — whereas `4015` is certificate management. Registered as **one** code rather than an EXPIRED/INVALID pair, because all three causes are terminal for the token and share one recovery; the discriminator rides in `details.reason`. Precedence pinned: `2019` is evaluated **first** of the three provisioning errors, before the request body is examined at all, so `4016` and `4015` are reachable only on an otherwise-valid token (see *Provisioning error precedence* under **Changed**). Standard-code total **106 → 110** (see *Fixed* — one of those four is a pre-existing miscount).
- **Re-provisioning defined** (`04-flows.md` §2, "Re-provisioning an already provisioned station"). Previously referenced from three places (`reset.md` §5, `06-security.md` §4.7.3, `certificate-renewal.md` §4.7.3 table) and defined in none. States when it applies and its preconditions: a **new** token (a consumed one **MUST NOT** be reused), an **unchanged** `stationId`, and deliberate operator initiation. The three dangling references now link to it.
- **Certificate multiplicity bound** (`06-security.md` §4.7.6). At most **one CURRENT plus one PREVIOUS** certificate valid simultaneously; PREVIOUS is discarded once CURRENT has been proven on a TLS connection; a new issuance retires any retained PREVIOUS first. Stated **per certificate type**, because `StationCertificate` / `MQTTClientCertificate` (`certificate-renewal.md` §2) and the BLE StationIdentity certificate (§6.5.2, which has its own overlap window) would each have contradicted a flat ceiling.
- **Hardware-replacement cross-reference** (`01-architecture.md` §7.6). The board-swap rule was normative only inside the offline profile (`reconciliation.md` §9) and invisible from the lifecycle chapter. Referenced, deliberately not restated.
- **`4017 PROVISIONING_REQUEST_INVALID`** (`07-errors.md` §3.4, sub-block "4.01x — Certificate Management Errors"). Severity `Error`, `recoverable: true`, HTTP **`400 Bad Request`**. Closes the second gap this amendment opened itself, the same shape as the `2019` gap: §2.4 now makes a machine-readable `errorCode` **REQUIRED** on every REST error, and §4.4's row for `POST /api/v1/stations/provision` listed only `2019`, `4010`, `4015`, `4016` — so a schema-validation failure on that endpoint (a required property absent, a pattern violated) had **no registered code at all**. Neither existing candidate fits: `1005 INVALID_MESSAGE_FORMAT` is Protocol-tier and envelope-scoped, and no REST endpoint in §4.4 carries a `1xxx` code; `3015 PAYLOAD_INVALID` is explicitly scoped to bodies that are "structurally valid JSON but contain semantically invalid values", which a missing required property is not, and it is filed under Session & Bay. Placed in `4.01x` by the same reasoning used for `2019` — with the codes it is reachable alongside, in the Application tier, since the message was received and understood but the operation could not be completed. Its recommended action is safe on a consumed token: correct the body and resubmit on the **same** token, and do **not** regenerate keys.
- **Recommended actions must hold on every path a code is reachable from** (`07-errors.md` §1.4, new paragraph block; `details` row of §1.3 reconciled). §1.4 made the registry's *Recommended Action* a mandatory verbatim wire value, but nothing required that value to be correct on more than one of the paths a code is reachable from — and §4's tables show many codes reachable from several. The rule now states it: a `recommendedAction` **MUST** be correct in every context the code is reachable from (§4); a code reachable from two paths whose safe recovery differs **MUST** either be split into two codes or state its branches and name the `details` member that selects them, which the emitter **MUST** then carry; a branching entry is emitted **in full**, since emitting only the selected branch would break §1.4's own rule that two errors with the same code carry the same `recommendedAction`. The load-bearing clause is the last: where branches disagree on safety, the entry **MUST** name the branch assumed when the discriminator is absent, and that default **MUST** be the one whose failure mode is recoverable — so an emitter that omits the field costs a wasted round trip, never an unrecoverable state. This does **not** make `details` mandatory in general: §1.3 keeps it OPTIONAL, and the requirement is conditional and code-scoped, stated on the branching code's own registry row.
- **Canonical flat REST error envelope** (`07-errors.md` §2.4). The Error Object **is** the top-level response body: no wrapper, no sibling members, extra context in the object's own `details`. The field set was already normative and already flat (§1.3 — "Every error … MUST include the following fields"); only the *envelope* was undefined, having appeared nested by example alone with no RFC 2119 keyword. MQTT (§2.1) and BLE (§2.3) nesting is unchanged — each nests because its body carries other members; a REST body carries only the error.

- **`4018 PROVISIONING_TOKEN_CONSUMED`** (`07-errors.md` §3.4, sub-block "4.01x — Certificate Management Errors"). Severity `Error`, `recoverable: true`, HTTP **`409 Conflict`**. Closes the third gap of the same shape as `2019` and `4017`: §2.4 requires a machine-readable `errorCode` on every REST error, and three provisioning-token states carried none — the reference server answered them `422` with an endpoint-local string and no code. `2019` does not cover them and could not be stretched to: it enumerates exactly three causes and calls them terminal, and it is a `401`, whereas these tokens **authenticate successfully** and fail on state the requester cannot see. Placed at `409` in 4xxx on the chapter's own dividing line rather than by resemblance — §2.4 maps `409` to 4xxx, `4015` is its sibling there, and the precedence rationale already distinguishes a defect "visible without reference to any stored state" (`4016`, `422`) from one that "depends on state the requester cannot see" (`4015`, `409`). §1.1's tiers agree: a failed credential is Protocol-tier 2xxx, whereas "received and understood, but the operation could not be completed" is Application-tier 4xxx. Registered as **one** branching code, since the two causes share a wire position but not a recovery: `already_consumed` is a **transient** race — once the winning request writes its certificate the same request replays it — and `consumed_without_certificate` is terminal. Per §1.4 the absent-discriminator default is `already_consumed`, the recoverable branch, and **neither** branch permits regenerating a key, which is the only move that could convert this into an unrecoverable `4015`.
- **`4019 PUBLIC_KEY_INVALID`** (`07-errors.md` §3.4, same sub-block). Severity `Error`, `recoverable: true`, HTTP **`400 Bad Request`**. The bare-key counterpart of `4010`, covering a submitted `receiptSigningPublicKey` or `stationPubKey` that does not decode or is not an ECDSA P-256 key. `400` rather than `422` by symmetry, which is the decisive argument: `4010` already places the *identical* defect at `400` when the key arrives inside the `tlsCsr`, and one request carrying a P-384 CSR key and a P-384 receipt key must not be answered `400` for one and `422` for the other. Schema validation does not subsume it — `provisioning-request.schema.json` constrains the PEM armour, and `common/ec-public-key.schema.json` the SEC1 length and alphabet, but neither the DER body, the SEC1 prefix, nor whether the point is on the curve — so such a key passes `4017` and fails here. Branches on `details.phase` for the same reason as `4010` and `4016`, defaulting to `retry`.
- **`TC-SEC-006 — Bare Public Key Validity & Precedence at Provisioning`** (`conformance/test-cases/security/`). Server-side case for `4019`. Its subject is the **precedence position**, not merely the code: Part D asserts `4010` wins over `4019`, Part E that `4019` wins over `4016`, and Part F that `4019` wins over `4015` while `details.phase` inverts to `retry`. Nothing exercised the bare-key path before. The file also records, with reasons, **why `4018` gets no companion case** — one branch is a race a harness cannot provoke deterministically and the other is a partial-commit database state the protocol cannot legitimately create — so it is not added later as a flaky one.

### Changed

- **§4.4's per-endpoint lists are what the specification *models*, not what a server may emit** (`07-errors.md` §4.4). Closes the gap that forced the reference implementation to diverge: an in-scope endpoint could not answer `503` + `Retry-After` for a transient, operator-fixable failure without contradicting the enumeration, and downgrading to `500` discards information the station acts on — `500` says back off, `503` + `Retry-After` says when. The premise that forced the choice was false: §2.4's table is headed *Typical Error Codes*, never lists `6007`, and **no registry row carries an HTTP status column** — the "`6007` maps to 500" constraint came from SDK defaults, not from this specification. So the fix needs no new code and no per-code status variance. Two obligations now apply outside the lists: the body **MUST** still be the Error Object with the closest registry code (§2.4's `errorCode` requirement is not relaxed — an unmodelled *status* never licenses an unmodelled *body*), and the status **MUST** be the true one, never downgraded to match the list. `6007` + `503` + `Retry-After` is the worked example and is now **required** rather than tolerated. `413` and maintenance windows stay deliberately unmodelled, with §4.4 stating that a server answering them is not thereby non-conforming.
- **`receiptSigningPublicKey` states why it is required of every station** (`04-flows.md` §2; `provisioning-request.schema.json`). It is REQUIRED of every station and its purpose — offline receipt signatures — belongs to a profile no station must implement, which reads as the online path depending on the offline one and becomes a live question once part of the offline surface is marked experimental. It is neither. Provisioning is the only moment the server can bind a key under a single-use token; the key set is frozen when the token is consumed, so a station that later gains offline capability cannot add a key without a new provisioning cycle on hardware already in the field. Unconditional costs one secure-element slot and one keygen on a station that never uses it; conditional costs a re-provision on every station that ever does. Declared in both places an implementer reads, with the contrast to the BLE key — which **is** conditional on `bleSupported` — and the reason for the asymmetry: a missing BLE key fails a handshake immediately, an unusable receipt key fails at reconciliation days later, when the transactions it protected are already spent.
- **`TC-SEC-002` step 33 scoped to BLE-declaring stations** (`conformance/README.md` §2.2). The step required a station holding an expired certificate to enter "offline-only BLE mode" per the `1004` `expired` branch, making a mandatory compliance level depend on the experimental surface. The `1004` row carries two obligations and only one is BLE: the **negative** obligations — never enter provisioning mode, never discard or overwrite stored credentials, stay off the broker, await server-triggered renewal — are what the case exists to prove and are observable on any station. Entering BLE mode is what a station *with* BLE does instead of provisioning; it is the alternative occupying the station, not the property under test. The BLE clause now applies only where `bleSupported` is declared and is recorded as skipped otherwise; the negative obligations are asserted on every station and are not waived. `TC-TX-006` needed no such treatment and stays Standard unqualified — it is entirely offline, but offline *reconciliation*, which runs over MQTT against an implemented and exercised path.
- **Three stale version headers corrected to 0.8.0** — `examples/README.md` (0.2.4), `conformance/README.md` (0.5.0), `schemas/README.md` (0.2.5). `KNOWN-ISSUES.md`'s header read "Protocol Version 0.2.4 / All issues resolved" over a zero-count table while four issues were open below it. Counts were re-derived from the artefacts rather than incremented and all agree with what the documents claim: 85 schemas (21 common + 47 mqtt + 15 ble + 2 root), 114 error codes with per-range 15/20/17/20/34/8, Appendix A set-identical to §3, 29 configuration keys, 27 MQTT actions + 13 BLE message types = 40 messages, 5 profiles, 28 conformance cases. Every internal anchor across 114 markdown files resolves.

- **12 unused configuration keys** deleted from `08-configuration.md` and every dangling reference across the spec chapters, conformance test cases, and implementor's guide: `SecurityProfile`; the eight BLE keys `BLEAdvertisingEnabled`, `BLEAdvertisingInterval`, `BLETxPower`, `MaxConcurrentBLEConnections`, `BLEConnectionTimeout`, `BLEMTUPreferred`, `BLEStatusInterval`, `BLEMaxRetries`; `Locale`; `StatusNotificationInterval`; and `EventThrottleSeconds`. None of these keys drove any specified behaviour — the prose that referenced them (BLE advertising/TX-power conditionals, StatusNotification throttling and periodic triggers, station locale, the active security profile) is reworded or dropped so the surviving text stands on its own; worked configuration examples that used a removed key now use a surviving key (`OfflineModeEnabled`, `MeterValuesInterval`). Config-key total: **41 → 29** (Core 12 → 9, Security 6, Offline/BLE 12 → 4, Transaction 6, Device Management 4).

- **Four surviving config-key defaults/ranges corrected** to the canonical values shared by the spec, `sdk-ts`, and `ospp-sdk-php`: `HeartbeatIntervalSeconds` range floor raised to **30** (30–3600); `MeterValuesInterval` default **60**, range **10–3600**; `MaxSessionDurationSeconds` default **900**, range **60–3600**; `ReservationDefaultTTL` default **300** (range 60–1800).
- **Token format relaxed from "UUID v4" to any RFC 4122 UUID** in the web-payment session-token and idempotency-key prose (`02-transport.md`, `06-security.md`, `07-errors.md`, `04-flows.md`), matching the already-relaxed normative statements — any RFC 4122 version is accepted; any "122 bits of entropy" / RECOMMENDED nuance stated elsewhere is unchanged.
- **Per-service-kind settlement clause** added to `04-flows.md` §6: `UserDuration` settles pro-rata on elapsed time, `FixedDuration` bills the full authorized amount, `MultiUnit` settles per delivered unit, and `Fault` yields a full refund.
- Version cascade `0.7.0 → 0.8.0` across the remaining spec document headers, the root `README` badge, and `package.json`'s `@ospp/protocol` dependency (`^0.7.0` → `^0.8.0`). The wire `protocolVersion` field stays `0.2.1`.
- **Provisioning-retry idempotency split (BREAKING for server implementations)** — `04-flows.md` §2. Descriptive drift (`serialNumber`, `bayCount`) **MUST** still be ignored, unchanged. A retry presenting a **different public key** than the one bound to the already-issued certificate **MUST NOT** be replayed: it is rejected with `409` / `4015`, and no second certificate is minted. Same keys → replay, byte-identical certificate, unchanged. Applies to every key kind in the **bound set** — `tlsCsr`, `receiptSigningPublicKey`, and (BLE stations only) the static BLE ECDH key — because the token binds the station's *complete* provisioned identity; ignoring drift in any one of the three yields the same undetectable failure, respectively a dead mTLS connection, offline receipts that fail at reconciliation days later, and a BLE handshake whose ECDH never reproduces. The comparison is **per key kind, against the bound set**: a retry is a replay only if it presents the same set of key kinds, each carrying the same key. A key kind absent from **both** the bound set and the retry is never compared — a station declaring `capabilities.bleSupported: false` submits no BLE key at first provision and none on retry — but absence on one side only is drift. A **change** in the set between provision and retry is itself drift, in both directions — a key kind added asks to be certified for a broader identity than the token bound, one dropped presents a narrower one — and both are rejected with `409` / `4015`. Retention is scoped to the token's **TTL**, not to Transport §9.3's generic ≥ 24 h floor: production issues 7-day tokens, so the old wording left retries permitted but undecidable between hour 24 and expiry. The fixed "24-hour TTL" is genericised throughout — the TTL is set at issuance and is deployment policy, not a protocol constant. Flow §2's postconditions now also state what provisioning persists — including the retention obligation the rule implies: the server **MUST** retain every submitted public key bound to the consumed token, since that binding is what a retry is compared against. Comparison is on the **decoded** key — for the CSR, the DER `SubjectPublicKeyInfo`, **not** raw CSR bytes, since ECDSA signatures are randomised and two honest CSRs for the same key differ byte-wise. `02-transport.md` §9.3 reconciled: the token alone is no longer the whole idempotency key.
- **Provisioning error precedence ordered — `2019` → `4016` → `4015`** (`04-flows.md` §2, "Error precedence"). §2 ordered token validity before the key comparison but never placed `4016`, so a request failing two checks had no defined answer: a retry on a still-valid token whose `tlsCsr` subject key equalled its `receiptSigningPublicKey` satisfied both `4016` and `4015`, which differ in `recoverable` (`true` vs `false`) and in whether the token survives — so the choice changed what the station does next. The order is now normative: **token validity**, then the request's own **self-consistency**, then **comparison against the bound set**. An invalid token fails fast with the only answer that helps, and no key comparison could change it. Reused keys are a defect visible without reference to any stored state, and since a `4016` rejection neither consumes the token nor creates a binding, the station is told the one thing it can act on while the token is still usable. `4015` is last because it alone depends on state the requester cannot see, and its recovery — obtain a new token — is the most expensive of the three. The `2019`, `4015` and `4016` registry rows cross-reference the ordering.
- **`recommendedAction` bound to the registry; `errorDescription` pinned as per-occurrence** (`07-errors.md` §1.4, new). This amendment exists because a missing recovery action cost a firmware developer three days — yet `recommendedAction` was REQUIRED as a *field* and bound to nothing. §1.3 said only "Suggested corrective action for the receiver", and no passage tied the value to the §3 registry, so a server emitting four generic strings keyed off `severity` was fully conformant; `TC-SEC-005` stubs the field as `<human-readable>`, so conformance would not have caught it either. The amendment did not mandate the thing it was written to deliver. Now `recommendedAction` is per-**code** and **MUST** carry the registry's *Recommended Action* for that `errorCode`: two errors with the same code carry the same value, a `severity`-derived placeholder is non-conforming, a multi-party cell (`Station: … Operator: …`) **MUST** preserve the part addressed to the receiver, and translating or shortening is permitted only if the corrective action itself survives. `errorDescription` is the opposite — per-**occurrence**, naming the bay, field, threshold or identifier involved — and the registry's *Description* column is **guidance for what to write, never the value to emit**. That second half also closes a generator trap: Appendix C bounds `errorDescription` at 500 characters, and two registry Description cells exceeded it, so a generator emitting cells verbatim would have produced schema-invalid output for exactly the codes this cycle adds.
- **What a replay returns, field by field** (`04-flows.md` §2, "What a replay returns"; `provisioning-response.schema.json`). The rule said "the byte-identical certificate" and was silent on the other eight response fields. Generalising byte-identity to the whole response would have been worse: five of the nine carry trust anchors and connection parameters, and a token's TTL is fixed at issuance and may be days, so a legitimate replay can arrive after a CA rotation, a broker migration, or a server signing-key rotation (§6.7). Freezing those would hand the station a trust anchor that no longer validates, a broker address that no longer answers, or a verify key that cannot check the next OfflinePass — each unrecoverable **in band**, because the station needs a working connection before it can be told anything else. Every property of the response schema is now assigned: **byte-identical** — `stationId`, `bayIds`, `clientCert`, `stationIdentity`; **current server state** — `stationCaChain`, `brokerRootCa`, `rootCaThumbprint`, `serverVerifyKey`, `mqttConfig`. The response **MUST** be schema-valid either way, and interdependent fields **MUST** be mutually consistent within the one response: a rotated `stationCaChain` carries its matching `rootCaThumbprint`, never the superseded one.
- **Stations MUST re-persist the response on a replay (BREAKING for stations).** `04-flows.md` §2 Postconditions, "Persisting the response". The server-side replay rule above achieves nothing on its own — a station that persists once and ignores the body of a replay keeps precisely the stale CA chain the rule exists to prevent. The Postconditions table listed what NVS *contains*, a state inventory, with no obligation to replace previously stored values and no mention of replays. The station now **MUST** persist `stationCaChain`, `brokerRootCa`, `rootCaThumbprint`, `serverVerifyKey` and `mqttConfig` **exactly as received**, replacing what it holds, on **every** successful response **including a replay of an already-completed provision** — called out explicitly because that is the case firmware skips, having already provisioned. Re-persisting the identity fields is a no-op on a replay; the trust and configuration fields are the reason the body must be read.
- **A superseded provisioning token is invalid immediately** (`04-flows.md` §2). §2 made a token superseded by a re-issuance for the same station invalid for **all** purposes (`401` / `2019`), while the re-provisioning preconditions said presenting a consumed token yields "either a replay (which returns that same certificate) or a key mismatch" — `200` or `409`. Since re-provisioning **requires** minting a new token, and minting supersedes, both statements applied to the same request and disagreed on its answer. The `401` wins: issuing the new token supersedes the old one, which is thereafter rejected `401` / `2019` with `details.reason: superseded` — not replayed, not compared. The retention **MUST** was re-read in this light and holds, with one addition: supersession does not shorten the retention floor, and retention cannot be made conditional on supersession not having happened, since it may occur at any point in a token's TTL.
- **Station redefined as a logical installation** — `glossary.md`, `01-architecture.md` §1 + §2.1, `guides/implementors-guide.md`. A Station is a service installation identified by a **stable `stationId`**; the hardware serving it (`serialNumber`, `stationModel`, `stationVendor`) **MAY** change without changing the `stationId`. The former "physical installation" wording contradicted both the flows (the server allocates `stationId` at registration, before hardware exists) and the offline profile (`stationId` stable across a board swap). `reconciliation.md` §9's rubric "Use hardware serial number for identity" is reworded to "Treat a serial-number change as a hardware swap, not a new station" — its normative **MUST** is untouched.
- **Station mTLS key and receipt-signing key MUST be distinct (BREAKING for stations).** `06-security.md` §4.3 carried ONE inventory entry, "Station ECDSA P-256 Key (mTLS + Receipt signing)", whose Distribution row said the provisioning-submitted public key was "also used as TLS client cert" — while Flow §2 generates two key pairs and the request carries two independent fields. Flow §2 was correct; the inventory was stale (and duplicated the mTLS key, which it also described separately as "Station TLS Key Pair"). Split into **Station mTLS Client Key Pair** (submitted inside the CSR, which proves possession; certified as the X.509 client certificate) and **Station Receipt-Signing Key Pair** (submitted as a bare public key, never certified), each with its own generation / distribution / storage / lifetime / rotation rows. Rationale for distinctness: a signed receipt must remain verifiable after the TLS certificate is rotated or revoked, and a TLS key compromise **MUST NOT** retroactively make every historical receipt forgeable — sharing one key ties a multi-year audit concern to a credential rotated annually and revoked on demand. Distinctness is a conformance requirement on the **station** (both key pairs are generated on-device) but is **enforced at the server**, which **MUST reject** identical keys with `422` / `4016 PROVISIONING_KEY_REUSE` and issue no certificate. A `MAY` was considered and rejected: an unenforced key-separation rule is decorative, the check costs the server nothing, and rejecting fails closed so no non-conformant station enters the fleet. The token is **not** consumed by the rejection, so a corrected station retries on the same token. No grace period and no migration path are written into the protocol — when a deployment starts enforcing is a rollout decision. **Historical retention:** the server **MUST** retain *every* receipt-signing key it has bound to a station, with each key's validity window, and verify a receipt against the key current **when it was signed** — the reference implementation overwrites the key in place on every re-provision, so receipts signed under a superseded key are already unverifiable. Receipt-key **rotation** has no in-band path at all and is stated as a known limitation with its consequences, rather than left silent or invented. BLE key separation (§6.5.2) is unchanged and explicitly the different, stronger rule; its "mTLS/receipt key" singular is reworded to name both ECDSA keys, in prose and in `schemas/ble/station-identity.schema.json`. Swept: §4.2's PKI table said the station certificate covers "mTLS authentication + receipt signing" (it certifies the mTLS key only); §6.2, `reconciliation.md` §6 and the implementor's guide now name the **receipt-signing** key at the verification lookup; `conformance/test-keys/README.md` described the receipt key but claimed its CSR is signed by the Station CA. **Extended to all three pairs:** the code, the server-side check and both Appendix A checklist items originally named only the `tlsCsr`/`receiptSigningPublicKey` collision, while §4.3 already stated the signing-vs-key-agreement prohibition applies to all three station keys — so a point submitted as both the CSR subject key and `stationPubKey` violated a **MUST** with no code and no check. `4016` now covers all three pairwise collisions, compared on **decoded** keys: the BLE key arrives compressed SEC1 Base64 while the ECDSA keys are DER/PEM, so an encoding-level check would miss exactly the two new pairs. The check text itself was also unexecutable — it compared the CSR's **DER** `SubjectPublicKeyInfo` against the PEM-encoded `receiptSigningPublicKey`, which can never match, making a fail-closed rule silently fail open.
- **Receipt-key selection bound to a server-authoritative anchor** (`06-security.md` §4.3). Tightens the historical-retention rule: the candidate key set **MUST** derive from a server-authoritative anchor and **MUST** be bounded by it. A station-supplied timestamp — including `startedAt`/`endedAt`, which arrive on an envelope whose signature has *not yet been verified* — **MUST NOT** determine which key verifies a signature, and the server **MUST NOT** try every retained key (try-all would make every superseded key permanently valid). Anchors: the **OfflinePass's own validity window** for the pass form, the server-issued authorization record for the auth form. The two procedures that implement this — `06-security.md` §6.2 step 1 and `reconciliation.md` §5 step 1 — were still describing a single-key lookup and now describe anchor-bound selection.
- **Provisioning request body corrected** — `04-flows.md` §2 sequence diagram and Happy Path steps 5–7 omitted the **static BLE ECDH public key**, which `06-security.md` §6.5.2 already states normatively is submitted "alongside its TLS CSR" and is what the server signs the StationIdentity certificate over. The two chapters disagreed about the request's contents; now they agree.

- **Provisioning error precedence: five steps → seven** (`04-flows.md` §2, *Error precedence*). The chain had a decodability step for the `tlsCsr` and none for the **bare** keys, while the very next step compares all three kinds **decoded**. `06-security.md` §4.3 already mandates that decode ("decode each submitted key and compare the decoded values"), so the operation was required and its failure had no code and no position. New **step 5**, *Submitted public key validity*, sits after CSR decodability and before both key comparisons — after, because the `tlsCsr` carries the identity being certified, so where both are unusable the answer names the credential rather than an attribute of it; before, for exactly the reason step 4 precedes them, that an undecodable key makes `4016` and `4015` undecidable rather than merely unequal. A merged "all key material" step was rejected: it cannot answer the tie between an undecodable CSR and a P-384 receipt key, and the chain's own rule ("answered by the **first** that applies") requires that order be stated rather than left to implementations. New **step 3**, *Token state*, gives `4018` its position — after authentication, before any key is read. Steps renumbered accordingly; the "order is not arbitrary" rationale and the §2 Error Paths table follow.
- **`2019 PROVISIONING_TOKEN_INVALID` gains `not_found`** (`07-errors.md` §3.2; `04-flows.md` §2). A token that does not resolve to one bound to the requested station now answers `2019` / `401`, and `details.reason` extends to `not_found`, `expired`, `superseded`, `revoked`; "All three are terminal" becomes "All four". Two reasons, and the second is decisive. On the merits a token that does not resolve is a **failed credential**, not a state conflict — it never authenticated, so it is Protocol-tier and belongs with the three causes that share its recovery word for word. And a status that separated an unknown token from a known-but-dead one would let an unauthenticated caller use the endpoint as an **existence oracle** for token values. This is a firmware-visible change on one reason of one endpoint — the reference server answered `422` — and it ships in the same grouped message as `4010`'s `422 → 400`.
- **`details.phase` is carried by three codes, not two** (`04-flows.md` §2; `07-errors.md` §1.4). `4019` joins `4010` and `4016`: it too is reachable before and after the token has issued a certificate, with opposite safe recoveries, and defaults to `retry`. The prose that enumerated "both `4010` and `4016`" is corrected in all three places it appeared.
- **Appendix C gains conditional blocks for `4018` and `4019`** (`07-errors.md`). Required by the appendix's own rule — "Any entry that gains a branch MUST gain a block here in the same change, or the discriminator it declares is unenforced". `4018` requires `details.reason` within `already_consumed` / `consumed_without_certificate`; `4019` requires `details.phase` within `first-provision` / `retry`, with `renewal` **excluded**, since renewal submits no bare key. The branching-entry count in the closing note goes three → five, with a note that `2019`'s `details.reason` is a SHOULD rather than a branch — its four causes share one recovery, so there is nothing to select between.
- **Counts** (`07-errors.md` §1.1 total and range table, Appendix A, `README.md` ×3). Standard-code total **111 → 113**; the 4xxx range row **17 → 19**. Appendix A gains both rows and remains set-identical to §3.
- **`07-errors.md` §4.4** — the `POST /api/v1/stations/provision` row gains `4018` and `4019`. Its status list is unchanged: `400`, `401`, `409` and `422` already covered both.
- **The `4.01x` decade is now full.** `4010`–`4019` are all assigned, and a note in §3.4 records that a further certificate- or provisioning-management code needs a new `4.02x` heading rather than a silent spill past `4019` — the heading is what carries the grouping.

### Fixed

- **Error-code count off-by-one (pre-existing).** `07-errors.md` §1.1's range table gave 2xxx as **18**, but the registry holds `2000`–`2018` = **19**, so the stated "Total: 106" was already wrong before this amendment — the true pre-amendment total was **107**, independently corroborated by the `ospp/protocol` SDK enum docblock, which already said 107. Corrected alongside the 4xxx and 2xxx increments: range-table sum, stated total, registry, and Appendix A now all agree at **111**, with Appendix A set-identical to the registry.
- **`06-security.md` §6.7's rotation audit step was unexecutable.** Step 5 instructed the server to verify server-key rollout "via GetConfiguration [MSG-014]", but `OfflinePassPublicKey` is **WriteOnly** and `08-configuration.md` §2 forbids returning WriteOnly keys in a GetConfiguration response — deliberately, so credentials cannot be harvested from a config dump. Replaced with the ChangeConfiguration [MSG-013] RESPONSE the server actually receives per station, plus the safety consequence: a station that is offline or unanswered counts as not updated, and the old key **MUST NOT** be revoked while such a station may still hold passes signed under it. Pre-existing, unrelated to provisioning; found while scoping receipt-key rotation against this precedent.
- **The message catalogue was missing a message, so every count derived from it was wrong.** `03-messages.md`'s MQTT index claimed "26 actions" and omitted **SessionEnded**, which §5.4 defines in full as `Transport: MQTT`, EVENT, with its own schema. The omission also shifted two anchors — ConnectionLost pointed at `#54` (SessionEnded) and SecurityEvent at `#55` (ConnectionLost). True counts, corroborated three ways (40 message sections, MSG-001…MSG-040 in use, and the README badge which was already right): **40 messages = 27 MQTT + 13 BLE**. The README was wrong in the opposite direction — it had SessionEnded but omitted SignCertificate, CertificateInstall, TriggerCertificateRenewal, DataTransfer and TriggerMessage, headed a 22-row table "21 MQTT", and claimed MSG-022–039 were "security and BLE" when 022–026 are MQTT. Corrected across `03-messages.md`, `README.md` (7 claims), `guides/implementors-guide.md`, and `schemas/README.md`; schema directory counts also corrected to 21/47/15, total **84**.
- **`06-security.md` Appendix A omitted every obligation added this cycle.** The implementers' checklist still carried the singular "separate from the mTLS/receipt key" corrected elsewhere, and listed none of the new rules — station-side key distinctness (the one that costs a secure-element slot), and server-side reject-on-reuse, retain-every-key, and anchor-bound selection. A checklist that omits the new rules reads as confirmation that a pre-amendment implementation is complete.
- **Stale factual counts and one bad citation.** `README.md` claimed "67 JSON Schemas" (actual: **84**) and "95 error codes" (actual: **111**). `conformance/README.md`'s Test Case Index listed **11 of 27** cases; completed and verified set-identical to the files on disk. The [0.7.0] entry cited `07-errors.md` §3.1 as a home for the provisioning-token rule — §3.1 is Transport Errors, and 0.7.0 added no error code at all; the false citation is struck rather than repointed, since `2019` did not exist then.
- **Non-conformant REST error examples.** `examples/error-scenarios/01-bay-busy-race-condition.md` and `04-ack-timeout-station-unresponsive.md` both omitted the **REQUIRED** `timestamp` field (§1.3) and both carried a top-level `success: false` that no part of the spec defines. Their `refund` / `circuitBreaker` siblings move into `details`, the Error Object's designated extension point. `04-flows.md`'s mermaid shorthand used `error` for a bare string where §2.4 defines an object.
- **A recommended action that walked the station into an unrecoverable state** (`07-errors.md` §3.4 rows `4010` and `4016`; `04-flows.md` §2 Error Paths and Error precedence). `4010 CSR_INVALID` told the station to "regenerate keypair and CSR with correct parameters", and `4016 PROVISIONING_KEY_REUSE` told it to "generate a **separate** key pair for the colliding role and resubmit" because "the same token may be reused once the keys are corrected". Both are correct **before** the token has issued a certificate and fatal **after**: once a certificate exists the submitted keys are the **bound set**, so a regenerated key is answered `409` / `4015`, which is `recoverable: false` — the station destroys its own identity by following the advice the error handed it. This stopped being harmless in this same cycle: §1.4 now **REQUIRES** the registry's action to be emitted on the wire verbatim and **FORBIDS** substituting a generic string, promoting the advice from ignorable prose to a mandatory wire value. The amendment had already identified the hazard in its own justification for keeping `4015` out of `400` — "whose documented station action ('regenerate keys, retry') would loop forever on this error" — and left it standing on the two rows where it actually bites. `4010` is additionally reachable from certificate renewal (SignCertificate [MSG-022]), where regenerating the keypair **is** the renewal and the original advice is correct, so the fix could not simply invert it. Both actions are now conditional on `details.phase` (`first-provision` | `retry` | `renewal`), which the server **MUST** carry, with a fail-safe default: a station that receives no `details.phase` **MUST** assume `retry` and leave its keys alone, because regenerating when it should not have is unrecoverable while resubmitting when it need not have costs one round trip. Both cells fit the 500-character `recommendedAction` bound of Appendix C, so they can be emitted verbatim as §1.4 requires rather than shortened per-occurrence, which would break §1.4's per-code equality rule.
- **Provisioning error precedence extended from three checks to five** (`04-flows.md` §2). The A6 ordering named only token validity → self-consistency → bound set, so a malformed body or an undecodable CSR had no defined answer. The order is now **request well-formedness** (`400` / `4017`) → **token validity** (`401` / `2019`) → **CSR decodability** (`400` / `4010`) → **request self-consistency** (`422` / `4016`) → **comparison against the bound set** (`409` / `4015`). Well-formedness is first because every later check reads a field out of that body: a body that does not validate yields no token to check and no keys to compare. CSR decodability precedes both key comparisons for a mechanical reason rather than a policy one — both compare **decoded** keys, so a CSR whose `SubjectPublicKeyInfo` will not decode makes `4016` and `4015` undecidable rather than merely unequal. The relative order of `2019`, `4016` and `4015` fixed by A6 is unchanged. §2 also now states what an undecodable CSR means on each side of consumption: **before**, nothing is bound, the token stays unconsumed and the station may regenerate freely; **after**, the server **MUST NOT** answer as a replay (the identity is unverified) nor as drift (drift is unproven), **MUST** answer `4010` leaving the binding and the issued certificate untouched, and the station **MUST** resubmit a well-formed CSR over the already-bound key — one that can no longer produce it has lost the identity rather than the request, and recovers only with a new token. The Error Paths table and the §2 sequence diagram are reordered to match the precedence, and the bare "400 Bad Request | Invalid CSR or missing fields" row — non-conforming since §2.4 made `errorCode` REQUIRED on every REST error, and conflating two failures that now carry different codes — is split into coded `4017` and `4010` rows.
- **Two boot-path recovery actions told a station to do something the spec forbids** (`07-errors.md` §3.1 `1004`, §3.2 `2001`; `04-flows.md` §1 Error Paths). Both are the `4010` defect in a different place, and both are on the path every station traverses. `2001 STATION_NOT_REGISTERED` said *"Station: enter provisioning mode"* — but 2001 is a **REJECTED BootNotification**, so the station is already through mTLS and MQTT CONNECT and holds credentials the broker accepted, which is exactly the state [Flows §2](spec/04-flows.md) forbids re-provisioning in; it has no token and no in-band way to get one, and provisioning mode exits only by reboot into the boot flow that just failed. Worse, the advice discarded the recovery that actually works: CORE-011 requires indefinite BootNotification retry, 2001's real causes (unregistered station, mistyped `stationId`, tenant move, DB restore) are all fixed operator-side, and the next retry then succeeds — the registry traded a self-healing loop for a truck roll. The action now keeps the station retrying and gives the operator the list of things to check; `recoverable: false` is retained but the entry states what it means, namely that an operator must act, not that the station should stop retrying. The rule was stated in **three** places, not two: `04-flows.md` §1's Error Paths row was corrected in the same commit, and `profiles/core/boot-notification.md` §6 — which still read "Station **SHOULD** enter provisioning mode", and which is the document station firmware actually implements — was corrected immediately after, once a registry-wide audit surfaced it. Leaving it would have been worse than the original defect: the registry and the Core profile would have mandated opposite actions for the same code. `1004 CERTIFICATE_ERROR` said *"enter provisioning mode for certificate renewal"* for all four of its causes at once. For **expired** the spec already mandates the opposite in two places (`06-security.md` §4.7.3, `certificate-renewal.md`): offline-only BLE mode, from which the station keeps earning — the registry contradicted both. For **revoked / invalid-chain / self-signed** the station's own key may be sound and the failure server-side (an un-handed rotated Station CA is an anticipated case), so it still holds credentials and hits the same MUST NOT. Rewritten as a branching entry under the new §1.4 rule, keyed on `details.cause`; no branch permits provisioning mode, and an absent discriminator needs no guess because expiry is locally determinable from the certificate's own `notAfter`.

- **The every-path rule is scoped to entries as written or revised, and how that came about.** §1.4 made the registry's *Recommended Action* a mandatory wire value; a follow-on paragraph then required that value to be correct in every context its code is reachable from. That second rule was written unscoped, so on its face it bound all 111 entries retroactively — and paired with the requirement to emit what the registry gives, it produced codes with **no conforming emission at all**. `1005` was the worked case: its cell said "Do NOT retry — sender must fix the message" while `reconciliation.md` mandated it for out-of-order transactions, where the sender has nothing to fix. A server on that path had to emit the cell and the cell had to be correct there, and it could not do both; the permission to translate or shorten is no escape, since it preserves the action and the action was the wrong one. The rule now binds the **entry**, not the emitter — authoring the registry and emitting from it are obligations on different parties, so they cannot conflict — and applies to codes added from this version onward plus any existing entry from the moment it is next revised. An entry authored earlier is **not** non-conforming merely because the rule exists, and an implementation emitting it is **not** in violation; a cell wrong on one of its paths is a defect in the chapter, repaired there. Bringing the whole registry into line is recorded as known, unscheduled work. §1.4's own anti-placeholder rule is **unchanged and not at fault** — forbidding a generic severity-derived string is exactly the narrow guarantee a firmware reader needs, and it stands. The branching form and its fail-safe default also stand, with `1004`, `4010` and `4016` as the worked examples.
  A registry-wide audit was run against the unscoped rule before it was restated. It **over-reported**, its findings were never written to disk and cannot be reverified, and it graded against a rule authored in the same pass; a follow-up re-read of a sample, with withdrawal explicitly permitted, retracted **five of eleven** findings — three of them refuted by text one link away from the cell being judged. That audit is therefore **not** treated as authoritative here and none of its unverified counts are carried forward. Only defects re-verified individually against the text at HEAD were acted on, and they are listed below.

- **`5004 ELECTRICAL_SYSTEM` could return a bay to service with the fault still present (safety).** The entry was `recoverable: true` — "Recoverable if power is restored within tolerance" — while §7.2 lists `5004` as a **Level 3 (Faulted)** entry trigger whose exit is "Physical intervention + operator verification + station reboot". The registry let a voltage reading clear the fault; the degradation model required a technician. The cell was also wrong on its own named causes: of *voltage out of range, relay failure, phase loss*, only the first is cured by voltage returning, and a welded relay is the dangerous case — the bay may remain energised after the station believes it cut power, and the stated recovery condition is satisfied with the fault still live. The emergency shutdown was conditional too ("if voltage exceeds safe range"), so on precisely those two causes the station was never told to de-energise. Now `recoverable: false`, shutdown unconditional and explicitly not gated on the voltage reading, the §7.2 exit stated in the action, and the bay **MUST NOT** return to service on voltage normalising alone. `05-state-machines.md` is corrected in the same spirit: the Bay FSM offered an automatic `Faulted → Available` edge undifferentiated across `5001`–`5009`, in both the diagram and the transition table, which reopened the hazard one document away. Automatic reset now requires the reported error be `recoverable: true`, so the FSM defers to the per-code flag instead of contradicting it; `recoverable: false` requires the Level 3 exit regardless of what the reading does.
- **`1005 INVALID_MESSAGE_FORMAT` carried two unrelated meanings.** Unparseable message (`07-errors.md`) and out-of-order offline transaction (`reconciliation.md` §2). A message that cannot be parsed yields no `txCounter`, so the second was never a variant of the first, and one action could not be right for both. The remedy already existed in the same file for the identical condition: §4.2 step 4 requires `status: "Deferred"` where `txCounter` exceeds `lastReconciledCounter + 1` — two MUSTs, one file, same trigger, different wire values, neither referencing the other; §4.1 step 4 had already been converged onto `Deferred`, leaving §2 the sole holdout. Decisive against keeping `1005` there: that response object carries **no error code at all** — `transaction-event-response.schema.json` is `additionalProperties: false` over exactly `status` and `reason` — so the mandated `1005` response was not even schema-valid. **Decision: the unparseable meaning keeps `1005`, out-of-order moves entirely to `Deferred`, and no new code is minted.** Out-of-order is not an error in the Error-Object sense — the message was received, understood, and its handling postponed — so a new code would misclassify it as a Protocol-tier failure (§1.1: "the message could not be processed") and duplicate a condition that already has a first-class wire representation with a required `reason`, a re-arrival rule, and a SecurityEvent. The station behaviours differ materially and `Deferred` is the correct one: `1005` says stop and fix, `Deferred` says hold and do not auto-resend. `Deferred` was re-verified emittable at HEAD in all three layers rather than inherited from a prior claim — spec, schema, and both SDKs. §4.2's closing clause is also fixed: it named two exits from `Deferred` but its final clause named only the operator unblock, leaving a re-arrival that completed the sequence with no stated exit. Registry count unchanged at **111**.
- **`1007 PROTOCOL_VERSION_MISMATCH` told the station to await a firmware update it cannot receive.** Four locations mandated unlimited BootNotification retry and two forbade it, for the same response. Resolved in favour of **retry**, not softened. The forbid side names an unreachable remedy: `UpdateFirmware` is a server→station command and a rejected station accepts no commands, so firmware cannot arrive over the protocol while it is rejected — stopping the retry closes the only channel left and leaves on-site service as the sole recovery. It also assumes only the station can change, when a MAJOR mismatch is resolvable from **either** side: a server upgraded past its fleet, or rolled back, is the same error, and there indefinite retry heals every affected station unattended, while `MUST NOT retry` strands the fleet until each unit is visited. The wire format already assumed retry — the response schema requires `retryInterval` on every `Rejected` boot response, `1007` included, and the worked example carries one — so the spec obliged the server to say *when to retry* in the message that supposedly meant *never retry*. `CORE-011` is a MUST keyed on response status with no carve-out for any code. And the registry entry itself never took the other side: it said "await firmware update" and, unlike `1005`, omitted any "Do NOT retry" clause, so making retry authoritative states a position that was left implicit rather than reversing one. This is the `2001` defect in another place — an instruction that removes the channel by which the fault could be repaired. Corrected across `07-errors.md`, `04-flows.md` §1, `VERSIONING.md` (the only `MUST NOT` in the repo), `profiles/core/boot-notification.md` §6, `02-transport.md` (which read "station cannot operate", silent on retry), and `guides/implementors-guide.md` (which told server implementers to send `supportedVersions` but not `retryInterval`, yielding a response its own schema rejects).
- **`5017 INSUFFICIENT_STORAGE` told the station to delete its rollback target.** The action was "clear diagnostics logs or old firmware partitions if possible". `update-firmware.md` §7 retains the previous partition as the rollback target and §8 makes rollback to it a **MUST** on boot failure within 60 s or health-check failure within 120 s — and states the consequence when rollback cannot be performed: an unrecoverable state requiring JTAG/UART reflash or SD-card replacement. The registry was advising a station short on space to delete the only thing standing between a bad flash and a truck roll, at the moment it is about to write new firmware. The action now names the space it may reclaim (diagnostics logs, buffered telemetry, cached and partial downloads), forbids erasing, truncating or overwriting the rollback partition, and gives the terminal behaviour when the binary still does not fit: abort, stay on current firmware, report `Failed` via FirmwareStatusNotification, operator supplies a smaller build. `recoverable: false` is retained and glossed as for `2001` — someone else must act, not stop reporting.
- **The branching discriminator was unenforceable, and two conformance tests failed a conforming station.** Branching entries make `details.phase` / `details.cause` a MUST and the fail-safe default depends on that member, but Appendix C's `required` array is fixed at the seven always-present fields with no conditional, so a validator accepted a `1004` with no `cause` and a `4010` with no `phase`. It is expressible in the dialect in use — the schema declares draft 2020-12 — so it is now **enforced** rather than documented as a gap: one `if`/`then` per branching entry, and only those three (`1004` → `cause`; `4010` → `phase` incl. `renewal`; `4016` → `phase` excl. `renewal`, which it is not reachable from). `details` stays OPTIONAL in general and no field is added to every error. Appendix C also states that this does not retire the fail-safe defaults: validation binds the emitter, while §1.4's defaults tell a receiver what to assume when a non-conforming peer omits the member anyway. §1.3's `details` row already carried the conditional qualification and needed only a pointer to the appendix that now enforces it. On the conformance side, `TC-SEC-002` asserted the superseded `1004` behaviour in **two** places — a step verifying the station "enters provisioning/recovery mode", quoting as its authority a sentence the registry no longer contains, and a failure criterion making *not* entering provisioning mode a failure — both inverted, plus a new step verifying credentials survive the rejection unchanged, which nothing tested. `TC-CORE-001` asserted the pre-fix `1007` position in three places; that test was already self-contradictory independent of which side wins, since one criterion fails a station that does **not** retry after `Rejected` and another failed one that **did** retry after `Rejected` with `1007` — and a `1007` response *is* a `Rejected` response, so a station receiving it failed whichever behaviour it chose.

- **Three corrected cells were over the wire bound, which has no canonical form.** The `1007`, `5004` and `5017` rewrites above left their *Recommended Action* cells at **598 / 551 / 559** characters against Appendix C's `maxLength` of **500**. §1.4's permission to shorten does **not** rescue this: the same section requires two errors carrying one `errorCode` to carry the same `recommendedAction`, so if the canonical value does not fit, every emitter shortens it independently and two conforming servers emit different values for one code — the per-code equality rule fails. A cell that cannot be emitted as written has no canonical form at all. All three shortened below the bound in **full** form, preserving every distinct corrective action and cutting only rationale and restatement — the rationale already lives in the *Description* column, which has no wire bound: `1007` **598 → 365**, `5004` **551 → 442**, `5017` **559 → 398**. A structural rule is added to §1.4 so it cannot recur: every *Recommended Action* cell **MUST** itself fit the Appendix C bound, an over-length cell is a defect in that entry fixed by shortening the cell rather than by leaving emitters to shorten it for themselves, and the *Recommended Action* column carries instruction only. All **111** cells were then measured: none exceeds the bound, the longest being `1004` at **486**. §1.4's shortening permission is retained and still has a job — it now covers **translated** values, which may exceed the bound even where the English cell fits, and it is no longer load-bearing for the untranslated canonical value.
- **`TC-SEC-002` failed the only real station on TLS.** Failure criterion 8 read "TLS version negotiated is below 1.3", while the same file's objective, its step 3, and its first expected result all state "TLS 1.2 or 1.3" — the criterion contradicted three lines in its own test case. It also contradicted the settled transport requirement: `02-transport.md` §1.3 mandates **TLS 1.2 or higher** with 1.3 RECOMMENDED, and explicitly records why the floor was lowered from 1.3-only — constrained cellular modems that cap at TLS 1.2 with no firmware path to 1.3. A conforming station on such a modem failed this criterion for negotiating exactly what the spec requires. Corrected to fail below **1.2**, stating that negotiating 1.2 is not a failure. The spec itself needed no change: a sweep found **no** 1.3-only requirement anywhere in `spec/`, and the rest of the conformance suite (`conformance/SECURITY.md`, `conformance/README.md`, `TC-CORE-001`) already carries the 1.2 floor — this single criterion was the last unmigrated remnant.

- **Per-code equality was unsatisfiable as worded.** §1.4 requires two errors carrying one `errorCode` to carry the same `recommendedAction`, and three sentences later permits a server to **translate** that value. Read literally the two cannot both hold: byte-identity fails the moment two servers run in different locales, and a conformance test written against the literal wording would fail correct implementations. The rule was always about the instruction rather than the encoding, and now says so — the equality is on the **corrective action**, one `errorCode` **MUST NOT** carry two different instructions, and a translation or a permitted shortening satisfies it provided the action survives. Byte-identity is called out as unachievable and a conformance test **MUST NOT** assert it. Nothing is narrowed: the prohibitions that do the work — no generic severity-derived placeholder, no two codes' worth of advice under one code — are unchanged.
- **`reconciliation.md` §6.4 mandated a response the wire contract forbids.** Every gate failure in §6 had **no emittable response**: §6.4 required `status` + `errorCode` + `errorText` + `reason`, while `transaction-event-response.schema.json` is `additionalProperties: false` over exactly `status` and `reason`. Verified mechanically rather than by reading — a §6.4-conforming body fails validation with *"Additional properties are not allowed ('errorCode', 'errorText' were unexpected)"*, and any schema-valid body necessarily omits the two members §6.4 made mandatory, so the intersection was empty. Fixed in the **prose**, not the schema: the schema is the closed wire contract and is vendored byte-identically into both SDKs, so amending it would force a re-vendor for a path that does not need one, and §6.4's own text already routed forensic detail to the SecurityEvent. The response is now `status` + `reason`. Identifiability is kept and made explicit on both routes — on the wire the `reason` **MUST** identify the failed check (its §6.1 number or its `errorText`) within the schema's 256-character bound, and the `OfflinePassRejected` SecurityEvent that §6.3 already **MUST** emit for the same failure carries the check number and rejection `errorCode` in `details`, correlated by the originating `messageId`. §6.1's codes are therefore **recorded rather than transmitted**, and the section states that. This is the second instance of the shape on this one message — `1005`'s out-of-order mandate was the first — and a sweep confirms `reconciliation.md` mandates exactly two response bodies, §4.2's `Deferred` and this one, both of which now validate against the closed schema. There is no third.

- **The Error Object was specified for every transport and carried by only one.** §1.3 asserted that every error — "whether in an MQTT RESPONSE, BLE AuthResponse, or REST API response" — MUST include seven fields. Five of them (`errorDescription`, `severity`, `recoverable`, `recommendedAction`, `timestamp`) are declared by **zero** of the 23 response schemas, and all 23 are `additionalProperties: false`. Verified by validation rather than by reading: a §1.3-conforming error payload is rejected by every one of them. The consequence reached everything §1.4 governs — the anti-placeholder rule, per-code equality, the branching discriminator, the fail-safe defaults, the wire bound — all of which were reachable on **REST only** and were dead text on MQTT. This is **pre-existing and structural, not introduced by this cycle**: Appendix C's Error Object schema is referenced by no message schema, so nothing ever forced the two into agreement, and §2.1 and the schemas already agreed on a three-member MQTT rejection. §1.3 was the outlier. Resolved one level up rather than by scoping §1.3 to REST, because the schemas already implement the right structure: **the registry is universal, the wire representation is per transport.** §1.3 now marks every field per-code or per-occurrence, states that its *Required* column describes the **Error Object** (the REST body, what Appendix C validates) rather than what each transport carries, and adds a *Wire carriage* block — REST carries the full object, MQTT carries `status`/`errorCode`/`errorText`, BLE per §2.3. The asymmetry is justified in the text so it reads as principled: `recommendedAction` and `errorDescription` are written **for a human**, and on REST the caller is often a technician debugging live, whereas on MQTT the receiver is firmware that branches on `errorCode` and logs it — the technician reading that log looks the code up — and several hundred characters of prose per error is billed per byte on a metered cellular link. §1.4 is scoped to match: the registry value MUST be carried wherever the transport carries the field, and where only `errorCode` travels the obligation is discharged by the code itself, which is why no §3 entry may be a placeholder. §2.4 is untouched — the full object remains the REST body — and **no schema changed**.
- **§2.1's escape hatch removed, and the eight messages that cannot carry a code named.** "Individual message schemas define the exact payload structure" sat immediately after a MUST naming `status`, `errorCode` and `errorText`. Read as a deferral it makes that MUST vacuous — a MUST any schema may silently cancel is not a MUST — so it is replaced by the enumerated truth: eight response schemas (`transaction-event`, `authorize-offline-pass`, `boot-notification`, `heartbeat`, `change-configuration`, `get-configuration`, `data-transfer`, `trigger-message`) declare no `errorCode`/`errorText`, each now listed with how a rejection is signalled instead, marked a **known gap rather than a permission**, and paired with an explicit prohibition on omitting `errorCode` where a schema does declare it. This also leaves §2.1 and `reconciliation.md` §6.4 agreeing on TransactionEvent, which they previously did not.
- **`08-configuration.md` §8.2 described a ChangeConfiguration exchange the schemas abolished.** The response schema declares only `results` (per-key `{key, status, errorCode, errorText}`) and the request schema only `keys`; the file described a single-key request answered by a top-level `status`. The hardest instance was the ReadOnly rule, which mandated top-level `status`/`errorCode`/`errorText` — three members the schema forbids — so no conforming response existed for a ReadOnly rejection. Aligned to `03-messages.md` and `profiles/device-management/change-configuration.md`, which already carried the correct shape; prose only, 18 substitutions, all six examples now validating against both schemas.
- **`02-transport.md` mandated an `ERROR` message type that does not exist.** Two rows instructed implementers to "Send ERROR message with `1005` / `1006`" while the envelope enumerates `messageType` as `Request`, `Response`, `Event` and is closed. Replaced with what the envelope admits, split because the two cases differ: invalid JSON admits **no** reply at all (the `messageId` cannot be read and §2.1 requires a RESPONSE to echo it), which is what four Core profiles already say for `1005`; an unrecognised action admits a `Rejected` RESPONSE when the action is known to the protocol but unsupported here, and only a log-and-discard when no RESPONSE schema exists for it. Both now point at §2.2's unsolicited EVENT, the mechanism the "ERROR message" row was reaching for.
- **A `recoverable: false` fault no longer requires a station reboot it never needed.** The Bay FSM's fault-clearing rule demanded the full Level 3 exit — physical intervention, operator verification, station reboot — for every non-recoverable fault, while §7.2 names only four Level 3 entry triggers (`5001`, `5004`, `5009`, `5101`), all Critical. Enumerating Faulted-causing codes from the FSM, the profiles and §4 rather than assuming the 5xxx range found three that are `recoverable: false`, reach `Faulted`, and are not triggers: `3009` (not a 5xxx code at all, so the FSM's own `5001-5009` token cannot express it, yet two MUSTs put a bay into Faulted with it — leaving it no stated clearing path), `5007`, and `5005`, whose own action keeps the bay serving app and web payments and which the old rule would have rebooted a station for. Split so the safety clause stands unconditionally — a `recoverable: false` fault **MUST NOT** clear automatically, however the underlying reading may recover — while the Level 3 exit is named only where the code is a §7.2 trigger, now listed inline.

- **BootNotification rejections now carry `errorCode` (BREAKING for server implementations).** `boot-notification-response.schema.json` declared no `errorCode` and is closed, so a station received `Rejected` and could not tell which of four codes it had been given. Four codes with four *different* recoveries are reachable there, and this cycle separated them: `2001` keep retrying while the operator registers the station; `1007` keep retrying while firmware is upgraded or the server restores MAJOR support; `1005` the sender corrects the message; `6001` back off. None of that branching could execute — on the one path every station traverses at every boot. `errorText` ships with it: it is strictly derivable from `errorCode`, but §2.1 mandates both, all fifteen conforming response schemas pair them, the cost is once per boot rather than per message, and §1.3's own rationale is that firmware logs the code for a human to read later — `errorText` is what makes that log readable without compiling the registry into firmware. Required **conditionally**, via the `if`/`then` shape the file already used for `retryInterval`: required when `status` is `Rejected`, not on an acceptance, and `Pending` untouched. Verified behaviourally across seven cases including the negative controls (Rejected without either member invalid; with `errorCode` but no `errorText` invalid; lowercase `errorText` invalid). Everything downstream moved in the same commit: 2 conformance vectors, 2 examples in `03-messages.md`, and both of `TC-CORE-001`'s stimuli. Stations are unaffected — reading a new field is additive — but a server emitting a bare `Rejected` boot is now non-conforming. It is the only schema touched by this closing-fixes pass, and — unlike the three 0.8.0 schema edits that changed `description` strings only — it **changes validation**, so it adds to the re-vendor obligation already owed at the lockstep tag (see *Verification*).

- **Stray empty table in `04-flows.md` §2 *Error Paths*.** A duplicated header-plus-separator pair preceded the ordering sentence, rendering as an empty two-column box above the real table. Removed; the surviving table is unchanged apart from its new rows.

- **`1004 CERTIFICATE_ERROR` was two characters under the wire bound.** Its *Recommended Action* measured **498/500**, so any later edit to that cell would have pushed it over — the same fragility corrected on `4018` before it shipped, and the reason §1.4 requires a registry cell to fit the bound at all. Trimmed **498 → 401** by cutting rationale, not instruction: "re-provisioning is operator-initiated" restates a rule the same sentence's "never enter provisioning mode" already carries, and "recovery is server-triggered renewal over an existing session, or physical re-provisioning" describes a path the station cannot itself take. All four branches, the `details.cause` discriminator and the absent-discriminator default are unchanged, and both parties addressed keep their instruction. Revising the entry brings it under §1.4's every-path rule by that section's own scope clause; it was re-checked against all four causes and holds.

- **Station-side audit remediation — nine defects on the provisioning surface.** An audit read the surface from the station's side, asking only whether the specification demands something a station cannot supply, determine or do because of an omission or contradiction on our side; two independent falsification rounds then tested the findings, withdrawing one and halving several. What survived is repaired here.
  - **The precedence chain contradicted itself in three places.** `2019` and `4017` each claimed the first seat — `42c6521` seated `4017` ahead of `2019` and never amended the `2019` cell, so this was our own half-finished fix rather than stale reading. Step 8 said `4015` is reachable only on an **unconsumed** token, when `4015` is by definition post-consumption and `TC-SEC-005` provisions on `T1` before expecting it on that same token; consumption is the precondition for reaching the step, never a bar. Step 3's trigger was broader than the registry entry it links to, capturing the drift case step 8 claims while preceding it under "answered by the first that applies"; narrowed to the two enumerated causes, in both of which no bound set exists, which is what makes its stated position executable. The seat itself is unmoved — it was derived from the implementation's statement order. A sweep for other order claims found four more stale ones (`4010`, `4015`, `4016`, `4019`) and a `TC-SEC-006` reference to "step 5" that `4020` displaced to step 6.
  - **Hard reset commanded Boot after deleting Boot's prerequisites.** `reset.md` cleared "all local configuration, cached credentials" and then required a BootNotification, whose preconditions are the credentials just erased. The outbound reference to re-provisioning confirms rather than resolves it, and adds two obligations Reset never mentioned: a new operator-minted token, and an **unchanged** `stationId` that "clear all local configuration" would itself destroy. Hard reset now leaves the station unprovisioned and re-enters Flows §2; new §5.1 states normatively what is cleared and what MUST survive.
  - **The key set was persisted after the POST.** A lost response plus a restart regenerated the keys, and the retry then met `4015` — terminal on that token, recoverable only by an operator. The complete key set MUST now be committed durably **before** the first request and retained until success or a terminal outcome. **Firmware-visible.**
  - **The bootstrap handoff omitted three inputs.** No absolute HTTPS origin for the provisioning endpoint, no statement of what validates that server's TLS certificate, and no pre-Boot time source — while both defined clock sources arrive only after an mTLS session exists. Added to the §7.2 *Required configuration* manifest, with transport left implementation-specific exactly as `stationId` already is. The `stationId` sub-claim of this finding was **withdrawn** under falsification and is not repaired.
  - **Replay's frozen-certificate / current-chain split.** `clientCert` byte-identical and `stationCaChain` "current" cannot both hold after a Station CA rotation, and no cross-signing or overlap requirement exists anywhere in this specification. Root cause: `stationCaChain` was filed under a rule whose own rationale never covered it — it is what the station **presents**, not its trust anchor. Split into a third group bound to the certificate in the same response.
  - **Two mandatory authorities on two fields.** `clientIdTemplate` is now pinned to Transport (`const "{stationId}"`) because the Client ID is bound to the CN the broker runs topic ACLs on; `keepAliveSeconds` is now governed by the provisioning response, with Transport's `30` as the absent-field default.
  - **`bayIds` had no relation to `bayNumber`.** StatusNotification requires the pair on the first message after boot, `bayId` values are server-assigned and arrive only at provisioning, and no other channel in any profile supplies the correspondence. The array's **order** is now normative: `bayIds[i]` is bay number *i + 1*. `serviceId` is a different surface and is untouched.
- **`4020`'s registration left every count location stale.** `d1a72f3` added the code to the registry, to Appendix A and to the §4.4 endpoint row without re-deriving the totals. The §1.1 range cell for `4000–4999` read **19**, the stated total **113**, and `README.md` carried **113** in three places. Re-derived by parsing the registry: per-range **15/20/17/20/34/8**, total **114**, matching Appendix A's independent 114 rows. The `4000–4999` description also still said "certificate management" while the range now holds a provisioning code that is not a certificate code.

- **Conformance follow-through for the Hard-reset repair.** `TC-DM-003` was written against the sequence that repair removed — reboot, BootNotification, acceptance, then a `GetConfiguration` factory-defaults check over an MQTT session a hard-reset station cannot have. Part B is now a **negative** case runnable by any harness: after the `Accepted` response and the connection drop, no BootNotification and no completed mTLS session for a window calibrated from Part A's measured reboot-to-boot interval, and the pre-reset certificate never presented. A new **conditional** Part C covers recovery, and asserts the two rows of `reset.md` §5.1 that nothing previously tested: that `stationId` **survives** (the CSR's Subject CN is unchanged) and that the receipt-signing key does **not**. The factory-defaults check moves there, after re-provisioning, which is the earliest point it can honestly be made. An operator step is declared as a harness precondition and is skippable-with-record, following `TC-SEC-002` step 35 and `TC-SEC-005` Part F. A new *Coverage* section states what a harness that skips Part C has and has not verified. Also corrected, pre-existing: step 7 expected `bootReason: "SoftReset"`, which is not a member of the `boot-notification-request.schema.json` enum — `reset.md` §5 rule 4 requires `"ManualReset"`.
- **`03-messages.md` §6.3's Reset restatement still described the old Hard reset.** The `reset.md` repair did not sweep the Chapter 03 restatement of the same command. Its Behavior bullet still said a Hard reset clears "all local configuration, cached credentials, and session history" — exactly what `reset.md` §5.1 now forbids, since the out-of-band bootstrap inputs **MUST** survive. It now states the boundary, the **MUST NOT** on BootNotification, and the server's token obligation, and points at §5.1 as normative rather than restating it. Also corrected in the same rows and older than the repair: the REQUEST payload described `"Hard"` as a "full hardware reboot", where the profile calls it a factory reset — a reboot preserves the provisioned identity and a factory reset destroys it.

### Verification

- **Conformance follow-through pass.** `tools/verify-schemas.py`: `306/306 PASS, 0 FAIL, 0 SKIP` — 158/158 valid vectors accepted, 148/148 invalid vectors correctly rejected. No file under `schemas/` changed in this pass. All **51** example payloads validate against their schemas, and all **86** `spec/…§n` references from conformance test cases resolve to headings that exist. The conformance *Test Case Index* is set-identical to the **28** cases on disk. Note that `tools/validate-examples.sh` reports 52 failures on any machine without `ajv-cli` installed — every `npx ajv validate` invocation fails identically and the script counts each as a FAIL; this is a tooling artifact, not a regression, and the Python `jsonschema` path above is the reliable check.
- **Two premises of the brief for this pass did not match the repo, and were not acted on.** There is no `bays[]` field replacing `bayIds[]` — `4677594` made the existing `bayIds` array *order-normative* (`bayIds[i]` is bay number *i+1*), which is a non-breaking constraint on servers with no wire-shape change; `bayIds` remains the field, and no example, test vector or guide that names it was invalidated. And `01-architecture.md` §7.3 contains no claim that `stationId` survives a factory reset; §7.3 is *First Boot*, and the only normative statement on the subject is `reset.md` §5.1's second table, added by the repair itself. No provisioning **response** fixture exists anywhere in `examples/` or `conformance/test-vectors/`, so the response-shape sweep was empty by construction.

- **Station-side remediation pass.** `tools/verify-schemas.py`: `306/306 PASS, 0 FAIL, 0 SKIP`. One schema file changed **validation-affectingly** — `provisioning-response.schema.json`, where `clientIdTemplate` became `const "{stationId}"` (previously an unconstrained 1–128 string); its `minLength`/`maxLength` are dropped as subsumed. Four `description` strings in the same file changed without touching validation (`bayIds`, `stationCaChain`, `rootCaThumbprint`, `keepAliveSeconds`, and the `mqttConfig` block). No example or conformance fixture carries `mqttConfig`, so the new `const` invalidates no published artifact; the reference server's default is already `{stationId}`, though its `MQTT_ADVERTISED_CLIENT_ID_TEMPLATE` override could now emit a non-conforming value. **This appends to the re-vendor already owed at the lockstep tag.** Registry integrity re-checked after the edits: **114** codes, per-range **15/20/17/20/34/8** summing to the stated total and matching §1.1, Appendix A set-identical to §3, no duplicates. `recommendedAction` measured for all **114** cells against Appendix C's 500-character bound: none exceeds it, and **no *Recommended Action* cell was edited in this pass** — the three longest are unchanged at `4010` **480**, `4016` **470**, `4018` **457**. No message schema and no wire `protocolVersion` changed.
- **Known, deliberately not fixed in this pass.** *(`TC-DM-003` and its `bootReason` defect were fixed in the conformance follow-through above.)* `03-messages.md:1885` still claims the service catalog arrives "via BootNotification response" when that response's payload table and closed schema have no such field; that is the status/catalog surface, not provisioning. The new `stationCaChain` rule — that the chain returned **MUST** verify the `clientCert` returned beside it, and after a Station CA rotation carries both the issuing and the current CA — has **no conformance coverage**: `TC-SEC-005` replays a token and asserts `clientCert` byte-identity but never inspects the chain. That is uncovered rather than invalidated, so it was recorded rather than built.

- `tools/verify-schemas.py`: `306/306 PASS, 0 FAIL, 0 SKIP` — unchanged. Configuration keys are freeform string key-value pairs with no JSON-schema surface, so no schema or conformance-vector regeneration was required. The **four** new error codes (`2019`, `4015`, `4016`, `4017`) touch no schema: `errorCode` is a plain bounded integer in every schema that carries it (no enum to extend), and the Error Object schema exists only inline in `07-errors.md` Appendix C — there is no `schemas/**/error.schema.json` to regenerate. **Four** schema files changed against `v0.7.0`: `provisioning-request.schema.json` is **new** (the request had no schema at all), and `schemas/ble/station-identity.schema.json`, `schemas/common/receipt.schema.json` and `schemas/provisioning-response.schema.json` changed `description` strings only — no property, type, required list, or constraint — so validation is unaffected. (`schemas/README.md` also changed; the SDK byte-identity gates exclude it.) Byte-identity with the vendored SDK copies is broken either way, so a re-vendor is required at the lockstep tag.
- **Re-vendor delta added by the BootNotification change.** `schemas/mqtt/boot-notification-response.schema.json` is now the fifth schema file differing from `v0.7.0`, and the first in this cycle whose change is **validation-affecting** rather than a `description` string. It appends to the re-vendor already owed at the lockstep tag rather than starting a second one: copy the file to `sdk-ts/src/schemas/mqtt/` and `ospp-sdk-php/schemas/mqtt/`, and bump `.spec-ref` in both (`sdk-ts` is at `v0.8.0`, `ospp-sdk-php` at `v0.7.0`). The byte-identity gates — `sdk-ts/.github/workflows/ci.yml`, `ospp-sdk-php/.github/workflows/tests.yml`, and the `scripts/check-schemas.sh` local mirrors — go red until that is done. Two conformance vectors are vendored into `sdk-ts/src/test-vectors/valid/core/` and should be re-copied. **No type-layer work follows**: `sdk-ts` has no BootNotificationResponse interface, and `ospp-sdk-php` has no payload-DTO layer; `errorCode` is a plain bounded integer with no enum to extend, so `OsppErrorCode` in both SDKs is untouched. `sdk-ts/dist/` regenerates from `npm run build`.
- **Closing-fixes pass.** `tools/verify-schemas.py` stays `306/306 PASS, 0 FAIL, 0 SKIP` — the Error Object schema is inline in Appendix C only, so its new conditional blocks touch no test vector. Those blocks were verified **behaviourally**, not merely for well-formedness: the block parses, passes `Draft202012Validator.check_schema`, and nine instances resolve as intended — a non-branching code without `details` valid; `1004` with no `details`, with `details` lacking `cause`, and with an out-of-enum `cause` all invalid; `4016` with `phase: "renewal"` invalid; the good cases valid. Registry integrity re-checked after the edits: **111** codes, per-range 15/20/17/17/34/8 matching §1.1, Appendix A set-identical to §3, no duplicates. All **160** internal links and anchors across the ten touched files resolve. `recommendedAction` lengths measured against Appendix C's 500-character bound for **all 111** cells: **none exceeds it**; the longest is `1004` at **486**. No message schema, wire `protocolVersion`, or `schemas/**` file changed in this pass.

- **This pass.** `tools/verify-schemas.py` stays `306/306 PASS, 0 FAIL, 0 SKIP` — no file under `schemas/` changed, and the Error Object schema is inline in Appendix C only, so the two new conditional blocks touch no test vector. They were verified **behaviourally**, not merely for well-formedness: the block parses, passes `Draft202012Validator.check_schema`, and twelve instances resolve as intended — `4018` invalid with no `details`, with `details` lacking `reason`, and with `reason: "expired"` (which belongs to `2019`, not here); valid on each of its two reasons; `4019` invalid with no `details` and with `phase: "renewal"`; valid on `first-provision` and `retry`; `4010` with `phase: "renewal"` still valid; and a non-branching code plus `2019` still valid with no `details` at all. Registry integrity re-checked after the edits: **113** codes, per-range **15/20/17/19/34/8** summing to the stated total and matching §1.1, Appendix A set-identical to §3, no duplicates. `recommendedAction` measured for **all 113** cells against Appendix C's 500-character bound: none exceeds it. After the `1004` trim below, the three longest are `4010` at **480**, `4016` at **470** and `4018` at **457**; the two new cells are `4018` at **457** and `4019` at **454**. Lengths here are of the **raw Markdown** cell, which is the conservative reading — measuring the Markdown-stripped text gives 12–14 fewer characters per cell and is why an earlier pass recorded `1004` at 486 where this one reads 498. The conformance Test Case Index is set-identical to the files on disk (**28**). No message schema and no wire `protocolVersion` changed.
- **Known, deliberately not fixed in this pass.** `06-security.md` §4.3 states that a `4016` rejection lets the station "correct its keys and retry on the same token" without qualification. That is true only at `first-provision`; on a retry the bound keys are what was certified and regenerating is answered `4015`. `4016`'s own registry entry already branches on `details.phase` and states both, so the normative rule is correct and complete in `07-errors.md`; the Chapter 06 prose is a stale restatement of one branch. Pre-existing, on a different surface from this amendment, and recorded rather than swept.

## [0.7.0] — 2026-07-10

> **TLS 1.2 floor + provisioning-token idempotency.** Lowers the MQTT/mTLS transport floor from TLS-1.3-only to **TLS 1.2 minimum (TLS 1.3 recommended, negotiated when both peers support it)** so cellular modems capped at TLS 1.2 (e.g. SIMCom A7608E-H) can connect. Sub-1.2 remains rejected, 0-RTT remains forbidden, and mTLS is unchanged — reinforced as mandatory on every connection regardless of negotiated TLS version. Also formalises provisioning-token §2 (single-use + TTL-bounded idempotent retry). `spec/schemas/provisioning-response.schema.json` changes (`tlsVersion` enum widened + re-described as a floor), so the SDK schemas re-vendor at the **v0.7.0** lockstep tag.

### Changed (BREAKING)

- **`tlsVersion` (provisioning-response schema) widened `["1.3"]` → `["1.2", "1.3"]`, default `"1.3"` → `"1.2"`, and its semantics changed from "the TLS version" to a **minimum floor** ("the station must support this version; the broker accepts this version or higher").** `06-security.md` §2.1 cipher table now offers exactly four suites — TLS 1.3: `TLS_AES_256_GCM_SHA384`, `TLS_AES_128_GCM_SHA256`; TLS 1.2: `ECDHE-ECDSA-AES256-GCM-SHA384`, `ECDHE-ECDSA-AES128-GCM-SHA256` (ECDHE-ECDSA / AEAD-GCM only, matching the ECDSA P-256 server certificate; `TLS_CHACHA20_POLY1305_SHA256` dropped from the offered set). Sub-1.2 (TLS 1.0/1.1, SSLv3), CBC-mode, RSA-key-exchange and 3DES suites MUST NOT be offered or accepted; TLS 0-RTT remains MUST-NOT.

### Added

- **Provisioning-token §2 — single-use + idempotent retry (`04-flows.md`).** A provisioning token authorises exactly one certificate and is consumed on first success; a retry within the token's 24-hour TTL is idempotent (returns the byte-identical certificate and MUST NOT mint a second identity); once the TTL elapses, or if the token is superseded or administratively revoked, it is invalid for all purposes and MUST be rejected with `401 Unauthorized` (`04-flows.md` §2 "Single-use and idempotent retry" + its Error Paths table).

### Changed

- Version cascade `0.6.2 → 0.7.0` across all spec document headers. Doc-consistency cascade: the implementor's guide, conformance suite, root `README`, and architecture diagrams updated from the former TLS-1.3-only wording to the TLS 1.2 floor. The TLS `spec/schemas/` change is limited to `provisioning-response.schema.json`; the conformance-vector corpus is **unchanged** (BLE crypto / HKDF domain-separation labels and the `specRef: v0.6.0` crypto vectors are deliberately left as-is — bumping them would break the key schedule / corpus). `verify-schemas.py` stays `306/306`.

### SDK (lockstep, ADR-001)

- `ospp-sdk-php` + `sdk-ts`: `schemas/provisioning-response.schema.json` re-vendored at the **v0.7.0** lockstep tag (`tlsVersion` enum `["1.2","1.3"]`, default `"1.2"`, floor semantics). Byte-identical to the canonical `spec/schemas/provisioning-response.schema.json`.

## [0.6.2] — 2026-06-22

> **SDK enum catch-up (lockstep, ADR-001).** No spec content change. `ServerSignedAuthReplay` (SecurityEvent type) and error `2018 SERVER_AUTH_NONCE_MISMATCH` were both fully specified in [0.6.1] — schema enum, `security-event.md` §4, `07-errors.md` §3.2, and `03-messages.md` Appendix C — but the hand-maintained enum types in `ospp-sdk-php` and `sdk-ts` had not yet mirrored them. v0.6.2 catches the SDK enums up to the already-vendored schema and bumps all three repos to the same lockstep tag. No wire change; `spec/schemas/` is byte-identical to [0.6.1].

### Changed

- Version cascade `0.6.1 → 0.6.2` across all spec document headers. `spec/schemas/` and the conformance-vector corpus are **unchanged** — schema validation and `verify-all-signatures.sh` stay green on the [0.6.1] corpus (no regeneration).

### SDK (lockstep, no spec change)

- `ospp-sdk-php` + `sdk-ts`: `SecurityEventType` gains `ServerSignedAuthReplay`; `OsppErrorCode` gains `SERVER_AUTH_NONCE_MISMATCH = 2018` (Critical, non-recoverable per `07-errors.md` §3.2, `httpStatus` 401, `auth` category). Values are cross-SDK identical and byte-consistent with the vendored schema. For the BLE Partial-A ServerSignedAuth replay defence (`ble-handshake.md` §4.2.2 check #2).

## [0.6.1] — 2026-06-21

> **Reconciliation + Partial-A (S2 — decisions D2/D3).** Folds reconciliation + Partial-A onto the v0.6.0 BLE-handshake work: reconcile-time financial semantics (N7/N8/N11) and the Partial-A representation (N2/N3/Q4), plus the N9 `eventId` alignment. All signed-format changes ride a **single** conformance-vector regeneration (receipts, transaction-event, ServerSignedAuth + every inline example); `verify-all-signatures.sh` is green (signatures, BLE crypto oracle untouched, schema vectors `306/306`, inline-md idempotent). S2 **does** change `spec/schemas/`, so the SDK schemas re-vendor at the **v0.6.1** lockstep tag — no SDK signing *code* changes (the canonical-JSON serializer is field-agnostic). Server-side build (csms B1/B3) follows in its own window.

### Changed (BREAKING)

- **Signed receipt + envelope are now discriminated (`oneOf`) by session type (N2/Q4).** They carry **either** `{offlinePassId, passCounter}` (pass-form — Full Offline / Partial B) **or** `{authId, sessionId}` (auth-form — Partial A). `receipt-data`, `ble/receipt`, and `transaction-event-request` schemas restructured; `offlinePassId` is no longer unconditionally required. Makes Partial-A reconcilable end-to-end (previously impossible — a no-pass session could not build a conforming envelope and was hard-rejected at gate check #4).
- **`passCounter` added to the signed receipt + envelope (N7).** The pass's app-global monotonic usage counter, echoed by the station into the ECDSA-signed receipt body and the envelope. `06-security.md` §6.1 #10 clarified: "for this pass on this station" is the offline station's *local* anti-replay horizon, not a per-station scoping of the value (the counter is app-global).
- **`authId` + `sessionId` added to the signed receipt + envelope (Q4).** The server-issued Partial-A join key, signed so it is non-spoofable at reconcile.
- **ServerSignedAuth claims gain `durationSeconds` + `creditsAuthorized` (N3).** The authorized budget is now in the **signed** 12-claim body (was 10), so the station's duration clamp (`ble-session.md` §3/§6) is enforceable against a server-authorized value, not an app request — resolving the prose↔schema contradiction (`04-flows.md` §5b vs the claims schema). `ble/auth-response` gains an **unsigned advisory** budget copy for app UX only.
- **Counter-replay `eventId` derivation aligned `check_5 → check_10` (N9).** `authorize-offline-pass.md` §6 now derives the counter-replay SecurityEvent `eventId` over `…check_10:` to match the §5 table (counter-replay = check #10). Deterministic on `(messageId, N)`, so only future audit identifiers change; emitted rows are immutable.

### Added

- **Reconcile gate checks #12 / #13 (N7).** #12 cross-checks the envelope `passCounter` against the signed receipt; #13 hard-rejects a reused `(offlinePassId, passCounter)` tuple (cross-station replay / clone), with a complementary §7 aggregate fraud signal for the disjoint-counter-stream clone. The gate is now 13 checks; `eventId` domain `…reconcile_tx:check_N:` for `1 ≤ N ≤ 13`.
- **Reconcile gate #10 epoch-at-tx-time + revocation-window flag (N8, §6.6).** #10 compares `pass.revocation_epoch` against `epoch_active_at(endedAt)` (server-side bump history; no wire field) instead of the current epoch — a bulk revocation issued after a legitimate offline transaction no longer retroactively rejects it. A pass valid at tx time but since revoked is **accepted-but-flagged** (`revoked_after_tx`) for operator review: a deterministic gate marker, not a §7 score and not a rejection.
- **Partial-A reconciliation branch (§6.7, N2/N3).** Checks #2/#4 branch on the discriminator; the auth-form resolves `authId` against an issued-authorization registry (created + wallet-debited at `POST /sessions/offline-auth`), and derived checks read the registry row.
- **Settle-once wallet reconciliation (§8.2, N11).** A session debited at authorization time (Partial A always; Partial-B offline fallback) is **trued-up** at reconcile (the difference vs the issue-time debit), never re-debited; correlation is server-side on `sessionId` (`reconciled_session_id`) with a shared idempotency key. Specified as a forward guard — the Partial-B authorize-debit path is not yet implemented server-side, so no double-debit exists today.
- **`ServerSignedAuthReplay` SecurityEvent type.** Added across `security-event.md` §4, `schemas/mqtt/security-event.schema.json`, and `03-messages.md`, with a conformance vector — closing the dangling reference from error `2018 SERVER_AUTH_NONCE_MISMATCH`.

### Fixed (S2 adversarial-review corrections)

An independent hostile review of S2 found 2 wire-contract blockers + 9 incompleteness/financial gaps + 4 minors — the green suite was pass-form-only and validated no SecurityEvent, so it missed them. All fixed on `main` before tag:

- **Blockers.** (B1) `2005 OFFLINE_COUNTER_REPLAY`, emitted by reconcile gate check #13 on TransactionEvent, was authorize-time-only in the catalog — added to the `07-errors.md` / `03-messages.md` TransactionEvent scope and its definition generalised to reconcile-time `(offlinePassId, passCounter)` / `(authId, sessionId)` reuse. (B2) `ServerSignedAuthReplay` was in the markdown enum only — added to the JSON schema enum + `03-messages.md` + a vector (above).
- **Financial.** (F1) The §8.2 / §6.7 true-up no longer claims to be "bounded by `creditsAuthorized`": per the **Billing Authority** (`04-flows.md` §6) the server recomputes from the run-time tariff and the user pays the real delivered cost; `creditsAuthorized` caps the authorized *duration*, not settlement credits. (F2) The auth-form receipt **MUST** sign the **server-issued** `sessionId` (not a station-local one), so settle-once correlation holds on every Partial-A reconcile. (F3) Built the real cross-station cumulative `maxUses` / `maxTotalCredits` fraud signal in the authoritative `06-security.md` §7.4 (with the fleet-wide computation that catches the disjoint-counter-stream clone) and collapsed the divergent fraud tables to one source (`reconciliation.md` §7, `04-flows.md` §10, and `guides/implementors-guide.md` §3.6 are now pointers).
- **Completeness.** (F4) The §4.2.1 signing pseudocode is now 12 claims. (F5) The auth-form skip of gate checks #10–#13 is **normative** in §6.1, not just §6.7 prose. (F6) §6.6 settlement is conditional on the full gate (resolves the revocation-window-flag vs later-reject collision). (F7) `offline_pass_id` **MUST** be nullable for Partial-A rows. (F8) The reference signer is now **branch-aware**, and the first **valid auth-form vectors** (signed, verified) + an invalid hybrid close the Partial-A coverage gap. (F9) Stale claim/field counts fixed. Plus 4 minors (citation, #4 wording, `2014`-reuse note, per-station-reset disclosure).

---

## [0.6.0] — Unreleased

> **Status: pending the remaining cryptographic-review gates** before tag/release. v0.6.0 is a **breaking** revision of the BLE / Offline profile handshake (the profile has no executable implementation yet, so this is the cheapest possible moment for a wire break). The **adversarial design review (gate §9.1, design half) PASSED** — zero design break found on paper across impersonation, MITM, replay, AEAD-nonce, downgrade, and forward-secrecy; it produced only honesty/claim-scoping corrections (folded in below), not construction changes. Still required before release: the **executable half at B5** (seven re-confirmation items, listed below) and a **human-cryptographer review** of the final construction. Lockstep SDK (`ospp-sdk-php`, `sdk-ts`) implementation and full conformance-vector regeneration follow in their own change windows; the three repositories tag `v0.6.0` together once the gates pass (ADR-001).

The BLE session-key derivation used `IKM = LTK || appNonce || stationNonce`, but the BLE Long-Term Key is unobtainable by a third-party mobile app on iOS and Android — the derivation was never executable by a real app, and a zero/public LTK turns the OfflinePass into a bearer token. v0.6.0 adopts an authenticated application-layer construction (decision **D1**, [ADR-002](adr/ADR-002-ble-handshake-security-architecture.md)).

### Changed (BREAKING)

- **BLE session key (§6.5).** Derivation is now `IKM = es ‖ ee ‖ appNonce ‖ stationNonce` over a two-operation ECDH P-256 exchange (ephemeral-app × certified-static-station for authentication, plus ephemeral-app × ephemeral-station for full forward secrecy); `salt = "OSPP_BLE_SESSION_V2"`; `info = LP(deviceId) ‖ LP(transcriptHash)` (length-prefixed, closing N23; `stationId` is **not** duplicated — it is already bound via the transcript). Byte-exact pins spelled out: ECDH X-only-left-pad (Pin 1), key-schedule order/widths (Pin 3), and a **normative-MUST** handshake transcript over the **raw reassembled wire bytes** — never a re-canonicalized form, the deliberate opposite of Pin 8 (Pin 4).
- **`Hello` / `Challenge` wire format.** `Hello += appEphemeralPubKey`; `Challenge += stationCert (StationIdentity) + stationEphemeralPubKey`. Compressed-SEC1 P-256 wire encoding pinned (Pin 2). Nonces tightened to exactly 32 bytes (N16).
- **`sessionProof` (N1).** Canonical definition moves to `ble-handshake.md` §4.1: `Base64(HMAC-SHA256(SessionKey, LP(UTF8("OfflineAuthRequest")) ‖ LP(UTF8(passId)) ‖ LP(UTF8(decimal(counter)))))`, where `LP(x) = U16BE(byteLength(x)) ‖ x` — the same length-prefix as the HKDF `info`/transcript, making the input **injective** (no `(passId, counter)` concatenation collisions); `06-security.md` §6.5.1 becomes a pointer. The prior 4-input hex form (`offlinePassId | BE32(counter) | bayId | serviceId`) is **withdrawn** — bay/service binding moves to the authenticated `StartService` in-channel. Spec, the reference tooling (`verify-example-signatures.mjs`, `sign-example.mjs`, `sign-inline-md.mjs`), and the three `sessionProof` vectors were updated **together** (proven by `verify-all-signatures.sh`: HMAC sessionProof ✓, sign-inline-md idempotent ✓).
- **BLE pairing (§6.4).** Demoted to **OPTIONAL** and never a security premise (LESC-only-if-enabled; legacy pairing MUST NOT; no bond-table dependency). Channel security is the application-layer ECDH + StationIdentity certificate + AEAD. Algorithm inventory (§4.1), threat model (T01/T02/T12), §2.4, the implementer checklists, `02-transport` §8.2/§8.8, and `01-architecture` updated to match; the stale `AES-256-GCM` mention in `02-transport` §8.8.2 corrected to ChaCha20-Poly1305.

### Added

- **§6.5.2 StationIdentity certificate.** Server-signed `{stationId, organizationId, stationPubKey, issuedAt, expiresAt}` (OSPP Canonical Form + ECDSA P-256, signed by the same key as OfflinePasses), binding a station's identity to a **dedicated** static BLE ECDH key (key-separated from the mTLS/receipt key, SP 800-56A). Specifies on-device keygen + provisioning issuance, ChangeConfiguration rotation with overlap, the normative **app verification gate** (verify before sending any pass — abort on failure), and a normative residual-risk model (offline-revocation window, server-key freshness, one-station blast radius, relay-not-prevented/impersonation-is). New schema `ble/station-identity.schema.json`; delivered via `provisioning-response.stationIdentity`.
- **§6.5.3 BLE AEAD channel.** Every post-Challenge message is sealed with ChaCha20-Poly1305 IETF (Pin 6, NOT XChaCha) under per-direction keys; 12-byte counter nonce with hard-fail no-wrap (Pin 5); `AAD = transcriptHash` (Pin 7); `{n, ct}` frame (`ble/ble-secure-frame.schema.json`), encrypt-then-fragment over §11. Closes N4 (unauthenticated Start/Stop), N15 (FFF6 receipt confidentiality + re-handshake pickup; resolves the `ble-session` §5 ↔ §13 reconnect contradiction), N17 (unauthenticated rejections).
- **`organization_id` binding at authorize-time** (`authorize-offline-pass.md` §5 check #11, errorCode `2015`), unified with the reconcile-time gate check #7 as one canonical invariant (N9). Also aligns §5 check #5 to read station scoping from the server's stored pass record (N6 spec text).
- New common schema `common/ec-public-key.schema.json` (compressed-SEC1 P-256, Pin 2). Pin 8: canonical-JSON reuse (§4.8) pinned for the certificate and receipt — firmware replicates byte-for-byte; the handshake transcript deliberately uses raw wire bytes instead.
- **Defense-in-depth normative additions (from the design review):** (1) an **intended-station binding** in the §6.5.2 app verification gate — when the app holds an *out-of-band* `stationId` (e.g. a QR code on the physical station) it MUST verify `cert.stationId == intended_stationId`; the unauthenticated StationInfo `stationId` is explicitly advisory-only, never a binding; (2) an explicit **public-key validation MUST** — receivers MUST validate every received P-256 key decompresses to a valid, non-identity curve point (safe-by-construction on P-256 + ephemeral keys, but stated as a mandated B5 conformance test); (3) an explicit **message-ordering MUST** — a station MUST reject a `StartServiceRequest`/session command before an `Accepted` AuthResponse. All three are validation/state obligations — **no** wire-encoding or key-schedule change. A proof-of-possession note was added at §6.5.2 provisioning (PoP not required for v0.6.0; benign, MAY be added later).

### Security review — design gate §9.1 (adversarial, on paper)

The adversarial design review found **no break** in the analyzed classes (impersonation, MITM, replay, AEAD-nonce, downgrade, forward-secrecy); it produced honesty/claim-scoping corrections only — the construction is unchanged:

- **Anti-harvesting claim (§6.5.2)** scoped to fake/unprovisioned stations; the malicious/compromised *provisioned* station that decrypts a presented pass → **N7** (cross-station double-spend, deferred S2/D2) is now named explicitly.
- **Relay claim (§6.5.2)** reformulated: "more resistant than proximity-unlock, **not immune**" — a relay can solicit a remote victim's authorization (range extension); residual = relay + social engineering; explicit user authorization reduces, not eliminates.
- **Anti-replay layering wording** corrected (§4.2.2, §5): the AEAD channel is the first barrier; `appNonce` and `sessionKeyConfirmation` are defense-in-depth behind it (§6.5.1 already framed `sessionProof` this way).
- **T14 (new threat, disclosure):** the plaintext `Hello` leaks the stable `deviceId` before the channel exists → BLE presence-tracking. Privacy, not credential compromise; **accepted residual** for v0.6.0 (a mitigation would touch the validated key schedule — deferred to a future revision, coupled with intended-station binding + the real mobile client B6).

**Executable re-confirmation required at B5** (the verdict above is on paper; sim↔sim must confirm): (1) nonce uniqueness on the wire; (2) altered-frame / tampered-handshake fail-closed; (3) fake-station / cert-replay yields only opaque ciphertext (pass not leaked); (4) whole-session replay blocked by station fresh randomness — test station **and** app RNG; (5) public-key validation rejects bad points; (6) N7 reproduced in sim (confirm it is the only such path, caught by the S2 reconcile gate); (7) forward secrecy empirically (leaked static key + recorded session ⇏ plaintext). A human-cryptographer review of the final construction also remains warranted before tag/release.

### Deferred (tracked, not in this revision)

- **Conformance vectors (T1):** full regeneration for the ECDH / HKDF / AEAD / certificate paths. The `sessionProof` vectors **were** regenerated to the length-prefixed form (raw test key) and the inline §4.1/§7.5 examples recomputed; `sessionKeyConfirmation` is unchanged. **Known-pending:** `verify-schemas.py` fails 4 handshake vectors — `hello-{full,minimal}`, `challenge-{full,minimal}` — which lack `appEphemeralPubKey` / `stationCert` / `stationEphemeralPubKey`. The schema correctly requires the new D1 fields ahead of the vectors; the Challenge vector needs a **signed** StationIdentity (cert-signing tooling is part of T1) and the ephemeral keys must be coherent with the ECDH-derived sessionProof/AEAD corpus, so the handshake vectors regenerate as one coherent T1 batch. (The signature gates — receipts, OfflinePass, ServerSignedAuth, firmware, sessionKeyConfirmation, sessionProof, idempotency, placeholder scan — are green.)
- **N22 / D5:** `organization_id` in the **signed** pass body — `offline-pass.schema.json` does not yet carry it while the prose marks it required (live N5). Adding it to examples awaits the schema + signature + vector change (D5 / S2 / T1).
- **N18:** `common/device-id.schema.json` tightening (cross-cutting common schema; coupled with example/vector normalization → T1). The length-prefixed `info` (Pin 3) already removes the security concern.
- Non-normative mirrors are now aligned: `guides/implementors-guide.md`, the `diagrams/` (README + `.mmd`), and the `examples/flows/**` narrative/derivation blocks are on the v0.6.0 model; **all `spec/**.md` per-doc version headers are 0.6.0**. Remaining at 0.5.x: `conformance/**.md` headers (the vector suite is T1-pending). The `examples/flows/**` embedded BLE message JSON (signed payloads) regenerates in T1.
- Counter-replay `eventId` single-ordinal alignment (`check_5 → check_10`) — **delivered in [0.6.1]**: `authorize-offline-pass.md` §6 derives the counter-replay SecurityEvent `eventId` over `…check_10:` to match the §5 table. The authorize-time §5 positional list is intentionally left as-is; org binding stays unified by `errorCode 2015` + cross-reference, not by index.
- `ServerSignedAuthReplay` SecurityEvent enum entry — error `2018` (`07-errors.md` §3.2) named it as a SecurityEvent `type`, but it was **not yet present in the SecurityEvent enum** (`security-event.md` §4). **Delivered in [0.6.1]**: added to `security-event.md` §4, `schemas/mqtt/security-event.schema.json`, and `03-messages.md` with a conformance vector. (The replay itself was already *rejected* by the §4.2.2 `appNonce` check + the AEAD channel; this completes the SecurityEvent *logging*.)
- **deviceId presence-tracking (T14)** — the plaintext `Hello` leaks the stable `deviceId` (BLE-range privacy metadata, not credential). Accepted residual for v0.6.0; mitigation (ephemeral/rotating `deviceId`, or removing it from the plaintext `Hello`) is a **future design revision** — it would touch the validated key schedule (`deviceId` is in the HKDF `info`) and is coupled with the intended-station binding (§6.5.2) and the real mobile client (B6).

This release subsumes the prior unreleased prose/conformance alignment (below), which on its own required no bump.

---

## Unreleased — prose/conformance alignment + BootNotification HMAC exemption (no wire change, no bump)

Post-Wave-3 consistency audit identified 4 documentation/conformance
gaps where the prose and the conformance test-vectors had not caught
up with schema changes that already shipped in `v0.5.0`. Those
conformance fixes (under **Fixed** below) are **prose-only or
test-vector-only** — the wire-format schemas are unchanged, the
contract that integrators sign against is unchanged.
**No spec version bump.** Same drift-closure pattern as `sdk-ts`
v0.5.1 / v0.5.2 / v0.5.3 explicitly stated "spec NOT bumped" — the
inverse rationale applies here: when the schemas are correct and
only the prose lags, prose-fix without bump preserves semver
discipline (each tag = a wire contract; this lot doesn't change
the wire).

### Changed

- **§5.6 signing classification (normative):** `BootNotification`
  RESPONSE is reclassified from HMAC-critical to **always-exempt** — the
  whole action is now exempt in every `MessageSigningMode`. Its MAC is
  cryptographically void: the session key that would verify the RESPONSE
  is delivered *in* that message, so delivery integrity comes from
  **mTLS**, not HMAC (the REQUEST was already exempt — no key yet). A
  normative correction, but **no wire change** (`mac` is already optional
  in the envelope schema) and **no schema change**, so the no-bump
  rationale above applies. Critical-mode count moves 32→31 (16 exempt).
  Lands lockstep with `ospp-sdk-php` and `sdk-ts` **v0.5.5**.

### Fixed

- **prose/contradiction-resolution:** `profiles/offline/ble-handshake.md` §4.1
  `sessionProof` deviated from the normative `06-security.md §6.5.1`. §4.1
  specified **base64** over a **3-input** HMAC (`type || passId || counter`,
  decimal-ASCII counter) plus a MUST-reject-hex clause — directly contradicting
  §6.5.1's canonical **hex / 4-input** construction (`offlinePassId | BE32(txCounter)
  | bayId | serviceId`, pipe-delimited, hex-lowercase 64 chars). §4.1 now defers to
  §6.5.1 as the single normative definition, and the base64 examples in §4.1 and
  `03-messages.md §4.1` are converted to illustrative hex. `06-security.md §6.5.1`
  is unchanged and is already the reference impl (`ospp-sdk-php
  SessionProofCalculator` follows it verbatim). **No schema change** (the
  OfflineAuthRequest `sessionProof` field carried no encoding `pattern`, enforcing
  neither side) and **no wire change** — the canonical reading was always §6.5.1;
  this only removes the contradicting prose. No-bump rationale above applies.
- **prose:** `profiles/transaction/transaction-event.md` §5 (Response
  Payload) + §5.1 (Response Status Values) + §6 (Processing Rules)
  now enumerate `Deferred` as the 5th `status` value (was 4),
  matching `transaction-event-response.schema.json` since `v0.5.0`.
  §6 step 7 articulates the `Deferred`-vs-`RetryLater` station-side
  contract (no auto-resend; do not delete local copy; cross-links
  to `reconciliation.md §4.2` for the upstream state machine). A
  firmware vendor reading the profile page in isolation now sees
  the same 5-value enum the schema validator enforces.
- **prose:** `03-messages.md §4.1` TransactionEvent response payload
  table + `status` behavior table now include the `Deferred` row,
  mirroring the profile page. Closes the same blind spot for
  vendors using `03-messages.md` as the master message catalog.
- **prose:** `07-errors.md` Appendix A — Quick Reference now lists
  codes 4010 `CSR_INVALID`, 4011 `CERTIFICATE_CHAIN_INVALID`, 4012
  `CERTIFICATE_TYPE_MISMATCH`, 4013 `RENEWAL_DENIED`, 4014
  `KEYPAIR_GENERATION_FAILED`. §3.4 §4.01x has had these since
  `v0.4.x` but Appendix A skipped 4008 → 5000, leaving 5 cert-
  management codes invisible to integrators scraping the Quick
  Reference as the canonical list. Appendix A row count is now
  106, matching §1.1 totals and §3.x details.
- **conformance:** `test-vectors/valid/offline/receipt-full.json` +
  `receipt-minimal.json` now carry `offlinePassId`, `userId`, and
  `deviceId` at the outer level, matching `ble/receipt.schema.json`
  since `v0.4.2`. Prior vectors omitted all three and produced
  2 spurious FAILs on the "valid" side of `tools/verify-schemas.py`;
  re-run now reports `155/155 valid PASS, 147/147 invalid correctly
  rejected, total 302/302 PASS`. The signed inner body
  (`receipt.data`) is unchanged — outer-level identity fields are
  schema-required for symmetry with the signed receipt body per
  `06-security.md §6.2` and do not require re-signing.
- **cosmetic:** `README.md` badges now reflect the actual count of
  messages (`### N.M MessageName` subsections under `03-messages.md`
  = 40, badge was 34) and schemas (47 mqtt + 13 ble + 18 common + 1
  top-level = 79, badge was 67).
- **prose (schema description):** `schemas/common/mqtt-envelope.schema.json`
  — the `source` field description used lowercase `'station'`/`'server'` under a
  PascalCase `enum` (`["Server","Station"]`) and called the LWT a "retained will
  message" (Will Retain is `false`, `02-transport.md §3.4`). The description now
  uses the PascalCase literals and states the broker publishes the will message
  on the station's behalf when it detects the disconnection. Description-only —
  no `enum`/`required`/`pattern` change, no wire change.
- **prose:** `02-transport.md §2.2` now states that the specification-document
  version in each chapter header (e.g. *OSPP Version: 0.5.0*) is independent of
  the wire `protocolVersion` field (e.g. `0.2.1`) — the two evolve separately and
  need not match. Removes a recurring reader trap (header `0.5.0` vs every wire
  example `0.2.1`); the examples are correct and unchanged.
- **prose:** `06-security.md §5.1` selective-signing rationale corrected — it
  claimed "HMAC protects against broker compromise", but §5.2 delivers the
  per-station session key *through* the broker at boot, so a fully-compromised
  broker can forge HMACs. The rationale now scopes HMAC to publish-capable-but-
  not-intercept-capable adversaries (a leaked management-API credential, an ACL
  regression). Explanatory prose only; the signing classification is unchanged.

### Verification

- `tools/verify-schemas.py`: `302/302 PASS, 0 FAIL, 0 SKIP`.
- Wire-format schemas, error-code numeric assignments, enum
  semantics: **unchanged**.
- Cross-repo: `ospp-sdk-php v0.5.3` + `sdk-ts v0.5.3` schemas
  remain byte-identical to `spec/schemas/`; no SDK re-vendoring
  required.

---

## [0.5.0] — 2026-06-06

Lockstep re-synchronization release. The three OSPP repositories (`spec`, `ospp-sdk-php`, `sdk-ts`) drifted out of step through `0.4.x` — `spec` shipped the v0.4.2 Reconcile-Time Gate without matching SDK releases, `ospp-sdk-php` consumed `v0.4.2`/`v0.4.3` for SDK-internal fixes unrelated to spec, and `sdk-ts` stagnated at `v0.4.0`. The next protocol-affecting change (TransactionEventResponse status enum addition) would have collided on `0.4.3` across spec + ospp-sdk-php. v0.5.0 deliberately re-syncs all three to a single version number; see [ADR-001 — Cross-Repository Lockstep Versioning From 0.5.0](adr/ADR-001-cross-repo-lockstep-versioning.md) for the convention going forward.

The wire-affecting change in this release is small and additive: the `TransactionEventResponse.status` enum gains `Deferred`, closing the literal spec gap where `reconciliation.md §4.2:52` mandated the server "MUST flag the gap and defer reconciliation" but the response schema admitted only `Accepted / Duplicate / Rejected / RetryLater`. csms-server already emits `Deferred` on the wire; the schema was the missing piece.

### Added

- **schema:** `transaction-event-response.schema.json` `status` enum extended from `[Accepted, Duplicate, Rejected, RetryLater]` to add `Deferred`, with the same conditional-`reason`-required rule the other three non-`Accepted` values carry. The wire payload for `Deferred` is `{status, reason}` only; per-gap arithmetic (`counterGapExpected`, `counterGapReceived`, `counterGapSize`) flows into the `§6.3` `SecurityEvent.details` object, NOT into the wire response.
- **spec:** `reconciliation.md §4.1` step 4 + `§4.2` step 4 — the wire response on a `txCounter` gap is now stated explicitly as `status: "Deferred"` + a `reason`. `§4.2` step 4 also articulates the `Deferred`-vs-`RetryLater` distinction (operator-manual unblock vs. transient-backoff-retry) and the re-arrival rule: a previously-`Deferred` `offlineTxId` continues to return `Deferred` without re-emitting the `§4.2:52` SecurityEvent.
- **conformance:** `test-vectors/valid/transaction/transaction-event-response-deferred.json` — a positive vector for the new enum value.
- **process:** `adr/ADR-001-cross-repo-lockstep-versioning.md` — formalizes the cross-repo lockstep convention from `0.5.0` forward.

### Fixed

- **spec:** `reconciliation.md §6.3` + `§6.5` — gate-emit-before-INSERT ordering for check #4 (pass-found). Prior wording (v0.4.2) made check #4 the odd one out (SHOULD emit, MAY suppress when FK has fired); that suppression case described a scenario the conforming reconciliation path cannot reach, because the emit happens at the gate-rejection point BEFORE any INSERT is attempted. `§6.3` now states the same MUST + before-INSERT ordering for all 11 checks; `§6.5` (retitled "Belt-and-Suspenders for Non-Gate Paths", was "Pass-Found Belt-and-Suspenders") restructures to make the storage-layer FK's role explicit: it guards code paths that BYPASS the §6 gate (direct DB writes, admin tooling, batch importers), not the conforming reconciliation path. Implementation note: csms-server already emits at handler boundary before any INSERT — the spec wording now matches the de-facto behavior.

### Changed

- **spec / schema / conformance / guides:** version cascade `0.4.2` → `0.5.0` across all spec chapter headers, profile sub-page headers (reconciliation, authorize-offline-pass, offline-pass, ble-transport, ble-session, ble-handshake), guides (Implementor's Guide), and conformance docs. Status anchors only — historical "(v0.4.2)" feature references in note bodies, table cells, and `00-introduction.md` history rows remain as-is.

### Migration

- **csms-server:** none required — the `Deferred` wire value was already being emitted (this release closes the spec gap, not the implementation gap). Outbound schema-validator log noise on `Deferred` responses (logged via `MessageDispatcher.php:151`, non-blocking) goes silent once `ospp/protocol` updates to `v0.5.0`.
- **csms-app / firmware:** the next-gen station MUST treat `Deferred` as "do not auto-resend"; the offline transaction sits in the station's outbox awaiting operator-manual unblock or the missing in-sequence transactions, not exponential backoff. A station that mis-treats `Deferred` as `RetryLater` will re-send the same transaction and re-trigger the `§4.2:52` gap-SecurityEvent path; the server's re-arrival branch returns `Deferred` again without re-emitting, but the client-side behavior is wrong.

### Coordinated with

- `ospp-sdk-php` `v0.5.0` — `TransactionEventStatus::DEFERRED` enum case + `CAPABILITY_NOT_SUPPORTED` + `httpStatus` mapping carry-over from the orphaned `v0.4.3`.
- `sdk-ts` `v0.5.0` — `TransactionEventResponse` discriminated union gains a `Deferred` variant; first release since `v0.4.0`.

---

## [0.4.2] — 2026-06-05

Closes the Phase-3 offline reconcile-time validation gap surfaced post-Phase-3-persist-fix, and folds in the (M) signing-vs-verification inconsistency carried since v0.2.x. The reconciliation profile previously mandated only 4 server actions (dedup, counter-gap, receipt-sig, fraud-scoring) and was silent on re-validation of the offline pass at TransactionEvent time. Mature peer protocol (OCPP 1.6 §4.8 / OCPP 2.0.1 E01.FR.11/FR.12) mandates CSMS re-validation. This release adds a deterministic "Reconcile-Time Re-validation Gate" between receipt-sig verification and fraud-scoring, closes the cross-station replay + cross-organization replay + revoked-after-issuance + fabricated-pass + receipt-payload-tampering + expired-pass-as-fraud-signal gaps, expands the canonically-signed `receipt_fields` to bind the pass / user / device cryptographically, and fixes §6.2 signing pseudocode to hash the canonical bytes directly (matching every existing implementation; closing the (M) base64-vs-canonical interop hole before firmware integration).

Pre-launch context: prod has 0 offline_passes and 0 offline_transactions; no firmware deployments yet. This release is a coordinated upgrade — same shape as v0.3.0 → v0.4.0 SessionEnded vocabulary break. Firmware integration is sequenced after this release to ship against the post-amendment signing format and BLE FFF6 wrapper once, not retrofit.

### Added

- **spec:** `profiles/offline/reconciliation.md` §6 (NEW) "Reconcile-Time Re-validation Gate" — deterministic hard-reject checks applied after receipt signature verification (§5) and before fraud scoring (§7). 11 checks in dependency-ordered canonical order: receipt-envelope cross-checks on envelope-only fields (offlineTxId, offlinePassId, userId) → pass-found → pass-derived checks (pass-user match, signed-deviceId vs pass.device_id, org binding, station binding, expiry, revocation epoch, individual revocation). All failures emit `OfflinePassRejected` SecurityEvent with deterministic `eventId` derived from REQUEST `messageId` per check, mirroring v0.4.1 authorize-time pattern (§6.7).
- **spec:** `profiles/offline/offline-pass.md` §2 — new field `organization_id` (required) on the OfflinePass. Bounds the pass to the issuing organization; enforced at reconcile-time §6 check #7.
- **spec:** `profiles/offline/offline-pass.md` §7 (UPDATED) — "Station-scoped" property clarified to enforce at BOTH authorize-time AND reconcile-time. New "Org-scoped" property row defining organization binding. "Unscoped" semantics: `allowed_station_ids` `null` or `[]` means "any station of the issuing organization" — bounded by org binding, NOT globally any station.
- **error codes:** `07-errors.md` §3.2 — four new codes in the 2xxx range:
  - `2014 OFFLINE_PASS_REVOKED` (Error, non-recoverable) — individual revocation (`is_revoked`), distinct from `2004 OFFLINE_EPOCH_REVOKED` (batch)
  - `2015 OFFLINE_ORG_MISMATCH` (Error, non-recoverable) — pass-org ≠ station-org
  - `2016 OFFLINE_USER_MISMATCH` (Error, non-recoverable) — pass.user_id ≠ envelope.userId
  - `2017 OFFLINE_RECEIPT_MISMATCH` (Critical, non-recoverable) — signed receipt body field ≠ corresponding cross-check target; `details.field` identifies which of `offlineTxId`, `offlinePassId`, `userId`, `deviceId` mismatched
- **schema:** NEW `schemas/common/receipt-data.schema.json` — canonical body that gets serialized via OSPP Canonical Form (§4.8) and base64-encoded into `receipt.data` for ECDSA P-256 signing. 11 required fields + `meterValues` optional (when present); up to 12 signed fields.

### Changed

- **spec:** `06-security.md` §6.2 — **(M) fix:** signing pseudocode rewritten to hash the canonical bytes directly (`digest = SHA-256(receipt_data)`), dropping the prior base64 intermediate. Verification pseudocode clarified to decode-then-hash the canonical bytes (matching the new signing definition). Both sides now converge on canonical-bytes hash, aligning the spec with `EcdsaService` (csms-server + ts-simulator share the same `Ospp\Protocol\Crypto\EcdsaService` from `ospp-sdk-php`) and every other existing implementation. Closes the long-standing (M) interop hole; firmware integrating v0.4.2 will compute the same digest as the server. No implementation changes required.
- **spec:** `06-security.md` §6.2 — `receipt_fields` expanded from 9 fields to **up to 12 fields**: `{offlineTxId, offlinePassId, userId, deviceId, bayId, serviceId, startedAt, endedAt, durationSeconds, creditsCharged, meterValues, txCounter}`. The three new identity fields (`offlinePassId`, `userId`, `deviceId`) are signed to provide cryptographic binding of the receipt to the pass, the user, and the device — not merely envelope claims. `meterValues` remains optional (when present in the transaction payload, it is signed; when absent, it is omitted from the canonical body — implementations MUST NOT sign an empty `meterValues` object). New firmware-timing paragraph: firmware MUST sign per the v0.4.2 receipt_fields definition and the canonical-bytes digest rule from initial integration.
- **spec:** `profiles/offline/reconciliation.md` §2 step 4 — updated server-side processing list from "deduplication, txCounter gap detection, receipt signature verification, and fraud scoring" to include reconcile-time re-validation gate between sig verification and fraud scoring.
- **spec:** `profiles/offline/reconciliation.md` §7 (renumbered from §6) Fraud Detection — "Expired pass used" signal REMOVED (was Low, 20pt). Expiry is now a hard-reject gate check (§6 check #9, errorCode `2003 OFFLINE_PASS_EXPIRED`, severity `Error` and recoverable=`false` at reconcile-time per the context note in `07-errors.md` §3.2). Remaining 6 fraud signals unchanged.
- **spec:** `profiles/offline/reconciliation.md` §8/§9/§10/§11 — mechanical renumber from §7/§8/§9/§10 (Wallet Reconciliation, Conflict Resolution, Example, Related Schemas).
- **error codes:** `07-errors.md` §3.2 — `2003 OFFLINE_PASS_EXPIRED` row retained as-is for the authorize-time semantic (Warning, recoverable=true). Added a context note: at reconcile-time (`profiles/offline/reconciliation.md` §6 gate check #9) the same code is emitted with effective severity `Error`, recoverable=`false`, and SHOULD carry `details.context: "reconcile"` for log clarity.
- **error codes:** `07-errors.md` §1.1 — "2xxx Authentication & Authorization Errors" count updated from 14 to 18 codes. Total updated from 102 to 106 standard error codes.
- **error codes:** `07-errors.md` §4 (Error Code Usage per Message) — TransactionEvent row extended with the new codes + 2003 + 2006. Appendix A Quick Reference updated.
- **schema:** `schemas/common/receipt.schema.json` `data` field description — updated to reference the new `receipt-data.schema.json` and the canonical 11-required + meterValues-optional shape.
- **schema:** `schemas/ble/receipt.schema.json` — `offlinePassId`, `userId`, `deviceId` added to the BLE FFF6 outer wrapper required+properties. Firmware emits the final v0.4.2 wrapper on first integration; no second wire-break.
- **spec:** `profiles/offline/ble-transport.md` §8 Receipt (FFF6) — field table updated to include `offlinePassId`, `userId`, `deviceId` rows matching the BLE schema.
- **spec / schema / conformance / guides:** version cascade `0.4.1` → `0.4.2` across all spec chapter headers, profile sub-page headers (reconciliation, authorize-offline-pass, offline-pass, ble-transport, ble-session, ble-handshake), guides, conformance docs, READMEs.

### Fixed

- **spec:** `06-security.md` §6.2 (M) — see "Changed" entry above. Carried since v0.2.x; closed here because v0.4.2 already opens §6.2 for receipt_fields expansion. Firmware integrating v0.4.1 would have signed `SHA-256(base64(canonical))` while csms-server `EcdsaService` computes `SHA-256(canonical)` — interop break at first integration. The fix aligns spec to the de facto implementation behavior (csms-server + ts-simulator share the same `Ospp\Protocol\Crypto\EcdsaService`); no implementation changes required.

### Flagged as known follow-ups (not in this release)

- Server-originated `FraudDetected` SecurityEvent type — already flagged in v0.4.1; unchanged.

### Migration

This release requires a **coordinated v0.4.1 → v0.4.2 stack upgrade**:

1. **Receipt signing format expansion AND canonical-bytes hash (`06-security.md` §6.2):** firmware MUST (a) sign all 11 required fields plus `meterValues` when present per the new `receipt_fields`, (b) compute the digest over the **canonical bytes directly**, not over the base64-encoded form. Receipts signed under the prior v0.4.1 pseudocode (9-field set, or SHA-256 of base64) will fail signature verification AND the reconcile-time receipt-envelope cross-checks. The server MUST reject such receipts with `2002 OFFLINE_PASS_INVALID` (sig fail) or `2017 OFFLINE_RECEIPT_MISMATCH` (cross-check fail).
2. **Issuance MUST populate `pass.organization_id`** — implementations of the offline-pass issuance path MUST write the issuing organization's id to each new pass. Pre-launch context (no historical passes on prod) — no grace period.
3. **Reconcile-time gate adoption** — server implementations MUST apply the 11 gate checks per `reconciliation.md` §6 before fraud scoring. No transaction may persist if any gate check fails.
4. **BLE FFF6 wrapper** — firmware emits `offlinePassId`, `userId`, `deviceId` at the BLE outer wrapper alongside the signed inner.

Pre-launch context (no firmware deployments; prod `offline_passes` and `offline_transactions` rows = 0) makes the coordinated break clean — no historical receipts to grandfather. The firmware integration sequence is: (a) spec push 0.4.2, (b) server adoption, (c) UAT proof through simulator (negative cases for each gate check), (d) prod deploy, (e) firmware development against the post-amendment server, (f) firmware integration. Order chosen so firmware signs the final format on its first integration run.

---

## [0.4.1] — 2026-06-04

Focused tightening of the SecurityEvent dedup contract — closes one implicit-but-unstated stability rule in the SecurityEvent profile and one SHOULD-level conformance gap in the AuthorizeOfflinePass profile. Both amendments make existing implicit rules explicit and normative; no wire-format change, no schema change, no conformance-test change required. Compliant stations and servers see no behavior change; non-compliant implementations that previously slipped through the SHOULD-level rules now have a clear MUST-level contract to conform to.

### Changed

- **spec:** `profiles/security/security-event.md` §6.2 — added normative **MUST** that the `eventId` assigned at incident detection **MUST** remain stable across all subsequent transmissions and buffered replays of the same logical incident. Closes the implicit-but-unstated stability requirement on which the server's dedup-by-`eventId` contract (`profiles/security/README.md` §3) relies. A fresh `eventId` per transmission attempt is now explicitly forbidden as a protocol-level dedup-defeat. No behavior change for compliant stations.

- **spec:** `profiles/offline/authorize-offline-pass.md` §6.7 — upgraded the server-side SecurityEvent emit from **SHOULD** to **MUST** for signature verification failures (check #1) and counter-replay failures (check #5). Made explicit that these are the only two cases in which the server itself emits a SecurityEvent on behalf of a station-presented credential — other `Rejected` outcomes (expiry, epoch revocation, station mismatch, usage limits, rate limit) are policy decisions, not security incidents, and **MUST NOT** be emitted as SecurityEvents by the server. Added normative requirements on the emitted SecurityEvent: `type` **MUST** be `OfflinePassRejected` (from the spec-defined enum in `security-event.md` §4); `eventId` **MUST** be deterministically derived from the originating REQUEST's `messageId` so that N distinct authorization REQUESTs produce N distinct audit rows (preserving attack-attempt visibility — an attacker probing different forged signatures or replaying the same credential across multiple stations is recorded as N incidents, not collapsed to one); recommended SHA-256-based derivation provided. True QoS 1 retransmits of the same REQUEST collapse via the transport-layer dedup at `02-transport.md` §3.3 before reaching the handler; the audit-layer dedup is defense-in-depth for cases beyond the transport dedup window.

- **spec:** version cascade `0.4.0` → `0.4.1` across all spec chapter headers, guides, conformance docs, READMEs, and badges, matching the v0.4.0 cascade convention.

### Flagged as known follow-ups (not in this release)

- `profiles/core/session-ended.md` profile is missing entirely — the `SessionEnded` action is referenced from `04-flows.md`, the SessionEndReason vocabulary was extended in v0.4.0 (Item 8), and crash-resilience rules were added in v0.4.0 (`05-state-machines.md §2.5`), but no dedicated profile markdown exists. To be authored in a future release.

- Server-originated `FraudDetected` SecurityEvent type — when a server detects fraud via offline-tx reconciliation scoring, no SecurityEvent currently records the **incident** (the server's **reaction** — auto-disable of offline mode, revocation of active passes — is an administrative action and out of scope for SecurityEvent; the incident itself currently has no spec-defined SecurityEvent representation). A new server-originated type and emit rule will be considered in a future release.

### Migration

- No coordinated upgrade required. v0.4.0 implementations interoperate with v0.4.1 implementations on the wire (no schema or message-shape changes). The amendments tighten existing soft rules into hard requirements that compliant implementations already satisfy.

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
