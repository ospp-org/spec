# TC-DM-008 — Update Service Catalog

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles UpdateServiceCatalog including successful catalog replacement with `previousCatalogVersion` returned, rejection of structurally invalid payloads with `3015 PAYLOAD_INVALID`, rejection of semantically invalid catalogs with `5023 INVALID_CATALOG`, and idempotent catalog updates.

## References

- `spec/profiles/device-management/update-service-catalog.md` — UpdateServiceCatalog behavior
- `spec/03-messages.md` §6.9 — UpdateServiceCatalog payload (timeout 30s)
- `spec/07-errors.md` §3.5 — Error codes 5023 `INVALID_CATALOG`, 3015 `PAYLOAD_INVALID`
- `schemas/mqtt/update-service-catalog-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Station has an existing service catalog (version `"2026-01-01-01"`) with services `svc_eco` and `svc_standard`.
3. MQTT connection is stable; Heartbeat exchange is functioning.

## Steps

### Part A — Successful Catalog Update (Accepted)

1. Send UpdateServiceCatalog with a new catalog:
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
2. Verify UpdateServiceCatalog response within 30 seconds:
   ```json
   {
     "status": "Accepted",
     "previousCatalogVersion": "2026-01-01-01"
   }
   ```
3. Verify `previousCatalogVersion` contains the old catalog version.
4. Start a session to verify the station uses the new catalog:
   ```json
   {
     "sessionId": "sess_b1c2d3e4f5a6",
     "bayId": "bay_c1d2e3f4a5b6",
     "serviceId": "svc_deluxe",
     "durationSeconds": 120,
     "sessionSource": "MobileApp"
   }
   ```
5. Verify StartService response `status: "Accepted"` (new service `svc_deluxe` is recognized).
6. Send StopService to clean up:
   ```json
   {
     "bayId": "bay_c1d2e3f4a5b6",
     "sessionId": "sess_b1c2d3e4f5a6"
   }
   ```

### Part B — Invalid Catalog Payload (3015)

7. Send UpdateServiceCatalog with a malformed catalog (missing required `serviceName` field):
   ```json
   {
     "catalogVersion": "2026-01-30-02",
     "services": [
       {
         "serviceId": "svc_broken",
         "pricingType": "PerMinute",
         "priceCreditsPerMinute": 10,
         "available": true
       }
     ]
   }
   ```
8. Verify UpdateServiceCatalog response within 30 seconds:
   ```json
   {
     "status": "Rejected",
     "errorCode": 3015,
     "errorText": "PAYLOAD_INVALID"
   }
   ```
9. Verify the station still uses the previous valid catalog (`"2026-01-30-01"`).

### Part C — Idempotent Catalog Update

10. Re-send the same catalog version:
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
11. Verify UpdateServiceCatalog response `status: "Accepted"` (idempotent — same `catalogVersion` is a no-op).

### Part D — Semantic Catalog Error (5023)

12. Send UpdateServiceCatalog with a semantically invalid catalog (duplicate `serviceId`):
    ```json
    {
      "catalogVersion": "2026-01-30-03",
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
          "serviceId": "svc_eco",
          "serviceName": "Eco Program Duplicate",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 12,
          "priceLocalPerMinute": 60,
          "available": true
        }
      ]
    }
    ```
13. Verify UpdateServiceCatalog response within 30 seconds:
    ```json
    {
      "status": "Rejected",
      "errorCode": 5023,
      "errorText": "INVALID_CATALOG"
    }
    ```
14. Verify the station still uses the previous valid catalog (`"2026-01-30-01"`).

## Expected Results

1. Valid catalog update returns `Accepted` with `previousCatalogVersion`.
2. Station uses the new catalog for subsequent sessions (new services recognized).
3. Structurally invalid catalog payload (missing required fields) returns `Rejected` with `3015 PAYLOAD_INVALID`.
4. Semantically invalid catalog (duplicate `serviceId`) returns `Rejected` with `5023 INVALID_CATALOG`.
5. Same `catalogVersion` is handled idempotently.
6. All responses arrive within the 30-second timeout.

## Failure Criteria

1. Valid catalog update returns `Rejected`.
2. `previousCatalogVersion` is missing from `Accepted` response.
3. Structurally invalid catalog is accepted without `3015` error.
4. Semantically invalid catalog (duplicate serviceId) is accepted without `5023` error.
5. Station does not recognize services from the new catalog.
6. UpdateServiceCatalog response exceeds the 30-second timeout.
