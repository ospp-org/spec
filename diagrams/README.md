# OSPP Diagrams

> Standalone Mermaid diagrams for the OSPP specification. All diagrams render
> natively on GitHub. Source files (`.mmd`) can also be rendered with the
> [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli) or any Mermaid-compatible tool.

---

## 1. Architecture Overview

System topology showing all participants and communication channels.

**Source:** [`architecture-overview.mmd`](architecture-overview.mmd) | **Spec ref:** [Chapter 01 — Architecture](../spec/01-architecture.md)

```mermaid
graph TB
    subgraph "End Users"
        APP["📱 Mobile App<br/>(iOS / Android)"]
        WEB["🌐 Web Browser<br/>(QR Payment)"]
    end

    subgraph "Central System"
        SERVER["🖥️ Server<br/>(CSMS)"]
        BROKER["📡 MQTT Broker<br/>(MQTT 5.0)"]
        PG["💳 Payment Gateway"]
        DB[("🗄️ Database")]
    end

    subgraph "Station Site"
        CTRL["⚙️ Station Controller<br/>(ESP32 / RPi)"]
        BLE["📶 BLE Radio<br/>(4.2+ LESC)"]
        BAY1["🚿 Bay 1<br/>Service A, B, C"]
        BAY2["🚿 Bay 2<br/>Service A, B"]
        BAYН["🚿 Bay N<br/>..."]
    end

    APP -->|"HTTPS REST<br/>JWT Auth"| SERVER
    WEB -->|"HTTPS REST<br/>Session Token"| SERVER
    SERVER <-->|"MQTT 5.0<br/>Internal"| BROKER
    BROKER <-->|"MQTT 5.0<br/>mTLS / TLS 1.3<br/>QoS 1"| CTRL
    PG -->|"Webhook<br/>HMAC-SHA512"| SERVER
    SERVER -->|"Payment API<br/>HTTPS"| PG
    SERVER <--> DB
    APP -. "BLE GATT<br/>AES-CCM-128 (LESC)" .-> BLE
    BLE -. "BLE GATT<br/>Receipts" .-> APP
    BLE --- CTRL
    CTRL --- BAY1
    CTRL --- BAY2
    CTRL --- BAYН

    style SERVER fill:#e8f5e9,stroke:#2e7d32
    style BROKER fill:#fff3e0,stroke:#ef6c00
    style CTRL fill:#e1f5fe,stroke:#0277bd
    style BLE fill:#f3e5f5,stroke:#7b1fa2
    style PG fill:#fce4ec,stroke:#c62828
    style DB fill:#f5f5f5,stroke:#616161
    style APP fill:#e3f2fd,stroke:#1565c0
    style WEB fill:#e3f2fd,stroke:#1565c0
```

---

## 2. Session Lifecycle State Machine

The 6-state session FSM from initiation through completion or failure.

**Source:** [`state-machine-session.mmd`](state-machine-session.mmd) | **Spec ref:** [Chapter 05 — State Machines, Section 2](../spec/05-state-machines.md)

```mermaid
stateDiagram-v2
    [*] --> Pending : Session initiated

    Pending --> Authorized : Payment/credits verified
    Pending --> Failed : Payment declined

    Authorized --> Active : StartService accepted
    Authorized --> Failed : StartService rejected / timeout

    Active --> Stopping : StopService requested
    Active --> Failed : Hardware fault / connection lost

    Stopping --> Completed : Station confirms stop
    Stopping --> Failed : Stop timeout (10s)

    Completed --> [*]
    Failed --> [*]
```

**Key timeouts:** Pending ack 10s | StartService 10s | Max duration configurable (default 600s) | StopService confirm 10s | Connection lost grace 300s

---

## 3. Bay State Machine

The 7-state bay FSM governing each physical service bay on a station.

**Source:** [`state-machine-station.mmd`](state-machine-station.mmd) | **Spec ref:** [Chapter 05 — State Machines, Section 1](../spec/05-state-machines.md)

```mermaid
stateDiagram-v2
    [*] --> Unknown : Power on / reboot

    Unknown --> Available : StatusNotification (healthy)
    Unknown --> Faulted : StatusNotification (fault)
    Unknown --> Unavailable : StatusNotification (maintenance)

    Available --> Reserved : ReserveBay accepted
    Available --> Occupied : StartService accepted
    Available --> Faulted : Hardware error
    Available --> Unavailable : SetMaintenanceMode ON

    Reserved --> Occupied : StartService (reservation holder)
    Reserved --> Available : Reservation expires / cancelled
    Reserved --> Faulted : Hardware error

    Occupied --> Finishing : StopService / duration elapsed
    Occupied --> Faulted : Hardware error

    Finishing --> Available : Cleanup complete
    Finishing --> Faulted : Error during cleanup

    Faulted --> Available : Fault cleared
    Faulted --> Unavailable : SetMaintenanceMode ON

    Unavailable --> Available : SetMaintenanceMode OFF

    Available --> Unknown : Connection lost
    Reserved --> Unknown : Connection lost
    Occupied --> Unknown : Connection lost
    Finishing --> Unknown : Connection lost
    Faulted --> Unknown : Connection lost
    Unavailable --> Unknown : Connection lost
```

---

## 4. Online Payment Session Sequence

The most common flow: mobile app user starts a session at a station.

**Source:** [`sequence-online-payment.mmd`](sequence-online-payment.mmd) | **Spec ref:** [Chapter 04 — Flows, Section 3](../spec/04-flows.md)

```mermaid
sequenceDiagram
    autonumber

    actor User as 📱 Mobile App
    participant Server as 🖥️ Server
    participant Broker as 📡 MQTT Broker
    participant Station as ⚙️ Station

    User->>Server: POST /sessions (bayId, serviceId)
    Server->>Server: Verify credits/payment
    Server-->>User: 201 Created (sessionId)

    Server->>Broker: StartService REQUEST
    Broker->>Station: StartService [MSG-005]
    Station-->>Broker: StartService RESPONSE (Accepted)
    Broker-->>Server: StartService RESPONSE
    Server-->>User: Push: "Session started"

    Station->>Broker: StatusNotification (Occupied)
    Broker->>Server: StatusNotification [MSG-009]

    rect rgb(240, 248, 255)
        Note over Station,Server: Periodic MeterValues (every MeterValuesInterval (default 15s))
        Station->>Broker: MeterValues EVENT [MSG-010]
        Broker->>Server: MeterValues
    end

    User->>Server: POST /sessions/{id}/stop
    Server->>Broker: StopService REQUEST
    Broker->>Station: StopService [MSG-006]
    Station-->>Broker: StopService RESPONSE (Accepted)
    Broker-->>Server: StopService RESPONSE

    Station->>Broker: StatusNotification (Finishing → Available)
    Broker->>Server: StatusNotification [MSG-009]

    Server-->>User: Push: "Session complete" + receipt
```

---

## 5. Full Offline BLE Session Sequence

Complete offline session via BLE when both phone and station lack internet.

**Source:** [`sequence-offline-ble.mmd`](sequence-offline-ble.mmd) | **Spec ref:** [Chapter 04 — Flows, Section 5a](../spec/04-flows.md)

```mermaid
sequenceDiagram
    autonumber

    actor User as 📱 Mobile App
    participant BLE as 📶 BLE Radio
    participant Station as ⚙️ Station

    rect rgb(243, 229, 245)
        Note over User,Station: BLE Discovery & Connection
        User->>BLE: GATT Connect
        User->>BLE: Read FFF1 (Station Info)
        User->>BLE: Read FFF2 (Available Services)
    end

    rect rgb(232, 245, 233)
        Note over User,Station: ECDH Handshake
        User->>BLE: Hello {deviceId, appNonce}
        BLE-->>User: Challenge {stationNonce, connectivity: "Offline"}
    end

    rect rgb(255, 243, 224)
        Note over User,Station: OfflinePass Authorization
        User->>BLE: OfflineAuthRequest {offlinePass, counter, sessionProof}
        Station->>Station: Validate OfflinePass (10 checks)
        BLE-->>User: AuthResponse {result: "accepted"}
    end

    rect rgb(225, 245, 254)
        Note over User,Station: Service Delivery
        User->>BLE: StartServiceRequest {bayId, serviceId}
        BLE-->>User: StartServiceResponse (Accepted)
        loop Every 5 seconds
            BLE-->>User: FFF5: ServiceStatus {meterValues}
        end
        User->>BLE: StopServiceRequest
        BLE-->>User: StopServiceResponse (meterValues)
    end

    rect rgb(252, 228, 236)
        Note over User,Station: Receipt & Disconnect
        BLE-->>User: FFF5: ReceiptReady
        User->>BLE: Read FFF6 (Receipt, ECDSA signed)
        User->>BLE: Disconnect
    end

    Note over Station: Reconciles via TransactionEvent when MQTT reconnects
```

---

## 6. Error Recovery Sequence

Station reconnection and message replay after an MQTT disconnection.

**Source:** [`sequence-error-recovery.mmd`](sequence-error-recovery.mmd) | **Spec ref:** [Chapter 04 — Flows, Section 9](../spec/04-flows.md)

```mermaid
sequenceDiagram
    autonumber

    participant Station as ⚙️ Station
    participant Broker as 📡 MQTT Broker
    participant Server as 🖥️ Server

    rect rgb(255, 235, 238)
        Note over Station,Server: Connection Lost
        Station--xBroker: TCP connection drops
        Broker->>Server: LWT EVENT (ConnectionLost)
        Server->>Server: Mark bays Unknown, alert operators
    end

    rect rgb(255, 243, 224)
        Note over Station: Station buffers messages offline
        Station->>Station: Buffer MeterValues, StatusNotifications
        Station->>Station: Complete sessions, buffer TransactionEvents
    end

    rect rgb(232, 245, 233)
        Note over Station,Server: Reconnection
        Station->>Broker: MQTT CONNECT (mTLS)
        Station->>Broker: BootNotification (bootReason: ErrorRecovery)
        Broker->>Server: BootNotification [MSG-001]
        Server-->>Broker: BootNotification RESPONSE (Accepted)
        Broker-->>Station: Accepted
    end

    rect rgb(225, 245, 254)
        Note over Station,Server: Status Reconciliation
        Station->>Broker: StatusNotification (Bay 1: Available)
        Station->>Broker: StatusNotification (Bay 2: Available)
        Station->>Broker: StatusNotification (Bay 3: Faulted)
        Broker->>Server: StatusNotifications [MSG-009]
    end

    rect rgb(243, 229, 245)
        Note over Station,Server: Buffered Message Replay (FIFO)
        Station->>Broker: Buffered MeterValues
        Broker->>Server: MeterValues [MSG-010]
        Station->>Broker: TransactionEvent (offlineTxId, receipt, txCounter)
        Broker->>Server: TransactionEvent [MSG-007]
        Server->>Server: Validate receipt + txCounter
        Server-->>Broker: TransactionEvent RESPONSE (Accepted)
        Broker-->>Station: Accepted
    end

    Note over Station,Server: Normal operation resumes
```

---

## Rendering

### On GitHub

All diagrams above render automatically in this README. Navigate to any
diagram section to see the rendered output.

### Locally with Mermaid CLI

```bash
npm install -g @mermaid-js/mermaid-cli

# Render a single diagram to SVG
mmdc -i diagrams/architecture-overview.mmd -o diagrams/output/architecture-overview.svg

# Render all diagrams
for f in diagrams/*.mmd; do
  mmdc -i "$f" -o "${f%.mmd}.svg"
done
```

### In VS Code

Install the [Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)
extension to render `.mmd` files and Mermaid blocks in Markdown previews.
