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
import { createEditor } from "../../src/interaction/editor/index.js";
import { measurable } from "./render.js";
import { noticeDoc } from "../../src/shell/documents.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
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
