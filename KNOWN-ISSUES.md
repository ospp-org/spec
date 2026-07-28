# OSPP Known Issues

**Date:** 2026-02-27
**Protocol Version:** 0.2.4
**Status:** All issues resolved
**Source:** ospp_audit_v2.md (post-correction audit)

---

## Summary

| Severity | Count |
|----------|------:|
| MAJOR | 0 |
| MINOR | 0 |
| **Total** | **0** |

All 3 CRITICAL issues (AUDIT-V2-001, V2-009, V2-024) have been resolved.
All 31 MAJOR/MINOR issues have been resolved (see resolution tables below).

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

The following 30 issues were resolved in the backlog batch fix:

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
| V2-050 | Flow | MINOR | 00-introduction timestamp: added .000 milliseconds |
| V2-052 | Flow | MINOR | SecurityEvent example: failedMessageId→messageId, failedAction→action |
| V2-053 | Security | MINOR | Security checklist references MessageSigningMode (default: Critical) |

### Resolved in Buffer Capacity Redesign (1 issue removed)

| ID | Category | Severity | Resolution |
|----|----------|----------|------------|
| V2-035 | Buffer | MAJOR | Categorized buffering: MUST buffer TransactionEvent (1000) + SecurityEvent (200); MAY discard 6 regenerable message types. Single source of truth in 01-architecture.md §6.5; 02-transport.md and 07-errors.md reference it. Hardware: 512 KB MUST, 1 MB SHOULD. |

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

---

## OPEN — an in-scope endpoint has failure modes the registry cannot express, and §4.4 lists no 5xx

**Raised 2026-07-28 implementing the flat envelope on `POST /api/v1/stations/provision`.
Recorded as SPEC debt, not an implementation decision — the implementation had to diverge
because the registry offered nothing better.**

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
