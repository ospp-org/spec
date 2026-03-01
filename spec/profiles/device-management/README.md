# Device Management Profile

> **Status:** Draft

The Device Management profile provides remote management capabilities for OSPP stations, enabling operators to configure, update, diagnose, reset, and maintain stations without physical access.

## 1. Overview

The **Device Management** profile is a RECOMMENDED (not mandatory) profile that covers the full lifecycle of remote station management. It includes 9 actions across configuration, firmware updates, diagnostics, reset, maintenance, and service catalog management.

Stations that declare support for this profile MUST implement all 9 actions. Partial implementation is not permitted -- the profile is atomic.

## 2. Actions Summary

| Action | Direction | Type | Description |
|-------------------------------------------|-------------------|---------|-----------------------------------------------|
| [GetConfiguration](get-configuration.md) | Server to Station | COMMAND | Read one or more configuration keys from the station. |
| [ChangeConfiguration](change-configuration.md) | Server to Station | COMMAND | Set a single configuration key on the station. |
| [Reset](reset.md) | Server to Station | COMMAND | Perform a soft (firmware restart) or hard (factory) reset. |
| [UpdateFirmware](update-firmware.md) | Server to Station | COMMAND | Initiate an OTA firmware update with A/B partitioning. |
| [FirmwareStatusNotification](firmware-status.md) | Station to Server | EVENT | Report firmware update progress (download, install, failure). |
| [GetDiagnostics](get-diagnostics.md) | Server to Station | COMMAND | Request diagnostics collection and upload. |
| [DiagnosticsNotification](diagnostics-status.md) | Station to Server | EVENT | Report diagnostics collection and upload progress. |
| [SetMaintenanceMode](set-maintenance-mode.md) | Server to Station | COMMAND | Enable or disable maintenance mode on bay(s). |
| [UpdateServiceCatalog](update-service-catalog.md) | Server to Station | COMMAND | Push an updated service catalog with pricing. |

## 3. Compliance Requirements

This profile is RECOMMENDED but OPTIONAL. A station is not required to support it. However, if a station declares support for the Device Management profile (via the `deviceManagementSupported` capability in BootNotification), the following rules apply:

1. The station MUST implement **all 9 actions** listed above. Partial support is not allowed.
2. The station MUST respond to all server-initiated commands (REQUEST messages) with a valid RESPONSE within the per-action protocol timeout:

| Action | Timeout |
|--------|--------:|
| ChangeConfiguration | 60s |
| GetConfiguration | 30s |
| Reset | 30s |
| UpdateFirmware | 300s |
| GetDiagnostics | 300s |
| SetMaintenanceMode | 30s |
| UpdateServiceCatalog | 30s |
3. The station MUST send EVENT notifications (FirmwareStatusNotification, DiagnosticsNotification) at each lifecycle stage transition as defined in the individual action specifications.
4. The station MUST persist configuration changes and service catalog updates to non-volatile storage so they survive reboots.
5. The station MUST support the A/B partition strategy for firmware updates with automatic rollback on failure.
6. Error responses MUST conform to the standard OSPP error format defined in [Chapter 07 — Error Codes & Resilience](../../07-errors.md).

## 4. Dependencies

This profile depends on the **Core** profile:

- **BootNotification** -- Required for firmware version reporting after updates and resets.
- **StatusNotification** -- Required for bay state reporting after maintenance mode changes.
- **Heartbeat** -- Required for liveness detection during long-running operations (firmware updates, diagnostics uploads).

## 5. Related Schemas

All schemas for this profile are located in [`schemas/mqtt/`](../../../schemas/mqtt/):

| Schema | Description |
|------------------------------------------------|-----------------------------------------------|
| `get-configuration-request.schema.json` | GetConfiguration request payload. |
| `get-configuration-response.schema.json` | GetConfiguration response payload. |
| `change-configuration-request.schema.json` | ChangeConfiguration request payload. |
| `change-configuration-response.schema.json` | ChangeConfiguration response payload. |
| `reset-request.schema.json` | Reset request payload. |
| `reset-response.schema.json` | Reset response payload. |
| `update-firmware-request.schema.json` | UpdateFirmware request payload. |
| `update-firmware-response.schema.json` | UpdateFirmware response payload. |
| `firmware-status-notification.schema.json` | FirmwareStatusNotification event payload. |
| `get-diagnostics-request.schema.json` | GetDiagnostics request payload. |
| `get-diagnostics-response.schema.json` | GetDiagnostics response payload. |
| `diagnostics-notification.schema.json` | DiagnosticsNotification event payload. |
| `set-maintenance-mode-request.schema.json` | SetMaintenanceMode request payload. |
| `set-maintenance-mode-response.schema.json` | SetMaintenanceMode response payload. |
| `update-service-catalog-request.schema.json` | UpdateServiceCatalog request payload. |
| `update-service-catalog-response.schema.json` | UpdateServiceCatalog response payload. |
