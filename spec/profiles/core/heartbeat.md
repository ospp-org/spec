# Heartbeat

> **Status:** Draft

## 1. Overview

The Heartbeat action is a periodic keep-alive message sent by the station to the server at the interval specified in the BootNotification response (`heartbeatIntervalSec`). It serves two purposes: connection liveness detection and clock synchronization.

The request payload is empty -- the station identity is derived from the MQTT topic and mTLS certificate. The server responds with the current UTC timestamp so the station can correct clock drift.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

The Heartbeat request has an **empty payload** (`{}`). The station identity is determined from the MQTT topic (e.g., `ospp/v1/stations/{station_id}/to-server`) and the mTLS client certificate.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| *(none)* | | | Payload **MUST** be an empty object. |

## 4. Response Payload

| Field | Type | Required | Description |
|--------------|--------|----------|--------------------------------------|
| `serverTime` | string | Yes | ISO 8601 UTC timestamp with millisecond precision. |

## 5. Interval Configuration

1. The `heartbeatIntervalSec` is initially set in the BootNotification response (range: 10--3600 seconds).
2. The server **MAY** update the interval at runtime via ChangeConfiguration with the key `HeartbeatIntervalSeconds`.
3. When the interval changes, the station **MUST** apply the new value starting from the next heartbeat cycle. The station **MUST NOT** reset an in-progress timer; the new interval takes effect after the current cycle completes.
4. If the configured interval falls outside the 10--3600 second range, the station **MUST** clamp it to the nearest boundary (10 or 3600) and log a `5102 CONFIGURATION_ERROR`. Values above 300 seconds are permitted but SHOULD only be used in low-bandwidth environments. The server SHOULD clamp values to operational needs.
5. The station **MUST** send heartbeats regardless of other message traffic. Heartbeats **MUST NOT** be suppressed even if the station recently sent other messages.

## 6. Clock Synchronization

1. On receiving a Heartbeat response, the station **MUST** compare `serverTime` with its local clock.
2. If the absolute drift exceeds **2 seconds**, the station **SHOULD** adjust its internal clock to match `serverTime`.
3. If the absolute drift exceeds **5 minutes**, the station **MUST** log a `5106 CLOCK_ERROR` warning. This **MAY** indicate an RTC battery failure or prolonged network partition.
4. The station **MUST** use the synchronized clock for all subsequent timestamps in StatusNotification, MeterValues, and TransactionEvent messages.
5. Clock adjustments **MUST NOT** affect the duration of active sessions. Session elapsed time **MUST** be tracked using a monotonic timer, not the wall clock.

## 7. Processing Rules

1. The station **MUST** send a Heartbeat every `heartbeatIntervalSec` seconds after receiving BootNotification `Accepted`.
2. The station **MUST NOT** send Heartbeat messages before BootNotification has been accepted.
3. If the server does not respond within 30 seconds, the station **MUST** log `1010 MESSAGE_TIMEOUT` and continue sending heartbeats at the configured interval.
4. The server **MUST** track the last heartbeat timestamp per station. If no message is received for `3.5 × heartbeatIntervalSec` seconds, the server **MUST** treat the station as disconnected (see [ConnectionLost](connection-lost.md)).
5. During MQTT reconnection backoff, the station **MUST NOT** send heartbeats. Heartbeats resume only after a successful BootNotification `Accepted` exchange on the new connection.

## 8. Error Handling

| Condition | Error Code | Behaviour |
|---------------------------------|---------------------|-----------------------------------------------|
| Invalid message format | `1005 INVALID_MESSAGE_FORMAT` | Server drops the message. Station retries on next interval. |
| Server internal error | `6001 SERVER_INTERNAL_ERROR` | Server **MAY** omit the response. Station continues heartbeat cycle. |
| No response within 30 seconds | `1010 MESSAGE_TIMEOUT` | Station logs warning and continues sending heartbeats. |
| Clock drift > 5 minutes | `5106 CLOCK_ERROR` | Station logs warning and adjusts clock from response. |

## 9. Examples

### 9.1 Request

```json
{
  "messageId": "hb_c8d9e0f1-a2b3-4567-ijkl-890123456ghi",
  "messageType": "Request",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:16:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {}
}
```

### 9.2 Response

```json
{
  "messageId": "hb_c8d9e0f1-a2b3-4567-ijkl-890123456ghi",
  "messageType": "Response",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:16:00.150Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "serverTime": "2026-02-13T10:16:00.150Z"
  }
}
```

## 10. Related Schemas

- Request: [`heartbeat-request.schema.json`](../../../schemas/mqtt/heartbeat-request.schema.json)
- Response: [`heartbeat-response.schema.json`](../../../schemas/mqtt/heartbeat-response.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1005, 1010, 5106, 6001)
