# TC-SEC-005 — Provisioning Retry Idempotency & Key Binding

## Profile

Security Profile

## Purpose

Verify that the **server's** provisioning endpoint (`POST /api/v1/stations/provision`) distinguishes a genuine retry from a change of provisioned identity. A retry carrying the same public keys MUST replay the originally-issued certificate; a retry carrying **any** different public key MUST be rejected rather than silently replayed, and MUST NOT mint a second certificate on that token. Descriptive-field drift MUST remain ignored.

> **Note.** Unlike TC-SEC-001..004, this case exercises **server** behaviour. The "test harness" here acts as the station; the implementation under test is the OSPP server.

## References

- `spec/04-flows.md` §2 — "Single-use and idempotent retry" (the split rule, comparison basis) and the §2 Error Paths table
- `spec/04-flows.md` §2 — "Re-provisioning an already provisioned station" (a consumed token MUST NOT be reused)
- `spec/07-errors.md` §3.4 — `4015 PROVISIONING_KEY_MISMATCH` (severity `Error`, `recoverable: false`, HTTP `409`)
- `spec/07-errors.md` §2.4 — canonical flat REST error envelope
- `spec/02-transport.md` §9.3 — provisioning idempotency keyed on the token, bounded by key identity
- `spec/06-security.md` §6.5.2 — the static BLE ECDH public key submitted at provisioning
- `schemas/provisioning-response.schema.json`

## Preconditions

1. A station entry exists in the management portal with `stationId` `stn_a1b2c3d4`, not yet provisioned.
2. A provisioning token `T1` has been generated for it (single-use, unconsumed, with a known TTL fixed at issuance).
3. The test harness can generate ECDSA P-256 key pairs and produce CSRs with CN = `stn_a1b2c3d4`.
4. The test harness can generate a static ECDH P-256 key pair (for Part F; required only if the station profile declares `bleSupported`).
5. The test harness can capture full HTTP responses, including status code and body.
6. The harness retains, byte-for-byte, the certificate returned by the first successful provision.
7. The server's certificate store can be inspected (directly or via an operator API) to count certificates issued against `T1`.

## Steps

### Part A — First provision, then a genuine retry

1. Generate key pair `K_tls_1` and produce CSR `CSR_1` (CN = `stn_a1b2c3d4`).
2. Generate receipt-signing key pair `K_rcpt_1`.
3. `POST /api/v1/stations/provision` with token `T1`, `serialNumber: "SN-0001"`, a `bays` array declaring bay numbers **1, 2**, `tlsCsr: CSR_1`, `receiptSigningPublicKey: K_rcpt_1.pub`.
4. Verify the response is `200 OK` and validates against `provisioning-response.schema.json`.
5. Store the returned `clientCert` verbatim as `CERT_1`.
6. Verify `CERT_1`'s public key equals `K_tls_1.pub`.
7. Re-send the **identical** request from step 3, byte-for-byte.
8. Verify the response is `200 OK`.
9. Verify the returned `clientCert` is **byte-identical** to `CERT_1`.
10. Verify the server has issued exactly **one** certificate against `T1`.

### Part B — Descriptive drift MUST still be ignored

11. Re-send the request from step 3 with the **same** keys but altered descriptive fields: `serialNumber: "SN-9999"` and altered program `label` values.
12. Verify the response is `200 OK`.
13. Verify the returned `clientCert` is **byte-identical** to `CERT_1`.
14. Verify the server has still issued exactly **one** certificate against `T1`.

### Part C — Re-encoding the same key is NOT drift

15. Produce a **second** CSR `CSR_1b` over the **same** key pair `K_tls_1` (a fresh CSR; its ECDSA self-signature differs from `CSR_1` because ECDSA signatures are randomised).
16. Verify `CSR_1b` differs from `CSR_1` byte-wise.
17. Re-send the request with token `T1` and `tlsCsr: CSR_1b`, keys otherwise unchanged.
18. Verify the response is `200 OK` and the returned `clientCert` is **byte-identical** to `CERT_1`.
19. Verify the server has still issued exactly **one** certificate against `T1`.

> This step pins the comparison basis. A server comparing raw CSR bytes rather than the DER `SubjectPublicKeyInfo` fails here by rejecting a legitimate retry.

### Part D — CSR public-key drift MUST be rejected

20. Generate a **new** key pair `K_tls_2` and produce CSR `CSR_2` (CN = `stn_a1b2c3d4`).
21. Re-send the request with token `T1`, `tlsCsr: CSR_2`, `receiptSigningPublicKey: K_rcpt_1.pub` (unchanged).
22. Verify the response status is **`409 Conflict`** — specifically **not** `200`, and **not** `400`.
23. Verify the response body is the flat Error Object of §2.4 — error fields at the **top level**, with **no** enclosing `error` member and no sibling members:
    ```json
    {
      "errorCode": 4015,
      "errorText": "PROVISIONING_KEY_MISMATCH",
      "errorDescription": "<human-readable>",
      "severity": "Error",
      "recoverable": false,
      "recommendedAction": "<human-readable>",
      "timestamp": "<ISO 8601 UTC>"
    }
    ```
24. Verify `errorCode` is `4015` and `errorText` is `"PROVISIONING_KEY_MISMATCH"`.
25. Verify `recoverable` is `false`.
26. Verify the server has still issued exactly **one** certificate against `T1` — no second certificate was minted.
27. Re-send the original step-3 request (with `K_tls_1` / `CSR_1`) and verify it still returns `200 OK` with `CERT_1` byte-identical — the rejection did not invalidate the already-issued certificate.

### Part E — Receipt-signing key drift MUST be rejected

28. Generate a **new** receipt-signing key pair `K_rcpt_2`.
29. Re-send the request with token `T1`, `tlsCsr: CSR_1` (unchanged), `receiptSigningPublicKey: K_rcpt_2.pub`.
30. Verify the response status is **`409 Conflict`**.
31. Verify `errorCode` is `4015` and `errorText` is `"PROVISIONING_KEY_MISMATCH"`.
32. Verify the server has still issued exactly **one** certificate against `T1`.
33. Verify the server's stored receipt-signing key for `stn_a1b2c3d4` is still `K_rcpt_1.pub` — the drifted key was not adopted.

### Part F — BLE ECDH key drift MUST be rejected (conditional)

> Applicable only where the station profile declares `bleSupported`, so that the **first provision** carries `stationPubKey` and the key is in the bound set (`06-security.md` §6.5.2). Skip otherwise, and record it as skipped. Note this part exercises BLE-key **value** drift only; a retry that **omits** a bound BLE key, or **adds** one that was not bound, is equally `409` / `4015` per Flows §2 and is not yet covered here.

34. Repeat Part A steps 1–6, but include `stationPubKey: K_ble_1.pub` in the initial provision, using a fresh token `T2` on a second unprovisioned station entry.
35. Generate a new static ECDH key pair `K_ble_2`.
36. Re-send the request with token `T2`, all other keys unchanged, `stationPubKey: K_ble_2.pub`.
37. Verify the response status is **`409 Conflict`** with `errorCode` `4015`.
38. Verify the StationIdentity certificate held by the server for that station still binds `K_ble_1.pub`.

### Part G — Token exhaustion is unchanged

39. Advance time (or otherwise expire `T1`) beyond its TTL.
40. Re-send the original step-3 request with token `T1`.
41. Verify the response is **`401 Unauthorized`**, not `409` — TTL expiry takes precedence over the key comparison.

## Expected Results

1. The first provision returns `200 OK` with a certificate whose public key is the submitted CSR key.
2. An identical retry returns `200 OK` with a byte-identical certificate.
3. Descriptive-field drift (`serialNumber`, program `label`) is ignored — still `200 OK`, still byte-identical.
4. A fresh CSR over the **same** key is treated as a replay, not as drift — the server compares the DER `SubjectPublicKeyInfo`, not raw CSR bytes.
5. CSR public-key drift returns `409 Conflict` with `4015 PROVISIONING_KEY_MISMATCH`.
6. Receipt-signing-key drift returns the same `409` / `4015`.
7. BLE ECDH-key drift returns the same `409` / `4015` where applicable.
8. In every rejection case the server has issued exactly **one** certificate against the token.
9. A rejection leaves the already-issued certificate and the already-stored keys intact and still replayable.
10. Error bodies use the flat top-level Error Object of §2.4 with `recoverable: false`.
11. After TTL expiry the endpoint returns `401`, regardless of key state.

## Failure Criteria

1. **A retry with a different public key returns `200 OK`.** This is the defect the rule exists to prevent: the requester receives a certificate that does not match the private key it holds, with no error.
2. A retry with a different public key returns `400 Bad Request` — the documented action for `400` is "regenerate keys, retry", which on this condition is an infinite loop.
3. A second certificate is minted against the token in any scenario.
4. A fresh CSR over the same key is rejected (server compared raw CSR bytes instead of the `SubjectPublicKeyInfo`).
5. Descriptive drift is rejected, or causes a different certificate to be returned.
6. Receipt-signing-key drift or BLE-key drift is accepted, silently adopted, or ignored while only CSR drift is checked.
7. The error body nests the error fields under an `error` member, carries sibling members, or omits `errorCode` / `errorText` / `timestamp`.
8. `errorCode` is any value other than `4015`, or `recoverable` is `true`.
9. A rejected retry invalidates, revokes, or alters the already-issued certificate.
10. TTL expiry returns `409` instead of `401`.
