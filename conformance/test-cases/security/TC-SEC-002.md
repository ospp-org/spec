# TC-SEC-002 — mTLS Certificate Validation

## Profile

Security Profile

## Purpose

Verify that the station presents a valid X.509 client certificate during the TLS 1.3 handshake with the MQTT broker, that the server validates the certificate chain correctly, and that connections with expired, revoked, or self-signed certificates are rejected with the appropriate error codes (`1003 TLS_HANDSHAKE_FAILED`, `1004 CERTIFICATE_ERROR`).

## References

- `spec/07-errors.md` §3.1 — Error codes 1003 `TLS_HANDSHAKE_FAILED`, 1004 `CERTIFICATE_ERROR`
- `spec/profiles/security/security-event.md` — SecurityEvent for certificate-related incidents
- `spec/profiles/core/boot-notification.md` — BootNotification requires successful TLS first
- `spec/profiles/core/connection-lost.md` — Connection failure behavior

## Preconditions

1. The test MQTT broker is configured to require mutual TLS (mTLS) with client certificate authentication.
2. A valid Certificate Authority (CA) chain is provisioned on the broker.
3. The station under test has a valid X.509 client certificate signed by the trusted CA.
4. The test harness has prepared the following test certificates:
   - **Valid certificate:** Signed by the trusted CA, not expired, not revoked.
   - **Expired certificate:** Signed by the trusted CA but with `notAfter` in the past.
   - **Self-signed certificate:** Not signed by the trusted CA.
   - **Revoked certificate:** Signed by the trusted CA but listed in the CRL/OCSP as revoked.
5. The test harness can intercept and inspect TLS handshake packets.
6. Network connectivity between the station and broker is available.

## Steps

### Part A — Valid Certificate (Happy Path)

1. Configure the station with the valid client certificate and private key.
2. Power on the station or trigger reconnection.
3. Observe the TLS 1.3 handshake between the station and the broker.
4. Verify the station presents its client certificate during the handshake.
5. Verify the broker accepts the certificate (handshake completes successfully).
6. Observe the station establishes the MQTT connection.
7. Observe the station sends BootNotification as the first message.
8. Verify normal operation proceeds (BootNotification ACCEPTED, Heartbeat begins).

### Part B — Server Validates Station Certificate

9. Using the test harness, extract the station's presented certificate from the TLS handshake.
10. Verify the certificate chain: station cert -> intermediate CA (if any) -> root CA.
11. Verify the certificate's `Subject` or `Subject Alternative Name` contains the station identifier.
12. Verify the certificate's `notBefore` <= current time <= `notAfter`.
13. Verify the certificate's key usage includes `clientAuth`.

### Part C — Expired Certificate Rejection

14. Provision the station with the expired certificate.
15. Trigger the station to connect to the MQTT broker.
16. Observe the TLS handshake.
17. Verify that the broker rejects the connection during the TLS handshake.
18. Verify the station logs error `1004` (`CERTIFICATE_ERROR`) locally.
19. Verify the station does NOT establish an MQTT connection.
20. Verify the station does NOT send BootNotification (no MQTT session exists).
21. If the station has an alternative reporting channel (e.g., management interface), verify a SecurityEvent is generated with relevant certificate error details.

### Part D — Self-Signed Certificate Rejection

22. Provision the station with the self-signed certificate.
23. Trigger the station to connect to the MQTT broker.
24. Verify the TLS handshake fails (broker rejects the unknown CA).
25. Verify the station logs error `1003` (`TLS_HANDSHAKE_FAILED`) or `1004` (`CERTIFICATE_ERROR`).
26. Verify no MQTT connection is established.

### Part E — Revoked Certificate Rejection

27. Provision the station with the revoked certificate.
28. Ensure the broker's CRL or OCSP responder is updated to reflect the revocation.
29. Trigger the station to connect.
30. Verify the TLS handshake fails due to certificate revocation.
31. Verify the station logs error `1004` (`CERTIFICATE_ERROR`).
32. Verify no MQTT connection is established.

### Part F — Certificate Renewal Behavior

33. With the expired certificate still provisioned, verify the station enters provisioning/recovery mode (per spec: "Station: enter provisioning mode for certificate renewal").
34. Provision a new valid certificate.
35. Trigger reconnection.
36. Verify the TLS handshake succeeds with the new certificate.
37. Verify BootNotification is sent and ACCEPTED.

## Expected Results

1. A station with a valid certificate completes the TLS 1.3 handshake and proceeds to MQTT connect + BootNotification.
2. The station's certificate contains proper attributes (stationId in SAN, clientAuth key usage, valid chain).
3. An expired certificate causes TLS handshake failure; no MQTT connection is established.
4. A self-signed certificate causes TLS handshake failure; no MQTT connection is established.
5. A revoked certificate causes TLS handshake failure; no MQTT connection is established.
6. The station logs the appropriate error code (`1003` or `1004`) for each certificate failure scenario.
7. After certificate renewal, the station successfully reconnects and resumes normal operation.

## Failure Criteria

1. Station connects successfully with an expired certificate.
2. Station connects successfully with a self-signed certificate.
3. Station connects successfully with a revoked certificate.
4. Station does not present a client certificate during the TLS handshake.
5. Station does not log error `1003` or `1004` on certificate rejection.
6. Station sends MQTT messages (including BootNotification) without a successful TLS handshake.
7. Station does not enter provisioning mode when its certificate is expired/invalid.
8. TLS version negotiated is below 1.3.
