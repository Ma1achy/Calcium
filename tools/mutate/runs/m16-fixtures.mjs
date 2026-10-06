// Review batch 4 M16.1 — each framed design fixture's figure against its golden
// frame, and the file of allowed differences compared by equality
// (`DESIGN_FIXTURES.md` §The figure, `tools/design/figures.ts`).
//
// **Every clause here fails quietly in the direction that reads as coverage.**
// A comparison that reads the figure on both sides agrees with itself; a
// locator that takes every heading draws some frame for every section; a
// difference nobody records as unlocated turns *no golden draws this* into
// *nothing differs*. None of them is visible from a green run, because each
// makes the measured list shorter and the allowed list was derived from it.
//
// **Three of the mutations are on data, not code**, and that is the subject:
// the equality is between two lists and one of them is a checked-in file, so
// a stale entry, a missing reason and a figure on an unframed row are the
// defects the rows exist to refuse. And one reverts the test's own predicate,
// which is the fail-on-revert form of M16.1's census fix.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TOOL = "tools/design/figures.ts";
const TEST = "test/golden/design-fixtures.test.ts";
const MAP = "test/golden/DESIGN_FIXTURES.md";
const ALLOWED = "test/golden/design-differences.json";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${TEST} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every located row can see**: at the ASCII rung no frame
    // draws a mark outside ASCII, so every located difference changes shape.
    file: TOOL,
    from: 'export const RUNG = "dark-unicode";',
    to: 'export const RUNG = "dark-ascii";',
    why: "every located frame is read at the ASCII rung, so its marks vanish and each T1.7 row disagrees with its entry",
  },
  mutations: [
    {
      // **THE DEFECT M16.1 names**: `framed` counting a target whatever the
      // probe says, so a frame of an unbuilt surface is a drawing of it.
      name: "THE DEFECT: framed counts built: no",
      file: TOOL,
      from: 'r.cls === "surface" && r.built !== "no" && r.target !== "—";',
      to: 'r.cls === "surface" && r.target !== "—";',
      expect: "T1.6",
    },
    {
      // **The census's fix, reverted in the row that reads it** — the
      // document says 58 and the old predicate counts 65.
      name: "fail-on-revert: T1.4 counts framed by target alone",
      file: TEST,
      from: 'framed: surfaces.filter((r) => r.built !== "no" && r.target !== "—").length,',
      to: 'framed: surfaces.filter((r) => r.target !== "—").length,',
      expect: "T1.4",
    },
    {
      // **The comparison that agrees with itself**: the frame's marks read off
      // the figure, so nothing ever differs and every located entry is stale.
      name: "the frame's marks are the figure's",
      file: TOOL,
      from: "    const have = marks(drawn);",
      to: "    const have = marks(figure);",
      expect: "T1.7",
    },
    {
      // **The caption counted as the drawing**: its `—` and `▸` are the
      // repository's words about the frame.
      name: "a caption line is part of the frame",
      file: TOOL,
      from: '    if (inside && !line.startsWith("· ")) out.push(line);',
      to: "    if (inside) out.push(line);",
      expect: "T1.7",
    },
    {
      // **Unlocated read as agreement**: a row whose golden draws nothing
      // under its heading drops out of the list instead of being one entry.
      name: "an unlocated frame is not a difference",
      file: TOOL,
      from: '      out.push({ section: r.section, target, unlocated: true, reason: "" });\n      continue;',
      to: "      continue;",
      expect: "T1.11",
    },
    {
      // **Every heading is the section's**: the locator takes the whole
      // golden, so §22 is located and every located frame gains every mark.
      name: "the locator takes every heading",
      file: TOOL,
      from: "      inside = Number(head[1]) === section;",
      to: "      inside = true;",
      expect: "T1.7",
    },
    {
      // **A heading found or not, the same answer**: an absent section reads
      // as an empty frame, and an unlocated row becomes a located one.
      name: "a section with no heading is an empty frame",
      file: TOOL,
      from: "  return found ? out : null;",
      to: "  return out;",
      expect: "T1.11",
    },
    {
      // **A range read as its first line**: the figure shrinks and its marks
      // with it.
      name: "a figure range is its first line only",
      file: TOOL,
      from: "    out.push([Number(m[1]), Number(m[2] ?? m[1])]);",
      to: "    out.push([Number(m[1]), Number(m[1])]);",
      expect: "T1.7",
    },
    {
      // **Width by code units** — CLAUDE.md's *never `.length` for display
      // width*. No framed figure's widest line holds a wide glyph, so the
      // corpus rows cannot see it; T1.10's constructed line is what does.
      name: "a figure's width is its length",
      file: TOOL,
      from: "  return Math.max(0, ...lines.map((l) => cells(l)));",
      to: "  return Math.max(0, ...lines.map((l) => l.length));",
      expect: "T1.10",
    },
    {
      // **Always the widest golden**: reads as safe, and compares a narrow
      // figure against a frame drawn at twice its width.
      name: "the rung width is always the widest",
      file: TOOL,
      from: "  return sortedWidths.find((w) => w >= figureCells) ?? sortedWidths.at(-1);",
      to: "  return sortedWidths.at(-1);",
      expect: "T1.10",
    },
    {
      // **The one command launders a reason** written about the other kind.
      name: "a reason is carried across a change of kind",
      file: TOOL,
      from: "    return old !== undefined && kind(old) === kind(d) ? { ...d, reason: old.reason } : d;",
      to: "    return old !== undefined ? { ...d, reason: old.reason } : d;",
      expect: "T1.9",
    },
    {
      // **A stale entry** — §031's frame agrees with its figure, so an entry
      // for it excuses nothing. The direction a containment check misses.
      name: "DATA: a stale entry for a section that agrees",
      file: ALLOWED,
      from: ' "differences": [\n',
      to:
        ' "differences": [\n  {"section": 31, "target": "design-surfaces.test.ts", "width": 80, "figureCells": 70, '
        + '"figureOnly": [], "frameOnly": [], "reason": "stale"},\n',
      expect: "T1.8",
    },
    {
      // **An entry with no reason**, which the file's whole claim rests on.
      name: "DATA: a reason blanked",
      file: ALLOWED,
      from:
        "\"reason\": \"The figure draws one collapsed head and one open head with a `│` rail; the frame draws the `tree` kind, the nearest built shape (there is no reasoning kind). The marks agree; the difference is the em dash in the figure's `collapsed — the default` annotation, which is the figure's caption and not a drawn mark\"",
      to: '"reason": ""',
      expect: "T1.8",
    },
    {
      // **A figure on an unbuilt row** — a claim nothing compares.
      name: "DATA: a figure on a built: no row",
      file: MAP,
      from: "| 17 | surface | no | `design-surfaces.test.ts` | — |",
      to: "| 17 | surface | no | `design-surfaces.test.ts` | 1-5 |",
      expect: "T1.6",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
