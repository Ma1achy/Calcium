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
  type Result,
  type ViewDocument,
} from "./types.js";

export type Validity<T> = Result<T, readonly string[]>;

const STATUSES: ReadonlySet<string> = new Set<DocumentStatus>([
  "ok",
  "error",
  "partial",
  "proposed",
]);

const GLYPHS: ReadonlySet<Glyph> = new Set<Glyph>([
  "ok", "warn", "error", "info", "pending", "working", "running",
  "queued", "cancelled", "expand", "collapse", "live", "bullet",
]);

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
          if (isRecord(cell)) requireGlyph(cell["glyph"], e, `${at} cell "${key}"`);
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
    if (b["form"] !== "line" && b["form"] !== "sparkline") {
      e.push(`${at}: "form" must be "line" or "sparkline"`);
    }
    // §3 — no default. The validator says so as well as the constructor,
    // because a document can arrive from a fixture without passing through one.
    if (b["form"] === "line" && !isFiniteNumber(b["height"])) {
      e.push(`${at}: form "line" requires a numeric "height" (C04 §3) — there is no default`);
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

/** Children of a container, for the recursive walk. Total on malformed input. */
function childBlocksOf(b: Record<string, unknown>): readonly unknown[] {
  const kind = b["kind"];
  if (kind === "panel" || kind === "group") {
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
