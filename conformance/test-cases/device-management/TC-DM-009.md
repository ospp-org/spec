# TC-DM-009 — Get Configuration

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles GetConfiguration requests for all keys, specific keys, and unknown keys, returning correct values, read-only flags, and `unknownKeys` arrays.

## References

- `spec/profiles/device-management/get-configuration.md` — GetConfiguration behavior
- `spec/03-messages.md` §6.2 — GetConfiguration payload (timeout 30s)
- `spec/08-configuration.md` §1.1 — Key-value structure (PascalCase, string wire format)
- `spec/08-configuration.md` §1.3 — Access modes (readonly flag); WriteOnly keys MUST NOT be returned
- `spec/08-configuration.md` §8.1 — GetConfiguration behaviour (all keys excludes WriteOnly keys)
- `spec/profiles/device-management/get-configuration.md` §5.1 — WriteOnly keys are never returned
- `schemas/mqtt/get-configuration-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
2. MQTT connection is stable; Heartbeat exchange is functioning.
3. Station has default configuration values loaded.
4. `HeartbeatIntervalSeconds` is at default (30).
5. The station supports `OfflinePassPublicKey` — a Security-profile key, and the only WriteOnly key in the registry (`spec/08-configuration.md` §9, row 19). Part D requires a key the station recognizes but must not return.

## Steps

### Part A — Get All Keys (Empty Request)

1. Send GetConfiguration with empty keys (request all):
   ```json
   {}
   ```
2. Verify GetConfiguration response within 30 seconds.
3. Verify `configuration` is an array containing at least the Core profile keys:
   - `HeartbeatIntervalSeconds`
   - `ConnectionTimeout`
   - `ReconnectBackoffMax`
   - `StationName`
   - `TimeZone`
   - `ProtocolVersion`
   - `FirmwareVersion`
   - `BootRetryInterval`
   - `ConnectionLostGracePeriod`
4. Verify each entry has `key` (string), `value` (string), and `readonly` (boolean).
5. Verify `ProtocolVersion` has `readonly: true`.
6. Verify `FirmwareVersion` has `readonly: true`.
7. Verify `HeartbeatIntervalSeconds` has `readonly: false`.
8. Verify all `value` fields are strings (even for integer/boolean config keys).
9. Verify that **no WriteOnly key appears in the `configuration` array** — in particular `OfflinePassPublicKey`, currently the only WriteOnly key in the registry. `spec/08-configuration.md` §1.3 and §8.1 rule 1 both forbid returning it. A station that includes it leaks a security credential during a routine configuration audit, which is the whole reason the access mode exists.

### Part B — Get Specific Keys

10. Send GetConfiguration for specific keys:
    ```json
    {
      "keys": ["HeartbeatIntervalSeconds", "ProtocolVersion", "TimeZone"]
    }
    ```
11. Verify GetConfiguration response within 30 seconds.
12. Verify `configuration` contains exactly 3 entries.
13. Verify `HeartbeatIntervalSeconds`:
    - `value: "30"` (default)
    - `readonly: false`
14. Verify `ProtocolVersion`:
    - `value: "0.3.0"`
    - `readonly: true`
15. Verify `TimeZone`:
    - `value: "UTC"` (default)
    - `readonly: false`

### Part C — Get Unknown Key

16. Send GetConfiguration with a mix of known and unknown keys:
    ```json
    {
      "keys": ["HeartbeatIntervalSeconds", "NonExistentKey", "AnotherFakeKey"]
    }
    ```
17. Verify GetConfiguration response within 30 seconds.
18. Verify `configuration` contains only the known key:
    ```json
    {
      "configuration": [
        { "key": "HeartbeatIntervalSeconds", "value": "30", "readonly": false }
      ],
      "unknownKeys": ["NonExistentKey", "AnotherFakeKey"]
    }
    ```
19. Verify `unknownKeys` array contains both unknown key names.
20. Verify unknown keys are NOT present in the `configuration` array.

### Part D — Get a WriteOnly Key By Name

21. Send GetConfiguration naming a WriteOnly key alongside a readable one:
    ```json
    {
      "keys": ["HeartbeatIntervalSeconds", "OfflinePassPublicKey"]
    }
    ```
22. Verify a normal GetConfiguration response arrives within 30 seconds. Naming a WriteOnly key **MUST NOT** produce an error response.
23. Verify `configuration` contains `HeartbeatIntervalSeconds` with its current value — the readable key is returned normally, so the batch was not failed by the WriteOnly key.
24. Verify `configuration` does **NOT** contain `OfflinePassPublicKey`.
25. Verify `unknownKeys` does **NOT** contain `OfflinePassPublicKey`. The station recognizes the key, so reporting it as unknown would be false. An absent or empty `unknownKeys` satisfies this check.
26. Verify `OfflinePassPublicKey` appears in **neither** array. That is the defined answer (`spec/profiles/device-management/get-configuration.md` §5.1, `spec/08-configuration.md` §8.1 rule 2), and it is what lets a server tell a withheld key from an unrecognized one.

## Expected Results

1. Empty keys request returns all configuration keys with correct values and readonly flags, **except WriteOnly keys, which are absent**.
2. Specific keys request returns only the requested keys.
3. Unknown keys are returned in the `unknownKeys` array, not in `configuration`.
4. A WriteOnly key requested **by name** is returned in neither `configuration` nor `unknownKeys`, the request does not error, and the other requested keys are returned normally.
5. All values are strings (wire format per `spec/08-configuration.md` §1.2).
6. Read-only keys (`ProtocolVersion`, `FirmwareVersion`) have `readonly: true`.
7. Read-write keys have `readonly: false`.
8. All responses arrive within the 30-second timeout.

## Failure Criteria

1. Response is missing Core profile keys when all keys are requested.
2. Entry is missing `key`, `value`, or `readonly` field.
3. Read-only keys report `readonly: false`.
4. Values are not strings (e.g., integers or booleans in JSON).
5. Unknown keys appear in the `configuration` array instead of `unknownKeys`.
6. **A WriteOnly key — `OfflinePassPublicKey` — appears in the `configuration` array.** This is a credential disclosure, not a formatting defect.
7. A WriteOnly key requested by name is listed in `unknownKeys`. The station recognizes the key; reporting it as unknown is false, and it destroys the distinction a server relies on.
8. A request that names a WriteOnly key returns an error, or drops the other requested keys from the response.
9. GetConfiguration response exceeds the 30-second timeout.
