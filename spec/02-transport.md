# Chapter 02 — Transport

> **Status:** Draft | **OSPP Version:** 0.1.0-draft.1

OSPP defines three transport layers for communication between participants. Each transport serves a distinct channel with its own security model, reliability guarantees, and failure modes.

| Transport | Channel | When Used |
|-----------|---------|-----------|
| **MQTT 5.0** | Station ↔ Server | Primary — all online operations |
| **BLE GATT** | Station ↔ Mobile App | Offline mode — when MQTT is unavailable |
| **HTTPS REST** | Server ↔ Clients | Mobile app API, web payment, webhooks |

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

---

## 1. MQTT Transport (Station ↔ Server)

MQTT is the primary transport for all station-to-server communication. All online operations — boot registration, session lifecycle, status reporting, device management, and security events — flow over MQTT.

### 1.1 Protocol Version

Implementations MUST use **MQTT 5.0** ([OASIS Standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)).

MQTT 3.1.1 is **NOT supported**. OSPP depends on the following MQTT 5.0 features:

| Feature | Usage |
|---------|-------|
| Session Expiry Interval | Persistent sessions survive brief disconnects |
| Message Expiry Interval | Time-sensitive commands auto-expire (see Section 5) |
| Reason Codes | Structured CONNACK/PUBACK error reporting |
| Shared Subscriptions | Server-side horizontal scaling (see Section 6.3) |
| Will Delay Interval | Grace period before LWT is published |

### 1.2 Connection Parameters

The station MUST establish the MQTT connection with the following parameters:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Clean Start** | `false` | Persistent sessions — queued messages survive brief disconnects |
| **Session Expiry Interval** | `3600` (1 hour) | Session state is retained for up to 1 hour after disconnect |
| **Keep Alive** | `30` seconds | Balance between liveness detection and bandwidth |
| **Receive Maximum** | `10` | Flow control — max 10 unacknowledged messages in flight |
| **Maximum Packet Size** | `65536` (64 KB) | Practical limit; typical messages are 200–500 bytes |
| **Client ID** | `{stationId}` (e.g., `stn_a1b2c3d4`) | MUST match the CN in the station's X.509 client certificate. The `stationId` already includes the `stn_` prefix — do not add it again. |
| **Will Delay Interval** | `10` seconds | Grace period before LWT fires (prevents false disconnects) |

The broker MUST be configured with a keep-alive multiplier of **1.5**, meaning it will disconnect a station after **45 seconds** without any MQTT packet (PINGREQ, PUBLISH, etc.).

### 1.3 TLS 1.3

All MQTT connections MUST use **TLS 1.3** ([RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)). TLS 1.2 fallback is **NOT permitted**. TLS 0-RTT (early data) **MUST NOT** be enabled due to replay attack risk.

The station MUST support at least the following cipher suites:

- `TLS_AES_256_GCM_SHA384` (RECOMMENDED)
- `TLS_AES_128_GCM_SHA256`

The connection MUST use **mutual TLS (mTLS)**:

- The **station** presents an X.509 client certificate signed by the OSPP Station CA.
- The **broker** presents a server certificate signed by a trusted public or private CA.
- The broker MUST verify the station's client certificate against the OSPP CA trust chain.

Certificate requirements are defined in [Chapter 06 — Security](06-security.md).

**Connection sequence:**

```
Station                                              Broker
   │                                                    │
   │──── TCP SYN ──────────────────────────────────────>│
   │<─── TCP SYN-ACK ──────────────────────────────────│
   │──── TCP ACK ──────────────────────────────────────>│
   │                                                    │
   │──── TLS ClientHello (TLS 1.3) ───────────────────>│
   │<─── TLS ServerHello + Certificate ────────────────│
   │──── TLS Certificate (station cert) + Finished ───>│
   │<─── TLS Finished ────────────────────────────────-│
   │                                                    │
   │  [TLS 1.3 session established — mTLS verified]     │
   │                                                    │
   │──── MQTT CONNECT {clientId, cleanStart=false, ...}>│
   │<─── MQTT CONNACK {reasonCode=0x00 Success} ──────│
   │                                                    │
```

**Error scenarios:**

| Scenario | Behavior |
|----------|----------|
| TLS handshake fails (invalid cert) | Station MUST log error `1003` (`TLS_HANDSHAKE_FAILED`), retry with backoff |
| Certificate expired | Station MUST log error `1004` (`CERTIFICATE_ERROR`), alert operator |
| CONNACK with non-zero reason code | Station MUST log the reason code, retry with backoff |
| CONNACK `0x86` (Bad Username or Password) | Likely mTLS misconfiguration — station MUST NOT retry without operator intervention |

### 1.4 Port

The broker MUST listen on **port 8883** (MQTT over TLS, [IANA assigned](https://www.iana.org/assignments/service-names-port-numbers)).

Unencrypted MQTT (port 1883) MUST NOT be used in any environment, including development.

---

## 2. Topic Structure

OSPP uses a minimal topic hierarchy with exactly **two topics per station** — one for each direction.

### 2.1 Topic Patterns

| Direction | Topic Pattern | Publisher | Subscriber |
|-----------|---------------|-----------|------------|
| Station → Server | `ospp/v1/stations/{station_id}/to-server` | Station | Server |
| Server → Station | `ospp/v1/stations/{station_id}/to-station` | Server | Station |

Where `{station_id}` is the station's unique identifier (e.g., `stn_a1b2c3d4`).

**Examples:**

```
ospp/v1/stations/stn_a1b2c3d4/to-server   ← station publishes here
ospp/v1/stations/stn_a1b2c3d4/to-station   ← station subscribes here
```

### 2.2 Topic Namespace Versioning

The `v1` segment in the topic path is a **namespace identifier**, NOT the protocol version.

- The protocol version is negotiated inside the message envelope via the `protocolVersion` field (see [Chapter 03 — Messages](03-messages.md)).
- The topic namespace `v1` MUST remain `v1` for all OSPP 1.x protocol versions.
- A new topic namespace (e.g., `v2`) would only be introduced for a fundamental transport-level change that cannot be handled by protocol version negotiation.

### 2.3 Server Subscription Patterns

The server subscribes to messages from all stations using an MQTT wildcard:

```
Subscribe: ospp/v1/stations/+/to-server
```

The server extracts the `stationId` from the topic path (3rd segment) and correlates it with the `source` field in the message envelope.

For horizontal scaling, the server SHOULD use MQTT 5.0 **shared subscriptions**:

```
Subscribe: $share/ospp-servers/ospp/v1/stations/+/to-server
```

This distributes incoming station messages across multiple server instances. See Section 6.3 for details.

---

## 3. Quality of Service

### 3.1 QoS Level

All OSPP messages MUST be published with **QoS 1** (at-least-once delivery).

| QoS | Permitted? | Rationale |
|-----|------------|-----------|
| **0** (at most once) | **NO** | Unacceptable message loss for session commands and status reports |
| **1** (at least once) | **YES** — required | Guaranteed delivery with acceptable overhead; duplicates handled by deduplication |
| **2** (exactly once) | **NO** | Unnecessary overhead; OSPP handles idempotency at the application layer |

### 3.2 Message Ordering

MQTT QoS 1 does **not** guarantee strict ordering. Messages may arrive out of order due to retransmission, network jitter, or broker clustering.

Receivers MUST handle out-of-order messages gracefully:

- **REQUEST/RESPONSE correlation**: Responses are matched to requests by `messageId`, not by arrival order.
- **EVENTs**: The `timestamp` field provides the authoritative ordering. If a StatusNotification arrives with a timestamp older than the last processed StatusNotification for the same bay, the receiver SHOULD discard it.
- **TransactionEvents**: The `txCounter` field provides strict ordering for offline transaction reconciliation.

**Command serialization:** When the server publishes multiple commands (e.g., StartService and ChangeConfiguration) to the same station topic, the station receives and MUST process them sequentially in the order received. The station MUST complete processing (send RESPONSE) for one command before processing the next. If a command arrives while another is in progress, the station MUST queue it (max 10 pending commands) or reject with error `6001 SERVER_INTERNAL_ERROR` if the queue is full.

### 3.3 Deduplication

QoS 1 may deliver the same message more than once. Both station and server MUST implement deduplication.

**Requirements:**

- The receiver MUST maintain a set of recently seen `messageId` values.
- The deduplication window MUST be at least **1000 message IDs** or **1 hour**, whichever is larger.
- Duplicate handling by message type:

| Message Type | On Duplicate |
|-------------|--------------|
| REQUEST | Re-send the **same cached RESPONSE** (idempotent) |
| RESPONSE | Silently discard |
| EVENT | Silently discard |
| ERROR | Silently discard |

Implementations SHOULD use a hash set or LRU cache for O(1) lookup.

### 3.4 Retain Flag

All OSPP messages MUST be published with **Retain = `false`**.

Retained messages are not used because state is always reconstructed via the BootNotification + StatusNotification sequence on reconnect.

---

## 4. Connection Lifecycle

### 4.1 Initial Connection

The station MUST follow this sequence on power-on or reconnect:

```
┌─────────────────────────────────────────────────────────┐
│                    STATION BOOT                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Hardware init, load config + certificates from NVS  │
│  2. Initialize BLE → start advertising (before MQTT!)   │
│  3. DNS resolution of MQTT broker endpoint              │
│  4. TCP + TLS 1.3 + mTLS handshake (port 8883)         │
│  5. MQTT CONNECT (parameters per Section 1.2)           │
│  6. Process CONNACK (verify reason code = 0x00)         │
│  7. SUBSCRIBE to: ospp/v1/stations/{id}/to-station      │
│  8. PUBLISH BootNotification REQUEST                    │
│  9. Wait for BootNotification RESPONSE (timeout: 30s)   │
│     ├── Accepted → sync clock, apply config → step 10   │
│     ├── Rejected → wait retryInterval, goto step 8      │
│     ├── Pending  → wait retryInterval, goto step 8      │
│     └── Timeout  → wait 60s, goto step 8                │
│  10. PUBLISH StatusNotification per bay (with services)  │
│  11. Start heartbeat timer                              │
│  12. Enter normal operation (accept commands)            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Critical rule:** The station MUST NOT process any server commands (StartService, Reset, etc.) until it has received a BootNotification RESPONSE with `status: "Accepted"`. Commands received before acceptance MUST be queued and processed after boot completes, or rejected with error `2001` (`STATION_NOT_REGISTERED`).

**BLE before MQTT:** A station that declares `capabilities.bleSupported: true` MUST initialize BLE advertising **before** attempting the MQTT connection, so that BLE offline sessions are available even if the MQTT broker is unreachable.

### 4.2 Keep-Alive and Heartbeat

OSPP uses two complementary liveness mechanisms:

**MQTT Keep-Alive (transport level):**

- The station MUST send an MQTT PINGREQ if no other MQTT packet has been sent within the keep-alive interval (30 seconds).
- If PINGRESP is not received within **10 seconds**, the station MUST consider the connection lost and initiate reconnection.

**OSPP Heartbeat (application level):**

- After boot, the station MUST send a Heartbeat REQUEST every `heartbeatIntervalSec` seconds (default: 30s, configurable via BootNotification response or ChangeConfiguration).
- The server responds with `serverTime` for clock synchronization.
- If the server does not receive a Heartbeat (or any message) from a station for **3.5 × heartbeatIntervalSec**, it SHOULD consider the station offline.

These two mechanisms are intentionally redundant. MQTT keep-alive detects transport failures; OSPP heartbeat detects application-level hangs and provides clock sync.

### 4.3 Last Will and Testament (LWT)

The station MUST configure an LWT message at MQTT CONNECT time:

| Parameter | Value |
|-----------|-------|
| **Will Topic** | `ospp/v1/stations/{station_id}/to-server` |
| **Will QoS** | `1` |
| **Will Retain** | `false` |
| **Will Delay Interval** | `10` seconds |
| **Will Payload** | ConnectionLost event (see below) |

**LWT payload:**

```json
{
  "messageId": "lwt-stn_a1b2c3d4",
  "messageType": "Event",
  "action": "ConnectionLost",
  "timestamp": "2026-01-30T12:00:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "reason": "UnexpectedDisconnect"
  }
}
```

**LWT rules:**

- The LWT is **exempt from message signing** (the `mac` field is absent) because it is configured at CONNECT time before any session key is established.
- The LWT timestamp is set at CONNECT time and MAY be stale when delivered. The server SHOULD use the broker's delivery time for disconnect tracking.
- The **Will Delay Interval** of 10 seconds prevents LWT from firing during brief network glitches. If the station reconnects within 10 seconds, the LWT is cancelled.
- The LWT has **no Message Expiry Interval** — it MUST always be delivered regardless of delay.

**Server processing on LWT receipt:**

1. Mark all bays of the station as `Unknown` status.
2. If any session is active, start a session timeout timer (per [Chapter 05](05-state-machines.md)).
3. Log the disconnect event.

### 4.4 Reconnection Strategy

When the MQTT connection is lost (PINGRESP timeout, TCP reset, broker unavailable), the station MUST:

1. **Continue active sessions** — hardware operations MUST NOT stop due to MQTT loss. The station runs on its local timer and auto-stops when `durationSeconds` elapses.
2. **Switch to BLE-available mode** — if not already advertising, ensure BLE is active for offline sessions.
3. **Buffer outbound messages** — The station MUST buffer TransactionEvent and SecurityEvent messages in persistent local storage per the categorized buffering policy in [01-architecture.md §6.5](../spec/01-architecture.md#65-offline-message-buffering). Regenerable messages (Heartbeat, StatusNotification, MeterValues, FirmwareStatusNotification, DiagnosticsNotification) MAY be discarded during offline operation as the station regenerates them at reconnection.
4. **Attempt reconnection** with exponential backoff (see Section 4.5).
5. **On successful reconnect** — follow the full boot sequence (Section 4.1): re-subscribe, BootNotification, StatusNotification per bay, then flush buffered messages.

### 4.5 Exponential Backoff with Jitter

The station MUST use exponential backoff with jitter for reconnection attempts:

```
Parameters:
  base_delay    = 1 second
  multiplier    = 2
  max_delay     = ReconnectBackoffMax (default 30 seconds)
  jitter_factor = 0.3

Algorithm:
  attempt = 0
  loop:
    calculated_delay = min(base_delay × (multiplier ^ attempt), max_delay)
    jitter = random_uniform(0, calculated_delay × jitter_factor)
    actual_delay = calculated_delay + jitter
    wait(actual_delay)
    try connect:
      if success:
        attempt = 0    ← reset on success
        break
      else:
        attempt = attempt + 1
        continue loop
```

**Resulting delay sequence** (without jitter):

| Attempt | Delay |
|---------|-------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 6+ | 30s (cap) |

With jitter (factor 0.3), actual delays are: 1.0–1.3s, 2.0–2.6s, 4.0–5.2s, 8.0–10.4s, 16.0–20.8s, 30.0–39.0s.

**Rationale for jitter:** Prevents thundering-herd reconnection storms when a broker restarts and all stations attempt to reconnect simultaneously.

---

## 5. Message Expiry

OSPP uses MQTT 5.0 **Message Expiry Interval** to prevent stale commands from being delivered to stations that were offline.

### 5.1 Expiry Rules

| Category | Actions | Station Max Age | MQTT Expiry Interval |
|----------|---------|-----------------|----------------------|
| **Session commands** | StartService, StopService, ReserveBay, CancelReservation | 30s | 30s |
| **Management commands** | Reset, ChangeConfiguration, GetConfiguration, SetMaintenanceMode, UpdateServiceCatalog | 60s | 120s |
| **Long-running commands** | UpdateFirmware, GetDiagnostics | 300s | 600s |
| **Certificate renewal** | SignCertificate, CertificateInstall, TriggerCertificateRenewal | 30s | 60s |
| **Critical events** | BootNotification, TransactionEvent, SecurityEvent, ConnectionLost (LWT) | — | **Never expires** |

> **Note:** UpdateServiceCatalog overrides the management-command default with a 60-second MQTT Expiry (see [Chapter 03](03-messages.md), Appendix B).

**Station Max Age** is the maximum age of a message the station will accept. If a message's timestamp is older than `now - maxAge`, the station MUST discard it and SHOULD log a warning.

**MQTT Expiry Interval** is set by the publisher. The broker discards the message if it has not been delivered within this interval. This is set higher than the station max age to account for clock differences.

### 5.2 Never-Expire Messages

The following messages MUST NOT have a Message Expiry Interval set:

- **BootNotification** — always relevant, contains station identity
- **TransactionEvent** — offline transaction reconciliation data must never be lost
- **SecurityEvent** — security incidents must always be delivered
- **ConnectionLost (LWT)** — disconnect detection must always be delivered

---

## 6. Access Control (ACL)

### 6.1 Station ACL

The MQTT broker MUST enforce per-station topic isolation:

| Rule | Permission |
|------|------------|
| Station `stn_X` MAY publish to | `ospp/v1/stations/stn_X/to-server` |
| Station `stn_X` MAY subscribe to | `ospp/v1/stations/stn_X/to-station` |
| Station `stn_X` MUST NOT publish to | `ospp/v1/stations/stn_Y/to-server` (any other station) |
| Station `stn_X` MUST NOT subscribe to | `ospp/v1/stations/stn_Y/to-station` (any other station) |
| Station `stn_X` MUST NOT subscribe to | `ospp/v1/stations/+/to-server` (wildcard) |

### 6.2 Server ACL

| Rule | Permission |
|------|------------|
| Server MAY subscribe to | `ospp/v1/stations/+/to-server` (all stations) |
| Server MAY publish to | `ospp/v1/stations/{any_stationId}/to-station` |
| Server MUST NOT subscribe to | `ospp/v1/stations/+/to-station` (eavesdrop on commands) |

### 6.3 ACL Enforcement

The broker MUST derive the station identity from the **mTLS client certificate CN** (Common Name = `stn_{station_id}`) and enforce topic access rules based on this identity.

The broker MUST NOT rely on the MQTT Client ID alone for authorization, as it can be spoofed without mTLS.

**Implementation:** Most MQTT 5.0 brokers support ACL via built-in plugins or extensions. The ACL rules **SHOULD** be configured to match the `%c` (client ID) or `%C` (CN from certificate) against the topic pattern.

> **Informative:** Known broker implementations include EMQX (`emqx_auth_mnesia`), HiveMQ (Enterprise Security Extension), and Mosquitto (`mosquitto_auth_plugin`).

---

## 7. Broker Requirements

### 7.1 Minimum Capabilities

Any MQTT 5.0 compliant broker MAY be used. The broker MUST support:

- MQTT 5.0 (full specification)
- TLS 1.3 with client certificate authentication (mTLS)
- Persistent sessions (Clean Start = false)
- Message Expiry Interval
- Shared Subscriptions (for multi-server deployments)
- Per-client ACL based on certificate CN
- Last Will and Testament with Will Delay Interval

> **Informative — Tested brokers:** EMQX 5.x, HiveMQ 4.x, Mosquitto 2.x, VerneMQ 2.x. Any MQTT 5.0 compliant broker meeting the requirements above is suitable.

### 7.2 High Availability

For production deployments, the broker SHOULD be deployed in a **clustered configuration** with at least 3 nodes.

Requirements:

- **Session state replication** — persistent sessions MUST survive single-node failure.
- **Message persistence** — QoS 1 messages in flight MUST be persisted to disk or replicated.
- **Automatic failover** — clients SHOULD reconnect to a healthy node within the backoff window.
- **DNS-based discovery** — stations **SHOULD** connect via a DNS name that resolves to multiple broker nodes (e.g., `mqtt.ospp.example.com`). Implementations **SHOULD** use DNS round-robin (A/AAAA records) for simplicity; DNS SRV records **MAY** be used when port or priority differentiation is needed.

### 7.3 Shared Subscriptions

For horizontal server scaling, OSPP servers use MQTT 5.0 shared subscriptions:

```
$share/ospp-servers/ospp/v1/stations/+/to-server
```

The broker distributes incoming station messages across all server instances in the `ospp-servers` group. This enables:

- **Load balancing** — no single server processes all station messages.
- **High availability** — if one server fails, messages are routed to surviving servers.

**Stateful command tracking:** Because shared subscriptions distribute messages across servers, the server layer MUST use a shared store (e.g., Redis) to track pending command state (which server sent a command, which station is expected to respond). This ensures that a RESPONSE can be matched to its REQUEST regardless of which server instance receives it.

---

## 8. BLE Transport (Offline Mode)

When the MQTT connection is unavailable (station offline, phone offline, or both), OSPP supports direct communication between a mobile app and a station via **Bluetooth Low Energy (BLE)**.

BLE transport is part of the **Offline/BLE Profile** and is OPTIONAL. Stations that do not support BLE MUST set `capabilities.offlineModeSupported: false` in their BootNotification.

### 8.1 BLE Roles

| Role | Participant | Behavior |
|------|-------------|----------|
| **Peripheral** (GATT Server) | Station | Always advertising when BLE is enabled |
| **Central** (GATT Client) | Mobile App | Scans, connects, initiates transactions |

### 8.2 Hardware Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| BLE version | 4.2 | 5.0 |
| LE Secure Connections | REQUIRED | REQUIRED |
| TX power | 0 dBm | +4 dBm |
| Range (open air) | 10 meters | 20 meters |
| Simultaneous connections | 1 | 3 (configurable via `MaxConcurrentBLEConnections`) |
| MTU | 23 bytes (default) | 247 bytes (negotiated) |
| Advertising interval | 200ms | 200ms |

### 8.3 GATT Service Definition

OSPP defines a single primary GATT service with 6 characteristics:

**Service UUID:** `0000FFF0-0000-1000-8000-00805F9B34FB`

| # | Characteristic | UUID | Properties | Direction | Description |
|---|----------------|------|------------|-----------|-------------|
| 1 | **Station Info** | `0000FFF1-0000-1000-8000-00805F9B34FB` | Read | Station → App | Station identity and capabilities |
| 2 | **Available Services** | `0000FFF2-0000-1000-8000-00805F9B34FB` | Read | Station → App | Service catalog per bay with prices |
| 3 | **TX Request** | `0000FFF3-0000-1000-8000-00805F9B34FB` | Write | App → Station | All app-to-station messages |
| 4 | **TX Response** | `0000FFF4-0000-1000-8000-00805F9B34FB` | Notify | Station → App | All station-to-app responses |
| 5 | **Service Status** | `0000FFF5-0000-1000-8000-00805F9B34FB` | Notify | Station → App | Real-time service progress |
| 6 | **Receipt** | `0000FFF6-0000-1000-8000-00805F9B34FB` | Read | Station → App | Signed transaction receipt |

> This characteristic table is the **single source of truth**. All other documents referencing BLE characteristics MUST match this mapping.

### 8.4 Advertising

The station MUST include the following in BLE advertisements when `BLEAdvertisingEnabled = true`:

| AD Type | Field | Value |
|---------|-------|-------|
| `0x01` | Flags | General Discoverable, BR/EDR Not Supported |
| `0x09` | Complete Local Name | `OSPP-{station_id_last6}` (e.g., `OSPP-b2c3d4`) |
| `0x07` | Complete 128-bit Service UUID | `0000FFF0-0000-1000-8000-00805F9B34FB` |
| `0xFF` | Manufacturer Specific Data | `{company_id}{station_id_bytes}{bay_count}{firmware_version}` |

The advertising interval MUST be configurable via the `BLEAdvertisingInterval` configuration key (default: 200ms).

The TX power MUST be configurable via the `BLETxPower` configuration key (default: 4 dBm, range: -20 to +10 dBm).

### 8.5 MTU Negotiation

After BLE connection is established, the app SHOULD request an MTU of **247 bytes**. The effective payload per ATT write/notification is `MTU - 3` = 244 bytes (3 bytes for ATT header).

If MTU negotiation fails or yields a lower value, the fragmentation protocol (Section 8.6) MUST be used for messages exceeding the effective payload size.

### 8.6 Fragmentation Protocol

Messages written to FFF3 or notified on FFF4 that exceed the effective MTU payload MUST be fragmented:

| Fragment | Format |
|----------|--------|
| First | `{F:1/N}` + data bytes |
| Middle | `{F:M/N}` + data bytes |
| Last | `{F:N/N}` + data bytes |

Where `N` is the total number of fragments and `M` is the current fragment number.

**Rules:**

- The receiver MUST buffer fragments until all `N` fragments are received.
- The receiver MUST reassemble fragments in order (1..N) before processing.
- If a fragment is not received within **5 seconds** of the previous fragment, the receiver MUST discard all buffered fragments for that message and MAY report an error.
- Fragment numbering starts at 1.

**Example:** A 600-byte JSON message with effective MTU payload of 244 bytes:

```
Fragment 1: {F:1/3}{"type":"OfflineAuthRequest","offlinePass":{"pass_id":"opass_a8b9c0...
Fragment 2: {F:2/3}...d1","sub":"sub_xyz789","device_id":"device_uuid","issued_at":"2026-...
Fragment 3: {F:3/3}...:"ECDSA-P256-base64"}}
```

### 8.7 BLE Connection Flow

```
Mobile App (Central)                            Station (Peripheral)
       │                                               │
       │  ┌──────────────────────────────┐             │
       │  │ Station is advertising:      │             │
       │  │ OSPP-b2c3d4, UUID=FFF0      │             │
       │  └──────────────────────────────┘             │
       │                                               │
       │──── BLE Scan (filter: UUID=FFF0) ────────────>│
       │<─── Advertisement discovered ─────────────────│
       │                                               │
       │──── BLE Connect ─────────────────────────────>│
       │<─── Connection established ───────────────────│
       │                                               │
       │──── MTU Request (247 bytes) ─────────────────>│
       │<─── MTU Response ─────────────────────────────│
       │                                               │
       │──── Read FFF1 (Station Info) ────────────────>│
       │<─── {stationId, firmware, connectivity, ...} ─│
       │                                               │
       │──── Read FFF2 (Available Services) ──────────>│
       │<─── {bays: [{bayId, services, prices, ...}]} ─│
       │                                               │
       │  [App verifies station identity]               │
       │  [App checks bay availability]                 │
       │                                               │
       │──── Write FFF3: Hello {appNonce, appVersion} ─>│
       │<─── Notify FFF4: Challenge {stationNonce, ...} │
       │                                               │
       │  [Handshake continues — see Offline Profile]   │
       │                                               │
```

### 8.8 BLE Security

#### 8.8.1 Link-Layer Encryption

The station MUST require **LE Secure Connections** (LESC) for all BLE connections. LESC provides:

- **ECDH P-256** key exchange (Elliptic Curve Diffie-Hellman)
- **AES-CCM** (128-bit) link-layer encryption
- **MITM protection** via Numeric Comparison or Passkey Entry pairing

The station SHOULD use **Just Works** pairing for minimal user friction, with application-layer authentication (OfflinePass) providing the security guarantee. Numeric Comparison MAY be used for higher-security environments.

#### 8.8.2 Application-Layer Security

BLE link encryption alone is insufficient for OSPP. The protocol provides additional security at the application layer:

| Mechanism | Purpose |
|-----------|---------|
| **OfflinePass** (ECDSA P-256) | Server-signed credential authorizing offline service delivery |
| **Session Key** (HKDF-SHA256) | Derived from LTK + nonces, used for BLE application-layer payload encryption. Station and mobile derive a shared session key via HKDF; all BLE payloads after handshake **MUST** be encrypted with AES-256-GCM using this key. |
| **Receipt** (ECDSA-P256-SHA256) | Station-signed proof of service delivery |

See [Offline Profile — BLE Handshake](profiles/offline/ble-handshake.md) for the full authentication flow.

#### 8.8.3 Bonding

Bonding (storing pairing keys for reconnection) is OPTIONAL. The station MAY support bonding for faster reconnection, but MUST NOT require it. Each BLE session MUST perform a fresh handshake (HELLO/CHALLENGE) regardless of bonding state, because the OfflinePass and nonces change per session.

### 8.9 BLE Connection Management

| Scenario | Station Behavior |
|----------|-----------------|
| BLE connection drops during handshake | Clean up handshake state, ready for new connection |
| BLE connection drops during active service | Service continues on local timer, auto-stops on expiry |
| App does not read receipt within 5 min | Receipt retained for next BLE connection |
| Multiple apps try to connect simultaneously | Accept first connection, reject subsequent until first disconnects (when `MaxConcurrentBLEConnections = 1`) |
| Station receives Hello while in handshake | Abort current handshake, start new one |

### 8.10 BLE Configuration Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `BLEAdvertisingEnabled` | boolean | `true` | Master switch for BLE |
| `BLETxPower` | integer (dBm) | `4` | TX power (-20 to +10) |
| `BLEAdvertisingInterval` | integer (ms) | `200` | Advertising interval |
| `OfflineModeEnabled` | boolean | `true` | Accept offline sessions via BLE |
| `MaxConcurrentBLEConnections` | integer | `1` | Max simultaneous BLE clients (1–3) |

### 8.11 Fallback Behavior

When the station has both MQTT and BLE available:

- **MQTT is always preferred** for server-mediated flows (online sessions, web payments).
- **BLE is used only** when the phone or station (or both) cannot reach the server.
- The **ConnectivityDetector** (app-side) determines which flow to use based on the phone's network state and the station's `stationConnectivity` field from the BLE Challenge message.

| Phone | Station | Flow | Transport |
|-------|---------|------|-----------|
| Online | Online | Online | MQTT (via server) |
| Online | Offline | Partial A | HTTPS (auth) + BLE (delivery) |
| Offline | Online | Partial B ¹ | BLE (auth) + MQTT (validation) |
| Offline | Offline | Full Offline | BLE only |

> ¹ **Partial B** is REQUIRED only at **Complete** compliance level. For Extended compliance, this scenario falls back to Full Offline (OfflinePass validated locally).

---

## 9. HTTPS Transport (Server ↔ Clients)

OSPP does not normatively define the HTTPS API between the server and end-user clients (mobile app, web payment page), as this is implementation-specific. However, the following transport-level requirements apply to any OSPP-compliant server that exposes an HTTP API.

### 9.1 General Requirements

| Parameter | Requirement |
|-----------|-------------|
| **Protocol** | HTTPS (TLS 1.2+ REQUIRED, TLS 1.3 RECOMMENDED) |
| **Content-Type** | `application/json` for all request and response bodies |
| **Character encoding** | UTF-8 |
| **API versioning** | URL path prefix: `/api/v1/` |
| **Timestamps** | ISO 8601 UTC with milliseconds (e.g., `2026-01-30T12:00:00.000Z`) |

### 9.2 Authentication

OSPP defines three authentication methods for HTTPS channels:

#### 9.2.1 Mobile App — JWT Bearer

| Parameter | Value |
|-----------|-------|
| **Header** | `Authorization: Bearer {access_token}` |
| **Token format** | JWT (ES256) |
| **Access token TTL** | 15 minutes |
| **Refresh token TTL** | 30 days (one-time-use, server-side stored, revocable) |
| **Token payload** | `{sub, email, iat, exp}` |

The server MUST reject expired tokens with HTTP `401`. The client SHOULD transparently refresh the access token using the refresh token before it expires.

#### 9.2.2 Web Payment — Session Token

| Parameter | Value |
|-----------|-------|
| **Transport** | Session token (UUID v4) embedded in URL path |
| **Storage** | Server-side only (Redis with TTL) — no cookies, no localStorage |
| **TTL** | 10 minutes |
| **Scope** | Single payment session (one bay, one service) |

The session token is generated when the user initiates a payment and included in all subsequent polling URLs:

```
GET /pay/sessions/{sessionToken}/status
```

This approach avoids cookies and localStorage for GDPR compliance and simplicity.

#### 9.2.3 Station REST Fallback — mTLS

For the rare case where a station needs to communicate with the server via HTTPS instead of MQTT (e.g., offline transaction sync when MQTT is unavailable but HTTPS is reachable):

| Parameter | Value |
|-----------|-------|
| **Authentication** | mTLS — same X.509 client certificate used for MQTT |
| **Endpoints** | Limited: offline-txs sync, config fetch |

### 9.3 Idempotency

Mutating endpoints (POST for session start, top-up, etc.) SHOULD support idempotency via the `Idempotency-Key` header:

```
POST /api/v1/sessions/start
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

The server MUST store the response for a given `Idempotency-Key` and return the same response on duplicate requests. The key MUST be a UUID v4. The server SHOULD retain idempotency keys for at least **24 hours**.

### 9.4 Request Tracing

The server MUST include an `X-Request-Id` header (UUID v4) in all API responses:

```
HTTP/1.1 200 OK
X-Request-Id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Content-Type: application/json
```

If the client sends an `X-Request-Id` header in the request, the server SHOULD echo it back. Otherwise, the server generates a new one.

### 9.5 Rate Limiting

The server SHOULD implement rate limiting on all public-facing endpoints. Recommended limits:

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Authentication (login, signup) | 10 requests | 1 minute |
| Session operations | 30 requests | 1 minute |
| Wallet operations | 20 requests | 1 minute |
| Web payment initiation | 5 sessions | 30 minutes per IP |

When rate limited, the server MUST respond with HTTP `429 Too Many Requests` and SHOULD include a `Retry-After` header (seconds).

### 9.6 Webhook Transport (Payment Processor → Server)

Payment processor notifications are received via HTTPS webhooks:

| Parameter | Value |
|-----------|-------|
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Signature** | HMAC-SHA256 or HMAC-SHA512 in the processor-specific signature header (e.g., `X-PG-Signature`, `Stripe-Signature`). The server **MUST** verify the signature using the shared secret for the configured payment processor. |
| **Verification** | Timing-safe comparison of computed HMAC against header value |
| **IP whitelist** | RECOMMENDED — only accept webhooks from known processor IP ranges |
| **Idempotency** | Server MUST handle duplicate webhook deliveries (use `paymentId` for dedup) |
| **Response** | HTTP `200` on success, HTTP `5xx` to request retry |

**Webhook verification sequence:**

```
Payment Processor                                 OSPP Server
       │                                               │
       │──── POST /webhooks/{processor}/payment ──────>│
       │     Headers:                                   │
       │       X-PG-Signature: {hmac-sha512}             │
       │       Content-Type: application/json            │
       │     Body: {paymentId, status, amount, ...}     │
       │                                               │
       │     ┌──────────────────────────────────────┐   │
       │     │ Server:                              │   │
       │     │ 1. Verify IP whitelist               │   │
       │     │ 2. Compute HMAC-SHA512 of body       │   │
       │     │ 3. Timing-safe compare with header   │   │
       │     │ 4. Deduplicate by paymentId          │   │
       │     │ 5. Process payment status change     │   │
       │     └──────────────────────────────────────┘   │
       │                                               │
       │<─── HTTP 200 OK ──────────────────────────────│
       │                                               │
```

---

## 10. Payload Encoding

All OSPP transports use **JSON** as the serialization format.

### 10.1 JSON Encoding Rules

| Rule | Requirement |
|------|-------------|
| Character encoding | UTF-8 (MUST) |
| Whitespace | Compact format — no unnecessary whitespace (SHOULD for MQTT, MUST for BLE) |
| Null fields | Absent fields are treated as null. Implementations SHOULD omit null-valued optional fields. |
| Unknown fields | Receivers MUST ignore unknown fields (forward compatibility) |
| Numeric precision | Integer values only for credits, durations, and timestamps. No floating point. |
| String encoding | JSON string escaping per [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) |

### 10.2 Maximum Payload Size

| Transport | Max Payload | Typical Size |
|-----------|-------------|--------------|
| MQTT | 64 KB (MQTT Maximum Packet Size) | 200–500 bytes |
| BLE | Limited by MTU; fragmented if needed | 50–800 bytes |
| HTTPS | No protocol limit; server MAY enforce 1 MB | Varies |

### 10.3 Timestamp Format

All timestamps MUST use **ISO 8601** format with **millisecond precision** and **UTC timezone**:

```
2026-01-30T12:00:00.000Z
```

- The `Z` suffix (UTC) is REQUIRED. Local timezone offsets MUST NOT be used.
- Millisecond precision (3 decimal places) is REQUIRED, even if the value is `.000`.
- Stations MUST synchronize their clock using the `serverTime` field from Heartbeat responses. Clock drift exceeding **5 seconds** SHOULD trigger a warning log.

---

## 11. Error Scenarios Summary

| Scenario | Transport | Detection | Recovery |
|----------|-----------|-----------|----------|
| MQTT broker unreachable | MQTT | TCP connect fails | Exponential backoff (Section 4.5) |
| TLS handshake fails | MQTT | TLS error | Log `1003`, retry with backoff |
| Certificate expired | MQTT | TLS error | Log `1004`, alert operator |
| CONNACK rejected | MQTT | MQTT reason code | Log reason, retry with backoff |
| MQTT connection lost | MQTT | PINGRESP timeout / TCP reset | Continue BLE, buffer messages, backoff |
| Keep-alive timeout (server side) | MQTT | No heartbeat for 3.5 × interval | Mark station offline, fire LWT |
| Message expired | MQTT | Message Expiry Interval | Discard, log warning |
| Invalid JSON received | MQTT / BLE | JSON parse error | Send ERROR message with `1005`, discard |
| Unknown action | MQTT / BLE | Action not recognized | Send ERROR message with `1006`, discard |
| Protocol version mismatch | MQTT | BootNotification Rejected | Log `1007`, station cannot operate |
| BLE scan timeout | BLE | No advertisement found in 30s | Return to IDLE, show error to user |
| BLE connection drops | BLE | GATT disconnect event | Service continues on timer; receipt retained |
| BLE fragment timeout | BLE | 5s without next fragment | Discard buffered fragments |
| BLE MTU too small for message | BLE | Message > MTU | Use fragmentation protocol (Section 8.6) |
| Webhook signature invalid | HTTPS | HMAC mismatch | Reject with HTTP `401`, log security event |
| Rate limited | HTTPS | Counter exceeded | Respond HTTP `429` with `Retry-After` |

---

## Appendix A. MQTT 5.0 Features Used by OSPP

| MQTT 5.0 Feature | OSPP Usage | Required? |
|-------------------|------------|-----------|
| Clean Start = false | Persistent sessions across reconnects | MUST |
| Session Expiry Interval | 1-hour session retention | MUST |
| Message Expiry Interval | Stale command expiry (30s–600s) | MUST |
| Will Delay Interval | 10s grace period for LWT | MUST |
| Shared Subscriptions | Server horizontal scaling | SHOULD (production) |
| Reason Codes | Structured error reporting in CONNACK/PUBACK | MUST |
| Maximum Packet Size | 64 KB limit negotiation | SHOULD |
| Receive Maximum | Flow control (10 in-flight messages) | SHOULD |
| Topic Alias | Bandwidth optimization for high-frequency topics (MeterValues, Heartbeat). Stations **MAY** negotiate topic aliases with the broker to reduce per-message overhead. | MAY |
| User Properties | Metadata propagation (e.g., correlation IDs, trace context) without modifying the JSON payload. Implementations **MAY** attach `X-Trace-Id` and `X-Correlation-Id` as User Properties. | MAY |
