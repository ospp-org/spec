# OSPP Conformance Testing

> **Status:** Draft | **OSPP Version:** 0.8.0

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

> **Extended and Complete cannot be claimed against 0.8.**
>
> Both levels require the Offline / BLE profile, whose BLE half is **EXPERIMENTAL** in this
> revision and carries three blockers that make it unimplementable as written — see
> [Release status](../README.md#ble-is-experimental-in-08) and
> [KNOWN-ISSUES](../KNOWN-ISSUES.md#blocker--the-ble-surface-is-not-implementable-as-written-three-defects).
> `TC-OFF-001` and `TC-OFF-002` exercise that surface and are experimental artefacts with it;
> `TC-OFF-002` check 5 is directly blocked, since it instructs the tester to construct a pass the
> authoritative schema cannot represent (B-2).
>
> **Development and Standard are unaffected and remain claimable.** Their required cases —
> `TC-CORE-*`, `TC-TX-*`, `TC-SEC-*` — run over MQTT and HTTPS only. Two are worth naming because
> they read as offline or BLE work and are not blocked:
>
> - **`TC-TX-006`** is entirely offline *reconciliation*, but reconciliation runs over **MQTT**,
>   is implemented, and is exercised against a second implementation. It stays Standard and is
>   fully runnable.
> - **`TC-SEC-002`** step 33 requires a station to enter "offline-only BLE mode" on an expired
>   certificate, per the `1004` row in [`07-errors.md` §3.1](../spec/07-errors.md). This is a
>   genuine dependency of a mandatory level on the experimental surface — see the note under
>   §2.2 below.
>
> The compliance ladder itself is **unchanged** in 0.8. Restructuring it belongs in the revision
> that implements BLE, where the new shape can be validated against something real.

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
| LWT configured at MQTT CONNECT | TC-CORE-001 (Part A) |

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

> **`TC-SEC-002` step 33 and the experimental BLE surface.** The step requires a station holding
> an expired certificate to enter "offline-only BLE mode", following the `expired` branch of the
> `1004` row in [`07-errors.md` §3.1](../spec/07-errors.md). A mandatory level therefore appears
> to depend on an experimental profile.
>
> It does not, once the requirement is read for what it actually asserts. The `1004` `expired`
> branch carries two obligations, and only one of them is BLE: the **negative** obligations —
> never enter provisioning mode, never discard or overwrite stored credentials, stay off the
> broker, await server-triggered renewal — are what the case exists to prove, are what the
> registry row states as a MUST on every branch, and are observable on any station. Entering BLE
> mode is what a station *with BLE* does *instead of* provisioning; it is the alternative
> occupying the station, not the property under test.
>
> **For 0.8, therefore:** step 33's BLE clause applies only where the station declares
> `bleSupported`, and is recorded as skipped otherwise. The negative obligations are asserted on
> **every** station and are not waived. Steps 97 and 108 of the same case already state the
> requirement in that form. This scopes one step; it does not weaken the case, and it does not
> change the ladder.

### 2.3 Extended Compliance

**Required profiles:** Standard + Device Management + Offline/BLE

An Extended-compliant station **MUST** pass all Standard test cases plus
`TC-DM-*` and `TC-OFF-*` test cases. This level adds remote configuration,
firmware updates, diagnostics, maintenance mode, BLE communication, OfflinePass
validation, and offline session reconciliation.

| Requirement | Test Cases |
|-------------|------------|
| All Standard requirements | TC-CORE-*, TC-TX-*, TC-SEC-* |
| Configuration read/write | TC-DM-001 |
| Firmware update | TC-DM-002 |
| Offline/BLE operation | TC-OFF-* |

### 2.4 Complete Compliance

**Required profiles:** Extended + Partial B scenario

A Complete-compliant station **MUST** pass all Extended test cases plus
Partial B scenario test cases. This level validates full protocol support
including Partial B connectivity (phone offline, station online — station
relays auth to server via MQTT).

| Requirement | Test Cases |
|-------------|------------|
| All Extended requirements | TC-CORE-*, TC-TX-*, TC-SEC-*, TC-DM-* |
| Full offline BLE session | TC-OFF-001 |
| OfflinePass validation (10 checks) | TC-OFF-002 |
| Reconciliation | TC-OFF-003 |

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

## 6. Test Case Index

| ID | Title | Profile | Compliance Level |
|----|-------|---------|-----------------|
| TC-CORE-001 | Boot Notification Lifecycle | Core | Development |
| TC-CORE-002 | Connection Lost & Recovery | Core | Development |
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
| TC-DM-001 | Configuration Read/Write | Device Management | Extended |
| TC-DM-002 | Firmware Update | Device Management | Extended |
| TC-DM-003 | Reset | Device Management | Extended |
| TC-DM-004 | Update Firmware | Device Management | Extended |
| TC-DM-005 | Get Diagnostics | Device Management | Extended |
| TC-DM-006 | Change Configuration | Device Management | Extended |
| TC-DM-007 | Set Maintenance Mode | Device Management | Extended |
| TC-DM-008 | Update Service Catalog | Device Management | Extended |
| TC-DM-009 | Get Configuration | Device Management | Extended |
| TC-OFF-001 | Full Offline BLE Session | Offline | Complete — **EXPERIMENTAL, not claimable in 0.8** |
| TC-OFF-002 | OfflinePass Validation (10 Checks) | Offline | Complete — **EXPERIMENTAL, not claimable in 0.8**; check 5 unrunnable (B-2) |
| TC-OFF-003 | Reconciliation: Server-Side Processing | Offline | Complete — MQTT, stable |
| TC-OFF-004 | Reconciliation: Station Upload & Recovery | Offline | Complete — MQTT, stable |
