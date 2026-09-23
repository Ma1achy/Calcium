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
 * their own: membership by equality in both directions, targets that exist, and
 * a census compared against the figure the document prints.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MAP = "test/golden/DESIGN_FIXTURES.md";

/** Every `.ts` under `src/` and `test/` — what a probe is looked for in. */
const FILES: readonly string[] = (function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full);
    return e.name.endsWith(".ts") ? [full] : [];
  });
})("src").concat(
  (function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full);
      return e.name.endsWith(".ts") ? [full] : [];
    });
  })("test"),
);
const FIXTURES = "docs/design/language/fixtures";

type Row = Readonly<{ section: number; cls: string; built: string; target: string }>;

/** The table, parsed — `| § | class | target | why |`. */
function rows(): readonly Row[] {
  const doc = readFileSync(MAP, "utf8");
  const body = doc.slice(doc.indexOf("## The table"), doc.indexOf("## The two with no fixture"));
  // **A cell may hold an escaped pipe**, because a probe is an alternation and
  // the `built` column carries it. `[^|]+` stops at the byte whatever markdown
  // means by the backslash, and it silently dropped the two rows whose probe
  // had one — caught by the membership row, which is what it is for.
  const cell = String.raw`(?:[^|\\]|\\.)+`;
  const re = new RegExp(String.raw`^\| (\d+) \| (\w+) \| (${cell}) \| (${cell}) \|`, "gmu");
  return [...body.matchAll(re)].map((m) => ({
    section: Number(m[1]),
    cls: m[2]!,
    built: m[3]!.trim(),
    target: m[4]!.trim(),
  }));
}

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

  it("T1.5 (M16): every probe in the `built` column resolves in the tree", () => {
    // **The column is evidence or it is nothing.** Its first draft answered
    // *is this built* from the plan rather than from HEAD and was wrong for
    // most of the corpus — `focusGround`, `dismissal`, `nativeSelection`,
    // `scrollbar.ts`, `tape.ts`, `headMark` and `REGISTRY_THEMES` were all
    // already in the tree while the table called them outstanding.
    //
    // **And a probe that does not resolve indicts the probe first** (F277).
    // Seven of the first sixty-five were wrong: one searched `src/` for a
    // symbol that lives in `test/`, two named block kinds the repo never had,
    // and §069's named a spelling that does not exist for a surface that is
    // built. Every one reads, from outside, exactly like an absence.
    const dead: string[] = [];
    for (const r of rows()) {
      if (r.built === "—" || r.built === "no") continue;
      const symbols = r.built.replaceAll("`", "").split("\\|").map((x) => x.trim());
      const found = symbols.some((sym) =>
        FILES.some((f) => readFileSync(f, "utf8").includes(sym)),
      );
      if (!found) dead.push(`§${String(r.section)} → ${r.built}`);
    }
    expect(dead, "probes naming nothing in the tree").toEqual([]);
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
        framed: surfaces.filter((r) => r.target !== "—").length,
      },
      "built, unbuilt and framed",
    ).toEqual({ built, unbuilt, framed });
  });
});
