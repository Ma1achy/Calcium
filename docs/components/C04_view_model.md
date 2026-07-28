# C04 — View model

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L0 data |
| **Depends on** | Nothing. Pure types and pure functions |
| **Consumed by** | C07 adapters (produce documents) · C09 blocks (implement measure and render) · C13 transcript (holds documents, applies patches) · C14 viewport (reads measured heights) · every surface spec |
| **Source** | A01 D10, D15, D35–D37, D40 · A01 F1, F3 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

C04 is the vocabulary the entire system speaks. A Prism verb, a slash command and `git status` all become a `ViewDocument` before anything renders (A02 §5), and that single convergence is why there is one render path rather than three.

It is deliberately the least interesting component to run and the most consequential to get wrong. It executes nothing. It is types, plus a handful of pure functions over them, plus one contract — **measured height must equal rendered height** — that everything above L1 depends on and nothing else can enforce.

**C04 owns the schema. It does not own the registry.** The registry pairs each block kind with a `measure` and a `render`, and `render` needs theme and capabilities, which are L1 and L0-terminal respectively. A registry at L0 data would import upward and sideways. The registry therefore lives in C09 (L1), and C04 declares only the contract it must satisfy. *(This corrects A02 §2, which placed `BlockRegistry` at L0 data.)*

**No state machine.** Pure types and pure functions (A02 §7).

---

## 2. The document

```typescript
type ViewDocument = Readonly<{
  schema:    "tui.view/1";
  command:   string;                  // the input exactly as typed
  status:    "ok" | "error" | "partial";
  blocks:    readonly Block[];
  error?:    ErrorLike;               // present iff status === "error"
  meta: Readonly<{
    verb:       string | null;        // null for system pass-through
    adapter:    string;               // "passthrough" is legal
    exitCode:   number;
    durationMs: number;
    truncated:  boolean;
    resultId?:  string;               // the identifier this command produced, if any
  }>;
}>;
```

`meta.resultId` is how `$_` is populated: an adapter that knows its verb returned an identifier declares it, and L4 reads it. Without this the shell would have to guess which field of an arbitrary envelope was "the" identifier, which is not knowable generically.

`partial` exists for streaming documents that have not finished. **A partial document is renderable at every point in its life** — there is no assembly state in which it cannot be drawn.

```typescript
type ErrorLike = Readonly<{
  message:      string;               // the only required field
  code?:        string;
  stage?:       string;
  details?:     Readonly<Record<string, unknown>>;
  remediation?: string;               // rendered as a fill action when present
}>;
```

Only `message` is required (F3). Prism's `{code, stage, message, details}` envelope is a specialisation that satisfies this without the framework knowing anything about Prism.

---

## 3. Block vocabulary

Sixteen kinds ship as defaults. The union is **open** — an app registers additional kinds through C09 (F1).

```typescript
type Block =
  | Rule | Notice | KeyValue | Table | Steps | Logs | Events
  | Plot | Progress | Code | Diff | Pills | Tip | Panel | Group | Raw;
```

```typescript
type Rule     = Readonly<{ kind: "rule"; id: string; label: string; meta?: string }>;
type Notice   = Readonly<{ kind: "notice"; id: string; tone: Tone; glyph?: string; text: string }>;
type KeyValue = Readonly<{ kind: "keyValue"; id: string;
                           rows: readonly Readonly<{ label: string; value: string; tone?: Tone }>[] }>;
type Steps    = Readonly<{ kind: "steps"; id: string;
                           steps: readonly Readonly<{ label: string; detail?: string;
                             state: "pending" | "active" | "done" | "failed" }>[] }>;
type Logs     = Readonly<{ kind: "logs"; id: string;
                           lines: readonly Readonly<{ ts: string; level: string; message: string }>[] }>;
type Events   = Readonly<{ kind: "events"; id: string;
                           events: readonly Readonly<{ ts: string; type: string; message: string }>[] }>;
type Progress = Readonly<{ kind: "progress"; id: string; label: string;
                           current: number; total: number }>;
type Code     = Readonly<{ kind: "code"; id: string; language: string; text: string;
                           wrap?: boolean }>;   // default false — truncate
type Diff     = Readonly<{ kind: "diff"; id: string;
                           rows: readonly Readonly<{ field: string; a: string; b: string;
                             comparison?: "same" | "better" | "worse" | "changed" }>[] }>;
type Pills    = Readonly<{ kind: "pills"; id: string;
                           chips: readonly Readonly<{ label: string; tone?: Tone;
                             action?: Action; active?: boolean }>[] }>;
type Tip      = Readonly<{ kind: "tip"; id: string; text: string;
                           actions?: readonly Action[] }>;
type Panel    = Readonly<{ kind: "panel"; id: string; title: string;
                           children: readonly Block[] }>;
type Group    = Readonly<{ kind: "group"; id: string;
                           direction: "row" | "column"; children: readonly Block[] }>;
type Raw      = Readonly<{ kind: "raw"; id: string; text: string }>;

type Series   = Readonly<{ values: readonly number[]; label?: string; tone?: Tone }>;
type Plot     = Readonly<{ kind: "plot"; id: string;
                           form: "line" | "sparkline";
                           series: readonly Series[];
                           height?: number; axes?: boolean;
                           xLabels?: readonly [string, string, string];
                           yFormat?: "number" | "percent" | "bytes" | "duration";
                           emptyMessage?: string }>;
```

`Table`, `TableRow` and `Cell` are declared below; `ColumnDef` is C11's, since it describes planning rather than content. **Every block variant is declared here** — C11 and C12 own the table *engine* and the plot *renderer*, not the shapes. `id` is present on every variant because `ViewPatch` addresses blocks by it.

| Kind | Carries | Height at width `w` |
|---|---|---|
| `rule` | label, optional meta | 1 |
| `notice` | tone, glyph, text | `ceil(len / w)` |
| `keyValue` | rows of label/value | rows |
| `table` | columns, rows, per-row `expanded` + `detail`, empty message, `showHeader` | `(showHeader ? 1 : 0)` + rows + expanded details, or + empty message when rows is empty |
| `steps` | steps with state pending/active/done/failed | steps |
| `logs` | lines with ts, level, message | lines — never wrapped, truncated with `…` |
| `events` | ts, type, message | events |
| `plot` | series, axis labels, `line \| sparkline` | declared `height`, or 1 for sparkline |
| `progress` | label, current, total | 1 |
| `code` | language, text, `wrap` | lines when truncating; `Σ ceil(len / w)` when wrapping |
| `diff` | field / a / b rows | rows + header |
| `pills` | chips with actions | `ceil(totalWidth / w)` — one logical row that may wrap |
| `tip` | text with fill actions | `ceil(len / w)` |
| `panel` | title, children | children + 2 |
| `group` | direction, children | derived from children |
| `raw` | pre-formatted text | lines |

A `pills` block is **one logical row**. Prism's two-row filter layout (kind row, then status row) is two `pills` blocks, not one block that wraps — wrapping is overflow behaviour, not a layout choice.

`raw` is the escape hatch and it is load-bearing. Anything unmodellable — a system command's stdout, an unrecognised envelope — becomes `raw` and still renders. **The vocabulary never has to be complete for the tool to work.**

### Cell

The unit inside a `table`, and the only place a tone and a glyph travel together.

```typescript
type Cell = Readonly<{
  text:   string;
  tone?:  Tone;
  glyph?: string;                     // leading status glyph
  spark?: readonly number[];          // inline sparkline appended to text
}>;

type Table = Readonly<{
  kind:          "table";
  id:            string;
  columns:       readonly ColumnDef[];
  rows:          readonly TableRow[];
  sort?:         Readonly<{ key: string; direction: "asc" | "desc" }>;
  showHeader?:   boolean;                // default true
  emptyMessage?: string;
}>;

type TableOptions = Readonly<{
  showHeader?: boolean;               // default true; false for headerless lists
}>;

type TableRow = Readonly<{
  id:        string;
  cells:     Readonly<Record<string, Cell>>;
  detail?:   readonly Block[];
  actions?:  readonly Action[];
  expanded?: boolean;                 // view state — never merged (I9)
}>;
```

`showHeader: false` gives a headerless list with per-row actions — the shape small lists need, without inventing a block type for it. `detail` being `Block[]` is what lets an expanded run row reveal a plot, a progress bar and a set of actions, composed from the same vocabulary rather than a bespoke detail renderer.

### View state lives in the block

A table's sort order, a row's `expanded` flag, an applied filter — all live **in the block**, not beside it. Two consequences, both intended: `measure` stays a pure function of the block, and a transcript entry is self-describing, so a frozen block records exactly the state it was frozen in (D8).

Expanding a row is a `ViewPatch` against the document, not a mutation of external view state.

### Tone, not colour

```typescript
type Tone =
  | "default" | "dim" | "muted"
  | "ok" | "warn" | "error" | "info"
  | "accent" | "meta" | "identifier";
```

**A block names a palette slot; it never embeds a colour value.** `Tone` is the slot type of the `tone` palette — the semantic one, and the overwhelmingly common case. Other palettes exist (`syntax` for `code` blocks, `spectrum` for app art) and an app may add its own; C10 §2 owns their declaration.

The constraint is indirection, not scarcity. Three things depend on it and none of them require the vocabulary to be small: a value embedded in a block is the same value in both themes, has no meaning at 16 colours or at 1-bit, and cannot be contrast-validated at load. A `Cell` toned `error` is expected to carry a glyph too — D29 is a constraint on block *construction*, and the lint in §6 checks it.

### Actions

```typescript
type Action =
  | { kind: "fill";   label: string; command: string }
  | { kind: "exec";   label: string; command: string }
  | { kind: "open";   label: string; url: string }
  | { kind: "expand"; label: string; target: string };
```

`fill` is the default; `exec` is the exception. Populating the prompt lets the dev read and edit before running, which matters when the command is `production cancel <uuid>`. Only filter pills use `exec`, because a filter is trivially reversible (A01 D8).

---

## 4. Patches

```typescript
type ViewPatch =
  | { op: "append";  block: Block }
  | { op: "replace"; blockId: string; block: Block }
  | { op: "merge";   blockId: string; rows: readonly TableRow[] }
  | { op: "status";  status: ViewDocument["status"] };

function applyPatch(doc: ViewDocument, patch: ViewPatch): ViewDocument;

function validateDocument(doc: unknown): Result<ViewDocument, readonly string[]>;
function validateBlock(block: unknown): Result<Block, readonly string[]>;
```

`applyPatch` is pure and returns a new document; C13 holds the result.

`merge` is what makes `--watch` cheap: rows are upserted by `id`, unchanged rows keep their identity, and **view state is never merged** — an expanded row stays expanded because the incoming row is not permitted to carry the flag at all. Without row-level merge every tick replaces the whole table and any open detail collapses under the user.

---

## 5. The measurement contract

The one thing in C04 that is not merely a type.

```typescript
type MeasureFn = (block: Block, width: number) => number;
type Measure<B extends Block = Block> =
  (block: B, width: number, measureChild: MeasureFn) => number;
```

Container kinds — `panel`, `group`, and a `table`'s expanded detail — measure children they do not know the kind of. `measureChild` is injected by the registry (C09), which passes its own dispatcher. This keeps measurement pure and avoids a module cycle between the registry and the kinds registered into it.

**`measure(block, w)` must equal the number of terminal rows that rendering `block` at width `w` actually occupies.** C14 virtualises by measured height without rendering; if the two disagree, the viewport drifts, scroll positions land wrong, and content jumps as the user scrolls past it. This is the most load-bearing invariant in the system and the hardest to hold, because it is violated silently.

Requirements on every measurer:

- **Pure** — same block, width and `measureChild`, same answer, always. Cacheable, and C14 caches it.
- **Total** — no input produces a throw. Malformed content measures as something, even if that something is 1.
- **Monotone in content** — adding a row never decreases height. Not enforceable generically, but a property test per block kind.
- **Independent of theme** — colour never changes row count. Capabilities *can* (ASCII fallbacks may alter wrapping), so measurers receive width only, and any capability-driven substitution must be width-preserving.

That last clause is a real constraint on C09: **every capability-driven substitution is 1:1 by column count.** An ASCII fallback glyph occupies exactly as many columns as the Unicode one it replaces, or measurement and rendering diverge the moment someone runs under `LANG=C`.

The ellipsis is the case that catches people: `…` is one column and `...` is three, so the ASCII truncation marker is a single `~`, not three dots. Any substitution that cannot be made 1:1 must instead change the *content budget* at measure time, which means the measurer needs the capability — and no default block requires that.

---

## 6. Invariants

- **I1** — `ViewDocument` and every `Block` are deeply immutable. All mutation is `applyPatch` returning a new value.
- **I2** — `schema` is checked on every document. An unrecognised version is refused at the boundary, not rendered.
- **I3** — `error` is present iff `status === "error"`. Enforced by `validateDocument`, not by convention.
- **I4** — `validateDocument` and `validateBlock` are total: any input yields a result, never a throw.
- **I5** — No block carries a colour. Lint: no hex literal, no ANSI code, no colour name in `viewmodel/`.
- **I6** — Any `Notice` or `Cell` toned `error` or `warn` carries a non-empty glyph. Lint over block construction, satisfying D29 at the source rather than at the renderer.
- **I7** — `measure` is pure, total, and equals rendered height (§5).
- **I8** — `applyPatch` is pure. Given the same document and patch, the result is deeply equal.
- **I9** — `merge` carries **data only**. View state — `expanded`, focus, selection — is always taken from the existing row, never from the incoming one, whether or not the row is touched. A `--watch` tick cannot collapse a row the user opened.
- **I10** — A partial document is renderable. No block kind has an "incomplete" representation that renders differently from a complete one.
- **I11** — C04 imports nothing from `terminal/`, `presentation/` or above. Verified on the module graph.

---

## 7. Commitments

1. `ViewDocument` is a pure, deeply immutable value with no reference to Ink, terminals or the network.
2. Sixteen block kinds ship; the union is open and extended through C09's registry.
3. `raw` renders anything, so the vocabulary is never blocking.
4. View state that affects height lives in the block.
5. Blocks name palette slots, never values; `error` and `warn` tones carry glyphs.
6. Only `message` is required on `ErrorLike`; Prism's envelope is a specialisation.
7. `fill` is the default action; `exec` is reserved for reversible operations.
8. `applyPatch` is pure; `merge` upserts by row id and preserves untouched rows.
9. `measure(block, w)` equals rendered height at width `w`, and is pure and total.
10. Capability-driven glyph substitution must be width-preserving.
11. C04 owns the schema — **every** block variant is declared here; C09 owns the registry, C11 the table engine, C12 the plot renderer.
12. The schema identifier is framework-named `tui.view/1`. `tui-kit` ships nothing Prism-branded.
13. A `pills` block is one logical row; multi-row pill layouts are multiple blocks.
14. Capability-driven substitutions are 1:1 by column count.
15. `validateDocument` and `validateBlock` are public, total, and the single enforcement point for I3.
16. Schema version is `tui.view/1`; mismatch is refused at the boundary.

---

## 8. Tests

Six tiers. No state machine, so no transition table.

### Tier 1 — unit

- **T1.1** (I1): every constructor returns a frozen value; mutation attempts do not change it, at every nesting depth.
- **T1.2** (I3): a validator accepts `status:"error"` with `error` present, and `status:"ok"` without; rejects both mismatches.
- **T1.3** (I2): a document with `schema:"tui.view/2"` is refused with a named error.
- **T1.4** (I8): `applyPatch` with `append` returns a new document with one more block; the input is unchanged and still frozen.
- **T1.5**: `replace` swaps the block with the matching id and leaves the rest identical by reference.
- **T1.6** (I9): `merge` upserts three rows into a ten-row table — seven rows are reference-identical afterwards, three are new.
- **T1.7** (I9): `merge` against a table whose row 4 is `expanded: true`, not touching row 4 → row 4 is still expanded.
- **T1.8** (I9): `merge` touching an expanded row, with the incoming row carrying `expanded: false` → the row stays expanded. Incoming view state is discarded, not merged.
- **T1.8b** (I9): a `TableRow` type used in a `merge` payload cannot carry view-state fields — a compile-level test asserts the merge row type omits them.
- **T1.9**: `status` patch changes only `status`.
- **T1.10**: a patch referencing an unknown `blockId` is a no-op, not a throw.
- **T1.11** (I7): `ErrorLike` with only `message` validates; `remediation` present produces a fill action when adapted.

### Tier 2 — contract / interface

The generic suite. **These run against every registered block kind, including app-registered ones**, so a consumer's custom block is held to the same contract as the sixteen defaults.

- **T2.1** (I7, the headline): for every registered kind × a fixture corpus × widths {40, 60, 80, 100, 120, 160, 200}, `measure(block, w)` equals the line count of the rendered output at width `w`. This is the single most valuable test in the system.
- **T2.2** (I7): `measure` is pure — a hundred repeat calls return the same number and perform no I/O.
- **T2.3** (I7): `measure` is total — a corpus of malformed, empty and adversarial blocks (empty rows, zero-length strings, null-ish fields, 10,000-character cells) produces a number, never a throw.
- **T2.4**: `measure` is monotone — appending a row to any collection block never decreases the result.
- **T2.5**: `measure` never returns a negative or non-integer value, at any width including 1.
- **T2.6** (C10): under `unicode:"ascii"`, `measure` returns the same value as under `unicode:"full"` for every fixture — glyph substitution is width-preserving.
- **T2.7** (I5): a source scan finds no hex literal, ANSI code or colour name in `viewmodel/`.
- **T2.8** (I6): every fixture block toned `error` or `warn` carries a non-empty glyph; a lint rule fails construction otherwise.
- **T2.9** (I11): the module graph shows no import from `terminal/` or above.
- **T2.10**: every member of the `Block` union is exhaustively handled by the validator — adding a kind without validation fails the build. *(Registry completeness — that every kind has a registered measurer and renderer — is C09's test, since C09 owns the registry.)*

### Tier 3 — edge cases

- **T3.1**: `measure` at width 1 — every block returns ≥ 1 and does not divide by zero.
- **T3.2**: `measure` at width 0 — treated as 1; no infinity, no NaN.
- **T3.3**: a `notice` whose text is exactly `w`, `w-1` and `w+1` characters → 1, 1 and 2 lines. The off-by-one boundary.
- **T3.4**: a `table` with zero rows → header plus the empty message, not zero.
- **T3.5**: a `group` with zero children → 0.
- **T3.6**: a `panel` with zero children → 2, the borders alone.
- **T3.7**: deeply nested `group` inside `panel` inside `group`, five levels → correct sum, no stack overflow.
- **T3.8**: a block containing double-width CJK text → measured columns account for width 2 per glyph.
- **T3.9**: a block containing a grapheme cluster (emoji with ZWJ and variation selector) → counted as one cell, not by code unit.
- **T3.10**: a block containing a combining mark → the base character's width, not two.
- **T3.11**: `logs` line longer than `w` → 1 line (truncated), not wrapped. Logs never wrap; this is the property that keeps a tail's height predictable.
- **T3.12**: a `table` where every row is expanded → height includes every detail; collapsing all returns the original.
- **T3.13**: `applyPatch` with a `merge` carrying an empty row array → document unchanged.
- **T3.14**: a document at the 10,000-block cap (D40) → validation flags `truncated`, and measurement of the whole set completes within budget.
- **T3.15**: circular structure passed as a block → refused by the validator rather than hanging the measurer.

### Tier 4 — integration

- **T4.1** (with C07): a fallback-adapted arbitrary JSON object produces a valid document that passes every T2 contract test.
- **T4.2** (with C09): registering a custom block kind adds it to the T2.1 corpus automatically — the generic suite discovers it rather than being extended by hand.
- **T4.3** (with C13): appending fifty documents and applying two hundred patches leaves every document valid and frozen.
- **T4.4** (with C14): virtualisation over a 10,000-block transcript selects a visible range whose summed measured heights equal the viewport height, exactly.
- **T4.5** (with C14): expanding a row mid-transcript changes measured height and shifts subsequent blocks by exactly that delta — no drift.
- **T4.6** (with C10): the same document rendered under both themes produces identical line counts.

### Tier 5 — e2e

- **T5.1**: a real session scrolls a 10,000-block transcript top to bottom; every block's on-screen row count matches its measured height, sampled at every screenful. The drift test.
- **T5.2**: the same, at four terminal widths, with resize between passes.
- **T5.3**: a `--watch` stream applying `merge` patches for sixty seconds → the viewport does not jump, and an expanded row stays expanded and stays put.

### Tier 6 — fail-on-revert

- **T6.1** (I7): a measurer that under-counts wrapped lines by one → T2.1 fails at the width where wrapping begins.
- **T6.2** (I7): a measurer that ignores the `expanded` flag → T3.12 and T4.5 fail.
- **T6.3** (C10): an ASCII fallback glyph of a different width → T2.6 fails.
- **T6.4** (I9): a `merge` that rebuilds every row → T1.6 fails on reference identity, catching the viewport-jump regression before anyone sees it.
- **T6.5** (I1): returning a mutable block from any constructor → T1.1 fails.
- **T6.6** (I5): adding a `colour` field to any block → T2.7 fails.
- **T6.7** (§1): moving the registry into C04, or importing theme into `viewmodel/` → T2.9 fails.
- **T6.8** (I3): allowing `error` on an `ok` document → T1.2 fails.
- **T6.9** (I10): adding an assembly-only block representation → T5.3 fails as a partial document renders differently mid-stream.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| The registry, and the measure/render implementations | C09 |
| Tone → colour resolution | C10 |
| Column priority and drop order | C11 |
| Producing documents from verb JSON | C07 |
| Holding documents, live-vs-frozen | C13 |
| Using measured heights to virtualise | C14 |
| What any specific verb's document looks like | The S-series |
