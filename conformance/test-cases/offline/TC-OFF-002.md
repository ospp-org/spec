# TC-OFF-002 — OfflinePass Validation (10 Checks)

## Profile

Offline/BLE Profile

## Purpose

Verify that the station correctly performs all 10 OfflinePass validation checks during BLE authentication, rejecting passes that fail any check with the appropriate error code and accepting only passes that satisfy all validation criteria simultaneously.

## References

- `spec/profiles/offline/offline-pass.md` §4 — 10 validation checks
- `spec/profiles/offline/ble-handshake.md` — OfflineAuthRequest / AuthResponse
- `spec/profiles/offline/authorize-offline-pass.md` — Validation checks and error codes
- `spec/07-errors.md` §3.2 — Error codes: 2002 `OFFLINE_PASS_INVALID`, 2003 `OFFLINE_PASS_EXPIRED`, 2004 `OFFLINE_EPOCH_REVOKED`, 2005 `OFFLINE_COUNTER_REPLAY`, 2006 `OFFLINE_STATION_MISMATCH`
- `spec/07-errors.md` §3.4 — Error codes: 4002 `OFFLINE_LIMIT_EXCEEDED`, 4003 `OFFLINE_RATE_LIMITED`, 4004 `OFFLINE_PER_TX_EXCEEDED`
- `spec/profiles/security/security-event.md` — SecurityEvent for invalid credentials
- `schemas/common/offline-pass.schema.json`

## Preconditions

1. Station is in offline mode (MQTT disconnected), BLE advertising active.
2. Station has the server's ECDSA P-256 public key provisioned for signature verification.
3. Station's current `RevocationEpoch` is set to `5`.
4. Station's `lastSeenCounter` for the test user is set to `10`.
5. Station knows its own `stationId` (e.g., `"stn_b1c2d3e4f5a6"`).
6. A baseline valid OfflinePass is prepared with all fields correct:
   - Valid ECDSA P-256 signature, `expiresAt` in the future, `revocationEpoch: 5`.
   - `deviceId` matches test device, station-scoping constraint includes `"stn_b1c2d3e4f5a6"`.
   - `maxUses: 10` (not exhausted), `maxTotalCredits: 100` (not exhausted).
   - `maxCreditsPerTx: 20`, `minIntervalSec: 60`.
   - `counter: 11` (greater than station's `lastSeenCounter` of 10).
7. BLE connection is established and HELLO/CHALLENGE handshake is completed for each sub-test.

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

### Check 2 — Expiry (expiresAt > now)

8. Create an OfflinePass with `expiresAt` set to 1 hour in the past (properly signed).
9. Send OfflineAuthRequest.
10. Verify AuthResponse: `result: "Rejected"`, error code `2003` (`OFFLINE_PASS_EXPIRED`).

### Check 3 — Revocation Epoch (pass epoch >= station epoch)

11. Create an OfflinePass with `revocationEpoch: 3` (station's epoch is `5`).
12. Send OfflineAuthRequest.
13. Verify AuthResponse: `result: "Rejected"`, error code `2004` (`OFFLINE_EPOCH_REVOKED`).

### Check 4 — Device Fingerprint Binding

14. Create an OfflinePass with a `deviceId` that does not match the test client.
15. Send OfflineAuthRequest.
16. Verify AuthResponse: `result: "Rejected"`, error code `2002` (`OFFLINE_PASS_INVALID`).

### Check 5 — Station ID Constraint (allowedStationIds)

17. Create an OfflinePass whose station-scoping constraint does not include the test station `"stn_b1c2d3e4f5a6"` (e.g., scoped only to `"stn_c7d8e9f0a1b2"`).
18. Send OfflineAuthRequest.
19. Verify AuthResponse: `result: "Rejected"`, error code `2006` (`OFFLINE_STATION_MISMATCH`).

### Check 6 — Maximum Uses (maxUses)

20. Create an OfflinePass with `maxUses: 0` (exhausted).
21. Send OfflineAuthRequest.
22. Verify AuthResponse: `result: "Rejected"`, error code `4002` (`OFFLINE_LIMIT_EXCEEDED`).

### Check 7 — Maximum Total Credits (maxTotalCredits)

23. Create an OfflinePass with `maxTotalCredits: 0` (exhausted, or set to a value less than the minimum service cost).
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
39. Verify AuthResponse: `result: "Accepted"`, `sessionId` is returned.
40. Verify the station updates `lastSeenCounter` to `11`.

## Expected Results

1. **Check 0 (Structure):** Missing required fields -> `2002 OFFLINE_PASS_INVALID`.
2. **Check 1 (Signature):** Tampered signature -> `2002 OFFLINE_PASS_INVALID` + SecurityEvent.
3. **Check 2 (Expiry):** Expired pass -> `2003 OFFLINE_PASS_EXPIRED`.
4. **Check 3 (Epoch):** Old epoch -> `2004 OFFLINE_EPOCH_REVOKED`.
5. **Check 4 (Device):** Wrong fingerprint -> `2002 OFFLINE_PASS_INVALID`.
6. **Check 5 (Station):** Wrong station -> `2006 OFFLINE_STATION_MISMATCH`.
7. **Check 6 (Uses):** Exhausted uses -> `4002 OFFLINE_LIMIT_EXCEEDED`.
8. **Check 7 (Credits):** Exhausted credits -> `4002 OFFLINE_LIMIT_EXCEEDED`.
9. **Check 8 (Per-Tx):** Per-tx limit too low -> `4004 OFFLINE_PER_TX_EXCEEDED`.
10. **Check 9 (Rate):** Too frequent -> `4003 OFFLINE_RATE_LIMITED`.
11. **Check 10 (Replay):** Counter replay -> `2005 OFFLINE_COUNTER_REPLAY` (Critical) + SecurityEvent.
12. **Positive:** Valid pass with all checks satisfied -> Accepted.

## Failure Criteria

1. Any check that should fail returns Accepted instead of Rejected.
2. Wrong error code returned for a specific validation failure (e.g., `2003` instead of `2004` for epoch revocation).
3. Counter replay (`2005`) is not flagged as Critical severity.
4. No SecurityEvent is generated for signature failure or replay detection.
5. A structurally invalid OfflinePass (missing required fields) is accepted.
6. The positive control (valid pass) is rejected.
7. Station does not update `lastSeenCounter` after a successful authentication.
8. Rate limiting check (`minIntervalSec`) is not enforced.
