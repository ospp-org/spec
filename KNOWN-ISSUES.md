# OSPP Known Issues

**Date:** 2026-09-05
**Specification-document version:** 0.32.0 (release tag `v0.32.0`)
**Status:** 3 blockers open (all BLE), **27** non-blocking issues open, **24** decisions recorded (one of
them reversing another), and one named defect **class** with **sixteen** instances, **five** still open. **The counts are
re-derived from the headings on every release, never incremented** — the previous revision read 24
open against 25 `## OPEN` headings, which is how a summary drifts from the file it summarises.
**Source:** ospp_audit_v2.md (post-correction audit), plus issues raised in the 0.8.0 cycle and
the arcs since

---

## Summary

| Severity | Count | Where |
|----------|------:|-------|
| BLOCKER | 3 | [BLE surface](#blocker--the-ble-surface-is-not-implementable-as-written-three-defects) — B-1, B-2, B-3 |
| OPEN | 27 | 4xxx grouping · `httpStatus()`/`category()` accessors · `errorText` carrying prose on two messages · provisioning station-side conformance · `StationIdentityCertificate` · **[`retryInterval` and `BootRetryInterval` are one quantity with two ranges](#open--retryinterval-and-bootretryinterval-are-one-quantity-with-two-legal-ranges-and-the-schema-states-only-a-floor)** · [asymmetric evidence on the online money path](#open--the-online-money-path-carries-only-a-symmetric-mac-and-a-symmetric-mac-proves-nothing-to-a-third-party) · [`bayCount` on BLE StationInfo](#open--ble-stationinfo-still-carries-baycount-which-cannot-name-a-bay-and-agrees-with-nothing) · [server-side `FraudDetected` has no SecurityEvent](#open--a-server-that-detects-fraud-at-reconciliation-has-no-securityevent-to-record-the-incident) · **[no gate range-checks a config value inside an example payload](#open--no-gate-range-checks-a-configuration-value-that-sits-inside-an-example-payload)** · [the signing toolchain canonicalizes with the SDK](#open--the-signing-toolchain-canonicalizes-with-the-sdk-so-it-verifies-the-sdk-against-itself) · **[103 of 127 restatements cite no source](#open--a-restatement-that-does-not-cite-its-source-cannot-be-checked-against-it-and-103-of-127-restatements-cite-nothing)** · **[170 numbered rules, and nothing says whether the numbering binds](#open--170-numbered-processing-rules-and-nothing-says-whether-the-numbering-binds)** · **[nothing checks a `Message Expiry` against the category it names](#open--nothing-checks-a-per-message-message-expiry-against-the-category-it-names-and-a-repair-landed-on-the-wrong-message-because-of-it)** · [a refusal for want of a trust anchor has no code that fits](#open--a-station-that-refuses-for-want-of-a-trust-anchor-has-no-code-that-fits-and-narrowing-1003-made-that-visible) · **[`5016` is required for two conditions and named for one](#open--5016-version_already_installed-is-required-for-two-conditions-and-one-of-them-is-the-opposite-of-what-the-name-says)** · **[UpdateFirmware is both idempotent and `5107`](#open--updatefirmware-is-documented-as-idempotent-and-as-rejected-with-5107-for-the-same-second-command)** · **[no code describes a non-HTTPS firmware URL](#open--a-firmware-url-that-is-not-https-is-refused-by-the-schema-and-no-error-code-in-the-registry-describes-that-refusal)** · **[`offeredVersion` vs `attemptedVersion`](#open--the-firmwaredowngradeattempt-securityevent-names-the-offered-version-with-two-different-member-names-and-nothing-can-tell)**  · **[a station whose hardware changes has no route back into service](#open--a-station-whose-hardware-genuinely-changes-has-no-route-back-into-service-because-the-two-rules-that-guard-topology-point-at-each-other)** · **[the hardware storage levels do not hold the Category-1 floors](#open--the-hardware-storage-levels-do-not-hold-the-category-1-floors-they-are-said-to-size)** · **[OfflinePass validity rides an uncorrected wall clock, and the backstop reads the same clock](#open--offlinepass-temporal-validity-rides-a-wall-clock-with-no-offline-correction-and-the-servers-backstop-reads-the-same-clock)** · **[`5019` has no carrier on either side](#open--5019-upload_failed-names-a-condition-that-cannot-exist-when-its-response-is-sent-and-its-real-carrier-has-no-code-field)** · **[the anti-downgrade guard verifies one artefact and decides on another](#open--the-anti-downgrade-guard-verifies-one-artefact-and-decides-on-another-and-no-field-is-missing)** · **[the firmware signing certificate rotates annually and no message can deliver it](#open--the-firmware-signing-certificate-is-stated-to-rotate-annually-and-no-message-can-deliver-the-new-one)**   |
| CLOSED | 7 | [Device Management Required vs RECOMMENDED](#closed-0160--the-device-management-profile-was-required-in-chapter-08-and-recommended-not-mandatory-in-its-own-readme) — closed in 0.16.0 in favour of the capability · [the bay FSM specified twice](#closed--the-bay-fsm-is-specified-twice-the-two-copies-disagree-and-each-sdk-implemented-a-different-one) — closed by the bay-FSM arc · [SessionEnded belonged to no profile](#closed-0130--sessionended-belonged-to-no-profile-and-the-note-saying-so-was-parked-where-nothing-reads-it) — closed in 0.13.0; both retained with their resolutions |
| **CLASS** | 16 | **[an obligation no field, no code and no actor can carry](#class--an-obligation-no-field-no-code-and-no-actor-can-carry)** — an index of the sixteen instances; **5** still open, 1 a blocker. `0.32.0` closed instances 15 and 16, the same defect on the two halves of one session, and supplied the **fourth remedy** the class had not recorded: withdraw the demand. The fourth sub-shape, named at 0.30.0 — a closed enumeration in which no legal value is true — still holds **three** instances, all closed at 0.31.0 |
| DECIDED | 24 | **[`2008` was listed under two statuses and the licence permitting it could not be broken](#decided-0320--2008-was-listed-under-two-statuses-and-the-licence-that-permitted-it-could-not-be-broken)** — §4.4's truthfulness obligation un-scoped and the multi-status licence given a checkable condition; the row fell out as a consequence; prose only, zero schema bytes · **[a start that energised and a boot that cannot say what happened](#decided-0320--a-start-that-energised-a-boot-that-cannot-say-what-happened-and-the-two-remedies-that-were-refused)** — the third arm of the §3.5 partition, reported through two messages that already exist; a new `SessionEnded.reason` and a queryable session state both refused with their costs · **[§10.1 required receivers to ignore unknown fields, and every schema forbids it](#decided-0290--02-transportmd-101-required-receivers-to-ignore-unknown-fields-and-every-schema-in-this-repository-forbids-it)** — 73 of 73 object schemas are closed, and three decisions already taken (§2.1's known gap, exact-match negotiation, the `0.26.0` triple refusal) rest on receivers *not* ignoring; prose only, zero schema bytes · **[the broker MUST check revocation, the list is bounded twice, and a stale list buys one alerted hour](#decided-0270--the-broker-must-check-revocation-the-list-is-bounded-twice-and-a-list-that-goes-stale-buys-one-alerted-hour-before-the-door-shuts)** — axis 1a + 2a&2b + 3c; verified by declaration because no message can carry it, and the two bounds are broker settings deliberately outside the Chapter 08 registry · **[`allowedServiceTypes` withdrawn in two steps](#decided-0250--offlineallowanceallowedservicetypes-is-withdrawn-in-two-steps-because-nobody-ever-asked-for-the-constraint)** · **[ownership transfer and decommissioning stay undefined, and §1.3 now says so](#decided-0250--station-ownership-transfer-and-decommissioning-stay-undefined-and-the-specification-now-says-so)** · **[the server is the billing authority on the offline path too](#decided-0240--the-server-is-the-billing-authority-on-the-offline-path-too-and-81-was-the-outlier)** · **[`OfflinePassMaxAge` kept, wired into check #2, defaulted to inert](#decided-0240--offlinepassmaxage-is-kept-wired-into-check-2-and-defaulted-to-inert)** · **[`DiagnosticsUploadUrl` withdrawn — a key nothing reads](#decided-0230--diagnosticsuploadurl-had-no-reachable-consumer-and-is-withdrawn-rather-than-defined)** · **[UpdateFirmware to a `Pending` station is `Accepted`, notifications suppressed](#decided-0210--updatefirmware-to-a-pending-station-was-refused-on-a-premise-the-same-chapter-contradicts-and-with-a-response-no-error-code-could-carry)** — **reverses the `0.20.0` row below**: the `Rejected` it mandated needed an `errorCode` no registry entry supplies, and §6.6 already reported the outcome on BootNotification; the discriminator's second clause survives, its reading did not · **[nine gates in `tools/` were reachable from no job](#decided-0201--two-validation-scripts-reported-100-failure-and-no-workflow-ran-them-the-workflows-now-call-the-scripts-and-a-census-guards-the-class)** — the workflows now call the scripts, and `check-tool-callers.py` guards the class · **[the firmware gate is on the INSTALL, not the download](#decided-0200--the-active-session-gate-named-three-stages-it-gates-the-install-and-scheduledat-defers-the-install-with-it)** — and `scheduledAt` defers the install with it; the stall rule scoped rather than `Verified` given a wire value · **[~~UpdateFirmware to a `Pending` station is `Rejected`~~ — REVERSED in `0.21.0`](#decided-0200--updatefirmware-had-no-row-in-the-pending-command-table-it-is-rejected-and-the-discriminator-gained-the-clause-that-says-why)** — kept as the record; the row it added was right, the verdict in it was not · **[a restricted station may renew its own certificate](#decided-0190--one-table-gave-the-same-act-opposite-verdicts-and-a-certificate-renewal-could-not-conclude-in-the-state-the-spec-keeps-open-for-repairs)** — the exception's *reason* restated to cover both members rather than a second name added to a list · [a wire mechanism to shorten the previous-key grace period](#decided-0170--a-wire-mechanism-to-shorten-the-previous-key-grace-period-was-evaluated-for-compromise-response-and-rejected) — evaluated for compromise response in 0.17.0 and rejected, recorded with its cost and with what would reopen it · **[`1003` vs `1004`: specificity wins](#decided-0180--every-cause-of-1004-was-an-instance-of-1003s-second-cause-and-the-conformance-case-exercising-both-accepted-either)** — the missing *Distinct from* convention treated as the cause, and the conformance case repaired with it · **[the certificate urgency scale binds once](#decided-0180--the-certificate-urgency-scale-was-stated-twice-and-the-expired-row-was-the-one-that-differed)** — `06-security.md` §4.7.3 is normative, the profile refers, and the unbounded reconnect is dropped |
| **Total open** | **30** | |

**The three blockers are confined to BLE, and are the reason the BLE artefacts ship as
EXPERIMENTAL in 0.8** — see [BLE release status](README.md#ble-is-experimental-in-08). They do
not affect the MQTT surface, offline reconciliation, or provisioning, all of which are
implemented and exercised against a second implementation.

The 0.2.x audit issues below are all resolved and retained for history: all 3 CRITICAL
(AUDIT-V2-001, V2-009, V2-024) and all 31 MAJOR/MINOR.

### Resolved in Focused Audits (21 issues removed)

The following issues were resolved during the 7 focused audit phases (error-codes, config-keys, numeric-values, schemas, test-vectors, guide, flows), the SCH-001 conditional schema implementation, and the test case expansion:

| ID | Category | Severity | Resolution |
|----|----------|----------|------------|
| V2-010 | Schema | MAJOR | maxLength corrected to 500 in both schemas |
| V2-013 | Error XRef | MAJOR | 3012/3013 added to 07-errors per-message table |
| V2-014 | Error XRef | MINOR | 5000-5009 added to 03-messages |
| V2-017 | Error XRef | MINOR | 4004 Used By now includes BLE AuthResponse |
| V2-018 | Missing Tables | MINOR | ChangeConfiguration Error Responses section added |
| V2-019 | Missing Tables | MINOR | GetConfiguration Error Responses section added |
| V2-020 | Missing Tables | MINOR | TransactionEvent Error Responses section added |
| V2-022 | Profile | MAJOR | GetConfiguration spurious 2001 removed |
| V2-023 | Profile | MAJOR | ChangeConfiguration now has 3015 and 2008 |
| V2-028 | Profile | MAJOR | Reconciliation now uses "Duplicate" status |
| V2-029 | Profile | MINOR | GetDiagnostics now has 1011 URL_UNREACHABLE |
| V2-039 | Flow | MAJOR | Flow 01 now uses MQTT 5.0 |
| V2-041 | Flow | MINOR | Flow 01 Keep Alive corrected to 30s |
| V2-043 | Guide | MAJOR | Firmware auto-rollback timeout corrected to 5 minutes |
| V2-044 | Diagrams | MINOR | MaxSessionDuration default corrected |
| V2-045 | Diagrams | MINOR | MeterValues default corrected to 15s |
| V2-046 | Test Vector | MAJOR | auth-response-full.json corrected to OFFLINE_PASS_EXPIRED |
| V2-051 | State Machine | MINOR | Session FSM StartService timeout now 10s |
| V2-040 | Flow | MAJOR | Flow 01 LWT fixed (FLW-002), Flow 09 LWT stationId added |
| SCH-001 | Schema | MAJOR | Conditional required fields implemented via allOf/if/then |
| TST-008 | Test Cases | MINOR | 12 new test cases added (TC-CORE-002, TC-TX-004/005/006, TC-DM-003–009, TC-OFF-004) |

### Resolved in Backlog Batch (30 issues removed)

The following 30 issues were resolved in the backlog batch fix.

> **This table is a record of what was decided then, not a statement of the current rules.** Some
> of its resolutions have since been superseded — the `MessageSigningMode` enum lost `Critical`
> and its default moved to `All`, the `mac` field is no longer conditional, and `bootReason` gained
> `Reconnect` for the case V2-047 resolved as `ErrorRecovery`. Read [CHANGELOG.md](CHANGELOG.md)
> for what is normative; read this for why a thing was once written the way it was.
>
> **And one of these rows was simply false.** V2-050 claimed a repair that `git log` shows was
> never made, and it stood for five months because nothing checks a resolution against the tree it
> describes. A registry that claims repairs it did not perform is worse than an incomplete one: an
> incomplete registry sends you to look, and a false one tells you not to bother. The rows here are
> **claims, not verified state** — the only row audited against the tree is V2-050, and it did not
> survive the audit. Verify before relying on any of them.

| ID | Category | Severity | Resolution |
|----|----------|----------|------------|
| V2-002 | Config | MAJOR | Verified — no remnants of 300s max; all files already show 3600 |
| V2-003 | Config | MAJOR | ReconnectBackoffMax default 300→30; algorithm references config key |
| V2-004 | Config | MAJOR | BLE advertising interval 100ms→200ms in hardware table |
| V2-005 | Config | MINOR | BootRetryInterval default 60s→30s in 07-errors |
| V2-006 | Config | MINOR | LogLevel enum PascalCase: Debug, Info, Warn, Error |
| V2-007 | Config | MINOR | MessageSigningMode enum PascalCase: All, Critical, None |
| V2-008 | Config | MAJOR | README config key count 30→39 |
| V2-011 | Schema | MAJOR | error-response.schema.json deleted (orphaned, no $ref) |
| V2-012 | Schema | MINOR | mac field: conditionally present based on MessageSigningMode |
| V2-015 | Error XRef | MINOR | HMAC signing count corrected: 23 required, 13 exempt |
| V2-016 | Error XRef | MINOR | Verified — 95 error codes is correct (gap at 5022, count still 95) |
| V2-021 | Profile | MINOR | Removed implicit 1005/6001 from 6 DM profiles |
| V2-025 | Profile | MAJOR | BLE transport: connectivity Online/Offline, pricing Fixed (PascalCase) |
| V2-026 | Profile | MAJOR | DM README: generic 30s replaced with per-action timeout table |
| V2-027 | Profile | MINOR | Added 5000 vs 3009 clarification in ble-session |
| V2-030 | Naming | MINOR | Per-action messageId prefixes canonical; architecture references Appendix A |
| V2-031 | Naming | MINOR | Glossary: "UUID v4" → "8+ lowercase hex chars" in Bay/Station/Session/Subscriber |
| V2-032 | Naming | MINOR | Glossary Identifier entry: added 5 missing prefixes (otx_, opass_, msg_, fwupd_, sec_) |
| V2-033 | Naming | MINOR | Added capabilities. prefix to bleSupported/offlineModeSupported |
| V2-034 | Naming | MINOR | MQTT Client ID stn_{station_id} → {stationId} (no double prefix) |
| V2-036 | BLE Timeout | MINOR | GATT connection timeout: 10s→5s in state machines |
| V2-037 | BLE Timeout | MINOR | BLE handshake timeout: 5s→10s in state machines |
| V2-038 | BLE Timeout | MINOR | BLE scan timeout: 30s→10-30s range (configurable) |
| V2-042 | Flow | MINOR | Flows 03/06: added MeterValuesInterval=60s note |
| V2-047 | Flow | MINOR | Flow 10: mqtt_reconnect→ErrorRecovery in narrative |
| V2-048 | Flow | MINOR | Flow 11: arming package→OfflinePass, arm_pkg_→opass_ |
| V2-049 | Flow | MINOR | Flow 09: math table shows both pure 3.5x and LWT-adjusted calculations |
| V2-050 | Flow | MINOR | ~~00-introduction timestamp: added .000 milliseconds~~ — **this repair was claimed and never performed.** `git log -S` on the literal shows `spec/00-introduction.md` §3.6 untouched from the initial commit `5e49f2e` until 0.13.0, still carrying `…T10:30:00Z` as the worked example in the sentence that mandates millisecond precision — a value its own [`timestamp.schema.json`](schemas/common/timestamp.schema.json) rejects. Actually fixed in 0.13.0, along with the gate that should have caught it (Category 16 did not scan `spec/`, and in the trees it did scan it read only parsed JSON blocks, so four further prose timestamps had been sitting in `examples/` in plain sight). |
| V2-052 | Flow | MINOR | SecurityEvent example: failedMessageId→messageId, failedAction→action |
| V2-053 | Security | MINOR | Security checklist references MessageSigningMode (default: Critical) |

### Resolved in Buffer Capacity Redesign (1 issue removed)

| ID | Category | Severity | Resolution |
|----|----------|----------|------------|
| V2-035 | Buffer | MAJOR | Categorized buffering: MUST buffer TransactionEvent (1000) + SecurityEvent (200); MAY discard 6 regenerable message types. Single source of truth in 01-architecture.md §6.5; 02-transport.md and 07-errors.md reference it. Hardware: 512 KB MUST, 1 MB SHOULD. |

---

## BLOCKER — the BLE surface is not implementable as written (three defects)

**Raised 2026-07-28, scoping the 0.8.0 tag. These are the reason the BLE artefacts are marked
EXPERIMENTAL — see [BLE release status](README.md#ble-is-experimental-in-08). Recorded, not
repaired: each fix is a design decision, and BLE is implemented nowhere — the server rejects the
BLE key at provisioning, no `StationIdentity` is issued, and no second implementation exercises
the transport. Designing against nothing is what produced the sequencing layer this cycle
removed.**

### B-1 — two incompatible fragmentation protocols are simultaneously normative

[`02-transport.md` §8.6](spec/02-transport.md) and
[`profiles/offline/ble-transport.md` §11](spec/profiles/offline/ble-transport.md) both define, as
a MUST, how a BLE message longer than the effective MTU is split — and they disagree on every
element:

| | `02-transport.md` §8.6 | `ble-transport.md` §11 |
|---|---|---|
| header | printable ASCII `{F:M/N}` | 3 binary bytes |
| numbering | 1-based (`Fragment numbering starts at 1`) | 0-based `sequenceNumber` |
| terminator | implicit, `M == N` | explicit `flags` bit 0 |
| 5 s timeout runs from | the **previous** fragment | the **first** fragment |

A sender obeying one is unintelligible to a receiver obeying the other, and nothing in either
chapter ranks them. `ble-transport.md` §11 is the more complete definition (it specifies
encrypt-then-fragment ordering against the AEAD channel), but §8.6 is in a numbered chapter and
carries a worked example, so neither is safely deletable without deciding which the eventual
implementation follows.

### B-2 — a station-scoped OfflinePass is unrepresentable in the authoritative schema

Validation check 5 requires the station's ID to be permitted by the pass
([`offline-pass.md`:66](spec/profiles/offline/offline-pass.md), rejecting with
`2006 OFFLINE_STATION_MISMATCH`), and
[`TC-OFF-002`:17-19](conformance/test-cases/offline/TC-OFF-002.md) instructs a tester to "Create
an OfflinePass whose station-scoping constraint does not include the test station".

[`offline-pass.schema.json`](schemas/common/offline-pass.schema.json) has no member that can
carry that constraint — not at the top level, not inside `constraints` — and sets
`additionalProperties: false` at **both** levels, so the pass the conformance case asks for
cannot be constructed and remain schema-valid.

This bites on the **BLE** path only. On the MQTT path the constraint is server-side state, not a
wire field — [`authorize-offline-pass.md`:49](spec/profiles/offline/authorize-offline-pass.md)
is explicit that `allowed_station_ids` belongs to "the **server's stored pass record** (not a
wire field)", and [`reconciliation.md`:92](spec/profiles/offline/reconciliation.md) reads it from
there. A station validating a pass locally over BLE has no server to ask and can only read the
pass, which cannot say.

### B-3 — the three BLE response schemas disagree with each other and with Chapter 07

[`07-errors.md` §2.3](spec/07-errors.md) defines the BLE error shape as a **nested** `error`
object carrying seven fields. No BLE schema implements it, and no two agree:

| schema | rejection fields | matches §2.3? |
|---|---|---|
| [`ble/auth-response`](schemas/ble/auth-response.schema.json) | flat `reason` (≤256) + `errorCode` | no — flat, no `errorText` |
| [`ble/start-service-response`](schemas/ble/start-service-response.schema.json) | flat `errorCode` + `errorText` (≤128) | no — flat, no `reason` |
| [`ble/stop-service-response`](schemas/ble/stop-service-response.schema.json) | **none** | no |

`stop-service-response` is the sharp one. Its `result` enum admits `Rejected`, its `allOf`
branches only on `Accepted`, and `additionalProperties: false` closes it — so a station obeying
[`ble-session.md`:157](spec/profiles/offline/ble-session.md) ("If the `sessionId` does not match
any active session, the station **MUST** respond with `Rejected`") can state that it refused but
has no conforming way to say why, and cannot add a field to do so.

Fixing this means choosing whether BLE carries the full Error Object under MTU pressure — §2.3
already concedes truncation of `errorDescription` — or a deliberate subset, and then applying one
answer to all three schemas plus the profile prose that mirrors them
([`ble-session.md`:29-33](spec/profiles/offline/ble-session.md) and `:146-147`).

---

## DECIDED (0.32.0) — 2008 was listed under two statuses, and the licence that permitted it could not be broken

**The defect was not the duplicate row. It was that no artefact could have refused it.**
`07-errors.md` §2.4's status table listed `2008 ACTION_NOT_PERMITTED` under both `401` and `403`.
Measured across all 31 code–status pairs the table carries: **30 distinct codes, and `2008` the only
one appearing twice.** Measured across every tag in this repository: **all 49**, from
`v0.1.0-draft.1` on 2026-03-02 to `v0.31.0`. Nothing introduced it and no release repaired it,
because there was no rule it broke — §4.4 says in terms that the table *"is illustrative and assigns
no code a fixed status"*, and that one code *"can honestly appear with more than one status"*.

**So deleting the row would have changed nothing normative**, and that is why it was not the repair.
An illustration cannot be violated. Both reference SDKs had chosen — `ospp-sdk-php` `401`, `sdk-ts`
`403` — and **both were conformant**, which is the whole finding: following the specification
perfectly produced two incompatible libraries, and no conformance test could have addressed either.

**Two sentences were changed, and the row fell out of them.**

1. **§4.4's second obligation was un-scoped.** *"The HTTP status **MUST** be the one that is true"*
   already existed, under the heading *What a server does outside the list* — so it governed only the
   statuses the table does **not** name, leaving the ones it does name governed by an illustration
   and by nothing else. Truthfulness now governs the whole in-scope REST surface. **This invents no
   rule; it removes a fence from one that was already there.**
2. **The multi-status licence gained its condition.** Where the table lists a code under more than
   one status, that code's registry entry **MUST** name the condition that selects between them; a
   code whose entry describes one condition has one true status and **MUST NOT** appear twice. The
   licence is unchanged for any code that genuinely is reachable in two states — it keeps both rows
   and gains the sentence saying which is which.

`2008`'s entry names one condition — *the authenticated entity does not have the required RBAC role
or permission* — and authentication having succeeded is what `403` means, while the `401` row's own
description is *authentication failed or expired*, which is `2009`, `2010` and `2019`. **There was no
second state to select, so the row was unselectable rather than redundant**, and it fell as a
consequence. Had it been selectable, the repair would have been the missing sentence, not a deletion.

**Cost, measured before the edit and confirmed after: zero.** No schema carries an HTTP status —
`0` of 86 — nothing in §3 has a status column, and **0 of the 334 conformance vectors** reference
one. One line moves in `ospp-sdk-php` (`ACTION_NOT_PERMITTED` from the `401` arm to the `403` arm),
which is the first time either accessor has been decidable against the specification rather than
against the other library.

**What this does not settle.** `2001 STATION_NOT_REGISTERED` (php `422`, ts `401`) is the other
two-sided disagreement and remains open: it is named by no row of the table, which is the `3003`
shape, not this one. **88 of the 118 registry codes are named by no row at all.** The rule added here
constrains how the table may speak, not how much it says.

---

## DECIDED (0.32.0) — a start that energised, a boot that cannot say what happened, and the two remedies that were refused

**`start-service.md` rule 9 mandates a durable record before anything is energised and names its
consumer in the same breath** — *on the next boot an uncompleted record is the anchor that tells the
station whether the command already ran*. **Nothing said what the station does when the anchor
answers *maybe*.** The record was required, its reader was named, and the reading was unspecified.

`05-state-machines.md` §3.5 partitions the reboot on whether the prior state is **recoverable**:
rule 2 resumes, rule 3 orphans. The mid-activation power loss is in neither arm — the record
survives, so nothing was lost; the delivery it describes stopped, so there is nothing to resume.
A station following the text took rule 2 and asserted `Occupied` for a bay that was doing nothing.

**Built (0.32.0): the third arm, in prose, at zero schema bytes.** `start-service.md` gains rule 12
and §3.5 gains rule 6: the station **MUST** report through the two messages that already exist — a
SecurityEvent [MSG-012] `HardwareFault` whose open `details` carries the `sessionId`, `bayId` and
`programNumber`, and a StatusNotification [MSG-009] reporting the bay `Faulted`. **This is verbatim
the pattern `stop-service.md` rule 9 was given at 0.30.0** for the mirror-image condition, and
deliberately the same two messages: the failure is one failure seen from two ends — **settlement runs
on a figure nobody measured.** There the station reports a duration it did not observe; here
`connection-lost.md` §6 has the server settle on *estimated time delivered*. What the report adds is
not the closure, which the server's timer was always going to perform, but **the closing figure's
quality** — and the station held the one fact that could supply it.

**A live contradiction was closed on the way past.** `session-ended.md` rule 1 required a SessionEnded
for *every* session terminating without a StopService, while §3.5 rule 3 forbids emitting further
events for an orphaned `sessionId`. Both are **MUST**s and they point opposite ways; only the
unsatisfiable one was stated in the profile. Rule 1 now excludes both reboot cases, and the exclusion
is the removal of a demand nothing could meet: the orphaning station no longer holds the `sessionId`,
`actualDurationSeconds` or `creditsCharged` the schema requires, and the indeterminate station
measured neither of the latter two.

**REFUSED (a): a new `SessionEnded.reason` member.** It is the obvious remedy and it is a settlement
decision wearing a schema costume. Every existing `reason` has a row in `04-flows.md` §6's refund
matrix **and** a row in the service-kind table below it, so a new value is not a wire question but a
ruling on who is billed when nobody knows what was delivered — with no measurement available to
ground it. The schema cost is real but not the reason: one file, and 0 of its 6 vectors would break,
since an added member is a widening (precedent: `0.31.0` added `Inactivity` and `OperatorStopped` to
this same enum and broke 0 of 334). **The trap is worth recording**: the negative vector
`session-ended-event-invalid-reason.json` asserts rejection using `"UserStopped"`, so a member taking
that name would make a test that must fail start passing. The demand was withdrawn instead of the
enum widened — **a fourth remedy for the closed-enumeration sub-shape**, which had recorded three.

**REFUSED (b): a queryable terminal state, and here is the measurement that refuses it.** The request
was for a state an operator or server could interrogate — *this session's outcome is indeterminate*.
**OSPP has no session-status representation of any kind to add it to.** Measured: **0 of 86 schemas**
define one; the words `completed` and `failed` appear only as prose, in three files
(`connection-lost.md`, `07-errors.md`, `04-flows.md`); `GET /sessions/{id}` is in scope at §4.4 for
its **error codes only**, with no response body defined anywhere. This is therefore not *add a
member* but *introduce a concept the protocol does not have*, and it is refused on the same ground
instance 14 of the class below was declined at `0.31.0`: the prose exists, the open `details` object
carries the fact, and the cost is a new normative surface. **Recorded here with its cost rather than
left as a rule nothing implements.**

---

## DECIDED (0.30.0) — eight places where two normative statements disagreed, and the implementations broke every tie

**The whole set was decided by measuring what is built rather than by preferring the stricter text**,
and **not one of the eight needed a schema byte** — in four of them the schema was already the
correct side and already permitted the repaired behaviour.

| Disagreement | Decided | How the tie broke |
|---|---|---|
| `update-firmware.md` §7 *"MUST maintain two firmware partitions"* vs the implementor's guide *"Use A/B partitioning **if possible**"* | the **guide** loses | Both texts date from the initial commit and neither had ever been edited. The guide declares itself non-normative on its own line 4, and this is an **anti-brick** requirement: the weak variant sat in the one document read before the hardware order. The guide also named a rollback trigger — a five-minute BootNotification stall — that is not one of §8's three conditions and is in fact the *server's* stall timer |
| `04-flows.md` step 7 *"`sessionKey` (if message signing is enabled)"* vs the schema requiring it on every `Accepted`/`Pending` | the **prose** loses | The schema's own description already records why: `MessageSigningMode` is station configuration, not a field of this message, so the condition was never expressible. Server sets it unconditionally on both arms; both SDKs type it non-optional; `boot-notification.md` §5 makes a keyless `Accepted` **malformed**. The parenthetical was the last survivor of a repair that had swept everything else |
| `07-errors.md` (respond, 4 sites) vs `boot-notification.md`:131 (*"Server drops the message"*) on `1005` | **`boot-notification.md`** loses | The schema requires `errorCode`/`errorText`/`retryInterval` on any `Rejected` boot response and exempts no code; the reference server answers on this path and says in a code comment that the spec is unsettled and it will not decide it there; a conformance scenario **asserts the response with a 15 s timeout**, so the drop behaviour is what the suite forbids. The two statements were describing different failures and neither said so — an unparseable **envelope** cannot be attributed to BootNotification at all, because nothing identifies it as one |
| `1005` *"Do NOT retry"* vs CORE-011 *"MUST retry BootNotification indefinitely"* | **both stand, scoped** | Measured on the cells: `1007` and `2001` each carry the CORE-011 reconciliation clause twice; `1005` carried it **zero** times. §5.2 of the same chapter already sets boot retry to unlimited, and `boot-notification.md` §5 already states the resolution. A firmware author implementing the registry literally **bricks the station**: it stops booting, so it can never receive the update that would fix the malformed field |
| `transaction/README.md`:100 (*duplicate ReserveBay MUST return `3014`*) vs `reserve-bay.md` rule 7 (*identical repeat returns `Accepted`*) | the **README** loses | Rule 7 landed in `5b124a1` at 0.14.0 and swept four sibling files; the README bullet sits in the same directory as `reserve-bay.md` and was not in that commit. `git log -S` shows it unedited since the initial commit |
| `01-architecture.md`:422's `MUST` 512 KB vs its own footnote deriving ~1.6 MB | **neither is changed** | Raising a mandatory storage level changes the bill of materials of every conformant station, and that decision stays OPEN. The row is *already* self-annotated and the guide was repaired at 0.29.0. **The genuinely unswept site was a third one** — `08-configuration.md`:196 still asserted that the 512 KB level *"sizes … for exactly that"* floor, in the normative registry entry a reader consults while configuring the buffer |
| `06-security.md` §6.6's *"global"* `RevocationEpoch` vs a per-tenant implementation | the **spec** loses | The global model is a **platform-wide denial of service reachable from an ordinary tenant permission**: one operator revoking their own passes revokes every tenant's. The reference implementation repaired exactly that and has been per-tenant since. The word stood at **nine** sites, not the three reported — five in §6.6, plus the Chapter 08 registry entry, two in `offline-pass.md`, and one in the implementor's guide |
| `3003` opening with *"hardware not present"* vs *"availability, not existence"* twelve lines below | the **existence formulations** lose | Two of them, not one — `07-errors.md`:329 and `start-service.md`:72, the second inside the very profile that draws the distinction. The non-existence case has its own code, `3019 SERVICE_NOT_BOUND`, and the server routes it there |

---

## DECIDED (0.31.0) — the seven schema-byte gaps were adjudicated one by one, and three schemas moved

**The streak of five releases at zero `schemas/` bytes ends here, deliberately and narrowly.** Three
schema files move; the other four gaps were closed without touching `schemas/` or were declined with
their reason. **Measured before any edit and confirmed after: ZERO of the 334 schema-mapped
conformance vectors break.** The three files carry 16 vectors between them (`boot-notification-request`
10, `session-ended-event` 6, `provisioning-response` 0) and all 16 still validate, because an added
enum member is a widening, an added OPTIONAL property is a widening, and a `description` is not
validated at all.

**Two premises that had been carried about the cost were false and were corrected first.** *"334
vectors become invalid if it touches the envelope"* — **zero** of the 334 carry an MQTT envelope; they
are payload-only, and `verify-schemas.py`'s mapping never targets `schemas/common/`, so
`mqtt-envelope.schema.json` has no vectors at all. And *"no job diffs the vector corpus"* — both SDKs
now run a `vector-corpus` byte-identity gate, so a corpus change is loud rather than silent (see the
entry below, which said otherwise and is now closed).

| Gap | Decision | Why |
|---|---|---|
| **No boot generation on the wire** | **No field. Prose instead, and the limit is written down.** | The value is already derivable and the server already derives it. `boot-notification.md` rule 3 becomes a server **MUST**: cross-check `bootReason` against `uptimeSeconds` on every boot, and **MUST NOT** act on a `bootReason` its uptime contradicts — on a contradiction take the real-boot branch and settle the session. **Stated as a limit, not a repair**: it catches a station that contradicts *itself* and nothing else, and a station reporting a coherent falsehood stays undetectable. That is what a persisted generation would buy and it is not bought here |
| **No `bootReason` for a Boot requested by TriggerMessage** | **Definition widened, enum untouched** | The cheapest correct answer in the set. `Reconnect` already means *no boot occurred*; only its second clause — *"only the MQTT session is new"* — excluded the triggered case, and that clause was never the load-bearing half. It now covers both cases of *no boot occurred*. **No member added**, so both SDKs' `!== RECONNECT` helper stays true, and the server behaviour it selects (keep the live session) is the correct one for a Boot where nothing restarted |
| **`SessionTimeout` has no `reason` value** | **`Inactivity` added — the enum is widened** | None of the six was true of an idle stop, so the one event required to report it had nothing to report it with. The far end breaks hard and knowingly: the server's transformer `tryFrom()`s this enum and **throws** on an unknown value, and its handler matches all six with no default arm — both are ours and both deploy with the SDK. Billed pro-rata on delivered duration, the same as `Local`. **This closes all three gaps of the §8 note**, not one: the trigger disagreement is resolved by the registry that already governed (user interaction, *not* MeterValues), §3.3 gains the transition row §3.4 had been naming, and the both-directions breakage at legal settings **dissolves** once MeterValues no longer reset the timer — no range was narrowed to fix it |
| **`MessageSigningMode` has no wire signal** | **OPTIONAL top-level `messageSigningMode` added** | The decisive argument is that every channel which could report the mode is closed by the condition it would report: GetConfiguration is among the 44 signed types of 47, so a fail-closed station cannot use it. BootNotification REQUEST is one of the three structural exemptions and therefore the only message that still arrives. **Not inside `capabilities`** — that object is feature flags describing what a station *supports*, four booleans; this is configuration state describing what it is *doing*. **OPTIONAL**, so no deployed station is invalidated, at the stated price that **silence is ambiguous** and a server **MUST NOT** infer a mode from its absence |
| **`SecurityEvent.details` has no shape** | **Declined. Not enforced** | The field is open, the prose specifying its content already exists, and a fourth restatement changes nothing that three have not. It has the largest vector radius in the set — **17** — and the enforcement it would buy is not worth them at this cycle. The gap stands, recorded, with its instance in the class index below |
| **`UpdateServiceCatalog.services` has no `maxItems`** | **Normative ceiling on the emitter. Zero bytes** | The bound belongs to the only party that can measure the payload before sending it, and we are the only emitter. A server **MUST NOT** publish a catalog exceeding the 64 KB packet ceiling that already exists. A schema `maxItems` would have to pick a number: the item is already bounded (`serviceName` 128, `bindings` 64), so the worst case admitted is ~2.5 KB and 64 KB holds **25**, while entries at the size the corpus really carries (max 206 B) fit **318**. Picking 25 forbids legal catalogs; picking 318 permits an undeliverable one |
| **No physical-stop confirmation on `stop-service-response`** | **Declined** | Exactly the shape refused four times: a new member on a closed RESPONSE. The reporting route was built at `0.30.0` through two messages that already exist. Settlement still runs on the self-reported duration, and that is the residue, recorded |

**Two more rode the same cascade at nil marginal cost**, because `schemas/` was already open:
`provisioning-response.schema.json`'s `keepAliveSeconds` description no longer contradicts its own
`required` array (0 vectors, no validation change), and `3003` gains the `details.cause` discriminator
that `1004` established as this specification's pattern for one condition with several recoveries —
**without adding a code**, because on the wire to and from a station `3003` has always meant exactly
one thing, and the ambiguity is on the server's REST surface where one action answers it both for a
station-reported dead program and for a tenant-lifecycle refusal.

---

## DECIDED (0.30.0) — five backlog items that did not survive measurement, recorded so they stop being re-raised

Each of these was carried as a live defect. Each is false, and two are false in a direction that
matters more than the item did.

| Item | What it claimed | What is true |
|---|---|---|
| **No `commandId`/`attemptId`/`operationId` on the wire, so a station cannot tell a redelivery from a new operation** | a missing correlation identifier | **`messageId` already carries exactly this, and the retry policy is built on it.** The glossary requires a retry to re-send the *same* `messageId`; Chapter 02 §3.3 requires both parties to hold ≥1000 of them for ≥1 hour and to answer a duplicate REQUEST with the cached RESPONSE; Chapter 07 §5.3 says in terms that this *"is what makes a multi-attempt policy safe to state without qualifying it per action."* Same operation, same id. **Residue, narrower and real:** the envelope types `messageId` as a 1--64 string with no `pattern`, while §7.2 calls it an RFC 4122 UUID |
| **Circular boot clock: the clock needed to validate certificates can only come from a session the clock must validate** | an unbootstrappable requirement | **The line that states the circularity *is* the bootstrap path.** *Initial time source* is a required row of the §7.2 pre-boot manifest, and §7.2 requires a deployment to supply every row out of band — the same discharge `stationId` and both trust policies take. Searched for an alternative and found none: `grace window`, `unauthenticated time`, `Roughtime`, `no clock` on a boot path — all zero. **A narrower gap was real and is repaired at 0.30.0:** the MUST-refuse covered the two trust rows and said nothing for the time row |
| **`RetryLater` gives no wait interval, so backoff is invented from nothing** | an unspecifiable retry | **5 s initial, 300 s cap, stated in three normative places**, and two of them say the *absence of a field* is deliberate: *"the response carries no retry interval … so the backoff is the station's, not a server-supplied value."* The station has always known. Also checked: `retryInterval` is not reusable here — it exists only on `boot-notification-response` and its `allOf` gates it to that message's statuses |
| **`KNOWN-ISSUES.md` says `MessageSigningMode` is "unreleased, on main" while a summary row says "CLOSED in 0.15.0"** | a self-contradicting ledger | **Neither string exists in this file.** `unreleased` = 0, `on main` = 0, `CLOSED in 0.15` = 0, against a positive control of 4 for `MessageSigningMode`. There is no `## CLOSED (0.15.0)` heading. The two stale rows that *do* exist sit in a table whose own preamble names this exact supersession four lines above them |
| **A lost `SessionEnded` is permanently lost revenue** | unrecoverable billing loss | **False, and inverted.** Three server mechanisms recover it and **all three bill** — a per-minute expiry sweep charging the full requested duration, a job whose metric is literally named `full_delivery_no_session_ended`, and a command-timeout scanner settling through the same authority. The real exposure is an **overcharge**: on the early autonomous terminations the sweep charges the full duration where this specification says bill zero or pro-rata. That is a defect in an implementation, not a missing ACK on the wire, and an application-level ACK over a fire-and-forget EVENT would have been a new schema file to fix a problem the wire does not have |

---

## CLOSED (0.31.0) — the provisioning response schema contradicts itself about whether `keepAliveSeconds` may be absent

`provisioning-response.schema.json` lists `keepAliveSeconds` in `mqttConfig`'s `required` array, and
the description of that same member says Chapter 02's 30 seconds *"is the value to use when this field
is **ABSENT**"*. Both cannot hold: a member in `required` is never absent from a valid document.

The **prose half is repaired at 0.30.0** — `04-flows.md` §2's five *"if absent, MAY use a
pre-configured fallback"* clauses are gone, because all eleven `mqttConfig` members are REQUIRED and
the schema is closed, so *absent* was unreachable against a valid response and actively harmful
against an invalid one: silently connecting to a locally-held broker address because the server's
answer did not parse is the one outcome a provisioning step exists to prevent.

**The schema half is repaired at 0.31.0, and it cost nothing.** It was deferred one release for a
stated reason — editing a `description` changes no validation and still moves bytes, turning both SDK
byte-identity gates red until a re-vendor — and that release came: `0.31.0` opens `schemas/` for two
real changes, so this rode along at nil marginal cost, exactly as the note above anticipated. The
description now says the member is REQUIRED, that Chapter 02's 30 seconds is the pre-provisioning
default rather than a fallback, and that a response omitting the member is malformed rather than
defaulted. **0 vectors, 0 validation change.**

---

## DECIDED (0.29.0) — `02-transport.md` §10.1 required receivers to ignore unknown fields, and every schema in this repository forbids it

`02-transport.md` §10.1's *JSON Encoding Rules* table carried one row from the beginning:

> `| Unknown fields | Receivers MUST ignore unknown fields (forward compatibility) |`

**No conforming implementation could have obeyed it.** Measured over `schemas/`: **73 of 73** object
schemas declare `additionalProperties: false` — 47 under `mqtt/`, 15 under `ble/`, 9 under `common/`,
the envelope, and the provisioning pair. The 13 that do not are scalar type definitions with no
members for the keyword to govern, so the closure is total rather than merely widespread. A receiver
that validates against the shipped bytes refuses a member its copy does not carry; a receiver that
ignores unknown members is not validating. The intersection of the two obligations was empty.

**This was not a dormant contradiction — three decisions already taken rest on the half the table
denied.** That is what moved it from *inconsistency* to *defect*:

| Site | What it says | What it needs to be true |
|---|---|---|
| `07-errors.md` §2.1 | on seven closed response schemas *"an `errorCode` cannot be placed on the wire at all"*, recorded as a **known gap** needing a schema change and an SDK re-vendor | a receiver refuses an unknown member |
| `VERSIONING.md`, *Negotiation is exact match* | a `0.4.0` station's `SessionEnded` carries a `reason` a `0.3.0` server does not know, and *"The server rejects it on validation"* — the worked example the whole exact-match rule is argued from | a receiver refuses an unknown member |
| `CHANGELOG.md` `[0.26.0]` | widening a closed response schema was available three times and refused all three, because an added member *"is backward-compatible for the emitter and not for a receiver validating against an older vendored copy"* — a failure **already measured once**, on the offline pair | a receiver refuses an unknown member |

Three sites depend on receivers *not* ignoring unknown fields; one table row required that they do.
The row was the outlier and the row was the defect.

**Fixed in the prose, and deliberately without forbidding anything.** The replacement states that a
receiver **MAY** validate; that one which does not **SHOULD** ignore members it does not recognise,
as a robustness recommendation rather than a guarantee an emitter may rely on; that adding an
OPTIONAL member stays **MINOR** and removing or renaming one stays **MAJOR**; and that what makes an
addition safe is exact-match negotiation refusing the pairing at boot, not the parser. A repair that
made adding a field illegal would have been worse than the ambiguity — the rule this repository
applied throughout `0.26.0` — so it does not.

**Zero bytes moved under `schemas/`.** No message, field, enum value or Chapter 08 key changes; the
86 schemas and the 334 vectors are byte-identical, and no SDK re-vendor of schemas is required. What
changed is that the specification stopped promising a tolerance its own artefacts refuse.

## DECIDED (0.27.0) — the broker MUST check revocation, the list is bounded twice, and a list that goes stale buys one alerted hour before the door shuts

**Raised 2026-08-28 from the boot-path sweep that corrected `04-flows.md`'s Boot `Rejected` causes,
and written then as a decision with its option space rather than as a defect, because every axis was
a real choice and the specification had made none of them. Decided 2026-08-30. It now makes all
three, and the entry is kept in full — the measurement is what makes the decision auditable.**

### What was written before this decision, measured at `8ce4ee7`

| Site | What it said | Force |
|---|---|---|
| [`02-transport.md` §1.3](spec/02-transport.md#13-tls-12-floor-13-recommended) | *"The broker MUST verify the station's client certificate against the OSPP CA trust chain."* | MUST — and it is about the **chain**, not revocation |
| [`06-security.md` §4.4](spec/06-security.md#44-certificate-requirements) | *"CRL Distribution Points \| REQUIRED (URL to CRL published by Station CA)"* · *"Authority Info Access \| RECOMMENDED (OCSP responder URL)"* | REQUIRED — of the **certificate's contents**. A pointer nothing was obliged to follow |
| [`06-security.md` §4.3](spec/06-security.md#43-key-management-lifecycle), *Station mTLS Client Key Pair* | *"**Revocation** \| CRL published by Station CA (checked by MQTT broker). OCSP RECOMMENDED."* | a **table cell** in a lifecycle summary — indicative mood, no keyword |
| `06-security.md` T04 | *"compromised certificates are revoked and rejected by the broker"* | **threat-model prose**, describing a mitigation as though it were in force |
| `06-security.md` T10 | *"compromised certificates are revoked; the broker rejects connections from revoked certificates"* | the same, differently worded; T10's summary **row** was the only one citing a section for it |
| [`06-security.md` §4.7.1](spec/06-security.md#471-automatic-renewal) step 8 | the station validates *"the certificate chain, CN match, key usage, and validity period"* | the station-side checklist — **revocation was not in it** |
| [`07-errors.md` §3.1](spec/07-errors.md#31-transport-errors-1xxx) `1004` | *"X.509 certificate is expired, **revoked**, self-signed, or has an invalid chain"* | the code existed, its Server action was *"reject the connection"*, and nothing made the refusal reachable |

**Not one normative keyword anywhere in `spec/` obliged any party to check revocation.** The
certificate was REQUIRED to carry the CRL's address; nobody was required to read it. `1004` named
the condition and prescribed the refusal, and nothing made the refusal reachable.

**The vocabulary a revocation policy would be written in was absent entirely.** Measured over
`spec/`, `schemas/` and `conformance/`, whole-repo: `nextUpdate` **0**, `soft-fail` **0**,
`hard-fail` **0**, `fail-open` **0**, `stapl`(ing) **0**. `fail-closed` returned 8 — six of them
anchor links to §5.7's message-signing rules, one the `0.9.0` history row about *station certificate
validation* being fail-closed, one the BLE relay residual of §6.5.2. **None about revocation**;
the entry as first written said *"none about certificates"*, which was one site too strong.

**Why it mattered, and it was not hypothetical.** Revocation is the only mechanism this
specification has for a compromised station identity before its certificate expires — up to **one
year** ([§4.2](spec/06-security.md#42-pki-architecture)) — and §6.6's revocation **epoch** is
explicitly OfflinePass-only and *"avoiding the complexity of Certificate Revocation Lists"*, so it
does not substitute. T10 (Certificate Compromise, **Critical**) listed *"§4.3 CRL/OCSP"* as its
mitigation. **A mitigation nothing is obliged to perform is not a mitigation**, and the threat rows
read as though it were in force.

**Reported by the reference deployment, 2026-08-28: revocation checking was OFF in production**,
carried as a deploy precondition rather than as a protocol obligation. That was exactly the outcome
the text permitted — a conforming deployment, with the check off, and no clause it violated.
Recorded as the operator's report, not as something this repository measured.

### The decision, axis by axis

**Axis 1 — option 1a. The broker MUST check.** [`06-security.md` §2.1](spec/06-security.md#21-station--server--mutual-tls-mtls)
gains the obligation one bullet below the chain-verification MUST it belongs beside, and the whole
of it is stated in the new [§2.1.1](spec/06-security.md#211-revocation-checking). The obligation
runs to whichever party terminates the station's client certificate — the MQTT broker, and equally
the Station REST fallback endpoint, because a control one leg of the fleet can route around is not
a control.

**Axis 2 — options 2a *and* 2b, together, because either alone is defeatable.** The revocation
information must be current by **its own `nextUpdate`** (2a) *and* by a configured
`CertificateRevocationMaxAgeSeconds` (2b), and the earlier of the two governs. 2a alone is written
by the party being checked: a CA free to publish a `nextUpdate` a year out has bounded nothing. 2b
alone would ignore an issuer that says its own list is already superseded. OCSP remains available
as a stronger alternative and satisfies both bounds by construction; option 2c was not taken as the
*only* mechanism, because it makes every connection depend on a responder's availability.

**Axis 3 — option 3c. Permissive with a bounded grace, then restrictive, with the alert at the
START of the grace and not its end.** The alert placement is the part the option space named as
needing a home and did not resolve: an alert at expiry carries nothing the refusal does not, since
by then the fleet is already being turned away. What is scarce is the knowledge that the broker is
accepting connections it has not been able to check — which is known the moment the grace begins.

**Axis 3 also forced a second decision the option space had not seen: the two refusals cannot be
the same refusal.** A revoked certificate is refused at the TLS handshake, and the station's
existing `1004` recovery — keep credentials, stay off the broker, alert the operator — is right for
it. Applying that to a *grace-expiry* refusal would be a defect with the shape of a repair: those
stations have valid certificates, the condition is transient, and `1004`'s non-expired branches are
`recoverable: false`, so a CRL outage would take the fleet off the broker and **leave it off**,
needing an operator at every site. That is worse than the fleet-wide disconnection the grace exists
to prevent, caused by the mechanism meant to prevent it. A grace-expiry refusal therefore completes
the handshake and refuses at the **MQTT CONNECT** with a non-zero CONNACK reason code
(`0x87 Not Authorized` RECOMMENDED), which the station already answers with retry-with-backoff — so
the fleet returns by itself when the list does. Completing the handshake grants a revoked station
nothing: no session, no subscription, no topic access. **No fifth `details.cause` is defined**; the
four members name what is wrong with the *certificate*, and this is a property of the broker.

### Deriving the grace, since the option space said only that it "needs a number written down"

Both bounds are numbers this document already publishes.

- **Floor.** The intervals the specification already treats as *briefly unavailable and nothing is
  wrong* are `ReconnectBackoffMax` (default 30 s, ceiling 3600) and `ConnectionLostGracePeriod`
  (default 300 s, ceiling 600). A grace inside that band converts an ordinary blip in list
  distribution into a fleet-wide refusal, and — because every refused station reconnects on a
  backoff capped by the first of those — into a reconnect storm against the broker already failing
  to fetch.
- **Ceiling.** [§4.7.4](spec/06-security.md#474-failure-handling) already fixes this document's
  patience for an unreachable CA: *"Alerts operator after 24 hours."* A grace of 86400 s would
  expire no earlier than the moment the document first concedes a full day may have passed
  unnoticed. That is not a control; it is the absence of one, with a timer.
- **Chosen: 3600 s**, six times the largest ordinary-transient ceiling and one twenty-fourth of the
  unreachable-CA alert threshold. With the 86400 s freshness default, the worst case from a
  revocation being published to a revoked certificate being refused is **25 hours** — on the far
  side of §4.7.4's alert, so an operator has been told twice, by two independent paths, before the
  first station is turned away. The range is `0--86400`: `0` is refuse-immediately (axis 3b as a
  deliberate deployment choice), and the ceiling is §4.7.4's threshold.

### The objection 1a carries, and how it is answered

The option space named it: *"it is a deployment capability, not a protocol message — the spec would
be mandating a broker configuration it cannot observe or test over the wire, and no conformance case
could exercise it."* That is true and is not worked around. **The clause is verified by declaration
rather than by test case.** A deployment claiming Standard compliance or above **MUST** state its
revocation posture in its conformance report ([`conformance/README.md` §5](conformance/README.md#5-reporting-format)):
enabled or not, the mechanism, both configured bounds, and where the grace-entry alert is delivered.
A report omitting it is incomplete; a deployment answering *disabled* is **not conforming** — it may
say so, which is the point of requiring the answer, but saying so is not a waiver. This is the
weakest verification the specification uses anywhere, and it is used because the alternative was not
a stronger check but no statement at all.

The two settings are **not** Chapter 08 registry keys: §1.1 defines that registry as the *station's*
key-value store and §1.5 makes every key of a required profile a station obligation, while neither
setting is held by a station or carried by any message. They are named, typed, defaulted and ranged
in the registry's own form all the same, and `tools/check-config-ranges.py` gained a **check F** that
holds their Range cells to §1.6's five forms, feeds them into the restatement comparison, and fails
if either name ever appears in Chapter 08. RED-testing check F surfaced a pre-existing blind spot in
check C: the derived-by-a-shared-factor excuse was guarded by `lo and hi` on the *outer* test, so any
range with a zero lower bound was skipped entirely — `RevocationEpoch` (`0--2147483647`) had never
been comparable either. Fixed with the same commit; the tree was already clean under the widened
check.

### Two corrections inside this entry itself

Both were errors at writing time, not drift — the tree has not moved since the entry was committed
in `8ce4ee7`:

1. **The Revocation cell was attributed to `06-security.md` §4.2.** It is at `06-security.md:444`,
   under `#### Station mTLS Client Key Pair (ECDSA P-256)`, which sits inside **§4.3 Key Management
   Lifecycle** — §4.2 (PKI Architecture) ends at line 432. The same mis-citation appeared three
   times in this entry and once in `CHANGELOG.md`'s `0.26.0` section, which is left as the historical
   record it is. Corrected here. Note the document being audited was right: T10's summary row cited
   §4.3.
2. **One quoted sentence was attributed to "T04/T10".** *"compromised certificates are revoked and
   rejected by the broker"* is **T04 only**; T10's wording differs, and the two are `### T04` /
   `### T10` sub-sections under `## 1. Threat Model`, not "§2". Both rows are now shown separately
   above, and both have been re-keyed.

### What was swept

Every sentence that asserted the mitigation, not only the section that defines it: T04 and T10's
countermeasure bullets and both summary rows; the §4.3 Revocation cell; both §4.4 extension rows;
§4.2's CA table and its *Trust distribution* list, which enumerated how every trust artefact reaches
its holder and omitted the one artefact that has to keep arriving after provisioning; §7.5's
*Automated Security Responses*, whose *"BootNotification from revoked certificate"* row was wrong
twice over — the refusal happens at the handshake, so a revoked station never sends one, which
`04-flows.md` already said; §6.7.1's contrast case, which now cites an obligation instead of a table
cell; `04-flows.md`'s revoked-certificate note, which had cited the **chain** MUST because it was the
nearest thing to cite; `02-transport.md` §1.3 and its error-scenario table, and §7.1's broker
minimum-capability list; `security-event.md`'s `CertificateError` row, which omitted `revoked` while
`03-messages.md` included it; Appendix A's Server checklist; the glossary, which had no entry for
CRL or OCSP; the implementor's guide's conformance and security-testing checklists; and
`TC-SEC-002`, whose Part B enumeration omits revocation and whose Part E proves less than it looks
like it proves — both now said out loud.

§4.7.1 step 8 is the one omission that stays an omission, and it now says why: the station is
validating a certificate it has just been **issued**, minutes old and by construction not revoked,
and a fetch there would put a network dependency inside the recovery path for an expiring credential.

### What this decision does NOT decide

- **The station is given no revocation obligation, in either direction.** It is not required to
  check the **broker's** server certificate for revocation. A station has no network before its
  first connection, an embedded TLS stack on a cellular link is the worst place for a
  fetch-before-connect dependency, and §4.4's REQUIRED distribution point is an extension of the
  *station's* certificate, not the broker's. The residual is real: a revoked **broker** certificate
  is refused by nothing in this specification. It is recorded here rather than closed.
- **No conformance case can be written for §2.1.1**, and none is claimed. `TC-SEC-002` Part E
  exercises a harness broker; the deployment's broker is reached only by the declaration.
- **Nothing is decided for the other three revocation surfaces**, each of which keeps its own
  answer: the OfflinePass epoch (§6.6), the BLE StationIdentity certificate (§6.5.2, revoked only by
  expiry, best-effort), and the server signing key (§6.7, for which this specification defines no
  revocation mechanism at all). §2.1.1 names all three so a reader stops looking.
- **The CRL's own distribution is not specified** — who serves it, on what cadence, behind what
  availability. §2.1.1 bounds what a broker may *rely on*, which is the half that decides whether a
  revoked certificate is refused; the publication half is a PKI operations question and stays out of
  scope with the rest of the deployment topology ([`01-architecture.md` §8](spec/01-architecture.md)).

---

## OPEN — the conformance harness is two directories and a zero-byte placeholder, so nobody outside this project can run conformance

**Raised 2026-08-28. Named separately from the other absences because it is the one a second
implementor meets first, and it is the difference between a specification and a specification with
a compliance claim.**

Measured at this HEAD:

| What exists | Count |
|---|---:|
| Conformance test cases, `conformance/test-cases/**/TC-*.md` | **34** |
| Files under `conformance/harness/` | **2** |
| Bytes under `conformance/harness/` | **0** |

The two files are `conformance/harness/runner/.gitkeep` and
`conformance/harness/server-simulator/.gitkeep`. `conformance/README.md` says so itself — the
harness is *"planned for future releases; the `harness/` directory contains placeholder
structure."*

**So the 34 cases are 34 manual procedures and no automated verdict.** A second implementor can read
what conformance means and cannot execute it, cannot regression-test against it, and cannot produce
evidence of it that anyone else can re-run. Every compliance statement about this protocol currently
rests on one team running one implementation by hand.

**This is not the same shape as the other open items in this file.** The rest are defects in what the
specification *says*; this is an absence in what it *ships*. It is also the one that compounds: each
release adds cases to a corpus nothing executes, so the gap between what is specified and what is
demonstrable widens on every cycle rather than holding still.

**Not scoped here, and deliberately so.** A runner is a project, not a repair, and the shape of it —
whether it drives a real broker, a simulator, or both; whether the server simulator is part of this
repository or vendored — is a decision this entry exists to force rather than to make. Recording it
is the point: it has been *"placeholder structure"* across every release this file covers, and
nothing in the repository was asking about it.

---

## OPEN — three absences with no urgency, recorded together so they stop being rediscovered

**Raised 2026-08-28, from the same sweep. None of them blocks anything, none of them has a
workaround that is wrong, and each has now been found more than once from scratch — which is the
reason they are written down rather than the reason they are ranked.**

**1 — Maintenance mode has no expiry, no maximum duration, and no automatic exit.** The only defined
way out is a person remembering: [`07-errors.md` §3.3](spec/07-errors.md#33-session--bay-errors-3xxx)
`3014`'s action reads *"Operator: clear maintenance mode when work is done"*, and
`profiles/device-management/set-maintenance-mode.md` contains **zero** occurrences of *duration*,
*expiry*, *timeout* or *auto-clear*. A station left in maintenance is out of service indefinitely
and nothing in the protocol notices. The repair, if taken, is a bounded duration with a defined
expiry behaviour — which is a normative decision about whether the station or the server owns the
clock.

**2 — There is no configuration revision identifier.** Measured over `spec/` and `schemas/`:
`configVersion` **0**, `configRevision` **0**, `lastKnownGood` **0**, *"last known good"* **0**.
Neither side can name which generation of configuration a station is holding, so *"is this station
configured correctly"* is answerable only by reading every key back one at a time and comparing.
The service catalog has `catalogVersion` and configuration has no counterpart — the asymmetry is the
tell. Related but distinct from the config-corruption question: a station recovers a corrupt key to
its **documented default**, never to a last-known-good, because no such concept exists.

**3 — A diagnostics collection cannot be cancelled.** There is no message, no action and no state
transition by which a server abandons a collection it started: `cancel` appears **0** times in
`profiles/device-management/get-diagnostics.md` and **0** times in
[`05-state-machines.md` §8](spec/05-state-machines.md), whose machine has no operator-initiated exit
from `Collecting` or `Uploading`. Device Management defines nine actions and, unlike reservations,
no counterpart to `CancelReservation`. A collection that hangs is waited out.

**Why these three together.** Each is a missing *capability* rather than a contradiction, so none
produces a wrong answer today — a reader is never misled, only unserved. That makes them the
cheapest class to defer and the easiest to rediscover, and rediscovering one costs the same
measurement each time. They are ranked below the revocation decision above because none of them has
a security consequence and none of them is currently masked by prose claiming otherwise.

---

## OPEN — no gate range-checks a configuration value that sits inside an example payload

**Raised 2026-08-18, in `0.24.1`, by the defect it let through.**

`0.24.0` moved `MaxOfflineTransactions` to a range of `1000--10000`. Three sites went on carrying
`50`: `conformance/test-vectors/valid/core/boot-notification-response-full.json`, and
`examples/flows/01-boot-sequence.md` in both its payload and its prose summary. Each depicts a
server pushing a value a conformant station must refuse with `5109 INVALID_CONFIGURATION_VALUE`,
and one of them is a vector in the **`valid`** tree.

**All three passed every gate in the repository, before the change and after it.** The two checks
that look like they would catch it do not:

| Gate | What it actually compares |
|---|---|
| `check-config-defaults.py` | a **restated default in prose** against the registry's Default column |
| `check-config-ranges.py` | **range statements** against each other, and against the JSON Schema bounds of a wire field carrying the same quantity |

A literal inside an example's `configuration` object is neither a restated default nor a range
statement, so nothing reads it. Schema validation does not close the gap either: the registry Range
column is not expressed in any schema — that gap is itself the one open finding
`check-config-ranges.py` reports.

**Shape of the fix.** A check that walks every `configuration` object in `examples/` and
`conformance/`, resolves each key against the Chapter 08 registry, and range-checks the value —
with a non-vacuity guard, since a discovery gap that finds zero objects would read exactly like a
clean run. It would also need the type column, because these values are wire strings (`"1000"`)
while the registry type is `integer`.

**Why it is worth building rather than noting.** This is the third distinct way this repository has
found a number to be wrong — after a count carried without its measurement point, and a restated
default that disagreed with its registry — and it is the only one of the three with no gate at all.

---

## OPEN — the hardware storage levels do not hold the Category-1 floors they are said to size

**Raised 2026-08-19, in `0.25.0`, by measuring the corpus against the table instead of reading the table.**

[Chapter 01 §6.5](spec/01-architecture.md#65-offline-message-buffering) states a Category-1 buffering floor
and, below it, a Hardware Requirements table whose `MUST` row said it sized *"1000 TransactionEvents
(~300 KB) + 200 SecurityEvents (~40 KB) + 20 KB overhead + 150 KB headroom (~40% safety margin)"* — 512 KB.

Measured against the `valid` conformance vectors at `efe009c` / `v0.24.1`, compact JSON payload, envelope
excluded:

| Message | Table's implied figure | Largest `valid` vector | Ratio |
|---|---:|---:|---:|
| TransactionEvent (offline, pass-form) | 300 B | **1091 B** | **3.6×** |
| SecurityEvent | 200 B | **509 B** | **2.5×** |
| SessionEnded | **0 B — no line at all** | 199 B | — |

The TransactionEvent figure is not padding: **607 B of the 925 B minimal vector is the signed `receipt`**,
which is the non-repudiation artefact and **MUST** be retained byte-identically for retransmission
([Chapter 02 §5.3](spec/02-transport.md)). A conformant station cannot compress it away.

**SessionEnded was budgeted zero while being `MUST NOT discard`.** Its Min Capacity cell read *"1 per session
that ended while unable to send"*, which states the emission rule and sizes nothing. The floor is now 1000,
the same as TransactionEvent, because [`session-ended.md` §6](spec/profiles/transaction/session-ended.md)
rule 1 requires the event for **every** session terminating without a StopService, and while the station is
offline no session can terminate *with* one — the server that would send it is unreachable. The two streams
are co-indexed one-for-one over an outage.

Derived: **~1.6 MB** for the `MUST` floors and **~3.2 MB** for the `SHOULD` ones, against levels of 512 KB
and 1 MB.

**Why this is recorded rather than fixed.** A mandatory storage level is a bill-of-materials line for every
station anyone builds. The Category-1 floors are the normative requirement and are unchanged; §6.5 now
carries the measured per-message figures and the derived totals, so the arithmetic can be checked rather
than trusted, and says in terms that a vendor sizing hardware today should build to the derived figures.
Choosing the new level is the decision.

**The option space.**

1. **Raise the levels to the derived figures** — `MUST` 2 MB, `SHOULD` 4 MB. Honest and simple. Cost: the
   §6.5 note that *"any controller capable of running MQTT + TLS (minimum ESP32 class with 4 MB flash) has
   sufficient capacity … without additional hardware cost"* stops being true at the `SHOULD` level once
   firmware and its A/B partition are accounted for.
2. **Lower the Category-1 TransactionEvent floor below 1000.** Rejected on sight here, and named only so the
   next reader does not have to re-derive why: `0.24.0` raised `MaxOfflineTransactions` from a `10--500`
   range to `1000--10000` precisely because no legal configuration reached the floor. Lowering the floor
   re-opens that.
3. **Permit a compact on-station encoding** and size in encoded bytes rather than JSON. The receipt is the
   bulk and is already base64 over DER; CBOR on the envelope recovers perhaps a third. It changes no wire
   format, because what a station stores is not what it publishes — but the specification has never said
   that in terms, and saying it is itself a decision.
4. **Split the levels by profile** — a station that declares neither `offlineModeSupported` nor
   `bleSupported` buffers far less. This is the only option that leaves small stations where they are, and
   the only one that needs a new conditional in a chapter that currently has none.

---

## OPEN — OfflinePass temporal validity rides a wall clock with no offline correction, and the server's backstop reads the same clock

**Raised 2026-08-19, in `0.25.0`.**

[`06-security.md` §6.1.1](spec/06-security.md#611-offlinepass-validation--10-checks) check #2 requires
`expiresAt` to be in the future and `now - issuedAt` not to exceed `OfflinePassMaxAge`. Both are wall-clock
comparisons, and the station evaluating them is by definition **offline**:

- Its only two protocol clock sources are `serverTime` on the BootNotification and Heartbeat responses, and
  both arrive only over an established mTLS session.
- The detector that would report the problem, `5106 CLOCK_ERROR`, is defined as *"detected at Heartbeat
  [MSG-008] time sync"* — so offline there is no detector either.

**The specification had already done this analysis and stopped one field short.**
[`heartbeat.md` §6](spec/profiles/core/heartbeat.md#6-clock-synchronization) rule 5 puts session elapsed time
on a monotonic timer, and the note under rule 2 enumerates what does *not* ride the wall clock — billing,
anti-replay, the StatusNotification ordering floor. Credential validity was not in that enumeration and does
ride it. The enumeration is now complete.

**What `0.25.0` fixed.** The clock model is stated: the station uses its best available wall clock and
**MUST NOT** refuse a pass for want of confidence in it — a rule that withheld service on an unverified clock
would withhold it for the whole of every outage, which is the condition the profile exists to serve. And
`stationOfflineWindowHours` is named as a **monotonic** elapsed duration from the last successful MQTT
connection rather than a wall-clock difference, which closes the enforcement gap `ROADMAP.md` had carried
open, using the mechanism rule 5 already mandates.

**What is left, and why it is a decision.** The server's backstop is
[`reconciliation.md` §6.1](spec/profiles/offline/reconciliation.md#61-check-list) check #9, which compares the
pass's `expiresAt` against the envelope's `endedAt` — **a timestamp the station produced from the same wall
clock**. A station running days slow passes check #2 on an expired pass and then reports an `endedAt` that
passes check #9. The backstop is not independent of the fault it backs up. The guards that *are* independent
are the ones that read no clock: checks #10–#13 and the cumulative cross-station factors of §7.4.

The same document already knows station timestamps are weak evidence — §9's drift row says *"Use server time
for billing, station time for audit"* — but check #9 is a **security** decision taken on an audit-grade value.

**The option space.**

1. **A skew bound at reconcile.** The server holds for review any transaction whose `endedAt` sits more than
   *N* from its own receipt-processing time. Needs no wire field; the server has both values. Cost: *N* is a
   policy number the specification would have to pick, and a station genuinely offline for days has a
   legitimately old `endedAt` — the bound is on *skew*, not age, and stating that precisely is the work.
2. **Bound expiry by the monotonic window instead.** Since `stationOfflineWindowHours` is now monotonic and
   sound, let it carry the weight check #2's wall-clock half cannot. Cost: it bounds how long a station may
   be offline, not how long a pass is valid; they are different quantities and conflating them was rejected
   once already.
3. **Accept it and say so.** The exposure is bounded by `maxUses`, `maxTotalCredits` and `maxCreditsPerTx`,
   which read no clock, and by check #13's global counter uniqueness. A drifted clock buys an attacker a
   pass that is already spent-limited. This is a defensible position and it is currently the *de facto* one —
   it is simply nowhere written.

---

## OPEN — `5019 UPLOAD_FAILED` names a condition that cannot exist when its response is sent, and its real carrier has no code field

**Raised 2026-08-19, in `0.25.0`. An eighth instance of the class below.**

`5019 UPLOAD_FAILED` is *"The diagnostics archive could not be uploaded to the provided URL"*
([`07-errors.md` §3](spec/07-errors.md)), and §4.2 lists it among GetDiagnostics [MSG-018]'s codes, in bold —
the marker this file uses for a message's primary codes.

Both ends fail:

- **At response time the condition cannot exist.** [Chapter 05 §8.3](spec/05-state-machines.md#83-transition-table)
  fixes the machine: a `Rejected` response *"leaves the machine in `Idle`, having never entered it"*, and the
  upload is the `Uploading -> Uploaded` / `Uploading -> Failed` pair, both downstream of an `Accepted`. A
  station answering the command has probed the URL's reachability — that is `1011 URL_UNREACHABLE`, a
  different code — and has uploaded nothing.
- **At the time it *can* exist, nothing can carry it.** §8.3's `PUT fails` row reports through
  DiagnosticsNotification `Failed`, and
  [`diagnostics-notification.schema.json`](schemas/mqtt/diagnostics-notification.schema.json) has exactly
  `status`, `progress`, `fileName`, `errorText` with `additionalProperties: false`. There is no `errorCode`.

`TC-DM-005` Part C is headed *"Diagnostics Upload Failure (5019)"* and asserts only that `errorText`
*"describ[es] the upload failure"* — the conformance case had already discovered that the code is
unassertable, without saying so.

**Why it is not repaired here.** The class note below says to look first for a value already on the wire
carrying the same meaning. There is one — `errorText` — but on this message it is deliberately free prose,
and that is the subject of a **different** open finding on this page
([`errorText` carrying `errorDescription` semantics on two messages](#open--two-messages-carry-errordescription-semantics-under-the-name-errortext)).
The two are one question: whichever way `errorText`'s naming is settled decides whether `5019` gets a
carrier. Deciding half of it here would be the third time this repository has patched one of the pair
without the other.

**The option space.** (1) Add `errorCode` to DiagnosticsNotification — breaking, and the mirror question
arises immediately for FirmwareStatusNotification, which has the identical shape. (2) Constrain this
`errorText` to `^[A-Z][A-Z0-9_]+$`, as `get-diagnostics-response.schema.json` already does for its own
`errorText`, so the field carries the registry **name** — breaking for prose, and it forecloses the naming
finding above. (3) Withdraw `5019`, on the `DiagnosticsUploadUrl` precedent: a code no conformant
implementation can emit is not a code. (4) Retain it as a **server-side** classification only, and say so in
its registry row — it is what a server records about a failed upload, never what a station sends.

---

## DECIDED (0.25.0) — `offlineAllowance.allowedServiceTypes` is withdrawn in two steps, because nobody ever asked for the constraint

**Raised 2026-08-19, in `0.25.0`, by promoting a statement the specification already carried.**

[`06-security.md` §6.1.1](spec/06-security.md#611-offlinepass-validation--10-checks) ends with:

> **Nothing here reads `offlineAllowance.allowedServiceTypes`.** The pass carries the list, the schema
> requires it and `minItems: 1` keeps it non-empty, and it is covered by the signature — but no check in this
> list, in the authorize-time eleven, or in the reconcile-time thirteen compares a requested `serviceId`
> against it. Whether it should be checked is an open decision, not a property this section may be read as
> providing.

That paragraph is accurate and has been there since the field was audited. It is registered here because a
correct statement parked in the middle of a chapter is not a tracked decision, and because §6.1's
countermeasure list names the pass's *"hard limits"* and has to exclude this one by hand every time it is
read — which it now does, in a parenthesis.

**What is actually at stake.** The list is **signed**. A field inside the signature that no verifier reads is
not inert: it is a promise the credential appears to make and no party keeps. An operator issuing a pass
scoped to `["svc_basic"]` has every reason to believe a `svc_deluxe` transaction against it will be refused
somewhere. Nothing refuses it, at any of the three gates.

**Decision: option 4, withdrawal, taken in two steps.**

What ruled out defining it was not cost but **coordination**: a server that began enforcing the list would
refuse passes that a conformant station of every prior revision accepts. Switching the constraint on is a
fleet change requiring both sides to move together, not a clarification — so it cannot be started
unilaterally, and nobody has asked for it in the life of the field. Against that, a signed member no verifier
reads is worse than an absent one: it is a promise the credential appears to make and no party keeps.

**Step one — `0.25.0`, non-breaking.** The member leaves `offlineAllowance.required` in
[`offline-pass.schema.json`](schemas/common/offline-pass.schema.json) and is retained as **accepted and
ignored**. Servers **MUST NOT** issue it; receivers **MUST NOT** reject on its presence, absence or contents.

**Step two — a later release, breaking.** The member is deleted from the schema, and the corpus is edited and
re-signed in the same pass.

**Why two steps and not one.** `offlineAllowance` is `additionalProperties: false`, so deleting the member
outright makes **every pass already in circulation invalid** at the next station that validates it — a
fleet-wide credential invalidation as the price of removing a field nothing reads. The wait costs nothing and
is short by construction: `OfflinePassMaxAge` defaults to `86400`, and `0.24.0` made the pass re-issue on app
start, on each consumption and on each top-up, so circulation turns over within a day.

**Measured cost of step two, so it is not rediscovered.** The member sits **inside the signed body**
([`06-security.md` §6.1.1](spec/06-security.md#611-offlinepass-validation--10-checks)), so removing it from any
fixture invalidates that fixture's ECDSA signature. Nine standalone signed JSON artifacts carry it (4 valid
vectors, 3 invalid, 2 example payloads), all vendored **byte-identically** by both SDKs; twenty further
occurrences sit in markdown-embedded signed payloads across seven documents, re-signed only by
`sign-inline-md.mjs --all`, which rewrites the tree; and
`conformance/test-vectors/crypto/ble-handshake-keyschedule.json` embeds the pass as AEAD `plaintextUtf8` in
two scenarios, so the RFC-5903/5869/8439-anchored oracle must be regenerated by `generate-ble-vectors.mjs`.
Step two should be scheduled when no SDK release is vendoring the corpus.

**The options not taken**, kept because a future proposal to *define* the field has to answer them.
(1) **Enforce at reconcile** — a fourteenth check in
[`reconciliation.md` §6.1](spec/profiles/offline/reconciliation.md#61-check-list); the server holds both
values and the comparison reads no clock, but it needs an error code that does not exist, and
`2015`/`2016` are the naming pattern. (2) **Enforce at the station** — matches where the other per-pass
limits live and refuses before the service is delivered, but *"10 checks"* is a cited count naming a
conformance case and ten further citations, so it would fold into check #8 rather than become an eleventh.
(3) **Enforce at authorize time only** — rejected on sight and named so it is not re-proposed: Full Offline
is the mode with no server in the loop, so this would enforce the constraint in exactly the two modes that
were never the risk.

---

## DECIDED (0.25.0) — station ownership transfer and decommissioning stay undefined, and the specification now says so

**Raised 2026-08-19, in `0.25.0`, from the reprovisioning reconnaissance.**

Measured over `spec/` and `schemas/` at `efe009c`, whole-word, case-insensitive:

| Term | Occurrences |
|---|---:|
| `decommission`, `decommissioning`, `dispose`, `disposal`, `unregister`, `deregister`, `tombstone`, `handover`, `RMA`, `owner` | **0 each** |
| `transfer` | 10 — **every one of them `DataTransfer`**, the vendor-extension message |
| `ownership` | 1 — [`status-notification.md`](spec/profiles/core/status-notification.md), about the program/service boundary, not a station's owner |

A station therefore has no protocol representation of who owns it and no defined end of life. The nearest
thing is `2001 STATION_NOT_REGISTERED`, whose registry row names *"a tenant move"* — **as a cause of a
fault**, with the recovery *"fixed operator-side"*. There is no protocol for it.

The state machines make the second half unrepresentable rather than merely unspecified: `NotProvisioned` has
**no incoming edge** in either SDK's station machine, and both carry the same reason — *"a station MUST NOT
enter this state autonomously — there is no remote credential wipe"*. Neither machine has a terminal state.

**Decision: option 1 — both are declared out of scope, in writing.** [Chapter 00 §1.3](spec/00-introduction.md#13-out-of-scope)
gains a row for each, plus a note saying why two rows exist for subjects that were simply absent. The
reference implementation had already taken this position in its own ADR; the specification had not, and an
undocumented agreement between one server and one spec is not a protocol decision.

**What decided it was the shape of the absence, not its size.** Every other row in §1.3 excludes a topic no
reader goes looking for. These two are topics a reader *does* go looking for and finds nothing — and a
reader who concludes "not written yet" builds something and expects it to interoperate. The exclusion is
what makes the silence load-bearing rather than accidental.

**The two options not taken, kept because reopening this means choosing between them.** (2) **Model
decommissioning only** — a terminal station state plus the incoming edge both SDKs lack. It is the smaller
half and the one with a real safety story: a decommissioned station must not reconnect, and today nothing
says so. (3) **Model both**, which needs an ownership field, a transfer operation, and a rule about what
becomes of sessions, receipts and retained signing keys across the boundary — the retention rule at
[`06-security.md` §4.3](spec/06-security.md) requires *every* historical receipt-signing key be kept and
does not say by whom after a transfer. **Either is a protocol addition, not a clarification**, so it needs a
MINOR at least, and the `NotProvisioned` edge in (2) is breaking for both SDK state machines.

> **UPDATE 2026-08-28 — the decision was made and two sentences did not hear about it.** Declaring a
> subject out of scope is a re-keying like any other, and the same rule applies: sweep every sentence
> that restates the thing, not only the section that defines it. Two survived in `04-flows.md`, both
> on the boot path, and both told a reader that a decommissioned station is a live wire condition:
>
> - `§2 A1 — Rejected` named *"station decommissioned"* as a **common cause** of a Boot `Rejected`,
>   alongside *"certificate revoked"*. Neither has a code in the set [§4.1](spec/07-errors.md#41-station--server-mqtt-actions)
>   assigns to BootNotification, so a reader who believed the sentence went looking for one and found
>   nothing.
> - the reconnect error table answered a Boot `Rejected` with *"SSP may have been decommissioned —
>   **await intervention**"* — the opposite of `CORE-011`, which is unlimited retry.
>
> **The revoked half was wrong on its own ground, independently of this decision.** A revoked
> certificate is refused at the **connection**, as `1004 CERTIFICATE_ERROR` — the code names *revoked*
> in its own row, and its recovery forbids entering provisioning mode or discarding credentials. A
> station refused there never sends a BootNotification, so it cannot receive the response this line
> was describing, and the two recoveries are not interchangeable. Both sites are corrected in
> `0.26.0`. **This is the same shape as instance 7 in the class below** — *"a second site survived
> that repair"* — which is now the third time this file has recorded it.
>
> **Not corrected, because it is not this decision's to make:** whether anything is required to
> *check* revocation, and with what freshness. `02-transport.md` §1.3 **MUST**s the broker to verify
> the chain; nothing states a revocation-check obligation, a CRL freshness bound, or soft-fail versus
> hard-fail. That is a real gap and a product decision, and it is not made by tidying a flow table.

---

## DECIDED (0.26.0) — nine sites required the server to emit a SecurityEvent, and the profile admitted no such thing

**Raised and decided 2026-08-28, adjudicating the station-refusal asks carried up from the reference
server.** This is instance **9** of the class below, and the first of its third sub-shape.

`profiles/security/security-event.md` described one thing, in every sentence it had. §1: *"sent by
the station"*. §2: *"**Direction:** Station to Server"*. §6 rule 1: *"The **station MUST** generate
a SecurityEvent for every security-relevant incident"*. §6 rule 3: the `timestamp` *"**MUST** reflect
the time the incident was detected **on the station**"*. §6 rule 7: the server stores all
*"**received**"* events. §8.2's worked example carries `"source": "Station"`.

**Nine normative sites require the server to emit one**, and none of them could be satisfied by an
implementation that read only the profile:

| Where | What it requires |
|---|---|
| `profiles/offline/authorize-offline-pass.md` §6 rule 7 | *"The server **MUST** log a SecurityEvent"* on authorize-time check #1 and check #10 — with (d) the `timestamp` **MUST** be *"when the validation failure was detected **by the server**"*, which is rule 3 inverted |
| `profiles/offline/reconciliation.md` §3 | the different-data `offlineTxId` collision **MUST** emit one |
| `profiles/offline/reconciliation.md` §6.3 | *every* applicable gate failure **MUST** emit one, *"at the gate-rejection point"*, with (d) the same server-side timestamp |
| `profiles/offline/reconciliation.md` §6.7 | the auth-form `(authId, sessionId)` replay reject **MUST** emit one |
| `07-errors.md` §3.2 — `2014`, `2015`, `2016`, `2017`, `2018` | five *Recommended Action* cells reading *"Server: log SecurityEvent [MSG-012]"* |

**And §6.4 of reconciliation leans its whole argument on it.** That section is the one that decides
the offline profile carries no `errorCode`: it says the failing gate *"remains identifiable, by two
routes"*, the second being the SecurityEvent that §6.3 *"already **MUST** emit"*. If that emission
is not something the server may perform, the second route does not exist and §6.4's reasoning fails
with it. The unconstructible rule was load-bearing for a decision that had already been taken.

**The profile had already contradicted itself, in one row, and nobody had read the two together.**
§4's `ServerSignedAuthReplay` entry ends *"The station rejects it at the handshake; **the server
logs this type at the next reconciliation**"* — a server-logged SecurityEvent, stated in the same
document whose §2 says the direction is Station to Server.

**What the implementations do, measured before deciding anything.** The reference server
(`csms-server`, HEAD `db1f89fd`) emits these as **audit rows and nothing else**:
`TransactionEventHandler` calls them *"the server-originated `OfflinePassRejected` SecurityEvent"*
in its own comments, dispatches an internal event, and `SecurityAuditLogger` does one
`INSERT INTO security_events`. Nothing is published to MQTT — there is no topic for it and no
station reads it. At authorize time it emits on exactly two checks, which is rule 7 obeyed
literally; at reconcile time it emits on every gate failure, which is §6.3 obeyed literally. **Both
readings are implemented, in the same server, because both rules are right and each is bounded by
its own gate.** The specification simply never said either of those things.

**Decision: scope the profile, change nothing on the wire.** `security-event.md` gains §2.1, naming
two origins — the station-originated wire EVENT, and a server-originated **audit record that is
never published**, which a server **MUST NOT** send to a station. Both validate against the one
existing schema, so nothing is added to the wire, no enum moves, no SDK re-vendors. Rules 1–6 are
scoped to the station form; rules 2 and 3 get their server-form counterparts stated where they
apply; rule 7 is widened to say the server's own records go in the same append-only log, under the
same retention, so an operator does not have to know which side detected an incident in order to
find it. `authorize-offline-pass.md` rule 7 keeps its prohibition and gains its scope — *at
authorize time* — with the reason the two gates differ written down: at authorize time a policy
refusal is a live decision a person can act on, at reconcile time it means money already moved and
the audit row is the only account that will exist.

**Why this and not the alternative.** The alternative was to delete the nine obligations and let the
server keep no record. That fails the only test that matters here: a fleet operator investigating a
forged settlement would have nothing to look at, and `reconciliation.md` §6.4 — which is the reason
the offline responses carry no `errorCode` — would lose the route it names. The obligations were
right. Only the document that defines their vehicle was silent.

---

## DECIDED (0.26.0) — Heartbeat listed four error codes its response cannot carry, and its own profile already said none of them arrive there

**Raised and decided 2026-08-28, from the reference server's station-refusal asks, where it is the
sharpest of the four: a REQUEST whose RESPONSE cannot say no.**

`heartbeat-response.schema.json` is `{serverTime}`, REQUIRED, `additionalProperties: false`. No
`errorCode`, no `errorText`, and — unlike the offline pair, which can at least answer `Rejected` —
no `status` either, so a Heartbeat rejection is not merely uncoded but **inexpressible**. §2.1 has
said so since the seven-schema table was written. §4.1 nonetheless listed `1005`, `1010`, `5106`
and `6001` under a heading reading *"which error codes can appear in the RESPONSE"*, and
`03-messages.md` §5.1 repeated the same four under a subheading reading *"Error Responses"*.

**The resolution was not a schema change, because none of the four was ever a response value.**
Each was checked against its own registry row and against `profiles/core/heartbeat.md` §8, which
gives all four conditions with their real behaviours and does not describe a single one as arriving
in a response:

| Code | What it actually is | Where it lives |
|---|---|---|
| `1010 MESSAGE_TIMEOUT` | raised by the **station** when no response arrives — a response carrying it would disprove it | Appendix B's timeout table, on the Heartbeat row already |
| `5106 CLOCK_ERROR` | a **station-side** clock condition, diagnosed *from* a successful response | `03-messages.md` §5.1: log it, and **SHOULD** send SecurityEvent `ClockSkew` |
| `1005 INVALID_MESSAGE_FORMAT` | a malformed REQUEST; its own *Recommended Action* is *"Log the malformed message"*, not *respond* | `02-transport.md` §11 |
| `6001 SERVER_INTERNAL_ERROR` | the only one a station could act on — and its recovery, *retry with backoff*, is what a station already does when a Heartbeat goes unanswered | nothing is lost by the silence |

So §4.1's Heartbeat row now reads *(none — a Heartbeat is never answered with an error)*, with the
four dispositions written out beneath it, and `03-messages.md` §5.1's *Error Responses* subheading
now answers **There are none**. The chapter is being reconciled to its profile, not decided against
it.

**Widening the schema was considered and rejected, on the rule that a repair must not block.**
An optional `errorCode` is backward-compatible for an emitter and **not** for a receiver: every
response schema is closed, so a station validating against an older vendored copy drops the widened
response as malformed — and a station that drops Heartbeat responses concludes it has lost the
server. That exact failure has already been measured once, on the offline pair, where serialising
the computed codes made a conforming station discard the whole reject and the refusal reached
nobody. A repair that breaks the healthy path is worse than the gap it closes.

---

## DECIDED (0.26.0) — a program-set drift at provisioning was sent to a code that cannot see programs

**Raised by the reference server and carried in its `KNOWN-ISSUES.md` as *"to report upstream to
`ospp/spec`; worked around here, not fixed here"*. Adjudicated 2026-08-28.** Instance **10** of the
class below, sub-shape one.

`04-flows.md`'s *Descriptive drift* rule divided the provisioning body in two and sent the whole of
the second half to one code:

> The **structural** members of `bays` — the `bayNumber` set and each bay's `programNumber` set —
> are **not** descriptive: they are the topology itself, and drift in them is a mismatch, **rejected
> at step 5 of *Error precedence* with `4020 BAY_COUNT_MISMATCH`**.

**Step 5 cannot see programs, and `4020` cannot say them.** Step 5 compares *"the set of `bayNumber`
values"* and nothing else. `4020`'s registry entry is scoped to that set in its own words and
**MUST** carry `details.declaredBayNumbers` and `details.registeredBayNumbers` — two members with no
program counterpart, and the entry additionally forbids carrying counts as the only content, so
there is nowhere to put a program set even informally. And the registry has no `MODEL_MISMATCH`, no
`UNKNOWN_MODEL`, nothing that means *"the program set you declared is not the one recorded"*.

**Decision: move the refusal, do not add a code.** The refusal already exists one step later, in a
better place. `3018 TOPOLOGY_MISMATCH` compares bay numbers **and** program ordinals
([`05-state-machines.md` §1.5](spec/05-state-machines.md#15-topology-at-boot)) and lands on
`Pending`, which keeps the command channel open for the repair. So the sentence is scoped to the
`bayNumber` half, a server **MUST NOT** refuse a provision on a program-set drift, and the program
half is named as first-boot business.

**Nothing is weakened by that, and the alternative is worse.** A `4020` at provisioning leaves the
station **without a certificate**: it breaks commissioning to punish a data disagreement, and the
station then cannot be reached to correct it. `3018` refuses the same disagreement from a state the
operator can act on. Adding a provisioning-time program code would have bought the earlier refusal
at the cost of the recovery — and would have been a registry addition and an SDK re-vendor for a
condition already caught.

**Still open, and deliberately not taken here.** What the server does with a program set that
drifted on a *replay* — replace the records, keep the originals, or record the divergence and do
neither — is not stated by this specification, and the reference server has chosen to record it and
let the first boot decide. That is a reasonable reading of silence, not a reading this document
licences, and it is the next thing to settle in this area.

---

## DECIDED (0.26.0) — the topology comparison never named its referent, and the literal reading made one retired bay stop a station selling

**Raised and decided 2026-08-28. This half-closes [the loop below](#open--a-station-whose-hardware-genuinely-changes-has-no-route-back-into-service-because-the-two-rules-that-guard-topology-point-at-each-other)** — read that entry first; it is where the option
space was written out, and this is option **2**, arriving from the implementation rather than from
the endpoint that entry expected.

Three sites compared a station's declared `bays[]` against a set they each named differently and
none of them defined:

| Site | What it said the referent was |
|---|---|
| `05-state-machines.md` §1.5 | *"the topology recorded for the station **at provisioning**"* |
| `04-flows.md` §2 step 5 | *"the set of bay numbers **registered** for the station the token is bound to"* |
| `07-errors.md` `4020` | *"the bays **registered** for the station"* / *"the **registered set**"* |

plus `3018`'s own row, `04-flows.md` A2a, and `boot-notification.md` §6.1 — which additionally
asserted *"Re-provisioning is what changes a station's topology"*, a sentence step 5 makes false in
every case where the hardware actually changed.

**A retired bay is still a registered bay.** Under the literal reading, a station that has one bay
physically removed declares a set that can never again equal the server's: `3018` and `Pending` on
every boot, for ever. And since §1.4 makes a `Pending` station refuse StartService and ReserveBay
with `3002` on **every** transport, that is not cosmetic — retiring one bay stops the whole station
selling, with no operator act able to clear it.

**Measured first.** The reference server compares against `bays WHERE retired_at IS NULL` at both
sites — `CertificateManager` for `4020` and `BootTopologyComparator` for `3018` — and says so at
the site: *"Retirement without this line is unshippable."* It keeps the reverse direction exact: a
station still declaring a bay the operator took out of service is still a mismatch. So the reading
that works was already built, and only the specification was ambiguous about which of the two
readings it meant.

**Decision: name the referent once and let the other sites cite it.** `05-state-machines.md` §1.5
defines the **in-service topology** — the bays the server currently records for the station, less
any the operator has taken out of service — and the five other sites point at it. The mechanism for
taking a bay out of service is **deliberately still undefined**: §4.4 lists every REST endpoint this
specification has and none of them adds or removes a bay. What is now defined is the **effect**,
which is the only part the two comparisons read.

**This is not a relaxation.** `4020` and `3018` still fire on exactly the disagreement they exist to
catch; they now have a referent instead of an implied one, and the direction that catches a lying
firmware is untouched. What changes is that a station whose operator has already corrected the
server-side record now boots clean — which is the escape the loop entry below said existed only
outside the protocol.

---

## CLASS — an obligation no field, no code and no actor can carry

**Named 2026-08-18, in the offline spec-contradiction cycle, because the pattern had recurred often
enough that each instance was being rediscovered from scratch.** This is an index, not a new
finding: every row below is recorded in full at its own link.

The shape is always the same. A rule is written, it reads as reasonable, and **nothing that exists
can satisfy it** — because the field it names is not on the wire, because the schema that would
carry it is closed, because the registry has no code for the refusal it mandates, or because the
actor it addresses cannot see what it asks about. The rule is not *unimplemented*; it is
*unimplementable*, and the difference matters: an unimplemented rule is a backlog item, while an
unimplementable one is a defect that will never surface as a failing test, because no conformant
implementation can get far enough to fail it.

**The tell is that a green suite proves nothing about it.** Nobody writes the negative case for a
rule they could not satisfy, so the gap is invisible from the test side and visible only by reading
the rule against the artefact that would have to carry it.

| # | Instance | What could not carry it | State |
|:--:|---|---|---|
| 1 | A station-scoped OfflinePass | `offline-pass.schema.json` has no member for `allowed_station_ids` and is `additionalProperties: false` at both levels | [B-2](#b-2--a-station-scoped-offlinepass-is-unrepresentable-in-the-authoritative-schema) — **BLOCKER, open** |
| 2 | UpdateFirmware to a `Pending` station **MUST** be `Rejected` | the `Rejected` needed an `errorCode` no registry entry supplies | [DECIDED 0.21.0](#decided-0210--updatefirmware-to-a-pending-station-was-refused-on-a-premise-the-same-chapter-contradicts-and-with-a-response-no-error-code-could-carry) — reversed |
| 3 | Dual signing across an `OfflinePassPublicKey` rotation | a single-valued registry key, a pass with no key identifier, and a pass not bound to a station on the wire — no choice serves both cohorts, and per-station selection is impossible at signing time | CHANGELOG `0.17.0` — closed by saying so |
| 4 | A station refusing for want of a trust anchor | no error code in the registry describes that refusal | [OPEN](#open--a-station-that-refuses-for-want-of-a-trust-anchor-has-no-code-that-fits-and-narrowing-1003-made-that-visible) |
| 5 | A firmware URL that is not HTTPS, refused by the schema | no error code in the registry describes that refusal | [OPEN](#open--a-firmware-url-that-is-not-https-is-refused-by-the-schema-and-no-error-code-in-the-registry-describes-that-refusal) |
| 6 | A `StatusNotification` rejection | `StatusNotification.conf` defines no fields, so the response cannot carry one | CHANGELOG — closed |
| 7 | **Settle-once correlated on `sessionId`** | the **pass-form** branch of both `transaction-event-request.schema.json` and `receipt-data.schema.json` sets `"sessionId": false`, closed by `additionalProperties: false` — and the pass-form is the only form the rule's Partial-B fallback case can arrive in | **closed 0.24.0** — re-keyed per form to `(authId, sessionId)` and `(offlinePassId, passCounter)`. **A second site survived that repair** and was closed in `0.25.0`: §8.2's forward-guard note still said `sessionId`-derived, and it is the only normative sentence an implementer of the unbuilt path reads. Re-keying a rule means sweeping every sentence that restates its key, not only the table that defines it. |
| 8 | **`5019 UPLOAD_FAILED`** | its condition cannot exist when the GetDiagnostics RESPONSE is sent (the machine is still in `Idle`), and the message that *does* report it — DiagnosticsNotification `Failed` — has `status`, `progress`, `fileName`, `errorText` and `additionalProperties: false`, so no `errorCode` | [OPEN](#open--5019-upload_failed-names-a-condition-that-cannot-exist-when-its-response-is-sent-and-its-real-carrier-has-no-code-field) |
| 9 | **The server emitting a SecurityEvent** — required at nine sites (`OfflinePassRejected` at eight, `ServerSignedAuthReplay` at `2018`) | the **actor**: `security-event.md` said *"sent by the station"*, *"Direction: Station to Server"*, and gave every processing rule to the station, so the message admitted no server-originated form at all | [DECIDED 0.26.0](#decided-0260--nine-sites-required-the-server-to-emit-a-securityevent-and-the-profile-admitted-no-such-thing) — closed by scoping |
| 10 | A **`programNumber`-set** drift at provisioning, asserted to be *"rejected at step 5 … with `4020`"* | step 5 compares `bayNumber` values only; `4020` **MUST** carry `details.declaredBayNumbers`/`registeredBayNumbers`, which have no program counterpart; and no registry code describes a program-set mismatch | [DECIDED 0.26.0](#decided-0260--a-program-set-drift-at-provisioning-was-sent-to-a-code-that-cannot-see-programs) — closed by moving the refusal, not by adding a code |
| 11 | A BootNotification **requested via TriggerMessage** reporting why it booted | the **enum member**: `bootReason` has 8 values, 7 name an actual boot and the 8th is defined as *"the firmware never restarted, only the MQTT session is new"* — and here the session is not new either. Not a corner case: `BootNotification` is one of only two triggers a **restricted** station may accept, i.e. the designed operator escape from `Pending` | **CLOSED 0.31.0** — by widening the *definition*, not the enum: `Reconnect` already meant *no boot occurred* |
| 12 | A session ended by **inactivity** reporting its reason | the **enum member**: `reason` is closed at 6 and none is inactivity. The chapter states the gap about itself — *"`SessionTimeout` is not fully specified, and this note is the specification of that fact"* — and declines the widening in the same breath | **CLOSED 0.31.0** — `Inactivity` added; the enum is widened, and the §8 note's other two gaps closed with it |
| 13 | A station **blocked fail-closed on a signing-mode mismatch** saying so | the **enum member**, and then the actor: `capabilities` carries 4 booleans under `additionalProperties: false` at both levels, so a fifth is forbidden — and the mode *is* readable by GetConfiguration, which is itself a signed message, so the only channel that can read it is the channel the mismatch closes | **CLOSED 0.31.0** — OPTIONAL top-level `messageSigningMode` on the one message a fail-closed station can still send |
| 14 | A **SecurityEvent that can be triaged** | no **shape**: `details` is REQUIRED and typed `{"type":"object","additionalProperties":true}`, so `{}` satisfies the requirement. The cost is already recorded in this file — `FirmwareDowngradeAttempt` names the offered version under two different member names and nothing can tell | **OPEN — declined 0.31.0.** The field is open, the prose exists, a fourth restatement changes nothing, and enforcement costs the largest vector radius in the set (17) |
| 15 | A stop **answered `Accepted` that did not physically stop** | no **field**: `stop-service-response` has `status` closed at `Accepted`/`Rejected`, `errorCode` required only on `Rejected`, and `additionalProperties: false` — the accepting arm has nowhere to say it. Settlement then runs on the self-reported duration | **closed 0.32.0** — discharged in two steps. `0.30.0` made rule 9 a **MUST** to report through a `HardwareFault` SecurityEvent carrying the `sessionId` and a `Faulted` StatusNotification, both of which existed already. The residue recorded here — *the settling response still cannot carry it* — is **refused** at `0.32.0` on a measurement, not left open: carrying it needs a session-status representation, and **0 of 86 schemas** define one. See instance 16, which is this defect on the activation path and was closed the same way |
| 16 | **A start that energised, whose outcome the next boot cannot determine** | no **field**, then no **arm**: `start-service.md` rule 9 mandates the pre-effect record and names its reader, and `05-state-machines.md` §3.5 partitioned the reboot on *recoverable* — an arm for a lost record and an arm for a resumable one, and none for a record that survives describing a delivery that does not. The terminal event cannot carry it either: `session-ended-event` **requires** `actualDurationSeconds` and `creditsCharged`, which were never measured, and its seven-value `reason` has nothing true | **CLOSED 0.32.0** — reported through the two messages that already exist (`start-service.md` rule 12, §3.5 rule 6), the mirror of instance 15. Both stronger remedies refused with their costs |

**Sixteen instances is what the written record supports**, counted by reading CHANGELOG and this file
rather than carried from a note; **five** are still open and one is a blocker — `0.31.0` closed three
(11, 12, 13) and `0.32.0` closed two (15, 16). The sub-shapes are still **four**, re-derived on the
table above rather than incremented: **nine** are a mandated refusal or report with no error code and
no response field to carry it (2, 4, 5, 6, 8, 10, 14, 15, 16); **three** are a rule keyed on a value
the authoritative schema forbids on the branch where the rule applies (1, 3, 7); **one** is a rule
addressed to an actor the artefact does not admit (9); and **three** are a rule that requires a
truthful value from a **closed enumeration in which no legal value is true** (11, 12, 13).
The four sum: 9 + 3 + 1 + 3 = 16.

**The remedies are now four, and the fourth arrived at 0.32.0.** `0.31.0` closed its three
enum-shaped instances three different ways — a new member (12), an existing member's definition
widened (11), a new field on the one message the condition does not silence (13). `0.32.0` supplies
the fourth and it is the one that adds nothing: **withdraw the demand.** Instance 16 could have taken
a new `SessionEnded.reason`; instead the rule requiring the event was scoped, because the value the
enum could not supply was one nobody had measured. A sub-shape named by the artefact that cannot
carry the value implies no single remedy, and **the cheapest remedy is sometimes to stop asking**.

**Instances 15 and 16 are the same defect on the two halves of one session**, which is why they
closed together and by the same route: a start that energised and cannot say what it delivered, and a
stop answered `Accepted` that did not stop. Both were found by reading a rule against the message
that would have to carry its report; neither was visible to any gate. **The second was easier to see
because the first had already been named** — which is the argument for this index existing.

**The fourth sub-shape was added at 0.30.0 and it is the one a schema check cannot see at all.** The
first two are found by reading a rule against a schema, and a schema check can be automated. The
enum sub-shape is invisible to every gate in this repository by construction: the payload validates,
the value is a legal member, the vector passes, and the only thing wrong is that the member is not
true of what happened. Nothing but reading the enum's own definitions against the situation the rule
describes will find it — which is why all three sat for releases behind green suites.

**The third sub-shape was named in this heading from the day it was written and had no instance
until now** — *"no field, no code **and no actor**"* — which is worth saying plainly, because a
category with no members reads as a completed enumeration rather than as an empty slot. It stayed
empty because it is the hardest of the three to see: the field and the code sub-shapes are found by
reading a rule against a schema, and a schema check can be automated. The actor sub-shape is found
only by reading a rule against the *prose* of the artefact it names — and the prose in this case was
in a different file, four directory levels away, and said nothing false about itself.

Instance 8 is the first where the carrier fails on **two independent grounds** — the condition is
unobservable at the moment the coded response is sent, *and* the message that can observe it carries
no code. Either alone would have been enough. That is worth naming because the first ground is
invisible to a schema check: nothing in `get-diagnostics-response.schema.json` is wrong, and the
code sits legitimately in its `errorCode` enum-free integer. Only the state machine says the
condition cannot have arisen yet.

**What to do when the next one appears.** Do not weaken the rule to whatever happens to be
expressible, and do not delete it. Ask first whether some *other* value already on the wire carries
the same meaning — instance 7 closed that way, on a pair the schema already required be globally
unique, so the repair added no field and no version of anything. Only when nothing carries it is the
question a real design decision, and then it belongs here with its cost rather than in the rule.

---

## OPEN — 4xxx grouping: the provisioning codes sit under a payment heading, and the SDKs derive `category` from the range

**Raised 2026-07-28, opening `4.02x`. Recorded rather than fixed: renaming a section heading is
not within the arc that found it, and the wire-visible half needs a cross-SDK decision.**

Three layers disagree about what the `4xxx` range holds.

1. **`spec/07-errors.md:334` — `### 3.4 Payment & Credit Errors (4xxx)`**, whose intro at `:336`
   reads *"Payment errors cover wallet balance, credit limits, payment processing, refunds, and
   offline spending constraints."* Eleven of its codes are provisioning or certificate codes and
   none of them is any of those things.
2. **`spec/07-errors.md:350` — `#### 4.01x — Certificate Management Errors`** holds `4010`–`4019`.
   Only `4010`–`4014` are certificate codes; `4015`–`4019` are provisioning codes
   (`PROVISIONING_KEY_MISMATCH`, `PROVISIONING_KEY_REUSE`, `PROVISIONING_REQUEST_INVALID`,
   `PROVISIONING_TOKEN_CONSUMED`, `PUBLIC_KEY_INVALID`). The new `4.02x — Provisioning Errors`
   is named for its contents, which makes the older mislabelling more visible, not less.
3. **The SDKs derive `category` arithmetically from the numeric range.** In
   `ospp-sdk-php`, `src/Enums/OsppErrorCode.php:143-155`:

   ```php
   public function category(): string
   {
       return match (intdiv($this->value, 1000)) {
           1 => 'transport', 2 => 'auth', 3 => 'session',
           4 => 'payment',  5 => 'station', 6 => 'server',
           default => 'unknown',
       };
   }
   ```

**This third one has teeth: it is wrong on the wire, not merely in a heading.** Every
provisioning code reports `category: "payment"` — `4015`, `4016`, `4017`, `4018`, `4019` and now
`4020`. A consumer routing or filtering by category files a station-provisioning failure as a
payment failure. Verified at runtime against `ospp/protocol v0.8.3`.

`category` is **not** one of the seven REQUIRED Error Object fields (`07-errors.md:62-68`), so
this does not make an emitted envelope non-conforming today. It is wrong wherever a consumer
reads the accessor, which is why it is recorded as a defect rather than a cosmetic note.

**Not decided here**, and deliberately so — each option has a cost this arc cannot weigh:
renaming `§3.4` touches every cross-reference to it; re-ranging the provisioning codes out of
`4xxx` is a breaking change to a published vocabulary; making `category` a per-code property
rather than a derived one is a cross-SDK change (PHP and TS must agree, or the same code reports
two categories). Whichever is chosen, the arithmetic derivation is the part that must stop.

The finding directly below generalises this one: `category` is one of **two** accessors that
answer a question the spec declines to define, and they should be decided together.

---

## OPEN — `httpStatus()` and `category()` model properties the spec declines to give a code, and the two SDKs invented different answers

**Raised 2026-07-29 during the SDK 0.9.0 release, by enumerating both SDKs' registries against
each other. Recorded rather than fixed: the question is not which mapping is right, and settling
it is a cross-SDK and spec decision, not a release task.**

Both SDKs expose an accessor mapping an error code to an HTTP status, and one mapping it to a
category. **The spec defines neither as a property of a code.**

On status, `07-errors.md` §4.4 is explicit — the paragraph is headed *"The status is not a
property of the code"*:

> §2.4's mapping table is headed *Typical Error Codes* and groups codes by the status they are
> usually seen with; **it is illustrative and assigns no code a fixed status.** Nothing in §3
> carries an HTTP status column. A code and a status answer different questions — *what failed*
> and *how the client should treat this response* — and **one code can honestly appear with more
> than one status** where the same fault is reachable in states the client must treat differently.

On category, see the finding above: the spec has section *headings*, not a per-code category, and
both SDKs derive one arithmetically from the numeric range.

**Both SDKs invented answers anyway, and invented different ones.** First enumerated at
`ospp-sdk-php` v0.8.4 + `sdk-ts` v0.7.0 working trees, 114 codes each. **Re-measured 2026-08-12
against `sdk-ts` 0.13.0 and the current `ospp-sdk-php` tree: 118 codes each**, matching the
registry — the earlier figure was a dated measurement, not a disagreement, and it went stale as
the registry grew from 114 to 118 (`3xxx` 17 to 20, `6xxx` 8 to 9). The finding itself is
unchanged; only the counts moved:

| Field | Result |
|-------|--------|
| code numbers, names | identical |
| `severity`, `recoverable` | identical — 0 diffs |
| category *partition* | identical — 15 / 20 / 20 / 20 / 34 / 9 (was 15 / 20 / 17 / 20 / 34 / 8 at 114) |
| category *label* | **differs**: `5xxx` is `station` (PHP `OsppErrorCode.php`) vs `Hardware` (TS `OsppErrorCode.ts`) — still divergent at the 2026-08-12 re-measurement |
| `httpStatus` | **41 of 118 disagree** — re-derived 2026-09-05; **42** before this release's SDK repair, see below |

**Re-measured at 0.32.0 by dumping both registries and joining them, and the figure in this table
moved twice.** It read *51 of 114*: the denominator was two registry growths stale, and the
numerator was 51 when written and is **42** now, because `0.9.0` and the releases after it kept
adding PHP arms. Both halves are re-derived here — 118 codes each, identical code sets and
identical names — not carried. **42** disagreements before this release, **41** after: the `2008`
repair below moved one, and re-derivation after the change confirmed it moved exactly one.

The 42 split into two kinds, and **only two codes were a disagreement about fact:**

1. **A default standing in for an answer — 40 of the 42, and now 40 of the 41. This is a different
   shape from a disagreement.** PHP has no arm and falls to its documented `default => 500`; TS asserts a
   specific status. Nobody chose `500` for `1014 MESSAGE_TOO_LARGE` or `5017 INSUFFICIENT_STORAGE`
   — a fall-through produced it, and a fall-through is not a second opinion. It is **one library
   answering and one declining to**, which is why counting all 42 as *divergence* overstates the
   conflict by a factor of twenty: there is no case here where two implementers read the same
   sentence and disagreed. TS's own registry docblock concedes its 40 are *"sensible defaults
   derived by category/semantics (SDK extension)"*, and it emits `410`, `413`, `501` and `507` —
   statuses PHP never produces for any code. **The remedy differs accordingly**: a disagreement is
   settled by deciding, a fall-through by removing the accessor or by declaring every value, which
   is what the open question below actually asks.
2. **Both chose, and chose differently — exactly 2 of 118**: `2001 STATION_NOT_REGISTERED`
   php=`422` ts=`401`, and `2008 ACTION_NOT_PERMITTED` php=`401` ts=`403`. **After this release
   there is exactly one**, `2001`. Re-derived after the SDK edit, not predicted.

**`2008` is settled at 0.32.0 and `2001` is not, and the difference is instructive.** `2008` was
the one code of the thirty §2.4's table names that appeared under two statuses — measured across
all 31 code–status pairs — and it is now decided against `401` by [the multi-status
rule](#decided-0320--2008-was-listed-under-two-statuses-and-the-licence-that-permitted-it-could-not-be-broken).
`2001` is a different defect and remains open here: it is named by **no row of that table at all**,
which is the `3003` shape — a silence, filled twice. Those two are not the whole of it either.
**88 of the 118 registry codes are named by no row**, so the table decides 30 and delegates 88; the
0.32.0 rule constrains how it may *speak*, not how much it says.

**The accessor's shape was also wrong, and that argument is now spent.** Until 0.32.0 `2008` showed
that no function from code to status could be correct, because one code carried two. It no longer
carries two. The shape argument survives on `§4.4`'s licence rather than on this instance: a code
that *is* reachable in two states the client must treat differently keeps both rows, and such a code
still cannot be represented by a total function. What has changed is that there is currently no such
code, so the objection is now to a permitted future rather than to the present contents.

**Nothing consumes either accessor for a decision.** Checked at the time of writing:
`ts-station-simulator` references neither `httpStatus` nor `OSPP_ERROR_REGISTRY`. `csms-server`
calls `httpStatus()` from exactly two production sites — `app/Shared/Protocol/ErrorCodeRegistry.php:147`
and `app/Shared/Protocol/Rest/OsppErrorObject.php:124` — both as a *fallback* under `??` or a
`match` default, never as the primary answer. So the blast radius of changing or removing these
is small, and it is small **now**.

**The open question is therefore not "which mapping is right".** It is:

1. **Should these accessors exist at all?** An SDK answering a question the spec declines to
   define invites consumers to treat the answer as protocol. Neither accessor's value is carried
   on the wire — `category` is not among the seven REQUIRED Error Object fields
   (`07-errors.md:62-68`), and the status is a property of a *response*, chosen by the server that
   knows the state, not of the code.
2. **If they do exist, should each code declare its values in the registry rather than have them
   inferred?** Both defects have the same shape: a value derived by rule — arithmetic on the range
   for `category`, a `match` default for `httpStatus` — rather than stated per code and reviewed.
   A declared registry makes a wrong value a visible edit; a derived one makes it invisible until
   enumerated, which is how these accumulated unnoticed across two published SDKs — and why the
   count in the table above had to be re-derived twice rather than read.

**Superseded instruction, recorded so it is not re-attempted.** An earlier arc (C2) directed that
PHP's `httpStatus()` return `null` instead of defaulting to `500`, with the return type widened so
callers must handle it. It was never implemented. It is now **withdrawn**: it predates the §4.4
language above, and once the spec declines to make status a property of a code, returning `null`
for the codes the spec does not map is a smaller instance of the same error — it still asserts a
total function from code to status, merely with a hole in it. `0.9.0` ships `httpStatus()` as
`int`, documented in the release notes as a divergent SDK extension rather than a contract.

**What 0.9.0 did change**, and deliberately: four PHP codes that fell to the `500` default now
answer as TS already did — `4008`→`401`, `3002`→`409`, `3007`→`409`, `6007`→`503`. Each is cited
to §4.4's endpoint table, and `6007`→`503` matches the `MUST` that §4.4 states outright. This
reduced the divergence from 55 codes to 51 at the time. Re-derived at 0.32.0 the figure is **42**,
so the same repair has continued since; it does not resolve the finding, because 40 of the 42 are
still a `500` default standing in for an answer.

---

## OPEN — two messages carry `errorDescription` semantics under the name `errorText`

**Raised 2026-07-29, adding the `UPPER_SNAKE_CASE` pattern to every `errorText` that pairs with
an `errorCode`. These two were deliberately left out of that change, because fixing them is a
breaking schema change and a naming decision this specification has to make. Recorded in full so
whoever takes it has the whole set rather than rediscovering it.**

§1.3 defines `errorText` as *"Machine-readable error name in `UPPER_SNAKE_CASE` (e.g.,
`BAY_BUSY`). **Stable across versions — clients MAY use this for programmatic matching.**"* It is
a **per-code** field: §1.3's own table marks it `Source: per-code`, meaning it is derivable from
`errorCode` via the §3 registry and carried only so a receiver need not perform the lookup.

**Two schemas declare `errorText` with no `errorCode` anywhere in the message.** They are
therefore not carrying the §1.3 pair at all — there is no code for the name to be derived from,
and nothing for a client to match against:

| Schema | `errorText` | `errorCode` |
|---|---|---|
| `schemas/mqtt/diagnostics-notification.schema.json` | `{"type":"string","maxLength":128}` | **absent** |
| `schemas/mqtt/firmware-status-notification.schema.json` | `{"type":"string","maxLength":128}` | **absent** |

**Every example and vector for these two carries per-occurrence prose**, which is exactly what
§1.3 defines `errorDescription` to be — *"Human-readable description of **this occurrence** and
its context — the bay, field, threshold, or identifier involved."* The full set:

*Conformance vectors (both `valid/`, both still passing — the pattern was not applied here):*

| File | Value |
|---|---|
| `conformance/test-vectors/valid/device-management/firmware-status-notification-full.json` | `"Checksum verification failed after download, expected sha256:a3f7b2c1 but computed sha256:e8d9c0b1"` |
| `conformance/test-vectors/valid/device-management/diagnostics-notification-full.json` | ~~`"Upload in progress to remote server"`~~ — **removed in `0.23.0`** |

*Markdown examples:*

| Location | Value | Message |
|---|---|---|
| `spec/03-messages.md:1745` | `"Checksum mismatch after download"` | FirmwareStatusNotification |
| `spec/profiles/device-management/firmware-status.md:141` | `"Download failed: connection timeout after 30s on https://firmware.example.com/v2.4.0.bin"` | FirmwareStatusNotification |
| `spec/profiles/device-management/diagnostics-status.md:60` | `"HTTP PUT returned 503 Service Unavailable"` | DiagnosticsNotification (narrative, not a JSON block) |

The first vector settles what the field is being used for: a value containing two runtime SHA-256
digests cannot be a stable per-code name, and no registry entry could ever supply it.

**Updated `0.23.0` — one of the two carried a second, separate defect, and that one is closed.**
The diagnostics vector carried its prose on `"status": "Uploading"`, a state that is not a failure
at all, while `diagnostics-status.md` bound `errorText` to `Failed`. The schema expressed no such
condition, so the vector shipped as **valid** and nothing could have said otherwise.
`diagnostics-notification.schema.json` now requires `errorText` on `Failed` and forbids it on the
other three, with four negative vectors exercising both directions, and the offending vector has
been reworked. **The naming question above is untouched by that**: `errorText` on this message is
still per-occurrence prose where §1.3 defines a per-code name, and the same is true of
`firmware-status-notification`, whose `errorText` remains unconditioned. What closed is the
conditional violation; what is open is the name.

**The contrast is inside the same family.** `status-notification.schema.json` declares **both**
`errorCode` and `errorText`, and its vector carries `errorCode: 5008` with
`errorText: "SENSOR_FAILURE"` — the §1.3 pair, used correctly, in a notification. So this is not
"notifications differ from responses". It is these two messages specifically.

**Why it matters beyond tidiness.** A client written against §1.3 may match on `errorText`
programmatically. On these two messages that match is against free prose that varies per
occurrence, so it silently never fires — and the schema cannot warn, because a `maxLength`-only
string accepts anything. This is the same failure mode that let a raw validator diagnostic reach
firmware on `sign-certificate-response` (fixed 2026-07-29); it survives here because the field is
misnamed rather than merely unconstrained.

**Not decided here**, and each option has a cost this arc cannot weigh:

1. **Rename to `errorDescription`** — most correct against §1.3, and breaking: the member name
   changes on two messages, both schemas are `additionalProperties: false`, and every emitter and
   consumer of them must move together.
2. **Add `errorCode` and make `errorText` the registry name** — keeps the member names, but
   requires registry codes for conditions that may not have one (`"Upload in progress"` is not an
   error at all), and changes what the two messages mean.
3. **Document these two as a deliberate exception to §1.3** — cheapest, and the worst of the
   three: it makes `errorText` mean two different things depending on the message, which is
   precisely what a client matching programmatically cannot discover.

Whichever is chosen, the pattern added elsewhere on 2026-07-29 should extend to these two once
the field means what §1.3 says.

---

## CLOSED (0.8.0) — an in-scope endpoint has failure modes the registry cannot express, and §4.4 lists no 5xx

**Raised 2026-07-28 implementing the flat envelope on `POST /api/v1/stations/provision`.
Closed 2026-07-28 in [`07-errors.md` §4.4](spec/07-errors.md), by the third of the three options
below — the one this entry called "the smallest and probably right".**

**Resolution.** §4.4's per-endpoint lists are now stated to be the set the specification
*models*, not an enumeration of what a server may emit, with two obligations outside them: the
body **MUST** still be the Error Object carrying the closest registry code, and the status
**MUST** be the true one, never downgraded to match the list. The premise that the registry
"maps `6007` to 500" turned out to be false — §2.4's table is headed *Typical Error Codes*, it
never lists `6007` at all, and no registry row carries an HTTP status. The 500 came from SDK
defaults, not from this specification. So `6007` with `503` + `Retry-After` needed no new code
and no per-code status variance: it needed §4.4 to stop reading as exhaustive. `6007` + `503` is
now the worked example in that section and is **required**, not merely permitted.

The reference implementation's divergence is retired by this: it is now the conforming answer,
and the call-site note recording the divergence can go.

The other two failure modes this entry raised are **not** closed by it and remain unmodelled by
choice: a request body over the transport limit (`413`) and a maintenance window (`503`) are both
deployment conditions rather than protocol ones, and §4.4 now says explicitly that a server
answering them is not thereby non-conforming.

*Original entry follows.*

`07-errors.md:227` makes `errorCode` REQUIRED on every error of an endpoint this specification
defines, and `:509` lists this endpoint's statuses as **400, 401, 409, 422**. A real server on
that endpoint also answers:

| condition | what the server must say | what the registry offers |
|---|---|---|
| crypto material missing (CA key/cert unreadable) | `503` + `Retry-After` — transient, operator-fixable, and the station acts on the hint | `6007 SERVICE_DEGRADED`, which the registry maps to **500** |
| unhandled server fault | `500` | `6001 SERVER_INTERNAL_ERROR` — fits, but 500 is not in `:509` |
| request body over the transport limit | `413` | **nothing.** `1014 MESSAGE_TOO_LARGE` is a transport code for MQTT/BLE, not REST |
| server in a maintenance window | `503` | **nothing** |

The first is the sharp one. A server that downgrades its 503 to 6007's registry 500 to satisfy
the mapping **loses information the station uses** — 500 invites a retry with backoff, while
503 + `Retry-After` states when. The reference implementation therefore emits `503` with the
`6007` body and marks the divergence at its call site rather than resolving it silently. That is
a defensible local choice; it should not become precedent by inheritance.

**The gap is `:509` listing no 5xx, not the server exceeding it.** An endpoint whose statuses the
specification enumerates, but whose real failure modes exceed that list, forces every
implementation to invent the same answer independently — which is what the enumeration exists to
prevent.

**Not decided here.** Options, each with a cost: give `6007` a status that varies by context
(breaks the per-code fixity that makes the registry derivable); add REST codes for
payload-too-large and maintenance (extends the vocabulary toward transport concerns the
boundary at `:233` deliberately excludes); or state that `:509`'s status list is the set the
specification *models* rather than the set an endpoint may *emit*, and say what a server should
do outside it. The third is the smallest and probably right, but it is a change to what §4.4
means and belongs in a revision, not a patch.

Related: the same envelope work found that Laravel-class frameworks reject some requests before
routing resolves, so a server cannot always know whether a failing request was even *on* the
specification's surface. That is an implementation concern rather than a spec one, and is
recorded in csms-server's KNOWN-ISSUES; it is noted here only because both stem from the same
question — what the envelope obliges for failures that are not really the endpoint's.

---

## OPEN — no conformance case exercises the provisioning success path from the station's side

`POST /api/v1/stations/provision` is named by three conformance cases and covered from one
direction only.

`TC-SEC-005` and `TC-SEC-006` both open "Verify that the **server's** provisioning endpoint
…". They are server-side cases: a harness posts crafted bodies and checks status, `errorCode`,
`details.phase`, precedence between `4010`/`4019`/`4016`/`4015`, and that a rejection consumes
no token and mints no certificate. `TC-DM-003` no longer reaches provisioning at all: its Part C existed only as the recovery leg
of a Hard reset, and the remote credential wipe left the wire in the 2026-08 reset arc. So the
gap this issue describes is now wider than when it was raised, not narrower.

**What no case covers.** The station's own conduct on the path where nothing goes wrong:

- that the complete key set is committed to NVS **before** the first POST, and the *same* keys
  are resubmitted on every retry (`04-flows.md` §2, *Persisting the key set*, and happy-path
  step 6b) — the repair for the incident that motivated 0.8.0's provisioning work, and the one
  station behaviour with no test at all;
- that the CSR's Subject CN is the `stationId` the station was configured with;
- that the three submitted keys are pairwise distinct and each is a fresh on-device P-256 key;
- that the response's trust and configuration fields are persisted **exactly as received**,
  replacing what was held, **including on a replay** (`04-flows.md` §2, *Persisting the
  response*) — the obligation that section calls "the one firmware is most likely to skip";
- that the `bays` array's explicit `(bayId, bayNumber)` pairing is consumed as the bay-number
  mapping, observable at the first StatusNotification after boot;
- that `mqttConfig` is honoured on connect, with `keepAliveSeconds` taken from the response and
  the Client ID fixed to `{stationId}` regardless of what was advertised (`02-transport.md`
  §1.2).

**Why the absence went unnoticed.** The error paths are tested unusually well. `TC-SEC-005` runs
seven parts and `TC-SEC-006` seven more, between them covering every provisioning error code and
the full precedence chain — enough that "provisioning" reads as covered in the Test Case Index
and in the compliance-level tables. What they cover is the **server's** half of the failure
modes. Neither the index nor the profile tables distinguish the two directions, so a station
implementer scanning for provisioning coverage finds two dense cases and no indication that
neither tests a station.

**Not built here.** It is a pre-existing gap rather than a consequence of the 0.8.0 repairs, and
it is a new case — plausibly two, one for first provision and one for the retry and replay
behaviour — with its own harness requirements: the harness must act as the provisioning
endpoint, must be able to cut the response to test the persist-before-POST rule, and must
inspect station-side NVS or infer it from the next connection. That deserves its own scoping
rather than being absorbed into a repair pass.

---

## CLOSED (0.30.0) — `StationIdentityCertificate` is named as a ChangeConfiguration key but is not in the Chapter 08 registry

`06-security.md` §6.5.2, *Issuance, delivery, and rotation*, defines how the BLE StationIdentity
certificate reaches the station:

> "**Delivery to the station.** Provisioning response, and thereafter ChangeConfiguration [MSG-013]
> (key `StationIdentityCertificate`) for re-issuance — mirroring `OfflinePassPublicKey`
> distribution (§6.7)."

and `provisioning-response.schema.json` repeats it in the `stationIdentity` description. But
`StationIdentityCertificate` does not appear anywhere in `08-configuration.md`, whose §2–§6
tables are the registry of standard keys — **28** of them, and this is not one.

`08-configuration.md:47` then decides the outcome:

> "If a station receives a ChangeConfiguration request for a key it does not recognize (neither a
> standard key from Sections 2--6 nor a recognized `Vendor_` key), that key's `results` entry
> **MUST** carry `status: "NotSupported"`, and no key in the request is applied."

So a **conforming** station **MUST** reject the re-issuance write, and the rotation path §6.5.2
depends on cannot complete. The certificate still arrives at first provisioning, so the defect is
confined to re-issuance — which is exactly the path §6.5.2 says the server relies on, since
`expiresAt` "SHOULD be short" and "the server re-issues before expiry".

**One column is no longer a decision: the value fits.** The obvious objection to minting this
key is that a configuration value is a `string`, bounded at **500 characters** by
`08-configuration.md` §1.2 and by `maxLength: 500` on `change-configuration-request.schema.json`'s
`keys[].value` — and a certificate does not fit in 500. **Measured, this one does.** A StationIdentity
is not X.509; it is the JSON object of §6.5.2 (`stationId`, `organizationId`, `stationPubKey`,
`issuedAt`, `expiresAt`, `signatureAlgorithm`, `signature`), and the signed instance carried in
`conformance/test-vectors/crypto/ble-handshake-keyschedule.json` — the same bytes as
`examples/payloads/ble/challenge.json` and both `challenge-*` vectors — serialises compact to
**364 characters**. That is 136 under the bound, and the margin survives the widest identifiers the
patterns admit: `organizationId` there is `org_f10717404764df62` where §6.5.2 gives `org_<uuid>`,
worth about 20 more. For contrast, the artefacts this specification *does* size as certificates are
bounded an order of magnitude higher — `clientCert` at 8192, `CertificateInstall.certificate` at
16384 — so the 500-character ceiling is a real constraint that this particular artefact happens to
clear, not one that was never tested.

**CLOSED at 0.30.0.** The key is registered as **#29**, in §4 Security and in the §9 summary, with
the four open columns decided:

| Column | Value | Why |
|---|---|---|
| Access | `W` | Mirrors `OfflinePassPublicKey`, which is what §6.5.2 says this key does. **Not** for confidentiality — the station presents this artefact to any BLE peer during the handshake — but because a station's held identity is confirmed by completing a handshake, not by echoing 364 characters back through the configuration channel on every GetConfiguration |
| Mutability | `Dynamic` | A re-issued identity has to be usable without a reboot; §6.5.2 relies on re-issuance *before* expiry, and a reboot requirement would make the overlap window depend on an operator |
| Type / Range | `string`, 1--500 chars | The measurement above: 364 characters, 136 under §1.2's bound |
| BLE-only? | **No — Security profile** | §6.5.2 names `OfflinePassPublicKey` as the mirror, and that key is Security. A station that does not support BLE simply never receives a write |

The overlap-window question is **not** decided here and does not need to be: §6.5.2 already governs
what a station does with the previous certificate, and registering the key changes nothing about it.

**What this closes is a CLASS instance, not a transcription.** A conforming station was obliged by
§8.2 rule 3 to answer `NotSupported` to the rotation Chapter 06 requires — and, because the batch is
atomic, to apply nothing else in the same request. The specification mandated an operation every
conformant implementation had to refuse. **Zero `schemas/` bytes**: no schema names any configuration
key (`grep -rlF HeartbeatIntervalSeconds schemas/` = 0 files), `change-configuration-request` types
`key` as a free string. The cascade is through the transcribed 28-key enums in both SDKs and the
server's registry, which become 29.

Found by a sweep of the Chapter 08 key table for keys whose delivery channel does not exist. That
sweep also confirms the table is otherwise sound: **28** keys, counts agreeing across
`08-configuration.md` §9's summary and the §1.5 profile grouping; the three keys with no
default (`FirmwareVersion`, `CertificateSerialNumber`, `OfflinePassPublicKey`) each have a
working source; and no key encodes `stationId` or any other certificate-bound identity, so no
configuration write can alter what the client certificate binds.

---

## OPEN — `retryInterval` and `BootRetryInterval` are one quantity with two legal ranges, and the schema states only a floor

`08-configuration.md` §1.6 states that a quantity carried both by a registry key and by a
dedicated wire field is bound by both constraints, and that where they disagree the schema
governs. **This is the pair where that rule cannot simply be applied.**

`BootRetryInterval` is `10--600` in the registry (`08-configuration.md:90`).
`boot-notification-response.schema.json` bounds `retryInterval` at `"minimum": 1` with **no
maximum**. `05-state-machines.md:71` binds the two explicitly — *"The interval from the
response has passed (default 30 s, `BootRetryInterval`)"* — and both carry the default 30. A
schema-conformant server may therefore send `retryInterval: 1`, or `86400`, either of which
the key's own range forbids. There is **no precedence rule** for this pair, unlike the
heartbeat pair, which had one in `03-messages.md`.

**Why the heartbeat resolution does not transfer.** `0.16.0` closed the
`HeartbeatIntervalSeconds` / `heartbeatIntervalSec` disagreement by widening the registry to
the schema, on the grounds that the schema is what validates and that `heartbeat.md` §5 had
already been clamping to the schema's lower bound. Neither ground holds here:

- `heartbeatIntervalSec` declares **both** bounds — one of only **6** integer properties in
  all of `schemas/mqtt/` that do, against **17** that declare a minimum and no maximum. Two
  bounds is a considered range; a bare floor is the shape a JSON Schema author writes to mean
  "a positive integer". Widening the registry to *this* schema would yield `1--unbounded`,
  which deletes the constraint rather than correcting it.
- Nothing clamps or validates `retryInterval` anywhere. A grep of `spec/`, `guides/` and
  `conformance/` for a rule bounding it returns nothing, so there is no behaviour already
  assuming the lower floor the way `heartbeat.md:35` assumed 10.
- The corpus does not force the question either way: every `retryInterval` in
  `conformance/` and `examples/` is **30, 60 or 300** — all inside `10--600`. So unlike the
  heartbeat case, tightening the schema would invalidate **nothing that exists**.

**The option space.** Tighten the schema to `minimum: 10, maximum: 600`, matching the
registry — cheap against the corpus, but still a wire-narrowing change that makes
non-conforming any server emitting outside it; or widen the registry to `1--` with no upper
bound, accepting that the key stops constraining anything; or give `retryInterval` its own
documented range independent of `BootRetryInterval` and state the precedence between them,
which is the only option that keeps both constraints meaningful. Recording rather than
picking, because all three change what is legal on the wire.

`tools/check-config-ranges.py` holds this at `BASELINE = 1`.

---

## CLOSED (0.16.0) — the Device Management profile was Required in Chapter 08 and RECOMMENDED-not-mandatory in its own README

`08-configuration.md:72` marked the **Device Management** row **Required: Yes**,
unconditionally, while `profiles/device-management/README.md` §1 called the same profile *"a
RECOMMENDED (not mandatory) profile"* and §3 *"RECOMMENDED but OPTIONAL. A station is not
required to support it"*, gating every rule on the `deviceManagementSupported` capability —
which `boot-notification-request.schema.json` makes optional. One name, two requirement
levels.

**Resolved in favour of the capability**, matching the Offline / BLE row of the same table
and the treatment `f872b23` had already applied to nine conformance cases. §1.5 now reads
*"Conditional (required if `capabilities.deviceManagementSupported = true`)"*.

The difficulty recorded when this was opened — that the README governs **nine actions** while
§1.5 governed **four keys** at the time (three since `0.23.0`), so the two might need separate answers — was examined and does
not survive. The keys have no protocol surface independent of the actions:
GetConfiguration and ChangeConfiguration are themselves Device Management actions, so a
station not declaring the capability can be neither asked for these keys nor told to set
them. Two of them at the time, `FirmwareUpdateEnabled` and the since-withdrawn `DiagnosticsUploadUrl`, were switches for
Device Management actions such a station does not implement and govern nothing without them.
The only surviving path is the BootNotification `configuration` block, which is Core — and
§8.3 was extended in the same release to say what a station does with a key it does not
support, since making a profile conditional is what first made "a standard key the station
does not support" reachable at all.

---

## OPEN — the online money path carries only a symmetric MAC, and a symmetric MAC proves nothing to a third party

**Raised 2026-08-05, by the signing arc. Scoped and deliberately not written: it is a decision,
not a clause, and the scope below is why.**

[Chapter 06 §5.8](spec/06-security.md) now states plainly that the HMAC provides **no
non-repudiation** — the server holds the key it verifies with, so it can produce any MAC a station
could. That is correct and it is the honest position. It also leaves the online money path with no
evidence a third party can check.

OSPP already owns the right instrument and does not use it here. [§6.2](spec/06-security.md)
defines ECDSA P-256 transaction-receipt signing with a private key **the station alone holds**, and
[`provisioning-request.schema.json`](schemas/provisioning-request.schema.json) requires
`receiptSigningPublicKey` of **every** station — deliberately, including stations that will never
run an offline session. Today nothing in the Core, Transaction or Security profiles reads that key.
It is wired to the offline path only.

### What extending it would touch

| Surface | What changes | Size |
|---|---|---|
| **Messages** | `SessionEnded` [MSG-040] and `StopService` RESPONSE [MSG-006]. These are the online money path: `SessionEnded.creditsCharged` is the sole billing source when no StopService was issued, and the StopService RESPONSE is the billing source when one was. `TransactionEvent` is **not** in scope — it already carries a signed receipt, and it is offline-only (`offlineTxId` and `txCounter` are both required) | 2 messages |
| **Schemas** | A `receipt` member on both, plus a conditional making it required — on `SessionEnded` unconditionally, on `stop-service-response` only when `status` is `Accepted`, which is a shape that response does not currently have (its only required member is `status`) | 2 schemas + 1 new conditional |
| **Receipt structure** | **It cannot carry this unchanged.** [`receipt-data.schema.json`](schemas/common/receipt-data.schema.json) is a two-way `oneOf` — pass-form and auth-form — and *both* require `offlineTxId` and `txCounter`, neither of which an online session has. A third **online-form** is needed, keyed on `sessionId`, and the reconcile gate branches on which form is present, so [`reconciliation.md` §6.1](spec/profiles/offline/reconciliation.md) has to learn a form it must never see | 1 new discriminated form + gate branch |
| **Station** | Sign one more canonical body with a key it already holds, using a code path it already implements. The new cost is **when**: an ECDSA P-256 signature now lands on the StopService RESPONSE path, inside that action's 10-second timeout, where nothing asymmetric ran before. Software P-256 on an ESP32-class part is tens of milliseconds and a secure element is faster, so it fits — but it is on the response deadline, not on a background flush | Bounded, on a new deadline |
| **Server** | Retain the receipt **and the public key it verifies against**, for as long as the transaction is auditable. That obligation does not exist today: `CertificateSerialNumber` is single-valued by design, [§4.7.6](spec/06-security.md) bounds certificate multiplicity but says nothing about retaining a **superseded receipt-signing key**, and a receipt signed before a rotation is unverifiable afterwards without one. This is the largest new requirement and it is a data-retention rule, not a protocol field | New retention obligation |
| **Conformance** | New cases. The existing offline cases verify offline receipts; nothing exercises an online one | 1–2 new cases |

### Why it is not a clause

Three of those six are structural: a new discriminated form in a schema whose `oneOf` currently
encodes "offline, one of two ways"; a conditional on a response that has never had one; and a
server-side key-history requirement that touches certificate lifecycle rather than the wire. Any
one of them alone would be a clause. Together they are a decision with its own blast radius, and
writing it inside a signing arc would bury it.

**What is settled and should not be re-litigated when it is taken up:** the MAC does not provide
non-repudiation, the key to fix that already exists on every station, and the online money path is
where it is missing.

---

## OPEN — no gate parses JSON out of a markdown fence, and 511 payloads live there

**Recorded at `0.22.0`, where it produced the defect for the second time in two days.**
`bindings` became REQUIRED on a service item. It is present in **every** body CI validates — the
`examples/payloads/` files, the conformance vectors — and was absent from **every** payload
embedded in markdown: nine entries in `TC-DM-008`, three in `03-messages.md`, three in the
profile's own §8.1, sitting 44 lines below a table listing `bindings` as Required = Yes. That is
not fifteen independent oversights. It is the shape a gate leaves behind: the guarded surface
stayed correct and the unguarded one drifted, and the boundary between them is exactly the CI
glob.

**The surface, measured at `b35eef6`.** Tracked `.md` files carry **511** ` ```json ` fences;
**507** parse. Of those, **236 are self-identifying** — 168 full MQTT envelopes carrying both
`action` and `messageType`, and 68 BLE frames carrying a `type` discriminator — so a gate resolves
schema and validate them **with no human decision and no annotation**. That is 46% of the surface
reachable for the cost of writing the resolver. The remaining **271 are bare payload fragments**
with nothing in them to say what they are; those need a per-fence directive.

**The directive already exists in this repository.** `tools/sign-inline-md.mjs` selects fences with
an HTML comment — `<!-- ospp-sign: receipt -->` — and reports per file how many blocks it saw and
how many it signed. A schema gate is the same mechanism with a different map: `<!-- ospp-schema:
update-service-catalog-request -->`, defaulting to the envelope's own `action` where one is
present. So the 236 need no directives at all, and the 271 can be annotated incrementally with the
count of un-annotated fences as the ratchet.

**Why this is worth its cost.** Every other gate in `tools/` guards a machine-readable tree.
`03-messages.md` alone holds **80** fences and is the document implementers read first; it is the
one artefact where a wrong example is most expensive and least likely to be caught. The signer
already walks it and finds 7 signable blocks, so the traversal is written — what is missing is the
schema resolution and the assertion.

**Not built here, deliberately.** Mapping the 271 fragments is the bulk of the work and it is a
judgement call per fence, not a sweep. The 236 are not.

## CLOSED (0.31.0) — the SDKs byte-guard the vendored schemas and guard the vendored vector corpus with nothing

**Third instance in the `0.14.0` cycle of a gate that looks somewhere else**, and the first whose
consequence is that doing the *right* thing breaks the build. Both SDKs vendor two artefacts from
this repository: the JSON schema tree **and** `conformance/test-vectors/`. Both CIs clone the spec
at `.spec-ref` and `diff -rq` the schema tree against it. **Neither diffed the vector corpus.** So
the schemas could not drift and the vectors drifted freely — which is what happened.

**CLOSED at 0.31.0, and it was closed downstream rather than here.** Re-measured while costing a
schema change: **both SDKs now run a `vector-corpus` byte-identity job** —
`sdk-ts/.github/workflows/ci.yml` and `ospp-sdk-php/.github/workflows/tests.yml`. The `sdk-ts`
comment records that it was added for exactly this gap and verified the way this file asks for:
*"flipping ONE BYTE in valid/core/boot-notification-response-full.json left 1067/1067 tests passing
and turned this job red."* **This entry went on asserting the opposite for several releases after it
stopped being true**, which is the ordinary failure of a finding recorded in one repository about
gates that live in two others — nothing in this repository could have noticed.

**Measured at `v0.14.0`.** `common/meter-values.schema.json` gained `minProperties: 1`, enforcing a
MUST that had never been enforced, and the corpus moved with it: `meter-values-event-minimal.json`
was rewritten to carry one reading, and `invalid/transaction/meter-values-event-empty-values.json`
was added so the rule is falsifiable. Counts went **160 valid + 156 invalid = 316** to **160 + 157
= 317**. In both SDKs today:

- `valid/transaction/meter-values-event-minimal.json` still carries `"values": {}` — under the new
  schema it is **invalid while sitting in `valid/`**, so the parity suites assert it must validate
  and it will not;
- the new invalid vector is **absent from both**;
- the totals are **hardcoded**: `ospp-sdk-php` `tests/Contract/Schemas/ConformanceVectorTest.php`
  asserts `160` and `156`; `sdk-ts` `tests/validation/SchemaValidator.test.ts` asserts `316`.

A maintainer who does exactly the right thing — `cp -r spec/schemas → schemas/`, bump `.spec-ref` —
gets two red suites and no indication that the vectors were the other half of the job.

**What needs building, and where.** This is an **SDK** gate, not a spec gate; it is specified here
because this registry is where the class is tracked. Mirror the existing schema step, in the same
job, in both repos:

| Repo | Add beside | Vendored corpus |
|---|---|---|
| `ospp-sdk-php` | the *Byte-identity check (schemas/ ↔ spec/schemas/)* step in `.github/workflows/tests.yml` | `tests/Fixtures/test-vectors/` |
| `sdk-ts` | the *Byte-identity check (src/schemas/ ↔ spec/schemas/)* step in `.github/workflows/ci.yml` | `src/test-vectors/` |

Same shape as the schema step and for the same stated reason — `diff -rq` of the whole tree against
`/tmp/spec-source/conformance/test-vectors/`, **never a hand-maintained file list**, because a list
is a second place to forget and its failure is silent.

**And the count must be asserted, not hardcoded.** The two halves compose and neither is sufficient
alone: byte-identity answers *is this the right tree*, and a non-zero parsed count answers *did we
actually read it*. **A gate that parses zero vectors must not report a pass** — the shape this
repository already had to repair once, where a Pest run collecting zero tests exited green. So the
suites should derive their totals from the vendored tree at run time and assert only that the count
is **> 0** (identity already pins *which* vectors), replacing the three literals above. A number
fixed in code that a human must hand-update on every new vector is precisely what makes this drift
invisible: the literal is not a check on the corpus, it is a second copy of a fact about it — the
same *restatement-without-a-citation* shape as the finding below, expressed in test code.

**Not built here** — this repository cannot add a job to another repository's CI, and the spec-side
half already exists (`tools/verify-schemas.py`, which validates all 317 and would have caught the
stale vector the moment it was committed here).

## OPEN — nothing checks a per-message `Message Expiry` against the category it names, and a repair landed on the wrong message because of it

**The fourth gate-that-looks-somewhere-else, and the first whose consequence was a regression shipped
inside the repair that announced it fixed.** `02-transport.md` §5.1 assigns every action to an expiry
**category** and gives that category one MQTT Expiry Interval. `03-messages.md` restates the value in
each per-message metadata block, and Appendix B restates it a third time. **No gate joins the three.**
Category 4 *Numeric Consistency* checks numbers that appear twice in prose; it has never known that a
`| **Message Expiry** | 120 seconds |` row belongs to a category table three chapters away.

**Measured at `v0.14.0` → `v0.15.0`.** `0.14.0` set out to fix MeterValues' expiry, which read `30 s`
against §5.1's `120 s`. At `0.13.0` **two** per-message blocks carried the byte-identical string
`| **Message Expiry** | 30 seconds |`, and the edit took the first — which is **AuthorizeOfflinePass**,
some 780 lines above MeterValues. The single hunk in `git diff v0.13.0..v0.14.0 -- spec/03-messages.md`
shows it. So `0.14.0` shipped with the announced defect **still open** and a **new** one created, and
the companion Appendix B edit in the same commit was correct — which is exactly why it looked finished.
`verify-protocol.sh` reported **29/29 PASS** on Numeric Consistency across the entire cycle. Both are
repaired in `0.15.0`, along with CertificateInstall's `300 s` against its category's `60 s`.

**Both sides are already structured, which is what makes this cheap.** §5.1 is a four-column table
whose *Actions* cell is a comma-separated action list; each per-message block is a `| Property | Value |`
table under a `### N.M ActionName` heading, carrying a `| **Message Expiry** | … |` row; Appendix B is a
four-column table keyed by action. Three parsers, one join on action name. Nothing needs a new file
format and nothing needs hand-maintained lists.

**What the gate must do, and the three ratchet properties it must have:**

| Side | Parse | Yields |
|---|---|---|
| `02-transport.md` §5.1 | category table, expanding *Actions* | action → (category, expiry, max age) |
| `03-messages.md` per-message blocks | `### N.M Name` + `Message Expiry` row | action → expiry, and the category it *names*, if any |
| `03-messages.md` Appendix B | action-keyed table | action → expiry |

1. **Refuse on a thin parse.** Assert a floor on each side before comparing — §5.1 yields 27 actions
   across 6 categories, Chapter 03 yields 27 per-message blocks, Appendix B yields 22 rows. A selector
   that quietly stops matching is this repository's most-repeated failure, and a gate that reports a
   pass on four parsed rows has tested nothing.
2. **Zero matched pairs is a FAIL, never a pass.** If the join produces no pairs the parser has broken,
   not the specification agreed — the same shape as a Pest run collecting zero tests and exiting green.
   The pass condition is *N pairs compared and N agreed*, with N asserted `> 0`, never *no disagreement
   found*.
3. **Check the citation, not only the number.** A block naming a category **MUST** be in it. This is the
   half that catches the actual regression: AuthorizeOfflinePass's new line was `120 seconds (Periodic
   reporting category)` and AuthorizeOfflinePass appears in **no** §5.1 category at all, so the value
   and the citation were both wrong and either check alone would have caught it. Membership is a
   distinct verdict from disagreement and must be reported as such.

**Three states, not two.** An action can agree, disagree, or be **named in no category** — `TriggerMessage`
and `DataTransfer` are in no §5.1 row, and five actions are absent from Appendix B (see the separate item
on that). The gate **MUST NOT** treat absence as a failure or it will be silenced on day one; it reports
absence as coverage and fails only on disagreement or a false citation.

**What it would have caught, in order:** the `0.14.0` MeterValues regression, both halves; CertificateInstall
at `300 s` against a category giving `60 s`, which had stood since the block was written; and any future
recurrence of the same edit. The category citations added to the three repaired blocks in `0.15.0` are a
**convention** that makes the two lines textually distinct — they are not enforcement, and a maintainer who
omits one on the next block restores the original hazard exactly.

**Not built here** — recorded with its specification so the next cycle can build it, in the shape of the
existing `tools/check-config-defaults.py`, which already does the equivalent join for configuration
defaults and is the closest working model.

## OPEN — 170 numbered processing rules, and nothing says whether the numbering binds

**Same class as the citation finding below: a rule that cannot be checked against anything.**
Twice in the `0.14.0` cycle a correct, deliberately-written rule turned out to be unreachable
because another rule in the same numbered list fired first. Two instances in one pass, in adjacent
messages of one profile, is a shape rather than a coincidence.

| Where | What happened |
|---|---|
| [`stop-service.md`](spec/profiles/transaction/stop-service.md) §6 | Rule 2 mandates `3006 SESSION_NOT_FOUND` whenever no session is active on the bay. Rule 10 — added in `0.4.0`, three chapters deep — mandates the **cached RESPONSE** for a duplicate stop inside the 24-hour retention horizon, which is precisely a case rule 2 catches first. An implementer applying §6 in listed order never reaches rule 10. The conformance corpus had encoded rule 2's answer as the required one. |
| [`reserve-bay.md`](spec/profiles/transaction/reserve-bay.md) §6 | Rule 2 validated bay state. An **expired** reservation has already returned its bay to `Available`, so the bay-state check passes and a new reservation is silently accepted under a spent `reservationId` — the identifier check that would have refused it sits later. |

**The measurement.** `spec/profiles/` carries **170 numbered rules across 23 documents** with a
`## N. Processing Rules` section. **None of the 23 states whether the numbering is normative.** Two
documents elsewhere in the tree do say it, and neither is a Processing Rules section:
`authorize-offline-pass.md` §5 *"Validation Checks"* — *"The server **MUST** perform all of the
following checks **in order**. Processing **MUST** stop at the first failure."* — and
`connection-lost.md` §5 *"Server-Side Handling"* — *"**MUST** perform the following steps in
order."* Both prove the specification knows how to say it. Neither generalises, and the sections
that most need it are the ones without it.

**Why it is unverifiable rather than merely ambiguous.** A numbered list *reads* as ordered — that
is what numbering is for — so an implementer applying rules 1..n sequentially is behaving
reasonably. An implementer reading them as a set of invariants that must all hold, in whatever
order is convenient, is also behaving reasonably. **The two produce different wire behaviour, and
neither is wrong against the text**, because the text does not say. There is no statement to check a
station against, so no conformance case can exist for it and no reviewer can call either reading a
defect. Both `0.14.0` incidents were found by reading, not by any gate.

**The two readings are not equivalent wherever a later rule carves out an earlier one.** That is
exactly the shape both incidents had, and it is the shape any *idempotency* or *cached-response*
rule has by construction: such a rule is always an exception to a more general validation stated
earlier. `stop-service.md` §6 and `reserve-bay.md` §6 now say explicitly which rule is evaluated
first and why, but they were repaired one at a time, after the fact — the same
*pointer-added-only-after-a-drift-incident* pattern the citation finding below measures.

**Not repaired here.** What would close it is a single sentence in the profile template — whether a
`Processing Rules` list is an ordered procedure or an unordered set of invariants — applied to all
23, plus an explicit statement at each list that carves out an earlier rule. Deciding which of the
two readings is intended is a normative choice affecting every profile document, not a drift
repair, and a partial sweep of 23 sections is the failure mode this registry has already named as
worse than the original defect.

## OPEN — a restatement that does not cite its source cannot be checked against it, and 103 of 127 restatements cite nothing

**This is the cause the session-cycle contradictions sit on top of, not another instance of them.**
The 0.14.0 pass resolved 31 self-contradictions on one message family. Every one of them was the
same shape: a value, a rule or a field list defined in one place and re-typed in another, where the
copy drifted and **nothing in the copy said what it was a copy of**. A reader cannot verify a
restatement against its source if the restatement does not name one, and a maintainer editing the
source has no way to find the copies.

**Measured at `0.14.0`:**

| Category | Restating sites | Self-declaring | Bare link only | **No pointer at all** |
|---|---:|---:|---:|---:|
| Error-code tables | 23 | **0** | 1 | **22** |
| Configuration defaults / ranges | 21 | 3 | 8 | 10 |
| Timeouts / intervals | 19 | 1 | 1 | 17 |
| State transitions | 19 | 5 | 4 | 10 |
| Field lists / payload tables | 43–45 | 1 | 0 | 42–44 |
| **Total** | **~127** | **10** | **14** | **~103 (≈81%)** |

Two of those numbers were re-measured directly rather than inherited. **Zero of the 11 profile
documents carrying an `## N. Error Codes` section names [`07-errors.md` §3](spec/07-errors.md) as
the registry that governs it** — the three files that contain governing language use it about state
machines, not about error codes. And the cross-reference graph is lopsided in exactly the direction
that hurts:

| Chapter | Referenced by (of 36 profile documents) |
|---|---:|
| `07-errors.md` | **31** |
| `06-security.md` | 15 |
| `02-transport.md` | 12 |
| `05-state-machines.md` | 8 |
| `08-configuration.md` | 4 |
| **`03-messages.md`** | **2** |

`03-messages.md:5` calls itself *"the normative reference for **every message** in the OSPP
protocol."* It is invisible from **34 of the 36 documents that restate it**. That is the structural
reason the duplicate-ReserveBay question was hard to settle: `reserve-bay.md` references Chapter 03
**zero** times, so a firmware author working from the profile had no signal that a chapter said
something different about the same message.

**The convention exists and works — it is simply not policy.** The spec has excellent governing
pointers: *"and it governs where this table disagrees with it"* ([`05-state-machines.md`
§3.4](spec/05-state-machines.md)), *"This is the canonical table. Nothing else in this
specification restates it."* ([§2.3](spec/05-state-machines.md)), *"on any discrepancy, §6.5
governs"* ([`ble-handshake.md`](spec/profiles/offline/ble-handshake.md)). They appear at **10 of
~127 sites**, clustered in files with a visible repair history. **The pointer is added after a
drift incident, never before one.**

**And there is no general precedence rule.** Authority is declared locally and in both directions —
chapters defer to profiles (`03-messages.md`, `02-transport.md`, `06-security.md` each name a
profile document as the normative statement of some rule) and profiles defer to chapters (~20
sites). `ble-handshake.md` does both, on adjacent cryptographic topics, each decided on its own
merits. The only global rule is [`00-introduction.md` §3.5](spec/00-introduction.md) — *"Where the
prose description and the JSON Schema disagree, the JSON Schema is authoritative"* — which covers
prose-versus-schema and nothing else. **When a numbered chapter and a profile document disagree and
neither cites the other, the specification does not say which wins.**

**Not repaired here, deliberately.** ~103 sites is its own arc, and a partial sweep is the failure
mode this registry has already named as worse than the original defect. What would close it is a
policy — every restatement names its definer — plus a check for the mechanically detectable part of
it, in the shape of the three existing drift ratchets in `tools/`. The error-code tables are the
obvious first target: 23 sites, 0 citing, and both sides structured enough to compare.

**One number carries a caveat:** the payload-table total is 43–45 depending on how contiguous
sections are counted, and it was not re-derived independently. The other rows were.

## OPEN — the signing toolchain canonicalizes with the SDK, so it verifies the SDK against itself

**Raised 2026-08-12, while deciding where the spec repo's own canonical-form implementation
should live.** Five tools import the rule they exist to check:

`tools/sign-inline-md.mjs`, `tools/sign-example.mjs`, `tools/verify-example-signatures.mjs`,
`tools/verify-ble-crypto.mjs` and `tools/generate-ble-vectors.mjs` all do
`import { canonicalize } from '@ospp/protocol'`. That is the whole signing **and**
signature-verification chain. A gate that canonicalizes with the SDK passes whatever the SDK
does, including whatever it does wrong — `verify-example-signatures.mjs` checks signatures using
the same canonicalizer that produced them, so it cannot fail on a canonicalization defect by
construction. This is the third instance of the shape: a gate once compared the two SDKs to each
other instead of to the registry, and a suite once defended the wrong value for `5004`.

**The import resolved to defective code, and this entry named the wrong version for four
releases — which pointed its own remedy at the wrong axis.** It read: *"`package.json` declares
`^0.13.0`; `node_modules/@ospp/protocol` is **0.5.4**"*. Measured at `v0.29.0`, the installed copy
was **`0.13.0`** — **identical to the declared constraint**. So the remedy below, *"bring the
installed dependency in line with the declared one"*, was a **no-op**: they were already in line,
and `0.13.0` still carried both defects — `Object.keys(value).sort()` (UTF-16 code-unit order where
[§4.8.1 step 1](spec/06-security.md) requires UTF-8 byte order) and `JSON.stringify(sortKeys(…))`,
which rebuilds a sorted object and thereby discards the sort for integer-like keys. A version
number nothing gates is the one that goes stale, and here the stale number made a real defect look
like a housekeeping task.

**The dependency half is CLOSED at 0.30.0.** The pin is `^0.28.0`; the installed
`CanonicalJsonSerializer` sorts with an explicit UTF-8 byte comparator. This entry's own prescribed
order — *"bump the dependency first and re-measure"* — was followed: on the bump
`verify-all-signatures.sh` is green and `sign-inline-md.mjs --all` produces **zero drift across all
20 signed documents**. That zero is the evidence the previously *measured* exposure was genuinely
zero rather than merely unobserved: had any committed signature depended on the broken ordering,
re-signing with the corrected canonicalizer would have moved bytes.

**Measured exposure: zero.** Across 372 committed JSON files and 1846 objects, no object has keys
whose UTF-8 and UTF-16 orderings differ and none has an integer-like key. No committed signature
is wrong. The defect is latent, not active, which is why 0.13.0 did not re-point the signing chain
in the same change: doing so re-canonicalizes signed artefacts for no present correctness gain,
and the safe order is to bump the dependency first and re-measure.

**What remains open** is the circularity itself: those five tools still import the SDK rather than
[`tools/canonical-form.mjs`](tools/canonical-form.mjs), the single implementation written from the
text. A correct SDK does not repair that shape — `verify-example-signatures.mjs` still checks
signatures with the same canonicalizer that produced them, and still cannot fail on a
canonicalization defect by construction. It is now a circular gate over *correct* code instead of
over defective code, which is a smaller problem and the same one.

---

## CLOSED (0.13.0) — SessionEnded belonged to no profile, and the note saying so was parked where nothing reads it

**Raised 2026-06-04 in `CHANGELOG.md` [0.4.1], under "Flagged as known follow-ups". It sat there
for 68 days and eight minor releases.** A changelog entry is a record of what a release did; it is
not a worklist, nothing sweeps it, and the release that carries it scrolls out of view within a
cycle. The note was accurate the whole time and nothing acted on it, which is a property of where
it was written rather than of what it said. Follow-ups belong here.

What it flagged: `SessionEnded` [MSG-040] had no profile. Core listed six actions, Transaction six,
Security four, Device Management nine, Offline/BLE fourteen — 39 of the 40 messages. SessionEnded
was the fortieth. It is in the message catalogue, it has its own section in Chapter 03, Chapter 01
§6.5 forbids discarding it because it is billing evidence, and Chapter 02 §5.1 says it never
expires — but no profile claimed it, so a station implementing every profile exactly as written
would not have implemented the sole billing source for autonomously terminated sessions.

Closed in 0.13.0 by assigning it to **Transaction**, not to Core as the 0.4.1 note assumed.
Transaction owns the session lifecycle and the billing surface, and is mandatory from **Standard**
compliance upward, so the obligation lands on every production station. Core would have bound it at
**Development** too, where there are no sessions to end. Chapter 03 files it under "Status &
Monitoring", which is a documentation taxonomy and not a profile assignment — MeterValues sits in
the same section and has always been a Transaction action. New file:
[`spec/profiles/transaction/session-ended.md`](spec/profiles/transaction/session-ended.md).

---

## OPEN — a server that detects fraud at reconciliation has no SecurityEvent to record the incident

**Raised 2026-06-04 in `CHANGELOG.md` [0.4.1] alongside the SessionEnded note, and moved here in
0.13.0 for the same reason.** Still open, and still unimplemented: `FraudDetected` appears nowhere
in `spec/` or `schemas/`.

When the server's offline-transaction reconciliation scoring concludes that a transaction is
fraudulent, its **reaction** is well specified — disable offline mode for the user, revoke active
passes ([`06-security.md` §7](spec/06-security.md)) — but those are administrative actions and out
of scope for SecurityEvent. The **incident itself** has no spec-defined representation, so the
event that triggered the reaction is not recorded in the audit channel that exists to record
exactly that. A new server-originated `SecurityEvent` type and its emit rule are the shape of the
fix; the reason it has not been written is that every existing `SecurityEvent` type is
station-originated, and adding a server-originated one is a change to what the message means, not
just to its enum.

> **UPDATE 2026-08-28 — the blocker named in the paragraph above was false when it was written, and
> is now gone.** *"Every existing `SecurityEvent` type is station-originated"* was not true: nine
> normative sites already required the **server** to emit an `OfflinePassRejected`, and `2018`'s
> registry row already required it to log a `ServerSignedAuthReplay` — the second of which
> `security-event.md` §4 said in its own event-type table. The obstacle this entry cited as the
> reason for not proceeding had already been crossed twice without anyone noticing, which is why it
> is now [instance 9 of the unconstructible class](#decided-0260--nine-sites-required-the-server-to-emit-a-securityevent-and-the-profile-admitted-no-such-thing)
> and closed there: `security-event.md` §2.1 now defines the server-originated form.
>
> **This does not make `FraudDetected` free, and it is still not taken here.** What it costs is now
> stated correctly rather than overstated. It is **not** *"a change to what the message means"* — the
> meaning is settled. It is an addition to the `type` enum of
> `security-event.schema.json`, which both origins share, so a value added for the server is a value
> a station may also emit; that is a schema change and an SDK re-vendor, and it needs the emit rule
> and the station-side semantics decided together. Cheaper than this entry claimed, still a
> decision, and still out of scope for the cycle that corrected the premise.

---

## DECIDED (0.24.0) — the server is the billing authority on the offline path too, and §8.1 was the outlier

**Raised and decided 2026-08-18, in the offline spec-contradiction cycle.**

[`spec/04-flows.md` §6](spec/04-flows.md) binds the server as *"the **authoritative billing engine**
for all sessions"* and **MUST**-requires it to recompute regardless of the station-reported
`creditsCharged`. [`reconciliation.md` §8.1](spec/profiles/offline/reconciliation.md) steps 1--2
told it to read that number and debit it, with no normative keyword. §8.2 of the *same section*
invokes Billing Authority by name with its own **MUST**, and `04-flows.md` §5b step 2 says it a
third time — **three passages against one step list**, which is what the reference server followed
literally.

**Decided: the server is the authority. §8.1 is rewritten to recompute.** The station's
`creditsCharged` is advisory — a cross-check and an operator signal — and **MUST NOT** be the
settled amount.

**What makes it work operationally, and why the historical-tariff objection is not blocking.**

1. **The pass is re-issued** on application start, on each consumption, and on each wallet top-up
   ([`offline-pass.md` §6](spec/profiles/offline/offline-pass.md) step 3a). For as long as the
   application has had a network, the allowance the station validates against tracks the wallet.
2. **`OfflinePassMaxAge`** bounds the window in which it has not — see the decision below.
3. **The residue is a debt, not a dispute.** §8.1 rule 5 makes a negative balance restrict service
   until covered. Because the amount is the server's own recomputation, it is settled by payment
   rather than adjudication.

So the server recomputes with the tariff in force at `endedAt` where it retains a catalog history
(the `epoch_active_at(t)` construction of §6.6 applies unchanged), and with the current tariff
otherwise, recording which basis it used. A tariff change inside the offline window moves the
amount by a bounded difference that **surfaces as balance and is collectable** — it is not hidden,
and it is not a reason to defer a settlement for a service already delivered.

**What this closed on the other side.** The reading in which the station is authoritative would
have required binding `creditsCharged` to the signature on the pass-form, which the reconcile gate
does not do — it cross-checks five fields and `creditsCharged` is not among them. That work is not
needed now, but the asymmetry it revealed is real and is recorded at
[`reconciliation.md` §6.1](spec/profiles/offline/reconciliation.md): the auth-form gate fixes the
amount against the signature and the pass-form gate does not.

---

## DECIDED (0.24.0) — `OfflinePassMaxAge` is kept, wired into check #2, and defaulted to inert

**Raised and decided 2026-08-18, in the offline spec-contradiction cycle.**

The key defined a **MUST** reject that no validation list performed — not the station's ten, not the
eleven at authorize-time, not the thirteen at reconcile. Measured across all five implementation
trees, it had **no reader anywhere**.

**Decided: kept, not withdrawn.** It is the bounding mechanism the re-issuance cadence needs (see
the decision above): a pass that is old is a pass held by an application that has had no network
for a while, and the wallet snapshot inside it is correspondingly stale.

**Three things were settled with it.**

1. **It is part of check #2, not an eleventh check.** Same question — is this pass temporally valid
   — same error code `2003`, and for a conformant pass the expiry bound already implies it. Adding
   an eleventh would have moved a **cited count**: "10 checks" names a conformance case
   (`TC-OFF-002`), two anchor cross-references, and ten further citations across the specification
   and the implementor's guide. An ordinal that is cited is an identifier.
2. **Signed validity and the age threshold are independent.** Validity is the issuer's and fixed at
   signing; the age threshold is a station's refusal and an operator may change it at any time.
   Neither caps the other. The only tie is a consistency obligation **on the issuer at issue
   time**: it **MUST NOT** sign a validity longer than the value configured on the stations that
   will validate the pass, because signing longer means signing a credential its own fleet refuses,
   in the window where the app has no network to ask for another.
3. **The default is `86400`, and it is deliberately inert.** Because signed validity is capped at
   24 hours, an unexpired pass is by construction younger than 24 hours — so **the age bound cannot
   fire at any value at or above `86400`**; the expiry bound always reaches it first. Defaulting at
   the legal maximum means no deployment is tightened by accident, and an operator who wants the
   bound arms it by lowering the key. A control that fired by default would refuse users at the bay
   for a policy nobody chose.

**What was considered and rejected.** A three-day default (`259200`) was proposed to cover a
weekend, on the reasoning that a launderette is exactly where signal is missing. It was rejected on
two measurements: it exceeds the legal range maximum (`86400`) threefold, and — decisively — it
does not deliver what it was chosen for. A weekend-old pass is refused by **expiry**, not by age,
because `expiresAt` is capped at 24 hours from issue. Weekend coverage is reachable only by raising
that cap, which is a different and larger decision: the 24-hour figure is stated in four places and
is the stated justification for epoch revocation being coarse-grained
([`offline-pass.md` §5](spec/profiles/offline/offline-pass.md) — *"acceptable because OfflinePasses
have short lifetimes (maximum 24 hours)"*), and the key-rotation retention window assumes it.

---

## OPEN — BLE StationInfo still carries `bayCount`, which cannot name a bay and agrees with nothing

**Raised 2026-08-07, by the twelve-defects sweep, while checking that `bayCount` was gone
everywhere the 4020 rewrite touched.** It is gone from the MQTT and provisioning surfaces. It
survives on BLE.

[`station-info.schema.json`](schemas/ble/station-info.schema.json) makes `bayCount` REQUIRED on
the FFF1 Station Info characteristic — "Number of service bays available at this station" — and
[`ble-transport.md` §3](spec/profiles/offline/ble-transport.md) states it identically. Two things
are wrong with it, and neither is cosmetic:

1. **It cannot name a bay, and bay numbering is legally non-dense.** v0.11.0 settled that a bay
   set of `{1, 3}` is legal everywhere and that a server **MUST NOT** reject a declaration for
   being non-dense. An app that reads `bayCount: 2` and offers the user bays 1 and 2 is wrong
   about a station whose bays are 1 and 3. The scalar has no form in which it could be right.

2. **It is a second source of truth with no reconciliation rule.** The app does not need it: it
   selects a bay by `bayId`, read from AvailableServices (FFF2), whose `bays[]` carries one entry
   per bay — and `StartServiceRequest` takes `bayId`, never an index. So `bayCount` is consulted
   by nothing and can disagree with `bays[]` freely. A sweep for a clause tying the two together
   returns nothing: no MUST, no equality, no precedence. Two ways to express one thing, which is
   the defect class the topology arc exists to remove.

This is the same defect the MQTT side already fixed. `bayIds` and `bayCount` were deleted from the
wire in v0.11.0 for exactly this reason, and `bays[]` replaced them. BLE was not swept then, and
the 18 AvailableServices sites deliberately left alone in that arc are a *different* case — there
the station is echoing a catalog it was pushed, which is a real thing it has to carry.

**Not fixed here, and the boundary is deliberate.** Deleting a REQUIRED member of a BLE
characteristic is a **BLE wire change**: it moves `bleProtocolVersion`, not `protocolVersion`,
and it invalidates a published example payload, five example flows, four conformance test
vectors and `TC-OFF-001` step 8, which reads `bayCount` by name. That is a self-contained arc
with its own ship order, and none of the twelve defects this sweep was scoped to touches the BLE
surface. Recording it rather than half-doing it.

**When it is taken up, the decision is not "delete or keep".** It is whether FFF1 should carry
the bay set at all, given FFF2 already does — the mature answer is that the count scalar goes and
nothing replaces it, because the reader that needs bay identity is already reading FFF2.

---

## CLOSED — the bay FSM is specified twice, the two copies disagree, and each SDK implemented a different one

> **Closed by the bay-FSM arc.** The record below is left standing because it states the problem
> better than a summary of the fix would, and because the root cause it identified turned out to be
> exactly right. What was decided:
>
> **1. `Unavailable → Faulted` is legal.** A bay taken out of service can still develop a fault,
> and a technician working on it is the most likely person to find one. Forbidding the transition
> does not prevent the fault, only the report of it. Added to the chapter, both diagrams and the
> diagram README; `ospp-sdk-php` already had it, `sdk-ts` pins it false in a test and must change.
>
> **2. One canonical table, at [`05-state-machines.md` §2.3](spec/05-state-machines.md#23-transition-table).**
> The count in this entry was low: the machine was stated in full in **five** places, not two — the
> two named below plus the chapter's own diagram, `state-machine-bay.mmd`, and a second copy of
> that diagram embedded in `diagrams/README.md`. Every other site now references §2.3 and states
> only what is local to it — with the exception of its *size*, which six of them went on asserting
> at the pre-arc figure for another two arcs (point 6). A sixth site, `set-maintenance-mode.md`, restated a *slice* of the
> table and got it wrong in a way this entry never caught — it permitted maintenance only from
> `Available`, so a station built from it could not be told to stop offering a faulted bay.
>
> **3. The root cause is fixed at the root, not by picking a winner.** This entry's diagnosis —
> that the section "merges the station's physical FSM with the server's belief about it into one
> table" — is correct and is what the repair addresses. §2.3 gains an **`Effected by`** column.
> **20 `Station` rows and 6 `Server` rows, 26 in all.** A station implements the 20 and **MUST
> NOT** implement the 6; a server implements all 26. Neither document's copy was overwritten by
> the other's: the profile's 18 turned out to be the `Station` sub-table (+ the two below), and the
> chapter's 23 the whole of it (+ `Unavailable → Faulted`). Both were faithful to a real thing;
> neither said which.
>
> **4. On an invalid transition the server accepts the report as authoritative** — the station is
> the authority on its own hardware, the same allocation §1.5 already makes for topology — records
> it durably where an operator can retrieve it, and reconciles any session the new state
> contradicts. It **MUST NOT** Reset the station over one: Reset is now a reboot that preserves
> everything persisted, so it repairs no model disagreement. All four contradicting statements are
> gone; [§2.5](spec/05-state-machines.md#25-invalid-transitions) is the only one. The line numbers
> quoted below had drifted by the time this was closed — `:50` and `:73` were `:56` and `:79`.
>
> **5. Found while composing, and not in this entry:** `Unknown` had three exits and needed five.
> §3.5 requires a station that reboots mid-session to resume the session, and on the next boot the
> bay is physically `Occupied` with a post-boot report owed — for which `Available` would have
> freed a bay running a paid session, `Faulted` would have been a lie, and silence would have
> breached CORE-004. `Unknown → Occupied` and `Unknown → Finishing` added.
>
> **6. The count outlived the table, and this entry was closed six sites early.** Deleting the
> duplicate tables did not delete the *sizes* they had been stated at, and nothing re-derived them
> when point 5 added two rows. [`03-messages.md`](spec/03-messages.md),
> [`status-notification.md` §5](spec/profiles/core/status-notification.md), this chapter's own
> [§2.5](spec/05-state-machines.md#25-invalid-transitions) and the implementor's guide in three
> places all went on asserting **18** `Station` rows while linking to a §2.3 that had held **20**
> since point 5; the guide additionally put the total at **24**. Two further sites — the guide
> again, and `04-flows.md`'s Appendix C — still carried `Unknown`'s exits as the three idle states
> in prose. A reader who trusted the sentence in front of them rather than counting the table
> would have built the machine two edges short, and those two edges are precisely the ones that
> stop a rebooting station from freeing a bay that is still running a paid session. All eight
> reconciled against a mechanical count of §2.3 — **20 `Station` / 6 `Server` / 26** — which the
> chapter's counts paragraph, both diagrams and the diagram README had stated correctly
> throughout. The lesson is the entry's own: a count is a restatement of the table, and the rule
> against restating it has to reach the numbers as well as the rows.
>
> Conformance: **TC-CORE-003** (new, the server under test), **TC-DM-007 Part E**, two vectors.

**Raised 2026-07-30, by the arc that took `Unknown` off the wire. Recorded rather than fixed:
reconciling them is not a text edit. The two tables differ because they are describing two
different things, and deciding which is which is a design question with a wire-visible answer.**

The bay state machine has two normative homes and they are not copies of each other.

- **[`spec/05-state-machines.md` §2.3](spec/05-state-machines.md)** — 23 transitions.
- **[`spec/profiles/core/status-notification.md` §5](spec/profiles/core/status-notification.md)** — 18 transitions.

### 1. They disagree on `Unavailable → Faulted`

`status-notification.md:67` lists it:

> `Unavailable --> Faulted      (fault detected during maintenance)`

Chapter 05 does not have it, in either the diagram or the table. Its hardware-error row
(`05-state-machines.md` §2.3) enumerates the source states explicitly and `Unavailable` is not
among them:

> `| Hardware error detected | Available, Reserved, Occupied, Finishing | Faulted | ... |`

A bay that faults while under maintenance is reportable by one document and invalid by the other.

### 2. They invert on `Unknown`

Chapter 05 carries six `→ Unknown` rows, one per state, all triggered by LWT
(`05-state-machines.md` §2.1 diagram, and the last row of §2.3). `status-notification.md` §5 carries
**none** — it has the three transitions *out* of `Unknown` and no way in.

Neither is wrong on its own terms, which is the tell. Chapter 05 is describing what the
**server's** model does, where connection loss really does move a bay to `Unknown`.
`status-notification.md` is describing what a **station** can report, where nothing ever moves a
bay to `Unknown` after power-on. The two documents are modelling two different observers and
neither says so.

### 3. Each SDK implemented a different table — exactly, and neither knows the other exists

This is not drift. Both are faithful; they are faithful to different chapters.

| | transitions | `unavailable → faulted` | `→ unknown` | implements |
|---|---:|:---:|:---:|---|
| `status-notification.md` §5 | 18 | yes | none | — |
| `ospp-sdk-php` `BayTransitions.php:13-19` | **18** | yes | none | **the profile** |
| `05-state-machines.md` §2.3 | 23 | no | 6 rows | — |
| `sdk-ts` `BayStateMachine.ts:15-21` | **23** | no | 6 rows | **chapter 05** |

The two SDKs release as a pair at one version and are meant to be interchangeable. They are not:
hand a PHP server and a TS server the same `Unavailable → Faulted` report and one accepts it and
one rejects it.

The `→ Unknown` half of that divergence is now partly moot — no station may report `Unknown`, so
the six rows are unreachable from the wire. They are still reachable from a **server's** own
model, which is exactly the point: `BayStateMachine` in `sdk-ts` is one class doing two jobs, and
the LWT rows only make sense in one of them.

### 4. Four statements about what an invalid transition does, and they do not agree

| where | says |
|---|---|
| `05-state-machines.md` (chapter preamble) | *"any transition not explicitly listed here is invalid and MUST be rejected"* |
| `05-state-machines.md` §2.5 | *"the server SHOULD log a warning and MAY request a station Reset"* |
| `status-notification.md:50` | *"Any transition not listed below is invalid and **MUST** be rejected by the server with a log entry."* |
| `status-notification.md:73` | *"Invalid transitions **MUST** be logged but **SHOULD NOT** cause the server to drop the message -- the server **SHOULD** accept the reported state as authoritative and log a warning."* |

The last two are in the same file, twenty-three lines apart, and are direct opposites: reject the
report, versus accept it as authoritative. A server author can comply with either and cite the
spec for it. The reference server accepts-and-logs, which is `:73`.

### The root cause, and why this is its own arc

**Chapter 05 §2 merges the station's physical FSM with the server's belief about it into one
table.** The bay a station operates and the bay a server thinks it has are different objects with
different transition sets, and §2 draws them as one. Every contradiction above falls out of that:
the `→ Unknown` rows are the server's and only the server's; `Unavailable → Faulted` is the
station's and only the station's; and "reject or accept an invalid transition" has no single
answer because a server validating its *own* model and a server receiving a *station's* report
are not doing the same thing.

Reconciling this is not a matter of picking one table and deleting the other. It needs the
design question answered first — **which transitions belong to the station's FSM, which to the
server's, and which document owns each** — and the answer changes what both SDKs ship. Recorded
here so the next reader does not "fix" it by copying one table over the other, which would
silently pick a winner for a decision nobody has made.

Adjacent, and already fixed: the ordering rule was specified twice the same way, with the
provenance-bearing version in the chapter a server implementer does not read
([`02-transport.md` §3.2](spec/02-transport.md)) and a weaker one in the profile they do. That
one **was** a text edit and was settled in this arc.

---

## OPEN — a station that refuses for want of a trust anchor has no code that fits, and narrowing `1003` made that visible

Surfaced by the `1003`/`1004` decision above rather than introduced by it. `TC-SEC-008` Part C
exercises a station that refuses the broker because **no trust anchor is obtainable** — the
presented certificate is sound and *would* validate; only the anchor is missing. Under the
specificity rule now in force, that failure belongs to neither code:

- It is not `1004`. No certificate is at fault, and `1004`'s four `details.cause` values all name
  a defect **in a certificate**. Filing it under `invalid-chain` would report an operator
  misconfiguration as a certificate defect — though note the recovery `1004` prescribes for its
  three non-expiry branches (*keep credentials, stay off the broker, alert the operator*) is
  exactly right here, which is why the two were conflated for as long as they were.
- It is not `1003` as now narrowed. Nothing failed in cipher-suite or protocol-version
  negotiation.

`06-security.md` §2.1 groups the two conditions under one obligation — *"whether no trust anchor
is obtainable at all or an anchor is present and the presented chain does not validate against
it"* — and says the deployment *"has failed to supply a required row of Chapter 01 §7.2"*. That
sentence names the fault as **configuration**, not certificate.

**The option space.** (a) A fifth `details.cause` on `1004` — `no-anchor` — which keeps one code
for "the TLS peer could not be trusted" and needs a matching change to the conditional block at
`07-errors.md` §1.4, per the **MUST** there that any entry gaining a branch gains a block in the
same change; it also stretches `CERTIFICATE_ERROR` to cover a case where no certificate is at
fault. (b) `5102 CONFIGURATION_ERROR`, which is what §2.1's own wording points at and whose
recovery — an operator supplies the missing row — is the correct one, but which moves a
connection-time refusal out of the 1xxx transport band where every sibling condition lives.
(c) A new 1xxx code for it, which is the honest classification and the most expensive.
Recording rather than picking: (a) and (c) change the registry, and (b) changes which band an
integrator looks in. **`TC-SEC-008` Part C accepts either code meanwhile**, scoped to that Part
alone and annotated in the case itself, so the latitude is visible rather than inherited.

---

## DECIDED (0.21.0) — UpdateFirmware to a `Pending` station was refused on a premise the same chapter contradicts, and with a response no error code could carry

**Raised 2026-08-17, reversing a decision taken four commits earlier in the same arc. The author of
the `0.20.0` verdict is the one reopening it.**

`0.20.0` gave the `Pending` command table its missing UpdateFirmware row and made it **`Rejected`**
([`05-state-machines.md` §1.4](spec/05-state-machines.md),
[`update-firmware.md` §5](spec/profiles/device-management/update-firmware.md) rule 9). **Four
independent grounds say that was wrong**, and they are listed in order of how hard they are to
argue with rather than how they were found.

**1 — The response it mandated could not be constructed.**
[`update-firmware-response.schema.json`](schemas/mqtt/update-firmware-response.schema.json) requires
`errorCode` **and** `errorText` whenever `status` is `Rejected`. The codes
[`07-errors.md` §4](spec/07-errors.md) lists for UpdateFirmware are `5014 DOWNLOAD_FAILED`,
`5015 CHECKSUM_MISMATCH`, `5016 VERSION_ALREADY_INSTALLED`, `5017 INSUFFICIENT_STORAGE`,
`5018 INSTALLATION_FAILED`, `5103 STORAGE_ERROR`, `5107 OPERATION_IN_PROGRESS`,
`5112 FIRMWARE_SIGNATURE_INVALID` and `1011 URL_UNREACHABLE`. **Not one of them describes a
restricted station.** A station obeying the rule had to emit either a schema-invalid response or a
code that means something else. This is the identical class `0.20.0` itself repaired two paragraphs
away — *"`Accepted` was listed as a notification status the schema forbids, so a conforming station
could not obey the **MUST** that named it"* — and the reversal costs no registry addition, because
`Accepted` needs no code.

**2 — "The entire account of the update" is contradicted by the same chapter, 600 lines down.**
The verdict rested on FirmwareStatusNotification being the only account the update would ever get.
[§6.6](spec/05-state-machines.md)'s mapping table already says otherwise, of the update's own
terminal state: *"`Activated` | -- | **Reported via BootNotification [MSG-001], not
FirmwareStatusNotification**"*. And `firmwareVersion` is **REQUIRED** on every BootNotification
([`boot-notification-request.schema.json`](schemas/mqtt/boot-notification-request.schema.json)),
which a restricted station **MUST** keep sending at `retryInterval` without limit. So the outcome
travels on the one message the restriction *compels*, and it arrives **sooner** than from an
`Operational` station, which is under no obligation to boot again at all. The clause was sound; it
was applied to a **bounded** silence as though it were permanent.

**3 — The supporting citation was a misquotation.** Option 1 below argues that *"`07-errors.md`'s
`1007` entry already treats 'cannot be handed a firmware update **while restricted**' as the thing
that forces a site visit."* `07-errors.md` says *"while it is **rejected**"*, and so do all five
other sites carrying that argument ([`VERSIONING.md`](VERSIONING.md),
[`04-flows.md`](spec/04-flows.md), [`boot-notification.md` §6](spec/profiles/core/boot-notification.md),
`TC-CORE-001` steps 45 and failure criterion 9). Every one of them is about `Rejected`, where the
limit is **structural** — no session key, signing fails closed both ways — and none is about
`Pending`. The quoted support for refusing in `Pending` was evidence about the state where refusing
was never in question. **All six sites are therefore untouched by this reversal**, which is the tell
that they were never evidence for it.

**4 — The state it locked is the state that most needs the mechanism.** `Pending` is unbounded,
entered by an outstanding approval or a `3018 TOPOLOGY_MISMATCH`, and cleared by a person and never
by time. A station driven there **by a firmware defect** could then be repaired only on site — and
avoiding the site visit is what the protocol is for. This is verbatim the argument
[DECIDED (0.19.0)](#decided-0190--one-table-gave-the-same-act-opposite-verdicts-and-a-certificate-renewal-could-not-conclude-in-the-state-the-spec-keeps-open-for-repairs)
used for certificate renewal: *a rule suspending a repair mechanism in an unbounded state specifies
the failure the mechanism was built to prevent*. `0.20.0` decided the firmware case four commits
later without applying it.

**Decided 2026-08-17, for `0.21.0`: option 2 — `Accepted`, notifications suppressed.** The station
downloads, verifies, installs behind the same install gate and reboots; every
FirmwareStatusNotification is **suppressed, not deferred**; the server reads the result from the
next BootNotification's `firmwareVersion`. Scoped to **`Pending` only** — `Rejected` is unchanged
and unchangeable.

**What the `0.20.0` reasoning got right, and is kept.** The discriminator's second clause — *is the
suppressed message a report about the effect, or the only account of it there will ever be?* — is
**retained verbatim**. It was never the defect. What is added is how to apply it: look for the later
account on **any** message the station may send, not only on the one the command would have emitted,
and refuse only when no message the station may ever send would carry the outcome. Option 3 stays
rejected for the reason `0.19.0` gave: FirmwareStatusNotification reports on the station's *work*,
it does not repair the station's standing, so it stays forbidden and the suppression stays.

**The cost `0.20.0` named is real, and is paid rather than absorbed.** Option 2 was rejected partly
because *"§6 rule 3 would need an exception for restricted stations"*. It does, and the same release
had **already** given rule 3 exactly such an exception, for the `Verified` gate-open wait — so the
objection was conceded in one paragraph and used to refuse in another. The exception here is
**stronger than a scoping: it is a suspension**, because both of rule 3's anchors are *absent* and
not merely late. There is no last notification, since none is ever sent; and the moment the gate
opens cannot be located either, because the server holds every bay of a restricted station at
`Unknown` — which is precisely what the `Verified` scoping leans on (*"it holds the bay states the
gate turns on"*). An inoperative clock whose remedies are a re-issue or a **Reset** is worse than no
clock: a Reset during `Installing` is an interrupted partition write.

**Three consequences swept with it.**

- **The stall rule's twin.** [`diagnostics-status.md` §5](spec/profiles/device-management/diagnostics-status.md)
  rule 6 is the same 5-minute rule for GetDiagnostics, and it was **never** scoped. GetDiagnostics
  has been answered `Accepted` while `Pending` with its events suppressed since before this arc, so
  that timer has been firing on healthy uploads all along. Fixed here, and labelled as pre-existing.
- **The station FSM's `Reboot` row named one `From` state.** It said `Operational`, and a firmware
  update out of `Pending` now ends in a reboot. Widened to `Operational, Pending, Rejected`, which
  **adds no edge** — `Pending -> Booting` and `Rejected -> Booting` are already listed under
  *`retryInterval` elapsed*, so a check counting `(from, to)` pairs sees the same number. Two of the
  three were already reachable and unlisted: Reset is answered normally while `Pending`, and a
  watchdog or power cycle is physical.
- **An OCPP citation wider than its source.** §1.4 read *"the CSMS is free to issue requests"*,
  citing *B02 Cold Boot — Pending*. `B02.FR.01` names four Provisioning use cases and no others, and
  `B02.FR.05` has the station reject a remote start or stop. **OCPP does not decide the firmware
  question in either generation** — 1.6 §4.2 forbids the Central System exactly two messages while
  Pending, neither of them firmware, and 2.0.1's Firmware Management block never mentions
  registration status. Corrected to what the text supports; the decision rests on grounds 1--4, not
  on the citation.

**And the rule is now checkable.** `TC-DM-002` gains **Part E**, the first Part in that case to run
against a restricted station: `Accepted` verified, silence verified across the install **plus five
minutes** so a stall timer would have fired inside the window, and the new `firmwareVersion` verified
on a boot that is still answered `Pending`. Before this, the `Pending` command table was enforced by
prose alone — no conformance case and no gate in `tools/` reads it, and that remains true of the
table's other rows.

**The option space as it stood at `0.20.0`** is recorded in the entry below and is not restated here;
what changed is not the options but two facts about option 1 that were not measured — that its
response was unconstructible, and that §6.6 already contradicted its premise.

---
## DECIDED (0.20.1) — two validation scripts reported 100% failure and no workflow ran them; the workflows now call the scripts, and a census guards the class

**Raised and decided 2026-08-17. The thing worth keeping is not the two bugs — it is that a
totally-failing instrument is indistinguishable from a broken machine and gets walked past, and
that a gate nobody runs emits no signal at all.**

**Decided: option 3 — the workflows call the scripts.** It was the only one of the three that
removes the duplication rather than choosing a side of it. Two implementations of one gate, of
which CI ran the copy that could not be reproduced locally, is why the `tools/` copy rotted
unwatched in the first place. Both scripts were repaired first, then wired:
`validate-schemas.sh` now compiles **86/86** (the two "genuine failures" were entirely its
ref-passing defect — no schema was ever wrong), `validate-examples.sh` passes **52/52**, and both
now **exit 2 with a diagnosis** when no `ajv` binary is found instead of reporting a failure count
equal to their denominator. `verify-all-signatures.sh` got the caller it never had, in
`verify-signatures.yml`.

**The census the entry really needed exists now:** `tools/check-tool-callers.py`, run by
`check-drift.yml`, computes reachability from workflows through tool-to-tool calls and fails when
a gate has no caller. It found **nine** unreached gates, not the three this entry named — the
transitive chain under `verify-all-signatures.sh` was invisible to a by-hand count.

**What remains:** `tools/verify-protocol.sh`, the single entry in that census's `BASELINE`. It is
not broken and not wired.

**Its nine findings were examined in 0.20.2 rather than capped, and three were the checker's own
assumption** — two categories held that `03-messages.md` is the only place a message can be
documented, which the BLE surface disproves, and one flagged a config key for not being restated
anywhere, which is the correct state. Correcting the assumption and exempting the key took it to
**six**. A ratchet was considered and rejected: a ceiling over a number that was 8/9 one zone
guards less than examining the zone, and examining it is what removed a third of the findings.

The six survivors are **all BLE**, in a surface marked EXPERIMENTAL with three open blockers —
four schemas with no test vector, and two field gaps where a member is documented for its MQTT
sibling but not for the BLE message. Vectors written before that surface is implementable would
prove nothing, so they stand.

**It stays unwired, and the reason is about signal rather than tidiness.** Six coherent findings
read better than nine mixed ones, but what a CI check communicates is its *state*, and a job that
is always red communicates nothing: a seventh finding, in any category, would arrive into an
already-red job and be invisible — the same inverted signal as the two bugs the census itself had.
What would make it wireable is one exemption list of the same shape as `ConnectionTimeout`'s,
naming those six with their reasons. Whether a real defect in an experimental surface should be
exempted or fixed is a decision, not a cleanup, so it is not written. **The gap is not silent
either way:** `check-tool-callers.py` reports it on every run and fails if it grows.

**The option space as it stood:**

`tools/validate-schemas.sh` reports **86 of 86 schemas failed**. `tools/validate-examples.sh`
reports **52 of 52 examples failed**. A denominator equal to the numerator is the signature of an
instrument that is not measuring anything; a reader sees it, concludes the environment is wrong,
and moves on. Nobody then knows whether either script ever worked, or what it would say if it ran.
So, measured:

**`validate-schemas.sh` — an environment collision, and the content answer is 84/86.** The script
calls `npx ajv`. npm resolves `npx <name>` by **package name**, and this repo has `ajv` (the
library, which ships no `bin`) as a local dependency and does **not** have `ajv-cli`. `npx ajv`
therefore resolves to the library and dies with *"could not determine executable to run"*. The
script's `2>/dev/null` hides that line, leaving only the failure count. **It cannot be fixed by
PATH**: installing `ajv-cli` elsewhere and putting it first still loses, because the local `ajv`
shadows it by name. Substituting the real `ajv-cli@5` binary, the content answer is **84 pass, 2
genuine failures**:

```
FAIL schemas/ble/challenge.schema.json          — can't resolve reference station-identity.schema.json
FAIL schemas/provisioning-response.schema.json  — can't resolve reference ble/station-identity.schema.json
```

Both are **the exact defect `.github/workflows/validate-schemas.yml` says in its own comment that it
fixed** — passing only `schemas/common` as refs, which leaves BLE→BLE references unresolvable. The
workflow was repaired; the shell script beside it was not, and has been stale ever since.

**`validate-examples.sh` — a quoting bug, independent of ajv.** Line 9 sets
`REFS="-r $SCHEMA_DIR/common/*.schema.json"` and the script uses `$REFS` **unquoted**, so bash
word-splits *and* glob-expands it into 22 paths after a single `-r`, which ajv-cli rejects with
*"invalid syntax (too many arguments)"* — once per example, hence 52 of 52. `validate-schemas.sh`
quotes its own `-r` glob and does not hit this. The content is fine: the CI workflow's inline Node
equivalent checks 51 pairs and reports **51 PASS, 0 FAIL**.

**Neither script is invoked by any workflow**, which is why neither failure ever blocked anything.
The two CI workflows carry their own inline reimplementations. That is the real state: `tools/` has
two scripts that look like the gate and are not it, and CI has two gates that exist only inside YAML.

**`tools/verify-all-signatures.sh` has the same shape without the same excuse.** It is not broken —
it passes — but **no workflow calls it either**, so the entire signed-conformance guard (vector
signatures, the BLE crypto oracle, signer idempotency, the placeholder scan, and now the handshake
nonce check) runs only when somebody runs it by hand. `check-drift.yml`'s own header states the
principle: *"A gate in tools/ that no job runs is the same defect one level up, so this workflow
exists to be that caller."* Three tools are still waiting for one.

(1) repair the two scripts and give all three a workflow caller, (2) delete the two scripts and let
the workflows' inline versions be the single implementation, or (3) invert it — make the workflows
call the scripts. **(3) was chosen.** The inline `validate-examples.yml` did three things the shell
script did not — every schema loaded as a ref, absent pairs counted rather than silently skipped,
and a refusal to report success for zero work — and all three were carried into the script rather
than lost. The difference the other way was kept too: the script covered
`examples/payloads/http/provisioning.request.json` and the workflow did not, so the pair only the
unrun script checked is now the pair CI checks, and that gate went from 51 to **52**.

---
## DECIDED (0.20.0) — the active-session gate named three stages; it gates the INSTALL, and `scheduledAt` defers the install with it

**Raised 2026-08-17, in the firmware-cycle arc. These two are one entry because they are one
decision: every reading of the gate implies a reading of `scheduledAt`, and the pair has to be
answered together or the next reader inherits the same contradiction in a new place.**

**The gate — three stages, two of them in the same chapter.**

| Site | What it forbids while a session is active |
|---|---|
| [`update-firmware.md` §5](spec/profiles/device-management/update-firmware.md) rule 7 | **installation** |
| [`05-state-machines.md` §6.5](spec/05-state-machines.md) rule 5 | **beginning the update** — the `Idle -> Downloading` transition |
| [`05-state-machines.md` §7.4](spec/05-state-machines.md) | only the **`Rebooting`** transition, and it says explicitly that with `scheduledAt` the station **SHOULD** download and verify immediately |

§6.5 rule 5 and §7.4 are eleven sections apart in one chapter and cannot both hold: one forbids
the download, the other recommends it.

**What the contradiction has already cost downstream.** `TC-DM-002` step 118 fails a station that
stops handling sessions during the download — a criterion that has **no reachable case** under
§6.5 rule 5, because under that rule no session can be running when the download starts.
`examples/flows/12` says the opposite for the install phase (*"will not accept new sessions as a
safety precaution"*). And a server implementation has picked a **fourth** stage: it refuses
*initiation*, before anything is put on the wire.

**`scheduledAt` — three readings, and the FSM only permits one of them.**

| Reading | Site |
|---|---|
| defer the **download** | [`update-firmware.md` §3](spec/profiles/device-management/update-firmware.md) (*"timestamp to begin the update"*) and §5 rule 1 (*"begin the download at the scheduled time"*); [`05-state-machines.md` §6.5](spec/05-state-machines.md) rule 5 (*"defer the update"*) |
| download now, defer the **install** | [`03-messages.md` §6.4](spec/03-messages.md) (*"station downloads now, installs at scheduled time"*) |
| download and verify now, defer the **reboot** | [`05-state-machines.md` §7.4](spec/05-state-machines.md) |

The first reading is the one the state machine cannot express. [§6.3](spec/05-state-machines.md)
takes `Idle -> Downloading` on acceptance; under "defer the download" a station scheduled twelve
hours out sits in `Downloading` for twelve hours while downloading nothing, and every server
watching it sees a download that never progresses. The stall rule of
[`firmware-status.md` §6](spec/profiles/device-management/firmware-status.md) rule 3 then fires
after five minutes on an update that is behaving exactly as commanded.

**Why this is not settled by reading.** All three gate sites and all three `scheduledAt` sites are
normative text of equal standing. Which one is right is a question about the product — what a
firmware download costs a station that is mid-session — and not a question about the documents.

**Decided 2026-08-17, for 0.20.0: option 1's gate with option 2's deferral — the download is never
gated, the install is gated on both bays and `scheduledAt`.** The download touches the network and
the staging area; the partition write is the first step that touches what the station boots from and
the reboot the first that interrupts a customer, so the gate belongs there. Gating the download
would mean a busy station can never *prepare*, making the busiest stations in a fleet the last to be
patched — and it would put the FSM in a lie, since acceptance takes `Idle -> Downloading` and a
station deferring its download would sit in `Downloading` downloading nothing.

**The cost named in option 2 was accepted and then closed rather than absorbed.** `Verified` is now
an unbounded wait state with no notification value, so a station holding an image for an 03:00
install sends nothing between `Downloaded` and `Installing`. Rather than give `Verified` a wire
value — a schema change, and breaking — the stall rule was **scoped**: the server issued the
`scheduledAt` itself and holds the bay states the gate turns on, so it measures the five minutes
from the later of the last notification and the moment the gate opens
(`firmware-status.md` §6 rule 3). `TC-DM-002`'s criterion 6 — a station that stops handling sessions
during the download — becomes **reachable** for the first time under this reading.

Sites moved: `05-state-machines.md` §6.3's `Verified -> Installing` condition, §6.5 rule 5, §7.4;
`update-firmware.md` §3 and §5 rules 1, 5 and 7; `03-messages.md` §6.4. The record of the three
readings is kept below, because the point of the entry is that four implementations had picked four
different stages.

**The option space as it stood:**

1. **Gate the reboot only; `scheduledAt` defers the reboot.** (§7.4's pair.) The download and the
   partition write touch only the *inactive* partition and the network, neither of which a running
   session uses; the reboot is the only step that interrupts anything. Cheapest for fleet
   operators — an update lands during business hours and takes effect at the scheduled quiet
   moment. Cost: the station is doing sustained I/O and a full-image ECDSA verification while
   metering a customer, on hardware chosen for neither. Requires deleting §6.5 rule 5's `Idle ->
   Downloading` restriction and correcting `03-messages.md`.
2. **Gate the install; `scheduledAt` defers the install.** (`update-firmware.md` §5 rule 7 paired
   with `03-messages.md`.) The middle position: download during a session, never write flash
   during one. Cost: `Verified` becomes an arbitrarily long wait state, and it is one of the two
   states with no notification value — the server cannot see that the station is waiting rather
   than stuck. Closing that would mean giving `Verified` a wire representation, which is a schema
   change and therefore breaking.
3. **Gate the start; `scheduledAt` defers the download.** (§6.5 rule 5's pair.) The most
   conservative, and the only one under which a station in session does nothing at all. Cost: the
   FSM must gain a state, because `Downloading` cannot mean "waiting to download" — and that is a
   new state on a machine both SDKs already implement. It also makes `TC-DM-002` step 118
   permanently unreachable, so that criterion would have to be deleted rather than fixed.

The losing sites were **corrected, not left as alternatives**, which is the whole point: three of
them coexisted long enough that four implementations picked four different stages.

---

## OPEN — `5016 VERSION_ALREADY_INSTALLED` is required for two conditions, and one of them is the opposite of what the name says

**Raised 2026-08-17, in the firmware-cycle arc.**

| Site | Condition it attaches `5016` to |
|---|---|
| [`07-errors.md` §3.5](spec/07-errors.md) | *"The requested firmware version is already running on the station."* |
| [`update-firmware.md` §5](spec/profiles/device-management/update-firmware.md) rule 6 | same — station already running the requested `firmwareVersion` |
| [`06-security.md` §4.6.1](spec/06-security.md) | *"If a **downgrade** is rejected, the station **MUST** respond with error `5016 VERSION_ALREADY_INSTALLED`."* |
| [`implementors-guide.md`](guides/implementors-guide.md) | restates the downgrade reading |

A station running `2.1.0` and refused `1.0.0` answers *"version already installed"* about a version
it has never run. The two conditions have **opposite** operator recoveries, and `07-errors.md`'s
own Recommended Action — *"Server: update its records to reflect the station's current firmware
version"* — is actively wrong for the downgrade case: the server's records were right, and the
station refused on policy.

Nothing distinguishes them on the wire. A `FirmwareDowngradeAttempt` SecurityEvent [MSG-012] is
also emitted for the downgrade case, but it is a separate message on a separate channel, and a
server correlating the two has only a timestamp to do it with.

**The code space is free.** `07-errors.md` §3.5's firmware block runs `5014`, `5015`, `5016`,
`5017`, `5018`, `5112`; **`5010`–`5013` do not exist** anywhere in the registry.

**Not decided here:**

1. **Add a distinct code** — e.g. `5013 DOWNGRADE_REFUSED`, Warning, `recoverable: false`. Most
   correct: the two conditions get the two recoveries they need, and the name stops lying. Cost:
   a new error code is a MINOR addition every implementation must learn, and `06-security.md`
   §4.6.1 carries a **MUST** on the old code that must move with it.
2. **Broaden `5016`'s name and definition** to cover both (*"the offered version is not an
   upgrade"*). Cheapest wire change — none. Cost: the registry entry has to carry a discriminator
   in `details` for the two recoveries to stay distinguishable, and `5016` is currently listed as
   optional (non-bold) in §4.2's UpdateFirmware row, which understates a **MUST**.
3. **Keep `5016` for both and say so explicitly.** Cheapest of all and the worst: it leaves a code
   whose name is false half the time, which is the condition this entry records.

---

## OPEN — the anti-downgrade guard verifies one artefact and decides on another, and no field is missing

`06-security.md` §4.6 requires the `signature` on UpdateFirmware [MSG-016] to be *"the Base64-encoded
ECDSA P-256 signature of the **firmware image**"*, and `update-firmware-request.schema.json` types it
the same way — *"ECDSA P-256 signature of firmware image"*. The signature therefore covers the
**bytes**. §4.6.1's anti-downgrade guard compares something else entirely: *"the offered
`firmwareVersion` is older than the currently installed version"* — a **string**, carried beside the
bytes in the same closed request, and covered by nothing.

**Nothing binds the two.** Measured across `schemas/`, `spec/`, `conformance/` and `guides/`:
`artifactId` **0**, `artifact_id` **0**, `manifestDigest` **0** — no member ties an image to an
identity that survives being re-labelled, and no rule states that a `(firmwareVersion, checksum)`
pair is immutable once published. `update-firmware-request` is closed over exactly six properties.

**The consequence is that the guard can be walked past without breaking anything it checks.** Take
a genuinely signed image — an old one, with a vulnerability since fixed — and offer it under a
`firmwareVersion` higher than the station's current one. The signature verifies, because it is over
the bytes and the bytes are unaltered. The checksum verifies, for the same reason. §4.6.1's
comparison passes, because it compares the label it was handed. `forceDowngrade` is never needed and
never set, so the `FirmwareDowngradeAttempt` SecurityEvent §4.6.1 relies on is never raised — the
station does not believe it is downgrading. Every check the specification defines returns *pass*,
and the station installs older firmware than it was running.

**This is a verification defect, not a missing field, and the distinction decides where the repair
goes.** The station is not short of information at the moment it decides. It has just downloaded the
binary, computed its SHA-256, and verified an ECDSA signature over it — so at the instant §4.6.1
runs, the station holds *the artefact itself*, fully authenticated. It then throws that away and
compares a string the requester supplied beside it. **The guard verifies one artefact and decides on
another**, and no member the protocol lacks would change that: adding `artifactId` would give the
requester a second unsigned string to supply.

The consequence for the repair space is that **at least one option needs no wire change at all** — a
station can take the version from the binary it has authenticated rather than from the request that
described it, and `firmwareVersion` in the request becomes what it already is in fact, a routing
hint. That is a change to *what is compared*, inside the station, and it is available today. Two
others do need something: bringing the version string under the signature changes what the signature
covers, and declaring a `(version, digest)` pair immutable needs the consequence of re-use stated.

Recorded rather than taken because choosing among the three is a decision with different costs, and
because the first requires the specification to say that a firmware binary carries a version a
station can read — which it does not currently say. What is **not** available is leaving the guard
keyed on an unsigned label supplied by the party the guard exists to constrain, and calling it
protection.

*Related but distinct:* [`5016` is required for two conditions](#open--5016-version_already_installed-is-required-for-two-conditions-and-one-of-them-is-the-opposite-of-what-the-name-says)
concerns which code the refusal carries; this entry concerns whether the refusal fires at all. **Of
the two firmware entries recorded together, this is the one with a live consequence** — the other is
a mechanism that was never built; this is a mechanism that runs, returns *pass*, and is relied upon.

---

## OPEN — the firmware signing certificate is stated to rotate annually, and no message can deliver the new one

`06-security.md` §4.6 gives the trust chain as *"Operator / Manufacturer Root CA └── Firmware Signing
Certificate (ECDSA P-256, **annual rotation**) └── Signs each firmware image"*, and says the station
*"validates the firmware signature against a **pre-provisioned** Firmware Signing Certificate (or its
CA) stored in the station's secure element or encrypted NVS."*

**Pre-provisioned is the only delivery this specification defines.** Measured:

| Candidate carrier | Why it cannot |
|---|---|
| `update-firmware-request.schema.json` | closed over `firmwareUrl`, `firmwareVersion`, `checksum`, `signature`, `forceDowngrade`, `scheduledAt` — no certificate member, and no chain member |
| `CertificateInstall [MSG-023]` | `certificateType` is `enum: ["StationCertificate", "MQTTClientCertificate"]`. There is no firmware value, and the enum is closed |
| `ChangeConfiguration [MSG-013]` | Chapter 08 §§2--6 register 28 keys and none of them holds a firmware signing certificate; §1.3 then makes a station **MUST** answer `NotSupported` to an unrecognised key |
| the firmware image itself | circular where the leaf is the anchor: the image carrying the new certificate is signed by that certificate |

`conformance/test-firmware/README.md` states the same posture from the other side — *"signed offline
by the manufacturer's operational PKI, with the public certificate **pre-provisioned** to the
station's secure element"* — so the corpus agrees that no in-field route exists.

**Contrast makes the omission visible rather than incidental.** The station's *own* mTLS certificate
has a full renewal profile (§4.7, `certificate-renewal.md`, `SignCertificate [MSG-022]`,
`CertificateInstall [MSG-023]`, `TriggerCertificateRenewal [MSG-024]`). `OfflinePassPublicKey`
rotates through a registered Chapter 08 key with a defined grace period (§6.7). The firmware signing
authority — the one credential that gates what **code** a station will run — states a rotation
cadence and defines no mechanism at all.

**Where the anchor sits decides how bad this is, and naming it would be a decision rather than a
transcription — so §4.6 now states both branches with their costs instead.** Measured: **13** sites
across the specification, the guide and the conformance cases name *the Firmware Signing Certificate*
as what a signature verifies against; **2** — `06-security.md` §4.6 and `update-firmware.md` §5 rule
4 — add *or its CA*. The corpus exercises only the first: `conformance/test-keys/` holds
`firmware-test-pub.pem`, a **bare P-256 public key rather than a certificate**, and no CA certificate
or chain for firmware exists anywhere in this repository. That is enough to show which branch is
*tested*; it is not enough to forbid the other, and forbidding it would make a deployment that
anchors at its CA non-conforming for a reason this section never gave it notice of.

Anchored at the leaf, rotation is unperformable and the station stops accepting firmware when the
pre-provisioned certificate expires — including the firmware that would have repaired it. Anchored at
the CA, rotation is performable in principle and the **new leaf** still has no route to the station.
**Both branches end at the same missing thing: a message that carries a firmware signing certificate.**
§4.6 now says so in a table, so the choice is made with its cost visible rather than discovered after
the certificate is burned into a secure element.

---

## OPEN — UpdateFirmware is documented as idempotent and as `Rejected` with `5107` for the same second command

**Raised 2026-08-17, in the firmware-cycle arc.**

[`03-messages.md` §6.4](spec/03-messages.md)'s property table says **Idempotency: Yes** — *"same
`firmwareVersion` + `checksum` is a no-op if already installed or in progress."* Four other sites
say the second command is **`Rejected` with `5107 OPERATION_IN_PROGRESS`**:
[`05-state-machines.md` §6.3](spec/05-state-machines.md) row 1's condition,
[`update-firmware.md` §9](spec/profiles/device-management/update-firmware.md),
[`03-messages.md` §6.4](spec/03-messages.md)'s own Error Responses table, and `TC-DM-002` steps
80–81, which assert it as a test criterion.

A no-op is `Accepted` and changes nothing. A `Rejected` is a refusal a caller must handle. They are
not the same answer, and a server that retries an UpdateFirmware — which
[`07-errors.md` §5.3](spec/07-errors.md) allows exactly once, with the same `messageId` — gets one
of them.

**And superseding is absent entirely.** No text anywhere permits a second UpdateFirmware to cancel
or replace a first. That is not an oversight this entry can fix by reading: an operator who has
just pushed the wrong build has no specified way to stop it, and at least one server has
implemented superseding on the strength of the silence.

**Not decided here:**

1. **Idempotency: No.** Delete the property-table claim; the second command is always `Rejected`
   with `5107`. Consistent with four sites and one conformance case. Cost: nothing can correct a
   bad push until the first update finishes or the stall timer expires.
2. **Idempotency: Yes, narrowly.** A second command with the **same** `firmwareVersion` **and**
   `checksum` is a no-op answered `Accepted`; any other second command is `5107`. Preserves both
   sites by scoping them. Cost: the station must retain and compare the in-flight parameters, and
   the two answers now depend on a field comparison a server can get subtly wrong.
3. **Add superseding explicitly** — a second command with a *different* `firmwareVersion` cancels
   the first. Answers the operator's real problem. Cost: this is new behaviour, not a
   clarification; it needs its own transition on the FSM (there is currently no edge out of
   `Downloading` except `Downloaded` and `Failed`) and a rule for what the cancelled update
   reports.

---

## OPEN — a firmware URL that is not HTTPS is refused by the schema, and no error code in the registry describes that refusal

**Raised 2026-08-17, in the firmware-cycle arc.**

[`update-firmware-request.schema.json`](schemas/mqtt/update-firmware-request.schema.json) constrains
`firmwareUrl` with `"pattern": "^https://"`. A command carrying `http://` is therefore
schema-invalid, and refusing it is required. What the station answers is not covered:

- **`1011 URL_UNREACHABLE`** — what `TC-DM-004` Part D currently expects. But
  [`07-errors.md` §3.1](spec/07-errors.md) defines `1011` as *"A remote URL … is **not
  reachable**"*, and a station conforming to the pattern never attempts the fetch, so it has
  learned nothing about reachability. The URL may be perfectly reachable.
- **`1005 INVALID_MESSAGE_FORMAT`** — where [§4.2](spec/07-errors.md)'s implicit-codes note routes
  schema failures. But `1005`'s own narrowed definition says it is *"for **unintelligible messages
  only**"*, and an `http://` URL is a well-formed string that the receiver understood completely.
- **`3015 PAYLOAD_INVALID`** — the closest fit by definition: *"structurally valid JSON but a
  **value is wrong in itself** … a value outside its declared range"*, explicitly scoped to *"a
  value that could never be valid"*, which is exactly this. Two obstacles: `3015` is **not** in
  §4.2's UpdateFirmware row, and `4017`'s entry describes `3015` as *"a session-scoped semantic
  failure"* — a characterisation that would have to go if `3015` is to serve here.

**Part D of `TC-DM-004` is left asserting `1011`** rather than being changed to a code this
specification has not chosen. Its Failure Criterion — *"Station accepts an HTTP (non-HTTPS)
firmware URL"* — is correct as written and is the property under test; only the expected code is
unsettled. A negative vector for the pattern now exists at
`conformance/test-vectors/invalid/device-management/update-firmware-request-http-url.json`, so the
**schema-level** refusal is exercised regardless of how the code question is answered.

**Not decided here:** (1) `3015`, adding it to the §4.2 row and removing the "session-scoped"
characterisation from `4017`; (2) `1005`, widening its definition to cover pattern and range
violations, which affects every message; (3) a new firmware-specific code; (4) `1011` retained,
with its definition widened to cover a URL refused without being attempted.

**Extended `0.23.0` — GetDiagnostics [MSG-018] has the identical hole, and its half was worse.**
[`get-diagnostics-request.schema.json`](schemas/mqtt/get-diagnostics-request.schema.json)
constrains `uploadUrl` with the **same** `"pattern": "^https://"`. Two differences make the
diagnostics side the sharper of the two:

- `get-diagnostics.md` §6 rule 1 was **stronger** than the firmware rule — it named malformed URLs
  outright (*"If the URL is unreachable **or malformed**, the station **MUST** respond with
  `Rejected`"*), so the specification mandated a refusal for which it supplied no code. That
  sentence has been split in `0.23.0`: the unreachable half keeps `1011`, and the malformed half is
  now stated as open rather than as an obligation a conforming station cannot discharge.
- [`get-diagnostics-response.schema.json`](schemas/mqtt/get-diagnostics-response.schema.json)
  requires **both** `errorCode` and `errorText` on every `Rejected`, so unlike firmware there is no
  shape in which a station can refuse without naming a code. Whatever is decided for firmware binds
  here too, and the option space is the same four.

The mirror negative vector now exists at
`conformance/test-vectors/invalid/device-management/get-diagnostics-request-http-url.json`, so the
schema-level refusal is exercised on both messages. **Neither message has a code.** This is the
class recorded twice before under a different name — a refusal a registry cannot express — and it
is now two instances of one question, not two questions.

---

## DECIDED (0.23.0) — `DiagnosticsUploadUrl` had no reachable consumer and is withdrawn rather than defined

**Raised and closed 2026-08-18, in the diagnostics-cycle arc.**

[`08-configuration.md` §6](spec/08-configuration.md#6-device-management-configuration-keys) declared
`DiagnosticsUploadUrl`, type string, default `""`, `Mutability: Static`, described as *"HTTPS URL
for diagnostics file upload. **Empty string disables diagnostics upload.**"* Neither half could be
acted on. `uploadUrl` is `Required: Yes` in
[`get-diagnostics.md` §3](spec/profiles/device-management/get-diagnostics.md) and in its request
schema, so no request ever fell back to a configured value; and no processing rule read the key,
while no error code described *"diagnostics upload is disabled on this station"*.

**Measured before deciding, and this is what decided it.** No implementation consumes it: the
reference server holds it in its configuration registry and can push it, and reads it nowhere; the
PHP SDK carries the key name in `ConfigurationKey` and nothing else; the TypeScript SDK and the
station simulator have no reference to it at all. There was no behaviour to legalise — only a name
with no reader, which is why it survived four releases without anyone being wrong about it.

**Decided: withdrawn.** The registry is 28 keys, Device Management is 3. Two options are closed by
that choice and are recorded so they are not rediscovered: making the key a station-side gate (a
station with `""` refuses GetDiagnostics), and relaxing `uploadUrl` to OPTIONAL so the key becomes
the default it was described as. Both needed a new registry code for *"diagnostics upload is
disabled"*, and neither had a consumer asking for one. A third option — keep it as an advisory hint
and delete only the *"Empty string disables"* sentence — describes what every implementation already
does, and was rejected because a non-normative key in a normative registry is exactly the shape that
produced this entry.

**The cost, which is operational rather than editorial.** An unknown key is answered `NotSupported`
([`change-configuration.md` §6](spec/profiles/device-management/change-configuration.md) rule 5),
and rule 2 makes the batch atomic: **one `NotSupported` entry discards every other key in the same
ChangeConfiguration**. So a server that still carries `DiagnosticsUploadUrl` in a push set finds
that batch wholly ineffective against a `0.23.0` station while the identical batch still applies on
`0.22.0` — a mixed fleet fails asymmetrically, and silently from the operator's side, because the
response is a per-key verdict array rather than an error. **Servers MUST remove the key from any
push set before a `0.23.0` station is in the fleet.** Downstream: the PHP SDK's
`ConfigurationKey::DIAGNOSTICS_UPLOAD_URL` case is a breaking removal for its consumers, and the
reference server's configuration registry needs the entry dropped.

---

## OPEN — a station whose hardware genuinely changes has no route back into service, because the two rules that guard topology point at each other

**Raised 2026-08-18, in the diagnostics-cycle arc, from the reprovisioning restanță.**

A bay is physically added to, or removed from, a station. Both ends refuse, and each names the other
as the remedy:

| Step | Rule | Outcome |
|---|---|---|
| The station boots and declares its new topology | [`05-state-machines.md` §1.5](spec/05-state-machines.md#15-topology-at-boot); `3018 TOPOLOGY_MISMATCH` | **`Pending`**. The station answers commands and serves no customers. Its own registry entry says the recovery is: *"If the hardware genuinely changed, **re-provision** the station, which re-creates the bay records."* |
| The operator re-provisions | [`04-flows.md` §2](spec/04-flows.md), *Error precedence* step 5; `4020 BAY_COUNT_MISMATCH` | **`422`**. The declared `bayNumber` set **MUST** equal the set registered for the station the token is bound to — as a set. The registered set is the **old** one, which is the whole reason the boot failed. |

`3018` sends the operator to provisioning; provisioning compares against the record `3018` is
complaining about. The loop closes.

**And there is no third door.** [`07-errors.md` §4.4](spec/07-errors.md#44-rest-api-endpoints) lists
every REST endpoint this specification defines. `POST /api/v1/stations/provision` is the only one
that touches a station's bay records, and it creates them; **no endpoint adds a bay, removes a bay,
or edits the registered set.** The station cannot do it either — `3018`'s entry forbids it in terms:
*"The station **MUST NOT** alter its declaration to match the server."* Correctly so: the
declaration describes hardware.

So the escape exists only outside the protocol — an operator editing server-side records by some
means this specification does not define, in an order it does not state. That the order matters is
itself undocumented: the server-side correction **MUST** precede the re-provision, or step 5
compares against the stale set and refuses again, and nothing anywhere says so.

**The option space.**

1. **Relax `4020` at re-provisioning.** Treat a re-provision of an already-registered station as
   authoritative for topology: the declared set replaces the registered set, and `4020` narrows to
   first provision only. Cost: the check exists to catch a firmware bay table that disagrees with
   what an operator registered, and this removes it for exactly the case where the two disagree —
   which is every case it fires on. A typo in a firmware constant would silently rewrite the
   station's topology, and `3018`'s entry says the whole point is that *"agreeing silently would
   hide the very hardware change this code exists to surface."*
2. **Add a server-side topology-correction step before re-provisioning.** A defined operation that
   sets the registered bay set, after which the existing `4020` comparison passes unchanged. Cost:
   a new endpoint or a new administrative act this specification would have to define, **and an
   ordering rule** — correction, then token, then provision. Nothing today documents that ordering,
   which is the part most likely to be got wrong once, silently, by whoever implements it first.
3. **Give `4020` a discriminator and a documented recovery.** Keep the refusal but make it
   actionable: the entry already **MUST** carry `details.declaredBayNumbers` and
   `details.registeredBayNumbers`, so add a `details.phase`-style member distinguishing *first
   provision* from *re-provision of a registered station*, and state the operator procedure for the
   second. Cost: cheapest, and it closes the documentation hole without closing the loop — the
   operator still needs a mechanism option 2 would define.
4. **Say the case is out of scope.** A station whose hardware changes is decommissioned and
   re-commissioned under a new `stationId`. Cost: it is an honest answer, and it discards the
   station's history — sessions, meter values, receipts — or forces a migration this specification
   also does not define. Note that transfer and decommissioning are already absent from every
   document in this repository.

**Recommended: 3 now, 2 next.** 3 is a text change that makes the trap visible to the operator who
hits it; 2 is the mechanism, and it needs the ordering written down in the same change that
introduces it.

> **UPDATE 2026-08-28 — half closed, by option 2 arriving from the implementation rather than from
> an endpoint.** See
> [DECIDED (0.26.0)](#decided-0260--the-topology-comparison-never-named-its-referent-and-the-literal-reading-made-one-retired-bay-stop-a-station-selling).
> The reference server built the server-side topology correction this entry's option 2 described —
> a bay leaves service by being retired, never by being deleted — and scoped **both** comparisons to
> the bays in service. `05-state-machines.md` §1.5 now defines that referent as the **in-service
> topology** and the other five sites cite it.
>
> **What that closes.** The loop itself. The operator corrects the server-side record; the next boot
> compares against the corrected set and matches; `3018` clears without a re-provision, so step 5's
> `4020` is never reached and the two rules stop pointing at each other. The ordering worry in
> option 2 — *correction, then token, then provision* — dissolves with it, because the correction
> alone is now sufficient and no token is spent.
>
> **What stays open, and why this entry is not marked DECIDED.** The **mechanism** is still
> undefined: §4.4 lists every REST endpoint this specification has, and none of them adds a bay,
> removes one, or takes one out of service. An implementation still has to invent that surface, and
> two implementations will invent different ones. The escape is no longer *outside the protocol* —
> its effect is normative now — but the act that triggers it still is.

---

## OPEN — the `FirmwareDowngradeAttempt` SecurityEvent names the offered version with two different member names, and nothing can tell

**Raised 2026-08-17, in the firmware-cycle arc.**

| Artefact | Member name |
|---|---|
| `conformance/test-vectors/valid/security/security-event-firmware-downgrade-attempt.json` | `offeredVersion` |
| `conformance/test-cases/security/TC-SEC-004.md` (payload, and the step that asserts it) | `attemptedVersion` |

Both agree on the sibling `currentVersion`. Neither name appears anywhere else in the repository,
and **no normative document defines `details` for this event at all** — there is no third site to
break the tie.

**Nothing detects the divergence.** [`security-event.schema.json`](schemas/mqtt/security-event.schema.json)
declares `details` as `{"type": "object", "additionalProperties": true}` with no `properties`, so the
vector validates, the conformance case's payload validates, and a server reading either name
validates. A station emitting `offeredVersion` to a server matching `attemptedVersion` produces a
SecurityEvent that is accepted, stored, and silently missing the one field that says what was
refused.

**Not decided here.** The evidence points both ways and is thin either way: `offeredVersion` matches
the prose that stations implement against — [`06-security.md` §4.6.1](spec/06-security.md) and the
implementors' guide both say *"the **offered** `firmwareVersion`"* — and it is the name in the
machine-readable artefact that SDKs and CI consume. `attemptedVersion` matches the event type name
and has two occurrences to the other's one, though both are in a single file.

Whichever is chosen, the fix is not only to rename the loser: the event's `details` shape needs a
normative home, and this event has no worked example inside `spec/` at all — the only worked
`FirmwareIntegrityFailure` example is the boot-time variant, and `FirmwareDowngradeAttempt` has
none.

---

## DECIDED (0.20.0) — UpdateFirmware had no row in the `Pending` command table; it is `Rejected`, and the discriminator gained the clause that says why

> **REVERSED in `0.21.0`.** The verdict below was wrong and the entry is kept unedited as the record
> of it. Option 2 — `Accepted` with the notifications suppressed — was the right one, and the
> reasoning that rejected it is dissected in
> [DECIDED (0.21.0)](#decided-0210--updatefirmware-to-a-pending-station-was-refused-on-a-premise-the-same-chapter-contradicts-and-with-a-response-no-error-code-could-carry).
> **The discriminator's second clause survives the reversal**; only the reading of it was defective.

**Raised 2026-08-17, in the firmware-cycle arc. This one blocks a server implementation, not just a
reader.**

[`05-state-machines.md` §1.4](spec/05-state-machines.md) enumerates what a restricted station does
with each command it may receive: TriggerMessage three ways, SetMaintenanceMode, GetDiagnostics,
TriggerCertificateRenewal, and a collective row for ChangeConfiguration, GetConfiguration,
UpdateServiceCatalog, CertificateInstall and Reset. **UpdateFirmware appears in no row, not even the
collective one.**

The section's own discriminator — *"whether the command has an effect independent of the message it
would emit"* — does not settle it. UpdateFirmware's effect is emphatically independent of any
message: it downloads, verifies, writes a partition and reboots. But §1.4 also forbids a restricted
station to originate FirmwareStatusNotification, and that message is not incidental progress
reporting here — it is the *only* channel on which the update reports anything at all until the
station reboots.

So the "answer normally, suppress the report" outcome, which is what the discriminator gives for
SetMaintenanceMode and GetDiagnostics, has a consequence it does not have for those two: the
server is told `Accepted` and then hears nothing for the entire update, and
[`firmware-status.md` §6](spec/profiles/device-management/firmware-status.md) rule 3's stall timer
fires after five minutes on an update that is proceeding correctly. For GetDiagnostics the
suppressed events are progress on an upload that completes regardless; here they are the whole
report.

**Decided 2026-08-17, for 0.20.0: option 1 — `Rejected`, with an explicit row in §1.4's table.**
The absence of a row is what produced the ambiguity, so the repair is a row and not a convention.

**The discriminator gained a second clause, because the first one answered wrongly.** *"Whether the
command has an effect independent of the message it would emit"* puts UpdateFirmware with
SetMaintenanceMode and GetDiagnostics — answered `Accepted`, report suppressed. The difference is in
kind: SetMaintenanceMode's suppressed StatusNotification reports a bay state the post-boot report
carries anyway, and GetDiagnostics' suppressed events are progress on an upload that completes at a
URL the server chose. FirmwareStatusNotification is the **entire** account of the update from
`Accepted` until the reboot. The discriminator now also asks whether the suppressed message is a
*report about* the effect or the *only account of it there will ever be*. Option 2's proposed
stall-rule exception was rejected with it: it would have made the server's only instrument for the
operation an exception to itself.

**The option space as it stood:**

1. **`Rejected`.** A `Pending` station takes no firmware. Simplest, and consistent with the
   restriction's stated purpose — a station not cleared to work is not cleared to re-flash itself.
   Cost: an operator recovering a station stuck at `Pending` cannot push firmware to it, and
   `07-errors.md`'s `1007` entry already treats "cannot be handed a firmware update while
   restricted" as the thing that forces a site visit.
2. **`Accepted`, notifications suppressed, per the discriminator.** Consistent with the two
   commands already handled that way. Cost: the stall timer fires on a healthy update; §6 rule 3
   would need an exception for restricted stations, which is a rule about a state the server can
   see, so it is expressible.
3. **`Accepted`, and FirmwareStatusNotification added to the §1.4 exception** alongside
   BootNotification and SignCertificate. Cost: the exception's stated test is *messages that repair
   the station's own standing with the server*, and a firmware progress report does not repair
   standing — this would break the test the way 0.19.0 declined to break it, and that release's
   entry says in terms why a list is worse than a test.

---
## DECIDED (0.19.0) — one table gave the same act opposite verdicts, and a certificate renewal could not conclude in the state the spec keeps open for repairs

`05-state-machines.md` §1.4, *Command sent to a `Pending` station*, is a single table at
`:106--111`. Two of its rows govern the same act — the station originating a SignCertificate
REQUEST [MSG-022] — and reach opposite verdicts.

- `:109` refuses it. TriggerMessage [MSG-026] with `requestedMessage: "SignCertificate"` is
  **`Rejected`**, and the row states its reason: *"SignCertificate originates a REQUEST it may
  not send either"*.
- `:111` permits it. *"ChangeConfiguration, GetConfiguration, GetDiagnostics,
  UpdateServiceCatalog, a certificate operation, Reset"* are **"Answered normally"**, on the
  stated ground that *"Each returns its result in a RESPONSE, which is not something the
  station originates"*.

TriggerCertificateRenewal [MSG-024] is a certificate operation, and `06-security.md:591` fixes
what answering it normally means: *"the station responds with `Accepted` and initiates the
automatic renewal flow (steps 1--11 above)"*. Step 3 of that flow (`06-security.md:573`) is
*"Station sends the CSR via SignCertificate REQUEST [MSG-022]"* — the exact message `:109`
declares forbidden. **The stated ground is false for this member of its own list:** a
TriggerCertificateRenewal RESPONSE is not the result, it is an acknowledgement that the result
will arrive in a message the station may not send.

The outcome is the one the paragraph directly above the table condemns. `:104`: *"A command
whose only effect is an EVENT cannot be honoured while restricted, and must be refused rather
than half-done. ... one that accepts it and stays silent **has answered `Accepted` to something
it did not do**. Neither is conforming."*

**The consequence is not symmetric with the other restricted-state gaps.** `:92` explains that
`Pending` holds the command channel open so a human can repair something, and names *"a
certificate operation"* among the repairs. A station held at `Pending` inside its renewal
window is the case that window exists for, and renewal is the one repair it cannot perform.

**A second row has the same defect and a different fix.** GetDiagnostics is also in the
"Answered normally" list, and [`get-diagnostics.md` §5 rule 2](spec/profiles/device-management/get-diagnostics.md)
states *"On `Accepted`, the station **MUST** begin collecting diagnostics and send
DiagnosticsNotification events to report progress"* — while `:109` names DiagnosticsNotification
among the EVENTs a restricted station may not send. That one is repairable by the carve-out the
table already applies to SetMaintenanceMode at `:110`, which names the suppressed
StatusNotification explicitly and observes that nothing is lost: the diagnostics upload is an
HTTP PUT to a URL and completes regardless, so only the progress reporting is suppressed and the
RESPONSE stays truthful. **The certificate case admits no such repair** — there the
station-originated message is the entire effect.

**Decided in 0.19.0: the reason for the existing exception was restated to cover both members, and
no second name was added to a list.** A restricted station may originate exactly those messages
that **repair its own standing with the server**. BootNotification restores its registration;
SignCertificate restores the credential without which it cannot connect at all. Nothing else
qualifies — every other originated message reports on the station's *work*, and a restricted
station has not been cleared to do that work.

**Why a test and not a list.** The alternative was to name SignCertificate beside BootNotification
and leave the stated reason — *"the act that ends the restriction"* — false for one of the two
members. That is the exact mechanism that produced this contradiction: a rule whose reason no
longer covers its own contents drifts from whatever restates it. A list has to be remembered; a
test can be applied by the next reader.

**Three measurements decided it against the cheaper option of simply refusing the command.**

1. **Automatic renewal was blocked by the same rule, and more cleanly.** §4.7.1's flow is
   unsolicited by construction, so `:85`, `:96` and `06-security.md`'s signing table all forbade
   it with no counter-text anywhere. The triggered case was never the defect — it was the only
   place the defect was *visible*, because one table happened to give two answers there.
2. **The restricted state is unbounded.** Retries are unlimited (`:71`, `boot-notification.md`
   §5), no edge leaves `Pending` but an `Accepted` boot (`:74`), and both entry reasons are
   cleared by a person and never by time. Against a one-year certificate with a 30-day renewal
   window — about one twelfth of its life — and two entry reasons that are exactly the state a
   station is in just after a technician has been on site, the overlap is ordinary rather than
   exotic.
3. **Refusing would have specified the failure the mechanism exists to prevent.** Renewal was
   introduced so that expiry — whose recovery is a site visit — does not happen. A rule that
   suspends it in an unbounded state produces that site visit by design.

**The exception limits itself and the specification says so, deliberately.** SignCertificate is in
the signed 44 (`06-security.md` §5.6) and a sender with no key **MUST** refuse to send rather than
send unsigned (§5.7); `Booting` and `Rejected` hold no session key. It is therefore structurally
impossible outside `Pending`, and §1.4 now tells the reader **not** to add a scope rule saying so —
a redundant restriction is how a rule starts drifting from the thing it duplicates.

**The phrase "a certificate operation" did not survive.** It collapsed CertificateInstall
[MSG-023], which genuinely returns its result in a RESPONSE, with TriggerCertificateRenewal, which
cannot — and the collapse is what hid the disagreement. The table is now grouped by an explicit
discriminator: whether the command has an effect independent of the message it would emit.
**GetDiagnostics was repaired in the same change** under that discriminator — its archive upload is
an HTTP PUT that completes, so only the DiagnosticsNotification progress events are suppressed,
exactly as for SetMaintenanceMode. And `TriggerMessage` was mislabelled `[MSG-018]` at `:108` — the
only such site in the tree, against six that give MSG-018 to GetDiagnostics — corrected in passing.

---

## DECIDED (0.18.0) — every cause of `1004` was an instance of `1003`'s second cause, and the conformance case exercising both accepted either

`07-errors.md:266` defines `1003 TLS_HANDSHAKE_FAILED` as *"TLS handshake failed (cipher
negotiation, certificate validation, or version mismatch)"*. `:267` defines `1004
CERTIFICATE_ERROR` as *"X.509 certificate is expired, revoked, self-signed, or has an invalid
chain"*. **All four of `1004`'s causes are certificate-validation failures**, so `1004` names a
strict subset of `1003`'s second cause. Both are `Critical`, both are category `T`
(`:896--897`). Nothing states which applies when both do.

The two sites that assign them disagree about the overlap:

- `02-transport.md:106--107` carves out exactly one cause — *"TLS handshake fails (invalid
  cert) | Station **MUST** log error `1003`, retry with backoff"* against *"Certificate expired
  | Station **MUST** log error `1004`, alert operator"*, restated at `:886--887`. **Revoked,
  self-signed and invalid-chain fall to `1003` here**, being invalid certs and not expiry.
- `06-security.md:1511` sends one of those three the other way: *"BootNotification from revoked
  certificate | Reject with `1004 CERTIFICATE_ERROR`"*, and `07-errors.md:267` agrees, requiring
  `revoked` as a `details.cause` branch of `1004`.

**The conformance case cannot adjudicate itself.** `TC-SEC-002` pins `1004` alone for expired
(`:58`) and for revoked (`:77`), accepts *"`1003` ... or `1004`"* for self-signed (`:68`), and
then states in Expected Results that *"The station logs the appropriate error code (`1003` or
`1004`) for each certificate failure scenario"* (`:96`), with Failure Criterion 5 failing a
station only if it logs **neither** (`:106`). A station logging `1003` for a revoked certificate
fails step 31 and passes both summary criteria. `TC-SEC-008` accepts either code at all three of
its checks (`:73`, `:82`, `:108`).

`07-errors.md` has an established convention for precisely this, unapplied here: four registry
entries carry an explicit **"Distinct from"** clause naming the code they must not be confused
with — `2014` (`:299`), `2015` (`:300`), `4017` (`:364`) and `4020` (`:382`). **Neither `1003`
nor `1004` carries one.**

**Decided in 0.18.0: specificity wins.** Every failure a certificate caused is `1004` with its
required `details.cause`; `1003` is narrowed to a handshake that failed for a reason no
certificate caused — cipher-suite or protocol-version negotiation. It was the only option
consistent with `1004`'s existing four-way branch and with the two `TC-SEC-002` steps that already
pinned it. The two alternatives were rejected: *layer wins* (anything at a handshake is `1003`)
contradicts `1004`'s own `expired` recovery, which is reached at a handshake; *both,
deliberately* would keep two codes for one event and leaves a receiver selecting between them.

**The missing convention was treated as the cause, not the symptom.** Both entries now carry an
explicit **"Distinct from"** clause naming the other, in the form `2014`, `2015`, `4017` and
`4020` already use — the absence of that clause is what let the two registry entries describe
overlapping conditions for as long as they did.

**The instrument was repaired in the same change**, because it could not adjudicate itself:
`TC-SEC-002` now requires `1004` with the matching `details.cause` at every one of its three
certificate scenarios, and its Expected Results and Failure Criteria no longer accept `1003` as a
substitute — previously a station logging `1003` for a revoked certificate failed step 31 and
passed both summary criteria. `TC-SEC-008` Parts D and E are pinned to `1004` /
`details.cause: invalid-chain`. **Part C is the residue and is recorded separately below.**

---

## DECIDED (0.18.0) — the certificate urgency scale was stated twice, and the expired row was the one that differed

The four-row scale appears at `06-security.md:595--600` (§4.7.3 *Emergency Renewal*) and at
[`certificate-renewal.md` §5](spec/profiles/security/certificate-renewal.md) *Priority Levels*,
`:96--102`. **Three of the four rows are identical.** The `0 (expired)` row is not:

- `06-security.md:600` — *"Certificate has expired. **Station enters offline-only mode (BLE).**
  Recovery requires..."*
- `certificate-renewal.md:102` — *"Certificate has expired. **Station treats next TLS failure as
  connection loss and reconnects. If reconnection fails due to certificate rejection,** station
  enters offline-only mode (BLE). Recovery requires..."*

A third site describes the same moment and matches neither: `02-transport.md:107` gives expiry
*"log `1004`, alert operator"*, where the row beside it gives a failed handshake *"retry with
backoff"*. The contrast between adjacent rows reads as withholding the retry — which is the step
`certificate-renewal.md:102` inserts.

**Neither copy of the scale carries an RFC 2119 keyword on any row**, so neither binds on its own
and the ordinary tie-breakers do not reach them. No general precedence rule exists between a
chapter and a profile document: `00-introduction.md:174` orders schema above prose,
`05-state-machines.md:741` orders the station FSM above the bay and session FSMs, and
`06-security.md:431` marks one bullet as *"a summary of §2.1, which states the requirement
normatively and is authoritative"* — but §4.7.3 is marked neither summary nor source, and
`06-security.md:617`'s *"For the complete certificate renewal profile, see..."* points at the
profile without ordering the two.

**What separates the copies is observable.** Under the chapter, an expired station is serving BLE
customers immediately. Under the profile it is in a reconnect cycle first, and every attempt in
that cycle fails for the reason that started it — the certificate is expired.

**Decided in 0.18.0: one normative statement, the other site refers to it.** The duplication was
treated as the cause — three copies, none carrying an RFC 2119 keyword, is why they drifted — so
the scale now exists once and binds.

**`06-security.md` §4.7.3 is the normative home**, chosen on a measurable criterion rather than on
which document felt more authoritative: it is the site the rest of the specification already cites
for this behaviour. The `1004 CERTIFICATE_ERROR` entry in `07-errors.md:267` — the code that
*branches* on expiry — names §4.7.3 as the fixed recovery for its `expired` branch, twice, and
`TC-SEC-002` step 33 cites it as well. Nothing cited `certificate-renewal.md` §5. That section is
now a pointer, and the four rows carry **SHOULD** at the strengths §4.7.1 and §4.7.2 already
state, with **MUST** on the expired row only.

**The reconnection step was dropped, and that is the one substantive behaviour change.** It cannot
succeed — an expired certificate fails every attempt in the cycle for the reason that started it —
and nothing bounded the cycle, so the station was neither online nor serving BLE customers for the
length of its backoff. `02-transport.md` withholds the retry on that row for the same reason.

**What was considered and not adopted, recorded because it is the argument that would reopen
this.** A station whose clock is **fast** believes itself expired while the server would still
accept it, and for that station a probe is not pointless. The case is narrow — a station that
cannot connect also cannot resynchronise, and the drift must straddle `notAfter` — and the shape
that would cover it is a **single** probe, not the unbounded cycle the superseded copy described.
Adding it is a new requirement neither copy stated, so it was not smuggled in under a
de-duplication; §4.7.3 names it as the shape to reach for if the case is judged worth covering.

---

## DECIDED (0.17.0) — a wire mechanism to shorten the previous-key grace period was evaluated for compromise response and rejected

`06-security.md` §6.7.1 gives the server a compromise posture that changes obligations and adds
nothing to the wire. One wire mechanism was considered on the way there and is recorded here with
its cost, because the gap it addresses is real and the next reader will re-derive it otherwise.

**What was proposed.** A way for the server to tell a station *"discard the cached previous key
now"* — a new Dynamic registry key, or a flag on ChangeConfiguration [MSG-013] — so that
compromise response is not obliged to leave a compromised key acceptable for the grace period at
stations it has already reached.

**Why it looks compelling.** §6.7 step 3 says so outright: the cached key and the grace period are
both internal, *"a server cannot read or set either over the protocol"*. So the one exposure window
the server has actually reached is the one window it has no way to close, and it must wait out a
period whose length it cannot even read.

**Why it was rejected.**

1. **It buys at most the grace period, and only where the server has already succeeded.** Default
   300 seconds, at stations that took the new key. The *unbounded* window — a station not yet
   updated, which goes on accepting the compromised key until it reconnects — is untouched, and
   §6.7.1 establishes that this is the larger exposure by a wide margin: an unreached station does
   not lose verification, it keeps verifying whatever the attacker signs.
2. **The window it closes closes by itself.** Step 4 already obliges the station to discard the
   cached key when the period expires. The mechanism would only make that happen sooner, against
   an attacker who must additionally be physically present at that station over BLE inside the
   window that follows that station's own update.
3. **The cost is not small, and part of it is perverse.** A new key must be authored in both
   statements of the registry (`08-configuration.md` §§2--6 *and* §9) and keep
   `tools/check-config-ranges.py` at baseline; every station must implement it; both SDKs and the
   server gain surface. And because an unrecognized key makes its entry `NotSupported` and *"no key
   in the request is applied"* (`08-configuration.md` §1.3), a server that batches the new key with
   the `OfflinePassPublicKey` push against a station predating it **loses the key push as well** —
   the mechanism can prevent the very remediation it exists to accelerate. Pushing it separately
   avoids that and costs a second round trip to every station during an incident.

**What would reopen it.** The grace period is implementation-defined and this specification states
**no upper bound** on it — §6.7 step 3 gives a 300-second default and lets a vendor expose it as a
`Vendor_` key. A deployment whose stations use a materially longer period turns point 1 on its
head: the window at *updated* stations stops being negligible, and a mechanism to cut it short
starts paying for itself. Evidence of such a deployment — not a hypothetical one — is what should
reopen this. Bounding the grace period from above in §6.7 is the cheaper alternative to reach for
first, and it needs no wire surface either.
