#!/usr/bin/env python3
"""Report normative keywords that are not bolded -- the obligations a reader will miss.

Why this exists
---------------
`spec/00-introduction.md` section 3.1 once read "when, and only when, they appear in
**BOLD UPPERCASE**". Measured against the corpus, that made 496 of 1391 capitalised
MUST/SHALL keywords non-binding -- among them the entire MQTT topic-ACL apparatus and all
ten OfflinePass validation checks. The qualifier was stricter than RFC 8174, which
requires only capitals; no other chapter or profile restated it; and the paragraph
directly below it identified the non-binding case as *lowercase or mixed case*, never as
unbolded capitals. The qualifier was the defect and it was removed.

So this check no longer reports rules that fail to bind -- they all bind now. It reports
a *style* defect with a real cost: bold is how a reader finds the obligations in a
1600-line chapter, and an unbolded MUST reads as prose. The split is not random. It is
sectional, and whole rule-sets are plain: Chapter 02's access control, Chapter 06's
sections 2.2, 2.3, 2.5 and 4.5, most of Chapter 08.

What is deliberately not reported
---------------------------------
  * fenced code blocks and inline code spans -- ``MUST NOT`` in backticks is a reference
    to a rule, not the imposition of one
  * a table cell that is exactly a keyword -- the "Normative Level" column in the profile
    READMEs, where MUST is the value, not a keyword in a sentence
  * section 3.1's own enumeration of the keywords

BASELINE is a ratchet, not an allowlist: every finding is printed every run. The point is
that the count may fall and must not rise. Lower it as sections get bolded.

Measurement points, so the number is never quoted without one:

    (this HEAD) 2026-08-28  v0.26.0   439 unbolded, 1156 bolded spans — the station-refusal
                                   adjudication cycle. Unbolded is UNCHANGED, and that is a
                                   measured result rather than an untouched one: the finding set
                                   was diffed entry by entry against a `git archive` of 573bf6b
                                   and is identical once line numbers are stripped, so every
                                   document this release edits added no unbolded keyword and
                                   removed none. +17 bolded spans, all of them new text.
    573bf6b  2026-08-19  v0.25.0   439 unbolded, 1139 bolded spans — the divergence-adjudication
                                   cycle. -2 on +22 bolded spans, and the -2 is that release's
                                   CONTENT only: the instrument correction that took 443 to 441
                                   landed in its own commit, on the pristine tree, so the two are
                                   separable. Read the 441 row below first.
                                   CORRECTED 2026-08-28. This row read "(this HEAD) ... 1129
                                   ... +12" until then. Both were wrong, from one cause: the
                                   companion was never re-derived. Running the shipped instrument
                                   over a pristine `git archive` of this very commit gives 1139,
                                   and 1117 -> 1139 is +22. The gated number (439) was right; its
                                   ungated companion was ten low, and the delta computed from it
                                   inherited the error. That is the THIRD time in this header —
                                   after 456-vs-452 and 1087-vs-1088 — and the second time it was
                                   the bolded-span companion specifically, which is the number
                                   nothing gates. The row also never got its sha: it was still
                                   labelled "(this HEAD)" after v0.25.0 was cut, which is the
                                   other half of the same rule and the same omission the 441 row
                                   below already records against ITS predecessor.
    efe009c  2026-08-18  v0.24.1   441 unbolded, 1117 bolded spans — RE-MEASURED, not inherited.
                                   The gate as shipped reported 443 on this same tree. It was
                                   wrong: BOLD paired `**` over the raw text, so the literal glob
                                   `schemas/**` inside backticks in 00-introduction.md's 0.22.0
                                   history row inverted the phase of every bold span from that
                                   character to the end of the file, and bolded keywords in the
                                   tail were counted as unbolded. Wrong since 0.22.0, across three
                                   releases. Nothing reported it because an over-count is the safe
                                   direction for a ratchet that only refuses increases — see the
                                   note under `Exit status`. The row that stood here read
                                   "(this HEAD) ... (unreleased)" and was never stamped when the
                                   tag was cut, so it carried neither a sha nor a version nor its
                                   bolded-span companion.
    d553820  2026-08-18  v0.23.0   450 unbolded, 1088 bolded spans — the diagnostics
                                   cycle added a chapter section and two conformance Parts, all
                                   bolded, and bolded one pre-existing MUST in 03-messages.md.
                                   NOTE: this row said 1087 until it was re-run from a pristine
                                   `git archive` of d553820 and found to be 1088. The gated
                                   number (450) was right; its companion was one off, written in
                                   the same release that added CONTRIBUTING's rule about it. A
                                   count nothing gates is the one that goes stale.
    b35eef6  2026-08-18  v0.22.0   452 unbolded, 1062 bolded spans
    a6770c3  2026-08-17  v0.21.0   452 unbolded
    (earlier)                      456 — superseded, and it outlived its accuracy by
                                   being carried in notes rather than read from here

The ratchet counts UNBOLDED keywords, so adding a bolded **MUST** costs nothing and
adding a plain one fails CI at zero headroom. That asymmetry is the whole design and it
is the thing most often misread.

Exit status
-----------
0 AT baseline, 1 above it, and **1 below it as well** -- a drop is a change to the number this
file publishes and must be recorded here, not absorbed silently.

Below-baseline used to return 0, and that asymmetry is what hid this gate's own measurement
defect for three releases: **a ratchet that only refuses increases cannot report its own
downward drift.** The reasoning generalises to every threshold that moves in one direction --
each is blind to the reverse motion, and a threshold seeded from its own instrument's output
bakes that instrument's error into itself. Of the four gates in `tools/` carrying a numeric
BASELINE, three were one-directional in exactly this way; all four now refuse both directions. `--list` prints every finding rather than a summary
per file; `--max N` overrides BASELINE for a one-off check.
"""
import argparse
import glob
import os
import re
import sys
from collections import Counter

BASELINE = 439

KEYWORD = re.compile(r'\b(MUST NOT|MUST|SHALL NOT|SHALL)\b')
FENCE = re.compile(r'```.*?```', re.S)
TICK = re.compile(r'`[^`\n]*`')
BOLD = re.compile(r'\*\*(.+?)\*\*', re.S)
LEVEL_CELL = re.compile(r'\|\s*(MUST NOT|MUST|SHALL NOT|SHALL)\s*\|')
# section 3.1 enumerates the keywords; that enumeration is not a set of obligations
INTRO_ENUMERATION = ('spec/00-introduction.md', 120)


def scan(path):
    text = open(path, encoding='utf-8').read()
    spans_code = [(m.start(), m.end()) for m in FENCE.finditer(text)]
    spans_tick = [(m.start(), m.end()) for m in TICK.finditer(text)]
    # Pair ** over a copy with code spans blanked, NOT over the raw text. A `**` inside
    # backticks is a glob, not a bold marker -- `schemas/**` is the live example -- and BOLD
    # is a sequential non-greedy pairing, so a single literal marker inverts the phase of every
    # span after it for the rest of the file. That is what it did: `schemas/**` entered
    # 00-introduction.md's 0.22.0 history row, and from that character to the end of the file
    # every bolded keyword was read as unbolded. The count was wrong in the safe direction --
    # too high -- which is why a ratchet that only refuses increases never reported it.
    # Blanking preserves offsets, so every span index below still refers to the real text.
    masked = list(text)
    for a, b in spans_code + spans_tick:
        for i in range(a, b):
            masked[i] = ' '
    spans_bold = [(m.start(1), m.end(1)) for m in BOLD.finditer(''.join(masked))]
    lines = text.split('\n')
    out = []
    for m in KEYWORD.finditer(text):
        pos = m.start()
        if any(a <= pos < b for a, b in spans_code):
            continue
        if any(a <= pos < b for a, b in spans_bold):
            continue
        if any(a <= pos < b for a, b in spans_tick):
            continue
        lineno = text[:pos].count('\n') + 1
        if path == INTRO_ENUMERATION[0] and lineno < INTRO_ENUMERATION[1]:
            continue
        line = lines[lineno - 1]
        if LEVEL_CELL.search(line) and len(line.split('|')) > 2:
            # a bare keyword in its own cell is a requirement-level label
            if any(c.strip() == m.group(0) for c in line.split('|')):
                continue
        out.append((path, lineno, m.group(0), line.strip()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true', help='print every finding')
    ap.add_argument('--max', type=int, default=None, help='override BASELINE')
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    files = sorted(glob.glob('spec/**/*.md', recursive=True))
    if not files:
        sys.exit('No files under spec/ -- the layout moved and this check would '
                 'otherwise pass vacuously.')

    findings = [f for p in files for f in scan(p)]
    bolded = sum(len([m for m in BOLD.finditer(open(p, encoding='utf-8').read())
                      if KEYWORD.search(m.group(1))]) for p in files)
    ceiling = args.max if args.max is not None else BASELINE

    print(f'unbolded normative keywords in spec/ : {len(findings)}  (baseline {ceiling})')
    print(f'bolded spans containing a keyword    : {bolded}')

    if args.list:
        for path, lineno, kw, line in findings:
            print(f'  {path}:{lineno}  [{kw}]  {line[:120]}')
    else:
        print('\nby file (--list for every site):')
        for path, n in Counter(f[0] for f in findings).most_common():
            print(f'  {n:>4}  {path}')

    if len(findings) > ceiling:
        print(f'\n{len(findings) - ceiling} newly unbolded keyword(s). Bold them: what binds is '
              f'the capitalisation, but bold is how a reader finds the obligation.')
        return 1
    if len(findings) < ceiling:
        print(f'\nBelow baseline ({len(findings)} < {ceiling}). Lower BASELINE in this file '
              f'so the improvement cannot silently regress.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
