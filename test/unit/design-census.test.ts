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
  // The classification it reads is `design-fixture-map.py`'s table, parsed out
  // of the file's text: `  N:("prose", …`.
  const MAP = "tools/design-fixture-map.py";
  const map = 'M = {\n 1:("prose","—","a"),\n 2:("frame","x.test.ts","b"),\n 3:("prose","—","c"),\n 4:("prose","—","d"),\n}\n';

  it("DC1: only `prose` sections are read, a section with no marks is left out, and the rest rank by count", () => {
    const r = run(PROSE, {
      [MAP]: map,
      // §1 prose, two marks. §2 frame, many — not prose, so never read.
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

  it("DC2: the control — every section classified `frame` reads as none drawn, whatever it draws", () => {
    const r = run(PROSE, {
      [MAP]: map.replaceAll('("prose"', '("frame"'),
      [`${FIX}/001-a.txt`]: "a ✦ and a ❯\n",
      [`${FIX}/004-d.txt`]: "█ █ ▸ ⎿\n",
    });
    expect(r.status, r.out).toBe(0);
    expect(r.out.trimEnd()).toBe("0 of 0 `prose` sections draw marks — a shortlist, not a defect list");
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
