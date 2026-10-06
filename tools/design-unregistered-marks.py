#!/usr/bin/env python3
"""Marks the design DRAWS that the registry does not RECORD.

**The instrument F161 asks for, pointed the other way.** F161 was a shared mark
with four named consumers whose character was in no file; this finds the inverse
— a character in every fixture whose *record* is missing — and that one survives
review, because a reader going to the registry finds the mark in the prose and
prose reads exactly like registration.

**Nothing else can reach it.** SS64 builds its collision domains out of glyph
records, so a mark with no record is in no domain and contests nothing; the
design's own `check-calcium.mjs` checks the HTML against the registry, and a mark
that is in both and registered in neither agrees with itself.

Not a gate, and deliberately. Registering a mark needs its ASCII rung, which is a
visible choice the design does not make (PARKED_QUESTIONS 15, 17) — so this
reports, and the numbers are the argument for the questions' size.
"""
import collections, glob, json, sys, unicodedata

ROOT = "docs/design/language"

# Typography and the fixtures' own furniture, which are not UI marks. Each is
# named rather than filtered by class, because a range would quietly swallow the
# next real one.
IGNORE = set("’‘“”–—…·×→←↑↓ ")
# Below U+2000, named one at a time for the same reason. `§` is the fixtures'
# own section reference and the commonest character here at 87; `Δ`, `°` and `÷`
# are data inside a figure — a delta, a temperature, a division — and `é` is a
# letter. None is an affordance, which is the line this tool draws.
IGNORE |= set("§Δ°÷é")


def recorded() -> set[str]:
    r = json.load(open(f"{ROOT}/calcium-registry.json", encoding="utf-8"))
    out: set[str] = set()
    # **`delimiters` as well as `glyphs`, and the omission was invisible.** The
    # registry keeps `«` and `»` in a second array of the same shape — `unicode`,
    # `ascii`, `reservedCells`, `collisionDomains`, `ruleIds` — and reading only
    # `glyphs` left both unrecorded here. It manufactured no false positive
    # because the scan below cut at U+2000 and both marks are Latin-1: **the two
    # shortfalls concealed each other exactly.** Measured 2026-09-24 — lowering
    # the cut with this loop unfixed reports `«` 4x and `»` 23x as unregistered,
    # and `»`'s record is the one carrying M4's own `secondRoleNote`.
    for g in r.get("glyphs", []) + r.get("delimiters", []):
        for k in ("unicode", "ascii"):
            if isinstance(g.get(k), str):
                out.update(g[k])
    for s in r.get("spinners", []):
        for f in s.get("frames", []) or []:
            out.update(str(f))
    for b in r.get("bars", []):
        for v in b.values():
            for e in v if isinstance(v, list) else [v]:
                if isinstance(e, str):
                    out.update(e)
    return out


def main() -> int:
    known = recorded() | IGNORE
    seen: collections.Counter[str] = collections.Counter()
    where: dict[str, set[str]] = collections.defaultdict(set)
    for path in sorted(glob.glob(f"{ROOT}/fixtures/*.txt")):
        for ch in open(path, encoding="utf-8").read():
            # **ASCII, not U+2000.** The old cut excluded the whole Latin-1
            # supplement, where `« » ° ·` live — a mark drawn with no record is
            # as much a gap at U+00BB as at U+2500, and the cut is here to
            # skip letters and punctuation a keyboard types, which is ASCII.
            if ord(ch) > 0x7F and ch not in known:
                seen[ch] += 1
                where[ch].add(path.split("/")[-1][:3])
    print(f"{len(seen)} marks drawn in the fixtures with no glyph, delimiter, spinner or bar record")
    # **The total did not move when the population was corrected, and that is
    # the residue worth stating rather than a sign nothing happened** (F1152's
    # shape). Two changes landed together: the cut dropped from U+2000 to
    # ASCII, which exposed five Latin-1 marks — `§ Δ ° ÷ é`, every one prose or
    # data and every one now in IGNORE by name — and `delimiters` joined the
    # recorded set, which took `«` and `»` out of the exposure. 63 before and
    # 63 after, over a population that is no longer short at either end.
    # **A count, not a list of defects, and the difference is the mark's job.**
    # Box drawing (`│ ━ ┃ ╽ ╿`) is structural furniture the tree carries in
    # `GlyphSet` and the registry deliberately does not — it records the design's
    # 14 marks, not every rule and border. Braille is plot output under the bar
    # alphabets. What the two parked questions rest on are the **semantic** marks
    # painted as affordances: the seven chord glyphs at 402 occurrences, and `↺`.
    # Read the rows, not the total.
    for ch, n in seen.most_common():
        try:
            name = unicodedata.name(ch)
        except ValueError:
            name = "?"
        print(f"  {ch}  U+{ord(ch):04X}  {n:>4}x  §{','.join(sorted(where[ch])[:6])}  {name[:44]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
