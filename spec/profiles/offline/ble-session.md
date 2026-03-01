# BLE Session Lifecycle

> **Status:** Draft

## 1. Starting a Service

After a successful AuthResponse (`result: "Accepted"`), the app writes a StartServiceRequest to characteristic FFF3 to activate a service.

**Request Payload (FFF3 Write):**

| Field | Type | Required | Description |
|---------------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `StartServiceRequest` (constant). |
| `bayId` | string | Yes | Target bay identifier. |
| `serviceId` | string | Yes | Service to activate. |
| `requestedDurationSeconds` | integer | Yes | Requested service duration in seconds (minimum 1). |

The station validates the request and responds via FFF4 with a StartServiceResponse.

**Response Payload (FFF4 Notify):**

| Field | Type | Required | Description |
|--------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `StartServiceResponse` (constant). |
| `result` | string | Yes | `Accepted` or `Rejected`. |
| `sessionId` | string | Cond. | Local session identifier assigned by the station. Present when `result` is `Accepted`. |
| `offlineTxId` | string | Cond. | Offline transaction identifier for reconciliation. Present when `result` is `Accepted`. |
| `errorCode` | integer | Cond. | Numeric error code. Present when `result` is `Rejected`. |
| `errorText` | string | Cond. | Human-readable error description. Present when `result` is `Rejected`. |

**Processing rules:**

1. The station **MUST** verify that the requested `bayId` and `serviceId` are still available. If the bay state changed between authentication and start (e.g., another BLE session claimed the bay), the station **MUST** respond with `Rejected` and error `3001 BAY_BUSY`.
2. The station **MUST** verify that `requestedDurationSeconds` does not exceed the authorized `durationSeconds` from the AuthResponse. If it does, the station **SHOULD** clamp to the authorized maximum rather than rejecting.
3. Before confirming a StartServiceResponse with `result: "Accepted"`, the station SHOULD persist the pending transaction record (`offlineTxId`, `sessionId`, `bayId`, `timestamp`, `creditsAuthorized`) to non-volatile storage. This ensures that if the station loses power mid-session, the transaction can be recovered and reconciled upon reboot. If the station cannot persist the record (e.g., storage failure), it SHOULD reject the StartService request with error `5111 BUFFER_FULL`.
4. On `Accepted`, the station **MUST** activate the physical hardware, start the auto-stop timer, and begin sending FFF5 Service Status notifications.
5. The app **MUST** store the `offlineTxId` for later reconciliation and receipt matching.

**Error scenarios:**

| Condition | Error Code | Description |
|------------------------------|------------|-----------------------------------------------|
| Bay occupied or unavailable | `3001` | Bay state changed after authentication. |
| Hardware failure on start | `5000` | Physical hardware could not activate. Use `5000 HARDWARE_GENERIC` for unspecified hardware failures during BLE sessions. Use `3009 HARDWARE_ACTIVATION_FAILED` only when the specific service activation step fails. |
| Service not available | `3003` | Requested service is currently unavailable. |

**Example (Request):**

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300
}
```

**Example (Response -- Accepted):**

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_a1b2c3d4e5f6",
  "offlineTxId": "otx_d4e5f6a7b8c9"
}
```

## 2. Monitoring Progress (FFF5)

During an active service, the station sends periodic Service Status notifications on characteristic FFF5. The app **MUST** subscribe to FFF5 notifications after receiving a successful StartServiceResponse.

**Notification payload:**

| Field | Type | Required | Description |
|--------------------|---------|----------|-----------------------------------------------|
| `bayId` | string | Yes | Bay identifier. |
| `status` | string | Yes | Current lifecycle status (see below). |
| `sessionId` | string | Yes | Session identifier. |
| `elapsedSeconds` | integer | Yes | Seconds elapsed since service start. |
| `remainingSeconds` | integer | Yes | Estimated seconds remaining. |
| `meterValues` | object | No | Real-time meter readings. |

**Status values:**

| Status | Description |
|----------------|-----------------------------------------------|
| `Starting` | Hardware is initializing (warm-up phase). |
| `Running` | Service is actively running. |
| `Complete` | Service has finished (normal stop or auto-stop). |
| `ReceiptReady` | Receipt is available for reading on FFF6. |
| `Error` | A hardware or software error occurred during the session. |

**Notification interval:** Configurable via `BLEStatusInterval` (default 5 seconds, range 1--30 seconds). The station **MUST** send at least one notification per interval while the service is in `Starting` or `Running` status.

**App disconnection during session:** If the BLE connection drops while the service is running, the station **MUST** continue the service until the auto-stop timer expires. The station **MUST NOT** stop the service prematurely due to app disconnection. When the app reconnects, it **MAY** re-subscribe to FFF5 to resume monitoring.

**Example (Running):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a1b2c3d4e5f6",
  "elapsedSeconds": 120,
  "remainingSeconds": 180,
  "meterValues": {
    "liquidMl": 22100,
    "consumableMl": 250
  }
}
```

**Example (Receipt Ready):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_a1b2c3d4e5f6",
  "elapsedSeconds": 298,
  "remainingSeconds": 0
}
```

## 3. Stopping a Service

The app writes a StopServiceRequest to FFF3 to terminate a running service before the timer expires.

**Request Payload (FFF3 Write):**

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `StopServiceRequest` (constant). |
| `bayId` | string | Yes | Bay identifier. |
| `sessionId` | string | Yes | Session identifier of the active service to stop. |

**Response Payload (FFF4 Notify):**

| Field | Type | Required | Description |
|------------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `StopServiceResponse` (constant). |
| `result` | string | Yes | `Accepted` or `Rejected`. |
| `actualDurationSeconds` | integer | Cond. | Actual duration the service ran. Present when `result` is `Accepted`. |
| `creditsCharged` | integer | Cond. | Total credits charged. Present when `result` is `Accepted`. |

**Processing rules:**

1. The station **MUST** stop the physical hardware immediately upon receiving a valid StopServiceRequest.
2. The station **MUST** calculate `creditsCharged` based on the actual duration and the service's pricing rate.
3. The station **MUST** generate a signed receipt and make it available on FFF6.
4. The station **MUST** send a FFF5 notification with `status: "ReceiptReady"` after the receipt is generated.
5. If the `sessionId` does not match any active session, the station **MUST** respond with `Rejected`.

**Auto-stop:** When `requestedDurationSeconds` expires, the station **MUST** automatically stop the service as if a StopServiceRequest had been received. The station **MUST** generate a receipt and send a `ReceiptReady` notification. The app does not need to send a StopServiceRequest for auto-stopped sessions.

**Example (Request):**

```json
{
  "type": "StopServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "sessionId": "sess_a1b2c3d4e5f6"
}
```

**Example (Response):**

```json
{
  "type": "StopServiceResponse",
  "result": "Accepted",
  "actualDurationSeconds": 298,
  "creditsCharged": 50
}
```

## 4. Retrieving Receipt (FFF6)

After the service ends (manual stop or auto-stop), the app reads characteristic FFF6 to retrieve the signed transaction receipt. The receipt is the authoritative record of the offline transaction and is used for reconciliation when connectivity is restored.

**Receipt payload:** See [BLE Transport -- Receipt (FFF6)](ble-transport.md#8-receipt-fff6) for the full field table.

**Processing rules:**

1. The app **SHOULD** read FFF6 after receiving a `ReceiptReady` notification on FFF5.
2. The app **MUST** store the receipt in local secure storage for later upload to the server.
3. The receipt includes a `txCounter` field for transaction ordering and gap detection during reconciliation. The app **MUST** preserve this field unmodified.
4. The receipt's `signature` is an ECDSA-P256-SHA256 signature computed by the station over the canonical `data` field using the station's private key. The server verifies this signature during reconciliation.
5. If the app is unable to read FFF6 (e.g., BLE disconnect), it **MAY** reconnect and read at a later time. The station **MUST** retain the last receipt on FFF6 until the next session begins or the station reboots.

**Example:**

```json
{
  "offlineTxId": "otx_d4e5f6a7b8c9",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-02-13T10:00:00.000Z",
  "endedAt": "2026-02-13T10:04:58.000Z",
  "durationSeconds": 298,
  "creditsCharged": 50,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  },
  "receipt": {
    "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9kNGU1ZjZnNyIsImJheUlkIjoiYmF5X3gxeTJ6MyIsInNlcnZpY2VJZCI6InN2Y19mb2FtIiwiZHVyYXRpb24iOjI5OCwiY3JlZGl0cyI6NTB9",
    "signature": "MEUCIQC7x2kR9wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIQIgRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5
}
```

## 5. Connection Drop Handling

If the BLE connection drops during an active session, the following rules apply:

1. **Station behaviour:** The station **MUST** continue the active service until the auto-stop timer expires. The station **MUST NOT** abort a running service due to BLE disconnection. Upon service completion (auto-stop), the station **MUST** generate a signed receipt and store it on FFF6.
2. **App behaviour:** The app **SHOULD** attempt to reconnect to the station using the same BLE connection parameters. On reconnect, the app **MAY** re-subscribe to FFF5 notifications. If the service has already completed, the app **SHOULD** read FFF6 to retrieve the receipt.
3. **Receipt availability:** The station **MUST** retain the receipt on FFF6 for at least 10 minutes after service completion, or until the next session begins on the same bay, whichever comes first.
4. **Session state on reconnect:** The app does not need to re-authenticate (HELLO/CHALLENGE/AUTH) if the connection drop was transient (less than `BLEConnectionTimeout`). If the timeout has elapsed, the station **MUST** require a full re-handshake.

## 6. Auto-Stop Timer

The station **MUST** maintain a server-side auto-stop timer for every active BLE session:

1. The timer is initialized to `requestedDurationSeconds` (or the authorized `durationSeconds` from the server, whichever is lower) when the service starts.
2. The timer counts down in real time, independent of the BLE connection state.
3. When the timer reaches zero, the station **MUST** stop the physical hardware, calculate final `creditsCharged`, generate a signed receipt, store it on FFF6, and send a `ReceiptReady` notification on FFF5 (if the app is still connected).
4. The auto-stop timer ensures that services always complete within the authorized duration, even if the app crashes, the BLE connection drops, or the user walks away.
5. The auto-stop timer **MUST NOT** be extended or reset by app requests. The only way to stop a service before the timer expires is via a StopServiceRequest.

## 7. Related Schemas

- Start Service Request: [`start-service-request.schema.json`](../../../schemas/ble/start-service-request.schema.json)
- Start Service Response: [`start-service-response.schema.json`](../../../schemas/ble/start-service-response.schema.json)
- Stop Service Request: [`stop-service-request.schema.json`](../../../schemas/ble/stop-service-request.schema.json)
- Stop Service Response: [`stop-service-response.schema.json`](../../../schemas/ble/stop-service-response.schema.json)
- Service Status: [`service-status.schema.json`](../../../schemas/ble/service-status.schema.json)
- Receipt: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
