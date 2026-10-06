# Flow 04: Full Offline BLE Session

## Scenario

It is a winter evening in Example City. Heavy snowfall has knocked out the internet at "Station Alpha -- Example City" and Bob's mobile carrier is also down in the area. Bob pulls into bay 1 and wants to use the Eco Program service. He opens the the app, which detects no internet connectivity. The app has a pre-armed OfflinePass (`opass_a8b9c0d1e2f3`) that was refreshed this morning while Bob was on WiFi. The app discovers the station via BLE, connects, reads station info and asks for the service catalog, performs the HELLO/CHALLENGE handshake — verifying the station's certificate and signature before it sends anything — authenticates with the OfflinePass and its device proof (the station validates it locally with the nine checks that apply), starts "Eco Program" on bay 1, monitors progress via BLE ServiceStatus notifications, and stops after 3 minutes. The station generates a signed receipt with ECDSA P-256 and increments the txCounter. The app asks for the receipt on FFF6 and stores it in the offline transaction log, to upload it to the server once it has a network.

## Participants

| Actor | Identity |
|-------|----------|
| User | Bob (`sub_bob2026`), device `device_b7c4de89f0123456` |
| App | the mobile app (React Native / Expo), version 2.1.0 |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp (BLE advertising, MQTT disconnected) |
| Bay | `bay_c1d2e3f4a5b6` (Bay 1) |
| Service | `svc_eco` (Eco Program, 10 credits/min, metered) |

## Pre-conditions

- Bob has a valid OfflinePass `opass_a8b9c0d1e2f3` in the app, issued at 06:00 UTC today. It expires tomorrow because this example platform sets its pass lifetime to one day; the default is three days, and never more than ten ([`offline-pass.md` §6](../../spec/profiles/offline/offline-pass.md#6-lifecycle))
- OfflinePass allowance: 100 credits total, 5 max uses, 30 credits max per transaction
- Bob's OfflinePass counter is at 2 (he has done 2 previous offline sessions)
- Station BLE is advertising the OSPP service UUID, with the name `OSPP-b2c3d4` (last 6 hex chars of station ID) in its scan response
- Station holds its mTLS certificate, whose extended key usage carries `clientAuth` and `id-kp-osppBleStation`; the app holds the trust bundle of its last pass issuance — the Station CA set, each CA with its CRL ([`app-contract.md` §3.4](../../spec/profiles/offline/app-contract.md#34-the-trust-bundle))
- Station holds the server key set (`OfflinePassPublicKey`) in NVS, including the key the pass's `keyId` names
- Station `OfflineModeEnabled` configuration is `true`
- Station is within its own offline limits: it holds 7 offline transactions the server has not yet answered `Accepted`, `Duplicate` or `Rejected`, well under its `OfflineTransactionLimit` (1000), and it has been offline for far less than its `OfflineWindowHours` (240). Both are station configuration, not pass fields ([`08-configuration.md` §5](../../spec/08-configuration.md#5-offline--ble-configuration-keys))
- Station holds the platform `RevocationEpoch` 42 (matches the pass)
- Station clock is synchronized to within 5 seconds (last synced before internet dropped)
- Neither the phone nor the station has internet connectivity

## Timeline

```
18:32:00.000  Bob opens the app, sees "Offline Mode" banner
18:32:03.000  App starts BLE scan, discovers OSPP-b2c3d4
18:32:04.500  App establishes BLE connection to station
18:32:05.000  App reads FFF1 (StationInfo) — shows which station it reached
18:32:05.500  App asks for AvailableServices on FFF2 — displays service catalog
18:32:12.000  Bob selects Bay 1, Eco Program, 3 min duration
18:32:12.200  App requests biometric confirmation (Face ID), before the Hello
18:32:12.500  App writes Hello to FFF3
18:32:13.000  Station notifies Challenge on FFF4 (stationConnectivity: "Offline")
18:32:13.200  App verifies the station's certificate, its signature and the catalog's digest, derives session key
18:32:15.000  App writes OfflineAuthRequest to FFF3 with OfflinePass
18:32:15.500  Station performs the nine OfflinePass checks — all pass
18:32:16.000  Station notifies AuthResponse Accepted on FFF4
18:32:16.500  App writes StartServiceRequest to FFF3
18:32:17.000  Station activates dispenser, notifies StartServiceResponse Accepted on FFF4
18:32:20.000  Station notifies ServiceStatus Running on FFF5 (3s elapsed)
18:33:17.000  Station notifies ServiceStatus Running on FFF5 (60s elapsed)
18:34:17.000  Station notifies ServiceStatus Running on FFF5 (120s elapsed)
18:35:17.000  Timer expires — station stops the dispenser itself, ending the session with TimerExpired
18:35:17.500  Bob taps "Stop service" in the app
18:35:18.000  App writes StopServiceRequest to FFF3
18:35:18.500  Station notifies StopServiceResponse Rejected 3006 on FFF4 — the session has already ended
18:35:19.000  Station generates ECDSA-signed receipt, increments txCounter
18:35:19.500  Station notifies ServiceStatus ReceiptReady on FFF5
18:35:20.000  App writes ReceiptRequest to FFF6; station notifies ReceiptResponse — receipt stored in offline transaction log
18:35:20.500  App disconnects BLE
18:35:21.000  App displays session summary to Bob
```

## Step-by-Step Detail

---

### Step 1: Bob Opens the App (18:32:00.000)

**What Bob sees:**

The app opens to the HomeScreen. A yellow banner at the top reads "Offline mode — no connection". Below the banner, the app shows "OfflinePass active" with a green checkmark and the expiration: "Valid until 14 Feb 2026, 06:00". The "Connect BLE" button pulses blue.

---

### Step 2: BLE Discovery (18:32:03.000)

The app starts scanning for BLE devices advertising the OSPP service UUID (`6645FFF0-5AEB-4709-ACD5-02E03C3000F6`). It discovers a device whose scan response names it `OSPP-b2c3d4`, with RSSI -42 dBm (very close range, as expected at a service bay).

---

### Step 3: BLE Connection Established (18:32:04.500)

The app connects to the station over BLE. The BLE connection state transitions: `SCANNING` -> `DISCOVERED` -> `CONNECTING` -> `CONNECTED`.

---

### Step 4: Read StationInfo from FFF1 (18:32:05.000)

**BLE GATT Read:** Characteristic `6645FFF1-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "2.4.1",
  "connectivity": "Offline"
}
```

The app shows Bob which station it reached. Nothing on FFF1 is authenticated, so the app relies on none of it ([`ble-transport.md` §3](../../spec/profiles/offline/ble-transport.md#3-station-info-fff1)): the station's identity is the certificate in its Challenge (Step 8), its connectivity is the Challenge's `stationConnectivity`, and the BLE version is the one the handshake negotiates.

---

### Step 5: Ask for AvailableServices on FFF2 (18:32:05.500)

**BLE GATT Write, then Notify:** Characteristic `6645FFF2-5AEB-4709-ACD5-02E03C3000F6` — the app writes the octet `0x01`, and the station notifies the catalog it holds

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
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "bayNumber": 2,
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

**What Bob sees:**

The app displays two bay cards with their services and prices. Whether a bay can start now is not in the catalog: the station says so in its signed Challenge, which the app checks before it sends anything (Step 9). Under Bay 1, Bob sees "Eco Program (10 credits/min)" and "Standard Program (8 credits/min)". Before he chooses, the app shows the pass's limits, as it must ([`offline-pass.md` §2.1](../../spec/profiles/offline/offline-pass.md#21-offlineallowance-object)): 30 credits per session, 80 of 100 credits remaining, 3 of 5 uses remaining. He taps Bay 1, then selects "Eco Program". A duration picker appears, bounded at 3 minutes: the pass the app is already holding carries `offlineAllowance.maxCreditsPerTx` (30) in plaintext, so the app can read the limit and shape its offer to fit **before** it asks the station for anything — a request above a limit would be refused, never reduced. He sets it to 3 minutes (30 credits). The app shows: "Estimated cost: 30 credits. Estimated offline balance: 72 credits."

---

### Step 6: Biometric Confirmation (18:32:12.200)

**What Bob sees:**

The app displays a biometric prompt:

> **Confirm offline payment**
> Eco Program - Bay 1
> Estimated: 30 credits (3 min)
> [Authenticate with Face ID]

Bob looks at his phone. Face ID succeeds, before the Hello, so that the wait for Bob runs outside the 10-second handshake budget; the app holds the confirmation for the OfflinePass it sends inside the handshake ([`04-flows.md` §5a](../../spec/04-flows.md#5a-full-offline-session--ble)).

---

### Step 7: App Writes Hello to FFF3 (18:32:12.500)

**BLE GATT Write:** Characteristic `6645FFF3-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "type": "Hello",
  "bleVersions": [
    "0.3.0"
  ],
  "appNonce": "sH5WmIMfOYRb4zfrKESykXKz0UF5XR5HgU/iKijUAUg=",
  "appVersion": "2.1.0",
  "appEphemeralPubKey": "AkzXOgSZV4SKrkhel3uH6UuVAlKqYBC4AHp9DjEhdyZa"
}
```

The app generates a fresh ephemeral P-256 key pair and a cryptographically random 32-byte nonce (`appNonce`) for this handshake, and lists the BLE versions it supports. Nothing in the Hello identifies Bob or his phone: any radio in range can read it ([`06-security.md` T14](../../spec/06-security.md#t14---ble-presence-tracking)).

---

### Step 8: Station Notifies Challenge on FFF4 (18:32:13.000)

**BLE GATT Notify:** Characteristic `6645FFF4-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "type": "Challenge",
  "bleVersion": "0.3.0",
  "stationNonce": "nl+FBpL/lU0181wqYJgSi8QFcbi5ZZMRz0XrZhPUpvw=",
  "stationEphemeralPubKey": "A3QJ54K3U/UO3me2bm9t7v7KXx+WcEwQyJaoPrO82cA2",
  "stationCertificate": "MIICFzCCAb6gAwIBAgICCgEwCgYIKoZIzj0EAwIwMzESMBAGA1UECgwJT1NQUCBUZXN0MR0wGwYDVQQDDBRPU1BQIFRlc3QgU3RhdGlvbiBDQTAeFw0yNjAxMDEwMDAwMDBaFw0yNjEyMzEyMzU5NTlaMCsxEjAQBgNVBAoMCU9TUFAgVGVzdDEVMBMGA1UEAwwMc3RuX2ExYjJjM2Q0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvW5xVrFUPqbSVgurekEFGU2vEdAnOKiJzzxcmZca3/sbE4e/85+t+d3uIbRGsrihNUJo/HPf/t6YnM1w8yTbcKOByTCBxjAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIHgDAoBgNVHSUEITAfBggrBgEFBQcDAgYTadau1fTCl9KOm5GCxfv1z/qsYzA8BgNVHR8ENTAzMDGgL6AthitodHRwOi8vY3JsLm9zcHAtdGVzdC5pbnZhbGlkL3N0YXRpb24tY2EuY3JsMB0GA1UdDgQWBBQesPd2I89FqUwav1HnI6MMFu/wPjAfBgNVHSMEGDAWgBQXxwEaDwCqARDb92VgH180MkvGWDAKBggqhkjOPQQDAgNHADBEAiB/ntacff4AkpoCFeG36be3OPq/SnS36Yx4J0+xyD6S1wIgT2Cr612Wv5BpWdeXae80hgOpvRPvcZ9UQCs41T2eFSI=",
  "stationConnectivity": "Offline",
  "availableServices": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_eco",
      "available": true
    },
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_standard",
      "available": true
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "serviceId": "svc_eco",
      "available": true
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "serviceId": "svc_standard",
      "available": true
    }
  ],
  "catalogDigest": "kR7SmaHNzwk56QSIJYzA+wXMZcQqUgLRHH2/fZ3SUfk=",
  "stationSignature": "MEQCIBor51eIOuysLqXjSwvkd6XVbFmzGNWBBjZ8nk2tCHgYAiA6rjZr0hnYrhFX0tLvN5r0kJsiN/TAfJZGWacB3fGXMA=="
}
```

The station chooses BLE version `0.3.0` from the Hello's list, generates its own ephemeral key pair and 32-byte random nonce, presents its mTLS certificate, and signs the Hello it received and this Challenge with the certificate's key ([`06-security.md` §6.5.2](../../spec/06-security.md#652-station-authentication--the-stations-certificate)). The `stationConnectivity: "Offline"` confirms that the app must use the OfflineAuthRequest flow (not ServerSignedAuth), and `availableServices` says what each bay can start now.

---

### Step 9: Station Verification and Session Key Derivation (18:32:13.200)

Before it derives any key, and before Bob's pass can leave the phone, the app verifies the station ([`06-security.md` §6.5.2](../../spec/06-security.md#652-station-authentication--the-stations-certificate)): the certificate chains to a Station CA of its trust bundle, is valid now, and is on no entry of that CA's CRL; it carries `digitalSignature` and `id-kp-osppBleStation`; its subject CN, `stn_a1b2c3d4`, is the station Bob is standing at; and `stationSignature` verifies under its key. It also confirms that the catalog Bob chose from is the one the Challenge's `catalogDigest` names, and that Eco Program is available on Bay 1 in `availableServices`. Had the certificate or the signature failed, the app would have aborted with `2013 BLE_AUTH_FAILED` and sent nothing; had the digest differed, it would have sent nothing, closed the connection and read FFF2 again on a new one ([`ble-handshake.md` §3](../../spec/profiles/offline/ble-handshake.md#3-step-2-challenge)).

Both the app and station then derive the BLE session key using HKDF-SHA256 over the one ECDH secret of the two ephemeral keys (the BLE LTK is **not** used — see `spec/06-security.md` §6.5):

```
SessionKey = HKDF-SHA256(
  ikm   = ee ‖ appNonce ‖ stationNonce,   // ee = ECDH(appEphemeral, stationEphemeral)
  salt  = "OSPP_BLE_SESSION_V3",
  info  = LP(transcriptHash),             // LP(x)=U16BE(len)‖x; the transcript covers the certificate and the signature
  length = 32
)
```

This produces a 32-byte symmetric key used for the `sessionProof` HMAC in the next step, for the `sessionKeyConfirmation` in the AuthResponse, and to expand the per-direction AEAD keys that encrypt every post-Challenge message.

---

### Step 10: App Writes OfflineAuthRequest to FFF3 (18:32:15.000)

**BLE GATT Write:** Characteristic `6645FFF3-5AEB-4709-ACD5-02E03C3000F6`, inside the AEAD channel

```json
{
  "type": "OfflineAuthRequest",
  "offlinePass": {
    "passId": "opass_a8b9c0d1e2f3",
    "sub": "sub_bob2026",
    "deviceId": "device_b7c4de89f0123456",
    "devicePublicKey": "A/h6jULcl8Sq6+dJE1aS5RFXBrrbdfl8odxzkH3y2CuW",
    "keyId": "YjX5pR0TzmU3ubs17wImQQ",
    "issuedAt": "2026-02-13T06:00:00.000Z",
    "expiresAt": "2026-02-14T06:00:00.000Z",
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
    "signature": "MEQCIG2bOeuUibBTP/iHL+5rR9Nmea9zVnY7Co6/Hq+91rR3AiAn0pFVBCXzdNnPR9ndho4b3iMLsemDrWLs+pLUc4TKPw=="
  },
  "counter": 3,
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 180,
  "sessionProof": "hAW4BhA445dJmlLG78qcEn36DHEhkjIDNt3fZOGGh0c=",
  "deviceProof": {
    "format": "apple-appattest",
    "signature": "MEUCIQCXpmgaeY3ujRhhS8bK74783dxeU/Z1tfiWwpW6KQ9tAwIgBp8RW5evYXI7f91yiJMFxcLf88BEW6lL+FcqRvGSCvc=",
    "authenticatorData": "bR2vgjWJbHy80iqDVEPONZjpIUj6ilROZ2f2ESHQEDAAAAAAAQ=="
  }
}
```

Key fields:
- `counter: 3` -- monotonically increasing, this is Bob's 3rd offline session with this pass
- `bayId`, `serviceId`, `requestedDurationSeconds` -- what Bob chose, from which the station estimates the cost
- `sessionProof` -- HMAC over the session parameters using the derived session key, binding this request to the BLE handshake
- `deviceProof` -- Bob's iPhone proves it holds the pass's device key, its App Attest key, with an assertion over this handshake's transcript, the station's identity, the pass, the counter and the request ([`06-security.md` §6.5.4](../../spec/06-security.md#654-device-proof-of-possession))

---

### Step 11: Station Validates OfflinePass - Nine Checks (18:32:15.500)

The station performs the nine checks that apply, in order, stopping at the first failure. The list has ten numbered checks and #5 is withdrawn ([`06-security.md` §6.1.1](../../spec/06-security.md#611-offlinepass-validation--10-checks)):

| # | Check | Input | Result |
|--:|-------|-------|--------|
| 1 | ECDSA P-256 signature valid | `signature` verified with the key of the station's server key set named by the pass's `keyId` (`YjX5pR0TzmU3ubs17wImQQ`) | PASS |
| 2 | Within its temporal bounds | `expiresAt` (2026-02-14T06:00:00.000Z) > station clock (2026-02-13T18:32:15.000Z), and the pass's age (12 h 32 min) is within the station's `OfflinePassMaxAge` (864000 s) | PASS |
| 3 | Revocation epoch valid | Pass `revocationEpoch` (42) >= the platform `RevocationEpoch` the station holds (42) | PASS |
| 4 | Device proof | `deviceProof` verifies under the pass's `devicePublicKey` over this handshake's transcript, the station's identity, the pass, the counter and the request | PASS |
| 5 | *(withdrawn)* | A pass carries no station or organization scope ([`offline-pass.md` §2.3](../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)); the number is not reused | — |
| 6 | Max uses not exceeded | Uses already counted (2) < `maxUses` (5) | PASS |
| 7 | Max total credits not exceeded | Credits already counted (20) + this transaction's estimated cost (30) = 50, not above `maxTotalCredits` (100) | PASS |
| 8 | Max credits per tx ok | Estimated cost for the requested 3 minutes (30 credits) does not exceed `maxCreditsPerTx` (30) | PASS |
| 9 | Min interval elapsed | Last tx from this pass was >60s ago (last was hours ago) | PASS |
| 10 | Counter anti-replay | `counter` (3) > station's `lastSeenCounter` for this pass (2) | PASS |

All nine checks pass, and the station is within its own offline limits (see Pre-conditions). The station:
1. Updates `lastSeenCounter` for `opass_a8b9c0d1e2f3` to 3
2. Authorizes the session as requested — 3 minutes, 30 credits at 10 credits/min

---

### Step 12: Station Notifies AuthResponse Accepted on FFF4 (18:32:16.000)

**BLE GATT Notify:** Characteristic `6645FFF4-5AEB-4709-ACD5-02E03C3000F6`, inside the AEAD channel

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "uo31nIXlLPNLPc8rCOeJWYwbDh/ycVRE692174J5jp0="
}
```

The `sessionKeyConfirmation` is an HMAC computed by the station using the same derived session key. The app verifies it matches its own computation, confirming both sides share the same key. The BLE connection state transitions: `HANDSHAKE` -> `READY`.

**What Bob sees:**

A green checkmark animation and "Authentication successful" (Authentication successful).

---

### Step 13: App Writes StartServiceRequest to FFF3 (18:32:16.500)

Note: the request is for 180 s — 30 credits at 10 credits/min, exactly `maxCreditsPerTx`. The app sized it from the pass before asking. Had its OfflineAuthRequest asked for 300 s, check #8 would have **rejected** the pass with `4004 OFFLINE_PER_TX_EXCEEDED` ([`offline-pass.md` §4](../../spec/profiles/offline/offline-pass.md) check #8); the station does not reduce an over-limit request to fit.

**BLE GATT Write:** Characteristic `6645FFF3-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 180
}
```

---

### Step 14: Station Notifies StartServiceResponse on FFF4 (18:32:17.000)

The station controller:
1. Validates bay 1 is Available
2. Authorizes the requested 180 seconds unchanged — check #8 already established that the estimated cost is within `maxCreditsPerTx`, so there is nothing to reduce
3. Activates the dispenser relay on bay 1
4. Starts the 180-second session timer
5. Assigns a local session ID and offline transaction ID

**BLE GATT Notify:** Characteristic `6645FFF4-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_a8b9c0d1e2f3",
  "offlineTxId": "otx_a3b4c5d6e7f8d5fa9b53cfa58cb91fa5"
}
```

**What Bob sees:**

The app transitions to the SessionActiveScreen. A large timer shows "3:00" — the duration Bob asked for, authorized as asked. A note reads: "Offline session (limit: 30 credits)". The service icon pulses. A red "Stop service" button is visible at the bottom.

---

### Step 15: Station Sends ServiceStatus Updates on FFF5 (periodic)

The station sends periodic status updates via BLE notifications on FFF5.

**At 18:32:20.000 (3 seconds elapsed):**

**BLE GATT Notify:** Characteristic `6645FFF5-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 3,
  "remainingSeconds": 177,
  "meterValues": {
    "liquidMl": 550,
    "consumableMl": 15
  }
}
```

**At 18:33:17.000 (60 seconds elapsed):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 60,
  "remainingSeconds": 120,
  "meterValues": {
    "liquidMl": 11200,
    "consumableMl": 125
  }
}
```

**At 18:34:17.000 (120 seconds elapsed):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 120,
  "remainingSeconds": 60,
  "meterValues": {
    "liquidMl": 22100,
    "consumableMl": 250
  }
}
```

**At 18:35:17.000 (180 seconds elapsed):**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 180,
  "remainingSeconds": 0,
  "meterValues": {
    "liquidMl": 33400,
    "consumableMl": 375
  }
}
```

**What Bob sees:**

The timer counts down: 2:57... 2:00... 1:00... 0:00. The water and chemical consumption updates in real time. At 1:00 remaining, the timer turns yellow. At 0:10, it turns red with a pulsing animation.

---

### Step 16: Bob Stops the Session (18:35:17.500)

At the 3-minute mark the timer has hit zero. Bob sees the car is clean and taps "Stop service". (The timer has already expired and the station has stopped the service itself; Bob's tap reaches a session that has ended, which the next two steps show.)

**What Bob sees:**

A confirmation dialog appears:

> **Stop service?**
> Duration: ~3m 0s. Credits calculated at stop.
> [Cancel] [Stop]

Bob taps "Stop".

---

### Step 17: App Writes StopServiceRequest to FFF3 (18:35:18.000)

**BLE GATT Write:** Characteristic `6645FFF3-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "type": "StopServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "sessionId": "sess_a8b9c0d1e2f3"
}
```

---

### Step 18: Station Answers the Late Stop (18:35:18.500)

The station stopped the dispenser itself at the 180-second mark (the authorized duration), and that auto-stop ended the session with `TimerExpired` ([`ble-session.md` §3](../../spec/profiles/offline/ble-session.md#3-stopping-a-service)). At 18:35:17.000 the station controller:

1. Turned the pump relay off
2. Read the final meter values from the sensors
3. Recorded `actualDurationSeconds: 180` (the pump ran for exactly the authorized 180 seconds)
4. Calculated credits: `ceil(180 / 60 * 10) = 30 credits` (within `maxCreditsPerTx` of 30)

The StopServiceRequest that arrives at 18:35:18.000 names a session that is no longer active, so the station answers `Rejected` with `3006 SESSION_NOT_FOUND` (rule 5 of the same section), and the app moves on to the receipt.

**BLE GATT Notify:** Characteristic `6645FFF4-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "type": "StopServiceResponse",
  "result": "Rejected",
  "errorCode": 3006,
  "errorText": "SESSION_NOT_FOUND"
}
```

---

### Step 19: Station Generates Signed Receipt (18:35:19.000)

The station performs the following cryptographic operations:

**1. Serialize the receipt fields.** The station serializes the pass-form `receipt_fields` of [`06-security.md` §6.2](../../spec/06-security.md#62-transaction-receipt-signing--ecdsa-p-256) in the OSPP Canonical Form: `offlineTxId`, `offlinePassId`, `passCounter`, `userId`, `deviceId`, `stationId`, `bayId`, `serviceId`, `startedAt`, `endedAt`, `durationSeconds`, `bookedDurationSeconds`, `endReason`, `clockState`, `creditsCharged`, `meterValues` and `txCounter`. Four of them are **signed only**: they appear in no envelope, neither the FFF6 Receipt's nor the TransactionEvent's, and the server reads them from the signed body — `stationId` (`stn_a1b2c3d4`), `endReason` (`TimerExpired`: the service ran its booked time), `bookedDurationSeconds` (180) and `clockState` (`Synchronized`: the clock has been set from the server since the station last booted). `durationSeconds` (180) is measured on the station's monotonic timer.

**2. Base64-encode the canonical bytes.** The result is `receipt.data`, shown in Step 21.

**3. Sign with ECDSA P-256:**

```
digest = SHA-256(canonical bytes)   # the bytes receipt.data Base64-encodes, never the Base64 text
signature = ECDSA-P256-Sign(station_private_key, digest)
```

**4. Increment txCounter:**

```
txCounter:           8 (station's 8th offline transaction)
```

---

### Step 20: Station Notifies ServiceStatus ReceiptReady on FFF5 (18:35:19.500)

**BLE GATT Notify:** Characteristic `6645FFF5-5AEB-4709-ACD5-02E03C3000F6`

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_a8b9c0d1e2f3",
  "elapsedSeconds": 180,
  "remainingSeconds": 0
}
```

---

### Step 21: App Asks for the Receipt on FFF6 (18:35:20.000)

**BLE GATT Write:** Characteristic `6645FFF6-5AEB-4709-ACD5-02E03C3000F6`, inside the AEAD channel

```json
{
  "type": "ReceiptRequest",
  "offlineTxId": "otx_a3b4c5d6e7f8d5fa9b53cfa58cb91fa5"
}
```

**BLE GATT Notify:** Characteristic `6645FFF6-5AEB-4709-ACD5-02E03C3000F6` — a `ReceiptResponse` with `result: "Accepted"`, whose `receipt` is:

```json
{
  "offlineTxId": "otx_a3b4c5d6e7f8d5fa9b53cfa58cb91fa5",
  "offlinePassId": "opass_a8b9c0d1e2f3",
  "passCounter": 3,
  "userId": "sub_bob2026",
  "deviceId": "device_b7c4de89f0123456",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-02-13T18:32:17.000Z",
  "endedAt": "2026-02-13T18:35:17.000Z",
  "durationSeconds": 180,
  "creditsCharged": 30,
  "meterValues": {
    "liquidMl": 33400,
    "consumableMl": 375,
    "energyWh": 85
  },
  "receipt": {
    "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjE4MCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjozMCwiZGV2aWNlSWQiOiJkZXZpY2VfYjdjNGRlODlmMDEyMzQ1NiIsImR1cmF0aW9uU2Vjb25kcyI6MTgwLCJlbmRSZWFzb24iOiJUaW1lckV4cGlyZWQiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxODozNToxNy4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjozNzUsImVuZXJneVdoIjo4NSwibGlxdWlkTWwiOjMzNDAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2E4YjljMGQxZTJmMyIsIm9mZmxpbmVUeElkIjoib3R4X2EzYjRjNWQ2ZTdmOGQ1ZmE5YjUzY2ZhNThjYjkxZmE1IiwicGFzc0NvdW50ZXIiOjMsInNlcnZpY2VJZCI6InN2Y19lY28iLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDE4OjMyOjE3LjAwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjgsInVzZXJJZCI6InN1Yl9ib2IyMDI2In0=",
    "signature": "MEQCIEgxpigsbpm5jHIGBrljkN5jcgBnYHIpsllNrNWQaCjUAiAcZv6sqe28SGDBHBHF9e+03aUv5Kd9eR+v+YMV8u1IGA==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 8
}
```

The app:
1. Stores the complete receipt in the offline transaction log (`offlineTxLogStore`)
2. Updates the local OfflinePass usage: counter = 3, credits used = 20 + 30 = 50
3. Updates `walletStore.getEstimatedBalance`: previous estimated balance minus 30 credits
4. Keeps the receipt to upload as soon as it has connectivity, as it does every receipt it holds ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload))

---

### Step 22: App Disconnects BLE (18:35:20.500)

The app cleanly disconnects the BLE connection. The station's bay 1 transitions back to `Available` after the drain cycle completes.

---

### Step 23: App Displays Session Summary (18:35:21.000)

**What Bob sees:**

The app transitions to the SessionCompletedScreen:

```
+----------------------------------+
|      Offline service completed    |
|                                  |
|   Eco Program - Bay 1           |
|   Duration: 3m 0s                  |
|                                  |
|   Credits (station):    30       |
|   Estimated balance:    42       |
|                                  |
|   Liquid: 33.4L | Consumable: 375mL |
|                                  |
|   Receipt saved locally.        |
|   Will sync when connection      |
|   is restored.                   |
|                                  |
|          [Home]                   |
+----------------------------------+
```

---

### Step 24: Later — Reconciliation (when connectivity is restored)

When the station regains MQTT connectivity, it performs the reconciliation flow (Flow 10):

**Station sends TransactionEvent REQUEST:**

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "tx_m3n4o5p6-a1b2-c3d4-e5f6-g7h8i9j0k1l2",
  "messageType": "Request",
  "action": "TransactionEvent",
  "timestamp": "2026-02-14T08:15:00.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlineTxId": "otx_a3b4c5d6e7f8d5fa9b53cfa58cb91fa5",
    "offlinePassId": "opass_a8b9c0d1e2f3",
    "passCounter": 3,
    "userId": "sub_bob2026",
    "bayId": "bay_c1d2e3f4a5b6",
    "serviceId": "svc_eco",
    "startedAt": "2026-02-13T18:32:17.000Z",
    "endedAt": "2026-02-13T18:35:17.000Z",
    "durationSeconds": 180,
    "creditsCharged": 30,
    "receipt": {
      "data": "eyJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJib29rZWREdXJhdGlvblNlY29uZHMiOjE4MCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjozMCwiZGV2aWNlSWQiOiJkZXZpY2VfYjdjNGRlODlmMDEyMzQ1NiIsImR1cmF0aW9uU2Vjb25kcyI6MTgwLCJlbmRSZWFzb24iOiJUaW1lckV4cGlyZWQiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxODozNToxNy4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjozNzUsImVuZXJneVdoIjo4NSwibGlxdWlkTWwiOjMzNDAwfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2E4YjljMGQxZTJmMyIsIm9mZmxpbmVUeElkIjoib3R4X2EzYjRjNWQ2ZTdmOGQ1ZmE5YjUzY2ZhNThjYjkxZmE1IiwicGFzc0NvdW50ZXIiOjMsInNlcnZpY2VJZCI6InN2Y19lY28iLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDE4OjMyOjE3LjAwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjgsInVzZXJJZCI6InN1Yl9ib2IyMDI2In0=",
      "signature": "MEQCIEgxpigsbpm5jHIGBrljkN5jcgBnYHIpsllNrNWQaCjUAiAcZv6sqe28SGDBHBHF9e+03aUv5Kd9eR+v+YMV8u1IGA==",
      "signatureAlgorithm": "ECDSA-P256-SHA256"
    },
    "txCounter": 8,
    "meterValues": {
      "liquidMl": 33400,
      "consumableMl": 375,
      "energyWh": 85
    }
  }
}
```

**Server responds:**

```json
{
  "messageId": "tx_m3n4o5p6-a1b2-c3d4-e5f6-g7h8i9j0k1l2",
  "messageType": "Response",
  "action": "TransactionEvent",
  "timestamp": "2026-02-14T08:15:00.500Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted"
  }
}
```

The server, in the order of [`reconciliation.md` §2](../../spec/profiles/offline/reconciliation.md#2-sync-procedure):
1. Deduplicates by `offlineTxId` (`otx_a3b4c5d6e7f8d5fa9b53cfa58cb91fa5`). Whichever copy of a receipt arrives first — the station's TransactionEvent or the app's upload — may settle, and once one has settled the other is answered `Duplicate` ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload))
2. Verifies the receipt signature with the receipt-signing key of the station the signed receipt names (`stationId`)
3. Records txCounter 8 as forensic evidence (contiguous with the last known counter — noted, not gated on)
4. Applies the reconcile-time gate: the OfflinePass was valid at the transaction's signed `endedAt`, read through the station's clock offset ([`reconciliation.md` §6.8](../../spec/profiles/offline/reconciliation.md#68-station-clock-offset))
5. Settles: recomputes the cost from the signed receipt — 30 credits, not above `maxCreditsPerTx` (30) — and debits 30 credits from Bob's wallet
6. Scores the settled transaction for fraud ([`06-security.md` §7.4](../../spec/06-security.md#74-fraud-detection--offline-transactions)); the score is in the Normal band, so no `FraudDetected` record is written
7. Creates a session record
8. Responds `Accepted`

The station removes the transaction from its local queue.

## Message Sequence Diagram

```
  Bob(App)                           Station (stn_a1b2c3d4)
     |                                        |
     |  BLE scan → discover OSPP service UUID  |
     |                                        |
     |  BLE CONNECT                           |
     |--------------------------------------->|
     |                                        |
     |  Read FFF1 (StationInfo)               |
     |--------------------------------------->|
     |  {stationId, connectivity: "Offline"}  |
     |<---------------------------------------|
     |                                        |
     |  Write FFF2 0x01 (AvailableServices)   |
     |--------------------------------------->|
     |  Notify FFF2: {bays, services, prices} |
     |<---------------------------------------|
     |                                        |
     |  user selects Bay 1 + Eco Program     |
     |  biometric confirmation (Face ID)      |
     |                                        |
     |  Write FFF3: Hello                     |
     |--------------------------------------->|
     |  Notify FFF4: Challenge (offline,      |
     |    certificate, digest, signature)     |
     |<---------------------------------------|
     |                                        |
     |  verify certificate, signature, digest |
     |  derive session key (ECDH + HKDF)      |
     |                                        |
     |  Write FFF3: OfflineAuthRequest       |
     |--------------------------------------->|
     |                          nine-check validation
     |                          all checks PASS
     |  Notify FFF4: AuthResponse (Accepted) |
     |<---------------------------------------|
     |                                        |
     |  Write FFF3: StartServiceRequest      |
     |--------------------------------------->|
     |                          activate dispenser
     |  Notify FFF4: StartServiceResponse   |
     |<---------------------------------------|
     |                                        |
     |  Notify FFF5: ServiceStatus (Running)  |
     |<---------------------------------------|
     |         ... (every few seconds) ...    |
     |  Notify FFF5: ServiceStatus (Running)  |
     |<---------------------------------------|
     |                                        |
     |                          timer expires: pump off
     |  user taps stop                        |
     |                                        |
     |  Write FFF3: StopServiceRequest       |
     |--------------------------------------->|
     |  Notify FFF4: StopServiceResponse 3006|
     |<---------------------------------------|
     |                                        |
     |                          generate receipt
     |                          sign ECDSA P-256
     |                          increment txCounter
     |                                        |
     |  Notify FFF5: ServiceStatus (ReceiptReady)
     |<---------------------------------------|
     |                                        |
     |Write FFF6: ReceiptRequest {offlineTxId}|
     |--------------------------------------->|
     |  Notify FFF6: ReceiptResponse {receipt}|
     |<---------------------------------------|
     |                                        |
     |  store in offline tx log               |
     |                                        |
     |  BLE DISCONNECT                        |
     |--------------------------------------->|
     |                                        |
```

## Key Design Decisions

1. **Station validates locally, not the server.** In the Full Offline flow, the station is the sole authority. It performs the nine OfflinePass checks that apply, using the server key set (`OfflinePassPublicKey`) it holds. There is no round-trip to the server. This means the station must maintain its own counter tracking, the platform revocation epoch it last received, and usage limits per pass. The tradeoff is that the station cannot check what only the server knows — a block or an individual revocation, whenever issued, an epoch the platform moved after the station last received configuration, use of the pass at other stations, or the user's live wallet balance ([`offline-pass.md` §5](../../spec/profiles/offline/offline-pass.md#5-revocation)) — which is why the OfflinePass has conservative credit limits, and why settlement never charges a wash more than the station authorized for it ([`reconciliation.md` §8](../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)).

2. **`maxCreditsPerTx` is refused at the wash and capped at settlement — a request is never reduced to fit.** Check #8 compares the estimated cost against the limit and **rejects** with `4004 OFFLINE_PER_TX_EXCEEDED` when it is exceeded; it never trims the request to fit ([`offline-pass.md` §2.1](../../spec/profiles/offline/offline-pass.md#21-offlineallowance-object)). All three normative statements of the check say so — [`offline-pass.md` §4](../../spec/profiles/offline/offline-pass.md#4-validation-checks-10) check #8 station-side, [`authorize-offline-pass.md` §5](../../spec/profiles/offline/authorize-offline-pass.md#5-validation-checks) check #8 server-side, and [`06-security.md` §6.1.1](../../spec/06-security.md#611-offlinepass-validation--10-checks) check #8 — and [`07-errors.md`](../../spec/07-errors.md) records `4004` as **not recoverable**, which a silently reduced session would contradict. Reducing unasked also charges a user for a service they did not agree to. At reconciliation the limit is a cap, not a gate: the server settles no more than `maxCreditsPerTx` ([`reconciliation.md` §8](../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)) and scores a recomputed cost above it as the fraud factor `ExceedsPerTxLimit` ([`06-security.md` §7.4](../../spec/06-security.md#74-fraud-detection--offline-transactions)). The app is the right place to fit the offer to the limit, and it has what it needs: the pass carries `maxCreditsPerTx` in plaintext from the moment it is issued, and the app **MUST** show the pass's limits before the customer chooses, so a client can bound its own picker before it ever asks. The same holds for a **server-authorized** `durationSeconds` on Partial A and Partial B: a `requestedDurationSeconds` above it is refused with `3010`, never reduced ([`ble-session.md` §1](../../spec/profiles/offline/ble-session.md#1-starting-a-service)).

3. **ECDSA P-256 receipts for non-repudiation.** The station signs every offline transaction receipt with its ECDSA P-256 private key (generated during provisioning, never leaves the device). This means neither the station operator nor the user can forge a receipt. During reconciliation, the server verifies the signature against the station's registered public key.

4. **Monotonic txCounter as forensic evidence.** Each receipt includes a `txCounter` that increments by exactly 1 for each offline transaction, signed into the receipt so it cannot be restated later. A discontinuity is surfaced to the operator as a **station** alert and never withholds settlement. Note what it does *not* prove: an operator who suppresses transactions before they are counted produces no gap at all, so this is an aid to reconstruction, not a completeness guarantee — the guarantees live in point 5 and in `(offlinePassId, passCounter)` uniqueness (`06-security.md` §6.3.1).

5. **Two copies of one signed receipt.** The station sends the transaction as a TransactionEvent over MQTT, and the app uploads its copy of the same station-signed receipt over HTTPS (`POST /api/v1/offline/receipts`, [`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload)) — it **MUST** upload every receipt it holds. Whichever copy arrives first may settle; once one has settled, the other, byte-identical under the signature, is answered `Duplicate` ([`reconciliation.md` §3](../../spec/profiles/offline/reconciliation.md#3-deduplication-offlinetxid)). This redundancy ensures that even if one path fails (e.g., the station is decommissioned before reconnecting), the transaction is still settled.

6. **Biometric gate before OfflinePass transmission.** The app requires Face ID, Touch ID, or PIN before sending the OfflineAuthRequest. This prevents a stolen unlocked phone from being used for offline sessions. The biometric confirmation is a local device operation and does not require network access.

7. **Session key derivation binds handshake to auth.** The HKDF-SHA256 session key — derived from the ephemeral ECDH secret (`ee`) and the nonces, and bound to the full handshake transcript, which carries the station's certificate and signature — is used to compute the `sessionProof` in the OfflineAuthRequest, and the device proof signs the same transcript. This cryptographically binds the authentication to the specific BLE handshake and to the authenticated station identity, preventing replay attacks where an attacker captures an OfflineAuthRequest and tries to use it on a different connection.
