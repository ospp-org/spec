# OSPP Conformance Testing

> **Status:** Draft | **OSPP Version:** 0.44.0

This document defines the conformance testing framework for OSPP implementations.
Conformance testing validates that a station or server implementation correctly
implements the OSPP protocol as specified in the normative chapters.

> **Note:** Test cases, test vectors, and conformance reports in this directory are
> **informative** — they illustrate expected behavior and aid validation, but
> compliance is defined by the normative requirements (MUST, SHOULD, MAY) in the
> specification chapters.

---

## 1. Overview

The OSPP conformance suite provides a structured methodology for verifying protocol
compliance. It consists of:

- **Test Cases** — Step-by-step procedures organized by profile (`test-cases/`)
- **Test Vectors** — Machine-readable valid/invalid payloads for schema validation (`test-vectors/`)
- **Compliance Levels** — 4-tier requirements allowing incremental adoption
- **Harness** — Test execution framework (planned for future releases; the `harness/` directory contains placeholder structure)

Implementers **SHOULD** pass all test cases for their declared compliance level
before claiming conformance.

## 2. Compliance Levels

> **Complete cannot be claimed against this revision.**
>
> It requires the Offline / BLE profile, whose BLE half is **EXPERIMENTAL**: its two blockers are
> closed, and it stays experimental until its cryptographic construction has passed the review of
> [Chapter 06, Appendix B](../spec/06-security.md#appendix-b--ble-cryptographic-review-checklist) — see
> [Release status](../README.md#ble-is-experimental) and
> [KNOWN-ISSUES](../KNOWN-ISSUES.md#closed--the-ble-surface-was-not-implementable-as-written-two-defects).
> `TC-OFF-001`, `TC-OFF-002` and `TC-OFF-005` exercise that surface and are experimental artefacts with it.
>
> **Development, Standard and Extended are unaffected and remain claimable.** Their required cases —
> `TC-CORE-*`, `TC-TX-*`, `TC-SEC-*` and `TC-DM-*` — run over MQTT and HTTPS, but for three Parts of
> one case that apply only where the station declares the Offline / BLE profile. Two are worth naming:
>
> - **`TC-TX-006`** is entirely offline *reconciliation*, but reconciliation runs over **MQTT**,
>   is implemented, and is exercised against a second implementation. It stays Standard and is
>   fully runnable.
> - **`TC-TX-007`** Parts C, D and E end a session the app started over BLE, or one the station
>   ran offline: each exercises the EXPERIMENTAL profile, is no part of a Standard claim, runs only
>   where the station declares the profile, and is recorded as skipped otherwise. The rest of the
>   case runs over MQTT.
>
> **The ladder moved with the BLE wire revision.** Partial B is now required of every station that
> implements the Offline / BLE profile, so the profile is taken whole at **Complete**, and
> **Extended** is Standard plus Device Management ([`profiles/README.md` §2](../spec/profiles/README.md#2-compliance-levels)).
> Earlier revisions put the profile without Partial B at Extended and Partial B at Complete.

OSPP defines four compliance levels. Each level builds on the previous one.

### 2.1 Development Compliance

**Required profiles:** Core

> **This level is for testing and prototyping ONLY — NOT for production deployment.**

A Development-compliant station **MUST** pass all `TC-CORE-*` test cases. This level
validates the minimum viable implementation: boot notification, heartbeat, status
notification, and connection loss handling. Security (TLS, HMAC) is optional at this
level to enable rapid local development and testing.

| Requirement | Test Case |
|-------------|-----------|
| Boot lifecycle (Accepted/Rejected/Pending) | TC-CORE-001 |
| Heartbeat at configured interval | TC-CORE-001 (Part D) |
| StatusNotification on every bay state change | TC-CORE-001 (Part C) |
| Invalid bay transition accepted, recorded, session reconciled | TC-CORE-003 |
| LWT configured at MQTT CONNECT | TC-CORE-001 (Part A) |
| DataTransfer status values (UnknownVendor / UnknownData) | TC-CORE-004 (Parts A--B) |
| TriggerMessage, including refusal while restricted | TC-CORE-004 (Parts C--D) |

### 2.2 Standard Compliance

**Required profiles:** Core + Transaction + Security

A Standard-compliant station **MUST** pass all `TC-CORE-*`, `TC-TX-*`, and
`TC-SEC-*` test cases. This is the **minimum level for production deployment** —
it validates session lifecycle, metering, and mandatory security (TLS 1.2+, mTLS, and
HMAC-SHA256).

| Requirement | Test Cases |
|-------------|------------|
| Session lifecycle | TC-TX-001 |
| Reservation and conversion | TC-TX-002 |
| Early stop with refund | TC-TX-003 |
| HMAC signature verification | TC-SEC-001 |
| mTLS certificate validation | TC-SEC-002 |
| Certificate revocation checking at the broker | **Declared, not tested** — [`06-security.md` §2.1.1](../spec/06-security.md#211-revocation-checking) |

> **`TC-SEC-002` step 33 asserts no BLE behaviour.** Until the BLE wire revision it required a
> station holding an expired certificate to enter "offline-only BLE mode", and that clause applied
> only where the station declared `bleSupported`. A station now authenticates itself over BLE with
> the same certificate, which the app refuses once expired, so the `expired` branch of the `1004`
> row in [`07-errors.md` §3.1](../spec/07-errors.md) keeps only the obligations the step asserts on
> every station: never enter provisioning mode, never discard or overwrite stored credentials,
> await server-triggered renewal.

### 2.3 Extended Compliance

**Required profiles:** Standard + Device Management

An Extended-compliant station **MUST** pass all Standard test cases plus
`TC-DM-*` test cases. This level adds remote configuration, firmware updates,
diagnostics and maintenance mode.

| Requirement | Test Cases |
|-------------|------------|
| All Standard requirements | TC-CORE-*, TC-TX-*, TC-SEC-* |
| Configuration read/write | TC-DM-001 |
| Firmware update | TC-DM-002, TC-DM-004 |
| Firmware update to a **restricted** station (accepted, notifications suppressed) | TC-DM-002 (Part E) |

### 2.4 Complete Compliance

**Required profiles:** Extended + Offline/BLE — every profile

A Complete-compliant station **MUST** pass all Extended test cases plus the
`TC-OFF-*` test cases. This level adds BLE communication, OfflinePass validation,
offline sessions in every connectivity scenario the profile requires — Full Offline
and Partial B (phone offline, station online — station relays auth to server via
MQTT) — and offline session reconciliation.

| Requirement | Test Cases |
|-------------|------------|
| All Extended requirements | TC-CORE-*, TC-TX-*, TC-SEC-*, TC-DM-* |
| Full offline BLE session | TC-OFF-001 |
| OfflinePass validation (10 checks: #5 withdrawn, nine performed by the station) | TC-OFF-002 |
| Reconciliation — server-side processing | TC-OFF-003 |
| Reconciliation — station upload & recovery | TC-OFF-004 |
| **Partial B — station-relayed authorization** | **TC-OFF-005** |

> **Two defects in this table, both fixed in `0.25.0`.** It named a mandatory *"Partial B scenario"* for which
> **no test case existed** — `TC-OFF-005` is that case, and until it was written this compliance level could
> not be claimed by any station, however conformant. And it listed three `TC-OFF-*` cases where §2.3 above
> then reached all of them through the `TC-OFF-*` glob, so **Complete** enumerated *fewer* offline cases than the
> **Extended** level it is defined as a superset of. `TC-OFF-004` is now named, and since the BLE wire revision
> only this level requires the `TC-OFF-*` cases.

## 3. Test Case Structure

### 3.1 Naming Convention

Test cases follow the pattern `TC-{PROFILE}-{NNN}`:

| Prefix | Profile | Example |
|--------|---------|---------|
| `TC-CORE-` | Core | TC-CORE-001 |
| `TC-TX-` | Transaction | TC-TX-001 |
| `TC-DM-` | Device Management | TC-DM-001 |
| `TC-SEC-` | Security | TC-SEC-001 |
| `TC-OFF-` | Offline | TC-OFF-001 |

### 3.2 Required Sections

Every test case **MUST** include:

1. **Title** — Descriptive name
2. **Profile** — Which profile this test validates
3. **Purpose** — What the test proves
4. **References** — Links to normative spec sections
5. **Preconditions** — Required system state before execution
6. **Steps** — Numbered action sequence with expected message exchanges
7. **Expected Results** — Numbered pass criteria
8. **Failure Criteria** — What constitutes a test failure

## 4. Test Execution

### 4.1 Environment

- Tests **MUST** run against a dedicated test environment, not production.
- The test harness acts as either the server (for station testing) or the station
  (for server testing).
- Network conditions (latency, packet loss) **SHOULD** be controllable.
- See [SECURITY.md](SECURITY.md) for environment isolation requirements.

### 4.2 Execution Order

1. Run all `TC-CORE-*` tests first — these validate prerequisites for other profiles.
2. Run profile-specific tests in numerical order.
3. A failure in a Core test **SHOULD** halt further testing (dependent profiles will likely fail).

### 4.3 Pass/Fail Determination

- A test **passes** if all Expected Results are met and no Failure Criteria are triggered.
- A test **fails** if any Failure Criterion is triggered.
- Inconclusive results (e.g., timeout without clear pass/fail) **SHOULD** be re-run once.

## 5. Reporting Format

Conformance reports **SHOULD** include:

| Field | Description |
|-------|-------------|
| Implementation | Product name, version, vendor |
| Compliance Level | Development / Standard / Extended / Complete |
| OSPP Version | Protocol version tested against |
| Date | Test execution date |
| Test Results | Per-test pass/fail/skip with notes |
| Environment | Broker, OS, hardware, network conditions |
| Tester | Organization or individual running tests |
| Revocation posture | Whether the broker checks certificate revocation, by which mechanism, the two configured bounds, and where the grace-entry alert is delivered — **REQUIRED at Standard and above**, see below |

**One row of that table is not a SHOULD.** [`06-security.md` §2.1.1](../spec/06-security.md#211-revocation-checking)
makes the broker's certificate-revocation check a **MUST**, and it is a deployment capability no OSPP message
exposes: no field carries the answer, and a case run against a well-behaved station cannot tell a broker that checks
from one that does not. That clause therefore discharges its verification onto this report. A deployment claiming
**Standard** compliance or above **MUST** state its revocation posture here — enabled or not, the mechanism (CRL or
OCSP), the configured `CertificateRevocationMaxAgeSeconds` and `CertificateRevocationGraceSeconds`, and where the
grace-entry alert is delivered. A report omitting it is incomplete, and a deployment answering *disabled* is not
conforming — it may say so, which is the whole point of requiring the answer, but saying so is not a waiver.

## 6. Test Case Index

| ID | Title | Profile | Compliance Level |
|----|-------|---------|-----------------|
| TC-CORE-001 | Boot Notification Lifecycle | Core | Development |
| TC-CORE-002 | Connection Lost & Recovery | Core | Development |
| TC-CORE-003 | Server Accepts an Invalid Bay Transition as Authoritative | Core | Development — **server under test** |
| TC-TX-001 | Online Session Full Lifecycle | Transaction | Standard |
| TC-TX-002 | Reservation and Conversion | Transaction | Standard |
| TC-TX-003 | Early Stop with Refund | Transaction | Standard |
| TC-TX-004 | Cancel Reservation | Transaction | Standard |
| TC-TX-005 | Meter Values | Transaction | Standard |
| TC-TX-006 | Transaction Event Lifecycle | Transaction | Standard |
| TC-TX-007 | Autonomous Session Termination (SessionEnded EVENT) | Transaction | Standard |
| TC-SEC-001 | HMAC Signature Verification | Security | Standard |
| TC-SEC-002 | mTLS Certificate Validation | Security | Standard |
| TC-SEC-003 | Certificate Renewal Lifecycle | Security | Standard |
| TC-SEC-004 | SecurityEvent Verification | Security | Standard |
| TC-SEC-005 | Provisioning Retry Idempotency & Key Binding | Security | Standard |
| TC-SEC-006 | Bare Public Key Validity & Precedence at Provisioning | Security | Standard |
| TC-SEC-007 | Provisioning Success Response: Shape, Bindings and Replay Grouping | Security | Standard |
| TC-SEC-008 | Station Refuses a Broker Certificate It Cannot Anchor | Security | Standard — **station under test** |
| TC-SEC-009 | Station Refuses a Certificate Whose Name Does Not Match | Security | Standard — **station under test** |
| TC-DM-001 | Configuration Read/Write | Device Management | Extended |
| TC-DM-002 | Firmware Update | Device Management | Extended |
| TC-DM-003 | Reset | Device Management | Extended |
| TC-DM-004 | Update Firmware | Device Management | Extended |
| TC-DM-005 | Get Diagnostics | Device Management | Extended |
| TC-DM-006 | Change Configuration | Device Management | Extended |
| TC-DM-007 | Set Maintenance Mode | Device Management | Extended |
| TC-DM-008 | Update Service Catalog | Device Management | Extended |
| TC-DM-009 | Get Configuration | Device Management | Extended |
| TC-OFF-001 | Full Offline BLE Session | Offline | Complete — **EXPERIMENTAL, not claimable while BLE is** |
| TC-OFF-002 | OfflinePass Validation (10 Checks) | Offline | Complete — **EXPERIMENTAL, not claimable while BLE is**; check 5 withdrawn |
| TC-OFF-003 | Reconciliation: Server-Side Processing | Offline | Complete — MQTT, stable |
| TC-OFF-004 | Reconciliation: Station Upload & Recovery | Offline | Complete — MQTT, stable |
| TC-OFF-005 | Partial B: Station-Relayed Authorization | Offline | Complete — **EXPERIMENTAL, not claimable while BLE is** |
