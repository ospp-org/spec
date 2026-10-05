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
| `station-ca-test-key.pem` / `station-ca-test-cert.pem` / `station-ca-test-crl.pem` | ECDSA P-256 (prime256v1) | The one Station CA of the trust bundle's set in [`offline-pass-issuance.response.json`](../../examples/payloads/http/offline-pass-issuance.response.json): its self-signed certificate and an empty CRL ([`app-contract.md` §3.4](../../spec/profiles/offline/app-contract.md#34-the-trust-bundle)). It issued every station certificate below. |
| `station-mtls-test-key.pem` / `station-mtls-test-cert.pem` | ECDSA P-256 (prime256v1) | The station's mTLS client key and certificate (`06-security.md` §4.4): subject `O=OSPP Test, CN=stn_a1b2c3d4`, serial `0A01`, key usage `digitalSignature`, extended key usage `clientAuth` and `id-kp-osppBleStation` (`2.25.57399134409609390163880398392748054115`), valid 2026-01-01 to 2026-12-31. The station presents the certificate in the BLE Challenge and signs the Challenge with the key (`06-security.md` §6.5.2). The station's receipt key is the separate `station-test-key.pem`. |
| `station-ca-test-crl-revoking.pem` | — | A CRL of the Station CA that revokes serial `0A03`, for the revoked-certificate case. |
| `station-mtls-test-cert-no-ospp-eku.pem`, `-no-digital-signature.pem`, `-revoked.pem`, `-expired.pem`, `-other-ca.pem` | ECDSA P-256 (prime256v1) | Certificates over the station's mTLS key that the app's verification gate refuses (`06-security.md` §6.5.2): extended key usage `clientAuth` only (serial `0A02`); key usage `keyAgreement` without `digitalSignature` (`0A05`); revoked by `station-ca-test-crl-revoking.pem` (`0A03`); expired on 2026-02-12 (`0A04`); issued by another CA (`0A06`). |
| `station-other-ca-test-key.pem` / `station-other-ca-test-cert.pem` | ECDSA P-256 (prime256v1) | A Station CA no trust bundle holds, the issuer of `station-mtls-test-cert-other-ca.pem`. |
| `station-mtls-test-p384-key.pem` / `station-mtls-test-cert-p384.pem` | ECDSA P-384 (secp384r1) | A station key on another curve and its certificate (serial `0A07`), refused by the gate, which takes only P-256. |

## Derivation

- **ECDSA keypairs**: generated with `openssl ecparam -name prime256v1 -genkey -noout`. Private keys are random per generation; the public-key counterpart is what verifiers consume. Public keys committed alongside privates so the *whole conformance suite* is reproducible end-to-end (signing, then verifying, then re-signing).
- **`session-test-key.bin`**: deterministic, re-derivable via `printf '%s' "OSPP_TEST_SESSION_KEY_V1" | openssl dgst -sha256 -binary > session-test-key.bin`. This anchors the HMAC test vectors to a known seed string anyone can reproduce.
- **OfflinePass fixtures — device key and signing key.** Every fixture OfflinePass carries a `devicePublicKey` derived from its own `deviceId`, so no device key file is committed: the private scalar is SHA-256(`"OSPP_TEST_DEVICE_KEY_V1:"` + `deviceId`), interpreted as a big-endian integer, reduced mod (n − 1), plus 1, where n is the order of the P-256 group; the public key is that scalar's point, compressed SEC1, Base64 (44 characters — [`offline-pass.md` §2](../../spec/profiles/offline/offline-pass.md#2-offlinepass-fields)). Every fixture pass carries `keyId` `YjX5pR0TzmU3ubs17wImQQ`, the `keyId` of `server-test-pub.pem`: Base64url, unpadded, of the first 16 bytes of SHA-256 over its DER `SubjectPublicKeyInfo` ([`06-security.md` §6.7](../../spec/06-security.md#67-server-signing-key-rotation-ecdsa-p-256)).
- **Station CA** (the trust bundle fixture): `openssl ecparam -name prime256v1 -genkey -noout -out station-ca-test-key.pem`.
  Its certificate is issued over that key with a validity that covers every worked document and the trust-bundle
  fixture (2026-02-11 to 2026-02-14): `openssl req -new -key station-ca-test-key.pem -subj "/O=OSPP Test/CN=OSPP Test Station CA"`,
  then `openssl ca -selfsign -keyfile station-ca-test-key.pem -startdate 20250901000000Z -enddate 20300831235959Z` with serial
  `0551` and the extensions `subjectKeyIdentifier = hash`, `authorityKeyIdentifier = keyid`, `basicConstraints = critical,CA:TRUE`.
  The first certificate over the same key, serial `0550`, was valid only from 2026-09-29, after the sessions the documents depict.
  Each CRL comes from `openssl ca -gencrl -crl_lastupdate 20260210000000Z -crl_nextupdate 20260217000000Z` under a configuration
  naming that key and certificate, with `default_md = sha256`: `station-ca-test-crl.pem` with an empty database and a `crlnumber`
  file of `1000` (CRL number 4096), and `station-ca-test-crl-revoking.pem` with serial `0A03` revoked on 2026-01-15 and a
  `crlnumber` file of `1001` (CRL number 4097). The fixtures carry the certificate and the CRL as these files hold them; the app
  uses the CRL it holds also once its `nextUpdate` has passed (`06-security.md` §6.5.2), so nothing validates a CRL against a clock.
- **Station mTLS key and certificates** (BLE station authentication, `06-security.md` §6.5.2):
  `openssl ecparam -name prime256v1 -genkey -noout -out station-mtls-test-key.pem`, a CSR with
  `-subj "/O=OSPP Test/CN=stn_a1b2c3d4"`, and `openssl ca -startdate 20260101000000Z -enddate 20261231235959Z` with the extensions
  `basicConstraints = critical,CA:FALSE`, `keyUsage = critical,digitalSignature`,
  `extendedKeyUsage = clientAuth,2.25.57399134409609390163880398392748054115`,
  `crlDistributionPoints = URI:http://crl.ospp-test.invalid/station-ca.crl`, `subjectKeyIdentifier = hash`,
  `authorityKeyIdentifier = keyid` (serial `0A01`). The negative certificates are issued over the same CSR, changing one thing
  each: `extendedKeyUsage = clientAuth` (`0A02`); serial `0A03`, revoked by the revoking CRL; `-startdate 20250901000000Z
  -enddate 20260212235959Z` (`0A04`); `keyUsage = critical,keyAgreement` (`0A05`); issued by `station-other-ca-test-key.pem`,
  whose certificate is made like the Station CA's with `-subj "/O=OSPP Test/CN=OSPP Test Other Station CA"` and serial `0552`
  (`0A06`). The P-384 pair: `openssl ecparam -name secp384r1 -genkey -noout -out station-mtls-test-p384-key.pem` and its
  certificate with the extensions of `0A01` (serial `0A07`). Private keys are random per generation, like every key here;
  `openssl verify -attime 1770976800 -crl_check` confirms the chain, validity and revocation verdicts at 2026-02-13T10:00:00Z,
  and `tools/generate-ble-vectors.mjs` checks them again before it uses any certificate.
- **The BLE handshake values the tools derive.** `tools/sign-inline-md.mjs` fills, in a worked document, an ephemeral key that is
  not a valid compressed P-256 point with the public key of the scalar derived, as `tools/ble-crypto.mjs` `deriveKeyPair` derives
  every label key, from `OSPP_TEST_EPH_V1:<label>:<handshake ordinal>:<app|station>`, where `<label>` is the document's
  `tools/verify-test-nonces.mjs` label or its path; a presentation whose handshake the document does not show is proved over the
  transcript SHA-256(`OSPP_TEST_TRANSCRIPT_V1:<label>:<ordinal>`). An `apple-appattest` device proof carries the synthetic
  authenticator data SHA-256(`OSPPTEST01.org.ospp.app`) ‖ `0x00` ‖ `00000001` — a relying-party hash, flags and a counter of 1.
  `tools/generate-ble-vectors.mjs` derives its own handshakes from the labels it names.
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

- **Station mTLS client key**: generated on-device during provisioning; the private key never leaves the secure element / NVS. Its CSR is signed by the operator's Station CA, and the certificate it receives carries `clientAuth` and `id-kp-osppBleStation`: the same key authenticates the station to the broker and, by signing the BLE Challenge, to the app. See `profiles/security/certificate-renewal.md`. The `station-mtls-test-*` files above stand in for it.
- **Station receipt-signing key**: a **separate** on-device ECDSA P-256 key pair, submitted at provisioning as a bare public key and never certified by the Station CA. It **MUST** be distinct from the mTLS client key (`06-security.md` §4.3). The `station-test-key.pem` / `station-test-pub.pem` pair above stands in for this key, not for the mTLS key.
- **Server ECDSA key**: generated and stored in the server HSM / Vault. Its public keys form the server key set. A station receives the key currently signing at provisioning (`serverVerifyKey`), and the whole set as `OfflinePassPublicKey` at every boot, in the configuration of the `Accepted` BootNotification RESPONSE, and by `ChangeConfiguration` ([`06-security.md` §6.7](../../spec/06-security.md#67-server-signing-key-rotation-ecdsa-p-256)); the app receives none of it.
- **Firmware code-signing key**: held by the firmware release pipeline. Public certificate pre-provisioned to the station's secure element.
- **HMAC session key**: derived per-boot per `06-security.md` §5.2, never reused across sessions.

None of the test keys in this directory are present in any production deployment. They exist solely to make the synthetic test vectors verifiable in CI and by external implementers.
