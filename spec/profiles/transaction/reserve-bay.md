# ReserveBay

> **Status:** Draft

## 1. Overview

ReserveBay is a server-initiated REQUEST that reserves a specific bay for an upcoming session. Reservations are typically used in web payment flows where there is a delay between payment confirmation and service activation. The reservation holds the bay in `Reserved` state, preventing other users from starting sessions on it.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|------------------|---------|----------|-----------------------------------------------|
| `bayId` | string | Yes | Target bay identifier (`bay_` prefix). |
| `reservationId` | string | Yes | Unique reservation identifier (`rsv_` prefix). |
| `expirationTime` | string | Yes | ISO 8601 UTC timestamp after which the reservation expires automatically. |
| `sessionSource` | string | Yes | Origin of the session: `MobileApp` or `WebPayment`. |

## 4. Response Payload

| Field | Type | Description |
|--------------|---------|-----------------------------------------------|
| `status` | string | `Accepted` or `Rejected`. |
| `errorCode` | integer | OSPP error code (on rejection only). |
| `errorText` | string | Machine-readable error name (on rejection only). |

## 5. Reservation Lifecycle

A reservation progresses through the following states:

```
Created --> Active --> Consumed (by StartService)
                  \--> Expired  (by timer)
                  \--> Cancelled (by CancelReservation)
```

### 5.1 Lifecycle Rules

1. When the station accepts a ReserveBay request, it **MUST** transition the bay from `Available` to `Reserved` state and start an expiry timer based on `expirationTime`.
2. The station **MUST** associate the `reservationId` with the bay so that subsequent StartService or CancelReservation requests can reference it.
3. When a StartService request arrives with a matching `reservationId`, the station **MUST** consume the reservation and transition the bay from `Reserved` to `Occupied`. The expiry timer **MUST** be cancelled.
4. If the `expirationTime` elapses before the reservation is consumed or cancelled, the station **MUST** automatically release the reservation and transition the bay back to `Available`. The station **SHOULD** report this via a StatusNotification event.
5. When a CancelReservation request arrives with a matching `reservationId`, the station **MUST** release the reservation and transition the bay back to `Available`.
6. Only one reservation **MAY** be active per bay at any time. A bay in `Reserved` state **MUST** reject new reservation requests with `3014 BAY_RESERVED`.

## 6. Processing Rules

1. The station **MUST** validate that the `bayId` exists; if not, it **MUST** respond with `3005 BAY_NOT_FOUND`.
2. The station **MUST** validate that the bay is in `Available` state. If the bay is `Occupied` or `Finishing`, it **MUST** respond with `3001 BAY_BUSY`. If the bay is already `Reserved`, it **MUST** respond with `3014 BAY_RESERVED`.
3. If the bay is in `Faulted` or transitioning state, the station **MUST** respond with `3002 BAY_NOT_READY`.
4. If the bay is in `Unavailable` state due to maintenance, the station **MUST** respond with `3011 BAY_MAINTENANCE`.
5. On acceptance, the station **MUST** respond with `status: "Accepted"` and transition the bay to `Reserved`.

## 7. Error Codes

| Code | errorText | Severity | Description |
|:----:|----------------------|:--------:|-----------------------------------------------|
| 3001 | `BAY_BUSY` | Warning | Bay is currently occupied by an active session. |
| 3002 | `BAY_NOT_READY` | Warning | Bay is in `Faulted` or transitioning state. |
| 3005 | `BAY_NOT_FOUND` | Error | `bayId` does not match any bay on this station. |
| 3011 | `BAY_MAINTENANCE` | Warning | Bay is in maintenance mode. |
| 3014 | `BAY_RESERVED` | Warning | Bay already has an active reservation. |

## 8. Examples

### 8.1 Request

```json
{
  "messageId": "msg_d3e4f5a6-b7c8-9012-abcd-345678901bcd",
  "messageType": "Request",
  "action": "ReserveBay",
  "timestamp": "2026-02-13T10:07:30.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "reservationId": "rsv_e5f6a7b8",
    "expirationTime": "2026-02-13T10:10:30.000Z",
    "sessionSource": "WebPayment"
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_d3e4f5a6-b7c8-9012-abcd-345678901bcd",
  "messageType": "Response",
  "action": "ReserveBay",
  "timestamp": "2026-02-13T10:07:30.180Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 8.3 Response (Rejected)

```json
{
  "messageId": "msg_d3e4f5a6-b7c8-9012-abcd-345678901bcd",
  "messageType": "Response",
  "action": "ReserveBay",
  "timestamp": "2026-02-13T10:07:30.180Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3001,
    "errorText": "BAY_BUSY"
  }
}
```

## 9. Related Schemas

- Request: [`reserve-bay-request.schema.json`](../../../schemas/mqtt/reserve-bay-request.schema.json)
- Response: [`reserve-bay-response.schema.json`](../../../schemas/mqtt/reserve-bay-response.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Reservation ID: [`reservation-id.schema.json`](../../../schemas/common/reservation-id.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3001, 3002, 3005, 3011, 3014)
