// The head mark under a banded selection (C14 I54, C09 I45, `R-THM-005`).
//
// **Every mutation here leaves a selection that washes and a head that
// draws.** The ground and the band's ink are I53's and untouched; what changes
// is whether the renderer learns a head is washed, and whether the cache lets
// it redraw when it does.
//
// The axis is the one to watch: without it the head is resolved correctly and
// served from before the selection, which is a correct frame — the previous
// one — and reads as the renderer being wrong.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/render-focus.test.ts test/integration/copy-drag.test.ts";
const NOTICE = "src/presentation/blocks/kinds/simple.ts";
const SESSION = "src/shell/session.ts";
const LINES = "src/presentation/render-lines.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The renderer ignores the wash**, as it shipped: `●` in the band's one
    // ink for every state under the selection.
    name: "a washed head is not counted as on a band",
    file: NOTICE,
    from: '                            (ctx.washed?.has(block.id) === true && isBand(ctx.theme, "selection")),',
    to: "                            false,",
    expect: "T1.75b",
  },
  {
    // **The cache axis omitted.** The render is right and never reached: the
    // slot from before the selection is served, so the head keeps `●`.
    name: "the washed set is rendered but not keyed",
    file: SESSION,
    from: "    const washedKey = washed === undefined ? \"\" : `\\u0000${[...washed].sort().join(\"\\u0001\")}`;",
    to: '    const washedKey = "";',
    expect: "T4.37f",
  },
  {
    // **The field dropped by the options' field list** — the partially
    // populated context the session's own comment describes.
    name: "renderToLines does not pass washed through",
    file: LINES,
    from: "    ...(options.washed === undefined ? {} : { washed: options.washed }),\n    ...(options.scrollOffsets === undefined ? {} : { scrollOffsets: options.scrollOffsets }),\n    ...(options.cursorPositions === undefined ? {} : { cursorPositions: options.cursorPositions }),\n    ...(options.cameras === undefined ? {} : { cameras: options.cameras }),\n    ...(options.frames === undefined ? {} : { frames: options.frames }),\n    ...(options.placementScope === undefined ? {} : { placementScope: options.placementScope }),\n    ...(options.seriesVisibility === undefined ? {} : { seriesVisibility: options.seriesVisibility }),\n    ...(options.scratch === undefined ? {} : { scratch: options.scratch }),\n    tick: options.tick ?? 0,\n    ...(options.probe === undefined ? {} : { probe: options.probe }),\n  };\n\n  const probe",
    to: "    ...(options.scrollOffsets === undefined ? {} : { scrollOffsets: options.scrollOffsets }),\n    ...(options.cursorPositions === undefined ? {} : { cursorPositions: options.cursorPositions }),\n    ...(options.cameras === undefined ? {} : { cameras: options.cameras }),\n    ...(options.frames === undefined ? {} : { frames: options.frames }),\n    ...(options.placementScope === undefined ? {} : { placementScope: options.placementScope }),\n    ...(options.seriesVisibility === undefined ? {} : { seriesVisibility: options.seriesVisibility }),\n    ...(options.scratch === undefined ? {} : { scratch: options.scratch }),\n    tick: options.tick ?? 0,\n    ...(options.probe === undefined ? {} : { probe: options.probe }),\n  };\n\n  const probe",
    expect: "T1.75b",
  },
  {
    // **The session never supplies the field.** The renderer and the axis are
    // both right and nothing reaches them.
    name: "the session renders without the washed set",
    file: SESSION,
    from: "        ...(washed === undefined ? {} : { washed }),\n",
    to: "",
    expect: "T4.37f",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): every head in a
    // banded theme counts as washed, so the page loses its `●`.
    file: NOTICE,
    from: '                            (ctx.washed?.has(block.id) === true && isBand(ctx.theme, "selection")),',
    to: '                            isBand(ctx.theme, "selection"),',
    why:
      "every head on a banded theme takes its state's mark, so the rows " +
      "asserting the page keeps ● fail — if this survives, nothing reaches the head",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
