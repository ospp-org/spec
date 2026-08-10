#!/usr/bin/env python3
"""Flag restated configuration defaults that disagree with the Chapter 08 registry.

Why this exists
---------------
`spec/08-configuration.md` sections 2-6 are the single registry of configuration keys:
one row per key, carrying its default and range. Every other mention of a key and its
default anywhere in the corpus is a *restatement*, and restatements drift.

Seven had, when this check was written. `spec/profiles/transaction/README.md` carried
three in one table and all three were wrong. `spec/03-messages.md` gave MeterValuesInterval
as 15s six lines above giving it as 60s. `conformance/test-cases/transaction/TC-TX-004.md`
cited section 3 of Chapter 08 as its source and contradicted it in the same sentence.

This is the one part of the "prose claims something nothing establishes" class that is
cheaply machine-checkable, because both sides are structured: the registry is a table,
and a restatement is a key name with a number near it.

Two shapes, because a restatement takes two
-------------------------------------------
Prose puts the word "default" beside the key. A table puts it in a column header, possibly
forty lines above the row -- the implementors guide restates eight keys that way, and the
first version of this check could not see any of them. Both forms are handled.

Precision
---------
Measured on the corpus at the time of writing: 37 candidate sites, 3 flagged, 3 real
(25 sites before the table form was added).

The proximity window is what makes the prose form work. Matching any key on a line to any
number on the same line cross-pairs the rows that legitimately name two keys at once -- the
`MeterValuesInterval` / `MeterValuesSampleInterval` pairs -- and drops precision to about
one in three. The default must follow the key within PROXIMITY characters.

Both forms are RED-tested: injecting one drifted table cell and one drifted prose default
produces exactly two findings and exit 1.

Exit status
-----------
0 if every restated default agrees with the registry, 1 otherwise.
"""
import glob
import os
import re
import sys

REGISTRY = 'spec/08-configuration.md'
PROXIMITY = 40

# A registry row: | `KeyName` | type | `default` | access | mutability | range | description |
ROW = re.compile(r'\|\s*`([A-Za-z][A-Za-z0-9_]*)`\s*\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|')

SEARCH_GLOBS = ('spec/**/*.md', 'guides/*.md', 'examples/**/*.md', 'conformance/**/*.md')


def load_registry(root):
    reg = {}
    path = os.path.join(root, REGISTRY)
    if not os.path.exists(path):
        sys.exit(f'{REGISTRY} not found -- the registry moved and this check would '
                 f'otherwise pass vacuously.')
    for line in open(path, encoding='utf-8'):
        m = ROW.match(line.strip())
        if m:
            reg.setdefault(m.group(1), m.group(3).strip().strip('"'))
    if not reg:
        sys.exit(f'{REGISTRY} yielded zero keys -- the table format changed. '
                 f'Refusing to report success for zero work.')
    return reg


def table_default_column(lines, idx):
    """If line `idx` sits under a table header carrying a Default column, return its index.

    Prose restatements say the word "default" next to the key. Tables do not -- they put
    it in a column header, sometimes forty lines above the row. The proximity rule cannot
    see that, and the implementors guide restates eight keys in exactly that shape.
    """
    for back in range(idx, max(-1, idx - 60), -1):
        cells = [c.strip().lower() for c in lines[back].split('|')]
        if not any(re.fullmatch(r':?-{3,}:?', c) for c in cells if c):
            continue
        header = [c.strip().lower() for c in lines[back - 1].split('|')]
        for i, c in enumerate(header):
            if c == 'default':
                return i
        return None
    return None


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    reg = load_registry(root)

    files = sorted({p for g in SEARCH_GLOBS for p in glob.glob(g, recursive=True)}
                   - {REGISTRY})
    findings, checked = [], 0

    for path in files:
        lines = open(path, encoding='utf-8').read().split('\n')
        for lineno, line in enumerate(lines, 1):
            for key, want in reg.items():
                if key not in line:
                    continue

                # form 1: prose -- "<Key> ... default N", scoped to PROXIMITY characters
                near = re.compile(
                    r'`?' + re.escape(key) + r'`?.{0,%d}?\bdefault\b[^0-9\n]{0,12}(\d+)' % PROXIMITY,
                    re.IGNORECASE)
                for m in near.finditer(line):
                    checked += 1
                    if m.group(1) != want:
                        findings.append((path, lineno, key, want, m.group(1), line.strip()))

                # form 2: a table row under a header carrying a Default column
                if not re.match(r'\s*\|\s*`?' + re.escape(key) + r'`?\s*\|', line):
                    continue
                col = table_default_column(lines, lineno - 1)
                if col is None:
                    continue
                cells = line.split('|')
                if col >= len(cells):
                    continue
                got = cells[col].strip().strip('`').strip('"')
                if not got:
                    continue
                checked += 1
                if got != want.strip('"'):
                    findings.append((path, lineno, key, want, got, line.strip()))

    print(f'registry keys with a default : {len(reg)}')
    print(f'restated-default sites       : {checked}')
    print(f'disagreeing with registry    : {len(findings)}')

    for path, lineno, key, want, got, line in findings:
        print(f'\n  {path}:{lineno}')
        print(f'     {key}: registry says {want}, document says {got}')
        print(f'     {line[:120]}')

    if findings:
        print(f'\n{REGISTRY} is the registry. Correct the restatement, or replace it with a '
              f'pointer -- restating a default is how it drifts.')
        return 1
    print('\nAll restated defaults agree with the registry.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
