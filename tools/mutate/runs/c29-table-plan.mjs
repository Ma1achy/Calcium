// C29 1.6 — the table's flex distribution on the engine. Mutated.
//
// **Steps 6 to 8 were a second copy of the engine's surplus arm**, and the two
// agreed on every input including the leftover cell. So the rows below are not
// about whether the loop works — one loop now does — but about whether the four
// numbers the table hands it are the right four: the floor, the cap, the weight
// and the budget the gaps come out of.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/table.test.ts test/contract/table.test.ts test/edge/table.test.ts " +
  "test/edge/blocks.test.ts";
const F = "src/presentation/table/plan.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: F,
    // Every column sits at its minimum and nothing flexes. The drop tables are
    // unchanged — admission is upstream of this — so a pass that cannot see
    // this is a pass that only reads which columns survived.
    from: '  return distribute(demands, available - gaps, "largest-remainder").sizes;',
    to: "  return kept.map((k) => k.min);",
    why: "every width collapses to its minimum while the drop tables stay right; a pass blind to this reads only survival",
  },
  mutations: [
    {
      // **Every column flexes.** Step 8's decision — with no flex column the
      // residual is left unused and the table renders narrower than the
      // terminal — is `weight: 0`, and this is the arbitrary stretch it refuses
      // (C11 §3 step 8). C07's fallback is the shape that shows it.
      name: "a column that does not flex absorbs the residual anyway",
      file: F,
      from: "      weight: k.column.flex === true ? 1 : 0,",
      to: "      weight: 1,",
      expect: "T3.68",
    },
    {
      // **`maxWidth` dropped.** A capped flex column takes the whole residual,
      // and the fixed point has nothing to pin — which is the loop's reason for
      // being a loop (C29 I5, C11 §3 step 7).
      name: "a capped column grows past its maximum",
      file: F,
      from: "      max: cap === null ? Infinity : cap,",
      to: "      max: Infinity,",
      expect: "T3.68",
    },
    {
      // **The gaps left in the budget.** Every column is two cells wider than
      // the frame has room for, per gap — the drift that comes of one component
      // counting a gap and another not (C11 §3 step 1).
      name: "the gaps are not taken out of the budget",
      file: F,
      from: '  return distribute(demands, available - gaps, "largest-remainder").sizes;',
      to: '  return distribute(demands, available, "largest-remainder").sizes;',
      // **T1.5 and not T3.68.** Seven rows go with it, and the one that names
      // the rule is the width-sum invariant swept from 20 to 200 — the others
      // are particular tables noticing a particular overflow.
      expect: "T1.5",
    },
    {
      // **The leftover unspent.** `spend: "none"` is the group's policy and not
      // the table's: a residual that does not divide leaves the rightmost cell
      // of the table short, and the extra cell is meant to land in one
      // predictable place (C29 I4, C04 I42, F1219).
      name: "the table leaves its leftover cell unspent",
      file: F,
      from: '  return distribute(demands, available - gaps, "largest-remainder").sizes;',
      to: '  return distribute(demands, available - gaps, "none").sizes;',
      expect: "T1.6",
    },
    {
      // **The forced column's escape removed.** Step 4's one column is the only
      // one that may be narrower than its own minimum, and handing it to the
      // distribution gives it the minimum it cannot have — a column wider than
      // the terminal, which D38 forbids outright (C11 I5).
      name: "the forced column is distributed like any other",
      file: F,
      from: "  if (overflowed) return [Math.min(kept[0]?.min ?? 1, available)];",
      to: "",
      // **T1.4 and not T3.4.** T3.4 is the contradictory `ColumnDef`, which is
      // `maxOf`'s clamp and not this arm; the row that owns step 4's one forced
      // column is the one that constructs it — 40 cells at width 20.
      expect: "T1.4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
