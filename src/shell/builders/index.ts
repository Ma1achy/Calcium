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
 * **Every array parameter is `readonly`, and a consumer is what settled it.**
 *
 * They were mutable, and `b.seq` returns `readonly Block[]` — so the sequence
 * assembler could not feed `b.panel`, `b.group` or a row's `detail`, which are
 * the three builders that take children and the exact place vertical rhythm
 * matters most (C09 applies `gapBefore` inside a panel). The first real adapter
 * wrote `b.panel("details", b.seq([…]))` and did not compile; the workaround is
 * `[...b.seq([…])]`, a spread whose only purpose is to strip `readonly`, which
 * is the shape of an omission rather than a design.
 *
 * It is not only `b.seq`. Every field on every C04 block type is `readonly`, and
 * the framework hands consumers readonly data throughout — `RawResult.argv` is
 * `readonly string[]`. A builder surface that accepts only mutable arrays is one
 * a consumer has to copy into on the way in, everywhere, forever.
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
  LiveSpec,
  LogLine,
  StepInput,
} from "./types.js";
import { rememberLive } from "./live.js";

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
  const gap = explicit ?? gapDefault;

  // **Written only when it is true.** C04's `Gap` is `gapBefore?: boolean` and
  // `measure` counts `=== true`, so `false` and absent are the same block said
  // two ways — and a builder that emitted `gapBefore: false` where `block()`
  // omits it would produce something that renders identically and compares
  // unequal. T4.6's pairing assertion found exactly that.
  const withGap = gap ? { ...spec, gapBefore: true } : spec;

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

function kv(rows: Readonly<Record<string, string | KeyValueInput>>, opts?: BlockOpts): KeyValue {
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
    columns: readonly ColumnDef[];
    rows: readonly TableRow[];
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
  cells: Readonly<Record<string, CellInput>>,
  opts?: { detail?: readonly Block[]; actions?: readonly Action[] },
): TableRow {
  return Object.freeze({
    id,
    cells: Object.freeze(toCells(cells)),
    ...(opts?.detail === undefined ? {} : { detail: Object.freeze([...opts.detail]) }),
    ...(opts?.actions === undefined ? {} : { actions: Object.freeze([...opts.actions]) }),
  });
}

function steps(input: readonly StepInput[], opts?: BlockOpts): Steps {
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

function logs(lines: readonly LogLine[], opts?: BlockOpts): Logs {
  return finish<Logs>({ kind: "logs", id: idOf(opts, "logs"), lines } as Logs, opts, false);
}

function events(input: readonly EventLine[], opts?: BlockOpts): Events {
  return finish<Events>(
    { kind: "events", id: idOf(opts, "events"), events: input } as Events,
    opts,
    false,
  );
}

/**
 * **`yMin` and `yMax` are here and `yFormat`, `xLabels` and `emptyMessage` are
 * not** — C24 §4 carries the reasoning for each, and this comment carries the
 * one that made the pin urgent.
 *
 * Absent a pin the range is the data's, so a series that is genuinely flat is
 * drawn against its own noise. A CPU plot watching a container pinned at 100%
 * rendered a 0.2% wobble as a full-height mountain range — a reader sees violent
 * load where the load is flat. C04 I29 clamps out-of-range values to the edge
 * rather than dropping them, so a floor costs nothing at the top.
 *
 * Both, never one: C04 I29 makes them independently optional, and a builder that
 * floors an axis without capping it leaves a consumer working out which half
 * exists.
 */
function plot(
  spec: BlockOpts & {
    series: readonly Series[];
    height: number;
    axes?: boolean;
    yMin?: number;
    yMax?: number;
  },
): Plot {
  const { series, height, axes, yMin, yMax } = spec;
  return finish<Plot>(
    {
      kind: "plot",
      id: idOf(spec, "plot"),
      form: "line",
      series,
      height,
      ...(axes === undefined ? {} : { axes }),
      ...(yMin === undefined ? {} : { yMin }),
      ...(yMax === undefined ? {} : { yMax }),
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
function spark(values: readonly number[], opts?: BlockOpts): Plot {
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

function comparison(rows: readonly ComparisonRow[], opts?: BlockOpts): Comparison {
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
    hunks: readonly Hunk[];
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

function pills(chips: readonly ChipInput[], opts?: BlockOpts): Pills {
  return finish<Pills>({ kind: "pills", id: idOf(opts, "pills"), chips } as Pills, opts, false);
}

function tip(text: string, actions?: readonly Action[], opts?: BlockOpts): Tip {
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
  children: readonly Block[],
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
function group(direction: "row" | "column", children: readonly Block[], opts?: BlockOpts): Group {
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

/**
 * The builders' argument types, re-exported so C24's entry point has one place
 * to take them from — `b` and the types it accepts are one surface, and a
 * consumer importing them from two paths would be the first to notice.
 */
export type {
  BlockOpts,
  CellInput,
  ChipInput,
  ComparisonRow,
  EventLine,
  KeyValueInput,
  LiveSpec,
  LogLine,
  StepInput,
} from "./types.js";


/**
 * C24 §5 — failure isolation as a primitive, and the twentieth builder.
 *
 * **It returns a `panel`, and both halves of that were forced.**
 *
 * *One block*, because `ViewPatch` has one replacing arm: `{op, blockId, block}`
 * is one id and one block, so a part rendering three needs three patches, three
 * `rev`s for one logical refresh, and a frame composable half-way through
 * (C23 I34). A part wanting several returns a `group`.
 *
 * *A `panel`*, because `Panel` is the only kind with a `title` — and the title is
 * where a live part says what state it is in: `· 14s ago` stale, `· unavailable`
 * failing, both drawn that way by S13 §3 and §4 already. A part rendering a bare
 * `table` has nowhere to put either, so the guarantees would hold for some
 * consumers and not others, which is not a guarantee.
 *
 * **What this returns is the loading state**, and that is why C23 has no
 * `renderLoading`: the first block exists before the driver runs. C23 renders the
 * two states only C23 knows about — a fetch's result, and its failure with the
 * `retryInMs` only the backoff can supply.
 */
function live(spec: LiveSpec): Panel {
  if (spec.fetch === undefined && spec.stream === undefined) {
    throw new Error("b.live needs a `fetch` or a `stream`");
  }
  if (spec.fetch !== undefined && spec.stream !== undefined) {
    throw new Error("b.live takes `fetch` or `stream`, not both — they are exclusive");
  }
  // **Thrown, not warned** (C24 T3.6). The row said *warns* and a builder has no
  // sink: SS33 bans `console.*`, C02's warnings are C22's channel, and putting a
  // notice where the loading render goes lets a cosmetic mistake change the first
  // frame. A part stale on every tick it ever runs is a broken declaration, which
  // is what the two throws above are for.
  if (spec.every !== undefined && spec.staleAfter !== undefined && spec.staleAfter < spec.every) {
    throw new Error(
      `b.live "${spec.id}": staleAfter (${String(spec.staleAfter)}ms) is below ` +
        `every (${String(spec.every)}ms), so the part would be stale on every tick`,
    );
  }
  // Through `noticeOf`, like every other notice this file makes. The tone is a
  // fact from S02's pattern rather than a builder's inference — but SS45 cannot
  // see the difference between a constant and a lookup table, which its own
  // comment says, and the positional form is the shape the rule was written
  // around rather than a way past it.
  const loading =
    spec.renderLoading?.() ??
    noticeOf("muted", "loading…", undefined, { id: `${spec.id}-loading` });
  const panel = finish<Panel>(
    { kind: "panel", id: spec.id, title: spec.title, children: [loading] } as Panel,
    spec,
    true,
  );
  // The behaviour cannot ride on the block — `live.ts` says why the association
  // is held beside the document rather than inside it.
  rememberLive(panel, spec);
  return panel;
}

export const b = {
  live,
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
