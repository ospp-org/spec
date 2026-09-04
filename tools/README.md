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

`verify-protocol.sh` checks spec consistency (messages, schemas, error codes, config keys, state machines, diagrams, test vectors) across twenty categories and ~4180 checks. `verify-schemas.py` validates all test vectors against their JSON schemas.

> **`verify-protocol.sh` is a ratchet too, as of 2026-09-03, and it is finally wired.** It had no
> baseline constant for twenty releases — `exitCode = totalFail > 0` — so it was permanently red on
> a clean tree and no workflow ran it, which made it the single entry in `check-tool-callers.py`'s
> BASELINE. It now exits **0 at** its baseline, **1 above**, **1 below** (lower the constant), and
> **2 on a vacuous run** that inspected fewer than 3000 things, and
> [`.github/workflows/verify-protocol.yml`](../.github/workflows/verify-protocol.yml) is the caller.
> Baseline at that measurement point: **6 FAIL, 6 SKIP** over 4180 checks — the same six the
> script's own header has recorded since `v0.21.0`. What the unwired years cost, measured rather
> than supposed: Category 18 held **three** live findings at `v0.28.0`, because that release moved
> `spec/README.md` and all 22 chapter headers and left `guides/implementors-guide.md` (twice) and
> `KNOWN-ISSUES.md` at `0.27.0`. Nothing reported them.

### Crypto vectors

```bash
node tools/verify-canonical-form.mjs # OSPP Canonical Form — Category 20
node tools/verify-mqtt-mac.mjs       # MQTT message MAC — Category 19
node tools/verify-ble-crypto.mjs     # BLE key schedule against its RFC anchors
```

`verify-mqtt-mac.mjs` recomputes `conformance/test-vectors/crypto/mqtt-mac.json`: the §4.8 canonical form, the MAC under the **decoded** session key, and — the check that gives the vector its point — the different MAC produced by keying with the Base64 *text*. A vector nothing recomputes is a claim, so this is spawned by Category 19 rather than duplicated into it.

`verify-canonical-form.mjs` holds [`canonical-form.mjs`](canonical-form.mjs) to the 17 vectors in `conformance/test-vectors/crypto/canonical-form.json`, pins the key comparator directly, and asserts the corpus is still **falsifiable** — it runs a deliberately broken canonicalizer and requires the vectors to reject it. Three currently do. A corpus that stops discriminating passes silently otherwise.

### One implementation of the canonical form, and why it is not the SDK's

[`canonical-form.mjs`](canonical-form.mjs) is the single place these tools implement `06-security.md` §4.8.1. Every step cites the rule it comes from **by section and step**, so it can be checked against the text without opening another repository. It cited line numbers until 0.30.0, by which point 106 lines had been inserted above §4.8.1 and the range pointed at the certificate-expiry table instead.

It deliberately does **not** `import { canonicalize } from '@ospp/protocol'`. A conformance gate that canonicalizes with the SDK verifies the SDK against the SDK's own implementation: it passes whatever the SDK does, including whatever it does wrong. This repository has produced that shape twice before — a gate that compared the two SDKs to each other rather than to the registry, and a suite that defended the wrong value for `5004`.

Re-implementing is the point; re-implementing *per tool* is not. Before 0.13.0 `verify-mqtt-mac.mjs` carried its own copy, and it was wrong in exactly the way both SDKs had just been repaired for.

> **Still outstanding:** `sign-inline-md.mjs`, `sign-example.mjs`, `verify-example-signatures.mjs`, `verify-ble-crypto.mjs` and `generate-ble-vectors.mjs` do import `canonicalize` from `@ospp/protocol`, so they do not use the implementation written from the text. **The dependency half is closed at 0.30.0:** this note said the installed copy was `0.5.4` when it was `0.13.0` — identical to the declared `^0.13.0`, so the recorded remedy was a no-op — and the pin is now `^0.28.0`, whose canonicalizer sorts by UTF-8 bytes. Re-measured on the bump: signatures green, zero signer drift. Re-pointing the five tools at [`canonical-form.mjs`](canonical-form.mjs) is still tracked in KNOWN-ISSUES.

## Drift checks

Four checks for the class *"prose asserts a property and nothing establishes it"*. They are run
by `.github/workflows/check-drift.yml`; each takes no arguments and is cwd-independent.

```bash
python3 tools/check-config-defaults.py       # restated defaults vs the Chapter 08 registry
python3 tools/check-schema-conditionals.py   # schema descriptions asserting unenforced conditionals
python3 tools/check-normative-bold.py --list # normative keywords a reader will not see as normative
python3 tools/check-config-ranges.py         # the Range column, §9 vs §§2--6, and restated ranges
```

They exist because most of that class is *not* mechanically checkable — a claim in prose is not
machine-comparable to anything. These four are the exceptions, and each is narrow on purpose:

> **Both number columns carry their measurement point, and the two are different measurements.**
> *Precision* is an adjudication — someone read every flag and decided whether it was real — and it
> was done once, at `c8e59ec`, 2026-08-11, `v0.12.0`. *Today* is what the gate prints on a clean
> tree at `v0.27.0`, 2026-08-30, and it is re-runnable in one command. The precision figures were
> written without a measurement point and stood unchanged for fourteen releases while every one of
> the three corpora grew underneath them; they are kept, dated, because an adjudication does not
> stop being true of the tree it was performed on. Re-adjudicating is a separate act from re-running
> — do not merge the two columns.

| Check | Why it works | Precision, adjudicated at `v0.12.0` | Today, `v0.27.0` |
|---|---|---|---|
| `check-config-defaults` | Both sides are structured — Chapter 08 is a `(key, default, range)` table, a restatement is a key name with a number near it | 37 sites, 3 flagged, **3 real** | 25 keys with a default, 42 restated sites, **0 disagreeing** |
| `check-schema-conditionals` | Both sides are in one JSON file — the `description` and the `if`/`then` that should back it | 33 claims, 5 flagged, **5 real** | 44 claims, 38 backed, **6 not backed** (= `BASELINE`) |
| `check-normative-bold` | Pure typography — a capitalised keyword outside a `**…**` span | exact, no inference | **438** unbolded (= `BASELINE`, lowered from 439 on 2026-09-03), **1183** bolded spans at `v0.28.0` — RE-DERIVED by running the instrument, not incremented from the previous line. `v0.28.0` bolded exactly one keyword (a `MUST` in the 00-introduction revision row the release added), and the ratchet is what caught it at 440: the fix a raised BASELINE would have hidden. Companion **instrument** corrected at `v0.27.0`; it paired `**` over the raw file while the finding scan paired over the masked copy, so four literal `**` inside backticks cost it 8. `v0.26.0` re-reads **1161**, not the 1156 it shipped. The gated number is unaffected on either tree |
| `check-config-ranges` | Same structure argument as `check-config-defaults`, one column over — a range restatement is a key name with `<lo>--<hi>` near it, and `--` is as strong a signal as the word "default" | 16 sites, 4 flagged, **4 real**; plus 2 schema-bound comparisons, both real | 18 restated-range sites, 2 wire-field aliases, 2 broker settings, **1 finding** (= `BASELINE`) |

`check-config-ranges` also does what no other check does: it compares **the registry against its own
summary**. Chapter 08 states the key table twice — §§2--6 with Range and Description, §9 with an
index and a profile label — and until this check nothing compared them, while the two gates that
existed each read only one (`check-config-defaults` and the PHP SDK's `check-config-registry.php`
read §§2--6; `verify-protocol.sh` Categories 4 and 6 parse §9). That split is why §9 could carry
`Device Mgmt` against §1.5's `Device Management` without anything noticing, and why neither SDK
matched the spec on the profile label — there was no single spelling to match.

It also carries the one boundary that is otherwise only prose. `06-security.md` §2.1.1 states two **broker** settings — the bounds on certificate-revocation checking — in the registry's own form and deliberately outside the registry, because no station holds them and §1.5 would make any registry key a station obligation. Check F holds their Range cells to §1.6's five forms, feeds them into the restatement comparison, and **fails if either name ever appears in Chapter 08**. It was RED-tested per sub-check, and one of those REDs did not fire: the derived-by-a-shared-factor excuse was guarded by `lo and hi` on the *outer* test, so any range with a zero lower bound was skipped entirely rather than merely denied the excuse — `RevocationEpoch` (`0--2147483647`) had never been comparable either. The guard now scopes to the excuse alone.

Its limit is `ALIASES`, which is hand-maintained. A dedicated wire field mirroring a registry key
is invisible to check D until somebody adds the pair, and there is no mechanical signal for "these
two names denote one quantity" — the spec asserts it in prose and nothing marks it up. Both known
pairs were found by reading, not by the check.

Each carries a `BASELINE` or exits non-zero on any finding. **They are ratchets, not allowlists:**
every finding is printed on every run, and the count may fall but must not rise. When it falls,
lower the constant in the script so the improvement cannot silently regress.

All four are RED-tested: injecting one drifted default, one unenforced conditional, one unbolded
keyword, and — for `check-config-ranges`, once per check it performs — one drifted §9 cell, one
malformed Range cell and one drifted registry range, makes each exit 1, and removing the injection
returns it to 0. A gate nobody has watched fail is a gate nobody knows works.

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
