# TC-OFF-002 — OfflinePass Validation (10 Checks)

> **Status: EXPERIMENTAL artefact.** This case exercises the BLE surface, which is EXPERIMENTAL until its cryptographic construction has passed the review of [Chapter 06, Appendix B](../../../spec/06-security.md#appendix-b--ble-cryptographic-review-checklist) — see [Release status](../../../README.md#ble-is-experimental). Its two blockers are closed ([KNOWN-ISSUES](../../../KNOWN-ISSUES.md#closed--the-ble-surface-was-not-implementable-as-written-two-defects)). It is published for review, not for certification, and **Complete compliance cannot be claimed against this revision**.


## Profile

Offline/BLE Profile

## Purpose

Verify that the station correctly performs the OfflinePass validation checks during BLE authentication — ten numbered checks, of which check #5 is withdrawn, so nine performed by the station: #1–#4 and #6–#10 — rejecting passes that fail any check with the appropriate error code and accepting only passes that satisfy all of them simultaneously. "10 checks" in the title is the cited count of the numbered list, not the number a station performs.

## References

- `spec/profiles/offline/offline-pass.md` §4 — the validation checks: ten numbered, #5 withdrawn, nine performed by the station
- `spec/profiles/offline/offline-pass.md` §2.3 — a pass carries no station or organization scope
- `spec/profiles/offline/offline-pass.md` §2.2 — the station's own offline limits, refused with `4002` and `details.constraint`
- `spec/08-configuration.md` §5 — `OfflinePassMaxAge`, the station's own age bound of check #2
- `spec/profiles/offline/ble-handshake.md` — OfflineAuthRequest / AuthResponse, and §4.1's refusals before a station validates a pass: a `sessionProof` that does not match (`2013`), a bay it does not have (`3005`), a service its catalog does not bind to the bay (`3004`), a duration above its `MaxSessionDurationSeconds` (`3010`)
- `spec/06-security.md` §6.5.4 — the device proof that check #4 verifies
- `spec/profiles/offline/authorize-offline-pass.md` — Validation checks and error codes
- `spec/07-errors.md` §3.2 — Error codes: 2002 `OFFLINE_PASS_INVALID`, 2003 `OFFLINE_PASS_EXPIRED`, 2004 `OFFLINE_EPOCH_REVOKED`, 2005 `OFFLINE_COUNTER_REPLAY`
- `spec/07-errors.md` §3.4 — Error codes: 4002 `OFFLINE_LIMIT_EXCEEDED`, 4003 `OFFLINE_RATE_LIMITED`, 4004 `OFFLINE_PER_TX_EXCEEDED`
- `spec/profiles/security/security-event.md` — SecurityEvent for invalid credentials
- `schemas/common/offline-pass.schema.json`

## Preconditions

1. Station is in offline mode (MQTT disconnected), BLE advertising active.
2. Station holds the server key set (`OfflinePassPublicKey`), and the set contains the key that signs the test passes; each pass names that key in `keyId` ([`06-security.md` §6.7](../../../spec/06-security.md#67-server-signing-key-rotation-ecdsa-p-256)).
3. Station's current `RevocationEpoch` is set to `5`.
4. Station's `lastSeenCounter` for the test user is set to `10`.
5. Station knows its own `stationId` (e.g., `"stn_b1c2d3e4f5a6"`).
6. A baseline valid OfflinePass is prepared with all fields correct:
   - Valid ECDSA P-256 signature, `expiresAt` in the future, `revocationEpoch: 5`.
   - `devicePublicKey` is the test device's key, whose private key the test client holds to make the device proof ([`06-security.md` §6.5.4](../../../spec/06-security.md#654-device-proof-of-possession)).
   - The pass names no station and no organization: a pass carries no station or organization scope ([`offline-pass.md` §2.3](../../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)).
   - `maxUses: 10` (not exhausted), `maxTotalCredits: 100` (not exhausted).
   - `maxCreditsPerTx: 20`, `minIntervalSec: 60`.
   - The OfflineAuthRequest envelope carries `counter: 11` (greater than the station's `lastSeenCounter` of 10). `counter` is a member of [`offline-auth-request.schema.json`](../../../schemas/ble/offline-auth-request.schema.json), **not** of the pass — `offline-pass.schema.json` is closed and has no such field.
   - The OfflineAuthRequest names a bay and a service the station has, a `requestedDurationSeconds` whose estimated cost is within the pass's limits ([`offline-pass.md` §4](../../../spec/profiles/offline/offline-pass.md#4-validation-checks-10)), and a `deviceProof` the test client makes over each sub-test's handshake.
7. BLE connection is established and HELLO/CHALLENGE handshake is completed for each sub-test.
8. No station limit is reached: the station's `OfflineModeEnabled` is `true`, fewer than `OfflineWindowHours` have elapsed since its last MQTT connection, and it holds fewer than `OfflineTransactionLimit` offline transactions the server has not yet answered `Accepted`, `Duplicate` or `Rejected` ([`offline-pass.md` §2.2](../../../spec/profiles/offline/offline-pass.md#22-constraints-object); [`08-configuration.md` §5](../../../spec/08-configuration.md#5-offline--ble-configuration-keys)). A station limit refuses with `4002`, the code of checks #6 and #7, so a station that had reached one would make those two checks unreadable.
9. The station's `OfflinePassMaxAge` is `86400` (one day), set before the station went offline ([`08-configuration.md` §5](../../../spec/08-configuration.md#5-offline--ble-configuration-keys)). Every pass the steps present was issued less than a day before it is presented, except the pass of step 41, so the age bound of check #2 fails in step 41 alone.

## Steps

### Check 0 — Structural Integrity (Prerequisite — All Required Fields)

1. Create an OfflinePass with the `sub` field removed (missing required field).
2. Send OfflineAuthRequest.
3. Verify AuthResponse: `result: "Rejected"`, error code `2002` (`OFFLINE_PASS_INVALID`).

### Check 1 — Signature Verification (ECDSA P-256)

4. Modify the baseline OfflinePass by altering one byte of `signature`.
5. Send OfflineAuthRequest with the tampered pass.
6. Verify AuthResponse: `result: "Rejected"`, error code `2002` (`OFFLINE_PASS_INVALID`).
7. Verify a SecurityEvent is logged with `type: "OfflinePassRejected"`.

### Check 2 — Temporal Bounds (expiresAt > now, age <= OfflinePassMaxAge)

Either bound failing is this check failing ([`offline-pass.md` §4](../../../spec/profiles/offline/offline-pass.md#4-validation-checks-10)). The expiry bound:

8. Create an OfflinePass issued 2 hours ago whose `expiresAt` is 1 hour in the past (properly signed).
9. Send OfflineAuthRequest.
10. Verify AuthResponse: `result: "Rejected"`, error code `2003` (`OFFLINE_PASS_EXPIRED`).

The age bound, in steps numbered after the last so that no step is renumbered:

41. Create an OfflinePass issued 2 days ago whose `expiresAt` is 1 day in the future (properly signed): within its platform lifetime, but older than the station's `OfflinePassMaxAge` of `86400`.
42. Send OfflineAuthRequest.
43. Verify AuthResponse: `result: "Rejected"`, error code `2003` (`OFFLINE_PASS_EXPIRED`).

### Check 3 — Revocation Epoch (pass epoch >= station epoch)

11. Create an OfflinePass with `revocationEpoch: 3` (station's epoch is `5`).
12. Send OfflineAuthRequest.
13. Verify AuthResponse: `result: "Rejected"`, error code `2004` (`OFFLINE_EPOCH_REVOKED`).

### Check 4 — Device Binding (the device proof)

14. Present the baseline OfflinePass with a `deviceProof` made by a device key other than the one its `devicePublicKey` names — or by the right key over the transcript of another handshake.
15. Send OfflineAuthRequest.
16. Verify AuthResponse: `result: "Rejected"`, error code `2002` (`OFFLINE_PASS_INVALID`). A station that compared `deviceId` alone accepts both, since every copy of the pass carries the same `deviceId`.

### Check 5 — Withdrawn

Withdrawn with check #5: a pass carries no station or organization scope ([`offline-pass.md` §2.3](../../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)), so there is nothing to vary; steps 17–19 are withdrawn and their numbers are not reused.

### Check 6 — Maximum Uses (maxUses)

20. Exhaust the pass rather than minting an exhausted one: `offlineAllowance.maxUses` carries `"minimum": 1` in [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json), so `maxUses: 0` is schema-invalid and cannot be signed. Issue a pass with `maxUses: 1`, spend it once, then present it again.
21. Send OfflineAuthRequest.
22. Verify AuthResponse: `result: "Rejected"`, error code `4002` (`OFFLINE_LIMIT_EXCEEDED`).

### Check 7 — Maximum Total Credits (maxTotalCredits)

23. Likewise for credits — `maxTotalCredits` also carries `"minimum": 1`, so `maxTotalCredits: 0` is not constructible. Issue a pass whose `maxTotalCredits` is below the cost of the cheapest service (e.g. `1`), so the check fails on the first request.
24. Send OfflineAuthRequest.
25. Verify AuthResponse: `result: "Rejected"`, error code `4002` (`OFFLINE_LIMIT_EXCEEDED`).

### Check 8 — Per-Transaction Credit Limit (maxCreditsPerTx)

26. Create an OfflinePass with `maxCreditsPerTx: 1` (below the minimum cost for any service).
27. Send OfflineAuthRequest for a service that costs more than `1` credit.
28. Verify AuthResponse: `result: "Rejected"`, error code `4004` (`OFFLINE_PER_TX_EXCEEDED`).

### Check 9 — Rate Limiting (minIntervalSec)

29. Using the baseline valid OfflinePass, successfully authenticate (AuthResponse Accepted). Record the timestamp.
30. Immediately (within `minIntervalSec` of 60 seconds) disconnect and reconnect via BLE.
31. Complete HELLO/CHALLENGE again.
32. Send OfflineAuthRequest with the same OfflinePass (counter incremented to next valid value).
33. Verify AuthResponse: `result: "Rejected"`, error code `4003` (`OFFLINE_RATE_LIMITED`).

### Check 10 — Counter Replay Detection

34. Create an OfflinePass with `counter: 10` (equal to station's `lastSeenCounter` of 10, not greater).
35. Send OfflineAuthRequest.
36. Verify AuthResponse: `result: "Rejected"`, error code `2005` (`OFFLINE_COUNTER_REPLAY`), severity `Critical`.
37. Verify a SecurityEvent is logged with `type: "OfflinePassRejected"`.

### Positive Control — All Checks Pass

38. Send OfflineAuthRequest with the unmodified baseline valid OfflinePass (`counter: 11`).
39. Verify AuthResponse: `result: "Accepted"` with `sessionKeyConfirmation`. There is no `sessionId` on AuthResponse — [`auth-response.schema.json`](../../../schemas/ble/auth-response.schema.json) is closed and does not carry one; the session identifier arrives on StartServiceResponse.
40. Verify the station updates `lastSeenCounter` to `11`.

### Refusals Before Validation

41. In four fresh handshakes, send the baseline pass with a fresh `counter` and, in turn, a `sessionProof` that does not match the handshake, a `bayId` the station does not have, a `serviceId` its catalog does not bind to a program of the bay, and a `requestedDurationSeconds` above its `MaxSessionDurationSeconds`. Verify a `Rejected` AuthResponse carrying `2013 BLE_AUTH_FAILED`, `3005 BAY_NOT_FOUND`, `3004 INVALID_SERVICE` and `3010 MAX_DURATION_EXCEEDED` respectively, each before the station validates the pass ([`ble-handshake.md` §4.1](../../../spec/profiles/offline/ble-handshake.md#41-offlineauthrequest-full-offline--partial-b)).

## Expected Results

1. **Check 0 (Structure):** Missing required fields -> `2002 OFFLINE_PASS_INVALID`.
2. **Check 1 (Signature):** Tampered signature -> `2002 OFFLINE_PASS_INVALID` + SecurityEvent.
3. **Check 2 (Temporal bounds):** Expired pass, or a pass older than the station's `OfflinePassMaxAge` -> `2003 OFFLINE_PASS_EXPIRED`.
4. **Check 3 (Epoch):** Old epoch -> `2004 OFFLINE_EPOCH_REVOKED`.
5. **Check 4 (Device):** A device proof that does not verify under the pass's `devicePublicKey` over this handshake -> `2002 OFFLINE_PASS_INVALID`.
6. **Check 5:** withdrawn — a pass carries no station or organization scope, and no result is expected.
7. **Check 6 (Uses):** Exhausted uses -> `4002 OFFLINE_LIMIT_EXCEEDED`.
8. **Check 7 (Credits):** Exhausted credits -> `4002 OFFLINE_LIMIT_EXCEEDED`.
9. **Check 8 (Per-Tx):** Per-tx limit too low -> `4004 OFFLINE_PER_TX_EXCEEDED`.
10. **Check 9 (Rate):** Too frequent -> `4003 OFFLINE_RATE_LIMITED`.
11. **Check 10 (Replay):** Counter replay -> `2005 OFFLINE_COUNTER_REPLAY` (Critical) + SecurityEvent.
12. **Positive:** Valid pass with all checks satisfied -> Accepted.
13. **Refusals before validation:** a `sessionProof` that does not match, an unknown bay, a service the catalog does not bind to the bay, a duration above `MaxSessionDurationSeconds` -> `2013`, `3005`, `3004`, `3010`, before the pass is validated.

## Failure Criteria

1. Any check that should fail returns Accepted instead of Rejected.
2. Wrong error code returned for a specific validation failure (e.g., `2003` instead of `2004` for epoch revocation).
3. Counter replay (`2005`) is not flagged as Critical severity.
4. A presentation that fails a check the station makes before it validates the pass is refused with another code, or its pass is validated first.
4. No SecurityEvent is generated for signature failure or replay detection.
5. A structurally invalid OfflinePass (missing required fields) is accepted.
6. The positive control (valid pass) is rejected.
7. Station does not update `lastSeenCounter` after a successful authentication.
8. Rate limiting check (`minIntervalSec`) is not enforced.
