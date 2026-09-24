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


def recorded() -> set[str]:
    r = json.load(open(f"{ROOT}/calcium-registry.json", encoding="utf-8"))
    out: set[str] = set()
    for g in r.get("glyphs", []):
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
            if ord(ch) > 0x2000 and ch not in known:
                seen[ch] += 1
                where[ch].add(path.split("/")[-1][:3])
    print(f"{len(seen)} marks drawn in the fixtures with no glyph, spinner or bar record")
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
