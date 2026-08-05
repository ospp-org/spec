# TC-SEC-009 — Station Refuses a Certificate Whose Name Does Not Match

## Profile

Security Profile

## Purpose

Verify that the **station** verifies the **identity** of the server certificate it is presented — not only that the chain validates — and **refuses** when the name does not match the host it was configured to reach, per [Chapter 06 — Security §2.1](../../../spec/06-security.md#21-station--server--mutual-tls-mtls), *Server identity verification*. Both legs are exercised: the MQTT connection and the pre-credential HTTPS provisioning call.

*Refuse* means the TLS handshake does not complete and no application traffic is sent — no MQTT CONNECT, no `POST /api/v1/stations/provision`. Connecting and recording the failure is **not** a conforming outcome.

> **Note.** Like [TC-SEC-008](TC-SEC-008.md), this case exercises **station** behaviour: the harness acts as the broker and as the provisioning server, and the implementation under test is the station. This is the companion case TC-SEC-008 §*The HTTPS provisioning leg is not exercised here* calls for, extended to the identity check that neither case covered.

## Why a positive-path case would prove nothing

A case asserting that a station **connects** to a correctly-named certificate is vacuous here. Every general-purpose TLS library performs name-checking by default when a name is supplied, so a harness written against one passes whether or not the firmware ever asked for the check. The embedded stacks these stations actually use do the opposite: mbedTLS and wolfSSL validate the chain and **skip** the name unless it is set explicitly (`mbedtls_ssl_set_hostname()`, `wolfSSL_check_domain_name()`). A station that never sets it passes a positive-path case and fails in the field against any attacker holding one publicly-trusted certificate for one domain they control.

**Only the refusal is diagnostic.** Every assertion below is a refusal.

## Preconditions

1. A station implementation under test, provisioned or provisionable, whose configured broker host is a **hostname** `H = mqtt.example.test` (Part D covers the IP-literal case).
2. The harness can issue server certificates from a hierarchy the station anchors — whether via `brokerRootCa` or via a CA installed in the station's system trust store; the case is run **once per anchor mode the implementation supports**, because the identity check is independent of which anchor was used and a station that checks under one and not the other is non-conforming.
3. The harness can issue certificates carrying an arbitrary `subjectAltName`, and can issue one carrying **no** `subjectAltName` at all.
4. Every certificate below **chains validly** to the anchor the station holds. This is the point of the case: chain validity is held constant so that the only variable is the name.

| Fixture | Subject CN | `subjectAltName` |
|---|---|---|
| `C_good` | `mqtt.example.test` | `DNS:mqtt.example.test` |
| `C_wrongname` | `mqtt.example.test` | `DNS:attacker.example.test` |
| `C_cn_only` | `mqtt.example.test` | *(extension absent)* |
| `C_wildcard_deep` | `mqtt.example.test` | `DNS:*.example.test` |
| `C_wildcard_multi` | `mqtt.example.test` | `DNS:*.test` |
| `C_ip` | `mqtt.example.test` | `IP:192.0.2.10` |

## Steps

### Part A — Harness self-check (mandatory)

1. Present `C_good` and verify the station **completes** the handshake and sends MQTT CONNECT. This step exists **only** to prove the fixture chain, the anchor and the transport are sound; it asserts nothing about identity checking. If it fails, every refusal below is uninterpretable and the case **MUST** be reported as inconclusive rather than passed.

### Part B — MQTT leg: the name does not match

2. Present **`C_wrongname`**. Verify the station **refuses**: the handshake does not complete and **no MQTT CONNECT is sent**. This is the core assertion of the case — the chain validates, and only the name is wrong.
3. Verify the station does **not** retry against the same certificate in a tight loop, and that it surfaces the failure distinguishably from a chain failure where it has any diagnostic channel at all.
4. Present **`C_cn_only`**. Verify the station **refuses**. A station that falls back to the Subject CN connects here, and CN fallback is prohibited by §2.1.

### Part C — Wildcards

5. Present **`C_wildcard_deep`** with the station configured for `H = mqtt.example.test`. Verify the station **completes** the handshake: `*.example.test` matches `mqtt` in the leftmost label, which is a conforming match.
6. Reconfigure the station for `H = a.mqtt.example.test` and present `C_wildcard_deep` again. Verify the station **refuses**: a wildcard matches at most **one** label, and `*.example.test` does not match `a.mqtt`.
7. Present **`C_wildcard_multi`**. Verify the station **refuses**: a wildcard in a top-level-domain position matches nothing.

### Part D — IP literals

8. Reconfigure the station's broker host to the IP literal `192.0.2.10` and present **`C_ip`**. Verify the station **completes** the handshake — an `iPAddress` SAN matching the configured literal is a conforming match.
9. With the same configuration, present **`C_good`** (whose only SAN is a `dNSName`). Verify the station **refuses**. A `dNSName` SAN **MUST NOT** be matched against an IP literal, and a station that stringly-compares the two connects here.

### Part E — HTTPS provisioning leg

10. Return the station to an unprovisioned state and configure its provisioning endpoint host as `H`.
11. Present **`C_wrongname`** on the HTTPS listener. Verify the station **refuses** and that **no `POST /api/v1/stations/provision` is sent** — in particular that the **provisioning token does not leave the station**.
12. Present **`C_cn_only`** on the HTTPS listener. Verify the station **refuses**, and again that the token is not transmitted.

> Steps 11 and 12 are what this Part exists for. The HTTPS leg carries the provisioning token — the single bearer credential that authorises certificate issuance — and it runs **before** the station holds any credential of its own with which to detect an impostor. A station that name-checks the broker but not the provisioning server hands its token to whoever answers the connection.

## Expected Results

1. `C_good` connects (Part A), establishing that refusals below are caused by the name and nothing else.
2. `C_wrongname` is refused on **both** legs, with no MQTT CONNECT and no provisioning POST.
3. `C_cn_only` is refused on both legs: the Subject CN is never consulted.
4. Wildcard matching is single-label and leftmost-only: `*.example.test` matches `mqtt.example.test` and not `a.mqtt.example.test`; `*.test` matches nothing.
5. An `iPAddress` SAN matches a configured IP literal; a `dNSName` SAN does not.
6. The provisioning token is not transmitted to a server whose certificate name does not match.
7. Results are identical under every anchor mode the implementation supports.

## Failure Criteria

1. The station **completes** a handshake against `C_wrongname` on either leg. This is the case's reason for existing: the chain is valid, so a station that checks only the chain fails here and nowhere else.
2. The station completes a handshake against `C_cn_only` — Subject CN fallback.
3. The station sends a provisioning POST, or transmits the provisioning token by any means, after being presented a non-matching certificate.
4. The station accepts `*.test`, or accepts `*.example.test` for `a.mqtt.example.test` — over-broad wildcard matching.
5. The station accepts a `dNSName` SAN as a match for a configured IP literal.
6. The station refuses `C_good` in Part A — the fixture is wrong and the case is inconclusive, not passed.
7. The station name-checks under one anchor mode and not another.

## References

- [Chapter 06 — Security §2.1](../../../spec/06-security.md#21-station--server--mutual-tls-mtls) — *Server identity verification*, and the refusal requirement it shares with TC-SEC-008
- [Chapter 04 — Protocol Flows §2](../../../spec/04-flows.md#2-station-provisioning) — the HTTPS provisioning call and the token it carries
- [TC-SEC-008](TC-SEC-008.md) — refusal when the certificate cannot be **anchored**; this case is its identity counterpart
- [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525) — service identity in TLS: SAN matching, wildcard scope, and the prohibition on CN fallback
