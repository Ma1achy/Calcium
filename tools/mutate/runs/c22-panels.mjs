// C22 I151, I143 and C20 I30 — the transient panels (§097, §101; F1501–F1503).
//
// **Three owners of one shape**, so each mutation attacks a clause one panel
// would still draw plausibly without: the ground, the edge the ground stops at,
// the kind it is keyed on, the preview's cap and its legend, and find's width,
// edge and caret. A mutation that fails nothing indicts the tests or the prose,
// not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const COMPOSITE = "src/shell/composite.ts";
const CONSTRUCT = "src/shell/construct.ts";
const LAYERS = "src/interaction/history/layers.ts";
const FILES =
  "test/unit/session-composite.test.ts test/integration/panels.test.ts test/unit/chip-preview.test.ts " +
  "test/unit/history.test.ts test/integration/history.test.ts";

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
    // **A change the run's own corpus can see** (F1254): every layer drawn
    // blank. If this survives, nothing below reaches a frame.
    file: COMPOSITE,
    from: "  for (let i = 0; i < p.height; i += 1) out.push(exact(lines[from + i] ?? \"\", p.width));",
    to: "  for (let i = 0; i < p.height; i += 1) out.push(exact(\"\", p.width));",
    why: "every layer is drawn blank, so the panels, the edges and the hits are all gone — if this survives, the rows are not reading the frames they think they are",
  },
  mutations: [
    {
      // T6.153 (C22 I151) — THE DEFECT: no panel paints a ground (F1501).
      name: "THE DEFECT: no panel takes bgElev",
      file: COMPOSITE,
      from: "  if (p.layer.kind !== \"panel\") return rows;",
      to: "  return rows;",
      expect: "T1.184",
    },
    {
      // T6.154 (C22 I151) — the edge grounded: the rule is inside the panel.
      name: "the panel's leading rule takes the ground too",
      file: COMPOSITE,
      from: "  const cut = Math.min(rows.length, Math.max(0, edge - from));",
      to: "  const cut = 0;",
      expect: "T1.184",
    },
    {
      // C22 I151, §6s.2 row 6 — keyed on the wrong axis: every layer but an overlay.
      name: "a peek takes the panel's ground",
      file: COMPOSITE,
      from: "  if (p.layer.kind !== \"panel\") return rows;",
      to: "  if (p.layer.kind === \"overlay\") return rows;",
      expect: "T1.184",
    },
    {
      // T6.155 (C22 I143) — the cap counts no residue row, so the layer is cut (F1503).
      name: "the overflowing box is capped at floor(h / 2) − 3",
      file: CONSTRUCT,
      from: "previewBox(chip, Math.max(1, half - 4))",
      to: "previewBox(chip, Math.max(1, half - 3))",
      expect: "T1.175",
    },
    {
      // T6.156 (C22 I143) — the legend offered with nothing for it to reach.
      name: "←→ other chips is offered with one chip",
      file: CONSTRUCT,
      from: "stores.editor.drawAs).length > 1;",
      to: "stores.editor.drawAs).length > 0;",
      expect: "T1.185",
    },
    {
      // C22 I143 — the key row not rebuilt when only the other chips change.
      name: "the preview is not rebuilt when the other chips change",
      file: CONSTRUCT,
      from: " && others === previewedOthers) return;",
      to: ") return;",
      expect: "T1.185",
    },
    {
      // T6.27 (C20 I30) — the width declared at the push again (F1502).
      name: "find declares its width from the line at the push",
      file: LAYERS,
      from: "    owner: Object.freeze({ rung: \"substate\" as const, name: \"find\" as const }),\n",
      to: "    owner: Object.freeze({ rung: \"substate\" as const, name: \"find\" as const }),\n    width: cells(searchLine(state)) + 4,\n",
      expect: "T4.9",
    },
    {
      // T6.28 (C20 I30) — find without its upper edge.
      name: "find draws no rule above its line",
      file: LAYERS,
      from: "    { kind: \"rule\", id: `${SEARCH_ID}-edge-top`, label: \"\" } satisfies Block,\n",
      to: "",
      expect: "T1.21",
    },
    {
      // C20 I30, C15 I19 — the caret on the rule's row.
      name: "find's caret stays on row 0",
      file: LAYERS,
      from: "    cursor: Object.freeze({ row: 1, col: cells(queryPrefix(state)) }),",
      to: "    cursor: Object.freeze({ row: 0, col: cells(queryPrefix(state)) }),",
      expect: "T1.21",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
