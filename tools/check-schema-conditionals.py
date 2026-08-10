#!/usr/bin/env python3
"""Flag schema descriptions that assert a conditional the schema does not enforce.

Why this exists
---------------
A JSON Schema `description` reading "Present when status is Rejected" states a
requirement. A validator does not read descriptions. If no `if`/`then` or
`dependentRequired` backs it, a payload that omits the field validates clean, and the
requirement is enforced by nobody -- while the schema, the artefact everyone treats as
authoritative, appears to state it.

Ten sibling response schemas express exactly this condition with `if`/`then`. The ones
that do not are an omission against house style, not a design choice.

Scope, deliberately narrow
--------------------------
Only *intra-document* conditionals are checked: "<X> when <sibling field> is <value>".
Those are the ones JSON Schema can express.

Cross-artefact claims are NOT flagged and must not be. "MUST equal the CN in the issued
client certificate", "The station MUST cross-check against Hello.deviceId", "MUST be no
later than five minutes after issuedAt" -- JSON Schema cannot compare against an X.509
certificate, another message, or another member's value. Those descriptions are correct
and their citation, not their enforcement, is what matters. Flagging them was the first
version of this check and it produced 17 files of noise.

Two further filters earn their keep:
  * modality -- a description carrying MAY / OPTIONAL / SHOULD is not asserting a
    requirement. `ble/auth-response.schema.json` says durationSeconds "MAY be present
    when result is Accepted"; that is a permission.
  * compound -- "Present when status is Accepted and the station has ..." depends on
    something outside the document.

Precision
---------
Measured at the time of writing: 33 candidate claims, 28 enforced, 5 flagged, 5 real.
Without the modality filter, 8 flagged and 3 of those were false.

BASELINE is the count of known-open findings. It is not an allowlist: the findings are
listed every run. Lower it as they are closed; a run that finds more than BASELINE fails.
Today's 3 are the certificate-response family, whose fix is a schema tightening that
changes validation outcomes for existing implementations -- an open decision, not an
oversight. See `spec/07-errors.md` section 2.1.

Exit status
-----------
0 if the flagged count is at or below BASELINE, 1 above it.
"""
import glob
import json
import os
import re
import sys

BASELINE = 3

CLAIM = re.compile(
    r'\b(REQUIRED|Required|Present|present|MUST be present)\b'
    r'[^.]{0,40}?\bwhen\b\s+`?([A-Za-z][A-Za-z0-9_.]*)`?\s+is\s+`?([A-Za-z0-9_]+)`?')
SOFT = re.compile(r'\b(MAY|OPTIONAL|Optional|optional|SHOULD)\b')
PROP = re.compile(r'"([A-Za-z0-9_]+)"\s*:\s*\{([^{}]*"description"\s*:\s*"([^"]*)")')


def covered_by(doc, field, trigger_value):
    """True if some if/then or dependentRequired makes `field` required for this value."""
    found = False

    def walk(node):
        nonlocal found
        if isinstance(node, dict):
            if 'if' in node and 'then' in node:
                if trigger_value in json.dumps(node['if']) and field in json.dumps(node['then']):
                    found = True
            if 'dependentRequired' in node and field in json.dumps(node['dependentRequired']):
                found = True
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc)
    return found


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    schemas = sorted(glob.glob('schemas/**/*.schema.json', recursive=True))
    if not schemas:
        sys.exit('No schemas found under schemas/ -- the layout moved and this check '
                 'would otherwise pass vacuously.')

    total = enforced = 0
    findings = []

    for path in schemas:
        raw = open(path, encoding='utf-8').read()
        doc = json.loads(raw)
        for m in PROP.finditer(raw):
            field, desc = m.group(1), m.group(3)
            claim = CLAIM.search(desc)
            if not claim:
                continue
            if SOFT.search(desc):
                continue
            tail = desc[claim.start():claim.end() + 40]
            if re.search(r'\band\b', tail):
                continue
            total += 1
            trigger_field, trigger_value = claim.group(2), claim.group(3)
            if covered_by(doc, field, trigger_value):
                enforced += 1
            else:
                findings.append((path, field, trigger_field, trigger_value, desc))

    print(f'intra-document conditional claims : {total}')
    print(f'  backed by if/then or dependentRequired : {enforced}')
    print(f'  NOT backed                             : {len(findings)}  (baseline {BASELINE})')

    for path, field, tf, tv, desc in findings:
        print(f'\n  {path}')
        print(f'     "{field}" is described as present when {tf} is {tv}, '
              f'and no conditional requires it')
        print(f'     description: {desc[:110]}')

    if len(findings) > BASELINE:
        print(f'\n{len(findings) - BASELINE} new unenforced conditional(s). Either add the '
              f'if/then, or reword the description to the modality that is actually meant.')
        return 1
    if len(findings) < BASELINE:
        print(f'\nBelow baseline ({len(findings)} < {BASELINE}). Lower BASELINE in this file '
              f'so the improvement cannot silently regress.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
