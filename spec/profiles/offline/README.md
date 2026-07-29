# Offline / BLE Profile

> **Status:** Draft — **mixed maturity, read this before implementing.**
>
> This profile spans two transports, and they are not at the same maturity in 0.8.
>
> | Part | Documents | Status in 0.8 |
> |---|---|---|
> | Offline credential and reconciliation, over **MQTT** | [`offline-pass.md`](offline-pass.md), [`authorize-offline-pass.md`](authorize-offline-pass.md), [`reconciliation.md`](reconciliation.md) | **Stable** — implemented and exercised against a second implementation |
> | **BLE** transport, handshake and session | [`ble-transport.md`](ble-transport.md), [`ble-handshake.md`](ble-handshake.md), [`ble-session.md`](ble-session.md) | **EXPERIMENTAL** |
>
> **The BLE half carries three blockers that make it unimplementable as written**, stated in
> full in [KNOWN-ISSUES](../../../KNOWN-ISSUES.md#blocker--the-ble-surface-is-not-implementable-as-written-three-defects):
> **B-1** two incompatible fragmentation protocols both normative ([Chapter 02 §8.6](../../02-transport.md)
> vs [`ble-transport.md` §11](ble-transport.md)); **B-2** a station-scoped OfflinePass that check 5
> and TC-OFF-002 require but [`offline-pass.schema.json`](../../../schemas/common/offline-pass.schema.json)
> cannot express; **B-3** three BLE response schemas that disagree with each other and with
> [Chapter 07 §2.3](../../07-errors.md), one with no rejection branch at all.
>
> BLE is published for review, **not** for implementation, and may change incompatibly without a
> MAJOR bump. It is marked rather than repaired because it is implemented nowhere — repairing it
> would mean deciding against nothing to validate the decisions. **Extended** and **Complete**
> compliance therefore cannot be claimed against 0.8; **Development** and **Standard** are
> unaffected.
>
> Note that B-2 is narrower than it appears: it bites on the BLE path only. On MQTT the station
> constraint is server-side state rather than a wire field (§4 of
> [`authorize-offline-pass.md`](authorize-offline-pass.md)), so reconciliation is unaffected.

## 1. Overview

The **Offline / BLE** profile is optional and enables stations to operate in degraded connectivity scenarios using Bluetooth Low Energy (BLE) as an alternative communication channel between the mobile app and the station. When a station or the user's device lacks internet connectivity, the BLE profile provides a secure path for authentication, service activation, and receipt generation -- ensuring the station remains operational even during network outages.

This profile also includes **AuthorizeOfflinePass**, an MQTT message used in the Partial B scenario (phone offline, station online) where the station forwards a BLE-received OfflinePass to the server for validation.

## 2. Connectivity Scenarios

| Scenario | Phone | Station | Strategy | Auth Mechanism |
|------------|---------|-----------|------------|--------------------------------------|
| Online | Online | Online | Online | Normal MQTT flow |
| Partial A | Online | Offline | PartialA | Server signs auth, BLE delivers |
| Partial B | Offline | Online | PartialB | OfflinePass via BLE, station validates via MQTT |
| Full Offline | Offline | Offline | FullOffline | OfflinePass via BLE, station validates locally |

## 3. BLE Roles

In the OSPP BLE architecture, the station and app assume the following roles:

- **Station: GATT Peripheral (Advertiser).** The station advertises its presence via BLE, exposing the OSPP GATT service (UUID `0000FFF0-...`) with six characteristics. This role assignment is appropriate because the station is a fixed-location device that is always powered on and waiting for connections -- analogous to a BLE beacon.

- **App: GATT Central (Scanner).** The mobile app scans for nearby stations, discovers them via the advertised service UUID, and initiates the connection. This role assignment is appropriate because the user actively seeks out the station to start a service session, and the app has a user interface to select the station and service.

This role assignment also aligns with mobile OS power management: iOS and Android optimize BLE scanning in Central mode, and Peripheral mode on mobile devices is subject to background execution restrictions that would make it unreliable.

## 4. Document Index

| Document | Description |
|-------------------------------------|-----------------------------------------------|
| [AuthorizeOfflinePass](authorize-offline-pass.md) | MQTT-based offline pass validation (Partial B scenario) — **stable** |
| [BLE Transport](ble-transport.md) | Hardware requirements, GATT service definition, characteristics, MTU negotiation, fragmentation — **EXPERIMENTAL** ([B-1](../../../KNOWN-ISSUES.md#b-1--two-incompatible-fragmentation-protocols-are-simultaneously-normative)) |
| [BLE Handshake](ble-handshake.md) | HELLO / CHALLENGE / AUTH authentication sequence, ECDH P-256 + StationIdentity certificate, session key derivation (HKDF-SHA256), AEAD channel — **EXPERIMENTAL** |
| [BLE Session](ble-session.md) | Service start, real-time monitoring, stop, receipt retrieval, connection drop handling — **EXPERIMENTAL** ([B-3](../../../KNOWN-ISSUES.md#b-3--the-three-ble-response-schemas-disagree-with-each-other-and-with-chapter-07)) |
| [OfflinePass](offline-pass.md) | Server-signed offline credential structure, 10-check validation, epoch revocation, lifecycle — **stable**, except that check 5 (station scoping) is unrepresentable over BLE ([B-2](../../../KNOWN-ISSUES.md#b-2--a-station-scoped-offlinepass-is-unrepresentable-in-the-authoritative-schema)) |
| [Reconciliation](reconciliation.md) | Offline transaction sync, deduplication, receipt verification, the re-validation gate, fraud detection, wallet debit — **stable** |

## 5. Compliance Requirements

1. A station that declares the Offline / BLE profile in its BootNotification (`capabilities.bleSupported: true`) MUST implement all documents listed above.

   > **In 0.8 this claim cannot be made conformantly.** Three of those documents are EXPERIMENTAL and carry blockers B-1, B-2 and B-3, so "implements all documents listed above" has no satisfiable meaning for the BLE half. The rule is stated unchanged because it is the rule the profile will carry once BLE is repaired; it is the *BLE documents* that are provisional in 0.8, not this requirement. A station shipping offline reconciliation over MQTT today is served by [`offline-pass.md`](offline-pass.md), [`authorize-offline-pass.md`](authorize-offline-pass.md) and [`reconciliation.md`](reconciliation.md), all stable, and does not need to declare `bleSupported` to use them.
2. The station MUST support at least the Full Offline and Partial B connectivity scenarios. Partial A support is RECOMMENDED but MAY be omitted if the station does not store server-signed authorization verification keys.
3. The station MUST support BLE 4.2 or later; BLE 5.0 is RECOMMENDED. BLE pairing (LESC) is OPTIONAL — channel security is provided at the application layer (ECDH P-256 handshake + StationIdentity certificate + ChaCha20-Poly1305 AEAD; see [06-security.md §6.4/§6.5](../../06-security.md)), not by link-layer pairing.
4. All BLE handshakes MUST complete within 10 seconds. The station MUST reject handshakes that exceed this timeout.
5. The station MUST generate ECDSA-P256-SHA256 signed receipts for every offline transaction and MUST maintain a monotonic `txCounter` across transactions, carried in the signed receipt as forensic evidence. The server does not gate on it (`reconciliation.md` §4.2).
6. The station MUST buffer offline transactions and synchronize them via TransactionEvent upon reconnection.
7. **AuthorizeOfflinePass** (Partial B) is required only at **Complete** compliance level. When the station has MQTT connectivity and receives an OfflinePass via BLE (Partial B), it MUST forward the pass to the server for validation rather than validating locally. Stations implementing only Basic offline compliance (Full Offline and Partial A) are not required to implement AuthorizeOfflinePass.
