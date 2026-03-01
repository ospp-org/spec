# Flow 08: Credit Purchase (Wallet Top-Up)

## Scenario

Alice checks her wallet balance in the app and sees she only has 20 credits remaining -- not enough for a full Eco Program service. She decides to buy the 100-credit top-up package for 45.00 XXX. The app fetches available packages, Alice selects one, initiates payment via card through PG (payment processor), completes the 3D Secure flow, and the server credits her wallet upon receiving the PG webhook confirmation.

This is a **REST-only flow** -- no MQTT messages are involved. The station plays no role in credit purchases.

## Participants

| Actor | Identity |
|-------|----------|
| User | Alice (`sub_alice2026`), device `device_a8f3bc12e4567890` |
| App | the mobile app (React Native / Expo) |
| Server | CSMS (`api.example.com`) |
| Payment | Payment Gateway (`secure.payment-gateway.example.com`) |

## Pre-conditions

- Alice is authenticated and on the HomeScreen
- Current wallet balance: **20 credits**
- PG merchant account is active, card payments enabled
- Alice has a saved Visa card ending in 4821

## Timeline

```
09:45:00.000  Alice taps "Credits" tab, sees balance of 20 credits
09:45:00.500  App sends GET /wallet/topup-packages
09:45:00.850  Server responds with 3 available packages
09:45:01.200  Alice sees package list, taps "100 credits - 45.00 XXX"
09:45:03.000  Alice taps "Pay by card"
09:45:03.300  App sends POST /wallet/topup
09:45:03.800  Server creates PaymentIntent, returns PG redirect URL
09:45:04.500  App opens in-app browser with PG payment page
09:45:15.000  Alice enters CVV, confirms 3D Secure
09:45:25.000  PG processes payment, redirects to success URL
09:45:25.500  PG sends webhook to server (IPN)
09:45:25.800  Server validates webhook signature, credits wallet
09:45:26.000  Server responds to app's polling with payment confirmation
09:45:26.500  App displays "Payment successful! You now have 120 credits"
```

## Step-by-Step Detail

---

### Step 1: Alice Opens Wallet Screen (09:45:00.000)

**What Alice sees:**

The WalletScreen shows her current balance prominently:

```
+----------------------------------+
|         Wallet                  |
|                                  |
|        20 credits                |
|                                  |
|   [Buy credits]              |
|                                  |
|   Transaction history:           |
|   -50  Eco Program  12 Feb      |
|   -24  Standard Program    11 Feb      |
|   +100 Top-up card   08 Feb      |
+----------------------------------+
```

Alice taps "Buy credits" to navigate to the TopUpScreen.

---

### Step 2: App Fetches Top-Up Packages (09:45:00.500)

**HTTP Request:**

```http
GET /api/v1/wallet/topup-packages HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_pkg_1a2b3c4d
Accept: application/json
```

**HTTP Response (09:45:00.850):**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_pkg_1a2b3c4d
Cache-Control: max-age=300

{
  "packages": [
    {
      "packageId": "pkg_50",
      "credits": 50,
      "price": {
        "amount": 2500,
        "currency": "XXX",
        "formatted": "25.00 XXX"
      },
      "pricePerCredit": {
        "amount": 50,
        "formatted": "0.50 XXX"
      },
      "badge": null
    },
    {
      "packageId": "pkg_100",
      "credits": 100,
      "price": {
        "amount": 4500,
        "currency": "XXX",
        "formatted": "45.00 XXX"
      },
      "pricePerCredit": {
        "amount": 45,
        "formatted": "0.45 XXX"
      },
      "badge": "Most popular"
    },
    {
      "packageId": "pkg_200",
      "credits": 200,
      "price": {
        "amount": 8000,
        "currency": "XXX",
        "formatted": "80.00 XXX"
      },
      "pricePerCredit": {
        "amount": 40,
        "formatted": "0.40 XXX"
      },
      "badge": "Best value"
    }
  ],
  "wallet": {
    "currentBalance": 20
  }
}
```

---

### Step 3: Alice Selects Package (09:45:01.200)

**What Alice sees:**

```
+----------------------------------+
|       Buy credits            |
|    Current balance: 20 credits       |
|                                  |
|  +----------------------------+  |
|  |  50 credits      25.00 XXX|  |
|  |  0.50 XXX/credit          |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  |  100 credits     45.00 XXX|  |  <-- Alice selects this
|  |  0.45 XXX/credit          |  |
|  |  ** Most popular **     |  |
|  +----------------------------+  |
|                                  |
|  +----------------------------+  |
|  |  200 credits     80.00 XXX|  |
|  |  0.40 XXX/credit          |  |
|  |  ** Best value **|  |
|  +----------------------------+  |
|                                  |
|  Payment method:                 |
|  [x] Card Visa ****4821         |
|  [ ] Apple Pay                   |
|  [ ] Google Pay                  |
|                                  |
|  [Buy 100 credits - 45 XXX] |
+----------------------------------+
```

Alice selects the 100-credit package and taps "Buy 100 credits - 45 XXX".

---

### Step 4: App Sends Top-Up Request (09:45:03.300)

**HTTP Request:**

```http
POST /api/v1/wallet/topup HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_topup_5e6f7a8b
Idempotency-Key: idem_topup_2026021309450330_sub_alice2026

{
  "packageId": "pkg_100",
  "paymentMethod": "card",
  "savedCardId": "card_visa_4821",
  "returnUrl": "ospp-app://wallet/topup/callback",
  "metadata": {
    "deviceId": "device_a8f3bc12e4567890",
    "platform": "android",
    "appVersion": "2.4.1"
  }
}
```

---

### Step 5: Server Creates PaymentIntent (09:45:03.800)

The server:
1. Validates the package exists and the price is current
2. Creates an internal `PaymentIntent` record
3. Calls the PG Start API to create a payment session
4. Returns the payment URL to the app

**HTTP Response:**

```http
HTTP/1.1 201 Created
Content-Type: application/json
X-Request-Id: req_topup_5e6f7a8b

{
  "topupId": "topup_c3d4e5f6",
  "status": "pending_payment",
  "package": {
    "packageId": "pkg_100",
    "credits": 100,
    "price": {
      "amount": 4500,
      "currency": "XXX",
      "formatted": "45.00 XXX"
    }
  },
  "payment": {
    "paymentIntentId": "pi_7g8h9i0j",
    "provider": "payment_gateway",
    "amount": 4500,
    "currency": "XXX",
    "redirectUrl": "https://secure.payment-gateway.example.com/pay/pgid_abc123def456",
    "returnUrl": "ospp-app://wallet/topup/callback",
    "expiresAt": "2026-02-13T09:55:03.800Z"
  },
  "statusPollUrl": "/api/v1/wallet/topup/topup_c3d4e5f6/status"
}
```

---

### Step 6: Alice Completes Payment (09:45:04.500 - 09:45:25.000)

The app opens an in-app browser (WebView) pointing to the PG payment page.

**What Alice sees:**

```
+----------------------------------+
|  Payment Gateway                |
|                                  |
|  Merchant: Example Operator Ltd           |
|  Amount: 45.00 XXX               |
|                                  |
|  Card: Visa ****4821             |
|  CVV: [___]                      |
|                                  |
|  [Pay 45.00 XXX]            |
+----------------------------------+
```

Alice enters her CVV and taps "Pay". PG triggers a 3D Secure challenge from her bank. Alice confirms the payment in her banking app (09:45:15.000).

After 3D Secure completes (09:45:25.000), PG:
1. Charges the card 45.00 XXX
2. Redirects the WebView to `ospp-app://wallet/topup/callback?status=confirmed`
3. Sends an IPN (Instant Payment Notification) webhook to the server

---

### Step 7: PG Webhook (09:45:25.500)

**PG notification (server-to-server):**

```http
POST /webhooks/payment-gateway/notification HTTP/1.1
Host: api.example.com
Content-Type: application/x-www-form-urlencoded
X-PG-Signature: sha512=a1b2c3d4e5f6...

env_key=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...&data=BASE64_ENCRYPTED_PAYLOAD
```

**Decrypted IPN payload:**

```json
{
  "payment": {
    "pgID": "pgid_abc123def456",
    "status": 3,
    "code": "00",
    "message": "Approved",
    "amount": 45.00,
    "currency": "XXX",
    "token": {
      "id": "tok_visa_4821_v2",
      "expirationDate": "2028-06"
    }
  },
  "order": {
    "orderID": "topup_c3d4e5f6",
    "description": "OSPP - 100 credits"
  },
  "customer": {
    "email": "alice@example.com"
  }
}
```

---

### Step 8: Server Processes Payment and Credits Wallet (09:45:25.800)

The server:
1. Validates the PG signature using the merchant private key
2. Decrypts the IPN payload
3. Verifies `status: 3` (Paid/Confirmed) and `amount: 45.00 XXX`
4. Matches `orderID: topup_c3d4e5f6` to the internal PaymentIntent
5. Credits Alice's wallet: 20 + 100 = **120 credits**
6. Creates wallet transaction record
7. Responds to PG notification with acknowledgment

**Server IPN Response to PG:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<order type="card" id="topup_c3d4e5f6" timestamp="1739440525">
  <mobilpay timestamp="1739440525" crc="a1b2c3d4e5f6">
    <action type="0">confirmed</action>
    <message>Credit applied</message>
  </mobilpay>
</order>
```

**Internal wallet transaction created:**

```json
{
  "transactionId": "wtx_k1l2m3n4",
  "userId": "sub_alice2026",
  "type": "topup",
  "credits": 100,
  "direction": "credit",
  "balanceBefore": 20,
  "balanceAfter": 120,
  "payment": {
    "paymentIntentId": "pi_7g8h9i0j",
    "provider": "payment_gateway",
    "externalId": "pgid_abc123def456",
    "amount": 4500,
    "currency": "XXX",
    "method": "card",
    "cardLast4": "4821"
  },
  "timestamp": "2026-02-13T09:45:25.800Z"
}
```

---

### Step 9: App Polls for Payment Status (09:45:26.000)

After the in-app browser returns to the app via the deep link callback, the app polls the status endpoint:

**HTTP Request:**

```http
GET /api/v1/wallet/topup/topup_c3d4e5f6/status HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
X-Device-Id: device_a8f3bc12e4567890
X-Request-Id: req_poll_9c0d1e2f
```

**HTTP Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_poll_9c0d1e2f

{
  "topupId": "topup_c3d4e5f6",
  "status": "completed",
  "completedAt": "2026-02-13T09:45:25.800Z",
  "package": {
    "packageId": "pkg_100",
    "credits": 100,
    "price": {
      "amount": 4500,
      "currency": "XXX",
      "formatted": "45.00 XXX"
    }
  },
  "wallet": {
    "previousBalance": 20,
    "creditsAdded": 100,
    "newBalance": 120
  },
  "receipt": {
    "receiptId": "rcp_o5p6q7r8",
    "downloadUrl": "/api/v1/receipts/rcp_o5p6q7r8/pdf"
  }
}
```

---

### Step 10: App Displays Success (09:45:26.500)

**What Alice sees:**

The app navigates to the TopUpSuccessScreen:

```
+----------------------------------+
|            [checkmark]           |
|                                  |
|       Payment successful!             |
|                                  |
|   +100 credits added          |
|                                  |
|   Package: 100 credits            |
|   Payment: 45.00 XXX (card)       |
|   Visa ****4821                  |
|                                  |
|   Previous balance:  20 credits     |
|   Current balance:   120 credits     |
|                                  |
|   [Download receipt]             |
|                                  |
|   [Back to wallet]               |
+----------------------------------+
```

The key message: **"Payment successful! You now have 120 credits"**

A push notification is also sent:

> **OSPP**: Purchased 100 credits. Balance: 120 credits.

---

### What the Operator Dashboard Shows

This transaction appears in Charlie's operator dashboard under "Credit sales":

```
[09:45:25] Top-up completed
           User: Alice | 100 credits | 45.00 XXX
           Method: Card Visa ****4821 | PG
           New balance: 120 credits
```

## Request/Response Summary

| # | Direction | Method | Endpoint | Purpose |
|---|-----------|--------|----------|---------|
| 1 | App -> Server | GET | `/wallet/topup-packages` | Fetch available packages |
| 2 | App -> Server | POST | `/wallet/topup` | Initiate purchase |
| 3 | App -> PG | GET | PG redirect URL | Payment page |
| 4 | PG -> Server | POST | `/webhooks/payment-gateway/notification` | Payment confirmation (IPN) |
| 5 | App -> Server | GET | `/wallet/topup/{id}/status` | Poll for completion |

## Error Scenarios (Not Shown)

| Scenario | Server Response | App Behavior |
|----------|----------------|--------------|
| Card declined | IPN `status: 13` | "Payment declined. Try another card." |
| 3DS timeout | IPN `status: 15` | "Payment session expired." |
| Duplicate IPN | Server deduplicates via `topupId` | No double-credit |
| Network error during poll | App retries 3x with 2s backoff | Shows "Verifying payment..." spinner |
| Package price changed | 409 Conflict | "Price has changed. Please try again." |

## Key Design Decisions

1. **Server-side billing amounts.** The price is always validated server-side against the current package catalog. The app sends only the `packageId`, never the price. This prevents client manipulation.

2. **Idempotency key.** The `Idempotency-Key` header prevents duplicate charges if the app retries the POST due to a network timeout.

3. **Webhook as source of truth.** The server credits the wallet only upon receiving and validating the PG notification webhook, not based on the client-side redirect. This ensures payment is actually captured before crediting.

4. **Polling for status.** After the payment redirect, the app polls the server rather than trusting the redirect parameters. This handles cases where the IPN arrives before or after the redirect.

5. **Amounts in minor units (cents).** All monetary amounts in the API are in the smallest currency unit (minor units). `4500` = 45.00 XXX. This avoids floating-point precision issues.
