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

Alice's OfflinePass was issued on 2026-02-11 and expired at 2026-02-12T10:00:00.000Z:
its `expiresAt` is `issuedAt` plus the platform pass lifetime, which this example platform
sets to one day — the default is three days, and never more than ten
([`offline-pass.md` §6](../../spec/profiles/offline/offline-pass.md#6-lifecycle)).
The app could not re-issue the pass because Alice has had no connectivity since before it
expired. When the station performs its local validation of the OfflinePass, check #2
(temporal bounds) fails because the current time (2026-02-13T10:30:05.000Z per the
station's RTC) is past the `expiresAt` timestamp. The station rejects the offline
authentication with error code **2003 OFFLINE_PASS_EXPIRED**. The other bound of check #2,
the pass's age against the station's own `OfflinePassMaxAge`, is not what fails: at its default of 864000
seconds (ten days) it is inert, and an operator arms it by lowering it
([`08-configuration.md` §5](../../spec/08-configuration.md#5-offline--ble-configuration-keys)).

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
  "bleProtocolVersion": "0.2.1",
  "connectivity": "Offline"
}
```

### 2. App -> Station: Hello (BLE Write to FFF3)

**BLE Characteristic:** FFF3 (Auth Channel, WRITE)

```json
{
  "type": "Hello",
  "deviceId": "device_a8f3bc12e4567890",
  "appNonce": "M8MZRxjMBBxLhQ6vT0764RNX9V9CJcmayPBQgXVsH88=",
  "appVersion": "1.8.0"
}
```

### 3. Station -> App: Challenge (BLE Notify on FFF4)

**BLE Characteristic:** FFF4 (Auth Response, NOTIFY)

```json
{
  "type": "Challenge",
  "stationNonce": "WmplP7lhWDDjNoOR711wziZf41PUY1my5fMgfCebSw8=",
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
The `expiresAt` field clearly shows the pass expired more than a day ago.

**BLE Characteristic:** FFF3 (Auth Channel, WRITE)

```json
{
  "type": "OfflineAuthRequest",
  "offlinePass": {
    "passId": "opass_b1c2d3e4f5a6",
    "sub": "sub_alice2026",
    "deviceId": "device_a8f3bc12e4567890",
    "devicePublicKey": "A0xX3DTR7Imb4hzGyaH1WyUX/5U/CIghk7B/cZV11KFi",
    "keyId": "YjX5pR0TzmU3ubs17wImQQ",
    "issuedAt": "2026-02-11T10:00:00.000Z",
    "expiresAt": "2026-02-12T10:00:00.000Z",
    "policyVersion": 1,
    "revocationEpoch": 42,
    "offlineAllowance": {
      "maxTotalCredits": 100,
      "maxUses": 5,
      "maxCreditsPerTx": 30
    },
    "constraints": {
      "minIntervalSec": 60
    },
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEUCIQD9u+aV3D9r6ffR8hfxt/L2uDkqJ239oI4l2eXBqezwcwIgVs9Dz0M5iXmPg3hfKVXu60so5UcFsG0ispLJh22Kc3g="
  },
  "counter": 3,
  "sessionProof": "EtKD75H71pKdOC5mrEsIAS7a04p7oQzRcdNZv/G0uPA="
}
```

### 5. Station: Local Validation of OfflinePass

The station performs the nine checks that apply
([`06-security.md` §6.1.1](../../spec/06-security.md#611-offlinepass-validation--10-checks)),
stopping at the first failure:

```
OfflinePass Validation:
  Check #1 - Signature verification:    PASS
    Verified ECDSA P-256 signature with the server key named by keyId (YjX5pR0TzmU3ubs17wImQQ).
  Check #2 - Temporal bounds:           FAIL
    expiresAt:  2026-02-12T10:00:00.000Z
    now (RTC):  2026-02-13T10:30:08.000Z
    Delta:      +24h 30m 08s (expired)
  Check #3 - Revocation epoch:          SKIPPED (prior check failed)
  Check #4 - Device binding:            SKIPPED (prior check failed)
  Check #5 - (withdrawn)
  Checks #6-#10:                        SKIPPED (prior check failed)

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
   cellular signal. The app's ConnectivityDetector detects the network change,
   uploads the receipts it holds, and requests a new OfflinePass.

2. **Pass issuance:** Once online, the app calls `POST /api/v1/offline/passes`
   ([`app-contract.md` §3](../../spec/profiles/offline/app-contract.md#3-pass-issuance))
   with its device identifier and the public key of its hardware-backed device key,
   the same key for every pass it requests on this phone — the server verified the
   platform's attestation of that key with the first of them
   ([`app-contract.md` §3.6](../../spec/profiles/offline/app-contract.md#36-device-key-attestation)):

   ```json
   {
     "deviceId": "device_a8f3bc12e4567890",
     "devicePublicKey": "A0xX3DTR7Imb4hzGyaH1WyUX/5U/CIghk7B/cZV11KFi"
   }
   ```

   The server answers with a new `offlinePass`, valid for one platform lifetime from its
   issue, and the `trustBundle` the app keeps in place of the one it held
   ([`app-contract.md` §3.4](../../spec/profiles/offline/app-contract.md#34-the-trust-bundle));
   [`offline-pass-issuance.response.json`](../payloads/http/offline-pass-issuance.response.json)
   shows the shape of that response.

3. **Retry offline session:** Alice returns to the station and the app uses the new
   OfflinePass to successfully complete BLE authentication.

4. **Prevention -- re-issuance and pre-arming:** Whenever it has connectivity, the app
   uploads the receipts it holds and requests a fresh pass at application start, after each use
   of the pass and after each top-up ([`offline-pass.md` §6](../../spec/profiles/offline/offline-pass.md#6-lifecycle)),
   and its BackgroundPreArmingService requests one before the current pass
   expires, reducing the chance of this scenario occurring.

5. **Prevention -- expiration warning:** The app shows a notification 2 hours
   before the OfflinePass expires (if the app is in the foreground), prompting Alice
   to refresh while she still has connectivity.
