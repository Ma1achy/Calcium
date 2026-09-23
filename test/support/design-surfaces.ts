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
import { measurable } from "./render.js";
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
  { section: 19, name: "the resolved keymap, the reader's own rung first", rows: keymapCensus },
  { section: 21, name: "the scrollbar — the set, and the bar beside a box", rows: (w, c, t) => [
    ...scrollbarCensus(w, c),
    ...draw(SCROLLED)(w, c, t),
  ] },
]);
