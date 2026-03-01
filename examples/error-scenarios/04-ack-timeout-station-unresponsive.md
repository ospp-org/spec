# Error Scenario 04: ACK Timeout -- Station Unresponsive

## Scenario

Alice starts a service from the app. The server debits her credits, creates a
session, and publishes a `StartService` REQUEST via MQTT. However, the station
never responds -- the MQTT message is stuck in the broker or the station's
network interface has silently failed. After 10 seconds the server's ACK timeout
fires, the session is marked as failed, and Alice receives a full refund. The server
also opens a circuit breaker for this station so that subsequent requests fail
immediately without wasting another 10 seconds.

**Station:** stn_a1b2c3d4 ("SSP-3000" by AcmeCorp)
**Bay:** bay_c1d2e3f4a5b6 (Bay 1)
**Service:** svc_eco (Eco Program, 10 credits/min)
**User:** Alice (sub_alice2026)

## What Goes Wrong

The station's cellular modem has entered a degraded state where it maintains its
MQTT connection (no DISCONNECT packet sent) but stops processing incoming messages.
The broker considers the station "connected" and delivers messages to its
subscription, but the station's application layer never reads them. This is a
"half-open connection" -- invisible to the broker and server until a timeout
reveals it.

## Timeline

| Time | Event |
|------|-------|
| 10:20:00.000 | Alice taps "Start" in the app |
| 10:20:00.500 | Server receives POST /sessions/start |
| 10:20:01.000 | Server debits 50 credits from Alice's wallet |
| 10:20:01.200 | Server creates session sess_e1f2a3b4c5d6 (state: pending_ack) |
| 10:20:01.500 | Server publishes StartService REQUEST via MQTT |
| 10:20:01.500 | App shows "Connecting to station..." spinner |
| 10:20:01.500 | Server starts 10-second ACK timer |
| 10:20:04.000 | ... no response (station modem degraded) ... |
| 10:20:08.000 | ... no response ... |
| 10:20:11.500 | ACK timer expires (10 seconds elapsed) |
| 10:20:11.800 | Server marks session as failed (ACK_TIMEOUT) |
| 10:20:12.000 | Server refunds 50 credits to Alice |
| 10:20:12.500 | Server opens circuit breaker for stn_a1b2c3d4 |
| 10:20:13.000 | App receives failure notification |
| 10:20:13.500 | App shows error message |
| 10:20:15.000 | Another user tries same station -- immediate rejection |

## Complete Message Sequence

### 1. App -> Server: Start Session Request

**HTTP POST** `/api/sessions/start`

```json
{
  "userId": "sub_alice2026",
  "stationId": "stn_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "durationSeconds": 300,
  "paymentMethod": "card"
}
```

### 2. Server: Internal State -- Session Created

```json
{
  "sessionId": "sess_e1f2a3b4c5d6",
  "userId": "sub_alice2026",
  "stationId": "stn_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "state": "pending_ack",
  "creditsCharged": 50,
  "previousWalletBalance": 200,
  "newWalletBalance": 150,
  "createdAt": "2026-02-13T10:20:01.200Z",
  "ackDeadline": "2026-02-13T10:20:11.500Z",
  "ackTimeoutSeconds": 10
}
```

### 3. Server -> Station: StartService REQUEST

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`
**MQTT QoS:** 1 (At least once)

```json
{
  "messageId": "msg_s2c_ll220001",
  "messageType": "Request",
  "action": "StartService",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "timestamp": "2026-02-13T10:20:01.500Z",
  "mac": "f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1",
  "payload": {
    "sessionId": "sess_e1f2a3b4c5d6",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "durationSeconds": 300,
    "sessionSource": "MobileApp"
  }
}
```

**MQTT Broker Status:**
```
Message msg_s2c_ll220001:
  Published:     2026-02-13T10:20:01.500Z
  QoS:           1
  Delivered:     YES (TCP ACK received from station's connection)
  PUBACK:        YES (broker-level, NOT application-level)
  Station MQTT:  Connected (last PINGREQ: 10:19:30, keepalive: 30s)

  NOTE: MQTT QoS 1 PUBACK only confirms broker-to-client TCP delivery,
        NOT that the station application processed the message.
```

### 4. 15 Seconds of Silence...

```
10:20:01.500  Server waiting for RESPONSE on topic:
              ospp/v1/stations/stn_a1b2c3d4/to-server
              relatesTo: msg_s2c_ll220001

10:20:04.500  [3s]   No response. App polling: pending_ack interval (1s)
10:20:07.500  [6s]   No response. App shows "Station preparing..."
10:20:10.500  [9s]   No response.
10:20:11.500  [10s]  ACK TIMEOUT REACHED
```

### 5. Server: ACK Timeout Processing

```json
{
  "event": "ack_timeout",
  "sessionId": "sess_e1f2a3b4c5d6",
  "messageId": "msg_s2c_ll220001",
  "stationId": "stn_a1b2c3d4",
  "timeoutAfterSeconds": 10,
  "requestSentAt": "2026-02-13T10:20:01.500Z",
  "timeoutAt": "2026-02-13T10:20:11.500Z",
  "action": "StartService",
  "resolution": {
    "sessionState": "failed",
    "failureReason": "ack_timeout",
    "error": {
      "errorCode": 6002,
      "errorText": "ACK_TIMEOUT",
      "errorDescription": "Station stn_a1b2c3d4 did not respond to StartService request within the 10-second timeout window. The station may be offline or experiencing connectivity issues.",
      "severity": "Warning",
      "recoverable": true,
      "recommendedAction": "RETRY_LATER",
      "timestamp": "2026-02-13T10:20:16.800Z"
    },
    "refund": {
      "refundId": "ref_mm330001",
      "creditsRefunded": 50,
      "refundPercentage": 100,
      "reason": "ack_timeout_no_service_delivered",
      "walletBalanceBefore": 150,
      "walletBalanceAfter": 200,
      "refundedAt": "2026-02-13T10:20:17.000Z"
    }
  }
}
```

### 6. Server: Circuit Breaker State Change

```json
{
  "event": "circuit_breaker_opened",
  "stationId": "stn_a1b2c3d4",
  "timestamp": "2026-02-13T10:20:17.500Z",
  "previousState": "closed",
  "newState": "open",
  "trigger": {
    "type": "ack_timeout",
    "consecutiveFailures": 3,
    "thresholdToOpen": 3,
    "messageId": "msg_s2c_ll220001"
  },
  "policy": {
    "openDurationSeconds": 30,
    "halfOpenAt": "2026-02-13T10:20:47.500Z",
    "closeAfterSuccessfulProbes": 1
  }
}
```

### 7. Server -> App: Session Failed Notification

**WebSocket / Push Notification:**

```json
{
  "type": "session.failed",
  "timestamp": "2026-02-13T10:20:18.000Z",
  "payload": {
    "sessionId": "sess_e1f2a3b4c5d6",
    "userId": "sub_alice2026",
    "stationId": "stn_a1b2c3d4",
    "stationName": "SSP-3000",
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "serviceId": "svc_eco",
    "failureReason": "ack_timeout",
    "error": {
      "errorCode": 6002,
      "errorText": "ACK_TIMEOUT",
      "errorDescription": "Station did not respond in time.",
      "severity": "Warning",
      "recoverable": true,
      "recommendedAction": "RETRY_LATER"
    },
    "refund": {
      "refundId": "ref_mm330001",
      "creditsRefunded": 50,
      "refundPercentage": 100,
      "newWalletBalance": 200,
      "refundedAt": "2026-02-13T10:20:17.000Z"
    },
    "message": "Station did not respond. Credits refunded. Try again."
  }
}
```

### 8. Another User Attempts Same Station (Circuit Breaker Open)

10 seconds later, user "Dan" tries to start a session on the same station:

**HTTP POST** `/api/sessions/start`

```json
{
  "userId": "sub_dan2026",
  "stationId": "stn_a1b2c3d4",
  "bayId": "bay_a2b3c4d5e6f7",
  "serviceId": "svc_eco",
  "durationSeconds": 300,
  "paymentMethod": "card"
}
```

**Server Response (immediate, no MQTT sent):**

```json
{
  "success": false,
  "error": {
    "errorCode": 6002,
    "errorText": "ACK_TIMEOUT",
    "errorDescription": "Station temporarily unavailable. Please try again later.",
    "severity": "Warning",
    "recoverable": true,
    "recommendedAction": "RETRY_LATER"
  },
  "circuitBreaker": {
    "state": "open",
    "openedAt": "2026-02-13T10:20:17.500Z",
    "retryAfter": "2026-02-13T10:20:47.500Z",
    "retryAfterSeconds": 22
  }
}
```

Note: The server does **not** debit Dan's credits. The circuit breaker rejects
the request before any payment processing occurs.

## What the User Sees

### Alice (Mobile App)

The app's spinner ("Connecting to station...") runs for approximately 17
seconds before transitioning to an error screen:

> **Station did not respond**
> Station did not respond. Credits refunded. Try again.
>
> **50 credits** have been refunded to your wallet.
> Current balance: 200 credits
>
> [Try again]  [Back]

If Alice taps "Try again" while the circuit breaker is still open, she
immediately sees:

> **Station temporarily unavailable**
> Station temporarily unavailable. Please try again after 10:21.
>
> [OK]

### Dan (Different User, Same Station)

Dan's app immediately shows (no 15-second wait):

> **Station temporarily unavailable**
> Station SSP-3000 is not responding.
> Try again in a few minutes.
>
> [OK]

## Recovery

### Recovery Path A — Station Returns Online

If the station's modem recovers (e.g., after a watchdog-triggered modem reset), the
station reconnects to MQTT and follows the standard reconnection flow:

1. Station reconnects to MQTT broker (mTLS, `clean_start=false`).
2. Station sends `BootNotification` REQUEST with `bootReason: "ErrorRecovery"`.
3. Server accepts the BootNotification, closes the circuit breaker, and marks the
   station as online.
4. Station sends `StatusNotification` for each bay, reconciling server-side state.
5. Circuit breaker transitions: `open` → `closed`. New sessions are accepted.

No active sessions need reconciliation — Alice's session was already failed and
refunded when the ACK timeout fired.

### Recovery Path B — Station Remains Offline

If the station does not reconnect within 3 consecutive circuit breaker open windows
(3 × 30s = 90 seconds total), the server marks the station as `Unavailable` and
notifies the operator:

```json
{
  "type": "operator.alert",
  "timestamp": "2026-02-13T10:21:47.500Z",
  "priority": "HIGH",
  "payload": {
    "alertId": "alert_oo550001",
    "stationId": "stn_a1b2c3d4",
    "stationName": "SSP-3000",
    "issue": "Station unresponsive for 90+ seconds",
    "lastSuccessfulContact": "2026-02-13T10:19:30.000Z",
    "recommendedAction": "Check station network connectivity. Remote reboot if available."
  }
}
```

The operator can trigger a remote station reboot via the dashboard (if the station's
management interface is on a separate network) or dispatch a technician to power-cycle
the station.

### Late Response Handling

If the station eventually processes the original `StartService` message and sends a
RESPONSE after the timeout, the server discards it (session already failed and
refunded) and sends a `StopService` REQUEST to stop the bay if it actually started.
