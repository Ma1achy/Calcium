# Note — rename `diff` to `comparison`

| | |
|---|---|
| **Status** | **Done.** Landed before C24, as scheduled |
| **When** | After C23 landed, before C24 started — the window it names |
| **Why then** | C24 exports every block kind by name. After that it is a breaking change to a published package with `docker-tui` consuming it; before it, an internal rename |

---

## What landed

Mechanical, as predicted: the type, the union, the definition, the validator arm,
the registry entry, five specs and two surfaces. Both of this note's own
corrections were already satisfied by the code — `Diff.rows[].comparison` and
`a`/`b` were in `types.ts` before the rename touched it.

**Two findings came out of it, and neither is a rename.**

**The renderer's header said `before` and `after`.** The type has carried `a`/`b`
since C04 and the screen said otherwise, so the ruling in this note was half
implemented for as long as the kind has existed — directional labels on a kind
whose primary consumer compares two *runs*, where there is no before-and-after.
Nothing asserted the labels, which is why the two could disagree. T1.4b asserts
the rendered header now, and the mutation fails it.

**A missing fixture measures as 1.** `ONE_PER_KIND["diff"]` went stale under the
rename and `measure` answered 1 rather than raising — and seven of T1.4's
fourteen entries document a height of 1, so each would have passed against no
fixture at all. Only `comparison` failed, and only because its height is 2. The
row asserts the fixture is defined before measuring it.

**The arrow needed no confirmation in the end.** It is not in this kind's
renderer at all — `2 → 3` is a surface's rendering and C09 §4's substitution is
the glyph table's, so a rename of the kind could not disturb it.

---

## The problem

`diff` and `patch` sit in the same block union, and **`patch` is the thing people mean
by "diff"**. Someone reaching for a diff finds `diff` and gets a two-column field
comparison.

C25's spec already carries a sentence explaining why they are separate kinds. That
sentence exists because the names do not explain themselves — which is the tell.

What `diff` actually renders is **two values for the same key, side by side**, in two
situations:

- S07 comparing two runs' metrics — no before and after, just two runs
- S10 comparing deployed to proposed — a genuine change

`changes` was rejected for the first reason: comparing two runs is not a change.
`fieldDiff` keeps the word causing the confusion.

`patch` stays `patch`. It is the standard term for a unified diff and it matches
`structuredPatch`, hunks, and every tool that produces one.

---

## The shape

```typescript
type Comparison = Readonly<{
  kind: "comparison";
  id:   string;
  rows: readonly Readonly<{
    field:       string;
    a:           Cell;
    b:           Cell;
    comparison?: "same" | "better" | "worse" | "changed";   // unchanged — see below
  }>[];
  labels?: readonly [string, string];    // "deployed" / "proposed", "run a" / "run b"
}>;
```

**The row field keeps its name, and this is stated so nobody renames it for
symmetry.** An earlier draft of this note proposed `verdict?: Tone` for that
column, written without knowing that `Diff.rows[].comparison` already exists —
C04 §2 and `src/data/viewmodel/types.ts` both carry it, with exactly this closed
vocabulary. `Comparison.rows[].comparison` reads fine, and a kind gaining the
same word as one of its row fields is not a collision. Renaming a field that is
already correct, to avoid an echo, would turn a mechanical rename into a
behavioural one and cost every adapter that sets it.

`Tone` was wrong on its own terms as well: the four values are a **verdict about
the pair**, and the tone they render in is C10's to decide from that verdict. A
field typed `Tone` would have moved the decision into the adapter.

**`a` and `b`, not `before` and `after`.** Positional rather than directional, because
S07's two runs have no before-and-after. Directional names would be wrong for half the
consumers and would invite an adapter to swap them to make the naming true.

**`labels` is what makes S10 legible.** A bare `2 → 3` does not say which side is live.

---

## What it touches

| | |
|---|---|
| C04 | The type, the `Block` union, its invariants and commitments. **The `comparison` row field is untouched** |
| C09 | The renderer, its `measure`, §3's kind table, the 17-kind counts |
| C24 | The export list, and `b.diff()` → `b.comparison()` |
| S07 | §2 and §3 |
| S10 | §4's scale case |
| tests | Every citation of the kind; golden frames move |

**The arrow stays.** `spec.replicas   2  →  3` is the right rendering whatever the kind
is called, and C09 §4 already handles `→` → `->` as a 1:1 substitution at two cells
against one. Worth confirming that survives the rename, since it is the one place a
measured width could be disturbed by what is otherwise a pure rename.

---

## Why the timing is the whole point

Before C24: a mechanical rename across six files and their tests.

After C24: a breaking change to a published package, with `docker-tui` consuming it,
requiring a major bump under A04 §9 — where R01 R4.5's rule is that a minor bump
requiring reference-app changes was not minor.

The window closes when C24's export list is written.
