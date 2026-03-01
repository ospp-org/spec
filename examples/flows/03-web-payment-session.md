# Flow 03: Web Payment Session (Anonymous)

## Scenario

A man pulls into bay 2 of "Station Alpha -- Example City". He does not have the the app and no account. He notices a QR code sticker on the bay pillar, scans it with his phone camera, and the default browser opens a payment page. He selects "Standard Program" (standard program service), pays 15 XXX by card with 3D Secure verification through PG, and the station starts the service. The server reserves the bay via MQTT before redirecting to payment, then sends StartService after the PG webhook confirms capture. The session runs for 5 minutes at the per-minute rate of 0.40 XXX/min (8 credits/min), uses the full pre-paid duration, and completes naturally when the timer expires.

## Participants

| Actor | Identity |
|-------|----------|
| User | Anonymous (no account, no app) |
| Browser | Default mobile browser (Chrome on Android) |
| Server | CSMS (`api.example.com`) |
| Station | `stn_a1b2c3d4` "SSP-3000" by AcmeCorp |
| Bay | `bay_a2b3c4d5e6f7` (Bay 2) |
| Service | `svc_standard` (Standard Program, 8 credits/min, 0.40 XXX/min, metered) |
| Payment Gateway | Payment Gateway (3D Secure card processing) |

## Pre-conditions

- Station `stn_a1b2c3d4` is online (MQTT connected, boot accepted)
- Bay 2 (`bay_a2b3c4d5e6f7`) status: `Available`
- PG payment gateway is operational
- QR code on bay 2 encodes: `https://pay.example.com/s/stn_a1b2c3d4`

## Timeline

```
14:20:00.000  User scans QR code, browser opens pay.example.com
14:20:01.200  Browser fetches station info (GET /pay/{code}/info)
14:20:01.800  Browser fetches bay list with services (GET /pay/{code}/bays)
14:20:15.000  User selects Bay 2, Standard Program, taps "Pay 15 XXX"
14:20:15.300  Browser sends POST /pay/{code}/start
14:20:15.600  Server sends ReserveBay REQUEST to station via MQTT
14:20:15.900  Station reserves bay 2, sends ReserveBay RESPONSE Accepted
14:20:16.100  Station sends StatusNotification: Available -> Reserved
14:20:16.500  Server creates PaymentIntent, returns PG redirect URL
14:20:17.000  Browser redirects to PG 3D Secure page
14:20:45.000  User completes 3D Secure verification
14:20:45.500  PG sends POST /webhooks/payment-gateway/notification to server
14:20:45.800  Server verifies HMAC, updates PaymentIntent -> captured
14:20:46.000  Server sends StartService REQUEST to station via MQTT
14:20:46.400  Station activates service hardware, sends StartService RESPONSE Accepted
14:20:46.600  Station sends StatusNotification: Reserved -> Occupied
14:20:46.800  Server updates session -> active, returns status to browser
14:21:46.000  Station sends MeterValues (1 min mark, MeterValuesInterval configured to 60s for this example; default is 15s)
14:22:46.000  Station sends MeterValues (2 min mark)
14:23:46.000  Station sends MeterValues (3 min mark)
14:24:46.000  Station sends MeterValues (4 min mark)
14:25:46.000  Timer expires (300s), station auto-stops the service
14:25:46.200  Station sends StatusNotification: Occupied -> Finishing
14:25:48.000  Station sends StatusNotification: Finishing -> Available
14:25:48.500  Server marks session as completed
14:25:49.000  Browser shows "Service completed" (service complete)
```

## Step-by-Step Detail

---

### Step 1: User Scans QR Code (14:20:00.000)

**What the user sees:**

The man holds his phone camera over the QR sticker on the bay 2 pillar. Android recognizes the URL and opens Chrome. The page loads a clean, mobile-optimized interface with the station logo, station name, and address.

---

### Step 2: Browser Fetches Station Info (14:20:01.200)

**HTTP Request:**

```http
GET /api/v1/pay/stn_a1b2c3d4/info HTTP/1.1
Host: api.example.com
Accept: application/json
```

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "stationId": "stn_a1b2c3d4",
  "stationName": "SSP-3000",
  "stationVendor": "AcmeCorp",
  "locationName": "Station Alpha -- Example City",
  "address": "123 Main Street, Example City",
  "status": "Online",
  "bayCount": 3
}
```

---

### Step 3: Browser Fetches Available Bays and Services (14:20:01.800)

**HTTP Request:**

```http
GET /api/v1/pay/stn_a1b2c3d4/bays HTTP/1.1
Host: api.example.com
Accept: application/json
```

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "bays": [
    {
      "bayId": "bay_c1d2e3f4a5b6",
      "bayNumber": 1,
      "status": "Occupied",
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "priceLocal": 5.00,
          "priceLocalPerMinute": 50,
          "pricingType": "PerMinute",
          "available": true
        },
        {
          "serviceId": "svc_standard",
          "serviceName": "Standard Program",
          "priceLocal": 4.00,
          "priceLocalPerMinute": 40,
          "pricingType": "PerMinute",
          "available": true
        }
      ]
    },
    {
      "bayId": "bay_a2b3c4d5e6f7",
      "bayNumber": 2,
      "status": "Available",
      "services": [
        {
          "serviceId": "svc_eco",
          "serviceName": "Eco Program",
          "priceLocal": 5.00,
          "priceLocalPerMinute": 50,
          "pricingType": "PerMinute",
          "available": true
        },
        {
          "serviceId": "svc_standard",
          "serviceName": "Standard Program",
          "priceLocal": 4.00,
          "priceLocalPerMinute": 40,
          "pricingType": "PerMinute",
          "available": true
        }
      ]
    }
  ]
}
```

**What the user sees:**

Bay 1 is greyed out with a "In use" badge. Bay 2 shows a green "Available" badge. Under Bay 2, two service cards appear: "Eco Program (0.50 XXX/min)" and "Standard Program (0.40 XXX/min)". The user taps "Standard Program", sets the duration slider to 5 minutes (showing "15.00 XXX"), and enters his email (optional, for receipt).

---

### Step 4: Browser Sends Payment Start Request (14:20:15.300)

**HTTP Request:**

```http
POST /api/v1/pay/stn_a1b2c3d4/start HTTP/1.1
Host: api.example.com
Content-Type: application/json
CF-Turnstile-Token: 0.AXk9Gz3...

{
  "bayId": "bay_a2b3c4d5e6f7",
  "serviceId": "svc_standard",
  "durationMinutes": 5,
  "amountLocal": 15.00,
  "email": "bob@example.com"
}
```

---

### Step 5: Server Sends ReserveBay REQUEST via MQTT (14:20:15.600)

The server validates the request, creates a reservation with 180-second TTL, and publishes the MQTT command to hold the bay during payment processing.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "cmd_3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
  "messageType": "Request",
  "action": "ReserveBay",
  "timestamp": "2026-02-13T14:20:15.600Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "reservationId": "rsv_a7b8c9d0e1f2",
    "expirationTime": "2026-02-13T14:23:15.600Z",
    "sessionSource": "WebPayment"
  }
}
```

---

### Step 6: Station Reserves Bay 2, Sends ReserveBay RESPONSE (14:20:15.900)

The station controller checks that bay 2 is Available, transitions it to Reserved, and responds.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "cmd_3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
  "messageType": "Response",
  "action": "ReserveBay",
  "timestamp": "2026-02-13T14:20:15.900Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

---

### Step 7: Station Sends StatusNotification - Reserved (14:20:16.100)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "evt_8c9d0e1f-2a3b-4c5d-6e7f-8a9b0c1d2e3f",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T14:20:16.100Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Reserved",
    "previousStatus": "Available",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

---

### Step 8: Server Creates PaymentIntent, Returns Redirect (14:20:16.500)

The server creates a PaymentIntent with PG (`status: created -> pending`), generates a session token (UUID v4, 10-minute TTL), and responds to the browser.

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "sessionToken": "tkn_e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
  "paymentRedirectUrl": "https://secure.payment-gateway.example.com/3ds/verify?orderId=PG-202602131420-a2b3c4&amount=1500&currency=XXX&returnUrl=https://pay.example.com/s/stn_a1b2c3d4/status/tkn_e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
  "expiresAt": "2026-02-13T14:30:16.500Z",
  "amountLocal": 15.00,
  "bay": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2
  },
  "service": {
    "serviceId": "svc_standard",
    "serviceName": "Standard Program"
  }
}
```

---

### Step 9: 3D Secure Verification (14:20:17.000 - 14:20:45.000)

**What the user sees:**

The browser redirects to PG's 3D Secure page. The bank's authentication screen appears, showing "Confirm payment of 15.00 XXX to EXAMPLE OPERATOR LTD". The user enters his SMS OTP code and taps "Confirm". PG processes the authorization.

---

### Step 10: PG Sends Payment Webhook (14:20:45.500)

**HTTP Request (PG -> OSPP Server):**

```http
POST /api/v1/webhooks/payment-gateway/notification HTTP/1.1
Host: api.example.com
Content-Type: application/json
X-PG-Signature: sha512=a7f3b2e1d9c8f4a6b5e0d2c1f8a9b7e6d3c4f5a0b1e2d3c4f5a6b7e8d9c0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3

{
  "orderId": "PG-202602131420-a2b3c4",
  "amount": 1500,
  "currency": "XXX",
  "status": "captured",
  "cardMask": "4111****1111",
  "authCode": "A83B21",
  "processedAt": "2026-02-13T14:20:45.200Z",
  "transactionId": "pg_tx_9f8e7d6c5b4a3210"
}
```

The server:
1. Verifies the HMAC-SHA512 signature using timing-safe comparison
2. Validates the `orderId` matches the pending PaymentIntent
3. Updates PaymentIntent from `pending` to `captured`
4. Creates a session record: `sess_b2c3d4e5` with `status: pending_ack`

---

### Step 11: Server Sends StartService REQUEST via MQTT (14:20:46.000)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-station`

```json
{
  "messageId": "cmd_1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "messageType": "Request",
  "action": "StartService",
  "timestamp": "2026-02-13T14:20:46.000Z",
  "source": "Server",
  "protocolVersion": "0.1.0",
  "payload": {
    "sessionId": "sess_b2c3d4e5",
    "bayId": "bay_a2b3c4d5e6f7",
    "serviceId": "svc_standard",
    "durationSeconds": 300,
    "sessionSource": "WebPayment",
    "reservationId": "rsv_a7b8c9d0e1f2",
    "params": {}
  }
}
```

---

### Step 12: Station Activates Standard Program Pump, Sends StartService RESPONSE (14:20:46.400)

The station controller:
1. Validates bay 2 is Reserved with matching `reservationId`
2. Consumes the reservation
3. Opens the service dispenser on bay 2
4. Starts the 300-second session timer

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "cmd_1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "messageType": "Response",
  "action": "StartService",
  "timestamp": "2026-02-13T14:20:46.400Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "status": "Accepted"
  }
}
```

---

### Step 13: Station Sends StatusNotification - Occupied (14:20:46.600)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "evt_4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T14:20:46.600Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Occupied",
    "previousStatus": "Reserved",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

---

### Step 14: Browser Polls Session Status (14:20:46.800 onward)

The server updates the session to `active`. The browser's return URL loads and begins polling.

**HTTP Request (browser polls every 5s):**

```http
GET /api/v1/pay/sessions/tkn_e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b/status HTTP/1.1
Host: api.example.com
```

**HTTP Response (mid-session, ~2 minutes in):**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "active",
  "service": {
    "serviceId": "svc_standard",
    "serviceName": "Standard Program"
  },
  "bay": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2
  },
  "timing": {
    "startedAt": "2026-02-13T14:20:46.400Z",
    "elapsedSeconds": 120,
    "remainingSeconds": 180,
    "durationSeconds": 300
  },
  "payment": {
    "amountLocal": 15.00,
    "method": "card",
    "cardMask": "4111****1111"
  }
}
```

**What the user sees:**

A progress screen showing "Standard Program - Bay 2" with a circular timer counting down from 5:00. A pulsing blue water-drop animation indicates the service is active. The page reads: "Service in progress. Do not close this page."

---

### Step 15: Station Sends Periodic MeterValues (every 60s)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

**At 14:21:46.000 (1 minute):**

```json
{
  "messageId": "evt_m1v1_a2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T14:21:46.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "sessionId": "sess_b2c3d4e5",
    "timestamp": "2026-02-13T14:21:46.000Z",
    "values": {
      "liquidMl": 12400,
      "energyWh": 45
    }
  }
}
```

**At 14:24:46.000 (4 minutes):**

```json
{
  "messageId": "evt_m4v4_f8a9b0c1-d2e3-4f5a-6b7c-8d9e0f1a2b3c",
  "messageType": "Event",
  "action": "MeterValues",
  "timestamp": "2026-02-13T14:24:46.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "sessionId": "sess_b2c3d4e5",
    "timestamp": "2026-02-13T14:24:46.000Z",
    "values": {
      "liquidMl": 49600,
      "energyWh": 175
    }
  }
}
```

---

### Step 16: Timer Expires, Station Auto-Stops Service (14:25:46.000)

After 300 seconds, the station's session timer fires. The station controller:
1. Closes the service dispenser on bay 2
2. Reads the final meter values
3. Transitions bay 2 to `Finishing`

---

### Step 17: Station Sends StatusNotification - Finishing (14:25:46.200)

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "evt_7e8f9a0b-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T14:25:46.200Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Finishing",
    "previousStatus": "Occupied",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

---

### Step 18: Station Sends StatusNotification - Available (14:25:48.000)

After the drain cycle completes (~2 seconds), bay 2 returns to Available.

**MQTT Topic:** `ospp/v1/stations/stn_a1b2c3d4/to-server`

```json
{
  "messageId": "evt_0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
  "messageType": "Event",
  "action": "StatusNotification",
  "timestamp": "2026-02-13T14:25:48.000Z",
  "source": "Station",
  "protocolVersion": "0.1.0",
  "payload": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2,
    "status": "Available",
    "previousStatus": "Finishing",
    "services": [
      { "serviceId": "svc_eco", "available": true },
      { "serviceId": "svc_standard", "available": true }
    ]
  }
}
```

---

### Step 19: Server Marks Session Complete (14:25:48.500)

The server processes the completion:

| Field | Value |
|-------|-------|
| Session ID | `sess_b2c3d4e5` |
| Duration | 300 seconds (5m 0s) |
| Service rate | 0.40 XXX/min (8 credits/min) |
| Billed minutes | 5 |
| Amount charged | 15.00 XXX |
| Refund | 0.00 XXX (full duration used) |
| Water consumed | ~62.0 L |
| Energy consumed | ~0.22 kWh |

The server:
1. Marks session `sess_b2c3d4e5` as `completed`
2. Updates PaymentIntent from `captured` to `settled`
3. Sends a receipt email to `bob@example.com`

---

### Step 20: Browser Shows Completion (14:25:49.000)

The next polling response returns the completed status:

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "completed",
  "service": {
    "serviceId": "svc_standard",
    "serviceName": "Standard Program"
  },
  "bay": {
    "bayId": "bay_a2b3c4d5e6f7",
    "bayNumber": 2
  },
  "timing": {
    "startedAt": "2026-02-13T14:20:46.400Z",
    "completedAt": "2026-02-13T14:25:46.000Z",
    "durationSeconds": 300,
    "durationFormatted": "5m 0s"
  },
  "payment": {
    "amountLocal": 15.00,
    "method": "card",
    "cardMask": "4111****1111",
    "refundLocal": 0.00
  },
  "meterValues": {
    "liquidMl": 62000,
    "energyWh": 220
  }
}
```

**What the user sees:**

```
+----------------------------------+
|        Service completed!         |
|                                  |
|   Standard Program - Bay 2             |
|   Duration: 5m 0s                  |
|                                  |
|   Amount paid: 15.00 XXX        |
|   Card: 4111****1111             |
|                                  |
|   Liquid: 62.0L | Energy: 0.22kWh |
|                                  |
|   Receipt sent by email.     |
|                                  |
|  [Create account]  [Close] |
+----------------------------------+
```

---

### Step 21: What the Operator Sees

On the Operator Dashboard, the operator sees:

1. Bay 2 indicator transitions from blue ("Reserved") to green-pulsing ("In use") to yellow ("Finishing") to green-solid ("Available")
2. The session log updates with a new completed entry:

```
[14:25:48] Session sess_b2c3d4e5 completed
           Anonymous (web) | Bay 2 | Standard Program
           Duration: 5m 0s | 15.00 XXX (card)
           Liquid: 62.0L | Energy: 0.22 kWh
```

3. The station revenue counter updates: +15.00 XXX for this session

## Message Sequence Diagram

```
  Browser              Server                  Station (stn_a1b2c3d4)      PG
     |                    |                          |                        |
     |  GET /pay/info     |                          |                        |
     |------------------>|                          |                        |
     |  200 OK            |                          |                        |
     |<------------------|                          |                        |
     |  GET /pay/bays     |                          |                        |
     |------------------>|                          |                        |
     |  200 OK            |                          |                        |
     |<------------------|                          |                        |
     |                    |                          |                        |
     |  POST /pay/start   |                          |                        |
     |------------------>|                          |                        |
     |                    |  ReserveBay REQUEST       |                        |
     |                    |------------------------->|                        |
     |                    |  ReserveBay RESPONSE      |                        |
     |                    |<-------------------------|                        |
     |                    |  StatusNotif (Reserved)   |                        |
     |                    |<-------------------------|                        |
     |                    |                          |                        |
     |  200 {redirectUrl} |                          |                        |
     |<------------------|                          |                        |
     |                    |                          |                        |
     |  3DS redirect      |                          |                        |
     |--------------------------------------------------------------->       |
     |  3DS complete       |                          |                        |
     |<---------------------------------------------------------------       |
     |                    |                          |                        |
     |                    |  POST /webhooks/payment   |                        |
     |                    |<--------------------------------------------------
     |                    |                          |                        |
     |                    |  StartService REQUEST     |                        |
     |                    |------------------------->|                        |
     |                    |                          | activate pump          |
     |                    |  StartService RESPONSE    |                        |
     |                    |<-------------------------|                        |
     |                    |  StatusNotif (Occupied)   |                        |
     |                    |<-------------------------|                        |
     |                    |                          |                        |
     |  GET /status (poll)|                          |                        |
     |------------------>|                          |                        |
     |  200 {active}      |                          |                        |
     |<------------------|                          |                        |
     |                    |                          |                        |
     |                    |  MeterValues (periodic)   |                        |
     |                    |<-------------------------|                        |
     |                    |         ...               |                        |
     |                    |                          |                        |
     |                    |                          | timer expires          |
     |                    |  StatusNotif (Finishing)  |                        |
     |                    |<-------------------------|                        |
     |                    |  StatusNotif (Available)  |                        |
     |                    |<-------------------------|                        |
     |                    |                          |                        |
     |  GET /status (poll)|                          |                        |
     |------------------>|                          |                        |
     |  200 {completed}   |                          |                        |
     |<------------------|                          |                        |
     |                    |                          |                        |
```

## Key Design Decisions

1. **Reserve before payment, not after.** The ReserveBay command is sent immediately when the user taps "Pay", before redirecting to PG. This prevents another user from starting a session on the same bay during the 30-second payment window. The 180-second reservation TTL provides ample time for 3D Secure completion while automatically releasing the bay if payment is abandoned.

2. **StartService retry policy (web payment).** Because the user has already paid when StartService is sent, the server retries up to 4 times with delays of 0s, +5s, +10s, +15s (each with a 10s timeout). If all retries fail, the server sends CancelReservation and initiates a full refund via PG. This is more aggressive than the mobile app's single-attempt policy because a paid anonymous user cannot easily retry.

3. **Session token, not session ID.** The browser receives a `sessionToken` (UUID v4, 10-minute TTL) rather than the internal `sessionId`. This prevents enumeration of session IDs and limits the anonymous user's access window. The token is single-purpose: it can only poll the status of this specific session.

4. **Anti-abuse: 5-layer defense.** Anonymous web payments are protected by: (1) IP rate limiting (5 sessions/30 min per IP), (2) device fingerprinting (3 sessions/30 min), (3) progressive CAPTCHA via Cloudflare Turnstile on suspicious patterns, (4) abandon scoring (5+ abandoned sessions trigger a 15-min block), and (5) bay lock only at `POST /pay/start` (browsing does not lock resources).

5. **Natural completion via StatusNotification.** Unlike the mobile app flow where the user explicitly stops the session, web payment sessions run for the full pre-paid duration. The station auto-stops when the timer expires and reports completion through the standard StatusNotification state machine (Occupied -> Finishing -> Available). The server detects session completion from the Finishing notification.

6. **PG webhook HMAC verification.** The server verifies the `X-PG-Signature` header using HMAC-SHA512 with timing-safe comparison. Tampered or replayed webhooks are rejected silently, and a SecurityEvent is logged for investigation. The PaymentIntent has a 5-minute expiration window from creation to capture.
