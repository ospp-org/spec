#!/usr/bin/env bash
# Compile every JSON Schema under schemas/, with every other schema available as a $ref.
#
# Usage: ./tools/validate-schemas.sh
#
# This is the implementation .github/workflows/validate-schemas.yml calls. It used to be a
# second, divergent copy of that job, and the copy CI did not run had rotted:
#
#   * `npx ajv` resolved to the `ajv` *library* in this repo's node_modules, which ships no
#     `bin`, so every invocation died with "could not determine executable to run" — and
#     `2>/dev/null` hid the message, leaving only "86 schema(s) failed validation". A
#     denominator equal to the numerator is the signature of an instrument measuring nothing,
#     and it reads as a broken environment rather than as a broken script, which is how this
#     stopped being run. It could not be fixed by PATH either: npm resolves `npx <name>` by
#     package name, so a globally installed `ajv-cli` still loses to the local `ajv`.
#   * It passed only schemas/common as -r, so BLE -> BLE references were unresolvable. That is
#     the exact defect the workflow's own comment says the workflow fixed; the script beside it
#     was never swept. With a working binary it reported 84/86, and both failures were this.
#   * It globbed four directories by name. A directory named in a glob is one someone has to
#     remember to add; `find` cannot forget one.
#
# The binary is resolved explicitly and the failure to find one is fatal and loud, because the
# whole point of this file is that a tool which fails totally gets walked past.

set -euo pipefail

cd "$(dirname "$0")/.."

# ajv-cli resolution lives in one file for both gates; see tools/_ajv-resolve.sh.
. tools/_ajv-resolve.sh   # cwd is the repo root by the cd above, in every invocation

mapfile -t SCHEMAS < <(find schemas -name '*.schema.json' | sort)
COUNT=${#SCHEMAS[@]}
echo "Found $COUNT schema(s) under schemas/ (binary: $AJV)"
if [ "$COUNT" -eq 0 ]; then
  echo "FATAL: zero schemas found. The layout moved and this script would otherwise report" >&2
  echo "success for zero work — the failure mode it exists to catch one level down." >&2
  exit 2
fi

ERRORS=0
for schema in "${SCHEMAS[@]}"; do
  refs=()
  for ref in "${SCHEMAS[@]}"; do
    [ "$ref" = "$schema" ] && continue   # ajv rejects self as -r: "already exists"
    refs+=(-r "$ref")
  done
  # stderr is NOT redirected. The previous version sent it to /dev/null and that is what turned
  # a resolvable environment fault into an unattributable failure count.
  if ! "$AJV" compile -s "$schema" "${refs[@]}" --spec=draft2020 -c ajv-formats >/dev/null; then
    echo "FAIL: $schema"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -eq 0 ]; then
  echo "All $COUNT schemas compile."
else
  echo "$ERRORS of $COUNT schema(s) failed validation."
  exit 1
fi
