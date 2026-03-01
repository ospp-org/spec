# StatusNotification

> **Status:** Draft

## 1. Overview

StatusNotification is sent by the station whenever a bay's operational state changes. It enables the server to maintain an accurate, real-time view of all bays across the fleet. This is a fire-and-forget EVENT -- the server does not send a response.

Each notification reports the bay identifier, the new status, the previous status, the availability of services on the bay, and optionally error details when the bay enters the `Faulted` state.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------------|-----------------|----------|-----------------------------------------------|
| `bayId` | string | Yes | Bay identifier within the station (`bay_` prefix). |
| `bayNumber` | integer | Yes | Ordinal bay number (minimum 1). |
| `status` | string | Yes | New bay status (see Bay States below). |
| `previousStatus` | string | No | Previous bay status before this transition. |
| `services` | array\<object\> | Yes | Service availability list (minimum 1 item). |
| `errorCode` | integer | No | OSPP numeric error code (when `status` is `Faulted`). |
| `errorText` | string | No | Machine-readable error name in `UPPER_SNAKE_CASE`. |

### 3.1 Service Object

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `serviceId` | string | Yes | Service identifier (`svc_` prefix). |
| `available` | boolean | Yes | Whether this service is currently available on the bay. |

## 4. Bay States

| State | Description |
|-----------------|---------------------------------------------------------------|
| `Available` | Bay is idle and ready to accept a new session. |
| `Reserved` | Bay is reserved for an upcoming session. |
| `Occupied` | Bay has an active service session. |
| `Finishing` | Service has ended; bay is in cool-down or wrap-up. |
| `Faulted` | Bay has a hardware or software fault. |
| `Unavailable` | Bay is in maintenance mode or otherwise out of service. |
| `Unknown` | Bay state is indeterminate (e.g., after connection loss). |

## 5. Transition Rules

The following state transitions are valid. Any transition not listed below is invalid and **MUST** be rejected by the server with a log entry.

```
Available  --> Reserved      (reservation accepted)
Available  --> Occupied      (session started without reservation)
Available  --> Faulted       (hardware fault detected)
Available  --> Unavailable   (maintenance mode enabled)
Reserved   --> Available     (reservation cancelled or expired)
Reserved   --> Occupied      (session started by reservation holder)
Reserved   --> Faulted       (hardware fault detected)
Occupied   --> Finishing     (session timer expired or stop requested)
Occupied   --> Faulted       (hardware fault during active session)
Finishing  --> Available     (cool-down complete)
Finishing  --> Faulted       (hardware fault during cool-down)
Faulted    --> Available     (fault cleared, bay operational)
Faulted    --> Unavailable   (maintenance mode enabled for repair)
Unavailable --> Available    (maintenance mode cleared)
Unavailable --> Faulted      (fault detected during maintenance)
Unknown    --> Available     (state recovered after reconnection)
Unknown    --> Faulted       (fault detected after reconnection)
Unknown    --> Unavailable   (maintenance mode detected after reconnection)
```

1. The server **MUST** validate incoming transitions against this table. Invalid transitions **MUST** be logged but **SHOULD NOT** cause the server to drop the message -- the server **SHOULD** accept the reported state as authoritative and log a warning.
2. The station **MUST** include `previousStatus` whenever the state changes. The field **MAY** be omitted only on the initial status report after BootNotification.
3. When a bay transitions to `Faulted`, the station **MUST** include `errorCode` and `errorText` from the 5xxx error range.

## 6. Error Reporting (Faulted State)

1. When a bay enters the `Faulted` state, the station **MUST** populate `errorCode` with a numeric code from the 5xxx range (Station Hardware & Software Errors) and `errorText` with the corresponding `UPPER_SNAKE_CASE` identifier.
2. The server **MUST** log the fault, update the bay state in its registry, and notify operators via the fleet dashboard.
3. If the error severity is `Critical` (e.g., `5001 PUMP_SYSTEM`, `5009 EMERGENCY_STOP`), the server **MUST** generate an operator alert immediately.
4. A `Faulted` bay **MUST NOT** accept new sessions or reservations until it transitions back to `Available` or `Unavailable`.
5. Vendor-specific error details **MAY** be included using error codes in the 9000--9999 range. Receivers that do not recognize a vendor code **MUST** treat it as `5000 HARDWARE_GENERIC`.

## 7. Processing Rules

1. The station **MUST** send a StatusNotification for every bay immediately after BootNotification `Accepted` to establish the initial fleet state.
2. The station **MUST** send a StatusNotification within 1 second of any bay state change.
3. StatusNotification is an EVENT -- no response is expected. The station **MUST NOT** wait for an acknowledgement before continuing.
4. If MQTT is disconnected, the station **MUST** buffer StatusNotification events locally (up to 1000 events or 24 hours (StatusNotification-specific recommendation)) and replay them in chronological order upon reconnection.
5. The server **MUST** update the bay state record atomically. If multiple StatusNotifications arrive out of order, the server **MUST** use the `timestamp` in the message envelope to resolve conflicts (latest timestamp wins).

## 8. Examples

### 8.1 Bay Transition (Available to Occupied)

```json
{
  "messageId": "msg_d9e0f1a2-b3c4-5678-abcd-901234567abc",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:10:01.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "bayNumber": 1,
    "previousStatus": "Available",
    "status": "Occupied",
    "services": [
      {
        "serviceId": "svc_eco",
        "available": false
      },
      {
        "serviceId": "svc_standard",
        "available": true
      }
    ]
  }
}
```

### 8.2 Bay Transition (Available to Faulted)

```json
{
  "messageId": "msg_e2f3a4b5-c6d7-8901-1234-234567890abc",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:12:30.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "bayNumber": 1,
    "previousStatus": "Available",
    "status": "Faulted",
    "services": [
      {
        "serviceId": "svc_eco",
        "available": false
      },
      {
        "serviceId": "svc_standard",
        "available": false
      }
    ],
    "errorCode": 5001,
    "errorText": "PUMP_SYSTEM"
  }
}
```

## 9. Related Schemas

- Payload: [`status-notification.schema.json`](../../../schemas/mqtt/status-notification.schema.json)
- Bay Status enum: [`bay-status.schema.json`](../../../schemas/common/bay-status.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Service ID: [`service-id.schema.json`](../../../schemas/common/service-id.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5000--5009, 5100--5107)
