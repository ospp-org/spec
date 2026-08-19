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

Match the SHAPE, not a word list
-------------------------------
The first implementation required the clause to open with one of
`REQUIRED|Required|Present|present|MUST be present`. That is narrower than the rule
stated two paragraphs above, and the corpus fell through the gap in two ways:

  * a synonym -- `common/service-item.schema.json` wrote "(applicable when pricingType
    is PerMinute)";
  * no lead word at all -- three certificate responses write "Error code when status is
    Rejected", where the noun phrase *is* the assertion.

Measured at v0.21.0: 41 descriptions under `schemas/**` carry the shape
"when <field> is <value>". The word list selected 31 of them as candidates; the shape
selects 37. Five of the six gained are vocabulary misses -- two "applicable when", three
"Error code when" -- and all five were real findings, so the fix is not another synonym.
The lead-in is dropped entirely and the shape alone selects a candidate; the modality and
compound filters, which is what actually keeps precision, are what remain. Swept at the
same time: no description in `schemas/**` carries the shape with a lead-in that means
something other than presence ("ignored when", "interpreted when"), so widening added no
false positive. If one ever appears, it will be flagged and must be reworded -- that is
the intended failure, not a regression.

Descriptions are read by walking the parsed document, not by matching the raw text. A
regex reading a JSON string as `"[^"]*"` stops at the first escaped quote:
`ble/auth-response.schema.json` embeds one in `sessionKeyConfirmation`, whose conditional
therefore went uncounted for as long as both existed. It happens to be enforced, so it hid
no finding -- it deflated the denominator, which is the same blindness pointed the other
way.

Precision
---------
Measured after both widenings and the pricing fix they surfaced: 39 candidate claims,
33 enforced, 6 flagged, 6 real. Under the old word list at v0.21.0: 31 / 28 / 3. Every
one of those 3 is still flagged -- the widening moved the set in one direction only.

BASELINE is the count of known-open findings. It is not an allowlist: the findings are
listed every run. Lower it as they are closed; a run that finds more than BASELINE fails.
Today's 6 are the certificate-response family -- `errorText` AND `errorCode` in each of
the same three schemas -- whose fix is a schema tightening that changes validation
outcomes for existing implementations: an open decision, not an oversight. See
`spec/07-errors.md` section 2.1. It was 3 before the widening and the corpus did not get
worse; the instrument stopped seeing half of each file.

Exit status
-----------
0 if the flagged count is at or below BASELINE, 1 above it.
"""
import glob
import json
import os
import re
import sys

BASELINE = 6

CLAIM = re.compile(
    r'\bwhen\b\s+`?([A-Za-z][A-Za-z0-9_.]*)`?\s+is\s+`?([A-Za-z0-9_]+)`?')
SOFT = re.compile(r'\b(MAY|OPTIONAL|Optional|optional|SHOULD)\b')


def property_descriptions(node):
    """Yield (property name, description) for every described property, at any depth."""
    if isinstance(node, dict):
        props = node.get('properties')
        if isinstance(props, dict):
            for name, sub in props.items():
                if isinstance(sub, dict) and isinstance(sub.get('description'), str):
                    yield name, sub['description']
        for value in node.values():
            yield from property_descriptions(value)
    elif isinstance(node, list):
        for value in node:
            yield from property_descriptions(value)


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
        doc = json.loads(open(path, encoding='utf-8').read())
        for field, desc in property_descriptions(doc):
            claim = CLAIM.search(desc)
            if not claim:
                continue
            if SOFT.search(desc):
                continue
            # Compound test, bounded by the sentence. The clause it must catch is
            # "Present when status is Accepted AND the station has ..." -- a conjunction
            # inside the condition. A following SENTENCE is not part of the condition, and
            # a fixed 40-character window that runs past the full stop drops the candidate
            # for a word belonging to the next thought: writing "Required when `pricingType`
            # is `PerMinute`, and MUST be absent otherwise" made this check skip a
            # conditional that is enforced right there in the same file.
            tail = desc[claim.end():claim.end() + 40].split('.', 1)[0]
            if re.search(r'\band\b', tail):
                continue
            total += 1
            trigger_field, trigger_value = claim.group(1), claim.group(2)
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
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
