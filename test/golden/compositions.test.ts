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

/** The token name of a run's ink, or `-` when nothing set one. */
function inkOf(seq: string, caps: TerminalCapabilities): string {
  const params = SGR_RE.exec(seq)?.[1] ?? "";
  if (params === "") return "-";
  for (const name of TONES) {
    const want = sgr(tone(name, DARK_THEME, caps))
      .replace(/^\u001b\[/u, "")
      .replace(/m$/u, "");
    if (want !== "" && params.includes(want)) return name;
  }
  return "-";
}

/** The token name of the ground a run is painted on, or `page` for none. */
function groundOf(seq: string, caps: TerminalCapabilities): string {
  const params = SGR_RE.exec(seq)?.[1] ?? "";
  if (params === "") return "page";
  const held = params.split(";");
  for (const name of GROUNDS) {
    const want = sgr(background(name, DARK_THEME, caps))
      .replace(/^\u001b\[/u, "")
      .replace(/m$/u, "");
    if (want !== "" && params.includes(want)) return name.replace("surface.", "");
  }
  // At 1-bit a ground resolves to `NO_STYLE` or to an attribute; naming the
  // attribute is the honest answer there, because there is no surface to name.
  if (held.includes("7")) return "inverse";
  if (held.includes("1")) return "bold";
  return "page";
}

/**
 * Every run of a row as `ground:text`, so the report is one line per row.
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
  let ground = "page";
  let ink = "-";
  let text = "";
  const close = (): void => {
    if (text.trim() !== "") out.push(`${ground}/${ink}:${JSON.stringify(text)}`);
    text = "";
  };
  for (const part of line.split(SPLIT_RE)) {
    if (part === "") continue;
    if (part.startsWith("\u001b[")) {
      const held = (SGR_RE.exec(part)?.[1] ?? "").split(";");
      const zero = held.includes("0") || held.join("") === "";
      const clearsGround = held.includes("49") || zero;
      const opensGround = held.includes("48") || held.includes("7") || held.includes("1");
      const clearsInk = held.includes("39") || zero;
      const opensInk = held.includes("38");
      if (!clearsGround && !opensGround && !clearsInk && !opensInk) continue;
      const nextGround = clearsGround ? "page" : opensGround ? groundOf(part, caps) : ground;
      const nextInk = opensInk ? inkOf(part, caps) : clearsInk ? "-" : ink;
      if (nextGround !== ground || nextInk !== ink) {
        close();
        ground = nextGround;
        ink = nextInk;
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
          "-- what the frame does NOT meet, recorded here because a snapshot records and does not check",
          "  the TONE. A focused or selected row is repainted in one ink — accent, or default when",
          "  selection alone holds it — so `failed` keeps ✗ and the word and loses the error tone.",
          "  The two halves of the remedy are one change and neither works alone: C11 I14's drop-to-one-ink",
          "  rule, and a painter that resolves a tone against the surface it lands on. `inkOn` is that",
          "  resolver, it carries the per-theme overrides and both high-contrast bands, and it is called",
          "  only from `contrast.ts` — 74 of 100 tone x surface pairs are an ink the gate checks and the",
          "  painter never emits. Dropping I14 without the second half would paint the flat ink on the",
          "  selection ground, which is the value the gate already measures as wrong there.",
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
    expect(owed.join("\n")).toMatchSnapshot();
  });
});
