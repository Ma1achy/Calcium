# Mermaid theming — noted, not designed

**Not scheduled. A note so the question survives**, because entry 9 shipped with
`colorMode: "none"` and a one-line reason, and the reason may not hold.

---

## What ships today

`mermaidCode(source, caps)` calls `renderMermaidASCII` with:

```
useAscii      → C02's unicode capability. The renderer's own switch turns out to be
                C02 I9's switch, which is why the fit was clean
colorMode     → "none", ALWAYS. Because C10 owns colour and a diagram is not the exception
```

**The `colorMode: "none"` decision was right for the reason given** — a library that has
already decided its colours cannot be themed, and a block that names a palette slot is how
every other kind works.

**But it means every mermaid diagram is monochrome**, and a flowchart with fifteen nodes in
one colour is harder to read than one where the decision nodes differ from the process nodes.

---

## The question

**Can a mermaid diagram be themed without letting the library decide colours?**

**Three things would have to be true:**

**1 · The renderer must return structure, not just glyphs.** Today `renderMermaidASCII`
returns a grid of text lines. **If it can also say *this cell belongs to node N* or *this cell
is an edge*, the colour is Calcium's to assign.** If it cannot, the answer is no and the
reason is the library's API rather than a ruling.

**Worth measuring before designing** — the package may expose a structured intermediate, and
`colorMode` having a value other than `"none"` suggests it knows which cells are which.

**2 · Mermaid's own semantics would map onto palette slots.** Mermaid source can carry
`classDef` and `:::className` — **which is a categorical assignment the author already made**,
and it maps onto the categorical palette exactly as a plot's series do.

```
classDef error fill:#f00      → the author says "these nodes are errors"
:::error                        → and Calcium resolves it to Tone.error, not to #f00
```

**That is the shape that would make it work**: the source names a *class*, the theme decides
what a class looks like. **Which is what `classDef` is for and what every mermaid consumer
abuses by putting hex codes in it.**

**3 · The degradation ladder has to hold.** At 1-bit a themed diagram loses its colour, so
**the distinction must survive in the glyphs** — F34, and it is the same rule the plot forms
now satisfy through `CATEGORY_MARKS`. A diagram whose only distinction is colour is a diagram
that collapses on a monochrome terminal.

---

## What it would buy

```
node kind by tone          a decision node, an error path, an external system
edge kind by tone          a happy path against a failure path
subgraph background        once I29's background painting exists, a subgraph is a
                           region — and that is the clearest thing a colour can say
                           about a flowchart
```

**And the consumer is Prism's own docs.** `shadow → canary → production` is a state machine,
and `/promote --explain` drawing it with the current stage highlighted is more useful than
the same diagram with every node identical.

**That last one is the strongest argument**: a diagram where *one node is highlighted because
that is where you are* is a different artefact from a static picture, and it needs exactly one
tone.

---

## What would refuse it

**If the library only returns glyphs**, the answer is no without a rewrite, and a mermaid
renderer is not something to write here — that was the whole argument for taking the
dependency.

**And the maintenance risk applies**: ten releases in a month then five and a half months of
nothing. **Building on a structured API that a dormant package exposes is a bigger bet than
calling one function** — which is why the transform is currently one call wide and should stay
that way unless this is worth more than the risk.

---

## The measurement to run first

```
1  does beautiful-mermaid expose anything beyond the rendered string?
2  what does colorMode accept other than "none", and what does it change?
3  does classDef / ::: survive into whatever it returns?
```

**Three questions, one afternoon, and they decide whether this is a design or a refusal.**

### Answered 2026-09-03 — from `node_modules/beautiful-mermaid/dist/index.d.ts`, nothing run

**1 · Yes and no.** `parseMermaid(text): MermaidGraph` (`index.d.ts:191`) exposes the structure —
nodes, edges, subgraphs, `classDefs`. But `renderMermaidASCII(text, options): string` (`:267`)
returns a bare string and `PositionedGraph` (`:228-248`) is pixel geometry for the SVG path.
**There is no cell→node map**, so the design above — colour a cell by which node it belongs to —
is refused by the API rather than by a ruling.

**2 · An injection point this note did not consider.** `ColorMode` (`:216`) is
`'none' | 'ansi16' | 'ansi256' | 'truecolor' | 'html'`, plus `'auto'` on the option (`:237`). It
colours **by role, not by node**: `AsciiRenderOptions.theme?: Partial<AsciiTheme>` (`:238`) takes
eight roles — `fg border line arrow accent bg corner junction` (`:197-213`). §1's sentence *colorMode
having a value other than none suggests it knows which cells are which* was wrong: it knows which
**roles** the cells are.

**3 · Into the parse only.** `classDefs` (`:6`), `classAssignments` (`:8`), `nodeStyles` (`:9`),
`linkStyles` (`:11`) and `PositionedNode.inlineStyle` live on `MermaidGraph`/`PositionedGraph`;
nothing carries them onto the ASCII path.

**So the design is re-scoped rather than refused: role → palette slot.** Eight `AsciiTheme` roles
map onto C10 tones — `fg` → text, `border`/`corner`/`junction` → frame, `line`/`arrow` → muted or
accent, `accent` → the primary series slot, `bg` → none — and `src/presentation/mermaid.ts` passes
`theme` and a `colorMode` chosen from `caps.colour` instead of `"none"`. About 80 lines across
C09/C10, the SGR the library emits parsed back into cells the way any coloured text is. Still
planned; `test/contract/mermaid.test.ts` exists and there are no catalogue frames for a coloured
diagram, so the first frame is the first measurement.
Do not design it before running them — the last four dependency decisions in this project
were settled by measurement and reversed when they were not.
