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
| `serviceId` | string | Yes | Service program that was executed (`svc_` prefix). |
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

| Status | Description |
|--------------|---------------------------------------------------------------|
| `Accepted` | Transaction recorded successfully. Station **MUST** delete local copy. |
| `Duplicate` | Transaction already exists (matched by `offlineTxId`). Station **MUST** delete local copy. |
| `Rejected` | Transaction is invalid (bad receipt, revoked pass). Station **MUST** flag for manual review. |
| `RetryLater` | Server is temporarily unable to process. Station **MUST** retry after backoff. |

## 6. Processing Rules

1. The station **MUST** send TransactionEvent for each offline transaction after establishing an MQTT connection and receiving an `Accepted` BootNotification.
2. The station **MUST** send transactions in `txCounter` order (oldest first) to preserve counter continuity.
3. The station **MUST NOT** send the next TransactionEvent until the previous one has been acknowledged.
4. On `Accepted` or `Duplicate`: the station **MUST** delete the transaction from its local offline log.
5. On `Rejected`: the station **MUST** mark the transaction as rejected in its local log and **MUST NOT** retry. The station **SHOULD** report the rejection via a SecurityEvent if the `reason` indicates credential issues.
6. On `RetryLater`: the station **MUST** retry with exponential backoff (initial 5s, cap 300s (online retry scenario -- server responds RetryLater)). The station **MUST NOT** skip the transaction or proceed to the next.
7. The server **MUST** validate the `receipt.signature` against the station's known ECDSA public key. If verification fails, the server **MUST** respond with `Rejected`.
8. The server **MUST** validate the `txCounter` sequence for gap detection. If the counter is not contiguous with the server's record of the previous transaction, the server **SHOULD** accept the transaction but flag it for reconciliation audit.

## 7. Offline Transaction Integrity

### 7.1 Transaction Counter

Each offline transaction includes a monotonic `txCounter` for ordering and gap detection:

- `txCounter` is a monotonically increasing integer starting at 1 for each station.
- The `txCounter` is included in the signed receipt data, ensuring its integrity is protected by the receipt signature.
- The server verifies that received `txCounter` values form a contiguous sequence with no gaps. Gaps indicate missing transactions and are flagged as a HIGH-severity fraud signal.

### 7.2 Deduplication

The server **MUST** deduplicate transactions using the `offlineTxId` field. If a transaction with the same `offlineTxId` already exists, the server **MUST** respond with `Duplicate` regardless of payload differences.

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
  "protocolVersion": "0.1.0",
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
      "data": "eyJ0eElkIjoib3R4X2Q0ZTVmNmE3IiwiY3JlZGl0cyI6NDh9",
      "signature": "MEUCIQDtjLkM5bXhZA1rQ7vYzN0cBpL2hUwF9jD6tG3nKm4xRgIgWpRf8sT2aHb3cKdV5eYnM6jLqNwO7xPzU1iS0kA9vE=",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 5,
    "meterValues": {
      "liquidMl": 42800,
      "consumableMl": 470,
      "energyWh": 138
    }
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
  "protocolVersion": "0.1.0",
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
  "protocolVersion": "0.1.0",
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
  "protocolVersion": "0.1.0",
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
