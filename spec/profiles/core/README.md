# Core Profile

> **Status:** Draft

## 1. Overview

The **Core** profile is mandatory for every OSPP-compliant station at any compliance level. It defines the minimum set of actions required for a station to register with the server, maintain a persistent connection, report bay state changes, allow the server to detect disconnections, support vendor extensibility, and respond to on-demand message triggers. Every station MUST implement all six actions in this profile before implementing any optional profiles.

> **Note:** A station implementing only the Core profile achieves **Development** compliance, which is intended for testing and prototyping only. Production deployments MUST achieve **Standard** compliance or higher (Core + Transaction + Security). See the [Compliance Levels](../../../README.md#compliance-levels) section in the main README.

The Core profile establishes the foundation upon which all other profiles (Session, Reservation, Firmware, etc.) depend. Without a successful BootNotification exchange, no other OSPP actions are permitted.

## 2. Actions Summary

| Action | Direction | Type | Description |
|---------------------------------------------|---------------------------|------------------|-----------------------------------------------|
| [BootNotification](boot-notification.md) | Station to Server | REQUEST/RESPONSE | Station registers identity and capabilities; server responds with acceptance, heartbeat interval, and clock sync. |
| [Heartbeat](heartbeat.md) | Station to Server | REQUEST/RESPONSE | Periodic keep-alive with empty payload; server responds with current time for clock synchronization. |
| [StatusNotification](status-notification.md) | Station to Server | EVENT | Bay state change notification with service availability. No response expected. |
| [ConnectionLost](connection-lost.md) | Broker to Server | EVENT | Server detects station disconnect via MQTT LWT or heartbeat timeout. |
| [DataTransfer](data-transfer.md) | Bidirectional | REQUEST/RESPONSE | Vendor-extensible data exchange between station and server. |
| [TriggerMessage](trigger-message.md) | Server to Station | REQUEST/RESPONSE | Server requests station to send a specific message immediately. |

## 3. Compliance Requirements

| Requirement ID | Requirement | Normative Level |
|----------------|---------------------------------------------------------------|-----------------|
| CORE-001 | The station MUST send BootNotification as the first message after every MQTT connection. | MUST |
| CORE-002 | The station MUST NOT send any other messages before receiving a BootNotification `Accepted` response. | MUST NOT |
| CORE-003 | The station MUST send Heartbeat messages every `heartbeatIntervalSec` seconds after BootNotification is accepted. | MUST |
| CORE-004 | The station MUST send a StatusNotification for each bay immediately after BootNotification is accepted. | MUST |
| CORE-005 | The station MUST send a StatusNotification within 1 second of any bay state change. | MUST |
| CORE-006 | The station MUST configure an MQTT Last Will and Testament (LWT) message at connection time. | MUST |
| CORE-007 | The server MUST detect station disconnection via LWT or heartbeat timeout (3.5× `heartbeatIntervalSec`). | MUST |
| CORE-008 | The server MUST mark all bays as `Unknown` when a station disconnects. | MUST |
| CORE-009 | The station MUST buffer StatusNotification events during MQTT disconnection (up to 1000 events or 24 hours (StatusNotification-specific recommendation)) and replay them on reconnection. | MUST |
| CORE-010 | The station MUST synchronize its internal clock from the Heartbeat response `serverTime` when drift exceeds 2 seconds. | MUST |
| CORE-011 | The station MUST retry BootNotification indefinitely if rejected or timed out, using the `retryInterval` from the response (or 30 seconds default). | MUST |
| CORE-012 | The station MUST include `errorCode` and `errorText` in StatusNotification when a bay transitions to `Faulted`. | MUST |

## 4. Message Flow

The typical Core profile message flow after station power-on:

```
Station                          Broker                          Server
  |                                |                               |
  |--- MQTT CONNECT (with LWT) -->|                               |
  |<------ MQTT CONNACK ----------|                               |
  |                                |                               |
  |--- BootNotification REQ ----->|------- forward --------------->|
  |<-- BootNotification RESP -----|<------ Accepted ---------------|
  |                                |                               |
  |--- StatusNotification (bay1)->|------- forward --------------->|
  |--- StatusNotification (bay2)->|------- forward --------------->|
  |                                |                               |
  |  ... heartbeatIntervalSec ...     |                               |
  |                                |                               |
  |--- Heartbeat REQ ------------>|------- forward --------------->|
  |<-- Heartbeat RESP ------------|<------ serverTime ------------|
  |                                |                               |
```

## 5. Related Schemas

- [`boot-notification-request.schema.json`](../../../schemas/mqtt/boot-notification-request.schema.json)
- [`boot-notification-response.schema.json`](../../../schemas/mqtt/boot-notification-response.schema.json)
- [`heartbeat-request.schema.json`](../../../schemas/mqtt/heartbeat-request.schema.json)
- [`heartbeat-response.schema.json`](../../../schemas/mqtt/heartbeat-response.schema.json)
- [`status-notification.schema.json`](../../../schemas/mqtt/status-notification.schema.json)
- [`connection-lost.schema.json`](../../../schemas/mqtt/connection-lost.schema.json)
- [`data-transfer-request.schema.json`](../../../schemas/mqtt/data-transfer-request.schema.json)
- [`data-transfer-response.schema.json`](../../../schemas/mqtt/data-transfer-response.schema.json)
- [`trigger-message-request.schema.json`](../../../schemas/mqtt/trigger-message-request.schema.json)
- [`trigger-message-response.schema.json`](../../../schemas/mqtt/trigger-message-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md)
