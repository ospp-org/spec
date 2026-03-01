# OSPP Conformance Testing

> **Status:** Draft | **OSPP Version:** 0.1.0-draft.1

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
it validates session lifecycle, metering, and mandatory security (TLS 1.3 + mTLS +
HMAC-SHA256).

| Requirement | Test Cases |
|-------------|------------|
| Session lifecycle | TC-TX-001 |
| Reservation and conversion | TC-TX-002 |
| Early stop with refund | TC-TX-003 |
| HMAC signature verification | TC-SEC-001 |
| mTLS certificate validation | TC-SEC-002 |

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
| TC-TX-001 | Online Session Full Lifecycle | Transaction | Standard |
| TC-TX-002 | Reservation and Conversion | Transaction | Standard |
| TC-TX-003 | Early Stop with Refund | Transaction | Standard |
| TC-SEC-001 | HMAC Signature Verification | Security | Standard |
| TC-SEC-002 | mTLS Certificate Validation | Security | Standard |
| TC-DM-001 | Configuration Read/Write | Device Management | Extended |
| TC-DM-002 | Firmware Update | Device Management | Extended |
| TC-OFF-001 | Full Offline BLE Session | Offline | Complete |
| TC-OFF-002 | OfflinePass Validation (10 Checks) | Offline | Complete |
| TC-OFF-003 | Reconciliation | Offline | Complete |
