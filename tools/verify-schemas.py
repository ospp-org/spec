#!/usr/bin/env python3
"""OSPP Schema Validation — Category 8: Test Vector Schema Validation

Validates all test vectors against their corresponding JSON Schemas.
- Valid vectors MUST pass validation.
- Invalid vectors MUST fail validation.

Uses jsonschema with Draft 2020-12 and $ref resolution via a pre-built schema store.
"""

import json
import os
import sys
import warnings

# Suppress RefResolver deprecation warning (still functional in jsonschema 4.x)
warnings.filterwarnings("ignore", category=DeprecationWarning, module="jsonschema")

from jsonschema import Draft202012Validator, RefResolver, ValidationError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VALID_DIR = os.path.join(ROOT, "conformance", "test-vectors", "valid")
INVALID_DIR = os.path.join(ROOT, "conformance", "test-vectors", "invalid")
SCHEMA_DIR = os.path.join(ROOT, "schemas")

# Suffixes to strip from test vector filenames (longest first)
SUFFIXES = [
    "-additional-properties",
    "-missing-required",
    "-missing-signature",
    "-invalid-status",
    "-invalid-enum",
    "-invalid-type",
    "-extra-field",
    "-minimal",
    "-full",
]

# Category → schema subdirectory
CATEGORY_SCHEMA_DIR = {
    "core": "mqtt",
    "transaction": "mqtt",
    "device-management": "mqtt",
    "security": "mqtt",
    "offline": "ble",
}


def load_schema_store():
    """Pre-load all schemas into a {$id: schema} store for $ref resolution."""
    store = {}
    for dirpath, _, filenames in os.walk(SCHEMA_DIR):
        for fname in filenames:
            if not fname.endswith(".schema.json"):
                continue
            fpath = os.path.join(dirpath, fname)
            with open(fpath, encoding="utf-8") as f:
                schema = json.load(f)
            sid = schema.get("$id")
            if sid:
                store[sid] = schema
    return store


def vector_to_schema_path(vector_path):
    """Map a test vector file path to its corresponding schema file path.

    Example:
        valid/core/boot-notification-request-full.json
        → schemas/mqtt/boot-notification-request.schema.json
    """
    rel = os.path.relpath(vector_path, os.path.dirname(os.path.dirname(vector_path)))
    # rel is like "core/boot-notification-request-full.json"
    parts = rel.replace("\\", "/").split("/")
    category = parts[0]
    filename = parts[1]

    # Strip suffix to get the message name
    name = filename.replace(".json", "")
    for suffix in SUFFIXES:
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break

    schema_subdir = CATEGORY_SCHEMA_DIR.get(category)
    if not schema_subdir:
        return None

    schema_file = os.path.join(SCHEMA_DIR, schema_subdir, name + ".schema.json")

    # Fallback: if exact match not found, progressively strip trailing segments
    # to match supplementary vectors like data-transfer-response-accepted.json
    # against data-transfer-response.schema.json
    if not os.path.isfile(schema_file):
        candidate_name = name
        while "-" in candidate_name:
            candidate_name = candidate_name.rsplit("-", 1)[0]
            candidate = os.path.join(SCHEMA_DIR, schema_subdir, candidate_name + ".schema.json")
            if os.path.isfile(candidate):
                return candidate

    return schema_file


def validate(instance, schema_path, store):
    """Validate a JSON instance against a schema. Returns list of errors."""
    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)
    base_uri = schema.get("$id", "file:///" + schema_path.replace("\\", "/"))
    resolver = RefResolver(base_uri, schema, store=store)
    validator = Draft202012Validator(schema, resolver=resolver)
    return list(validator.iter_errors(instance))


def collect_vectors(base_dir):
    """Collect all .json test vector files grouped by category."""
    vectors = []
    if not os.path.isdir(base_dir):
        return vectors
    for category in sorted(os.listdir(base_dir)):
        cat_dir = os.path.join(base_dir, category)
        if not os.path.isdir(cat_dir):
            continue
        for fname in sorted(os.listdir(cat_dir)):
            if fname.endswith(".json"):
                vectors.append(os.path.join(cat_dir, fname))
    return vectors


def rel(path):
    return os.path.relpath(path, ROOT).replace("\\", "/")


def main():
    store = load_schema_store()
    problems = []
    valid_pass = 0
    valid_fail = 0
    invalid_correct = 0
    invalid_wrong = 0
    skipped = 0

    # --- Valid vectors: MUST pass ---
    valid_vectors = collect_vectors(VALID_DIR)
    for vpath in valid_vectors:
        schema_path = vector_to_schema_path(vpath)
        if not schema_path or not os.path.isfile(schema_path):
            problems.append(
                f"SKIP  {rel(vpath)} — schema not found: {rel(schema_path) if schema_path else '?'}"
            )
            skipped += 1
            continue

        with open(vpath, encoding="utf-8") as f:
            instance = json.load(f)

        errors = validate(instance, schema_path, store)
        if errors:
            valid_fail += 1
            err_msg = errors[0].message[:120]
            problems.append(
                f"FAIL  {rel(vpath)}\n"
                f"      schema: {rel(schema_path)}\n"
                f"      expected: PASS (valid vector)\n"
                f"      error: {err_msg}"
            )
        else:
            valid_pass += 1

    # --- Invalid vectors: MUST fail ---
    invalid_vectors = collect_vectors(INVALID_DIR)
    for vpath in invalid_vectors:
        schema_path = vector_to_schema_path(vpath)
        if not schema_path or not os.path.isfile(schema_path):
            problems.append(
                f"SKIP  {rel(vpath)} — schema not found: {rel(schema_path) if schema_path else '?'}"
            )
            skipped += 1
            continue

        with open(vpath, encoding="utf-8") as f:
            instance = json.load(f)

        errors = validate(instance, schema_path, store)
        if errors:
            invalid_correct += 1
        else:
            invalid_wrong += 1
            problems.append(
                f"FAIL  {rel(vpath)}\n"
                f"      schema: {rel(schema_path)}\n"
                f"      expected: FAIL (invalid vector)\n"
                f"      error: schema accepted an invalid test vector"
            )

    # --- Output ---
    total_valid = valid_pass + valid_fail
    total_invalid = invalid_correct + invalid_wrong
    total_checks = total_valid + total_invalid + skipped
    total_pass = valid_pass + invalid_correct
    total_fail = valid_fail + invalid_wrong

    print("=" * 60)
    print("OSPP Category 8: Test Vector Schema Validation")
    print("=" * 60)
    print()
    print(f"Valid vectors:   {valid_pass}/{total_valid} PASS")
    print(f"Invalid vectors: {invalid_correct}/{total_invalid} correctly rejected")
    if skipped:
        print(f"Skipped:         {skipped}")
    print()
    print(f"Total: {total_pass}/{total_checks} PASS, {total_fail} FAIL, {skipped} SKIP")
    print()

    if problems:
        print("-" * 60)
        print(f"{len(problems)} PROBLEM(S):")
        print("-" * 60)
        for p in problems:
            print()
            print(p)
        print()
    else:
        print("ALL CHECKS PASSED")
        print()

    return 0 if total_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
