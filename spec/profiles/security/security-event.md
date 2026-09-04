# SecurityEvent

> **Status:** Draft | **OSPP Version:** 0.29.0

## 1. Overview

SecurityEvent is sent by the station to report security-relevant incidents to the server. It enables real-time security monitoring, alerting, and audit logging across the fleet. Every OSPP-compliant station **MUST** implement this action and **MUST** report all security-relevant incidents without filtering or suppression.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT (fire-and-forget; no response expected)

### 2.1 Two origins, one payload shape

**A SecurityEvent has two origins, and only one of them is a message.** The distinction is stated here because this document previously described only the first while five registry entries and four processing rules elsewhere in the specification required the second, and an implementer reading this section alone would conclude that those rules address an actor that cannot perform them.

**Station-originated — the wire EVENT.** The station detects the incident and publishes it. This is the direction above, it is the only direction that exists on the wire, and rules 1 through 6 of [§6](#6-processing-rules) bind it.

**Server-originated — an audit record, never a message.** The server detects the incident itself, while processing something a station sent, and writes the same payload shape directly into the append-only log of [§6](#6-processing-rules) rule 7. It is **NOT** published: there is no Server → Station SecurityEvent, [`07-errors.md` §4.1](../../07-errors.md#41-station--server-mqtt-actions) lists MSG-012 as Station → Server only, and the station has nothing to do with the record. A server **MUST NOT** publish a SecurityEvent to a station.

Both forms validate against [`security-event.schema.json`](../../../schemas/mqtt/security-event.schema.json) — the shape is one shape, which is why the server-originated form needs no schema of its own and adds nothing to the wire. Two rules are scoped rather than shared, and each is stated where it applies: the `timestamp` of a server-originated record is when the **server** detected the incident (rule 3 binds the station-originated form), and its `eventId` is derived deterministically from the originating REQUEST's `messageId` rather than assigned at detection (rule 2 binds the station-originated form), so that one REQUEST that fails one check yields one audit row however many times it is retransmitted.

**Where the server-originated form is required.** Every site is an offline-credential rejection, and each states its own `eventId` derivation and `details` set:

| Site | Trigger |
|---|---|
| [`authorize-offline-pass.md` §6](../offline/authorize-offline-pass.md) rule 7 | authorize-time check #1 (signature) and check #10 (counter replay) — **and no other authorize-time outcome** |
| [`reconciliation.md` §3](../offline/reconciliation.md#3-deduplication-offlinetxid) | a second submission under a known `offlineTxId` whose signed `receipt.data` differs |
| [`reconciliation.md` §6.3](../offline/reconciliation.md#63-securityevent-emission) | every applicable reconcile-time gate failure |
| [`reconciliation.md` §6.7](../offline/reconciliation.md#67-partial-a-reconciliation-auth-form--findings-n2--n3--q4) | the auth-form `(authId, sessionId)` replay reject |
| [`07-errors.md` §3.2](../../07-errors.md#32-authentication--authorization-errors-2xxx), codes `2014`, `2015`, `2016`, `2017`, `2018` | the *Recommended Action* cell of each, which reads *"Server: log SecurityEvent"* |

`OfflinePassRejected` and `ServerSignedAuthReplay` are therefore the two types that occur in both forms. [§4](#4-event-types)'s row for `ServerSignedAuthReplay` already said so — *"the server logs this type at the next reconciliation"* — and was the only place in this document that did.

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
| `CertificateError` | TLS certificate validation failed (expired, **revoked**, untrusted CA, CN mismatch). | Critical |
| `UnauthorizedAccess` | An entity attempted an action without the required RBAC role or permission. | Warning |
| `OfflinePassRejected` | An OfflinePass failed validation (bad signature, expired, revoked, replayed). | Warning |
| `ServerSignedAuthReplay` | A ServerSignedAuth (Partial A) authorization was presented whose signed `appNonce` claim did not match the current handshake's `Hello.appNonce` — a replay of a captured authorization (error `2018 SERVER_AUTH_NONCE_MISMATCH`; `ble-handshake.md` §4.2.2 check #2). The station rejects it at the handshake; the server logs this type at the next reconciliation. | Critical |
| `TamperDetected` | Physical tampering detected (case opened, sensor triggered, wiring alteration). | Critical |
| `BruteForceAttempt` | Multiple consecutive authentication failures from the same source within a short window. | Warning |
| `FirmwareIntegrityFailure` | Firmware hash verification failed at boot. The installed firmware does not match the expected checksum. | Critical |
| `FirmwareDowngradeAttempt` | A firmware update was received with a version older than the currently installed version. Logged regardless of whether `forceDowngrade` was set. | Warning |
| `HardwareFault` | Critical hardware error reported by the station (pump overcurrent, electrical fault, emergency stop). The **fallback** type for a Critical `5xxx` code that is **not** `51xx` and is named by no row in this table — see the two-step selection in [`07-errors.md` §1.2](../../07-errors.md#12-severity-levels). | Critical |
| `SoftwareFault` | Critical software error reported by the station (firmware crash, watchdog reset, memory exhaustion — `5111 BUFFER_FULL` is this last one). The **fallback** type for a Critical `51xx` code named by no row in this table. `51xx` is tested **before** the `HardwareFault` row's `5xxx`, because `5xxx` contains it. | Critical |
| `ClockSkew` | Station clock differs from server time by more than 300 seconds, detected during Heartbeat time synchronization. | Warning |

## 5. Severity Levels

| Severity | Description | Server-Side Handling | Retention |
|------------|-----------------------------------------------------------|-----------------------------------------------|-----------|
| `Critical` | Indicates a security breach or imminent threat to station integrity. The station **MAY** be unable to continue safe operation. | Server **MUST** trigger an immediate operator alert (push notification, SMS, or dashboard alarm). Server **SHOULD** consider placing the station in maintenance mode. | 365 days minimum. |
| `Error` | A significant security event that indicates a failure in a security mechanism but does not constitute an immediate breach. | Server **MUST** log the event and **SHOULD** alert operators within 1 hour. Server **SHOULD** investigate the root cause. | 180 days minimum. |
| `Warning` | A potentially suspicious event that does not immediately compromise security but requires attention. | Server **MUST** log the event and **SHOULD** increment a warning counter. If 3+ warnings of the same type occur within 5 minutes, the server **SHOULD** escalate to `Critical`. | 90 days minimum. |
| `Info` | An informational security event logged for audit purposes. No immediate action is required. | Server **MUST** log the event. No alerting required. | 30 days minimum. |

## 6. Processing Rules

**Rules 1 through 6 bind the station-originated form** ([§2.1](#21-two-origins-one-payload-shape)); rule 7 binds the server and covers both forms.

1. The station **MUST** generate a SecurityEvent for every security-relevant incident, including but not limited to the event types listed in section 4.
2. The station **MUST** assign a unique `eventId` to each event using the format `sec_` followed by at least 8 hexadecimal characters. The `eventId` **MUST** be assigned at the moment the incident is detected and **MUST** remain stable across every subsequent transmission of the same logical incident, including QoS 1 retransmissions and buffered replays after a connectivity-loss window (see rule 5). Re-using the same `eventId` for retried emissions of the same incident is the basis on which the server's dedup-by-`eventId` contract (`profiles/security/README.md` §3) operates; assigning a fresh `eventId` per transmission attempt **MUST NOT** occur and would constitute a protocol-level dedup-defeat.
3. The `timestamp` **MUST** reflect the time the incident was detected on the station, not the time the message is sent. On a server-originated record it **MUST** reflect the time the server detected the incident, not the time the station sent whatever the server was processing ([§2.1](#21-two-origins-one-payload-shape)).
4. The `details` object **SHOULD** include all context relevant to the incident. For `MacVerificationFailure`, this **SHOULD** include the `messageId`, `action`, and the expected vs. received MAC values. For `OfflinePassRejected`, this **SHOULD** include the `offlinePassId` and the validation check that failed.
5. SecurityEvent is fire-and-forget -- the server does not send a response. If MQTT delivery is delayed (e.g., station is temporarily disconnected), the station **SHOULD** buffer the event for transmission upon reconnection.
6. The station **MUST NOT** suppress or aggregate Critical events. Warning and Info events **MAY** be batched if the station is generating a high volume (more than 10 per minute), but each individual event **MUST** still be delivered.
7. The server **MUST** store all received SecurityEvents in an append-only audit log that is not modifiable by station operators, and **MUST** store its own server-originated records ([§2.1](#21-two-origins-one-payload-shape)) in that same log. One log, one retention schedule ([§5](#5-severity-levels)), one query surface: an operator investigating an incident **MUST NOT** have to know which side detected it in order to find it.

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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
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
  "protocolVersion": "0.3.0",
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
