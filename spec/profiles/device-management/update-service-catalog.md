# UpdateServiceCatalog

> **Status:** Draft

Push an updated service catalog to the station, defining which services are available, their pricing, and availability status.

## 1. Overview

UpdateServiceCatalog is a server-initiated command that pushes an updated service catalog to the station. The catalog defines which services are available, their pricing model, and whether each service is currently enabled. The station replaces its existing catalog with the new version atomically.

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|------------------|----------|----------|-----------------------------------------------|
| `catalogVersion` | string | Yes | Catalog version identifier (non-empty, e.g., `"2026-02-13-01"`). |
| `services` | object[] | Yes | Array of service definitions (minimum 1 item). See section 5 for structure. |

## 4. Response Payload

| Field | Type | Required | Description |
|--------------------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `previousCatalogVersion` | string | Cond. | The catalog version that was replaced. **REQUIRED when `status` is `Accepted`** (rule 3 below), absent otherwise. A station that has never held a catalog sends the empty string; the value is non-empty for every replacement. |
| `errorCode` | integer | Cond. | OSPP error code. **REQUIRED when `status` is `Rejected`**, absent otherwise — enforced by the `if`/`then` in [`update-service-catalog-response.schema.json`](../../../schemas/mqtt/update-service-catalog-response.schema.json). |
| `errorText` | string | Cond. | Machine-readable error name in UPPER_SNAKE_CASE. **REQUIRED when `status` is `Rejected`**, absent otherwise — same conditional. |

## 5. Catalog Structure

Each entry in the `services` array **MUST** conform to the service-item schema:

| Field | Type | Required | Description |
|-------------------------|---------|----------|-----------------------------------------------|
| `serviceId` | string | Yes | Unique service identifier (e.g., `svc_eco`). |
| `serviceName` | string | Yes | Human-readable service name (e.g., "Eco Program"). |
| `bindings` | array | Yes | Where this service physically runs: one `{bayNumber, programNumber}` entry per bay-and-program it is bound to. Created on the **server** by an operator; the station never originates it. This is what lets the station start the right program **offline**, where no StartService command exists to carry the ordinal. |
| `pricingType` | string | Yes | `PerMinute` or `Fixed`. |
| `priceCreditsPerMinute` | integer | Cond. | Price in credits per minute. Required when `pricingType` is `PerMinute`; it **MUST NOT** be present when `pricingType` is `Fixed`. |
| `priceCreditsFixed` | integer | Cond. | Fixed price in credits. Required when `pricingType` is `Fixed`; it **MUST NOT** be present when `pricingType` is `PerMinute`. |
| `priceLocalPerMinute` | integer | No | Optional price in local-currency minor units per minute — informational, for station display only, never the basis of a charge. It **MUST NOT** be present when `pricingType` is `Fixed`. |
| `priceLocalFixed` | integer | No | Optional fixed price in local-currency minor units — informational, for station display only, never the basis of a charge. It **MUST NOT** be present when `pricingType` is `PerMinute`. |
| `available` | boolean | Yes | `true` if the service is currently available for use. |

The station **MUST** reject the catalog if any service entry fails validation.

## 6. Processing Rules

1. The station **MUST** validate every service entry in the catalog before accepting. If any entry is malformed, the station **MUST** respond with `Rejected` and error code `5023 INVALID_CATALOG`.
2. On `Accepted`, the station **MUST** atomically replace its current catalog with the new one. There **MUST NOT** be a window where a partial catalog is active. The subject of this rule is *tearing* — no observer may see a half-applied swap. Whether a subset may be applied at all is a separate question, answered by rule 8 below, and the answer is no.
3. The station **MUST** return the `previousCatalogVersion` in the response so the server can track catalog history.
4. If the `services` array is empty (violating the `minItems: 1` constraint), the station **MUST** respond with `Rejected`.
5. The station **MUST** persist the catalog to non-volatile storage so it survives reboots. This was a `SHOULD` until `0.25.0`, against a `MUST` in [`profiles/device-management/README.md` §4](README.md) and a second in [`03-messages.md` §6.9](../../03-messages.md); one document out of three carried the weaker word, and the two that carry the obligation are the ones a server relies on when it declines to re-push after a station reboot.
6. Active sessions **MUST NOT** be affected by a catalog update. New pricing takes effect only for sessions started after the catalog is applied.
7. The response `messageId` **MUST** match the request `messageId`.
8. If the catalog names a service the station cannot run — a `serviceId` its hardware does not support, or a `bindings` entry naming a `(bayNumber, programNumber)` pair it did not declare at provisioning or at its most recent boot — the station **MUST** respond `Rejected` with error code `5024 UNSUPPORTED_SERVICE` and **MUST** leave the previous catalog in force. It **MUST NOT** apply the remaining entries and report success. The response schema is closed and carries no member naming what was dropped, so a partial application leaves the server tracking a `catalogVersion` for a catalog that exists on no station, with nothing on the wire able to reveal it. A refusal the server can see is worth more than an application it cannot.

**Sizing, which is the server's obligation and not the station's problem to guess.** `services` has
`minItems: 1` and no `maxItems`, so nothing in the schema bounds a catalog. That is deliberate at
`0.31.0` and the bound is stated here instead, on the **emitter**, because the emitter is the only
party that can honour it:

9. A server **MUST NOT** publish an UpdateServiceCatalog whose serialized payload exceeds the **64 KB**
   MQTT Maximum Packet Size ([Chapter 02 §1.2](../../02-transport.md#12-connection-parameters)), and
   **SHOULD** stay well inside it. A station **MAY** refuse an oversized catalog with
   `5025 CATALOG_TOO_LARGE`, and needs no capability negotiation to do so.

**The arithmetic, so a station can size its receive buffer from published bounds rather than from a
promise.** Every service entry is already bounded by
[`service-item.schema.json`](../../../schemas/common/service-item.schema.json): `serviceName` at 128
characters, `bindings` at 64 entries, and each binding's ordinals at 64 and 32. A worst-case entry
admitted by those bounds serialises to roughly **2.5 KB**, so 64 KB holds about **25** of them;
entries at the size the conformance corpus actually carries (largest **206 B**, mean **181 B**) fit
about **318**. A station that provisions for 64 KB is correct under every legal catalog, which is the
figure it already has to provision for anyway, since it is the packet ceiling for every message.

**Why no `maxItems`.** A schema bound would have to pick one of those two numbers. Picking 25 forbids
catalogs that are legal, useful and in service; picking 318 permits a payload that cannot be
delivered. The transport ceiling is the real constraint, it already exists, and it binds the party
that can measure the payload before sending it. `5025`'s Recommended Action told servers to *"check
station capabilities for maximum catalog size"* until `0.30.0` — a field that has never existed — and
now names this ceiling.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `3015` | `PAYLOAD_INVALID` | Error | A payload-level value that is wrong in itself — an empty `catalogVersion`, for instance. [Chapter 07 §3.3](../../07-errors.md) narrows this code to a value that could never be valid, so it does not reach a service **entry**: an entry that fails validation, a missing or conflicting price included, is `5023` by rule 1 above. |
| `5023` | `INVALID_CATALOG` | Error | Any service entry failed validation — a missing required field, an invalid pricing type, no price for the declared `pricingType`, or the other type's price present — or the catalog as a whole is inconsistent, a duplicate `serviceId` being the case that arises. |
| `5024` | `UNSUPPORTED_SERVICE` | Error | The catalog names a service the station cannot run, or binds one to a `(bayNumber, programNumber)` pair it never declared. The whole catalog is refused — see rule 8. **Not `5023`:** that is rule 1's code for an entry that failed *validation*, and such an entry passes validation — what it fails is a fact only the station holds. Exercised by [`TC-DM-008`](../../../conformance/test-cases/device-management/TC-DM-008.md) Part E. |
| `5025` | `CATALOG_TOO_LARGE` | Error | The catalog exceeds the station's storage or processing capacity. |
| `5103` | `STORAGE_ERROR` | Error | Insufficient or inaccessible storage for persisting the catalog. |

## 8. Examples

### 8.1 Request

```json
{
  "messageId": "msg_d1e2f3a4-b5c6-7890-cde0-123456789abc",
  "messageType": "Request",
  "action": "UpdateServiceCatalog",
  "timestamp": "2026-02-13T10:29:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "catalogVersion": "2026-02-13-01",
    "services": [
      {
        "serviceId": "svc_eco",
        "serviceName": "Eco Program",
        "pricingType": "PerMinute",
        "priceCreditsPerMinute": 10,
        "priceLocalPerMinute": 50,
        "available": true,
        "bindings": [
          {
            "bayNumber": 1,
            "programNumber": 1
          }
        ]
      },
      {
        "serviceId": "svc_standard",
        "serviceName": "Standard Program",
        "pricingType": "PerMinute",
        "priceCreditsPerMinute": 8,
        "priceLocalPerMinute": 40,
        "available": true,
        "bindings": [
          {
            "bayNumber": 1,
            "programNumber": 2
          }
        ]
      },
      {
        "serviceId": "svc_deluxe",
        "serviceName": "Deluxe Program",
        "pricingType": "Fixed",
        "priceCreditsFixed": 15,
        "priceLocalFixed": 75,
        "available": true,
        "bindings": [
          {
            "bayNumber": 1,
            "programNumber": 3
          }
        ]
      }
    ]
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_d1e2f3a4-b5c6-7890-cde0-123456789abc",
  "messageType": "Response",
  "action": "UpdateServiceCatalog",
  "timestamp": "2026-02-13T10:29:00.350Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted",
    "previousCatalogVersion": "2026-01-15-03"
  }
}
```

### 8.3 Response (Rejected -- Invalid Catalog)

```json
{
  "messageId": "msg_d1e2f3a4-b5c6-7890-cde0-123456789abc",
  "messageType": "Response",
  "action": "UpdateServiceCatalog",
  "timestamp": "2026-02-13T10:29:00.350Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 5023,
    "errorText": "INVALID_CATALOG"
  }
}
```

## 9. Related Schemas

- Request: [`update-service-catalog-request.schema.json`](../../../schemas/mqtt/update-service-catalog-request.schema.json)
- Response: [`update-service-catalog-response.schema.json`](../../../schemas/mqtt/update-service-catalog-response.schema.json)
- Service Item: [`service-item.schema.json`](../../../schemas/common/service-item.schema.json)
- Service ID: [`service-id.schema.json`](../../../schemas/common/service-id.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3015, 5023--5025, 5103)
