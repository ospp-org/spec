# BLE Transport

> **Status: EXPERIMENTAL** | **OSPP Version:** 0.44.0
>
> Published for review, **not** for implementation. May change incompatibly without a MAJOR
> bump. See [Release status](../../../README.md#ble-is-experimental).

## 1. Hardware Requirements

Stations implementing the Offline / BLE profile **MUST** include a Bluetooth Low Energy radio that meets the following requirements:

- **Minimum:** Bluetooth 4.2 with LE Secure Connections (LESC) support.
- **Recommended:** Bluetooth 5.0 or later for extended range (up to 200 m line-of-sight), 2 Mbps PHY throughput, and improved coexistence with Wi-Fi.
- **Antenna:** The BLE antenna **MUST** be rated for outdoor operation and **SHOULD** provide at least 0 dBm TX power. Stations deployed in enclosed bays **SHOULD** use an external antenna positioned to maximize coverage within the bay area.
- **Power class:** Class 1.5 (10 dBm) is **RECOMMENDED** for outdoor and industrial environments to ensure reliable connectivity through interference and metal enclosures.
- **Environmental:** The BLE module **MUST** operate reliably in temperatures from -20 C to +60 C and humidity up to 95% non-condensing, consistent with outdoor self-service deployment.

## 2. GATT Service Definition

This section is the one definition of the OSPP GATT service and its characteristics; every other document names them by their aliases.

### 2.1 Service UUID

The OSPP BLE service **MUST** be registered as a primary GATT service with the following 128-bit UUID:

```
6645FFF0-5AEB-4709-ACD5-02E03C3000F6
```

This UUID **MUST** appear in the station's advertising data (§9).

**Why a random 128-bit UUID.** A 16-bit or 32-bit UUID is one the Bluetooth SIG assigns: *"16-bit and 32-bit UUIDs shall only be used if they are assigned by the Bluetooth SIG"* ([Core Specification Supplement v12](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/CSS_v12/out/en/supplement-to-the-bluetooth-core-specification/data-types-specification.html), Part A, §1.1.1). OSPP holds no assignment. Earlier revisions used the SIG's base UUID with the aliases `0xFFF0`–`0xFFF6`, which the SIG's [Assigned Numbers](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Assigned_Numbers/out/en/Assigned_Numbers.pdf) (§3.10, *SDO Services*) list for other standards — `0xFFF0` the PKOC credential service, `0xFFF6` the Matter service among them — so an app filtering on them would also find devices that are not OSPP stations. The OSPP UUIDs are now derived from one random version-4 UUID ([RFC 9562 §5.4](https://www.rfc-editor.org/rfc/rfc9562#section-5.4)), as a vendor-assigned 128-bit UUID is (Bluetooth Core Specification v6.2, Vol 1, Part A, §6.4.1).

### 2.2 Characteristic Table

Each characteristic's UUID is the OSPP base UUID `6645XXXX-5AEB-4709-ACD5-02E03C3000F6` with its 16-bit alias in place of `XXXX`; the service itself is the alias `FFF0`.

| Alias | UUID | Name | Properties | Description |
|-------|------|------|------------|-------------|
| FFF1 | `6645FFF1-5AEB-4709-ACD5-02E03C3000F6` | Station Info | Read | Station identity, firmware, and connectivity status — unauthenticated (§3). |
| FFF2 | `6645FFF2-5AEB-4709-ACD5-02E03C3000F6` | Available Services | Write, Notify | The service catalog per bay with its prices, by request and notification (§4). |
| FFF3 | `6645FFF3-5AEB-4709-ACD5-02E03C3000F6` | TX Request | Write | App-to-station command channel (Hello, OfflineAuthRequest, ServerSignedAuth, Start/StopServiceRequest). |
| FFF4 | `6645FFF4-5AEB-4709-ACD5-02E03C3000F6` | TX Response | Notify | Station-to-app response channel (Challenge, AuthResponse, Start/StopServiceResponse). |
| FFF5 | `6645FFF5-5AEB-4709-ACD5-02E03C3000F6` | Service Status | Notify | Real-time service progress updates during active sessions. |
| FFF6 | `6645FFF6-5AEB-4709-ACD5-02E03C3000F6` | Receipt | Write, Notify | A session's signed receipt, by request and notification (§8). |

**No characteristic is read beyond the attribute limit.** An attribute value is at most 512 octets (Bluetooth Core Specification v6.2, Vol 3, Part F, §3.2.9), and a phone's GATT client may cut a longer read at that limit and still report success — the Android stack collects at most `GATT_MAX_ATTR_LEN`, 512 octets, of a long read ([AOSP `gatt_cl.cc`](https://android.googlesource.com/platform/packages/modules/Bluetooth/+/c77db469de80f86660bc053bec4dee0c5d4b947c/system/stack/gatt/gatt_cl.cc)). FFF1 is the only characteristic read, and its value stays well under the limit; the values that can exceed it, the catalog (FFF2) and a receipt (FFF6), are written for and notified as messages fragmented by §11.

## 3. Station Info (FFF1)

The Station Info characteristic provides read-only station metadata. The app **MAY** read it after establishing a BLE connection, before the handshake, to show the customer which station it reached.

**Payload (JSON):**

| Field | Type | Required | Description |
|----------------------|---------|----------|-----------------------------------------------|
| `stationId` | string | Yes | Unique station identifier (`stn_` prefix). |
| `stationModel` | string | Yes | Model identifier of the station hardware. |
| `firmwareVersion` | string | Yes | Semantic version of the station firmware. |
| `connectivity` | string | Yes | Current network status: `"Online"` or `"Offline"`. |

**Nothing on FFF1 is authenticated.** It is read before the handshake and outside its transcript ([`06-security.md` §6.5](../../06-security.md#65-ble-session-key-derivation--hkdf-sha256) Pin 4), so a fake or relaying station can present anything here. The app **MAY** display it and **MUST NOT** rely on it for any decision: the station's authenticated identity is the certificate in its Challenge ([`06-security.md` §6.5.2](../../06-security.md#652-station-authentication--the-stations-certificate)), its connectivity is the Challenge's `stationConnectivity`, and the BLE version is the one the handshake negotiates ([`ble-handshake.md` §3](ble-handshake.md#3-step-2-challenge)).

**Example:**

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "1.2.3",
  "connectivity": "Online"
}
```

## 4. Available Services (FFF2)

The Available Services characteristic provides the station's service catalog per bay, with prices. It carries no availability.

**Request and notification (Normative).** FFF2 is not read. The app subscribes to FFF2 notifications and writes the single octet `0x01` to FFF2 — a trigger, not a message, which carries no fragment header — and the station answers by notifying the current value on FFF2, as one message fragmented by §11. FFF2 is served before the handshake, and only then: the station ignores a trigger written after the Hello on the same connection. The value is plaintext JSON, outside the handshake's transcript, and a relay between the app and the station can alter it; the Challenge binds it all the same. The Challenge carries `catalogDigest`, the SHA-256 of the OSPP Canonical Form ([`06-security.md` §4.8](../../06-security.md#48-ospp-canonical-form)) of the catalog the station serves now, under the station's signature ([`ble-handshake.md` §3](ble-handshake.md#3-step-2-challenge)), and an app sends no credential when the catalog it chose from has another digest. So a catalog that was altered — a price, a name, a bay's number, the `bayId` or `serviceId` a name stands for — or replaced, or changed by the operator since the app read it, is found before any credential leaves the phone. What the customer is charged is not read from it: the validator prices the authorization from the catalog it holds ([`offline-pass.md` §4](offline-pass.md#4-validation-checks-10)).

**How the station derives it (Normative).** From the service catalog it holds (UpdateServiceCatalog [MSG-021]): every bay it declared at provisioning, each with the services the catalog binds to that bay's programs, with their prices. The station never invents a service and never lists one the catalog does not bind to the bay. Before the first catalog push it holds no catalog: the value then carries no `catalogVersion`, and every bay an empty `services` list — a valid value that offers nothing.

**Availability is the Challenge's.** Whether a bay or a service can start now is the Challenge's `availableServices`, which the station signs ([`ble-handshake.md` §3](ble-handshake.md#3-step-2-challenge)); FFF2 says what the station sells and at what price, and nothing about what it can start now.

**Programs are the station's.** The app names a bay and a service; the station resolves the program to run from the bindings of the catalog it holds ([`ble-session.md` §1](ble-session.md#1-starting-a-service)), and no BLE message carries a `programNumber`.

**Payload (JSON):**

| Field | Type | Required | Description |
|------------------|---------|----------|-----------------------------------------------|
| `catalogVersion` | string | No | Version identifier of the catalog the value is derived from. Absent while the station holds no catalog. |
| `bays` | array | Yes | Every bay the station declared (minimum 1). |

Each bay object:

| Field | Type | Required | Description |
|------------|---------|----------|-----------------------------------------------|
| `bayId` | string | Yes | Bay identifier. |
| `bayNumber`| integer | Yes | Human-readable bay number (minimum 1). |
| `services` | array | Yes | The services the catalog binds to this bay's programs — none while the station holds no catalog. |

Each service object:

| Field | Type | Required | Description |
|------------------------|---------|----------|-----------------------------------------------|
| `serviceId` | string | Yes | Service identifier. |
| `serviceName` | string | Yes | Display name of the service. |
| `pricingType` | string | Yes | `PerMinute` or `Fixed`. |
| `priceCreditsPerMinute` | integer | Cond. | Credits per minute. Required when `pricingType` is `PerMinute`; **MUST NOT** be present when it is `Fixed`. |
| `priceCreditsFixed` | integer | Cond. | Fixed price in credits. Required when `pricingType` is `Fixed`; **MUST NOT** be present when it is `PerMinute`. |
| `priceLocalPerMinute` | integer | No | Local-currency minor units per minute, informational. **MUST NOT** be present when `pricingType` is `Fixed`. |
| `priceLocalFixed` | integer | No | Fixed price in local-currency minor units, informational. **MUST NOT** be present when `pricingType` is `PerMinute`. |

**Example:**

```json
{
  "catalogVersion": "2026-02-13-01",
  "bays": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "bayNumber": 1,
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 10,
          "priceLocalPerMinute": 50
        },
        {
          "serviceId": "svc_standard",
          "serviceName": "Standard Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 8,
          "priceLocalPerMinute": 40
        }
      ]
    }
  ]
}
```

## 5. TX Request (FFF3)

The TX Request characteristic is the app-to-station command channel. The app writes structured JSON messages to this characteristic to drive the handshake and session lifecycle.

**Supported message types (written by app):**

| Message Type | Purpose | Schema |
|--------------------------|-----------------------------------------------|------------------------------|
| `Hello` | Initiate authentication handshake | `hello.schema.json` |
| `OfflineAuthRequest` | Present OfflinePass for validation | `offline-auth-request.schema.json` |
| `ServerSignedAuth` | Deliver server-signed authorization | `server-signed-auth.schema.json` |
| `StartServiceRequest` | Request service activation | `start-service-request.schema.json` |
| `StopServiceRequest` | Request service termination | `stop-service-request.schema.json` |

Each message **MUST** include a `type` field as the first-level discriminator. The station **MUST** reject any write that does not contain a recognized `type` value.

## 6. TX Response (FFF4)

The TX Response characteristic is the station-to-app response channel. The app **MUST** subscribe to notifications on this characteristic before writing to FFF3.

**Supported message types (notified by station):**

| Message Type | Purpose | Schema |
|---------------------------|-----------------------------------------------|-------------------------------|
| `Challenge` | Respond to Hello with the station's key, certificate, signature and availability | `challenge.schema.json` |
| `AuthResponse` | Accept or reject authentication — or refuse a Hello before any key exists | `auth-response.schema.json` |
| `StartServiceResponse` | Accept or reject service start | `start-service-response.schema.json` |
| `StopServiceResponse` | Confirm or reject service stop | `stop-service-response.schema.json` |

The station **MUST** send exactly one response for each request written to FFF3, unless the connection closes first — on a lost fragment (§11), on a frame that fails its AEAD check ([`06-security.md` §6.5.3](../../06-security.md#653-ble-aead-channel)), or at the end of the handshake budget: a Hello is answered by a Challenge, or by an AuthResponse that refuses it ([`ble-handshake.md` §5](ble-handshake.md#5-step-4-authresponse)). A refusal carries the one BLE error shape — `errorCode`, `errorText` and, where the code calls for it, `details` ([Chapter 07 §2.3](../../07-errors.md#23-ble-error-response)).

## 7. Service Status (FFF5)

The Service Status characteristic provides real-time progress updates during an active session. The app **MUST** subscribe to notifications on this characteristic before it writes the StartServiceRequest: the station notifies from the start, and every frame it sends takes the next counter value whichever characteristic carries it ([`06-security.md` §6.5.3](../../06-security.md#653-ble-aead-channel)).

**Payload (JSON):**

| Field | Type | Required | Description |
|-------------------|---------|---------|--------------------------------------------|
| `bayId` | string | Yes | Bay identifier. |
| `status` | string | Yes | `Starting`, `Running`, `Complete`, `ReceiptReady`, or `Error`. |
| `sessionId` | string | Yes | Session identifier. |
| `elapsedSeconds` | integer | Yes | Seconds elapsed since service start. |
| `remainingSeconds`| integer | Yes | Estimated seconds remaining. |
| `meterValues` | object | No | Real-time meter readings (liquidMl, consumableMl, energyWh). |

The station **MUST** send notifications at a regular interval (5 seconds). The station **MUST** send a final notification with `status: "ReceiptReady"` when the service completes.

**Example (Running):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a1b2c3d4e5f6",
  "elapsedSeconds": 120,
  "remainingSeconds": 180,
  "meterValues": {
    "liquidMl": 22100,
    "consumableMl": 250
  }
}
```

**Example (Receipt Ready):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_a1b2c3d4e5f6",
  "elapsedSeconds": 298,
  "remainingSeconds": 0
}
```

## 8. Receipt (FFF6)

The Receipt characteristic carries a session's signed receipt to the app, by request and notification, inside the channel.

**Request and notification (Normative).** FFF6 is not read. The app subscribes to FFF6 notifications and writes a `ReceiptRequest` naming the session's transaction — the `offlineTxId` of the StartServiceResponse that started it — as a secure frame ([`06-security.md` §6.5.3](../../06-security.md#653-ble-aead-channel)), fragmented by §11. The station answers with one `ReceiptResponse`, notified on FFF6 as a secure frame fragmented by §11: `Accepted` with the session's receipt, or `Rejected` with `3006 SESSION_NOT_FOUND` when it serves no receipt under that `offlineTxId`.

**Who can ask (Normative).** Naming the `offlineTxId` is what entitles an app to the receipt: the station sends it only in the StartServiceResponse, inside the channel of the session's own connection, and draws it from a cryptographically secure random source — at least 128 random bits — so that no other party can name it ([`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid) rule 1). No number of requests makes a guess at such a value succeed, so no request is bounded for that reason: a connection that presents a credential may ask for the receipts of its own sessions, and the bound below spares the station's work for a peer that has authenticated nothing (T13). A `ReceiptRequest` is not a session command, so an app that reconnects after a disconnect asks for the receipt on the new connection, on a station of any number of bays: it writes the request after the Challenge has passed its verification, in place of a credential and within the handshake budget ([`ble-handshake.md` §1](ble-handshake.md#1-handshake-overview)), and the station answers that one request and closes the connection: a connection that presents no credential reads at most one receipt, so a party guessing at `offlineTxId` values pays a whole connection for each guess, within the limit on connections a station accepts ([`06-security.md` §1, T13](../../06-security.md#t13---denial-of-service)). That close ends the handshake as a receipt read, not as a failure, and logs no `2013`. A connection whose credential the station refused is held to the same bound: the station answers at most one `ReceiptRequest` on it, and then closes it. An app that never received the StartServiceResponse holds no `offlineTxId` and cannot ask for the receipt; the session settles on the station's own record all the same — its TransactionEvent, or the SessionEnded of a Partial-B session.

| Message | Direction | Fields |
|---|---|---|
| `ReceiptRequest` | App → Station (FFF6 Write) | `type` (`"ReceiptRequest"`), `offlineTxId` |
| `ReceiptResponse` | Station → App (FFF6 Notify) | `type` (`"ReceiptResponse"`), `result` (`Accepted` or `Rejected`); `receipt` — the receipt below — when `Accepted`; `errorCode`, `errorText` and optional `details` when `Rejected` |

**The read window (Normative).** A station **MUST** serve a receipt on FFF6 for at least the OSPP Session Retention Horizon — 24 hours — after it signs it ([`02-transport.md` §5.3](../../02-transport.md#53-ospp-session-retention-horizon)). That is the one read window: it does not end when the next session begins on the bay, nor when the server answers the station's own copy, nor when the app disconnects. How long the station keeps the transaction itself, for the server, is a separate rule: until the server has answered its TransactionEvent `Accepted` or `Duplicate` ([`transaction-event.md` §5.1](../transaction/transaction-event.md#51-response-status-values)); the server recognises the transaction's `offlineTxId` at least until then ([`reconciliation.md` §3](reconciliation.md#3-deduplication-offlinetxid) rule 4).

**The receipt (`ReceiptResponse.receipt`):**

| Field | Type | Required | Description |
|------------------|---------|----------|-----------------------------------------------|
| `offlineTxId` | string | Yes | Offline transaction identifier. |
| `offlinePassId` | string | Pass-form | OfflinePass identifier used to authorize this service (`opass_<uuid>`). Matches the value signed into `receipt.data`. (v0.4.2) |
| `passCounter` | integer | Pass-form | The pass counter the app presented in OfflineAuthRequest. Matches the value signed into `receipt.data`. |
| `authId` | string | Auth-form | The ServerSignedAuth the session ran on (Partial A). Matches the value signed into `receipt.data`. |
| `sessionId` | string | Auth-form | The server-issued session that authorization settles. Matches the value signed into `receipt.data`. |
| `userId` | string | Yes | User subject identifier (`sub_<id>`). Matches the value signed into `receipt.data`. (v0.4.2) |
| `deviceId` | string | Yes | The device the session was authorized for — the pass's `deviceId`, or the authorization's. Matches the value signed into `receipt.data`. (v0.4.2) |
| `bayId` | string | Yes | Bay where service was delivered. |
| `serviceId` | string | Yes | Service that was delivered. |
| `startedAt` | string | Yes | ISO 8601 timestamp of service start. |
| `endedAt` | string | Yes | ISO 8601 timestamp of service end. |
| `durationSeconds` | integer | Yes | Actual duration in seconds. |
| `creditsCharged` | integer | Yes | Credits the station computed; advisory — the server settles its own recomputation ([`reconciliation.md` §8](reconciliation.md#8-wallet-reconciliation)). |
| `meterValues` | object | No | Final meter readings. |
| `receipt` | object | Yes | Signed receipt object (see below). |
| `txCounter` | integer | Yes | Monotonic transaction counter. |

The `receipt` object contains:

| Field | Type | Description |
|----------------------|---------|-----------------------------------------------|
| `data` | string | Base64-encoded canonical receipt payload — the fields above that it signs, and four signed-only fields, `stationId`, `endReason`, `bookedDurationSeconds` and `clockState` ([`06-security.md` §6.2](../../06-security.md#62-transaction-receipt-signing--ecdsa-p-256)). `endReason` is `ServerStopped` for a session the server stopped with a StopService, and `Local` for one the customer stopped from the app. |
| `signature` | string | ECDSA-P256-SHA256 signature over `data`. |
| `signatureAlgorithm` | string | Always `ECDSA-P256-SHA256`. |

**Example (the receipt a `ReceiptResponse` carries):**

```json
{
  "offlineTxId": "otx_d4e5f6a7b8c983e4dd389d512a5bc1f7",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-02-13T10:00:00.000Z",
  "endedAt": "2026-02-13T10:04:58.000Z",
  "durationSeconds": 298,
  "creditsCharged": 50,
  "meterValues": {
    "liquidMl": 45200,
    "consumableMl": 500,
    "energyWh": 150
  },
  "receipt": {
    "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjMwMCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjo1MCwiZGV2aWNlSWQiOiJkZXZfZDRlNWY2YTciLCJkdXJhdGlvblNlY29uZHMiOjI5OCwiZW5kUmVhc29uIjoiTG9jYWwiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxMDowNDo1OC4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjo1MDAsImVuZXJneVdoIjoxNTAsImxpcXVpZE1sIjo0NTIwMH0sIm9mZmxpbmVQYXNzSWQiOiJvcGFzc185MmRmMGQ1YzAxMWVhZjc0Iiwib2ZmbGluZVR4SWQiOiJvdHhfZDRlNWY2YTdiOGM5ODNlNGRkMzg5ZDUxMmE1YmMxZjciLCJwYXNzQ291bnRlciI6MzYsInNlcnZpY2VJZCI6InN2Y19lY28iLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDEwOjAwOjAwLjAwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjUsInVzZXJJZCI6InN1Yl8wNjA3MmE4MjllMzkxOGE4In0=",
    "signature": "MEUCIQCyNRdVzpnNT4UApXCDhwwrH+NnmQwKt+yhhZKuhcbC5wIgLxMFoBc7cPmx+SdZce+262rOP5yzpZFwttM9/S2YfK8=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 5,
  "offlinePassId": "opass_92df0d5c011eaf74",
  "userId": "sub_06072a829e3918a8",
  "deviceId": "dev_d4e5f6a7",
  "passCounter": 36
}
```

## 9. Advertising Data

The station advertises with legacy advertising PDUs, whose advertising data and scan response data hold at most 31 octets each (Bluetooth Core Specification v6.2, Vol 4, Part E, §7.8.7 and §7.8.8). This section is the one definition of what they carry.

**Advertising data (Normative):**

| AD type | Field | Size | Value |
|---------|-------|------|-------|
| `0x01` | Flags | 3 octets | LE General Discoverable Mode, BR/EDR Not Supported (`0x06`). |
| `0x07` | Complete List of 128-bit Service UUIDs | 18 octets | The OSPP service UUID (§2.1). |
| `0xFF` | Manufacturer Specific Data | at most 10 octets | **OPTIONAL.** The station vendor's own company identifier and data. OSPP defines no content for it, the app **MUST NOT** rely on it, and it **MUST NOT** carry anything that identifies a user or a device of a user. |

**Scan response data (Normative):**

| AD type | Field | Size | Value |
|---------|-------|------|-------|
| `0x09` | Complete Local Name | 13 octets | `OSPP-{station_id_last6}` (e.g., `OSPP-b2c3d4`). |
| `0x0A` | TX Power Level | 3 octets | Transmit power level in dBm, for RSSI-based distance estimation. |

**Why the split.** Flags and the service UUID with its length octets take 21 of the advertisement's 31 octets, and the name and the TX power level do not fit beside them; the Flags data type is not permitted in scan response data (Core Specification Supplement v12, Part A, §1, Table 1.1), so the name and the TX power level are the ones moved — as the [Accessory Design Guidelines for Apple Devices](https://developer.apple.com/accessories/Accessory-Design-Guidelines.pdf) (§58.4) allow an accessory to do, keeping the primary service in the advertising PDU.

**What the advertisement does not carry.** No bay count and no availability: availability is the authenticated Challenge's ([`ble-handshake.md` §3](ble-handshake.md#3-step-2-challenge)), and a count of bays could name no bay. An app filters its scan on the OSPP service UUID.

The station **MUST** advertise continuously while the BLE profile is enabled, whether or not any of its bays can start a service: an app learns availability from the Challenge.

## 10. MTU Negotiation

After establishing a BLE connection, the app **SHOULD** request an MTU of **247 bytes** (the maximum ATT_MTU for BLE 4.2+). The station **MUST** accept any MTU of 185 bytes or greater. A written or notified value is at most ATT_MTU − 3 octets (the ATT opcode and handle; Bluetooth Core Specification v6.2, Vol 3, Part F, §3.4.5.1 and §3.4.7.1), and a fragment's data is at most ATT_MTU − 6 octets: the value less the 3-octet fragment header of §11.

| Scenario | Negotiated MTU | Value per write or notification | Data per fragment | Notes |
|------------|----------------|-------------------|-------------------|-----------------------------------------------|
| Preferred | 247 bytes | 244 bytes | 241 bytes | Most messages in one fragment; a Challenge or a receipt in several. |
| Minimum | 185 bytes | 182 bytes | 179 bytes | More fragments for the larger messages. |
| Fallback | 23 bytes | 20 bytes | 17 bytes | Default BLE MTU; every message but the shortest is fragmented. |

If the negotiated MTU is below 185 bytes, the station **SHOULD** log a warning but **MUST** still operate using the fragmentation protocol defined in section 11.

## 11. Fragmentation Protocol

This section is the one definition of how a BLE message longer than one write or notification is carried.

> **Encrypt-then-fragment (Normative).** Every message *after* the Challenge is first sealed into an AEAD secure frame `{n, ct}` ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel); [`ble-secure-frame.schema.json`](../../../schemas/ble/ble-secure-frame.schema.json)) and only then handed to this fragmentation layer. The "JSON payload" fragmented below is therefore the secure-frame JSON for post-Challenge messages, and the plaintext message JSON for the Hello, the Challenge, an AuthResponse that refuses a Hello, and the FFF2 catalog. Fragmentation and reassembly are **unchanged** by the AEAD channel — they operate on opaque bytes; reassembly rule 6 ("valid JSON") is satisfied by the `{n, ct}` frame, which is decrypted only after full reassembly.

**What it covers.** Every message written to FFF3 and FFF6, and every message notified on FFF2, FFF4, FFF5 and FFF6. FFF1 is read, and the one-octet trigger written to FFF2 (§4) is not a message.

Every message **MUST** be sent as one or more fragments, each one write or one notification on the message's characteristic, each beginning with this header:

**Fragment header (3 bytes):**

| Byte | Field | Description |
|------|----------------|-----------------------------------------------|
| 0 | `sequenceNumber` | 0-based index of this fragment (0x00--0xFE). |
| 1 | `totalFragments` | Total number of fragments in this message (1--255). |
| 2 | `flags` | Bit 0: 1 = more fragments follow; 0 = last fragment. Bits 1--7: reserved (0). |

A fragment carries at most ATT_MTU − 6 octets of the message (§10), and every fragment but the last carries exactly that many. A message longer than 255 such fragments cannot be sent; the sender **MUST NOT** begin it, and treats it as `1014 MESSAGE_TOO_LARGE`.

**Reassembly rules:**

1. The receiver **MUST** keep reassembly state per characteristic and per direction: a fragment belongs to the message in progress on the characteristic that carried it.
2. The first fragment of a message has `sequenceNumber` 0; each next one has the previous `sequenceNumber` plus 1; every fragment of a message carries the same `totalFragments`; `flags` bit 0 is 1 on every fragment whose `sequenceNumber` is below `totalFragments − 1` and 0 on the fragment whose `sequenceNumber` is `totalFragments − 1`, which is the last; and bits 1–7 are 0.
3. **Any fragment that breaks rule 2 aborts the message and the session (Normative).** A fragment out of sequence, a gap, a repeated fragment, a `totalFragments` that differs from the message's first fragment, a `flags` bit 0 that disagrees with `sequenceNumber` and `totalFragments`, a non-zero reserved bit, a `sequenceNumber` at or above `totalFragments`, or a `totalFragments` of 0: the receiver discards the buffered fragments of every characteristic and the session's keys, closes the connection, and sends no response. **Nothing retransmits.** The link layer delivers in order and retransmits its own packets, and a notification that a buffer overflow drops is lost (Bluetooth Core Specification v6.2, Vol 3, Part F, §3.3.2), so a fragment that is missing or out of sequence is one no peer will send again. The app starts again with a fresh handshake.
4. Reassembly **MUST** complete within 5 seconds of the first fragment. If the timeout expires, the receiver aborts the message and the session as rule 3 states.
5. **No interleaving.** A sender sends every fragment of a message before the first fragment of its next message in the same direction, on any characteristic. A fragment that begins a message on one characteristic while a message of the same direction is incomplete on another aborts the session as rule 3 states. This keeps the order in which messages complete the order of their frame counters ([06-security.md §6.5.3](../../06-security.md#653-ble-aead-channel), Pin 5).
6. After reassembly, the receiver **MUST** validate that the reassembled payload is valid JSON before processing.
7. A message that fits in one fragment is sent as one, with the header `sequenceNumber: 0`, `totalFragments: 1`, `flags: 0x00`.

This is the shape of the Matter Bluetooth Transport Protocol's segmentation, where a received segment that does not follow the sender's sequence, or a reassembled message of the wrong length, *"`SHALL` close the BTP session"* ([Matter Specification 1.4.1](https://csa-iot.org/wp-content/uploads/2025/05/23-27349-007_matter-1-4-1-core-specification.pdf), §4.19.4.5 and §4.19.4.6); OSPP needs no acknowledgement window because nothing is retransmitted.

## 12. Connection Lifecycle and Isolation

A station serves the handshake and the subsequent session over a single GATT connection. The following rules isolate concurrent connections so that one central cannot observe or disrupt another central's session.

**Per-connection isolation (Normative):**

- A station **MUST** scope all handshake and session state to the single GATT connection on which it was established. At most one active handshake **MUST** be in progress per connection.
- On disconnect, the station **MUST** discard every piece of state associated with that connection — derived session key, nonces, buffered fragments, and any authenticated session context. State **MUST NOT** carry over to a later connection.
- A station **MUST** reject any session command (e.g. `StartService`/`StopService`, see [ble-session.md](ble-session.md)) or any post-handshake FFF3 write that arrives on a connection other than the one whose handshake authenticated that session. A command targeting a `sessionId` **MUST NOT** be honoured on a connection that did not establish that session. A `ReceiptRequest` is not a session command: it may name, by its `offlineTxId`, the transaction of a session another connection established (§8).
- A station **MAY** bound the number of concurrent central connections it accepts; when the bound is reached it **MAY** refuse or shed new connections.

**Denial-of-service guidance (Non-normative):**

BLE peripherals support only a small number of concurrent connections, so an unauthenticated central can exhaust connection slots. Stations SHOULD:

- drop a connection that has not completed the handshake within the handshake budget ([ble-handshake.md §1](ble-handshake.md)) rather than holding the slot open indefinitely;
- continue advertising while connections are active (subject to the hardware connection limit) so a legitimate central is not locked out by a stalled or hostile peer;
- apply a shorter connection timeout to connections that have not yet authenticated.

This is operational guidance, not a wire-protocol requirement.

## 13. Related Schemas

- Station Info: [`station-info.schema.json`](../../../schemas/ble/station-info.schema.json)
- Available Services: [`available-services.schema.json`](../../../schemas/ble/available-services.schema.json)
- Service Status: [`service-status.schema.json`](../../../schemas/ble/service-status.schema.json)
- Receipt Request: [`receipt-request.schema.json`](../../../schemas/ble/receipt-request.schema.json)
- Receipt Response: [`receipt-response.schema.json`](../../../schemas/ble/receipt-response.schema.json)
- Receipt: [`receipt.schema.json`](../../../schemas/ble/receipt.schema.json)
- Secure Frame (AEAD wrapper for post-Challenge messages): [`ble-secure-frame.schema.json`](../../../schemas/ble/ble-secure-frame.schema.json)
