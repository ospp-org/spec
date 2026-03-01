# Chapter 08 — Configuration

> **Status:** Draft | **OSPP Version:** 0.1.0-draft.1

This chapter defines the configuration model for OSPP stations, including the key-value store structure, supported data types, access modes, mutability semantics, and the complete registry of standard configuration keys. Configuration is read and written via the [GetConfiguration](03-messages.md#62-getconfiguration) and [ChangeConfiguration](03-messages.md#61-changeconfiguration) messages defined in Chapter 03.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

---

## 1. Configuration Model

### 1.1 Key-Value Structure

Each station maintains a flat **key-value store** containing all configuration parameters. Keys are strings in **PascalCase** (e.g., `HeartbeatIntervalSeconds`, `BLEAdvertisingEnabled`). Values are typed according to Section 1.2.

The server reads configuration values via a **GetConfiguration** REQUEST and writes configuration values via a **ChangeConfiguration** REQUEST. Both messages are defined in [Chapter 03 -- Messages](03-messages.md), Section 6.

On the wire, all values are transmitted as **JSON strings** regardless of their logical type. The station MUST parse and validate the string representation against the expected type and range for each key. If parsing or validation fails, the station MUST reject the change with status `Rejected`.

The station MUST persist configuration to non-volatile storage (NVS). On boot, the station MUST load all configuration keys from NVS. If a key is missing or corrupt, the station MUST fall back to the documented default value and SHOULD report error `5102` (`CONFIGURATION_ERROR`) via a SecurityEvent.

### 1.2 Data Types

| Type | JSON Wire Format | Description | Example |
|------|------------------|-------------|---------|
| **string** | `"string"` | UTF-8 string, maximum 500 characters. | `"Europe/London"` |
| **integer** | `"number"` | Whole number, no fractional part. Transmitted as a decimal string. | `"30"` |
| **boolean** | `"true"` / `"false"` | Boolean flag. Case-insensitive on input; canonical form is lowercase. | `"true"` |
| **decimal** | `"number.fraction"` | Decimal number with up to 2 fractional digits. | `"1.50"` |
| **CSV** | `"val1,val2,val3"` | Comma-separated list of values. No spaces around commas. | `"debug,info,warn,error"` |

Implementations MUST reject values that do not conform to the declared type for a given key.

### 1.3 Access Modes

Each key has one of three access modes that govern server interaction:

| Mode | Symbol | GetConfiguration | ChangeConfiguration |
|------|:------:|:----------------:|:-------------------:|
| **ReadWrite** | RW | Returned | Accepted (subject to validation) |
| **ReadOnly** | R | Returned | MUST be rejected with status `Rejected` |
| **WriteOnly** | W | MUST NOT be returned | Accepted (subject to validation) |

The station MUST reject any ChangeConfiguration request targeting a ReadOnly key. The RESPONSE MUST include `status: "Rejected"`, `errorCode: 5108`, and `errorText: "CONFIGURATION_KEY_READONLY"`.

If a station receives a ChangeConfiguration request for a key it does not recognize (neither a standard key from Sections 2--6 nor a recognized `Vendor_` key), it MUST respond with `status: "NotSupported"`.

WriteOnly keys (e.g., security credentials) are accepted via ChangeConfiguration but MUST NOT be included in GetConfiguration responses to prevent credential leakage.

### 1.4 Mutability

Each key is classified by when a new value takes effect:

| Mutability | Behavior |
|------------|----------|
| **Dynamic** | The new value takes effect **immediately** after the station applies it. The ChangeConfiguration RESPONSE returns `status: "Accepted"`. |
| **Static** | The new value is persisted but takes effect only after a **station reboot**. The ChangeConfiguration RESPONSE returns `status: "RebootRequired"`. |

The server SHOULD track keys that returned `RebootRequired` and issue a [Reset](03-messages.md#63-reset) command when appropriate.

### 1.5 Profile Grouping

Configuration keys are organized into profiles that align with station capabilities:

| Profile | Keys | Required |
|---------|------|:--------:|
| **Core** | HeartbeatIntervalSeconds, ConnectionTimeout, ReconnectBackoffMax, StationName, TimeZone, ProtocolVersion, FirmwareVersion, BootRetryInterval, StatusNotificationInterval, EventThrottleSeconds, ConnectionLostGracePeriod, Locale | Yes |
| **Transaction** | MeterValuesInterval, MeterValuesSampleInterval, MaxSessionDurationSeconds, SessionTimeout, ReservationDefaultTTL, DefaultCreditsPerSession | Yes |
| **Security** | SecurityProfile, CertificateSerialNumber, AuthorizationCacheEnabled, MessageSigningMode, OfflinePassPublicKey, CertificateRenewalThresholdDays, CertificateRenewalEnabled | Yes |
| **Offline / BLE** | OfflineModeEnabled, MaxOfflineTransactions, OfflinePassMaxAge, BLEAdvertisingEnabled, MaxConcurrentBLEConnections, BLEAdvertisingInterval, BLETxPower, BLEConnectionTimeout, BLEMTUPreferred, BLEStatusInterval, RevocationEpoch, BLEMaxRetries | Conditional (required if `capabilities.bleSupported = true`) |
| **Device Management** | FirmwareUpdateEnabled, DiagnosticsUploadUrl, LogLevel, AutoRebootEnabled | Yes |
| **Vendor-Specific** | `Vendor_{VendorName}_*` | No |

A station MUST support all keys in the required profiles. A station that advertises `capabilities.bleSupported = true` in BootNotification MUST additionally support all Offline / BLE keys.

---

## 2. Core Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `HeartbeatIntervalSeconds` | integer | `30` | RW | Dynamic | 10--3600 | Heartbeat period in seconds. The station sends a Heartbeat REQUEST at this interval. Also configurable via BootNotification RESPONSE. |
| `ConnectionTimeout` | integer | `60` | RW | Dynamic | 10--300 | MQTT connection timeout in seconds. If the station cannot establish a connection within this window, it MUST initiate reconnection with backoff. |
| `ReconnectBackoffMax` | integer | `30` | RW | Dynamic | 30--3600 | Maximum reconnect backoff delay in seconds (see [Chapter 02](02-transport.md), Section 4.5). |
| `StationName` | string | `""` | RW | Static | max 100 chars | Human-readable station name for display in management dashboards. |
| `TimeZone` | string | `"UTC"` | RW | Static | IANA tz | IANA timezone identifier (e.g., `"Europe/London"`). Used for local time display and time-based policies. |
| `ProtocolVersion` | string | `"0.1.0"` | R | Static | -- | OSPP protocol version supported by the station. ReadOnly; the station firmware determines this value. |
| `FirmwareVersion` | string | -- | R | Static | -- | Current firmware version in semver format (e.g., `"1.2.3"`). ReadOnly; updated only via firmware update. |
| `BootRetryInterval` | integer | `30` | RW | Dynamic | 10--600 | Retry interval in seconds when BootNotification is rejected or pending. |
| `StatusNotificationInterval` | integer | `0` | RW | Dynamic | 0--3600 | Interval in seconds for periodic StatusNotification events. 0 disables periodic notifications (only state-change-triggered). |
| `EventThrottleSeconds` | integer | `0` | RW | Dynamic | 0--60 | Minimum interval in seconds between consecutive StatusNotification events for the same bay. 0 disables throttling. |
| `ConnectionLostGracePeriod` | integer | `300` | RW | Dynamic | 60--600 | Duration in seconds to wait before terminating orphaned sessions after MQTT connection loss. |
| `Locale` | string | `"en-US"` | RW | Dynamic | BCP 47 tag | BCP 47 language tag for station display locale (e.g., `"ro-RO"`, `"en-US"`). |

---

## 3. Transaction Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `MeterValuesInterval` | integer | `15` | RW | Dynamic | 5--300 | Interval in seconds between MeterValues event reports during an active session. |
| `MeterValuesSampleInterval` | integer | `10` | RW | Dynamic | 1--60 | Sensor sampling interval in seconds. Controls how frequently the station reads hardware sensors. Aggregated values are reported to the server at `MeterValuesInterval`. |
| `MaxSessionDurationSeconds` | integer | `600` | RW | Dynamic | 60--7200 | Maximum session duration in seconds. The station MUST auto-stop the service when this limit is reached. |
| `SessionTimeout` | integer | `120` | RW | Dynamic | 30--600 | Idle session timeout in seconds. If no user interaction occurs within this window after session start, the station MAY stop the service. |
| `ReservationDefaultTTL` | integer | `180` | RW | Dynamic | 60--1800 | Reservation time-to-live in seconds. Expired reservations are automatically cancelled. |
| `DefaultCreditsPerSession` | integer | `100` | RW | Dynamic | 1--10000 | Default credit authorization amount in minor currency units when no explicit amount is provided. |

---

## 4. Security Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `SecurityProfile` | integer | `2` | RW | Static | 1--3 | Security profile level. `1` = basic auth, `2` = TLS server auth, `3` = mTLS mutual auth. See [Chapter 06 — Security](06-security.md). |
| `CertificateSerialNumber` | string | -- | R | Static | -- | Serial number of the station's current X.509 client certificate. ReadOnly; updated when a new certificate is provisioned. |
| `AuthorizationCacheEnabled` | boolean | `true` | RW | Dynamic | -- | When `true`, the station caches authorization responses locally for faster repeat authorizations. |
| `MessageSigningMode` | string | `"Critical"` | RW | Dynamic | `"All"`, `"Critical"`, `"None"` | Controls HMAC-SHA256 message signing. `All` = every message, `Critical` = financial/command messages only (see [Chapter 06](06-security.md), §5.6), `None` = disabled. |
| `OfflinePassPublicKey` | string | -- | W | Dynamic | valid SEC1 key | Server's ECDSA P-256 public key for OfflinePass signature verification (uncompressed or compressed SEC1 format). Updated via ChangeConfiguration during key rotation. Stations MUST accept passes signed by the current or immediately previous key. |
| `CertificateRenewalThresholdDays` | integer | `30` | RW | Dynamic | 7--90 | Days before certificate expiry to initiate automatic renewal. The station checks daily and starts the SignCertificate flow when within this threshold. See [Chapter 06 — Security](06-security.md), §4.7. |
| `CertificateRenewalEnabled` | boolean | `true` | RW | Dynamic | -- | Master switch for automatic certificate renewal. When `false`, the station does not initiate renewal automatically but still responds to server-triggered renewal (TriggerCertificateRenewal [MSG-024]). |

---

## 5. Offline / BLE Configuration Keys

These keys are REQUIRED when the station reports `capabilities.bleSupported = true` in BootNotification.

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `OfflineModeEnabled` | boolean | `true` | RW | Dynamic | -- | When `true`, the station accepts offline session authorization via BLE. When `false`, all BLE auth requests are rejected. |
| `MaxOfflineTransactions` | integer | `50` | RW | Dynamic | 10--500 | Maximum number of offline transactions the station buffers before requiring server reconciliation. |
| `OfflinePassMaxAge` | integer | `3600` | RW | Dynamic | 300--86400 | Maximum age in seconds for an OfflinePass to be considered valid. Passes older than this value MUST be rejected. |
| `BLEAdvertisingEnabled` | boolean | `true` | RW | Dynamic | -- | Master switch for BLE advertising. When `false`, the station stops all BLE advertising and rejects new BLE connections. |
| `MaxConcurrentBLEConnections` | integer | `1` | RW | Dynamic | 1--3 | Maximum number of simultaneous BLE GATT connections the station accepts. See [Chapter 02](02-transport.md), Section 8.2. |
| `BLEAdvertisingInterval` | integer | `200` | RW | Dynamic | 100--2000 | BLE advertising interval in milliseconds. Lower values improve discoverability at the cost of power consumption. |
| `BLETxPower` | integer | `4` | RW | Dynamic | -20--10 | BLE TX power in dBm. Higher values increase range at the cost of power consumption. |
| `BLEConnectionTimeout` | integer | `30` | RW | Dynamic | 10--120 | Maximum idle time in seconds before the station drops an inactive BLE connection. |
| `BLEMTUPreferred` | integer | `247` | RW | Dynamic | 23--517 | Preferred ATT MTU size in bytes for BLE connections. |
| `BLEStatusInterval` | integer | `5` | RW | Dynamic | 1--30 | Interval in seconds for BLE Service Status (FFF5) characteristic notifications during active sessions. |
| `RevocationEpoch` | integer | `0` | RW | Dynamic | 0--2147483647 | Global OfflinePass revocation epoch. Incremented by server to batch-revoke all OfflinePasses issued before this epoch. |
| `BLEMaxRetries` | integer | `3` | RW | Dynamic | 1--10 | Maximum number of BLE reconnection attempts the app SHOULD make before falling back to error state. |

---

## 6. Device Management Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `FirmwareUpdateEnabled` | boolean | `true` | RW | Dynamic | -- | When `true`, the station accepts OTA firmware update commands. When `false`, UpdateFirmware requests are rejected. |
| `DiagnosticsUploadUrl` | string | `""` | RW | Static | valid URL | HTTPS URL for diagnostics file upload. Empty string disables diagnostics upload. |
| `LogLevel` | string | `"Info"` | RW | Dynamic | see enum | Station logging verbosity. Valid values: `"Debug"`, `"Info"`, `"Warn"`, `"Error"`. |
| `AutoRebootEnabled` | boolean | `false` | RW | Dynamic | -- | When `true`, the station automatically reboots on critical errors (error severity `Critical`). When `false`, the station transitions to `Faulted` state and waits for a manual Reset command. |

---

## 7. Vendor-Specific Configuration Keys

### 7.1 Naming Convention

Vendors MAY define custom configuration keys for proprietary features. Vendor-specific keys MUST use the following naming pattern:

```
Vendor_{VendorName}_{KeyName}
```

Where `{VendorName}` is the vendor's registered name in PascalCase and `{KeyName}` is the key name in PascalCase.

**Examples:**

- `Vendor_AcmeCorp_OutputPressure`
- `Vendor_AcmeCorp_DispenserCalibration`
- `Vendor_BetaCorp_OutputTemperature`

Vendor key names MUST NOT conflict with any standard OSPP key name defined in Sections 2--6.

### 7.2 Access and Behavior

- Vendor keys are **ReadWrite** by default unless the vendor documents otherwise.
- Vendor keys are **Dynamic** by default unless the vendor documents otherwise.
- The station MUST include vendor keys in GetConfiguration responses when all keys are requested (empty `keys` array).
- The server MUST NOT reject unknown vendor keys during GetConfiguration. Unknown keys requested by name MUST be returned in the `unknownKeys` array per the standard GetConfiguration RESPONSE schema.
- Vendors SHOULD document all custom keys in their station implementation guide, including type, default value, valid range, and description.

---

## 8. Configuration Protocol

### 8.1 GetConfiguration

The server retrieves configuration values by sending a **GetConfiguration** REQUEST to the station.

**Behavior:**

1. If the `keys` array is **empty or absent**, the station MUST return all known configuration keys (standard and vendor), excluding WriteOnly keys.
2. If the `keys` array contains **specific key names**, the station MUST return only the requested keys that it recognizes. Keys not recognized by the station MUST be listed in the `unknownKeys` array.
3. Each returned entry MUST include the `key` name, current `value` (as a string), and a `readonly` flag indicating whether the key can be changed.

**Wire format:** See the [GetConfiguration schemas](../schemas/mqtt/get-configuration-request.schema.json) and [response schema](../schemas/mqtt/get-configuration-response.schema.json).

**Example -- request all keys:**

```json
{
  "keys": []
}
```

**Example -- request specific keys:**

```json
{
  "keys": ["HeartbeatIntervalSeconds", "BLEAdvertisingEnabled", "Vendor_AcmeCorp_OutputPressure"]
}
```

**Example -- response:**

```json
{
  "configuration": [
    { "key": "HeartbeatIntervalSeconds", "value": "30", "readonly": false },
    { "key": "BLEAdvertisingEnabled", "value": "true", "readonly": false }
  ],
  "unknownKeys": ["Vendor_AcmeCorp_OutputPressure"]
}
```

### 8.2 ChangeConfiguration

The server sets a single configuration key by sending a **ChangeConfiguration** REQUEST to the station.

**Behavior:**

1. The station MUST validate the key name, value type, and value range.
2. If the key is **ReadOnly**, the station MUST respond with `status: "Rejected"`.
3. If the key is **unknown** (not a standard key and not a recognized vendor key), the station MUST respond with `status: "NotSupported"`.
4. If the value fails type parsing or range validation, the station MUST respond with `status: "Rejected"`.
5. If the key is **Dynamic**, the station MUST apply the new value immediately and respond with `status: "Accepted"`.
6. If the key is **Static**, the station MUST persist the new value and respond with `status: "RebootRequired"`. The new value takes effect only after the next reboot.

**Wire format:** See the [ChangeConfiguration schemas](../schemas/mqtt/change-configuration-request.schema.json) and [response schema](../schemas/mqtt/change-configuration-response.schema.json).

**Response status values:**

| Status | Meaning |
|--------|---------|
| `Accepted` | Value applied immediately (Dynamic key). |
| `RebootRequired` | Value persisted; takes effect after reboot (Static key). |
| `Rejected` | Value rejected -- ReadOnly key, invalid type, or out-of-range value. |
| `NotSupported` | Key not recognized by this station. |

When `Rejected` or `NotSupported`, the RESPONSE SHOULD include `errorCode` and `errorText` fields to assist diagnostics.

**Example -- accepted:**

```json
{
  "key": "HeartbeatIntervalSeconds",
  "value": "60"
}
```

```json
{
  "status": "Accepted"
}
```

**Example -- reboot required (Static key):**

```json
{
  "key": "StationName",
  "value": "Bay Alpha - Downtown"
}
```

```json
{
  "status": "RebootRequired"
}
```

**Example -- rejected (ReadOnly key):**

```json
{
  "key": "ProtocolVersion",
  "value": "2.0.0"
}
```

```json
{
  "status": "Rejected",
  "errorCode": 5108,
  "errorText": "CONFIGURATION_KEY_READONLY"
}
```

### 8.3 Configuration via BootNotification

The BootNotification RESPONSE MAY include a `configuration` object containing key-value pairs that the station MUST apply immediately upon boot acceptance. This mechanism allows the server to push initial or corrected configuration without requiring separate ChangeConfiguration messages.

Keys delivered via BootNotification `configuration` follow the same type, range, and mutability rules as ChangeConfiguration. The station MUST validate each key-value pair and SHOULD log a warning for any invalid entries rather than failing the entire boot sequence.

### 8.4 Configuration Persistence

The station MUST persist all configuration values to non-volatile storage after any successful ChangeConfiguration or BootNotification configuration update. On startup, the station MUST load configuration from NVS and fall back to documented defaults for any missing or corrupt keys.

If NVS is unavailable or corrupt on boot, the station MUST use default values for all keys and report error `5102` (`CONFIGURATION_ERROR`).

---

## 9. Configuration Key Summary

The following table provides a consolidated reference of all standard configuration keys.

| # | Key | Type | Default | Access | Mutability | Profile |
|--:|-----|------|---------|:------:|:----------:|---------|
| 1 | `HeartbeatIntervalSeconds` | integer | `30` | RW | Dynamic | Core |
| 2 | `ConnectionTimeout` | integer | `60` | RW | Dynamic | Core |
| 3 | `ReconnectBackoffMax` | integer | `30` | RW | Dynamic | Core |
| 4 | `StationName` | string | `""` | RW | Static | Core |
| 5 | `TimeZone` | string | `"UTC"` | RW | Static | Core |
| 6 | `ProtocolVersion` | string | `"0.1.0"` | R | Static | Core |
| 7 | `FirmwareVersion` | string | -- | R | Static | Core |
| 8 | `BootRetryInterval` | integer | `30` | RW | Dynamic | Core |
| 9 | `StatusNotificationInterval` | integer | `0` | RW | Dynamic | Core |
| 10 | `EventThrottleSeconds` | integer | `0` | RW | Dynamic | Core |
| 11 | `ConnectionLostGracePeriod` | integer | `300` | RW | Dynamic | Core |
| 12 | `Locale` | string | `"en-US"` | RW | Dynamic | Core |
| 13 | `MeterValuesInterval` | integer | `15` | RW | Dynamic | Transaction |
| 14 | `MeterValuesSampleInterval` | integer | `10` | RW | Dynamic | Transaction |
| 15 | `MaxSessionDurationSeconds` | integer | `600` | RW | Dynamic | Transaction |
| 16 | `SessionTimeout` | integer | `120` | RW | Dynamic | Transaction |
| 17 | `ReservationDefaultTTL` | integer | `180` | RW | Dynamic | Transaction |
| 18 | `DefaultCreditsPerSession` | integer | `100` | RW | Dynamic | Transaction |
| 19 | `SecurityProfile` | integer | `2` | RW | Static | Security |
| 20 | `CertificateSerialNumber` | string | -- | R | Static | Security |
| 21 | `AuthorizationCacheEnabled` | boolean | `true` | RW | Dynamic | Security |
| 22 | `MessageSigningMode` | string | `"Critical"` | RW | Dynamic | Security |
| 23 | `OfflinePassPublicKey` | string | -- | W | Dynamic | Security |
| 24 | `CertificateRenewalThresholdDays` | integer | `30` | RW | Dynamic | Security |
| 25 | `CertificateRenewalEnabled` | boolean | `true` | RW | Dynamic | Security |
| 26 | `OfflineModeEnabled` | boolean | `true` | RW | Dynamic | Offline / BLE |
| 27 | `MaxOfflineTransactions` | integer | `50` | RW | Dynamic | Offline / BLE |
| 28 | `OfflinePassMaxAge` | integer | `3600` | RW | Dynamic | Offline / BLE |
| 29 | `BLEAdvertisingEnabled` | boolean | `true` | RW | Dynamic | Offline / BLE |
| 30 | `MaxConcurrentBLEConnections` | integer | `1` | RW | Dynamic | Offline / BLE |
| 31 | `BLEAdvertisingInterval` | integer | `200` | RW | Dynamic | Offline / BLE |
| 32 | `BLETxPower` | integer | `4` | RW | Dynamic | Offline / BLE |
| 33 | `BLEConnectionTimeout` | integer | `30` | RW | Dynamic | Offline / BLE |
| 34 | `BLEMTUPreferred` | integer | `247` | RW | Dynamic | Offline / BLE |
| 35 | `BLEStatusInterval` | integer | `5` | RW | Dynamic | Offline / BLE |
| 36 | `RevocationEpoch` | integer | `0` | RW | Dynamic | Offline / BLE |
| 37 | `BLEMaxRetries` | integer | `3` | RW | Dynamic | Offline / BLE |
| 38 | `FirmwareUpdateEnabled` | boolean | `true` | RW | Dynamic | Device Mgmt |
| 39 | `DiagnosticsUploadUrl` | string | `""` | RW | Static | Device Mgmt |
| 40 | `LogLevel` | string | `"Info"` | RW | Dynamic | Device Mgmt |
| 41 | `AutoRebootEnabled` | boolean | `false` | RW | Dynamic | Device Mgmt |

**Total: 41 standard configuration keys** (12 Core + 6 Transaction + 7 Security + 12 Offline/BLE + 4 Device Management).
