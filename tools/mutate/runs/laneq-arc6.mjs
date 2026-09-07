// Lane Q, arc 6 — three small ones, mutated: the peek's scroll premise, the
// focused `plot3d` frame, and the notice that is a button.
//
// **Every mutation here is either a defect that shipped or the premise a ruling
// rests on.** `SCROLL-DETAIL` gives a scroll's element the `detail` the whole
// `SCROLL_PEEK` closure says it cannot have — the row that has to go red on that
// day is T4.13, and a run where it survives means the ruling is pinned by
// nothing. `PLOT3D-MUTED` is the frame as it shipped: `frameInk` for the lines
// under focus, zero rows differing. `NOTICE-ALWAYS` declares the element with or
// without an action, which is the shape that makes `↓` stop on every notice in a
// transcript; `NOTICE-NO-GROUND` drops the selection ground and paints the head
// `accent` alone, the `pills` collision one kind over. `NOTICE-UNCHECKED` lets a
// far side send `{ kind: "retry" }` and have it validate.
//
// Not run by Lane Q (COMMON.md); anchored for the lead's pass.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/integration/peek.test.ts test/integration/notice-action.test.ts " +
  "test/unit/render-focus.test.ts test/contract/view-model.test.ts test/unit/interaction-catalogue.test.ts";

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
    file: "src/shell/construct.ts",
    from: "    if (found === undefined || found.element.detail === undefined) return null;\n",
    to: "    if (found === undefined || found.element.detail !== undefined) return null;\n",
    why: "T4.10 asserts a peek is up on the cut row `a`; with the test inverted no peek ever appears — a run where this survives cannot see a kill",
  },
  mutations: [
    {
      name: "SCROLL-DETAIL: a scroll's element carries a detail, the state SCROLL_PEEK was closed as uninhabited",
      file: "src/presentation/blocks/kinds/containers.ts",
      from: "          copy: copyTextOf(r.child),\n        }),\n      ),\n    );\n  },\n\n  /**\n   * **No `window`, and the sweep is what said so**",
      to: "          copy: copyTextOf(r.child),\n          detail: r.child,\n        }),\n      ),\n    );\n  },\n\n  /**\n   * **No `window`, and the sweep is what said so**",
      expect: "T4.13",
    },
    {
      // F803 as it shipped: the frame cell keeps only the colour, so at 1-bit there is no weight.
      name: "PLOT3D-COLOUR-ONLY: the frame cell carries a colour and no weight",
      file: "src/presentation/plot/scatter3.ts",
      from: "    frameInkAt[cy * w + cx] = axisInk === undefined ? lineStyle : { ...lineStyle, colour: axisInk }; // cells-ok — a cell offset",
      to: "    frameInkAt[cy * w + cx] = { colour: axisInk ?? lineInk }; // cells-ok — a cell offset",
      expect: "T1.27",
    },
    {
      name: "PLOT3D-MUTED: the frame's lines keep `frameStyle` under focus — the frame as it shipped before focus",
      file: "src/presentation/plot/scatter3.ts",
      from: "  const lineStyle: Style = focused ? slot(\"tone.accent\", ctx.theme, ctx.capabilities) : frameStyle;",
      to: "  const lineStyle: Style = frameStyle;",
      expect: "T1.27",
    },
    {
      // Re-anchored with C09 I47: the gate is `declaresElement` — an action, or
      // a `GLYPH_ELEMENT` token — and the `activate` spread is now the shipped
      // form, so the `also` it carried is gone.
      name: "NOTICE-ALWAYS: the element is declared with or without an action",
      file: "src/presentation/blocks/kinds/simple.ts",
      from: "  if (!declaresElement(block)) return Object.freeze([]);\n  const w = normaliseWidth(width);\n",
      to: "  const w = normaliseWidth(width);\n",
      expect: "T4.17",
    },
    {
      name: "NOTICE-NO-GROUND: the focused notice is `accent` alone — the pills collision, one kind over",
      file: "src/presentation/blocks/kinds/simple.ts",
      from: "      ? { ...tone(\"accent\", ctx.theme, ctx.capabilities), ...selectionStyle(ctx.theme, ctx.capabilities) }\n      : tone(block.tone, ctx.theme, ctx.capabilities);\n",
      to: "      ? tone(\"accent\", ctx.theme, ctx.capabilities)\n      : tone(block.tone, ctx.theme, ctx.capabilities);\n",
      expect: "IC8",
    },
    {
      name: "NOTICE-UNCHECKED: the gate lets any `action` through on a notice",
      file: "src/data/viewmodel/validate.ts",
      from: "    if (b[\"action\"] !== undefined) checkAction(b[\"action\"], `${at}.action`, e);\n",
      to: "",
      expect: "T2.11b",
    },
    {
      name: "NOTICE-WRONG-ID: the focused paint tests `rowId === null`, the form no session writes",
      file: "src/presentation/blocks/kinds/simple.ts",
      from: "ctx.focus.blockId === block.id && ctx.focus.rowId === block.id;\n",
      to: "ctx.focus.blockId === block.id && ctx.focus.rowId === null;\n",
      expect: "T1.29",
    },
  ],
});

// `report` returns a string; it does not print (animation-proof.mjs's lesson).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
