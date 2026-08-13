# Security Profile

> **Status:** Draft

## 1. Overview

The **Security** profile covers two things: **security event reporting** and the **certificate
lifecycle**.

When a station detects a security-relevant incident — such as physical tampering, certificate
errors, firmware integrity failures, or repeated authentication failures — it reports a
SecurityEvent to the server. This ensures that operators have immediate awareness of potential
threats.

The certificate lifecycle is the three messages by which a station renews the identity it
authenticates with, before that identity expires and without a site visit. They are specified in
[certificate-renewal.md](certificate-renewal.md), which is the normative home for all three; this
README indexes them and states nothing about them that file does not.

The Security profile is mandatory for all stations at **Standard** compliance and above.

### Document Index

| Document | Contents |
|----------|----------|
| [security-event.md](security-event.md) | SecurityEvent [MSG-012] — event types, severities, buffering |
| [certificate-renewal.md](certificate-renewal.md) | SignCertificate [MSG-022], CertificateInstall [MSG-023], TriggerCertificateRenewal [MSG-024] — renewal flows, certificate types, error handling |

## 2. Actions Summary

| Action | Direction | Type | Description |
|-------------------------------------------|-------------------|---------|-----------------------------------------------|
| [SecurityEvent](security-event.md) | Station to Server | EVENT | Report security incidents to the server |
| [SignCertificate](certificate-renewal.md) | Station to Server | REQ/RES | Submit a CSR to renew the station's own identity certificate |
| [CertificateInstall](certificate-renewal.md) | Server to Station | REQ/RES | Deliver an issued certificate, and optionally the CA chain that verifies it, for the station to install |
| [TriggerCertificateRenewal](certificate-renewal.md) | Server to Station | REQ/RES | Instruct the station to begin a renewal it has not initiated itself |

## 3. Compliance Requirements

1. **SecurityEvent is mandatory.** Every station at Standard compliance or above MUST implement SecurityEvent.
2. **SecurityEvent** MUST be sent for all security-relevant incidents as defined in [security-event.md](security-event.md). The station MUST NOT filter, suppress, or delay Critical-severity events. The station MUST buffer events during connectivity loss and transmit them upon reconnection.
3. All security events MUST be delivered with MQTT QoS 1 (at least once) to ensure reliable delivery. The server MUST deduplicate by `eventId`.
4. **The certificate lifecycle requirements are [certificate-renewal.md](certificate-renewal.md)** and are not restated here. That file carries the renewal thresholds, the certificate types, the server-triggered flow and the four error cases; this list would otherwise be a second copy of them.
