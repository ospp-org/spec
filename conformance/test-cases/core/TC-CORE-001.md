# TC-CORE-001 — Boot Notification Lifecycle

## Profile

Core Profile

## Purpose

Verify that a station sends BootNotification as the first message after establishing the MQTT transport connection, correctly handles all three response statuses (Accepted, Rejected, Pending), configures the MQTT Last Will and Testament (LWT), and observes the restricted-state rules of [`05-state-machines.md` §1.4](../../../spec/05-state-machines.md#14-the-restricted-states) — answering commands while `Pending`, refusing them while `Rejected`, and serving no customer in either.

## References

- `spec/profiles/core/boot-notification.md` — BootNotification request/response payload
- `spec/profiles/core/heartbeat.md` — Heartbeat interval adoption
- `spec/profiles/core/connection-lost.md` — LWT configuration
- `spec/07-errors.md` §5.2 — BootNotification retry policy
- `spec/07-errors.md` §3.2 — Error code 2001 `STATION_NOT_REGISTERED`
- `spec/05-state-machines.md` §1.2, §1.3, §1.4 — the station state machine and its restricted states
- `spec/05-state-machines.md` §2.2, §2.3, §2.4 — the six reportable bay states, the canonical transition table, and the post-boot report trigger; `Unknown` is not transmitted
- `spec/profiles/core/status-notification.md` §5 rule 2, §7 rule 2 — `previousStatus` omitted on the post-boot report
- `schemas/mqtt/boot-notification-request.schema.json`
- `schemas/mqtt/boot-notification-response.schema.json`
- `schemas/mqtt/status-notification.schema.json`

## Preconditions

1. Station has a valid mTLS certificate provisioned (if Security Profile is enabled).
2. MQTT broker (or test simulator) is reachable at the configured endpoint.
3. Station is in a clean boot state (no active sessions, no pending commands).
4. Test harness is subscribed to all station MQTT topics and can inject responses.
5. The station's `stationId` is registered in the server simulator's registry.

## Steps

### Part A — Accepted Response

1. Power on the station (or trigger a software reboot).
2. Observe that the station establishes a TLS connection (TLS 1.2 or 1.3; the floor is TLS 1.2) to the MQTT broker.
3. Verify that the MQTT CONNECT packet includes a Last Will and Testament (LWT) message on the station's ConnectionLost topic.
4. Observe the first MQTT PUBLISH from the station.
5. Validate that the message `action` is `BootNotification`.
6. Validate the request payload against `boot-notification-request.schema.json` — fields: `stationId`, `firmwareVersion`, `stationModel`, `stationVendor`, `bays`, `serialNumber`, `uptimeSeconds`, `pendingOfflineTransactions`, `timezone`, `bootReason`, `capabilities`, `networkInfo`.
7. Send a server response: `{ "status": "Accepted", "heartbeatIntervalSec": 30, "serverTime": "<current UTC>", "sessionKey": "<base64 32 bytes>" }`. `sessionKey` is REQUIRED on every acceptance; a harness that omits it is emitting a malformed response, and a conforming station will refuse it (see Part F).
8. Verify that the station publishes a StatusNotification for each bay, and inspect each payload:
   - `status` is one of the six reportable states — `Available`, `Reserved`, `Occupied`, `Finishing`, `Faulted`, `Unavailable`. A payload carrying `Unknown` fails this case; `Unknown` is not a wire value ([`05-state-machines.md` §2.2](../../../spec/05-state-machines.md)).
   - `previousStatus` is **absent**. This is the post-boot report, and the state it left was `Unknown`, which the field cannot carry ([`status-notification.md` §5 rule 2](../../../spec/profiles/core/status-notification.md)).
   - `programs[]` is present and non-empty, and the SET of `programNumber` values equals the set this station declared for the same `bayNumber` in step 6's `bays[]`. A payload carrying `services[]` fails this case — the schema is closed and services are server-minted, which the station has not yet been told any of.
   - every `programs[]` entry carries `available`; an entry with `available: false` SHOULD carry `errorCode` and `errorText`, and an entry with `available: true` MUST carry neither.
   - the payload validates against `status-notification.schema.json`.
9. Send a GetConfiguration command to the station.
10. Verify that the station responds to the GetConfiguration command (confirming it accepts commands post-Accepted).
11. Wait for `heartbeatIntervalSec` seconds.
12. Verify that the station sends a Heartbeat message within the expected interval window (heartbeatIntervalSec +/- 10%).

### Part B — Rejected Response

13. Reboot the station.
14. Observe BootNotification is sent.
15. Send a server response: `{ "status": "Rejected", "retryInterval": 60, "serverTime": "2026-01-15T10:00:30.000Z", "heartbeatIntervalSec": 30, "errorCode": 2001, "errorText": "STATION_NOT_REGISTERED" }`.
16. Immediately send a GetConfiguration command.
17. Verify that the station does NOT respond to the GetConfiguration command — `Rejected` is the restricted state that refuses commands.
18. Wait `retryInterval` seconds (60s).
19. Verify that the station sends another BootNotification (retry).
20. Send an Accepted response this time.
21. Verify that the station now accepts commands.

### Part C — Pending Response

22. Reboot the station.
23. Observe BootNotification is sent.
24. Send a server response: `{ "status": "Pending", "retryInterval": 30, "serverTime": "2026-01-15T10:01:00.000Z", "heartbeatIntervalSec": 30 }`.
25. Verify the station enters the `Pending` restricted state — it MUST NOT send Heartbeat, StatusNotification, or any other message it originates. Only BootNotification retries, after `retryInterval`.
26. Send a GetConfiguration command to the station.
27. Verify that the station **does** answer the GetConfiguration command with a RESPONSE. `Pending` is the state in which an operator repairs the station, and the command channel is how they do it. A station that stays silent here fails this case.
28. Send a ChangeConfiguration command setting `HeartbeatIntervalSeconds` to `60`.
29. Verify that the station answers it and applies the value. This is the behaviour `Pending` exists for.
30. Send a StartService command for any bay.
31. Verify that the station answers `Rejected` with `errorCode: 3002`, `errorText: "BAY_NOT_READY"`, and that **no hardware activates**. A restricted station answers commands; it does not serve customers.
32. Wait `retryInterval` seconds (30s).
33. Verify that the station sends another BootNotification.
34. Send an Accepted response.

### Part D — Timeout (No Response)

35. Reboot the station.
36. Observe BootNotification is sent.
37. Do NOT send any response for 30 seconds.
38. Verify that the station logs a `1010 MESSAGE_TIMEOUT` error.
39. Wait 60 seconds (fixed retry delay per spec).
40. Verify that the station retries BootNotification.

### Part E — Protocol Version Mismatch (1007)

41. Reboot the station.
42. Observe BootNotification is sent.
43. Send a server response with `Rejected` status and `supportedVersions`:
    ```json
    {
      "status": "Rejected",
      "serverTime": "2026-01-15T10:02:00.000Z",
      "heartbeatIntervalSec": 30,
      "retryInterval": 300,
      "errorCode": 1007,
      "errorText": "PROTOCOL_VERSION_MISMATCH",
      "supportedVersions": ["0.1.0", "0.2.0"]
    }
    ```
44. Verify that the station enters the `Rejected` restricted state (same as Part B).
45. Verify that the station **does** retry BootNotification at the `retryInterval` from the response (300 s above), per CORE-011. `1007` is `recoverable: false` because someone must act — it does not mean the station stops retrying, and a rejected station cannot be sent a firmware update, so stopping would leave on-site service as its only recovery.
46. Verify that the station logs or stores the `supportedVersions` array for diagnostic purposes.

### Part F — Accepted With No `sessionKey`

47. Reboot the station.
48. Observe BootNotification is sent.
49. Send a server response with **no** `sessionKey`:
    ```json
    {
      "status": "Accepted",
      "serverTime": "2026-01-15T10:03:00.000Z",
      "heartbeatIntervalSec": 30
    }
    ```
50. Verify that the station does **NOT** enter normal operation: no StatusNotification, no Heartbeat, no command processing.
51. Verify that the station logs `1005 INVALID_MESSAGE_FORMAT`.
52. Verify that the station retries BootNotification per CORE-011.
53. Send a well-formed `Accepted` carrying a `sessionKey`, and verify the station now proceeds normally.

## Expected Results

1. The very first message after MQTT connect is BootNotification — no other action precedes it.
2. The MQTT CONNECT packet includes a properly configured LWT on the station's ConnectionLost topic.
3. The BootNotification request payload validates against the JSON schema.
4. All required fields (`stationId`, `firmwareVersion`, `stationModel`, `stationVendor`, `bays`, `serialNumber`, `uptimeSeconds`, `pendingOfflineTransactions`, `timezone`, `bootReason`, `capabilities`, `networkInfo`) are present and correctly typed.
5. After Accepted, the station adopts the `heartbeatIntervalSec` and sends Heartbeat messages at the correct cadence.
6. After Accepted, the station publishes StatusNotification for every bay, each reporting a determinate state — one of the six reportable values, never `Unknown` — and each omitting `previousStatus`.
7. After Rejected, the station enters the `Rejected` restricted state and does not process server commands.
8. After Rejected, the station retries BootNotification at the specified `retryInterval`.
9. After Pending, the station enters the `Pending` restricted state: it sends nothing it originates, **answers** server commands, refuses StartService and ReserveBay with `3002 BAY_NOT_READY`, and retries BootNotification at `retryInterval`.
10. On timeout, the station retries after 60 seconds.
11. After Rejected with `supportedVersions` (1007), the station enters the `Rejected` restricted state and continues retrying BootNotification at `retryInterval`, exactly as for any other Rejected — consistent with results 7 and 8 above, and with CORE-011.
12. An `Accepted` carrying no `sessionKey` is treated as malformed: the station logs `1005`, stays out of normal operation, and retries. It does not proceed keyless.

## Failure Criteria

1. Station sends any MQTT message before BootNotification.
2. BootNotification payload fails JSON schema validation.
3. Station processes server commands while `Rejected`; or fails to answer one while `Pending`; or activates hardware for a StartService in either state.
4. Station enters normal operation after an `Accepted` that carried no `sessionKey`. Proceeding keyless is the worst available failure: it can sign nothing, the server rejects everything it sends, and the resulting MAC-failure events name the station as the suspect.
5. Station does not retry BootNotification after Rejected or Pending within the expected interval (+/- 15% tolerance).
6. Station does not adopt the server-provided `heartbeatIntervalSec` (Heartbeat sent at a different cadence).
7. LWT is absent from the MQTT CONNECT packet.
8. Station does not send StatusNotification for all bays after Accepted.
9. Station stops retrying BootNotification after receiving Rejected with `1007 PROTOCOL_VERSION_MISMATCH`. A station that stops cannot be recovered over the protocol — it accepts no commands while rejected, so it can be handed no firmware update — and it will not recover if the server later adds its version to the supported set.
10. Station reports `Unknown` in `status` on any bay. `Unknown` is a state the station holds at power-on and resolves by self-test; reporting it transmits the absence of an answer in place of an answer, and leaves the server holding the bay where it refuses payment and StartService (`3002 BAY_NOT_READY`). A station that has not finished evaluating a bay has not yet satisfied result 6 — it reports when it knows.
11. Station reports `services[]` on a StatusNotification, or omits a program the bay declared at provisioning instead of reporting it `available: false`.
12. Station includes `previousStatus` on the post-boot report. The only truthful value there is `Unknown`, which is not a wire value; the field's absence is what marks this message as the boot report.
