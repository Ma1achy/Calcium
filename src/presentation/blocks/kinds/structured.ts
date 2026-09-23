/**
 * `keyValue`, `logs`, `events`, `diff`, `steps`.
 *
 * Five kinds of one row per item. Their heights are the cheapest in the system
 * to measure and the easiest to get wrong in one direction only: each renders
 * columns, and a column that wraps instead of truncating turns a height of
 * `rows` into a height of "it depends" (§3).
 *
 * Nothing here wraps. `logs` in particular is never wrapped — predictable height
 * is what lets a tail scroll smoothly at a thousand lines a second (T5.4).
 */
import type { AmbiguousWidth } from "../../text.js";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Comparison, Events, Glyph, KeyValue, Logs, Steps, Tone } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate } from "../../text.js";
import { glyphFor, glyphs, spinnerFrames } from "../glyphs.js";
import { valueBar } from "../../plot/bar.js";
import { clampSpans, pad, paint, rows, tone, type Span } from "../paint.js";
import { naturalSpan, shedRow } from "../shed.js";
import type { BlockDefinition, RenderContext, Windowed, Rendered } from "../types.js";

/** §3: the key column is sized to the longest key and capped here. */
const KEY_COLUMN_CAP = 20;

/** Two spaces between columns. One reads as a typo; three wastes a narrow terminal. */
const COLUMN_GAP = 2;

/** The narrowest detail beside a bar that carries a character as well as an ellipsis. */
const MIN_DETAIL = 2;

/** A few words — the floor below which a message is better shed around than kept (C09 I81). */
const MIN_MESSAGE = 12;

/**
 * What an event type would shrink to if it could — **and it cannot** (C09 I81).
 *
 * Declared so the `decoration` tier has something to overrule: the tier floors
 * a decoration part at its natural width whatever it asked for, so this number
 * is never the width the type is drawn at. It is here to make the rule
 * falsifiable rather than to be obeyed.
 */
const MIN_TYPE = 3;

/**
 * The floor for a value, a field name or a step label — a short number or a
 * word and an ellipsis (C09 I81). Below it a part is a stub, and the rule is
 * that every part still drawn can be read, so the ladder sheds around it
 * instead.
 */
const MIN_PART = 4;

function widest(values: readonly string[], cap: number, ambiguous: AmbiguousWidth = "narrow"): number {
  let widest = 0;
  for (const value of values) widest = Math.max(widest, cells(value, ambiguous));
  return Math.min(cap, widest);
}

// --- keyValue --------------------------------------------------------------

/**
 * A row's value column — a text, or a bar with the text beside it (C04 I51).
 *
 * **The bar takes what it declared and the text takes the rest**, which is the
 * inverse of `valueBar`'s own rule and is not a contradiction of it: inside the
 * bar the run is the axis and gives way to its number, while out here the bar is
 * a declared width in a column that is a remainder. `Cell.bar` needs neither
 * arm because a table column supplies the width and the cell holds nothing else.
 *
 * **Clamped to the column rather than trusted.** A surface declaring twenty
 * cells in a value column of nine is not a construction error — the same
 * document is correct at a wider terminal — so the width narrows here and the
 * bar degrades through `valueBar`'s own rungs.
 */
function valueOf(
  entry: KeyValue["rows"][number],
  valueWidth: number,
  ctx: RenderContext,
): string {

  // **`barWidth` absent is no bar, and the renderer does not invent one.**
  // `validateBlock` refuses the pair broken (C04 I51); a renderer that supplied
  // a default would make the invalid document render, which is the one thing
  // that keeps a gate from being reached.
  if (entry.bar === undefined || entry.barWidth === undefined) {
    return truncate(stripControl(entry.value), valueWidth, ctx.capabilities);
  }

  const barWidth = Math.min(Math.floor(entry.barWidth), valueWidth);
  const run = valueBar(entry.bar, barWidth, ctx.capabilities);

  // **The gap belongs to the text, not to the pair.** Added outside the
  // remainder it would put the row one cell over its width, which is the class
  // C09 I5 is about: a row the terminal wraps adds a line no measurer counted.
  // **A one-cell detail is an ellipsis and nothing else** — a mark that says
  // *there is more* while showing none of it, which is worse than the bar
  // standing alone. Read from the frame at a width of 24, where the remainder
  // came to exactly one cell; no arithmetic in this function was wrong.
  // **The detail sheds and the bar stays, and C09 I81's table had this the
  // other way round** (F1233). *Sheds the bar, then its detail* reads as though
  // the bar were a second drawing of a number the text already carries — and
  // `valueBar` **is** the number: it formats the value into the run and
  // degrades through its own rungs, so the bar is the value's narrow form and
  // not a decoration beside it. T1.5c and T1.5d have said so since C04 I51.
  //
  // **A malformed fixture is what made it look otherwise.** The probe this was
  // read from declared `bar: 0.61` where `Bar` is `{ value, max, format }`, so
  // it drew a degenerate run with no number in it — and the frame then said,
  // correctly about that block, that the bar was a duplicate carrying nothing.
  // A fixture must be shown to respond to the thing under test before it is
  // read from.
  const rest = valueWidth - barWidth - COLUMN_GAP;
  if (rest < MIN_DETAIL) return run;

  const detail = truncate(stripControl(entry.value), rest, ctx.capabilities);
  return detail === "" ? run : `${run}${" ".repeat(COLUMN_GAP)}${detail}`;
}

/**
 * The key column, derived from the whole block.
 *
 * **One function, because two would be the drift.** The window pins what this
 * returns and the render prefers the pin; a second expression of the same
 * arithmetic is how a pinned width comes to disagree with the one it was pinned
 * from — which is the defect the pin exists to prevent, reintroduced one level
 * down.
 */
function keyColumn(block: KeyValue, width: number): number {
  return widest(
    block.rows.map((r) => stripControl(r.label)),
    Math.min(KEY_COLUMN_CAP, Math.max(1, normaliseWidth(width) - 4)),
  );
}

export const keyValueDefinition: BlockDefinition<KeyValue> = {
  kind: "keyValue",

  // §7a — label and value, tab-separated (I86). Two columns is a table of two
  // columns, so it takes the same separator `table` does rather than the
  // colon-and-padding the renderer draws, which is alignment.
  copy: (block) => block.rows.map((r) => `${r.label}\t${r.value}`).join("\n"),

  measure: (block: KeyValue): number => atLeastOne(block.rows.length), // cells-ok

  // C09 §2c — the key column, the gap and the longest value; a row carrying a
  // bar fills, because the bar absorbs the residual. The floor of `keyWidth + 4`
  // is `keyColumn`'s own: it caps the key column at `width − 4`, so a narrower
  // answer would shrink the column and draw a different block.
  width: (block: KeyValue, width: number): number => {
    const w = normaliseWidth(width);
    if (block.rows.some((row) => row.bar !== undefined)) return w;
    const keyWidth = block.keyWidth ?? keyColumn(block, w);
    let longest = 0;
    for (const row of block.rows) longest = Math.max(longest, cells(stripControl(row.value))); // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42), and narrow is the measurer's convention
    return Math.max(1, Math.min(w, Math.max(keyWidth + 4, keyWidth + COLUMN_GAP + longest)));
  },

  /**
   * C09 I25 — rows `[from, to)`, as a smaller `keyValue` with its key column
   * pinned.
   *
   * **This kind was one of the two recorded as still open**, in `logs`' own
   * window comment below: *`widest` a whole `keyValue` and `tokenise` a whole
   * code block*. The blocker was real — `widest` walks every label, so a slice
   * whose keys are short draws a narrower column and every value shifts
   * sideways as the reader scrolls, which is the drift C14 exists to prevent.
   *
   * **It is a width, so it travels** (`KeyValue.keyWidth`, C25 I21a's argument
   * one kind over): the window says what its parent measured rather than
   * deriving it again. `tokenise` does not travel, which is why the two
   * separated instead of landing together — a slice of a code block is a
   * different *parse*, not a narrower column, and lines inside a block comment
   * come back as live code (F426).
   *
   * Rows are one row each (`measure` is `rows.length`) and nothing here is
   * derived from rows outside the slice once the width is pinned, so the window
   * is exact and `skipRows` is 0.
   */
  window: (block: KeyValue, width: number, from: number, to: number): Windowed => {
    const lo = Math.max(0, Math.min(Math.trunc(from), block.rows.length)); // cells-ok
    const hi = Math.max(lo + 1, Math.min(Math.trunc(to), block.rows.length)); // cells-ok
    return Object.freeze({
      block: { ...block, rows: block.rows.slice(lo, hi), keyWidth: keyColumn(block, width) },
      skipRows: 0,
      // A row is one row, so the slice ends where the range does (I26).
      dropRows: 0,
    });
  },

  render(block: KeyValue, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("keyValue.rows", block.rows.length); // cells-ok — a count of items, not a display width
    const width = normaliseWidth(ctx.width);
    const keyWidth = block.keyWidth ?? keyColumn(block, width);
    const ambiguous = ctx.capabilities.ambiguousWidth;

    // **The narrow ladder, and it engages only when the natural row does not
    // fit** (C09 I81). Above that the leftover is the value column's, which is
    // what this kind has always done and what keeps every frame that already
    // fitted exactly where it was. The ladder is the block's, not the row's:
    // one key column and one value column, or the rows stop being a table.
    //
    // **Every part carries its own leading gap and the step is given `gap: 0`.**
    // The parts of this row are not evenly separated — a bar and its text share
    // the value column — so a uniform gap would be arithmetic about a row that
    // does not exist.
    //
    // **The bar is not a part here**, and the frame is why: `barWidth` is
    // declared per row, so a block-level bar part reserves its cells on every
    // row that has no bar. Read at thirty-two columns it took eleven cells off
    // two rows to hold a bar belonging to the third. It sheds inside the value
    // column instead, where {@link valueOf} has the row that owns it.
    const valueNat = widest(block.rows.map((r) => stripControl(r.value)), width, ambiguous);
    // **The declared order** (C09 I81): the value gives way first and the key
    // is the last part standing, because a value with no key is not a fact —
    // which is the half of the invariant's table this kind's frame agreed with.
    //
    // **The key's natural is its content and not `keyColumn`'s answer**, which
    // is the width already narrowed: `keyColumn` caps at `width - 4`, so at four
    // columns it hands back **one**, and a ladder told the key naturally wants
    // one cell keeps it at one and spends the rest on a mark. Read as a frame
    // that is `… ⋯1` — a key crushed to an ellipsis beside a statement about
    // something else. A part's natural width is what it wants; what it gets is
    // the ladder's to decide, and the two must not be the same number.
    const keyNat = block.keyWidth ?? widest(block.rows.map((r) => stripControl(r.label)), KEY_COLUMN_CAP);
    const parts = [
      {
        id: "key",
        natural: keyNat,
        min: Math.min(keyNat, MIN_PART),
        tier: "content" as const,
        rank: 2,
      },
      {
        id: "value",
        natural: valueNat + COLUMN_GAP,
        min: Math.min(valueNat, MIN_PART) + COLUMN_GAP,
        tier: "content" as const,
        rank: 1,
      },
    ];

    const plan = naturalSpan(parts, 0) <= width ? null : shedRow(parts, width, 0, glyphs(ctx.capabilities).residue);
    const got = (id: string): number | null =>
      plan === null ? null : (plan.kept.find((k) => k.id === id)?.width ?? null);
    const mark = plan?.mark ?? null;
    const keyRoom = plan === null ? keyWidth : (got("key") ?? 0);
    const valueWidth =
      plan === null
        ? Math.max(1, width - keyWidth - COLUMN_GAP)
        : Math.max(0, (got("value") ?? COLUMN_GAP) - COLUMN_GAP);

    return rows(
      block.rows.map((entry) => {
        // The key truncates at the cap; the value still aligns, because the
        // column is a width rather than the longest key that happens to fit
        // (T1.5).
        const key = pad(
          truncate(stripControl(entry.label), keyRoom, ctx.capabilities),
          keyRoom,
        );
        const value = valueWidth <= 0 ? "" : valueOf(entry, valueWidth, ctx);

        return paint(
          clampSpans(
            [
              { text: key, style: tone("muted", ctx.theme, ctx.capabilities) },
              // **A shed part is not drawn, and neither is its gap.**
              ...(value === ""
                ? []
                : [
                    { text: " ".repeat(COLUMN_GAP) },
                    { text: value, style: tone(entry.tone ?? "default", ctx.theme, ctx.capabilities) },
                  ]),
              // The withholding, stated rather than silent (C09 I81).
              ...(mark === null ? [] : [{ text: ` ${mark}`, style: tone("dim", ctx.theme, ctx.capabilities) }]),
            ],
            width,
            ctx.capabilities,
          ),
        );
      }),
    );
  },
};

// --- logs ------------------------------------------------------------------

/** A level's tone. Unknown levels read as `default` rather than as an error. */
function levelTone(level: string): Tone {
  switch (level.toLowerCase()) {
    case "error":
    case "fatal":
      return "error";
    case "warn":
    case "warning":
      return "warn";
    case "debug":
    case "trace":
      return "dim";
    default:
      return "info";
  }
}

/** Levels are a fixed-width column so the messages line up (§3). */
const LEVEL_WIDTH = 5;

export const logsDefinition: BlockDefinition<Logs> = {
  kind: "logs",

  // §7a — the timestamp, the level and the message (I86). The private switch
  // this replaces took the **message alone**, which is a copy that loses when a
  // line happened and how bad it was — the two facts a reader pastes a log to
  // keep. Tab-separated, as every other multi-column source here is.
  copy: (block) => block.lines.map((l) => `${l.ts}\t${l.level}\t${l.message}`).join("\n"),

  measure: (block: Logs): number => atLeastOne(block.lines.length), // cells-ok

  /**
   * C09 I25 — rows `[from, to)`, as a smaller `logs`.
   *
   * **`logs` is the one divisible kind whose rows are independent of each
   * other**, which is what makes the window exact rather than merely the right
   * height. The level column is a constant `LEVEL_WIDTH` and the message takes
   * the residual and truncates; nothing here is derived from lines outside the
   * slice. **`patch` is the second, and it got there differently**: its gutter
   * *is* derived from the whole block, so its window carries the width pinned
   * rather than deriving it again (C25 I21a) — the layout travels with the
   * window instead of being independent of it. `keyValue` pins `widest` the
   * same way, and `code` — whose derivation is a *parse* and cannot be pinned
   * as a number — pins the whole `text` and a `lineRange` instead (C04 I82,
   * C14 §4a); a layout that changes with the scroll position is the drift C14
   * exists to prevent (C09 §2a). `planColumns` is **not** one of them and was
   * listed here in error: it reads the column definitions and the width,
   * never the rows (F134).
   *
   * `atLeastOne` is why the empty slice is refused rather than returned: a
   * `logs` with no lines measures 1, so a zero-row window would break I26. The
   * viewport never asks for one (`takeRows ≥ 1`), and the clamp says so here
   * rather than relying on it.
   */
  window: (block: Logs, _width: number, from: number, to: number): Windowed => {
    const lo = Math.max(0, Math.min(Math.trunc(from), block.lines.length)); // cells-ok
    const hi = Math.max(lo + 1, Math.min(Math.trunc(to), block.lines.length)); // cells-ok
    return Object.freeze({
      block: { ...block, lines: block.lines.slice(lo, hi) },
      skipRows: 0,
      // A line is one row, so nothing can hang past `to` (I26).
      dropRows: 0,
    });
  },

  render(block: Logs, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("logs.lines", block.lines.length); // cells-ok — a count of items, not a display width
    const width = normaliseWidth(ctx.width);

    return rows(
      block.lines.map((line) => {
        const ts = stripControl(line.ts);
        const level = pad(
          truncate(stripControl(line.level), LEVEL_WIDTH, ctx.capabilities),
          LEVEL_WIDTH,
        );

        // The message takes the residual and truncates. Wrapping it would make
        // the block's height depend on its content, and a tail that reflows is
        // a tail nobody can read (§3, T6.10).
        const room = Math.max(1, width - cells(ts, ctx.capabilities.ambiguousWidth) - LEVEL_WIDTH - COLUMN_GAP * 2);
        const message = truncate(stripControl(line.message), room, ctx.capabilities);

        return paint(
          clampSpans(
            [
              { text: ts, style: tone("meta", ctx.theme, ctx.capabilities) },
              { text: " ".repeat(COLUMN_GAP) },
              { text: level, style: tone(levelTone(line.level), ctx.theme, ctx.capabilities) },
              { text: " ".repeat(COLUMN_GAP) },
              { text: message, style: tone("default", ctx.theme, ctx.capabilities) },
            ],
            width,
            ctx.capabilities,
          ),
        );
      }),
    );
  },
};

// --- events ----------------------------------------------------------------

/**
 * A time at its floor — **seconds dropped, never an ellipsis** (C09 I81).
 *
 * The time is content, so it shrinks to a floor rather than shedding; and a
 * time cut by `truncate` reads `22:1…`, which is not a shorter time, it is a
 * broken one. Dropping the seconds is the shrink a reader can still act on, and
 * it is the kind's own knowledge rather than the shed step's — which is the
 * reason the ladder lives in the definition at all.
 */
function shortTime(ts: string): string {
  const cut = /^(\d{1,2}:\d{2}):\d{2}(.*)$/u.exec(ts);
  return cut === null ? ts : `${cut[1]!}${cut[2]!}`;
}

export const eventsDefinition: BlockDefinition<Events> = {
  kind: "events",

  // §7a — as `logs` (I86), with `type` where the level is.
  copy: (block) => block.events.map((e) => `${e.ts}\t${e.type}\t${e.message}`).join("\n"),

  measure: (block: Events): number => atLeastOne(block.events.length), // cells-ok

  render(block: Events, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("events.events", block.events.length); // cells-ok — a count of items, not a display width
    const width = normaliseWidth(ctx.width);
    const ambiguous = ctx.capabilities.ambiguousWidth;
    // **Uncapped, and the frame is what removed the cap.** A quarter of the row
    // was this kind's own guard against a long type name eating the message,
    // and under the ladder the message's floor is that guard — stated once,
    // where every part's floor is. Left in place the cap cut the type to fit
    // and drew `schedul\u2026` at thirty-two columns, which is the shredding
    // this invariant exists to remove, applied by the very kind that declares
    // the type is drawn whole or shed (C09 I81).
    const typeWidth = widest(block.events.map((e) => stripControl(e.type)), width);
    // **One ladder for the block, not one per row** (C09 I81). The columns have
    // to agree down the block or the rows stop being a table, so the parts are
    // measured over every event and the shed decision is taken once. A per-row
    // ladder would shed the type on one line and keep it on the next, which is
    // the same defect this replaces wearing a tidier shape.
    const tsWidth = widest(block.events.map((e) => stripControl(e.ts)), width, ambiguous);
    const tsFloor = widest(block.events.map((e) => shortTime(stripControl(e.ts))), width, ambiguous);
    const msgWidth = widest(block.events.map((e) => stripControl(e.message)), width, ambiguous);
    // **The declared order** (C09 I81), highest rank last to go: the time is
    // what a reader locates an event by, the message is what it says, and the
    // type is the part a row can lose and still be read. The tone costs no
    // cells, so it is never a part here — a part is something that takes width.
    //
    // **The order declared for this kind put the time above the message and the
    // frame overturned it.** *The time and the tone never shed* is right about
    // the type and wrong about the message: at sixteen columns it drew
    // `22:13:20   ⋯2`, a column of bare timestamps, which is not an event log.
    // The message is what the row says, so it is the last part standing; the
    // time still sheds after the type and never before it, which is the half of
    // the declaration the frame agreed with (C09 I81).
    const plan = shedRow(
      [
        { id: "ts", natural: tsWidth, min: tsFloor, tier: "content", rank: 2 },
        {
          // **A cut label is not a label**, so the type is a threshold rather
          // than a floor: it is drawn whole or it is shed. That is the
          // `decoration` tier's rule, and reading the frame is what assigned it
          // — at forty columns a floor of three drew `sc…` beside a message
          // with twenty cells of slack.
          id: "type",
          natural: typeWidth,
          // **A floor smaller than the natural, so the tier is what holds the
          // line** (F1233). It read `min: typeWidth` — the same number twice —
          // and the mutation pass found the consequence: `decoration` shedding
          // whole rather than shrinking could not be violated, because no kind
          // declared a minimum for it to ignore. A tier that cannot be
          // disobeyed is a tier nothing tests.
          min: MIN_TYPE,
          tier: "decoration",
          rank: 1,
        },
        {
          // **The floor carries the judgement**, which is what keeps the step
          // itself simple: twelve cells is a few words, and below that the row
          // is better off shedding the type than keeping it beside a stub.
          id: "message",
          natural: msgWidth,
          min: Math.min(msgWidth, MIN_MESSAGE),
          tier: "content",
          rank: 3,
        },
      ],
      width,
      COLUMN_GAP,
      glyphs(ctx.capabilities).residue,
    );
    // **A shed part is not drawn**, and the first draft drew one. Defaulting a
    // missing width to the floor put the message back on the row at three cells
    // beside a mark saying it had gone — the frame is what said so, and no
    // number in the plan was wrong.
    const got = (id: string): number | null => plan.kept.find((k) => k.id === id)?.width ?? null;
    const typeRoom = got("type");
    // **The time has two forms and no widths in between, so a width in between
    // is dead space** — `22:13` drawn in a column of seven, which is what the
    // frame showed at thirty-two columns before this snapped it. The step
    // distributes cells because that is what it does for a part that shrinks
    // continuously; the kind knows this one does not, and hands the surplus to
    // the part that can use it. **Which is the same knowledge the floor
    // carries**, said about the middle of the range instead of the bottom.
    const rawTs = got("ts");
    const snapped = rawTs !== null && rawTs > tsFloor && rawTs < tsWidth;
    const tsRoom = snapped ? tsFloor : rawTs;
    const rawMsg = got("message");
    const msgRoom =
      rawMsg === null || !snapped || rawTs === null ? rawMsg : rawMsg + (rawTs - tsFloor);
    const mark = plan.mark;

    return rows(
      block.events.map((event) => {
        const full = stripControl(event.ts);
        // The floor form when the column is narrower than the whole time, which
        // is the shrink rather than a cut.
        const ts = tsRoom === null ? null : pad(cells(full, ambiguous) <= tsRoom ? full : shortTime(full), tsRoom, ambiguous);

        return paint(
          clampSpans(
            [
              ...(ts === null
                ? []
                : [
                    { text: ts, style: tone("meta", ctx.theme, ctx.capabilities) },
                    { text: " ".repeat(COLUMN_GAP) },
                  ]),
              // `accent` when the producer says nothing — the behaviour before
              // the field existed, so an app that does not set it sees no
              // change (C04 I35, F51).
              ...(typeRoom === null
                ? []
                : [
                    {
                      text: pad(truncate(stripControl(event.type), typeRoom, ctx.capabilities), typeRoom),
                      style: tone(event.tone ?? "accent", ctx.theme, ctx.capabilities),
                    },
                    { text: " ".repeat(COLUMN_GAP) },
                  ]),
              ...(msgRoom === null
                ? []
                : [
                    {
                      text: truncate(stripControl(event.message), msgRoom, ctx.capabilities),
                      style: tone("default", ctx.theme, ctx.capabilities),
                    },
                  ]),
              // **The withholding, stated rather than silent** (C09 I81). It is
              // a count and not a list, because a list of what went is wider
              // than what stayed.
              ...(mark === null ? [] : [{ text: ` ${mark}`, style: tone("dim", ctx.theme, ctx.capabilities) }]),
            ],
            width,
            ctx.capabilities,
          ),
        );
      }),
    );
  },
};

// --- diff ------------------------------------------------------------------

/**
 * The judgement half, and the only half that takes a colour (C04 I36).
 *
 * The change half is rendered by {@link CHANGE_MARKERS} instead — it was always
 * neutral here (`same`→`muted`, `changed`→`default`), which is the renderer
 * having split the union before the type did.
 */
function verdictTone(verdict: "better" | "worse" | undefined): Tone {
  switch (verdict) {
    case "better":
      return "ok";
    case "worse":
      return "error";
    default:
      return "default";
  }
}

/**
 * The judgement half's mark, derived from the same field as its tone (C04 I38).
 *
 * **Without it `better` and `worse` render identically to each other and to an
 * unmarked row, at every colour depth** — F34's measured half, and the reason
 * it is the half that survived that finding's own correction: `200ms` against
 * `150ms` says nothing about which is wanted, so unlike `same`/`changed` a
 * reader cannot recover it from the two cells.
 *
 * Derived rather than supplied, because `verdict` already names the fact. A
 * glyph field here would let a producer say `worse` and draw `✓`.
 */
function verdictGlyph(verdict: "better" | "worse" | undefined): Glyph | null {
  switch (verdict) {
    case "better":
      return "ok";
    case "worse":
      return "error";
    default:
      return null;
  }
}

/**
 * The change axis, carried without colour (C04 I35).
 *
 * The same construction as `patch`'s `MARKERS` and for the same reason: at
 * `colourDepth: 1` the marker is all that is left, so the distinction survives
 * by construction rather than by a lint.
 */
const CHANGE_MARKERS: Readonly<Record<"unchanged" | "changed" | "added" | "removed", string>> =
  Object.freeze({ unchanged: " ", changed: "~", added: "+", removed: "-" });

/** The marker column's width, or 0 when no row in the block declares a change. */
const MARKER_WIDTH = 2;

/**
 * A verdict's mark, padded to the reserved width — blank when the block
 * reserved none, and blank for a row with no verdict inside a block that did.
 *
 * `glyphFor` is the single place either character enters a frame (C09 §4), so
 * the ASCII substitution is 1:1 by construction and this stays one cell wide at
 * both depths.
 */
function markFor(
  verdict: "better" | "worse" | undefined,
  reserved: number,
  ctx: RenderContext,
): string {
  if (reserved === 0) return "";
  const token = verdictGlyph(verdict);
  return pad(token === null ? "" : glyphFor(token, ctx.capabilities), reserved);
}

export const comparisonDefinition: BlockDefinition<Comparison> = {
  kind: "comparison",

  // §7a — the field and both sides, with the labels as a header row when the
  // block declares them (I86). The verdict and the change are marks this
  // component draws from the same two values, so carrying them would be the
  // rendering copied beside its source.
  copy: (block) => {
    const header = block.labels === undefined ? [] : [`\t${block.labels[0]}\t${block.labels[1]}`];
    return [...header, ...block.rows.map((r) => `${r.field}\t${r.a}\t${r.b}`)].join("\n");
  },

  // Rows plus the header (§3). The header is not optional here, so the `+ 1` is
  // unconditional — and `atLeastOne` never fires, which is correct: a comparison
  // with no rows is still a header.
  measure: (block: Comparison): number => atLeastOne(block.rows.length + 1), // cells-ok

  render(block: Comparison, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("comparison.rows", block.rows.length); // cells-ok — a count of items, not a display width
    const width = normaliseWidth(ctx.width);
    // The marker column appears only when a row declares a change, so a block
    // that uses the verdict half alone renders exactly as it did before the
    // split. Per-block and deterministic: every row of one block agrees, which
    // is what keeps the field column aligned.
    const marked = block.rows.some((r) => r.change !== undefined) ? MARKER_WIDTH : 0;
    // The verdict's mark, on the same terms and inside the `b` column: it
    // qualifies one cell rather than the row, which is where the tone already
    // sits (C04 I38).
    const judged = block.rows.some((r) => r.verdict !== undefined) ? MARKER_WIDTH : 0;
    const ambiguous = ctx.capabilities.ambiguousWidth;

    // **The narrow ladder** (C09 I81), engaged only where the natural row does
    // not fit; above that the three equal columns stand as they always have.
    // Parts carry their own leading gap and the step is given `gap: 0`, because
    // this row is not evenly separated: the change mark abuts the field name
    // and the verdict mark abuts its value inside one column.
    const labelA = stripControl(block.labels?.[0] ?? "a");
    const labelB = stripControl(block.labels?.[1] ?? "b");
    const valueNat = Math.max(
      widest(block.rows.map((r) => stripControl(r.a)), width, ambiguous),
      widest(block.rows.map((r) => stripControl(r.b)), width, ambiguous),
      cells(labelA, ambiguous),
      cells(labelB, ambiguous),
    );
    const fieldNat = Math.max(
      widest(block.rows.map((r) => stripControl(r.field)), width, ambiguous),
      cells("field", ambiguous),
    );
    // **The declared order** (C09 I81), and it is the reverse of the one the
    // invariant's table carried, because the frame overturned that one. The
    // table read *sheds the field label, then the change and verdict marks;
    // never sheds the two values*, and built that way this block drew
    // `run\u2026  run 5` over `312\u2026  289 \u2026` at sixteen columns — two anonymous
    // numbers, which is what a comparison is not. A field name with one value
    // is still a reading; two values with no field name is nothing at all.
    //
    // So the marks go first, then `a`, and the **field name is the last part
    // standing**. The two values carry **one** natural width between them — the
    // widest of either column, taken above — which is what keeps them equal:
    // equal naturals are equal slack, so they give up their cells together
    // without a rule saying they must (F1233).
    const parts = [
      ...(marked > 0
        ? [{ id: "change", natural: marked, min: marked, tier: "decoration" as const, rank: 1 }]
        : []),
      { id: "field", natural: fieldNat, min: Math.min(fieldNat, MIN_PART), tier: "content" as const, rank: 4 },
      {
        id: "a",
        natural: valueNat + COLUMN_GAP,
        min: Math.min(valueNat, MIN_PART) + COLUMN_GAP,
        tier: "content" as const,
        rank: 2,
      },
      ...(judged > 0
        ? [{ id: "verdict", natural: judged, min: judged, tier: "decoration" as const, rank: 1 }]
        : []),
      {
        id: "b",
        natural: valueNat + COLUMN_GAP,
        min: Math.min(valueNat, MIN_PART) + COLUMN_GAP,
        tier: "content" as const,
        rank: 3,
      },
    ];
    const plan = naturalSpan(parts, 0) <= width ? null : shedRow(parts, width, 0, glyphs(ctx.capabilities).residue);
    const got = (id: string): number | null =>
      plan === null ? null : (plan.kept.find((k) => k.id === id)?.width ?? null);
    const mark = plan?.mark ?? null;

    // Three equal columns (§3), the residual going to the field name — or the
    // ladder's answer where the ladder ran.
    const column =
      plan === null
        ? Math.max(1, Math.floor((width - COLUMN_GAP * 2 - marked) / 3))
        : Math.max(0, (got("b") ?? COLUMN_GAP) - COLUMN_GAP);
    // The peers move in lockstep and an odd cell goes to the earlier one, so
    // `a` is `b`'s width or one more — read rather than assumed equal.
    const columnA = plan === null ? column : Math.max(0, (got("a") ?? COLUMN_GAP) - COLUMN_GAP);
    const fieldWidth =
      plan === null ? Math.max(1, width - marked - column * 2 - COLUMN_GAP * 2) : (got("field") ?? 0);
    const changeRoom = plan === null ? marked : (got("change") ?? 0);
    const judgedRoom = plan === null ? judged : (got("verdict") ?? 0);

    const dim = tone("dim", ctx.theme, ctx.capabilities);

    /**
     * One row's spans, header and body alike.
     *
     * **A shed part is not drawn, and neither is the gap it carried.** The lead
     * is emitted only where something precedes it, so a row that shed its field
     * name does not open on two columns of nothing.
     */
    const line = (cellsOf: {
      change: string | null;
      field: string;
      a: string;
      verdict: string;
      /**
       * The cells the verdict mark takes out of the `b` column — **the body's,
       * and zero for the header.**
       *
       * The header's label has never accounted for it, so it sits two cells to
       * the left of the column it names. That is a real defect and it is **not
       * this landing's**: correcting it moves every `comparison` capture at
       * every width, where C09 I81 moves only the ones where the ladder runs,
       * and a moved frame with two candidate causes is a bisect rather than a
       * finding.
       */
      reserve: number;
      b: string;
      style: (id: "field" | "a" | "b") => ReturnType<typeof tone>;
    }): string => {
      const spans: Span[] = [];
      const lead = (): void => {
        if (spans.length > 0) spans.push({ text: " ".repeat(COLUMN_GAP) }); // cells-ok — a span count
      };
      if (changeRoom > 0) {
        spans.push({
          // **The one `pad` on this row that keeps the default, and it keeps it
          // for a reason rather than by omission**: the markers are ASCII
          // (` ~+-`), one cell at both conventions, so the convention has no
          // subject here (F1042).
          text: pad(cellsOf.change ?? " ", changeRoom),
          style: tone("muted", ctx.theme, ctx.capabilities),
        });
      }
      if (fieldWidth > 0) {
        spans.push({
          // **Cut at the session's convention, so padded at it too** (I68,
          // F1042). Every `pad` on this row carries far-side text and the
          // convention was dropped at all three, so at `wide` each column
          // started late and `clampSpans` took the difference out of the last
          // one: measured at 44 cells, `9°C ±2` came back as `9°C ±…` with the
          // row still totalling 44 — the shape no width assertion can see.
          text: pad(truncate(cellsOf.field, fieldWidth, ctx.capabilities), fieldWidth, ambiguous),
          style: cellsOf.style("field"),
        });
      }
      if (columnA > 0) {
        lead();
        spans.push({
          text: pad(truncate(cellsOf.a, columnA, ctx.capabilities), columnA, ambiguous),
          style: cellsOf.style("a"),
        });
      }
      if (column > 0) {
        lead();
        spans.push({
          // The mark and the value share the column, so the block's width is
          // what it was and `measure` — rows plus a header — is untouched
          // either way.
          text: pad(
            (cellsOf.reserve > 0 ? cellsOf.verdict : "") +
              truncate(cellsOf.b, Math.max(1, column - cellsOf.reserve), ctx.capabilities),
            column,
            ambiguous,
          ),
          style: cellsOf.style("b"),
        });
      }
      // The withholding, stated rather than silent (C09 I81).
      if (mark !== null) spans.push({ text: ` ${mark}`, style: tone("dim", ctx.theme, ctx.capabilities) });
      return paint(clampSpans(spans, width, ctx.capabilities));
    };

    // **`a` and `b`, not `before` and `after`** — the rename's ruling, which the
    // renderer had never taken. Positional rather than directional, because
    // S07's two runs have no before-and-after: it compares two runs, and calling
    // one of them "before" is wrong for half this kind's consumers. Nothing
    // asserted these labels, which is why the type carried `a`/`b` while the
    // screen said otherwise. Truncated to the column like any other cell, so a
    // long container name cannot push the header wider than the rows beneath it
    // (F33).
    // **The header reserves what the body reserves** (C09 I82, F1236). A label
    // names the cells its column holds, and the verdict's cells are not among
    // them: the mark is a verdict *about* a value, and a row declaring none
    // draws blanks there, so a header spanning it would be naming a column that
    // is sometimes empty.
    //
    // **The block was already committed to this on one column of two**, which
    // is what made the defect legible once the columns were asked for by index
    // rather than read from a frame: `run 4` sat exactly on its `a` values at
    // every width, because nothing is prefixed to that column, and `run 5` sat
    // two cells left of its `b` values. `markFor(undefined, …)` is the blank of
    // the right width — the same function the body uses for a row with no
    // verdict, rather than a second way to say two spaces.
    const header = line({
      change: null,
      field: "field",
      a: labelA,
      verdict: markFor(undefined, judgedRoom, ctx),
      reserve: judgedRoom,
      b: labelB,
      style: () => dim,
    });

    const body = block.rows.map((entry) =>
      line({
        change: CHANGE_MARKERS[entry.change ?? "unchanged"],
        field: stripControl(entry.field),
        a: stripControl(entry.a),
        verdict: markFor(entry.verdict, judgedRoom, ctx),
        reserve: judgedRoom,
        b: stripControl(entry.b),
        style: (id) =>
          id === "b"
            ? tone(verdictTone(entry.verdict), ctx.theme, ctx.capabilities)
            : id === "a"
              ? tone("default", ctx.theme, ctx.capabilities)
              : tone("muted", ctx.theme, ctx.capabilities),
      }),
    );

    return rows([header, ...body]);
  },
};

// --- steps -----------------------------------------------------------------

export const stepsDefinition: BlockDefinition<Steps> = {
  kind: "steps",

  // §7a — the label and the detail (I86). The state is a glyph and a tone;
  // what a reader pastes a step list for is what the steps *are*.
  copy: (block) =>
    block.steps.map((s) => (s.detail === undefined ? s.label : `${s.label}\t${s.detail}`)).join("\n"),

  measure: (block: Steps): number => atLeastOne(block.steps.length), // cells-ok

  render(block: Steps, ctx: RenderContext): Rendered {
    ctx.probe?.gauge("steps.steps", block.steps.length); // cells-ok — a count of items, not a display width
    const g = glyphs(ctx.capabilities);
    const frames = spinnerFrames(ctx.capabilities);
    const width = normaliseWidth(ctx.width);
    const ambiguous = ctx.capabilities.ambiguousWidth;
    // **Uncapped, for `events`' reason.** Half the row was this kind's guard
    // against a long label crowding out the detail, and under the ladder the
    // detail's floor is that guard. Left in place it cut a label that fitted.
    const labelNat = widest(block.steps.map((s) => stripControl(s.label)), width, ambiguous);
    const detailNat = widest(
      block.steps.map((s) => stripControl(s.detail ?? "")),
      width,
      ambiguous,
    );
    // Every marker is one cell in both glyph sets (§4), and the space after it
    // belongs to it — so the mark's part is two cells whatever the row holds.
    const MARK = 2;

    // **The narrow ladder** (C09 I81), engaged only where the natural row does
    // not fit.
    //
    // **The order declared for this kind in C09 I81 was about a different
    // kind.** It reads *the done steps from the ends, then the pending ones* —
    // a horizontal tape, where the steps share one row and shedding one is a
    // width decision. This kind draws one step per row, so that order asks for
    // an item to be dropped, which the same invariant refuses two paragraphs
    // later: dropping a row changes the block's element ids and orphans a C26
    // focus. The parts of *this* kind's row are the mark, the label and the
    // detail, and the order below is the one it can have. The spec is corrected
    // rather than the frame bent to it.
    //
    // **The mark is not a part of the ladder, and the frame is what settled
    // that.** Declared as one it is two cells the row can shed, and at eight
    // columns the step shed its *label* to keep them: a column of bare `\u2713`
    // and `\u25cc` saying three things happened and nothing about what. The mark is
    // one cell and a space, it is the same width in both glyph sets, and it is
    // what this kind draws — so it is reserved before the ladder is asked,
    // like a border rather than like a column.
    const parts = [
      { id: "label", natural: labelNat, min: Math.min(labelNat, MIN_PART), tier: "content" as const, rank: 2 },
      ...(detailNat > 0
        ? [
            {
              id: "detail",
              natural: detailNat + COLUMN_GAP,
              min: MIN_DETAIL + COLUMN_GAP,
              tier: "content" as const,
              rank: 1,
            },
          ]
        : []),
    ];
    const room = Math.max(0, width - MARK);
    const plan = naturalSpan(parts, 0) <= room ? null : shedRow(parts, room, 0, glyphs(ctx.capabilities).residue);
    const got = (id: string): number | null =>
      plan === null ? null : (plan.kept.find((k) => k.id === id)?.width ?? null);
    const mark = plan?.mark ?? null;
    const labelWidth = plan === null ? labelNat : (got("label") ?? 0);
    const detailWidth = plan === null ? null : Math.max(0, (got("detail") ?? COLUMN_GAP) - COLUMN_GAP);

    return rows(
      block.steps.map((step) => {
        // The spinner frame comes from `tick`, never from a clock (§2, T6.13).
        // Every frame is one cell, in both glyph sets, so an animating step
        // never shifts the row it sits on.
        const marker =
          step.state === "active"
            ? (frames[ctx.tick % frames.length] ?? g.dotted) // cells-ok
            : step.state === "done"
              ? g.tick
              : step.state === "failed"
                ? g.cross
                : g.dotted;

        const markerTone: Tone =
          step.state === "done"
            ? "ok"
            : step.state === "failed"
              ? "error"
              : step.state === "active"
                ? "accent"
                : "muted";

        const label =
          labelWidth <= 0
            ? ""
            : pad(truncate(stripControl(step.label), labelWidth, ctx.capabilities), labelWidth);
        const detailRoom =
          detailWidth ??
          Math.max(1, width - cells(marker, ambiguous) - 1 - labelWidth - COLUMN_GAP);
        // **A shed part is not drawn** (C09 I81): the detail goes whole, not as
        // a stub beside a mark saying it went.
        // **A shed part is not drawn** (C09 I81), and its width is what says it
        // went: the ladder answers `null`, which becomes no room, which is no
        // detail. There was a second check beside this one reading the shed
        // list, and the mutation pass found it unfalsifiable — both said the
        // same thing and removing either changed no frame.
        const detail =
          step.detail === undefined || detailRoom <= 0
            ? ""
            : truncate(stripControl(step.detail), detailRoom, ctx.capabilities);

        const spans: Span[] = [
          { text: `${marker} `, style: tone(markerTone, ctx.theme, ctx.capabilities) },
        ];
        if (label !== "") {
          spans.push({
            text: label,
            style: tone(step.state === "pending" ? "muted" : "default", ctx.theme, ctx.capabilities),
          });
        }
        if (detail !== "") {
          spans.push({ text: " ".repeat(COLUMN_GAP) });
          spans.push({ text: detail, style: tone("meta", ctx.theme, ctx.capabilities) });
        }
        // The withholding, stated rather than silent (C09 I81).
        if (mark !== null) spans.push({ text: ` ${mark}`, style: tone("dim", ctx.theme, ctx.capabilities) });

        return paint(clampSpans(spans, width, ctx.capabilities));
      }),
    );
  },
};
