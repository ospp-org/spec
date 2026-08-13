#!/usr/bin/env python3
"""Gate: the Chapter 08 Range column, the profile identifier, and the two places the
registry states itself.

`spec/08-configuration.md` states the configuration registry twice. Sections 2--6 are the
registry proper -- the set §1.3 and §7.1 both name when they decide what counts as a
recognized key -- and Section 9 is a summary derived from it. They do not carry the same
columns: §§2--6 add Range and Description, §9 adds an index number and a profile label.
Neither is a superset, nothing compared them, and each of the two gates that existed read
only one of them (`check-config-defaults.py` and the PHP SDK's `check-config-registry.php`
read §§2--6; `verify-protocol.sh` Categories 4 and 6 parse §9). A registry that states
itself twice with no comparison between the statements is how the two drift apart.

Five checks, in the order a defect propagates:

A. **§9 against §§2--6** -- the key set in both directions, and the four columns they share
   (Type, Default, Access, Mutability). This is the check whose absence let §9 carry
   `Device Mgmt` while §1.5 carried `Device Management`, which is in turn why neither SDK
   agreed with the spec on the profile label: there was no single spelling to agree with.

B. **The Range column's form.** Every cell must match one of the five forms §1.6 declares,
   and the per-form counts §1.6 states must be exact. §1.6 states counts precisely so that
   they can be checked; a count nothing recomputes is a claim, not a fact.

C. **Restated ranges.** The `check-config-defaults.py` argument applies unchanged: both
   sides are structured -- Chapter 08 is a `(key, range)` table and a restatement is a key
   name with `<lo>--<hi>` near it -- so the comparison is mechanical rather than inferred.

   A range that scales BOTH endpoints of the registry range by one factor is *derived*, not
   in disagreement: `connection-lost.md` publishes the staleness window as 3.5x the
   heartbeat interval. Requiring the same factor at both ends is what stops this excusing a
   real drift -- a restatement that moves one endpoint only has no single factor and is
   still reported. RED-tested by moving one endpoint.

D. **Wire fields that carry a registry quantity.** A key whose value also travels as a
   dedicated field in a schema is bound by both the registry range and that field's
   `minimum`/`maximum` (§1.6). This is where check C is blind: the restatement is written
   under the *wire field's* name, so a check keyed on the config key name never sees it.
   That is exactly how `heartbeatIntervalSec` held `10--3600` against a registry cell of
   `30--3600` across four sites without anything noticing.

   The two known pairs are NOT the same shape, and 0.16.0 resolved only one of them.
   `heartbeatIntervalSec` declares BOTH bounds -- one of only six integer properties in
   `schemas/mqtt/` that do -- so it is a considered range, and `heartbeat.md` §5 already
   clamped to its lower bound. The registry cell was the wrong one and was widened to match.
   `retryInterval` declares `minimum: 1` and no maximum, which is the majority shape in
   these schemas (17 properties) and a type floor rather than a range; aligning the registry
   to it would delete the constraint instead of correcting it. It stays open.

E. **The profile identifier.** §1.5 carries a display label and a normative Profile ID; the
   IDs must be exactly the declared vocabulary and must each be usable as a program
   identifier, and every profile label §9 uses must be a row of the §1.5 table. The ID
   column exists because `Offline / BLE` does not survive being made an enum case, and each
   SDK invented its own answer.

ALIASES is hand-maintained and that is this check's real limit: a new dedicated field
mirroring a registry key is invisible to check D until somebody adds the pair. There is no
mechanical signal for "these two names denote one quantity" -- the spec asserts it in prose
(`08-configuration.md` §1.6, `03-messages.md` §5.1's precedence rule, `05-state-machines.md`
§2's transition table) and nothing marks it up. Both pairs were found by reading.

BASELINE is the count of known-open findings. It is not an allowlist: every finding is
printed on every run. Lower it as they are closed; a run finding more than BASELINE fails,
and so does a run finding FEWER, so that an improvement cannot be pocketed silently. The one
open finding is check D's `retryInterval` pair, recorded in KNOWN-ISSUES.md -- a decision
about what values are legal on the wire, not a transcription error.

Usage
-----
    python3 tools/check-config-ranges.py

Exit
----
0 if the flagged count equals BASELINE, 1 otherwise.
"""
import glob
import os
import re
import sys

REGISTRY = 'spec/08-configuration.md'
BASELINE = 1
PROXIMITY = 120

# A §§2--6 row: | `Key` | type | `default` | access | mutability | range | description |
SECTION_ROW = re.compile(
    r'^\|\s*`([A-Za-z][A-Za-z0-9_]*)`\s*\|\s*(\w+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$')
# A §9 row: | n | `Key` | type | `default` | access | mutability | profile |
SUMMARY_ROW = re.compile(
    r'^\|\s*(\d+)\s*\|\s*`([A-Za-z][A-Za-z0-9_]*)`\s*\|\s*(\w+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|')

# A §1.5 profile row: | **Name** | `ProfileID` | keys... | Required |. Parsed only inside
# the §1.5 section: §1.2, §1.3 and §1.4 are also two-column tables and a looser pattern
# harvested 'Type', 'Symbol' and 'Behavior' from their headers.
PROFILE_SECTION = re.compile(r'^###\s+1\.5\b')
SECTION_END = re.compile(r'^(###\s|---\s*$|##\s)')
PROFILE_ROW = re.compile(r'^\|\s*\*{0,2}([A-Za-z /-]+?)\*{0,2}\s*\|\s*`?([A-Za-z]+|--)`?\s*\|')
EXPECTED_PROFILE_IDS = {'Core', 'Transaction', 'Security', 'OfflineBLE', 'DeviceManagement'}

NUMERIC = re.compile(r'^(\d+)--(\d+)$')
MAXCHARS = re.compile(r'^max \d+ chars$')
LITERALS = re.compile(r'^`"[^"]+"`(,\s*`"[^"]+"`)+$')
NAMED = ('IANA tz', 'valid SEC1 key', 'valid URL')

# Declared in §1.6. Recomputed here so the prose cannot rot.
EXPECTED_FORMS = {'numeric': 15, 'none': 8, 'maxchars': 1, 'literals': 2, 'named': 3}

# Registry key -> dedicated wire field, and the schema that bounds that field.
ALIASES = {
    'HeartbeatIntervalSeconds': ('heartbeatIntervalSec',
                                 'schemas/mqtt/boot-notification-response.schema.json'),
    'BootRetryInterval': ('retryInterval',
                          'schemas/mqtt/boot-notification-response.schema.json'),
}

SEARCH_GLOBS = ('spec/**/*.md', 'guides/*.md', 'conformance/**/*.md')
RANGE_IN_TEXT = re.compile(r'(\d+)\s*(?:--|–)\s*(\d+)')

# A row of the version history in 00-introduction.md: `| 0.16.0 | 2026-08-13 | ... |`.
# These record what a past release said, so a release that repairs or reports a range
# disagreement necessarily quotes both sides of it — indistinguishable, to a proximity
# check, from a document committing the disagreement. Skipping them keeps the check strict
# everywhere an obligation is actually stated. Found the first time this file ran against a
# release note describing its own findings.
HISTORY_ROW = re.compile(r'^\|\s*\d+\.\d+\.\d+\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|')


def classify(cell):
    if NUMERIC.match(cell):
        return 'numeric'
    if cell == '--':
        return 'none'
    if MAXCHARS.match(cell):
        return 'maxchars'
    if LITERALS.match(cell):
        return 'literals'
    if cell in NAMED:
        return 'named'
    return None


def load(root):
    path = os.path.join(root, REGISTRY)
    if not os.path.exists(path):
        sys.exit(f'{REGISTRY} not found -- the registry moved and this check would '
                 f'otherwise pass vacuously.')
    sections, summary = {}, {}
    for lineno, line in enumerate(open(path, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        m = SUMMARY_ROW.match(line)
        if m:
            summary[m.group(2)] = dict(
                line=lineno, type=m.group(3).strip(), default=m.group(4).strip(),
                access=m.group(5).strip(), mutability=m.group(6).strip().strip('*'),
                profile=m.group(7).strip())
            continue
        m = SECTION_ROW.match(line)
        if m:
            sections[m.group(1)] = dict(
                line=lineno, type=m.group(2).strip(), default=m.group(3).strip(),
                access=m.group(4).strip(), mutability=m.group(5).strip().strip('*'),
                range=m.group(6).strip())
    if not sections or not summary:
        sys.exit(f'{REGISTRY} yielded {len(sections)} registry rows and {len(summary)} '
                 f'summary rows -- a table format changed. Refusing to report success '
                 f'for zero work.')
    return sections, summary


def schema_bounds(root, path, field):
    import json
    full = os.path.join(root, path)
    if not os.path.exists(full):
        return None
    doc = json.load(open(full, encoding='utf-8'))
    prop = doc.get('properties', {}).get(field)
    if not isinstance(prop, dict):
        return None
    return prop.get('minimum'), prop.get('maximum')


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    sections, summary = load(root)
    findings = []

    # --- A. §9 against §§2--6 -------------------------------------------------
    only_reg = sorted(set(sections) - set(summary))
    only_sum = sorted(set(summary) - set(sections))
    for k in only_reg:
        findings.append(('A', REGISTRY, sections[k]['line'],
                         f'{k}: in §§2--6 but missing from the §9 summary'))
    for k in only_sum:
        findings.append(('A', REGISTRY, summary[k]['line'],
                         f'{k}: in the §9 summary but not in §§2--6'))
    shared = 0
    for k in sorted(set(sections) & set(summary)):
        for col in ('type', 'default', 'access', 'mutability'):
            shared += 1
            a, b = sections[k][col], summary[k][col]
            if a != b:
                findings.append(('A', REGISTRY, summary[k]['line'],
                                 f'{k}.{col}: §§2--6 say {a!r}, §9 says {b!r}'))

    # --- B. Range column form and the counts §1.6 states -----------------------
    forms = {}
    for k, row in sections.items():
        form = classify(row['range'])
        if form is None:
            findings.append(('B', REGISTRY, row['line'],
                             f'{k}: Range cell {row["range"]!r} matches none of the five '
                             f'forms §1.6 declares'))
            continue
        forms[form] = forms.get(form, 0) + 1
    for form, want in EXPECTED_FORMS.items():
        got = forms.get(form, 0)
        if got != want:
            findings.append(('B', REGISTRY, 0,
                             f'§1.6 states {want} key(s) of form {form!r}; the registry '
                             f'has {got}'))

    # --- C & D. Restatements --------------------------------------------------
    numeric = {k: NUMERIC.match(r['range']).groups()
               for k, r in sections.items() if NUMERIC.match(r['range'])}
    numeric = {k: (int(lo), int(hi)) for k, (lo, hi) in numeric.items()}

    names = {k: k for k in numeric}
    for key, (field, _) in ALIASES.items():
        if key in numeric:
            names[field] = key

    files = sorted({p for g in SEARCH_GLOBS for p in glob.glob(g, recursive=True)})
    restated, derived, seen = 0, 0, set()
    for path in files:
        for lineno, line in enumerate(open(path, encoding='utf-8').read().split('\n'), 1):
            if path == REGISTRY and line.lstrip().startswith('|'):
                continue  # the registry stating itself is not a restatement
            if HISTORY_ROW.match(line.lstrip()):
                continue  # a release note quoting a disagreement is not committing one
            for name, key in names.items():
                lo, hi = numeric[key]
                for nm in re.finditer(re.escape(name), line):
                    for rm in RANGE_IN_TEXT.finditer(line):
                        if abs(rm.start() - nm.start()) > PROXIMITY:
                            continue
                        got = (int(rm.group(1)), int(rm.group(2)))
                        tag = (path, lineno, key, got)
                        if tag in seen:
                            continue
                        seen.add(tag)
                        restated += 1
                        # A range derived from the registry by scaling BOTH endpoints by
                        # one factor is consistent with it, not a disagreement --
                        # connection-lost.md publishes the staleness window as
                        # 3.5 x heartbeat. Requiring the SAME factor on both ends is what
                        # keeps this from excusing a real drift: a restatement that moves
                        # one endpoint only has no single factor and is still reported.
                        if got != (lo, hi) and lo and hi:
                            if got[0] * hi == got[1] * lo:
                                derived += 1
                                continue
                            findings.append((
                                'C', path, lineno,
                                f'{name} (registry key {key}, range {lo}--{hi}) appears '
                                f'beside the range {got[0]}--{got[1]}, which disagrees. '
                                f'The pair may be restated or derived; the check reports '
                                f'proximity, and the reader decides which'))

    for key, (field, schema) in ALIASES.items():
        if key not in numeric:
            continue
        lo, hi = numeric[key]
        bounds = schema_bounds(root, schema, field)
        if bounds is None:
            findings.append(('D', schema, 0,
                             f'{field} is declared an alias of {key} but the schema has no '
                             f'such property -- the alias table is stale'))
            continue
        smin, smax = bounds
        if smin != lo or smax != hi:
            findings.append((
                'D', schema, 0,
                f'{field} carries {key}, whose registry range is {lo}--{hi}, but the '
                f'schema bounds it at minimum={smin}, maximum={smax}'))

    # --- E. Profile labels and the normative Profile ID -----------------------
    prof_rows, inside = {}, False
    for lineno, line in enumerate(open(os.path.join(root, REGISTRY),
                                      encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if PROFILE_SECTION.match(line):
            inside = True
            continue
        if inside and SECTION_END.match(line):
            break
        if not inside:
            continue
        m = PROFILE_ROW.match(line)
        if m and m.group(1).strip() not in ('Profile', '---------'):
            prof_rows[m.group(1).strip().strip('*')] = (m.group(2).strip(), lineno)
    if not prof_rows:
        sys.exit('§1.5 yielded zero profile rows -- the table format changed. '
                 'Refusing to report success for zero work.')
    ids = {pid for pid, _ in prof_rows.values() if pid != '--'}
    if ids != EXPECTED_PROFILE_IDS:
        findings.append(('E', REGISTRY, 0,
                         f'§1.5 Profile IDs are {sorted(ids)}; expected '
                         f'{sorted(EXPECTED_PROFILE_IDS)}'))
    for pid in sorted(ids):
        if not pid.isalnum():
            findings.append(('E', REGISTRY, 0,
                             f'Profile ID {pid!r} is not usable as a program identifier'))
    labels = {row['profile'] for row in summary.values()}
    unknown = sorted(labels - set(prof_rows))
    for lab in unknown:
        findings.append(('E', REGISTRY, 0,
                         f'§9 carries the profile label {lab!r}, which is not a row of '
                         f'the §1.5 profile table'))

    print(f'registry rows (§§2--6)        : {len(sections)}')
    print(f'summary rows (§9)             : {len(summary)}')
    print(f'shared cells compared         : {shared}')
    print(f'numeric-range keys            : {len(numeric)}')
    print(f'restated-range sites          : {restated}  ({derived} derived by a shared factor)')
    print(f'profile rows (§1.5)           : {len(prof_rows)}')
    print(f'wire-field aliases checked    : {len(ALIASES)}')
    print(f'findings                      : {len(findings)}  (baseline {BASELINE})')

    for check, path, lineno, msg in findings:
        where = f'{path}:{lineno}' if lineno else path
        print(f'\n  [{check}] {where}')
        print(f'     {msg}')

    if len(findings) > BASELINE:
        print(f'\n{len(findings) - BASELINE} finding(s) above baseline. Sections 2--6 are '
              f'the registry: correct the restatement, or replace it with a pointer.')
        return 1
    if len(findings) < BASELINE:
        print(f'\nBelow baseline ({len(findings)} < {BASELINE}). Lower BASELINE in this '
              f'file so the improvement cannot silently regress.')
        return 1
    print(f'\nAt baseline. The {BASELINE} open finding(s) are recorded in KNOWN-ISSUES.md; '
          f'each is a decision about legal wire values, not a transcription error.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
