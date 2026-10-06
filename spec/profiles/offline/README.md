# Offline / BLE Profile

> **Status:** Draft — **mixed maturity, read this before implementing.**
>
> This profile spans two transports, and they are not at the same maturity.
>
> | Part | Documents | Status |
> |---|---|---|
> | Offline credential and reconciliation, over **MQTT** | [`offline-pass.md`](offline-pass.md), [`reconciliation.md`](reconciliation.md) | **Stable** — implemented and exercised against a second implementation — except check #4's device proof and the estimated cost of checks #7 and #8, which read the BLE request: **EXPERIMENTAL** |
> | Partial-B authorization and its start report, over **MQTT** | [`authorize-offline-pass.md`](authorize-offline-pass.md) | **EXPERIMENTAL** — its request carries the device proof and the transcript hash of a BLE handshake, and changed incompatibly with the BLE wire revision |
> | The app–server contract, over **HTTPS** | [`app-contract.md`](app-contract.md) | **Draft** — binds the server and the app, not the station |
> | **BLE** transport, handshake and session | [`ble-transport.md`](ble-transport.md), [`ble-handshake.md`](ble-handshake.md), [`ble-session.md`](ble-session.md) | **EXPERIMENTAL** |
>
> **The BLE half is EXPERIMENTAL and implementable as written.** Its two blockers are closed
> ([KNOWN-ISSUES](../../../KNOWN-ISSUES.md#closed--the-ble-surface-was-not-implementable-as-written-two-defects)):
> fragmentation has one definition, [`ble-transport.md` §11](ble-transport.md#11-fragmentation-protocol),
> and every BLE response refuses in one shape ([Chapter 07 §2.3](../../07-errors.md#23-ble-error-response)).
> It stays EXPERIMENTAL until its cryptographic construction has passed the review of
> [Chapter 06, Appendix B](../../06-security.md#appendix-b--ble-cryptographic-review-checklist)
> ([ADR-003](../../../adr/ADR-003-ble-station-authentication-by-certificate.md)) — that review is the
> one condition — and until then it is published for review, **not** for implementation, and may
> change incompatibly without a MAJOR bump. **Complete** compliance therefore cannot be claimed while it is
> EXPERIMENTAL; **Development**, **Standard** and **Extended** are unaffected.

## 1. Overview

The **Offline / BLE** profile is optional and enables stations to operate in degraded connectivity scenarios using Bluetooth Low Energy (BLE) as an alternative communication channel between the mobile app and the station. When a station or the user's device lacks internet connectivity, the BLE profile provides a secure path for authentication, service activation, and receipt generation -- ensuring the station remains operational even during network outages.

This profile also includes **AuthorizeOfflinePass**, an MQTT message used in the Partial B scenario (phone offline, station online) where the station forwards a BLE-received OfflinePass to the server for validation, and **SessionStarted**, the MQTT event by which the station reports that the wash of such a session started ([`authorize-offline-pass.md` §6](authorize-offline-pass.md#6-processing-rules) rule 4c).

## 2. Connectivity Scenarios

| Scenario | Phone | Station | Strategy | Auth Mechanism |
|------------|---------|-----------|------------|--------------------------------------|
| Online | Online | Online | Online | Normal MQTT flow |
| Partial A | Online | Offline | PartialA | Server signs auth, BLE delivers |
| Partial B | Offline | Online | PartialB | OfflinePass via BLE, which the station forwards to the server over MQTT and the server validates |
| Full Offline | Offline | Offline | FullOffline | OfflinePass via BLE, station validates locally |

## 3. BLE Roles

In the OSPP BLE architecture, the station and app assume the following roles:

- **Station: GATT Peripheral (Advertiser).** The station advertises its presence via BLE, exposing the OSPP GATT service (UUID `6645FFF0-5AEB-4709-ACD5-02E03C3000F6`, [ble-transport.md §2](ble-transport.md#2-gatt-service-definition)) with six characteristics. This role assignment is appropriate because the station is a fixed-location device that is always powered on and waiting for connections -- analogous to a BLE beacon.

- **App: GATT Central (Scanner).** The mobile app scans for nearby stations, discovers them via the advertised service UUID, and initiates the connection. This role assignment is appropriate because the user actively seeks out the station to start a service session, and the app has a user interface to select the station and service.

This role assignment also aligns with mobile OS power management: iOS and Android optimize BLE scanning in Central mode, and Peripheral mode on mobile devices is subject to background execution restrictions that would make it unreliable.

## 4. Document Index

| Document | Description |
|-------------------------------------|-----------------------------------------------|
| [AuthorizeOfflinePass](authorize-offline-pass.md) | MQTT-based offline pass validation (Partial B scenario) — **EXPERIMENTAL**, with the BLE handshake whose device proof and transcript hash its request carries |
| [App–Server Contract](app-contract.md) | Pass issuance with its trust bundle, the app's receipt upload, and the trust bundle a Partial-A authorization carries — binds the server and the app, not the station |
| [BLE Transport](ble-transport.md) | Hardware requirements, GATT service definition, characteristics, advertising, MTU negotiation, fragmentation — **EXPERIMENTAL** |
| [BLE Handshake](ble-handshake.md) | Hello / Challenge / authentication sequence, BLE version negotiation, the station's signature with its certificate, ephemeral ECDH P-256 and session key derivation (HKDF-SHA256), the device proof, AEAD channel — **EXPERIMENTAL** |
| [BLE Session](ble-session.md) | Service start, real-time monitoring, stop, receipt retrieval, connection drop handling — **EXPERIMENTAL** |
| [OfflinePass](offline-pass.md) | Server-signed offline credential structure — the user's, valid at any station that accepts offline passes — its validation checks, revocation, lifecycle — **stable**, except check #4's device proof and the estimated cost of checks #7 and #8, which read the BLE request: **EXPERIMENTAL** |
| [Reconciliation](reconciliation.md) | Offline transaction sync, deduplication, receipt verification, the re-validation gate, fraud detection, wallet debit — **stable** |

## 5. Compliance Requirements

1. A station that declares the Offline / BLE profile in its BootNotification (`capabilities.bleSupported: true` **and** `capabilities.offlineModeSupported: true` — [`profiles/README.md` §4.1](../README.md#41-station-conformance)) **MUST** implement everything listed above **that is not marked EXPERIMENTAL** — a document, or a part of a stable one, as check #4's device proof and the estimated cost of checks #7 and #8 are in OfflinePass — except the app–server contract, which no station takes part in. Conformance against what is marked EXPERIMENTAL — the three BLE documents, AuthorizeOfflinePass, which rule 7 makes mandatory, and those parts of OfflinePass — becomes claimable when it leaves EXPERIMENTAL, and not before.

   > **Why the rule is scoped rather than stated whole.** Four of the documents above are EXPERIMENTAL, so "implements all documents listed above" has no satisfiable meaning for the BLE half while they are — which would leave a station that has built the stable half with **no conformant declaration to make**. The escape an earlier revision offered here was itself unsound: it said such a station *"does not need to declare `bleSupported`"*, but [§2](#2-connectivity-scenarios) above puts BLE on the phone↔station leg of **all three** offline scenarios — Partial A, Partial B and Full Offline alike — so a station without BLE cannot originate an offline transaction at all. It could only reconcile transactions it had no way to create. Dropping the declaration does not buy conformance; it buys an unreachable profile.
   >
   > The honest position is the one the compliance levels already take, and this rule matches it: **Complete**, the level that requires this profile, cannot be claimed while the BLE documents are EXPERIMENTAL; **Development**, **Standard** and **Extended** are unaffected, and the capability declaration stays truthful about the hardware the station actually has.
2. The station MUST support the Full Offline and Partial B connectivity scenarios. Partial A support is RECOMMENDED but MAY be omitted if the station does not store server-signed authorization verification keys.
3. The station MUST support BLE 4.2 or later, with the LE Data Packet Length Extension, and the connection floor of [ble-transport.md §10](ble-transport.md#10-connection-parameters); BLE 5.0 is RECOMMENDED. BLE pairing (LESC) is OPTIONAL — channel security is provided at the application layer — an ephemeral ECDH P-256 handshake the station authenticates with its certificate, a ChaCha20-Poly1305 AEAD channel and the phone's device proof ([06-security.md §6.4–§6.5.4](../../06-security.md#64-ble-transport-security)) — not by link-layer pairing.
4. All BLE handshakes MUST complete within 10 seconds. The station MUST reject handshakes that exceed this timeout.
5. The station MUST generate ECDSA-P256-SHA256 signed receipts for every offline transaction and MUST maintain a monotonic `txCounter` across transactions, carried in the signed receipt as forensic evidence. The server does not gate on it (`reconciliation.md` §4.2).
6. The station MUST buffer offline transactions and synchronize them via TransactionEvent upon reconnection.
7. **AuthorizeOfflinePass** (Partial B) is **mandatory for every station that implements this profile**. When the station has MQTT connectivity and receives an OfflinePass via BLE (Partial B), it MUST forward the pass to the server for validation rather than validating locally — with the bay, the service, the requested duration and the device proof ([authorize-offline-pass.md §3](authorize-offline-pass.md#3-request-payload)) — and MAY validate it itself only when the server's answer does not come ([authorize-offline-pass.md §6](authorize-offline-pass.md#6-processing-rules) rule 6).
