# Examples

**Status: Draft** | **OSPP Version:** 0.1.0-draft.1

Validated example payloads and annotated flow sequences for the OSPP protocol.

> **Note:** All content in this directory is **informative** (non-normative).
> Examples illustrate correct usage but do not define protocol behavior.
> The normative specification is in [`spec/`](../spec/).

---

## 1. Organization

```
examples/
├── payloads/          # Individual message examples
│   ├── mqtt/          # MQTT messages (station ↔ server)
│   └── ble/           # BLE messages (mobile ↔ station)
├── flows/             # Annotated end-to-end sequences
└── error-scenarios/   # Error and edge case examples
```

- **payloads/** — Standalone JSON files, one per message. MQTT files contain the
  **payload portion only** (the content of the `payload` field in the envelope).
  BLE files contain the complete message. All files validate against their
  corresponding JSON Schema.
- **flows/** — Markdown documents showing multi-step interactions with narrative
  context, Mermaid diagrams, and inline JSON payloads.
- **error-scenarios/** — Examples of error conditions, recovery procedures, and
  edge cases.

## 2. Payload Examples

### MQTT Payloads (`payloads/mqtt/`)

Naming convention: `{action}.{type}.json`
- `{action}` — Action name in kebab-case (e.g., `boot-notification`)
- `{type}` — `request`, `response`, or omitted for events

| Category | Files | Description |
|----------|-------|-------------|
| Core | `boot-notification.*`, `heartbeat.*`, `status-notification.event.json`, `connection-lost.event.json` | Boot, heartbeat, status, LWT |
| Transaction | `start-service.*`, `stop-service.*`, `meter-values.event.json`, `reserve-bay.*`, `cancel-reservation.*`, `transaction-event.*` | Session lifecycle, metering, reservations |
| Device Management | `get-configuration.*`, `change-configuration.*`, `update-firmware.*`, `firmware-status-notification.event.json`, `get-diagnostics.*`, `diagnostics-notification.event.json`, `reset.*`, `set-maintenance-mode.*`, `update-service-catalog.*` | Configuration, firmware, diagnostics |
| Security | `authorize-offline-pass.*`, `security-event.event.json` | Offline authorization, security events |

### BLE Payloads (`payloads/ble/`)

| File | Description |
|------|-------------|
| `station-info.json` | Station identity broadcast |
| `available-services.json` | Bay and service catalog |
| `hello.json` | Mobile → Station handshake initiation |
| `challenge.json` | Station → Mobile challenge with nonce |
| `offline-auth-request.json` | Mobile → Station OfflinePass presentation |
| `server-signed-auth.json` | Mobile → Station server-signed authorization (Partial A) |
| `auth-response.accepted.json`, `auth-response.rejected.json` | Station → Mobile authentication result (accepted / rejected variants) |
| `start-service-request.json` | Mobile → Station service activation |
| `start-service-response.json` | Station → Mobile activation confirmation |
| `service-status.running.json`, `service-status.receipt-ready.json` | Station → Mobile real-time metering (running / receipt-ready variants) |
| `stop-service-request.json` | Mobile → Station service termination |
| `stop-service-response.json` | Station → Mobile stop confirmation |
| `receipt.json` | Station → Mobile signed proof of service |

## 3. Flow Examples

| File | Scenario | Key Messages |
|------|----------|-------------|
| `01-boot-sequence.md` | Station power-on and registration | BootNotification, StatusNotification, Heartbeat |
| `02-online-session.md` | Complete online service session | StartService, MeterValues, StopService |
| `03-web-payment-session.md` | Session initiated via web payment | HTTP payment, StartService, SessionCompleted |
| `04-full-offline-session.md` | Full offline BLE session | BLE handshake, OfflinePass, Receipt |
| `05-partial-a-session.md` | Partial A: phone online, station offline | Server-signed auth via BLE |
| `06-partial-b-session.md` | Partial B: phone offline, station online | OfflinePass via BLE, server validation |
| `07-session-stop.md` | Session stop scenarios | StopService, early stop, timeout |
| `08-credit-purchase.md` | Credit purchase / top-up | HTTPS payment, wallet top-up |
| `09-heartbeat-monitoring.md` | Heartbeat and offline detection | Heartbeat, ConnectionLost, alerts |
| `10-error-recovery.md` | Error recovery and reconnection | BootNotification, buffered replay |
| `11-reconciliation.md` | Offline transaction reconciliation | TransactionEvent, txCounter |
| `12-firmware-update.md` | OTA firmware update | UpdateFirmware, FirmwareStatus |

## 4. Error Scenarios

| File | Scenario | Key Error Codes |
|------|----------|----------------|
| `01-bay-busy-race-condition.md` | Two users attempt the same bay simultaneously | 3001 BAY_BUSY |
| `02-hardware-failure-mid-session.md` | Hardware fault during active session | 5xxx hardware errors, session recovery |
| `03-offline-pass-expired.md` | OfflinePass expiry during BLE handshake | 2003 OFFLINE_PASS_EXPIRED |
| `04-ack-timeout-station-unresponsive.md` | Station fails to ACK server commands | 6002 ACK_TIMEOUT, retry/circuit breaker |
| `05-mac-verification-failure.md` | HMAC verification failure on signed message | 1012 MAC_VERIFICATION_FAILED |

## 5. Validation

Validate payload examples against their JSON Schemas:

```bash
# Install ajv-cli
npm install -g ajv-cli ajv-formats

# Validate a single payload
ajv validate -s schemas/mqtt/boot-notification-request.schema.json \
             -d examples/payloads/mqtt/boot-notification.request.json \
             --spec=draft2020

# Validate all MQTT payloads (bash loop)
for f in examples/payloads/mqtt/*.json; do
  echo "Validating $f..."
  # Map filename to schema (implementation-specific)
done
```

All example payloads in this directory **SHOULD** validate against their
corresponding schemas without errors.

## 6. Contributing

When adding or updating examples:

1. **Naming** — Follow the `{action}.{type}.json` convention.
2. **Schema compliance** — Validate against the corresponding JSON Schema before committing.
3. **Payload only** — MQTT payloads contain only the `payload` field content (not the full envelope). See the main [README](../README.md#using-the-examples) for a wire-level envelope example.
4. **Realistic values** — Use plausible identifiers, timestamps, and measurements.
5. **Sync with flows** — If updating a payload, check that flow examples using the same message type are consistent.
