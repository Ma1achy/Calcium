# Spans in the view model — design, measurements and both walks

**Status: design and spec landed 2026-09-03; code landed 2026-09-04** — roadmap 50 BUILT, §8's
seven steps, and §10's rows 18 and 19 as C09 §5 *Runs* and C25 I10. Contract in C04 §3am (I83–I88,
commitments 81–84, T1.23–26 · T2.31–34 · T3.62–67 · T6.81–85) and C10 §4e (I33, commitment
29, T1.22 · T2.25 · T3.11 · T6.84). Branch `feat/plot-arm-unification`, lane S; lanes W
(`blocks/kinds/**`, `viewmodel/{types,validate}.ts`) and R (roadmap, notes) are editing
concurrently, and §10 names where the code phase collides with them.

**The arc.** No span-level styling exists: `Cell` is `{ text, tone?, glyph?, spark?, bar? }`,
`Raw` is `{ text }`, and tone attaches to a block, a cell, a row or a pill — never to a run
inside text. Four things wait on the one mechanism, and the note treats them as one arc
because `CALCIUM_ML_BLOCKS.md:29` says they are and the measurement below agrees:

| consumer | where it is stated | what it needs from a span |
|---|---|---|
| markdown inline emphasis | roadmap 11 (PART), roadmap 50's order *spans first, then 11's translator*; `markdown.ts:23-29` *the day spans exist, the literal form is the thing they replace* | appearance — bold, italic |
| italic's first writer | `Style.italic` (`theme/types.ts`), `SgrStyle.italic` → SGR 3 (`escapes.ts:226`); zero writers of `italic: true` in `src/`; `UNCONSUMED_MEMBERS["SgrStyle.italic"]` in `tools/enforce/module-graph.mjs:1663` | appearance — italic |
| word-level diff highlight | C25 I10 (*a `spans` field on a line would be additive*), C10 §4a's ruling that the carrier is `underline` | appearance — underline (**not** tone; see §3 Q3) |
| per-token value | `CALCIUM_ML_BLOCKS.md` §1, `NOTE_AUDIT` §6 ML-1 *planned — own arc* | a number — **deferred**, §7 |

---

## 1 · Measurements

Every ruling in §3 cites a row here. `HEAD b8b0e9f4`; probe in the devcontainer against a
`dist/` newer than HEAD with `text.ts` unchanged by either lane.

| # | question | measured | where |
|---|---|---|---|
| M1 | readers of the view model's text members in `src/` | **17 sites, 11 files**: `simple.ts` ×3 (`notice` wrap, `tip`, `raw`), `code.ts` ×2, `table/cells.ts`, `table/sort.ts`, `table/definition.ts` (copy), `table/detail.ts`, `patch/definition.ts` ×5 (`item/left/right/group.text`), `containers.ts:252` (copy), `builders/index.ts:230`, `art.ts:170` | `grep "\.text\b"` filtered to block/cell/line receivers; the raw count of 142 is inflated by parser tokens, history redaction and C09's own `Span.text` |
| M2 | writers | `kind: "raw"` **19**, `"notice"` **32**, `"tip"` **6** literals in `src/`; `kind: "table"` in 8 files | `grep -rn 'kind: "raw"'` etc. |
| M3 | existing types named `Span` | **two in `presentation/`**: `paint.ts:23` `{ text; style? }` (a painted run) and `plot/stack.ts:99` `{ from; to; drawn }`; plus C17's `CellSpan` (`layout.ts:219`, `{ row; from; to }` in display cells) | `grep "type Span"` |
| M4 | an offset-addressed run mechanism already in the tree | **yes, in `code.ts`**: `Token = { text; slot }` sliced by `sliceTokens(tokens, start, length)` in **code units** (`.length` marked `cells-ok`); rows are exact source slices via `hardWrapCells` + `codeRows.start`; truncation via `truncateParts` returning `{ kept, suffix }` with `kept` an exact code-unit prefix. `patch/lines.ts:149` reuses all three | `code.ts:257-362`, `text.ts:467-505` |
| M5 | what `wrapCells` does to offsets | `"the quick brown fox jumps"` at 10 → `["the quick","brown fox","jumps"]`: rows sum to **18** code units of a **19**-unit source; `"ab  cd"` at 4 → `["ab","cd"]` (two units dropped); `"abc   def"` at 5 → `["abc"," def"]` (one dropped, one kept as a leading space). **Every row is still an exact contiguous slice of the source from a computable start** — `line.slice(0, at).trimEnd()` is a prefix, `line.slice(at)` a suffix | probe, `text.ts:573-621` |
| M6 | `hardWrapCells` on the same | `["the quick ","brown fox ","jumps"]` — no drop; the code path's rows already concatenate to the source | probe |
| M7 | cluster widths vs code units | `é` composed: 1 cell / 1 unit; decomposed: 1 cell / **2 units**; ZWJ family: 2 cells / **8 units**, 1 grapheme; `中`: 2 cells / 1 unit; `🇬🇧`: 2 cells / 4 units; `⚠` 1 cell, `⚠️` 2 cells / 2 units | probe |
| M8 | `truncateParts("hello 中文 world", 9)` | `{ kept: "hello 中", suffix: "…" }` — a 2-cell glyph refused at the boundary and the padding put in `suffix`; `kept.length` is code units (5 for `"héllo wörld"` at 6) | probe |
| M9 | control characters | `wrapCells("abc d", 10)` → `["abc d"]`, source length 6 → row length 5: **`stripControl` shifts every offset after the character** | probe, `data/text.ts:35-38` (tab and newline are kept) |
| M10 | can L0's validator see a cluster boundary | **no**: `Intl.Segmenter` appears nowhere in `src/data` or `src/terminal`; `graphemes()` is `presentation/text.ts:340` (L1), and imports go down only | grep |
| M11 | which `ViewPatch` arm can write text | `replace` carries a whole `Block`; `merge` carries whole `MergeRow`s (whole `Cell`s); `append` a whole block. **No arm writes a string** | `types.ts:2973-3018` |
| M12 | where markdown puts text | paragraphs → `raw` (**never wrapped** — `rawDefinition` truncates each line with `fit`), list items and quotes → `notice` (wrapped), pipe cells → `Cell`, headings → `Rule.label` (truncated then `clampSpans`), fences → `code` | `markdown.ts:116,159,176,198,217,236`; `simple.ts:397-410,140-172,95-135` |
| M13 | what markdown does with inline code | nothing — `` `code` `` is seven characters, same as `**` (T2.44) | `test/contract/markdown.test.ts:96-103` |
| M14 | does `measure` receive capabilities | no — `(block, width)` and `(block, width, measureChild)`; C04 §5's *independent of theme* clause | `types.ts:3032-3040` |
| M15 | `Cell` truncation end | `column.truncateFrom` `"start" | "end"` → `truncate(body, width, caps, from)`; **`truncateParts` has no `from`** | `table/cells.ts:162-165`, `text.ts:467` |
| M16 | the `change` axis the task cited at `types.ts:597` | it is at **`types.ts:2461`** (`Comparison.rows[].change`), and C25 I10 rules word-level diff emphasis onto `underline`, not onto a tone | grep |
| M17 | validation on the patch path | `applyPatch` does not validate (`patch.ts:38` — *`validateDocument` does*); `store.ts:88` validates the whole document on arrival and `:189` on settle; `registry.ts:76,182,304` at the adapter boundary | grep |

---

## 2 · The four consumers against the two shapes

**Shape A — parallel:** `spans?: readonly TextSpan[]` beside `text`, offsets into it.
**Shape B — union:** `text: string | readonly Run[]`.

| consumer | A expresses it | B expresses it | what B costs |
|---|---|---|---|
| markdown emphasis | yes — `[{from,to,bold}]` | yes | M1's 17 readers gain a branch; M2's 57 writers unchanged but every reader of `text` as a string breaks |
| italic's writer | yes | yes | same |
| word-level diff | yes — `Hunk.lines[].spans` is exactly C25 I10's *additive field* | yes, but `Hunk.lines[].text` becomes a union that C25's five readers must unwrap | the token-slicing in `patch/lines.ts` currently takes a string |
| per-token value | yes — a `value` member on the span, deferred | yes — `{text, value}` runs | neither is scheduled |

Nothing B expresses that A cannot; A keeps every reader valid; and **A carries no text**, so
the measurer's input is provably the string it was (§3 Q5). A is the narrower change and it
is taken — F85's shape: prefer the type that changes fewer readers when both express the
consumers.

---

## 3 · Rulings, each beside its measurement

**Q1 Shape → parallel `spans?: readonly TextSpan[]`** (M1, M2, §2). Name `TextSpan`, not
`Span`: M3 counts two `Span`s in `presentation/` already and the painted `Span` is what the
renderer *builds* from a `TextSpan` — a homonym across the seam the trace crosses would be
the worst place for one. C04 I83.

**Q2 Unit → UTF-16 code units, half-open `[from, to)`** (M4, M7). Every offset-addressed
helper in the tree — `Token`, `sliceTokens`, `truncateParts.kept.length`, `codeRows.start` —
is already in code units and annotated `cells-ok`; JSON carries no other index; the
segmenter yields code-unit indices. Graphemes would need a segmenter in L0 (M10: there is
none, and one implementation is the rule). Cells would make the offset depend on
`ambiguousWidth`, a capability the document must not know. **Validation refuses** what a
code-unit walk can decide: non-integer, negative, `from ≥ to`, `to > text.length`, unsorted,
overlapping, and a boundary between a high and a low surrogate (the one cluster interior
visible without a segmenter). **The renderer snaps** any other boundary that lands inside a
grapheme cluster outward to the cluster's end — width-preserving by construction, because
the cluster is painted whole. C04 I84; C09 owes the snapping row in the code phase.

**Q3 What a span carries → `bold`, `italic`, `underline` only** (M16, C10 §3, §4a).
- *tone*: its one consumer, structured diff, is ruled onto `underline` by C25 I10 (M16); and a
  run tone would collapse at 1-bit onto the same `bold`/`dim` the span's own attributes use,
  so a span tone and a span attribute would be indistinguishable there. Deferred, symbol
  `TextSpan.tone`, consumer = inline code (§7).
- *colour*: a block names a slot and C10 resolves it; a span naming a slot would be the first
  place a colour travels with text. Refused, not deferred.
- *dim*: the 1-bit de-emphasis carrier. Refused.
- *inverse*: swaps both colour channels (C10 §4a). Refused.
- *value*: ML-1 is unscheduled. Deferred, symbol `TextSpan.value` (§7).
C04 I85; C10 I33 for the merge and the depths.

**Q4 Wrapping → carried by source offset** (M5, M6). A bold word broken across rows is bold
on both. `wrapCells` drops break spaces, so slicing spans by prefix sums of row lengths is
wrong by one unit per break — but every row is an exact slice of the source from a
computable start, which is exactly what `codeRows` gives the token slicer. The code phase
adds an offset-carrying sibling (`wrapCellsParts` returning `{ text, start }[]`, or `start`
on the existing rows) and reuses `sliceTokens`. Trace in §5. C04 I86.

**Q5 Measurement → unchanged by construction** (M14, §2). A `TextSpan` holds no characters;
`measure` reads `text` and never `spans`; the golden sweep asserts height equality on the
with/without pair (C04 T1.25). The invariant is stated as a pair so a measurer that starts
reading spans fails at the first width.

**Q6 Truncation → clipped to `kept`; marker never inside a span** (M8, M15). `truncateParts`
already reports the exact kept prefix; a span is intersected with `[0, kept.length)`. For
`truncateFrom: "start"` `truncateParts` gains a `from` end and the kept slice's source
offset is `whole.length − kept.length`. The `?` a wrapper substitutes for an unplaceable
cluster (C09 I19) keeps its span: the source offsets are unchanged, only the drawn text is.

**Q7 Selection and copy → spans are dropped on copy; `CellSpan` is a homonym** (M3).
`copyTextOf` returns `child.text`; C11's `copy` joins `cell.text`. Appearance is not copied,
as tone is not. C17's `CellSpan` is a *result* — cells to wash, per display row, computed
from the editor's walk — and a `TextSpan` is an *input*; they share no code and should share
no type. The selection wash is a background (C10 §4b) merged by `withBackground`; a span's
attributes are on other channels and compose with it.

**Q8 The far side → a span is document data** (M11, M17). It is plain JSON (C04 §5a's
round trip); an adapter may write one and the gate refuses a malformed one as it refuses a
malformed `Cell.spark`. What only the framework writes: nothing — there is no view-state arm
here, and deliberately, because a span is a fact about the text and not about the reader.
**No patch arm can change `text` without `spans`** (M11): `replace` and `merge` carry whole
blocks and whole cells, so the deltas-read-as-state class is closed by the type. C04 I87.
The fail-on-revert row (T6.85) says what would reopen it: a text-only arm.

**Q9 The first writer and reader → markdown and the four members it emits into** (M12,
M13). Pass one: `Raw.text`, `Notice.text`, `Rule.label`, `Cell.text`. Two render paths:
truncate-and-clamp (`raw`, `rule`, `Cell`) and wrap (`notice`). Inline code stays literal in
pass one — it would want a tone and Q3 defers tone. `code` is **refused** a `spans` member
(C04 I88): its syntax tokens are a run stream over the same string.

**Q10 Depths that cannot show an attribute → lost, not compensated** (C10 §3, `theme/types.ts`
italic comment). At 1-bit a bold span on an emphasised-class block writes SGR 1 inside SGR 1;
the pair is byte-identical and C04 T3.67 asserts that so a compensation becomes visible.
Italic at `unicode: "ascii"` is still SGR 3 — the unicode axis gates glyphs, not attributes
(C10 T3.11). No fallback onto `underline` (C25 I10's) and no return to literal markers: the
view model never sees a capability, so it cannot choose. C10 I33.

---

## 4 · Classification table — cells where two rules hold at rest

A row governed by one rule is a restatement and finds nothing; each row below names the two.

| # | rule A × rule B | the cell | ruling | found |
|---|---|---|---|---|
| 1 | *offsets are code units* × *`cells()` measures clusters* | a boundary inside a ZWJ family (8 units, 1 cluster) or between base and combining mark | gate refuses only a surrogate split (M10); renderer **snaps outward** to the cluster end; width unchanged (T3.64) | the collision class — SGR between base and mark can change composition |
| 2 | *offsets are code units* × *a wide char is one unit* | a span ending after `中` | nothing to rule: 1 unit, 2 cells, and the span never states a width | — |
| 3 | *a span continues across a wrap* × *`wrapCells` drops the break space* | span `[10,19)` over `brown fox` in M5's text | slice by source `start`, not by row-length prefix sums; the dropped space is in no row and a span covering only it contributes nothing (T3.62, T6.83) | **the one-unit drift**, invisible to every height assertion |
| 4 | *a span continues across a wrap* × *`placeable` substitutes `?`* | a 2-unit emoji at width 1 inside a span | `start` advances by the **source** segment's length while the row text gains one `?`; the span keeps the `?` (T3.65) | a row-text-length walker would drift here too |
| 5 | *a span is clipped at a cut* × *the marker is measured, not assumed* (F292) | span straddling `truncateParts`'s cut, marker 2 cells at `ambiguousWidth: "wide"` | intersect with `[0, kept.length)`; `suffix` (pad + marker) is painted in the block's tone, never in the span (T3.63) | — |
| 6 | *`truncateFrom: "start"` keeps the tail* × *`kept` is a prefix* | a `Cell` in a path column with a span near the end | `truncateParts` gains `from`; kept is a suffix with source offset `length − kept.length` (M15, T3.63) | **a helper the ruling needs and the tree does not have** — the C23 §8a class, caught before writing the ruling down |
| 7 | *spans offset into `text`* × *a `Cell` body is `glyph + " " + text`* | `glyph: "ok"`, span `[0,3)` | offsets are into `text`; the body is assembled as runs `[glyph+" "][text runs]` so the glyph never shifts them (T3.66) | — |
| 8 | *a span is an attribute* × *tone collapses to `bold`/`dim` at 1-bit* | bold span on an `ok` notice at depth 1 | absorbed, asserted identical, not compensated (C10 I33, T3.67) | the accepted loss, made visible |
| 9 | *a span is an attribute* × *the `unicode` axis has an ASCII rung* | italic span at `unicode: "ascii"` | SGR 3 still written; attributes are not glyphs (C10 T3.11) | — |
| 10 | *a span is an attribute* × *the selection wash is a background* | selected row containing a bold span | compose through `withBackground`; `sliceCells` carries the SGR across the window | — |
| 11 | *`inverse` swaps both channels* × *a span composes with tone* | — | `inverse` is not a span member; refused at the type (Q3) | — |
| 12 | *spans are sorted and non-overlapping* × *markdown nests* (`**a *b* c**`) | nested emphasis | the **writer** splits: `[a ]bold`, `[b]bold+italic`, `[ c]bold`; the type has no nesting (C04 I84) | keeps `runsOf` one pass |
| 13 | *`from < to`* × *the translator meets `****`* or an empty emphasis | a zero-length run | refused by the gate; the translator emits none (T1.24) | — |
| 14 | *`stripControl` runs before wrap* × *offsets are into `text`* | `"abc d"` with a span at `[4,6)` (M9) | **runs first**: build `Run[]` from `(text, spans)` in code units, strip control **per run**, wrap the concatenation — alignment holds because each run shrank independently | a defect the trace would not reach, because nothing between the rules is an event |
| 15 | *`code` has a token stream* × *a member may carry `spans`* | `code` with `spans` | refused at the gate (C04 I88, T2.32) | two writers on one string |
| 16 | *C25 I10's carrier is `underline`* × *a span may say `underline`* | a diff line that is also markdown | no member has both writers in pass one; recorded in C10 §4e as the row to reopen | — |
| 17 | *a span carries no text* × *`measure` never sees appearance* | every width | the same number with and without (T1.25); stated as a pair | vacuity guard — the invariant needs a subject, and the pair is it |

## 5 · Sequence trace — markdown source to copy buffer

Input: `a **bold** and *em*` → translator → `raw` (M12) with `text: "a bold and em"`,
`spans: [{from:2,to:6,bold:true},{from:11,to:13,italic:true}]`. Then the same text as a
`notice` at width 8 so the wrap step fires.

| step | what happens | the rule pair that meets here | ruling / check |
|---|---|---|---|
| 1 translate | markers removed; offsets computed on the **output** string as it is built | *offsets are into `text`* × *the text is the marker-stripped form* | offsets are into what is emitted, never into the source (T2.33) |
| 2 validate (`registry.ts:76`, `store.ts:88`) | `KIND_CHECKS.raw` gains `checkSpans(b, "text")`; `KIND_CHECKS.rule` checks against `label`; table rows check each `Cell` | *the gate refuses what it can decide* × *L0 has no segmenter* | Q2; surrogate split is the one interior check |
| 3 measure | `rawDefinition.measure` reads `rawLines(block).length` — untouched; `notice` reads `wrapCells(...)` — untouched | *measure is pure in `(block, width)`* × *spans exist* | unchanged input; T1.25 pair |
| 4 runs | `runsOf(text, spans)` → `[{a }, {bold, bold}, { and }, {em, italic}]`, code-unit exact, then `stripControl` per run (cell 14) | *runs concatenate to the text* × *control is stripped* | alignment by construction |
| 5 wrap (`notice`) | `wrapCellsParts(concat, 8)` → rows `{text:"a bold", start:0}`, `{text:"and em", start:7}`; the space at 6 is in no row | *rows are exact slices* × *the break space is dropped* | `sliceTokens(runs, start, row.text.length)` — the bold run lands whole on row 1, italic on row 2 (T3.62) |
| 5′ truncate (`raw`) | `truncateParts(concat, width)` → `kept`; runs sliced to `[0, kept.length)`; `suffix` appended unstyled | *clip to kept* × *marker outside spans* | T3.63 |
| 6 paint | each run → C09 `Span` `{ text, style: { ...tone, ...attrs } }`; `paint()` closes each styled run with a reset | *a span is an attribute* × *tone is a colour* | C10 I33; `1;3;4` in numeric order (T2.31) — **the first frame that writes `Style.italic`**, MG24's row removed |
| 7 SGR bytes | `ESC[1m bold ESC[0m` … | *attributes consult no depth* × *the ladder degrades colours* | unchanged at 1-bit and ASCII (T3.67, C10 T3.11) |
| 8 far side patches | `replace` with a new `raw` whose `text` changed | *a patch replaces a block* × *spans decorate text* | the new block carries its own `spans` or none; the old ones cannot survive because nothing keeps them (C04 I87). **What cannot happen**: text patched, spans stale — there is no arm for it (M11) |
| 8′ far side merges | `merge` with rows whose cells carry spans | *merge upserts whole rows* × *a cell's span is the cell's* | whole `Cell`s; validated on arrival (`store.ts:88`) |
| 9 reserve / expand | view-state arms | *view state never touches text* × *spans are text's* | nothing to rule; spans are untouched |
| 10 select and copy | `copyElement` → `copyTextOf` → `child.text` | *copy takes text* × *spans are appearance* | dropped (C04 I87) |
| 11 persist (roadmap 44) | `JSON.stringify` → `validateDocument` | *a document is JSON* × *a span is plain data* | round trip (T1.26) |

**What the trace found that the table could not**: nothing new at steps 8–9 — and that is
the finding. The hazard the task named (*text patched, spans not*) is unreachable because
the patch vocabulary has no string-valued arm; the closure is by type, so the test that
guards it is a fail-on-revert naming the widening (T6.85), not a behavioural row.

## 6 · The rejection paths — what each throw or refusal leaves behind

| refusal | where | what is left behind | check |
|---|---|---|---|
| malformed span at the gate | `validateDocument` returns errors; `store.ts:88` marks the entry failed, `registry.ts` returns a usage-error document | the same state as any malformed member — no block enters the store | one error per fault names the span index (T1.24), so a nine-fault document is nine lines and not one |
| `code` with spans | gate | as above; the block never reaches `codeDefinition` | T2.32 |
| a boundary inside a cluster | **not** a refusal — snapped at render | the run boundary moves one cluster; `text` and `spans` in the store are unchanged, so a later `replace` sees the document it was given | T3.64 asserts the width, not the offsets |
| the translator meeting an unclosed `**` | not a refusal — literal | the marker stays as characters, no span emitted; total, as `markdownBlocks` is (C04 I4's direction) | T2.33's sibling case in the code phase |
| a span past `kept` at truncation | not a refusal — clipped | nothing retained; the next frame recomputes from the block | T3.63 |

No ruling here throws mid-mutation: the gate reports before anything is stored, and the
renderer never writes. That is why this section is short, and it was checked rather than
assumed (C13's `settle` is the precedent for a throw leaving an unpatchable entry).

## 7 · Deferred, each with the symbol that expires it

| deferral | symbol to grep | consumer that would expire it |
|---|---|---|
| ~~a span tone~~ **discharged 2026-09-04** | `TextSpan.tone` | inline code → `tone: "identifier"`, exactly the consumer named here; C04 I89, C09 §5, C10 §4e. The tone *replaces* the block's for the run, the attributes spread on top, the 1-bit collapse is the tone's and uncompensated |
| ~~a span value~~ **discharged 2026-09-04** | `TextSpan.value` | ML-1 per-token value, C04 I90; background through `continuousColour` on the block's `colormap` (`Raw` and `Notice` gain the member), nothing below 8-bit; **a valued run is a wrap unit** — `wrapCellsParts` takes atoms, `notice` measures and renders through one `noticeRows`, and the one span member `measure` may read is `value`'s boundaries (C09 §5). Measured: a single-word token changes the count only where the row has no space at all |
| ~~`Hunk.lines[].spans`~~ **discharged 2026-09-04** | `Hunk` in `types.ts` + C25 I10 | the intra-line diff arrived as `intralineSpans`/`intralineLines` (`src/data/viewmodel/intraline.ts`), called by `b.patch`: a word-token LCS over each paired remove/add run, capped at 200 tokens a side, emitting `underline` and never a tone (C04 I91). The field was never the missing half and the note said so |
| `Tip.spans`, `KeyValue.rows[].spans`, `Logs`, `Events`, `Steps`, `Pills`, `Comparison` | the member name on each type | a writer; none exists (M2: tips are framework-authored) |
| ~~inline code in markdown~~ **discharged 2026-09-04** | `TextSpan.tone` (same symbol) | the backticks go and the run is an `identifier` span; an unclosed or empty pair stays literal; a run inside emphasis is one span carrying attribute and tone (`markdown.ts`, C04 T2.33 as amended) |
| heading levels, quote gutter, nesting cap | unchanged — `markdown.ts` residues | not this arc |
| a span-aware `sort` for tables | `table/sort.ts:24` reads `cell.text` | nothing — sorting on text is right; recorded so nobody adds it |

## 8 · Build order — each step with its rows and the mutation that fails them

Roadmap 50's order: spans first, then 11's translator. Each step is a commit; the MG24 row
falls out of step 3 and is removed in the same commit.

| step | change | rows owed | mutation that must fail them |
|---|---|---|---|
| 1 type | `TextSpan` in `viewmodel/types.ts`; `spans?` on `Raw`, `Notice`, `Rule`, `Cell`; export from the barrel | C04 T1.26 | none — a type; the round-trip row is its subject |
| 2 validate | `checkSpans(b, member, e, at)` in `validate.ts`; called from `raw`, `notice`, `rule`, table cells; `code` refused | T1.23, T1.24, T2.32, T6.82 | drop the overlap check → T1.24; drop the surrogate check → T1.24; accept `spans` on `code` → T2.32 |
| 3 runs + paint | `presentation/runs.ts`: `runsOf(text, spans)`, `sliceRuns` (lift `sliceTokens`/`Token` from `code.ts` so C25 and this share one slicer), cluster snapping; `withSpan(tone, attrs)` in `paint.ts`; `simple.ts` (`raw`, `notice`, `rule`) and `table/cells.ts` paint runs | T2.31, T3.63–67; C10 T1.22, T2.25, T3.11, T6.84 | route an attribute through a slot → C10 T1.22; gate italic on `unicode` → C10 T3.11; paint the marker inside the span → T3.63; skip the snap → T3.64; **MG24 `SgrStyle.italic` row removed here** |
| 4 wrap by offset | `wrapCellsParts` (or `start` on rows) in `text.ts`; `truncateParts` gains `from` | T3.62, T6.83 | prefix-sum slicing → T3.62 second row |
| 5 measure pair | golden sweep with/without spans | T1.25, T6.81 | a measurer reading `spans` → T1.25 |
| 6 markdown writer | inline pass in `markdown.ts` over paragraph, list item, quote, heading, cell text; not inside fences; T2.44 replaced | T2.33, T2.34, T6.85; `tools/mutate/runs/md-subset.mjs` gains three anchors (keep markers; wrong offsets by one; nested emphasis emitted overlapping) | revert to literal → T2.33; offsets into the source instead of the output → T2.33 |
| 7 record | `UNCONSUMED_MEMBERS` row deleted; roadmap 11 → the inline half built, 50 → BUILT; `CALCIUM_NOTE_AUDIT` §6 ML-1 row updated to *mechanism built, value channel deferred* | — | Lane R's files (§10) |

**Walk before step 3 lands**: draw the `notice` frame of §5 at widths 8, 6 and 1 by hand
and compare bytes, not row counts (C09 T3.62 is the bytes row for exactly this reason).

## 9 · What this design does not settle

- Whether inline code gets a tone or a fourth attribute — the tone deferral decides it.
- The `1;2` rendering at 1-bit on a de-emphasised block: the bytes are ruled, the picture
  is the terminal's.
- ML-1's *selection by token* (`ML_BLOCKS.md:26`): a `value` span could carry it, but
  selection is C17/C26's and a span is data — not this arc.

## 10 · Files the code phase touches, in order, with lane conflicts

| order | file | change | owner now |
|---|---|---|---|
| 1 | `src/data/viewmodel/types.ts` | `TextSpan`; `spans?` on four members | **Lane W** (`lineRange`) — land after theirs, or as one edit they take |
| 2 | `src/data/viewmodel/validate.ts` | `checkSpans`; four call sites; `code` refusal | **Lane W** |
| 3 | `src/data/viewmodel/index.ts` (barrel) | export `TextSpan` | shared — one line |
| 4 | `src/presentation/runs.ts` (new) | `runsOf`, `sliceRuns`, snapping; `Token`/`sliceTokens` lifted here | free |
| 5 | `src/presentation/blocks/kinds/code.ts` | import the lifted slicer | **Lane W** (`kinds/**`) |
| 6 | `src/presentation/patch/lines.ts` | import the lifted slicer | free |
| 7 | `src/presentation/blocks/paint.ts` | `withSpan` | free (C09 — Lane W is on C09/C14; check) |
| 8 | `src/presentation/text.ts` | `wrapCellsParts`; `truncateParts(…, from)` | free |
| 9 | `src/presentation/blocks/kinds/simple.ts` | `raw`, `notice`, `rule` paint runs | **Lane W** until theirs lands |
| 10 | `src/presentation/table/cells.ts` | `Cell` runs; glyph as its own run | free |
| 11 | `src/data/viewmodel/markdown.ts` | inline pass | free |
| 12 | `test/contract/markdown.test.ts` | T2.44 → T2.33/T2.34 | free |
| 13 | `test/unit/*` for C04 T1.23–26, T3.62–67; C10 rows in `test/unit/theme.test.ts` | new rows | free |
| 14 | `test/golden/*` | with/without pair | free |
| 15 | `tools/enforce/module-graph.mjs` | delete `SgrStyle.italic` row | free; MG24 fails until it is deleted |
| 16 | `tools/mutate/runs/md-subset.mjs`, `c10-italic.mjs` | anchors | free |
| 17 | `CALCIUM_ROADMAP.md`, `docs/notes/CALCIUM_NOTE_AUDIT.md`, `DEPENDENCIES.md` (no row — no dependency) | record | **Lane R** |
| 18 | `docs/components/C09_*.md` | snapping, `wrapCellsParts`, runs — rows for the renderer's half | **Lane W** (C09) |
| 19 | `docs/components/C25_*.md` | I10 gains the field name `Hunk.lines[].spans` and the `underline` non-collision | free |
