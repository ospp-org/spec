# OSPP JSON Schemas

> **Schema Version:** 0.1.0-draft.1 | **JSON Schema Draft:** 2020-12

This directory contains JSON Schema definitions for every message in the OSPP protocol. Schemas are generated from the normative message catalog in [Chapter 03 — Message Catalog](../spec/03-messages.md).

---

## Directory Structure

```
schemas/
├── common/          17 shared type definitions ($ref targets)
├── mqtt/            46 MQTT message payload schemas
├── ble/             13 BLE message schemas
└── README.md        This file
```

**Total: 76 schema files.**

---

## Common Types (`common/`)

Shared definitions referenced by message schemas via `$ref`.

| File | Type | Description |
|------|------|-------------|
| [`station-id.schema.json`](common/station-id.schema.json) | string | Station identifier (`stn_{uuid}`) |
| [`bay-id.schema.json`](common/bay-id.schema.json) | string | Bay identifier (`bay_{uuid}`) |
| [`session-id.schema.json`](common/session-id.schema.json) | string | Session identifier (`sess_{uuid}`) |
| [`service-id.schema.json`](common/service-id.schema.json) | string | Service identifier (`svc_{id}`) |
| [`reservation-id.schema.json`](common/reservation-id.schema.json) | string | Reservation identifier (`rsv_{uuid}`) |
| [`offline-tx-id.schema.json`](common/offline-tx-id.schema.json) | string | Offline transaction identifier (`otx_{uuid}`) |
| [`offline-pass-id.schema.json`](common/offline-pass-id.schema.json) | string | OfflinePass identifier (`opass_{uuid}`) |
| [`user-id.schema.json`](common/user-id.schema.json) | string | User subject identifier (`sub_{id}`) |
| [`device-id.schema.json`](common/device-id.schema.json) | string | Mobile device identifier |
| [`timestamp.schema.json`](common/timestamp.schema.json) | string | ISO 8601 UTC with milliseconds |
| [`credit-amount.schema.json`](common/credit-amount.schema.json) | integer | Credit amount (atomic integer unit) |
| [`bay-status.schema.json`](common/bay-status.schema.json) | string | Bay state enum (Available, Reserved, Occupied, Finishing, Faulted, Unavailable, Unknown) |
| [`meter-values.schema.json`](common/meter-values.schema.json) | object | Consumption readings (liquidMl, consumableMl, energyWh) |
| [`offline-pass.schema.json`](common/offline-pass.schema.json) | object | Complete OfflinePass with allowance, constraints, ECDSA P-256 signature |
| [`receipt.schema.json`](common/receipt.schema.json) | object | ECDSA P-256 signed receipt (data + signature + algorithm) |
| [`service-item.schema.json`](common/service-item.schema.json) | object | Service catalog entry with dual pricing (credits + local currency) |
| [`mqtt-envelope.schema.json`](common/mqtt-envelope.schema.json) | object | MQTT message envelope (messageId, messageType, action, timestamp, source, protocolVersion, payload, mac) |

---

## MQTT Message Schemas (`mqtt/`)

Each MQTT action has separate schemas for REQUEST and RESPONSE payloads. EVENT messages have a single schema.

### Provisioning

| # | File | Direction | Type |
|:-:|------|-----------|------|
| 1 | [`boot-notification-request.schema.json`](mqtt/boot-notification-request.schema.json) | Station → Server | REQUEST |
| 2 | [`boot-notification-response.schema.json`](mqtt/boot-notification-response.schema.json) | Server → Station | RESPONSE |

### Authentication & Authorization

| # | File | Direction | Type |
|:-:|------|-----------|------|
| 3 | [`authorize-offline-pass-request.schema.json`](mqtt/authorize-offline-pass-request.schema.json) | Station → Server | REQUEST |
| 4 | [`authorize-offline-pass-response.schema.json`](mqtt/authorize-offline-pass-response.schema.json) | Server → Station | RESPONSE |

### Session Management

| # | File | Direction | Type |
|:-:|------|-----------|------|
| 5 | [`reserve-bay-request.schema.json`](mqtt/reserve-bay-request.schema.json) | Server → Station | REQUEST |
| 6 | [`reserve-bay-response.schema.json`](mqtt/reserve-bay-response.schema.json) | Station → Server | RESPONSE |
| 7 | [`cancel-reservation-request.schema.json`](mqtt/cancel-reservation-request.schema.json) | Server → Station | REQUEST |
| 8 | [`cancel-reservation-response.schema.json`](mqtt/cancel-reservation-response.schema.json) | Station → Server | RESPONSE |
| 9 | [`start-service-request.schema.json`](mqtt/start-service-request.schema.json) | Server → Station | REQUEST |
| 10 | [`start-service-response.schema.json`](mqtt/start-service-response.schema.json) | Station → Server | RESPONSE |
| 11 | [`stop-service-request.schema.json`](mqtt/stop-service-request.schema.json) | Server → Station | REQUEST |
| 12 | [`stop-service-response.schema.json`](mqtt/stop-service-response.schema.json) | Station → Server | RESPONSE |

### Payment & Credits

| # | File | Direction | Type |
|:-:|------|-----------|------|
| 13 | [`transaction-event-request.schema.json`](mqtt/transaction-event-request.schema.json) | Station → Server | REQUEST |
| 14 | [`transaction-event-response.schema.json`](mqtt/transaction-event-response.schema.json) | Server → Station | RESPONSE |

### Status & Monitoring

| # | File | Direction | Type |
|:-:|------|-----------|------|
| 15 | [`heartbeat-request.schema.json`](mqtt/heartbeat-request.schema.json) | Station → Server | REQUEST |
| 16 | [`heartbeat-response.schema.json`](mqtt/heartbeat-response.schema.json) | Server → Station | RESPONSE |
| 17 | [`status-notification.schema.json`](mqtt/status-notification.schema.json) | Station → Server | EVENT |
| 18 | [`meter-values-event.schema.json`](mqtt/meter-values-event.schema.json) | Station → Server | EVENT |
| 19 | [`connection-lost.schema.json`](mqtt/connection-lost.schema.json) | Broker → Server | EVENT (LWT) |
| 20 | [`security-event.schema.json`](mqtt/security-event.schema.json) | Station → Server | EVENT |

### Configuration & Firmware

| # | File | Direction | Type |
|:-:|------|-----------|------|
| 21 | [`change-configuration-request.schema.json`](mqtt/change-configuration-request.schema.json) | Server → Station | REQUEST |
| 22 | [`change-configuration-response.schema.json`](mqtt/change-configuration-response.schema.json) | Station → Server | RESPONSE |
| 23 | [`get-configuration-request.schema.json`](mqtt/get-configuration-request.schema.json) | Server → Station | REQUEST |
| 24 | [`get-configuration-response.schema.json`](mqtt/get-configuration-response.schema.json) | Station → Server | RESPONSE |
| 25 | [`reset-request.schema.json`](mqtt/reset-request.schema.json) | Server → Station | REQUEST |
| 26 | [`reset-response.schema.json`](mqtt/reset-response.schema.json) | Station → Server | RESPONSE |
| 27 | [`update-firmware-request.schema.json`](mqtt/update-firmware-request.schema.json) | Server → Station | REQUEST |
| 28 | [`update-firmware-response.schema.json`](mqtt/update-firmware-response.schema.json) | Station → Server | RESPONSE |
| 29 | [`firmware-status-notification.schema.json`](mqtt/firmware-status-notification.schema.json) | Station → Server | EVENT |
| 30 | [`get-diagnostics-request.schema.json`](mqtt/get-diagnostics-request.schema.json) | Server → Station | REQUEST |
| 31 | [`get-diagnostics-response.schema.json`](mqtt/get-diagnostics-response.schema.json) | Station → Server | RESPONSE |
| 32 | [`diagnostics-notification.schema.json`](mqtt/diagnostics-notification.schema.json) | Station → Server | EVENT |
| 33 | [`set-maintenance-mode-request.schema.json`](mqtt/set-maintenance-mode-request.schema.json) | Server → Station | REQUEST |
| 34 | [`set-maintenance-mode-response.schema.json`](mqtt/set-maintenance-mode-response.schema.json) | Station → Server | RESPONSE |
| 35 | [`update-service-catalog-request.schema.json`](mqtt/update-service-catalog-request.schema.json) | Server → Station | REQUEST |
| 36 | [`update-service-catalog-response.schema.json`](mqtt/update-service-catalog-response.schema.json) | Station → Server | RESPONSE |

---

## BLE Message Schemas (`ble/`)

BLE messages do not use the MQTT envelope. Each message is a standalone JSON payload exchanged via GATT characteristics.

### Read Characteristics (Static)

| # | File | Characteristic | Description |
|:-:|------|----------------|-------------|
| 37 | [`station-info.schema.json`](ble/station-info.schema.json) | FFF1 (Read) | Station identity, firmware, connectivity status |
| 38 | [`available-services.schema.json`](ble/available-services.schema.json) | FFF2 (Read) | Service catalog with pricing per bay |
| 49 | [`receipt.schema.json`](ble/receipt.schema.json) | FFF6 (Read) | ECDSA P-256 signed transaction receipt |

### Handshake (FFF3 Write → FFF4 Notify)

| # | File | Characteristic | Direction |
|:-:|------|----------------|-----------|
| 39 | [`hello.schema.json`](ble/hello.schema.json) | FFF3 (Write) | App → Station |
| 40 | [`challenge.schema.json`](ble/challenge.schema.json) | FFF4 (Notify) | Station → App |

### Authentication (FFF3 Write → FFF4 Notify)

| # | File | Characteristic | Direction |
|:-:|------|----------------|-----------|
| 41 | [`offline-auth-request.schema.json`](ble/offline-auth-request.schema.json) | FFF3 (Write) | App → Station (Full Offline / Partial B) |
| 42 | [`server-signed-auth.schema.json`](ble/server-signed-auth.schema.json) | FFF3 (Write) | App → Station (Partial A) |
| 43 | [`auth-response.schema.json`](ble/auth-response.schema.json) | FFF4 (Notify) | Station → App |

### Service Control (FFF3 Write → FFF4 Notify)

| # | File | Characteristic | Direction |
|:-:|------|----------------|-----------|
| 44 | [`start-service-request.schema.json`](ble/start-service-request.schema.json) | FFF3 (Write) | App → Station |
| 45 | [`start-service-response.schema.json`](ble/start-service-response.schema.json) | FFF4 (Notify) | Station → App |
| 46 | [`stop-service-request.schema.json`](ble/stop-service-request.schema.json) | FFF3 (Write) | App → Station |
| 47 | [`stop-service-response.schema.json`](ble/stop-service-response.schema.json) | FFF4 (Notify) | Station → App |

### Status (FFF5 Notify)

| # | File | Characteristic | Direction |
|:-:|------|----------------|-----------|
| 48 | [`service-status.schema.json`](ble/service-status.schema.json) | FFF5 (Notify) | Station → App |

---

## Validation Model

MQTT messages use a **two-layer validation** approach:

1. **Envelope validation:** The complete MQTT message (including `messageId`, `messageType`, `action`, `timestamp`, `source`, `protocolVersion`, `payload`, and optionally `mac`) is validated against [`common/mqtt-envelope.schema.json`](common/mqtt-envelope.schema.json).

2. **Payload validation:** The `payload` field is extracted and validated against the action-specific schema (e.g., [`mqtt/boot-notification-request.schema.json`](mqtt/boot-notification-request.schema.json) for a `BootNotification` REQUEST).

BLE messages do **not** use the MQTT envelope. Each BLE message is a standalone JSON payload validated directly against its schema in `ble/`.

Example payloads in [`../examples/payloads/mqtt/`](../examples/payloads/mqtt/) contain **payload-only** JSON (no envelope wrapper), matching the content of the `payload` field in a full MQTT message. To validate these examples:

```bash
# Validate a payload directly against its action-specific schema
ajv validate \
  -s schemas/mqtt/boot-notification-request.schema.json \
  -r "schemas/common/*.schema.json" \
  -d examples/payloads/mqtt/boot-notification.request.json
```

Conformance test vectors in [`../conformance/test-vectors/`](../conformance/test-vectors/) contain **payload-only** JSON (no envelope wrapper), so they can be validated directly against action-specific schemas.

---

## Usage

### Validating Messages with ajv-cli

```bash
# Install ajv-cli
npm install -g ajv-cli

# Validate a BootNotification REQUEST payload
ajv validate \
  -s schemas/mqtt/boot-notification-request.schema.json \
  -r "schemas/common/*.schema.json" \
  -d message.json

# Validate a BLE OfflineAuthRequest
ajv validate \
  -s schemas/ble/offline-auth-request.schema.json \
  -r "schemas/common/*.schema.json" \
  -d ble-message.json

# Validate a full MQTT envelope (then validate payload separately)
ajv validate \
  -s schemas/common/mqtt-envelope.schema.json \
  -r "schemas/common/*.schema.json" \
  -d envelope.json
```

### Validating in Code (Node.js)

```javascript
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

// Load common schemas as references
const commonSchemas = [
  require("./schemas/common/station-id.schema.json"),
  require("./schemas/common/bay-id.schema.json"),
  require("./schemas/common/timestamp.schema.json"),
  // ... load all common schemas
];
commonSchemas.forEach(s => ajv.addSchema(s));

// Compile and validate
const schema = require("./schemas/mqtt/boot-notification-request.schema.json");
const validate = ajv.compile(schema);

const valid = validate(payload);
if (!valid) {
  console.error(validate.errors);
}
```

---

## Conventions

- **JSON Schema Draft:** 2020-12
- **`$id` namespace:** `https://ospp-standard.org/schemas/v1/{category}/{filename}`
- **`$ref` paths:** Relative within the schemas directory (e.g., `../common/station-id.schema.json`)
- **`additionalProperties: false`** on all object schemas (strict validation)
- **Naming:** `{message-name-kebab-case}.schema.json` for single-direction messages, `{message-name}-request.schema.json` / `{message-name}-response.schema.json` for REQUEST/RESPONSE pairs
- **Identifiers:** All ID types use `{prefix}_{uuid}` patterns with regex validation
- **Timestamps:** ISO 8601 UTC with milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`)
- **Monetary values:** Integer smallest units (credits = atomic, local currency = minor units)
- **Enums:** All string enumerations use PascalCase (e.g., `"Accepted"`, `"Available"`, `"PerMinute"`, `"PowerOn"`)

---

## Cross-Reference to Spec

| Spec Chapter | Schema Coverage |
|--------------|----------------|
| [03 — Message Catalog](../spec/03-messages.md) | All 39 messages → 76 schema files (REQUEST + RESPONSE + EVENT + common types) |
| [02 — Transport](../spec/02-transport.md) | `common/mqtt-envelope.schema.json` |
| [06 — Security](../spec/06-security.md) | `common/offline-pass.schema.json`, `common/receipt.schema.json` |
