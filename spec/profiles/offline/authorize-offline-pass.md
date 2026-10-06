# AuthorizeOfflinePass

> **Status: EXPERIMENTAL** | **OSPP Version:** 0.44.0
>
> Published for review, **not** for implementation: its request carries the device proof and the
> transcript hash of the BLE handshake, which is EXPERIMENTAL, and changed incompatibly with the BLE
> wire revision. See [Release status](../../../README.md#ble-is-experimental).

## 1. Overview

AuthorizeOfflinePass is a station-initiated request used in the **Partial B** offline scenario (phone offline, station online). When a user presents an OfflinePass via BLE and the station has MQTT connectivity, the station forwards the pass to the server for validation. The server performs cryptographic and policy checks and responds with an acceptance (granting a session) or rejection (with a reason code).

This action provides stronger security guarantees than local-only validation because the server can check what a station alone cannot: an individual revocation or a block on the user (§5 check #12), the platform's current epoch (#3), and the pass's use at every station (#6, #7, #10). It does not gate on the wallet balance: the pass's limits bound what it authorizes, and a debit that leaves the wallet below zero leaves the transaction pending ([`reconciliation.md` §8.2](reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)). Offline authorization cache is configurable via `AuthorizationCacheEnabled` (see §8 Configuration).

> **Compliance note:** AuthorizeOfflinePass is used in the Partial B scenario, which every station that implements the Offline / BLE profile supports ([`README.md` §5](README.md#5-compliance-requirements) rule 7); the **Complete** compliance level requires the profile.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-----------------|---------|----------|-----------------------------------------------|
| `offlinePassId` | string | Yes | Unique identifier of the offline pass (`opass_` prefix). |
| `offlinePass` | object | Yes | Full OfflinePass object (see [offline-pass.md](offline-pass.md)). |
| `counter` | integer | Yes | Monotonic usage counter for replay protection (minimum 0). |
| `bayId` | string | Yes | The bay the customer chose, from the BLE OfflineAuthRequest. |
| `serviceId` | string | Yes | The service the customer chose, from the BLE OfflineAuthRequest. |
| `requestedDurationSeconds` | integer | Yes | The duration the customer chose, from the BLE OfflineAuthRequest, in seconds (minimum 1). The server estimates the cost from it ([`offline-pass.md` §4](offline-pass.md#4-validation-checks-10)) and authorizes exactly this duration or refuses. |
| `deviceProof` | object | Yes | The device proof of the BLE OfflineAuthRequest, unchanged ([`06-security.md` §6.5.4](../../06-security.md#654-device-proof-of-possession)). |
| `transcriptHash` | string | Yes | The transcript hash of the BLE handshake in which the pass was presented, Base64 of its 32 bytes ([`06-security.md` §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256), Pin 4) — an input of the device proof. |

The request carries no device identifier: the device is the pass's, and the proof shows the presenting phone holds its key. Earlier revisions carried a `deviceId` the station copied from the plaintext Hello, which check #4 compared with the pass's; it bound nothing, and is withdrawn with the Hello's identifier.

## 4. Response Payload

| Field | Type | Required | Description |
|---------------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `sessionId` | string | Cond. | Assigned session identifier. Present when `status` is `Accepted`. |
| `durationSeconds` | integer | Cond. | Authorized service duration in seconds — the request's `requestedDurationSeconds`, which the server authorizes exactly or refuses. Present when `status` is `Accepted`. |
| `creditsAuthorized` | integer | Cond. | Number of credits authorized for this session — the estimated cost checks #7 and #8 accepted, which the server debits at authorization and which settlement never exceeds. Present when `status` is `Accepted`. |
| `reason` | string | Cond. | Human-readable description of the refusal, for logs and operators, and not for programmatic matching. Present when `status` is `Rejected`. |
| `errorCode` | integer | Cond. | The registry code of the refusal: the code of the failed §5 check, `2002` for a pass that does not validate against the OfflinePass schema, `1005` for a request that does not validate against its schema elsewhere, or `6001`. Present when `status` is `Rejected` (§7). |
| `errorText` | string | Cond. | The registry name of `errorCode`, in `UPPER_SNAKE_CASE` ([`07-errors.md` §1.3](../../07-errors.md#13-error-object-fields)). Present when `status` is `Rejected`. |
| `details` | object | Cond. | Per-occurrence context of the refusal. With `4002` it carries `constraint`, the pass field whose limit refused the presentation — `maxUses` (check #6) or `maxTotalCredits` (check #7). |

**The refusal carries its code (Normative).** On every `Rejected` the server **MUST** carry `errorCode` and `errorText` — the code and registry name of the failed §5 check, `2002` for a request whose `offlinePass` does not validate against [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json) — a malformed pass is an invalid pass, as the structural check before check #1 has it ([`offline-pass.md` §4](offline-pass.md#4-validation-checks-10)) — `1005` for a request that does not validate against [`authorize-offline-pass-request.schema.json`](../../../schemas/mqtt/authorize-offline-pass-request.schema.json) elsewhere, or `6001` — and, with `4002`, `details.constraint`; the codes are those of §7, the same codes the BLE AuthResponse carries ([`07-errors.md` §4.3](../../07-errors.md#43-ble-message-types)). The three members are additive: a server that predates them sends `reason` alone, [`authorize-offline-pass-response.schema.json`](../../../schemas/mqtt/authorize-offline-pass-response.schema.json) admits both forms, and the station relays such a refusal as §6 rule 5 states. The station is this response's receiver, so it **MUST** accept the members before any server sends them ([`VERSIONING.md`](../../../VERSIONING.md), *Adding a REQUIRED field, and which side moves first*): a station validating against a copy of the schema that predates them refuses the whole response.

## 5. Validation Checks

The server **MUST** perform every check below that is not withdrawn — #1--#4, #6--#10 and #12 — in the listed order. Processing **MUST** stop at the first failure. Checks #5 and #11 are withdrawn: a pass carries no station or organization scope ([`offline-pass.md` §2.3](offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)), and their numbers are not reused.

| # | Check | Error on Failure |
|:--:|-----------------------------------------------|-------------------------------|
| 1 | **Signature verification** -- verify the ECDSA P-256 `signature` field with the key of the server's own key set named by the pass's `keyId` ([`06-security.md` §6.7](../../06-security.md#67-server-signing-key-rotation-ecdsa-p-256)). | `2002 OFFLINE_PASS_INVALID` |
| 2 | **Within its temporal bounds** -- `expiresAt` **MUST** be greater than the current server time, and the pass's age (`now - issuedAt`) **MUST NOT** exceed the forwarding station's `OfflinePassMaxAge` — the value the server configured on it, or the default of [`08-configuration.md` §5](../../08-configuration.md#5-offline--ble-configuration-keys) where it configured none. The station forwards the pass without validating it ([`04-flows.md` §5c](../../04-flows.md#5c-partial-b--phone-offline-station-online)), so the server applies the station's own, stricter limit for it. | `2003 OFFLINE_PASS_EXPIRED` |
| 3 | **Revocation epoch** -- `revocationEpoch` **MUST** be greater than or equal to the platform's current `RevocationEpoch` ([`06-security.md` §6.6](../../06-security.md#66-epoch-based-revocation)). | `2004 OFFLINE_EPOCH_REVOKED` |
| 4 | **Device binding** -- the request's `deviceProof` **MUST** verify under the pass's `devicePublicKey` over the proof input of [`06-security.md` §6.5.4](../../06-security.md#654-device-proof-of-possession), built from the request's `transcriptHash`, `counter`, `bayId`, `serviceId` and `requestedDurationSeconds`, the pass's `passId`, and the forwarding station's identity — the station the server authenticated on the connection the request arrived on. | `2002 OFFLINE_PASS_INVALID` |
| 5 | **Withdrawn** -- a pass carries no station scope. The number is not reused. | — |
| 6 | **Usage limit** -- the transactions **already** counted against this pass **MUST** be fewer than `maxUses`; a pass permits `maxUses` transactions in total. The server's cumulative count and the fleet-wide count of the pass's settled transactions ([`06-security.md` §7.4](../../06-security.md#74-fraud-detection--offline-transactions)) are **one counter, not two** ([`offline-pass.md` §6](offline-pass.md#6-lifecycle)). | `4002 OFFLINE_LIMIT_EXCEEDED` |
| 7 | **Total credits limit** -- the credits already counted **plus** this transaction's estimated cost **MUST NOT** exceed `maxTotalCredits`; a pass permits `maxTotalCredits` credits in total. | `4002 OFFLINE_LIMIT_EXCEEDED` |
| 8 | **Per-transaction credits** -- this transaction's estimated cost **MUST NOT** exceed `maxCreditsPerTx`. | `4004 OFFLINE_PER_TX_EXCEEDED` |
| 9 | **Rate limit** -- elapsed time since last use **MUST** be at least `minIntervalSec` seconds. | `4003 OFFLINE_RATE_LIMITED` |
| 10 | **Counter replay** -- `counter` **MUST** be strictly greater than the last seen counter for this pass. | `2005 OFFLINE_COUNTER_REPLAY` |
| 11 | **Withdrawn** -- a pass carries no organization scope. The number is not reused. | — |
| 12 | **Individual revocation** -- the pass **MUST NOT** be revoked on the server: neither individually, nor by a block on its user, which revokes every pass of that user. This is where per-user revocation reaches a pass presented offline: the station has no server to ask, and this gate does ([`offline-pass.md` §5](offline-pass.md#5-revocation)). | `2014 OFFLINE_PASS_REVOKED` |

**A refused presentation spends its counter value, and counts no use (Normative).** Once a presentation's pass has passed check #1, the server **MUST** raise the last seen counter for the pass to its `counter` when that is greater, whether the presentation is accepted or refused and whichever later check refused it, so the value cannot be presented again: a later presentation that reuses it fails check #10. A refused presentation **MUST NOT** count as a use — the count of check #6 and the credits of check #7 advance for an accepted presentation only ([`offline-pass.md` §6](offline-pass.md#6-lifecycle)). A presentation whose signature fails check #1 spends nothing: it names a pass, but it is not that pass. A retransmission of the same REQUEST — the same `messageId` — is answered as the first was, refused or accepted ([`02-transport.md` §3.3](../../02-transport.md#33-deduplication)); a new REQUEST that presents a `counter` already seen for the pass is a later presentation, and fails check #10 ([`03-messages.md` §2.1](../../03-messages.md#21-authorizeofflinepass), idempotency).

> **Check numbers are identifiers.** The `eventId` of the SecurityEvent §6 requires for checks #1 and #10 is derived from the check number — counter replay is **check #10** here and in the derivation domain `…check_10:` (finding N9) — and the number is cited across the specification. That is why checks #5 and #11 are withdrawn in place rather than removed, and why the revocation check that joins this gate takes a new number, #12, instead of a withdrawn one. The `eventId` is deterministic on `(messageId, N)`; previously emitted rows are immutable historical records. Cross-gate single-ordinal alignment with the reconcile-time list is unnecessary: the two gates run different check sets, and the canonical contract is the wire error code, not the positional index.

## 6. Processing Rules

1. The station **MUST** send this request only when it has an active MQTT connection and has received an OfflinePass via the BLE handshake (Partial B scenario).
2. The station **MUST** forward the OfflinePass unmodified -- it **MUST NOT** alter any fields before sending.
3. The station **MUST** include the `counter`, `bayId`, `serviceId`, `requestedDurationSeconds` and `deviceProof` of the BLE OfflineAuthRequest, unchanged, and the `transcriptHash` of the handshake that carried it. Before it forwards, it **MUST** have verified the `sessionProof` and the device proof itself ([`offline-pass.md` §4](offline-pass.md#4-validation-checks-10) check #4) and refused a bay or service it does not have, and a duration above its `MaxSessionDurationSeconds` ([`ble-handshake.md` §4.1](ble-handshake.md#41-offlineauthrequest-full-offline--partial-b)): a request that fails any of them never reaches the server.
4. On `Accepted`: the station **MUST** store the `sessionId`, `durationSeconds`, and `creditsAuthorized` and then proceed with service activation — of the bay and the service of the request, for no longer than `durationSeconds` ([`ble-session.md` §1](ble-session.md#1-starting-a-service)) — using that `sessionId` for the session in its SessionStarted (rule 4c), MeterValues and SessionEnded and answering a StopService that names it. **A loss of the station's connection does not end the session (Normative):** the station continues the wash and, when it reconnects, sends the session's end — its SessionEnded under that `sessionId`, which it buffers while it cannot transmit ([`session-ended.md` §5](../transaction/session-ended.md#5-processing-rules)). A stop the server commanded whose RESPONSE the loss kept from the server is not closed on the StopService timeout: once the station has reconnected, before the session closes under rule 4a, the server **MUST** repeat the StopService REQUEST, and the station answers it with the RESPONSE it cached ([`stop-service.md` §6](../transaction/stop-service.md#6-processing-rules)). The server settles the session once, on the first of its end records to arrive — that SessionEnded, the StopService RESPONSE when the server stopped it, or the session's signed receipt, which the app uploads and which carries no `sessionId` — and recognises every later one as a duplicate ([`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid)). The station sends no TransactionEvent for the session — its receipt reaches the server as the app's upload — and does not count it in `pendingOfflineTransactions` or against `OfflineTransactionLimit`. The station **MUST** relay the acceptance result back to the app via the BLE AuthResponse.

4a. **A Partial-B session closes at the end of its authorized duration (Normative).** The server holds a started session open until the first of its end records arrives, and no longer than the end of its authorized duration: `durationSeconds` after the server received the session's SessionStarted (rule 4c). If no end record has arrived by then, the server **MUST** close the session at that moment and **MUST NOT** wait for the station: the station runs the wash through a loss of its connection (rule 4), so the server settles the session as one whose timer expired — a full charge — whether or not the station is connected then. An authorization whose start was never reported does not reach this close: it lapses (rule 4c). An end record that arrives after the server closed the session is a duplicate ([`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid)). **A station reboot follows the online boot rules exactly** ([`boot-notification.md` §5.2](../core/boot-notification.md#52-bootreason--seven-boots-and-one-non-boot)). The `bootReason` that keeps an online session, `Reconnect` — the one that names no boot — keeps it: the server waits for the session's end record, and closes it under this rule if none has arrived by the end of its authorized duration. A reason that ends an online session — any of the seven that name a boot — ends it, and the server settles it as it settles an online session a boot ended: pro-rata on the time delivered, from the arrival of the session's SessionStarted to the station's disconnection, which the server records for billing ([`connection-lost.md` §5](../core/connection-lost.md#5-server-side-handling) steps 2 and 4). Where an online session whose station stays away is closed after `ConnectionLostGracePeriod` and billed on the time delivered ([`connection-lost.md` §5](../core/connection-lost.md#5-server-side-handling)), a Partial-B session runs through the loss for its whole authorized duration (rule 4), which is why it is closed at the end of that duration, as delivered.

4b. **Every end record settles on the authorized amount and duration (Normative).** Whichever record settles a Partial-B session — its SessionEnded, the StopService RESPONSE, its receipt, or the server's close under rule 4a — the server **MUST** take the session's full charge as the `creditsAuthorized` and its booked duration as the `durationSeconds` of this response, and **MUST NOT** read a booked duration from the record; the time delivered is the one the record reports. Settlement by service kind therefore reads the same full charge and the same `Fault` threshold ([`04-flows.md` §6](../../04-flows.md#refund-policy)) on every path, and one wash settles at one amount whichever of its records arrives first.

4c. **The start is reported, and an authorization not used to start lapses (Normative).** When it starts the wash, the station **MUST** send a SessionStarted [MSG-043] under the session's `sessionId` ([`03-messages.md` §5.7](../../03-messages.md#57-sessionstarted)), as an online start is acknowledged by its StartService RESPONSE; the server **MUST NOT** infer the start from a StatusNotification of the bay, which names no session. The station **MUST NOT** start the session more than **30 seconds** after it received this response's acceptance — the time an online session gives a mobile app's start after its reservation ([`04-flows.md` Appendix A](../../04-flows.md#appendix-a--timeout-reference), *Reserved → start (mobile)*) — and refuses a StartServiceRequest after that with `3006 SESSION_NOT_FOUND` ([`ble-session.md` §1](ble-session.md#1-starting-a-service) rule 2a). The server **MUST** treat an authorization whose SessionStarted has not arrived **40 seconds** after it accepted it — those 30 seconds, and the 10 an online start's acknowledgement has (Appendix A, *StartService (pending_ack)*) — as lapsed: it closes the session as never started and refunds `creditsAuthorized` in full. A SessionStarted, or any other record of the session, that arrives after the lapse changes nothing. The server is SessionStarted's receiver, so it **MUST** accept the action before any station sends it ([`VERSIONING.md`](../../../VERSIONING.md), *Adding a REQUIRED field, and which side moves first*).
5. On `Rejected`: the station **MUST NOT** start any service. The station **MUST** relay the rejection back to the app via the BLE AuthResponse, carrying the response's `errorCode`, `errorText` and `details` unchanged. A response from a server that predates those members carries `reason` alone, which names no code the station can relay whole — a `4002` would lack the `details.constraint` the AuthResponse requires — so the station relays `6001 SERVER_INTERNAL_ERROR`.
6. The station sends this request only inside a BLE handshake (rule 1), and answers the app within the handshake's budget ([`ble-handshake.md` §1](ble-handshake.md#1-handshake-overview)), which ends before this action's 15-second response timeout: if no response has arrived in time for it to answer within the budget, the station **MUST** treat the request as timed out (error `1010 MESSAGE_TIMEOUT`) and **MAY** fall back to local validation if the Offline profile is supported and its `OfflineModeEnabled` is `true` ([`08-configuration.md` §5](../../08-configuration.md#5-offline--ble-configuration-keys)); the station's own offline limits then apply ([`offline-pass.md` §2.2](offline-pass.md#22-constraints-object)).
7. The server **MUST** log a SecurityEvent for any signature verification failure (check #1) or counter replay (check #10). **Within the §5 authorize-time gate these are the only two**: the other `Rejected` outcomes (expiry, epoch revocation, individual revocation, usage limits, rate limit) are policy decisions, not security incidents, and **MUST NOT** be emitted as SecurityEvents by the server *at authorize time*.

    **The scope of that prohibition is this gate, and only this gate.** The reconcile-time gate answers the question differently and on purpose: [`reconciliation.md` §6.3](reconciliation.md#63-securityevent-emission) **MUST**s an emission for **every** applicable check, expiry included, and the *Recommended Action* cells of `2014`, `2016` and `2017` ([`07-errors.md` §3.2](../../07-errors.md#32-authentication--authorization-errors-2xxx)) say the same for the reconcile-time gate. The two gates are not inconsistent, they are differently situated. At authorize time a policy refusal is a live decision about a credential presented seconds ago, the app is told, and the user can act — logging it as a security incident would fill the audit trail with ordinary refusals. At reconcile time the transaction is already delivered: a policy refusal means money moved against a credential the policy did not permit, nobody is present to act, and the audit row is the only account that will exist. Read this rule as bounded by its own gate, and never as a fleet-wide prohibition.

    The emitted SecurityEvent is **server-originated** — an audit record, not a message; see [`security-event.md` §2.1](../security/security-event.md#21-two-origins-one-payload-shape) — and **MUST** conform to the SecurityEvent profile (`profiles/security/security-event.md`) with the following constraints:

    a. The `type` **MUST** be `OfflinePassRejected` (from the spec-defined enum in `security-event.md` §4).

    b. The `eventId` **MUST** be deterministically derived from the originating REQUEST's `messageId` (not from the underlying credential identifier), so that every distinct authorization REQUEST that fails check #1 or check #10 produces a distinct `eventId`. This preserves attack-attempt visibility: N attempts carried by N distinct REQUESTs (e.g. an attacker probing different forged signatures, or replaying the same credential across multiple stations) produce N distinct audit rows. True wire-level retransmits — QoS 1 redelivery of the same REQUEST with the same `messageId` — are collapsed by transport-layer dedup (`02-transport.md` §3.3) before this handler executes; the audit dedup at this layer is a defense-in-depth for cases where the transport dedup window has elapsed (`02-transport.md` §3.3: ≥1000 messageIds or ≥1 hour).

       Recommended derivation (SHA-256 of a domain-separated input, truncated to 16 hex characters, prefixed with `sec_`):

       - Check #1 (signature verification failure):
         `eventId = "sec_" || lowerhex(SHA-256("ospp:authorize_offline_pass:check_1:" || messageId))[0:16]`

       - Check #10 (counter replay):
         `eventId = "sec_" || lowerhex(SHA-256("ospp:authorize_offline_pass:check_10:" || messageId))[0:16]`

       Implementations **MAY** use a different derivation scheme provided that (i) the resulting `eventId` matches the `sec_` + hexadecimal format from `security-event.md` §6 (rule 2), (ii) the derivation is deterministic for the same originating `messageId` and check number, (iii) distinct `messageId`s produce distinct `eventId`s (i.e. the derivation is collision-resistant in the relevant domain), and (iv) the derivation is documented in the implementation's deployment manifest.

    c. The `details` object **SHOULD** include `offlinePassId`, the failed check number, the rejection `errorCode` (`2002` for signature; `2005` for counter replay), the originating `messageId`, and — for check #10 — the rejected `counter` value and the server's known `lastSeenCounter`, for forensic reconstruction. The `messageId` in `details` allows operators to correlate the audit row back to the originating REQUEST, since the `eventId` is a hash and not a human-readable reference.

    d. The `timestamp` field **MUST** reflect when the validation failure was detected by the server, not when the offending REQUEST was originally sent by the station.

## 7. Error Codes

**These codes are transmitted.** A refusal carries its code in `errorCode` and its registry name in `errorText` (§4), and, with `4002`, `details.constraint`. Machine-readable detail beyond them lives in the server-originated `OfflinePassRejected` record of rule 7 of §6, for the two checks that emit one, correlated to this response by the originating REQUEST's `messageId`. `reason` stays beside them as a human-readable description; it is not a code, and no receiver matches on it.

> **What this replaced.** Until this revision the response was closed over `status`, `sessionId`, `durationSeconds`, `creditsAuthorized` and `reason`, so these codes were recorded and never transmitted, and `reason` was asked to identify the failed check — in the schema as the registry name, in this section as the check's number or `errorText` as free text, and in a conformance vector as prose. A station relaying a refusal to the app had no code to relay. `errorCode`, `errorText` and `details` are now members of the response, and `reason` is prose only.

| Code | Text | Severity | Description |
|:----:|-------------------------------|----------|-----------------------------------------------|
| 1005 | `INVALID_MESSAGE_FORMAT` | Error | The request does not validate against its schema — a member missing, extra or out of range — outside its `offlinePass`. |
| 2002 | `OFFLINE_PASS_INVALID` | Error | ECDSA P-256 signature verification failed (check #1), the device proof does not verify (check #4), or the pass is malformed: its `offlinePass` does not validate against the OfflinePass schema. |
| 2003 | `OFFLINE_PASS_EXPIRED` | Warning | Pass `expiresAt` timestamp has passed, or the pass is older than the forwarding station's `OfflinePassMaxAge`. |
| 2004 | `OFFLINE_EPOCH_REVOKED` | Error | Pass `revocationEpoch` is less than the platform's current epoch. |
| 2005 | `OFFLINE_COUNTER_REPLAY` | Critical | Counter is not strictly greater than last seen; possible replay attack. |
| 2014 | `OFFLINE_PASS_REVOKED` | Error | The pass is revoked on the server, individually or by a block on its user (check #12). |
| 4002 | `OFFLINE_LIMIT_EXCEEDED` | Error | `maxUses` or `maxTotalCredits` exceeded. |
| 4003 | `OFFLINE_RATE_LIMITED` | Warning | `minIntervalSec` constraint violated. |
| 4004 | `OFFLINE_PER_TX_EXCEEDED` | Error | Requested service cost exceeds `maxCreditsPerTx`. |
| 6001 | `SERVER_INTERNAL_ERROR` | Error | Server-side processing failure. Station **SHOULD** retry. |

## 8. Examples

### 8.1 Request

```json
{
  "messageId": "msg_c2d3e4f5-a6b7-8901-cdef-234567890abc",
  "messageType": "Request",
  "action": "AuthorizeOfflinePass",
  "timestamp": "2026-02-13T10:05:12.340Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlinePassId": "opass_a8b9c0d1e2f3",
    "offlinePass": {
      "passId": "opass_a8b9c0d1e2f3",
      "sub": "sub_9a8b7c6d",
      "deviceId": "dev_android_abc123",
      "devicePublicKey": "AnqCJkURKXFi9hQaO5EzjzvZXf8V0LCdzMg496b+y2rN",
      "keyId": "YjX5pR0TzmU3ubs17wImQQ",
      "issuedAt": "2026-02-13T09:50:00.000Z",
      "expiresAt": "2026-02-13T10:50:00.000Z",
      "policyVersion": 1,
      "revocationEpoch": 42,
      "offlineAllowance": {
        "maxTotalCredits": 200,
        "maxUses": 5,
        "maxCreditsPerTx": 50
      },
      "constraints": {
        "minIntervalSec": 60
      },
      "signatureAlgorithm": "ECDSA-P256-SHA256",
      "signature": "MEQCIHtTBR62/kj2qeB7M2BXb1yek5fh7ryc+lhz5N0sJLPNAiAHnbvbzTENpzKRSUflA/9BsgokbMZbDR1BdsxN4tZlPg=="
    },
    "counter": 5,
    "bayId": "bay_a1b2c3d4",
    "serviceId": "svc_eco",
    "requestedDurationSeconds": 300,
    "deviceProof": {
      "format": "android-key",
      "signature": "MEUCIQDc4B8LhNrkLgEKqbaolGy/eGIIF6ZQ5vN93byJtgBJ8AIgGbHG0iACfeM0mMRxMpjPXvbNgYMkDi+Vqju/EOumqNQ="
    },
    "transcriptHash": "kDtv6PscMeE30BerjTKjR2ZAqIO1Jio5OWJE8CqCi8g="
  }
}
```

### 8.2 Response (Accepted)

```json
{
  "messageId": "msg_c2d3e4f5-a6b7-8901-cdef-234567890abc",
  "messageType": "Response",
  "action": "AuthorizeOfflinePass",
  "timestamp": "2026-02-13T10:05:12.580Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted",
    "sessionId": "sess_f7e8d9c0",
    "durationSeconds": 300,
    "creditsAuthorized": 30
  }
}
```

### 8.3 Response (Rejected)

```json
{
  "messageId": "msg_c2d3e4f5-a6b7-8901-cdef-234567890abc",
  "messageType": "Response",
  "action": "AuthorizeOfflinePass",
  "timestamp": "2026-02-13T10:05:12.580Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Rejected",
    "reason": "OfflinePass revocation epoch (38) is below the current server epoch (42). The pass has been batch-revoked.",
    "errorCode": 2004,
    "errorText": "OFFLINE_EPOCH_REVOKED"
  }
}
```

## 9. Related Schemas

- Request: [`authorize-offline-pass-request.schema.json`](../../../schemas/mqtt/authorize-offline-pass-request.schema.json)
- Response: [`authorize-offline-pass-response.schema.json`](../../../schemas/mqtt/authorize-offline-pass-response.schema.json)
- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 1005, 2002--2005, 2014, 4002--4004, 6001)
