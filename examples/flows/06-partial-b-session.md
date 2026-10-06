# Flow 06: Partial B Session (Phone Offline, Station Online)

> **Compliance Level:** This flow is REQUIRED of every station that implements the Offline / BLE profile, which the **Complete** compliance level requires. When the server does not answer in time, the station refuses with `1010`, or **MAY** fall back to validating the pass itself if its `OfflineModeEnabled` is `true`, as in Full Offline (see [Flow 04](04-full-offline-session.md)).

## Scenario

Bob is at "Station Alpha -- Example City" and wants a deluxe treatment on Bay 2. His phone has no cellular signal — the area has a dead zone behind the building where he parked. However, the station's MQTT connection is healthy over its dedicated Ethernet line. Bob has an OfflinePass pre-armed in his the app from earlier today when he had WiFi. He opens the app and connects to the station via BLE. The phone is offline, so the app presents its OfflinePass whatever the station's connectivity; the Challenge's signed `stationConnectivity`, `"Online"`, makes this a **Partial B** session: the app sends an OfflineAuthRequest with the OfflinePass over BLE, and the station forwards it to the server via MQTT for real-time validation. The server validates the pass, debits Bob's wallet, and responds to the station, which relays the acceptance to the app over BLE. Bob runs a 4-minute Deluxe Program session on Bay 2, the timer expires naturally, and a receipt is generated. Since the station is online throughout, the session is tracked in real time by the server and settled online when the station reports its end; had the station lost MQTT before then, the loss would not have ended the session, and it would have settled once, on whichever of its SessionEnded and its receipt reached the server first — or, had neither reached it by the end of the session's authorized duration, been closed by the server then ([`04-flows.md` §5c](../../spec/04-flows.md#5c-partial-b--phone-offline-station-online)).

## Participants

| Actor | Identity |
|-------|----------|
| User | Bob (`sub_bob2026`), device `device_b7c4de89f0123456` |
| App | the mobile app v2.1.0 (React Native / Expo) |
| Server | CSMS (`api.example.com`) |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp (MQTT online, BLE active) |
| Bay | `bay_a2b3c4d5e6f7` (Bay 2) |
| Service | `svc_deluxe` (Deluxe Program, 12 credits/min, metered) |

## Pre-conditions

- Bob has a valid OfflinePass (`opass_a8b9c0d1e2f3`) pre-armed in the app
- Bob's wallet balance: 95 credits (server-side)
- Bob's phone has no internet connectivity (no cellular, no WiFi)
- Station `stn_a1b2c3d4` is online (MQTT connected, last heartbeat 10 seconds ago)
- Station BLE is advertising the OSPP service UUID, with the name `OSPP-b2c3d4` in its scan response
- Station holds its mTLS certificate, whose extended key usage carries `clientAuth` and `id-kp-osppBleStation`; the app holds the trust bundle of its last pass issuance — the Station CA set, each CA with its CRL
- Bay 2 status: `Available`
- Bob has completed biometric/PIN setup in the app
- OfflinePass `opass_a8b9c0d1e2f3` was issued today with 3 remaining uses

## Timeline

```
15:10:00.000  Bob opens the app near the station
15:10:01.200  App discovers BLE device OSPP-b2c3d4
15:10:01.800  App establishes BLE connection to station
15:10:02.100  App reads FFF1 (StationInfo) — sees connectivity: "Online", unauthenticated
15:10:02.400  App asks for AvailableServices on FFF2 — sees svc_deluxe on Bay 2
15:10:03.000  Bob selects Bay 2, Deluxe Program, 4 minutes
15:10:04.000  App prepares its OfflinePass: the phone is offline, so it will present the pass whatever the station's connectivity
15:10:04.500  App prompts biometric confirmation — Bob confirms with fingerprint
15:10:05.000  App writes Hello to FFF3
15:10:05.300  Station responds with Challenge on FFF4 (connectivity: "Online")
15:10:05.500  App verifies the station's certificate, its signature and the catalog's digest
15:10:05.800  App writes OfflineAuthRequest to FFF3 (OfflinePass, bay, service, duration, device proof)
15:10:06.000  Station verifies the device proof, forwards the pass to the server via MQTT AuthorizeOfflinePass
15:10:06.600  Server validates pass, debits 48 credits from Bob's wallet
15:10:06.800  Server responds via MQTT AuthorizeOfflinePass RESPONSE (Accepted)
15:10:07.000  Station relays AuthResponse (Accepted) to app via BLE FFF4
15:10:07.500  App writes StartServiceRequest to FFF3
15:10:07.900  Station activates dispenser on Bay 2
15:10:08.000  Station sends StartServiceResponse (Accepted) on FFF4
15:10:08.000  Deluxe Program session begins — timer starts at 240 seconds
15:10:08.050  Station sends SessionStarted EVENT via MQTT; it arrives at 15:10:08.120, and the server's authorized duration runs from then
15:11:08.000  ServiceStatus update: 60s elapsed, 180s remaining
15:12:08.000  ServiceStatus update: 120s elapsed, 120s remaining
15:13:08.000  ServiceStatus update: 180s elapsed, 60s remaining
15:14:08.000  Timer expires — station auto-stops dispenser; it sends no StopServiceResponse, since the app asked for no stop
15:14:08.100  Station sends SessionEnded EVENT (TimerExpired, 240s)
15:14:08.120  Server closes the session, 240 s after the SessionStarted arrived, as one whose timer expired — provisionally
15:14:08.150  SessionEnded arrives — the first end record after the close; the full 240 s delivered, so it trues nothing
15:14:09.000  Station generates ECDSA receipt, increments txCounter
15:14:09.200  Station sends ServiceStatus (ReceiptReady)
15:14:09.500  App asks for the receipt on FFF6, stores it locally
15:14:10.000  App disconnects BLE
15:14:10.500  App displays session summary to Bob
```

## Step-by-Step Detail

---

### Step 1: App Discovers Station via BLE (15:10:01.200)

**What Bob sees:**

Bob opens the app. The app detects it has no internet connectivity and shows a banner: "No internet — offline mode available". The BLE scan finds the OSPP service UUID on a station whose scan response names it `OSPP-b2c3d4`. The app shows: "Station found: SSP-3000".

---

### Step 2: App Reads StationInfo from FFF1 (15:10:02.100)

The app establishes a BLE connection and reads the StationInfo characteristic.

**BLE Read FFF1 [MSG-027]:**

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "1.2.3",
  "connectivity": "Online"
}
```

The app sees `connectivity: "Online"` and shows it to Bob, and decides nothing from it: nothing on FFF1 is authenticated ([`ble-transport.md` §3](../../spec/profiles/offline/ble-transport.md#3-station-info-fff1)). The phone is offline, so the app will present its OfflinePass whatever the station's connectivity; the Challenge's signed `stationConnectivity`, `"Online"` (Step 6), is what makes this a **Partial B** session. In this mode, the station acts as a relay: the app sends an OfflinePass via BLE, and the station forwards it to the server via MQTT for real-time validation.

---

### Step 3: App Asks for AvailableServices on FFF2 (15:10:02.400)

**BLE Write FFF2 (`0x01`), then Notify FFF2 [MSG-028]:**

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
          "serviceId": "svc_deluxe",
          "serviceName": "Deluxe Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 12,
          "priceLocalPerMinute": 60
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
          "serviceId": "svc_deluxe",
          "serviceName": "Deluxe Program",
          "pricingType": "PerMinute",
          "priceCreditsPerMinute": 12,
          "priceLocalPerMinute": 60
        }
      ]
    }
  ]
}
```

Bob sees the service catalog. Before he chooses, the app shows the pass's limits, as it must ([`offline-pass.md` §2.1](../../spec/profiles/offline/offline-pass.md#21-offlineallowance-object)): 60 credits per session, 120 of 200 credits remaining, 3 of 5 uses remaining. He selects Bay 2 and "Deluxe Program" (12 credits/min) for 4 minutes (48 credits max).

---

### Step 4: App Prompts Biometric Confirmation (15:10:04.500)

**What Bob sees:**

Because the app is using an OfflinePass (a pre-armed credential), the app requires biometric confirmation before proceeding. A system fingerprint dialog appears:

> **Confirm identity**
> Use fingerprint to authorize offline service.

Bob places his finger on the sensor. The biometric check passes.

---

### Step 5: App Sends Hello via BLE (15:10:05.000)

**BLE Write FFF3 [MSG-029]:**

```json
{
  "type": "Hello",
  "bleVersions": [
    "0.3.0"
  ],
  "appNonce": "WO03ZYwjXP/EJYncyjympxk/pS+1OyW+bgw2TL2Haxg=",
  "appVersion": "2.1.0",
  "appEphemeralPubKey": "AwLlW1Mt7gJAi7OrHrNnTDEcDy+8nkVVzLENkRbLLNkD"
}
```

---

### Step 6: Station Responds with Challenge (15:10:05.300)

The station chooses the BLE version, generates its nonce and ephemeral key, reports its connectivity status, presents its certificate and signs the Hello and the Challenge.

**BLE Notify FFF4 [MSG-030]:**

```json
{
  "type": "Challenge",
  "bleVersion": "0.3.0",
  "stationNonce": "8yucONtbmYBdu+dzLhegGw3QnMNjJcmmoFgNP0vii/k=",
  "stationEphemeralPubKey": "A+WHdiOoxe15cp85al87JonZauxW+Fwg5Uwr0qZmxhaP",
  "stationCertificate": "MIICFzCCAb6gAwIBAgICCgEwCgYIKoZIzj0EAwIwMzESMBAGA1UECgwJT1NQUCBUZXN0MR0wGwYDVQQDDBRPU1BQIFRlc3QgU3RhdGlvbiBDQTAeFw0yNjAxMDEwMDAwMDBaFw0yNjEyMzEyMzU5NTlaMCsxEjAQBgNVBAoMCU9TUFAgVGVzdDEVMBMGA1UEAwwMc3RuX2ExYjJjM2Q0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvW5xVrFUPqbSVgurekEFGU2vEdAnOKiJzzxcmZca3/sbE4e/85+t+d3uIbRGsrihNUJo/HPf/t6YnM1w8yTbcKOByTCBxjAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIHgDAoBgNVHSUEITAfBggrBgEFBQcDAgYTadau1fTCl9KOm5GCxfv1z/qsYzA8BgNVHR8ENTAzMDGgL6AthitodHRwOi8vY3JsLm9zcHAtdGVzdC5pbnZhbGlkL3N0YXRpb24tY2EuY3JsMB0GA1UdDgQWBBQesPd2I89FqUwav1HnI6MMFu/wPjAfBgNVHSMEGDAWgBQXxwEaDwCqARDb92VgH180MkvGWDAKBggqhkjOPQQDAgNHADBEAiB/ntacff4AkpoCFeG36be3OPq/SnS36Yx4J0+xyD6S1wIgT2Cr612Wv5BpWdeXae80hgOpvRPvcZ9UQCs41T2eFSI=",
  "stationConnectivity": "Online",
  "availableServices": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_eco",
      "available": true
    },
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "serviceId": "svc_deluxe",
      "available": true
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "serviceId": "svc_eco",
      "available": true
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "serviceId": "svc_deluxe",
      "available": true
    }
  ],
  "catalogDigest": "2UeVddjli82JD0z3ubl8lTsRmYua/QZFqn5lq3qkyfI=",
  "stationSignature": "MEUCIQDRW5EXxkOyQpCL++3GcvcNvUvs9SDH32qVC1WS3yFW0gIgfwBVkYYifM8dqic6ZwJfe8URwu5D92JD4rPTc4KpwJU="
}
```

The `stationConnectivity: "Online"` confirms the Partial B scenario. The app verifies the station against its trust bundle — the certificate chains to a Station CA of the bundle, is on no entry of that CA's CRL, carries `id-kp-osppBleStation`, and `stationSignature` verifies under it ([`06-security.md` §6.5.2](../../spec/06-security.md#652-station-authentication--the-stations-certificate)) — and confirms that the catalog Bob chose from is the one the Challenge's `catalogDigest` names and that Deluxe Program is available on Bay 2. Both sides derive the BLE session key over the ephemeral ECDH secret (the BLE LTK is **not** used — see `spec/06-security.md` §6.5):

```
SessionKey = HKDF-SHA256(
  ikm   = ee ‖ appNonce ‖ stationNonce,   // ee = ECDH(appEphemeral, stationEphemeral)
  salt  = "OSPP_BLE_SESSION_V3",
  info  = LP(transcriptHash),             // LP(x)=U16BE(len)‖x; the transcript covers the certificate and the signature
  length = 32
)
```

---

### Step 7: App Sends OfflineAuthRequest via BLE (15:10:05.800)

The app presents the pre-armed OfflinePass. In Partial B, the station does NOT validate locally — it forwards the pass to the server.

**BLE Write FFF3 [MSG-031]:**

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
      "maxTotalCredits": 200,
      "maxUses": 5,
      "maxCreditsPerTx": 60
    },
    "constraints": {
      "minIntervalSec": 60
    },
    "signatureAlgorithm": "ECDSA-P256-SHA256",
    "signature": "MEUCIQDLE+HuJ7QIM3ekfOQCgO0eg8bOtZG7jM/y5ZdXVcETrQIgJRyHJw58Bh41UnB1eYt9M5X43eLgXqPOzaFoqzeBi5U="
  },
  "counter": 3,
  "bayId": "bay_a2b3c4d5e6f7",
  "serviceId": "svc_deluxe",
  "requestedDurationSeconds": 240,
  "sessionProof": "hAW4BhA445dJmlLG78qcEn36DHEhkjIDNt3fZOGGh0c=",
  "deviceProof": {
    "format": "apple-appattest",
    "signature": "MEUCIQCx3I+HX4x8devC8EboDROXqN4iEMP+AYLJR8vxZ/aatgIgHwYg6Ky65BTVFjjHtxa9ut7LOy8V9rXAIfbzFyopn4w=",
    "authenticatorData": "bR2vgjWJbHy80iqDVEPONZjpIUj6ilROZ2f2ESHQEDAAAAAAAQ=="
  }
}
```

The request names the bay, the service and the duration Bob chose, and proves his phone holds the pass's device key over this handshake ([`06-security.md` §6.5.4](../../spec/06-security.md#654-device-proof-of-possession)).

---

### Step 8: Station Forwards OfflinePass to Server via MQTT (15:10:06.000)

Because the station is online (`stationConnectivity: "Online"`), it does NOT perform local validation of the OfflinePass. It verifies the device proof, and forwards the complete pass to the server for real-time validation via the AuthorizeOfflinePass MQTT message, with the bay, the service, the duration, the device proof unchanged and the handshake's `transcriptHash`.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_authpass_2a3b4c5d",
  "messageType": "Request",
  "action": "AuthorizeOfflinePass",
  "timestamp": "2026-02-13T15:10:06.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "offlinePassId": "opass_a8b9c0d1e2f3",
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
        "maxTotalCredits": 200,
        "maxUses": 5,
        "maxCreditsPerTx": 60
      },
      "constraints": {
        "minIntervalSec": 60
      },
      "signatureAlgorithm": "ECDSA-P256-SHA256",
      "signature": "MEUCIQDLE+HuJ7QIM3ekfOQCgO0eg8bOtZG7jM/y5ZdXVcETrQIgJRyHJw58Bh41UnB1eYt9M5X43eLgXqPOzaFoqzeBi5U="
    },
    "counter": 3,
    "bayId": "bay_a2b3c4d5e6f7",
    "serviceId": "svc_deluxe",
    "requestedDurationSeconds": 240,
    "deviceProof": {
      "format": "apple-appattest",
      "signature": "MEUCIQCx3I+HX4x8devC8EboDROXqN4iEMP+AYLJR8vxZ/aatgIgHwYg6Ky65BTVFjjHtxa9ut7LOy8V9rXAIfbzFyopn4w=",
      "authenticatorData": "bR2vgjWJbHy80iqDVEPONZjpIUj6ilROZ2f2ESHQEDAAAAAAAQ=="
    },
    "transcriptHash": "lsWrmnL+S4MGDLFSK/GqMP6Mo0RwywN8SZz1FGKUG6c="
  }
}
```

---

### Step 9: Server Validates OfflinePass in Real-Time (15:10:06.600)

The server runs the authorize-time checks of
[`authorize-offline-pass.md` §5](../../spec/profiles/offline/authorize-offline-pass.md#5-validation-checks)
— #1–#4, #6–#10 and #12; #5 and #11 are withdrawn — in that order, stopping at the first failure:

1. **Signature verification** — the ECDSA P-256 `signature` verifies with the key of the server's own key set named by the pass's `keyId` (`YjX5pR0TzmU3ubs17wImQQ`)
2. **Within its temporal bounds** — `expiresAt` (2026-02-14T06:00:00.000Z) is in the future, and the pass's age (9 h 10 min) is within the `OfflinePassMaxAge` of `stn_a1b2c3d4` (864000 s, the default)
3. **Revocation epoch** — pass `revocationEpoch` (42) >= the platform's current `RevocationEpoch` (42)
4. **Device binding** — the forwarded `deviceProof` verifies under the pass's `devicePublicKey`, over the request's `transcriptHash`, `counter`, bay, service and duration, the pass's `passId`, and the identity of `stn_a1b2c3d4`, the station the request arrived from
5. *(withdrawn — a pass carries no station scope)*
6. **Usage limit** — 2 uses already counted, fewer than `maxUses` (5)
7. **Total credits limit** — 80 credits already counted + 48 estimated for this session = 128, not above `maxTotalCredits` (200)
8. **Per-transaction credits** — 48 credits estimated for this session, `maxCreditsPerTx` is 60
9. **Rate limit** — last use was 45 minutes ago, `minIntervalSec` is 60
10. **Counter replay** — `counter` 3 > last seen counter 2
11. *(withdrawn — a pass carries no organization scope)*
12. **Individual revocation** — neither the pass nor Bob is revoked or blocked on the server

All ten pass. Nothing among them asks which station or which operator presented the pass: it is
valid at any station that accepts offline passes
([`offline-pass.md` §2.3](../../spec/profiles/offline/offline-pass.md#23-scope-any-station-that-accepts-offline-passes-normative)).
Nor does anything compare the requested `svc_deluxe` with a list of services: `allowedServiceTypes`
is withdrawn and this pass does not carry it — see
[`06-security.md` §6.1.1](../../spec/06-security.md#611-offlinepass-validation--10-checks).

Separately from pass validation, the server authorizes exactly the requested 240 seconds, at their
estimated cost of 48 credits (4 min × 12 credits/min), within the pass's limits — and gates nothing on the wallet balance: a debit that leaves the wallet
below zero would leave the transaction pending until a credit to Bob's wallet covers it
([`reconciliation.md` §8.2](../../spec/profiles/offline/reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)). The server then:
- Debits 48 credits from Bob's wallet (balance: 95 - 48 = 47)
- Creates session record `sess_d5e6f7a8b9c0` with `status: active`
- Records the OfflinePass usage (counter: 3, uses: 3/5, total credits: 128/200)

---

### Step 10: Server Responds via MQTT (15:10:06.800)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "msg_authpass_2a3b4c5d",
  "messageType": "Response",
  "action": "AuthorizeOfflinePass",
  "timestamp": "2026-02-13T15:10:06.800Z",
  "source": "Server",
  "protocolVersion": "0.3.0",
  "payload": {
    "status": "Accepted",
    "sessionId": "sess_d5e6f7a8b9c0",
    "durationSeconds": 240,
    "creditsAuthorized": 48
  }
}
```

---

### Step 11: Station Relays AuthResponse to App via BLE (15:10:07.000)

The station receives the server's acceptance and relays it to the app over BLE.

**BLE Notify FFF4 [MSG-033]:**

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "uo31nIXlLPNLPc8rCOeJWYwbDh/ycVRE692174J5jp0="
}
```

**What Bob sees:**

The app shows a green checkmark with "Authorization accepted by server". The fact that the server validated the pass in real-time is shown as an extra trust indicator.

---

### Step 12: App Sends StartServiceRequest (15:10:07.500)

**BLE Write FFF3 [MSG-034]:**

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_a2b3c4d5e6f7",
  "serviceId": "svc_deluxe",
  "requestedDurationSeconds": 240
}
```

---

### Step 13: Station Starts Deluxe Program Service (15:10:07.900)

The station's bay controller:

1. Validates that Bay 2 is still `Available`
2. Activates the dispenser relay on Bay 2
3. Starts the session timer at 240 seconds
4. Uses the session ID of the authorization, `sess_d5e6f7a8b9c0` ([`ble-session.md` §1](../../spec/profiles/offline/ble-session.md#1-starting-a-service)), and assigns offline transaction ID `otx_f6a7b8c9d0e13d2c84548a48ebc9b25c`

**BLE Notify FFF4 [MSG-038]:**

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_d5e6f7a8b9c0",
  "offlineTxId": "otx_f6a7b8c9d0e13d2c84548a48ebc9b25c"
}
```

Since the station is online, it reports the session's start to the server at once, with a SessionStarted under the authorization's `sessionId` — the start report the server keys the session's authorized duration on, sent within 30 seconds of the acceptance as every Partial-B start must be ([`authorize-offline-pass.md` §6](../../spec/profiles/offline/authorize-offline-pass.md#6-processing-rules) rule 4c):

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_started_2a3b4c5d",
  "messageType": "Event",
  "action": "SessionStarted",
  "timestamp": "2026-02-13T15:10:08.050Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "sessionId": "sess_d5e6f7a8b9c0",
    "bayId": "bay_a2b3c4d5e6f7",
    "startedAt": "2026-02-13T15:10:08.000Z"
  }
}
```

It then reports the bay's new state, a StatusNotification, which names the bay and no session — the server never reads a Partial-B start from it:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_3b4c5d6e",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T15:10:08.100Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Occupied",
    "previousStatus": "Available",
    "programs": [
      {
        "programNumber": 1,
        "available": true
      },
      {
        "programNumber": 2,
        "available": true
      },
      {
        "programNumber": 3,
        "available": true
      }
    ]
  }
}
```

**What Bob sees:**

The app transitions to the SessionActiveScreen. The dispenser starts, and Bob hears the motor engage. The screen shows:

```
+----------------------------------+
|        Service in progress           |
|                                  |
|   Deluxe Program - Bay 2       |
|   [=>                     ]      |
|   0:00 elapsed   4:00 remaining  |
|                                  |
|   Mode: Partial Offline           |
|   Station: online (BLE + MQTT)    |
|                                  |
|   [Stop service]             |
+----------------------------------+
```

---

### Step 14: ServiceStatus Updates During Service (15:11:08.000 - 15:13:08.000)

The station sends periodic BLE status updates and MQTT meter values simultaneously.

**BLE Notify FFF5 [MSG-038] -- at 60 seconds:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "Running",
  "sessionId": "sess_d5e6f7a8b9c0",
  "elapsedSeconds": 60,
  "remainingSeconds": 180,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 85,
    "energyWh": 45
  }
}
```

**BLE Notify FFF5 [MSG-038] -- at 120 seconds:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "Running",
  "sessionId": "sess_d5e6f7a8b9c0",
  "elapsedSeconds": 120,
  "remainingSeconds": 120,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 170,
    "energyWh": 90
  }
}
```

**BLE Notify FFF5 [MSG-038] -- at 180 seconds:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "Running",
  "sessionId": "sess_d5e6f7a8b9c0",
  "elapsedSeconds": 180,
  "remainingSeconds": 60,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 255,
    "energyWh": 135
  }
}
```

Meanwhile, the station also sends periodic MQTT MeterValues [MSG-010] to the server every 60 seconds (MeterValuesInterval configured to 60s for this example, which is also the default):

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server` (at 60s)

```json
{
  "messageId": "msg_meter_4c5d6e7f",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T15:11:08.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "sessionId": "sess_d5e6f7a8b9c0",
    "timestamp": "2026-02-13T15:11:08.000Z",
    "values": {
      "consumableMl": 85,
      "energyWh": 45
    }
  }
}
```

Bob sees the timer count up and the progress bar advance steadily.

---

### Step 15: Timer Expires -- Station Auto-Stops (15:14:08.000)

The 240-second timer expires. The station automatically stops the dispenser without waiting for a StopServiceRequest from the app.

The station's bay controller:

1. Detects timer expiry at 240 seconds
2. Sends relay-off signal to the dispenser on Bay 2
3. Reads final meter values
4. Calculates actual duration: exactly 240 seconds
5. Calculates credits: `ceil(240 / 60 * 12) = 48 credits`

It sends no StopServiceResponse: the app asked for no stop, and the session ends with `TimerExpired` ([`ble-session.md` §3](../../spec/profiles/offline/ble-session.md#3-stopping-a-service)). The app learns of the end from the `ReceiptReady` status on FFF5.

**What Bob sees:**

The app timer reaches `4:00` and the progress bar fills completely. A notification appears: "Service completed — time expired" (Service complete — time expired).

---

### Step 16: Station Reports Completion via MQTT (15:14:08.100)

Since the station is online, it reports the end of the session and then the bay's new state in real time. The SessionEnded EVENT is the session's delivery record. It arrives at 15:14:08.150, 30 ms after the server closed the session at the end of its authorized duration — 240 seconds after the SessionStarted arrived — as one whose timer expired, provisionally ([`authorize-offline-pass.md` §6](../../spec/profiles/offline/authorize-offline-pass.md#6-processing-rules) rules 4a and 4b); as the first end record after that close, it trues it. The server processes it before the StatusNotification that follows it ([`session-ended.md` §5](../../spec/profiles/transaction/session-ended.md#5-processing-rules); [`03-messages.md` §5.4](../../spec/03-messages.md#54-sessionended)):

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_sessend_5d6e7f89",
  "messageType": "Event",
  "action": "SessionEnded",
  "timestamp": "2026-02-13T15:14:08.100Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "sessionId": "sess_d5e6f7a8b9c0",
    "bayId": "bay_a2b3c4d5e6f7",
    "reason": "TimerExpired",
    "actualDurationSeconds": 240,
    "creditsCharged": 48,
    "meterValues": {
      "liquidMl": 0,
      "consumableMl": 340,
      "energyWh": 180
    }
  }
}
```

```json
{
  "messageId": "msg_status_5d6e7f8a",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T15:14:08.200Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Finishing",
    "previousStatus": "Occupied",
    "programs": [
      {
        "programNumber": 1,
        "available": true
      },
      {
        "programNumber": 2,
        "available": true
      },
      {
        "programNumber": 3,
        "available": true
      }
    ]
  }
}
```

The server closed session `sess_d5e6f7a8b9c0` as `completed` at the full 48 credits; the SessionEnded shows the full 4 minutes delivered, so the true-up refunds nothing. Settlement never exceeds the `creditsAuthorized` of the authorization (48), and any true-up against the authorize-time debit is refund-only ([`reconciliation.md` §8](../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)).

| Field | Value |
|-------|-------|
| Pre-debited credits | 48 |
| Actual credits used | 48 |
| Refund | 0 |
| Bob's balance | 47 credits (unchanged) |

---

### Step 17: Station Generates Receipt (15:14:09.000)

The station generates a signed receipt:

1. Serializes the transaction data as canonical JSON
2. Encodes as Base64 (`receipt.data`)
3. Computes SHA-256 digest of the data
4. Signs with the station's ECDSA P-256 private key
5. Increments `txCounter` to 9

**BLE Notify FFF5 [MSG-038] -- ReceiptReady:**

```json
{
  "bayId": "bay_a2b3c4d5e6f7",
  "status": "ReceiptReady",
  "sessionId": "sess_d5e6f7a8b9c0",
  "elapsedSeconds": 240,
  "remainingSeconds": 0
}
```

---

### Step 18: App Asks for the Receipt on FFF6 (15:14:09.500)

**BLE Write FFF6 [MSG-041]:** `{"type": "ReceiptRequest", "offlineTxId": "otx_f6a7b8c9d0e13d2c84548a48ebc9b25c"}`, answered by a **ReceiptResponse [MSG-042]** notified on FFF6, `result: "Accepted"`, whose `receipt` [MSG-039] is:

```json
{
  "offlineTxId": "otx_f6a7b8c9d0e13d2c84548a48ebc9b25c",
  "offlinePassId": "opass_a8b9c0d1e2f3",
  "passCounter": 3,
  "userId": "sub_bob2026",
  "deviceId": "device_b7c4de89f0123456",
  "bayId": "bay_a2b3c4d5e6f7",
  "serviceId": "svc_deluxe",
  "startedAt": "2026-02-13T15:10:08.000Z",
  "endedAt": "2026-02-13T15:14:08.000Z",
  "durationSeconds": 240,
  "creditsCharged": 48,
  "meterValues": {
    "liquidMl": 0,
    "consumableMl": 340,
    "energyWh": 180
  },
  "receipt": {
    "data": "eyJiYXlJZCI6ImJheV9hMmIzYzRkNWU2ZjciLCJib29rZWREdXJhdGlvblNlY29uZHMiOjI0MCwiY2xvY2tTdGF0ZSI6IlN5bmNocm9uaXplZCIsImNyZWRpdHNDaGFyZ2VkIjo0OCwiZGV2aWNlSWQiOiJkZXZpY2VfYjdjNGRlODlmMDEyMzQ1NiIsImR1cmF0aW9uU2Vjb25kcyI6MjQwLCJlbmRSZWFzb24iOiJUaW1lckV4cGlyZWQiLCJlbmRlZEF0IjoiMjAyNi0wMi0xM1QxNToxNDowOC4wMDBaIiwibWV0ZXJWYWx1ZXMiOnsiY29uc3VtYWJsZU1sIjozNDAsImVuZXJneVdoIjoxODAsImxpcXVpZE1sIjowfSwib2ZmbGluZVBhc3NJZCI6Im9wYXNzX2E4YjljMGQxZTJmMyIsIm9mZmxpbmVUeElkIjoib3R4X2Y2YTdiOGM5ZDBlMTNkMmM4NDU0OGE0OGViYzliMjVjIiwicGFzc0NvdW50ZXIiOjMsInNlcnZpY2VJZCI6InN2Y19kZWx1eGUiLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDE1OjEwOjA4LjAwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjksInVzZXJJZCI6InN1Yl9ib2IyMDI2In0=",
    "signature": "MEQCIAjZs9+qG320/cRN+4rFfQbFGmjpWpdmnvRauu14TmUhAiAOWm2DeYY/3Ad7KezmaiLouv8Iw2OMbqeQI4HB7u8iTg==",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 9
}
```

The app stores the receipt locally. The session was settled online, from the station's real-time reports; the app still uploads the receipt once it has connectivity, as it does every receipt it holds ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload)), and the server answers that upload `Duplicate`, with no effect: the session settled once, on its SessionEnded ([`reconciliation.md` §3](../../spec/profiles/offline/reconciliation.md#3-deduplication-offlinetxid)).

---

### Step 19: Station Sends Bay Available via MQTT (15:14:10.000)

After the hardware wind-down, Bay 2 returns to `Available`:

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "msg_status_6e7f8a9b",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T15:14:10.000Z",
  "source": "Station",
  "protocolVersion": "0.3.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Available",
    "previousStatus": "Finishing",
    "programs": [
      {
        "programNumber": 1,
        "available": true
      },
      {
        "programNumber": 2,
        "available": true
      },
      {
        "programNumber": 3,
        "available": true
      }
    ]
  }
}
```

---

### Step 20: App Displays Session Summary (15:14:10.500)

**What Bob sees:**

The app transitions to the SessionCompletedScreen:

```
+----------------------------------+
|        Service completed        |
|                                  |
|   Deluxe Program - Bay 2       |
|   Duration: 4m 0s (complete)      |
|                                  |
|   Credits used:        48   |
|   Refund:                    0   |
|                                  |
|   Estimated balance: ~47 credits      |
|   (exact balance on reconnect)   |
|                                  |
|   Consumable: 340mL | Energy: 180Wh |
|                                  |
|   Mode: Partial Offline (BLE)     |
|   Server: validated in real-time   |
|                                  |
|  [Rate service]  [Home]   |
+----------------------------------+
```

The app shows an "estimated" balance because Bob's phone is offline and cannot query the server. The actual balance (47 credits) is confirmed when connectivity is restored. The "Server: validated in real-time" note tells Bob that his OfflinePass was verified by the server, providing full billing accuracy.

---

### Step 21: What the Operator Sees

On the Operator Dashboard, Charlie sees the session in real-time because the station is online:

1. Bay 2 indicator transitions from green-solid ("Available") to green-pulsing ("In use") to yellow ("Finishing") to green-solid ("Available")
2. The session log shows the full lifecycle:

```
[15:10:08] Session sess_d5e6f7a8b9c0 started (Partial B)
           User: Bob | Bay 2 | Deluxe Program
           Auth: OfflinePass opass_a8b9c0d1e2f3 (validated by server)

[15:14:08] Session sess_d5e6f7a8b9c0 completed
           Duration: 4m 0s | Credits: 48/48 (no refund)
           Consumable: 340mL | Energy: 180Wh
           Station sync: Complete (online throughout)
```

3. The station revenue counter updates: +48 credits for this session
4. No reconciliation flags — the session was tracked in real-time over MQTT

## Message Sequence Diagram

```
  Bob (App)            Station (stn_a1b2c3d4)          Server
     |                          |                          |
     | -- BLE connect --------->|                          |
     |                          |                          |
     | -- Read FFF1 ----------->|                          |
     |<------ StationInfo (online) ---|                    |
     |                          |                          |
     | -- Write FFF2 0x01 ----->|                          |
     |<------ Notify FFF2: AvailableServices               |
     |                          |                          |
     | [biometric confirm]      |                          |
     |                          |                          |
     | -- Write FFF3: Hello --->|                          |
     |<------ FFF4: Challenge (online, certificate, digest, signature)
     |                          |                          |
     | [verify certificate, signature and digest]          |
     | -- Write FFF3: OfflineAuthRequest ---------------->|
     |                          |  AuthorizeOfflinePass    |
     |                          |  REQUEST [MQTT] -------->|
     |                          |                  validate |
     |                          |                  pass     |
     |                          |                  debit 48 |
     |                          |  AuthorizeOfflinePass    |
     |                          |  RESPONSE (Accepted) <---|
     |<------ FFF4: AuthResponse (Accepted)               |
     |                          |                          |
     | -- Write FFF3: StartServiceRequest --------------->|
     |                          | start service                |
     |<------ FFF4: StartServiceResponse                 |
     |                          |  SessionStarted [MQTT]   |
     |                          |------------------------->|
     |                          |  StatusNotif (Occupied)  |
     |                          |------------------------->|
     |                          |                          |
     |<------ FFF5: ServiceStatus (Running, 60s)           |
     |                          |  MeterValues [MQTT]      |
     |                          |------------------------->|
     |<------ FFF5: ServiceStatus (Running, 120s)          |
     |                          |  MeterValues [MQTT]      |
     |                          |------------------------->|
     |<------ FFF5: ServiceStatus (Running, 180s)          |
     |                          |  MeterValues [MQTT]      |
     |                          |------------------------->|
     |                          |                          |
     |                          | timer expires (240s)     |
     |                          | stop service                 |
     |                          |  SessionEnded (Timer)     |
     |                          |------------------------->|
     |                          |  StatusNotif (Finishing)  |
     |                          |------------------------->|
     |                          |                          |
     |                          |  StatusNotif (Available)  |
     |                          |------------------------->|
     |                          |                          |
     |<------ FFF5: ServiceStatus (ReceiptReady)          |
     |                          |                          |
     | -- Write FFF6: ReceiptRequest ->|                   |
     |<------ FFF6: ReceiptResponse (ECDSA receipt)        |
     |                          |                          |
     | -- BLE disconnect ------>|                          |
     |                          |                          |
```

## Key Design Decisions

1. **Station does NOT validate locally in Partial B.** When the station is online, it always forwards the OfflinePass to the server for real-time validation. This is strictly better than local validation because the server can verify that neither the pass nor its user has been revoked since issuance (check #12), apply the platform's current epoch and the pass's use at every station, and debit the wallet immediately. The nine local validation checks ([`06-security.md` §6.1.1](../../spec/06-security.md#611-offlinepass-validation--10-checks); see Flow 04) are only used as a fallback.

2. **Server debits wallet at authorization time.** The server debits Bob's wallet at step 9, before the service even starts. This matches the online flow behavior, and the pass's limits, checked against the server's count at every station, bound what the next session may use. There is no risk of over-billing: the `creditsAuthorized` of the response caps what the session may be charged, and any true-up is refund-only ([`reconciliation.md` §8](../../spec/profiles/offline/reconciliation.md#8-wallet-reconciliation)).

3. **Settled once, on the first end record.** Because the station is online throughout the session, all events (SessionStarted, StatusNotification, MeterValues, SessionEnded) are sent to the server in real time via MQTT: the session's authorized duration runs from the arrival of its SessionStarted, and the session settles on the first of its end records or on the server's close at the end of that duration — here the close, 30 ms before the SessionEnded, which trues it and finds the full 240 seconds delivered. Had the station lost MQTT before then, the loss would not have ended the session: the wash would have continued, and the station would have sent its SessionEnded when it reconnected; had no end record reached the server by the end of the session's authorized duration, the server would have closed the session then, provisionally — the SessionEnded arriving later would have trued that close down had it shown less delivered ([`authorize-offline-pass.md` §6](../../spec/profiles/offline/authorize-offline-pass.md#6-processing-rules) rules 4a to 4c). The receipt on FFF6 is Bob's copy, which the app uploads once it has connectivity ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload)). The session settles once, on whichever of the two arrives first, and the other is a duplicate ([`reconciliation.md` §3](../../spec/profiles/offline/reconciliation.md#3-deduplication-offlinetxid)); had the receipt arrived first, the server would have applied no second debit, only a refund-only true-up against the authorize-time debit ([`reconciliation.md` §8.2](../../spec/profiles/offline/reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)).

4. **MQTT fallback if AuthorizeOfflinePass times out.** If the server has not answered in time for the station to answer the app within the BLE handshake budget, the station answers `1010 MESSAGE_TIMEOUT`, or **MAY** fall back to local validation (as in Full Offline, Flow 04) if its `OfflineModeEnabled` is `true`, and then within its own offline limits ([`authorize-offline-pass.md` §6](../../spec/profiles/offline/authorize-offline-pass.md#6-processing-rules)). This graceful degradation ensures the user is not stuck if MQTT has a momentary hiccup. The spec defines this in section 5c error paths.

5. **Dual-channel reporting.** During the session, the station sends updates on both BLE (ServiceStatus on FFF5 to the app) and MQTT (MeterValues to the server). These are independent channels. The BLE updates provide real-time UI feedback to Bob, while the MQTT events feed the operator dashboard and billing system.

6. **Timer expiry triggers auto-stop.** Bob did not manually stop the session — the 240-second timer expired naturally. The station auto-stops and generates the receipt without requiring a StopServiceRequest from the app. The app detects the stop by the ReceiptReady status on FFF5; the station sends no StopServiceResponse, since the app asked for no stop.
