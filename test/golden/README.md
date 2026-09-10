# golden

**14 test files — 1 frame, 2 byte corpora, 10 renderings of blocks, 1 census.**

Those five figures are asserted against the directory by `corpus.test.ts`, and the
table below is parsed from this file rather than restated in code. **The reason is
what this file used to say.** It read, in full, *"Frames at 4 widths × 2 themes × 2
unicode modes"*, and every clause of it was false: not one file composed a **frame**,
the widths are `30/40/56/60/80/100/120/160` depending on the file, and the theme set
has had **three** members since `high-contrast` shipped. A category whose own
description names something it does not contain reads as covered for exactly as long
as nobody opens it (F163). A description nothing checks goes stale silently; this one
now fails a row.

## What is here

| file | kind | what it holds | `src/shell/` it imports |
|---|---|---|---|
| `blocks.test.ts` | lines | `ONE_PER_KIND` — one block of every kind, at 4 widths × 4 variants | — |
| `containment.test.ts` | lines | a refusal is a frame: the fault path at 3 widths | — |
| `continuation.test.ts` | lines | the continuation mark under a command's first character, at 2 widths | `config.js` `documents.js` `paint.js` |
| `corpus.test.ts` | census | this table against the directory — the row that fails when the description stops being true | — |
| `fallback-docker.test.ts` | lines | docker's real JSON through C07's fallback, unadapted | — |
| `patch.test.ts` | lines | C25's patch block at 4 widths × 4 modes | `builders/index.js` |
| `plot-forms.test.ts` | lines | every plot form, plus the vertical and candlestick corpora | — |
| `plot-meshes.test.ts` | lines | the mesh forms at one width | — |
| `plot.test.ts` | lines | C12's plots at 4 widths × 4 modes, and the wide arm | — |
| `session-frame.test.ts` | **frame** | a composed session — chrome, base, prompt window, wash, cursor, diff | through `../support/frame-golden.js` |
| `states.test.ts` | lines | `STATES` — one entry per *state*, at 2 widths × 5 variants | — |
| `svg-baseline.test.ts` | bytes | the SVG arm's committed corpus, compared by bytes | — |
| `table.test.ts` | lines | C11's tables at 4 widths | — |
| `terminal-baseline.test.ts` | bytes | the terminal arm's 1780 frames, compared by bytes | — |

**The kinds are not a taxonomy, they are different failures.** `lines`
renders a block through `measurable().renderToLines` and cannot see anything the
shell decides. `bytes` commits a generated corpus and answers *did any of it move*.
`frame` drives a real `Session` and reads the screen its writes accumulate to. `census`
renders nothing and asserts about the corpus itself.

**The fourth column is why the kind is not simply "imports from `src/shell/`".** Two
`lines` files do: `continuation.test.ts` takes a paint *helper* and composes rows by
hand, `patch.test.ts` takes a *builder*. Neither composes a frame. A grep answers
three and the number is two (F738), and the number that matters is one.

## The three axes, and the third is why this file has prose

`blocks.test.ts` frames `ONE_PER_KIND` — a `Record<BlockKind, Block>`, exhaustive over
kinds by its type and holding exactly one state of each. `states.test.ts` frames
`STATES`, one entry per *state*.

The first axis answers *does this kind render*. It can answer nothing about *which
state it is in*, so a new state of an existing kind is invisible to it by construction
— which is how the continuation mark, the gapped series and the wide ramp's lowest step
each shipped with golden green and each needed a frame added afterwards.

`ambiguousWidth: "wide"` is a variant in `states.test.ts` and nowhere else: `cells()`
counts a blank braille cell as one, so every width and length assertion passed while the
lowest reading drew as padding (F171). **The only instrument that reaches a glyph nobody
can see is a picture.**

**The third axis is the layer.** Both of the above are axes *within* a block, and a
corpus complete on both still stops one layer below the thing that composes a frame —
which is F163: the theme's background base, the prompt's window and its elision markers,
the selection wash, the chrome rows, the frame's height arithmetic, the cursor sequences
and the write-as-a-difference had never appeared in a snapshot at all.
`session-frame.test.ts` is that axis, and its own header says which scene constructs each
of the seven.

## Adding to the corpus

- **A state**: three lines in `test/support/states.ts` plus a name in
  `test/contract/states.test.ts` — the equality arm fails until both exist, in either
  direction. A03 CP11 records what that arm cannot do.
- **A theme**: nothing. `session-frame.test.ts` draws `Object.keys(defaultTheme)`, so a
  fourth theme joins the frame corpus on the commit that adds it. `blocks.test.ts` and
  `table.test.ts` still hold hand-written pairs, and that is the residue F163's second
  instance names — `high-contrast` shipped into neither.
- **A file**: a row in the table above, or `corpus.test.ts` fails. The set is compared by
  equality in both directions, so a file deleted fails it too.

## What no snapshot here can do

A snapshot **records**; it does not check. Every frame in this directory was generated by
the code it is now defending, so a defect present on the day it was written is a defect
the corpus will hold in place. What makes that survivable is not review — a golden reads
as correct because it is what the code does — it is the mutation table: each of these
files owes an answer to *which change moves which frames*, and one that moves nothing is
a finding about the corpus rather than a licence. `session-frame.test.ts`'s table is in
F1029.
