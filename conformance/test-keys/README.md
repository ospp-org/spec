# Synthetic Test Keys — OSPP Conformance Vectors

**WARNING: These are SYNTHETIC TEST KEYS, public by design.**
**NEVER use these in production. Committed intentionally so the conformance
vectors and example payloads can be re-verified by any implementer.**

## Inventory

| Key | Algorithm | Purpose |
|---|---|---|
| `station-test-key.pem` / `station-test-pub.pem` | ECDSA P-256 (prime256v1) | Station-side receipt signing (spec §6.2). Signs `receipt.data` canonical bytes. |
| `server-test-key.pem` / `server-test-pub.pem` | ECDSA P-256 (prime256v1) | Server-side OfflinePass signing (`profiles/offline/offline-pass.md`) and ServerSignedAuth signing (`profiles/offline/ble-handshake.md` §4.2). |
| `firmware-test-key.pem` / `firmware-test-pub.pem` | ECDSA P-256 (prime256v1) | Firmware image code-signing (spec §4.6). Signs the firmware binary referenced by `firmwareUrl` — NOT the JSON payload. |
| `session-test-key.bin` | HMAC-SHA256 secret (32 bytes raw) | BLE handshake sessionProof + sessionKeyConfirmation HMACs (`profiles/offline/ble-handshake.md` §4-§5). |
| `station-ca-test-key.pem` / `station-ca-test-cert.pem` / `station-ca-test-crl.pem` | ECDSA P-256 (prime256v1) | The Station CA of the trust bundle in [`offline-pass-issuance.response.json`](../../examples/payloads/http/offline-pass-issuance.response.json): its self-signed certificate and an empty CRL ([`app-contract.md` §3.4](../../spec/profiles/offline/app-contract.md#34-the-trust-bundle)). |

## Derivation

- **ECDSA keypairs**: generated with `openssl ecparam -name prime256v1 -genkey -noout`. Private keys are random per generation; the public-key counterpart is what verifiers consume. Public keys committed alongside privates so the *whole conformance suite* is reproducible end-to-end (signing, then verifying, then re-signing).
- **`session-test-key.bin`**: deterministic, re-derivable via `printf '%s' "OSPP_TEST_SESSION_KEY_V1" | openssl dgst -sha256 -binary > session-test-key.bin`. This anchors the HMAC test vectors to a known seed string anyone can reproduce.
- **OfflinePass fixtures — device key and signing key.** Every fixture OfflinePass carries a `devicePublicKey` derived from its own `deviceId`, so no device key file is committed: the private scalar is SHA-256(`"OSPP_TEST_DEVICE_KEY_V1:"` + `deviceId`), interpreted as a big-endian integer, reduced mod (n − 1), plus 1, where n is the order of the P-256 group; the public key is that scalar's point, compressed SEC1, Base64 (44 characters — [`offline-pass.md` §2](../../spec/profiles/offline/offline-pass.md#2-offlinepass-fields)). Every fixture pass carries `keyId` `YjX5pR0TzmU3ubs17wImQQ`, the `keyId` of `server-test-pub.pem`: Base64url, unpadded, of the first 16 bytes of SHA-256 over its DER `SubjectPublicKeyInfo` ([`06-security.md` §6.7](../../spec/06-security.md#67-server-signing-key-rotation-ecdsa-p-256)).
- **Station CA** (the trust bundle fixture): `openssl ecparam -name prime256v1 -genkey -noout -out station-ca-test-key.pem`, then
  `openssl req -new -x509 -key station-ca-test-key.pem -out station-ca-test-cert.pem -days 1826 -subj "/O=OSPP Test/CN=OSPP Test Station CA" -set_serial 0x0550`,
  then `openssl ca -gencrl -out station-ca-test-crl.pem` under a configuration naming that key and certificate, with
  `default_md = sha256`, `default_crl_days = 7` and a `crlnumber` of `1000`. The fixture carries the certificate and the CRL
  as these files hold them; the CRL's `nextUpdate` lies seven days after its `lastUpdate`, and nothing validates it against a clock.
- **Handshake nonces** in the worked documents: deterministic, one label per handshake, re-derivable via
  `printf '%s' "OSPP_TEST_NONCE_V1:<label>:<field>" | openssl dgst -sha256 -binary | base64`
  where `<field>` is `appNonce` or `stationNonce`. SHA-256 is 32 bytes, which is exactly what
  `hello.schema.json` and `challenge.schema.json` require (`^[A-Za-z0-9+/]{43}=$`).
  `tools/verify-test-nonces.mjs` regenerates them with `--write` and verifies them without it.
  **They are derived rather than typed because they were typed, and one pair ended up in four
  different handshakes** — including the negative scenario — while
  [`ble-handshake.md` §4.2.2](../../spec/profiles/offline/ble-handshake.md) rests the claim-layer
  replay defence on the nonce *never being reused across handshakes*. A nonce is schema-valid
  whatever its value, so nothing caught it; the same tool now fails if any literal appears in two
  documents. The nonces under `conformance/test-vectors/` are deliberately **out of scope**: those
  in `crypto/ble-handshake-keyschedule.json` are the anchored inputs of a key schedule and are
  shared with the `hello-*`/`challenge-*` vectors *because* the schedule is derived from those
  exact bytes.

## Verification

Run `tools/verify-example-signatures.mjs` (added in the same change-set that introduces real signatures) to confirm every example payload and every `conformance/test-vectors/valid/**` JSON that carries a signature verifies against the matching public key here.

## Production posture

Production deployments establish their own keys through the operational PKI:

- **Station mTLS client key**: generated on-device during provisioning; the private key never leaves the secure element / NVS. Its CSR is signed by the operator's Station CA. See `profiles/security/certificate-renewal.md`.
- **Station receipt-signing key**: a **separate** on-device ECDSA P-256 key pair, submitted at provisioning as a bare public key and never certified by the Station CA. It **MUST** be distinct from the mTLS client key (`06-security.md` §4.3). The `station-test-key.pem` / `station-test-pub.pem` pair above stands in for this key, not for the mTLS key.
- **Server ECDSA key**: generated and stored in the server HSM / Vault. Its public keys form the server key set. A station receives the key currently signing at provisioning (`serverVerifyKey`), and the whole set as `OfflinePassPublicKey` at every boot, in the configuration of the `Accepted` BootNotification RESPONSE, and by `ChangeConfiguration`; the app receives the set in the trust bundle of every pass issuance ([`06-security.md` §6.7](../../spec/06-security.md#67-server-signing-key-rotation-ecdsa-p-256)).
- **Firmware code-signing key**: held by the firmware release pipeline. Public certificate pre-provisioned to the station's secure element.
- **HMAC session key**: derived per-boot per `06-security.md` §5.2, never reused across sessions.

None of the test keys in this directory are present in any production deployment. They exist solely to make the synthetic test vectors verifiable in CI and by external implementers.
