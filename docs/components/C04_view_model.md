# C04 — View model

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
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
    origin:     "user" | "action" | "agent" | "refresh" | "defect";
  }>;
}>;
```

`meta.resultId` is how `$_` is populated: an adapter that knows its verb returned an identifier declares it, and L4 reads it. Without this the shell would have to guess which field of an arbitrary envelope was "the" identifier, which is not knowable generically.

### The invocation record

`argv`, `stderr` and `transport` answer the question a rendered block cannot: *did the far side return something unexpected, or did the adapter mishandle it?* They live in `meta` rather than in a block because a block is content and the invocation is *about* the document — in `meta` it is uniformly available to any inspector, including one an app writes. C23 renders them through `/debug`.

**`origin` is not a debugging field, and it is required.** It is what makes a transcript legible once more than one thing is putting entries into it. Shipped optional it would be unset, then unreliable, and the first agent feature is the one that needs to trust it — so it is always present, always set by C23 (`user` for a typed submission, `action` for an exec action, `refresh` for a time-driven tick, `defect` for a failure the framework contained and is reporting, `agent` reserved). A string now costs less than a schema migration later.

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
  | Plot | Progress | Code | Comparison | Patch | Pills | Tip | Panel | Group | Raw;
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
type Comparison = Readonly<{ kind: "comparison"; id: string;
                           rows: readonly Readonly<{ field: string; a: string; b: string;
                             comparison?: "same" | "better" | "worse" | "changed" }>[] }> & Gap;
type Patch    = Readonly<{ kind: "patch"; id: string;
                           path: string;               // the file, for the header
                           language: string;           // syntax palette, per hunk line
                           hunks: readonly Hunk[];
                           collapsedAfter?: number;
  /** The gutter width, pinned when this block is a window of a larger one (C25 I21a). */
  numberWidth?: number;    // elided below the last hunk
                           actions?: readonly Action[];
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
                           footer?: string;                    // the bottom border
                           children: readonly Block[] }> & Gap;
type Group    = Readonly<{ kind: "group"; id: string;
                           direction: "row" | "column"; children: readonly Block[] }> & Gap;
type Raw      = Readonly<{ kind: "raw"; id: string; text: string }> & Gap;

type Series   = Readonly<{ values: readonly (number | null)[];   // `null` is a gap (I46a, C12 I4)
                           label?: string; tone?: Tone }>;
type PlotForm = "line" | "sparkline" | "heatmap";
type Plot     = Readonly<{ kind: "plot"; id: string;
                           form: PlotForm;
                           series: readonly Series[];
                           height?: number; axes?: boolean;
                           xLabels?: readonly [string, string, string];
                           yFormat?: "number" | "fraction" | "percent"
                                   | "bytes" | "duration";   // the unit IN, not OUT (I41)
                           yMin?: number; yMax?: number;      // pin the range (I29)
                           xMin?: number; xMax?: number;      // the domain the samples span (I58)
                           xFormat?: Plot["yFormat"];         // one formatter, two axes (I58)
                           emptyMessage?: string }> & Gap;
```

`Table`, `TableRow`, `Cell` and `ColumnDef` are declared below. **Every block variant is declared here** — C11 and C12 own the table *engine* and the plot *renderer*, not the shapes. `id` is present on every variant because `ViewPatch` addresses blocks by it.

**`yFormat` names the unit the value arrives in, and it used to name the unit it renders as**
(I41, F31). Both `fraction` and `percent` draw a per-cent sign, so *what it renders as* cannot
tell them apart and was never the axis to name them on. What differs is what the producer is
holding:

| arm | in | out |
|---|---|---|
| `fraction` | `0.84` | `84%` |
| `percent` | `100.2` | `100%` |

`fraction` **is the old `percent`, renamed** — the arm that multiplies by 100. It kept the
behaviour and lost the name, because the name was the defect: a far side that emits a field
called a percentage emits `100.2`, not `1.002`, so the obvious call rendered **`10020%`**
(F31, measured against docker's `CPUPerc`). This framework exists to wrap JSON-emitting CLIs,
so the arm a consumer reaches for first must be the one that matches what a CLI emits, and the
surprising arm must carry the surprising name.

**Renaming a member of a public enum is breaking, and that is the argument for doing it now.**
The freeze is ahead; two callers exist in this tree and both are fixtures. `percent` and
`percentage` — one letter apart, opposite meanings — was the alternative, and it is the
two-meanings-one-word class this project has already found the hard way three times
(`dismissable`, `origin`, `viewState`). Shipping a fourth deliberately is worse than a rename
taken before anyone depends on it.

**And the arm is validated now**, which it never was. An unknown string fell through to the
numeric arm, so a typo rendered plain numbers and said nothing — and the rename is precisely
the event that produces typos, because `percentage` is what a reader guesses.

**`yMin` and `yMax` pin the vertical range.** C12 §3 says the range is computed over all series "unless the block pins them" and C12 T1.14 tests exactly that, while the shape had no field to pin it with — intent stated in prose that the schema could not carry, the same class as the missing `align` and the missing truncation side. Absent, the range is the data's; present, values outside it clamp to the edge rather than escaping the grid, which is what makes a pinned axis usable for comparing two plots rather than a way to lose points off the top.

Both are optional and independent: pinning only `yMin` at 0 is the common case, because a loss curve that autoscales its floor exaggerates every wobble near zero.

**`Cell.bar` is a quantity against a scale, and it is not `progress`** (I50c, C12 §3b). The two answer different questions: `progress` is *how far through*, with a `total` that is reached; a bar is *how much*, against a ceiling that may be exceeded and may not be knowable. `examples/docker` hand-wrote one in nine lines rather than bend the other, and FINDINGS gap 3 states why — *tones are severity and a load bar borrows `warn`/`error` and means neither*.

```typescript
type BarSpec = Readonly<{
  value: number | null;      // `null` is absent — a mark, never an empty bar
  max: number;               // the scale's top; the fill clamps here and the number does not
  min?: number;              // default 0
  format?: Plot["yFormat"];  // the same vocabulary the y-labels use — one formatter, two callers
}>;
```

**`format` is `yFormat`'s vocabulary and that is deliberate.** A bar's number and a plot's y-label are the same question — *what unit did this arrive in* — and a second enum would be a second place for I41's `fraction`/`percent` confusion to happen.

**A cell carries at most one of `spark` and `bar`.** Both fill the planned width and return before truncation, so a cell with both has two renderings and no rule for which wins — refused at construction rather than resolved by declaration order.

**The tone stays the app's.** A framework that shipped thresholds would ship arbitrary numbers for everyone; what it owes is that expressing the mapping costs a `tone` on the cell rather than a hand-drawn bar. The cell's existing `tone` and `glyph` carry it, which is why `BarSpec` has neither.

**`form: "heatmap"` is a matrix of rows, and it refuses three things rather than ignoring them** (I50b, C12 §6a). A row is a `Series` because `seriesRange` already computes the one range that makes a matrix a matrix, and §5's label column already holds row labels at no cost in plot rows — but three of `Plot`'s affordances have no meaning for it, and an ignored member is how a type acquires a field that means nothing in one arm and everything in another:

- **`tone` on a row** — magnitude owns the cell, so a per-row tone is a second colour channel fighting the first. That is `Tone` asked to carry a second axis, which is roadmap 51's finding; refusing is what stops it recurring.
- **`axes: false`** — the scale legend is the only thing that says what a cell means. A heatmap without one is unreadable rather than plain, so the flag that would remove it is an error and not an option.
- **a ragged matrix** — rows of differing length. The renderer places a sample at `round((i / span) * (w − 1))` using that row's own length, so a short row is stretched to the common width and column `k` means a different instant in every row: arithmetically self-consistent, and describing a different thing than it holds. Padding is the only fix and the renderer cannot do it, because it does not know which end is old. The app does.

`height` is required, exactly as `form: "line"` requires it — a matrix's row count is *data*, and a height derived from it would move every block below whenever a container started.

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
| `comparison` | field / a / b rows | rows + header |
| `patch` | path, language, hunks, optional `layout` | 1 header + `Σ` over hunks of (1 hunk header + lines + 1 per collapsed region) |
| `pills` | chips with actions | `ceil(totalWidth / w)` — one logical row that may wrap |
| `tip` | text with fill actions | `ceil(len / w)` |
| `panel` | title, footer, children | children measured at `w - 2`, + 2 |
| `group` | direction, children | `column` → `Σ` children at `w`; `row` → `max` of children at the split width |
| `scroll` | declared `height`, children | `height`, plus one residue row where the content overflows (I47, I49). **Absent from this table until F228**, which found the same gap in C09's |
| `status` | state, message, optional `retryInMs` / `attempt` / `elapsedMs` / `spinner` | `height` — the box is bound by what `measure` committed (C09 I31) |
| `raw` | pre-formatted text | lines |

A *sequence* of blocks — a document's top level, a `panel`'s children, a `column`
group's children — occupies `Σ` of the above **plus one row for each block
declaring `gapBefore`** (§3a). No block's own height includes its gap.

### 3a. `gapBefore` — the one field that is vertical rhythm

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

**`footer` is text in a row that is already drawn**, which is why it changes no
measurement. `title` lives in the top border and `footer` in the bottom one, and a
panel was always two rows taller than its children — so this is a use for a row that
exists rather than a new one. Two surfaces draw it: S12 §2's keymap line and S13 §2's
outer keymap, both pushed views whose keys belong to the view rather than to the
shell. A pushed view cannot put them in the frame's footer — C15 T4.4 leaves header
and footer untouched, and C22's footer is one app-supplied row — so without this the
figures draw something no block produces.
- **`table`** measures an expanded row's `detail` at `w - 2`, matching `panel`, and matching the indent C11 §2 already applies.
- **`group`, `direction: "column"`** measures every child at `w` and sums.
- **`group`, `direction: "row"`** splits equally: `floor((w - gaps) / n)` where `gaps` is `n - 1` cells of gutter, one between each pair. Children are measured at that width and the group takes the `max`.

**Equal split, with no weights field.** Uneven allocation is expressible as nested groups — S13's two-up-then-full-width is two groups and works under an equal split. A `weights` field would be a second layout system inside a block whose height rule already has to stay simple enough to hold I7. Add weights when a surface needs them, and not before.

Because the floor rule below gives every child at least 1, a `row` group at a width too narrow to split still measures — `floor` can reach 0, and a child measured at width 0 is measured at width 1 (T3.2).

**And a child that cannot be placed is not measured.** The floor makes the arithmetic total, and it also makes it possible for the children plus their gutters to be wider than the group: two children at width 1 need three columns. What renders then was unstated, and the three available answers are not equivalent — overflow the group (the terminal wraps it into a row nobody counted), stack the children (the height becomes a sum where the rule says max), or place as many as fit and drop the rest. **The third is the rule.** Children are placed left to right while the budget lasts; a child that does not fit is placed by neither half, so it contributes to neither the rendered rows nor the measured height. The group still measures at least 1.

This is a rule about a degenerate width rather than a layout feature: above `2n - 1` columns every child fits and nothing is dropped. It is written down because the alternative to writing it down is each half choosing separately, and the two choices differ by exactly one row.

A `pills` block is **one logical row**. Prism's two-row filter layout (kind row, then status row) is two `pills` blocks, not one block that wraps — wrapping is overflow behaviour, not a layout choice.

### Weights, walked by hand — roadmap 38

**The deferral above named its own condition and nothing watched it.** *Add weights
when a surface needs them, and not before* — and a surface needed them: the docker
banner is 15 cells of triangle, one of separator and 61 of wordmark (A01 A.1), where
an equal split of two children gives 38 and 38. It could not say so, so it
hand-composed a `raw` block, padding the art to a uniform 40 by hand, top-padding one
side by a row, and measuring the composed width three times before it was right.
**Every item on roadmap 38's evidence list is the cost of a field this section
deferred**, and the entry is written as though no container existed.

**Which is why `direction: "row"` has no caller.** Six `b.group` sites in the tree —
five in the docker example and one in the stream adapter — and every one is
`"column"`. C09 §485 recorded *no in-tree adapter builds a row group today* as a
reason its width-1 substitution was latent; it is still true, and the reason is this
one rather than obscurity.

#### The artefact is a table, and that is a decision

Layout here is **structural**: `measure` is pure and total over `(block, width)`, no
container holds state, and nothing accumulates between calls. A sequence trace would
be rows about resize — and a resize is the same table evaluated at a second width,
which is a restatement rather than an interaction. The one row that tested it is
row 8, where a width change moves a child across the placement boundary; it is
width-indexed, so it belongs here.

#### The classification table — which rule owns a cell

| # | The cell | Rule A | Rule B | Ruling |
|---|---|---|---|---|
| 1 | **C11's `flex` as the precedent** | roadmap 38: *the same `flex` concept C11 already has, one level up*, and *worth following exactly* | `Column.flex` is a **boolean** — absorb the residual or do not — resting on a per-column *minimum* derived from content (C11 §3) | **R1 — the precedent cannot be followed, because the information it rests on does not exist here.** A table knows what each column would like to be; a group knows `measure(block, width) → height` and **no preferred width**. There is nothing for a child to absorb residual *from*, so the only expressible allocation is a declared proportion. Following C11 exactly would give `flex: [true, false]`, which says nothing about a 2 : 1 row. The name is kept and the mechanism is not the same one |
| 2 | **weights × *a child that cannot be placed is not measured*** | children are placed left to right while the budget lasts | with weights the budget is no longer uniform, so the *cost* of each child differs | **R2 — placement stays left to right, by position and never by size.** Dropping the smallest or the largest would make the rendered set depend on the weights, so two documents differing only in a number would place different children — and the order is the one thing the author stated outright. **The equal split made this invisible**: with every child costing the same, by-position and by-size are the same rule |
| 3 | a weight of `0` | a weight is a share of the budget | the floor gives every *placed* child at least 1 cell | **R3 — refused at construction.** Zero has two readings and neither adds anything: *not placed*, which the author expresses by leaving the child out, and *placed at one cell*, which is what `1` already means. A value that means two things is the defect this project has removed four times. Negatives and non-finite values go with it |
| 4 | **the gutter, when the budget is weighted** | `n − 1` cells, one between each pair | the budget is divided in proportion | **R4 — off the top, before any share is computed.** A proportional gutter makes the separator between a 2 and a 1 narrower than the one between two 2s, and a gutter's job is identical between every pair. **Equal split makes the two identical, which is why the current rule does not say** — and taking it off the top is what makes equal weights reproduce today's arithmetic exactly, which is the row's real assertion |
| 5 | the remainder after flooring | each child takes `floor(share)` | the floors sum to less than the budget | **R5 — the remainder is unspent, as it is today. Corrected by the code from *the remainder goes to the leftmost child, which is C11's rule*.** That ruling contradicts row 4's, and only writing both down showed it: today every child takes `floor((w − gaps) / n)` and the leftover cell is spent by nobody, so giving it to the first child would make `flex: [1, 1]` differ from no `flex` — **the exact trap the equal-weights assertion exists to catch**, introduced by the rule meant to be careful. C11's precedent does not carry for the reason row 1 gives: a table's residual exists *to be absorbed*, and a group has no child that claims it |
| 6 | **weights × nesting** | *uneven allocation is expressible as nested groups* — this section's own remedy | a weighted row expresses the same layout in one block | **R6 — both stay, and neither supersedes, because they are not the same layout.** The equivalence holds while everything fits and ends at the placement boundary: a nested group is **one** child of the outer row and is dropped whole, where three flat children are dropped one at a time. Nesting also expresses *grouping* — a subtree that moves together, gaps, a panel around it — which a weight cannot say. **So the deferral's remedy was an approximation, and this row is where the approximation ends** |
| 7 | weights × the 1-cell floor | every placed child measures at ≥ 1 | a small share reaches 1 far sooner than an equal one | **R7 — the floor is unchanged and the hazard is now live.** C09 §485 measured the width-1 substitution boundary as `w ≤ 2n − 1` — sixty children at 120 columns — and called it degenerate. `flex: [50, 1]` reaches width 1 for the second child at **80 columns with two children**, so a rule about a degenerate width becomes reachable at an ordinary size. Recorded with both figures, because the old one reads as *this cannot happen* |
| 8 | weights × a width change | the placement boundary is `2n − 1` under an equal split | under weights each child has its own boundary | Confirms, and it is the row that would have been the trace's: a child crosses in or out as the width moves, the block re-measures at the new width, and nothing carries over — `measure` is `(block, width)` and C14's cache keys on both. **The height is non-monotonic in the width and always has been**; weights change which width, not the shape |
| 9 | `flex` on a `direction: "column"` group | a column's children all take `w` | the field is on the group, which has both directions | **R9 — ignored, not an error, on this section's own precedent**: `gapBefore` inside a row group *is meaningless and is ignored rather than being an error*, so the same block travelling into either direction does not fail. **Knowingly vacuous**, which is why it is written down: an ignored field is how a value comes to be silently unread |
| 10 | `flex.length ≠ children.length` | one weight per child | the two are declared separately | **R10 — a construction error.** Unlike row 9 there is no reading to fall back on: a two-weight list over three children is an authoring mistake, and inferring the third from anywhere would be the framework choosing a layout |
| 11 | `align` × the unspent remainder | alignment is per child, and comes with the row | a child's rendered lines may be narrower than its allotment | **Confirms.** Alignment places rendered lines inside a width the group already computed, so it changes no measurement — the same containment that keeps `measure`'s shape. It is the entry's one addition that touches only the renderer |
| 13 | **a child with an intrinsic width × a container with no preferred width** | R1: a group knows `measure(block, width) → height` and no preferred width | the banner's whale is **40 cells**, not 40 : 61 — a proportion cannot pin a cell count | **R13 — a share is a weight *or* a cell count**, `number \| {cells: n}`, on the field that already exists. R1 said a group cannot *ask* a child its width; this is the child *telling* it, which is the same fact from the side that has it. Measured: `[40, 61]` gives 41/62 at 105 columns and 47/71 at 120, so the gap between two fixed-size arts widens with the terminal |
| 14 | fixed × weighted in one row | a cell count is satisfied exactly or it is not a cell count | a weight is a share of what there is | **R14 — fixed first, then weights over what remains.** Any other order makes 40 mean *about 40*. The remainder after the weighted shares is unspent, as R5 has it |
| 15 | **declared cells exceeding the budget** | fixed-before-weighted | *a child that cannot be placed is not measured* | **R15 — both, because they answer different questions and the fork is not one.** Allocation satisfies fixed children first; **placement is unchanged** — left to right while the budget lasts, and a fixed child that still does not fit is dropped exactly as any other is. A fixed child is not privileged at placement: privileging it would make the rendered set depend on a declaration rather than on order, which is R2's ruling arriving a second time |
| 16 | **the wordmark's leading blank row** | `align` is per child, within its allocation (row 11) | a row already computes a height — the tallest child — and does nothing with it | **R16 — `align` is two axes, and the second one has the consumer.** The banner's wordmark carries a blank first row so its seven lines sit on the whale's hull rather than its spout: **that is vertical alignment, hand-written into the art**, exactly as the padded whale was a fixed width hand-written into the art. Horizontal placement is inside the child's own width; vertical is inside the row's height, which the container has and discards |
| 17 | **the horizontal axis × every renderer** | alignment places a child inside its allocation | a renderer **fits its output to the width it is handed** | **R17 — there is no horizontal axis, and the build refused what the walk ruled.** A child allocated ten cells emits ten-cell rows, so aligning a ten-cell box inside a ten-cell box is a no-op — measured, not reasoned. Placing it would mean knowing how wide the content actually *is*, and `measure(block, width) → height` does not answer that. **R1 a third time**: heights are measurable and widths are not, and that asymmetry is why this field has one axis rather than two |
| 17a | the vertical axis × `measure` | a child is measured at its allocated width | alignment moves rendered lines inside a box already sized | **Confirms, and it is why the axis that exists is cheap.** The row is still its tallest child, so `measure(block, width)` is untouched and every cache, compositor and degradation path is unaffected — the containment that made weights safe |
| 18 | vertical align × a child that is dropped | alignment is per child | *a child that cannot be placed is not measured* | Confirms: a dropped child is aligned by nobody, because it contributes to neither half. One line, because the rule composes rather than interacting |
| 19 | **`padding` × `gapBefore`** | roadmap 38: *padding as a general property rather than `gapBefore` being the only spacing that exists* | `gapBefore` is **the one field that is vertical rhythm** (§3a), and a blank row above is padding-top | **R19 — not built, and the reason is a duplication rather than a cost.** A general `padding` would give a document two ways to say *a blank row above this block*, and the two would have to agree at every measurer, every container's child-width computation and every sequence. **If it lands, `gapBefore` becomes its top edge** and there is one field — so the change is a replacement rather than an addition, which is why it is not folded into a row about widths. **Nothing in the tree pads today**, and the note lives on `gapBefore` where the second spacing field would be written rather than here, because a condition written beside the deferral is the one nobody reads |
| 12 | **`padding` × everything** | roadmap 38 bundles *padding as a general property rather than `gapBefore` being the only spacing* | padding on any block changes what `measure` returns for it | **R12 — not in this entry.** It is general, it changes every block's measurement, and bundling it means the weights cannot land without it. **A bundled row can only be split**: the shared blocker on the row is rarely any of the subjects' own |

**Row 1 is the one that would have shipped.** The entry says the precedent is *worth
following exactly*, and following it exactly produces a field that cannot express the
banner — a boolean absorb-flag over a minimum nothing computes. It reads as a citation
of a solved problem, and the two mechanisms share only a name.

#### One fact answered three design questions, and it is worth stating as a rule

**Heights are measurable and widths are not.** `measure(block, width) → height`
takes a width and returns a height, so a container can always ask *how tall would
you be here* and can never ask *how wide would you like to be*. Three independent
questions in this entry were decided by that asymmetry and by nothing else:

| the question | what the asymmetry decided |
|---|---|
| how a row divides its width (R1) | **weights**, not C11's boolean-over-a-minimum — there is no preferred width to absorb residual from |
| how a child with an intrinsic size says so (R13) | **the child declares cells**, because the container cannot ask |
| which way a row may align (R16, R17) | **vertically only** — the row knows its own height, and a child already fills the width it was handed |

Three answers, one fact, and none of them was reached by looking at the other
two. **Stated here because the next question about a container will have the same
shape**, and because R1 read as a fact about C11 the first time — it is not: it is
a fact about the measurement contract, and C11 is where its consequence showed.

#### The rulings

- **R1 — weights, not C11's boolean.** A group has no preferred width to absorb from.
- **R2 — placement stays left to right**, by position and never by size.
- **R3 — `0` is a construction error**, with negatives and non-finite values.
- **R4 — the gutter comes off the top**, so equal weights reproduce today's arithmetic.
- **R5 — the remainder is unspent**, as it is today. **Corrected by the code**: the leftmost rule contradicts R4 and would make `flex: [1, 1]` differ from no `flex`.
- **R6 — weights and nesting both stay**; they differ at the placement boundary.
- **R7 — the 1-cell floor is unchanged and its boundary is now reachable.**
- **R9 — a weight on a column group is ignored**, on `gapBefore`'s precedent.
- **R10 — a length mismatch is a construction error.**
- **R12 — `padding` is a separate entry**, and so is `height: "fill"` (below).
- **R16 — `align` is the vertical axis**, within the row's height, and it is the one with a
  consumer. **Ruled as two and built as one**: the horizontal axis does not exist, because a
  renderer fits its output to the width it is handed.
- **R17 — R1 a third time.** Heights are measurable and widths are not, which is why one axis
  is expressible and the other is not — the same missing preferred width that made weights the
  only allocation and `{cells: n}` the child's own business.
- **R18 — the axis that exists changes no measurement.**
- **R19 — `padding` is not built**, and if it lands `gapBefore` becomes its top edge rather
  than sitting beside it. The note is on `gapBefore`, not here.
- **R13 — a share is a weight or a cell count**, `number | {cells: n}` on `flex`.
- **R14 — fixed first, then weights over what remains**, or a cell count is a suggestion.
- **R15 — placement is unchanged**, and a fixed child that does not fit is dropped like any
  other: privileging it would make the rendered set depend on a declaration rather than on
  order, which is R2 a second time.

#### What the rulings leave behind

- **The field goes on `group` and there is no `b.row`.** The name is taken — `b.row(id,
  cells)` builds a table row and every example calls it — and the honest shape was
  never a new container anyway: this section deferred *weights*, not a block kind.
- **`height: "fill"` is unblocked and is not in this entry.** Roadmap 38 defers it
  because *the producer cannot see the height — that is F37*, and `ProducerContext.height`
  is `number | null`, non-null **iff** the document is bound by a region (I18) — which is
  exactly the pushed-view case the entry names as the only one where *fill* has a
  referent. So the claim is stale, the resolve-then-measure ruling the entry already
  carries is the whole of what it needs, and it is a step of its own.
- **Equal weights must reproduce today's arithmetic byte for byte**, which is R4's real
  purpose and the only assertion that can catch a gutter rule that looks right.
- **The banner is not closed by this, and the frame-read is what says so.** Two multi-line
  `raw` blocks in a weighted row **do** compose side by side — measured, and the row places
  them correctly at every width. What it cannot reproduce is the banner's frame: the whale is
  padded to a fixed **40** cells with a fixed **4**-cell gap, and a proportion cannot pin a
  cell count. `flex: [40, 61]` at 105 columns gives 41 and 62, and at 120 it gives 47 and 71 —
  the art sits left in a box that grows, so the gap between the two arts widens with the
  terminal. **The measured consumer needs a fixed width, and weights are a ratio**, which is
  R1's finding arriving as a consequence: a group has no preferred width, so a child with an
  intrinsic size has no way to say so. That is the next argument, and the banner is already
  its measured consumer.
- **The probe that produced this was wrong twice before it was right**, and both were the
  instrument rather than the subject: a registry with no renderers, whose output said *notice
  failed to render*, and then a heredoc that wrote `\n` as two characters, so a `raw` block
  measured 1 and appeared to emit a newline into a composed row. **Both were caught by reading
  the output rather than the verdict** — the first would have reported a fabricated defect in
  `raw`, and the second a fabricated one in the row.

### `patch` and `comparison` are not variants of each other

**They used to share a name, and that was the whole problem.** `comparison` is rows of `{field, a, b, comparison}` — a structured comparison of two values for one key, right for S07's metric table. `patch` is hunks of text with line numbers, two palettes and collapse. Merging them would produce a block whose measurement depends on which mode it is in, and C09 I1 is the invariant that cannot bend: a kind whose height rule branches on a mode flag is a kind whose measurer and renderer drift apart quietly.

`patch` is declared here because C04 owns every block shape — settled when `plot` moved out to C12 — but it is **registered by C25**, exactly as `table` is by C11 and `plot` by C12. `collapsedBefore` is view state that affects height, so it lives in the block (commitment 4); expanding a collapsed region patches the document rather than mutating anything external, which is the same mechanism C11 uses for expanded rows and the reason it reaches a frozen entry when an action cannot.

**`collapsedAfter` is `Patch`'s and `collapsedBefore` is `Hunk`'s, and the split is the whole of the decision.** A patch elides unchanged context in three places: before the first hunk, between hunks, and after the last one. `collapsedBefore` covers the first two — every interior region belongs to exactly one hunk, the one it precedes — and the tail is the one region it structurally cannot reach.

Putting the tail on `Hunk` as well would double-count: the region between hunk 1 and hunk 2 is hunk 1's *after* and hunk 2's *before*, so two fields would describe one gap and a producer would have to know which of them to fill. On `Patch` it means "elided below the last hunk" and nothing else, so there is nothing to decide and nothing to reconcile.

**Not a rare case.** A patch with one hunk at line 18 of a two-hundred-line file elides fourteen lines above and a hundred and seventy below, and the larger number is the one that could not be stated. Scratchpad 6 §2's illustration drew `⋯ 31 unchanged lines` as its last row from the start.

This is HEIGHT_AUDIT's **fourth verdict class** — a schema gap, where neither the figure nor the declaration was wrong about what it described. It was first filed as a figure slip on a count of one, and that was a misreading: the count distinguishes the *first* verdict class from the *fifth*, both of which resolve by picking a side. The fourth resolves by changing the shape, because picking either side keeps a defect.

`raw` is the escape hatch and it is load-bearing. Anything unmodellable — a system command's stdout, an unrecognised envelope — becomes `raw` and still renders. **The vocabulary never has to be complete for the tool to work.**

### Cell

The unit inside a `table`, and the only place a tone and a glyph travel together.

```typescript
type Cell = Readonly<{
  text:   string;
  tone?:  Tone;
  glyph?: Glyph;                      // leading status glyph — a slot, never a character
  spark?: readonly (number | null)[]; // inline sparkline; `null` is a gap (I46a)
  bar?:   BarSpec;                    // a quantity against a scale (I50c, C12 I20)
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
  role?:     "expand";                // C11 fills the cell; not view state (I32)
  truncateFrom?: "start" | "end";     // default "end" — keeps the start (I30)
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

**`role: "expand"` names the column C11 fills.** Every surface with an expandable table already declares an `expand` column of `minWidth` 1 whose content is drawn by C11 rather than supplied as data, and its cell is inside those surfaces' width arithmetic — so it must stay an ordinary column for planning while being extraordinary for content. The role is how a renderer recognises it. Two alternatives were rejected: a reserved `key === "expand"`, which puts a magic string in a generic engine and silently eats a far side's field of that name; and a gutter reserved by C11, which would move every drop total the S-series states. The role is declared by the surface, is not view state, and is not carried by `merge` any differently from the rest of `columns` — `expanded` remains the only view state on a table row (I9, I18). C11 I15 holds the other half: planning never reads it.

**`truncateFrom` names the end characters are removed from, not the end that survives.** `"end"` removes from the end and keeps the start, which is what prose wants and is the default; `"start"` keeps the tail, which is what paths, hierarchical keys and hash-suffixed names want. The naming matters more than it looks: `truncate: "head" | "tail"` and `keep:` both invite the reader to guess which side is being described, and this is a field somebody sets once per column and never revisits — so it is named for the operation, in the direction the operation runs.

Nine places in the S-series state a truncation side in prose. **Four of them are table columns and the rest are not** — `keyValue` values in S04, S08 and S15, `steps` detail in S10, `logs` lines in S11 — so this field expresses less than half the intent that exists.

### `Truncatable` — settled, not yet landed

The remaining five need the same thing said about a *string* rather than about a column, and the shape is settled rather than open:

```typescript
type Truncatable =
  | string
  | Readonly<{ text: string; truncateFrom: "start" | "end" }>;
```

A bare string means `"end"`. That is deliberately the pattern C24's builder already establishes — where a bare string is a cell with the default tone — so it reads as a familiar shorthand rather than as a second mechanism, and **every existing call site is unchanged**: a field typed `Truncatable` accepts everything a `string` field accepted.

One type rather than five fields, because the crux is the same everywhere it appears: **the producer knows which side and the renderer knows the width**, so the side has to be declared and cannot be pre-applied. An adapter that truncated a path itself would be guessing at a width it does not have.

It lands on `keyValue` values, `steps` detail and `logs` messages. `ColumnDef` keeps its own field rather than typing its cells as `Truncatable`, because a column truncates every cell in it the same way — the declaration belongs to the column, not repeated per row.

**Its own commit, not a rider.** It is a C04 schema change with a C09 consequence in every kind that renders a truncatable string, and folding that into the commit of whichever component happened to need it next is how a schema change stops being reviewable. Until it lands, the five sites are recorded in `HEIGHT_AUDIT.md` with what each one wants.

S06 states a third value — SHAs truncated **in the middle**, keeping both ends, because that is what people compare by eye. It is deliberately absent from the union: a middle truncation spends its marker between two kept halves, so the arithmetic is a different one (two budgets and a centred marker rather than one budget and a trailing one), and C09 I9's marker rule is written for the single-ended case. It arrives with a clause in that rule or not at all.

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
  | "expand" | "collapse" | "live" | "bullet"
  | "continuation";
```

**The identical argument.** A glyph embedded in a block is the same character on every terminal, has no fallback at `unicode: "ascii"`, and cannot be width-checked at load. `glyph: "✗"` is `colour: "#c0ffee"` written in a different field.

It is also the argument commitment 10 already makes and could not keep. **Every capability-driven substitution is 1:1 by column count** — but C09 can only guarantee that for glyphs it owns, and while the field is a free string an app supplies whatever it likes and C09 emits it verbatim. The guarantee was therefore mostly-true, which is worse than a narrow one: it holds for the box drawing and the spinner and silently does not hold for the thing an adapter wrote, and the failure appears only under `LANG=C`, only for the users who cannot report it precisely.

The evidence that this drifts is not hypothetical. Before tokenisation the tree contained `✗`, `✖`, `*`, `+` and `▲` in glyph positions, in five files, for three roles.

C09 §4 owns the vocabulary and both renderings, and the 1:1 rule holds by construction rather than by review.

**The escape hatch, stated so that the guarantee stays absolute:** a glyph outside the vocabulary goes in the block's **text**, not its glyph field, and its behaviour under ASCII is the app's problem. That is where every action label already lives — `↗ open`, `⊘ cancel`, `⬡ pods` are text in a label, not glyph slots — and it is why the surfaces need no change. A vocabulary with an "or any string" arm is not a vocabulary.

**`working` is in the list because S11 and S15 illustrate it** and nothing else covers it: `◐ connecting`, `◐ mlflow starting`, `◐ layers installing` is a fourth state beside `pending` (not started), `running` (steady) and `queued`. A token missing from the type is a surface that cannot be built, so the list was checked against the illustrations rather than reasoned out. **`continuation` is the third direction and the only token with its consumers named before it existed** (`docs/design/AGENT_TUI_DESIGN.md` §A1, which is where the mark was written down and is **not** a shipping consumer — agent-tui is stopped at step 0). It marks a line *subordinate to the one above it* rather than a state, which is why it is the first token whose eligibility is a property of the entry and not of the block: it needs a line above, and C22's `commandRows` returns `[]` for `command: ""`. So the vocabulary now contains a token a block can name in a position where it means nothing, and C09 §4 records which two blocks are in that position and which two look as though they are. `info`, `cancelled` and `bullet` are the other direction — no surface illustrates them today. They ship anyway because adding a token later is additive and cheap while a renderer meeting an unrepresentable state is not, and because `info` is already a `Tone`.

### A categorical axis is a marker plus a derived tone, never a second palette

Four surfaces built in four steps for four reasons reached for a distinction `Tone` cannot carry: a comparison wanting `added`, `/diff` wanting `+ - ~` in three colours, a lifecycle stream wanting `die` to read differently from `start`, a build wanting `cached` to read differently from `ran` (FINDINGS F30, F49, F51, F81). Each was filed as *the model has one axis and needs two*. Measured against the tree, that reading is wrong on three counts.

**They are three vocabularies, not one.** `added`/`removed`/`modified` is change; `cached`/`ran` is provenance; `start`/`die`/`oom` is severity, which `Tone` already spells. **No closed union covers all three**, so the shared thing is the *slot* and not the values — and a `ChangeKind` added beside `Tone` would have answered one of the four while reading as though it answered them.

**The rendering already exists, unnamed, in three places.** C09's `patch` module carries change in a **marker** (`+`, `-`, space), tones it from a frozen renderer-owned table, and adds a background surface as a second channel. `levelTone` maps a log level to a tone the same way. `comparisonTone` maps a verdict. Three instances of one pattern, in one layer, with no name for it — which is why four surfaces each rebuilt a piece of it by hand.

So the rule, which settles the 1-bit rendering inside itself rather than leaving it owed:

> **A categorical axis is carried by a marker or a word, and *emphasised* by a tone the renderer derives from the axis. A producer never supplies a colour for it.**

At `colourDepth: 1` the tone goes and the marker remains, so the axis survives **by construction** rather than by a lint. That is why this needs no new palette, no widening of `Tone`, and no new arm in D29's sweep: the case D29 exists to catch cannot be built. It is C10's argument for `Tone` applied one level up — the producer names the fact, the renderer owns the appearance.

**What it rules on each of the four:**

- **F49 and F81 are correct as built**, not workarounds tolerated for now. `+`/`-`/`~` in the marker and a `HOW` column reading `cached`/`ran` are what the rule prescribes, and `b.row`'s throw was right both times.
- **F30 is a type change**, below.
- **F51 is not in this group**, and its own text says so — *"a health axis with no way onto a block"*. It needs no vocabulary; it needs the `tone` field `Cell`, `Notice`, `KeyValue` and `Series` already have. Its recorded objection — that adding one makes `logs` and `events` inconsistent — dissolves under the rule above: **a fixed vocabulary the renderer knows needs no field, and one it cannot know does.** `logs` has levels; a container's actions are open-ended, so `events` takes the field. The two kinds differ because their vocabularies differ, which is the consistent answer rather than the inconsistent one.

#### `Comparison`'s verdict splits, because the renderer split it first

`comparison?: "same" | "better" | "worse" | "changed"` presents one closed union, and `comparisonTone` renders it as two: `better`→`ok`, `worse`→`error`, `same`→`muted`, `changed`→`default`. **The judgement half is coloured and the change half deliberately is not** — the renderer took this ruling before it was written down, and the type is the only place still claiming the four are one thing.

```typescript
change?:  "unchanged" | "changed" | "added" | "removed";
verdict?: "better" | "worse";
```

`added` and `removed` land in the half that was always neutral, which closes F30 without touching `Tone` and without a palette slot.

**`Hunk.lines[].kind` is deliberately left alone.** `add`/`remove`/`context` looks like the same vocabulary and is not: `context` is a *positional* fact — a line shown to situate a change — while `unchanged` is a fact about the line. Unifying them would make C25's window logic depend on a field that no longer means what it tests. Two vocabularies that overlap in two members are not one vocabulary, which is this section's own argument turned back on it.

### A mark is derived from a named fact, or there is nothing to derive it from

The sibling of the section above, and the same rule read the other way. I35 says a renderer
derives appearance from a fact the block names. **The corollary is what happens when a block
names no fact — only a tone.** Measured over every shape that carries one:

| shape | names | can a mark be derived? |
|---|---|---|
| `Cell`, `Notice` | a tone **and** a glyph | — it is supplied |
| `ComparisonRow` | `verdict` — a fact | **yes** |
| `Panel` (live) | nothing; the driver knows and the block does not | **not yet** — one field away |
| `KeyValue` row, `Pills` chip, `Events` line, `Series` | a tone, and nothing else | **no** |

**Two of seven tone-bearing shapes carry a glyph slot and five do not**, which is why
`hasNoColourOnlyDistinction` declines to enforce D29 for three of them and calls it *a gap in
the vocabulary rather than a rule*. That disposal is right, and the reason it is right is
sharper than "no field": for `ComparisonRow` the fact is already named and the renderer simply
never used it, and for the other three there is genuinely nothing to derive from.

So the ruling splits the five rather than treating them alike:

> **Where a shape names a categorical fact, the renderer derives the mark and no field is
> added. Where a shape names only a tone, a glyph slot is the only remedy — and it is added
> when a surface needs one, not before.**

**`ComparisonRow` is the first half and needs no type change.** `verdict` is already a named
fact; `verdictTone` derived a colour from it and stopped there, so `better` and `worse` render
identically to each other and to an unmarked row at every colour depth. That is FINDINGS F34's
measured half — *`200ms` against `150ms` says nothing about which is wanted* — and it closes by
deriving a glyph beside the tone, exactly as the change axis derives a marker.

**`Panel` is the second half and needs one boolean.** `Glyph` has carried a `live` slot with
both renderings since C04 was written, two surfaces draw it, and **nothing in `src/` consumes
it** — a slot reserved and unreachable, which is A03 §2's class in the glyph table (F18). The
remedy is not a glyph field: it is for the block to *name the fact*, because a panel is live or
it is not, and the mark follows. `live?: boolean`, and C09 draws the slot.

**The other four do not get a field yet, and the reason is an instrument rather than a
preference.** MG24 refuses a published member nothing consumes, so four speculative glyph slots
would arrive as four violations needing four allow-list entries — the rule correctly declining
to let the schema grow ahead of a surface. When one needs it, the ruling above is already taken
and the field is additive.

**What this does not close, stated because the boundary is not where it looks.** D29 asks
whether a distinction is carried by colour alone, and *does this text carry the state* is not
decidable from a document: two chips reading `web` and `db`, toned `ok` and `error`, pass every
check and mean nothing without the colour. **Expressibility is C04's to fix; decidability is
nobody's.** A glyph slot makes D29 satisfiable, never satisfied.

### A label and a quantity — where `keyValue` ends and `table` begins

**The question a workaround asked.** `examples/docker`'s `ioBlock` builds a `keyValue` whose
`MEM` value is a hand-drawn bar interpolated into a string, one level along from the workaround
`Cell.bar` closed. Either a `keyValue` row can hold a quantity, or that site is a `table` and
the bar is a cell.

**Measured before ruling, because the two shapes are told apart by the data and not by the
picture.**

| | what the rows are | verdict |
|---|---|---|
| docker's `ioBlock` | `MEM` a percentage · `NET` and `BLK` byte pairs · `PIDS` a count | four attributes of **one** container |
| S13's `cluster` panel | `nodes 12 (8 GPU)` · `gpu util 71% ██████░░░` · `pods 342` | some rows carry a bar and some do not |
| the dashboard's container list | one row per container, every row the same fields | **a table**, and it is already one |

**A column is a claim that its cells are one kind**, which is what `align`, `sortable` and a
shared `minWidth` all rest on. A column holding a bar, a byte pair and a count has no single
alignment and nothing to sort by, so expressing either panel as a two-column `table` would be a
`keyValue` carrying `ColumnDef`'s ceremony to say something the ceremony contradicts.

> **A `keyValue` row may carry a quantity.** It is one label and one value, and the value being
> a number against a scale rather than a string is not a change of kind.

**Two consumers, which is what makes it a rule rather than a request** — and they were found by
looking rather than assumed, after three claims of an existing consumer failed the same check
this session.

### The `keyValue` bar is not `Cell`'s bar, and the frame is what says so

**`Cell.bar` replaces the cell's text and takes the planned width** (I50c). Copying that seam
here loses information at both measured sites: docker's row reads `████░░░░ 45.2%  1.2GiB /
4GiB` and S13's `71%  ██████░░░`, and in each the bar sits **beside** a text rather than
instead of one. So the row keeps `value` and gains the bar next to it.

**And the width is declared rather than residual, which is the finding under the finding.** A
`keyValue` value column is everything the label leaves — 74 cells at a width of 80 — and
`valueBar` at that width draws a 68-cell run, which is arithmetically correct and a picture
nobody wants. Both consumers picked a width by hand (docker 14 cells, S13 nine and twenty) and
S13 §7 specifies **shortening its bars at 80–99 columns**, so the width is a thing a surface
says and then a thing that responds to the region.

**It is declared on the row and not on `BarSpec`, because `BarSpec` is shared with `Cell` where
the column already supplies it.** A width on the spec would give a table cell two sources for
one number, which is the audit's D6 — one ruling, two behaviours — arriving before the code
that would have to reconcile them.

**And it is a sibling rather than an intersection, which the implementation is what settled.**
`bar?: BarSpec & { width: number }` is the shape the ruling wanted and it does not compile
against the tree: the tone shorthands return a `Cell`, whose `bar` is a plain `BarSpec`, so a
narrower member makes `b.kv({ state: b.warn("degraded") })` unassignable — two errors, both on
that path, and it is behaviour C24 §4 documents. So `barWidth` sits beside `bar`, the broken
pair is expressible, and `validateBlock` refuses it. **That is I50c's own division in the same
block family** — a cell carrying both a `spark` and a `bar` is likewise type-legal and
validator-refused — so the weaker type is the house pattern rather than a concession.

**The walk ruled the shape and the code disproved it**, which is the order that finding is
supposed to arrive in.

> **A `keyValue` row's bar declares the cells it occupies; the value text takes the rest.** In a
> `table` the column declares it and the spec does not, and the difference is that a column is
> a width and a `keyValue` value is a remainder.

**Where the number goes is already settled and needs no member.** `valueBar` draws the run and
then its number, so a row supplies the bar and leaves `value` for the *detail* beside it —
docker's `1.2GiB / 4GiB`, which is the scale in absolute units. S13's figure prints the number
to the left of its run, and that is the same information in the order `valueBar` already ruled
on (C12 §3b); it is not a second placement rule and the type does not gain one.

### What widens `Plot`, and what would be a sibling

**`yFormat` is the precedent and it states the test**: a format that changes a label's width
changes the gutter, so it changes the plot area — geometry, in a member that reads like
styling. Applied to the config record's remaining candidates:

| candidate | changes the area? | ruling |
|---|---|---|
| **title** | occupies a row above; `height` is declared, so the area loses one | **`Plot`** |
| **caption** | a row below, same arithmetic | **`Plot`** |
| **legend position** | a row (top/bottom) or a gutter (left/right); `none` is its absence | **`Plot`** |
| **tick maxima** | the tick count decides how many y-labels, and their width **is** the gutter | **`Plot`** — and it is the two-pass cycle's input |
| **x formatter** | `yFormat`'s argument on the other axis: a label's width decides tick density | **`Plot`** |
| **explicit range** | already built — `yMin` and `yMax` (I29) | **nothing to do**, and stated so a second spelling is not added |

**Every candidate passes, and a test that admits everything constrains nothing** — so the
falsifier is stated rather than left implied. **Both halves of this paragraph have since been
measured and neither holds; the correction is below**, under *Six members for a plot's geometry* —
two of the four falsifiers are `Plot` members today, one cites a roadmap number no document
carries, and the rule the last thirty-seven members were actually decided by is a different one
written in `plotFrame`'s comment. These fail it: a title's **alignment**, a series'
**tone**, a bar's **glyph style** (roadmap 51), a heatmap's **colormap**. Each changes what the
reader sees and no cell of the layout, and each already belongs to C10 or to the block that
draws it. So the sibling category is real and, over this list, **empty** — the config record is
geometry throughout, which is the answer rather than a failure to find one.

**None of the five members lands here.** MG24 refuses a published member nothing consumes, and
five fields with no renderer are five phantoms of exactly the kind this pass was called to stop
producing. The ruling is taken so that whoever writes the renderer does not re-derive it; the
members arrive with their first surface.

**`legend` has now arrived, and this is the note that says so.** C12 §3g builds the row and
the gutter, so the condition this paragraph names is met for one of the five. It is recorded
here rather than only there because a deferral states its blocker where the deferral is and the
thing that satisfies it gets written somewhere else — which is how `Annotation.label` (I52) sat
owed while the gutter it was waiting for stayed unbuilt and unwatched. **The other four —
title, caption, tick maxima, x formatter — are still owed on the same terms**, and naming them
again is cheaper than rediscovering the ruling.

**The legend's ruling above needs one correction, and measuring it is why.** The table reads
*a row (top/bottom) or a gutter (left/right)* as though the two were the same kind of cost.
They are not: a row must be declared before the data is visible because C12 I1 forbids a height
derived from series, and a gutter may size itself to its content because the y-label gutter
already does. That asymmetry decides which placement can turn itself on, and the table as
written would have had a renderer discover it.

### The eight forms that were missing, and the one that shares a name with a block

Eight chart types the survey names and the union never carried. Each is a fold of machinery
that already exists rather than a new rasterisation, which is the test for whether it belongs
in `PlotForm` at all:

| form | it is | built from |
|---|---|---|
| `stackedarea` | cumulative bands from zero | the stacking fold, new |
| `slope` | two value columns joined by lines — ranking change | the box-drawing polyline |
| `bubble` | scatter with a size channel | the braille canvas plus a fourth encoding axis |
| `autocorrelation` | lag bars with a confidence band | `barRow` plus §3e's band |
| `timeline` | event marks on a time axis | the glyph-row family |
| `bullet` | a bar with a target marker and qualitative bands | `barRow` plus §3e's marker |
| `utilisation` | one cell per unit, shaded by load | the matrix family |
| `treemap` | nested rectangles | `hierarchy`, below |

**`streamgraph` is not new and was not a streamgraph.** It dispatched to the same renderer as
`line`, differing only by an empty-data guard: nothing stacked, no baseline offset, no fill. It
is **one rule change from `stackedarea`** — same fold, the offset centred rather than anchored
at zero — which is why the two land together and why neither is a separate rasteriser.

**`progress` is not a `PlotForm` and must not become one.** `kind: "progress"` is a C09 block
and `fill` is its encoding (C12 I20): a bar against a declared total, where an empty run legibly
reads as *zero*. A plot form is a **comparison** across positions or categories. The two share
a word and no axis, and §3b's own test — *does it change the plot area* — is not the question
that separates them; *what does the number mean* is.

### Six members for a plot's geometry, and the test above admitted two of them for a reason it does not give

**The widening test was re-run before it was used, and it does not hold as written.** Its rule —
*does it change the plot area* — was stated over six candidates, all six passed, and the falsifier
list was added because *a test that admits everything constrains nothing*. Measured at HEAD, the
falsifiers do not hold either:

| falsifier, as written | where it is today |
|---|---|
| a title's **alignment** | vacuous — `title` was never added, so nothing qualifies |
| a series' **tone** | `Series.tone` — this type, one level down |
| a bar's **glyph style** (*roadmap 51*) | `plotStyle` and `plotFill`, both on `Plot` — and **`docs/ROADMAP.md` carries no numbered entry**, so the citation resolves against nothing |
| a heatmap's **colormap** | `colormap?: ColormapName`, on `Plot` |

`Plot` carried **eleven** members the day that test was written and carries **forty-eight** today.
**Thirty-seven landed after it and not one cites it** — so the rule was not falsified, it was never
consulted. *Two of its four falsifiers are `Plot` members, a third is one level down, and the
fourth is vacuous because the member it qualifies was never added.*

**The test that actually decided those thirty-seven is written down, in `plotFrame`'s own comment**:
*the references disagree with each other … so this is a style field rather than a choice the
framework makes for the caller.* That is a **who-decides** test and not a geometry one, and
`colormap`'s comment argues it from the other side — *a theme chooses which, never what it
contains.* Two tests on one type, the second arriving later, neither citing the other, and the
earlier one still reading as the rule.

**Both survive and the correction is which is which.** Changing the plot area is **sufficient** and
was never necessary: a member is `Plot`'s if it changes the area **or** if the decision is the
caller's alone — no theme resolves it and no renderer constant settles it. Read that way the
sibling category is real and non-empty, and `Series.tone` is its member rather than its
counter-example: a theme resolves a tone, so it is decoration, and it sits on `Series` because a
series is the thing that has one.

**This is load-bearing here rather than tidying**, because two of the six below are admitted by the
second arm and by nothing else:

| member | admitted by |
|---|---|
| `width` | the area — it is the area |
| `aspect` | the area — it derives one side from the other |
| `axisCross` | the area — the axes move inside it and the gutter stops being spent beside it |
| `calendarUnit` | the area — it decides the grid's row count |
| `origin` | **the caller alone** — every cell count is unchanged and only which datum lands in which |
| `align` | **the caller alone** — it moves a figure inside a frame and resizes nothing |

The seventh member this pass adds, `Annotation.fill`, is ruled in I52 and needs nothing here.

#### `calendarUnit` — the cell picks the grid, and the span was already sayable

```typescript
calendarUnit?: "hour" | "day" | "week" | "month";
```

**Rows are the sub-unit and columns the super-unit.** One statement and four layouts, rather than
four layouts that happen to agree:

| unit | rows | one column is | row labels |
|---|---|---|---|
| `hour` | 24 | a day | `00` … `23` |
| `day` | 7 | a week | `Mon` … `Sun` |
| `week` | 5 | a month | `W1` … `W5` |
| `month` | 12 | a year | `Jan` … `Dec` |

**The span needs no member, and that is what the unit buys.** `startDate` + `calendarUnit` +
`series[0].values.length` states it exactly: `"2026-01-01"`, `day`, 365 values is a year of daily
readings, and `"2026-03-04"`, `hour`, 24 values is one day of hourly ones. A `span` field beside
those three would be a fourth statement of a fact the other three already fix, and the first
disagreement between them would have no ruling.

**`startDate` acquires its first reader, which is the whole of its exemption.**
`tools/enforce/module-graph.mjs` carries `"plot.startDate": "step 0 scaffolding — builder shorthand
lands in step 11"` — it is settable through `FigureBuilder`, written into the block, and read by
nothing: four occurrences, all writes. MG24 exists to flag exactly that, and the exemption named
the step that closes it.

**One flat series, and the grid is derived from it.** More than one series with a unit is refused
at both gates: a calendar's rows are a period, so a second series is a second period claiming the
same rows.

**The seam already exists and it is `quiver`'s.** `heatmapFormRows` substitutes a derived series
list for a `quiver` before anything downstream sees it, and its comment says why — *"Substituted
here rather than in `matrixRows`, so the range, the gutter labels, the legend and the overflow row
all see one series list."* A calendar is that substitution one form along: one flat series in,
twenty-four labelled rows out, every downstream mechanism unchanged, and the gutter labels included
because a matrix's row label is `s.label ?? ""`.

**So the height needs no refusal, and measuring is what says so.** The obvious ruling is that
`calendarUnit: "hour"` needs twenty-four rows and a smaller `height` is a construction error. It is
not: `matrixRows` already draws `areaRows − 1` rows and spends the last on `+18 more · 06 · 07 · …`,
which is commitment 46 — *a bounded region says what it is hiding* — saying it in the calendar's own
row labels. A refusal would replace a frame that tells the truth with an error telling the caller to
pick a different number, and the mechanism that makes the frame truthful was already built.

**No `Date`, and SS1 is the reason before the taste is.** `tools/enforce/source-scans.mjs` bans
`new Date` across `src/` and allows `src/shell/session.ts` alone, so the arithmetic is
days-from-civil by hand — pure, total, and better for C12 I11 than the constructor. **UTC only**, on
`chrome.ts:formatClock`'s recorded reason: a local-time conversion is the part that needs the
platform's zone database.

**Refused off the `calendar` form**, on F207's terms — a field accepted where there is no arm for it
tells the caller nothing and the reader nothing.

**`startDate` is required with a unit, and the shapes it takes are the ones nothing is dropped
from.** `YYYY-MM-DD`, optionally `THH`, `:MM` and `:SS` and a trailing `Z` — everything below the
hour is *inside* the cell rather than discarded, which is what makes ignoring it honest. An offset
like `+05:00` does not match and is refused, because honouring it needs arithmetic across a zone
database and ignoring it puts the reading in the wrong cell. A date that does not exist —
`2026-02-30` — is refused on the leap rule, not on the string. **A unit without a `startDate` is
refused**: index 0 → row 0 is an assumption the caller never stated, and the refusal costs one
string to satisfy.

**Zero series is not more than one, and that is two tests rather than one** (C12 §3ae A8). The gate
refuses `> 1` and the renderer derives at `=== 1`; a gate written `!== 1` would make an empty
calendar a construction error and contradict commitment 3, which says an empty series occupies its
declared height rather than collapsing.

**The caller's series label is dropped and this is written down rather than discovered.** A matrix's
row label *is* its ordinate (I18), the calendar's ordinate is the sub-unit, and a matrix legend is a
colour bar with no identity slot — so `s(values, "commits")` keeps its values and loses its name.
Giving the legend a name slot would change every matrix frame for this one form.

**The walk found the anchor, and `matrixAnchor` gains a fourth arm because of it** (C12 §3ae.5). The
plan's own classification row read *the grid is derived, so an anchor has nothing to anchor*, and
the anchor turns out to decide everything: a calendar is the first matrix whose columns have an
**intrinsic width**, so `stretch`'s one-cell variation is a doubling at a pitch of one and two
adjacent weeks read as one two-week reading. `uniform` is `left` with the cells widened to fill —
identical wherever the pitch is one — and the fringe it leaves is removed with `width` rather than
by stretching a period.

#### `origin` and `axisCross` — two fields, because one enum makes a real pair inexpressible

```typescript
origin?:    "bottom-left" | "bottom-right" | "top-left" | "top-right";   // default "bottom-left"
axisCross?: "edge" | "zero";                                            // default "edge"
```

`plotFrame` and `axes`' own test, one type along: a single enum spelling `"centre"` beside the four
corners would make **`origin: "top-right"` with a crossing axis inexpressible**, and neither member
makes the other meaningless. The two answer different questions — *which corner the data grows
from*, and *where the axes are drawn*.

**`axisCross: "zero"` is refused by form at both gates, and its halves are dropped by range in the renderer** — on I52's argument, not I29's, and because L0 cannot measure a range (C12 §3ad)
read in the mirror. An annotation off the scale is dropped rather than clamped because a claim moved
onto a range it is outside says the limit is somewhere it is not; an axis drawn at the nearest edge
because zero is not in view says the same thing about the origin, and says it in furniture the
reader takes for the frame. The validator sees `yMin`/`yMax` where they are declared and the series
where they are not, so it is a question it can answer.

**And refused where the form has no gutter to move** — `HAS_Y_GUTTER`'s existing set, becoming its
third reader after the two gates that gate `yAxis` on it.

**`origin`'s refusal set was owed with its measurement, and C12 §3ac is the measurement.** It
was not reasoned here, on `HAS_Y_GUTTER`'s precedent, and the wait paid: the question asked above —
*does this form lay its data on a grid with two directions a caller could reverse* — is **the wrong
question**, and no amount of care answering it would have produced the right set. **What decides it
is which machinery places the data**, a partition of the forty-four forms this type cannot see:
seven positional forms whose direction is two functions, ten matrix forms whose direction is two
places, eleven categorical forms whose bar direction lives in eleven separate row builders, and
fourteen forms that are their own renderer. `origin` is honoured on the positional family and on
eight of the ten matrix forms — **fifteen of forty-four**.

**`contour` and `quiver` are the other two, and the code is what found them.** A field form is the
matrix renderer plus a second placement: `fieldLayers` rasterises isolines and arrows into *area*
columns while `columnMap` works in reading indices, and the two coincide only until one is
reversed. Neither walk artefact could reach it and the type certainly could not — which is the
recorded order, the walk ruling the shape and the implementation being the first thing that can
disprove it.

The three guesses all survive and **not one of them for the reason guessed**. `pie` is refused as
its own renderer and *separately* has no corner, which makes it the only refusal with two
independent measurements behind it. `sparkline` is refused as its own renderer, and the guessed
reason is the sharper one — one row, so the vertical half cannot move, and **a form that can honour
half of `origin` is the case the member must not have.** `flame` and `icicle` being one renderer
apart by a vertical flip is true, and it is an argument about those two forms rather than about this
member: `origin` on a `flame` would be a second spelling of `icicle`.

**`bar` is the finding**, because it was not guessed and it is the most ordinary chart in the
catalogue. It refuses, and the condition is written as a symbol so a grep finds it: `origin`
reaches the categorical family the day `categoricalForm` takes a shared span builder for the row
body instead of a `rowBuilder` per form.

**The record is `ORIGIN_DEFAULT`, one total `Record<PlotForm, Origin | null>`**, where `null` is
the refusal — so the acceptance set and the per-form default are one thing that cannot drift apart,
which is `FURNITURE_ROWS`' argument. It carries two different defaults on purpose: a curve's first
sample is at the left with value growing upward (`"bottom-left"`), and a matrix's `series[0]`,
`values[0]` is at the top left because a row index grows downward (`"top-left"`). One default for
both would have moved every shipped frame of one family or the other.

**`pairplot` and `smallmultiples` refuse it, and for a reason the machinery table does not give.**
`facets` is `readonly Plot[]`, so a facet is a whole block carrying its own `origin` — and the
container's would mean *which corner the first facet sits in*, which is a different member wearing
the same word. §3's own test settles it with no measurement needed. **Nothing validates facets at
all today**, which this notes and does not close.

**Not `HAS_POSITION_AXIS`, which is the obvious reuse and is wrong for `HAS_CALLOUT`'s reason.** It
reads `false` across the whole matrix family on the ground that a matrix labels its rows from
`categories` rather than from a scale — and a matrix has an origin regardless: which corner row 0,
column 0 sits in. That record answers a question about the **abscissa** and this one is about
**direction**. *A total record read as a complete answer to a question it cannot ask is C12 I43's
finding for the third time*, and the third instance is the one that says the shape is a class.

#### `width`, `aspect` and `align` — and a validator that refuses what it can see

```typescript
width?:  number;                              // cells
aspect?: number;                              // drawn width : height, visually
align?:  "left" | "centre" | "right";         // default "left"
```

**`width` and `aspect` together are refused** — two ways to say one number, and a plot that quietly
picked one would be telling the caller its other statement had been read.

**`aspect` earns its place over arithmetic in the caller because it is the member that knows about
`CELL_ASPECT`.** A caller deriving a width from a height has to know a cell is about 1 × 2, and
`aspect.ts`'s whole argument is that exactly one file knows that: *"Same terminal geometry, two
answers, one file aware of it. That is the shape of every defect this component has had twice."*
**It does not pay `squareRows`' deferral, which this paragraph first said it did.** The inverse was
deleted as unused — *"the day something needs it is the day to write it"* — and `aspect` wants the
direction that already exists: with a cell 1 × 2, `a = w / (h · CELL_ASPECT)` gives
`w = a · h · CELL_ASPECT`, which at `a = 1` is `squareColumns(h)` exactly. The height is declared and
the width is derived, and **C12 I1 permits no other direction** — `squareRows` derives a height from
a width, which is the thing a plot may never do. So the entry stands owed, recorded here because a
plan claiming to close a deferral is how one gets marked done and stays open (C12 §3ab).

**`align` is refused without one of them**, and the refusal is what gives the member its necessity:
aligning a figure that already fills its frame is a member that does nothing, and a member that does
nothing reads as one not yet implemented (F207).

**The validator refuses what it can see and no more, and that is the seam rather than a weakness.**
C04 has no terminal width, so a `width` wider than the frame cannot be refused at construction and
is clamped at render; the boundary check is the one C04 can make — finite, positive and integral for
`width`, finite and positive for `aspect`. *A validator refusing a width it cannot measure would be
asserting a fact it does not hold*, which is the class §5's measurement contract exists to keep out.

**`align` is not `matrixAnchor`, and a caller setting both should get both.** `matrixAnchor` places
a **row shorter than the area** inside a fixed area; `align` places an **area narrower than the
frame** inside the frame. Two containers, two contents, and they read as one question — which is why
the distinction is written here rather than discovered by whoever sets both.

### Actions

```typescript
type Action =
  | { kind: "fill";   label: string; command: string }
  | { kind: "exec";   label: string; command: string }
  | { kind: "open";   label: string; url: string }
  | { kind: "expand"; label: string; target: string }
  | { kind: "view";   label: string; target: string };
```

`fill` is the default; `exec` is the exception. Populating the prompt lets the dev read and edit before running, which matters when the command is `production cancel <uuid>`. Only filter pills use `exec`, because a filter is trivially reversible (A01 D8).

#### `view` is the fifth, and `target` is the half that needed a ruling

`view` fills the screen with one block — C25 §3b's fullscreen patch is its first
and so far only producer. It is the same category as `expand`: an affordance on a
block that the *reader* invokes, not something the far side causes.

**It is not the thing C22 §13 records as undecided, and the two must not be
conflated.** That row asks what makes *a verb's result* a pushed view — who
decides, and what `Esc` does to the entry it came from. This kind answers none of
it. Something in the tree finally pushes a `kind: "view"` layer, which narrows the
gap; the ruling C15 T5.5 waits on is untouched.

**`target` names a block id, and it is resolved against the blocks of the entry the
action fired from.** Never trusted, never searched across the transcript, and never
permitted to name a block in another entry. The distinction from `expand` is that
`expand` needs no resolution at all — it toggles a row on the entry it came from,
and the entry is already in hand — whereas a view has to say *what* fills the
screen, and `target` is a free string an adapter supplies. An unresolvable target
is refused with a notice, not silently ignored: an adapter emitting a stale block
id would otherwise produce a key that does nothing and reports nothing.

**And the kind is `view` rather than `fullscreen`** because C15's layer kind is
already `"view"`. Two words for one concept is what the vocabulary audits keep
finding, and this is the moment it would have been introduced.

**`actions` is on `Patch` for the same reason it is on `Tip` and `Notice`**: the
affordance is data the producer supplies, so a patch that should not offer
fullscreen simply does not carry the action. The alternative — a key binding that
applies to every patch — makes the offer unconditional and gives the block no way
to decline, which is the shape C09 I1's neighbours keep rejecting.

---

## 3b. `status` — the block a layer above knows about and the definition does not

**Three states, one kind** (C09 §3a, C09 I31, C09 I32):

```typescript
export type Status = Readonly<{
  kind: "status";
  id: string;
  state: "error" | "loading" | "retrying";
  message: string;
  /** The rows the box occupies. Bound by what `measure` committed (C09 I11). */
  height: number;
  /** Supplied by whoever holds the clock, never derived from `tick`. */
  retryInMs?: number;
  attempt?: number;
  elapsedMs?: number;
  spinner?: SpinnerName;
}>;
```

**Why it is a block and not a rendering mode.** Only `error` is reachable from the registry — L1
catches a throw and knows. It cannot know that a part has never fetched, or that a backoff is
counting down: those are the builder's and the refresh driver's facts, both L4, and a registry
that could see them would be reading upward. So the state is carried *in the block*, constructed
by whoever holds the fact, and drawn by one definition. One implementation, three call sites.

**The three optional numbers are supplied and never derived.** `tick` cannot carry a duration —
C03 coalesces and drops commits under load, so it is not in a fixed ratio with wall-clock — and
L1 may not read a clock. `retryInMs` already arrives this way through `LiveSpec.renderError`; the
other two follow it rather than inventing a second route.

**`height` is required and is not a default.** `plot`'s argument, for the same reason: a box whose
height the framework guessed is silently wrong-sized and nobody notices it is wrong. The registry
supplies the number it already committed; a consumer constructing one supplies its own.

**Validation refuses an empty `message` and a non-positive `height`** — both at construction, both
naming the field (I57). An empty message in an `error` box is a box that says something failed and
not what, which is the same objection §3a's three-row rung makes about dropping the rule.

## 3c. The scroll container — a declared height, and an offset that is not the block's

Roadmap 46's kind, and **C26 §4b's cell 3 was expected to get its first inhabitant**: the one
kind declaring both `elements` and `window`. That cell was ruled while empty, which is what made
it cheap to get wrong, so this section is the ruling meeting a subject.

**And the subject falsified it — `scroll` declares `elements` and no `window`.** A bounded region's
height is declared, so it cannot measure less without becoming a different box, and the composition
cell 1 describes is not this kind's to make. **The overturn was recorded in C26 §4b, which now reads
*cell 3 is still empty*, and in `containers.ts`, which cites cell 1 while contradicting it — and not
here, in the document that makes the claim first** (F229). Cell 1's reasoning about the two windows
stands; what does not is this kind being the one that performs it.

```typescript
export type Scroll = Readonly<{
  kind: "scroll";
  id: string;
  /** Interior rows. A positive integer, and the content may exceed it. */
  height: number;
  children: readonly Block[];
}>;
```

**The elements are one per child**, at `level: "block"`. That correspondence is not a
convenience: it makes *has no elements* and *has no children* the same fact, which is what
lets the refusal below live in `data/` without calling into L1.

**`height` is declared and `measure` never sees it unresolved** — roadmap 38's
resolve-then-measure, and the third ruling in this project with that shape (I44's fixed shares
and I45's alignment are the other two). `measure(block, width)` returns `height` at every
width and every offset.

### The walk — both artefacts, because the kind has structure and state

**C26 §8a's rule applied rather than cited**: a component with structure *and* state needs a
table *and* a trace, and taking the trace alone because the scrolling is the obvious thing is
how the structural half goes unexamined.

#### The classification table — interactions that hold at rest

| # | the two rules that meet | ruling |
|---|---|---|
| 1 | *`measure` returns `height`* × *the transcript windows every block* | **Two windows compose and neither is the other's business.** The transcript's `window(block, width, from, to)` slices the scroll's **box** — the `height` rows it draws — and the offset chooses which children fill that box. `window` is never told the offset and never adds it. Stated because the obvious implementation adds the two and is wrong by exactly the offset, in a direction that looks like an off-by-one at the top of a tall entry |
| 2 | *elements are one per child* × *I14, ids unique nested children included* | `(scroll.id, child.id)` is unique with **no new uniqueness rule**, which is C26 §8b R3's argument arriving a second time. §4b's address is well-founded here rather than asserted |
| 3 | *the offset is view state* × *`measure` never sees anything that animates* | **The offset changes no height, and that is the whole reason it can be view state.** The box is `height` rows at every offset, so nothing keyed on `(block, width)` moves and C14's index never rebuilds. An offset that changed height would be a document patch and would belong to C13 |
| 4 | *content shorter than the box* × *an offset exists* | **Clamped at read, never corrected at write.** A store that had to be fixed up on every patch is a store that accumulates, which is exactly what C23 I47 forbids of view state |
| 5 | *a container must be aimable* × *elements are one per child* | **`children: []` is a construction error, refused at parse.** *A container declaring an offset and no elements* is the rule, and the correspondence above is what makes it expressible where the validator lives. Refused rather than corrected at render — C15 I20's placement precedent, and the same argument as `resolve(key)` throwing on no choices |
| 6 | *only the live entry holds focus* × *a container scrolls if it is focusable* | **FINDING, and it is a decision rather than a detail.** `focusFor` answers non-null only for the live entry, so **every scroll above the live one is unaimable** and shows its first `height` rows for the life of the session with the rest unreachable. The archive's surface note says the opposite of ordinary blocks — *frozen: rendered, scrollable, not focusable* — so *scroll follows focus* and *frozen blocks scroll* cannot both hold. **Ruled: a settled scroll keeps its offset and cannot be moved.** The alternative is block-to-block focus above the live entry, which is C26 §11's deferral and not this kind's to take. **And it says so** — see the residue below: a bounded region with a marker is normal, one that silently ends is a defect (F123's class) |
| 8 | *C26 I4, elements lie inside `measure`* × *the content exceeds the box* | **The walk missed this and `tsc` did not.** A child at content row 300 in a box of twelve is outside `[0, measure)`, so I4 is false for this kind as written. Clipping the list to the visible children makes `elements` depend on the offset (C26 I3 refuses it); measuring the box as its content unbounds the region. **Ruled: element rows are content rows, and C26 I4 gains this kind as its named exception** — the offset becomes the one map from content rows to box rows, which is §4b's *the window is a rendering consequence* arriving as an addressing rule. Added after the table was written, and left in place rather than folded in: a row found by the build is evidence about the artefact's reach |
| 7 | *a scroll among another's children* | **Legal and flat.** One element per child, and a child that is a scroll is one stop: `↓` steps *to* it and entering it is C26 §4's scope stack, which is unbuilt. Recorded rather than refused, because the flat reading needs no rule and refusing needs one |

#### The sequence trace — interactions something has to happen for

| # | the sequence | ruling |
|---|---|---|
| 1 | focus enters, then `↓` past the last visible child | the offset advances until the child's **last** row is inside the box; **a child taller than the box aligns to its top**, which is the only answer stable under a second `↓`. **RULING NAMES AN OPERATION THAT DOES NOT EXIST** — taking a child's top `n` rows needs a windowing seam, and `RenderContext` offers `measureChild` and `renderChild` and nothing that slices. So the child is drawn whole and C25 I1 is false for that one case, held open by T2.28b, which expires by asserting the disagreement. C23 §8a A4's class, found by the build rather than by the walk |
| 2 | `PgDn`, then `↓` | C26 §4b: `↓` steps from the **focused** element, so the offset comes back to it. The assertion is which element focus reaches, never the resulting offset |
| 3 | a patch replaces the children with fewer | the offset is past the end and is **clamped at read**. Nothing writes, because nothing but the renderer reads it |
| 4 | a resize | children re-measure and every element's rows move. **The offset is a row count, not an element index** — so it is re-interpreted rather than re-derived, and a reader who scrolled halfway stays halfway instead of jumping to whichever element used to be at that index. This is the ruling an obvious implementation gets wrong, and no cell of the table reaches it |
| 5 | the entry is evicted or the transcript cleared | the offsets drop **on `rendered`'s own subscription** — same arm, same place in `construct.ts`, so a future eviction path cannot drop one and keep the other |
| 6 | the entry settles | table cell 6. The offset is kept and frozen |

### The residue, and the row it costs

**A silent bound is the empty-block class.** F123 already ruled the shape: the fallback adapter
writes *"Showing the first 2,000 rows; N more were not rendered"*, and D40's eviction carries a
marker for the same reason. So the container renders what it is hiding, **in both directions**,
because a settled container keeps the offset it had — resetting it would lose the position the
reader chose, and that means content is hidden above as well as below:

    ⋯ 12 above · 368 below

**Two things it buys past honesty.** *This region is bounded and there is more* is a sentence a
reader accepts; *this region ended* is a bug report. And **C26 §11's deferral gains a visible
symptom** — block-to-block focus has none today, and a marker saying 368 rows are unreachable
is one. A deferral with a visible cost is a deferral that gets revisited, which is this
session's four-instance finding pointed forwards instead of backwards.

**The marker costs a row, and which row is a rule interaction the ruling created.** Working it
through rather than assuming, because I47 already constrains the answer:

- **Not a row taken from the box when there is residue.** Whether residue exists depends on the
  offset, so the content area would change size as the reader scrolls — jitter, and `measure`
  would depend on view state, which I47 forbids.
- **Not an unconditional row either**, which would be stable and would draw *⋯ 0 above · 0
  below* under a container whose content fits.
- **And the box pads to `height` with blank rows, which is not a detail.** An under-filled
  container drew only its children and `measure` said `height`, so C25 I1 was false wherever
  the content was shorter than the box — shipped, and invisible to eighteen rows because every
  fixture filled or overflowed. **The padding is explicit rows and never a fixed-height Box**:
  a height on the box pads *and* clips bottom-anchored, so a five-row child in a box of two
  drew rows three and four — the right count, the wrong document. Read the frame, not the
  numbers.
- **A row the container adds when its content cannot fit**, which depends on `(block, width)`
  alone: `measure` returns `height + 1` where the children measure taller than `height`, and
  `height` where they do not. **Pure in `(block, width)`, stable under every offset**, and the
  same conditional shape as C11's action bar — which adds two rows on a property of the block
  and never on a property of the view.

So `height` is the **content** height and the marker is chrome the container adds, exactly as a
panel's border is. **The glyph comes from C09's table and is never written as a literal**
(I38's argument, and F6 is the instance): `⋯` degrades to `...` under ASCII like every other.

### The boundary, and what `y` copies across it

**The box hides rows and the copy carries them, and that is C26 I17 rather than an exception to
it.** An element's `copy` is its source and never its rendering — which is already why a column
the width dropped and a value the width truncated are both present in full. A child the offset
scrolled out of the box is the *same fact in a third form*: the rendering could not show it, and
the rendering is not what is copied. A boundary-aware copy would be a copy that changes with the
offset, which is the defect I17 exists to forbid, one axis over.

**So the container's element `copy` is its children's sources, joined**, and the rule that makes
that expressible is the one this kind already has: elements are one per child (I47), so *which
element* and *which child* are the same question. A kind whose source the join cannot express
contributes **nothing** rather than its painted rows — the same direction I17 takes, and the
reason a `table` is deliberately absent from it: C11 already declares a richer `copy` per row,
and a second answer here would be two sources for one fact.

**A child contributing nothing is not the same as a container contributing nothing, and the
second was a silent no-op.** `copyElement` filters the undefined and the empty out and returns
early on an empty result, so a container whose elements carried no `copy` at all made `y` a key
that did nothing and said nothing — the empty-block class, in the one place a reader has no way
to tell *there was nothing to copy* from *the key is not bound*. `y` on a container has an
obvious meaning and it was unimplemented rather than refused, which is the worse of the two.

**What the boundary still owes, and it is owed elsewhere.** A copy carrying 400 rows out of a
box showing 12 is correct and surprising, and the sentence that removes the surprise — *selected
40, copied 400* — needs a readout to sit on. **There is none**: no such surface exists in the
tree, and the nearest thing that does is `TuiConfig.chrome.footer`, which is roadmap 29's whole
subject (F161). So this is recorded as a consumer of that row and **not** as a small addition
here: it is a surface, not a count.

---

## 3d. `minHeight` — the field a layer above sets and no kind reads

**`measure` commits a block's rows before anything is drawn, and a renderer that gives way is discovered after that number is fixed.** A `rule` measures one row, so a `rule` whose renderer throws has one row to say so in — no border, no tag, nothing but the message. The number cannot be raised inside the frame that discovers the problem: C14 has already indexed it, the viewport has already chosen `takeRows`, and a block drawing taller is cut with whatever followed it (F230).

So the change is **deferred**. A block carries a floor; the frame that discovers the need completes single-pass at the committed height; the next frame honours it.

```typescript
type BlockBase = {
  id: string;
  gapBefore?: boolean;
  /** A floor on the rows this block occupies, in rows. Set only by `op: "reserve"`. */
  minHeight?: number;
};
```

**Applied by the registry, outside the definition** (C09 I2, I33):

```
registry.measure(b, w) = max(definition.measure(b, w, measureChild), b.minHeight ?? 0)
```

**No kind reads it, and that is what keeps three things true at once.** `measure` stays a pure function of `(block, width)`, so C09 I2 holds and the published conformance suite's T2.2 passes for the right reason rather than by luck. `scroll`'s argument in §3c — that its residue row is a function of `(block, width)` and deliberately not of the offset, because a box that shrank as a reader scrolled would jitter — is not reopened, because `scrollDefinition.measure` never sees the field. And a container gets its child's floor for nothing: `measureChild` **is** `registry.measure`, so a floored child is counted by its parent without a rule saying so.

**The render pads to the floor and never bounds it.** The registry wraps a floored block's element in a `minHeight` box, which is measured to pad a one-row child to three and to leave a four-row child alone. A fixed `height` would have been wrong in a way worth recording: an over-full box drops its **first** row, not its last, and `overflowY: "hidden"` does not change that. So I1 holds by construction rather than by the two sides agreeing.

### It is view state, and it is the second member of a set

`minHeight` is not data. Nothing on the far side knows a renderer threw, and an adapter that set the field would be declaring a layout it has no standing to declare. **Only `op: "reserve"` may write it**, and `validateDocument` refuses it on an inbound document — which is the half F231 found missing from `expanded`, whose op is unforgeable and whose field was never validated.

### A floor survives only while the block is untouched

Four operations produce a new block from an old one, and **none of them carries the floor**:

| | why |
|---|---|
| `replace` | already covered — *replace is wholesale*, §4, no new sentence needed |
| `merge` | the table has new content, and a floor raised for content that has gone is a block padded for nothing |
| `expand` | the same argument: the rows changed, so the height that failed is not the height now |
| `window` | **the build sharpened this one: a floored block is not windowed at all.** The walk ruled *a slice carries no floor*, which is true and insufficient — `windowSequence` derives its `to` from the **floored** height, so a `window` reaching only the definition's own rows breaks C09 I26's identity from outside the definition, where nothing would look. Kept whole and paid for out of `skipRows`, exactly as a kind declaring no `window` already is, and affordable because a block with a floor is small by construction: the reason it has one is that it failed to draw |

That is the whole of the clearing rule, and it is why nothing needs to watch a condition: a floor cannot outlive a change to the thing it was about.

**And it can outlive a change to something else, which is a limit rather than a bug.** A renderer that threw at one width may not throw at another; the floor is set from the frame that observed it and stays until the block is touched, so the block can be padded for a failure that would no longer happen. The cost is blank rows under a block that already failed once. Stated here rather than left implicit, because a condition nobody watches is how a deferral becomes permanent.

### The walk — both artefacts, because a floor is structure and its arrival is an event

**The classification table**, indexed by the cells where two rules both hold at rest:

| | the two rules | the ruling |
|---|---|---|
| 1 | the floor × I1 | the registry pads the element to the floor; measure returns the same number. Neither side is trusted to agree with the other |
| 2 | the floor × a kind's own `measure` | applied outside the definition, so C09 I2 is untouched and no kind can consult it even by accident |
| 3 | the floor × the empty `group`'s legitimate zero | **the floor wins and the group becomes visible.** A block that failed and shows nothing is *absence indistinguishable from failure*; making it visible is the mechanism working. Stated because §3 documents that zero as legitimate |
| 4 | the floor × `window` (C09 I26) | **not windowed** — see the table above. The row is kept here because the cell was right about the interaction and wrong about the remedy, which is the shape §3c's own trace names |
| 5 | the floor × `merge` / `expand` / `replace` | dropped |
| 6 | the floor × `gapBefore` | the gap is the sequence's (§3a) and is added by `sequenceHeight` **after** the block's rows, so `max` applies to the block alone. A floor applied to `block + gap` would be one row short at every gap |
| 7 | the floor × a container's child | nothing propagates and nothing needs to: `measureChild` is the registry's own measurer, so the parent already counts the floored child, and the parent's own padding covers its frame |
| 8 | the floor × a viewport shorter than it | set once, indexed, shown as far as the region allows. Nothing retries, because a field is not a request |

**The sequence trace**, because the floor arrives through an event and the interesting rows are the ones with something in between:

| | the sequence | the ruling |
|---|---|---|
| 1 | throw → request → patch → `rev` → both caches drop → the next frame honours it | the path. Measured: with the floor in effect and no invalidation, the second frame was still short; the frame after a width change drew it whole |
| 2 | **two blocks in one entry throw on the same frame** | **tolerate, do not coalesce.** Two patches and two `rev` bumps cost one extra cache miss on an entry that has already failed twice; coalescing needs a plural op, which is a worse type for a rare case |
| 3 | the entry is evicted between the frame and the patch | `{ ok: false, reason: "unknown" }`, dropped in silence. C13 already names it *ordinary, not a bug* |
| 4 | **a far-side patch replaces the block between the frame and the patch** | the request carries the `rev` it was observed at and is **discarded if `rev` moved**. Without it the shell floors a block that never threw, and the block it floors is addressed by an id the far side has just reused. **This is where `(id, rev)` earns its place** — not in termination, which needs nothing |
| 5 | a width change between them | the limit above. The floor is set for a condition that may no longer hold |
| 6 | the block scrolls out of the window between them | the patch applies. The floor is on the document, not on the frame |
| 7 | the entry has settled | accepted — the gate reads *who is writing* (C13 §6), and this is the shell speaking about an entry it holds |

**Termination needs no rule, and that is the point of a field.** The shell raises a request only when `block.minHeight ?? 0` is below what it wants. On the next frame the field already holds the value, so there is no patch, so `rev` does not move, so nothing re-renders. A rule forbidding a second request would be a rule for stopping an **event** repeating, and a field cannot repeat.

---

## 4. Patches

**Four ops carry data and two carry view state, and that split is the whole reason the fifth and sixth exist.** `append`, `replace`, `merge` and `status` all say *something arrived or changed on the far side*. `expand` says *the reader opened a row*. C13 gates the first four on an entry still streaming (C13 §6) — a settled stream can receive nothing more — and the gate is wrong for the second kind: expansion is exactly what a reader does to a **finished** table.

Expressing it as `replace` was the first draft and it fails on that gate: an app verb's result is settled the moment it lands, so every entry worth expanding rejects the operation. C11 T4.7 and C25 I11 both say expansion reaches a *frozen* entry, which is true and insufficient — frozen and settled are different states, and only the first still accepts patches.

A `viewState: true` flag on `replace` was the smaller change and is the worse one: it leaves one op meaning two things, and an adapter could set it to slip data past the gate. A named op is unambiguous at the call site and unforgeable at the boundary — the same argument as `settle(id, doc)` over a fourth patch op, one layer down.

**And the guarantee holds at the op and leaked at the field, for as long as this paragraph stood alone** (F231). Every sentence above is true about `replace`, and the conclusion a reader draws from it — *so this is unforgeable* — is about the **op**. `expanded` is where the op lands, and `validate.ts` did not contain the word: measured, an inbound document carrying `expanded: true` validated and the table measured **3 against 2**, so the far side set view state and was charged a real row for it. Nobody copying the argument would have noticed, because the argument is correct.

**So a named op carries an obligation as well as a guarantee: the field it writes is refused on the way in.** `validateDocument` rejects `expanded` and `minHeight` on an inbound document, and the two are one rule rather than two — a set that grows whenever an op is added, which is what makes it a check over the kind rather than a line per field.

```typescript
type ViewPatch =
  | { op: "append";  block: Block }
  | { op: "replace"; blockId: string; block: Block }
  | { op: "merge";   blockId: string; rows: readonly MergeRow[] }
  | { op: "status";  status: ViewDocument["status"] }
  | { op: "expand";  blockId: string; rowId: string; expanded: boolean }
  | { op: "reserve"; blockId: string; rows: number };

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

### `reserve` is the second view-state op, and it exists because a height is discovered late

`reserve` sets `minHeight` on a block (§3d). It is the shell speaking about a block it holds — a renderer gave way and the rows the error needs are more than the rows the block measured — and it is on the same side of C13's gate as `expand`, for the same reason: the entries worth reserving on are the settled ones.

**It is `expand`'s shape and not `replace`'s**, on §3d's argument: nothing on the far side knows a renderer threw, and an adapter setting a layout floor is declaring something it has no standing to declare.

`rows` is a floor and never a height. A block already taller keeps its own measurement; `registry.measure` takes the maximum and the registry pads the element to match, so the two sides cannot disagree.

**A `reserve` naming an unknown `blockId` fails**, exactly as `replace` and `merge` do — the caller is addressing something that is not there. The shell's own caller tolerates that failure silently, because an entry evicted between a frame and its request is ordinary rather than a bug.

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

**That same set is exported as `descendants(block)`**, the cycle-safe walk the constructor already performs, because it is knowledge about the vocabulary and C04 owns the vocabulary. C13's block cap needs it (C13 I17) and would otherwise carry a second copy — and a second copy is a walk that misses the next container kind added here, silently, in the component that decides what to evict. The same argument as `cells()`: one implementation, or the two answers drift.

**It yields blocks and never rows.** A table's rows are not blocks; a row's `detail` is. Consumers deciding what to *count* decide that themselves — `descendants` says only what nests.

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

## 5a. The serialisation contract

**A document is JSON, and nothing said so.** The block union declares no function,
`Map`, `Set` or `Date` member — the only function types in the file are `MeasureFn`
and the measurer's signature, neither of which is a document field — so
`JSON.stringify` is the serialiser and `validateDocument` is the parser. That is
why roadmap 44's persistence needs no codec (F166), and it is a property nothing
asserted until it was written down here.

**The property**: for every valid document `d`,
`validateDocument(JSON.parse(JSON.stringify(d)))` is valid and structurally equal
to `d`. It is the same shape as C09's window sweep — a generic claim run over the
whole corpus rather than a row per kind — and, like that one, what it is worth
depends on whether anything can fail it.

### The walk — a classification table, because none of this is event-mediated

Four rules meet here: the **document is pure data** (I1); **`validateDocument`
decides** what an untrusted value is; the **round trip** must preserve it; and
**JSON's number is not JavaScript's**. The cells are where two of those overlap.

| # | the two rules that meet | the cell | ruling |
|---|---|---|---|
| 1 | *the type says `number`* × *the round trip preserves* | `NaN` and `Infinity` — legal JavaScript numbers that JSON writes as `null` | **measured: accepted before and after, and the value changes.** A plot's `[1, NaN]` persists as `[1, null]` and revalidates clean, so the document that comes back is a *different, still-valid* document. The validator requires a **finite** number wherever the type says number |
| 2 | *`validateDocument` decides* × *the type says `number`* | a numeric **array** — `Series.values` and `Cell.spark` | **the elements were never checked at all.** `requireArray` establishes the array and stops, so `["x"]`, `[null]` and `[{}]` validate today, round trip or no round trip. This is wider than the property that found it, and it is the half that matters for an untrusted document |
| 3 | *pure data* × *the round trip* | a property whose value is an explicit `undefined` | `JSON.stringify` drops the key, so the parsed object lacks it. **Asserted modulo this**, and the reason is that it is unreachable through the framework: `exactOptionalPropertyTypes` makes `{gapBefore: undefined}` a different type from `{}`, and every constructor spreads-if-present rather than assigning `undefined` — the adapter mapping says so in its own comment |
| 4 | *the type says `number`* × *the round trip* | `-0`, which JSON writes as `0` | **not refused.** `-0` is a legal number and renders identically; refusing it would narrow the type to buy an equality nobody needs. The property is asserted with a comparison that treats the two as equal, and this row is why |
| 5 | *the round trip* × *the corpus* | which fixtures the sweep runs over | `ONE_PER_KIND` and `ADVERSARIAL`, the same corpora T2.1 uses — so a kind added without a fixture fails T2.10 before it reaches here, and the sweep **asserts its own count** rather than reporting a completion it never observed |

### The half that cannot fail, stated rather than discovered

**I46 has two halves and only one of them can be violated by an input.** The
mutation pass is what asked, and the answer is worth having in the spec rather
than in a run's exemption list.

The **validator** half is not vacuous: three fabricated inputs fail it, and two of
them were accepted for the life of the component. The **equality** half is —
every member of the block union is a string, a number, a boolean, an array or a
record, so `JSON.parse(JSON.stringify(d))` equals `d` for every document that can
be constructed, and deleting the assertion changes nothing.

**What falsifies it is a type change, not an input.** The day a kind carries a
`Date`, a `Map`, a `bigint` or a class instance, that assertion is the only thing
in the suite that says so — which is why it is kept rather than reduced to a
validity check, and why this paragraph exists instead of a row that reads as
covering something it cannot reach. **An invariant is vacuous until its subject
exists**, and the honest form is to say which half is which.

**What this does not settle.** Whether `validateDocument` is *published* is C24's
question and not this one: C24 I1 removes an export used by neither app, and the
consumer this would have is roadmap 44 — which is framework work and imports it
directly. C24's own precedent is `ViewRefresh`, withheld until it had a driver and
better for the wait. The property below holds either way, and it is what a
persisted document rests on.

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
- **I13** — `meta.origin` is always present. It is not optional, and no code path constructs a document without it — a provenance field that can be absent becomes a provenance field nobody trusts. **`defect` is the fifth arm and the only one the framework sets about itself** (C23 §5a, F15): a document that exists because a stage failed and the failure was contained. It is not `refresh`, which is a system notice about the session, and not `action`, which names a mechanism that did not produce it — and the arm is only worth its width because `/debug` renders `origin` as a row, which was checked before it was added.
- **I14** — Block ids are unique within a document, nested children included. Checked by `validateDocument`; `applyPatch` fails rather than guessing (§4a).
- **I15** — `applyPatch` is fallible in its type and never throws. Every one of the four failure cases in §4 returns `{ok: false}` with an `ErrorLike`, and the input document is returned untouched and still frozen.
- **I16** — A `merge` payload cannot carry view state. Structural, via `MergeRow`, not remembered: I9 holds because the field does not exist to be set.
- **I17** — Every measurer returns at least 1 for a present block (§5). Only an empty container measures 0.
- **I18** — Any view state that affects height is a field of the block. Nothing outside the document can change how tall it is, which is what makes `measure` a pure function of block and width (I7) rather than of block, width and wherever the expansion flag happened to live.
- **I19** — `fill` is the default action and `exec` is reserved for reversible operations. An action a user has not read before it runs is the one thing this vocabulary will not produce by default, and D52's approval story is that default rather than a mechanism built on top of it.
- **I20** — A `pills` block is exactly one logical row. Multi-row pill layouts are multiple blocks, so height stays declared rather than emerging from how many pills happened to fit.
- **I21** — `merge` never deletes a row. A table sheds one through `replace`, and the adapter decides which it means — a merge that could delete would make a dropped row and an unmentioned row indistinguishable in the payload.
- **I22** — `replace` is wholesale: view state is not carried across it. It is the exact complement of I9, and the pair is the whole of the update model — `merge` preserves, `replace` does not.
- **I23** — Container widths are declared, not negotiated: `panel` and table detail at `w - 2`, a `column` group at `w`, a `row` group at an equal split. A weights field arrives when a surface needs one and not before.
- **I24** — `form: "line"` requires an explicit `height`. There is no default, because a defaulted height on the one block kind whose height is not derivable is a silent disagreement with I7 waiting to happen.
- **I25** — `gapBefore` is content: `merge` carries it, `measure` never counts it, and every sequence of blocks adds one row per block declaring it. A composer that inserts spacing of its own instead (C23 §2) makes a document's height unknowable from the document.
- **I26** — `Result` is declared here and nowhere else in the tree. Two shapes under one name in one layer half compile and diverge quietly — the failure is not a type error but two callers agreeing about a field that means different things. The same shape as C01 owning "escape literals live only in `escapes.ts`": C04 declares the type, so C04 owns its exclusivity.
- **I27** — `validateDocument` terminates on any input, including a cyclic one. A path-scoped seen-set refuses a cycle; it is not a depth limit, and it does not reject a legitimately shared subtree.
- **I28** — `ErrorLike` requires `message` and nothing else. `code`, `stage`, `details` and `remediation` are optional, and a far side's richer envelope is a specialisation rather than a second type — so every failure in the system renders through one path (A01 B5).
- **I28a** — `meta` carries the invocation record: `argv`, `stderr` and `transport` are present on every document C07 produces. They belong to `meta` because a block is content and the invocation is *about* the document, so any inspector reaches them uniformly without re-running anything (D49).
- **I29** — `yMin` and `yMax` pin a plot's vertical range, independently and optionally. Out-of-range values clamp to the edge; they are never dropped and never widen the range they were pinned against, because a pinned axis exists so that two plots can be compared and a range that silently grew would defeat that.
- **I30** — `truncateFrom` names the end characters are removed from, and defaults to `"end"`. A column that does not declare it truncates as prose does, keeping the start — the same behaviour as before the field existed, so adding it changed no rendering that had not asked to change.
- **I31** — Row ids are unique within a table, checked by `validateDocument` alongside I14's block ids. Three things address a row by id — `merge` upserts by it (I9), C16's focus names it, and a rendered row is keyed by it — so a duplicate is ambiguous in three ways at once. It is a separate invariant from I14 because the namespaces are separate: two tables may each hold a row `r1`, and a row id never collides with a block id. Raised from C11, the first component to depend on it.
- **I32** — `ColumnDef.role` declares presentation intent, not view state. A surface names the column whose content a renderer supplies; the flag never changes with what the user does, so it is part of the schema `merge` carries and not part of what I9 protects.
- **I33** — `patch` and `comparison` are distinct kinds and never merge. One is rows of field comparisons, the other hunks of text with line numbers and two palettes; a merged kind's height would depend on which mode it was in, and I7 — measured height equals rendered height — is the invariant that cannot bend (D50).
- **I34** — A `view` action's `target` denotes a block id **within the document the action fired from**, and denotes nothing else. The kind carries no content of its own, so a target resolved against a wider scope would let one entry's action fill the screen with another entry's data. C04 owns what the field means; C23 owns refusing one that does not resolve (C23 I31).
- **I35** — A categorical axis other than `Tone` is never carried by colour. A block names the fact — a marker, a word, or a closed union a renderer maps — and the renderer derives any tone from it; no producer supplies a colour for such an axis, and none is representable. This is why `Tone` stays a judgement axis: the alternative is not a second palette but a distinction that survives `colourDepth: 1` because nothing else was ever available to carry it. Four surfaces reached the boundary independently (F30, F49, F51, F81) and three of them found it correctly by hand.
- **I36** — `Comparison`'s row carries `change` and `verdict` as separate optional fields, never one union. `comparisonTone` has always coloured the verdict half and left the change half neutral, so one union names two axes that already render differently — and `added`/`removed` have no member of it to join (I35, F30).
- **I37** — A block kind exempted from D29's sweep is exempted by the *fields it carries*, not by its name. Adding a meaning-bearing field to an exempted kind removes the exemption; the compile-time guard on `KINDS_WITH_NOTHING_TO_CHECK` catches a new kind and cannot catch a new field, so the reason is recorded per kind and re-read when the kind changes (F102).
- **I38** — A mark is derived from a fact the block names, never invented by the renderer and never demanded of a producer that has already named the fact. `ComparisonRow.verdict` and `Panel.live` are named facts and carry no glyph slot; `Cell` and `Notice` supply one because the fact *is* the glyph. A shape carrying a tone and nothing else has nothing to derive from, and a glyph slot is its only remedy — added when a surface needs one, never speculatively, because MG24 refuses a published member nothing consumes (I35, F18, F34).
- **I39** — `Panel.live` names whether a region is refreshing; C09 draws the `live` glyph from it. The block names the fact and the renderer owns the mark, so a live panel differs from a static one under ASCII and at one bit, where a character written into the title would not (F18, → C09 I5).
- **I40** — `Comparison.labels` names what the two columns are, and their absence means positional. `a`/`b` is right about the *type* — S07 compares two runs and neither is "before" — and was never an answer to whether a consumer may say which side is which; both shipped consumers said it in a `keyValue` block above the block it explained (F33).
- **I41** — **`yFormat` names the unit the value arrives in.** `fraction` takes `0.84`, `percent` takes `100.2`, and both render a per-cent sign — so the rendered form cannot distinguish them and naming them by it produced a member whose obvious use was wrong by a factor of 100 (F31). The arm that multiplies is `fraction`; it is the old `percent` renamed, and it carries the surprising name because it is the surprising arm. **The value is not appearance**: `labelWidth` measures the rendered labels to size the gutter (C12 §3), so an arm that changes a label's width changes the block's geometry, and this rename moves both. An unknown arm is a validation error rather than a silent fall-through to `number`.
- **I42** — **A `row` group divides its width by declared weights, and every rule the equal split made invisible is stated with it.** The gutter comes **off the top** before any share is computed, so equal weights reproduce the current arithmetic exactly and a separator never varies with its neighbours' sizes; the remainder after flooring is **unspent**, exactly as it is under the equal split — spending it would make `flex: [1, 1]` differ from no `flex`, and C11's leftmost rule does not carry because a table's residual exists to be absorbed and a group has no child that claims it; a weight of `0` is a **construction error**, because *not placed* is expressed by omitting the child and *placed at one cell* is what `1` means; and a length that does not match the children is one too, since there is no reading to fall back on. **Placement stays left to right and never by size** (§3): with an equal split, by-position and by-cost are the same rule, and under weights they are not — dropping by size would make the rendered set depend on a number rather than on the order the author stated. **The mechanism is not C11's `flex`**, which is a boolean over a content-derived minimum: a group knows `measure(block, width) → height` and no preferred width, so there is nothing to absorb residual from and a proportion is the only expressible allocation. A weight on a `column` group is **ignored** rather than refused, on `gapBefore`'s precedent, and it is knowingly vacuous.
- **I43** — **Weights and nested groups both express uneven allocation, and they differ where it matters.** §3 deferred weights on the grounds that *uneven allocation is expressible as nested groups*, and that equivalence holds **only while every child fits**: a nested group is one child of the outer row and is dropped whole, where flat children are dropped one at a time (§3, roadmap 38). Neither supersedes the other — nesting also expresses grouping, which a number cannot — and the 1-cell floor's boundary, measured as degenerate at `w ≤ 2n − 1`, becomes reachable at ordinary widths under weights: `[50, 1]` puts the second child at one cell in eighty columns (→ C09 §4b).
- **I44** — **A share is a weight or a cell count, and fixed widths are satisfied before any weight is computed.** `flex` takes `number | { cells: n }`: R1 says a group cannot ask a child what width it wants, and this is the child saying so, which is the same fact from the side that holds it. **Allocation and placement answer different questions and both are stated**: fixed children take their cells off the budget first and the weighted ones divide what remains — any other order makes a cell count a suggestion — while **placement is unchanged**, left to right while the budget lasts, so a fixed child that does not fit is dropped exactly as any other is. Privileging it there would make the rendered set depend on a declaration rather than on the order the author wrote, which is I42's rule a second time. A `cells` that is not a positive integer is a construction error, on the same argument as a weight of zero (§3, roadmap 38).
- **I45** — **A row aligns its children in its own height, and that is the only axis there is.** **Vertical placement is inside the row's height**, which a row already computes as its tallest child and otherwise discards. **A horizontal axis was ruled and refused by the build**: every renderer fits its output to the width it is handed, so a child fills its allocation and aligning a ten-cell box inside a ten-cell one is a no-op — placing it would mean knowing how wide the content *is*, and `measure(block, width) → height` does not answer that. Heights are measurable and widths are not, which is the same missing preferred width that made weights the only allocation (I44), arriving a third time. The axis that exists has a shipped consumer: the banner's wordmark carries a **blank first row** so its seven lines sit on the whale's hull, which is vertical alignment hand-written into the art exactly as the padded whale was a fixed width hand-written into it (§3, roadmap 38). It defaults to `top`, which is what a row does today, so an absent field renders byte for byte as before. **`measure` is untouched**: alignment moves rendered lines inside a box the container already sized, so the row is still the tallest child and every cache keyed on `(block, width)` is unaffected — the containment argument that made weights safe, applied to position instead of size. A child that is not placed is aligned by nobody.

- **I46** — **A valid document survives a JSON round trip unchanged, and the validator refuses what JSON cannot carry.** The union holds no function, `Map`, `Set` or `Date`, so `JSON.stringify` is the serialiser and `validateDocument` is the parser — which is why persistence needs no codec (F166) and why this had to be stated before something rested on it. **Where the type says `number` the validator requires a finite one, elements of numeric arrays included.** Two defects were found by writing the property rather than by the property failing: `NaN` and `Infinity` were accepted, and JSON writes them as `null`, so a document persisted and reloaded was a *different document that revalidated clean*; and `Series.values` and `Cell.spark` were never element-checked at all, so a string, a `null` or an object in a numeric array validated with or without a round trip — the wider half, and the one an untrusted document turns on. **Two inequalities are knowingly tolerated and named rather than closed**: `-0` writes as `0`, which renders identically and is not worth narrowing the type for, and an explicit `undefined` property is dropped, which no constructor can produce because `exactOptionalPropertyTypes` makes it a distinct type and every one spreads-if-present (§5a).
- **I46a** — **A numeric array holds finite numbers and `null`, and `null` is the gap.** The one non-number a document may carry in a numeric position, chosen because it is the only spelling of *no reading* that JSON round-trips: `JSON.stringify` writes `NaN` as `null` already, so the alternative was a value the type forbids arriving from the serialiser I46 names. **The two invariants were both correct and their overlap was a hole**: C12 I4 makes a non-finite entry a gap whose position survives, I46 refuses non-finite elements, and between them absence was expressible in memory and inexpressible in a valid document — measured, not reasoned, by running the validator over the block `examples/docker` had been building since the ring began pushing one. `NaN` and `±Infinity` stay refused; the renderer still treats them as gaps, because I2 says no series input throws and a fixture reaches it without a validator. *Found by C12's heatmap walk, reading the validator arm a matrix would need — see C12 §6a for the three passes this claim survived before it was measured.*
- **I47** — **A `scroll` declares a positive integer `height` and at least one child, and both are refused at parse.** Its elements are **one per child**, so *no elements* and *no children* are one fact and the aimability rule is expressible where the validator lives (§3c cell 5). `measure(block, width)` returns `height`, plus I49's residue row where the content cannot fit — and **the same value at every offset**, which is the property that matters: the box does not change size as the reader scrolls, which is what keeps the offset out of every geometry cache and out of C14's index (§3c cell 3). I49's condition is on `(block, width)` for exactly that reason. **The transcript's window slices the box and never the content** (§3c cell 1).
- **I48** — **The scroll offset is view state: a row count, per container, droppable, clamped at read.** **Rows and not an element index**, so a resize re-interprets it rather than moving the reader to whichever element used to sit there (§3c trace 4). It is never corrected at write — a store that had to be fixed up on every patch is one that accumulates, which C23 I47 forbids of view state — and it is dropped with the entry on the same subscription that drops the rendered rows. **A settled entry's scroll keeps its offset and cannot be moved**, because only the live entry holds focus and a container scrolls if it is focusable (§3c cell 6); the content below the box is unreachable there, and that is a ruling rather than an oversight. **Resume restores no offset**, which follows from view state and is C13 I20's consumer.
- **I49** — **A scroll whose content cannot fit draws a residue marker, in both directions, and pays a row for it out of its own height.** *N above · M below* rather than silence: a bounded region with a marker is normal and one that silently ends is a defect (F123's class, D40's eviction marker). **`measure` returns `height + 1` exactly where the children measure taller than `height`, and `height` where they do not** — the condition is on `(block, width)` and never on the offset, so the content area does not change size as the reader scrolls and I47's offset-independence survives the marker rather than being weakened by it. The glyph is C09's and never a literal (F6).
- **I50** — **A container's element `copy` is its children's sources, joined — and the offset does not enter it.** C26 I17 at the level above: the box hiding a child is the rendering, and the rendering is not what is copied, so a copy taken across a scrolled boundary carries the hidden rows in full and is the same text at every offset and every width. A child whose kind cannot express a source contributes **nothing** rather than its painted rows, and `table` is deliberately outside the join because C11 declares a richer `copy` per row (§3c). **A container whose elements carry no `copy` at all is the empty-block class arriving at a keystroke** — `y` filtered everything out and returned early, so the key did nothing and said nothing.
- **I50a** — **A plot carries at most eight series, refused at construction** (roadmap 51). The categorical palette distinguishes eight, and the ninth used to reuse the first's colour — `SERIES_TONES[index % 4]`, which said two different series were one thing and, at four, said series three was `ok` and series four `warn` when neither carried a judgement. **D29 inverted**: information that is not there, carried by colour alone. Refused rather than cycled for C04 I47's reason exactly — a reader cannot see that a colour has been reused, so a rendering that lies is worse than a document that will not build. Both gates say it: `b.plot` throws and `validateBlock` reports. **The cap is a property of the declared `form`, not of the number of series** — C12 §6a A7 is where that was forced, and it is a recast rather than an exception. A `heatmap` carries magnitude in the ramp glyph and draws **no per-row colour at any depth**, so the rule has no subject there and does not bind: a matrix of eight rows is not a matrix, and capping one at the size of a palette it never reads would be a colour rule refusing a document about something else. `line` and `sparkline` keep it **unconditionally**, including the 1-bit case where a multi-series plot stacks and distinguishes spatially: construction cannot see the colour depth, and a document that renders honestly only at one depth is not a document this type should accept. That asymmetry is the whole content of the recast — the heatmap is exempt because the palette is never consulted, not because the picture happens to survive.
- **I50b** — **A `heatmap` refuses a row `tone`, `axes: false`, and a ragged matrix, and requires a `height`.** Three affordances with no meaning for a matrix, refused rather than ignored — because a member that means nothing in one arm is indistinguishable from one that has not been implemented yet, and the reader who finds it cannot tell which. **The ragged case is the one an app hits by accident**: rings of different ages produce rows of different lengths, and the resulting picture is self-consistent and wrong, so the refusal is what makes column `k` mean tick `k` in every row. Both gates say it: `b.plot` throws and `validateBlock` reports. *C12 §6a A4, B1 and B2 carry the arguments; C12 I17 is what the renderer then guarantees.*

  **The refusal is the matrix *family*'s, and it reached one form of eight.**
  `checkHeatmap` tested `form === "heatmap"`, so `calendar`, `correlation`,
  `confusion`, `spectrogram`, `latency`, `density2d` and `utilisation` accepted
  every affordance this refuses. Not a narrower rule deliberately taken — the
  invariant's own reason is *the scale legend is the only thing that says what a
  cell means*, which is true of all eight, and the family grew after the check
  was written. **Found by `utilisation` rendering eighteen rows into a
  sixteen-row grid**, because its furniture was declared and `axes: false` had
  removed nothing. Keyed by a total `Record<PlotForm, boolean>` now, so the ninth
  matrix form declares whether it is one.
- **I50c** — **A cell carries at most one of `spark` and `bar`, and a `bar` declares a scale it may exceed.** Both fill the planned width and return before truncation, so a cell holding both has two renderings and no rule for which wins. `max` is the scale's top rather than a bound on the value: the fill clamps there and the number does not (C09 I28), because a ceiling that is not knowable — a per-core CPU percentage, a quota that can be over-committed — is the case a bar is reached for. **`value: null` is absent and draws a mark**, never an empty bar, which would read as *zero* (C12 I4's rule, in the one form where an empty run is a legible value).
- **I51** — **A `keyValue` row may carry a `bar`, which sits *beside* its value and declares the cells it occupies.** Two shipped surfaces draw one — docker's `MEM` and S13's cluster panel — and in both the bar has a text next to it rather than in place of one, so this is not `Cell.bar`'s seam (I50c) with a different owner. The width is on the row because a `keyValue` value column is a **remainder** and a table column is a **width**: `valueBar` given the whole remainder draws a 68-cell run at a terminal width of 80, correct in every count and a picture no surface asked for. It is not on `BarSpec`, which `Cell` shares and where the column already answers — two sources for one number is the audit's D6 before the code exists to have it. **A bar with no room left is the bar, not the text**: below `MIN_RUN` the row is what `valueBar` returns for a cell that narrow, because the quantity is why the row carries a bar at all. **`barWidth` is a sibling of `bar` rather than a member of it, and the pairing is `validateBlock`'s** — the intersection the ruling wanted breaks every `b.kv` call taking a tone shorthand, since those return a `Cell` whose `bar` is a plain `BarSpec`. Type-legal and validator-refused is what I50c already does for a cell holding both a `spark` and a `bar`.
- **I52** — **A `Plot` may carry annotations: claims about the ordinate, drawn behind the data, with an out-of-range edge dropped rather than clamped.** **Four kinds** — `line`, `band`, `confidence` and `whiskers` — and the six named chart types the survey lists are folds of them rather than forms: a Q-Q plot is a scatter and a reference line, ROC is a line and a diagonal. **This clause said *two* while the type had four**, and it was not merely stale: `checkAnnotations` held the same belief in code, taking every kind but `band` to carry a finite `value`, so `confidence` and `whiskers` were built by `FigureBuilder`, drawn by `annotate.ts`, and **refused at the boundary this type exists for** — by a message naming a member they do not have and citing this invariant. Two records of one belief and neither could correct the other. **The enumeration is load-bearing**: the edge check dispatches per kind and is total over `Annotation["kind"]`, so a fifth member does not compile without a row (C12 §3e). **A band is one statement with two edges, and the area between them** — the fill was refused and **the refusal was half right, which is why it survived being read**. *A fill competes for the cells the curve occupies* is answered by a mechanism written after it: C12 §3u's `Layer.kind` ranks a `surface` below a `curve` and `mergedRow` resolves the contest, so the competition the refusal assumed unresolvable has an owner. *Indistinguishable from it at one bit* is **still true, and it is exactly what the obvious fill would be** — braille, which is the curve's own alphabet. So the fill is a **shade** and never braille, the two edges keep their dashes, and the member that turns it off arrives with the renderer that draws it (C12 §3z). **That clause names an alphabet that exists on one capability arm of three, and measuring is what said so** — `░` doubles at `ambiguousWidth: "wide"` by the framework's own `cells()`, and the only narrow substitutes the tree holds are braille and the ASCII ramp, which are the curve's own alphabets on those two arms. So the fill draws at narrow unicode and nowhere else, and where it does not the two dashed edges carry the band — a frame that was already complete, which is C12 I25's substitution ladder reaching its bottom rung rather than a member that does nothing (C12 §3e). **`tone` is decoration and never the carrier** (F34): C12 draws the line dashed where a curve is continuous, so the distinction survives one bit and a colour-blind reader. **Dropped rather than clamped is the one place this differs from a sample** — I29 clamps data because pressing it against a ceiling is honest, and an annotation is a claim about *where* a value sits, so one moved onto a scale it is outside says the limit is somewhere it is not. **There is no `label` and it is owed**: the gutter is a scale and widening it for a string that is not one changes the plot area, while a label inside the area overwrites the curve it exists to be compared against. It arrives with the legend row that can hold it (C12 §3e, I23).
- **I53** — **A `QuartileSummary` may carry a `mean`, and it is not the median.** The five-number summary has no place for it and a boxplot that cannot show one answers a question nobody asked — *where is the centre* has two answers whenever a distribution is skewed, and showing only the median hides exactly the case the reader is looking for. Optional, because a summary computed from quantiles alone genuinely does not have it, and **drawn with its own mark** rather than the median's: two centres sharing a glyph is D29's failure with a shape instead of a colour. *C12 §3i is what renders it; a violin is a boxplot that also shows the distribution, so it draws the same overlay.*
- **I54** — **A `Plot` may carry a `hierarchy`: a nested structure with a value per node, for the three forms whose subject is containment.** `flame`, `icicle` and `treemap` cannot be built from `series` plus `categories` — a call stack is depth and offset, a treemap is area and nesting, and neither is a list of labelled magnitudes. The two that already existed proved it: `flame` and `icicle` both dispatched to `barRow` with labels suppressed, so they were a bar chart and a reversed bar chart, correct in every count and about nothing. **One field for three forms rather than three shapes**, because the thing they disagree about is layout and the thing they share is the tree. **And a fourth reads it for structure rather than for magnitude** (C12 §3ah, C12 I57): `tree` takes `label` and `children` and **ignores `value`**, which is why `value` is optional on the node (I64) and why its doc names the workaround beside the ruling — a magnitude a tree's caller wants visible goes in the name, `label: "gc (2.1s)"`. *One field for three forms* was written when there were three, and the argument was that layout is what they disagree about; a fourth that disagrees about layout is that argument again rather than a strain on it.
- **I55** — **A style field is a literal union, and where its values are generated the union is generated beside them.** `colormap` is `ColormapName`, 142 members generated with the tables; `palette` shipped next to it as a bare `string`, so `palette: "tab-10"` compiled and failed at render — the exact shape I50's colormap clause refuses, one field along.

  **Its remedy was a union and the measurement said otherwise: the field is
  gone.** Building `PaletteName` turned up that there is only one palette a plot
  may draw a series from. `tone` and `syntax` carry **meaning** — a series taking
  `tone.error` says something is wrong about series three — and C10 I16 closes
  `spectrum` to declared art, with a third consumer stated there as a four-place
  spec change. What remains is `categorical`, which is the palette for exactly
  this. **A field with one legal value is not a choice**, and typing it would have
  made the defect unreachable while leaving a knob that turns nothing.

  **It was inert as well as untyped, and only one of those a type fixes.** The
  field was settable, was carried through the builder — which is why MG24 counted
  it consumed — and was read by no renderer. A name-based seam check cannot tell
  *named* from *acted on*. **A name that resolves to nothing renders uncoloured**, which is F172's shape and the one this type will not reproduce twice. `plotFrame`, `legend`, `plotDetail`, `orientation` and `matrixAnchor` are unions for the same reason, and `matrixAnchor` additionally keys its table by `PlotForm` rather than `string`, so a new matrix form cannot silently inherit a default nobody chose for it.
- **I56** — **A distribution form declares the room its lowest rung needs, and a block below that floor is refused rather than drawn.** One row or one column for a `boxplot`, two rows or three columns for a `violin` — asymmetric because a terminal cell is about twice as tall as it is wide, so a vertical violin in two columns is four dot-columns split between the density and the box. **Below the floor there is no honest picture**: the density flattens to a bar and the figure says *this distribution is uniform*, which is a statement about the width rather than about the data, and nothing on screen distinguishes the two. **This is not C12 §3i's degradation and the subjects are different** — `plotDetail` asks which renderer fits the room there is, and answers by degrading; this asks whether the form has room at all, and a caller who has declared less has asked for a picture that cannot exist. **Only the row floor is refused here, and the reason is that a width is not a thing this component can see.** `validateBlock` takes a block and nothing else, and a terminal's width is handed down from `terminal/lifecycle.ts` — so `height` and the category count are in hand and the per-band *rows* are computable at construction, while the per-band *columns* are not. Both gates say the row floor: `b.plot` throws and `validateBlock` reports, as I50a and I50b already do. **The column floor is C12's, enforced by drawing the smaller figure rather than by refusing** — I18's precedent exactly: where the width cannot spare what a figure needs, the honest answer is the thing that fits, not an error the caller could not have avoided. *This was written as symmetry first and building it is what disproved that. A rule refused for one orientation and not the other reads as an oversight until the reason is stated, and the reason is that one budget is declared and the other is discovered.* C12 I34 is the ladder this is the floor of; C12 I33 is the figure at the lowest rung.

---
- **I57** — **A plot whose data is not a flat series carries a typed field for it, and `ohlc` is the third.** Four numbers per bar in a declared order — open, high, low, close — is a convention nothing checks, so four `Series` in an agreed sequence gives the first caller who transposes two of them a chart that renders and is wrong. `quartiles` (I53) and `hierarchy` (I54) are the precedents and the argument is theirs: a form whose subject is not *a list of labelled magnitudes* gets a shape rather than an encoding. **Overlay series stay optional and `series: []` is the ordinary case** — plain candles — with a non-empty `series` drawn over them on the shared axis, which is what a moving average is. **Three refusals at construction rather than three ignored members**, C04's established idiom in this exact type: `plotStyle: "candlestick"` with no `ohlc`; the style on a form that is not `line` or `step`; and an `OHLC` whose `low` exceeds `min(open, close)` or whose `high` is below `max(open, close)`, which is not a candle that renders oddly but not a candle. Both gates say all three, as I50a and I56 already do. *A construction throw leaves nothing behind, because it happens before any render state exists — which is the question every throw owes an answer to, answered here by when it fires rather than by what it cleans up.* C12 I36 is the style this is the data for.
- **I58** — **A plot's horizontal domain is declarable, and the sample index is what it falls back to.** `xMin` / `xMax` / `xFormat` mirror `yMin` / `yMax` / `yFormat` — the same optionality, the same independence, the same formatter vocabulary, for `BarSpec.format`'s reason: a second enum is a second place for the `fraction`/`percent` confusion to happen. **`Series.values` is a bare array, so there is no x coordinate anywhere in this type** and the abscissa a sample has is its index; absent a declaration the domain is `[0, n − 1]`, which is what `ax.plot(y)` labels and what the data has when nothing else was said. *This is not a second way to spell `xLabels`* — that field is three captions, the caller's own words at left, centre and right, and this is a scale; where both are present the captions win, because overriding what a caller wrote with what we inferred is the wrong direction. **Unlike `yMin`/`yMax` these do not clamp**, and the asymmetry is the axis rather than an oversight: a y pin bounds *values*, which may fall outside it and are held at the edge, while an x domain describes how the samples are *spread* — there is no sample outside `[0, n − 1]` to clamp. C12 I41 is the axis this is the domain for.
- **I59** — **`plotStyle` is a union every form shares and a record says which arms each form has; `plotFill` is the fill beside it.** The style's refusal was a clause naming `candlestick` and the form it needs — correct, and a special case, because every style is one some forms draw and others do not and a second would want a second clause. C12's `STYLE_ARMS` is that shape as data, total over `PlotForm`, and this side's refusal is one rule over it: a style a form has no arm for is a construction error, which is this type's idiom (I50a, I56, I57) and the reason an ignored member is not the answer — it reads as one not yet implemented. **`plotFill?: "none" | "solid"` joins `plotFrame` / `plotCorners` / `plotDetail` / `plotMarks`** as a union in that family, and it is **refused where the vocabulary cannot fill**: a box-drawing outline has no interior alphabet, so `plotFill: "solid"` with `plotStyle: "line"` is refused rather than ignored. *A capability the renderer must degrade for is C12's — a solid pie at one bit degrades to braille — and a combination the caller could have avoided is this side's, which is the same split I56 draws between the row floor and the column floor.* C12 I43 is the arms this is the field for.
- **I60** — **`yAxis` says which side the y labels sit on and `yCallout` puts a reading at the right edge, and both are refused where a form cannot honour them.** `yAxis?: "left" | "right" | "both" | false` and `yCallout?: "none" | "last"`, both costing **width and never a row** — the vertical legend's data-dependent kind (C12 I27), so C12 I1 is untouched. **Two total records answer *can this form take it*, and they live here rather than beside the renderer for `STYLE_ARMS`' reason**: the validator needs them and L0 cannot import L1 to ask (A02 §1). `HAS_Y_GUTTER` is **measured** — every catalogue fixture rendered at `axes: true` and asked whether any row carries an edge glyph past the first column, giving 32 of 42 — and the measurement corrected a guess in each direction: `smallmultiples` and `pairplot` *look* gutter-ed because a facet's own gutter shows in the frame, and a facet is a `Plot` that declares its own. `HAS_CALLOUT` is the seven forms that rasterise a per-series curve; **not `HAS_POSITION_AXIS`, which was the obvious reuse** and answers a question about the *abscissa* — it says `true` for `stackedarea` and `streamgraph`, whose rows are one figure cut into parts with no per-series ink to end. **Four refusals rather than four silences**: a non-`"left"` `yAxis` where there is no gutter, `yAxis: false` on a matrix (a row label *is* the ordinate — I50b's own argument, one field along), `yCallout` on a form with no curve, and `yCallout` with no right gutter to write in. *A field accepted where there is no arm reads as one not yet implemented, which is C12 I43's finding and F207's cost* (C12 §3x).
- **I61** — **A field form declares what is drawn over it, and every member outside that family is refused rather than ignored.** `form: "contour"` reuses `series` — one `Series` per grid row, so the row labels *are* the ordinate (C12 I18) and a bare `number[][]` would be a second spelling with no y axis. `form: "quiver"` cannot reuse it, because nothing on `Plot` carries two numbers per cell: `VectorSeries` mirrors `Series` and its `values` are `readonly [u, v] | null`, with `null` for a gap on I46a's argument — `JSON.stringify` writes `NaN` as `null` regardless, so the declared form should be the persisted one. **`layers` is an ordered array in which one entry's position is inert**: `field` cannot occlude, so its membership decides whether the field paints and its index decides nothing. `fieldDim` and `glyphInk` are two members and not one union, on `plotFrame`'s test — a single enum would make `"floor"` with `"contrast"` inexpressible, and neither makes the other meaningless. **A new total record `IS_FIELD_FORM`, not a reuse of `MATRIX_LAYOUT`**, which answers whether a form's columns are a time window — a question about the abscissa, and C12 I43's finding is a total record read as a complete answer to a question it cannot ask. Six refusals: `vectors` off `quiver`, `quiver` with none, the three field members outside the family, a `layers` entry naming a layer with no data, and `levels` off `contour` (C12 §3y).
- **I62** — **A plot's geometry is declared in six members, and each is refused where the form or the type cannot honour it.** `calendarUnit`, `origin`, `axisCross`, `width`, `aspect` and `align`. **The test that admits them is two-armed and only one arm was written down**: §3's *does it change the plot area* is **sufficient and never was necessary**, and `plotFrame`'s own comment holds the other — *a style field rather than a choice the framework makes for the caller.* `Plot` carried eleven members the day the first was written and carries forty-eight now; **thirty-seven landed after it, none cites it, and two of its four falsifiers are `Plot` members today**. `origin` and `align` are admitted by the second arm alone. **`calendarUnit` picks the cell and the grid falls out** — rows are the sub-unit, columns the super-unit, one statement over four layouts — and the span needs no member because `startDate` + unit + `values.length` fixes it, which is the reader `startDate` was published without. **No height refusal, because the matrix already says what it hides**: `matrixRows` draws `areaRows − 1` rows and spends the last on `+N more`, so a short calendar degrades into commitment 46 rather than into an error. **`origin` and `axisCross` are two fields on `plotFrame`'s test** — one enum would make `origin: "top-right"` with a crossing axis inexpressible. **`axisCross`'s refusal is by form and its suppression is by range, and this clause had both wrong** (C12 §3ad). *Refused where the range excludes zero* names an operation the gate does not have: the realised range comes from `seriesRange`, which is L1, and L0 cannot import it (A02 §1) — so the gate refuses what it can see, which is the form and a **declared** range, and the renderer drops the half it cannot place. **The precedent is I52 and not I29**: I29 clamps *data*, because pressing a reading against a ceiling is honest; I52 drops an *annotation*, because a claim moved onto a scale it is outside says the limit is somewhere it is not, and an axis is a claim. The mirror reading is right about the error and names the wrong invariant. *And where `HAS_Y_GUTTER` is false* **does no work**: `axisCross` is honoured on the seven forms `overlaidRows` composes, all of which have a gutter, so every refusal that clause could make is already a refusal by form — A03 §2's vacuity class, in an invariant rather than in a rule. **Seven of forty-four, a strict subset of `origin`'s fifteen**: a matrix has a corner and no zero, and only a form with a numeric ordinate *and* a numeric abscissa can say where they meet. **Not `HAS_POSITION_AXIS`** for the third time (I43's finding) — it holds `stackedarea`, `streamgraph`, `contour` and `quiver`, none of which reaches that composer. **`origin`'s refusal record is `ORIGIN_DEFAULT`, one total `Record<PlotForm, Origin | null>` carrying the acceptance set and the per-form default together**, and it was measured rather than reasoned (C12 §3ac). **The question this type asked was the wrong one**: not *does the form have two reversible directions* but *which machinery places the data* — 7 positional, 10 matrix, 11 categorical, 14 own renderers, 2 facet containers — and `origin` is honoured on the positional family and eight of the ten matrix forms, **15 of 44**. `contour` and `quiver` are the two the implementation removed after the record was written: a field form carries a second placement in a second coordinate space, and no walk artefact reaches that. The three guessed refusals survive and none for its guessed reason; `bar` refuses and was not guessed, with its condition named as a symbol (`categoricalForm`'s per-form `rowBuilder`). The two families default to different corners — `"bottom-left"` for a curve, `"top-left"` for a matrix, because a row index grows downward — and a facet container refuses because its `origin` would name which corner the first *facet* sits in, a different member sharing a word. **Not `HAS_POSITION_AXIS`**, which answers a question about the abscissa where this one is about direction (C12 I43's finding, third instance). **`width` and `aspect` are mutually exclusive**, `aspect` is the arm that knows `CELL_ASPECT` and **does not pay `squareRows`' deferral** — it derives a width from a declared height, which is `squareColumns`' direction and the only one C12 I1 permits, so the deferral stands owed (§3, C12 §3ab). *This clause said it paid, and the retraction reached §3 and C12 §3ab and not the invariant they are the body of* — F89's mechanism, in the document that records it. `align` is refused without one of them (F207), and **the validator refuses only what it can see** — finite, positive, integral — because C04 has no terminal width and a bound it cannot measure is a fact it does not hold.
- **I63** — **A series may name individual samples, in an array parallel to `values`, and the member is refused where a sample is not drawn at its own value.** `pointLabels?: readonly (string | null)[]` — parallel rather than keyed, because `Series.values` is a bare array and the abscissa a sample has *is* its index, so a record would be a second way to say *which sample* and the two could disagree; `null` is *no label here*, so a sparse set needs neither a length nor a sentinel. **Longer than `values` is refused**: an entry past the last reading names a sample that does not exist, which is a document asserting something about nothing rather than a harmless extra. **Refused where `HAS_CALLOUT` is false, and that record is the right one rather than a convenient one** — it partitions the forms whose sample is drawn at *its own value*, and a `stackedarea` or `streamgraph` draws sample *j* at a cumulative height, so a label placed from `rowOf(value)` would name a row the sample is not on. That is the same fact the callout was excluded from those forms for, so this is a second consumer of one partition and not a record borrowed for a different question (C12 I55, §3ag).
- **I64** — **A field that carries a shape is checked like one, and `hierarchy` was checked like nothing.** `validate.ts` did not contain the word: a node that is the number `42`, a `children` that is the string `"nope"`, a node with no `label` writing those nine letters into a frame as a tile's name — all accepted at both gates, and two of the six shapes measured reached `[plot failed to render]`, which is C09 I11's containment rather than luck (F221). **It survived because `hierarchy` is a shape and not a member**, which is I54's own argument — *one field for three forms rather than three shapes* — and a gate written member by member has nothing to hang a clause on. Every other typed field on `Plot` is a flat list or a small record, so its clause is one line and got written; a recursive shape needs a walk, and the type carries the whole claim while a document does not typecheck. **Every node is an object with a string `label`, `children` is an array where present, and `value` is a finite non-negative number exactly where the form's subject is magnitude** — `flame`, `icicle`, `treemap` — **and optional where it is not**. `value` becomes optional on `HierarchyNode` for `tree`, whose figure is placed by structure alone: a required number every caller of that form must invent is worse than a member that does nothing, because a member that does nothing can at least be left out. **The depth is bounded and the bound is not what this is for** — a chain 3200 deep satisfies every rule the type states and is refused by the stack, the treemap failing between 1600 and 3200 and the flame between 3200 and 6400, which is the two walks' frame sizes rather than anything about the data. 256 is an eighth of the lower figure and deeper than any call stack a profile prints, and the bound exists because **a gate that walks a recursion must terminate it** rather than because anybody's data is deep. **Breadth is not bounded**, and the asymmetry is the reason: a node with ten thousand children degrades to ten thousand zero-width strips, which is a figure saying *too many to draw* and not a throw.
- **I65** — **A tree's layout is a member, and it was measured rather than reasoned about.** `treeLayout?: "auto" | "topDown" | "leftRight" | "outline"`, refused on every other form. **The three are not a ladder**: over four trees the top-down figure is the cheapest of the three in rows on a broad tree (3) and the dearest on a deep one (13) while its columns invert with it, so no ordering by budget exists — not even one depending only on the budget, since which layout is cheapest depends on the tree — and all three draw the same names and the same edges, which is C12 I34's own test for a rung failed three times in the same way. So `plotDetail` is refused on the form and this member carries the choice, on C12 §3w's ruling that a styling fork ships every option rather than asking which one. **A second member rather than one shared with a future `graph`**, because the value sets do not overlap: sharing would make a six-value union with two per-form refusal lists, which is a larger artefact and a worse message than two members each refused off everything but its own form. **`"auto"` is a fit**, the first whose natural size fits both axes and otherwise the one that keeps the most nodes; a named layout is honoured whatever the budget and the drawing is truncated rather than overflowing, exactly as an explicit `plotDetail: "full"` degrades (C12 I28). **And `hierarchy` stops being optional on this one form**: the three magnitude forms have something to fall back to — two draw their series and the third its empty message — and a form whose whole subject is the shape has nothing, so its absence is refused at both gates rather than drawn as an empty message. **The values are restated in `validate.ts` and held in `tree.ts`**, which is L1 and cannot be imported from L0, so the two must agree and a row asserts it rather than deriving one from the other.
- **I66** — **`status` carries the state and the three numbers that describe it, and every one of them is supplied rather than derived.** The kind exists because only one of its three states is knowable where the block is drawn: L1 catches a throw and knows `error`, and *never fetched* and *backing off* are facts held by the builder and the refresh driver two layers up (C09 §3a). So the state travels in the block. `retryInMs`, `attempt` and `elapsedMs` are optional and **never computed from `ctx.tick`** — C03 coalesces and drops commits under load, so tick is not in a fixed ratio with wall-clock, and the layer that draws may not read a clock; `retryInMs` already arrives this way and the other two follow it rather than opening a second route. **`height` is required**, on `plot`'s argument: a box the framework sized by guess is silently wrong and nobody notices it is wrong. **An empty `message` and a non-positive `height` are construction errors naming their field** (I57) — a box that says something failed and not what is the objection C09 §3a's three-row rung already makes about dropping the rule.

- **I67** — **`minHeight` is a floor a layer above sets, written only by `op: "reserve"`, and refused on an inbound document.** It is applied by the registry outside every definition — `max(definition.measure(b, w), b.minHeight ?? 0)` — so no kind reads it, C09 I2's purity is untouched, and `scroll`'s argument that its residue is a function of `(block, width)` and never of view state is not reopened (§3c, §3d). The render pads to the floor and never bounds it, so C09 I1 holds by construction rather than by the two sides agreeing. **An empty `group`'s legitimate zero gives way to a floor**, deliberately: a block that failed and shows nothing is absence indistinguishable from failure.

- **I68** — **A floor survives only while the block is untouched.** `replace`, `merge`, `expand` and `window` each produce a new block from an old one and none carries `minHeight` — `replace` because it is wholesale, `merge` and `expand` because the content the floor was raised for has changed, and `window` by not windowing a floored block at all — the identity C09 I26 states is about rows a definition can produce, and a floor's rows are the registry's. Nothing watches a condition and nothing needs to. **The floor can outlive a change to something else** — a renderer that threw at one width may not throw at another — and that is a stated limit rather than a defect: the cost is blank rows under a block that already failed once.


## 7. Commitments

1. `ViewDocument` is a pure, deeply immutable value with no reference to Ink, terminals or the network (I1).
2. Seventeen block kinds ship; the union is open and extended through C09's registry (→ C09 I13).
3. `raw` renders anything, so the vocabulary is never blocking (→ C09 I10).
4. View state that affects height lives in the block (I18).
5. Blocks name palette slots and glyph slots, never values or characters; `error` and `warn` tones carry glyphs (I5, I6).
6. Only `message` is required on `ErrorLike`; Prism's envelope is a specialisation (I28).
7. `fill` is the default action; `exec` is reserved for reversible operations (I19).
8. `applyPatch` is pure; `merge` upserts by row id and preserves untouched rows (I8, I9).
9. `measure(block, w)` equals rendered height at width `w`, and is pure and total (I7).
10. `Glyph` is a closed vocabulary, which is what makes capability substitution a total guarantee rather than a mostly-true one — a free-string field would leave every unlisted character unsubstituted. The substitution itself is **C09's** and width-preservation is C09 I5: C04 cannot fail when a renderer breaks it (→ C09 I5).
11. C04 owns the schema — **every** block variant is declared here; C09 owns the registry, C11 the table engine, C12 the plot renderer, C25 the patch renderer (I11).
12. The schema identifier is framework-named `tui.view/1`. Calcium ships nothing Prism-branded (I2).
13. A `pills` block is one logical row; multi-row pill layouts are multiple blocks (I20).
14. Substitution is 1:1 by column count, so a degraded frame occupies the same cells as an undegraded one (→ C09 I5).
15. `validateDocument` and `validateBlock` are public, total, and the single enforcement point for I3 (I3, I4).
16. Schema version is `tui.view/1`; mismatch is refused at the boundary (I2).
17. A column may declare `role: "expand"`, which is presentation intent rather than view state (I32).
18. Row ids are unique within their table, checked where block ids are (I31).
19. A column may declare which end it truncates from; the default keeps the start (I30).
20. A plot may pin its vertical range; out-of-range values clamp rather than escape (I29).
17. `meta` carries the invocation record — `argv`, `stderr`, `transport` — so any inspector can answer what actually ran without re-running it (I28a, D49).
18. `meta.origin` is required and always set by C23. Provenance that can be absent is provenance nobody trusts (I13).
19. `status: "proposed"` ships reserved and unused, and no adapter produces it. Deciding the shape now costs a field; deciding it later costs a `tui.view/2` bump (I12).
20. `patch` and `comparison` are separate kinds. One is field rows, the other is text hunks, and merging them makes measurement depend on a mode flag (I33, D50).
21. `applyPatch` returns a `PatchResult` and never throws. Four failure cases, each named, each leaving the input document untouched (I15).
22. Block ids are unique within a document, and `validateDocument` is where that is established (I14).
23. `merge` never deletes a row; `replace` is how a table sheds one, and the adapter decides which it means (I21).
24. `replace` is wholesale — view state is not carried across it (I22).
25. A `merge` payload cannot carry view state, by type rather than by rule (I16).
26. Container widths are declared: `panel` and table detail at `w - 2`, a `column` group at `w`, a `row` group at an equal split. No weights field until a surface needs one (I23).
27. Every measurer returns at least 1 for a present block (I17).
28. `form: "line"` requires `height`; there is no default (I24).
29. C04's constructors enforce the shape invariants and C24's `b` delegates to them. One enforcement point for I1 (I1).
30. `validateDocument` terminates on a cyclic structure, via a path-scoped seen-set (I27).
31. `Result` is declared once, in C04, and nowhere else in the tree (I26). Enforced by SS35, which existed before this commitment did — a build gate with no contract behind it, found by tracing the citation graph.
32. A `view` action's `target` names a block within its own document and nothing wider; the refusal when it does not resolve is C23's (I34, → C23 I31).
33. A categorical axis other than `Tone` is a marker or a word with a renderer-derived tone, never a second palette and never a colour a producer supplies. Four surfaces found the boundary independently; three of them got it right unaided, which is the argument for naming the pattern rather than widening the vocabulary (I35).
34. `Comparison` carries change and judgement in separate fields, because the renderer has always rendered them as separate axes (I36).
35. D29's sweep exempts a kind for the fields it has, and the exemption is re-read when the fields change — the compile-time guard sees a new kind and is blind to a new field (I37).
36. A mark is derived from a named fact. Where a shape names one, no field is added; where it names only a tone, a glyph slot is the remedy and it waits for a surface. Two of seven tone-bearing shapes carry a slot, and that asymmetry is a ruling rather than an oversight (I38).
37. A panel says whether it is live, and C09 draws the slot that has existed unreachable since C04 was written (I39, → C09 I5).
38. A comparison may name its two columns; absent, they are positional. The type's `a`/`b` was the right answer to a different question (I40).
39. **A row group's weights state everything the equal split made invisible** — the gutter off the top, the remainder leftmost, zero and mismatched lengths refused, placement by position — and equal weights reproduce the current arithmetic exactly (I42, §3).
40. **Weights and nesting are both kept**, because the equivalence §3 deferred weights on holds only while every child fits, and the floor's degenerate boundary is reachable at ordinary widths once shares are uneven (I43, §3).
41. **A share is a weight or a cell count**, fixed satisfied before weighted and placement unchanged — so a declared width is exact where it fits and is dropped like any other child where it does not (I44, §3).
42. **A row aligns in its own height and measures the same either way** — and the vertical one is what the banner's blank first row was doing by hand (I45, §3).
43. **A document is JSON, so persistence needs no codec** — and the validator refuses what JSON cannot carry, finite numbers included and numeric array elements with them, because a document that round-trips into a *different valid document* is worse than one that is refused (I46, §5a).
44. **A `scroll` is a box of declared height holding children**, its elements are one per child, and an empty one is a construction error rather than a container nobody can aim (I47, §3c).
45. **The offset is view state in rows** — droppable, per container, clamped at read, restored by no resume, and frozen once the entry settles (I48, §3c).
46. **A bounded region says what it is hiding** — both directions, one row, and the row is spent on a property of the block rather than of the view (I49, §3c).
49. **`null` is a gap in a numeric array** — the one non-number a document may carry in a numeric position, because it is the only spelling of *no reading* that survives the round trip the serialiser already performs (I46a, C12 §6a).
51. **A quantity against a scale is not progress toward a total** — `Cell.bar` draws the first and `progress` the second, and an app that had only the second hand-wrote the first (I50c, FINDINGS gap 3).
52. **A label and a quantity is a `keyValue` row, not a two-column table** — a column claims its cells are one kind, and a panel whose rows are a percentage, a byte pair and a count has nothing to align or sort by. The bar sits beside the value and declares its own width, because a `keyValue` value is a remainder where a column is a width (I51).
53. **An annotation is a claim about the ordinate, not a form** — six named chart types are folds of two kinds, a band is two edges rather than a fill, and an edge off the scale is dropped where a sample would be clamped (I52, C12 §3e).
48. **A plot carries at most eight series** — the categorical palette's size, refused at construction rather than cycled, because a repeated colour is a segmentation that lies (I50a, roadmap 51).
50. **A heatmap refuses what has no meaning for a matrix** — a row tone, `axes: false`, and rows of differing length — rather than ignoring it, because an ignored member reads as one not yet implemented (I50b, C12 §6a).
47. **A copy is not bounded by the box that hides it** — the container's `copy` is its children's sources joined, unchanged by the offset, and a kind with no expressible source contributes nothing rather than its rendering (I50, §3c).
54. Eight forms the survey named and the union never carried, each a fold of existing machinery (I54 for the three that are not).
55. `QuartileSummary.mean`, drawn with its own mark so two centres never share a glyph (I53).
56. Every style field is a literal union, generated alongside its data where the values are generated (I55).
58. **A plot whose data is not a flat series gets a typed field** — `ohlc` is the third after `quartiles` and `hierarchy`, because four series in a declared order is a convention nothing checks and a transposed pair renders (I57).
59. **A plot's horizontal domain is declarable and falls back to the sample index** — `xMin`/`xMax`/`xFormat` mirroring the y trio, with the caller's captions winning the row where both exist, and no clamping because there is no sample outside `[0, n − 1]` to clamp (I58).
60. **A style is refused where the form has no arm for it, and a fill where the vocabulary cannot fill** — one rule over a total record rather than a clause per style, with the capability degradations left to C12 (I59).
61. **`yAxis` and `yCallout` are refused where a form cannot honour them** — two total records, one of them measured rather than reasoned, and four refusals in place of four silences (I60, C12 §3x).
62. **A field form's members are refused off the family, and the one that could not be reused says why** — `contour` takes the matrix family's `series` and gets its ordinate free; `quiver` takes a new `VectorSeries` because two numbers per cell had no spelling, and a total record answers *is this a field form* rather than a record that answers a different question about the same forms (I61, C12 §3y).
57. **A distribution form's lowest rung is a floor, not a preference** — below it the figure states a property of the room and not of the data. The *row* floor is refused here because `height` is declared; the *column* floor is C12's, because a width is discovered rather than declared (I56).
63. **A plot's geometry is six declared members and the test that admits them has two arms** — changing the area is sufficient and never was necessary, `origin` and `align` pass on the caller's-alone arm alone, and every one is refused where the form or the type cannot honour it (I62, C12 §3ab, C12 §3ac).
64. **A field that carries a shape is checked like one** — `hierarchy` is walked at both gates, `value` is required exactly where the form's subject is magnitude and optional where it is not, and the depth is bounded because the walk that draws it recurses (I64).
65. **A tree's layout is a member and not a rung** — measured over four trees rather than ordered, because the cheapest layout depends on the tree and not on the budget; `"auto"` is a fit, a named layout is honoured and truncated, and `hierarchy` is required on the one form with nothing to fall back to (I65).
66. **A state only a higher layer can know travels in the block, not in a rendering mode** (I66). `status` is one kind for three states because the alternative is a registry reading upward for two of them; the numbers that describe those states are supplied by whoever holds the clock, since the animation counter cannot carry a duration and the drawing layer cannot read a clock.
67. **A height discovered too late is deferred rather than forced** (I67, I68). The frame that finds the need completes single-pass at the committed height and the next frame honours the floor, because nothing re-enters the layout; the request is idempotent state rather than an event, so it terminates without a rule forbidding a second one, and it clears without anything watching a condition.

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
- **T1.16** (I31): `validateDocument` rejects a table with two rows sharing an `id`, and accepts the same ids used in two different tables. Row ids are unique within their table, not across the document — a block id and a row id are different namespaces.
- **T1.19** (§3): constructing a `plot` with `form: "line"` and no `height` throws; `sparkline` without one does not.
- **T1.17** (I27): a document whose `panel` contains itself is refused by `validateDocument` with a named error, and the call returns. A shared-but-acyclic subtree appearing twice validates — the seen-set is path-scoped, and a global one would fail this.
- **T1.18** (I1, §4b): C24's `b` produces blocks frozen exactly once — the constructor is the only freeze point, asserted by spying on it.
- **T1.20** (I42): a weight of `0`, a negative, a non-finite, and a list whose length does not match the children — each refused at construction with a named error. **Four values in one row**, because the field's whole risk is a number that reads as meaningful and means two things.
- **T1.21** (I66): `status` with an empty `message` and with `height: 0` are refused at construction, each naming its field; a valid one round-trips every optional member.
- **T1.22** (I66): the three optional numbers survive a `ViewDocument` round-trip and **none of them is present on a block the registry built for a thrown renderer** — the error path knows the height and nothing else, so a defaulted `attempt` would be a number nobody measured.

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
- **T2.11** (I34): `validateBlock` accepts a `patch` carrying a `view` action whose `target` is one of the document's own block ids, and the `Action` union's five kinds are exhaustive over the validator — a sixth added without validation fails the build, exactly as T2.10 does for `Block`. The pairing is what makes the union closed rather than open with four entries written down.
- **T2.10**: every member of the `Block` union is exhaustively handled by the validator — adding a kind without validation fails the build. *(Registry completeness — that every kind has a registered measurer and renderer — is C09's test, since C09 owns the registry.)*
- **T2.18** (I46, §5a): the round trip, over `ONE_PER_KIND` and `ADVERSARIAL` — `validateDocument(JSON.parse(JSON.stringify(d)))` is valid and structurally equal to `d` for every fixture, and the row **asserts how many it ran**, because a sweep over an empty corpus is the same green as a sweep that passed.
- **T2.19** (I46, §5a): the fabricated failures, which is what makes T2.18 worth running — a plot series carrying `NaN`, one carrying `Infinity`, and a `Cell.spark` carrying a string are each **refused by the validator**, and the first two were accepted before *and after* a round trip that silently rewrote them to `null`.
- **T2.29** (I64) — `HG1`–`HG4`: the six shapes F221 measured are refused at **both** gates, each by the fault it names — a node that is not an object, one with no `label`, one with no `value` on a magnitude form, a negative magnitude, `NaN`, and a `children` that is not an array. **The message names the path to the node** (`hierarchy.children[0].children[0].value`) rather than the block, because a tree is malformed in one place; the walk stops at the first fault for the same reason. **The 256 bound is asserted on both sides** and on a **cyclic** object graph, which a builder call can hand over and a document cannot — that being what the bound is for rather than any depth anybody's data has. And the constructor's message is asserted to be the validator's, which is what *one walk read by both gates* means: a one-line predicate written twice can be compared by eye and a recursive walk cannot.
- **T2.30** (I64) — `HG2`, `HG5`: `hierarchy` on a form that reads none is refused at both gates, with the count asserted at **41 of 44** so the row cannot pass against a record that is `null` everywhere; the three that read one accept it; **absent is accepted on all forty-four**, which is the row that records why the field went unchecked. **And the record is asserted against the frames, not against a restatement of itself**: every form is rendered twice, with and without a hierarchy, and the set that moves must be exactly the three. Rendered directly, which is the third path — a fixture reaches the renderer without passing either gate (C12 I2).

### Tier 3 — edge cases

- **T3.25** (I57): `plotStyle: "candlestick"` with no `ohlc` is refused; on `form: "pie"` it is refused; and an `OHLC` whose `low` is above its `open` is refused. Both gates — `b.plot` throws and `validateBlock` reports — and the message names the field rather than the block.
- **T3.26** (I57): `ohlc` with `series: []` validates. **The row that says the ordinary case is legal**, since every other refusal here is about a member that should not be there and this one is about a member that need not be.
- **T3.49** (I67, F231): **`validateDocument` refuses `minHeight` and `expanded` on an inbound document, in one check over the set.** Two rows in one because they are one rule — a field a named op writes is refused on the way in — and F231 is what says the second was missing: measured, a document carrying `expanded: true` validated and its table measured **3 against 2**.
- **T3.50** (I67): `op: "reserve"` sets the floor and takes the maximum against what is already there; a `reserve` naming an unknown `blockId` **fails**, on the same argument as `replace` and `merge`.
- **T3.51** (I68): `merge`, `expand` and `replace` each produce a block with **no** floor. Asserted on all three, because the reason differs per op and a single case would pass on whichever one happens to rebuild the block wholesale.
- **T3.52** (I68, → C09 I26): a windowed piece carries no floor, and the identity `measure(w.block, w) − skipRows === to − from` holds for a block that had one.

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
- **T3.16** (I42, §3): **equal weights measure identically to no weights**, at every width in the corpus and for two, three and five children. The row R4 exists for: a gutter taken proportionally is right at every equal split and wrong at every uneven one, so nothing but this comparison distinguishes the two rules.
- **T3.17** (I42): a `[2, 1]` row at 80 — shares of 52 and 26 after one gutter cell off the top, the leftover cell unspent, and each child measured at its own width. Asserted on the widths handed down, not on the resulting height: two allocation rules can produce one height and differ on which child was narrow.
- **T3.18** (I42, §3): a weighted row too narrow for every child places **left to right** and drops the last, whatever the weights say — asserted with the largest weight last, which is the arrangement a by-size rule would place first.
- **T3.19** (I43, → C09 §4b): `[50, 1]` at 80 columns puts the second child at the 1-cell floor, and the same three children nested as `group(row, [a, group(row, [b, c])])` drop differently at a width where both overflow. **The row where the deferral's equivalence ends**, and it is the pair of assertions that says so rather than either alone.
- **T3.20** (I44): `[{cells: 40}, 1]` at 105 and at 120 — the first child is **40 both times**, and the second takes what is left. Asserted at two widths in one row, because a fixed width that is right at one width and drifts at another is exactly what a ratio does, and a single width cannot tell them apart.
- **T3.21** (I44): declared cells wider than the budget — the fixed child is **not** privileged at placement, and the row places left to right as it does with weights. Asserted with the fixed child **last**, which is where a fixed-first placement rule would keep it and this one does not.
- **T3.22** (I45): a seven-row child beside an eight-row one, aligned `bottom`, renders identically to the same child with a blank row written into it — **the banner's own hand-alignment, expressed by the container**. And `top` reproduces the unaligned rendering byte for byte, so the default is asserted rather than assumed.
- **T3.23** (I45): alignment measures identically to none at all, over every width in the corpus. The row that says position is not size.
- **T3.24** (I46, §5a): the two tolerated inequalities, asserted rather than assumed — a block carrying `-0` round-trips to `0` and stays valid, and a property whose value is an explicit `undefined` loses the key. Both are stated in §5a; a row is what stops them being rediscovered as defects.
- **T3.13**: `applyPatch` with a `merge` carrying an empty row array → `{ok: true}`, document unchanged.
- **T3.13b** (§4): a `merge` whose payload omits half the existing rows → every omitted row survives. Absence is not deletion.
- **T3.14**: a document at the 10,000-block cap (D40) → validation flags `truncated`, and measurement of the whole set completes within budget.
- **T3.15** (I27): circular structure passed as a block → refused by the validator rather than hanging the measurer.

### Tier 4 — integration

- **T4.1** (with C07): a fallback-adapted arbitrary JSON object produces a valid document that passes every T2 contract test.
- **T4.2** (with C09): registering a custom block kind adds it to the T2.1 corpus automatically — the generic suite discovers it rather than being extended by hand.
- **T4.3** (with C13): appending fifty documents and applying two hundred patches leaves every document valid and frozen.
- **T4.4** (with C14): virtualisation over a 10,000-block transcript selects a visible range whose summed measured heights equal the viewport height, exactly.
- **T4.5** (with C14): expanding a row mid-transcript changes measured height and shifts subsequent blocks by exactly that delta — no drift.
- **T4.49** (I67, I68, with C09 and C22): **a `rule` whose renderer throws draws one row, then three, and the block after it is on the frame in both.** Read from a session's frame rather than from a count — the second frame is the whole subject and no arithmetic shows it.
- **T4.55** (I68): a far-side patch replacing the block between the frame and the request **discards the request**. Without it the shell floors a block that never threw, addressed by an id the far side has just reused.
- **T4.6** (with C10): the same document rendered under both themes produces identical line counts.

### Tier 5 — e2e

- **T5.1**: a real session scrolls a 10,000-block transcript top to bottom; every block's on-screen row count matches its measured height, sampled at every screenful. The drift test.
- **T5.2**: the same, at four terminal widths, with resize between passes.
- **T5.3a** (C14 I4): a live stream appending above a **detached** viewport does not move it. The control has to come *after* the claim: the lines that arrive while detached are never drawn — which is the property — so counting them in the captured bytes cannot work, and the stream's advance is read from the bottom once the view is re-attached.
- **T5.3b**: the same with `merge` patches → an expanded row stays expanded and stays put. **Split from T5.3 rather than left bundled**, because the two halves have different blockers and the append half was reachable while waiting behind the other. What the merge half needs is a patch that is not an append: the default stream adapter maps every `data` patch to `op: "append"` (`src/data/adapters/stream.ts`), and `op: "merge"` is reachable only through an app adapter's `adaptPatch`. So two harness parameters — a registered adapter mapping a far-side line onto an existing table row, and a streaming verb that emits rows rather than notices.

### Tier 6 — fail-on-revert

- **T6.1** (I7): a measurer that under-counts wrapped lines by one → T2.1 fails at the width where wrapping begins.
- **T6.2** (I7): a measurer that ignores the `expanded` flag → T3.12 and T4.5 fail.
- **T6.3** (C10): an ASCII fallback glyph of a different width → T2.6 fails.
- **T6.4** (I9): a `merge` that rebuilds every row → T1.6 fails on reference identity, catching the viewport-jump regression before anyone sees it.
- **T6.5** (I1): returning a mutable block from any constructor → T1.1 fails.
- **T6.73** (I68): a `merge` that carries `minHeight` through → T3.51 fails. The block keeps a floor raised for content that has gone, and pads under rows that are no longer the ones that failed.
- **T6.74** (I67): `validateDocument` accepting `minHeight` inbound → T3.49 fails. This is F231's defect restored on the field that has not shipped with it yet.
- **T6.6** (I5): adding a `colour` field to any block → T2.7 fails.
- **T6.7** (§1): moving the registry into C04, or importing theme into `viewmodel/` → T2.9 fails.
- **T6.8** (I3): allowing `error` on an `ok` document → T1.2 fails.
- **T6.9** (I10): adding an assembly-only block representation → T5.3 fails as a partial document renders differently mid-stream.
- **T6.10** (I15): making `applyPatch` return a bare `ViewDocument` again, absorbing the four failures → T1.12 and T1.14 fail, and C23 loses the mechanism its §5 depends on.
- **T6.11** (I16): typing the `merge` arm as `TableRow[]` → T1.8b fails to compile, which is the point: the guard is the type, not the runtime.
- **T6.12** (I14): dropping the uniqueness check from `validateDocument` → T1.15 fails, and T1.12's duplicate-id case stops being reachable.
- **T6.13** (I31): dropping the row-id uniqueness check → T1.16 fails, and `merge` upserts into whichever duplicate it reaches first while focus and the render key point at the other.
- **T6.17** (I27): swapping the path-scoped seen-set for a global one → T1.17's shared-subtree half fails; removing it entirely hangs T3.15 rather than failing it, which is why T1.17 asserts the call *returns*.
- **T6.14** (I17): removing the `max(1, …)` floor → T3.6b fails at all three kinds.
- **T6.15** (§3): giving a `row` group's children the full width → T3.6c fails, and T2.1 fails at every width where a child wraps.
- **T6.20** (I42): taking the gutter proportionally rather than off the top → T3.16 fails and T3.17's shares move by a cell. **Equal splits agree under both rules**, which is why the failing row is the one comparing weighted to unweighted rather than any row about a weighted layout.
- **T6.21** (I42, §3): dropping by size rather than by position → T3.18 fails. Every assertion about a row that fits still passes, because the two rules are the same rule until the budget runs out.
- **T6.22** (I42): accepting a `0` weight → T1.20 fails, and a value with two readings and no use enters a published type.
- **T6.23** (I44): computing the weighted shares over the whole budget rather than over what the fixed children left → T3.20 fails at both widths, and a cell count becomes a suggestion.
- **T6.24** (I44): placing fixed children before the others → T3.21 fails, and the rendered set depends on a declaration rather than on the order the author wrote.
- **T6.25** (I45): defaulting the vertical axis to `bottom` rather than `top` → T3.22's control fails, and every existing row group moves its short children without anything asking it to.
- **T6.26** (I45): adding the alignment offset to the measured height → T3.23 fails, and a row's height stops being its tallest child.
- **T6.27** (I46): dropping the finiteness check back to `typeof === "number"` → T2.19 fails, and `NaN` persists as `null` under a validator that agrees twice.
- **T6.28** (I46): checking that a numeric array *is* an array without checking its elements — the state that shipped → T2.19 fails on `Cell.spark`.
- **T6.29** (I64): eleven mutations in `c04-hierarchy.mjs`, all caught — each clause of the walk dropped in turn (→ `HG1`), the bound removed (→ `HG3`), the form refusal removed (→ `HG2`), and the path replaced by the block's (→ `HG1`). **The eleventh is the one HG5 exists for**: the treemap stopping reading its own hierarchy → `HG5` fails and nothing else does, because a record mutated in `types.ts` is invisible to a row that reads frames and is caught by `HG2` instead. The two rows are not one row. *The guard it mutates appears twice in `definition.ts` verbatim, so the anchor is the function it sits in — F219's class, one commit after it was filed.*
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
