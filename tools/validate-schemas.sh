#!/usr/bin/env bash
# Validate all JSON Schema files are syntactically correct
# Usage: ./tools/validate-schemas.sh

set -euo pipefail

SCHEMA_DIR="$(dirname "$0")/../schemas"
ERRORS=0

echo "Validating JSON Schemas..."

# Common schemas: cross-reference each other, so compile each with all OTHER as -r
echo "  Common schemas..."
for schema in "$SCHEMA_DIR"/common/*.schema.json; do
  refs=""
  for ref in "$SCHEMA_DIR"/common/*.schema.json; do
    [ "$ref" = "$schema" ] && continue
    refs="$refs -r $ref"
  done
  if ! npx ajv compile -s "$schema" $refs --spec=draft2020 -c ajv-formats 2>/dev/null; then
    echo "FAIL: $schema"
    ERRORS=$((ERRORS + 1))
  fi
done

# MQTT and BLE schemas: reference common schemas
echo "  MQTT schemas..."
for schema in "$SCHEMA_DIR"/mqtt/*.schema.json; do
  if ! npx ajv compile -s "$schema" -r "$SCHEMA_DIR/common/*.schema.json" --spec=draft2020 -c ajv-formats 2>/dev/null; then
    echo "FAIL: $schema"
    ERRORS=$((ERRORS + 1))
  fi
done

echo "  BLE schemas..."
for schema in "$SCHEMA_DIR"/ble/*.schema.json; do
  if ! npx ajv compile -s "$schema" -r "$SCHEMA_DIR/common/*.schema.json" --spec=draft2020 -c ajv-formats 2>/dev/null; then
    echo "FAIL: $schema"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -eq 0 ]; then
  echo "All schemas valid."
else
  echo "$ERRORS schema(s) failed validation."
  exit 1
fi
