// The P11 residue, mutated: the registry's per-call height memo (C09 I61), the
// cap's two questions (C09 I62) and the one overlay layout per frame (C22 I96).
//
// **Every row this run answers to is a count.** `measure` is pure (C09 I2), so a
// child measured three times in one frame gives the same number three times and
// every assertion about a height or a frame passes either way; the rows count
// definition calls, registry calls and thunk calls, and those are what the
// mutations move. Two of the five are the same defect seen from two sides:
// `commit read removed` fails the C09 rows because the definition runs again,
// and `seam read removed` fails only C22 T4.64, because the commit's read still
// dedupes the definition while every ask now reaches the property the profiler
// wraps — C09's own counts cannot see that, which is why the C22 row exists
// (F940). `shown of the block` is I62's fabricated violation: the second measure
// under the cap asked of the block again rather than of the window, so the
// marker reads `5 of 5 rows` where the form has three.
//
// `test/unit/profiler-budget.test.ts` is not in CMD on purpose: C28 T1.61 reads
// `frames` and stays red until `render-frame.ts` hands one layout to both
// readers, and a red baseline would make every mutation read as killed.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/blocks-measure-once.test.ts test/unit/session-paint.test.ts " +
  "test/unit/session-frame.test.ts";

const REGISTRY = "src/presentation/blocks/registry.ts";
const PAINT = "src/shell/paint.ts";
const RENDER_FRAME = "src/shell/render-frame.ts";

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
    file: PAINT,
    from: "  if (!heightsSum(frame)) {",
    to: "  if (heightsSum(frame)) {",
    why: "inverting the heights guard makes every well-formed frame throw, so every row that paints one fails; a run where this survives is not executing the suite at all",
  },
  mutations: [
    {
      // C09 I61 — the height commit measures again instead of reading the
      // call's memo, so a rendered child's definition runs twice per render.
      name: "commit read removed",
      file: REGISTRY,
      from: "    if (held !== undefined && held.width === width) return { ok: true, rows: held.rows };",
      to: "    if (false) return { ok: true, rows: 0 };",
      expect: "T1.32",
    },
    {
      // C09 I61, the wiring half — the child seam reaches the `measure`
      // property on every ask. Every C09 count still passes; the profiler's
      // `calls` column reads 3.0 on the header pills again.
      name: "seam read removed",
      file: REGISTRY,
      from: "    if (held !== undefined && held.width === w) {",
      to: "    if (false) {",
      expect: "T4.64",
    },
    {
      // C09 I61 — the memo outlives the call, which is the cache F914 refused.
      name: "memo outlives the call",
      file: REGISTRY,
      from: "    } finally {\n      this.#memo = null;\n    }",
      to: "    } finally {\n      // kept\n    }",
      expect: "T1.35",
    },
    {
      // C09 I62 — the second measure asked of the resolved block rather than of
      // the window: one question asked twice, and the marker names it.
      name: "shown of the block",
      file: REGISTRY,
      from: "    const shown = resolved.definition.measure(out.block, width, this.#measureChild, this.probe);",
      to: "    const shown = resolved.definition.measure(resolved.block, width, this.#measureChild, this.probe);",
      expect: "T3.83",
    },
    {
      // C22 I96 — `cursorFor` lays the overlays out for itself again, ignoring
      // the layout it was handed.
      name: "cursor lays out again",
      file: PAINT,
      from: "  const top = placed[placed.length - 1];",
      to: "  const top = placedLayers(deps)[placedLayers(deps).length - 1];",
      expect: "T1.58",
    },
    {
      // C22 I56 — the paint's dependencies built outside the `try`, so a
      // `FrameError` from `paintDeps` escapes instead of drawing the fallback.
      // This is the shape the shared layout landed in: `test/unit/session-frame`
      // joined CMD because T4.11f is the row that caught it (F941).
      name: "paint deps outside the try",
      file: RENDER_FRAME,
      from: "  try {\n    painting = deps.paintDeps(frame);\n",
      to: "  painting = deps.paintDeps(frame);\n  try {\n",
      expect: "T4.11f",
    },
  ],
});

// `report` **returns** the lines; the exit code alone is one bit, and the same
// bit for *survived* and *printed nothing* (uncited-46's first run).
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
