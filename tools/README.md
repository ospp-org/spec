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
| `check-config-defaults` | Both sides are structured — Chapter 08 is a `(key, default, range)` table, a restatement is a key name with a number near it | 25 sites, 3 flagged, **3 real** |
| `check-schema-conditionals` | Both sides are in one JSON file — the `description` and the `if`/`then` that should back it | 33 claims, 5 flagged, **5 real** |
| `check-normative-bold` | Pure typography — a capitalised keyword outside a `**…**` span | exact, no inference |

Each carries a `BASELINE` or exits non-zero on any finding. **They are ratchets, not allowlists:**
every finding is printed on every run, and the count may fall but must not rise. When it falls,
lower the constant in the script so the improvement cannot silently regress.

What defeated the more ambitious versions is recorded in each script's docstring. In short:
`check-schema-conditionals` must not flag cross-artefact claims (JSON Schema cannot compare against
an X.509 certificate or another message, so those descriptions are correct), and
`check-config-defaults` must scope the number to within 40 characters of the key or it cross-pairs
the rows that name two keys at once. A fourth check — "a claim naming an identifier absent from
every normative artefact" — was built, measured at 18 flagged sites of which approximately zero
were the defect, and discarded.
