# Flow 05: Partial A Session (Phone Online, Station Offline)

## Scenario

Alice is at "Station Alpha -- Example City" and wants to start the Eco Program service on Bay 1. Her phone has 4G connectivity, but the station's MQTT connection is down due to an ISP fiber cut in the area. The station has been offline for about 20 minutes, but its BLE radio is advertising normally. Alice opens the app, which detects the station via BLE and reads that it reports `connectivity: "Offline"` — a hint the station's signed Challenge confirms. Since her phone is online, the app uses the **Partial A** strategy: it calls `POST /sessions/offline-auth` to obtain a server-signed ECDSA P-256 authorization, then delivers it to the station over BLE. The station verifies the signature locally with a key of the server key set (`OfflinePassPublicKey`) it holds. Alice runs a 3-minute Eco Program session on Bay 1, stops, and receives a signed receipt. Credits were pre-debited server-side when the authorization was issued; settlement is a refund-only true-up against that pre-debit, never above the authorization's `creditsAuthorized` and never a second debit ([`reconciliation.md` §8.2](../../spec/profiles/offline/reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)).

## Participants

| Actor | Identity |
|-------|----------|
| User | Alice (`sub_alice2026`), device `device_a8f3bc12e4567890` |
| App | the mobile app v2.1.0 (React Native / Expo) |
| Server | CSMS (`api.example.com`) |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp (MQTT offline, BLE active) |
| Bay | `bay_c1d2e3f4a5b6` (Bay 1) |
| Service | `svc_eco` (Eco Program, 10 credits/min, metered) |

## Pre-conditions

- Alice is authenticated in the app (valid JWT access token)
- Alice's wallet balance: 120 credits
- Station `stn_a1b2c3d4` has been offline (MQTT disconnected) for ~20 minutes
- Station BLE is advertising the OSPP service UUID, with the name `OSPP-b2c3d4` in its scan response
- Station holds its mTLS certificate, whose extended key usage carries `clientAuth` and `id-kp-osppBleStation`
- Station holds the server key set (`OfflinePassPublicKey`) in NVS
- Station `OfflineModeEnabled` does not matter here: it governs only whether the station accepts an OfflinePass on its own validation, and a ServerSignedAuth is authorized and debited by the server ([`08-configuration.md` §5](../../spec/08-configuration.md#5-offline--ble-configuration-keys))
- Bay 1 status: `Available`

## Timeline

```
14:30:00.000  Alice opens the app near the station
14:30:01.500  App discovers BLE device OSPP-b2c3d4
14:30:02.000  App establishes BLE connection to station
14:30:02.300  App reads FFF1 (StationInfo) — displays it, and relies on nothing in it
14:30:02.600  App asks for AvailableServices on FFF2 — sees svc_eco on Bay 1
14:30:03.000  Alice selects Bay 1, Eco Program, 5 minutes
14:30:05.000  App, online, pre-fetches a Partial-A authorization for the station named by the bay's code
14:30:05.200  App sends POST /sessions/offline-auth to server
14:30:05.800  Server validates, debits 50 credits, signs ECDSA P-256 authorization
14:30:06.000  Server responds with signedAuthorization, sessionId and the trust bundle
14:30:06.500  App writes Hello to FFF3
14:30:06.800  Station responds with Challenge on FFF4 (connectivity: "Offline")
14:30:07.000  App verifies the station's certificate and signature against the bundle it just received
14:30:07.200  App writes ServerSignedAuth to FFF3
14:30:07.500  Station verifies ECDSA P-256 signature — valid
14:30:07.600  Station sends AuthResponse (Accepted) on FFF4
14:30:08.000  App writes StartServiceRequest to FFF3
14:30:08.400  Station activates dispenser on Bay 1
14:30:08.500  Station sends StartServiceResponse (Accepted) on FFF4
14:30:08.500  Eco Program service begins — timer starts at 300 seconds
14:31:08.000  ServiceStatus update: 60s elapsed, 240s remaining
14:32:08.000  ServiceStatus update: 120s elapsed, 180s remaining
14:33:02.000  Alice taps "Stop service" — app writes StopServiceRequest
14:33:02.400  Station deactivates dispenser, reads meters
14:33:02.600  Station sends StopServiceResponse (174s, 29 credits)
14:33:03.000  Station generates ECDSA receipt, increments txCounter
14:33:03.200  Station sends ServiceStatus (ReceiptReady)
14:33:03.500  App asks for the receipt on FFF6, stores it in offline tx log
14:33:04.000  App disconnects BLE
14:33:04.500  App displays session summary to Alice
```

## Step-by-Step Detail

---

### Step 1: App Discovers Station via BLE (14:30:01.500)

**What Alice sees:**

Alice opens the app at the station. The app begins a BLE scan and discovers a device advertising the OSPP service UUID, named `OSPP-b2c3d4` in its scan response. The HomeScreen shows a card: "Station found: SSP-3000 — Station Alpha -- Example City".

---

### Step 2: App Reads StationInfo from FFF1 (14:30:02.300)

The app establishes a BLE connection and reads the StationInfo characteristic.

**BLE Read FFF1 [MSG-027]:**

```json
{
  "stationId": "stn_a1b2c3d4",
  "stationModel": "SSP-3000",
  "firmwareVersion": "1.2.3",
  "connectivity": "Offline"
}
```

The app shows the station it reached, and acts on nothing here: nothing on FFF1 is authenticated ([`ble-transport.md` §3](../../spec/profiles/offline/ble-transport.md#3-station-info-fff1)). It knows the station from the code on Bay 1, which Alice scanned — the out-of-band source of the `stationId` that a pre-fetch needs ([`ble-handshake.md` §4.2](../../spec/profiles/offline/ble-handshake.md#42-serversignedauth-partial-a)) — and the Challenge's signed `stationConnectivity` says whether the station is offline (Step 7); a station that is not the one the code names fails the authorization's `stationId` claim (Step 9, check #3).

---

### Step 3: App Asks for AvailableServices on FFF2 (14:30:02.600)

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
        }
      ]
    }
  ]
}
```

Alice sees the service catalog. She selects Bay 1 and "Eco Program" (10 credits/min) for 5 minutes (50 credits max).

---

### Step 4: App Requests Server-Signed Authorization (14:30:05.200)

The phone is online and the app knows the station from the bay's code, so it obtains a signed authorization before the BLE handshake proceeds, and relays it once the Challenge has confirmed the station is offline (Step 7).

**HTTP Request:**

```http
POST /api/v1/sessions/offline-auth HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_offauth_7d8e9f01

{
  "stationId": "stn_a1b2c3d4",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300,
  "appNonce": "XwmXIvgMokhZYNANPS8kzhlgT9dVDATP4Bd6Ed3mE34="
}
```

The body carries the `appNonce` the app will write in its Hello in Step 6: the server signs it into the authorization, and the station compares the two ([`ble-handshake.md` §4.2](../../spec/profiles/offline/ble-handshake.md#42-serversignedauth-partial-a)). The app fetches the authorization before the handshake, which keeps the server round trip out of the 10-second handshake budget.

---

### Step 5: Server Validates and Signs Authorization (14:30:05.800)

The server performs the following:

1. Validates the JWT — user is `sub_alice2026`
2. Confirms user has sufficient balance: 120 credits >= 50 credits (5 min x 10 credits/min)
3. Confirms user has no other active session
4. Notes that station `stn_a1b2c3d4` is currently offline (last heartbeat missed) — proceeds optimistically
5. Debits 50 credits from Alice's wallet (balance: 120 - 50 = 70)
6. Creates session record `sess_c4d5e6f7a8b9` with `status: pending` (awaiting reconciliation from station)
7. Signs an authorization blob with its current server signing key (ECDSA P-256)

The authorization carries the twelve claims of [`ble-handshake.md` §4.2.1](../../spec/profiles/offline/ble-handshake.md#421-signing-process-server-side) under the server's ECDSA P-256 signature: `authId` `auth_c89731927892`; Alice's `sub`; her device's `deviceId`; `sessionId` `sess_c4d5e6f7a8b9`; `stationId`, `bayId` and `serviceId` from the request; `durationSeconds` 300; `creditsAuthorized` 50, the pre-debit and the most the session may be charged; the request's `appNonce`; and `issuedAt` and `expiresAt`, five minutes apart. The response carries the same `signedAuthorization` object the app relays in Step 8.

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_offauth_7d8e9f01

{
  "sessionId": "sess_c4d5e6f7a8b9",
  "signedAuthorization": {
    "data": "eyJhcHBOb25jZSI6Ilh3bVhJdmdNb2toWllOQU5QUzhremhsZ1Q5ZFZEQVRQNEJkNkVkM21FMzQ9IiwiYXV0aElkIjoiYXV0aF9jODk3MzE5Mjc4OTIiLCJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJjcmVkaXRzQXV0aG9yaXplZCI6NTAsImRldmljZUlkIjoiZGV2aWNlX2E4ZjNiYzEyZTQ1Njc4OTAiLCJkdXJhdGlvblNlY29uZHMiOjMwMCwiZXhwaXJlc0F0IjoiMjAyNi0wMi0xM1QxNDozNTowNS44MDBaIiwiaXNzdWVkQXQiOiIyMDI2LTAyLTEzVDE0OjMwOjA1LjgwMFoiLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic2Vzc2lvbklkIjoic2Vzc19jNGQ1ZTZmN2E4YjkiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJzdWIiOiJzdWJfYWxpY2UyMDI2In0=",
    "signature": "MEUCIQDwtBwQh4ljGq64jztmJ5qxZYKH1viSpN+G9Ou3CAU3/QIgScy1OwVmud8d5JMBpohjd5X/UcaIC0r58DrDPcuPdek=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "trustBundle": {
    "stationCas": [
      {
        "certificate": "-----BEGIN CERTIFICATE-----\nMIIBiDCCAS6gAwIBAgICBVEwCgYIKoZIzj0EAwIwMzESMBAGA1UECgwJT1NQUCBU\nZXN0MR0wGwYDVQQDDBRPU1BQIFRlc3QgU3RhdGlvbiBDQTAeFw0yNTA5MDEwMDAw\nMDBaFw0zMDA4MzEyMzU5NTlaMDMxEjAQBgNVBAoMCU9TUFAgVGVzdDEdMBsGA1UE\nAwwUT1NQUCBUZXN0IFN0YXRpb24gQ0EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC\nAASV+9CgAE4tgTzAKWwxVGw9wkyvqJhltZhs/62oD8EQ144coXVZ5S7LcVowOBB6\nRCV30pndUexf5mPlLvNrPAYuozIwMDAdBgNVHQ4EFgQUF8cBGg8AqgEQ2/dlYB9f\nNDJLxlgwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiANwaaqU++e\nh+48Xbm+eIdx0Mewmx6Fi8TzTK7uRmr0IgIhAM7FlstK69gTH2I56MDw6st4gAnG\nfWr0/RyjuV++/a8j\n-----END CERTIFICATE-----\n",
        "crl": "-----BEGIN X509 CRL-----\nMIHLMHMCAQEwCgYIKoZIzj0EAwIwMzESMBAGA1UECgwJT1NQUCBUZXN0MR0wGwYD\nVQQDDBRPU1BQIFRlc3QgU3RhdGlvbiBDQRcNMjYwMjEwMDAwMDAwWhcNMjYwMjE3\nMDAwMDAwWqAPMA0wCwYDVR0UBAQCAhAAMAoGCCqGSM49BAMCA0gAMEUCIBn2bfLU\nLsyK7Ylqeam9kH9ZxjxZdbzegp90TJFf0XanAiEAxEIAKknqttpckEWPqEqPs5lp\nshMwikxb5J+KXtXQT9c=\n-----END X509 CRL-----\n"
      }
    ]
  },
  "wallet": {
    "previousBalance": 120,
    "newBalance": 70
  }
}
```

The response carries the trust bundle too — the Station CA set, each CA with its CRL — because Alice's phone needs it to authenticate the station before it relays the authorization, and a phone may hold no pass, and so no bundle, at all ([`app-contract.md` §5](../../spec/profiles/offline/app-contract.md#5-the-partial-a-authorization)). The app replaces the bundle it holds with this one.

---

### Step 6: App Sends Hello via BLE (14:30:06.500)

With the signed authorization in hand, the app proceeds with the BLE handshake.

**BLE Write FFF3 [MSG-029]:**

```json
{
  "type": "Hello",
  "bleVersions": [
    "0.3.0"
  ],
  "appNonce": "XwmXIvgMokhZYNANPS8kzhlgT9dVDATP4Bd6Ed3mE34=",
  "appVersion": "2.1.0",
  "appEphemeralPubKey": "Akn5JLCi1/UNqvAKG/ZaLEemCR4LAqhbXISBBIj+EUlK"
}
```

The `appNonce` is the one the authorization carries (Step 4). Nothing in the Hello identifies Alice or her phone.

---

### Step 7: Station Responds with Challenge (14:30:06.800)

The station chooses the BLE version, generates its own nonce and ephemeral key, reports its connectivity status, presents its certificate and signs the Hello and the Challenge.

**BLE Notify FFF4 [MSG-030]:**

```json
{
  "type": "Challenge",
  "bleVersion": "0.3.0",
  "stationNonce": "/kLv1LXl1SeQiYke7YZChUTxp9jfhgRDkkf3CNbr8kY=",
  "stationEphemeralPubKey": "Ao3523QPEUTfo1iHGinnN3e5/DBUw9pmimYeTp7FsMoi",
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
      "serviceId": "svc_deluxe",
      "available": true
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "serviceId": "svc_eco",
      "available": true
    }
  ],
  "catalogDigest": "aTJKAIhKyFTwppylQPa+nBz8rl6KwwglWGonzrJX7D4=",
  "stationSignature": "MEQCICQdjMlWwRCQNOnt1V9ahN1aHW9EtLggWDJIItLIHuLNAiAFshHsI/yM/GmsXe+9akHfVy+IHsGqtIYhMhJ3Roi/zQ=="
}
```

The `stationConnectivity: "Offline"` confirms the Partial A scenario. Before it relays anything, the app verifies the station against the trust bundle it received in Step 5 ([`06-security.md` §6.5.2](../../spec/06-security.md#652-station-authentication--the-stations-certificate)): the certificate chains to the Station CA, is on no entry of the CRL, carries `id-kp-osppBleStation`, names `stn_a1b2c3d4` — the station the authorization is for — and `stationSignature` verifies under it. It then derives the BLE session key over the ephemeral ECDH secret (the BLE LTK is **not** used — see `spec/06-security.md` §6.5):

```
SessionKey = HKDF-SHA256(
  ikm   = ee ‖ appNonce ‖ stationNonce,   // ee = ECDH(appEphemeral, stationEphemeral)
  salt  = "OSPP_BLE_SESSION_V3",
  info  = LP(transcriptHash),             // LP(x)=U16BE(len)‖x; the transcript covers the certificate and the signature
  length = 32
)
```

---

### Step 8: App Sends ServerSignedAuth via BLE (14:30:07.200)

The app delivers the server-signed authorization obtained in Step 5.

**BLE Write FFF3 [MSG-032]:**

```json
{
  "type": "ServerSignedAuth",
  "signedAuthorization": {
    "data": "eyJhcHBOb25jZSI6Ilh3bVhJdmdNb2toWllOQU5QUzhremhsZ1Q5ZFZEQVRQNEJkNkVkM21FMzQ9IiwiYXV0aElkIjoiYXV0aF9jODk3MzE5Mjc4OTIiLCJiYXlJZCI6ImJheV9jMWQyZTNmNGE1YjYiLCJjcmVkaXRzQXV0aG9yaXplZCI6NTAsImRldmljZUlkIjoiZGV2aWNlX2E4ZjNiYzEyZTQ1Njc4OTAiLCJkdXJhdGlvblNlY29uZHMiOjMwMCwiZXhwaXJlc0F0IjoiMjAyNi0wMi0xM1QxNDozNTowNS44MDBaIiwiaXNzdWVkQXQiOiIyMDI2LTAyLTEzVDE0OjMwOjA1LjgwMFoiLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic2Vzc2lvbklkIjoic2Vzc19jNGQ1ZTZmN2E4YjkiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJzdWIiOiJzdWJfYWxpY2UyMDI2In0=",
    "signature": "MEUCIQDwtBwQh4ljGq64jztmJ5qxZYKH1viSpN+G9Ou3CAU3/QIgScy1OwVmud8d5JMBpohjd5X/UcaIC0r58DrDPcuPdek=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "sessionId": "sess_c4d5e6f7a8b9"
}
```

---

### Step 9: Station Verifies ECDSA P-256 Signature (14:30:07.500)

The station decodes `signedAuthorization.data` and performs the six checks of [`ble-handshake.md` §4.2.2](../../spec/profiles/offline/ble-handshake.md#422-verification-station-side), in order:

1. **ECDSA P-256 signature verification** — with a key of the server key set (`OfflinePassPublicKey`) the station holds. A ServerSignedAuth names no `keyId`, so the station tries the keys of its set; there is no cached previous key and no grace period ([`06-security.md` §6.7](../../spec/06-security.md#67-server-signing-key-rotation-ecdsa-p-256))
2. **appNonce matches** — the claim equals the `appNonce` of the Hello in Step 6
3. **stationId matches** — the authorization is for `stn_a1b2c3d4` (this station)
4. *(withdrawn)* — the Hello carries no device identifier; the authorization is bound to this handshake by check #2
5. **sessionId matches** — the claim equals the message's `sessionId`, `sess_c4d5e6f7a8b9`
6. **Not expired** — `expiresAt` (14:35:05.800Z) is in the future

All checks pass. The station accepts the authorization, and runs the session under the server-issued `sessionId` and within the signed `durationSeconds`.

---

### Step 10: Station Sends AuthResponse (Accepted) (14:30:07.600)

**BLE Notify FFF4 [MSG-033]:**

```json
{
  "type": "AuthResponse",
  "result": "Accepted",
  "sessionKeyConfirmation": "uo31nIXlLPNLPc8rCOeJWYwbDh/ycVRE692174J5jp0="
}
```

The `sessionKeyConfirmation` proves both sides derived the same session key via HKDF-SHA256.

**What Alice sees:**

The app shows a brief green checkmark animation with "Authorization accepted".

---

### Step 11: App Sends StartServiceRequest (14:30:08.000)

**BLE Write FFF3 [MSG-034]:**

```json
{
  "type": "StartServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "requestedDurationSeconds": 300
}
```

---

### Step 12: Station Starts Eco Program Service (14:30:08.400)

The station's bay controller:

1. Validates that Bay 1 is still `Available`
2. Activates the dispenser relay on Bay 1
3. Starts the session timer at 300 seconds
4. Uses the server-issued session ID `sess_c4d5e6f7a8b9` from the verified claims ([`ble-session.md` §1](../../spec/profiles/offline/ble-session.md#1-starting-a-service)) and assigns offline transaction ID `otx_e5f6a7b8c9d0`

**BLE Notify FFF4 [MSG-038]:**

```json
{
  "type": "StartServiceResponse",
  "result": "Accepted",
  "sessionId": "sess_c4d5e6f7a8b9",
  "offlineTxId": "otx_e5f6a7b8c9d0"
}
```

**What Alice sees:**

The app transitions to the SessionActiveScreen. The dispenser starts, and Alice hears the service start up. The screen shows:

```
+----------------------------------+
|        Service in progress           |
|                                  |
|   Eco Program - Bay 1           |
|   [=========>          ]         |
|   0:00 elapsed   5:00 remaining  |
|                                  |
|   Mode: Partial Offline           |
|   Station: offline (BLE)          |
|                                  |
|   [Stop service]             |
+----------------------------------+
```

---

### Step 13: ServiceStatus Updates During Service (14:31:08.000 - 14:32:08.000)

The station sends periodic status updates over BLE FFF5.

**BLE Notify FFF5 [MSG-038] — at 60 seconds:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_c4d5e6f7a8b9",
  "elapsedSeconds": 60,
  "remainingSeconds": 240,
  "meterValues": {
    "liquidMl": 15200,
    "consumableMl": 180
  }
}
```

**BLE Notify FFF5 [MSG-038] — at 120 seconds:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "Running",
  "sessionId": "sess_c4d5e6f7a8b9",
  "elapsedSeconds": 120,
  "remainingSeconds": 180,
  "meterValues": {
    "liquidMl": 30100,
    "consumableMl": 360
  }
}
```

Alice sees the timer tick up and the progress bar advance. The meter readings update in real time.

---

### Step 14: Alice Taps Stop (14:33:02.000)

**What Alice sees:**

At about 2 minutes 54 seconds, Alice decides the car is clean. She taps "Stop service". The app shows a confirmation dialog:

> **Stop service?**
> Unused credits are refunded when the session settles.
> [Cancel] [Stop]

Alice taps "Stop".

**BLE Write FFF3 [MSG-036]:**

```json
{
  "type": "StopServiceRequest",
  "bayId": "bay_c1d2e3f4a5b6",
  "sessionId": "sess_c4d5e6f7a8b9"
}
```

---

### Step 15: Station Stops Service and Reports (14:33:02.400)

The station's bay controller:

1. Sends relay-off signal to the dispenser on Bay 1
2. Reads final meter values
3. Calculates actual duration: started at 14:30:08.500, stopped at 14:33:02.400 = 174 seconds
4. Calculates credits: `ceil(174 / 60 * 10) = ceil(29.0) = 29 credits`

**BLE Notify FFF4 [MSG-037]:**

```json
{
  "type": "StopServiceResponse",
  "result": "Accepted",
  "actualDurationSeconds": 174,
  "creditsCharged": 29
}
```

---

### Step 16: Station Generates Receipt (14:33:03.000)

The station generates a signed receipt:

1. Serializes the transaction data as canonical JSON
2. Encodes as Base64 (`receipt.data`)
3. Computes SHA-256 digest of the data
4. Signs with the station's ECDSA P-256 private key
5. Increments `txCounter` to 8

**BLE Notify FFF5 [MSG-038] — ReceiptReady:**

```json
{
  "bayId": "bay_c1d2e3f4a5b6",
  "status": "ReceiptReady",
  "sessionId": "sess_c4d5e6f7a8b9",
  "elapsedSeconds": 174,
  "remainingSeconds": 0
}
```

---

### Step 17: App Asks for the Receipt on FFF6 (14:33:03.500)

**BLE Write FFF6 [MSG-041]:** `{"type": "ReceiptRequest", "offlineTxId": "otx_e5f6a7b8c9d0"}`, answered by a **ReceiptResponse [MSG-042]** notified on FFF6, `result: "Accepted"`, whose `receipt` [MSG-039] is:

```json
{
  "offlineTxId": "otx_e5f6a7b8c9d0",
  "authId": "auth_c89731927892",
  "sessionId": "sess_c4d5e6f7a8b9",
  "userId": "sub_alice2026",
  "deviceId": "device_a8f3bc12e4567890",
  "bayId": "bay_c1d2e3f4a5b6",
  "serviceId": "svc_eco",
  "startedAt": "2026-02-13T14:30:08.500Z",
  "endedAt": "2026-02-13T14:33:02.400Z",
  "durationSeconds": 174,
  "creditsCharged": 29,
  "meterValues": {
    "liquidMl": 39800,
    "consumableMl": 470,
    "energyWh": 120
  },
  "receipt": {
    "data": "eyJhdXRoSWQiOiJhdXRoX2M4OTczMTkyNzg5MiIsImJheUlkIjoiYmF5X2MxZDJlM2Y0YTViNiIsImJvb2tlZER1cmF0aW9uU2Vjb25kcyI6MzAwLCJjbG9ja1N0YXRlIjoiU3luY2hyb25pemVkIiwiY3JlZGl0c0NoYXJnZWQiOjI5LCJkZXZpY2VJZCI6ImRldmljZV9hOGYzYmMxMmU0NTY3ODkwIiwiZHVyYXRpb25TZWNvbmRzIjoxNzQsImVuZFJlYXNvbiI6IkxvY2FsIiwiZW5kZWRBdCI6IjIwMjYtMDItMTNUMTQ6MzM6MDIuNDAwWiIsIm1ldGVyVmFsdWVzIjp7ImNvbnN1bWFibGVNbCI6NDcwLCJlbmVyZ3lXaCI6MTIwLCJsaXF1aWRNbCI6Mzk4MDB9LCJvZmZsaW5lVHhJZCI6Im90eF9lNWY2YTdiOGM5ZDAiLCJzZXJ2aWNlSWQiOiJzdmNfZWNvIiwic2Vzc2lvbklkIjoic2Vzc19jNGQ1ZTZmN2E4YjkiLCJzdGFydGVkQXQiOiIyMDI2LTAyLTEzVDE0OjMwOjA4LjUwMFoiLCJzdGF0aW9uSWQiOiJzdG5fYTFiMmMzZDQiLCJ0eENvdW50ZXIiOjgsInVzZXJJZCI6InN1Yl9hbGljZTIwMjYifQ==",
    "signature": "MEUCIQC5Ont2E3TnPYbB7s3OMCFKGNc1NcWiHnCpcLM5SyGZrgIgLGs9bpdYUR02K+2gHZPgTPMLw3/sCoOMgK3vPO1D+yo=",
    "signatureAlgorithm": "ECDSA-P256-SHA256"
  },
  "txCounter": 8
}
```

The app stores this receipt in its offline transaction log. Since Alice's phone is online, it uploads the receipt at once, as it does every receipt it holds ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload)).

---

### Step 18: App Displays Session Summary (14:33:04.500)

**What Alice sees:**

The app transitions to the SessionCompletedScreen:

```
+----------------------------------+
|        Service completed        |
|                                  |
|   Eco Program - Bay 1           |
|   Duration: 2m 54s                 |
|                                  |
|   Credits debited (server): 50   |
|   Credits used:            29    |
|   Refund pending:          +21   |
|                                  |
|   Current balance: 70 credits        |
|   (refund: ~91 credits)      |
|                                  |
|   Liquid: 39.8L | Consumable: 470mL     |
|                                  |
|   Mode: Partial Offline (BLE)     |
|                                  |
|  [Rate service]  [Home]   |
+----------------------------------+
```

The server pre-debited 50 credits. It settles the session from whichever copy of the signed receipt reaches it first — here the app's upload in Step 19, otherwise the station's TransactionEvent — and refunds what the session did not cost: the true-up is refund-only and never exceeds the authorization's `creditsAuthorized` ([`reconciliation.md` §8.2](../../spec/profiles/offline/reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)).

---

### Step 19: App Uploads the Receipt (14:33:05.000)

Since Alice's phone is online, the app uploads the receipt at once ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload)). The request body is the Receipt of Step 17, exactly as the app received it on FFF6.

**HTTP Request:**

```http
POST /api/v1/offline/receipts HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_sync_9e0f1a2b
```

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_sync_9e0f1a2b

{
  "status": "Accepted"
}
```

The server processes the upload as it processes a station's TransactionEvent — deduplication, receipt signature verification, the reconcile-time gate, settlement, then fraud scoring — and answers with the body of a TransactionEvent RESPONSE. Settlement is the refund-only true-up of the pre-debit: the server recomputes the cost from the signed receipt (Eco Program is a `UserDuration` service in this operator's catalog, so Alice's stop, `endReason` `Local`, is billed pro-rata on the 174 seconds delivered), caps it at `creditsAuthorized`, and refunds the difference:

| Field | Value |
|-------|-------|
| Pre-debited credits (`creditsAuthorized`) | 50 |
| Recomputed cost, capped at `creditsAuthorized` | 29 |
| Refund | 50 - 29 = **21 credits** |
| Alice's new balance | 70 + 21 = **91 credits** |

---

### Step 20: What the Operator Sees

On the Operator Dashboard, Charlie sees:

1. Station `stn_a1b2c3d4` is marked as **Offline** (red indicator) — MQTT disconnected
2. A new session log entry appears (from the app-side sync):

```
[14:33:05] Session sess_c4d5e6f7a8b9 completed (Partial A)
           User: Alice | Bay 1 | Eco Program
           Duration: 2m 54s | Credits: 29/50 (21 refunded)
           Liquid: 39.8L | Consumable: 470mL
           Auth: Server-signed ECDSA P-256 (delivered via BLE)
           Station sync: Pending (station offline)
```

3. The session is settled from the app's copy and flagged "Station sync pending". When the station's MQTT reconnects and it sends its TransactionEvent [MSG-007] for the same receipt, the server answers `Duplicate`, because the signed data is byte-identical, and the station deletes its record ([`reconciliation.md` §3](../../spec/profiles/offline/reconciliation.md#3-deduplication-offlinetxid))

## Message Sequence Diagram

```
  Alice(App)              Server                  Station (stn_a1b2c3d4)
     |                      |                          |
     |                      |              [MQTT down]  |
     |                      |                          |
     | -- BLE connect ------|------------------------->|
     |                      |                          |
     | -- Read FFF1 --------|------------------------->|
     |<-------- StationInfo (offline) -----------------|
     |                      |                          |
     | -- Write FFF2 0x01 --|------------------------->|
     |<-------- Notify FFF2: AvailableServices ---------|
     |                      |                          |
     |  POST /offline-auth  |                          |
     |--------------------->|                          |
     |                      | validate, debit 50cr     |
     |                      | sign ECDSA P-256 auth        |
     |  200 OK (signedAuth, |                          |
     |   trustBundle)       |                          |
     |<---------------------|                          |
     |                      |                          |
     | -- Write FFF3: Hello -------------------------->|
     |<-------- FFF4: Challenge (offline, certificate, signature)
     |                      |                          |
     |  verify certificate and signature (trust bundle) |
     | -- Write FFF3: ServerSignedAuth ------------->|
     |                      |                  verify  |
     |                      |                 ECDSA P-256  |
     |<-------- FFF4: AuthResponse (Accepted) --------|
     |                      |                          |
     | -- Write FFF3: StartServiceRequest ---------->|
     |                      |                  start   |
     |                      |                  pump    |
     |<-------- FFF4: StartServiceResponse ----------|
     |                      |                          |
     |<-------- FFF5: ServiceStatus (Running, 60s) ----|
     |<-------- FFF5: ServiceStatus (Running, 120s) ---|
     |                      |                          |
     | -- Write FFF3: StopServiceRequest ----------->|
     |                      |                  stop    |
     |                      |                  pump    |
     |<-------- FFF4: StopServiceResponse (174s) ----|
     |<-------- FFF5: ServiceStatus (ReceiptReady) ---|
     |                      |                          |
     | -- Write FFF6: ReceiptRequest ----------------->|
     |<-------- FFF6: ReceiptResponse (ECDSA-signed receipt)
     |                      |                          |
     | -- BLE disconnect -->|                          |
     |                      |                          |
     |  POST /receipts      |                          |
     |--------------------->|                          |
     |                      | verify, gate, settle     |
     |                      | refund 21 credits        |
     |  200 OK (Accepted)   |                          |
     |<---------------------|                          |
     |                      |                          |
```

## Key Design Decisions

1. **Credits are debited server-side before the BLE handshake.** In Partial A, the server is reachable, so billing happens upfront at step 5. This means the station does not need to make credit decisions locally. The server pre-debits the maximum (50 credits for 5 minutes) and refunds the difference after actual usage is known. That maximum is the authorization's signed `creditsAuthorized`, and it caps what the session may be charged: the true-up is refund-only and never debits more, even if the tariff rose while the station was offline ([`reconciliation.md` §8.2](../../spec/profiles/offline/reconciliation.md#82-prior-authorization-debit-settle-once-true-up--partial-a-partial-b-offline-fallback)).

2. **ECDSA P-256 signature provides server trust without connectivity.** The station trusts the authorization because it can verify the server's ECDSA P-256 signature with a key of the server key set (`OfflinePassPublicKey`) it holds — delivered at provisioning, at every boot and by ChangeConfiguration. No network round-trip is needed. During a key rotation the set holds both the old and the new key; there is no internally cached previous key and no grace period ([`06-security.md` §6.7](../../spec/06-security.md#67-server-signing-key-rotation-ecdsa-p-256)).

3. **The signed authorization has a 5-minute expiry window.** The `expiresAt` field prevents replay attacks. If Alice takes more than 5 minutes between obtaining the authorization and presenting it to the station via BLE, the station will reject it, and it starts no session after `expiresAt`. A session started before it runs its whole duration, past `expiresAt` if it must: the server judges the authorization against the signed `startedAt` ([`reconciliation.md` §6.7](../../spec/profiles/offline/reconciliation.md#67-partial-a-reconciliation-auth-form--findings-n2--n3--q4) check #9). This is a deliberate trade-off between security and usability.

4. **The app's upload provides a fast reconciliation path.** Since Alice's phone is online, the app uploads the receipt at once ([`app-contract.md` §4](../../spec/profiles/offline/app-contract.md#4-receipt-upload)). This means the refund happens within seconds, not hours. Whichever copy of the station-signed receipt arrives first may settle: the station's TransactionEvent, sent when MQTT reconnects, carries the same signed data and is answered `Duplicate`.

5. **The receipt is signed with ECDSA P-256 regardless of online status.** Even though the server already knows about this session (it created it at step 5), the station still generates a cryptographic receipt. This provides non-repudiation and allows the server to verify that the station actually delivered the service as authorized.

6. **The station continues to operate in BLE-only mode.** The MQTT outage does not prevent the station from serving customers. As long as users can reach the server (Partial A) or have an OfflinePass (Full Offline), the station remains functional through BLE.
