#!/usr/bin/env bash
# Validate every example payload under examples/payloads/ against its schema.
#
# Usage: ./tools/validate-examples.sh
#
# This is the implementation .github/workflows/validate-examples.yml calls. It used to be a
# second, divergent copy of that job, and the copy CI did not run was broken twice over:
#
#   * `REFS="-r $SCHEMA_DIR/common/*.schema.json"` was used UNQUOTED, so bash word-split *and*
#     glob-expanded it into 22 paths after a single `-r`. ajv rejected every invocation with
#     "invalid syntax (too many arguments)" — 52 failures out of 52, with `2>/dev/null` hiding
#     the reason. The content was fine the whole time.
#   * `npx ajv` resolved to the `ajv` *library* in this repo's node_modules, which ships no
#     `bin`. Two independent faults, either of which alone produces 100% failure — which reads
#     as a broken environment and is how a totally-failing instrument stops being run.
#
# Three properties are carried over from the inline job, which had them and this script did not:
# every schema is loaded as a ref (not just schemas/common, which left BLE -> BLE references
# unresolvable), a missing pair is COUNTED rather than silently skipped, and the run refuses to
# report success for zero work.

set -euo pipefail

cd "$(dirname "$0")/.."

# $AJV_BIN wins, so CI can point at an install made OUTSIDE the checkout. That is deliberate:
# this repo's package.json depends on @ospp/protocol, and a version cascade once pinned it to a
# version npm had never carried, after which `npm install ajv` failed ETARGET before a single
# payload was checked. A gate must not be able to die of a dependency it never loads.
AJV="${AJV_BIN:-}"
if [ -z "$AJV" ]; then
  if [ -x node_modules/.bin/ajv ]; then AJV=node_modules/.bin/ajv
  elif command -v ajv >/dev/null 2>&1; then AJV=$(command -v ajv)
  fi
fi
if [ -z "$AJV" ] || ! "$AJV" help >/dev/null 2>&1; then
  echo "FATAL: no working ajv-cli binary." >&2
  echo "  Tried: \$AJV_BIN, ./node_modules/.bin/ajv, ajv on PATH." >&2
  echo "  Note that \`npx ajv\` does NOT work here — npm resolves it to the ajv *library*," >&2
  echo "  which has no bin, and the local copy shadows any global ajv-cli." >&2
  echo "  Install with:  npm install --no-save --prefix /tmp/ajv ajv-cli@5 ajv-formats@3" >&2
  echo "  then:          AJV_BIN=/tmp/ajv/node_modules/.bin/ajv ./tools/validate-examples.sh" >&2
  exit 2
fi

# Every schema, at any depth, as a ref — schemas/common alone left ble/challenge.schema.json
# unable to resolve ble/station-identity.schema.json.
mapfile -t SCHEMAS < <(find schemas -name '*.schema.json' | sort)
if [ "${#SCHEMAS[@]}" -eq 0 ]; then
  echo "FATAL: zero schemas found. The layout moved." >&2
  exit 2
fi
REFS=()
for s in "${SCHEMAS[@]}"; do REFS+=(-r "$s"); done

PASS=0; FAIL=0; ABSENT=0

check() {  # check <schema> <data>
  local schema="$1" data="$2"
  # An absent pair is counted, not silently skipped: a renamed example must not be able to
  # shrink the run and still report success.
  if [ ! -f "$schema" ] || [ ! -f "$data" ]; then
    echo "ABSENT $data"
    ABSENT=$((ABSENT + 1)); return
  fi
  # Self must not appear in -r (ajv: "already exists"), so drop it for this invocation.
  local refs=()
  for r in "${SCHEMAS[@]}"; do [ "$r" = "$schema" ] && continue; refs+=(-r "$r"); done
  # stderr is NOT redirected — hiding it is what made the quoting bug unattributable.
  if "$AJV" validate -s "$schema" "${refs[@]}" -d "$data" --spec=draft2020 -c ajv-formats >/dev/null; then
    echo "PASS   $data"; PASS=$((PASS + 1))
  else
    echo "FAIL   $data"; FAIL=$((FAIL + 1))
  fi
}

echo "Validating example payloads (binary: $AJV, ${#SCHEMAS[@]} schemas as refs)"

for action in boot-notification heartbeat authorize-offline-pass reserve-bay cancel-reservation \
              start-service stop-service transaction-event change-configuration get-configuration \
              reset update-firmware get-diagnostics set-maintenance-mode update-service-catalog; do
  for type in request response; do
    check "schemas/mqtt/${action}-${type}.schema.json" "examples/payloads/mqtt/${action}.${type}.json"
  done
done

for event in status-notification connection-lost security-event firmware-status-notification \
             diagnostics-notification; do
  check "schemas/mqtt/${event}.schema.json" "examples/payloads/mqtt/${event}.event.json"
done
check schemas/mqtt/meter-values-event.schema.json examples/payloads/mqtt/meter-values.event.json

for msg in station-info available-services hello challenge offline-auth-request \
           server-signed-auth start-service-request start-service-response \
           stop-service-request stop-service-response receipt; do
  check "schemas/ble/${msg}.schema.json" "examples/payloads/ble/${msg}.json"
done
check schemas/ble/auth-response.schema.json  examples/payloads/ble/auth-response.accepted.json
check schemas/ble/auth-response.schema.json  examples/payloads/ble/auth-response.rejected.json
check schemas/ble/service-status.schema.json examples/payloads/ble/service-status.running.json
check schemas/ble/service-status.schema.json examples/payloads/ble/service-status.receipt-ready.json

# The HTTP provisioning pair. The inline workflow this script replaces did NOT cover it — the
# script was the only thing that did, and the script was the thing that never ran.
check schemas/provisioning-request.schema.json examples/payloads/http/provisioning.request.json

TOTAL=$((PASS + FAIL))
echo
echo "Total: $TOTAL checked, $PASS PASS, $FAIL FAIL, $ABSENT pair(s) absent"
if [ "$TOTAL" -eq 0 ]; then
  echo "FATAL: zero pairs checked — this run would report success for no work." >&2
  exit 2
fi
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
