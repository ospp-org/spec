#!/usr/bin/env python3
"""Join the three statements of each action's MQTT Message Expiry, and fail when two disagree.

Why this exists
---------------
`spec/02-transport.md` §5.1 assigns an MQTT action to an expiry **category** and gives the
category one MQTT Expiry Interval; a per-action override table under it replaces that interval
for the actions it names. `spec/03-messages.md` restates the value in each per-message block
(`| **Message Expiry** | ... |`) and a third time in Appendix B. Nothing joined the three, and
both defects that followed were a number no gate knew belonged to a table in another chapter:

- `0.14.0` set out to repair MeterValues' expiry, and the edit landed on AuthorizeOfflinePass,
  the first of two blocks carrying the byte-identical row. It shipped the announced defect still
  open and a new one, beside a correct Appendix B edit that made it look finished.
- From `0.30.0` to `0.43.0` the Management commands row gave TriggerMessage and DataTransfer
  120 s while both of their blocks said 60 s. Decision Q7 settled both at 60 s in `0.44.0`.

This is the check KNOWN-ISSUES.md specified for that hole, in the shape of
`check-config-defaults.py`, which performs the same join for the Chapter 08 registry.

Three parsers, one join on the action name
------------------------------------------
- §5.1: the category table, its Actions cell expanded (`ConnectionLost (LWT)` is
  `ConnectionLost`), and the override table. An action's effective value is its override if it
  has one, else its category's. An override replaces the MQTT Expiry Interval only.
- Chapter 03: the `Message Expiry` row of every `### N.M Name` block -- its value, and the
  category it names, if it names one.
- Appendix B: one row per action. `Never Expires = Yes` is the value Never.

The tables are found by their header rows, not by section number, so renumbering a chapter does
not blind the check, and two tables under one header are refused as ambiguous. `Never` and
`Never expires` are a value like any other.

Each restatement is compared with §5.1, which is the source. An action §5.1 puts in no category
still has two statements -- its block and its Appendix B row -- and those are compared with each
other, so the actions outside §5.1 are joined too.

The three ratchet properties
----------------------------
1. **Refuse on a thin parse.** A floor is asserted on each side before anything is compared,
   and the counts are printed on every run. A selector that quietly stops matching is this
   repository's most-repeated failure, and a pass over four parsed rows has tested nothing.
2. **Zero matched pairs is a failure, never a pass.** The pass condition is "N pairs compared,
   N agreed" with N > 0 -- asserted for §5.1 against the blocks and for §5.1 against Appendix B
   separately, because a join key that stops matching on one side leaves the other side's pairs
   standing. A table row naming an action that no per-message block defines is refused for the
   same reason: it is a join key that matches nothing.
3. **Check the citation, not only the number.** A block that names a category must be in it,
   and a block that says no category covers it must be in none; the override table's Category
   column is held to the same rule. This is the half that catches the `0.14.0` regression:
   AuthorizeOfflinePass's new row read `120 seconds (Periodic reporting category)`, and
   AuthorizeOfflinePass is in no §5.1 category. Membership is its own verdict, reported apart
   from disagreement -- a citation can be false while the number beside it agrees.

Three states, not two
---------------------
A pair agrees or disagrees, and an action can also be **absent**: in no §5.1 category
(Heartbeat, StatusNotification), or with no Appendix B row. Absence is printed as coverage and
never fails -- a gate that failed on it would have been silenced the day it landed.

Precision
---------
At `b0704054` 2026-09-24 `0.43.0` it flags 4 pairs over 3 actions, 0 false citations.
TriggerMessage and DataTransfer are the Q7 defect. UpdateServiceCatalog is flagged because its
override was then a prose Note, which this check does not read and never will -- `0.44.0` moved
the Note into the override table, and an override stated anywhere else is flagged the same way.
With that one Note restated as a table row, the flags are exactly the Q7 pair.

Replayed on the releases the entry describes, with the §5.1 and Appendix B floors lowered to
what those trees carried (20 actions, 21 rows) in a throwaway copy: `v0.13.0` (`c543e49`
2026-08-12) flags MeterValues 30 s against 120 s twice and CertificateInstall 300 s against
60 s; `v0.14.0` (`3862abb` 2026-08-12) flags both halves of its regression -- MeterValues' block
still 30 s, and AuthorizeOfflinePass 120 s against its Appendix B 30 s with a false Periodic
reporting citation -- and CertificateInstall again; `v0.15.0` (`5814016` 2026-08-13) flags
none of them. Every one of the three also flags the UpdateServiceCatalog Note.

RED-tested on throwaway copies of `6152cfd` 2026-09-28 (Q7 on 0.43.0): a false category
citation on a block whose number agrees fires the citation verdict alone, and so do a category
name §5.1 does not define and an override row naming the wrong category; the `0.14.0`
AuthorizeOfflinePass row fires both verdicts; a `### N.M` heading stripped of its number, and a
renamed header cell in the category table, each drop a side below its floor and the check
refuses before comparing; Appendix B's action names lower-cased leave §5.1 against Appendix B
with zero pairs, which is refused although the other join's pairs all agree.

Exit status
-----------
0 when every pair agrees, every citation holds, every row was readable and both joins against
§5.1 matched at least one pair. 1 otherwise -- a thin parse included: refusing to compare is not
a pass.
"""
import os
import re
import sys

TRANSPORT = 'spec/02-transport.md'
MESSAGES = 'spec/03-messages.md'

# The header rows the three tables are found by, lower-cased.
CATEGORY_HEADER = ('category', 'actions', 'station max age', 'mqtt expiry interval')
OVERRIDE_HEADER = ('action', 'category', 'mqtt expiry interval')
APPENDIX_HEADER = ('action', 'response timeout', 'mqtt expiry interval', 'never expires')

# Floors: sanity bounds that say the parsers still work, not coverage targets -- an action
# missing from a table is coverage and is printed as such. Measured at b0704054 2026-09-24
# 0.43.0: 6 categories naming 22 actions, no override table, 27 of the 40 `### N.M` blocks
# carrying a Message Expiry row, 22 Appendix B rows. At 6152cfd 2026-09-28 (Q7 applied on
# 0.43.0): the same, with 3 overrides and 24 Appendix B rows. Each floor is the lower of the two,
# so the check still reads the tree it was built to catch. KNOWN-ISSUES.md gave §5.1 as "27
# actions across 6 categories"; 27 is the Chapter 03 count -- five MQTT actions are in no
# category. The override table has no floor: an override that stops parsing leaves its action on
# the category value, which then disagrees with that action's own block.
FLOOR_CATEGORIES = 6
FLOOR_CATEGORY_ACTIONS = 22
FLOOR_BLOCKS = 27
FLOOR_APPENDIX = 22

NEVER = 'Never'

BLOCK_HEADING = re.compile(r'^### (\d+)\.(\d+)\s+(.+?)\s*$')
HEADING = re.compile(r'^#{1,3} ')
EXPIRY_ROW = re.compile(r'^\|\s*\*\*Message Expiry\*\*\s*\|(.*)\|\s*$')
SEPARATOR = re.compile(r'^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*$')
LINK = re.compile(r'\[([^\]]*)\]\([^)]*\)')
SUFFIX = re.compile(r'\s*\([^)]*\)\s*$')
SECONDS = re.compile(r'^(\d+)\s*(?:s|secs?|seconds?)\b', re.I)
NEVER_WORD = re.compile(r'^never\b', re.I)
ACTION_NAME = re.compile(r'^[A-Z][A-Za-z]+$')
# "no 02-transport.md §5.1 category covers this action" -- a citation of membership in none.
NO_CATEGORY = re.compile(r'\bno\b[^;)]*?\bcategory\b', re.I)
# "Periodic reporting category" -- a citation by name, whether or not §5.1 defines the name.
NAMED_CATEGORY = re.compile(r'([A-Z][\w-]*(?:\s+[\w-]+){0,2})\s+category\b')


def clean(cell):
    """Markdown cell -> plain text: links to their text, bold and code markers dropped."""
    text = LINK.sub(r'\1', cell).replace('**', '').replace('`', '')
    return ' '.join(text.split())


def split_row(line):
    return [c.strip() for c in re.split(r'(?<!\\)\|', line.strip().strip('|'))]


def seconds(cell):
    """'30s', '30 seconds', 'Never', '**Never expires**' -> 30 / NEVER; anything else -> None."""
    text = clean(cell)
    m = SECONDS.match(text)
    if m:
        return int(m.group(1))
    return NEVER if NEVER_WORD.match(text) else None


def show(value):
    return value if value == NEVER else f'{value}s'


def singular(name):
    name = ' '.join(name.split())
    return name[:-1] if name.endswith('s') else name


def same_category(a, b):
    """Case- and plural-insensitive: a block citing "Critical event" cites "Critical events"."""
    return singular(a).lower() == singular(b).lower()


def read(path):
    if not os.path.exists(path):
        sys.exit(f'{path} not found -- the chapter moved, and this check would otherwise pass '
                 f'vacuously.')
    return open(path, encoding='utf-8').read().split('\n')


def table(lines, header, path):
    """The rows of the one table whose header row is `header`, as [(lineno, cells), ...].

    No table yields no rows, which the floors then refuse. Two tables are refused here: the
    check will not guess which of two statements is the statement.
    """
    found = []
    for i, line in enumerate(lines[:-1]):
        if not line.lstrip().startswith('|') or not SEPARATOR.match(lines[i + 1].strip()):
            continue
        if tuple(clean(c).lower() for c in split_row(line)) != header:
            continue
        rows, j = [], i + 2
        while j < len(lines) and lines[j].lstrip().startswith('|'):
            rows.append((j + 1, split_row(lines[j])))
            j += 1
        found.append(rows)
    if len(found) > 1:
        sys.exit(f'{path} has {len(found)} tables headed "| {" | ".join(header)} |" -- '
                 f'ambiguous. Refusing to guess which one is the statement.')
    return found[0] if found else []


def parse_transport(lines, bad):
    """§5.1 -> {category: value}, {action: (category, value, line)}, {action: override}."""
    categories, members, overrides = {}, {}, {}
    for lineno, cells in table(lines, CATEGORY_HEADER, TRANSPORT):
        if len(cells) != 4:
            bad(TRANSPORT, lineno, f'category row has {len(cells)} cells, not 4')
            continue
        category, value = clean(cells[0]), seconds(cells[3])
        if value is None:
            bad(TRANSPORT, lineno, f'{category}: the MQTT Expiry Interval is not a value')
            continue
        categories[category] = value
        for raw in cells[1].split(','):
            action = SUFFIX.sub('', clean(raw))
            if not ACTION_NAME.match(action):
                bad(TRANSPORT, lineno, f'{category}: "{action}" is not an action name')
            elif action in members:
                bad(TRANSPORT, lineno, f'{action} is in {members[action][0]} and in {category}')
            else:
                members[action] = (category, value, lineno)
    for lineno, cells in table(lines, OVERRIDE_HEADER, TRANSPORT):
        action = clean(cells[0])
        value = seconds(cells[2]) if len(cells) == 3 else None
        if value is None or not ACTION_NAME.match(action):
            bad(TRANSPORT, lineno, 'override row does not read as | Action | Category | value |')
        elif action in overrides:
            bad(TRANSPORT, lineno, f'{action} is overridden twice')
        else:
            overrides[action] = (clean(cells[1]), value, lineno)
    return categories, members, overrides


def parse_blocks(lines, bad):
    """Chapter 03 -> {action: (Message Expiry cell, line, section)}, and the ### N.M count."""
    blocks, headings, current = {}, 0, None
    for lineno, line in enumerate(lines, 1):
        m = BLOCK_HEADING.match(line)
        if m:
            headings += 1
            current = (SUFFIX.sub('', m.group(3)), f'{m.group(1)}.{m.group(2)}')
            continue
        if HEADING.match(line):
            current = None
            continue
        row = EXPIRY_ROW.match(line) if current else None
        if not row:
            continue
        action, section = current
        if action in blocks:
            bad(MESSAGES, lineno, f'{action} has a second Message Expiry row (first at line '
                                  f'{blocks[action][1]})')
        else:
            blocks[action] = (row.group(1).strip(), lineno, section)
    return blocks, headings


def parse_appendix(lines, bad):
    """Appendix B -> {action: (value, line)}."""
    rows = {}
    for lineno, cells in table(lines, APPENDIX_HEADER, MESSAGES):
        if len(cells) != 4:
            bad(MESSAGES, lineno, f'Appendix B row has {len(cells)} cells, not 4')
            continue
        action, interval, never = clean(cells[0]), clean(cells[2]), clean(cells[3]).lower()
        if never == 'yes':
            value = NEVER if interval in ('—', '-', '') else None
        else:
            value = seconds(interval) if never == 'no' else None
        if value is None:
            bad(MESSAGES, lineno, f'{action}: MQTT Expiry Interval "{interval}" and Never Expires '
                                  f'"{never}" do not read as one value')
        elif action in rows:
            bad(MESSAGES, lineno, f'{action} has a second Appendix B row')
        else:
            rows[action] = (value, lineno)
    return rows


def citations(text, categories):
    """The categories a Message Expiry cell names: (named, undefined names, says-none)."""
    says_none = bool(NO_CATEGORY.search(text))
    text = NO_CATEGORY.sub(' ', text)
    named = [c for c in categories
             if re.search(r'\b' + re.escape(singular(c)) + r's?\b', text, re.I)]
    undefined = [m.group(1) for m in NAMED_CATEGORY.finditer(text)
                 if not any(same_category(m.group(1), c) for c in categories)]
    return named, undefined, says_none


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    text = {TRANSPORT: read(TRANSPORT), MESSAGES: read(MESSAGES)}
    findings = []   # (kind, path, line, why)

    def finding(kind):
        return lambda path, lineno, why: findings.append((kind, path, lineno, why))

    unreadable = finding('UNREADABLE')
    categories, members, overrides = parse_transport(text[TRANSPORT], unreadable)
    blocks, headings = parse_blocks(text[MESSAGES], unreadable)
    appendix = parse_appendix(text[MESSAGES], unreadable)

    print(f'02-transport.md §5.1 categories   : {len(categories)}, naming {len(members)} actions'
          f'  (floors {FLOOR_CATEGORIES}, {FLOOR_CATEGORY_ACTIONS})')
    print(f'02-transport.md §5.1 overrides    : {len(overrides)}')
    print(f'03-messages.md per-message blocks : {len(blocks)} carry a Message Expiry row, of '
          f'{headings} headed ### N.M  (floor {FLOOR_BLOCKS})')
    print(f'03-messages.md Appendix B         : {len(appendix)} rows  (floor {FLOOR_APPENDIX})')

    thin = [f'{side}: {got} < {floor}' for side, got, floor in (
        ('§5.1 categories', len(categories), FLOOR_CATEGORIES),
        ('§5.1 category actions', len(members), FLOOR_CATEGORY_ACTIONS),
        ('per-message blocks', len(blocks), FLOOR_BLOCKS),
        ('Appendix B rows', len(appendix), FLOOR_APPENDIX)) if got < floor]
    if thin:
        sys.exit('\nREFUSED -- thin parse, so nothing was compared: ' + '; '.join(thin) + '. A '
                 'heading or table header moved and a parser stopped matching; a comparison over '
                 'what is left would report a pass on rows that were never read.')

    # -- citations: the override table's Category column, then each block's Message Expiry row
    false_citation = finding('FALSE CITATION')
    for action, (cited, _, lineno) in sorted(overrides.items()):
        home = members.get(action, (None,))[0]
        if not any(same_category(cited, c) for c in categories):
            false_citation(TRANSPORT, lineno, f'the override table puts {action} in "{cited}", '
                                              f'which §5.1 does not define')
        elif not home or not same_category(cited, home):
            false_citation(TRANSPORT, lineno, f'the override table puts {action} in {cited}; '
                                              f'§5.1 puts it in {home or "no category"}')
    for action, (cell, lineno, section) in sorted(blocks.items()):
        named, undefined, says_none = citations(clean(cell), categories)
        home = members.get(action, (None,))[0]
        for name in undefined:
            false_citation(MESSAGES, lineno, f'the §{section} block names "{name}", a category '
                                             f'§5.1 does not define')
        for name in (c for c in named if c != home):
            false_citation(MESSAGES, lineno, f'the §{section} block names {name}; §5.1 puts '
                                             f'{action} in {home or "no category"}')
        if says_none and home:
            false_citation(MESSAGES, lineno, f'the §{section} block says no §5.1 category covers '
                                             f'{action}; §5.1 puts it in {home}')

    # -- a table naming an action that no per-message block defines is a join key matching nothing
    unmatched = finding('UNMATCHED')
    for where, path, names in (('§5.1', TRANSPORT, members),
                               ('the §5.1 override table', TRANSPORT, overrides),
                               ('Appendix B', MESSAGES, appendix)):
        for action in sorted(set(names) - set(blocks)):
            unmatched(path, names[action][-1], f'{where} names {action}, and no ### N.M block '
                                               f'in {MESSAGES} defines it')

    # -- the join: each restatement against §5.1; block against Appendix B where §5.1 is silent
    pairs = {'§5.1 vs per-message block': [0, 0], '§5.1 vs Appendix B': [0, 0],
             'per-message block vs Appendix B': [0, 0]}
    no_category, no_appendix = [], []
    disagree = finding('DISAGREE')

    def compare(kind, want, said_by, got, lineno, action, what):
        pairs[kind][0] += 1
        if want == got:
            pairs[kind][1] += 1
        else:
            disagree(MESSAGES, lineno, f'{action}: {said_by} says {show(want)}, {what} says '
                                       f'{show(got)}')

    for action, (cell, lineno, section) in sorted(blocks.items()):
        value = seconds(cell)
        if value is None:
            unreadable(MESSAGES, lineno, f'{action}: the Message Expiry value does not read as '
                                         f'seconds or Never')
            continue
        row = appendix.get(action)
        if row is None:
            no_appendix.append(action)
        if action in overrides:
            _, source, at = overrides[action]
            said_by = f'the §5.1 override ({TRANSPORT}:{at})'
        elif action in members:
            category, source, at = members[action]
            said_by = f'§5.1 {category} ({TRANSPORT}:{at})'
        else:
            no_category.append(action)
            if row is not None:
                compare('per-message block vs Appendix B', value,
                        f'the §{section} block ({MESSAGES}:{lineno})', row[0], row[1], action,
                        'Appendix B')
            continue
        compare('§5.1 vs per-message block', source, said_by, value, lineno, action,
                f'the §{section} block')
        if row is not None:
            compare('§5.1 vs Appendix B', source, said_by, row[0], row[1], action, 'Appendix B')

    compared = sum(n for n, _ in pairs.values())
    agreed = sum(a for _, a in pairs.values())

    def count(*kinds):
        return sum(1 for f in findings if f[0] in kinds)

    print(f'\npairs compared                    : {compared}')
    for kind, (n, a) in pairs.items():
        print(f'  {kind:<32}: {n}, {a} agreed')
    print(f'disagreeing                       : {count("DISAGREE")}')
    print(f'false citations                   : {count("FALSE CITATION")}')
    print(f'unreadable or unmatched rows      : {count("UNREADABLE", "UNMATCHED")}')

    for kind, path, lineno, why in sorted(findings, key=lambda f: (f[1], f[2])):
        print(f'\n  {path}:{lineno}  {kind}')
        print(f'     {why}')
        print(f'     {text[path][lineno - 1].strip()[:120]}')

    print('\ncoverage -- absent, reported, never a failure:')
    for label, actions in ((f'in no §5.1 category ({len(no_category)})', no_category),
                           (f'no Appendix B row ({len(no_appendix)})', no_appendix)):
        print(f'  {label:<32}: {", ".join(actions) or "-"}')

    print(f'\n{compared} pairs compared, {agreed} agreed.')
    empty = [k for k in ('§5.1 vs per-message block', '§5.1 vs Appendix B') if not pairs[k][0]]
    if empty:
        print(f'\nZero pairs on {" and ".join(empty)}: the join matched nothing there, so a parser '
              f'broke -- the specification did not agree. Refusing to report a pass.')
        return 1
    if findings:
        print(f'\n{TRANSPORT} §5.1 is the source. Correct the restatement; if the restatement is '
              f'the intended value, give the action a row in the §5.1 override table. A block '
              f'naming a category must be in it.')
        return 1
    print('Every restated Message Expiry agrees with §5.1, and every category a block names '
          'contains it.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
