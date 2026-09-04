# Conformance Security Notes

> **Status:** Draft | **OSPP Version:** 0.31.0

Security considerations for setting up and running OSPP conformance tests.

---

## 1. Test Environment Isolation

- Conformance tests **MUST** run in an isolated network segment, separate from
  production infrastructure.
- The test MQTT broker **MUST NOT** be reachable from production stations or
  the public internet.
- Test environments **SHOULD** use a dedicated VLAN or virtual network.
- If testing BLE functionality, the test area **SHOULD** be shielded from
  unrelated BLE devices to avoid interference.

## 2. Credential Handling

- Test certificates **MUST** be issued by a dedicated test CA, not the production
  PKI. The test CA root certificate **MUST NOT** be trusted by production systems.
- Test MQTT credentials (username/password or client certificates) **MUST** be
  unique to the test environment and rotated after each test campaign.
- OfflinePass signing keys used in `TC-OFF-*` tests **MUST** be test-only keys.
  Production signing keys **MUST NEVER** be used in conformance testing.
- All test credentials **SHOULD** be stored in a secrets manager or encrypted
  vault during the test campaign and destroyed afterward.
- Webhook secrets for payment simulation **MUST** be test-only values.

## 3. Network Requirements

- The test network **MUST** support TLS 1.2 and TLS 1.3 for MQTT connections (the floor is TLS 1.2; TLS-1.3-capable stations negotiate 1.3).
- For mTLS tests (`TC-SEC-002`), the test harness **MUST** be able to present
  valid, expired, self-signed, and revoked certificates.
- The test network **MUST** provide a revocation source the test broker can consult — a CRL
  the test CA publishes, or an OCSP responder — and the harness **MUST** be able to update it
  and to make it unreachable. `TC-SEC-002` Part E already assumes the first (*"Ensure the
  broker's CRL or OCSP responder is updated to reflect the revocation"*) and this section had
  never listed it; the second is what makes the stale-and-unobtainable behaviour of
  [`06-security.md` §2.1.1](../spec/06-security.md#211-revocation-checking) reachable at all.
  Neither is a substitute for the revocation posture a deployment declares in its report —
  this is a harness broker, not the deployment's.
- Network simulation capabilities (latency injection, packet loss, disconnection)
  are **RECOMMENDED** for resilience testing.
- DNS resolution for the test broker **SHOULD** be controlled (e.g., via
  `/etc/hosts` or a local DNS server) to avoid accidental production connections.

## 4. Data Handling

- Test data (station IDs, subscriber IDs, session data) **MUST** use synthetic
  values that cannot be confused with production data.
- Recommended test ID prefix: `test_` (e.g., `stn_test_a1b2c3d4`).
- Test logs **MAY** contain sensitive protocol data (keys, tokens, signatures).
  These logs **SHOULD** be treated as confidential and deleted after analysis.

## 5. BLE Test Safety

- BLE advertising during tests **SHOULD** use a test-specific station name
  prefix (e.g., `OSPP-TEST-*`) to prevent consumer apps from connecting.
- BLE test transmit power **SHOULD** be set to the minimum level required for
  reliable communication within the test area.
- Offline passes issued for BLE tests **MUST** have short expiry times
  (maximum 5 minutes) to limit exposure if intercepted.
