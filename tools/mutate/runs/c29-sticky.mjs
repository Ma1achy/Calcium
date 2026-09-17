// C29 I21's sticky child, mutated (F1234).
//
// **The rows this pass tests read a frame, and the numbers agree either way.**
// A sticky child's `rect` is its flow rect whichever order it is collected in,
// so the solved tree is byte-identical with and without the field — T1.38
// asserts exactly that — and every claim the two rows make is one step removed
// from a position. A row like that can be green because the composer is right,
// or because the probe cannot see the difference.
//
// **The first mutation is this landing's own defect put back.** Collected last
// — the painter's reading §14 implies — produced a frame equal to the field
// being absent, and no assertion about a rect could have told. It is here to
// ask whether the rows can now see it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
// The engine has exactly one test file today — `grep -rl presentation/layout test/`
// returns one path — so the corpus is named rather than guessed at.
const CMD = "npx vitest run test/unit/layout-engine.test.ts";

const COMPOSE = "src/presentation/layout/compose.ts";
const SOLVE = "src/presentation/layout/solve.ts";

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
    file: COMPOSE,
    from: "    collect(child, x, oyOf, inner, out);",
    to: "    collect(child, dx, dy, inner, out);",
    why: "the sticky child takes the container's offset like every other child, so the field is read and changes nothing; T1.37's header scrolls away and the frame equals the one with no field at all",
  },
  mutations: [
    {
      // **This landing's own defect.** The two loops swapped: sticky collected
      // last, which is what a painter's compositor would want and what this one
      // cuts. Invisible to every rect.
      name: "sticky children are collected last rather than first",
      file: COMPOSE,
      from: `  for (const child of node.children) {
    if (child.sticky === undefined) continue;`,
      to: `  for (const child of node.children) {
    if (child.sticky !== undefined) continue;
    collect(child, dx, dy, inner, out);
  }
  for (const child of node.children) {
    if (child.sticky === undefined) continue;`,
      expect: "T1.38",
    },
    {
      // **The field never reaches the composer.** `freeze` is the only carrier,
      // and a dropped copy looks exactly like a `Box` that never declared it.
      name: "the field is not carried onto the solved box",
      file: SOLVE,
      from: "  ...(node.box.sticky === undefined ? {} : { sticky: node.box.sticky }),",
      to: "  ...{},",
      expect: "T1.37",
    },
    {
      // **Only one of the two values is honoured.** `"bottom"` falls back to
      // the `"top"` arm, so a footer sticks where flow put it — which for a
      // footer declared last is off the bottom of the container, drawing
      // nothing, and a row asserting only the header would agree.
      name: 'a "bottom" child is pinned like a "top" one',
      file: COMPOSE,
      from: '      child.sticky === "bottom" ? y + own.h - child.rect.height - child.rect.y : y; // cells-ok — a row count',
      to: "      y; // cells-ok — a row count",
      expect: "T1.37",
    },
    {
      // **The footer's arithmetic keeps the child's flow `y`.** It cancels
      // because the child is being placed against an origin rather than moved
      // from one; left in, a footer declared after twelve body rows lands
      // twelve rows past the edge and is clipped away entirely.
      name: "the bottom pin does not cancel the child's flow position",
      file: COMPOSE,
      from: "child.sticky === \"bottom\" ? y + own.h - child.rect.height - child.rect.y : y;",
      to: "child.sticky === \"bottom\" ? y + own.h - child.rect.height : y;",
      expect: "T1.37",
    },
    {
      // **The sticky child collected twice** — once at its own edge and once
      // with the offset, which is what a guard written as an addition rather
      // than a partition produces. The second piece is cut at most offsets and
      // not at all of them.
      name: "a sticky child is also collected with its scrolling siblings",
      file: COMPOSE,
      from: "    if (child.sticky === undefined) collect(child, dx, dy, inner, out);",
      to: "    collect(child, dx, dy, inner, out);",
      expect: "T1.37",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
