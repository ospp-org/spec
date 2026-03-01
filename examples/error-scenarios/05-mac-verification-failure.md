# Error Scenario 05: MAC Verification Failure

## Scenario

The server sends a `ChangeConfiguration` REQUEST to update the station's heartbeat
interval. During transit, a man-in-the-middle attacker modifies the payload (changes
the heartbeat interval from "60" to "3600" to reduce monitoring frequency). The
station computes the HMAC-SHA256 of the received message body, finds it does not
match the `mac` field in the envelope, and rejects the message. The station reports
a SecurityEvent and does not apply the configuration change. After 3 MAC failures
within 60 seconds, the station flags a potential channel compromise.

**Station:** stn_a1b2c3d4 ("SSP-3000" by AcmeCorp)
**Attack vector:** Man-in-the-middle on MQTT transport
**Original message:** ChangeConfiguration (HeartbeatIntervalSeconds = "60")
**Tampered message:** ChangeConfiguration (HeartbeatIntervalSeconds = "3600")

## What Goes Wrong

An attacker with access to the network segment between the MQTT broker and the
station intercepts the `ChangeConfiguration` message. The attacker modifies the
`HeartbeatIntervalSeconds` value from `"60"` to `"3600"` (increasing the interval from
1 minute to 1 hour, which would make the station effectively unmonitored). However,
the attacker cannot recompute a valid HMAC because they do not possess the shared
secret key. The station detects the mismatch and rejects the message with error
code **1012 MAC_VERIFICATION_FAILED**.

## Timeline

| Time | Event |
|------|-------|
| 15:00:00.000 | Server sends ChangeConfiguration REQUEST |
| 15:00:00.300 | Attacker intercepts and modifies payload in transit |
| 15:00:00.500 | Station receives tampered message |
| 15:00:00.800 | Station computes HMAC -- mismatch detected |
| 15:00:01.000 | Station rejects message (1012 MAC_VERIFICATION_FAILED) |
| 15:00:01.200 | Station sends SecurityEvent (MacVerificationFailure) |
| 15:00:01.500 | Station sends RESPONSE with error to server |
| 15:00:02.000 | Server receives rejection, logs security incident |

## Complete Message Sequence

### 1. Server -> Station: ChangeConfiguration REQUEST (Original, Before Tampering)

This is what the server actually sent. The `mac` field is computed over the
canonical JSON serialization of the complete message (excluding the `mac` field
itself).

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_s2c_pp660001",
  "messageType": "Request",
  "action": "ChangeConfiguration",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "timestamp": "2026-02-13T15:00:00.000Z",
  "mac": "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
  "payload": {
    "key": "HeartbeatIntervalSeconds",
    "value": "60"
  }
}
```

**Server's MAC computation:**
```
HMAC-SHA256(
  key: station_shared_secret_stn_a1b2c3d4,
  message: canonical_json({
    "messageId": "msg_s2c_pp660001",
    "messageType": "Request",
    "action": "ChangeConfiguration",
    "source": "Server",
    "protocolVersion": "0.1.0",
    "timestamp": "2026-02-13T15:00:00.000Z",
    "payload": {
      "key": "HeartbeatIntervalSeconds",
      "value": "60"
    }
  })
) = e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4
```

### 2. Tampered Message (What the Station Actually Receives)

The attacker changed `"value": "60"` to `"value": "3600"` but could not
recompute the MAC (does not have the shared secret). The `mac` field still
contains the original value.

```json
{
  "messageId": "msg_s2c_pp660001",
  "messageType": "Request",
  "action": "ChangeConfiguration",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "timestamp": "2026-02-13T15:00:00.000Z",
  "mac": "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
  "payload": {
    "key": "HeartbeatIntervalSeconds",
    "value": "3600"
  }
}
```

### 3. Station: MAC Verification Process

```
MAC Verification for message msg_s2c_pp660001:

  Step 1: Extract received MAC from envelope
    receivedMac: e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4

  Step 2: Compute HMAC over received message body (excluding mac field)
    HMAC-SHA256(
      key: station_shared_secret_stn_a1b2c3d4,
      message: canonical_json({
        "messageId": "msg_s2c_pp660001",
        "messageType": "Request",
        "action": "ChangeConfiguration",
        "source": "Server",
        "protocolVersion": "0.1.0",
        "timestamp": "2026-02-13T15:00:00.000Z",
        "payload": {
          "key": "HeartbeatIntervalSeconds",
          "value": "3600"              <-- tampered value
        }
      })
    ) = 7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8

  Step 3: Compare
    Expected (computed): 7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8
    Received (envelope): e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4
    Match: NO

  Result: MAC VERIFICATION FAILED
  Action: Message REJECTED — configuration NOT applied
```

### 4. Station -> Server: SecurityEvent EVENT (MacVerificationFailure)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_c2s_qq770001",
  "messageType": "Event",
  "action": "SecurityEvent",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "timestamp": "2026-02-13T15:00:01.200Z",
  "mac": "b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3",
  "payload": {
    "eventId": "sec_pp660001a1b2",
    "type": "MacVerificationFailure",
    "severity": "Critical",
    "timestamp": "2026-02-13T15:00:01.200Z",
    "details": {
      "messageId": "msg_s2c_pp660001",
      "action": "ChangeConfiguration",
      "expectedMac": "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8",
      "receivedMac": "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
      "macAlgorithm": "HMAC-SHA256",
      "messageTimestamp": "2026-02-13T15:00:00.000Z",
      "failuresInWindow": 1,
      "windowSeconds": 60,
      "thresholdForCompromiseFlag": 3
    }
  }
}
```

### 5. Station -> Server: ChangeConfiguration RESPONSE (Rejected)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_s2c_pp660001",
  "messageType": "Response",
  "action": "ChangeConfiguration",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "timestamp": "2026-02-13T15:00:01.500Z",
  "mac": "c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4",
  "payload": {
    "status": "Rejected",
    "errorCode": 1012,
    "errorText": "MAC_VERIFICATION_FAILED"
  }
}
```

### 6. Escalation: 3 Failures in 60 Seconds (Potential Compromise)

If the attacker continues intercepting and modifying messages, the station's
failure counter reaches the threshold of 3 within the 60-second window:

**Third SecurityEvent (at 15:00:45):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_c2s_qq770005",
  "messageType": "Event",
  "action": "SecurityEvent",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "timestamp": "2026-02-13T15:00:45.000Z",
  "mac": "d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
  "payload": {
    "eventId": "sec_pp660004c3d4",
    "type": "MacVerificationFailure",
    "severity": "Critical",
    "timestamp": "2026-02-13T15:00:45.000Z",
    "details": {
      "escalationReason": "MAC verification failure threshold reached (3 failures in 60 seconds). Potential man-in-the-middle attack or channel compromise detected.",
      "messageIds": [
        "msg_s2c_pp660001",
        "msg_s2c_pp660002",
        "msg_s2c_pp660003"
      ],
      "failuresInWindow": 3,
      "windowSeconds": 60,
      "windowStart": "2026-02-13T14:59:45.000Z",
      "windowEnd": "2026-02-13T15:00:45.000Z"
    },
    "stationAction": {
      "rejectAllIncoming": true,
      "rejectUntil": "2026-02-13T15:05:45.000Z",
      "lockoutDurationSeconds": 300,
      "requireKeyRotation": true
    }
  }
}
```

### 7. Server -> Operator: Security Alert

```json
{
  "type": "operator.security_alert",
  "timestamp": "2026-02-13T15:00:46.000Z",
  "priority": "CRITICAL",
  "payload": {
    "alertId": "alert_rr880001",
    "stationId": "stn_a1b2c3d4",
    "stationName": "SSP-3000",
    "alertType": "potential_channel_compromise",
    "description": "Station stn_a1b2c3d4 reported 3 MAC verification failures within 60 seconds. This may indicate a man-in-the-middle attack on the MQTT channel.",
    "failedMessages": [
      {
        "messageId": "msg_s2c_pp660001",
        "action": "ChangeConfiguration",
        "timestamp": "2026-02-13T15:00:00.000Z"
      },
      {
        "messageId": "msg_s2c_pp660002",
        "action": "ChangeConfiguration",
        "timestamp": "2026-02-13T15:00:20.000Z"
      },
      {
        "messageId": "msg_s2c_pp660003",
        "action": "ChangeConfiguration",
        "timestamp": "2026-02-13T15:00:40.000Z"
      }
    ],
    "stationLockoutActive": true,
    "stationLockoutUntil": "2026-02-13T15:05:45.000Z",
    "recommendedActions": [
      "Investigate network infrastructure for unauthorized devices",
      "Check MQTT broker access logs for suspicious connections",
      "Verify TLS certificate chain on station's MQTT connection",
      "Rotate station shared secret (key rotation)",
      "Consider enabling mutual TLS if not already active"
    ],
    "escalationLevel": 1,
    "autoEscalateAfterMinutes": 15
  }
}
```

## What the User Sees

### End Users (Alice and Others)

End users are not directly affected by MAC verification failures on configuration
messages. The station continues to operate normally for active sessions. However,
if the station enters the 5-minute lockout (after 3 failures), new session
requests may be delayed or rejected while the lockout is active.

### Operator Dashboard

A red security alert banner:

> **SECURITY ALERT -- SSP-3000**
> Possible man-in-the-middle attack detected!
> 3 MAC verification failures in 60 seconds.
> Station in lockout until 15:05.
>
> Recommended actions:
> - Investigate network infrastructure
> - Check MQTT broker logs
> - Rotate station shared key
>
> [Investigate] [Rotate key] [Escalate]

## Recovery

1. **Immediate -- no configuration applied:** The station correctly rejected all
   tampered messages. The HeartbeatIntervalSeconds remains at its current value ("30").
   No security properties were compromised.

2. **5-minute lockout:** The station rejects all incoming server commands for 5
   minutes. It continues to send heartbeats and status events so the server
   knows it is alive. Active sessions are not interrupted.

3. **Key rotation:** The operator initiates a key rotation via a secure
   out-of-band channel (e.g., the station's local management interface over a
   physically secure connection):

   ```
   Station management console (local USB/serial):
   > security rotate-key --algorithm HMAC-SHA256
   New key generated: [stored in station secure element]
   Key fingerprint: SHA256:xYz123...

   Server admin console:
   > station update-key stn_a1b2c3d4 --fingerprint SHA256:xYz123...
   Key updated. Next message will use new key.
   ```

4. **Network investigation:** The operator inspects:
   - MQTT broker connection logs for unauthorized client IDs
   - Network switches for ARP spoofing indicators
   - TLS certificate validity on the station-to-broker connection
   - Physical network infrastructure for rogue devices

5. **TLS hardening:** If mutual TLS (mTLS) was not enabled, the operator enables
   it so that the MQTT connection itself is encrypted and authenticated at the
   transport layer, making payload modification significantly harder:

   ```
   Station management console:
   > mqtt configure --mutual-tls enable
   > mqtt configure --client-cert /certs/station_a1b2c3d4.pem
   > mqtt configure --ca-cert /certs/ca_chain.pem
   > mqtt reconnect
   ```

6. **After lockout expires:** The server resends the original
   `ChangeConfiguration` request. If the attacker has been removed from the
   network, the message arrives intact, MAC verification passes, and the
   configuration is applied successfully.
