# Glossary

> **Status:** Draft | **OSPP Version:** 0.1.0-draft.1

This glossary provides normative definitions for all terms used throughout the OSPP
specification. Where a definition involves a requirement, normative language
(**MUST**, **SHALL**, etc.) is used per [BCP 14](https://www.rfc-editor.org/info/bcp14).

> Terms are organized alphabetically. Where a term is defined in detail within a
> specific chapter, the chapter reference is provided for additional context.
> The definitions in this glossary are authoritative.

---

## A

**ACL (Access Control List)**
: A set of rules enforced by the MQTT broker that restrict which topics a client
  **MAY** publish to or subscribe from. ACLs bind a station's Client ID to its
  permitted topic namespace, preventing cross-station access.
  See [Chapter 02, Section 6](02-transport.md).

**Action**
: The operation name carried in the `action` field of the message envelope. Actions
  are PascalCase strings (e.g., `BootNotification`, `StartService`, `Heartbeat`)
  defined by their respective profiles. Each action maps to exactly one payload
  schema. See [Chapter 03](03-messages.md).

**Arming Package**
: See **Offline Pass** (in this glossary). Legacy term retained for backward
  compatibility with pre-v0.1 documentation.

## B

**Bay**
: The unit of service delivery within a **Station**. A bay has its own state machine,
  meter, and set of available **Services**. Bays are identified by the `bay_` prefix
  followed by 8 or more lowercase hexadecimal characters (e.g., `bay_a1b2c3d4`).
  See [Chapter 01, Section 2.2](01-architecture.md).

**BLE (Bluetooth Low Energy)**
: A wireless communication technology used for the offline communication path between
  a mobile application (acting as the **BLE Central**) and a station (acting as the
  **BLE Peripheral**). OSPP uses BLE for **OfflinePass** delivery, session control,
  and receipt retrieval when MQTT connectivity is unavailable.
  See [Chapter 02, Section 8](02-transport.md).

**BLE Central**
: The device that initiates a BLE connection. In OSPP, the mobile application acts
  as the BLE Central. See also: **BLE**, **BLE Peripheral**.

**BLE Peripheral**
: The device that advertises and accepts BLE connections. In OSPP, the station acts
  as the BLE Peripheral. See also: **BLE**, **BLE Central**.

**Boot Notification**
: The first message a station sends after connecting (or reconnecting) to the server.
  A BootNotification reports the station's identity, firmware version, capabilities,
  and bay inventory. The server **MUST** respond with the accepted heartbeat interval
  and current server time. See the [Core profile](profiles/core/README.md).

## C

**Compliance Level**
: The degree to which an implementation conforms to the OSPP specification. Four
  levels are defined: **Development** (minimal, for prototyping), **Standard**
  (production baseline), **Extended** (Standard plus additional profiles), and
  **Complete** (all profiles implemented).
  See [spec/profiles/README.md](profiles/README.md) for details.

**Credit**
: An abstract unit of value used for session billing. One credit represents the
  smallest billable unit in the system. Credit balances are tracked by the server
  and, during offline operation, estimated locally on the mobile device.

**CSMS (Central Self-service Management System)**
: The server-side component that manages stations, sessions, subscribers,
  configuration, and billing. Also referred to as **Server** throughout this
  specification. See [Chapter 01, Section 1.1](01-architecture.md).

## D

**Defense in Depth**
: A security strategy employing multiple independent layers of protection so that
  no single failure compromises the entire system. OSPP applies defense in depth
  across transport (TLS), message (HMAC), application (authorization), and physical
  (secure element) layers. See [Chapter 06, Section 1.2](06-security.md).

## E

**ECDH (Elliptic Curve Diffie-Hellman)**
: An elliptic-curve key agreement protocol used during the BLE handshake to establish
  a shared secret between the mobile application and the station. The shared secret
  is then fed into **HKDF** to derive session keys. See [Chapter 06](06-security.md)
  and the [Offline profile](profiles/offline/README.md).

**ECDSA (Elliptic Curve Digital Signature Algorithm)**
: A digital signature algorithm using elliptic curves. OSPP uses ECDSA with curve
  P-256 (secp256r1) for all asymmetric signing operations: mTLS certificates,
  **OfflinePass** signing, and session **Receipt** signing. The Root CA uses
  ECDSA P-384 for stronger trust anchor security. All software-based signing
  operations **MUST** use deterministic nonces per RFC 6979.
  See [Chapter 06, Section 4](06-security.md).

**Envelope**
: The top-level JSON structure wrapping every OSPP MQTT message. An envelope contains
  the fields `messageId`, `messageType`, `action`, `timestamp`, `source`,
  `protocolVersion`, `payload`, and optionally `mac`. BLE messages do **not** use
  the envelope format. See [Chapter 03, Conventions](03-messages.md).

**Epoch Revocation**
: A mechanism for revoking **OfflinePass** tokens by advancing a monotonic epoch
  counter on the server. Stations reject any OfflinePass whose epoch is older than
  the station's current epoch. See the [Offline profile](profiles/offline/README.md).

**EVENT**
: A message type for unsolicited, unidirectional notifications. EVENTs do not expect
  a RESPONSE. Typical EVENTs include `StatusNotification`, `MeterValues`, and
  `SecurityEvent`. See [Chapter 03, Conventions](03-messages.md).
  See also: **REQUEST**, **RESPONSE**.

## F

**Faulted**
: A bay state indicating a hardware or software fault that prevents normal operation.
  A faulted bay **MUST NOT** accept new sessions or reservations. The station reports
  faulted status via `StatusNotification` with a diagnostic error code.
  See [Chapter 05-state-machines](05-state-machines.md).

**FSM (Finite State Machine)**
: A computational model that defines the valid states and transitions for OSPP
  entities. OSPP defines FSMs for bays, sessions, reservations, BLE connections,
  and firmware updates. See [Chapter 05-state-machines](05-state-machines.md).

## G

**GATT (Generic Attribute Profile)**
: The BLE protocol layer used for structured data exchange between a Central and
  Peripheral device. OSPP defines six GATT characteristics for station info,
  available services, transaction requests/responses, service status, and receipts.
  See [Chapter 02, Section 8](02-transport.md) and [Chapter 03](03-messages.md).

## H

**Hash-Chain** *(removed)*
: Previously used for transaction log integrity. Replaced by **signed counter** (`txCounter`)
  in ECDSA-signed receipts. The server detects missing transactions via counter gaps
  during reconciliation. See [Chapter 06 — Security](06-security.md).

**Heartbeat**
: A periodic liveness message sent by the station to the server. The heartbeat
  interval is configured by the server in the `BootNotification` response and
  **MUST** be honored by the station. A missed heartbeat triggers server-side
  alerting. See the [Core profile](profiles/core/README.md).

**HKDF (HMAC-based Key Derivation Function)**
: A key derivation function defined in RFC 5869. OSPP uses HKDF-SHA256 to derive
  HMAC session keys and BLE encryption keys from shared secrets established via
  **ECDH**. See [Chapter 06, Section 5.3](06-security.md).

**HMAC (Hash-based Message Authentication Code)**
: A mechanism for verifying message integrity and authenticity using a shared secret
  key. OSPP uses HMAC-SHA256 for MQTT message signing (via the `mac` field in the
  envelope) and HMAC-SHA512 for webhook signature verification.
  See [Chapter 03, Conventions](03-messages.md) and [Chapter 06, Section 4](06-security.md).

## I

**Identifier**
: A prefixed string that uniquely identifies an OSPP entity. Identifiers follow the
  pattern `{prefix}_{hex}` where the prefix denotes the entity type and `{hex}` is
  8 or more lowercase hexadecimal characters (e.g., `stn_a1b2c3d4e5f6`).
  Standard prefixes: `stn_` (station), `bay_` (bay), `sess_` (session),
  `sub_` (subscriber), `svc_` (service), `rsv_` (reservation), `otx_` (offline
  transaction), `opass_` (offline pass), `msg_` (message), `fwupd_` (firmware
  update), `sec_` (security event). See [Chapter 01, Section 3](01-architecture.md).

## J

**JSON (JavaScript Object Notation)**
: The data interchange format used for all OSPP messages, as defined in RFC 8259.
  All OSPP payloads **MUST** be valid JSON encoded in UTF-8 without a BOM.
  See [Chapter 03, Conventions](03-messages.md).

**JSON Schema**
: A vocabulary for annotating and validating JSON documents. OSPP uses JSON Schema
  Draft 2020-12 to define the structure of all message payloads. Machine-readable
  schemas are provided in the `schemas/` directory.

## L

**LWT (Last Will and Testament)**
: An MQTT mechanism where a client registers a message with the broker at connect
  time; the broker publishes this message if the client disconnects ungracefully.
  OSPP uses LWT to report station connectivity loss to the server. The Will Delay
  Interval **MUST** be set to 10 seconds to avoid false disconnect notifications.
  See [Chapter 02, Section 4.3](02-transport.md).

## M

**Meter Values**
: Consumption measurements reported by the station during an active session.
  Meter values include water volume (liters), chemical volume (milliliters),
  energy consumed (watt-hours), and elapsed time (seconds). Reported via the
  `MeterValues` EVENT message. See the [Transaction profile](profiles/transaction/README.md).

**MQTT (Message Queuing Telemetry Transport)**
: A publish-subscribe messaging protocol used as the primary transport for all
  online station-to-server communication. OSPP **REQUIRES** MQTT version 5.0
  ([OASIS Standard](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html));
  MQTT 3.1.1 is **NOT** supported. See [Chapter 02](02-transport.md).

**mTLS (Mutual TLS)**
: A TLS configuration where both the client (station) and the server (broker)
  present and verify **X.509** certificates. mTLS is **REQUIRED** for all MQTT
  connections. The station's Client ID **MUST** match the Common Name (CN) in its
  client certificate. See [Chapter 06, Section 3](06-security.md).

## O

**Offline Pass**
: A digitally signed authorization token that allows a station to start a session
  without real-time server connectivity. The server signs the OfflinePass with
  **ECDSA P-256** (RFC 6979 deterministic nonces); the station verifies the signature
  offline using a pre-distributed public key. An OfflinePass includes a credit limit,
  expiry time, subscriber identifier, and revocation epoch.
  See the [Offline profile](profiles/offline/README.md) and [Chapter 06, Section 5.1](06-security.md).

**Offline Transaction**
: A session initiated and completed without server connectivity, authorized by an
  **Offline Pass** delivered via **BLE**. Offline transactions are stored locally
  by the station and **MUST** be reconciled with the server when connectivity is
  restored. See also: **Reconciliation**.

**OSPP (Open Self-Service Point Protocol)**
: The protocol defined by this specification for secure, interoperable communication
  between self-service stations and a central management system. OSPP covers
  station lifecycle, session management, metering, billing, security, and offline
  operation.

## P

**Payload**
: The action-specific data within an OSPP message **Envelope**. The payload is a
  JSON object whose schema is determined by the `action` and `messageType` fields
  of the enclosing envelope. See [Chapter 03](03-messages.md).

**Profile**
: A modular grouping of related OSPP actions and behaviors. Profiles allow
  implementations to support subsets of the full specification. OSPP defines five
  profiles: **Core** (mandatory), **Transaction**, **Device Management**,
  **Security**, and **Offline** (all optional). See [profiles/](profiles/).

**Provisioning**
: The process of initializing a station with its identity, certificates,
  cryptographic keys, and initial configuration before first deployment. Provisioning
  **MUST** occur over a secure channel and **SHOULD** use a hardware secure element
  for key storage. See [Chapter 06, Section 8](06-security.md).

## Q

**QoS (Quality of Service)**
: The MQTT delivery guarantee level. Three levels exist: QoS 0 (at most once),
  QoS 1 (at least once), and QoS 2 (exactly once). All OSPP MQTT messages
  **MUST** use QoS 1 to ensure reliable delivery with acceptable overhead.
  See [Chapter 02, Section 3](02-transport.md).

## R

**Receipt**
: A cryptographic proof of a completed session, signed by the station using
  **ECDSA** P-256. A receipt contains the session identifier, bay identifier,
  subscriber identifier, start/end timestamps, final meter totals, and billed
  amount. Receipts are available via MQTT (`TransactionEvent`) and BLE (Receipt
  characteristic). See the [Transaction profile](profiles/transaction/README.md)
  and [Chapter 06](06-security.md).

**Reconciliation**
: The process of synchronizing **Offline Transactions** with the server after
  connectivity is restored. The station **MUST** upload all pending offline
  transaction records, and the server **MUST** validate, deduplicate, and apply
  them to subscriber accounts. See the [Offline profile](profiles/offline/README.md).

**REQUEST**
: A message type that initiates an operation and expects exactly one **RESPONSE**
  correlated by the same `messageId`. If no RESPONSE is received within the
  configured timeout, the sender **SHOULD** retry with the same `messageId`.
  See [Chapter 03, Conventions](03-messages.md).

**Reservation**
: A time-limited hold on a **Bay** for a specific **Subscriber**, preventing other
  subscribers from starting a session on that bay during the reservation period.
  Reservations have a configurable duration and expire automatically if not
  activated. See the [Transaction profile](profiles/transaction/README.md)
  and [Chapter 05-state-machines](05-state-machines.md).

**RESPONSE**
: A message type sent in reply to a **REQUEST**, carrying the same `messageId` for
  correlation. Every REQUEST **MUST** receive exactly one RESPONSE. A RESPONSE
  includes a `status` field indicating success or failure.
  See [Chapter 03, Conventions](03-messages.md).

## S

**Server**
: The central management system that stations connect to. Synonymous with **CSMS**.

**Service**
: A discrete operation that a **Bay** can perform (e.g., eco program, standard program,
  deluxe program, auxiliary service). Each service has an identifier (prefixed `svc_`), display
  name, metering unit, and pricing. Services are reported via `StatusNotification`
  events and updated via `UpdateServiceCatalog` commands.
  See [Chapter 01, Section 2.3](01-architecture.md).

**Session**
: An active usage period at a **Bay** during which a **Subscriber** consumes one or
  more **Services**. A session begins with `StartService`, ends with `StopService`
  or timeout, and is identified by the `sess_` prefix followed by 8 or more
  lowercase hexadecimal characters. The
  session lifecycle is governed by the Session FSM.
  See [Chapter 05-state-machines](05-state-machines.md) and the
  [Transaction profile](profiles/transaction/README.md).

**SSP (Self-Service Point)**
: Alternative term for **Station**, used in the protocol name (Open **S**elf-**S**ervice
  **P**oint Protocol). See also: **Station**, **OSPP**.

**Station**
: A physical self-service installation containing a controller, one or more **Bays**,
  network connectivity (MQTT and optionally BLE), and optional peripherals. Stations
  are identified by the `stn_` prefix followed by 8 or more lowercase hexadecimal
  characters (e.g., `stn_a1b2c3d4e5f6`).
  See [Chapter 01, Section 2.1](01-architecture.md).

**StatusNotification**
: An **EVENT** message reporting the current state of one or more bays. The station
  sends StatusNotification after any bay state transition and periodically as
  configured. See the [Core profile](profiles/core/README.md).

**Subscriber**
: An end user of the self-service system who initiates sessions and is billed for
  service consumption. Subscribers are identified by the `sub_` prefix followed by
  8 or more lowercase hexadecimal characters. See [Chapter 01](01-architecture.md).

## T

**TLS (Transport Layer Security)**
: The cryptographic protocol used to secure MQTT and HTTPS connections. OSPP
  **REQUIRES** TLS 1.3 (RFC 8446); earlier versions **MUST NOT** be used.
  0-RTT (early data) **MUST NOT** be enabled due to replay risk.
  See [Chapter 02, Section 1.3](02-transport.md) and [Chapter 06, Section 2](06-security.md).

**Topic**
: An MQTT publish/subscribe address. OSPP uses structured topic patterns:
  `ospp/v1/stations/{station_id}/to-server` for station-to-server messages and
  `ospp/v1/stations/{station_id}/to-station` for server-to-station messages.
  Topic access is controlled via **ACLs**.
  See [Chapter 02, Section 2](02-transport.md).

**Transaction**
: The financial record associated with a **Session**. A transaction tracks the credit
  deductions, meter readings, and billing outcome for one session. Every session
  produces exactly one transaction, reported via `TransactionEvent` when the session
  ends. In offline scenarios, transactions are stored locally and **MUST** be
  reconciled when connectivity is restored. See also: **Session**, **Reconciliation**.

**Transaction Event**
: A message reporting the completion of a session, including final **Meter Values**,
  billing totals, and a signed **Receipt**. The station sends a `TransactionEvent`
  after every session ends (whether normally, by timeout, or by fault).
  See the [Transaction profile](profiles/transaction/README.md).

## U

**UUID (Universally Unique Identifier)**
: A 128-bit identifier defined in RFC 4122. OSPP uses UUID version 4 (random) for
  all entity identifiers and message IDs. UUIDs **MUST** be represented as lowercase
  hyphenated strings (e.g., `550e8400-e29b-41d4-a716-446655440000`).
  See [Chapter 01, Section 3](01-architecture.md).

## X

**X.509**
: The ITU-T standard for public key certificates used in OSPP **mTLS**
  authentication. Station certificates **MUST** include the station identifier as
  the Common Name (CN) and be issued by a trusted Certificate Authority in the
  OSPP PKI trust chain. See [Chapter 06, Section 3.2](06-security.md).
