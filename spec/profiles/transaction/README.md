# Transaction Profile

> **Status:** Draft

## 1. Overview

The **Transaction** profile covers the full session lifecycle -- from reservation through service start, metering, and stop, to final transaction reporting. This profile is mandatory for all stations at **Standard** compliance and above. Every production-deployed station MUST implement all six actions defined in this profile.

This profile provides the core mechanisms for:

- **Bay reservation** -- holding a bay for an upcoming session (web payment flow).
- **Service activation and deactivation** -- starting and stopping services on a bay.
- **Real-time metering** -- periodic resource consumption reporting during active sessions.
- **Offline transaction reconciliation** -- reporting completed offline transactions for server-side accounting.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Actions Summary

| Action | Direction | Type | Description |
|----------------------------------------------|-------------------|-----------------|-----------------------------------------------|
| [ReserveBay](reserve-bay.md) | Server to Station | REQUEST/RESPONSE | Reserve a bay for an upcoming session. |
| [CancelReservation](cancel-reservation.md) | Server to Station | REQUEST/RESPONSE | Cancel an active reservation. |
| [StartService](start-service.md) | Server to Station | REQUEST/RESPONSE | Activate a service on a bay. |
| [StopService](stop-service.md) | Server to Station | REQUEST/RESPONSE | Stop an active service on a bay. |
| [MeterValues](meter-values.md) | Station to Server | EVENT | Periodic metering data during a session. |
| [TransactionEvent](transaction-event.md) | Station to Server | REQUEST/RESPONSE | Report offline transactions for reconciliation. |

## 3. Session Lifecycle Diagram

```
                          ReserveBay
                              |
                              v
    +----------+        +-----------+        +-----------+
    | Available | -----> | Reserved  | -----> | Available |
    +----------+  reserve +-----+-----+ expire/  +----------+
         |                      |       cancel
         |                      | StartService
         |                      |  (with reservationId)
         |                      v
         |    StartService +----------+   MeterValues (periodic)
         +---------------> | Occupied | ----------------------->
                           +----+-----+
                                |
                           StopService
                                |
                                v
                         +-----------+
                         | Finishing |
                         +-----+-----+
                               |
                               v
                         +----------+     TransactionEvent
                         | Available | -- (offline tx sync) -->
                         +----------+
```

**Sequence:**

1. **ReserveBay** (optional) -- Server reserves bay; bay transitions to `Reserved`.
2. **StartService** -- Server activates service; bay transitions to `Occupied`. If a reservation exists, it is consumed.
3. **MeterValues** (periodic) -- Station sends resource consumption readings every `MeterValuesInterval` seconds.
4. **StopService** -- Server stops service; bay transitions through `Finishing` to `Available`.
5. **TransactionEvent** (offline only) -- Station reports offline transactions after reconnection.

## 4. Compliance Requirements

### 4.1 Mandatory Implementation

All six actions in this profile are REQUIRED for OSPP compliance at Standard level and above (Standard, Extended, Complete). A station MUST:

1. Accept and correctly process **ReserveBay**, **CancelReservation**, **StartService**, and **StopService** REQUEST messages from the server.
2. Send **MeterValues** EVENT messages at the configured interval during active sessions (if `meterValuesSupported` is `true`).
3. Send **TransactionEvent** REQUEST messages for all pending offline transactions after reconnection.

### 4.2 Timing Constraints

| Constraint | Value | Description |
|------------------------------------|---------|-----------------------------------------------|
| StartService response timeout | 10s | Server MUST receive a response within 10 seconds. |
| StopService response timeout | 10s | Server MUST receive a response within 10 seconds. |
| ReserveBay response timeout | 5s | Server MUST receive a response within 5 seconds. |
| CancelReservation response timeout | 5s | Server MUST receive a response within 5 seconds. |
| MeterValues interval | 5--300s | Configurable via `MeterValuesInterval` (default 15s). |
| Reservation default TTL | 180s | Default reservation expiry if not overridden by `expirationTime`. |
| Max session duration | 600s | Default `MaxSessionDurationSeconds` (configurable per station). |

### 4.3 Idempotency

- **StartService**: duplicate requests with the same `sessionId` MUST return the same `Accepted` response without restarting hardware.
- **StopService**: duplicate requests for an already-stopped session MUST return the previous `Accepted` response with the final `actualDurationSeconds` and `creditsCharged`.
- **ReserveBay**: duplicate requests for an already-reserved bay MUST return `3014 BAY_RESERVED`.
- **CancelReservation**: cancelling an already-cancelled reservation MUST return `Accepted` (idempotent success). An expired reservation MUST return `3013 RESERVATION_EXPIRED`.
- **TransactionEvent**: the server MUST deduplicate by `offlineTxId` and respond with `Duplicate`.

### 4.4 Error Handling

All REQUEST/RESPONSE actions in this profile use the standard OSPP error format defined in [Chapter 07 — Error Codes & Resilience](../../07-errors.md). Error codes in the 3xxx range (Session & Bay Errors) are the primary codes for this profile. Payment-related errors (4xxx) MAY also apply when the server rejects a session due to insufficient balance.

The station MUST respond with `Rejected` and the appropriate error code rather than silently dropping invalid requests. The server MUST handle `Rejected` responses by logging the error, notifying the user, and initiating refund procedures where applicable (e.g., `3009 HARDWARE_ACTIVATION_FAILED`).
