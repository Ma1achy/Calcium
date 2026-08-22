// C09 I34 — the height fits the message, and the cut says so.
//
// **The first mutation is the one this run exists for.** Wrapping at `width`
// rather than `width - 4` under-requests: the number stays plausible, `measure`
// and `render` still agree on it, `reserveNeeded` still terminates, and the
// only thing that says otherwise is the last line of the message being absent.
// **Every count agrees and the frame does not** — the class this component has
// produced four times now, and the reason its rows read from the figure.
//
// **The ellipsis pair is a boundary and both sides are here.** A mark that never
// appears is a silent cut, which is what this replaces; a mark that appears on a
// complete message claims a truncation that did not happen and sends the reader
// to the sink for text already on screen. The second is worse, so `>` is
// mutated to `>=` rather than the mark simply being deleted.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const STATUS = "src/presentation/blocks/kinds/status.ts";
const REG = "src/presentation/blocks/registry.ts";
const FAULTS = "src/shell/block-faults.ts";

const FILES = "test/edge/status.test.ts test/integration/deferred-height.test.ts";

// Atomic, through the shared pair (F237).
const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
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
    file: STATUS,
    from: "export const MESSAGE_LINE_CAP = 4;",
    to: "export const MESSAGE_LINE_CAP = 0;",
    why: "no message row is ever asked for, so every fitted box collapses to its furniture",
  },
  mutations: [
    {
      // **The under-request, and it must fail on a frame.** `width` is four cells
      // wider than the top rung's content, so the message wraps to fewer lines
      // than it will actually need and the last one is cut. The number is
      // plausible, C09 I1 still holds, and only the missing text says so.
      name: "the fitter wraps at the full width instead of the top rung's content width",
      file: STATUS,
      from: "  const textWidth = Math.max(1, rowWidth - 2 * (rung.frame.pad ? PAD : 0)); // cells-ok — a cell count",
      to: "  const textWidth = Math.max(1, rowWidth); // cells-ok — a cell count",
      expect: "T3.60",
    },
    {
      // The cap gone, so a stack trace makes a box as tall as the exception is
      // long — and inside a bounded container that is an unbounded over-draw
      // (F239).
      name: "the message cap is removed",
      file: STATUS,
      from: "  const rows = Math.min(MESSAGE_LINE_CAP, Math.max(1, wrapped)); // cells-ok — a row count",
      to: "  const rows = Math.max(1, wrapped); // cells-ok — a row count",
      expect: "T3.63",
    },
    {
      // Back to the silent slice, at every height and not only at the cap.
      name: "a cut carries no mark",
      file: STATUS,
      from: "  if (lines.length <= forMessage) return lines; // cells-ok — a row count, not a width",
      to: "  return lines.slice(0, forMessage); // cells-ok — a row count, not a width",
      expect: "T3.62",
    },
    // **A row that is not here, and why.** The other side of the boundary — a
    // mark on a message that is complete — was written as `<=` becoming `<` and
    // **survived**, because at equality the two branches are the same function:
    // `slice(0, n - 1)` plus a `join` of a single-element tail is the original
    // list, and `truncate` of a row that already fits returns it unchanged. The
    // mutation could not be killed because there is no difference to kill. The
    // property rests on the join degenerating to identity rather than on the
    // comparison, which is stronger than a guard — and a revert row against a
    // comparison that cannot be wrong is A03 §2's vacuity class in the tier
    // built to prevent it.
    {
      // The tag counted whether or not the width can hold it, so the box asks
      // for a row it will not draw and C09 I1's pair parts company.
      name: "the request assumes a tag the width cannot afford",
      file: STATUS,
      // **Caught on the slack and not on the row count.** Counting a tag the
      // width will not draw does not make `measure` and `render` disagree — the
      // box takes another blank row — so a length assertion passes on it. What
      // it breaks is *at worst one row of slack*, which is what T3.64 reads.
      from: "  const tagRows = rung.frame.tag && rung.tag !== \"none\" ? 1 : 0;",
      to: "  const tagRows = rung.frame.tag ? 1 : 0;",
      expect: "T3.64",
    },
    {
      // **The fault stops carrying a number** — the state before this, where the
      // shell imported a constant it had no way to compute.
      name: "the render fault asks for one row rather than what it needs",
      file: REG,
      from: "        statusRowsFor(errorStatus(text, 1), width, childContext.capabilities),",
      to: "        1,",
      expect: "T4.57",
    },
    {
      // Two faults on one block: a short `measure` message overwriting a long
      // `render` one would shorten the box the reader actually needs.
      name: "the smaller of two faults on one block wins",
      file: FAULTS,
      from: "    if (held !== undefined && held.rows >= fault.rows) return;",
      to: "",
      expect: "T4.58",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
