# TC-SEC-001 — HMAC Signature Verification

## Profile

Security Profile

## Purpose

Verify that the station correctly computes and attaches HMAC-SHA256 signatures to **every** outgoing message except the three structural exemptions, and that it rejects incoming messages with invalid or missing HMAC signatures with the appropriate error codes (`1012 MAC_VERIFICATION_FAILED`, `1013 MAC_MISSING`). The mode under test is `"All"` — PascalCase, as every OSPP enum is.

## References

- `spec/07-errors.md` §3.1 — Error codes 1012 `MAC_VERIFICATION_FAILED`, 1013 `MAC_MISSING`
- `spec/07-errors.md` §2.1 — MQTT error response format with `mac` field
- `spec/profiles/security/security-event.md` — SecurityEvent for MacVerificationFailure events
- `spec/profiles/core/boot-notification.md` — Message signing enabled after BootNotification ACCEPTED

## Preconditions

1. Station is booted and has received BootNotification ACCEPTED.
2. `MessageSigningMode` configuration key is set to `"All"` on the station — this is its default, and the only other value is `"None"`.
3. The harness holds the **session key the server issued in the BootNotification RESPONSE** of precondition 1. There is no pre-provisioned shared secret in OSPP: the server generates a random 32-byte key per boot, delivers it as `sessionKey` on every `Accepted` and every `Pending` response, and both sides hold it in volatile memory only for the life of that MQTT session ([`06-security.md` §5.2](../../../spec/06-security.md)). A harness that expects a static provisioned secret cannot run this case against a conforming station, and re-running it after a station reboot requires re-reading the new key.
4. MQTT connection is stable.
5. The test harness can compute valid HMAC-SHA256 signatures using that session key.
6. The station's SecurityEvent topic is subscribed to by the test harness.

## Steps

### Part A — Station Signs Outgoing Messages

1. Trigger the station to send a Heartbeat message.
2. Capture the Heartbeat message from the station.
3. Verify that the message envelope contains a `mac` field.
4. Extract the `mac` value (hex or base64-encoded HMAC-SHA256).
5. Independently compute the expected HMAC-SHA256 using the session key. **The MAC input is the whole message envelope with the `mac` field removed, reduced to OSPP Canonical Form — not the `payload` object alone** ([`06-security.md` §5.3](../../../spec/06-security.md#53-canonical-form), which applies §4.8 to the envelope; its worked example canonicalises `action`, `messageId`, `messageType`, `protocolVersion`, `source`, `timestamp` **and** `payload`). A harness that MACs only the payload leaves `messageId` and `timestamp` unbound, which is what makes the MAC a replay defence at all.
6. Verify that the station's `mac` matches the independently computed value.
7. Trigger the station to send a StatusNotification (e.g., by starting and stopping a session or querying bay status).
8. Verify the StatusNotification also contains a valid `mac` field with correct HMAC.

### Part B — Station Accepts Validly Signed Messages

9. Construct a GetConfiguration command with a valid HMAC-SHA256 `mac` field computed over the canonicalised envelope less `mac` (§5.3), as in step 5.
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

1. All outgoing station messages include a `mac` field, except BootNotification REQUEST and the LWT. A Heartbeat, StatusNotification or MeterValues without one fails this case: there is no informational exemption.
2. The `mac` field contains a correct HMAC-SHA256 computed over the **canonicalised envelope with `mac` removed** (§5.3), using the session key — not over the `payload` object alone.
3. The station processes incoming messages with valid HMAC signatures normally.
4. Messages with invalid HMAC are rejected with error `1012 MAC_VERIFICATION_FAILED` and severity `Critical`.
5. Messages with missing HMAC are rejected with error `1013 MAC_MISSING` and severity `Error`.
6. Each MAC failure triggers a SecurityEvent.
7. 3+ MAC failures from the same source within 60 seconds trigger a compromise escalation.
8. Commands rejected due to MAC errors are NOT executed.

## Failure Criteria

1. Station sends any message without a `mac` field while `MessageSigningMode` is `"All"`, other than BootNotification REQUEST or the LWT.
2. Station's `mac` value does not match the independently computed HMAC-SHA256.
3. Station accepts and processes a message with an invalid HMAC signature.
4. Station accepts and processes a message with a missing HMAC when signing is enabled.
5. Incorrect error code returned (e.g., `1005` instead of `1012` for invalid MAC).
6. No SecurityEvent is generated on MAC verification failure.
7. A command with invalid MAC is executed (configuration changed, session started, etc.).
8. Station does not escalate after 3+ MAC failures within 60 seconds.
