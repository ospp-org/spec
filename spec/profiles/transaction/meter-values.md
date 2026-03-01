# MeterValues

> **Status:** Draft

## 1. Overview

MeterValues is a periodic EVENT sent by the station during an active session to report real-time metering data. It enables the server and client app to display session progress and resource consumption. MeterValues is fire-and-forget -- the server does not respond to this event.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT (no response)

## 3. Payload Fields

| Field | Type | Required | Description |
|--------------------|---------|----------|-----------------------------------------------|
| `bayId` | string | Yes | Bay identifier (`bay_` prefix). |
| `sessionId` | string | Yes | Active session identifier (`sess_` prefix). |
| `timestamp` | string | Yes | ISO 8601 UTC timestamp of the reading. |
| `values` | object | Yes | Meter readings (see section 4). |

## 4. Meter Value Types

The `values` object contains resource consumption readings. All values are cumulative since the start of the session.

| Field | Type | Unit | Required | Description |
|---------------|---------|---------------|----------|-----------------------------------------------|
| `liquidMl` | integer | millilitres | No | Cumulative liquid consumption since session start. |
| `consumableMl` | integer | millilitres | No | Cumulative consumable material consumption since session start. |
| `energyWh` | integer | watt-hours | No | Cumulative energy consumption since session start. |

All values **MUST** be non-negative integers (minimum 0). The `values` object **MUST** contain at least one field. Stations that do not support a particular meter type **SHOULD** omit the corresponding field rather than sending zero.

Precision: all values are whole integers. Sub-unit precision (e.g., sub-millilitre) is not supported. Stations **SHOULD** round to the nearest integer.

## 5. Reporting Interval

The meter value reporting interval is controlled by the `MeterValuesInterval` configuration key:

| Parameter | Type | Default | Minimum | Maximum | Description |
|---------------------------------------|---------|---------|---------|---------|-----------------------------------------------|
| `MeterValuesInterval` | integer | 15 | 5 | 300 | Interval in seconds between MeterValues events. |

### 5.1 Interval Rules

1. The station **MUST** send the first MeterValues event within `MeterValuesInterval` of service activation.
2. The station **MUST** continue sending MeterValues at the configured interval until the session ends.
3. The station **SHOULD** send a final MeterValues event immediately before or at service termination (this final reading is also included in the StopService response).
4. If `meterValuesSupported` is `false` in the station's BootNotification capabilities, the station **MUST NOT** send MeterValues events.
5. If the interval elapses but no meter readings have changed since the last event, the station **MAY** skip that interval.
6. The configuration key **MAY** be updated at runtime via ChangeConfiguration. The station **MUST** apply the new interval starting from the next scheduled event.

## 6. Processing Rules

1. The server **MUST** accept MeterValues events without sending a response (fire-and-forget).
2. The server **SHOULD** forward meter data to subscribed clients (mobile app, web dashboard) for real-time display.
3. The server **SHOULD** store cumulative meter values for billing reconciliation and analytics.
4. If a MeterValues event references a `sessionId` that the server does not recognize, the server **SHOULD** log a warning but **MUST NOT** reject or respond.
5. The station **MUST NOT** send MeterValues for a bay that does not have an active session.

## 7. Examples

### 7.1 Mid-Session Meter Reading

```json
{
  "messageId": "msg_e0f1a2b3-c4d5-6789-1234-012345678abc",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T10:12:30.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "sessionId": "sess_f7e8d9c0",
    "timestamp": "2026-02-13T10:12:30.000Z",
    "values": {
      "liquidMl": 22100,
      "consumableMl": 250,
      "energyWh": 75
    }
  }
}
```

### 7.2 Fluid-Only Station (No Consumable Metering)

```json
{
  "messageId": "msg_f1a2b3c4-d5e6-7890-5678-123456789abc",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T10:13:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "sessionId": "sess_f7e8d9c0",
    "timestamp": "2026-02-13T10:13:00.000Z",
    "values": {
      "liquidMl": 30500,
      "energyWh": 95
    }
  }
}
```

## 8. Related Schemas

- Event: [`meter-values-event.schema.json`](../../../schemas/mqtt/meter-values-event.schema.json)
- Meter Values: [`meter-values.schema.json`](../../../schemas/common/meter-values.schema.json)
- Session ID: [`session-id.schema.json`](../../../schemas/common/session-id.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
