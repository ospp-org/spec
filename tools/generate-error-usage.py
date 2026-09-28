#!/usr/bin/env python3
"""Derive `07-errors.md` §4.1--4.3 from the per-message and profile error tables; --check §4 against them.

Why this exists
---------------
§4 of `spec/07-errors.md` (*Error Code Usage per Message*) states which codes can appear in the
RESPONSE or rejection of each MQTT action and BLE message. It is typed by hand, and it restates
two surfaces that are also typed by hand: the error table under each message's `### N.M <Name>`
in `spec/03-messages.md`, and the error table of each profile document under `spec/profiles/`.
Nothing compared the three, so they drifted independently, and §4 — the only one not written
beside the message it describes — was the likeliest to be stale. That matters beyond tidiness:
§1.4's every-path rule cites §4 as its authority for *where a code is reachable*, and a rule whose
oracle drifts cannot be checked mechanically. ROADMAP.md records the rebuild under *Unscheduled*;
this is its first half — the derivation and the gate. It edits nothing.

Run with no arguments it prints the derived tables. `--check` compares them with §4.

What is derived, and from what
------------------------------
**Rows** come from `03-messages.md`'s Quick Reference, not from §4, so a row §4 lacks is visible.
An MQTT action whose Direction reaches the server belongs in §4.1, one that reaches the station in
§4.2 (DataTransfer is `Bidirectional` and belongs in both); every BLE message whose name ends in
`Response` belongs in §4.3.

**Sources**, per row:

  03       the table(s) with an `Error Code` column inside the message's `### N.M <Name>`
           section of 03-messages.md -- for an MQTT action, its `#### Error Responses` table --
           plus a blockquote in that error section naming a backticked code range (*"codes from
           the `5000–5009` range MAY also apply"*), which adds the range.
  profile  the profile document whose H1 is the action's name: the tables with an `Error Code`
           or `Code` column in its `## N. Error ...` section.

An error section with no such table DECLARES NONE: it is a surface, and it carries nothing. A
message with neither has no surface there at all. The difference is load-bearing — 03 §5.1 saying
*"There are none"* for Heartbeat is a statement that can disagree with something.

**Normalisation.** Ranges expand inclusive. Bold (*"most common"*) is editorial and cannot be
derived, so sets are compared and typography never is. A prose cell `*(...)*` — *EVENT — no
RESPONSE*, *implicit only* — is the empty set. For every §4.2 row, and for any row whose §4 cell
says *implicit only*, the codes of §4.2's *Implicit error codes* note are removed from the sources
first: the note says they apply to every Server→Station REQUEST and are not repeated.

**BLE** has no per-message document, so `BLE_SOURCES` names the sections. Both AuthResponse tables
— 03 §7.7 and `ble-handshake.md` §7 — list rejection reasons without saying which request the
AuthResponse answers. They are assigned to the `(→ OfflineAuthRequest)` row: every code they list
is an OfflinePass check or `2013`, and assigning them to the ServerSignedAuth row as well would
charge it with eight OfflinePass codes no ServerSignedAuth can fail. That row's one table is
`ble-handshake.md` §4.2.2's check list.

What is NOT derived
-------------------
**§4.4, REST.** No per-endpoint source exists outside §4.4. There is no OpenAPI description, and
the nearest thing — `04-flows.md`'s per-flow *Error Paths* tables — maps one-to-one onto an
endpoint only for provisioning, and in the session flows mixes HTTP labels that are not registry
codes (`409 BAY_BUSY`, `504 ACK_TIMEOUT`) with MQTT ones. §4.4 itself defines its session rows as
inherited from the MQTT StartService and StopService rows plus server-originated codes that have
no other home. It cannot be generated from anything, and it is out of scope here.

**Prose.** A MUST in running text that names a code is not a table and is not read. Where one
bears on a divergence it is named in that entry's reason in BASELINE.

**Other restatements.** `03-messages.md` Appendix C (*Used By*) is a code→message index of the same
facts, and each profile's *Related Schemas* section ends with an *Error codes* list. Neither is a
source and neither is compared.

The divergence set, and why this is a ratchet
---------------------------------------------
A DIVERGENT PAIR is a (row, code) carried by some but not all of the surfaces that exist for its
row. A row whose sources are all absent derives the empty set, so every §4 code on it diverges.
Each pair is recorded in BASELINE with the surfaces that DO carry it.

Measured at `b0704054` (0.43.0): 31 §4 rows compared; **63 pairs on 14 rows**, and one missing row
(`SessionEnded`, an EVENT with no §4.1 row while every other EVENT has one). By class:

  - 22 are in §4 and in no source table (SignCertificate, CertificateInstall, and three §4.3 rows);
  - 9 are in a source and not in §4 (the Heartbeat, DataTransfer and TriggerMessage profile
    tables, StartService's `5113`, ServerSignedAuth's `2018`);
  - 40 are 03 and the profile disagreeing with each other (overlapping the 9 above on 8 pairs).

None was made to disappear by editing `spec/`. Changing a §4 row or a profile table is a normative
change and needs the product owner's decision, and five decisions are open:

  D1  What a profile error table enumerates. The *Condition | Error Code | Behaviour* tables of
      `heartbeat.md` §8, `data-transfer.md` §6 and `trigger-message.md` §6, and `start-service.md`
      §7's `5113`, list conditions that are never a response value — `1010` is the waiting side's
      own timeout, `5106` a clock check, `5113` reported on the bay. §4.1's Heartbeat note already
      reads `heartbeat.md` §8 as a table of conditions. Deriving §4 needs the profiles to separate
      the two, or a filter rule — and a filter is an editorial judgement a generator should not
      embed. Eight pairs are this class.
  D2  Direction of authority. ROADMAP.md makes the tables the source and §4 the output;
      `start-service.md` §8 says §4.2's row is authoritative and its own §7 *"a subset and not a
      second definition"* — a claim `5113` makes false. They point opposite ways.
  D3  03 against the profile. They disagree on 40 pairs, with no rule for which wins. The derived
      set is their union.
  D4  BLE. No per-response error tables; StartServiceResponse's one table has 3 codes against §4's
      18; StopServiceResponse has no source, and its schema no error member (KNOWN-ISSUES B-3).
  D5  `SessionEnded`: add the `(EVENT — no RESPONSE)` row, or say why it is exempt.

`--check` fails when a divergence appears that BASELINE does not list, **and** when a BASELINE
entry no longer occurs — a baseline that only refuses additions goes stale silently the moment
something is fixed, and then excuses the next drift in the same place. When a pair is closed,
delete its entry in the same change. Every pair is printed on every `--check` run.

Self-controls
-------------
A comparison of nothing is not a pass. Every parse asserts a floor (FLOORS, each the value the
introducing run measured); a section this file reads that has gone, a code table that yields no
code, or a floor not met exits **2** (instrument broken), never 0. Counting source tables is what
makes a renamed heading loud: losing one source rarely changes a divergence, because the other
source usually carries the same codes, so the comparison alone would pass on a thinner parse.

RED-tested at introduction, each in a throwaway copy of the tree: one code added to one §4 row
and one code added to one 03 per-message `#### Error Responses` table each exit 1 naming the pair;
one `### N.M` message heading renamed in 03-messages.md, one profile's `## N. Error Codes` heading
renamed, and the §4 heading renamed each exit 2 naming the floor they broke; the unmodified copy
exits 0. Renaming only an `#### Error Responses` heading changes nothing this file reads — a source
is the `Error Code` table inside the message's `### N.M` section, whatever the sub-heading says —
and exits 0, correctly.

Exit status
-----------
0  derived tables printed; with --check, the divergence set equals BASELINE
1  --check only: a divergence not in BASELINE, a BASELINE entry that no longer occurs, or a code
   that the §3 registry does not define
2  instrument broken
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ERRORS = ROOT / "spec" / "07-errors.md"
MESSAGES = ROOT / "spec" / "03-messages.md"
PROFILES = ROOT / "spec" / "profiles"

SURFACES = ("§4", "03", "profile")

# What the introducing run parsed, at b0704054. A parse below any of these is an instrument
# fault, not a result. If an artefact legitimately shrinks below one, that is a review, not a bump.
FLOORS = {
    "§4.1 rows": 12,
    "§4.2 rows": 15,
    "§4.3 rows": 4,
    "§4 codes, summed over rows": 153,
    "§4.2 implicit codes": 3,
    "03 implicit codes": 3,
    "03 message sections": 40,
    "03 Quick Reference MQTT actions": 27,
    "03 Quick Reference BLE messages": 13,
    "03 sections with a code table": 17,
    "03 sections declaring none": 4,
    "profile documents titled by an action": 24,
    "profile code tables (action documents)": 16,
    "profile documents declaring none": 3,
    "BLE profile sections with a code table": 3,
    "registry codes (§3)": 100,
}

# BLE has no per-message document. Each §4.3 row names the sections that state its codes:
# ("03", <03 section name>) or ("profile", <path under spec/profiles>, <heading regex>).
# A mapped heading that no longer exists is an instrument fault.
BLE_SOURCES = {
    "AuthResponse (→ OfflineAuthRequest)": (
        ("03", "AuthResponse"),
        ("profile", "offline/ble-handshake.md", r"7\. Rejection Reasons$"),
    ),
    "AuthResponse (→ ServerSignedAuth)": (
        ("profile", "offline/ble-handshake.md", r"4\.2\.2 Verification \(Station-Side\)$"),
    ),
    "StartServiceResponse": (
        ("03", "StartServiceResponse"),
        ("profile", "offline/ble-session.md", r"1\. Starting a Service$"),
    ),
    "StopServiceResponse": (
        ("03", "StopServiceResponse"),
        ("profile", "offline/ble-session.md", r"3\. Stopping a Service$"),
    ),
}

# Every divergence measured at b0704054, by row and code, with the surfaces that DO carry it.
# One line per (section, row, carriers); codes may be written as ranges. `row` in the code column
# is a row-level entry. The reason names the open decision (D1-D5, see the docstring).
BASELINE = """
4.1 | Heartbeat                          | 1005, 1010, 5106, 6001          | profile    | D1: heartbeat.md §8 lists conditions; §4.1's own note dispositions all four
4.1 | TransactionEvent                   | 2003, 2005, 2006, 2014-2017     | §4+profile | D3: 03 §4.1 lists five codes; the profile and §4 carry the gate's twelve
4.1 | AuthorizeOfflinePass               | 1005                            | §4+03      | D3: the profile's §7 table omits it
4.1 | AuthorizeOfflinePass               | 2015                            | §4+profile | D3: 03 §2.1 omits check #11's code
4.1 | SignCertificate                    | 1005, 6001                      | §4         | 03 §6.10 omits them and no profile table exists; not under §4.2's implicit note
4.1 | DataTransfer                       | 1010                            | profile    | D1: the waiting sender's own timeout, never a response value
4.1 | SessionEnded                       | row                             | no §4 row  | D5: an EVENT in 03's Quick Reference with no §4.1 row
4.2 | ReserveBay                         | 5000-5009                       | §4+03      | D3: 03 §3.1's range note; reserve-bay.md §7 lists no hardware code
4.2 | StartService                       | 5000, 5002, 5003, 5005-5009     | §4+03      | D3: 03 §3.3's range note; start-service.md §7 lists only 5001 and 5004
4.2 | StartService                       | 3017, 5103, 5111                | §4+profile | D3: 03 §3.3 omits them
4.2 | StartService                       | 5113                            | profile    | D1, D2: reported on the bay, not answered; falsifies start-service.md §8's subset claim
4.2 | SetMaintenanceMode                 | 3002, 3014                      | §4+profile | D3: 03 §6.8 omits them
4.2 | CertificateInstall                 | 5107                            | §4         | 03 §6.11 omits it, no profile table; prose makes 5107 reachable from every command
4.2 | DataTransfer                       | 1010                            | profile    | D1: the waiting sender's own timeout, never a response value
4.2 | TriggerMessage                     | 1010                            | profile    | D1: the waiting sender's own timeout, never a response value
4.3 | AuthResponse (→ ServerSignedAuth)  | 1012, 2013                      | §4         | D4: not in §4.2.2's checks; 2013 has prose support, 1012 none
4.3 | AuthResponse (→ ServerSignedAuth)  | 2018                            | profile    | D4: §4.2.2 check #2; the §3.2 registry row places it here
4.3 | StartServiceResponse               | 3002, 3004, 3005, 3008-3010, 5001-5009 | §4  | D4: ble-session.md §1's table lists 3001, 3003, 5000
4.3 | StopServiceResponse                | 3006, 3007                      | §4         | D4: no source; the schema has no error member (KNOWN-ISSUES B-3)
"""

# ─────────────────────────────────────────────────────────────────────────────
# Markdown primitives
# ─────────────────────────────────────────────────────────────────────────────

_SEP_CELL = re.compile(r"^:?-+:?$")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_PROSE = re.compile(r"\*\(.*?\)\*")
_CODE = re.compile(r"(?<![\w.])([1-9]\d{3})(?:\s*(?:–|—|--|-)\s*([1-9]\d{3}))?(?![\w.])")
_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
_IMPLICIT = re.compile(r"`(\d{4}) [A-Z_]+`")
CODE_HEADERS = {"error code", "code"}

broken: list[str] = []


def read_lines(path: Path) -> list[str]:
    """The file's lines, with fenced code blocks blanked so no parser reads inside one."""
    out, fence = [], False
    for line in path.read_text(encoding="utf-8").split("\n"):
        if line.lstrip().startswith("```"):
            fence = not fence
            out.append("")
            continue
        out.append("" if fence else line)
    return out


def split_row(line: str) -> list[str] | None:
    """Cells of a markdown table row, or None. A `|` inside a code span is not a separator."""
    s = line.strip()
    if not s.startswith("|"):
        return None
    cells, cur, in_code, i = [], [], False, 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and s[i + 1:i + 2] == "|":
            cur.append("|")
            i += 2
            continue
        if ch == "`":
            in_code = not in_code
        if ch == "|" and not in_code:
            cells.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    cells.append("".join(cur))
    if cells and not cells[0].strip():
        cells = cells[1:]
    if cells and not cells[-1].strip():
        cells = cells[:-1]
    return [c.strip() for c in cells]


def tables(lines: list[str], lo: int, hi: int):
    """Yield (header_line_no, header_cells, [(line_no, cells), ...]) for each table in lines[lo:hi]."""
    i = lo
    while i < hi - 1:
        head, sep = split_row(lines[i]), split_row(lines[i + 1])
        if head and sep and all(_SEP_CELL.match(c) for c in sep):
            rows, j = [], i + 2
            while j < hi:
                r = split_row(lines[j])
                if r is None:
                    break
                rows.append((j + 1, r))
                j += 1
            yield i + 1, head, rows
            i = j
        else:
            i += 1


def sections(lines: list[str]):
    """(level, title, start, end) per heading; `end` is the next heading at the same level or above."""
    heads = [(len(m.group(1)), m.group(2), i)
             for i, m in ((i, _HEADING.match(l)) for i, l in enumerate(lines)) if m]
    out = []
    for k, (lvl, title, start) in enumerate(heads):
        end = next((s for l2, _, s in heads[k + 1:] if l2 <= lvl), len(lines))
        out.append((lvl, title, start, end))
    return out


def codes_in(text: str, where: str) -> set[int]:
    """Every registry-shaped code in `text`, with `A–B` ranges expanded inclusive."""
    out: set[int] = set()
    for m in _CODE.finditer(_LINK.sub(r"\1", text)):
        lo = int(m.group(1))
        hi = int(m.group(2)) if m.group(2) else lo
        if hi < lo or hi - lo > 99:
            broken.append(f"{where}: {m.group(0)!r} is not a plausible code range")
            continue
        out.update(range(lo, hi + 1))
    return out


def code_tables(path: Path, lines: list[str], lo: int, hi: int):
    """(codes, [header line numbers]) over every table in lines[lo:hi] with an error-code column."""
    codes, found = set(), []
    for hl, head, rows in tables(lines, lo, hi):
        keys = [re.sub(r"[*`]", "", c).strip().lower() for c in head]
        col = next((i for i, k in enumerate(keys) if k in CODE_HEADERS), None)
        if col is None:
            continue
        got: set[int] = set()
        for ln, cells in rows:
            if col < len(cells):
                got |= codes_in(cells[col], f"{path.relative_to(ROOT)}:{ln}")
        if not got:
            broken.append(f"{path.relative_to(ROOT)}:{hl}: a table with an error-code column "
                          f"yielded no code; the cell format changed")
        codes |= got
        found.append(hl)
    return codes, found


def fmt(codes) -> str:
    """A code set in the notation §4 uses: ascending, runs of three or more as `A–B`."""
    xs = sorted(codes)
    parts, i = [], 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[j + 1] == xs[j] + 1:
            j += 1
        if j - i >= 2:
            parts.append(f"{xs[i]}–{xs[j]}")
        else:
            parts.extend(str(x) for x in xs[i:j + 1])
        i = j + 1
    return ", ".join(parts)


def msg_no(q) -> str:
    return f"MSG-{int(re.sub(r'[^0-9]', '', q['msg']) or 0):03d}"


# ─────────────────────────────────────────────────────────────────────────────
# Surface 1 — 07-errors.md: §4.1--4.3 and the §3 registry
# ─────────────────────────────────────────────────────────────────────────────

_ROW_NAME = re.compile(r"^([A-Za-z]+) \[(MSG-\d{3})\]$")


def parse_errors():
    lines = read_lines(ERRORS)
    secs = sections(lines)
    registry: set[int] = set()
    reg = next((s for s in secs if s[0] == 2 and s[1] == "3. Error Code Registry"), None)
    if reg:
        for line in lines[reg[2]:reg[3]]:
            m = re.match(r"^\|\s*(\d{4})\s*\|", line)
            if m:
                registry.add(int(m.group(1)))
    top = next((s for s in secs if s[0] == 2 and s[1] == "4. Error Code Usage per Message"), None)
    if top is None:
        broken.append("07-errors.md has no `## 4. Error Code Usage per Message` heading")
        return registry, [], set()
    rows, implicit = [], set()
    for lvl, title, a, b in secs:
        m = re.match(r"4\.([123]) ", title)
        if lvl != 3 or not m or not top[2] < a < top[3]:
            continue
        sub = "4." + m.group(1)
        if sub == "4.2":
            for line in lines[a:b]:
                if line.startswith("> **Implicit error codes:**"):
                    implicit |= {int(c) for c in _IMPLICIT.findall(line)}
        for _, _, trs in tables(lines, a, b):
            for ln, cells in trs:
                if len(cells) < 2:
                    continue
                nm = _ROW_NAME.match(cells[0]) if sub != "4.3" else None
                bare = _LINK.sub(r"\1", cells[1])
                rows.append(dict(
                    sub=sub, name=nm.group(1) if nm else cells[0], msg=nm.group(2) if nm else None,
                    line=ln, codes=codes_in(_PROSE.sub("", bare), f"spec/07-errors.md:{ln}"),
                    implicit_only="implicit only" in bare))
    return registry, rows, implicit


# ─────────────────────────────────────────────────────────────────────────────
# Surface 2 — 03-messages.md: the Quick Reference roster and each message's own table
# ─────────────────────────────────────────────────────────────────────────────

_MSG_SECTION = re.compile(r"^(\d+)\.(\d+) ([A-Za-z]+)(?: \(FFF\d\))?$")
_RANGE_NOTE = re.compile(r"`(\d{4})\s*(?:–|—|--|-)\s*(\d{4})`")


def parse_messages():
    lines = read_lines(MESSAGES)
    secs = sections(lines)
    msgs = {}
    for lvl, title, a, b in secs:
        m = _MSG_SECTION.match(title) if lvl == 3 else None
        if not m:
            continue
        err = next(((s[2], s[3]) for s in secs
                    if s[0] == 4 and a < s[2] < b and s[1] == "Error Responses"), None)
        codes, found = code_tables(MESSAGES, lines, a, b)
        ranged: set[int] = set()
        for line in (lines[err[0]:err[1]] if err else ()):
            if line.startswith(">"):
                for rm in _RANGE_NOTE.finditer(line):
                    ranged |= codes_in(rm.group(0).strip("`"), "spec/03-messages.md")
        status = "table" if (found or ranged) else ("none" if err else "absent")
        msgs[m.group(3)] = dict(label=f"03 §{m.group(1)}.{m.group(2)}", status=status,
                                codes=codes | ranged)
    roster = {"mqtt": [], "ble": []}
    for lvl, title, a, b in secs:
        kind = ("mqtt" if title.startswith("MQTT Messages (") else
                "ble" if title.startswith("BLE Messages (") else None)
        if lvl != 3 or kind is None:
            continue
        for _, _, trs in tables(lines, a, b):
            for _, cells in trs:
                if len(cells) >= 4:
                    roster[kind].append(dict(msg=cells[0], name=_LINK.sub(r"\1", cells[1]).strip(),
                                             direction=cells[2], type=cells[3]))
    implicit = set()
    for lvl, title, a, b in secs:
        if lvl == 4 and title == "Implicit Error Codes":
            for line in lines[a:b]:
                implicit |= {int(c) for c in _IMPLICIT.findall(line)}
    return msgs, roster, implicit


# ─────────────────────────────────────────────────────────────────────────────
# Surface 3 — the profiles
# ─────────────────────────────────────────────────────────────────────────────


def parse_profiles():
    docs = {}
    for path in sorted(PROFILES.rglob("*.md")):
        if path.name == "README.md":
            continue
        lines = read_lines(path)
        secs = sections(lines)
        h1 = next((t for lvl, t, _, _ in secs if lvl == 1), None)
        err = next((s for s in secs if s[0] == 2 and re.match(r"\d+\. .*\bError\b", s[1])), None)
        codes, found = code_tables(path, lines, err[2], err[3]) if err else (set(), [])
        rel = str(path.relative_to(PROFILES))
        label = f"{rel} §{err[1].split('.')[0]}" if err else rel
        docs[rel] = dict(path=path, lines=lines, secs=secs, h1=h1, label=label, codes=codes,
                         status="table" if found else ("none" if err else "absent"))
    return docs


def ble_section(doc, title_re):
    for _, title, a, b in doc["secs"]:
        if re.match(title_re, title):
            codes, found = code_tables(doc["path"], doc["lines"], a, b)
            num = title.split(" ")[0].rstrip(".")
            return dict(label=f"{doc['path'].relative_to(PROFILES)} §{num}", codes=codes,
                        status="table" if found else "absent")
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Derivation and comparison
# ─────────────────────────────────────────────────────────────────────────────


def derive(s4_rows, s4_implicit, msgs, roster, docs):
    """One entry per row of the derived §4.1--4.3, and the row-level divergences."""
    by_h1 = {d["h1"]: d for d in docs.values()}
    s4 = {(r["sub"], r["name"]): r for r in s4_rows}
    wanted = []
    for q in roster["mqtt"]:
        d = q["direction"]
        if "Bidirectional" in d or "→ Server" in d:
            wanted.append(("4.1", q["name"], q))
        if "Bidirectional" in d or "Server → Station" in d:
            wanted.append(("4.2", q["name"], q))
    ble = {q["name"]: q for q in roster["ble"] if q["name"].endswith("Response")}
    for label in BLE_SOURCES:
        base = label.split(" (")[0]
        if base not in ble:
            broken.append(f"BLE_SOURCES names {label!r}, but 03's Quick Reference has no BLE "
                          f"message {base!r}; the map is stale")
        wanted.append(("4.3", label, ble.get(base)))
    for base in sorted(set(ble) - {label.split(" (")[0] for label in BLE_SOURCES}):
        broken.append(f"03's Quick Reference has BLE message {base!r} and BLE_SOURCES maps no "
                      f"section for it")

    rows, row_level = [], []
    for sub, name, q in wanted:
        r = s4.get((sub, name))
        srcs = {}
        if sub in ("4.1", "4.2"):
            m = msgs.get(name)
            if m and m["status"] != "absent":
                srcs["03"] = (m["label"], m["codes"], m["status"])
            d = by_h1.get(name)
            if d and d["status"] != "absent":
                srcs["profile"] = (d["label"], d["codes"], d["status"])
        else:
            for spec in BLE_SOURCES[name]:
                if spec[0] == "03":
                    m = msgs.get(spec[1])
                    if m and m["status"] != "absent":
                        srcs["03"] = (m["label"], m["codes"], m["status"])
                    continue
                doc = docs.get(spec[1])
                sec = ble_section(doc, spec[2]) if doc else None
                if sec is None:
                    broken.append(f"BLE_SOURCES: no heading matching {spec[2]!r} in "
                                  f"spec/profiles/{spec[1]}")
                elif sec["status"] != "absent":
                    srcs["profile"] = (sec["label"], sec["codes"], sec["status"])
        implicit = sub == "4.2" or bool(r and r["implicit_only"])
        if implicit:
            srcs = {k: (lab, c - s4_implicit, st) for k, (lab, c, st) in srcs.items()}
        derived = set().union(*(c for _, c, _ in srcs.values()))
        rows.append(dict(sub=sub, name=name, q=q, s4=r, srcs=srcs, derived=derived,
                         implicit=implicit))
        if r is None:
            row_level.append((sub, name, "no §4 row"))
        elif q is not None and sub != "4.3" and msg_no(q) != r["msg"]:
            row_level.append((sub, name, f"{r['msg']} in §4, {msg_no(q)} in 03"))
    known = {(s, n) for s, n, _ in wanted}
    for (sub, name) in sorted(s4):
        if (sub, name) not in known:
            row_level.append((sub, name, "§4 row names no such message"))
    return rows, row_level


def divergences(rows):
    """{(sub, row, code): carriers} for every code carried by some but not all existing surfaces."""
    out = {}
    for d in rows:
        if d["s4"] is None:
            continue
        surf = {"§4": d["s4"]["codes"]}
        surf.update({k: c for k, (_, c, _) in d["srcs"].items()})
        existing = set(surf)
        for code in sorted(set().union(*surf.values())):
            carriers = {k for k, c in surf.items() if code in c}
            if carriers != existing or existing == {"§4"}:
                out[(d["sub"], d["name"], code)] = "+".join(k for k in SURFACES if k in carriers)
    return out


def load_baseline():
    pairs, rowlvl, why = {}, {}, {}
    for n, line in enumerate(BASELINE.strip().split("\n"), 1):
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 5:
            broken.append(f"BASELINE line {n} has {len(parts)} fields, not 5")
            continue
        sub, name, codes, carriers, reason = parts
        if codes == "row":
            rowlvl[(sub, name)] = carriers
            why[(sub, name, None)] = reason
            continue
        for c in codes_in(codes, f"BASELINE line {n}"):
            pairs[(sub, name, c)] = carriers
            why[(sub, name, c)] = reason
    return pairs, rowlvl, why


# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

TITLES = {"4.1": "Station → Server MQTT Actions", "4.2": "Server → Station MQTT Actions",
          "4.3": "BLE Message Types"}


def print_derived(rows, s4_implicit):
    print("Derived §4.1–4.3: the union of each row's sources. Bold is editorial and is not "
          "derived.\n")
    for sub in ("4.1", "4.2", "4.3"):
        print(f"### {sub} {TITLES[sub]} (derived)\n")
        if sub == "4.2":
            print(f"Implicit for every row, not repeated: {fmt(s4_implicit)}\n")
        print("| Message | Derived Error Codes | Derived from | Sources disagree on |")
        print("|---------|---------------------|--------------|---------------------|")
        for d in (x for x in rows if x["sub"] == sub):
            q = d["q"]
            name = d["name"] + (f" [{msg_no(q)}]" if q and sub != "4.3" else "")
            if d["derived"]:
                cell = fmt(d["derived"])
            elif q and q["type"] == "EVENT":
                cell = "*(EVENT — no RESPONSE)*"
            elif d["implicit"]:
                cell = "*(implicit only)*"
            else:
                cell = "*(none)*" if d["srcs"] else "*(no source)*"
            src = " · ".join(lab + (" (declares none)" if st == "none" else "")
                             for lab, _, st in d["srcs"].values()) or "—"
            split = ""
            if len(d["srcs"]) == 2:
                a, b = d["srcs"]["03"][1], d["srcs"]["profile"][1]
                split = " · ".join(x for x in (f"03 only: {fmt(a - b)}" if a - b else "",
                                               f"profile only: {fmt(b - a)}" if b - a else "") if x)
            print(f"| {name} | {cell} | {src} | {split} |")
        print()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="compare the derived sets with §4 and apply BASELINE")
    args = ap.parse_args()

    registry, s4_rows, s4_implicit = parse_errors()
    msgs, roster, m03_implicit = parse_messages()
    docs = parse_profiles()
    rows, row_level = derive(s4_rows, s4_implicit, msgs, roster, docs)
    pairs, base_rows, why = load_baseline()

    mqtt_names = {q["name"] for q in roster["mqtt"]}
    action_docs = [d for d in docs.values() if d["h1"] in mqtt_names]
    ble_tables = sum(1 for d in rows if d["sub"] == "4.3" and "profile" in d["srcs"])
    measured = {
        "§4.1 rows": sum(r["sub"] == "4.1" for r in s4_rows),
        "§4.2 rows": sum(r["sub"] == "4.2" for r in s4_rows),
        "§4.3 rows": sum(r["sub"] == "4.3" for r in s4_rows),
        "§4 codes, summed over rows": sum(len(r["codes"]) for r in s4_rows),
        "§4.2 implicit codes": len(s4_implicit),
        "03 implicit codes": len(m03_implicit),
        "03 message sections": len(msgs),
        "03 Quick Reference MQTT actions": len(roster["mqtt"]),
        "03 Quick Reference BLE messages": len(roster["ble"]),
        "03 sections with a code table": sum(m["status"] == "table" for m in msgs.values()),
        "03 sections declaring none": sum(m["status"] == "none" for m in msgs.values()),
        "profile documents titled by an action": len(action_docs),
        "profile code tables (action documents)": sum(d["status"] == "table" for d in action_docs),
        "profile documents declaring none": sum(d["status"] == "none" for d in action_docs),
        "BLE profile sections with a code table": ble_tables,
        "registry codes (§3)": len(registry),
    }
    for key, floor in FLOORS.items():
        if measured[key] < floor:
            broken.append(f"{key}: parsed {measured[key]}, floor {floor} — a heading or table "
                          f"format moved, and the comparison would otherwise run on a thinner parse")

    if not args.check:
        if broken:
            print("INSTRUMENT BROKEN — a derivation produced nothing believable:")
            for b in broken:
                print(f"  ! {b}")
            return 2
        print_derived(rows, s4_implicit)
        print(f"{len(rows)} rows derived: 03-messages.md contributes "
              f"{measured['03 sections with a code table']} sections with a code table, "
              f"spec/profiles/ {measured['profile code tables (action documents)'] + ble_tables}. "
              f"--check compares them with §4.")
        return 0

    for key, floor in FLOORS.items():
        print(f"  {key:<40}: {measured[key]}  (floor {floor})")
    compared = sum(1 for d in rows if d["s4"] is not None)
    print(f"\n{compared} rows compared: §4.1–4.3 against 03-messages.md and spec/profiles/")

    if broken:
        print("\nINSTRUMENT BROKEN — a derivation produced nothing believable:")
        for b in broken:
            print(f"  ! {b}")
        return 2

    failures: list[str] = []

    # The two implicit notes must name the same codes: §4.2's is the one subtracted here.
    if s4_implicit != m03_implicit:
        failures.append(f"§4.2's implicit note names {fmt(s4_implicit)}; 03's names "
                        f"{fmt(m03_implicit)}")

    # A code nothing defines is not a divergence between surfaces; it is wrong on all of them.
    for d in rows:
        cands = set(d["s4"]["codes"]) if d["s4"] else set()
        for _, c, _ in d["srcs"].values():
            cands |= c
        for code in sorted(cands - registry):
            failures.append(f"{d['sub']} {d['name']}: {code} is not in the §3 registry")

    current = divergences(rows)
    new = {k: v for k, v in current.items() if pairs.get(k) != v}
    gone = {k: v for k, v in pairs.items() if current.get(k) != v}
    cur_rows = {(s, n): kind for s, n, kind in row_level}
    new_rows = {k: v for k, v in cur_rows.items() if base_rows.get(k) != v}
    gone_rows = {k: v for k, v in base_rows.items() if cur_rows.get(k) != v}

    on_rows = len({(s, n) for s, n, _ in current})
    print(f"divergent (row, code) pairs  : {len(current)} on {on_rows} rows  (baseline {len(pairs)})")
    print(f"row-level divergences        : {len(cur_rows)}  (baseline {len(base_rows)})")

    index = {(d["sub"], d["name"]): d for d in rows}
    groups: dict = {}
    for (sub, name, code), carriers in current.items():
        groups.setdefault((sub, name, carriers), []).append(code)
    last = None
    for (sub, name, carriers), codes in sorted(groups.items()):
        if (sub, name) != last:
            print(f"\n  {sub} {name}")
            last = (sub, name)
        present = ["§4"] + list(index[(sub, name)]["srcs"])
        absent = "+".join(s for s in SURFACES if s in present and s not in carriers.split("+"))
        tag = "NEW " if any((sub, name, c) in new for c in codes) else "    "
        print(f"    {tag}in {carriers:<11} {'not in ' + absent if absent else 'no source':<18} "
              f"{fmt(codes)}")
        if why.get((sub, name, codes[0])):
            print(f"{'':<42}{why[(sub, name, codes[0])]}")
    for (sub, name), kind in sorted(cur_rows.items()):
        tag = "NEW " if (sub, name) in new_rows else "    "
        print(f"\n  {sub} {name}\n    {tag}{kind}")
        if why.get((sub, name, None)):
            print(f"{'':<42}{why[(sub, name, None)]}")

    if gone or gone_rows:
        print("\nBASELINE entries that no longer occur — delete them in the change that closed them:")
        for (sub, name, code), carriers in sorted(gone.items()):
            now = current.get((sub, name, code))
            print(f"  ✗ {sub} {name} {code}: recorded in {carriers}; now "
                  + (f"in {now}" if now else "no divergence"))
        for (sub, name), kind in sorted(gone_rows.items()):
            print(f"  ✗ {sub} {name}: recorded as {kind!r}; it no longer occurs")
    if new or new_rows:
        print("\nDivergences BASELINE does not list:")
        for (sub, name, code), carriers in sorted(new.items()):
            print(f"  ✗ {sub} {name} {code}: in {carriers}")
        for (sub, name), kind in sorted(new_rows.items()):
            print(f"  ✗ {sub} {name}: {kind}")
    for f in failures:
        print(f"  ✗ {f}")

    if new or gone or new_rows or gone_rows or failures:
        print("\nDRIFT — §4 and its sources moved against the recorded divergence set. Changing §4 or "
              "a profile table is a normative decision; this file only records where they stand.")
        return 1
    print("\nAt baseline: every divergence printed above is recorded, and every recorded one occurs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
