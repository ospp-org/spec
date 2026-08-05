# Flow 11: Offline Transaction Reconciliation

## Scenario

Station `stn_a1b2c3d4` ("SSP-3000") experienced a 4-hour MQTT outage (10:00 to 14:00) due to an ISP fiber cut. During that time, the station continued operating via BLE offline mode. Three customers completed service sessions using offline BLE authorization (OfflinePasses stored on their phones). The station recorded all three transactions locally with monotonic txCounter continuity.

At 14:00, the ISP restores connectivity. The station reconnects to the MQTT broker and begins the reconciliation process: it sends a BootNotification announcing 3 pending offline transactions, followed by 3 TransactionEvent messages. The server validates each transaction, debits the appropriate user wallets, and runs fraud scoring on all three. All fraud scores are below 0.10 (normal), and the transactions are accepted.

## Participants

| Actor | Identity |
|-------|----------|
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| Server | CSMS (`api.example.com`) |
| User 1 | Alice (`sub_alice2026`) -- Eco Program, 5 min, 50 credits |
| User 2 | Bob (`sub_bob2026`) -- Standard Program, 3 min, 24 credits |
| User 3 | Alice (`sub_alice2026`) -- Eco Program, 4 min, 40 credits (second session) |
| Operator | Charlie, station manager |

## Pre-conditions

- Station went offline at 10:00:00 (ISP fiber cut)
- Station firmware supports BLE offline mode
- All 3 users had valid OfflinePasses on their phones
- Station maintained monotonic transaction counter (`txCounter`)
- Previous online transaction had `txCounter: 2`

## Timeline

```
14:00:00.000  ISP restores connectivity
14:00:02.000  Station MQTT reconnect succeeds
14:00:02.200  Station re-subscribes to command topics
14:00:02.500  Station sends BootNotification (pendingOfflineTransactions: 3)
14:00:02.800  Server responds: Accepted (expects offline TX replay)
14:00:03.000  Station sends StatusNotification for all 3 bays
14:00:05.000  Station sends TransactionEvent #1 (otx_a1b2c3d4, Alice, Eco Program 5min)
14:00:05.300  Server validates, debits Alice 50 credits, responds Accepted
14:00:07.000  Station sends TransactionEvent #2 (otx_e5f6a7b8d9c0, Bob, Standard Program 3min)
14:00:07.300  Server validates, debits Bob 24 credits, responds Accepted
14:00:09.000  Station sends TransactionEvent #3 (otx_a9b0c1d2e3f4, Alice, Eco Program 4min)
14:00:09.300  Server validates, debits Alice 40 credits, responds Accepted
14:00:10.000  Server runs fraud scoring on all 3 transactions
14:00:10.500  All scores < 0.10 (normal). Reconciliation complete.
14:00:15.000  Station sends Heartbeat (normal operations resume)
14:00:45.000  Server sends reconciliation summary to operator dashboard
```

## Step-by-Step Detail

---

### Step 1: MQTT Reconnect and BootNotification (14:00:02.500)

After the ISP restores connectivity, the station reconnects and sends a BootNotification that announces the pending offline transactions.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_boot_recon_20260213",
  "messageType": "Request",
  "action": "BootNotification",
  "timestamp": "2026-02-13T14:00:02.500Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "stationModel": "SSP-3000",
    "stationVendor": "AcmeCorp",
    "firmwareVersion": "1.2.5",
    "serialNumber": "ACME-SSP-2024-0042",
    "bays": [
      { "bayNumber": 1, "programNumbers": [1, 2, 3] },
      { "bayNumber": 2, "programNumbers": [1, 2, 3] },
      { "bayNumber": 3, "programNumbers": [1, 2, 3] }
    ],
    "uptimeSeconds": 100802,
    "pendingOfflineTransactions": 3,
    "timezone": "Europe/London",
    "bootReason": "Reconnect",
    "capabilities": {
      "bleSupported": true,
      "offlineModeSupported": true,
      "meterValuesSupported": true
    },
    "networkInfo": {
      "connectionType": "Ethernet",
      "signalStrength": null
    }
  }
}
```

---

### Step 2: Server Responds Accepted (14:00:02.800)

The server acknowledges the reconnection. Since the station reported `pendingOfflineTransactions: 3` in the request, the server expects the station to send TransactionEvent messages next.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_boot_recon_20260213",
  "messageType": "Response",
  "action": "BootNotification",
  "timestamp": "2026-02-13T14:00:02.800Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted",
    "serverTime": "2026-02-13T14:00:02.800Z",
    "heartbeatIntervalSec": 30
  }
}
```

---

### Step 3: Station Sends Bay StatusNotifications (14:00:03.000)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_recon_bay1",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T14:00:03.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Available",
    "previousStatus": "Available",
    "programs": [
      {
        "programNumber": 1,
        "available": true
      },
      {
        "programNumber": 2,
        "available": true
      },
      {
        "programNumber": 3,
        "available": true
      }
    ]
  }
}
```

```json
{
  "messageId": "msg_status_recon_bay2",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T14:00:03.100Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Available",
    "previousStatus": "Available",
    "programs": [
      {
        "programNumber": 1,
        "available": true
      },
      {
        "programNumber": 2,
        "available": true
      },
      {
        "programNumber": 3,
        "available": true
      }
    ]
  }
}
```

```json
{
  "messageId": "msg_status_recon_bay3",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T14:00:03.200Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_d5e6f7a8b9c0",
    "bayNumber": 3,
    "status": "Available",
    "previousStatus": "Available",
    "programs": [
      {
        "programNumber": 1,
        "available": true
      },
      {
        "programNumber": 2,
        "available": true
      },
      {
        "programNumber": 3,
        "available": true
      }
    ]
  }
}
```

---

### Step 4: TransactionEvent #1 -- Alice's Eco Program (14:00:05.000)

The first offline transaction. Alice used bay 1 around 10:30, using a BLE OfflinePass. The station authorized locally and tracked the session.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_tx_otx_a1b2c3d4",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:05.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_a1b2c3d4",
    "offlinePassId": "opass_a1c3e500b2d4",
    "userId": "sub_alice2026",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T10:30:00.000Z",
    "endedAt": "2026-02-13T10:35:00.000Z",
    "durationSeconds": 300,
    "creditsCharged": 50,
    "receipt": {
      "data": "eyJ0eElkIjoib3R4X2ExYjJjM2Q0IiwidXNlcklkIjoic3ViX2FsaWNlMjAyNiIsImNyZWRpdHMiOjUwLCJ0eENvdW50ZXIiOjN9",
      "signature": "MEUCIQDtjLkM5bXhZA1rQ7vYzN0cBpL2hUwF9jD6tG3nKm4xRgIgWpRf8sT2aHb3cKdV5eYnM6jLqNwO7xPzU1iS0kA9vE=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 3,
    "meterValues": {
      "liquidMl": 75000,
      "consumableMl": 2100,
      "energyWh": 1250
    }
  }
}
```

**Server Response (14:00:05.300):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_tx_otx_a1b2c3d4",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:05.300Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

**Server Internal Processing:**

- offlineTxId: `otx_a1b2c3d4`, txCounter: 3
- Server session: `sess_01a2b3c4d5e6`
- txCounter recorded: 3 (forensic only — settlement does not depend on it)
- OfflinePass verified: yes (opass_alice_001, not expired)
- Wallet debit: sub_alice2026, 50 credits debited (120 -> 70)
- Fraud score: 0.03 (normal)

---

### Step 5: TransactionEvent #2 -- Bob's Standard Program (14:00:07.000)

The second offline transaction. Bob used bay 2 around 12:15, using the Standard Program service.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_tx_otx_e5f6a7b8d9c0",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:07.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_e5f6a7b8d9c0",
    "offlinePassId": "opass_b0b30030c1d2",
    "userId": "sub_bob2026",
    "bayId": "bay_a2b3c4d5e6f7",
    "serviceId": "svc_standard",
    "startedAt": "2026-02-13T12:15:00.000Z",
    "endedAt": "2026-02-13T12:18:00.000Z",
    "durationSeconds": 180,
    "creditsCharged": 24,
    "receipt": {
      "data": "eyJ0eElkIjoib3R4X2U1ZjZhN2I4ZDljMCIsInVzZXJJZCI6InN1Yl9ib2IyMDI2IiwiY3JlZGl0cyI6MjQsInR4Q291bnRlciI6NH0=",
      "signature": "MEQCIB3kP7qR5sN2tY8wJ6xK4mD9fL0hA2vE5gU3iC1oB7aTAiAZxW6yV4uS8rQ0pN3mK5jH2gF9dC7bA1eD4fG8hI0kL=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 4,
    "meterValues": {
      "liquidMl": 42000,
      "energyWh": 950
    }
  }
}
```

**Server Response (14:00:07.300):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_tx_otx_e5f6a7b8d9c0",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:07.300Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

**Server Internal Processing:**

- offlineTxId: `otx_e5f6a7b8d9c0`, txCounter: 4
- Server session: `sess_02a2b3c4d5e6`
- txCounter recorded: 4 (forensic only — settlement does not depend on it)
- OfflinePass verified: yes (opass_bob_003, not expired)
- Wallet debit: sub_bob2026, 24 credits debited (85 -> 61)
- Fraud score: 0.05 (normal)

---

### Step 6: TransactionEvent #3 -- Alice's Second Eco Program (14:00:09.000)

Alice returned for a second session at bay 3 around 13:10. Same OfflinePass, different bay.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_tx_otx_a9b0c1d2e3f4",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:09.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_a9b0c1d2e3f4",
    "offlinePassId": "opass_a1c3e500b2d4",
    "userId": "sub_alice2026",
    "bayId": "bay_d5e6f7a8b9c0",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T13:10:00.000Z",
    "endedAt": "2026-02-13T13:14:00.000Z",
    "durationSeconds": 240,
    "creditsCharged": 40,
    "receipt": {
      "data": "eyJ0eElkIjoib3R4X2E5YjBjMWQyZTNmNCIsInVzZXJJZCI6InN1Yl9hbGljZTIwMjYiLCJjcmVkaXRzIjo0MCwidHhDb3VudGVyIjo1fQ==",
      "signature": "MEQCIHrT5mN8kJ2wL4xP6qS9vB0dF3gA1eY7cU5iK0nM2oR4AiB1aW6yX3uQ8sO0pJ4mG5hD9fC7bZ2eA4dF8gH0jI1kL=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 5,
    "meterValues": {
      "liquidMl": 60000,
      "consumableMl": 1700,
      "energyWh": 1050
    }
  }
}
```

**Server Response (14:00:09.300):**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_tx_otx_a9b0c1d2e3f4",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:09.300Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

**Server Internal Processing:**

- offlineTxId: `otx_a9b0c1d2e3f4`, txCounter: 5
- Server session: `sess_03a2b3c4d5e6`
- txCounter recorded: 5 (forensic only — settlement does not depend on it)
- OfflinePass verified: yes (opass_alice_001, 2nd use, within limits)
- Wallet debit: sub_alice2026, 40 credits debited (70 -> 30)
- Fraud score: 0.08 (normal, slightly elevated due to 2nd use of same OfflinePass)

---

### Step 7: Fraud Scoring Summary (14:00:10.000)

The server runs its fraud scoring engine on all 3 reconciled transactions:

```json
{
  "reconciliationId": "recon_20260213_140000_stn_a1b2c3d4",
  "stationId": "stn_a1b2c3d4",
  "offlineDurationSeconds": 14400,
  "transactionsReconciled": 3,
  "totalCreditsDebited": 114,
  "usersAffected": 2,
  "txCounterContinuity": "3 -> 4 -> 5 (no gaps)",
  "fraudScoring": {
    "results": [
      {
        "offlineTxId": "otx_a1b2c3d4",
        "userId": "sub_alice2026",
        "score": 0.03,
        "status": "normal",
        "factors": {
          "offlinePassAge": "2h old (fresh)",
          "deviceAttestationValid": true,
          "meterValuesPlausible": true,
          "durationReasonable": true,
          "duplicateCheck": "pass"
        }
      },
      {
        "offlineTxId": "otx_e5f6a7b8d9c0",
        "userId": "sub_bob2026",
        "score": 0.05,
        "status": "normal",
        "factors": {
          "offlinePassAge": "3h15m old (acceptable)",
          "deviceAttestationValid": true,
          "meterValuesPlausible": true,
          "durationReasonable": true,
          "duplicateCheck": "pass"
        }
      },
      {
        "offlineTxId": "otx_a9b0c1d2e3f4",
        "userId": "sub_alice2026",
        "score": 0.08,
        "status": "normal",
        "factors": {
          "offlinePassAge": "4h40m old (acceptable)",
          "deviceAttestationValid": true,
          "meterValuesPlausible": true,
          "durationReasonable": true,
          "duplicateCheck": "pass",
          "note": "2nd use of opass_alice_001, within allowed multi-use limit"
        }
      }
    ],
    "overallAssessment": "ALL_NORMAL",
    "maxScore": 0.08,
    "thresholds": {
      "normal": "0.00-0.29",
      "review": "0.30-0.59",
      "alert": "0.60-0.79",
      "block": "0.80-1.00"
    },
    "action": "none_required"
  }
}
```

---

### Step 8: What the Operator Dashboard Shows (14:00:45.000)

Charlie sees a reconciliation summary on his dashboard:

```
+----------------------------------------------------------------------+
|  Offline reconciliation - SSP-3000                             |
|  Reconnected: 13 Feb 2026, 14:00                                      |
|  Offline duration: 4 hours (10:00 - 14:00)                             |
|                                                                        |
|  Transactions reconciled: 3                                           |
|  Total credits debited: 114                                           |
|  Users affected: 2                                                    |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  | #  | ID             | User    | Service   | Duration | Credits   | |
|  |----|----------------|---------|------------|--------|-----------|  |
|  | 1  | otx_a1b2c3d4   | Alice  | Eco Program     | 5m     | 50       |  |
|  | 2  | otx_e5f6a7b8d9c0   | Bob| Standard Program | 3m     | 24       |  |
|  | 3  | otx_a9b0c1d2e3f4   | Alice  | Eco Program     | 4m     | 40       |  |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  txCounter: CONTINUOUS (2 -> 5, no gaps)                             |
|  Fraud scoring: NORMAL (max 0.08, threshold 0.50)                    |
|                                                                        |
|  [Full details]  [Export CSV]                                     |
+----------------------------------------------------------------------+
```

---

### What Alice Sees in Her App

When Alice opens the app after the reconciliation, she sees her updated wallet balance and transaction history:

```
+----------------------------------+
|         Wallet                  |
|                                  |
|        30 credits                |
|                                  |
|   Transaction history:            |
|   -40  Eco Program  13 Feb 13:10|  (offline)
|   -24  Standard Program    13 Feb 12:15|  (offline, Bob's - not visible to Alice)
|   -50  Eco Program  13 Feb 10:30|  (offline)
|   +100 Top-up card   13 Feb 09:45|
+----------------------------------+
```

Alice also receives a push notification for each offline transaction:

> **OSPP**: Offline session reconciled. Eco Program, 5 min, 50 credits. Balance: 70 credits.

> **OSPP**: Offline session reconciled. Eco Program, 4 min, 40 credits. Balance: 30 credits.

## txCounter Continuity

The monotonic txCounter gives the operator a reconstructable view of the station's offline log. In this example it is contiguous:

```
Transaction 0 (last online):
  txCounter: 2
         |
         v
Transaction 1 (offline):
  txCounter: 3 (= previous + 1, no gap)
         |
         v
Transaction 2 (offline):
  txCounter: 4 (= previous + 1, no gap)
         |
         v
Transaction 3 (offline):
  txCounter: 5 (= previous + 1, no gap)
```

Each transaction's `txCounter` increments by exactly 1, and the counter is inside the ECDSA-signed receipt, so a station cannot restate a counter it already emitted. A discontinuity (e.g. 3 -> 5) is surfaced to the operator as a **station** alert; the transactions on either side of it settle normally.

What this does **not** provide is a completeness guarantee. An operator suppressing a transaction before it is ever counted produces a contiguous sequence and no alert, and the discontinuities that occur in practice are reboots, NVS corruption and board swaps. Tamper resistance for the *financial* record comes from the signed receipt itself, from `(offlinePassId, passCounter)` uniqueness on an app-generated counter, and from the app-side upload path — see [`06-security.md` §6.3.1](../../spec/06-security.md).

## Message Sequence Diagram

```
  Station (stn_a1b2c3d4)           Server
     |                                |
     |  BootNotification              |
     |  (pending: 3 offline tx)       |
     |------------------------------->|
     |  Accepted                       |
     |<-------------------------------|
     |                                |
     |  StatusNotification (3 bays)   |
     |------------------------------->|
     |                                |
     |  TransactionEvent #1           |
     |  (otx_a1b2c3d4, Alice, Eco Program)    |
     |------------------------------->|
     |                                | record txCounter 
     |                                | verify arming pkg
     |                                | debit Alice 50 credits
     |  Accepted (fraud: 0.03)        |
     |<-------------------------------|
     |                                |
     |  TransactionEvent #2           |
     |  (otx_e5f6a7b8d9c0, Bob, Standard Program) |
     |------------------------------->|
     |                                | record txCounter 
     |                                | verify arming pkg
     |                                | debit Bob 24 credits
     |  Accepted (fraud: 0.05)        |
     |<-------------------------------|
     |                                |
     |  TransactionEvent #3           |
     |  (otx_a9b0c1d2e3f4, Alice, Eco Program)    |
     |------------------------------->|
     |                                | record txCounter 
     |                                | verify arming pkg
     |                                | debit Alice 40 credits
     |  Accepted (fraud: 0.08)        |
     |<-------------------------------|
     |                                |
     |                                | fraud scoring complete
     |                                | all < 0.10 (NORMAL)
     |                                | total: 114 credits, 2 users
     |                                |
     |  Heartbeat (normal ops)        |
     |------------------------------->|
     |                                |
```

## Key Design Decisions

1. **Monotonic txCounter as forensic evidence.** The `txCounter` increments by exactly 1 per transaction and is signed into the receipt, so a station cannot restate a counter it already emitted. A discontinuity (e.g. 3 -> 5) is surfaced to the operator as a **station** alert; it does not withhold settlement, and it is not a fraud signal against the user. Note the limit: an operator who suppresses a transaction before it is ever counted produces no discontinuity at all. Replay protection comes from `(offlinePassId, passCounter)` uniqueness on an **app**-generated counter, not from this one — see [`06-security.md` §6.3.1](../../spec/06-security.md).

3. **Fraud scoring per transaction.** Each offline transaction is individually scored. Factors include OfflinePass age, device attestation validity, meter value plausibility, and duplicate detection. Alice's third transaction scores slightly higher (0.08 vs 0.03) because it reuses the same OfflinePass, which is a mild anomaly signal but within acceptable bounds.

4. **Sequential reconciliation.** Transactions are replayed one at a time, with the server responding to each before the next is sent. This bounds the station's in-flight state; it is not an ordering guarantee, and the server never stops reconciliation on counter grounds — each transaction is settled or rejected on its own merits.

5. **Wallet debits are deferred.** Credits are not debited at the time of the offline session (the station has no authority to debit). They are only debited during reconciliation. Users see a reduced "estimated balance" in their app during offline mode, but the actual debit happens here.
