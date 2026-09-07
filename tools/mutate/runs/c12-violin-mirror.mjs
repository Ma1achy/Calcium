// C12 I39 — a mirror needs a centre, and both arms took the spine off their own
// axis of reflection at every even extent.
//
// **The comment was already right and nothing acted on it.** Standing over the
// symmetric half of the arithmetic: *a violin that is asymmetric by a row is a
// violin that is wrong, and it is invisible in anything but a mirror
// assertion.* There was no mirror assertion, and the golden corpus could not
// have been one — the horizontal fixture's band height is odd, so four vertical
// frames moved under the fix and no horizontal frame did, out of 284.
//
// So the rows below are the assertion the comment asked for, and this run is
// what says they can see the defect at all.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const KDE = "src/presentation/plot/kde.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-violin-mirror.test.ts 2>&1',
      { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: KDE,
    from: "const mirrorable = (k: number): number => (k % 2 === 1 ? k : k - 1); // cells-ok — a cell count",
    to: "const mirrorable = (k: number): number => k - 1; // cells-ok — a cell count",
    why: "shortening every extent makes the odd ones even, so the figure is asymmetric at the extents that were correct before the fix as well as after it — a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **The shipped defect.** Both arms draw on the slot they were given and
      // the spine lands on the lower baseline at every even extent.
      name: "the mirrored rung draws on the slot it was given",
      file: KDE,
      from: "const mirrorable = (k: number): number => (k % 2 === 1 ? k : k - 1); // cells-ok — a cell count",
      to: "const mirrorable = (k: number): number => k; // cells-ok — a cell count",
      expect: "VM1",
    },
    {
      // The other half, and the one a reader would not predict: the figure is
      // symmetric either way and the band's own label and tick are not on it.
      name: "the horizontal arm's spare row goes after the figure",
      file: KDE,
      // The box was lifted into `boxOnSpine` when the braille arm landed, so
      // both vocabularies place a median identically (C12 I43); the return
      // moved with it and the clause under test did not.
      from: "  return [...gap, ...boxOnSpine(grid.map((r) => r.join(\"\")), spineRow, w, caps, quartiles, lo, hi, pad)];",
      to: "  return [...boxOnSpine(grid.map((r) => r.join(\"\")), spineRow, w, gl, quartiles, lo, hi, pad), ...gap];",
      expect: "VM3",
    },
    {
      name: "the vertical arm's spare column goes after the figure",
      file: KDE,
      from: "  return grid.map((r) => gap + r.join(\"\"));",
      to: "  return grid.map((r) => r.join(\"\") + gap);",
      expect: "VM3",
    },
    {
      // The floor arm has to be padded too, and it is the one place the two
      // widths could disagree — a fill row is built from `densities` and knows
      // nothing about the slot.
      name: "the vertical arm's fill row forgets the spare column",
      file: KDE,
      from: "    return densities.map((d) => gap + (d / maxD > 0.05 ? pair.filled : \" \"));",
      to: "    return densities.map((d) => (d / maxD > 0.05 ? pair.filled : \" \"));",
      expect: "VM3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
