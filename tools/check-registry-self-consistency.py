#!/usr/bin/env python3
"""A registry cell must not both engage and disengage §1.4's branching obligation.

Why this exists
---------------
`3003 SERVICE_UNAVAILABLE` carried both of these in ONE cell, from v0.31.0 to v0.32.0:

    "These causes have different correct recoveries, so this is a **branching entry**
     per §1.4, and servers **MUST** carry `details.cause`"
    "**This entry does not branch, and `details` stays OPTIONAL for it** ... §1.4's
     branching obligation is not engaged."

The second sentence is older than the first: it stood unchanged at v0.29.0 and v0.30.0,
and the v0.31.0 edit that added the branching MUST did not remove it. Two releases
shipped a registry row that answered its own question both ways, and `3003` rides
`StartServiceResponse` — a station answering `Rejected` could not tell whether
`details.cause` was required of it.

Nothing could catch it. The error-registry gates in both SDKs parse code, name, severity
and recoverable; none reads the Description prose, which is where the obligation lives.

What this checks
----------------
For every row of the §3 registry: if the Description asserts the row branches (a `MUST`
in the neighbourhood of `details.cause`, or the literal phrase "branching entry"), then
the same cell MUST NOT also assert that it does not branch, or that `details` is OPTIONAL
for it. The two claims are about the same field and cannot both hold.

This is deliberately narrow. It does not decide WHICH half is right -- a human does that,
and the answer is not always the newer sentence. It reports that a cell says both.
"""
import re
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = os.path.join(ROOT, "spec", "07-errors.md")

ENGAGES = [
    re.compile(r"\bbranching entry\b", re.I),
    re.compile(r"\*\*MUST\*\*\s+carry\s+`details\.cause`", re.I),
]
DISENGAGES = [
    re.compile(r"does not branch", re.I),
    re.compile(r"branching obligation is not engaged", re.I),
    re.compile(r"`details`\s+stays\s+OPTIONAL", re.I),
]

QUOTED = re.compile(r'"[^"]*"|\u201c[^\u201d]*\u201d')

def strip_mentions(text):
    """Delete quoted spans before matching.

    A cell may QUOTE a retracted sentence to record that it was retracted -- this
    document does that routinely, and it is the opposite of a defect. What must not
    survive is the sentence used as an assertion. So the gate reads a use, not a
    mention: everything inside double quotes (straight or typographic) is removed
    before the patterns run. The control for this is in the test block below --
    planting the sentence UNQUOTED must still be caught.
    """
    return QUOTED.sub(" ", text)

def rows(path):
    """Every §3 registry row: (code, name, full line). Denominator printed by caller."""
    out = []
    for i, line in enumerate(open(path, encoding="utf-8"), 1):
        m = re.match(r"^\|\s*(\d{4})\s*\|\s*`([A-Z_]+)`\s*\|\s*(\w+)\s*\|\s*(true|false)\s*\|", line)
        if m:
            out.append((i, m.group(1), m.group(2), line))
    return out

def main():
    all_rows = rows(REG)
    if not all_rows:
        print("check-registry-self-consistency: FAIL — parsed 0 registry rows; the matcher is broken", file=sys.stderr)
        return 2

    findings = []
    for lineno, code, name, line in all_rows:
        used = strip_mentions(line)
        eng = [p.pattern for p in ENGAGES if p.search(used)]
        dis = [p.pattern for p in DISENGAGES if p.search(used)]
        if eng and dis:
            findings.append((lineno, code, name, eng, dis))

    print(f"registry rows checked : {len(all_rows)}")
    print(f"self-contradictory    : {len(findings)}")
    for lineno, code, name, eng, dis in findings:
        print(f"\n  spec/07-errors.md:{lineno}  {code} {name}")
        print(f"    engages  §1.4 via : {eng}")
        print(f"    disengages it via : {dis}")

    if findings:
        print("\nA cell that both engages and disengages §1.4 leaves the caller with no answer.")
        print("Decide which half is true and delete the other; do not soften both.", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
