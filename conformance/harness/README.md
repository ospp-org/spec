# Conformance Harness — Reserved, Not Built

**NOTHING IN THIS DIRECTORY EXECUTES.** It is placeholder structure: two
subdirectories, each holding a zero-byte `.gitkeep` and nothing else. This file
exists so that a reader who lands here learns that from the directory rather
than from three levels up, and so that the absence reads as a recorded decision
rather than as a file someone forgot to commit.

## Inventory

| Path | Bytes | Reserved for |
|---|---:|---|
| `runner/.gitkeep` | 0 | A test runner that executes the `TC-*.md` procedures and emits a verdict |
| `server-simulator/.gitkeep` | 0 | A server-side peer a station under test can be driven against |

Those two paths are named in the repository layout at
[`README.md`](../../README.md) and in the
[implementors guide](../../guides/implementors-guide.md); this file is the only
thing under them.

## What the 34 test cases are today

Manual procedures. [`conformance/README.md` §1](../README.md#1-overview) states
it directly — the harness is *"planned for future releases; the `harness/`
directory contains placeholder structure"* — and
[§4](../README.md#4-test-execution) describes execution by a tester, not by a
program. The corpus is **34** cases: 4 core, 9 device-management, 5 offline, 9
security, 7 transaction.

## What *is* automated, so the gap is not mistaken for a total one

The machine-readable half of the conformance corpus is executed on every push,
by the gates in [`tools/`](../../tools/README.md) rather than from here:

| Gate | What it executes |
|---|---|
| `tools/verify-schemas.py` | All **345** test vectors — 168 valid, 177 invalid — against the schema each maps to, with zero unmapped |
| `tools/verify-all-signatures.sh` | The signed conformance corpus: example signatures, the BLE crypto oracle, tamper rejection, signer idempotency, handshake nonces |
| `tools/verify-protocol.sh` | Twenty cross-artefact consistency categories over `spec/`, `schemas/`, `conformance/` and `examples/`, against a recorded baseline |
| `tools/validate-examples.sh` | Every example payload against its schema |

What has no automated execution is the **behavioural** half: the `TC-*.md`
procedures, which describe a live station or server responding over MQTT or BLE.
That is the gap this directory is reserved to close.

## Why it is not built

Not an oversight, and deliberately not scoped as a repair. A runner is a
project, and its shape — whether it drives a real broker, a simulator, or both,
and whether the server simulator lives in this repository or is vendored — is a
decision the [KNOWN-ISSUES entry](../../KNOWN-ISSUES.md) exists to force rather
than to make. Do not treat this file as the start of one: it documents the
placeholder, it does not lift it.
