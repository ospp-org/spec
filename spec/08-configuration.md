# Chapter 08 — Configuration

> **Status:** Draft | **OSPP Version:** 0.28.0

This chapter defines the configuration model for OSPP stations, including the key-value store structure, supported data types, access modes, mutability semantics, and the complete registry of standard configuration keys. Configuration is read and written via the [GetConfiguration](03-messages.md#62-getconfiguration) and [ChangeConfiguration](03-messages.md#61-changeconfiguration) messages defined in Chapter 03.

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

---

## 1. Configuration Model

### 1.1 Key-Value Structure

Each station maintains a flat **key-value store** containing all configuration parameters. Keys are strings in **PascalCase** (e.g., `HeartbeatIntervalSeconds`, `OfflineModeEnabled`). Values are typed according to Section 1.2.

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

The station MUST reject any ChangeConfiguration request targeting a ReadOnly key. That key's entry in the RESPONSE `results` array MUST carry `status: "Rejected"`, `errorCode: 5108`, and `errorText: "CONFIGURATION_KEY_READONLY"`. Because the operation is atomic, no key in the request is applied.

If a station receives a ChangeConfiguration request for a key it does not recognize (neither a standard key from Sections 2--6 nor a recognized `Vendor_` key), that key's `results` entry MUST carry `status: "NotSupported"`, and no key in the request is applied.

WriteOnly keys (e.g., security credentials) are accepted via ChangeConfiguration but MUST NOT be included in GetConfiguration responses to prevent credential leakage.

### 1.4 Mutability

Each key is classified by when a new value takes effect:

| Mutability | Behavior |
|------------|----------|
| **Dynamic** | The new value takes effect **immediately** after the station applies it. That key's ChangeConfiguration `results` entry returns `status: "Accepted"`. |
| **Static** | The new value is persisted but takes effect only after a **station reboot**. That key's ChangeConfiguration `results` entry returns `status: "RebootRequired"`. |

The server SHOULD track keys that returned `RebootRequired` and issue a [Reset](03-messages.md#63-reset) command when appropriate.

### 1.5 Profile Grouping

Configuration keys are organized into profiles that align with station capabilities:

| Profile | Profile ID | Keys | Required |
|---------|------------|------|:--------:|
| **Core** | `Core` | HeartbeatIntervalSeconds, ConnectionTimeout, ReconnectBackoffMax, StationName, TimeZone, ProtocolVersion, FirmwareVersion, BootRetryInterval, ConnectionLostGracePeriod | Yes |
| **Transaction** | `Transaction` | MeterValuesInterval, MeterValuesSampleInterval, MaxSessionDurationSeconds, SessionTimeout, ReservationDefaultTTL, DefaultCreditsPerSession | Yes |
| **Security** | `Security` | CertificateSerialNumber, AuthorizationCacheEnabled, MessageSigningMode, OfflinePassPublicKey, CertificateRenewalThresholdDays, CertificateRenewalEnabled | Yes |
| **Offline / BLE** | `OfflineBLE` | OfflineModeEnabled, MaxOfflineTransactions, OfflinePassMaxAge, RevocationEpoch | Conditional (required if `capabilities.bleSupported = true`) |
| **Device Management** | `DeviceManagement` | FirmwareUpdateEnabled, LogLevel, AutoRebootEnabled | Conditional (required if `capabilities.deviceManagementSupported = true`) |
| **Vendor-Specific** | -- | `Vendor_{VendorName}_*` | No |

**The Profile column is a display label; the Profile ID is the normative identifier.** An implementation that exposes a key's profile as a program value — an enum case, a string constant, a database column — **MUST** use the Profile ID exactly as spelled here. The display label carries a space and a slash and does not survive being made an identifier, which is how the two SDKs arrived at three different spellings of two profiles between them with nothing to compare against. `tools/check-config-ranges.py` checks that the two columns stay in step and that §9's labels are drawn from this table; an SDK gate compares its own registry to the Profile ID column.

A station **MUST** support all keys in the required profiles. A station that advertises `capabilities.bleSupported = true` in BootNotification **MUST** additionally support all Offline / BLE keys, and a station that advertises `capabilities.deviceManagementSupported = true` **MUST** additionally support all Device Management keys.

**Why Device Management is conditional and not required.** The three keys have no protocol surface of their own: GetConfiguration and ChangeConfiguration are themselves Device Management actions, so a station that does not declare the capability can be neither asked for these keys nor told to set them. One of the three — `FirmwareUpdateEnabled` — is a switch for a Device Management action such a station does not implement, and governs nothing without it. Requiring them unconditionally would make a station non-conforming for keys it has no way to carry, and would contradict [`profiles/device-management/README.md`](profiles/device-management/README.md) §1 and §3, which have always made the profile RECOMMENDED and gated its rules on the capability. The one path that survives is the BootNotification `configuration` block (§8.3), which is a Core mechanism; §8.3 states what a station does with a key it does not support.

### 1.6 Value Ranges

The **Range** column of the registry tables in Sections 2--6 is **normative**. It is the range §1.1 and §8.2 rule 4 require the station to validate against, and a value outside it **MUST** be rejected with `status: "Rejected"` and `5109 INVALID_CONFIGURATION_VALUE`. The column appears in Sections 2--6 only; the Section 9 summary does not carry it (§9).

Every cell takes one of five forms, and no others:

| Form | Meaning | Keys |
|------|---------|-----:|
| `<min>--<max>` | Inclusive integer bounds. Both endpoints are legal values. | 15 |
| `--` | No range constraint beyond the declared type of §1.2. | 8 |
| `max <n> chars` | Maximum length in UTF-8 characters. | 1 |
| A list of quoted literals | The complete set of legal values, stated inline. | 2 |
| A named external constraint | Defined by the key's own Description or by the chapter it cites. | 2 |

The counts above are checked by `tools/check-config-ranges.py`, which also verifies that every restatement of a range elsewhere in this specification agrees with the cell here.

**A quantity that also travels as a dedicated wire field is bound by two constraints** — its registry range and that field's schema — and both apply. Where the two can disagree, **the schema governs**, per [§3.5 of Chapter 00](00-introduction.md): it is what actually validates the message, and narrowing it to match a registry cell would make non-conforming every server already emitting a value the schema admits.

Two such pairs exist. `HeartbeatIntervalSeconds` with `heartbeatIntervalSec` **agree**: the registry cell was the wrong one and now reads `10--3600`, matching `boot-notification-response.schema.json` and the clamping rule in [`heartbeat.md`](profiles/core/heartbeat.md) §5, which had assumed the lower floor all along. `BootRetryInterval` with `retryInterval` **still disagree**, and are not resolved the same way: that field's schema states `minimum: 1` and **no maximum**, which is a type floor rather than a considered range, so aligning the registry to it would delete the constraint instead of correcting it. That one is recorded in [`KNOWN-ISSUES.md`](../KNOWN-ISSUES.md) and is **not** resolved by the reader choosing one.

---

## 2. Core Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `HeartbeatIntervalSeconds` | integer | `30` | RW | Dynamic | 10--3600 | Heartbeat period in seconds. The station sends a Heartbeat REQUEST at this interval. Also configurable via BootNotification RESPONSE. |
| `ConnectionTimeout` | integer | `60` | RW | Dynamic | 10--300 | MQTT connection timeout in seconds. If the station cannot establish a connection within this window, it MUST initiate reconnection with backoff. |
| `ReconnectBackoffMax` | integer | `30` | RW | Dynamic | 30--3600 | Maximum reconnect backoff delay in seconds (see [Chapter 02](02-transport.md), Section 4.5). |
| `StationName` | string | `""` | RW | Static | max 100 chars | Human-readable station name for display in management dashboards. |
| `TimeZone` | string | `"UTC"` | RW | Static | IANA tz | IANA timezone identifier (e.g., `"Europe/London"`). Used for local time display and time-based policies. |
| `ProtocolVersion` | string | `"0.3.0"` | R | Static | -- | OSPP protocol version supported by the station. ReadOnly; the station firmware determines this value. |
| `FirmwareVersion` | string | -- | R | Static | -- | Current firmware version in semver format (e.g., `"1.2.3"`). ReadOnly; updated only via firmware update. |
| `BootRetryInterval` | integer | `30` | RW | Dynamic | 10--600 | Retry interval in seconds when BootNotification is rejected or pending. |
| `ConnectionLostGracePeriod` | integer | `300` | RW | Dynamic | 60--600 | Duration in seconds to wait before terminating orphaned sessions after MQTT connection loss. |

---

## 3. Transaction Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `MeterValuesInterval` | integer | `60` | RW | Dynamic | 10--3600 | Interval in seconds between MeterValues event reports during an active session. |
| `MeterValuesSampleInterval` | integer | `10` | RW | Dynamic | 1--60 | Sensor sampling interval in seconds. Controls how frequently the station reads hardware sensors. Aggregated values are reported to the server at `MeterValuesInterval`. |
| `MaxSessionDurationSeconds` | integer | `900` | RW | Dynamic | 60--3600 | Maximum session duration in seconds. The station MUST auto-stop the service when this limit is reached. |
| `SessionTimeout` | integer | `120` | RW | Dynamic | 30--600 | Idle session timeout in seconds. If no user interaction occurs within this window after session start, the station MAY stop the service. |
| `ReservationDefaultTTL` | integer | `300` | RW | Dynamic | 60--1800 | Reservation time-to-live in seconds. Expired reservations are automatically cancelled. |
| `DefaultCreditsPerSession` | integer | `100` | RW | Dynamic | 1--10000 | Default credit authorization amount in minor currency units when no explicit amount is provided. |

> **`SessionTimeout` is not fully specified, and this note is the specification of that fact.**
> The key is retained because deployed configurations carry it, but three gaps stand between it
> and an implementable obligation. They are recorded here rather than closed, because closing the
> first one is a wire change nobody has asked for.
>
> 1. **A station that acts on it cannot say so.** The row above permits stopping an idle session,
>    and [`session-ended.md` §6](profiles/transaction/session-ended.md) requires a SessionEnded for
>    every session terminating without a StopService. The `reason` enum is closed at six members —
>    `TimerExpired`, `Fault`, `Local`, `LocalOutOfCredit`, `Deauthorized`, `OperatorStopped` — and
>    none of them is an inactivity timeout. So the one event that would report the stop has no
>    value to report it with, and the station is left choosing between an inaccurate `reason` and
>    a silent termination. Widening the enum is a coordinated wire change and has deliberately
>    **not** been made.
> 2. **The two statements of the rule use different triggers, and the transition one of them names
>    does not exist.** This registry says *no user interaction*; [`05-state-machines.md`
>    §3.4](05-state-machines.md) says *no MeterValues or user interaction*. On a metered bay those
>    are different conditions, and which one governs decides whether the timer ever runs. Worse,
>    §3.4 states the outcome as a transition to `Stopping` — but §3.3, the session transition table,
>    carries no inactivity row among its fifteen triggers, and neither the §3.1 diagram nor
>    `diagrams/state-machine-session.mmd` has such an edge. The only transitions into `Stopping` are
>    a StopService and the duration timer.
> 3. **Under the MeterValues-counting reading the mechanism breaks in both directions, at legal
>    settings.** At the **default pair** — `MeterValuesInterval` `60`, `SessionTimeout` `120` —
>    a MeterValues always arrives inside the window, so the timeout can never fire and the feature
>    is inert as shipped. At the **legal extreme** — `MeterValuesInterval` `3600` against
>    `SessionTimeout` `600`, both inside their published ranges — no MeterValues can arrive inside
>    the window, so every session still running at 600 s is stopped as idle while it is being
>    delivered normally. The registry admits both pairs and warns against neither.
>
> Until these are resolved, treat the behaviour as implementation-defined: a server cannot infer
> from the protocol that a session ended because this timer elapsed.

---

## 4. Security Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `CertificateSerialNumber` | string | -- | R | Static | -- | Serial number of the station's **CURRENT** X.509 client certificate. ReadOnly; updated when a new certificate is provisioned. A PREVIOUS certificate retained during rotation is deliberately not represented here — this key is single-valued by design, and the overlap it does not show is bounded by [Chapter 06 — Security](06-security.md), §4.7.6. |
| `AuthorizationCacheEnabled` | boolean | `true` | RW | Dynamic | -- | When `true`, the station caches authorization responses locally for faster repeat authorizations. |
| `MessageSigningMode` | string | `"All"` | RW | **Static** | `"All"`, `"None"` | Controls HMAC-SHA256 message signing. `All` = every message except the three structural exemptions (see [Chapter 06](06-security.md), §5.6); `None` = disabled, development and test harnesses only. **Static**, not Dynamic: the mode is bound to the session key, which is issued at boot, so a mid-session change would leave one peer signing and the other not — and verification fails closed while signing fails closed too, so the station goes silent in both directions. Taking effect at the next reboot means the change and the new key land on the same event. |
| `OfflinePassPublicKey` | string | -- | W | Dynamic | valid SEC1 key | Server's ECDSA P-256 public key for OfflinePass signature verification (uncompressed or compressed SEC1 format). Updated via ChangeConfiguration during key rotation. Stations MUST accept passes signed by the current key, and the immediately previous key **for the grace period only** — the window is bounded by [Chapter 06 — Security](06-security.md), §6.7 step 4, which is its only statement; after it expires the station **MUST** discard the cached previous key. |
| `CertificateRenewalThresholdDays` | integer | `30` | RW | Dynamic | 7--90 | Days before certificate expiry to initiate automatic renewal. The station checks daily and starts the SignCertificate flow when within this threshold. See [Chapter 06 — Security](06-security.md), §4.7. |
| `CertificateRenewalEnabled` | boolean | `true` | RW | Dynamic | -- | Master switch for automatic certificate renewal. When `false`, the station does not initiate renewal automatically but still responds to server-triggered renewal (TriggerCertificateRenewal [MSG-024]). |

> **Two revocation settings are named with a range and deliberately kept out of this registry.**
> `CertificateRevocationMaxAgeSeconds` and `CertificateRevocationGraceSeconds` bound the broker's
> certificate-revocation checking, which became an obligation in `0.27.0`
> ([Chapter 06 — Security §2.1.1](06-security.md#211-revocation-checking)). They are named, typed, defaulted and
> ranged in the form these tables use, so two deployments can be compared on them — and they are **not** keys of
> this registry. §1.1 defines it as the *station's* key-value store and §1.5 makes every key of a required profile
> a station conformance obligation, while neither setting is held by a station, carried by any OSPP message, or
> answerable to GetConfiguration: a station asked for one could only answer `NotSupported`. Registering them would
> oblige every station to implement a key it cannot act on. The same reasoning is already recorded for the
> station-side grace period of [Chapter 06 §6.7](06-security.md#67-server-signing-key-rotation-ecdsa-p-256)
> step 3, which is likewise stated with a value and deliberately absent from here.

---

## 5. Offline / BLE Configuration Keys

These keys are REQUIRED when the station reports `capabilities.bleSupported = true` in BootNotification.

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `OfflineModeEnabled` | boolean | `true` | RW | Dynamic | -- | When `true`, the station accepts offline session authorization via BLE. When `false`, all BLE auth requests are rejected. |
| `MaxOfflineTransactions` | integer | `1000` | RW | Dynamic | 1000--10000 | Capacity of the station's TransactionEvent buffer, in events. The **floor is normative and is owned by** [Chapter 01 — Architecture](01-architecture.md), §6.5: TransactionEvent is a Category-1 message with a minimum capacity of 1000 and `MUST NOT` discard, and the §6.5 hardware table sizes its `MUST` storage level (512 KB) for exactly that. A value below the floor cannot satisfy §6.5, which is why the range starts there rather than allowing it; the ceiling bounds the configuration value, not the hardware. Distinct from the pass-carried `constraints.stationMaxOfflineTx` ([`offline-pass.md` §2.2](profiles/offline/offline-pass.md)), which is a per-pass policy limit on starting further offline sessions, not a storage capacity. |
| `OfflinePassMaxAge` | integer | `86400` | RW | Dynamic | 300--86400 | Maximum age, in seconds, of an OfflinePass this station will accept: a pass whose `now - issuedAt` exceeds it **MUST** be rejected with `2003 OFFLINE_PASS_EXPIRED`. This is one of the two bounds of [`offline-pass.md` §4](profiles/offline/offline-pass.md#4-validation-checks-10) check #2, not a separate check. It is the **bounding mechanism for a stale allowance**: the pass carries a snapshot of the user's wallet, the app re-issues it on every event that can move that wallet ([`offline-pass.md` §6](profiles/offline/offline-pass.md#6-lifecycle) step 3a), and this key bounds the window in which the app has had no network to do so. It is **independent of the pass's signed validity**, which is the issuer's and fixed at signing; the only tie between them is a consistency obligation on the issuer at issue time ([`offline-pass.md` §6](profiles/offline/offline-pass.md#6-lifecycle) step 1) — a server must not sign a validity longer than the value configured on the stations that will validate the pass. **Consequence worth stating: because signed validity is capped at 24 hours, a value at or above `86400` makes this check unreachable** — an unexpired pass is by construction younger than 24 hours, so the expiry bound always fires first. The key tightens staleness only below that. **The default is therefore deliberately inert**: it sits at the legal maximum so that no deployment is tightened by accident, and an operator who wants the bound arms it by lowering the key. That is the intended posture, not an oversight — a control that fires by default would refuse users at the bay for a policy nobody chose. |
| `RevocationEpoch` | integer | `0` | RW | Dynamic | 0--2147483647 | Global OfflinePass revocation epoch. Incremented by server to batch-revoke all OfflinePasses issued before this epoch. |

---

## 6. Device Management Configuration Keys

| Key | Type | Default | Access | Mutability | Range | Description |
|-----|------|---------|:------:|:----------:|-------|-------------|
| `FirmwareUpdateEnabled` | boolean | `true` | RW | Dynamic | -- | When `true`, the station accepts OTA firmware update commands. When `false`, UpdateFirmware requests are rejected. |
| `LogLevel` | string | `"Info"` | RW | Dynamic | `"Debug"`, `"Info"`, `"Warn"`, `"Error"` | Station logging verbosity. |
| `AutoRebootEnabled` | boolean | `false` | RW | Dynamic | -- | When `true`, the station automatically reboots on critical errors (error severity `Critical`). When `false`, the station transitions to `Faulted` state and waits for a manual Reset command. |

> **Withdrawn in `0.23.0`: `DiagnosticsUploadUrl`.** It was a `Static` string, default `""`,
> described as *"HTTPS URL for diagnostics file upload. Empty string disables diagnostics upload."*
> Neither half was reachable. `uploadUrl` is REQUIRED on every GetDiagnostics
> ([`get-diagnostics.md` §3](profiles/device-management/get-diagnostics.md)), so no request ever
> fell back to it; and no processing rule read the key, no error code reported the disabled state,
> and no implementation consumed it — measured across the reference server, both SDKs and the
> station simulator. A key nothing reads is a key nothing can be wrong about, which is why it
> survived four releases.
>
> **What this costs a server, stated because it is not obvious.** An unknown key is answered
> `NotSupported` ([`change-configuration.md` §6](profiles/device-management/change-configuration.md)
> rule 5), and rule 2 makes the batch **atomic**: one `NotSupported` entry discards **every other
> key in the same ChangeConfiguration**. A server that still carries `DiagnosticsUploadUrl` in a
> push set will therefore find that batch wholly ineffective against a station on `0.23.0`, while
> the identical batch still applies on `0.22.0`. **Servers MUST remove the key from any push set
> before a station running `0.23.0` is in the fleet.** Reading it back is safe — GetConfiguration
> reports an unknown key as unknown and applies nothing.
>
> Retracting it rather than defining it also closes the two options that would have kept it: making
> it a station-side gate, or making it the default it was described as. Both needed a new error
> code for *"diagnostics upload is disabled"*, and neither had a consumer asking for one.

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
- The station MUST include vendor keys in GetConfiguration responses when all keys are requested (empty `keys` array) — unless the vendor documents the key as WriteOnly, in which case §1.3 applies and it is never returned.
- The server MUST NOT reject a GetConfiguration RESPONSE because it carries vendor keys the server does not recognize. Where a vendor key is requested by name and the **station** does not recognize it, the station MUST return it in the `unknownKeys` array per the standard GetConfiguration RESPONSE schema.
- Vendors SHOULD document all custom keys in their station implementation guide, including type, default value, valid range, and description.

---

## 8. Configuration Protocol

### 8.1 GetConfiguration

The server retrieves configuration values by sending a **GetConfiguration** REQUEST to the station.

**Behavior:**

1. If the `keys` array is **empty or absent**, the station MUST return all known configuration keys (standard and vendor), excluding WriteOnly keys.
2. If the `keys` array contains **specific key names**, the station MUST return only the requested keys that it recognizes, excluding WriteOnly keys. Keys not recognized by the station MUST be listed in the `unknownKeys` array.
   - A requested **WriteOnly** key MUST NOT appear in `configuration`, and MUST NOT be listed in `unknownKeys` — the station recognizes it, so reporting it as unknown would be false. It appears in **neither array**, which is precisely how a server tells a withheld key from an unrecognized one. Naming a WriteOnly key MUST NOT cause an error and MUST NOT fail the request: every other requested key is returned normally. See [`get-configuration.md`](profiles/device-management/get-configuration.md), §5.1.
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
  "keys": ["HeartbeatIntervalSeconds", "OfflineModeEnabled", "Vendor_AcmeCorp_OutputPressure"]
}
```

**Example -- response:**

```json
{
  "configuration": [
    { "key": "HeartbeatIntervalSeconds", "value": "30", "readonly": false },
    { "key": "OfflineModeEnabled", "value": "true", "readonly": false }
  ],
  "unknownKeys": ["Vendor_AcmeCorp_OutputPressure"]
}
```

### 8.2 ChangeConfiguration

The server sets one or more configuration keys by sending a **ChangeConfiguration** REQUEST to the station, carrying a `keys` array of `{key, value}` pairs (1–20). The change is **atomic**: the station validates every key first and applies none unless all pass. The RESPONSE carries a `results` array with one entry per requested key, in request order — there is no top-level `status`. See [`change-configuration.md`](profiles/device-management/change-configuration.md) for the full message definition.

**Behavior:**

1. The station MUST validate the key name, value type, and value range.
2. If a key is **ReadOnly**, its `results` entry MUST carry `status: "Rejected"`.
3. If a key is **unknown** (not a standard key and not a recognized vendor key), its `results` entry MUST carry `status: "NotSupported"`.
4. If a value fails type parsing or range validation, that key's `results` entry MUST carry `status: "Rejected"`.
5. If a key is **Dynamic** and the request is applied, the station MUST apply the new value immediately and its `results` entry MUST carry `status: "Accepted"`.
6. If a key is **Static** and the request is applied, the station MUST persist the new value and its `results` entry MUST carry `status: "RebootRequired"`. The new value takes effect only after the next reboot.

**Wire format:** See the [ChangeConfiguration schemas](../schemas/mqtt/change-configuration-request.schema.json) and [response schema](../schemas/mqtt/change-configuration-response.schema.json).

**Per-key `results[].status` values:**

**Every entry is a per-key verdict on validation, not a record that the value was stored.** Because the operation is atomic, the outcome of a key depends on the whole batch: an `Accepted` or `RebootRequired` entry results in the value being applied **only if no entry in the same `results` array is `Rejected` or `NotSupported`**. In a batch that carries either, nothing is applied — including the keys whose own entry passed.

| Status | Meaning |
|--------|---------|
| `Accepted` | The value passed validation for a Dynamic key. Applied immediately if the batch carries no `Rejected` or `NotSupported` entry. |
| `RebootRequired` | The value passed validation for a Static key. Persisted if the batch carries no `Rejected` or `NotSupported` entry, and takes effect at the next reboot. |
| `Rejected` | Value rejected -- ReadOnly key, invalid type, or out-of-range value. Nothing in the batch is applied. |
| `NotSupported` | Key not recognized by this station. Nothing in the batch is applied. |

A `Rejected` entry **MUST** carry `results[].errorCode` and `results[].errorText` for the two causes this specification names: `5108 CONFIGURATION_KEY_READONLY` for a ReadOnly key (§1.3), and `5109 INVALID_CONFIGURATION_VALUE` for a value that fails type parsing or range validation ([`change-configuration.md`](profiles/device-management/change-configuration.md) §6 rules 4 and 6). For any other `Rejected` or `NotSupported` entry the specification names no code, and the pair **SHOULD** be carried to assist diagnostics. The response schema leaves both members optional because the requirement is conditional on the cause, which a bare `required` list cannot express.

**Example -- accepted:**

```json
{
  "keys": [
    { "key": "HeartbeatIntervalSeconds", "value": "60" }
  ]
}
```

```json
{
  "results": [
    { "key": "HeartbeatIntervalSeconds", "status": "Accepted" }
  ]
}
```

**Example -- reboot required (Static key):**

```json
{
  "keys": [
    { "key": "StationName", "value": "Bay Alpha - Downtown" }
  ]
}
```

```json
{
  "results": [
    { "key": "StationName", "status": "RebootRequired" }
  ]
}
```

**Example -- rejected (ReadOnly key):**

```json
{
  "keys": [
    { "key": "ProtocolVersion", "value": "2.0.0" }
  ]
}
```

```json
{
  "results": [
    {
      "key": "ProtocolVersion",
      "status": "Rejected",
      "errorCode": 5108,
      "errorText": "CONFIGURATION_KEY_READONLY"
    }
  ]
}
```

### 8.3 Configuration via BootNotification

The BootNotification RESPONSE MAY include a `configuration` object containing key-value pairs that the station MUST apply immediately upon boot acceptance. This mechanism allows the server to push initial or corrected configuration without requiring separate ChangeConfiguration messages.

Keys delivered via BootNotification `configuration` follow the same type, range, and mutability rules as ChangeConfiguration. The station MUST validate each key-value pair and SHOULD log a warning for any invalid entries rather than failing the entire boot sequence.

A key the station does **not support** — a Device Management or Offline / BLE key on a station that declares neither capability (§1.5), or a `Vendor_` key it does not recognize — is treated the same way: the station **MUST** ignore that entry, **SHOULD** log a warning, and **MUST NOT** fail the boot. This block is **not atomic**, which is the difference from ChangeConfiguration: an entry the station cannot apply does not prevent the others from being applied, and there is no `results` array in which to report it. A server that needs to know whether a key was taken **MUST** use ChangeConfiguration, which answers per key.

### 8.4 Configuration Persistence

The station MUST persist all configuration values to non-volatile storage after any successful ChangeConfiguration or BootNotification configuration update. On startup, the station MUST load configuration from NVS and fall back to documented defaults for any missing or corrupt keys.

If NVS is unavailable or corrupt on boot, the station MUST use default values for all keys and report error `5102` (`CONFIGURATION_ERROR`).

---

## 9. Configuration Key Summary

**Sections 2--6 are the registry; this table is derived from them.** Two obligations in this chapter name Sections 2--6 as the definitional key set and neither names this section — §1.3, which decides what makes a key unrecognized, and §7.1, which forbids a vendor key from colliding with a standard one. Where this table and Sections 2--6 disagree, Sections 2--6 govern and the disagreement is a defect; `tools/check-config-ranges.py` compares the two on the key set and on all four columns they share, so it cannot open silently.

The table adds two columns Sections 2--6 do not carry — the index number and the profile label — and omits two they do: **Range** (§1.6) and Description. It is therefore a cross-reference, not a superset, and a reader validating a value **MUST** use Sections 2--6.

| # | Key | Type | Default | Access | Mutability | Profile |
|--:|-----|------|---------|:------:|:----------:|---------|
| 1 | `HeartbeatIntervalSeconds` | integer | `30` | RW | Dynamic | Core |
| 2 | `ConnectionTimeout` | integer | `60` | RW | Dynamic | Core |
| 3 | `ReconnectBackoffMax` | integer | `30` | RW | Dynamic | Core |
| 4 | `StationName` | string | `""` | RW | Static | Core |
| 5 | `TimeZone` | string | `"UTC"` | RW | Static | Core |
| 6 | `ProtocolVersion` | string | `"0.3.0"` | R | Static | Core |
| 7 | `FirmwareVersion` | string | -- | R | Static | Core |
| 8 | `BootRetryInterval` | integer | `30` | RW | Dynamic | Core |
| 9 | `ConnectionLostGracePeriod` | integer | `300` | RW | Dynamic | Core |
| 10 | `MeterValuesInterval` | integer | `60` | RW | Dynamic | Transaction |
| 11 | `MeterValuesSampleInterval` | integer | `10` | RW | Dynamic | Transaction |
| 12 | `MaxSessionDurationSeconds` | integer | `900` | RW | Dynamic | Transaction |
| 13 | `SessionTimeout` | integer | `120` | RW | Dynamic | Transaction |
| 14 | `ReservationDefaultTTL` | integer | `300` | RW | Dynamic | Transaction |
| 15 | `DefaultCreditsPerSession` | integer | `100` | RW | Dynamic | Transaction |
| 16 | `CertificateSerialNumber` | string | -- | R | Static | Security |
| 17 | `AuthorizationCacheEnabled` | boolean | `true` | RW | Dynamic | Security |
| 18 | `MessageSigningMode` | string | `"All"` | RW | Static | Security |
| 19 | `OfflinePassPublicKey` | string | -- | W | Dynamic | Security |
| 20 | `CertificateRenewalThresholdDays` | integer | `30` | RW | Dynamic | Security |
| 21 | `CertificateRenewalEnabled` | boolean | `true` | RW | Dynamic | Security |
| 22 | `OfflineModeEnabled` | boolean | `true` | RW | Dynamic | Offline / BLE |
| 23 | `MaxOfflineTransactions` | integer | `1000` | RW | Dynamic | Offline / BLE |
| 24 | `OfflinePassMaxAge` | integer | `86400` | RW | Dynamic | Offline / BLE |
| 25 | `RevocationEpoch` | integer | `0` | RW | Dynamic | Offline / BLE |
| 26 | `FirmwareUpdateEnabled` | boolean | `true` | RW | Dynamic | Device Management |
| 27 | `LogLevel` | string | `"Info"` | RW | Dynamic | Device Management |
| 28 | `AutoRebootEnabled` | boolean | `false` | RW | Dynamic | Device Management |

**Total: 28 standard configuration keys** (9 Core + 6 Transaction + 6 Security + 4 Offline/BLE + 3 Device Management). `DiagnosticsUploadUrl` was withdrawn in `0.23.0` — see the note in [§6](#6-device-management-configuration-keys). The index column is a row number in this derived table and is renumbered with it; it is not an identifier and nothing cites it.
