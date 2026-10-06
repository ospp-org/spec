# Flow 11: Offline Transaction Reconciliation

## Scenario

Station `stn_a1b2c3d4` ("SSP-3000") experienced a 4-hour MQTT outage (10:00 to 14:00) due to an ISP fiber cut. During that time, the station continued operating via BLE offline mode. Three customers completed service sessions using offline BLE authorization (OfflinePasses stored on their phones). The station recorded all three transactions locally with monotonic txCounter continuity.

At 14:00, the ISP restores connectivity. The station reconnects to the MQTT broker and begins the reconciliation process: it sends a BootNotification announcing 3 pending offline transactions, followed by 3 TransactionEvent messages. The server processes each transaction in turn — deduplication, receipt signature, the reconcile-time gate, settlement, and then fraud scoring of the settled transaction — and answers each `Accepted`. Every score falls in the Normal band (below 0.30), so no `FraudDetected` record is written.

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
14:00:05.000  Station sends TransactionEvent #1 (otx_a1b2c3d4c6b7798bbf5a1a447c52e848, Alice, Eco Program 5min)
14:00:05.300  Server verifies, gates, settles (debits Alice 50 credits), scores, responds Accepted
14:00:07.000  Station sends TransactionEvent #2 (otx_e5f6a7b8d9c04c0edcfa092be0f1ec2d, Bob, Standard Program 3min)
14:00:07.300  Server verifies, gates, settles (debits Bob 24 credits), scores, responds Accepted
14:00:09.000  Station sends TransactionEvent #3 (otx_a9b0c1d2e3f40a9c488a44d8b1ad77e4, Alice, Eco Program 4min)
14:00:09.300  Server verifies, gates, settles (debits Alice 40 credits), scores, responds Accepted
14:00:10.000  All 3 settled and scored; every score in the Normal band
14:00:10.500  Reconciliation complete (no FraudDetected record)
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

The server acknowledges the reconnection. Since the station reported `pendingOfflineTransactions: 3` in the request, the server expects the station to send TransactionEvent messages next. Before the station corrects its clock from `serverTime`, the server records the station's clock offset — the request's envelope `timestamp` minus the server's own receive time — and judges the times signed during the outage through it ([`reconciliation.md` §6.8](../../spec/profiles/offline/reconciliation.md#68-station-clock-offset)). Here the offset is well under a second.

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
    "heartbeatIntervalSec": 30,
    "sessionKey": "cmVjb25jaWxlLXNlc3Npb24ta2V5LTIwMjYtMDItMTNUMTQ6MDA=",
    "configuration": {
      "OfflinePassPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEgvQlIvxRxGjFmqpueMZYaGB+z/HdgUeQk7sNEWSoWWuQS4tkJH4ZlkMXQfu4k6BG13H7vgYBLutaX0fclQj5vA==",
      "RevocationEpoch": "42",
      "OfflineModeEnabled": "true",
      "OfflineWindowHours": "240",
      "OfflineTransactionLimit": "1000"
    }
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
  "messageId": "msg_tx_otx_a1b2c3d4c6b7798bbf5a1a447c52e848",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:05.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_a1b2c3d4c6b7798bbf5a1a447c52e848",
    "offlinePassId": "opass_a1c3e500b2d4",
    "passCounter": 1,
    "userId": "sub_alice2026",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T10:30:00.000Z",
    "endedAt": "2026-02-13T10:35:00.000Z",
    "durationSeconds": 300,
    "creditsCharged": 50,
    "receipt": {
      "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjMwMCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjo1MCwiZGV2aWNlSWQiOiJkZXZpY2VfYThmM2JjMTJlNDU2Nzg5MCIsImR1cmF0aW9uU2Vjb25kcyI6MzAwLCJlbmRSZWFzb24iOiJUaW1lckV4cGlyZWQiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxMDozNTowMC4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjoyMTAwLCJlbmVyZ3lXaCI6MTI1MCwibGlxdWlkTWwiOjc1MDAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2ExYzNlNTAwYjJkNCIsIm9mZmxpbmVUeElkIjoib3R4X2ExYjJjM2Q0YzZiNzc5OGJiZjVhMWE0NDdjNTJlODQ4IiwicGFzc0NvdW50ZXIiOjEsInNlcnZpY2VJZCI6InN2Y19lY28iLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDEwOjMwOjAwLjAwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjMsInVzZXJJZCI6InN1Yl9hbGljZTIwMjYifQ==",
      "signature": "MEQCIFXbfygCD8LJumhViqXcxioOndkAxPgfggS/Xgbq3adrAiASay2pLRqg5XHxD4ShJHeYEZcO35Fnv8TTgYjJZyKG7w==",
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
  "messageId": "msg_tx_otx_a1b2c3d4c6b7798bbf5a1a447c52e848",
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

In the order of [`reconciliation.md` §2](../../spec/profiles/offline/reconciliation.md#2-sync-procedure):

- Deduplication: `otx_a1b2c3d4c6b7798bbf5a1a447c52e848` is not in the ledger
- Receipt signature: verifies under the receipt-signing key of `stn_a1b2c3d4`, the station the signed receipt names
- txCounter recorded: 3 (forensic only — gates nothing)
- Gate: pass `opass_a1c3e500b2d4` was valid at the signed `startedAt` (10:30), read through the station's clock offset (`clockState` `Synchronized`)
- Settlement: 300 s of Eco Program, `TimerExpired`, recomputed from the signed receipt — 50 credits; sub_alice2026 debited (120 -> 70)
- Fraud score, after settlement: 0.10 — `FirstUseOfStation` (Alice's first transaction at this station); Normal band, no `FraudDetected` record
- Server session: `sess_01a2b3c4d5e6`

---

### Step 5: TransactionEvent #2 -- Bob's Standard Program (14:00:07.000)

The second offline transaction. Bob used bay 2 around 12:15, using the Standard Program service.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_tx_otx_e5f6a7b8d9c04c0edcfa092be0f1ec2d",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:07.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_e5f6a7b8d9c04c0edcfa092be0f1ec2d",
    "offlinePassId": "opass_b0b30030c1d2",
    "passCounter": 1,
    "userId": "sub_bob2026",
    "bayId": "bay_a2b3c4d5e6f7",
    "serviceId": "svc_standard",
    "startedAt": "2026-02-13T12:15:00.000Z",
    "endedAt": "2026-02-13T12:18:00.000Z",
    "durationSeconds": 180,
    "creditsCharged": 24,
    "receipt": {
      "data": "eyJiYXlJZCI6ImJheV9hMmIzYzRkNWU2ZjciLCJib29rZWREdXJhdGlvblNlY29uZHMiOjE4MCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjoyNCwiZGV2aWNlSWQiOiJkZXZfZTVmNmE3YjgiLCJkdXJhdGlvblNlY29uZHMiOjE4MCwiZW5kUmVhc29uIjoiVGltZXJFeHBpcmVkIiwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMTI6MTg6MDAuMDAwWiIsIm1ldGVyVmFsdWVzIjp7ImVuZXJneVdoIjo5NTAsImxpcXVpZE1sIjo0MjAwMH0sIm9mZmxpbmVQYXNzSWQiOiJvcGFzc19iMGIzMDAzMGMxZDIiLCJvZmZsaW5lVHhJZCI6Im90eF9lNWY2YTdiOGQ5YzA0YzBlZGNmYTA5MmJlMGYxZWMyZCIsInBhc3NDb3VudGVyIjoxLCJzZXJ2aWNlSWQiOiJzdmNfc3RhbmRhcmQiLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDEyOjE1OjAwLjAwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjQsInVzZXJJZCI6InN1Yl9ib2IyMDI2In0=",
      "signature": "MEQCIASs7eLpwhxUAaK2ZpWCZ2GwkB+RP7K3asY5Lnpl4eB3AiBo5GsJEcGhKxh1L/3gDG/pPrWUymWHjM6BgWnfSKLOJQ==",
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
  "messageId": "msg_tx_otx_e5f6a7b8d9c04c0edcfa092be0f1ec2d",
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

In the order of [`reconciliation.md` §2](../../spec/profiles/offline/reconciliation.md#2-sync-procedure):

- Deduplication: `otx_e5f6a7b8d9c04c0edcfa092be0f1ec2d` is not in the ledger
- Receipt signature: verifies under the receipt-signing key of `stn_a1b2c3d4`, the station the signed receipt names
- txCounter recorded: 4 (forensic only — gates nothing)
- Gate: pass `opass_b0b30030c1d2` was valid at the signed `startedAt` (12:15), read through the station's clock offset
- Settlement: 180 s of Standard Program, `TimerExpired`, recomputed from the signed receipt — 24 credits; sub_bob2026 debited (85 -> 61)
- Fraud score, after settlement: 0.00 — no factor fires; Normal band
- Server session: `sess_02a2b3c4d5e6`

---

### Step 6: TransactionEvent #3 -- Alice's Second Eco Program (14:00:09.000)

Alice returned for a second session at bay 3 around 13:10. Same OfflinePass, different bay.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_tx_otx_a9b0c1d2e3f40a9c488a44d8b1ad77e4",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T14:00:09.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_a9b0c1d2e3f40a9c488a44d8b1ad77e4",
    "offlinePassId": "opass_a1c3e500b2d4",
    "passCounter": 2,
    "userId": "sub_alice2026",
    "bayId": "bay_d5e6f7a8b9c0",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T13:10:00.000Z",
    "endedAt": "2026-02-13T13:14:00.000Z",
    "durationSeconds": 240,
    "creditsCharged": 40,
    "receipt": {
      "data": "eyJiYXlJZCI6ImJheV9kNWU2ZjdhOGI5YzAiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjI0MCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjo0MCwiZGV2aWNlSWQiOiJkZXZpY2VfYThmM2JjMTJlNDU2Nzg5MCIsImR1cmF0aW9uU2Vjb25kcyI6MjQwLCJlbmRSZWFzb24iOiJUaW1lckV4cGlyZWQiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxMzoxNDowMC4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjoxNzAwLCJlbmVyZ3lXaCI6MTA1MCwibGlxdWlkTWwiOjYwMDAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2ExYzNlNTAwYjJkNCIsIm9mZmxpbmVUeElkIjoib3R4X2E5YjBjMWQyZTNmNDBhOWM0ODhhNDRkOGIxYWQ3N2U0IiwicGFzc0NvdW50ZXIiOjIsInNlcnZpY2VJZCI6InN2Y19lY28iLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDEzOjEwOjAwLjAwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjUsInVzZXJJZCI6InN1Yl9hbGljZTIwMjYifQ==",
      "signature": "MEQCIAWHmti8rrNr/eVPn5DzV31B07hKymRVPW3WtLqSvwNbAiAeYQ3/AeAs4MWXpDqnw++DeN/SlhckjCnJuhE53gRshQ==",
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
  "messageId": "msg_tx_otx_a9b0c1d2e3f40a9c488a44d8b1ad77e4",
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

In the order of [`reconciliation.md` §2](../../spec/profiles/offline/reconciliation.md#2-sync-procedure):

- Deduplication: `otx_a9b0c1d2e3f40a9c488a44d8b1ad77e4` is not in the ledger
- Receipt signature: verifies under the receipt-signing key of `stn_a1b2c3d4`, the station the signed receipt names
- txCounter recorded: 5 (forensic only — gates nothing)
- Gate: pass `opass_a1c3e500b2d4` was valid at the signed `startedAt` (13:10), read through the station's clock offset; its `passCounter` 2 has not been settled before for this pass (check #13)
- Settlement: 240 s of Eco Program, `TimerExpired`, recomputed from the signed receipt — 40 credits; sub_alice2026 debited (70 -> 30)
- Fraud score, after settlement: 0.00 — a second use of the same pass is what a pass is for, and its cumulative uses and credits stay within `maxUses` and `maxTotalCredits`; Alice has now used this station. Normal band
- Server session: `sess_03a2b3c4d5e6`

---

### Step 7: Fraud Scoring Summary (14:00:10.000)

The server scored each transaction after settling it, as it processed it (Steps 4-6). Its summary of the three, with the factor identifiers of [`06-security.md` §7.4](../../spec/06-security.md#74-fraud-detection--offline-transactions):

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
        "offlineTxId": "otx_a1b2c3d4c6b7798bbf5a1a447c52e848",
        "userId": "sub_alice2026",
        "score": 0.10,
        "band": "Normal",
        "factors": ["FirstUseOfStation"]
      },
      {
        "offlineTxId": "otx_e5f6a7b8d9c04c0edcfa092be0f1ec2d",
        "userId": "sub_bob2026",
        "score": 0.00,
        "band": "Normal",
        "factors": []
      },
      {
        "offlineTxId": "otx_a9b0c1d2e3f40a9c488a44d8b1ad77e4",
        "userId": "sub_alice2026",
        "score": 0.00,
        "band": "Normal",
        "factors": []
      }
    ],
    "maxScore": 0.10,
    "bands": {
      "Normal": "0.00-0.29",
      "Review": "0.30-0.59",
      "Alert": "0.60-0.79",
      "Block": "0.80-1.00"
    },
    "fraudDetectedRecords": 0
  }
}
```

Each score is the sum of the factors that fired, capped at 1.00. All three fall in the Normal band, so nothing is recorded and nothing is done. Whatever its band, a scored transaction is answered `Accepted`: scoring runs on a transaction the gate has accepted and the server has settled, and it never changes the settled amount. In the Review, Alert or Block band the server records a server-originated `FraudDetected` SecurityEvent and takes the band's action. A wash in the Block band stays **settled and flagged**: the user is charged what settlement allows, the user is blocked and every pass of the user revoked, and the operator of the station is alerted ([`reconciliation.md` §7](../../spec/profiles/offline/reconciliation.md#7-fraud-detection)).

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
|  +------------------------------------------------------------------+  |
|  | #  | ID              | User  | Service          | Dur. | Credits |  |
|  |----|-----------------|-------|------------------|------|---------|  |
|  | 1  | otx_a1b2...e848 | Alice | Eco Program      | 5m   | 50      |  |
|  | 2  | otx_e5f6...ec2d | Bob   | Standard Program | 3m   | 24      |  |
|  | 3  | otx_a9b0...77e4 | Alice | Eco Program      | 4m   | 40      |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  txCounter: CONTINUOUS (2 -> 5, no gaps)                             |
|  Fraud scoring: NORMAL (max 0.10; Review starts at 0.30)             |
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
     |  (otx_a1b2...e848,             |
     |   Alice, Eco Program)          |
     |------------------------------->|
     |                                | dedup, verify receipt signature
     |                                | record txCounter (forensic)
     |                                | gate: pass valid at startedAt
     |                                | settle: debit Alice 50 credits
     |                                | score: 0.10 (Normal)
     |  Accepted                      |
     |<-------------------------------|
     |                                |
     |  TransactionEvent #2           |
     |  (otx_e5f6...ec2d,             |
     |   Bob, Standard Program)       |
     |------------------------------->|
     |                                | dedup, verify receipt signature
     |                                | record txCounter (forensic)
     |                                | gate: pass valid at startedAt
     |                                | settle: debit Bob 24 credits
     |                                | score: 0.00 (Normal)
     |  Accepted                      |
     |<-------------------------------|
     |                                |
     |  TransactionEvent #3           |
     |  (otx_a9b0...77e4,             |
     |   Alice, Eco Program)          |
     |------------------------------->|
     |                                | dedup, verify receipt signature
     |                                | record txCounter (forensic)
     |                                | gate: pass valid at startedAt
     |                                | settle: debit Alice 40 credits
     |                                | score: 0.00 (Normal)
     |  Accepted                      |
     |<-------------------------------|
     |                                |
     |                                | all 3 settled and scored
     |                                | all Normal (below 0.30)
     |                                | total: 114 credits, 2 users
     |                                |
     |  Heartbeat (normal ops)        |
     |------------------------------->|
     |                                |
```

## Key Design Decisions

1. **Monotonic txCounter as forensic evidence.** The `txCounter` increments by exactly 1 per transaction and is signed into the receipt, so a station cannot restate a counter it already emitted. A discontinuity (e.g. 3 -> 5) is surfaced to the operator as a **station** alert; it does not withhold settlement, and it is not a fraud signal against the user. Note the limit: an operator who suppresses a transaction before it is ever counted produces no discontinuity at all. Replay protection comes from `(offlinePassId, passCounter)` uniqueness on an **app**-generated counter, not from this one — see [`06-security.md` §6.3.1](../../spec/06-security.md).

3. **Fraud scoring per transaction, after settlement.** Each offline transaction is scored once it has passed the gate and been settled, and scoring never changes the settled amount ([`reconciliation.md` §7](../../spec/profiles/offline/reconciliation.md#7-fraud-detection)). The score is the sum of the [`06-security.md` §7.4](../../spec/06-security.md#74-fraud-detection--offline-transactions) factors that fire, capped at 1.00 — here `FirstUseOfStation` (+0.10) on Alice's first transaction at this station, and nothing on the other two. A second use of the same pass is not a signal in itself: a pass permits `maxUses` transactions, and repeated use is scored only by the cumulative cross-station factors, which fire when the fleet-wide total exceeds `maxUses` or `maxTotalCredits`. A receipt signature that does not verify, or a failed gate check, is a rejection and is never scored.

4. **Sequential reconciliation.** Transactions are replayed one at a time, with the server responding to each before the next is sent. This bounds the station's in-flight state; it is not an ordering guarantee, and the server never stops reconciliation on counter grounds — each transaction is settled or rejected on its own merits.

5. **Wallet debits are deferred.** Credits are not debited at the time of the offline session (the station has no authority to debit). They are only debited during reconciliation. Users see a reduced "estimated balance" in their app during offline mode, but the actual debit happens here. The server recomputes each amount from the signed receipt — the station's `creditsCharged` is advisory — and never settles a wash above what its station authorized. A debit may leave a wallet below zero; the transaction whose debit did so stays pending until a credit to the wallet covers it, every credit releasing pending transactions oldest first, and no offline pass is issued while the balance is not positive ([`reconciliation.md` §8.1](../../spec/profiles/offline/reconciliation.md#81-no-prior-debit-full-offline--direct-partial-b)).
