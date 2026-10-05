# BLE Session Lifecycle

> **Status: EXPERIMENTAL** | **OSPP Version:** 0.44.0
>
> Published for review, **not** for implementation. May change incompatibly without a MAJOR
> bump. See [Release status](../../../README.md#ble-is-experimental).

## 1. Starting a Service

> **AEAD channel (Normative).** Every message in this lifecycle — `StartServiceRequest`/`StartServiceResponse`, `StopServiceRequest`/`StopServiceResponse`, the FFF5 ServiceStatus notifications, and the FFF6 `ReceiptRequest`/`ReceiptResponse` — travels **inside the post-Challenge AEAD channel** ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel)), encrypted and authenticated under the per-direction session keys. A station **MUST** reject any session command that does not decrypt and authenticate under the channel established by *this* connection's handshake. This is what makes `bayId`/`serviceId` selection and `StopServiceRequest` tamper-proof and un-forgeable by a co-located central (finding N4), and what removes the need for `sessionProof` to bind bay/service at authentication time (N1).
>
> **Message-ordering (Normative).** A station **MUST** reject a `StartServiceRequest` — or any other session command — that arrives **before** it has sent an `Accepted` AuthResponse on this connection: until authentication completes there is no authorized session to act on. (This is enforced by the connection state machine; it is additionally gated by the AEAD channel, since a pre-Accepted peer cannot in any case produce a valid frame, but the state check **MUST** be explicit so an out-of-order command is rejected rather than acted upon.)

After a successful AuthResponse (`result: "Accepted"`), the app writes a StartServiceRequest to characteristic FFF3 to activate a service.

**Request Payload (FFF3 Write):**

| Field | Type | Required | Description |
|---------------------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `StartServiceRequest` (constant). |
| `bayId` | string | Yes | The bay of the session's authorization. |
| `serviceId` | string | Yes | The service of the session's authorization. |
| `requestedDurationSeconds` | integer | Yes | Requested service duration in seconds (minimum 1). |

The request carries no program: the station resolves the program to run from the bindings of the service catalog it holds — the program of that bay the catalog binds the service to ([ble-transport.md §4](ble-transport.md#4-available-services-fff2)).

The station validates the request and responds via FFF4 with a StartServiceResponse.

**Response Payload (FFF4 Notify):**

| Field | Type | Required | Description |
|--------------|---------|----------|-----------------------------------------------|
| `type` | string | Yes | `StartServiceResponse` (constant). |
| `result` | string | Yes | `Accepted` or `Rejected`. |
| `sessionId` | string | Cond. | The session's one identifier, which the app names in its StopServiceRequest. For a pass the station validated itself (**Full Offline**) the station mints it. For **Partial A (ServerSignedAuth)** the station **MUST** use the **server-issued** `sessionId` from the validated claims — it is the settle-once correlation key signed into the receipt (`06-security.md` §6.2 / `reconciliation.md` §6.7, finding F2). For **Partial B** the station **MUST** use the `sessionId` of the AuthorizeOfflinePass answer, under which it also reports the session's MeterValues and SessionEnded ([authorize-offline-pass.md §6](authorize-offline-pass.md#6-processing-rules) rule 4). Present when `result` is `Accepted`. |
| `offlineTxId` | string | Cond. | Offline transaction identifier for reconciliation. Present when `result` is `Accepted`. |
| `errorCode` | integer | Cond. | The registry code of the refusal ([Chapter 07 §4.3](../../07-errors.md#43-ble-message-types)). Present when `result` is `Rejected`. |
| `errorText` | string | Cond. | The registry name of `errorCode`, in `UPPER_SNAKE_CASE`. Present when `result` is `Rejected`. |
| `details` | object | No | Per-occurrence context of the refusal ([Chapter 07 §2.3](../../07-errors.md#23-ble-error-response)). |

**Processing rules:**

1. The station **MUST** verify that the requested `bayId` and `serviceId` are still available. If the bay state changed between authentication and start (e.g., another BLE session claimed the bay), the station **MUST** respond with `Rejected` and error `3001 BAY_BUSY`.
1a. **The request names the authorization's bay and service (Normative).** The station **MUST** start only the bay and the service the session was authorized for — those of the OfflineAuthRequest, which the pass was validated or forwarded for ([ble-handshake.md §4.1](ble-handshake.md#41-offlineauthrequest-full-offline--partial-b)), or the signed `bayId` and `serviceId` claims of the ServerSignedAuth. A request naming another bay or another service is refused with `3007 SESSION_MISMATCH`, and starts nothing. A service the catalog the station holds does not bind to a program of the bay is refused with `3004 INVALID_SERVICE`.
2. The station **MUST** verify that `requestedDurationSeconds` does not exceed the authorized `durationSeconds` (finding N3). For a Partial-A (ServerSignedAuth) session this is the **signed** `durationSeconds` claim (`server-signed-auth-claims.schema.json`) the station verified during the handshake; for a Partial-B session it is the `durationSeconds` from the AuthorizeOfflinePass response; for a pass the station validated itself, the `requestedDurationSeconds` of the OfflineAuthRequest, from which it estimated the cost. The AuthResponse MAY relay an unsigned advisory copy for the app, but the check **MUST** be made against the signed or server value, never the advisory one. **A request above the authorized duration is refused, never reduced (Normative):** the station **MUST** respond `Rejected` with `3010 MAX_DURATION_EXCEEDED`, start no service, and **MUST NOT** shorten the request to the authorized value — a request above a pass's limit is refused the same way ([`offline-pass.md` §2.1](offline-pass.md#21-offlineallowance-object)). The app holds the authorized duration: the one it requested in its OfflineAuthRequest, which an authorization grants exactly or refuses, or the signed claim of its ServerSignedAuth. **A Partial-B start asks for the authorized duration (Normative):** whichever record ends a Partial-B session, the server settles it on the authorized duration ([authorize-offline-pass.md §6](authorize-offline-pass.md#6-processing-rules) rule 4b), so a shorter start would be charged as the whole; the station **MUST** refuse a Partial-B request below the authorized `durationSeconds` with `3008 DURATION_INVALID`, and start no service.
3. Before confirming a StartServiceResponse with `result: "Accepted"`, the station **MUST** persist the pending transaction record (`offlineTxId`, `sessionId`, `bayId`, `timestamp`, `creditsAuthorized`) to non-volatile storage. This ensures that if the station loses power mid-session, the transaction can be recovered and reconciled upon reboot. If the station cannot persist the record (e.g., storage failure), it **MUST** reject the StartService request with error `5103 STORAGE_ERROR` — the code whose registry entry is *"Non-volatile storage (NVS) read or write failure"* ([`07-errors.md` §3](../../07-errors.md)). Earlier revisions named `5111 BUFFER_FULL` here; `5111` means the TransactionEvent buffer is at or above 90% of `MaxOfflineTransactions` ([`01-architecture.md` §6.5](../../01-architecture.md#65-offline-message-buffering)), which is a capacity condition on a working store, not a store that failed to write. The two are distinguishable by the station and lead an operator to different repairs, so they are no longer reported under one code. `5103` was added to StartService's code set in [§4.2](../../07-errors.md#42-server--station-mqtt-actions) for this rule.
4. On `Accepted`, the station **MUST** activate the physical hardware, start the auto-stop timer, and begin sending FFF5 Service Status notifications.
5. The app **MUST** store the `sessionId` and the `offlineTxId`, for its ReceiptRequest (§4), later reconciliation and receipt matching.

**Error scenarios:** the codes a StartServiceResponse carries are listed once, in [Chapter 07 §4.3](../../07-errors.md#43-ble-message-types). Use `5000 HARDWARE_GENERIC` for unspecified hardware failures during BLE sessions, and `3009 HARDWARE_ACTIVATION_FAILED` only when the specific service activation step fails.

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

During an active service, the station sends periodic Service Status notifications on characteristic FFF5. The app **MUST** subscribe to FFF5 notifications before it writes the StartServiceRequest ([ble-transport.md §7](ble-transport.md#7-service-status-fff5)).

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
| `ReceiptReady` | The session's receipt is signed, and the app can ask for it on FFF6 (§4). |
| `Error` | A hardware or software error occurred during the session. |

**Notification interval:** 5 seconds. The station **MUST** send at least one notification per interval while the service is in `Starting` or `Running` status.

**App disconnection during session:** If the BLE connection drops while the service is running, the station **MUST** continue the service until the auto-stop timer expires. The station **MUST NOT** stop the service prematurely due to app disconnection. A reconnected app cannot resume monitoring: FFF5 notifications go only to the connection that started the session, and the app asks for the receipt once the service has ended (§4, §5).

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

The app writes a StopServiceRequest to FFF3 to terminate a running service before the timer expires. This is the customer's stop over BLE: the station ends the session and reports it as `Local` — in the SessionEnded of a Partial-B session, and in the signed receipt's `endReason` — and the server settles it as the customer's stop, by service kind ([04-flows.md §6](../../04-flows.md#settlement-by-service-kind)).

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
| `creditsCharged` | integer | Cond. | Credits the station computed for the session; advisory — the server settles its own recomputation ([`reconciliation.md` §8](reconciliation.md#8-wallet-reconciliation)). Present when `result` is `Accepted`. |
| `errorCode` | integer | Cond. | `3006 SESSION_NOT_FOUND` or `3007 SESSION_MISMATCH` (rule 5). Present when `result` is `Rejected`. |
| `errorText` | string | Cond. | The registry name of `errorCode`, in `UPPER_SNAKE_CASE`. Present when `result` is `Rejected`. |
| `details` | object | No | Per-occurrence context of the refusal ([Chapter 07 §2.3](../../07-errors.md#23-ble-error-response)). |

**Processing rules:**

1. The station **MUST** stop the physical hardware immediately upon receiving a valid StopServiceRequest.
2. The station **MUST** calculate `creditsCharged` based on the actual duration and the service's pricing rate. The figure is advisory: the server settles by service kind, never above what the authorization allowed ([`reconciliation.md` §8](reconciliation.md#8-wallet-reconciliation)).
3. The station **MUST** generate a signed receipt and serve it on FFF6 (§4).
4. The station **MUST** send a FFF5 notification with `status: "ReceiptReady"` after the receipt is generated.
5. If the `sessionId` matches no active session this connection established, the station **MUST** respond `Rejected` with `3006 SESSION_NOT_FOUND`; if it names an active session that is not on the request's `bayId`, with `3007 SESSION_MISMATCH`. A refused stop stops nothing.

**Auto-stop:** When `requestedDurationSeconds` expires, the station **MUST** stop the service itself and end the session with `TimerExpired` ([`03-messages.md` §5.4](../../03-messages.md#54-sessionended)) — not as a StopServiceRequest would, which is the customer's stop, `Local`. It sends no StopServiceResponse, and a StopServiceRequest that arrives afterwards names no active session and is answered `Rejected` with `3006 SESSION_NOT_FOUND` (rule 5). The station **MUST** generate a receipt and send a `ReceiptReady` notification. The app does not need to send a StopServiceRequest for auto-stopped sessions.

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

**Example (Response -- Rejected):**

```json
{
  "type": "StopServiceResponse",
  "result": "Rejected",
  "errorCode": 3006,
  "errorText": "SESSION_NOT_FOUND"
}
```

## 4. Retrieving Receipt (FFF6)

After the service ends (manual stop or auto-stop), the app asks for the signed transaction receipt on characteristic FFF6. The receipt is the authoritative record of the offline transaction and is used for reconciliation when connectivity is restored.

**Request and response:** a `ReceiptRequest` naming the session's `offlineTxId`, written to FFF6, answered by one `ReceiptResponse` notified on FFF6 — `Accepted` with the receipt, or `Rejected` with `3006 SESSION_NOT_FOUND` ([BLE Transport -- Receipt (FFF6)](ble-transport.md#8-receipt-fff6), which defines both and the receipt's fields).

**Processing rules:**

1. The app **SHOULD** ask for the receipt after receiving a `ReceiptReady` notification on FFF5.
2. The app **MUST** store the receipt in local secure storage for later upload to the server, by the receipt upload of [`app-contract.md` §4](app-contract.md#4-receipt-upload) — the `receipt` of the `ReceiptResponse`, exactly as the station signed it.
3. The receipt includes a `txCounter` field carried as forensic evidence for reconciliation. The app **MUST** preserve this field unmodified — it is inside the signed body, so altering it invalidates the signature.
4. The receipt's `signature` is an ECDSA-P256-SHA256 signature computed by the station over the canonical `data` field using the station's private key. The server verifies this signature during reconciliation.
5. The `ReceiptResponse` is an AEAD frame under the **current** connection's `k_station_to_app` (06-security.md §6.5.3), so no third party reads the receipt in transit, and the station serves it only to an app that names its `offlineTxId`, which only the session's own connection was given ([ble-transport.md §8](ble-transport.md#8-receipt-fff6)) — the receipt carries `userId`/`deviceId`/amounts (finding N15). The financial **record** persists in the station's NVS independently of the BLE channel. If the app is unable to read the receipt (e.g., BLE disconnect), it **MAY** reconnect later — but because the per-connection session key is discarded on disconnect ([ble-transport.md §12](ble-transport.md#12-connection-lifecycle-and-isolation)), the app **MUST** complete a fresh Hello and Challenge first, and then asks for the receipt by its `offlineTxId`. The station serves the receipt for the read window of [ble-transport.md §8](ble-transport.md#8-receipt-fff6): at least 24 hours after signing it.

**Example (the receipt a `ReceiptResponse` carries):**

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
    "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjMwMCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjo1MCwiZGV2aWNlSWQiOiJkZXZfZDRlNWY2YTciLCJkdXJhdGlvblNlY29uZHMiOjI5OCwiZW5kUmVhc29uIjoiTG9jYWwiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxMDowNDo1OC4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjo1MDAsImVuZXJneVdoIjoxNTAsImxpcXVpZE1sIjo0NTIwMH0sIm9mZmxpbmVQYXNzSWQiOiJvcGFzc185MmRmMGQ1YzAxMWVhZjc0Iiwib2ZmbGluZVR4SWQiOiJvdHhfZDRlNWY2YTdiOGM5IiwicGFzc0NvdW50ZXIiOjM2LCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic3RhcnRlZEF0IjoiMjAyNi0wMi0xM1QxMDowMDowMC4wMDBaIiwic3RhdGlvbklkIjoic3RuX2ExYjJjM2Q0IiwidHhDb3VudGVyIjo1LCJ1c2VySWQiOiJzdWJfMDYwNzJhODI5ZTM5MThhOCJ9",
    "signature": "MEQCIC1xFC3JI43P6xTt1RR6xpxe4u/FIo2Otj7bEq7waOATAiBfKgayOnnmSVHyJFMZrbHtG65GRFCWwwt3KkXlqq4hIQ==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5,
  "offlinePassId": "opass_92df0d5c011eaf74",
  "userId": "sub_06072a829e3918a8",
  "deviceId": "dev_d4e5f6a7",
  "passCounter": 36
}
```

## 5. Connection Drop Handling

If the BLE connection drops during an active session, the following rules apply:

1. **Station behaviour:** The station **MUST** continue the active service until the auto-stop timer expires. The station **MUST NOT** abort a running service due to BLE disconnection. Upon service completion (auto-stop), the station **MUST** generate a signed receipt and serve it on FFF6 (§4).
2. **App behaviour:** The app **SHOULD** attempt to reconnect to the station. On reconnect it cannot monitor the session — FFF5 notifications go only to the connection that started it — and, once the service has ended, it **SHOULD** ask for the receipt by its `offlineTxId` (§4).
3. **Receipt availability:** The station **MUST** serve the receipt on FFF6 for the read window of [ble-transport.md §8](ble-transport.md#8-receipt-fff6) — at least the OSPP Session Retention Horizon, 24 hours, after it signs it — whether or not another session has begun on the bay since.
4. **Session state on reconnect:** A disconnect destroys the per-connection AEAD session key ([ble-transport.md §12](ble-transport.md#12-connection-lifecycle-and-isolation) — derived key, nonces, and authenticated context are discarded). Therefore, on **any** reconnect, the app **MUST** perform a full re-handshake (Hello, Challenge, Authentication) before issuing any session command, or the Hello and Challenge before asking for a receipt; there is no key to resume. The underlying *service* is unaffected — it continues on its auto-stop timer (§6) regardless of the BLE channel — but the secure channel itself is always re-established from scratch, and a session command is honoured only on the connection that established the session.

## 6. Auto-Stop Timer

The station **MUST** maintain a station-side auto-stop timer for every active BLE session:

1. The timer is initialized to `requestedDurationSeconds` when the service starts. That value never exceeds the authorized duration — the **signed** ServerSignedAuth claim for Partial A, the AuthorizeOfflinePass response value for Partial B, the OfflineAuthRequest's requested duration for a pass the station validated itself — because a request above it is refused (§1); for Partial B it equals it, because a request below it is refused too.
2. The timer counts down in real time, independent of the BLE connection state.
3. When the timer reaches zero, the station **MUST** stop the physical hardware, calculate final `creditsCharged`, generate a signed receipt, serve it on FFF6, and send a `ReceiptReady` notification on FFF5 (if the app is still connected).
4. The auto-stop timer ensures that services always complete within the authorized duration, even if the app crashes, the BLE connection drops, or the user walks away.
5. The auto-stop timer **MUST NOT** be extended or reset by app requests. The app stops a service before the timer expires only by a StopServiceRequest.

## 7. Related Schemas

- Start Service Request: [`start-service-request.schema.json`](../../../schemas/ble/start-service-request.schema.json)
- Start Service Response: [`start-service-response.schema.json`](../../../schemas/ble/start-service-response.schema.json)
- Stop Service Request: [`stop-service-request.schema.json`](../../../schemas/ble/stop-service-request.schema.json)
- Stop Service Response: [`stop-service-response.schema.json`](../../../schemas/ble/stop-service-response.schema.json)
- Service Status: [`service-status.schema.json`](../../../schemas/ble/service-status.schema.json)
- Receipt Request: [`receipt-request.schema.json`](../../../schemas/ble/receipt-request.schema.json)
- Receipt Response: [`receipt-response.schema.json`](../../../schemas/ble/receipt-response.schema.json)
- Receipt: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
