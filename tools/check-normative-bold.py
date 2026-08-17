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

Exit status
-----------
0 at or below BASELINE, 1 above. `--list` prints every finding rather than a summary
per file; `--max N` overrides BASELINE for a one-off check.
"""
import argparse
import glob
import os
import re
import sys
from collections import Counter

BASELINE = 452

KEYWORD = re.compile(r'\b(MUST NOT|MUST|SHALL NOT|SHALL)\b')
FENCE = re.compile(r'```.*?```', re.S)
TICK = re.compile(r'`[^`\n]*`')
BOLD = re.compile(r'\*\*(.+?)\*\*', re.S)
LEVEL_CELL = re.compile(r'\|\s*(MUST NOT|MUST|SHALL NOT|SHALL)\s*\|')
# section 3.1 enumerates the keywords; that enumeration is not a set of obligations
INTRO_ENUMERATION = ('spec/00-introduction.md', 120)


def scan(path):
    text = open(path, encoding='utf-8').read()
    spans_bold = [(m.start(1), m.end(1)) for m in BOLD.finditer(text)]
    spans_code = [(m.start(), m.end()) for m in FENCE.finditer(text)]
    spans_tick = [(m.start(), m.end()) for m in TICK.finditer(text)]
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
    return 0


if __name__ == '__main__':
    sys.exit(main())
