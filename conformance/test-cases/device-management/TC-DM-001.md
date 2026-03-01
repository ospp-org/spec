# TC-DM-001 — Configuration Read/Write

## Profile

Device Management Profile

## Purpose

Verify that GetConfiguration returns the station's current configuration (all keys and specific keys), ChangeConfiguration correctly updates dynamic keys with immediate effect, and returns Rejected for read-only keys.

## References

- `spec/profiles/device-management/get-configuration.md` — GetConfiguration request/response
- `spec/profiles/device-management/change-configuration.md` — ChangeConfiguration per-key status
- `spec/07-errors.md` §4.2 — Error codes for ChangeConfiguration: 3015 `PAYLOAD_INVALID`, 5108 `CONFIGURATION_KEY_READONLY`
- `schemas/mqtt/get-configuration-request.schema.json`
- `schemas/mqtt/get-configuration-response.schema.json`
- `schemas/mqtt/change-configuration-request.schema.json`
- `schemas/mqtt/change-configuration-response.schema.json`

## Preconditions

1. Station is booted and has received BootNotification Accepted.
2. MQTT connection is stable.
3. The station's configuration includes at least:
   - A dynamic key: `HeartbeatIntervalSeconds` (writable, takes effect immediately).
   - A dynamic key: `BLETxPower` (writable, takes effect immediately).
   - A read-only key: `FirmwareVersion` (not writable).
4. The test harness knows the expected initial values for these keys.

## Steps

### Part A — GetConfiguration (All Keys)

1. Send GetConfiguration with no keys specified (empty `keys` array or omitted):
   ```json
   { "keys": [] }
   ```
2. Receive the response containing `configuration` array.
3. Validate the response structure: each entry has `key` (string), `value` (string), `readonly` (boolean).
4. Verify that `HeartbeatIntervalSeconds`, `BLETxPower`, `FirmwareVersion`, and `MeterValuesInterval` are present in the response.
5. Record the current value of `HeartbeatIntervalSeconds` (e.g., `"30"`).
6. Verify that `FirmwareVersion` has `readonly: true`.
7. Verify that `HeartbeatIntervalSeconds` has `readonly: false`.

### Part B — GetConfiguration (Specific Keys)

8. Send GetConfiguration requesting specific keys:
   ```json
   { "keys": ["HeartbeatIntervalSeconds", "NonExistentKey"] }
   ```
9. Verify the response contains `HeartbeatIntervalSeconds` in `configuration`.
10. Verify `"NonExistentKey"` appears in the `unknownKeys` array.

### Part C — ChangeConfiguration (Dynamic Key — Immediate Effect)

11. Send ChangeConfiguration to update `HeartbeatIntervalSeconds`:
    ```json
    {
      "key": "HeartbeatIntervalSeconds",
      "value": "15"
    }
    ```
12. Verify the response: `status == "Accepted"`.
13. Send GetConfiguration for `HeartbeatIntervalSeconds`.
14. Verify the returned value is `"15"` (updated).
15. Wait and observe Heartbeat messages — verify they now arrive at ~15-second intervals (confirming immediate effect).

### Part D — ChangeConfiguration (Dynamic Key — BLETxPower)

16. Send ChangeConfiguration to update `BLETxPower`:
    ```json
    {
      "key": "BLETxPower",
      "value": "4"
    }
    ```
17. Verify the response: `status == "Accepted"`.
18. Send GetConfiguration for `BLETxPower`.
19. Verify the value is updated to `"4"` and takes effect immediately.

### Part E — ChangeConfiguration (Read-Only Key — Rejected)

20. Send ChangeConfiguration attempting to set `FirmwareVersion`:
    ```json
    {
      "key": "FirmwareVersion",
      "value": "9.9.9"
    }
    ```
21. Verify the response: `status == "Rejected"`.
22. Send GetConfiguration for `FirmwareVersion`.
23. Verify the value is unchanged from the original.

### Part F — Sequential Multi-Key Update (Mixed Statuses)

24. Send three sequential ChangeConfiguration requests:
    - `{ "key": "HeartbeatIntervalSeconds", "value": "30" }`
    - `{ "key": "FirmwareVersion", "value": "1.0.0" }`
    - `{ "key": "BLETxPower", "value": "0" }`
25. Verify the responses: `Accepted` for HeartbeatIntervalSeconds, `Rejected` for FirmwareVersion, `Accepted` for BLETxPower.

## Expected Results

1. GetConfiguration (all keys) returns a complete list of configuration entries with correct types.
2. GetConfiguration (specific keys) returns requested keys and lists unknown keys in `unknownKeys`.
3. Changing a dynamic key returns Accepted and the new value takes effect immediately.
4. Changing `BLETxPower` (dynamic) returns Accepted and the new value takes effect immediately.
5. Changing a read-only key returns Rejected and the value remains unchanged.
6. Sequential multi-key updates return independent per-key statuses.
7. All responses validate against their JSON schemas.

## Failure Criteria

1. GetConfiguration does not return all known keys when no filter is specified.
2. Unknown keys cause an error response instead of being listed in `unknownKeys`.
3. A dynamic key change does not take effect immediately (e.g., HeartbeatIntervalSeconds change not reflected in Heartbeat cadence).
4. A dynamic key change (`BLETxPower`) does not take effect immediately.
5. A read-only key change returns Accepted instead of Rejected.
6. A sequential multi-key update fails to return the correct per-key status.
7. GetConfiguration returns a stale value after a successful ChangeConfiguration.
