# Reset

> **Status:** Draft

Perform a soft or hard reset on the station. The station **MUST** handle active sessions gracefully before resetting.

## 1. Overview

Reset is a server-initiated command that instructs the station to perform either a soft reset (firmware restart) or a hard reset (factory defaults). A soft reset restarts the station firmware while preserving all configuration and data. A hard reset restores the station to factory defaults, clearing its provisioned identity and all server-supplied configuration and cached data — but **not** the out-of-band bootstrap inputs it needs in order to be provisioned again; §5.1 draws that line, and a station that crosses it cannot be recovered. A hard reset therefore leaves the station **unprovisioned**, and its next OSPP action is provisioning, not BootNotification. Automatic reboot after configuration changes is configurable via `AutoRebootEnabled` (see §8 Configuration).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|--------|--------|----------|-----------------------------------------------|
| `type` | string | Yes | `Soft` (firmware restart) or `Hard` (factory reset). |

## 4. Response Payload

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Processing Rules

1. On receiving a Reset command, the station **MUST** first check for active sessions.
2. If active sessions exist, the station **MUST** respond with `Rejected` and error code `3016 ACTIVE_SESSIONS_PRESENT`. The server **MAY** re-issue the command after sessions have completed.
3. If no active sessions exist, the station **MUST** respond with `Accepted` and then initiate the reset.
4. For a **Soft** reset: the station **MUST** restart its firmware process. Configuration, logs, and persisted data **MUST** be preserved. After restart, the station **MUST** send a BootNotification with `bootReason: "ManualReset"`.
5. For a **Hard** reset: the station **MUST** restore factory defaults, clearing its provisioned identity, its cached credentials, its server-supplied configuration and its session history — §5.1 states exactly what is cleared and what is not. It **MUST NOT** send a BootNotification on the restart that follows. A hard-reset station holds no client certificate, and Boot's preconditions are a valid TLS certificate and private key in NVS plus completed provisioning ([Flows §1](../../04-flows.md#1-station-boot--registration)); it therefore restarts into the **not-provisioned** state and re-enters [Station Provisioning (Flows §2)](../../04-flows.md#2-station-provisioning), which is what [re-provisioning](../../04-flows.md#re-provisioning-an-already-provisioned-station) already names a hard reset as the expected path to. The BootNotification follows the reboot that ends a **successful** re-provisioning, and still carries `bootReason: "ManualReset"` — the intervening provisioning is not why the station rebooted.
6. Because re-provisioning requires a **new** provisioning token, a consumed token **MUST NOT** be reused, and the station has no in-band way to request one ([Flows §2](../../04-flows.md#re-provisioning-an-already-provisioned-station)), a server that issues a Hard reset **MUST** be prepared to mint that token and have it delivered out of band. Issuing a Hard reset without doing so leaves the station reachable by no OSPP channel.
7. The station **MUST** send the `Accepted` response before performing the reset to ensure the server receives acknowledgement.
8. The response `messageId` **MUST** match the request `messageId`.

### 5.1 What a Hard Reset Clears, and What It MUST Preserve

A hard reset that erased everything would be unrecoverable by design: re-provisioning requires the station to reach the provisioning endpoint, to validate the server that answers, to date that server's certificate, and to present the **same** `stationId` — which [Flows §2](../../04-flows.md#re-provisioning-an-already-provisioned-station) requires to be unchanged and forbids the server to reallocate. None of those can be recovered in band, because every in-band channel needs the credential the reset just destroyed. The scope is therefore normative rather than left to firmware.

**MUST be cleared** — everything provisioning issues, or the server supplies:

| Item | Restored by |
|------|-------------|
| mTLS client certificate and its private key | the provisioning response |
| Receipt-signing key pair | regenerated on-device, resubmitted |
| Static BLE ECDH key pair and the `stationIdentity` certificate | regenerated on-device, resubmitted (BLE stations only) |
| `stationCaChain`, `brokerRootCa`, `rootCaThumbprint`, `serverVerifyKey` | the provisioning response |
| `mqttConfig` | the provisioning response |
| `bayIds` | the provisioning response — the array and **its order**, which is what carries the bay-number mapping ([Flows §2](../../04-flows.md#2-station-provisioning)) |
| HMAC session key | the BootNotification response (RAM-only in any case — [Chapter 06 §4.5](../../06-security.md)) |
| Configuration keys ([Chapter 08](../../08-configuration.md)) | reset to documented defaults; server re-pushes |
| Service catalog | UpdateServiceCatalog |
| Session history and buffered events | not restored |

**MUST survive the reset, or be reintroduced by the same out-of-band means that supplied it originally** — these are the *Required configuration* of [Chapter 01 — Architecture §7.2](../../01-architecture.md#72-physical-configuration):

| Item | Why it cannot be recovered in band |
|------|-------------------------------------|
| `stationId` | Re-provisioning re-credentials an **existing** station; the server **MUST NOT** allocate a new one, and the CSR's Subject CN must carry it |
| Network configuration | Nothing can be reached without it |
| Provisioning endpoint origin | The station cannot address the call that restores everything else |
| HTTPS trust policy | The station cannot validate the server that answers that call |
| Broker trust policy | The station cannot validate the broker. Recoverable in band **only** under a private CA hierarchy, where the provisioning response's `brokerRootCa` carries it — that field is a row of the *cleared* table above, and this row is not it. Under a publicly-trusted hierarchy `brokerRootCa` is absent by design and nothing in band supplies the anchor |
| Initial time source | The station cannot evaluate that server's certificate validity period |
| Root CA public certificate | Embedded in firmware ([Chapter 06 §4.2](../../06-security.md)), so unaffected by a configuration reset |

The MQTT broker URL of §7.2 **MAY** be cleared: the provisioning response carries `mqttConfig`, so it is restored in band.

A station that clears any row of the second table is **bricked by a supported command** — it holds no credential and can no longer obtain one. Implementations **MUST NOT** treat "restore factory defaults" as authority to do so.

## 6. Active Session Handling

When the station has active sessions at the time of a Reset request:

1. The station **MUST** respond with `Rejected` and error code `3016 ACTIVE_SESSIONS_PRESENT`.
2. The server **SHOULD** wait for active sessions to complete naturally, then re-issue the Reset command.
3. Alternatively, the server **MAY** send StopService commands for each active session first, wait for confirmation, and then re-issue the Reset command.
4. If the server needs an immediate reset regardless of active sessions, it **SHOULD** first stop all active sessions via StopService and then re-issue the Reset command.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `3016` | `ACTIVE_SESSIONS_PRESENT` | Warning | The station has active sessions and cannot reset. Stop sessions first. |
| `5107` | `OPERATION_IN_PROGRESS` | Warning | Another operation is already in progress on the station. |
| `5110` | `RESET_FAILED` | Critical | The station encountered a hardware or software error during reset. |

## 8. Examples

### 8.1 Request (Soft Reset)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cdef-567890123ab0",
  "messageType": "Request",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.000Z",
  "source": "Server",
  "protocolVersion": "0.2.1",
  "payload": {
    "type": "Soft"
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cdef-567890123ab0",
  "messageType": "Response",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.150Z",
  "source": "Station",
  "protocolVersion": "0.2.1",
  "payload": {
    "status": "Accepted"
  }
}
```

### 8.3 Request (Hard Reset)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cde1-567890123ab1",
  "messageType": "Request",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.000Z",
  "source": "Server",
  "protocolVersion": "0.2.1",
  "payload": {
    "type": "Hard"
  }
}
```

### 8.4 Response (Rejected -- Active Sessions)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cde1-567890123ab1",
  "messageType": "Response",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.150Z",
  "source": "Station",
  "protocolVersion": "0.2.1",
  "payload": {
    "status": "Rejected",
    "errorCode": 3016,
    "errorText": "ACTIVE_SESSIONS_PRESENT"
  }
}
```

## 9. Related Schemas

- Request: [`reset-request.schema.json`](../../../schemas/mqtt/reset-request.schema.json)
- Response: [`reset-response.schema.json`](../../../schemas/mqtt/reset-response.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 3016, 5107, 5110)
