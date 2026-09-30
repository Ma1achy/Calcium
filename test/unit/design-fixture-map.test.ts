// `tools/design-fixture-map.py` — the writer of `test/golden/DESIGN_FIXTURES.md`, run.
//
// **`design-fixtures.test.ts` holds the file and never runs the writer**, the
// shape QT1 answers for the quantised table. The file is this script's output
// on this tree — a run at 8f115e74 rewrote it byte for byte — so a writer that
// had drifted from the file would pass every row that reads the file until the
// next regeneration, and then land as a diff nobody asked for. `make
// instruments` found it with no fixture.
//
// **It writes to a fixed relative path**, so the row runs it in a temporary
// directory holding copies of the two files it reads — the fixture index and
// the registry — and compares what it wrote. The committed file is never
// opened for writing.
//
// **This row expires the day the file is edited by hand.** Batch 4 does that
// (5763573b adds a `figure` column the script does not write), and there the
// script is retired and exempted in `tools/instruments.mjs` instead; merging
// forward, this row goes red rather than passing against a file it no longer
// produces.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const MAP = resolve("tools/design-fixture-map.py");
const TABLE = "test/golden/DESIGN_FIXTURES.md";
const READS = ["docs/design/language/fixtures/INDEX.json", "docs/design/language/calcium-registry.json"];

describe("tools/design-fixture-map.py — DESIGN_FIXTURES.md, written", () => {
  it("DM1: regenerating in another directory reproduces the committed file byte for byte, and leaves it untouched", () => {
    const before = readFileSync(TABLE, "utf8");
    const dir = mkdtempSync(join(tmpdir(), "calcium-fixture-map-"));
    try {
      for (const rel of READS) {
        mkdirSync(join(dir, rel, ".."), { recursive: true });
        copyFileSync(rel, join(dir, rel));
      }
      mkdirSync(join(dir, "test/golden"), { recursive: true });
      const r = spawnSync("python3", [MAP], { cwd: dir, encoding: "utf8" });
      const said = `${r.stdout}${r.stderr}`;
      expect(r.status, said).toBe(0);
      // The tally it prints is over the sections it classified — not zero.
      const total = Number(/ total (\d+)$/mu.exec(said)?.[1]);
      expect(total, said).toBeGreaterThan(0);
      expect(readFileSync(join(dir, TABLE), "utf8")).toBe(before);
      expect(readFileSync(TABLE, "utf8"), "the run writes nowhere else").toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
