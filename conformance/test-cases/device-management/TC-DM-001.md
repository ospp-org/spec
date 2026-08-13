# TC-DM-001 — Configuration Read/Write

## Profile

Device Management Profile

## Purpose

Verify that GetConfiguration returns the station's current configuration (all keys and specific keys), ChangeConfiguration correctly updates dynamic keys with immediate effect, and returns Rejected for read-only keys.

ChangeConfiguration is an **array-valued, atomic** exchange: the REQUEST carries a `keys` array of `{key, value}` pairs and the RESPONSE carries a `results` array with one entry per requested key, in request order. There is no top-level `status` — the response schema is `additionalProperties: false` over `results` alone. Every part below sends a batch of exactly one key; the multi-key batch and its all-or-nothing behaviour are covered by [`TC-DM-006`](TC-DM-006.md) Parts F and G.

## References

- `spec/profiles/device-management/get-configuration.md` — GetConfiguration request/response
- `spec/profiles/device-management/change-configuration.md` §6 — ChangeConfiguration Processing Rules (per-key results, request order, atomicity)
- `spec/03-messages.md` §6.1 — ChangeConfiguration payload and the **Atomicity** rule
- `spec/08-configuration.md` §1.3 — Access modes (RW, R, W); WriteOnly keys MUST NOT be returned by GetConfiguration
- `spec/08-configuration.md` §8.1 — GetConfiguration behaviour (all keys excludes WriteOnly keys)
- `spec/07-errors.md` §4.2 — Error codes for ChangeConfiguration: 3015 `PAYLOAD_INVALID`, 5108 `CONFIGURATION_KEY_READONLY`
- `schemas/mqtt/get-configuration-request.schema.json`
- `schemas/mqtt/get-configuration-response.schema.json`
- `schemas/mqtt/change-configuration-request.schema.json`
- `schemas/mqtt/change-configuration-response.schema.json`

## Preconditions

1. Station is booted and has received BootNotification Accepted, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
2. MQTT connection is stable.
3. The station's configuration includes at least:
   - A dynamic key: `HeartbeatIntervalSeconds` (writable, takes effect immediately; default 30, range 10–3600).
   - A dynamic key: `MeterValuesInterval` (writable, takes effect immediately; default 60, range 10–3600).
   - A read-only key: `FirmwareVersion` (not writable).
   - A WriteOnly key: `OfflinePassPublicKey` (Security profile, writable, never returned by GetConfiguration).
4. The test harness knows the expected initial values for these keys.

## Steps

### Part A — GetConfiguration (All Keys)

1. Send GetConfiguration with no keys specified (empty `keys` array or omitted):
   ```json
   { "keys": [] }
   ```
2. Receive the response containing `configuration` array.
3. Validate the response structure: each entry has `key` (string), `value` (string), `readonly` (boolean).
4. Verify that `HeartbeatIntervalSeconds`, `FirmwareVersion`, and `MeterValuesInterval` are present in the response.
5. Record the current value of `HeartbeatIntervalSeconds` (e.g., `"30"`).
6. Verify that `FirmwareVersion` has `readonly: true`.
7. Verify that `HeartbeatIntervalSeconds` has `readonly: false`.
8. Verify that `OfflinePassPublicKey` is **absent** from the `configuration` array. It is a WriteOnly key, and `spec/08-configuration.md` §1.3 and §8.1 both require that GetConfiguration never return it — returning it leaks a security credential.

### Part B — GetConfiguration (Specific Keys)

9. Send GetConfiguration requesting specific keys:
   ```json
   { "keys": ["HeartbeatIntervalSeconds", "NonExistentKey"] }
   ```
10. Verify the response contains `HeartbeatIntervalSeconds` in `configuration`.
11. Verify `"NonExistentKey"` appears in the `unknownKeys` array.

### Part C — ChangeConfiguration (Dynamic Key — Immediate Effect)

12. Send ChangeConfiguration to update `HeartbeatIntervalSeconds`:
    ```json
    {
      "keys": [
        { "key": "HeartbeatIntervalSeconds", "value": "45" }
      ]
    }
    ```
13. Verify the response:
    ```json
    {
      "results": [
        { "key": "HeartbeatIntervalSeconds", "status": "Accepted" }
      ]
    }
    ```
14. Verify the response payload carries **no** top-level `status`, `key`, `value`, `errorCode` or `errorText` member.
15. Send GetConfiguration for `HeartbeatIntervalSeconds`.
16. Verify the returned value is `"45"` (updated).
17. Wait and observe Heartbeat messages — verify they now arrive at ~45-second intervals (confirming immediate effect).

### Part D — ChangeConfiguration (Dynamic Key — MeterValuesInterval)

18. Send ChangeConfiguration to update `MeterValuesInterval`:
    ```json
    {
      "keys": [
        { "key": "MeterValuesInterval", "value": "120" }
      ]
    }
    ```
19. Verify the response:
    ```json
    {
      "results": [
        { "key": "MeterValuesInterval", "status": "Accepted" }
      ]
    }
    ```
20. Send GetConfiguration for `MeterValuesInterval`.
21. Verify the value is updated to `"120"` and takes effect immediately.

### Part E — ChangeConfiguration (Read-Only Key — Rejected)

22. Send ChangeConfiguration attempting to set `FirmwareVersion`:
    ```json
    {
      "keys": [
        { "key": "FirmwareVersion", "value": "9.9.9" }
      ]
    }
    ```
23. Verify the response:
    ```json
    {
      "results": [
        {
          "key": "FirmwareVersion",
          "status": "Rejected",
          "errorCode": 5108,
          "errorText": "CONFIGURATION_KEY_READONLY"
        }
      ]
    }
    ```
24. Verify `errorCode` and `errorText` appear **inside** the `results` entry, not at the top level of the payload.
25. Send GetConfiguration for `FirmwareVersion`.
26. Verify the value is unchanged from the original.

### Part F — Sequential Single-Key Requests (Independent Batches)

Each request below is a separate ChangeConfiguration carrying a batch of exactly one key. Independence here is between *requests*, not between keys inside a batch — keys inside one batch are applied all-or-nothing (see [`TC-DM-006`](TC-DM-006.md) Part G).

27. Send three ChangeConfiguration requests in sequence, waiting for each response before sending the next:
    - `{ "keys": [ { "key": "HeartbeatIntervalSeconds", "value": "30" } ] }`
    - `{ "keys": [ { "key": "FirmwareVersion", "value": "1.0.0" } ] }`
    - `{ "keys": [ { "key": "MeterValuesInterval", "value": "60" } ] }`
28. Verify the three responses, each carrying a single-entry `results` array:
    - `{ "results": [ { "key": "HeartbeatIntervalSeconds", "status": "Accepted" } ] }`
    - `{ "results": [ { "key": "FirmwareVersion", "status": "Rejected", "errorCode": 5108, "errorText": "CONFIGURATION_KEY_READONLY" } ] }`
    - `{ "results": [ { "key": "MeterValuesInterval", "status": "Accepted" } ] }`
29. Send GetConfiguration for all three keys and verify `HeartbeatIntervalSeconds` is `"30"`, `MeterValuesInterval` is `"60"`, and `FirmwareVersion` is unchanged. The rejected second request MUST NOT have prevented the first or third from applying — they are separate batches.

## Expected Results

1. GetConfiguration (all keys) returns a complete list of configuration entries with correct types.
2. GetConfiguration (all keys) omits every WriteOnly key, including `OfflinePassPublicKey`.
3. GetConfiguration (specific keys) returns requested keys and lists unknown keys in `unknownKeys`.
4. Changing a dynamic key returns a single-entry `results` array with `status: "Accepted"`, and the new value takes effect immediately.
5. Changing `MeterValuesInterval` (dynamic) returns `Accepted` and the new value takes effect immediately.
6. Changing a read-only key returns `Rejected` with `5108 CONFIGURATION_KEY_READONLY` in that key's `results` entry, and the value remains unchanged.
7. Every ChangeConfiguration RESPONSE carries a `results` array with one entry per requested key, in request order, and no top-level `status`, `key`, `value`, `errorCode` or `errorText`.
8. Separate ChangeConfiguration requests are independent of one another: a rejected request does not affect the outcome of the requests before or after it.
9. GetConfiguration reflects the new value after a successful ChangeConfiguration.
10. All responses validate against their JSON schemas.

## Failure Criteria

1. GetConfiguration does not return all known keys when no filter is specified.
2. GetConfiguration returns a WriteOnly key such as `OfflinePassPublicKey`.
3. Unknown keys cause an error response instead of being listed in `unknownKeys`.
4. A dynamic key change does not take effect immediately (e.g., HeartbeatIntervalSeconds change not reflected in Heartbeat cadence).
5. A dynamic key change (`MeterValuesInterval`) does not take effect immediately.
6. A read-only key change returns Accepted instead of Rejected.
7. The ChangeConfiguration RESPONSE carries a top-level `status` (or any other top-level member) rather than a `results` array — such a payload fails schema validation before a handler runs.
8. `errorCode` or `errorText` appears at the top level of the response instead of inside the `results` entry.
9. A rejected single-key request causes a preceding or following independent request to be rolled back or ignored.
10. GetConfiguration returns a stale value after a successful ChangeConfiguration.
