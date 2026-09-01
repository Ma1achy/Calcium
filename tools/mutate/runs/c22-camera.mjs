// C22 I71 — the camera's three parts, and whether the rows can tell them apart.
//
// **A camera reaching a frame needs three things**: a store whose key says it
// moved, a binding that writes the store, and `session.ts` composing the key
// into the slot. An end-to-end row dies to all three and says which is broken
// for none of them — which is `xDomain`'s and `legendPlacement`'s shape, twice
// already this arc.
//
// So the question this run asks is not *is the camera wired*. It is **which
// mutations land on which rows**, and that was measured with a control rather
// than inferred from these `expect` strings — an expectation is satisfied by its
// row failing whether or not three others failed beside it.
//
//     mutation                     rows that fail
//     the key goes quiet           T4.17e · T4.17g · T4.17h
//     the binding is removed       T4.17f · T4.17g · T4.17h
//     a plot declares no element   T4.17f · T4.17g · T4.17h
//     the context is unpopulated   T4.17h
//     the slot drops the axis      T4.17g · T4.17h
//     control, unmutated           (none)
//
// **Three parts isolate and one does not.** T4.17e, T4.17f and T4.17h each fail
// for exactly one reason; **the slot fails nothing alone**, because dropping it,
// emptying the key and removing the binding all produce one observable — no
// re-render. A second writer is what would separate them, and auto-orbit is that
// writer (step 8).
//
// The first draft of this comment claimed T4.17g was the slot's only witness.
// T4.17h is also one, and the difference between *stated* and *measured* is the
// whole of why the table is here.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/render-cache.test.ts test/integration/render-cache.test.ts";
const CAMERAS = "src/shell/cameras.ts";
const KEYMAP = "src/interaction/router/keymap.ts";
const SESSION = "src/shell/session.ts";
const PLOT = "src/presentation/plot/definition.ts";

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
    file: CAMERAS,
    // The step the writer takes, asserted to ten places by T4.17f. A control has
    // to be a thing the suite asserts rather than merely a change to the subject
    // — the tmux run's first control was an unused table entry and the harness
    // refused it.
    from: "        azimuth: from.azimuth + (delta.azimuth ?? 0),",
    to: "        azimuth: from.azimuth + (delta.azimuth ?? 0) + 1,",
    why: "T4.17f asserts the resulting azimuth to ten places; a run where changing it survives cannot see a kill",
  },
  mutations: [
    {
      // **The key alone.** The store still records the turn and the binding
      // still writes it; only the discriminator goes quiet.
      name: "the key says nothing ever moved",
      file: CAMERAS,
      from: "    if (live.length === 0) return \"\";",
      to: "    return \"\";\n    if (live.length === 0) return \"\";",
      expect: "T4.17e",
    },
    {
      // **The zeros rule, which is the one this store could NOT inherit from
      // `ScrollOffsets`.** There zero is the absent state; here the absent state
      // is the block's declared view. This mutation is the copied line.
      name: "baselines are kept and zeros omitted, as ScrollOffsets does it",
      file: CAMERAS,
      from: "    const live = [...held].filter(([, h]) => !same(h.camera, h.baseline));",
      to: "    const live = [...held].filter(([, h]) => h.camera.azimuth !== 0);",
      expect: "T4.17e",
    },
    {
      // **The writer alone.** The key still discriminates and the slot still
      // carries it; nothing can move a camera.
      name: "the binding is gone",
      file: KEYMAP,
      from: '  { target: "liveBlock", key: { name: "[" }, action: "orbitLeft" },',
      to: "",
      expect: "T4.17f",
    },
    {
      // **A plot with no element cannot be focused, so the binding cannot fire**
      // — which is the state the whole arc was in before C12 I85, and the one
      // that made the writer unreachable while every reference existed.
      name: "a plot declares no elements, as it did before C12 I85",
      file: PLOT,
      from: "  if (block.camera === undefined) return NO_ELEMENTS;",
      to: "  return NO_ELEMENTS;\n  if (block.camera === undefined) return NO_ELEMENTS;",
      expect: "T4.17f",
    },
    {
      // **The context field is not populated** — `cursorPositions`' exact state,
      // and the mutation that says T4.17h is about population rather than about
      // the type.
      name: "the render context is built without the cameras",
      file: SESSION,
      from: "          cameras: graph.cameras.forEntry(entry.id),",
      to: "",
      expect: "T4.17h",
    },
    {
      // **The slot, and it has one witness.** Stated rather than discovered: the
      // composition is observable only through a re-render, a re-render needs a
      // camera to change, and there is one writer. T4.17g is the row; a second
      // arrives with auto-orbit.
      name: "the slot drops the camera axis",
      file: SESSION,
      from: "    const slot = `${key}\\u0000${range}\\u0000${offsets}\\u0000${orbits}${animated}`;",
      to: "    const slot = `${key}\\u0000${range}\\u0000${offsets}${animated}`;",
      expect: "T4.17g",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
