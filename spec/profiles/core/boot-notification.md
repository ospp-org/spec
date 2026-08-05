# BootNotification

> **Status:** Draft

## 1. Overview

BootNotification is the first message a station sends after establishing an MQTT connection. It announces the station identity, firmware version, hardware capabilities, and network information. The server responds with an acceptance status, a heartbeat interval, the current server time for clock synchronization, and optionally a session key and configuration parameters.

If the response is `Rejected` or `Pending`, the station **MUST** retry according to the retry policy defined in section 5. Both are **restricted** states of the station state machine, and they differ in one respect: a `Pending` station receives and answers server commands, a `Rejected` station does not. Neither serves customers and neither sends anything unsolicited. [Chapter 05 — State Machines §1.4](../../05-state-machines.md#14-the-restricted-states) is normative for both and is not restated here.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-------------------------------|----------|----------|-----------------------------------------------|
| `stationId` | string | Yes | Unique station identifier (`stn_` prefix). |
| `firmwareVersion` | string | Yes | Semantic version of the station firmware (e.g., `1.2.3`). |
| `stationModel` | string | Yes | Model identifier of the station hardware. |
| `stationVendor` | string | Yes | Name of the station manufacturer. |
| `serialNumber` | string | Yes | Unique serial number of the station unit. |
| `bays` | array | Yes | The station's re-declared physical topology: one entry per bay, each carrying `bayNumber` and the `programNumbers` that bay can run. Labels are **not** re-declared and are **not** compared. Maximum 64 bays, 32 programs per bay. See [Architecture §4.2](../../01-architecture.md). |
| `uptimeSeconds` | integer | Yes | Seconds elapsed since the station last booted — **not** since it last connected. It is the cross-check on `bootReason` (§5.2), and the two **MUST** agree. |
| `pendingOfflineTransactions` | integer | Yes | Number of offline transactions queued for sync. |
| `timezone` | string | Yes | IANA timezone identifier (e.g., `Europe/London`). |
| `bootReason` | string | Yes | Reason this BootNotification was sent. One of: `PowerOn`, `Watchdog`, `FirmwareUpdate`, `RemoteReset`, `ManualReset`, `ScheduledReset`, `ErrorRecovery`, `Reconnect`. The first seven name an actual boot; `Reconnect` says none occurred — see §5.2. |
| `capabilities` | object | Yes | Feature flags (see below). |
| `networkInfo` | object | Yes | Current network connection details (see below). |

### 3.1 Capabilities Object

| Field | Type | Required | Description |
|-------------------------|---------|----------|-----------------------------------------------|
| `bleSupported` | boolean | Yes | Whether the station supports BLE communication. |
| `offlineModeSupported` | boolean | Yes | Whether the station supports offline session authorization. |
| `meterValuesSupported` | boolean | Yes | Whether the station supports reporting meter values. |
| `deviceManagementSupported` | boolean | No | Whether the station supports the Device Management profile. |

### 3.2 NetworkInfo Object

| Field | Type | Required | Description |
|-------------------|---------------|----------|-----------------------------------------------|
| `connectionType` | string | Yes | One of: `Ethernet`, `Wifi`, `Cellular`. |
| `signalStrength` | integer\|null | No | Signal strength in dBm, or `null` if not applicable. |

## 4. Response Payload

| Field | Type | Required | Description |
|-----------------------|----------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted`, `Rejected`, or `Pending`. |
| `serverTime` | string | Yes | ISO 8601 UTC server timestamp for clock sync. |
| `heartbeatIntervalSec` | integer | Yes | Heartbeat interval in seconds (10--3600). |
| `retryInterval` | integer | Cond. | Seconds to wait before retrying. Required when `status` is `Rejected` or `Pending`. |
| `configuration` | object | No | Key-value configuration pairs pushed to the station. |
| `sessionKey` | string | Cond. | Base64-encoded 32-byte HMAC session key for message authentication. Required when `MessageSigningMode` is `"Critical"` or `"All"`. |

## 5. Processing Rules

1. The station **MUST** send a BootNotification as the first message after every MQTT connection (including reconnections).
2. The station **MUST NOT** send any other message before receiving a BootNotification response. "Any other message" means any EVENT and any REQUEST the station originates; it does not reach a RESPONSE, because a station cannot originate one.
3. On `Accepted`: the station **MUST** store the `heartbeatIntervalSec`, apply any `configuration` values, store the `sessionKey`, synchronize its internal clock to `serverTime`, and transition to `Operational` ([Chapter 05 §1.2](../../05-state-machines.md#12-states-6)).
4. On `Rejected`: the station **MUST** wait `retryInterval` seconds (default 30s) and retry the BootNotification. Retries are unlimited. The station enters the `Rejected` restricted state: it accepts no commands, sends nothing but its retries, and serves no customers.
5. On `Pending`: the station **MUST** wait `retryInterval` seconds (default 30s) and retry. Retries are unlimited. The station enters the `Pending` restricted state: it **MUST** receive, process and answer server commands, **MUST NOT** send anything unsolicited, and **MUST NOT** begin new customer service — StartService [MSG-005] and ReserveBay [MSG-003] are answered `Rejected` with `3002 BAY_NOT_READY`, and no BLE offline session is authorized. A session already running continues, is metered, and is settled. The command channel stays open precisely because `Pending` is the window in which an operator repairs whatever is outstanding, and the repair usually needs a command.
6. If no response is received within 30 seconds, the station **MUST** log error `1010 MESSAGE_TIMEOUT`, wait 60 seconds, and retry indefinitely.
7. After a successful `Accepted` response, the station **MUST** send a StatusNotification for each bay to report current bay states.
8. If `pendingOfflineTransactions` > 0, the server **SHOULD** schedule offline transaction synchronization after acceptance.

> **Why `Pending` is not "normal operation with a retry timer".** An earlier revision of rule 5 said the station **MAY** operate normally, eleven lines below rule 3, which defines "normal operation" as the post-`Accepted` state. Read together they permitted a `Pending` station to activate hardware on a StartService — while rule 2 and [CORE-002](README.md) forbade it from sending anything at all. Two conforming stations could take opposite arms of that, and one of them would deliver an unpaid wash. The restricted reading is also the one mature practice takes: OCPP 2.0.1's *B02 Cold Boot — Pending* has the charging station send nothing but its boot retries while the CSMS is free to issue requests.

### 5.1 Capability Semantics — absence means NOT STATED

A BootNotification **reports** the station's state; it does not rewrite the server's authoritative record. This governs every member of the `capabilities` object equally — `bleSupported`, `offlineModeSupported`, `meterValuesSupported`, and any capability added in a later revision — not one field in particular.

1. A capability present with value `true` records a **declared positive**. A capability present with value `false` records a **declared negative**. A capability **absent** from the object is **not stated** — it is the absence of information, and it is **not** a declared negative.
2. Where a capability is absent, the server **MUST NOT** overwrite a value the station has previously declared. A capability once declared is retained until the station explicitly declares it otherwise.
3. The server **MAY** treat a not-stated capability as unsupported **for the purpose of withholding commands**, consistent with the profile rule that a server must not send commands from a profile the station has not declared support for ([Profiles §3](../README.md)). It **MUST NOT** persist that treatment as though the station had declared `false`.

> **Why this is normative rather than obvious.** Under the opposite reading — absence coerced to `false` on every boot — a station that declared a capability once is silently downgraded by any later boot that happens to omit it, with no error, no event, and nothing on the wire to show what changed. Where the downgraded capability is the one gating remote management, the downgrade also removes the channel by which it could be repaired: the only fix would be new firmware, delivered over the channel the flag just disabled. Rule 2 exists so that a reporting message can never destroy state it did not mention.

This section fixes the meaning of an **absent** capability. It does not define capability *negotiation* — how a server advertises what it supports, or how the two reconcile — which remains open.

### 5.2 `bootReason` — Seven Boots and One Non-Boot

Rule 1 requires a BootNotification after **every** MQTT connection, reconnections included. A reconnection after a TCP reset or a brief network loss involves no boot at all: the firmware is the same process it was a second earlier, holding the same session state, the same active sessions and the same counters. Only the MQTT session is new.

`Reconnect` is the value for that case, and it is the only member that does not name a boot.

1. The station **MUST** send `Reconnect` when it re-establishes the MQTT connection without having restarted, and **MUST NOT** send it when the firmware did restart.
2. `uptimeSeconds` **MUST** be consistent with `bootReason`. A `Reconnect` carries the uptime the station already had — it spans the outage. `PowerOn`, `Watchdog`, `FirmwareUpdate`, `RemoteReset`, `ManualReset`, `ScheduledReset` and `ErrorRecovery` all carry an uptime measured from the restart they name.
3. A server **MAY** use the pair to detect an inconsistent report — a `PowerOn` with a large uptime, or a `Reconnect` whose uptime went backwards — and **SHOULD** log it. `bootReason` is the primary signal; `uptimeSeconds` corroborates it.
4. The distinction is load-bearing, not cosmetic. [Chapter 02 — Transport §4.4](../../02-transport.md) guarantees that an active session survives an MQTT outage, so on receiving a boot the server must decide whether to keep that session or terminate it. Without a value expressing "I did not restart", two conforming servers reading the same message draw that line differently, and one of them terminates a live session on running hardware.

> **A deliberate divergence from OCPP, recorded so it is not mistaken for an oversight.**
>
> OCPP-J (OCPP 2.0.1 Part 4 §5.4, *Reconnecting*) advises the opposite: a charging station **SHOULD NOT** send a BootNotification when reconnecting unless something in it has changed, on the grounds that the WebSocket connection already re-establishes the identity binding, so an extra message buys nothing. The OCA certification cases contain no BootNotification step on reconnect.
>
> OSPP requires one, and the requirement follows from [Chapter 06 — Security §5.2](../../06-security.md): the HMAC session key is scoped to the MQTT session and is issued **in** the BootNotification response. A new MQTT session therefore needs a new key, and the boot is the only message that carries one. Drop the boot on reconnect and the station reconnects keyless, unable to sign or verify anything.
>
> That is a real cost — one extra round trip per reconnect — accepted for a real reason. `Reconnect` is what makes the cost honest: the message is sent because the *key* must be re-issued, not because the station rebooted, and the field now says so. OCPP has no equivalent value because it has no such message.

## 6. Error Handling

| Condition | Error Code | Behaviour |
|-------------------------------------|---------------------|-----------------------------------------------|
| Station ID not recognized by server | `2001 STATION_NOT_REGISTERED` | Server responds with `Rejected`. Station **MUST** keep retrying BootNotification per CORE-011, and **MUST NOT** enter provisioning mode or alter stored credentials: it holds credentials the broker accepted, and [Flows §2](../../04-flows.md#re-provisioning-an-already-provisioned-station) forbids re-provisioning autonomously in that state. The cause is fixed operator-side (register the `stationId`), after which the next retry succeeds. |
| Invalid message format | `1005 INVALID_MESSAGE_FORMAT` | Server drops the message. Station does not receive a response and retries after timeout. |
| Declared topology does not match the provisioned topology | `3018 TOPOLOGY_MISMATCH` | Server responds **`Pending`**, never `Rejected`, and **MUST** include a `details` object carrying `expected` and `declared`. `Pending` keeps the command channel open so an operator can repair the disagreement; `Rejected` would close the only channel through which it could be repaired. The station keeps retrying, answers commands meanwhile, and **MUST NOT** alter its declaration to match. Applies identically on a **first** boot — see §6.1. |
| Protocol version mismatch | `1007 PROTOCOL_VERSION_MISMATCH` | Server responds with `Rejected`, and includes both the `supportedVersions` array and a `retryInterval`. Station **MUST** keep retrying BootNotification per CORE-011 and **MUST NOT** stop: it accepts no commands while rejected, so it cannot be handed a firmware update in that state, and the retry is also what recovers it if the server regains support for its MAJOR version. The cause is fixed by upgrading station firmware to a supported MAJOR, or by restoring server-side support, after which a retry succeeds. |
| Server internal error | `6001 SERVER_INTERNAL_ERROR` | Server responds with `Rejected` and `retryInterval`. Station retries. |

### 6.1 Topology on a First Boot

Provisioning creates the station's bay records; BootNotification never does. The two declarations — the one submitted at provisioning and the one restated at boot — therefore originate from the same station within one commissioning act, and a **first boot matches**.

It can fail in exactly one way: the station declared one topology at provisioning and a different one at boot. That is the same disagreement as any other, and it takes the same path — `3018 TOPOLOGY_MISMATCH` on a **`Pending`** response, with `details`.

There is **no first-boot exemption**, and deliberately so. An exemption would have the server record whatever the first boot happened to say, which makes the provisioning declaration decorative and turns the one boot where a commissioning error is cheapest to catch into the one boot that cannot catch it. A station whose two declarations disagree has a firmware fault or a commissioning fault; both are worth the same held state at boot 1 as at boot 100, and `Pending` is a held state an operator can act on.

The server **MUST NOT** create, extend or trim bay records from a BootNotification, on a first boot or any other. Re-provisioning is what changes a station's topology.

## 7. Examples

### 7.1 Request

```json
{
  "messageId": "msg_b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "Request",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:00:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "stationId": "stn_a1b2c3d4e5f6",
    "firmwareVersion": "1.2.3",
    "stationModel": "SSP-3000",
    "stationVendor": "AcmeCorp",
    "serialNumber": "ACME-SSP-20250187",
    "bays": [
      { "bayNumber": 1, "programNumbers": [1, 2, 3] },
      { "bayNumber": 2, "programNumbers": [1, 2, 3] },
      { "bayNumber": 3, "programNumbers": [1, 2, 3] }
    ],
    "uptimeSeconds": 42,
    "pendingOfflineTransactions": 2,
    "timezone": "Europe/London",
    "bootReason": "PowerOn",
    "capabilities": {
      "bleSupported": true,
      "offlineModeSupported": true,
      "meterValuesSupported": true,
      "deviceManagementSupported": true
    },
    "networkInfo": {
      "connectionType": "Ethernet",
      "signalStrength": null
    }
  }
}
```

### 7.2 Response (Accepted)

```json
{
  "messageId": "msg_b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "Response",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:00:00.250Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted",
    "serverTime": "2026-02-13T10:00:00.250Z",
    "heartbeatIntervalSec": 30,
    "configuration": {
      "RevocationEpoch": "42",
      "MaxSessionDurationSeconds": "900",
      "OfflineModeEnabled": "true",
      "MeterValuesInterval": "60"
    },
    "sessionKey": "dGFwbHktc2Vzc2lvbi1rZXktMjAyNi0wMi0xM1QxMDowMDowMC4wMDBa"
  }
}
```

### 7.3 Response (Pending — topology mismatch)

The station declared a third bay the server has no record of. It stays reachable and answers commands; it serves nobody until an operator resolves the disagreement.

```json
{
  "messageId": "msg_b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "Response",
  "action": "BootNotification",
  "timestamp": "2026-02-13T10:00:00.250Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Pending",
    "serverTime": "2026-02-13T10:00:00.250Z",
    "heartbeatIntervalSec": 30,
    "retryInterval": 300,
    "errorCode": 3018,
    "errorText": "TOPOLOGY_MISMATCH",
    "details": {
      "expected": [
        { "bayNumber": 1, "programNumbers": [1, 2, 3] },
        { "bayNumber": 2, "programNumbers": [1, 2, 3] }
      ],
      "declared": [
        { "bayNumber": 1, "programNumbers": [1, 2, 3] },
        { "bayNumber": 2, "programNumbers": [1, 2, 3] },
        { "bayNumber": 3, "programNumbers": [1, 2, 3] }
      ]
    }
  }
}
```

## 8. Related Schemas

- Request: [`boot-notification-request.schema.json`](../../../schemas/mqtt/boot-notification-request.schema.json)
- Response: [`boot-notification-response.schema.json`](../../../schemas/mqtt/boot-notification-response.schema.json)
- Station ID: [`station-id.schema.json`](../../../schemas/common/station-id.schema.json)
- Timestamp: [`timestamp.schema.json`](../../../schemas/common/timestamp.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2001, 1005, 1007, 3018, 6001)
