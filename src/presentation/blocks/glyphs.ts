/**
 * C09 §4 — the substitution table, and the rule that governs it.
 *
 * **Every substitution is 1:1 by column count** (I5). This is not tidiness: a
 * measurer works in cells, and a fallback glyph that is two cells where the
 * original was one makes every measured height wrong — for users with a
 * non-UTF-8 locale, and only for them, which is the hardest kind of report to
 * act on.
 *
 * The ellipsis is the case that catches people, and it is the reason the ASCII
 * truncation marker is `~` rather than `...` (C04 §5).
 *
 * `bmp` takes the Unicode set. Every glyph here is in the basic plane, and
 * `ascii` is for terminals that cannot draw beyond it at all — a terminal that
 * has box drawing and no astral planes still gets `┌` and `✓`.
 */
import type { Glyph } from "../../data/viewmodel/types.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { cells } from "../text.js";

/**
 * One name per glyph rôle. The two sets are declared side by side rather than
 * as a lookup keyed on the Unicode character, so a new rôle cannot be added
 * without deciding its fallback — and T2.5 asserts every pair is 1:1.
 */
/**
 * **`progressFull` and `progressEmpty` were here and are gone** (roadmap 51).
 * A bar's glyphs are a *style* now — `barStyle(caps, name)` — so one pair fixed
 * in the glyph set was the single-style version of a table, and MG24 said so the
 * moment the table arrived: two published members with no consumer left in
 * `src/`. Removed rather than exempted, because the thing that replaced them is
 * in the same file.
 */
export type GlyphSet = Readonly<{
  // Box drawing — panel borders, rules.
  horizontal: string;
  vertical: string;
  /**
   * A **broken** vertical rule — a reference line drawn beside data (C12 §3k).
   *
   * Its own slot rather than `vertical`, because a solid rule through a figure
   * reads as part of it: a forest plot's null line crossing five intervals looks
   * like a sixth interval unless it is visibly not one. ASCII takes `:`, which
   * is the same statement with the alphabet it has.
   */
  dashedVertical: string;
  /** Its transpose — a broken horizontal rule, for a gridline at a labelled row. */
  dashedHorizontal: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  /**
   * The box plot band, and the four marks it needs that nothing else did.
   *
   * `teeDown`/`teeUp` carry a median where it meets the box's top and bottom
   * edges; `stubDown`/`stubUp` are a whisker's end cap on a row with no
   * horizontal run to join. ASCII collapses all four, which is what makes the
   * figure survive C09 I22 rather than depending on it.
   *
   * **`stubLeft`/`stubRight` are the same pair rotated**, and they arrived with
   * the vertical box plot (C12 I30): a whisker running *up* ends in a cap that is
   * a horizontal stub, and the vertical pair cannot spell it. Two slots rather
   * than reusing `horizontal`, because a bare `─` at a whisker's end is
   * indistinguishable from a run that continues.
   */
  teeDown: string;
  teeUp: string;
  stubDown: string;
  stubUp: string;
  stubLeft: string;
  stubRight: string;
  /** A second centre that must never share the median's glyph (C04 I53). */
  /**
   * A candlestick's body and its crossing (C12 §3r, C12 I36).
   *
   * **Three slots and not five**: the wick is `vertical` and the doji is
   * `horizontal`, which are the same statements those slots already make.
   *
   * **Hollow is rising and filled is falling at every depth**, rather than a
   * pair reserved for the monochrome rung. I25's sweep is indexed by
   * `PlotForm` and a candlestick is a *style* on `line`, so the one rule that
   * would catch a tone-only distinction renders a document without any
   * candles in it — and the catalogue's `.plain` frames, which are what the
   * scheduled frame-read looks at, strip colour. Colour reinforces the mark
   * here; it never carries it alone.
   *
   * `candleCross` is the cell where a body shorter than one cell meets the
   * wick running past it on both sides. Without it the body wins the overlap
   * and the wick disappears at exactly the bar the reader is looking at
   * (§6b B13).
   */
  /**
   * Where a cursor points, on the rule below the plot area (C12 §3s, C12 I37).
   *
   * **Its own slot beside `dashedVertical` because the two do different jobs.**
   * The dashed line runs behind the data and disappears under it, which is
   * right for a reference line and wrong for the one mark that has to survive a
   * dense column. This one sits on the rule, where nothing else is drawn.
   *
   * It shares a code point with `warning` and never shares a figure: one is a
   * notice's tone mark and one is a plot's axis. Named separately so a theme or
   * a substitution can move either without moving the other.
   */
  cursorMark: string;
  candleHollow: string;
  candleFilled: string;
  candleCross: string;
  diamond: string;
  /** Mean and median in one cell, so *they coincide* never reads as *it is missing* (C12 I33). */
  diamondTee: string;
  teeLeft: string;
  teeRight: string;

  // Status — steps, notices, cells.
  tick: string;
  cross: string;
  filled: string;
  hollow: string;
  dotted: string;
  blocked: string;
  warning: string;
  bar: string;

  // Sort indicators — the active column's header (C11 §4, A01 A.4).
  sortAsc: string;
  sortDesc: string;

  // Progress.

  /**
   * The residue marker's lead, on a bounded region (C04 I49).
   *
   * **A slot and never a literal** — F122's rule. The fallback is `~` and not
   * `...`, and T2.5 is what decided it: every pair is 1:1 by cell count, and
   * three dots are three cells where `⋯` is one. That is the same
   * measurement that made the ASCII truncation marker `~` (C04 §5), reached a
   * second time by a rule rather than by an author.
   */
  residue: string;
}>;

const UNICODE: GlyphSet = Object.freeze({
  residue: "\u22ef",
  horizontal: "─",
  vertical: "│",
  dashedVertical: "┊",
  dashedHorizontal: "┄",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  teeDown: "┬",
  teeUp: "┴",
  stubDown: "╷",
  stubUp: "╵",
  stubLeft: "╴",
  stubRight: "╶",
  cursorMark: "▲",
  candleHollow: "▯",
  candleFilled: "┃",
  candleCross: "┿",
  diamond: "◆",
  diamondTee: "◈",
  teeLeft: "├",
  teeRight: "┤",

  tick: "✓",
  cross: "✗",
  filled: "●",
  hollow: "○",
  dotted: "◌",
  blocked: "⊘",
  warning: "▲",
  bar: "▌",

  sortAsc: "↑",
  sortDesc: "↓",

});

const ASCII: GlyphSet = Object.freeze({
  residue: "~",
  horizontal: "-",
  vertical: "|",
  dashedVertical: ":",
  dashedHorizontal: "-",
  topLeft: "+",
  topRight: "+",
  bottomLeft: "+",
  bottomRight: "+",
  teeDown: "+",
  teeUp: "+",
  stubDown: "|",
  stubUp: "|",
  stubLeft: "-",
  stubRight: "-",
  cursorMark: "^",
  candleHollow: "=",
  candleFilled: "#",
  candleCross: "+",
  diamond: "x",
  diamondTee: "X",
  teeLeft: "+",
  teeRight: "+",

  tick: "+",
  cross: "x",
  filled: "*",
  hollow: "o",
  dotted: ".",
  blocked: "/",
  warning: "!",
  bar: "|",

  sortAsc: "^",
  sortDesc: "v",

});

/** The pairs, for the test that asserts each is 1:1 (T2.5). */
export const SUBSTITUTIONS: readonly (readonly [string, string])[] = Object.freeze(
  (Object.keys(UNICODE) as (keyof GlyphSet)[]).map(
    (key) => Object.freeze([UNICODE[key], ASCII[key]]) as readonly [string, string],
  ),
);

/**
 * The set a renderer draws from. Capabilities arrive through the context and
 * never from the environment (I3) — a renderer probing for itself is the bug
 * that draws a table in ASCII beside a sparkline in Unicode.
 */
export function glyphs(
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): GlyphSet {
  if (caps.unicode === "ascii") return ASCII;
  // **The ASCII set is also the wide set, and that is a ruling** (C02 I9,
  // roadmap 51).
  //
  // Box drawing is `East_Asian_Width=Ambiguous` throughout — `─ │ ┌ ┐ └ ┘ ├ ┤`
  // — and so are `▌`, `█`, `░`, `●`, `○`, `▲`, `↑`, `↓`. That is nearly this
  // whole set: on a terminal that draws ambiguous glyphs wide, every panel
  // border, every rule, every progress bar and every table's furniture is twice
  // the width it was measured at, and the frame is not a frame any more.
  //
  // **`▌` is the framework's own instance of the finding**, beside the
  // sparkline's ramp: `GlyphSet.bar` shipped as a half block, and a progress
  // bar of 40 cells drew 80.
  //
  // The alternative was a third set — narrow substitutes where they exist — and
  // it is the better answer the day someone measures one. It is not this
  // change: `⋅ ∘ ◦` are narrow and `─ │ ┌` have no narrow form at all, so a
  // third set is mostly ASCII with a few survivors, and *mostly ASCII* dressed
  // as Unicode is worse than ASCII. Degradation preserves meaning, not
  // appearance.
  return caps.ambiguousWidth === "wide" ? ASCII : UNICODE;
}

/**
 * A spinner set: its frames, its own tick, and the fallback it degrades to.
 *
 * **The interval belongs to the set and not to the caller** (roadmap 51).
 * Frames × ms lands near 800–1600 ms for a spinner, and a caller that picks a
 * 28-frame set and gets a 10-frame default makes it frantic. The one deliberate
 * exception is a **second category** rather than a slow spinner — see
 * `fullramp`.
 *
 * **`ascii` is paired by shape of motion, not by name.** Degradation preserves
 * meaning rather than appearance, and a bloom falling to a rotation loses more
 * than it needs to: a pulse falls to a pulse, a rotation to a rotation, a
 * counter is already ASCII, a toggle to two frames.
 *
 * **`narrowOnly` is a tier and not a refusal**, which is what `ambiguousWidth`
 * changed. Every frame of these sets is `East_Asian_Width=Ambiguous` — the
 * eighth blocks, the box drawing, the half circles — so they are one cell where
 * the terminal says narrow and two where it says wide, and a frame that changes
 * width reflows the row every tick. Before C02 I9 the only safe answer was to
 * refuse them; now the capability says which arm applies.
 */
type SpinnerSet = Readonly<{
  frames: readonly string[];
  intervalMs: number;
  ascii: readonly string[];
  narrowOnly?: boolean;
}>;

const PULSE_ASCII = Object.freeze([".", "o", "O", "@", "*"]);
const TURN_ASCII = Object.freeze(["-", "\\", "|", "/"]);
const TOGGLE_ASCII = Object.freeze(["+", "x"]);
const DIGITS = Object.freeze(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

/**
 * The registered sets (roadmap 51, `docs/notes/CALCIUM_SPINNERS.md`).
 *
 * Every frame is one cell **under the arm it is registered for**, asserted at
 * construction by T2.70 rather than promised in a comment — which is the row
 * that stops the next addition being `▓ ▒ ░`.
 */
export const SPINNER_SETS: Readonly<Record<string, SpinnerSet>> = Object.freeze({
  // braille — the de-facto default, and narrow everywhere.
  /**
   * **Named `braille` and not `dots`, and the rename is a finding.** MG24
   * matches published members by name, and `UNCONSUMED_MEMBERS` carries
   * `Grid.dots` — so a key called `dots` in this table made an unrelated
   * exemption look wired and `make enforce` reported it as stale. Sixth
   * measured instance of F105/F160's blind spot, and the first where the fix
   * was a trade rather than a syntax change: indexing a capture group cost a
   * token, and this cost a name.
   *
   * The trade went this way because the census is worth more than the syntax
   * and `braille` is the family the catalogue itself names — *braille, the
   * de-facto default* — so the rename loses nothing.
   */
  braille: Object.freeze({
    frames: Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    intervalMs: 80,
    ascii: TURN_ASCII,
  }),
  braille2: Object.freeze({
    frames: Object.freeze(["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]),
    // 110 rather than the catalogue's 80: eight frames at 80 is a 640 ms
    // cycle, which is outside the 800–1600 band the same document states.
    // The rule is right and the row was not — found by asserting the rule.
    intervalMs: 110,
    ascii: TURN_ASCII,
  }),
  bounce: Object.freeze({
    frames: Object.freeze(["⠁", "⠂", "⠄", "⠂"]),
    intervalMs: 130,
    ascii: PULSE_ASCII,
  }),
  orbit: Object.freeze({
    frames: Object.freeze(["⠁", "⠈", "⠐", "⠠", "⢀", "⡀", "⠄", "⠂"]),
    intervalMs: 90,
    ascii: TURN_ASCII,
  }),

  // dingbats — these vary by weight and spoke count, so they pulse rather than
  // rotate, and a rotation built from them reads as a flicker.
  grow: Object.freeze({
    frames: Object.freeze(["✦", "✢", "✲", "✶", "✷", "✹", "✺", "✹", "✷", "✶", "✲", "✢"]),
    intervalMs: 90,
    ascii: PULSE_ASCII,
  }),
  /**
   * **`narrowOnly` because of one frame**, and the catalogue is wrong about it:
   * it records `⋅` (dot operator), `∘` (ring operator) and `◦` (white bullet)
   * as narrow substitutes for the ambiguous `·`. They are not — U+22C5, U+2218
   * and U+25E6 are all `East_Asian_Width=Ambiguous`, exactly like the character
   * they were chosen to replace. Found by asserting the width rule over the
   * sets rather than by reading the table.
   *
   * The tier absorbs them, which is the point: before C02 I9 this would have
   * been a fourth row on the refusal list.
   */
  bloom: Object.freeze({
    frames: Object.freeze(["⋅", "✧", "✦", "✢", "✻", "✾", "❀", "✿", "❀", "✾", "✻", "✢", "✦", "✧"]),
    intervalMs: 95,
    ascii: PULSE_ASCII,
    narrowOnly: true,
  }),
  starfield: Object.freeze({
    frames: Object.freeze(["✶", "✷", "✸", "✹", "✺", "✹", "✸", "✷"]),
    intervalMs: 110,
    ascii: PULSE_ASCII,
  }),

  /**
   * **A second category, not a slow spinner.** At 130 ms a 22-frame ping-pong
   * is a ~5.7 s cycle where everything else is 0.9–1.6 s: it reads as *present*
   * rather than as *working*, closer to an idle pulse than to a job indicator,
   * and that is why it carries its own tick rather than being tuned toward the
   * band.
   *
   * The unsafe frames of the full ramp are dropped rather than substituted —
   * `·` and `✽` are ambiguous, `✳ ✴ ❄ ❈` have emoji presentations, and an emoji
   * form is two cells wherever the font prefers it whatever the locale says.
   */
  fullramp: Object.freeze({
    frames: Object.freeze([
      "⋅", "∘", "◦", "✧", "✦", "✢", "✲", "✵", "✶", "✷", "✱",
      "✺", "✹", "✸", "✼", "✻", "❃", "❁", "✾", "❀", "✿", "❂",
    ]),
    intervalMs: 130,
    ascii: PULSE_ASCII,
    // `⋅ ∘ ◦` — see `bloom`.
    narrowOnly: true,
  }),

  // counters — a counter says work is being done; a spinner says time is
  // passing. Different signals, and a tool call and a thinking pause are not
  // the same thing.
  decimal: Object.freeze({ frames: DIGITS, intervalMs: 140, ascii: DIGITS }),
  hex: Object.freeze({
    frames: Object.freeze([..."0123456789abcdef"]),
    intervalMs: 110,
    ascii: Object.freeze([..."0123456789abcdef"]),
  }),
  binary4: Object.freeze({
    frames: Object.freeze(
      Array.from({ length: 16 }, (_unused, n) => String.fromCodePoint(0x2800 + n)),
    ),
    intervalMs: 120,
    ascii: DIGITS,
  }),

  // toggle — a heartbeat rather than a spin. Two frames need ~400 ms or they
  // strobe.
  // `⊶ ⊷` are U+22B6/U+22B7, mathematical operators and ambiguous with them.
  toggle: Object.freeze({
    frames: Object.freeze(["⊶", "⊷"]),
    intervalMs: 400,
    ascii: TOGGLE_ASCII,
    narrowOnly: true,
  }),

  // ascii — the fallback set as a set in its own right, so a caller may ask for
  // it deliberately rather than by degrading into it.
  line: Object.freeze({ frames: TURN_ASCII, intervalMs: 130, ascii: TURN_ASCII }),
  balloon: Object.freeze({ frames: PULSE_ASCII, intervalMs: 160, ascii: PULSE_ASCII }),

  // narrow-only — available where the terminal says ambiguous is one cell, and
  // degraded to their ASCII pair where it says two. These were a refusal list
  // before C02 I9 (`docs/notes/CALCIUM_SPINNERS.md`); the capability turns them
  // into a tier.
  circleQuarters: Object.freeze({
    frames: Object.freeze(["◴", "◷", "◶", "◵"]),
    intervalMs: 140,
    ascii: TURN_ASCII,
    narrowOnly: true,
  }),
  boxBounce: Object.freeze({
    frames: Object.freeze(["▖", "▘", "▝", "▗"]),
    intervalMs: 140,
    ascii: TURN_ASCII,
    narrowOnly: true,
  }),
  arc: Object.freeze({
    frames: Object.freeze(["◜", "◠", "◝", "◞", "◡", "◟"]),
    // 130 rather than the catalogue's 100 — six frames at 100 is 600 ms, the
    // second row found outside the band the same document states, after
    // `dots2`. Two of fifteen, which is why the band is asserted rather than
    // trusted.
    intervalMs: 130,
    ascii: TURN_ASCII,
    narrowOnly: true,
  }),
  growVertical: Object.freeze({
    frames: Object.freeze(["▁", "▃", "▄", "▅", "▆", "▇", "▆", "▅", "▄", "▃"]),
    intervalMs: 100,
    ascii: PULSE_ASCII,
    narrowOnly: true,
  }),
});

/** The default, and the set this returned before it took a name. */
const DEFAULT_SET = "braille";

function setFor(name: string): SpinnerSet {
  return SPINNER_SETS[name] ?? SPINNER_SETS[DEFAULT_SET] ?? { frames: [], intervalMs: 80, ascii: [] };
}

/**
 * The spinner's frames, one per tick (§2).
 *
 * **Two arms rather than one refusal** (C02 I9). A set whose frames are
 * ambiguous is one cell where the terminal says narrow and two where it says
 * wide, and a frame that changes width shifts everything on its row every tick —
 * so the wide arm takes the ASCII pair rather than the set being refused
 * outright, which is what the catalogue had to do before the capability existed.
 *
 * An unknown name is the default rather than a throw: a spinner is decoration,
 * and a session that will not start because a set was misspelled is worse than
 * one that spins the wrong way.
 */
export function spinnerFrames(
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  name: string = DEFAULT_SET,
): readonly string[] {
  const set = setFor(name);
  if (caps.unicode === "ascii") return set.ascii;
  return set.narrowOnly === true && caps.ambiguousWidth === "wide" ? set.ascii : set.frames;
}

/**
 * A determinate bar's on/off pair (roadmap 51's bar half, roadmap 22's sibling).
 *
 * **The same shape as `SpinnerSet` and for the same reason.** A style is a pair
 * of glyphs plus the tier it is available at, and pairing the ASCII fallback
 * *with* the set is what stops a caller holding one style's `on` and another's
 * `off` — the drift the spinner table's pairing exists to prevent.
 *
 * **`narrowOnly` on six of the seven unicode styles, measured rather than
 * inferred.** `▐ ░ ▬ ▪ ▫ ▮ ▯ ▰ ▱ ◼ ◻` are `East_Asian_Width=Ambiguous` every
 * one, so a terminal declaring `wide` draws them at double and a bar whose
 * glyphs double is not a bar. **`braille` is the only width-stable unicode
 * style**, which `CALCIUM_BARS.md` did not say and its determinate table read
 * against — *`▐` is the only narrow half block* is about which glyph is one cell
 * at the narrow convention, not about which are stable across conventions.
 */
type BarStyle = Readonly<{
  on: string;
  off: string;
  narrowOnly?: boolean;
}>;

/**
 * **`#` and `.`, which is the ASCII pair that already shipped.**
 *
 * `CALCIUM_BARS.md`'s `ascii` row says `#` and `-` *wrapped in `[ ]`*; the tree
 * drew `#` and `.` with no brackets. The catalogue is wrong a sixth time and in
 * the same direction as the other five — written by inference rather than from
 * the code — and the golden frames are what said so, at the ASCII widths, after
 * the unicode ones had already gone green.
 */
const BAR_ASCII: BarStyle = Object.freeze({ on: "#", off: "." });

/**
 * The styles, and `ascii` is the floor every arm falls to.
 *
 * An unknown name is the default rather than a throw, on `spinnerFrames`'s
 * argument: a bar is decoration over a number that is already correct, and a
 * session that will not start because a style was misspelled is worse than one
 * drawn with the wrong glyph.
 */
const BAR_STYLES: Readonly<Record<string, BarStyle>> = Object.freeze({
  /**
   * **The default, and it is the glyphs that already shipped** — `progressFull`
   * and `progressEmpty` were `█` and `░`, so `block` is those two under a name.
   *
   * Found by the golden frames rather than by reading: making `halfblock` the
   * default restyled every bar in the tree from solid to striped, which is a
   * visible change to shipped output arriving as a side effect of adding a
   * field. **A table of styles must contain the one that was already drawn**, or
   * its default is a redesign nobody asked for.
   */
  block: Object.freeze({ on: "█", off: "░", narrowOnly: true }),
  halfblock: Object.freeze({ on: "▐", off: "░", narrowOnly: true }),
  rectangle: Object.freeze({ on: "▬", off: "░", narrowOnly: true }),
  beads: Object.freeze({ on: "▪", off: "▫", narrowOnly: true }),
  posts: Object.freeze({ on: "▮", off: "▯", narrowOnly: true }),
  slant: Object.freeze({ on: "▰", off: "▱", narrowOnly: true }),
  squares: Object.freeze({ on: "◼", off: "◻", narrowOnly: true }),
  // **No `narrowOnly`, and it is the only one.** Braille is `Neutral`, so it is
  // one cell under both conventions — which is what makes it the style a wide
  // terminal keeps rather than the one it loses.
  braille: Object.freeze({ on: "⣿", off: " " }),
  ascii: BAR_ASCII,
});

export const DEFAULT_BAR_STYLE = "block";

/**
 * The pair a determinate bar draws with, at this terminal (roadmap 51).
 *
 * **`spinnerFrames`'s shape exactly**, including the order of the two tests: the
 * unicode tier first, then the ambiguous-width tier, because a terminal that
 * cannot draw the glyph at all is not a terminal that draws it twice as wide.
 */
export function barStyle(
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  name: string = DEFAULT_BAR_STYLE,
): Readonly<{ on: string; off: string }> {
  const style = BAR_STYLES[name] ?? BAR_STYLES[DEFAULT_BAR_STYLE];
  if (style === undefined) return BAR_ASCII;
  if (caps.unicode === "ascii") return BAR_ASCII;
  return style.narrowOnly === true && caps.ambiguousWidth === "wide" ? BAR_ASCII : style;
}

/** The style names, for the catalogue's own row and for a consumer listing them. */
export const barStyleNames = (): readonly string[] => Object.freeze(Object.keys(BAR_STYLES));

/**
 * The set's own tick, in milliseconds (roadmap 51).
 *
 * **The interval belongs to the set**, so this is the same lookup rather than a
 * second table: a caller holding frames from one set and an interval from
 * another is the drift the pairing exists to prevent.
 */
export function spinnerIntervalMs(name: string = DEFAULT_SET): number {
  return setFor(name).intervalMs;
}

// --- the `Glyph` vocabulary (C04 §5, C09 §4) --------------------------------

/**
 * Both renderings of every glyph a *block* can name.
 *
 * Separate from `GlyphSet` deliberately. `GlyphSet` is the set C09 draws from
 * on its own account — borders, spinner frames, progress bars — and its rôles
 * are internal. This is the vocabulary C04 exposes, and its members are chosen
 * by what the surfaces illustrate rather than by what the renderers happen to
 * need. Merging them would let an internal rôle leak into the block schema, and
 * a schema field is much harder to take back than a private constant.
 *
 * The rôles overlap in places and the characters are shared. That is fine: the
 * two tables agreeing is a property, not a coincidence to be enforced away.
 */
const GLYPH_TABLE: Readonly<Record<Glyph, readonly [unicode: string, ascii: string]>> =
  Object.freeze({
    ok: ["✓", "+"],
    warn: ["▲", "!"],
    error: ["✗", "x"],
    info: ["ℹ", "i"],
    pending: ["◌", "."],
    working: ["◐", "%"],
    running: ["●", "*"],
    queued: ["○", "o"],
    cancelled: ["⊘", "/"],
    expand: ["▸", ">"],
    collapse: ["▾", "v"],
    live: ["▌", "|"],
    bullet: ["•", "-"],
    // **U+23BF is `East_Asian_Width=Neutral` — one cell under both
    // conventions**, where `└` and `╰` are Ambiguous and draw two, as do `▲`
    // and `⋯` above. That buys nothing today, because `glyphs()` discards the
    // Unicode set wholesale at `ambiguousWidth: "wide"` and this table follows
    // `unicode` alone. Recorded because §4's note says a third set of narrow
    // survivors is the better answer the day someone measures one, and this is
    // one. The ASCII half is `tree(1)`'s rendering of the same hook.
    continuation: ["⎿", "`"],
  });

/** The pairs, for the test that asserts each is 1:1 by cell count (I5). */
export const GLYPH_SUBSTITUTIONS: readonly (readonly [string, string])[] = Object.freeze(
  Object.values(GLYPH_TABLE).map((pair) => Object.freeze([pair[0], pair[1]]) as readonly [string, string]),
);

export const GLYPH_TOKENS: readonly Glyph[] = Object.freeze(
  Object.keys(GLYPH_TABLE) as Glyph[],
);

/**
 * A block's glyph slot, resolved against capabilities. The single place either
 * character enters a frame.
 */
export function glyphFor(token: Glyph, caps: Pick<TerminalCapabilities, "unicode">): string {
  const pair = GLYPH_TABLE[token];
  return caps.unicode === "ascii" ? pair[1] : pair[0];
}

/**
 * The cells a resolved glyph occupies, without needing capabilities.
 *
 * This is what the 1:1 rule is *for*. `measure` receives width and no
 * capability record (C04 §5), so it can only be correct if both renderings are
 * the same width — and T2.5 asserts that over the whole table rather than
 * trusting the two columns above to stay in step.
 */
export function glyphCells(token: Glyph): number {
  // narrow-ok — the two renderings of one slot are compared against each
  // other, and the comparison holds under either convention: an ambiguous
  // pair is 1:1 at narrow and 2:2 at wide. Passing a capability here would
  // make a property of the table depend on the terminal reading it.
  return cells(GLYPH_TABLE[token][0]); // narrow-ok
}
