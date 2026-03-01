#!/usr/bin/env bash
# Generate TypeScript types from JSON Schema files
# Usage: ./tools/generate-types.sh
# Requires: npm install -g json-schema-to-typescript

set -euo pipefail

SCHEMA_DIR="$(dirname "$0")/../schemas"
OUTPUT_DIR="$(dirname "$0")/../generated/types"

mkdir -p "$OUTPUT_DIR"

echo "Generating TypeScript types from JSON Schemas..."

for schema in $(find "$SCHEMA_DIR" -name "*.schema.json" -type f | sort); do
  basename=$(basename "$schema" .schema.json)
  echo "  $basename"
  npx json2ts -i "$schema" -o "$OUTPUT_DIR/${basename}.d.ts" --no-bannerComment 2>/dev/null || {
    echo "  WARN: Failed to generate types for $basename"
  }
done

echo "Types generated in $OUTPUT_DIR"
