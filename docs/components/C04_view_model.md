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
  status:    "ok" | "error" | "partial" | "proposed";
  blocks:    readonly Block[];
  error?:    ErrorLike;               // present iff status === "error"
  meta: Readonly<{
    verb:       string | null;        // null for system pass-through
    adapter:    string;               // "passthrough" is legal
    exitCode:   number;
    durationMs: number;
    truncated:  boolean;
    resultId?:  string;               // the identifier this command produced, if any
    argv:       readonly string[];    // what was actually spawned
    stderr:     string;               // usually empty
    transport:  "emulated" | "fixture" | "subprocess" | "local";
    origin:     "user" | "action" | "agent" | "refresh";
  }>;
}>;
```

`meta.resultId` is how `$_` is populated: an adapter that knows its verb returned an identifier declares it, and L4 reads it. Without this the shell would have to guess which field of an arbitrary envelope was "the" identifier, which is not knowable generically.

### The invocation record

`argv`, `stderr` and `transport` answer the question a rendered block cannot: *did the far side return something unexpected, or did the adapter mishandle it?* They live in `meta` rather than in a block because a block is content and the invocation is *about* the document — in `meta` it is uniformly available to any inspector, including one an app writes. C23 renders them through `/debug`.

**`origin` is not a debugging field, and it is required.** It is what makes a transcript legible once more than one thing is putting entries into it. Shipped optional it would be unset, then unreliable, and the first agent feature is the one that needs to trust it — so it is always present, always set by C23 (`user` for a typed submission, `action` for an exec action, `refresh` for a time-driven tick, `agent` reserved). A string now costs less than a schema migration later.

`partial` exists for streaming documents that have not finished. **A partial document is renderable at every point in its life** — there is no assembly state in which it cannot be drawn.

**`proposed` is reserved and unused in v1.** A proposed change has not run, might not run, and its actions are the point rather than a convenience — so it is none of `ok`, `error` or `partial`. No adapter may produce it (I12): C07 constructs documents from what a command *returned*, and nothing has returned yet. It ships now because adding a `status` value later is a `tui.view/2` bump under I2's rules, and the bump is the expensive part, not the field.

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

Seventeen kinds ship as defaults. The union is **open** — an app registers additional kinds through C09 (F1).

```typescript
type Block =
  | Rule | Notice | KeyValue | Table | Steps | Logs | Events
  | Plot | Progress | Code | Diff | Patch | Pills | Tip | Panel | Group | Raw;
```

```typescript
/** Every block may declare one blank row before it (§3a). */
type Gap      = Readonly<{ gapBefore?: boolean }>;

type Rule     = Readonly<{ kind: "rule"; id: string; label: string; meta?: string }> & Gap;
type Notice   = Readonly<{ kind: "notice"; id: string; tone: Tone; glyph?: Glyph; text: string }> & Gap;
type KeyValue = Readonly<{ kind: "keyValue"; id: string;
                           rows: readonly Readonly<{ label: string; value: string; tone?: Tone }>[] }> & Gap;
type Steps    = Readonly<{ kind: "steps"; id: string;
                           steps: readonly Readonly<{ label: string; detail?: string;
                             state: "pending" | "active" | "done" | "failed" }>[] }> & Gap;
type Logs     = Readonly<{ kind: "logs"; id: string;
                           lines: readonly Readonly<{ ts: string; level: string; message: string }>[] }> & Gap;
type Events   = Readonly<{ kind: "events"; id: string;
                           events: readonly Readonly<{ ts: string; type: string; message: string }>[] }> & Gap;
type Progress = Readonly<{ kind: "progress"; id: string; label: string;
                           current: number; total: number }> & Gap;
type Code     = Readonly<{ kind: "code"; id: string; language: string; text: string;
                           wrap?: boolean }> & Gap;   // default false — truncate
type Diff     = Readonly<{ kind: "diff"; id: string;
                           rows: readonly Readonly<{ field: string; a: string; b: string;
                             comparison?: "same" | "better" | "worse" | "changed" }>[] }> & Gap;
type Patch    = Readonly<{ kind: "patch"; id: string;
                           path: string;               // the file, for the header
                           language: string;           // syntax palette, per hunk line
                           hunks: readonly Hunk[];
                           layout?: "unified" | "split" }> & Gap;   // default: width-derived
type Hunk     = Readonly<{ header: string;             // @@ -18,7 +18,9 @@
                           lines: readonly Readonly<{
                             kind: "add" | "remove" | "context";
                             text: string;
                             oldNo?: number;
                             newNo?: number }>[];
                           collapsedBefore?: number }>; // unchanged lines elided above
type Pills    = Readonly<{ kind: "pills"; id: string;
                           chips: readonly Readonly<{ label: string; tone?: Tone;
                             action?: Action; active?: boolean }>[] }> & Gap;
type Tip      = Readonly<{ kind: "tip"; id: string; text: string;
                           actions?: readonly Action[] }> & Gap;
type Panel    = Readonly<{ kind: "panel"; id: string; title: string;
                           children: readonly Block[] }> & Gap;
type Group    = Readonly<{ kind: "group"; id: string;
                           direction: "row" | "column"; children: readonly Block[] }> & Gap;
type Raw      = Readonly<{ kind: "raw"; id: string; text: string }> & Gap;

type Series   = Readonly<{ values: readonly number[]; label?: string; tone?: Tone }>;
type Plot     = Readonly<{ kind: "plot"; id: string;
                           form: "line" | "sparkline";
                           series: readonly Series[];
                           height?: number; axes?: boolean;
                           xLabels?: readonly [string, string, string];
                           yFormat?: "number" | "percent" | "bytes" | "duration";
                           emptyMessage?: string }> & Gap;
```

`Table`, `TableRow`, `Cell` and `ColumnDef` are declared below. **Every block variant is declared here** — C11 and C12 own the table *engine* and the plot *renderer*, not the shapes. `id` is present on every variant because `ViewPatch` addresses blocks by it.

**`form: "line"` requires `height`.** Omitting it is a construction error, not a default. A plot's height is a layout decision the surface must make, and a magic default produces silently wrong-sized plots that nobody notices are wrong. `height` is optional on the type only because `sparkline` does not take one; the constructor enforces the pairing.

| Kind | Carries | Height at width `w` |
|---|---|---|
| `rule` | label, optional meta | 1 |
| `notice` | tone, glyph, text | `ceil(len / w)` |
| `keyValue` | rows of label/value | rows |
| `table` | columns, rows, per-row `expanded` + `detail`, empty message, `showHeader` | `(showHeader ? 1 : 0)` + rows + expanded details measured at `w - 2`, or + empty message when rows is empty |
| `steps` | steps with state pending/active/done/failed | steps |
| `logs` | lines with ts, level, message | lines — never wrapped, truncated with `…` |
| `events` | ts, type, message | events |
| `plot` | series, axis labels, `line \| sparkline` | `sparkline` → 1; `line` → declared `height`, or `height + 2` with `axes: true` (C12 §3) |
| `progress` | label, current, total | 1 |
| `code` | language, text, `wrap` | lines when truncating; `Σ ceil(len / w)` when wrapping |
| `diff` | field / a / b rows | rows + header |
| `patch` | path, language, hunks, optional `layout` | 1 header + `Σ` over hunks of (1 hunk header + lines + 1 per collapsed region) |
| `pills` | chips with actions | `ceil(totalWidth / w)` — one logical row that may wrap |
| `tip` | text with fill actions | `ceil(len / w)` |
| `panel` | title, children | children measured at `w - 2`, + 2 |
| `group` | direction, children | `column` → `Σ` children at `w`; `row` → `max` of children at the split width |
| `raw` | pre-formatted text | lines |

A *sequence* of blocks — a document's top level, a `panel`'s children, a `column`
group's children — occupies `Σ` of the above **plus one row for each block
declaring `gapBefore`** (§3a). No block's own height includes its gap.

### `gapBefore` — the one field that is vertical rhythm

```typescript
gapBefore?: boolean       // default false — one blank row before this block
```

Nothing else in the vocabulary produces vertical space, and the S-series draws it
everywhere: S08's success frame illustrates seventeen rows and composes to
thirteen, the four extra being blank rows between regions. Composed from the
vocabulary as it stood, the surfaces could not be drawn.

**It is content, not view state.** A `merge` carries it, unlike `expanded` (I9):
the space before a block is a property of the document's shape rather than of
what the user has done to it, and a `--watch` tick that rebuilt a table's rows
must not close up the gap above it.

**Height is stated at the sequence, not at the block.** `measure(block, w)` is
unchanged and never counts the gap; a *sequence* of blocks occupies
`Σ measure(b, w) + the number of them declaring gapBefore`. Two consequences,
both intended:

- A block measures the same wherever it appears, so C14's cache stays keyed on
  the block and the width alone.
- Every composer applies the same rule — the document's top level, a `panel`'s
  children, a `column` group's children — because they are all sequences. A
  `row` group is not: its children sit side by side, so a gap before one of them
  is meaningless and is ignored rather than being an error.

**It applies to the first block too.** `gapBefore` on the first block of a
sequence is a leading blank row, because the alternative — silently dropping it —
makes the field mean two things depending on position, and a document assembled
by concatenating two others would then render differently from either.

**Who sets it is C24's problem, not an adapter's.** `b.*` supplies defaults per
kind (C24 §4): a `table` or a `plot` following anything gets one, a second
`pills` row does not. An adapter that wants a different rhythm sets the field;
one that does not think about it gets the rhythm the surfaces already draw.

### Container widths, and the width a `row` group gives its children

The three container kinds pass a width to `measureChild`, and until this was written down it was the largest hole in §5: two of them narrow the width and one of them splits it, and a measurer that passes `w` through unchanged agrees with nothing that renders.

- **`panel`** measures children at `w - 2` — the border takes a column each side.
- **`table`** measures an expanded row's `detail` at `w - 2`, matching `panel`, and matching the indent C11 §2 already applies.
- **`group`, `direction: "column"`** measures every child at `w` and sums.
- **`group`, `direction: "row"`** splits equally: `floor((w - gaps) / n)` where `gaps` is `n - 1` cells of gutter, one between each pair. Children are measured at that width and the group takes the `max`.

**Equal split, with no weights field.** Uneven allocation is expressible as nested groups — S13's two-up-then-full-width is two groups and works under an equal split. A `weights` field would be a second layout system inside a block whose height rule already has to stay simple enough to hold I7. Add weights when a surface needs them, and not before.

Because the floor rule below gives every child at least 1, a `row` group at a width too narrow to split still measures — `floor` can reach 0, and a child measured at width 0 is measured at width 1 (T3.2).

**And a child that cannot be placed is not measured.** The floor makes the arithmetic total, and it also makes it possible for the children plus their gutters to be wider than the group: two children at width 1 need three columns. What renders then was unstated, and the three available answers are not equivalent — overflow the group (the terminal wraps it into a row nobody counted), stack the children (the height becomes a sum where the rule says max), or place as many as fit and drop the rest. **The third is the rule.** Children are placed left to right while the budget lasts; a child that does not fit is placed by neither half, so it contributes to neither the rendered rows nor the measured height. The group still measures at least 1.

This is a rule about a degenerate width rather than a layout feature: above `2n - 1` columns every child fits and nothing is dropped. It is written down because the alternative to writing it down is each half choosing separately, and the two choices differ by exactly one row.

A `pills` block is **one logical row**. Prism's two-row filter layout (kind row, then status row) is two `pills` blocks, not one block that wraps — wrapping is overflow behaviour, not a layout choice.

### `patch` and `diff` are not variants of each other

They share a name and nothing else. `diff` is rows of `{field, a, b, comparison}` — a **structured** comparison, right for S07's metric table. `patch` is hunks of text with line numbers, two palettes and collapse. Merging them would produce a block whose measurement depends on which mode it is in, and C09 I1 is the invariant that cannot bend: a kind whose height rule branches on a mode flag is a kind whose measurer and renderer drift apart quietly.

`patch` is declared here because C04 owns every block shape — settled when `plot` moved out to C12 — but it is **registered by C25**, exactly as `table` is by C11 and `plot` by C12. `collapsedBefore` is view state that affects height, so it lives in the block (commitment 4); expanding a collapsed region patches the document rather than mutating anything external, which is the same mechanism C11 uses for expanded rows and the reason it reaches a frozen entry when an action cannot.

`raw` is the escape hatch and it is load-bearing. Anything unmodellable — a system command's stdout, an unrecognised envelope — becomes `raw` and still renders. **The vocabulary never has to be complete for the tool to work.**

### Cell

The unit inside a `table`, and the only place a tone and a glyph travel together.

```typescript
type Cell = Readonly<{
  text:   string;
  tone?:  Tone;
  glyph?: Glyph;                      // leading status glyph — a slot, never a character
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
}> & Gap;

type ColumnDef = Readonly<{
  key:       string;
  label:     string;
  align:     "left" | "right";
  priority:  number;                  // higher survives longer
  minWidth:  number;                  // cells, excluding the gap
  maxWidth?: number;
  flex?:     boolean;                 // absorbs residual width
  sortable:  boolean;
}>;

type TableRow = Readonly<{
  id:        string;
  cells:     Readonly<Record<string, Cell>>;
  detail?:   readonly Block[];
  actions?:  readonly Action[];
  expanded?: boolean;                 // view state — never merged (I9)
}>;

/** A row as it may arrive in a `merge`. View state is absent by type (I9). */
type MergeRow = Omit<TableRow, "expanded">;
```

`showHeader: false` gives a headerless list with per-row actions — the shape small lists need, without inventing a block type for it. `detail` being `Block[]` is what lets an expanded run row reveal a plot, a progress bar and a set of actions, composed from the same vocabulary rather than a bespoke detail renderer.

**`ColumnDef` is declared here, not in C11.** It is part of a block's shape, and commitment 11 says every block shape is declared in C04 — the same split that gives C04 `Plot`'s shape while C12 rasterises it. C11 keeps `PlannedColumns` and `planColumns`, which are genuinely planning rather than content. The alternative considered and rejected was a type-only import from C11: it erases at build and so passes the module-graph check, which is precisely the objection — an L0 → L1 dependency that `make enforce` reports as clean is worse than one it catches.

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

### A block names a glyph slot, for the same reason

```typescript
type Glyph =
  | "ok" | "warn" | "error" | "info"
  | "pending" | "working" | "running" | "queued" | "cancelled"
  | "expand" | "collapse" | "live" | "bullet";
```

**The identical argument.** A glyph embedded in a block is the same character on every terminal, has no fallback at `unicode: "ascii"`, and cannot be width-checked at load. `glyph: "✗"` is `colour: "#c0ffee"` written in a different field.

It is also the argument commitment 10 already makes and could not keep. **Every capability-driven substitution is 1:1 by column count** — but C09 can only guarantee that for glyphs it owns, and while the field is a free string an app supplies whatever it likes and C09 emits it verbatim. The guarantee was therefore mostly-true, which is worse than a narrow one: it holds for the box drawing and the spinner and silently does not hold for the thing an adapter wrote, and the failure appears only under `LANG=C`, only for the users who cannot report it precisely.

The evidence that this drifts is not hypothetical. Before tokenisation the tree contained `✗`, `✖`, `*`, `+` and `▲` in glyph positions, in five files, for three roles.

C09 §4 owns the vocabulary and both renderings, and the 1:1 rule holds by construction rather than by review.

**The escape hatch, stated so that the guarantee stays absolute:** a glyph outside the vocabulary goes in the block's **text**, not its glyph field, and its behaviour under ASCII is the app's problem. That is where every action label already lives — `↗ open`, `⊘ cancel`, `⬡ pods` are text in a label, not glyph slots — and it is why the surfaces need no change. A vocabulary with an "or any string" arm is not a vocabulary.

**`working` is in the list because S11 and S15 illustrate it** and nothing else covers it: `◐ connecting`, `◐ mlflow starting`, `◐ layers installing` is a fourth state beside `pending` (not started), `running` (steady) and `queued`. A token missing from the type is a surface that cannot be built, so the list was checked against the illustrations rather than reasoned out. `info`, `cancelled` and `bullet` are the other direction — no surface illustrates them today. They ship anyway because adding a token later is additive and cheap while a renderer meeting an unrepresentable state is not, and because `info` is already a `Tone`.

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
  | { op: "merge";   blockId: string; rows: readonly MergeRow[] }
  | { op: "status";  status: ViewDocument["status"] };

type PatchResult =
  | Readonly<{ ok: true;  doc: ViewDocument }>
  | Readonly<{ ok: false; error: ErrorLike }>;

function applyPatch(doc: ViewDocument, patch: ViewPatch): PatchResult;

function validateDocument(doc: unknown): Result<ViewDocument, readonly string[]>;
function validateBlock(block: unknown): Result<Block, readonly string[]>;
```

`applyPatch` is pure and returns a new document; C13 holds the result.

### Patch application can fail, and says so in its type

A `status` patch to `"error"` on a document with no `error` field produces a document that violates I3. That is not hypothetical and not rare — it is one of four ways a well-typed patch meets a document it does not fit:

| Failure | Why it is a failure and not a no-op |
|---|---|
| A `status` transition that would violate I3 | The result would be an invalid document, and I3 is enforced by `validateDocument` rather than by convention |
| `merge` against a block that is not a `table` | Rows have nowhere to go; silently discarding them loses a `--watch` tick |
| An unknown `blockId` on `replace` or `merge` | The caller is addressing something that is not there — a bug worth surfacing, exactly as C13 §6 surfaces a patch to a settled entry |
| A duplicate `blockId` in the document | Addressing is ambiguous; there is no correct block to act on |

**It returns rather than throws.** This runs on every stream tick, in the render path, from a function I4 calls total. A pure data function that throws there is worse than one that returns: C23 §5 must handle the failure either way, and only one of the two forms can be handled without a `try` around the hot loop. C23 settles the entry with what it had; C13's §6 keeps the previous document.

The earlier reading, in which an unknown `blockId` was a silent no-op (T1.10), is withdrawn. Absorbing that case makes a mis-addressed stream indistinguishable from a stream with nothing to say.

### `merge` upserts, and never deletes

`merge` is what makes `--watch` cheap: rows are upserted by `id`, unchanged rows keep their identity, and **view state is never merged** — an expanded row stays expanded because `MergeRow` is not permitted to carry the flag at all. Without row-level merge every tick replaces the whole table and any open detail collapses under the user.

**A row absent from the payload is untouched, not removed.** Absence from one tick is not evidence of absence: a watch tick that returns fewer rows because a query timed out must not silently delete them. Deletion is expressible — `replace` with a fresh `Table` — and the adapter is the layer that knows whether a missing row means *gone* or means *not reported this time*.

### `replace` is wholesale

`replace` substitutes the block entire. View state in the outgoing block is **not** carried over; the block is now a different block.

The alternative — inheriting `expanded` for rows whose id survives — was rejected on its failure mode rather than its cost. It would leave `replace` and `merge` differing only in deletion semantics, and it would let an expansion survive onto a row that happens to share an id with something semantically different. Wholesale is the behaviour that can be reasoned about from the call site.

### The three operations compose

Patches apply in sequence, each to the result of the last, and the sequence is defined:

- `merge` then `merge` accumulates. New rows are appended in payload order after the existing rows; rows already present are updated in place and keep their position. View state survives both, on touched and untouched rows alike.
- `replace` after any number of `merge`s discards the accumulated view state along with the block. This is the design, not an oversight — see above.
- A failing patch mid-sequence leaves the document at its last good state. `applyPatch` returns the failure and no partial mutation is possible, because it never mutates.

---

## 4a. Block ids are unique within a document

`replace` and `merge` both address blocks by `id`, so a document with two blocks sharing one is not addressable. `validateDocument` checks it, across nested children as well as top-level blocks, and `applyPatch` fails rather than guessing when it meets one.

This is why a `merge` against the wrong kind is a failure rather than a no-op: once ids are unique, an id that resolves to a non-`table` is unambiguously the caller's mistake, and there is no second candidate it might have meant.

---

## 4b. Constructors, and what C24's `b` is

C04 ships a constructor per block kind. They are not a second way to build a block and C24's builders are not a parallel implementation — **`b` is built on these**.

- **C04's constructors enforce the shape invariants.** Deep freeze (I1), a glyph on `error` and `warn` tones (I6), `height` present for `form: "line"` (§3). They take a *complete* block and return a frozen one.
- **C24's `b` is the ergonomic layer over them** — generated ids, bare strings accepted as cells, action helpers. It adds convenience and delegates enforcement. **`b` never freezes or validates directly.** If it did, I1 would have two places to be wrong, and the one that drifts is always the one with fewer tests.

Stated here rather than only in C24 because the failure is asymmetric: an implementer reading C24 alone will reasonably freeze in the builder, and nothing about a frozen block reveals that it was frozen twice.

### Validation terminates on a cycle

A `ViewDocument` is a tree, but nothing stops a hand-assembled one — from a test, or a bad adapter — from containing a cycle through `panel.children` or a row's `detail`. `validateDocument` must **refuse** it rather than recurse.

The mechanism is a **path-scoped seen-set**: a container is added on descent and removed on ascent, so a cycle is caught exactly and a subtree that legitimately appears in two places is not. Not a depth limit, which puts an arbitrary number in the spec and answers "how deep is too deep" instead of the question actually asked. One mechanism, named, because two is two places to disagree.

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

`measure` is a function of a block and a width, and the gap before a block is a
property of the sequence it sits in — so no measurer counts it, and every
composer does (§3a).

Requirements on every measurer:

- **At least 1** — a block that is present occupies at least one row. `ceil(cells("") / w)` is 0 and an empty `notice` renders as one row; a `code` block's blank line is a line. Stated once, as a rule over every kind, rather than as seventeen per-kind special cases — the arithmetic that reaches 0 is the same arithmetic in each of them. The only kinds that legitimately measure 0 are containers with no children (`group`, T3.5), which are not present content but the absence of it.
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
- **I6** — Any `Notice` or `Cell` toned `error` or `warn` carries a glyph, and every glyph is a member of `Glyph` — a slot, never a character. Lint over block construction, satisfying D29 at the source rather than at the renderer. The type carries the second half: a literal in a glyph position does not compile.
- **I7** — `measure` is pure, total, and equals rendered height (§5).
- **I8** — `applyPatch` is pure. Given the same document and patch, the result is deeply equal.
- **I9** — `merge` carries **data only**. View state — `expanded`, focus, selection — is always taken from the existing row, never from the incoming one, whether or not the row is touched. A `--watch` tick cannot collapse a row the user opened.
- **I10** — A partial document is renderable. No block kind has an "incomplete" representation that renders differently from a complete one.
- **I11** — C04 imports nothing from `terminal/`, `presentation/` or above. Verified on the module graph.
- **I12** — `status: "proposed"` is never produced by an adapter. C07 constructs documents from what a command returned, and a proposed change has not run. Reserved for the agent path; unused in v1.
- **I13** — `meta.origin` is always present. It is not optional, and no code path constructs a document without it — a provenance field that can be absent becomes a provenance field nobody trusts.
- **I14** — Block ids are unique within a document, nested children included. Checked by `validateDocument`; `applyPatch` fails rather than guessing (§4a).
- **I15** — `applyPatch` is fallible in its type and never throws. Every one of the four failure cases in §4 returns `{ok: false}` with an `ErrorLike`, and the input document is returned untouched and still frozen.
- **I16** — A `merge` payload cannot carry view state. Structural, via `MergeRow`, not remembered: I9 holds because the field does not exist to be set.
- **I17** — Every measurer returns at least 1 for a present block (§5). Only an empty container measures 0.
- **I19** — `gapBefore` is content: `merge` carries it, `measure` never counts it, and every sequence of blocks adds one row per block declaring it. A composer that inserts spacing of its own instead (C23 §2) makes a document's height unknowable from the document.
- **I18** — `validateDocument` terminates on any input, including a cyclic one. A path-scoped seen-set refuses a cycle; it is not a depth limit, and it does not reject a legitimately shared subtree.

---

## 7. Commitments

1. `ViewDocument` is a pure, deeply immutable value with no reference to Ink, terminals or the network.
2. Seventeen block kinds ship; the union is open and extended through C09's registry.
3. `raw` renders anything, so the vocabulary is never blocking.
4. View state that affects height lives in the block.
5. Blocks name palette slots and glyph slots, never values or characters; `error` and `warn` tones carry glyphs.
6. Only `message` is required on `ErrorLike`; Prism's envelope is a specialisation.
7. `fill` is the default action; `exec` is reserved for reversible operations.
8. `applyPatch` is pure; `merge` upserts by row id and preserves untouched rows.
9. `measure(block, w)` equals rendered height at width `w`, and is pure and total.
10. Capability-driven glyph substitution is width-preserving, and holds for **every** glyph a block can name — which is what closing `Glyph` to a vocabulary buys. A free-string field made this guarantee mostly-true.
11. C04 owns the schema — **every** block variant is declared here; C09 owns the registry, C11 the table engine, C12 the plot renderer, C25 the patch renderer.
12. The schema identifier is framework-named `tui.view/1`. `tui-kit` ships nothing Prism-branded.
13. A `pills` block is one logical row; multi-row pill layouts are multiple blocks.
14. Capability-driven substitutions are 1:1 by column count.
15. `validateDocument` and `validateBlock` are public, total, and the single enforcement point for I3.
16. Schema version is `tui.view/1`; mismatch is refused at the boundary.
17. `meta` carries the invocation record — `argv`, `stderr`, `transport` — so any inspector can answer what actually ran without re-running it.
18. `meta.origin` is required and always set by C23. Provenance that can be absent is provenance nobody trusts.
19. `status: "proposed"` ships reserved and unused, and no adapter produces it. Deciding the shape now costs a field; deciding it later costs a `tui.view/2` bump.
20. `patch` and `diff` are separate kinds. One is field rows, the other is text hunks, and merging them makes measurement depend on a mode flag.
21. `applyPatch` returns a `PatchResult` and never throws. Four failure cases, each named, each leaving the input document untouched.
22. Block ids are unique within a document, and `validateDocument` is where that is established.
23. `merge` never deletes a row; `replace` is how a table sheds one, and the adapter decides which it means.
24. `replace` is wholesale — view state is not carried across it.
25. A `merge` payload cannot carry view state, by type rather than by rule.
26. Container widths are declared: `panel` and table detail at `w - 2`, a `column` group at `w`, a `row` group at an equal split. No weights field until a surface needs one.
27. Every measurer returns at least 1 for a present block.
28. `form: "line"` requires `height`; there is no default.
29. C04's constructors enforce the shape invariants and C24's `b` delegates to them. One enforcement point for I1.
30. `validateDocument` terminates on a cyclic structure, via a path-scoped seen-set.

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
- **T1.8b** (I16): `MergeRow` cannot carry view-state fields — a compile-level test asserts the merge row type omits them.
- **T1.9**: `status` patch changes only `status`.
- **T1.10** (I15): a patch referencing an unknown `blockId` returns `{ok: false}`, not a throw and not a no-op.
- **T1.11** (I3): `ErrorLike` with only `message` validates; `remediation` present produces a fill action when adapted.
- **T1.12** (I15): each of the four failure cases in §4 returns `{ok: false}` with a populated `ErrorLike`, and in every one the input document is unchanged and still frozen.
- **T1.13** (I15, the composition test): `merge` → `merge` → `replace`. The two merges accumulate, new rows land in payload order after the existing ones, and view state survives on touched and untouched rows alike; the `replace` then discards all of it. Both halves asserted, because the second is a design decision and would otherwise read as a bug.
- **T1.14** (I15): a failing patch in the middle of a sequence leaves the document at its last good state, and the following patch still applies to it.
- **T1.15** (I14): `validateDocument` rejects a document with two blocks sharing an id, including when one of them is nested inside a `panel`.
- **T1.16** (§3): constructing a `plot` with `form: "line"` and no `height` throws; `sparkline` without one does not.
- **T1.17** (I18): a document whose `panel` contains itself is refused by `validateDocument` with a named error, and the call returns. A shared-but-acyclic subtree appearing twice validates — the seen-set is path-scoped, and a global one would fail this.
- **T1.18** (I1, §4b): C24's `b` produces blocks frozen exactly once — the constructor is the only freeze point, asserted by spying on it.

### Tier 2 — contract / interface

The generic suite. **These run against every registered block kind, including app-registered ones**, so a consumer's custom block is held to the same contract as the seventeen defaults.

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
- **T3.5**: a `group` with zero children → 0. The one legitimate zero (I17).
- **T3.6**: a `panel` with zero children → 2, the borders alone.
- **T3.6b** (I17): a `notice` with empty text, a `tip` with empty text, and a `code` block of one blank line → 1 each, not 0. The floor, at the three kinds whose arithmetic reaches zero.
- **T3.6c** (§3): a `row` group of three children at width 80 measures each at `floor((80 - 2) / 3)` = 26 and returns the max; at width 2 the split floors to 0 and each child is measured at 1, and the group still returns ≥ 1.
- **T3.7**: deeply nested `group` inside `panel` inside `group`, five levels → correct sum, no stack overflow.
- **T3.8**: a block containing double-width CJK text → measured columns account for width 2 per glyph.
- **T3.9**: a block containing a grapheme cluster (emoji with ZWJ and variation selector) → counted as one cell, not by code unit.
- **T3.10**: a block containing a combining mark → the base character's width, not two.
- **T3.11**: `logs` line longer than `w` → 1 line (truncated), not wrapped. Logs never wrap; this is the property that keeps a tail's height predictable.
- **T3.12**: a `table` where every row is expanded → height includes every detail; collapsing all returns the original.
- **T3.13**: `applyPatch` with a `merge` carrying an empty row array → `{ok: true}`, document unchanged.
- **T3.13b** (§4): a `merge` whose payload omits half the existing rows → every omitted row survives. Absence is not deletion.
- **T3.14**: a document at the 10,000-block cap (D40) → validation flags `truncated`, and measurement of the whole set completes within budget.
- **T3.15** (I18): circular structure passed as a block → refused by the validator rather than hanging the measurer.

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
- **T6.10** (I15): making `applyPatch` return a bare `ViewDocument` again, absorbing the four failures → T1.12 and T1.14 fail, and C23 loses the mechanism its §5 depends on.
- **T6.11** (I16): typing the `merge` arm as `TableRow[]` → T1.8b fails to compile, which is the point: the guard is the type, not the runtime.
- **T6.12** (I14): dropping the uniqueness check from `validateDocument` → T1.15 fails, and T1.12's duplicate-id case stops being reachable.
- **T6.13** (I18): swapping the path-scoped seen-set for a global one → T1.17's shared-subtree half fails; removing it entirely hangs T3.15 rather than failing it, which is why T1.17 asserts the call *returns*.
- **T6.14** (I17): removing the `max(1, …)` floor → T3.6b fails at all three kinds.
- **T6.15** (§3): giving a `row` group's children the full width → T3.6c fails, and T2.1 fails at every width where a child wraps.
- **T6.16** (§4b): freezing inside C24's `b` as well as in the constructor → T1.18 fails on the spy count.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| The registry, and the measure/render implementations | C09 |
| Tone → colour resolution | C10 |
| Column *planning* — priority, drop order, `PlannedColumns` | C11. `ColumnDef` itself is here, being shape rather than plan |
| Producing documents from verb JSON | C07 |
| Holding documents, live-vs-frozen | C13 |
| Using measured heights to virtualise | C14 |
| What any specific verb's document looks like | The S-series |
