# TC-SEC-006 — Bare Public Key Validity & Precedence at Provisioning

## Profile

Security Profile

## Purpose

Verify that the **server's** provisioning endpoint (`POST /api/v1/stations/provision`) rejects a **bare** submitted public key that is not an ECDSA P-256 public key, with `400 Bad Request` / `4019 PUBLIC_KEY_INVALID`, and that it does so **at the precedence position [Flows §2](../../../spec/04-flows.md#single-use-and-idempotent-retry) assigns** — after `4010` and before `4016` and `4015`.

Position is the point of the case, not merely the code. A bare key that parses as PEM but carries the wrong curve passes the request schema, so `4017` does not catch it; and the key-distinctness comparison (`4016`) and the bound-set comparison (`4015`) both operate on **decoded** keys, so a key that will not decode makes them undecidable rather than unequal. A server that ran either comparison first would answer a wrong-curve key with the wrong code, or with a spurious mismatch.

> **Note.** Like TC-SEC-005, this case exercises **server** behaviour. The "test harness" here acts as the station; the implementation under test is the OSPP server.

## References

- `spec/04-flows.md` §2 — *Error precedence*, step 5 (submitted public key validity) and its position relative to steps 4, 6 and 7
- `spec/07-errors.md` §3.4 — `4019 PUBLIC_KEY_INVALID` (severity `Error`, `recoverable: true`, HTTP `400`, branches on `details.phase`)
- `spec/07-errors.md` §3.4 — `4010 CSR_INVALID` (the same defect for the key carried inside the `tlsCsr`)
- `spec/07-errors.md` §1.4 — recommended actions are per-code and must hold on every path; branching entries and their fail-safe default
- `spec/07-errors.md` §2.4 — canonical flat REST error envelope, and the HTTP status mapping
- `spec/07-errors.md` Appendix C — the Error Object schema, including the `4019` conditional block requiring `details.phase`
- `spec/06-security.md` §4.3 / §6.5.2 — submitted keys are decoded before comparison; the static BLE ECDH public key

## Preconditions

1. A station entry exists in the management portal with `stationId` `stn_a1b2c3d4`, not yet provisioned.
2. Provisioning tokens `T1`, `T2` and `T3` have been generated for it (single-use, unconsumed, within TTL).
3. The test harness can generate ECDSA P-256 key pairs and produce CSRs with CN = `stn_a1b2c3d4`.
4. The test harness can generate an ECDSA **P-384** key pair and an **RSA-2048** key pair, and export each as SPKI PEM.
5. The test harness can emit a PEM-armoured string whose base64 body is not valid DER.
6. The test harness can capture full HTTP responses, including status code and body.
7. The server's certificate store can be inspected (directly or via an operator API) to count certificates issued against each token.

## Steps

### Part A — Wrong curve on `receiptSigningPublicKey`, before any binding

1. Generate key pair `K_tls_1` and produce a valid CSR `CSR_1` (CN = `stn_a1b2c3d4`).
2. Export the **P-384** public key as SPKI PEM: `K_bad_curve`.
3. `POST /api/v1/stations/provision` with token `T1`, `serialNumber: "SN-0001"`, `bayCount: 2`, `tlsCsr: CSR_1`, `receiptSigningPublicKey: K_bad_curve`.
4. Verify the response status is **`400 Bad Request`**.
5. Verify `errorCode` is `4019` and `errorText` is `"PUBLIC_KEY_INVALID"`.
6. Verify `details.phase` is present and equals `"first-provision"`.
7. Verify `details.field` names `receiptSigningPublicKey`.
8. Verify the response body validates against the Error Object schema of Appendix C.
9. Verify **no certificate** was issued against `T1`.
10. Verify `T1` is still **unconsumed** — repeat step 3 with a correct P-256 `receiptSigningPublicKey` and verify `200 OK`.

### Part B — Wrong algorithm is the same code

11. Export the **RSA-2048** public key as SPKI PEM: `K_bad_alg`.
12. `POST` with token `T2`, a valid CSR, and `receiptSigningPublicKey: K_bad_alg`.
13. Verify the response is **`400`** / `4019`, and that `T2` remains unconsumed.

### Part C — PEM armour is not decodability

14. Construct `K_bad_der`: a string with correct `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` armour whose base64 body does not decode to valid DER.
15. `POST` with token `T2`, a valid CSR, and `receiptSigningPublicKey: K_bad_der`.
16. Verify the response is **`400`** / `4019` — **not** `4017`. The request schema constrains the armour only, so the body passes schema validation and fails here.

### Part D — Precedence: `4010` wins over `4019`

17. Produce `CSR_bad`: a `tlsCsr` whose `SubjectPublicKeyInfo` cannot be decoded.
18. `POST` with token `T2`, `tlsCsr: CSR_bad`, and `receiptSigningPublicKey: K_bad_curve` — **both** defective.
19. Verify the response is **`400`** / **`4010`**, not `4019`. The CSR carries the identity being certified and is judged first.

### Part E — Precedence: `4019` wins over `4016`

20. `POST` with token `T2`, a valid CSR whose subject key is `K_tls_1.pub`, and `receiptSigningPublicKey: K_bad_curve`.
21. Verify the response is **`400`** / **`4019`**, not `422` / `4016`. A key that will not decode to a P-256 point cannot be compared for distinctness, so reuse is undecidable rather than absent.

### Part F — Precedence: `4019` wins over `4015`, and `phase` inverts

22. Provision `stn_a1b2c3d4` successfully on token `T3` with `K_tls_3` and `K_rcpt_3`; store the returned certificate.
23. Retry on `T3` with the same valid CSR but `receiptSigningPublicKey: K_bad_curve`.
24. Verify the response is **`400`** / **`4019`**, not `409` / `4015`. The submitted key cannot be decoded, so it cannot be compared against the bound set.
25. Verify `details.phase` is present and equals **`"retry"`** — the token has issued a certificate.
26. Verify the originally-issued certificate is unchanged and that **no second certificate** exists against `T3`.
27. Verify a subsequent retry on `T3` carrying the **originally bound** `K_rcpt_3` returns `200 OK` with the byte-identical certificate — the `4019` rejection altered no binding.

### Part G — Wrong-form `stationPubKey` (conditional)

> Applicable only where the station profile declares `bleSupported`, so that `stationPubKey` is carried (`06-security.md` §6.5.2). Skip otherwise, and record it as skipped.

28. Construct a 44-character Base64 string over the permitted alphabet whose decoded 33 bytes do **not** form a valid compressed P-256 point (for example, a leading byte other than `0x02`/`0x03`).
29. `POST` on a fresh token with a valid CSR, a valid `receiptSigningPublicKey`, and that `stationPubKey`.
30. Verify the response is **`400`** / `4019`, with `details.field` naming `stationPubKey`. The `ec-public-key` schema constrains length and alphabet only, so this value passes schema validation.

## Expected Results

1. A bare submitted key that is not an ECDSA P-256 public key is rejected `400 Bad Request` / `4019 PUBLIC_KEY_INVALID`.
2. Wrong curve, wrong algorithm, and undecodable-after-armour all carry the same code.
3. `4019` is answered in preference to `4016` and `4015`, and `4010` is answered in preference to `4019`.
4. `details.phase` is always present, and is `first-provision` before the token has issued a certificate and `retry` after.
5. `details.field` names the rejected member.
6. A `4019` rejection consumes no token, issues no certificate, and alters no binding.
7. Every error body validates against the Appendix C Error Object schema.

## Failure Criteria

The implementation **fails** this test case if any of the following occur:

1. A wrong-curve or wrong-algorithm bare key is accepted, or a certificate is issued over it.
2. The response status is other than `400`, or `errorCode` is other than `4019`, on Parts A, B, C, E, F or G.
3. Part D answers `4019` rather than `4010` — the precedence between the two decodability steps is not implemented.
4. Part E answers `4016`, or Part F answers `4015` — a comparison was run on a key that had not been decoded.
5. `details.phase` is absent on any `4019` response, or reports `first-provision` on the Part F retry.
6. A `4019` rejection consumes the token, or alters the bound set, or mints a second certificate.
7. The error body is wrapped, carries siblings alongside the Error Object, or fails Appendix C validation.

---

## Why there is no companion case for `4018 PROVISIONING_TOKEN_CONSUMED`

Recorded so it is not added later as a flaky one.

`4018` branches on `details.reason`, and neither branch is reachable deterministically through the protocol:

- **`already_consumed`** is by definition a **race** — it is returned only when a concurrent request consumed the token between this caller's read and its write. A harness cannot reliably provoke that window, and a case that tried would pass or fail on timing rather than on conformance.
- **`consumed_without_certificate`** requires a token that was consumed by a request which then failed **before** issuing. That is a server-side partial-commit state; the protocol offers no way to create it on purpose, and a harness that manufactured it by writing to the database would be testing its own fixture rather than the implementation.

Both are properly covered by implementation-level tests, where the race can be forced and the partial-commit state constructed directly. What conformance *can* assert about `4018` — that its status is `409`, that `details.reason` is present and within its enum, and that neither branch mints a certificate — is asserted by the Appendix C schema rather than by a wire case.
