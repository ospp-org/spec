# TransactionEvent

> **Status:** Draft

## 1. Overview

TransactionEvent is a station-initiated REQUEST sent to report completed offline transactions to the server for reconciliation. It carries the full transaction record including cryptographic receipts, transaction counters, and meter values. The server responds with an acknowledgement status indicating whether the transaction was accepted, was a duplicate, was rejected, or should be retried later.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHOULD**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** REQUEST / RESPONSE

## 3. Request Payload

| Field | Type | Required | Description |
|---------------------|---------|----------|-----------------------------------------------|
| `offlineTxId` | string | Yes | Unique offline transaction identifier (`otx_` prefix). |
| `offlinePassId` | string | Yes | OfflinePass used for authorization (`opass_` prefix). |
| `userId` | string | Yes | User who initiated the transaction (`sub_` prefix). |
| `bayId` | string | Yes | Bay where the service ran (`bay_` prefix). |
| `serviceId` | string | Yes | Catalog service that was executed (`svc_` prefix) — the commercial offering, and therefore the field that identifies the price paid. Not the station's physical program. |
| `startedAt` | string | Yes | ISO 8601 UTC timestamp of service activation. |
| `endedAt` | string | Yes | ISO 8601 UTC timestamp of service completion. |
| `durationSeconds` | integer | Yes | Actual duration in seconds (minimum 1). |
| `creditsCharged` | integer | Yes | Credits charged for the session. |
| `receipt` | object | Yes | Cryptographically signed receipt (see section 4). The `txCounter` is included in the signed receipt data for integrity. |
| `txCounter` | integer | Yes | Monotonic transaction counter (minimum 1). Also included in the signed receipt data. |
| `meterValues` | object | No | Resource consumption readings (liquidMl, consumableMl, energyWh). |

## 4. Receipt Object

| Field | Type | Required | Description |
|----------------------|---------|----------|-----------------------------------------------|
| `data` | string | Yes | Base64-encoded canonical JSON of receipt data. |
| `signature` | string | Yes | Base64-encoded ECDSA P-256 signature over `data`. |
| `signatureAlgorithm` | string | Yes | Constant: `ECDSA-P256-SHA256`. |

## 5. Response Payload

| Field | Type | Required | Description |
|------------|---------|----------|-----------------------------------------------|
| `status` | string | Yes | `Accepted`, `Duplicate`, `Rejected`, or `RetryLater`. |
| `reason` | string | Cond. | Human-readable explanation. Required when `status` is `Rejected`, `Duplicate`, or `RetryLater`. |

### 5.1 Response Status Values

Each status carries **two separate obligations** — whether the station sends this transaction again, and what it does with its local record. They are not the same instruction and they do not always move together:

| Status | Send it again? | Local record | Meaning |
|--------------|---|---|---------------------------------------------------|
| `Accepted` | **MUST NOT** | **MUST** delete | Transaction recorded successfully. |
| `Duplicate` | **MUST NOT** | **MUST** delete | The server already holds **this same transaction** — same `offlineTxId`, same signed receipt (`reconciliation.md` §3). Nothing is in dispute, so the station's copy has no further purpose. |
| `Rejected` | **MUST NOT** | **MUST** retain, marked rejected | The transaction was refused on its merits — bad receipt, revoked pass, a failed §6 gate check, or an `offlineTxId` that collides with a stored transaction carrying **different** data. |
| `RetryLater` | **MUST** retry after backoff | **MUST** retain | Server is temporarily unable to process. |

**Only `RetryLater` directs the station to send the transaction again.** The other three are terminal for *sending*. The server never holds a transaction in an unresolved state: an offline transaction that reaches the server is settled, deduplicated, or rejected on its own merits, and the station always learns which.

> **Terminal for sending is not the same as terminal for the record, and conflating them destroys evidence.** `Rejected` stops the station resending and **keeps** its copy; `Duplicate` does both. The distinction is load-bearing for one case in particular: an `offlineTxId` that arrives a second time carrying **different** data is either a collision or tampering, and [`reconciliation.md` §9](../offline/reconciliation.md) requires the server to **retain both records and alert the operator**. The station's copy is one of those two records — it is the only one not under the control of whoever submitted the second claim. Answering that case `Duplicate` would order the station to delete exactly the evidence the comparison needs, which is why it is answered `Rejected`.

## 6. Processing Rules

1. The station **MUST** send TransactionEvent for each offline transaction after establishing an MQTT connection and receiving an `Accepted` BootNotification.
2. The station **SHOULD** send transactions in `txCounter` order (oldest first), so the operator's forensic view matches the order events occurred. This is a preference, not a correctness requirement: the server settles each transaction on its own merits in the order it arrives (`reconciliation.md` §2).
3. The station **MUST NOT** send the next TransactionEvent until the previous one has been acknowledged.
4. On `Accepted` or `Duplicate`: the station **MUST NOT** send the transaction again, and **MUST** delete it from its local offline log. Deletion **MAY** be deferred by up to 72 hours so the station keeps a short local audit window (`reconciliation.md` §2 step 5); what it **MUST NOT** do is send the transaction again in the meantime.
5. On `Rejected`: the station **MUST NOT** retry, and **MUST** retain the transaction in its local log marked as rejected — it is not deleted, because a rejection is the one terminal outcome where the station's copy is still evidence. The station **MUST** flag it for manual investigation, and **SHOULD** report the rejection via a SecurityEvent if the `reason` indicates credential issues.
6. On `RetryLater`: the station **MUST** retry with exponential backoff (initial 5s, cap 300s (online retry scenario -- server responds RetryLater)). The station **MUST NOT** skip the transaction or proceed to the next.
7. The server **MUST** validate the `receipt.signature` against the station's known ECDSA public key. If verification fails, the server **MUST** respond with `Rejected`.
8. The server **MUST** record the `txCounter` as forensic evidence and **MUST NOT** condition the response on it. If the counter is not contiguous with the server's record for this station, the server **SHOULD** raise an operator alert on the station and **MUST** process the transaction normally (`reconciliation.md` §4.2).

## 7. Offline Transaction Integrity

### 7.1 Transaction Counter

Each offline transaction includes a monotonic `txCounter`, carried as forensic evidence:

- `txCounter` is a monotonically increasing integer starting at 1 for each station.
- The `txCounter` is included in the signed receipt data, ensuring its integrity is protected by the receipt signature.
- The server records the `txCounter` and does not gate on it. A discontinuity is an operator alert on the **station**, not a fraud signal against the **user**, and never withholds settlement — see `reconciliation.md` §4.2 and `06-security.md` §6.3.1 for why a station-generated counter cannot carry a completeness guarantee.

> **`txCounter` vs `seqNo`:** The offline `txCounter` (per-pass, per-station) and the online per-session `seqNo` defined in [`02-transport.md §3.2`](../../02-transport.md) are independent counters with distinct scopes. `txCounter` orders offline transactions across the station's full offline log; `seqNo` orders session-scoped EVENTs within a single online session. A station may simultaneously increment `txCounter` for a freshly completed offline transaction queued for reconciliation and `seqNo` for an unrelated active online session. Both counters MUST be persisted to NVS before the corresponding message is published.

### 7.2 Deduplication

The server **MUST** deduplicate transactions using the `offlineTxId` field. When a transaction with the same `offlineTxId` already exists, the answer depends on whether the two submissions carry the **same** transaction, and [`reconciliation.md` §3](../offline/reconciliation.md) is the single source of truth for the comparison:

- **Same signed `receipt.data`** — a retransmission of a transaction the server already holds. The server **MUST** respond `Duplicate` without re-processing.
- **Different signed `receipt.data`** — two different claims under one `offlineTxId`. The server **MUST** respond `Rejected`, retain both records, and alert the operator (§9 of that profile).

This section previously read *"**MUST** respond with `Duplicate` regardless of payload differences"*, which collapsed the two and, because `Duplicate` orders the station to delete its copy, instructed it to destroy one of the two records `reconciliation.md` §9 requires be retained for comparison.

### 7.3 Reconciliation

When the station reports `pendingOfflineTransactions > 0` in BootNotification, the server **SHOULD** expect TransactionEvent messages after acceptance. The server **MUST** reconcile offline charges against the user's wallet balance and apply any adjustments (under- or over-charge corrections).

## 8. Error Handling

| Condition | Error Code | Behaviour |
|--------------------------------------|---------------------------|-----------------------------------------------|
| Receipt signature verification fails | `2002 OFFLINE_PASS_INVALID` | Server responds with `Rejected`. |
| OfflinePass revocation epoch mismatch | `2004 OFFLINE_EPOCH_REVOKED` | Server responds with `Rejected`. |
| Invalid payload format | `1005 INVALID_MESSAGE_FORMAT` | Server responds with `Rejected`. |
| Payload semantically invalid | `3015 PAYLOAD_INVALID` | Server responds with `Rejected`. |
| Server internal error | `6001 SERVER_INTERNAL_ERROR` | Server responds with `RetryLater`. |

## 9. Examples

### 9.1 Request (Offline Transaction)

```json
{
  "messageId": "msg_b7c8d9e0-f1a2-3456-abcd-789012345def",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T10:15:30.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_d4e5f6a7",
    "offlinePassId": "opass_a8b9c0d1e2f3",
    "userId": "sub_9a8b7c6d",
    "bayId": "bay_a1b2c3d4",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T09:52:00.000Z",
    "endedAt": "2026-02-13T09:56:45.000Z",
    "durationSeconds": 285,
    "creditsCharged": 48,
    "receipt": {
      "data": "eyJiYXlJZCI6ImJheV9hMWIyYzNkNCIsImNyZWRpdHNDaGFyZ2VkIjo0OCwiZGV2aWNlSWQiOiJkZXZfZDRlNWY2YTciLCJkdXJhdGlvblNlY29uZHMiOjI4NSwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMDk6NTY6NDUuMDAwWiIsIm1ldGVyVmFsdWVzIjp7ImNvbnN1bWFibGVNbCI6NDcwLCJlbmVyZ3lXaCI6MTM4LCJsaXF1aWRNbCI6NDI4MDB9LCJvZmZsaW5lUGFzc0lkIjoib3Bhc3NfYThiOWMwZDFlMmYzIiwib2ZmbGluZVR4SWQiOiJvdHhfZDRlNWY2YTciLCJwYXNzQ291bnRlciI6Nywic2VydmljZUlkIjoic3ZjX2VjbyIsInN0YXJ0ZWRBdCI6IjIwMjYtMDItMTNUMDk6NTI6MDAuMDAwWiIsInR4Q291bnRlciI6NSwidXNlcklkIjoic3ViXzlhOGI3YzZkIn0=",
      "signature": "MEUCIQDJqpr+TRAF2ZrcQxtLrpfPOzWvHKSvLmeyZcWNdwApNwIge7pIaiE+fs+rC+fHSP6krvyLG9jG9ny6pL6WqQBiE/A=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 5,
    "meterValues": {
      "liquidMl": 42800,
      "consumableMl": 470,
      "energyWh": 138
    },
    "deviceId": "dev_d4e5f6a7",
    "passCounter": 7
  }
}
```

### 9.2 Response (Accepted)

```json
{
  "messageId": "msg_b7c8d9e0-f1a2-3456-abcd-789012345def",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T10:15:30.200Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

### 9.3 Response (Duplicate)

```json
{
  "messageId": "msg_b7c8d9e0-f1a2-3456-abcd-789012345def",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T10:15:30.200Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Duplicate",
    "reason": "Transaction otx_d4e5f6a7 was already processed."
  }
}
```

### 9.4 Response (Rejected)

```json
{
  "messageId": "msg_b7c8d9e0-f1a2-3456-abcd-789012345def",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-13T10:15:30.200Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Rejected",
    "reason": "Receipt signature verification failed (2002 OFFLINE_PASS_INVALID)."
  }
}
```

## 10. Related Schemas

- Request: [`transaction-event-request.schema.json`](../../../schemas/mqtt/transaction-event-request.schema.json)
- Response: [`transaction-event-response.schema.json`](../../../schemas/mqtt/transaction-event-response.schema.json)
- Offline TX ID: [`offline-tx-id.schema.json`](../../../schemas/common/offline-tx-id.schema.json)
- Offline Pass ID: [`offline-pass-id.schema.json`](../../../schemas/common/offline-pass-id.schema.json)
- Receipt: [`receipt.schema.json`](../../../schemas/common/receipt.schema.json)
- Meter Values: [`meter-values.schema.json`](../../../schemas/common/meter-values.schema.json)
- Credit Amount: [`credit-amount.schema.json`](../../../schemas/common/credit-amount.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 2002, 2004, 1005, 3015, 6001)
