/**
 * **`DESIGN_FIXTURES.md` against the fixture corpus it maps** (M16).
 *
 * *The design fixtures mapped onto the golden frames, surface by surface* is a
 * claim about a **corpus**, and a claim about a corpus that nothing counts is
 * one nobody can check — which is F163 exactly, one directory over. So the
 * table is parsed from the document rather than restated here, `corpus.test.ts`'s
 * own idiom and the same trade: brittle against reformatting one table, against
 * the alternative of being brittle against the map and the corpus diverging.
 *
 * **What is derived and what is not, stated rather than blurred.**
 * `corpus.test.ts` derives its kind from the file's imports because otherwise
 * the row asserts itself, and the first draft of this gate tried the same —
 * *a fixture is prose when its own text carries no drawn frame*. It is wrong in
 * both directions and was measured before being believed: ten `frame` fixtures
 * carry no box-drawing (a call head is a line of text), and eight `prose`
 * fixtures carry plenty (a rule table drawn in a box). §063 draws 312 box
 * characters and specifies no surface; §030 draws none and specifies the
 * most-drawn line in the application.
 *
 * So the **class is a judgement** and the rows below hold the parts that rot on
 * their own: membership by equality in both directions, targets that exist, a
 * census compared against the figure the document prints — and, since review
 * batch 4 (M16.1), **each framed fixture's figure against its golden frame**,
 * which is the comparison the map existed to make and the one nothing made.
 *
 * **T1.5 is retired, not renumbered** (M16.6). It searched the tree's code for
 * each row's probe, and a substring answers *a word with this spelling occurs*:
 * §035 and §036 read as built for a whole MR on an option key of
 * `Intl.Segmenter`, and §076 on a real symbol belonging to another subject. It
 * walked every file for every probe, which made it the row a loaded lane timed
 * out. T1.7 asks what the probe stood in for — does the frame draw what the
 * figure draws — and the probes stay in the column as a reader's pointer.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FIXTURES,
  allowed,
  carry,
  differences,
  framed,
  figureWidth,
  measured,
  ranges,
  rows,
  rungWidth,
} from "../../tools/design/figures.js";

const MAP = "test/golden/DESIGN_FIXTURES.md";

type Fixture = Readonly<{ section: number; file: string }>;

function fixtures(): readonly Fixture[] {
  return JSON.parse(readFileSync(join(FIXTURES, "INDEX.json"), "utf8")) as Fixture[];
}

describe("M16 — the design fixtures, mapped", () => {
  it("T1.1 (M16, F163): every fixture has a row and every row a fixture, by equality", () => {
    // **Equality, not containment.** A subset check in either direction is
    // satisfied by the failure it exists to catch: a fixture nobody classified
    // reads as covered, and a row pointing at a fixture that was renamed reads
    // as coverage of something that is no longer there.
    const mapped = rows().map((r) => r.section);
    const present = fixtures().map((f) => f.section);
    expect([...mapped].sort((a, b) => a - b), "the map's sections").toEqual(
      [...present].sort((a, b) => a - b),
    );
    expect(new Set(mapped).size, "and no section is mapped twice").toBe(mapped.length);
  });

  it("T1.2 (M16): the sections with no fixture are the two that could not be a picture", () => {
    // **Named, not merely absent.** §025 and §040 are the design's live
    // animations — *drag the clock to scrub it* — so their specimen is motion.
    // A row that simply allowed a shortfall would allow any shortfall.
    const registry = JSON.parse(
      readFileSync("docs/design/language/calcium-registry.json", "utf8"),
    ) as { sections: readonly { order: number; key: string }[] };
    const all = registry.sections.map((s) => s.order + 1);
    const have = new Set(fixtures().map((f) => f.section));
    const without = all.filter((n) => !have.has(n)).sort((a, b) => a - b);
    expect(without, "exactly the two animated sections").toEqual([25, 40]);
  });

  it("T1.3 (M16): every mapped target exists, so a renamed golden leaves no dangling row", () => {
    const dangling = rows()
      .filter((r) => r.target !== "—" && !r.target.includes("examples/"))
      .map((r) => ({ r, t: r.target.replaceAll("`", "") }))
      .filter(({ t }) => !existsSync(join("test/golden", t)) && !existsSync(join("test/integration", t)))
      .map(({ r, t }) => `§${String(r.section)} → ${t}`);
    expect(dangling, "frame rows whose target is not in the tree").toEqual([]);
  });

  it("T1.4 (M16): the census in the document is the census of the table", () => {
    // **The number moves only on purpose.** The direction that matters is
    // `owed` → `frame` as the reconciliation lands, and it should be a figure a
    // reader watches rather than something inferred from a green suite.
    const counted = new Map<string, number>();
    for (const r of rows()) counted.set(r.cls, (counted.get(r.cls) ?? 0) + 1);
    const doc = readFileSync(MAP, "utf8");
    const line = /surface (\d+) · prose (\d+) · app (\d+) · total (\d+)/u.exec(doc);
    expect(line, "the census line").not.toBeNull();
    const [surface, prose, app, total] = (line ?? []).slice(1).map(Number);
    expect(
      { surface: counted.get("surface"), prose: counted.get("prose"), app: counted.get("app") },
      "the document's census against the table's",
    ).toEqual({ surface, prose, app });
    expect(total, "and the total is the corpus").toBe(fixtures().length);

    // **`built` and `framed` are counted too**, because they are the figures
    // the reconciliation moves and the ones that would drift silently.
    const inner = /built (\d+) · unbuilt (\d+) · framed (\d+)/u.exec(doc);
    expect(inner, "the surface census").not.toBeNull();
    const [built, unbuilt, framed] = (inner ?? []).slice(1).map(Number);
    const surfaces = rows().filter((r) => r.cls === "surface");
    expect(
      {
        built: surfaces.filter((r) => r.built !== "no").length,
        unbuilt: surfaces.filter((r) => r.built === "no").length,
        // **`built: no` is not framed** (review batch 4, M16.1): a frame of a
        // surface the tree does not have is a census or an absence, and it was
        // counted as a drawing of the fixture for as long as this line read
        // only the target.
        framed: surfaces.filter((r) => r.built !== "no" && r.target !== "—").length,
      },
      "built, unbuilt and framed",
    ).toEqual({ built, unbuilt, framed });
  });

  it("T1.6 (M16.1): the figure column is present on exactly the framed rows, and each range lies inside its fixture", () => {
    // **Present on exactly the framed rows, by equality.** A figure on an
    // unframed row is a claim nothing compares; a framed row with none has
    // nothing to be compared against — and the day a `built: no` row gains a
    // probe, this is the row that says its figure is owed.
    const all = rows();
    expect(
      all.filter((r) => r.figure !== "—").map((r) => r.section),
      "the rows carrying a figure are the framed rows",
    ).toEqual(all.filter(framed).map((r) => r.section));
    const index = new Map(fixtures().map((f) => [f.section, f.file]));
    const bad: string[] = [];
    for (const r of all.filter(framed)) {
      const spans = ranges(r.figure);
      const lines = readFileSync(join(FIXTURES, index.get(r.section)!), "utf8").replace(/\n$/u, "").split("\n");
      if (spans === null) bad.push(`§${String(r.section)}: \`${r.figure}\` is not a line range`);
      else
        for (const [a, b] of spans)
          if (a < 1 || b < a || b > lines.length)
            bad.push(`§${String(r.section)}: ${String(a)}-${String(b)} against ${String(lines.length)} lines`);
    }
    expect(bad, "figures that are not ranges inside their fixture").toEqual([]);
  });

  // **One row per framed fixture**, so a red names its section. The list is
  // the table's, read when the file is collected — a fixture framed later
  // gets its row without anyone writing one.
  const allowedBySection = new Map(allowed().map((d) => [d.section, measured(d)]));
  const measuredBySection = new Map(differences().map((d) => [d.section, measured(d)]));
  it.each(rows().filter(framed).map((r) => r.section))(
    "T1.7 (M16.1): §%s's golden frame against its figure — the difference is the allowed one, or there is none",
    (section) => {
      expect(measuredBySection.get(section), "the marks the figure and the frame do not share").toEqual(
        allowedBySection.get(section),
      );
    },
  );

  it("T1.8 (M16.1): the allowed differences equal the measured ones in both directions, and each carries a reason", () => {
    // **Equality, not containment** — the membership row's reason, one file
    // over. A subset check lets an entry outlive the difference it excused,
    // and an excuse with no subject reads as coverage of something that is no
    // longer there.
    expect(
      allowed().map(measured),
      "test/golden/design-differences.json against the tree — `npx tsx tools/design/figures.ts --write` re-derives it",
    ).toEqual(differences().map(measured));
    expect(
      allowed()
        .filter((d) => d.reason.trim() === "")
        .map((d) => d.section),
      "entries with no reason — each is owed one, written by a person",
    ).toEqual([]);
  });

  it("T1.9 (M16.1): re-deriving keeps a section's reason while its entry keeps its kind, and drops it when the kind changes", () => {
    // **The one command is only safe if it cannot launder a stale reason.** A
    // row that became locatable has a reason about why it was not, and
    // carrying that across would make T1.8's reason check pass on a sentence
    // about the other state.
    const located = (section: number, reason: string) =>
      ({ section, target: "design-surfaces.test.ts", width: 80, figureCells: 60, figureOnly: ["✦ U+2726"], frameOnly: [], reason }) as const;
    const unlocated = (section: number, reason: string) =>
      ({ section, target: "blocks.test.ts", unlocated: true, reason }) as const;
    const prior = [located(1, "moved marks"), unlocated(2, "indexed by kind"), located(3, "stale")];
    const now = [
      { ...located(1, ""), figureOnly: ["✓ U+2713"] }, // same kind, marks moved: the reason stays
      located(2, ""), // became locatable: the reason is about the other state
      unlocated(4, ""), // new: nobody has written one
    ];
    expect(carry(prior, now).map((d) => [d.section, d.reason])).toEqual([
      [1, "moved marks"],
      [2, ""],
      [4, ""],
    ]);
  });

  it("T1.10 (M16.1): a figure's width is its cells, so a wide glyph picks the golden a terminal would need", () => {
    // **Constructed, because the corpus cannot say it.** Measured at the lane's
    // tree, no framed figure's widest line holds a wide glyph, so `.length` and
    // `cells()` agree on all 58 and a comparison run over the corpus is blind
    // to which one it used. Twenty-one `⚡` are twenty-one code units and
    // forty-two cells: `.length` would compare them against the 40-column
    // golden, which cannot hold the line.
    const wide = ["⚡".repeat(21)];
    expect(figureWidth(wide), "cells, not code units").toBe(42);
    expect(rungWidth([80, 40], figureWidth(wide)), "the narrowest golden that holds it").toBe(80);
    expect(rungWidth([80, 40], 40), "a figure exactly the width takes that golden").toBe(40);
    expect(rungWidth([80, 40], 81), "and wider than every golden takes the widest").toBe(80);
  });

  it("T1.11 (M16.1, F1466): a framed row whose golden has no heading for it is unlocated, and one whose heading is there and whose marks differ is a located difference", () => {
    // **Constructed, because the corpus emptied the arm.** F1466 drew all 58
    // framed fixtures under their headings, so no real row is unlocated any
    // more and two mutations of `differences` (an unlocated frame read as no
    // difference; a missing heading read as an empty frame) survived `T1.7` —
    // nothing in the tree reached them. A root of its own does: one framed row
    // over a snapshot that holds a frame for section 2 and none for section 1.
    const root = mkdtempSync(join(tmpdir(), "m16-"));
    try {
      mkdirSync(join(root, "test/golden/__snapshots__"), { recursive: true });
      mkdirSync(join(root, "docs/design/language/fixtures"), { recursive: true });
      const row = (n: number) => `| ${String(n)} | surface | \`probe\` | \`design-surfaces.test.ts\` | 1 | a figure |`;
      writeFileSync(
        join(root, MAP),
        `## The table\n\n${row(1)}\n${row(2)}\n\n## The two with no fixture\n`,
      );
      writeFileSync(
        join(root, "docs/design/language/fixtures/INDEX.json"),
        JSON.stringify([{ section: 1, file: "a.txt" }, { section: 2, file: "b.txt" }]),
      );
      writeFileSync(join(root, "docs/design/language/fixtures/a.txt"), "● one\n");
      writeFileSync(join(root, "docs/design/language/fixtures/b.txt"), "● two\n");
      // Section 2's frame draws `✓` where the figure draws `●`; section 1 has no heading at all.
      writeFileSync(
        join(root, "test/golden/__snapshots__/design-surfaces.test.ts.snap"),
        "exports[`g > dark-unicode at 80 1`] = `\n\"── §2 · two\n✓ two\"\n`;\n",
      );
      const found = differences(root);
      expect(found.map((d) => d.section), "both rows are differences").toEqual([1, 2]);
      expect("unlocated" in found[0]!, "§1 has no heading, so it is unlocated").toBe(true);
      expect(found[1], "§2 is located and names its marks").toMatchObject({
        section: 2,
        figureOnly: ["● U+25CF"],
        frameOnly: ["✓ U+2713"],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
