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
import { chordText, defaultKeymap, scopesInReadingOrder } from "../../src/interaction/router/keymap.js";
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
import { measurable, registry } from "./render.js";
import { ALL_KINDS, ONE_PER_KIND } from "./blocks.js";
import { cells, truncate } from "../../src/presentation/text.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { styledScreenFrom } from "./styled-screen.js";
import type { ResolvedTheme } from "../../src/presentation/theme/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { RAMP_ANIMATIONS, RAMP_ONE_SHOTS } from "../../src/data/viewmodel/types.js";
import type { Block, CallState, Ramp, RampAnimation } from "../../src/data/viewmodel/types.js";

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

/**
 * §034's closing figure: **the same bar painted, and the glyphs beneath it**.
 *
 * Drawn as a mask beside the text for the same reason §072's census is — the
 * whole claim is in the channel a stripped read folds away, and a painted bar
 * and an empty row are the same picture without it.
 */
const paintedBar =
  () =>
  (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
    const kit = measurable({ theme, capabilities });
    return (["slant", "block"] as const).flatMap((style) =>
      [true, false].flatMap((painted) => {
        const lines = kit.renderToLines(
          block({ kind: "progress", id: `m-${style}-${String(painted)}`, label: style, current: 15, total: 24, style, painted }),
          width,
        );
        const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
        return maskOf(grid);
      }),
    ).flat();
  };

/**
 * §035: the three axes, drawn as the triples they are.
 *
 * **The two presets and one that is neither.** `R-BLK-237` warns that BUDGET and
 * OPERATION are *named presets, not the only possible types*, and §035 names the
 * case that motivates the split — *a six-hour training run is progress ·
 * continuous · active, without pretending it is a capacity*. A frame of the two
 * presets alone would be a picture of an enum.
 */
const meterAxes =
  () =>
  (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
    const kit = measurable({ theme, capabilities });
    const triples = [
      { name: "BUDGET · capacity · continuous · still", quantity: "capacity", granularity: "continuous", liveness: "still" },
      { name: "OPERATION · progress · segmented · active", quantity: "progress", granularity: "segmented", liveness: "active" },
      { name: "a training run · progress · continuous · active", quantity: "progress", granularity: "continuous", liveness: "active" },
      { name: "a step count · count · segmented · still", quantity: "count", granularity: "segmented", liveness: "still" },
      { name: "stalled · progress · segmented · stalled", quantity: "progress", granularity: "segmented", liveness: "stalled" },
    ] as const;
    return triples.flatMap((t) => [
      `· ${t.name}`,
      ...kit.renderToLines(
        block({
          kind: "progress",
          id: `ax-${t.quantity}-${t.granularity}-${t.liveness}`,
          label: "work",
          current: 31,
          total: 50,
          quantity: t.quantity,
          granularity: t.granularity,
          liveness: t.liveness,
        }),
        width,
      ),
    ]);
  };

// --- §037, the ink census ---------------------------------------------------

/** The 24-cell swatch every §037 row is drawn over — ASCII, so the rung that
 *  substitutes glyphs moves nothing here and the only channel is the ink. */
const INK_EXTENT = 24;
const SWATCH = "#".repeat(INK_EXTENT);

/**
 * One letter per distinct **foreground**, assigned **per row** and with no
 * legend — the inverse of `maskOf` in both respects, and both differences are
 * the subject's.
 *
 * **Foreground *and its attributes*, because a ramp replaces the run's
 * foreground and nothing else** (C04 I107). §072's census is about grounds and
 * reads `bg`; an ink census that read `bg` would draw twenty-four identical
 * cells for every effect.
 *
 * **The attributes are not decoration here, they are the bottom rung.** At one
 * bit `rampStyle` answers with `from`'s *class* — bold, dim or neither — because
 * a colour value has no carrier, so a mask keyed on `fg` alone draws the whole
 * 1-bit ladder as unstyled and says the ink vanished when what happened is that
 * it changed channel. The first draft did exactly that, and it read as a frame
 * confirming R-MOT-012 rather than as an instrument that cannot see the rung.
 *
 * **Per row, because the figure is a shape and not a value.** A 24-bit linear
 * gradient over twenty-four cells has twenty-four distinct colours, so a shared
 * legend would be six hundred lines of hex for a snapshot whose whole claim is
 * that `gradient` climbs and `centred` turns round in the middle. Letters
 * assigned in reading order within the row say that directly: `ABC…X` against
 * `ABC…LLKJ…A`. The cost is that two rows' letters are not comparable, which is
 * why nothing here compares across rows.
 */
function inkMaskOf(row: readonly { style: { fg: string; attrs: readonly number[] } }[]): string {
  const seen = new Map<string, string>();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return row
    .slice(0, INK_EXTENT)
    .map((c) => {
      const key = `${c.style.fg}/${[...c.style.attrs].sort((x, y) => x - y).join(",")}`;
      if (key === "/") return ".";
      const held = seen.get(key);
      if (held !== undefined) return held;
      const next = alphabet[seen.size] ?? "?";
      seen.set(key, next);
      return next;
    })
    .join("");
}

/** The middle cell's ink, at one depth and one tick — the census's time axis. */
function inkAt(
  ramp: Ramp,
  depth: TerminalCapabilities["colourDepth"],
  tick: number,
  width: number,
  capabilities: TerminalCapabilities,
  theme: ResolvedTheme,
): string {
  const kit = measurable({ theme, capabilities: { ...capabilities, colourDepth: depth }, tick });
  const lines = kit.renderToLines(
    { kind: "raw", id: `t-${String(tick)}`, text: SWATCH, spans: [{ from: 0, to: INK_EXTENT, ramp }] } as never,
    width,
  );
  const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
  const cell = grid[0]?.[INK_EXTENT / 2];
  return cell === undefined ? "" : `${cell.style.fg}/${[...cell.style.attrs].sort((x, y) => x - y).join(",")}`;
}

/** The swatch's first row, rendered at one depth and one tick, as a mask. */
function inkRow(
  ramp: Ramp,
  depth: TerminalCapabilities["colourDepth"],
  tick: number,
  width: number,
  capabilities: TerminalCapabilities,
  theme: ResolvedTheme,
): string {
  const kit = measurable({ theme, capabilities: { ...capabilities, colourDepth: depth }, tick });
  const lines = kit.renderToLines(
    { kind: "raw", id: `ink-${String(depth)}-${String(tick)}`, text: SWATCH, spans: [{ from: 0, to: INK_EXTENT, ramp }] } as never,
    width,
  );
  const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
  return inkMaskOf(grid[0] ?? []);
}

/**
 * **`muted` and not `default`, because the 1-bit rung has to be able to say
 * something.** `rampStyle`'s answer at one bit is `from` resolved as the slot
 * is — a *class*, bold or dim, since a colour value has no carrier there — and
 * `default` resolves to no colour and no attribute, so a pair starting at it
 * drew twenty-four unstyled cells and a reader could not tell *the ladder
 * bottomed out correctly* from *the ladder is broken*. A fixture must respond
 * to the thing under test.
 */
const PAIR = { from: "muted", to: "accent" } as const;

/**
 * A one-shot with no `since` rests (C04 I109), which is the honest answer for a
 * ramp nobody started and an empty row in a census. The five are stamped at
 * tick 0 and read at tick 7, so the block draws them mid-pass; the eighteen
 * periodic effects refuse `since` at the gate and take none.
 */
const stamped = (a: RampAnimation): Ramp =>
  RAMP_ONE_SHOTS.has(a)
    ? { fill: "gradient", ...PAIR, animate: a, since: 0 }
    : { fill: "gradient", ...PAIR, animate: a };

/**
 * §037 — **every registered effect, read as ink**.
 *
 * **Three blocks, because §037 makes three claims and only the first is a
 * list.** The fills are a spatial figure, the animations are a temporal one
 * read at a fixed tick, and `R-MOT-012` — *below 8-bit, motion stops because a
 * small palette moving reads as flicker* — is a claim about a rung that neither
 * of the other two can show.
 *
 * **The depth ladder is drawn inside rather than taken from the variant.** Ink
 * has no Unicode axis at all, so this corpus's three arms give two distinct
 * pictures (24-bit and 1-bit) and neither of the two rungs where the interesting
 * things happen: 8-bit, where a mix quantises onto the 256 cube, and 4-bit,
 * where a slot pair becomes two steps and `effectiveTick` stops the clock. A
 * ladder whose middle rungs are never drawn is a ladder nothing checks — which
 * is this file's own opening argument, applied to a second axis.
 *
 * **The fills block is what the tree could not draw until now.** `gradient`
 * climbs from `from` to `to`; `centred` turns round at the middle, so the two
 * halves of its row are one another reversed. They were a single `RampFill`
 * value, reconciled by a sentence — *`centre` and `linear` are both `gradient`*
 * — that is true about the family and silent about the sampling.
 */
const inkCensus =
  () =>
  (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
    const at = (ramp: Ramp, depth: TerminalCapabilities["colourDepth"], tick: number): string =>
      inkRow(ramp, depth, tick, width, capabilities, theme);
    const label = (n: string): string => n.padEnd(18, " ");

    const fills: readonly (readonly [string, Ramp])[] = [
      ["gradient-linear", { fill: "gradient", ...PAIR }],
      ["gradient-centre", { fill: "centred", ...PAIR }],
      ["gradient-step", { fill: "step", ...PAIR, bands: 5 }],
      ["gradient-palette", { fill: "palette" }],
      ["gradient-map", { fill: "gradient", colormap: "viridis" }],
      ["gradient-map · centred", { fill: "centred", colormap: "viridis" }],
    ];

    // A colormap backing is refused on a span (C04 I107), so the two map rows
    // are drawn at the depth they are legal at through the bar instead — which
    // this census does not do. They are named and shown as refused, because a
    // reader counting five registered fills against four rows would otherwise
    // read an omission as a divergence.
    const spanFills = fills.filter(([, r]) => r.colormap === undefined);

    const moving = RAMP_ANIMATIONS.filter((a) => a !== "none");

    return [
      "· the fills — 24 bits, one letter per distinct ink, assigned within the row",
      ...spanFills.map(([name, ramp]) => `  ${label(name)}${at(ramp, 24, 0)}`),
      `  ${label("(map backings)")}refused on a span — the floor is proven per slot (C04 I107)`,
      "",
      "· the fills, down the ladder — 8, 4 and 1 bit",
      ...([8, 4, 1] as const).flatMap((d) => [
        `  depth ${String(d).padStart(2, " ")}`,
        ...spanFills.map(([name, ramp]) => `    ${label(name)}${at(ramp, d, 0)}`),
      ]),
      "",
      `· the ${String(moving.length)} animated effects at 24 bits, tick 7`,
      ...moving.map((a) => `  ${label(a)}${at(stamped(a), 24, 7)}`),
      "",
      // **The spatial block cannot see a cadence, and six of its rows are flat.**
      // `breathe`, `pulse`, `heartbeat`, `flicker`, `neon` and `pop` are
      // constant across the extent by construction — `animateT`'s own table
      // says so — so a census indexed by position draws each of them as
      // twenty-four identical cells, which is exactly what an effect that does
      // nothing draws. The two are told apart on the other axis: one cell,
      // twenty-four ticks. `pulse`'s two states, `heartbeat`'s two beats and a
      // rest, and `neon`'s settle are figures only this block holds.
      "· the same effects through time — the middle cell over 24 ticks, 24 bits",
      ...moving.map((a) => {
        const ramp = stamped(a);
        const seen = new Map<string, string>();
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        const row = Array.from({ length: 24 }, (_, k) => {
          const key = inkAt(ramp, 24, k, width, capabilities, theme);
          if (key === "/") return ".";
          const held = seen.get(key);
          if (held !== undefined) return held;
          const next = alphabet[seen.size] ?? "?";
          seen.set(key, next);
          return next;
        }).join("");
        return `  ${label(a)}${row}`;
      }),
      "",
      "· R-MOT-012 — below 8 bits motion stops: depth 4, ticks 3 and 11",
      ...moving.map(
        (a) =>
          `  ${label(a)}${at(stamped(a), 4, 3)} | ` +
          `${at(stamped(a), 4, 11)}`,
      ),
    ];
  };

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
 * One character per cell: `.` for no ground, and a letter per **distinct**
 * background in the block, with a legend.
 *
 * **A single `#` was the first draft and it could not see the figure.** §034's
 * painted bar is fifteen cells on `meterFill` beside nine on `bgDeep`, and a
 * one-symbol mask draws that as twenty-four identical cells — the extent is
 * visible and *where the fill ends* is not, which is the whole of what the bar
 * says. Two grounds want two letters.
 */
function maskOf(
  grid: readonly (readonly { ch: string; style: { bg: string } }[])[],
): readonly string[] {
  const seen = new Map<string, string>();
  const letter = (bg: string): string => {
    if (bg === "") return ".";
    const held = seen.get(bg);
    if (held !== undefined) return held;
    const next = String.fromCharCode(65 + seen.size);
    seen.set(bg, next);
    return next;
  };
  const body = grid.map((row) => {
    const mask = row.map((c) => letter(c.style.bg)).join("");
    return `${mask} ${row.map((c) => c.ch).join("").replace(/\s+$/u, "")}`;
  });
  return seen.size === 0
    ? body
    : [...body, ...[...seen].map(([bg, l]) => `  ${l} = bg ${bg}`)];
}

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
      return [`· ${name}`, ...maskOf(grid)];
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


/**
 * §019 — the resolved keymap, the reader's own rung first (`R-KEY-005`).
 *
 * **Drawn through the blocks `/help keys` draws, and ordered by the rule's own
 * owner.** `scopesInReadingOrder` is C16 §6a clause 4's seam, moved out of the
 * `help` arm so this census and that verb cannot disagree about what the rule
 * says; the `rule` and `keyValue` blocks below are the verb's presentation and
 * are restated here deliberately, because a presentation choice is what a
 * census is *for* comparing.
 *
 * **121 bindings and not the fixture's 39.** §019 pictures the registry's own
 * bindings; the tree's resolved keymap is the registry's plus the routes and
 * the block rungs, which is the thing a reader actually presses. The census
 * draws what ships, so the two numbers are expected to differ — the check is
 * that the *grouping* and the *order* are the design's, not that the totals
 * match. `prompt` is the rung because it is where a session opens.
 */
const keymapCensus = (width: number, caps: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
  const all = defaultKeymap.map((b) => ({ keys: chordText(b.key, caps.unicode !== "ascii"), does: b.action, target: b.target }));
  const here = "prompt";
  const m = measurable({ theme, capabilities: caps });
  return scopesInReadingOrder(all, here).flatMap((scope) => [
    ...m.renderToLines(
      block({
        kind: "rule",
        id: `keys-rule-${scope}`,
        label: scope === here ? `${scope} — where you are` : scope,
        level: 3 as const,
      }),
      width,
    ),
    ...m.renderToLines(
      block({
        kind: "keyValue",
        id: `keys-${scope}`,
        rows: all.filter((b) => b.target === scope).map((b) => ({ label: b.keys, value: b.does })),
      }),
      width,
    ),
  ]);
};


/**
 * §058 — what copy takes: **the source, never the rendering** (C09 I86,
 * `R-SEL-004`).
 *
 * **The picture is the two columns side by side**, because that is the whole of
 * §058's claim and neither column alone carries it: a copy text asserted on its
 * own reads as correct, and a rendered row asserted on its own says nothing
 * about what `y` would take. The section's own examples are the rows — *a table
 * row, its values tab-separated, not the padded cells*; *a patch, a unified
 * diff, not the coloured gutter* — and each is a pair.
 *
 * **Tabs and newlines are shown as `⇥` and `↵`** so the difference survives the
 * frame. A copy text drawn with its real tabs would be re-aligned by the
 * terminal into something that looks like the padded cells, which is exactly
 * the distinction this section exists to draw — the census would then picture
 * the two columns agreeing while the tree was right.
 */
/** §058's first row: a table, whose copy is TSV where the render pads to columns. */
const COPY_TABLE = block({
  kind: "table",
  id: "ct",
  columns: [
    { key: "name", label: "name", align: "left" as const, priority: 1, minWidth: 4, sortable: false },
    { key: "size", label: "size", align: "right" as const, priority: 2, minWidth: 4, sortable: false },
  ],
  rows: [
    { id: "r1", cells: { name: { text: "parse.ts" }, size: { text: "4.2 kB" } } },
    { id: "r2", cells: { name: { text: "keymap.ts" }, size: { text: "31 kB" } } },
  ],
}) as unknown as Block;

const copyCensus = (width: number, caps: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
  const kit = registry([patchDefinition, tableDefinition] as never);
  const m = measurable({ theme, capabilities: caps, definitions: [patchDefinition, tableDefinition] as never });
  const subjects: readonly Readonly<{ name: string; block: Block }>[] = [
    { name: "a table row — values, not the padded cells", block: COPY_TABLE },
    { name: "a patch — a unified diff, not the gutter", block: DIFF },
    { name: "a status — the message and its detail", block: STATUS },
    { name: "a tape — the labels, not the marks", block: TAPE },
    { name: "a rule — no source, so it declines", block: block({ kind: "rule", id: "cr", label: "files" }) },
  ];
  const out: string[] = [];
  for (const s of subjects) {
    out.push(s.name);
    const drawn = m.renderToLines(s.block, Math.min(width, 60));
    for (const row of drawn.slice(0, 3)) out.push(`  drawn  ${row.trimEnd()}`);
    const copied = kit.copyOf(s.block);
    // **`null` is the declining kind and is not the empty string** (C09 I86): a
    // blank line is `R-SEL-004`'s entry separator, so a kind joining as `""`
    // would forge a boundary inside one entry. The census draws the difference.
    const shown = copied === null ? "— declines, and is absent from the join" : copied.replaceAll("\t", "⇥").replaceAll("\n", "↵");
    out.push(`  copy   ${shown}`);
    out.push("");
  }
  return out;
};


/**
 * §044 — two selections, one clipboard, drawn as `R-SEL-006`'s four states.
 *
 * **The figure's `▌` is a ground and not a mark, which the registry settles and
 * the fixture cannot.** §044 draws `▌` in the gutter of its selected rows and
 * captions it *`▌` carries selected elements*, which reads as a third carrier
 * beside the prompt's underline and focus's `▸`. `R-SEL-006` says otherwise in
 * as many words — *selected takes selectionGround and **no mark**; focused and
 * selected takes selectionGround and keeps the mark* — so the block is a
 * plain-text depiction of a background a text fixture has no way to draw. Going
 * to the normative source is what caught it: the picture alone would have bought
 * a gutter column the design does not want.
 *
 * So the census reads the **ground**, through `styledScreenFrom`, because a
 * stripped frame folds this channel away entirely and would show four identical
 * rows under four different rules.
 *
 * The four states are one table under one focus, not four fixtures: the head,
 * the extent and the row that is neither are resolved inside the definition
 * from a single `FocusState`, which is where `R-SEL-006`'s *selection wins the
 * ground where both hold* actually lives.
 */
/** §044's subject: three rows, so at-rest, selected, and focused-and-selected are one picture. */
const SELECTION_TABLE = block({
  kind: "table",
  id: "ct",
  columns: [
    { key: "id", label: "commit", align: "left" as const, priority: 1, minWidth: 7, sortable: false },
    { key: "name", label: "run", align: "left" as const, priority: 2, minWidth: 6, sortable: false },
    { key: "state", label: "state", align: "left" as const, priority: 3, minWidth: 6, sortable: false },
  ],
  rows: [
    { id: "r1", cells: { id: { text: "a3f9b21" }, name: { text: "digit-classifier" }, state: { text: "running" } } },
    { id: "r2", cells: { id: { text: "7c2d4e1" }, name: { text: "decoder-zoom" }, state: { text: "succeeded" } } },
    { id: "r3", cells: { id: { text: "2e8a04c" }, name: { text: "graphsage" }, state: { text: "failed" } } },
  ],
}) as unknown as Block;

const selectionGrounds = (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
  // **Two passes, because one figure has one head.** `R-SEL-006` names four
  // states and a single focus can show three of them: a head that is also in
  // the extent covers *focused and selected*, the rest of the extent covers
  // *selected*, and anything outside covers *at rest*. **`focused` alone —
  // `focusGround` and the mark — needs a head that the extent does not contain**,
  // which is a second focus and not a fourth row. A census that drew one pass
  // would be missing the state the two grounds are actually told apart by.
  const pass = (rowId: string, selected: readonly string[], caption: string): readonly string[] => {
    const kit = measurable({
      theme,
      capabilities,
      focus: { blockId: "ct", rowId, selected: selected.map((r) => ({ blockId: "ct", rowId: r })) },
      definitions: [tableDefinition] as never,
    });
    const lines = kit.renderToLines(SELECTION_TABLE, width);
    const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
    return [caption, ...maskOf(grid), ""];
  };
  return [
    ...pass("r2", ["r2", "r3"], "· r1 at rest · r2 focused and selected · r3 selected — selection wins the ground, the head keeps ▸"),
    ...pass("r1", [], "· r1 focused alone — focusGround and the mark · r2 and r3 at rest"),
  ];
};

/**
 * §082 — **there are no pushed views**, and the ground is what makes that
 * readable without a frame.
 *
 * The section's argument is architectural and its picture is one table: a row
 * expanded in place, with the rows below carrying on underneath. Two claims in
 * it are about a ground's **extent**, which is exactly what `maskOf` shows and
 * what no assertion about a string can — `R-BLK-941`'s focused row opens its
 * ground at the block's edge, under the `▸`, and its detail sits on `bgElev`
 * to the same edge while the row after it carries nothing.
 *
 * **Two passes, because expansion is not focus.** One focus can only show the
 * detail under the head, where the head's own ground is directly above it and a
 * reader cannot tell a detail that took `bgElev` from one that inherited. The
 * second pass expands a row nothing is focused on: the detail is grounded and
 * the row above it is not, which is the pair that says the ground follows
 * **expansion** (C11 I9 — block state, not context).
 */
const EXPANSION_TABLE = block({
  kind: "table",
  id: "ps",
  columns: [
    { key: "open", label: "", align: "left" as const, priority: 1, minWidth: 1, sortable: false, role: "expand" as const },
    { key: "id", label: "uuid", align: "left" as const, priority: 2, minWidth: 7, sortable: false },
    { key: "name", label: "family", align: "left" as const, priority: 3, minWidth: 16, sortable: false },
    { key: "state", label: "status", align: "left" as const, priority: 4, minWidth: 9, sortable: false },
  ],
  rows: [
    {
      id: "r1",
      cells: { open: { text: "" }, id: { text: "a3f9b21" }, name: { text: "digit-classifier" }, state: { text: "running" } },
      expanded: true,
      detail: [
        {
          kind: "keyValue" as const,
          id: "r1-detail",
          rows: [
            { label: "node", value: "gpu-04.fmx.internal · 2×A100" },
            { label: "mr", value: "!1248  auto-merged" },
          ],
        },
      ],
    },
    { id: "r2", cells: { open: { text: "" }, id: { text: "7c2d4e1" }, name: { text: "decoder-zoom" }, state: { text: "succeeded" } } },
  ],
}) as unknown as Block;

const expansionGrounds = (
  width: number,
  capabilities: TerminalCapabilities,
  theme: ResolvedTheme,
): readonly string[] => {
  const pass = (rowId: string | null, caption: string): readonly string[] => {
    const kit = measurable({
      theme,
      capabilities,
      ...(rowId === null ? {} : { focus: { blockId: "ps", rowId } }),
      definitions: [tableDefinition] as never,
    });
    const lines = kit.renderToLines(EXPANSION_TABLE, width);
    const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
    return [caption, ...maskOf(grid), ""];
  };
  return [
    ...pass("r1", "· r1 focused and expanded — the ground opens under ▸, the detail takes bgElev, and r2 beneath it takes none"),
    ...pass(null, "· r1 expanded with nothing focused — the detail is grounded and the row above it is not: the ground follows expansion"),
  ];
};

/**
 * §017 — **focus treatment follows the shape**, as a census of what each kind
 * publishes against what it draws.
 *
 * `R-COL-005` is the rule — *focus intensifies by shape: an unpainted run or box
 * inverts, a frame takes its border or axes, a control washes, and a painted
 * identity chip bolds and marks* — and the only checkable form of *follows the
 * shape* is a table of shape against treatment. A row asserting one kind states
 * the rule about itself; the set is what says which shapes have no treatment.
 *
 * **Each kind is asked for its own elements and then focused on each of them.**
 * That is the whole method, and three earlier forms of it were wrong in three
 * ways worth keeping, because each reads as a correct answer:
 *
 * - focusing `{blockId, rowId: null}`, a shape **no session writes**. `plot`
 *   tests `rowId === block.id` and its own comment records the same defect — it
 *   tested `null` for three weeks and painted nothing in a session.
 * - rendering `table`, `plot` and `patch` through a registry that does not have
 *   them. An unregistered kind still renders, as `raw`, and still produces rows,
 *   so three kinds reported *no focus treatment* while never being themselves.
 * - wrapping the call that finds the targets in a `try`/`catch`. `elementsOf` is
 *   the registry's and not the harness's, so a broken call read as *this kind has
 *   no elements* for all twenty-three at once.
 *
 * Each agreed with the map row it was meant to check (*`scroll` and `plot`
 * answer block focus*), which is why none of them looked wrong. The census
 * corroborates instead against rows that already pass — `table` at r1/r2 is
 * T1.29's subject and `pills` at its chips is T1.24's.
 */
const focusByShape = (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
  const defs = [tableDefinition, plotDefinition, patchDefinition] as never;
  const reg = registry(defs);
  const kit = measurable({ theme, capabilities, definitions: defs });
  const rows: string[] = [
    "kind         elements  focus is drawn for",
    "─".repeat(Math.min(width, 62)),
  ];
  let publishes = 0;
  let draws = 0;
  for (const kind of ALL_KINDS) {
    const b = ONE_PER_KIND[kind];
    if (b === undefined) continue;
    const id = (b as Readonly<{ id?: string }>).id ?? "";
    // **No catch here** — see the third defect above. A kind that cannot answer
    // its elements is a fault, not a kind with none.
    const els = reg.elementsOf(b, width).map((e) => e.id);
    const base = kit.renderToLines(b, width).join("\n");
    const lit = [...new Set([id, ...els])].filter((t) => {
      const one = measurable({ theme, capabilities, definitions: defs, focus: { blockId: id, rowId: t } });
      return one.renderToLines(b, width).join("\n") !== base;
    });
    if (els.length > 0) publishes += 1;
    if (lit.length > 0) draws += 1;
    const verdict =
      els.length === 0
        ? "— atomic: nothing to focus"
        : lit.length === 0
          ? `** ${String(els.length)} focusable, NONE drawn **`
          : lit.join(" ");
    rows.push(`${kind.padEnd(12)}${String(els.length).padStart(5)}     ${verdict}`);
  }
  rows.push(
    "",
    `· ${String(ALL_KINDS.length)} kinds · ${String(publishes)} publish a focusable element · ${String(draws)} draw a treatment`,
    "· the atomic kinds are not a missing treatment — a session cannot put focus on them at all",
  );
  return rows;
};

/**
 * §076 — **per-token values over the model's own output**: the VALUED run.
 *
 * The section names three things it needs and the tree has two of them, which
 * is what this frame is for — a *per-token VALUE driving a ground* is
 * `TextSpan.value` mapped through the block's `colormap` (**not a theme token**,
 * which is the correction the map row already carried), and *tokens survive
 * wrapping* is `atomsOf`, which emits a wrap atom for **every valued run**, so a
 * valued token near a line end moves down whole rather than splitting.
 *
 * **Two passes, because the two claims fail in different frames.** The first
 * lays the prose out with room to spare, where the grounds are the whole of
 * what there is to read; the second squeezes the width so the last valued token
 * cannot fit, which is the only frame that can tell *wraps whole* from *wraps*.
 *
 * Read as a mask, because a value's carrier is a background: at 24-bit the
 * distinct grounds are the reading, and at the rungs where `continuousColour`
 * answers nothing the prose is the prose — which is the honest degradation and
 * not a loss, the section's own *off by default … a diagnostic rather than a
 * reading*.
 *
 * **What this does NOT show, named rather than implied**: the reader's side.
 * §076 says *⌥v toggles it on the entry under the cursor*, and `valuesToggle` is
 * a reserved chord with an explicit no-op (C16 I38) — the shape `selection.semantic`
 * held before M10b built it. A producer that declares a colormap paints today;
 * there is no reader axis to suppress it per entry, and that is §076's remainder.
 */
const VALUED_PROSE = block({
  kind: "raw",
  id: "vp",
  colormap: "viridis",
  text: "The parser tracks quotes with a boolean, so a nested quote flips it back.",
  spans: [
    { from: 4, to: 10, value: 0.9 },
    { from: 11, to: 17, value: 0.2 },
    { from: 18, to: 24, value: 0.75 },
    { from: 32, to: 39, value: 0.1 },
    { from: 42, to: 48, value: 0.95 },
  ],
}) as unknown as Block;

const VALUED_WRAP = block({
  kind: "notice",
  id: "vw",
  tone: "default",
  colormap: "viridis",
  text: "The parser tracks quotes with a boolean, so a nested quote flips it back early.",
  spans: [
    { from: 4, to: 10, value: 0.9 },
    { from: 32, to: 39, value: 0.1 },
    { from: 70, to: 75, value: 0.95 },
  ],
}) as unknown as Block;

const valuedTokens = (width: number, capabilities: TerminalCapabilities, theme: ResolvedTheme): readonly string[] => {
  const pass = (at: number, caption: string): readonly string[] => {
    const kit = measurable({ theme, capabilities });
    const lines = kit.renderToLines(VALUED_PROSE, at);
    const grid = styledScreenFrom([lines.join("\n")], { columns: at, rows: lines.length });
    return [caption, ...maskOf(grid), ""];
  };
  const wrapPass = (at: number, caption: string): readonly string[] => {
    const kit = measurable({ theme, capabilities });
    const lines = kit.renderToLines(VALUED_WRAP, at);
    const grid = styledScreenFrom([lines.join("\n")], { columns: at, rows: lines.length });
    return [caption, ...maskOf(grid), ""];
  };
  return [
    ...pass(width, "· room to spare — one ground per valued token, and none on the words between them"),
    // **`notice` and not `raw` for this pass, and the frame is why.** `raw`
    // does not wrap: squeezed, it clips and draws `~`, so a caption about a
    // token moving down whole was claiming what the picture did not show.
    ...wrapPass(Math.max(16, Math.floor(width / 2)), "· squeezed — a valued token that cannot fit moves down WHOLE, its ground unbroken across no line: `atomsOf` emits an atom per valued run"),
  ];
};

// --- §026, the trail and the mark ------------------------------------------

/**
 * One character per cell keyed on the **foreground**, which is `maskOf`'s
 * mirror and the channel §026 lives in.
 *
 * **A ground mask cannot see this surface at all.** §026's two carriers are a
 * cooling ramp over the last three cells and a mark in `accent` — both are ink,
 * and every cell here has the same background, so `maskOf` draws the whole block
 * as one letter. The band is a *gradient*, so the letters change cell by cell
 * along it: a trail that cooled in one step and a trail that cooled over three
 * are two different pictures here and one picture under any assertion that asks
 * only whether a ramp is present.
 */
function inkOf(
  grid: readonly (readonly { ch: string; style: { fg: string } }[])[],
): readonly string[] {
  const seen = new Map<string, string>();
  const letter = (fg: string): string => {
    if (fg === "") return ".";
    const held = seen.get(fg);
    if (held !== undefined) return held;
    const next = String.fromCharCode(97 + seen.size);
    seen.set(fg, next);
    return next;
  };
  const body = grid.map((row) => {
    const mask = row.map((c) => letter(c.style.fg)).join("");
    return `${mask} ${row.map((c) => c.ch).join("").replace(/\s+$/u, "")}`;
  });
  return seen.size === 0 ? body : [...body, ...[...seen].map(([fg, l]) => `  ${l} = fg ${fg}`)];
}

const STREAM_TEXT = "The parser tracks quotes with a single boolean, which is why";

/** The width where the mark's two cells move a word (see `streamHead`). */
const RESERVATION_WIDTH = 48;

/**
 * §026 — *the TRAIL says what just arrived, the MARK says more is coming*.
 *
 * **Two carriers, and the frame's job is to show they are independent.** The
 * registry draws the mark as an empty `sp-agent` span, so the plain-text fixture
 * holds one frame of a spinner and the rule's own text lost it; here the set is
 * asked for the frame the tick names, and the column it lands in is read rather
 * than searched for.
 *
 * The 1-bit pass is what separates them: the trail is colour and dies (C09 I91),
 * the mark is shape and does not (C09 I101). A surface showing only the coloured
 * rung would draw two carriers that could be one fact twice over.
 */
const streamHead = (
  width: number,
  capabilities: TerminalCapabilities,
  theme: ResolvedTheme,
): readonly string[] => {
  const pass = (b: Block, caps: TerminalCapabilities, caption: string, at = width): readonly string[] => {
    const kit = measurable({ theme, capabilities: caps });
    const lines = kit.renderToLines(b, at);
    const grid = styledScreenFrom([lines.join("\n")], { columns: at, rows: lines.length });
    return [caption, ...inkOf(grid), ""];
  };
  const streaming = block({ kind: "notice", id: "sh", tone: "default", text: STREAM_TEXT, streaming: true }) as unknown as Block;
  const settled = block({ kind: "notice", id: "sh", tone: "default", text: STREAM_TEXT }) as unknown as Block;
  const mono = { ...capabilities, colourDepth: 1 } as TerminalCapabilities;
  return [
    ...pass(streaming, capabilities, "· streaming, hot edge — the band cools over the last three CELLS toward the run's own ink, and the mark sits one space past the head in accent"),
    ...pass(settled, capabilities, "· settled — no band and no mark: nothing replaces the mark and nothing is left behind (R-BLK-188)"),
    ...pass(streaming, mono, "· streaming at 1-bit — the trail is gone and the mark is not: colour dies, shape does not, which is what makes them two carriers and not one fact twice"),
    // **At a width of the frame's own choosing, because the reservation is
    // invisible at most of them.** A caption saying *the settled block wraps two
    // cells wider* is false at 40 and at 80 — both wrap at the same word — and a
    // caption claiming what the picture does not show is the defect §076 found.
    // 48 is where the last word crosses: settled takes `boolean,` onto the first
    // row and streaming, two cells short, does not.
    ...pass(streaming, capabilities, "· the reservation, at the width where it shows — 48 columns, streaming: the mark's two cells come off the wrap, so `boolean,` moves down", RESERVATION_WIDTH),
    ...pass(settled, capabilities, "· and the same block settled at 48 — `boolean,` stays up, which is the two cells, and it is the whole of what `measure` has to agree with", RESERVATION_WIDTH),
  ];
};

// --- §073, painted chrome -------------------------------------------------

/**
 * §073's own test, run over the tree: *am I painting a THING or a FACT about a
 * thing?*
 *
 * **A classification table, not four examples.** §072 takes four hand-picked
 * subjects and asks how far each ground runs; this asks **every kind** whether it
 * paints at all, which is the only shape that can answer a rule quantified over
 * all of them. Two correct statements overlap in every cell here — *this kind
 * grounds something* and *what it grounded is a thing* — and a census indexed by
 * examples tests each against itself.
 *
 * Measured: four of twenty-three paint anything, and each is a THING (the table
 * header, C11 I24), the one FACT the section sanctions (`status`'s error tag),
 * `patch`'s changed lines (§072 ex. 1) or pixels (`image`). Nineteen paint
 * nothing, and none of §073's four never-paint cases is violated.
 */
const paintedChrome = (
  width: number,
  capabilities: TerminalCapabilities,
  theme: ResolvedTheme,
): readonly string[] => {
  const out: string[] = ["· every kind, and what it grounds — §073's test: a THING takes a ground, a FACT takes a tone"];
  for (const kind of ALL_KINDS) {
    const kit = measurable({
      theme,
      capabilities,
      definitions: [patchDefinition, tableDefinition, plotDefinition] as never,
    });
    const lines = kit.renderToLines(ONE_PER_KIND[kind] as never, width);
    const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
    const runs: string[] = [];
    for (const row of grid) {
      let run = "";
      let bg = "";
      const flush = (): void => { if (bg !== "" && run.trim() !== "") runs.push(run); };
      for (const c of row) {
        if (c.style.bg === bg) { run += c.ch; continue; }
        flush();
        bg = c.style.bg;
        run = c.ch;
      }
      flush();
    }
    out.push(runs.length === 0 ? `  ${kind.padEnd(12)} — no ground` : `  ${kind.padEnd(12)} ${JSON.stringify(runs.slice(0, 2))}`);
  }
  return [...out, ""];
};

/** §073's buttons — the four states, and the rung where the ground is gone. */
const buttonRungs = (
  width: number,
  capabilities: TerminalCapabilities,
  theme: ResolvedTheme,
): readonly string[] => {
  const btn = (id: string, tone: string) =>
    ({ kind: "notice", id, tone, text: "Approve", action: { kind: "activate", id: "a" } }) as unknown as Block;
  const pass = (focus: unknown, caption: string): readonly string[] => {
    const kit = measurable({ theme, capabilities, ...(focus === undefined ? {} : { focus }) } as never);
    const lines = kit.renderToLines(btn("b", "default"), width);
    const grid = styledScreenFrom([lines.join("\n")], { columns: width, rows: lines.length });
    return [caption, ...maskOf(grid), ""];
  };
  return [
    ...pass(undefined, "· resting — the ground IS the affordance, and it is the label plus one cell either side"),
    ...pass({ blockId: "b", rowId: "b" }, "· focused — the chosen pair, and `›` INSIDE the ground rather than before it"),
  ];
};

// --- §099, the middle cut ---------------------------------------------------

/**
 * §099 — *a path truncates in the MIDDLE, because the head says where and the
 * tail says what. Either end alone is the wrong half.*
 *
 * **The frame is the ladder, because one width proves nothing.** An end cut and
 * a middle cut are the same number of cells and both begin with the path's head;
 * what tells them apart is whether anything of the tail is left, and that is only
 * legible as a sequence of widths narrowing together. The tree cut from the end,
 * so every row here used to read `src/integ…` and nothing else.
 *
 * **§099's own three specimens are not the reference**, and `R-SEC-099` says so:
 * *the prescriptive statements are current; specimen values and sample content
 * remain examples*. Measured against them, the section's 21-cell figure ends
 * `/rser/parse.ts`, which is not a suffix of the path at all — they are drawn by
 * hand. What they settle is the bias toward the tail, which is what this draws.
 */
const middleCut = (_width: number, capabilities: TerminalCapabilities): readonly string[] => {
  const path = "src/integration/parser/parse.ts";
  const full = cells(path, capabilities.ambiguousWidth);
  const out = ["· a path narrowing — the head says WHERE, the tail says WHAT, and both survive to the last cell"];
  for (const at of [full, 29, 24, 21, 16, 11, 8, 5, 3]) {
    if (at > full) continue;
    const cut = truncate(path, at, capabilities, "middle");
    out.push(`  ${String(at).padStart(3)} │${cut}│ ${String(cells(cut, capabilities.ambiguousWidth))} cells`);
  }
  out.push("", "· the same widths cut from the END — what the tree drew, and *what* is gone by 24");
  for (const at of [29, 24, 21, 16, 11]) {
    out.push(`  ${String(at).padStart(3)} │${truncate(path, at, capabilities, "end")}│`);
  }
  return [...out, ""];
};

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
  { section: 37, name: "every registered ink ramp — the fills, the effects, and the rung where motion stops", rows: inkCensus() },
  { section: 34, name: "the same bar painted, and the glyph rung beneath it", rows: paintedBar() },
  { section: 35, name: "quantity, granularity and liveness — five triples, two of them the presets", rows: meterAxes() },
  { section: 72, name: "the background is a second channel — the ground census", rows: groundCensus([
    { name: "a changed line, ex. 1 — the ground runs to the block's edge", block: DIFF },
    { name: "a tag with extent, ex. 3 — and the error tag is the only one", block: STATUS },
    { name: "a posture, ex. 3 — TEXT, never a ground", block: POSTURES },
    { name: "a well — structural, never semantic", block: WELL },
  ]) },
  { section: 44, name: "two selections, one clipboard — the four grounds R-SEL-006 names", rows: selectionGrounds },
  { section: 58, name: "what copy takes — the source beside the rendering", rows: copyCensus },
  { section: 82, name: "no pushed views — a row expanded in place, and the rows below carrying on", rows: expansionGrounds },
  { section: 17, name: "focus treatment follows the shape — what each kind publishes against what it draws", rows: focusByShape },
  { section: 76, name: "per-token values — the valued run, and the token that wraps whole", rows: valuedTokens },
  { section: 26, name: "the trail and the mark at the head — two carriers, and what each survives", rows: streamHead },
  { section: 99, name: "the middle cut — a path narrowing, beside the end cut it replaced", rows: (w, c) => middleCut(w, c) },
  { section: 73, name: "painted chrome — every kind against §073's test, and the button's rungs", rows: (w, c, t) => [
    ...paintedChrome(w, c, t),
    ...buttonRungs(w, c, t),
  ] },
  { section: 19, name: "the resolved keymap, the reader's own rung first", rows: keymapCensus },
  { section: 21, name: "the scrollbar — the set, and the bar beside a box", rows: (w, c, t) => [
    ...scrollbarCensus(w, c),
    ...draw(SCROLLED)(w, c, t),
  ] },
]);
