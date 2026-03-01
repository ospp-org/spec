#!/usr/bin/env bash
# Validate example payloads against their corresponding schemas
# Usage: ./tools/validate-examples.sh

set -euo pipefail

SCHEMA_DIR="$(dirname "$0")/../schemas"
EXAMPLE_DIR="$(dirname "$0")/../examples/payloads"
REFS="-r $SCHEMA_DIR/common/*.schema.json"
OPTS="--spec=draft2020 -c ajv-formats"
ERRORS=0

echo "Validating example payloads against schemas..."

# MQTT REQUEST/RESPONSE pairs
for action in boot-notification heartbeat authorize-offline-pass reserve-bay cancel-reservation \
              start-service stop-service transaction-event change-configuration get-configuration \
              reset update-firmware get-diagnostics set-maintenance-mode update-service-catalog; do
  for type in request response; do
    schema="$SCHEMA_DIR/mqtt/${action}-${type}.schema.json"
    example="$EXAMPLE_DIR/mqtt/${action}.${type}.json"
    if [ -f "$schema" ] && [ -f "$example" ]; then
      echo "  $example"
      if ! npx ajv validate -s "$schema" $REFS -d "$example" $OPTS 2>/dev/null; then
        echo "  FAIL: $example"
        ERRORS=$((ERRORS + 1))
      fi
    fi
  done
done

# MQTT EVENT messages
for action in status-notification connection-lost security-event firmware-status-notification diagnostics-notification; do
  schema="$SCHEMA_DIR/mqtt/${action}.schema.json"
  example="$EXAMPLE_DIR/mqtt/${action}.event.json"
  if [ -f "$schema" ] && [ -f "$example" ]; then
    echo "  $example"
    if ! npx ajv validate -s "$schema" $REFS -d "$example" $OPTS 2>/dev/null; then
      echo "  FAIL: $example"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# meter-values (different naming)
echo "  $EXAMPLE_DIR/mqtt/meter-values.event.json"
if ! npx ajv validate -s "$SCHEMA_DIR/mqtt/meter-values-event.schema.json" $REFS -d "$EXAMPLE_DIR/mqtt/meter-values.event.json" $OPTS 2>/dev/null; then
  echo "  FAIL: meter-values.event.json"
  ERRORS=$((ERRORS + 1))
fi

# BLE messages
for msg in station-info available-services hello challenge offline-auth-request \
           server-signed-auth start-service-request start-service-response \
           stop-service-request stop-service-response receipt; do
  schema="$SCHEMA_DIR/ble/${msg}.schema.json"
  example="$EXAMPLE_DIR/ble/${msg}.json"
  if [ -f "$schema" ] && [ -f "$example" ]; then
    echo "  $example"
    if ! npx ajv validate -s "$schema" $REFS -d "$example" $OPTS 2>/dev/null; then
      echo "  FAIL: $example"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# BLE variants
for variant in "auth-response:auth-response.accepted" "auth-response:auth-response.rejected" \
               "service-status:service-status.running" "service-status:service-status.receipt-ready"; do
  schema_name="${variant%%:*}"
  example_name="${variant##*:}"
  echo "  $EXAMPLE_DIR/ble/${example_name}.json"
  if ! npx ajv validate -s "$SCHEMA_DIR/ble/${schema_name}.schema.json" $REFS -d "$EXAMPLE_DIR/ble/${example_name}.json" $OPTS 2>/dev/null; then
    echo "  FAIL: ${example_name}.json"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -eq 0 ]; then
  echo "All examples valid."
else
  echo "$ERRORS example(s) failed validation."
  exit 1
fi
