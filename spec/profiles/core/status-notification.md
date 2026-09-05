# StatusNotification

> **Status:** Draft

## 1. Overview

StatusNotification is sent by the station whenever a bay's operational state changes. It enables the server to maintain an accurate, real-time view of all bays across the fleet. This is a fire-and-forget EVENT -- the server does not send a response.

Each notification reports the bay identifier, the new status, the previous status, the availability of every **program** on the bay, and optionally error details when the bay enters the `Faulted` state.

> **Programs, not services — and the message could not be sent otherwise.** A **program** is a physical operation the hardware performs; its ordinal is a firmware constant the station always knows. A **service** is a commercial offer the *server* mints and pushes in the catalog ([UpdateServiceCatalog](../device-management/update-service-catalog.md)). A station cannot originate knowledge of a service — it can only echo what it was told — and immediately after its first boot it has been told nothing. The old shape required at least one `svc_`-prefixed identifier in a message [CORE-004](README.md) requires the station to send at that exact moment, so a conforming first boot was impossible. Reporting programs closes that, and puts the ownership boundary where it belongs: the station reports what it physically has, the server maps those programs to the services it sells.

## 2. Direction and Type

- **Direction:** Station to Server
- **Type:** EVENT

## 3. Payload Fields

| Field | Type | Required | Description |
|-------------------|-----------------|----------|-----------------------------------------------|
| `bayId` | string | Yes | Bay identifier within the station (`bay_` prefix). |
| `bayNumber` | integer | Yes | Ordinal bay number (minimum 1), as the station declared it. Its correspondence to `bayId` is supplied **explicitly** by the `bays` array in the provisioning response, whose members pair the two ([Flows §2](../../04-flows.md#2-station-provisioning)). That is the only place the mapping is supplied. Bay numbers need **not** be dense. |
| `status` | string | Yes | New bay status (see Bay States below). |
| `previousStatus` | string | No | Previous bay status before this transition. Required on a transition report, omitted on the post-boot report (§5 rule 2). |
| `programs` | array\<object\> | Yes | Program availability list, one entry per program this bay declared at provisioning (1--32 items). |
| `errorCode` | integer | No | OSPP numeric error code (when `status` is `Faulted`). |
| `errorText` | string | No | Machine-readable error name in `UPPER_SNAKE_CASE`. |

### 3.1 Program Object

| Field | Type | Required | Description |
|-------------|---------|----------|-----------------------------------------------|
| `programNumber` | integer | Yes | Program ordinal (1--32), as declared for this bay at provisioning and re-declared at every boot. |
| `available` | boolean | Yes | Whether this program can run on this bay right now. |
| `errorCode` | integer | No | Why this program is unavailable, from the 5xxx range (or 9000--9999 vendor). Present only when `available` is `false`. See §6.1. |
| `errorText` | string | No | Machine-readable name for the program-level `errorCode`, in `UPPER_SNAKE_CASE`. Accompanies `errorCode` whenever that is present. |

The **set** of `programNumber` values MUST equal the set this bay declared for the same `bayNumber` in its BootNotification topology ([`boot-notification.md` §3](boot-notification.md)). A program that cannot run is reported present with `available: false`, **never omitted** — omission means the hardware changed, and that requires re-provisioning, not a status report.

## 4. Reportable Bay States

These are the six values `status` and `previousStatus` may carry. The bay state machine has a seventh state, `Unknown`, which is not one of them ([Chapter 05 — State Machines §2.2](../../05-state-machines.md#22-states-7)).

| State | Description |
|-----------------|---------------------------------------------------------------|
| `Available` | Bay is idle and ready to accept a new session. |
| `Reserved` | Bay is reserved for an upcoming session. |
| `Occupied` | Bay has an active service session. |
| `Finishing` | Service has ended; bay is in cool-down or wrap-up. |
| `Faulted` | Bay has a hardware or software fault. |
| `Unavailable` | Bay is in maintenance mode or otherwise out of service. |

## 5. Transition Rules

**Which transitions are legal is [`05-state-machines.md` §2.3](../../05-state-machines.md#23-transition-table), and this profile does not restate it.** That table is the only
one; an earlier revision of this section carried a second copy, the two drifted apart on seven
edges, and the two SDKs implemented one copy each and rejected each other's traffic. What this
section states is what is local to *this message*: which half of the table it can carry, when
`previousStatus` is present, and what accompanies a fault.

1. **This message carries the `Station` rows and only those.** §2.3 marks each transition with the
   party that effects it. The twenty-one `Station` rows are exactly the transitions a station
   performs and therefore exactly the transitions this EVENT reports. The six `Server` rows — every
   state to `Unknown`, on connection loss — are the server's own inference; no message carries them,
   this one included, and a station **MUST NOT** implement them. What a server does with a
   transition §2.3 does not contain is
   [`05-state-machines.md` §2.5](../../05-state-machines.md#25-invalid-transitions), stated there
   once and deliberately not restated here.
2. The station **MUST** include `previousStatus` when this report's `status` differs from the last `status` it reported for the bay, and **MUST** omit it otherwise. Two cases omit it, and they are the only two:
   - **The post-boot report.** The station is leaving `Unknown`, and `Unknown` is not a value this field can carry (§7 rule 2), so there is nothing truthful to put there.
   - **A program-only report** (rule 4). The bay's status did not change, so there is no transition to name; writing `status` into `previousStatus` would assert a `X → X` transition that the canonical table does not contain and that [Chapter 05 §2.5](../../05-state-machines.md#25-invalid-transitions) therefore makes invalid.

   The field's absence is load-bearing but narrower than it looks: it means **this report is not a bay transition**. A server distinguishes the post-boot case by position — it is the first report after an accepted boot — not by the absence alone.
3. When a bay transitions to `Faulted`, the station **MUST** include the bay-level `errorCode` and `errorText` from the 5xxx error range.
4. Program availability is reported on **every** StatusNotification, not only on a bay transition. A program that becomes unavailable while the bay stays `Available` — one consumable exhausted, one nozzle blocked — **MUST** be reported within 1 second, on the same deadline §7 rule 3 sets for a bay transition. Such a report is **not** a bay transition: `status` is unchanged and `previousStatus` is omitted (rule 2). The server updates program availability and leaves the bay's state alone.

## 6. Error Reporting

### 6.0 Bay-Level (Faulted State)

1. When a bay enters the `Faulted` state, the station **MUST** populate the bay-level `errorCode` with a numeric code from the 5xxx range (Station Hardware & Software Errors) and `errorText` with the corresponding `UPPER_SNAKE_CASE` identifier.
2. The server **MUST** log the fault, update the bay state in its registry, and notify operators via the fleet dashboard.
3. If the error severity is `Critical` (e.g., `5001 PUMP_SYSTEM`, `5009 EMERGENCY_STOP`), the server **MUST** generate an operator alert immediately.
4. A `Faulted` bay **MUST NOT** accept new sessions or reservations until it transitions back to `Available` or `Unavailable`.
5. Vendor-specific error details **MAY** be included using error codes in the 9000--9999 range. Receivers that do not recognize a vendor code **MUST** treat it as `5000 HARDWARE_GENERIC`.

### 6.1 Program-Level

A bay can be perfectly healthy and still have one program it cannot run — a consumable exhausted, a valve stuck, a sensor on one circuit failed. That is what `programs[].available: false` says. On its own it says only *that*, and an operator reading it sees a dead program with no way to tell a blown fuse from a failed sensor: two faults, one truck roll, the wrong tools.

1. When a program is reported `available: false`, the station **SHOULD** include `programs[].errorCode` and `programs[].errorText` naming why. It **MUST NOT** include either when `available` is `true`.
2. Program-level codes come from the same 5xxx registry as bay-level codes, with the same 9000--9999 vendor range and the same unknown-code fallback (rule 5 above).
3. Program-level reporting is **OPTIONAL** and does not extend [CORE-012](README.md), which mandates `errorCode`/`errorText` only when the **bay** transitions to `Faulted`. A station that cannot attribute a fault to a cause reports the unavailability without a code rather than guessing one.

   **At bay level there is no such escape, and since 0.33.0 there is no need for one.** CORE-012 is unconditional and the schema enforces it (`if status == Faulted then required: [errorCode, errorText]`), so a bay entering `Faulted` always carries a code. The case this rule licences at program level — the station knows something is wrong and cannot say what — is answered at bay level by `5113 OUTCOME_INDETERMINATE`, which names *not having observed* rather than guessing a fault. Before it existed, [`start-service.md` §6](../transaction/start-service.md) rule 12 mandated a `Faulted` report and named no code, and every candidate in the range asserted something the station had not seen; the message that rule required did not validate.
4. The two levels are independent and both may be present. A bay-level code describes the bay; a program-level code describes one program on it. A fault that takes out every program is a **bay** fault and belongs at bay level with `status: "Faulted"` — reporting it as 32 identical program-level codes is conforming but useless.

## 7. Processing Rules

1. The station **MUST** send a StatusNotification for every bay immediately after BootNotification `Accepted` to establish the initial fleet state.
2. The station **MUST NOT** report `Unknown` in `status` or `previousStatus`. `Unknown` is the bay FSM's seventh state and is not a wire value ([Chapter 05 §2.2](../../05-state-machines.md)): the station enters it at power-on and leaves it by self-test, and the server enters it on connection loss and leaves it on the next accepted report. Neither party tells the other. A station whose self-test has not finished has not yet satisfied rule 1 — it reports once it knows, rather than reporting that it does not.
3. The station **MUST** send a StatusNotification within 1 second of any bay state change.
4. StatusNotification is an EVENT -- no response is expected. The station **MUST NOT** wait for an acknowledgement before continuing.
5. If MQTT is disconnected, the station **MAY** buffer StatusNotification events locally and replay them in chronological order upon reconnection, but it **MAY** equally discard them. StatusNotification is **regenerable**: the station reports every bay's current state immediately after the next BootNotification is accepted, so the server recovers the truth at reconnection without the backlog. Buffer capacity is finite and is owed to the messages that are *not* regenerable — TransactionEvent, SessionEnded and SecurityEvent — per [`01-architecture.md` §7](../../01-architecture.md), which governs this classification.
6. The server **MUST** update the bay state record atomically. StatusNotifications may arrive out of order; the ordering rule — which report wins, and what does and does not advance the discard floor — is [`02-transport.md §3.2`](../../02-transport.md) and is deliberately **not** restated here. An earlier revision of this rule said only "latest timestamp wins", which named no floor and no provenance for it; a server implementer who read this profile and not the transport chapter had everything they needed to build the wrong thing.

## 8. Examples

### 8.1 Bay Transition (Available to Occupied)

```json
{
  "messageId": "msg_d9e0f1a2-b3c4-5678-abcd-901234567abc",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:10:01.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "bayNumber": 1,
    "previousStatus": "Available",
    "status": "Occupied",
    "programs": [
      {
        "programNumber": 1,
        "available": false
      },
      {
        "programNumber": 2,
        "available": true
      },
      {
        "programNumber": 3,
        "available": true
      }
    ]
  }
}
```

### 8.2 Bay Transition (Available to Faulted)

```json
{
  "messageId": "msg_e2f3a4b5-c6d7-8901-1234-234567890abc",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T10:12:30.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a1b2c3d4",
    "bayNumber": 1,
    "previousStatus": "Available",
    "status": "Faulted",
    "programs": [
      {
        "programNumber": 1,
        "available": false
      },
      {
        "programNumber": 2,
        "available": false
      },
      {
        "programNumber": 3,
        "available": false
      }
    ],
    "errorCode": 5001,
    "errorText": "PUMP_SYSTEM"
  }
}
```

## 9. Related Schemas

- Payload: [`status-notification.schema.json`](../../../schemas/mqtt/status-notification.schema.json)
- Bay Status enum: [`bay-status.schema.json`](../../../schemas/common/bay-status.schema.json)
- Bay ID: [`bay-id.schema.json`](../../../schemas/common/bay-id.schema.json)
- Bay topology (the program ordinals this message reports on): [`bay-topology.schema.json`](../../../schemas/common/bay-topology.schema.json)
- Error codes: [Chapter 07 — Error Codes & Resilience](../../07-errors.md) (codes 5000--5009, 5100--5107)
