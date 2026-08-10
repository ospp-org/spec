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

Precision
---------
Measured on the corpus at the time of writing: 25 candidate sites, 3 flagged, 3 real.

The proximity window is what makes that true. Matching any key on a line to any number on
the same line cross-pairs the rows that legitimately name two keys at once -- the
`MeterValuesInterval` / `MeterValuesSampleInterval` pairs -- and drops precision to about
one in three. The default must follow the key within PROXIMITY characters.

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


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    reg = load_registry(root)

    files = sorted({p for g in SEARCH_GLOBS for p in glob.glob(g, recursive=True)}
                   - {REGISTRY})
    findings, checked = [], 0

    for path in files:
        for lineno, line in enumerate(open(path, encoding='utf-8'), 1):
            for key, want in reg.items():
                if key not in line:
                    continue
                near = re.compile(
                    r'`?' + re.escape(key) + r'`?.{0,%d}?\bdefault\b[^0-9\n]{0,12}(\d+)' % PROXIMITY,
                    re.IGNORECASE)
                for m in near.finditer(line):
                    checked += 1
                    if m.group(1) != want:
                        findings.append((path, lineno, key, want, m.group(1), line.strip()))

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
