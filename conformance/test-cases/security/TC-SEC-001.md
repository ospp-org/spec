# TC-SEC-001 — HMAC Signature Verification

## Profile

Security Profile

## Purpose

Verify that the station correctly computes and attaches HMAC-SHA256 signatures to outgoing messages when `MessageSigningMode` is configured (mode `"all"` or `"critical"`), and that the station rejects incoming messages with invalid or missing HMAC signatures with appropriate error codes (`1012 MAC_VERIFICATION_FAILED`, `1013 MAC_MISSING`).

## References

- `spec/07-errors.md` §3.1 — Error codes 1012 `MAC_VERIFICATION_FAILED`, 1013 `MAC_MISSING`
- `spec/07-errors.md` §2.1 — MQTT error response format with `mac` field
- `spec/profiles/security/security-event.md` — SecurityEvent for MacVerificationFailure events
- `spec/profiles/core/boot-notification.md` — Message signing enabled after BootNotification ACCEPTED

## Preconditions

1. Station is booted and has received BootNotification ACCEPTED.
2. `MessageSigningMode` configuration key is set to `"all"` on the station.
3. A shared HMAC secret key is provisioned on both the station and the test harness.
4. MQTT connection is stable.
5. The test harness can compute valid HMAC-SHA256 signatures using the same shared secret.
6. The station's SecurityEvent topic is subscribed to by the test harness.

## Steps

### Part A — Station Signs Outgoing Messages

1. Trigger the station to send a Heartbeat message.
2. Capture the Heartbeat message from the station.
3. Verify that the message envelope contains a `mac` field.
4. Extract the `mac` value (hex or base64-encoded HMAC-SHA256).
5. Independently compute the expected HMAC-SHA256 over the message payload (excluding the `mac` field itself) using the shared secret.
6. Verify that the station's `mac` matches the independently computed value.
7. Trigger the station to send a StatusNotification (e.g., by starting and stopping a session or querying bay status).
8. Verify the StatusNotification also contains a valid `mac` field with correct HMAC.

### Part B — Station Accepts Validly Signed Messages

9. Construct a GetConfiguration command with a valid HMAC-SHA256 `mac` field computed over the payload.
10. Send the signed GetConfiguration command.
11. Verify the station processes the command and returns a valid GetConfiguration RESPONSE.
12. Verify the RESPONSE also contains a valid `mac` field.

### Part C — Station Rejects Invalid HMAC

13. Construct a ChangeConfiguration command.
14. Compute the HMAC-SHA256 `mac` field, then alter one byte of the `mac` value (producing an invalid signature).
15. Send the tampered message.
16. Verify the station responds with REJECTED, error code `1012` (`MAC_VERIFICATION_FAILED`), severity `Critical`.
17. Observe a SecurityEvent from the station:
    - `type: "MacVerificationFailure"`
    - Severity is Critical
    - Details reference the rejected message.
18. Verify the ChangeConfiguration was NOT applied (send GetConfiguration to confirm values unchanged).

### Part D — Station Rejects Missing HMAC

19. Construct a valid ChangeConfiguration command WITHOUT a `mac` field.
20. Send the unsigned message.
21. Verify the station responds with REJECTED, error code `1013` (`MAC_MISSING`), severity `Error`.
22. Observe a SecurityEvent from the station reporting the missing MAC.
23. Verify the ChangeConfiguration was NOT applied.

### Part E — Repeated MAC Failures Trigger Escalation

24. Send 3 messages with invalid `mac` values from the same source within 60 seconds.
25. Verify the station logs a SecurityEvent after each failure.
26. After the 3rd failure, verify the station flags the source as potentially compromised (per spec: "3+ failures from same source within 60s" escalation rule).

## Expected Results

1. All outgoing station messages include a `mac` field when `MessageSigningMode` is `"all"`.
2. The `mac` field contains a correct HMAC-SHA256 computed over the message payload using the shared secret.
3. The station processes incoming messages with valid HMAC signatures normally.
4. Messages with invalid HMAC are rejected with error `1012 MAC_VERIFICATION_FAILED` and severity `Critical`.
5. Messages with missing HMAC are rejected with error `1013 MAC_MISSING` and severity `Error`.
6. Each MAC failure triggers a SecurityEvent.
7. 3+ MAC failures from the same source within 60 seconds trigger a compromise escalation.
8. Commands rejected due to MAC errors are NOT executed.

## Failure Criteria

1. Station sends messages without `mac` field when `MessageSigningMode` requires signing.
2. Station's `mac` value does not match the independently computed HMAC-SHA256.
3. Station accepts and processes a message with an invalid HMAC signature.
4. Station accepts and processes a message with a missing HMAC when signing is enabled.
5. Incorrect error code returned (e.g., `1005` instead of `1012` for invalid MAC).
6. No SecurityEvent is generated on MAC verification failure.
7. A command with invalid MAC is executed (configuration changed, session started, etc.).
8. Station does not escalate after 3+ MAC failures within 60 seconds.
