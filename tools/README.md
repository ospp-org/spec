# Verification Tools

## Prerequisites

- Node.js >= 18
- Python >= 3.10

## Setup

```bash
npm install ajv ajv-formats
```

This installs to `node_modules/` (gitignored).

## Run

```bash
bash tools/verify-protocol.sh
python3 tools/verify-schemas.py
```

`verify-protocol.sh` checks spec consistency (messages, schemas, error codes, config keys, state machines, diagrams, test vectors). `verify-schemas.py` validates all test vectors against their JSON schemas.

## Drift checks

Three checks for the class *"prose asserts a property and nothing establishes it"*. They are run
by `.github/workflows/check-drift.yml`; each takes no arguments and is cwd-independent.

```bash
python3 tools/check-config-defaults.py       # restated defaults vs the Chapter 08 registry
python3 tools/check-schema-conditionals.py   # schema descriptions asserting unenforced conditionals
python3 tools/check-normative-bold.py --list # normative keywords a reader will not see as normative
```

They exist because most of that class is *not* mechanically checkable — a claim in prose is not
machine-comparable to anything. These three are the exceptions, and each is narrow on purpose:

| Check | Why it works | Measured precision |
|---|---|---|
| `check-config-defaults` | Both sides are structured — Chapter 08 is a `(key, default, range)` table, a restatement is a key name with a number near it | 37 sites, 3 flagged, **3 real** |
| `check-schema-conditionals` | Both sides are in one JSON file — the `description` and the `if`/`then` that should back it | 33 claims, 5 flagged, **5 real** |
| `check-normative-bold` | Pure typography — a capitalised keyword outside a `**…**` span | exact, no inference |

Each carries a `BASELINE` or exits non-zero on any finding. **They are ratchets, not allowlists:**
every finding is printed on every run, and the count may fall but must not rise. When it falls,
lower the constant in the script so the improvement cannot silently regress.

All three are RED-tested: injecting one drifted default, one unenforced conditional and one
unbolded keyword makes each exit 1, and removing the injection returns it to 0. A gate nobody has
watched fail is a gate nobody knows works.

What defeated the more ambitious versions is recorded in each script's docstring. In short:
`check-schema-conditionals` must not flag cross-artefact claims (JSON Schema cannot compare against
an X.509 certificate or another message, so those descriptions are correct), and
`check-config-defaults` must scope the number to within 40 characters of the key or it cross-pairs
the rows that name two keys at once.

**Two further checks were built, measured and discarded — both at roughly zero precision.** "A
claim naming an identifier absent from every normative artefact" flagged 18 sites, of which
approximately none were the defect (11 were error-code names, flagged only because no schema
enumerates error codes). "A key name with a bare number near it, no `default` required" flagged 12,
of which **none** were real — nine were conformance cases deliberately setting a non-default value
for faster test execution, and a gate that fails those is a gate somebody disables. The word
"default", or a Default column header, is the whole signal.
