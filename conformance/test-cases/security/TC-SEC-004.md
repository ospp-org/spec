# TC-SEC-004 — SecurityEvent Verification

## Profile

Security Profile

## Purpose

Verify that the station generates SecurityEvent [MSG-012] messages with correct event types, severity levels, payload structure, and delivery behavior. This test covers multiple event types triggered by distinct security incidents, verifies severity-level handling (Critical events MUST NOT be suppressed, Warning/Info MAY be batched), and validates the SecurityEvent payload structure.

## References

- `spec/profiles/security/security-event.md` — SecurityEvent behavior, event types, severity levels, processing rules
- `spec/03-messages.md` §5.5 — SecurityEvent payload (EVENT, fire-and-forget, no response)
- `spec/06-security.md` §7.5 — Security monitoring and event generation
- `schemas/mqtt/security-event.schema.json`

## Preconditions

1. Station `stn_a1b2c3d4` is booted and has received BootNotification `Accepted`.
2. MQTT connection is stable; Heartbeat exchange is functioning.
3. `MessageSigningMode` is set to `Critical` (HMAC signing enabled).
4. Test harness is subscribed to the station's `to-server` topic and can capture all SecurityEvent messages.
5. Test harness can send messages with invalid HMAC signatures.
6. Test harness can send firmware update commands with version numbers.
7. Station has a known current firmware version (e.g., `"2.1.0"`).

## Steps

### Part A — Event Type Coverage

#### A1 — MacVerificationFailure (Critical)

1. Send a GetConfiguration command to the station with an invalid HMAC signature (tampered `mac` field).
2. Verify the station rejects the command (does not process it).
3. Observe SecurityEvent from the station:
   ```json
   {
     "eventId": "sec_<unique_12+ chars>",
     "type": "MacVerificationFailure",
     "severity": "Critical",
     "timestamp": "<ISO 8601 UTC>",
     "details": {
       "messageId": "<id of the rejected message>",
       "action": "GetConfiguration"
     }
   }
   ```
4. Verify `eventId` starts with `sec_` and is at least 12 characters.
5. Verify `severity` is `"Critical"`.
6. Verify `timestamp` is ISO 8601 UTC format.
7. Verify `details` contains at least `messageId` and `action`.

#### A2 — UnauthorizedAccess (Warning)

8. Send a command from an unauthorized source (e.g., publish to the station's `to-station` topic from a client that is not the server, or send a command with an action the station does not recognize from the authorized source).
9. Observe SecurityEvent from the station:
   ```json
   {
     "eventId": "sec_<unique>",
     "type": "UnauthorizedAccess",
     "severity": "Warning",
     "timestamp": "<ISO 8601 UTC>",
     "details": {}
   }
   ```
10. Verify `type` is `"UnauthorizedAccess"` and `severity` is `"Warning"`.

#### A3 — FirmwareDowngradeAttempt (Warning)

11. Send an UpdateFirmware command with a firmware version older than the currently installed version:
    ```json
    {
      "firmwareUrl": "https://fw.example.com/ospp-station-1.0.0.bin",
      "firmwareVersion": "1.0.0",
      "checksum": "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      "signature": "MEUCIQDxR2v3..."
    }
    ```
12. Observe SecurityEvent from the station:
    ```json
    {
      "eventId": "sec_<unique>",
      "type": "FirmwareDowngradeAttempt",
      "severity": "Warning",
      "timestamp": "<ISO 8601 UTC>",
      "details": {
        "currentVersion": "2.1.0",
        "attemptedVersion": "1.0.0"
      }
    }
    ```
13. Verify `type` is `"FirmwareDowngradeAttempt"` and `severity` is `"Warning"`.
14. Verify `details` includes `currentVersion` and `attemptedVersion`.

### Part B — Severity Level Behavior

#### B1 — Critical Events MUST NOT Be Suppressed

15. Send 5 messages with invalid HMAC signatures in rapid succession (within 10 seconds).
16. Verify the station generates exactly 5 SecurityEvent messages with `type: "MacVerificationFailure"`.
17. Verify no events are suppressed or batched — each invalid message produces one SecurityEvent.
18. Verify all 5 events have `severity: "Critical"`.

#### B2 — Warning Escalation (3+ Same Type in 5 Minutes)

19. Trigger 3 `UnauthorizedAccess` events within 5 minutes (by sending 3 unauthorized commands).
20. Verify 3 SecurityEvent messages are generated with `type: "UnauthorizedAccess"`, `severity: "Warning"`.
21. Verify the server-side escalation rule: after 3+ warnings of the same type within 5 minutes, the server SHOULD escalate to Critical-level handling (operator alert).

#### B3 — Info/Warning Batching Under High Volume

22. Trigger more than 10 Warning-level events within 1 minute (e.g., 12 `UnauthorizedAccess` events).
23. Verify the station delivers all 12 events (batching is allowed but each event MUST still be delivered).
24. Verify each event has a unique `eventId`.

### Part C — SecurityEvent Payload Structure

25. Capture any SecurityEvent from Part A or Part B.
26. Verify all required fields are present:
    - `eventId` (string, starts with `sec_`, minimum 12 characters)
    - `type` (string, one of the 10 defined event types)
    - `severity` (string, one of: `"Critical"`, `"Error"`, `"Warning"`, `"Info"`)
    - `timestamp` (string, ISO 8601 UTC)
    - `details` (object)
27. Verify the MQTT envelope fields:
    - `messageType` is `"Event"`
    - `action` is `"SecurityEvent"`
    - `source` is `"Station"`
28. Verify the station does NOT expect a response (fire-and-forget).
29. Verify `eventId` uniqueness: no two SecurityEvent messages in this test share the same `eventId`.

## Expected Results

1. `MacVerificationFailure` is generated with `severity: "Critical"` when an invalid HMAC is received.
2. `UnauthorizedAccess` is generated with `severity: "Warning"` for unauthorized commands.
3. `FirmwareDowngradeAttempt` is generated with `severity: "Warning"` when a downgrade firmware version is received.
4. Critical events are never suppressed — 5 rapid invalid HMAC messages produce 5 SecurityEvents.
5. Warning events are delivered individually (batching allowed for >10/minute, but each event is still delivered).
6. Each SecurityEvent has a unique `eventId` with `sec_` prefix (minimum 12 characters).
7. All required payload fields (`eventId`, `type`, `severity`, `timestamp`, `details`) are present.
8. SecurityEvent is fire-and-forget — no response is expected or sent.
9. The `details` object contains context relevant to the event type.
10. All SecurityEvents are delivered via MQTT on the station's `to-server` topic.

## Failure Criteria

1. Station does not generate a SecurityEvent for a security-relevant incident.
2. Wrong `type` or `severity` for a triggered event.
3. Critical events are suppressed or batched (each must be delivered individually).
4. `eventId` is missing, does not start with `sec_`, or is fewer than 12 characters.
5. Required fields (`eventId`, `type`, `severity`, `timestamp`, `details`) are missing.
6. Duplicate `eventId` values across different events.
7. Station sends a response to a SecurityEvent (should be fire-and-forget).
8. Warning/Info events are dropped (batching is allowed but delivery is mandatory).
