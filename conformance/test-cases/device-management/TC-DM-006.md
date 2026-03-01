# TC-DM-006 — Change Configuration

## Profile

Device Management Profile

## Purpose

Verify that the station correctly handles ChangeConfiguration for valid RW keys, read-only keys (`5108 CONFIGURATION_KEY_READONLY`), unknown keys (`NotSupported`), static keys requiring reboot (`RebootRequired`), and invalid values (`5109 INVALID_CONFIGURATION_VALUE`).

## References

- `spec/profiles/device-management/change-configuration.md` — ChangeConfiguration behavior
- `spec/03-messages.md` §6.1 — ChangeConfiguration payload (timeout 60s)
- `spec/08-configuration.md` §1.3 — Access modes (RW, R, W)
- `spec/08-configuration.md` §1.4 — Mutability (Dynamic, Static)
- `spec/07-errors.md` §3.5 — Error codes 5108 `CONFIGURATION_KEY_READONLY`, 5109 `INVALID_CONFIGURATION_VALUE`
- `schemas/mqtt/change-configuration-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. MQTT connection is stable; Heartbeat exchange is functioning.
3. `HeartbeatIntervalSeconds` is at default (30).
4. Test harness can send ChangeConfiguration and GetConfiguration commands.

## Steps

### Part A — Change Valid RW Dynamic Key (Accepted)

1. Send ChangeConfiguration:
   ```json
   {
     "key": "HeartbeatIntervalSeconds",
     "value": "60"
   }
   ```
2. Verify ChangeConfiguration response within 60 seconds:
   ```json
   {
     "status": "Accepted"
   }
   ```
3. Send GetConfiguration to verify the change took effect:
   ```json
   {
     "keys": ["HeartbeatIntervalSeconds"]
   }
   ```
4. Verify GetConfiguration response contains:
   ```json
   {
     "configuration": [
       { "key": "HeartbeatIntervalSeconds", "value": "60", "readonly": false }
     ]
   }
   ```
5. Wait 60 seconds (+/- 10%) and verify the station sends a Heartbeat at the new interval.

### Part B — Change Read-Only Key (5108)

6. Send ChangeConfiguration targeting a read-only key:
   ```json
   {
     "key": "ProtocolVersion",
     "value": "2.0.0"
   }
   ```
7. Verify ChangeConfiguration response within 60 seconds:
   ```json
   {
     "status": "Rejected",
     "errorCode": 5108,
     "errorText": "CONFIGURATION_KEY_READONLY"
   }
   ```
8. Send GetConfiguration to verify the value was NOT changed:
   ```json
   {
     "keys": ["ProtocolVersion"]
   }
   ```
9. Verify `ProtocolVersion` is still `"0.1.0"`.

### Part C — Change Unknown Key (NotSupported)

10. Send ChangeConfiguration with an unrecognized key (no `Vendor_` prefix):
    ```json
    {
      "key": "NonExistentKey",
      "value": "anything"
    }
    ```
11. Verify ChangeConfiguration response within 60 seconds:
    ```json
    {
      "status": "NotSupported"
    }
    ```

### Part D — Change Static Key Requiring Reboot (RebootRequired)

12. Send ChangeConfiguration targeting a static key:
    ```json
    {
      "key": "StationName",
      "value": "Test Station Alpha"
    }
    ```
13. Verify ChangeConfiguration response within 60 seconds:
    ```json
    {
      "status": "RebootRequired"
    }
    ```
14. Verify the value is persisted but NOT yet active by sending GetConfiguration:
    ```json
    {
      "keys": ["StationName"]
    }
    ```
15. Send Reset to apply the static change:
    ```json
    {
      "type": "Soft"
    }
    ```
16. Verify Reset response `status: "Accepted"`.
17. Wait for the station to reboot and send BootNotification.
18. Send BootNotification `Accepted` response.
19. Send GetConfiguration to verify the new value is active:
    ```json
    {
      "keys": ["StationName"]
    }
    ```
20. Verify `StationName` is `"Test Station Alpha"`.

### Part E — Invalid Value Out of Range (5109)

21. Send ChangeConfiguration with an out-of-range value:
    ```json
    {
      "key": "HeartbeatIntervalSeconds",
      "value": "5"
    }
    ```
22. Verify ChangeConfiguration response within 60 seconds (valid range is 10–3600):
    ```json
    {
      "status": "Rejected",
      "errorCode": 5109,
      "errorText": "INVALID_CONFIGURATION_VALUE"
    }
    ```
23. Send GetConfiguration to verify the value was NOT changed:
    ```json
    {
      "keys": ["HeartbeatIntervalSeconds"]
    }
    ```
24. Verify `HeartbeatIntervalSeconds` is still `"60"` (from Part A).

## Expected Results

1. Valid RW Dynamic key change returns `Accepted` and takes effect immediately.
2. Read-only key change returns `Rejected` with `5108 CONFIGURATION_KEY_READONLY`.
3. Unknown key returns `NotSupported`.
4. Static key change returns `RebootRequired` and takes effect after reboot.
5. Out-of-range value returns `Rejected` with `5109 INVALID_CONFIGURATION_VALUE`.
6. All values are transmitted as strings per `spec/08-configuration.md` §1.2.
7. All responses arrive within the 60-second timeout.

## Failure Criteria

1. Valid RW change returns `Rejected` or `NotSupported`.
2. Read-only key change returns `Accepted`.
3. Unknown key change returns `Accepted` or `Rejected` (should be `NotSupported`).
4. Static key change takes effect without a reboot.
5. Invalid value is accepted without `5109` error.
6. ChangeConfiguration response exceeds the 60-second timeout.
7. Config values are not strings in the wire payload.
