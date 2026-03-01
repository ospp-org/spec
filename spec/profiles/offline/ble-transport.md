# BLE Transport

> **Status:** Draft

## 1. Hardware Requirements

Stations implementing the Offline / BLE profile **MUST** include a Bluetooth Low Energy radio that meets the following requirements:

- **Minimum:** Bluetooth 4.2 with LE Secure Connections (LESC) support.
- **Recommended:** Bluetooth 5.0 or later for extended range (up to 200 m line-of-sight), 2 Mbps PHY throughput, and improved coexistence with Wi-Fi.
- **Antenna:** The BLE antenna **MUST** be rated for outdoor operation and **SHOULD** provide at least 0 dBm TX power. Stations deployed in enclosed bays **SHOULD** use an external antenna positioned to maximize coverage within the bay area.
- **Power class:** Class 1.5 (10 dBm) is **RECOMMENDED** for outdoor and industrial environments to ensure reliable connectivity through interference and metal enclosures.
- **Environmental:** The BLE module **MUST** operate reliably in temperatures from -20 C to +60 C and humidity up to 95% non-condensing, consistent with outdoor self-service deployment.

## 2. GATT Service Definition

### 2.1 Service UUID

The OSPP BLE service **MUST** be registered as a primary GATT service with the following 128-bit UUID:

```
0000FFF0-0000-1000-8000-00805F9B34FB
```

This UUID **MUST** appear in the station's advertising data to allow app discovery.

### 2.2 Characteristic Table

| UUID Suffix | Name | Properties | Description |
|-------------|---------------------|---------------------|-----------------------------------------------|
| FFF1 | Station Info | Read | Station identity, firmware, and connectivity status. |
| FFF2 | Available Services | Read | Service catalog with bay availability and pricing. |
| FFF3 | TX Request | Write | App-to-station command channel (HELLO, AUTH, START, STOP). |
| FFF4 | TX Response | Notify | Station-to-app response channel (CHALLENGE, AuthResponse, etc.). |
| FFF5 | Service Status | Notify | Real-time service progress updates during active sessions. |
| FFF6 | Receipt | Read | Signed receipt retrieval after service completion. |

All characteristic UUIDs use the Bluetooth Base UUID format: `0000XXXX-0000-1000-8000-00805F9B34FB` where `XXXX` is the suffix above.

## 3. Station Info (FFF1)

The Station Info characteristic provides read-only station metadata. The app **SHOULD** read this characteristic immediately after establishing a BLE connection and before initiating the handshake.

**Payload (JSON):**

| Field | Type | Required | Description |
|----------------------|---------|----------|-----------------------------------------------|
| `stationId` | string | Yes | Unique station identifier (`stn_` prefix). |
| `stationModel` | string | Yes | Model identifier of the station hardware. |
| `firmwareVersion` | string | Yes | Semantic version of the station firmware. |
| `bayCount` | integer | Yes | Number of service bays (minimum 1). |
| `bleProtocolVersion` | string | Yes | Semantic version of the BLE protocol (e.g., `0.1.0`). |
| `connectivity` | string | Yes | Current network status: `"Online"` or `"Offline"`. |

**Example:**

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "1.2.3",
  "bayCount": 3,
  "bleProtocolVersion": "0.1.0",
  "connectivity": "Online"
}
```

## 4. Available Services (FFF2)

The Available Services characteristic provides the station's service catalog, including bay statuses, service pricing, and availability.

**Payload (JSON):**

| Field | Type | Required | Description |
|------------------|---------|----------|-----------------------------------------------|
| `catalogVersion` | string | Yes | Version identifier of the service catalog. |
| `bays` | array | Yes | Array of bay objects (minimum 1). |

Each bay object:

| Field | Type | Required | Description |
|------------|---------|----------|-----------------------------------------------|
| `bayId` | string | Yes | Bay identifier. |
| `bayNumber`| integer | Yes | Human-readable bay number (minimum 1). |
| `status` | string | Yes | Bay status (e.g., `Available`, `Occupied`). |
| `services` | array | Yes | Array of service objects offered in this bay. |

Each service object:

| Field | Type | Required | Description |
|------------------------|---------|----------|-----------------------------------------------|
| `serviceId` | string | Yes | Service identifier. |
| `serviceName` | string | Yes | Display name of the service. |
| `pricingType` | string | Yes | `PerMinute` or `Fixed`. |
| `priceCreditsPerMinute` | integer | Cond. | Credits per minute (present when `PerMinute`). |
| `priceCreditsFixed` | integer | Cond. | Fixed price in credits (present when `"Fixed"`). |
| `priceLocalPerMinute` | integer | Cond. | Local-currency minor units per minute (present when `PerMinute`). |
| `priceLocalFixed` | integer | Cond. | Fixed price in local-currency minor units (present when `"Fixed"`). |
| `available` | boolean | Yes | Whether this service is currently available. |

**Example:**

```json
{
  "catalogVersion": "2026-02-13-01",
  "bays": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "bayNumber": 1,
      "status": "Available",
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 10,
          "priceLocalPerMinute": 50,
          "available": true
        },
        {
          "serviceId": "svc_standard",
          "serviceName": "Standard Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 8,
          "priceLocalPerMinute": 40,
          "available": true
        }
      ]
    }
  ]
}
```

## 5. TX Request (FFF3)

The TX Request characteristic is the app-to-station command channel. The app writes structured JSON messages to this characteristic to drive the handshake and session lifecycle.

**Supported message types (written by app):**

| Message Type | Purpose | Schema |
|--------------------------|-----------------------------------------------|------------------------------|
| `Hello` | Initiate authentication handshake | `hello.schema.json` |
| `OfflineAuthRequest` | Present OfflinePass for validation | `offline-auth-request.schema.json` |
| `ServerSignedAuth` | Deliver server-signed authorization | `server-signed-auth.schema.json` |
| `StartServiceRequest` | Request service activation | `start-service-request.schema.json` |
| `StopServiceRequest` | Request service termination | `stop-service-request.schema.json` |

Each message **MUST** include a `type` field as the first-level discriminator. The station **MUST** reject any write that does not contain a recognized `type` value.

## 6. TX Response (FFF4)

The TX Response characteristic is the station-to-app response channel. The app **MUST** subscribe to notifications on this characteristic before writing to FFF3.

**Supported message types (notified by station):**

| Message Type | Purpose | Schema |
|---------------------------|-----------------------------------------------|-------------------------------|
| `Challenge` | Respond to Hello with nonce and connectivity | `challenge.schema.json` |
| `AuthResponse` | Accept or reject authentication | `auth-response.schema.json` |
| `StartServiceResponse` | Accept or reject service start | `start-service-response.schema.json` |
| `StopServiceResponse` | Confirm or reject service stop | `stop-service-response.schema.json` |

The station **MUST** send exactly one response for each request written to FFF3. If the station cannot process the request, it **MUST** respond with an appropriate error code.

## 7. Service Status (FFF5)

The Service Status characteristic provides real-time progress updates during an active session. The app **MUST** subscribe to notifications on this characteristic after a successful StartServiceResponse.

**Payload (JSON):**

| Field | Type | Required | Description |
|-------------------|---------|---------|--------------------------------------------|
| `bayId` | string | Yes | Bay identifier. |
| `status` | string | Yes | `Starting`, `Running`, `Complete`, `ReceiptReady`, or `Error`. |
| `sessionId` | string | Yes | Session identifier. |
| `elapsedSeconds` | integer | Yes | Seconds elapsed since service start. |
| `remainingSeconds`| integer | Yes | Estimated seconds remaining. |
| `meterValues` | object | No | Real-time meter readings (liquidMl, consumableMl, energyWh). |

The station **MUST** send notifications at a configurable interval (default 5 seconds, adjustable via `BLEStatusInterval`). The station **MUST** send a final notification with `status: "ReceiptReady"` when the service completes.

**Example (Running):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a1b2c3d4e5f6",
  "elapsedSeconds": 120,
  "remainingSeconds": 180,
  "meterValues": {
    "liquidMl": 22100,
    "consumableMl": 250
  }
}
```

**Example (Receipt Ready):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_a1b2c3d4e5f6",
  "elapsedSeconds": 298,
  "remainingSeconds": 0
}
```

## 8. Receipt (FFF6)

The Receipt characteristic provides a signed transaction receipt after service completion. The app **SHOULD** read this characteristic after receiving a `ReceiptReady` status notification on FFF5.

**Payload (JSON):**

| Field | Type | Required | Description |
|------------------|---------|----------|-----------------------------------------------|
| `offlineTxId` | string | Yes | Offline transaction identifier. |
| `bayId` | string | Yes | Bay where service was delivered. |
| `serviceId` | string | Yes | Service that was delivered. |
| `startedAt` | string | Yes | ISO 8601 timestamp of service start. |
| `endedAt` | string | Yes | ISO 8601 timestamp of service end. |
| `durationSeconds` | integer | Yes | Actual duration in seconds. |
| `creditsCharged` | integer | Yes | Total credits charged. |
| `meterValues` | object | No | Final meter readings. |
| `receipt` | object | Yes | Signed receipt object (see below). |
| `txCounter` | integer | Yes | Monotonic transaction counter. |

The `receipt` object contains:

| Field | Type | Description |
|----------------------|---------|-----------------------------------------------|
| `data` | string | Base64-encoded canonical receipt payload. |
| `signature` | string | ECDSA-P256-SHA256 signature over `data`. |
| `signatureAlgorithm` | string | Always `ECDSA-P256-SHA256`. |

**Example:**

```json
{
  "offlineTxId": "otx_d4e5f6a7b8c9",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-02-13T10:00:00.000Z",
  "endedAt": "2026-02-13T10:04:58.000Z",
  "durationSeconds": 298,
  "creditsCharged": 50,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  },
  "receipt": {
    "data": "eyJvZmZsaW5lVHhJZCI6Im90eF9kNGU1ZjZnNyIsImJheUlkIjoiYmF5X3gxeTJ6MyIsInNlcnZpY2VJZCI6InN2Y19mb2FtIiwiZHVyYXRpb24iOjI5OCwiY3JlZGl0cyI6NTB9",
    "signature": "MEUCIQC7x2kR9wPz5mNvHp3LdFbYqT1sXcA0jKe6fZoWnBgUIQIgRtM4vN8hJpLyD3kWm0aOxCqFb5sE7nGdT2fYiJwKxQ==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5
}
```

## 9. Advertising Data

The station **MUST** include the following in its BLE advertising packet:

| Field | Size | Description |
|------------------|---------|-----------------------------------------------|
| Service UUID | 16 bytes | The OSPP service UUID (`0000FFF0-...`), included in the Complete List of 128-bit Service UUIDs AD type. |
| Local Name | variable | The station ID in shortened form (e.g., `OSPP-b2c3d4`), included as Shortened Local Name. |
| TX Power Level | 1 byte | Transmit power level in dBm for RSSI-based distance estimation. |
| Manufacturer Data | variable | **OPTIONAL**. **MAY** include bay availability flags (1 bit per bay: 1 = available, 0 = occupied/faulted). |

The advertising interval **MUST** be configurable via the `BLEAdvertisingInterval` configuration key (default: 200 ms, range: 100--2000 ms). The station **MUST** advertise continuously while the BLE profile is enabled.

## 10. MTU Negotiation

After establishing a BLE connection, the app **SHOULD** request an MTU of **247 bytes** (the maximum ATT_MTU for BLE 4.2+). The station **MUST** accept any MTU of 185 bytes or greater. The effective ATT payload size is MTU minus 3 bytes (ATT header).

| Scenario | Negotiated MTU | Effective Payload | Notes |
|------------|----------------|-------------------|-----------------------------------------------|
| Preferred | 247 bytes | 244 bytes | Sufficient for most OSPP messages without fragmentation. |
| Minimum | 185 bytes | 182 bytes | Fragmentation required for larger payloads (receipt, OfflinePass). |
| Fallback | 23 bytes | 20 bytes | Default BLE MTU. **MUST** trigger fragmentation for all messages. |

If the negotiated MTU is below 185 bytes, the station **SHOULD** log a warning but **MUST** still operate using the fragmentation protocol defined in section 11.

## 11. Fragmentation Protocol

When a JSON payload exceeds the effective ATT payload size, the sender **MUST** fragment the message using the following protocol:

**Fragment header (3 bytes):**

| Byte | Field | Description |
|------|----------------|-----------------------------------------------|
| 0 | `sequenceNumber` | 0-based index of this fragment (0x00--0xFF). |
| 1 | `totalFragments` | Total number of fragments in this message (1--255). |
| 2 | `flags` | Bit 0: 1 = more fragments follow; 0 = last fragment. Bits 1--7: reserved (0). |

**Reassembly rules:**

1. The receiver **MUST** buffer fragments in order of `sequenceNumber`.
2. If a fragment arrives out of order, the receiver **MUST** discard all buffered fragments for that message and wait for retransmission.
3. Reassembly **MUST** complete within 5 seconds of the first fragment. If the timeout expires, the receiver **MUST** discard all buffered fragments.
4. After reassembly, the receiver **MUST** validate that the reassembled payload is valid JSON before processing.
5. For single-fragment messages (payload fits within MTU), the header **MUST** be: `sequenceNumber: 0`, `totalFragments: 1`, `flags: 0x00`.

## 12. BLE Configuration Keys

The following BLE-related configuration keys **MAY** be set via the ChangeConfiguration action:

| Key | Type | Default | Range | Description |
|--------------------------|---------|---------|--------------|-----------------------------------------------|
| `BLEAdvertisingInterval` | integer | 200 | 100--2000 ms | BLE advertising interval in milliseconds. |
| `BLETxPower` | integer | 4 | -20--10 dBm | BLE transmit power level. |
| `BLEConnectionTimeout` | integer | 30 | 10--120 s | Maximum idle time before BLE disconnect. |
| `BLEMTUPreferred` | integer | 247 | 23--517 bytes | Preferred MTU for BLE connections. |
| `BLEStatusInterval` | integer | 5 | 1--30 s | Interval for FFF5 Service Status notifications. |

## 13. Related Schemas

- Station Info: [`station-info.schema.json`](../../../schemas/ble/station-info.schema.json)
- Available Services: [`available-services.schema.json`](../../../schemas/ble/available-services.schema.json)
- Service Status: [`service-status.schema.json`](../../../schemas/ble/service-status.schema.json)
- Receipt: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
