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
