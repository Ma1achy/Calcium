// C09 I108 — the shed mark's reservation, mutated.
//
// **The subject is a budget, and its defect was invisible to every row that
// existed.** `shedRow` reserves cells for its mark before the survivors are
// sized, because the mark cannot be the part that gets clamped. The reservation
// was the constant `2`, justified by a sentence about `⋯1` through `⋯9` — the
// Unicode lead — where the lead is a parameter and is `...` at the ASCII rung.
//
// **And the first draft of `T2.170` could not fail**, which is why the control
// here is the one it is. The row searched the drawn frame for the lead `...`
// and checked the digits after it; the defect draws `..~`, which contains no
// `...`, so the search missed and the check never ran. An assertion keyed on
// the thing the defect removes never fires. The row is a cross-rung comparison
// now — wherever the Unicode rung draws a mark, the ASCII rung must too.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/edge/status.test.ts test/unit/blocks.test.ts";
const S = "src/presentation/blocks/shed.ts";

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
    file: S,
    // The reservation removed entirely: the mark is composed and nothing is set
    // aside for it, so it comes out of the clamp at *both* rungs. A run where
    // this survives is not reading the drawn row at all.
    from: "  const mark = markCells(lead, parts.length) + Math.max(gap, 1); // cells-ok — a cell count",
    to: "  const mark = 0; // cells-ok — a cell count",
    why: "with nothing reserved the mark is clamped at both rungs; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT, restored.** Not a fabrication — this is the line as it
      // shipped, and it took a frame-read at the ASCII rung to find.
      name: "THE DEFECT: the reservation is the constant 2, and the ASCII lead is three cells",
      file: S,
      from: "  const mark = markCells(lead, parts.length) + Math.max(gap, 1); // cells-ok — a cell count",
      to: "  const mark = 2 + Math.max(gap, 1); // cells-ok — a cell count",
      expect: "T2.170",
    },
    // **Two more mutations were written here and both survived — and the
    // survival indicts the FIX, not the row** (F277's third disposition). They
    // reduced the reservation to `cells(lead)` and inflated the count's width
    // to the count itself. Swept over the four shedding kinds at every width
    // from 6 to 60 at both rungs:
    //
    //     cells(lead) + digits  (the fix)      40 marks   0 damaged
    //     cells(lead)           (mutation)     44 marks   0 damaged
    //     2                     (as shipped)   25 marks  19 damaged
    //
    // Only the lead is load-bearing on this corpus. The digit term is the
    // arithmetically correct bound — `cells(mark)` is `cells(lead) + digits` —
    // and `cells(lead)` alone survives on slack the second solve happens to
    // leave, so the term stays and the limit is stated on it rather than a row
    // being stretched to manufacture a kill. **A mutation that cannot be
    // reached is not a row to strengthen; it is a claim the corpus cannot hold.**
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
