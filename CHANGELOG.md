# Changelog

All notable changes to the OSPP specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in [VERSIONING.md](VERSIONING.md).

---

## [Unreleased]

> **MINOR, non-breaking on the wire, and `schemas/` moves zero bytes.** No message, field, schema,
> enum value or Chapter 08 key is added, removed or retyped; `protocolVersion` stays `0.3.0`; the 86
> schemas and the 334 valid/invalid vectors are byte-identical to `0.28.0`, so no SDK re-vendor of
> schemas is required. What moves is one normative rule, one guide figure, and the wiring of a gate.
>
> **The finding, in one sentence: this specification required receivers to ignore unknown fields
> while every schema it ships forbids them from doing so — and three decisions already taken depend
> on the half the rule denied.** `02-transport.md` §10.1 carried
> `Receivers MUST ignore unknown fields (forward compatibility)`. Measured over `schemas/`: **73 of
> 73** object schemas declare `additionalProperties: false`. Against that row stand `07-errors.md`
> §2.1 (*"an `errorCode` cannot be placed on the wire at all"*, recorded as a known gap needing a
> schema change), `VERSIONING.md`'s exact-match argument (whose worked example is a server that
> *"rejects it on validation"*), and this file's own `[0.26.0]` refusal to widen a closed schema
> three times over, *"not [backward-compatible] for a receiver validating against an older vendored
> copy"*. Three sites need receivers to refuse; one table row required them to accept. The row was
> the outlier.
>
> **And the release before this one shipped three stale version markers that a gate in this
> repository caught and no job ran.** `tools/verify-protocol.sh` — twenty categories, 4180 checks —
> had no baseline constant, so `exitCode = totalFail > 0` made it permanently red on a clean tree,
> and it was wired into nothing. It was the single entry in `check-tool-callers.py`'s BASELINE, and
> the reason had been *recorded* in `verify-signatures.yml` rather than fixed. Its Category 18 had
> been holding three live findings since `v0.28.0` was cut.

### Fixed

- **`02-transport.md` §10.1 — the unknown-fields row.** Replaced with the rule the corpus actually
  implements, and **deliberately without forbidding anything**: a receiver **MAY** validate; one
  that does not **SHOULD** ignore members it does not recognise, as a robustness recommendation
  rather than a guarantee an emitter may rely on; adding an OPTIONAL member stays **MINOR** and
  removing or renaming one stays **MAJOR**; and what makes an addition safe is exact-match
  negotiation refusing the pairing at boot, not the parser. A repair that made adding a field
  illegal would have been worse than the ambiguity. Recorded in
  [KNOWN-ISSUES](KNOWN-ISSUES.md) as DECIDED, with the three dependent sites named.
- **Three document-version sites the `0.28.0` release did not cascade.**
  `guides/implementors-guide.md` at both of its sites — the `**Spec Version:**` header and the
  closing *"This guide covers OSPP …"* line — and `KNOWN-ISSUES.md`'s
  `**Specification-document version:**`, all still reading `0.27.0` against a `spec/README.md`
  front-matter of `0.28.0`. A stale version on the implementor's guide tells the one reader who
  starts there which revision they are implementing, and tells them wrong.
- **`guides/implementors-guide.md` taught 512 KB as sufficient buffering, at both of its sites.**
  §2.7 and the §7 conformance checklist each gave the `MUST` storage level as the minimum without
  the derivation, while `01-architecture.md` §6.5 has said since `0.25.0` that the level **does not
  reach the Category-1 floor** — 1000 TransactionEvents + 1000 SessionEnded + 200 SecurityEvents +
  overhead is **~1.6 MB** — and records the gap as OPEN precisely because raising a mandatory
  storage level changes the bill of materials of every station. The guide is the document read
  *before* the hardware order, so it is the one place the smaller figure is most expensive. **The
  figure is not silently raised** — that would decide the BOM question §6.5 leaves open. Both sites
  now carry the derivation and §6.5's own instruction to build to it. The §2.7 site also gained the
  100% rule (degraded mode) beside the 90% `5111 BUFFER_FULL` rule it already had.
- **`conformance/test-vectors/crypto/canonical-form.json` cited a line range that had moved.**
  `specSection` read *"06-security.md §4.8.1 (lines 677-688)"*; §4.8.1 begins at `:770` today and
  677–688 now lands inside §4.7.3 *Emergency Renewal*, so a reader following the citation arrives at
  certificate-renewal urgency. Repointed to sections without line numbers, matching its sibling
  `ble-handshake-keyschedule.json` — a line number in a citation is a number nothing updates.
- **A post-boot `protocolVersion` mismatch had no rule, and the absent rule was expensive in one
  direction only.** Negotiation is exact match at boot; nothing said what a receiver does when a
  *later* message carries a different value, so refusing was as readable as accepting.
  `02-transport.md` §2.2 now states the rule and §11 carries the scenario row: the receiver **MUST**
  process the message on its merits, **MUST NOT** refuse it for the version, **MUST NOT** emit
  `1007` outside a BootNotification response, **MUST** record the discrepancy, and **SHOULD** alert
  the operator — no error code, no distinct wire status, exactly the disposition `1005`'s row gives
  the counter-discontinuous offline transaction. `1007` stays boot-bound, where 41 sites across 15
  files already scope it. **Why accepting is not the lax choice:** `protocolVersion` is fixed by
  firmware and changing firmware restarts the station, after which CORE-001 makes BootNotification
  the first message — so a version that genuinely moved re-negotiates by construction, and a
  mismatch on a live session is a station malfunction. Refusing is asymmetric: a REQUEST has a
  RESPONSE to carry the code, an **EVENT** has none, so a refusing receiver can only discard — and
  `SessionEnded` and `TransactionEvent` are the sole billing sources for a session that ended with
  no StopService to answer. A delivered session would go permanently unbilled over a metadata
  disagreement that changed nothing in the payload.
- **`3003 SERVICE_UNAVAILABLE` read as a bay-level condition, and the ordinal that discriminates it
  was already on the wire.** The row's causes — hardware absent, disabled, out of consumable — are
  routinely true of **one program ordinal** rather than of the bay, and that ordinal is what
  separates a nozzle refilled tomorrow from a dead bay. **No new code was minted and no schema byte
  moved**, because every transport already carries it: `start-service-response.programNumber` is
  **REQUIRED when `status` is `Rejected`**, `ble/start-service-response` carries the same echo, and
  on REST the ordinal travels as `details.programNumber` in the open `details` member. The row now
  says so, distinguishes itself from `3017` (which is the ordinal naming *nothing*; this code
  presupposes it **is** declared), and states explicitly that the entry **does not branch** — the
  recovery is identical whichever cause holds, so `details` stays OPTIONAL per §1.3 and §1.4's
  branching obligation is not engaged. Recommended Action re-measured at **407** of Appendix C's
  500.
- **`KNOWN-ISSUES.md` gave the Chapter 08 registry as 29 keys, twice.** It is **28**, stated at
  `08-configuration.md` §9 and independently measured by `check-config-ranges.py`, which reads §§2--6
  and §9 separately and reports 28 for both. Three stale line citations in the same entry replaced
  with section references.

### Added

- **`TC-DM-008` Part E — the first conformance case for `5024 UNSUPPORTED_SERVICE`.**
  `update-service-catalog.md` rule 8 is a MUST-level refusal: a catalog naming a `serviceId` the
  station cannot run, or a `bindings` entry naming a `(bayNumber, programNumber)` it never declared,
  **MUST** be answered `Rejected` with `5024` and the previous catalog **MUST** be left in force.
  Measured across the whole corpus, `5024` appeared **0** times in `conformance/` — against `5023`
  at 13, `3001` at 9, `3015` at 6 and `3018` at 5, so it was an absence of *case*, not of search.
  `TC-DM-008` was already the only case that mentions UpdateServiceCatalog at all, and all four of
  its parts bind to `(bay 1, program 1|2|3)` — every one declared — so none of them reached rule 8.
  Part E binds an otherwise-valid entry to program 9 on bay 1, then repeats it on bay 2, because a
  station that checks the program ordinal and not the bay number passes the first and fails the
  second. It asserts the refusal **and** the two things no schema can check: that the previous
  catalog is still in force in full, and that the `catalogVersion` did **not** advance — a partial
  application leaves the server tracking a version that exists on no station, and the closed
  response has no member able to reveal it. The case is behavioural rather than a vector under
  `invalid/` on purpose: the payload is perfectly schema-valid, and only the station knows which
  ordinals it declared.
  **`5025 CATALOG_TOO_LARGE` stays at zero, and deliberately.** Its threshold is the station's own
  capacity and no bound here fixes it — `services` carries `minItems: 1` and no `maxItems` — so a
  portable case would have to invent a number the protocol does not state. Said out loud in both the
  case and the profile rather than left to be rediscovered.
- **`update-service-catalog.md` §7's `5024` row** now says why the code is not `5023` and points at
  the case that exercises it.

### Recorded as OPEN, not taken

- **The anti-downgrade guard compares a label nothing binds to the bytes.** §4.6 signs *the firmware
  image*; §4.6.1 compares *the offered `firmwareVersion` string*, which the signature does not cover
  and which `artifactId` / `manifestDigest` — **0 occurrences each, repo-wide** — do not tie to
  anything. A genuinely signed old image offered under a higher version number passes the signature
  check, the checksum check and the downgrade check, never sets `forceDowngrade`, and therefore never
  raises the `FirmwareDowngradeAttempt` SecurityEvent the guard leans on. Recorded rather than fixed
  because the three available repairs — signing the version string, declaring the pair immutable,
  comparing digests instead of labels — differ in cost and one has to be chosen.
- **The firmware signing certificate is stated to rotate annually and no message can deliver the new
  one.** `update-firmware-request` is closed with no certificate member; `CertificateInstall`'s
  `certificateType` enum is `StationCertificate | MQTTClientCertificate`, closed; Chapter 08 registers
  no key for it and §1.3 makes an unrecognised key a `NotSupported`; the image itself is circular
  where the leaf is the anchor. §4.6 says *"pre-provisioned … (or its CA)"*, and **which of the two
  is the anchor decides whether this is survivable** — naming it is the cheaper half and could be
  done alone. The contrast is what makes it an omission rather than a choice: the station's own mTLS
  certificate has a four-message renewal profile, and `OfflinePassPublicKey` has a registered key with
  a grace period.

### Changed

- **`tools/verify-protocol.sh` gains a ratchet, and a caller.** Exits **0** at its baseline, **1**
  above it, **1** below it (lower the constant, so an improvement cannot silently regress), and **2**
  on a vacuous run — fewer than 3000 checks or a missing category refuses to return a verdict at all,
  because a discovery bug that finds no files otherwise reports 0 FAIL and scores as a pass. That is
  a failure mode this repository has produced twice: a markdownlint invocation that linted zero files
  and exited 0, and a vector validator whose SKIPs hid a mapping gap. A SKIP baseline rides alongside
  the FAIL one, because a SKIP is a check that did not happen and `SKIP(c, reason)` discards the
  reason.
  **Baseline: 6 FAIL, 6 SKIP over 4180 checks** — the same six the script's header has recorded since
  `v0.21.0`. On a clean `a421d6f0` it measured **9**; the failure set diffs against that tree as
  exactly the three version markers removed and **no other entry changed**.
- **`.github/workflows/verify-protocol.yml`** is the caller it never had, in its own job.
  Categories 19 and 20 stay duplicated in `verify-signatures.yml` **on purpose**: this job is a
  ratchet that sits at a non-zero baseline, and a crypto oracle whose finding could be absorbed into
  someone else's constant is not a crypto oracle.
- **`tools/check-tool-callers.py` BASELINE 1 → 0.** Every gate in `tools/` is now reachable from some
  job — 17 of 17 — and a new one added without a caller fails on its first run rather than joining a
  list. `verify-signatures.yml`'s comment explaining why `verify-protocol.sh` stayed unwired is
  corrected rather than deleted; so are its two "reached by no other job" notes.
- **`tools/check-normative-bold.py` BASELINE 439 → 438.** Both numbers **re-derived by running the
  instrument**, neither incremented. The finding set diffs against a clean `a421d6f0` as exactly one
  entry leaving — §10.1's own row — and **none arriving**. The replacement text quotes that row in
  backticks rather than bolding it: bolding a reference to an obligation dresses it as one, which is
  the call `v0.27.0` recorded for a `MUST` used as a noun. The companion re-reads **1183** on both
  trees, so `v0.28.0`'s `+1` is `v0.28.0`'s and nothing here; the fifth chance to get that companion
  wrong was not taken.

### Measured and NOT changed

Recorded so they are not rediscovered. Each was raised downstream against this repository by a reader
who had not opened it, and each was measured here before being answered.

- **`recommendedAction` is in the registry for 118 of 118 codes, not 12.** The `12` is the arm count
  of a *downstream SDK's* `recommendedAction()` accessor, not a property of `07-errors.md` §3, whose
  every row carries a *Recommended Action* cell — measured, **zero empty**. §1.4 already settles the
  follow-on question too: where a cell addresses more than one party, *"the emitted value **MUST**
  preserve the part addressed to the receiver and **MAY** carry the rest"*, and 54 of the 118 cells
  do address more than one. Nothing is owed here; the gap is a transcription gap in a consumer.
  §1.4's own *"a registry cell **MUST** fit the wire bound"* is checked — Category 5 measures all 118
  against Appendix C's `maxLength: 500` — and the largest is `6008` at **483**, so the rule holds with
  17 characters to spare and, as of this release, in a gate something runs.
- **`1007 PROTOCOL_VERSION_MISMATCH` is boot-scoped, in 41 sites across 15 files, without exception.**
  §4.1 lists it on BootNotification alone, §4.2 does not list it at all, and its implicit set is
  `1005`/`2007`/`6001`. A receiver emitting it on post-boot traffic is not exercising a broader
  reachability this chapter grants. **What is genuinely absent** is any statement of what a receiver
  does when a *post-boot* message carries a `protocolVersion` other than the negotiated one —
  `VERSIONING.md` does not raise the case — and that is left open rather than answered here, because
  the two candidate answers differ on whether a billable EVENT is dropped.
- **§4.4's nine endpoints are literal paths, and the question of whether they are "roles" is already
  settled.** §2.4 *Scope* makes an endpoint in scope when this specification fixes *"its path"*, adds
  that *"mention is not definition"*, and states that a server **MAY** expose other HTTP APIs which
  are *"not bound by the Error Object, the registry, or this section"*. A deployment serving a
  different path for the same function is serving an endpoint this specification does not define, and
  is conforming. All nine rows, `POST /me/offline-txs` included, are defined outside §4.4 as well.
- **The receipt's pricing basis is signed already, under other names.** `receipt-data.schema.json`
  carries no price, rate or tariff — and `reconciliation.md` §8.1 rule 1 requires the server to
  **recompute** from the signed `durationSeconds` and the tariff for the signed `serviceId`, making
  the station's `creditsCharged` *"advisory … a cross-check and an operator signal"* that **MUST NOT**
  be the settled amount. Rule 2 states outright that the tariff-in-force construction *"needs no wire
  field for the same reason"*.
- **`stationMaxOfflineTx` needs no maximum for the reason it was asked for.**
  `08-configuration.md` §5 states it is *"a per-pass policy limit on starting further offline
  sessions, **not** a storage capacity"*, and `01-architecture.md` §6.5 already composes the two from
  the other side: at 90% of `MaxOfflineTransactions` the station **SHOULD** refuse new sessions with
  `5111 BUFFER_FULL`, at 100% it **MUST** enter degraded mode, and it **MUST NOT** discard buffered
  events under any circumstances. A pass authorising more than the station can buffer does not
  overrun it.
- **A FirmwareStatusNotification is correlated by construction, so the missing `updateId` is not a
  protocol gap.** `updateId` is **0 occurrences** repo-wide and the notification carries no reference
  to the UpdateFirmware that caused it — but `02-transport.md` §5 serialises commands (*"MUST queue
  it (max 10 pending commands) or reject with `5107 OPERATION_IN_PROGRESS`"*) and
  `update-firmware.md` §7 restates `5107` for exactly this action, so **one update is in flight at a
  time and the protocol enforces it with a code that already exists**. A receiver that cannot
  attribute a notification is not observing an absent field; it is not using the serialisation the
  protocol guarantees. The two firmware items that *are* real are recorded as OPEN above, and
  neither is a field.
- **The five response schemas that cannot carry a refusal are seven, and §2.1 already names all
  seven** — with how a rejection is signalled on each, and the sentence *"This is a **known gap, not
  a permission**"*. `get-configuration-response` is the live residue (*"declares no `status`; a
  rejection is not expressible"*), and it is on the ROADMAP as such.

### Not changed

- `schemas/` — **zero bytes**. `protocolVersion` stays `0.3.0`. Every byte-identity gate in every
  consuming tree stays green across this release.
- `conformance/test-vectors/valid/` and `invalid/` — **zero bytes**, 163 and 171 respectively. The
  only `conformance/` edit is one `specSection` metadata string under `crypto/`.
- **The release cascade is not performed here, and this entry is `[Unreleased]` for that reason.**
  `spec/README.md`'s front-matter and the 22 chapter headers still read `0.28.0`, so the newest
  **released** `## [X.Y.Z]` heading must stay `0.28.0` too — Category 18 compares the two and fails
  when they diverge, which is how this very entry was caught while it was headed `[0.29.0]`. Cutting
  the release means, in one commit: stamp this heading with the number, add the §6 *Document
  History* row in `00-introduction.md`, and move all 25 document-version sites together. As of this
  release `verify-protocol.yml` fails the build if any of the three is missed — which is exactly
  what `0.28.0` did miss, three times over, with nothing running to say so.

---

## [0.28.0] — 2026-09-02

> **MINOR, and it adds no normative text at all.** No message, field, schema, enum value or
> Chapter 08 key is added, removed or retyped; `protocolVersion` stays `0.3.0`; the 86 schemas and
> the 334 valid/invalid vectors are byte-identical to `0.27.0`. What changes is that the
> conformance corpus can now answer a question it had been asking implementers for four releases.
>
> **The finding, in one sentence: this specification asked for a test it could not itself pass.**
> `TC-SEC-001` §50-51 instructs an implementer to *"alter one byte of the `mac` value"* and prove
> the message is refused; `TC-SEC-004` §34, `TC-OFF-002` §122 and `TC-OFF-005` §220 ask the same of
> four other surfaces. No machine-readable vector existed for any of them, and no gate checked one:
> `tools/verify-all-signatures.sh` named **only** `conformance/test-vectors/valid/**` paths, and
> `tools/verify-ble-crypto.mjs` had no tamper branch. Every artefact in this repository proved that
> a **good** signature verifies. Nothing proved that a **bad** one is refused — not here, and by
> extension not in either SDK, both of which vendor this corpus and gate on it.
>
> **Why the vectors could not go where the other negatives live.** A tampered message *satisfies*
> its JSON Schema — that is precisely what makes it a cryptographic test rather than a structural
> one. Every vector under `invalid/` is schema-invalid by construction, and `tools/verify-schemas.py`
> exists to assert that everything there **fails** validation, so a tamper vector placed among them
> would turn a correct gate red for being correct. They belong beside `mqtt-mac.json`, in `crypto/`,
> with the other vector whose truth is arithmetic rather than structural.

### Added

- **`conformance/test-vectors/crypto/tamper-rejection.json`** — 12 vectors across **8** crypto
  surfaces: station receipt, OfflinePass, `sessionProof`, ServerSignedAuth, StationIdentity
  certificate, firmware image, `sessionKeyConfirmation`, and the §5.4 message MAC. Each is
  **structurally valid and cryptographically wrong**, and each carries a **portable** form — the
  exact bytes the signature covers, the signature, and the key inline — so a consumer needs no
  OSPP-specific derivation to use it. Six canonicalisation rules restated downstream would be six
  more chances to get one wrong.
- **Three mutation classes, and all three are load-bearing.** `BODY` moves the message and leaves
  the signature byte-identical, proving the signature binds to **content** — including
  `creditsCharged` raised by one, and a `stationCert.expiresAt` pushed out by a year, which is
  forging a longer-lived identity. `SIG` flips **exactly one bit** of the DER `s` scalar with the
  framing intact, proving the signature is **checked** and not merely parsed — a mutation that broke
  DER framing would be refused by the parser and would prove nothing. `KEY` moves nothing and offers
  a different published test key, proving binding to an **identity** rather than to any valid
  signature.
- **`tools/verify-tamper-rejection.mjs`** — the caller, 89 checks. A vector nothing recomputes is a
  claim, not a check. Four assertions per vector, and the first is what makes the rest mean
  anything: the **untampered base must verify**, because otherwise a mistyped path, a missing key or
  a renamed vector all produce *"verification failed"* and score as a pass. Then the refusal itself;
  then that the mutation is exactly what the vector claims; then that the tampered document **still
  satisfies its JSON Schema**, which is what separates this corpus from `invalid/`. The portable form
  is re-checked by a **second method** — raw `ecdsaVerify` / `createHmac` rather than the file-based
  verifier — because that is the form the SDKs consume.
- **`tools/generate-tamper-vectors.mjs`** — deterministic, no randomness, every mutation a stated
  rule over a committed base, so the corpus reproduces byte for byte from this repository alone.
  `--check` re-derives and diffs without writing, and is wired into the gate: a base vector
  re-signed without regenerating the tamper cases goes **red** rather than quietly meaning something
  else.

### Changed

- **`tools/verify-all-signatures.sh`** gains a *Tamper rejection* section, so the negative direction
  is gated by the same job that has always gated the positive one. It was proven red in three
  directions before landing: un-tamper a signature and the refusal check fires; point a base at a
  missing key and the anti-vacuity check fires; make a tampered document schema-invalid and the
  structural check fires.

### Not changed

- `schemas/` — **zero bytes**. `protocolVersion` stays `0.3.0`. No SDK re-vendor of schemas is
  required, and every byte-identity gate in every consuming tree stays green across this release.
- `conformance/test-vectors/valid/` and `invalid/` — **zero bytes**, 163 and 171 respectively.

---

## [0.27.0] — 2026-08-30

> **MINOR, non-breaking on the wire, and breaking for a conformance claim.** No message, field,
> schema, enum value or Chapter 08 configuration key is added, removed or retyped; `protocolVersion`
> stays `0.3.0`; no SDK re-vendor is required. What changes is that a deployment which passed every
> test yesterday can fail conformance today, on a clause no test can reach. That combination has one
> precedent — `0.9.0`, which made station certificate validation fail-closed with no wire change —
> and it is the shape a security obligation takes when the observable behaviour was already
> permitted.
>
> **One principle came out of this cycle and is worth naming, because it decided the design and
> will decide others: a protective mechanism that refuses down the wrong path becomes the very
> outage it was preventing.** The grace period exists so that a revocation-list outage does not
> disconnect a fleet with nobody on site. Routing its expiry through `1004` — the obvious code, the
> one that already names *revoked* — would have turned away stations holding valid certificates onto
> a `recoverable: false` branch that says *stay off the broker and alert the operator*, so the fleet
> would have gone off and **stayed** off until someone visited every site. The control would have
> produced a worse failure than the one it was built to avoid, and it would have looked correct in
> every review, because the wrong path is the path the vocabulary already had a word for. Choosing
> *where* a refusal lands is part of specifying the refusal, not an implementation detail beneath it.

### Added

- **The broker MUST check certificate revocation, and the decision is written on all three axes the
  option space named.** `KNOWN-ISSUES.md` had carried this since `0.26.0` as *a decision to make*,
  measured and unresolved: the certificate was REQUIRED to carry the CRL's address
  ([`06-security.md` §4.4](spec/06-security.md#44-certificate-requirements)) and **not one normative
  keyword anywhere in `spec/` obliged any party to read it**. The vocabulary a revocation policy
  would be written in was absent entirely — `nextUpdate` **0**, `soft-fail` **0**, `hard-fail` **0**,
  `fail-open` **0**, `stapl` **0**, measured whole-repo over `spec/`, `schemas/` and `conformance/`.
  Revocation is the only mechanism this specification has against a compromised station identity
  before that identity expires, which is **up to a year**; the epoch of §6.6 is OfflinePass-only and
  explicitly avoids certificate revocation lists, and a renewal issues a new certificate without
  withdrawing the old one. A mitigation nothing is obliged to perform is not a mitigation, and two
  threat-model rows described this one as though it were in force. New
  [`06-security.md` §2.1.1](spec/06-security.md#211-revocation-checking) states the obligation one
  bullet below the chain-verification MUST it belongs beside, and extends it to whichever party
  terminates the station's client certificate — the broker and the REST fallback both, because a
  control one leg of the fleet can route around is not a control.
- **Freshness is bounded twice, and the earlier bound governs.** The revocation information must be
  current by its own `nextUpdate` *and* by a configured maximum age. Either alone is defeatable: a
  CA free to publish a `nextUpdate` a year out has bounded nothing, and a maximum age alone would
  ignore an issuer saying its own list is superseded. A list with no `nextUpdate` — the field is
  OPTIONAL in RFC 5280 — is stale on issue. **Nothing is added to the wire**: `thisUpdate` and
  `nextUpdate` are fields of an X.509 artefact the certificate already points at. OCSP remains
  available as a stronger alternative and meets both bounds by construction.
- **A stale or unobtainable list buys one alerted hour, and then the door shuts.** The broker MAY go
  on accepting connections for at most `CertificateRevocationGraceSeconds` from the instant the
  information went stale, MUST refuse afterwards, and **MUST alert on entering the grace, not on its
  expiry** — an alert at expiry carries nothing the refusal does not, since by then the fleet is
  already being turned away. Unbounded permissiveness would mean that whoever partitions the checker
  from the list has revoked revocation; unbounded strictness would disconnect a fleet with nobody on
  site. **The grace value is derived from numbers this document already publishes**: above the band
  it treats as ordinary transient unavailability (`ReconnectBackoffMax`, `ConnectionLostGracePeriod`,
  ceilings 3600 s and 600 s) and well below §4.7.4's own *"Alerts operator after 24 hours"* for an
  unreachable CA — **3600 s**, with `86400` as the freshness default, so the worst case from a
  revocation being published to a revoked certificate being refused is **25 hours** and the operator
  has been told twice, by two independent paths, before the first station is turned away.
- **Two settings, named and ranged, and deliberately outside the Chapter 08 registry.**
  `CertificateRevocationMaxAgeSeconds` (`86400`, `3600--604800`) and
  `CertificateRevocationGraceSeconds` (`3600`, `0--86400`) are broker configuration. §1.1 defines
  that registry as the *station's* key-value store and §1.5 makes every key of a required profile a
  station obligation; neither setting is held by a station or carried by any message, so registering
  them would oblige every station to implement a key it cannot act on — the unconstructible-obligation
  shape this revision series exists to close. Chapter 08 §4 says so where a reader will look, and
  `tools/check-config-ranges.py` **check F** now enforces the boundary rather than asserting it.
- **The clause is verified by declaration, and says so.** No OSPP message reveals whether the broker
  consulted a revocation source, and no conformance case can distinguish a broker that checks from
  one that does not until a certificate is actually revoked. A deployment claiming Standard
  compliance or above MUST state its revocation posture in its conformance report
  ([`conformance/README.md` §5](conformance/README.md#5-reporting-format)). A report omitting it is
  incomplete; a deployment answering *disabled* is not conforming — it may say so, which is the
  point of requiring the answer, but saying so is not a waiver.
- Glossary entries for **CRL** and **OCSP**, which a document opening *"normative definitions for all
  terms"* had never carried, and which now name a MUST.

### Fixed

- **The two refusals are not one refusal — a protective mechanism that refuses down the wrong path
  becomes the very outage it was preventing.** A revoked certificate is refused at the TLS handshake and the
  station's existing `1004` recovery is right for it. A **grace-expiry** refusal turns away stations
  whose certificates are valid, on a transient condition — and `1004`'s non-expired branches are
  `recoverable: false` and say *stay off the broker and alert the operator*, so a CRL outage would
  take the fleet off and **leave** it off, needing an operator at every site: worse than the
  fleet-wide disconnection the grace exists to prevent, caused by the mechanism meant to prevent it.
  That refusal therefore completes the handshake and refuses at the **MQTT CONNECT** with a non-zero
  CONNACK reason code (`0x87 Not Authorized` RECOMMENDED), which the station already answers with
  retry-with-backoff, so the fleet returns by itself when the list does. Completing the handshake
  grants a revoked station nothing — no session, no subscription, no topic access. **No fifth
  `details.cause` is defined**: the four members name what is wrong with the *certificate*, and this
  is a property of the broker, with no carrier since the refusal precedes any OSPP message.
- **§7.5's *"BootNotification from revoked certificate"* row was wrong twice over.** The refusal
  happens at the handshake, so a revoked station never sends a BootNotification —
  [`04-flows.md`](spec/04-flows.md) already said exactly that — and no code in the BootNotification
  set could say why if it did. Replaced by the two rows the mechanism actually has.
- **`04-flows.md`'s revoked-certificate note cited the chain MUST**, because until now that was the
  nearest thing to cite. It cites the revocation obligation.
- **§4.2's *Trust distribution* enumerated how every trust artefact reaches its holder and omitted
  the one that has to keep arriving after provisioning.** The Station CA's revocation list is the
  only artefact in that list travelling to the **broker** rather than the station, which is what the
  freshness bounds exist to hold it to. The CA table's Station CA row now says it publishes that
  list.
- **`security-event.md`'s `CertificateError` row omitted `revoked`** while `03-messages.md`'s enum
  table included it — one condition, two vocabularies, and the one that dropped a member was the
  profile.
- **`TC-SEC-002` now says what its Part E proves and what it does not.** Part E exercises a *test*
  broker the harness configured: passing it shows that a broker configured to check does refuse and
  that the station classifies the refusal correctly, and shows nothing about the broker a deployment
  runs. Part B's certificate-attribute enumeration omits revocation for a reason that is now stated —
  revocation is a property of the issuer's list, not of the bytes presented.
- **§4.7.1 step 8's omission stays an omission and now says why.** The station there is validating a
  certificate it has just been *issued*, minutes old and by construction not revoked; a fetch would
  put a network dependency inside the recovery path for an expiring credential.
- **`check-config-ranges.py` could never flag a range with a zero lower bound.** Found by RED-testing
  the new check F: the derived-by-a-shared-factor excuse was guarded by `lo and hi` on the *outer*
  test, so instead of denying the excuse a zero endpoint skipped the comparison entirely.
  `RevocationEpoch` (`0--2147483647`) had never been comparable either. The guard now scopes to the
  excuse alone; the tree was already clean under the widened check.
- **Two errors inside the `0.26.0` `KNOWN-ISSUES` entry itself**, both present at writing rather than
  drifted: the §4.3 Revocation cell was attributed to §4.2 (three times in the entry, once in this
  changelog's `0.26.0` section, which is left as the historical record it is — the document being
  audited was right, T10's row cited §4.3), and a sentence quoted from **T04 only** was attributed to
  *"T04/T10"*. The entry's `fail-closed` measurement also read *"none about certificates"* where the
  supportable claim is *none about revocation*: one of the eight sites is the `0.9.0` history row on
  station certificate validation.

### Gates

- `check-normative-bold.py` **439 unbolded, unchanged and measured so** — the finding set was diffed
  entry by entry against a `git archive` of a clean `8ce4ee7` and is identical once line numbers are
  stripped. One entry appeared mid-cycle, a bare `MUST` used as a noun, and was reworded rather than
  bolded, because bolding a reference to an obligation dresses it as one.
- **The bolded-span companion was wrong, and this time the instrument was.** It paired `**` over the
  raw file while the finding scan paired over the masked copy — so the phase-inversion the scan's own
  comment records as fixed was still live in the number printed beside it. Four literal `**` inside
  backticks exist under `spec/` (`schemas/**` and an escaped table row in `00-introduction.md`,
  `sess_a1b2****` and `use****@example.com` in `06-security.md`'s redaction rules) and they cost the
  count 8. Re-measured on a `git archive` of `8ce4ee7` with the corrected instrument, `0.26.0` reads
  **1161**, not the 1156 it shipped; this release reads **1182**, so the delta is **+21**, all new
  text. **The gated number is unaffected** — 439 under both instruments on both trees — which is
  exactly why nothing caught it: nothing gates the companion. That is the fourth time this number has
  been wrong and the third time it was this companion specifically; the first three were
  transcription, this one was the instrument.
- `check-config-ranges.py` at `BASELINE = 1`, with check F added (2 broker settings, 2 numeric
  ranges) and RED-tested per sub-check. `check-config-defaults.py` 0 disagreeing, restated-default
  sites **40 → 42**. `check-schema-conditionals.py` unchanged at `BASELINE = 6`.
  `check-tool-callers.py` and `verify-test-nonces.mjs` unchanged.
- `verify-protocol.sh` **4129/4141**, failure set diffed entry by entry against `8ce4ee7` and
  identical — the same 6 (four BLE test-vector-coverage gaps, two BLE schema/spec field mismatches)
  and the same 6 skips. All 86 schemas compile; 56/56 example payloads validate; `markdownlint` is
  clean under the CI invocation on this tree and on `8ce4ee7`.
- **The signed conformance corpus was NOT verified in this cycle.** `tools/verify-all-signatures.sh`
  was not run. The four crypto oracles that were run — `verify-canonical-form.mjs`,
  `verify-mqtt-mac.mjs`, `verify-ble-crypto.mjs`, `verify-test-nonces.mjs` — are all green and are
  **not a substitute for it**: they re-derive the canonical form, the MQTT MAC, the BLE key schedule
  and the handshake nonces, and none of them checks a signature over a payload in the corpus. This
  release changes no payload, no schema and no signed field, so the exposure is believed to be nil —
  but *believed* is the operative word, and it is recorded here rather than left to be assumed from
  a green summary. Anyone cutting from this tag should run that gate before relying on the corpus.

---

## [0.26.0] — 2026-08-28

> **MINOR, non-breaking on the wire.** No message, field, schema, enum value or registry code is
> added, removed or retyped; `protocolVersion` stays `0.3.0`; no SDK re-vendor is required. What
> moves is normative prose, and it moves in the direction of what implementations already do.
>
> **Six obligations were adjudicated that no implementation could have satisfied as written, and
> every one of them was repaired without widening a schema.** The rule applied throughout: a repair
> must not make a legitimate operation impossible. Widening a closed response schema was available
> in three of the six cases and was rejected in all three — every response schema is
> `additionalProperties: false`, so an added member is backward-compatible for the emitter and
> *not* for a receiver validating against an older vendored copy, and that exact failure has already
> been measured once, on the offline pair, where serialising the computed codes made a conforming
> station discard the whole rejection.

### Fixed

- **Nine normative sites required the server to emit a SecurityEvent, and the SecurityEvent profile
  admitted no such thing.** `security-event.md` said *"sent by the station"*, *"**Direction:**
  Station to Server"*, gave every processing rule to the station, and timestamped the record *"on
  the station"*. Against that: `authorize-offline-pass.md` §6 rule 7, `reconciliation.md` §3, §6.3
  and §6.7, and the *Recommended Action* cells of `2014`, `2015`, `2016`, `2017` and `2018` all
  require the **server** to emit one — two of them with an explicitly server-side timestamp, which
  is rule 3 inverted. `reconciliation.md` §6.4 leans its entire argument on that emission: it is the
  second of the *"two routes"* by which a failing gate stays identifiable, and it is the reason the
  offline profile carries no `errorCode`. **An unconstructible rule was load-bearing for a decision
  already taken.** The profile had also already contradicted itself in one row — §4's
  `ServerSignedAuthReplay` entry ends *"the server logs this type at the next reconciliation"*.
  Resolved by **scoping, not by adding**: new §2.1 names two origins — the station-originated wire
  EVENT, and a **server-originated audit record that is never published** and which a server
  **MUST NOT** send to a station. Both validate against the one existing schema. Rules 1–6 are
  scoped to the station form, rules 2 and 3 gain their server-form counterparts, and rule 7 is
  widened so both land in one append-only log under one retention. `authorize-offline-pass.md`
  rule 7 keeps its prohibition and gains the scope it always needed — *at authorize time* — with the
  reason the two gates differ written down.
- **Heartbeat listed four error codes on a RESPONSE that cannot carry any of them, and its own
  profile already said none of them arrive there.** `heartbeat-response.schema.json` is
  `{serverTime}`, closed — no `errorCode`, no `errorText`, and unlike the offline pair no `status`
  either, so a Heartbeat rejection is not merely uncoded but inexpressible. §2.1 had said so for
  releases while §4.1 listed `1005`, `1010`, `5106` and `6001` under a heading reading *"can appear
  in the RESPONSE"*, and `03-messages.md` §5.1 repeated them under *"Error Responses"*. Checked
  one by one against their own registry rows: `1010` is raised by the **station** when no response
  arrives, so a response carrying it would disprove it; `5106` is a station-side clock condition
  diagnosed *from* a successful response; `1005`'s own action is *"Log the malformed message"*, not
  *respond*; and `6001`'s recovery — retry with backoff — is what a station does anyway when a
  Heartbeat goes unanswered. **Not one was ever a response value.** §4.1's row now reads *(none)*
  with the four dispositions beneath it, `03-messages.md` §5.1 answers *"There are none"*, and both
  are reconciled to `heartbeat.md` §8, which had the true behaviours all along.
- **The topology comparison never named its referent, and the literal reading made one retired bay
  stop a station selling.** Six sites compared a station's declared `bays[]` against *"the topology
  recorded at provisioning"* or *"the registered set"* — a set that still contains bays the operator
  has taken out of service. Read that way, a station with one bay physically removed is `3018` and
  `Pending` on every boot for ever, and §1.4 makes a `Pending` station refuse StartService and
  ReserveBay with `3002` on **every** transport: retiring one bay stops the whole station selling,
  with no operator act able to clear it. `05-state-machines.md` §1.5 now defines the **in-service
  topology** once — the bays the server currently records, less any taken out of service — and
  `04-flows.md` step 5, `04-flows.md` A2a, `07-errors.md` `3018` and `4020`, and
  `boot-notification.md` §6.1 cite it. The comparison is not relaxed: it fires on exactly the
  disagreement it exists to catch, and a station still declaring a bay the operator retired is still
  a mismatch. `boot-notification.md` §6.1 also loses the sentence *"Re-provisioning is what changes
  a station's topology"*, which step 5 makes false in every case where hardware actually changed.
- **A `programNumber`-set drift at provisioning was sent to a code that cannot see programs.**
  `04-flows.md`'s *Descriptive drift* rule declared both structural halves of `bays` *"rejected at
  step 5 … with `4020`"*. Step 5 compares `bayNumber` values only; `4020` **MUST** carry
  `details.declaredBayNumbers`/`registeredBayNumbers`, which have no program counterpart; and no
  code in the registry describes a program-set mismatch. The refusal is **moved, not invented**: a
  server **MUST NOT** refuse a provision on a program-set drift, and `3018` — whose comparison is
  over bay numbers **and** program ordinals — catches it at first boot, on a `Pending` that keeps
  the repair channel open. Refusing at provisioning would leave the station without a certificate.
- **`1006 UNKNOWN_ACTION` prescribed one action for two paths.** Its *Recommended Action* read
  *"Respond with REJECTED"*, flat — while `02-transport.md` §11 has said for releases that an action
  **unknown to the protocol** has no RESPONSE schema to reply on and is logged and discarded. That
  is a §1.4 breach inside §1.4's own chapter: a code reachable from two paths whose correct action
  differs, stating one. Both branches are now in the entry, with the note that no `details`
  discriminator is needed because a receiver always knows which path it is on.
- **`2015 OFFLINE_ORG_MISMATCH` was missing from AuthorizeOfflinePass's §4.1 row**, which its own
  profile has carried since check #11 was written.
- **`0.25.0` declared decommissioning out of scope and two sentences did not hear about it.**
  `04-flows.md` §2 still named *"station decommissioned"* a **common cause** of a Boot `Rejected`,
  and its reconnect error table still answered one with *"SSP may have been decommissioned — await
  intervention"*, the opposite of `CORE-011`'s unlimited retry. The third cause that line named,
  *"certificate revoked"*, was wrong on its own ground: a revoked certificate is refused at the
  **connection** as `1004 CERTIFICATE_ERROR`, whose recovery forbids entering provisioning mode, and
  a station refused there never sends a BootNotification at all. Neither cause has a code in the set
  §4.1 assigns to this message. Declaring a subject out of scope is a re-keying, and the same sweep
  rule applies to it.

### Changed

- **`07-errors.md` §4.1's two offline rows are marked *recorded, not transmitted***, pointing at
  `reconciliation.md` §6.4 and at the statement `authorize-offline-pass.md` §7 gains in this
  release — the *recorded, not transmitted* paragraph its reconcile-time twin has had since
  `0.24.0`. The asymmetry meant a reader of the authorize-time profile met a full Error Codes table
  for a response that carries none, with nothing saying so.
- **`ROADMAP.md`'s *Seven MQTT response schemas* entry** no longer carries the Heartbeat position
  alone: it points at the normative statements instead. A ROADMAP is not where an implementer looks
  for a rule, and that bullet had been the only place the position was written down.
- **`tools/README.md`'s precision table had three numbers with no measurement point**, unchanged for
  fourteen releases while all three corpora grew: `check-schema-conditionals` read *"33 claims, 5
  flagged"* against a gate printing **44 / 6**; `check-config-defaults` *"37 sites"* against **40**;
  `check-config-ranges` *"16 sites"* against **18**. The table now carries two dated columns — the
  `v0.12.0` adjudication, kept because it is still true of the tree it was performed on, and today's
  gate output, which is re-runnable. Re-adjudicating is a separate act from re-running, and merging
  the two columns is what produced the drift.
- **`conformance/test-vectors/README.md` sent contributors to a schema that does not exist.** It
  named `schemas/mqtt/mqtt-envelope.schema.json` as where the envelope is validated; the file is at
  `schemas/common/`. Now a working relative link.
- **`tools/check-normative-bold.py`'s v0.25.0 measurement point is corrected and stamped.** The row
  read *"(this HEAD) … 439 unbolded, 1129 bolded spans … +12"*. Re-derived by running the shipped
  instrument over a pristine `git archive` of `573bf6b`: **1139**, so `1117 → 1139` is **+22**. The
  gated number was right; its ungated companion was ten low and the delta computed from it inherited
  the error. Third occurrence in that header, second on the bolded-span companion specifically. The
  row also never received its sha when `v0.25.0` was cut.

### Note

- **`KNOWN-ISSUES.md`'s `FraudDetected` entry rested on a false premise**, now corrected in place:
  *"every existing `SecurityEvent` type is station-originated"* was not true when written — the
  obstacle it cited as the reason for not proceeding had already been crossed at nine sites. What
  `FraudDetected` actually costs is now stated correctly (a shared-enum addition and an SDK
  re-vendor, not a change to what the message means), and it is still not taken.
- **The unconstructible-obligation class reaches ten instances, and its third sub-shape — named in
  its own heading from the day it was written — gets its first member.** *"No field, no code **and
  no actor**"*: the actor leg stayed empty for eight instances because the other two are found by
  reading a rule against a schema, which can be automated, while the actor leg is found only by
  reading a rule against the prose of the artefact it names.
- **Three absences are recorded as decisions to take, and one of them matters now.** **Nothing in
  `spec/` obliges any party to check certificate revocation.** The certificate is REQUIRED to carry
  its CRL Distribution Point and nobody is required to follow it; `02-transport.md` §1.3 **MUST**s
  the broker to verify the *chain*; the two threat rows and the §4.2 architecture cell describe
  broker-side revocation as though it were in force, in indicative mood with no keyword; and the
  station's own §4.7.1 validation checklist does not include it. `1004` names the condition and
  prescribes the refusal, and nothing makes that refusal reachable. The policy vocabulary is absent
  entirely — `nextUpdate`, `soft-fail`, `hard-fail`, `fail-open` and `stapling` return **0** across
  `spec/`, `schemas/` and `conformance/`. Revocation is the only mechanism this specification has
  against a compromised identity before a certificate expires — up to a year — since §6.6's epoch is
  OfflinePass-only and says so. Filed with its option space on three independent axes: the
  obligation, the freshness bound, and fail-open versus fail-closed when the list is unreachable.
  **No decision is taken here.**
- **The conformance harness is named as its own item.** 34 test cases; `conformance/harness/`
  contains two files totalling **zero bytes**, both `.gitkeep`. Every compliance claim about this
  protocol currently rests on one team running one implementation by hand, and the gap widens on
  every release that adds cases to a corpus nothing executes.
- **Maintenance expiry, a configuration revision identifier, and diagnostics cancellation** are
  recorded together, without urgency: each is a missing capability rather than a contradiction, so
  none misleads a reader today, which is exactly why each had been rediscovered from scratch more
  than once.
- **`KNOWN-ISSUES.md`'s counts are now re-derived from its own headings rather than incremented.**
  The previous revision read *24 open* against **25** `## OPEN` headings.
- **The station-hardware-change loop is half closed.** Its option 2 arrived from the reference
  implementation rather than from a new endpoint: the operator corrects the server-side record, the
  next boot compares against the corrected in-service set and matches, `3018` clears without a
  re-provision, and step 5's `4020` is never reached. The **mechanism** stays undefined — §4.4 lists
  every REST endpoint this specification has and none of them adds, removes or retires a bay — so
  that entry stays OPEN.

---

## [0.25.0] — 2026-08-19

> **MINOR, and breaking.** A station reporting `5111` as a Warning, a station that omits
> `previousCatalogVersion` from an `Accepted` catalog response, a station that only `SHOULD`-persists
> its catalog, and a station sized to the old 512 KB buffering figure all stop being conforming.
> `protocolVersion` stays `0.3.0`; no message, field or registry code is added.
>
> **Four reconnaissance reports were adjudicated against the specification rather than against each
> other, and most of what they carried was already closed.** The offline report's nine enumerated
> internal contradictions were closed by `0.24.0`; thirteen of the diagnostics report's fifteen were
> closed by `0.23.0`; three of the four catalog divergences were closed by `0.22.0` and `0.24.0`.
> Two of the reprovisioning report's findings were **false**: the rollback clock reads 60 s in one
> document and 5 minutes in another because they time different events, and
> `05-state-machines.md` §6.5 already does the arithmetic joining them
> (`BootFailureTimeout 60s + HealthCheckTimeout 120s` + margin); and the receipt-key rotation "gap"
> is labelled by `06-security.md` §4.3 in terms as *"a stated limitation, not an omission"*. What
> survived is below, and most of it was found by measuring, not by reading the reports.

### Fixed

- **A Critical station-detected error had three rules naming its SecurityEvent `type`, and eight
  codes had none.** `07-errors.md` §1.2 said *"There is no blanket `HardwareFault`/`SoftwareFault`
  rule"* while both `security-event.md` §3 rows asserted one — `HardwareFault` *"Generated when a
  5xxx Critical error occurs"*, `SoftwareFault` *"when a 51xx Critical error occurs"*. Since `5xxx`
  **contains** `51xx`, every Critical `51xx` code was answered twice, and `5112` was answered three
  times: by name, by the `5xxx` row, and by the `51xx` row. Meanwhile the eight Critical codes no
  §3 row names — `5001`, `5009`, `5018`, `5101`, `5104`, `5105`, `5110`, `5111` — were addressed by
  a SHOULD with no `type` they could carry. Replaced by an explicit two-step selection: **named
  first, then `51xx` → `SoftwareFault`, then any other `5xxx` → `HardwareFault`**, with the ranges
  ordered so they cannot both match. Deleting the blanket rules instead would have left those eight
  unconstructible, which is the shape this repository has a named class for.

- **`5111 BUFFER_FULL` was Critical in the registry and Warning in the profile, and the difference
  is on the wire.** `07-errors.md` states Critical twice (§3 and Annex B); `start-service.md` §7
  said Warning. Severity is not cosmetic here — it decides whether the SHOULD above emits a
  SecurityEvent at all, and `security-event.md` §4 makes Critical the level at which a server
  **MUST** raise an immediate operator alert. The profile cell yields to the registry, as `5024`'s
  did in `0.22.0`.

- **A station that cannot write to storage was told to report a full buffer.** `ble-session.md` §3
  rule 3 sent a failed persist to `5111 BUFFER_FULL`, whose registry entry is *"buffer is at or
  near capacity (>= 90%)"* — a capacity condition on a working store. The right code existed:
  `5103 STORAGE_ERROR`, *"Non-volatile storage (NVS) read or write failure"*. It was simply **not
  in StartService's permitted set**, so the accurate code was unusable and the inaccurate one was
  the only one allowed. `5103` is added to the StartService row of §4.2 and rule 3 now names it.
  No new code, no new field — the class note's own recipe, applied.

- **StartService's permitted codes were stated twice and the two sets disagreed in both
  directions.** `start-service.md` restated them as *"3001--3014, 3017, 5001, 5004, 5111"*, which
  swept in `3007 SESSION_MISMATCH` — a StopService code absent from that file's own §7 table — and
  omitted eight `50xx` codes §4.2 permits. The restatement is replaced by a citation to §4.2, which
  is the only form that cannot drift.

- **The storage contract budgeted zero bytes for a `MUST NOT discard` stream, and its other two
  figures were about a third of what the corpus carries.** `01-architecture.md` §6.5's Category-1
  table gave SessionEnded a Min Capacity of *"1 per session that ended while unable to send"* —
  which states the emission rule and sizes nothing — and the Hardware Requirements table below it
  had no SessionEnded line at all. Measured against the `valid` vectors: TransactionEvent 1091 B
  against an implied 300 B, SecurityEvent 509 B against 200 B, SessionEnded 199 B against nothing.
  607 B of the 925 B minimal TransactionEvent is the signed `receipt`, which **MUST** be retained
  byte-identically. SessionEnded's floor is now **1000, the same as TransactionEvent**, because
  `session-ended.md` rule 1 requires the event for every session terminating without a StopService
  and no offline session can terminate *with* one — the two streams are co-indexed over an outage.
  §6.5 now carries the measured per-message figures with their measurement point and the derived
  totals (~1.6 MB `MUST`, ~3.2 MB `SHOULD`) against levels of 512 KB and 1 MB. **Raising the levels
  is a bill-of-materials decision and is recorded in `KNOWN-ISSUES.md` with its option space rather
  than taken here.** SessionEnded is also added to the Reconnection Transmission Order, which had
  omitted a stream it forbids discarding.

- **OfflinePass validity rides a wall clock the station cannot correct while offline, and the
  specification had already done that analysis and stopped one field short.** `heartbeat.md` §6
  rule 5 puts session elapsed time on a monotonic timer, and the note under rule 2 enumerates what
  does *not* ride the wall clock — billing, anti-replay, the ordering floor. Check #2's `expiresAt`
  and `OfflinePassMaxAge` bounds were not in that enumeration and do ride it, in the one mode where
  both clock sources (`serverTime` on BootNotification and Heartbeat) are unreachable and the
  detector (`5106`, *"detected at Heartbeat time sync"*) cannot fire. Now stated: the station uses
  its best available wall clock and **MUST NOT** refuse a pass for want of confidence in it — a
  refusal rule there would withhold service for the whole of every outage, which is the condition
  the profile exists to serve. And `constraints.stationOfflineWindowHours` is named as a
  **monotonic** delta from the last successful MQTT connection rather than a wall-clock difference,
  which closes the enforcement question `ROADMAP.md` had carried open, using the mechanism rule 5
  already mandates. What is **not** fixed is stated rather than papered over: reconcile check #9
  compares `expiresAt` against the station-supplied `endedAt`, so the server's backstop reads the
  same clock as the fault it backs up. Recorded OPEN with its option space.

- **Complete compliance could not be claimed by any station, however conformant.**
  `conformance/README.md` §2.4 required *"Partial B scenario test cases"* and no such case existed —
  `grep -rl "Partial B" conformance/` matched the README and nothing else. `TC-OFF-005` is that
  case. The same table also listed three `TC-OFF-*` cases where §2.3 reaches all of them by glob, so
  **Complete** enumerated fewer offline cases than the **Extended** level it is a superset of;
  `TC-OFF-004` is now named.

- **Catalog: three sites disagreed about the response, and one document out of three carried the
  weaker word.** `update-service-catalog.md` marked `errorCode`/`errorText` Required=**No** while
  `03-messages.md` said `Cond.` and the schema enforced the conditional — the profile was the lone
  dissenter, and it is the document firmware is written from. `previousCatalogVersion` was a **MUST**
  in processing rule 3, Required=**No** in the same file's table, and optional in the schema; the
  schema now carries the `if Accepted then required` conditional, the table says `Cond.`, and the
  empty string is named as the legitimate value for a station that has never held a catalog.
  Catalog NVS persistence was a `SHOULD` here against a `MUST` in `profiles/device-management/README.md`
  and a second `MUST` in `03-messages.md`; the minority word is raised.

- **`0.24.0`'s settle-once repair landed on the table and not on the sentence, and the sentence is
  the one an implementer reads.** `reconciliation.md` §8.2's forward-guard note still required the
  authorize-time debit and the reconcile true-up to present *"the same `sessionId`-derived
  idempotency key"* — three lines below rule 3, which names `(authId, sessionId)` and
  `(offlinePassId, passCounter)` per form, and below §8's statement that `sessionId` *"is not
  available on the pass-form and **MUST NOT** be required there"*. The path that note guards is the
  Partial-B offline fallback, which reconciles in the **pass-form** — so the surviving sentence was
  unsatisfiable on the one case it exists for, which is exactly what `0.24.0` closed. It is the same
  class instance in a second site, and it was found by writing `TC-OFF-005` against the section
  rather than by re-reading it.

- **AuthorizeOfflinePass declared an idempotency its own validation checks contradict.**
  `03-messages.md` §2.1 said *"server MUST return the same result for the same `offlinePassId`"*.
  A pass legitimately returns `Accepted` and later `4002` when check #6's `maxUses` is reached, and
  a replayed `counter` returns `2005` where the first use returned `Accepted`. Re-keyed to the
  `(offlinePassId, counter)` pair, which is what a retransmission actually repeats. This is the
  third idempotency row found saying the opposite of the rules beneath it, after the two `0.23.0`
  corrected.

- **FirmwareStatusNotification permitted two spellings of the same absence, where its twin permits one.**
  `firmware-status.md` rule 3 read *"**MUST** be omitted **or set to `0`**"* for `Downloaded`, `Installed`
  and `Failed`. `0` and absent were never distinguishable in meaning, only in bytes, so the pair is a
  divergence generator with no expressive gain: a server has to normalise both and a station may pick either.
  The diagnostics twin permits one spelling and has the schema enforce it. Now the same here — one spelling,
  three `allOf` branches, and the one `valid` vector carrying `progress: 0` on `Failed` corrected.

- **`errorText` was mandated on FirmwareStatusNotification by prose the schema neither required nor bounded.**
  Rule 4 demanded it on `Failed`; `firmware-status-notification.schema.json` had no conditional at all, so the
  field was neither required where the prose demanded it nor forbidden anywhere else — a free-text slot on a
  success, in the server column that also holds real failure text. Both halves are now enforced, exactly as
  `0.23.0` had already done on the diagnostics twin. **Neither firmware repair invents a form**: both are the
  conditions already tightened on the other machine, applied to the mirror that was missed.

- **`04-flows.md` cited UpdateServiceCatalog as `[MSG-023]`**, which is CertificateInstall. The
  chapter's own registry has it at MSG-021, and every other citation in the file was already
  correct. (The Chapter 03 numbering defect this resembles was a different one and was fixed in
  `0.23.0`.)

### Added

- `conformance/test-cases/offline/TC-OFF-005.md` — Partial B, station-relayed authorization.
- Two negative conformance vectors, each verified to be refused **for the right reason** by a
  differential — restoring only the missing member flips each to valid:
  `update-service-catalog-response-accepted-missing-previous.json` (exercises the new `Accepted`
  conditional) and `update-service-catalog-request-entry-missing-bindings.json`, which is the first
  vector to prove `bindings` is REQUIRED. The existing negative omitted `services` at top level and
  so never produced a service entry without `bindings`; the constraint had been asserted as text in
  both SDKs and as a rejection nowhere.

### Changed

- `conformance/test-vectors/valid/device-management/update-service-catalog-response-minimal.json`
  gains `"previousCatalogVersion": ""`. It is the one `valid` vector the new conditional would have
  invalidated; it is given the member rather than demoted to `invalid/`, which would have left the
  family without its minimal positive case.

### Decided

- **`offlineAllowance.allowedServiceTypes` is withdrawn, in two steps.** A signed member that no check in
  any of the three gates has ever read. What ruled out defining it was coordination rather than cost: a
  server that began enforcing the list would refuse passes every conformant station of every prior revision
  accepts, so switching it on is a fleet change both sides must make together — and nobody asked for the
  constraint in the life of the field. **Step one, here and non-breaking**: it leaves
  `offlineAllowance.required`, is retained as accepted-and-ignored, servers **MUST NOT** issue it and
  receivers **MUST NOT** reject on it. **Step two, later and breaking**: the member is deleted and the corpus
  re-signed. Two steps because `offlineAllowance` is `additionalProperties: false`, so a one-step deletion
  would invalidate every pass already in circulation at the next station that validated it — a fleet-wide
  credential invalidation as the price of removing a field nothing reads. The wait costs nothing:
  `OfflinePassMaxAge` defaults to `86400` and `0.24.0` re-issues the pass on app start, each consumption and
  each top-up, so circulation turns over within a day. The measured cost of step two is recorded in
  `KNOWN-ISSUES.md` so it is not rediscovered — the member is inside the signed body, so nine standalone
  signed artifacts, twenty markdown-embedded ones across seven documents, and the RFC-anchored BLE key-schedule
  oracle all move together.

- **Station ownership transfer and decommissioning stay undefined — and §1.3 now says so.**
  Measured over `spec/` and `schemas/`: *decommission*, *dispose*, *unregister*, *deregister*,
  *tombstone*, *handover*, *RMA* and *owner* occur **zero** times each, `ownership` once in an
  unrelated sense, and all ten occurrences of *transfer* are the `DataTransfer` message. Two rows
  are added to [Out of Scope](spec/00-introduction.md#13-out-of-scope), with a note saying why two
  rows exist for subjects that were simply absent: every other row there excludes a topic no reader
  goes looking for, while these are topics a reader *does* go looking for and finds nothing — and a
  reader who concludes "not written yet" builds something and expects it to interoperate. The
  reference implementation had already taken this position in its own ADR; the specification had
  not, and an undocumented agreement between one server and one spec is not a protocol decision.
  The two options not taken are kept in `KNOWN-ISSUES.md`, because reopening this means choosing
  between them, and either is a protocol addition rather than a clarification.

### Documented

- **The SDK and specification version lines have crossed, permanently.** The SDK pair released `0.25.0`
  pinning `.spec-ref = v0.24.1`; this tag is `v0.25.0`, which the pair takes up at `0.26.0`. The two numbers
  are now offset, the offset is not fixed, and neither is derived from the other.
  [`VERSIONING.md`](VERSIONING.md#the-two-lines-have-crossed-and-they-will-not-uncross) says so where the
  question is asked. This is a **reading** trap rather than a mechanical one — the numbers were close enough
  for long enough that a reader could treat them as corresponding, and one who does pairs an SDK with the
  wrong contract and gets a green build for it. Swept at this tag: **nothing compares the two lines
  numerically** — `verify-protocol.sh` checks the spec's own version sites against `spec/README.md`'s
  front-matter and reads no SDK version, and no other gate in `tools/` or `.github/workflows/` reads one. A
  comparison **MUST NOT** be introduced; the relationship is carried by each SDK's `.spec-ref` byte-identity
  gate, which is exact rather than ordinal.

### Recorded, not repaired

Three entries added to `KNOWN-ISSUES.md`, each with its option space: the storage levels against the
floors they are said to size; the wall-clock backstop; and **`5019 UPLOAD_FAILED`**, an eighth
instance of the *obligation nothing can carry* class — its condition cannot exist when the coded
response is sent (§8.3 leaves the machine in `Idle`) and the message that does report it has no
`errorCode`.

---

## [0.24.1] — 2026-08-18

> **`0.24.0` raised `MaxOfflineTransactions` past the values its own corpus carries, and nothing
> could see it.** The registry range became `1000--10000`; three sites went on depicting `50` — a
> `valid` conformance vector, and an example flow's payload and its prose summary. All three show a
> server pushing a value a conformant station must now refuse with
> `5109 INVALID_CONFIGURATION_VALUE`.
>
> **No gate reads a configuration value out of a payload and range-checks it.**
> `check-config-defaults.py` compares *restated defaults in prose* against the registry;
> `check-config-ranges.py` compares *range statements* against each other and against schema bounds.
> A literal sitting inside an example's `configuration` block is neither, so all three sites passed
> every gate in the repository, before and after the change. Recorded as OPEN.

### Fixed

- **`conformance/test-vectors/valid/core/boot-notification-response-full.json`**,
  **`examples/flows/01-boot-sequence.md`** (payload and prose): `MaxOfflineTransactions`
  `50` → `1000`. The corpus moves with the rule that invalidated it; neither file is signed, so no
  re-signing was required.
- **`KNOWN-ISSUES.md` shipped in `0.24.0` with a 935-line span duplicated** — nineteen headings
  appeared twice, including the class index added in that release. Cause: a splice that computed
  its end offset from the first match of a heading which, by then, sat *earlier* in the file than
  the region being replaced, so the tail was re-appended instead of cut. The file is rebuilt from
  the `d553820` base with each intended section re-applied once, and verified by heading-uniqueness
  rather than by eye. **Nothing detected it**: `markdownlint` disables `MD024` (duplicate headings)
  in the CI invocation, and `KNOWN-ISSUES.md` is one of the 105 tracked markdown files that
  invocation does not name in the first place.

## [0.24.0] — 2026-08-18

> **The offline profile contradicted itself in eight places, and only one of them was a decision.**
> The other seven were obligations no field, no configuration value, and no actor could satisfy —
> and the specification had already written the correct analysis next to six of them, in prose,
> without ever bringing the rule-bearing sentence into line with it.
>
> **The one that was a decision is now taken: the server is the billing authority, and §8.1 was the
> outlier.** `04-flows.md` §6 binds the server as *"the authoritative billing engine for **all**
> sessions"* and **MUST**-requires it to recompute regardless of the station-reported
> `creditsCharged`; `reconciliation.md` §8.1 steps 1--2 told it to read that number and debit it,
> with no normative keyword. §8.2 of the *same section* invokes Billing Authority by name with its
> own **MUST** — three passages against one step list. §8.1 now recomputes.
>
> **What makes that affordable is a mechanism, not an assertion.** The pass carries a wallet
> snapshot; it is **re-issued** on application start, on each consumption and on each wallet top-up,
> so while the app has a network the figure tracks the wallet. What remains is a **debt**: a
> negative balance restricts service until it is covered, and because the amount is the server's own
> recomputation it is settled by payment rather than adjudication. That also dissolves the
> historical-tariff objection — the server recomputes with the tariff it holds, and any difference a
> tariff change introduces surfaces as balance instead of hiding in a number nobody checked.
>
> **What the measurement changed.** Two premises did not survive it. The station-side limit checks
> were read as an off-by-one — `<` in Chapter 06 against "MUST NOT exceed" in the profile, five
> uses against four — and they are not: measured against the sole implementation of those checks,
> the two texts are the **same rule under different referents**, one counting prior uses and one
> counting including the current, and its usage check refuses at exactly `maxUses` authorizations
> either way. The defect is the unstated referent, and the fix is to name it, not to flip an
> operator. (What that implementation *does* get wrong is counting the same transaction twice —
> a separate finding, below.) And the conformance escape at `profiles/offline/README.md` §5 — that a station
> shipping only the stable MQTT half *"does not need to declare `bleSupported`"* — is closed by
> that file's own §2: BLE carries the phone↔station leg of **all three** offline scenarios, so a
> station without it cannot originate an offline transaction, only reconcile ones it had no way to
> create.

### Changed — breaking

- **`reconciliation.md` §8.1 — the server recomputes the settled cost; it no longer reads it off
  the wire.** Steps 1--2 debited the station-reported `creditsCharged` verbatim, against a
  **normative** Billing Authority rule three passages deep that forbids exactly that. The server
  now computes from the signed `durationSeconds` and the tariff for the receipt's `serviceId` by
  the `03-messages.md` §MSG-007 formula, covering both `PerMinute` and `Fixed`. `creditsCharged`
  remains on the wire as a cross-check and an operator signal and **MUST NOT** be the settled
  amount. **Tariff basis** is stated rather than assumed: the tariff in force at `endedAt` where the
  server retains a catalog history — `epoch_active_at(t)` from §6.6 applies unchanged and needs no
  wire field — otherwise the current tariff, with the basis recorded. Settlement **MUST NOT** be
  withheld for want of the history.
- **A negative balance is a debt that restricts service.** §8.1 rule 5 was *"**MAY** be restricted
  from future offline pass issuance"*; it is now a **MUST**, and it blocks service until the balance
  is covered. `04-flows.md` §6 gained one clause pointing at §8.1 as the home of the offline
  recomputation, so the *"in force when the session ran"* clause has its fallback stated once rather
  than restated.
- **`OfflinePassMaxAge` default `3600` → `86400`, and the key is wired into check #2** rather than
  mandating a refusal nothing performed. Signed validity and the age threshold are **independent** —
  validity is the issuer's and fixed at signing, the threshold is a station's refusal an operator may
  change at any time, and neither caps the other. The one tie is a consistency obligation on the
  **issuer at issue time**: do not sign a validity longer than the value configured on the stations
  that will validate the pass. The default is deliberately **inert**: because validity is capped at
  24 hours, an unexpired pass is by construction younger than 24 hours, so the age bound cannot fire
  at or above `86400` — an operator arms it by lowering the key. Range unchanged at `300--86400`; a
  three-day default was considered and rejected, both because it exceeds that range and because a
  weekend-old pass is refused by **expiry**, not by age.

- **`MaxOfflineTransactions` (Chapter 08 §5) — default `50` → `1000`, range `10--500` →
  `1000--10000`.** `01-architecture.md` §6.5 makes TransactionEvent a Category-1 message with a
  **minimum capacity of 1000** and `MUST NOT` discard, and sizes its `MUST` hardware level
  (512 KB) for exactly that count. The key meant to configure that capacity could not reach it:
  **the maximum legal value was half the mandated minimum**, and the default was one twentieth of
  it. No conformant configuration existed. §6.5 now states that it owns the floor and that a
  configured value **MUST NOT** fall below it, and §6.5's own "90% capacity (900 of 1000 events)"
  is expressed against the configured capacity instead of restating 1000. **Deployment order — smaller than it first
  reads, and measured rather than assumed.** The hazard as originally written was that a station at
  the old default answers `5109` and, ChangeConfiguration being atomic, takes the rest of its batch
  down with it. Against the reference server that cannot happen, for two independent reasons: its
  sole ChangeConfiguration construction site builds a hardcoded single-element `keys` array from
  scalar parameters, so every request it sends is a batch of one; and `MaxOfflineTransactions` has
  no push path at all — it is a registry declaration reachable only by an operator naming it
  explicitly. The atomicity hazard is therefore **the specification's, not this deployment's**: the
  wire schema permits `maxItems: 20`, so a conformant server that batches is exposed to it, and
  `06-security.md` §6.7 already answers that with a **RECOMMENDED** single-key form for
  `OfflinePassPublicKey`. Note also what is *not* the reason: the signing path is content-agnostic
  and constrains no key count.
- **A station performs nine of the ten OfflinePass checks, not ten** (`offline-pass.md` §4,
  `06-security.md` §6.1.1). Both documents said *"MUST perform all 10 checks"* while their own
  prose — sixteen lines above in one, nineteen lines below in the other — already said check #5
  is unrepresentable in the signed pass and that the list is *"ten checks, nine of which a station
  can perform"*. `offline-pass.md` §4 now carries a per-actor table: **station nine**
  (#1--#4, #6--#10), **server eleven** at Partial-B authorize-time. Nothing about BLE is repaired
  by this; the obligation was stated in stable documents and is corrected there.
- **Checks #6/#7/#8 now state their counter's referent** in all three copies (`offline-pass.md`
  §4, `06-security.md` §6.1.1, `authorize-offline-pass.md` §5). Each is stated as an outcome —
  a pass permits `maxUses` transactions and `maxTotalCredits` credits in total — which is
  referent-free and is what a conformance case can assert.
- **`reconciliation.md` §8 — settle-once is keyed on the correlation key each resolved form
  actually carries.** The rule named `sessionId` as the sole key, and the pass-form branch of both
  `transaction-event-request.schema.json` and `receipt-data.schema.json` sets `"sessionId": false`
  with `additionalProperties: false` — so on the one form the rule exists to guard (a Partial-B
  session that fell back to offline after an authorize-time debit) **no implementation could have
  satisfied it**. The key is now `(authId, sessionId)` on the auth-form and
  `(offlinePassId, passCounter)` on the pass-form; the latter is the same app-global counter value
  presented at authorize-time, signed into the receipt, and already required globally unique by
  §6.1 check #13.
- **`profiles/offline/README.md` §5 rule 1 is scoped to the documents that are not EXPERIMENTAL.**
  A station that has built the stable half had no conformant declaration to make: declaring
  `bleSupported: true` obliged it to implement three documents the same file calls unimplementable,
  and the escape offered instead does not exist (see the lede). Conformance against the BLE
  documents becomes claimable when they leave EXPERIMENTAL — which is the position the compliance
  levels already took, three paragraphs earlier.

### Added

- **`offline-pass.md` §6 step 3a — pass re-issuance is normative and has a cadence.** Application
  start, each consumption, each wallet top-up. This is what keeps the wallet snapshot in the pass
  from going stale, and it is the mechanism the recomputation above rests on. A failed re-issuance
  is explicitly non-fatal — the app keeps the pass it holds, because refusing to use a valid pass
  over a network failure denies service for the wrong reason.
- **`KNOWN-ISSUES.md` — a named defect class: *an obligation no field, no code and no actor can
  carry*.** Seven instances, counted by reading the record rather than carried from a note; three
  still open and one a blocker. Two sub-shapes account for all seven: **four** are a mandated
  refusal with no error code or response field to carry it, **three** are a rule keyed on a value
  the authoritative schema forbids on the branch where the rule applies. The settle-once repair
  below is instance 7, and it closed the way the class note now recommends — by finding a value
  already on the wire that carries the same meaning, so no field and no version of anything had to
  change.

- **`offline-pass.md` §6 step 5 — one transaction consumes exactly one use.** The authorize-time
  cumulative count (`authorize-offline-pass.md` §5 check #6) and the reconcile-time fleet-wide
  cumulative factors (`06-security.md` §7.4) read as two independent obligations, and were built
  as two independent counters: measured, a `maxUses: 5` pass burns two uses per transaction and
  sums an authorize-time **estimate** with a reconcile-time **actual** into one `maxTotalCredits`
  total. They are two views of one counter. `(offlinePassId, passCounter)` — already required
  globally unique — makes the advance idempotent by construction.

### Fixed

- **`04-flows.md` §10 sequence diagram put the money before the scoring.** Its steps ran
  *5. Debit user wallet → 6. Run fraud scoring*, while `reconciliation.md` §6 and §8 require the
  gate and the fraud score to run **before** settlement, and §7.4's automated responses (revoke the
  pass, block the account) are meaningless after the debit has landed. The diagram now runs
  dedup → signature → gate → scoring → settlement, and cites the profile section for each step.
  No implementation followed the diagram.
- **`07-errors.md` §1.2 said SecurityEvent is "Station→Server only"** as a blanket, in the same
  release in which the Offline profile requires the **server** to emit one in four places
  (`authorize-offline-pass.md` §6 rule 7; `reconciliation.md` §3 rule 3, §5 rule 4, §6.3). The
  sentence now separates direction of **carriage** — [MSG-012] has no server→station direction —
  from authorship of the audit record. What genuinely has no path is a Critical condition the
  server detects about *itself*, which stays OPEN.
- **`profiles/offline/README.md` maturity notes said "in 0.8"** in three places, fifteen minors
  after 0.8. Restated against the EXPERIMENTAL marker itself, which cannot go stale.
- **`tools/check-normative-bold.py` ratchet lowered 450 → 446**, and
  **`tools/verify-protocol.sh`** re-measured, both with their measurement points, per
  CONTRIBUTING's "No Number Without Its Measurement Point" rule.

## [0.23.0] — 2026-08-18

> **Diagnostics had no state machine, and two SDKs each built one anyway.**
> `spec/05-state-machines.md` defined six machines and none of them was this one; the diagnostics
> profile offered a list of ASCII arrows instead. `ospp-sdk-php` read them as a **server record**
> and got `pending -> collecting | failed`, with `uploaded` and `failed` terminal — **6 edges**.
> `sdk-ts` read them as a **station** and got `Idle -> Collecting`, `Idle -> Failed` **rejected**,
> both outcomes returning to `Idle` — **7 edges**. Each suite pins its own answer: PHP asserts
> `PENDING -> FAILED` is allowed, TypeScript asserts `['Idle','Failed']` is refused. Both green.
> No CHANGELOG on either side mentions the disagreement, and the TypeScript header states the
> reason outright — *"Source: implied from DiagnosticsNotification status values"*. It is the only
> machine in that directory whose source is not a spec section.
>
> **The machine was not invented to reconcile them.** It is derived from what a station does
> between two obligations it already has. `get-diagnostics.md` §6 rule 2 — *"On `Accepted`, the
> station **MUST** begin collecting"* — fixes the entry edge, and fixes it to `Collecting`, which
> is why there is no `Idle -> Failed`: a station that cannot start answers `Rejected` and never
> enters the machine. `diagnostics-status.md` §5 rule 1 — a notification at every transition —
> makes each edge observable. What remains is a file that is built and then sent: **five states,
> seven edges**, `Idle` reported by nothing, `Uploaded` and `Failed` both returning to it.
>
> **Both SDKs break, in the same place from opposite directions.** PHP's terminal `uploaded` runs
> one diagnostics upload and jams — the identical defect its own firmware machine closed at
> `0.20.0` and never carried across. TypeScript has the edge but no trigger for it: nothing on the
> wire says the station is ready again, so a consumer driving the machine from notifications
> reaches `Uploaded` and refuses the `Collecting` that opens the next upload. Neither SDK has a
> bridge from the wire status union to the FSM state union at all, in either direction.

### Added

- **`spec/05-state-machines.md` §8 — Diagnostics Upload State Machine.** Diagram, five states,
  a seven-row transition table, §8.4 mapping states to `DiagnosticsNotification` values, and §8.5
  fixing the division between the station's machine and a server's record of a request. Numbered
  **8** rather than 7 because §7's ordinal and sub-ordinals are cited from five sites; the machine
  takes the next free number rather than renumbering an identifier.
- **`spec/05-state-machines.md` §7.5 — Diagnostics Upload -- Session Constraint.** The mirror of
  §7.4, with the opposite answer: diagnostics is gated on no bay state, and rule 4 forbids
  interrupting a session rather than waiting for one.
- **Eleven test vectors.** Seven negatives for the new `progress`/`errorText` conditionals and for
  the `if`/`then` branches of `get-diagnostics-response` and `set-maintenance-mode-response` —
  branches **no vector had ever entered**, so both `allOf` blocks could have been deleted with the
  entire corpus still passing. Plus `get-diagnostics-request-http-url.json`, the mirror of the
  firmware negative, and valid vectors for the `Uploaded`, `Failed` and `Rejected` shapes.
- **`TC-CORE-004`** — DataTransfer [MSG-025] and TriggerMessage [MSG-026] were Core-mandatory with
  no example payload, no entry in `validate-examples.sh`, and no conformance case. Four example
  payloads added and the gate now covers them.
- **`TC-DM-005` Parts D--F and `TC-DM-007` Parts F--G** — the field restrictions, `5107`, `5020`,
  `3002`, `3014`, the `Faulted` source, the all-bays path, idempotent re-emission, and for both
  cases the restricted-station suppression the firmware twin received at `0.21.0`.

### Changed — breaking

- **`schemas/mqtt/diagnostics-notification.schema.json`** now enforces what the profile said.
  `progress` is permitted only on `Uploading`; `errorText` is **REQUIRED** on `Failed` and
  forbidden on the other three. A station emitting `Collecting`/`progress: 0` — which one shipped
  simulator scenario does — stops being conforming, and the delivered `valid` vector carrying
  *"Upload in progress to remote server"* on `Uploading` has been reworked.
- **Two `Idempotency` rows in `03-messages.md`.** DiagnosticsNotification §6.7 and
  FirmwareStatusNotification §6.5 both read *"duplicate status updates are ignored"*, directly
  above profiles asking for a progress report at every 10% increment, all carrying one status. A
  server implementing them literally discards the stream the SHOULD produces. Both are now bounded
  to a repeat carrying **no new `progress`** — which is what the reference server already did, and
  nothing recorded that it was the correct choice.

### Removed — breaking

- **`DiagnosticsUploadUrl` is withdrawn.** A `Static` string key, default `""`, described as
  disabling diagnostics upload — with no processing rule reading it, no error code reporting the
  disabled state, and `uploadUrl` REQUIRED on every request so nothing ever fell back to it.
  Measured across the reference server, both SDKs and the station simulator: **no implementation
  consumes it.** The registry is 28 keys; Device Management is 3.
  **The cost is operational, not editorial:** an unknown key is `NotSupported`, and
  `change-configuration.md` §6 rule 2 makes the batch atomic — one `NotSupported` entry discards
  every other key in the same ChangeConfiguration. A server still pushing this key finds the whole
  batch ineffective on a `0.23.0` station while it still applies on `0.22.0`. Servers **MUST** drop
  it from any push set before a `0.23.0` station joins the fleet. `ConfigurationKey::DIAGNOSTICS_UPLOAD_URL`
  is a breaking removal for PHP SDK consumers.

### Changed

- **Chapter 03's message numbering is now the `MSG-0NN` registry.** `04-flows.md` claimed the two
  were the same; they agreed for ten rows and were off by one for the seventeen after
  `SessionEnded`, so GetDiagnostics was *19* against `MSG-018`. `27` named TriggerMessage in one
  table of Chapter 03 and StationInfo in the next.
- **`07-errors.md` §4.2, SetMaintenanceMode** now lists `3001`, `3002`, `3005`, `3014`. Its profile
  mandates all four and uses two of them in a normative table; the registry row named two, and
  neither `3002` nor `3014` named the action in its *Used By* row.
- **The archive manifest is one list.** `get-diagnostics.md` §5 gains the `crash/` row that
  `03-messages.md` and `04-flows.md` already described, and both now refer to it rather than
  paraphrasing it into a shorter list.
- **The naming convention holds on every artefact.** `diag_{station_id}_{startDate}_{endDate}` was
  a **MUST** violated by `03-messages.md` (twice), `TC-DM-005`, and a `valid` vector reading
  `diag-20260227.tar.gz`. Three further vectors ended in a time rather than a date.
- **`03-messages.md` §6.8** restated the StatusNotification obligation without the
  restricted-station derogation that overrides it, unconditionally, in the sentence a station
  implementer reads first.
- **Two "consolidated" tables say what they are.** Appendix B claimed *all* timeout values and
  omitted eight; §5.3 said *"Each MQTT command"* over eleven of fifteen. Both now name what is not
  in them.
- **`4010`'s `details.phase` is scoped to the route that can carry it.** The MUST covered
  SignCertificate [MSG-022], whose response schema is closed with no `details` member — and its
  absent-discriminator default would have told a station not to regenerate the keypair the renewal
  consists of. On that transport the phase is `renewal` by transport and needs no discriminator.
  `3015`'s recommended action is likewise split by transport: `details` exists on REST, and the
  three MQTT responses that can carry `3015` are closed without it.
- **`DiagnosticsStatusNotification`** — a message name appearing exactly once in the repository,
  in the sentence introducing the message that is not called that.
- **`get-diagnostics.md` §1** no longer points at *"§8 Configuration"*, which in that document is
  Examples, and records that the key it called the default has been withdrawn.
- **`get-diagnostics.md` §6 rule 1** mandated `Rejected` for a *malformed* URL and no registry code
  describes that refusal. The unreachable half keeps `1011`; the malformed half is recorded as open
  beside the firmware twin rather than left as an obligation no station can discharge.

### Gates

- `tools/check-normative-bold.py` BASELINE **452 → 450**, with its measurement point recorded. The
  ratchet counts *unbolded* keywords, so the section added here costs nothing and one pre-existing
  plain `MUST` was bolded on the way past.
- `tools/check-schema-conditionals.py` unchanged at BASELINE **6**: the diagnostics area
  contributed **zero** candidates to its denominator before this release, because the gate reads
  `description` strings inside schemas and none of the seven schemas in this area carried one. It
  now contributes two, both enforced — 39/33/6 becomes 41/35/6.
- `tools/validate-examples.sh` gains `data-transfer` and `trigger-message`: 52 checks → 56.
- `tools/verify-schemas.py`: 318 → 329 vectors, 0 FAIL.
- `.github/workflows/verify-signatures.yml` no longer quotes `verify-protocol.sh` as failing "from
  9". It has been **6** since `0.20.2`, and that comment is the third stale baseline this cycle.

### Known issues

- **A station whose hardware genuinely changes has no route back into service.** `3018` holds it
  `Pending` and names re-provisioning as the recovery; `4020` refuses the re-provision because the
  registered bay set is the stale one `3018` is complaining about; and no REST endpoint in §4.4
  adds a bay, removes a bay, or edits the set. Four options recorded, with the ordering rule the
  second one needs.

---

## [0.22.0] — 2026-08-18

> **A gate existed for exactly this defect, and the defect walked past it on one word.**
> `tools/check-schema-conditionals.py` exists to flag a schema description asserting a conditional
> the schema does not enforce. `common/service-item.schema.json` wrote *"(applicable when
> pricingType is PerMinute)"*; the matcher's word list wanted `REQUIRED|Required|Present|present|
> MUST be present`. Both have been in the tree since `v0.1.0-draft.1`. The gate ran, reported
> `31 candidates / 28 enforced / 3 flagged`, and exited `0` — indistinguishable from a clean tree.
>
> **The word list was not the whole of it, and that is the part worth keeping.** Swept properly,
> `schemas/**` carries **41** descriptions of the form *"when `<field>` is `<value>`"*. The word
> list selected **31**. The six it missed were **five real findings** plus one description the
> extraction never saw at all: a regex reading a JSON string as `"[^"]*"` truncates at the escaped
> quote inside `ble/auth-response.schema.json`. Three of the five misses carry no lead-in word —
> *"Error code when status is Rejected"*, where the noun phrase **is** the assertion — so no
> synonym could have reached them. The matcher now keys on the shape the docstring always claimed
> to check, and reads descriptions by walking the parsed document. The set moved in one direction
> only: all 3 previously-flagged findings are still flagged.
>
> **A fourth narrowing surfaced while fixing the third.** The compound filter's 40-character window
> ran past the full stop, so writing *"Required when `pricingType` is `PerMinute`, and MUST be
> absent otherwise"* made the gate skip a conditional enforced in the same file. It is now bounded
> by the sentence. Final: **39 candidates / 33 enforced / 6 flagged**, baseline `3 → 6` — the corpus
> did not get worse, the instrument stopped seeing half of each certificate response.
>
> **The pricing conditional is now in the schema, so both SDKs get it without writing a line.**
> Three prose sites stated it and none enforced it, and they disagreed about which fields it
> covered: the profile called the local-currency prices *Optional*, while `03-messages.md` and
> `ble-transport.md` marked all four `Cond.` — the latter contradicted by its own dual-pricing note
> two lines below, which calls them informational. The credit price is required for the declared
> `pricingType` and the other type's prices are forbidden, which is also the first definition
> `3015`'s *"conflicting pricing fields"* has ever had. Censused first: of **51** service entries
> in the repository, **zero** carried a mismatched price, so the prohibition breaks nothing.
>
> **`5024 UNSUPPORTED_SERVICE` mandated a partial application that no implementation performs.**
> The registry said the unsupported entry is ignored and the rest applied; the profile's rule 2
> forbids a partial catalog being active; and no response member can name what was dropped. Both
> station simulators are all-or-nothing, no conformance vector exercises it, and the server persists
> the catalog **it sent** rather than anything the reply reports — so a partial application left the
> server holding a `catalogVersion` for a catalog no station had, undiscoverable. It is now a
> rejection cause, **severity `Warning` → `Error`**: a vendor branching on severity rather than on
> the code changes with it.

### Changed

- **BREAKING — `common/service-item.schema.json` enforces the pricing conditional.** `PerMinute`
  requires `priceCreditsPerMinute` and forbids `priceCreditsFixed` / `priceLocalFixed`; `Fixed` is
  the mirror. A `PerMinute` service with no price validated clean before this release, and the
  conformance vector `update-service-catalog-request-minimal.json` **was exactly that payload**.
- **BREAKING — `ble/available-services.schema.json` gains the same conditional.** Its inline service
  entry carried the identical defect, and stated it in a *third* vocabulary — *"for PerMinute
  services"* — that the widened matcher still would not reach, so its descriptions are normalised to
  the house form. Left alone it would have stayed invisible to the instrument this release repairs.
- **BREAKING — `5024 UNSUPPORTED_SERVICE` refuses the whole catalog** and its severity moves
  `Warning` → `Error` (`07-errors.md` registry row, severity table, `03-messages.md`, the profile).
  With `bindings` REQUIRED the condition is decidable from the payload: an unsupported service is
  one whose binding names a `(bayNumber, programNumber)` the station never declared.
- **BREAKING — `TC-DM-008` Part B now expects `5023`, not `3015`.** A missing required field is
  `5023` under rule 1 of the profile *and* under the registry, which lists *"missing required
  fields"* there and narrows `3015` to a value that could never be valid. Part D's `5023` for a
  duplicate `serviceId` was already correct against that narrowing — the stale artefact was the
  **profile's** `3015` row, not the test's Part D, so this is not the two-way inversion it looked
  like.
- `priceLocalPerMinute` / `priceLocalFixed` are marked Required = **No**, not `Cond.`, in
  `03-messages.md` (both catalog tables) and `ble-transport.md`, agreeing with the profile, the
  schema and the dual-pricing note.
- `3015 PAYLOAD_INVALID` is scoped in the catalog context to a payload-level value wrong in itself —
  an empty `catalogVersion` — since every entry-level failure is `5023` by rule 1.

### Fixed

- `tools/check-schema-conditionals.py`: matches the documented shape rather than a word list; reads
  descriptions from the parsed document rather than by regex over raw text; bounds the compound
  filter by the sentence. BASELINE `3 → 6`, the six being `errorText` **and** `errorCode` in each of
  the three certificate responses — previously it saw only the `errorText` of each.
- `service-item.schema.json` described `pricingType is fixed` where the enum value is `Fixed`.
  `covered_by()` compares case-sensitively, so the correct `if`/`then` alone would have left the
  finding flagged.
- **`bindings` added to all 15 catalog entries embedded in markdown** — 9 in `TC-DM-008` (the
  recon said ten; the tenth `"serviceId"` in that file is a StartService payload), 3 in
  `03-messages.md`, 3 in the profile. It was REQUIRED and present in **every** CI-validated body and
  absent from **every** markdown-embedded one, because no gate parses JSON out of a fence.
- `07-errors.md`'s `5023` row now names the failures it actually covers — missing field, invalid
  pricing type, missing or conflicting price, duplicate `serviceId` — and no longer tells the reader
  to inspect a `details` field, which the closed response schema does not carry.
- Four conformance vectors updated. The two invalid ones gained a price so they keep failing for
  **one** reason: `update-service-catalog-request-invalid-type.json` still fails only on
  `catalogVersion`'s type, `available-services-missing-required.json` only on its absent
  `catalogVersion`.

### Added

- Profile rule 8: the station **MUST** reject the whole catalog with `5024` and keep the previous
  one, and **MUST NOT** apply the remainder and report success.
- Rule 2 states that its subject is *tearing* — no observer may see a half-applied swap — and that
  whether a subset may be applied at all is rule 8's question. The rule was written about atomicity;
  its literal text also forbade permanent subsetting, which is how it came to contradict `5024`.

### Open — recorded, not decided

- **Ten registry rows tell the reader to inspect a `details` field; two schemas declare one**
  (`boot-notification-response`, `security-event`). Fixed here for `5023` only, because that row was
  already being rewritten. Codes `3015`, `3018`, `3019`, `4016`, `4017`, `4020`, `6004`, `6007`
  still carry it and need their own pass — the REST-scoped ones may be answered by an HTTP error
  body no schema in this repo models.
- **No gate parses JSON out of a markdown fence.** That is the mechanism behind the `bindings`
  divergence, not an accident of it, and it will produce the next one.

### SDK and server impact

- **Both SDKs vendor `service-item.schema.json` and the conformance vectors**, so the enforcement
  arrives with the next sync at no cost — but the vendored `update-service-catalog-request-minimal.json`
  must move with it or `ConformanceVectorTest` (PHP) and `SchemaValidator.test.ts` (TS) both go red
  on a vector that is no longer valid. The BLE change reaches PHP only: `sdk-ts` skips the entire
  `offline` category.
- **Server:** no change is required by this release, and one is now visible without it — the
  outbound catalog is built through `MessageBuilder` rather than `MessageFactory`, so nothing
  validates it against the schema that now carries the rule.

## [0.21.0] — 2026-08-17

> **`0.20.0` refused UpdateFirmware to a `Pending` station, and the refusal was unconstructible.**
> `update-firmware-response.schema.json` requires `errorCode` **and** `errorText` on every
> `Rejected`, and the nine codes `07-errors.md` §4 lists for UpdateFirmware — `5014`, `5015`,
> `5016`, `5017`, `5018`, `5103`, `5107`, `5112`, `1011` — contain nothing that describes a
> restricted station. A station obeying the rule emitted either a schema-invalid response or a code
> meaning something else. That is the class `0.20.0` repaired two paragraphs away, where a
> notification status the schema forbids made a **MUST** unobeyable; it shipped a second instance of
> it in the same release.
>
> **Its premise was contradicted 600 lines down its own chapter.** The refusal rested on
> FirmwareStatusNotification being *"the entire account of the update"*. §6.6's mapping table
> already gave the update's terminal state, `Activated`, no notification value and said in terms
> that it is *reported via BootNotification [MSG-001]* — and `firmwareVersion` is **REQUIRED** on
> every BootNotification, which a restricted station **MUST** keep sending at `retryInterval`
> without limit. The outcome travels on the one message the restriction **compels**, and it arrives
> sooner than from an `Operational` station, which need never boot again. The account was the only
> one for a **bounded** interval and was read as permanent.
>
> **The citation that supported it was a misquotation, and its correction is why nothing cascaded.**
> The decision cited `07-errors.md`'s `1007` entry for *"cannot be handed a firmware update while
> **restricted**"*. That entry says *"while it is **rejected**"* — as do all five other sites
> carrying the argument (`VERSIONING.md`, `04-flows.md`, `boot-notification.md` §6, `TC-CORE-001`
> step 45 and failure criterion 9). Every one is about `Rejected`, where the limit is **structural**:
> no session key, and signing fails closed in both directions, so no command can be delivered or
> accepted. **All six are unchanged by this release**, which is the tell that they were never
> evidence for refusing in `Pending`.
>
> **So: `Accepted`, with every notification suppressed — option 2 of the recorded option space,
> scoped to `Pending` alone.** The station downloads, verifies, installs behind the same install
> gate and reboots; nothing about the update changes but the reporting, which is **suppressed, not
> deferred**. `Rejected` is untouched and untouchable. **The discriminator's second clause is kept
> verbatim** — it was the reading that failed, not the test — and gains the rule for applying it:
> look for the later account on **any** message the station may send, and refuse only when no
> message it may ever send would carry the outcome. Option 3 stays rejected on `0.19.0`'s ground.
>
> **MINOR, and breaking for anything that implemented the refusal** — which is four days old, so the
> exposure is one release wide. `protocolVersion` stays **`0.3.0`**, no schema changes, and
> **nothing is added to any registry**: the reversal is the one outcome that needs no new error code,
> whereas keeping `0.20.0` would have required one.

### Changed

- **spec:** **UpdateFirmware to a `Pending` station is `Accepted`, and its FirmwareStatusNotifications
  are suppressed** — `05-state-machines.md` §1.4's table row, and `update-firmware.md` §5 rule 9,
  which additionally states in its own paragraph why `Rejected` is not and cannot be covered. The
  update runs in full behind the install gate of §7.4; the server reads the result from the
  `firmwareVersion` of the next BootNotification, whether that boot is answered `Pending` or
  `Accepted`.
- **spec:** **the discriminator gains its application rule, not a third clause.** §1.4 now says the
  later account may arrive on any message the station may send — including one the restriction itself
  compels — and that a command is refused only when no such message exists. The clause still refuses
  TriggerMessage for a StatusNotification or a MeterValues, where nothing later restates the
  suppressed reading.
- **spec:** **§1.4 states that the two restricted-state permissions are two mechanisms with one
  reason, and not two exceptions to one rule.** The origination test governs what the station
  **sends** (BootNotification, SignCertificate); the discriminator governs what it does with a
  command it **receives**. They run in opposite directions and merging them would invite the question
  `0.19.0`'s test exists to refuse — whether FirmwareStatusNotification repairs the station's
  standing. It does not, which is exactly why it stays forbidden.
- **spec:** the station FSM's **`Reboot` row named one `From` state** and now names three
  (`Operational, Pending, Rejected`). This **adds no edge**: `Pending -> Booting` and
  `Rejected -> Booting` are already listed under *`retryInterval` elapsed*, so a conformance check
  counting `(from, to)` pairs sees the same number as before — only the trigger coverage widens. Two
  of the three were already reachable and unlisted, since Reset is answered normally while `Pending`
  and a watchdog or a power cycle is physical.

### Fixed

- **spec:** **the stall rule is suspended, not scoped, while a station is restricted.**
  `firmware-status.md` §6 rule 3's five minutes run from *"the later of the last notification and the
  moment the gate opens"*, and on a restricted station **both anchors are absent rather than late**:
  no notification is ever sent, and the server holds every bay at `Unknown`, which is the very thing
  the `Verified` scoping leans on (*"it holds the bay states the gate turns on"*). A server running
  the timer would fire on **every** such update, and the remedies the rule authorises are a re-issue
  or a **Reset** — a Reset during `Installing` is an interrupted partition write. `0.20.0` rejected
  option 2 partly for needing this exception, in the same release that had already granted rule 3 one
  for the `Verified` wait.
- **spec:** **the same defect in the twin rule, pre-existing and never scoped.**
  `diagnostics-status.md` §5 rule 6 is the identical 5-minute rule for GetDiagnostics, which has been
  answered `Accepted` while `Pending` with its events suppressed since before this arc — so that
  timer has been firing on healthy uploads all along. It has no BootNotification equivalent and needs
  none: the archive is an HTTP PUT to a URL the command supplied.
- **spec:** **an OCPP citation wider than its source.** §1.4 read *"the CSMS is free to issue
  requests"*, citing *B02 Cold Boot — Pending*. `B02.FR.01` names four Provisioning use cases and no
  others, and `B02.FR.05` has the station reject a remote start or stop outright. **OCPP does not
  decide the firmware question in either generation**: 1.6 §4.2 forbids the Central System exactly
  two messages while Pending, neither of them a firmware command, and 2.0.1's Firmware Management
  block never mentions registration status. Restated at the altitude the text supports, with the
  silence named — the decision rests on this specification's own grounds.
- **spec:** `05-state-machines.md` §6.6 states that the mapping emits **nothing** on a restricted
  station and that §1.4 overrides the *Action* column of §6.3, which §7.1's precedence rule already
  implied for every machine in the chapter but no firmware site said.
- **examples / conformance:** two residues of `0.20.0`'s install-gate sweep, both stating bay state
  as an **acceptance** condition when the gate is on the install —
  `examples/flows/12-firmware-update.md` Step 3 (*"verifies it is not currently servicing a bay"* as
  part of validating the request) and `TC-DM-002` precondition 3, whose parenthetical gave the same
  reason for what is only a determinism precondition.
- **spec:** a mis-citation inherited from the rule being replaced. `update-firmware.md` rule 9 cited
  the stall timer as *"§6 rule 3"*, but §6 of **that** document is the *Download and Install Flow* —
  the stall rule is `firmware-status.md` §6 rule 3, and has never lived in `update-firmware.md`. Now
  cited by file.
- **guides:** `implementors-guide.md` §2.14 told a station to ACK `Accepted` and send progress events
  unconditionally — correct for `Pending` after this release, but silent on the suppression. It now
  states which step to skip, and warns server implementers off the stall timer.

### Added

- **conformance:** **`TC-DM-002` Part E — firmware update while `Pending`**, the first Part in that
  case to run against a restricted station. It verifies `Accepted`; verifies silence across the whole
  download and install **plus five further minutes**, so a server applying the stall rule would have
  fired inside the observation window; verifies no Reset or re-issue arrives in it; and verifies the
  new `firmwareVersion` on a boot that is **still answered `Pending`**, which is the step the whole
  Part rests on. Three expected results and four failure criteria, one of which names what a
  conforming `Rejected` would have had to contain and cannot. Before this the `Pending` command table
  was enforced by prose alone — and for its other rows it still is: no gate in `tools/` reads it.

---

## [0.20.2] — 2026-08-17

> **`verify-protocol.sh` reported nine findings and three of them were the checker's own
> assumption.** Two of its categories held that `spec/03-messages.md` is the only place a message
> can be documented. It is not: `ble-secure-frame` is specified in
> `profiles/offline/ble-transport.md` and `06-security.md`, `station-identity` in
> `ble-handshake.md` and `06-security.md`, and the field tables of the BLE messages live in the
> offline profiles — `durationSeconds` appears in seven files under `spec/`, four of the six
> `receipt` members in three. **Not an exception to add; an assumption to correct** — and the same
> instrument defect this repo has now corrected three times in one arc: a gate asserting a
> narrower home than the corpus has.
>
> **Nine to six.** The criterion is deliberately exact rather than fuzzy — a document *documents*
> a schema when it names the schema **file**, which the offline profiles do outright — so a
> genuinely orphaned schema, named nowhere, still fails. Verified: injecting an undocumented member
> into `ble/hello.schema.json` is still caught.
>
> **PATCH.** Only `tools/verify-protocol.sh` changed. No chapter, profile, schema, vector or
> conformance case; `protocolVersion` stays **`0.3.0`**. Pin-only for both SDKs and the server.

### Fixed

- **tooling:** Category 11 (*Message ↔ Schema Coverage*) accepts a profile document as a home.
  **2 findings closed**, and the category is now 62/62.
- **tooling:** Category 13 (*Schema ↔ Spec Field Matching*) treats a field documented in a profile
  that names the schema as documented. It suppresses **one direction only**: a profile document
  carries the field tables of *every* message it specifies, so unioning them into the spec-side set
  turned the other direction into **60 false failures** on the first attempt. The count stays 2 but
  their content shrank — `auth-response` from two members to one, `receipt` from six to two.
- **tooling:** Category 6 (*Config Key Consistency*) exempts `ConnectionTimeout`, per key and with
  its reason. A configuration key restated nowhere else is the **correct** state: the Chapter 08
  registry is its single normative home, and a restatement elsewhere is a second copy that can
  drift — which is what `check-config-defaults.py` exists to catch. `ConnectionTimeout` is
  transport-local, bounding the MQTT connect attempt before any OSPP message exists, so nothing in
  the protocol observes it, branches on it, or reports it. **1 finding closed**, category now 87/87.

### Remaining — and still not wired

The six survivors are **all BLE**, all in a surface marked EXPERIMENTAL with three open blockers:
four schemas with no test vector (`ble-secure-frame`, `station-identity`, valid and invalid each),
and two field gaps (`ble/auth-response.creditsAuthorized`; `ble/receipt.passCounter`, `.authId`) —
members documented for their **MQTT siblings** but not in any document specifying the BLE message.
Vectors written before that surface is implementable would prove nothing.

`verify-protocol.sh` therefore **stays unwired**, and remains the single entry in
`check-tool-callers.py`'s baseline. Six coherent findings read better than nine mixed ones, but the
job state is what a CI check communicates, and a job that is always red communicates nothing: a
seventh finding — in any category — would arrive into an already-red job and be invisible. That is
the same inverted signal as the two bugs fixed in `0.20.1`. What would make it wireable is one
exemption list of the same shape as `ConnectionTimeout`'s, naming those six with their reasons; it
is not written here because whether a real defect in an experimental surface should be exempted or
fixed is a decision, not a cleanup. **The gap is not silent either way** — the census fails if it
grows.

---

## [0.20.1] — 2026-08-17

> **Nine of the fifteen gates in `tools/` were reachable from no job at all.** Not failing —
> *unstarted*. `tools/verify-all-signatures.sh` has always passed and nothing has ever run it, so
> the entire signed-conformance guard existed only as something a person could type: every vector
> signature against five committed keys, the RFC 5903/5869/8439-anchored BLE crypto oracle, the
> signer-idempotency check that keeps a **negative** signature fixture from being regenerated into
> a valid one, the placeholder scan, the canonical-form oracle, and the MQTT MAC vectors.
>
> **This is the quietest failure in the family, and the reason is structural.** A gate that verifies
> the wrong thing still emits a verdict, and a verdict can later be found wrong. A gate nothing
> starts emits nothing — no pass, no failure, no log line, no artefact, no run to re-read. It can
> only be found by enumerating the tools, enumerating the callers, and subtracting; that is a
> census, and a census has to be remembered and repeated.
>
> **So the census is now a check.** `tools/check-tool-callers.py` computes reachability from the
> workflows through tool-to-tool calls, and fails when a gate has no caller. It nearly shipped
> green and wrong, twice: matching any `tools/<name>` string counted a *comment* as a caller — and
> prose about a tool is the opposite of a caller for it, so the more carefully an absence is
> documented the more confident an unstripped scan becomes — and, after comments were stripped, a
> workflow's `paths:` trigger still counted, which names exactly the tool the job calls, so
> deleting the `run:` line changed nothing. Both are fixed and both are the reason the file
> explains itself at length.
>
> **PATCH.** No chapter, profile, schema, vector or conformance case changed. `protocolVersion`
> stays **`0.3.0`**. Every change is in `tools/` and `.github/workflows/`. Pin-only for both SDKs
> and for the server.

### Decided

- **tooling:** **The workflows call the scripts.** `validate-schemas.sh` and
  `validate-examples.sh` each had a second, divergent implementation inline in the workflow of the
  same name — and CI ran the copy that could not be reproduced locally, so the copy in `tools/`
  rotted unwatched and reported **100% failure** to anyone who tried it. Two implementations of one
  gate, of which the runnable one was the unreproducible one, is the shape this arc keeps closing.
  The scripts are now the single implementation and the workflows are thin callers, so what CI runs
  is what a developer can run.
- **tooling:** **A totally-failing instrument is a diagnosis, not a result, and both now say so.**
  Each script resolves its `ajv` binary explicitly and **exits 2 with an explanation** when it
  cannot find one, instead of reporting a failure count equal to its denominator. `2>/dev/null` is
  gone from both: hiding stderr is what turned a fixable environment fault into an unattributable
  number, and the number is what got them walked past.

### Fixed

- **tooling:** `validate-schemas.sh` — `npx ajv` resolved to the `ajv` **library** in this repo's
  `node_modules`, which ships no `bin`. Unfixable by PATH: npm resolves `npx <name>` by package
  name, so a global `ajv-cli` still loses to the local `ajv`. It also passed only `schemas/common`
  as `-r`, leaving BLE→BLE references unresolvable, and globbed four directories by name. Now
  `find`-based, every other schema passed as `-r`, with a non-vacuity guard. **86 of 86 compile** —
  the two "genuine failures" measured earlier were entirely the ref-passing defect, and no schema
  was ever wrong.
- **tooling:** `validate-examples.sh` — `REFS="-r …/common/*.schema.json"` was used **unquoted**, so
  bash word-split *and* glob-expanded it into 22 paths after a single `-r`; ajv rejected all 52
  invocations with a syntax error. Two independent faults, either of which alone produces 100%
  failure. Now **52 of 52 pass**, with every schema as a ref and absent pairs counted rather than
  silently skipped.
- **tooling:** both scripts read `$AJV_BIN`, and both workflows install ajv **outside the
  checkout**. That is carried over deliberately from the inline job it replaces: this repo's
  `package.json` depends on `@ospp/protocol`, and a version cascade once pinned it to `^0.8.0` — a
  version npm has never carried — after which the install failed `ETARGET` before a single payload
  was checked. A gate must not be able to die of a dependency it never loads.

### Added

- **tooling:** `tools/check-tool-callers.py` — the gate over the gates. `EXCLUSIONS` is a written
  decision with a reason per entry (modules and generators are not gates, and a **stale** exclusion
  naming a file that no longer exists is a hard exit 2, so the list cannot outlive what it
  excused). `BASELINE` is a ratchet that may fall and must not rise; it stands at **1**.
- **CI:** `.github/workflows/verify-signatures.yml` — the caller `verify-all-signatures.sh` never
  had. It also runs `verify-canonical-form.mjs` and `verify-mqtt-mac.mjs` directly, which reach CI
  by no other route. **The job mutates the working tree on purpose** and the file says so at
  length: section 2 re-runs the signer and compares hashes, so the mutation *is* the measurement —
  which means this job must never be combined with anything asserting a clean tree, and must be run
  locally only on a committed one.
- **CI:** `check-drift.yml` gains `check-tool-callers.py`, and triggers on `.github/workflows/**`
  so that **deleting a caller** fails it.
- **coverage:** `examples/payloads/http/provisioning.request.json` is now checked by CI. It was
  covered by the script alone — the thing that never ran — and by no workflow, so the merge raises
  the example gate from **51 pairs to 52**. This is the one thing the unrun script did that the
  running job did not.

### Remaining

- `tools/verify-protocol.sh` is the single entry in `check-tool-callers.py`'s baseline. It is not
  broken and it is not wired: it exits 1 on a clean tree from **9 pre-existing findings** with no
  baseline mechanism at all (`exitCode = totalFail > 0`), so wiring it as-is lands a permanently red
  job — the most reliable way to get a gate ignored again. Giving it the ratchet the four
  `check-*.py` scripts already have is what would let it join `verify-signatures.yml`, and that is
  a decision about whether those 9 findings are accepted debt. **The count is now guarded either
  way:** it cannot rise without failing the census.

---

## [0.20.0] — 2026-08-17

> **The code-signing conformance case could not fail.** `TC-DM-004` Part E exists to prove a
> station rejects a firmware image whose ECDSA P-256 signature does not verify. The signature it
> supplied as *"an invalid (corrupted) signature"* was **byte-identical** to the valid one used in
> Parts A–D of the same file — the same 96 characters, the same value that verifies against
> `conformance/test-keys/firmware-test-pub.pem` over `conformance/test-firmware/test-firmware.bin`.
> A vendor running the case sent a **valid** signature, saw the update proceed, and recorded a pass.
> An implementation that never verified a firmware signature at all passed it identically.
>
> **The corpus could not hold the fix, which is why the defect survived.** `tools/sign-inline-md.mjs`
> signs every JSON block carrying `firmwareUrl` + `signature` and overwrites both `checksum` and
> `signature` with the true values; `TC-DM-004.md` is in its file list, and
> `tools/verify-all-signatures.sh` gates on that signer being a no-op. A corrupted signature typed
> into the file was reverted on the next run and the guard then reported a clean tree. The
> placeholder scan blocks the other escape — a marker string such as `FAKE` or `Example` in a
> signature field is a hard error. **There was no way to express a negative signature fixture**, so
> the case shipped with a positive one wearing a negative label.
>
> **So the corruption is now generated rather than typed.** A new `<!-- ospp-sign: firmware-corrupted -->`
> directive makes the signer derive the invalid value from the same key and the same binary as the
> valid one, on every run: the valid signature with the **low bit of the final byte of `s` flipped**.
> The DER framing is untouched, so it parses as a well-formed ECDSA P-256 signature and fails the
> verification *maths* rather than the parser — a station that rejects it as malformed has not
> exercised the path the case measures, and that is now Failure Criterion 9. The directive cannot
> silently do nothing: one that matches no signing mode is a hard error, because a directive that
> quietly no-ops is exactly how a negative fixture reverts to a positive one.
>
> **The same class was swept out of the offline corpus, where it was worse.** Four narrative
> documents were in **neither** the signer's file list nor the CI guard's, so their crypto literals
> were never regenerated and never verified. One OfflinePass `signature` was shared by an **expired**
> pass and three valid ones — and the literal was 64 printable ASCII bytes, **not a DER structure at
> all**, so the negative scenario proved the parser rather than the rule. A `sessionProof` was
> identical between the negative scenario and the valid flow. One `appNonce`/`stationNonce` pair
> appeared in **four documents depicting four different handshakes**, while `ble-handshake.md` §4.2.2
> rests the claim-layer replay defence on those nonces *never being reused across handshakes*. All
> four documents now sit in both lists, so their signatures, HMACs and session proofs are generated;
> the nonces are derived from a per-handshake label and guarded by a new check for cross-document
> reuse, because a nonce is schema-valid whatever its value and nothing else could see it.
>
> **MINOR, and breaking for a vendor holding a passing `TC-DM-004`.** `protocolVersion` stays
> **`0.3.0`**, no schema changes, and no field, message, error code or configuration key is added.
> What changes is that a station which does not verify firmware signatures now **fails** a case it
> previously passed, that `Installed` is unambiguously sent before the reboot, that the active-session
> gate is on the **install** and not the download, and that UpdateFirmware to a restricted station is
> **`Rejected`**. **This release is not pin-only for `ospp-sdk-php`** — see below.

### Decided

- **spec:** **`Installed` is sent before the reboot.** Six sites said before and five said after,
  and the *after* reading was in both flow documents. Before wins because it is what the normative
  sites say — `firmware-status.md` §6 rule 4 (*after `Installed`, the next message **MUST** be a
  BootNotification*), `05-state-machines.md` §6.3's `Installed -> Rebooting` row, §6.6's mapping
  note, and `update-firmware.md` §6 — and because *after* is unimplementable against rule 4: a
  station that reports `Installed` after its post-update boot has sent that boot first. `Installed`
  says the image is on the device and the boot target is set; it does not say the station came back
  on it. That second claim is the BootNotification's, and the two are deliberately separate — if the
  new image never boots, `Installed` was still true and the watchdog rollback is what the server
  learns from next.
- **spec:** **`Accepted` is not a FirmwareStatusNotification status.** `update-firmware.md` §6 listed
  it as stage 1 of a **MUST** to notify at each transition, while
  `firmware-status-notification.schema.json` has a five-value enum without it and is
  `additionalProperties: false`. **A conforming station could not obey that MUST.** `Accepted` is a
  value of the UpdateFirmware RESPONSE's `status`; §6 now opens by saying so and the MUST covers the
  four notification stages only.
- **spec:** **`Downloaded` asserts the signature, everywhere.** `13c5c56` raised signature
  verification to a processing rule but touched three files; four sites still defined `Downloaded` as
  checksum-only and one of them was the sequence diagram in `04-flows.md` §11, where the word
  `signature` did not appear at all. All are corrected. The consequence for the wire is stated where
  it bites: a station whose signature check fails **does not send `Downloaded`** — it goes
  `Downloading -> Failed`.
- **spec:** **The active-session gate is on the install, and `scheduledAt` defers the install with
  it.** The gate was stated at three stages — installation, the `Idle -> Downloading` transition, and
  the `Rebooting` transition — with two of the three in the same chapter contradicting each other,
  and four implementations had picked four different stages. Downloading and verifying are now
  ungated: they touch the network and the staging area, and gating them would mean a busy station can
  never *prepare*, making the busiest stations in a fleet the last to be patched. It would also put
  the machine in a lie, since acceptance takes `Idle -> Downloading` and a station deferring its
  download would sit in `Downloading` downloading nothing. **The cost was closed rather than
  absorbed:** `Verified` becomes an unbounded wait state with no notification value, so instead of
  giving it a wire value — a schema change, and breaking — the stall rule is scoped. The server
  issued the `scheduledAt` and holds the bay states the gate turns on, so it measures the five
  minutes from the later of the last notification and the moment the gate opens. `TC-DM-002`'s
  criterion 6 becomes **reachable** for the first time.
- **spec:** **UpdateFirmware to a restricted station is `Rejected`, and §1.4's table now says so in a
  row.** It had no row at all, not even in the collective one, and an absent row is what produced the
  ambiguity. **The discriminator gained a second clause because the first answered wrongly:** *"an
  effect independent of the message it would emit"* grouped UpdateFirmware with SetMaintenanceMode
  and GetDiagnostics, whose suppressed messages *report on* an effect the server learns of anyway.
  FirmwareStatusNotification is the **entire** account of the update from `Accepted` until the
  reboot, so an `Accepted` would commit the station to a multi-minute operation the server hears
  nothing about — and cannot detect as stalled, because the stall rule is measured on exactly the
  messages being suppressed. The discriminator now also asks whether the suppressed message is a
  *report about* the effect or the *only account of it there will ever be*.
- **spec:** **The download-progress rate and floor are one rule, not two.** `firmware-status.md` §5
  carried the 10% increment as a SHOULD; `03-messages.md` §6.5 and `05-state-machines.md` §6.6
  carried *"at least every 30 seconds"* with no keyword, in a document that is not the profile. They
  are a rate and a floor and bind *whichever falls sooner* — a fast download crosses 10% marks more
  often than every 30s, a slow one goes minutes between marks. The profile now states both and the
  other two refer to it.

### Added

- **conformance:** `TC-DM-004` Failure Criterion 7 — *station reports `Downloaded` for a binary whose
  signature did not verify*. This is the criterion that separates a station verifying the signature
  from one verifying only the checksum, and it fires **before** any installation is attempted;
  criterion 6 catches the same station only if it also goes on to install.
- **conformance:** `TC-DM-004` Failure Criterion 9 — *station rejects the Part E signature as
  malformed rather than as failing verification*.
- **conformance:** `update-firmware-request-http-url.json` under `test-vectors/invalid/` — the
  `^https://` pattern had no negative vector. The schema-level refusal is now exercised regardless of
  how the error-code question below is answered.
- **tooling:** `tools/verify-test-nonces.mjs` — derives every handshake nonce in the worked documents
  from a per-handshake label (`SHA-256("OSPP_TEST_NONCE_V1:<label>:<field>")`, documented in
  `conformance/test-keys/README.md` beside the session key's derivation) and **fails if any literal
  appears in two documents**. `--write` regenerates. Wired into `check-drift.yml`, whose own header
  states the principle: *a gate in `tools/` that no job runs is the same defect one level up*.
  `conformance/test-vectors/**` is deliberately out of scope — the nonces in
  `crypto/ble-handshake-keyschedule.json` are the anchored inputs of a key schedule and are shared
  with the `hello-*`/`challenge-*` vectors *because* the schedule is derived from those exact bytes.
- **spec:** `05-state-machines.md` §6.6 gains rows for `Idle`, `Verifying`, `Verified` and
  `Rebooting`, all `--`. **Four of the ten states have no notification value**, and the two in the
  middle cover a SHA-256 and an ECDSA verification over a whole image — the longest compute in the
  cycle and the one interval in which the server hears nothing. A server modelling the station's ten
  states holds four that nothing on the wire can set; the only instrument for that interval is §6
  rule 3's stall timer.
- **spec:** `05-state-machines.md` §6.3 now says **fourteen rows, thirteen edges** — `Verifying ->
  Failed` appears twice because it has two triggers and two codes, not because it is two
  transitions. A conformance check asserting a transition *count* must assert 13. It also states
  that `Failed` is **not** terminal: its one outgoing edge is `Failed -> Idle`, and a machine
  treating it as terminal can run one firmware update and never a second.

### Fixed

- **tooling:** `tools/sign-inline-md.mjs` gains the `firmware-corrupted` mode and the
  `<!-- ospp-sign: <mode> -->` directive, with an error on any directive that claims no block.
- **tooling:** `examples/flows/12-firmware-update.md` joins the signed set. Its `checksum` was
  `e3b0c442…` — **the SHA-256 of the empty string** — presented as the digest of a 12 MB firmware
  image, in the one worked example that teaches the firmware cycle. It is now the reproducible digest
  of the committed reference binary, with the matching signature.
- **examples/tooling:** `error-scenarios/03-offline-pass-expired.md` and `flows/04`, `05`, `06` join
  the signed set in both `tools/sign-inline-md.mjs` and `tools/verify-all-signatures.sh`. Their
  OfflinePass signatures, receipts, session proofs, session-key confirmations and ServerSignedAuth
  claims are now generated from the committed test keys and verify; grafting one document's pass
  signature onto another's pass is now rejected, which is precisely what the shared literal could
  never detect. Their handshake nonces are derived per document.
- **conformance:** the `firmware-status-notification-full.json` vector carried `progress: 72` with
  `status: "Failed"`, against `firmware-status.md` §5 rule 3 (*`progress` **MUST** be omitted or set
  to `0`*). It sat in `valid/` and passed, because the schema has no conditional to catch it. Now
  `progress: 0`, which keeps the vector exercising every member and obeys the rule.
- **conformance:** `TC-DM-004` Part C observed `Downloading -> Downloaded -> Installing` and then
  rebooted, skipping `Installed`. Part A observed `Downloaded` *before* the signature-verification
  step. Both corrected.
- **conformance:** `TC-DM-004` step 37 required `errorText: "FIRMWARE_SIGNATURE_INVALID"` on a
  FirmwareStatusNotification — the UPPER_SNAKE_CASE reading of a field this specification has
  deliberately left as prose on that message (`firmware-status.md` §3, `update-firmware.md` §5 rule
  4), and the subject of an open naming decision. It now asks for a descriptive `errorText` and says
  not to match it programmatically.
- **spec:** `06-security.md` §3.2's UpdateFirmware row said *"Station verifies HMAC + checksum"* in a
  column about **message** authorization, where every sibling row says HMAC alone. The artefact
  verification belongs to §4.6 and the row now points there instead of naming two of its three
  checks.
- **spec:** `04-flows.md` §11 omitted `signature` from the request in the sequence-diagram note, in
  the happy path, and from the Error Paths table, which had no `5112` row. `CHANGELOG` records the
  identical defect being repaired in `03-messages.md` §6.4 at `0.9.0`; §11 was never swept with it.
- **spec:** `profiles/core/README.md` named three profiles that do not exist — *Session*,
  *Reservation* and *Firmware*. The four that do are now named and linked.
- **conformance:** `README.md` §2.3 mapped the *Firmware update* capability to `TC-DM-002` alone,
  while the prose four lines above already requires all `TC-DM-*`. The table now agrees with the
  prose it summarises, so the capability covers auto-rollback, non-HTTPS and signature rejection.
- **examples:** `flows/12-firmware-update.md` taught three things the protocol does not have — a
  `reason` member (the field is `errorText`), a `selfTestResult` member on a schema that is
  `additionalProperties: false`, and a server-initiated rollback. It also gave *"3 failed boots"* as
  the rollback trigger, a count that appears nowhere else against the watchdog's 5 minutes, and
  *"retry up to 3 times"* for a download, for which **no normative retry policy exists anywhere in
  this specification**. A second invented retry count in `firmware-status.md` §7.4's example is
  corrected with it.
- **KNOWN-ISSUES:** the `errorText` entry cited `spec/03-messages.md:1679` for a string that lives at
  `:1745`; line 1679 is a section heading. Its sibling citation was correct — the drift is per line,
  not per file.

### Open — recorded, not decided

Four contradictions in the firmware cycle still need a product decision and are recorded in
[KNOWN-ISSUES.md](KNOWN-ISSUES.md) with their option spaces rather than guessed at:

- **`5016 VERSION_ALREADY_INSTALLED` is required for two conditions**, one of which is a refused
  downgrade — a version that by definition is not installed. `5010`–`5013` are free.
- **UpdateFirmware is documented as idempotent and as `Rejected` with `5107`** for the same second
  command, and **superseding is absent from the specification entirely**.
- **A non-HTTPS firmware URL has no error code that fits.** `1011` is about reachability the station
  never tested, `1005` is scoped to unintelligible messages, and `3015` — the best fit by definition
  — is not listed for UpdateFirmware. `TC-DM-004` Part D is left asserting `1011` with a note saying
  the code is unsettled and the refusal is what it measures.
- **`FirmwareDowngradeAttempt` names the offered version `offeredVersion` in the vector and
  `attemptedVersion` in the conformance case**, and `details` is an open object, so nothing detects
  the divergence and no normative document defines the shape.

And one recorded outside the firmware cycle, because this arc is what surfaced it:

- **Two validation scripts report 100% failure**, which reads as a broken environment and is how
  they stopped being run. `validate-schemas.sh` calls `npx ajv`, which resolves to the local `ajv`
  *library* (no `bin`) because npm resolves by package name — unfixable by PATH while `ajv` is a
  local dependency and `ajv-cli` is not. Its real content answer is **84/86**, and the 2 failures are
  the exact BLE-ref defect `validate-schemas.yml` says in its own comment that it fixed: the workflow
  was repaired, the script beside it was not. `validate-examples.sh` word-splits an unquoted `-r`
  glob into 22 paths, failing all 52 with a syntax error; the CI equivalent reports 51/51 PASS.
  **Neither is invoked by any workflow**, and neither is `verify-all-signatures.sh`, which is not
  broken at all — so the entire signed-conformance guard runs only by hand.

### SDK — this release is not pin-only

- **`ospp-sdk-php`:** `FirmwareTransitions` disagrees with `05-state-machines.md` §6.3 on **three
  edges**, and the disagreement is fixed in its own tests. It has `downloaded -> failed` and
  `installed -> failed`, neither of which the specification has; it is missing `failed -> idle`,
  which the specification states twice — in the §6.1 diagram and as the §6.3 *Rollback complete* row
  — and which §6.5 rule 1 makes a **MUST**. With `'failed' => []` the machine is single-use: a
  station that fails one update can never begin another. `FirmwareTransitionsContractTest` pins
  `transitionCount() === 14`, which is the **row** count of §6.3's table, not its edge count; the
  correct assertion is **13**.
- **`sdk-ts`:** `FirmwareStateMachine` already matches the specification exactly — 13 edges, the same
  13. Pin-only.
- **Neither SDK has a canonical cross-SDK fixture for the firmware machine.** The bay machine has
  one, and its file says why: a disagreement between the two mirrors *"becomes a defect in every
  consumer — it has once already, which is why this table now has one home."* The firmware machine
  never got that home, and this is the divergence that survived in the gap.

---

## [0.19.0] — 2026-08-14

> **A restricted station could not renew its own certificate — by any path — and the repair was to
> restate the reason for an existing exception rather than add a second name to a list.**
> §1.4 forbade a restricted station any originated message but BootNotification. SignCertificate
> [MSG-022] is originated, and §4.7.1's automatic renewal is unsolicited by construction, so
> **station-initiated renewal was blocked as categorically as the server-triggered kind** — and more
> cleanly, since no counter-text existed anywhere for it. The server-triggered case was never the
> defect; it was the only place the defect was *visible*, because one table happened to give two
> answers there.
>
> **Why this outranked simply refusing the command.** The restricted state is **unbounded** —
> retries are unlimited, no edge leaves `Pending` but an `Accepted` boot, and both entry reasons are
> cleared by a person, never by time. A station certificate is valid for one year and renewal opens
> 30 days before expiry (configurable 7–90), so **the renewal window is about one twelfth of the
> certificate's life** — and the two ways into `Pending`, an outstanding operator approval and a
> `3018 TOPOLOGY_MISMATCH`, are exactly the state a station is in just after a technician has been
> on site, which is also when a topology record is most likely half-updated. Renewal exists so that
> expiry — whose recovery is a physical site visit — does not happen. A rule that suspends it in an
> unbounded state does not merely tolerate that outcome; it **specifies** it.
>
> **MINOR, and breaking for anything that enforced the old prohibition.** `protocolVersion` stays
> **`0.3.0`**, no schema changes, and no field, message, error code or configuration key is added:
> SignCertificate already existed and was already a legal `requestedMessage`. What changes is *when*
> it may be sent. **This release is not pin-only for the SDKs** — see below.

### Decided

- **spec:** **The rule states a test, not a pair.** A restricted station may originate exactly those
  messages that **repair its own standing with the server**. BootNotification restores its
  registration; SignCertificate restores the credential without which it cannot connect at all.
  Nothing else qualifies — StatusNotification, MeterValues, Heartbeat, TransactionEvent,
  SessionEnded, DiagnosticsNotification, FirmwareStatusNotification and SecurityEvent all report on
  the station's *work*, and a restricted station has not been cleared to do that work. The question
  is not whether a message is useful; it is whether the station's ability to *be served at all*
  depends on sending it.
- **spec:** **Why a test rather than a second name.** Naming SignCertificate beside BootNotification
  was the cheaper diff and was rejected: it would have left the stated reason — *"the act that ends
  the restriction"* — false for one of the two members. That is precisely the mechanism that
  produced this contradiction, a rule whose reason no longer covers its own contents. A list has to
  be remembered; a test can be applied by the next reader.
- **spec:** **The exception limits itself, and §1.4 now says so and tells the reader not to add a
  scope rule.** SignCertificate is among the 44 signed message types — not one of the three
  structural exemptions of §5.6 — and a sender holding no key **MUST** refuse to send rather than
  send unsigned (§5.7). `Booting` and `Rejected` hold no session key. The permission is therefore
  structurally exercisable only in `Pending`, with no written scope required. A later reader who
  adds *"except in `Pending`"* is restating what the signing rules already enforce, and a redundant
  restriction is how a rule starts drifting from the thing it duplicates.
- **spec:** **The `Pending` command table is grouped by an explicit discriminator** — whether a
  command has an effect independent of the message it would emit. That produced three outcomes
  instead of one undifferentiated "answered normally", and repaired the neighbouring row in the same
  change: **GetDiagnostics** is answered normally with its DiagnosticsNotification progress events
  suppressed, exactly as SetMaintenanceMode's StatusNotification already was, because the archive
  upload is an HTTP PUT that completes regardless. The phrase *"a certificate operation"* is gone —
  it collapsed CertificateInstall, which returns its result in a RESPONSE, with
  TriggerCertificateRenewal, which cannot, and that collapse is what hid the disagreement.
- **spec:** **The two routes to one act now give one answer.** TriggerMessage with
  `requestedMessage: "SignCertificate"` and TriggerCertificateRenewal [MSG-024] are answered
  `Accepted` alike. TriggerMessage for any other message stays `Rejected`.

### Fixed

- **spec:** **`TriggerMessage` was `[MSG-018]` at one site**, in the `Pending` command table — the
  only such site in the tree, against six giving MSG-018 to GetDiagnostics and three giving
  TriggerMessage its actual `[MSG-026]`. Corrected in the row that was being rewritten anyway. Same
  class as the SecurityEvent MSG-ID corrected in `0.17.1`.

### Changed — every site that states the rule

Fourteen restatements moved with the definition. A restatement left holding the old rule is how this
contradiction was born, so the sweep was by assertion rather than by keyword: *"sends nothing
unsolicited"*, *"may originate no EVENT"*, *"any REQUEST other than BootNotification"*, *"not
`Operational`, so not permitted to originate"*.

- `05-state-machines.md` §1.4 — the table row, the envelope paragraph, the new rule and its
  self-limitation, the no-carve-out sentence, and three rows of the command table
- `01-architecture.md` §7 boot-status table · `03-messages.md` §1.1 and its BootNotification status
  table · `04-flows.md` A2 and its sequence-diagram note · `06-security.md` §5.7 no-key table and
  §4.7.1 · `07-errors.md` §5.2 retry table
- `profiles/core/README.md` **CORE-002** · `profiles/core/boot-notification.md` §1 and §5 rule 5 ·
  `profiles/core/trigger-message.md` §5
- `guides/implementors-guide.md` boot pseudocode · `examples/flows/01-boot-sequence.md` design note

### Changed — conformance

- **`TC-SEC-003` gains Part F — Renewal While `Pending`.** The first Part in that case to run
  against a restricted station, and the executable witness for the new permission: the station must
  originate SignCertificate while `Pending`, complete the install, answer `Accepted` to both
  TriggerCertificateRenewal and TriggerMessage/`SignCertificate`, and still answer `Rejected` to
  TriggerMessage for anything else. Two Failure Criteria added — one for a station that enforces a
  restriction the specification does not place on it, one for a station that treats the exception as
  a general loosening.
- **`TC-CORE-001` step 25 and Expected Result 9** asserted the old rule outright (*"Only
  BootNotification retries"*). They now name both permitted messages, and Part C is scoped to a
  certificate **well outside** the renewal window so that silence there is conforming rather than an
  untested renewal.

### SDK — this release is not pin-only

- **Both SDKs model the old row as an exported predicate, and it changes shape.**
  `StationState::maySendUnsolicited()` (`ospp-sdk-php/src/Enums/StationState.php`) and
  `maySendUnsolicited(state)` (`sdk-ts/src/state-machines/StationStateMachine.ts`, re-exported from
  `src/index.ts`) both return `state === Operational`, both carry a docblock citing *"§1.4 row"*, and
  both are contract-tested — `StationTransitionsContractTest::sendsAnythingElseUnsolicited` and
  `StationStateMachine.test.ts` *"matches §1.4 row"* — asserting `Pending` is `false`. A single
  boolean can no longer answer the question, because the answer is now message-dependent. The shape
  of the fix is a message-aware predicate, or a companion for the standing-repair set with
  `maySendUnsolicited` documented as "anything other than those". The `StationState` docblocks in
  both SDKs also restate the old rule in prose.
- **No schema, vector or example payload moved**, so the vendored trees are unaffected; the change is
  in hand-written state-machine code, which is why "all Markdown in the spec" was necessary and not
  sufficient here.

## [0.18.0] — 2026-08-14

> **Two of the three contradictions `0.17.1` recorded are decided, and both were decided against
> the duplication rather than in favour of one copy.** In each case the specification said a thing
> twice, the copies drifted, and no rule ordered them — so picking a winner and leaving the second
> statement standing would have rebuilt the same defect with different words. `1003`/`1004` now
> carry the *Distinct from* convention the registry already applied to four other pairs, and the
> urgency scale exists once.
>
> **MINOR, carried by obligation changes, exactly as `0.17.0` was.** Four rows that carried no RFC
> 2119 keyword now carry **SHOULD**, the expired row carries **MUST**, and `1003` and `1004` each
> gain a precedence obligation. Nothing moves on the wire: `protocolVersion` stays **`0.3.0`**, no
> schema changes, and no field, message, error code or configuration key is added in either
> direction.
>
> **What an implementer must actually change.** A station that logged `1003` on a rejected
> certificate was defensible under the old text and is non-conforming now — that is the one
> behaviour change with a firmware cost, and it is small: the code and its `details.cause` are
> already determinable from the same TLS error the station handles today. A station that entered
> offline-only BLE mode only after a failed reconnection must now enter it on `notAfter` alone.

### Decided

- **spec:** **`1003` and `1004` described the same event, and specificity wins.** Every cause
  `1004` lists — expired, revoked, self-signed, invalid chain — is a certificate-validation
  failure, and `1003` named *"certificate validation"* as its own second cause, so `1004` was a
  strict subset of `1003`. The two sites that assigned them disagreed: `02-transport.md` §1.3 sent
  every invalid certificate but expiry to `1003`, while `06-security.md` §7.5 and the `1004`
  registry row sent revocation to `1004`. **Every failure a certificate caused is now `1004`**
  with its required `details.cause`; `1003` is narrowed to a handshake that failed for a reason no
  certificate caused — cipher-suite or protocol-version negotiation — and its recommended action
  now says so, telling a station not to regenerate or discard credentials in response to it. The
  two rejected alternatives are recorded in `KNOWN-ISSUES.md`: *layer wins* contradicts `1004`'s
  own `expired` recovery, which is reached at a handshake; *both, deliberately* keeps two codes
  for one event.
- **spec:** **The missing convention was the cause, not a symptom.** `07-errors.md` already
  carried an explicit **"Distinct from"** clause on `2014`, `2015`, `4017` and `4020` — every
  other pair of entries close enough to be confused — and on neither of these two. Both now carry
  one, naming the other code and stating which takes precedence. This is why the pair could
  describe overlapping conditions for as long as it did.
- **conformance:** **The instrument could not adjudicate itself.** `TC-SEC-002` pinned `1004`
  alone for expired (step 18) and revoked (step 31), accepted *"`1003` or `1004`"* for self-signed
  (step 25), then stated in Expected Results that the station logs *"the appropriate error code
  (`1003` or `1004`) for each certificate failure scenario"*, with Failure Criterion 5 failing a
  station only if it logged **neither**. A station logging `1003` for a revoked certificate failed
  step 31 and passed both summary criteria. All three scenarios now require `1004` with the
  matching `details.cause`, and both summary criteria refuse `1003` as a substitute.
  `TC-SEC-008` Parts D and E are pinned to `1004` / `invalid-chain`.
- **spec:** **The certificate urgency scale binds once.** It was stated in `06-security.md`
  §4.7.3 and `certificate-renewal.md` §5; three of four rows were identical and `0 (expired)` was
  not, one copy inserting a reconnection attempt the other lacked. Neither carried an RFC 2119
  keyword, so neither bound, and no precedence rule reaches a chapter against a profile document.
  **§4.7.3 is the normative home** — chosen because it is the site the rest of the specification
  already cites, the `1004` entry naming it as the fixed recovery for its `expired` branch, where
  nothing cited the profile section. `certificate-renewal.md` §5 is now a pointer.
- **spec:** **The reconnection step was dropped, and that is the substantive behaviour change.**
  It cannot succeed: the certificate is expired, so every attempt in the cycle fails for the
  reason that started it, and nothing bounded the cycle — the station was neither online nor
  serving BLE customers for as long as its backoff ran. `02-transport.md` §1.3 withholds the retry
  on that row for the same reason, giving expiry *alert operator* where the row beside it gives
  *retry with backoff*. Expiry is determinable from the certificate's own `notAfter`, and the
  station **MUST NOT** make entering offline-only mode conditional on first observing a rejected
  handshake.

### Left open — recorded, not fixed

- **spec:** **Narrowing `1003` surfaced a refusal that fits neither code.** `TC-SEC-008` Part C
  exercises a station refusing the broker because **no trust anchor is obtainable** — the
  presented certificate is sound and would validate; only the anchor is missing. It is not `1004`,
  because no certificate is at fault and all four `details.cause` values name a defect *in a
  certificate*; it is not `1003` as now narrowed, because nothing failed in negotiation.
  `06-security.md` §2.1 calls it a deployment that *"has failed to supply a required row of
  Chapter 01 §7.2"* — naming the fault as configuration. Three options are recorded: a fifth
  `details.cause` on `1004`, `5102 CONFIGURATION_ERROR`, or a new 1xxx code. **Part C accepts
  either code meanwhile**, scoped to that Part alone and annotated in the case, so the latitude is
  visible rather than inherited.
- **spec:** The `Pending`-state table contradiction recorded in `0.17.1` is unchanged and still
  open; it needs a decision whose cost falls on firmware.

### Not changed, and why

- **No schema, vector or example payload moved.** Measured against `v0.17.1`: every changed file is
  Markdown, no `.json` changed, and no `tools/check-*.py` gate source changed. This release is
  **pin-only** for `ospp-protocol-php` and `ospp-protocol-ts` — their `.spec-ref` markers move to
  `0.18.0` and nothing they implement changes. Neither SDK carries an error-code precedence rule
  or a renewal scheduler; both surfaces belong to station firmware.

## [0.17.1] — 2026-08-13

> **A certificate-cycle consistency pass. Three index-level statements were wrong and are
> corrected; three contradictions need a decision and are recorded rather than guessed at.**
> The corrections share a shape: all three are in documents that *index* normative text —
> the Security profile's own README and the reading guide — and all three disagree with the
> file they point at. `profiles/security/README.md` §1 states the rule it then broke twice
> in its own tables: it *"indexes them and states nothing about them that file does not."*
>
> **PATCH.** Nothing here changes what binds. No schema changes, no vector changes, no new
> field, message, error code or configuration key; `protocolVersion` stays **`0.3.0`**. Every
> corrected statement was already contradicted by a normative source that did not move — the
> message-ID table, the CertificateInstall schema, and the profile README's own §1 — so an
> implementation built against the normative text was **always** correct and only its index
> was wrong. The three recorded contradictions change nothing in this release by construction:
> each needs a decision that would alter station behaviour, and picking one silently is what
> this entry exists to avoid.
>
> **The one that costs an implementer real work is S1.** `profiles/security/README.md` is the
> first document an implementer of a **mandatory** profile opens, and it named SecurityEvent
> `[MSG-021]` — which is UpdateServiceCatalog. A station built from that line emits a message
> nothing recognises, and the 48 sites that say MSG-012 are all in documents it had no reason
> to open first.

### Fixed

- **spec:** **SecurityEvent was `[MSG-021]` in one place and MSG-012 in forty-eight.**
  `profiles/security/README.md` §Document Index carried `[MSG-021]`. That ID belongs to
  **UpdateServiceCatalog** — `04-flows.md:30` assigns it, and `04-flows.md:1677`/`:1680`/`:1686`
  and `07-errors.md:320`/`:421`/`:497` all use it that way. SecurityEvent is MSG-012 across the
  tree, including `04-flows.md:41`, `06-security.md:336`/`:1412`, `03-messages.md:967`,
  `05-state-machines.md:680` and `TC-SEC-004`. **One site in the whole repository disagreed, and
  it was the index of a profile mandatory at Standard compliance and above.** Corrected to
  MSG-012.
- **spec:** **CertificateInstall was said to deliver a trust anchor, which it has no way to
  carry.** `profiles/security/README.md` §2 described [MSG-023] as delivering *"an issued
  certificate, or a trust anchor, for the station to install"*.
  `certificate-install-request.schema.json` declares `certificateType` as a two-value enum —
  `StationCertificate`, `MQTTClientCertificate` — with `additionalProperties: false` and a
  required `certificate` that must be a PEM leaf. Neither value is an anchor and no property can
  hold one. The optional `caCertificateChain` is not the anchor either, and the specification
  states the parallel case in as many words: `04-flows.md:358` and
  `provisioning-response.schema.json` both say a CA chain is what the station **presents**, and
  is *"NOT the station's own trust anchor for the broker, under any deployment shape"* — that
  anchor is `brokerRootCa`, which arrives in the provisioning response over HTTPS and never on
  MQTT. `00-introduction.md:174` makes the schema authoritative where prose disagrees. The row
  now reads *"and optionally the CA chain that verifies it"*, matching the schema's own
  description and `06-security.md:562`.
- **spec:** **The reading guide described the Security profile without half of it.**
  `spec/README.md`'s profile table gave Security as *"Security event reporting — real-time
  incident notifications"*, while `profiles/security/README.md` §1 says the profile covers
  **two** things — event reporting **and the certificate lifecycle** — and `profiles/README.md`
  §4.1 lists four messages a conforming station must implement for it, three of them
  certificate messages. The map omitted the half of a mandatory profile that a station cannot
  renew its identity without.

### Left open — recorded, not fixed

Three contradictions in the certificate cycle were measured and each requires a decision that
changes station behaviour. All three are now in `KNOWN-ISSUES.md` with their evidence and their
option space; the open count moves 14 → 17.

- **spec:** **One table gives the same act opposite verdicts, and a renewal cannot conclude in
  `Pending`.** `05-state-machines.md` §1.4's *Command sent to a `Pending` station* table refuses
  TriggerMessage with `requestedMessage: "SignCertificate"` at `:109` — *"SignCertificate
  originates a REQUEST it may not send either"* — and answers *"a certificate operation"*
  normally at `:111`, on the ground that *"Each returns its result in a RESPONSE"*. That ground
  is false for TriggerCertificateRenewal [MSG-024]: `06-security.md:591` makes answering it
  normally mean initiating the flow whose step 3 (`:573`) is the SignCertificate REQUEST `:109`
  forbids. The paragraph above the table (`:104`) condemns exactly the resulting state — *"has
  answered `Accepted` to something it did not do"* — and `:92` names *"a certificate operation"*
  among the repairs `Pending` is held open for. **GetDiagnostics is in the same row with the same
  defect** and a different remedy: its `MUST` to send DiagnosticsNotification events collides
  with the same prohibition, but is repairable by the carve-out the table already applies to
  SetMaintenanceMode at `:110`. The certificate case is not.
- **spec:** **`1004`'s four causes are all instances of `1003`'s second cause.** `07-errors.md:266`
  gives `1003 TLS_HANDSHAKE_FAILED` the causes *"cipher negotiation, certificate validation, or
  version mismatch"*; `:267` gives `1004 CERTIFICATE_ERROR` *"expired, revoked, self-signed, or
  has an invalid chain"* — every one a certificate-validation failure. `02-transport.md:106--107`
  sends everything but expiry to `1003`; `06-security.md:1511` and `07-errors.md:267` send
  revocation to `1004`. **The conformance case cannot adjudicate itself**: `TC-SEC-002` pins
  `1004` alone at `:58` and `:77`, accepts either at `:68`, then accepts either for *every*
  scenario at `:96`, with Failure Criterion 5 failing a station only if it logs neither. The
  registry's own **"Distinct from"** convention — used by `2014`, `2015`, `4017` and `4020` — is
  applied to neither code.
- **spec:** **The certificate urgency scale is stated twice and the expired row differs.**
  `06-security.md:600` has an expired station enter offline-only BLE mode;
  `certificate-renewal.md:102` inserts a reconnect attempt first. Three of the four rows are
  identical; this one is not, and a third site (`02-transport.md:107`) gives expiry *"alert
  operator"* where the row beside it gives *"retry with backoff"*. **Neither copy carries an RFC
  2119 keyword on any row**, and no precedence rule covers a chapter against a profile document —
  `00-introduction.md:174` orders schema above prose and `06-security.md:431` marks one bullet a
  summary of its normative source, but §4.7.3 is marked neither.

### Not changed, and why

- **No schema, vector or example payload moved.** Measured against `v0.17.0`: every changed file
  in this release is Markdown, and under `schemas/`, `conformance/test-vectors/` and `examples/`
  the only changed lines are the three version headers those trees' `README.md` files carry as
  part of the 29-site cascade. No `.json` file changed, and no `tools/check-*.py` gate source
  changed. Both SDKs vendor those trees and validate against them, so this release is
  **pin-only** for `ospp-protocol-php` and `ospp-protocol-ts`: their `.spec-ref` markers may move
  to `0.17.1`, and nothing they implement changes.
- **The server owes nothing from the three corrections** — they correct index prose against
  normative text the server was already built from. What the three **recorded** contradictions
  will owe depends on which option is chosen, and none is chosen here.

## [0.17.0] — 2026-08-13

**§6.7 described one rotation, and the other one needs the opposite behaviour from the same step.** The section opens with *"MUST be rotated periodically"*, gives an annual cadence, and ends with a step 5 that forbids revoking the previous key while any station remains unconfirmed. That is right for a scheduled rotation, which faces no adversary. It says nothing about rotating a key **because it is believed to be compromised** — and a server that carried step 5's unconditional `MUST NOT` into that case would be applying a rule written for the wrong situation. Two conformant servers could disagree about when revocation is permitted, each citing the same paragraph. §6.7 now names both postures and states which obligations change.

**The measurement inverted the premise this arc started from.** The concern was that waiting for the cohort keeps a compromised key alive. It does not, because destroying the server's copy was never what kills the key: this specification defines no CRL, no epoch and no distribution mechanism for the server signing key, so the only thing that ends an attacker's capability at a station is *that station receiving the replacement*. What actually happens to an unconfirmed station is the reverse of the scheduled case. Under scheduled rotation it **loses** the ability to verify passes the server signed — an availability failure. Under compromise it **keeps** verifying, including everything the attacker signs; it does not fail closed, it stays open. The harm is integrity and settlement, not availability, and the priority inverts with it: *revoke last* becomes **reach every station first**. That sentence is the deliverable; the obligation change follows from it.

**Dual signing is not unimplemented — it is unconstructible, and the section now says so.** Retaining the previous key was read as implying the server could keep signing with it for stations that had not confirmed. It cannot, in either posture: an updated station **MUST** have discarded the cached previous key when its grace period expired, so a pass signed under the previous key fails there; an un-updated station holds only the previous key, so a pass signed under the new one fails there. No single choice serves both cohorts. Nor can the choice be per station — `OfflinePassPublicKey` is single-valued, an OfflinePass carries no key identifier, and a pass is not bound to a station on the wire, so at signing time the server does not know which station will verify it. The only overlap OSPP provides is station-side: the cached previous key of steps 3–4.

**MINOR is carried by two obligation changes** — step 5's `MUST NOT` gains a compromise posture under which the server **SHOULD** destroy the previous private key immediately, and the previous-key acceptance window is bounded at two sites that stated it without a bound. `protocolVersion` stays `0.3.0`, no schema changes, and **no field, message or configuration key is added in either direction**: the posture is an operator declaration, exactly as it already is for a compromised station certificate (§4.7.2) and a compromised receipt-signing key (§4.3).

### Decided

- **spec:** **The two postures are operational, not wire-visible, and that follows the precedent rather than setting one.** `06-security.md` §6.7.1 distinguishes **scheduled rotation** from **compromise response**. Both use the same key generation, the same ChangeConfiguration [MSG-013] push and the same rollout tracking; only obligations differ. This is the form §4.7.2 already uses — *"a certificate has been compromised and must be replaced immediately"* is one of three triggers into one unchanged renewal flow, and `TriggerCertificateRenewal` [MSG-024] carries no reason field — and the form §4.3 uses for a compromised receipt-signing key, whose remediation is an operator-minted token and a re-provisioning cycle. A wire signal was considered and rejected; see below.
- **spec:** **Who declares a compromise, and why nothing on the protocol can.** The key is the *server's*, and no station can detect its compromise. The SecurityEvent [MSG-012] type list is station-to-server and has no type for it; the nearest, `OfflinePassRejected`, reports a pass that **failed** verification — the opposite signal, since a pass forged under a valid key passes every check in §6.1.1. The declaration is an operator judgement made out of band, as in §6.6 (*"Security incident occurs"*).
- **spec:** **`SHOULD destroy immediately`, not `MAY`.** Retention buys nothing that survives compromise: the key's only remaining use is signing, which no updated station accepts and which is precisely what the attacker is already doing with the copy the server cannot destroy. A retained copy is exposure at no benefit. The private key is not evidence; the fact of the compromise is — record the decision, the time, and the stations that had not confirmed, not the key.
- **spec:** **Why the gate exists in §6.7 and nowhere else in OSPP, stated rather than left as an accident.** Step 5 is the only revocation conditioned on fleet confirmation. A station certificate is revoked by CRL with no confirmation step (§4.3); an OfflinePass by incrementing the epoch, immediately, with offline stations picking it up at next boot (§6.6) — the same trust chain as §6.7, an incident trigger, and no gate; a StationIdentity certificate only by expiry, which §6.5.2 calls best-effort. The gate is defensible for the scheduled posture and only there.
- **KNOWN-ISSUES:** **A wire mechanism to cut the grace period short was evaluated and rejected**, recorded with its cost so it is not re-derived. It would buy at most the grace period (300 s default) and only at stations already reached, while the unbounded window at unreached stations — the larger exposure — is untouched; the window it closes closes by itself; and because an unrecognized key makes its entry `NotSupported` and *"no key in the request is applied"*, batching it with the `OfflinePassPublicKey` push against an older station would lose the key push too, so the mechanism could prevent the remediation it exists to accelerate. What would reopen it is named: the grace period is implementation-defined with **no stated upper bound**, so a deployment using a materially longer one changes the arithmetic — and bounding it from above in §6.7 is the cheaper answer to reach for first.

### Changed

- **spec:** `06-security.md` §6.7 **step 5 is now scoped to the scheduled posture** and points at §6.7.1 for what replaces it under compromise. The five steps themselves are unchanged.
- **spec:** **The previous-key acceptance window is bounded at the two sites that stated it without a bound.** `08-configuration.md` §4 (the `OfflinePassPublicKey` registry row) and `profiles/offline/offline-pass.md` §3 both read *"stations MUST accept passes signed by the current or immediately previous key"* with no window at all, against five sites — §6.7 step 4, §6.1.1 check #1, `04-flows.md` §5b, `03-messages.md` §7.6 and the implementors' guide §2.10 — that all bound it to the grace period. Two normative statements against five is not a stylistic split: under the unbounded reading a superseded key stays acceptable at every updated station **indefinitely**, until a second rotation displaces it from the cache — and §6.7.1 is precisely the section in which that key may be one an attacker holds. Both now carry the qualifier, and §6.7 step 4 is named as the only statement of the bound.
- **spec:** `06-security.md` §6.5.2 **cited an overlap set that does not exist.** It required the app to accept a StationIdentity verifying under any key in its trusted set, glossed as *"the overlap set the server publishes during rotation"* — but §6.7 defines no key-set distribution and `OfflinePassPublicKey` is single-valued, so there is nothing for the server to publish. The gloss is replaced with what is true: the app's set is what it last obtained over its own online channel and refreshes on a **SHOULD**, while the overlap §6.7 provides is station-side and bounded by the grace period.
- **spec:** `06-security.md` §6.7's sequence diagram said *"Revoke old key, stop signing with it"* at step 5, which reads as though the server had been signing with the previous key until then. It had not, and could not. The diagram now marks where signing switches — at rollout start — and step 5 as the destruction of the previous private key, with the compromise inversion noted against it.

### Added

- **spec:** `06-security.md` §6.7 gains **when the server switches signing keys and why it has no choice**, with the three facts that make per-station selection unconstructible: a single-valued registry key, an OfflinePass with no key identifier, and a pass that is not bound to a station on the wire and may be presented anywhere for up to 24 hours.
- **spec:** `06-security.md` §6.7.1 gains **what a compromised server signing key reaches beyond OfflinePasses**, which §6.7's station-counting rollout does not cover: ServerSignedAuth [MSG-032] on the Partial-A path, StationIdentity certificates, and the mobile app's trusted set — which the app refreshes on a **SHOULD** and which nothing in §6.7 tracks or bounds.
- **spec:** **The certificate escalation, which was written down nowhere.** StationIdentity issuance reuses the OfflinePass signing path (§6.5.2), so a holder of the compromised key can mint a StationIdentity for a station that **does not exist**. §6.5.2's BLE gate stops a fake station only because it cannot produce a certificate verifying under the server key; with the key it can, and the app then transmits a genuine OfflinePass into it. A compromised signing key therefore permits **harvesting real passes**, not only forging them — and updating every station closes the forgery half while leaving this one open.
- **spec:** `06-security.md` §6.7.1 states that **incrementing the revocation epoch is not a response to a compromised signing key.** §6.6 invalidates passes by issuance epoch and `revocationEpoch` sits inside the signed body, so a holder of the key chooses its value freely; the epoch constrains only legitimately issued passes.
- **spec:** **The residual, in the same form §4.3 already uses:** a station that cannot be reached cannot be protected by any mechanism in this specification, and remediation for it is out of band — physical access or the re-provisioning cycle.

---

## [0.16.0] — 2026-08-13

A configuration-cycle consistency pass. Ten claimed self-contradictions were re-verified one at a time against the tree rather than against the report that named them; **one was disproved, two were overstated, and two defects nobody had claimed were found while checking the others.**

**The disproof is the most useful result.** A server-side note held that `TC-DM-006.md` and `TC-DM-001.md` still teach the abolished ChangeConfiguration response shape — a bare top-level `status`, which the response schema forbids by `additionalProperties: false` over `results` alone — and that the defect was open at `v0.15.0` and missing from KNOWN-ISSUES. It is none of those things. `f872b23` repaired both files on 2026-08-10 and shipped in **`0.12.0`**; TC-DM-001 step 24 now requires `errorCode` and `errorText` to appear *"**inside** the `results` entry, not at the top level"*, and TC-DM-006 step 33 requires *"the response carries no top-level members"*. A scan of every fenced JSON block in the conformance corpus finds no ChangeConfiguration or GetConfiguration payload carrying a top-level member. The note was written before the fix and carried forward without being re-measured; it is stale, not open.

**MINOR is carried by four obligation changes**: the OfflinePass key-rotation rollout test in `06-security.md` §6.7, the widened `HeartbeatIntervalSeconds` range, the Device Management profile becoming capability-conditional, and the new normative Profile ID. `protocolVersion` stays `0.3.0` and no schema changes, so nothing changes in the shape of a message — but what a station must accept in one of them does.

### Decided

Three contradictions were decided rather than recorded, and a fourth was examined and left open because the reasoning behind the first does not reach it.

- **The heartbeat range: the registry was the wrong side, and it is widened to `10--3600`.** `HeartbeatIntervalSeconds` read `30--3600` in the registry against `10--3600` at four other sites — `03-messages.md`, `boot-notification.md`, `heartbeat.md`, and `boot-notification-response.schema.json` with `"minimum": 10` — while `connection-lost.md` published the derived staleness window as `35--12600s`, which is 3.5× a **10**-second floor. The schema is what actually validates, and narrowing it would make non-conforming every server already emitting a legal value; the clamping rule in `heartbeat.md` §5 had assumed the lower floor from the start. The consequence is a staleness threshold that can fall to 35 s, which detects a dead station sooner. The three restatements in the conformance corpus followed. **The default stays `30`.**

- **And the disposition, which widening the range does not settle.** `08-configuration.md` §8.2 rule 4 requires an out-of-range value to be **rejected**; `heartbeat.md:35` required it to be **clamped**. That disagreement is independent of where the boundary sits, and `TC-DM-006` Part E is the executable witness: it sends `HeartbeatIntervalSeconds: "5"` and requires `Rejected` with `5109`. `heartbeat.md` rule 4 is now scoped — a ChangeConfiguration value outside the range is rejected, and the clamp covers an interval the station holds from any other source, which is a BootNotification RESPONSE from a non-conforming server or a value recovered from NVS.

- **The profile label gets a normative identifier.** §1.5 gains a **Profile ID** column — `Core`, `Transaction`, `Security`, `OfflineBLE`, `DeviceManagement` — and an implementation exposing a key's profile as a program value MUST use it exactly. The display label stays readable; `Offline / BLE` does not survive being made an enum case, which is how two SDKs produced three spellings of two profiles with nothing to compare against. Each SDK now has exactly one value to change: `ospp/protocol` `Offline` → `OfflineBLE`, `@ospp/sdk-ts` `DeviceMgmt` → `DeviceManagement`.

- **Device Management is capability-conditional**, matching the Offline / BLE row of the same table. The four keys have no protocol surface of their own — GetConfiguration and ChangeConfiguration are themselves Device Management actions — and two of them are switches for actions a non-declaring station does not implement. Requiring them unconditionally made a station non-conforming for keys it has no way to carry. The question recorded when this was opened, whether the nine actions and the four keys need separate answers, was examined and does not survive: strip the actions and the only remaining path is the BootNotification `configuration` block, whose failure mode §8.3 now states.

- **`retryInterval` against `BootRetryInterval` is NOT the same shape and stays open.** Widening the registry to the schema works for the heartbeat pair because that schema declares **both** bounds — one of only 6 integer properties in `schemas/mqtt/` that do, against 17 declaring a minimum and no maximum — and because `heartbeat.md` already clamped to its floor. `retryInterval` declares `"minimum": 1` and no maximum: a type floor, not a considered range. Aligning the registry to it would delete the `10--600` constraint rather than correct it, and nothing anywhere clamps or validates the field. Every `retryInterval` in the corpus is 30, 60 or 300, so unlike the heartbeat case tightening the schema would invalidate nothing that exists — which is an argument for a decision, not a decision. Recorded with its option space.

### Changed

- **spec:** **`Accepted` meant two incompatible things, and one of the two could revoke a signing key while a station was still using it.** `08-configuration.md` §8.2's status table defined it as *"Value applied immediately"* and `change-configuration.md` §5 as *"The key was set successfully and is effective immediately"* — both unconditional. The atomicity rule, a **MUST** in `08-configuration.md` §8.2, `change-configuration.md` §6 rule 2 and both schemas, makes it nothing of the kind: an entry is a **per-key validation verdict**, and a batch carrying any `Rejected` or `NotSupported` entry applies **none** of its keys, including the ones whose own entry passed. Only the conformance corpus said so (`TC-DM-006` Part G, added in `0.12.0`); the two places that define the word did not. Both definitions are now batch-conditional and `08-configuration.md` §8.2 states the rule above the table rather than leaving it to be inferred from a rule two sections away.

- **guides:** a Security Pitfall and a Server Core conformance-checklist item for the rotation hazard below, written where a server implementer looks rather than only in the chapter that defines the rule. The pitfall names the audit question in one line — *does the code that decides "this station has the new key" look at any entry other than its own?* — and points at the rotation finalizer, the routine that overwrites and unlinks the previous key, rather than at the code that sends the push. It also records that this cuts against §2.13's general advice to batch correlated settings: `OfflinePassPublicKey` + `RevocationEpoch` are correlated, and batching them is right for the station, but then the batch check is mandatory before revoking.

- **spec:** `06-security.md` §6.7 consumed the wrong reading of that word. Its rollout test — *"a station counts as updated when, and only when, it has returned `Accepted`"* — is the one place in the specification where an `Accepted` entry decides whether a **cryptographic key may be destroyed**. Under atomicity, a station that answers `Accepted` for `OfflinePassPublicKey` inside a batch carrying a rejected key has stored nothing; the server would nonetheless count it rolled out, revoke the previous signing key once every station had "answered", and leave that station unable to verify any OfflinePass. The rule now requires `Accepted` **and** no `Rejected` or `NotSupported` entry in the same `results` array, states why, and makes a single-key batch **RECOMMENDED** so the question does not arise. Nothing about `OfflinePassPublicKey` itself changes — it is the same WriteOnly Dynamic key with the same rotation flow.

- **spec:** **`change-configuration.md` §8.4 answered for a key the request never sent.** §8.3 requests `OfflinePassPublicKey` and `RevocationEpoch`; §8.4's response carried `OfflinePassPublicKey` and **`FirmwareVersion`**, correlated by the same `messageId`. §6 rule 3 of that same file requires *"one entry per request key, in the same order"*, so the example broke a **MUST** stated four sections above it — and it is the example an implementer reads to learn the shape. The rejected key is now `RevocationEpoch`, the key actually requested, with a value outside its `0--2147483647` range and `5109 INVALID_CONFIGURATION_VALUE`. The example keeps its point — one refused key, nothing applied — and gains the note that `OfflinePassPublicKey`'s `Accepted` did **not** mean it was stored, pointing at §6.7.

- **spec:** **`change-configuration.md` §8.5 returned `RebootRequired` for a Dynamic key.** It showed `HeartbeatIntervalSeconds`, which §§2 and 9 both classify **Dynamic**, and §8.2 rule 5 requires `Accepted` for a Dynamic key that is applied. The same file's §8.2 example answers `Accepted` for that same key, correlated by the same `messageId` as §8.5 — so one request had two documented responses and one of them was forbidden. §8.5 now carries its own request and response for `StationName`, which is **Static**, and says why the §8.1 exchange answers differently.

- **spec:** `08-configuration.md` §9 is declared **derived**, and §§2--6 **normative**. Two obligations in the chapter already depend on that reading and neither names §9 — §1.3, which decides what makes a key unrecognized, and §7.1, which forbids a vendor key from colliding with a standard one — but the relationship was never stated, and the two tables do not carry the same columns (§§2--6 have Range and Description; §9 has an index and a profile label). Nothing compared them, and the two gates that existed each read only one: `check-config-defaults.py` and the PHP SDK's `check-config-registry.php` read §§2--6, while `verify-protocol.sh` Categories 4 and 6 parse §9.

- **spec:** §9 spelled the Device Management profile **`Device Mgmt`** while §1.5 spelled it **`Device Management`** — the only profile label the chapter states two ways, and the reason the two SDKs disagree with the spec and with each other on that field (`DeviceManagement` in `ospp/protocol`, `DeviceMgmt` in `@ospp/sdk-ts`). There was no single spelling to match. `Device Management` wins on the evidence — §1.5, the profile document's own title and its `device-management/` directory — and §9's four rows are corrected. `Offline / BLE` needed no decision: §1.5, §9 and the profile README already agree, and it is the SDKs that differ (`Offline`, `OfflineBLE`). **Whether the SDKs adopt the spec label is a decision this release does not take**; the field is metadata and never crosses the wire.

- **spec:** `08-configuration.md` §7.2 assigned the station's obligation to the server. *"The server MUST NOT reject unknown vendor keys during GetConfiguration. Unknown keys requested by name MUST be returned in the `unknownKeys` array"* — the second sentence is passive and the only preceding subject is the server, which cannot populate a field it receives. Both actors are now named.

- **spec:** `06-security.md` §6.7 cited *"Chapter 08 §2"* for the WriteOnly rule governing `OfflinePassPublicKey`. §2 is **Core**; the key's row is in §4 and the access-mode rule is in §1.3. Both citations corrected.

- **spec:** `06-security.md` §6.7 called the previous-key grace period *"configurable"* while no configuration key governs it, in a sentence whose own next clause declines to add one. It is **implementation-defined**, a vendor **MAY** expose it as a `Vendor_` key, and a server can read or set neither half over the protocol — which is now what it says.

- **spec:** `change-configuration.md` §4 marked `results[].errorCode` and `results[].errorText` **Required: No** while §6 rules 4 and 6 of the same file make both **MUST** for the two causes they name (`5108` for a ReadOnly key, `5109` for an unparseable or out-of-range value). They are **Cond.**, the marker this specification uses elsewhere for exactly this, and the rows now state which causes require them. The response schema is unchanged and still leaves them optional, correctly: the requirement is conditional, and a conditional cannot be expressed as a bare `required` member.

- **spec:** `profiles/device-management/README.md` described ChangeConfiguration as *"Set a **single** configuration key"*, against 1--20 in `08-configuration.md` §8.2, the profile's own `keys` array, and `minItems: 1, maxItems: 20` in the request schema.

- **spec:** `08-configuration.md` `LogLevel`'s Range cell read `see enum` — a pointer to nothing, since the enum sits in that row's own Description. The four literals are stated inline, as `MessageSigningMode` already did.

### Added

- **spec:** `08-configuration.md` **§8.3** now states what a station does with a key it does **not support** in the BootNotification `configuration` block: ignore the entry, log a warning, do not fail the boot. The block is explicitly non-atomic, which is its difference from ChangeConfiguration, and a server needing to know whether a key was taken must use ChangeConfiguration, which answers per key. Making a profile conditional is what first made "a standard key the station does not support" reachable, so the case had never needed an answer before.

- **spec:** `08-configuration.md` **§1.6 Value Ranges**. The Range column is declared **normative** — §8.2 rule 4 already required a station to reject an out-of-range value with `5109`, which presupposes it — and given a grammar of five forms with the count of keys taking each. The counts are stated so they can be checked, and they are. §1.6 also records that a quantity carried by both a registry key and a dedicated wire field is bound by both constraints, names the two pairs where those constraints currently disagree, and refers the reader to KNOWN-ISSUES rather than inviting them to pick one.

- **tools:** `check-config-ranges.py`, wired into `check-drift.yml`, making four drift checks. Five checks: §9 against §§2--6 on the key set and all four shared columns; every Range cell against §1.6's grammar, with §1.6's per-form counts recomputed; restated ranges across `spec/`, `guides/` and `conformance/`; a registry range against the JSON Schema bounds of the wire field carrying the same quantity; and the §1.5 Profile ID vocabulary, with every §9 profile label required to be a row of that table. A range that scales **both** endpoints of the registry range by one factor is treated as *derived* rather than in disagreement — that is `connection-lost.md`'s 3.5× staleness window — and requiring the same factor at both ends is what stops the allowance excusing a real drift; RED-tested by moving one endpoint. Measured: 17 restatement sites, 4 flagged, **4 real**, plus 2 schema comparisons, **both real**. RED-tested once per check. `BASELINE = 1` after the decisions above, on the one remaining open finding.

- **docs:** a KNOWN-ISSUES entry for the `retryInterval` / `BootRetryInterval` pair, with the measurement showing why the heartbeat resolution does not transfer to it and the three options that remain. The Device Management entry opened in this cycle is **closed in the same release**, retained with its resolution and with the nine-actions-versus-four-keys question answered.

### Fixed

- **docs:** four of the five citations in the `StationIdentityCertificate` KNOWN-ISSUES entry pointed at the wrong lines — `06-security.md:1208` is blank (the text is at `:1290`), `provisioning-response.schema.json:66` names a different field (`:82`), and `08-configuration.md:352` and `README.md:135` are both blank (`:407` and `:182`). The finding itself is unchanged and still open.

## [0.15.0] — 2026-08-12

A command-cycle consistency pass, and it opens by repairing the previous release. **`0.14.0`'s MeterValues expiry fix landed on the wrong message.** At `0.13.0` two per-message blocks in `03-messages.md` carried the byte-identical string `| **Message Expiry** | 30 seconds |`, and the edit took the first one — which is **AuthorizeOfflinePass**, four hundred lines above MeterValues. So `0.14.0` shipped with the defect it announced as closed still in place (MeterValues still `30 s` against the defining table's `120 s`) *and* a new one created (AuthorizeOfflinePass now `120 s` against its own Appendix B row of `30 s`, citing a §5.1 category — *Periodic reporting* — whose only member is MeterValues). The companion Appendix B edit in the same commit was correct, which is why the release looked finished. **No gate saw either half:** Category 4 *Numeric Consistency* passed 29/29 throughout, because nothing cross-checks a per-message `Message Expiry` block against the `02-transport.md` §5.1 category it claims membership of. Both values are restored here, and each now names its category so the two lines are no longer interchangeable.

**MINOR is carried by the obligation changes below**, of which two touch what crosses the wire: the code a station returns on a full command queue, and the code a server returns when its circuit breaker stops a command before dispatch. The rest tighten or scope obligations that were already stated.

### Changed

- **spec:** `02-transport.md` §3.2 ordered the **station** to refuse a command on a full queue with **`6001 SERVER_INTERNAL_ERROR`** — a code `§1.1` places in the **Server Errors** range, `§3.6` defines as *"generated by the server"*, and whose recommended action tells the reader to correlate via `X-Request-Id`, a header no station has. A conforming station implementing command serialization had to emit a code the registry forbids it from generating. It is **`5107 OPERATION_IN_PROGRESS`** now: an existing code, in the range the condition belongs to (*Station Hardware & Software*), whose description already read *"the new request cannot be processed concurrently"* and whose recovery — *retry after the in-progress operation completes* — was already the right advice. `5107`'s entry is extended to name the queue case and to record that it is reachable from **every** Server→Station REQUEST rather than from any one action, which is why it appears in no single §4.2 row. No new code was minted: one that already describes the condition exactly is not improved by a second.

- **spec:** **`6008 COMMAND_PRE_EMPTED` is widened to the two kinds of pre-empt it always had**, and the circuit breaker stops borrowing a code that asserts the opposite of what happened. `07-errors.md` §6.3 answered **`6002 ACK_TIMEOUT`** to an app whose StartService it had explicitly **not dispatched** (*"without sending MQTT command"*) — while `6002` reads *"The server **sent** a command … but did not receive a RESPONSE"* and maps to `504 Gateway Timeout`. It reported a dispatch that never happened and put the fault on a station nobody had asked. That path now answers `6008`. To carry it, the entry names two kinds: a **predicted refusal**, where the server sees the station would decline and `details.wouldBe` **MUST** carry the code it would have given; and a **server-protective** refusal, where the server declines for a reason of its own and `details.wouldBe` **MUST be absent**, because the station was never going to answer and inventing a code it never gave is the borrowing this entry exists to forbid. `details.reason` is promoted **SHOULD → MUST**: it is the one member present on both, and it is what tells an operator which kind this is. **`6002` is unchanged** and still means what it says — amending it to admit an un-dispatched command would have re-created the conflation `6008` was minted to prevent.

- **spec:** `6008` gains the **fail-safe default** §1.4 requires of every branching entry, and it is the **refusal**: with no `details.wouldBe` a receiver **MUST** treat the command as not performed and **MUST NOT** infer it would have succeeded. If it cannot be said what the station would have answered, it cannot be said that proceeding is safe. Re-issuing a command that was already refused costs a round trip; believing a command ran that never left the server is a state the receiver cannot detect and cannot leave. `6008` joins `4010`, `4016`, `4018` and `4019` as a worked example of the rule — applied to an **absent** discriminator rather than an unrecognised one.

- **spec:** `6008`'s **scope** is stated rather than left to be discovered. It is reachable from in-scope endpoints that dispatch a station command — `POST /sessions/start` and `POST /pay/{code}/start` now list it, which is where the breaker case lands — and from operator surfaces this specification does not define, an administrative Reset being the worked example. `§2.4` places those outside the Error Object and the registry, so **that path is not conformance-testable**, and `reset.md` rule 2a now says so instead of implying a REST contract on an endpoint OSPP never defined. The obligation still describes the answer; what is unbound is the carrier, not the distinction. Widening §4.4 to cover administrative routes was considered and rejected: it would extend the conformance surface to endpoints the specification deliberately declines to govern.

- **spec:** the TriggerMessage rate limit is **per station**. `03-messages.md` §6.14 read *"1 TriggerMessage per action type per 30-second window"* with no domain, and the fleet-wide reading is not merely stricter — it inverts the rule's purpose. An operator with forty bays awaiting a StatusNotification could repair one every thirty seconds, so a limit written to protect stations would have become an availability limit on the operator, and one unresponsive station could silence the estate. The station-side sentence beside it is the tell: it is necessarily scoped to the single station applying it.

- **spec:** **CertificateInstall's MQTT Message Expiry read `300 s` against `60 s`** in `02-transport.md` §5.1 — the table `0.14.0` itself declared defining. It is the lone dissenter in its own category row: `SignCertificate` and `TriggerCertificateRenewal` share the *Certificate renewal* row and both state `60 s` in their own per-message blocks, and CertificateInstall is absent from `03-messages.md` Appendix B, so there was no third site to break the tie. `300 s` was also unusable by construction: the category's **Station Max Age is 30 s**, so a message the broker held for even 31 seconds would be discarded on arrival, and §5.1's own rationale sets expiry above max age *"to account for clock differences"* — a 10× ratio is not that. Corrected to `60 s`.

- **spec:** `03-messages.md` §6.9 gave the UpdateServiceCatalog retry to **the station** — *"If a catalog update fails the station **MAY** retry once after 10 seconds"* — for a **Server → Station** command. The station is the receiver and has no request to re-send. Three sites give the same retry to the server (`07-errors.md` §5.3 as a two-attempt boot policy, `04-flows.md` Appendix A and Appendix B), so the sentence was wrong on the actor, wrong on the modality (a bare `MAY` against a policy table), and wrong on the scope (unscoped against boot-only). It now **defers** to §5.3 rather than restating it, in the idiom this registry adopted in `0.14.0`, and says why the station cannot be the retrying party.

- **spec:** `07-errors.md` §6.3 told the server to probe a HALF-OPEN circuit breaker by **sending Heartbeat [MSG-008]**. Heartbeat is **Station → Server** (`03-messages.md` §5.1, row 8) and no schema exists for a server-sent one, so the mechanism could not be built as written. It also contradicted the same table two rows above, whose success threshold reads *"1 successful RESPONSE (**any action**)"*, and §6.1's generic HALF-OPEN behaviour — *"a single probe request is allowed through"*. The bullet now states that behaviour: the probe is the next command the server would have dispatched, whichever action it is.

- **spec:** §5.3's *Retry Delays* column never said what the delays are measured **from**, and the two readings are materially different. Measured from the first dispatch, `StartService (web)`'s `0s, +5s, +10s, +15s` puts the second attempt on the wire at `5 s` — while the first is still inside its own `10 s` *Timeout per Attempt* and has therefore not failed. The glossary's **REQUEST** entry settles it: *"If no RESPONSE is received within the configured timeout, the sender **SHOULD** retry"* — only a failed attempt is retried. Stated explicitly, with both multi-attempt schedules written out (`0/15/35/60 s` and `0/40 s`); the other ten rows are single-attempt and have no delay to measure. The same note records that a retry re-sends the **same `messageId`** (glossary, *REQUEST*), which is what makes transport dedup (`02-transport.md` §3.3) collapse a redelivered command instead of executing it twice — the property that lets a multi-attempt policy be stated without qualifying it per action.

### Added

- **spec:** `03-messages.md` §6.14 states the criterion separating **`NotImplemented` from `2007 COMMAND_NOT_SUPPORTED`**, which the specification carried as two answers to one question with nothing to choose between them. The scope is the discriminator and both texts already implied it: `2007` is implicit for every Server→Station REQUEST and is about the **action** (*"the requested action is recognized but not implemented … or disabled by configuration"*), while `NotImplemented` is about the **argument** (*"does not support triggering the requested message type"*). A station that supports TriggerMessage now **MUST** answer an unsupported `requestedMessage` with `NotImplemented` and **MUST NOT** substitute `2007`, which would tell the server the command itself is gone and stop it asking for any message type at all.

- **spec:** Appendix C gains the conditional block for **`6008 COMMAND_PRE_EMPTED`**, whose `details.wouldBe` has been a **MUST** since `0.11.1` with nothing enforcing it. Appendix C's own rule — *"Any entry that gains a branch MUST gain a block here in the same change, or the discriminator it declares is unenforced"* — was written in `0.8.0`; `6008` arrived three minors and eleven days later and was **the first branching entry added after the rule, and the first to violate it**. The prose count moves five → six. This block is the only one whose discriminator is a **range rather than an enum**, and the text now says why: the other five select between a handful of named causes, whereas `6008`'s *Recommended Action* directs the operator to read `details.wouldBe` and act as **that code's own registry row** directs, so the branch set is the registry itself and a closed list would need rewriting with every code added.

### Housekeeping

- **KNOWN-ISSUES:** new open entry — **nothing checks a per-message `Message Expiry` against the category it names**, which is the hole the MeterValues regression above went through. Both sides are already structured (§5.1's category table, Chapter 03's per-message blocks, Appendix B), so the join is cheap; the entry specifies it with the three ratchet properties this registry now requires of any new gate — **refuse on a thin parse** (floors on each side, because a selector that quietly stops matching is this repository's most-repeated failure), **zero matched pairs is a FAIL rather than a pass** (the pass condition is *N compared and N agreed*, N asserted `> 0`, never *no disagreement found*), and **check the citation, not only the number** (a block naming a category must be in it — the half that catches AuthorizeOfflinePass, which named *Periodic reporting* and appears in no §5.1 category at all). It must also treat *named in no category* as coverage rather than failure, since `TriggerMessage` and `DataTransfer` are in no §5.1 row. Not built here; recorded with its specification, in the shape of `tools/check-config-defaults.py`, which already performs the equivalent join for configuration defaults.

- **KNOWN-ISSUES:** new open entry — **the SDKs byte-guard the vendored schemas and guard the vendored vector corpus with nothing.** Both SDKs vendor two artefacts from this repository, and both CIs `diff -rq` only one of them. `v0.14.0` moved the corpus with the schema — `meter-values-event-minimal.json` rewritten, `meter-values-event-empty-values.json` added, 316 → 317 — so a maintainer who does exactly the right thing (`cp -r spec/schemas`, bump `.spec-ref`) gets two red suites and no indication that the vectors were the other half of the job. The entry specifies the gate to build and where, in the shape of the existing schema step, and records that the three hardcoded corpus totals should become run-time counts asserted `> 0` rather than literals a human hand-updates per vector.

### Downstream adoption order for `v0.14.0`

Not a spec change; recorded here because getting it wrong is a red CI and the reason is not obvious from either repository. **One schema moved substantively** — `common/meter-values.schema.json` gained `minProperties: 1` — and `mqtt/session-ended-event.schema.json` changed a `description` only. Neither SDK needs a production `src/` change: neither models per-message error-code sets, so `3012`/`3013` becoming permitted ReserveBay responses is a nil code change. The order is forced:

1. re-vendor `schemas/` (PHP `schemas/`, TS `src/schemas/`);
2. re-vendor `conformance/test-vectors/` (PHP `tests/Fixtures/test-vectors/`, TS `src/test-vectors/`) — **this is the step that is easy to miss, because nothing checks it**;
3. update the three hardcoded totals — `ConformanceVectorTest.php` `156` → `157`, `SchemaValidator.test.ts` `316` → `317` (the valid count `160` is unchanged);
4. move `.spec-ref` to `v0.14.0`;
5. release.

**Reversing 4 and 1–3 turns CI red**, in both repos, because each CI clones this repository at the tag named in `.spec-ref` and byte-diffs the vendored tree against it. And note the asymmetry in what the schema change actually does: **`sdk-ts` validates at runtime** (`SchemaValidator` compiles Ajv over the vendored tree and is a public export), so `minProperties` is a behavioural tightening on a public API the day it ships; the PHP SDK ships schemas as artefacts (`opis/json-schema` is `require-dev`), so nothing changes inside it — the effect lands in the consumer.

## [0.14.0] — 2026-08-12

A session-cycle consistency pass. Thirty-one claimed self-contradictions were re-verified one at a time against the files rather than inherited from the report that raised them; **one was disproved outright**, several were understated, and the rest are repaired here. MINOR is carried by two obligation changes that widen what a conformance claim binds: the CancelReservation StatusNotification moves **SHOULD → MUST**, and `TC-TX-003` stops requiring the opposite of what four normative sites mandate. No wire change; `protocolVersion` stays `0.3.0`.

**The disproved one is worth stating first, because the repair would have been damaging.** The report held that timer expiry, read literally, orders *both* a StopService *and* a SessionEnded — citing `05-state-machines.md` §3.3's `Active → Stopping` row as ordering the server to send StopService on a timer. The row's Action column reads, in full: *"Server sends StopService [MSG-006] to station; **if duration elapsed, station auto-transitions**"*. The quote had been cut at the semicolon. With the clause restored the row agrees with `:264`, with `:430`, with the §2.3 bay table that declares itself canonical, and with ~29 other sites; **zero sites anywhere say the server sends StopService on timer expiry**. What actually survived was one loose sentence — the `Stopping` state description attached "duration elapsed" to a stem asserting a command had been sent — and that sentence is reworded here. A contradiction between chapters would have justified changing a state machine; a drafting slip justifies changing a sentence.

### Changed

- **spec / conformance:** the **low-delivery refund override** was declared in one place and hardcoded in eleven others. `04-flows.md` §6 defines it as `faultFullRefundThreshold`, a configurable product parameter defaulting to `0.50`, and says in terms that it is *"never a constant baked into an implementation"* — while **24 lines across 11 files** wrote `50%` or `0.5` literally, including two sites in `04-flows.md` itself, ~560 lines above its own prohibition. Every site that states the policy now names the parameter. The definition also contradicted itself: it mandated reading the value from configuration and, in the same sentence, mandated keeping the configured value *"in lockstep"* with the specification value — which is not a configurable parameter but a constant with extra steps. It now says what it can mean: read it from configuration, ship `0.50` as the default, and an operator setting another value is making a product decision rather than failing conformance. Two further gaps are closed in the text: the parameter is **server-local and deliberately not a Chapter 08 key** (Chapter 08 is the *station* registry, and this value never reaches a station), and it is **`UserDuration`-only**, because a `Fault` on the other two service kinds is already an unconditional full refund and never consults it.

- **conformance:** `TC-TX-003` carried **three** defects, two of them the kind that makes a conforming station fail certification. **(1)** Part C sent a duplicate StopService seconds after the first and required `3006 SESSION_NOT_FOUND` — with `Expected Result 7` and `Failure Criterion 6` both pinning it — while `stop-service.md` §6 rule 10, `profiles/transaction/README.md` §4.3 and `02-transport.md` §5.3 all require the **cached `Accepted` payload** inside the 24-hour OSPP Session Retention Horizon, `3006` becoming permissible only beyond it. Rule 10 arrived in `0.4.0`; Part C has been unchanged since the initial commit and was never reconciled with it. **(2)** Step 12 applied the low-delivery override to a **server-commanded stop**, which emits no SessionEnded and therefore has no `reason` for a reason-keyed override to match — contradicting the case's own Purpose line, which defines the refund as `creditsAuthorized - creditsCharged`. **(3)** `Expected Result 2` required `creditsCharged` to be *"strictly proportional"* to `actualDurationSeconds / durationSeconds * creditsAuthorized` — a third billing basis, and one the normative per-minute-rounded-up formula can never satisfy. All three are corrected against the normative sites.

- **spec:** `stop-service.md` §6 rules 2 and 10 contradicted each other **inside one file**. Rule 2 mandates `3006` whenever no session is active on the bay; rule 10 mandates the cached response for exactly the case rule 2 catches first. An implementer applying the rules in listed order never reaches rule 10. Rule 2 now defers to rule 10 explicitly and says the rules are not independent, and the `3006` row of the error table carries the horizon qualifier.

- **spec:** the **credit formula** was stated two ways and the canonical worked example was wrong with real money. Three normative sites give `ceil(actualDurationSeconds / 60 * priceCreditsPerMinute)`; `examples/flows/02-online-session.md` stated `ceil(s / 60) * rate` as a design decision. Two worked examples used numbers that discriminate between the readings and both took the wrong one: `07-session-stop.md` billed 182 s at 10 cr/min as **40 credits instead of 31** — a 29% overcharge, with the 9-credit error propagating through fifteen further lines including the wallet balance and the user-facing summary — and `05-partial-a-session.md` billed 174 s as 30 instead of 29. Both are recomputed end to end. The remaining examples use whole-minute durations, where the two readings agree, and were not evidence of a second formula.

- **spec:** three sites stated pro-rata settlement **unconditionally** while `04-flows.md` §6 makes it the baseline that *Settlement by Service Kind* overrides — `session-ended.md` §4, `05-state-machines.md` §3.3 and the implementors' guide, none of which mentioned service kind at all. Rather than restate the override in each (the failure mode this registry keeps producing), each now **defers** to the defining section, in the idiom `05-state-machines.md` §3.4 already uses for Chapter 08 config keys. `07-errors.md` §7.4's unqualified *"Pro-rated rule"* row — which sat directly under a *"Station offline during active session"* row and is the source `TC-TX-003` cited for its wrong-domain override — is replaced by a pointer for the same reason.

- **spec:** the service-kind section named a carrier that cannot carry it. It said the kind is *"a settlement attribute each service in the operator catalog declares"*, but the only catalog OSPP defines is UpdateServiceCatalog, whose `service-item.schema.json` is `additionalProperties: false` with no such field — a server publishing a kind would be rejected `5023 INVALID_CATALOG`. The text now says what is true: the kind is **server-side product data, not carried by the protocol**, and the section is consequently **not conformance-testable over any OSPP interface**, which is why no test case exercises it. The section also contradicted itself on its own cardinality — *"the two reasons where the models diverge"* against *"Only the `Local`, `Fault` and `OperatorStopped` rows diverge"*, three — a residue of the commit that added `OperatorStopped` to the table without updating the sentence.

- **spec:** `SessionEnded`'s `seqNo` was defined as *"matches the running `seqNo` of the **last** MeterValues"* in `03-messages.md` §5.4 **and in the schema description**, against `02-transport.md` §3.2, `session-ended.md`, the guide, and `03-messages.md`'s own MeterValues row 62 lines above, all of which require an increment of exactly `1` on every session-scoped EVENT. Under the minority reading a conforming receiver sees a repeat where it MUST verify an increment, and flags a HIGH-severity billing audit for it. Aggravating: `session-ended.md` names Chapter 03 §5.4 as *"the authoritative field list"*, so the pointer resolved to the wrong half of a chapter disagreeing with itself. Both carriers now state the increment.

- **spec:** `03-messages.md` §5.4 required the server to *"use the `creditsCharged` … for final billing"* two lines above conceding it is advisory, against four MUSTs elsewhere requiring recomputation. The sentence now separates the delivery record from the amount: settle from the event rather than from StatusNotification, and recompute the amount under the active tariff.

- **spec:** `cancel-reservation.md` §6 rule 5 said the station **SHOULD** send a StatusNotification after releasing the bay, against `05-state-machines.md` §2.5, `status-notification.md` §6 and **CORE-005**, all MUST, and against the sibling repair already recorded in `reserve-bay.md` §6 — which fixed the identical defect and wrote down why: *"An earlier revision said SHOULD, which left a server holding a bay `Reserved` after the station had released it, with no conforming way to find out."* The cancel path had simply not been swept. It is a MUST now, with the same reasoning attached so it is not "corrected" back.

- **spec:** `status-notification.md` §6 rule 5 mandated buffering StatusNotification *"up to 1000 events or 24 hours"* while `01-architecture.md` §7 classifies it **Category 2 — MAY Discard (Regenerable at Reconnection)**, `07-errors.md` and the guide agree, and the guide's own conformance checklist says outright *"do not spend the buffer on them"*. The MUST also competed for the same NVS as the 1000 TransactionEvents `01-architecture.md` requires. Aligned to MAY, with the regenerability reason stated.

- **spec:** `start-service.md` §6 rule 3 required `3014` only when a reservation is held by a **different** `reservationId`, so a StartService that **omits** the field on a `Reserved` bay satisfied no rule in the profile and a literal reader accepted it — while `03-messages.md`, `05-state-machines.md` §2.3 and `TC-TX-002` all send exactly that request and require `3014`. The rule now reaches the absent-field case.

- **spec:** two error-code descriptions in `03-messages.md` §3.4 described conditions the state machines forbid or the rules never reach. `3007` was *"session exists but on a different bay"*, which collides with rule 2's `3006` on the concrete case; it now states the reachable condition and names `3006` for the other. `3011` was *"bay entered maintenance during session"*, a transition `05-state-machines.md` §2.3 refuses with `3001`; it now describes the state a stop can actually meet.

- **spec / conformance:** numeric drift. MeterValues' MQTT Expiry Interval read **30 s** in `03-messages.md` (twice, once in an appendix that cites Chapter 02 as its source) against **120 s** in `02-transport.md` §5.1, the defining table, where the row was added in `0.4.0` and the copies never followed. `04-flows.md` §4 called the web-payment flow's 180 s TTL a *"default"* when the registry default is 300 s and 180 s is this flow's deliberate non-default. Three `diagrams/` files still carried *"default 15s"* for `MeterValuesInterval` against a registry default of 60 — the one place the earlier sweep missed, because `check-config-defaults.py` scans neither `diagrams/` nor any `.mmd` file at any path. Advice in the guide and `06-security.md` was conditioned on `MeterValuesInterval` *"below 10s"*, a value both configuration write paths MUST reject.

### Added

- **schemas:** `common/meter-values.schema.json` gains **`minProperties: 1`**. `meter-values.md` §5 has always said *"The `values` object **MUST** contain at least one field"*, and nothing enforced it — `{"values": {}}` validated, on a schema `$ref`d by four messages. A **valid** test vector was encoding exactly the forbidden shape (`meter-values-event-minimal.json`); it now carries one reading, and a new **invalid** vector pins the empty case so the rule is falsifiable rather than merely stated. Vectors: 316 → 317, all passing.

- **spec:** `03-messages.md` documents the **two mutually exclusive forms** of TransactionEvent. The schema has constrained the payload with a `oneOf` — pass-form (`offlinePassId` + `passCounter`, forbidding `authId`/`sessionId`) and auth-form (`authId` + `sessionId`, forbidding the other two) — while every field table described only the pass-form and marked `offlinePassId` unconditionally **required**, which the auth-form arm forbids. `passCounter` was required by the schema and named in no table at all. All four fields now appear with `Cond.` and the forms are stated. This closes two of the fourteen `verify-protocol.sh` failures; `finalSeqNo`, missing from the StopService RESPONSE table while present in the schema, the profile document and `05-state-machines.md` §3.3, closes a third.

- **spec / conformance / examples:** `deviceId` was carried at the **top level** of four TransactionEvent payloads — `transaction-event.md`, `03-messages.md`, `reconciliation.md` and `TC-TX-006` — where `additionalProperties: false` makes it invalid. It belongs in the signed receipt, where `receipt-data.schema.json` requires it and where the examples' own base64 blobs already carry it. Removed from all four. Three flow examples carried `offlinePassId` with no `passCounter` and failed the pass-form arm; `passCounter` added. No gate reads fenced JSON inside `.md` files, which is why 316/316 said nothing about any of this.

- **spec:** error tables that omitted codes their own documents mandate. `3006` is required of StartService by `start-service.md` §6 and appeared in none of its four tables, nor in `07-errors.md` §4, nor in the Appendix C *Used By* column. `transaction-event.md` §8 listed **5** error codes where `07-errors.md` §4 lists **12** — and the seven missing ones are precisely those Chapter 07 **bolds** as most common. Six profile documents' closing *"Error codes: …"* trailers understated their own tables; all six are corrected against the tables as measured, not as remembered. (The report attributed this to `start-service.md` alone; it is the only one *within the Transaction profile*.)

- **spec:** `SessionEnded` had no row in `03-messages.md` Appendix B, the MQTT expiry reference, though the other four never-expire messages have one and both the message definition and the profile document say it never expires. Added. Relatedly, **none of the twelve worked flows mentioned SessionEnded at all**, and two settled a timer-expired session from StatusNotification alone — the one thing `03-messages.md` §5.4 forbids in those words. Both narratives now carry the event, and `04-flows.md` §3's StartService field list gains the required `programNumber`, which appeared in no field enumeration in that chapter.

### Housekeeping

- **KNOWN-ISSUES:** new open entry — **170 numbered processing rules, and nothing says whether the numbering binds.** Twice in this cycle a correct rule was unreachable because another in the same list fired first: `stop-service.md` §6 rule 2 answering `3006` before rule 10's cached response could be reached, and `reserve-bay.md` §6's bay-state check passing on an expired reservation whose bay is already `Available`. Measured: **170 numbered rules across 23 profile documents, and none of the 23 says whether the order is normative.** Two documents elsewhere do say it — `authorize-offline-pass.md` §5 and `connection-lost.md` §5 — so the specification knows how; neither is a Processing Rules section. A numbered list reads as ordered and reads as a set of invariants, the two give different wire behaviour, and neither is wrong against the text, so nothing can be checked. Same class as the entry below.

- **KNOWN-ISSUES:** new open entry — **a restatement that does not cite its source cannot be checked against it, and ~103 of ~127 restatements cite nothing.** This is the cause the 31 contradictions sat on, not another instance of them: every one was a value, rule or field list defined once and re-typed somewhere that did not say what it was a copy of. Error-code tables are the worst category — **0 of 23 name the registry that governs them**, measured independently as 0 of the 11 profile documents carrying an `Error Codes` section. The cross-reference graph explains why this release's hardest question was hard: `03-messages.md` calls itself the normative reference for every message and is referenced by **2 of 36** profile documents, against `07-errors.md`'s 31 — and `reserve-bay.md` references it zero times. Not repaired here; a partial sweep of 103 sites is the failure mode this registry has already named as worse than the original defect.

- **spec:** `meter-values.md` §5 restates `MeterValuesInterval`'s full default/min/max triplet without declaring itself a restatement, while `profiles/transaction/README.md` §4.2 promises those limits are *"defined once"* in Chapter 08 and *"deliberately not restated"*. The values agree, so this was a promise not kept rather than drift — repaired the way `05-state-machines.md` §3.4 already does it, by naming the defining registry and saying it governs.

### Decided

All four contradictions this pass deliberately left open have been answered by the specification's owners. In three of them the losing sentence was the one with the stronger RFC 2119 keyword, which is why the reasoning is recorded rather than just the outcome.

- **The low-delivery override does not apply to a connection-loss close.** `connection-lost.md` §5 carried a **MUST** granting a 100% refund when the grace timer expires below the threshold. It is removed: that path now bills **pro-rata on the time delivered**, matching `04-flows.md` §6's own matrix row and `07-errors.md` §7.4, which had always said pro-rata for a station-offline session. The reason the MUST was wrong is that it confused two different failures — *the service failed* and *the communication failed*. The override exists for the first: `Fault` means the station broke what the customer was buying. A grace-period expiry produces no SessionEnded at all, and says nothing about what was delivered; the customer received what they received and is billed for it. Left as it stood, a station's network fault was a free wash.

- **`SessionTimeout` is not extended, and is now documented as unspecified.** The obvious repair — a seventh `reason` enum member for an inactivity stop — was rejected: it is a wire change for a feature nobody has asked for, and the mechanism is broken in both directions before it exists. `08-configuration.md` §3 now records all three gaps: the stop cannot be reported (the enum is closed at six and none is a timeout), the registry and `05-state-machines.md` §3.4 state the rule with **different triggers** (*no user interaction* vs *no MeterValues or user interaction*), and under the MeterValues-counting reading the timer is inert at the default pair (`60`/`120`, where MeterValues always arrive first) and fires on every session at the legal extreme (`3600`/`600`, where none can). Both pairs are inside the published ranges and the registry warns against neither. Naming the breakage is more useful than a wider enum: whoever wants the feature can now see why it is not trivial.

- **Chapter 04's session-state vocabulary is declared server-internal.** `idle`, `pending_ack`, `reserving` and `reserved` stay, but Appendix C now states that they are the server's own bookkeeping names and that **no station obligation attaches to any of them**. Aligning them to Chapter 05 was rejected on the ground that it would promote four names no station can observe — carried by no message, visible on no interface — into normative protocol states. A state a station cannot see cannot be an obligation it holds. The six real session states are named inline and pointed at Chapter 05 §3, and the PaymentIntent table below is marked server-internal for the same reason.

- **Duplicate ReserveBay is idempotent only while the reservation is live; the other two situations are refused by name.** The decision follows `03-messages.md` §3.1's own word *"any **other**"* and the shape `cancel-reservation.md` already has: two operations on one resource that behave differently on a re-send is a worse outcome than either answer alone. `reserve-bay.md` §5.1 gains rules 7–9 — a payload-identical repeat under a live `reservationId` returns the same `Accepted` without restarting the timer; an expired identifier returns `3013`; a consumed one returns `3012` — and §6 rule 2 now resolves the identifier **before** the bay-state checks, because an expired reservation has already returned its bay to `Available` and a bay-state check reached first would silently accept a new reservation under a spent identifier. That is the same rule-ordering defect repaired in `stop-service.md` this release.

  Three debts the decision required were already outstanding regardless of it. **The codes:** `3012` and `3013` were absent from all three ReserveBay error tables, so the message had no conformant way to say *that reservation is expired*; added to Chapter 03, `07-errors.md` §4 and the profile's own §7, each with its trigger. **The retention:** `reserve-bay.md` §5.2 is new, and its duration is *derived* rather than picked — retention is what makes a comparison executable, so the record must outlive the reservation by at least as long as a request that must be judged against it can still arrive, and this specification already states that bound as the transport deduplication window (`02-transport.md` §3.3, 1000 IDs or 1 hour). A consumed reservation needs nothing further, being part of the billing provenance of the session it became. The gap was already live: `cancel-reservation.md` §5 rule 3 and `05-state-machines.md` §4.5 both demanded a `3013` about an expired `reservationId` that nothing obliged a station to remember. **What "same" means:** the schema permits a differing `expirationTime` under one `reservationId`, so identity of the identifier is not identity of the request — the precedent being `offlineTxId`, which the corpus already settles by comparing content. A differing payload is not a repeat, falls through to normal processing, and draws `3014`; OSPP has no operation that amends a live reservation.

  And the ninth site is no longer load-bearing on an undefined word: `05-state-machines.md` §2.3's condition *"no active session or **existing** reservation"* now says that *existing* means `Confirmed`, and that a retained terminal record does not hold the bay but does bind its identifier.

### Migration

No wire change and no coordinated upgrade. Two obligations move and both are station-side. A station that already sends a StatusNotification after CancelReservation — which `05-state-machines.md` and CORE-005 already required — is unaffected by the SHOULD → MUST. A station that buffers StatusNotification while offline remains conformant; it is now permitted to stop, and the buffer is better spent on TransactionEvent and SessionEnded. Stations claiming **Standard** compliance should note that `TC-TX-003` Part C now requires the cached `Accepted` for a duplicate StopService inside the retention horizon, which is what `stop-service.md` §6 rule 10 has mandated since `0.4.0`; a station that answers `3006` there passed the old case and was never conforming.

## [0.13.0] — 2026-08-11

Four defects that each survived because the thing that should have caught them was looking somewhere else. MINOR is carried by one of them: `SessionEnded` joins the **Transaction** profile, and a profile gaining a required action widens what a conformance claim binds ([VERSIONING.md](VERSIONING.md) — *new action in a profile*). The other three are PATCH-grade on their own. No wire change; `protocolVersion` stays `0.3.0`.

### Changed

- **spec:** `profiles/core/README.md` CORE-010 stated **MUST** where `profiles/core/heartbeat.md` §6 — the document station firmware implements — states **MUST** compare and **SHOULD** adjust. SHOULD is correct, decided from what the rule protects rather than from which spelling appeared more often. Nothing in the protocol breaks at 2.1 seconds of drift: session duration runs on a monotonic timer (§6 rule 5), anti-replay is `messageId` binding and monotonic counters with a clock-based key TTL expressly forbidden ([`06-security.md` §5](spec/06-security.md)), and the one mechanism that does consume station timestamps — the StatusNotification ordering floor — states its own tolerance, that the protocol "treats several minutes of station skew as unremarkable" ([`02-transport.md` §3.2](spec/02-transport.md)). The hard boundary is 5 minutes and it **is** a MUST. A MUST at 2 s would also fail stations for their network rather than their clock, since measured drift includes the server's processing time plus the downlink delay. **The rule was stated in four places, not two**, and a partial repair is the failure mode this registry has already named as *worse than the original defect* (the `2001`/`1004` boot-path arc): `02-transport.md` §10.3 additionally carried an unconditional MUST **and** a warning threshold of **5 seconds** against §6's **5 minutes** — a 60× disagreement in a sentence nothing had reread — and the `guides/implementors-guide.md` station checklist carried a flat `[MUST]`. All four now agree, `heartbeat.md` §6 is named as the single normative statement, and the reasoning is recorded there so the next reader does not "correct" it back. Boot-time sync is untouched and remains an unconditional MUST — a different obligation from steady-state drift correction.

- **spec:** `00-introduction.md` §3.6 mandated millisecond precision and then demonstrated it with `"2026-02-13T10:30:00Z"`, a value its own [`timestamp.schema.json`](schemas/common/timestamp.schema.json) rejects. `git log -S` shows the line untouched from the initial commit — while `KNOWN-ISSUES.md` V2-050 recorded the repair as done. **The false row is the larger defect**: a registry claiming repairs it did not perform is worse than an incomplete one, because an incomplete registry sends you to look and a false one tells you not to bother. V2-050 now states what happened, and the table's preamble records that its rows are claims rather than verified state.

- **tools:** `verify-protocol.sh` Category 16 (timestamp format) did not scan `spec/` or `guides/` at all, and in the two `examples/` trees it did scan it read only `extractJsonBlocks` output — so a timestamp had to sit inside a ```json fence that *parsed* before it could be seen. Every timestamp written in prose was invisible, and reported line numbers were offsets into a regenerated string rather than into the file. Roots extended and the markdown path now scans raw text: coverage went from 95 files to 126, which surfaced **four further prose timestamps** in `examples/` that restated wire values their own JSON carried correctly. Verified by negative control — a prose timestamp planted in `spec/` is now caught, at its real line number.

### Added

- **spec:** `06-security.md` §5.4 now says that the HMAC key is the **decoded 32 bytes** of `sessionKey`, not the 44-character Base64 text that carries it. The formula read `HMAC-SHA256(sessionKey, …)` while `sessionKey` is defined as Base64 in three places, so the literal reading keyed the MAC with the text. Both reference SDKs already decoded, which made the agreement convention rather than requirement. The spec says this where it has to elsewhere — for the BLE nonces (§6.5: "the **decoded 32-byte nonce values**, NOT their Base64 text") and for the receipt (`reconciliation.md` §5) — and the sentence had simply never been written for the MQTT key. §5.5 and the BLE `sessionKeyConfirmation` are corrected to match.

- **conformance:** `test-vectors/crypto/mqtt-mac.json` — the corpus had **no MAC vector for MQTT** at all. Built on §5.3's worked example and agreed byte-for-byte by four independent oracles (`ospp-sdk-php`, `sdk-ts`, `node:crypto`, and `openssl` as the non-circular anchor). It records `macIfKeyNotDecoded` — the value the literal reading produces — so the two readings are distinguishable rather than merely stated. `tools/verify-mqtt-mac.mjs` recomputes all of it and runs as **Category 19** of `verify-protocol.sh`: a vector nothing recomputes is a claim, not a check.

- **tools / conformance:** `tools/canonical-form.mjs` — **one** implementation of §4.8.1 for the whole toolchain, written from the rule text with every step citing the line it comes from, plus `conformance/test-vectors/crypto/canonical-form.json` (17 vectors) and `tools/verify-canonical-form.mjs` as **Category 20**. `verify-mqtt-mac.mjs` had shipped `Object.keys(value).sort()` — UTF-16 code-unit order where [`06-security.md:679`](spec/06-security.md) requires UTF-8 **byte** order — which was the third implementation of that rule in this programme carrying the same defect both SDKs had just been repaired for; it passed only because its vector's keys are ASCII. The vectors' canonical strings were recomputed from the text in a third language before adoption, not taken from either SDK's output: a vector generated from an implementation only proves that implementation agrees with itself. The module deliberately does **not** import `canonicalize` from `@ospp/protocol`, because a gate that canonicalizes with the SDK verifies the SDK against itself and passes whatever it does wrong — a shape this repository has produced twice before. Category 20 also asserts the corpus stays **falsifiable**: it runs a deliberately broken canonicalizer and requires the vectors to reject it (three do), so a corpus that stops discriminating fails instead of passing silently.

- **spec:** `profiles/transaction/session-ended.md` — `SessionEnded` [MSG-040] belonged to **no profile**. Core listed six actions, Transaction six, Security four, Device Management nine, Offline/BLE fourteen: 39 of 40 messages, and SessionEnded was the fortieth. It is in the catalogue, has its own Chapter 03 section, is forbidden from being discarded while buffered because it is billing evidence, and never expires — yet a station implementing every profile exactly as written would not have implemented the sole billing source for autonomously terminated sessions. Assigned to **Transaction**, which owns the session lifecycle and the billing surface and is mandatory from **Standard** compliance upward, so the obligation lands on every production station; Core would have bound it at **Development** too, where there are no sessions to end. Chapter 03 files it under "Status & Monitoring", which is a documentation taxonomy and not a profile assignment — MeterValues sits in the same section and has always been a Transaction action. Transaction is now seven actions in all five places that counted them.

- **spec:** `06-security.md` §4.8.1 answers two things it had left open, both surfaced by building the vector corpus above. The escape example was literally `A` — mangled out of `A` in the commit that introduced it, so a rule about when *not* to escape was illustrated with the unescaped character and said nothing. And `U+007F` DEL was undecided: it is Unicode category `Cc`, but RFC 8259 requires escaping only below `U+0020`, and *minimal required* means required by RFC 8259 — so escaping DEL would be an escape sequence used for a character that does not require one, which the same sentence forbids. DEL and the C1 range `U+0080`–`U+009F` are emitted literally, as are `U+2028`/`U+2029`; the spec now says so rather than leaving two halves of one sentence to disagree. Both SDKs already behaved this way — it was unstated, not wrong — and the reading chosen is the one that keeps the rule implementable without a Unicode character-class table.

- **schemas:** `trigger-message-request.schema.json`'s `bayId` was a bare `{"type": "string"}` while all 18 other `bayId` sites `$ref` `common/bay-id.schema.json`. It accepted any text at all as a bay identifier, on the one message whose purpose is to name a bay to report on. Now `$ref`d like the rest; all 19 agree and the 316 vectors still pass, so nothing relied on the looseness.

### Housekeeping

- **KNOWN-ISSUES:** the 4xxx finding enumerated **114** error codes at `ospp-sdk-php` v0.8.4 + `sdk-ts` v0.7.0, and its category partition summed to 114 — while the registry is 118 everywhere else. A dated measurement rather than a disagreement, so it is **re-measured** rather than incremented: 118 codes in both SDKs today, partition `15 / 20 / 20 / 20 / 34 / 9` (`3xxx` 17→20, `6xxx` 8→9). The finding is unchanged and still open — PHP labels `5xxx` `station`, TS labels it `Hardware`, and the spec gives neither.

- **KNOWN-ISSUES:** new open entry — **the signing toolchain canonicalizes with the SDK, so it verifies the SDK against itself.** `sign-inline-md.mjs`, `sign-example.mjs`, `verify-example-signatures.mjs`, `verify-ble-crypto.mjs` and `generate-ble-vectors.mjs` all import `canonicalize` from `@ospp/protocol`; `verify-example-signatures.mjs` therefore checks signatures with the same canonicalizer that produced them and cannot fail on a canonicalization defect by construction. The installed copy is **0.5.4** against a declared `^0.13.0`, and 0.5.4 carries both repaired defects. **Measured exposure is zero** — across 372 committed JSON files and 1846 objects, no object has keys whose UTF-8 and UTF-16 orderings differ and none has an integer-like key — so the chain is not re-pointed in this release; the safe order is to bump the dependency first and re-measure.

- **KNOWN-ISSUES / CHANGELOG:** the two follow-ups flagged in `[0.4.1]` moved out of the changelog, where they had sat for 68 days and eight minor releases. A changelog records what a release *did*; nothing sweeps it for outstanding work and the release carrying it scrolls out of view within a cycle. The SessionEnded one is closed by this release (and was filed against `profiles/core/`, which is not where it landed); the server-originated `FraudDetected` SecurityEvent remains open and is now counted in the KNOWN-ISSUES summary table.

### Migration

- No coordinated upgrade required and no wire change. A station already conforming to `heartbeat.md` §6 is unaffected by the CORE-010 correction, which removes an obligation the authoritative document never imposed. Implementations that already decode `sessionKey` before keying the HMAC — both reference SDKs do — are unaffected by the §5.4 sentence. Servers and stations claiming **Standard** compliance should confirm they emit and accept `SessionEnded`, which is now a listed Transaction action rather than an unassigned message.

## [0.12.1] — 2026-08-11

> **A conformance-corpus repair pass, and the resolution of a contradiction the corpus could not
> be repaired around.** Three conformance cases stimulated the same condition — an `offlineTxId`
> arriving twice — and two mandated `Duplicate` while one mandated `Accepted`. No server could
> pass all three. The spec said both, four normative sites each way, all born in the initial
> commit, neither side citing the other.
>
> **PATCH, and the reasoning is worth stating because it cuts the other way from `0.12.0`.**
> Nothing here changes what binds. The corpus fixes make cases measure obligations `spec/` has
> carried all along — `programNumber` was always required, the MAC was always envelope-scoped, the
> firmware `signature` was always mandatory — so an implementation that "passed" a broken case was
> **already non-conformant and only its instrument was wrong**. The reconciliation resolution
> resolves a self-contradiction using a status value every implementation already handles. No
> schema changes, no new status value, no new error code, no new field; `protocolVersion` stays
> **`0.3.0`**.
>
> **The counter-argument, recorded rather than dismissed.** What a vendor must *demonstrate* to
> certify has materially grown: verifying the station certificate before transmitting a credential,
> and rejecting an unsigned firmware image, are now failure criteria where previously they were
> not. Anyone holding that the corpus is itself normative would call this MINOR by the same
> reasoning that made `0.12.0` MINOR. The distinction drawn here is that `0.12.0` changed which
> sentences bind, whereas this changes only which sentences get tested. **A compliance claim
> resting on the corrected cases was never valid**, and re-certification against `TC-OFF-001`,
> `TC-SEC-001` and `TC-DM-002` is warranted.

### Changed

- **A duplicate `offlineTxId` now has two answers, because it was always two situations.** The
  server **MUST** compare the arriving signed `receipt.data` against the stored one
  ([`reconciliation.md` §3](spec/profiles/offline/reconciliation.md)):

  - **Byte-identical** — a retransmission after a network failure. Answered **`Duplicate`**,
    without re-processing. Unchanged in substance, and it is what the reference server and its
    tests already do.
  - **Different** — two distinct claims under one identifier: a collision or tampering. Answered
    **`Rejected`**, with both records retained, an operator alert, and an `OfflinePassRejected`
    SecurityEvent carrying `errorCode` `2017` and `details.field: "receipt.data"`.

  `transaction-event.md` §7.2 previously read *"**MUST** respond with `Duplicate` **regardless of
  payload differences**"*, and `reconciliation.md` §3 rule 3 previously read *"**MUST** respond
  with `Accepted` without re-processing"*. Both are replaced by the comparison above.

  **Why `Duplicate` could not cover the second case.** `Duplicate` orders the station to delete
  its local copy. [§9 Conflict Resolution](spec/profiles/offline/reconciliation.md) requires the
  server to **retain both records** for exactly that case — and the station's copy is one of the
  two, the only one not under the control of whoever submitted the second claim. The spec was
  ordering a station to destroy the evidence its own conflict-resolution rule wanted compared.
  §9 assigned no status at all, which is how the two rules never met.

  **The comparison is on the signed `receipt.data`, not field-by-field.** Two submissions that
  agree on the station's signed statement are the same transaction by construction. Byte equality
  over one value needs no field list to keep in step with the schema and cannot be defeated by an
  attacker who controls the envelope, because the receipt is signed and the envelope is not.

- **`Duplicate` and `Rejected` no longer imply the same thing about the station's record.** Each
  status now carries **two separately stated obligations** — whether the station sends the
  transaction again, and what it does with its local copy
  ([`transaction-event.md` §5.1](spec/profiles/transaction/transaction-event.md)). They were
  conflated in a single "terminal for the station's copy" framing, and nothing in the spec forced
  the pairing: the text only ever said *delete*. `Rejected` is now explicitly **stop sending,
  retain the record**; `Duplicate` and `Accepted` remain stop sending, delete. That separation is
  what makes the different-data answer expressible at all.

  **No wire change was needed to express it.** `Rejected` is already in the status enum and
  already means "MUST NOT retry" to every deployed station; [§6.4](spec/profiles/offline/reconciliation.md)
  already carries free-text `reason` on the wire with the machine-readable discriminator in the
  SecurityEvent, stating that error codes are *"recorded rather than transmitted"*. A new status
  value or a `reason` enum would each have been a wire change, and this release is a PATCH.

### Fixed

- **`Accepted` said both "MUST delete" and "MAY purge after 72 hours".**
  `transaction-event.md` §6 rule 4 and `reconciliation.md` §2 step 5 gave different dispositions
  for the same status, neither citing the other. Reconciled: the station **MUST NOT** send the
  transaction again — immediately — and **MUST** delete the record, with deletion permitted to lag
  by up to 72 hours for a local audit window. The two obligations were never in conflict once
  separated; only the single word "delete" made them look it.
- **`Rejected` was MUST-flag in one file and MAY-flag in another** (`transaction-event.md` §5.1
  against `reconciliation.md` §6.4). Now **MUST**, in both, together with the retention that the
  phrase "mark the transaction as rejected in its local log" already presupposed and never stated.
- **`RetryLater` directed the station to wait `retryInterval`, a field that cannot reach it.**
  [`transaction-event-response.schema.json`](schemas/mqtt/transaction-event-response.schema.json)
  is closed over exactly `status` and `reason`, so no conforming response can carry an interval.
  Both restatements — `03-messages.md` §4.1 and `04-flows.md` §11 — now say what is actually
  available: station-side exponential backoff, initial 5 s, cap 300 s.
- **The cross-channel collision was unspecified, and the specification now says so.** §9 row 1
  makes the app's record display-only, so it does not settle and does not create the ledger entry
  that would make the station's later TransactionEvent a duplicate. **The app→server submission
  path itself is defined nowhere in `spec/`** — `examples/flows/05-partial-a-session.md` and the
  implementors guide describe a `POST /me/offline-txs` endpoint the specification does not define,
  and that example also has the app's upload settling ahead of the station, which §9 does not
  permit. Until the path is specified, an implementation **MUST NOT** rely on an app-submitted
  record to settle an offline transaction.
- **The firmware example carried `sha256("test")` as the checksum of an image whose signature was
  over the real binary.** [`03-messages.md`](spec/03-messages.md) §5's UpdateFirmware example
  paired `9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08` — the digest of the
  four-byte ASCII string `test` — with a signature over
  `conformance/test-firmware/test-firmware.bin`, whose digest is `928de7ea…`. Signature and
  checksum described different bytes, in the one example a firmware author copies verbatim, and it
  would have failed verification with nothing on screen to suggest why. It is also why the repo's
  own signer was **not idempotent at `v0.12.0`**: `tools/sign-inline-md.mjs --all` on a pristine
  tag rewrites exactly this line, so `verify-all-signatures.sh`'s idempotency gate was red on the
  tag. All five sites in `TC-DM-004` already carried the correct digest.
- **`2017 OFFLINE_RECEIPT_MISMATCH`** now names its third cross-check target — the §3 stored-vs-
  arriving receipt comparison — in both its Description and its `details.field` list. Measured
  against the [§1.4](spec/07-errors.md) 500-character bound: 406.

### Fixed — the conformance corpus

Four cases were repaired ahead of the rest because they are the ones an implementer builds
against and gets burned by.

- **`TC-OFF-001` taught an unauthenticated BLE handshake and a key schedule two protocol versions
  stale.** It instructed `IKM: LTK ‖ appNonce ‖ stationNonce`, salt `OSPP_BLE_SESSION_V1`, and
  `Info: deviceId ‖ stationId` — every line wrong. [`06-security.md` §6.5](spec/06-security.md)
  has the BLE Long-Term Key **explicitly not used**, being unobtainable by a mobile app, and gives
  `es ‖ ee ‖ appNonce ‖ stationNonce`, salt `_V2`, and `Info: LP(deviceId) ‖ LP(transcriptHash)`.
  The Hello fixture omitted `appEphemeralPubKey` and the Challenge omitted `stationCert` and
  `stationEphemeralPubKey` — all REQUIRED, and without the certificate there is nothing
  authenticating the station, so the case walked an app through handing an OfflinePass to whatever
  answered the advertisement. Fixtures are now the `full` scenario of
  `conformance/test-vectors/crypto/ble-handshake-keyschedule.json` — **the corpus's own golden
  vector, which contradicted the case it exists to support** — so a harness can check its
  derivation against `sessionKeyHex` rather than only against its own arithmetic. Verifying
  `stationCert` before transmitting any credential is now a step and a failure criterion.
  AuthResponse no longer returns a `sessionId` it has never carried.
- **`TC-SEC-001` computed the HMAC over the payload rather than the envelope.**
  [§5.3](spec/06-security.md) makes the input the whole envelope with `mac` removed, canonicalised
  per §4.8; its worked example canonicalises `action`, `messageId`, `messageType`,
  `protocolVersion`, `source`, `timestamp` **and** `payload`. MACing the payload alone leaves
  `messageId` and `timestamp` unbound, which is what makes the MAC a replay defence at all. This
  is the only case that pins MAC computation and it is mandatory at Standard level. Its
  preconditions also posited a pre-provisioned shared secret, which OSPP does not have — §5.2
  generates the key per boot and delivers it on the BootNotification RESPONSE.
- **`TC-DM-002` omitted the REQUIRED `signature` from three UpdateFirmware payloads and expected
  `Accepted`**, while `update-firmware-request-missing-signature.json` is byte-identical to that
  shape and declared MUST-reject. [§4.6](spec/06-security.md): *"SHA-256 checksum verification
  alone is **NOT** sufficient"* — and the checksum arrives in the same message as the URL, so
  whoever chooses one chooses both. `5112 FIRMWARE_SIGNATURE_INVALID` is now a failure criterion.
- **`programNumber` was missing from 13 StartService payloads across 9 files** — every
  session-lifecycle case in the corpus taught a request a conforming station must reject with
  `3017 PROGRAM_NOT_DECLARED`.

Also: `TC-OFF-002`'s checks 6 and 7 required `maxUses: 0` and `maxTotalCredits: 0`, both
`"minimum": 1` and therefore unsignable — they now exhaust a real pass; and its `counter` is
documented as the envelope field it is. `TC-TX-007`'s three session IDs violated
`^sess_[a-f0-9]{8,}$`. `TC-CORE-002` cited §5.4 for ConnectionLost (§5.5) and `TC-SEC-004` cited
§5.5 for SecurityEvent (§5.6) — an un-cascaded §5.x renumbering — and `TC-SEC-004` counted 10
event types where the enum has 12. `TC-TX-006` and `TC-OFF-004` applied §4.1's 60 s timeout to
reconciliation, where the profile sets **30 s** and says so in a note. `TC-OFF-003` Part C now
answers a retransmission `Duplicate` and gains the different-data collision, which nothing tested.
`test-vectors/README` §3 stated the naming convention as `{action}.{variant}.json` against its own
§1 and all 316 files. `sample-report.json` claimed `complianceLevel: "Core"`, which is a profile,
not one of Development/Standard/Extended/Complete.

### Left open — recorded, not fixed

- **`deviceId` on the TransactionEvent fixtures of `TC-OFF-003`, `TC-OFF-004` and `TC-TX-006` is
  deadlocked.** `transaction-event-request.schema.json` is closed and has no `deviceId`, but
  `tools/sign-inline-md.mjs` reads `deviceId` off the outer object to build the signed receipt body
  and throws without it. Removing it breaks the signer; keeping it leaves the fixture
  schema-invalid. The repair is a tooling change plus a re-sign of every inline receipt.
- **36 further non-conforming StartService payloads under `spec/` and `examples/`**, outside the
  conformance corpus and several inside signed fences.
- **The reference server does not implement the §3 comparison.** It deduplicates on `offlineTxId`
  alone and answers `Duplicate` for every repeat, so the different-data case is currently
  indistinguishable from a retransmission. That is an implementation gap this release creates
  work for, and it is named here rather than left to be discovered.

---

## [0.12.0] — 2026-08-11

> **MINOR, and the reason is the whole release: dropping one qualifier makes 457 obligations bind
> that did not bind before.** Nothing moves on the wire. No message shape, field, enum or schema
> constraint changes, and `protocolVersion` stays **`0.3.0`**. What changes is which sentences in
> `spec/` are requirements at all. That is **conformance-breaking without being wire-breaking**: an
> implementation that was conformant against `v0.11.2` can be non-conformant against `v0.12.0`
> without altering a byte, because the set of requirements it is measured against is larger.
>
> **Why this cannot be a PATCH.** [VERSIONING.md](VERSIONING.md) defines PATCH as a
> **non-normative** fix; this changes which text is normative, for 457 sentences. Its pre-1.0
> policy also requires a break to be documented here under `### Changed` rather than left to be
> discovered — so it is, first, and in the words that make the consequence plain.
>
> **The arc behind it.** A full-corpus sweep for the class *"prose claims enforcement that nothing
> performs"* found **58 instances and closed 28**. The RFC 2119 qualifier was the largest single
> one: a house convention that unbound a third of the specification's own obligations. Three
> sub-shapes of the class turned out to be mechanically checkable and are now gates under `tools/`
> with a workflow that runs them. The rest are not checkable, and the sweep says so rather than
> implying a coverage it does not have.

### Changed

- **The RFC 2119 bold-only qualifier is dropped: 457 obligations that did not bind now bind.**
  [`spec/00-introduction.md` §3.1](spec/00-introduction.md#31-normative-keywords) bound the BCP 14
  keywords "when, and only when, they appear in **BOLD UPPERCASE**", and
  [`spec/README.md`](spec/README.md) carried a copy of the same sentence. Both now read **ALL
  CAPITALS**, which is the condition [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — the
  authority the sentence itself cites — actually states. The qualifier had added a condition on
  *weight* that no cited authority imposes.

  **What that does to a reader's obligations, stated so it cannot be missed.** **496 of the 1391**
  capitalised MUST/SHALL keywords in `spec/` are unbolded, and under the old sentence every one of
  them was **non-binding**. Categorised: **457 are genuine obligations**; 30 are requirement-level
  table cells where MUST is the column *value*; 7 sit in revision-history rows; 2 are backticked
  references to a rule. The 457 are not marginal text — they include the entire MQTT topic-ACL
  apparatus ([Chapter 02 §6](spec/02-transport.md#6-access-control-acl)), all ten OfflinePass
  validation checks ([Chapter 06 §6.1.1](spec/06-security.md)), and most of
  [Chapter 08](spec/08-configuration.md): *"The station MUST present a valid X.509 client
  certificate"*, *"every MQTT message MUST carry an HMAC-SHA256"*. **From this release those are
  requirements.** A reader upgrading from `v0.11.2` should re-read the chapters above against a
  larger obligation set, not a changed one — nothing was added, and nothing on the wire moved;
  what was already written now binds.

  **Why the qualifier was dropped rather than the 457 sentences bolded.** RFC 8174 conditions on
  "all capitals" and says nothing about weight. No other document in the repo adopted the stricter
  form: eighteen chapters and profiles restate the RFC 2119 paragraph and **all eighteen** give the
  plain BCP 14 wording — only §3.1 and its `spec/README.md` copy carried it, so
  [Chapter 08](spec/08-configuration.md) was asserting an interpretation §3.1 denied it. §3.1 also
  contradicted itself: the paragraph directly below it identifies the non-binding case as
  *"lowercase or mixed case"* and never as unbolded capitals, leaving an uppercase unbolded MUST in
  a gap between two sentences of one section. And nothing in the 496 was deliberately soft, so
  bolding 457 sentences across 18 files would have been an enormous diff with no semantic change
  that still left §3.1 contradicting itself.

  **Bold remains house style** ([CONTRIBUTING.md](CONTRIBUTING.md)). An unbolded keyword is now a
  **style defect**, not a keyword that fails to bind, and `tools/check-normative-bold.py` ratchets
  it — baseline **464**, after excluding code spans, fenced blocks and level-label cells.

- **`maxCreditsPerTx` is a decline threshold, not a cap, and the example that taught otherwise is
  corrected.** Three normative sites say the same thing — station-side
  [`offline-pass.md` §4](spec/profiles/offline/offline-pass.md) check #8, server-side
  [`authorize-offline-pass.md` §5](spec/profiles/offline/authorize-offline-pass.md) check #8, and
  [`06-security.md` §6.1.1](spec/06-security.md) check #8 — all of them **MUST NOT exceed**,
  rejecting with `4004 OFFLINE_PER_TX_EXCEEDED`, which
  [Chapter 07](spec/07-errors.md) records as **not recoverable**.
  [`examples/flows/04-full-offline-session.md`](examples/flows/04-full-offline-session.md) taught
  the opposite in five places, including an arithmetic formula
  (`min(requestedDurationSeconds, maxCreditsPerTx / priceCreditsPerMinute * 60)`) and a written
  rationale ending *"gracefully displays the adjusted duration rather than rejecting the request"*.
  An example with a formula and a justification is what an implementer copies.

  **The decision is reject.** A limit is a decline threshold; silently serving less than was asked
  for charges a user for something they did not agree to. The specification already assumed as
  much in a place capping would have broken:
  [`06-security.md` §7.4](spec/06-security.md) scores `creditsCharged` > `maxCreditsPerTx` as a
  fraud signal at reconcile, which is only coherent if an over-limit transaction is **refused**
  rather than trimmed.

  **Shaping the request is the client's job, and the pass gives it what it needs.** The
  OfflinePass carries `offlineAllowance.maxCreditsPerTx` as a plaintext signed field
  ([`offline-pass.schema.json`](schemas/common/offline-pass.schema.json), required, `minimum: 1`),
  held by the app in secure storage from issuance — so a client can read the limit and size its
  offer to fit **before** it asks the station for anything. That is where capping belongs, and the
  walkthrough now shows it there: the app bounds its duration picker at the limit, check #8 passes
  on the merits, and every downstream figure in the flow is unchanged. The one clamp the offline
  path does permit is `requestedDurationSeconds` against a **server-authorized** `durationSeconds`
  on Partial A / Partial B ([`ble-session.md` §1](spec/profiles/offline/ble-session.md),
  processing rule 2); Full Offline has no server-authorized value to clamp against.

### Added

- **Three drift gates under `tools/`, and a workflow that calls them.** Each targets a sub-shape of
  *"prose asserts a property and nothing establishes it"* where both sides of the claim are
  structured enough to compare mechanically. They are **ratchets, not allowlists**: every finding
  prints on every run, the count may fall but must not rise, and each was **RED-tested** — watched
  to fail on an injected defect and to recover when it was removed.

  - `check-config-defaults.py` — restated configuration defaults against the
    [Chapter 08](spec/08-configuration.md) registry. Two forms are recognised, prose proximity and
    a markdown *Default* column; the 40-character proximity window is load-bearing, since matching
    any key to any number on the line cross-pairs the rows that name two keys at once.
  - `check-schema-conditionals.py` — a schema `description` asserting a conditional no `if`/`then`
    or `dependentRequired` backs. Baseline **3**: the certificate-response family, whose fix is a
    schema tightening that changes validation outcomes for existing implementations and is
    therefore an open decision, recorded rather than silently allowlisted. Cross-artefact claims
    are deliberately **not** flagged — JSON Schema structurally cannot compare against an X.509
    certificate or another message, so those descriptions are correct as written.
  - `check-normative-bold.py` — a capitalised keyword outside a `**…**` span. Baseline **464**.

  [`.github/workflows/check-drift.yml`](.github/workflows/check-drift.yml) runs all three. A gate
  in `tools/` that no job calls is the same defect one level up, and the workflow exists to be that
  caller; its path filters are deliberately broad, because one of the config-default findings was a
  conformance case citing Chapter 08 while contradicting it.

  **Two further checks were built, measured and discarded at roughly zero precision** — recorded in
  the scripts' docstrings so they are not rebuilt. "A claim naming an identifier absent from every
  normative artefact" flagged 18 sites of which approximately none were the defect (11 were error
  codes, flagged only because **no schema enumerates error codes anywhere**). "A key name with a
  bare number near it" flagged 12, of which **none** were real — nine were conformance cases
  deliberately setting non-default values for faster execution, and a gate that fails those is a
  gate somebody disables.

### Fixed

- **Twenty-eight instances of prose claiming enforcement nothing performs**, across the chapters,
  the profiles, the configuration registry and the conformance corpus — including a
  [Chapter 08](spec/08-configuration.md) claim that would have broken every offline receipt, a
  profile chapter instructing the station to return a credential, and three restated defaults
  caught by the gate the sweep itself suggested writing.
- **`guides/implementors-guide.md` — the worst-affected artefact, and nothing validates it.** Not
  one inline payload, field list, enum or constant in the guide is checked by any job, and its
  dangerous content is pseudocode: unvalidatable by construction. The divergences repaired here
  include two of operational grade — a buffering section naming the two MAY-discard message types
  as the ones to buffer while omitting TransactionEvent, SessionEnded and SecurityEvent (SessionEnded
  being the sole billing source when no StopService answered), and a provisioning section describing
  two on-device key pairs where the flow needs three, which leaves BLE dead after a successful
  provisioning and is a truck roll to recover. **The only durable defence is a citation**, so every
  repair replaced a restatement with a pointer.
- **`ble-session.md` §1 was cited as §2** in the guide's anti-capping note. §2 is *Monitoring
  Progress (FFF5)* and carries no clamp rule; the clamp is processing rule 2 of §1, *Starting a
  Service*. A pointer that lands in the wrong section is the failure mode the citations were
  introduced to prevent.
- **CI that was green while checking nothing** — a markdown-lint job linting an empty file set, a
  schema job that could not install, two schemas no job compiled, and a `$ref` that aborted the
  validation run at 73 of 86.
- **Conformance device-management cases** teaching a shape the schema forbids, and nine omitting
  the capability that gates the profile.
- **The `v0.11.1` firmware signature rule shipped with no changelog entry**, and now has one.

### The document version, and a site that had no gate

The document version moves to **0.12.0** across every site that carries it, per
[VERSIONING.md](VERSIONING.md). `tools/verify-protocol.sh` Category 18 reports **29 sites**
agreeing with `spec/README.md`'s front-matter, plus the newest `## [X.Y.Z]` changelog heading and
the [Document History](spec/00-introduction.md#6-document-history) row.

**29, not the 28 recorded at `0.11.2`, because one live version claim was outside the gate.**
`guides/implementors-guide.md` states the version **twice** — the header and the closing line —
and only the header was in the sites array, which is how that closing line had previously gone
stale unnoticed while sitting under a correct header. It is now checked, RED-tested both ways (a
wrong value fails; a missing line fails), and recorded in VERSIONING.md's site table. The same
table's enumeration is corrected from *8* to *9* numbered chapters, which is what its own total of
22 headers has always required.

### SDK follow-up (report only — nothing done here)

Both SDKs are at **0.13.0** pinning `.spec-ref = v0.11.1`. Between `v0.11.1` and `v0.12.0` the only
files under `schemas/` to change are three `description` strings — in
`change-configuration-response`, `get-configuration-request` and `get-configuration-response`. No
`type`, `enum`, `required`, `pattern`, bound or `$ref` moves anywhere, so **nothing either SDK
vendors changes meaning**, and neither needs a release on account of this tag. A re-pin to
`v0.12.0` would require re-vendoring those three files byte-for-byte to satisfy each SDK's
byte-identical gate — tidying, not work, and safe to fold into whichever release they cut next.

### Left open — recorded, not fixed

- **The conformance corpus needs its own arc.** It is where an implementer is actually burned, and
  it carries roughly ten cases with stale or contradicting shapes. It is deliberately out of scope
  here: the fixes are behavioural rather than editorial, and several change what a conforming
  implementation is required to pass.
- **`allowedServiceTypes` is a signed pass field that no check reads.** Three validation gates, 34
  checks in total, and none takes a `serviceId` except the per-transaction cost check. The exact
  inverse of `KNOWN-ISSUES.md` B-2, which is a check with no field.
- **The certificate-response family's `errorText` conditional** — the standing baseline of
  `check-schema-conditionals.py`. Enforcing it is a schema tightening that changes validation
  outcomes for deployed implementations, and belongs with a decision about ship order.

---

## [0.11.2] — 2026-08-07

> **Arc 7 — the twelve defects, taken back to the spec and verified before being acted on.**
> **Eleven of the twelve had already been closed, and the twelfth had been closed on the SDK
> side.** The list was written against v0.11.0 by an implementation building on it; arc 6 and
> the v0.11.1 release answered nearly all of it. What this arc found was not in the list: the
> **repair for the headline defect was itself defective**, and it had taken two other cells with
> it.
>
> **The document version moves — to `0.11.2` — and this entry corrects its own draft, which
> said it would not.** The wire `protocolVersion` stays at **`0.3.0`**: nothing here changes a
> message shape, an enum, a field, or a schema under `schemas/`, and every change is to
> registry prose, a count, a citation, the document version itself, or repo tooling. That is
> precisely what [VERSIONING.md](VERSIONING.md) calls a **PATCH**, and a PATCH moves the
> document version like any other release. The draft of this entry said *"No version moves"*
> and the v0.11.1 entry said the same — which is how two consecutive releases shipped with
> `0.11.0` in every chapter header, and how a reader holding `v0.11.1` had no way to tell it
> from `v0.11.0`. See *The document version had not moved in two releases* below.

### Fixed

- **spec:** **three *Recommended Action* cells exceeded the wire bound that [§1.4](spec/07-errors.md#14-provenance-of-errordescription-and-recommendedaction)
  says every cell **MUST** fit** — `4020` at **1245**, `3017` at **551**, `3018` at **534**
  characters against Appendix C's `recommendedAction` `maxLength` of **500**. §1.4's rule is not
  advisory: the value is per-**code**, so a cell that cannot be emitted as written has no
  canonical form at all — each emitter shortens it independently and two conforming servers then
  carry different values for one `errorCode`, which the per-code equality rule forbids.

  `4020` is the one that matters, and it is worth naming how it got there. Arc 6 rewrote that
  cell **correctly** — the old text told an integrator to correct `bayCount`, a field v0.11.0
  deleted, and to compare two counts that are equal in exactly the swapped-bay case the set
  comparison exists to catch. The rewrite fixed the advice and, at 1245 characters, made it
  unemittable. A right answer in a form no conforming server can put on the wire.

  All three shortened in **full** form, cutting only rationale and restatement and preserving
  every distinct corrective action: `4020` **1245 → 494**, `3018` **534 → 474**, `3017`
  **551 → 460**. The rationale was not deleted — it moved to the *Description* column, which
  §1.4 states has no wire bound and is where rationale belongs. The RFC 2119 keywords moved
  with it and were **strengthened** rather than lost: `4020`'s "counts alone … MUST NOT be the
  only thing carried" is now `Servers **MUST** carry details.declaredBayNumbers and
  details.registeredBayNumbers, and **MUST NOT** carry counts as the only content of details`,
  and `3017`/`3018` gain an explicit **MUST NOT** on the two actions their cells only ever
  discouraged in bold. All **118** cells were then measured: none exceeds the bound; the longest
  is `4020` at 494.

- **spec:** **`4020`'s Description still described the deleted field's comparison.** It read
  "it depends only on the token and **one declared integer**" — true of `bayCount`, false of the
  `bayNumber` **set** the code has compared since v0.11.0. The same sentence arc 6 rewrote the
  action for. Now "the declared bay set".

- **spec:** **the registry counts went stale again, in the same way and for the same reason.**
  Arc 6 registered `3019` and `6008` without re-deriving the totals — the failure `d1a72f3` made
  when it registered `4020`, recorded in this file and repeated anyway. §1.1's `3000–3999` cell
  read **19** against an actual **20**, and the stated total read **116** against an actual
  **118**; the table did not even sum to its own total (117). `README.md` carried **116** in
  three places and `guides/implementors-guide.md` in a fourth. Re-derived by parsing the
  registry: per-range **15/20/20/20/34/9**, total **118**, matching Appendix A's independent 118
  rows, set-identical to §3, no duplicates. `ROADMAP.md`'s "102 error codes" is **not** touched —
  it sits under *v0.1.0 (Delivered)* and is history, as are the revision-history rows.

- **spec:** **the LWT signing exemption was restated a fifth time, uncited and with an incomplete
  reason.** [`02-transport.md`](spec/02-transport.md) gave it as "configured at CONNECT time
  before any session key is established" — which is the *first-connection* half of the reason.
  [§5.6](spec/06-security.md#56-message-signing-classification) is the single source and gives
  the whole of it: on a **reconnect** the station holds the previous key while the server has
  rotated to the new one, so a will-MAC is not merely absent, it is guaranteed **stale on
  arrival**. Now cites §5.6 and states both halves. The three-way disagreement reported as
  defect 7 is gone; this was the one site still speaking for itself.

### Changed

- **tools:** `verify-protocol.sh` now **measures** every §3 *Recommended Action* cell against
  Appendix C's `recommendedAction` `maxLength` and fails on any that exceeds it. Three separate
  passes have now shipped an over-length cell — `1007`/`5004`/`5017` in one, `3017`/`3018` in
  another, `4020` in a third — while §1.4 asserted the rule and nothing checked it. The bound is
  **read from Appendix C**, not hardcoded, so raising it there raises it here; the row splitter
  is backtick-aware, so a cell may hold a pipe inside a code span. Proved non-vacuous by pushing
  `4020` to 574 characters and confirming the run goes to 15 failures, then back to 14 on
  restore. Checks go **3351 → 3470** (+118, one per registry cell, +1 for the new §5.6 citation);
  the failure set is unchanged at **14**, entry for entry.

  **What it measures, stated so the number is readable.** Lengths are of the **raw Markdown**
  cell — backticks and `**` included — which is the conservative reading and the same one the
  0.11.0 passes used; the Markdown-stripped text runs 12–14 characters shorter per cell. It
  checks the **cell**, which is what §1.4 binds. It does not and cannot check what an emitter
  actually puts on the wire: a server free to translate and shorten (§1.4) can still emit an
  over-length value, and no repo-side check reaches that.

### The document version had not moved in two releases

- **Document version: `0.11.0` → `0.11.2`,** cascaded to **28 sites across 26 files** (29
  literal occurrences — the README badge carries the number twice, in its alt text and in the
  shields.io URL). `v0.11.1` was tagged without moving it and this arc's own draft proposed to
  do the same, so a reader holding either release saw **`0.11.0`** in all 22 chapter and profile
  headers and could not tell which of the three they had. `0.11.1` is skipped rather than
  reused: that tag is cut and its contents are what they are.

  **The number identifies the release, and the repo had already decided this — nowhere in
  writing.** [VERSIONING.md](VERSIONING.md) defines **PATCH** as *clarification of spec text*,
  which is what both this release and `v0.11.1` are; [`02-transport.md` §2.2](spec/02-transport.md)
  defines the header as the *specification-document version*, which versions "this
  specification's prose"; and the decisive precedent is **`v0.6.2`**, a release with *no spec
  content change at all* — schemas byte-identical to `v0.6.1` — whose Document History row
  records its entire deliverable as a "version-header cascade". A number that a release with no
  content still moves is a release identifier, not a contract generation. It cannot be defended
  as deliberately stable.

  The omission has a history, and it is the history of an unwritten rule: skipped at `v0.3.0`,
  `v0.5.1`, `v0.5.2`, `v0.8.1` and `v0.11.1`, and twice repaired afterwards as a defect, in
  those words. The `0.4.0` entry: *"The v0.3.0 bump did not cascade these; this release catches
  up."* The `0.11.0` entry: *"Four headers had never been cascaded past `0.5.0` or `0.9.0`."*
  Each repair fixed the instance and left the rule unwritten, so the next release skipped it
  again.

  The `v0.11.1` skip is the one that did damage. `KNOWN-ISSUES.md` had to print
  *"Specification-document version: 0.11.0 (release tag `v0.11.1`)"* — naming both numbers to
  stay truthful about a document that was not. That parenthetical was the defect's receipt; the
  two numbers now agree.

- **[VERSIONING.md](VERSIONING.md) gains *The document version, and the sites that carry it*.**
  The rule was practice with nothing behind it, which is why dissent was never needed to skip
  it. It now states that the document version **equals the release tag and moves on every
  release including PATCH**, gives `v0.6.2` as the reason it cannot be read as a stable
  generation, enumerates all 28 sites in a table — including the two a naive sweep misses, the
  italicised §2.2 example and the doubled README badge — and names the documents that
  deliberately carry **no** version header, so their absence is not read as a gap.

- **`tools/verify-protocol.sh` gains Category 18, *Document Version Consistency*.** Same reason
  the cell bound became a check in this release: a rule broken five times is not enforced by
  being written more firmly. It takes `spec/README.md`'s front-matter as the authority, requires
  every site to agree, requires the newest `## [X.Y.Z]` changelog heading to agree with both,
  and requires a Document History row to exist for it — the row `v0.10.0` and `v0.11.1` were
  each tagged without. Occurrence **counts** are asserted too, so the doubled README badge
  cannot half-cascade and pass.

  **What it does not cover.** It cannot check the git tag, which does not exist until the
  release is cut. The releaser still has to make the tag match — but that is now one step
  against twenty-eight, and the twenty-eight are checked.

- **`spec/00-introduction.md` §6 Document History gains rows for `0.11.1` and `0.11.2`.**
  `v0.11.1` was tagged without one, exactly as `v0.10.0` had been before `0.11.0` added it
  retrospectively.

### Not changed, and why

- **Nine of the eleven were already closed**, most of them by arc 6, and are re-verified here
  against HEAD rather than taken on the changelog's word: `Unknown` off the wire (defect 1 — the
  schema carries the generator directive, and it is addressed to a code generator, which is what
  the SDKs needed); the bay FSM stated twice (2 — one canonical table, and its "20 Station + 6
  Server = 26" was re-derived by expanding the multi-source rows rather than trusted);
  `SessionEndReason` (4 — `OperatorStopped`); the missing server-side binding code (5 — `3019`);
  reset `Hard`/`Soft` (6 — the schema has `force` only, and the surviving prose is the note
  explaining the removal); signing exemptions (7 — see *Fixed* for the residue); the reconnection
  rule living in an example (8 — `bootReason: Reconnect` with MUSTs in `boot-notification.md`
  §5.2); and both required-field rollouts (9 and 10 — `VERSIONING.md`, *Adding a REQUIRED field,
  and which side moves first*). Defect 11 was decided in arc 6 as `6008 COMMAND_PRE_EMPTED`.

- **Defect 12 does not reproduce.** `ospp-sdk-php` carries the set-based `4020` text at **497**
  characters, with a comment recording it as a deliberate §1.4-permitted shortening rather than
  drift; `sdk-ts` carries no `recommendedAction` at all. Neither says `bayCount`. Nothing is owed
  to them for this defect — but see *SDK follow-up* below, because the shortening's own
  justification has now expired.

- **`4020`'s name is still `BAY_COUNT_MISMATCH`**, which names a count for a comparison that has
  been a set comparison since v0.11.0. Not renamed: `errorText` is on the wire, so this is a wire
  change and not one of the twelve, and the obvious replacement collides with `3018
  TOPOLOGY_MISMATCH`. Recorded here rather than done quietly.

- **`4020` mandates two `details` members with no Appendix C `if`/`then` block.** Deliberate and
  unchanged: those blocks exist to make a **discriminator** a validation error ([Appendix C, *On
  the conditional blocks*](spec/07-errors.md)), and `4020` is explicitly non-branching — "no
  consumed-token branch and no discriminator". The note's claim that exactly five entries branch
  today remains true.

### SDK follow-up (report only — nothing done here)

`ospp-sdk-php`'s `4020` cell is now **longer than the spec's** (497 against 494) and its comment
gives as its reason that "the registry's full text is longer" and that syncing byte-for-byte
"would make every naive emitter produce a non-conforming payload". Both were true against arc 6's
1245-character cell. Neither is true now. The canonical cell fits, so the SDK can carry it
verbatim; at minimum the comment must stop asserting a condition that no longer holds. The two
texts agree on every corrective action, so §1.4 is satisfied either way and this is tidying, not
a defect.

### New — recorded, not built

- **BLE StationInfo still carries `bayCount`**, a scalar that cannot name a bay now that
  non-dense bay sets are legal, and that no clause reconciles with the `bays[]` the app actually
  selects from on FFF2. The same defect the MQTT side deleted in v0.11.0; BLE was not swept then.
  Filed in [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md) — it is a **BLE wire change** with its own ship
  order, and none of the twelve touches the BLE surface.

---

## [0.11.1] — 2026-08-07

> **Arc 6 — the eleven defects the reference implementation hit while building against
> v0.11.0.** Every one was found by an implementation doing the thing the spec describes,
> most of them on a live wire rather than by reading.
>
> **No version moves here.** The document version is unchanged, and the wire
> `protocolVersion` stays at **`0.3.0`** — not because nothing touched the wire (one thing
> did, below) but because `0.3.0` has never shipped, and the 0.11.0 entry already commits
> to folding every later break into that same unreleased value rather than minting another.

### Added

- **schema + spec:** `SessionEndReason` gains `OperatorStopped`, and `04-flows.md` gains
  **The operator-disable policy** it belongs to — named in four places and defined in none.
  A forced Reset had no reason to report a settled session with, and the nearest member,
  `Deauthorized`, mandates billing at **zero** — so an implementation reading both clauses
  correctly delivers a wash and charges nothing for it. This is the one change that
  **touches the wire**.
- **spec:** `3019 SERVICE_NOT_BOUND` — the server holds no service→program binding and
  cannot form a conforming StartService. The mirror of `3017`, which is the *station*
  refusing an ordinal it was sent. Server-originated toward the requesting client and
  **MUST NOT** be transmitted to a station. `409 Conflict`.
- **spec:** `6008 COMMAND_PRE_EMPTED` — the server stopped a command locally that it could
  see the station would refuse. Carries `details.wouldBe` (the code the station would have
  answered), so an operator can tell a refusal that reached the station from one that never
  left the server: the second can be a **stale** server view, repaired by reconciling the
  server rather than by touching the station. A server MUST NOT pre-empt a Reset carrying
  `force: true`. **Not `6005`**, which the registry already spends on "the user already has
  an active session" — a per-user constraint on starting, nothing to do with a station's
  reset. Reusing it would have collapsed the very distinction this code exists to draw.
- **spec:** `VERSIONING.md` — *Adding a REQUIRED field, and which side moves first*. The
  receiver must accept the new form before any sender emits it, and which side is the
  receiver depends on which side **originates** the message. `programs` and `programNumber`
  are the two instances that had no rollout story.

### Changed

- **spec:** `4020 BAY_COUNT_MISMATCH`'s recommendedAction no longer directs an integrator
  to compare two counts. It performs a **set** comparison, and a swapped bay leaves both
  counts equal — the exact case the set comparison exists to catch. It now names the two
  sets, what their difference means in each direction, and which side being wrong decides
  who repairs it.
- **spec:** `05-state-machines.md` — a **generated type** must not gain `Unknown` back. The
  chapter and the schema both already forbade transmitting it; neither was addressed to a
  code generator, and both reference SDKs kept it on their wire enum.
- **spec:** `start-service.md` gains rule 5a — the server MUST NOT dispatch StartService
  without a binding, and MUST NOT substitute a default ordinal, guess from the catalog, or
  omit the field.

### Fixed

- **spec:** the operator-disable policy moved a bay `Occupied` → `Available`, an edge the
  bay machine does not have. It passes through `Finishing`, as every ending wash does.
- **conformance:** `TC-SEC-007` carried a spliced sentence from the v0.11.0 partial edit —
  "validates the request's `bays` against with `4020`".

### Firmware signature verification — landed between the releases, recorded late

> **Recorded 2026-08-10, and not backdated.** This is not Arc 6 work. It was written on its
> own branch on **2026-08-06 06:48** — eight hours after `v0.11.0` was tagged (2026-08-05
> 22:33) and a day before `v0.11.1` (2026-08-07 07:56) — and reached `main` inside the Arc 6
> merge only because the Arc 6 branch was cut from this one. `v0.11.1` is the release that
> shipped it, so it belongs here. It is deliberately **not** filed under `[0.11.0]`: that
> entry was already dated and tagged before this was written, and moving it there would
> credit the work to a release that could not have carried it. No version moves for this
> entry — no schema and no wire value changes.

- **spec:** `update-firmware.md` §5 gains **rule 4** — the station **MUST** verify the
  `signature` before installation, and **MUST NOT** install a binary whose signature it has
  not verified. Verification is ECDSA P-256 against the pre-provisioned Firmware Signing
  Certificate, or its CA (`06-security.md` §4.6). On failure — or when the station holds no
  such certificate to verify against — it **MUST NOT** write the inactive partition, **MUST**
  send a FirmwareStatusNotification with `Failed` status, and **MUST** report
  `5112 FIRMWARE_SIGNATURE_INVALID` via a `FirmwareIntegrityFailure` SecurityEvent [MSG-012].
  The former rules 4–7 renumber to 5–8.

  **What was missing is narrower than it sounds, and worse.** `signature` was already
  **required** — in the §4 field table and in `update-firmware-request.schema.json`'s
  `required` array — `5112` had been in the registry since `v0.1.0-draft.1`, and
  `07-errors.md` already listed it among the codes UpdateFirmware [MSG-016] may answer with.
  Every piece was in place except the sentence that produces it: §5's processing rules
  covered the checksum and stopped there. A conforming station could receive a signature on
  every update, never check it, and never emit the code the registry says it emits.

- **spec:** `05-state-machines.md` — the firmware FSM gains the transition needed to express
  that. **Signature invalid** is a `Verifying → Failed` row distinct from checksum mismatch;
  `Downloaded → Verifying` and `Verifying → Verified` now name both checks; and `Verified`
  means the checksum matched **and** the signature verified. A binary that has only matched
  its checksum is explicitly not in that state — a checksum proves integrity, never
  authenticity, because whoever controls `firmwareUrl` controls the bytes it is computed over
  and ships the expected value in the same message.

- **spec:** `firmware-status.md` — `Downloaded` now means the checksum **and** the signature
  verified. A station **MUST NOT** report `Downloaded` on the strength of the checksum alone.

- **`5112` travels on the SecurityEvent, not on the FirmwareStatusNotification.** That
  message carries no `errorCode` field and is `additionalProperties: false`, so there is no
  conforming way to put the code on it, and its `errorText` stays free prose as §6 requires.
  The SecurityEvent is the only channel on which the code can be reported.

- **docs:** [ADR-002](adr/ADR-002-ble-handshake-security-architecture.md) gains an editorial
  note. Its Noise-rejection paragraph named three implementations the handshake had to be
  byte-identical across — the app (TS), the PHP station simulator, and the firmware (MCU).
  The PHP simulator has been retired, so the sentence named a normative third implementation
  that no longer exists; it is corrected to the two that do. The PHP entry stays in the
  library survey above it, because that records what was evaluated **at the time of the
  decision** and the rejection rested partly on it. The decision itself is unchanged.

### What an SDK release must carry

> **Superseded 2026-08-07 — measured, not assumed.** Both SDKs are now at **0.13.0** and
> both pin `.spec-ref: v0.11.1`, so the version figures below are stale. `4020` in
> particular is **done**: `ospp-sdk-php` carries the set-based text with a comment
> recording it as a §1.4-permitted shortening, and `sdk-ts` carries no
> `recommendedAction` at all. The claim below that "both SDKs still say `correct the
> declared bayCount`" was never true of `sdk-ts` and is no longer true of either — see
> *Arc 7* in `[Unreleased]`. The rest of the table stands and is unverified here.

Both SDKs are at **0.12.0**, both pin `.spec-ref: v0.11.0`, and both **vendor the
schemas** rather than fetching them — so nothing here reaches an implementation
until they are regenerated and published. Held deliberately; the sequencing is
Gabi's call. What it needs, measured:

| Change | `ospp-sdk-php` | `sdk-ts` |
|---|---|---|
| `SessionEndReason::OPERATOR_STOPPED` | enum + vendored `session-ended-event.schema.json` | same |
| `OsppErrorCode` `SERVICE_NOT_BOUND = 3019` | enum + severity/recoverable/action metadata | same |
| `OsppErrorCode` `COMMAND_PRE_EMPTED = 6008` | enum + metadata | same |
| `4020` recommendedAction text | `src/Enums/OsppErrorCode.php:387` | `src/enums/OsppErrorCode.ts:332` |
| vendored schema refresh | `schemas/` | `src/schemas/` |

**The `4020` text is the twelfth defect and it is not new work — it is drift.** The
spec said `bays` from v0.11.0; both SDKs still say `correct the declared bayCount`,
naming a field the request no longer has. The text is **hand-written in both SDKs**,
not generated from the spec, which is why it drifted silently and will again.

Two consequences worth stating before sequencing:

- **`OperatorStopped` cannot be emitted until BOTH sides have it.** A station
  emitting it against a server on 0.12.0 has its SessionEnded rejected on schema
  validation — measured against the reference server: `/reason: The data should
  match one item from enum`. SessionEnded is the sole billing source when no
  StopService was issued, so the session goes **unbilled entirely**, which is worse
  than the mis-billing this fixes. Server before station, or both together.
- `3019` and `6008` are additive and server-originated: a station never receives
  either, so they carry no station-side ordering constraint.

**Generating the `4020` text from the spec: assessed, NOT contained, left.**

- It is a **PHP-only** problem. `sdk-ts` carries no `recommendedAction` at all, so
  there is nothing there to drift.
- The source is the last column of a hand-formatted markdown table whose cells
  contain `|` inside code spans. That needs a real parser, not a regex.
- `ospp-sdk-php` carries a deliberate **11 of ~117** codes. A generator has to encode
  which subset, and that list is itself hand-maintained — the drift relocates rather
  than disappears.
- The SDK vendors `schemas/` only, with no mechanism to read spec prose at build or
  test time. Either a generator or a cheaper drift-CHECK needs a new build-time
  dependency on the spec repo.

The cheaper option, if it is ever wanted, is the check rather than the generator: a
CI test asserting each `recommendedAction()` equals the spec cell at the pinned
`.spec-ref`. That still needs the spec-fetch mechanism, which is the actual missing
piece. Scoped here; not built.

### Not changed, and why

- **Defect 2** (bay FSM stated twice, 18 vs 23 transitions) does not reproduce: the machine
  is stated once, in `05-state-machines.md`, with 26 transitions and no competing table.
- **Defect 6** (reset `Hard`/`Soft`) was already resolved — `reset-request.schema.json` has
  `force` as its only property, and the prose that mentions the pair is the note explaining
  its removal.
- **Defect 7** (signing exemptions stated three times, inconsistently) does not reproduce:
  `06-security.md §5.6` is the single source and the other two sites cite it.
- **Defect 8** (the reconnection rule living only in an informative example) was already
  resolved, and better than reported — `boot-notification.md §5.2` adds a purpose-built
  `Reconnect` value with a MUST, and both SDKs carry it.
- **Defect 11** is now decided and written: a server **MAY** pre-empt a command the
  station would refuse, and answers **`6008 COMMAND_PRE_EMPTED`** with
  `details.wouldBe: 3016` when it does. `3016` stays the station's answer and means the
  command reached it. Not `6005`, which the registry already spends on an unrelated
  per-user constraint — see Added.

## [0.11.0] — 2026-08-05

> **Breaking on the wire, and the wire version moves with it: `protocolVersion` goes to
> `0.3.0`.** The document version does **not** move here — [`02-transport.md` §2.2](spec/02-transport.md)
> makes the two independent and this change respects that.
>
> **Complete.** All five arcs are in this entry — topology, wire/errors/reset, boot/signing, the
> bay state machine, and the reconcile-and-release pass that closed the counts and cross-references
> the first four left inconsistent. The wire version does **not** move again: `0.3.0` has never
> shipped, so every later break folds into the same unreleased value rather than minting another.
> Neither the bay-FSM arc nor the reconcile arc changes a message shape at all, so neither would
> have moved it in any case.
>
> **Ship order matters and is stated per decision.** The consolidated order is in
> *Breaking changes, and the order they must ship in* at the end of this entry.

### Changed (BREAKING — wire)

- **`protocolVersion` → `0.3.0`.** 209 occurrences of the old value were counted across 59
  files; 175 are `"protocolVersion"` value sites in 44 files and all moved, as did the
  normative `ProtocolVersion` configuration default in both places `08-configuration.md`
  states it. `bleProtocolVersion` is a **different** version on a different transport and is
  untouched (17 sites). Revision-history and delivered-release tables keep the old value —
  they are history.

  **Deployment order: server configuration must accept `0.3.0` before any station emits it.**
  Measured: every station that has ever booted emits the *old* value, and both servers are
  configured for a value no station has ever emitted. Enforcement ahead of configuration
  rejects the entire connecting fleet.

- **`bayIds` and `bayCount` are deleted from the wire.** The station declares `bays[]`; the
  provisioning response returns `bays[]` pairing each `bayId` with its `bayNumber`. Nothing
  else. There is no compatibility window and no deprecation marker: this protocol is
  unreleased, and a window would have left two ways to express one thing — the defect class
  this arc exists to remove. A non-dense bay set (`{1, 3}`) is legal everywhere, and a server
  **MUST NOT** reject a declaration for being non-dense.

- **Reset: remote credential wipe leaves the wire.** `Hard`/`Soft` are gone. One reboot
  operation remains, carrying an optional `force`. Without it an active session is refused
  with `3016`; with it the session settles under the operator-disable policy — stopped,
  metered, reported as an operator-initiated stop — and only then does the station reboot.

  OSPP keeps no bootstrap credential. TR-069 and LwM2M permit a remote wipe and both retain
  one across it so the device can be re-enrolled; OCPP offers no remote factory reset at all.
  OSPP retained nothing, so `Hard` was a supported command whose success left a station
  unreachable by every channel it had — which `reset.md` admitted in its own text. Factory
  reset is now **physical**, and `reset.md` §5.2 keeps the normative scope of what such a
  reset must preserve.

  Provenance, because it explains the defect: `Hard`/`Soft` came from OCPP 1.6, where the
  pair means abrupt versus graceful **restart** and touches no credential. The wipe meaning
  was attached later, in a **conformance case** rather than in a design decision.

- **`start-service-response` echoes the refused `programNumber`**, required whenever `status`
  is `Rejected`. Matter requires the refused path in every `CommandStatus`; MDB's Remote Vend
  `SELECTION DENIED` carries the item number it refused. Modbus omits it, and that omission
  is the documented reason Modbus debugging is painful. Applied to the BLE response too.

- **`3015 PAYLOAD_INVALID` is narrowed.** Its text covered "unknown enum values" and therefore
  already reached an undeclared ordinal. It now covers only values that are wrong *in
  themselves*; well-formed identifiers that refer to nothing are **reference** failures and
  each identifier kind has its own code. The recoveries differ — a bad value is fixed by
  correcting the message, a dangling reference by correcting server-side state — and one code
  covering both left an operator unable to tell which.

- **StatusNotification reports the bay's `programs[]`, not its `services[]` (BREAKING — station
  and server).** Each entry is `{programNumber, available}`, one per program the bay declared at
  provisioning, and the set **MUST** equal that declaration — an unusable program is reported
  present-but-unavailable, never omitted.

  A program is a physical operation the hardware performs and its ordinal is a firmware constant;
  a service is a commercial offer the **server** mints and pushes in the catalog. A station cannot
  originate knowledge of a service, only echo one back, and immediately after its first boot it
  has been told none — so the old shape required at least one `svc_`-prefixed identifier in the
  very message [CORE-004](spec/profiles/core/README.md) requires at that exact moment. A
  conforming first boot was impossible. This is the ownership boundary, not a rename.

  40 payload sites across 22 files moved. 18 sites in 11 files that look identical were **not**
  touched: they are BLE AvailableServices, where the station is echoing the catalog it was pushed
  to an app that has no other way to reach it offline. `03-messages.md` §7.2 now states the
  distinction, because it is the first question a reader has.

- **Version negotiation is exact match (BREAKING — server, and the deployment is the risk).** The
  station declares one version; the server holds a **set**; membership decides. `1007` and its
  `supportedVersions` array are unchanged, so nothing new goes on the wire.

  The "same MAJOR is compatible" rule is deleted from **nine** sites. It contradicted the
  versioning policy directly above it — MAJOR is `0` for every version OSPP has shipped, so it
  classified `0.1.0` and `0.10.0` as compatible while the pre-1.0 section licences breaking
  changes between `0.x` minors. The contradiction cost money: a `0.4.0` station accepted by a
  `0.3.0` server delivers a full session and emits `SessionEnded` with a `reason` the older schema
  rejects — and `SessionEnded` is the sole billing source when no StopService was issued. Session
  delivered, never billed, on a pairing the rule told the server to accept.

  **Deployment order, and it is not optional: configuration first, then enforcement.** Widening
  the server's set is backward compatible; enforcing exact match is not. Measured on the live
  fleet before this change: **every station that has ever booted emits the old wire value, and
  both servers are configured for a value no station has ever emitted.** Only MAJOR-gating keeps
  that pairing alive. Enforcing ahead of configuration rejects the entire connecting fleet. The
  spec change is safe; shipping it in the wrong order is a total outage.

- **Everything on the wire is signed (BREAKING — both peers).** 44 of 47 message types carry a
  MAC. Three are exempt and they are structural, not judged: BootNotification REQUEST precedes the
  key, BootNotification RESPONSE carries it, and the LWT is published by the broker after the
  station is gone — and on a reconnect the station holds key N-1 while the server has rotated to
  key N, so a will-MAC is guaranteed stale on arrival.

  The withdrawn criterion was "zero financial impact", and it is rewritten rather than deleted
  because it failed twice on its own terms and the record is worth keeping. StatusNotification
  gates whether a paid service may start — a forged `Faulted` denies revenue, a forged `Available`
  induces a start that fails into `3009`, which the registry answers with "refund 100%". Heartbeat
  is worse: forged heartbeats keep a dead station looking alive, [CORE-007](spec/profiles/core/README.md)'s
  timeout never fires, and the server keeps selling sessions on hardware that is not there. A
  third, GetDiagnostics, was wrong in a direction the criterion could not see at all — it uploads
  a configuration dump and session history to a URL the command supplies.

  **13 message types are newly signed** — the 16 that were exempt in the old default, minus the
  3 that are structurally exempt and always were. Cost: **53 bytes** per message and nothing
  else — no `keyId`, no `alg`, no nonce — about **16 KB per hour** per station. On constrained hardware the bytes are not the cost; canonical
  re-serialization is, and it is heavier **inbound**, the direction verification runs. That path
  was already mandatory for most message types, so this adds no new firmware code path.

  **Deployment order: stations sign before servers enforce.** A server that starts requiring MACs
  before the fleet emits them rejects everything, and the rejections are logged as MAC failures
  naming the stations.

- **`MessageSigningMode` is `Dynamic` → `Static`, default `Critical` → `All` (BREAKING —
  station).** The mode is bound to the session key, which is issued at boot; a mid-session change
  leaves one peer signing and the other not, and with both directions failing closed the station
  goes silent both ways. `Static` makes the change and the new key land on the same event.

- **`sessionKey` is REQUIRED on every `Accepted` and every `Pending` boot response (BREAKING —
  server).** It was conditional on `MessageSigningMode`, which is station configuration and therefore unreachable
  from this message's schema — so the rule could never be enforced and would have stayed prose
  indefinitely. A third `allOf` branch now enforces it, mirroring the two that exist for
  `Rejected` and `Pending`. Under `None` the key is issued and unused; the cost is 44 base64
  characters once per connection.

  **`Pending` is included, and leaving it out would have been fatal.** A `Pending` station answers
  server commands; every command is signed; both the sending and receiving paths fail closed on a
  missing key. Withhold the key on `Pending` and the server may not send, the station may not
  accept, and it may not answer — the repair channel the `Pending` window exists for would have
  been closed by the signing rules landed in the same arc. `Rejected` needs no key: it answers
  nothing. This also makes §5.9's rule literally true — the key is scoped to the MQTT session, and
  a `Pending` station has one.

  **The station's side of it was undefined and is now defined.** An `Accepted` or `Pending` with no
  `sessionKey` is **malformed**: log `1005`, do not enter normal operation, retry per
  [CORE-011](spec/profiles/core/README.md). Explicitly **not** a downgrade to unsigned — a station
  that proceeds keyless can sign nothing, has everything it sends rejected, and is named as the
  suspect in the resulting MAC-failure events.

- **`3002 BAY_NOT_READY` gains a cause.** A station in a restricted state refuses StartService and
  ReserveBay with it. The registry entry now says so, and tells an operator that no
  StatusNotification at all means the boot needs attention, not the bay.

- **Maximum bays per controller: 255 → 64**, and a new maximum of **32 programs per bay**. Stated
  in every site that carries a bound: `01-architecture.md` §4.2, `provisioning-request`,
  `provisioning-response`, `bay-topology.schema.json`, `status-notification` and
  `boot-notification-request` — the last of which carried **none** before this arc, because it
  had no `bays[]` to bound. A real installation has 4–8 bays. At 255 bays the boot re-declaration
  exceeded the 64 KB MQTT Maximum Packet Size of `02-transport.md` §1.2 at roughly 4 programs per
  bay; at 64×32 it is under 8 KB.

- **`4020 BAY_COUNT_MISMATCH` compares topology, not a count.** The declared `bayNumber` set
  **MUST** equal the registered set **as a set** — `{1,3}` against a registered `{1,2}` is a
  mismatch though both have two bays. The name is now the only thing about it that mentions a
  count.

### Changed (BREAKING — TLS server identity, no wire change)

- **The station MUST verify the server certificate's identity, not only its chain**
  ([`06-security.md` §2.1](spec/06-security.md)). Normative over
  [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525): match the reference identity against
  `subjectAltName` — `dNSName` for a hostname, `iPAddress` for an IP literal — **MUST NOT** fall
  back to Subject CN, and **refuse on mismatch**. Binds **both** the MQTT leg and the
  pre-credential HTTPS provisioning call.

  No normative clause required this before. Chain validation does not imply it and, on the
  embedded stacks these stations use, does not perform it: mbedTLS and wolfSSL require the
  expected name to be set explicitly and the handshake succeeds if it is omitted. A station that
  verified the chain but not the name accepted **any** certificate from **any** publicly-trusted
  CA for **any** domain — which reduced §2.1's system-trust-store fallback to no authentication
  at all. It matters most on the HTTPS leg, which carries the provisioning token and runs
  *before* the station holds any credential of its own.

  **Breaking for conformance claims; no wire change.** Measured as satisfiable: both deployed
  environments advertise hostnames rather than IP literals, and both hostnames are `dNSName` SANs
  on the certificate actually presented on 8883.

### Changed (BREAKING — bay state machine)

This one is text, schema and diagrams only: no message field
changes shape, and `bay-status.schema.json` is untouched. It is breaking for **implementations**,
because the set of transitions each side must accept moves in both directions and the two SDKs
shipped different sets.

- **`Unavailable → Faulted` is legal.** It was listed in `status-notification.md` §5 and absent
  from the chapter, the chapter's diagram, `state-machine-bay.mmd`, and the copy of that diagram
  in `diagrams/README.md`. A bay taken out of service can still develop a fault, and a technician
  working on it is the most likely person to find one; forbidding the transition does not prevent
  the fault, it forbids the report of it. `ospp-sdk-php` already has it (it followed the profile);
  `sdk-ts` pins it **false** in a test (it followed the chapter) and must change.

  `set-maintenance-mode.md` carried the mirror-image defect and it was never recorded: it said the
  bay "MUST transition **from `Available`**" into maintenance, where the canonical table permits
  `Available` **and `Faulted`**. A station built from that profile could not be told to stop
  offering the one bay that was broken — which is the usual reason to send the command.

- **One canonical transition table: [`05-state-machines.md` §2.3](spec/05-state-machines.md#23-transition-table).**
  It was stated in full in **five** places — the chapter's diagram and its table,
  `status-notification.md` §5, `state-machine-bay.mmd`, and a second copy of that diagram inside
  `diagrams/README.md` — disagreeing on seven edges. Every other site now references it:
  `status-notification.md` §5, `03-messages.md` §5.2, `01-architecture.md` §2.2, `04-flows.md`
  Appendix C, `implementors-guide.md` §2.6 and its checklist, `diagrams/README.md` §4, and seven
  conformance cases. Sites keep local detail — `previousStatus` rules, fault fields, per-flow
  paths, which refusal applies to which source state — and state no transitions.

- **§2.3 gains an `Effected by` column, and this is the root-cause fix.** The table merged two
  different objects: the bay a station operates and the bay a server believes in. A station never
  moves a bay to `Unknown` — that is the server giving up on hearing from it — yet the six
  `→ Unknown` rows sat in one undifferentiated list with `Available → Occupied`. Each SDK read the
  merge the other way and implemented half of it. **20 `Station` rows, 6 `Server` rows, 26 in
  all.** A station implements the 20 and **MUST NOT** implement the 6; a server implements all 26.

- **`Unknown` has five exits, not three — `Occupied` and `Finishing` are added.** §3.5 rule 2
  requires a station that reboots mid-session to resume the session, and the reboot it describes
  is a watchdog, a power cycle or a crash: a commanded Reset is refused with `3016` or settles
  first, and a firmware update is gated by §7.4, but an uncommanded reboot has no gate. On the
  next boot the bay is physically `Occupied` and owes a post-boot report (CORE-004). The three
  determinate-idle exits gave that station no truthful report: `Available` frees a bay running a
  paid session, `Faulted` is a lie, silence breaches CORE-004.

- **BREAKING (server behaviour): an invalid transition is accepted as authoritative, recorded so
  an operator can retrieve it, and reconciled against any session it contradicts. The server
  MUST NOT Reset the station over one.** Four statements said four things — reject (chapter
  preamble), log and MAY Reset (§2.5), reject (`status-notification.md` §5 preamble), accept
  (`status-notification.md` §5 rule 1, twenty-three lines below the one it contradicts). §2.5 is
  now the only one.

  The station is the authority on its own hardware, the same allocation §1.5 already makes for
  topology. This matches where mature protocols put the rule: OCPP 1.6's connector transition
  matrix lives in *Operations Initiated by Charge Point* and governs what a Charge Point **MAY**
  send; the Central System's entire stated duty on receipt is to acknowledge, and
  `StatusNotification.conf` **defines no fields**, so the response cannot carry a rejection even
  in principle. OCPP 2.0.1 fills its Status Notification use case's own *Error handling* field in
  as **"n/a"**. The OCA's own compliance tool tolerates reversed StatusNotification ordering and
  routes unexpected ones to a human rather than failing the run.

  Two clauses came out of checking the decision rather than assuming it, and without them the rule
  would have been decoration. **The record must be durable and operator-retrievable** — in the
  reference server the warning goes to a file inside a container whose log directory is not a
  volume and whose stdout it never reaches, no metric distinguishes a valid transition from an
  invalid one, no alert can fire on it and no audit row records it. **And accepting the state is
  not the end of it** — `Occupied → Available` with a live paid session frees the bay into the
  availability cache while the session keeps billing, because nothing in the reference server
  reacts to a bay status change except the cache, SSE and a counter. The server must reconcile and
  settle, as it already does for a fault.

  Reset is forbidden as a response. It was a `MAY`. Reset is now a reboot that preserves everything
  persisted, so it repairs no model disagreement — it reboots working hardware, and with `force`
  ends a paying customer's session, over a report that may well be true.

- **`Occupied → Available` does not exist, and §7.2 assumed it did.** Its `Completed` and `Failed`
  rows both had the bay returning straight to `Available`; three session rows reach a terminal
  state directly from `Active`. Every exit from `Occupied` is to `Finishing` or `Faulted` — the
  wind-down is physical and happens whatever ended the session. The `Failed` row also ignored
  connection loss, where the bay is `Unknown` server-side.

- **A restricted station `Rejects` every TriggerMessage except `BootNotification`, and applies
  SetMaintenanceMode without reporting it.** §1.4 listed TriggerMessage among the repair commands a
  `Pending` station must answer while the row above forbade every EVENT — and TriggerMessage exists
  to produce one. `BootNotification` is the exception and the useful one: it ends the restriction
  now instead of after `retryInterval`. §1.4 also now states which bay states are reachable while
  restricted, which nothing did.

### Added

- **`3017 PROGRAM_NOT_DECLARED`** — the `programNumber` was never declared for that bay. The
  station **fails closed**: reject, echo the ordinal, activate nothing. It **MUST NOT**
  substitute a neighbouring ordinal or clamp to the highest declared one; MDB permits exactly
  that clamp for vending selections, and it is worse than refusing because it charges for one
  thing and delivers another. Accept-and-do-nothing is a customer who paid and got no wash.

- **`3018 TOPOLOGY_MISMATCH`** — the boot declaration disagrees with the provisioned topology,
  in either direction. In **3xxx**, not the transport range: it is a disagreement about
  hardware, not a transport failure. Carried on a **`Pending`** response, never `Rejected`,
  with a `details` object naming what was expected and what arrived. `Pending` keeps the
  command channel open so an operator can repair it; `Rejected` would close the only channel
  through which it could be repaired.

  3xxx is dense with no gaps, so allocation is dense and gaps are never back-filled. Registry
  totals move **114 → 116** in all five places that state one.

- **`programNumber` now travels in all three places the decision names.** The previous arc
  landed only the declarations, so the ordinal could not be echoed because it was never sent.
  It now also travels in **StartService** — so the station acts on a field rather than
  indexing its catalog by `serviceId`, and so a service minted since the last catalog push
  still starts — and in the **catalog**, where `service-item` gains `bindings[]` of
  `{bayNumber, programNumber}`. The catalog leg is what lets the station act **offline**,
  where no StartService exists to carry the ordinal.

- **`bootReason: "RemoteReset"`** — so the server can tell a return it asked for from a
  spontaneous one. `ManualReset` (a human at the station) and `ScheduledReset` (the station's
  own timer) remain; neither ever denoted a wipe.

- **A station-level state machine** ([`05-state-machines.md` §1](spec/05-state-machines.md)). The
  chapter defined machines for bays, sessions, reservations, BLE and firmware and none for the
  station, so `Pending`, `Rejected`, `Accepted` and not-provisioned had no formal home and
  `3018 TOPOLOGY_MISMATCH` depended on a state that existed nowhere structurally. Six states —
  `NotProvisioned`, `Booting`, `Pending`, `Rejected`, `Operational`, `Disconnected` — placed at
  **§1** as the outermost machine, with everything else renumbering under it. §1 is where
  `boot-notification-request.schema.json` was already pointing. `Disconnected` earns its place
  because it is a distinct behaviour set (sessions run on the local timer, BLE stays up, events
  buffer) and is the station-scope twin of a bay's `Unknown`.

- **`Pending` and `Rejected` are defined as RESTRICTED states** ([§1.4](spec/05-state-machines.md)),
  resolving a three-way contradiction. `boot-notification.md` rule 5 said the station **MAY**
  operate normally; rule 3, eleven lines above, defines "normal operation" as the post-`Accepted`
  state; rule 2 and [CORE-002](spec/profiles/core/README.md) forbade it from sending anything at
  all. Under one reading a `Pending` station activates hardware on a StartService and delivers an
  unpaid wash.

  Resolved: a restricted station **answers commands** (`Pending` only — `Rejected` refuses them),
  **sends nothing unsolicited**, and **serves no customer** — StartService and ReserveBay are
  refused with `3002 BAY_NOT_READY`, on every transport. A session already running continues and
  settles. `Pending` keeps the command channel open because that channel is how an operator
  repairs whatever is holding the boot. This is OCPP 2.0.1's *B02 Cold Boot — Pending* exactly.

  The distinction is carried by `messageType`, not by action: `Event` and any `Request` other
  than BootNotification are forbidden; `Response` is permitted, because a station does not
  originate one. CORE-002 now says that rather than banning "any other messages", which banned
  the answer too.

- **What a restricted station does with a session it may not report** ([§1.4](spec/05-state-machines.md#14-the-restricted-states)),
  found by composing the restricted-state rules against the money path and **not** by either arc
  on its own. §1.4 requires a station that enters `Pending` or `Rejected` with a session running
  to "continue it, meter it, and settle it" — and every message carrying any of those three verbs
  is one the table three lines above forbids: MeterValues and SessionEnded are EVENTs,
  TransactionEvent is a REQUEST the station originates, and the section states explicitly that the
  prohibition has no carve-out. A conforming station had three moves and all three were wrong:
  emit and break the unsolicited rule, stay silent and strand the money for a service already
  delivered, or abandon the session and break the MUST.

  Resolved the way the bay half already was — reachable, unreported, resolved in one step at
  `Operational`. The station runs the session on its local timer, meters it locally, and
  **buffers** what it owes under [§6.5](spec/01-architecture.md#65-offline-message-buffering),
  flushing on the boot that is accepted. The pointer to `02-transport.md` §4.4 was part of the
  trap: that section describes a station that reconnects and is *accepted*, so a station held at
  `Pending` never reaches its flush step.

  `SessionEnded` is added to §6.5's **MUST buffer** category, which listed only TransactionEvent
  and SecurityEvent. It is the sole billing source for a session that ended with no StopService to
  answer and it is not regenerable, so the omission would have licensed discarding the only record
  of a delivered service — on the offline path as much as this one. `02-transport.md` §5.1 already
  classified it as never-expiring and required its payload be retained; §6.5 now agrees.

- **First-boot topology is defined** ([`boot-notification.md` §6.1](spec/profiles/core/boot-notification.md)):
  the same rule as any other boot. Provisioning creates the bay records and boot never does, so
  the two declarations come from one commissioning act and a first boot **matches**; when they
  disagree that is `3018` on a `Pending` response, with **no exemption**. An exemption would make
  the provisioning declaration decorative and would blind the one boot where a commissioning error
  is cheapest to catch. The server **MUST NOT** create, extend or trim bay records from a
  BootNotification, on any boot.

- **`details` on the BootNotification RESPONSE**, with `expected` and `declared`. Both
  `boot-notification.md` §6 and `07-errors.md` **required** the server to send this object and the
  closed response schema had no such property — a rule no conforming server could obey. Typed
  against a new [`bay-topology.schema.json`](schemas/common/bay-topology.schema.json), which the
  request's `bays[]` items now share: one definition instead of two copies.

- **`bootReason: "Reconnect"`** — the eighth value and the only one that does not name a boot. A
  station that re-dialled after a TCP reset had to pick a value it knew to be false, and the
  server could not tell whether the firmware's volatile state survived — the question that decides
  whether a live session is kept or terminated. `uptimeSeconds` is now normatively the
  cross-check: it spans the outage on a `Reconnect`, and a `PowerOn` carrying a large uptime is
  detectably lying.

  **A deliberate divergence from OCPP, recorded so it is not mistaken for an oversight.** OCPP-J
  (2.0.1 Part 4 §5.4) says a station **SHOULD NOT** send a BootNotification on reconnect, because
  the connection already re-establishes identity. OSPP requires one, and the requirement follows
  from the session-key rule: the key is scoped to the MQTT session and arrives only in the boot
  response, so a station that skipped the boot would reconnect keyless. One extra round trip per
  reconnect, accepted for a stated reason. OCPP has no equivalent value because it has no such
  message.

- **Program-level fault reporting** — optional `programs[].errorCode` and `programs[].errorText`
  on an entry reported `available: false`. Without them an operator sees a dead program and cannot
  tell a blown fuse from a failed sensor: two faults, one truck roll, the wrong tools. OPTIONAL,
  and it does **not** extend [CORE-012](spec/profiles/core/README.md), which still mandates codes
  only when the **bay** goes `Faulted`. New **CORE-013** states the present-but-unavailable rule.

- **[§5.8](spec/06-security.md) — the broker is inside the trust boundary**, stated explicitly with
  the structural reason: the session key is delivered in the boot response, which passes through
  the broker in plaintext to it, so a broker that reads that message can forge in **both**
  directions. [RFC 6733 §13.3](https://www.rfc-editor.org/rfc/rfc6733#section-13.3) gives the test
  for tolerating such an intermediary — compromising it must imply a high probability of
  compromising the endpoints — and ours passes it.

  What the MAC still buys, honestly: a **partial** defence against an ACL regression (publish-only
  — a regression that also grants *subscribe* lets the attacker read the victim's key off the
  victim's own topic and forge perfectly), and a cheap integrity check. What it does **not** buy:
  **non-repudiation**. HMAC is symmetric and the server holds the key it verifies with. The
  specification did not previously claim otherwise — every non-repudiation sentence in the corpus
  is about the asymmetric ECDSA receipt, where it is correct — so this is a fence against the
  claim being added later, not a deletion.

- **[§5.9](spec/06-security.md) — the session key lives exactly as long as the MQTT session.** No
  independent TTL, no rotation mechanism; any reconnect produces a boot, which issues a new key.
  A TTL on a session-scoped key is a fuse that can only fire early, on a station that is online
  and working.

  The divergence from TLS, SSH and IPsec is recorded with the reason none of their drivers apply:
  no confidentiality role, so no AEAD usage bounds; no sequence number, so no counter to exhaust,
  and the birthday bound at OSPP volumes is on the order of 10⁶ years. The remaining driver is the
  compromise window, which §5.8 answers. The residual is stated as a trade: a station that never
  disconnects holds one key indefinitely, and a deployment that wants that bounded already has
  `TriggerMessage(BootNotification)`.

- **`TC-SEC-009` — Station Refuses a Certificate Whose Name Does Not Match.** Every assertion in
  it is a **refusal**. A case asserting that a connection *succeeds* proves nothing: a harness
  built on a general-purpose TLS library name-checks by default and passes whether or not the
  firmware ever asked for the check. Covers both legs, wildcard scope, the `dNSName`-vs-IP-literal
  confusion, CN fallback, and that the provisioning token does not leave the station. This is the
  companion case `TC-SEC-008` said should exist, and `TC-SEC-008` now links it.

- **[§5.7](spec/06-security.md) — both directions fail closed.** Verification already did; signing
  did not. A sender holding no key **MUST refuse to send**, **MUST NOT** publish unsigned, and
  **MUST NOT** silently drop without a record. Written the other way the two are the same
  condition read from two ends and only one acts on it — the message is generated, published,
  delivered, rejected, and logged as a security event naming the peer that could not have
  prevented it. This is also the more important half: a server that publishes an unsigned
  `StartService` has produced exactly the message the MAC exists to stop, and has taught the fleet
  to accept it.

### Fixed

- **`03-messages.md` said the service catalog arrives "via BootNotification response."** That
  schema is closed and declares no field that could carry it — the only candidate,
  `configuration`, is a string-to-string configuration map. Corrected to what actually happens:
  the catalog arrives **only** through `UpdateServiceCatalog`, and a freshly provisioned station
  has none until the server pushes one, which is why the server **SHOULD** push promptly after
  accepting a boot.

- **`06-security.md` §4.2 still named the system trust store as the sole fallback**, two hundred
  lines from the §2.1 clause that qualifies it. Marked as a summary of §2.1, which is
  authoritative, and it now states what the fallback does **not** relax.

- **`serviceId` is the catalog service, not "the service program."** Corrected in all three prose
  sites plus the glossary (`start-service-request.schema.json`,
  `profiles/transaction/start-service.md`, `profiles/transaction/transaction-event.md`).

- **`TC-SEC-007` Part D converged.** It named an array of `{bayId, bayNumber}` objects a
  conformance **FAILURE** for the provisioning response, while `ble/available-services.schema.json`
  already carried exactly that shape — two surfaces contradicting each other at HEAD. Part D now
  asserts the explicit pairing, that order is **not** significant, and adds the non-dense case the
  positional scheme could not express.

- **The bay transition *count* was a restatement of the table, and six sites kept the old one.**
  §2.3 has held twenty `Station` rows since `Unknown` gained its two extra exits; `03-messages.md`,
  `status-notification.md` §5, §2.5 itself and the implementor's guide in three places still said
  eighteen, and the guide put the total at twenty-four. Every one of them linked to §2.3 while
  contradicting its size. Re-derived mechanically — **20 `Station`, 6 `Server`, 26**, from 18
  markdown rows — which the counts paragraph, both diagrams and the diagram README already had
  right. Two further sites still gave `Unknown` the three idle exits in prose. The rule against
  restating the table now reaches its numbers.

- **Five chapter-05 references still named the machines by their pre-insertion numbers.** The
  station machine became §1 and everything renumbered under it; two pointers in the 0.10.0 entry
  and three in the 0.4.0/0.4.1 entries were written before that and now landed on a real section
  about a different machine — §1.5 for *Invalid Transitions*, §1.2 for the bay's seven states,
  §2.5 and §2.3 for the session FSM. Each now carries an anchor, so the next renumber breaks them
  loudly.

- **Fourteen cross-references elsewhere resolved to the wrong section or to none**, and eleven
  statements of the repo's own size were wrong — the schema count appeared as 85 in one place and
  67 in two others. Both swept mechanically and reconciled; the detail is in the two commits.

- **Four example-corpus defects where the example contradicted the rule it illustrates.** Schema
  validation passes on all 52 payload files, so these are all schema-legal and rule-violating,
  which is the only kind a validator cannot find:

  - **Eight StatusNotification examples asserted an `X → X` transition** — `previousStatus` equal
    to `status`, in three flow narratives. Six are post-boot reports and one is a program-only
    report, both of which §5 rule 2 requires to **omit** the field; writing `status` into it
    asserts a transition §2.3 does not contain and [§2.5](spec/05-state-machines.md#25-invalid-transitions)
    therefore makes invalid. Removed, not corrected — absence is the rule.
  - **Seven StartService REQUEST examples omitted `programNumber`**, which this release makes
    Required. One of them is `06-security.md` §5.3's canonical-form worked example, whose sorted
    output moved with it.
  - **`TC-CORE-001` Part C could not pass.** Its step 24 sends a `Pending` boot response with no
    `sessionKey` — malformed under the rule this release introduces — and steps 26–31 then require
    the station to verify and answer three signed commands. The conformance case for the rule
    contradicted the rule.
  - **`03-messages.md` §7.13 still taught the base64-digest bug that `06-security.md` §6.2 Note 1
    exists to forbid**: `digest = SHA-256(receipt.data)` over the base64 form. Note 1 has said
    since v0.4.2 that the digest is over the **canonical bytes** and that implementations
    **MUST NOT** hash the base64; the repair never reached the message catalogue. Firmware built
    from chapter 03 signs a digest no server will verify.

- **This entry had lost an arc.** The commit that deleted the deprecation machinery rewrote
  `[Unreleased]` and took the topology arc's own entries with it — including a **normative
  BREAKING** requirement, the station's server-certificate identity check, and the conformance
  case pinning it. Six entries restored from the commit that wrote them, each re-verified against
  HEAD rather than trusted: the identity MUST, `TC-SEC-009`, the 64-bay/32-program bounds,
  `4020`'s set comparison, the `serviceId` correction, `TC-SEC-007` Part D, and the two prose
  fixes. The `### Deprecated` section was **not** restored — that machinery was deleted
  deliberately and `bayIds`/`bayCount` no longer exist to deprecate.

### Removed

- The deprecation convention introduced in the previous session, in full — `"deprecated"`
  annotations, description prefixes, prose admonitions, the `### Deprecated` section, and
  every `0.11.0`/`0.12.0` removal reference.
- The rule requiring a server to reject a non-dense bay set. It existed only because `bayIds`
  was retained and could not encode one.
- `reset-request-invalid-enum.json` and `reset-request-missing-required.json` — the enum and
  the required member they tested no longer exist. A new `reset-request-additional-properties`
  vector pins `{"type": "Hard"}` as **rejected**, so the old value is actively refused rather
  than merely absent.

- **`Critical` from the `MessageSigningMode` enum**, and the 47-row per-message classification
  table with it. With everything signed the middle value selected nothing. Removed rather than
  deprecated: the protocol is unreleased, and removing it breaks nothing that can be named — the
  one real consumer of a non-default mode is a test harness, which uses `None`, and `None` stays
  for exactly that reason. The default moves to `All` in the same change; leaving it on a removed
  value would have left every station reading a default that no longer exists.

- **The "same MAJOR is compatible" rule**, from all nine sites, and **"limited mode"** with it —
  a phrase that appeared only in those sites and named no state. It was always the `Rejected`
  restricted state.

- **The lowercase spellings of the signing-mode enum.** PascalCase wins: it is already the
  repo-wide convention for every enumeration, and both SDKs are strict about it — lowercase only
  ever worked through a normalizer. Five sites, across `07-errors.md` (which also had the *key*
  name in camelCase), `03-messages.md`, `profiles/core/boot-notification.md` and `TC-SEC-001`.

- **`CONTRIBUTING.md`'s unqualified "deprecate before removing".** It is a post-1.0 process rule —
  it protects an installed base by trading correctness for continuity — and OSPP has no installed
  base. Left unqualified it caused real damage: an earlier session read it as unconditional and
  introduced a deprecation convention that a later one had to remove in full. Now scoped to
  1.0-onwards, with the pre-1.0 rule stated alongside it: remove the old form entirely, and pin
  it as **rejected** with a negative vector rather than leaving it merely absent.

### Breaking changes, and the order they must ship in

Merged across all five arcs; the fifth adds nothing to this table, because it changes no wire
form and no behaviour. The ordering rule is the same everywhere and it has one shape:
**a receiver must accept a new form before any sender emits it, and enforcement of a narrowed
rule must never ship ahead of the configuration that satisfies it.** Violating it does not
degrade the fleet, it disconnects it.

| # | Phase | What ships | Why it is here |
|--:|-------|-----------|----------------|
| 1 | **Measure** | Nothing ships. Establish what version the fleet actually emits, and what topology each station declares against what is provisioned | Exact-match negotiation is gated entirely on the first; the topology-mismatch `Pending` is gated on the second. Both are cheap to measure and unrecoverable to guess |
| 2 | **Server accepts, enforces nothing** | Widen the supported-version set to a genuine list including the value the fleet emits. Accept (do not require) `bays[]`, `programs[]`, the new `bootReason` values, `details`, and a `mac` on any message. Stop creating bay records from a boot | Every item is backward compatible. A station that has not moved is unaffected |
| 3 | **Server emits** | `sessionKey` on every `Accepted`; `supportedVersions` on every `1007`; `details` on every `3018` | Additive for the station: reading a new field breaks nothing |
| 4 | **Station emits** | `bays[]`, `programs[]`, `bootReason: "Reconnect"`, a `mac` on every message. Refuse to send when it holds no key | The server accepted all of these at phase 2. **The server still does not enforce** — it logs MAC results, it does not reject on them |
| 5 | **Server enforces** | Exact-version match; topology mismatch → `Pending` with `3018`; MAC required; refuse to send unsigned | Only now, and only after phase 4 has soaked. Each of these rejects a station that has not moved |
| 6 | **Narrow** | Reduce the supported-version set to one value; default `MessageSigningMode` to `All` on the station | Cleanup. Safe once the fleet is uniform |

**The bay-FSM arc slots into this table rather than extending it, and every item is early.** It
changes no message shape, so nothing in it gates on a station moving first:

| # | Phase | What ships |
|--:|-------|-----------|
| 2 | **Server accepts, enforces nothing** | Accept `Unavailable → Faulted`, `Unknown → Occupied` and `Unknown → Finishing`. Stop treating an unlisted transition as a reason to refuse a report. **Stop sending Reset on account of one** — this one is not additive to a station and is the only bay-FSM item that can end a customer's session if left in place |
| 2 | **Server accepts, enforces nothing** | Route the invalid-transition record to a durable, operator-retrievable surface, and make the session reconciliation fire on it. Both are server-only |
| 4 | **Station emits** | Report `Occupied`/`Finishing` post-boot where a session was resumed; accept `SetMaintenanceMode` from `Faulted`; `Reject` a TriggerMessage a restricted state forbids |

**Never do this early:** the two new `Unknown` exits **before** the server accepts them. A station
that reports `Occupied` post-boot to a server still enforcing the old three-exit table hands it a
transition it will refuse — and the bay it refuses is the one running a paid session.

**The SDKs are not symmetric here and the asymmetry is the whole cost.** `ospp-sdk-php`'s 18
transitions were already exactly the `Station` sub-table before this arc, so it needs only the two
new `Unknown` exits — its `Unavailable → Faulted` was right all along. `sdk-ts` needs the same two
**and** `Unavailable → Faulted`, and it must delete the test that pins that transition **false**.
Its six `→ Unknown` rows are correct for a server and wrong for a station, and nothing in either
SDK says which job the class is doing; the class is exported and never invoked, so no shipped code
depends on the current answer.

**Never do these early**, each for a named reason:

- **Exact-match enforcement before phase 1.** Measured before this arc: every station that has
  booted emits the old wire value and both servers are configured for a value no station has ever
  emitted. Only MAJOR-gating keeps that alive. Enforcing first is a 100% outage.
- **Topology rejection before phase 1.** A station whose provisioned record drifted goes to
  `Pending` and stops serving. That is the correct behaviour and it is still an outage if it
  happens to a fleet nobody has reconciled.
- **MAC enforcement before phase 4 has soaked.** Rejections are logged as MAC failures and the
  events name the *stations*, so the alarm points away from the change that caused it.
- **`MessageSigningMode` default flip before the station can sign.** Static means it takes effect
  at the next reboot, which is exactly when you want it — but only after the firmware can honour it.

### Document version

- **Document version: `0.10.0` → `0.11.0`.** MINOR, not MAJOR. [VERSIONING.md](VERSIONING.md)'s
  *Pre-1.0 Policy* states that during `0.x` development breaking changes **MAY** occur between
  minor versions, provided each release documents them under `### Changed` or `### Removed` — which
  this entry does. The repo's own precedent agrees: `0.8.1 → 0.9.0` carried three independent
  breaking bodies and `0.9.0 → 0.10.0` narrowed a wire enum, and both took a MINOR. MAJOR stays
  `0` and will move when 1.0 makes a compatibility promise worth breaking.
- **Wire `protocolVersion`: stays `0.3.0`.** It moved once inside this release and has never
  shipped, so the boot, signing and bay-FSM breaks fold into it rather than minting a second value
  no station has ever seen. Moving it twice before either value reaches a station would be
  ceremony, not information. Verified: 176 value sites, all `0.3.0`, and the `ProtocolVersion`
  configuration default agrees in both places `08-configuration.md` states it.
- The two are independent by [`02-transport.md` §2.2](spec/02-transport.md), which this respects.
- **26 document-version sites** were swept and moved: 22 chapter and profile headers, the
  `02-transport.md` §2.2 prose example, the README badge, `spec/README.md`'s front-matter **and**
  its table row (which disagreed with each other at `0.8.0` and `0.9.0`), and the implementor's
  guide (`0.7.0`). Four headers had never been cascaded past `0.5.0` or `0.9.0`. The Document
  History table gained a row for `0.11.0` **and** for `0.10.0`, which was tagged without one.

### Firmware cost — the aggregate across the arcs that change firmware

For one integrator, on constrained hardware, assuming a station built against the pre-arc spec.
The three wire-changing arcs are aggregated first, the bay-FSM arc's delta follows, and the
reconcile arc adds nothing: it changed no wire form, no schema and no behaviour.

**Fields to emit (new or reshaped):**

| Field | Where | Cost |
|-------|-------|------|
| `bays[]` — `{bayNumber, programNumbers[]}` | BootNotification, every boot | Reshape. Replaces `bayCount`/`bayIds`. Under 8 KB at the 64-bay/32-program maxima |
| `programs[]` — `{programNumber, available}` | StatusNotification, every report | Reshape. Replaces `services[]`. **The two messages a station sends most are both reshaped, and this is the bulk of the work** |
| `programs[].errorCode` / `errorText` | StatusNotification, optional | Two optional fields on an existing object |
| `bootReason: "Reconnect"` | BootNotification, on a reconnect | One enum value |
| `programNumber` | StartService handling | Read a field instead of indexing the catalog by `serviceId` |
| `mac` | Every message but three | 53 bytes. **No new code path** — canonicalization and HMAC-SHA256 were already mandatory for most message types; this runs the existing one more often |

**Fields to persist:** the bay/program topology, stably across boots (NVS, a compiled-in table,
or a hardware scan — the contract is stability, not the mechanism). Nothing else new. The session
key is RAM-only and **MUST NOT** be persisted.

**Checks to perform:** verify a MAC on every inbound message but three; verify the broker
certificate's chain; refuse to send when no key is held; refuse `Accepted` without a `sessionKey`;
reject an undeclared `programNumber` (`3017`) without substituting a neighbour.

**Behaviours to change:** answer commands while `Pending` and refuse customer service in it;
refuse commands while `Rejected`; keep `uptimeSeconds` consistent with `bootReason`; do not alter
the topology declaration to match what a server expected; treat the signing mode as taking effect
at reboot, not immediately.

**Code to delete:** the `Hard`/`Soft` reset branch and any credential-wipe path; the `bayCount`
scalar; the MAJOR-comparison in version handling; any session-key TTL or expiry timer; the
`Critical`-mode message classification table.

**What the bay-FSM arc adds, on top of the three above.** Very little, and one line of it is a
deletion:

| Item | Cost |
|---|---|
| Report `Occupied` or `Finishing` in the post-boot StatusNotification where a session was resumed | The **only real item.** A station that already implements §3.5 crash recovery has the state in hand and is currently reporting something false; it changes which value it writes. A station that does *not* persist session state across reboot never reaches this and owes nothing |
| Accept `SetMaintenanceMode` when the bay is `Faulted` | Widen one guard. Most implementations have this as a single `if (state == Available)` |
| Report a fault from `Unavailable` rather than suppressing it | Remove a guard. Likely already the natural behaviour |
| `Reject` a TriggerMessage while `Pending`, except `BootNotification` | One branch, in code the restricted-state work of the boot arc already touches |
| **Delete:** any station-side handling of a transition *into* `Unknown` | A station never performs one. Code that models it is modelling the server's job |

**Zero** new fields, zero schema changes, zero new persistence. The state count stays at seven and
`bay-status.schema.json` is untouched. A station's transition table grows from 18 entries to 20 —
if it stores one at all; most encode the rules as guards and never materialise a table.

**The single most important cost fact:** the expensive items are the two reshaped messages, and
the cheapest high-value item is signing — because the primitive is already there. The real
constraint on constrained hardware is not the MAC but the **canonical re-serialization**, which is
cheap outbound and heavier inbound, the direction verification runs.

### Verification (all five arcs)

- `tools/verify-schemas.py`: **316/316 PASS, 0 FAIL, 0 SKIP** after the bay-FSM arc (+2: a
  `previousStatus: "Unknown"` negative — the existing negative covered `status` only, and
  `previousStatus` is the wire-visible consequence of a station implementing a `Server` row — and a
  positive for a fault reported from `Unavailable`. Each was checked to fail, or pass, for exactly
  one reason: the negative trips `/previousStatus enum` and nothing else). Before that arc,
  **314/314** — up from 305 at the start of the
  boot/signing arc, +9 vectors: a `Pending`/`3018` response with `details`, a `Reconnect` boot, a
  program-level fault report, and six negatives pinning the new rules as actively refused —
  `services[]` on a StatusNotification, `Accepted` without `sessionKey`, `Pending` without
  `sessionKey`, a `Pending`/`3018` without `details`, a `Faulted` bay without an error code, and a
  program marked available that carries one anyway.
- All schemas compile: **86/86** (+1: `bay-topology.schema.json`). Unchanged by the bay-FSM arc,
  which touches no schema.
- Example payloads against their schemas (CI's `validate-examples` script): **51/51**.
- Every internal cross-reference resolves, checked with GitHub's own slug rules: 409 anchors,
  983 file links, 122 schema `$ref`s, 40 conformance citations. The only non-resolving targets are
  three placeholders inside style-guide prose — the illustrative `link`, `#section` and
  `NN-name.md` in `CONTRIBUTING.md` §Style and `00-introduction.md` — none of which is a real
  target.

  **This claim was previously made and was not true.** Slug-resolution is necessary and not
  sufficient: it cannot see a reference that resolves to a real section about something else, and
  the reconcile arc found fourteen of those plus six pointing at sections that do not exist at all.
  What is checked now is the pair — that the anchor resolves *and* that the heading it lands on is
  the subject the citing sentence names.
- `tools/verify-protocol.sh`: **14 failures, unchanged across the bay-FSM and reconcile arcs** —
  measured at `d4db331` before the first began, at `dfd76a8` before the second, and again after
  every commit in both. Down from the 15-failure branch baseline, +0 new. Its total check count
  rose 3317 → 3332 over the reconcile arc as the new anchors gave it more to check.
  The one that cleared is `boot-notification-response`'s `errorCode`/`errorText` being absent from
  `03-messages.md`, fixed as a side effect of adding the `details` row. The remaining 14 are all
  pre-existing and none is in this arc's scope: three `08-configuration.md` numeric-consistency
  checks, one config-key-reference check, four on the two BLE schemas that have no message heading
  and no vectors, and four Schema↔Spec field mismatches (`finalSeqNo`, `passCounter`/`authId`/
  `sessionId`, and two BLE payloads).

  The gate caught two real defects during this work that a passing example set did not: a forward
  reference to a section that did not exist yet, and an `additionalProperties` omission on a
  nested object. Its schema-field matcher earns its keep.
- Not run: `markdownlint` and `lychee` (CI-only, absent here); `verify-all-signatures.sh`
  (**mutates tracked files** — do not run it).

### Not in this revision

- **Asymmetric evidence on the online money path.** Scoped and left, with the scope recorded in
  [KNOWN-ISSUES](KNOWN-ISSUES.md). §5.8 establishes that the MAC provides no non-repudiation,
  while every station is already required to carry an ECDSA receipt-signing key that only the
  offline path reads. Extending it needs a third discriminated form in `receipt-data.schema.json`
  (both existing forms require `offlineTxId` and `txCounter`, which an online session has
  neither of), a first-ever conditional on `stop-service-response`, and a server-side retention
  obligation for superseded receipt-signing keys. That is a decision with its own blast radius,
  not a clause.

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
  never in the transition table, which [§2.5](spec/05-state-machines.md#25-invalid-transitions) makes invalid.

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
  [§2.2](spec/05-state-machines.md#22-states-7) so it is not re-litigated.

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

The bay FSM still has **seven** states and its transition table is untouched. This narrows the wire,
not the model. (The bay table was §1.3 when this was written; the station machine was inserted ahead
of it afterwards and it is now [§2.3](spec/05-state-machines.md#23-transition-table).)

Found and **recorded rather than fixed** — see [KNOWN-ISSUES.md](KNOWN-ISSUES.md). *(Fixed later, in
the bay-FSM arc; see the [0.11.0](#0110--2026-08-05) entry above. The count below is low — the machine was stated in
full in five places, not two.)* The bay FSM is
specified twice and the two copies disagree, on `Unavailable → Faulted`, on whether anything
transitions *into* `Unknown`, and — in four separate statements, two of them 23 lines apart in one
file — on whether an invalid transition is rejected or accepted as authoritative. Each SDK
implemented one copy exactly: `ospp-sdk-php` has the profile's 18 transitions, `sdk-ts` has
Chapter 05's 23. The root cause is that the bay section of Chapter 05 merges the station's physical FSM with the
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

- **spec:** `profiles/security/security-event.md` §6 (rule 2) — added normative **MUST** that the `eventId` assigned at incident detection **MUST** remain stable across all subsequent transmissions and buffered replays of the same logical incident. Closes the implicit-but-unstated stability requirement on which the server's dedup-by-`eventId` contract (`profiles/security/README.md` §3) relies. A fresh `eventId` per transmission attempt is now explicitly forbidden as a protocol-level dedup-defeat. No behavior change for compliant stations.

- **spec:** `profiles/offline/authorize-offline-pass.md` §6 (rule 7) — upgraded the server-side SecurityEvent emit from **SHOULD** to **MUST** for signature verification failures (check #1) and counter-replay failures (check #5). Made explicit that these are the only two cases in which the server itself emits a SecurityEvent on behalf of a station-presented credential — other `Rejected` outcomes (expiry, epoch revocation, station mismatch, usage limits, rate limit) are policy decisions, not security incidents, and **MUST NOT** be emitted as SecurityEvents by the server. Added normative requirements on the emitted SecurityEvent: `type` **MUST** be `OfflinePassRejected` (from the spec-defined enum in `security-event.md` §4); `eventId` **MUST** be deterministically derived from the originating REQUEST's `messageId` so that N distinct authorization REQUESTs produce N distinct audit rows (preserving attack-attempt visibility — an attacker probing different forged signatures or replaying the same credential across multiple stations is recorded as N incidents, not collapsed to one); recommended SHA-256-based derivation provided. True QoS 1 retransmits of the same REQUEST collapse via the transport-layer dedup at `02-transport.md` §3.3 before reaching the handler; the audit-layer dedup is defense-in-depth for cases beyond the transport dedup window.

- **spec:** version cascade `0.4.0` → `0.4.1` across all spec chapter headers, guides, conformance docs, READMEs, and badges, matching the v0.4.0 cascade convention.

### Flagged as known follow-ups (not in this release)

> **Both of these were moved to [KNOWN-ISSUES.md](KNOWN-ISSUES.md) in 0.13.0, and are recorded here
> only as history.** They sat in this section for 68 days and eight minor releases without being
> picked up, because a changelog records what a release *did* — nothing sweeps it for outstanding
> work, and the release carrying it scrolls out of view within a cycle. Follow-ups now go to
> KNOWN-ISSUES, where the summary table counts them.

- ~~`profiles/core/session-ended.md` profile is missing entirely~~ — the `SessionEnded` action is referenced from `04-flows.md`, the SessionEndReason vocabulary was extended in v0.4.0 (Item 8), and crash-resilience rules were added in v0.4.0 (`05-state-machines.md §2.5`), but no dedicated profile markdown exists. **Closed in 0.13.0** — authored as `profiles/transaction/session-ended.md`, not under Core as assumed here.

- Server-originated `FraudDetected` SecurityEvent type — when a server detects fraud via offline-tx reconciliation scoring, no SecurityEvent currently records the **incident** (the server's **reaction** — auto-disable of offline mode, revocation of active passes — is an administrative action and out of scope for SecurityEvent; the incident itself currently has no spec-defined SecurityEvent representation). A new server-originated type and emit rule will be considered in a future release. **Still open; tracked in KNOWN-ISSUES.**

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
- **spec:** `05-state-machines.md §3.5` Session FSM crash-resilience rules — station MUST persist seqNo to NVS before publishing the corresponding event; MUST resume the prior counter on reboot during Active/Stopping; MUST orphan the prior session if the persisted state is unrecoverable; sessionId MUST NOT be reused across station reboot; finalSeqNo MUST be set on terminal events when the station has emitted any seqNo-bearing events (Item 3).
- **spec:** `profiles/transaction/transaction-event.md §7.1` clarifies that `txCounter` (offline, per-pass, per-station) and `seqNo` (online, per-session) are independent counters in disjoint scopes (Item 3).
- **schema:** `session-ended-event.schema.json` reason enum extended from `["TimerExpired", "Fault"]` to `["TimerExpired", "Fault", "Local", "LocalOutOfCredit", "Deauthorized"]` (Item 8).
- **spec:** `03-messages.md` MSG-040 trigger list expanded to 5 cases (timer expiry, hardware fault, local user stop, offline credit exhausted, mid-session deauthorization). Enum table includes 3 new value descriptions. Version note documents the coordinated v0.3.0 → v0.4.0 stack upgrade requirement (Item 8).
- **spec:** `04-flows.md §6` refund policy table expanded with explicit rows for Local (pro-rated), LocalOutOfCredit (full refund — `creditsCharged` MUST be 0), Deauthorized (full refund — `creditsCharged` MUST be 0), and TimerExpired (charge full pre-auth) (Items 2 + 8 cross-interaction).
- **spec:** `05-state-machines.md §3.3` Session FSM transition rows for Local (Active → Completed), LocalOutOfCredit (Active → Completed), Deauthorized (Active → Failed). Existing terminal states reused with reason field as discriminator — no new FSM states (Item 8).
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
