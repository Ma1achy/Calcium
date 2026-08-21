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
  type Annotation,
  type Block,
  type BlockKind,
  type DocumentStatus,
  type Glyph,
  COLORMAP_NAMES,
  HAS_CALLOUT,
  HAS_DETAIL_RUNGS,
  HIERARCHY_MAX_DEPTH,
  HIERARCHY_ROLE,
  HAS_X_TITLE,
  HAS_Y_GUTTER,
  HONOURS_AXIS_CROSS,
  ORIGIN_DEFAULT,
  IS_FIELD_FORM,
  IS_MATRIX,
  STYLE_ARMS,
  type OHLC,
  type Plot,
  type PlotForm,
  type Result,
  type ViewDocument,
} from "./types.js";
import { parseStartDate } from "../dates.js";
import { isContainerKind } from "./tree.js";
// **The entries, not the names.** `COLORMAP_SET` above answers *is this a map*;
// H3 asks *does it have two halves*, which is `kind` and lives on the entry.
import { COLORMAPS } from "../colormaps/index.js";

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

const COLORMAP_SET: ReadonlySet<string> = new Set<string>(COLORMAP_NAMES);
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


/**
 * A plot's annotations (I52).
 *
 * **A function rather than a guard inside `plot`, and an early `return` is
 * why.** Written inline it began `if (b["annotations"] === undefined) return;`
 * at the top of a check that already had a body — which silently skips the
 * series validation below it for every plot that carries no annotation, meaning
 * *almost all of them*. The shape reads as a cheap exit and is a deletion.
 */
/**
 * One edge, which is a **position** and so must be a number (C04 I52).
 *
 * A `null` sample is absence and has a spelling (I46a); a `NaN` threshold is a
 * claim about nowhere, and `rowOf` would place it at the top of the plot — a
 * line saying *the limit is here* about a value that is not a value.
 */
function requireEdge(a: Readonly<Record<string, unknown>>, key: string, e: string[], at: string): void {
  if (isFiniteNumber(a[key])) return;
  e.push(
    `${at}: annotation "${key}" must be a finite number (C04 I52) — ` +
      `an annotation is a claim about where a value sits, and there is no such place`,
  );
}

type AnnotationCheck = (a: Readonly<Record<string, unknown>>, e: string[], at: string) => void;

/**
 * The edge check, **per kind and total over `Annotation["kind"]`** (C04 I52).
 *
 * **It was a ternary and it refused two of the four kinds outright.** The line
 * read `a["kind"] === "band" ? ["from", "to"] : ["value"]`, so `confidence` and
 * `whiskers` — built by `FigureBuilder`, drawn by `annotate.ts`, and carrying no
 * `value` between them — were rejected at the boundary this function exists to
 * be, by a message naming a member they do not have and citing the invariant
 * that declares them. I52's own prose said *two kinds* while the type said four,
 * so two records held one belief and neither could correct the other.
 *
 * **A third defect fell out of the same line**: every kind that is not `"band"`
 * took the `else`, so `kind: "wibble"` was checked for a `value` and otherwise
 * accepted — and `edgesOf` reads `annotation.value` for it, giving `undefined`,
 * which `drawn` filters. An unknown kind drew nothing and said nothing.
 *
 * A record rather than a switch, because a record is checked in **both**
 * directions: a fifth kind does not compile without a row, and a row naming a
 * kind that does not exist does not compile either.
 */
const ANNOTATION_CHECKS: Readonly<Record<Annotation["kind"], AnnotationCheck>> = Object.freeze({
  line: (a, e, at) => {
    requireEdge(a, "value", e, at);
  },
  band: (a, e, at) => {
    requireEdge(a, "from", e, at);
    requireEdge(a, "to", e, at);
    // **Ordered, because a band is a range and the renderer draws two edges
    // either way.** Reversed it renders identically, so nothing downstream can
    // notice — and a document that says `from: 85, to: 60` means something its
    // author did not check.
    const from = a["from"];
    const to = a["to"];
    if (isFiniteNumber(from) && isFiniteNumber(to) && from > to) {
      e.push(`${at}: annotation band "from" (${String(from)}) is above "to" (${String(to)}) (C04 I52)`);
    }
  },
  confidence: (a, e, at) => {
    // Both edges are **required** and `requireFiniteNumbers` returns silently on
    // `undefined`, which is right for an optional array and wrong here.
    for (const key of ["upper", "lower"]) {
      if (a[key] === undefined) {
        e.push(`${at}: a "confidence" annotation requires "${key}" (C04 I52)`);
        continue;
      }
      requireFiniteNumbers(a[key], e, at, `annotation ${key}`);
    }
  },
  whiskers: (a, e, at) => {
    const points = a["points"];
    if (!isArray(points)) {
      e.push(`${at}: a "whiskers" annotation requires "points" to be an array (C04 I52)`);
      return;
    }
    for (const [i, p] of points.entries()) {
      if (!isRecord(p)) {
        e.push(`${at}: annotation points[${String(i)}] must be an object with x, y and err (C04 I52)`);
        continue;
      }
      // `err` is a half-width and negative is not a smaller bar, it is a
      // reversed one — `y - err` above `y + err`, drawn either way.
      for (const key of ["x", "y", "err"]) requireEdge(p, key, e, `${at}: annotation points[${String(i)}]`);
      const err = p["err"];
      if (isFiniteNumber(err) && err < 0) {
        e.push(`${at}: annotation points[${String(i)}] "err" is negative (${String(err)}) (C04 I52)`);
      }
    }
  },
});

/**
 * A series' per-sample names (C04 I63, C12 I55, §3ag).
 *
 * **Three refusals, and the form one is the reason the record is `HAS_CALLOUT`
 * rather than a new one.** That table partitions the forms whose sample is drawn
 * at its own value; a band form draws sample *j* at a cumulative height, so a
 * label placed from `rowOf(value)` would name a row the sample is not on. Same
 * fact, second consumer — not a record borrowed for a different question.
 */
function checkPointLabels(
  s: Record<string, unknown>,
  e: string[],
  at: string,
  index: number,
  form: unknown,
): void {
  const labels = s["pointLabels"];
  if (labels === undefined) return;
  const where = `${at}: series[${String(index)}].pointLabels`;
  if (!isArray(labels)) {
    e.push(`${where} must be an array (C04 I63)`);
    return;
  }
  for (const l of labels) {
    if (l !== null && !isString(l)) {
      e.push(`${where} entries must be a string or null (C04 I63)`);
      break;
    }
  }
  const values = s["values"];
  if (isArray(values) && labels.length > values.length) {
    e.push(
      `${where} has ${String(labels.length)} entries against ${String(values.length)} ` +
        `values (C04 I63) — an entry past the last reading names a sample that does not exist`,
    );
  }
  if (HAS_CALLOUT[form as PlotForm] === false) {
    e.push(
      `${where} on form ${JSON.stringify(form)} (C04 I63) — a point label sits beside the ` +
        `sample it names, and that form does not draw a sample at its own value`,
    );
  }
}

/**
 * The first thing wrong with a `hierarchy`, named by its path — or `null`
 * (C04 I64, F221).
 *
 * **One walk, read by both gates.** A one-line predicate written twice is a rule
 * stated twice and the two can be compared by eye; a recursive walk written
 * twice is two walks, and the second one drifts. So this is exported and the
 * constructor imports it, where `plotDetail`'s refusal is a copy on purpose.
 *
 * **It stops at the first fault rather than collecting them.** A malformed tree
 * is malformed in one way at one place, and ten thousand nodes are ten thousand
 * messages about the same mistake — `checkPointLabels` breaks out of its loop
 * for the same reason.
 */
export function hierarchyFault(
  node: unknown,
  needsValue: boolean,
  path: string,
  depth = 0, // cells-ok — a depth index
): string | null {
  if (depth > HIERARCHY_MAX_DEPTH) { // cells-ok — a depth index
    return `${path} nests deeper than ${String(HIERARCHY_MAX_DEPTH)}, which is the bound the walk that draws it needs`;
  }
  if (!isRecord(node)) return `${path} must be an object with a "label"`;
  if (!isString(node["label"])) return `${path}.label must be a string`;
  if (needsValue) {
    const v = node["value"];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return `${path}.value must be a number of at least zero — that form divides space in proportion to it`;
    }
  }
  const kids = node["children"];
  if (kids === undefined) return null;
  if (!isArray(kids)) return `${path}.children must be an array`;
  for (const [i, kid] of kids.entries()) { // cells-ok — a child index
    const fault = hierarchyFault(kid, needsValue, `${path}.children[${String(i)}]`, depth + 1); // cells-ok — a depth index
    if (fault !== null) return fault;
  }
  return null;
}

/**
 * `hierarchy` — the shape, and the forms that read one (C04 I64).
 *
 * **The field reached the renderer with nothing asked of it** (F221), because
 * C04's gate is written member by member and this is not a member — it is a
 * shape, which is I54's own *one field for three forms rather than three
 * shapes*. Every other typed field here is a flat list or a small record, so its
 * clause is one line and got written.
 */
/**
 * `treeLayout` — the values, and the one form that has them (C04 I65).
 *
 * **The literals are restated here and `TREE_LAYOUTS` holds them in `tree.ts`**,
 * which is L1; L0 does not import upward, so the two must agree and a row
 * asserts it rather than deriving one from the other — `RUNG_FORMS`' argument,
 * one member along.
 */
function checkTreeLayout(
  b: Record<string, unknown>,
  e: string[],
  at: string,
  form: unknown,
): void {
  const tl = b["treeLayout"];
  if (tl === undefined) return;
  if (tl !== "auto" && tl !== "topDown" && tl !== "leftRight" && tl !== "outline") {
    e.push(`${at}: "treeLayout" must be "auto", "topDown", "leftRight" or "outline" (C04 I65)`);
    return;
  }
  if (form !== "tree") {
    e.push(
      `${at}: "treeLayout" on form ${JSON.stringify(form)} (C04 I65) — only a tree has more ` +
        `than one layout to choose between, and an ignored member reads as one not yet implemented`,
    );
  }
}

function plotHierarchyErrors(
  b: Record<string, unknown>,
  e: string[],
  at: string,
  form: unknown,
): void {
  const h = b["hierarchy"];
  const role = HIERARCHY_ROLE[form as PlotForm];
  // An unrecognised form is the form check's to report, not this one's.
  if (role === undefined) return;
  checkTreeLayout(b, e, at, form);
  if (h === undefined) {
    // **A structure form has nothing else to draw** (C04 I65, C12 §3ah.9). The
    // three magnitude forms do: two fall back to their series and the third
    // draws its empty message, so absence is ordinary there and fatal here.
    if (role === "structure") {
      e.push(
        `${at}: form ${JSON.stringify(form)} with no "hierarchy" (C04 I65) — that form draws ` +
          `a tree and nothing else, so there is no figure to fall back to`,
      );
    }
    return;
  }
  if (role === null) {
    e.push(
      `${at}: "hierarchy" on form ${JSON.stringify(form)} (C04 I64) — that form draws a ` +
        `series, a matrix or a field, and an ignored member reads as one not yet implemented`,
    );
    return;
  }
  const fault = hierarchyFault(h, role === "magnitude", `${at}: hierarchy`);
  if (fault !== null) e.push(`${fault} (C04 I64)`);
}

function checkAnnotations(
  annotations: unknown,
  e: string[],
  at: string,
  legend: unknown,
): void {
  if (annotations === undefined) return;
  if (!isArray(annotations)) {
    e.push(`${at}: "annotations" must be an array (C04 I52)`);
    return;
  }
  for (const a of annotations) {
    if (!isRecord(a)) continue;
    const label = a["label"];
    if (label !== undefined && !isString(label)) {
      e.push(`${at}: annotation "label" must be a string (C04 I52)`);
    }
    // **`confidence` and `whiskers` carry no label**, because both are drawn
    // across the whole abscissa: one string would name the band as a whole on
    // one arm and a sample on the other, which is one member with two meanings.
    if (label !== undefined && a["kind"] !== "line" && a["kind"] !== "band") {
      e.push(
        `${at}: annotation "label" on kind ${JSON.stringify(a["kind"])} (C04 I52) — a label ` +
          `names one place on the ordinate, and that kind is drawn across every sample`,
      );
    }
    // **The caller asked for a string and forbade the only place it goes**
    // (C12 §3ag A3). A label has no home in the plot area — it would overwrite
    // the curve it exists to be compared against — so the legend row is not one
    // of two options.
    if (isString(label) && legend === false) {
      e.push(
        `${at}: annotation "label" is ${JSON.stringify(label)} with "legend" false (C04 I52) — ` +
          `an annotation's label is written in a legend row and there is none; drop the label ` +
          `or allow the legend`,
      );
    }
    const check = ANNOTATION_CHECKS[a["kind"] as Annotation["kind"]] as AnnotationCheck | undefined;
    if (check === undefined) {
      e.push(
        `${at}: annotation "kind" is ${JSON.stringify(a["kind"])}, which is not one of ` +
          `${Object.keys(ANNOTATION_CHECKS).join(", ")} (C04 I52)`,
      );
      continue;
    }
    check(a, e, at);
  }
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
  keyValue: (b, e, at) => {
    requireArray(b, "rows", e, at);
    if (!isArray(b["rows"])) return;
    for (const row of b["rows"]) {
      if (!isRecord(row) || !isRecord(row["bar"])) continue;
      const spec = row["bar"];
      // The same two numbers `Cell.bar` is checked for (I50c), because they are
      // the same `BarSpec` — a non-finite `value` is a run of `NaN` cells and a
      // non-finite `max` is a division that produces one.
      if (spec["value"] !== null && !isFiniteNumber(spec["value"])) {
        e.push(`${at} row "${String(row["label"])}": "bar.value" must be a finite number or null (C04 I51)`);
      }
      if (!isFiniteNumber(spec["max"])) {
        e.push(`${at} row "${String(row["label"])}": "bar.max" must be a finite number (C04 I51)`);
      }
      // **The pairing the type could not carry**, and the gate that does — the
      // same division I50c makes for a cell holding both a `spark` and a `bar`.
      // A narrower `bar` member would have broken `b.kv({ s: b.warn("x") })`,
      // because the tone shorthands return a `Cell` whose `bar` is a plain
      // `BarSpec`. So `barWidth` is a sibling, and an absent or sub-cell width
      // is refused here: it is not a narrow bar, it is no bar, and the row would
      // draw its value as though it had never asked for one.
      if (!isFiniteNumber(row["barWidth"]) || row["barWidth"] < 1) {
        e.push(
          `${at} row "${String(row["label"])}": a "bar" needs a "barWidth" of at least one cell ` +
            `(C04 I51) — a keyValue value is a remainder, so the bar says how much of it to take`,
        );
      }
    }
  },
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
          // I50c — both fill the planned width, so a cell with both has two
          // renderings and no rule for which wins.
          if (cell["spark"] !== undefined && cell["bar"] !== undefined) {
            e.push(
              `${at} cell "${key}": carries a "spark" and a "bar" (C04 I50c) — both fill ` +
                `the planned width, so there is no rule for which wins`,
            );
          }
          if (isRecord(cell["bar"])) {
            const spec = cell["bar"];
            if (spec["value"] !== null && !isFiniteNumber(spec["value"])) {
              e.push(`${at} cell "${key}": "bar.value" must be a finite number or null (C04 I50c)`);
            }
            if (!isFiniteNumber(spec["max"])) {
              e.push(`${at} cell "${key}": "bar.max" must be a finite number (C04 I50c)`);
            }
          }
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
  status: (b, e, at) => {
    // **Both refusals name their field** (C04 I57, I66). An empty message in an
    // `error` box says something failed and not what — the same objection §3a's
    // three-row rung makes about dropping the rule — and a height the framework
    // guessed is silently wrong in a way nobody notices.
    if (typeof b["message"] !== "string" || b["message"].trim() === "") {
      e.push(
        `${at}: "message" must be a non-empty string (C04 I66) — a status box with ` +
          `nothing in it reports that something happened and not what`,
      );
    }
    const height = b["height"];
    if (typeof height !== "number" || !Number.isInteger(height) || height < 1) {
      e.push(
        `${at}: "height" must be a positive integer (C04 I66) — the box is bound by ` +
          `the number \`measure\` committed and cannot choose its own`,
      );
    }
  },
  steps: (b, e, at) => requireArray(b, "steps", e, at),
  logs: (b, e, at) => requireArray(b, "lines", e, at),
  events: (b, e, at) => requireArray(b, "events", e, at),
  plot: (b, e, at) => {
    checkAnnotations(b["annotations"], e, at, b["legend"]);
    // **An unknown colormap is refused rather than ignored** (C10 I31). A name
    // that resolves to nothing renders uncoloured and green, which is F172's
    // shape exactly — and the reason a colormap is chosen by name at all is that
    // the set is closed and the framework holds it.
    if (b["colormap"] !== undefined && !COLORMAP_SET.has(String(b["colormap"]))) {
      e.push(
        `${at}: "colormap" is "${String(b["colormap"])}", which is not one of ` +
          `${COLORMAP_NAMES.join(", ")} (C10 I31) — an unknown name paints nothing, ` +
          `and nothing is what a correct block at one bit also paints`,
      );
    }
    requireArray(b, "series", e, at);
    // I46 — the series' own numbers, which nothing checked.
    if (isArray(b["series"])) {
      for (const [i, s] of b["series"].entries()) {
        if (isRecord(s)) requireFiniteNumbers(s["values"], e, at, `series[${String(i)}].values`);
        if (isRecord(s)) checkPointLabels(s, e, at, i, b["form"]);
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
    // **I56 — the row floor, and only the row floor.** A `boxplot` needs one row
    // per band and a `violin` two, because a violin with no density is a box
    // plot. Below that the density flattens and the figure states a property of
    // the *room* rather than of the data, with nothing on screen to tell those
    // apart.
    //
    // **The column floor is not checkable here and that is structural**: this
    // function takes a block and no width, and a terminal's width is handed down
    // from `terminal/lifecycle.ts`. So the rows-per-band are computable from a
    // declared `height` and the columns-per-band are not, and C12 enforces the
    // other axis by drawing the box rather than by refusing (C12 I34, I18).
    if ((form === "boxplot" || form === "violin") && b["orientation"] !== "vertical") {
      const bands = isArray(b["categories"])
        ? b["categories"].length
        : isArray(b["series"]) ? b["series"].length : 0; // cells-ok — a band count
      const rows = isFiniteNumber(b["height"]) ? Math.max(1, Math.floor(b["height"])) : 0; // cells-ok — a row count
      const need = form === "violin" ? 2 : 1; // cells-ok — a row count
      const per = bands === 0 ? need : Math.floor(rows / bands); // cells-ok — a row count
      if (bands > 0 && per < need) {
        e.push(
          `${at}: ${String(bands)} bands in ${String(rows)} rows is ${String(per)} per band and a ` +
            `"${form}" needs ${String(need)} (C04 I56) — below that the density flattens to a bar ` +
            `and the figure says the distribution is uniform, which is a statement about the height`,
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
    const ps = b["plotStyle"];
    if (ps !== undefined && !PLOT_STYLES.has(String(ps))) {
      e.push(`${at}: "plotStyle" must be one of ${[...PLOT_STYLES].join(", ")}`);
    }
    // **C04 I57 — the geometry is refused wherever the bars are**, not only
    // under the style that draws them. A wick that does not contain its body is
    // not a candle drawn oddly; it is not a candle, and a document carrying one
    // is wrong before anything decides how to render it (C12 §6b B11).
    const ohlc = b["ohlc"];
    if (ohlc !== undefined) {
      if (!isArray(ohlc)) {
        e.push(`${at}: "ohlc" must be an array of {open, high, low, close} (C04 I57)`);
      } else {
        for (const [i, bar] of ohlc.entries()) {
          if (!isRecord(bar) || !OHLC_KEYS.every((k) => isFiniteNumber(bar[k]))) {
            e.push(
              `${at}: ohlc[${String(i)}] is not four finite numbers (C04 I57) — ` +
                `open, high, low and close, each a number`,
            );
            continue;
          }
          const [open, high, low, close] = [bar["open"], bar["high"], bar["low"], bar["close"]]
            .map(Number) as [number, number, number, number];
          if (low > Math.min(open, close) || high < Math.max(open, close)) {
            e.push(
              `${at}: ohlc[${String(i)}] has low ${String(low)} and high ${String(high)} around ` +
                `open ${String(open)} and close ${String(close)} (C04 I57) — a candle's wick ` +
                `contains its body, so this is not a candle that renders oddly, it is not a candle`,
            );
          }
        }
      }
    }
    // **The style's two refusals** (C04 I57, C12 §6b B9 and B10). An ignored
    // member reads as one not yet implemented, which is this type's established
    // idiom and the reason both are construction errors rather than fallbacks.
    if (ps === "candlestick") {
      if (ohlc === undefined) {
        e.push(
          `${at}: "plotStyle" is "candlestick" and there is no "ohlc" (C04 I57) — the style ` +
            `has nothing to draw, and "series" is the overlay rather than the candles`,
        );
      }
    }
    // **One rule over a total record, where there was a clause per style**
    // (C04 I59, C12 I43, §3w). `candlestick on a form that is not line or step`
    // was correct and was a special case: every style is one some forms draw
    // and others do not, so a second style would have wanted a second clause.
    if (ps !== undefined && ps !== "auto" && PLOT_STYLES.has(String(ps))) {
      const arms = STYLE_ARMS[form as PlotForm] as readonly string[] | undefined;
      if (arms !== undefined && !arms.includes(String(ps))) {
        e.push(
          `${at}: "plotStyle" is "${String(ps)}" on form "${String(form)}" (C04 I59) — that ` +
            `form has ${arms.length === 0 ? "no style arms" : `arms for ${arms.join(", ")}`}, ` +
            `and an ignored member reads as one not yet implemented`,
        );
      }
    }
    // **A fill is the braille arm's** (C04 I59). A box-drawing outline has no
    // interior alphabet, so `█` inside `╭──╮` is a third figure rather than the
    // same one filled.
    const pf = b["plotFill"];
    if (pf !== undefined && pf !== "none" && pf !== "solid") {
      e.push(`${at}: "plotFill" must be "none" or "solid"`);
    }
    if (pf === "solid" && ps === "line") {
      e.push(
        `${at}: "plotFill" is "solid" with "plotStyle" of "line" (C04 I59) — a box-drawing ` +
          `outline has no interior vocabulary, so this would be an outline in one alphabet ` +
          `around a body in another rather than the same figure filled`,
      );
    }
    const pc = b["plotCorners"];
    if (pc !== undefined && pc !== "rounded" && pc !== "sharp") {
      e.push(`${at}: "plotCorners" must be "rounded" or "sharp"`);
    }
    // C12 I45 — the radar's ring shape. A member on a form that has no rings is
    // ignored rather than refused, as `plotCorners` is: the union is the claim.
    const pg = b["plotGrid"];
    if (pg !== undefined && pg !== "polygon" && pg !== "circle") {
      e.push(`${at}: "plotGrid" must be "polygon" or "circle"`);
    }
    // C12 I46 — the compact box's run. Ignored where a form has no box, as
    // `plotCorners` and `plotGrid` are: the union is the claim.
    const pb = b["plotBox"];
    if (pb !== undefined && pb !== "solid" && pb !== "line") {
      e.push(`${at}: "plotBox" must be "solid" or "line"`);
    }
    plotHierarchyErrors(b, e, at, form);
    plotAxisErrors(b, e, at, form);
    plotFieldErrors(b, e, at, form);
    plotHorizonErrors(b, e, at, form);
    plotSizeErrors(b, e, at);
    plotOriginErrors(b, e, at, form);
    plotAxisCrossErrors(b, e, at, form);
    plotCalendarErrors(b, e, at, form);
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

/**
 * `yAxis` and `yCallout`, and the four refusals (C04 I60, C12 I47, C12 I48).
 *
 * **Refused rather than ignored, which is the whole shape of these two fields.**
 * A `yAxis` a form has no gutter for and a `yCallout` with no gutter to write in
 * both *look* honoured — the block constructs, the chart renders, and the field
 * did nothing. That is F207 and C12 I43's finding: an arm accepted where there
 * is none tells the caller nothing and the reader nothing.
 */
/**
 * The field family's members, refused off the family (C04 I61, C12 §3y).
 *
 * **Refused rather than ignored**, on F207's measurement: a plot that quietly
 * drops a field is one the caller believes is showing something else, and the
 * frame that results looks deliberate.
 */
/**
 * A horizon's two refusals (C12 I52, §3z H3 and H7).
 *
 * **Both are cells where two correct statements meet**, which is why neither is
 * reachable from *depth is colour* on its own and why the classification table
 * is what found them.
 *
 * **H3 — a sequential map has no second half.** The fold mirrors and the sign
 * rides the two halves of a diverging map, so a signed series under a
 * sequential one draws a trough in the same ramp as a peak: two opposite
 * readings, one colour, and every count agreeing. Refused rather than
 * substituted, because silently swapping a caller's named map is the thing
 * `colormap`'s own ruling forbids.
 *
 * **H7 — the legend is the reading.** A band is an ordinal index into a colour,
 * so a horizon with no scale beside it is a picture of coloured noise. I19's
 * argument for a matrix's scale, arriving on the one other form whose channel
 * has to be learnt.
 */
function plotHorizonErrors(
  b: Readonly<Record<string, unknown>>,
  e: string[],
  at: string,
  form: unknown,
): void {
  if (form !== "horizon") return;

  if (b["legend"] === false) {
    e.push(
      `${at}: "legend" cannot be false on a horizon (C12 I52) — band depth is a ` +
        `colour, and the scale beside it is the reading rather than furniture`,
    );
  }

  const name = b["colormap"];
  if (typeof name !== "string") return;
  const map = COLORMAPS[name];
  if (map === undefined || map.kind === "diverging") return;

  // Signed against the same baseline the renderer folds about: zero where the
  // range spans it, the data's minimum otherwise — so a series that never
  // crosses zero is unsigned and any map serves it.
  const series = b["series"];
  if (!isArray(series)) return;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    if (!isRecord(s) || !isArray(s["values"])) continue;
    for (const v of s["values"]) {
      if (!isFiniteNumber(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !(min < 0 && max >= 0)) return;

  e.push(
    `${at}: a horizon crossing its baseline needs a diverging "colormap" and ` +
      `"${name}" is ${map.kind} (C12 I52) — the fold mirrors, so the sign rides ` +
      `the map's two halves and a one-sided ramp draws a trough as a peak`,
  );
}

function plotFieldErrors(
  b: Record<string, unknown>,
  e: string[],
  at: string,
  form: unknown,
): void {
  const isField = IS_FIELD_FORM[form as PlotForm] === true;
  const dim = b["fieldDim"];
  const ink = b["glyphInk"];
  const layers = b["layers"];
  const levels = b["levels"];

  if (dim !== undefined && dim !== "none" && dim !== "floor") {
    e.push(`${at}: "fieldDim" must be "none" or "floor"`);
  }
  if (ink !== undefined && ink !== "own" && ink !== "contrast") {
    e.push(`${at}: "glyphInk" must be "own" or "contrast"`);
  }
  if (levels !== undefined && (!Array.isArray(levels) || levels.some((v) => typeof v !== "number"))) {
    e.push(`${at}: "levels" must be an array of numbers`);
  }
  const KNOWN_LAYERS = ["field", "contour", "quiver"];
  if (layers !== undefined) {
    if (!Array.isArray(layers) || layers.some((l) => !KNOWN_LAYERS.includes(l as string))) {
      e.push(`${at}: "layers" must be an array of "field", "contour" or "quiver"`);
    } else if (new Set(layers as string[]).size !== layers.length) { // cells-ok — a layer count
      // A layer named twice is a caller who believes the order means something
      // it does not — I51's inert-position ruling arriving at the gate.
      e.push(`${at}: "layers" names a layer twice (C04 I61) — a layer is drawn once`);
    }
  }

  for (const [name, value] of [["layers", layers], ["fieldDim", dim], ["glyphInk", ink]] as const) {
    if (value !== undefined && !isField) {
      e.push(
        `${at}: "${name}" on form "${String(form)}" (C04 I61) — that form paints its ` +
          `cells and draws nothing over them, so there is no second thing to order`,
      );
    }
  }
  if (levels !== undefined && form !== "contour") {
    e.push(
      `${at}: "levels" on form "${String(form)}" (C04 I61) — only a contour draws ` +
        `iso-lines, and a level on anything else names nothing`,
    );
  }
  const vectors = b["vectors"];
  if (vectors !== undefined && form !== "quiver") {
    e.push(
      `${at}: "vectors" on form "${String(form)}" (C04 I61) — only a quiver draws a ` +
        `vector field, and two numbers per cell mean nothing to any other form`,
    );
  }
  if (form === "quiver" && vectors === undefined) {
    e.push(
      `${at}: form "quiver" has no "vectors" (C04 I61) — a vector field is what it ` +
        `draws, and "series" carries one number per cell`,
    );
  }
  if (vectors !== undefined) {
    if (!Array.isArray(vectors)) {
      e.push(`${at}: "vectors" must be an array of rows`);
    } else {
      // **Rectangular, on the matrix family's own rule** (C04 I50b): rows of
      // different lengths stretch to a common width, so column k means a
      // different position in every row — self-consistent and wrong.
      const widths = new Set<number>();
      for (const row of vectors as readonly Record<string, unknown>[]) {
        const vals = row?.["values"];
        if (!Array.isArray(vals)) { e.push(`${at}: a "vectors" row has no "values" array`); continue; }
        widths.add(vals.length); // cells-ok — a position count
        for (const p of vals) {
          if (p === null) continue;
          const ok = Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"); // cells-ok — a pair length
          if (!ok) { e.push(`${at}: a "vectors" entry is not a [u, v] pair or null`); break; }
        }
      }
      if (widths.size > 1) { // cells-ok — a distinct-width count
        e.push(
          `${at}: "vectors" rows differ in length (C04 I61) — a short row stretches to ` +
            `the common width, so column k is a different position in every row`,
        );
      }
    }
  }
  // **A layer with no data is refused at the gate**, because the alternative is
  // an empty plot area that reads as a field with nothing in it.
  if (Array.isArray(layers) && layers.includes("quiver") && vectors === undefined) {
    e.push(
      `${at}: "layers" names "quiver" and there are no "vectors" (C04 I61) — a layer ` +
        `with no data draws an empty area that reads as a field with nothing in it`,
    );
  }
}

/**
 * `width`, `aspect` and `align` — **what a document can be wrong about on its
 * own** (C04 I62, C12 §3ab).
 *
 * A width wider than the terminal is **not** here, and that is the seam rather
 * than a gap: C04 has no terminal width, so refusing one would assert a fact
 * this layer does not hold. `render` clamps it against the frame, which is the
 * first place the frame exists.
 */
function plotSizeErrors(b: Record<string, unknown>, e: string[], at: string): void {
  const width = b["width"];
  const aspect = b["aspect"];
  const align = b["align"];

  if (width !== undefined && aspect !== undefined) {
    e.push(
      `${at}: "width" and "aspect" together (C04 I62) — two ways to say one number, and a ` +
        `plot that picked one would be reading the caller's other statement`,
    );
  }
  if (width !== undefined && (!isFiniteNumber(width) || width < 1 || !Number.isInteger(width))) {
    e.push(`${at}: "width" must be a whole number of cells, 1 or more (C04 I62)`);
  }
  if (aspect !== undefined && (!isFiniteNumber(aspect) || aspect <= 0)) {
    e.push(`${at}: "aspect" must be a finite number above zero (C04 I62)`);
  }
  if (align !== undefined && align !== "left" && align !== "centre" && align !== "right") {
    e.push(`${at}: "align" must be "left", "centre" or "right" (C04 I62)`);
  }
  if (align !== undefined && width === undefined && aspect === undefined) {
    e.push(
      `${at}: "align" with neither "width" nor "aspect" (C04 I62) — a figure that fills its ` +
        `frame has nothing to align inside it, and a member that does nothing reads as one ` +
        `not yet implemented`,
    );
  }
}

/**
 * `origin` — refused by name where the form has no arm for it (C04 I62).
 *
 * **One record answers both halves**, which is why there is no second lookup:
 * `ORIGIN_DEFAULT` maps a form to its default corner or to `null`, and `null`
 * *is* the refusal. A separate acceptance set beside a default table would be
 * two records obliged to agree.
 */
function plotOriginErrors(
  b: Record<string, unknown>,
  e: string[],
  at: string,
  form: unknown,
): void {
  const origin = b["origin"];
  if (origin === undefined) return;
  const known = origin === "bottom-left" || origin === "bottom-right"
    || origin === "top-left" || origin === "top-right";
  if (!known) {
    e.push(
      `${at}: "origin" must be "bottom-left", "bottom-right", "top-left" or "top-right" (C04 I62)`,
    );
    return;
  }
  if (ORIGIN_DEFAULT[form as PlotForm] === null) {
    e.push(
      `${at}: "origin" on form "${String(form)}" (C04 I62, C12 §3ac) — this form places its ` +
        `data itself and has no direction to reverse, and a member accepted where nothing ` +
        `honours it reads as one not yet implemented`,
    );
  }
}

/**
 * `axisCross`, and the two halves of the refusal that belong at different layers
 * (C04 I62, C12 §3ad).
 *
 * **Refused by form and by a *declared* range, and no further.** The condition
 * the renderer applies — the realised range strictly straddles zero — cannot be
 * checked here: it comes from `seriesRange`, which is L1, and L0 does not import
 * L1 (A02 §1). C04 I62 said *refused where the range excludes zero, at both
 * gates* and named an operation this layer does not have.
 *
 * **What it can see is the case a caller actually gets wrong**: `yMin` and
 * `yMax` both above zero or both below is a stated intention to exclude the
 * origin, beside a request to draw one. Values the caller never declared are
 * the renderer's to drop (C04 I52).
 */
function plotAxisCrossErrors(
  b: Record<string, unknown>,
  e: string[],
  at: string,
  form: unknown,
): void {
  const cross = b["axisCross"];
  if (cross === undefined) return;
  if (cross !== "edge" && cross !== "zero") {
    e.push(`${at}: "axisCross" must be "edge" or "zero" (C04 I62)`);
    return;
  }
  if (cross === "edge") return;
  if (!HONOURS_AXIS_CROSS[form as PlotForm]) {
    e.push(
      `${at}: "axisCross" on form "${String(form)}" (C04 I62, C12 §3ad) — a crossing axis needs ` +
        `a numeric ordinate and a numeric abscissa, and this form has no zero for them to meet ` +
        `at; a member accepted where nothing honours it reads as one not yet implemented`,
    );
    return;
  }
  const lo = b["yMin"];
  const hi = b["yMax"];
  if (typeof lo !== "number" || typeof hi !== "number") return;
  if (lo > 0 || hi < 0) {
    e.push(
      `${at}: "axisCross": "zero" with a declared range of ${lo}..${hi} (C04 I62, C04 I29) — ` +
        `the range excludes zero, and an axis drawn at the nearest edge would say the origin is ` +
        `somewhere it is not`,
    );
  }
}

/**
 * `matrixAnchor` and `calendarUnit` — the anchor's values, and the calendar's
 * four refusals (C04 I62, C12 I53, §3ae).
 *
 * **`matrixAnchor` is checked here for the first time and F213 is why.** C04's
 * `colormap` clause names it among five unions protected by F172's argument —
 * *a name that resolves to nothing renders uncoloured* — and none of the five
 * had a check: being a union is a compile-time fact, and this gate's subject is
 * a document. `columnMap`'s final arm is a fall-through, so `"uniforn"` rendered
 * right-anchored with a blank fringe and nothing said so. The other four are
 * open, as one commit rather than five clauses folded into a diff about dates.
 *
 * **The calendar's refusals are all four member rules**, because the shape rule
 * — more than one series — is a member rule here too: this layer can count a
 * list. `> 1` and never `!== 1`, because zero is not more than one (§3ae A8) and
 * an empty calendar is commitment 3's empty plot.
 */
function plotCalendarErrors(
  b: Record<string, unknown>,
  e: string[],
  at: string,
  form: unknown,
): void {
  const anchor = b["matrixAnchor"];
  if (
    anchor !== undefined
    && anchor !== "stretch" && anchor !== "window" && anchor !== "left" && anchor !== "uniform"
  ) {
    e.push(
      `${at}: "matrixAnchor" must be "stretch", "window", "left" or "uniform" (C04 I50b, F213) — ` +
        `an unknown anchor falls through to "window", so the matrix renders right-anchored with a ` +
        `blank fringe and nothing says the value was not understood`,
    );
  }

  const unit = b["calendarUnit"];
  if (unit === undefined) return;
  if (unit !== "hour" && unit !== "day" && unit !== "week" && unit !== "month") {
    e.push(`${at}: "calendarUnit" must be "hour", "day", "week" or "month" (C04 I62)`);
    return;
  }
  if (form !== "calendar") {
    e.push(
      `${at}: "calendarUnit" on form "${String(form)}" (C04 I62, C12 §3ae) — only a calendar has a ` +
        `grid for a unit to pick, and a member accepted where nothing honours it reads as one not ` +
        `yet implemented`,
    );
    return;
  }
  const series = b["series"];
  if (Array.isArray(series) && series.length > 1) { // cells-ok — a series count
    e.push(
      `${at}: "calendarUnit" with ${String(series.length)} series (C04 I62, C12 I53) — a calendar's ` +
        `rows are a period, so a second series is a second period claiming the same rows; the grid ` +
        `is derived from one flat series in time order`,
    );
  }
  const start = b["startDate"];
  if (start === undefined) {
    e.push(
      `${at}: "calendarUnit" without "startDate" (C04 I62, C12 I53) — a calendar's row is a claim ` +
        `about when, and placing the first reading in the first row is an assumption the caller ` +
        `never stated`,
    );
    return;
  }
  if (typeof start !== "string" || parseStartDate(start) === null) {
    e.push(
      `${at}: "startDate" is not a date this can place (C04 I62, C12 I53) — "YYYY-MM-DD", ` +
        `optionally "THH", ":MM", ":SS" and a trailing "Z"; a zone offset is refused rather than ` +
        `ignored, and a day the month does not have is refused on the leap rule`,
    );
  }
}

function plotAxisErrors(
  b: Record<string, unknown>,
  e: string[],
  at: string,
  form: unknown,
): void {
  const ya = b["yAxis"];
  const yc = b["yCallout"];
  const known = ya === "left" || ya === "right" || ya === "both" || ya === false;
  if (ya !== undefined && !known) {
    e.push(`${at}: "yAxis" must be "left", "right", "both" or false`);
  }
  const DRAWS = new Set(["last", "name", "both"]);
  // **The member had no scope until `HAS_DETAIL_RUNGS`** (F220). One reader in
  // `src/`, three call sites, and nothing refused it anywhere — so it was
  // accepted on 42 of 44 forms that do nothing with it, which is F207's
  // *accepted at construction and ignored at render* in a member rather than a
  // record.
  const pd = b["plotDetail"];
  if (pd !== undefined) {
    if (pd !== "auto" && pd !== "compact" && pd !== "full") {
      e.push(`${at}: "plotDetail" must be "auto", "compact" or "full" (C12 I34)`);
    } else if (HAS_DETAIL_RUNGS[form as PlotForm] === false) {
      e.push(
        `${at}: "plotDetail" is ${JSON.stringify(pd)} on form ${JSON.stringify(form)} ` +
          `(C12 I34) — that form has one figure and no ladder of rungs to pick from`,
      );
    }
  }
  const xt = b["xTitle"];
  if (xt !== undefined) {
    if (!isString(xt)) {
      e.push(`${at}: "xTitle" must be a string (C12 I56)`);
    } else if (b["axes"] !== true) {
      e.push(
        `${at}: "xTitle" is ${JSON.stringify(xt)} with "axes" not true (C12 I56) — a title ` +
          `names an axis, and there is none drawn to name`,
      );
    } else if (HAS_X_TITLE[form as PlotForm] === false) {
      // **The record is measured and it is what keeps I1** — sixteen of the
      // eighteen refused forms declare the title's row through `titleRows` and
      // compose no row for it, so accepting one there is a block whose measured
      // height and rendered height disagree.
      e.push(
        `${at}: "xTitle" on form ${JSON.stringify(form)} (C12 I56) — that form draws no row ` +
          `beneath its plot area for a title to sit under`,
      );
    }
  }
  if (yc !== undefined && yc !== "none" && !DRAWS.has(yc as string)) {
    e.push(`${at}: "yCallout" must be "none", "last", "name" or "both"`);
  }
  if (ya !== undefined && known && ya !== "left" && HAS_Y_GUTTER[form as PlotForm] === false) {
    e.push(
      `${at}: "yAxis" is "${String(ya)}" on form "${String(form)}" (C04 I60) — that form ` +
        `draws no y gutter, so there is no column for the labels to move to; a facet ` +
        `declares its own`,
    );
  }
  // **A matrix's row labels *are* its ordinate** (C12 I18), which is the same
  // argument I50b makes for refusing `axes: false` one field along.
  // **The family, not the one form** (C04 I50b). This read `form === "heatmap"`,
  // which is the narrow check `checkHeatmap` had already been widened out of —
  // written again in a second file, and `contour` fell through it exactly as
  // `utilisation` fell through the first.
  if (ya === false && IS_MATRIX[form as PlotForm]) {
    e.push(
      `${at}: "yAxis" is false on form "${String(form)}" (C04 I60) — a row label is the ` +
        `ordinate here, so a matrix without them is a picture of numbers with no way to ` +
        `tell which row is which`,
    );
  }
  // **Every value that draws, not the one that used to be the only one.** This
  // read `yc !== "last"`, which is the narrow check `checkHeatmap` was widened
  // out of and `ya === false && IS_MATRIX` above records a second instance of:
  // two new drawing arms would have walked past both refusals in silence, on
  // exactly the forms and gutters they were written to refuse.
  if (!DRAWS.has(yc as string)) return;
  if (HAS_CALLOUT[form as PlotForm] === false) {
    e.push(
      `${at}: "yCallout" is "${String(yc)}" on form "${String(form)}" (C04 I60) — a callout ` +
        `names where one series ends, and that form draws no per-series curve to end`,
    );
  }
  if (ya === undefined || ya === "left" || ya === false) {
    e.push(
      `${at}: "yCallout" is "${String(yc)}" with "yAxis" of "${ya === undefined ? "left" : String(ya)}" ` +
        `(C04 I60) — a callout is written in the right gutter and there is none; widen ` +
        `"yAxis" to "right" or "both"`,
    );
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
const PLOT_FORM_MEMBERS = {
  line: true, sparkline: true, heatmap: true,
  scatter: true, step: true, ecdf: true,
  bar: true, histogram: true, boxplot: true, forest: true, dumbbell: true,
  lollipop: true, dotplot: true, waffle: true,
  flame: true, icicle: true, funnel: true, gantt: true, waterfall: true, streamgraph: true, stackedarea: true, treemap: true, tree: true,
  slope: true, bubble: true, autocorrelation: true, timeline: true, bullet: true, utilisation: true,
  calendar: true, correlation: true, confusion: true, spectrogram: true, latency: true, density2d: true,
  density: true, violin: true, ridgeline: true,
  smallmultiples: true, pairplot: true,
  pie: true, radar: true,
  horizon: true,
  contour: true, quiver: true,
} satisfies Record<PlotForm, true>;
const PLOT_FORMS: ReadonlySet<string> = new Set(Object.keys(PLOT_FORM_MEMBERS));

const PLOT_STYLE_MEMBERS = {
  auto: true, braille: true, line: true, candlestick: true,
  solid: true,
} satisfies Record<NonNullable<Plot["plotStyle"]>, true>;
const PLOT_STYLES: ReadonlySet<string> = new Set(Object.keys(PLOT_STYLE_MEMBERS));

/** The four numbers, in the order the type declares them (C04 I57). */
const OHLC_KEYS = ["open", "high", "low", "close"] as const satisfies readonly (keyof OHLC)[];

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
/**
 * The fields only a named op may write (C04 I67, I68 · F231).
 *
 * `expanded` sits on a table *row* rather than on the block, so the row walk
 * below carries the same check — one set, asked in two places, because the two
 * places are where the two fields live.
 */
const FAR_SIDE_REFUSES_ON_BLOCK: readonly string[] = Object.freeze(["minHeight"]);
const FAR_SIDE_REFUSES_ON_ROW: readonly string[] = Object.freeze(["expanded"]);

function walkBlock(
  value: unknown,
  errors: string[],
  ids: Map<string, number>,
  path: Set<unknown>,
  at: string,
  opts: ValidateOptions,
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

  // **View state the far side may not set** (I67, F231). Only a named op writes
  // these, and until this ran the guarantee held at the op and leaked at the
  // field: measured, an inbound document carrying `expanded: true` validated and
  // its table measured **3 against 2** — the far side set view state and was
  // charged a real row for it.
  //
  // **A set rather than a check per field**, because the set grows whenever an
  // op is added and a line per field is how the second one goes missing. Three
  // instances of a validator blind to a member argued for closing the kind
  // (F220, F221, F231).
  //
  // **Gated, because this is not a property of a document.** A restored
  // transcript legitimately holds both — `loadTranscript` puts every persisted
  // line back through this function and *drops* what fails — so a blanket
  // refusal would silently lose every entry a reader had expanded. The rule is
  // about a boundary, so it is asked for at one.
  if (opts.from === "farSide") {
    for (const field of FAR_SIDE_REFUSES_ON_BLOCK) {
      if (value[field] !== undefined) {
        errors.push(
          `${where}: "${field}" is view state and cannot arrive from the far side ` +
            `(C04 I67) — only its named op may set it`,
        );
      }
    }
    // The row half, and it is the instance F231 measured. Here rather than in
    // `KIND_CHECKS.table` because those take a fixed signature and threading an
    // option through nineteen of them to reach one is how the next field lands
    // in only one of the two places.
    const rows = value["rows"];
    if (isArray(rows)) {
      for (const [i, row] of rows.entries()) {
        if (!isRecord(row)) continue;
        for (const field of FAR_SIDE_REFUSES_ON_ROW) {
          if (row[field] !== undefined) {
            errors.push(
              `${where} row ${String(i)}: "${field}" is view state and cannot arrive ` +
                `from the far side (C04 I67) — only its named op may set it`,
            );
          }
        }
      }
    }
  }

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
    walkBlock(child, errors, ids, path, `${where} child ${i}`, opts);
  }
  path.delete(value);
}

// --- public ---------------------------------------------------------------

/** I4 — total. Any input yields a result, never a throw. */
export function validateBlock(block: unknown, opts: ValidateOptions = {}): Validity<Block> {
  const errors: string[] = [];
  walkBlock(block, errors, new Map(), new Set(), "block", opts);
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

/**
 * Where a document came from, for the one rule that depends on it (I67).
 *
 * Absent means *do not ask* — a document already inside the system, which is the
 * store, the persist reload and every consumer of the public API. `"farSide"` is
 * an adapter's output, and it is the only place a view-state field is a lie.
 */
export type ValidateOptions = Readonly<{ from?: "farSide" }>;

/** I4 — total. I2, I3, I14 and I27 are established here and nowhere else. */
export function validateDocument(
  doc: unknown,
  opts: ValidateOptions = {},
): Validity<ViewDocument> {
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
      walkBlock(b, errors, ids, new Set(), `blocks[${i}]`, opts);
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
