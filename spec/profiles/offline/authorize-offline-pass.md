# AuthorizeOfflinePass

> **Status:** Draft | **OSPP Version:** 0.25.0

## 1. Overview

AuthorizeOfflinePass is a station-initiated request used in the **Partial B** offline scenario (phone offline, station online). When a user presents an OfflinePass via BLE and the station has MQTT connectivity, the station forwards the pass to the server for validation. The server performs cryptographic and policy checks and responds with an acceptance (granting a session) or rejection (with a reason code).

This action provides stronger security guarantees than local-only validation because the server can check real-time wallet balance, revocation status, and cross-station usage patterns. Offline authorization cache is configurable via `AuthorizationCacheEnabled` (see §8 Configuration).

> **Compliance note:** AuthorizeOfflinePass is used in the Partial B scenario, which is required only at **Complete** compliance level. Stations implementing only Basic offline compliance (Full Offline and Partial A) are not required to implement this action.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|-----------------|---------|----------|-----------------------------------------------|
| `offlinePassId` | string | Yes | Unique identifier of the offline pass (`opass_` prefix). |
| `offlinePass` | object | Yes | Full OfflinePass object (see [offline-pass.md](offline-pass.md)). |
| `deviceId` | string | Yes | Identifier of the mobile device presenting the pass. |
| `counter` | integer | Yes | Monotonic usage counter for replay protection (minimum 0). |
| `bayId` | string | Yes | Target bay identifier. |
| `serviceId` | string | Yes | Requested service identifier. |

## 4. Response Payload

| Field | Type | Required | Description |
|---------------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted` or `Rejected`. |
| `sessionId` | string | Cond. | Assigned session identifier. Present when `status` is `Accepted`. |
| `durationSeconds` | integer | Cond. | Authorized service duration in seconds. Present when `status` is `Accepted`. |
| `creditsAuthorized` | integer | Cond. | Number of credits authorized for this session. Present when `status` is `Accepted`. |
| `reason` | string | Cond. | Human-readable rejection reason. Present when `status` is `Rejected`. |

## 5. Validation Checks (11 checks)

The server **MUST** perform all of the following checks in order. Processing **MUST** stop at the first failure.

| # | Check | Error on Failure |
|:--:|-----------------------------------------------|-------------------------------|
| 1 | **Signature verification** -- verify the ECDSA P-256 `signature` field against the server's own signing public key. | `2002 OFFLINE_PASS_INVALID` |
| 2 | **Not expired** -- `expiresAt` **MUST** be greater than the current server time. | `2003 OFFLINE_PASS_EXPIRED` |
| 3 | **Revocation epoch** -- `revocationEpoch` **MUST** be greater than or equal to the server's current `RevocationEpoch`. | `2004 OFFLINE_EPOCH_REVOKED` |
| 4 | **Device binding** -- `offlinePass.deviceId` **MUST** match the `deviceId` field in the request. | `2002 OFFLINE_PASS_INVALID` |
| 5 | **Station allowance** -- the reporting station **MUST** be permitted by the `allowed_station_ids` of the **server's stored pass record** (not a wire field). | `2006 OFFLINE_STATION_MISMATCH` |
| 6 | **Usage limit** -- the transactions **already** counted against this pass **MUST** be fewer than `maxUses`; a pass permits `maxUses` transactions in total. The server's cumulative count and the reconcile-time fleet-wide count are **one counter, not two** ([`offline-pass.md` §6](offline-pass.md#6-lifecycle) step 5). | `4002 OFFLINE_LIMIT_EXCEEDED` |
| 7 | **Total credits limit** -- the credits already counted **plus** this transaction's estimated cost **MUST NOT** exceed `maxTotalCredits`; a pass permits `maxTotalCredits` credits in total. | `4002 OFFLINE_LIMIT_EXCEEDED` |
| 8 | **Per-transaction credits** -- this transaction's estimated cost **MUST NOT** exceed `maxCreditsPerTx`. | `4004 OFFLINE_PER_TX_EXCEEDED` |
| 9 | **Rate limit** -- elapsed time since last use **MUST** be at least `minIntervalSec` seconds. | `4003 OFFLINE_RATE_LIMITED` |
| 10 | **Counter replay** -- `counter` **MUST** be strictly greater than the last seen counter for this pass. | `2005 OFFLINE_COUNTER_REPLAY` |
| 11 | **Org binding** -- the issuing `organization_id` of the **server's stored pass record** **MUST** equal the reporting station's `organization_id`. Applies to ALL passes (scoped and unscoped). | `2015 OFFLINE_ORG_MISMATCH` |

> **Org binding is one canonical invariant (finding N9).** Check #11 here and the reconcile-time gate's check #7 ([`reconciliation.md` §6.1](reconciliation.md#61-check-list)) are the **same** organization-binding invariant, keyed by the **same wire error code `2015 OFFLINE_ORG_MISMATCH`**. The positional index differs only because the two gates run different check sets in different contexts (authorize-time station-presented credential vs reconcile-time settlement); the invariant, its semantics ("the pass's issuing org must equal the reporting station's org, for scoped and unscoped passes alike"), and its error code are identical. Both read `organization_id` from the **server's stored pass record**, so neither requires the organization to be carried in the signed pass body. Like the other policy rejections at authorize-time (expiry, epoch, station, limits, rate), an org mismatch is **not** a SecurityEvent (§6 rule 7); only check #1 and check #10 emit. (v0.6.0/S2 aligns the §6 `eventId` derivation to this §5 table — counter-replay is **check #10** here and in the derivation domain `…check_10:` (finding N9). The `eventId` is deterministic on `(messageId, N)`, so the `check_5 → check_10` migration changes only **future** audit-row identifiers; previously emitted rows are immutable historical records. Cross-gate single-ordinal alignment with the reconcile-time list remains unnecessary: the two gates run different check sets, and the canonical contract is the wire error code, not the positional index.)

## 6. Processing Rules

1. The station **MUST** send this request only when it has an active MQTT connection and has received an OfflinePass via the BLE handshake (Partial B scenario).
2. The station **MUST** forward the OfflinePass unmodified -- it **MUST NOT** alter any fields before sending.
3. The station **MUST** include the `counter` value from the BLE OfflineAuthRequest to enable replay protection verification on the server.
4. On `Accepted`: the station **MUST** store the `sessionId`, `durationSeconds`, and `creditsAuthorized`, then proceed with service activation. The station **MUST** relay the acceptance result back to the app via the BLE AuthResponse.
5. On `Rejected`: the station **MUST NOT** start any service. The station **MUST** relay the rejection back to the app via the BLE AuthResponse with the appropriate error code.
6. If no response is received within 15 seconds, the station **MUST** treat the request as timed out (error `1010 MESSAGE_TIMEOUT`) and **MAY** fall back to local validation if the Offline profile is supported.
7. The server **MUST** log a SecurityEvent for any signature verification failure (check #1) or counter replay (check #10). This is the only case in which the server itself emits a SecurityEvent on behalf of a station-presented credential; other `Rejected` outcomes (expiry, epoch revocation, station mismatch, org mismatch, usage limits, rate limit) are policy decisions, not security incidents, and **MUST NOT** be emitted as SecurityEvents by the server.

    The emitted SecurityEvent **MUST** conform to the SecurityEvent profile (`profiles/security/security-event.md`) with the following constraints:

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

| Code | Text | Severity | Description |
|:----:|-------------------------------|----------|-----------------------------------------------|
| 2002 | `OFFLINE_PASS_INVALID` | Error | ECDSA P-256 signature verification failed or pass structure is invalid. |
| 2003 | `OFFLINE_PASS_EXPIRED` | Warning | Pass `expiresAt` timestamp has passed. |
| 2004 | `OFFLINE_EPOCH_REVOKED` | Error | Pass `revocationEpoch` is less than the server's current epoch. |
| 2005 | `OFFLINE_COUNTER_REPLAY` | Critical | Counter is not strictly greater than last seen; possible replay attack. |
| 2006 | `OFFLINE_STATION_MISMATCH` | Error | Station not in the pass's allowed station list. |
| 2015 | `OFFLINE_ORG_MISMATCH` | Error | Pass's issuing organization does not match the reporting station's organization (check #11; same invariant as `reconciliation.md` §6.1 check #7). |
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
      "issuedAt": "2026-02-13T09:50:00.000Z",
      "expiresAt": "2026-02-13T10:50:00.000Z",
      "policyVersion": 1,
      "revocationEpoch": 42,
      "offlineAllowance": {
        "maxTotalCredits": 200,
        "maxUses": 5,
        "maxCreditsPerTx": 50,
        "allowedServiceTypes": [
          "svc_eco",
          "svc_standard"
        ]
      },
      "constraints": {
        "minIntervalSec": 60,
        "stationOfflineWindowHours": 24,
        "stationMaxOfflineTx": 50
      },
      "signatureAlgorithm": "ECDSA-P256-SHA256",
      "signature": "MEQCIAnYOdbX0GrJNoudnOUPviB8qyjrTDLrwI32eGPmvJP+AiA3+5yjsH4JMUjItqGE83WOx58hbBkK1fBAi56MMeip9w=="
    },
    "deviceId": "dev_android_abc123",
    "counter": 5,
    "bayId": "bay_a1b2c3d4",
    "serviceId": "svc_eco"
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
    "reason": "OfflinePass revocation epoch (38) is below the current server epoch (42). The pass has been batch-revoked."
  }
}
```

## 9. Related Schemas

- Request: [`authorize-offline-pass-request.schema.json`](../../../schemas/mqtt/authorize-offline-pass-request.schema.json)
- Response: [`authorize-offline-pass-response.schema.json`](../../../schemas/mqtt/authorize-offline-pass-response.schema.json)
- OfflinePass: [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2002--2006, 2015, 4002--4004, 6001)
