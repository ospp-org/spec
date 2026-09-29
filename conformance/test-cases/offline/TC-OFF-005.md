# TC-OFF-005 — Partial B: Station-Relayed Authorization

> **Status: EXPERIMENTAL artefact.** This case exercises the BLE surface, which is EXPERIMENTAL in 0.44 and carries two blockers — see [Release status](../../../README.md#ble-is-experimental) and [KNOWN-ISSUES](../../../KNOWN-ISSUES.md#blocker--the-ble-surface-is-not-implementable-as-written-two-defects). It is published for review, not for certification, and **Extended and Complete compliance cannot be claimed against 0.44**.

> **The numeric rejection code is not on the MQTT wire, and this case does not pretend otherwise.** [`authorize-offline-pass.md` §7](../../../spec/profiles/offline/authorize-offline-pass.md) assigns nine error codes to this action, but [`authorize-offline-pass-response.schema.json`](../../../schemas/mqtt/authorize-offline-pass-response.schema.json) declares no `errorCode` and closes with `additionalProperties: false`. It is one of the seven response schemas named in [`07-errors.md` §2.1](../../../spec/07-errors.md) on which "an `errorCode` cannot be placed on the wire at all"; a rejection reaches the station as `status: "Rejected"` plus a free-text `reason`. Meanwhile [`auth-response.schema.json`](../../../schemas/ble/auth-response.schema.json) makes `errorCode` **REQUIRED** when `result` is `Rejected`, and [§6](../../../spec/profiles/offline/authorize-offline-pass.md#6-processing-rules) obliges the station to relay the rejection "with the appropriate error code". **No mapping from `reason` to a code is specified anywhere in this specification.** Parts C–E therefore assert codes only where the protocol carries them, and *record* — without asserting — the value on the leg where the station must produce a number the wire never gave it. They do not invent a mapping, and neither should an implementer reading this case.

## Profile

Offline/BLE Profile

## Purpose

Verify the **Partial B** connectivity scenario end to end — phone offline, station online. The station **MUST** forward an OfflinePass received over BLE to the server via AuthorizeOfflinePass [MSG-002] rather than validating it locally; the server runs the authorize-time gate — checks #1–#4, #6–#10 and #12, with #5 and #11 withdrawn — and answers `Accepted` (granting `sessionId`, `durationSeconds`, `creditsAuthorized`) or `Rejected`; the station starts no service on a rejection and relays the outcome to the app over BLE; the duration clamp is rooted in the server's value and not in the unsigned advisory copy; and — where the station later loses MQTT — the resulting TransactionEvent takes the **pass-form**, and the server, keyed on `(offlinePassId, passCounter)`, applies no second debit, only a refund-only true-up.

## References

- `spec/profiles/offline/README.md` §5 rule 7 — **the defining Partial B obligation.** With MQTT connectivity and a pass received over BLE, the station **MUST** forward the pass to the server "rather than validating locally". The rule is unconditional while MQTT is up; it does not exempt a pass whose defect the station could see for itself.
- `spec/profiles/offline/README.md` §2 — the connectivity-scenario table that defines Partial B as phone Offline / station Online
- `spec/profiles/offline/authorize-offline-pass.md` §3 / §4 — REQUEST and RESPONSE payloads
- `spec/profiles/offline/authorize-offline-pass.md` §5 — the authorize-time validation checks — #1–#4, #6–#10 and #12; #5 and #11 withdrawn — in order, stopping at the first failure
- `spec/profiles/offline/authorize-offline-pass.md` §6 — processing rules 1–7 (forward unmodified, echo the counter, 15 s timeout, the SecurityEvent discrimination)
- `spec/profiles/offline/authorize-offline-pass.md` §7 — the error-code table for this action
- `spec/04-flows.md` §5c — the Partial B sequence, happy path steps 1–12, and the error-path table
- `spec/04-flows.md` §6 (Billing Authority) — the server recomputes; the station's `creditsCharged` is advisory
- `spec/03-messages.md` §2.1 — the AuthorizeOfflinePass message table: 15 s response timeout, 30 s MQTT expiry, topics
- `spec/06-security.md` §6.1.1 — the station-local check list (**ten numbered checks; #5 is withdrawn and a station performs the other nine**) and the **counter model** note: `counter` is app-global, and the station **MUST** echo it into the signed receipt as `passCounter`
- `spec/profiles/offline/ble-session.md` §1 rule 2 — the duration clamp, and that a Partial-B station roots it in the AuthorizeOfflinePass response value, never the unsigned advisory copy
- `spec/profiles/offline/ble-session.md` §6 rule 1 — the auto-stop timer is the lower of requested and authorized
- `spec/profiles/offline/reconciliation.md` §8 — the correlation-key table (the pass-form settles on `(offlinePassId, passCounter)`), and why `sessionId` is unreachable on that form
- `spec/profiles/offline/reconciliation.md` §8.1 / §8.2 — no-prior-debit settlement, and the settle-once true-up
- `spec/profiles/offline/reconciliation.md` §6.1 — the reconcile-time gate; checks #12 and #13
- `spec/profiles/offline/reconciliation.md` §2 — **response timeout 60 s**, the TransactionEvent timeout of `spec/03-messages.md` §4.1 and the only timeout this action has
- `spec/07-errors.md` §2.1 — the seven response schemas that cannot carry `errorCode`; `authorize-offline-pass-response` is one of them
- `spec/07-errors.md` §1.2 — a server-written SecurityEvent is an **audit row that is not transmitted anywhere**; MSG-012 has no server→station direction
- `spec/07-errors.md` §3.2 — error codes 2002 `OFFLINE_PASS_INVALID`, 2003 `OFFLINE_PASS_EXPIRED`, 2004 `OFFLINE_EPOCH_REVOKED`, 2005 `OFFLINE_COUNTER_REPLAY`, 2014 `OFFLINE_PASS_REVOKED`
- `spec/07-errors.md` §3.4 — error codes 4002 `OFFLINE_LIMIT_EXCEEDED`, 4003 `OFFLINE_RATE_LIMITED`, 4004 `OFFLINE_PER_TX_EXCEEDED`
- `spec/07-errors.md` §4.1 — the AuthorizeOfflinePass [MSG-002] row; `spec/07-errors.md` §4.3 — the AuthResponse (→ OfflineAuthRequest) row. Part E measures both against §7.
- `spec/profiles/security/security-event.md` §3 / §4 — the `OfflinePassRejected` registry row and the `type` enum
- **`schemas/mqtt/authorize-offline-pass-request.schema.json`, `schemas/mqtt/authorize-offline-pass-response.schema.json` — both closed (`additionalProperties: false`); the response's `allOf` requires `sessionId`/`durationSeconds`/`creditsAuthorized` on `Accepted` and `reason` on `Rejected`.**
- **`schemas/ble/offline-auth-request.schema.json`, `schemas/ble/auth-response.schema.json` — both closed; AuthResponse requires *both* `reason` and `errorCode` when `Rejected`, and carries no `sessionId`.**
- **`schemas/mqtt/transaction-event-request.schema.json` — the `oneOf` that fixes the form. The pass-form branch sets `"authId": false` and `"sessionId": false`; Part G asserts an absence against it.**
- **`conformance/test-vectors/valid/security/authorize-offline-pass-request-full.json` — the baseline REQUEST shape and signed pass body used below; `-request-minimal.json` is the same shape at its floor.**
- **`conformance/test-vectors/valid/security/authorize-offline-pass-response-full.json` (the `Accepted` shape) and `-response-minimal.json` (the `Rejected` shape: `status` + `reason`, and nothing else).**

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`, **declaring both `capabilities.bleSupported: true` and `capabilities.offlineModeSupported: true`** ([`profiles/README.md` §4.1](../../../spec/profiles/README.md); [`profiles/offline/README.md` §5](../../../spec/profiles/offline/README.md) rule 1). Both members are REQUIRED in [`boot-notification-request.schema.json`](../../../schemas/mqtt/boot-notification-request.schema.json), so a station always states a value for each; a station that states `false` for either has not declared the Offline / BLE profile and this case does not apply to it.
2. MQTT session is stable: the station is subscribed to `ospp/v1/stations/stn_a1b2c3d4/to-station` and publishes on `ospp/v1/stations/stn_a1b2c3d4/to-server`.
3. Bay `bay_c1d2e3f4a5b6` is in `Available` state, and service `svc_premium` is in the station's catalog with a known price.
4. BLE advertising is active, and the test client can complete the HELLO/CHALLENGE handshake afresh for each sub-test.
5. The phone under test has **no** internet connectivity. Partial B is defined by phone Offline / station Online ([`profiles/offline/README.md` §2](../../../spec/profiles/offline/README.md)); a phone with connectivity would be the Online or Partial A scenario and would exercise nothing here.
6. A baseline valid OfflinePass is prepared. Its shape and signed body are taken from [`authorize-offline-pass-request-full.json`](../../test-vectors/valid/security/authorize-offline-pass-request-full.json); the values this case depends on are:
   - `passId` = `"opass_e7f8a9b0c1d2e3f4"`, `sub` = `"sub_user42xyz"`, `deviceId` = `"device-pixel-8-pro-042"`, and `devicePublicKey` the key of that device.
   - `expiresAt` in the future and no more than 864000 seconds (10 days) after `issuedAt`, the cap on the platform pass lifetime ([`offline-pass.md` §6](../../../spec/profiles/offline/offline-pass.md#6-lifecycle)), and an age within the `OfflinePassMaxAge` the server configured on `stn_a1b2c3d4` (864000 where it configured none — [`08-configuration.md` §5](../../../spec/08-configuration.md#5-offline--ble-configuration-keys)).
   - `revocationEpoch: 7`, equal to the platform `RevocationEpoch` the server holds ([`06-security.md` §6.6](../../../spec/06-security.md#66-epoch-based-revocation)).
   - `offlineAllowance`: `maxTotalCredits: 1000`, `maxUses: 5`, `maxCreditsPerTx: 300`.
   - `constraints`: `minIntervalSec: 0`.
   - `keyId` naming a key of the server's key set, and `signatureAlgorithm: "ECDSA-P256-SHA256"`, with a signature valid under that key.

   > **`minIntervalSec` is `0` deliberately.** Check #9 (rate limit) runs **before** check #10 (counter replay) and processing stops at the first failure, so any non-zero interval would answer Part D's replay with `4003 OFFLINE_RATE_LIMITED` and check #10 would never execute — a green Part D that proved the wrong thing. Isolating #10 requires #9 to be unable to fire. `minIntervalSec` carries `"minimum": 0` in [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json), so `0` is constructible and signable. Check #9 belongs to a case that isolates it; this one does not exercise it.
7. The server holds a stored pass record for `opass_e7f8a9b0c1d2e3f4`, and the pass is not revoked on the server — neither individually nor by a block on `sub_user42xyz`. Neither the pass nor the record names a station or an organization: a pass is valid at any station that accepts offline passes ([`offline-pass.md` §2.3](../../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)), and checks #5 and #11 are withdrawn ([`authorize-offline-pass.md` §5](../../../spec/profiles/offline/authorize-offline-pass.md#5-validation-checks)). Check #12 (individual revocation, `2014`) reads the **server's stored record**, not a wire field, so it cannot be varied by editing the pass the app presents — and it is not exercised by this case.
8. The server's last-seen counter for this pass is `3`. The app's next value is `4`.
9. The harness can inject AuthorizeOfflinePass RESPONSEs, withhold them entirely, and **read the server's SecurityEvent audit store**. Those records are audit rows the server writes and are "not transmitted anywhere" ([`07-errors.md` §1.2](../../../spec/07-errors.md)), so wire capture alone cannot observe Part D.
10. The user's server-side wallet balance is `500` credits, and the operator tariff for `svc_premium` is known to the harness.
11. The fixtures below **elide** the OfflinePass body and the receipt `signature` rather than printing literals. Inline signed payloads in this repository are generated and checked by `tools/sign-inline-md.mjs` and `tools/verify-all-signatures.sh` over an explicit file list; a hand-typed signature would be unverifiable by construction and would assert a value no tool produced. Substitute the signed body from the cited vector.

## Steps

### Part A — The Relay Obligation (the property this case exists to prove)

1. Confirm the station's MQTT session is up, and that a read of FFF1 returns StationInfo [MSG-027] with `connectivity: "Online"`.
2. Complete the BLE HELLO [MSG-029] / CHALLENGE [MSG-030] handshake. Verify CHALLENGE carries `stationConnectivity: "Online"`, as [`04-flows.md` §5c](../../../spec/04-flows.md) step 3 requires. This and `connectivity` on StationInfo are the two members that tell an offline app the station is online, and the enum on both is `["Online", "Offline"]`.
3. Write OfflineAuthRequest [MSG-031] to FFF3 with the baseline pass and `counter: 4`:
   ```json
   {
     "type": "OfflineAuthRequest",
     "offlinePass": { "...": "the signed baseline pass of Precondition 6" },
     "counter": 4,
     "sessionProof": "<Base64(HMAC-SHA256(SessionKey, \"OfflineAuthRequest\" || passId || \"4\"))>"
   }
   ```
4. Observe an AuthorizeOfflinePass REQUEST [MSG-002] published on `ospp/v1/stations/stn_a1b2c3d4/to-server`:
   ```json
   {
     "offlinePassId": "opass_e7f8a9b0c1d2e3f4",
     "offlinePass": { "...": "the same signed pass, unmodified" },
     "deviceId": "device-pixel-8-pro-042",
     "counter": 4,
     "bayId": "bay_c1d2e3f4a5b6",
     "serviceId": "svc_premium"
   }
   ```
5. Verify the forwarded `offlinePass` is **unmodified** (§6 rule 2). Compare the serialized member the app wrote against the serialized member the station published — not a re-serialization of a parsed copy. Re-ordering or re-formatting members would break the very signature the server is about to verify, and a comparison that normalizes both sides cannot see it.
6. Verify `counter` equals the `counter` from the BLE OfflineAuthRequest (§6 rule 3). The value is the app's, and the station only echoes it.
7. Verify the station emits **no** AuthResponse on FFF4 and starts **no** service before the server answers.
8. **Negative control — this step is the case.** Verify that an AuthorizeOfflinePass REQUEST was in fact published. A station that validated the pass locally would answer the app inside its own handshake budget and put nothing on MQTT; the *presence of the publication* is the only observable that separates Partial B from Full Offline, and every later Part presumes it. If step 4 captured nothing, this case **fails here** and the remaining Parts are not run: they would be measuring a Full Offline station against a Partial B specification.

### Part B — Accepted: the Grant, the Relay, and the Clamp

9. Answer the REQUEST with the `Accepted` shape of [`authorize-offline-pass-response-full.json`](../../test-vectors/valid/security/authorize-offline-pass-response-full.json), retargeted to this session:
   ```json
   {
     "status": "Accepted",
     "sessionId": "sess_a1b2c3d4e5f6",
     "durationSeconds": 600,
     "creditsAuthorized": 200
   }
   ```
10. Verify the station stores `sessionId`, `durationSeconds` and `creditsAuthorized` (§6 rule 4).
11. Verify an AuthResponse [MSG-033] on FFF4 with `result: "Accepted"` and `sessionKeyConfirmation` present. There is **no** `sessionId` on AuthResponse — [`auth-response.schema.json`](../../../schemas/ble/auth-response.schema.json) is closed and carries none; the session identifier reaches the app on StartServiceResponse [MSG-035].
12. If the AuthResponse carries `durationSeconds` or `creditsAuthorized`, verify each equals the server's value. Both are **advisory and unsigned** copies for app UX; nothing may be enforced against them.
13. Write StartServiceRequest [MSG-034] with `requestedDurationSeconds: 900` — above the authorized `600`. Verify the station **clamps to 600** and does not reject ([`ble-session.md` §1](../../../spec/profiles/offline/ble-session.md) rule 2: clamping is a SHOULD, rejecting is not what the rule asks for).
14. Verify the clamp was enforced against the value the **AuthorizeOfflinePass response** carried, and verify the auto-stop timer initializes to the lower of requested and authorized — `600` ([`ble-session.md` §6](../../../spec/profiles/offline/ble-session.md) rule 1).

    > **There is no signed duration on this path.** For Partial A the clamp roots in the signed `durationSeconds` claim of `server-signed-auth-claims.schema.json`. Partial B has no signed authorization blob at all: the AuthorizeOfflinePass response is an ordinary MQTT RESPONSE whose integrity comes from the transport, not from a signature over its payload. The rule accommodates this — it names "the `durationSeconds` from the AuthorizeOfflinePass response" for Partial B — and the test asserts exactly that, not a signature that does not exist here.
15. Let the service run and stop normally. Verify the server tracks the session in real time and settles it when the station reports its end — never above the `creditsAuthorized` of step 9, adjusting the authorize-time debit by refund only — and that **no** TransactionEvent is emitted for it ([`04-flows.md` §5c](../../../spec/04-flows.md#5c-partial-b--phone-offline-station-online): a Partial-B session is reconciled through TransactionEvent only if the station loses MQTT before it ends). Part G covers the two cases where it is.

### Part C — Refusal: Expired Pass (check #2 → `2003 OFFLINE_PASS_EXPIRED`)

16. Complete a fresh BLE handshake. Present a properly signed pass identical to the baseline except that `expiresAt` is one hour in the past, with `counter: 5`.
17. Verify the station **still forwards it**. `profiles/offline/README.md` §5 rule 7 is unconditional while MQTT is up: a station that short-circuits an expiry it can read for itself has substituted local validation for the relay, which is the one thing Partial B forbids. The check order is the server's (§5 check #2), not the station's.
18. Answer with the `Rejected` shape of [`authorize-offline-pass-response-minimal.json`](../../test-vectors/valid/security/authorize-offline-pass-response-minimal.json):
    ```json
    {
      "status": "Rejected",
      "reason": "Offline pass expired"
    }
    ```
19. Verify the station starts **no** service (§6 rule 5), and that the bay remains `Available`.
20. Verify an AuthResponse on FFF4 with `result: "Rejected"` carrying **both** `reason` and `errorCode` — the closed BLE schema requires both on this branch, so a response missing either is schema-invalid regardless of what the station knew.
21. **Record, do not assert, the value of `errorCode`.** The code the profile assigns to this refusal is `2003 OFFLINE_PASS_EXPIRED` ([`authorize-offline-pass.md` §5](../../../spec/profiles/offline/authorize-offline-pass.md) check #2 and §7), and `2003` is admitted on this leg by [`07-errors.md` §4.3](../../../spec/07-errors.md)'s AuthResponse (→ OfflineAuthRequest) row. But the server never sent it: the MQTT response carried `status` and `reason` and could carry nothing else. A station that emits `2003` here inferred it from free text by a mapping this specification does not define. Record the value emitted, and record whether it is a member of the §4.3 row. A value outside that row is a finding **against the specification's carrier gap**, not against the station.
22. Verify the server emits **no** SecurityEvent for this refusal. [`authorize-offline-pass.md` §6](../../../spec/profiles/offline/authorize-offline-pass.md#6-processing-rules) is explicit: expiry, epoch revocation, individual revocation, usage limits and rate limit are policy decisions and **MUST NOT** be emitted as SecurityEvents by the server at authorize time. Only checks #1 and #10 emit.

### Part D — Refusal: Counter Replay (check #10 → `2005 OFFLINE_COUNTER_REPLAY`) and the Two Checks That Do Emit

23. Complete a fresh BLE handshake and present the **baseline** pass again with `counter: 4` — equal to, not greater than, the value the server last saw in Part A.
24. Verify the station forwards it. On this path the station holds no authoritative counter horizon: check #10 is the **server's**, run against the server's last-seen value for this pass.
25. Answer `Rejected` with a free-text `reason`. Verify the station starts no service and relays a `Rejected` AuthResponse; record its `errorCode` as in step 21. The profile's code here is `2005 OFFLINE_COUNTER_REPLAY`, severity **Critical**, and `2005` is in the §4.3 row.
26. Read the server's SecurityEvent audit store. Verify a record was written (§6 rule 7) with:
    - `type: "OfflinePassRejected"` — the value is fixed by the enum in [`security-event.md` §4](../../../spec/profiles/security/security-event.md), not chosen (§6 rule 7a).
    - `eventId` matching `^sec_[a-f0-9]{8,}$`, deterministically derived from the **originating REQUEST's `messageId`** (§6 rule 7b). Assert the format and the determinism, not the recommended 16-hex derivation: rule 7b permits a different scheme that meets four stated conditions.
    - `timestamp` reflecting when the **server** detected the failure, not when the station sent the REQUEST (§6 rule 7d).
27. Verify `details` carries `offlinePassId`, the failed check number, the rejection `errorCode` `2005`, the originating `messageId`, the rejected `counter` and the server's `lastSeenCounter` (§6 rule 7c). **This `details.errorCode` is the only place on the entire Partial-B rejection path where the number `2005` appears on any artefact the server produced — and rule 7c states it as a SHOULD.** Record its presence; a station-side conformance verdict does not turn on it.
28. Repeat with a pass whose `signature` has one byte altered (check #1), under a **distinct** `messageId`. Verify a second audit record with `type: "OfflinePassRejected"` and `details.errorCode` `2002`.
29. Verify the two `eventId` values differ. Send a third attempt — another distinct forged signature under a third distinct `messageId` — and verify a third distinct `eventId`. N attempts carried by N distinct REQUESTs produce N distinct audit rows (§6 rule 7b); collapsing them would erase attack-attempt visibility, which is the property the derivation exists to preserve.

### Part E — Refusal: Per-Transaction Limit (check #8 → `4004`), and the Codes With No Carrier

30. Issue a pass identical to the baseline except `offlineAllowance.maxCreditsPerTx: 1` — below the cost of `svc_premium`. `maxCreditsPerTx` carries `"minimum": 1` in [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json), so `1` is the floor and `0` is not constructible.
31. Present it over BLE with the next counter value. Verify the station forwards it, the server answers `Rejected`, no service starts, and the station relays a `Rejected` AuthResponse. The profile's code is `4004 OFFLINE_PER_TX_EXCEEDED` (§5 check #8, §7), and `4004` is in the §4.3 row.
32. Verify **no** SecurityEvent is written: a limit refusal is a policy decision (§6 rule 7).
33. **Enumerate the codes this action assigns that no wire on this path admits.** Record each; do **not** construct a substitute.
    - **`2014 OFFLINE_PASS_REVOKED`** — assigned by [`authorize-offline-pass.md` §5](../../../spec/profiles/offline/authorize-offline-pass.md#5-validation-checks) check #12 and listed in its §7 table, and in [`07-errors.md` §4.1](../../../spec/07-errors.md)'s `AuthorizeOfflinePass [MSG-002]` row, but absent from §4.3's `AuthResponse (→ OfflineAuthRequest)` row. The station may be told the pass is revoked, as free text in `reason`, and has no code on the BLE leg that says so.
    - **`6001 SERVER_INTERNAL_ERROR`** — in §7 and in §4.1's row, absent from §4.3's. The station may be told, and may relay nothing that says so.
    - **`1010 MESSAGE_TIMEOUT`** — mandated by §6 rule 6 (Part F) and likewise absent from §4.3's row.

    > **This is recorded, not repaired, and not routed around.** Substituting a neighbouring code — `2004` for `2014`, say — would report a refusal that did not happen, and would make a station that guessed *correctly* indistinguishable from one that guessed at all. The gap belongs upstream: §4.3's row is narrower than §7's table, and the underlying response schema carries no code in the first place ([`07-errors.md` §2.1](../../../spec/07-errors.md), which names this a "known gap, not a permission").

### Part F — Timeout at 15 Seconds, and a Fallback That Is a MAY

34. Complete a fresh handshake and present the baseline pass with `counter: 6`. Observe the forwarded AuthorizeOfflinePass REQUEST and **withhold the response entirely**.
35. Verify the station treats the request as timed out at **15 seconds** (§6 rule 6; [`03-messages.md` §2.1](../../../spec/03-messages.md), which is where this action's timeout is declared — [`07-errors.md` Appendix B](../../../spec/07-errors.md) names `AuthorizeOfflinePass` (15s) as one of eight actions deliberately not repeated in its own table).
36. Verify the station logs `1010 MESSAGE_TIMEOUT`.
37. **Both continuations conform. Record which one the station took.** [`authorize-offline-pass.md` §6](../../../spec/profiles/offline/authorize-offline-pass.md#6-processing-rules) says the station "**MAY** fall back to local validation if the Offline profile is supported and its `OfflineModeEnabled` is `true`", and that the station's own offline limits then apply; [`04-flows.md` §5c](../../../spec/04-flows.md#5c-partial-b--phone-offline-station-online)'s error-path table restates it, and it is a MAY. A station that refuses instead is conforming, and a case that demanded the fallback would fail a conformant station.
    - **37a — fallback taken.** Verify local validation runs the nine station checks, #1–#4 and #6–#10 ([`06-security.md` §6.1.1](../../../spec/06-security.md#611-offlinepass-validation--10-checks)). Check #5 is withdrawn — a pass carries no station or organization scope ([`offline-pass.md` §2.3](../../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)) — so nine is the whole list, not a shortfall. Verify the session then proceeds exactly as a Full Offline session, with a locally signed receipt — Part G arm 2 settles it.
    - **37b — no fallback.** Verify a `Rejected` AuthResponse and that no service starts. Record the `errorCode` emitted: `1010` is not in §4.3's row (step 33), so whatever the station emits here is outside that row by construction.
38. **Record whether the station re-publishes the REQUEST, and assert nothing about it.** This action has **no retry policy anywhere in the specification**: [`07-errors.md` §5.3](../../../spec/07-errors.md) enumerates Server→Station commands and AuthorizeOfflinePass is Station→Server, §5.4 covers the BLE legs, and §6 rule 6 names only the timeout and the MAY. The action does carry a **30 s MQTT Expiry Interval** ([`03-messages.md` Appendix B](../../../spec/03-messages.md)), but that governs how long the broker retains an undelivered message, not whether the station sends another. A resend here is neither mandated nor forbidden; record the behaviour so the gap is visible rather than resolved by a tester's assumption.
39. Restore the response path and verify the station returns to forwarding on the next OfflineAuthRequest. The fallback is per-request degradation, not a mode the station latches into.

### Part G — The Reconciliation Tail: Pass-Form, and Settle-Once on `(offlinePassId, passCounter)`

> Part B's session stayed online end to end and reconciles nothing. This Part covers the two Partial-B
> sessions that **do** produce a TransactionEvent, and asserts that both take the **pass-form** and that the
> reconcile-time true-up is keyed on `(offlinePassId, passCounter)`. The response timeout on this path is **60 s**, the TransactionEvent timeout
> ([`reconciliation.md` §2](../../../spec/profiles/offline/reconciliation.md#2-sync-procedure)).

40. **Arm 1 — authorized, then MQTT lost mid-session.** Re-run Part A and Part B through step 13 so that an authorize-time grant exists for `counter: 4`, then drop MQTT while the service is running.
41. Let the session complete offline. Verify the station generates an ECDSA-P256-SHA256 signed receipt and makes it available on FFF6.
42. Restore MQTT. After BootNotification `Accepted`, observe the TransactionEvent [MSG-007] the station sends:
    ```json
    {
      "offlineTxId": "otx_d4e5f6a7b8c9",
      "offlinePassId": "opass_e7f8a9b0c1d2e3f4",
      "passCounter": 4,
      "userId": "sub_user42xyz",
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_premium",
      "startedAt": "2026-02-14T13:00:00.000Z",
      "endedAt": "2026-02-14T13:09:58.000Z",
      "durationSeconds": 598,
      "creditsCharged": 199,
      "txCounter": 8,
      "receipt": { "...": "signed receipt; signature per Precondition 11" }
    }
    ```
43. Verify the envelope resolves to the **pass-form**: `offlinePassId` and `passCounter` are present, and `authId` and `sessionId` are **absent**.
44. **Assert the absence of `sessionId` deliberately.** The server issued one at step 9 and the station stored it, but the pass-form branch of [`transaction-event-request.schema.json`](../../../schemas/mqtt/transaction-event-request.schema.json) sets `"sessionId": false` and the message is closed — and [`receipt-data.schema.json`](../../../schemas/common/receipt-data.schema.json)'s pass-form branch does the same under the signature. A station that carries the identifier it holds into this envelope produces a **schema-invalid** message. The identifier is not lost; it is simply not the correlation key on this form ([`reconciliation.md` §8](../../../spec/profiles/offline/reconciliation.md)).
45. Verify `passCounter` equals the `counter` the station presented at authorize time — `4`, the value the app put on the BLE OfflineAuthRequest at step 3 and the station echoed at step 6. It is one app-global value travelling three hops, and the correlation key depends on its being the same number at all three ([`reconciliation.md` §8](../../../spec/profiles/offline/reconciliation.md) correlation-key table; [`06-security.md` §6.1.1](../../../spec/06-security.md) counter-model note).
46. Verify the `passCounter` decoded from the signed `receipt.data` equals the envelope's (reconcile gate §6.1 check #12). A mismatch is `2017 OFFLINE_RECEIPT_MISMATCH` with `details.field="passCounter"`; the envelope copy alone is spoofable, which is why the check exists.
47. Verify the server applies **no second debit**: it debits nothing above `priorDebit` and does not re-debit the full amount ([`reconciliation.md` §8.2](../../../spec/profiles/offline/reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)).
    > **Two things a tester must know before running step 47.** First, §8.2's own forward-guard note (finding N11) records that the Partial-B authorize-time-debit path is **not yet implemented server-side** at the time of writing — so on a reference server this step may exercise a path that does not exist rather than one that is wrong, and a null result here is a coverage fact, not a pass. Second, the key: that note names the idempotency key §8.2 gives the resolved form — `(offlinePassId, passCounter)` on the pass-form, where §8's table states that `sessionId` "is not available on the pass-form and **MUST NOT** be required there". **This case asserts that key**, the one keyed on values the pass-form actually carries and the one §6.1 check #13 already enforces uniqueness on.

48. Verify that nothing the server settles for this session exceeds the `creditsAuthorized` of step 9 and that every adjustment after the authorize-time debit is a refund. Which of the session's records it settles from — its SessionEnded, the ConnectionLost recovery or this TransactionEvent — the specification does not determine: record which, without asserting it. Where it settles from this TransactionEvent, verify it correlates the transaction to the authorize-time debit on `(offlinePassId, passCounter)` and applies a **refund-only true-up** — it caps the recomputed cost at the authorize-time `creditsAuthorized`, refunds `priorDebit − cappedCost` when the capped cost is below `priorDebit`, and otherwise changes nothing — and that the settled amount is the server's **recomputation** from the signed receipt and not the `creditsCharged` the station reported, whether or not the two agree ([`04-flows.md` §6, *Billing Authority*](../../../spec/04-flows.md#billing-authority); [`reconciliation.md` §8.1](../../../spec/profiles/offline/reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b) and [§8.2](../../../spec/profiles/offline/reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)), On this path `creditsAuthorized` is the cap on what the session may be charged, within the pass's own limits ([`reconciliation.md` §8](../../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)). A recomputed cost above it is settled at the cap, and the overrun is a fraud-scoring input, not a debt ([`06-security.md` §7.4](../../../spec/06-security.md#74-fraud-detection--offline-transactions)).
49. Re-send the transaction under a **different** `offlineTxId` but the same `(offlinePassId, passCounter)`. Verify the server hard-rejects it on §6.1 check #13 with `2005 OFFLINE_COUNTER_REPLAY`, and emits an `OfflinePassRejected` SecurityEvent at the gate-rejection point, **before** any persistence attempt (§6.3). This is not the deduplication path: a true wire retransmit carries the **same** `offlineTxId` and is collapsed at §3 before the gate runs.
50. Verify the TransactionEvent response arrives within **60 seconds** (`reconciliation.md` §2).
51. **Arm 2 — the Part F fallback, with no prior debit.** Where step 37a was taken, no authorize-time debit exists: the server never accepted anything. Verify the reconcile settles under [`reconciliation.md` §8.1](../../../spec/profiles/offline/reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b): the server recomputes from the signed receipt and the tariff for its `serviceId` — by service kind on the signed `endReason`, from `durationSeconds` for a pro-rata charge and from `bookedDurationSeconds` for a full one, `ceil(durationSeconds / 60 × priceCreditsPerMinute)` for `PerMinute` and `priceCreditsFixed` for `Fixed` — caps it at the pass's `maxCreditsPerTx` and what remains of its `maxTotalCredits` (§8), and debits the capped amount (§8.1).
52. Verify the envelope for arm 2 is the **pass-form** as well, with the same `sessionId` absence asserted at step 44. The two arms differ in whether a prior debit exists, not in the form they reconcile under.
53. With the user's wallet set, before the station reconnects, below the cost the server will recompute, verify a debit that drives the balance negative is **not** refused (§8.1), that the transaction whose debit left the wallet below zero stays **pending collection** until the user next tops up, and that the server issues the user no offline pass while the balance is below zero (§8.1). A delivered session cannot be un-delivered by refusing to record it.

## Expected Results

1. **The relay happens.** A station with MQTT connectivity that receives an OfflinePass over BLE publishes an AuthorizeOfflinePass REQUEST [MSG-002] and waits, rather than validating locally.
2. **The pass is forwarded unmodified,** and the `counter` on the MQTT REQUEST is the `counter` from the BLE OfflineAuthRequest.
3. **No AuthResponse and no service precede the server's answer.**
4. On `Accepted`, the station stores `sessionId`, `durationSeconds` and `creditsAuthorized`, and relays `result: "Accepted"` with `sessionKeyConfirmation` — carrying no `sessionId`, which the BLE schema does not admit.
5. `requestedDurationSeconds` above the authorized value is **clamped to it**, and the clamp is rooted in the AuthorizeOfflinePass response value, never in the unsigned advisory copy on AuthResponse.
6. A session that stays online end to end produces **no** TransactionEvent.
7. An expired pass is **still forwarded**, and is refused by the server at check #2. The profile's code is `2003 OFFLINE_PASS_EXPIRED`; the MQTT response carries `status` and `reason` only.
8. A replayed `counter` is refused at check #10 (`2005 OFFLINE_COUNTER_REPLAY`, Critical), and the server writes an `OfflinePassRejected` audit record whose `eventId` derives deterministically from the originating REQUEST's `messageId`.
9. A tampered signature is refused at check #1 (`2002 OFFLINE_PASS_INVALID`) and likewise emits. **Distinct REQUESTs produce distinct `eventId`s.**
10. Expiry, limits and rate refusals emit **no** SecurityEvent — only checks #1 and #10 do.
11. A per-transaction cost above `maxCreditsPerTx` is refused at check #8 (`4004 OFFLINE_PER_TX_EXCEEDED`).
12. `2014`, `6001` and `1010` are **recorded as having no carrier** on the legs this case exercises, and no substitute code is emitted in their place.
13. A withheld response times out at **15 seconds** and is logged as `1010 MESSAGE_TIMEOUT`; **either** the local fallback **or** a refusal is conforming, and which one occurred is recorded.
14. Where the fallback runs, it evaluates the **nine** station-side checks, #1–#4 and #6–#10; check #5 is withdrawn.
15. A Partial-B session that loses MQTT reconciles in the **pass-form**, carrying `offlinePassId` and `passCounter` and **not** `sessionId`.
16. `passCounter` is the same value across the BLE request, the MQTT authorize request, the envelope, and the signed receipt.
17. **No second debit**: the true-up, keyed on `(offlinePassId, passCounter)`, is refund-only — it refunds `priorDebit − cappedCost` when the capped cost is lower, never debits more, and never re-debits the full amount.
18. In arm 1 nothing settled exceeds `creditsAuthorized` and every adjustment after the authorize-time debit is a refund, which cannot drive the balance negative, though the authorize-time debit may have; which record settled is recorded, not asserted. In arm 2 the settled amount is the server's recomputation, capped by the pass limits, and may drive the balance negative. A balance below zero, by either debit, leaves the transaction pending collection until the user next tops up and blocks further pass issuance while the balance is below zero; neither debit is refused.
19. A distinct `offlineTxId` reusing a settled `(offlinePassId, passCounter)` is hard-rejected with `2005` and an audit record, before any persistence.

## Failure Criteria

1. **The station answers the app without publishing an AuthorizeOfflinePass REQUEST.** This is local validation wearing Partial B's name, and it is the single defect this case exists to catch: every downstream server-side guarantee — individual revocation (check #12), the platform's current epoch, cross-station usage — is silently discarded, and nothing on the BLE leg looks any different to the user.
2. The station alters the OfflinePass before forwarding it, or normalizes/re-serializes it in a way that would invalidate the signature.
3. The station substitutes its own `counter` instead of echoing the app's, breaking the value the reconcile-time uniqueness gate depends on.
4. The station starts a service, or emits an AuthResponse, before the server's answer arrives.
5. The station starts a service on a `Rejected` response.
6. The station short-circuits a pass it can see is defective — an expired pass, a bad signature — and refuses it locally instead of forwarding it, while MQTT is up.
7. A `Rejected` AuthResponse omits `reason` or `errorCode`; the closed BLE schema requires both, and a response missing either is invalid whatever the station knew.
8. `requestedDurationSeconds` above the authorized value is rejected outright rather than clamped, or is clamped against the unsigned advisory copy rather than the server's value.
9. A session that stayed online end to end emits a TransactionEvent, creating a second settlement for a session the server already tracked.
10. No SecurityEvent audit record is written for a signature failure or a counter replay.
11. A SecurityEvent is written for a **policy** refusal — expiry, epoch, individual revocation, limits, rate — which `authorize-offline-pass.md` §6 forbids the server to emit at authorize time.
12. Distinct authorization REQUESTs that fail check #1 or #10 collapse into a single `eventId`, erasing attack-attempt visibility.
13. A rejection is relayed with an `errorCode` **invented** to stand in for one of the codes named in step 33. A code outside the §4.3 row that the implementation chose deliberately is a finding; a code from that row that names a *different* refusal than the one that occurred is worse, because it is indistinguishable from a correct answer.
14. The timeout fires later than 15 seconds, or is not logged as `1010`.
15. The station latches into local validation after one timeout instead of forwarding the next request.
16. The reconciling TransactionEvent carries `sessionId` or `authId` — a schema-invalid message on the pass-form — or omits `offlinePassId` or `passCounter`.
17. `passCounter` in the envelope differs from the value in the signed `receipt.data`, or from the `counter` presented at authorize time.
18. The server debits the full amount at reconcile for a session already debited at authorize time, or debits anything above the authorize-time debit. **This is the double-spend the settle-once rule exists to prevent, and it is invisible in every green happy path**: both debits are individually well-formed, and only the correlation on `(offlinePassId, passCounter)` distinguishes the second from a first.
19. The server settles the station-reported `creditsCharged` instead of its own recomputation, whether or not the two agree.
20. The server refuses a debit because it would make the balance negative, losing the only record of what was owed; or allows it and does not refuse further offline pass issuance while the balance is below zero; or expires, writes off or collects by any other route a transaction left pending below zero before the user tops up.
21. A distinct `offlineTxId` reusing a settled `(offlinePassId, passCounter)` is accepted, or is answered `Duplicate` rather than `Rejected` — `Duplicate` orders the station to delete a record this case requires be retained.
