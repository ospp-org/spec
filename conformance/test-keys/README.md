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

## Derivation

- **ECDSA keypairs**: generated with `openssl ecparam -name prime256v1 -genkey -noout`. Private keys are random per generation; the public-key counterpart is what verifiers consume. Public keys committed alongside privates so the *whole conformance suite* is reproducible end-to-end (signing, then verifying, then re-signing).
- **`session-test-key.bin`**: deterministic, re-derivable via `printf '%s' "OSPP_TEST_SESSION_KEY_V1" | openssl dgst -sha256 -binary > session-test-key.bin`. This anchors the HMAC test vectors to a known seed string anyone can reproduce.
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
- **Server ECDSA key**: generated and stored in the server HSM / Vault. Public key distributed to stations via provisioning + `ChangeConfiguration` (`OfflinePassPublicKey`).
- **Firmware code-signing key**: held by the firmware release pipeline. Public certificate pre-provisioned to the station's secure element.
- **HMAC session key**: derived per-boot per `06-security.md` §5.2, never reused across sessions.

None of the test keys in this directory are present in any production deployment. They exist solely to make the synthetic test vectors verifiable in CI and by external implementers.
