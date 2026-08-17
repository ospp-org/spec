#!/usr/bin/env python3
"""Report gates in tools/ that no workflow can reach — the check that has no signal of its own.

Why this exists
---------------
`check-drift.yml` states the principle in its own header: *"A gate in tools/ that no job runs is
the same defect one level up."* It had no instrument.

This is the hardest failure in the family to notice, and the reason is structural. A gate that
verifies the wrong thing still emits a verdict, and a verdict can later be found wrong. A gate
nothing starts emits **nothing** — not a pass, not a failure, not a log line. There is no artefact
to inspect and no run to re-read. It is found only by enumerating the tools, enumerating the
callers, and subtracting the two sets, which is a census rather than a check — and a census has to
be remembered and repeated. This file exists so that it does not.

Measured on the run that introduced it: **four** gates were unreachable from any workflow —
`validate-schemas.sh`, `validate-examples.sh`, `verify-all-signatures.sh` and `verify-protocol.sh`
— and with them the whole signed-conformance guard: vector signatures, the RFC-anchored BLE crypto
oracle, signer idempotency, the placeholder scan, the canonical-form oracle and the MQTT MAC
vectors. Two of the four were also *broken*, each reporting 100% failure, which is what kept them
from being missed loudly: a totally-failing instrument reads as a broken environment and gets
walked past.

Reachability, not direct invocation
-----------------------------------
A tool counts as reached if a workflow names it **or** if a tool that is itself reached names it.
`verify-example-signatures.mjs` has no workflow line and never will; it is reached because
`verify-all-signatures.sh` calls it and a workflow calls that. Requiring a direct workflow line for
every file would push the repo toward one job per script, which is the opposite of what the
existing guards do.

Self-references are stripped: nearly every tool names itself in its own usage string.

**Comments are stripped first, and that is load-bearing.** The first version of this file matched
any `tools/<name>` string anywhere, and reported every gate reachable — a clean green that was
wrong. `verify-protocol.sh` was marked reached because a *comment* in `verify-mqtt-mac.mjs` says
"and as Category 19 of tools/verify-protocol.sh", and a comment in the workflow that deliberately
does **not** wire it explains why. Prose about a tool is the opposite of a caller for it: the more
carefully the absence of a caller is documented, the more references accumulate, so an
unstripped scan gets *more* confident the worse the situation is. A census whose own instrument
does not discriminate is the failure it was written to find, one level further up.

**In a workflow, only an execution position counts.** The second false green came from `paths:`
filters. A workflow that triggers on `tools/validate-schemas.sh` names it without running it —
and a well-written workflow lists exactly the tool it calls, so the trigger block and the call
block say the same words. Deleting the `run:` line and keeping the trigger left this check
reporting the gate as reached. So references inside a workflow are counted only when the line
puts the file in an execution position: after `python3`, `node`, `bash`, `sh`, or `./`. Inside a
*tool*, no such restriction applies — a tool naming another tool in live code is requiring or
spawning it, and `verify-protocol.sh` reaches its two sub-verifiers through a `path.join` that no
interpreter prefix would match.

EXCLUSIONS is a decision, not an allowlist
-------------------------------------------
Some files in tools/ are not gates and must never acquire a workflow caller. A code generator run
in CI would either be a no-op or would commit to the checkout; a signing tool run in CI would
rewrite the corpus it is meant to preserve; a module has no entry point at all. Each exclusion
carries the reason it is one, and a stale exclusion — naming a file that no longer exists — is a
hard failure, so the list cannot quietly outlive what it excused.

BASELINE is a ratchet
---------------------
It is the number of unreached gates that are *known* to be unreached and not yet wired. Every
finding prints on every run. The count may fall and must not rise; a new tool added without a
caller fails immediately, which is the case this file was written for.

Exit status
-----------
0 at or below BASELINE, 1 above, 2 if the enumeration itself came back empty or an exclusion is
stale. `--list` prints the reachability of every tool, not only the findings.
"""
import glob
import os
import re
import sys

# Unreached gates that are known and not yet wired. Lower it as they are wired; a run that finds
# more than this fails.
BASELINE = 1

# Files under tools/ that are not gates. The value is why — a reason a later reader can disagree
# with, rather than a name they have to take on trust.
EXCLUSIONS = {
    'canonical-form.mjs':
        'module, not an entry point — the single canonical-form implementation, imported by '
        'verify-canonical-form.mjs and verify-mqtt-mac.mjs. Running it would do nothing.',
    'ble-crypto.mjs':
        'module, not an entry point — the BLE key-schedule primitives imported by '
        'verify-ble-crypto.mjs and generate-ble-vectors.mjs.',
    'generate-ble-vectors.mjs':
        'generator. It writes the BLE vectors; CI verifies them with verify-ble-crypto.mjs '
        'instead, which is the direction that can fail.',
    'generate-types.sh':
        'generator. It emits SDK types from the schemas into another repository; the SDKs gate '
        'their own vendored copies.',
    'sign-example.mjs':
        'signing tool. Running it in CI would rewrite the corpus the guards exist to preserve. '
        'What CI checks is that re-running it is a no-op, which verify-all-signatures.sh does.',
    'sign-inline-md.mjs':
        'signing tool, same as sign-example.mjs — and it *is* reached, by '
        'verify-all-signatures.sh, which runs it precisely to assert idempotency. Listed here so '
        'that stays deliberate rather than incidental.',
}

TOOL_RE = re.compile(r'tools/([A-Za-z0-9._-]+\.(?:py|sh|mjs))')
GATE_SUFFIXES = ('.py', '.sh', '.mjs')

# Comment forms across the three languages in tools/ plus YAML. Python docstrings and JS block
# comments are spans; the rest are to-end-of-line.
BLOCK_COMMENT = re.compile(r'/\*.*?\*/|"""(?:.|\n)*?"""|\'\'\'(?:.|\n)*?\'\'\'', re.S)
LINE_COMMENT = re.compile(r'(?m)^\s*(?:#|//|\*)\s?.*$')
# A workflow reference counts only where the file is actually being executed.
INVOKE_RE = re.compile(r'(?:python3?|node|bash|sh|\./)\s+\.?/?tools/([A-Za-z0-9._-]+\.(?:py|sh|mjs))')


def strip_comments(text):
    return LINE_COMMENT.sub('', BLOCK_COMMENT.sub('', text))


def references(path, execution_position_only=False):
    """Every tools/<file> named in executable text inside `path`, minus a self-reference.

    Comments are removed before matching -- see the module docstring. Without that step this
    check reports a clean green over a corpus in which nothing is wired, because the notes
    explaining that a tool has no caller are themselves references to it.

    `execution_position_only` is set for workflow files, where a `paths:` trigger names a tool
    without running it -- and names precisely the tool the job calls, so the two blocks say the
    same words and a deleted `run:` line goes unnoticed.
    """
    with open(path, encoding='utf-8') as fh:
        text = strip_comments(fh.read())
    matcher = INVOKE_RE if execution_position_only else TOOL_RE
    return {m for m in matcher.findall(text) if m != os.path.basename(path)}


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    list_all = '--list' in sys.argv

    tools = sorted(
        os.path.basename(p) for p in glob.glob('tools/*')
        if p.endswith(GATE_SUFFIXES)
    )
    workflows = sorted(glob.glob('.github/workflows/*.yml') + glob.glob('.github/workflows/*.yaml'))
    if not tools or not workflows:
        sys.exit(f'Enumerated {len(tools)} tool(s) and {len(workflows)} workflow(s) -- one of the '
                 f'two globs found nothing, so this check would pass vacuously. The layout moved.')

    stale = sorted(set(EXCLUSIONS) - set(tools))
    if stale:
        for name in stale:
            print(f'  STALE EXCLUSION  {name} -- excluded here but no such file in tools/')
        sys.exit(2)

    # Seed from the workflows, then close over tool-to-tool references.
    reached = set()
    for wf in workflows:
        reached |= references(wf, execution_position_only=True) & set(tools)
    changed = True
    while changed:
        changed = False
        for name in sorted(reached):
            for ref in references(f'tools/{name}') & set(tools):
                if ref not in reached:
                    reached.add(ref)
                    changed = True

    gates = [t for t in tools if t not in EXCLUSIONS]
    unreached = [t for t in gates if t not in reached]

    print(f'tools/ entries          : {len(tools)}')
    print(f'  excluded (not gates)  : {len(EXCLUSIONS)}')
    print(f'  gates                 : {len(gates)}')
    print(f'  reachable from a job  : {len(gates) - len(unreached)}')
    print(f'  unreached             : {len(unreached)}  (baseline {BASELINE})')

    if list_all:
        print('\nreachability:')
        for t in tools:
            if t in EXCLUSIONS:
                mark, note = 'excluded ', EXCLUSIONS[t].split(' -- ')[0].split('.')[0]
            else:
                mark, note = ('reached  ', '') if t in reached else ('UNREACHED', '')
            print(f'  {mark}  {t}{"  -- " + note if note else ""}')

    if unreached:
        print('\nno workflow reaches these, directly or through another tool:')
        for t in unreached:
            print(f'  {t}')

    if len(unreached) > BASELINE:
        print(f'\n{len(unreached) - BASELINE} gate(s) newly unreachable. Give each a workflow step, '
              f'or add it to EXCLUSIONS with the reason it is not a gate. A gate nothing starts '
              f'emits no signal at all -- not even a failure.')
        return 1
    if len(unreached) < BASELINE:
        print(f'\nBelow baseline ({len(unreached)} < {BASELINE}). Lower BASELINE in this file so '
              f'the improvement cannot silently regress.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
