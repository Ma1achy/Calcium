// The corpus's third axis — one entry per **design fixture** (M16).
//
// `ONE_PER_KIND` is one per kind and `STATES` is one per state; both are indexed
// by the repo's own vocabulary. This one is indexed by the **design's**, which is
// the only axis that can answer *does the repo draw what the design specifies*.
// A surface can be built, have a kind, have a state, and still not look like its
// fixture — and nothing indexed by kind or state can see that.
//
// **A probe cannot answer it either, which is why these exist.** `test/golden/
// DESIGN_FIXTURES.md` carries a `built` column and it is a presence check: it
// says a subject with that name is in the tree, not that the subject matches the
// design. `granularity` resolving somewhere does not make §035's three axes
// independent. The frame is what closes that gap, and raising `framed` is the
// whole of M16's remaining work.
//
// **An entry is a §, a reason and a function returning rows** — the shape
// `STATES` chose, for its reason: adding one is three lines and the frame comes
// free, so the cost of covering a surface never argues against covering it.
import { block } from "../../src/data/viewmodel/index.js";
import {
  CALL_STATE_GLYPH,
  GLYPH_TOKENS,
  barStyleNames,
  glyphFor,
  headMark,
  scrollbarSet,
  spinnerFrames,
  spinnerSetNames,
  toneCarries,
} from "../../src/presentation/blocks/glyphs.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { patchOf } from "./blocks.js";
import { measurable } from "./render.js";
import { styledScreenFrom } from "./styled-screen.js";
import type { ResolvedTheme } from "../../src/presentation/theme/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import type { Block, CallState } from "../../src/data/viewmodel/types.js";

export type Surface = Readonly<{
  /** The fixture this is the target appearance for — `DESIGN_FIXTURES.md`'s key. */
  section: number;
  /** What the fixture specifies, in the design's own words where it has them. */
  name: string;
  rows: (width: number, caps: TerminalCapabilities, theme: ResolvedTheme) => readonly string[];
}>;

// **The theme and the capabilities go to `measurable`, not to `renderToLines`.**
// The first draft passed them as a third argument and handed it an *array* where
// it takes one block, so every surface fell through to the raw fallback and the
// snapshot recorded the JSON of the block rather than its rendering. Four frames
// passed, and not one of them drew anything — `render.ts` warns about exactly
// this shape: *an unregistered kind still renders, as `raw`, and still produces
// rows*, so counting lines cannot see it. Reading the frame can.
const draw =
  (b: Block) =>
  (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] =>
    measurable({ theme, capabilities }).renderToLines(b, width);

/** §095's tape: five members, the window on the third, details all-or-nothing. */
const TAPE = block({
  kind: "tape",
  id: "tape",
  members: [
    { id: "a", label: "scout", detail: "4s", state: "succeeded" as const },
    { id: "b", label: "planner", detail: "1m12s", state: "succeeded" as const },
    { id: "c", label: "builder", detail: "8s", state: "running" as const },
    { id: "d", label: "critic", detail: "2s", state: "queued" as const },
    { id: "e", label: "scribe", detail: "0s", state: "queued" as const },
  ],
  current: "c",
});

/** §033/§034: a bar per alphabet is `barStyleNames`'; this is the default's shape. */
const BAR = block({ kind: "progress", id: "bar", label: "download", current: 7, total: 10 });

/** §096: the three parts — message wraps, detail truncates with a residue. */
const STATUS = block({
  kind: "status",
  id: "status",
  state: "error" as const,
  message:
    "the manifest declares a tool the registry has no handler for, so it would classify as local and reach the pipeline with nothing to run",
  detail: "at seal(): `prune` is marked local in the manifest and has no handler",
  height: 8,
});

// **§069 is NOT here, and the first draft put it here.** Its subject is the
// *prompt's upper rule* — `──────… Calcium ─`, inline-end, carrying identity —
// which `paint.ts` draws from `frame.label`, and the application supplies that
// through `chrome.label?.(ctx)`. The `rule` **block kind** is a different
// surface that happens to share the word, and rendering it here produced a
// convincing frame of the wrong thing. §069 wants a variant of the *frame*
// corpus with a label set, which the session goldens do not have: every rule in
// them is bare. That is `built` and not `framed`, exactly.

/** §097: a transient panel, between two rules. */
const PANEL = block({
  kind: "panel",
  id: "panel",
  title: "Confirm",
  children: [block({ kind: "raw", id: "p1", text: "apply this change?" })],
});

/** §048: block states, one row per state of the same kind. */
const STEPS = block({
  kind: "steps",
  id: "steps",
  steps: [
    { label: "resolve", detail: "12 packages", state: "done" as const },
    { label: "fetch", detail: "3 remaining", state: "active" as const },
    { label: "link", state: "pending" as const },
    { label: "verify", detail: "checksum", state: "failed" as const },
  ],
});

/** §042: the pills row — peers you do not navigate, so it sheds (§095's rule). */
const PILLS = block({
  kind: "pills",
  id: "pills",
  chips: [
    { label: "auto", active: true },
    { label: "plan" },
    { label: "manual" },
    { label: "accept edits" },
  ],
});

// --- the vocabulary surfaces ------------------------------------------------
//
// **Five fixtures whose subject is a table rather than a block**, and the
// signature already allows them: a `Surface` is a § and a function returning
// rows, so a census of the marks at a rung is as much a frame as a panel is.
// Drawing them through a block would be the wrong picture — §006 specifies the
// *vocabulary*, not one block that happens to use a member of it, and a frame
// of one member says nothing about the other seventeen.
//
// **Every one of them reads the capabilities it is handed**, which is the
// property that makes them worth snapshotting at three rungs rather than one:
// a row that returned the same string at every rung would be a restatement of
// the table it is drawn from.

/** Two columns, so a reader can see the token beside the mark it resolves to. */
// 16, because `circleQuarters` and `growHorizontal` are both 14 and a column
// padded to its longest member leaves no gap at all where it matters most.
const pair = (name: string, value: string): string => `${name.padEnd(16, " ")}${value}`;

/** §006: every `Glyph` the vocabulary holds, resolved at this rung. */
const glyphCensus = (
  _width: number,
  caps: TerminalCapabilities,
): readonly string[] => GLYPH_TOKENS.map((t) => pair(t, glyphFor(t, caps)));

/**
 * §030: the head mark's three rungs, and **the rung is the frame's own axis**.
 *
 * With colour every state draws one mark and tone says which; at one bit and in
 * ASCII tone is gone and the shape carries it. So the interesting property is
 * *are these five distinct*, and it is only visible by drawing all five — which
 * is why this row is the states and not one call head.
 */
const headMarks = (_width: number, caps: TerminalCapabilities): readonly string[] => {
  const states: readonly CallState[] = ["queued", "running", "succeeded", "failed", "cancelled"];
  return [
    `tone carries: ${String(toneCarries(caps))}`,
    ...states.map((st) => pair(st, glyphFor(headMark(st, caps), caps))),
    pair("(state glyph)", states.map((st) => glyphFor(CALL_STATE_GLYPH[st], caps)).join(" ")),
  ];
};

/** §031: every registered set at its own rung — the frames, in order. */
const spinnerCensus = (_width: number, caps: TerminalCapabilities): readonly string[] =>
  spinnerSetNames().map((n) => pair(n, spinnerFrames(caps, n).join(" ")));

/** §021: the set degrades whole, so the frame is the set and not a member. */
const scrollbarCensus = (_width: number, caps: TerminalCapabilities): readonly string[] => {
  const set = scrollbarSet(caps);
  return [
    pair("track", set.track),
    pair("thumb", set.thumb),
    pair("thumbStart", set.thumbStart),
    pair("thumbEnd", set.thumbEnd),
    pair("half", String(set.half)),
  ];
};

/**
 * §021's other half: the bar drawn beside a box that overflows.
 *
 * The census above says which glyphs; this says where they land, and §021 draws
 * a bar **and** a count together, which is what the residue row under it is.
 */
const SCROLLED = block({
  kind: "scroll",
  id: "scrolled",
  height: 6,
  children: Array.from({ length: 18 }, (_, i) =>
    block({ kind: "raw", id: `line-${String(i)}`, text: `line ${String(i + 1)}` }),
  ),
});

/** §033: one bar per alphabet, all at the same fraction, so the rows compare. */
const barAlphabets =
  () =>
  (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] =>
    barStyleNames().flatMap((style) =>
      measurable({ theme, capabilities }).renderToLines(
        block({ kind: "progress", id: `bar-${style}`, label: style, current: 7, total: 10, style }),
        width,
      ),
    );

// --- §072, the ground census ------------------------------------------------

/**
 * **A background is for an EXTENT; a foreground is for a MARK** (§072).
 *
 * Every other surface in this file is read with its SGR stripped, which is
 * `design-surfaces.test.ts`'s own ruling and right for a fixture about shape.
 * §072 is about the channel that ruling throws away: its whole subject is
 * *which cells carry a ground and how far the ground runs*, and a stripped
 * read calls a washed row and a bare one the same picture.
 *
 * So the rows are a **mask** — one character per cell, `#` where the cell
 * carries a background and `.` where it does not — computed here and emitted
 * as text, which passes through the strip unharmed because it never was an
 * escape. The text follows it, so a reader sees the extent against what is
 * written in it.
 *
 * **Three of §072's nine examples have no subject in this tree**, and saying
 * which is the honest half of the frame: the context bar (4) and the half-block
 * image (8) are not block kinds, and the painted magnitude in a table cell (7)
 * wants `meterFill`, a surface every one of the ten themes carries and **no
 * renderer reads** — its only occurrences in `src/` are the quantised table's
 * generated keys. The focused row (6) is the session's, not a block's:
 * `focus-shapes.test.ts` measures that `plot` and `scroll` are the only kinds
 * answering focus at all.
 */
const groundCensus =
  (subjects: readonly Readonly<{ name: string; block: Block }>[]) =>
  (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
    const kit = measurable({
      theme,
      capabilities,
      definitions: [patchDefinition, tableDefinition] as never,
    });
    return subjects.flatMap(({ name, block: b }) => {
      const lines = kit.renderToLines(b, width);
      const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
      return [
        `· ${name}`,
        ...grid.map((row) => {
          const mask = row.map((c) => (c.style.bg === "" ? "." : "#")).join("");
          return `${mask} ${row.map((c) => c.ch).join("").replace(/\s+$/u, "")}`;
        }),
      ];
    });
  };

/** §072 ex. 1: the line changed, so the LINE is painted — to the block's edge. */
const DIFF = patchOf({ id: "diff" });

/** §072 ex. 3: a posture is TEXT, so a posture can never be read as an error. */
const POSTURES = block({
  kind: "pills",
  id: "postures",
  chips: [{ label: "auto", active: true }, { label: "plan" }, { label: "manual" }],
});

/** §072's well: structural, never semantic — `bgDeep` says CONTENT INSIDE. */
const WELL = block({
  kind: "panel",
  id: "well",
  title: "loss",
  children: [block({ kind: "raw", id: "w1", text: "4.0 ─ 0.0" })],
});

export const SURFACES: readonly Surface[] = Object.freeze([
  { section: 95, name: "a tape, where a row of peers would shed", rows: draw(TAPE) },
  { section: 42, name: "widgets — a row of peers that sheds", rows: draw(PILLS) },
  { section: 34, name: "active progress bars", rows: draw(BAR) },
  { section: 96, name: "a status has three parts, and a frame is separate", rows: draw(STATUS) },
  { section: 97, name: "a transient panel floats, between two rules", rows: draw(PANEL) },
  { section: 48, name: "block states", rows: draw(STEPS) },
  { section: 6, name: "the canonical marks, as a glyph census", rows: glyphCensus },
  { section: 30, name: "the head mark's three rungs", rows: headMarks },
  { section: 31, name: "every reusable spinner set", rows: spinnerCensus },
  { section: 33, name: "nine alphabets, and where each belongs", rows: barAlphabets() },
  { section: 72, name: "the background is a second channel — the ground census", rows: groundCensus([
    { name: "a changed line, ex. 1 — the ground runs to the block's edge", block: DIFF },
    { name: "a tag with extent, ex. 3 — and the error tag is the only one", block: STATUS },
    { name: "a posture, ex. 3 — TEXT, never a ground", block: POSTURES },
    { name: "a well — structural, never semantic", block: WELL },
  ]) },
  { section: 21, name: "the scrollbar — the set, and the bar beside a box", rows: (w, c, t) => [
    ...scrollbarCensus(w, c),
    ...draw(SCROLLED)(w, c, t),
  ] },
]);
