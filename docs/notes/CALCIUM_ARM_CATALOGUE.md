# The comparison catalogue — both arms, side by side

**The unification pass's own assertion is that the arms agree about everything except
resolution. Nothing has looked.**

`svgDecisions` and the disagreement matrix compare *decisions*, and F297 is four instances of
a reader calibrated to an encoding nobody wrote. **A matrix is a claim about what the arms
decide; a frame is what a reader sees.** Both are needed and only one exists.

---

## What to produce

### 1 · Regenerate the terminal catalogue

**It is stale by the whole campaign** — every form at every capability set, and the digest has
moved twice (`64b8845e6408c819` → `d06687b479814a56` → `4c99bab2a88289c7`).

```
890 frames    every form × every variant × five capability sets
              .txt with SGR, .plain stripped, and PNG through catalogue-png.mjs
```

### 2 · ~~Generate the SVG catalogue at parity~~ — **it exists** (F309)

**Measured against HEAD before writing a line.** `tools/svg-baseline.mjs` renders one `.svg`
per form·variant over the whole of `CATALOGUE_FORMS` — **178 frames, the same corpus, not the
66 phase frames** — into `test/golden/svg-baseline/`, which is **tracked** rather than
gitignored, with a derived expected count (F256) **and a placard already written for every
refusal.** That is this section almost word for word.

**What is actually missing is narrower**: the corpus is *text*, and a paired sheet needs
*pixels*. So the owed work is a compose pass over two corpora that are each already gated —
and **no `svg-catalogue.mjs` at all**, which is what the *extend, do not write a third*
instruction below already said.

### 3 · THE SIDE-BY-SIDE, which is the point

**One image per form·variant·capability, terminal left, SVG right, labelled.**

```
┌──────────────────────────┬──────────────────────────┐
│  bar · grouped · 24bit   │  bar · grouped · svg     │
│                          │                          │
│  [the terminal frame]    │  [the SVG]               │
│                          │                          │
└──────────────────────────┴──────────────────────────┘
```

**Same scale, so the eye compares the figure and not the medium** — and **the axis is width,
not height** (F311). The second sentence below is the argument and it stands; *scaled to the
same pixel height* was the remedy and it is on the wrong axis.

**A comparison at different sizes is a comparison of two pictures rather than two renderings.**

Measured: a terminal frame at width 80 is **685 px across and 60–330 down**; every drawn SVG
frame is **640 × 320 whatever the block's `height` says**, on all 101 of them. Matching heights
magnifies the three-row heatmap **tenfold, into a 6800-pixel tile of blocky cells.** Equal width
protects exactly what the sentence defends — neither half larger, both at reading size — and it
makes the height difference **the visible thing** rather than the thing the scaling erased. The
terminal half's native pixel height goes in the caption, so the ratio is recorded.

**And at 24-bit only for the pair.** The SVG arm has no ladder, so the other four rungs have
nothing to compare against — **they belong in the terminal sheet and not in the pair.**

### 4 · Two contact sheets

```
the terminal's    every form's default, tiled and labelled — REGENERATED, it is stale
the PAIRED one    every form's default as a side-by-side pair, tiled
```

**The paired sheet is the artefact to review first.** One image, every form, both arms —
**and a form where the two halves read as different products is visible in a second.**

---

## What to look for, and it is not correctness

**The rows already assert correctness. This is for the things no row can reach**, which this
campaign has now demonstrated eleven or twelve times.

```
does the same data read as the same figure     the whole test
weight              is one arm's ink heavier — strokes, fills, densities
proportion          the plot area against the furniture, in both
the gutter          the same fraction, and does it LOOK the same
tick density        the same count is not the same appearance at different resolutions
label size          an SVG label is a font; a terminal label is a cell
the legend          the same entries, and does it sit the same way
colour              the same slot resolving to the same hue — and whether the SVG's
                    antialiasing makes a tone read lighter
empty space         where each arm puts its slack
```

**And the specific things this campaign changed**, which have never been seen together:

```
family 1's mean     a diamond in the series colour, both arms
family 2's tree     topDown in SVG against the terminal's chosen rung
family 6's pie      the arc, the minimum-segment merge in one arm and not the other
the identity gutter a third in the terminal, a tenth in SVG — ruled, and unseen
the frame           four styles, and "grid" drawing gridlines in both
```

---

## How

**Extend the existing tools rather than writing a third.** `plot-catalogue.mjs` renders the
terminal corpus; `phase-catalogue.mjs` renders the SVG's 66. **The pairing is a third pass over
both outputs**, not a third renderer.

```
tools/plot-catalogue.mjs      regenerated · now exports representativeVariant (F313)
tools/svg-baseline.mjs        unchanged — it IS "widened to the full corpus" (F309)
tools/contact-defaults.mjs    enumerates the corpus, never filenames (F313)
tools/pair-catalogue.mjs      NEW — reads both, emits the pairs and the paired sheet
```

**Order matters and it has bitten before**: `plot-catalogue.mjs` **clears its directory**, so
anything writing into the same tree runs after it (F261).

**And the digests stay split** (F264) — **by not hashing the pairs at all** (F309). The concern
is right and a third digest is the wrong way to honour it: a hash over **derived** pixels moves
whenever either input moves, and reports *one of the two changed* without saying which — over two
corpora whose own gates already name the frame. Adding it would be F264's defect one level up.

---

## The gate

**This produces no source change, so the gates are a guard against collateral rather than the
point.**

**But two counters matter:**

```
how many pairs were produced        against how many the corpus should yield —
                                    a missing pair is a form that rendered in one arm
                                    and not the other, which is the sheet's whole job
how many refusals were drawn        a TOTAL PARTITION by named cause — see below
```

**The second counter as written cannot hold** (F310): *refusals drawn against `SVG_FAMILY`'s null
count, and they must agree.* The left is **frames** and the right is **forms** — 178 frames, 77
refused, 16 nulls — so run as written it reports a failure on a gate that is holding.

**Restated in units that can be true it does the job it was reaching for.** *Every refused frame is
attributable to a named cause, and the causes are enumerated:*

| cause | frames | recorded where |
|---|---|---|
| `SVG_FAMILY[form] === null` | 58 · 16 forms | `svg-baseline.mjs`, SB4 |
| `ohlc` | 4 | `svg-baseline.mjs`, SB4 |
| a non-default `origin` | 4 | `svg-baseline.mjs`, SB4 |
| **an empty value list** | **7** | **nowhere** |
| `flame`/`icicle`'s legacy datum | 2 | `phase-catalogue.mjs`, one tool along |
| **`treeLayout: "outline"`** | **2** | **nowhere** |

**The record names three causes and the corpus has six**, and the last row is the one nothing knew:
`tree`'s six variants are one hierarchy at six heights, `treeLayout` is the only field that differs,
and the arm draws `topDown` and `leftRight` while refusing the layout with the **least** geometry
above cells. **Invisible to the matrix, because a refused frame has no cells to disagree about.**

Compared **by equality in both directions**, and the family half against `SVG_FAMILY` **as forms
against forms** — which is the plan's own counter, in the units that make it assertable.

---

## What the sheet found, on its first read

**Four findings, and two of them are what the remaining forms have to match.**

**F314 — three claimed forms draw the input where the terminal draws a derivation.** `histogram`
plots **240 raw samples as 240 bars** against 8 counted bins; `density` plots the sorted values
(y **0–10**) against a kernel estimate (y **0.00–0.11**); `ecdf` plots the values in input order,
**not monotone**, and an ECDF is monotone by definition. **D14's class, recorded as one form** — the
D1–D16 sweep found `autocorrelation`, ruled, and stopped.

**No cell of the matrix can reach it**, which is this document's own argument arriving as a
measurement: both arms have all five decisions, `histogram` records twelve disagreements about
*labels*, and not one of them says the chart is of something else. **Open** — F259's default is a
`null`.

**F316 — the record has five columns and the corpus has at least seven.** **0 of 181** SVG frames
carry a gradient or `<defs>`, so the arm has no colour ramp at all; the `· N older not shown` notice
is on **4 of 191** terminal frames and **0** SVG. The matrix says `heatmap.legend: "agree"` because
both arms report `false` — the SVG having none, the terminal because its ramp is *coloured spaces*
and the reader takes stripped text. **And the notice was designed into the seam**: §2's `Figure`
declares `drops: { hidden, notice }` and the shipped type has no such member. **Open.**

**F313 — the defaults sheet was showing 44 forms of 46 and printing `45`.** Its tiles came from
`*-default-24bit.png`, which drops every form with no variant by that name (`horizon`, `pie`) and
adds every *variant* whose name ends in `-default` (`violin/bimodal-default`, tiled twice). The
sibling tool carries a comment about this exact filter naming `horizon`; it was fixed there and not
here — **the same pair F261 already caught once. Fixed.**

**F315 — width was the right axis and the fit was the wrong rule.** See §3.

---

## And it goes before the remaining forms

**Not after.** The residue and family 8 add twelve to fifteen forms, **and every one is a pair
nobody has looked at.**

**Reviewing the sheet now sets what the remaining forms are built to match** — and the
campaign's own record says the arms drift where nobody looks: **sixteen disagreements were
found by a sweep that ran once, and eleven or twelve defects have been found by reading frames
rather than by any row.**
