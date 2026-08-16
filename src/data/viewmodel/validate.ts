/**
 * `validateDocument` and `validateBlock` — the single enforcement point for I3.
 *
 * C04 §4, §6 — see spec. Both are **total** (I4): any input yields a result and
 * never a throw, including a cyclic one (I27). This is the boundary, so it is
 * given hostile input by definition — a fixture, an adapter's output, a
 * hand-assembled document in a test.
 *
 * The validator table is typed over the full `Block` union rather than built
 * from a chain of `if`s, so **adding a kind without validating it stops
 * compiling** (T2.10). Same shape as C03's `WINDOWS`, and for the same reason:
 * a chain of `if`s takes a new member silently and defaults it to "fine", which
 * is the one direction the mistake must not fall.
 */

import {
  ACTION_KINDS,
  SCHEMA,
  type Action,
  type Block,
  type BlockKind,
  type DocumentStatus,
  type Glyph,
  type PlotForm,
  type Result,
  type ViewDocument,
} from "./types.js";
import { isContainerKind } from "./tree.js";

export type Validity<T> = Result<T, readonly string[]>;

const STATUSES: ReadonlySet<string> = new Set<DocumentStatus>([
  "ok",
  "error",
  "partial",
  "proposed",
]);

/**
 * **Built from a `Record` over the union, and that is the whole point.**
 *
 * This was `new Set<Glyph>([...])`, which type-checks with a member missing —
 * a `Set`'s element type constrains what may go in and says nothing about what
 * must. Adding `continuation` to `Glyph` therefore compiled, and every muted
 * notice became an invalid document at run time. It did not surface as a
 * failure either: `enqueue` contains its append (§5a), so the queue silently
 * stopped queueing and seven rows failed about *queueing* rather than about a
 * glyph. **A list that fails open at compile time and closed at run time,
 * behind a deliberate swallow, is the worst of the three copies of this
 * vocabulary.**
 *
 * The `Record` is the idiom `KIND_CHECKS` below already argues for, in this
 * file, for this reason — a member added without an entry stops compiling.
 *
 * A03's SS39 keeps its literal list, and the disposition differs because the
 * failure direction does: a stale scan list rejects a new token loudly at the
 * commit that adds it, where this one accepted it silently.
 */
const GLYPH_MEMBERS = {
  ok: true, warn: true, error: true, info: true, pending: true,
  working: true, running: true, queued: true, cancelled: true,
  expand: true, collapse: true, live: true, bullet: true,
  continuation: true,
} satisfies Record<Glyph, true>;

const GLYPHS: ReadonlySet<Glyph> = new Set(Object.keys(GLYPH_MEMBERS) as Glyph[]);

/**
 * The field each action kind carries beside `label`.
 *
 * A `Record` over the union rather than a switch, for the same reason
 * `KIND_CHECKS` is one: **a sixth kind added without an entry stops compiling**
 * (T2.11). Until this table existed, actions were not validated at all — an
 * adapter could emit `{ kind: "nonsens" }` and every check passed, which is the
 * vacuity class one level below where C04 usually finds it.
 */
const ACTION_FIELD: Readonly<Record<Action["kind"], string>> = Object.freeze({
  fill: "command",
  exec: "command",
  open: "url",
  expand: "target",
  view: "target",
});

const TRANSPORTS: ReadonlySet<string> = new Set(["emulated", "fixture", "subprocess", "local"]);
const ORIGINS: ReadonlySet<string> = new Set(["user", "action", "agent", "refresh", "defect"]);
/** C04 I41 — the arms, named for the unit that arrives, not the unit rendered. */
const Y_FORMATS: ReadonlySet<string> = new Set([
  "number",
  "fraction",
  "percent",
  "bytes",
  "duration",
]);

// --- small total helpers --------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isArray(v: unknown): v is readonly unknown[] {
  return Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// --- per-kind validation --------------------------------------------------

type KindCheck = (b: Record<string, unknown>, e: string[], at: string) => void;

function requireString(b: Record<string, unknown>, key: string, e: string[], at: string): void {
  if (!isString(b[key])) e.push(`${at}: "${key}" must be a string`);
}

function requireArray(b: Record<string, unknown>, key: string, e: string[], at: string): void {
  if (!isArray(b[key])) e.push(`${at}: "${key}" must be an array`);
}

/**
 * A numeric array's **elements** (C04 I46, §5a).
 *
 * **`requireArray` established the array and stopped**, so `Series.values` and
 * `Cell.spark` accepted a string, a `null` or an object — with or without a
 * round trip, which is why this is wider than the property that found it.
 *
 * Finite, because JSON has no `NaN` and no `Infinity`: `JSON.stringify` writes
 * both as `null`, and the validator accepted the value going out **and the
 * different value coming back**. A document that persists and reloads as a
 * different document which revalidates clean is worse than one that is refused,
 * which is the whole of I46.
 *
 * Absent is legal — `spark` is optional and an absent array is not an empty one.
 *
 * **And `null` is legal, because it is the gap** (I46a). This function used to
 * refuse it, which made absence expressible in the type and inexpressible in a
 * document: C12 I4 renders a non-finite entry as a position with no reading, and
 * every such document was refused here. The two invariants were each correct and
 * their overlap was a hole — found by running the validator over the block
 * `examples/docker` had been building, rather than by reading either rule.
 *
 * **`NaN` and `Infinity` stay refused, and that is the same argument as before,
 * not a weakened one.** `JSON.stringify` writes them as `null` regardless, so
 * they round-trip into a *different* value; `null` round-trips into itself. The
 * rule is unchanged — a numeric array holds what JSON can carry — and the gap
 * simply has a spelling now.
 */
function requireFiniteNumbers(
  values: unknown,
  e: string[],
  at: string,
  what: string,
): void {
  if (values === undefined) return;
  if (!isArray(values)) {
    e.push(`${at}: "${what}" must be an array of finite numbers or null`);
    return;
  }
  for (const [i, v] of values.entries()) {
    if (v === null || isFiniteNumber(v)) continue;
    e.push(
      `${at}: ${what}[${String(i)}] is ${typeof v} — a numeric array holds finite numbers, ` +
        `and null for a gap (C04 I46a). JSON writes NaN and Infinity as null, so a value that ` +
        `is neither survives a round trip as a different one`,
    );
  }
}

/**
 * `actions`, where a block carries them. Absent is legal; present and malformed
 * is not.
 *
 * The kind is checked against `ACTION_KINDS` and the kind's own field against
 * `ACTION_FIELD`, so an action naming a kind that does not exist and one missing
 * the field its kind needs are two different messages rather than one silence.
 *
 * **Known limit, stated rather than left to be discovered**: this reaches the
 * `actions` array on `patch` and `tip`, and not `TableRow.actions` or a `pills`
 * chip's `action`. Those are nested inside collections this validator walks for
 * other reasons, and widening it there is a separate change with its own row.
 * What the table guarantees is that the *union* cannot gain a sixth member
 * unnoticed; what it does not guarantee is that every site carrying an action is
 * checked.
 */
function checkActions(b: Record<string, unknown>, e: string[], at: string): void {
  const actions = b["actions"];
  if (actions === undefined) return;
  if (!isArray(actions)) {
    e.push(`${at}: "actions" must be an array`);
    return;
  }
  actions.forEach((raw, i) => {
    const where = `${at}.actions[${String(i)}]`;
    if (!isRecord(raw)) {
      e.push(`${where}: must be an object`);
      return;
    }
    const kind = raw["kind"];
    if (!isString(kind) || !ACTION_KINDS.has(kind as Action["kind"])) {
      e.push(`${where}: "kind" must be one of ${[...ACTION_KINDS].join(", ")}`);
      return;
    }
    if (!isString(raw["label"])) e.push(`${where}: "label" must be a string`);
    const field = ACTION_FIELD[kind as Action["kind"]];
    if (!isString(raw[field])) e.push(`${where}: "${field}" must be a string`);
  });
}

/**
 * One entry per member of the union. `Record<BlockKind, …>` is the assertion:
 * a new kind without a row here is a type error, not a silent pass (T2.10).
 */
const KIND_CHECKS: Readonly<Record<BlockKind, KindCheck>> = Object.freeze({
  rule: (b, e, at) => requireString(b, "label", e, at),
  notice: (b, e, at) => {
    requireString(b, "text", e, at);
    requireString(b, "tone", e, at);
    requireGlyph(b["glyph"], e, at);
  },
  keyValue: (b, e, at) => requireArray(b, "rows", e, at),
  table: (b, e, at) => {
    requireArray(b, "columns", e, at);
    requireArray(b, "rows", e, at);
    // The other half of I6's glyph rule. A `Cell` carries one too, and a table
    // is where the far side's own status strings most often arrive.
    if (isArray(b["rows"])) {
      // I31 — row ids are unique within their table. Separate from I14's block
      // ids because the namespaces are: two tables may each hold a row `r1`, and
      // a row id never collides with a block id.
      //
      // Three things address a row by id and all three are ambiguous without
      // this: `merge` upserts by it (I9), C16's focus names it (C11 I14), and a
      // rendered row is keyed by it. Raised from C11, the first component to
      // depend on it.
      const rowIds = new Map<string, number>();

      for (const row of b["rows"]) {
        if (!isRecord(row)) continue;
        const id = row["id"];
        if (isString(id)) rowIds.set(id, (rowIds.get(id) ?? 0) + 1);
        if (!isRecord(row["cells"])) continue;
        for (const [key, cell] of Object.entries(row["cells"])) {
          if (!isRecord(cell)) continue;
          requireGlyph(cell["glyph"], e, `${at} cell "${key}"`);
          // I46 — the second numeric array, and the one no round trip would
          // have surfaced: a sparkline drawn from a cell's own numbers.
          requireFiniteNumbers(cell["spark"], e, `${at} cell "${key}"`, "spark");
        }
      }

      for (const [id, count] of rowIds) {
        if (count > 1) {
          e.push(
            `${at}: row id "${id}" appears ${String(count)} times (C04 I31) — ` +
              `merge upserts by row id and focus names one, so a duplicate has no correct target`,
          );
        }
      }
    }
  },
  steps: (b, e, at) => requireArray(b, "steps", e, at),
  logs: (b, e, at) => requireArray(b, "lines", e, at),
  events: (b, e, at) => requireArray(b, "events", e, at),
  plot: (b, e, at) => {
    requireArray(b, "series", e, at);
    // I46 — the series' own numbers, which nothing checked.
    if (isArray(b["series"])) {
      for (const [i, s] of b["series"].entries()) {
        if (isRecord(s)) requireFiniteNumbers(s["values"], e, at, `series[${String(i)}].values`);
      }
      // **I50a — refused, not cycled** (roadmap 51). The categorical palette
      // distinguishes eight, and a ninth series used to reuse the first's
      // colour: a segmentation that says two different things are the same
      // thing. C04 I47's disposal — a construction error rather than a
      // rendering that lies — and the same argument, since a reader cannot see
      // that a colour has been reused.
      // **I50a is a rule about colour, so it binds where colour is drawn**
      // (C12 §6a A7). A heatmap carries magnitude in the ramp at every depth and
      // never reads the categorical palette, so a cap at the palette's size
      // would refuse a document about something else — and eight rows is not a
      // matrix.
      if (b["form"] !== "heatmap" && b["series"].length > CATEGORY_LIMIT) {
        e.push(
          `${at}: "series" has ${String(b["series"].length)} entries and the categorical ` +
            `palette distinguishes ${String(CATEGORY_LIMIT)} (C04 I50a) — a ninth series ` +
            `would repeat a colour, which reads as two series being one`,
        );
      }
    }
    const form = b["form"];
    if (typeof form !== "string" || !PLOT_FORMS.has(form)) {
      e.push(`${at}: "form" must be one of ${[...PLOT_FORMS].join(", ")}`);
    }
    // §3 — no default. The validator says so as well as the constructor,
    // because a document can arrive from a fixture without passing through one.
    if ((form === "line" || form === "heatmap") && !isFiniteNumber(b["height"])) {
      e.push(`${at}: form "${form}" requires a numeric "height" (C04 §3) — there is no default`);
    }
    // I50b — the heatmap's three refusals, the validator's half. The ragged one
    // is what an app hits by accident: rows of different lengths render
    // self-consistently and wrong, because a short row is stretched to the
    // common width and column k stops meaning one position.
    if (form === "heatmap" && isArray(b["series"])) {
      if (b["axes"] === false) {
        e.push(
          `${at}: a heatmap cannot set "axes: false" (C04 I50b) — the scale legend is the ` +
            `only thing that says what a cell means`,
        );
      }
      const lengths = new Set<number>();
      for (const [i, s] of b["series"].entries()) {
        if (!isRecord(s)) continue;
        if (s["tone"] !== undefined) {
          e.push(
            `${at}: series[${String(i)}] sets a tone and a heatmap draws none (C04 I50b) — ` +
              `magnitude owns the cell`,
          );
        }
        if (isArray(s["values"])) lengths.add(s["values"].length);
      }
      if (lengths.size > 1) {
        e.push(
          `${at}: rows of ${[...lengths].sort((x, y) => x - y).join(", ")} values (C04 I50b) — ` +
            `a matrix's columns are one ordinate, so a short row is stretched and column k ` +
            `means a different position in every row. Pad it: the renderer cannot know which ` +
            `end is old`,
        );
      }
    }
    // **C04 I41 — an unknown arm is an error, not a silent numeric fall-through.**
    // It was unvalidated, so a typo rendered plain numbers and said nothing; the
    // `fraction`/`percent` rename is exactly the event that produces one, because
    // `percentage` is what a reader guesses.
    const format = b["yFormat"];
    if (format !== undefined && !(isString(format) && Y_FORMATS.has(format))) {
      e.push(`${at}: "yFormat" must be one of ${[...Y_FORMATS].join(", ")} (C04 I41)`);
    }
  },
  progress: (b, e, at) => {
    requireString(b, "label", e, at);
    if (!isFiniteNumber(b["current"])) e.push(`${at}: "current" must be a finite number`);
    if (!isFiniteNumber(b["total"])) e.push(`${at}: "total" must be a finite number`);
  },
  code: (b, e, at) => {
    requireString(b, "language", e, at);
    requireString(b, "text", e, at);
  },
  comparison: (b, e, at) => requireArray(b, "rows", e, at),
  patch: (b, e, at) => {
    requireString(b, "path", e, at);
    requireString(b, "language", e, at);
    requireArray(b, "hunks", e, at);
    checkActions(b, e, at);
    // A negative elision is not an elision, and it would render a marker claiming
    // there is content to reveal above what the block actually holds.
    const after = b["collapsedAfter"];
    if (after !== undefined && (typeof after !== "number" || !Number.isInteger(after) || after < 0)) {
      e.push(`${at}: "collapsedAfter" must be a non-negative integer`);
    }
    // C25 I21a — a pinned gutter. **At least 1**, not merely non-negative: a
    // zero pin renders line numbers into no columns at all, which is a window
    // that draws its parent's rows without their numbers rather than an
    // arithmetic error anything downstream would notice.
    const gutter = b["numberWidth"];
    if (
      gutter !== undefined &&
      (typeof gutter !== "number" || !Number.isInteger(gutter) || gutter < 1)
    ) {
      e.push(`${at}: "numberWidth" must be a positive integer (C25 I21a)`);
    }
  },
  pills: (b, e, at) => requireArray(b, "chips", e, at),
  tip: (b, e, at) => {
    requireString(b, "text", e, at);
    checkActions(b, e, at);
  },
  panel: (b, e, at) => {
    requireString(b, "title", e, at);
    requireArray(b, "children", e, at);
  },
  group: (b, e, at) => {
    requireArray(b, "children", e, at);
    if (b["direction"] !== "row" && b["direction"] !== "column") {
      e.push(`${at}: "direction" must be "row" or "column"`);
    }
    checkFlex(b, e, at);
    checkAlign(b, e, at);
  },
  raw: (b, e, at) => requireString(b, "text", e, at),
  /**
   * C04 I47, §3c cell 5 — **refused at parse, not corrected at render.**
   *
   * A container with no children has no elements, so it is a scroll nobody can
   * aim: an offset with nothing to move it. Rendering it as an empty box would
   * be *correcting* a document that cannot mean anything, which is the
   * placement rule's mistake (C15 I20) and `resolve(key)` with no choices.
   *
   * **Expressible here only because the elements are one per child.** The
   * element list is L1's to compute and `data/` cannot call into it; the
   * correspondence is what turns a question about elements into a question
   * about `children.length`.
   */
  scroll: (b, e, at) => {
    requireArray(b, "children", e, at);
    if (isArray(b["children"]) && b["children"].length === 0) {
      e.push(
        `${at}: a "scroll" needs at least one child (C04 I47) — its elements are one per ` +
          `child, so an empty one is a container nobody can aim`,
      );
    }
    const height = b["height"];
    if (typeof height !== "number" || !Number.isInteger(height) || height < 1) {
      e.push(
        `${at}: "height" must be a positive integer (C04 I47) — got ${JSON.stringify(height)}; ` +
          `a box of zero rows shows nothing and has no reading to fall back on`,
      );
    }
  },
});

/**
 * A `row` group's weights (C04 I42, §3).
 *
 * **`0` is refused because it means two things and neither is new.** *Not
 * placed* is what leaving the child out says, and *placed at one cell* is what
 * `1` says — the floor gives every placed child at least one column. A value
 * with two readings and no use is the defect this project has removed four
 * times, so it does not enter a published type. Negatives and non-finite values
 * go with it.
 *
 * **A length mismatch is refused for a different reason**: there is no reading
 * to fall back on. Inferring the missing weight from anywhere would be the
 * framework choosing a layout, and `flex` exists so the author chooses one.
 *
 * Checked on a `column` group too, where the field is ignored at layout time —
 * a wrong value is still wrong, and refusing it only in one direction would
 * make the same block valid or invalid depending on where it travelled.
 */
function checkFlex(b: Record<string, unknown>, e: string[], at: string): void {
  const flex = b["flex"];
  if (flex === undefined) return;

  if (!Array.isArray(flex)) {
    e.push(`${at}: "flex" must be an array of weights, one per child`);
    return;
  }

  const children = b["children"];
  if (Array.isArray(children) && flex.length !== children.length) {
    e.push(
      `${at}: "flex" has ${String(flex.length)} weights for ${String(children.length)} children`,
    );
  }

  for (const [i, share] of flex.entries()) {
    // **A cell count is refused on the same argument as a weight of zero**
    // (I44): `{cells: 0}` and a fraction of a cell both name something the grid
    // has no reading for, and a share that means two things is what the zero
    // rule exists to keep out.
    if (typeof share === "object" && share !== null && "cells" in share) {
      const cells = (share as { cells: unknown }).cells;
      if (typeof cells !== "number" || !Number.isInteger(cells) || cells <= 0) {
        e.push(`${at}.flex[${String(i)}]: "cells" is a whole number of columns above zero`);
      }
      continue;
    }
    if (typeof share !== "number" || !Number.isFinite(share) || share <= 0) {
      e.push(
        `${at}.flex[${String(i)}]: a share is a weight above zero or {cells: n}; ` +
          `omit the child to leave it unplaced, and 1 is one share`,
      );
    }
  }
}

/**
 * A `row` group's per-child vertical alignment (C04 I45).
 *
 * Refused on the same terms as `flex`: a length that does not match the children
 * has no reading, and a value outside the vocabulary would be silently ignored
 * by the renderer — which is how a typo becomes a layout nobody asked for and
 * nothing reports.
 */
function checkAlign(b: Record<string, unknown>, e: string[], at: string): void {
  const align = b["align"];
  if (align === undefined) return;

  if (!Array.isArray(align)) {
    e.push(`${at}: "align" must be an array, one entry per child`);
    return;
  }

  const children = b["children"];
  if (Array.isArray(children) && align.length !== children.length) {
    e.push(
      `${at}: "align" has ${String(align.length)} entries for ${String(children.length)} children`,
    );
  }

  for (const [i, entry] of align.entries()) {
    if (entry !== "top" && entry !== "middle" && entry !== "bottom") {
      e.push(`${at}.align[${String(i)}]: one of top, middle, bottom`);
    }
  }
}

const KNOWN_KINDS: ReadonlySet<string> = new Set(Object.keys(KIND_CHECKS));

/**
 * I6's second half — a glyph is a slot, never a character.
 *
 * The type carries this inside the tree; a document arriving from a fixture, an
 * adapter's `as`, or a far side emitting `tui.view/1` has no type with it. A
 * character reaching a block is what makes C09 §4's 1:1 substitution rule
 * mostly-true rather than true, and mostly-true fails only under `LANG=C`.
 */
function requireGlyph(value: unknown, e: string[], at: string): void {
  if (value === undefined) return;
  if (typeof value === "string" && (GLYPHS as ReadonlySet<string>).has(value)) return;
  e.push(
    `${at}: "glyph" must be one of ${[...GLYPHS].join(", ")} (C04 I6) — ` +
      `got ${JSON.stringify(value)}; a character has no ASCII fallback and no width guarantee`,
  );
}

/**
 * How many series one plot may carry (C04 I50a, roadmap 51).
 *
 * The number is the categorical palette's size and it lives here because this is
 * where the refusal is: a limit stated where the colours are would be a rule
 * about rendering, and this is a rule about what a document may say.
 */
const CATEGORY_LIMIT = 8;

/**
 * The forms, as a set the validator can be exhaustive against.
 *
 * Built from a `Record<PlotForm, true>` for the reason `GLYPH_MEMBERS` is: a
 * `Set<PlotForm>` built from a literal type-checks with a member missing, and
 * that is exactly how the last vocabulary widening shipped a validator that
 * refused every document using the new member.
 */
const PLOT_FORM_MEMBERS = { line: true, sparkline: true, heatmap: true } satisfies Record<
  PlotForm,
  true
>;
const PLOT_FORMS: ReadonlySet<string> = new Set(Object.keys(PLOT_FORM_MEMBERS));

/**
 * Children of a container, for the recursive walk. Total on malformed input.
 *
 * The kind is asked of `tree.ts` rather than listed, and asked **by name**
 * rather than structurally: an app-registered kind may carry a `children` array
 * of things that are not blocks (F1), and descending into it would report
 * errors against a document C04 is not entitled to validate.
 */
function childBlocksOf(b: Record<string, unknown>): readonly unknown[] {
  const kind = b["kind"];
  if (isContainerKind(kind)) {
    return isArray(b["children"]) ? b["children"] : [];
  }
  if (kind === "table" && isArray(b["rows"])) {
    const out: unknown[] = [];
    for (const row of b["rows"]) {
      if (isRecord(row) && isArray(row["detail"])) out.push(...row["detail"]);
    }
    return out;
  }
  return [];
}

/**
 * The recursive walk. `path` is the **path-scoped** seen-set (I27): a container
 * is added on descent and removed on ascent, so a cycle is caught exactly and a
 * subtree that legitimately appears in two places is not. A global set would
 * reject the second, honest occurrence and call it a cycle.
 *
 * `ids` accumulates across the whole document, because I14's uniqueness is a
 * document-wide property, not a per-branch one.
 */
function walkBlock(
  value: unknown,
  errors: string[],
  ids: Map<string, number>,
  path: Set<unknown>,
  at: string,
): void {
  if (!isRecord(value)) {
    errors.push(`${at}: not an object`);
    return;
  }
  if (path.has(value)) {
    errors.push(`${at}: cyclic structure — a block contains itself (C04 I27)`);
    return;
  }

  const kind = value["kind"];
  if (!isString(kind)) {
    errors.push(`${at}: "kind" must be a string`);
    return;
  }
  const where = `${at} (${kind})`;

  if (!isString(value["id"]) || value["id"].length === 0) {
    errors.push(`${where}: "id" must be a non-empty string — ViewPatch addresses blocks by it`);
  } else {
    ids.set(value["id"], (ids.get(value["id"]) ?? 0) + 1);
  }

  // An unknown kind is not an error: the union is open and an app registers
  // kinds through C09 (F1). It is unvalidatable here, and `raw` renders it
  // degraded rather than nothing (C09 §2).
  if (KNOWN_KINDS.has(kind)) {
    KIND_CHECKS[kind as BlockKind](value, errors, where);
  }

  path.add(value);
  const children = childBlocksOf(value);
  for (const [i, child] of children.entries()) {
    walkBlock(child, errors, ids, path, `${where} child ${i}`);
  }
  path.delete(value);
}

// --- public ---------------------------------------------------------------

/** I4 — total. Any input yields a result, never a throw. */
export function validateBlock(block: unknown): Validity<Block> {
  const errors: string[] = [];
  walkBlock(block, errors, new Map(), new Set(), "block");
  return errors.length === 0
    ? { ok: true, value: block as Block }
    : { ok: false, error: Object.freeze(errors) };
}

function validateMeta(meta: unknown, errors: string[]): void {
  if (!isRecord(meta)) {
    errors.push(`meta: must be an object`);
    return;
  }
  if (!(meta["verb"] === null || isString(meta["verb"]))) {
    errors.push(`meta.verb: must be a string or null`);
  }
  for (const key of ["adapter", "stderr"]) {
    if (!isString(meta[key])) errors.push(`meta.${key}: must be a string`);
  }
  for (const key of ["exitCode", "durationMs"]) {
    if (!isFiniteNumber(meta[key])) errors.push(`meta.${key}: must be a finite number`);
  }
  if (typeof meta["truncated"] !== "boolean") errors.push(`meta.truncated: must be a boolean`);
  if (!isArray(meta["argv"]) || !meta["argv"].every(isString)) {
    errors.push(`meta.argv: must be an array of strings`);
  }
  if (!isString(meta["transport"]) || !TRANSPORTS.has(meta["transport"])) {
    errors.push(`meta.transport: must be one of ${[...TRANSPORTS].join(", ")}`);
  }
  // I13 — required, and checked as such. A provenance field that can be absent
  // becomes a provenance field nobody trusts.
  if (!isString(meta["origin"]) || !ORIGINS.has(meta["origin"])) {
    errors.push(
      `meta.origin: required, one of ${[...ORIGINS].join(", ")} (C04 I13) — ` +
        `it is not optional, and C23 sets it on every append`,
    );
  }
}

/** I4 — total. I2, I3, I14 and I27 are established here and nowhere else. */
export function validateDocument(doc: unknown): Validity<ViewDocument> {
  const errors: string[] = [];

  if (!isRecord(doc)) {
    return { ok: false, error: Object.freeze(["document: not an object"]) };
  }

  // I2 — checked on every document. An unrecognised version is refused at the
  // boundary, not rendered.
  if (doc["schema"] !== SCHEMA) {
    errors.push(
      `schema: expected "${SCHEMA}", got ${JSON.stringify(doc["schema"])} — ` +
        `an unrecognised version is refused at the boundary, not rendered (C04 I2)`,
    );
  }

  if (!isString(doc["command"])) errors.push(`command: must be a string`);

  const status = doc["status"];
  if (!isString(status) || !STATUSES.has(status)) {
    errors.push(`status: must be one of ${[...STATUSES].join(", ")}`);
  }

  // I3 — `error` is present iff status is "error". Both directions, because
  // only enforcing one is how the other becomes convention.
  const hasError = doc["error"] !== undefined;
  if (status === "error" && !hasError) {
    errors.push(`error: required when status is "error" (C04 I3)`);
  }
  if (status !== "error" && hasError) {
    errors.push(`error: present on a non-error document (status "${String(status)}") (C04 I3)`);
  }
  if (hasError && (!isRecord(doc["error"]) || !isString(doc["error"]["message"]))) {
    errors.push(`error.message: the only required field on ErrorLike, and it must be a string`);
  }

  validateMeta(doc["meta"], errors);

  const ids = new Map<string, number>();
  if (!isArray(doc["blocks"])) {
    errors.push(`blocks: must be an array`);
  } else {
    for (const [i, b] of doc["blocks"].entries()) {
      walkBlock(b, errors, ids, new Set(), `blocks[${i}]`);
    }
  }

  // I14 — unique within the document, nested children included. This is what
  // makes `replace` and `merge` addressable at all.
  for (const [id, count] of ids) {
    if (count > 1) {
      errors.push(
        `blocks: id "${id}" appears ${count} times (C04 I14) — ` +
          `ViewPatch addresses blocks by id, so a duplicate has no correct target`,
      );
    }
  }

  return errors.length === 0
    ? { ok: true, value: doc as ViewDocument }
    : { ok: false, error: Object.freeze(errors) };
}
