# Reset

> **Status:** Draft

Reboot the station. There is exactly one reset operation and it preserves everything the station has persisted; the only choice the command offers is `force`, whether to reboot while a session is running. The station **MUST** handle active sessions per §5 before rebooting.

## 1. Overview

Reset is a server-initiated command that instructs the station to **reboot**. There is exactly one reset operation: the firmware restarts and everything persisted — credentials, configuration, catalog, logs, buffered events — survives. The only choice the command offers is whether to reboot while a session is running, carried by `force`.

There is **no remote factory reset and no remote credential wipe** in OSPP; §5.1 says why, and what replaced it. Automatic reboot after configuration changes is configurable via `AutoRebootEnabled` (see §8 Configuration).

## 2. Direction and Type

- **Direction:** Server to Station
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|--------|--------|----------|-----------------------------------------------|
| `force` | boolean | No | Reboot even while a session is running. Default `false`. |

There is exactly **one** reset operation and it is a **reboot**. Everything the station has persisted survives it. No value of this message clears credentials.

## 4. Response Payload

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `errorCode` | integer | No | OSPP error code (present when `status` is `Rejected`). |
| `errorText` | string | No | Machine-readable error name (present when `status` is `Rejected`). |

## 5. Processing Rules

1. On receiving a Reset command, the station **MUST** first check for active sessions.
2. If any bay has an active session and `force` is absent or `false`, the station **MUST** respond `Rejected` with `3016 ACTIVE_SESSIONS_PRESENT` and **MUST NOT** reboot. The server **MAY** re-issue the command once sessions have completed.
3. If any bay has an active session and `force` is `true`, the station **MUST** first settle every active session under the **operator-disable policy** ([04-flows.md](../../04-flows.md#the-operator-disable-policy)) — the session is stopped, metered from the time actually delivered, and reported as SessionEnded [MSG-040] with `reason: OperatorStopped`, so the customer is billed for what they actually received — and **MUST** complete that settlement before rebooting. `force` is not a licence to drop a session on the floor; it is a licence to end it without waiting.
4. If no bay has an active session, the station **MUST** respond `Accepted` and then reboot.
5. The station **MUST** send the response **before** rebooting, so the server receives acknowledgement.
6. On reboot the station **MUST** restart its firmware. Configuration, credentials, logs and persisted data **MUST** be preserved. After restarting it **MUST** send a BootNotification with `bootReason: "RemoteReset"` — the value that says the server asked for this return, distinguishing it from a spontaneous one.
7. The response `messageId` **MUST** match the request `messageId`.

### 5.1 There Is No Remote Factory Reset

**A remote credential wipe is not part of OSPP.** Factory reset is **physical** — a button, or an SD card — and is out of scope for this protocol.

This is a deliberate removal, and the reason is that OSPP has no bootstrap credential.

Re-provisioning requires the station to reach the provisioning endpoint, validate the server that answers, date that server's certificate, and present the **same** `stationId`. None of that is recoverable in band, because every in-band channel needs a credential a wipe would have destroyed. The protocols that *do* permit a remote wipe keep something back to make it survivable: TR-069 and LwM2M both retain a bootstrap credential across a factory reset, precisely so the device can still be re-enrolled afterwards. OSPP retains nothing of the kind. OCPP does not offer a remote factory reset at all.

So a remote wipe in OSPP is a supported command that makes a station **unreachable by every channel it has** — recoverable only by a site visit. A command whose successful execution can strand the device is not a management feature.

> **Provenance, because it explains the defect.** `Hard`/`Soft` was borrowed from OCPP 1.6, where the pair means **abrupt versus graceful restart** and touches no credential whatsoever. The credential-wipe meaning was attached to `Hard` later, and it was attached in a **conformance case** rather than in a design decision — which is why the wire carried a destructive operation that no requirement had ever argued for.

### 5.2 What a Physical Factory Reset MUST Preserve

Physical factory reset is out of band, but its **scope** is normative here, because a physical reset that erased everything would be exactly as unrecoverable as the remote one just removed.

These are the *Required configuration* of [Chapter 01 — Architecture §7.2](../../01-architecture.md#72-physical-configuration). They **MUST** survive, or be reintroduced by the same out-of-band means that supplied them originally:

| Item | Why it cannot be recovered in band |
|------|-------------------------------------|
| `stationId` | Re-provisioning re-credentials an **existing** station; the server **MUST NOT** allocate a new one, and the CSR's Subject CN must carry it |
| Network configuration | Nothing can be reached without it |
| Provisioning endpoint origin | The station cannot address the call that restores everything else |
| HTTPS trust policy | The station cannot validate the server that answers that call |
| Broker trust policy | The station cannot validate the broker. Recoverable in band **only** under a private CA hierarchy, where the provisioning response's `brokerRootCa` carries it. Under a publicly-trusted hierarchy `brokerRootCa` is absent by design and nothing in band supplies the anchor |
| Initial time source | The station cannot evaluate that server's certificate validity period |
| Root CA public certificate | Embedded in firmware ([Chapter 06 §4.2](../../06-security.md)), so unaffected by any configuration reset |

A station that clears any row of this table is **bricked** — it holds no credential and can no longer obtain one. An implementation **MUST NOT** treat "restore factory defaults" as authority to do so.

## 6. Active Session Handling

When the station has active sessions at the time of a Reset request:

1. Without `force`, the station **MUST** respond `Rejected` with `3016 ACTIVE_SESSIONS_PRESENT`.
2. The server **SHOULD** wait for active sessions to complete naturally, then re-issue the Reset command.
3. Alternatively, the server **MAY** send StopService for each active session, wait for confirmation, and then re-issue.
4. If the server needs the reboot regardless, it **MAY** set `force: true`, which settles the sessions under the [operator-disable policy](../../04-flows.md#the-operator-disable-policy) — each reported with `reason: OperatorStopped` — and then reboots. It **SHOULD** prefer option 3 where it can wait, because an explicit StopService produces a cleaner audit trail than a forced settlement.

## 7. Error Codes

| Error Code | Error Text | Severity | Description |
|------------|-------------------------------|----------|-----------------------------------------------|
| `3016` | `ACTIVE_SESSIONS_PRESENT` | Warning | The station has active sessions and cannot reset. Stop sessions first. |
| `5107` | `OPERATION_IN_PROGRESS` | Warning | Another operation is already in progress on the station. |
| `5110` | `RESET_FAILED` | Critical | The station encountered a hardware or software error during reset. |

## 8. Examples

### 8.1 Request (reboot when idle)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cdef-567890123ab0",
  "messageType": "Request",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "force": false
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
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 8.3 Request (forced reboot)

```json
{
  "messageId": "msg_d5e6f7a8-b9c0-1234-cde1-567890123ab1",
  "messageType": "Request",
  "action": "Reset",
  "timestamp": "2026-02-13T10:23:00.000Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "force": true
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
  "protocolVersion": "0.3.0",
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
