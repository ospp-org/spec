# SecurityEvent

> **Status:** Draft

## 1. Overview

SecurityEvent is sent by the station to report security-relevant incidents to the server. It enables real-time security monitoring, alerting, and audit logging across the fleet. Every OSPP-compliant station **MUST** implement this action and **MUST** report all security-relevant incidents without filtering or suppression.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT (fire-and-forget; no response expected)

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `eventId` | string | Yes | Unique event identifier (`sec_` prefix, minimum 12 characters). |
| `type` | string | Yes | Security event type (see Event Types below). |
| `severity` | string | Yes | Severity level: `Critical`, `Error`, `Warning`, or `Info`. |
| `timestamp` | string | Yes | ISO 8601 timestamp of when the incident was detected. |
| `details` | object | Yes | Structured context about the incident (contents vary by event type). |

## 4. Event Types

| Type | Description | Typical Severity |
|-------------------------------|---------------------------------------------------------------|------------------|
| `MacVerificationFailure` | HMAC-SHA256 message authentication code did not match. Indicates message tampering or key mismatch. | Critical |
| `CertificateError` | TLS certificate validation failed (expired, untrusted CA, CN mismatch). | Critical |
| `UnauthorizedAccess` | An entity attempted an action without the required RBAC role or permission. | Warning |
| `OfflinePassRejected` | An OfflinePass failed validation (bad signature, expired, revoked, replayed). | Warning |
| `TamperDetected` | Physical tampering detected (case opened, sensor triggered, wiring alteration). | Critical |
| `BruteForceAttempt` | Multiple consecutive authentication failures from the same source within a short window. | Warning |
| `FirmwareIntegrityFailure` | Firmware hash verification failed at boot. The installed firmware does not match the expected checksum. | Critical |
| `FirmwareDowngradeAttempt` | A firmware update was received with a version older than the currently installed version. Logged regardless of whether `forceDowngrade` was set. | Warning |
| `HardwareFault` | Critical hardware error reported by the station (pump overcurrent, electrical fault, emergency stop). Generated when a 5xxx Critical error occurs. | Critical |
| `SoftwareFault` | Critical software error reported by the station (firmware crash, watchdog reset, memory exhaustion). Generated when a 51xx Critical error occurs. | Critical |
| `ClockSkew` | Station clock differs from server time by more than 300 seconds, detected during Heartbeat time synchronization. | Warning |

## 5. Severity Levels

| Severity | Description | Server-Side Handling | Retention |
|------------|-----------------------------------------------------------|-----------------------------------------------|-----------|
| `Critical` | Indicates a security breach or imminent threat to station integrity. The station **MAY** be unable to continue safe operation. | Server **MUST** trigger an immediate operator alert (push notification, SMS, or dashboard alarm). Server **SHOULD** consider placing the station in maintenance mode. | 365 days minimum. |
| `Error` | A significant security event that indicates a failure in a security mechanism but does not constitute an immediate breach. | Server **MUST** log the event and **SHOULD** alert operators within 1 hour. Server **SHOULD** investigate the root cause. | 180 days minimum. |
| `Warning` | A potentially suspicious event that does not immediately compromise security but requires attention. | Server **MUST** log the event and **SHOULD** increment a warning counter. If 3+ warnings of the same type occur within 5 minutes, the server **SHOULD** escalate to `Critical`. | 90 days minimum. |
| `Info` | An informational security event logged for audit purposes. No immediate action is required. | Server **MUST** log the event. No alerting required. | 30 days minimum. |

## 6. Processing Rules

1. The station **MUST** generate a SecurityEvent for every security-relevant incident, including but not limited to the event types listed in section 4.
2. The station **MUST** assign a unique `eventId` to each event using the format `sec_` followed by at least 8 hexadecimal characters.
3. The `timestamp` **MUST** reflect the time the incident was detected on the station, not the time the message is sent.
4. The `details` object **SHOULD** include all context relevant to the incident. For `MacVerificationFailure`, this **SHOULD** include the `messageId`, `action`, and the expected vs. received MAC values. For `OfflinePassRejected`, this **SHOULD** include the `offlinePassId` and the validation check that failed.
5. SecurityEvent is fire-and-forget -- the server does not send a response. If MQTT delivery is delayed (e.g., station is temporarily disconnected), the station **SHOULD** buffer the event for transmission upon reconnection.
6. The station **MUST NOT** suppress or aggregate Critical events. Warning and Info events **MAY** be batched if the station is generating a high volume (more than 10 per minute), but each individual event **MUST** still be delivered.
7. The server **MUST** store all received SecurityEvents in an append-only audit log that is not modifiable by station operators.

## 7. Error Handling

SecurityEvent is a one-way event -- there is no response payload and therefore no response-level errors. If the station cannot deliver the event due to a network failure, it **MUST** buffer the event locally and transmit it when connectivity is restored. The station **SHOULD** maintain a buffer of at least 100 events.

## 8. Examples

### 8.1 MAC Verification Failure (Critical)

```json
{
  "messageId": "msg_a2b3c4d5-e6f7-8901-9abc-234567890def",
  "messageType": "Event",
  "action": "SecurityEvent",
  "timestamp": "2026-02-13T10:20:05.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "eventId": "sec_a1b2c3d4e5f6",
    "type": "MacVerificationFailure",
    "severity": "Critical",
    "timestamp": "2026-02-13T10:20:04.800Z",
    "details": {
      "messageId": "msg_f5a6b7c8-d9e0-1234-abcd-567890123def",
      "action": "StartService",
      "expectedMac": "SEFDS0UtU0hBMjU2LWV4cGVjdGVkLW1hYy12YWx1ZS1iYXNlNjQ=",
      "receivedMac": "SEFDS0UtU0hBMjU2LXJlY2VpdmVkLW1hYy12YWx1ZS1iYXNlNjQ=",
      "receivedAt": "2026-02-13T10:20:04.800Z",
      "sourceIp": "192.168.1.100"
    }
  }
}
```

### 8.2 Offline Pass Rejected (Warning)

```json
{
  "messageId": "msg_d4e5f6a7-b8c9-0123-cdef-456789012abc",
  "messageType": "Event",
  "action": "SecurityEvent",
  "timestamp": "2026-02-13T11:15:30.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "eventId": "sec_b2c3d4e5f6a7",
    "type": "OfflinePassRejected",
    "severity": "Warning",
    "timestamp": "2026-02-13T11:15:29.500Z",
    "details": {
      "offlinePassId": "opass_a8b9c0d1e2f3",
      "failedCheck": "OFFLINE_PASS_EXPIRED",
      "passExpiresAt": "2026-02-13T10:50:00.000Z",
      "stationTime": "2026-02-13T11:15:29.500Z"
    }
  }
}
```

### 8.3 Firmware Integrity Failure (Critical)

```json
{
  "messageId": "msg_e5f6a7b8-c9d0-1234-ef01-567890123abc",
  "messageType": "Event",
  "action": "SecurityEvent",
  "timestamp": "2026-02-13T08:00:15.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "eventId": "sec_c3d4e5f6a7b8",
    "type": "FirmwareIntegrityFailure",
    "severity": "Critical",
    "timestamp": "2026-02-13T08:00:14.200Z",
    "details": {
      "expectedHash": "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      "actualHash": "sha256:f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1",
      "firmwareVersion": "1.2.3",
      "bootReason": "PowerOn"
    }
  }
}
```

## 9. Related Schemas

- Event: [`security-event.schema.json`](../../../schemas/mqtt/security-event.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md)
- Security model: [Chapter 06 — Security](../../06-security.md)
