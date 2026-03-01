# Chapter 07 — Error Codes & Resilience

> **Status:** Draft | **OSPP Version:** 0.1.0-draft.1

This chapter defines the complete error taxonomy for the OSPP protocol, including the error code registry, standard error response format, retry policies, circuit breaker patterns, and graceful degradation behavior.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

For message references, see [Chapter 03 — Message Catalog](03-messages.md). Messages are referenced as **[MSG-XXX]**. For flow references, see [Chapter 04 — Flows](04-flows.md).

---

## 1. Error Code Structure

### 1.1 Code Ranges

Error codes are organized into six functional categories. Each category occupies a 1000-code range with sub-ranges for logical grouping.

| Range | Category | Tier | Count | Description |
|:------|----------|:----:|:-----:|-------------|
| 1000–1999 | **Transport Errors** | Protocol | 15 | Network, protocol, message format, and message integrity errors |
| 2000–2999 | **Authentication & Authorization Errors** | Protocol | 14 | Identity verification, credential validation, and access control |
| 3000–3999 | **Session & Bay Errors** | Application | 17 | Bay state, session lifecycle, reservation, and service errors |
| 4000–4999 | **Payment & Credit Errors** | Application | 14 | Wallet balance, payment processing, refunds, offline credit limits, and certificate management |
| 5000–5999 | **Station Hardware & Software Errors** | Application | 34 | Physical hardware faults and embedded software errors |
| 6000–6999 | **Server Errors** | Application | 8 | Server-side processing, timeouts, and infrastructure errors |
| 9000–9999 | **Vendor-Specific** | Vendor | — | Reserved for vendor-defined error codes |

**Error tiers:**

- **Protocol tier** (1000–2999): Errors related to transport, message format, envelope validation, and identity authentication. These errors indicate that the protocol communication itself has failed and the message could not be processed. Protocol-tier errors are typically handled by the communication layer.
- **Application tier** (3000–6999): Errors related to business logic, state violations, hardware conditions, and server-side processing. These errors indicate that the message was received and understood, but the requested operation could not be completed. Application-tier errors are handled by the application layer.
- **Vendor tier** (9000–9999): Reserved for implementation-specific error codes. Vendors **MUST** document their vendor error codes separately.

**Total: 102 standard error codes.**

### 1.2 Severity Levels

Every error code is assigned a fixed severity level that indicates its impact and expected response.

| Severity | Description | Expected Response |
|----------|-------------|-------------------|
| **Critical** | System cannot continue safe operation. Immediate action required. | Station SHOULD transition to `Faulted` state for affected bay(s). Report via SecurityEvent [MSG-012] if security-related. Immediate operator notification. |
| **Error** | Operation failed but the system can continue operating. | Log error, attempt recovery per retry policy, report to server if station-originated. |
| **Warning** | Degraded operation; attention needed but system remains functional. | Log event, monitor for escalation, continue operation. |
| **Info** | Informational; no corrective action required. | Log only. MAY be omitted from error responses if implementation prefers. |

**Severity escalation rules:**

- **3+ Warning** errors of the same code within 5 minutes on the same bay SHOULD escalate to **Error** severity in the next StatusNotification.
- **3+ Error** events of the same code within 10 minutes on the same bay SHOULD trigger a transition to **Faulted** state (effective **Critical**).
- All **Critical** errors MUST be reported via SecurityEvent [MSG-012] with `type: "HardwareFault"` or `"SoftwareFault"` as appropriate.

### 1.3 Error Object Fields

Every error — whether in an MQTT RESPONSE, BLE AuthResponse, or REST API response — MUST include the following fields:

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `errorCode` | integer | **REQUIRED** | Numeric error code from the ranges in §1.1. |
| `errorText` | string | **REQUIRED** | Machine-readable error name in `UPPER_SNAKE_CASE` (e.g., `BAY_BUSY`). Stable across versions — clients MAY use this for programmatic matching. |
| `errorDescription` | string | **REQUIRED** | Human-readable description of the error and its context. MAY vary per occurrence. |
| `severity` | string | **REQUIRED** | One of: `Critical`, `Error`, `Warning`, `Info`. |
| `recoverable` | boolean | **REQUIRED** | `true` if the error can be resolved by retry, user action, or automatic recovery. `false` if manual intervention or system repair is required. |
| `recommendedAction` | string | **REQUIRED** | Suggested corrective action for the receiver. |
| `timestamp` | string | **REQUIRED** | ISO 8601 UTC with milliseconds — when the error was detected. |
| `vendorErrorCode` | string | OPTIONAL | Vendor-specific sub-code for proprietary diagnostics (see §8). |
| `details` | object | OPTIONAL | Additional structured context (e.g., which field failed validation, threshold values, etc.). |

---

## 2. Error Response Format

### 2.1 MQTT Error Response

When a station or server rejects a REQUEST, it MUST respond with a RESPONSE message containing `"status": "Rejected"` and an `error` object.

```json
{
  "messageId": "cmd_550e8400-e29b-41d4-a716-446655440000",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-01-30T12:05:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "error": {
      "errorCode": 3001,
      "errorText": "BAY_BUSY",
      "errorDescription": "Bay bay_c1d2e3f4a5b6 is currently occupied by session sess_a1b2c3d4.",
      "severity": "Warning",
      "recoverable": true,
      "recommendedAction": "Wait for the current session to complete or select a different bay.",
      "timestamp": "2026-01-30T12:05:00.123Z"
    }
  }
}
```

**Rules:**

- The `messageId` in the RESPONSE MUST match the `messageId` of the originating REQUEST.
- The `action` field MUST match the originating REQUEST's action.
- The `status` field MUST be `"Rejected"` when an error is present.
- The `source` field MUST indicate who generated the error (`"Station"` or `"Server"`).

### 2.2 MQTT Error Event

Stations MAY send unsolicited error reports as EVENT messages (no response expected) for conditions that are not tied to a specific REQUEST.

```json
{
  "messageId": "err_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "Event",
  "action": "SecurityEvent",
  "timestamp": "2026-01-30T12:10:00.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "eventId": "sec_a1b2c3d4e5f6",
    "type": "HardwareFault",
    "severity": "Critical",
    "timestamp": "2026-01-30T12:10:00.456Z",
    "details": {
      "bayId": "bay_c1d2e3f4a5b6",
      "errorCode": 5001,
      "errorText": "PUMP_SYSTEM",
      "errorDescription": "Actuator overcurrent detected on bay 1. Motor current 8.2A exceeds 6A threshold.",
      "bayNumber": 1,
      "motorCurrentAmps": 8.2,
      "thresholdAmps": 6.0
    }
  }
}
```

### 2.3 BLE Error Response

BLE errors are returned via the TX Response characteristic (FFF4) as AuthResponse, StartServiceResponse, or StopServiceResponse messages with `"result": "Rejected"`.

```json
{
  "type": "AuthResponse",
  "result": "Rejected",
  "error": {
    "errorCode": 2002,
    "errorText": "OFFLINE_PASS_INVALID",
    "errorDescription": "OfflinePass ECDSA P-256 signature verification failed.",
    "severity": "Error",
    "recoverable": false,
    "recommendedAction": "Request a new OfflinePass from the server when connectivity is available.",
    "timestamp": "2026-01-30T12:15:00.789Z"
  }
}
```

**BLE-specific rules:**

- The `type` field indicates the BLE message type that carries the error.
- BLE errors MUST NOT include `vendorErrorCode` or `details` to minimize payload size (BLE MTU constraints).
- If the error payload would exceed the negotiated MTU, the `errorDescription` SHOULD be truncated to fit. The `errorCode` and `errorText` MUST NOT be truncated.

### 2.4 REST API Error Response

Server REST API endpoints return errors using standard HTTP status codes with a JSON body containing the error object.

```json
HTTP/1.1 409 Conflict
Content-Type: application/json
X-Request-Id: req_f47ac10b-58cc-4372-a567-0e02b2c3d479

{
  "error": {
    "errorCode": 3001,
    "errorText": "BAY_BUSY",
    "errorDescription": "Bay bay_c1d2e3f4a5b6 is currently occupied.",
    "severity": "Warning",
    "recoverable": true,
    "recommendedAction": "Select a different bay or wait for the current session to complete.",
    "timestamp": "2026-01-30T12:20:00.000Z"
  }
}
```

**HTTP status code mapping:**

| HTTP Status | Typical Error Codes | Description |
|:-----------:|---------------------|-------------|
| 400 | 1005, 3015, 6004 | Bad request — invalid format or payload |
| 401 | 2008, 2009, 2010 | Unauthorized — authentication failed or expired |
| 402 | 4001 | Payment required — insufficient balance |
| 403 | 2008 | Forbidden — action not permitted for this role |
| 404 | 3005, 3006, 3012 | Not found — resource does not exist |
| 409 | 3001, 3014, 6005 | Conflict — resource state conflict |
| 422 | 3004, 3008, 3010 | Unprocessable — valid format but invalid values |
| 429 | 6006 | Too many requests — rate limit exceeded |
| 500 | 6000, 6001 | Internal server error |
| 502 | 6003 | Bad gateway — station unreachable |
| 504 | 6002 | Gateway timeout — station did not respond |

---

## 3. Error Code Registry

### 3.1 Transport Errors (1xxx)

Transport errors cover network connectivity, protocol negotiation, message format, and message integrity failures.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 1000 | `TRANSPORT_GENERIC` | Error | true | Unclassified transport or communication error. | Retry with exponential backoff; if persistent, report to server. |
| 1001 | `MQTT_CONNECTION_LOST` | Error | true | MQTT connection to broker was lost unexpectedly. | Reconnect with exponential backoff (1s→30s cap). Buffer events locally. See §5.1. |
| 1002 | `MQTT_PUBLISH_FAILED` | Error | true | MQTT PUBLISH failed after all QoS 1 delivery attempts. | Retry publish; if repeated, check broker connectivity. Buffer message for later delivery. |
| 1003 | `TLS_HANDSHAKE_FAILED` | Critical | false | TLS 1.3 handshake failed (cipher negotiation, certificate validation, or version mismatch). | Verify certificate chain and expiry. Check TLS library version. Report via SecurityEvent [MSG-012]. |
| 1004 | `CERTIFICATE_ERROR` | Critical | false | X.509 certificate is expired, revoked, self-signed, or has an invalid chain. | Station: enter provisioning mode for certificate renewal. Server: reject connection, alert operator. |
| 1005 | `INVALID_MESSAGE_FORMAT` | Error | false | Received message is not valid JSON, is missing required envelope fields, or has invalid field types. | Log the malformed message. Do NOT retry — sender must fix the message. |
| 1006 | `UNKNOWN_ACTION` | Warning | false | Received message has an `action` field that is not recognized by this implementation. | Respond with REJECTED. Sender should verify protocol version and action name. |
| 1007 | `PROTOCOL_VERSION_MISMATCH` | Error | false | The `protocolVersion` in the received message has a different MAJOR version than supported. | Log error. Station: await firmware update for new protocol version. Server: reject, respond with supported version. |
| 1008 | `BLE_RADIO_ERROR` | Warning | true | BLE radio hardware or GATT stack error (advertising failure, connection drop, MTU negotiation failure). | Reset BLE stack. If persistent, disable BLE and report via SecurityEvent [MSG-012]. |
| 1009 | `DNS_RESOLUTION_FAILED` | Error | true | Cannot resolve the MQTT broker hostname via DNS. | Retry after 30s. Verify DNS server configuration. Fall back to IP address if configured. |
| 1010 | `MESSAGE_TIMEOUT` | Warning | true | Expected RESPONSE was not received within the action-specific timeout period. | Retry per the action's retry policy (see §5). If max retries exhausted, escalate to ERROR. |
| 1011 | `URL_UNREACHABLE` | Error | true | A remote URL (e.g., firmware download, diagnostics upload) is not reachable. | Retry with exponential backoff. Verify network connectivity and URL correctness. |
| 1012 | `MAC_VERIFICATION_FAILED` | Critical | false | HMAC-SHA256 message authentication code verification failed. The message may have been tampered with. | Reject the message. Log SecurityEvent [MSG-012] with `type: "MacVerificationFailure"`. 3+ failures from same source within 60s → flag as potentially compromised. |
| 1013 | `MAC_MISSING` | Error | false | Message signing mode requires HMAC (`messageSigningMode` = `"all"` or `"critical"`) but the received message does not contain a `mac` field. | Reject the message. Log SecurityEvent [MSG-012]. Station must include HMAC per `MessageSigningMode` after BootNotification ACCEPTED. |
| 1014 | `MESSAGE_TOO_LARGE` | Error | false | Received message exceeds the maximum allowed size (64 KB for MQTT, negotiated MTU for BLE). | Reject the message. Sender must reduce payload size — e.g., split MeterValues into multiple messages. |

### 3.2 Authentication & Authorization Errors (2xxx)

Authentication errors cover identity verification (mTLS, JWT, BLE handshake, OfflinePass) and authorization (role-based access control, action permissions).

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 2000 | `AUTH_GENERIC` | Error | false | Unclassified authentication or authorization error. | Check credentials and permissions. Contact operator if persistent. |
| 2001 | `STATION_NOT_REGISTERED` | Error | false | Station identifier is not recognized by the server. BootNotification was sent by an unknown `stationId`. | Station: enter provisioning mode. Operator: verify station was registered in the management portal. |
| 2002 | `OFFLINE_PASS_INVALID` | Error | false | OfflinePass ECDSA P-256 signature verification failed. The pass data has been tampered with or was signed by an unknown key. | App: request a new OfflinePass from the server. Station: log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. |
| 2003 | `OFFLINE_PASS_EXPIRED` | Warning | true | OfflinePass `expiresAt` timestamp has passed. The pass is no longer valid. | App: request a new OfflinePass from the server. Pass has a maximum validity of 24 hours. |
| 2004 | `OFFLINE_EPOCH_REVOKED` | Error | false | OfflinePass `revocationEpoch` is less than the station's current `RevocationEpoch`. The pass has been batch-revoked. | App: request a new OfflinePass with the current epoch. Station epoch is updated via ChangeConfiguration [MSG-013]. |
| 2005 | `OFFLINE_COUNTER_REPLAY` | Critical | false | OfflinePass `counter` is less than or equal to the station's `lastSeenCounter`. Possible replay attack. | Reject authentication. Station: log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. App: if legitimate, request a new OfflinePass. |
| 2006 | `OFFLINE_STATION_MISMATCH` | Error | false | OfflinePass `stationId` constraint does not match the connected station (when station-restricted passes are used). | App: the OfflinePass is not valid for this station. Request a new pass or use an unrestricted pass. |
| 2007 | `COMMAND_NOT_SUPPORTED` | Warning | false | The requested action is recognized but not implemented by this station's firmware or disabled by configuration. | Server: do not retry. Check station capabilities from BootNotification. |
| 2008 | `ACTION_NOT_PERMITTED` | Error | false | The authenticated entity does not have the required RBAC role or permission to perform this action. | Verify the user's role and permissions. Contact the operator admin if elevated access is needed. |
| 2009 | `JWT_EXPIRED` | Warning | true | JWT access token has expired (past `exp` claim). | App: use the refresh token to obtain a new access token. If refresh token is also expired, re-authenticate. |
| 2010 | `JWT_INVALID` | Error | false | JWT is malformed, has an invalid signature, or was signed by an unknown key. | App: clear stored tokens and re-authenticate. May indicate token tampering. |
| 2011 | `SESSION_TOKEN_EXPIRED` | Warning | true | Web payment session token (UUID v4) has exceeded its 10-minute TTL. | Browser: restart the payment flow from the QR code scan. |
| 2012 | `SESSION_TOKEN_INVALID` | Error | false | Web payment session token is not found in Redis or has an invalid format. | Browser: restart the payment flow. Do not retry with the same token. |
| 2013 | `BLE_AUTH_FAILED` | Error | false | BLE challenge-response authentication failed. The session key derivation or session proof is invalid. | App: disconnect and retry the BLE handshake. If persistent, report to the server when online. |

### 3.3 Session & Bay Errors (3xxx)

Session errors cover bay state transitions, session lifecycle, reservation management, and service validation.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 3000 | `SESSION_GENERIC` | Error | true | Unclassified session or bay error. | Inspect the `errorDescription` for specific context. |
| 3001 | `BAY_BUSY` | Warning | true | The requested bay is currently in `Occupied` or `Finishing` state and cannot accept new sessions or reservations. | Wait for the current session to complete, or select a different bay. Server: refund 100% if this rejects a StartService [MSG-005]. |
| 3002 | `BAY_NOT_READY` | Warning | true | The bay is not in `Available` state (may be in `Faulted`, `Unavailable`, or transitioning). | Wait and retry. Check StatusNotification [MSG-009] for the bay's current state. |
| 3003 | `SERVICE_UNAVAILABLE` | Warning | true | The requested service is not available on this bay (hardware not present, disabled by configuration, or temporarily out of chemicals). | Select a different service or a different bay that supports the requested service. |
| 3004 | `INVALID_SERVICE` | Error | false | The `serviceId` in the request does not exist in the station's service catalog. | Verify the service ID against the station's UpdateServiceCatalog [MSG-021] data. |
| 3005 | `BAY_NOT_FOUND` | Error | false | The `bayId` in the request does not match any bay registered on this station. | Verify the bay ID. The bay may have been decommissioned or the ID may be incorrect. |
| 3006 | `SESSION_NOT_FOUND` | Error | false | The referenced `sessionId` does not exist or has already been completed/expired. | Verify the session ID. For StopService [MSG-006], the session may have already ended (timer expiry or auto-stop). |
| 3007 | `SESSION_MISMATCH` | Error | false | The `sessionId` in a StopService request does not match the currently active session on the specified bay. | Verify the session ID. Use StatusNotification [MSG-009] to determine the active session on the bay. |
| 3008 | `DURATION_INVALID` | Error | false | The requested `durationSeconds` is invalid (zero, negative, or below the service minimum). | Specify a valid duration. Minimum is service-defined (typically 60 seconds). |
| 3009 | `HARDWARE_ACTIVATION_FAILED` | Error | false | Station accepted the session but the hardware (pump, valve, motor) failed to start within the activation timeout. | Server: refund 100%. Station: transition bay to `Faulted`, report via SecurityEvent [MSG-012]. Operator: dispatch technician. |
| 3010 | `MAX_DURATION_EXCEEDED` | Warning | false | The requested session duration exceeds the station's `MaxSessionDurationSeconds` configuration limit. | Reduce the requested duration to at most `MaxSessionDurationSeconds` seconds (default 600s). |
| 3011 | `BAY_MAINTENANCE` | Warning | true | The bay is in `Unavailable` state due to active maintenance mode (SetMaintenanceMode [MSG-020]). | Wait for maintenance to complete. Operator: clear maintenance mode when work is done. |
| 3012 | `RESERVATION_NOT_FOUND` | Error | false | The referenced `reservationId` does not exist or has already been cancelled/expired. | Do not retry. Start a new reservation flow if needed. |
| 3013 | `RESERVATION_EXPIRED` | Warning | true | The reservation's TTL has elapsed. The bay has been automatically released. | Create a new reservation. Default TTL is `ReservationDefaultTTL` (180 seconds). |
| 3014 | `BAY_RESERVED` | Warning | true | The bay has an active reservation held by another user/session. | Wait for the reservation to expire, or select a different bay. |
| 3015 | `PAYLOAD_INVALID` | Error | false | The request payload is structurally valid JSON but contains semantically invalid values (e.g., negative credits, empty required strings, unknown enum values). | Fix the payload values. Inspect the `details` field for specific validation errors. |
| 3016 | `ACTIVE_SESSIONS_PRESENT` | Warning | true | One or more bays have active sessions. The requested operation (e.g., Reset) cannot proceed until all sessions are completed or stopped. | Stop all active sessions first, then retry the operation. |

### 3.4 Payment & Credit Errors (4xxx)

Payment errors cover wallet balance, credit limits, payment processing, refunds, and offline spending constraints.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 4000 | `PAYMENT_GENERIC` | Error | true | Unclassified payment or credit error. | Inspect the `errorDescription` for context. Contact support if persistent. |
| 4001 | `INSUFFICIENT_BALANCE` | Warning | true | The user's wallet balance (credits) is insufficient to cover the requested service at its minimum duration. | App: show top-up prompt. Web: redirect to payment page. The user must purchase more credits before starting a session. |
| 4002 | `OFFLINE_LIMIT_EXCEEDED` | Error | false | The OfflinePass's `maxTotalCredits` or `maxUses` limit has been reached. No further offline transactions are permitted with this pass. | App: the user must go online to request a new OfflinePass (or top up credits). |
| 4003 | `OFFLINE_RATE_LIMITED` | Warning | true | The OfflinePass's `minIntervalSec` constraint was violated — not enough time has elapsed since the last offline transaction. | Wait the required interval (default 60 seconds) before attempting another offline transaction. |
| 4004 | `OFFLINE_PER_TX_EXCEEDED` | Error | false | The requested service cost exceeds the OfflinePass's `maxCreditsPerTx` limit for a single transaction. | Select a less expensive service or reduce the requested duration. |
| 4005 | `PAYMENT_FAILED` | Error | true | The payment processor rejected the payment (card declined, 3DS failure, processor error). | User: try a different payment method. Web: restart the payment flow. |
| 4006 | `PAYMENT_TIMEOUT` | Warning | true | The PaymentIntent did not receive a webhook confirmation within its 5-minute TTL. | Check payment status with the processor. If unresolved, mark as expired and inform the user. |
| 4007 | `REFUND_FAILED` | Error | true | The refund request to the payment processor failed. | Retry the refund. If persistent, escalate to manual refund by accounting team. |
| 4008 | `WEBHOOK_SIGNATURE_INVALID` | Critical | false | The payment webhook HMAC-SHA512 signature does not match the expected value. Possible spoofing attempt. | Reject the webhook. Log SecurityEvent. Do NOT process the payment. Alert security team. |

#### 4.01x — Certificate Management Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 4010 | `CSR_INVALID` | Error | true | The Certificate Signing Request is malformed, uses a prohibited key algorithm (must be ECDSA P-256), or has an invalid Subject CN. | Station: regenerate keypair and CSR with correct parameters. Server: inspect CSR details and log the specific validation failure. |
| 4011 | `CERTIFICATE_CHAIN_INVALID` | Error | true | The certificate chain verification failed. The signing CA is untrusted, an intermediate certificate is missing, or the signature does not validate. | Server: verify the CA chain is complete and correctly ordered. Station: report the specific chain validation error in the response. |
| 4012 | `CERTIFICATE_TYPE_MISMATCH` | Warning | true | The certificate type in the response does not match the type requested in the CSR, or the station is not authorized for the requested certificate type. | Verify the `certificateType` field matches between SignCertificate and CertificateInstall. |
| 4013 | `RENEWAL_DENIED` | Error | false | The server refuses the certificate renewal request due to policy constraints, rate limiting, or station suspension. | Contact the operator. The server administrator must approve the renewal or adjust the policy. |
| 4014 | `KEYPAIR_GENERATION_FAILED` | Critical | false | The station's secure element, TPM, or crypto hardware cannot generate a new ECDSA P-256 keypair. Possible hardware fault or entropy source failure. | Log SecurityEvent with `HardwareFault` type. Dispatch technician to inspect the station's crypto hardware. |

### 3.5 Station Hardware & Software Errors (5xxx)

Station errors are reported by the station itself and cover physical hardware faults (pumps, valves, motors, sensors, dispensers) and embedded software issues (firmware, storage, memory).

#### 5.0xx — Hardware Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5000 | `HARDWARE_GENERIC` | Warning | true | Unclassified hardware error that does not fit a specific category. | Log and monitor. If persistent, transition bay to Faulted and dispatch technician. |
| 5001 | `PUMP_SYSTEM` | Critical | false | Pump malfunction detected (overcurrent, no pressure, motor failure). Applies to any pump type — water, air, vacuum, fuel, etc. Bay MUST transition to `Faulted`. | Immediately stop active session on affected bay. Dispatch technician. Do not attempt restart without physical inspection. |
| 5002 | `FLUID_SYSTEM` | Warning | true | Fluid supply error (low flow rate, supply valve issue, tank level low but not empty). Covers water, detergent, coolant, fuel, or any primary fluid used by the station. | Log warning. If fluid meter values drop below threshold during session, alert operator. May self-resolve when supply is restored. |
| 5003 | `CONSUMABLE_SYSTEM` | Warning | true | Consumable supply depleted or dosing/dispensing system error (tank empty, hopper empty, dosing pump calibration failure). Covers chemicals, detergent, capsules, ingredients, or any expendable material. | Alert operator to refill consumable supply. Bay MAY continue with reduced-service mode if possible. |
| 5004 | `ELECTRICAL_SYSTEM` | Critical | true | Power supply fault (voltage out of range, relay failure, phase loss). | Station: engage emergency shutdown if voltage exceeds safe range. Bay → Faulted. Recoverable if power is restored within tolerance. |
| 5005 | `PAYMENT_HARDWARE` | Warning | false | On-station payment hardware error (coin acceptor jam, card reader malfunction, NFC terminal failure). | Disable local payment option. Mobile app and web payments remain available. Dispatch technician for payment hardware service. |
| 5006 | `HEATING_SYSTEM` | Warning | true | Heating or thermal regulation fault (over-temperature sensor triggered, heater element failure, thermostat malfunction). | Disable temperature-dependent services. Other services MAY continue. Auto-recoverable if temperature returns to safe range. |
| 5007 | `MECHANICAL_SYSTEM` | Warning | false | Mechanical component failure (actuator jam, motor fault, door mechanism, dispensing arm). | Bay → Faulted. Dispatch technician. Requires physical intervention. |
| 5008 | `SENSOR_FAILURE` | Warning | true | Sensor reading out of range or sensor unresponsive (flow meter, pressure sensor, temperature probe, proximity sensor). | Log degraded readings. Switch to time-based billing if metering sensor fails during active session. Alert operator. |
| 5009 | `EMERGENCY_STOP` | Critical | false | Physical emergency stop button was pressed. ALL bays on the affected station MUST transition to `Faulted`. | Immediately halt all active sessions. All bays → Faulted. Requires physical reset of E-stop button and operator verification before resuming. |

#### 5.01x — Firmware Update Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5014 | `DOWNLOAD_FAILED` | Error | true | The firmware binary could not be downloaded from the provided URL (DNS failure, HTTP error, connection timeout). | Verify the `firmwareUrl` is reachable. Retry the UpdateFirmware [MSG-016] command. Check station network connectivity. |
| 5015 | `CHECKSUM_MISMATCH` | Error | false | The downloaded firmware binary does not match the provided SHA-256 checksum. The file may be corrupt or tampered with. | Do NOT install. Report via SecurityEvent [MSG-012]. Server: verify the binary and checksum, then retry. |
| 5016 | `VERSION_ALREADY_INSTALLED` | Warning | false | The requested firmware version is already running on the station. No update is needed. | No action required. Server: update its records to reflect the station's current firmware version. |
| 5017 | `INSUFFICIENT_STORAGE` | Error | false | The station does not have enough storage to download or install the firmware binary. | Server: check if a smaller build is available. Station: clear diagnostics logs or old firmware partitions if possible. |
| 5018 | `INSTALLATION_FAILED` | Critical | false | The firmware could not be written to the inactive partition. The station remains on the current firmware. | Station: report via SecurityEvent [MSG-012]. Dispatch technician — may indicate flash storage failure. |
| 5112 | `FIRMWARE_SIGNATURE_INVALID` | Critical | false | The firmware image's ECDSA P-256 signature is absent (when required) or does not match the trusted Firmware Signing Certificate. The firmware binary may have been tampered with. | Do NOT install. Report via SecurityEvent [MSG-012] with `FirmwareIntegrityFailure` type. Server: verify signing key and re-publish firmware. |

#### 5.02x — Diagnostics & Catalog Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5019 | `UPLOAD_FAILED` | Error | true | The diagnostics archive could not be uploaded to the provided URL. | Verify the `uploadUrl` is reachable and accepts uploads. Retry the GetDiagnostics [MSG-018] command. |
| 5020 | `INVALID_TIME_WINDOW` | Warning | false | The `startTime` is after `endTime`, or the requested time window is otherwise invalid. | Fix the time window parameters in the GetDiagnostics request. |
| 5021 | `NO_DIAGNOSTICS_AVAILABLE` | Warning | false | No diagnostic data is available for the requested time window. | Request a broader time window, or wait for the station to accumulate more diagnostic data. |
| 5023 | `INVALID_CATALOG` | Error | false | One or more service entries in the UpdateServiceCatalog [MSG-021] request failed validation (missing required fields, invalid pricing type, malformed service definition). | Fix the catalog payload. Inspect the `details` field for specific validation errors. |
| 5024 | `UNSUPPORTED_SERVICE` | Warning | false | The catalog contains a `serviceId` that the station hardware does not support. The unsupported service is ignored; supported services are applied. | Remove unsupported services from the catalog, or accept the partial application. |
| 5025 | `CATALOG_TOO_LARGE` | Error | false | The service catalog exceeds the station's storage or processing capacity. | Reduce the number of services in the catalog. Check station capabilities for maximum catalog size. |

#### 5.1xx — Software Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5100 | `SOFTWARE_GENERIC` | Error | true | Unclassified embedded software error. | Log error with stack trace (if available). Report via SecurityEvent [MSG-012]. |
| 5101 | `FIRMWARE_ERROR` | Critical | false | Firmware runtime error (unhandled exception, assertion failure, task crash). | Station: attempt watchdog-triggered reset. If error persists after reset, roll back to previous firmware partition. Report via SecurityEvent [MSG-012]. |
| 5102 | `CONFIGURATION_ERROR` | Error | true | Station configuration is corrupt, missing required keys, or contains out-of-range values. | Station: load default configuration for missing/invalid keys. Report the specific key(s) via SecurityEvent [MSG-012]. Server: push corrected config via ChangeConfiguration [MSG-013]. |
| 5103 | `STORAGE_ERROR` | Error | true | Non-volatile storage (NVS) read or write failure. | Station: retry the storage operation. If persistent, log SecurityEvent and disable features that require storage (offline tx log). |
| 5104 | `WATCHDOG_RESET` | Critical | true | Hardware watchdog timer expired — a firmware task was unresponsive. Station performed an automatic reset. | Station: send BootNotification [MSG-001] with `bootReason: "Watchdog"` after reboot. Server: flag for monitoring — 3+ watchdog resets in 24h triggers operator alert. |
| 5105 | `MEMORY_ERROR` | Critical | true | Available RAM dropped below the critical threshold. | Station: release non-essential buffers (meter value history, BLE advertising data). If insufficient, perform a soft reset. Report via SecurityEvent. |
| 5106 | `CLOCK_ERROR` | Warning | true | Real-time clock (RTC) failure or clock drift exceeds 5 minutes from server time (detected at Heartbeat [MSG-008] time sync). | Station: sync clock from next Heartbeat response. If RTC hardware is faulty, use server time exclusively. Flag for operator — large drift may indicate battery failure. |
| 5107 | `OPERATION_IN_PROGRESS` | Warning | true | Another long-running operation is already active (e.g., firmware update, diagnostics upload) and the new request cannot be processed concurrently. | Retry after the in-progress operation completes. Check FirmwareStatusNotification [MSG-017] or DiagnosticsNotification [MSG-019] for progress. |
| 5108 | `CONFIGURATION_KEY_READONLY` | Error | false | The specified configuration key is read-only and cannot be modified via ChangeConfiguration [MSG-013]. | Use a different key, or accept the current value. Read-only keys can only be changed via firmware update or provisioning. |
| 5109 | `INVALID_CONFIGURATION_VALUE` | Error | false | The configuration value is out of range, has an invalid type, or violates the key's constraints. | Check the valid range and type for the configuration key in the configuration registry. |
| 5110 | `RESET_FAILED` | Critical | false | The Reset command failed to execute. The station could not complete the reset sequence due to a hardware or software fault. | Dispatch technician. A physical power cycle may be required. Report via SecurityEvent [MSG-012]. |
| 5111 | `BUFFER_FULL` | Critical | true | Offline transaction buffer is at or near capacity (>= 90%). The station cannot safely accept new sessions without risking data loss. | Station: reject new StartService requests. Reconnect to MQTT to flush buffered TransactionEvents. Server: prioritize reconnection and reconciliation for this station. |

### 3.6 Server Errors (6xxx)

Server errors are generated by the server and returned to mobile apps, web payment clients, or relayed to stations.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 6000 | `SERVER_GENERIC` | Error | true | Unclassified server-side error. | Retry after 5 seconds. If persistent, contact support. |
| 6001 | `SERVER_INTERNAL_ERROR` | Error | true | Server encountered an unexpected error during request processing (database error, unhandled exception). | Retry with exponential backoff. Server: log full error with request context, correlate via `X-Request-Id`. |
| 6002 | `ACK_TIMEOUT` | Warning | true | The server sent a command to the station via MQTT but did not receive a RESPONSE within the action-specific timeout. | Server: refund 100% if this was a StartService. App: show "Station did not respond" with retry option. Server: check station heartbeat status. |
| 6003 | `STATION_OFFLINE` | Warning | true | The station is not connected to the MQTT broker (3+ missed heartbeats or LWT received). | App: show "Station is offline" message. Suggest trying again later or using BLE offline mode if available. |
| 6004 | `VALIDATION_ERROR` | Error | false | REST API request body failed schema validation (missing required fields, invalid types, constraint violations). | Fix the request body per the API schema. The `details` field contains per-field validation errors. |
| 6005 | `SESSION_ALREADY_ACTIVE` | Warning | true | The user already has an active session (only one active session per user is allowed). | App: show the existing active session. The user must stop or wait for the current session before starting a new one. |
| 6006 | `RATE_LIMIT_EXCEEDED` | Warning | true | The request was rejected due to rate limiting (per-IP, per-user, or per-device). | Wait before retrying. The `Retry-After` HTTP header (if present) indicates when to retry. See Chapter 06 §7.1 for rate limit thresholds. |
| 6007 | `SERVICE_DEGRADED` | Info | true | One or more server subsystems are operating in degraded mode (e.g., payment processor unreachable, search index stale). | Non-blocking. The server continues to function with reduced capabilities. Degraded features are listed in the `details` field. |

---

## 4. Error Code Usage per Message

This table maps which error codes can appear in the RESPONSE or rejection of each MQTT action and BLE message type. Error codes in **bold** are the most common for that action.

### 4.1 Station → Server MQTT Actions

| Action | Possible Error Codes |
|--------|---------------------|
| BootNotification [MSG-001] | **2001**, 1005, 1007, 6001 |
| Heartbeat [MSG-008] | 1005, 1010, 5106, 6001 |
| StatusNotification [MSG-009] | *(EVENT — no RESPONSE, but may carry 5xxx error details in payload)* |
| MeterValues [MSG-010] | *(EVENT — no RESPONSE)* |
| TransactionEvent [MSG-007] | **2002**, **2004**, 1005, 3015, 6001 |
| AuthorizeOfflinePass [MSG-002] | **2002**, **2003**, **2004**, **2005**, **2006**, 1005, 4002, 4003, 4004, 6001 |
| FirmwareStatusNotification [MSG-017] | *(EVENT — no RESPONSE)* |
| DiagnosticsNotification [MSG-019] | *(EVENT — no RESPONSE)* |
| SignCertificate [MSG-022] | **4010**, **4012**, **4013**, 1005, 6001 |
| SecurityEvent [MSG-012] | *(EVENT — no RESPONSE)* |
| ConnectionLost [MSG-011] | *(EVENT — no RESPONSE, LWT)* |
| DataTransfer [MSG-025] | *(implicit only — station-initiated DataTransfer uses status values, not error codes)* |

### 4.2 Server → Station MQTT Actions

> **Implicit error codes:** The following error codes apply to **all** Server→Station REQUEST messages and are not repeated in individual rows: `1005 INVALID_MESSAGE_FORMAT`, `2007 COMMAND_NOT_SUPPORTED`, `6001 SERVER_INTERNAL_ERROR`.

| Action | Possible Error Codes |
|--------|---------------------|
| ReserveBay [MSG-003] | **3001**, **3002**, 3005, 3011, 3014, 5000–5009 |
| CancelReservation [MSG-004] | **3012**, **3013**, 3005 |
| StartService [MSG-005] | **3001**, **3002**, **3004**, **3009**, 3003, 3005, 3008, 3010, 3011, 3012, 3013, 3014, 5000–5009, 5111 |
| StopService [MSG-006] | **3006**, **3007**, 3005, 3011 |
| Reset [MSG-015] | **3016**, 5107, 5110 |
| ChangeConfiguration [MSG-013] | **3015**, 1012, 2008, 5108, 5109 |
| GetConfiguration [MSG-014] | *(implicit only)* |
| SetMaintenanceMode [MSG-020] | **3001**, **3005** |
| UpdateFirmware [MSG-016] | **5014**, **5015**, **5017**, **5018**, **5112**, 5016, 5103, 5107, 1011 |
| GetDiagnostics [MSG-018] | **5019**, **5020**, **5021**, 5103, 5107, 1011 |
| UpdateServiceCatalog [MSG-021] | **5023**, **5024**, **5025**, 3015, 5103 |
| CertificateInstall [MSG-023] | **4011**, **4012**, 5103, 5107 |
| TriggerCertificateRenewal [MSG-024] | **4014**, 5107 |
| DataTransfer [MSG-025] | *(implicit only — uses status values UnknownVendor/UnknownData, not error codes)* |
| TriggerMessage [MSG-026] | *(implicit only — uses status value NotImplemented, not error codes)* |

### 4.3 BLE Message Types

| BLE Message | Possible Error Codes |
|-------------|---------------------|
| AuthResponse (→ OfflineAuthRequest) | **2002**, **2003**, **2004**, **2005**, **2006**, **2013**, 4002, 4003, 4004 |
| AuthResponse (→ ServerSignedAuth) | **2002**, **2013**, 1012 |
| StartServiceResponse | **3001**, **3002**, **3004**, **3009**, 3003, 3005, 3008, 3010, 5000–5009 |
| StopServiceResponse | **3006**, **3007** |

### 4.4 REST API Endpoints

| Endpoint | HTTP | Possible Error Codes |
|----------|:----:|---------------------|
| `POST /sessions/start` | 400, 402, 404, 409, 504 | 3001, 3002, 3005, 4001, 6002, 6003, 6005 |
| `POST /sessions/{id}/stop` | 404, 409 | 3006, 3007, 6002 |
| `GET /sessions/{id}` | 404 | 3006 |
| `POST /pay/{code}/start` | 400, 404, 409 | 3001, 3005, 6003 |
| `GET /pay/sessions/{token}/status` | 401, 404 | 2011, 2012 |
| `POST /me/offline-txs` | 400, 401 | 2009, 2010, 3015, 6004 |
| `POST /sessions/offline-auth` | 401, 402 | 2009, 4001 |
| `POST /webhooks/payment-gateway/notification` | 401 | 4008 |

---

## 5. Retry Policies

### 5.1 MQTT Connection Recovery

When the MQTT connection is lost (`1001 MQTT_CONNECTION_LOST`), the station MUST follow this recovery sequence:

```
Attempt  Delay    Max Delay
1        1s       —
2        2s       —
3        4s       —
4        8s       —
5        16s      —
6+       30s      30s (cap)
```

**Rules:**

1. **Jitter:** Each delay MUST include random jitter: `actual_delay = base_delay + random(0, base_delay × 0.3)`.
2. **Active sessions:** Active sessions MUST continue running during disconnection — do NOT stop hardware. The station operates autonomously.
3. **BLE fallback:** The station MUST continue accepting BLE connections during MQTT disconnection.
4. **Event buffering:** The station MUST buffer TransactionEvent and SecurityEvent messages per the categorized buffering policy in [01-architecture.md §6.5](../spec/01-architecture.md#65-offline-message-buffering). Regenerable messages (StatusNotification, MeterValues) MAY be discarded as they are regenerated at reconnection.
5. **Reconnection sequence:** After MQTT reconnect → re-subscribe → BootNotification [MSG-001] → StatusNotification per bay [MSG-009] → replay buffered events → sync offline transactions [MSG-007].
6. **Maximum offline duration:** If the station cannot reconnect within 72 hours, it SHOULD disable non-essential features (reservations, new sessions) and enter degraded offline-only mode.

### 5.2 BootNotification Retry

| Scenario | Delay | Max Attempts | Escalation |
|----------|-------|:------------:|------------|
| RESPONSE: `ACCEPTED` | — | — | Normal operation |
| RESPONSE: `REJECTED` | `retryInterval` from response (default 30s) | Unlimited | Station stays in limited mode — no commands accepted except BootNotification |
| RESPONSE: `PENDING` | `retryInterval` from response (default 30s) | Unlimited | Station operates normally but server may push config updates |
| Timeout (no response in 30s) | 60s fixed | Unlimited | Log `1010 MESSAGE_TIMEOUT`, retry indefinitely |

The default retry interval (30s) is configurable via `BootRetryInterval` (see §8 Configuration).

### 5.3 Command Retry Policies

Each MQTT command (Server → Station) has a specific retry policy based on urgency and idempotency.

| Action | Max Attempts | Retry Delays | Timeout per Attempt | On All Retries Exhausted |
|--------|:------------:|--------------|:-------------------:|--------------------------|
| StartService (mobile) | 1 | — | 10s | Refund 100%, session → `failed` |
| StartService (web) | 4 | 0s, +5s, +10s, +15s | 10s | CancelReservation → refund 100%, session → `failed` |
| StopService | 1 | — | 10s | Session → `failed`, station auto-stops on timer expiry anyway |
| ReserveBay | 1 | — | 5s | Session → `failed`, inform user |
| CancelReservation | 1 | — | 5s | Server marks reservation as expired locally |
| Reset | 1 | — | 30s | Log failure, operator notification |
| ChangeConfiguration | 1 | — | 60s | Log failure, retry on next maintenance window |
| GetConfiguration | 1 | — | 30s | Log failure, use cached values |
| SetMaintenanceMode | 1 | — | 30s | Log failure, operator notification |
| UpdateFirmware | 1 | — | 300s | Log failure, retry via operator action |
| GetDiagnostics | 1 | — | 300s | Log failure, retry via operator action |
| UpdateServiceCatalog (at boot) | 2 | 0s, +10s | 30s | Use cached catalog |

### 5.4 BLE Retry Policies

| Operation | Max Attempts | Retry Delays | On Failure |
|-----------|:------------:|--------------|------------|
| BLE connection (GATT connect) | 3 | 1s, 2s, 4s | Show "Connection failed" to user |
| BLE handshake (HELLO → CHALLENGE) | 2 | 2s, 4s | Disconnect, show error |
| BLE authentication (OFFLINE_AUTH → AuthResponse) | 1 | — | Show error, allow user to retry manually |
| BLE START_SERVICE | 1 | — | Show error with details from station |
| BLE STOP_SERVICE | 2 | 1s, 2s | Show error — service will auto-stop on timer |

### 5.5 Payment Processing Retry

| Operation | Max Attempts | Retry Delays | On Failure |
|-----------|:------------:|--------------|------------|
| Payment processor API call | 3 | 1s, 2s, 4s (exponential) | Mark PaymentIntent as `failed`, inform user |
| Webhook delivery (processor → server) | N/A | Processor-managed | Server polls processor API after 5 minutes as fallback |
| Refund API call | 3 | 2s, 4s, 8s (exponential) | Escalate to manual refund queue |

### 5.6 REST API Retry (Mobile App)

| Scenario | Strategy | Details |
|----------|----------|---------|
| HTTP 429 (Rate Limited) | Wait `Retry-After` header | Respect the server's backoff instruction |
| HTTP 500, 502, 503 | Exponential backoff | 1s, 2s, 4s, max 3 attempts |
| HTTP 504 (Gateway Timeout) | Single retry after 5s | Then show "Station not responding" |
| Network error (no response) | Exponential backoff | 1s, 2s, 4s, max 3 attempts, then show offline message |
| HTTP 400, 401, 403, 404, 409, 422 | No retry | Client error — fix the request or show appropriate message |

---

## 6. Circuit Breaker

### 6.1 Overview

A circuit breaker prevents cascading failures by temporarily stopping requests to a failing component. OSPP defines circuit breaker patterns for three integration points.

```
States:   CLOSED  ──(threshold exceeded)──►  OPEN
             ▲                                  │
             │                            (cooldown elapsed)
             │                                  │
             └──(probe succeeds)──  HALF-OPEN ◄─┘
```

| State | Behavior |
|-------|----------|
| **CLOSED** | Requests flow normally. Failures are counted. |
| **OPEN** | All requests are immediately rejected without attempting the call. A cooldown timer starts. |
| **HALF-OPEN** | After cooldown, a single probe request is allowed through. If it succeeds, the breaker resets to CLOSED. If it fails, the breaker returns to OPEN with an increased cooldown. |

### 6.2 Station → MQTT Broker Circuit Breaker

| Parameter | Value |
|-----------|-------|
| Failure threshold | 5 consecutive connection failures |
| Cooldown (initial) | 60 seconds |
| Cooldown (max) | 10 minutes |
| Cooldown multiplier | ×2 per re-open |
| Success threshold to close | 1 successful BootNotification exchange |

**Behavior in OPEN state:**
- Station continues operating in BLE-only mode.
- Active sessions continue — hardware is NOT stopped.
- Buffered events accumulate locally.
- Station MUST still attempt the probe after cooldown (single MQTT CONNECT attempt).

### 6.3 Server → Station Command Circuit Breaker

The server tracks per-station command success/failure rates.

| Parameter | Value |
|-----------|-------|
| Failure threshold | 3 consecutive `1010 MESSAGE_TIMEOUT` for the same station |
| Cooldown (initial) | 30 seconds |
| Cooldown (max) | 5 minutes |
| Cooldown multiplier | ×2 per re-open |
| Success threshold to close | 1 successful RESPONSE (any action) |

**Behavior in OPEN state:**
- Server marks the station as "unresponsive" (not "offline" — LWT not received).
- New StartService commands for that station → immediate `6002 ACK_TIMEOUT` response to the app (without sending MQTT command).
- Server continues sending Heartbeat [MSG-008] as probes during HALF-OPEN.

### 6.4 Server → Payment Processor Circuit Breaker

| Parameter | Value |
|-----------|-------|
| Failure threshold | 5 failures within 60 seconds (across all stations) |
| Cooldown (initial) | 30 seconds |
| Cooldown (max) | 5 minutes |
| Cooldown multiplier | ×2 per re-open |
| Success threshold to close | 2 consecutive successful API calls |

**Behavior in OPEN state:**
- New payment initiation requests → `4005 PAYMENT_FAILED` with `errorDescription: "Payment service temporarily unavailable"`.
- Credit-based (wallet) sessions remain available — only card/web payments are affected.
- Server logs `6007 SERVICE_DEGRADED` with `details: {"degradedService": "payment_processor"}`.

---

## 7. Graceful Degradation

When subsystems fail, OSPP-compliant implementations MUST degrade gracefully rather than becoming fully unavailable. This section defines the degradation behavior for each failure scenario.

### 7.1 Degradation Matrix

| Failure Scenario | Impact | Available Services | Degraded/Unavailable |
|------------------|--------|-------------------|---------------------|
| **MQTT broker unreachable** | Station cannot communicate with server | BLE offline sessions, local timer-based sessions | Online sessions, reservations, server commands, real-time monitoring |
| **Payment processor down** | Card/web payments fail | Wallet (credit) sessions, BLE offline sessions | Web payment flow, card top-up |
| **Station BLE disabled** | No offline or BLE sessions | Online sessions (MQTT), web payments | BLE handshake, offline sessions, Partial A/B |
| **Station sensor failure** | Inaccurate metering | All sessions (time-based billing fallback) | Accurate volume-based metering |
| **Station NVS full** | Cannot store new offline transactions | Online sessions, BLE sessions (without local log) | Offline transaction persistence, crash recovery |
| **Server database degraded** | Slow or partial responses | Read-from-cache operations, session start/stop | History queries, transaction search, reports |
| **Server Redis down** | Session token and dedup cache lost | MQTT operations (direct DB fallback) | Web payment sessions, rate limiting, deduplication (fallback to DB) |
| **DNS failure** | Station cannot resolve broker | BLE offline sessions, cached connections (if already connected) | New MQTT connections, firmware downloads |

### 7.2 Station Degradation Levels

Stations MUST implement at least three degradation levels:

#### Level 0 — Full Operation

All subsystems operational. MQTT connected. BLE advertising. All services available.

#### Level 1 — Network Degraded

MQTT disconnected but BLE operational.

- **Continues:** Active sessions, BLE handshake, offline sessions, meter reading, hardware control.
- **Stops:** Online session starts, reservations, real-time StatusNotification delivery.
- **Buffered:** StatusNotification, MeterValues, TransactionEvent — replayed on reconnection.
- **Entry trigger:** `1001 MQTT_CONNECTION_LOST` after 3 reconnection attempts.
- **Exit trigger:** Successful MQTT reconnect + BootNotification ACCEPTED.

#### Level 2 — Isolated Operation

Both MQTT and BLE non-functional, or station has no network and BLE is disabled.

- **Continues:** Active sessions (timer-based), hardware control, local logging.
- **Stops:** ALL new sessions (no way to authenticate users), all external communication.
- **Entry trigger:** `1001 MQTT_CONNECTION_LOST` + `1008 BLE_RADIO_ERROR`.
- **Exit trigger:** Either MQTT or BLE connectivity restored.

#### Level 3 — Faulted

Critical hardware or software error. Station is unsafe to operate.

- **Continues:** Network connectivity (for error reporting), LED/display error codes.
- **Stops:** ALL sessions, ALL bay operations, ALL service delivery.
- **Entry trigger:** `5001 PUMP_SYSTEM`, `5004 ELECTRICAL_SYSTEM`, `5009 EMERGENCY_STOP`, or `5101 FIRMWARE_ERROR` (after failed rollback).
- **Exit trigger:** Physical intervention + operator verification + station reboot.

### 7.3 Server Degradation Behavior

#### Payment Processor Unavailable

1. Server returns `4005 PAYMENT_FAILED` with `recoverable: true` for web payment and card top-up requests.
2. Wallet (credit) sessions continue normally — they do not depend on the payment processor.
3. Server sets internal flag `paymentProcessorAvailable: false`.
4. Mobile app: show "Card payments temporarily unavailable. Use your credit balance." if user has sufficient credits.
5. Web payment: show "Payment service temporarily unavailable. Please try again in a few minutes."
6. Server probes the payment processor every 30 seconds. On recovery, clear the flag and resume normal operation.

#### Station Unresponsive

1. After 3 consecutive `1010 MESSAGE_TIMEOUT` → station circuit breaker opens (§6.3).
2. Server marks station as "unresponsive" in the station registry.
3. New session requests for that station → `6002 ACK_TIMEOUT` immediately (no MQTT command sent).
4. Server continues monitoring Heartbeat. On next successful Heartbeat response → circuit breaker → HALF-OPEN → probe with a lightweight command (GetConfiguration).
5. If the station sent a ConnectionLost [MSG-011] (LWT) → mark as "offline" instead of "unresponsive". Different from timeout — LWT means definitive disconnection.

#### Database Degraded

1. Read operations: fall back to Redis cache or in-memory cache.
2. Write operations: queue to a write-ahead log; process when database recovers.
3. Session starts: MUST work (minimal DB write — session record creation is critical path).
4. Session history, transaction list, and report queries: return `6007 SERVICE_DEGRADED` or stale cached data with a `X-Data-Stale: true` header.

### 7.4 Refund Policies on Error

When errors occur during the session lifecycle, the following refund rules apply:

| Scenario | Error Code(s) | Refund Type | Amount |
|----------|:-------------:|-------------|:------:|
| Station NACK on StartService | 3001, 3002, 3003, 3004, 3009 | Full (credits or local currency) | 100% |
| All StartService retry attempts fail (web) | 1010, 6002 | Full (credits or local currency) | 100% |
| ACK_TIMEOUT (mobile) | 6002 | Full (credits) | 100% |
| Hardware error during active session | 5001–5009 | Partial (pro-rated) | Based on time delivered |
| Station offline during active session | 1001 (followed by session timeout) | Partial (pro-rated) | Based on time delivered |
| Pro-rated rule | — | Full if < 50% delivered | 100% if `actualDurationSeconds < 0.5 × durationSeconds` |
| Payment processor refund failure | 4007 | Manual refund queue | Per original amount |

---

## 8. Vendor-Specific Error Codes (9xxx)

### 8.1 Registration

Vendors MAY define custom error codes in the **9000–9999** range for proprietary diagnostics and hardware-specific conditions that are not covered by the standard OSPP error codes.

**Rules:**

1. Vendors MUST register a vendor prefix (2–6 uppercase characters, e.g., `ACME`).
2. The `vendorErrorCode` field MUST use the format `{VENDOR_PREFIX}_{code}` (e.g., `ACME_9001`).
3. Vendor codes MUST NOT overlap with standard OSPP codes (0000–8999).
4. Vendor codes SHOULD be documented in the vendor's implementation guide.
5. Receivers that do not recognize a vendor code MUST treat it as the corresponding generic code in the same severity level (e.g., treat an unknown Critical vendor code like `5000 HARDWARE_GENERIC`).

### 8.2 Vendor Error Object

```json
{
  "errorCode": 9001,
  "errorText": "ACME_PRESSURE_SENSOR_V2",
  "errorDescription": "AcmeCorp SSP-3000 secondary pressure sensor reads below 0.5 bar.",
  "severity": "Warning",
  "recoverable": true,
  "recommendedAction": "Check secondary pressure line. Primary sensor is operational.",
  "timestamp": "2026-01-30T14:00:00.000Z",
  "vendorErrorCode": "ACME_9001",
  "details": {
    "sensorId": "pressure_secondary",
    "reading": 0.42,
    "unit": "bar",
    "threshold": 0.5
  }
}
```

---

## Appendix A — Quick Reference (All Error Codes)

| Code | errorText | Severity | Cat. |
|:----:|-----------|:--------:|:----:|
| 1000 | `TRANSPORT_GENERIC` | Error | T |
| 1001 | `MQTT_CONNECTION_LOST` | Error | T |
| 1002 | `MQTT_PUBLISH_FAILED` | Error | T |
| 1003 | `TLS_HANDSHAKE_FAILED` | Critical | T |
| 1004 | `CERTIFICATE_ERROR` | Critical | T |
| 1005 | `INVALID_MESSAGE_FORMAT` | Error | T |
| 1006 | `UNKNOWN_ACTION` | Warning | T |
| 1007 | `PROTOCOL_VERSION_MISMATCH` | Error | T |
| 1008 | `BLE_RADIO_ERROR` | Warning | T |
| 1009 | `DNS_RESOLUTION_FAILED` | Error | T |
| 1010 | `MESSAGE_TIMEOUT` | Warning | T |
| 1011 | `URL_UNREACHABLE` | Error | T |
| 1012 | `MAC_VERIFICATION_FAILED` | Critical | T |
| 1013 | `MAC_MISSING` | Error | T |
| 1014 | `MESSAGE_TOO_LARGE` | Error | T |
| 2000 | `AUTH_GENERIC` | Error | A |
| 2001 | `STATION_NOT_REGISTERED` | Error | A |
| 2002 | `OFFLINE_PASS_INVALID` | Error | A |
| 2003 | `OFFLINE_PASS_EXPIRED` | Warning | A |
| 2004 | `OFFLINE_EPOCH_REVOKED` | Error | A |
| 2005 | `OFFLINE_COUNTER_REPLAY` | Critical | A |
| 2006 | `OFFLINE_STATION_MISMATCH` | Error | A |
| 2007 | `COMMAND_NOT_SUPPORTED` | Warning | A |
| 2008 | `ACTION_NOT_PERMITTED` | Error | A |
| 2009 | `JWT_EXPIRED` | Warning | A |
| 2010 | `JWT_INVALID` | Error | A |
| 2011 | `SESSION_TOKEN_EXPIRED` | Warning | A |
| 2012 | `SESSION_TOKEN_INVALID` | Error | A |
| 2013 | `BLE_AUTH_FAILED` | Error | A |
| 3000 | `SESSION_GENERIC` | Error | S |
| 3001 | `BAY_BUSY` | Warning | S |
| 3002 | `BAY_NOT_READY` | Warning | S |
| 3003 | `SERVICE_UNAVAILABLE` | Warning | S |
| 3004 | `INVALID_SERVICE` | Error | S |
| 3005 | `BAY_NOT_FOUND` | Error | S |
| 3006 | `SESSION_NOT_FOUND` | Error | S |
| 3007 | `SESSION_MISMATCH` | Error | S |
| 3008 | `DURATION_INVALID` | Error | S |
| 3009 | `HARDWARE_ACTIVATION_FAILED` | Error | S |
| 3010 | `MAX_DURATION_EXCEEDED` | Warning | S |
| 3011 | `BAY_MAINTENANCE` | Warning | S |
| 3012 | `RESERVATION_NOT_FOUND` | Error | S |
| 3013 | `RESERVATION_EXPIRED` | Warning | S |
| 3014 | `BAY_RESERVED` | Warning | S |
| 3015 | `PAYLOAD_INVALID` | Error | S |
| 3016 | `ACTIVE_SESSIONS_PRESENT` | Warning | S |
| 4000 | `PAYMENT_GENERIC` | Error | P |
| 4001 | `INSUFFICIENT_BALANCE` | Warning | P |
| 4002 | `OFFLINE_LIMIT_EXCEEDED` | Error | P |
| 4003 | `OFFLINE_RATE_LIMITED` | Warning | P |
| 4004 | `OFFLINE_PER_TX_EXCEEDED` | Error | P |
| 4005 | `PAYMENT_FAILED` | Error | P |
| 4006 | `PAYMENT_TIMEOUT` | Warning | P |
| 4007 | `REFUND_FAILED` | Error | P |
| 4008 | `WEBHOOK_SIGNATURE_INVALID` | Critical | P |
| 5000 | `HARDWARE_GENERIC` | Warning | H |
| 5001 | `PUMP_SYSTEM` | Critical | H |
| 5002 | `FLUID_SYSTEM` | Warning | H |
| 5003 | `CONSUMABLE_SYSTEM` | Warning | H |
| 5004 | `ELECTRICAL_SYSTEM` | Critical | H |
| 5005 | `PAYMENT_HARDWARE` | Warning | H |
| 5006 | `HEATING_SYSTEM` | Warning | H |
| 5007 | `MECHANICAL_SYSTEM` | Warning | H |
| 5008 | `SENSOR_FAILURE` | Warning | H |
| 5009 | `EMERGENCY_STOP` | Critical | H |
| 5014 | `DOWNLOAD_FAILED` | Error | H |
| 5015 | `CHECKSUM_MISMATCH` | Error | H |
| 5016 | `VERSION_ALREADY_INSTALLED` | Warning | H |
| 5017 | `INSUFFICIENT_STORAGE` | Error | H |
| 5018 | `INSTALLATION_FAILED` | Critical | H |
| 5019 | `UPLOAD_FAILED` | Error | H |
| 5020 | `INVALID_TIME_WINDOW` | Warning | H |
| 5021 | `NO_DIAGNOSTICS_AVAILABLE` | Warning | H |
| 5023 | `INVALID_CATALOG` | Error | H |
| 5024 | `UNSUPPORTED_SERVICE` | Warning | H |
| 5025 | `CATALOG_TOO_LARGE` | Error | H |
| 5100 | `SOFTWARE_GENERIC` | Error | H |
| 5101 | `FIRMWARE_ERROR` | Critical | H |
| 5102 | `CONFIGURATION_ERROR` | Error | H |
| 5103 | `STORAGE_ERROR` | Error | H |
| 5104 | `WATCHDOG_RESET` | Critical | H |
| 5105 | `MEMORY_ERROR` | Critical | H |
| 5106 | `CLOCK_ERROR` | Warning | H |
| 5107 | `OPERATION_IN_PROGRESS` | Warning | H |
| 5108 | `CONFIGURATION_KEY_READONLY` | Error | H |
| 5109 | `INVALID_CONFIGURATION_VALUE` | Error | H |
| 5110 | `RESET_FAILED` | Critical | H |
| 5111 | `BUFFER_FULL` | Critical | H |
| 5112 | `FIRMWARE_SIGNATURE_INVALID` | Critical | H |
| 6000 | `SERVER_GENERIC` | Error | X |
| 6001 | `SERVER_INTERNAL_ERROR` | Error | X |
| 6002 | `ACK_TIMEOUT` | Warning | X |
| 6003 | `STATION_OFFLINE` | Warning | X |
| 6004 | `VALIDATION_ERROR` | Error | X |
| 6005 | `SESSION_ALREADY_ACTIVE` | Warning | X |
| 6006 | `RATE_LIMIT_EXCEEDED` | Warning | X |
| 6007 | `SERVICE_DEGRADED` | Info | X |

**Category legend:** T = Transport, A = Auth, S = Session, P = Payment, H = Hardware/Software, X = Server.

---

## Appendix B — Timeout Quick Reference

This table consolidates all timeout values from the protocol for implementer reference.

| Phase / Operation | Timeout | Error on Timeout | Recovery |
|-------------------|:-------:|:----------------:|----------|
| BootNotification | 30s | `1010` | Wait 60s, retry |
| Heartbeat | 30s (keep-alive) | `1010` / `1001` (3 missed → disconnect) | Reconnect with backoff |
| ReserveBay | 5s | `1010` | Session → `failed` |
| Reserved → 3DS (web) | 3 min | — | CancelReservation → `failed` |
| Reserved → payment (mobile) | 30s | — | CancelReservation → `failed` |
| StartService (per attempt) | 10s | `1010` / `6002` | Refund (mobile) or retry (web) |
| StopService | 10s | `1010` | Session → `failed`, station auto-stops |
| Reset | 30s | `1010` | Log failure, operator action |
| ChangeConfiguration | 60s | `1010` | Log failure, retry later |
| GetConfiguration | 30s | `1010` | Use cached values |
| SetMaintenanceMode | 30s | `1010` | Log failure, operator action |
| UpdateFirmware | 300s | `1010` | Log failure, operator action |
| GetDiagnostics | 300s | `1010` | Log failure, operator action |
| UpdateServiceCatalog | 30s | `1010` | Use cached catalog |
| Session token (web) | 10 min | `2011` | Restart payment flow |
| BayLock fallback | 3 min | — | Auto-released |
| PaymentIntent pending | 5 min | `4006` | Mark expired |
| BLE scan | 10–30s | `1008` | Return to IDLE |
| BLE handshake (per step) | 10s | `2013` | ERROR state |
| BLE GATT connect | 5s per attempt | `1008` | Retry (3 attempts) |
| MQTT reconnect (cap) | 30s | — | Continue backoff |
| Station max offline | 72 hours | — | Enter degraded mode (Level 2) |

---

## Appendix C — Error Code JSON Schema

The following JSON Schema validates error objects in OSPP messages.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ospp-standard.org/schemas/v1/error.json",
  "title": "OSPP Error Object",
  "description": "Standard error object included in REJECTED responses and error events.",
  "type": "object",
  "required": [
    "errorCode",
    "errorText",
    "errorDescription",
    "severity",
    "recoverable",
    "recommendedAction",
    "timestamp"
  ],
  "properties": {
    "errorCode": {
      "type": "integer",
      "minimum": 1000,
      "maximum": 9999,
      "description": "Numeric error code from the OSPP error code registry."
    },
    "errorText": {
      "type": "string",
      "pattern": "^[A-Z][A-Z0-9_]+$",
      "description": "Machine-readable error name in UPPER_SNAKE_CASE."
    },
    "errorDescription": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Human-readable description of the error."
    },
    "severity": {
      "type": "string",
      "enum": ["Critical", "Error", "Warning", "Info"],
      "description": "Error severity level."
    },
    "recoverable": {
      "type": "boolean",
      "description": "Whether the error can be resolved without manual intervention."
    },
    "recommendedAction": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Suggested corrective action."
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp of when the error occurred."
    },
    "vendorErrorCode": {
      "type": "string",
      "pattern": "^[A-Z]{2,6}_\\d{4}$",
      "description": "Optional vendor-specific error code."
    },
    "details": {
      "type": "object",
      "description": "Optional additional context (validation errors, threshold values, etc.).",
      "additionalProperties": true
    }
  },
  "additionalProperties": false
}
```
