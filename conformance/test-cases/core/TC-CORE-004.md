# TC-CORE-004 — DataTransfer and TriggerMessage

## Profile

Core Profile

> **Two Core-mandatory actions that had no conformance case and no example payload.** Both are
> listed as Core in [`03-messages.md`](../../../spec/03-messages.md) — DataTransfer is MSG-025,
> TriggerMessage is MSG-026 — and neither was reachable from any `TC-*` file before `0.23.0`.
> TriggerMessage appeared only inside `TC-SEC-003`, and never with
> `requestedMessage: "DiagnosticsNotification"` despite a shipped vector for exactly that.

## Purpose

Verify that the station answers DataTransfer for a vendor and data identifier it does not know with
the two status values reserved for that, rather than with an error code; and that it answers
TriggerMessage by emitting the requested message, refusing the ones a restricted station may not
originate, and reporting `NotImplemented` for a message it does not support.

## References

- `spec/03-messages.md` §6.13 — DataTransfer payload and status values
- `spec/03-messages.md` §6.14 — TriggerMessage payload and status values
- `spec/07-errors.md` §4.2 — both rows read *(implicit only — uses status values, not error codes)*
- `spec/05-state-machines.md` §1.4 — the TriggerMessage rows of the restricted-state command table
- `schemas/mqtt/data-transfer-request.schema.json`, `data-transfer-response.schema.json`
- `schemas/mqtt/trigger-message-request.schema.json`, `trigger-message-response.schema.json`
- `conformance/test-vectors/valid/core/trigger-message-request-diagnostics.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. MQTT connection is stable; Heartbeat exchange is functioning.
3. The vendor's documentation states which `vendorId` values the station recognises, and which
   `dataId` values it accepts under each. If it recognises none, Part A step 1 is the only
   applicable step and Part B is skipped with that reason recorded.

## Steps

### Part A — DataTransfer, Unknown Vendor and Unknown Data

1. Send DataTransfer with a `vendorId` the station does not recognise:
   ```json
   {
     "vendorId": "com.nosuchvendor.test",
     "dataId": "Ping"
   }
   ```
2. Verify the response is:
   ```json
   {
     "status": "UnknownVendor"
   }
   ```
3. Verify the response carries **no** `errorCode` and **no** `errorText`. This message reports
   refusal through its `status` enum; the response schema has no error members to carry a code, and
   `07-errors.md` §4.2 says so in its own row.
4. Send DataTransfer with a `vendorId` the station **does** recognise and a `dataId` it does not:
   ```json
   {
     "vendorId": "com.acmecorp.ssp",
     "dataId": "NoSuchOperation"
   }
   ```
5. Verify the response is `status: "UnknownData"`, again with no error members.
6. Verify the station remains operational and that neither exchange changed any bay or session
   state.

### Part B — DataTransfer, a Vendor Operation the Station Accepts

7. Send a DataTransfer the vendor documents as supported, carrying a `data` object.
8. Verify the response is `status: "Accepted"`, and that any `data` it returns validates against
   `schemas/mqtt/data-transfer-response.schema.json`.
9. Verify the effect the vendor documents actually occurred. A station that answers `Accepted` and
   does nothing is the failure this step exists to catch.

### Part C — TriggerMessage Emits the Requested Message

10. Send TriggerMessage:
    ```json
    {
      "requestedMessage": "StatusNotification",
      "bayId": "bay_c1d2e3f4a5b6"
    }
    ```
11. Verify the response is `status: "Accepted"` within the 10-second timeout.
12. Verify a StatusNotification [MSG-009] for that bay follows the response, carrying the bay's
    **current** state — not a state change, because none occurred.
13. Send TriggerMessage with `requestedMessage: "DiagnosticsNotification"` while **no** diagnostics
    upload is in progress.
14. Verify the station answers `Rejected`: there is no diagnostics state to report, the machine is
    in `Idle`, and `Idle` has no notification value
    (`spec/05-state-machines.md` §8.4). A station that invents a `Collecting` here reports a
    collection that is not happening.
15. Send TriggerMessage naming a message the station does not implement. Verify the response is
    `status: "NotImplemented"`, with no `errorCode`.

### Part D — TriggerMessage Against a Restricted Station

16. Bring the station to the **`Pending`** restricted state (see `TC-DM-005` Part F for the
    procedure).
17. Send TriggerMessage with `requestedMessage: "BootNotification"`. Verify `Accepted`, and that
    the station boots immediately rather than waiting out `retryInterval`.
18. Return the station to `Pending` and send TriggerMessage with
    `requestedMessage: "StatusNotification"`. Verify the response is **`Rejected`**: StatusNotification
    is an EVENT a restricted station may not originate, and triggering it repairs nothing about the
    station's own standing (`spec/05-state-machines.md` §1.4).
19. Repeat step 18 for `MeterValues`, `Heartbeat`, `DiagnosticsNotification`,
    `FirmwareStatusNotification` and `SecurityEvent`. Verify **each** is `Rejected`.
20. Send TriggerMessage with `requestedMessage: "SignCertificate"`. Verify **`Accepted`** — it is
    the second message a restricted station may originate, and this and TriggerCertificateRenewal
    [MSG-024] are two routes to one act.

## Expected Results

1. An unrecognised `vendorId` returns `UnknownVendor`; an unrecognised `dataId` under a known
   vendor returns `UnknownData`.
2. No DataTransfer response carries an `errorCode` or `errorText`.
3. A supported vendor operation returns `Accepted` **and** has its documented effect.
4. TriggerMessage `Accepted` is followed by the requested message.
5. TriggerMessage for an unsupported message returns `NotImplemented`.
6. On a `Pending` station, TriggerMessage is `Accepted` for `BootNotification` and
   `SignCertificate`, and `Rejected` for all six EVENT messages.

## Failure Criteria

1. An unknown vendor or data identifier is answered with an error code instead of the status value.
2. A DataTransfer response carries `errorCode` or `errorText`.
3. A vendor operation is answered `Accepted` with no effect.
4. TriggerMessage returns `Accepted` and no message follows.
5. TriggerMessage returns an error code where the enum has `NotImplemented`.
6. A `Pending` station accepts a TriggerMessage for any of the six EVENT messages, or refuses one
   for `BootNotification` or `SignCertificate`.
7. `DiagnosticsNotification` is triggered successfully while no upload is in progress, reporting a
   collection that is not happening.
