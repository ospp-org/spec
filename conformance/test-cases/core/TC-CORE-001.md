# TC-CORE-001 — Boot Notification Lifecycle

## Profile

Core Profile

## Purpose

Verify that a station sends BootNotification as the first message after establishing the MQTT transport connection, correctly handles all three response statuses (Accepted, Rejected, Pending), configures the MQTT Last Will and Testament (LWT), and does not process server commands before receiving an Accepted response.

## References

- `spec/profiles/core/boot-notification.md` — BootNotification request/response payload
- `spec/profiles/core/heartbeat.md` — Heartbeat interval adoption
- `spec/profiles/core/connection-lost.md` — LWT configuration
- `spec/07-errors.md` §5.2 — BootNotification retry policy
- `spec/07-errors.md` §3.2 — Error code 2001 `STATION_NOT_REGISTERED`
- `spec/05-state-machines.md` §1.2, §1.4 — the six reportable bay states; `Unknown` is not transmitted
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
6. Validate the request payload against `boot-notification-request.schema.json` — fields: `stationId`, `firmwareVersion`, `stationModel`, `stationVendor`, `bayCount`, `serialNumber`, `uptimeSeconds`, `pendingOfflineTransactions`, `timezone`, `bootReason`, `capabilities`, `networkInfo`.
7. Send a server response: `{ "status": "Accepted", "heartbeatIntervalSec": 30, "serverTime": "<current UTC>" }`.
8. Verify that the station publishes a StatusNotification for each bay, and inspect each payload:
   - `status` is one of the six reportable states — `Available`, `Reserved`, `Occupied`, `Finishing`, `Faulted`, `Unavailable`. A payload carrying `Unknown` fails this case; `Unknown` is not a wire value ([`05-state-machines.md` §1.2](../../../spec/05-state-machines.md)).
   - `previousStatus` is **absent**. This is the post-boot report, and the state it left was `Unknown`, which the field cannot carry ([`status-notification.md` §5 rule 2](../../../spec/profiles/core/status-notification.md)).
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
17. Verify that the station does NOT respond to the GetConfiguration command (station is in limited mode).
18. Wait `retryInterval` seconds (60s).
19. Verify that the station sends another BootNotification (retry).
20. Send an Accepted response this time.
21. Verify that the station now accepts commands.

### Part C — Pending Response

22. Reboot the station.
23. Observe BootNotification is sent.
24. Send a server response: `{ "status": "Pending", "retryInterval": 30, "serverTime": "2026-01-15T10:01:00.000Z", "heartbeatIntervalSec": 30 }`.
25. Verify the station enters a restricted state — MUST NOT send Heartbeat, StatusNotification, or other messages. MUST NOT process server commands. Only retries BootNotification after `retryInterval`.
26. Send a GetConfiguration command to the station.
27. Verify that the station does NOT respond to the GetConfiguration command (station is in restricted state, same as Rejected).
28. Wait `retryInterval` seconds (30s).
29. Verify that the station sends another BootNotification.
30. Send an Accepted response.

### Part D — Timeout (No Response)

31. Reboot the station.
32. Observe BootNotification is sent.
33. Do NOT send any response for 30 seconds.
34. Verify that the station logs a `1010 MESSAGE_TIMEOUT` error.
35. Wait 60 seconds (fixed retry delay per spec).
36. Verify that the station retries BootNotification.

### Part E — Protocol Version Mismatch (1007)

37. Reboot the station.
38. Observe BootNotification is sent.
39. Send a server response with `Rejected` status and `supportedVersions`:
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
40. Verify that the station enters limited mode (same as Part B Rejected).
41. Verify that the station **does** retry BootNotification at the `retryInterval` from the response (300 s above), per CORE-011. `1007` is `recoverable: false` because someone must act — it does not mean the station stops retrying, and a rejected station cannot be sent a firmware update, so stopping would leave on-site service as its only recovery.
42. Verify that the station logs or stores the `supportedVersions` array for diagnostic purposes.

## Expected Results

1. The very first message after MQTT connect is BootNotification — no other action precedes it.
2. The MQTT CONNECT packet includes a properly configured LWT on the station's ConnectionLost topic.
3. The BootNotification request payload validates against the JSON schema.
4. All required fields (`stationId`, `firmwareVersion`, `stationModel`, `stationVendor`, `bayCount`, `serialNumber`, `uptimeSeconds`, `pendingOfflineTransactions`, `timezone`, `bootReason`, `capabilities`, `networkInfo`) are present and correctly typed.
5. After Accepted, the station adopts the `heartbeatIntervalSec` and sends Heartbeat messages at the correct cadence.
6. After Accepted, the station publishes StatusNotification for every bay, each reporting a determinate state — one of the six reportable values, never `Unknown` — and each omitting `previousStatus`.
7. After Rejected, the station enters limited mode and does not process server commands.
8. After Rejected, the station retries BootNotification at the specified `retryInterval`.
9. After Pending, the station enters a restricted state (same as Rejected), does not send other messages, does not process server commands, and retries BootNotification at `retryInterval`.
10. On timeout, the station retries after 60 seconds.
11. After Rejected with `supportedVersions` (1007), the station enters limited mode and continues retrying BootNotification at `retryInterval`, exactly as for any other Rejected — consistent with results 7 and 8 above, and with CORE-011.

## Failure Criteria

1. Station sends any MQTT message before BootNotification.
2. BootNotification payload fails JSON schema validation.
3. Station processes server commands while in Rejected or Pending state.
4. Station does not retry BootNotification after Rejected or Pending within the expected interval (+/- 15% tolerance).
5. Station does not adopt the server-provided `heartbeatIntervalSec` (Heartbeat sent at a different cadence).
6. LWT is absent from the MQTT CONNECT packet.
7. Station does not send StatusNotification for all bays after Accepted.
8. Station stops retrying BootNotification after receiving Rejected with `1007 PROTOCOL_VERSION_MISMATCH`. A station that stops cannot be recovered over the protocol — it accepts no commands while rejected, so it can be handed no firmware update — and it will not recover if the server later regains support for its MAJOR version.
9. Station reports `Unknown` in `status` on any bay. `Unknown` is a state the station holds at power-on and resolves by self-test; reporting it transmits the absence of an answer in place of an answer, and leaves the server holding the bay where it refuses payment and StartService (`3002 BAY_NOT_READY`). A station that has not finished evaluating a bay has not yet satisfied result 6 — it reports when it knows.
10. Station includes `previousStatus` on the post-boot report. The only truthful value there is `Unknown`, which is not a wire value; the field's absence is what marks this message as the boot report.
