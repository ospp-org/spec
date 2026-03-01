# Certificate Renewal

> **Status:** Draft

## 1. Overview

Certificate renewal enables stations to obtain new TLS certificates before their current certificates expire, without requiring physical access or manual provisioning. The protocol is inspired by OCPP 2.0.1 Security Profile 3 certificate management, adapted to the OSPP architecture.

Three MQTT messages support the certificate lifecycle:

| Message | Direction | Purpose |
|---------|-----------|---------|
| SignCertificate [MSG-022] | Station → Server | Station submits a CSR for signing |
| CertificateInstall [MSG-023] | Server → Station | Server delivers the signed certificate |
| TriggerCertificateRenewal [MSG-024] | Server → Station | Server instructs the station to initiate renewal |

## 2. Certificate Types

| Type | Description |
|------|-------------|
| `StationCertificate` | The station's X.509 client certificate used for mTLS authentication with the MQTT broker |
| `MQTTClientCertificate` | An MQTT-specific client certificate (when the station uses separate certificates for TLS and MQTT client identity) |

Most deployments use a single `StationCertificate` for both TLS and MQTT identity. The `MQTTClientCertificate` type is provided for deployments that separate transport-layer and application-layer certificates.

## 3. Automatic Renewal Flow

The station **SHOULD** initiate certificate renewal automatically when the current certificate is within `CertificateRenewalThresholdDays` (default: 30) of expiry.

```
Station                                    Server                    CA
  |                                          |                        |
  | [certificate < 30 days to expiry]        |                        |
  |                                          |                        |
  | 1. Generate ECDSA P-256 keypair          |                        |
  | 2. Create PKCS#10 CSR                    |                        |
  |                                          |                        |
  | SignCertificate REQ (CSR) ------------->  |                        |
  |                                          | 3. Validate CSR         |
  |  <------------ SignCertificate RES       |                        |
  |                (Accepted)                |                        |
  |                                          | 4. Forward CSR -------> |
  |                                          |                        | 5. Sign cert
  |                                          | <--- Signed cert ------ |
  |                                          |                        |
  |  <--------- CertificateInstall REQ      |                        |
  |              (cert + CA chain)           |                        |
  |                                          |                        |
  | 6. Validate cert chain                   |                        |
  | 7. Validate CN matches station ID        |                        |
  | 8. Install cert to secure storage        |                        |
  | 9. Update CertificateSerialNumber        |                        |
  |                                          |                        |
  | CertificateInstall RES (Accepted) ---->  |                        |
  |                                          |                        |
  | [Next TLS reconnection uses new cert]    |                        |
  |                                          |                        |
```

**Step-by-step:**

1. The station generates a new ECDSA P-256 keypair. The private key **MUST** be generated on-device and **MUST NOT** leave the station.
2. The station creates a PKCS#10 CSR with Subject CN = `stn_{station_id}` and sends it via SignCertificate REQUEST.
3. The server validates the CSR: correct format, CN matches the authenticated station ID (from mTLS), key algorithm is ECDSA P-256.
4. The server forwards the CSR to the Certificate Authority (Station CA).
5. The CA signs the certificate and returns it to the server.
6. The server delivers the signed certificate (and optionally the CA chain) via CertificateInstall REQUEST.
7. The station validates the certificate: chain verifies against known CA, CN matches its own station ID, key usage is correct, validity period is acceptable.
8. The station installs the certificate to its secure element, TPM, or encrypted NVS.
9. The station updates the `CertificateSerialNumber` configuration key.
10. On the next TLS reconnection (or renegotiation), the station uses the new certificate.

## 4. Server-Triggered Renewal

The server **MAY** trigger a certificate renewal at any time using TriggerCertificateRenewal.

```
Server                                     Station
  |                                          |
  | TriggerCertificateRenewal REQ ---------> |
  |                                          |
  |  <---- TriggerCertificateRenewal RES     |
  |        (Accepted)                        |
  |                                          |
  |  <---- SignCertificate REQ (CSR)         |
  |        [continues automatic flow]        |
  |                                          |
```

This is used when:
- The server detects an approaching expiry that the station has not yet addressed
- The CA has been rotated and all station certificates need reissuing
- A certificate has been compromised and must be replaced immediately

## 5. Priority Levels

| Days to Expiry | Priority | Behavior |
|:-:|:---:|---|
| > 30 | Normal | Station checks daily. No action unless server-triggered. |
| 7 — 30 | Elevated | Station initiates automatic renewal. Server logs a background alert. |
| < 7 | High | Station initiates renewal immediately. Server sends TriggerCertificateRenewal if station has not already started. Server alerts operator. |
| 0 (expired) | Emergency | Certificate has expired. Station treats next TLS failure as connection loss and reconnects. If reconnection fails due to certificate rejection, station enters offline-only mode (BLE). Recovery requires server-triggered renewal over an existing session or physical re-provisioning. |

## 6. Error Handling

### 6.1 CSR Rejected

If the server rejects the CSR (malformed, CN mismatch, renewal denied), the station receives a SignCertificate RESPONSE with `status: Rejected`. The station **SHOULD** retry once after 60 seconds. If the retry also fails, the station **MUST** log a SecurityEvent with `type: CertificateError` and alert the operator.

### 6.2 Certificate Installation Failed

If the station cannot install the certificate (chain validation failed, type mismatch, storage error), it sends a CertificateInstall RESPONSE with `status: Rejected` and the appropriate error code. The station continues using its current certificate.

### 6.3 CA Unreachable

If the server cannot reach the CA to sign the CSR, the server **SHOULD** respond to SignCertificate with `status: Accepted` (acknowledging receipt) and retry the CA submission internally. The CertificateInstall will be sent when the CA responds. If the CA remains unreachable for more than 24 hours, the server **SHOULD** alert the operator.

### 6.4 Station Cannot Generate Keypair

If the station's secure element or crypto hardware cannot generate a new keypair (hardware fault, entropy source failure), the station **MUST** reject the TriggerCertificateRenewal with error `4014 KEYPAIR_GENERATION_FAILED` and log a SecurityEvent with `type: HardwareFault`.

## 7. Security Considerations

- The station **MUST** generate the new private key on-device. The private key **MUST NOT** be transmitted to the server or included in the CSR (the CSR contains only the public key).
- The CSR **MUST** use ECDSA P-256. Other algorithms **MUST** be rejected by the server.
- The server **MUST** verify that the CSR's Subject CN matches the station ID from the mTLS session. This prevents a compromised station from requesting certificates for other stations.
- All three messages (SignCertificate, CertificateInstall, TriggerCertificateRenewal) **MUST** be HMAC-signed in `Critical` and `All` modes because they handle security-critical certificate material.
- The station **SHOULD** keep the old certificate and private key until the new certificate is successfully used for a TLS connection. If the new certificate causes a connection failure, the station **MAY** fall back to the old certificate.

## 8. Configuration

| Key | Type | Default | Range | Description |
|-----|------|---------|-------|-------------|
| `CertificateRenewalThresholdDays` | integer | 30 | 7—90 | Days before certificate expiry to initiate automatic renewal |
| `CertificateRenewalEnabled` | boolean | true | — | Master switch for automatic certificate renewal |

See [Chapter 08 — Configuration](../../08-configuration.md), Section 4.

## 9. Related Schemas

- SignCertificate Request: [`sign-certificate-request.schema.json`](../../../schemas/mqtt/sign-certificate-request.schema.json)
- SignCertificate Response: [`sign-certificate-response.schema.json`](../../../schemas/mqtt/sign-certificate-response.schema.json)
- CertificateInstall Request: [`certificate-install-request.schema.json`](../../../schemas/mqtt/certificate-install-request.schema.json)
- CertificateInstall Response: [`certificate-install-response.schema.json`](../../../schemas/mqtt/certificate-install-response.schema.json)
- TriggerCertificateRenewal Request: [`trigger-certificate-renewal-request.schema.json`](../../../schemas/mqtt/trigger-certificate-renewal-request.schema.json)
- TriggerCertificateRenewal Response: [`trigger-certificate-renewal-response.schema.json`](../../../schemas/mqtt/trigger-certificate-renewal-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md)
- Security model: [Chapter 06 — Security](../../06-security.md), §4.7
