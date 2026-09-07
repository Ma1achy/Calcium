// C26 §5 — `pills` declares its chips as elements, mutated.
//
// **Two mutations, both about the address.** The id is the chip's label — two
// chips with one label are one element; and every chip on row 0 — containment
// and order fail at the widths where the row wraps. Neither is visible from a
// document that fits on one row with distinct labels, which is the convenient
// fixture.
//
// Anchors and expectations are Lane D's, each run by hand on 2026-09-03.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/navigation-pills.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/presentation/blocks/kinds/simple.ts",
    from: "          id: `chip-${String(index)}`,",
    to: "          id: text,",
    why: "the id is the label — T2.16d fails on the repeated label; a run that cannot see two chips collapse into one address cannot see the seam",
  },
  mutations: [
    {
      name: "every chip on row 0",
      file: "src/presentation/blocks/kinds/simple.ts",
      from: "          rows: Object.freeze({ from: row, to: row + 1 }),",
      to: "          rows: Object.freeze({ from: 0, to: 1 }),",
      expect: "T2.16b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
