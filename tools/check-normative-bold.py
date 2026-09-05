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

    (this HEAD) 2026-09-05  (unreleased)  434 unbolded, 1252 bolded spans — the two unbreakable
                                   rules. Unbolded is UNCHANGED at 434 across six edited documents
                                   and roughly 90 added lines of normative prose; bolded spans rise
                                   by FOURTEEN, which is the whole of the change. Both numbers were
                                   RE-DERIVED on this tree, not incremented — the companion figure
                                   has been quoted wrong five times and is measured every release
                                   for that reason. BASELINE unchanged at 434.
                                   **One nested-bold defect was written and caught before commit**,
                                   the same failure the row below records: `**... either way **MUST**
                                   be reported.**` put the keyword OUTSIDE a span because `**`
                                   pairing is positional. It was found by a scan for keyword spans
                                   preceded by an odd number of `**` on the line — which is the
                                   cheap general test, and is worth keeping: the instrument reports
                                   the keyword as unbolded and the author reads the source as bold.
    aff5d86  2026-09-04  v0.31.0   434 unbolded, 1238 bolded spans — the seven schema-byte
                                   gaps adjudicated. Unbolded is UNCHANGED, and that is a MEASURED
                                   result rather than an untouched one: the finding set was diffed
                                   entry by entry against a `git archive` of f1edaa6 and is
                                   IDENTICAL once line numbers are stripped — 434 entries both
                                   sides, ZERO arrived, ZERO left — across a release that edited
                                   three schemas and eleven documents. BASELINE unchanged at 434.
                                   One entry did arrive mid-cycle and was repaired rather than
                                   absorbed: `**These causes ... servers **MUST** carry ...**`
                                   nested one bold span inside another, so the `**` pairing put the
                                   keyword OUTSIDE a span. The instrument was right and the prose
                                   was wrong; nesting bold is the one way to write `**MUST**` and
                                   still be counted unbolded.
    f1edaa6  2026-09-04  v0.30.0   434 unbolded, 1225 bolded spans — the integrator's
                                   blocking set. BOTH numbers RE-DERIVED on this tree; neither is
                                   incremented from the row below. Unbolded falls by FOUR and the
                                   finding set was diffed entry by entry against a `git archive` of
                                   472f843: exactly four entries LEFT — three `mqttConfig` fallback
                                   bullets in 04-flows.md (one of which carried two keywords) and
                                   the duplicate-ReserveBay bullet in the transaction README — and
                                   **NONE arrived**, across roughly twenty-five edited files. That
                                   zero is the measurement worth keeping: every normative keyword
                                   this cycle added is bolded. BASELINE lowered 438 -> 434.
    472f843  2026-09-04  v0.29.0   438 unbolded, 1189 bolded spans — STAMPED RETROSPECTIVELY at
                                   0.30.0. The row below stood as "(this HEAD) ... (unreleased)"
                                   after v0.29.0 was cut, so it carried neither a sha nor a version,
                                   and its companion was measured on a421d6f0 rather than on the
                                   commit that was actually tagged: the release commit itself added
                                   six bolded spans, so 1183 was SIX LOW against v0.29.0. That is
                                   the FIFTH time this companion has been wrong, and the second time
                                   the cause was an unstamped row rather than a bad reading — the
                                   same omission this header already records against the v0.25.0 and
                                   v0.24.1 rows. The gated number was right: 438 is identical on
                                   the pre-tag tree and on 472f843. A row that is never stamped does
                                   not merely lack a label; it goes on describing a tree nobody
                                   tagged. Measured for the record while stamping this: a421d6f
                                   (v0.28.0) reads **439 unbolded, 1183 bolded** — so the row below
                                   is the 0.29.0 cycle's pre-tag HEAD, where unbolded had already
                                   fallen to 438 while the companion still matched v0.28.0.
    (0.29.0 pre-tag) 2026-09-03    438 unbolded, 1183 bolded spans — the spec-cascade
                                   cycle. BOTH numbers RE-DERIVED by running the instrument on this
                                   tree, neither incremented from the line below. Unbolded falls by
                                   exactly one and the finding set was diffed entry by entry against
                                   a clean a421d6f0: one entry LEFT (02-transport.md's §10.1 row,
                                   `Receivers MUST ignore unknown fields`, deleted with the row) and
                                   NONE arrived. The replacement text quotes that old row, and the
                                   quotation is in BACKTICKS rather than bolded — bolding a reference
                                   to an obligation dresses it as one, which is the same call the
                                   v0.27.0 line below records for a `MUST` used as a noun. BASELINE
                                   lowered 439 -> 438 so the improvement cannot silently regress.
                                   The companion re-reads 1183 on a clean a421d6f0 as well, so the
                                   +1 over v0.27.0's 1182 is v0.28.0's single new bolded MUST and
                                   nothing this cycle added; the fifth chance to get this companion
                                   wrong was not taken.
    64bc8fe  2026-08-30  v0.27.0   439 unbolded, 1182 bolded spans — the revocation-decision
                                   cycle. Unbolded is UNCHANGED, and measured so: the finding set
                                   was diffed entry by entry against a run on a clean 8ce4ee7 and is
                                   IDENTICAL once line numbers are stripped. One entry appeared
                                   mid-cycle — a bare `MUST` used as a noun in 04-flows.md ("the
                                   chain MUST was the nearest thing to cite") — and was REWORDED
                                   rather than bolded, because bolding a reference to an obligation
                                   dresses it as one. +21 bolded spans, all of them new text.
                                   INSTRUMENT CORRECTED with this release, and the correction is
                                   why the companion below moved without any document changing:
                                   `bolded` paired `**` over the RAW file while scan() paired over
                                   the masked copy, so the phase-inversion the note in scan()
                                   records as fixed was still live in the number printed beside it.
                                   Four literal `**` inside backticks exist in spec/ — `schemas/**`
                                   and an escaped table row in 00-introduction.md, `sess_a1b2****`
                                   and `use****@example.com` in 06-security.md's redaction rules —
                                   and they cost the companion 8. The gated number was never
                                   affected: 439 is identical under both instruments on both trees.
                                   That is the FOURTH time this companion has been wrong, and the
                                   third time it was this companion specifically. The first three
                                   were transcription; this one was the instrument.
    8ce4ee7  2026-08-28  v0.26.0   439 unbolded, 1161 bolded spans — the station-refusal
                                   adjudication cycle. Unbolded is UNCHANGED, and that is a
                                   measured result rather than an untouched one: the finding set
                                   was diffed entry by entry against a `git archive` of 573bf6b
                                   and is identical once line numbers are stripped, so every
                                   document this release edits added no unbolded keyword and
                                   removed none.
                                   COMPANION CORRECTED 2026-08-30. This row read "1156 ... +17"
                                   until then, which is what the instrument SHIPPED at this commit
                                   prints on this commit's own tree — a faithful reading of a
                                   broken instrument. Re-measured on a `git archive` of 8ce4ee7
                                   with the corrected instrument: 1161. The rows below are left at
                                   their shipped readings and are NOT re-derived here; each is a
                                   record of what its release measured, and re-deriving the whole
                                   column would need a run per commit and is a separate act. Read
                                   any delta across this line as instrument-crossing.
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
    6ec660e  2026-08-18  v0.23.0   450 unbolded, 1088 bolded spans — the diagnostics
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

BASELINE = 434

KEYWORD = re.compile(r'\b(MUST NOT|MUST|SHALL NOT|SHALL)\b')
FENCE = re.compile(r'```.*?```', re.S)
TICK = re.compile(r'`[^`\n]*`')
BOLD = re.compile(r'\*\*(.+?)\*\*', re.S)
LEVEL_CELL = re.compile(r'\|\s*(MUST NOT|MUST|SHALL NOT|SHALL)\s*\|')
# section 3.1 enumerates the keywords; that enumeration is not a set of obligations
INTRO_ENUMERATION = ('spec/00-introduction.md', 120)


def mask(text, spans_code, spans_tick):
    """`text` with fenced and backticked spans blanked to spaces, offsets preserved.

    Both the finding scan and the bolded-span companion pair `**` over THIS, never over the
    raw text. See the note in scan().
    """
    out = list(text)
    for a, b in spans_code + spans_tick:
        for i in range(a, b):
            out[i] = ' '
    return ''.join(out)


def spans(text):
    return ([(m.start(), m.end()) for m in FENCE.finditer(text)],
            [(m.start(), m.end()) for m in TICK.finditer(text)])


def scan(path):
    text = open(path, encoding='utf-8').read()
    spans_code, spans_tick = spans(text)
    # Pair ** over a copy with code spans blanked, NOT over the raw text. A `**` inside
    # backticks is a glob, not a bold marker -- `schemas/**` is the live example -- and BOLD
    # is a sequential non-greedy pairing, so a single literal marker inverts the phase of every
    # span after it for the rest of the file. That is what it did: `schemas/**` entered
    # 00-introduction.md's 0.22.0 history row, and from that character to the end of the file
    # every bolded keyword was read as unbolded. The count was wrong in the safe direction --
    # too high -- which is why a ratchet that only refuses increases never reported it.
    # Blanking preserves offsets, so every span index below still refers to the real text.
    spans_bold = [(m.start(1), m.end(1))
                  for m in BOLD.finditer(mask(text, spans_code, spans_tick))]
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


def check_measurement_shas():
    """Verify each stamped measurement point against the tag it names.

    A measurement row records a number, a date, a version and the commit it was taken on. The
    first three are checkable by a reader; the sha was checkable by nobody, and so it was wrong.
    Derived at 0.32.0 rather than read: of ten stamped rows, TWO named the wrong commit —
    `v0.27.0` carried `v0.26.0`'s sha and `v0.23.0` carried a sha belonging to no tag — and a
    third was about to be written the same way, by copying the row below. All three came from the
    same motion: stamping a row by looking at its neighbour.

    That is the shape this whole file exists to refuse — a claim nothing can contradict. The rows
    say the numbers are re-derived and never inherited; the shas were inherited, every time, and
    the prose above them could not have revealed it. Now they are derived too.

    Silent when git or the tags are unavailable (a shallow clone, an export), because absence of
    a tag is not evidence of a wrong sha. It fails only on a sha that a resolvable tag refutes.
    """
    import subprocess
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rows = re.findall(r'^\s+([0-9a-f]{7})\s+\d{4}-\d\d-\d\d\s+(v[0-9][0-9.]*)\s',
                      open(__file__, encoding='utf-8').read(), re.M)
    bad, checked = [], 0
    for sha, tag in rows:
        try:
            r = subprocess.run(['git', '-C', root, 'rev-parse', '--short', tag + '^{commit}'],
                               capture_output=True, text=True, timeout=20)
        except Exception:
            return 0
        real = r.stdout.strip()
        if r.returncode != 0 or not real:
            continue
        checked += 1
        if real != sha:
            bad.append((tag, sha, real))
    if not checked:
        return 0
    print(f'measurement points with a resolvable tag : {checked} of {len(rows)} stamped rows')
    for tag, sha, real in bad:
        print(f'  WRONG SHA  {tag}: this file says {sha}, the tag is {real}')
    if bad:
        print(f'\n{len(bad)} measurement point(s) name a commit that is not the tag. Correct the '
              f'row: a measurement is only as good as the tree it was taken on.')
        return 1
    return 0


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
    # The companion pairs over the SAME masked text as scan(). It did not, until 0.27.0:
    # it read the raw file, so every literal `**` inside backticks inverted the pairing phase
    # for the rest of that file -- the exact defect the note in scan() records as fixed, still
    # live in the number beside it. Four such literals exist in spec/ (`schemas/**` and an
    # escaped table row in 00-introduction.md, `sess_a1b2****` and `use****@example.com` in
    # 06-security.md's redaction rules), and they cost the companion 8. Nothing gates this
    # number, which is why it survived being wrong through four releases; it is quoted in
    # tools/README.md and in the measurement points above, and a delta computed from a wrong
    # value inherits the error -- which has now happened four times.
    bolded = 0
    for p in files:
        text = open(p, encoding='utf-8').read()
        for m in BOLD.finditer(mask(text, *spans(text))):
            if KEYWORD.search(m.group(1)):
                bolded += 1
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
    print()
    return check_measurement_shas()


if __name__ == '__main__':
    sys.exit(main())
