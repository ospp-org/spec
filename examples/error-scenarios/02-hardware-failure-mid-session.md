# Error Scenario 02: Hardware Failure Mid-Session

## Scenario

Alice is 120 seconds into a 300-second service session when the high-pressure pump on
Bay 1 draws excessive current (8.2A against a 6A safety threshold). The station's
hardware protection circuit trips immediately, cutting power to the pump. The
station reports the failure as a critical security event and transitions the bay
to a faulted state. The server detects the interrupted session, calculates a
pro-rated refund, and notifies both Alice and the station operator.

> **Note:** This example uses a self-service station, but the same error flow applies to any self-service station type (laundromat, EV charger, vending, etc.). The `PUMP_SYSTEM` error code is domain-agnostic — it covers any pump type (water, air, vacuum, fuel).

**Station:** stn_a1b2c3d4 ("SSP-3000" by AcmeCorp)
**Bay:** bay_c1d2e3f4a5b6 (Bay 1)
**Service:** svc_eco (Eco Program, 10 credits/min)
**Session:** sess_f7e8d9c0 (started at 10:15:00, 300s duration, 50 credits)
**User:** Alice (sub_alice2026)
**Elapsed:** 120 seconds of 300 seconds (40% delivered)

## What Goes Wrong

The high-pressure pump's bearings have worn beyond tolerance. Under load, the
motor draws 8.2A -- exceeding the 6A overcurrent protection threshold. The
station's hardware monitoring subsystem detects the anomaly within 200ms and
triggers an emergency shutdown of Bay 1's pump circuit. Because only 40% of the
service was delivered (below the 50% threshold), Alice receives a full refund.

## Timeline

| Time | Event |
|------|-------|
| 10:15:00.000 | Session sess_f7e8d9c0 started (svc_eco, 300s, 50 credits) |
| 10:17:00.000 | Pump current spikes to 8.2A (threshold: 6A) |
| 10:17:00.200 | Station hardware protection triggers -- pump power cut |
| 10:17:00.500 | Station sends SecurityEvent (hardware_fault, PUMP_SYSTEM) |
| 10:17:01.000 | Station sends StatusNotification (Occupied -> Faulted) |
| 10:17:01.500 | Station sends TransactionEvent REQUEST (session interrupted) |
| 10:17:02.000 | Server processes session interruption |
| 10:17:02.500 | Server calculates refund: 40% delivered < 50% -> full refund |
| 10:17:03.000 | Server credits 50 credits to Alice's wallet |
| 10:17:03.500 | App shows hardware error notification |
| 10:17:04.000 | Operator dashboard receives critical alert |
| 10:17:05.000 | Bay 1 locked out pending technician inspection |

## Complete Message Sequence

### 1. Station -> Server: SecurityEvent EVENT (Hardware Fault)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_c2s_ff660001",
  "messageType": "Event",
  "action": "SecurityEvent",
  "timestamp": "2026-02-13T10:17:00.500Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "mac": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "payload": {
    "eventId": "sec_ff660001a1b2",
    "type": "HardwareFault",
    "severity": "Critical",
    "timestamp": "2026-02-13T10:17:00.500Z",
    "details": {
      "bayId": "bay_c1d2e3f4a5b6",
      "activeSessionId": "sess_f7e8d9c0",
      "errorCode": 5001,
      "errorText": "PUMP_SYSTEM",
      "errorDescription": "Pump overcurrent detected on bay bay_c1d2e3f4a5b6. Measured 8.2A, threshold 6.0A. Emergency shutdown initiated.",
      "recoverable": false,
      "recommendedAction": "DISPATCH_TECHNICIAN",
      "component": "pump_hp_bay1",
      "measuredValue": 8.2,
      "unit": "amperes",
      "threshold": 6.0,
      "triggerType": "overcurrent",
      "hardwareProtectionActivated": true,
      "powerCutAt": "2026-02-13T10:17:00.200Z"
    }
  }
}
```

### 2. Station -> Server: StatusNotification EVENT (Occupied -> Faulted)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_c2s_ff660002",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:17:01.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "mac": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Faulted",
    "previousStatus": "Occupied",
    "services": [
      { "serviceId": "svc_eco", "available": false }
    ],
    "errorCode": 5001,
    "errorText": "PUMP_SYSTEM"
  }
}
```

### 3. Station -> Server: TransactionEvent REQUEST (Session Interrupted)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_c2s_ff660003",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:17:01.500Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "mac": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Faulted",
    "previousStatus": "Occupied",
    "errorCode": 5001,
    "errorText": "PUMP_SYSTEM",
    "services": [
      { "serviceId": "svc_eco", "available": false },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

StatusNotification is an EVENT (fire-and-forget) — no response is sent by the server.

### 4. Server Internal: Session State Transition & Refund Calculation

```
Session sess_f7e8d9c0 state: active -> failed
Reason: hardware_fault (5001 PUMP_SYSTEM)

Refund calculation:
  - Total charged:     50 credits
  - Planned duration:  300 seconds
  - Actual duration:   120 seconds
  - Delivery ratio:    120 / 300 = 0.40 (40%)
  - Policy:            delivery < 50% -> full refund
  - Refund amount:     50 credits (100%)
```

### 5. Server -> App: Session Failed Notification (via WebSocket / Push)

```json
{
  "type": "session.failed",
  "timestamp": "2026-02-13T10:17:03.000Z",
  "payload": {
    "sessionId": "sess_f7e8d9c0",
    "userId": "sub_alice2026",
    "stationId": "stn_a1b2c3d4",
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "serviceId": "svc_eco",
    "failureReason": "hardware_fault",
    "error": {
      "errorCode": 5001,
      "errorText": "PUMP_SYSTEM"
    },
    "serviceMetrics": {
      "plannedDurationSeconds": 300,
      "actualDurationSeconds": 120,
      "deliveryPercentage": 40.0
    },
    "refund": {
      "refundId": "ref_gg770001",
      "creditsRefunded": 50,
      "refundPercentage": 100,
      "reason": "hardware_fault_under_50_percent",
      "newWalletBalance": 150,
      "refundedAt": "2026-02-13T10:17:03.000Z"
    },
    "message": "Hardware error at station. Service stopped. 50 credits refunded."
  }
}
```

### 6. Server -> Operator Dashboard: Critical Alert

```json
{
  "type": "operator.alert",
  "timestamp": "2026-02-13T10:17:04.000Z",
  "priority": "CRITICAL",
  "payload": {
    "alertId": "alert_hh880001",
    "stationId": "stn_a1b2c3d4",
    "stationName": "SSP-3000",
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "error": {
      "errorCode": 5001,
      "errorText": "PUMP_SYSTEM",
      "errorDescription": "Pump overcurrent detected. Measured 8.2A, threshold 6.0A."
    },
    "affectedSessionId": "sess_f7e8d9c0",
    "affectedUser": "sub_alice2026",
    "refundIssued": true,
    "refundAmount": 50,
    "bayStatus": "Faulted",
    "lockoutActive": true,
    "recommendedAction": "Bay 1 - PUMP_SYSTEM - Dispatch technician",
    "escalationLevel": 1,
    "autoEscalateAfterMinutes": 30
  }
}
```

## What the User Sees

### Alice (Mobile App)

The active session screen abruptly transitions to the session failed screen.
A modal notification appears:

> **Hardware error at station**
> Service stopped due to hardware failure.
> **50 credits** have been refunded to your wallet.
>
> Current balance: 150 credits
>
> [OK]

After dismissing the modal, Alice sees the session summary marked as "Failed" with
the partial service duration (2:00 of 5:00) and the full refund confirmation.

### Operator Dashboard

A red critical alert banner appears at the top of the operator view:

> **CRITICAL ALERT -- SSP-3000**
> Bay 1 -- PUMP_SYSTEM -- Pump overcurrent (8.2A / 6.0A)
> Bay locked out. Dispatch technician.
> Affected session: sess_f7e8d9c0 (sub_alice2026) -- Refund: 50 credits

## Recovery

1. **Immediate:** Bay 1 is locked out automatically. No new sessions can start on
   this bay. Bays 2 and 3 remain operational.

2. **Operator response:** The operator dispatches a technician to inspect the pump.
   The dashboard shows a timer for auto-escalation (30 minutes to Level 2 if
   unacknowledged).

3. **Technician repair:** After replacing the pump bearings and verifying safe
   current draw under load, the technician uses the operator dashboard to clear
   the fault and unlock Bay 1.

4. **Station recovery:** The operator sends a `Reset` REQUEST to Bay 1 via OSPP.
   The station runs a self-test, confirms all readings are within tolerance, and
   transitions Bay 1 from `Faulted` back to `Available`.

5. **User compensation:** Alice already received her full 50-credit refund. No
   further action is needed unless Alice contacts support, in which case a
   goodwill bonus (e.g., 10 credits) may be offered.
