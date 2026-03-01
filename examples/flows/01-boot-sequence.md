# Flow 01: Station Boot & Registration

## Scenario

It is 10:00 UTC on a cold February morning in Example City. A technician powers on the "SSP-3000" station at "Station Alpha -- Example City" after a routine overnight maintenance. The station's ESP32 controller initializes its hardware, loads mTLS certificates from NVS, establishes a secure MQTT connection to the broker, registers itself via BootNotification, reports the status of all three bays, and enters normal heartbeat operation. The operator, Charlie, watches the station come online on his dashboard within seconds.

## Participants

| Actor | Identity |
|-------|----------|
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| Location | Station Alpha -- Example City |
| Bay 1 | `bay_c1d2e3f4a5b6` |
| Bay 2 | `bay_a2b3c4d5e6f7` |
| Bay 3 | `bay_d5e6f7a8b9c0` |
| MQTT Broker | `broker.example.com:8883` (MQTT 5.0 cluster, mTLS) |
| Server | CSMS (`api.example.com`) |
| Operator | Charlie (dashboard user) |

## Pre-conditions

- Station has been provisioned (Flow 02): TLS client certificate, ECDSA receipt-signing key pair, station ID, bay IDs, and MQTT config are stored in NVS
- Firmware version: `2.4.1`
- MQTT broker is reachable at `broker.example.com:8883`
- All three bays are physically operational (no faults)
- Station has zero pending offline transactions (clean state after maintenance)
- BLE hardware is functional

## Timeline

```
10:00:00.000  Technician flips the main breaker — station powers on
10:00:01.200  Hardware init complete: relays, pumps, meters self-tested OK
10:00:01.500  BLE radio initialized, starts advertising as OSPP-b2c3d4
10:00:02.000  mTLS certificates loaded from NVS
10:00:02.300  MQTT CONNECT sent to broker.example.com:8883 (TLS 1.3, client cert)
10:00:02.650  CONNACK received — connection established
10:00:02.700  SUBSCRIBE to ospp/v1/stations/stn_a1b2c3d4/to-station (QoS 1)
10:00:02.750  SUBACK received
10:00:02.800  BootNotification REQUEST published
10:00:03.100  BootNotification RESPONSE received — Accepted
10:00:03.200  Clock synchronized, session key stored, config applied
10:00:03.300  StatusNotification sent for Bay 1 (Available)
10:00:03.400  StatusNotification sent for Bay 2 (Available)
10:00:03.500  StatusNotification sent for Bay 3 (Available)
10:00:03.600  Heartbeat timer started (interval: 30s)
10:00:03.600  Station enters normal operation
10:00:33.600  First Heartbeat REQUEST sent
10:00:33.800  First Heartbeat RESPONSE received
```

## Step-by-Step Detail

---

### Step 1: Power On & Hardware Init (10:00:00.000 - 10:00:01.200)

The technician flips the main breaker. The station's ESP32 controller boots, runs POST (Power-On Self-Test), and initializes:

1. GPIO pins for relay control (3 bays x 4 relays each)
2. Flow meters and energy meters on each bay
3. Pressure sensors for water and chemical lines
4. LCD status display (shows "Initializare...")

All hardware checks pass. The station logs internally:

```
[10:00:01.200] HW_INIT: All 3 bays passed self-test. 12 relays OK, 6 meters OK.
```

---

### Step 2: BLE Initialization (10:00:01.500)

The BLE radio starts **before** MQTT, so the station is discoverable even if the network is down. The station advertises as `OSPP-b2c3d4` (last 6 hex chars of station ID).

BLE services registered:
- FFF1 (StationInfo) — readable
- FFF2 (AvailableServices) — readable
- FFF3 (AppWrite) — writable
- FFF4 (StationNotify) — notify
- FFF5 (ServiceStatus) — notify
- FFF6 (Receipt) — readable

---

### Step 3: MQTT CONNECT with mTLS (10:00:02.300)

The station loads its TLS client certificate and private key from NVS, then initiates a connection to the MQTT broker.

**MQTT CONNECT parameters:**

| Parameter | Value |
|-----------|-------|
| Broker | `broker.example.com:8883` |
| TLS | TLS 1.3, client certificate authentication |
| Client ID | `stn_a1b2c3d4` |
| Clean Start | `false` (resume any queued QoS 1 messages) |
| Keep Alive | 30 seconds |
| Protocol | MQTT 5.0 |
| Username | (not used — mTLS provides identity) |
| Password | (not used) |

**Last Will and Testament (LWT) configuration:**

| LWT Field | Value |
|-----------|-------|
| Topic | `ospp/v1/stations/stn_a1b2c3d4/to-server` |
| QoS | 1 |
| Retain | false |

LWT payload pre-configured at connect time:

```json
{
  "messageId": "lwt_stn_a1b2c3d4",
  "messageType": "Event",
  "action": "ConnectionLost",
  "timestamp": "2026-02-13T10:00:02.300Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "reason": "UnexpectedDisconnect"
  }
}
```

The broker authenticates the client certificate (CN = `stn_a1b2c3d4`), verifies it against the Station CA, and returns CONNACK with return code 0 (Connection Accepted).

---

### Step 4: Topic Subscription (10:00:02.700)

The station subscribes to its inbound command topic to receive server-initiated messages (StartService, StopService, Reset, etc.).

**SUBSCRIBE:**

| Topic | QoS |
|-------|-----|
| `ospp/v1/stations/stn_a1b2c3d4/to-station` | 1 |

The broker confirms with SUBACK. The station is now ready to receive commands.

---

### Step 5: BootNotification REQUEST (10:00:02.800)

The station publishes its registration message to the server.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_boot_1a2b3c4d",
  "messageType": "Request",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:00:02.800Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "stationModel": "SSP-3000",
    "stationVendor": "AcmeCorp",
    "serialNumber": "ACME-SSP-2025-0042",
    "firmwareVersion": "2.4.1",
    "bayCount": 3,
    "uptimeSeconds": 0,
    "pendingOfflineTransactions": 0,
    "timezone": "Europe/London",
    "bootReason": "PowerOn",
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

The station now waits up to 30 seconds for a response. During this wait, it MUST NOT send any other messages.

---

### Step 6: BootNotification RESPONSE - Accepted (10:00:03.100)

The server validates the station: certificate matches the registered station ID, firmware version is supported, protocol version is compatible. It returns Accepted.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_boot_1a2b3c4d",
  "messageType": "Response",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:00:03.100Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted",
    "serverTime": "2026-02-13T10:00:03.100Z",
    "heartbeatIntervalSec": 30,
    "sessionKey": "hmac_k9x7v2m4p1w8q3n6a5y0j8r2t4e1u7i",
    "configuration": {
      "MeterValuesInterval": "15",
      "MaxOfflineTransactions": "50",
      "OfflineModeEnabled": "true"
    }
  }
}
```

The station processes the response:

1. **Clock sync:** Sets internal RTC to `2026-02-13T10:00:03.100Z`
2. **Session key:** Stores the HMAC session key for message signing
3. **Config:** Applies `MeterValuesInterval=15`, `MaxOfflineTransactions=50`, `OfflineModeEnabled=true`
4. **Heartbeat:** Configures heartbeat timer to fire every 30 seconds

---

### Step 7: StatusNotification - Bay 1 Available (10:00:03.300)

The station reports each bay's current status. Bay 1 is clean and operational after maintenance.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_b1_5e6f7a8b",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:00:03.300Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_c1d2e3f4a5b6",
    "bayNumber": 1,
    "status": "Available",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

---

### Step 8: StatusNotification - Bay 2 Available (10:00:03.400)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_b2_9c0d1e2f",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:00:03.400Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Available",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

---

### Step 9: StatusNotification - Bay 3 Available (10:00:03.500)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_b3_3a4b5c6d",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:00:03.500Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_d5e6f7a8b9c0",
    "bayNumber": 3,
    "status": "Available",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true },
      { "serviceId": "svc_deluxe", "available": true }
    ]
  }
}
```

---

### Step 10: Heartbeat Timer Starts (10:00:03.600)

The station enters normal operation. The LCD displays "Online - 3 bays available". The heartbeat timer is armed at 30-second intervals. The station is now ready to accept StartService, StopService, ChangeConfiguration, and other commands on its `to-station` topic.

---

### Step 11: First Heartbeat (10:00:33.600)

Thirty seconds after boot completes, the station sends its first heartbeat.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_hb_7e8f9a0b",
  "messageType": "Request",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:00:33.600Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {}
}
```

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_hb_7e8f9a0b",
  "messageType": "Response",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T10:00:33.800Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "serverTime": "2026-02-13T10:00:33.800Z"
  }
}
```

The station compares the server time against its RTC. The drift is 0ms — no adjustment needed.

---

### Step 12: What the Operator Sees

On the Operator Dashboard, Charlie watches the station come online:

1. At 10:00:03, the station card for "SSP-3000" transitions from grey ("Offline") to green ("Online")
2. The three bay indicators light up green one by one: Bay 1, Bay 2, Bay 3 — all "Available"
3. The station info panel updates:

```
Station: SSP-3000 (stn_a1b2c3d4)
Location: Station Alpha -- Example City
Status:  Online                    Firmware: 2.4.1
Uptime:  0m                        Protocol: 1.0.0
Boot:    2026-02-13 10:00:03 UTC   Heartbeat: 30s

Bay 1 (bay_c1d2e3f4a5b6)  [Available]  Services: Eco Program, Standard Program, Deluxe Program
Bay 2 (bay_a2b3c4d5e6f7)  [Available]  Services: Eco Program, Standard Program, Deluxe Program
Bay 3 (bay_d5e6f7a8b9c0)  [Available]  Services: Eco Program, Standard Program, Deluxe Program

Pending offline transactions: 0
Last connection: 2026-02-13 10:00:03 UTC
```

4. Charlie sees a toast notification: "SSP-3000 connected (3 bays available)"

## Message Sequence Diagram

```
  Station (stn_a1b2c3d4)          Broker (broker.example.com)           Server (CSMS)
     |                                  |                                  |
     | MQTT CONNECT (mTLS, LWT)         |                                  |
     |--------------------------------->|                                  |
     |         CONNACK (Success)        |                                  |
     |<---------------------------------|                                  |
     |                                  |                                  |
     | SUBSCRIBE to-station (QoS 1)     |                                  |
     |--------------------------------->|                                  |
     |         SUBACK                   |                                  |
     |<---------------------------------|                                  |
     |                                  |                                  |
     | BootNotification REQUEST         |                                  |
     |--------------------------------->|  (broker routes to CSMS)         |
     |                                  |--------------------------------->|
     |                                  |                                  | validate station
     |                                  |                                  | mark online
     |                                  |  BootNotification RESPONSE       |
     |                                  |<---------------------------------|
     |  BootNotification RESPONSE       |                                  |
     |<---------------------------------|                                  |
     |                                  |                                  |
     | sync clock, store session key    |                                  |
     |                                  |                                  |
     | StatusNotification (Bay 1)       |                                  |
     |--------------------------------->|--------------------------------->|
     | StatusNotification (Bay 2)       |                                  |
     |--------------------------------->|--------------------------------->|
     | StatusNotification (Bay 3)       |                                  |
     |--------------------------------->|--------------------------------->|
     |                                  |                                  | update bay map
     | start heartbeat timer            |                                  |
     |                                  |                                  |
     |         ... 30 seconds ...       |                                  |
     |                                  |                                  |
     | Heartbeat REQUEST                |                                  |
     |--------------------------------->|--------------------------------->|
     |                                  |  Heartbeat RESPONSE              |
     |<---------------------------------|<---------------------------------|
     | check clock drift                |                                  |
     |                                  |                                  |
```

## Key Design Decisions

1. **BLE starts before MQTT.** The BLE radio initializes at step 2, before the MQTT connection is established. This means the station is discoverable by mobile apps even if the network is unreachable. Users can still start offline sessions (Flow 05a) while the station is still trying to connect to the cloud.

2. **LWT is configured at CONNECT time.** The Last Will and Testament message is set during the MQTT CONNECT handshake, not after. If the station crashes or loses network between CONNECT and BootNotification, the broker will still publish the ConnectionLost message to the server, ensuring the server knows the station went offline.

3. **Clean Start = false.** By using persistent sessions, any QoS 1 messages queued by the broker during a brief disconnection are delivered when the station reconnects. This prevents lost StartService or StopService commands during network flaps.

4. **BootNotification gates all other messages.** The station MUST NOT send StatusNotification, Heartbeat, or any other message until BootNotification is Accepted. This ensures the server has validated the station's identity and established the HMAC session key before processing any operational data.

5. **One StatusNotification per bay.** After boot acceptance, the station sends a separate StatusNotification for each bay rather than a single bulk message. This keeps the message schema uniform with runtime status changes (where a single bay transitions) and allows the server to process each bay independently.

6. **Session key per boot.** The HMAC session key (`sessionKey`) is issued fresh on each boot. This limits the exposure window if a key is compromised, and allows the server to revoke a station by simply rejecting its next BootNotification.

7. **Heartbeat doubles as clock sync.** Every Heartbeat response carries `serverTime`. The station compares it against its RTC and adjusts if the drift exceeds a threshold (default 2 seconds). This keeps meter timestamps accurate without requiring NTP on the station.
