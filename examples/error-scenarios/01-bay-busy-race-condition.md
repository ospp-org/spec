# Error Scenario 01: Bay Busy Race Condition

## Scenario

Two users attempt to start a service on the same bay within the same second. Alice uses
the the mobile app while Bob pays via QR code on the station's web terminal.
The server processes Alice's request a fraction of a second earlier, so by the time
Bob's request reaches the station the bay is already occupied.

**Station:** stn_a1b2c3d4 ("SSP-3000" by AcmeCorp)
**Bay:** bay_c1d2e3f4a5b6 (Bay 1)
**Service:** svc_eco (Eco Program, 10 credits/min)
**User A:** Alice (sub_alice2026) -- mobile app
**User B:** Bob (sub_bob2026) -- web QR payment

## What Goes Wrong

Both requests arrive at the server within ~200ms of each other. The server's
session-creation lock serializes them. Alice's request acquires the lock first,
creates a session, and sends `StartService` to the station. The station accepts.
When Bob's `StartService` arrives moments later, the station's bay controller
reports the bay is already running a cycle. The station responds with error code
**3001 BAY_BUSY**.

## Timeline

| Time | Event |
|------|-------|
| 10:15:00.000 | Alice taps "Start" in mobile app |
| 10:15:00.200 | Bob taps "Start" on web terminal |
| 10:15:00.800 | Server processes Alice's request, debits 50 credits, creates session |
| 10:15:01.000 | Server publishes StartService REQUEST for Alice |
| 10:15:01.100 | Server processes Bob's request, debits 50 credits, creates session |
| 10:15:01.300 | Server publishes StartService REQUEST for Bob |
| 10:15:02.500 | Station accepts Alice's request -- bay starts |
| 10:15:03.000 | Station rejects Bob's request -- BAY_BUSY |
| 10:15:03.500 | Server receives rejection, refunds Bob 50 credits |
| 10:15:04.000 | Bob's browser shows error message |
| 10:15:05.000 | Alice's service is running normally |

## Complete Message Sequence

### 1. Server -> Station: StartService REQUEST (Alice)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_s2c_aa110001",
  "messageType": "Request",
  "action": "StartService",
  "timestamp": "2026-02-13T10:15:01.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_a4b5c6d7e8f9",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "durationSeconds": 300,
    "sessionSource": "MobileApp"
  },
  "mac": "a3f7c9e1b2d4f6a8c0e2d4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4"
}
```

### 2. Server -> Station: StartService REQUEST (Bob)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_s2c_aa110002",
  "messageType": "Request",
  "action": "StartService",
  "timestamp": "2026-02-13T10:15:01.300Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_c0d1e2f3a4b5",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "durationSeconds": 300,
    "sessionSource": "WebPayment"
  },
  "mac": "b4f8d0e2c3d5f7a9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5"
}
```

### 3. Station -> Server: StartService RESPONSE (Alice -- Accepted)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_s2c_aa110001",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-02-13T10:15:02.500Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  },
  "mac": "c5a9e1f3d4b6c8a0e2f4d6b8a0c2e4f6d8a0b2c4e6f8a0b2d4c6e8f0a2b4c6"
}
```

### 4. Station -> Server: StartService RESPONSE (Bob -- Rejected)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_s2c_aa110002",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-02-13T10:15:03.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3001,
    "errorText": "BAY_BUSY"
  },
  "mac": "d6b0f2a4e5c7d9b1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7"
}
```

### 5. Server -> Bob (Web): Refund & Error Response

**HTTP Response to POST /pay/QR42BAY2/start**

```json
{
  "success": false,
  "error": {
    "errorCode": 3001,
    "errorText": "BAY_BUSY",
    "errorDescription": "Bay is occupied. Select another bay or try again later.",
    "severity": "Warning",
    "recoverable": true,
    "recommendedAction": "SELECT_DIFFERENT_BAY"
  },
  "refund": {
    "refundId": "ref_ee550001",
    "sessionId": "sess_c0d1e2f3a4b5",
    "creditsRefunded": 50,
    "refundPercentage": 100,
    "reason": "bay_busy_race_condition",
    "refundedAt": "2026-02-13T10:15:03.500Z"
  }
}
```

### 6. Station -> Server: StatusNotification EVENT (Bay 1 confirmed Occupied)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_c2s_dd440003",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:15:02.600Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Occupied",
    "previousStatus": "Available",
    "services": [
      { "serviceId": "svc_eco", "available": true }
    ]
  },
  "mac": "e7c1a3b5f6d8e0a2c4f6b8d0e2a4c6f8b0d2e4a6c8f0b2d4e6a8c0f2b4d6e8"
}
```

## What the User Sees

### Alice (Mobile App)

Alice's app transitions to the active session screen. The service is running normally.
No indication that a race condition occurred -- her experience is seamless.

### Bob (Web Browser)

Bob's browser displays a toast notification:

> **Bay is occupied**
> Bay 1 is occupied. Select another bay or try again later.
> Payment of 50 credits has been fully refunded.

The page shows Bay 1 as "Occupied" (red indicator) and Bay 2 and Bay 3 as
"Available" (green indicators), prompting Bob to select an alternative bay.

## Recovery

1. **Automatic refund:** The server issues a 100% refund to Bob within 500ms of
   receiving the station's rejection. No manual intervention required.

2. **Bay availability refresh:** The web terminal polls station status every 5
   seconds. After the rejection, the UI immediately marks Bay 1 as occupied and
   suggests Bay 2 or Bay 3.

3. **Bob retries:** Bob selects Bay 2 (bay_a2b3c4d5e6f7) and successfully starts
   a service within seconds.

4. **Server-side improvement:** The server logs the race condition event for
   analytics. If race conditions exceed a threshold (e.g., >5 per hour per
   station), the server can implement optimistic locking with a bay-level
   reservation window (2-second hold) to reduce the frequency of rejected starts.
