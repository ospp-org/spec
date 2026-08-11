# TC-CORE-002 — Connection Lost & Recovery

## Profile

Core Profile

## Purpose

Verify that the station correctly handles MQTT disconnection scenarios: graceful disconnect, ungraceful loss with LWT delivery, reconnection with fresh BootNotification, and grace period edge timing where the station reconnects before the `ConnectionLostGracePeriod` expires.

## References

- `spec/profiles/core/connection-lost.md` — ConnectionLost LWT behavior
- `spec/profiles/core/boot-notification.md` — BootNotification on reconnect
- `spec/profiles/core/heartbeat.md` — Heartbeat resumption
- `spec/03-messages.md` §5.5 — ConnectionLost payload (§5.4 is SessionEnded)
- `spec/08-configuration.md` §2 — `ConnectionLostGracePeriod` (default 300s)
- `schemas/mqtt/boot-notification-response.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. Heartbeat is active at `HeartbeatIntervalSeconds` = 30s.
3. `ConnectionLostGracePeriod` is set to 300 seconds (default).
4. MQTT broker supports LWT delivery and is under test harness control.
5. Test harness can simulate network disconnection (TCP drop without DISCONNECT).
6. No active sessions on any bay.

## Steps

### Part A — Graceful Disconnection

1. Command the station to send an MQTT DISCONNECT packet (e.g., via a controlled shutdown command).
2. Verify that the broker does NOT publish the LWT message (graceful disconnect suppresses LWT per MQTT 5.0).
3. Verify that the server detects the station as disconnected via missing heartbeats (no LWT received).

### Part B — Ungraceful Loss with LWT

4. Reboot the station and wait for BootNotification `Accepted` and Heartbeat to resume.
5. Simulate an ungraceful disconnection by severing the TCP connection without sending MQTT DISCONNECT.
6. Wait for the broker's Keep Alive timeout (Will Delay Interval = 10 seconds per `spec/02-transport.md`).
7. Observe the broker publishes the ConnectionLost LWT message on topic `ospp/v1/stations/stn_a1b2c3d4/to-server`.
8. Validate the LWT payload:
   ```json
   {
     "stationId": "stn_a1b2c3d4",
     "reason": "UnexpectedDisconnect"
   }
   ```
9. Verify the payload contains `stationId` (REQUIRED per `spec/03-messages.md` §5.5).
10. Verify the server receives the ConnectionLost event and starts the `ConnectionLostGracePeriod` timer (300s).
11. Wait 300 seconds without the station reconnecting.
12. Verify the server marks the station as `Offline`.

### Part C — Recovery After Offline

13. Reconnect the station to the MQTT broker (after the server marked it Offline in step 12).
14. Verify that the MQTT CONNECT packet includes a fresh LWT with `stationId` in the payload.
15. Observe the station sends BootNotification as its first message.
16. Send BootNotification response:
    ```json
    {
      "status": "Accepted",
      "heartbeatIntervalSec": 30,
      "serverTime": "2026-01-15T12:00:00.000Z",
      "sessionKey": "cmVjb25uZWN0LWJvb3Qtc2Vzc2lvbi1rZXktMDAwMDAwMDAwMCE="
    }
    ```
17. Verify the station publishes StatusNotification for each bay, and inspect each payload. This is the reconnect path, and it is the one that resolves the server's `Unknown`: the server set every bay on this station to `Unknown` when it received the ConnectionLost ([CORE-008](../../../spec/profiles/core/README.md)), and only an accepted report clears it.
    - `status` is one of the six reportable states, and reflects the bay's **actual** state as the station observes it — including `Occupied` if a session survived the disconnection.
    - `status` is **not** `Unknown`. `Unknown` is the server's own bookkeeping for "I have no current report"; a station echoing it back reports nothing and leaves the bay refusing payment and StartService.
    - `previousStatus` is **absent**. The station's bays did not necessarily transition at all here — the station may never have rebooted — so there is no previous state to name, and the state the *server* is leaving is `Unknown`, which the field cannot carry.
18. Wait `heartbeatIntervalSec` seconds (30s).
19. Verify the station sends a Heartbeat within the expected interval (30s +/- 10%).
20. Verify the server marks the station as `Online`.

### Part D — Grace Period Edge (Reconnect Before Expiry)

21. Reboot the station and wait for BootNotification `Accepted`.
22. Simulate an ungraceful disconnection (TCP drop).
23. Wait for the LWT to be published (step 6–9 equivalent).
24. Wait 299 seconds (just before `ConnectionLostGracePeriod` expires).
25. Reconnect the station to the MQTT broker.
26. Observe the station sends BootNotification.
27. Send BootNotification response with `status: "Accepted"`, carrying a `sessionKey`. Every acceptance does; a response without one is malformed and a conforming station refuses it (`TC-CORE-001` Part F).
28. Verify the server did NOT mark the station as `Offline` (grace period was not exceeded).
29. Verify the station resumes normal operation (Heartbeat, StatusNotification).

## Expected Results

1. Graceful MQTT DISCONNECT does not trigger LWT delivery.
2. Ungraceful TCP drop causes the broker to publish ConnectionLost after Will Delay Interval.
3. The ConnectionLost LWT payload contains both `stationId` and `reason` fields.
4. The server starts the `ConnectionLostGracePeriod` timer upon receiving ConnectionLost.
5. After the grace period expires without reconnection, the server marks the station Offline.
6. On reconnection, the station sends a fresh BootNotification as its first message.
7. After BootNotification `Accepted`, the station resumes Heartbeat at the configured interval and sends StatusNotification for all bays, each carrying a determinate state — one of the six reportable values, never `Unknown` — and each omitting `previousStatus`. The server's `Unknown` for every bay on this station is cleared by these reports and by nothing else.
8. If the station reconnects before the grace period expires (Part D), the server does NOT mark it Offline.

## Failure Criteria

1. LWT is published after a graceful MQTT DISCONNECT.
2. LWT payload is missing `stationId`.
3. Station sends any message other than BootNotification as the first message after reconnection.
4. Station does not resume Heartbeat after BootNotification `Accepted`.
5. Server marks station Offline before `ConnectionLostGracePeriod` has elapsed.
6. Server does NOT mark station Offline after `ConnectionLostGracePeriod` with no reconnection.
7. Station does not include LWT in the MQTT CONNECT packet on reconnection.
8. Station reports `Unknown` in `status` on any bay after reconnection. This is the failure the reconnect path is most likely to produce: the server has just marked every bay `Unknown`, and a station that mirrors server state rather than reporting its own hardware will echo it back. The echo resolves nothing — the bay stays where it refuses payment and StartService (`3002 BAY_NOT_READY`).
9. Station includes `previousStatus` on any post-boot report.
