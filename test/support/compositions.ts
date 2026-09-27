// C10 §4k — the six compositions, as one case table (C10 I47, T2.48).
//
// **One table, two readers.** `test/golden/compositions.test.ts` draws every
// case that is not owed at every rung, and C10 T2.48 asks each case whether its
// frame answers its facts. A composition written twice — once as a frame and
// once as a watch — is two records of which the watch goes stale first: the
// field-name watch this replaced passed while `Panel.staleForMs` carried
// freshness, because it looked for a field called `stale`.
//
// **A case is a function of which facts hold**, not a fixed frame. `draw(caps,
// on)` builds the composition with the facts in `on` and without the rest, so
// the question *does this frame answer fact X* is one more call with X removed
// — the rule `test/support/README.md` states, that a fixture is shown to respond
// to the thing under test before anything is asserted against it.
//
// **An owed case carries the construction it would take**, written against the
// seam that would carry it, and T2.48 attempts it. While nothing reads that
// seam the removed fact changes nothing and the attempt reports *not
// constructible*; the day it does, the row fails until the frame is drawn.
import type { Block } from "../../src/data/viewmodel/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { callHead } from "../../src/shell/documents.js";
import { livePanel } from "../../src/shell/refresh.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { hunkOf, patchOf } from "./blocks.js";
import { ASCII_CAPS, FULL_CAPS, MONO_UNICODE_CAPS, measurable } from "./render.js";

export const RUNGS = [
  { name: "24-bit", capabilities: FULL_CAPS },
  { name: "1-bit", capabilities: MONO_UNICODE_CAPS },
  { name: "ascii", capabilities: ASCII_CAPS },
] as const;

export type Composition = Readonly<{
  /** §4k.2's row number, which the golden frames and MILESTONES.md cite. */
  row: number;
  /** §4k.2's own name for the row, bold in its first column — T2.48 holds the set equal to it. */
  name: string;
  /** The two facts that want the cell, in §4k.2's column order. */
  facts: readonly [string, string, ...string[]];
  /** The ruling the frame is checked against, one line. */
  ruling: string;
  /** Why no producer can construct it yet, or absent when the frame is drawn. */
  owed?: string;
  width: number;
  /** The composition with the facts in `on` and without the others. */
  draw: (capabilities: TerminalCapabilities, on: ReadonlySet<string>) => readonly string[];
  /** Kept in the snapshot because the record is the point (F1240); prose, not assertion. */
  notes?: readonly string[];
}>;

// Case 1 — a table row carrying three facts on one cell.
const COLUMNS = [
  { key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false },
  { key: "state", label: "State", align: "left", priority: 5, minWidth: 10, sortable: false },
];
const failed = (on: ReadonlySet<string>) =>
  on.has("failure")
    ? { text: "failed", tone: "error", glyph: "error" }
    : { text: "running", tone: "ok", glyph: "ok" };
const table = (on: ReadonlySet<string>) => ({
  kind: "table",
  id: "t",
  columns: COLUMNS,
  rows: [
    { id: "a", cells: { name: { text: "alpha" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
    { id: "b", cells: { name: { text: "bravo" }, state: failed(on) } },
    { id: "c", cells: { name: { text: "charlie" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
  ],
});

// Case 4 — a heatmap, whose ground is its reading. With the data's colour
// removed every cell holds one value, so the ramp paints one ground throughout.
const heat = (on: ReadonlySet<string>) => ({
  kind: "plot",
  id: "h",
  form: "heatmap",
  height: 3,
  axes: true,
  series: on.has("the data's own colour")
    ? [
        { values: [1, 4, 9, 16], label: "one" },
        { values: [16, 9, 4, 1], label: "two" },
        { values: [4, 4, 9, 9], label: "three" },
      ]
    : [
        { values: [4, 4, 4, 4], label: "one" },
        { values: [4, 4, 4, 4], label: "two" },
        { values: [4, 4, 4, 4], label: "three" },
      ],
});

// Case 6 — a refreshed panel whose reading is four minutes old, over a call
// still running. `livePanel` and `callHead` are the producers the shell uses,
// so the frame is the one a session draws and not a hand-built imitation.
const STALE_MS = 240_000;

export const COMPOSITIONS: readonly Composition[] = [
  {
    row: 1,
    name: "focused + selected + failed",
    facts: ["copy selection", "focus", "failure"],
    ruling: "selection takes the ground · focus keeps its mark · failure keeps its glyph, its word and its tone",
    width: 40,
    draw: (capabilities, on) =>
      measurable({
        capabilities,
        definitions: [tableDefinition],
        // Without focus the selection's head sits in a sibling block, which is
        // how the tree has a selection here and focus elsewhere (C11 I14).
        focus: {
          ...(on.has("focus") ? { blockId: "t", rowId: "b" } : { blockId: "elsewhere", rowId: "x" }),
          ...(on.has("copy selection") ? { selected: [{ blockId: "t", rowId: "b" }] } : {}),
        },
      }).renderToLines(table(on) as never, 40),
    notes: [
      "This frame reported two of row 1's three clauses for as long as it existed. A focused or",
      "selected row was repainted in ONE ink — accent, or default under selection — so `failed` kept",
      "✗ and the word and lost the error tone. The two halves of the remedy were one change and",
      "neither worked alone: C11 I14's drop-to-one-ink rule, and a painter that resolves a tone",
      "against the surface it lands on. `inkOn` was that resolver and was called only from",
      "`contrast.ts` — 74 of 100 tone x surface pairs were an ink the gate checked and the painter",
      "never emitted. C10 I48 gives `resolve` the ground, `inkOn` is its composition step, and the",
      "ink beside each ground above is the value C10 T2.49 measures the gate against.",
    ],
  },
  {
    row: 2,
    name: "hovering one link while another has keyboard focus",
    facts: ["hover preview", "focus"],
    ruling: "different cells, so no precedence · hover never takes ▸ · at 1-bit hover is bold and focus is ▸",
    // The attempt stays on a table row as the watch. A table row is a surface
    // the registry says does nothing under the pointer (R-PTR-003), so the day
    // this goes red the answer is the link, not a golden of this table.
    owed:
      "the subject is a link and none exists in the view model; R-PTR-003 admits hover on links, buttons and chips only, and links are built first as their own MR (C10 §4k.4)",
    width: 40,
    draw: (capabilities, on) =>
      measurable({
        capabilities,
        definitions: [tableDefinition],
        ...(on.has("focus") ? { focus: { blockId: "t", rowId: "c" } } : {}),
        // The seam this case waits on, attempted as the option it would be.
        ...(on.has("hover preview") ? { hover: { blockId: "t", rowId: "a" } } : {}),
      } as Parameters<typeof measurable>[0]).renderToLines(table(new Set()) as never, 40),
  },
  {
    row: 3,
    name: "selection over a diff ground",
    facts: ["copy selection", "a semantic extent"],
    ruling: "selection takes the ground · the diff keeps + and −",
    width: 40,
    // The added line selected with the head on it (C25 I24, I25). Without the
    // diff the same text is two context lines and the second is selected on the
    // page; without the selection, focus sits in a sibling block. The ids are
    // the lines' numbers — `:18` the addition, `19:19` the second context line
    // — because a positional id does not survive a window (C25 §3d).
    draw: (capabilities, on) => {
      const diff = on.has("a semantic extent");
      const id = diff ? ":18" : "19:19";
      return measurable({
        capabilities,
        definitions: [patchDefinition as never],
        focus: on.has("copy selection")
          ? { blockId: "p", rowId: id, selected: [{ blockId: "p", rowId: id }] }
          : { blockId: "elsewhere", rowId: "x" },
      }).renderToLines(
        patchOf({
          id: "p",
          language: "typescript",
          hunks: [hunkOf(diff ? ["-const a = 1", "+const b = 2"] : [" const a = 1", " const b = 2"])],
        }),
        40,
      );
    },
    notes: [
      "Owed until C25 I24 and I25: both facts shipped, and `patch` declared no elements and read",
      "ctx.focus nowhere, so no line could be selected. The owed attempt named the line `h0:1` — hunk",
      "0, line 1 — and that id does not survive a window, which hands the transcript a smaller patch",
      "whose first hunk is wherever the window starts. The ids are the lines' numbers now.",
    ],
  },
  {
    row: 4,
    name: "focus over a heatmap ground",
    facts: ["focus", "the data's own colour"],
    ruling: "nothing is contested · the border and the axes take the focus · the data keeps its reading",
    width: 40,
    draw: (capabilities, on) =>
      measurable({
        capabilities,
        definitions: [plotDefinition],
        // **`rowId: "h"` and not `null`** (F802): a plot reads `rowId === block.id`,
        // the block as its own element. The null form painted nothing, and this
        // case composed two byte-identical frames for as long as it used it.
        ...(on.has("focus") ? { focus: { blockId: "h", rowId: "h" } } : {}),
      }).renderToLines(heat(on) as never, 40),
  },
  {
    row: 5,
    name: "disabled + error",
    facts: ["availability", "validity"],
    ruling: "the well takes the ground \u00b7 the error keeps its mark and its word",
    width: 40,
    // A form field is the subject (C04 I140): it carries validity already, and
    // `\u21e5` moving between fields is the skip R-STA-004 argues from. An
    // enabled field beside it is the control a reader compares against.
    draw: (capabilities, on) =>
      measurable({ capabilities }).renderToLines(
        {
          kind: "form",
          id: "f",
          fields: [
            { id: "name", label: "name", value: "web" },
            {
              id: "port",
              label: "port",
              value: "80a",
              ...(on.has("availability") ? { availability: "disabled" } : {}),
              ...(on.has("validity") ? { error: "not a port number" } : {}),
            },
          ],
        } as never,
        40,
      ),
  },
  {
    row: 6,
    name: "stale + running",
    facts: ["freshness", "liveness"],
    ruling: "nothing is contested · staleness dims the content and names its age · the spinner keeps the duration slot",
    width: 48,
    draw: (capabilities, on) => {
      const call = on.has("liveness")
        ? { name: "pytest", args: "tests/unit", id: "c", elapsedMs: 4_000 }
        : { name: "pytest", args: "tests/unit", id: "c", elapsedMs: 4_000, outcome: "47 passed" };
      const panel: Block = livePanel(
        "w",
        "workers",
        callHead(call, capabilities, 0),
        on.has("freshness") ? STALE_MS : undefined,
      );
      return measurable({ capabilities }).renderToLines(panel, 48);
    },
  },
];

/**
 * Whether a case's frame answers each of its facts at one rung: for every fact,
 * the frame with it differs from the frame without it.
 *
 * **A throw is an answer, and it is *no***: an owed case attempted against a
 * seam that does not exist may be refused by validation, and that is the case
 * not being constructible — reported with the message, so a throw for some
 * other reason is visible rather than read as a quiet *no*.
 */
export function responds(
  c: Composition,
  capabilities: TerminalCapabilities,
): Readonly<{ fact: string; answers: boolean; why?: string }[]> {
  const all = new Set(c.facts);
  let whole: readonly string[];
  try {
    whole = c.draw(capabilities, all);
  } catch (e) {
    return c.facts.map((fact) => ({ fact, answers: false, why: String(e) }));
  }
  return c.facts.map((fact) => {
    const without = new Set(all);
    without.delete(fact);
    try {
      const rest = c.draw(capabilities, without);
      return { fact, answers: whole.length > 0 && rest.join("\n") !== whole.join("\n") };
    } catch (e) {
      return { fact, answers: false, why: String(e) };
    }
  });
}
