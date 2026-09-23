// C26 I24, I25 — the pull, and the tape's ceiling (§7a, §021, §095).
//
// **The mutations here are the two orderings and the two directions**, which is
// the whole content of a rule that says *by the minimum*. Every one of them
// draws a legal frame: a window containing the target is containment, and
// containment is satisfied by every wrong answer that is big enough.
//
// The two that matter are the ones the rows were written against. `THE DEFECT:
// the start rule first` shows a tall target's tail, which reads as correct until
// you ask which end a reader entering a long thing wants. And `the pull fires on
// every viewport change` is the one that makes the other half of §7a — *scrolling
// never moves focus* — true and useless, because it makes scrolling move nothing
// at all.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const PULL = "src/shell/pull.ts";
const WINDOW = "src/presentation/blocks/tape-window.ts";
const CONSTRUCT = "src/shell/construct.ts";
const FILES =
  "test/unit/focus-pull.test.ts test/unit/tape.test.ts " +
  "test/integration/focus-pull-wiring.test.ts test/contract/scroll-follow.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
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
    // **A change every row can see** (F1254): the pull returns the held start
    // whatever is asked of it, so no window ever moves and the box never
    // reaches the focused row.
    file: PULL,
    from: "  if (window <= 0) return held; // cells-ok — a row count",
    to: "  return held; // cells-ok — a row count\n  // eslint-disable-next-line no-unreachable",
    why: "no window ever moves, so the focused row is never revealed and the sweep's reference disagrees wherever the target is outside",
  },
  mutations: [
    {
      // **THE DEFECT the ruling exists to forbid.** Applying the start rule
      // before the end rule is self-consistent and shows a tall target's
      // **tail** — the bottom of a long block rather than its head, which is
      // where a reader entering it is not.
      name: "THE DEFECT: the start rule is applied before the end rule, so a tall target shows its tail",
      file: PULL,
      from: "  if (to > start + window) start = to - window;\n  // Begins before it",
      to: "  if (from < start) start = from;\n  if (to > start + window) start = to - window;\n  if (false) // Begins before it",
      expect: "T1.48",
    },
    {
      // **The pull is a jump rather than a distance.** Centring the target reads
      // as generous and moves the window when nothing asked it to — one row for
      // half a screen, which is the behaviour §021's *by the minimum* names.
      name: "the window centres the target rather than moving the least distance",
      file: PULL,
      from: "  if (to > start + window) start = to - window;",
      to: "  if (to > start + window || from < start) start = Math.floor((from + to - window) / 2);",
      expect: "T1.48",
    },
    {
      // **A target already inside moves the window anyway**, which is the
      // cursor dragging the row along — §095's first paragraph, one axis over.
      name: "a target already inside the window still moves it",
      file: PULL,
      from: "  if (from < start) start = from;",
      to: "  start = from;",
      expect: "T1.48",
    },
    {
      // **A collapsed container is given a position.** There is no start that
      // reveals a target in zero rows, so any answer here is a number chosen
      // rather than a distance measured — and it puts a box with no interior
      // somewhere its residue row does not describe.
      name: "a window of nothing is moved to the target",
      file: PULL,
      from: "  if (window <= 0) return held; // cells-ok — a row count",
      to: "  if (window < 0) return held; // cells-ok — a row count",
      expect: "T1.48",
    },
    {
      // **THE OTHER DEFECT, and it is the half that is a refusal** (C26 I24).
      // Re-deriving the pull on every viewport change undoes a scroll a frame
      // after it happens: the reader pages the box and the projection drags it
      // straight back. *Scrolling never moves focus* is then satisfied and
      // empty, because scrolling moves nothing.
      name: "THE DEFECT: the pull fires on every viewport change rather than when focus moves",
      file: CONSTRUCT,
      from: "    if (where === pulledTo) return;\n    pulledTo = where;",
      to: "    pulledTo = where;",
      expect: "T4.31",
    },
    {
      // **The box's held offset is read as the store's number rather than as
      // the renderer's**, and this is the one that survived the first pass —
      // not for a weak anchor but because no row in the tree built a
      // **following** box with focus in it. An untouched follow box opens at
      // its tail and holds nothing, so `get` answers `0`, the pull computes no
      // move from there, writes nothing, and the box stays at its tail with
      // focus on its first row. T4.33 is that state, constructed.
      name: "the pull reads the stored offset rather than the one the renderer resolves",
      file: CONSTRUCT,
      from: "    const held = stores.scrollOffsets.resolved(entry.id, box.id, geometry);",
      to: "    const held = stores.scrollOffsets.get(entry.id, box.id);",
      expect: "T4.33",
    },
    {
      // **The tape's start is never persisted**, which is the whole of C26 I25:
      // the arithmetic stays correct and the window recomputes from the head
      // every frame, so room that appeared is given back for the wrong reason
      // and a window that had slid snaps.
      name: "the tape's window is recomputed from the head rather than from the held start",
      file: "src/presentation/blocks/kinds/tape.ts",
      from: "      ctx.scrollOffsets?.[block.id] ?? 0,",
      to: "      0,",
      expect: "T1.50",
    },
    {
      // **THE CEILING, and it was the shipped defect** (C04 I125). A start
      // written while the terminal was narrow survives a widening, so the
      // reader gets `«5` beside a row's worth of empty space.
      name: "THE DEFECT: the held start has no ceiling, so widening keeps the mark",
      file: WINDOW,
      from: "  let held = Math.min(Math.max(0, Math.trunc(from)), n - 1); // cells-ok — a member index\n  for (let c = 0; c <= held; c += 1) {",
      to: "  let held = Math.min(Math.max(0, Math.trunc(from)), n - 1); // cells-ok — a member index\n  for (let c = held; c <= held; c += 1) {",
      expect: "T4.32",
    },
    {
      // **The ceiling as a walk back rather than a minimum over candidates**,
      // which is `grow while it fits` one bound over: backing past the first
      // member removes the `«n` the later starts were paying for, so a start
      // that does not fit sits between two that do (`1 3 9 5` at 24 from 2).
      name: "the ceiling stops at the first start that does not fit",
      file: WINDOW,
      from: "  for (let c = 0; c <= held; c += 1) {\n    if (cost(c, n) <= room) {\n      held = c;\n      break;\n    }\n  }",
      to: "  while (held > 0 && cost(held - 1, n) <= room) held -= 1;",
      expect: "T1.49",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
