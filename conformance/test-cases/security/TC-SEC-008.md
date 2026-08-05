# TC-SEC-008 — Station Refuses a Broker Certificate It Cannot Anchor

## Profile

Security Profile

## Purpose

Verify that the **station** refuses the MQTT connection when it cannot validate the broker's server certificate — both when **no trust anchor is obtainable** and when **an anchor is present but the presented chain does not validate against it** — per [Chapter 06 — Security §2.1](../../../spec/06-security.md#21-station--server--mutual-tls-mtls). *Refuse* means the TLS handshake does not complete and no MQTT CONNECT is sent; connecting and recording the failure is not a conforming outcome.

The case also pins the substitution that motivated it: `stationCaChain` is what the station **presents** to the broker, not what it validates the broker with. Loading it into the server-anchor slot must produce a refusal, never a connection.

> **Note.** Unlike every other case in this profile, this case exercises **station** behaviour. The test harness acts as the broker; the implementation under test is the station. That inversion is why Part A is mandatory rather than advisory: the existing cases can assume a correct harness because the harness is the station, and here it is not.

## References

- `spec/06-security.md` §2.1 — the station MUST verify the broker's server certificate; anchor precedence; and the requirement to refuse when validation is impossible or fails
- `spec/01-architecture.md` §7.2 — *Broker trust policy*, the required out-of-band configuration row that supplies the anchor when `brokerRootCa` is absent
- `spec/schemas/provisioning-response.schema.json` — `brokerRootCa` (OPTIONAL, absent under a publicly-trusted broker hierarchy) and `stationCaChain` (what the station presents, explicitly not its own anchor)
- `spec/07-errors.md` §3.1 — `1003 TLS_HANDSHAKE_FAILED`, `1004 CERTIFICATE_ERROR`
- `spec/02-transport.md` §1.3 — TLS 1.2 floor, 1.3 RECOMMENDED
- `spec/profiles/device-management/reset.md` — the broker trust policy survives a configuration reset

## Preconditions

1. The station under test is provisioned and holds its `clientCert`, private key and `stationCaChain`.
2. The test harness can act as an MQTT broker on port 8883, presenting an arbitrary server certificate chain and requesting a client certificate.
3. The harness holds **two independent CA hierarchies**: `H_good`, whose root will be supplied to the station as its *Broker trust policy*, and `H_rogue`, which is never supplied to the station in any form.
4. The harness can issue server certificates from either hierarchy carrying a SAN that matches the broker hostname the station is configured to connect to.
5. The station's *Broker trust policy* is operator-settable: to a specific PEM, to "use the system trust store", or to nothing.
6. **The station's trust material is fully enumerable.** Every anchor the station holds — a provisioned `brokerRootCa`, the configured *Broker trust policy*, and the system trust store if one exists — can be listed by the operator.
7. The station either has **no system trust store**, or its contents can be enumerated and emptied.
8. The harness can observe the TLS handshake and determine whether an MQTT CONNECT packet was sent.
9. The station's local diagnostic output (log, management interface, or serial console) can be read for error codes.
10. `openssl` 3.0 or later is available for fixture verification.

## Steps

### Part A — Isolation controls

Run first. **No result from any later Part counts until both controls pass.** A trust store consulted behind the tester's back voids this case, and there are two of them — one on each side.

**A1 — Harness side: the fixture verifier must be capable of failing.**

1. Verify the `H_good` leaf against an **unrelated** root, with all three default-store opt-outs:
   `openssl verify -no-CAfile -no-CApath -no-CAstore -CAfile unrelated-root.pem -untrusted H_good-intermediates.pem H_good-leaf.pem`
   This **MUST fail** (non-zero exit; `unable to get local issuer certificate`). If it succeeds, a default trust store is still being consulted and every subsequent verification in this case is meaningless. `-no-CAfile -no-CApath` alone is **not** sufficient on OpenSSL 3.x — the default `-CAstore` requires its own opt-out.
2. Repeat with `-CAfile H_good-root.pem`. This **MUST succeed** (exit 0). Together with step 1 this establishes that the fixture is well-formed and that the step-1 failure was caused by the absent anchor, not by a malformed chain.
3. Record both exit codes in the test report. **A run in which step 1 passed is void**, not failed — the observations were never capable of distinguishing anything.

**A2 — Station side: the station must not hold an anchor the test did not give it.**

4. Enumerate every trust anchor the station holds: any provisioned `brokerRootCa`, the configured *Broker trust policy*, and the system trust store if present.
5. Verify by **SHA-256 fingerprint, not by subject name**, that `H_rogue`'s root is not among them.
6. Verify that the station has no system trust store, **or** that its enumerated contents contain no root capable of validating either harness hierarchy. If the station holds a populated store that can validate the harness certificate, this case cannot distinguish a conforming refusal from an accidental success: record the case **NOT RUN**. Do not record it as PASS.
7. Record the enumerated fingerprint set in the test report.

### Part B — Positive control: a correct anchor connects

8. Set the station's *Broker trust policy* to the `H_good` root PEM.
9. Configure the harness to present the `H_good` server certificate and chain.
10. Trigger a connection. Verify the TLS handshake completes, the station presents its client certificate, an MQTT CONNECT is sent, and BootNotification follows.

This establishes that the station connects at all, so that the refusals in Parts C, D and E are discriminating rather than the behaviour of a station that never connects.

### Part C — No anchor obtainable: the station refuses

11. Clear the *Broker trust policy*: no PEM, no system-trust-store instruction. Part A2 has established the station holds no other anchor.
12. Configure the harness to present the **`H_good`** server certificate — a certificate that *would* validate if the anchor were present. Only the anchor is missing.
13. Trigger a connection.
14. Verify the TLS handshake does **not** complete.
15. Verify **no MQTT CONNECT** is sent and no BootNotification appears.
16. Verify the station reports `1003 TLS_HANDSHAKE_FAILED` or `1004 CERTIFICATE_ERROR` on its local diagnostic channel.
17. Observe at least three reconnection cycles. Verify the station does not escalate into an unverified connection after repeated failures.

### Part D — Anchor present, chain does not validate: the station refuses

18. Set the *Broker trust policy* to the `H_good` root PEM.
19. Configure the harness to present the **`H_rogue`** server certificate, carrying the same SAN and hostname as `H_good`'s.
20. Trigger a connection.
21. Verify the TLS handshake does not complete, no MQTT CONNECT is sent, and no BootNotification appears.
22. Verify `1003` or `1004` is reported locally.

### Part E — `stationCaChain` is not the station's server anchor

The substitution this case exists for.

23. Set the *Broker trust policy* to the station's own `stationCaChain`, exactly as the provisioning response delivered it (Station CA, optionally followed by Root CA).
24. Configure the harness to present the `H_good` server certificate.
25. Verify the station refuses, per Parts C and D. `stationCaChain` anchors the station's own client certificate and cannot anchor the broker's; this is Part D's condition reached through the field an integrator is most likely to mis-assign.
26. Verify that in no configuration across Parts C, D and E did an accepted handshake occur while `stationCaChain` was the only anchor present.

### Part F — The TLS floor is not a refusal reason

Guards against a false pass: a station that refuses Parts C–E for the wrong reason.

27. Repeat Part B with the harness restricted to **TLS 1.2 only**.
28. Verify the station connects. Refusal here is a TLS-version defect, not an anchor defect, and would mean the Part C–E refusals cannot be attributed to the missing or failing anchor.

## Expected Results

1. Both isolation controls pass before any observation is recorded.
2. With a correct anchor the station connects, and connects at TLS 1.2 as well as 1.3.
3. With no anchor obtainable the station refuses, even though the presented certificate would validate under the correct anchor.
4. With an anchor present and a chain that does not validate against it, the station refuses.
5. `stationCaChain` in the anchor slot produces a refusal, never a connection.
6. Every refusal is a non-completed TLS handshake with no MQTT CONNECT and no BootNotification.
7. Every refusal is reported locally as `1003` or `1004`.

## Failure Criteria

The implementation **fails** this test case if any of the following occur:

1. The station completes the TLS handshake, or sends an MQTT CONNECT, under Part C, D or E.
2. The station proceeds with the connection and records the validation failure. "Connected and logged an error" is a failure of this case, not a pass — §2.1 states that recording the failure and continuing is not a conforming outcome.
3. Part A1 step 1 succeeded and later results were reported anyway. The run is void.
4. The station holds a system trust store able to validate the harness certificate and the case is reported PASS rather than NOT RUN.
5. The station accepts a server certificate whose only offered anchor was `stationCaChain`.
6. The station refuses in Part B or Part F. A station that refuses every certificate satisfies Parts C–E without implementing anything.
7. The station enters provisioning mode, or discards or overwrites stored credentials, on any refusal in this case — consistent with the `1004` requirements exercised by TC-SEC-002.
8. The station escalates to an unverified connection after repeated refusals.

---

## Scope — what this case does not cover

Recorded so the gap is deliberate rather than assumed closed.

**The HTTPS provisioning leg is not exercised here.** §2.1's refusal requirement binds both legs, and the pre-credential HTTPS call to `POST /api/v1/stations/provision` is subject to the identical four conditions — no anchor obtainable, or a presented chain that fails against the anchor held. It is omitted because the harness is different in kind: it requires a provisioning **server** presenting a controllable certificate, not an MQTT broker, and the station's *HTTPS trust policy* rather than its *Broker trust policy*. Folding both into one case would produce a fixture that tests neither cleanly. [TC-SEC-009](TC-SEC-009.md) is that companion case: it exercises the HTTPS leg, and it covers the **identity** check — that the presented certificate names the host the station meant to reach — which this case holds constant.

**No case in this profile establishes that a station validates the broker at all on real hardware.** This case can only observe refusal and acceptance through a harness. A station that appears to refuse because of an unrelated defect passes Parts C–E and fails Part B or F, which is why those two controls are not optional.
