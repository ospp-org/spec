# Chapter 03 — Message Catalog

> **Status:** Draft | **OSPP Version:** 0.20.0

This chapter is the normative reference for **every message** in the OSPP protocol. Each message is documented with its complete payload schema, metadata, and example.

For the **message envelope**, wire format, message types (REQUEST / RESPONSE / EVENT), serialization rules, correlation, timestamps, and HMAC-SHA256 signing, see the Conventions section below.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

---

## Conventions

### MQTT Messages

All MQTT messages are wrapped in the standard OSPP envelope (see the [Conventions](#conventions) section below). The payload tables below document only the **`payload` field** of the envelope. The envelope fields (`messageId`, `messageType`, `action`, `timestamp`, `source`, `protocolVersion`) are always present. The `mac` field is present on **every** message except the three that structurally cannot carry one — BootNotification REQUEST, BootNotification RESPONSE, ConnectionLost (LWT) — and is absent everywhere under the development-only `None` signing mode. See [Chapter 06 §5.6](06-security.md#56-message-signing-classification).

MQTT topics follow the patterns defined in [Chapter 02 — Transport](02-transport.md), Section 2:

| Direction | Topic Pattern |
|-----------|---------------|
| Station → Server | `ospp/v1/stations/{station_id}/to-server` |
| Server → Station | `ospp/v1/stations/{station_id}/to-station` |

All MQTT messages use **QoS 1** (at-least-once delivery).

### BLE Messages

BLE messages are JSON payloads written to or read from GATT characteristics (see [Chapter 02 — Transport](02-transport.md), Section 8). BLE messages do **not** use the MQTT envelope. Each BLE message includes a `type` field for identification.

| Characteristic | UUID | Direction | Properties |
|----------------|------|-----------|------------|
| Station Info | `0000FFF1-...` | Station → App | Read |
| Available Services | `0000FFF2-...` | Station → App | Read |
| TX Request | `0000FFF3-...` | App → Station | Write |
| TX Response | `0000FFF4-...` | Station → App | Notify |
| Service Status | `0000FFF5-...` | Station → App | Notify |
| Receipt | `0000FFF6-...` | Station → App | Read |

### Per-Message Documentation

Each message below includes:

| Attribute | Description |
|-----------|-------------|
| **Direction** | Which component sends to which |
| **Transport** | MQTT or BLE |
| **Message Type** | REQUEST, RESPONSE, EVENT (MQTT), or Read/Write/Notify (BLE) |
| **Topic / Characteristic** | MQTT topic pattern or BLE GATT UUID |
| **Trigger** | What causes this message to be sent |
| **Expected Response** | What response is expected (if any) |
| **Timeout** | How long the sender waits for a response |
| **Idempotency** | Whether the message can be safely retried |
| **Message Expiry** | MQTT Message Expiry Interval (MQTT only) |

### Field Table Conventions

- **Required** column: `Yes` = MUST be present, `No` = MAY be omitted, `Cond.` = conditionally required (see Description)
- All field names use **camelCase**
- All string enumerations are **PascalCase** (e.g., `"Accepted"`, `"Available"`)
- All timestamps are **ISO 8601 UTC with milliseconds** (e.g., `"2026-01-30T12:00:00.000Z"`)
- All identifiers follow the pattern `{type}_{uuid}` (e.g., `stn_a1b2c3d4`, `bay_c1d2e3f4a5b6`)
- Integer units are documented in the Description column
- Canonical JSON serialization for cryptographic operations (HMAC, ECDSA receipt signing, OfflinePass signing) follows the **OSPP Canonical Form** defined in [`06-security.md §4.8`](06-security.md). All signature primitives in OSPP — present and future — MUST use this single canonical form.

---

## Quick Reference

### MQTT Messages (27 actions)

| # | Action | Direction | Type | Category | Timeout |
|--:|--------|-----------|------|----------|--------:|
| 1 | [BootNotification](#11-bootnotification) | Station → Server | REQ/RES | Provisioning | 30s |
| 2 | [AuthorizeOfflinePass](#21-authorizeofflinepass) | Station → Server | REQ/RES | Auth | 15s |
| 3 | [ReserveBay](#31-reservebay) | Server → Station | REQ/RES | Session | 5s |
| 4 | [CancelReservation](#32-cancelreservation) | Server → Station | REQ/RES | Session | 5s |
| 5 | [StartService](#33-startservice) | Server → Station | REQ/RES | Session | 10s |
| 6 | [StopService](#34-stopservice) | Server → Station | REQ/RES | Session | 10s |
| 7 | [TransactionEvent](#41-transactionevent) | Station → Server | REQ/RES | Payment | 60s |
| 8 | [Heartbeat](#51-heartbeat) | Station → Server | REQ/RES | Status | 30s |
| 9 | [StatusNotification](#52-statusnotification) | Station → Server | EVENT | Status | — |
| 10 | [MeterValues](#53-metervalues) | Station → Server | EVENT | Status | — |
| 11 | [SessionEnded](#54-sessionended) | Station → Server | EVENT | Status | — |
| 12 | [ConnectionLost](#55-connectionlost) | Broker → Server | EVENT (LWT) | Status | — |
| 13 | [SecurityEvent](#56-securityevent) | Station → Server | EVENT | Status | — |
| 14 | [ChangeConfiguration](#61-changeconfiguration) | Server → Station | REQ/RES | Config | 60s |
| 15 | [GetConfiguration](#62-getconfiguration) | Server → Station | REQ/RES | Config | 30s |
| 16 | [Reset](#63-reset) | Server → Station | REQ/RES | Config | 30s |
| 17 | [UpdateFirmware](#64-updatefirmware) | Server → Station | REQ/RES | Firmware | 300s |
| 18 | [FirmwareStatusNotification](#65-firmwarestatusnotification) | Station → Server | EVENT | Firmware | — |
| 19 | [GetDiagnostics](#66-getdiagnostics) | Server → Station | REQ/RES | Config | 300s |
| 20 | [DiagnosticsNotification](#67-diagnosticsnotification) | Station → Server | EVENT | Config | — |
| 21 | [SetMaintenanceMode](#68-setmaintenancemode) | Server → Station | REQ/RES | Config | 30s |
| 22 | [UpdateServiceCatalog](#69-updateservicecatalog) | Server → Station | REQ/RES | Config | 30s |
| 23 | [SignCertificate](#610-signcertificate) | Station → Server | REQ/RES | Security | 30s |
| 24 | [CertificateInstall](#611-certificateinstall) | Server → Station | REQ/RES | Security | 30s |
| 25 | [TriggerCertificateRenewal](#612-triggercertificaterenewal) | Server → Station | REQ/RES | Security | 10s |
| 26 | [DataTransfer](#613-datatransfer) | Bidirectional | REQ/RES | Core | 30s |
| 27 | [TriggerMessage](#614-triggermessage) | Server → Station | REQ/RES | Core | 10s |

### BLE Messages (13 message types)

| # | Message | Direction | Characteristic | Category |
|--:|---------|-----------|----------------|----------|
| 27 | [StationInfo](#71-stationinfo-fff1) | Station → App | FFF1 (Read) | Offline |
| 28 | [AvailableServices](#72-availableservices-fff2) | Station → App | FFF2 (Read) | Offline |
| 29 | [HELLO](#73-hello) | App → Station | FFF3 (Write) | Offline |
| 30 | [CHALLENGE](#74-challenge) | Station → App | FFF4 (Notify) | Offline |
| 31 | [OfflineAuthRequest](#75-offlineauthrequest) | App → Station | FFF3 (Write) | Offline |
| 32 | [ServerSignedAuth](#76-serversignedauth) | App → Station | FFF3 (Write) | Offline |
| 33 | [AuthResponse](#77-authresponse) | Station → App | FFF4 (Notify) | Offline |
| 34 | [StartServiceRequest](#78-startservicerequest) | App → Station | FFF3 (Write) | Offline |
| 35 | [StartServiceResponse](#79-startserviceresponse) | Station → App | FFF4 (Notify) | Offline |
| 36 | [StopServiceRequest](#710-stopservicerequest) | App → Station | FFF3 (Write) | Offline |
| 37 | [StopServiceResponse](#711-stopserviceresponse) | Station → App | FFF4 (Notify) | Offline |
| 38 | [ServiceStatus](#712-servicestatus-fff5) | Station → App | FFF5 (Notify) | Offline |
| 39 | [Receipt](#713-receipt-fff6) | Station → App | FFF6 (Read) | Offline |

---

#### Implicit Error Codes

> The following error codes are implicit for ALL Server→Station REQUEST messages and are not repeated in individual error tables:
> - `1005 INVALID_MESSAGE_FORMAT` — request payload schema violation
> - `2007 COMMAND_NOT_SUPPORTED` — station does not implement feature
> - `6001 SERVER_INTERNAL_ERROR` — server-side processing failure
>
> Individual message error tables below list only message-specific error codes.

## 1. Provisioning

### 1.1 BootNotification

| Property | Value |
|----------|-------|
| **Direction** | Station → Server (REQUEST), Server → Station (RESPONSE) |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-server` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-station` |
| **Trigger** | Station connects or reconnects to the MQTT broker |
| **Expected Response** | BootNotification RESPONSE |
| **Timeout** | 30 seconds; on timeout, wait 60 seconds and retry |
| **Idempotency** | Yes — server MUST accept duplicate BootNotification and respond identically |
| **Message Expiry** | Never (exempt from message expiry) |

The station MUST send a BootNotification REQUEST immediately after subscribing to its `to-station` topic on every MQTT connection. Until it receives an `Accepted` response the station MUST NOT send any message it originates — any EVENT, or any REQUEST other than BootNotification. The one further exception is SignCertificate [MSG-022] while `Pending`: renewing its own certificate repairs the station's standing rather than reporting on its work, and `Pending` is the only restricted state holding the session key that message must be signed with ([Chapter 05 §1.4](05-state-machines.md#14-the-restricted-states) is normative). A RESPONSE to a server command is permitted while `Pending`, which is the restricted state in which the station answers commands ([Chapter 05 §1.4](05-state-machines.md#14-the-restricted-states)).

> **Note:** BootNotification declares the station's bay **topology** — which bays exist and which program ordinals each has — but not bay *status* or program *availability*. Those are reported via [StatusNotification](#52-statusnotification) events sent immediately after a successful boot.

The station MAY include a human-readable name configurable via `StationName` (see §8 Configuration).

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `stationId` | string | Yes | Station identifier (`stn_{uuid}`) |
| `firmwareVersion` | string | Yes | Current firmware version (semver, e.g., `"1.2.3"`) |
| `stationModel` | string | Yes | Hardware model name (e.g., `"SSP-3000"`) |
| `stationVendor` | string | Yes | Manufacturer name (e.g., `"AcmeCorp"`) |
| `serialNumber` | string | Yes | Hardware serial number |
| `bays` | array | Yes | Re-declared physical topology; one entry per bay, each `{bayNumber, programNumbers[]}`. Max 64 bays, 32 programs/bay |
| `uptimeSeconds` | integer | Yes | Seconds since last boot (>= 0) |
| `pendingOfflineTransactions` | integer | Yes | Count of unsynced offline transactions (>= 0) |
| `timezone` | string | Yes | IANA timezone identifier (e.g., `"Europe/London"`), configurable via `TimeZone` (see §8 Configuration) |
| `bootReason` | string | Yes | Reason this BootNotification was sent — see enum below. Seven values name a boot; `Reconnect` names the case where none occurred |
| `capabilities` | object | Yes | Station capabilities |
| `capabilities.bleSupported` | boolean | Yes | BLE hardware available and enabled |
| `capabilities.offlineModeSupported` | boolean | Yes | Station can handle offline sessions |
| `capabilities.meterValuesSupported` | boolean | Yes | Station has consumption sensors |
| `capabilities.deviceManagementSupported` | boolean | No | Station supports the Device Management profile |
| `networkInfo` | object | Yes | Network connection info |
| `networkInfo.connectionType` | string | Yes | `"Ethernet"`, `"Wifi"`, or `"Cellular"` |
| `networkInfo.signalStrength` | integer | No | Signal strength in dBm (`null` for Ethernet) |

> **Absent capabilities are NOT STATED, not `false`.** A capability omitted from the `capabilities` object **MUST NOT** overwrite a value the station declared previously — only an explicit `false` records a negative. See [Core profile — BootNotification §5.1](profiles/core/boot-notification.md) for the full rule, which applies to every member of the object.

**`bootReason` enum values:**

| Value | Description |
|-------|-------------|
| `PowerOn` | Initial power-on |
| `Watchdog` | Watchdog timer triggered reboot |
| `FirmwareUpdate` | Reboot after firmware update |
| `RemoteReset` | Reboot the server commanded via Reset [MSG-015] — a return it asked for, not a spontaneous one |
| `ManualReset` | A human acting at the station |
| `ScheduledReset` | The station's own scheduled restart |
| `ErrorRecovery` | Automatic recovery from an error state — the firmware **did** restart |
| `Reconnect` | **No boot occurred.** The firmware never restarted; only the MQTT session is new. See below |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"`, `"Rejected"`, or `"Pending"` |
| `serverTime` | string | Yes | Server UTC time (ISO 8601) for clock synchronization |
| `heartbeatIntervalSec` | integer | Yes | Heartbeat interval in seconds (range: 10–3600 seconds) (e.g., `30`) |
| `retryInterval` | integer | Cond. | Seconds to wait before retry (REQUIRED when `Rejected` or `Pending`) |
| `errorCode` | integer | Cond. | OSPP error code explaining the outcome (1000–9999). REQUIRED when `Rejected`. Carried on a `Pending` response when the reason is `3018 TOPOLOGY_MISMATCH`. |
| `errorText` | string | Cond. | Machine-readable error name in `UPPER_SNAKE_CASE`. REQUIRED when `Rejected`; accompanies `errorCode` whenever that is present. |
| `configuration` | object | No | Key-value pairs to apply immediately (see [Chapter 08](08-configuration.md)) |
| `sessionKey` | string | Cond. | Base64-encoded 32-byte HMAC session key. **REQUIRED on every `Accepted` and every `Pending` response**, unconditionally — a `Pending` station answers signed commands. Absent on `Rejected`. See [Core profile §5.3](profiles/core/boot-notification.md) |
| `supportedVersions` | array | Cond. | Protocol versions supported by server. Array of semver strings (e.g., `["0.1.0", "0.2.0"]`). REQUIRED when `Rejected` with error `1007 PROTOCOL_VERSION_MISMATCH` — [`boot-notification.md` §6](profiles/core/boot-notification.md). Unlike the sibling rows in this table, this condition is stated only in prose: the response schema carries no `if`/`then` for it. |
| `details` | object | Cond. | Diagnostic detail for `errorCode`. REQUIRED on a `Pending` response carrying `3018 TOPOLOGY_MISMATCH`, where it carries `expected` and `declared` — the provisioned topology and the one this boot declared, each shaped like the request's `bays[]`. Absent otherwise. The object is **closed**, like every other object in this schema set: a future error code that needs its own detail adds its member to the schema. |

**`status` behavior:**

| Status | Station Action |
|--------|---------------|
| `Accepted` | Sync clock → apply configuration → send StatusNotification per bay → start heartbeat → enter normal operation |
| `Rejected` | Enter the `Rejected` restricted state — refuse commands, send nothing but retries, serve no customers → wait `retryInterval` seconds → retry BootNotification |
| `Pending` | Enter the `Pending` restricted state — **answer** commands, originate nothing but BootNotification retries and a SignCertificate [MSG-022] renewal, refuse StartService/ReserveBay with `3002 BAY_NOT_READY` → wait `retryInterval` seconds → retry BootNotification. See [Chapter 05 §1.4](05-state-machines.md#14-the-restricted-states) |

**Heartbeat interval precedence:** If both `heartbeatIntervalSec` (dedicated field) and `configuration.HeartbeatIntervalSeconds` (config map) are present, the dedicated field `heartbeatIntervalSec` takes precedence. Stations MUST use the dedicated field value and SHOULD ignore the config map entry for this key.

#### Example

**REQUEST** (full envelope shown; subsequent examples show payload only):

```json
{
  "messageId": "boot_550e8400-e29b-41d4-a716-446655440000",
  "messageType": "Request",
  "action": "BootNotification",
  "timestamp": "2026-01-30T12:00:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "firmwareVersion": "1.2.3",
    "stationModel": "SSP-3000",
    "stationVendor": "AcmeCorp",
    "serialNumber": "WT-2026-001",
    "bays": [
      { "bayNumber": 1, "programNumbers": [1, 2, 3] },
      { "bayNumber": 2, "programNumbers": [1, 2, 3] },
      { "bayNumber": 3, "programNumbers": [1, 2, 3] }
    ],
    "uptimeSeconds": 0,
    "pendingOfflineTransactions": 2,
    "timezone": "Europe/London",
    "bootReason": "PowerOn",
    "capabilities": {
      "bleSupported": true,
      "offlineModeSupported": true,
      "meterValuesSupported": true,
      "deviceManagementSupported": true
    },
    "networkInfo": {
      "connectionType": "Ethernet",
      "signalStrength": null
    }
  }
}
```

**RESPONSE (Accepted):**

```json
{
  "status": "Accepted",
  "serverTime": "2026-01-30T12:00:00.123Z",
  "heartbeatIntervalSec": 30,
  "configuration": {
    "RevocationEpoch": "42",
    "MaxSessionDurationSeconds": "900"
  },
  "sessionKey": "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciBITUFD..."
}
```

**RESPONSE (Rejected):**

```json
{
  "status": "Rejected",
  "serverTime": "2026-01-30T12:00:00.123Z",
  "heartbeatIntervalSec": 30,
  "retryInterval": 60,
  "errorCode": 2001,
  "errorText": "STATION_NOT_REGISTERED"
}
```

**RESPONSE (Rejected — protocol version mismatch):**

```json
{
  "status": "Rejected",
  "serverTime": "2026-01-30T12:00:00.123Z",
  "heartbeatIntervalSec": 30,
  "retryInterval": 60,
  "errorCode": 1007,
  "errorText": "PROTOCOL_VERSION_MISMATCH",
  "supportedVersions": ["0.1.0", "0.2.0"]
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `1005` | `INVALID_MESSAGE_FORMAT` — request is not valid JSON or missing required fields |
| `1007` | `PROTOCOL_VERSION_MISMATCH` — the declared `protocolVersion` is not in the server's supported set. Exact match; a shared MAJOR implies nothing |
| `2001` | `STATION_NOT_REGISTERED` — station unknown to server |
| `3018` | `TOPOLOGY_MISMATCH` — the declared `bays[]` disagrees with the provisioned topology. Carried on a **`Pending`** response, never `Rejected`, with `details` |
| `6001` | `SERVER_INTERNAL_ERROR` — server encountered an unexpected error during processing |

> **Signing note:** Both directions of BootNotification are **exempt** from HMAC-SHA256 signing. The REQUEST is exempt because the session key has not yet been established. The RESPONSE is exempt because its MAC would be cryptographically void — the `sessionKey` that would verify it is delivered *in* that message; delivery integrity is provided by mTLS, not HMAC.

---

## 2. Authentication & Authorization

### 2.1 AuthorizeOfflinePass

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-server` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-station` |
| **Trigger** | Partial B scenario — station receives an OfflinePass via BLE from a mobile app while the station is online |
| **Expected Response** | AuthorizeOfflinePass RESPONSE |
| **Timeout** | 15 seconds |
| **Idempotency** | Yes — server MUST return the same result for the same `offlinePassId` |
| **Message Expiry** | 30 seconds (no [`02-transport.md` §5.1](02-transport.md) category covers this action; Appendix B is the cross-check) |

In the **Partial B** offline scenario (phone offline, station online), the mobile app presents an OfflinePass to the station via BLE. The station forwards it to the server for real-time validation instead of performing local validation.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `offlinePassId` | string | Yes | OfflinePass identifier (`opass_{uuid}`) |
| `offlinePass` | object | Yes | Complete OfflinePass object (see [Chapter 06 — Security](06-security.md)) |
| `deviceId` | string | Yes | Mobile device identifier from BLE Hello |
| `counter` | integer | Yes | Monotonically increasing counter (anti-replay) |
| `bayId` | string | Yes | Target bay identifier (`bay_{uuid}`) |
| `serviceId` | string | Yes | Requested service identifier (`svc_{id}`) |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `sessionId` | string | Cond. | Server-assigned session ID (when `Accepted`) |
| `durationSeconds` | integer | Cond. | Authorized session duration in seconds (when `Accepted`) |
| `creditsAuthorized` | integer | Cond. | Maximum credits authorized for this session (when `Accepted`) |
| `reason` | string | Cond. | Rejection reason (when `Rejected`) — see error codes below |

#### Example

**REQUEST payload:**

```json
{
  "offlinePassId": "opass_a8b9c0d1e2f3",
  "offlinePass": {
    "passId": "opass_a8b9c0d1e2f3",
    "sub": "sub_xyz789",
    "deviceId": "device_uuid_123",
    "issuedAt": "2026-02-05T10:00:00.000Z",
    "expiresAt": "2026-02-06T10:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30,
      "allowedServiceTypes": [
        "svc_eco",
        "svc_standard"
      ]
    },
    "constraints": {
      "minIntervalSec": 60,
      "stationOfflineWindowHours": 72,
      "stationMaxOfflineTx": 100
    },
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEUCIQDXKT0ewRBp/nkPY/qh6mBjwSn4BE7fmjDTdjcP1dhIyQIgPyXM1VnFZtrG6WaOgpRwiQIeFF2I2zeFsb05dyel1rE="
  },
  "deviceId": "device_uuid_123",
  "counter": 5,
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco"
}
```

**RESPONSE (Accepted):**

```json
{
  "status": "Accepted",
  "sessionId": "sess_f1a2b3c4e5d6",
  "durationSeconds": 300,
  "creditsAuthorized": 30
}
```

**RESPONSE (Rejected):**

```json
{
  "status": "Rejected",
  "reason": "OFFLINE_PASS_EXPIRED"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `1005` | `INVALID_MESSAGE_FORMAT` — request is not valid JSON or missing required fields |
| `2002` | `OFFLINE_PASS_INVALID` — signature verification failed |
| `2003` | `OFFLINE_PASS_EXPIRED` — pass has expired |
| `2004` | `OFFLINE_EPOCH_REVOKED` — revocation epoch is newer than pass epoch |
| `2005` | `OFFLINE_COUNTER_REPLAY` — counter replay detected |
| `2006` | `OFFLINE_STATION_MISMATCH` — OfflinePass stationId constraint does not match |
| `4002` | `OFFLINE_LIMIT_EXCEEDED` — max uses or max credits exceeded |
| `4003` | `OFFLINE_RATE_LIMITED` — min interval between transactions not met |
| `4004` | `OFFLINE_PER_TX_EXCEEDED` — per-transaction credit limit exceeded |
| `6001` | `SERVER_INTERNAL_ERROR` — server-side processing failure |

---

## 3. Session Management

### 3.1 ReserveBay

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Web payment initiation (`POST /pay/{code}/start`) or mobile app pre-reservation |
| **Expected Response** | ReserveBay RESPONSE |
| **Timeout** | 5 seconds |
| **Idempotency** | Yes, bounded — a request naming the reservation the bay currently holds, with an **identical** payload, MUST return the same `Accepted` without restarting the timer. A differing payload under that `reservationId` is not a repeat (→ `3014`); an already-expired one is `3013` and an already-consumed one is `3012`. See [`reserve-bay.md` §5.1](profiles/transaction/reserve-bay.md) rules 7--9, which govern |
| **Message Expiry** | 30 seconds |

Reserves a specific bay for an upcoming session. The station MUST transition the bay to `Reserved` status and reject any other StartService or ReserveBay commands for that bay until the reservation expires or is cancelled.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `bayId` | string | Yes | Target bay identifier (`bay_{uuid}`) |
| `reservationId` | string | Yes | Unique reservation identifier (`rsv_{uuid}`) |
| `expirationTime` | string | Yes | ISO 8601 UTC — when the reservation automatically expires |
| `sessionSource` | string | Yes | `"MobileApp"` or `"WebPayment"` |

The default reservation TTL is configured by the `ReservationDefaultTTL` key (default: 300 seconds). The station MUST automatically release the reservation when `expirationTime` is reached.

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error code name (when `Rejected`) |

#### Example

**REQUEST payload:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "reservationId": "rsv_e5f6a7b8c9d0",
  "expirationTime": "2026-01-30T12:03:00.000Z",
  "sessionSource": "WebPayment"
}
```

**RESPONSE (Accepted):**

```json
{
  "status": "Accepted"
}
```

**RESPONSE (Rejected):**

```json
{
  "status": "Rejected",
  "errorCode": 3001,
  "errorText": "BAY_BUSY"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `3001` | `BAY_BUSY` — bay is currently occupied |
| `3002` | `BAY_NOT_READY` — bay hardware not ready |
| `3005` | `BAY_NOT_FOUND` — unknown bay identifier |
| `3011` | `BAY_MAINTENANCE` — bay is in maintenance mode |
| `3012` | `RESERVATION_NOT_FOUND` — the `reservationId` was already consumed by a StartService |
| `3013` | `RESERVATION_EXPIRED` — the `reservationId` was already expired by the station |
| `3014` | `BAY_RESERVED` — bay reserved under a different `reservationId`, or under the same one with differing terms |

> Other hardware codes from the `5000–5009` range MAY also apply depending on station capabilities.

---

### 3.2 CancelReservation

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Reservation timeout, user cancels, or payment failure |
| **Expected Response** | CancelReservation RESPONSE |
| **Timeout** | 5 seconds |
| **Idempotency** | Yes — Cancelling an already-cancelled reservation **MUST** return `Accepted`. If the reservation has expired, the station **MUST** respond with `3013 RESERVATION_EXPIRED`. |
| **Message Expiry** | 30 seconds |

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |
| `reservationId` | string | Yes | Reservation to cancel (`rsv_{uuid}`) |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error code name (when `Rejected`) |

#### Example

**REQUEST payload:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "reservationId": "rsv_e5f6a7b8c9d0"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `3005` | `BAY_NOT_FOUND` — unknown bay identifier |
| `3012` | `RESERVATION_NOT_FOUND` — no reservation with that ID has ever existed on the bay, or it was already consumed by a StartService. An **already-cancelled** reservation returns `Accepted` (idempotent) and an **expired** one returns `3013` — see [cancel-reservation.md §5](profiles/transaction/cancel-reservation.md) rules 2, 3 and 6 |
| `3013` | `RESERVATION_EXPIRED` — reservation has already expired |

---

### 3.3 StartService

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Mobile app session start (`POST /sessions/start`) or web payment captured |
| **Expected Response** | StartService RESPONSE |
| **Timeout** | 10 seconds |
| **Idempotency** | Yes — same `sessionId` MUST return same result; station MUST NOT start the service twice |
| **Message Expiry** | 30 seconds |

Instructs the station to activate a specific service on a bay. The station MUST validate bay availability, activate the hardware, and transition the bay to `Occupied` status.

**Retry policy (web payment):** Server retries up to 4 times with delays of 0s, +5s, +10s, +15s. If all retries fail, the server sends [CancelReservation](#32-cancelreservation) and initiates a refund.

**Retry policy (mobile app):** Single attempt with 10s timeout. On failure, full refund.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `sessionId` | string | Yes | Server-assigned session identifier (`sess_{uuid}`) |
| `bayId` | string | Yes | Target bay identifier (`bay_{uuid}`) |
| `serviceId` | string | Yes | Catalog service to activate (`svc_{id}`) — the commercial offering |
| `programNumber` | integer | Yes | Ordinal of the physical program to run on that bay, as the station declared it. Rejected with `3017 PROGRAM_NOT_DECLARED` if the bay never declared it |
| `durationSeconds` | integer | Yes | Maximum session duration in seconds |
| `sessionSource` | string | Yes | `"MobileApp"` or `"WebPayment"` |
| `reservationId` | string | No | Reservation to consume (`rsv_{uuid}`), if bay was reserved |
| `params` | object | No | Service-specific parameters (reserved for future use) |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error code name (when `Rejected`) |
| `programNumber` | integer | Cond. | **Echo** of the requested ordinal (when `Rejected`), so the refusal names what it refused |

Upon `Accepted`, the station MUST:
1. Activate the hardware for the specified service
2. Send a [StatusNotification](#52-statusnotification) with `status: "Occupied"`
3. Start the session timer for `durationSeconds`
4. Begin sending periodic [MeterValues](#53-metervalues) if `meterValuesSupported` is `true`

#### Example

**REQUEST payload:**

```json
{
  "sessionId": "sess_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "programNumber": 2,
  "durationSeconds": 300,
  "sessionSource": "MobileApp",
  "reservationId": "rsv_e5f6a7b8c9d0",
  "params": {}
}
```

**RESPONSE (Accepted):**

```json
{
  "status": "Accepted"
}
```

**RESPONSE (Rejected):**

```json
{
  "status": "Rejected",
  "errorCode": 3001,
  "errorText": "BAY_BUSY"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `3001` | `BAY_BUSY` — bay is occupied by another session |
| `3002` | `BAY_NOT_READY` — bay hardware not ready |
| `3003` | `SERVICE_UNAVAILABLE` — service is temporarily disabled |
| `3004` | `INVALID_SERVICE` — service ID not in station catalog |
| `3005` | `BAY_NOT_FOUND` — unknown bay identifier |
| `3006` | `SESSION_NOT_FOUND` — the `sessionId` names an already completed or failed session |
| `3008` | `DURATION_INVALID` — duration <= 0 or exceeds limits |
| `3009` | `HARDWARE_ACTIVATION_FAILED` — hardware failed to start |
| `3010` | `MAX_DURATION_EXCEEDED` — exceeds `MaxSessionDurationSeconds` config |
| `3011` | `BAY_MAINTENANCE` — bay is in maintenance mode |
| `3012` | `RESERVATION_NOT_FOUND` — referenced reservation does not exist |
| `3013` | `RESERVATION_EXPIRED` — reservation has expired |
| `3014` | `BAY_RESERVED` — bay reserved by a different session |
| `5001` | `PUMP_SYSTEM` — pump hardware fault detected |
| `5004` | `ELECTRICAL_SYSTEM` — electrical system fault detected |

> Other hardware codes from the `5000–5009` range MAY also apply depending on station capabilities.

---

### 3.4 StopService

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | User stops session (`POST /sessions/{id}/stop`) or server-initiated stop |
| **Expected Response** | StopService RESPONSE |
| **Timeout** | 10 seconds |
| **Idempotency** | Yes — stopping an already-stopped session MUST return the final result |
| **Message Expiry** | 30 seconds |

Instructs the station to stop an active service. The station MUST deactivate the hardware and report the final duration and consumption.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `sessionId` | string | Yes | Session to stop (`sess_{uuid}`) |
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `actualDurationSeconds` | integer | Cond. | Actual service duration in seconds (when `Accepted`) |
| `creditsCharged` | integer | Cond. | Total credits charged (when `Accepted`) |
| `meterValues` | object | No | Final meter readings (when `Accepted` and meters available) |
| `meterValues.liquidMl` | integer | No | Total liquid consumed in milliliters |
| `meterValues.consumableMl` | integer | No | Total consumable consumed in milliliters |
| `meterValues.energyWh` | integer | No | Total energy consumed in watt-hours |
| `finalSeqNo` | integer | No | Canonical session-final `seqNo` marker. Set when the station has emitted any `seqNo`-bearing events for this session; the server discards later MeterValues whose `seqNo` exceeds it (see [`02-transport.md` §3.2](02-transport.md)) |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error code name (when `Rejected`) |

Upon `Accepted`, the station MUST:
1. Deactivate the hardware
2. Send a [StatusNotification](#52-statusnotification) with `status: "Finishing"`
3. After hardware wind-down, send a [StatusNotification](#52-statusnotification) with `status: "Available"`

**Credits charged formula:** `creditsCharged = ceil(actualDurationSeconds / 60 * priceCreditsPerMinute)` for `PerMinute` pricing, or `priceCreditsFixed` for `Fixed` pricing.

#### Example

**REQUEST payload:**

```json
{
  "sessionId": "sess_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6"
}
```

**RESPONSE (Accepted):**

```json
{
  "status": "Accepted",
  "actualDurationSeconds": 298,
  "creditsCharged": 50,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  }
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `3005` | `BAY_NOT_FOUND` — unknown bay identifier |
| `3006` | `SESSION_NOT_FOUND` — no active session with this ID |
| `3007` | `SESSION_MISMATCH` — a session is active on the addressed bay, but its `sessionId` differs from the one requested. If the addressed bay has **no** active session at all, the answer is `3006`, not this code — including when the named session is alive on some other bay |
| `3011` | `BAY_MAINTENANCE` — the bay is in maintenance mode and cannot process the stop. A bay cannot *enter* maintenance while `Occupied` ([`05-state-machines.md` §2.3](05-state-machines.md) refuses that with `3001`); this code covers a stop addressed to a bay already `Unavailable`, such as after a fault-then-maintenance sequence the server has not yet observed |

---

## 4. Payment & Credits

### 4.1 TransactionEvent

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-server` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-station` |
| **Trigger** | Station reconnects to MQTT after offline sessions — reconciliation of offline transactions |
| **Expected Response** | TransactionEvent RESPONSE |
| **Timeout** | 60 seconds |
| **Idempotency** | Yes — server deduplicates by `offlineTxId`. A retransmission of the same transaction (byte-identical signed `receipt.data`) returns `Duplicate`; a *different* transaction under the same `offlineTxId` returns `Rejected` and both records are retained ([`reconciliation.md` §3](profiles/offline/reconciliation.md)) |
| **Message Expiry** | Never (exempt — critical financial data) |

Used for **offline transaction reconciliation**. When the station regains MQTT connectivity, it MUST send one TransactionEvent per offline transaction and wait for each RESPONSE before sending the next. Ascending `txCounter` order is RECOMMENDED but not required — the server settles each transaction on its own merits, in arrival order.

Each transaction includes a **signed receipt** (ECDSA P-256) carrying a monotonic **txCounter** as forensic evidence. See [Chapter 06 — Security](06-security.md) for receipt signing details.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `offlineTxId` | string | Yes | Unique offline transaction ID (`otx_{uuid}`) |
| `offlinePassId` | string | Cond. | **pass-form only** — OfflinePass used for authorization (`opass_{uuid}`). Required in pass-form; **forbidden** in auth-form |
| `passCounter` | integer | Cond. | **pass-form only** — per-pass monotonic counter. Required in pass-form; **forbidden** in auth-form |
| `authId` | string | Cond. | **auth-form only** — the server-signed authorization this session ran under. Required in auth-form; **forbidden** in pass-form |
| `sessionId` | string | Cond. | **auth-form only** — the session identifier (`sess_{id}`). Required in auth-form; **forbidden** in pass-form |
| `userId` | string | Yes | User subject identifier (`sub_{id}`) |
| `bayId` | string | Yes | Bay where service was provided (`bay_{uuid}`) |
| `serviceId` | string | Yes | Service that was activated (`svc_{id}`) |
| `startedAt` | string | Yes | Session start time (ISO 8601 UTC) |
| `endedAt` | string | Yes | Session end time (ISO 8601 UTC) |
| `durationSeconds` | integer | Yes | Actual session duration in seconds |
| `creditsCharged` | integer | Yes | Credits debited from user |
| `receipt` | object | Yes | Signed receipt — see fields below |
| `receipt.data` | string | Yes | Base64-encoded canonical JSON of receipt data |
| `receipt.signature` | string | Yes | Base64-encoded ECDSA P-256 signature |
| `receipt.signatureAlgorithm` | string | Yes | `"ECDSA-P256-SHA256"` |
| `txCounter` | integer | Yes | Monotonically increasing transaction counter |
| `meterValues` | object | No | Final meter readings |
| `meterValues.liquidMl` | integer | No | Liquid consumed in milliliters |
| `meterValues.consumableMl` | integer | No | Consumable consumed in milliliters |
| `meterValues.energyWh` | integer | No | Energy consumed in watt-hours |

> **Two mutually exclusive forms.** [`transaction-event-request.schema.json`](../schemas/mqtt/transaction-event-request.schema.json) constrains this payload with a `oneOf` over two shapes, and exactly one applies to any given message:
>
> - **pass-form** (Full Offline / Partial B) — carries `offlinePassId` + `passCounter`, and **MUST NOT** carry `authId` or `sessionId`. The session was authorized by an OfflinePass held on the station.
> - **auth-form** (Partial A — ServerSignedAuth) — carries `authId` + `sessionId`, and **MUST NOT** carry `offlinePassId` or `passCounter`. The session was authorized by a server-signed blob delivered over BLE.
>
> The *Required* column above reads `Cond.` for all four for this reason. Every other field is required in both forms.

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"`, `"Duplicate"`, `"Rejected"`, or `"RetryLater"` |
| `reason` | string | Cond. | Rejection or retry reason (when not `Accepted`) |

**`status` behavior:**

| Status | Station Action |
|--------|---------------|
| `Accepted` | Do not send again; delete the local record (deletion MAY be deferred up to 72 h) |
| `Duplicate` | Do not send again; delete the local record (the server already holds this same transaction) |
| `Rejected` | Do not send again; **retain** the local record, marked rejected and flagged for manual investigation |
| `RetryLater` | Keep in queue; retry with exponential backoff (initial 5 s, cap 300 s). The response carries **no** retry interval — `transaction-event-response.schema.json` is closed over `status` and `reason` — so the backoff is the station's, not a server-supplied value |

**Server-side processing:**
1. Deduplicate by `offlineTxId`
2. Verify ECDSA receipt signature (CRITICAL if invalid)
3. Record `txCounter` (WARNING if the sequence is discontinuous, process anyway)
4. Validate OfflinePass (was it valid at transaction time?)
5. Calculate credits, debit user wallet (allow negative balance)
6. Run fraud scoring (see [Chapter 06](06-security.md), Section on fraud detection)
7. Create session record
8. Respond `Accepted`

#### Example

**REQUEST payload:**

```json
{
  "offlineTxId": "otx_d4e5f6a7b8c9",
  "offlinePassId": "opass_a8b9c0d1e2f3",
  "userId": "sub_xyz789",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-01-30T14:00:00.000Z",
  "endedAt": "2026-01-30T14:05:00.000Z",
  "durationSeconds": 298,
  "creditsCharged": 50,
  "receipt": {
    "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJjcmVkaXRzQ2hhcmdlZCI6NTAsImRldmljZUlkIjoiZGV2X2Q0ZTVmNmE3IiwiZHVyYXRpb25TZWNvbmRzIjoyOTgsImVuZGVkQXQiOiIyMDI2LTAxLTMwVDE0OjA1OjAwLjAwMFoiLCJtZXRlclZhbHVlcyI6eyJjb25zdW1hYmxlTWwiOjUwMCwiZW5lcmd5V2giOjE1MCwibGlxdWlkTWwiOjQ1MjAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2E4YjljMGQxZTJmMyIsIm9mZmxpbmVUeElkIjoib3R4X2Q0ZTVmNmE3YjhjOSIsInBhc3NDb3VudGVyIjozNiwic2VydmljZUlkIjoic3ZjX2VjbyIsInN0YXJ0ZWRBdCI6IjIwMjYtMDEtMzBUMTQ6MDA6MDAuMDAwWiIsInR4Q291bnRlciI6NSwidXNlcklkIjoic3ViX3h5ejc4OSJ9",
    "signature": "MEQCIC8m3LyrXnETmcPy0Sg9HYJtRVELvy8uvihcLwyNXfwIAiA2TuLFn/z+7EgxOXsebVqj1SUy+Ej7eLuC17nzjSJGkg==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  },
  "passCounter": 36
}
```

**RESPONSE (Accepted):**

```json
{
  "status": "Accepted"
}
```

**RESPONSE (Rejected):**

```json
{
  "status": "Rejected",
  "reason": "Receipt signature verification failed"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `1005` | `INVALID_MESSAGE_FORMAT` — request payload schema violation |
| `2002` | `OFFLINE_PASS_INVALID` — receipt signature verification failed |
| `2004` | `OFFLINE_EPOCH_REVOKED` — revocation epoch mismatch |
| `3015` | `PAYLOAD_INVALID` — payload is semantically invalid |
| `6001` | `SERVER_INTERNAL_ERROR` — server-side processing failure |

---

## 5. Status & Monitoring

### 5.1 Heartbeat

| Property | Value |
|----------|-------|
| **Direction** | Station → Server (REQUEST), Server → Station (RESPONSE) |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-server` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-station` |
| **Trigger** | Timer fires every `heartbeatIntervalSec` seconds (from [BootNotification](#11-bootnotification) RESPONSE) |
| **Expected Response** | Heartbeat RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | Yes — always safe to retry |
| **Message Expiry** | 30 seconds |

The heartbeat serves two purposes: (1) keep-alive signal proving the station is connected and responsive, and (2) clock synchronization via the server's `serverTime` response.

The server **MUST** track the last heartbeat time per station. If no message is received for **3.5 × `heartbeatIntervalSec`** seconds, the server **MUST** treat the station as disconnected — [`heartbeat.md` §5](profiles/core/heartbeat.md) rule 4 and [CORE-007](profiles/core/README.md). (This summary previously said `SHOULD`, weakening the rule it summarises.)

#### REQUEST Payload

The Heartbeat REQUEST payload is **empty**:

```json
{}
```

> The station identity is derived from the MQTT topic path and the mTLS client certificate. No payload fields are required.

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `serverTime` | string | Yes | Server UTC time (ISO 8601) for clock drift correction |

#### Example

**REQUEST payload:**

```json
{}
```

**RESPONSE:**

```json
{
  "serverTime": "2026-01-30T12:00:30.000Z"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `1005` | `INVALID_MESSAGE_FORMAT` — request is not valid JSON or missing required fields |
| `1010` | `MESSAGE_TIMEOUT` — no response received within timeout window |
| `5106` | `CLOCK_ERROR` — clock drift exceeds acceptable threshold |
| `6001` | `SERVER_INTERNAL_ERROR` — server encountered an unexpected error |

**Clock synchronization:** The station **MUST** compare `serverTime` from the Heartbeat RESPONSE against its local clock, and **SHOULD** correct the clock when the absolute drift exceeds **2 seconds** — [`profiles/core/heartbeat.md` §6](profiles/core/heartbeat.md#6-clock-synchronization) is the normative statement. Maximum acceptable clock skew is **300 seconds** (5 minutes); above that the station **MUST** log error `5106 CLOCK_ERROR` and **SHOULD** send a SecurityEvent [MSG-012] with `type: ClockSkew` and `severity: Warning`.

---

### 5.2 StatusNotification

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | EVENT |
| **Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Bay state change, or post-boot bay layout report |
| **Expected Response** | None (EVENT — fire-and-forget) |
| **Timeout** | N/A |
| **Idempotency** | Yes — duplicate events with same bay status are ignored by server |
| **Message Expiry** | 30 seconds |

Reports the current status of a single bay. Sent in two contexts:

1. **Post-boot:** One StatusNotification per bay immediately after BootNotification `Accepted`. This reports the bay layout — `bayNumber`, `status`, and every `programs[]` entry with its availability.
2. **State change:** Whenever a bay transitions between states (e.g., `Available` → `Occupied`).

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |
| `bayNumber` | integer | Yes | Physical bay number (1-indexed, human-readable) |
| `status` | string | Yes | Current bay status — see enum below |
| `previousStatus` | string | No | Previous bay status (absent on post-boot report) |
| `programs` | array | Yes | Every program this bay declared at provisioning, with its availability (1–32 items) — see fields below |
| `programs[].programNumber` | integer | Yes | Program ordinal (1–32), as declared for this bay in the BootNotification topology |
| `programs[].available` | boolean | Yes | Whether this program can run on this bay right now |
| `programs[].errorCode` | integer | No | Why this program is unavailable (5xxx, or 9000–9999 vendor). Only when `available` is `false` |
| `programs[].errorText` | string | No | Machine-readable name for the program-level `errorCode` |
| `errorCode` | integer | No | Bay-level error code when `status` is `"Faulted"` |
| `errorText` | string | No | Bay-level error name when `status` is `"Faulted"` |

> **Programs, not services.** A program is a physical operation the hardware performs — a firmware constant the station always knows. A service is a commercial offer the **server** mints and pushes in the catalog ([UpdateServiceCatalog](#69-updateservicecatalog)), so a station can only echo one back, and immediately after its first boot it has been told none. Requiring at least one `svc_` identifier here made [CORE-004](profiles/core/README.md)'s mandatory post-boot report unsendable on a station's first boot. The server maps programs to services through its own bindings; `service-item.bindings[]` is where that mapping lives.

**`status` enum values** — the six reportable states (see [Chapter 05 — State Machines](05-state-machines.md)):

| Value | Description |
|-------|-------------|
| `Available` | Bay is idle and ready for service |
| `Reserved` | Bay is reserved for an upcoming session |
| `Occupied` | Bay is actively running a service |
| `Finishing` | Service complete, hardware winding down |
| `Faulted` | Hardware error — see `errorCode` |
| `Unavailable` | Bay is in maintenance mode |

The FSM's seventh state, `Unknown`, is **not** a value of this field. A station in `Unknown` resolves it by reporting the state it resolved *to* — never by reporting `Unknown` itself ([Chapter 05 §2.2](05-state-machines.md#22-states-7)).

Which transitions between these values are legal is [Chapter 05 §2.3](05-state-machines.md#23-transition-table), the only transition table in this specification; it is not restated here or in [`status-notification.md`](profiles/core/status-notification.md). This message carries the 20 transitions that table marks `Station`, and none of the 6 it marks `Server`.

#### Example

**Post-boot bay report:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "bayNumber": 1,
  "status": "Available",
  "programs": [
    {
      "programNumber": 1,
      "available": true
    },
    {
      "programNumber": 2,
      "available": true
    },
    {
      "programNumber": 3,
      "available": false
    }
  ]
}
```

**State change event:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "bayNumber": 1,
  "status": "Occupied",
  "previousStatus": "Reserved",
  "programs": [
    {
      "programNumber": 1,
      "available": true
    },
    {
      "programNumber": 2,
      "available": true
    },
    {
      "programNumber": 3,
      "available": true
    }
  ]
}
```

**Faulted event:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "bayNumber": 1,
  "status": "Faulted",
  "previousStatus": "Available",
  "programs": [
    {
      "programNumber": 1,
      "available": false
    },
    {
      "programNumber": 2,
      "available": false
    },
    {
      "programNumber": 3,
      "available": false
    }
  ],
  "errorCode": 5001,
  "errorText": "PUMP_SYSTEM"
}
```

---

### 5.3 MeterValues

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | EVENT |
| **Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Periodic timer during active sessions (`MeterValuesInterval` config, default 60s) |
| **Expected Response** | None (EVENT) |
| **Timeout** | N/A |
| **Idempotency** | Yes — duplicate meter readings are deduplicated by timestamp |
| **Message Expiry** | 120 seconds (Periodic reporting category — see [`02-transport.md` §5.1](02-transport.md)) |

Reports consumption telemetry during an active session. Sent at the interval configured by `MeterValuesInterval` (default: 60 seconds). Only sent when `meterValuesSupported` capability is `true`.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |
| `sessionId` | string | Yes | Active session identifier (`sess_{uuid}`) |
| `timestamp` | string | Yes | Measurement timestamp (ISO 8601 UTC) |
| `values` | object | Yes | Meter readings — all values are cumulative since session start |
| `values.liquidMl` | integer | No | Liquid consumed in milliliters |
| `values.consumableMl` | integer | No | Consumable consumed in milliliters |
| `values.energyWh` | integer | No | Energy consumed in watt-hours |
| `seqNo` | integer | No | Per-session monotonic counter starting at 0, incrementing by 1 per session-scoped EVENT (MeterValues, SessionEnded). See [`02-transport.md §3.2`](02-transport.md) (ordering) and [`05-state-machines.md §3.5`](05-state-machines.md) (NVS persistence). |

> Sensor sampling occurs at the `MeterValuesSampleInterval` (default: 10 seconds). The `MeterValuesInterval` controls how often the aggregated values are reported to the server.

#### Example

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "sessionId": "sess_a1b2c3d4",
  "timestamp": "2026-01-30T12:02:00.000Z",
  "values": {
    "liquidMl": 22100,
    "consumableMl": 250,
    "energyWh": 75
  }
}
```

---

### 5.4 SessionEnded

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | EVENT |
| **Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Session ends autonomously on station (timer expiry or hardware fault) |
| **Expected Response** | None (EVENT — fire-and-forget) |
| **Timeout** | N/A |
| **Idempotency** | Yes — duplicate SessionEnded for same `sessionId` MUST be ignored by server |
| **Message Expiry** | **Never expires** (Critical event — see [`02-transport.md §5.1`](02-transport.md)) |

Reports the end of a session that was terminated autonomously by the station, without a server-initiated StopService command. Sent in any of the following cases:

1. **Timer expiry:** The `durationSeconds` timer elapsed and the station auto-stopped the service.
2. **Hardware fault:** A hardware fault occurred during an active session and the station auto-stopped the service.
3. **Local user stop:** The user manually stopped the session at the station (e.g., pressed the physical Stop button on the bay).
4. **Offline credit exhausted:** The station was operating in offline mode and the user's offline credit pool reached zero mid-session, forcing an immediate stop.
5. **Mid-session deauthorization:** The user's offline pass was revoked (e.g., via a `RevocationEpoch` bump propagated through ChangeConfiguration) while the session was active; the station MUST stop the service when it detects the revocation.

The server **MUST** settle the session from this event rather than from StatusNotification — it **MUST NOT** rely solely on StatusNotification for billing calculations when this event is expected. The event's `actualDurationSeconds` and `meterValues` are the delivery record; its `creditsCharged` is **advisory input only**. The server **MUST** recompute the amount itself under the active tariff (see **Billing Authority** in [`04-flows.md §6`](04-flows.md)) and **MUST NOT** accept the station's figure as the charge.

The server is the authoritative billing engine; the station's `creditsCharged` value is advisory and the server applies the active tariff to produce the final invoice. See [Billing Authority in `04-flows.md`](04-flows.md) for the normative statement of this separation.

This message is NOT sent when the session is stopped by a server-initiated StopService command — in that case, billing data is returned in the StopService RESPONSE [MSG-006].

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `sessionId` | string | Yes | Session identifier (`sess_{uuid}`) |
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |
| `reason` | string | Yes | Why the session ended — see enum below |
| `actualDurationSeconds` | integer | Yes | Actual service duration in seconds |
| `creditsCharged` | integer | Yes | Total credits charged |
| `meterValues` | object | No | Final meter readings (when meters available) |
| `meterValues.liquidMl` | integer | No | Total liquid consumed in milliliters |
| `meterValues.consumableMl` | integer | No | Total consumable consumed in milliliters |
| `meterValues.energyWh` | integer | No | Total energy consumed in watt-hours |
| `seqNo` | integer | No | Per-session monotonic counter — **continues** the session's MeterValues sequence, incrementing by exactly `1` for this event as for any other session-scoped EVENT. It is the next value after the last MeterValues, not a repeat of it. Receivers **MUST** verify the increment. See [`02-transport.md §3.2`](02-transport.md). |
| `finalSeqNo` | integer | No | Canonical session-final marker — the highest `seqNo` emitted for this session. Servers MUST discard MeterValues with `seqNo > finalSeqNo` received after this SessionEnded for the same `sessionId`. See [`02-transport.md §3.2`](02-transport.md). |

**`reason` enum values:**

| Value | Description |
|-------|-------------|
| `TimerExpired` | Session `durationSeconds` elapsed; station auto-stopped. |
| `Fault` | Hardware fault detected during active session; station auto-stopped. |
| `Local` | User manually stopped the session at the station (e.g., physical Stop button on the bay, station UI). Distinguishes operator-initiated termination at the station from a server-routed StopService. |
| `LocalOutOfCredit` | Offline credit pool exhausted mid-session — `OfflinePass.maxTotalCredits` would be exceeded by the next meter reading or by elapsed time, forcing the station to stop. Session MUST be billed at zero (no valid credits available). |
| `Deauthorized` | Offline pass revoked while the session was active — typically a `RevocationEpoch` bump propagated through ChangeConfiguration that invalidates the pass under which the session was authorized. Session MUST be billed at zero. |
| `OperatorStopped` | An operator ended the session deliberately: a Reset carrying `force: true`, or a station disable. The session is stopped, metered and reported exactly as an operator-initiated stop, and the customer **MUST** be billed for what they received — this is the only value in this enum that bills a non-zero amount for a session the station did not run to completion. It exists because there was nothing to report a forced stop with. `Deauthorized` was the nearest member and mandates billing at **zero**, so reusing it would have delivered a wash and charged nothing for it, every time an operator forced a reset. |

> **Version note, and the case that decided version negotiation.** The `reason` enum was extended from `["TimerExpired", "Fault"]` to add `Local`, `LocalOutOfCredit`, and `Deauthorized`. A server built against the narrower enum rejects a SessionEnded carrying one of the new values on schema validation — and SessionEnded is the sole billing source when no StopService command was issued, so that rejection loses a delivered session's money silently. Mixed-version deployment is **not** supported, and this is precisely why boot negotiation is **exact match** and not "same MAJOR" ([VERSIONING.md](../VERSIONING.md)): both versions here share MAJOR `0`, so a MAJOR gate would have accepted the pairing at boot and surfaced the incompatibility at settlement instead. Exact match refuses it at boot, where refusing is cheap and visible.

> **Reasons not in v0.4.0:** `Remote` (server-initiated stop) is intentionally excluded — server-initiated stops produce a StopService RESPONSE [MSG-006] which already carries final billing data; emitting both StopService RESPONSE and SessionEnded for the same stop would force double-emission ambiguity. Remote-stop semantics belong in a dedicated flow refactor. `EnergyLimitReached` is deferred to a future version pending consumable-meter implementation maturity.

#### Example

**Timer expiry:**
```json
{
  "sessionId": "sess_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "reason": "TimerExpired",
  "actualDurationSeconds": 300,
  "creditsCharged": 50,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  }
}
```

**Hardware fault:**
```json
{
  "sessionId": "sess_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "reason": "Fault",
  "actualDurationSeconds": 127,
  "creditsCharged": 21,
  "meterValues": {
    "liquidMl": 18900,
    "consumableMl": 210,
    "energyWh": 63
  }
}
```

> **Note:** SessionEnded is always followed by StatusNotification [MSG-009] reporting the new bay state (`Finishing` → `Available` for timer expiry, or `Faulted` for hardware fault). The server MUST process SessionEnded before acting on the subsequent StatusNotification.

---

### 5.5 ConnectionLost

| Property | Value |
|----------|-------|
| **Direction** | MQTT Broker → Server |
| **Transport** | MQTT (Last Will and Testament) |
| **Message Type** | EVENT |
| **Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Unexpected station disconnect (TCP connection lost without MQTT DISCONNECT) |
| **Expected Response** | None (EVENT) |
| **Timeout** | N/A |
| **Idempotency** | Yes — multiple LWT for same station are deduplicated |
| **Message Expiry** | Never (exempt — critical event) |

This is the **Last Will and Testament (LWT)** message, pre-configured by the station at MQTT CONNECT time. The broker publishes it when the station disconnects unexpectedly (no MQTT DISCONNECT packet received within the keep-alive window).

> **Signing note:** The ConnectionLost message is **exempt** from HMAC-SHA256 signing because it is pre-configured at connect time and published by the broker, not the station.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `stationId` | string | Yes | Station that disconnected (`stn_{uuid}`) |
| `reason` | string | Yes | `"UnexpectedDisconnect"` |

#### Example

```json
{
  "messageId": "lwt-stn_a1b2c3d4",
  "messageType": "Event",
  "action": "ConnectionLost",
  "timestamp": "2026-01-30T12:00:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "reason": "UnexpectedDisconnect"
  }
}
```

> **Note:** The full envelope is shown because this message is pre-configured at CONNECT time with a placeholder timestamp. The broker publishes the exact pre-configured message.

---

### 5.6 SecurityEvent

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | EVENT |
| **Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Security-relevant incident detected by the station |
| **Expected Response** | None (EVENT) |
| **Timeout** | N/A |
| **Idempotency** | Yes — duplicate events with same `eventId` are ignored |
| **Message Expiry** | Never (exempt — critical security data) |

Reports security incidents to the server for audit and automated response. The server SHOULD log all security events and MAY trigger automated actions (e.g., disable offline mode after multiple `MacVerificationFailure` events).

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `eventId` | string | Yes | Unique event identifier (`sec_{uuid}`) |
| `type` | string | Yes | Security event type — see enum below |
| `severity` | string | Yes | `"Critical"`, `"Error"`, `"Warning"`, or `"Info"` |
| `timestamp` | string | Yes | When the event occurred (ISO 8601 UTC) |
| `details` | object | Yes | Event-specific details (schema varies by type) |

**`type` enum values:**

| Type | Severity | Description |
|------|----------|-------------|
| `MacVerificationFailure` | Critical | HMAC-SHA256 verification failed on received message |
| `CertificateError` | Critical | TLS certificate expired, invalid, or revoked |
| `UnauthorizedAccess` | Warning | Attempt to access unauthorized resource or topic |
| `OfflinePassRejected` | Warning | BLE offline pass failed validation |
| `ServerSignedAuthReplay` | Critical | ServerSignedAuth (Partial A) replayed — signed `appNonce` ≠ current handshake `Hello.appNonce` (error 2018); logged by the server at reconciliation |
| `TamperDetected` | Critical | Physical tamper switch triggered or enclosure opened |
| `BruteForceAttempt` | Warning | Repeated failed authentication attempts |
| `FirmwareIntegrityFailure` | Critical | Firmware checksum mismatch or signature invalid |
| `FirmwareDowngradeAttempt` | Warning | Firmware update received with version older than currently installed; logged regardless of `forceDowngrade` |
| `HardwareFault` | Critical | Critical hardware error (pump overcurrent, electrical fault, emergency stop) |
| `SoftwareFault` | Critical | Critical software error (firmware crash, watchdog reset, memory exhaustion) |
| `ClockSkew` | Warning | Station clock differs from server by more than 300 seconds |

> **Automated response:** 3+ `MacVerificationFailure` events from the same station within 60 seconds SHOULD trigger a security review and MAY flag the station as potentially compromised.

#### Example

```json
{
  "eventId": "sec_a1b2c3d4",
  "type": "MacVerificationFailure",
  "severity": "Critical",
  "timestamp": "2026-01-30T12:01:00.000Z",
  "details": {
    "messageId": "cmd_550e8400-e29b-41d4-a716-446655440000",
    "action": "StartService",
    "expectedMac": "dGhpcyBpcyBleHBlY3RlZCBtYWM=",
    "receivedMac": "dGhpcyBpcyByZWNlaXZlZCBtYWM="
  }
}
```

---

## 6. Firmware & Configuration

### 6.1 ChangeConfiguration

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Administrator changes a configuration value via management dashboard |
| **Expected Response** | ChangeConfiguration RESPONSE |
| **Timeout** | 60 seconds |
| **Idempotency** | Yes — setting the same key to the same value is a no-op |
| **Message Expiry** | 120 seconds |

Sets one or more configuration key-value pairs on the station atomically. For the full list of configuration keys, see [Chapter 08 — Configuration](08-configuration.md).

Single-key requests (array of 1) are the common case. The array format enables atomic multi-key updates for correlated settings (e.g., `OfflinePassPublicKey` + `RevocationEpoch`).

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `keys` | array | Yes | Array of key-value pairs to set (minItems: 1, maxItems: 20) |
| `keys[].key` | string | Yes | Configuration key name (e.g., `"HeartbeatIntervalSeconds"`) |
| `keys[].value` | string | Yes | New value as string (station parses to appropriate type) |

> All values are transmitted as strings to maintain a uniform interface. The station MUST validate the value type and range for each key.

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `results` | array | Yes | Per-key results in the same order as the request `keys` array |
| `results[].key` | string | Yes | Configuration key name (echoed from request) |
| `results[].status` | string | Yes | Result — see enum below |
| `results[].errorCode` | integer | Cond. | Error code (when `Rejected` or `NotSupported`) |
| `results[].errorText` | string | Cond. | Error description (when `Rejected` or `NotSupported`) |

**`status` enum values:**

| Value | Description |
|-------|-------------|
| `Accepted` | Value applied immediately |
| `RebootRequired` | Value accepted but requires reboot to take effect |
| `Rejected` | Value rejected (invalid range, type mismatch, read-only key) |
| `NotSupported` | Key not recognized by this station |

#### Atomicity

The station **MUST** apply ALL keys or NONE. If any key in the request would result in `Rejected` or `NotSupported`, the station **MUST NOT** apply any changes from the batch. The response still contains per-key status for each entry so the server can diagnose which key(s) caused the failure.

#### Example (single key)

**REQUEST payload:**

```json
{
  "keys": [
    { "key": "HeartbeatIntervalSeconds", "value": "60" }
  ]
}
```

**RESPONSE:**

```json
{
  "results": [
    { "key": "HeartbeatIntervalSeconds", "status": "Accepted" }
  ]
}
```

#### Example (atomic multi-key)

**REQUEST payload:**

```json
{
  "keys": [
    { "key": "OfflinePassPublicKey", "value": "BPkKbj...base64..." },
    { "key": "RevocationEpoch", "value": "5" }
  ]
}
```

**RESPONSE (all accepted):**

```json
{
  "results": [
    { "key": "OfflinePassPublicKey", "status": "Accepted" },
    { "key": "RevocationEpoch", "status": "Accepted" }
  ]
}
```

**RESPONSE (one rejected — no changes applied):**

```json
{
  "results": [
    { "key": "OfflinePassPublicKey", "status": "Accepted" },
    { "key": "FirmwareVersion", "status": "Rejected", "errorCode": 5108, "errorText": "CONFIGURATION_KEY_READONLY" }
  ]
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `1012` | `MAC_VERIFICATION_FAILED` — HMAC verification failed |
| `2008` | `ACTION_NOT_PERMITTED` — insufficient RBAC permissions |
| `3015` | `PAYLOAD_INVALID` — key or value is semantically invalid |
| `5108` | `CONFIGURATION_KEY_READONLY` — key is read-only |
| `5109` | `INVALID_CONFIGURATION_VALUE` — value out of range or wrong type |

---

### 6.2 GetConfiguration

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Administrator requests current configuration values |
| **Expected Response** | GetConfiguration RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | Yes — read-only operation |
| **Message Expiry** | 120 seconds |

Retrieves one or more configuration values from the station.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `keys` | array of string | No | Specific keys to retrieve. If empty or absent, return ALL keys except WriteOnly keys. |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `configuration` | array | Yes | List of key-value entries |
| `configuration[].key` | string | Yes | Configuration key name |
| `configuration[].value` | string | Yes | Current value as string |
| `configuration[].readonly` | boolean | Yes | `true` if the key cannot be changed |
| `unknownKeys` | array of string | No | Keys from the request that the station does not recognize |

> **WriteOnly keys are never returned.** A key whose access mode is WriteOnly — see [Chapter 08 — Configuration](08-configuration.md), §1.3 — **MUST NOT** appear in `configuration[]`, whether the request named it explicitly or asked for everything with an empty or absent `keys` array. WriteOnly keys are security credentials, and a configuration dump that carries them is a credential dump. `OfflinePassPublicKey` is currently the only WriteOnly key in the registry.
>
> `configuration[].readonly` is a boolean and cannot express a third access mode. It does not need to: a WriteOnly key is absent from the response entirely, so there is no entry for which a third value would ever be required. A request that *names* a WriteOnly key gets it back in **neither** array — not in `configuration`, and not in `unknownKeys`, because the station recognizes it — which is how a server distinguishes a withheld key from an unrecognized one. Such a request MUST NOT error and MUST NOT fail the batch. See [`get-configuration.md`](profiles/device-management/get-configuration.md) §5.1.

#### Example

**REQUEST payload (specific keys):**

```json
{
  "keys": ["HeartbeatIntervalSeconds", "OfflineModeEnabled", "NonExistentKey"]
}
```

**RESPONSE:**

```json
{
  "configuration": [
    { "key": "HeartbeatIntervalSeconds", "value": "30", "readonly": false },
    { "key": "OfflineModeEnabled", "value": "true", "readonly": false }
  ],
  "unknownKeys": ["NonExistentKey"]
}
```

**REQUEST payload (all keys):**

```json
{}
```

#### Error Responses

This message uses implicit error codes only (see [§Introduction — Implicit error codes](#implicit-error-codes)).

---

### 6.3 Reset

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Administrator initiates remote reset |
| **Expected Response** | Reset RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | No — each reset triggers a new reboot cycle |
| **Message Expiry** | 120 seconds |

Commands the station to **reboot**. There is exactly one reset operation and everything the station has persisted survives it; no value of this message clears credentials ([Reset §5.1](profiles/device-management/reset.md)). The station **MUST** reject the reset if active sessions exist and `force` is absent or false (see Behavior below).

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `force` | boolean | No | Reboot even while a session is running (default `false`). Without it, an active session is refused with `3016`; with it, sessions settle under the [operator-disable policy](04-flows.md#the-operator-disable-policy) first, each reported as SessionEnded with `reason: OperatorStopped`. There is one reset operation and it is a reboot — nothing on this message clears credentials |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

**Behavior:**
- If active sessions exist, the station **MUST** respond with `Rejected` and error code `3016 ACTIVE_SESSIONS_PRESENT`. The server **SHOULD** send StopService for each active session first, then re-issue Reset.
- The station sends `Accepted`, then reboots. After reboot it goes through the full [BootNotification](#11-bootnotification) sequence, carrying `bootReason: "RemoteReset"` so the server can tell a return it asked for from a spontaneous one. Credentials, configuration, catalog and the `bays` mapping all survive.

#### Example

**REQUEST payload:**

```json
{
  "force": false
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `3016` | `ACTIVE_SESSIONS_PRESENT` — one or more sessions are still active |
| `5107` | `OPERATION_IN_PROGRESS` — another long-running operation (e.g., firmware update) is active |
| `5110` | `RESET_FAILED` — station failed to initiate reset |

---

### 6.4 UpdateFirmware

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Administrator initiates OTA firmware update |
| **Expected Response** | UpdateFirmware RESPONSE, then [FirmwareStatusNotification](#65-firmwarestatusnotification) events |
| **Timeout** | 300 seconds |
| **Idempotency** | Yes — same `firmwareVersion` + `checksum` is a no-op if already installed or in progress |
| **Message Expiry** | 600 seconds |

Instructs the station to download and install a new firmware version. The station uses an **A/B partition** scheme: the new firmware is written to the inactive partition, and on reboot the bootloader switches to it. On failure, the station automatically rolls back to the previous partition.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `firmwareUrl` | string | Yes | HTTPS URL to download the firmware binary |
| `firmwareVersion` | string | Yes | Target firmware version (semver) |
| `checksum` | string | Yes | `"sha256:{hex-digest}"` — integrity hash of the firmware binary |
| `signature` | string | Yes | Base64-encoded ECDSA P-256 signature of the firmware image (see [Chapter 06 — Security](06-security.md), §4.6) |
| `forceDowngrade` | boolean | No | When `true`, override anti-downgrade protection and allow installing an older firmware version (default: `false`). See §4.6.1. |
| `scheduledAt` | string | No | ISO 8601 UTC — station downloads and verifies **now**, installs at the scheduled time ([update-firmware.md §5](profiles/device-management/update-firmware.md) rule 5) |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

**Post-acceptance flow:**
1. Station sends [FirmwareStatusNotification](#65-firmwarestatusnotification) `Downloading` (with progress %)
2. Station verifies the checksum **and** the ECDSA P-256 `signature` over the downloaded binary → `Downloaded`. Both checks are required; `Downloaded` **MUST NOT** be reported on the checksum alone ([update-firmware.md §5](profiles/device-management/update-firmware.md) rule 4)
3. Station writes to inactive partition → `Installing`
4. Write completes → `Installed`, sent **before** the station reboots
5. Station reboots and comes back with a [BootNotification](#11-bootnotification) carrying the new `firmwareVersion` — that boot, not a further FirmwareStatusNotification, is how the update's outcome is reported
6. On any failure → `Failed` (automatic rollback to previous partition)

#### Example

**REQUEST payload:**

```json
{
  "firmwareUrl": "https://firmware.example.com/station/v1.3.0.bin",
  "firmwareVersion": "1.3.0",
  "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
  "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `1011` | `URL_UNREACHABLE` — firmware URL cannot be reached |
| `5014` | `DOWNLOAD_FAILED` — firmware binary download failed |
| `5015` | `CHECKSUM_MISMATCH` — firmware checksum does not match expected value |
| `5016` | `VERSION_ALREADY_INSTALLED` — target firmware version is already installed |
| `5017` | `INSUFFICIENT_STORAGE` — not enough storage to download/install firmware |
| `5018` | `INSTALLATION_FAILED` — firmware installation failed |
| `5103` | `STORAGE_ERROR` — insufficient storage for firmware download |
| `5107` | `OPERATION_IN_PROGRESS` — another firmware update or diagnostics upload is active |
| `5112` | `FIRMWARE_SIGNATURE_INVALID` — ECDSA P-256 firmware signature verification failed |

---

### 6.5 FirmwareStatusNotification

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | EVENT |
| **Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Firmware update progress change |
| **Expected Response** | None (EVENT) |
| **Timeout** | N/A |
| **Idempotency** | Yes — duplicate status updates are ignored |
| **Message Expiry** | 60 seconds |

Reports firmware update progress. Sent at each stage transition and periodically during download — at every 10% increment and at least every 30 seconds, whichever falls sooner ([firmware-status.md §5](profiles/device-management/firmware-status.md), which is the normative home for both).

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | Current stage — see enum below |
| `firmwareVersion` | string | Yes | Target firmware version being installed |
| `progress` | integer | No | Percentage complete (0-100), applicable during `Downloading` and `Installing` |
| `errorText` | string | Cond. | Error description (when `Failed`) |

**`status` enum values:**

| Value | Description |
|-------|-------------|
| `Downloading` | Firmware binary is being downloaded |
| `Downloaded` | Download complete, checksum verified **and** ECDSA P-256 signature verified |
| `Installing` | Firmware is being written to inactive partition |
| `Installed` | Installation complete, reboot pending — sent before the reboot, never after it |
| `Failed` | Update failed — automatic rollback initiated |

#### Example

```json
{
  "status": "Downloading",
  "firmwareVersion": "1.3.0",
  "progress": 45
}
```

```json
{
  "status": "Failed",
  "firmwareVersion": "1.3.0",
  "errorText": "Checksum mismatch after download"
}
```

---

### 6.6 GetDiagnostics

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Administrator requests diagnostic logs |
| **Expected Response** | GetDiagnostics RESPONSE, then [DiagnosticsNotification](#67-diagnosticsnotification) events |
| **Timeout** | 300 seconds |
| **Idempotency** | No — each request generates a new diagnostics archive |
| **Message Expiry** | 600 seconds |

Commands the station to collect diagnostic logs and upload them to the specified URL.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `uploadUrl` | string | Yes | HTTPS URL where the station uploads the diagnostics archive (PUT) |
| `startTime` | string | No | ISO 8601 UTC — start of log time range (if supported) |
| `endTime` | string | No | ISO 8601 UTC — end of log time range (if supported) |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `fileName` | string | Cond. | Name of the diagnostics archive (when `Accepted`) |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

The diagnostics archive MUST be a `tar.gz` file containing logs, configuration dump, and any crash reports.

#### Example

**REQUEST payload:**

```json
{
  "uploadUrl": "https://diag.example.com/upload/stn_a1b2c3d4",
  "startTime": "2026-01-29T00:00:00.000Z",
  "endTime": "2026-01-30T00:00:00.000Z"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted",
  "fileName": "diag_stn_a1b2c3d4_20260130.tar.gz"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `5019` | `UPLOAD_FAILED` — diagnostics upload to server failed |
| `5020` | `INVALID_TIME_WINDOW` — requested time range is invalid |
| `5021` | `NO_DIAGNOSTICS_AVAILABLE` — no diagnostic data available for the requested period |
| `5103` | `STORAGE_ERROR` — insufficient storage to collect diagnostics |
| `5107` | `OPERATION_IN_PROGRESS` — another diagnostics or firmware operation is active |
| `1011` | `URL_UNREACHABLE` — upload URL is not reachable |

---

### 6.7 DiagnosticsNotification

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | EVENT |
| **Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Diagnostics upload progress change |
| **Expected Response** | None (EVENT) |
| **Timeout** | N/A |
| **Idempotency** | Yes — duplicate status updates are ignored |
| **Message Expiry** | 60 seconds |

Reports diagnostics collection and upload progress.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Collecting"`, `"Uploading"`, `"Uploaded"`, or `"Failed"` |
| `progress` | integer | No | Percentage complete (0-100) |
| `fileName` | string | Cond. | Archive file name (when `Uploaded`) |
| `errorText` | string | Cond. | Error description (when `Failed`) |

#### Example

```json
{
  "status": "Uploading",
  "progress": 60
}
```

```json
{
  "status": "Uploaded",
  "fileName": "diag_stn_a1b2c3d4_20260130.tar.gz"
}
```

---

### 6.8 SetMaintenanceMode

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Operator enables/disables maintenance mode for a bay or all bays |
| **Expected Response** | SetMaintenanceMode RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | Yes — enabling maintenance on an already-maintained bay is a no-op |
| **Message Expiry** | 120 seconds |

Transitions one or all bays to/from `Unavailable` (maintenance) status. The station MUST send a [StatusNotification](#52-statusnotification) for each affected bay.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `bayId` | string | No | Target bay (`bay_{uuid}`). If absent, applies to ALL bays. |
| `enabled` | boolean | Yes | `true` to enter maintenance, `false` to exit |
| `reason` | string | No | Human-readable reason (e.g., `"Scheduled cleaning"`) |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

#### Example

**REQUEST payload (single bay):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "enabled": true,
  "reason": "Scheduled cleaning"
}
```

**REQUEST payload (all bays):**

```json
{
  "enabled": true,
  "reason": "Station-wide maintenance"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `3001` | `BAY_BUSY` — bay has an active session (must stop first) |
| `3005` | `BAY_NOT_FOUND` — unknown bay identifier |

---

### 6.9 UpdateServiceCatalog

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Administrator updates service catalog (prices, availability) |
| **Expected Response** | UpdateServiceCatalog RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | Yes — same `catalogVersion` is a no-op |
| **Message Expiry** | 60 seconds |

Pushes the complete service catalog to the station. This is a **full replacement** — the station MUST replace its entire catalog in NVS with the new data.

**The BootNotification response does not carry the catalog.** Its schema ([`boot-notification-response.schema.json`](../schemas/mqtt/boot-notification-response.schema.json)) is closed and declares no field that could: the `configuration` member is a string-to-string map of configuration keys ([Chapter 08 §8.3](08-configuration.md#83-configuration-via-bootnotification)), not a service list. A station therefore receives its catalog **only** through UpdateServiceCatalog, and a freshly provisioned station has **no** catalog until the server pushes one. The server **SHOULD** push the catalog promptly after accepting a boot, since until it does the station knows no `serviceId` and can start nothing. If the push fails, the retry is the **server's** and is defined once, in [`07-errors.md` §5.3](07-errors.md) — two attempts at boot, the second after 10 seconds, falling back to the cached catalog. It is not the station's: UpdateServiceCatalog is Server → Station, so the station is the receiver and has no request to re-send.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `catalogVersion` | string | Yes | Catalog version identifier (e.g., `"2026-01-30-01"`) |
| `services` | array | Yes | Complete list of services — see fields below |
| `services[].serviceId` | string | Yes | Service identifier (`svc_{id}`) |
| `services[].serviceName` | string | Yes | Human-readable name (e.g., `"Eco Program"`) |
| `services[].bindings` | array | Yes | Where this service physically runs: one `{bayNumber, programNumber}` per bay-and-program it is bound to. Created on the server by an operator; the station never originates it, and it is what lets the station start the right program offline |
| `services[].pricingType` | string | Yes | `"PerMinute"` or `"Fixed"` |
| `services[].priceCreditsPerMinute` | integer | Cond. | Credit price per minute (when `PerMinute`) |
| `services[].priceCreditsFixed` | integer | Cond. | Fixed credit price per session (when `Fixed`) |
| `services[].priceLocalPerMinute` | integer | Cond. | Local-currency price in minor units per minute, informational (when `PerMinute`) |
| `services[].priceLocalFixed` | integer | Cond. | Local-currency price in minor units fixed, informational (when `Fixed`) |
| `services[].available` | boolean | Yes | Whether the service is enabled |

> **Dual pricing:** The `priceCredits*` fields are used by the station for offline charging calculations. The `priceLocal*` fields are informational, used for station display only (e.g., `priceLocalPerMinute = 50` → display "0.50/min" in local currency). All monetary values are **integers in the smallest unit** (credits or minor currency units).

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `previousCatalogVersion` | string | No | Previous catalog version that was replaced |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

#### Example

**REQUEST payload:**

```json
{
  "catalogVersion": "2026-01-30-01",
  "services": [
    {
      "serviceId": "svc_eco",
      "serviceName": "Eco Program",
      "pricingType": "PerMinute",
      "priceCreditsPerMinute": 10,
      "priceLocalPerMinute": 50,
      "available": true
    },
    {
      "serviceId": "svc_standard",
      "serviceName": "Standard Program",
      "pricingType": "PerMinute",
      "priceCreditsPerMinute": 8,
      "priceLocalPerMinute": 40,
      "available": true
    },
    {
      "serviceId": "svc_deluxe",
      "serviceName": "Deluxe Program",
      "pricingType": "Fixed",
      "priceCreditsFixed": 15,
      "priceLocalFixed": 75,
      "available": true
    }
  ]
}
```

**RESPONSE:**

```json
{
  "status": "Accepted",
  "previousCatalogVersion": "2026-01-15-01"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `3015` | `PAYLOAD_INVALID` — malformed catalog data |
| `5023` | `INVALID_CATALOG` — catalog structure is invalid or incomplete |
| `5024` | `UNSUPPORTED_SERVICE` — catalog contains a service type the station does not support |
| `5025` | `CATALOG_TOO_LARGE` — catalog exceeds station storage capacity |
| `5103` | `STORAGE_ERROR` — NVS write failed |

---

### 6.10 SignCertificate

| Property | Value |
|----------|-------|
| **Direction** | Station → Server |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-server` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-station` |
| **Trigger** | Station certificate is within `CertificateRenewalThresholdDays` of expiry, or TriggerCertificateRenewal received |
| **Expected Response** | SignCertificate RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | No — each CSR contains a new public key |
| **Message Expiry** | 60 seconds |

The station generates a new ECDSA P-256 keypair on-device, creates a PKCS#10 Certificate Signing Request, and submits the PEM-encoded CSR to the server for signing by the Station CA. The private key **MUST NOT** leave the device.

See [Certificate Renewal](profiles/security/certificate-renewal.md) for the complete renewal flow. Inspired by OCPP 2.0.1 Security Profile 3 certificate management.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `certificateType` | string | Yes | `"StationCertificate"` or `"MQTTClientCertificate"` |
| `csr` | string | Yes | PEM-encoded PKCS#10 Certificate Signing Request |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

#### Example

**REQUEST payload:**

```json
{
  "certificateType": "StationCertificate",
  "csr": "-----BEGIN CERTIFICATE REQUEST-----\nMIIBIjCByAIBADBmMQswCQYDVQQGEwJVUzELMAkGA1UECAwCQ0ExFDASBgNVBAcM\nC0xvcyBBbmdlbGVzMRIwEAYDVQQKDAlBY21lQ29ycDEgMB4GA1UEAwwXc3RuX2Ex\nYjJjM2Q0LmV4YW1wbGUuY29tMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END CERTIFICATE REQUEST-----"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `4010` | `CSR_INVALID` — CSR format is malformed or uses a prohibited algorithm |
| `4012` | `CERTIFICATE_TYPE_MISMATCH` — the station requested a certificate type it is not authorized for |
| `4013` | `RENEWAL_DENIED` — the server refuses renewal (policy, rate limit, or station suspended) |

---

### 6.11 CertificateInstall

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | CA has signed the station's CSR |
| **Expected Response** | CertificateInstall RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | Yes — same certificate serial number is a no-op |
| **Message Expiry** | 60 seconds (Certificate renewal category — see [`02-transport.md` §5.1](02-transport.md)) |

Delivers a signed X.509 certificate (and optional CA chain) to the station. The station validates the certificate chain, installs it to secure storage, and uses it for subsequent TLS connections.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `certificateType` | string | Yes | `"StationCertificate"` or `"MQTTClientCertificate"` |
| `certificate` | string | Yes | PEM-encoded signed X.509 certificate |
| `caCertificateChain` | string | No | PEM-encoded CA certificate chain (intermediate + root), concatenated |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `certificateSerialNumber` | string | No | Serial number of the newly installed certificate (when `Accepted`) |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

#### Example

**REQUEST payload:**

```json
{
  "certificateType": "StationCertificate",
  "certificate": "-----BEGIN CERTIFICATE-----\nMIICpDCCAYwCFBx7z2gR9wPz5mNvHp3LdFbYqT1sMA0GCSqGSIb3DQEBCwUA\n-----END CERTIFICATE-----",
  "caCertificateChain": "-----BEGIN CERTIFICATE-----\nMIICqDCCAZACFDx8y3hT0xQr6nOvIq4MeFcZrU2tMA0GCSqGSIb3DQEBCwUA\n-----END CERTIFICATE-----"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted",
  "certificateSerialNumber": "7A:3F:B2:C1:D4:E5:F6:A7"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `4011` | `CERTIFICATE_CHAIN_INVALID` — certificate chain verification failed (untrusted CA, missing intermediate, signature mismatch) |
| `4012` | `CERTIFICATE_TYPE_MISMATCH` — certificate type does not match the pending CSR |
| `5103` | `STORAGE_ERROR` — NVS write failed when installing the certificate |

---

### 6.12 TriggerCertificateRenewal

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Server detects certificate approaching expiry, CA rotation, or security incident |
| **Expected Response** | TriggerCertificateRenewal RESPONSE |
| **Timeout** | 10 seconds |
| **Idempotency** | Yes — if renewal is already in progress, station responds Accepted |
| **Message Expiry** | 60 seconds |

Instructs the station to initiate a certificate renewal by generating a new ECDSA P-256 keypair and submitting a CSR via SignCertificate [MSG-022]. After responding with Accepted, the station proceeds with the renewal flow asynchronously.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `certificateType` | string | Yes | `"StationCertificate"` or `"MQTTClientCertificate"` |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"` or `"Rejected"` |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |

#### Example

**REQUEST payload:**

```json
{
  "certificateType": "StationCertificate"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

#### Error Responses

| Error Code | Condition |
|------------|-----------|
| `4014` | `KEYPAIR_GENERATION_FAILED` — station cannot generate a new ECDSA P-256 keypair (hardware fault, entropy source failure) |
| `5107` | `OPERATION_IN_PROGRESS` — another certificate renewal is already in progress |

---

### 6.13 DataTransfer

| Property | Value |
|----------|-------|
| **Direction** | Bidirectional (Station → Server or Server → Station) |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-server` or `to-station` |
| **Topic (reply)** | Reverse of publish topic |
| **Trigger** | Station or server needs to exchange vendor-specific data |
| **Expected Response** | DataTransfer RESPONSE |
| **Timeout** | 30 seconds |
| **Idempotency** | Vendor-defined (protocol does not enforce) |
| **Message Expiry** | 60 seconds |

DataTransfer enables vendor-extensibility within the OSPP protocol. Both stations and servers may initiate a DataTransfer to exchange arbitrary JSON payloads scoped to a vendor namespace (`vendorId` + `dataId`).

DataTransfer MUST NOT be used for safety-critical or billing-critical operations.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `vendorId` | string | Yes | Identifies the vendor or extension author (1–64 characters). |
| `dataId` | string | Yes | Identifies the data type or command within the vendor namespace (1–64 characters). |
| `data` | object | No | Vendor-defined JSON payload. Structure is not validated by the protocol. |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"`, `"Rejected"`, `"UnknownVendor"`, or `"UnknownData"` |
| `data` | object | No | Vendor-defined response payload. |

#### Example

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

#### Error Responses

DataTransfer does not define message-specific error codes. Unknown vendors and data types are signaled via status values (`UnknownVendor`, `UnknownData`), not error codes.

#### Size and Rate Limits

The `data` field **MUST NOT** exceed **64 KB** when JSON-serialized. Payloads exceeding this limit **SHOULD** be rejected by the receiver with status `Rejected`. Both station and server **SHOULD** rate-limit DataTransfer messages to a maximum of **10 per minute per vendor**.

DataTransfer is HMAC-signed like every other message ([Chapter 06 §5.6](06-security.md#56-message-signing-classification)); an earlier revision exempted it as "not protocol-critical", and that class of per-message judgement is withdrawn. Vendor extensions requiring integrity **beyond** the transport MAC **SHOULD** implement application-level signing within the `data` payload.

---

### 6.14 TriggerMessage

| Property | Value |
|----------|-------|
| **Direction** | Server → Station |
| **Transport** | MQTT |
| **Message Type** | REQUEST / RESPONSE |
| **Topic (publish)** | `ospp/v1/stations/{station_id}/to-station` |
| **Topic (reply)** | `ospp/v1/stations/{station_id}/to-server` |
| **Trigger** | Server requests on-demand status, diagnostics, or certificate renewal |
| **Expected Response** | TriggerMessage RESPONSE |
| **Timeout** | 10 seconds |
| **Idempotency** | Yes — duplicate triggers for the same message type are safe |
| **Message Expiry** | 60 seconds |

Instructs the station to send a specific message immediately, outside of its normal schedule. After responding `Accepted`, the station MUST send the requested message within **5 seconds**.

#### REQUEST Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `requestedMessage` | string | Yes | Message type to trigger: `"BootNotification"`, `"StatusNotification"`, `"MeterValues"`, `"Heartbeat"`, `"DiagnosticsNotification"`, `"FirmwareStatusNotification"`, `"SecurityEvent"`, `"SignCertificate"` |
| `bayId` | string | No | Bay identifier for bay-specific messages (`StatusNotification`, `MeterValues`). If omitted, station sends for all bays. |

#### RESPONSE Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `status` | string | Yes | `"Accepted"`, `"Rejected"`, or `"NotImplemented"` |

#### Example

**REQUEST payload:**

```json
{
  "requestedMessage": "StatusNotification",
  "bayId": "bay_c1d2e3f4a5b6"
}
```

**RESPONSE:**

```json
{
  "status": "Accepted"
}
```

#### Error Responses

TriggerMessage does not define message-specific error codes. The `NotImplemented` status value indicates the station does not support triggering the requested message type.

**`NotImplemented` and `2007` answer different questions, and the scope is what separates them.** `2007 COMMAND_NOT_SUPPORTED` is implicit for every Server→Station REQUEST (see *Implicit Error Codes* above) and is about the **action**: the station does not implement TriggerMessage at all, or has it disabled by configuration. `NotImplemented` is about the **argument**: the station implements TriggerMessage, received it, and cannot produce the specific `requestedMessage` asked for. A station that supports TriggerMessage **MUST** answer an unsupported `requestedMessage` with `NotImplemented` and **MUST NOT** substitute `2007`, which would tell the server the command itself is unavailable and stop it asking for any message type.

#### Rate Limiting

The server **SHOULD NOT** send more than **1 TriggerMessage per action type, per station, per 30-second window**. The station **MAY** ignore duplicate triggers for the same `requestedMessage` within 30 seconds.

**The limit is per station, not fleet-wide.** It exists to stop one station being asked the same question repeatedly, which is a per-station concern — and the station-side sentence above is its mirror, necessarily scoped to the one station applying it. Read fleet-wide it would mean a single unresponsive station could silence the whole estate: an operator with forty bays awaiting a StatusNotification could repair one every thirty seconds, and a rate limit meant to protect stations would have become an availability limit on the operator.

---

## 7. Offline / BLE Operations

All messages in this section use the **BLE GATT** transport. For BLE transport parameters (MTU, advertising, fragmentation, encryption), see [Chapter 02 — Transport](02-transport.md), Section 8.

BLE messages do **not** use the MQTT envelope. Each BLE message written to FFF3 or notified on FFF4 includes a `type` field for identification. Readable characteristics (FFF1, FFF2, FFF6) contain static JSON structures.

Messages exceeding the negotiated MTU MUST be fragmented using the OSPP fragmentation protocol (see [Chapter 02](02-transport.md), Section 8.5):
- First fragment: `{F:1/N}` + data
- Subsequent fragments: `{F:2/N}` + data
- Last fragment: `{F:N/N}` + data

---

### 7.1 StationInfo (FFF1)

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF1-0000-1000-8000-00805F9B34FB` (Read) |
| **Trigger** | App reads characteristic after BLE connection |
| **Expected Response** | N/A (read operation) |
| **Timeout** | BLE read timeout (implementation-defined, RECOMMENDED 5s) |

The app SHOULD read StationInfo immediately after connecting to verify the station identity and check connectivity status before initiating the handshake.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `stationId` | string | Yes | Station identifier (`stn_{uuid}`) |
| `stationModel` | string | Yes | Hardware model name |
| `firmwareVersion` | string | Yes | Current firmware version (semver) |
| `bayCount` | integer | Yes | Number of service bays |
| `bleProtocolVersion` | string | Yes | BLE protocol version (e.g., `"0.2.1"`) |
| `connectivity` | string | Yes | `"Online"` (MQTT connected) or `"Offline"` (MQTT disconnected) |

#### Example

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "1.2.3",
  "bayCount": 3,
  "bleProtocolVersion": "0.2.1",
  "connectivity": "Offline"
}
```

---

### 7.2 AvailableServices (FFF2)

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF2-0000-1000-8000-00805F9B34FB` (Read) |
| **Trigger** | App reads characteristic to display service catalog and prices |
| **Expected Response** | N/A (read operation) |
| **Timeout** | BLE read timeout (implementation-defined, RECOMMENDED 5s) |

Returns the full service catalog with pricing for all bays. The app uses this to display available services and let the user select a bay and service before authentication.

> **Why this message carries services while [StatusNotification](#52-statusnotification) carries programs.** The two look alike and are not. AvailableServices is the station **echoing the catalog the server pushed it** ([UpdateServiceCatalog](#69-updateservicecatalog)) to an app that has no other way to reach it while offline — the station originates none of it, and if it holds no catalog it has nothing to serve here. StatusNotification is the station reporting **its own hardware**, which it always knows, in a message it is required to send before any catalog can have arrived. Same station, two different kinds of fact.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `catalogVersion` | string | Yes | Catalog version identifier |
| `bays` | array | Yes | List of bays — see fields below |
| `bays[].bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |
| `bays[].bayNumber` | integer | Yes | Physical bay number (1-indexed) |
| `bays[].status` | string | Yes | Current bay status — one of the six reportable states (`"Available"`, `"Reserved"`, `"Occupied"`, `"Finishing"`, `"Faulted"`, `"Unavailable"`). `"Unknown"` is not among them ([Chapter 05 §2.2](05-state-machines.md)) |
| `bays[].services` | array | Yes | Services available on this bay |
| `bays[].services[].serviceId` | string | Yes | Service identifier (`svc_{id}`) |
| `bays[].services[].serviceName` | string | Yes | Human-readable name |
| `bays[].services[].pricingType` | string | Yes | `"PerMinute"` or `"Fixed"` |
| `bays[].services[].priceCreditsPerMinute` | integer | Cond. | Credit price per minute |
| `bays[].services[].priceCreditsFixed` | integer | Cond. | Fixed credit price |
| `bays[].services[].priceLocalPerMinute` | integer | Cond. | Local-currency price in minor units per minute |
| `bays[].services[].priceLocalFixed` | integer | Cond. | Local-currency price in minor units fixed |
| `bays[].services[].available` | boolean | Yes | Whether the service is operational |

#### Example

```json
{
  "catalogVersion": "2026-01-30-01",
  "bays": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "bayNumber": 1,
      "status": "Available",
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 10,
          "priceLocalPerMinute": 50,
          "available": true
        },
        {
          "serviceId": "svc_standard",
          "serviceName": "Standard Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 8,
          "priceLocalPerMinute": 40,
          "available": true
        }
      ]
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "bayNumber": 2,
      "status": "Occupied",
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 10,
          "priceLocalPerMinute": 50,
          "available": true
        }
      ]
    }
  ]
}
```

---

### 7.3 Hello

| Property | Value |
|----------|-------|
| **Direction** | App → Station |
| **Transport** | BLE |
| **Characteristic** | `0000FFF3-0000-1000-8000-00805F9B34FB` (Write) |
| **Trigger** | App initiates the BLE handshake after reading FFF1 and FFF2 |
| **Expected Response** | [CHALLENGE](#74-challenge) on FFF4 |
| **Timeout** | 10 seconds |

First message of the BLE handshake. The app sends its identity and a random nonce for session key derivation.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"Hello"` |
| `deviceId` | string | Yes | Unique mobile device identifier (stable across sessions) |
| `appNonce` | string | Yes | Base64-encoded 32-byte random nonce |
| `appVersion` | string | Yes | Mobile app version (semver) |
| `appEphemeralPubKey` | string | Yes | App's per-handshake ephemeral P-256 public key (compressed SEC1, Base64). ECDH input for session-key derivation ([Chapter 06 §6.5](06-security.md#65-ble-session-key-derivation--hkdf-sha256)). |

#### Example

```json
{
  "type": "Hello",
  "deviceId": "device_uuid_123",
  "appNonce": "dGhpcyBpcyBhIDMyLWJ5dGUgcmFuZG9tIG5vbmNl...",
  "appVersion": "2.1.0",
  "appEphemeralPubKey": "AjRkc2Vzc2lvbi1lcGhlbWVyYWwtcHVia2V5LWFwcDEy"
}
```

---

### 7.4 Challenge

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF4-0000-1000-8000-00805F9B34FB` (Notify) |
| **Trigger** | Station receives a valid Hello message |
| **Expected Response** | [OfflineAuthRequest](#75-offlineauthrequest) or [ServerSignedAuth](#76-serversignedauth) on FFF3, depending on connectivity scenario |
| **Timeout** | N/A (station sends immediately) |

Second message of the BLE handshake. The station provides its nonce and tells the app whether the station is currently connected to the server.

The `stationConnectivity` field determines which authentication flow the app MUST use:
- `"Offline"` → App uses [OfflineAuthRequest](#75-offlineauthrequest) (Full Offline) or [ServerSignedAuth](#76-serversignedauth) (Partial A)
- `"Online"` → App uses [OfflineAuthRequest](#75-offlineauthrequest) (Partial B — station will forward to server)

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"Challenge"` |
| `stationNonce` | string | Yes | Base64-encoded 32-byte random nonce |
| `stationCert` | object | Yes | Server-signed StationIdentity certificate ([Chapter 06 §6.5.2](06-security.md#652-stationidentity-certificate)). App MUST verify before sending any credential. |
| `stationEphemeralPubKey` | string | Yes | Station's per-handshake ephemeral P-256 public key (compressed SEC1, Base64). ECDH input for forward secrecy (§6.5). |
| `stationConnectivity` | string | Yes | `"Online"` or `"Offline"` |
| `availableServices` | array | No | Simplified list of currently available services |
| `availableServices[].bayId` | string | Yes | Bay identifier |
| `availableServices[].serviceId` | string | Yes | Service identifier |
| `availableServices[].available` | boolean | Yes | Whether the service can be started |

> **Session key derivation:** Both sides derive the session key using HKDF-SHA256 over a two-operation ECDH P-256 exchange (the BLE LTK is NOT used — see [Chapter 06 — Security §6.5](06-security.md#65-ble-session-key-derivation--hkdf-sha256), which governs):
> `SessionKey = HKDF-SHA256(ikm = es ‖ ee ‖ appNonce ‖ stationNonce, salt = "OSPP_BLE_SESSION_V2", info = LP(deviceId) ‖ LP(transcriptHash), length = 32)` — where `es = ECDH(appEphemeral, stationStatic[cert])`, `ee = ECDH(appEphemeral, stationEphemeral)`, and `stationId` is bound via `transcriptHash` (not a separate `info` field).

#### Example

```json
{
  "type": "Challenge",
  "stationNonce": "c3RhdGlvbiBub25jZSAzMiBieXRlcyByYW5kb20u...",
  "stationCert": {
    "stationId": "stn_a1b2c3d4",
    "organizationId": "org_7f3a9c2e1b5d",
    "stationPubKey": "AymtZXJ2ZXItZXBoZW1lcmFsLXB1YmtleS1zdGF0aW9u",
    "issuedAt": "2026-02-13T00:00:00.000Z",
    "expiresAt": "2026-02-20T00:00:00.000Z",
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEUCIQDXKT0ewRBp/nkPY/qh6mBjwSn4BE7fmjDTdjcP1dhIyQIgPyXM1VnFZtrG6WaOgpRwiQIeFF2I2zeFsb05dyel1rE="
  },
  "stationEphemeralPubKey": "AzN0YXRpb24tZXBoZW1lcmFsLXB1YmtleS1jaGFsbGVu",
  "stationConnectivity": "Offline",
  "availableServices": [
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_standard", "available": true }
  ]
}
```

---

### 7.5 OfflineAuthRequest

| Property | Value |
|----------|-------|
| **Direction** | App → Station |
| **Transport** | BLE |
| **Characteristic** | `0000FFF3-0000-1000-8000-00805F9B34FB` (Write) |
| **Trigger** | Full Offline or Partial B scenario — app presents OfflinePass after Challenge |
| **Expected Response** | [AuthResponse](#77-authresponse) on FFF4 |
| **Timeout** | 10 seconds |

Presents an OfflinePass credential for authentication. Used in two scenarios:
- **Full Offline** (phone + station both offline): Station validates the pass locally using the 10 validation checks.
- **Partial B** (phone offline, station online): Station forwards the pass to the server via [AuthorizeOfflinePass](#21-authorizeofflinepass) MQTT message.

The app MUST request biometric or PIN confirmation from the user before sending this message.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"OfflineAuthRequest"` |
| `offlinePass` | object | Yes | Complete OfflinePass object (see [Chapter 06 — Security](06-security.md)) |
| `counter` | integer | Yes | Monotonically increasing counter (anti-replay) |
| `sessionProof` | string | Yes | HMAC-SHA256 proof binding this request to the BLE session key. Canonical construction: [ble-handshake.md §4.1](profiles/offline/ble-handshake.md) — `Base64(HMAC-SHA256(SessionKey, LP(UTF8("OfflineAuthRequest")) ‖ LP(UTF8(passId)) ‖ LP(UTF8(decimal(counter)))))`, where `LP(x) = U16BE(byteLength(x)) ‖ x` (same length-prefix as §6.5 Pin 3/4). Base64-encoded, exactly 44 characters. (N1: the prior 64-char hex/4-input form is withdrawn.) |

**Station-side validation (Full Offline)** — the station MUST perform all 10 checks:

1. ECDSA P-256 signature valid (against server public key)
2. `expiresAt` not passed
3. `revocationEpoch` >= station's `RevocationEpoch` configuration
4. `deviceId` matches Hello `deviceId`
5. `stationId` matches this station (if station-restricted in pass)
6. `maxUses` not exceeded
7. `maxTotalCredits` not exceeded
8. `maxCreditsPerTx` not exceeded for this transaction
9. `minIntervalSec` elapsed since last transaction from this pass
10. `counter` > `lastSeenCounter` (anti-replay)

#### Example

```json
{
  "type": "OfflineAuthRequest",
  "offlinePass": {
    "passId": "opass_a8b9c0d1e2f3",
    "sub": "sub_xyz789",
    "deviceId": "device_uuid_123",
    "issuedAt": "2026-02-05T10:00:00.000Z",
    "expiresAt": "2026-02-06T10:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30,
      "allowedServiceTypes": [
        "svc_eco",
        "svc_standard"
      ]
    },
    "constraints": {
      "minIntervalSec": 60,
      "stationOfflineWindowHours": 72,
      "stationMaxOfflineTx": 100
    },
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEUCIQDXKT0ewRBp/nkPY/qh6mBjwSn4BE7fmjDTdjcP1dhIyQIgPyXM1VnFZtrG6WaOgpRwiQIeFF2I2zeFsb05dyel1rE="
  },
  "counter": 5,
  "sessionProof": "ObgxpE1Ad+xl6P8fRWtBstqMY2Tjan9oK/LIWofxvrI="
}
```

> The `sessionProof` above is illustrative (Base64-encoded HMAC-SHA256, 44 chars), computed per [ble-handshake.md §4.1](profiles/offline/ble-handshake.md); it does not correspond to the example fields shown. On the wire this message travels inside the §6.5.3 AEAD frame.

---

### 7.6 ServerSignedAuth

| Property | Value |
|----------|-------|
| **Direction** | App → Station |
| **Transport** | BLE |
| **Characteristic** | `0000FFF3-0000-1000-8000-00805F9B34FB` (Write) |
| **Trigger** | Partial A scenario (phone online, station offline) — app obtained server authorization via HTTPS |
| **Expected Response** | [AuthResponse](#77-authresponse) on FFF4 |
| **Timeout** | 10 seconds |

Used in the **Partial A** offline scenario where the phone has internet connectivity but the station does not. The app first calls `POST /sessions/offline-auth` on the server, which returns a signed authorization blob. The app then delivers this to the station via BLE.

The station verifies the server's ECDSA P-256 signature without needing network access.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"ServerSignedAuth"` |
| `signedAuthorization` | string | Yes | Base64-encoded server-signed authorization blob (ECDSA P-256) |
| `sessionId` | string | Yes | Server-assigned session ID (`sess_{uuid}`) |

The `signedAuthorization` blob contains:
- `bayId`, `serviceId`, `durationSeconds` — authorized session parameters
- `issuedAt`, `expiresAt` — validity window
- Server ECDSA P-256 signature (RFC 6979 deterministic nonce)

The station MUST verify the signature using its stored `OfflinePassPublicKey` (during key rotation the station also accepts the internally cached previous key for a grace period; see §6.7 in Chapter 06).

#### Example

```json
{
  "type": "ServerSignedAuth",
  "signedAuthorization": {
    "data": "eyJhcHBOb25jZSI6IkRUVXJUME1PS1JpekYyN1JIMC9YVHBVSHcwWnJoSlh0MUsxT0NYSXhybXc9IiwiYXV0aElkIjoiYXV0aF80YTRjOTE3YmY4N2YiLCJiYXlJZCI6ImJheV85M2EwMGMxNjJjNmMiLCJjcmVkaXRzQXV0aG9yaXplZCI6MjAwLCJkZXZpY2VJZCI6ImRldl8zZTMwOTE1ODc1YzdhYjMyIiwiZHVyYXRpb25TZWNvbmRzIjozMDAsImV4cGlyZXNBdCI6IjIwMjYtMDItMTNUMTA6MDU6MDAuMDAwWiIsImlzc3VlZEF0IjoiMjAyNi0wMi0xM1QxMDowMDowMC4wMDBaIiwic2VydmljZUlkIjoic3ZjX2VjbyIsInNlc3Npb25JZCI6InNlc3NfZjFhMmIzYzRlNWQ2Iiwic3RhdGlvbklkIjoic3RuX2E4OTVmYTRkIiwic3ViIjoic3ViX2RjYzIyNjhhM2Q5MDlkYzgifQ==",
    "signature": "MEUCIQD+EA9zECEYWXwf8kdX6rtClmSWF06EqDQXYKHgpU9+fQIgFM3UX/MtfM8en2XbYZeCkd4vIMfXH8kfc38Xa17rD7o=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "sessionId": "sess_f1a2b3c4e5d6"
}
```

---

### 7.7 AuthResponse

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF4-0000-1000-8000-00805F9B34FB` (Notify) |
| **Trigger** | Station completes validation of OfflineAuthRequest or ServerSignedAuth |
| **Expected Response** | If `Accepted` → [StartServiceRequest](#78-startservicerequest) on FFF3 |
| **Timeout** | N/A (station sends after validation) |

Authentication result from the station. On `Accepted`, the app MAY proceed to start a service. On `Rejected`, the app MUST display the error and disconnect.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"AuthResponse"` |
| `result` | string | Yes | `"Accepted"` or `"Rejected"` |
| `sessionKeyConfirmation` | string | Cond. | HMAC confirmation of shared session key (when `Accepted`) |
| `reason` | string | Cond. | Rejection reason code (when `Rejected`) |
| `errorCode` | integer | Cond. | Numeric error code (when `Rejected`) |

**Rejection reasons (BLE-specific error codes):**

| Error Code | Reason | Description |
|------------|--------|-------------|
| `2002` | `OFFLINE_PASS_INVALID` | Signature verification failed |
| `2003` | `OFFLINE_PASS_EXPIRED` | Pass has expired |
| `2004` | `OFFLINE_EPOCH_REVOKED` | Revocation epoch check failed |
| `4002` | `OFFLINE_LIMIT_EXCEEDED` | Max uses or credits exceeded |
| `4003` | `OFFLINE_RATE_LIMITED` | Too soon after previous transaction |
| `2005` | `OFFLINE_COUNTER_REPLAY` | Counter replay detected |
| `2006` | `OFFLINE_STATION_MISMATCH` | OfflinePass stationId constraint does not match the connected station |
| `2013` | `BLE_AUTH_FAILED` | Session key derivation or session proof invalid |
| `4004` | `OFFLINE_PER_TX_EXCEEDED` | Per-transaction credit limit exceeded |

#### Example

**Accepted:**

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "uo31nIXlLPNLPc8rCOeJWYwbDh/ycVRE692174J5jp0="
}
```

**Rejected:**

```json
{
  "type": "AuthResponse",
  "result": "Rejected",
  "reason": "OFFLINE_PASS_EXPIRED",
  "errorCode": 2003
}
```

---

### 7.8 StartServiceRequest

| Property | Value |
|----------|-------|
| **Direction** | App → Station |
| **Transport** | BLE |
| **Characteristic** | `0000FFF3-0000-1000-8000-00805F9B34FB` (Write) |
| **Trigger** | User selects a service after successful authentication |
| **Expected Response** | [StartServiceResponse](#79-startserviceresponse) on FFF4 |
| **Timeout** | 10 seconds |

Requests the station to start a service on a specific bay. Only valid after a successful [AuthResponse](#77-authresponse).

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"StartServiceRequest"` |
| `bayId` | string | Yes | Target bay identifier (`bay_{uuid}`) |
| `serviceId` | string | Yes | Catalog service to activate (`svc_{id}`) |
| `programNumber` | integer | Yes | Ordinal of the physical program to run on that bay. Offline there is no StartService command, so the app reads the binding from the catalog the station holds |
| `requestedDurationSeconds` | integer | Yes | Requested session duration in seconds |

#### Example

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300
}
```

---

### 7.9 StartServiceResponse

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF4-0000-1000-8000-00805F9B34FB` (Notify) |
| **Trigger** | Station processes StartServiceRequest |
| **Expected Response** | N/A (app monitors [ServiceStatus](#712-servicestatus-fff5) on FFF5) |
| **Timeout** | N/A |

Confirmation that the service has started (or was rejected). On `Accepted`, the station begins sending periodic [ServiceStatus](#712-servicestatus-fff5) notifications on FFF5.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"StartServiceResponse"` |
| `result` | string | Yes | `"Accepted"` or `"Rejected"` |
| `sessionId` | string | Cond. | Local session identifier (when `Accepted`) |
| `offlineTxId` | string | Cond. | Offline transaction identifier (`otx_{uuid}`) for receipt tracking (when `Accepted`) |
| `errorCode` | integer | Cond. | Error code (when `Rejected`) |
| `errorText` | string | Cond. | Error description (when `Rejected`) |
| `programNumber` | integer | Cond. | **Echo** of the requested ordinal, so a refusal names what it refused |

#### Example

**Accepted:**

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_a1b2c3d4e5f6",
  "offlineTxId": "otx_d4e5f6a7b8c9"
}
```

**Rejected:**

```json
{
  "type": "StartServiceResponse",
  "result": "Rejected",
  "errorCode": 3001,
  "errorText": "BAY_BUSY"
}
```

---

### 7.10 StopServiceRequest

| Property | Value |
|----------|-------|
| **Direction** | App → Station |
| **Transport** | BLE |
| **Characteristic** | `0000FFF3-0000-1000-8000-00805F9B34FB` (Write) |
| **Trigger** | User requests to stop the active service, or session timer expires |
| **Expected Response** | [StopServiceResponse](#711-stopserviceresponse) on FFF4 |
| **Timeout** | 10 seconds |

Requests the station to stop the currently active service. The station MAY also auto-stop when the authorized duration expires.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"StopServiceRequest"` |
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |
| `sessionId` | string | Yes | Session to stop (from [StartServiceResponse](#79-startserviceresponse)) |

#### Example

```json
{
  "type": "StopServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "sessionId": "sess_a1b2c3d4e5f6"
}
```

---

### 7.11 StopServiceResponse

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF4-0000-1000-8000-00805F9B34FB` (Notify) |
| **Trigger** | Station completes service stop |
| **Expected Response** | App reads [Receipt](#713-receipt-fff6) from FFF6 after `ServiceStatus` shows `ReceiptReady` |
| **Timeout** | N/A |

Final billing information for the session. After this, the station generates a signed receipt and makes it available on FFF6.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `type` | string | Yes | `"StopServiceResponse"` |
| `result` | string | Yes | `"Accepted"` or `"Rejected"` |
| `actualDurationSeconds` | integer | Cond. | Actual service duration in seconds (when `Accepted`) |
| `creditsCharged` | integer | Cond. | Total credits debited (when `Accepted`) |

#### Example

```json
{
  "type": "StopServiceResponse",
  "result": "Accepted",
  "actualDurationSeconds": 298,
  "creditsCharged": 50
}
```

---

### 7.12 ServiceStatus (FFF5)

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF5-0000-1000-8000-00805F9B34FB` (Notify) |
| **Trigger** | Periodic during active session (every few seconds), and on status transitions |
| **Expected Response** | None (informational, app updates UI) |
| **Timeout** | N/A |

Real-time service status updates during an active BLE session. The app subscribes to FFF5 notifications to display progress, elapsed/remaining time, and consumption data.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `bayId` | string | Yes | Bay identifier (`bay_{uuid}`) |
| `status` | string | Yes | Current service status — see enum below |
| `sessionId` | string | Yes | Session identifier |
| `elapsedSeconds` | integer | Yes | Seconds since service started |
| `remainingSeconds` | integer | Yes | Seconds remaining until auto-stop |
| `meterValues` | object | No | Current consumption readings |
| `meterValues.liquidMl` | integer | No | Liquid consumed in milliliters |
| `meterValues.consumableMl` | integer | No | Consumable consumed in milliliters |
| `meterValues.energyWh` | integer | No | Energy consumed in watt-hours |

**`status` enum values:**

| Value | Description |
|-------|-------------|
| `Starting` | Hardware is initializing |
| `Running` | Service is active |
| `Complete` | Service finished (timer expired or user stopped) |
| `ReceiptReady` | Signed receipt is available to read from FFF6 |
| `Error` | Hardware error during service |

#### Example

**Running:**

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

**Receipt ready:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_a1b2c3d4e5f6",
  "elapsedSeconds": 298,
  "remainingSeconds": 0
}
```

---

### 7.13 Receipt (FFF6)

| Property | Value |
|----------|-------|
| **Direction** | Station → App |
| **Transport** | BLE |
| **Characteristic** | `0000FFF6-0000-1000-8000-00805F9B34FB` (Read) |
| **Trigger** | App reads after [ServiceStatus](#712-servicestatus-fff5) reports `ReceiptReady` |
| **Expected Response** | N/A (read operation) |
| **Timeout** | BLE read timeout (implementation-defined, RECOMMENDED 5s) |

A cryptographically signed transaction receipt generated by the station after every offline session. The receipt is signed with the station's ECDSA P-256 private key and includes a monotonic `txCounter` carried as forensic evidence.

The app MUST store the receipt in its offline transaction log and sync it to the server when connectivity is restored.

#### Payload

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `offlineTxId` | string | Yes | Offline transaction identifier (`otx_{uuid}`) |
| `bayId` | string | Yes | Bay where service was provided (`bay_{uuid}`) |
| `serviceId` | string | Yes | Service that was activated (`svc_{id}`) |
| `startedAt` | string | Yes | Session start time (ISO 8601 UTC) |
| `endedAt` | string | Yes | Session end time (ISO 8601 UTC) |
| `durationSeconds` | integer | Yes | Actual session duration in seconds |
| `creditsCharged` | integer | Yes | Credits debited from user |
| `meterValues` | object | No | Final consumption readings |
| `meterValues.liquidMl` | integer | No | Liquid consumed in milliliters |
| `meterValues.consumableMl` | integer | No | Consumable consumed in milliliters |
| `meterValues.energyWh` | integer | No | Energy consumed in watt-hours |
| `receipt` | object | Yes | Cryptographic receipt |
| `receipt.data` | string | Yes | Base64-encoded canonical JSON of the receipt fields above |
| `receipt.signature` | string | Yes | Base64-encoded ECDSA P-256 signature over the SHA-256 digest of the **canonical bytes** that `data` encodes — not of the base64 string itself |
| `receipt.signatureAlgorithm` | string | Yes | `"ECDSA-P256-SHA256"` |
| `txCounter` | integer | Yes | Monotonically increasing transaction counter (included in signed receipt data) |

> **Receipt signing:** `receipt_data = canonical_json(fields)` where fields include `txCounter`;
> `digest = SHA-256(receipt_data)`, `signature = ECDSA-P256-Sign(station_private_key, digest)` using
> an RFC 6979 deterministic nonce, and `receipt.data = base64(receipt_data)`.
>
> **The digest is over the canonical bytes, never over the base64.** Base64 is the wire encoding of
> the `receipt.data` field and is not part of the cryptographic input — see
> [Chapter 06 §6.2 Note 1](06-security.md#62-transaction-receipt-signing--ecdsa-p-256), which is
> normative and which this note previously contradicted. A station built to the older form signs
> `SHA-256(base64(canonical))`, which no server will verify.

> **Counter discontinuity:** The server records `txCounter` during reconciliation and does not gate on it. A discontinuity is worth an operator alert on the **station** — the usual causes are reboot, NVS corruption or a board swap — and the transaction is processed normally either way. It is not a fraud signal against the user and cannot prove completeness (`06-security.md` §6.3.1).

#### Example

```json
{
  "offlineTxId": "otx_d4e5f6a7b8c9",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-01-30T14:00:00.000Z",
  "endedAt": "2026-01-30T14:04:58.000Z",
  "durationSeconds": 298,
  "creditsCharged": 50,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  },
  "receipt": {
    "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJjcmVkaXRzQ2hhcmdlZCI6NTAsImRldmljZUlkIjoiZGV2X2Q0ZTVmNmE3IiwiZHVyYXRpb25TZWNvbmRzIjoyOTgsImVuZGVkQXQiOiIyMDI2LTAxLTMwVDE0OjA0OjU4LjAwMFoiLCJtZXRlclZhbHVlcyI6eyJjb25zdW1hYmxlTWwiOjUwMCwiZW5lcmd5V2giOjE1MCwibGlxdWlkTWwiOjQ1MjAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzXzkyZGYwZDVjMDExZWFmNzQiLCJvZmZsaW5lVHhJZCI6Im90eF9kNGU1ZjZhN2I4YzkiLCJwYXNzQ291bnRlciI6MzYsInNlcnZpY2VJZCI6InN2Y19lY28iLCJzdGFydGVkQXQiOiIyMDI2LTAxLTMwVDE0OjAwOjAwLjAwMFoiLCJ0eENvdW50ZXIiOjUsInVzZXJJZCI6InN1Yl8wNjA3MmE4MjllMzkxOGE4In0=",
    "signature": "MEQCIEAom60l588MWMqdsctH4zpEpTa6OdbeaaX7nAzxtFjRAiAKO1boLTVgKMP+26XbaUXSNa5g+6lQ45fwUWaA5vlw5Q==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5,
  "offlinePassId": "opass_92df0d5c011eaf74",
  "userId": "sub_06072a829e3918a8",
  "passCounter": 36
}
```

---

## Appendix A — Message ID Prefix Convention

The `messageId` field in the MQTT envelope SHOULD use the following prefixes for human readability and log filtering:

| Prefix | Used By |
|--------|---------|
| `boot_` | BootNotification |
| `hb_` | Heartbeat |
| `evt_` | StatusNotification, MeterValues, FirmwareStatusNotification, DiagnosticsNotification |
| `sec_` | SecurityEvent |
| `tx_` | TransactionEvent |
| `auth_` | AuthorizeOfflinePass |
| `cmd_` | All server-to-station REQUEST messages (StartService, StopService, ReserveBay, etc.) |
| `lwt-` | ConnectionLost (LWT) |

The prefix is followed by an RFC 4122 UUID: `{prefix}{uuid}` (e.g., `cmd_550e8400-e29b-41d4-a716-446655440000`).

> **Note:** The prefix is a convention, not a protocol requirement. Implementations MUST NOT rely on the prefix for message routing or type detection — use the `action` field instead.

---

## Appendix B — MQTT Message Expiry Reference

Cross-reference table for MQTT Message Expiry Interval per action (see [Chapter 02 — Transport](02-transport.md), Section 5):

| Action | Response Timeout | MQTT Expiry Interval | Never Expires |
|--------|----------------:|---------------------:|:-------------:|
| BootNotification | 30s | — | Yes |
| Heartbeat | 30s | 30s | No |
| StatusNotification | — | 30s | No |
| MeterValues | — | 120s | No |
| TransactionEvent | 60s | — | Yes |
| SessionEnded | — | — | Yes |
| SecurityEvent | — | — | Yes |
| ConnectionLost | — | — | Yes |
| AuthorizeOfflinePass | 15s | 30s | No |
| ReserveBay | 5s | 30s | No |
| CancelReservation | 5s | 30s | No |
| StartService | 10s | 30s | No |
| StopService | 10s | 30s | No |
| ChangeConfiguration | 60s | 120s | No |
| GetConfiguration | 30s | 120s | No |
| Reset | 30s | 120s | No |
| SetMaintenanceMode | 30s | 120s | No |
| UpdateFirmware | 300s | 600s | No |
| FirmwareStatusNotification | — | 60s | No |
| GetDiagnostics | 300s | 600s | No |
| DiagnosticsNotification | — | 60s | No |
| UpdateServiceCatalog | 30s | 60s | No |

---

## Appendix C — Error Code Quick Reference

Error codes referenced in this chapter. For the full catalog, see [Chapter 07 — Error Codes](07-errors.md).

### 1xxx Transport Errors

| Code | Text | Used By |
|------|------|---------|
| 1005 | `INVALID_MESSAGE_FORMAT` | All Server→Station commands (implicit); also BootNotification, Heartbeat, TransactionEvent, AuthorizeOfflinePass (explicit) |
| 1007 | `PROTOCOL_VERSION_MISMATCH` | BootNotification |
| 1011 | `URL_UNREACHABLE` | UpdateFirmware, GetDiagnostics |
| 1010 | `MESSAGE_TIMEOUT` | Heartbeat |
| 1012 | `MAC_VERIFICATION_FAILED` | Any (message signing), ChangeConfiguration |
| 1013 | `MAC_MISSING` | Any (message signing) |

### 2xxx Authentication & Authorization Errors

| Code | Text | Used By |
|------|------|---------|
| 2001 | `STATION_NOT_REGISTERED` | BootNotification |
| 2002 | `OFFLINE_PASS_INVALID` | AuthorizeOfflinePass, TransactionEvent, BLE AuthResponse |
| 2003 | `OFFLINE_PASS_EXPIRED` | AuthorizeOfflinePass, BLE AuthResponse |
| 2004 | `OFFLINE_EPOCH_REVOKED` | AuthorizeOfflinePass, TransactionEvent, BLE AuthResponse |
| 2005 | `OFFLINE_COUNTER_REPLAY` | AuthorizeOfflinePass, TransactionEvent, BLE AuthResponse |
| 2006 | `OFFLINE_STATION_MISMATCH` | AuthorizeOfflinePass, BLE AuthResponse |
| 2007 | `COMMAND_NOT_SUPPORTED` | All Server→Station commands (implicit) |
| 2008 | `ACTION_NOT_PERMITTED` | ChangeConfiguration |
| 2013 | `BLE_AUTH_FAILED` | BLE AuthResponse |
| 2014 | `OFFLINE_PASS_REVOKED` | AuthorizeOfflinePass, TransactionEvent, BLE AuthResponse |
| 2015 | `OFFLINE_ORG_MISMATCH` | AuthorizeOfflinePass, TransactionEvent, BLE AuthResponse |
| 2016 | `OFFLINE_USER_MISMATCH` | TransactionEvent |
| 2017 | `OFFLINE_RECEIPT_MISMATCH` | TransactionEvent |
| 2018 | `SERVER_AUTH_NONCE_MISMATCH` | BLE AuthResponse (Partial A ServerSignedAuth) |

### 3xxx Session & Bay Errors

| Code | Text | Used By |
|------|------|---------|
| 3001 | `BAY_BUSY` | StartService, ReserveBay, SetMaintenanceMode, BLE StartServiceResponse |
| 3002 | `BAY_NOT_READY` | StartService, ReserveBay, BLE StartServiceResponse |
| 3003 | `SERVICE_UNAVAILABLE` | StartService, BLE StartServiceResponse |
| 3004 | `INVALID_SERVICE` | StartService, BLE StartServiceResponse |
| 3005 | `BAY_NOT_FOUND` | StartService, StopService, ReserveBay, CancelReservation, SetMaintenanceMode, BLE StartServiceResponse |
| 3006 | `SESSION_NOT_FOUND` | StartService, StopService, BLE StopServiceResponse |
| 3007 | `SESSION_MISMATCH` | StopService, BLE StopServiceResponse |
| 3008 | `DURATION_INVALID` | StartService, BLE StartServiceResponse |
| 3009 | `HARDWARE_ACTIVATION_FAILED` | StartService, BLE StartServiceResponse |
| 3010 | `MAX_DURATION_EXCEEDED` | StartService, BLE StartServiceResponse |
| 3011 | `BAY_MAINTENANCE` | StartService, ReserveBay, StopService |
| 3012 | `RESERVATION_NOT_FOUND` | CancelReservation, StartService |
| 3013 | `RESERVATION_EXPIRED` | StartService, CancelReservation |
| 3014 | `BAY_RESERVED` | StartService, ReserveBay |
| 3015 | `PAYLOAD_INVALID` | ChangeConfiguration, TransactionEvent, UpdateServiceCatalog |
| 3016 | `ACTIVE_SESSIONS_PRESENT` | Reset |
| 3017 | `PROGRAM_NOT_DECLARED` | StartService |
| 3018 | `TOPOLOGY_MISMATCH` | BootNotification |

### 4xxx Payment & Credit Errors

| Code | Text | Used By |
|------|------|---------|
| 4002 | `OFFLINE_LIMIT_EXCEEDED` | AuthorizeOfflinePass, BLE AuthResponse |
| 4003 | `OFFLINE_RATE_LIMITED` | AuthorizeOfflinePass, BLE AuthResponse |
| 4004 | `OFFLINE_PER_TX_EXCEEDED` | AuthorizeOfflinePass, BLE AuthResponse |

### 5xxx Station Hardware & Software Errors

| Code | Text | Used By |
|------|------|---------|
| 5001 | `PUMP_SYSTEM` | StatusNotification (Faulted), StartService |
| 5002 | `FLUID_SYSTEM` | StatusNotification (Faulted) |
| 5003 | `CONSUMABLE_SYSTEM` | StatusNotification (Faulted) |
| 5004 | `ELECTRICAL_SYSTEM` | StatusNotification (Faulted), StartService |
| 5009 | `EMERGENCY_STOP` | StatusNotification (Faulted) |
| 5014 | `DOWNLOAD_FAILED` | UpdateFirmware |
| 5015 | `CHECKSUM_MISMATCH` | UpdateFirmware |
| 5016 | `VERSION_ALREADY_INSTALLED` | UpdateFirmware |
| 5017 | `INSUFFICIENT_STORAGE` | UpdateFirmware |
| 5018 | `INSTALLATION_FAILED` | UpdateFirmware |
| 5019 | `UPLOAD_FAILED` | GetDiagnostics |
| 5020 | `INVALID_TIME_WINDOW` | GetDiagnostics |
| 5021 | `NO_DIAGNOSTICS_AVAILABLE` | GetDiagnostics |
| 5023 | `INVALID_CATALOG` | UpdateServiceCatalog |
| 5024 | `UNSUPPORTED_SERVICE` | UpdateServiceCatalog |
| 5025 | `CATALOG_TOO_LARGE` | UpdateServiceCatalog |
| 5103 | `STORAGE_ERROR` | GetDiagnostics, UpdateFirmware, UpdateServiceCatalog |
| 5107 | `OPERATION_IN_PROGRESS` | Reset, UpdateFirmware, GetDiagnostics |
| 5108 | `CONFIGURATION_KEY_READONLY` | ChangeConfiguration |
| 5109 | `INVALID_CONFIGURATION_VALUE` | ChangeConfiguration |
| 5106 | `CLOCK_ERROR` | Heartbeat |
| 5110 | `RESET_FAILED` | Reset |

### 6xxx Server Errors

| Code | Text | Used By |
|------|------|---------|
| 6001 | `SERVER_INTERNAL_ERROR` | All Server→Station commands (implicit); also BootNotification, Heartbeat, TransactionEvent, AuthorizeOfflinePass (explicit) |
