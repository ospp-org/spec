# Synthetic Test Firmware

**WARNING: NOT A REAL FIRMWARE IMAGE.** Synthetic byte sequence used solely
to give the `update-firmware` conformance vectors a binary they can sign
against. Not bootable; carries no executable code.

## Inventory

| File | Bytes | SHA-256 | Purpose |
|---|---|---|---|
| `test-firmware.bin` | 64 | `928de7ea35ba13fd64dfdec744051a7af9142a06bab3404a8bc548b5761644b0` | Test target for ECDSA P-256 firmware signing per `spec/06-security.md` §4.6 |

## Content

```
# OSPP synthetic test firmware payload (not bootable)\n<10 NUL bytes>
```

— 54 bytes of UTF-8 (the readable header + LF), zero-padded to 64 bytes
so the file has a uniform, hexdump-stable length. The header is plain
ASCII so any reviewer can confirm the binary content with `hexdump -C`.

## How the conformance vectors consume it

Each `update-firmware-request-*.json` carries:

- `checksum` — `sha256:<hex digest>` of `test-firmware.bin`
- `signature` — base64 DER ECDSA P-256-SHA256 of the binary, produced
  with `conformance/test-keys/firmware-test-key.pem` (RFC 6979 +
  low-s normalisation, per `spec/06-security.md` §6.2 Note 6)

The `firmwareUrl` and `firmwareVersion` fields are illustrative — they
point at fictitious release URLs and do **not** govern the signature.
Only the binary bytes shipped here are signed.

## Verification

```bash
node tools/verify-example-signatures.mjs \
  --key conformance/test-keys/firmware-test-pub.pem \
  examples/payloads/mqtt/update-firmware.request.json \
  conformance/test-vectors/valid/device-management/update-firmware-request-full.json \
  conformance/test-vectors/valid/device-management/update-firmware-request-minimal.json
```

The verifier re-hashes `test-firmware.bin`, compares against the carrier
file's `checksum`, then verifies the `signature` against the binary's
SHA-256 digest with the firmware test public key.

## Production posture

Production firmware images are signed offline by the manufacturer's
operational PKI (separate Firmware Signing Certificate per
`spec/06-security.md` §4.6), with the public certificate pre-provisioned
to the station's secure element. None of the synthetic test material in
this directory is present in any production deployment.
