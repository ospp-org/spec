# Security Profile

> **Status:** Draft

## 1. Overview

The **Security** profile provides security event reporting for real-time incident visibility. When a station detects a security-relevant incident — such as physical tampering, certificate errors, firmware integrity failures, or repeated authentication failures — it reports a SecurityEvent to the server. This ensures that operators have immediate awareness of potential threats.

The Security profile is mandatory for all stations at **Standard** compliance and above.

## 2. Actions Summary

| Action | Direction | Type | Description |
|-------------------------------------------|-------------------|---------|-----------------------------------------------|
| [SecurityEvent](security-event.md) | Station to Server | EVENT | Report security incidents to the server |

## 3. Compliance Requirements

1. **SecurityEvent is mandatory.** Every station at Standard compliance or above MUST implement SecurityEvent.
2. **SecurityEvent** MUST be sent for all security-relevant incidents as defined in [security-event.md](security-event.md). The station MUST NOT filter, suppress, or delay Critical-severity events. The station MUST buffer events during connectivity loss and transmit them upon reconnection.
3. All security events MUST be delivered with MQTT QoS 1 (at least once) to ensure reliable delivery. The server MUST deduplicate by `eventId`.
