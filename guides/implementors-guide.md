# OSPP Implementor's Guide

> **For:** Developers building OSPP-compatible stations, servers, or user agents
> **Level:** Practical guide, not formal spec. Read this first, then the spec chapters.
> **Spec Version:** 0.1.0-draft.1

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Implementing a Station (SSP)](#2-implementing-a-station-ssp)
3. [Implementing a Server](#3-implementing-a-server)
4. [Implementing a User Agent](#4-implementing-a-user-agent)
5. [Testing Your Implementation](#5-testing-your-implementation)
6. [Common Pitfalls](#6-common-pitfalls)
7. [Conformance Checklist](#7-conformance-checklist)

---

## 1. Getting Started

### What is OSPP?

OSPP (Open Self-Service Point Protocol) is a communication protocol between self-service stations (like self-service kiosks) and a central management server. Think of it as "OCPP but for self-service stations" — if you know OCPP from the EV charging world, the concepts will be familiar.

The protocol handles:
- **Station lifecycle** — boot, register, heartbeat, firmware updates
- **Sessions** — start/stop services, meter readings, billing
- **Payments** — credit-based (pre-paid wallet) and card-based (3D Secure)
- **Offline operation** — BLE-based sessions when internet is down
- **Security** — mTLS, HMAC message signing, signed receipts, offline pass validation

### The Three Actors

```
+----------+         MQTT/TLS 1.3        +----------+       HTTPS/JWT        +----------+
| Station  |<=========================>| Server   |<=====================>| App/Web  |
|  (SSP)   |                            |  (CSMS)  |                       |  (Agent) |
+----------+                            +----------+                       +----------+
     ^                                                                          |
     |                    BLE GATT (offline)                                     |
     +--------------------------------------------------------------------------+
```

**Station (SSP)** — The physical device. Has 1+ bays, each offering services (basic, standard, deluxe, etc.). Runs an embedded controller (ESP32, RPi, etc.). Communicates with the server over MQTT and with users over BLE.

**Server (CSMS)** — Central System Management Server. Manages stations, users, wallets, sessions, billing, and firmware. Exposes a REST API for user agents and communicates with stations over MQTT.

**User Agent** — The mobile app or web browser. Authenticated users use the app (JWT). Anonymous users use a web payment page (session token via QR code).

### Identity Model

Everything has a prefixed identifier:

| Entity | Pattern | Example |
|--------|---------|---------|
| Station | `stn_{uuid}` | `stn_a1b2c3d4` |
| Bay | `bay_{uuid}` | `bay_c1d2e3f4a5b6` |
| Service | `svc_{id}` | `svc_eco` |
| Session | `sess_{uuid}` | `sess_f7e8d9c0` |
| Reservation | `rsv_{uuid}` | `rsv_e5f6a7b8c9d0` |
| User | `sub_{id}` | `sub_alice2026` |
| Offline TX | `otx_{uuid}` | `otx_d4e5f6a7b8c9` |
| Offline Pass | `opass_{uuid}` | `opass_a8b9c0d1e2f3` |

### Message Model

OSPP has **39 messages** across two transports:

- **26 MQTT messages** — station-to-server and server-to-station
- **13 BLE messages** — app-to-station (offline)

Every MQTT message is wrapped in an **envelope**:

```json
{
  "messageId": "cmd_550e8400-e29b-41d4-a716-446655440000",
  "messageType": "Request",
  "action": "StartService",
  "timestamp": "2026-01-30T12:00:00.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": { },
  "mac": "Base64-HMAC-SHA256..."
}
```

Three message types:

| Type | Pattern | Correlation |
|------|---------|-------------|
| **REQUEST** | Sender expects a response | Matched by `messageId` |
| **RESPONSE** | Reply to a specific request | Uses same `messageId` as the request |
| **EVENT** | Fire-and-forget notification | No response expected |

### Compliance Levels

You don't have to implement everything. OSPP uses a **profile** system:

| Level | Profiles | What You Get |
|-------|----------|-------------|
| **Core** | Core + Transaction + Security | Online sessions, payments, basic security |
| **Full** | Core + Device Management | + remote config, firmware updates, diagnostics |
| **Offline** | Full + Offline/BLE | + BLE offline sessions, OfflinePass, receipts |

Most implementations should target **Full**. Add **Offline** if your stations operate in areas with unreliable internet.

### Before You Start

Make sure you understand:

1. **MQTT 5.0** — Not 3.1.1. You need MQTT 5.0 features (message expiry, session expiry, will delay interval). If you haven't used MQTT before, read [the OASIS spec](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html) or a good tutorial.

2. **TLS 1.3 with mutual authentication (mTLS)** — Both the station and broker present certificates. The broker's ACL uses the station's certificate CN for topic authorization.

3. **BLE GATT** (if implementing Offline) — The station is a BLE peripheral with 6 characteristics. The app is a BLE central.

4. **JSON Schema 2020-12** — All message payloads have formal schemas in `/schemas/`. Use them for validation.

### Key Spec Chapters

| Chapter | What It Covers | Read When |
|---------|---------------|-----------|
| [02 — Transport](../spec/02-transport.md) | MQTT topics, QoS, TLS, BLE, envelope | First |
| [03 — Messages](../spec/03-messages.md) | All 39 messages with field definitions | When implementing each message |
| [04 — Flows](../spec/04-flows.md) | 12 end-to-end protocol flows | When implementing each flow |
| [06 — Security](../spec/06-security.md) | Crypto, HMAC, OfflinePass, receipts | Before writing any crypto code |
| [07 — Errors](../spec/07-errors.md) | 102 error codes, retry policies, circuit breaker | When implementing error handling |

---

## 2. Implementing a Station (SSP)

### 2.1 Hardware Requirements

A station needs:

- **Network connectivity** — Ethernet (preferred), WiFi, or cellular for MQTT
- **BLE 4.2+** (recommended 5.0+) — For offline mode. LE Secure Connections (LESC) is REQUIRED
- **Secure storage (NVS)** — For TLS certificates, ECDSA private keys, configuration
- **Real-time clock** — Accuracy matters for OfflinePass validation (synced via Heartbeat)
- **1+ bays** — Each bay has relay-controlled services (pumps, valves, etc.)
- **Meter hardware** — Liquid flow, electricity, consumable dispensing (for MeterValues)

### 2.2 Provisioning (One-Time Setup)

Before a station can connect, it needs to be provisioned:

1. Admin registers the station in the management portal → gets a provisioning token (24h TTL, single-use)
2. Station powers on, detects "not provisioned" state (no certs in NVS)
3. Station generates:
   - **TLS key pair** (ECDSA P-256) + Certificate Signing Request (CSR)
   - **ECDSA P-256 key pair** for receipt signing (private key NEVER leaves the device)
4. Station calls `POST /api/v1/stations/provision` with the token, serial number, CSR, and receipt public key
5. Server returns: `stationId`, `bayIds[]`, signed TLS certificate, CA certificate, ECDSA P-256 server verify key, MQTT config
6. Station stores everything in NVS, reboots, proceeds to boot flow

**Key rule:** The TLS private key and ECDSA receipt-signing private key are generated ON the station and never transmitted. The server only receives the public keys (CSR and receipt verify key).

#### Provisioning Checklist

Before a station can boot successfully, ensure:

- [ ] `stationId` allocated and registered in the management portal
- [ ] TLS certificate generated (on-device CSR) and signed by the operator CA
- [ ] Network configuration loaded (WiFi SSID/password or cellular APN)
- [ ] MQTT broker URL configured (`mqtts://{broker}:8883`)
- [ ] CA chain installed in secure storage
- [ ] Firmware version verified (matches expected release)
- [ ] Server pre-registration complete (or zero-touch policy enabled)

#### Recommended Provisioning Methods

| Context | Recommended Method |
|---------|-------------------|
| Factory / mass production | SD card or firmware image with embedded config |
| Field installation | BLE provisioning mode (dedicated GATT service) |
| Development / testing | USB serial or JTAG |
| Replacement unit | Clone config from old unit (new certificate required — private keys are non-exportable) |

See [Chapter 01 — Architecture](../spec/01-architecture.md), §7 for the full provisioning lifecycle specification.

### 2.3 Boot Sequence

Every time the station powers on (or reconnects after a disconnect):

```
Power on
  → Hardware init (relays, pumps, meters self-test)
  → BLE init → start advertising as "OSPP-{station_id_last6}"   ← BLE BEFORE MQTT
  → Load TLS certs from NVS
  → MQTT CONNECT to broker (mTLS, port 8883)
    - Clean Start = false
    - Session Expiry = 3600s
    - Keep Alive = 30s
    - Client ID = "stn_{station_id}"
    - Configure LWT (ConnectionLost message)
  → SUBSCRIBE to "ospp/v1/stations/{station_id}/to-station" (QoS 1)
  → PUBLISH BootNotification REQUEST
  → Wait for RESPONSE (30s timeout)
    - Accepted → sync clock, store sessionKey, apply config
    - Rejected → station stays in **limited mode** (no commands accepted except BootNotification); wait retryInterval, retry
    - Pending → station MUST NOT send any messages other than BootNotification retries; wait retryInterval, re-send BootNotification. Normal operation begins only after receiving `Accepted`
    - Timeout → wait 60s, retry
  → PUBLISH StatusNotification for EACH bay
  → Start heartbeat timer
  → Enter normal operation
```

**Critical rules:**
- BLE advertising starts BEFORE MQTT connection (users can browse even while MQTT connects)
- Do NOT process any commands until BootNotification is accepted. Queue them (max 10 pending commands). If queue overflows, reject with `6001 SERVER_INTERNAL_ERROR`.
- The `sessionKey` from the server response is your HMAC-SHA256 signing key for this session. Store it in RAM only.

### 2.4 MQTT Connection Details

**Two topics per station:**

```
ospp/v1/stations/{station_id}/to-server   ← you PUBLISH here
ospp/v1/stations/{station_id}/to-station  ← you SUBSCRIBE here
```

The `v1` is a namespace identifier, not the protocol version. It stays `v1` for all OSPP 1.x.

**QoS:** Always QoS 1. Never QoS 0 (unreliable) or QoS 2 (unnecessary overhead).

**Retain flag:** Always `false`. No retained messages.

**Rate limiting:** Broker SHOULD enforce per-client rate limits: max **100 PUBLISH per minute** per station. This default assumes ≤4 bays with standard `MeterValuesInterval` (15s). Operators deploying stations with more bays or `MeterValuesInterval` below 10s SHOULD increase this limit proportionally (recommended formula: `bays × 60/MeterValuesInterval + 20` overhead). Station implements exponential backoff on repeated failures (initial 1s, max 60s, ±20% jitter).

**Message deduplication:** You MUST maintain a set of recently seen `messageId` values (at least 1000 IDs or 1 hour). If you see a duplicate REQUEST, re-send your cached RESPONSE. Don't re-process it.

**Last Will and Testament (LWT):**

Configure at CONNECT time:

```json
{
  "messageId": "lwt-stn_a1b2c3d4",
  "messageType": "Event",
  "action": "ConnectionLost",
  "timestamp": "...",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "reason": "UnexpectedDisconnect"
  }
}
```

LWT is exempt from HMAC signing (no session key at CONNECT time). Set Will Delay Interval to 10s to avoid false triggers on brief network blips.

### 2.5 Message Signing (HMAC-SHA256)

HMAC-SHA256 signing is controlled by the `MessageSigningMode` configuration key. Three modes are defined:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `None` | No HMAC signing | Development/testing only |
| `Critical` **(default)** | HMAC on security-sensitive messages only (31 of 46) | Production deployments |
| `All` | HMAC on all messages (except BootNotification REQUEST and LWT) | High-security deployments |

The default mode `Critical` signs only security-sensitive messages (31 of 46). Non-critical messages like Heartbeat, MeterValues, and StatusNotification are exempt unless mode is set to `All`. BootNotification REQUEST and ConnectionLost (LWT) are always exempt regardless of mode.

When HMAC is required for a message, include a `mac` field:

```
1. Build your message JSON (without the `mac` field)
2. Sort all keys alphabetically, recursively (nested objects too)
3. Serialize as compact JSON (no whitespace)
4. Encode as UTF-8 bytes
5. mac = Base64(HMAC-SHA256(sessionKey, utf8_bytes))
6. Add the `mac` field to your message
```

**On receiving a message:**

```
1. Extract and remove the `mac` field
2. Compute canonical form (sorted keys, compact JSON, UTF-8)
3. Compute expected_mac = HMAC-SHA256(sessionKey, canonical_bytes)
4. Compare using CONSTANT-TIME comparison (not ==)
5. If mismatch → reject, send SecurityEvent
```

The constant-time comparison is critical. Use `crypto.timingSafeEqual()` in Node.js, `hmac.compare_digest()` in Python, or equivalent.

### 2.6 Bay and Session Lifecycle

Each bay has a state machine:

```
Unknown (power-on / reboot / ConnectionLost)
    ↓
Available → Reserved → Occupied → Finishing → Available
    ↓                      ↓
 Faulted              Faulted
    ↓
Unavailable (maintenance)

Any state → Unknown (on ConnectionLost LWT)
```

**Unknown** is the initial state after power-on, reboot, or when the server receives a ConnectionLost LWT. Transitions: Unknown → Available (healthy boot), Unknown → Faulted (fault detected), Unknown → Unavailable (maintenance mode). All bays transition to Unknown when the server receives a ConnectionLost event.

When you receive a **StartService REQUEST**:

1. Validate the bay is Available (or Reserved with matching `reservationId`)
2. Activate the hardware (relay on, pump starts)
3. Start the session timer for `durationSeconds`
4. Send StartService RESPONSE with `status: "Accepted"`
5. Send StatusNotification EVENT (`status: "Occupied"`)
6. Send periodic MeterValues EVENTs (default every 15s)
7. When timer expires or StopService arrives:
   - Deactivate hardware
   - Send StopService RESPONSE with actual duration, credits charged, meter values
   - Send StatusNotification `Finishing` (wind-down cycle, actuator retraction)
   - Send StatusNotification `Available` (ready for next user)

**If the station rejects** (bay busy, hardware fault), send RESPONSE with `status: "Rejected"` and the error code. The server will refund the user.

### 2.7 Handling Disconnects

If MQTT drops during an active session:

1. **Do NOT stop the hardware.** The service continues.
2. Switch to BLE-available mode (accept offline sessions)
3. Buffer outbound messages (StatusNotification, MeterValues) — minimum 100 messages or 64 KB (absolute hardware minimum)
4. Attempt reconnection with exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max, with 30% jitter
5. On reconnect: Full boot sequence (BootNotification, StatusNotification per bay)
6. Flush buffered messages after boot completes

### 2.8 Offline Mode (BLE)

If your station supports the Offline profile, you need a BLE GATT service:

**Service UUID:** `0000FFF0-0000-1000-8000-00805F9B34FB`

| Characteristic | UUID | Properties | Purpose |
|----------------|------|------------|---------|
| Station Info | FFF1 | Read | Identity, firmware, connectivity status |
| Available Services | FFF2 | Read | Service catalog with prices per bay |
| TX Request | FFF3 | Write | All app-to-station messages |
| TX Response | FFF4 | Notify | All station-to-app responses |
| Service Status | FFF5 | Notify | Real-time session progress |
| Receipt | FFF6 | Read | Signed transaction receipt |

**The BLE session flow:**

```
App reads FFF1 (StationInfo) → confirms station identity
App reads FFF2 (AvailableServices) → shows catalog to user
App writes FFF3: Hello {deviceId, appNonce}
Station notifies FFF4: Challenge {stationNonce, stationConnectivity}
App writes FFF3: OfflineAuthRequest {offlinePass, counter, sessionProof}
  → Station validates OfflinePass (10 checks)
Station notifies FFF4: AuthResponse {result: "Accepted"}
App writes FFF3: StartServiceRequest {bayId, serviceId, duration}
Station notifies FFF4: StartServiceResponse {sessionId, offlineTxId}
  → Station notifies FFF5 periodically: ServiceStatus {elapsed, remaining, meters}
App writes FFF3: StopServiceRequest (or timer expires)
Station notifies FFF4: StopServiceResponse {duration, credits}
  → Station signs receipt (ECDSA P-256), increments txCounter
Station notifies FFF5: ServiceStatus {status: "ReceiptReady"}
App reads FFF6: Receipt {receipt, txCounter}
```

### 2.9 sessionProof Computation

Before validating the OfflinePass, the station **MUST** verify the `sessionProof` field. Both the app and station compute it independently using the BLE SessionKey (from HKDF, see `spec/06-security.md` §6.5):

```
sessionProof = HMAC-SHA256(
  key:  SessionKey,
  data: UTF8(passId) || "|" || BE32(counter) || "|" || UTF8(bayId) || "|" || UTF8(serviceId)
)
```

- `BE32` = big-endian 32-bit unsigned integer (4 bytes)
- `||` = byte concatenation, `|` = literal pipe (0x7C)
- Output: hex-encoded lowercase, 64 characters

If the proof doesn't match, reject immediately — it means the sender didn't participate in the BLE handshake. See `spec/06-security.md` §6.5.1 for the full normative formula, pseudocode, and test vector.

### 2.10 OfflinePass Validation (10 Checks)

When you receive an OfflineAuthRequest, validate the OfflinePass in this order:

| # | Check | Reject Code | What to Verify |
|:-:|-------|:-----------:|----------------|
| 1 | Signature | `2002` | ECDSA P-256 signature valid against `OfflinePassPublicKey` (cached previous key also accepted during the grace period) |
| 2 | Expiry | `2003` | `expiresAt` is in the future |
| 3 | Epoch | `2004` | `revocationEpoch` >= your station's configured `RevocationEpoch` |
| 4 | Device | `2002` | `deviceId` matches the `deviceId` from the Hello message |
| 5 | Station | `2006` | If pass has a station allowlist, your station is in it (OFFLINE_STATION_MISMATCH) |
| 6 | Uses | `4002` | This pass hasn't exceeded `maxUses` on your station |
| 7 | Total credits | `4002` | Cumulative credits from this pass haven't exceeded `maxTotalCredits` |
| 8 | Per-TX credits | `4004` | Requested service cost <= `maxCreditsPerTx` |
| 9 | Interval | `4003` | Time since last TX from this pass >= `minIntervalSec` |
| 10 | Counter | `2005` | `counter` > last seen counter for this pass on your station |

**Stop at the first failure.** Don't reveal which checks passed.

You need to persist (in flash/NVS):
- Per-pass usage counters (uses, total credits, last counter, last timestamp)
- Your station's `RevocationEpoch` value
- The server's ECDSA P-256 verify key (`OfflinePassPublicKey`)

### 2.11 Receipt Signing

After an offline session completes, sign a receipt:

```
1. Build receipt fields:
   {offlineTxId, bayId, serviceId, startedAt, endedAt,
    durationSeconds, creditsCharged, meterValues}

2. Canonical JSON (sorted keys, compact, no whitespace)

3. Base64-encode the canonical JSON → this is receipt.data

4. SHA-256 hash the Base64 string

5. ECDSA P-256 Sign(station_private_key, sha256_digest)

6. Base64-encode the signature → this is receipt.signature

7. Return:
   {
     "data": "<base64 canonical JSON>",
     "signature": "<base64 ECDSA signature>",
     "signatureAlgorithm": "ECDSA-P256-SHA256"
   }
```

### 2.12 Transaction Counter

Each offline transaction has a monotonically increasing `txCounter`:

```
txCounter: monotonically increasing integer (1, 2, 3, ...)

Each transaction increments txCounter by exactly 1.
The server detects gaps during reconciliation (e.g., 3 -> 5 = missing transaction).
```

This is append-only. If anyone removes transactions, the server will detect gaps in the txCounter sequence during reconciliation (fraud score +0.30).

### 2.13 Configuration Keys

Your station should support at least these configuration keys (managed via ChangeConfiguration). ChangeConfiguration sends a `keys` array (1–20 entries) and expects an atomic response: apply ALL or NONE. This is critical for correlated settings like `OfflinePassPublicKey` + `RevocationEpoch` which must change together to avoid inconsistent state.

Supported keys:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `HeartbeatIntervalSeconds` | int (seconds) | 30 | How often to send Heartbeat |
| `MeterValuesInterval` | int (seconds) | 15 | How often to send MeterValues during session |
| `MaxSessionDurationSeconds` | int (seconds) | 600 | Maximum allowed session duration |
| `ReservationDefaultTTL` | int (seconds) | 180 | Reservation expiry |
| `OfflineModeEnabled` | bool | true | Accept BLE offline sessions |
| `BLEAdvertisingEnabled` | bool | true | Master BLE switch |
| `BLETxPower` | int (dBm) | 4 | TX power (-20 to +10) |
| `RevocationEpoch` | int | 0 | Minimum accepted OfflinePass epoch |
| `MaxConcurrentBLEConnections` | int | 1 | Simultaneous BLE connections (1-3) |
| `MessageSigningMode` | string | `"Critical"` | HMAC signing: `"All"`, `"Critical"`, or `"None"` |
| `LogLevel` | string | `"Info"` | Log verbosity: `"Debug"`, `"Info"`, `"Warn"`, `"Error"` |

Respond to GetConfiguration with the current values of all known keys. Unknown keys go in the `unknownKeys` array.

### 2.14 Firmware Updates

When you receive an UpdateFirmware REQUEST:

1. ACK immediately with RESPONSE `Accepted`
2. Download the firmware from the provided URL (HTTPS)
3. Send FirmwareStatusNotification EVENTs as you progress: `Downloading` (with percent), `Downloaded`, `Installing`, `Installed` (or `Failed`)
4. Verify the SHA-256 checksum before installing
5. Verify the ECDSA P-256 firmware signature against the trusted Firmware Signing Certificate (see `spec/06-security.md` §4.6). If signature verification fails, reject the update and report `5112 FIRMWARE_SIGNATURE_INVALID`
6. Compare the offered `firmwareVersion` against the currently installed version. If the offered version is older and `forceDowngrade` is not `true`, reject with `5016 VERSION_ALREADY_INSTALLED` and log a `FirmwareDowngradeAttempt` SecurityEvent (see `spec/06-security.md` §4.6.1)
7. Use A/B partitioning if possible — write to inactive partition, boot into it, and if the new firmware fails to send BootNotification within 5 minutes, auto-rollback to the previous partition
8. If firmware installation fails AND rollback also fails, station enters `Faulted` state, emits SecurityEvent `FirmwareIntegrityFailure` (Critical), and requires manual intervention via physical access

> This value accounts for boot sequence (~60s), local health check (~120s), and network reconnection margin (~120s).

### 2.15 Certificate Renewal

OSPP supports in-protocol certificate renewal so stations can obtain new TLS certificates without physical access. This is inspired by OCPP 2.0.1 Security Profile 3 certificate management.

**When to renew:** Check your certificate expiry daily. When within `CertificateRenewalThresholdDays` (default 30, configurable 7–90) of expiry, initiate renewal automatically.

**Station-initiated renewal flow:**

1. Generate a new ECDSA P-256 keypair **on-device** (the private key MUST NOT leave the station)
2. Create a PKCS#10 CSR with Subject CN = `stn_{station_id}`
3. Send SignCertificate REQUEST [MSG-022] with the CSR
4. Server responds with `Accepted` or `Rejected`
5. If accepted, wait for CertificateInstall REQUEST [MSG-023] from the server (contains signed cert + CA chain)
6. Validate the certificate chain (chain → trusted CA, CN matches your station ID, key usage correct)
7. Install to secure element, TPM, or encrypted NVS
8. Update `CertificateSerialNumber` configuration key
9. Use the new certificate on the next TLS reconnection

**Server-triggered renewal:** The server can send TriggerCertificateRenewal [MSG-024] at any time. Respond with `Accepted` and start step 1 above.

**Keep the old certificate** until the new one is successfully used for a TLS connection. If the new certificate fails, fall back to the old one.

**Error handling:**

| Scenario | Action |
|----------|--------|
| CSR rejected | Retry once after 60s. If still rejected, log SecurityEvent (`CertificateError`) |
| Certificate chain invalid | Respond `Rejected` to CertificateInstall, continue using current cert |
| Cannot generate keypair | Reject TriggerCertificateRenewal with `4014 KEYPAIR_GENERATION_FAILED`, log SecurityEvent (`HardwareFault`) |
| Certificate expired (too late) | Enter offline-only mode (BLE). Recovery via server-triggered renewal or re-provisioning |

See `spec/06-security.md` §4.7 and `spec/profiles/security/certificate-renewal.md` for the full specification.

### 2.16 DataTransfer (Vendor Extensibility)

DataTransfer [MSG-025] is the protocol's extensibility mechanism. It lets stations and servers exchange vendor-specific data without modifying the core protocol.

**When to use:**
- Custom device diagnostics (temperature, uptime, hardware revisions)
- Vendor-specific commands (LED control, display messages, peripheral management)
- Proprietary reporting or analytics
- Feature flags and A/B testing

**When NOT to use:**
- Anything related to billing or payments (use TransactionEvent)
- Session lifecycle (use StartService / StopService)
- Configuration (use ChangeConfiguration)
- Security-critical operations (use dedicated security messages)

**Implementation:**

```
Station/Server sends DataTransfer REQUEST:
  vendorId: "YourCompany"   ← identifies your vendor namespace
  dataId:   "GetStats"      ← identifies the command/data type
  data:     { ... }         ← your custom JSON payload (optional)

Receiver responds:
  status: "Accepted" | "Rejected" | "UnknownVendor" | "UnknownData"
  data:   { ... }           ← your custom response (optional)
```

**Key rules:**
- DataTransfer is bidirectional — both station and server can initiate
- The `data` field MUST NOT exceed **64 KB** when JSON-serialized. Payloads exceeding this limit are rejected.
- Both station and server SHOULD rate-limit DataTransfer to max **10 per minute per vendor**
- `UnknownVendor` / `UnknownData` are status values, not error codes
- NOT signed in `Critical` HMAC mode (vendor data is not critical by default). Signed in `All` mode.
- Idempotency is vendor-defined — the protocol does not enforce deduplication
- Timeout: 30 seconds

### 2.17 TriggerMessage (On-Demand Messaging)

TriggerMessage [MSG-026] lets the server request the station to send a specific message immediately, bypassing the normal schedule.

**Triggerable messages:**

| Message | Typical Use Case |
|---------|-----------------|
| `BootNotification` | Re-identify station after server migration |
| `StatusNotification` | On-demand bay status check (with optional `bayId`) |
| `MeterValues` | Real-time meter reading outside normal interval (requires active session) |
| `Heartbeat` | Verify station responsiveness |
| `DiagnosticsNotification` | Check status of ongoing diagnostics upload |
| `FirmwareStatusNotification` | Check status of ongoing firmware update |
| `SecurityEvent` | Force security audit event |
| `SignCertificate` | Trigger certificate renewal (alternative to TriggerCertificateRenewal) |

**Implementation:**

1. Server sends TriggerMessage REQUEST with `requestedMessage` (and optional `bayId`)
2. Station responds: `Accepted`, `Rejected`, or `NotImplemented`
3. If `Accepted`, station MUST send the requested message within **5 seconds**

**Key rules:**
- `NotImplemented` means the station doesn't support triggering this message type — it's a status value, not an error code
- `Rejected` if the request doesn't make sense (e.g., `MeterValues` with no active session)
- Server SHOULD NOT send more than **1 TriggerMessage per action type per 30-second window**
- Signed in both `Critical` and `All` HMAC modes (server command)
- Timeout: 10 seconds

---

## 3. Implementing a Server

### 3.1 Architecture Overview

The server sits in the middle of everything:

```
Stations (MQTT) ←→ Server ←→ Mobile App (REST)
                      ↕
                Payment Gateway (Webhooks)
              Web Payment (REST)
```

You need:
- **MQTT client** — Subscribe to all station messages, publish commands
- **REST API** — For mobile app and web payment flows
- **Webhook endpoint** — For payment processor callbacks
- **Database** — Stations, users, wallets, sessions, transactions
- **Message queue** (optional) — For async processing of station messages

### 3.2 MQTT Setup

**Subscribe to all station messages using shared subscriptions:**

```
$share/ospp-servers/ospp/v1/stations/+/to-server
```

The `$share/ospp-servers/` prefix enables horizontal scaling — multiple server instances share the subscription, and the broker distributes messages across them.

**Publish commands to specific stations:**

```
ospp/v1/stations/{station_id}/to-station
```

**Connect with server credentials** (not mTLS like stations — the server uses username/password or a server certificate):

```
Client ID: csms-{instance-id}
Clean Start: true (server is stateless)
QoS: 1 (always)
```

### 3.3 Station Lifecycle Management

**On BootNotification REQUEST:**

1. Look up the station by `stationId`
2. If unknown → respond `Rejected` with error `2001 STATION_NOT_REGISTERED`
3. Validate protocol version compatibility
4. Generate a 32-byte random session key (for HMAC signing)
5. Respond `Accepted` with:
   - `serverTime` (ISO 8601 UTC) — station syncs its clock to this
   - `heartbeatIntervalSec` (default 30s)
   - `sessionKey` (Base64-encoded) — station uses this for HMAC-SHA256
   - Optional `configuration` overrides (key-value pairs)
6. Mark station as online in your database

**On Heartbeat REQUEST:**

1. Respond with `serverTime` — this keeps the station's clock synchronized. Maximum acceptable clock skew: **300 seconds**. Exceeding this triggers a `ClockSkew` SecurityEvent. Station SHOULD use NTP for time synchronization between heartbeats.
2. Update "last seen" timestamp in your database
3. If you haven't received a heartbeat in `3.5 × heartbeatIntervalSec` (default 105s), mark the station as offline

**On ConnectionLost EVENT (LWT):**

1. Mark the station as offline
2. Check for active sessions on this station
3. If sessions exist, mark them as `interrupted` — the station will report the outcome when it reconnects (do NOT auto-refund yet)

### 3.4 Session Management (Online)

**When the app calls `POST /sessions/start`:**

1. Validate: bay exists, bay is Available (or Reserved by this user), user has sufficient credits, user has no other active session, station is online
2. Debit credits from the user's wallet (pre-authorization for max duration)
3. Create session record: `status: pending_ack`
4. Send **StartService REQUEST** to the station via MQTT
5. Wait for RESPONSE (10s timeout):
   - `Accepted` → update session to `active`, return `201 Created` to app
   - `Rejected` → refund credits, return error to app
   - Timeout → refund credits, return `504 Gateway Timeout` to app

**Refund rule:** Any failure after wallet debit triggers an automatic 100% refund.

**During an active session:**

- App polls `GET /sessions/{id}/status` every 3-6 seconds — return elapsed time, remaining credits, etc.
- Station sends MeterValues EVENTs — store them for billing and analytics
- Station sends StatusNotification EVENTs — update bay state in your database

**On session completion:**

When you receive StopService RESPONSE (or the session timer expires):

1. Calculate final billing using your implementation-specific pricing logic based on `actualDurationSeconds`
2. Refund unused portion: `refund = preAuthAmount - creditsCharged`
3. Update session to `completed`
4. Update bay status to `Available`

### 3.5 Web Payment Flow

For anonymous users paying by card via QR code:

```
Browser → GET /pay/{code}/info     → station name, address
Browser → GET /pay/{code}/bays     → available bays + services + prices
Browser → POST /pay/{code}/start   → reserve bay, get payment redirect URL

  → Server sends ReserveBay REQUEST to station (180s TTL)
  → Server creates PaymentIntent, returns PG redirect URL

Browser → PG 3DS page → user completes payment
PG → POST /webhooks/payment-gateway/notification (HMAC-SHA512 signed)

  → Server verifies webhook HMAC (timing-safe comparison)
  → Server sends StartService REQUEST to station
  → Station starts service
  → Session runs to timer completion (user can't stop from browser)
```

**Anti-abuse layers (implement all 5):**
1. IP rate limiting: 5 sessions / 30 min per IP
2. Device fingerprint: 3 sessions / 30 min per fingerprint
3. Progressive CAPTCHA (Cloudflare Turnstile) on suspicious patterns
4. Abandon scoring: 5+ abandoned flows → 15-min block
5. Bay lock only at `POST /pay/{code}/start`, not at browse

**Webhook verification:**
- Verify the HMAC-SHA512 signature in the `X-PG-Signature` header
- Use **timing-safe comparison** (not `===`)
- Check the IP is in the payment processor's known ranges
- Deduplicate by `paymentId` — webhooks may be delivered more than once

### 3.6 Offline Reconciliation

When a station reconnects after being offline, it sends TransactionEvent REQUESTs for each offline session:

1. **Verify txCounter continuity:** Each transaction has a `txCounter`. Verify there are no gaps in the sequence from the last reconciled counter.
2. **Verify the receipt signature:** Use the station's ECDSA P-256 public key (stored at provisioning time).
3. **Verify the OfflinePass:** Check that it was valid at the time of the transaction (signature, epoch, limits).
4. **Debit user wallets:** The credits weren't debited at session time (user was offline), so debit them now. If the user's balance goes negative, record it as a debt.
5. **Run fraud scoring:** Check for anomalies (broken chain, excessive credits, suspiciously fast intervals).
6. **Respond with `Accepted`** (the TransactionEvent RESPONSE only has `status` and `reason`).

**Fraud scoring factors (8 factors, 0.00-1.00 scale, capped at 1.00):**

| Factor | Weight | Trigger |
|--------|:------:|---------|
| txCounter gap detected | +0.30 | txCounter not sequential |
| Invalid receipt signature | +0.30 | ECDSA verification fails |
| Excessive credits | +0.15 | Well above pass limits |
| Suspicious interval | +0.10 | Transactions too fast |
| Unknown device | +0.10 | deviceId not in user's devices |
| Expired pass used | +0.05 | Pass was expired at time of use |
| High transaction count | +0.05 | Unusual volume |
| Clock skew | +0.05 | Station time vs server time drift |

Score is capped at 1.00 if the sum of triggered factors exceeds 1.00.

**Response at threshold (graduated):**
- Score 0.00–0.29 → Normal (no action)
- Score 0.30–0.59 → flag for manual review
- Score 0.60–0.79 → auto-disable offline for user, alert operator
- Score 0.80–1.00 → block user account, alert operator

### 3.7 Epoch-Based Revocation

To invalidate all outstanding OfflinePasses:

1. Increment the global `RevocationEpoch` value in your database
2. Push the new epoch to all online stations via `ChangeConfiguration` (keys: `[{key: "RevocationEpoch", value: "new_value"}]`)
3. Stations will reject any OfflinePass with `revocationEpoch < new_epoch`
4. When users reconnect, their app requests a fresh OfflinePass (with the new epoch)

This is a "nuclear option" — it invalidates ALL existing passes, not just one user's. Use it for security incidents. For per-user revocation, just don't issue them a new pass.

### 3.8 Circuit Breakers

Implement circuit breakers for three integration points:

**1. Server → Station Commands:**
- Threshold: 3 consecutive timeouts
- Cooldown: 30s initial, doubles each re-open (max 5 min)
- Open behavior: New StartService → immediate `6002 ACK_TIMEOUT` (no MQTT send, no wallet debit)

**2. Station → MQTT Broker (station-side, but server must understand):**
- After 5 consecutive connection failures, station enters BLE-only mode
- On reconnect: full boot sequence

**3. Server → Payment Processor:**
- Threshold: 5 failures in 60s
- Open behavior: Card/web payments → `4005 PAYMENT_FAILED`, credit-based sessions still work

### 3.9 Rate Limiting

Protect your REST API:

| Endpoint Category | Rate Limit |
|-------------------|-----------|
| Authentication (login, refresh) | 10/min per user |
| Sessions (start, stop, status) | 30/min per user |
| Wallet (top-up, balance) | 20/min per user |
| Web Payment | 5/30min per IP |
| Admin API | 60/min per admin |

Return `429 Too Many Requests` with a `Retry-After` header.

---

## 4. Implementing a User Agent

### 4.1 Mobile App

**Authentication:** JWT with ES256 signing.
- Access token: 15-minute expiry. Include in `Authorization: Bearer {token}` header.
- Refresh token: 30-day expiry, one-time-use. When the access token expires, call the refresh endpoint.

**Session polling:** After starting a session, poll `GET /sessions/{id}/status` every 3 seconds (6 seconds when the app is in the background). Don't use WebSockets — polling is simpler and the status update frequency doesn't justify a persistent connection.

**Offline mode (if supported):**

Your app needs to:

1. **Pre-arm an OfflinePass** while online — call `POST /me/offline-pass/refresh`. Store the pass securely (encrypted at rest, device keychain).
2. **Detect connectivity** — Know whether the phone and station are online/offline (4 scenarios).
3. **BLE scanning** — Filter for service UUID `0000FFF0-0000-1000-8000-00805F9B34FB`.
4. **HELLO/CHALLENGE handshake** — Exchange nonces with the station.
5. **Derive session key** — `HKDF-SHA256(LTK || appNonce || stationNonce)`.
6. **Authenticate** — Send OfflineAuthRequest (Full Offline, Partial B) or ServerSignedAuth (Partial A).
7. **Store receipts** — After an offline session, store the signed receipt in a local transaction log.
8. **Sync when online** — Upload offline receipts to the server via `POST /me/offline-txs`.

**The four connectivity scenarios:**

| Phone | Station | Strategy | Auth Flow |
|-------|---------|----------|-----------|
| Online | Online | **Online** | HTTP → server → MQTT → station |
| Online | Offline | **Partial A** | HTTP → server signs auth → BLE → station verifies ECDSA P-256 |
| Offline | Online | **Partial B** (Complete compliance only) | BLE → station → MQTT → server validates → station relays |
| Offline | Offline | **Full Offline** | BLE → station validates OfflinePass locally (10 checks) |

Detect which scenario you're in by:
1. Checking phone connectivity (can you reach `api.example.com`?)
2. Reading the station's `stationConnectivity` field from the BLE Challenge response

### 4.2 Web Payment Client

The web payment flow is simpler — no JWT, no offline mode:

1. Scan QR code → extract station/bay code
2. `GET /pay/{code}/info` → show station name and address
3. `GET /pay/{code}/bays` → show available services with prices
4. User selects bay + service
5. `POST /pay/{code}/start` → get `sessionToken` + payment redirect URL
6. Redirect to 3D Secure page
7. After payment: poll `GET /pay/sessions/{sessionToken}/status` for session progress
8. Show completion screen when session ends

The `sessionToken` is a UUID with a 10-minute TTL. Use it in the URL path, not in cookies or localStorage.

### 4.3 Error Handling for User Agents

| Error | User Message | Action |
|-------|-------------|--------|
| `402 INSUFFICIENT_BALANCE` | "Insufficient balance" | Show top-up prompt |
| `409 BAY_BUSY` | "Bay is occupied" | Suggest another bay |
| `409 SESSION_ALREADY_ACTIVE` | "You already have an active session" | Navigate to active session |
| `504 ACK_TIMEOUT` | "Station did not respond" | Refund is automatic; show retry |
| `409 STATION_OFFLINE` | "Station is offline" | Suggest BLE/offline mode |
| BLE AuthResponse Rejected | "Authentication failed" | Show specific reason from error code |

For REST API errors:
- `4xx` — client error, don't retry (fix the request)
- `429` — rate limited, wait per `Retry-After` header
- `5xx` — server error, retry with backoff: 1s → 2s → 4s (max 3 attempts)
- Network error — retry with backoff: 1s → 2s → 4s (max 3 attempts)

---

## 5. Testing Your Implementation

### 5.1 Conformance Test Structure

OSPP includes a conformance test framework in `/conformance/`:

```
conformance/
├── harness/        Test execution framework
├── test-cases/     TC-{PROFILE}-{NNN} test cases
├── test-vectors/   Valid and invalid payload sets
└── reports/        Test execution reports
```

Test cases are named `TC-{PROFILE}-{NNN}`:
- `TC-CORE-001` through `TC-CORE-xxx` — Core profile tests
- `TC-TX-001` — Transaction profile tests
- `TC-SEC-001` — Security profile tests
- `TC-OFF-001` — Offline/BLE profile tests

### 5.2 Schema Validation

All 67 JSON Schemas are in `/schemas/`. Use them to validate every message you send and receive:

```bash
# Install ajv-cli
npm install -g ajv-cli

# Validate a BootNotification REQUEST payload
ajv validate \
  -s schemas/mqtt/boot-notification-request.schema.json \
  -r "schemas/common/*.schema.json" \
  -d your-payload.json

# Validate a BLE OfflineAuthRequest
ajv validate \
  -s schemas/ble/offline-auth-request.schema.json \
  -r "schemas/common/*.schema.json" \
  -d your-ble-payload.json
```

**In code (Node.js):**

```javascript
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

// Load all common schemas as references
const commonSchemas = fs.readdirSync("schemas/common")
  .filter(f => f.endsWith(".schema.json"))
  .map(f => JSON.parse(fs.readFileSync(`schemas/common/${f}`, "utf-8")));
commonSchemas.forEach(s => ajv.addSchema(s));

// Compile and validate
const schema = JSON.parse(fs.readFileSync("schemas/mqtt/start-service-request.schema.json", "utf-8"));
const validate = ajv.compile(schema);

if (!validate(payload)) {
  console.error("Validation errors:", validate.errors);
}
```

### 5.3 Test Vectors

Use the example payloads in `/examples/payloads/` as test vectors:

- `examples/payloads/mqtt/` — 36 realistic MQTT payloads
- `examples/payloads/ble/` — 15 realistic BLE payloads

These are known-good payloads that MUST pass schema validation. Use them to verify your parser handles all fields correctly.

### 5.4 Flow Testing

Walk through each flow using the narrative examples in `/examples/flows/`:

1. **Boot sequence** — Can your station complete the full boot handshake?
2. **Online session** — Can you handle the start → meter values → stop → billing cycle?
3. **Web payment** — Does the reservation → payment → start flow work end-to-end?
4. **Full offline** — Can your station validate an OfflinePass, run a session, and sign a receipt?
5. **Partial A/B** — Do the hybrid online/offline flows work?
6. **Reconciliation** — Can you replay offline transactions with txCounter gap detection?

### 5.5 Error Scenario Testing

Test the error scenarios in `/examples/error-scenarios/`:

1. **Bay busy race condition** — Two users compete for the same bay
2. **Hardware failure mid-session** — Pump faults during a service
3. **Offline pass expired** — User tries an expired OfflinePass
4. **ACK timeout** — Station doesn't respond to a command
5. **MAC verification failure** — Message integrity check fails

### 5.6 Security Testing Checklist

- [ ] TLS 1.3 only — does your station reject TLS 1.2?
- [ ] mTLS — does the broker reject a station with an invalid certificate?
- [ ] HMAC verification — does your station reject a message with a bad `mac`?
- [ ] Replay protection — does your deduplication catch a replayed `messageId`?
- [ ] OfflinePass validation — do all 10 checks work? Test each failure mode individually.
- [ ] Receipt verification — can the server verify ECDSA P-256 signatures from your station?
- [ ] txCounter gap detection — does the gap detection work?
- [ ] Constant-time comparison — are you using timing-safe HMAC comparison?

---

## 6. Common Pitfalls

### 6.1 Transport Pitfalls

**Using MQTT 3.1.1 instead of 5.0.** OSPP requires MQTT 5.0 features: message expiry, session expiry, will delay interval, receive maximum. If your MQTT library doesn't support 5.0, you need a different library.

**Using QoS 0 or QoS 2.** Always QoS 1. QoS 0 loses messages. QoS 2 is unnecessary overhead — OSPP handles deduplication at the application layer via `messageId`.

**Not implementing message deduplication.** QoS 1 guarantees at-least-once delivery, which means you WILL get duplicates. If you process a StartService twice, you activate hardware twice. Maintain a dedup set (1000+ IDs or 1 hour).

**Setting Clean Start = true on a station.** Use `false` with `Session Expiry = 3600s`. This keeps the session alive through brief disconnects — messages sent while you were offline will be delivered when you reconnect.

**Stopping hardware on MQTT disconnect.** Never. The service must continue. The customer is actively using the station. Buffer events and reconnect.

### 6.2 Security Pitfalls

**Storing the TLS private key on the server.** The TLS key pair is generated ON the station. The server only sees the CSR (public key). Same for the ECDSA receipt-signing key. Keys never leave the device.

**Using `===` for HMAC comparison.** String comparison is not constant-time. An attacker can measure timing differences to guess the MAC byte by byte. Always use a timing-safe comparison function.

**Forgetting to sort keys for canonical JSON.** HMAC computation requires deterministic JSON. If you don't sort keys recursively, the sender and receiver will compute different MACs and every message will be rejected.

**Not verifying the `mac` field.** It's tempting to skip HMAC verification during development. Don't ship without it. A station that doesn't verify MACs is vulnerable to message injection.

**Skipping OfflinePass check #10 (counter replay).** This is the anti-replay defense. If you don't check that `counter > lastSeenCounter`, an attacker can replay an intercepted OfflineAuthRequest and get free services.

**Using TLS 0-RTT.** TLS 1.3 offers 0-RTT resumption, which is vulnerable to replay attacks. OSPP explicitly forbids it. Don't enable it.

**Logging sensitive fields in plaintext.** Never log session tokens, payment credentials, MAC values, HMAC session keys, certificate private keys, or full OfflinePass content. Redaction rules per `spec/06-security.md` §8.5:

- **Session tokens (JWT/web)** — first 8 characters only
- **MAC values** — first 8 characters only
- **HMAC session keys** — MUST NOT be logged (completely suppress, not just redact)
- **Certificate private keys** — MUST NOT be logged
- **Payment credentials** — MUST NOT be logged
- **OfflinePass content** — log only the pass ID, never signature or key material
- **User email/phone** — mask after first 3 characters (e.g., `use****@example.com`, `+40 7xx xxx xx`)

### 6.3 Session Pitfalls

**Not refunding on failure.** The golden rule: if you debited the wallet and the service didn't start (or didn't complete), refund immediately. Every code path from wallet debit to service start must have a compensating refund on failure.

**Billing based on requested duration instead of actual.** Always bill based on `actualDurationSeconds` from the station. The user may stop early or the timer may have slightly different precision.

**Trusting the station's `creditsCharged` blindly.** The station reports `creditsCharged` as an estimate, but the server is the authoritative billing engine. Always recompute billing server-side using actual duration — do not trust the station's estimate.

**Not handling the `Finishing` state.** After a service stops, the bay goes through `Finishing` (wind-down cycle, actuator retraction) before returning to `Available`. If you skip this state, the next user might try to start while the previous session is still winding down.

### 6.4 Offline Pitfalls

**Validating the OfflinePass online.** In Full Offline mode, the station MUST validate locally. Don't try to phone home — there's no connectivity.

**Not persisting offline state.** If the station loses power during an offline session, it needs crash recovery. Persist the current session state, offline pass usage counters, and transaction log to flash/NVS. On power-up, check for unfinished sessions.

**Not initializing txCounter correctly.** The first offline transaction after provisioning must use `txCounter: 1`. If you start with 0 or skip values, the server will detect gaps during reconciliation and flag it as fraud.

**Not capping duration by `maxCreditsPerTx`.** If the OfflinePass allows 30 credits max per transaction and the user requests a 5-minute service at 10 credits/min (= 50 credits), you must cap the session to 3 minutes (30 credits). Don't reject — cap.

### 6.5 Server Pitfalls

**Auto-refunding when the station goes offline.** Don't. The station continues the session. When it reconnects, it will report the actual outcome. Auto-refunding creates double-spend: the user got the service AND got the credits back.

**Not implementing circuit breakers.** If a station is unresponsive, every new StartService attempt will debit the wallet, wait 10 seconds, timeout, and refund. That's a terrible user experience. After 3 consecutive timeouts, stop trying — return `6002 ACK_TIMEOUT` immediately without debiting.

**Accepting payment webhooks without HMAC verification.** An attacker can forge a webhook to make the server think a payment succeeded. Always verify the HMAC-SHA512 signature AND check the source IP.

**Using sequential IDs.** Entity identifiers (stationId, bayId, sessionId, etc.) use the 8+ lowercase hexadecimal format with type prefix (e.g., `stn_a1b2c3d4`). Message identifiers (`messageId`) are unique string identifiers (1–64 characters) — use prefixed UUIDs, opaque tokens, or similar formats that prevent guessing. Sequential IDs (1, 2, 3...) leak information about system scale and are easy to guess.

---

## 7. Conformance Checklist

Check off each requirement as you implement it. Items marked **[MUST]** are mandatory for compliance. Items marked **[SHOULD]** are recommended. Items marked **[OFFLINE]** are only required for the Offline/BLE profile.

### Transport

- [ ] **[MUST]** MQTT 5.0 protocol (NOT 3.1.1)
- [ ] **[MUST]** TLS 1.3 mandatory (TLS 1.2 forbidden)
- [ ] **[MUST]** mTLS — station presents X.509 client certificate
- [ ] **[MUST]** Client ID = `stn_{station_id}` matching certificate CN
- [ ] **[MUST]** QoS 1 for all messages
- [ ] **[MUST]** Retain = false for all messages
- [ ] **[MUST]** Clean Start = false with Session Expiry = 3600s
- [ ] **[MUST]** Keep Alive = 30s
- [ ] **[MUST]** Will Delay Interval = 10s for LWT
- [ ] **[MUST]** LWT configured at CONNECT time (ConnectionLost message)
- [ ] **[MUST]** Two topics: `ospp/v1/stations/{id}/to-server` and `ospp/v1/stations/{id}/to-station`
- [ ] **[MUST]** Message deduplication (1000+ IDs or 1 hour window)
- [ ] **[MUST]** Exponential backoff with jitter for reconnection (1s → 30s max)
- [ ] **[MUST]** Continue active sessions during MQTT disconnect (do NOT stop hardware)
- [ ] **[MUST]** Buffer outbound messages during disconnect (min 100 messages or 64 KB, absolute hardware minimum)
- [ ] **[MUST]** Message expiry intervals set per action category
- [ ] **[MUST]** 0-RTT TLS resumption NOT used
- [ ] **[SHOULD]** Max Packet Size = 65,536 bytes
- [ ] **[SHOULD]** Receive Maximum = 10
- [ ] **[SHOULD]** TLS cipher suite: `TLS_AES_256_GCM_SHA384` preferred

### Message Format

- [ ] **[MUST]** JSON (RFC 8259), UTF-8, compact (no unnecessary whitespace)
- [ ] **[MUST]** Envelope: `messageId`, `messageType`, `action`, `timestamp`, `source`, `protocolVersion`, `payload`
- [ ] **[MUST]** `messageId` is a unique string identifier (1–64 characters)
- [ ] **[MUST]** `timestamp` is ISO 8601 UTC with milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`)
- [ ] **[MUST]** `action` names in PascalCase
- [ ] **[MUST]** RESPONSE uses same `messageId` as corresponding REQUEST
- [ ] **[MUST]** All object schemas enforce `additionalProperties: false`
- [ ] **[MUST]** All identifier fields match their regex pattern (`stn_`, `bay_`, `sess_`, etc.)

### Security

- [ ] **[MUST]** HMAC-SHA256 signing per `MessageSigningMode` (default `Critical`: 31 of 46 messages; `All`: every message except BootNotification REQUEST and LWT)
- [ ] **[MUST]** Canonical JSON for HMAC: sorted keys (recursive), compact, UTF-8
- [ ] **[MUST]** Constant-time HMAC comparison (timing-safe)
- [ ] **[MUST]** Session key from BootNotification RESPONSE, stored in RAM only
- [ ] **[MUST]** Reject messages with invalid/missing MAC → send SecurityEvent
- [ ] **[MUST]** TLS private key generated on station, never transmitted
- [ ] **[MUST]** ECDSA P-256 receipt-signing key generated on station, never transmitted
- [ ] **[MUST]** ECDSA P-256 firmware signature verification before installation (reject on failure → `5112 FIRMWARE_SIGNATURE_INVALID`)
- [ ] **[MUST]** Log redaction: session tokens (first 8 chars only), MAC values (first 8 chars only), HMAC session keys (never log), certificate private keys (never log), payment credentials (never log), OfflinePass content (ID only), user email/phone (mask after 3 chars) — see `spec/06-security.md` §8.5
- [ ] **[SHOULD]** Certificate renewal: automatic renewal within `CertificateRenewalThresholdDays` of expiry
- [ ] **[SHOULD]** Certificate renewal: keep old cert until new cert verified on TLS connection
- [ ] **[MUST]** Certificate renewal: private key generated on-device, never transmitted
- [ ] **[SHOULD]** Certificate pinning for embedded stations
- [ ] **[SHOULD]** Secure element / hardware security module for key storage
- [ ] **[SHOULD]** SecurityEvent reporting for all Critical errors

### Station Core

- [ ] **[MUST]** BLE advertising starts BEFORE MQTT connection
- [ ] **[MUST]** BootNotification on every connect/reconnect
- [ ] **[MUST]** Do NOT process commands until BootNotification ACCEPTED
- [ ] **[MUST]** Sync clock from BootNotification RESPONSE `serverTime`
- [ ] **[MUST]** StatusNotification for each bay after boot
- [ ] **[MUST]** Heartbeat at server-specified `heartbeatIntervalSec`
- [ ] **[MUST]** Clock sync from Heartbeat RESPONSE `serverTime`
- [ ] **[MUST]** Bay state machine: Unknown → Available → Reserved → Occupied → Finishing → Available / Faulted / Unavailable / Unknown
- [ ] **[MUST]** Report actual duration and meter values in StopService RESPONSE
- [ ] **[MUST]** `Finishing` state between `Occupied` and `Available` (hardware wind-down)

### Server Core

- [ ] **[MUST]** Generate 32-byte random session key per BootNotification
- [ ] **[MUST]** Server is authoritative billing engine (recompute credits, don't trust station)
- [ ] **[MUST]** Full refund on any failure after wallet debit
- [ ] **[MUST]** Do NOT auto-refund when station goes offline during active session
- [ ] **[MUST]** Mark station offline after `3.5 × heartbeatIntervalSec` without heartbeat
- [ ] **[MUST]** Circuit breaker for station commands (3 timeouts → OPEN)
- [ ] **[MUST]** Circuit breaker for payment processor (5 failures/60s → OPEN)
- [ ] **[MUST]** Webhook HMAC-SHA512 verification (timing-safe)
- [ ] **[SHOULD]** Shared subscriptions (`$share/...`) for horizontal scaling
- [ ] **[SHOULD]** Rate limiting on REST API
- [ ] **[SHOULD]** Anti-abuse layers for web payment (5 layers)

### Offline / BLE

- [ ] **[OFFLINE]** BLE 4.2+ with LE Secure Connections (LESC)
- [ ] **[OFFLINE]** GATT Service UUID: `0000FFF0-0000-1000-8000-00805F9B34FB`
- [ ] **[OFFLINE]** 6 characteristics: FFF1 (Read), FFF2 (Read), FFF3 (Write), FFF4 (Notify), FFF5 (Notify), FFF6 (Read)
- [ ] **[OFFLINE]** BLE advertising name: `OSPP-{station_id_last6}`
- [ ] **[OFFLINE]** MTU negotiation to 247 bytes; fragmentation for messages > MTU-3
- [ ] **[OFFLINE]** HELLO/CHALLENGE handshake with fresh nonces
- [ ] **[OFFLINE]** Session key derivation: HKDF-SHA256(LTK \|\| appNonce \|\| stationNonce)
- [ ] **[OFFLINE]** OfflinePass validation: all 10 checks in order
- [ ] **[OFFLINE]** ECDSA P-256 signature verification for OfflinePass
- [ ] **[OFFLINE]** Key rotation support: accept `OfflinePassPublicKey` and cached previous key during grace period (300 s)
- [ ] **[OFFLINE]** ECDSA P-256 receipt signing
- [ ] **[OFFLINE]** Monotonic txCounter: increment by exactly 1 per offline transaction, server detects gaps
- [ ] **[OFFLINE]** Receipt retention on FFF6 for 5 minutes after session ends
- [ ] **[OFFLINE]** Persist offline state: pass usage counters, transaction log, session state
- [ ] **[OFFLINE]** Cap session duration by `maxCreditsPerTx` (don't reject — cap)
- [ ] **[OFFLINE]** Reconciliation via TransactionEvent after connectivity restored

### User Agent

- [ ] **[MUST]** JWT access token in `Authorization: Bearer` header
- [ ] **[MUST]** Refresh token flow (15-min access, 30-day refresh)
- [ ] **[MUST]** Session polling: 3s foreground, 6s background
- [ ] **[MUST]** Handle all error codes gracefully (user-friendly messages)
- [ ] **[MUST]** No retry on 4xx errors (except 429 with Retry-After)
- [ ] **[MUST]** Exponential backoff for 5xx and network errors (max 3 attempts)
- [ ] **[OFFLINE]** BLE scan filtering by service UUID
- [ ] **[OFFLINE]** ConnectivityDetector: detect 4 scenarios (Online, Partial A, Partial B, Full Offline)
- [ ] **[OFFLINE]** Pre-arm OfflinePass while online
- [ ] **[OFFLINE]** Store OfflinePass encrypted at rest (device keychain)
- [ ] **[OFFLINE]** Store offline receipts locally
- [ ] **[OFFLINE]** Sync offline receipts to server when online (`POST /me/offline-txs`)
- [ ] **[OFFLINE]** Biometric/PIN gate before offline authentication

---

## Quick Reference Card

### Timeouts

| Operation | Timeout |
|-----------|---------|
| BootNotification RESPONSE | 30s |
| StartService / StopService RESPONSE | 10s |
| ReserveBay / CancelReservation RESPONSE | 5s |
| Heartbeat RESPONSE | 30s |
| ChangeConfiguration RESPONSE | 60s |
| GetConfiguration RESPONSE | 30s |
| SetMaintenanceMode RESPONSE | 30s |
| UpdateServiceCatalog RESPONSE | 30s |
| Reset RESPONSE | 30s |
| Firmware / Diagnostics RESPONSE | 300s |
| MQTT PINGRESP | 10s |
| BLE fragment | 5s |
| JWT access token | 15 min |
| Web session token | 10 min |
| OfflinePass validity | max 24 hours |
| Reservation TTL | 180s default |
| BLE receipt retention | 5 min |

### Error Code Ranges

| Range | Category | Example |
|-------|----------|---------|
| 1000-1999 | Transport | `1001` MQTT_CONNECTION_LOST |
| 2000-2999 | Auth | `2003` OFFLINE_PASS_EXPIRED |
| 3000-3999 | Session/Bay | `3001` BAY_BUSY |
| 4000-4999 | Payment | `4001` INSUFFICIENT_BALANCE |
| 5000-5999 | Hardware | `5001` PUMP_SYSTEM |
| 6000-6999 | Server | `6002` ACK_TIMEOUT |
| 9000-9999 | Vendor | Implementation-specific |

### Crypto Algorithms

| Purpose | Algorithm | Key Size |
|---------|-----------|----------|
| Transport | TLS 1.3 | — |
| Station TLS | mTLS (ECDSA P-256) | 256 bit |
| Root CA | ECDSA P-384 | 384 bit |
| Message signing | HMAC-SHA256 | 256 bit |
| OfflinePass | ECDSA P-256 | 256 bit |
| Receipts | ECDSA P-256 | 256 bit |
| BLE session key | HKDF-SHA256 | 256 bit |
| BLE encryption | AES-CCM-128 (LESC) | 128 bit |
| Webhooks | HMAC-SHA512 | 512 bit |
| JWT | ES256 | 256 bit |

---

*This guide covers OSPP 0.1.0-draft.1. For normative requirements, always refer to the [spec chapters](../spec/). For message field definitions, refer to the [JSON Schemas](../schemas/). For realistic examples, see the [example payloads and flows](../examples/).*
