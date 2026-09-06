#!/usr/bin/env python3
"""Derive the numbers and rosters the documents restate, and fail when a restatement drifts.

Why this exists
---------------
This repository has seven drift gates and, until this file, **none on the numbers its own
documents state about themselves**. The consequence was measured on 2026-09-06: `07-errors.md`
§1.1 — the *normative* chapter — said ``Total: 118 standard error codes`` while §3 of the same
chapter listed **119**, and both SDK enums held 119. The missing member was `5113
OUTCOME_INDETERMINATE`, added the previous day. Four more copies of `118` sat in `README.md` and
`guides/implementors-guide.md`. A firmware author sizing an error table from the chapter was
short exactly the code he needs to report an unmeasured outcome.

The rule this file enforces is the one the repository already lives by everywhere else:
**a number that is derived by a gate is correct; a number that is typed by hand is wrong.**
Correcting `118` to `119` would rot identically — that is what the previous cycle did to a
different number, and it is why this is a derivation and not an edit.

What is derived, and from what
------------------------------
1. **The error registry count**, per range and in total, from the rows of `07-errors.md` §3.
   §1.1's own restatement table and every live prose copy are checked against it.
2. **The state-machine roster**, from the `## N. <Name> State Machine` headings of
   `05-state-machines.md`. `README.md`'s chapter summary must name every one. §8 *Diagnostics
   Upload* sits after §7 *Cross-Machine Interactions*, out of sequence, and the README dropped
   it — while it is one of the six both SDKs actually gate.
3. **The version the release-status section speaks in**, from `00-introduction.md`'s
   ``**OSPP Version:**`` line. `README.md`'s badge tracked `0.33.0` while three sentences in the
   same file still said `0.8`.

Record documents are out of scope, structurally
-----------------------------------------------
`CHANGELOG.md`, `ROADMAP.md` and `KNOWN-ISSUES.md` state what *was* true — "102 error codes"
under ``## v0.1.0 (Delivered)`` is correct as history and would be destroyed by being made
current. This is the same reasoning `check-registry-self-consistency.py` applies when it strips
quoted spans before matching: a document must be able to record what it retracted. The exclusion
is by document ROLE, not by a list of forgiven lines, so a new stale copy in a live document is
caught rather than grandfathered.

Self-controls
-------------
A gate that finds nothing must not report success. Every claim asserts a non-zero denominator
and a plausible floor before it compares anything; a parser that silently stops matching exits
**2** (instrument broken) rather than 0. Exit 1 means drift was found.
"""

from __future__ import annotations

import re
import subprocess
import sys
import pathlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# A number inside an inline code span is a QUOTATION, not a claim. The version-history
# table in 00-introduction.md and every CHANGELOG entry must be able to write
# `Total: 118 standard error codes` to say what they retracted -- the gate that forbade
# that would forbid the record. Fenced blocks are deliberately NOT stripped: README.md's
# directory tree carries `Chapter 07: Error Codes (119 codes)` inside a fence and that is
# a live claim. Same principle as check-registry-self-consistency.py, which strips quoted
# spans so a registry cell can record what it withdrew.
_CODE_SPAN = re.compile(r"`[^`\n]*`")


def uses_only(text: str) -> str:
    """Blank out inline code spans, preserving offsets so line numbers stay true."""
    return _CODE_SPAN.sub(lambda m: " " * len(m.group(0)), text)

# Documents whose ROLE is to record the past. See the module docstring.
RECORD_DOCS = {"CHANGELOG.md", "ROADMAP.md", "KNOWN-ISSUES.md"}

# Floors that say "the parser still works". Not targets — sanity bounds. If the real
# artefact ever legitimately drops below one of these, that is a review, not a bump.
MIN_CODES = 100
MIN_MACHINES = 5
MIN_SITES = 1

failures: list[str] = []
broken: list[str] = []


def tracked_markdown() -> list[Path]:
    """Every markdown file the repository actually contains.

    Enumerated from `git ls-files` rather than a directory walk: `verification-report.md`
    is a generated artefact sitting in the tree and gitignored, and a walk reads it as
    corpus. A gate checks what the repository CONTAINS, and that is what git tracks.
    """
    out = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z", "*.md"],
        capture_output=True, text=True, check=True,
    ).stdout
    return sorted(ROOT / n for n in out.split("\0") if n)


def live_markdown() -> list[Path]:
    """Every markdown file that states the present tense."""
    return [p for p in tracked_markdown() if p.name not in RECORD_DOCS]


# ─────────────────────────────────────────────────────────────────────────────
# CLAIM 1 — the error registry count, per range and in total
# ─────────────────────────────────────────────────────────────────────────────

REGISTRY = ROOT / "spec" / "07-errors.md"
_SECTION = re.compile(r"^### 3\.\d+ .+ \((\d)xxx\)\s*$")
_CODE_ROW = re.compile(r"^\|\s*`?(\d{4})`?\s*\|")
_END_OF_REGISTRY = re.compile(r"^## 4\.")


def derive_registry() -> tuple[dict[str, int], int]:
    lines = REGISTRY.read_text(encoding="utf-8").split("\n")
    per_range: dict[str, set[str]] = {}
    current: str | None = None
    for line in lines:
        if _END_OF_REGISTRY.match(line):
            current = None
        m = _SECTION.match(line)
        if m:
            current = m.group(1)
            per_range.setdefault(current, set())
            continue
        if current:
            row = _CODE_ROW.match(line)
            if row and row.group(1)[0] == current:
                per_range[current].add(row.group(1))
    counts = {k: len(v) for k, v in per_range.items()}
    return counts, sum(counts.values())


# §1.1 restates the per-range counts in its own table.
_RANGE_ROW = re.compile(
    r"^\|\s*(\d)000[–-]\d999\s*\|[^|]*\|[^|]*\|\s*(\d+|—)\s*\|"
)

# Every shape a live document uses to restate the total.
_TOTAL_PATTERNS = [
    re.compile(r"(?P<n>\d{2,4})\s+standard\s+error\s+codes"),
    re.compile(r"(?P<n>\d{2,4})\s+error\s+codes"),
    re.compile(r"Error Codes\s*\((?P<n>\d{2,4})\s+codes\)"),
    re.compile(r"(?P<n>\d{2,4})\s+codes\s*\(\d+\s+categories\)"),
]


def check_registry_count() -> None:
    counts, total = derive_registry()
    if total < MIN_CODES or not counts:
        broken.append(
            f"registry parser derived {total} codes across {len(counts)} ranges "
            f"(floor {MIN_CODES}); the row or section pattern no longer matches"
        )
        return
    print(f"  derived : {total} codes — " + " · ".join(f"{k}xxx={counts[k]}" for k in sorted(counts)))

    # 1a — §1.1's own restatement table
    seen_rows = 0
    for n, line in enumerate(REGISTRY.read_text(encoding="utf-8").split("\n"), 1):
        m = _RANGE_ROW.match(line)
        if not m:
            continue
        rng, stated = m.group(1), m.group(2)
        if stated == "—":  # vendor range, deliberately uncounted
            continue
        seen_rows += 1
        if rng not in counts:
            failures.append(f"07-errors.md:{n}: §1.1 names range {rng}xxx, §3 has no such section")
        elif int(stated) != counts[rng]:
            failures.append(
                f"07-errors.md:{n}: §1.1 says {rng}xxx has {stated} codes; §3 lists {counts[rng]}"
            )
    if seen_rows < MIN_MACHINES:
        broken.append(f"§1.1 range table yielded {seen_rows} countable rows; pattern broken")

    # 1b — every live restatement of the total
    sites = 0
    for path in live_markdown():
        text = uses_only(path.read_text(encoding="utf-8"))
        for n, line in enumerate(text.split("\n"), 1):
            for pat in _TOTAL_PATTERNS:
                for m in pat.finditer(line):
                    sites += 1
                    if int(m.group("n")) != total:
                        failures.append(
                            f"{path.relative_to(ROOT)}:{n}: restates the registry as "
                            f"{m.group('n')} codes; derived total is {total}"
                        )
    if sites < MIN_SITES:
        broken.append(
            f"found {sites} restatements of the registry total; the prose patterns match nothing"
        )
    print(f"  checked : {seen_rows} range rows · {sites} prose restatements")


# ─────────────────────────────────────────────────────────────────────────────
# CLAIM 2 — the state-machine roster
# ─────────────────────────────────────────────────────────────────────────────

MACHINES_DOC = ROOT / "spec" / "05-state-machines.md"
_MACHINE_HEADING = re.compile(r"^## \d+\.\s+(.+?)\s+State Machine\s*$")
_CH05_ROW = re.compile(r"^\|\s*\[05\]\([^)]*05-state-machines\.md\)\s*\|([^|]*)\|([^|]*)\|")


def check_machine_roster() -> None:
    names = [
        m.group(1)
        for m in (_MACHINE_HEADING.match(l) for l in MACHINES_DOC.read_text(encoding="utf-8").split("\n"))
        if m
    ]
    if len(names) < MIN_MACHINES:
        broken.append(
            f"derived {len(names)} state machines from 05-state-machines.md (floor {MIN_MACHINES}); "
            "the heading pattern no longer matches"
        )
        return
    print(f"  derived : {len(names)} machines — {', '.join(names)}")

    rows = 0
    for path in live_markdown():
        for n, line in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
            m = _CH05_ROW.match(line)
            if not m:
                continue
            rows += 1
            # BOTH DIRECTIONS. A one-way check (does the summary name every machine?) goes
            # silently weaker when a heading is renamed: the machine leaves the derivation,
            # the summary still lists it, and the comparison passes on a shrunken set. That
            # is the failure this file exists to prevent, one level up. Compared as SETS, a
            # renamed heading is loud in the other direction — the summary names something
            # the chapter no longer defines.
            listed = [
                part.strip()
                for part in re.sub(r"\bFSMs?\b", "", m.group(2)).split(",")
                if part.strip()
            ]
            missing = [x for x in names if x not in listed]
            extra = [x for x in listed if x not in names]
            if missing:
                failures.append(
                    f"{path.relative_to(ROOT)}:{n}: chapter-05 summary omits "
                    + ", ".join(missing)
                    + f" — 05-state-machines.md defines {len(names)}"
                )
            if extra:
                failures.append(
                    f"{path.relative_to(ROOT)}:{n}: chapter-05 summary names "
                    + ", ".join(extra)
                    + " — 05-state-machines.md defines no such state machine"
                )
    if rows < MIN_SITES:
        broken.append("no chapter-05 summary row found; the row pattern matches nothing")
    print(f"  checked : {rows} chapter-05 summary row(s), both directions")


# ─────────────────────────────────────────────────────────────────────────────
# CLAIM 3 — the version a live document claims the release is at
# ─────────────────────────────────────────────────────────────────────────────
#
# Scoped by CLAIM PHRASE, not by document. The first cut of this check read only
# README.md's "## Release status" section and reported three sites. The drift was in
# FIFTEEN: spec/README.md, conformance/README.md, three TC-OFF conformance cases and
# KNOWN-ISSUES.md all state the same claim, and nine anchor links point into the heading
# that carries it. A section-scoped check would have passed on all of them.
#
# CHANGELOG.md is the only exclusion here, and for a different reason than the counts:
# each of its entries is a statement about the release it heads, so "cannot be claimed
# against 0.8" under [0.8.0] is correct and permanent.

INTRO = ROOT / "spec" / "00-introduction.md"
_VERSION = re.compile(r"\*\*OSPP Version:\*\*\s*([0-9]+\.[0-9]+\.[0-9]+)")

_VERSION_CLAIMS = [
    re.compile(r"Status in (?P<v>\d+\.\d+(?:\.\d+)?)"),
    re.compile(r"[Ee]xperimental in (?P<v>\d+\.\d+(?:\.\d+)?)", re.I),
    re.compile(r"claimed against\s+(?P<v>\d+\.\d+(?:\.\d+)?)"),
]


def check_release_version() -> None:
    m = _VERSION.search(INTRO.read_text(encoding="utf-8"))
    if not m:
        broken.append("could not derive the OSPP version from 00-introduction.md")
        return
    version = m.group(1)
    short = ".".join(version.split(".")[:2])
    print(f"  derived : version {version} (series {short})")

    sites = 0
    for path in tracked_markdown():
        if path.name == "CHANGELOG.md":
            continue
        text = uses_only(path.read_text(encoding="utf-8"))
        for pat in _VERSION_CLAIMS:
            for hit in pat.finditer(text):
                sites += 1
                if hit.group("v") in (version, short):
                    continue
                line_no = text.count("\n", 0, hit.start()) + 1
                failures.append(
                    f"{path.relative_to(ROOT)}:{line_no}: claims the release is "
                    f"{hit.group('v')} — {hit.group(0).strip()!r}; the spec is at {version}"
                )
    if sites < MIN_SITES:
        broken.append("no release-version claim found anywhere; the claim phrases match nothing")
    print(f"  checked : {sites} release-version claim(s), repo-wide")


# ─────────────────────────────────────────────────────────────────────────────
# CLAIM 4 — every anchor into a local heading resolves
# ─────────────────────────────────────────────────────────────────────────────
#
# `verify-protocol.sh`'s Cross-Reference Links category reads only `spec/`, and the CI
# link job runs lychee, which does not verify fragments. So an anchor into a heading in
# README.md, KNOWN-ISSUES.md or conformance/ is checked by nothing. Renaming ONE heading
# — `### BLE is experimental in 0.8` — broke nine links, and only the four under `spec/`
# were reported. That is the shape this claim closes: a heading is a URL, so a version
# number inside one rots in two places at once.

_MD_LINK = re.compile(r"\]\(\s*(?P<target>[^)\s]*?)#(?P<frag>[A-Za-z0-9][A-Za-z0-9_-]*)\s*\)")
_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")


def slug(title: str) -> str:
    """GitHub's heading slug: strip inline markup, lowercase, spaces to hyphens."""
    t = re.sub(r"`([^`]*)`", r"\1", title)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"\*", "", t)   # emphasis only; GitHub KEEPS underscores, and
                                # stripping them turned UPLOAD_FAILED into uploadfailed
    t = t.lower().strip()
    t = re.sub(r"[^a-z0-9 \-_]", "", t)
    return t.replace(" ", "-")


_anchor_cache: dict[pathlib.Path, set[str]] = {}


def anchors_of(path) -> set[str]:
    if path not in _anchor_cache:
        found: set[str] = set()
        try:
            for line in path.read_text(encoding="utf-8").split("\n"):
                h = _HEADING.match(line)
                if h:
                    found.add(slug(h.group(2)))
        except OSError:
            found = set()
        _anchor_cache[path] = found
    return _anchor_cache[path]


def check_anchors() -> None:
    links = 0
    for path in tracked_markdown():
        raw = path.read_text(encoding="utf-8")
        # Reads a USE, not a mention. CONTRIBUTING.md documents the link FORM as
        # `[§N](#section)` inside a code span; the content of every span is removed
        # (not unwrapped) so a wholly-enclosed link disappears while `[`x.md`](x.md#y)`
        # keeps its link. Same principle as check-registry-self-consistency.py.
        text = uses_only(raw)
        for hit in _MD_LINK.finditer(text):
            target, frag = hit.group("target"), hit.group("frag")
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            dest = path if target == "" else (path.parent / target).resolve()
            if dest.suffix != ".md" or not dest.exists():
                continue  # a non-markdown or missing target is the link checker's business
            links += 1
            if frag not in anchors_of(dest):
                line_no = text.count("\n", 0, hit.start()) + 1
                try:
                    shown = dest.relative_to(ROOT)
                except ValueError:
                    shown = dest
                failures.append(
                    f"{path.relative_to(ROOT)}:{line_no}: anchor #{frag} does not resolve "
                    f"to any heading in {shown}"
                )
    if links < MIN_SITES:
        broken.append("no local markdown anchors found; the link pattern matches nothing")
    print(f"  checked : {links} anchor(s) into local headings")


def main() -> int:
    print("registry count")
    check_registry_count()
    print("state-machine roster")
    check_machine_roster()
    print("release-version claims")
    check_release_version()
    print("anchors into local headings")
    check_anchors()

    print()
    if broken:
        print("INSTRUMENT BROKEN — a derivation produced nothing believable:")
        for b in broken:
            print(f"  ! {b}")
        return 2
    if failures:
        print(f"DRIFT — {len(failures)} restatement(s) disagree with what the artefacts say:")
        for f in failures:
            print(f"  ✗ {f}")
        return 1
    print("Every restated number and roster agrees with the artefact it describes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
