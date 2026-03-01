# DataTransfer

> **Status:** Draft

## 1. Overview

The DataTransfer action provides a vendor-extensibility mechanism within the OSPP protocol. It allows stations and servers to exchange arbitrary JSON payloads scoped to a vendor namespace, enabling proprietary features without modifying the standard protocol.

DataTransfer is **bidirectional** — both the station and the server may initiate a DataTransfer REQUEST. The receiving party responds with `Accepted`, `Rejected`, `UnknownVendor`, or `UnknownData`.

## 2. Direction and Type

- **Direction:** Bidirectional (Station → Server or Server → Station)
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vendorId` | string | Yes | Identifies the vendor or extension author (1–64 characters). Vendors SHOULD use their organization name or reverse-domain notation (e.g., `"AcmeCorp"`, `"com.example"`). |
| `dataId` | string | Yes | Identifies the data type or command within the vendor's namespace (1–64 characters). The vendor defines the semantics and expected payload structure. |
| `data` | object | No | Vendor-defined JSON payload. The protocol does not validate the structure of this field. |

## 4. Response Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `"Accepted"`, `"Rejected"`, `"UnknownVendor"`, or `"UnknownData"`. |
| `data` | object | No | Vendor-defined response payload. |

**Status values:**

| Status | Meaning |
|--------|---------|
| `Accepted` | The request was understood and processed successfully. |
| `Rejected` | The request was understood but rejected (vendor-specific reason). |
| `UnknownVendor` | The `vendorId` is not recognized by the receiver. |
| `UnknownData` | The `vendorId` is recognized but the `dataId` is not supported. |

## 5. Processing Rules

1. The receiver MUST respond with `UnknownVendor` if it does not recognize the `vendorId`. The receiver MUST NOT respond with an error code — this is not an error condition.
2. The receiver MUST respond with `UnknownData` if it recognizes the `vendorId` but does not implement the requested `dataId`.
3. Stations and servers MUST NOT rely on DataTransfer for safety-critical or billing-critical operations. DataTransfer is intended for diagnostic, monitoring, and vendor-specific configuration use cases.
4. DataTransfer payloads are NOT covered by HMAC in `Critical` signing mode. In `All` signing mode, they are signed like any other MQTT message.
5. Idempotency is vendor-defined — the protocol does not enforce idempotency for DataTransfer.
6. Implementations SHOULD impose a maximum payload size limit consistent with their MQTT message size configuration.
7. The `data` field **MUST NOT** exceed **64 KB** when JSON-serialized. Receivers **SHOULD** reject payloads exceeding this limit with status `Rejected`.
8. Both station and server **SHOULD** rate-limit DataTransfer messages to a maximum of **10 per minute per `vendorId`**.

## 6. Error Handling

DataTransfer does not define message-specific error codes. Transport-level errors apply:

| Condition | Error Code | Behaviour |
|-----------|------------|-----------|
| Invalid message format | `1005 INVALID_MESSAGE_FORMAT` | Receiver drops the message. |
| Response timeout (30s) | `1010 MESSAGE_TIMEOUT` | Sender logs warning and MAY retry. |
| Server internal error | `6001 SERVER_INTERNAL_ERROR` | Server returns error response. |

## 7. Examples

### 7.1 Station → Server (Diagnostic Query)

**REQUEST payload:**

```json
{
  "vendorId": "AcmeCorp",
  "dataId": "GetDeviceStats",
  "data": {
    "includeTemperature": true
  }
}
```

**RESPONSE:**

```json
{
  "status": "Accepted",
  "data": {
    "cpuTemp": 42,
    "uptime": 86400
  }
}
```

### 7.2 Server → Station (Vendor Command)

**REQUEST payload:**

```json
{
  "vendorId": "AcmeCorp",
  "dataId": "SetLEDColor",
  "data": {
    "bayId": "bay_c1d2e3f4a5b6",
    "color": "#00FF00",
    "brightness": 80
  }
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

### 7.3 Unknown Vendor

**REQUEST payload:**

```json
{
  "vendorId": "UnknownVendorXYZ",
  "dataId": "SomeCommand"
}
```

**RESPONSE:**

```json
{
  "status": "UnknownVendor"
}
```

## 8. Related Schemas

- Request: [`data-transfer-request.schema.json`](../../../schemas/mqtt/data-transfer-request.schema.json)
- Response: [`data-transfer-response.schema.json`](../../../schemas/mqtt/data-transfer-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1005, 1010, 6001)
