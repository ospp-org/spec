# TC-SEC-007 — Provisioning Success Response: Shape, Bindings and Replay Grouping

## Profile

Security Profile

## Purpose

Verify that the **server's** provisioning endpoint (`POST /api/v1/stations/provision`) returns, on
success, a body that is exactly the response [Chapter 04 — Protocol Flows §2](../../../spec/04-flows.md)
defines: a **closed** field set at the **top level**, every member within its declared type and
constraints, and — the part no schema can express — the **relationships between the members**.

Three of those relationships are the point of the case, because each of them is a requirement that a
response can satisfy field-by-field and still violate:

1. **`bays` carries the bay-number mapping EXPLICITLY.** The array is the only place the station is
   ever told which `bayId` is which `bayNumber`. A response whose every element is a valid bay-id, and
   whose length is right, can still pair them wrongly. The deprecated `bayIds` carries the same mapping
   by order until 0.12.0, and the two MUST agree.
2. **`stationCaChain` and `rootCaThumbprint` are bound to the `clientCert` in the SAME response**, not
   to the server's current CA. On a replay after a Station CA rotation these two requirements diverge,
   and only one of them is correct.
3. **A replay's fields divide into three groups, normatively** — frozen, bound-to-the-certificate, and
   current. Byte-identity applies to the first and **MUST NOT** be applied to the third.

TC-SEC-005 and TC-SEC-006 cover this endpoint's **error** paths — retry idempotency, key drift, bare-key
validity, and error precedence — and both assert `200 OK` on the success paths they traverse without
examining the body beyond `clientCert`. Nothing in the suite pinned what a successful response *is*.
This case does that.

> **Note.** Like TC-SEC-005 and TC-SEC-006, this case exercises **server** behaviour. The "test harness"
> here acts as the station; the implementation under test is the OSPP server.

## References

- `spec/04-flows.md` §2 — the flow, its *Postconditions*, and *Persisting the response*
- `spec/04-flows.md` §2 — "**`bays` pairs each `bayId` with its `bayNumber` explicitly**", and the
  *Deprecated (0.11.0)* note governing `bayIds` for the deprecation window
- `spec/04-flows.md` §2 — *Single-use and idempotent retry* → "**What a replay returns**" (the three groups)
- `spec/02-transport.md` §1.1 §1.2 §1.3 §1.4 — MQTT 5.0, the pinned CONNECT parameters, the TLS floor,
  port 8883 and the prohibition on 1883
- `spec/02-transport.md` §2.2 — the topic namespace, and that `v1` there is not the protocol version
- `spec/06-security.md` §2.1 — which side presents `stationCaChain` and which side anchors on `brokerRootCa`
- `spec/06-security.md` §4.4 — Certificate Requirements (CN, algorithm, key usage, EKU, validity, CRLDP)
- `spec/06-security.md` §4.2 §6.1 §6.7 — the server signing key returned as `serverVerifyKey`
- `spec/06-security.md` §6.5.2 — the StationIdentity certificate and the static BLE ECDH key it binds
- `spec/06-security.md` §4.8 — OSPP Canonical Form, over which the StationIdentity signature is computed
- `spec/01-architecture.md` §3.2 — `bayId` values are server-assigned
- `spec/01-architecture.md` §4.2 — maximum 255 bays per controller
- `profiles/core/README.md` CORE-004 and `profiles/core/status-notification.md` §7 — the station must
  emit `(bayId, bayNumber)` together, which is why the mapping must be established here
- `schemas/provisioning-response.schema.json`, `schemas/provisioning-request.schema.json`
- `schemas/common/station-id.schema.json`, `schemas/common/bay-id.schema.json`
- `schemas/ble/station-identity.schema.json`

## Preconditions

1. A station entry exists in the management portal with `stationId` `stn_a1b2c3d4`, not yet provisioned,
   registered with **3** bays. Three rather than one, so that ordering is observable: a one-bay station
   satisfies every ordering requirement trivially.
2. The harness knows, out of band, the portal's own `bayNumber` → `bayId` registration for that station
   — the mapping the server assigned at registration. The sequence diagram in §2 shows the portal
   receiving `stationId, bayIds[]` at registration, so this is available to an operator; a direct read of
   the server's bay table is equally acceptable.
3. Provisioning tokens `T1` and `T2` have been generated (single-use, unconsumed, within TTL), `T2`
   against a second unprovisioned station entry.
4. The harness can generate ECDSA P-256 key pairs, produce CSRs with CN = `stn_a1b2c3d4`, and generate a
   static ECDH P-256 key pair (Part H only; required only where the station profile declares
   `bleSupported`).
5. The harness can capture the full HTTP response **including the raw body bytes**, and can validate a
   body against a JSON Schema.
6. The harness can parse X.509 certificates and verify a certificate chain, and can verify an ECDSA
   P-256 signature over a canonicalised JSON body.
7. The harness retains, byte-for-byte, the first successful response to each token.
8. For Parts J and K, an operator can trigger — on the implementation under test — a **server signing key
   rotation**, an **MQTT broker parameter change**, and a **Station CA rotation**. Where the
   implementation offers no way to perform one of these, that Part is recorded as **skipped**, with the
   reason; it is not recorded as a pass.

## Steps

### Part A — The response is a closed, flat, schema-valid body

1. Generate key pair `K_tls_1`, produce CSR `CSR_1` (CN = `stn_a1b2c3d4`), and generate receipt-signing
   key pair `K_rcpt_1`.
2. `POST /api/v1/stations/provision` with token `T1`, `serialNumber: "SN-0001"`, `bayCount: 3`,
   `tlsCsr: CSR_1`, `receiptSigningPublicKey: K_rcpt_1.pub`.
3. Verify the response status is **`200 OK`** and the `Content-Type` is `application/json`.
4. Verify the body validates against `provisioning-response.schema.json`. Retain the raw bytes as
   `RESP_1`.
5. Verify the seven **required** members are present at the **top level**: `stationId`, `bays`,
   `bayIds` (deprecated, required until 0.12.0), `clientCert`, `stationCaChain`, `serverVerifyKey`,
   `mqttConfig`.
6. Verify the body carries **no member outside** the schema's declared set — the schema is
   `additionalProperties: false`, so any extra top-level member is a conformance failure. In particular
   verify the body is **not wrapped**: a body of the form `{"data": { … }}`, or one carrying the response
   under any other single enclosing member, fails here, because the enclosing member is itself an
   undeclared property and the six required members are then absent from the top level.
7. Record which of the three **optional** members are present: `brokerRootCa`, `rootCaThumbprint`,
   `stationIdentity`. Each is optional, and its absence is not a failure; each is subject to the checks
   below **when present**.

### Part B — `stationId`

8. Verify `stationId` matches `^stn_[a-f0-9]{8,}$`, length 12..64.
9. Verify `stationId` equals the `stationId` the token `T1` was bound to — `stn_a1b2c3d4`. A server is
   not free to allocate a new identifier at provisioning; the token is already bound to one.

### Part C — `clientCert`

10. Verify `clientCert` is a single PEM `CERTIFICATE` block that parses as X.509.
11. Verify the certificate's **Subject CN equals the `stationId` returned in the same response**
    (§4.4; also §6.5.2's premise that the CN is the broker's ACL principal).
12. Verify the certificate's **public key equals the `SubjectPublicKeyInfo` of `CSR_1`** — the server
    certified the key the station submitted, not one of its own choosing.
13. Verify Version is **X.509 v3**, Key Algorithm is **ECDSA P-256**, and the Signature Algorithm is
    **ECDSA with SHA-256 or SHA-384**.
14. Verify Key Usage asserts **`digitalSignature`** and Extended Key Usage asserts **`clientAuth`**.
15. Verify the validity period does not exceed **1 year**. §4.4 marks the 1-year bound RECOMMENDED
    rather than MUST; a longer validity is therefore recorded as a **deviation**, not a failure, and is
    reported with the observed period.
16. Verify a **CRL Distribution Points** extension is present. §4.4 marks this REQUIRED, so its absence
    **is** a failure. This is the extension a revoked certificate is checked against, and it cannot be
    added retroactively to a certificate already in a station's secure element.

### Part D — `bays` pairs each `bayId` with its `bayNumber` explicitly

17. Verify `bays` is a **JSON array of objects**, each carrying exactly `bayId` (matching
    `^bay_[a-f0-9]{8,}$`, length 12..64) and `bayNumber` (integer, 1..64). Verify that no member carries
    any other property — the schema is `additionalProperties: false`.
18. Verify no `bayId` appears twice and no `bayNumber` appears twice.
19. Verify `bays.length` equals **3**, the station's **registered** bay count, and that the **set** of
    `bayNumber` values equals the registered set exactly. This is the same set that step 5 of *Error
    precedence* validates the request's `bays` against with `4020 BAY_COUNT_MISMATCH`, so a response
    whose set disagrees with it contradicts the check the same request already passed.
20. Verify the pairing is carried by the **fields, not the position**: re-request a replay (Part G) and
    verify each `bayNumber` is still paired with the same `bayId` even if the members arrive in a
    different order. Order is not significant and a station MUST NOT infer anything from it. Verify
    specifically that a **non-dense** bay set is expressible — a station registered with bays `{1, 3}`
    receives two members naming `bayNumber` **1** and **3**, and no member naming 2.
21. Verify the mapping end-to-end on the wire, where the harness can drive a boot: connect over mTLS with
    the issued `clientCert`, send `BootNotification` and obtain `Accepted`, then send one
    StatusNotification per bay, pairing each `bayId` with the `bayNumber` **read from its own member** in
    step 17. Verify the server accepts all three and that the status it records for each bay is the one
    the harness sent for that bay number. A server that paired them differently records the statuses
    against the wrong bays, which is observable and is a failure.
22. **Deprecation window.** Verify `bayIds` is also present and **agrees** with `bays`: it lists exactly
    the same `bayId` values, ordered so that index *i* is the bay whose `bayNumber` is *i + 1*. A
    disagreement between the two is a failure. This step is removed when `bayIds` is removed in 0.12.0.

> Steps 17 and 20 are what this Part exists for. `bayIds` is the **only** mapping the station is ever
> given: bay identifiers are server-assigned, they arrive nowhere else in any profile, and the first
> message the station sends after a successful boot is required to carry `bayId` and `bayNumber`
> together. A server that returns the right identifiers in the wrong order returns a schema-valid
> response that silently re-points every bay in the station.

### Part E — `stationCaChain` and `rootCaThumbprint` bind to the certificate in **this** response

22. Verify `stationCaChain` is one or more concatenated PEM `CERTIFICATE` blocks, each parsing as X.509.
23. Verify the chain **verifies the `clientCert` returned in the same response**, up to a self-signed
    apex. This is the normative rule and it is intra-response: the chain is judged against the
    certificate beside it, never against the server's current CA independently.
24. Where `rootCaThumbprint` is present, verify it matches `^sha256:[0-9a-f]{64}$` — lowercase hex — and
    that it is the SHA-256 digest of the **DER encoding** of the apex certificate of the
    `stationCaChain` **in this same response**.
25. Verify `stationCaChain` is **not** the same value as `brokerRootCa` where both are present, unless
    the deployment genuinely anchors both on one certificate. These fields face in **opposite
    directions**: `stationCaChain` is what the station **presents** to the broker; `brokerRootCa` is what
    the station **anchors on** to validate the broker. A server that returns its broker trust anchor in
    the chain field is recorded as a deviation and re-examined against §6.5.2 / §2.1 — conflating the two
    is the specific mistake the field split exists to prevent.

### Part F — `serverVerifyKey`

26. Verify `serverVerifyKey` is a PEM `PUBLIC KEY` or `EC PUBLIC KEY` block that decodes to an **ECDSA
    P-256** public key.
27. Verify it is **not** equal to the public key of `clientCert`, and not equal to `K_rcpt_1.pub`. It is
    the server's signing key, not any key the station submitted.

### Part G — `mqttConfig`

28. Verify `mqttConfig` is an object carrying **all eleven** required members — `brokerHost`,
    `brokerPort`, `brokerUri`, `clientIdTemplate`, `topicPrefix`, `qosLevel`, `keepAliveSeconds`,
    `cleanStart`, `sessionExpirySeconds`, `tlsVersion`, `mqttVersion` — and **no undeclared member**
    (`additionalProperties: false`); `lastWillTopic` is the one optional member.
29. Verify the **pinned** values, each of which has exactly one conforming setting and is rejected by the
    schema otherwise:
    - `qosLevel` is **`1`** — QoS 0 MUST NOT be used (Transport §3.1)
    - `cleanStart` is **`false`** — persistent sessions are required for the buffered-message guarantee
    - `mqttVersion` is **`"5.0"`** — MQTT 3.1.1 is not supported
    - `clientIdTemplate` is the literal **`"{stationId}"`** — the resulting Client ID must equal the
      certificate CN the broker runs its topic ACL on
    - `tlsVersion` is **`"1.2"`** or **`"1.3"`** — a floor, not the negotiated version
30. Verify `brokerPort` is **not** `1883` and that `brokerUri` uses the **`mqtts://`** scheme. Plaintext
    MQTT MUST NOT be used in any environment, including development (Transport §1.4).
31. Verify `topicPrefix` matches `^[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$`, and confirm the harness composes
    topics as `{topicPrefix}/stations/{stationId}/{to-server|to-station}`. Note that a `v1` segment here
    is a **topic namespace**, not the OSPP protocol version.
32. Verify `keepAliveSeconds` is within 10..65535 and `sessionExpirySeconds` within 0..4294967295. Where
    present, these values are **authoritative** — §1.2's 30 s and 3600 s are the values to use when the
    field is **absent**, not ceilings on what may be advertised. A server advertising a different value
    is conforming and the harness MUST use what it was sent.
33. Record whether `brokerUri` agrees with `brokerHost` and `brokerPort`. **This is an observation, not a
    pass criterion.** The schema calls `brokerUri` a "convenience pre-formatted broker URI" and no
    normative statement requires the three to agree, so a disagreement is reported rather than failed —
    see *Open points* below.

### Part H — `stationIdentity` (conditional — `bleSupported` only)

> Applicable only where the station profile declares `bleSupported`, so that `stationPubKey` is submitted
> and the StationIdentity certificate is issued (§6.5.2). Skip otherwise, and record it as skipped.

34. Repeat Part A on token `T2` and the second station entry, including
    `stationPubKey: K_ble_1.pub` in the request.
35. Verify `stationIdentity` is **present** in the response, and validates against
    `ble/station-identity.schema.json`.
36. Verify `stationIdentity.stationId` equals the **top-level `stationId`** of the same response.
37. Verify `stationIdentity.stationPubKey` equals the **`stationPubKey` the request submitted** — the
    certificate is issued over the station's bound BLE key, not over a key the server generated.
38. Verify `stationIdentity.signatureAlgorithm` is the literal `"ECDSA-P256-SHA256"`, and that
    `expiresAt` is strictly later than `issuedAt`, both ISO 8601 UTC.
39. Verify `stationIdentity.signature` **verifies against `serverVerifyKey` from the same response**,
    over the OSPP Canonical Form (§4.8) of the certificate body **minus** `signature` and
    `signatureAlgorithm`. This is the check that ties Parts F and H together: `serverVerifyKey` is
    asserted to be the key that signs StationIdentity, and only this step proves the server returned a
    pair that actually corresponds.
40. Verify `stationIdentity` is **absent** from the Part A response, where that station did not declare
    `bleSupported` and submitted no `stationPubKey`. A StationIdentity certificate over a key that was
    never submitted has nothing to bind.

### Part I — Replay: the frozen group is byte-identical

41. Re-send the step-2 request on token `T1`, byte-for-byte. Verify `200 OK` and that the body validates
    against the schema **in full** — a replay is not a reduced response.
42. Verify each of the following is **byte-identical** to `RESP_1`:
    - `stationId`
    - `bayIds` — **including its order**; servers MUST NOT reorder the array between the original
      response and a replay
    - `clientCert`
    - `stationIdentity`, where present
43. Re-send once more with **drifted descriptive fields** — `serialNumber: "SN-9999"`, `bayCount: 7` —
    keys unchanged. Verify `200 OK` and that the four members above are **still** byte-identical, and in
    particular that `bayIds` still has **3** elements. The request's `bayCount` is descriptive and is
    ignored on a replay; it does not resize the bay set.

### Part J — Replay: the current group tracks the server, and MUST NOT be frozen

> Each step below is skipped, with its reason recorded, where the implementation offers the operator no
> way to perform the change. A skipped step is not a pass.

44. Have the operator change an **advertised** `mqttConfig` value on the server — for example
    `keepAliveSeconds`, `sessionExpirySeconds`, or the broker host — while `T1` is still within its TTL.
45. Re-send the step-2 request on `T1`. Verify `200 OK`, and verify `mqttConfig` reflects the **new**
    value, not the value in `RESP_1`.
46. Verify the frozen group of step 42 is **still byte-identical** across this same response — the
    change moved `mqttConfig` and nothing else.
47. Have the operator **rotate the server signing key**. Re-send on `T1` and verify `serverVerifyKey` is
    the **new** key. Where `stationIdentity` is present, verify its `signature` verifies against the
    `serverVerifyKey` in **this** response — the two are returned together and must correspond in every
    response, not only the first.
48. Have the operator **re-anchor `brokerRootCa`**. Re-send on `T1` and verify `brokerRootCa` is the
    **new** anchor.

### Part K — Replay after a Station CA rotation: the chain follows the certificate

> The divergent case, and the one an implementation is most likely to get wrong in either direction.
> Skipped with its reason recorded where the implementation offers no way to rotate the Station CA.

49. Have the operator **rotate the Station CA**, while `T1` is still within its TTL. The `clientCert`
    issued in step 2 was signed by the **superseded** CA.
50. Re-send the step-2 request on `T1`. Verify `200 OK`.
51. Verify `clientCert` is **byte-identical** to `RESP_1` — it is frozen; a rotation does not re-issue it.
52. Verify `stationCaChain` **still verifies that frozen `clientCert`** — the superseded issuing CA is
    still carried. A server that replaced the chain with the current CA alone fails here, and would have
    handed the station a chain that does not validate the certificate returned beside it.
53. Verify `stationCaChain` **additionally carries the current Station CA**, as a further concatenated
    PEM block in the same field. This is what the multiple-block allowance is for: the station holds both
    the path that validates the certificate it is using and the path it will need at renewal. A server
    that returned only the superseded CA fails here.
54. Verify `rootCaThumbprint`, where present, pins the **apex of the chain actually returned in this
    response** — never a superseded apex, and never the apex of some other chain the server holds.
55. Verify no **second** certificate was issued against `T1` by any step of Parts I, J or K.

## Expected Results

1. A successful provision returns `200 OK` with a **flat, closed, schema-valid** body — the six required
   members at the top level, no enclosing wrapper, no undeclared member.
2. `stationId` is the identifier the token was bound to, and is the Subject CN of `clientCert`.
3. `clientCert` certifies the **submitted CSR key**, is ECDSA P-256, X.509 v3, asserts `digitalSignature`
   and `clientAuth`, and carries a CRL Distribution Points extension.
4. `bays` is an array of **objects**, each pairing a `bayId` with its `bayNumber`, unique in both, of
   length equal to the station's registered bay count, and carrying exactly the registered set of bay
   numbers — dense or not. `bayIds` is present alongside it, agreeing, until 0.12.0.
5. The pairing in `bays` is the mapping the station actually uses: StatusNotifications paired by the
   `bayNumber` read from each member are recorded against the right bays.
6. `stationCaChain` verifies the `clientCert` returned **in the same response**, and `rootCaThumbprint`
   pins the apex of **that** chain.
7. `serverVerifyKey` is an ECDSA P-256 public key distinct from every key the station submitted, and is
   the key that verifies `stationIdentity` where that is present.
8. `mqttConfig` carries all eleven required members, with `qosLevel` 1, `cleanStart` false, `mqttVersion`
   "5.0", `clientIdTemplate` "{stationId}", a TLS floor of 1.2 or 1.3, and no plaintext MQTT.
9. `stationIdentity` is present exactly where a BLE key was submitted, binds that key and that
   `stationId`, and its signature verifies against the `serverVerifyKey` beside it.
10. On a replay, `stationId`, `bayIds` (order included), `clientCert` and `stationIdentity` are
    byte-identical to the original response, and remain so under descriptive drift.
11. On a replay, `brokerRootCa`, `serverVerifyKey` and `mqttConfig` reflect the server's **current**
    state.
12. On a replay after a Station CA rotation, `stationCaChain` still verifies the frozen `clientCert`
    **and** additionally carries the current Station CA, with `rootCaThumbprint` pinning the apex of what
    was returned.
13. No step of the replay parts mints a second certificate.

## Failure Criteria

The implementation **fails** this test case if any of the following occur:

1. The success body is **wrapped** in an enclosing member, or carries any top-level member the schema
   does not declare, or omits any of the six required members.
2. `clientCert` certifies a public key other than the one submitted in the CSR, or its Subject CN is not
   the `stationId` returned beside it, or it lacks `clientAuth`, or it lacks a CRL Distribution Points
   extension.
3. **`bays` is returned in any shape other than an array of `{bayId, bayNumber}` objects** — a bare
   array of bay-id strings, or a member carrying an additional property.
4. `bays` contains a duplicate `bayId` or a duplicate `bayNumber`, or its set of `bayNumber` values is
   not exactly the station's registered set.
5. **A member of `bays` pairs a `bayId` with the wrong `bayNumber`**, or the pairing differs between the
   original response and a replay, or `bayIds` disagrees with `bays`. This is the silent one: every
   element is valid, the length is right, and every bay in the station is mis-identified.
6. `stationCaChain` does not verify the `clientCert` returned in the same response, or
   `rootCaThumbprint` pins an apex other than that of the chain returned in the same response.
7. Any pinned `mqttConfig` value is other than its single conforming setting, or `brokerPort` is `1883`,
   or `brokerUri` uses a non-`mqtts://` scheme.
8. `stationIdentity` is present where no BLE key was submitted, binds a key other than the submitted
   `stationPubKey`, or carries a signature that does not verify against the `serverVerifyKey` in the same
   response.
9. Any member of the **frozen** group differs from the original response on a replay, under identical or
   descriptively drifted requests.
10. Any member of the **current** group is **frozen** to its original value after the corresponding
    server-side change — a replay carrying a superseded `serverVerifyKey`, a stale `brokerRootCa`, or an
    `mqttConfig` pointing at a broker that has moved. Freezing these is as much a failure as failing to
    freeze the identity group, and its consequence is worse: the station cannot connect, and cannot be
    told so in band.
11. After a Station CA rotation, the replay returns a `stationCaChain` that does **not** verify the frozen
    `clientCert`, or one that does not **also** carry the current Station CA.
12. A second certificate is minted against the token by any replay.

---

## Open points recorded rather than asserted

Recorded here so that a later revision resolves them deliberately, and so that this case is not quietly
widened to cover them.

**`brokerUri` has no stated relationship to `brokerHost` and `brokerPort`.** The schema describes it as
a "convenience pre-formatted broker URI" and constrains its shape, but no normative statement requires
`brokerUri` to be `mqtts://{brokerHost}:{brokerPort}`. A station that trusts `brokerUri` and a station
that composes its own from the two parts could therefore connect to different endpoints against one
conforming response. Step 33 records the observation; it does not fail on it. Making the agreement
normative belongs in Chapter 02 §1.2 alongside the other `mqttConfig` authorities, not in a test case.

**The 1-year certificate validity bound is RECOMMENDED, not REQUIRED.** §4.4 marks it so, and step 15
follows the spec rather than tightening it. A deployment issuing longer-lived station certificates is
conforming today.

**Part J and Part K depend on operator-triggered rotations.** A conforming server that provides no
operator path to rotate its signing key, re-anchor the broker, or rotate the Station CA cannot be tested
on the requirements those rotations exist to exercise — the requirements are still normative, and the
Parts are recorded as skipped rather than passed. This is a limitation of black-box conformance on this
surface, not a gap in the requirement.
