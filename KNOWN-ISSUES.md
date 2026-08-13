# OSPP Known Issues

**Date:** 2026-08-13
**Specification-document version:** 0.17.1 (release tag `v0.17.1`)
**Status:** 3 blockers open (all BLE), 17 non-blocking issues open, 1 option evaluated and rejected
**Source:** ospp_audit_v2.md (post-correction audit), plus issues raised in the 0.8.0 cycle and
the arcs since

---

## Summary

| Severity | Count | Where |
|----------|------:|-------|
| BLOCKER | 3 | [BLE surface](#blocker--the-ble-surface-is-not-implementable-as-written-three-defects) — B-1, B-2, B-3 |
| OPEN | 17 | 4xxx grouping · `httpStatus()`/`category()` accessors · `errorText` carrying prose on two messages · provisioning station-side conformance · `StationIdentityCertificate` · **[`retryInterval` and `BootRetryInterval` are one quantity with two ranges](#open--retryinterval-and-bootretryinterval-are-one-quantity-with-two-legal-ranges-and-the-schema-states-only-a-floor)** · [asymmetric evidence on the online money path](#open--the-online-money-path-carries-only-a-symmetric-mac-and-a-symmetric-mac-proves-nothing-to-a-third-party) · [`bayCount` on BLE StationInfo](#open--ble-stationinfo-still-carries-baycount-which-cannot-name-a-bay-and-agrees-with-nothing) · [server-side `FraudDetected` has no SecurityEvent](#open--a-server-that-detects-fraud-at-reconciliation-has-no-securityevent-to-record-the-incident) · [the signing toolchain canonicalizes with the SDK](#open--the-signing-toolchain-canonicalizes-with-the-sdk-so-it-verifies-the-sdk-against-itself) · **[103 of 127 restatements cite no source](#open--a-restatement-that-does-not-cite-its-source-cannot-be-checked-against-it-and-103-of-127-restatements-cite-nothing)** · **[170 numbered rules, and nothing says whether the numbering binds](#open--170-numbered-processing-rules-and-nothing-says-whether-the-numbering-binds)** · **[the SDKs guard vendored schemas but not vendored vectors](#open--the-sdks-byte-guard-the-vendored-schemas-and-guard-the-vendored-vector-corpus-with-nothing)** · **[nothing checks a `Message Expiry` against the category it names](#open--nothing-checks-a-per-message-message-expiry-against-the-category-it-names-and-a-repair-landed-on-the-wrong-message-because-of-it)** · **[one table gives the same act opposite verdicts](#open--one-table-gives-the-same-act-opposite-verdicts-and-a-certificate-renewal-cannot-conclude-in-the-state-the-spec-keeps-open-for-repairs)** · **[`1004`'s causes are all instances of `1003`'s](#open--every-cause-of-1004-is-an-instance-of-1003s-second-cause-and-the-conformance-case-exercising-both-accepts-either)** · [the certificate urgency scale is stated twice](#open--the-certificate-urgency-scale-is-stated-twice-and-the-expired-row-is-the-one-that-differs) |
| CLOSED | 4 | [Device Management Required vs RECOMMENDED](#closed-0160--the-device-management-profile-was-required-in-chapter-08-and-recommended-not-mandatory-in-its-own-readme) — closed in 0.16.0 in favour of the capability · [the bay FSM specified twice](#closed--the-bay-fsm-is-specified-twice-the-two-copies-disagree-and-each-sdk-implemented-a-different-one) — closed by the bay-FSM arc · [SessionEnded belonged to no profile](#closed-0130--sessionended-belonged-to-no-profile-and-the-note-saying-so-was-parked-where-nothing-reads-it) — closed in 0.13.0; both retained with their resolutions |
| DECIDED | 1 | [a wire mechanism to shorten the previous-key grace period](#decided-0170--a-wire-mechanism-to-shorten-the-previous-key-grace-period-was-evaluated-for-compromise-response-and-rejected) — evaluated for compromise response in 0.17.0 and rejected, recorded with its cost and with what would reopen it |
| **Total open** | **20** | |

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
| `httpStatus` | **51 of 114 disagree** |

The 51 split into three kinds, and only the third is a disagreement about fact:

1. **PHP has no arm, TS invented one** (~49 codes). PHP falls to `default => 500`; TS asserts a
   specific status. TS's own registry docblock concedes these are *"sensible defaults derived by
   category/semantics (SDK extension)"*. TS emits `410`, `413`, `501`, `507` — statuses PHP never
   produces for any code.
2. **Both chose, and chose differently** — `2001 STATION_NOT_REGISTERED` php=`422` ts=`401`;
   `2008 ACTION_NOT_PERMITTED` php=`401` ts=`403`.
3. **The spec itself is dual** — §2.4's table lists `2008` under **both** `401` and `403`, so no
   single value is correct for it. This is the case that shows the accessor's shape is wrong, not
   just its contents: a function from code to status cannot represent a code with two statuses.

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
   enumerated, which is how 51 disagreements accumulated unnoticed across two published SDKs.

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
reduced the divergence from 55 codes to 51; it does not resolve the finding.

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
| `conformance/test-vectors/valid/device-management/diagnostics-notification-full.json` | `"Upload in progress to remote server"` |

*Markdown examples:*

| Location | Value | Message |
|---|---|---|
| `spec/03-messages.md:1679` | `"Checksum mismatch after download"` | FirmwareStatusNotification |
| `spec/profiles/device-management/firmware-status.md:141` | `"Download failed: connection timeout after 3 retries"` | FirmwareStatusNotification |
| `spec/profiles/device-management/diagnostics-status.md:60` | `"HTTP PUT returned 503 Service Unavailable"` | DiagnosticsNotification (narrative, not a JSON block) |

The first vector settles what the field is being used for: a value containing two runtime SHA-256
digests cannot be a stable per-code name, and no registry entry could ever supply it.

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

## OPEN — `StationIdentityCertificate` is named as a ChangeConfiguration key but is not in the Chapter 08 registry

`06-security.md:1290` defines how the BLE StationIdentity certificate reaches the station:

> "**Delivery to the station.** Provisioning response, and thereafter ChangeConfiguration [MSG-013]
> (key `StationIdentityCertificate`) for re-issuance — mirroring `OfflinePassPublicKey`
> distribution (§6.7)."

and `provisioning-response.schema.json:82` repeats it for the `stationIdentity` field. But
`StationIdentityCertificate` does not appear anywhere in `08-configuration.md`, whose §2–§6
tables are the registry of standard keys — 29 of them, and this is not one.

`08-configuration.md:47` then decides the outcome:

> "If a station receives a ChangeConfiguration request for a key it does not recognize (neither a
> standard key from Sections 2--6 nor a recognized `Vendor_` key), that key's `results` entry
> **MUST** carry `status: "NotSupported"`, and no key in the request is applied."

So a **conforming** station **MUST** reject the re-issuance write, and the rotation path §6.5.2
depends on cannot complete. The certificate still arrives at first provisioning, so the defect is
confined to re-issuance — which is exactly the path `:1291` says the server relies on, since
`expiresAt` "SHOULD be short" and "the server re-issues before expiry".

**Not fixed here** because closing it means authoring a registry row, and every column is a
decision rather than a transcription: access mode (`W` would mirror `OfflinePassPublicKey`, which
is write-only so GetConfiguration cannot leak credential material), mutability, whether the key
is required only for BLE stations, and what a station does with the previous certificate during
the overlap window `:1209` describes. Recording it rather than inventing those.

Found by a sweep of the Chapter 08 key table for keys whose delivery channel does not exist. That
sweep also confirms the table is otherwise sound: 29 keys, counts agreeing across
`README.md:182`, `08-configuration.md:407` and the §1.5 profile grouping; the three keys with no
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
§1.5 governs **four keys**, so the two might need separate answers — was examined and does
not survive. The four keys have no protocol surface independent of the actions:
GetConfiguration and ChangeConfiguration are themselves Device Management actions, so a
station not declaring the capability can be neither asked for these keys nor told to set
them. Two of the four, `FirmwareUpdateEnabled` and `DiagnosticsUploadUrl`, are switches for
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

## OPEN — the SDKs byte-guard the vendored schemas and guard the vendored vector corpus with nothing

**Third instance in the `0.14.0` cycle of a gate that looks somewhere else**, and the first whose
consequence is that doing the *right* thing breaks the build. Both SDKs vendor two artefacts from
this repository: the JSON schema tree **and** `conformance/test-vectors/`. Both CIs clone the spec
at `.spec-ref` and `diff -rq` the schema tree against it. **Neither diffs the vector corpus.** So
the schemas cannot drift and the vectors drift freely — which is what happened.

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

**And the import currently resolves to defective code.** `package.json` declares `^0.13.0`;
`node_modules/@ospp/protocol` is **0.5.4**, whose `CanonicalJsonSerializer.js` carries both
defects the SDKs repaired at 0.13.0 — `Object.keys(value).sort()` (UTF-16 code-unit order where
[§4.8.1 step 1](spec/06-security.md) requires UTF-8 byte order) and `JSON.stringify(sortKeys(…))`,
which rebuilds a sorted object and thereby discards the sort for integer-like keys.

**Measured exposure: zero.** Across 372 committed JSON files and 1846 objects, no object has keys
whose UTF-8 and UTF-16 orderings differ and none has an integer-like key. No committed signature
is wrong. The defect is latent, not active, which is why 0.13.0 did not re-point the signing chain
in the same change: doing so re-canonicalizes signed artefacts for no present correctness gain,
and the safe order is to bump the dependency first and re-measure.

The fix is to move those five tools onto [`tools/canonical-form.mjs`](tools/canonical-form.mjs),
the single implementation written from the text, and to bring the installed dependency in line
with the declared one. Until then the exposure must be re-measured whenever a signed payload gains
a non-ASCII or integer-like key.

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

## OPEN — one table gives the same act opposite verdicts, and a certificate renewal cannot conclude in the state the spec keeps open for repairs

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

**The option space.** (a) Move TriggerCertificateRenewal to the `Rejected` row on the ground
`:109` already gives, accepting that a station which enters `Pending` inside its renewal window
can be recovered only by re-provisioning. (b) Widen the `Pending` exemption from BootNotification
alone to BootNotification plus SignCertificate, on the ground that both are the station asking to
be let back in — this changes a **MUST NOT** in the §1.4 state table and so changes what a
conforming station may emit. (c) Keep the acceptance and define a deferred completion: the
station accepts, records the obligation, and originates the CSR at the first boot reaching
`Operational` — which needs new text for where that obligation is held and for how long.
Recording rather than picking: (a) narrows what an operator can repair, (b) changes a wire
obligation, and (c) adds a mechanism.

Independently of the choice, **the phrase "a certificate operation" should not survive it.** It
collapses CertificateInstall [MSG-023], which genuinely returns its result in a RESPONSE, with
TriggerCertificateRenewal, which cannot — and the collapse is what hid the disagreement.

---

## OPEN — every cause of `1004` is an instance of `1003`'s second cause, and the conformance case exercising both accepts either

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

**The option space.** (a) Specificity wins — every certificate-validation failure is `1004` with
its required `details.cause`, and `1003` retains cipher negotiation and version mismatch only.
This matches `1004`'s existing four-way branch and the two `TC-SEC-002` steps that already pin
it, and requires editing `02-transport.md:106`, whose *"invalid cert"* parenthetical currently
claims the whole class. (b) Layer wins — anything observed at a handshake is `1003`, and `1004`
is reserved for a certificate judged invalid outside one; this contradicts `1004`'s `expired`
recovery text, which is reached at a handshake. (c) Both, deliberately — the station logs `1003`
for the transport event and `1004` for the certificate judgement, stated as a rule rather than
left to the reader; this is the only option that makes the conformance suite's "either"
correct, and it needs saying in both entries. Recording rather than picking: each changes what a
conforming station logs, and (a) additionally narrows `1003`.

---

## OPEN — the certificate urgency scale is stated twice, and the expired row is the one that differs

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

**The option space.** (a) The profile's step is real and the chapter is the stale copy: keep the
reconnect attempt and reduce the chapter to a pointer — this makes time-to-BLE depend on a
reconnect backoff that nothing bounds. (b) The chapter is right and the inserted step is an
artefact: enter BLE-only at expiry, which is locally determinable from the certificate's own
`notAfter` — `07-errors.md:267` says so explicitly — and needs no failed handshake to discover.
(c) Keep the reconnect but bound it to a single attempt, which is a requirement neither copy
currently states. Recording rather than picking: all three change how long a station stays
unreachable after its certificate expires. **Whichever is chosen, the scale should exist once**,
with the other site reduced to a pointer; the duplication is what let the copies drift.

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
