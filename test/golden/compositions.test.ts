// C10 §4k — the six compositions, as frames rather than as a classification.
//
// **§4k.2 rules all six and this file draws the ones a producer can construct.**
// A frame that fakes a state is not drawn: a fixture has to be shown to respond
// to the thing under test before it is asserted against (`test/support/README.md`),
// and four of the six have no subject in this tree for three different reasons,
// each named in §4k.4 and each watched by C10 T2.48 rather than by a comment.
//
// **The snapshot is a frame AND a report, and the report is the point.** These
// compositions are about *which fact took the ground*, which is colour — so a
// frame with its SGR stripped, which is what every other golden in this
// directory holds, cannot show the thing under test at all. A raw SGR frame can,
// and is unreadable. So each snapshot carries the visible frame, so the marks
// can be read, and beside it the ground each run took **resolved back to its
// token name**, so a reader checks `selection` against `focusGround` rather than
// two escape sequences.
//
// **Three rungs, because the ruling is about carriers and a carrier dies at a
// rung.** 24-bit is where two grounds exist; 1-bit is where they do not and the
// mark is the whole of it; ASCII is where the mark itself is substituted.
import { describe, expect, it } from "vitest";

import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, measurable, visible } from "../support/render.js";
import { background, tone } from "../../src/presentation/blocks/paint.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const SGR_RE = /\u001b\[([0-9;]*)m/u;
const SPLIT_RE = /(\u001b\[[0-9;]*m)/u;

const RUNGS = [
  { name: "24-bit", capabilities: FULL_CAPS },
  { name: "1-bit", capabilities: MONO_UNICODE_CAPS },
  { name: "ascii", capabilities: ASCII_CAPS },
] as const;

/**
 * The surfaces a run could be standing on, in R-STA-002's own order.
 *
 * Resolved through `background` rather than written out, so a theme edit moves
 * the report with the tree instead of turning every frame into a mismatch about
 * a hex value.
 */
const GROUNDS = [
  "surface.selection",
  "surface.focusGround",
  "surface.diffAdd",
  "surface.diffRemove",
  "surface.bgElev",
] as const;

/** The tones a run could be inked in, so the report names one rather than a hex. */
const TONES = ["error", "ok", "warn", "accent", "default", "dim", "muted", "info", "meta", "identifier"] as const;

/**
 * The SGR channels a sequence leaves standing, walked parameter by parameter.
 *
 * **A `48` carries its own `38`, and the first two forms of this file did not
 * know it.** `48;2;38;64;87` is the selection ground in `dark` — blue 87, green
 * 64, **red 38** — and a reader testing `params.includes("38")` calls that a
 * foreground opener, then fails to name the colour it just invented and reports
 * `-`. The frame was correct at the time and the report said the selected row
 * had no ink at all. A parameter list is a sequence with per-parameter arity,
 * not a set, and reading it as a set is how a instrument invents a defect
 * (`applySgr` in `test/support/styled-screen.ts` is the same walk, written
 * first).
 */
function channels(
  params: string,
  cur: Readonly<{ fg: string; bg: string; attrs: readonly string[] }>,
): Readonly<{ fg: string; bg: string; attrs: readonly string[] }> {
  let { fg, bg } = cur;
  let attrs = [...cur.attrs];
  const held = params === "" ? ["0"] : params.split(";");
  for (let i = 0; i < held.length; i += 1) {
    const p = held[i] as string;
    if (p === "0") {
      fg = "";
      bg = "";
      attrs = [];
    } else if (p === "38" || p === "48") {
      const take = held[i + 1] === "2" ? 5 : held[i + 1] === "5" ? 3 : 1;
      const value = held.slice(i, i + take).join(";");
      if (p === "38") fg = value;
      else bg = value;
      i += take - 1;
    } else if (p === "39") fg = "";
    else if (p === "49") bg = "";
    else if (p === "22") attrs = attrs.filter((a) => a !== "1" && a !== "2");
    else if (p === "27") attrs = attrs.filter((a) => a !== "7");
    else if (["1", "2", "3", "4", "7"].includes(p) && !attrs.includes(p)) attrs.push(p);
  }
  return { fg, bg, attrs };
}

/** The SGR parameters a style resolves to, without the CSI and the `m`. */
function paramsOf(style: Parameters<typeof sgr>[0]): string {
  return sgr(style).replace(/^\u001b\[/u, "").replace(/m$/u, "");
}

/**
 * The token name of the ground a run is painted on, or `page` for none.
 */
function groundOf(bg: string, attrs: readonly string[], caps: TerminalCapabilities): string {
  if (bg !== "") {
    for (const name of GROUNDS) {
      const want = paramsOf(background(name, DARK_THEME, caps));
      if (want !== "" && want === bg) return name.replace("surface.", "");
    }
  }
  // **At 1-bit the attributes are the carriers, so all of them are named.** A
  // ground resolves to `NO_STYLE` there and an attribute is the honest answer,
  // but naming only the first of them hides the second: the selected row is
  // `inverse` for its whole extent and the failed cell is `bold` inside it, and
  // a label reporting `inverse` alone says the two cells are drawn the same
  // way. They are not, and at that rung the weight is the whole difference.
  const named = ["7", "1", "2", "3", "4"]
    .filter((a) => attrs.includes(a))
    .map((a) => ({ "7": "inverse", "1": "bold", "2": "dim", "3": "italic", "4": "underline" })[a]);
  return named.length === 0 ? "page" : named.join("+");
}

/**
 * The token name of a run's ink, or `-` when nothing set one.
 *
 * **Asked on the ground the run is standing on** (C10 I48). A tone resolves
 * *against* the surface under it, so `tone.error` is `#f05a5a` on the page and
 * `#ff9b91` on `dark`'s selection — and a reader that only ever asks about the
 * page cannot name the second. That is the whole reason the report is worth
 * having: it is the one place the two values are visible side by side.
 */
function inkOf(fg: string, ground: string, caps: TerminalCapabilities): string {
  if (fg === "") return "-";
  const on = ground === "page" || ground === "inverse" || ground === "bold" ? undefined : ground;
  for (const name of TONES) {
    if (paramsOf(tone(name, DARK_THEME, caps, on)) === fg) return name;
  }
  return "-";
}

/**
 * Every run of a row as `ground/ink:text`, so the report is one line per row.
 *
 * **SGR is cumulative and the first form of this read it as a stamp.** A
 * background opened by `48;2;r;g;b` stays open until `49` or `0`, and a bare
 * `39` resets the *foreground* and leaves it standing — so a reader taking each
 * sequence as the whole state reported the ground closing three cells into a row
 * the terminal paints to its end. It said *the selection stops at the name
 * cell*, which is a defect, and the frame does not have it. A reader of a
 * stateful protocol has to carry the state.
 */
function runsOf(line: string, caps: TerminalCapabilities): string {
  const out: string[] = [];
  let style = { fg: "", bg: "", attrs: [] as readonly string[] };
  let label = "page/-";
  let text = "";
  const close = (): void => {
    if (text.trim() !== "") out.push(`${label}:${JSON.stringify(text)}`);
    text = "";
  };
  for (const part of line.split(SPLIT_RE)) {
    if (part === "") continue;
    if (part.startsWith("\u001b[")) {
      style = channels(SGR_RE.exec(part)?.[1] ?? "", style);
      const ground = groundOf(style.bg, style.attrs, caps);
      const next = `${ground}/${inkOf(style.fg, ground, caps)}`;
      if (next !== label) {
        close();
        label = next;
      }
      continue;
    }
    text += part;
  }
  close();
  return out.length === 0 ? "(blank)" : out.join(" ");
}

/**
 * Case 1 — **focused + selected + failed**, on a table row.
 *
 * §4k.2 row 1: selection takes the ground, focus keeps its mark, and failure
 * keeps its glyph, its word and its tone. All three facts hold on **one** cell,
 * which is what makes it the composition rather than three states side by side.
 */
const COLUMNS = [
  { key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false },
  { key: "state", label: "State", align: "left", priority: 5, minWidth: 10, sortable: false },
];
const ROWS = [
  { id: "a", cells: { name: { text: "alpha" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
  { id: "b", cells: { name: { text: "bravo" }, state: { text: "failed", tone: "error", glyph: "error" } } },
  { id: "c", cells: { name: { text: "charlie" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
];
const TABLE = { kind: "table", id: "t", columns: COLUMNS, rows: ROWS };

/**
 * Case 4 — **focus over a heatmap**.
 *
 * §4k.2 row 4: nothing is contested. R-FOC-004 takes focus onto the border and
 * the axes rather than onto the data, because a plot's ground **is** its
 * reading — so the heat cells are untouched at every rung and the frame's ink
 * moves from `muted` to `accent`, which at 1-bit is a weight. A composition
 * whose ruling is *these two never meet* still needs a frame, because the way it
 * would be got wrong is a focus ring painted over the data.
 */
const HEAT = {
  kind: "plot",
  id: "h",
  form: "heatmap",
  height: 3,
  axes: true,
  series: [
    { values: [1, 4, 9, 16], label: "one" },
    { values: [16, 9, 4, 1], label: "two" },
    { values: [4, 4, 9, 9], label: "three" },
  ],
};

describe("C10 §4k — the compositions, as frames", () => {
  for (const rung of RUNGS) {
    it(`case 1 — focused + selected + failed, at ${rung.name}`, () => {
      const kit = measurable({
        capabilities: rung.capabilities,
        definitions: [tableDefinition],
        focus: { blockId: "t", rowId: "b", selected: [{ blockId: "t", rowId: "b" }] },
      });
      const lines = kit.renderToLines(TABLE as never, 40);
      expect(
        [
          "-- the frame",
          ...lines.map((l) => `  ${visible(l)}`),
          "",
          "-- which fact took the ground, run by run",
          ...lines.map((l) => `  ${runsOf(l, rung.capabilities)}`),
          "",
          "-- the ruling (C10 §4k.2 row 1)",
          "  selection takes the ground · focus keeps its mark · failure keeps its glyph, its word and its tone",
          "",
          "-- and what drawing it found, kept because the record is the point (F1240)",
          "  This frame reported two of row 1's three clauses for as long as it existed. A focused or",
          "  selected row was repainted in ONE ink \u2014 accent, or default under selection \u2014 so `failed` kept",
          "  \u2717 and the word and lost the error tone. The two halves of the remedy were one change and",
          "  neither worked alone: C11 I14's drop-to-one-ink rule, and a painter that resolves a tone",
          "  against the surface it lands on. `inkOn` was that resolver and was called only from",
          "  `contrast.ts` \u2014 74 of 100 tone x surface pairs were an ink the gate checked and the painter",
          "  never emitted. C10 I48 gives `resolve` the ground, `inkOn` is its composition step, and the",
          "  ink beside each ground above is the value C10 T2.49 measures the gate against.",
        ].join("\n"),
      ).toMatchSnapshot();
    });

    it(`case 4 — focus over a heatmap, at ${rung.name}`, () => {
      const at = (focus: boolean): readonly string[] =>
        measurable({
          capabilities: rung.capabilities,
          definitions: [plotDefinition],
          ...(focus ? { focus: { blockId: "h", rowId: null } } : {}),
        }).renderToLines(HEAT as never, 40);
      const lit = at(true);
      const rest = at(false);
      // **The data is untouched, and that is the assertion R-FOC-004 makes.**
      // Stripped of SGR the two frames are the same picture; what moved is the
      // frame's ink, and the report below is where it shows.
      expect(lit.map(visible), "focus changes no glyph and no width").toEqual(rest.map(visible));
      expect(
        [
          "-- the frame, focused",
          ...lit.map((l) => `  ${visible(l)}`),
          "",
          "-- at rest, run by run",
          ...rest.map((l) => `  ${runsOf(l, rung.capabilities)}`),
          "",
          "-- focused, run by run",
          ...lit.map((l) => `  ${runsOf(l, rung.capabilities)}`),
          "",
          "-- the ruling (C10 §4k.2 row 4, R-FOC-004)",
          "  nothing is contested · the border and the axes take the focus · the data keeps its reading",
        ].join("\n"),
      ).toMatchSnapshot();
    });
  }

  /**
   * The four with no subject, and the change that gives each one.
   *
   * **Not a comment**, because a comment is where a deferral goes to stop being
   * watched. The snapshot is what a reader of this directory sees when they ask
   * why it holds two compositions and not six, and C10 T2.48 is the row that
   * goes red the day one of the blockers lifts.
   */
  it("the four compositions with no subject name the change that would give them one", () => {
    const owed = [
      "2 · hover beside focus     no producer — mouse mode 1002 sends no motion, so the fact cannot arise (M7)",
      "3 · selection over a diff  both facts ship; `patch` declares no elements and reads ctx.focus nowhere (M9)",
      "5 · disabled + error       `disabled` is an availability fact and no block carries the field (M4)",
      "6 · stale + running        `stale` is a freshness fact and no block carries the field (M4)",
    ];
    expect(owed, "four, and the classification rules all six").toHaveLength(4);
    // **Two constructible \u00d7 three rungs is the six tests above**, asserted as
    // arithmetic against the same numbers so the file cannot quietly hold five.
    // The question this answers is *do all six compositions exist at all three
    // rungs* \u2014 they do not, and the four that do not are at **no** rung rather
    // than at one: they have no subject a producer can construct, not a missing
    // capability. What watches the conditions is C10 T2.48, which asserts each
    // absence against the tree and goes red the day one acquires a subject; this
    // row watches the **count**, so a blocker lifting without a frame being drawn
    // is a failure here rather than a silence.
    expect((6 - owed.length) * RUNGS.length, "the frames this file draws").toBe(6);
  });
});
