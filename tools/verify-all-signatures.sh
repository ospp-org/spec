#!/usr/bin/env bash
# =============================================================================
# verify-all-signatures.sh — CI guard for the OSPP signed-conformance corpus
# =============================================================================
#
# Exits non-zero on any of:
#   * conformance JSON vector with an unverifiable / missing signature
#   * inline `json fenced block in a spec .md whose signature does not verify
#   * sign-inline-md.mjs is non-idempotent (re-run drift)
#   * residual placeholder text pattern (Example, Placeholder, "...") in any
#     signature / signedAuthorization / sessionProof / sessionKeyConfirmation,
#     or in any BLE handshake member: a nonce, an ephemeral key, the station's
#     certificate and signature, a device proof, a forwarded transcriptHash
#   * schema regression (tools/verify-schemas.py reports any failure)
#
# Designed to run from the spec/ repo root, in CI and on the dev box.
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."  # to repo root from tools/

fail=0
section() { printf '\n═══ %s ═══\n' "$*"; }
ok()      { printf '  ✓ %s\n' "$*"; }
err()     { printf '  ✗ %s\n' "$*"; fail=$((fail + 1)); }

# -----------------------------------------------------------------------------
# 1. Conformance vectors — invoke verify-example-signatures with each key
# -----------------------------------------------------------------------------

section "Conformance vectors (.json) verification"

verify_group() {
  local label="$1" key="$2"; shift 2
  if node tools/verify-example-signatures.mjs --key "$key" "$@" >/tmp/vas-out 2>&1; then
    ok "$label (${#@} file(s))"
  else
    err "$label failed:"
    sed 's/^/      /' /tmp/vas-out
  fi
}

verify_group "station receipts" conformance/test-keys/station-test-pub.pem \
  examples/payloads/ble/receipt.json \
  examples/payloads/ble/receipt-response.json \
  examples/payloads/mqtt/transaction-event.request.json \
  conformance/test-vectors/valid/offline/receipt-full.json \
  conformance/test-vectors/valid/offline/receipt-minimal.json \
  conformance/test-vectors/valid/offline/receipt-auth-form.json \
  conformance/test-vectors/valid/offline/receipt-response-full.json \
  conformance/test-vectors/valid/offline/receipt-response-auth-form.json \
  conformance/test-vectors/valid/offline/receipt-response-rejected.json \
  conformance/test-vectors/valid/transaction/transaction-event-request-full.json \
  conformance/test-vectors/valid/transaction/transaction-event-request-minimal.json \
  conformance/test-vectors/valid/transaction/transaction-event-request-auth-form.json

verify_group "server OfflinePass" conformance/test-keys/server-test-pub.pem \
  examples/payloads/ble/offline-auth-request.json \
  examples/payloads/http/offline-pass-issuance.response.json \
  examples/payloads/mqtt/authorize-offline-pass.request.json \
  conformance/test-vectors/valid/offline/offline-auth-request-full.json \
  conformance/test-vectors/valid/offline/offline-auth-request-minimal.json \
  conformance/test-vectors/valid/security/authorize-offline-pass-request-full.json \
  conformance/test-vectors/valid/security/authorize-offline-pass-request-minimal.json

verify_group "server ServerSignedAuth" conformance/test-keys/server-test-pub.pem \
  examples/payloads/ble/server-signed-auth.json \
  conformance/test-vectors/valid/offline/server-signed-auth-full.json \
  conformance/test-vectors/valid/offline/server-signed-auth-minimal.json

# The station's signature over the handshake, carried in the BLE Challenge (FFF4) with
# its mTLS certificate. Judged as the app judges it: the certificate against the test
# Station CA and its CRL, the signature over the Hello beside each Challenge
# (06-security.md §6.5.2, station-signature mode).
verify_group "station signatures (Challenge)" conformance/test-keys/station-ca-test-cert.pem \
  examples/payloads/ble/challenge.json \
  conformance/test-vectors/valid/offline/challenge-full.json \
  conformance/test-vectors/valid/offline/challenge-minimal.json \
  conformance/test-vectors/valid/offline/challenge-empty-catalog.json

verify_group "firmware" conformance/test-keys/firmware-test-pub.pem \
  examples/payloads/mqtt/update-firmware.request.json \
  conformance/test-vectors/valid/device-management/update-firmware-request-full.json \
  conformance/test-vectors/valid/device-management/update-firmware-request-minimal.json

verify_group "HMAC sessionKeyConfirmation" conformance/test-keys/session-test-key.bin \
  examples/payloads/ble/auth-response.accepted.json \
  examples/payloads/ble/auth-response.rejected.json \
  conformance/test-vectors/valid/offline/auth-response-full.json \
  conformance/test-vectors/valid/offline/auth-response-minimal.json \
  conformance/test-vectors/valid/offline/auth-response-rejected.json \
  conformance/test-vectors/valid/offline/auth-response-rejected-limit.json \
  conformance/test-vectors/valid/offline/auth-response-rejected-version.json

# The device proof (06-security.md §6.5.4): the pass verified under the server key that
# anchors its devicePublicKey, then the proof under that key — over the handshake beside
# an OfflineAuthRequest, or over a forward's own transcriptHash at the station that
# forwarded it.
if node tools/verify-example-signatures.mjs \
    --key conformance/test-keys/server-test-pub.pem \
    --mode device-proof \
    examples/payloads/ble/offline-auth-request.json \
    examples/payloads/mqtt/authorize-offline-pass.request.json \
    conformance/test-vectors/valid/offline/offline-auth-request-full.json \
    conformance/test-vectors/valid/offline/offline-auth-request-minimal.json \
    conformance/test-vectors/valid/security/authorize-offline-pass-request-full.json \
    conformance/test-vectors/valid/security/authorize-offline-pass-request-minimal.json \
    >/tmp/vas-out 2>&1; then
  ok "device proofs (6 file(s))"
else
  err "device proofs failed:"; sed 's/^/      /' /tmp/vas-out
fi

# sessionProof — same files as server OfflinePass, but verified with the
# session key and --mode session-proof. Two different signatures live on
# the same JSON envelope; both must verify with their respective keys.
if node tools/verify-example-signatures.mjs \
    --key conformance/test-keys/session-test-key.bin \
    --mode session-proof \
    examples/payloads/ble/offline-auth-request.json \
    conformance/test-vectors/valid/offline/offline-auth-request-full.json \
    conformance/test-vectors/valid/offline/offline-auth-request-minimal.json \
    >/tmp/vas-out 2>&1; then
  ok "HMAC sessionProof (3 file(s))"
else
  err "HMAC sessionProof failed:"; sed 's/^/      /' /tmp/vas-out
fi

# -----------------------------------------------------------------------------
# 1b. BLE crypto oracle — re-derive the key schedule + AEAD from inputs,
#     anchored on the RFC 5903 / 5869 / 8439 test vectors (external truth).
# -----------------------------------------------------------------------------

section "BLE crypto oracle (key schedule + AEAD, RFC-anchored)"

if node tools/verify-ble-crypto.mjs >/tmp/vas-crypto 2>&1; then
  ok "$(tail -1 /tmp/vas-crypto | sed 's/^═══ //;s/ ═══$//')"
else
  err "BLE crypto oracle FAILED:"; sed 's/^/      /' /tmp/vas-crypto
fi

# -----------------------------------------------------------------------------
# 1c. Tamper rejection — the NEGATIVE direction.
#
#     Everything above this point proves that valid things verify. Every path named
#     in section 1 is under conformance/test-vectors/valid/**, and verify-ble-crypto
#     has no tamper branch, so until this section existed the corpus could show that
#     a good signature passes and could not show that a bad one is refused — while
#     TC-SEC-001.md:50-51, TC-SEC-004.md:34, TC-OFF-002.md#expected-results and TC-OFF-005.md#expected-results
#     each ask an implementer to prove exactly that. We asked for a test we could
#     not pass ourselves.
#
#     The verifier carries its own anti-vacuity: for every case it first asserts the
#     UNTAMPERED base verifies, because a refusal that cannot be told apart from a
#     broken path is not evidence.
# -----------------------------------------------------------------------------

section "Tamper rejection (structurally valid, cryptographically wrong)"

if node tools/verify-tamper-rejection.mjs >/tmp/vas-tamper 2>&1; then
  ok "$(tail -1 /tmp/vas-tamper)"
else
  err "Tamper rejection FAILED — a tampered message verified, or a base stopped verifying:"
  sed 's/^/      /' /tmp/vas-tamper
fi

# The corpus is generated, so it can drift from the bases it was cut from. --check
# re-derives and diffs without writing; it goes red when a base vector is re-signed
# and the tamper cases were not regenerated, which is the one way these vectors can
# quietly stop meaning what they say.
if node tools/generate-tamper-vectors.mjs --check >/tmp/vas-tamper-gen 2>&1; then
  ok "$(tail -1 /tmp/vas-tamper-gen)"
else
  err "Tamper corpus is stale relative to its base vectors:"
  sed 's/^/      /' /tmp/vas-tamper-gen
fi

# -----------------------------------------------------------------------------
# 2. Inline spec .md examples — sign-inline-md re-run must be a no-op
# -----------------------------------------------------------------------------

section "Inline spec .md examples (sign-inline-md.mjs idempotency)"

INLINE_FILES=(
  spec/06-security.md
  spec/03-messages.md
  spec/profiles/offline/ble-handshake.md
  spec/profiles/offline/ble-session.md
  spec/profiles/offline/ble-transport.md
  spec/profiles/offline/reconciliation.md
  spec/profiles/offline/authorize-offline-pass.md
  spec/profiles/transaction/transaction-event.md
  spec/profiles/device-management/update-firmware.md
  conformance/test-cases/offline/TC-OFF-001.md
  conformance/test-cases/offline/TC-OFF-003.md
  conformance/test-cases/offline/TC-OFF-004.md
  conformance/test-cases/transaction/TC-TX-006.md
  conformance/test-cases/security/TC-SEC-004.md
  conformance/test-cases/device-management/TC-DM-004.md
  examples/flows/12-firmware-update.md
  examples/error-scenarios/03-offline-pass-expired.md
  examples/flows/04-full-offline-session.md
  examples/flows/05-partial-a-session.md
  examples/flows/06-partial-b-session.md
  examples/flows/11-reconciliation.md
)

before=$(for f in "${INLINE_FILES[@]}"; do sha256sum "$f"; done | sha256sum | cut -d' ' -f1)
# A signer that stops on a document — a BLE handshake message not yet in its schema's
# shape, a placeholder nonce — is reported here and the remaining sections still run.
if ! node tools/sign-inline-md.mjs --all >/tmp/vas-inline 2>&1; then
  err "sign-inline-md.mjs --all stopped:"
  grep -E '^Error|^error' /tmp/vas-inline | sed 's/^/      /'
fi
after=$(for f in "${INLINE_FILES[@]}"; do sha256sum "$f"; done | sha256sum | cut -d' ' -f1)
if [[ "$before" == "$after" ]]; then
  ok "sign-inline-md.mjs --all is idempotent (zero drift across ${#INLINE_FILES[@]} files)"
else
  err "sign-inline-md.mjs produced drift on re-run — inline signatures are no longer reproducible"
  git diff --stat -- "${INLINE_FILES[@]}" | sed 's/^/      /'
fi

# -----------------------------------------------------------------------------
# 2b. Handshake nonces — derived from their labels, and never shared between two
#     documents. The profile rests its claim-layer replay defence on exactly that
#     property, and one pair had reached four different handshakes.
# -----------------------------------------------------------------------------

section "Handshake nonce derivation + cross-document uniqueness"

if node tools/verify-test-nonces.mjs >/tmp/vas-nonce 2>&1; then
  ok "$(tail -1 /tmp/vas-nonce)"
else
  err "handshake nonces FAILED:"; sed 's/^/      /' /tmp/vas-nonce
fi

# -----------------------------------------------------------------------------
# 3. Residual placeholder text patterns — must be zero hits
# -----------------------------------------------------------------------------

section "Residual placeholder pattern scan"

if hits=$(grep -rnE '"(signature|signedAuthorization|sessionProof|sessionKeyConfirmation)"\s*:\s*"[^"]*(Example|Placeholder|placeholder|XXX|xxx|\.\.\.|fake|FAKE|TODO|todo)' spec/ examples/ conformance/ 2>/dev/null); then
  err "placeholder patterns still present:"
  echo "$hits" | sed 's/^/      /'
else
  ok "no residual placeholder text in any signature / HMAC field"
fi

# The BLE handshake members. Long Base64 values (a certificate is ~700 characters) can
# carry a short word like "xxx" by chance, so these are held to the unambiguous markers only.
if hits=$(grep -rnE '"(stationSignature|stationCertificate|appEphemeralPubKey|stationEphemeralPubKey|appNonce|stationNonce|transcriptHash|authenticatorData)"\s*:\s*"[^"]*(Example|Placeholder|placeholder|\.\.\.)' spec/ examples/ conformance/ 2>/dev/null); then
  err "placeholder patterns still present in BLE handshake members:"
  echo "$hits" | sed 's/^/      /'
else
  ok "no residual placeholder text in any BLE handshake member"
fi

# -----------------------------------------------------------------------------
# 4. Schema regression
# -----------------------------------------------------------------------------

section "Schema vector regression (tools/verify-schemas.py)"

if python3 tools/verify-schemas.py >/tmp/vas-schema 2>&1; then
  tail -1 /tmp/vas-schema | sed 's/^/  /'
  ok "schema vectors PASS"
else
  err "schema vectors FAILED:"
  tail -20 /tmp/vas-schema | sed 's/^/      /'
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo
if [[ $fail -eq 0 ]]; then
  echo "═══ ALL GATES GREEN ═══"
  exit 0
else
  echo "═══ $fail gate(s) FAILED ═══"
  exit 1
fi
