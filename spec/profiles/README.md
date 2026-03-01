# OSPP Profiles

> **Status:** Draft

## 1. What is a Profile

A **profile** is a logical grouping of related OSPP actions that a station or server may support. Profiles allow incremental adoption -- stations declare which profiles they implement at boot, and the server adjusts its behaviour accordingly. Each profile defines a set of mandatory actions (messages) and processing rules that the implementing party MUST support in their entirety. A station MUST NOT claim support for a profile unless it implements all actions within that profile.

## 2. Compliance Levels

| Level | Required Profiles | Description |
|---------|----------------------------------------------|-----------------------------------------------|
| **Development** | Core | Testing and prototyping only. Security optional. **NOT for production.** |
| **Standard** | Core + Transaction + Security | Minimum for production: sessions, metering, TLS + mTLS + HMAC. |
| **Extended** | Standard + Device Management + Offline/BLE | + remote config, firmware OTA, diagnostics, BLE, OfflinePass, offline sessions (Online + Partial A + Full Offline). |
| **Complete** | Extended + Partial B scenario | + Partial B connectivity (phone offline, station online → station relays auth to server via MQTT). |

A station MUST implement at least the **Standard** compliance level for production deployments. Development compliance is for testing and prototyping only. Higher levels are additive -- each level includes all profiles from the levels below it.

## 3. Profile Negotiation

Profile negotiation occurs during the BootNotification handshake:

1. The station includes a `capabilities` object in its BootNotification request, declaring its supported features (e.g., `bleSupported: true`, `offlineModeSupported: true`).
2. The server inspects the capabilities and determines the station's effective compliance level.
3. The server validates that the station's declared capabilities are consistent -- for example, a station claiming `offlineModeSupported: true` MUST also declare `bleSupported: true`.
4. If the server detects an inconsistency, it SHOULD respond with `Accepted` but MAY include a `configuration` payload that disables the inconsistent feature.
5. The server MUST NOT send commands from a profile that the station has not declared support for. For example, the server MUST NOT send a ChangeConfiguration command to a station that only declares Core compliance.
6. If a station receives a command from an unsupported profile, it MUST respond with error `2007 COMMAND_NOT_SUPPORTED`.

## 4. Conformance Targets

This section defines what each OSPP role **MUST** implement to claim conformance.

### 4.1 Station Conformance

A station claiming OSPP conformance **MUST** implement:

- The **Core** profile (BootNotification, Heartbeat, StatusNotification, ConnectionLost handling, DataTransfer, TriggerMessage).
- The **Transaction** profile (StartService, StopService, MeterValues, TransactionEvent, ReserveBay, CancelReservation).
- The **Security** profile (SecurityEvent, SignCertificate, CertificateInstall, TriggerCertificateRenewal).

A station **MAY** additionally implement:

- The **Device Management** profile, declared via `deviceManagementSupported: true` in BootNotification capabilities.
- The **Offline / BLE** profile, declared via `bleSupported: true` and `offlineModeSupported: true` in BootNotification capabilities.

### 4.2 Server (CSMS) Conformance

A server claiming OSPP conformance **MUST**:

- Accept and process all messages from the Core, Transaction, and Security profiles.
- Not send commands from a profile that the connected station has not declared support for.

A server **SHOULD** support:

- The Device Management profile for stations that declare `deviceManagementSupported: true`.
- The Offline / BLE profile for stations that declare `offlineModeSupported: true` (including offline transaction reconciliation via TransactionEvent).

### 4.3 Client Application Conformance

Client applications (mobile apps, web browsers) interact with the server via HTTPS REST and with stations via BLE GATT. Client conformance is not formally defined by this specification, but client implementations **SHOULD** follow the flows documented in [Chapter 04 — Protocol Flows](../04-flows.md).

## 5. Profile Index

| Profile | Path | Mandatory | Actions |
|----------------------|-----------------------------------------------|-----------|---------|
| Core | [core/](core/README.md) | Yes | 6 |
| Transaction | [transaction/](transaction/README.md) | Yes | 6 |
| Security | [security/](security/README.md) | Yes | 4 |
| Device Management | [device-management/](device-management/README.md) | No | 9 |
| Offline / BLE | [offline/](offline/README.md) | No | 14 |
