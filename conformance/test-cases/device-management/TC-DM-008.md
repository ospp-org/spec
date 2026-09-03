# TC-DM-008 — Update Service Catalog

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles UpdateServiceCatalog including successful catalog replacement with `previousCatalogVersion` returned, rejection of an entry missing a required field with `5023 INVALID_CATALOG`, rejection of a catalog whose entries are each well-formed but collide with `5023 INVALID_CATALOG`, idempotent catalog updates, and rejection of a catalog binding to a `(bayNumber, programNumber)` the station never declared with `5024 UNSUPPORTED_SERVICE`, leaving the previous catalog wholly in force.

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
- `spec/07-errors.md` §3.5 — Error codes 5023 `INVALID_CATALOG` and 5024 `UNSUPPORTED_SERVICE`; §3.3 — 3015 `PAYLOAD_INVALID` and its narrowed scope
- `spec/profiles/device-management/update-service-catalog.md` §6 rule 8 — the all-or-nothing refusal Part E exercises
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

### Part E — Binding to a `(bayNumber, programNumber)` the Station Never Declared (5024)

> **This part exercises rule 8, and nothing else in this corpus does.** Rule 8 is a MUST-level
> refusal, and `5024 UNSUPPORTED_SERVICE` appeared **zero** times across the whole `conformance/`
> tree before this part existed — against `5023` at 13, `3018` at 5 and `3001` at 9, so the absence
> was of a *case*, not of a search. Parts A–D above bind every entry to `(bay 1, program 1|2|3)`,
> all of them declared, so none of them reaches rule 8 at all.
>
> **It is semantically decidable, not schema-detectable, so it needs a behavioural case rather than
> a vector under `invalid/`.** The payload below is perfectly well-formed: `bindings` accepts any
> `(bayNumber, programNumber)` in range, and only the station knows which pairs it declared. A
> validator cannot tell this catalog from a legal one, which is exactly why the refusal has to be
> observed on the wire.

15. Confirm the station's declared topology from the BootNotification of the preconditions: bay 1
    with programs 1, 2 and 3. Program **9** on bay 1 was declared at neither provisioning nor the
    most recent boot, and bay **2** does not exist on this station.
16. Send UpdateServiceCatalog whose entries are each individually valid — every required field
    present, pricing consistent, `serviceId`s distinct, so **rule 1 does not reach it** — but whose
    second entry binds to an ordinal the station never declared:
    ```json
    {
      "catalogVersion": "2026-01-30-04",
      "services": [
        { "serviceId": "svc_eco", "serviceName": "Eco Program", "pricingType": "PerMinute", "priceCreditsPerMinute": 10, "priceLocalPerMinute": 50, "available": true, "bindings": [{ "bayNumber": 1, "programNumber": 1 }] },
        { "serviceId": "svc_phantom", "serviceName": "Phantom Program", "pricingType": "Fixed", "priceCreditsFixed": 20, "priceLocalFixed": 100, "available": true, "bindings": [{ "bayNumber": 1, "programNumber": 9 }] }
      ]
    }
    ```
17. Verify UpdateServiceCatalog response within 30 seconds:
    ```json
    { "status": "Rejected", "errorCode": 5024, "errorText": "UNSUPPORTED_SERVICE" }
    ```
    Not `5023`. `5023` is rule 1 — an entry that failed *validation* — and this entry passes
    validation; what it fails is a fact only the station holds.
18. **Verify the previous catalog remains in force, entirely.** Send GetConfiguration or start a
    session against `svc_deluxe` from Part A and verify it is still recognised, then verify
    `svc_phantom` is **not** recognised — a StartService naming it is refused with
    `3004 INVALID_SERVICE`.
19. **Verify no entry was partially applied.** `svc_eco`'s first entry in step 16 is valid on its
    own and differs from nothing, so a station applying "the entries it could" would accept it
    silently. Re-read the catalog version: it **MUST** still be `"2026-01-30-01"` and **MUST NOT**
    be `"2026-01-30-04"`. This is the half of rule 8 no schema can check — the response is closed
    and carries no member naming what was dropped, so a partial application leaves the server
    tracking a `catalogVersion` for a catalog that exists on no station, with nothing on the wire
    able to reveal it.
20. Repeat step 16 with the offending binding on a bay rather than a program —
    `{ "bayNumber": 2, "programNumber": 1 }` — and verify the same response. Rule 8 names both
    halves of the pair, and a station that checks only the program ordinal passes step 17 and fails
    here.

> **`5025 CATALOG_TOO_LARGE` is still at zero coverage, and is deliberately not added here.** Of the
> three codes [`07-errors.md` §4.2](../../../spec/07-errors.md#42-server--station-mqtt-actions)
> assigns to this action, two had no conformance case at all; this part closes one. `5025` is left
> open because its threshold is the *station's* storage or processing capacity and no bound in this
> specification fixes it — `services` carries `minItems: 1` and no `maxItems` — so a portable case
> would have to invent a number the protocol does not state.

## Expected Results

1. Valid catalog update returns `Accepted` with `previousCatalogVersion`.
2. Station uses the new catalog for subsequent sessions (new services recognized).
3. An entry missing a required field returns `Rejected` with `5023 INVALID_CATALOG`.
4. A catalog with a duplicate `serviceId` returns `Rejected` with `5023 INVALID_CATALOG`.
5. Same `catalogVersion` is handled idempotently.
6. A `bindings` entry naming a `(bayNumber, programNumber)` the station never declared returns
   `Rejected` with `5024 UNSUPPORTED_SERVICE`, on either half of the pair.
7. After a `5024` refusal the previous catalog is still in force **in full** — the catalog version
   is unchanged and no entry from the refused catalog was applied.
8. All responses arrive within the 30-second timeout.

## Failure Criteria

1. Valid catalog update returns `Rejected`.
2. `previousCatalogVersion` is missing from `Accepted` response.
3. An entry missing a required field is accepted, or is refused with a code other than `5023`.
4. A catalog with a duplicate `serviceId` is accepted, or is refused with a code other than `5023`.
5. Station does not recognize services from the new catalog.
6. A catalog binding to an undeclared `(bayNumber, programNumber)` is accepted, or is refused with a
   code other than `5024` — `5023` in particular, which is rule 1's code for an entry that failed
   validation, and this entry does not.
7. The station applies the valid entries of a catalog refused under rule 8 and reports the refusal
   anyway, or advances its `catalogVersion` on a refusal. Either leaves the server holding a
   catalog version that exists on no station.
8. The station checks the program ordinal but not the bay number, so step 20 is accepted.
9. UpdateServiceCatalog response exceeds the 30-second timeout.
