# CancelReservation

> **Status:** Draft

## 1. Overview

CancelReservation is a server-initiated REQUEST that cancels an active reservation on a bay, returning it to the `Available` state. It is used when a user cancels a pending session, when a payment fails after reservation, or when the server determines the reservation is no longer needed.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-----------------|--------|----------|--------------------------------------|
| `bayId` | string | Yes | Target bay identifier (`bay_` prefix). |
| `reservationId` | string | Yes | Reservation to cancel (`rsv_` prefix). |

## 4. Response Payload

| Field | Type | Description |
|--------------|---------|-----------------------------------------------|
| `status` | string | `Accepted` or `Rejected`. |
| `errorCode` | integer | OSPP error code (on rejection only). |
| `errorText` | string | Machine-readable error name (on rejection only). |

## 5. Processing Rules

1. The station **MUST** validate that the `bayId` exists; if not, it **MUST** respond with `3005 BAY_NOT_FOUND`.
2. The station **MUST** validate that a reservation with the given `reservationId` exists on the specified bay. If the reservation was previously cancelled, the station **MUST** return `Accepted` (idempotent success). If no reservation with that ID has ever existed, the station **MUST** respond with `3012 RESERVATION_NOT_FOUND`.
3. If the reservation has already expired (auto-released by timer), the station **MUST** respond with `3013 RESERVATION_EXPIRED`.
4. On acceptance, the station **MUST** cancel the reservation, stop the expiry timer, transition the bay from `Reserved` to `Available`, and respond with `status: "Accepted"`.
5. The station **SHOULD** send a StatusNotification event after the bay transitions back to `Available`.
6. If the reservation was already consumed by a StartService (bay is now `Occupied`), the station **MUST** respond with `3012 RESERVATION_NOT_FOUND` because the reservation no longer exists as an active reservation.

## 6. Error Codes

| Code | errorText | Severity | Description |
|:----:|---------------------------|:--------:|-----------------------------------------------|
| 3005 | `BAY_NOT_FOUND` | Error | `bayId` does not match any bay on this station. |
| 3012 | `RESERVATION_NOT_FOUND` | Error | No active reservation with this ID exists on the bay. |
| 3013 | `RESERVATION_EXPIRED` | Warning | The reservation has already expired and the bay was auto-released. |

## 7. Examples

### 7.1 Request

```json
{
  "messageId": "msg_e4f5a6b7-c8d9-0123-abcd-456789012cde",
  "messageType": "Request",
  "action": "CancelReservation",
  "timestamp": "2026-02-13T10:09:15.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "reservationId": "rsv_e5f6a7b8"
  }
}
```

### 7.2 Response (Accepted)

```json
{
  "messageId": "msg_e4f5a6b7-c8d9-0123-abcd-456789012cde",
  "messageType": "Response",
  "action": "CancelReservation",
  "timestamp": "2026-02-13T10:09:15.120Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 7.3 Response (Rejected)

```json
{
  "messageId": "msg_e4f5a6b7-c8d9-0123-abcd-456789012cde",
  "messageType": "Response",
  "action": "CancelReservation",
  "timestamp": "2026-02-13T10:09:15.120Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3012,
    "errorText": "RESERVATION_NOT_FOUND"
  }
}
```

## 8. Related Schemas

- Request: [`cancel-reservation-request.schema.json`](../../../schemas/mqtt/cancel-reservation-request.schema.json)
- Response: [`cancel-reservation-response.schema.json`](../../../schemas/mqtt/cancel-reservation-response.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Reservation ID: [`reservation-id.schema.json`](../../../schemas/common/reservation-id.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3005, 3012, 3013)
