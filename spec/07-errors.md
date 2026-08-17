# Chapter 07 — Error Codes & Resilience

> **Status:** Draft | **OSPP Version:** 0.20.1

This chapter defines the complete error taxonomy for the OSPP protocol, including the error code registry, standard error response format, retry policies, circuit breaker patterns, and graceful degradation behavior.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

For message references, see [Chapter 03 — Message Catalog](03-messages.md). Messages are referenced as **[MSG-XXX]**. For flow references, see [Chapter 04 — Flows](04-flows.md).

---

## 1. Error Code Structure

### 1.1 Code Ranges

Error codes are organized into six functional categories. Each category occupies a 1000-code range with sub-ranges for logical grouping.

| Range | Category | Tier | Count | Description |
|:------|----------|:----:|:-----:|-------------|
| 1000–1999 | **Transport Errors** | Protocol | 15 | Network, protocol, message format, and message integrity errors |
| 2000–2999 | **Authentication & Authorization Errors** | Protocol | 20 | Identity verification, credential validation, and access control |
| 3000–3999 | **Session & Bay Errors** | Application | 20 | Bay state, session lifecycle, reservation, and service errors |
| 4000–4999 | **Payment & Credit Errors** | Application | 20 | Wallet balance, payment processing, refunds, offline credit limits, and certificate and provisioning management |
| 5000–5999 | **Station Hardware & Software Errors** | Application | 34 | Physical hardware faults and embedded software errors |
| 6000–6999 | **Server Errors** | Application | 9 | Server-side processing, timeouts, and infrastructure errors |
| 9000–9999 | **Vendor-Specific** | Vendor | — | Reserved for vendor-defined error codes |

**Error tiers:**

- **Protocol tier** (1000–2999): Errors related to transport, message format, envelope validation, and identity authentication. These errors indicate that the protocol communication itself has failed and the message could not be processed. Protocol-tier errors are typically handled by the communication layer.
- **Application tier** (3000–6999): Errors related to business logic, state violations, hardware conditions, and server-side processing. These errors indicate that the message was received and understood, but the requested operation could not be completed. Application-tier errors are handled by the application layer.
- **Vendor tier** (9000–9999): Reserved for implementation-specific error codes. Vendors **MUST** document their vendor error codes separately.

**Total: 118 standard error codes.**

### 1.2 Severity Levels

Every error code is assigned a fixed severity level that indicates its impact and expected response.

| Severity | Description | Expected Response |
|----------|-------------|-------------------|
| **Critical** | System cannot continue safe operation. Immediate action required. | Station SHOULD transition to `Faulted` state for affected bay(s). Report via SecurityEvent [MSG-012] if security-related. Immediate operator notification. |
| **Error** | Operation failed but the system can continue operating. | Log error, attempt recovery per retry policy, report to server if station-originated. |
| **Warning** | Degraded operation; attention needed but system remains functional. | Log event, monitor for escalation, continue operation. |
| **Info** | Informational; no corrective action required. | Log only. MAY be omitted from error responses if implementation prefers. |

**Severity escalation rules:**

- **3+ Warning** errors of the same code within 5 minutes on the same bay SHOULD escalate to **Error** severity in the next StatusNotification.
- **3+ Error** events of the same code within 10 minutes on the same bay SHOULD trigger a transition to **Faulted** state (effective **Critical**).
- A **Critical** error that a **station** detects SHOULD be reported via SecurityEvent [MSG-012], using the `type` its §3 registry entry names — `MacVerificationFailure` for `1012`, `OfflinePassRejected` for `2005`/`2017`, `ServerSignedAuthReplay` for `2018`, `FirmwareIntegrityFailure` for `5112`, `HardwareFault` for `5004`, and so on. There is no blanket `HardwareFault`/`SoftwareFault` rule: SecurityEvent is Station→Server only, so server-detected Critical codes such as `4008 WEBHOOK_SIGNATURE_INVALID` have no SecurityEvent path at all.

### 1.3 Error Object Fields

An error is described by the fields below. Five of them are **per-code** and are defined once, in the [§3](#3-error-code-registry) registry — any implementation holding an `errorCode` can look them up without them being transmitted. The rest are **per-occurrence** and only the emitter can supply them.

The *Required* column below describes the **Error Object**: the complete structure, which is what REST carries as its response body (§2.4) and what Appendix C validates. It is **not** a claim that every field travels on every transport — see *Wire carriage* below.

| Field | Type | Source | Required | Description |
|-------|------|--------|:--------:|-------------|
| `errorCode` | integer | per-code | **REQUIRED** | Numeric error code from the ranges in §1.1. |
| `errorText` | string | per-code | **REQUIRED** | Machine-readable error name in `UPPER_SNAKE_CASE` (e.g., `BAY_BUSY`). Stable across versions — clients MAY use this for programmatic matching. |
| `errorDescription` | string | per-occurrence | **REQUIRED** | Human-readable description of **this occurrence** and its context — the bay, field, threshold, or identifier involved. Varies per occurrence; see §1.4. |
| `severity` | string | per-code | **REQUIRED** | One of: `Critical`, `Error`, `Warning`, `Info`. |
| `recoverable` | boolean | per-code | **REQUIRED** | `true` if the error can be resolved by retry, user action, or automatic recovery. `false` if manual intervention or system repair is required. |
| `recommendedAction` | string | per-code | **REQUIRED** | The corrective action the §3 registry gives for this `errorCode`. Per-**code**, not per-occurrence; see §1.4. |
| `timestamp` | string | per-occurrence | **REQUIRED** | ISO 8601 UTC with milliseconds — when the error was detected. |
| `vendorErrorCode` | string | per-occurrence | OPTIONAL | Vendor-specific sub-code for proprietary diagnostics (see §8). |
| `details` | object | per-occurrence | OPTIONAL | Additional structured context (e.g., which field failed validation, threshold values, etc.). OPTIONAL in general, but **REQUIRED** for a code whose registry entry branches on a member of it — see §1.4, and Appendix C, whose conditional blocks enforce it. |

**Wire carriage is per transport.** The registry is universal; the wire representation is not.

- **REST** ([§2.4](#24-rest-api-error-response)) — the full Error Object above **is** the response body.
- **MQTT** ([§2.1](#21-mqtt-error-response)) — `status`, `errorCode` and `errorText`, inside `payload`, and only where the message's own schema declares those members; §2.1 names the messages whose schemas do not. The per-code fields not carried are **derivable from `errorCode`** via §3; `errorDescription` is not carried at all.
- **BLE** ([§2.3](#23-ble-error-response)) — as §2.3 states, under the MTU constraints given there.

The asymmetry is principled rather than incidental. `recommendedAction` and `errorDescription` are written **for a human**. On REST the caller is frequently a technician or an integrator debugging a live request — precisely the case where a missing recovery action is expensive, and the reason `recommendedAction` is REQUIRED in the object at all. On MQTT the receiver is **firmware**: it branches on `errorCode`, logs the code, and the technician who later reads that log looks the code up in §3, so transmitting the prose adds nothing at the point of receipt. Several hundred characters of human-readable text on every error would also be charged, per byte, on a metered cellular link — the transport least able to afford it.

### 1.4 Provenance of `errorDescription` and `recommendedAction`

The two prose fields are not interchangeable, and only one of them is free text.

**`recommendedAction` is per-code and comes from the registry.** Wherever it is carried — the REST body (§2.4), and any other transport whose message schema declares the member (§1.3, *Wire carriage*) — it **MUST** carry the *Recommended Action* that [§3](#3-error-code-registry) gives for that `errorCode`. It is a property of the **code**, not of the occurrence: two errors carrying the same `errorCode` **MUST** carry the same `recommendedAction`. That equality is on the **corrective action, not on the bytes**: one `errorCode` **MUST NOT** carry two different instructions, while a translation — or a shortening permitted below — satisfies the rule provided the action itself is preserved. Byte-identity is not achievable in any case, since translation is expressly permitted, so a conformance test **MUST NOT** assert it. An implementation **MUST NOT** substitute a generic string derived from `severity` or `recoverable` — "Review the error details and take corrective action" is not a conforming value for a code whose registry entry says which token to request and which keys not to regenerate. Where a registry entry addresses more than one party (`Station: … Operator: …`), the emitted value **MUST** preserve the part addressed to the receiver and **MAY** carry the rest. A server **MAY** translate it, and **MAY** shorten it to fit the bound in Appendix C, provided the corrective action itself survives.

**A registry cell MUST fit the wire bound.** Because the value is per-code, every *Recommended Action* cell in [§3](#3-error-code-registry) **MUST** itself fit the `recommendedAction` `maxLength` of Appendix C. A cell that cannot be emitted as written has no canonical form: each emitter would have to shorten it independently, and two conforming servers would then carry different values for one `errorCode`, which the per-code equality rule above forbids. An entry added or revised with an over-length cell is a defect in that entry, and is fixed by shortening the cell — never by leaving emitters to shorten it for themselves. Rationale belongs in the *Description* column, which has no wire bound; the *Recommended Action* column carries instruction only.

This is the field the receiver acts on, and it is the reason the field is REQUIRED in the Error Object. A code whose recommended action is *request a new token, and do not regenerate keys first* is actionable only if that sentence actually reaches the reader; a placeholder derived from severity tells them nothing the HTTP status did not already say. The worked examples throughout this section — the provisioning codes `2019`, `4010`, `4015`, `4016`, `4017` — are all reached over **REST**, where the full object is the body and the sentence does arrive. Where a transport carries only `errorCode` (§1.3, *Wire carriage*), the obligation is discharged by the code itself: the receiver looks the action up in §3, which is why every entry there must be correct and none may be a placeholder.

**Recommended actions are per-code, so they must hold on every path.** This is a rule for *authoring this registry*, and it binds the entry — not a second obligation on the emitter, which discharges §1.4 by carrying what §3 gives. A `recommendedAction` **MUST** be correct in every context from which its `errorCode` is reachable ([§4](#4-error-code-usage-per-message)). Where a code is reachable from two paths whose safe recovery differs, the entry **MUST** either be split into two codes, or state the branches and name the `details` member that selects them — which the emitter then **MUST** carry. A branching entry is emitted **in full**; emitting only the selected branch violates the per-code equality rule above. Where branches disagree on safety, the entry **MUST** name the branch a receiver assumes when the discriminator is absent, and that default **MUST** be the one whose failure mode is recoverable.

The last clause is the load-bearing one. A receiver generally cannot tell which path it is on — that is precisely why the discriminator exists — so an absent discriminator must not leave it guessing. Defaulting to the recoverable branch means the worst consequence of an emitter that omits the field is a wasted round trip, never a state the receiver cannot leave. `4010`, `4016` and `4019` are the worked examples: all three default to `retry`, under which the station leaves its keys alone. `4018` is the same rule on a different discriminator: its `already_consumed` branch is the recoverable one and is therefore the default, and neither branch permits regenerating a key. `6008` applies the rule to an **absent** discriminator rather than an unrecognised one: with no `details.wouldBe` a receiver cannot know what the station would have said, so it defaults to the command having been refused and not performed. Re-issuing a command that was already refused costs a round trip; believing a command ran that never left the server is a state the receiver cannot detect and cannot leave.

**This does not make `details` mandatory in general.** [§1.3](#13-error-object-fields) marks `details` **OPTIONAL**, and it remains optional for every code whose registry entry does not branch. The requirement here is conditional and code-scoped: for a code whose entry names a discriminator inside `details`, that member is **REQUIRED** on that code, and the code's own registry row is where the obligation is stated. A branching entry is a stated exception to §1.3's default, not a revision of it.

**Scope: entries as written or revised.** The every-path rule binds every code added from this version onward, and every existing entry from the moment it is next revised. An entry authored before the rule is **not** non-conforming merely because the rule now exists, and an implementation that emits such an entry as this section requires is **not** thereby in violation. The two obligations bind different parties and cannot conflict: an entry that is wrong on one of its paths is a defect *in this chapter*, to be repaired here by revising the entry, and it is never grounds for an implementation to substitute text of its own. Bringing the whole registry into line with the every-path rule is known, unscheduled work.

**`errorDescription` is per-occurrence and is written by the emitter.** It **MUST** describe *this* occurrence — the bay, field, threshold, identifier, or limit involved — and therefore varies between two errors carrying the same `errorCode`. The registry's *Description* column is **guidance for what to write**, not the value to emit: it exists to explain the code to an implementer, it is written in Markdown, and some entries exceed the wire bound of Appendix C. An implementation **MUST NOT** emit a registry *Description* cell verbatim as `errorDescription`, and a generator **MUST NOT** be built to do so.

---

## 2. Error Response Format

### 2.1 MQTT Error Response

When a station or server rejects a REQUEST, it **MUST** respond with a RESPONSE message whose `payload` carries `status: "Rejected"`, `errorCode`, and `errorText`.

That holds wherever the message's own response schema declares those members. **Seven do not**, and every response schema is closed (`additionalProperties: false`), so on those messages an `errorCode` cannot be placed on the wire at all:

| Response schema | How a rejection is signalled | `errorCode` on the wire |
|---|---|:---:|
| `transaction-event-response` | `status` + `reason` (REQUIRED when not `Accepted`) — see [reconciliation §6.4](profiles/offline/reconciliation.md#64-response) | no |
| `authorize-offline-pass-response` | `status` + `reason` | no |
| `data-transfer-response` | `status` (`Rejected`, `UnknownVendor`, `UnknownData`) | no |
| `trigger-message-response` | `status` (`Rejected`, `NotImplemented`) | no |
| `change-configuration-response` | per-key `results[].status`, with `results[].errorCode` / `results[].errorText` | per key, not top level |
| `get-configuration-response` | declares no `status`; a rejection is not expressible | no |
| `heartbeat-response` | declares no `status`; a rejection is not expressible | no |

`boot-notification-response` **was** on this list and is not any more: it now declares `errorCode` and `errorText`, both **REQUIRED when `status` is `Rejected`**. That message carries four codes with four different recoveries — `2001`, `1005`, `1007`, `6001` — so a station that could not read the code could not select among them, and the per-code recoveries in §3 could not execute on the one path every station traverses at every boot.

This is a **known gap, not a permission**. §4 assigns error codes to several of these actions that their schemas cannot carry, and closing it requires schema changes and an SDK re-vendor; it is recorded as unscheduled work in [ROADMAP.md](../ROADMAP.md). An implementation **MUST NOT** read this as licence to omit `errorCode` on a message whose schema does declare it.

```json
{
  "messageId": "cmd_550e8400-e29b-41d4-a716-446655440000",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-01-30T12:05:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Rejected",
    "errorCode": 3001,
    "errorText": "BAY_BUSY"
  }
}
```

**Rules:**

- The `messageId` in the RESPONSE MUST match the `messageId` of the originating REQUEST.
- The `action` field MUST match the originating REQUEST's action.
- The `status` field MUST be `"Rejected"` when an error is present.
- The `source` field MUST indicate who generated the error (`"Station"` or `"Server"`).

### 2.2 MQTT Error Event

Stations MAY send unsolicited error reports as EVENT messages (no response expected) for conditions that are not tied to a specific REQUEST.

```json
{
  "messageId": "err_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "Event",
  "action": "SecurityEvent",
  "timestamp": "2026-01-30T12:10:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "eventId": "sec_a1b2c3d4e5f6",
    "type": "HardwareFault",
    "severity": "Critical",
    "timestamp": "2026-01-30T12:10:00.456Z",
    "details": {
      "bayId": "bay_c1d2e3f4a5b6",
      "errorCode": 5001,
      "errorText": "PUMP_SYSTEM",
      "errorDescription": "Actuator overcurrent detected on bay 1. Motor current 8.2A exceeds 6A threshold.",
      "bayNumber": 1,
      "motorCurrentAmps": 8.2,
      "thresholdAmps": 6.0
    }
  }
}
```

### 2.3 BLE Error Response

BLE errors are returned via the TX Response characteristic (FFF4) as AuthResponse, StartServiceResponse, or StopServiceResponse messages with `"result": "Rejected"`.

```json
{
  "type": "AuthResponse",
  "result": "Rejected",
  "error": {
    "errorCode": 2002,
    "errorText": "OFFLINE_PASS_INVALID",
    "errorDescription": "OfflinePass ECDSA P-256 signature verification failed.",
    "severity": "Error",
    "recoverable": false,
    "recommendedAction": "Request a new OfflinePass from the server when connectivity is available.",
    "timestamp": "2026-01-30T12:15:00.789Z"
  }
}
```

**BLE-specific rules:**

- The `type` field indicates the BLE message type that carries the error.
- BLE errors MUST NOT include `vendorErrorCode` or `details` to minimize payload size (BLE MTU constraints).
- If the error payload would exceed the negotiated MTU, the `errorDescription` SHOULD be truncated to fit. The `errorCode` and `errorText` MUST NOT be truncated.

### 2.4 REST API Error Response

REST endpoints **defined by this specification** return errors using standard HTTP status codes with a JSON body that **is** the Error Object of §1.3. *Scope* below fixes which endpoints those are.

The Error Object **MUST** be the top-level JSON object of the response body. It **MUST NOT** be wrapped in an enclosing member (`error`, `data`, or any other name), and the body **MUST NOT** carry sibling members alongside it. Additional per-error context — the reason an input was rejected, a refund record, a circuit-breaker state — **MUST** be carried inside the object's own `details` member (§1.3); `details` is the single extension point, and the Error Object schema is otherwise closed (Appendix C, `additionalProperties: false`).

```json
HTTP/1.1 409 Conflict
Content-Type: application/json
X-Request-Id: req_f47ac10b-58cc-4372-a567-0e02b2c3d479

{
  "errorCode": 3001,
  "errorText": "BAY_BUSY",
  "errorDescription": "Bay bay_c1d2e3f4a5b6 is currently occupied.",
  "severity": "Warning",
  "recoverable": true,
  "recommendedAction": "Select a different bay or wait for the current session to complete.",
  "timestamp": "2026-01-30T12:20:00.000Z"
}
```

**Why flat, and why REST differs from the other two transports.** A REST error body carries the error and nothing else, so there is nothing for a wrapper to disambiguate. MQTT (§2.1) places the error fields inside `payload` because the envelope around it carries routing fields; BLE (§2.3) nests the object because the same body must also carry the `type` and `result` discriminators. Neither constraint applies to an HTTP response, whose status line already carries the outcome. One flat shape across every endpoint in scope means any client — including a hand-written parser on a constrained device — decodes every error with a single code path, and finds `errorCode` at a fixed depth rather than one level deeper on some endpoints than others.

**Scope — the REST surface this specification defines.** The rule above governs every REST endpoint **this specification defines**, and an endpoint is in scope when this specification fixes its behaviour: its path, its request or response body, or the errors it may return. Across that surface there is no per-endpoint variation — an endpoint **MUST NOT** define its own error body, and `errorCode` (the numeric OSPP registry code) is **REQUIRED** on every error, so an endpoint in scope whose failures are outside the registry's existing vocabulary **MUST** have codes registered in §3 rather than substituting an endpoint-local string.

**Mention is not definition.** An endpoint does not come into scope merely by appearing in this specification. A path named in passing; a requirement imposed on a whole class of endpoints an implementation may expose, such as an authorization model or a transport obligation; an operator action described because the protocol depends on its result rather than on how it is performed — none of these fix what the endpoint does, and none brings it into scope. The test is whether this specification determines the endpoint's behaviour, not whether the endpoint is referred to.

A server implementing OSPP **MAY** expose other HTTP APIs alongside that surface. Whatever else a deployment offers over HTTP — administrative, commercial, or operational — is not defined here, is **not** bound by the Error Object, the registry, or this section, and its error format is outside the scope of this specification. Conformance to OSPP says nothing about it either way.

**Why the boundary exists.** It follows from what the registry is. [§3](#3-error-code-registry) models the failure domain of the station protocol — transport, station and credential authentication, sessions and bays, payment and certificates, server-side faults. An endpoint outside that domain has no code in the registry to carry, and registering one would extend a protocol vocabulary to describe behaviour the protocol does not govern; every implementation would then be reading codes for a domain its own product defines differently, or not at all. Requiring the envelope there would make OSPP conformance depend on decisions this specification has no view on. The boundary is the same one drawn for transport in [Chapter 02 — Transport §9.1](02-transport.md#91-general-requirements), which fixes transport-level requirements for any HTTP API a server exposes while leaving the APIs themselves undefined; this section is its error-semantics counterpart, and the two differ deliberately: TLS and content negotiation are hygiene any HTTP surface can satisfy, whereas an error code is a claim about a failure this specification models.

[§4.4](#44-rest-api-endpoints) lists the endpoints in scope as of this revision. It is a consequence of the rule above, not the rule itself: an endpoint is in scope because this specification defines it, not because it appears in that table.

**HTTP status code mapping:**

| HTTP Status | Typical Error Codes | Description |
|:-----------:|---------------------|-------------|
| 400 | 1005, 3015, 4010, 4017, 6004 | Bad request — invalid format or payload |
| 401 | 2008, 2009, 2010, 2019 | Unauthorized — authentication failed or expired |
| 402 | 4001 | Payment required — insufficient balance |
| 403 | 2008 | Forbidden — action not permitted for this role |
| 404 | 3005, 3006, 3012 | Not found — resource does not exist |
| 409 | 3001, 3014, 3019, 4015, 6005, 6008 | Conflict — resource state conflict |
| 422 | 3004, 3008, 3010, 4016, 4020 | Unprocessable — valid format but invalid values |
| 429 | 6006 | Too many requests — rate limit exceeded |
| 500 | 6000, 6001 | Internal server error |
| 502 | 6003 | Bad gateway — station unreachable |
| 504 | 6002 | Gateway timeout — station did not respond |

---

## 3. Error Code Registry

### 3.1 Transport Errors (1xxx)

Transport errors cover network connectivity, protocol negotiation, message format, and message integrity failures.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 1000 | `TRANSPORT_GENERIC` | Error | true | Unclassified transport or communication error. | Retry with exponential backoff; if persistent, report to server. |
| 1001 | `MQTT_CONNECTION_LOST` | Error | true | MQTT connection to broker was lost unexpectedly. | Reconnect with exponential backoff (1s→30s cap). Buffer events locally. See §5.1. |
| 1002 | `MQTT_PUBLISH_FAILED` | Error | true | MQTT PUBLISH failed after all QoS 1 delivery attempts. | Retry publish; if repeated, check broker connectivity. Buffer message for later delivery. |
| 1003 | `TLS_HANDSHAKE_FAILED` | Critical | false | The TLS handshake failed for a reason **not attributable to a certificate**: no mutually supported cipher suite, or no mutually supported protocol version ([Chapter 02 §1.3](../spec/02-transport.md#13-tls-12-floor-13-recommended)). **Distinct from `1004 CERTIFICATE_ERROR`, and narrower than it reads.** Every cause `1004` lists is a certificate-validation failure, and certificate validation happens *during* the handshake, so both codes could describe the same event. **The more specific code wins: a handshake that failed because a presented certificate was expired, revoked, self-signed, or presented a chain that did not validate is `1004`, never `1003`.** This code does not branch — its causes share one recovery, and neither is repaired by touching a certificate. | Check the negotiated TLS version against the 1.2 floor and the configured cipher suites; the certificate is **not** what was rejected, so do not regenerate, re-provision, or discard credentials in response to this code. Report via SecurityEvent [MSG-012]. |
| 1004 | `CERTIFICATE_ERROR` | Critical | false | X.509 certificate is expired, revoked, self-signed, or has an invalid chain. **Distinct from `1003 TLS_HANDSHAKE_FAILED`, which this code takes precedence over.** All four causes below are certificate-validation failures and all four are normally observed *during* a TLS handshake, so `1003` could describe the same event; it **MUST NOT** be used for any of them. `1003` is reserved for a handshake that failed for a reason no certificate caused — cipher-suite or protocol-version negotiation. The two are not alternatives a receiver may choose between: **anything a certificate caused is `1004`.** These causes have **different** correct recoveries, so this is a branching entry per §1.4: servers **MUST** carry `details.cause` (`expired`, `revoked`, `invalid-chain`, or `self-signed`). For `expired` the recovery is fixed by [§4.7.3](06-security.md) and [certificate-renewal.md](profiles/security/certificate-renewal.md) — offline-only BLE mode, **not** provisioning mode. For the other three the station's own key and certificate may be sound and the failure server-side (a rotated Station CA it has not yet been handed is an anticipated case, [Flows §2](04-flows.md#single-use-and-idempotent-retry)), so it still **holds credentials** and [Flows §2](04-flows.md#re-provisioning-an-already-provisioned-station) forbids autonomous re-provisioning. **No branch permits entering provisioning mode.** An absent discriminator needs no guess: expiry is locally determinable from the certificate's own `notAfter`. | Station: never enter provisioning mode and never discard stored credentials. Branch on `details.cause`; if it is absent, read your own certificate's `notAfter`. `expired` — enter offline-only BLE mode (§4.7.3) and await server-triggered renewal. `revoked` / `invalid-chain` / `self-signed` — keep credentials, stay off the broker, alert the operator. Server: reject the connection, alert the operator. |
| 1005 | `INVALID_MESSAGE_FORMAT` | Error | false | Received message is not valid JSON, is missing required envelope fields, or has invalid field types — the receiver could not parse it or could not read its envelope. This code is for **unintelligible messages only**. It is **not** the out-of-order or missing-transaction condition during offline reconciliation: such a message parses, validates, and is understood, so the sender has nothing to correct. There is no error condition there at all — as of 0.9.0 an out-of-order or counter-discontinuous offline transaction is settled normally and the discontinuity raises an operator alert on the station, carrying no error code and no distinct wire status. See [reconciliation §4.2](profiles/offline/reconciliation.md#42-what-the-server-does-with-it). | Log the malformed message. Do NOT retry — sender must fix the message. |
| 1006 | `UNKNOWN_ACTION` | Warning | false | Received message has an `action` field that is not recognized by this implementation. | Respond with REJECTED. Sender should verify protocol version and action name. |
| 1007 | `PROTOCOL_VERSION_MISMATCH` | Error | false | The `protocolVersion` the station declared is **not a member** of the set the server supports. Negotiation is exact match — there is no compatibility relation between versions, and in particular a shared MAJOR implies nothing ([VERSIONING.md](../VERSIONING.md)). Reachable only from BootNotification ([§4.1](#41-station--server-mqtt-actions)), which carries it on a **REJECTED** response — so [CORE-011](profiles/core/README.md) and [§5.2](#52-bootnotification-retry) both apply and retries are unlimited. Resolvable from **either** side: new station firmware, or the server adding that version to its set. Continued retry is what lets the second case recover the fleet unattended; and because a rejected station accepts no commands, it cannot be handed a firmware update while it is rejected, so a station that stopped retrying could only be recovered on site. `recoverable: false` records that someone must act, not that the station should stop retrying. | Station: keep retrying BootNotification at `retryInterval` (default 30 s) per CORE-011, in the `Rejected` restricted state; do **NOT** stop retrying. Record `supportedVersions` for diagnostics. Operator: upgrade station firmware to a version in `supportedVersions`, or add the station's version to the server's set. Server: reject with `Rejected`, including both `supportedVersions` and `retryInterval`. |
| 1008 | `BLE_RADIO_ERROR` | Warning | true | BLE radio hardware or GATT stack error (advertising failure, connection drop, MTU negotiation failure). | Reset BLE stack. If persistent, disable BLE and report via SecurityEvent [MSG-012]. |
| 1009 | `DNS_RESOLUTION_FAILED` | Error | true | Cannot resolve the MQTT broker hostname via DNS. | Retry after 30s. Verify DNS server configuration. Fall back to IP address if configured. |
| 1010 | `MESSAGE_TIMEOUT` | Warning | true | Expected RESPONSE was not received within the action-specific timeout period. | Retry per the action's retry policy (see §5). If max retries exhausted, escalate to ERROR. |
| 1011 | `URL_UNREACHABLE` | Error | true | A remote URL (e.g., firmware download, diagnostics upload) is not reachable. | Retry with exponential backoff. Verify network connectivity and URL correctness. |
| 1012 | `MAC_VERIFICATION_FAILED` | Critical | false | HMAC-SHA256 message authentication code verification failed. The message may have been tampered with. | Reject the message. Log SecurityEvent [MSG-012] with `type: "MacVerificationFailure"`. 3+ failures from same source within 60s → flag as potentially compromised. |
| 1013 | `MAC_MISSING` | Error | false | `MessageSigningMode` is `"All"` and the received message carries no `mac` field, on a message that is not one of the three structural exemptions ([Chapter 06 §5.6](../spec/06-security.md#56-message-signing-classification)). Also emitted when the receiver holds no session key for the peer: unable to verify is unable to accept. | Reject the message — never process it unverified. Log SecurityEvent [MSG-012]. Note where the fault is: a conforming sender **refuses to send** rather than sending unsigned ([Chapter 06 §5.7](../spec/06-security.md#57-failure-handling--both-directions-fail-closed)), so a message reaching this code was produced by a sender that did not fail closed. |
| 1014 | `MESSAGE_TOO_LARGE` | Error | false | Received message exceeds the maximum allowed size (64 KB for MQTT, negotiated MTU for BLE). | Reject the message. Sender must reduce payload size — e.g., split MeterValues into multiple messages. |

### 3.2 Authentication & Authorization Errors (2xxx)

Authentication errors cover identity verification (mTLS, JWT, BLE handshake, OfflinePass) and authorization (role-based access control, action permissions).

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 2000 | `AUTH_GENERIC` | Error | false | Unclassified authentication or authorization error. | Check credentials and permissions. Contact operator if persistent. |
| 2001 | `STATION_NOT_REGISTERED` | Error | false | Station identifier is not recognized by the server. BootNotification was sent by an unknown `stationId`. Emitted on a **REJECTED** BootNotification [MSG-001] (§4.1), so the station is already through mTLS and MQTT CONNECT and **holds credentials the broker accepted** — [Flows §2](04-flows.md#re-provisioning-an-already-provisioned-station) forbids it re-provisioning autonomously in that state, and it has no token and no in-band way to obtain one. The real causes (station not yet entered in the portal, a mistyped `stationId`, a tenant move, a DB restore) are all fixed operator-side, after which the indefinite BootNotification retry required by [CORE-011](profiles/core/README.md) succeeds on its own. `recoverable: false` records that an operator must act, not that the station should stop retrying. | Station: keep retrying BootNotification at `retryInterval` (default 30 s) per CORE-011 — the retry succeeds once the operator acts. Do NOT enter provisioning mode and do NOT alter stored credentials: you hold credentials the broker accepted, and re-provisioning is operator-initiated. Operator: register this `stationId` in the management portal, or correct it if mistyped; check it was not dropped by a tenant move or a database restore. |
| 2002 | `OFFLINE_PASS_INVALID` | Error | false | OfflinePass ECDSA P-256 signature verification failed. The pass data has been tampered with or was signed by an unknown key. | App: request a new OfflinePass from the server. Station: log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. |
| 2003 | `OFFLINE_PASS_EXPIRED` | Warning | true | OfflinePass `expiresAt` timestamp has passed. The pass is no longer valid. | App: request a new OfflinePass from the server. Pass has a maximum validity of 24 hours. |
| 2004 | `OFFLINE_EPOCH_REVOKED` | Error | false | OfflinePass `revocationEpoch` is less than the station's current `RevocationEpoch`. The pass has been batch-revoked. | App: request a new OfflinePass with the current epoch. Station epoch is updated via ChangeConfiguration [MSG-013]. |
| 2005 | `OFFLINE_COUNTER_REPLAY` | Critical | false | A pass usage counter was replayed. **Authorize-time** (AuthorizeOfflinePass): the OfflinePass `counter` is ≤ the station's `lastSeenCounter`. **Reconcile-time** (TransactionEvent): the signed `(offlinePassId, passCounter)` tuple was already settled (pass-form, `reconciliation.md` §6.1 check #13), or an already-reconciled `(authId, sessionId)` was re-presented (auth-form, §6.7) — a cloned or replayed authorization. | Reject. Station (authorize-time): log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. Server (reconcile-time): hard-reject the TransactionEvent and emit the gate SecurityEvent (`reconciliation.md` §6.3). App: if legitimate, request a new OfflinePass. |
| 2006 | `OFFLINE_STATION_MISMATCH` | Error | false | OfflinePass `stationId` constraint does not match the connected station (when station-restricted passes are used). | App: the OfflinePass is not valid for this station. Request a new pass or use an unrestricted pass. |
| 2007 | `COMMAND_NOT_SUPPORTED` | Warning | false | The requested action is recognized but not implemented by this station's firmware or disabled by configuration. | Server: do not retry. Check station capabilities from BootNotification. |
| 2008 | `ACTION_NOT_PERMITTED` | Error | false | The authenticated entity does not have the required RBAC role or permission to perform this action. | Verify the user's role and permissions. Contact the operator admin if elevated access is needed. |
| 2009 | `JWT_EXPIRED` | Warning | true | JWT access token has expired (past `exp` claim). | App: use the refresh token to obtain a new access token. If refresh token is also expired, re-authenticate. |
| 2010 | `JWT_INVALID` | Error | false | JWT is malformed, has an invalid signature, or was signed by an unknown key. | App: clear stored tokens and re-authenticate. May indicate token tampering. |
| 2011 | `SESSION_TOKEN_EXPIRED` | Warning | true | Web payment session token (RFC 4122 UUID, any version) has exceeded its 10-minute TTL. | Browser: restart the payment flow from the QR code scan. |
| 2012 | `SESSION_TOKEN_INVALID` | Error | false | Web payment session token is not found in Redis or has an invalid format. | Browser: restart the payment flow. Do not retry with the same token. |
| 2013 | `BLE_AUTH_FAILED` | Error | false | BLE challenge-response authentication failed. The session key derivation or session proof is invalid. | App: disconnect and retry the BLE handshake. If persistent, report to the server when online. |
| 2014 | `OFFLINE_PASS_REVOKED` | Error | false | OfflinePass `is_revoked` flag is `true` — the pass has been individually revoked (typically due to device replacement or user-initiated revoke). Distinct from `2004 OFFLINE_EPOCH_REVOKED` (batch revocation by epoch bump). | App: request a new OfflinePass. Server: log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. The original pass is permanently dead; the device must obtain a new one. |
| 2015 | `OFFLINE_ORG_MISMATCH` | Error | false | OfflinePass `organization_id` does not match the reporting station's `organization_id`. The pass was issued for a different operator/tenant. Distinct from `2006 OFFLINE_STATION_MISMATCH` (which checks `allowed_station_ids` membership for scoped passes within the same organization). | Server: log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. Cross-organization use is not permitted. The pass holder must request a pass scoped to the operator they wish to transact with. |
| 2016 | `OFFLINE_USER_MISMATCH` | Error | false | OfflinePass `user_id` does not match the `userId` carried in the TransactionEvent envelope. The pass is bound to a different user than the one claimed by the station. | Server: log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. Indicates either a station bug, station-side state corruption, or a deliberate user-id forgery. |
| 2017 | `OFFLINE_RECEIPT_MISMATCH` | Critical | false | One or more of the cryptographically signed fields in `receipt.data` (`offlineTxId`, `offlinePassId`, `userId`, or `deviceId`) does not match the corresponding cross-check target (the TransactionEvent envelope for `offlineTxId` / `offlinePassId` / `userId`; the resolved pass record's `device_id` for `deviceId`). The signature itself verified, but the signed payload disagrees with the envelope's claim or the pass's device binding. It also covers the deduplication case of [`reconciliation.md` §3](profiles/offline/reconciliation.md): a second submission under an `offlineTxId` the server already holds, whose signed `receipt.data` is **not** byte-identical to the stored one. That is two distinct claims under a single identifier — a collision or tampering — and it is answered `Rejected` with both records retained, never `Duplicate`, which would order the station to delete one of the two. | Server: log SecurityEvent [MSG-012] with `type: "OfflinePassRejected"`. The `details.field` element identifies the mismatched field (`offlineTxId` / `offlinePassId` / `userId` / `deviceId` / `receipt.data` for the §3 stored-vs-arriving comparison); `details.signedValue` and `details.expectedValue` carry the forensic pair. This is a strong indicator of envelope tampering or station-side state corruption. |
| 2018 | `SERVER_AUTH_NONCE_MISMATCH` | Critical | false | The `appNonce` claim inside a `ServerSignedAuth` payload (Partial A, `profiles/offline/ble-handshake.md` §4.2.2 check #2) does not match the `Hello.appNonce` of the current BLE handshake. The ECDSA P-256 signature itself verified, so this is a captured-and-replayed authorization being relayed into a different handshake — the primary, clock-independent anti-replay defence. | Station: reject the handshake and disconnect. App: SHOULD obtain a fresh `signedAuthorization` bound to the current `appNonce` and retry. Server: log SecurityEvent [MSG-012] with `type: "ServerSignedAuthReplay"` on the next reconciliation. |
| 2019 | `PROVISIONING_TOKEN_INVALID` | Error | false | The provisioning token presented to `POST /api/v1/stations/provision` did not authenticate: it does **not resolve** to a token bound to the requested station, or it is past its TTL, **superseded** by a re-issuance for that station, or administratively **revoked**. All four are terminal. Servers **SHOULD** carry the discriminator in `details.reason` (`not_found`, `expired`, `superseded`, `revoked`). `not_found` answers here rather than with a distinct status **deliberately**: a status that separated an unknown token from a known-but-dead one would let an unauthenticated caller test token values for existence. HTTP `401 Unauthorized`. Evaluated **second**, after `4017` and before every check that reads a key — see *Error precedence* in [Flows §2](04-flows.md#single-use-and-idempotent-retry). Contrast `4018`: the token authenticated but is already consumed; and `4015`: valid token, changed identity. | Station: display the error and **await a new provisioning token** — no retry with this token can succeed. Operator: issue a fresh token. Do not regenerate keys in response to this error; the keys are not what was rejected. |

> **Note on `2003 OFFLINE_PASS_EXPIRED` context-dependent semantics (v0.4.2):**
> At **authorize-time** (`profiles/offline/authorize-offline-pass.md` §5 check #2 / `offline-pass.md` §4 check #2): severity = `Warning`, recoverable = `true`. The app retries with a fresh pass.
> At **reconcile-time** (`profiles/offline/reconciliation.md` §6 gate check #9): the same error code is emitted with effective severity `Error`, recoverable = `false`. The transaction is in the past — no retry is possible. The station has a clock-drift bug to fix or has retained an offline transaction beyond the pass's 24-hour validity window. Servers SHOULD include `details.context: "reconcile"` on the reconcile-time emission for log clarity.

### 3.3 Session & Bay Errors (3xxx)

Session errors cover bay state transitions, session lifecycle, reservation management, and service validation.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 3000 | `SESSION_GENERIC` | Error | true | Unclassified session or bay error. | Inspect the `errorDescription` for specific context. |
| 3001 | `BAY_BUSY` | Warning | true | The requested bay is currently in `Occupied` or `Finishing` state and cannot accept new sessions or reservations. | Wait for the current session to complete, or select a different bay. Server: refund 100% if this rejects a StartService [MSG-005]. |
| 3002 | `BAY_NOT_READY` | Warning | true | The bay cannot take a session. Either the bay is not in `Available` state — `Unknown`, `Faulted`, `Unavailable`, or transitioning, where `Unknown` covers the post-boot window before StatusNotification is received — **or the station as a whole is in a restricted state** (`Pending` or `Rejected`), in which it answers commands but serves no customers ([Chapter 05 §1.4](05-state-machines.md#14-the-restricted-states)). | Wait and retry. Check StatusNotification [MSG-009] for the bay's current state; if none has arrived at all, the station is not `Operational` and the boot is what needs attention. |
| 3003 | `SERVICE_UNAVAILABLE` | Warning | true | The requested service is not available on this bay (hardware not present, disabled by configuration, or temporarily out of chemicals). | Select a different service or a different bay that supports the requested service. |
| 3004 | `INVALID_SERVICE` | Error | false | The `serviceId` in the request does not exist in the station's service catalog. | Verify the service ID against the station's UpdateServiceCatalog [MSG-021] data. |
| 3005 | `BAY_NOT_FOUND` | Error | false | The `bayId` in the request does not match any bay registered on this station. | Verify the bay ID. The bay may have been decommissioned or the ID may be incorrect. |
| 3006 | `SESSION_NOT_FOUND` | Error | false | The referenced `sessionId` does not exist or has already been completed/expired. | Verify the session ID. For StopService [MSG-006], the session may have already ended (timer expiry or auto-stop). |
| 3007 | `SESSION_MISMATCH` | Error | false | The `sessionId` in a StopService request does not match the currently active session on the specified bay. | Verify the session ID. Use StatusNotification [MSG-009] to determine the active session on the bay. |
| 3008 | `DURATION_INVALID` | Error | false | The requested `durationSeconds` is invalid (zero, negative, or below the service minimum). | Specify a valid duration. Minimum is service-defined (typically 60 seconds). |
| 3009 | `HARDWARE_ACTIVATION_FAILED` | Error | false | Station accepted the session but the hardware (pump, valve, motor) failed to start within the activation timeout. | Server: refund 100%. Station: transition bay to `Faulted`, report via SecurityEvent [MSG-012]. Operator: dispatch technician. |
| 3010 | `MAX_DURATION_EXCEEDED` | Warning | false | The requested session duration exceeds the station's `MaxSessionDurationSeconds` configuration limit. | Reduce the requested duration to at most `MaxSessionDurationSeconds` seconds (default 900s). |
| 3011 | `BAY_MAINTENANCE` | Warning | true | The bay is in `Unavailable` state due to active maintenance mode (SetMaintenanceMode [MSG-020]). | Wait for maintenance to complete. Operator: clear maintenance mode when work is done. |
| 3012 | `RESERVATION_NOT_FOUND` | Error | false | No reservation with the referenced `reservationId` has ever existed on the bay, or it was already consumed by a StartService. NOT emitted for an already-cancelled reservation (`Accepted`, idempotent) or an expired one (`3013`) — [`cancel-reservation.md` §5](profiles/transaction/cancel-reservation.md) rules 2, 3 and 6. | Do not retry. Start a new reservation flow if needed. |
| 3013 | `RESERVATION_EXPIRED` | Warning | true | The reservation's TTL has elapsed. The bay has been automatically released. On ReserveBay it means the `reservationId` is spent and cannot be reused ([`reserve-bay.md` §5.1](profiles/transaction/reserve-bay.md) rule 9). | Create a new reservation. Default TTL is `ReservationDefaultTTL` (300 seconds). |
| 3014 | `BAY_RESERVED` | Warning | true | The bay has an active reservation held by another user/session — or, on ReserveBay, held under the **same** `reservationId` but with differing terms, which is not an idempotent repeat ([`reserve-bay.md` §5.1](profiles/transaction/reserve-bay.md) rule 8). | Wait for the reservation to expire, or select a different bay. |
| 3015 | `PAYLOAD_INVALID` | Error | false | The request payload is structurally valid JSON but a **value is wrong in itself** — negative credits, an empty required string, a value outside its declared range, a member outside a closed enumeration. **Scope, narrowed:** this code covers a value that could never be valid. It does **NOT** cover a well-formed identifier that simply refers to nothing — those are **reference** failures and each identifier kind has its own code (`3004` `serviceId`, `3005` `bayId`, `3006` `sessionId`, `3012` `reservationId`, `3017` `programNumber`). The distinction matters because the recoveries differ: a bad value is fixed by correcting the message, whereas a dangling reference is usually fixed by correcting server-side state, and a single code covering both would give an operator no way to tell which. Malformed JSON is not this code either — that is `1005 INVALID_MESSAGE_FORMAT`. | Fix the payload values. Inspect the `details` field for specific validation errors. If the offending member is an identifier that is well-formed but unknown, the correct code is the one for that identifier kind, not this one. |
| 3016 | `ACTIVE_SESSIONS_PRESENT` | Warning | true | One or more bays have active sessions, so the requested operation (e.g. Reset) cannot proceed until they are completed or stopped. **This is the STATION's answer**, sent in a response to a command the station actually received. A server that stops such a command locally, before dispatching it, **MUST NOT** answer with this code — it answers `6008 COMMAND_PRE_EMPTED` carrying `details.wouldBe: 3016`. The distinction is not bookkeeping: this code proves the message reached the station and the station itself declined, whereas a pre-empt proves only what the server believed, and the server's view of which sessions are live can be stale. | Stop all active sessions first, then retry the operation — or, where the reboot is needed regardless, re-issue the Reset with `force: true`, which the station settles under the [operator-disable policy](../spec/04-flows.md#the-operator-disable-policy) rather than refusing. |
| 3017 | `PROGRAM_NOT_DECLARED` | Error | false | The `programNumber` in the request was never declared for the target bay. The station declares its bays and, per bay, the program ordinals it can run — at provisioning and again at every boot ([Chapter 01 — Architecture §4.2](01-architecture.md)) — and this code says the ordinal received is not in that set for that bay. A **reference** failure, not a value failure: the ordinal is well-formed and in range, it simply names nothing. That is why it is not `3015`, which is about a value being wrong in itself, and not `3003`, which presupposes the program **is** declared and is merely unavailable right now. It follows the registry's own pattern of one code per identifier KIND — `3004` for `serviceId`, `3005` for `bayId`, `3006` for `sessionId`, `3012` for `reservationId` — and a program ordinal is a new kind. The station **MUST** fail closed: reject explicitly, and **MUST NOT** accept the command and do nothing. Accept-and-do-nothing is a customer who paid and received no service, with nothing anywhere recording that it did not happen. The station **MUST NOT** substitute a neighbouring ordinal or clamp to the highest declared one: MDB permits exactly that clamp for vending selections, and it is worse than refusing, because it charges for one thing and delivers another. | Station: reject, echo the refused `programNumber` in the response, and run nothing. Do **NOT** substitute a neighbouring ordinal or clamp to the highest declared one — that charges for one thing and delivers another. Server: the service→program binding names an ordinal this station does not have. Correct the binding, or re-provision the station if its hardware genuinely changed. Operator: compare the station's declared topology against the catalog binding. |
| 3018 | `TOPOLOGY_MISMATCH` | Error | true | The topology the station declared in BootNotification does not match the topology recorded for it at provisioning — a bay number present on one side and not the other, or a program ordinal present on one side and not the other, in **either** direction. Program **labels** are descriptive and are never compared, so a corrected typo in a firmware constant does not reach this code. Carried on a **`Pending`** BootNotification response, never `Rejected`: `Pending` keeps the command channel open so an operator can repair the disagreement, and `Rejected` would remove the only channel through which it could be repaired. `recoverable: true` records exactly that — the station is out of service but reachable. The response **MUST** carry a `details` object naming what was expected and what arrived, because a station held out of service for a reason nobody can see is a station nobody can repair. The station **MUST NOT** alter its declaration to match the server: the declaration describes hardware, and agreeing silently would hide the very hardware change this code exists to surface. | Station: keep the declaration stable and keep retrying BootNotification per [CORE-011](profiles/core/README.md); answer commands while `Pending`. Do **NOT** alter the declaration to match the server — it describes hardware, and agreeing silently hides a real change. Operator: read `details`. If the hardware genuinely changed, re-provision the station, which re-creates the bay records. If it did not, correct the station record server-side; the next boot is then accepted. |
| 3019 | `SERVICE_NOT_BOUND` | Error | true | The server holds **no** service→program binding for the requested (bay, service) pair, so it has no ordinal to put in `programNumber` and cannot form a conforming StartService at all. The mirror image of `3017`, and the distinction is which party is missing something: `3017` is the **station** refusing an ordinal the server sent that the bay never declared; `3019` is the **server** unable to send one, because an operator has not created the binding (the binding is server-minted by an operator — [Chapter 01 §4.2](01-architecture.md)). One code covering both would tell an operator to correct a binding that does not exist. **Server-originated toward the requesting client** — an app, a dashboard, an operator API call — and **MUST NOT** be transmitted to a station, which has no part in the fault and nothing it could do about it. A server MUST NOT substitute a default ordinal, guess from the catalog, or omit `programNumber`: the field is REQUIRED, and each of those three either starts the wrong hardware or produces a message no conforming station will accept. | Operator: create the binding for this (bay, service) pair, naming an ordinal the bay declared at provisioning. Server: name the bay and the service in `details`, and do not dispatch StartService. The customer has not been charged, because nothing was started — say so, rather than reporting a station fault for a condition no station has seen. |

### 3.4 Payment & Credit Errors (4xxx)

Payment errors cover wallet balance, credit limits, payment processing, refunds, and offline spending constraints.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 4000 | `PAYMENT_GENERIC` | Error | true | Unclassified payment or credit error. | Inspect the `errorDescription` for context. Contact support if persistent. |
| 4001 | `INSUFFICIENT_BALANCE` | Warning | true | The user's wallet balance (credits) is insufficient to cover the requested service at its minimum duration. | App: show top-up prompt. Web: redirect to payment page. The user must purchase more credits before starting a session. |
| 4002 | `OFFLINE_LIMIT_EXCEEDED` | Error | false | The OfflinePass's `maxTotalCredits` or `maxUses` limit has been reached. No further offline transactions are permitted with this pass. | App: the user must go online to request a new OfflinePass (or top up credits). |
| 4003 | `OFFLINE_RATE_LIMITED` | Warning | true | The OfflinePass's `minIntervalSec` constraint was violated — not enough time has elapsed since the last offline transaction. | Wait the required interval (default 60 seconds) before attempting another offline transaction. |
| 4004 | `OFFLINE_PER_TX_EXCEEDED` | Error | false | The requested service cost exceeds the OfflinePass's `maxCreditsPerTx` limit for a single transaction. | Select a less expensive service or reduce the requested duration. |
| 4005 | `PAYMENT_FAILED` | Error | true | The payment processor rejected the payment (card declined, 3DS failure, processor error). | User: try a different payment method. Web: restart the payment flow. |
| 4006 | `PAYMENT_TIMEOUT` | Warning | true | The PaymentIntent did not receive a webhook confirmation within its 5-minute TTL. | Check payment status with the processor. If unresolved, mark as expired and inform the user. |
| 4007 | `REFUND_FAILED` | Error | true | The refund request to the payment processor failed. | Retry the refund. If persistent, escalate to manual refund by accounting team. |
| 4008 | `WEBHOOK_SIGNATURE_INVALID` | Critical | false | The payment webhook HMAC-SHA512 signature does not match the expected value. Possible spoofing attempt. | Reject the webhook. Log SecurityEvent. Do NOT process the payment. Alert security team. |

#### 4.01x — Certificate Management Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 4010 | `CSR_INVALID` | Error | true | The Certificate Signing Request is malformed, uses a prohibited key algorithm (must be ECDSA P-256), has an invalid Subject CN, or its `SubjectPublicKeyInfo` cannot be decoded. Reachable from two paths whose safe recovery is **opposite**: certificate renewal (SignCertificate [MSG-022]), where a fresh keypair *is* the renewal, and `POST /api/v1/stations/provision`, where after the token has issued a certificate the submitted key is **bound** and regenerating it is answered `4015` forever. Servers **MUST** therefore carry `details.phase` (`first-provision`, `retry`, or `renewal`) on this code. At the provisioning endpoint: HTTP `400 Bad Request`, evaluated **fourth** — after `4017`, `2019` and `4018`, and before `4020`, `4019`, `4016` and `4015` — see *Error precedence* in [Flows §2](04-flows.md#single-use-and-idempotent-retry); the rejection does not consume the token and alters no binding. | Station: recovery depends on `details.phase`, which the server MUST carry. `first-provision` or `renewal` — regenerate the keypair and CSR with correct parameters and resubmit; nothing is bound yet. `retry` — do NOT regenerate: a fresh key is answered `4015`, which is not recoverable. Resubmit a well-formed CSR over the already-bound key, or request a new token if it cannot be produced. If `details.phase` is absent, assume `retry`. Server: log the specific validation failure. |
| 4011 | `CERTIFICATE_CHAIN_INVALID` | Error | true | The certificate chain verification failed. The signing CA is untrusted, an intermediate certificate is missing, or the signature does not validate. | Server: verify the CA chain is complete and correctly ordered. Station: report the specific chain validation error in the response. |
| 4012 | `CERTIFICATE_TYPE_MISMATCH` | Warning | true | The certificate type in the response does not match the type requested in the CSR, or the station is not authorized for the requested certificate type. | Verify the `certificateType` field matches between SignCertificate and CertificateInstall. |
| 4013 | `RENEWAL_DENIED` | Error | false | The server refuses the certificate renewal request due to policy constraints, rate limiting, or station suspension. | Contact the operator. The server administrator must approve the renewal or adjust the policy. |
| 4014 | `KEYPAIR_GENERATION_FAILED` | Critical | false | The station's secure element, TPM, or crypto hardware cannot generate a new ECDSA P-256 keypair. Possible hardware fault or entropy source failure. | Log SecurityEvent with `HardwareFault` type. Dispatch technician to inspect the station's crypto hardware. |
| 4015 | `PROVISIONING_KEY_MISMATCH` | Error | false | A retry did not match the **bound set** — the key kinds bound at first provision and the key each carried. Either a bound kind carried a **different** public key, or the **set** of kinds differed (one added, or one dropped). This is not a replay, and no second certificate is issued on that token. Reachable **only** on a token that has **already issued** a certificate: the bound set this code compares against is created by that issuance, so consumption is the precondition for reaching it, never a bar to it. HTTP `409 Conflict`. Evaluated **last**, eighth, after every other check this endpoint performs — see *Error precedence* in [Flows §2](04-flows.md#single-use-and-idempotent-retry). | Station: **do NOT retry with this token** — no retry can succeed, because the token is permanently bound to the earlier key. Request a **new** provisioning token from the operator, then provision again with the keys currently held. Server: log the mismatch; the already-issued certificate is unaffected. |
| 4016 | `PROVISIONING_KEY_REUSE` | Error | true | The request submitted the **same public key** for two roles. Submitted keys **MUST** be pairwise distinct, and all three pairs are covered: `tlsCsr` subject key / `receiptSigningPublicKey`, `tlsCsr` subject key / `stationPubKey`, and `receiptSigningPublicKey` / `stationPubKey` ([Chapter 06 §4.3](06-security.md)). HTTP `422 Unprocessable Entity`. Evaluated **seventh** — after `4010`, `4020` and `4019`, and immediately before `4015`. Servers **SHOULD** name the colliding pair in `details`, and **MUST** carry `details.phase` (`first-provision` or `retry`): this code is reachable both before and after the token has issued a certificate, and the safe recovery inverts between them. | Station: recovery depends on `details.phase`. `first-provision` — generate a separate key pair for the colliding role and resubmit; this rejection does not consume the token. `retry` — do NOT regenerate: the bound keys are what was certified, and a fresh key is answered `4015`, which is not recoverable. Resubmit the keys already bound, or request a new token. If `details.phase` is absent, assume `retry`. Firmware deriving two roles from one key slot must be updated. |
| 4017 | `PROVISIONING_REQUEST_INVALID` | Error | true | The body sent to `POST /api/v1/stations/provision` failed schema validation against [`provisioning-request.schema.json`](../schemas/provisioning-request.schema.json) — a required property is absent, or a value violates its declared type, pattern, or bound. Distinct from `4010`, which is a structurally present but cryptographically invalid `tlsCsr`, and from `3015 PAYLOAD_INVALID`, which is a session-scoped semantic failure on a structurally complete body. HTTP `400 Bad Request`. Evaluated **first**, before `2019` — every later check reads a field out of this body; see *Error precedence* in [Flows §2](04-flows.md#single-use-and-idempotent-retry). The rejection does not consume the token and alters no binding. | Station: correct the offending property and resubmit on the **same** token — this rejection does not consume it. Inspect `details` for the failing property path. Do **not** regenerate keys: the keys are not what was rejected, and on a retry a fresh key would be answered `4015`, which is not recoverable. Server: name the failing property and the constraint it violated in `details`. |
| 4018 | `PROVISIONING_TOKEN_CONSUMED` | Error | true | The provisioning token presented to `POST /api/v1/stations/provision` **authenticated**, but has already been consumed and this request is not a replay of the provision that consumed it. Two causes, whose recoveries differ, so this is a branching entry per §1.4: servers **MUST** carry `details.reason`. `already_consumed` — a concurrent request consumed the token between this caller's read and its write; **transient**, and once the winner writes its certificate the same request replays it. `consumed_without_certificate` — the consuming request failed before issuing, so the token is spent and no certificate exists; **terminal**. An absent discriminator defaults to `already_consumed`, the recoverable branch (§1.4). Those two causes are the whole of this code: in both, no certificate exists and therefore no bound set exists, which is what makes it decidable from token state alone. A consumed token that **did** issue a certificate is **not** answered here — it carries a bound set, and is judged a replay or `4015` at the last step. HTTP `409 Conflict`. Evaluated **third**, with the token and after `2019`, before any key is examined. Contrast `2019`: the token did not authenticate at all. Contrast `4015`: the token authenticated and *was* replayed, but the identity presented differs from the bound set. | Station: do NOT regenerate keys on any branch — a fresh key is answered `4015`. Branch on `details.reason`. `already_consumed` — another request holds this token; retry unchanged after a short delay, bounded, until it resolves to the certificate or to the branch below. `consumed_without_certificate` — this token can never issue one; request a new provisioning token. If `details.reason` is absent, assume `already_consumed`. Operator: issue a fresh token. |
| 4019 | `PUBLIC_KEY_INVALID` | Error | true | A **bare public key** submitted to `POST /api/v1/stations/provision` — `receiptSigningPublicKey`, or `stationPubKey` when present — is unusable: it does not decode, or it decodes to something other than an ECDSA P-256 public key (wrong algorithm, or a curve outside the allow-list). The bare-key counterpart of `4010`, which covers the identical defect for the key carried **inside** the `tlsCsr`; both answer `400 Bad Request`, because the same defect in the same request must not vary by how the key was packaged. Schema validation (`4017`) catches only the PEM armour and the SEC1 length and alphabet — neither the DER body, the SEC1 prefix, nor whether the point is on the curve — so a key can pass the schema and still fail here. Servers **SHOULD** name the rejected member in `details.field`. Reachable both before and after the token has issued a certificate, whose safe recoveries are **opposite**, so servers **MUST** carry `details.phase` (`first-provision` or `retry`). Evaluated **sixth** — after `4010` and `4020`, and before `4016` and `4015` — see *Error precedence* in [Flows §2](04-flows.md#single-use-and-idempotent-retry). The rejection does not consume the token and alters no binding. | Station: submit ECDSA P-256 key material only. Recovery depends on `details.phase`. `first-provision` — generate a correct P-256 key for the named role and resubmit on the same token; nothing is bound yet. `retry` — do NOT generate a new key: a fresh key is answered `4015`. Resubmit the key already bound, or request a new token if it cannot be produced. If `details.phase` is absent, assume `retry`. Server: name the rejected member in `details.field`. |

> **The `4.01x` decade is full.** `4010`–`4019` are all assigned. A further certificate- or
> provisioning-management code goes in `4.02x` below rather than extending this table; the heading
> is what carries the grouping, and silently spilling past `4019` would leave the sub-range title
> describing only part of its contents. `4.02x` was opened by `4020` on this basis.

#### 4.02x — Provisioning Errors

Opened because `4.01x` is full (see the note above). `4.01x` is titled *Certificate Management
Errors* and holds `4015`–`4019`, which are provisioning codes rather than certificate ones; this
sub-range is named for what it holds rather than inheriting that. See
[KNOWN-ISSUES](../KNOWN-ISSUES.md) for the grouping defect this makes visible.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 4020 | `BAY_COUNT_MISMATCH` | Error | true | The topology declared in the body of `POST /api/v1/stations/provision` does not match the bays registered for the station the token is bound to: the set of `bayNumber` values in `bays` differs from the registered set — as a **set**, so `{1,3}` against a registered `{1,2}` is a mismatch even though both have two bays. A **submitted-vs-stored** mismatch, structurally the same as `4015` but on a structural attribute rather than on key material, and therefore not a key error: no binding is created or altered and no certificate is issued. Distinct from `4017`, which is schema validation — a `bays` array outside its declared shape or bounds, or more than 64 bays, is rejected there and never reaches this comparison. HTTP `422 Unprocessable Entity`. Evaluated **fifth** — after `4010` and before `4019`, `4016` and `4015` ([Flows §2](04-flows.md#single-use-and-idempotent-retry), step 5): it depends only on the token and the declared bay set, so it is decidable without examining any key, and failing it early avoids key validation on a request that cannot succeed. Reachable **only** on a first provision — on a replay the token is the key and body drift is ignored ([Flows §2](04-flows.md#single-use-and-idempotent-retry)), so there is no consumed-token branch and no discriminator. The rejection does not consume the token and alters no binding. Servers **MUST** carry `details.declaredBayNumbers` and `details.registeredBayNumbers`, and **MUST NOT** carry counts as the only content of `details`. Their difference in either direction is the whole fault: a number declared but not registered is a bay the firmware believes exists and the operator never registered, and a number registered but not declared is the reverse. Counts do not answer this and actively mislead — a **swapped** bay leaves both sides the same length, which is the case a count cannot see and this code exists to catch. Exactly one of the two sides is wrong, and which one decides who repairs it. | Station: correct the declared `bays` and resubmit on the **same** token — it is not consumed. Do **not** regenerate keys: a later retry with a fresh key is answered `4015`, which is unrecoverable. Read `details.declaredBayNumbers` against `details.registeredBayNumbers`; their difference either way is the fault. If the declaration is truthful the operator corrects the station record; if not, the firmware's bay table is corrected. Server: carry both **sets** in `details`, never counts alone. |

### 3.5 Station Hardware & Software Errors (5xxx)

Station errors are reported by the station itself and cover physical hardware faults (pumps, valves, motors, sensors, dispensers) and embedded software issues (firmware, storage, memory).

#### 5.0xx — Hardware Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5000 | `HARDWARE_GENERIC` | Warning | true | Unclassified hardware error that does not fit a specific category. | Log and monitor. If persistent, transition bay to Faulted and dispatch technician. |
| 5001 | `PUMP_SYSTEM` | Critical | false | Pump malfunction detected (overcurrent, no pressure, motor failure). Applies to any pump type — water, air, vacuum, fuel, etc. Bay MUST transition to `Faulted`. | Immediately stop active session on affected bay. Dispatch technician. Do not attempt restart without physical inspection. |
| 5002 | `FLUID_SYSTEM` | Warning | true | Fluid supply error (low flow rate, supply valve issue, tank level low but not empty). Covers water, detergent, coolant, fuel, or any primary fluid used by the station. | Log warning. If fluid meter values drop below threshold during session, alert operator. May self-resolve when supply is restored. |
| 5003 | `CONSUMABLE_SYSTEM` | Warning | true | Consumable supply depleted or dosing/dispensing system error (tank empty, hopper empty, dosing pump calibration failure). Covers chemicals, detergent, capsules, ingredients, or any expendable material. | Alert operator to refill consumable supply. Bay MAY continue with reduced-service mode if possible. |
| 5004 | `ELECTRICAL_SYSTEM` | Critical | false | Power supply fault: voltage out of range, relay failure, or phase loss. Two of those three causes are **not** cured by the voltage returning to range — a failed or welded relay and a lost phase both persist while the measured voltage reads nominal, and a welded relay means the bay may still be energised after the station believes it has cut power. This code is a Level 3 (Faulted) entry trigger whose exit is *physical intervention + operator verification + station reboot* ([§7.2](#72-station-degradation-levels)); it is therefore never cleared by the condition appearing to self-correct. | Station: engage emergency shutdown **immediately and unconditionally** — do not gate it on the voltage reading. Bay → `Faulted`, enter Level 3 (§7.2); report via SecurityEvent [MSG-012] with `type: "HardwareFault"`. The bay **MUST NOT** return to service on voltage normalising alone: clearing requires physical intervention, operator verification, and a station reboot. Operator: dispatch a technician to inspect the supply, relays, and incoming phases. |
| 5005 | `PAYMENT_HARDWARE` | Warning | false | On-station payment hardware error (coin acceptor jam, card reader malfunction, NFC terminal failure). | Disable local payment option. Mobile app and web payments remain available. Dispatch technician for payment hardware service. |
| 5006 | `HEATING_SYSTEM` | Warning | true | Heating or thermal regulation fault (over-temperature sensor triggered, heater element failure, thermostat malfunction). | Disable temperature-dependent services. Other services MAY continue. Auto-recoverable if temperature returns to safe range. |
| 5007 | `MECHANICAL_SYSTEM` | Warning | false | Mechanical component failure (actuator jam, motor fault, door mechanism, dispensing arm). | Bay → Faulted. Dispatch technician. Requires physical intervention. |
| 5008 | `SENSOR_FAILURE` | Warning | true | Sensor reading out of range or sensor unresponsive (flow meter, pressure sensor, temperature probe, proximity sensor). | Log degraded readings. Switch to time-based billing if metering sensor fails during active session. Alert operator. |
| 5009 | `EMERGENCY_STOP` | Critical | false | Physical emergency stop button was pressed. ALL bays on the affected station MUST transition to `Faulted`. | Immediately halt all active sessions. All bays → Faulted. Requires physical reset of E-stop button and operator verification before resuming. |

#### 5.01x — Firmware Update Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5014 | `DOWNLOAD_FAILED` | Error | true | The firmware binary could not be downloaded from the provided URL (DNS failure, HTTP error, connection timeout). | Verify the `firmwareUrl` is reachable. Retry the UpdateFirmware [MSG-016] command. Check station network connectivity. |
| 5015 | `CHECKSUM_MISMATCH` | Error | false | The downloaded firmware binary does not match the provided SHA-256 checksum. The file may be corrupt or tampered with. | Do NOT install. Report via SecurityEvent [MSG-012]. Server: verify the binary and checksum, then retry. |
| 5016 | `VERSION_ALREADY_INSTALLED` | Warning | false | The requested firmware version is already running on the station. No update is needed. | No action required. Server: update its records to reflect the station's current firmware version. |
| 5017 | `INSUFFICIENT_STORAGE` | Error | false | The station does not have enough storage to download or install the firmware binary. The retained previous partition is **not** free space: [update-firmware.md §7](profiles/device-management/update-firmware.md) keeps it as the rollback target and [§8](profiles/device-management/update-firmware.md) makes rollback to it a **MUST** on boot failure or health-check failure, so reclaiming it to fit the download removes the only recovery from a bad flash. `recoverable: false` records that the operator may have to supply a smaller build, not that the station should stop reporting. | Station: free space from diagnostics logs, buffered telemetry, and cached or partial downloads **only**. Do **NOT** erase, truncate, or overwrite the retained rollback partition to make room. If the binary still does not fit, abort the update, stay on the current firmware, and report `Failed` via FirmwareStatusNotification. Server/Operator: supply a smaller build, or service the station to expand storage. |
| 5018 | `INSTALLATION_FAILED` | Critical | false | The firmware could not be written to the inactive partition. The station remains on the current firmware. | Station: report via SecurityEvent [MSG-012]. Dispatch technician — may indicate flash storage failure. |
| 5112 | `FIRMWARE_SIGNATURE_INVALID` | Critical | false | The firmware image's ECDSA P-256 signature is absent (when required) or does not match the trusted Firmware Signing Certificate. The firmware binary may have been tampered with. | Do NOT install. Report via SecurityEvent [MSG-012] with `FirmwareIntegrityFailure` type. Server: verify signing key and re-publish firmware. |

#### 5.02x — Diagnostics & Catalog Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5019 | `UPLOAD_FAILED` | Error | true | The diagnostics archive could not be uploaded to the provided URL. | Verify the `uploadUrl` is reachable and accepts uploads. Retry the GetDiagnostics [MSG-018] command. |
| 5020 | `INVALID_TIME_WINDOW` | Warning | false | The `startTime` is after `endTime`, or the requested time window is otherwise invalid. | Fix the time window parameters in the GetDiagnostics request. |
| 5021 | `NO_DIAGNOSTICS_AVAILABLE` | Warning | false | No diagnostic data is available for the requested time window. | Request a broader time window, or wait for the station to accumulate more diagnostic data. |
| 5023 | `INVALID_CATALOG` | Error | false | One or more service entries in the UpdateServiceCatalog [MSG-021] request failed validation (missing required fields, invalid pricing type, malformed service definition). | Fix the catalog payload. Inspect the `details` field for specific validation errors. |
| 5024 | `UNSUPPORTED_SERVICE` | Warning | false | The catalog contains a `serviceId` that the station hardware does not support. The unsupported service is ignored; supported services are applied. | Remove unsupported services from the catalog, or accept the partial application. |
| 5025 | `CATALOG_TOO_LARGE` | Error | false | The service catalog exceeds the station's storage or processing capacity. | Reduce the number of services in the catalog. Check station capabilities for maximum catalog size. |

#### 5.1xx — Software Errors

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 5100 | `SOFTWARE_GENERIC` | Error | true | Unclassified embedded software error. | Log error with stack trace (if available). Report via SecurityEvent [MSG-012]. |
| 5101 | `FIRMWARE_ERROR` | Critical | false | Firmware runtime error (unhandled exception, assertion failure, task crash). | Station: attempt watchdog-triggered reset. If error persists after reset, roll back to previous firmware partition. Report via SecurityEvent [MSG-012]. |
| 5102 | `CONFIGURATION_ERROR` | Error | true | Station configuration is corrupt, missing required keys, or contains out-of-range values. | Station: load default configuration for missing/invalid keys. Report the specific key(s) via SecurityEvent [MSG-012]. Server: push corrected config via ChangeConfiguration [MSG-013]. |
| 5103 | `STORAGE_ERROR` | Error | true | Non-volatile storage (NVS) read or write failure. | Station: retry the storage operation. If persistent, log SecurityEvent and disable features that require storage (offline tx log). |
| 5104 | `WATCHDOG_RESET` | Critical | true | Hardware watchdog timer expired — a firmware task was unresponsive. Station performed an automatic reset. | Station: send BootNotification [MSG-001] with `bootReason: "Watchdog"` after reboot. Server: flag for monitoring — 3+ watchdog resets in 24h triggers operator alert. |
| 5105 | `MEMORY_ERROR` | Critical | true | Available RAM dropped below the critical threshold. | Station: release non-essential buffers (meter value history, BLE advertising data). If insufficient, perform a soft reset. Report via SecurityEvent. |
| 5106 | `CLOCK_ERROR` | Warning | true | Real-time clock (RTC) failure or clock drift exceeds 5 minutes from server time (detected at Heartbeat [MSG-008] time sync). | Station: sync clock from next Heartbeat response. If RTC hardware is faulty, use server time exclusively. Flag for operator — large drift may indicate battery failure. |
| 5107 | `OPERATION_IN_PROGRESS` | Warning | true | Another long-running operation is already active (e.g., firmware update, diagnostics upload) and the new request cannot be processed concurrently. Also covers the **full command queue** of [`02-transport.md` §3.2](02-transport.md): the station processes Server→Station commands sequentially and queues at most 10, and a command arriving on a full queue is refused with this code. That case is reachable from **every** Server→Station REQUEST rather than from any particular action, which is why it appears in no single row of [§4.2](#42-server--station-mqtt-actions). Both readings are the same condition — the station is busy and the request has not been lost, only declined — which is why one code serves them and why it is `recoverable`. | Retry after the in-progress operation completes. Check FirmwareStatusNotification [MSG-017] or DiagnosticsNotification [MSG-019] for progress. Where the cause is a full command queue, reduce the rate of concurrent commands to this station rather than retrying immediately. |
| 5108 | `CONFIGURATION_KEY_READONLY` | Error | false | The specified configuration key is read-only and cannot be modified via ChangeConfiguration [MSG-013]. | Use a different key, or accept the current value. Read-only keys can only be changed via firmware update or provisioning. |
| 5109 | `INVALID_CONFIGURATION_VALUE` | Error | false | The configuration value is out of range, has an invalid type, or violates the key's constraints. | Check the valid range and type for the configuration key in the configuration registry. |
| 5110 | `RESET_FAILED` | Critical | false | The Reset command failed to execute. The station could not complete the reset sequence due to a hardware or software fault. | Dispatch technician. A physical power cycle may be required. Report via SecurityEvent [MSG-012]. |
| 5111 | `BUFFER_FULL` | Critical | true | Offline transaction buffer is at or near capacity (>= 90%). The station cannot safely accept new sessions without risking data loss. | Station: reject new StartService requests. Reconnect to MQTT to flush buffered TransactionEvents. Server: prioritize reconnection and reconciliation for this station. |

### 3.6 Server Errors (6xxx)

Server errors are generated by the server and returned to mobile apps, web payment clients, or relayed to stations.

| Code | errorText | Severity | Recoverable | Description | Recommended Action |
|:----:|-----------|:--------:|:-----------:|-------------|-------------------|
| 6000 | `SERVER_GENERIC` | Error | true | Unclassified server-side error. | Retry after 5 seconds. If persistent, contact support. |
| 6001 | `SERVER_INTERNAL_ERROR` | Error | true | Server encountered an unexpected error during request processing (database error, unhandled exception). | Retry with exponential backoff. Server: log full error with request context, correlate via `X-Request-Id`. |
| 6002 | `ACK_TIMEOUT` | Warning | true | The server sent a command to the station via MQTT but did not receive a RESPONSE within the action-specific timeout. | Server: refund 100% if this was a StartService. App: show "Station did not respond" with retry option. Server: check station heartbeat status. |
| 6003 | `STATION_OFFLINE` | Warning | true | The station is not connected to the MQTT broker (3+ missed heartbeats or LWT received). | App: show "Station is offline" message. Suggest trying again later or using BLE offline mode if available. |
| 6004 | `VALIDATION_ERROR` | Error | false | REST API request body failed schema validation (missing required fields, invalid types, constraint violations). | Fix the request body per the API schema. The `details` field contains per-field validation errors. |
| 6005 | `SESSION_ALREADY_ACTIVE` | Warning | true | The user already has an active session (only one active session per user is allowed). | App: show the existing active session. The user must stop or wait for the current session before starting a new one. |
| 6006 | `RATE_LIMIT_EXCEEDED` | Warning | true | The request was rejected due to rate limiting (per-IP, per-user, or per-device). | Wait before retrying. The `Retry-After` HTTP header (if present) indicates when to retry. See Chapter 06 §7.1 for rate limit thresholds. |
| 6007 | `SERVICE_DEGRADED` | Info | true | One or more server subsystems are operating in degraded mode (e.g., payment processor unreachable, search index stale). | Non-blocking. The server continues to function with reduced capabilities. Degraded features are listed in the `details` field. |
| 6008 | `COMMAND_PRE_EMPTED` | Warning | true | The **server** refused to dispatch a command and stopped it locally, so it never reached the station. A server **MAY** do this and **MUST** answer with this code when it does, and **MUST NOT** borrow the station's. `details.reason` **MUST** name the condition, because it is the only member present on every occurrence and it says which of the two kinds of pre-empt this is. **(1) Predicted refusal** — the server holds enough state to see the station would decline, as for a Reset with sessions running. `details.wouldBe` **MUST** carry the code the station would have answered (`3016` for that Reset). **(2) Server-protective** — the server declines for a reason of its own, the circuit breaker of [§6.3](#63-server--station-command-circuit-breaker) being the defined case. Here `details.wouldBe` **MUST** be absent: the station was never going to refuse, it was never going to answer at all, and inventing a code it never gave is the borrowing this entry exists to forbid. **When `details.wouldBe` is absent the receiver MUST treat the command as refused and not performed**, and **MUST NOT** infer that it would have succeeded — an unpredictable outcome is not a safe one, and this is the only default under which the worst case is a command that must be re-issued rather than one believed done that never ran. The pairing is the point: an operator seeing `3016` knows the message reached the station and the station said no; an operator seeing `6008` knows it never left the server. Those have different remedies, because the server's view can be **stale** — it may hold a session the station finished seconds ago — and a stale pre-empt is repaired by reconciling the server, not by touching the station. A pre-empt is an OPTIMISATION and is never required: a server that dispatches and lets the station answer is equally conforming. A server **MUST NOT** pre-empt a command carrying an override the station would honour — a Reset with `force: true` **MUST** be dispatched however many sessions are running, because forcing is precisely the instruction to proceed anyway. **Scope:** this code is reachable from in-scope endpoints that dispatch a station command ([§4.4](#44-rest-api-endpoints)) and from operator surfaces this specification does not define ([§2.4](#24-rest-api-error-response), *Scope*) — an administrative Reset being the worked example. On the latter the contract above still describes the answer, but there is nothing for a conformance test to address, which is why no test case exercises that path. | Operator: read `details.reason` — it says which kind of pre-empt this is. If `details.wouldBe` is present, treat it as that code's row directs; where it disagrees with the station, the server's view is stale — reconcile the server, do not visit the station. If absent, the command did not run and no outcome may be assumed; re-issue once the named condition clears. Server: always carry `details.reason`; carry `details.wouldBe` only for a predicted refusal; never pre-empt a forced command. |

---

## 4. Error Code Usage per Message

This table maps which error codes can appear in the RESPONSE or rejection of each MQTT action and BLE message type. Error codes in **bold** are the most common for that action.

### 4.1 Station → Server MQTT Actions

| Action | Possible Error Codes |
|--------|---------------------|
| BootNotification [MSG-001] | **2001**, **3018**, 1005, 1007, 6001 |
| Heartbeat [MSG-008] | 1005, 1010, 5106, 6001 |
| StatusNotification [MSG-009] | *(EVENT — no RESPONSE. Carries 5xxx error details in the payload: at bay level when `status` is `Faulted`, and optionally per program on any `programs[]` entry reported `available: false`)* |
| MeterValues [MSG-010] | *(EVENT — no RESPONSE)* |
| TransactionEvent [MSG-007] | **2002**, **2003**, **2004**, **2005**, **2006**, **2014**, **2015**, **2016**, **2017**, 1005, 3015, 6001 |
| AuthorizeOfflinePass [MSG-002] | **2002**, **2003**, **2004**, **2005**, **2006**, 1005, 4002, 4003, 4004, 6001 |
| FirmwareStatusNotification [MSG-017] | *(EVENT — no RESPONSE)* |
| DiagnosticsNotification [MSG-019] | *(EVENT — no RESPONSE)* |
| SignCertificate [MSG-022] | **4010**, **4012**, **4013**, 1005, 6001 |
| SecurityEvent [MSG-012] | *(EVENT — no RESPONSE)* |
| ConnectionLost [MSG-011] | *(EVENT — no RESPONSE, LWT)* |
| DataTransfer [MSG-025] | *(implicit only — station-initiated DataTransfer uses status values, not error codes)* |

### 4.2 Server → Station MQTT Actions

> **Implicit error codes:** The following error codes apply to **all** Server→Station REQUEST messages and are not repeated in individual rows: `1005 INVALID_MESSAGE_FORMAT`, `2007 COMMAND_NOT_SUPPORTED`, `6001 SERVER_INTERNAL_ERROR`.

| Action | Possible Error Codes |
|--------|---------------------|
| ReserveBay [MSG-003] | **3001**, **3002**, 3005, 3011, 3012, 3013, 3014, 5000–5009 |
| CancelReservation [MSG-004] | **3012**, **3013**, 3005 |
| StartService [MSG-005] | **3001**, **3002**, **3004**, **3009**, **3017**, 3003, 3005, 3006, 3008, 3010, 3011, 3012, 3013, 3014, 5000–5009, 5111 |
| StopService [MSG-006] | **3006**, **3007**, 3005, 3011 |
| Reset [MSG-015] | **3016**, 5107, 5110 |
| ChangeConfiguration [MSG-013] | **3015**, 1012, 2008, 5108, 5109 |
| GetConfiguration [MSG-014] | *(implicit only)* |
| SetMaintenanceMode [MSG-020] | **3001**, **3005** |
| UpdateFirmware [MSG-016] | **5014**, **5015**, **5017**, **5018**, **5112**, 5016, 5103, 5107, 1011 |
| GetDiagnostics [MSG-018] | **5019**, **5020**, **5021**, 5103, 5107, 1011 |
| UpdateServiceCatalog [MSG-021] | **5023**, **5024**, **5025**, 3015, 5103 |
| CertificateInstall [MSG-023] | **4011**, **4012**, 5103, 5107 |
| TriggerCertificateRenewal [MSG-024] | **4014**, 5107 |
| DataTransfer [MSG-025] | *(implicit only — uses status values UnknownVendor/UnknownData, not error codes)* |
| TriggerMessage [MSG-026] | *(implicit only — uses status value NotImplemented, not error codes)* |

### 4.3 BLE Message Types

| BLE Message | Possible Error Codes |
|-------------|---------------------|
| AuthResponse (→ OfflineAuthRequest) | **2002**, **2003**, **2004**, **2005**, **2006**, **2013**, 4002, 4003, 4004 |
| AuthResponse (→ ServerSignedAuth) | **2002**, **2013**, 1012 |
| StartServiceResponse | **3001**, **3002**, **3004**, **3009**, 3003, 3005, 3008, 3010, 5000–5009 |
| StopServiceResponse | **3006**, **3007** |

### 4.4 REST API Endpoints

> **READ THIS BEFORE THE TABLE — a row is not the complete set of codes an endpoint returns.**
>
> **(1) Four codes are reachable from EVERY endpoint below and are not repeated per row.** They
> are properties of serving an HTTP request at all, not of any one endpoint:
>
> | Code | When |
> |------|------|
> | `6004 VALIDATION_ERROR` | the request body failed schema validation — except where an endpoint registers its own code for this, as `POST /api/v1/stations/provision` does with `4017` |
> | `6001 SERVER_INTERNAL_ERROR` | an unhandled server fault |
> | `6006 RATE_LIMIT_EXCEEDED` | the caller exceeded the endpoint's rate limit (Chapter 06 §7.1) |
> | `6007 SERVICE_DEGRADED` | a dependency is transiently unavailable — answered `503` with `Retry-After`, see *What these lists are* below |
>
> **(2) A row lists what is PARTICULAR to that endpoint.** Read every row as *its own codes, plus
> the four above.* A conformance check derived from a row alone will under-approximate; it must
> add the four.
>
> **(3) Absence from a row is not a claim that a code is unreachable.** See *What these lists
> are* below: these are the failures this specification **models**, not an exhaustive
> enumeration of what a conforming server may emit.

| Endpoint | HTTP | Particular Error Codes (**+ the four universal codes above**) |
|----------|:----:|---------------------|
| `POST /sessions/start` | 400, 402, 404, 409, 422, 500, 504 | 3000, 3001, 3002, 3003, 3004, 3005, 3008, 3009, 3010, 3011, 3012, 3013, 3014, 3019, 4001, 5000–5009, 5111, 6002, 6003, 6005, 6008 |
| `POST /sessions/{id}/stop` | 404, 409, 503 | 3000, 3005, 3006, 3007, 3011, 6002 |
| `GET /sessions/{id}` | 404 | 3006 |
| `POST /pay/{code}/start` | 400, 402, 404, 409, 422, 500, 504 | 3000, 3001, 3002, 3003, 3004, 3005, 3008, 3009, 3010, 3011, 3012, 3013, 3014, 4001, 5000–5009, 5111, 6002, 6003, 6008 |
| `GET /pay/sessions/{token}/status` | 401, 404 | 2011, 2012, 3006 |
| `POST /me/offline-txs` | 400, 401 | 2009, 2010, 3015 |
| `POST /sessions/offline-auth` | 400, 401, 402, 403 | 2008, 2009, 2010, 4001 |
| `POST /webhooks/payment-gateway/notification` | 401 | 4008 |
| `POST /api/v1/stations/provision` | 400, 401, 409, 422 | 2019, 4010, 4015, 4016, 4017, 4018, 4019, 4020 |

**Where the session rows come from.** `POST /sessions/start` and `POST /pay/{code}/start`
dispatch **StartService [MSG-005]** to the station and relay its outcome, so their code sets are
that action's set from [§4.1](#41-station--server-mqtt-actions) — including the `5000–5009` and
`5111` hardware faults the *station* raises, which reach the REST caller unchanged. `POST
/sessions/{id}/stop` relays **StopService [MSG-006]** the same way. This is why those rows are
long: a REST endpoint that dispatches an MQTT action inherits that action's failure domain, and
listing only the failures the *server* originates would have described half of it.

Before this revision these rows listed 3–7 codes each and omitted the relayed set entirely —
`3004` was absent from `/sessions/start` while the reference server emitted it from that path,
and `3000` appeared in no row at all. Corrected in 0.8.1; see the *Verification* note in the
CHANGELOG for how the omission was found.

**What these lists are.** The statuses and codes above are the set this specification **models**
for each endpoint — the failures it defines, and the answers it fixes. They are **not** an
exhaustive enumeration of what a conforming server may emit. Every endpoint in scope can also
fail for reasons that belong to the deployment rather than to the protocol: the process is out
of memory, a dependency is unreachable, the operator has taken the service down, a request
arrives larger than the transport accepts. This specification does not model those, and a server
answering one of them is **not** thereby non-conforming.

**What a server does outside the list.** Two obligations, and only two:

1. The response body **MUST** still be the Error Object of [§1.3](#13-error-object-fields), with
   the closest registry code. `6001 SERVER_INTERNAL_ERROR` for an unhandled fault; `6007
   SERVICE_DEGRADED` for a dependency that is transiently unavailable; `6006
   RATE_LIMIT_EXCEEDED` for throttling. The rule at [§2.4](#24-rest-api-error-response) that
   `errorCode` is REQUIRED on every error of an in-scope endpoint is not relaxed here — an
   unmodelled *status* never licenses an unmodelled *body*.
2. The HTTP status **MUST** be the one that is true. A server **MUST NOT** downgrade an accurate
   status to one that appears in the list above.

**The status is not a property of the code.** [§2.4](#24-rest-api-error-response)'s mapping table
is headed *Typical Error Codes* and groups codes by the status they are usually seen with; it is
illustrative and assigns no code a fixed status. Nothing in [§3](#3-error-code-registry) carries
an HTTP status column. A code and a status answer different questions — *what failed* and *how
the client should treat this response* — and one code can honestly appear with more than one
status where the same fault is reachable in states the client must treat differently.

`6007 SERVICE_DEGRADED` is the worked example, and the reason this paragraph exists. When
provisioning cannot proceed because crypto material is temporarily unreadable, the condition is
transient and operator-fixable, so the correct answer is **`503 Service Unavailable` with
`Retry-After`** — which tells the station *when* to come back. `500` would tell it only to back
off blindly, discarding information it acts on. A server **MUST** answer `503` there and **MUST
NOT** substitute `500` to make the response match the enumeration above. Implementations that
previously emitted `500` for this condition to satisfy the list were working around a gap in the
list, not conforming to a requirement.

---

## 5. Retry Policies

### 5.1 MQTT Connection Recovery

When the MQTT connection is lost (`1001 MQTT_CONNECTION_LOST`), the station MUST follow this recovery sequence:

```
Attempt  Delay    Max Delay
1        1s       —
2        2s       —
3        4s       —
4        8s       —
5        16s      —
6+       30s      30s (cap)
```

**Rules:**

1. **Jitter:** Each delay MUST include random jitter: `actual_delay = base_delay + random(0, base_delay × 0.3)`.
2. **Active sessions:** Active sessions MUST continue running during disconnection — do NOT stop hardware. The station operates autonomously.
3. **BLE fallback:** The station MUST continue accepting BLE connections during MQTT disconnection.
4. **Event buffering:** The station MUST buffer TransactionEvent and SecurityEvent messages per the categorized buffering policy in [01-architecture.md §6.5](../spec/01-architecture.md#65-offline-message-buffering). Regenerable messages (StatusNotification, MeterValues) MAY be discarded as they are regenerated at reconnection.
5. **Reconnection sequence:** After MQTT reconnect → re-subscribe → BootNotification [MSG-001] → StatusNotification per bay [MSG-009] → replay buffered events → sync offline transactions [MSG-007].
6. **Maximum offline duration:** If the station cannot reconnect within 72 hours, it SHOULD disable non-essential features (reservations, new sessions) and enter degraded offline-only mode.

### 5.2 BootNotification Retry

| Scenario | Delay | Max Attempts | Escalation |
|----------|-------|:------------:|------------|
| RESPONSE: `ACCEPTED` | — | — | Normal operation |
| RESPONSE: `REJECTED` | `retryInterval` from response (default 30s) | Unlimited | Station enters the `Rejected` restricted state — accepts no commands, sends nothing but its retries, serves no customers ([Chapter 05 §1.4](05-state-machines.md#14-the-restricted-states)) |
| RESPONSE: `PENDING` | `retryInterval` from response (default 30s) | Unlimited | Station enters the `Pending` restricted state — **answers** commands so an operator can repair it, originates nothing but BootNotification retries and a SignCertificate [MSG-022] renewal, refuses StartService and ReserveBay with `3002 BAY_NOT_READY` ([Chapter 05 §1.4](05-state-machines.md#14-the-restricted-states)) |
| Timeout (no response in 30s) | 60s fixed | Unlimited | Log `1010 MESSAGE_TIMEOUT`, retry indefinitely |

The default retry interval (30s) is configurable via `BootRetryInterval` (see §8 Configuration).

### 5.3 Command Retry Policies

Each MQTT command (Server → Station) has a specific retry policy based on urgency and idempotency.

| Action | Max Attempts | Retry Delays | Timeout per Attempt | On All Retries Exhausted |
|--------|:------------:|--------------|:-------------------:|--------------------------|
| StartService (mobile) | 1 | — | 10s | Refund 100%, session → `failed` |
| StartService (web) | 4 | 0s, +5s, +10s, +15s | 10s | CancelReservation → refund 100%, session → `failed` |
| StopService | 1 | — | 10s | Session → `failed`, station auto-stops on timer expiry anyway |
| ReserveBay | 1 | — | 5s | Session → `failed`, inform user |
| CancelReservation | 1 | — | 5s | Server marks reservation as expired locally |
| Reset | 1 | — | 30s | Log failure, operator notification |
| ChangeConfiguration | 1 | — | 60s | Log failure, retry on next maintenance window |
| GetConfiguration | 1 | — | 30s | Log failure, use cached values |
| SetMaintenanceMode | 1 | — | 30s | Log failure, operator notification |
| UpdateFirmware | 1 | — | 300s | Log failure, retry via operator action |
| GetDiagnostics | 1 | — | 300s | Log failure, retry via operator action |
| UpdateServiceCatalog (at boot) | 2 | 0s, +10s | 30s | Use cached catalog |

**Retry delays are measured from the preceding attempt's timeout, not from the first dispatch.** An attempt has not failed until its *Timeout per Attempt* has elapsed with no RESPONSE, and only a failed attempt is retried ([glossary](glossary.md), *REQUEST*). So `StartService (web)` dispatches at `0s`, `15s`, `35s` and `60s` — not at `0s, 5s, 10s, 15s` — and exhausts at `70s`; `UpdateServiceCatalog (at boot)` dispatches at `0s` and `40s`. Read from the first dispatch instead, the second attempt would go out while the first is still inside its own timeout, which no rule here licenses and which the retry rule contradicts outright. The distinction is only visible on the two actions with more than one attempt; the other ten are single-attempt and have no delay to measure.

A retry re-sends the **same `messageId`** (glossary, *REQUEST*), so a retry the station has already answered is collapsed by transport-layer deduplication into a re-send of the cached RESPONSE ([`02-transport.md` §3.3](02-transport.md)) rather than executed a second time. This is what makes a multi-attempt policy safe to state without qualifying it per action.

### 5.4 BLE Retry Policies

| Operation | Max Attempts | Retry Delays | On Failure |
|-----------|:------------:|--------------|------------|
| BLE connection (GATT connect) | 3 | 1s, 2s, 4s | Show "Connection failed" to user |
| BLE handshake (HELLO → CHALLENGE) | 2 | 2s, 4s | Disconnect, show error |
| BLE authentication (OFFLINE_AUTH → AuthResponse) | 1 | — | Show error, allow user to retry manually |
| BLE START_SERVICE | 1 | — | Show error with details from station |
| BLE STOP_SERVICE | 2 | 1s, 2s | Show error — service will auto-stop on timer |

### 5.5 Payment Processing Retry

| Operation | Max Attempts | Retry Delays | On Failure |
|-----------|:------------:|--------------|------------|
| Payment processor API call | 3 | 1s, 2s, 4s (exponential) | Mark PaymentIntent as `failed`, inform user |
| Webhook delivery (processor → server) | N/A | Processor-managed | Server polls processor API after 5 minutes as fallback |
| Refund API call | 3 | 2s, 4s, 8s (exponential) | Escalate to manual refund queue |

### 5.6 REST API Retry (Mobile App)

| Scenario | Strategy | Details |
|----------|----------|---------|
| HTTP 429 (Rate Limited) | Wait `Retry-After` header | Respect the server's backoff instruction |
| HTTP 500, 502, 503 | Exponential backoff | 1s, 2s, 4s, max 3 attempts |
| HTTP 504 (Gateway Timeout) | Single retry after 5s | Then show "Station not responding" |
| Network error (no response) | Exponential backoff | 1s, 2s, 4s, max 3 attempts, then show offline message |
| HTTP 400, 401, 403, 404, 409, 422 | No retry | Client error — fix the request or show appropriate message |

---

## 6. Circuit Breaker

### 6.1 Overview

A circuit breaker prevents cascading failures by temporarily stopping requests to a failing component. OSPP defines circuit breaker patterns for three integration points.

```
States:   CLOSED  ──(threshold exceeded)──►  OPEN
             ▲                                  │
             │                            (cooldown elapsed)
             │                                  │
             └──(probe succeeds)──  HALF-OPEN ◄─┘
```

| State | Behavior |
|-------|----------|
| **CLOSED** | Requests flow normally. Failures are counted. |
| **OPEN** | All requests are immediately rejected without attempting the call. A cooldown timer starts. |
| **HALF-OPEN** | After cooldown, a single probe request is allowed through. If it succeeds, the breaker resets to CLOSED. If it fails, the breaker returns to OPEN with an increased cooldown. |

### 6.2 Station → MQTT Broker Circuit Breaker

| Parameter | Value |
|-----------|-------|
| Failure threshold | 5 consecutive connection failures |
| Cooldown (initial) | 60 seconds |
| Cooldown (max) | 10 minutes |
| Cooldown multiplier | ×2 per re-open |
| Success threshold to close | 1 successful BootNotification exchange |

**Behavior in OPEN state:**
- Station continues operating in BLE-only mode.
- Active sessions continue — hardware is NOT stopped.
- Buffered events accumulate locally.
- Station MUST still attempt the probe after cooldown (single MQTT CONNECT attempt).

### 6.3 Server → Station Command Circuit Breaker

The server tracks per-station command success/failure rates.

| Parameter | Value |
|-----------|-------|
| Failure threshold | 3 consecutive `1010 MESSAGE_TIMEOUT` for the same station |
| Cooldown (initial) | 30 seconds |
| Cooldown (max) | 5 minutes |
| Cooldown multiplier | ×2 per re-open |
| Success threshold to close | 1 successful RESPONSE (any action) |

**Behavior in OPEN state:**
- Server marks the station as "unresponsive" (not "offline" — LWT not received).
- New StartService commands for that station are **not dispatched**, and are answered immediately with `6008 COMMAND_PRE_EMPTED` carrying `details.reason` naming the open breaker and **no** `details.wouldBe` — this is the server-protective pre-empt of that entry, not a predicted station refusal. An earlier revision answered `6002 ACK_TIMEOUT` here, which asserts *"the server **sent** a command … but did not receive a RESPONSE"* and maps to `504`; nothing was sent, so it reported a dispatch that never happened and put the fault on a station that was never asked. `6002` is unchanged and still means what it says — it is reached when a command **is** dispatched and the station does not answer.
- During HALF-OPEN the server lets a **single command** through as the probe — the next one it would have dispatched, whichever action that is. This is why the success threshold above reads *any action*, and it is the generic HALF-OPEN behaviour of [§6.1](#61-overview) rather than an exception to it. **There is no server-initiated probe message.** An earlier revision named Heartbeat [MSG-008] here; Heartbeat is **Station → Server** ([Chapter 03 §5.1](03-messages.md)), there is no schema for a server-sent one, and a server following that sentence literally could not have built the mechanism it described.

### 6.4 Server → Payment Processor Circuit Breaker

| Parameter | Value |
|-----------|-------|
| Failure threshold | 5 failures within 60 seconds (across all stations) |
| Cooldown (initial) | 30 seconds |
| Cooldown (max) | 5 minutes |
| Cooldown multiplier | ×2 per re-open |
| Success threshold to close | 2 consecutive successful API calls |

**Behavior in OPEN state:**
- New payment initiation requests → `4005 PAYMENT_FAILED` with `errorDescription: "Payment service temporarily unavailable"`.
- Credit-based (wallet) sessions remain available — only card/web payments are affected.
- Server logs `6007 SERVICE_DEGRADED` with `details: {"degradedService": "payment_processor"}`.

---

## 7. Graceful Degradation

When subsystems fail, OSPP-compliant implementations MUST degrade gracefully rather than becoming fully unavailable. This section defines the degradation behavior for each failure scenario.

### 7.1 Degradation Matrix

| Failure Scenario | Impact | Available Services | Degraded/Unavailable |
|------------------|--------|-------------------|---------------------|
| **MQTT broker unreachable** | Station cannot communicate with server | BLE offline sessions, local timer-based sessions | Online sessions, reservations, server commands, real-time monitoring |
| **Payment processor down** | Card/web payments fail | Wallet (credit) sessions, BLE offline sessions | Web payment flow, card top-up |
| **Station BLE disabled** | No offline or BLE sessions | Online sessions (MQTT), web payments | BLE handshake, offline sessions, Partial A/B |
| **Station sensor failure** | Inaccurate metering | All sessions (time-based billing fallback) | Accurate volume-based metering |
| **Station NVS full** | Cannot store new offline transactions | Online sessions, BLE sessions (without local log) | Offline transaction persistence, crash recovery |
| **Server database degraded** | Slow or partial responses | Read-from-cache operations, session start/stop | History queries, transaction search, reports |
| **Server Redis down** | Session token and dedup cache lost | MQTT operations (direct DB fallback) | Web payment sessions, rate limiting, deduplication (fallback to DB) |
| **DNS failure** | Station cannot resolve broker | BLE offline sessions, cached connections (if already connected) | New MQTT connections, firmware downloads |

### 7.2 Station Degradation Levels

Stations MUST implement at least three degradation levels:

#### Level 0 — Full Operation

All subsystems operational. MQTT connected. BLE advertising. All services available.

#### Level 1 — Network Degraded

MQTT disconnected but BLE operational.

- **Continues:** Active sessions, BLE handshake, offline sessions, meter reading, hardware control.
- **Stops:** Online session starts, reservations, real-time StatusNotification delivery.
- **Buffered:** StatusNotification, MeterValues, TransactionEvent — replayed on reconnection.
- **Entry trigger:** `1001 MQTT_CONNECTION_LOST` after 3 reconnection attempts.
- **Exit trigger:** Successful MQTT reconnect + BootNotification ACCEPTED.

#### Level 2 — Isolated Operation

Both MQTT and BLE non-functional, or station has no network and BLE is disabled.

- **Continues:** Active sessions (timer-based), hardware control, local logging.
- **Stops:** ALL new sessions (no way to authenticate users), all external communication.
- **Entry trigger:** `1001 MQTT_CONNECTION_LOST` + `1008 BLE_RADIO_ERROR`.
- **Exit trigger:** Either MQTT or BLE connectivity restored.

#### Level 3 — Faulted

Critical hardware or software error. Station is unsafe to operate.

- **Continues:** Network connectivity (for error reporting), LED/display error codes.
- **Stops:** ALL sessions, ALL bay operations, ALL service delivery.
- **Entry trigger:** `5001 PUMP_SYSTEM`, `5004 ELECTRICAL_SYSTEM`, `5009 EMERGENCY_STOP`, or `5101 FIRMWARE_ERROR` (after failed rollback).
- **Exit trigger:** Physical intervention + operator verification + station reboot.

### 7.3 Server Degradation Behavior

#### Payment Processor Unavailable

1. Server returns `4005 PAYMENT_FAILED` with `recoverable: true` for web payment and card top-up requests.
2. Wallet (credit) sessions continue normally — they do not depend on the payment processor.
3. Server sets internal flag `paymentProcessorAvailable: false`.
4. Mobile app: show "Card payments temporarily unavailable. Use your credit balance." if user has sufficient credits.
5. Web payment: show "Payment service temporarily unavailable. Please try again in a few minutes."
6. Server probes the payment processor every 30 seconds. On recovery, clear the flag and resume normal operation.

#### Station Unresponsive

1. After 3 consecutive `1010 MESSAGE_TIMEOUT` → station circuit breaker opens (§6.3).
2. Server marks station as "unresponsive" in the station registry.
3. New session requests for that station → `6002 ACK_TIMEOUT` immediately (no MQTT command sent).
4. Server continues monitoring Heartbeat. On next successful Heartbeat response → circuit breaker → HALF-OPEN → probe with a lightweight command (GetConfiguration).
5. If the station sent a ConnectionLost [MSG-011] (LWT) → mark as "offline" instead of "unresponsive". Different from timeout — LWT means definitive disconnection.

#### Database Degraded

1. Read operations: fall back to Redis cache or in-memory cache.
2. Write operations: queue to a write-ahead log; process when database recovers.
3. Session starts: MUST work (minimal DB write — session record creation is critical path).
4. Session history, transaction list, and report queries: return `6007 SERVICE_DEGRADED` or stale cached data with a `X-Data-Stale: true` header.

### 7.4 Refund Policies on Error

When errors occur during the session lifecycle, the following refund rules apply:

| Scenario | Error Code(s) | Refund Type | Amount |
|----------|:-------------:|-------------|:------:|
| Station NACK on StartService | 3001, 3002, 3003, 3004, 3009 | Full (credits or local currency) | 100% |
| All StartService retry attempts fail (web) | 1010, 6002 | Full (credits or local currency) | 100% |
| ACK_TIMEOUT (mobile) | 6002 | Full (credits) | 100% |
| Hardware error during active session | 5001–5009 | Partial (pro-rated) | Based on time delivered |
| Station offline during active session | 1001 (followed by session timeout) | Partial (pro-rated) | Based on time delivered |
| Low-delivery override | — | See [`04-flows.md §6`](04-flows.md) | Defined there, and **not restated here**: it is scoped to a single SessionEnded `reason` and its threshold is a configurable parameter, both of which this table has previously got wrong by restating them |
| Payment processor refund failure | 4007 | Manual refund queue | Per original amount |

> This table is keyed by **error code**, and it is the pro-rata baseline only. The refund a session actually receives is keyed by SessionEnded `reason` and modulated by service kind — both are defined in [`04-flows.md §6`](04-flows.md), which governs where this table disagrees with it. Restating either here is what previously put an unqualified low-delivery rule under a row about station-offline sessions.

---

## 8. Vendor-Specific Error Codes (9xxx)

### 8.1 Registration

Vendors MAY define custom error codes in the **9000–9999** range for proprietary diagnostics and hardware-specific conditions that are not covered by the standard OSPP error codes.

**Rules:**

1. Vendors MUST register a vendor prefix (2–6 uppercase characters, e.g., `ACME`).
2. The `vendorErrorCode` field MUST use the format `{VENDOR_PREFIX}_{code}` (e.g., `ACME_9001`).
3. Vendor codes MUST NOT overlap with standard OSPP codes (0000–8999).
4. Vendor codes SHOULD be documented in the vendor's implementation guide.
5. Receivers that do not recognize a vendor code MUST treat it as the corresponding generic code in the same severity level (e.g., treat an unknown Critical vendor code like `5000 HARDWARE_GENERIC`).

### 8.2 Vendor Error Object

```json
{
  "errorCode": 9001,
  "errorText": "ACME_PRESSURE_SENSOR_V2",
  "errorDescription": "AcmeCorp SSP-3000 secondary pressure sensor reads below 0.5 bar.",
  "severity": "Warning",
  "recoverable": true,
  "recommendedAction": "Check secondary pressure line. Primary sensor is operational.",
  "timestamp": "2026-01-30T14:00:00.000Z",
  "vendorErrorCode": "ACME_9001",
  "details": {
    "sensorId": "pressure_secondary",
    "reading": 0.42,
    "unit": "bar",
    "threshold": 0.5
  }
}
```

---

## Appendix A — Quick Reference (All Error Codes)

| Code | errorText | Severity | Cat. |
|:----:|-----------|:--------:|:----:|
| 1000 | `TRANSPORT_GENERIC` | Error | T |
| 1001 | `MQTT_CONNECTION_LOST` | Error | T |
| 1002 | `MQTT_PUBLISH_FAILED` | Error | T |
| 1003 | `TLS_HANDSHAKE_FAILED` | Critical | T |
| 1004 | `CERTIFICATE_ERROR` | Critical | T |
| 1005 | `INVALID_MESSAGE_FORMAT` | Error | T |
| 1006 | `UNKNOWN_ACTION` | Warning | T |
| 1007 | `PROTOCOL_VERSION_MISMATCH` | Error | T |
| 1008 | `BLE_RADIO_ERROR` | Warning | T |
| 1009 | `DNS_RESOLUTION_FAILED` | Error | T |
| 1010 | `MESSAGE_TIMEOUT` | Warning | T |
| 1011 | `URL_UNREACHABLE` | Error | T |
| 1012 | `MAC_VERIFICATION_FAILED` | Critical | T |
| 1013 | `MAC_MISSING` | Error | T |
| 1014 | `MESSAGE_TOO_LARGE` | Error | T |
| 2000 | `AUTH_GENERIC` | Error | A |
| 2001 | `STATION_NOT_REGISTERED` | Error | A |
| 2002 | `OFFLINE_PASS_INVALID` | Error | A |
| 2003 | `OFFLINE_PASS_EXPIRED` | Warning | A |
| 2004 | `OFFLINE_EPOCH_REVOKED` | Error | A |
| 2005 | `OFFLINE_COUNTER_REPLAY` | Critical | A |
| 2006 | `OFFLINE_STATION_MISMATCH` | Error | A |
| 2007 | `COMMAND_NOT_SUPPORTED` | Warning | A |
| 2008 | `ACTION_NOT_PERMITTED` | Error | A |
| 2009 | `JWT_EXPIRED` | Warning | A |
| 2010 | `JWT_INVALID` | Error | A |
| 2011 | `SESSION_TOKEN_EXPIRED` | Warning | A |
| 2012 | `SESSION_TOKEN_INVALID` | Error | A |
| 2013 | `BLE_AUTH_FAILED` | Error | A |
| 2014 | `OFFLINE_PASS_REVOKED` | Error | A |
| 2015 | `OFFLINE_ORG_MISMATCH` | Error | A |
| 2016 | `OFFLINE_USER_MISMATCH` | Error | A |
| 2017 | `OFFLINE_RECEIPT_MISMATCH` | Critical | A |
| 2018 | `SERVER_AUTH_NONCE_MISMATCH` | Critical | A |
| 2019 | `PROVISIONING_TOKEN_INVALID` | Error | A |
| 3000 | `SESSION_GENERIC` | Error | S |
| 3001 | `BAY_BUSY` | Warning | S |
| 3002 | `BAY_NOT_READY` | Warning | S |
| 3003 | `SERVICE_UNAVAILABLE` | Warning | S |
| 3004 | `INVALID_SERVICE` | Error | S |
| 3005 | `BAY_NOT_FOUND` | Error | S |
| 3006 | `SESSION_NOT_FOUND` | Error | S |
| 3007 | `SESSION_MISMATCH` | Error | S |
| 3008 | `DURATION_INVALID` | Error | S |
| 3009 | `HARDWARE_ACTIVATION_FAILED` | Error | S |
| 3010 | `MAX_DURATION_EXCEEDED` | Warning | S |
| 3011 | `BAY_MAINTENANCE` | Warning | S |
| 3012 | `RESERVATION_NOT_FOUND` | Error | S |
| 3013 | `RESERVATION_EXPIRED` | Warning | S |
| 3014 | `BAY_RESERVED` | Warning | S |
| 3015 | `PAYLOAD_INVALID` | Error | S |
| 3016 | `ACTIVE_SESSIONS_PRESENT` | Warning | S |
| 3017 | `PROGRAM_NOT_DECLARED` | Error | S |
| 3018 | `TOPOLOGY_MISMATCH` | Error | S |
| 3019 | `SERVICE_NOT_BOUND` | Error | S |
| 4000 | `PAYMENT_GENERIC` | Error | P |
| 4001 | `INSUFFICIENT_BALANCE` | Warning | P |
| 4002 | `OFFLINE_LIMIT_EXCEEDED` | Error | P |
| 4003 | `OFFLINE_RATE_LIMITED` | Warning | P |
| 4004 | `OFFLINE_PER_TX_EXCEEDED` | Error | P |
| 4005 | `PAYMENT_FAILED` | Error | P |
| 4006 | `PAYMENT_TIMEOUT` | Warning | P |
| 4007 | `REFUND_FAILED` | Error | P |
| 4008 | `WEBHOOK_SIGNATURE_INVALID` | Critical | P |
| 4010 | `CSR_INVALID` | Error | P |
| 4011 | `CERTIFICATE_CHAIN_INVALID` | Error | P |
| 4012 | `CERTIFICATE_TYPE_MISMATCH` | Warning | P |
| 4013 | `RENEWAL_DENIED` | Error | P |
| 4014 | `KEYPAIR_GENERATION_FAILED` | Critical | P |
| 4015 | `PROVISIONING_KEY_MISMATCH` | Error | P |
| 4016 | `PROVISIONING_KEY_REUSE` | Error | P |
| 4017 | `PROVISIONING_REQUEST_INVALID` | Error | P |
| 4018 | `PROVISIONING_TOKEN_CONSUMED` | Error | P |
| 4019 | `PUBLIC_KEY_INVALID` | Error | P |
| 4020 | `BAY_COUNT_MISMATCH` | Error | P |
| 5000 | `HARDWARE_GENERIC` | Warning | H |
| 5001 | `PUMP_SYSTEM` | Critical | H |
| 5002 | `FLUID_SYSTEM` | Warning | H |
| 5003 | `CONSUMABLE_SYSTEM` | Warning | H |
| 5004 | `ELECTRICAL_SYSTEM` | Critical | H |
| 5005 | `PAYMENT_HARDWARE` | Warning | H |
| 5006 | `HEATING_SYSTEM` | Warning | H |
| 5007 | `MECHANICAL_SYSTEM` | Warning | H |
| 5008 | `SENSOR_FAILURE` | Warning | H |
| 5009 | `EMERGENCY_STOP` | Critical | H |
| 5014 | `DOWNLOAD_FAILED` | Error | H |
| 5015 | `CHECKSUM_MISMATCH` | Error | H |
| 5016 | `VERSION_ALREADY_INSTALLED` | Warning | H |
| 5017 | `INSUFFICIENT_STORAGE` | Error | H |
| 5018 | `INSTALLATION_FAILED` | Critical | H |
| 5019 | `UPLOAD_FAILED` | Error | H |
| 5020 | `INVALID_TIME_WINDOW` | Warning | H |
| 5021 | `NO_DIAGNOSTICS_AVAILABLE` | Warning | H |
| 5023 | `INVALID_CATALOG` | Error | H |
| 5024 | `UNSUPPORTED_SERVICE` | Warning | H |
| 5025 | `CATALOG_TOO_LARGE` | Error | H |
| 5100 | `SOFTWARE_GENERIC` | Error | H |
| 5101 | `FIRMWARE_ERROR` | Critical | H |
| 5102 | `CONFIGURATION_ERROR` | Error | H |
| 5103 | `STORAGE_ERROR` | Error | H |
| 5104 | `WATCHDOG_RESET` | Critical | H |
| 5105 | `MEMORY_ERROR` | Critical | H |
| 5106 | `CLOCK_ERROR` | Warning | H |
| 5107 | `OPERATION_IN_PROGRESS` | Warning | H |
| 5108 | `CONFIGURATION_KEY_READONLY` | Error | H |
| 5109 | `INVALID_CONFIGURATION_VALUE` | Error | H |
| 5110 | `RESET_FAILED` | Critical | H |
| 5111 | `BUFFER_FULL` | Critical | H |
| 5112 | `FIRMWARE_SIGNATURE_INVALID` | Critical | H |
| 6000 | `SERVER_GENERIC` | Error | X |
| 6001 | `SERVER_INTERNAL_ERROR` | Error | X |
| 6002 | `ACK_TIMEOUT` | Warning | X |
| 6003 | `STATION_OFFLINE` | Warning | X |
| 6004 | `VALIDATION_ERROR` | Error | X |
| 6005 | `SESSION_ALREADY_ACTIVE` | Warning | X |
| 6006 | `RATE_LIMIT_EXCEEDED` | Warning | X |
| 6007 | `SERVICE_DEGRADED` | Info | X |
| 6008 | `COMMAND_PRE_EMPTED` | Warning | X |

**Category legend:** T = Transport, A = Auth, S = Session, P = Payment, H = Hardware/Software, X = Server.

---

## Appendix B — Timeout Quick Reference

This table consolidates all timeout values from the protocol for implementer reference.

| Phase / Operation | Timeout | Error on Timeout | Recovery |
|-------------------|:-------:|:----------------:|----------|
| BootNotification | 30s | `1010` | Wait 60s, retry |
| Heartbeat | 30s (keep-alive) | `1010` / `1001` (3 missed → disconnect) | Reconnect with backoff |
| ReserveBay | 5s | `1010` | Session → `failed` |
| Reserved → 3DS (web) | 3 min | — | CancelReservation → `failed` |
| Reserved → payment (mobile) | 30s | — | CancelReservation → `failed` |
| StartService (per attempt) | 10s | `1010` / `6002` | Refund (mobile) or retry (web) |
| StopService | 10s | `1010` | Session → `failed`, station auto-stops |
| Reset | 30s | `1010` | Log failure, operator action |
| ChangeConfiguration | 60s | `1010` | Log failure, retry later |
| GetConfiguration | 30s | `1010` | Use cached values |
| SetMaintenanceMode | 30s | `1010` | Log failure, operator action |
| UpdateFirmware | 300s | `1010` | Log failure, operator action |
| GetDiagnostics | 300s | `1010` | Log failure, operator action |
| UpdateServiceCatalog | 30s | `1010` | Use cached catalog |
| Session token (web) | 10 min | `2011` | Restart payment flow |
| BayLock fallback | 3 min | — | Auto-released |
| PaymentIntent pending | 5 min | `4006` | Mark expired |
| BLE scan | 10–30s | `1008` | Return to IDLE |
| BLE handshake (per step) | 10s | `2013` | ERROR state |
| BLE GATT connect | 5s per attempt | `1008` | Retry (3 attempts) |
| MQTT reconnect (cap) | 30s | — | Continue backoff |
| Station max offline | 72 hours | — | Enter degraded mode (Level 2) |

---

## Appendix C — Error Code JSON Schema

The following JSON Schema validates the **Error Object** — the complete structure of §1.3, which is what a REST error body carries (§2.4). It is **not** the schema of an MQTT or BLE response payload: those carry a per-transport subset (§1.3, *Wire carriage*) and each has its own schema under `schemas/`. This schema is not referenced by any message schema.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ospp-standard.org/schemas/v1/error.json",
  "title": "OSPP Error Object",
  "description": "Standard error object included in REJECTED responses and error events.",
  "type": "object",
  "required": [
    "errorCode",
    "errorText",
    "errorDescription",
    "severity",
    "recoverable",
    "recommendedAction",
    "timestamp"
  ],
  "properties": {
    "errorCode": {
      "type": "integer",
      "minimum": 1000,
      "maximum": 9999,
      "description": "Numeric error code from the OSPP error code registry."
    },
    "errorText": {
      "type": "string",
      "pattern": "^[A-Z][A-Z0-9_]+$",
      "description": "Machine-readable error name in UPPER_SNAKE_CASE."
    },
    "errorDescription": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Human-readable description of the error."
    },
    "severity": {
      "type": "string",
      "enum": ["Critical", "Error", "Warning", "Info"],
      "description": "Error severity level."
    },
    "recoverable": {
      "type": "boolean",
      "description": "Whether the error can be resolved without manual intervention."
    },
    "recommendedAction": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Suggested corrective action."
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp of when the error occurred."
    },
    "vendorErrorCode": {
      "type": "string",
      "pattern": "^[A-Z]{2,6}_\\d{4}$",
      "description": "Optional vendor-specific error code."
    },
    "details": {
      "type": "object",
      "description": "Optional additional context (validation errors, threshold values, etc.).",
      "additionalProperties": true
    }
  },
  "allOf": [
    {
      "$comment": "1004 branches on details.cause (§3.1). Discriminator is REQUIRED on this code.",
      "if": {
        "properties": { "errorCode": { "const": 1004 } },
        "required": ["errorCode"]
      },
      "then": {
        "required": ["details"],
        "properties": {
          "details": {
            "required": ["cause"],
            "properties": {
              "cause": {
                "enum": ["expired", "revoked", "invalid-chain", "self-signed"]
              }
            }
          }
        }
      }
    },
    {
      "$comment": "4010 branches on details.phase (§3.4), including the renewal path.",
      "if": {
        "properties": { "errorCode": { "const": 4010 } },
        "required": ["errorCode"]
      },
      "then": {
        "required": ["details"],
        "properties": {
          "details": {
            "required": ["phase"],
            "properties": {
              "phase": {
                "enum": ["first-provision", "retry", "renewal"]
              }
            }
          }
        }
      }
    },
    {
      "$comment": "4016 branches on details.phase (§3.4). Not reachable from renewal.",
      "if": {
        "properties": { "errorCode": { "const": 4016 } },
        "required": ["errorCode"]
      },
      "then": {
        "required": ["details"],
        "properties": {
          "details": {
            "required": ["phase"],
            "properties": {
              "phase": {
                "enum": ["first-provision", "retry"]
              }
            }
          }
        }
      }
    },
    {
      "$comment": "4018 branches on details.reason (§3.4). Token state, not token authentication — the 2019 reasons are a different set.",
      "if": {
        "properties": { "errorCode": { "const": 4018 } },
        "required": ["errorCode"]
      },
      "then": {
        "required": ["details"],
        "properties": {
          "details": {
            "required": ["reason"],
            "properties": {
              "reason": {
                "enum": ["already_consumed", "consumed_without_certificate"]
              }
            }
          }
        }
      }
    },
    {
      "$comment": "4019 branches on details.phase (§3.4). Not reachable from renewal, which submits no bare key.",
      "if": {
        "properties": { "errorCode": { "const": 4019 } },
        "required": ["errorCode"]
      },
      "then": {
        "required": ["details"],
        "properties": {
          "details": {
            "required": ["phase"],
            "properties": {
              "phase": {
                "enum": ["first-provision", "retry"]
              }
            }
          }
        }
      }
    },
    {
      "$comment": "6008 branches on details.reason, which is REQUIRED because it is present on both kinds of pre-empt (§3.6). details.wouldBe is conditional — REQUIRED on a predicted station refusal, absent on a server-protective one — so the schema bounds it by the registry's own range rather than requiring it; its absence is the discriminator a receiver defaults on.",
      "if": {
        "properties": { "errorCode": { "const": 6008 } },
        "required": ["errorCode"]
      },
      "then": {
        "required": ["details"],
        "properties": {
          "details": {
            "required": ["reason"],
            "properties": {
              "reason": {
                "type": "string",
                "minLength": 1
              },
              "wouldBe": {
                "type": "integer",
                "minimum": 1000,
                "maximum": 9999
              }
            }
          }
        }
      }
    }
  ],
  "additionalProperties": false
}
```

**On the conditional blocks.** `details` stays OPTIONAL in general — the `required` array above is the same seven fields it has always been, and the general case is unchanged. The `allOf` adds one `if`/`then` per **branching** entry (§1.4), which makes the discriminator a validation error rather than a matter of trust. This is expressible in the dialect in use: the schema declares JSON Schema **draft 2020-12**, where `if`/`then` is standard, so the constraint is machine-checkable by any conforming validator and no reader need assume validation covers something it does not.

Exactly six entries branch today — `1004` on `details.cause`, `4010`, `4016` and `4019` on `details.phase`, and `4018` and `6008` on `details.reason` — and each has a block above. **Any entry that gains a branch MUST gain a block here in the same change**, or the discriminator it declares is unenforced. Note that `2019` carries `details.reason` as a **SHOULD** rather than a branch: its four causes share one recovery, so there is nothing for a receiver to select between and no block is required.

**`6008` is the one block whose discriminator is not an enumeration, and the one that constrains a second member it does not require.** `details.reason` is required because it is present on both kinds of pre-empt, and it is a free string rather than an enum because the conditions a server may protect itself against are not a closed set — an open circuit breaker is the one this specification defines, not the only one an implementation may have. `details.wouldBe` is the opposite case: **REQUIRED on a predicted station refusal, and absent on a server-protective one**, so a schema that required it would forbid the second kind outright. What the schema can do is bound it when it appears, and refuse a value outside the registry's own range — which is what a fabricated code would most likely be. Its **absence carries meaning**, and that meaning is the fail-safe default of [§1.4](#14-provenance-of-errordescription-and-recommendedaction): the command did not run and no outcome may be assumed.

The entry was added in `0.11.1`, three minors and eleven days after the rule above was written in `0.8.0`, and did not carry a block until now — the first branching entry added after the rule was also the first to violate it. That is exactly the failure the rule exists to prevent, and the reason it is stated as a **MUST** on the change rather than as advice.

This does **not** retire the fail-safe defaults. Schema validation binds the **emitter**; the defaults in §1.4 tell a **receiver** what to assume when a non-conforming emitter omits the discriminator anyway, and a receiver is not entitled to assume every peer validates its output. Both hold: the emitter MUST send the member, and the receiver MUST still default to the recoverable branch if it is absent.
