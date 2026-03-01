# TC-SEC-003 — Certificate Renewal Lifecycle

## Profile

Security Profile

## Purpose

Verify the complete certificate renewal lifecycle: automatic station-initiated renewal when the certificate approaches expiry, server-triggered renewal via TriggerCertificateRenewal, CSR rejection handling with retry and SecurityEvent escalation, certificate chain validation failure, and keypair generation failure.

## References

- `spec/profiles/security/certificate-renewal.md` — Certificate renewal flow and error handling
- `spec/03-messages.md` §6.10 — SignCertificate [MSG-022] (timeout 30s)
- `spec/03-messages.md` §6.11 — CertificateInstall [MSG-023] (timeout 30s)
- `spec/03-messages.md` §6.12 — TriggerCertificateRenewal [MSG-024] (timeout 10s)
- `spec/07-errors.md` §3.4 — Error codes 4010 `CSR_INVALID`, 4011 `CERTIFICATE_CHAIN_INVALID`, 4014 `KEYPAIR_GENERATION_FAILED`
- `spec/08-configuration.md` §4 — `CertificateRenewalThresholdDays` (default 30, range 7–90), `CertificateRenewalEnabled` (default true)
- `spec/06-security.md` §4.7 — Certificate lifecycle security considerations
- `spec/profiles/security/security-event.md` — SecurityEvent for certificate errors
- `schemas/mqtt/sign-certificate-request.schema.json`
- `schemas/mqtt/sign-certificate-response.schema.json`
- `schemas/mqtt/certificate-install-request.schema.json`
- `schemas/mqtt/certificate-install-response.schema.json`
- `schemas/mqtt/trigger-certificate-renewal-request.schema.json`
- `schemas/mqtt/trigger-certificate-renewal-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. MQTT connection is stable; Heartbeat exchange is functioning.
3. Station has an existing valid X.509 client certificate with a known expiry date.
4. `CertificateRenewalEnabled` is `true` (default).
5. `CertificateRenewalThresholdDays` is set to `30` (default).
6. `MessageSigningMode` is set to `Critical` (HMAC signing enabled for security messages).
7. Test harness has a CA capable of signing CSRs with ECDSA P-256.
8. Test harness can inspect the station's CSR content and certificate installation state.

## Steps

### Part A — Automatic Renewal (Station-Initiated)

1. Configure `CertificateRenewalThresholdDays` to `30` via ChangeConfiguration.
2. Set the station's certificate expiry to 25 days from now (within the 30-day threshold).
3. Verify the station detects the certificate is within the renewal threshold.
4. Observe SignCertificate REQUEST [MSG-022] from the station:
   ```json
   {
     "certificateType": "StationCertificate",
     "csr": "-----BEGIN CERTIFICATE REQUEST-----\n<PEM-encoded PKCS#10 CSR>\n-----END CERTIFICATE REQUEST-----"
   }
   ```
5. Verify the CSR contains:
   - Key algorithm: ECDSA P-256
   - Subject CN: `stn_a1b2c3d4`
   - A valid PKCS#10 structure
6. Verify the HMAC signature (`mac` field) is present in the MQTT envelope (Critical mode).
7. Send SignCertificate RESPONSE within 30 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
8. Sign the CSR with the test CA and send CertificateInstall REQUEST [MSG-023]:
   ```json
   {
     "certificateType": "StationCertificate",
     "certificate": "-----BEGIN CERTIFICATE-----\n<PEM-encoded signed X.509 certificate>\n-----END CERTIFICATE-----",
     "caCertificateChain": "-----BEGIN CERTIFICATE-----\n<PEM-encoded intermediate CA>\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\n<PEM-encoded root CA>\n-----END CERTIFICATE-----"
   }
   ```
9. Verify CertificateInstall RESPONSE within 30 seconds:
   ```json
   {
     "status": "Accepted",
     "certificateSerialNumber": "7A:3F:B2:C1:D4:E5:F6:A7"
   }
   ```
10. Verify `certificateSerialNumber` is present in the response.
11. Send GetConfiguration to verify `CertificateSerialNumber` config key is updated:
    ```json
    {
      "keys": ["CertificateSerialNumber"]
    }
    ```
12. Verify the returned value matches the certificate serial number from step 9.

### Part B — Server-Triggered Renewal

13. Send TriggerCertificateRenewal REQUEST [MSG-024] to the station:
    ```json
    {
      "certificateType": "StationCertificate"
    }
    ```
14. Verify TriggerCertificateRenewal RESPONSE within 10 seconds:
    ```json
    {
      "status": "Accepted"
    }
    ```
15. Observe the station initiates the SignCertificate flow asynchronously:
    - Station generates a new ECDSA P-256 keypair.
    - Station sends SignCertificate REQUEST [MSG-022] with a new CSR.
16. Verify the new CSR contains a different public key than the one from Part A.
17. Verify the HMAC signature is present on the SignCertificate REQUEST.
18. Send SignCertificate RESPONSE `status: "Accepted"`.
19. Sign the CSR and send CertificateInstall REQUEST.
20. Verify CertificateInstall RESPONSE `status: "Accepted"` with a new `certificateSerialNumber`.

### Part C — CSR Rejection with Retry and Escalation

21. Send TriggerCertificateRenewal to the station.
22. Verify response `status: "Accepted"`.
23. Observe SignCertificate REQUEST from the station.
24. Send SignCertificate RESPONSE rejecting the CSR:
    ```json
    {
      "status": "Rejected",
      "errorCode": 4010,
      "errorText": "CSR_INVALID"
    }
    ```
25. Wait 60 seconds (+/- 10%).
26. Verify the station retries SignCertificate REQUEST with a new CSR.
27. Send SignCertificate RESPONSE rejecting the retry:
    ```json
    {
      "status": "Rejected",
      "errorCode": 4010,
      "errorText": "CSR_INVALID"
    }
    ```
28. Verify the station does NOT retry a third time (2 attempts total per spec §6.1).
29. Observe SecurityEvent [MSG-012] from the station:
    ```json
    {
      "eventId": "sec_<unique>",
      "type": "CertificateError",
      "severity": "Critical",
      "timestamp": "<ISO 8601>",
      "details": {
        "reason": "CSR rejected twice",
        "errorCode": 4010,
        "certificateType": "StationCertificate"
      }
    }
    ```
30. Verify the station continues using its current certificate.

### Part D — Certificate Chain Invalid

31. Send TriggerCertificateRenewal to the station.
32. Verify response `status: "Accepted"`.
33. Observe SignCertificate REQUEST from the station.
34. Send SignCertificate RESPONSE `status: "Accepted"`.
35. Send CertificateInstall REQUEST with a broken certificate chain (intermediate CA missing):
    ```json
    {
      "certificateType": "StationCertificate",
      "certificate": "-----BEGIN CERTIFICATE-----\n<PEM-encoded certificate signed by intermediate CA>\n-----END CERTIFICATE-----",
      "caCertificateChain": "-----BEGIN CERTIFICATE-----\n<PEM-encoded root CA only, intermediate missing>\n-----END CERTIFICATE-----"
    }
    ```
36. Verify CertificateInstall RESPONSE within 30 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 4011,
      "errorText": "CERTIFICATE_CHAIN_INVALID"
    }
    ```
37. Verify the station continues using its current certificate (no disruption to MQTT connection).
38. Verify the station does NOT update `CertificateSerialNumber`.

### Part E — Keypair Generation Failure

39. Configure the test harness to simulate a crypto hardware fault on the station (e.g., disable the secure element or TPM).
40. Send TriggerCertificateRenewal REQUEST:
    ```json
    {
      "certificateType": "StationCertificate"
    }
    ```
41. Verify TriggerCertificateRenewal RESPONSE within 10 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 4014,
      "errorText": "KEYPAIR_GENERATION_FAILED"
    }
    ```
42. Observe SecurityEvent [MSG-012] from the station:
    ```json
    {
      "eventId": "sec_<unique>",
      "type": "HardwareFault",
      "severity": "Critical",
      "timestamp": "<ISO 8601>",
      "details": {
        "component": "crypto",
        "reason": "Keypair generation failed",
        "errorCode": 4014
      }
    }
    ```
43. Verify the station continues normal operation (existing certificate remains valid).

## Expected Results

1. Station detects certificate within renewal threshold and initiates SignCertificate automatically.
2. CSR uses ECDSA P-256 with correct Subject CN matching station ID.
3. All SignCertificate, CertificateInstall, and TriggerCertificateRenewal messages have HMAC signatures in Critical mode.
4. Station installs a valid certificate and updates `CertificateSerialNumber` config.
5. Server-triggered renewal (TriggerCertificateRenewal) results in Accepted + asynchronous SignCertificate flow.
6. Each renewal generates a new keypair (different public key in CSR).
7. CSR rejection: station retries once after 60s, then logs SecurityEvent `CertificateError` on second failure.
8. Station does NOT retry a third time after two CSR rejections.
9. Invalid certificate chain returns `4011 CERTIFICATE_CHAIN_INVALID`; station keeps current certificate.
10. Keypair generation failure returns `4014 KEYPAIR_GENERATION_FAILED` + SecurityEvent `HardwareFault`.
11. All TriggerCertificateRenewal responses arrive within the 10-second timeout.
12. All SignCertificate and CertificateInstall responses arrive within the 30-second timeout.

## Failure Criteria

1. Station does not initiate renewal when certificate is within the threshold.
2. CSR uses an algorithm other than ECDSA P-256.
3. CSR Subject CN does not match the station ID.
4. HMAC signature is missing from any of the three certificate messages in Critical mode.
5. Station does not update `CertificateSerialNumber` after successful certificate installation.
6. Station does not retry after first CSR rejection.
7. Station retries more than once after CSR rejection (3+ attempts).
8. No SecurityEvent is generated after two consecutive CSR rejections.
9. Station installs a certificate with an invalid chain (should reject with 4011).
10. Station disrupts its MQTT connection or stops operating after a certificate installation failure.
11. Keypair generation failure does not produce a SecurityEvent with `HardwareFault` type.
12. Any response exceeds its specified timeout (10s for TriggerCertificateRenewal, 30s for others).
