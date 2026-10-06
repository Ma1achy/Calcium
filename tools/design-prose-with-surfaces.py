#!/usr/bin/env python3
"""`prose` sections whose fixture draws marks — the classification, checked.

**A classification is a claim, and this is the population nothing had checked.**
`test/golden/DESIGN_FIXTURES.md` calls some sections `prose` — *a rule table
or an explanation; nothing is drawn* — and every one of those rows asserts that
no frame is owed. The census counts the claims; it cannot test them, because it is
where they are written.

**The classes are read from the map's class column, and nowhere else** (ruling
95, F1484). They used to be parsed out of `design-fixture-map.py`'s table `M`,
the generator the markdown was once written from. The markdown has been edited
by hand since, so `M` was a second record of one fact, agreeing only because
nobody had yet edited one without the other; the generator is gone. The table
is sliced and matched the way `tools/design/figures.ts`'s `rows()` does it, so
this and `design-fixtures.test.ts` read one table one way.

**Measured: 20 of the 37 then-`prose` sections contain drawn marks**, and §064
was the one read whole. Its own sentence is *undo is a transcript entry, because
an invisible undo is one you do twice* — a claim about a drawn form, with two
composed rows as its evidence — so the row was wrong and is now `owed`, blocked
on parked question 17.

**A mark is a signal and not a verdict, which is why this reports.** §032's
spinner rules show a `✦`; §039's *one interval, one family* shows one too. Those
are rule tables illustrating themselves, and they are `prose` correctly. The
discriminator no script has is whether the section's own **claim** needs a frame
to check — so this narrows 36 to a shortlist and a person reads them.

Ranked by mark count descending, because a composed surface spends more marks
than an illustration does.
"""
import glob, re, sys

ROOT = "docs/design/language"
MAP = "test/golden/DESIGN_FIXTURES.md"
# A prompt caret, a head mark, a gutter, a box, a focus mark, a bar cell.
MARKS = "❯›●○◐⎿┌└│├▸⏺✦░█▁▃"


def classes() -> dict[int, str]:
    """`| § | class | built | target | figure | why |`, section to class.

    `rows()`'s slice and pattern: between `## The table` and `## The two with no
    fixture`, and a cell may hold an escaped pipe — a probe is an alternation.
    """
    doc = open(MAP, encoding="utf-8").read()
    body = doc[doc.index("## The table"):doc.index("## The two with no fixture")]
    cell = r"(?:[^|\\]|\\.)+"
    row = re.compile(rf"^\| (\d+) \| (\w+) \| ({cell}) \| ({cell}) \| ({cell}) \|", re.M)
    return {int(m[1]): m[2] for m in row.finditer(body)}


def main() -> int:
    prose = {n for n, cls in classes().items() if cls == "prose"}
    rows = []
    for path in sorted(glob.glob(f"{ROOT}/fixtures/*.txt")):
        n = int(path.split("/")[-1][:3])
        if n not in prose:
            continue
        text = open(path, encoding="utf-8").read()
        hits = {c: text.count(c) for c in MARKS if c in text}
        if hits:
            rows.append((sum(hits.values()), n, hits))
    rows.sort(reverse=True)
    print(f"{len(rows)} of {len(prose)} `prose` sections draw marks — a shortlist, not a defect list")
    for total, n, hits in rows:
        print(f"  §{n:>3}  {total:>4} marks  {hits}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
