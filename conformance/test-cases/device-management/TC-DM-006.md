# TC-DM-006 — Change Configuration

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles ChangeConfiguration for valid RW keys, read-only keys (`5108 CONFIGURATION_KEY_READONLY`), unknown keys (`NotSupported`), static keys requiring reboot (`RebootRequired`), and invalid values (`5109 INVALID_CONFIGURATION_VALUE`).

Every ChangeConfiguration REQUEST carries a `keys` array and every RESPONSE carries a `results` array with one entry per requested key, in request order. There is no top-level `status` — the response schema is `additionalProperties: false` over `results` alone.

Verify also the **atomic all-or-nothing** rule: if any key in a batch is `Rejected` or `NotSupported`, the station applies **no** key from that batch. A `results` entry of `Accepted` inside such a batch is the station's **validation verdict for that key**, not a record that the value was applied — Parts F and G exist to distinguish those two readings, because an implementation that confuses them persists values the batch refused.

## References

- `spec/profiles/device-management/change-configuration.md` §6 — Processing Rules (atomicity, per-key results, request order)
- `spec/03-messages.md` §6.1 — ChangeConfiguration payload and the **Atomicity** rule (timeout 60s)
- `spec/08-configuration.md` §1.3 — Access modes (RW, R, W)
- `spec/08-configuration.md` §1.4 — Mutability (Dynamic, Static)
- `spec/08-configuration.md` §8.2 — ChangeConfiguration behaviour, per-key `results[].status`
- `spec/07-errors.md` §3.5 — Error codes 5108 `CONFIGURATION_KEY_READONLY`, 5109 `INVALID_CONFIGURATION_VALUE`
- `schemas/mqtt/change-configuration-request.schema.json`
- `schemas/mqtt/change-configuration-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`, **declaring `capabilities.deviceManagementSupported: true`** in that BootNotification. The capability is OPTIONAL in the schema and the profile's rules apply only to a station that declares it (`spec/profiles/device-management/README.md` §3); where it is not stated, a server MAY withhold these commands altogether (`spec/profiles/core/boot-notification.md` §5.1 rule 3), and the refusal that follows is conforming behaviour rather than a test failure.
2. MQTT connection is stable; Heartbeat exchange is functioning.
3. `HeartbeatIntervalSeconds` is at default (30); valid range 10–3600.
4. `MeterValuesInterval` is at default (60); valid range 10–3600.
5. `AuthorizationCacheEnabled` is at default (`true`).
6. Test harness can send ChangeConfiguration and GetConfiguration commands.

## Steps

### Part A — Change Valid RW Dynamic Key (Accepted)

1. Send ChangeConfiguration:
   ```json
   {
     "keys": [
       { "key": "HeartbeatIntervalSeconds", "value": "60" }
     ]
   }
   ```
2. Verify ChangeConfiguration response within 60 seconds:
   ```json
   {
     "results": [
       { "key": "HeartbeatIntervalSeconds", "status": "Accepted" }
     ]
   }
   ```
3. Verify the response payload carries **no** top-level `status`, `key`, `value`, `errorCode` or `errorText` member, and that `results` has exactly one entry whose `key` echoes the requested key.
4. Send GetConfiguration to verify the change took effect:
   ```json
   {
     "keys": ["HeartbeatIntervalSeconds"]
   }
   ```
5. Verify GetConfiguration response contains:
   ```json
   {
     "configuration": [
       { "key": "HeartbeatIntervalSeconds", "value": "60", "readonly": false }
     ]
   }
   ```
6. Wait 60 seconds (+/- 10%) and verify the station sends a Heartbeat at the new interval.

### Part B — Change Read-Only Key (5108)

7. Send ChangeConfiguration targeting a read-only key:
   ```json
   {
     "keys": [
       { "key": "ProtocolVersion", "value": "2.0.0" }
     ]
   }
   ```
8. Verify ChangeConfiguration response within 60 seconds:
   ```json
   {
     "results": [
       {
         "key": "ProtocolVersion",
         "status": "Rejected",
         "errorCode": 5108,
         "errorText": "CONFIGURATION_KEY_READONLY"
       }
     ]
   }
   ```
9. Send GetConfiguration to verify the value was NOT changed:
   ```json
   {
     "keys": ["ProtocolVersion"]
   }
   ```
10. Verify `ProtocolVersion` is still `"0.3.0"`.

### Part C — Change Unknown Key (NotSupported)

11. Send ChangeConfiguration with an unrecognized key (no `Vendor_` prefix):
    ```json
    {
      "keys": [
        { "key": "NonExistentKey", "value": "anything" }
      ]
    }
    ```
12. Verify ChangeConfiguration response within 60 seconds:
    ```json
    {
      "results": [
        { "key": "NonExistentKey", "status": "NotSupported" }
      ]
    }
    ```
    `errorCode` and `errorText` are OPTIONAL on a `NotSupported` entry (`spec/08-configuration.md` §8.2 — SHOULD, not MUST). If present, they MUST sit inside the `results` entry, never at the top level.

### Part D — Change Static Key Requiring Reboot (RebootRequired)

13. Send ChangeConfiguration targeting a static key:
    ```json
    {
      "keys": [
        { "key": "StationName", "value": "Test Station Alpha" }
      ]
    }
    ```
14. Verify ChangeConfiguration response within 60 seconds:
    ```json
    {
      "results": [
        { "key": "StationName", "status": "RebootRequired" }
      ]
    }
    ```
15. Verify the value is persisted but NOT yet active by sending GetConfiguration:
    ```json
    {
      "keys": ["StationName"]
    }
    ```
16. Send Reset to apply the static change:
    ```json
    {
      "force": false
    }
    ```
17. Verify Reset response `status: "Accepted"`.
18. Wait for the station to reboot and send BootNotification.
19. Send BootNotification `Accepted` response.
20. Send GetConfiguration to verify the new value is active:
    ```json
    {
      "keys": ["StationName"]
    }
    ```
21. Verify `StationName` is `"Test Station Alpha"`.

### Part E — Invalid Value Out of Range (5109)

22. Send ChangeConfiguration with an out-of-range value:
    ```json
    {
      "keys": [
        { "key": "HeartbeatIntervalSeconds", "value": "5" }
      ]
    }
    ```
23. Verify ChangeConfiguration response within 60 seconds (valid range is 10–3600):
    ```json
    {
      "results": [
        {
          "key": "HeartbeatIntervalSeconds",
          "status": "Rejected",
          "errorCode": 5109,
          "errorText": "INVALID_CONFIGURATION_VALUE"
        }
      ]
    }
    ```
24. Send GetConfiguration to verify the value was NOT changed:
    ```json
    {
      "keys": ["HeartbeatIntervalSeconds"]
    }
    ```
25. Verify `HeartbeatIntervalSeconds` is still `"60"` (from Part A).

### Part F — Atomic Multi-Key Batch, All Keys Valid (All Applied)

26. Send a two-key ChangeConfiguration in a single request:
    ```json
    {
      "keys": [
        { "key": "MeterValuesInterval", "value": "120" },
        { "key": "AuthorizationCacheEnabled", "value": "false" }
      ]
    }
    ```
27. Verify ChangeConfiguration response within 60 seconds:
    ```json
    {
      "results": [
        { "key": "MeterValuesInterval", "status": "Accepted" },
        { "key": "AuthorizationCacheEnabled", "status": "Accepted" }
      ]
    }
    ```
28. Verify `results` has exactly two entries, in the **same order as the request** `keys` array — `results[0].key` is `MeterValuesInterval` and `results[1].key` is `AuthorizationCacheEnabled`.
29. Send GetConfiguration for both keys and verify **both** were applied:
    ```json
    {
      "keys": ["MeterValuesInterval", "AuthorizationCacheEnabled"]
    }
    ```
30. Verify `MeterValuesInterval` is `"120"` and `AuthorizationCacheEnabled` is `"false"`.

### Part G — Atomic Multi-Key Batch, One Key Refused (Nothing Applied)

This is the part that distinguishes a per-key **validation verdict** from a per-key **application record**. The batch below pairs a perfectly valid Dynamic key with a read-only key. The valid key's entry reports `Accepted` — and its value MUST NOT reach the station's configuration, because the batch as a whole was refused.

31. Send a two-key ChangeConfiguration where the second key is read-only:
    ```json
    {
      "keys": [
        { "key": "MeterValuesInterval", "value": "240" },
        { "key": "ProtocolVersion", "value": "2.0.0" }
      ]
    }
    ```
32. Verify ChangeConfiguration response within 60 seconds:
    ```json
    {
      "results": [
        { "key": "MeterValuesInterval", "status": "Accepted" },
        {
          "key": "ProtocolVersion",
          "status": "Rejected",
          "errorCode": 5108,
          "errorText": "CONFIGURATION_KEY_READONLY"
        }
      ]
    }
    ```
33. Verify `results` has one entry per requested key, in request order, and that the response carries no top-level members.
34. Send GetConfiguration for both keys:
    ```json
    {
      "keys": ["MeterValuesInterval", "ProtocolVersion"]
    }
    ```
35. **Verify `MeterValuesInterval` is still `"120"` (the Part F value) and NOT `"240"`.** Its `results` entry said `Accepted`, but the batch contained a `Rejected` entry, so the station applied nothing.
36. Verify `ProtocolVersion` is still `"0.3.0"`.
37. Repeat steps 31–35 with an **unknown** key in place of the read-only key:
    ```json
    {
      "keys": [
        { "key": "MeterValuesInterval", "value": "240" },
        { "key": "NonExistentKey", "value": "anything" }
      ]
    }
    ```
38. Verify the second entry is `status: "NotSupported"`, the first is `status: "Accepted"`, and `MeterValuesInterval` is **still** `"120"` — `NotSupported` refuses the batch exactly as `Rejected` does.

## Expected Results

1. Valid RW Dynamic key change returns `Accepted` and takes effect immediately.
2. Read-only key change returns `Rejected` with `5108 CONFIGURATION_KEY_READONLY`.
3. Unknown key returns `NotSupported`.
4. Static key change returns `RebootRequired` and takes effect after reboot.
5. Out-of-range value returns `Rejected` with `5109 INVALID_CONFIGURATION_VALUE`.
6. Every RESPONSE carries a `results` array with exactly one entry per requested key, in request order, and no top-level `status`, `key`, `value`, `errorCode` or `errorText`.
7. `errorCode` and `errorText`, when present, appear inside the `results` entry they describe.
8. A multi-key batch in which every key is valid applies **every** key.
9. A multi-key batch containing any `Rejected` or `NotSupported` entry applies **no** key — including a key whose own entry reads `Accepted`.
10. All values are transmitted as strings per `spec/08-configuration.md` §1.2.
11. All responses arrive within the 60-second timeout.
12. All requests and responses validate against `change-configuration-request.schema.json` and `change-configuration-response.schema.json`.

## Failure Criteria

1. Valid RW change returns `Rejected` or `NotSupported`.
2. Read-only key change returns `Accepted`.
3. Unknown key change returns `Accepted` or `Rejected` (should be `NotSupported`).
4. Static key change takes effect without a reboot.
5. Invalid value is accepted without `5109` error.
6. ChangeConfiguration response exceeds the 60-second timeout.
7. Config values are not strings in the wire payload.
8. The RESPONSE carries a top-level `status` (or any other top-level member), rather than a `results` array — such a payload fails schema validation before a handler runs.
9. The `results` array omits an entry for a requested key, adds an entry for a key that was not requested, or returns entries in an order other than the request order.
10. `errorCode` or `errorText` appears at the top level of the response instead of inside the `results` entry.
11. **A key whose `results` entry read `Accepted` is applied even though another entry in the same batch read `Rejected` or `NotSupported`** — the station treated a per-key validation verdict as an application record and broke atomicity.
12. A batch in which every key is valid applies only some of its keys.
