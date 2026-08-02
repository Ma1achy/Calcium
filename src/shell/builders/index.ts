/**
 * `b` — the ergonomic layer over C04's constructors (C24 §4).
 *
 * The API's quality is mostly this, because an adapter is the thing a consumer
 * writes a hundred times and a block is what an adapter returns.
 *
 * **`b` never freezes or validates directly.** Every builder ends in C04's
 * `block()` or `cell()`. Freezing here as well would give C04 I1 two enforcement
 * points, and the one that drifts is always the one with fewer tests — a block
 * frozen twice is indistinguishable from a block frozen once, right up until one
 * of the two paths stops doing it.
 *
 * **Only `b` is exported, and that is a design constraint rather than a
 * preference.** MG25 fires on an exported function no other module in `src/`
 * names, so nineteen `export function`s here would be nineteen violations or
 * nineteen allow-list entries. Written as module-private functions assembled
 * into one object, the rule has nothing to fire on — and the shape is honest,
 * because the builders genuinely have exactly one consumer, which is `b`.
 *
 * **`blockId` is imported, never reimplemented** (`../documents.js`). A second
 * block-id counter is drift MG20 exists to catch, and two counters would hand
 * out the same id from different modules.
 */

import { block, cell } from "../../data/viewmodel/index.js";
import type {
  Action,
  Block,
  Cell,
  Code,
  ColumnDef,
  Comparison,
  Events,
  Glyph,
  Group,
  Hunk,
  KeyValue,
  Logs,
  Notice,
  Panel,
  Patch,
  Pills,
  Plot,
  Progress,
  Raw,
  Rule,
  Series,
  Steps,
  Table,
  TableRow,
  Tip,
  Tone,
} from "../../data/viewmodel/index.js";
import { blockId } from "../documents.js";
import { defaulted, seq } from "./seq.js";
import type {
  BlockOpts,
  CellInput,
  ChipInput,
  ComparisonRow,
  EventLine,
  KeyValueInput,
  LogLine,
  StepInput,
} from "./types.js";

// --- the two shared decisions ---------------------------------------------

/**
 * Apply `id` and resolve `gapBefore`, then hand the whole thing to C04.
 *
 * The `gapBefore` resolution is the part with a rule in it (I15, §4a):
 *
 *   - an **explicit** value of either polarity passes through verbatim and the
 *     block is *not* marked, so `b.seq` will not touch it;
 *   - an **absent** option takes the builder's default and the block *is*
 *     marked, because the default is a preference until `b.seq` resolves it.
 *
 * Marking happens even when the default is `false`. The mark records where the
 * value came from, not what it is, and a block that was never asked about is a
 * preference whichever way it went.
 */
function finish<B extends Block>(spec: B, opts: BlockOpts | undefined, gapDefault: boolean): B {
  const explicit = opts?.gapBefore;
  const withGap =
    explicit !== undefined
      ? { ...spec, gapBefore: explicit }
      : gapDefault
        ? { ...spec, gapBefore: true }
        : spec;

  const built = block(withGap as B);
  if (explicit === undefined) defaulted(built);
  return built;
}

/** A supplied id, or a generated one. Ids are never rendered (I4). */
function idOf(opts: BlockOpts | undefined, prefix: string): string {
  return opts?.id ?? blockId(prefix);
}

/**
 * The glyph a tone requires, when the caller did not give one (T3.9).
 *
 * C04 I6 makes a glyph mandatory on `error` and `warn` because colour alone
 * does not survive 1-bit or a colour-blind reader (D29). The builder supplying
 * it is the ergonomic half of that: C04 still enforces, and `b` simply stops a
 * consumer from having to restate the obvious.
 *
 * **This is not inference from a field name** (I5). The mapping is tone → glyph,
 * over C04's own `GLYPH_REQUIRED_TONES`, and it is total and fixed. What I5
 * forbids is guessing meaning from a key called `status`.
 */
function glyphFor(tone: Tone, given: Glyph | undefined): Glyph | undefined {
  if (given !== undefined) return given;
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  return undefined;
}

/** A bare string is a cell with default tone (§4). */
function toCell(input: CellInput): Cell {
  return typeof input === "string" ? cell({ text: input }) : cell(input);
}

function toCells(input: Record<string, CellInput>): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const [key, value] of Object.entries(input)) out[key] = toCell(value);
  return out;
}

// --- the nineteen ---------------------------------------------------------

function rule(label: string, meta?: string, opts?: BlockOpts): Rule {
  return finish<Rule>(
    { kind: "rule", id: idOf(opts, "rule"), label, ...(meta === undefined ? {} : { meta }) } as Rule,
    opts,
    true,
  );
}

function noticeOf(tone: Tone, text: string, glyph?: Glyph, opts?: BlockOpts): Notice {
  const g = glyphFor(tone, glyph);
  return finish<Notice>(
    {
      kind: "notice",
      id: idOf(opts, "notice"),
      tone,
      text,
      ...(g === undefined ? {} : { glyph: g }),
    } as Notice,
    opts,
    false,
  );
}

const notice = Object.assign(noticeOf, {
  ok: (text: string, opts?: BlockOpts): Notice => noticeOf("ok", text, undefined, opts),
  warn: (text: string, opts?: BlockOpts): Notice => noticeOf("warn", text, undefined, opts),
  error: (text: string, opts?: BlockOpts): Notice => noticeOf("error", text, undefined, opts),
  info: (text: string, opts?: BlockOpts): Notice => noticeOf("info", text, undefined, opts),
});

function kv(rows: Record<string, string | KeyValueInput>, opts?: BlockOpts): KeyValue {
  return finish<KeyValue>(
    {
      kind: "keyValue",
      id: idOf(opts, "kv"),
      rows: Object.entries(rows).map(([label, value]) =>
        typeof value === "string"
          ? { label, value }
          : { label, value: value.text, ...(value.tone === undefined ? {} : { tone: value.tone }) },
      ),
    } as KeyValue,
    opts,
    true,
  );
}

function table(
  spec: BlockOpts & {
    columns: ColumnDef[];
    rows: TableRow[];
    showHeader?: boolean;
    emptyMessage?: string;
  },
): Table {
  const { id: _id, gapBefore: _gap, columns, rows, showHeader, emptyMessage } = spec;
  return finish<Table>(
    {
      kind: "table",
      id: idOf(spec, "table"),
      columns,
      rows,
      ...(showHeader === undefined ? {} : { showHeader }),
      ...(emptyMessage === undefined ? {} : { emptyMessage }),
    } as Table,
    spec,
    true,
  );
}

/**
 * A column, with the five required fields defaulted.
 *
 * `label` defaults to the key, which is what every surface writes when the two
 * would be the same. `priority` and `minWidth` have no principled default — 50
 * and 8 are the middle of the range C11 plans over — so a surface that cares
 * sets them, and one that does not gets a column that survives planning.
 */
function col(key: string, spec?: Partial<Omit<ColumnDef, "key">>): ColumnDef {
  return Object.freeze({
    key,
    label: key,
    align: "left" as const,
    priority: 50,
    minWidth: 8,
    sortable: false,
    ...spec,
  });
}

function row(
  id: string,
  cells: Record<string, CellInput>,
  opts?: { detail?: Block[]; actions?: Action[] },
): TableRow {
  return Object.freeze({
    id,
    cells: Object.freeze(toCells(cells)),
    ...(opts?.detail === undefined ? {} : { detail: Object.freeze([...opts.detail]) }),
    ...(opts?.actions === undefined ? {} : { actions: Object.freeze([...opts.actions]) }),
  });
}

function steps(input: StepInput[], opts?: BlockOpts): Steps {
  return finish<Steps>(
    {
      kind: "steps",
      id: idOf(opts, "steps"),
      steps: input.map((s) => ({
        label: s.label,
        ...(s.detail === undefined ? {} : { detail: s.detail }),
        state: s.state ?? "pending",
      })),
    } as Steps,
    opts,
    true,
  );
}

function logs(lines: LogLine[], opts?: BlockOpts): Logs {
  return finish<Logs>({ kind: "logs", id: idOf(opts, "logs"), lines } as Logs, opts, false);
}

function events(input: EventLine[], opts?: BlockOpts): Events {
  return finish<Events>(
    { kind: "events", id: idOf(opts, "events"), events: input } as Events,
    opts,
    false,
  );
}

function plot(spec: BlockOpts & { series: Series[]; height: number; axes?: boolean }): Plot {
  const { series, height, axes } = spec;
  return finish<Plot>(
    {
      kind: "plot",
      id: idOf(spec, "plot"),
      form: "line",
      series,
      height,
      ...(axes === undefined ? {} : { axes }),
    } as Plot,
    spec,
    true,
  );
}

/**
 * The sparkline path.
 *
 * **No `height`.** C04 §3 requires one for `form: "line"` and says a sparkline
 * "is always 1 and must not carry one" — the height is the form's, not the
 * block's, so writing `height: 1` here would be a second place that number
 * lives.
 */
function spark(values: number[], opts?: BlockOpts): Plot {
  return finish<Plot>(
    { kind: "plot", id: idOf(opts, "spark"), form: "sparkline", series: [{ values }] } as Plot,
    opts,
    false,
  );
}

function progress(
  spec: BlockOpts & { label: string; current: number; total: number },
): Progress {
  const { label, current, total } = spec;
  return finish<Progress>(
    { kind: "progress", id: idOf(spec, "progress"), label, current, total } as Progress,
    spec,
    false,
  );
}

/** `wrap` defaults to false (T3.8); S10 sets it true. */
function code(language: string, text: string, opts?: BlockOpts & { wrap?: boolean }): Code {
  return finish<Code>(
    { kind: "code", id: idOf(opts, "code"), language, text, wrap: opts?.wrap ?? false } as Code,
    opts,
    true,
  );
}

function comparison(rows: ComparisonRow[], opts?: BlockOpts): Comparison {
  return finish<Comparison>(
    { kind: "comparison", id: idOf(opts, "comparison"), rows } as Comparison,
    opts,
    true,
  );
}

function patch(
  spec: BlockOpts & {
    path: string;
    language: string;
    hunks: Hunk[];
    layout?: "unified" | "split";
  },
): Patch {
  const { path, language, hunks, layout } = spec;
  return finish<Patch>(
    {
      kind: "patch",
      id: idOf(spec, "patch"),
      path,
      language,
      hunks,
      ...(layout === undefined ? {} : { layout }),
    } as Patch,
    spec,
    true,
  );
}

function pills(chips: ChipInput[], opts?: BlockOpts): Pills {
  return finish<Pills>({ kind: "pills", id: idOf(opts, "pills"), chips } as Pills, opts, false);
}

function tip(text: string, actions?: Action[], opts?: BlockOpts): Tip {
  return finish<Tip>(
    {
      kind: "tip",
      id: idOf(opts, "tip"),
      text,
      ...(actions === undefined ? {} : { actions }),
    } as Tip,
    opts,
    true,
  );
}

function panel(
  title: string,
  children: Block[],
  opts?: BlockOpts & { footer?: string },
): Panel {
  return finish<Panel>(
    {
      kind: "panel",
      id: idOf(opts, "panel"),
      title,
      ...(opts?.footer === undefined ? {} : { footer: opts.footer }),
      children,
    } as Panel,
    opts,
    true,
  );
}

/**
 * A layout wrapper, and it does **not** gap (§4).
 *
 * Gapping the group *and* the first child that carries its own default produces
 * two blank rows where the surfaces draw one.
 */
function group(direction: "row" | "column", children: Block[], opts?: BlockOpts): Group {
  return finish<Group>(
    { kind: "group", id: idOf(opts, "group"), direction, children } as Group,
    opts,
    false,
  );
}

function raw(text: string, opts?: BlockOpts): Raw {
  return finish<Raw>({ kind: "raw", id: idOf(opts, "raw"), text } as Raw, opts, false);
}

/**
 * One transient line reporting on what precedes it — so it does **not** gap,
 * though `b.steps` does and both return `Steps`.
 *
 * This is the row that shows the default belongs to the *builder* and not to the
 * block kind (I15). A default keyed on `block.kind` could not express it.
 *
 * The animation is C09's: `blocks/kinds/structured.ts` drives the spinner frame
 * from `ctx.tick`, so there is nothing to animate here and `measure` never sees
 * it (I7).
 */
function spinner(label: string, opts?: BlockOpts): Steps {
  return finish<Steps>(
    { kind: "steps", id: idOf(opts, "spinner"), steps: [{ label, state: "active" }] } as Steps,
    opts,
    false,
  );
}

// --- cells and actions ----------------------------------------------------

const toned =
  (tone: Tone) =>
  (text: string): Cell => {
    const glyph = glyphFor(tone, undefined);
    return cell({ text, tone, ...(glyph === undefined ? {} : { glyph }) });
  };

// --- the object -----------------------------------------------------------

export const b = {
  rule,
  notice,
  kv,
  table,
  col,
  seq,
  row,
  steps,
  logs,
  events,
  plot,
  spark,
  progress,
  code,
  comparison,
  patch,
  pills,
  tip,
  panel,
  group,
  raw,
  spinner,

  // cell shorthands
  id: toned("identifier"),
  ok: toned("ok"),
  warn: toned("warn"),
  error: toned("error"),
  dim: toned("dim"),
  meta: toned("meta"),

  // actions
  fill: (label: string, command: string): Action =>
    Object.freeze({ kind: "fill" as const, label, command }),
  exec: (label: string, command: string): Action =>
    Object.freeze({ kind: "exec" as const, label, command }),
  open: (label: string, url: string): Action =>
    Object.freeze({ kind: "open" as const, label, url }),
} as const;
