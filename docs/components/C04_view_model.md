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

type Series   = Readonly<{ values: readonly number[]; label?: string; tone?: Tone }>;
type Plot     = Readonly<{ kind: "plot"; id: string;
                           form: "line" | "sparkline";
                           series: readonly Series[];
                           height?: number; axes?: boolean;
                           xLabels?: readonly [string, string, string];
                           yFormat?: "number" | "fraction" | "percent"
                                   | "bytes" | "duration";   // the unit IN, not OUT (I41)
                           yMin?: number; yMax?: number;      // pin the range (I29)
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
  | "expand" | "collapse" | "live" | "bullet";
```

**The identical argument.** A glyph embedded in a block is the same character on every terminal, has no fallback at `unicode: "ascii"`, and cannot be width-checked at load. `glyph: "✗"` is `colour: "#c0ffee"` written in a different field.

It is also the argument commitment 10 already makes and could not keep. **Every capability-driven substitution is 1:1 by column count** — but C09 can only guarantee that for glyphs it owns, and while the field is a free string an app supplies whatever it likes and C09 emits it verbatim. The guarantee was therefore mostly-true, which is worse than a narrow one: it holds for the box drawing and the spinner and silently does not hold for the thing an adapter wrote, and the failure appears only under `LANG=C`, only for the users who cannot report it precisely.

The evidence that this drifts is not hypothetical. Before tokenisation the tree contained `✗`, `✖`, `*`, `+` and `▲` in glyph positions, in five files, for three roles.

C09 §4 owns the vocabulary and both renderings, and the 1:1 rule holds by construction rather than by review.

**The escape hatch, stated so that the guarantee stays absolute:** a glyph outside the vocabulary goes in the block's **text**, not its glyph field, and its behaviour under ASCII is the app's problem. That is where every action label already lives — `↗ open`, `⊘ cancel`, `⬡ pods` are text in a label, not glyph slots — and it is why the surfaces need no change. A vocabulary with an "or any string" arm is not a vocabulary.

**`working` is in the list because S11 and S15 illustrate it** and nothing else covers it: `◐ connecting`, `◐ mlflow starting`, `◐ layers installing` is a fourth state beside `pending` (not started), `running` (steady) and `queued`. A token missing from the type is a surface that cannot be built, so the list was checked against the illustrations rather than reasoned out. `info`, `cancelled` and `bullet` are the other direction — no surface illustrates them today. They ship anyway because adding a token later is additive and cheap while a renderer meeting an unrepresentable state is not, and because `info` is already a `Tone`.

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

## 3c. The scroll container — a declared height, and an offset that is not the block's

Roadmap 46's kind, and **C26 §4b's cell 3 gets its first inhabitant**: the one kind declaring
both `elements` and `window`. That cell was ruled while empty, which is what made it cheap to
get wrong, so this section is the ruling meeting a subject.

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
| 7 | *a scroll among another's children* | **Legal and flat.** One element per child, and a child that is a scroll is one stop: `↓` steps *to* it and entering it is C26 §4's scope stack, which is unbuilt. Recorded rather than refused, because the flat reading needs no rule and refusing needs one |

#### The sequence trace — interactions something has to happen for

| # | the sequence | ruling |
|---|---|---|
| 1 | focus enters, then `↓` past the last visible child | the offset advances until the child's **last** row is inside the box; **a child taller than the box aligns to its top**, which is the only answer stable under a second `↓` |
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
- **A row the container adds when its content cannot fit**, which depends on `(block, width)`
  alone: `measure` returns `height + 1` where the children measure taller than `height`, and
  `height` where they do not. **Pure in `(block, width)`, stable under every offset**, and the
  same conditional shape as C11's action bar — which adds two rows on a property of the block
  and never on a property of the view.

So `height` is the **content** height and the marker is chrome the container adds, exactly as a
panel's border is. **The glyph comes from C09's table and is never written as a literal**
(I38's argument, and F6 is the instance): `⋯` degrades to `...` under ASCII like every other.

---

## 4. Patches

**Four ops carry data and one carries view state, and that split is the whole reason the fifth exists.** `append`, `replace`, `merge` and `status` all say *something arrived or changed on the far side*. `expand` says *the reader opened a row*. C13 gates the first four on an entry still streaming (C13 §6) — a settled stream can receive nothing more — and the gate is wrong for the second kind: expansion is exactly what a reader does to a **finished** table.

Expressing it as `replace` was the first draft and it fails on that gate: an app verb's result is settled the moment it lands, so every entry worth expanding rejects the operation. C11 T4.7 and C25 I11 both say expansion reaches a *frozen* entry, which is true and insufficient — frozen and settled are different states, and only the first still accepts patches.

A `viewState: true` flag on `replace` was the smaller change and is the worse one: it leaves one op meaning two things, and an adapter could set it to slip data past the gate. A named op is unambiguous at the call site and unforgeable at the boundary — the same argument as `settle(id, doc)` over a fourth patch op, one layer down.

```typescript
type ViewPatch =
  | { op: "append";  block: Block }
  | { op: "replace"; blockId: string; block: Block }
  | { op: "merge";   blockId: string; rows: readonly MergeRow[] }
  | { op: "status";  status: ViewDocument["status"] }
  | { op: "expand";  blockId: string; rowId: string; expanded: boolean };

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
- **I47** — **A `scroll` declares a positive integer `height` and at least one child, and both are refused at parse.** Its elements are **one per child**, so *no elements* and *no children* are one fact and the aimability rule is expressible where the validator lives (§3c cell 5). `measure(block, width)` returns `height`, plus I49's residue row where the content cannot fit — and **the same value at every offset**, which is the property that matters: the box does not change size as the reader scrolls, which is what keeps the offset out of every geometry cache and out of C14's index (§3c cell 3). I49's condition is on `(block, width)` for exactly that reason. **The transcript's window slices the box and never the content** (§3c cell 1).
- **I48** — **The scroll offset is view state: a row count, per container, droppable, clamped at read.** **Rows and not an element index**, so a resize re-interprets it rather than moving the reader to whichever element used to sit there (§3c trace 4). It is never corrected at write — a store that had to be fixed up on every patch is one that accumulates, which C23 I47 forbids of view state — and it is dropped with the entry on the same subscription that drops the rendered rows. **A settled entry's scroll keeps its offset and cannot be moved**, because only the live entry holds focus and a container scrolls if it is focusable (§3c cell 6); the content below the box is unreachable there, and that is a ruling rather than an oversight. **Resume restores no offset**, which follows from view state and is C13 I20's consumer.
- **I49** — **A scroll whose content cannot fit draws a residue marker, in both directions, and pays a row for it out of its own height.** *N above · M below* rather than silence: a bounded region with a marker is normal and one that silently ends is a defect (F123's class, D40's eviction marker). **`measure` returns `height + 1` exactly where the children measure taller than `height`, and `height` where they do not** — the condition is on `(block, width)` and never on the offset, so the content area does not change size as the reader scrolls and I47's offset-independence survives the marker rather than being weakened by it. The glyph is C09's and never a literal (F6).

---

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
