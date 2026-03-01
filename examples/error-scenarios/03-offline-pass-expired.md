# Error Scenario 03: Offline Pass Expired

## Scenario

Alice is at the station but her phone has no cellular signal. She attempts to start
a BLE offline session using a previously obtained OfflinePass. However, the pass
expired yesterday (2026-02-12 at 10:00 UTC) and it is now 2026-02-13. The station
validates the pass locally and rejects the authentication because the expiration
check fails. Alice must reconnect to the internet to obtain a fresh OfflinePass
before she can use the station.

**Station:** stn_a1b2c3d4 ("SSP-3000" by AcmeCorp)
**Bay:** bay_c1d2e3f4a5b6 (Bay 1)
**Service:** svc_eco (Eco Program, 10 credits/min)
**User:** Alice (sub_alice2026)
**Phone connectivity:** Offline (no cellular, no Wi-Fi)
**Station connectivity:** Offline (no internet)

## What Goes Wrong

Alice's OfflinePass was issued on 2026-02-11 with a 24-hour validity window
(expires 2026-02-12T10:00:00.000Z). The app did not refresh the pass because Alice
had no connectivity since it expired. When the station performs its local
validation of the OfflinePass, check #2 (expiration) fails because the current
time (2026-02-13T10:30:05Z per the station's RTC) is past the `expiresAt`
timestamp. The station rejects the offline authentication with error code
**2003 OFFLINE_PASS_EXPIRED**.

## Timeline

| Time | Event |
|------|-------|
| 10:30:00.000 | Alice opens the app, selects Bay 1, svc_eco |
| 10:30:01.000 | App initiates BLE scan, discovers SSP-3000 |
| 10:30:02.000 | App reads BLE characteristic FFF1 (station info + connectivity) |
| 10:30:03.000 | App sends HELLO, station responds with Challenge |
| 10:30:05.000 | App confirms biometric (FaceID), constructs OfflineAuthRequest |
| 10:30:06.000 | App sends OfflineAuthRequest with expired OfflinePass |
| 10:30:08.000 | Station validates OfflinePass -- check #2 fails (expired) |
| 10:30:09.000 | Station sends AuthResponse (Rejected, OFFLINE_PASS_EXPIRED) |
| 10:30:10.000 | App displays error message |
| 10:30:11.000 | App disconnects BLE |
| 10:30:12.000 | App prompts user to find internet connectivity |

## Complete Message Sequence

### 1. App reads BLE Characteristic FFF1 (Station Info)

**BLE Service:** OSPP Primary Service (UUID: `0000FFF0-0000-1000-8000-00805F9B34FB`)
**Characteristic:** FFF1 (Station Info, READ)

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "2.4.1",
  "bayCount": 3,
  "bleProtocolVersion": "0.1.0",
  "connectivity": "Offline"
}
```

### 2. App -> Station: Hello (BLE Write to FFF3)

**BLE Characteristic:** FFF3 (Auth Channel, WRITE)

```json
{
  "type": "Hello",
  "deviceId": "device_a8f3bc12e4567890",
  "appNonce": "k7Rz2mPqXvN8dF5sYwB1cA0hJ6tL9oKe3iGnUxMpWbQ=",
  "appVersion": "1.8.0"
}
```

### 3. Station -> App: Challenge (BLE Notify on FFF4)

**BLE Characteristic:** FFF4 (Auth Response, NOTIFY)

```json
{
  "type": "Challenge",
  "stationNonce": "Qm4xR9vTfH2wLpZjK0sNcYgX5uOdA8rE1iBn6CtJkWe=",
  "stationConnectivity": "Offline",
  "availableServices": [
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_eco", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_standard", "available": true },
    { "bayId": "bay_c1d2e3f4a5b6", "serviceId": "svc_deluxe", "available": true }
  ]
}
```

### 4. App -> Station: OfflineAuthRequest (BLE Write to FFF3)

The app constructs the offline auth request using the stored (expired) OfflinePass.
The `expiresAt` field clearly shows the pass expired over 24 hours ago.

**BLE Characteristic:** FFF3 (Auth Channel, WRITE)

```json
{
  "type": "OfflineAuthRequest",
  "offlinePass": {
    "passId": "opass_b1c2d3e4f5a6",
    "sub": "sub_alice2026",
    "deviceId": "device_a8f3bc12e4567890",
    "issuedAt": "2026-02-11T10:00:00.000Z",
    "expiresAt": "2026-02-12T10:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30,
      "allowedServiceTypes": ["svc_eco", "svc_standard", "svc_deluxe"]
    },
    "constraints": {
      "minIntervalSec": 60,
      "stationOfflineWindowHours": 72,
      "stationMaxOfflineTx": 100
    },
    "signature": "V2hYcE9wR3FkN21MbjZzWnRKdUF4Q2JrRjVlUmlXZ0g4VTNQYW9EeUtsTXZCOXdmMGpBaFRjSWxFcDNyTnlPZA==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "counter": 3,
  "sessionProof": "dG1SZ1VXMXB5THNrQWZKZU9jTmhCNndiRHhpWnZLcTk="
}
```

### 5. Station: Local Validation of OfflinePass

The station performs the following validation checks on the OfflinePass:

```
OfflinePass Validation:
  Check #1 - Signature verification:    PASS
    Verified ES256 signature against server's public key.
  Check #2 - Expiration check:          FAIL
    expiresAt:  2026-02-12T10:00:00.000Z
    now (RTC):  2026-02-13T10:30:08.000Z
    Delta:      +24h 30m 08s (expired)
  Check #3 - Station ID match:          SKIPPED (prior check failed)
  Check #4 - Remaining credits:         SKIPPED (prior check failed)
  Check #5 - Service authorization:     SKIPPED (prior check failed)

Result: REJECTED (check #2 failed — offline pass expired)
```

### 6. Station -> App: AuthResponse (BLE Notify on FFF4)

**BLE Characteristic:** FFF4 (Auth Response, NOTIFY)

```json
{
  "type": "AuthResponse",
  "result": "Rejected",
  "reason": "OFFLINE_PASS_EXPIRED",
  "errorCode": 2003
}
```

### 7. App: BLE Disconnection

After receiving the rejection, the app gracefully disconnects:

```
BLE State Transition: READY -> DISCONNECTING -> DISCONNECTED
Disconnect reason: auth_rejected (OFFLINE_PASS_EXPIRED)
Connection duration: ~10 seconds
```

## What the User Sees

### Alice (Mobile App)

The app's session start flow is interrupted. A modal error screen appears:

> **Offline pass expired**
> Your offline pass has expired. Connect to the internet to obtain a new one.
>
> Expired at: 12 Feb 2026, 12:00
> Now: 13 Feb 2026, 12:30
>
> [Close]

After dismissing the modal, the app returns to the bay selection screen. The
offline indicator in the status bar shows a red "Offline" badge. A subtle banner
at the top suggests:

> Connect to Wi-Fi or mobile data to renew your offline pass.

## Recovery

1. **Immediate option -- find connectivity:** Alice walks to an area with Wi-Fi or
   cellular signal. The app's ConnectivityDetector detects the network change and
   automatically triggers a background refresh of the OfflinePass.

2. **OfflinePass refresh flow:** Once online, the app calls
   `POST /api/offline-pass/refresh`:

   ```json
   {
     "userId": "sub_alice2026",
     "stationId": "stn_a1b2c3d4",
     "expiredPassId": "opass_b1c2d3e4f5a6"
   }
   ```

   The server issues a new OfflinePass with a fresh 24-hour validity window:

   ```json
   {
     "passId": "opass_c3d4e5f6a7b8",
     "userId": "sub_alice2026",
     "stationId": "stn_a1b2c3d4",
     "issuedAt": "2026-02-13T10:35:00.000Z",
     "expiresAt": "2026-02-14T10:35:00.000Z",
     "maxCredits": 100,
     "remainingCredits": 100,
     "allowedServices": ["svc_eco", "svc_standard", "svc_deluxe"],
     "signature": "eyJhbGciOiJFUzI1NiJ9.new_offlinepass_payload_signature_base64url",
     "attestationToken": "device_attestation_token_base64"
   }
   ```

3. **Retry offline session:** Alice returns to the station and the app uses the new
   OfflinePass to successfully complete BLE authentication.

4. **Prevention -- background pre-arming:** The app's BackgroundPreArmingService
   periodically checks OfflinePass expiration and refreshes it proactively when
   connectivity is available, reducing the chance of this scenario occurring.

5. **Prevention -- expiration warning:** The app shows a notification 2 hours
   before the OfflinePass expires (if the app is in the foreground), prompting Alice
   to refresh while she still has connectivity.
