# Test Vectors

> **Status:** Draft | **OSPP Version:** 0.1.0-draft.1

Machine-readable test vectors for validating OSPP JSON Schema compliance.

---

## 1. Structure

Test vectors are organized by validation outcome and profile domain:

```
test-vectors/
├── valid/                    # Payloads that MUST be accepted
│   ├── core/                 # BootNotification, Heartbeat, StatusNotification, ConnectionLost
│   ├── transaction/          # StartService, StopService, MeterValues, ReserveBay, etc.
│   ├── device-management/    # GetConfiguration, UpdateFirmware, Reset, etc.
│   ├── security/             # AuthorizeOfflinePass, SecurityEvent
│   └── offline/              # BLE messages (Hello, Challenge, AuthRequest, etc.)
├── invalid/                  # Payloads that MUST be rejected
│   ├── core/
│   ├── transaction/
│   ├── device-management/
│   ├── security/
│   └── offline/
└── README.md                 # This file
```

### Naming Convention

Each test vector file follows the pattern:

```
{action}-{variant}.json
```

- **action** — The OSPP action name in kebab-case (e.g., `boot-notification-request`)
- **variant** — A descriptive label (e.g., `minimal`, `full`, `missing-required`, `invalid-enum`)

Examples:
- `valid/core/boot-notification-request-minimal.json` — Minimum valid payload
- `valid/core/boot-notification-request-full.json` — All optional fields populated
- `invalid/core/boot-notification-request-missing-required.json` — Missing required field
- `invalid/core/boot-notification-request-invalid-enum.json` — Invalid enum value

## 2. Usage

### Schema Validation

Each valid test vector **MUST** pass validation against its corresponding JSON Schema
in `schemas/`. Each invalid test vector **MUST** fail validation.

```bash
# Example using ajv-cli
ajv validate -s schemas/mqtt/boot-notification-request.schema.json \
             -r "schemas/common/*.schema.json" \
             -d test-vectors/valid/core/boot-notification-request-minimal.json

# Expected: valid

ajv validate -s schemas/mqtt/boot-notification-request.schema.json \
             -r "schemas/common/*.schema.json" \
             -d test-vectors/invalid/core/boot-notification-request-missing-required.json

# Expected: invalid
```

### Automated Testing

Implementers **SHOULD** integrate test vector validation into their CI pipeline:

1. For each schema in `schemas/`, find matching test vectors by action name.
2. Validate all `valid/*` vectors — assert success.
3. Validate all `invalid/*` vectors — assert failure.
4. Report any unexpected results.

### Envelope vs Payload

Test vectors contain **payload-only** JSON (not the full MQTT envelope). The envelope
structure is validated separately via `schemas/mqtt/mqtt-envelope.schema.json`.

## 3. Contributing Test Vectors

When adding new test vectors:

1. Place the file in the correct `valid/` or `invalid/` subdirectory.
2. Follow the naming convention: `{action}.{variant}.json`.
3. Ensure valid vectors pass and invalid vectors fail schema validation.
4. For invalid vectors, include a comment in the file describing which constraint is violated:

```json
{
  "_comment": "Missing required field: stationId",
  "firmwareVersion": "1.2.3",
  "stationModel": "SSP-3000"
}
```

5. Submit a pull request with the new vectors and a brief description.
