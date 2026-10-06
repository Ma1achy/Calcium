// The design census's two reporters — `tools/design-prose-with-surfaces.py` and
// `tools/design-unregistered-marks.py` — over fabricated trees.
//
// **Both report and neither gates, which is why nothing had asked them a
// question.** A reporter that miscounts is read as a measurement: *16 of 33
// `prose` sections draw marks*, *60 marks with no record*. `make instruments`
// found them with no fixture. Each reads paths relative to its working
// directory, so every row builds the corpus in a temporary directory, runs the
// script there, and reads what it printed.
//
// **The fabrications are the occasions the scripts' own comments record**:
// `delimiters` omitted from the recorded set, and the cut at U+2000 that hid
// the Latin-1 marks — each concealing the other (e1d1e108).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { rows as mapRows } from "../../tools/design/figures.js";

const PROSE = resolve("tools/design-prose-with-surfaces.py");
const MARKS = resolve("tools/design-unregistered-marks.py");

/** A tree holding `files`, the script run in it, and the tree removed. */
function run(script: string, files: Readonly<Record<string, string>>): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "calcium-census-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    const r = spawnSync("python3", [script], { cwd: dir, encoding: "utf8" });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FIX = "docs/design/language/fixtures";
const REG = "docs/design/language/calcium-registry.json";

describe("design-prose-with-surfaces.py — `prose` sections whose fixture draws marks", () => {
  // **The classification it reads is `DESIGN_FIXTURES.md`'s class column**
  // (ruling 95, F1484), sliced and matched as `figures.ts`'s `rows()` does it.
  // It used to be `design-fixture-map.py`'s `M`, parsed out of that script's
  // text; the script is gone and the markdown is the one record. §2's probe
  // carries an escaped pipe, and so does §4's, because a probe is an
  // alternation and the pattern that stopped at the byte dropped two rows once.
  const MAP = "test/golden/DESIGN_FIXTURES.md";
  const table = (body: string): string =>
    `# The design fixtures, mapped\n\n## The table\n\n| § | class | built | target | figure | what the fixture specifies |\n|---|---|---|---|---|---|\n${body}\n## The two with no fixture\n\n| § | why |\n|---|---|\n`;
  const map = table(
    [
      "| 1 | prose | — | — | — | a |",
      "| 2 | surface | `x\\|y` | `x.test.ts` | 1-1 | b |",
      "| 3 | prose | — | — | — | c |",
      "| 4 | prose | `a\\|b` | — | — | d |",
    ].join("\n") + "\n",
  );

  it("DC1: only `prose` sections are read, a section with no marks is left out, and the rest rank by count", () => {
    const r = run(PROSE, {
      [MAP]: map,
      // §1 prose, two marks. §2 surface, many — not prose, so never read.
      // §3 prose, no marks. §4 prose, four marks — ranked above §1.
      [`${FIX}/001-a.txt`]: "a ✦ and a ❯\n",
      [`${FIX}/002-b.txt`]: "✦✦✦✦✦✦✦✦\n",
      [`${FIX}/003-c.txt`]: "plain words, and ASCII | - +\n",
      [`${FIX}/004-d.txt`]: "█ █ ▸ ⎿\n",
    });
    expect(r.status, r.out).toBe(0);
    const lines = r.out.trimEnd().split("\n");
    expect(lines[0]).toBe("2 of 3 `prose` sections draw marks — a shortlist, not a defect list");
    expect(lines.slice(1).map((l) => /§\s*(\d+)\s+(\d+) marks/u.exec(l)?.slice(1, 3))).toEqual([
      ["4", "4"],
      ["1", "2"],
    ]);
  });

  it("DC2: the control — every section classified `surface` reads as none drawn, whatever it draws", () => {
    const r = run(PROSE, {
      [MAP]: map.replaceAll("| prose |", "| surface |"),
      [`${FIX}/001-a.txt`]: "a ✦ and a ❯\n",
      [`${FIX}/004-d.txt`]: "█ █ ▸ ⎿\n",
    });
    expect(r.status, r.out).toBe(0);
    expect(r.out.trimEnd()).toBe("0 of 0 `prose` sections draw marks — a shortlist, not a defect list");
  });

  it("DC6: a row of the table's shape outside `## The table` is not a classification", () => {
    // The document explains its columns in tables of its own, above the map
    // and below it; `rows()` reads between the two headings and so does this.
    const decoy = "| 5 | prose | — | — | — | e |\n";
    const r = run(PROSE, {
      [MAP]: `${decoy}\n${map}${decoy}`,
      [`${FIX}/001-a.txt`]: "a ✦ and a ❯\n",
      [`${FIX}/005-e.txt`]: "✦✦✦✦✦✦✦✦\n",
    });
    expect(r.status, r.out).toBe(0);
    expect(r.out.split("\n")[0]).toBe("1 of 3 `prose` sections draw marks — a shortlist, not a defect list");
  });

  it("DC7: over the real map, its `prose` count is the one `design-fixtures.test.ts` reads", () => {
    // **One table read one way** is the ruling's claim, and a fabricated table
    // cannot hold it: this runs the script over the tree and compares its
    // population with `rows()`'s, so a reader that drifts from the gate's
    // parser disagrees here before it disagrees with anyone reading the number.
    const r = spawnSync("python3", [PROSE], { encoding: "utf8" });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    const prose = mapRows().filter((row) => row.cls === "prose").length;
    expect(prose, "the map has `prose` rows at all").toBeGreaterThan(0);
    expect(/^\d+ of (\d+) `prose`/u.exec(r.stdout)?.[1]).toBe(String(prose));
  });
});

describe("design-unregistered-marks.py — marks the fixtures draw that the registry does not record", () => {
  const registry = {
    glyphs: [{ unicode: "▸", ascii: ">" }],
    delimiters: [{ unicode: "«", ascii: "<<" }],
    spinners: [{ frames: ["⠋", "⠙"] }],
    bars: [{ filled: "█", steps: ["▁", "▃"] }],
  };
  // Each recorded mark once; `⏎` twice and `»` once, recorded nowhere; and
  // the named ignores — typography, `§`, `é` — and ASCII, which are not marks.
  const fixtures = {
    [`${FIX}/005-a.txt`]: "▸ « ⠋ █ ▃ ⏎ » — § é plain\n",
    [`${FIX}/009-b.txt`]: "⏎\n",
  };
  const rows = (out: string) =>
    out
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((l) => /^\s+(\S)\s+U\+([0-9A-F]{4})\s+(\d+)x\s+§(\S+)/u.exec(l)?.slice(1, 5));

  it("DC3: a mark in any of the four records is recorded, and only the rest are reported — count, code point and sections", () => {
    const r = run(MARKS, { [REG]: JSON.stringify(registry), ...fixtures });
    expect(r.status, r.out).toBe(0);
    expect(r.out.split("\n")[0]).toBe(
      "2 marks drawn in the fixtures with no glyph, delimiter, spinner or bar record",
    );
    expect(rows(r.out)).toEqual([
      ["⏎", "23CE", "2", "005,009"],
      ["»", "00BB", "1", "005"],
    ]);
  });

  it("DC4: the cut is ASCII and not U+2000 — `»` is Latin-1 and reported; `«` is Latin-1 and recorded as a delimiter", () => {
    // The two shortfalls that concealed each other: without `delimiters`, `«`
    // is unrecorded; with the old cut, neither Latin-1 mark was ever scanned.
    const bare = { ...registry, delimiters: [] };
    const r = run(MARKS, { [REG]: JSON.stringify(bare), ...fixtures });
    expect(r.status, r.out).toBe(0);
    expect(rows(r.out).map((row) => row?.[0])).toEqual(["⏎", "«", "»"]);
  });

  it("DC5: the control — an empty registry reports every non-ASCII mark but the named ignores", () => {
    const r = run(MARKS, { [REG]: JSON.stringify({}), ...fixtures });
    expect(r.status, r.out).toBe(0);
    expect(new Set(rows(r.out).map((row) => row?.[0]))).toEqual(new Set(["▸", "«", "⠋", "█", "▃", "⏎", "»"]));
  });
});
