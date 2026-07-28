# B04 — Degradation

| Field | Value |
|---|---|
| **Type** | Behaviour |
| **Components** | C02 C09 C10 C12 C22 C23 · every surface |
| **Status** | Draft |

---

## 1. What this is

The tool runs on a 60-column SSH session with `TERM=dumb` and no cluster, and on a 200-column truecolour terminal with everything reachable. Both are real, and neither is a special case.

Degradation is specified per-component — C02's capability matrix, C10's colour ladder, C09's glyph substitutions, A02 §7's failure isolation — and each of those is correct on its own. What no component owns is whether the *combination* is still usable, and whether the axes interact.

That is this document: the four axes, the rule each obeys, and the one property that has to hold across all of them.

---

## 2. The four axes

They are independent. A terminal can be narrow and colourful, or wide and monochrome, and every combination occurs.

| Axis | Range | Owner |
|---|---|---|
| **Width** | 60 → 200+ | C11 column priority · per-surface layout |
| **Colour** | 24-bit → 1-bit | C10's ladder |
| **Glyphs** | Full Unicode → ASCII | C09 §4 substitutions |
| **Reachability** | Everything → nothing | A02 §7 failure isolation |

**The invariant across all four: no information is lost, only convenience.**

Every degradation moves information rather than discarding it. A dropped column reaches the expand row (C11 I2). A lost colour is carried by a glyph (D29). A lost glyph is carried by a word. An unreachable service says so rather than rendering as empty. There is no width, depth, locale or outage at which the tool shows something that is *wrong* — only versions that take more keystrokes to read.

---

## 3. Width

The three strategies, and when each applies.

| Strategy | Used by | Because |
|---|---|---|
| **Drop columns** | Tables (S03, S05, S06) | Dropped content reaches the expand row, so nothing is unreachable |
| **Change layout** | S07 diff, S08 failure rows | Both values of a diff must be visible or it is not a diff; a truncated path is unusable |
| **Drop whole blocks** | S11's plot, S13's panels | Three readable panels beat five cramped ones |

**Below 60 nothing renders.** S01's fallback replaces the frame, deliberately using no layout engine, no registry, no theme and no Unicode — it must work in a terminal too small for the machinery that would otherwise draw it.

Two surfaces state that they never drop at all (S14, S15) because their tables fit inside the minimum. That is worth saying rather than inventing a sequence for widths that do not occur.

---

## 4. Colour

Four levels, and the collapse at the bottom is the honest one.

24-bit passes hex through. 8-bit quantises while preserving lightness rank. 4-bit uses a **curated per-theme mapping**, because computed nearest-of-16 collapses tones onto each other. 1-bit drops colour entirely and ten tones become three typographic classes.

**That collapse is only lossless because of D29** — no information is carried by colour alone, anywhere. A failed row is `✗` *and* red, so at 1-bit it is `✗` and bold. If a single surface ever shipped a colour-only distinction, this axis would start losing information and the loss would be invisible to everyone whose terminal has colour.

Surfaces are not exempt: S05's health, S07's verdicts, S13's panel states and S15's token states all carry a word or a glyph beside their tone, and each surface tests it.

---

## 5. Glyphs

Every substitution is **1:1 by cell count** (C09 §4). That is what keeps measurement honest: `measure` takes width but not capabilities, so if an ASCII fallback occupied a different number of cells, every measured height would be wrong for non-UTF-8 users and the viewport would drift.

The ellipsis is the case that catches people — `…` is one cell, `...` is three, so the ASCII truncation marker is `~`.

Where no 1:1 substitution exists, the *content budget* changes at measure time instead. No default block requires that, and adding one that does is a design decision rather than an implementation detail.

---

## 6. Reachability

A02 §7's pattern, applied. The part is the unit; a failed part renders its own failure in place; fetching retries and computing does not.

What matters at the whole-session level is the **ordering of degradation**:

```
GitLab unreachable        →  one banner row degrades
Prometheus unreachable    →  one dashboard panel degrades
Platform API unreachable  →  header offline; verbs error; system commands still work
Terminal acquire fails    →  the only fatal case
```

**Only the last one ends the session.** A dev on a train with no network still has a shell, `git log` still works, and the tool says why rather than hanging. That is the difference between degrading and breaking, and it is why the far side being down is not modelled as an error state of the TUI.

---

## 7. Interaction between axes

The axes are independent but they compound, and two combinations are worth checking explicitly because each individually looks fine.

**Narrow plus monochrome.** At 60 columns and 1-bit, S03 shows four columns with no colour. Status is still distinguishable because it carries a glyph, and the glyph survives because status never truncates (C11 I10). Remove either property and this combination loses information.

**ASCII plus narrow.** Substitutions are 1:1, so ASCII changes nothing about which columns fit. A drop order that differed between locales would be a genuine defect, and the 1:1 rule is what prevents it.

**Offline plus everything else.** Failure states are text, so they degrade like any other content. A panel reading `prometheus unreachable` at 1-bit ASCII 60 columns is still legible, because it was never relying on a box or a colour.

---

## 8. Commitments

1. Four independent axes — width, colour, glyphs, reachability — and every combination occurs.
2. No information is lost on any axis; it moves to somewhere that takes more keystrokes to reach.
3. Width uses three strategies, chosen per surface by what would be destroyed otherwise.
4. Below 60 the fallback renders with no layout engine, registry, theme or Unicode.
5. The 1-bit collapse is lossless only because D29 holds; every surface tests its own compliance.
6. Every glyph substitution is 1:1 by cell count, so drop orders are locale-independent.
7. A failed part renders in place; only a failed terminal acquire ends the session.
8. An offline platform leaves a working shell.
9. Narrow-plus-monochrome and ASCII-plus-narrow are tested as combinations, not only as axes.
10. Degradation never produces something wrong — only something less convenient.

---

## 9. Tests

### Integration

- **B4.1**: for each axis, the documented strategy applies at each level — four sets.
- **B4.2** (C2): for every surface, at 60 columns, every field visible at 160 is reachable — on screen or in an expand row.
- **B4.3** (C5): for every surface, at 1-bit, every distinction visible at 24-bit is carried by a glyph or a word. **The D29 compliance sweep.**
- **B4.4** (C6): for every table, the drop order under ASCII is identical to the drop order under UTF-8.
- **B4.5** (C7): each of §6's four reachability levels produces the documented outcome.
- **B4.6**: below 60 the fallback renders with no call into the registry, theme or layout — asserted by spies.

### End-to-end

- **B4.7**: the full matrix — {60, 80, 120, 200} × {24-bit, 1-bit} × {UTF-8, ASCII} — sixteen configurations, every surface, golden-framed.
- **B4.8**: `TERM=dumb`, `LANG=C`, 60 columns, no cluster → the session opens, every verb errors clearly, `git log` works.
- **B4.9**: a session that loses the platform mid-use → header flips to offline, in-flight verb errors, prompt stays usable, system commands unaffected.
- **B4.10**: resize from 200 to 60 to 200 with content on screen → nothing lost either way; the same information is reachable at both ends.
- **B4.11**: a real SSH session on a 62-column terminal → usable end to end for the canonical drill chain (B03 §3).

### Fail-on-revert

- **B4.12** (C5): any surface shipping a colour-only distinction → B4.3 fails, and the 1-bit axis starts losing information invisibly.
- **B4.13** (C6): a substitution that changes cell count → B4.4 fails, and drop orders diverge by locale.
- **B4.14** (C2): a dropped column that does not reach the expand row → B4.2 fails.
- **B4.15** (C4): the fallback using the block registry → B4.6 fails, and it breaks in the terminals it exists for.
- **B4.16** (C8): an unreachable platform ending the session → B4.9 fails, and the tool becomes useless offline.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Capability detection | C02 |
| The colour ladder and palettes | C10 |
| Glyph substitution tables | C09 §4 |
| Column priority mechanics | C11 |
| Failure isolation's rules | A02 §7 |
| Each surface's own narrow layout | S01–S15 |
| Screen-reader output | Phase 1B |
