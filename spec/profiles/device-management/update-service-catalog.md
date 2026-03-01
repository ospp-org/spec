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
| `previousCatalogVersion` | string | No | The catalog version that was replaced (present when `Accepted`). |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Catalog Structure

Each entry in the `services` array **MUST** conform to the service-item schema:

| Field | Type | Required | Description |
|-------------------------|---------|----------|-----------------------------------------------|
| `serviceId` | string | Yes | Unique service identifier (e.g., `svc_eco`). |
| `serviceName` | string | Yes | Human-readable service name (e.g., "Eco Program"). |
| `pricingType` | string | Yes | `PerMinute` or `Fixed`. |
| `priceCreditsPerMinute` | integer | No | Price in credits per minute. Required when `pricingType` is `PerMinute`. |
| `priceCreditsFixed` | integer | No | Fixed price in credits. Required when `pricingType` is `Fixed`. |
| `priceLocalPerMinute` | integer | No | Optional price in local-currency minor units per minute. |
| `priceLocalFixed` | integer | No | Optional fixed price in local-currency minor units. |
| `available` | boolean | Yes | `true` if the service is currently available for use. |

The station **MUST** reject the catalog if any service entry fails validation.

## 6. Processing Rules

1. The station **MUST** validate every service entry in the catalog before accepting. If any entry is malformed, the station **MUST** respond with `Rejected` and error code `5023 INVALID_CATALOG`.
2. On `Accepted`, the station **MUST** atomically replace its current catalog with the new one. There **MUST NOT** be a window where a partial catalog is active.
3. The station **MUST** return the `previousCatalogVersion` in the response so the server can track catalog history.
4. If the `services` array is empty (violating the `minItems: 1` constraint), the station **MUST** respond with `Rejected`.
5. The station **SHOULD** persist the catalog to non-volatile storage so it survives reboots.
6. Active sessions **MUST NOT** be affected by a catalog update. New pricing takes effect only for sessions started after the catalog is applied.
7. The response `messageId` **MUST** match the request `messageId`.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `3015` | `PAYLOAD_INVALID` | Error | The catalog payload is semantically invalid (e.g., conflicting pricing fields). |
| `5023` | `INVALID_CATALOG` | Error | One or more service entries failed validation (missing fields, invalid pricing type). |
| `5024` | `UNSUPPORTED_SERVICE` | Warning | The catalog contains a `serviceId` that the station hardware does not support. |
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
  "protocolVersion": "0.1.0",
  "payload": {
    "catalogVersion": "2026-02-13-01",
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
  "protocolVersion": "0.1.0",
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
  "protocolVersion": "0.1.0",
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
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5023--5025)
