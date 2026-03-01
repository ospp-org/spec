# Offline / BLE Profile

> **Status:** Draft

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
| [AuthorizeOfflinePass](authorize-offline-pass.md) | MQTT-based offline pass validation (Partial B scenario) |
| [BLE Transport](ble-transport.md) | Hardware requirements, GATT service definition, characteristics, MTU negotiation, fragmentation |
| [BLE Handshake](ble-handshake.md) | HELLO / CHALLENGE / AUTH authentication sequence, session key derivation (HKDF-SHA256) |
| [BLE Session](ble-session.md) | Service start, real-time monitoring, stop, receipt retrieval, connection drop handling |
| [OfflinePass](offline-pass.md) | Server-signed offline credential structure, 10-check validation, epoch revocation, lifecycle |
| [Reconciliation](reconciliation.md) | Offline transaction sync, deduplication, txCounter gap detection, fraud detection, wallet debit |

## 5. Compliance Requirements

1. A station that declares the Offline / BLE profile in its BootNotification (`capabilities.bleSupported: true`) MUST implement all documents listed above.
2. The station MUST support at least the Full Offline and Partial B connectivity scenarios. Partial A support is RECOMMENDED but MAY be omitted if the station does not store server-signed authorization verification keys.
3. The station MUST support BLE 4.2 or later with LE Secure Connections (LESC). BLE 5.0 is RECOMMENDED.
4. All BLE handshakes MUST complete within 10 seconds. The station MUST reject handshakes that exceed this timeout.
5. The station MUST generate ECDSA-P256-SHA256 signed receipts for every offline transaction and MUST maintain a monotonic `txCounter` across transactions for gap detection during reconciliation.
6. The station MUST buffer offline transactions and synchronize them via TransactionEvent upon reconnection.
7. **AuthorizeOfflinePass** (Partial B) is required only at **Complete** compliance level. When the station has MQTT connectivity and receives an OfflinePass via BLE (Partial B), it MUST forward the pass to the server for validation rather than validating locally. Stations implementing only Basic offline compliance (Full Offline and Partial A) are not required to implement AuthorizeOfflinePass.
