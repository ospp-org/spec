# Flow 12: Firmware Update (OTA)

## Scenario

Operator Charlie decides to update station `stn_a1b2c3d4` ("SSP-3000") from firmware v1.2.5 to v1.3.0 via the Operator Dashboard. He initiates the update at 22:00, a quiet time when no customers are using the station. The server sends an UpdateFirmware command to the station via MQTT. The station downloads the firmware binary (12 MB), verifies the SHA-256 checksum **and** the ECDSA P-256 signature, installs it to partition B, reports `Installed`, reboots, and reports back with the new firmware version. The entire process takes about 3.5 minutes.

## Participants

| Actor | Identity |
|-------|----------|
| Operator | Charlie, station manager (`operator_charlie01`) |
| Dashboard | Operator Dashboard (`dashboard.example.com`) |
| Server | CSMS (`api.example.com`) |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| CDN | Firmware CDN (`firmware.example.com`) |

## Pre-conditions

- Station `stn_a1b2c3d4` is online, firmware v1.2.5
- All 3 bays are `Available` (no active sessions)
- Firmware v1.3.0 has been uploaded to the CDN and validated by OSPP engineering
- Station has dual-partition boot (A/B): currently running from partition A
- Station has sufficient flash storage for the new firmware image

## Timeline

```
22:00:00.000  Charlie clicks "Update firmware" on dashboard
22:00:00.500  Server validates: no active sessions, firmware URL valid
22:00:01.000  Server sends UpdateFirmware REQUEST via MQTT
22:00:01.300  Station responds: Accepted
22:00:02.000  Station sends FirmwareStatusNotification: Downloading (0%)
22:00:15.000  Station sends FirmwareStatusNotification: Downloading (25%)
22:00:30.000  Station sends FirmwareStatusNotification: Downloading (50%)
22:00:45.000  Station sends FirmwareStatusNotification: Downloading (75%)
22:01:00.000  Station sends FirmwareStatusNotification: Downloading (100%)
22:01:05.000  Station sends FirmwareStatusNotification: Downloaded (checksum AND signature OK)
22:01:10.000  Station sends FirmwareStatusNotification: Installing
22:01:30.000  Station sends FirmwareStatusNotification: Installing (100%, reboot required)
22:01:32.000  Station sends FirmwareStatusNotification: Installed (before the reboot)
22:01:35.000  Station: MQTT graceful disconnect
22:01:35.500  Station: reboots, switches boot partition A -> B
22:02:30.000  Station: boots on partition B (firmware v1.3.0)
22:02:32.000  Station: MQTT reconnect
22:02:33.000  Station: BootNotification (firmware 1.3.0, bootReason: FirmwareUpdate)
22:02:33.500  Server: Accepted
22:02:40.000  Station: StatusNotification for all 3 bays (Available)
22:02:45.000  Station: Heartbeat (normal operations resume)
22:03:00.000  Server marks firmware update as completed
22:03:00.500  Dashboard shows "Update successful - v1.3.0"
```

## Step-by-Step Detail

---

### Step 1: Charlie Initiates Firmware Update (22:00:00.000)

**What Charlie sees on the dashboard:**

```
+----------------------------------------------------------------------+
|  SSP-3000 (stn_a1b2c3d4)                                      |
|  Station Alpha — Example City                                       |
|                                                                        |
|  Current firmware: v1.2.5                                             |
|  Available firmware: v1.3.0 (recommended)                             |
|                                                                        |
|  Changelog v1.3.0:                                                     |
|  - BLE offline performance improvements                                |
|  - Fix memory leak on long sessions                                    |
|  - Support for new water pressure sensor                               |
|  - Standby power consumption optimization                              |
|                                                                        |
|  Station status: All bays available                                   |
|  Active sessions: 0                                                    |
|                                                                        |
|  [Update firmware]                                               |
|                                                                        |
|  WARNING: Station will restart during update.                          |
|  Estimate: ~3 minutes. No sessions will be affected.                |
+----------------------------------------------------------------------+
```

Charlie clicks "Update firmware". A confirmation dialog appears:

> **Update firmware to v1.3.0?**
> Station will be unavailable for ~3 minutes during restart.
> [Cancel] [Confirm update]

Charlie clicks "Confirm update".

---

### Step 2: Server Validates and Sends UpdateFirmware REQUEST (22:00:01.000)

The server validates:
1. Station is online and connected
2. No active sessions on any bay
3. Firmware v1.3.0 binary exists on CDN and checksum is valid
4. Station hardware model is compatible with this firmware version

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_fw_update_v130",
  "messageType": "Request",
  "action": "UpdateFirmware",
  "timestamp": "2026-02-13T22:00:01.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "firmwareVersion": "1.3.0",
    "firmwareUrl": "https://firmware.example.com/acmecorp/ssp-3000/v1.3.0/firmware.bin",
    "checksum": "sha256:928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0",
    "signature": "MEQCIE+QRZGQsfk/WFjJLU3KPtMMcjOXlpSU1FdPdoQmWgkRAiBn3N21lQU8lX9gxlb2rcLPF4gC9d8MnKy7er47XHAQtg=="
  }
}
```

> The `checksum` and `signature` above are **reproducible**: they are the SHA-256 and the ECDSA
> P-256 signature of `conformance/test-firmware/test-firmware.bin` under
> `conformance/test-keys/firmware-test-key.pem`, regenerated by `tools/sign-inline-md.mjs`. The URL
> and the 12 MB in the narrative are illustrative, as everywhere in these worked examples; the two
> cryptographic values are not, and anyone can check them. They previously read as the digest of a
> 12 MB image while actually being the SHA-256 of the **empty string** — a value that no
> implementation could ever fail to match, because nothing was ever hashed to produce it.

---

### Step 3: Station Accepts Update Request (22:00:01.300)

The station validates the request (checks available flash space) and accepts. Bay state is **not** an acceptance condition: the gate is on the install, never the download, so a station that is servicing a bay still accepts, downloads and verifies, and then holds the verified image until every bay is idle (`spec/05-state-machines.md` §7.4, `update-firmware.md` §5 rules 1 and 7).

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fw_update_v130",
  "messageType": "Response",
  "action": "UpdateFirmware",
  "timestamp": "2026-02-13T22:00:01.300Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

---

### Step 4: FirmwareStatusNotification -- Downloading 0% (22:00:02.000)

The station begins downloading the firmware binary from the CDN.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_001",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:00:02.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Downloading",
    "firmwareVersion": "1.3.0",
    "progress": 0
  }
}
```

---

### Step 5: FirmwareStatusNotification -- Downloading 25% (22:00:15.000)

> **Only four of the download notifications are reproduced here.** The station sent one at every
> 10% increment, as `spec/profiles/device-management/firmware-status.md` §5 rule 1 requires; the
> quarter marks are shown because printing all ten adds nothing. 25/50/75/100 is the cadence for
> `Installing`, not for `Downloading` — do not read this abridgement as the rule.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_002",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:00:15.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Downloading",
    "firmwareVersion": "1.3.0",
    "progress": 25
  }
}
```

---

### Step 6: FirmwareStatusNotification -- Downloading 50% (22:00:30.000)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_003",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:00:30.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Downloading",
    "firmwareVersion": "1.3.0",
    "progress": 50
  }
}
```

---

### Step 7: FirmwareStatusNotification -- Downloading 75% (22:00:45.000)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_004",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:00:45.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Downloading",
    "firmwareVersion": "1.3.0",
    "progress": 75
  }
}
```

---

### Step 8: FirmwareStatusNotification -- Downloading 100% (22:01:00.000)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_005",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:01:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Downloading",
    "firmwareVersion": "1.3.0",
    "progress": 100
  }
}
```

---

### Step 9: FirmwareStatusNotification -- Downloaded (22:01:05.000)

The station has finished downloading. It verifies the SHA-256 checksum against the value provided in the UpdateFirmware request **and** verifies the `signature` over the downloaded binary with ECDSA P-256 against the pre-provisioned Firmware Signing Certificate. `Downloaded` is reported only once both have passed — a checksum proves the bytes arrived intact, never that they came from the firmware publisher, and it travels in the same message as the URL it was computed over (`spec/profiles/device-management/update-firmware.md` §5 rule 4).

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_006",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:01:05.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Downloaded",
    "firmwareVersion": "1.3.0"
  }
}
```

**What Charlie sees on the dashboard:**

```
Firmware update progress:
  [=========================] 100% Downloaded
  Checksum: VERIFIED
  Signature: VALID
  Installing...
```

---

### Step 10: FirmwareStatusNotification -- Installing (22:01:10.000)

The station begins writing the firmware to partition B. During this phase, the station is still operational on partition A but will not accept new sessions as a safety precaution.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_007",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:01:10.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Installing",
    "firmwareVersion": "1.3.0"
  }
}
```

---

### Step 11: FirmwareStatusNotification -- Installing 100% (22:01:30.000)

The firmware has been written to partition B. The bootloader configuration has been updated to boot from partition B on next restart.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_008",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:01:30.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Installing",
    "firmwareVersion": "1.3.0",
    "progress": 100
  }
}
```

---

### Step 12: FirmwareStatusNotification -- Installed (22:01:32.000)

The write is verified and partition B is marked as the next boot target. The station reports
`Installed` **now**, on the connection it is about to drop — not after the reboot. `Installed` says
*the image is on the device and the boot target is set*; it does not say the station has come back
on it. That claim is made by the BootNotification in Step 14, and the two are deliberately separate:
if the new image never boots, `Installed` was still true and the watchdog rollback is what the
server learns from next.

`spec/profiles/device-management/firmware-status.md` §6 rule 4 puts it as an obligation on what
comes next — *after `Installed`, the station reboots, and the next message from the station **MUST**
be a BootNotification*. A station that reports `Installed` after its post-update boot has sent that
boot first and broken the rule.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_fwstatus_009",
  "messageType": "Event",
  "action": "FirmwareStatusNotification",
  "timestamp": "2026-02-13T22:01:32.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Installed",
    "firmwareVersion": "1.3.0"
  }
}
```

---

### Step 13: Station Reboots (22:01:35.000 - 22:02:30.000)

The station sends a graceful MQTT disconnect (with `reasonCode: 0x04, "Disconnect with Will Message"` suppressed since this is planned), then reboots.

**Station internal boot sequence:**

```
[22:01:35.000] INFO  MQTT graceful disconnect (firmware update reboot)
[22:01:35.500] INFO  System reboot initiated
[22:01:36.000] ---- REBOOT ----
[22:02:00.000] Bootloader: selecting partition B (firmware v1.3.0)
[22:02:05.000] Kernel: loading...
[22:02:15.000] Application: initializing hardware...
[22:02:20.000] Application: bay controllers online (3/3)
[22:02:25.000] Application: BLE stack initialized
[22:02:28.000] Application: MQTT client initializing
[22:02:30.000] Application: boot complete
[22:02:32.000] Application: MQTT connected to broker.example.com:8883
```

During this 55-second reboot window:
- The station is completely offline (no MQTT, no BLE)
- The MQTT broker does NOT publish the station's LWT because the disconnect was graceful
- The server knows the station is rebooting (firmware update in progress) and does not trigger offline alerts
- If any user tries to scan the station via the app, they see "Station updating, please wait"

---

### Step 14: Station Sends BootNotification (22:02:33.000)

The station boots on partition B with firmware v1.3.0 and announces itself.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_boot_fw130_a1b2c3d4",
  "messageType": "Request",
  "action": "BootNotification",
  "timestamp": "2026-02-13T22:02:33.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "stationModel": "SSP-3000",
    "stationVendor": "AcmeCorp",
    "firmwareVersion": "1.3.0",
    "serialNumber": "ACME-SSP-2024-0042",
    "bays": [
      { "bayNumber": 1, "programNumbers": [1, 2, 3] },
      { "bayNumber": 2, "programNumbers": [1, 2, 3] },
      { "bayNumber": 3, "programNumbers": [1, 2, 3] }
    ],
    "uptimeSeconds": 3,
    "pendingOfflineTransactions": 0,
    "timezone": "Europe/London",
    "bootReason": "FirmwareUpdate",
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

### Step 15: Server Responds Accepted (22:02:33.500)

The server recognizes the firmware update boot, verifies the new firmware version, and accepts.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_boot_fw130_a1b2c3d4",
  "messageType": "Response",
  "action": "BootNotification",
  "timestamp": "2026-02-13T22:02:33.500Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted",
    "serverTime": "2026-02-13T22:02:33.500Z",
    "heartbeatIntervalSec": 30,
    "sessionKey": "cG9zdC1maXJtd2FyZS1zZXNzaW9uLWtleS0yMDI2LTAyLTEzISE="
  }
}
```

---

### Step 16: Station Sends Bay Status (22:02:40.000)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_postfw_bay1",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T22:02:40.000Z",
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
  "messageId": "msg_status_postfw_bay2",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T22:02:40.100Z",
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
  "messageId": "msg_status_postfw_bay3",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T22:02:40.200Z",
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

### Step 17: Normal Operations Resume (22:02:45.000)

The station sends its first heartbeat on the new firmware.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_hb_postfw_001",
  "messageType": "Request",
  "action": "Heartbeat",
  "timestamp": "2026-02-13T22:02:45.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {}
}
```

---

### Step 18: Server Marks Update Complete (22:03:00.000)

**Server firmware update record:**

```json
{
  "updateId": "fwupd_d7e8f9a0b1c2",
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "status": "completed",
  "requestedBy": "operator_charlie01",
  "previousVersion": "1.2.5",
  "newVersion": "1.3.0",
  "timing": {
    "requestedAt": "2026-02-13T22:00:01.000Z",
    "downloadStarted": "2026-02-13T22:00:02.000Z",
    "downloadCompleted": "2026-02-13T22:01:00.000Z",
    "checksumVerified": "2026-02-13T22:01:05.000Z",
    "installStarted": "2026-02-13T22:01:10.000Z",
    "installCompleted": "2026-02-13T22:01:30.000Z",
    "rebootStarted": "2026-02-13T22:01:35.000Z",
    "rebootCompleted": "2026-02-13T22:02:33.000Z",
    "confirmed": "2026-02-13T22:02:35.000Z",
    "totalDurationSeconds": 154
  },
  "partitioning": {
    "activePartition": "B",
    "rollbackPartition": "A",
    "rollbackVersion": "1.2.5"
  },
  "selfTestResult": "pass"
}
```

---

### What Charlie Sees -- Final Dashboard State (22:03:00.500)

```
+----------------------------------------------------------------------+
|  SSP-3000 (stn_a1b2c3d4)                                      |
|  Station Alpha — Example City                                       |
|                                                                        |
|  Firmware: v1.3.0  [UPDATED]                                          |
|  Updated at: 13 Feb 2026, 22:02                                    |
|  Update duration: 2m 34s                                           |
|  Active partition: B | Rollback available: A (v1.2.5)                |
|                                                                        |
|  Status: ONLINE                                                        |
|  +------+  +------+  +------+                                         |
|  | Bay 1|  | Bay 2|  | Bay 3|                                         |
|  | [OK] |  | [OK] |  | [OK] |  <- all Available (green)              |
|  +------+  +------+  +------+                                         |
|                                                                        |
|  Self-test: PASS (all subsystems)                                     |
|                                                                        |
|  Update timeline:                                                 |
|  22:00:01  Command sent                                             |
|  22:00:02  Download started                                            |
|  22:01:00  Download complete (12 MB in 58s)                            |
|  22:01:05  Checksum verified                                           |
|  22:01:10  Installation started                                        |
|  22:01:30  Installation complete                                       |
|  22:01:35  Restarting                                                  |
|  22:02:33  Boot on v1.3.0                                              |
|  22:02:35  Confirmed - update successful                             |
|                                                                        |
|  [Rollback to v1.2.5]  [Update history]                               |
+----------------------------------------------------------------------+
```

## FirmwareStatusNotification Lifecycle

```
                    +----> Failed (retry or abort)
                    |
Downloading --------+----> Downloaded -----> Installing --------> Installing (100%)
  (0%...100%)       |      (checksum OK)     (writing to B)      (reboot required)
                    |                                                |
                    |                              +--- Failed
                    |                              |    (rollback to A)
                    |                              |
                    v                              v
                 [abort]                       Installed
                                                   |
                                                [reboot]
                                                   |
                                                   v
                                             BootNotification
                                             (FirmwareUpdate)
                                             — the update's outcome
                                               is read from this boot
```

| Status | Count in This Flow | Meaning |
|--------|-------------------|---------|
| `Downloading` | 5 (0%, 25%, 50%, 75%, 100%) | Firmware binary being downloaded from CDN |
| `Downloaded` | 1 | Download complete, checksum **and** signature verified |
| `Installing` | 2 | Writing firmware to target partition (progress 0-100%) |
| `Installed` | 1 | Image written and boot target set — sent before the reboot, not after |
| **Total** | **9** | |

## Message Sequence Diagram

```
  Charlie (Dashboard)     Server                Station (stn_a1b2c3d4)     CDN
     |                    |                       |                       |
     | Click Update       |                       |                       |
     |------------------>|                       |                       |
     |                    | UpdateFirmware REQ    |                       |
     |                    |---------------------->|                       |
     |                    | UpdateFirmware RSP    |                       |
     |                    |<----------------------|                       |
     |                    |  (Accepted)           |                       |
     |                    |                       |                       |
     |                    | FWStatus: Downloading |   GET firmware.bin    |
     |                    |<----------------------|--------------------->|
     |  progress: 0%      |                       |   200 OK (streaming) |
     |<-------------------|                       |<--------------------|
     |                    | FWStatus: Downloading |                       |
     |  progress: 25%     |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    | FWStatus: Downloading |                       |
     |  progress: 50%     |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    | FWStatus: Downloading |                       |
     |  progress: 75%     |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    | FWStatus: Downloading |                       |
     |  progress: 100%    |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    | FWStatus: Downloaded  |                       |
     |  checksum OK       |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    | FWStatus: Installing  |                       |
     |  installing...     |<----------------------| write to partition B  |
     |<-------------------|                       |                       |
     |                    | FWStatus: Installing 100% |                   |
     |  reboot pending    |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    |  MQTT disconnect      |                       |
     |  rebooting...      |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    |     ---- REBOOT (55s) ----                    |
     |                    |                       |                       |
     |                    |  MQTT reconnect       |                       |
     |                    |<----------------------|                       |
     |                    | BootNotification      |                       |
     |                    |<----------------------|                       |
     |                    | BootNotification RSP  |                       |
     |                    |---------------------->|                       |
     |                    | FWStatus: Installed   |                       |
     |  UPDATE COMPLETE   |<----------------------|                       |
     |<-------------------|                       |                       |
     |                    |                       |                       |
```

## Error Scenarios (Not Shown)

| Scenario | Station Behavior | Server Response |
|----------|-----------------|-----------------|
| Download fails (network error) | Report `Failed` with `errorText` describing the failure, and `5014 DOWNLOAD_FAILED` | Alert operator, suggest retry |
| Checksum mismatch | Report `Failed` with an `errorText` naming the mismatch (`5015 CHECKSUM_MISMATCH`) | Reject firmware binary, investigate CDN |
| Signature invalid | Report `Failed` with a descriptive `errorText`, write nothing to the inactive partition, and report `5112 FIRMWARE_SIGNATURE_INVALID` on a `FirmwareIntegrityFailure` SecurityEvent [MSG-012] | Critical alert: possible tampering |
| Install fails (flash write error) | Report `Failed`, stay on partition A (`5018 INSTALLATION_FAILED`) | Alert operator, suggest hardware check |
| Boot fails on new firmware | Bootloader auto-rollback to partition A when the station fails to send a BootNotification within the 5-minute watchdog (`spec/05-state-machines.md` §6.5 rule 1; boot 60s and health check 120s are the inner budgets of `update-firmware.md` §8) | Station reports old version, server marks update failed |
| Self-test fails on new firmware | Health check fails within 120s of boot; the watchdog rolls back and the station reports `Failed` with an `errorText` describing the rollback (`update-firmware.md` §8 rule 2, §6.5 rule 4) | Server reads the rollback from the BootNotification carrying the old version; it does not initiate the rollback |

> **Three things this table used to say that the protocol does not have.** There is no `reason`
> member on FirmwareStatusNotification — the field is `errorText`, and the schema is
> `additionalProperties: false`. There is no `selfTestResult` member either, and no
> server-initiated rollback: rollback is a property of the A/B partition scheme and its watchdog,
> and the server's only role is to observe the version that comes back. And there is no normative
> download-retry policy anywhere in this specification — neither a count nor a backoff — so
> "retry up to 3 times" was a number with no source. Whether to state one is
> [an open question](../../KNOWN-ISSUES.md); until it is answered, an implementer choosing a retry
> count is choosing it, not reading it.

## Key Design Decisions

1. **A/B partitioning.** The station uses dual boot partitions. The new firmware is always written to the inactive partition. If the new firmware fails to boot, the bootloader automatically rolls back to the previous partition. This guarantees the station is never bricked by a bad firmware update.

2. **Checksum + signature verification.** The firmware binary is verified with both a SHA-256 checksum (integrity) and an ECDSA-P256-SHA256 signature (authenticity). This prevents both corruption and unauthorized firmware from being installed.

3. **Session acceptance disabled during install.** While the firmware is being written to flash, the station refuses new session requests. This prevents a session from starting and then being interrupted by the reboot.

4. **Graceful MQTT disconnect before reboot.** The station disconnects cleanly from MQTT before rebooting, so the broker does not publish an LWT (which would trigger false offline alerts). The server knows the station is rebooting due to the firmware update and suppresses alerts for the expected reboot window.

5. **Self-test after boot.** After booting on the new firmware, the station runs a self-test (bay controllers, BLE, MQTT, sensors, flash). Only if all subsystems pass does the station report `Installed`. This enables automatic rollback if the new firmware has hardware compatibility issues.

6. **Late-night update scheduling.** Charlie initiates the update at 22:00, when customer traffic is minimal. While the protocol supports updates at any time (with session draining), best practice is to update during off-peak hours.
