// C14 §4b — the cap on rows one block may occupy, and its marker. Mutated.
//
// **One row per `expect`**, the anchor sweep's rule; the other rows a kill
// reaches are named beside it.
//
// **Three halves that each read as complete**: the count (`#measured`), the
// frame (`render`) and the window (`windowSequence`). A revert of any one leaves
// the other two green, which is why every kill here is a row asserting two of
// them against each other rather than one against a constant.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/block-cap.test.ts test/revert/block-cap.test.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";

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
    file: REGISTRY,
    from: "export const DEFAULT_MAX_BLOCK_ROWS = 2_000;",
    to: "export const DEFAULT_MAX_BLOCK_ROWS = 3_000;",
    why: "the default is asserted by number and by a 2 500-line frame; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // The count without the marker: `render` still draws it, so the frame is
      // one row taller than the index says — C09 I1 broken by the registry itself.
      name: "COUNT-DROPPED: `measure` stops counting the marker row",
      file: REGISTRY,
      from:
        "form.definition.measure(form.block, width, this.measure, this.probe) +\n        (form.capped === null ? 0 : 1);",
      to: "form.definition.measure(form.block, width, this.measure, this.probe);",
      expect: "T6.22", // and T1.19
    },
    {
      // The frame without the marker: the count holds, the block ends at row
      // 2 000 as if it had 2 000 rows. The silent-truncation class.
      name: "MARKER-DROPPED: `render` draws the capped form and no marker",
      file: REGISTRY,
      from: "      const element =\n        form.capped === null\n          ? drawn\n          : createElement(",
      to: "      const element =\n        form.capped === null || form.capped !== null\n          ? drawn\n          : createElement(",
      expect: "T6.22", // and T1.19
    },
    {
      // No cap at all: the form is always the block. Every row over the cap
      // fails, and the panel row fails on the child.
      name: "CAP-INERT: the capped form is never produced",
      file: REGISTRY,
      from: "    if (!(total > this.#cap)) return { ...resolved, capped: null };",
      to: "    if (!(total > this.#cap) || total > 0) return { ...resolved, capped: null };",
      expect: "T1.19", // and T1.20, T2.13, T3.20–T3.23, T4.11, T6.22, T6.23
    },
    {
      // The marker names the cap rather than the rows on screen: `table`'s
      // boundary unit is kept whole and the marker then lies by two.
      name: "SHOWN-IS-CAP: the marker names the cap and not the window's rows",
      file: REGISTRY,
      from:
        "    const shown = resolved.definition.measure(out.block, width, this.measure, this.probe);",
      to: "    const shown = this.#cap;",
      expect: "T3.20",
    },
    {
      // The window stops carrying the marker: a piece reaching the marker row
      // measures one short and its last row is a content row, with the
      // sequence's arithmetic still balancing.
      name: "CARRY-DROPPED: `windowSequence` never re-attaches `capped`",
      file: REGISTRY,
      from: "piece = reachesMarker && capped !== null ? withCapped(out.block, capped) : stripCapped(out.block);",
      to: "piece = stripCapped(out.block);",
      expect: "T6.22", // and T1.20, T2.13, T4.11
    },
    {
      // The window carries the marker unconditionally: a window in the middle
      // of a capped block draws a marker in the middle of the block.
      name: "CARRY-ALWAYS: every piece of a capped block carries the marker",
      file: REGISTRY,
      from: "piece = reachesMarker && capped !== null ? withCapped(out.block, capped) : stripCapped(out.block);",
      to: "piece = capped !== null ? withCapped(out.block, capped) : stripCapped(out.block);",
      expect: "T6.22", // and T1.20, T2.13
    },
    {
      // The window is asked for rows past the content: the definition's window
      // clamps, the marker row is then requested twice, and the slack is wrong
      // for the window over the marker alone.
      name: "MARKER-ROW-WINDOWED: the definition's window is asked for the marker row",
      file: REGISTRY,
      from: "        const wTo = Math.max(wFrom + 1, Math.min(localTo, contentRows));",
      to: "        const wTo = Math.max(wFrom + 1, localTo);",
      expect: "T1.20", // and T2.13
    },
    {
      // The predicate becomes a list: the registry's own kinds still cap and an
      // app's kind that declares `window` does not.
      name: "LIST-OF-KINDS: the cap consults kind names instead of `definition.window`",
      file: REGISTRY,
      from: "    if (windowable === undefined) return { ...resolved, capped: null };",
      to: '    if (windowable === undefined || !["logs", "raw", "code", "keyValue", "table", "patch"].includes(resolved.definition.kind)) return { ...resolved, capped: null };',
      expect: "T6.23", // and T1.19's `lanek` row
    },
    {
      // A piece already carrying `capped` is capped again: a 2-row piece with a
      // marker is under the cap, so nothing happens — unless the cap is 1.
      // Killed by T6.22's `cap: 1` iteration, where a re-cap of a 2-row piece
      // would window it to one row and attach a second marker.
      name: "RECAP: a piece carrying `capped` is measured for the cap again",
      file: REGISTRY,
      from: "    if (held !== null) return { ...resolved, capped: held };",
      to: "    if (held !== null && false) return { ...resolved, capped: held };",
      expect: "T6.22", // and T1.20
    },
    {
      // The floor is applied before the cap rather than after: a floored block
      // over the cap measures `shown + 1` whatever the floor says.
      name: "FLOOR-FIRST: the floor no longer applies to a capped block",
      file: REGISTRY,
      from: "      return { ok: true, rows: Math.max(rows, floor) };",
      to: "      return { ok: true, rows: form.capped === null ? Math.max(rows, floor) : rows };",
      expect: "T3.21",
    },
    {
      // Refusal dropped: a cap of 0 constructs and marks every block.
      name: "NO-REFUSAL: `maxBlockRows: 0` constructs a registry",
      file: REGISTRY,
      from: "    if (!Number.isInteger(maxBlockRows) || maxBlockRows < 1) {",
      to: "    if (!Number.isInteger(maxBlockRows)) {",
      expect: "T2.14",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
