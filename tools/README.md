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
node tools/verify-ble-crypto.mjs     # BLE handshake: station signature and gate, key schedule, device proof, AEAD — against its RFC anchors
```

`verify-mqtt-mac.mjs` recomputes `conformance/test-vectors/crypto/mqtt-mac.json`: the §4.8 canonical form, the MAC under the **decoded** session key, and — the check that gives the vector its point — the different MAC produced by keying with the Base64 *text*. A vector nothing recomputes is a claim, so this is spawned by Category 19 rather than duplicated into it.

`verify-canonical-form.mjs` holds [`canonical-form.mjs`](canonical-form.mjs) to the 17 vectors in `conformance/test-vectors/crypto/canonical-form.json`, pins the key comparator directly, and asserts the corpus is still **falsifiable** — it runs a deliberately broken canonicalizer and requires the vectors to reject it. Three currently do. A corpus that stops discriminating passes silently otherwise.

### One implementation of the canonical form, and why it is not the SDK's

[`canonical-form.mjs`](canonical-form.mjs) is the single place these tools implement `06-security.md` §4.8.1. Every step cites the rule it comes from **by section and step**, so it can be checked against the text without opening another repository. It cited line numbers until 0.30.0, by which point 106 lines had been inserted above §4.8.1 and the range pointed at the certificate-expiry table instead.

It deliberately does **not** `import { canonicalize } from '@ospp/protocol'`. A conformance gate that canonicalizes with the SDK verifies the SDK against the SDK's own implementation: it passes whatever the SDK does, including whatever it does wrong. This repository has produced that shape twice before — a gate that compared the two SDKs to each other rather than to the registry, and a suite that defended the wrong value for `5004`.

Re-implementing is the point; re-implementing *per tool* is not. Before 0.13.0 `verify-mqtt-mac.mjs` carried its own copy, and it was wrong in exactly the way both SDKs had just been repaired for.

> **Closed: the signing chain canonicalizes with this module.** `sign-inline-md.mjs`, `sign-example.mjs`, `verify-example-signatures.mjs`, `verify-ble-crypto.mjs`, `generate-ble-vectors.mjs` and `generate-tamper-vectors.mjs` imported `canonicalize` from `@ospp/protocol` — six of the twelve tools here, not the five this note first carried, since the roster was written on 2026-08-12 and `generate-tamper-vectors.mjs` landed on 2026-09-02 — and together they are the whole signing and signature-verification chain, so `verify-example-signatures.mjs` checked each signature with the canonicalizer that had produced it and could not fail on a canonicalization defect by construction. All six now import `canonicalForm` from [`canonical-form.mjs`](canonical-form.mjs), which returns what `canonicalize` returned — a string, UTF-8-encoded by each caller as before — and only ECDSA signing and verification still come from `@ospp/protocol/server`, which is why `package.json` keeps the dependency. Measured at `b070405` with the move applied, 2026-09-28: every signer and generator re-run in write mode left the committed tree byte-identical, and dropping the key sort from `canonical-form.mjs` turns seven of the gates in `verify-all-signatures.sh` red while the same break in the installed SDK leaves all of them green — the reverse of the tree before the move, where the SDK break turned the same seven red. A sort by UTF-16 code units, by contrast, leaves every signature green, because no signed body in the corpus has a key pair on which the two orders differ; `verify-canonical-form.mjs` is what catches that one. **The dependency half closed first, at 0.30.0:** this note said the installed copy was `0.5.4` when it was `0.13.0` — identical to the declared `^0.13.0`, so the recorded remedy was a no-op — and the pin is now `^0.40.0`, whose canonicalizer sorts by UTF-8 bytes. Re-measured on each bump: signatures green, zero signer drift.

## Drift checks

Six checks for the class *"prose asserts a property and nothing establishes it"*. They are run
by `.github/workflows/check-drift.yml`; each is cwd-independent, and each takes no arguments except as
shown below (`generate-error-usage` checks only with `--check`; `--list` prints the bold findings).

```bash
python3 tools/check-config-defaults.py       # restated defaults vs the Chapter 08 registry
python3 tools/check-schema-conditionals.py   # schema descriptions asserting unenforced conditionals
python3 tools/check-normative-bold.py --list # normative keywords a reader will not see as normative
python3 tools/check-config-ranges.py         # the Range column, §9 vs §§2--6, and restated ranges
python3 tools/check-message-expiry.py        # Message Expiry: §5.1 vs the per-message blocks and Appendix B
python3 tools/generate-error-usage.py --check # 07-errors.md §4.1-4.3 vs the per-message and profile error tables
```

They exist because most of that class is *not* mechanically checkable — a claim in prose is not
machine-comparable to anything. These six are the exceptions, and each is narrow on purpose:

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
| `check-message-expiry` | All three statements are structured — §5.1 is a table whose *Actions* cell lists the actions (with a per-action override table under it), each per-message block is a property table under its `### N.M` heading, and Appendix B is keyed by action — so the check is a join on the action name and reads no prose | not built at `v0.12.0`; adjudicated at `b0704054`, below | not built at `v0.27.0`; measured at `c5b885d`, below |
| `generate-error-usage --check` | All three surfaces are tables — §4's rows, the `Error Code` table in each message's `### N.M` section of `03-messages.md`, and each profile's `## N. Error ...` table — so §4.1-4.3 can be derived as code sets and compared; bold, the editorial *most common* mark, is not compared | not built at `v0.12.0`; measured at `b0704054`, below | not built at `v0.27.0`; measured at `b0704054`, below |

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

`check-message-expiry` joins **three** statements of one value across two chapters rather than a
restatement against one registry: `02-transport.md` §5.1 is the source, and each action's
per-message block and Appendix B row restate it. The category a block *names* is a verdict of its
own — a block naming a category must be in it — because that is the half that catches the
`0.14.0` edit which gave AuthorizeOfflinePass another action's value and category. An action in
no §5.1 category, or with no Appendix B row, is printed as coverage and never fails. Adjudicated
at `b0704054`, 2026-09-24, `0.43.0`: 44 pairs, 4 flagged over 3 actions, **2 of the 3 real** —
TriggerMessage and DataTransfer, decision Q7 — and UpdateServiceCatalog, whose override was then
a prose note the check does not read; `0.44.0` moved it into §5.1's override table. Measured at
`c5b885d`, 2026-09-28 (the Q7 commit): 46 pairs compared, **46 agreed**, 0 false
citations, with 5 actions in no §5.1 category and 3 with no Appendix B row as coverage.

`generate-error-usage --check` derives rather than restates: its rows come from `03-messages.md`'s
Quick Reference, so a message with no §4 row is itself a finding, and its sources are the table in
each message's `### N.M` section of `03-messages.md` and each profile's error table (BLE, which has
no per-message documents, by a named section map). Measured at `b0704054`, 2026-09-28, `0.43.0`: 32
rows derived and 31 §4 rows compared; **63 divergent (row, code) pairs on 14 rows, and one missing
row** (`SessionEnded`) — 22 in §4 and in no table, 9 in a table and not in §4, 40 where `03` and the
profile disagree with each other (8 pairs are in two of those classes, so the three sum to 71). None is
resolved by editing: which surface governs is a decision
(the script names five), so the pairs are its `BASELINE`, and it fails on a pair the baseline does not
list **and** on a listed pair that no longer occurs. Generating §4 outright waits on those decisions;
§4.4 has no source outside itself and is not derived.

Each carries a `BASELINE` or exits non-zero on any finding. **They are ratchets, not allowlists:**
every finding is printed on every run, and the count may fall but must not rise. When it falls,
lower the constant in the script so the improvement cannot silently regress.

All six are RED-tested: injecting one drifted default, one unenforced conditional, one unbolded
keyword, and — for `check-config-ranges`, once per check it performs — one drifted §9 cell, one
malformed Range cell and one drifted registry range, and — for `check-message-expiry` — one false
category citation beside a number that agrees and one `### N.M` heading stripped of its number,
makes each exit 1, and removing the injection returns it to 0 — and, for `generate-error-usage`, one
code added to one §4 row and one added to one per-message table each exit 1, while a renamed `### N.M`
heading in `03-messages.md`, a renamed profile error heading and a renamed §4 heading each exit 2 on a
floor. A gate nobody has watched fail is a gate nobody knows works.

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
