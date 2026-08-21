// C04 I67, I68 · C09 I33 · C22 I69, I70 — the deferred height change.
//
// **One of these is not a fabrication.** The unconditional `commit("stream")`
// is the state this feature shipped in for the ten minutes between writing it
// and running T4.50: the patch guard was right and the commit beside it was not,
// so every frame ended by scheduling another. A fixture with nothing animating
// in it wrote thirty more frames while the screen did not change — working, and
// looking exactly like a session that is idle. That is C09 T6.21's form, *a
// revert row restoring a defect that happened rather than one imagined*.
//
// **The two halves of the pair are separate rows here, unlike F227's.** There
// the halves were each sufficient to freeze the frame, so a single-half row
// restored a state the tree never shipped in. Here `max` and the padding fail in
// opposite directions — one makes `measure` disagree with the render, the other
// makes the render disagree with `measure` — and each is a distinct I1
// violation with its own test. Pairing them would hide which side broke.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const REG = "src/presentation/blocks/registry.ts";
const PATCH = "src/data/viewmodel/patch.ts";
const FAULTS = "src/shell/block-faults.ts";
const SESSION = "src/shell/session.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";

const FILES =
  "test/edge/blocks.test.ts test/edge/view-model.test.ts test/integration/deferred-height.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: REG,
    from: "  return typeof held === \"number\" && Number.isInteger(held) && held > 0 ? held : 0;",
    to: "  return 0;",
    why: "no block has a floor at all, so both sides of the pair and every session row go",
  },
  mutations: [
    {
      // C09 I33's first half. `measure` answers the definition's number and the
      // element pads to the floor, so the block draws taller than it measured —
      // I1's divergence created by the mechanism built to keep I1 whole.
      name: "`measure` ignores the floor",
      file: REG,
      from: "      return { ok: true, rows: Math.max(rows, floor) };",
      to: "      return { ok: true, rows };",
      expect: "T3.53",
    },
    {
      // The other half, failing the other way: the number is right and the
      // element is short, so the entry is short and everything below it moves up.
      name: "the render does not pad to the floor",
      file: REG,
      from: "    return createElement(Box, { flexDirection: \"column\", minHeight: floor }, element);",
      to: "    return element;",
      expect: "T3.54",
    },
    {
      // C04 I68 through C09. `windowSequence` derives `to` from the floored
      // height and hands it to a `window` that can only reach the definition's
      // rows, so I26's identity breaks outside the definition.
      name: "a floored block is windowed anyway",
      file: REG,
      from: "      const windowable = floorOf(block) > 0 ? undefined : resolved.definition.window;",
      to: "      const windowable = resolved.definition.window;",
      expect: "T3.52",
    },
    {
      // C04 I68. The rows are not the rows the floor was raised for, so the
      // block pads under content that never failed.
      name: "`merge` carries the floor through",
      file: PATCH,
      from: "        return withoutFloor({ ...table, rows: mergeRows(table.rows, patch.rows) });",
      to: "        return { ...table, rows: mergeRows(table.rows, patch.rows) };",
      expect: "T3.51",
    },
    {
      // **Termination.** C13 bumps `rev` on any applied patch, so a no-op
      // reserve reaching the store re-renders at frame rate for ever.
      name: "the request does not check whether the floor is already held",
      file: FAULTS,
      from: "  return (block.minHeight ?? 0) < req.rows;",
      to: "  return true;",
      expect: "T4.51",
    },
    {
      // The row the sequence trace produced. Without it the shell floors a block
      // the far side has just rebuilt, addressed by an id it reused.
      name: "a request whose entry moved is issued anyway",
      file: FAULTS,
      from: "  if (entry.rev !== req.rev) return false;",
      to: "",
      expect: "T4.55",
    },
    {
      // **Not fabricated — this is what was written first.** The patch guard is
      // untouched and correct; the commit beside it is not, so every frame ends
      // by scheduling another and the session never goes quiet.
      name: "every frame commits, whether or not anything was reserved",
      file: SESSION,
      from: "    if (raised) graph.scheduler.commit(\"stream\");",
      to: "    graph.scheduler.commit(\"stream\");",
      expect: "T4.50",
    },
    {
      // C22 I70, F230. The trim goes back to reconciling two components'
      // answers in silence and taking the block below with it.
      name: "the over-draw is not reported",
      file: SESSION,
      from: "        graph.blockFaults.note(",
      to: "        void ((_unused) => undefined)(",
      expect: "T4.54",
    },
    {
      // C22 I69's addressing half. A fault names a block and ids repeat across
      // entries, so without the scope nothing is recorded and no floor is ever
      // raised — the frame stays correct and the second one never arrives.
      name: "faults are not attributed to the entry being drawn",
      file: SESSION,
      from: "      graph.blockFaults.within(entry.id, entry.rev, () =>",
      to: "      ((_id, _rev, f) => f())(entry.id, entry.rev, () =>",
      expect: "T4.49",
    },
    {
      // C04 I67, F231. The far side sets view state and is charged a real row
      // for it — measured at 3 against 2 before the gate existed.
      name: "the far-side gate accepts view state",
      file: VALIDATE,
      from: "  if (opts.from === \"farSide\") {",
      to: "  if (false) {",
      expect: "T3.49",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
