# C25 — Patch renderer

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L1 presentation |
| **Depends on** | C04 (`Patch`, `Hunk`, `Measure`) · C09 (registers into its registry; `cells()`; tokenisation) · C10 (`resolveTone`, `resolve` for the `syntax` palette) |
| **Consumed by** | C09's registry · S10's manifest change · any surface showing a textual change |
| **Source** | Scratchpad 5 §4 · A01 D29 · A02 §2 |
| **Status** | Draft — one open item in §6 blocks implementation, not the spec |

---

## 1. Purpose

C25 renders a textual diff: hunks of added, removed and context lines, with line numbers, a file header, and syntax highlighting inside each line.

The existing `diff` block compares two runs' **fields** — rows of `{field, a, b, comparison}` — and it is right for S07's metric table. It is wrong for a YAML manifest, where the change is textual and the reader needs to see which lines moved. S10 currently renders a forty-line manifest as a `code` block for what is often a two-line change, and relies on the reader to spot it.

Like C11 and C12, C25 registers into C09's registry through the public mechanism rather than being privileged. Table, plot and patch being three separate components registering the same way is what makes the extension mechanism real rather than a claim.

**C25 declares no block types.** `Patch` and `Hunk` are C04's, as every block shape is — settled when `plot` moved out to C12.

**No state machine.** A pure `measure`/`render` pair over an immutable block (A02 §7).

---

## 2. Public interface

```typescript
const patchDefinition: BlockDefinition<Patch>;   // registered into C09
```

Nothing else is exported. The block shape is C04's, the registry is C09's, and a consumer producing a patch uses `b.patch(…)` from C24.

### Height

Exact, and independent of width above a floor:

```
1                                        the file header (path)
+ Σ over hunks of (
    1                                    the hunk header, @@ -18,7 +18,9 @@
  + hunk.lines.length
  + (hunk.collapsedBefore ? 1 : 0)       the collapse marker, one row
  )
```

**Nothing wraps.** A diff line that wraps destroys the column alignment that makes a diff readable — the `+`/`-` gutter stops lining up and the eye loses the shape of the change. Long lines truncate, exactly as `logs` do. That is also what makes height width-independent, which makes C09 T2.1's width sweep cheap and makes any width-dependence a bug the sweep catches immediately.

A collapsed region is **one row**, carrying its own count: `⋯ 12 unchanged lines`. The count comes from `collapsedBefore`, so measurement reads it directly rather than deriving it.

---

## 3. Rendering

### The gutter and the two prefixes

| Line kind | Prefix | Tone |
|---|---|---|
| `add` | `+` | `ok` |
| `remove` | `-` | `error` |
| `context` | ` ` | `muted` |

**The prefix is not decoration.** D29 forbids information riding on colour alone, so `+` and `-` carry the distinction and the tone reinforces it. At 1-bit, where all colour is gone, a diff is still a diff.

Line numbers precede the prefix: old and new in unified layout, one per side in split. A line missing its number (`oldNo` absent on an `add`) renders blank in that column rather than shifting the gutter.

### Two palettes on one line

Within a line, the `syntax` palette highlights the language — so a changed YAML line is `ok`-toned *and* `+`-prefixed *and* syntax-coloured. This is the only place in the system where two palettes meet on one line.

**C10 had to be widened for this.** Before C25, `syntax` was scoped to `code` blocks by C10 I16, tested by C10 T2.8 and enforced by A03 SS20. That scope is now a closed list of `code` and `patch`, and it stays closed: a third consumer is a spec change, and the friction is the point.

**How the two compose is open — see §6.**

### Layout

`layout ?? (width >= 100 ? "split" : "unified")`. An explicit `layout` on the block wins, so a surface can force unified.

**Unified is the narrow form and split is the wide one**, which is the opposite of S07's call and worth stating because it looks inconsistent. S07 stacks its comparison because its content is *values*, and both values must be visible for the comparison to mean anything. A patch's content is *lines*. A split diff at 60 columns gives 28 usable columns per side, and every line truncates — the layout that preserves the comparison at S07's granularity destroys it at this one.

### ASCII fallback

`unicode: "ascii"` replaces the collapse marker's `⋯` with `...`. **This changes the cell count**, so unlike C09's 1:1 substitution rule the collapse marker's *content budget* changes at measure time instead — the marker is a fixed one row either way, so height is unaffected and C09 I1 holds. This is the "adding a kind whose measurer needs capabilities" case C09 commitment 11 names as a design decision, and it is made here deliberately: the alternative is a three-cell `⋯` that is one cell wide, which would drift every truncation point on the row.

---

## 4. Tokenisation

C25 does not tokenise. It calls C09's tokeniser with `(line.text minus its prefix, block.language)` and receives token spans, which it resolves through C10's `syntax` palette.

Consequences that matter:

- **`measure` never tokenises.** Tokens change appearance, not line count. A patch measures identically whether or not its language is registered, which keeps C09 I1 cheap.
- An **unregistered language renders as plain text**, not an error — the same principle as C07's fallback adapter.
- Memoisation is C09's, on `(text, language)`. C25 holds no cache, and holds no state at all.

---

## 5. Invariants

- **I1** — `measure(patch, w)` equals the rendered row count at width `w`, for every block and every width. C09 I1, specialised.
- **I2** — Height is independent of width. Nothing wraps; long lines truncate.
- **I3** — `measure` never tokenises and never reads capabilities except for the collapse marker's content budget (§3).
- **I4** — Every `add` and `remove` line carries its prefix glyph regardless of colour depth. D29 at the source.
- **I5** — A collapsed region occupies exactly one row and states its own count.
- **I6** — C25 registers through C09's public `register`; it is not privileged.
- **I7** — C25 holds no state. `measure` and `render` are pure over the block.
- **I8** — C25 declares no block types. `Patch` and `Hunk` are C04's.
- **I9** — Expansion of a collapsed region patches the document (C11 T4.7's mechanism), never mutates external state. C25 itself does not expand anything — it renders whatever `collapsedBefore` says.

---

## 6. Open — the composition rule

**This blocks implementation, not the spec.** It must be settled before C25 is scheduled.

C10's `Style` is `{colour?, bold?, dim?, inverse?, underline?}` — **no background channel.** So on a changed line, where the line kind wants to say "added" and the syntax palette wants to say "this is a keyword", something has to give:

| | |
|---|---|
| **(a) Add `background?` to `Style`** | Additive, and what real terminal diff tools do. Needs a degradation rule (C10 §4 already degrades surfaces to *nothing at all* at 1-bit, so the precedent exists) and changes contrast validation from fg-on-surface to fg-on-bg, which is a real change to C10 §4 |
| **(b) Prefix carries it alone; syntax owns the foreground** | Defensible under D29 — information must not ride on colour anyway — but added and removed lines end up the same colour, distinguished only by `+`/`-`. A worse diff |
| **(c) Context lines get syntax, changed lines get tone** | Coherent, and backwards: highlighting is suppressed exactly on the lines you most want to read |

Attributes are already spoken for: bold and dim are how 1-bit carries tone (C10 §5), so they cannot also carry line kind.

Adding a background channel to `Style` is a C10 decision and should be taken deliberately, not discovered as a side effect of writing a patch renderer. Recorded here because C25 is where the constraint became visible, and the decision belongs in C10 when it is made.

---

## 7. Commitments

1. C25 renders textual diffs; `diff` remains the structured comparison and the two never merge.
2. Height is exact and width-independent; nothing wraps.
3. A collapsed region is one row stating its own count.
4. `+` and `-` carry the distinction; tone reinforces it and never replaces it.
5. Two layouts, chosen by width — unified when narrow, split when wide. The breakpoint is a §3 value, tuned against golden frames rather than promised (I2).
6. C25 registers through C09's public mechanism and is not privileged.
7. C25 declares no block types and holds no state.
8. Tokenisation is C09's; `measure` never tokenises.
9. An unregistered language renders as plain text, not an error.
10. Word-level highlighting is deferred and the block shape does not foreclose it.

---

## 8. Tests

Six tiers. No state machine, so no transition table (A02 §7).

### Tier 1 — unit

- **T1.1**: a single-hunk patch measures `1 + 1 + lines.length`.
- **T1.2**: a three-hunk patch measures the sum across hunks plus one file header.
- **T1.3** (I5): a hunk with `collapsedBefore: 12` measures one row more than the same hunk without it, and the marker states `12`.
- **T1.4** (I5): `collapsedBefore: 1` still occupies exactly one row — a collapse of one is not expanded silently.
- **T1.5**: the layout threshold at widths 99, 100 and 101 → unified, split, split.
- **T1.6**: an explicit `layout: "unified"` at width 200 stays unified.
- **T1.7** (I4): every `add` line renders `+` and every `remove` renders `-`, at all four colour depths.
- **T1.8**: a line missing `oldNo` renders a blank number column, not a shifted gutter.

### Tier 2 — contract / interface

- **T2.1** (I1, the headline): for the fixture corpus × widths {40, 60, 80, 100, 120, 160, 200}, `measure` equals the rendered row count.
- **T2.2** (I2): for every fixture, `measure` returns the same value at all seven widths.
- **T2.3** (I6): `patch` is registered via `registry.register`; removing the call removes the kind, and no built-in fallback path supplies it.
- **T2.4** (I7): `measure` called a hundred times returns the same value; no I/O, no state.
- **T2.5** (I3): `measure` performs no tokenisation — a spy on C09's tokeniser records zero calls across the corpus.
- **T2.6** (I8): C25 exports no block type; `Patch` and `Hunk` resolve to C04.

### Tier 3 — edge cases

- **T3.1**: zero hunks → the file header alone, one row. No throw.
- **T3.2**: a hunk with only `context` lines → measures normally; nothing is toned `ok` or `error`.
- **T3.3**: a 10,000-character line → truncates, occupies one row, and height is unchanged.
- **T3.4**: `language` naming an unregistered language → renders plain, no error, height identical.
- **T3.5**: `language: ""` → same as unregistered.
- **T3.6** (I2): the same patch at width 40 and width 200 measures identically.
- **T3.7**: a hunk whose `header` is longer than the width → truncates to one row.
- **T3.8**: `collapsedBefore: 0` → treated as absent; no marker row.
- **T3.9**: a patch where every line is `add` (a new file) → no `remove` lines, height exact.

### Tier 4 — integration

- **T4.1** (with C09): `patch` measures and renders through the registry dispatcher, not directly.
- **T4.2** (with C10): at `colourDepth: 1`, every line's distinction survives as prefix plus typographic style; no colour code is emitted.
- **T4.3** (with C10): the `syntax` palette resolves inside a patch line — the widened I16 in force.
- **T4.4** (with C09, ascii): `unicode: "ascii"` → the collapse marker is `...`, height unchanged, no codepoint above U+007F.
- **T4.5** (with C14): expanding a collapsed region shifts subsequent blocks by exactly the measured delta; no drift over fifty expand/collapse cycles.
- **T4.6** (with C24): `b.patch({…})` produces a block that validates and renders.

### Tier 5 — e2e

- **T5.1**: S10's manifest change end to end — a two-line change renders as two changed lines plus context, not a forty-line block.
- **T5.2**: a patch at 60 columns is unified and readable; the same patch at 160 is split.
- **T5.3**: under `LANG=C`, a patch renders ASCII-only with no mojibake.

### Tier 6 — fail-on-revert

- **T6.1** (I2): making long lines wrap → T2.2 fails, and height becomes width-dependent.
- **T6.2** (I1): counting a collapsed region as its collapsed line count → T1.3 fails.
- **T6.3** (I6): making `patch` a privileged built-in → T2.3 fails.
- **T6.4** (I4): rendering the add/remove distinction with tone alone → T4.2 fails at `colourDepth: 1`.
- **T6.5** (I3): tokenising inside `measure` → T2.5 fails.
- **T6.6** (§3): flipping the layout threshold so split is the narrow form → T1.5 fails, and every line truncates at 60 columns.
- **T6.7** (C04 commitment 20): merging `patch` into `diff` behind a mode flag → T2.1 fails, because height then depends on the mode rather than the block.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| The `Patch` and `Hunk` shapes | C04 |
| Producing hunks from two texts | The app. C24 exports no diff-parsing helper — a diff algorithm is not in the runtime-dependency budget |
| Tokenisation | C09 |
| The `syntax` palette and the composition rule's resolution | C10 |
| **Word-level highlighting within a changed line** | Deferred. It is where diff viewers earn their keep and also where they get slow — an intra-line diff is a second diff algorithm running per changed line. The block shape does not foreclose it: a `spans` field on a line would be additive |
| Expanding a collapsed region | C23 dispatches it; expansion patches the document (C11 T4.7's mechanism) |
| Syntax highlighting of the whole file | `code`, C09 |
