// The corpus's second axis — one entry per *state*, where `ONE_PER_KIND` is one
// per kind.
//
// **This exists because the first axis is exhaustive and the wrong one.**
// `ONE_PER_KIND` is a `Readonly<Record<BlockKind, Block>>`: the type makes it
// complete over kinds and it holds exactly one state of each. So it answers *does
// this kind render* and can answer nothing about *which state it is in* — and a
// new state of an existing kind is invisible to it by construction.
//
// Three shipped that way, and each needed a frame added by hand after the fact:
//
//   the continuation mark   landed flush left in the prompt's gutter, reading as
//                           the prompt's sibling — the one relationship it denies
//   the gapped series       the two forms of `plot` disagreed about one array;
//                           the sparkline closed the gap and shortened the row
//   the wide ramp           step 0 was BRAILLE PATTERN BLANK, so the *minimum*
//                           drew as the padding beside it (F171)
//
// **Not three coincidences with one cause** — the corpus had no axis they could
// be entries on. Golden is the only instrument that reaches any of them: each
// passed every assertion in the other five tiers, and two of them passed rows
// written specifically about the mechanism they were wrong about.
//
// ── What this does NOT do, because an unstated limit reads as strength ────────
//
// **No rule here can invent an entry for a state nobody wrote down.** The
// equality arm in `test/contract/states.test.ts` keeps the inventory and the
// frames in step — a fixture added without being declared fails, and a name
// declared without a fixture fails — and that is all it can do. Whether a *new*
// state is on the list is a judgement, the same one `EXPECTED_KINDS` needs when
// a kind is added, and it is made when a feature lands rather than by a scan.
//
// What makes it cheap enough to be made: an entry is a name, a reason and a
// function returning rows. Adding one is three lines and the frame comes free.
import { block, type BlockKind } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { createEditor } from "../../src/interaction/editor/index.js";
import { measurable } from "./render.js";
import { noticeDoc } from "../../src/shell/documents.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import type { ResolvedTheme } from "../../src/presentation/theme/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

/** What a state is a state *of*: a block kind, or a shell surface that is not one. */
export type StateSubject = BlockKind | "prompt";

export type StateFixture = Readonly<{
  /** Stable id. The equality arm names exactly these. */
  name: string;
  /** The kind or surface this is a state of. */
  of: StateSubject;
  /**
   * **The defect that reached the tree because no frame held this state**, or
   * the one that would. A reason a reader can check, not a category — an entry
   * whose `why` is *for coverage* is an entry nobody will maintain.
   */
  why: string;
  /** The rows, under a width, capabilities and a theme. */
  rows: (width: number, caps: TerminalCapabilities, theme: ResolvedTheme) => readonly string[];
}>;

/** The gutter the prompt draws with — two cells, matching `PROMPT_GUTTER`. */
const PROMPT_GUTTER = { first: 2, cont: 2 } as const;

const plot = (
  width: number,
  caps: TerminalCapabilities,
  theme: ResolvedTheme,
  b: Parameters<ReturnType<typeof measurable>["renderToLines"]>[0],
): readonly string[] =>
  measurable({ definitions: [plotDefinition], theme, capabilities: caps }).renderToLines(b, width);

export const STATES: readonly StateFixture[] = Object.freeze([
  {
    name: "plot-gapped-line",
    of: "plot",
    why:
      "the line broke across the gap and the sparkline closed it — one block kind's two forms " +
      "disagreeing about one array, with C12 I4 as written satisfied by both",
    rows: (w, caps, theme) =>
      plot(
        w,
        caps,
        theme,
        block({
          kind: "plot",
          id: "st-gap-line",
          form: "line",
          height: 5,
          axes: true,
          series: [{ values: [1, 2, 3, null, 7, 8, 9] }],
        }),
      ),
  },
  {
    name: "plot-gapped-sparkline",
    of: "plot",
    why:
      "a leading gap is where a blank is indistinguishable from the right-anchor padding, which " +
      "is the case a bursty stall actually produces",
    rows: (w, caps, theme) =>
      plot(
        w,
        caps,
        theme,
        block({
          kind: "plot",
          id: "st-gap-spark",
          form: "sparkline",
          series: [{ values: [null, 2, 3, null, 7, 8, 9] }],
        }),
      ),
  },
  {
    name: "plot-zero-minimum",
    of: "plot",
    why:
      "F171 — the ramp's lowest step drew as whitespace at `ambiguousWidth: \"wide\"`, so an idle " +
      "series read as an absent one and `cells()` counted it as present",
    rows: (w, caps, theme) =>
      plot(
        w,
        caps,
        theme,
        block({
          kind: "plot",
          id: "st-zero-min",
          form: "sparkline",
          series: [{ values: [0, 1, 2, 3, 4, 5, 6, 7] }],
        }),
      ),
  },
  {
    name: "plot-heatmap",
    of: "plot",
    why:
      "a matrix that fell into the line arm is the right height, the right width and the wrong " +
      "picture — the form switch was two-armed at four sites and three of them failed open",
    rows: (w, caps, theme) =>
      plot(
        w,
        caps,
        theme,
        block({
          kind: "plot",
          id: "st-heat",
          form: "heatmap",
          height: 4,
          yFormat: "percent",
          yMin: 0,
          yMax: 100,
          xLabels: ["-60 ticks", "", "now"],
          // **No `colormap` here, and the absence is the ruling.** This corpus
          // strips SGR on purpose — *C10's own goldens own colour* — so adding
          // one changes nothing in the snapshot, and a fixture that cannot
          // respond to the member it declares is the shape `test/support/
          // README.md` refuses. The second channel is measured in
          // `test/contract/colormap.test.ts`, by SGR count at four depths and by
          // the glyph stream being identical with and without it (C10 I31).
          series: [
            { values: [2, 9, 24, 61, 88, 97, 74, 30, 11, 4, 2, 3, 8, 19, 44, 70], label: "api" },
            { values: [40, 41, 39, 42, 40, 38, 41, 43, 40, 39, 41, 40, 42, 41, 39, 40], label: "worker" },
            { values: [1, 2, 1, 3, 2, 1, 2, null, null, null, null, null, null, null, null, null], label: "cache" },
            { values: Array.from({ length: 16 }, () => null), label: "db" },
          ],
        }),
      ),
  },
  {
    name: "table-value-bar",
    of: "table",
    why:
      "the tree hand-wrote nine lines of this rather than bend `b.progress`, and the run is a " +
      "picture — a fill that clamped its number would draw a busy container like a saturated one",
    rows: (w, caps, theme) =>
      measurable({ definitions: [tableDefinition], theme, capabilities: caps }).renderToLines(
        block({
          kind: "table",
          id: "st-bar",
          columns: [
            b.col("name", { label: "NAME", priority: 90, minWidth: 8 }),
            b.col("cpu", { label: "CPU", priority: 80, minWidth: 18 }),
          ],
          rows: [
            { id: "r1", cells: { name: { text: "api" }, cpu: { text: "", bar: { value: 4.2, max: 100, format: "percent" } } } },
            { id: "r2", cells: { name: { text: "worker" }, cpu: { text: "", bar: { value: 101.2, max: 100, format: "percent" }, tone: "error", glyph: "warn" } } },
            { id: "r3", cells: { name: { text: "db" }, cpu: { text: "", bar: { value: null, max: 100 }, tone: "muted" } } },
            { id: "r4", cells: { name: { text: "idle" }, cpu: { text: "", bar: { value: 0, max: 100, format: "percent" } } } },
          ],
        }),
        w,
      ),
  },
  {
    name: "plot-annotated",
    of: "plot",
    why:
      "an annotation must not read as data, and every way of getting that wrong renders — a " +
      "solid line is a flat series, a ramp-folded one is heavier than the curve, and a clamped " +
      "edge names a limit that is somewhere else. None is visible to a count (C12 I23)",
    rows: (w, caps, theme) =>
      measurable({ definitions: [plotDefinition], theme, capabilities: caps }).renderToLines(
        block({
          kind: "plot",
          id: "st-ann",
          form: "line",
          height: 8,
          axes: true,
          yMin: 0,
          yMax: 100,
          yFormat: "percent",
          series: [
            {
              values: Array.from({ length: 48 }, (_, i) =>
                12 + 78 * (0.5 - 0.5 * Math.cos((i / 47) * Math.PI * 2))),
              label: "CPU %",
              tone: "ok",
            },
          ],
          annotations: [
            // The band docker declares, and a line at a ceiling the data crosses.
            { kind: "band", from: 60, to: 85, tone: "warn" },
            { kind: "line", value: 95, tone: "error" },
            // And one off the scale, which must draw nothing rather than a line
            // at the top saying the limit is there.
            { kind: "line", value: 400, tone: "error" },
          ],
        }),
        w,
      ),
  },
  {
    name: "kv-value-bar",
    of: "keyValue",
    why:
      "the bar is a declared width inside a column that is a remainder, and every way of getting " +
      "that wrong renders — a 68-cell run at width 80, a row one cell over, a detail that is a " +
      "lone ellipsis. None of the three is visible to a count (C04 I51)",
    rows: (w, caps, theme) =>
      measurable({ theme, capabilities: caps }).renderToLines(
        block({
          kind: "keyValue",
          id: "st-kv-bar",
          rows: [
            {
              label: "MEM",
              value: "1.2GiB / 4GiB",
              bar: { value: 45.2, max: 100, format: "percent" },
              barWidth: 15,
            },
            // The scale exceeded, which is the row `progress` would clamp.
            {
              label: "CPU",
              value: "8 cores",
              bar: { value: 101.2, max: 100, format: "percent" },
              barWidth: 15,
            },
            // Absent, which draws a mark and never an empty run.
            { label: "SWAP", value: "unavailable", bar: { value: null, max: 100 }, barWidth: 15 },
            // And a row with no bar at all, beside them — the shape both
            // measured consumers actually have.
            { label: "PIDS", value: "12" },
          ],
        }),
        w,
      ),
  },
  {
    name: "notice-continuation",
    of: "notice",
    why:
      "the mark says *this line belongs to the one above it*, which is a claim about two rows — " +
      "and it shipped flush left in the prompt's own gutter, reading as the prompt's sibling",
    rows: (w, caps, theme) => {
      const doc = noticeDoc("/ps --all", "queued behind /logs", "muted", { origin: "user" });
      const first = doc.blocks[0];
      if (first === undefined) return [];
      return measurable({ theme, capabilities: caps }).renderToLines(first, w);
    },
  },
  {
    name: "prompt-paste-chip",
    of: "prompt",
    why:
      "a chip is ONE grapheme to the editor and N cells to the terminal, so every index assertion " +
      "passes at any label width — only a frame measures the difference (roadmap 30)",
    rows: (w) => {
      const e = createEditor();
      e.insert("read ");
      e.insertChip({ label: "[#1 pasted · 184 lines]", content: "line one\nline two" });
      e.insert(" and summarise it");
      return e.layout(w, PROMPT_GUTTER);
    },
  },
]);

/** Every state's name, in declaration order. The equality arm's left side. */
export const ALL_STATES: readonly string[] = Object.freeze(STATES.map((s) => s.name));
