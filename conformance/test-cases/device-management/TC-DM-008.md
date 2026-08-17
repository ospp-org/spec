# TC-DM-008 — Update Service Catalog

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles UpdateServiceCatalog including successful catalog replacement with `previousCatalogVersion` returned, rejection of an entry missing a required field with `5023 INVALID_CATALOG`, rejection of a catalog whose entries are each well-formed but collide with `5023 INVALID_CATALOG`, and idempotent catalog updates.

> **Both refusals carry `5023`, and that is not a duplicated step.** They exercise different
> station logic — per-entry validation in Part B, cross-entry uniqueness in Part D — and a
> station can pass one while failing the other. Earlier revisions of this case asked Part B
> for `3015 PAYLOAD_INVALID`. That contradicted rule 1 of the profile, which sends *every*
> malformed entry to `5023`, and the registry, which lists "missing required fields" under
> `5023` and narrows `3015` to a value that could never be valid — which a missing field is
> not. In this message `3015` reaches only a payload-level value outside the `services`
> array, an empty `catalogVersion` being the example.

## References

- `spec/profiles/device-management/update-service-catalog.md` — UpdateServiceCatalog behavior
- `spec/03-messages.md` §6.9 — UpdateServiceCatalog payload (timeout 30s)
- `spec/07-errors.md` §3.5 — Error code 5023 `INVALID_CATALOG`; §3.3 — 3015 `PAYLOAD_INVALID` and its narrowed scope
- `schemas/mqtt/update-service-catalog-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
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
     "programNumber": 3,
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

### Part B — Entry Missing a Required Field (5023)

7. Send UpdateServiceCatalog with a malformed catalog (missing required `serviceName` field):
   ```json
   {
     "catalogVersion": "2026-01-30-02",
     "services": [
       {
         "serviceId": "svc_broken",
         "pricingType": "PerMinute",
         "priceCreditsPerMinute": 10,
         "available": true,
         "bindings": [
           {
             "bayNumber": 1,
             "programNumber": 1
           }
         ]
       }
     ]
   }
   ```
8. Verify UpdateServiceCatalog response within 30 seconds:
   ```json
   {
     "status": "Rejected",
     "errorCode": 5023,
     "errorText": "INVALID_CATALOG"
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
    ```
11. Verify UpdateServiceCatalog response `status: "Accepted"` (idempotent — same `catalogVersion` is a no-op).

### Part D — Duplicate `serviceId` (5023)

12. Send UpdateServiceCatalog with a catalog whose entries are each individually valid but collide (duplicate `serviceId`):
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
          "available": true,
          "bindings": [
            {
              "bayNumber": 1,
              "programNumber": 1
            }
          ]
        },
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program Duplicate",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 12,
          "priceLocalPerMinute": 60,
          "available": true,
          "bindings": [
            {
              "bayNumber": 1,
              "programNumber": 1
            }
          ]
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
3. An entry missing a required field returns `Rejected` with `5023 INVALID_CATALOG`.
4. A catalog with a duplicate `serviceId` returns `Rejected` with `5023 INVALID_CATALOG`.
5. Same `catalogVersion` is handled idempotently.
6. All responses arrive within the 30-second timeout.

## Failure Criteria

1. Valid catalog update returns `Rejected`.
2. `previousCatalogVersion` is missing from `Accepted` response.
3. An entry missing a required field is accepted, or is refused with a code other than `5023`.
4. A catalog with a duplicate `serviceId` is accepted, or is refused with a code other than `5023`.
5. Station does not recognize services from the new catalog.
6. UpdateServiceCatalog response exceeds the 30-second timeout.
