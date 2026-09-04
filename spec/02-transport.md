# Chapter 02 — Transport

> **Status:** Draft | **OSPP Version:** 0.28.0

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
| **Keep Alive** | `30` seconds — **default; overridden by `mqttConfig.keepAliveSeconds`** when the provisioning response carries it ([Flows §2](04-flows.md#2-station-provisioning)) | Balance between liveness detection and bandwidth |
| **Receive Maximum** | `10` | Flow control — max 10 unacknowledged messages in flight |
| **Maximum Packet Size** | `65536` (64 KB) | Practical limit; typical messages are 200–500 bytes |
| **Client ID** | `{stationId}` (e.g., `stn_a1b2c3d4`) — **fixed; not overridable by `mqttConfig.clientIdTemplate`** | MUST match the CN in the station's X.509 client certificate. The `stationId` already includes the `stn_` prefix — do not add it again. The broker enforces topic ACLs on that CN (§3.3 of [Chapter 06](06-security.md)), so this value is bound to the certificate rather than configured. |
| **Will Delay Interval** | `10` seconds | Grace period before LWT fires (prevents false disconnects) |

The broker MUST be configured with a keep-alive multiplier of **1.5**, meaning it will disconnect a station after **45 seconds** without any MQTT packet (PINGREQ, PUBLISH, etc.) — or after 1.5× whatever Keep Alive is actually in force, where the provisioning response advertised a different one.

> **Where this table is a default and where it is absolute.** Every row here is what the station uses when the provisioning response says nothing. `mqttConfig` ([Flows §2](04-flows.md#2-station-provisioning)) may carry a different **Keep Alive**, and the advertised value then governs. It may **not** carry a different **Client ID**: that one is bound to the certificate CN, not configured, and the schema pins `clientIdTemplate` accordingly. The remaining advertised parameters — QoS, Clean Start, MQTT version, TLS floor — are pinned by the response schema to the values in this chapter and cannot disagree with it. **Receive Maximum**, **Maximum Packet Size** and **Will Delay Interval** have no `mqttConfig` field at all and are therefore always taken from this table.

### 1.3 TLS (1.2 floor, 1.3 recommended)

All MQTT connections MUST use **TLS 1.2 or higher**; **TLS 1.3 is RECOMMENDED** and MUST be negotiated whenever both peers support it ([RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) / [RFC 5246](https://www.rfc-editor.org/rfc/rfc5246)). TLS versions below 1.2 (1.1, 1.0, SSLv3) MUST be rejected. TLS 0-RTT (early data) **MUST NOT** be enabled (replay risk).

> The TLS-1.2 floor (formerly TLS-1.3-only) admits constrained cellular modems that cap at TLS 1.2 with no firmware path to 1.3 (e.g. SIMCom A7608E-H). It parallels the REST channel, which is already TLS 1.2+ with the same mTLS client certificate. mTLS remains mandatory on every connection regardless of negotiated TLS version.

The station MUST support at least the following cipher suites:

**TLS 1.3:**

- `TLS_AES_256_GCM_SHA384` (RECOMMENDED)
- `TLS_AES_128_GCM_SHA256`

**TLS 1.2** (ECDHE-ECDSA with AEAD-GCM only — the OSPP server certificate is ECDSA P-256):

- `ECDHE-ECDSA-AES256-GCM-SHA384`
- `ECDHE-ECDSA-AES128-GCM-SHA256`

CBC-mode, RSA-key-exchange, and 3DES cipher suites MUST NOT be offered or accepted.

The connection MUST use **mutual TLS (mTLS)**:

- The **station** presents an X.509 client certificate signed by the OSPP Station CA.
- The **broker** presents a server certificate signed by a trusted public or private CA.
- The broker MUST verify the station's client certificate against the OSPP CA trust chain.
- The broker **MUST** also establish that the station's client certificate has not been revoked, and refuse the connection if it has. The freshness bounds it holds the revocation information to, what it does when that information cannot be obtained, and how a deployment is held to a clause no message can carry are in [Chapter 06 — Security §2.1.1](06-security.md#211-revocation-checking), which is authoritative.

Certificate requirements are defined in [Chapter 06 — Security](06-security.md).

**Connection sequence:**

```
Station                                              Broker
   │                                                    │
   │──── TCP SYN ──────────────────────────────────────>│
   │<─── TCP SYN-ACK ──────────────────────────────────│
   │──── TCP ACK ──────────────────────────────────────>│
   │                                                    │
   │──── TLS ClientHello (TLS 1.2 or 1.3) ────────────>│
   │<─── TLS ServerHello + Certificate ────────────────│
   │──── TLS Certificate (station cert) + Finished ───>│
   │<─── TLS Finished ────────────────────────────────-│
   │                                                    │
   │  [TLS 1.2/1.3 session established — mTLS verified] │
   │                                                    │
   │──── MQTT CONNECT {clientId, cleanStart=false, ...}>│
   │<─── MQTT CONNACK {reasonCode=0x00 Success} ──────│
   │                                                    │
```

**Error scenarios:**

| Scenario | Behavior |
|----------|----------|
| TLS handshake fails, no certificate at fault (cipher suite or protocol version) | Station MUST log error `1003` (`TLS_HANDSHAKE_FAILED`), retry with backoff |
| TLS handshake fails because a certificate was rejected — revoked, self-signed, or an invalid chain | Station **MUST** log error `1004` (`CERTIFICATE_ERROR`) with the matching `details.cause`, keep its credentials, stay off the broker, alert operator. **Not `1003`** — [07-errors §3.1](07-errors.md#31-transport-errors-1xxx) gives `1004` precedence over `1003` for every failure a certificate caused |
| Certificate expired | Station MUST log error `1004` (`CERTIFICATE_ERROR`) with `details.cause: expired`, alert operator |
| The broker cannot establish the certificate's revocation status, and its grace has expired | The broker completes the handshake and refuses the **MQTT CONNECT** with a non-zero CONNACK reason code (`0x87 Not Authorized` RECOMMENDED); the station takes the generic non-zero-CONNACK row below and retries with backoff. **Not `1004`** — nothing is wrong with this station's certificate, and `1004`'s non-expired branches would take the fleet off the broker and leave it there ([Chapter 06 §2.1.1](06-security.md#211-revocation-checking)) |
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

- The protocol version is carried inside the message envelope via the `protocolVersion` field (see [Chapter 03 — Messages](03-messages.md)) and checked at boot by **exact match** against the set the server supports ([VERSIONING.md](../VERSIONING.md)). "Negotiation" here means that check and its `1007` outcome; the two peers do not converge on a version, and a shared MAJOR implies nothing.
- The topic namespace `v1` MUST remain `v1` for every OSPP protocol version, regardless of that version's MAJOR component. The two numbers are unrelated: the namespace identifies the topic layout, the envelope field identifies the message contract.
- A new topic namespace (e.g., `v2`) would only be introduced for a fundamental transport-level change — a different topic shape or a different addressing scheme — not for any change the envelope's `protocolVersion` can express.
- The **specification-document version** shown in each chapter header (e.g. *OSPP Version: 0.28.0*) versions this specification's prose and schemas. It is **independent of** the wire `protocolVersion` field carried in the message envelope (e.g. `0.3.0`): the two version numbers evolve separately and need not match.

**Negotiation happens once, at boot. A later mismatch is not re-negotiated, and is not refused.**

Every message carries `protocolVersion` in its envelope, so a receiver *can* compare every message
against the value negotiated at boot. It **MUST NOT** act on the comparison by refusing:

1. A receiver **MUST** process a message whose `protocolVersion` differs from the negotiated value
   on its merits, exactly as if it matched. Payload validation is unaffected — a message that fails
   its own schema is still `1005`.
2. A receiver **MUST NOT** refuse a message on account of its `protocolVersion` outside a
   BootNotification response, and **MUST NOT** emit `1007 PROTOCOL_VERSION_MISMATCH` there. That
   code is reachable only from BootNotification ([Chapter 07 §3.1](07-errors.md#31-transport-errors-1xxx)),
   and this rule is why it stays so.
3. A receiver **MUST** record the discrepancy — both versions, the `messageId`, and the peer — and
   **SHOULD** raise an operator alert. It carries **no error code and no distinct wire status**,
   the same disposition [Chapter 07 §3.1](07-errors.md#31-transport-errors-1xxx)'s `1005` row gives
   the counter-discontinuous offline transaction, and for the same reason: the record is worth
   keeping and the refusal is not.
4. The condition is repaired at the **next boot**, where negotiation is defined and cheap.

**Why a receiver must not refuse here, stated because the opposite reads as the careful choice.**
A station's `protocolVersion` is fixed by its firmware, and changing firmware restarts it;
[CORE-001](profiles/core/README.md) then makes BootNotification the first message of the new MQTT
session. A version that genuinely moved therefore re-negotiates **by construction**, and a mismatch
on a live session is a station malfunction rather than an unannounced upgrade — a condition an
operator fixes, not one a peer can fix by rejecting traffic.

The cost of refusing is **asymmetric, and the expensive half is silent.** For a REQUEST the refusal
has somewhere to go: a RESPONSE carrying a code. For an **EVENT** there is none, so a receiver that
refuses can only discard — and `SessionEnded` and `TransactionEvent` are the sole billing sources
for a session that ended with no StopService to answer ([Chapter 01 §6.5](01-architecture.md)). A
delivered session would go unbilled, permanently, over a metadata disagreement about a field that
changed nothing in the payload. **A refusal that lands on the wrong path becomes the failure it was
meant to prevent.**

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
- **EVENTs**: The `timestamp` field provides the authoritative ordering. If a StatusNotification arrives with a timestamp older than the last **accepted** StatusNotification for the same bay, the receiver SHOULD discard it. A receiver that implements this discard **MUST** derive the floor from accepted reports alone:
    - Only a StatusNotification the receiver accepted and applied advances the floor. A report the receiver *discarded* **MUST NOT** advance it — otherwise one stale arrival raises the bar against every later report, including correct ones.
    - **No server-internal state change advances the floor.** Not the bay reset performed on a station's boot, not the connection-loss reset ([CORE-008](profiles/core/README.md)), not a heartbeat-timeout sweep, and not a general row-modification timestamp that any of those happen to touch. The floor is a **station-clock** value that arrived on the wire; a **server-clock** event is not commensurable with it and **MUST NOT** be substituted for it. A receiver that stamps its own clock into the floor will reject the very report it is waiting for: `serverTime` is computed before such a reset is written, so a conforming station that syncs to it is handed a clock reference already behind the bar it must clear, and the protocol treats several minutes of station skew as unremarkable.
    - Where no report has yet been accepted for a bay there is **no** floor, and that bay's first report **MUST NOT** be discarded on ordering grounds.
- **TransactionEvents**: The `txCounter` field is forensic evidence, not an ordering guarantee (per-pass, per-station; see [`profiles/transaction/transaction-event.md`](profiles/transaction/transaction-event.md)). Ascending order is RECOMMENDED; the receiver settles each transaction on its own merits in arrival order and does not gate on the counter.
- **Online session-scoped EVENTs (Per-Session `seqNo`, OPTIONAL)**: MeterValues and SessionEnded MAY carry a per-session monotonic `seqNo` field starting at `0` for the first session-scoped EVENT and incrementing by exactly `1` for each subsequent EVENT in the same session (same `sessionId`). If `seqNo` is present:
    - The receiver MUST verify that consecutive EVENTs for the same `sessionId` increment `seqNo` by exactly `1`.
    - On detected gap (e.g., received seqNo `5` after seqNo `3`), the receiver SHOULD log a warning. If the missing seqNo range crosses a billing-milestone boundary — for example, the low-delivery threshold `faultFullRefundThreshold` defined in the refund policy at [`04-flows.md §6`](04-flows.md) — the receiver MUST flag the session for HIGH-severity reconciliation audit. **This is not the `txCounter` rule.** `seqNo` is server-observable within a live session and a gap in it means a message was genuinely lost in transit, so it is actionable; the offline `txCounter` is emitted by the station across reboots and is forensic only ([`profiles/offline/reconciliation.md §4.2`](profiles/offline/reconciliation.md)). Do not generalise one to the other.
    - If `seqNo` is absent, the receiver falls back to `timestamp` ordering.
    - `seqNo` is online + per-session and is distinct from `txCounter` (offline + per-pass + per-station). The two counters live in disjoint scopes — a single station may have an active online session emitting `seqNo` and a pending offline transaction queue emitting `txCounter` simultaneously.

- **Canonical session-final marker (`finalSeqNo`, OPTIONAL)**: A session is terminated either by a server-initiated stop (StopService RESPONSE [MSG-006]) or by autonomous station action (SessionEnded EVENT [MSG-040]). Both messages MAY carry a `finalSeqNo` field equal to the highest `seqNo` the station emitted for the session before terminal hardware shutdown. When present, the server MUST discard any MeterValues with `seqNo > finalSeqNo` received subsequently for the same `sessionId`, treating them as stale (e.g., a queued MeterValues that flushed after the stop was processed). Without `finalSeqNo`, late MeterValues are accepted subject to the timestamp-ordering rule above.

**Command serialization:** When the server publishes multiple commands (e.g., StartService and ChangeConfiguration) to the same station topic, the station receives and MUST process them sequentially in the order received. The station MUST complete processing (send RESPONSE) for one command before processing the next. If a command arrives while another is in progress, the station MUST queue it (max 10 pending commands) or reject with error `5107 OPERATION_IN_PROGRESS` if the queue is full. **The refusal is the station's own and carries a station code.** An earlier revision named `6001 SERVER_INTERNAL_ERROR` here, which the registry places in the **Server Errors** range ([`07-errors.md` §1.1](07-errors.md)) and defines as *"generated by the server"* ([§3.6](07-errors.md)) — its recommended action even tells the reader to correlate via `X-Request-Id`, a header no station has. A full command queue is a station resource limit, which is what the `5xxx` range is for.

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
│  4. TCP + TLS 1.2+/1.3 + mTLS handshake (port 8883)    │
│  5. MQTT CONNECT (parameters per Section 1.2)           │
│  6. Process CONNACK (verify reason code = 0x00)         │
│  7. SUBSCRIBE to: ospp/v1/stations/{id}/to-station      │
│  8. PUBLISH BootNotification REQUEST                    │
│  9. Wait for BootNotification RESPONSE (timeout: 30s)   │
│     ├── Accepted → sync clock, apply config → step 10   │
│     ├── Rejected → restricted: refuse commands;         │
│     │              wait retryInterval, goto step 8      │
│     ├── Pending  → restricted: ANSWER commands, serve   │
│     │              no customers; wait, goto step 8      │
│     └── Timeout  → wait 60s, goto step 8                │
│  10. PUBLISH StatusNotification per bay (with programs)  │
│  11. Start heartbeat timer                              │
│  12. Enter normal operation (accept commands)            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Critical rule:** While the station is `Booting` — the BootNotification REQUEST is published and no RESPONSE has arrived — it MUST NOT process any server command. Commands received in that window MUST be queued and processed after boot completes, or rejected with error `2001` (`STATION_NOT_REGISTERED`). What happens next depends on the response, and the two restricted states differ: a `Rejected` station continues to refuse commands, while a **`Pending` station MUST process and answer them** — that channel is how an operator repairs whatever is holding the boot — but MUST still refuse StartService and ReserveBay with `3002 BAY_NOT_READY`. [Chapter 05 — State Machines §1.4](05-state-machines.md#14-the-restricted-states) is normative.

**BLE before MQTT:** A station that declares `capabilities.bleSupported: true` MUST initialize BLE advertising **before** attempting the MQTT connection, so that BLE offline sessions are available even if the MQTT broker is unreachable.

### 4.2 Keep-Alive and Heartbeat

OSPP uses two complementary liveness mechanisms:

**MQTT Keep-Alive (transport level):**

- The station MUST send an MQTT PINGREQ if no other MQTT packet has been sent within the keep-alive interval (30 seconds).
- If PINGRESP is not received within **10 seconds**, the station MUST consider the connection lost and initiate reconnection.

**OSPP Heartbeat (application level):**

- After boot, the station MUST send a Heartbeat REQUEST every `heartbeatIntervalSec` seconds (default: 30s, configurable via BootNotification response or ChangeConfiguration).
- The server responds with `serverTime` for clock synchronization.
- If the server does not receive a Heartbeat (or any message) from a station for **3.5 × heartbeatIntervalSec**, it MUST consider the station offline.

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
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4",
    "reason": "UnexpectedDisconnect"
  }
}
```

**LWT rules:**

- The LWT is **exempt from message signing** (the `mac` field is absent). It is one of the three structural exemptions enumerated in [Chapter 06 §5.6](06-security.md#56-message-signing-classification), which is the single source for what is exempt and why; the reason is not only that it is registered at CONNECT time, but that the broker publishes it after the station is gone — on a first connection there is no session key yet, and on a reconnect the station holds the *previous* key while the server has rotated to the new one, so a will-MAC would arrive stale rather than merely absent.
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
5. **On successful reconnect** — follow the full boot sequence (Section 4.1): re-subscribe, BootNotification, StatusNotification per bay, then flush buffered messages. The BootNotification **MUST** carry `bootReason: "Reconnect"` when the firmware did not restart, and `uptimeSeconds` measured from the last actual boot — which therefore spans the outage. The boot is mandatory here because the HMAC session key is scoped to the MQTT session and arrives only in the boot response ([Chapter 06 §5.2](06-security.md)); a station that skipped it would reconnect keyless. OCPP-J advises the opposite for the same event, and [`boot-notification.md` §5.2](profiles/core/boot-notification.md) records why OSPP diverges.

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
| **Periodic reporting** | MeterValues | 60s | 120s |
| **Critical events** | BootNotification, TransactionEvent, SessionEnded, SecurityEvent, ConnectionLost (LWT) | — | **Never expires** |

> **Note:** UpdateServiceCatalog overrides the management-command default with a 60-second MQTT Expiry (see [Chapter 03](03-messages.md), Appendix B).

**Station Max Age** is the maximum age of a message the station will accept. If a message's timestamp is older than `now - maxAge`, the station MUST discard it and SHOULD log a warning.

**MQTT Expiry Interval** is set by the publisher. The broker discards the message if it has not been delivered within this interval. This is set higher than the station max age to account for clock differences.

### 5.2 Never-Expire Messages

The following messages MUST NOT have a Message Expiry Interval set:

- **BootNotification** — always relevant, contains station identity
- **TransactionEvent** — offline transaction reconciliation data must never be lost
- **SessionEnded** — sole billing source for autonomous session termination (timer expiry, hardware fault, and other autonomous reasons); loss would cause irreversible billing data discrepancy
- **SecurityEvent** — security incidents must always be delivered
- **ConnectionLost (LWT)** — disconnect detection must always be delivered

### 5.3 OSPP Session Retention Horizon

The **OSPP Session Retention Horizon** defines how long a station MUST retain records of completed sessions for billing audit, idempotency, and reconciliation purposes. It is a normative concept distinct from the MQTT 5.0 Session Expiry Interval (§1.2, 1 hour) and from the transport-level deduplication window (§3.3, 1000 IDs or 1 hour).

| Property | Value |
|----------|-------|
| **Horizon** | **24 hours** |
| **Applies to** | Records of sessions that have reached a terminal state (Completed, Failed, Faulted) |
| **Required of** | Every station |
| **Distinct from** | MQTT Session Expiry Interval (transport-layer); messageId dedup window (transport-layer) |

A station **MUST** retain, for at least 24 hours after a session reaches a terminal state:

- The `sessionId`, `bayId`, terminal `actualDurationSeconds`, terminal `creditsCharged`, and final `meterValues` (when applicable) for the session.
- The cached **StopService RESPONSE** [MSG-006] payload, so that duplicate StopService REQUESTs received within the horizon return the same payload (idempotent). Beyond the horizon, the station MAY return the cached response, or MAY treat the request as targeting an unknown session and return `3006 SESSION_NOT_FOUND`.
- The cached **SessionEnded** EVENT [MSG-040] payload, so that retransmissions on reconnection (after extended outage) carry the original terminal values.

The horizon is **independent of MQTT session lifetime** — a station that disconnects, expires its MQTT session (1 hour), reconnects, and reboots its MQTT session MUST still retain OSPP session records for the full 24-hour horizon. This typically implies non-volatile storage of the session-completion log.

**Rationale:** 1 hour is too short — it spans the same window as MQTT session expiry, leaving no margin for late StopService duplicates after extended network outage or for billing-audit lookups by users who consult their wallet history hours after a session. 24 hours provides the operational margin without imposing significant storage cost (one record per completed session).

**Cross-references:** `spec/profiles/transaction/README.md §4.3` (StopService idempotency) and `spec/profiles/transaction/stop-service.md §6` (Processing Rules) require retention for at least this horizon.

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

**Implementation:** Most MQTT 5.0 brokers support ACL via built-in plugins or extensions. The ACL rules **SHOULD** be configured to match the `%C` (CN from certificate) against the topic pattern. `%c` (client ID) **MUST NOT** be used as the ACL principal: it is client-asserted and, as stated above, spoofable — a broker configured that way satisfies the letter of this section's placeholder while defeating the isolation the section exists to provide.

> **Informative:** Known broker implementations include EMQX (`emqx_auth_mnesia`), HiveMQ (Enterprise Security Extension), and Mosquitto (`mosquitto_auth_plugin`).

---

## 7. Broker Requirements

### 7.1 Minimum Capabilities

Any MQTT 5.0 compliant broker MAY be used. The broker MUST support:

- MQTT 5.0 (full specification)
- TLS 1.2+ (1.3 recommended) with client certificate authentication (mTLS)
- Persistent sessions (Clean Start = false)
- Message Expiry Interval
- Shared Subscriptions (for multi-server deployments)
- Per-client ACL based on certificate CN
- Certificate **revocation** checking on the presented client certificate — against the CRL its CRL Distribution Points extension names, or by OCSP ([Chapter 06 — Security §2.1.1](06-security.md#211-revocation-checking))
- Last Will and Testament with Will Delay Interval

> **The revocation capability is a setting, not code — and its default is off.** A deployment satisfies
> [§2.1.1](06-security.md#211-revocation-checking) by configuring the broker it already runs: point it at a
> revocation source, set the two bounds that clause names, and route the grace-entry alert. Nothing has to be
> written. That is also why the clause had to be stated at all — the reference deployment reported, on
> 2026-08-28, that revocation checking was **off in production** and was being carried as a deploy precondition
> rather than as a protocol obligation, which the text until `0.27.0` permitted. That is recorded as the
> operator's report, not as something this specification measured. **Switching it on is the whole of the
> server-side work**, and a deployment that has not done it does not conform, whatever else it passes.

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

> **EXPERIMENTAL — this entire section.** Published for review, **not** for implementation; it
> may change incompatibly without a MAJOR bump. See
> [Release status](../README.md#ble-is-experimental-in-08) and the three blockers in
> [KNOWN-ISSUES](../KNOWN-ISSUES.md#blocker--the-ble-surface-is-not-implementable-as-written-three-defects).
>
> **[§8.6](#86-fragmentation-protocol) below is one half of blocker
> [B-1](../KNOWN-ISSUES.md#b-1--two-incompatible-fragmentation-protocols-are-simultaneously-normative).**
> [`profiles/offline/ble-transport.md` §11](profiles/offline/ble-transport.md) defines a
> *different*, incompatible fragmentation protocol as an equally normative MUST, and nothing in
> either chapter ranks them. Do not implement either until this is resolved.
>
> The rest of this chapter — MQTT, TLS, topics, QoS, connection lifecycle, ACL, and the HTTPS
> REST surface — is **stable** and unaffected by this marking.

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
| LE Secure Connections (pairing) | OPTIONAL | OPTIONAL (defense-in-depth only — see §8.8) |
| TX power | 0 dBm | +4 dBm |
| Range (open air) | 10 meters | 20 meters |
| Simultaneous connections | 1 | 3 |
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

The station MUST include the following in BLE advertisements:

| AD Type | Field | Value |
|---------|-------|-------|
| `0x01` | Flags | General Discoverable, BR/EDR Not Supported |
| `0x09` | Complete Local Name | `OSPP-{station_id_last6}` (e.g., `OSPP-b2c3d4`) |
| `0x07` | Complete 128-bit Service UUID | `0000FFF0-0000-1000-8000-00805F9B34FB` |
| `0xFF` | Manufacturer Specific Data | `{company_id}{station_id_bytes}{bay_count}{firmware_version}` |

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

#### 8.8.1 Link-Layer Pairing (Optional)

BLE pairing is **OPTIONAL** and is **never** a security premise for OSPP (Chapter 06 — Security §6.4). The channel's confidentiality, integrity, and station authentication are provided end-to-end at the application layer by the ECDH P-256 handshake, the StationIdentity certificate, and the ChaCha20-Poly1305 AEAD channel (§6.5). A station **MUST** operate correctly with no pairing at all.

If a deployment chooses to enable link-layer pairing for defense-in-depth, it **MUST** use **LE Secure Connections** (LESC); legacy pairing **MUST NOT** be used. The station **MUST NOT** require pairing, MitM-protected pairing (Numeric Comparison / Passkey Entry), or bonding to complete a handshake — public self-service stations are NoInputNoOutput and serve large numbers of distinct phones, so a pairing mandate is both unenforceable from a third-party app and operationally unscalable (bond-table churn, mid-handshake OS pairing dialogs). The application-layer credential (OfflinePass / ServerSignedAuth) and the §6.5 handshake are the security guarantee.

#### 8.8.2 Application-Layer Security

BLE link encryption alone is insufficient for OSPP. The protocol provides additional security at the application layer:

| Mechanism | Purpose |
|-----------|---------|
| **OfflinePass** (ECDSA P-256) | Server-signed credential authorizing offline service delivery |
| **Session Key** (ECDH P-256 + HKDF-SHA256) | Derived from a two-operation ECDH P-256 exchange (ephemeral-static + ephemeral-ephemeral) plus nonces — NOT from the BLE LTK. Station and mobile derive a shared session key per [Chapter 06 — Security §6.5](06-security.md#65-ble-session-key-derivation--hkdf-sha256); all BLE messages after the Challenge **MUST** be encrypted and authenticated with **ChaCha20-Poly1305 (IETF, RFC 8439)** under per-direction keys expanded from it (§6.5.3). |
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
| Multiple apps try to connect simultaneously | Accept first connection, reject subsequent until first disconnects |
| Station receives Hello while in handshake | Abort current handshake, start new one |

### 8.10 BLE Configuration Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `OfflineModeEnabled` | boolean | `true` | Accept offline sessions via BLE |

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

This table fixes the **path prefix only**. The absolute origin — scheme, host, port — is deployment-specific, and for the one endpoint a station calls before it holds any credential (`POST /api/v1/stations/provision`, [Flows §2](04-flows.md#2-station-provisioning)) the origin, the trust anchor that validates the server's certificate, and a clock able to evaluate that certificate's validity period are all **out-of-band station configuration**, listed in [Chapter 01 — Architecture §7.2](01-architecture.md#72-physical-configuration).

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
| **Transport** | Session token (RFC 4122 UUID, any version) embedded in URL path |
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

The server MUST store the response for a given `Idempotency-Key` and return the same response on duplicate requests. The key MUST be a valid RFC 4122 UUID (any version). The server SHOULD retain idempotency keys for at least **24 hours**.

The station-provisioning endpoint (`POST /api/v1/stations/provision`) implements this contract keyed on the **provisioning token itself** rather than an `Idempotency-Key` header — but the token alone is **not** the whole key. Within the token's TTL, a repeat is a duplicate only if it presents the **same set of key kinds, each carrying the same key**, as the provision the token bound — the **bound set**; such a repeat returns the originally-issued certificate. A repeat that presents a **different** key for any bound kind, or a **different set** of key kinds in either direction, is **not** a duplicate and **MUST** be rejected with `409 Conflict` / `4015 PROVISIONING_KEY_MISMATCH` rather than replayed. After the TTL the token is invalid for all purposes. Retention is scoped accordingly: for this endpoint the server **MUST** retain the binding for at least the **token's TTL**, which overrides the generic ≥ 24 h floor above whenever the TTL is longer — otherwise a retry could still be permitted after the binding needed to judge it had been discarded. See [Flows §2 — Single-use and idempotent retry](04-flows.md#single-use-and-idempotent-retry).

### 9.4 Request Tracing

The server MUST include an `X-Request-Id` header (RFC 4122 UUID) in all API responses:

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
| Unknown fields | The message schemas are **closed**. Forward compatibility is delivered by version negotiation, not by field tolerance — see *Unknown fields* below. |
| Numeric precision | Integer values only for credits, durations, and timestamps. No floating point. |
| String encoding | JSON string escaping per [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) |

**Unknown fields, and where forward compatibility actually comes from.**

This row used to read `Receivers MUST ignore unknown fields (forward compatibility)`, and **no conforming
implementation could have obeyed it.** Every object schema under `schemas/` declares
`additionalProperties: false` — **73 of 73**, counting the message schemas, the BLE schemas, the envelope and
the provisioning pair; the thirteen that do not are scalar type definitions with no members for the keyword to
govern. Those bytes are vendored into both SDKs and gated there byte-for-byte, so a receiver that validates
refuses a member its copy of the schema does not carry, and a receiver that ignores unknown members is not
validating. The two obligations had an empty intersection, and three decisions already taken in this
specification rest on the second one rather than on this row:

- [`07-errors.md` §2.1](../spec/07-errors.md#21-mqtt-error-response) states that on seven closed response
  schemas *"an `errorCode` cannot be placed on the wire at all"*, and records it as a **known gap** requiring
  a schema change and an SDK re-vendor — not as something a tolerant receiver absorbs.
- [`VERSIONING.md`](../VERSIONING.md)'s case for exact-match negotiation is a `0.4.0` station whose
  `SessionEnded` carries a `reason` value a `0.3.0` server's schema does not know: *"The server rejects it on
  validation."* The rule exists **because** receivers do not ignore what they do not know.
- Widening a closed response schema was available three times in `0.26.0` and was refused all three times, on
  the ground that an added member *"is backward-compatible for the emitter and not for a receiver validating
  against an older vendored copy"* — a failure measured once already, on the offline pair.

The rule that replaces it:

- A receiver **MAY** validate an incoming payload against the schema for its action. This specification
  neither requires validation nor forbids it, and a receiver that validates is conforming.
- A receiver that does **not** validate **SHOULD** ignore members it does not recognise rather than fail on
  them. That is a robustness recommendation for one implementation choice; it is **not** a guarantee an
  emitter may rely on, and it never was.
- Adding an OPTIONAL member to a message stays a **MINOR** change ([`VERSIONING.md`](../VERSIONING.md)).
  Removing or renaming one stays **MAJOR**. Nothing here forbids adding a field.
- What makes the addition safe is the negotiation, not the parser. Negotiation is **exact match**: a station
  that emits the new member declares the version carrying it, and boot pairs it only with a server whose
  supported set contains that version. A version pairing that cannot carry the member is refused at boot,
  where refusing is cheap and visible, rather than at settlement, where it is neither.

**Forward compatibility is therefore a property of the negotiation, not of the receiver's tolerance.** An
implementation that needs a field to reach a peer which does not know it needs a new protocol version, not a
lenient parser.

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
- Stations **MUST** compare their clock against the `serverTime` field of every Heartbeat response, and **SHOULD** correct it when the absolute drift exceeds **2 seconds**. Drift exceeding **5 minutes** **MUST** be logged as `5106 CLOCK_ERROR`. [`profiles/core/heartbeat.md` §6](profiles/core/heartbeat.md#6-clock-synchronization) is the normative statement of this rule; the thresholds are restated here and nowhere else.

---

## 11. Error Scenarios Summary

| Scenario | Transport | Detection | Recovery |
|----------|-----------|-----------|----------|
| MQTT broker unreachable | MQTT | TCP connect fails | Exponential backoff (Section 4.5) |
| TLS handshake fails, no certificate at fault | MQTT | TLS error | Log `1003`, retry with backoff |
| TLS handshake fails, a certificate was rejected | MQTT | TLS error | Log `1004` with the matching `details.cause` — never `1003` ([07-errors §3.1](07-errors.md#31-transport-errors-1xxx)) |
| Certificate expired | MQTT | TLS error | Log `1004` with `details.cause: expired`, alert operator |
| CONNACK rejected | MQTT | MQTT reason code | Log reason, retry with backoff |
| MQTT connection lost | MQTT | PINGRESP timeout / TCP reset | Continue BLE, buffer messages, backoff |
| Keep-alive timeout (server side) | MQTT | No heartbeat for 3.5 × interval | Mark station offline, fire LWT |
| Message expired | MQTT | Message Expiry Interval | Discard, log warning |
| Invalid JSON received | MQTT / BLE | JSON parse error | Log `1005` and discard. No reply is possible: the `messageId` cannot be read, and [07-errors §2.1](07-errors.md#21-mqtt-error-response) requires a RESPONSE to echo it. MAY be reported as an unsolicited EVENT ([07-errors §2.2](07-errors.md#22-mqtt-error-event)) |
| Unknown action | MQTT / BLE | Action not recognized | If the action is known to the protocol but unsupported here, reply `status: "Rejected"` with `1006` on that action's RESPONSE (§2.1). If the action is unknown to the protocol, no RESPONSE schema exists — log `1006` and discard. MAY be reported as an unsolicited EVENT (§2.2) |
| Protocol version mismatch | MQTT | Declared `protocolVersion` not in the server's supported set (exact match) | Log `1007`, record `supportedVersions`, stay in the `Rejected` restricted state and keep retrying BootNotification at `retryInterval` per [CORE-011](profiles/core/README.md) — the station cannot deliver service, but it MUST NOT stop retrying |
| Protocol version mismatch **after** an accepted boot | MQTT | Envelope `protocolVersion` differs from the value negotiated at boot | **Accept and process the message.** Do **not** refuse it and do **not** emit `1007` — that code is boot-only. Record both versions, the `messageId` and the peer; alert the operator; carry no error code and no distinct wire status. Repaired at the next boot ([§2.2](#22-topic-namespace-versioning)) |
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
