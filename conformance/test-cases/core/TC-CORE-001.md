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
- `schemas/mqtt/boot-notification-request.schema.json`
- `schemas/mqtt/boot-notification-response.schema.json`

## Preconditions

1. Station has a valid mTLS certificate provisioned (if Security Profile is enabled).
2. MQTT broker (or test simulator) is reachable at the configured endpoint.
3. Station is in a clean boot state (no active sessions, no pending commands).
4. Test harness is subscribed to all station MQTT topics and can inject responses.
5. The station's `stationId` is registered in the server simulator's registry.

## Steps

### Part A — Accepted Response

1. Power on the station (or trigger a software reboot).
2. Observe that the station establishes a TLS 1.3 connection to the MQTT broker.
3. Verify that the MQTT CONNECT packet includes a Last Will and Testament (LWT) message on the station's ConnectionLost topic.
4. Observe the first MQTT PUBLISH from the station.
5. Validate that the message `action` is `BootNotification`.
6. Validate the request payload against `boot-notification-request.schema.json` — fields: `stationId`, `firmwareVersion`, `stationModel`, `stationVendor`, `bayCount`, `serialNumber`, `uptimeSeconds`, `pendingOfflineTransactions`, `timezone`, `bootReason`, `capabilities`, `networkInfo`.
7. Send a server response: `{ "status": "Accepted", "heartbeatIntervalSec": 30, "serverTime": "<current UTC>" }`.
8. Verify that the station publishes a StatusNotification for each bay (reporting current bay state).
9. Send a GetConfiguration command to the station.
10. Verify that the station responds to the GetConfiguration command (confirming it accepts commands post-Accepted).
11. Wait for `heartbeatIntervalSec` seconds.
12. Verify that the station sends a Heartbeat message within the expected interval window (heartbeatIntervalSec +/- 10%).

### Part B — Rejected Response

13. Reboot the station.
14. Observe BootNotification is sent.
15. Send a server response: `{ "status": "Rejected", "retryInterval": 60, "serverTime": "2026-01-15T10:00:30.000Z", "heartbeatIntervalSec": 30 }`.
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

## Expected Results

1. The very first message after MQTT connect is BootNotification — no other action precedes it.
2. The MQTT CONNECT packet includes a properly configured LWT on the station's ConnectionLost topic.
3. The BootNotification request payload validates against the JSON schema.
4. All required fields (`stationId`, `firmwareVersion`, `stationModel`, `stationVendor`, `bayCount`, `serialNumber`, `uptimeSeconds`, `pendingOfflineTransactions`, `timezone`, `bootReason`, `capabilities`, `networkInfo`) are present and correctly typed.
5. After Accepted, the station adopts the `heartbeatIntervalSec` and sends Heartbeat messages at the correct cadence.
6. After Accepted, the station publishes StatusNotification for every bay.
7. After Rejected, the station enters limited mode and does not process server commands.
8. After Rejected, the station retries BootNotification at the specified `retryInterval`.
9. After Pending, the station enters a restricted state (same as Rejected), does not send other messages, does not process server commands, and retries BootNotification at `retryInterval`.
10. On timeout, the station retries after 60 seconds.

## Failure Criteria

1. Station sends any MQTT message before BootNotification.
2. BootNotification payload fails JSON schema validation.
3. Station processes server commands while in Rejected or Pending state.
4. Station does not retry BootNotification after Rejected or Pending within the expected interval (+/- 15% tolerance).
5. Station does not adopt the server-provided `heartbeatIntervalSec` (Heartbeat sent at a different cadence).
6. LWT is absent from the MQTT CONNECT packet.
7. Station does not send StatusNotification for all bays after Accepted.
