# S01 — The frame

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Chrome — always present, never scrolls |
| **Package** | `@fmx/calcium` (structure) + `prism-tui` (header and footer content, via hook 5) |
| **Data source** | C22 `SessionSnapshot` · C14 `VisibleRange` · C17 buffer and cursor · C19 ghost text · C16 `activeTarget` |
| **Source** | `t01` §The frame · A01 D6, D24a, D30 · A02 §6 hook 5 · C22 §6 |
| **Status** | Draft |

---

## 1. Purpose

S01 is the only thing on screen that is always on screen. Every other surface renders *into* it.

It owns four regions with fixed vertical ownership, the arithmetic that divides the terminal between them, and the two pieces of chrome — header and footer — that carry session state so nothing else has to.

The constraint that governs every decision here: **the frame must never render more than `rows` rows.** A newline written while the cursor sits on the last row scrolls the alternate screen, producing a visible jump and desynchronising everything below it (C01 §2). Height arithmetic is therefore clamped at every step rather than trusted.

`tui-kit` owns the structure; the header's and footer's *content* is app-supplied (F5). What follows is the structure, plus Prism's content as the worked example.

---

## 2. The screen

At 80 × 14, mid-session, with the live block navigable:

```
▲ prism  v1.0.0   fmx-prod · malachy@fmx.io              ● live         14:23:07
────────────────────────────────────────────────────────────────────────────────
   ✓ tier-1 rules                        22 rules · 0 errors · 587ms
   next: /test …   /experiment submit …                              587ms

▌ ── ps · 4 of 11 · --mine · last 24h ──────────────────────────────────────────
▌
▌   all ×11    training ×9    evaluation ×2
▌   ● running ×1   ✓ succeeded ×6   ✗ failed ×2   ○ queued ×1
▌
▌      uuid     family            status     detail     metric   age
▌  ▸ ● a3f9b21  digit-classifier  running    ep 17/40   0.0372   23m
▌  ▸ ✓ 7c2d4e1  decoder-zoom      succeeded             0.0089   41m
────────────────────────────────────────────────────────────────────────────────
❯ /promote a3f9b21 --open-mr
────────────────────────────────────────────────────────────────────────────────
↑↓ rows   ⏎ drill in   ␣ expand   f filter   s sort   ⌃↑ prev   esc prompt
```

**The fence is a diagram of the four regions, and its box-drawing marks their boundaries rather than depicting rows.** The three horizontal rules are not rendered: the frame is header, viewport, prompt, footer and nothing between them, which is exactly §3's arithmetic. Counting them gives a fifteen-row frame from a fourteen-row terminal, and a frame one row over scrolls the alternate screen.

Stated because the picture invites the other reading and C22 took it — the deferral asserting this figure could not be written for two commits while §2 and §3 disagreed, and nothing said which was the artefact. Three reasons the rules are not real:

- **The fixed overhead is already at its limit.** At the 60 × 16 minimum, header + footer + a one-row prompt leaves thirteen rows of viewport. Three rules take it to ten — nearly a quarter of the smallest supported frame spent on separators, permanently, because only the viewport flexes.
- **The boundaries already carry information.** `▌` marks live against frozen, `❯` marks the prompt, and the transcript's own `rule` blocks separate commands *with a label*: `── ps · 4 of 11 · --mine ──`. A bare line above the prompt would be the only chrome in the system that costs a row and says nothing. C09's `rule` kind exists precisely because a separator carrying text earns its row.
- **The caption was the stale half.** It said 100 × 30 against a figure eighty cells wide, so one of the two was already wrong before the rules were counted.

The `▌` gutter marks the live block (D6). The footer has switched to row keys because focus is in that block.

**The table region is illustrative and now says what S03 §3 declares.** It drew `running · ep 17/40` as one status cell and `0.0372 ▁▂▃▅▆` as one metric cell — both of which S03 forbids, the first by commitment 2 with T6.1 as its fail-on-revert test, the second by the column split in §3. A spec contradicting a sibling spec's fail-on-revert test is worse than a stale picture, so it is corrected here rather than left until C22 makes this frame composable. The columns shown are the ten that survive at 80 in S03's drop order, minus `kind` and `owner` for space at this narrower illustration width; S03 §2 is the authority on the layout and this one is a frame with a table in it.

---

## 3. Height arithmetic

```
headerRows   = 1
footerRows   = 1
promptRows   = min( editor.displayRows(width, gutter), floor(rows / 2) )
viewportRows = max( 0, rows − headerRows − footerRows − promptRows )
```

with `gutter = { first: 2, cont: 2 }` (D24a, C22 §6).

**The prompt is capped at half the terminal.** Pasting two hundred lines is a real thing people do (C17 T5.2), and an uncapped prompt would consume the entire frame and leave the viewport at zero. Beyond the cap the prompt **windows around the cursor**, computed from C17's `cursorCell`, with `⋯` markers on whichever edges are elided. C17 needs no scroll model for this — buffer plus cursor position is enough.

**A cap of one row shows the last row and no marker.** The window is the marker plus the rows that follow it, so at a cap of one there is nothing for the marker to sit beside: it elides everything it was written to annotate, and the prompt paints as `⋯` with the typed command nowhere on the screen. One row of the command is strictly more informative than a marker reporting that a command exists. The marker is therefore dropped at that cap and reappears at two. The cap reaches one only below the size gate's minimum — which is reachable rather than theoretical, because a resize can arrive between the gate and the frame (§6, C22 §8b), and the arithmetic has to be right there rather than nearly right.

**The prompt draws the rows C17 measured, rather than wrapping the buffer again.** `editor.layout(width, gutter)` returns the display rows and this surface pads each by the gutter it passed in — the first by `first`, the rest by `cont` (C17 I18, §7b). A second wrap here would be C09 I1's divergence in the one place it moves the whole frame: the two would agree on ordinary commands and part company at a wrap boundary, a double-width glyph, or a line that exactly fills its row, which is where a prompt one row off comes from.

**The rows painted are the rows the frame was composed from, and the two are compared before output.** The prompt's height enters the frame twice — once as a number, when the regions are computed, and once as rows, when the prompt is drawn. The sum check cannot see those two disagree: it checks the composed frame against itself, and header + viewport + prompt + footer stays equal to `rows` whatever number the prompt was composed with. A frame composed against a one-row prompt and painted from three is internally coherent and describes a different prompt than the one the editor holds — and what reaches the screen is the degeneracy above, a lone `⋯`. So `promptWanted` is compared with the rows handed to the paint, and a frame that fails the comparison draws the fallback exactly as a frame whose heights do not sum does.

Every derived height is clamped at zero or greater, and the sum is asserted equal to `rows` before any output is written.

---

## 3a. Layers float, and the arithmetic above cannot see them

A layer takes no rows from the four regions — it is drawn over the frame after
they are painted, so `viewportRows` is the same with three overlays open as with
none. **That is why the sum check could not see that nothing drew them at all.**
C15 has been placing layers correctly since it landed and no component composited
one, so the completion menu, reverse search and the exit confirm were all
invisible while every height in §3 held at every width. A check that catches a
region wrong by one row cannot catch a region that is never drawn.

**A layer's box is relative to the viewport region, and the drawer adds that
region's top.** C15 receives the region as a parameter to `layout()` and holds no
geometry of its own — that is why it imports neither C14 nor `terminal/`. Handing
it the whole terminal instead would require it to know where the viewport sits,
which means knowing the header's height, which is this section's arithmetic
arriving inside a component that was built specifically not to have it. So:

```
layout region  = { width: columns, height: viewportRows }
frame row      = headerRows + placed.top
frame column   =              placed.left
```

Three consequences, and each is a rule somewhere else that this one settles:

- **A pushed view fills the viewport and nothing else.** Header and footer are
  untouched (C15 T4.4), and the drawer treats it as a layer whose box *is* the
  region rather than as a replacement for the transcript — one compositing rule
  for both layer kinds instead of a second one that only view layers take.
- **The prompt's anchor is a region row**, which puts it one row past the
  region's bottom edge, because the prompt is not in the viewport. A menu
  preferring `above` then occupies the last rows of the viewport, directly over
  the transcript and immediately above the line it belongs to; `below` has no
  room and flips. This is the one conversion where a region row and a terminal
  row differ by exactly the header's height, and an off-by-one produces a menu
  overlapping the line it was raised from.
- **A mouse event is translated once, for both rungs.** C16 tests a point
  against a layer's box and against the viewport, and the two must be in the
  same coordinate system or a click near a layer's edge resolves to the row
  above the one it landed on (C16 §4).

**Every cell of a layer's box is written, background included.** The prompt or
the transcript beneath it has already painted those cells, so a drawer that
writes only the glyphs its blocks produced leaves the old content showing in the
gaps — and the symptom is text bleeding through a menu, which reads as a renderer
defect rather than as a compositing one. Layers are drawn in the order `layout()`
returns them, bottom-first, so the top layer wins every cell it covers.

---

## 4. Fields

### Header — left to right

| Field | Source | Format | Dropped below |
|---|---|---|---|
| Mark | Static | `▲ prism` | never |
| Version | `session.version` | `v1.0.0` | 90 cols |
| Cluster | `session.cluster` | `fmx-prod` | never |
| Identity | `session.identity` | `malachy@fmx.io`, then `malachy`, then dropped | 100, then 70 |
| Health | `session.health` | §5 | never |
| Clock | Injected clock | `14:23:07`, then `14:23` | 80 cols |

**"Dropped below" means the field is absent at widths strictly narrower than the stated one.** A field listed at 90 is present at 90 and gone at 89. Stating the boundary rather than implying it is what makes T1.8 checkable.

**Cluster and health never elide.** Which cluster you are talking to and whether it is reachable are the two facts whose absence causes a wrong action; everything else is convenience. Elision order is fixed and tested rather than emergent.

### Prompt

`❯ ` then C17's buffer, then C19's ghost text in `muted` tone. The cursor is placed from `cursorCell(width, gutter)`.

`(prism) ❯` is gone — it marked shell mode, which the `/` prefix makes unambiguous and the header already carries (D24a).

### Footer

Hints drop in a fixed order as width shrinks, rightmost-first: `? help`, then `/ commands`, then `⌃r search`, then `↑↓ history`, then `↹ complete`. `⏎ run` is never dropped — a footer that cannot tell you how to submit is worse than no footer.

The order is fixed and golden-framed rather than emergent, for the same reason S03's column order is: an order that falls out of available width is an order nobody designed.

Static key hints, with **one** context axis: when `activeTarget` is `liveBlock`, it shows row keys instead of shell keys.

That is the only chrome that reflects state. A footer that rewrites itself continuously is more distracting than useful, and context-sensitive help is `?` (C16 §6).

---

## 5. States

| State | Trigger | Render |
|---|---|---|
| **Loading** | Banner sections still fetching (C22 §4 step 7) | Frame complete; the welcome block fills in progressively. The prompt is usable throughout |
| **Empty** | Fresh session, no commands | Header, welcome block, prompt, footer. The viewport is not blank — the welcome is its first entry |
| **Degraded — offline** | `health: "offline"` | Header shows `✗ offline` in `error` tone. Nothing else changes |
| **Degraded — expiring** | `health: "expiring"` | Header shows `▲ token 4d` in `warn` tone, taking precedence over `live` |
| **Degraded — no colour** | `colourDepth: 1` | Tones become typographic (C10 §3); health keeps its glyph, so the state is still readable |
| **Degraded — ASCII** | `unicode: "ascii"` | `▲`→`^`, `▌`→`|`, `●`→`*`, rules use `-`. All 1:1 by cell count (C09 §4), so geometry is unchanged |
| **Narrow** | 60–79 cols | Version, identity and seconds drop per §4; the footer drops hints per the fixed order below |
| **Too small** | Below 60 × 16 | §6 |

The health indicator has four states and is the header's only variable element:

| Health | Render | Tone |
|---|---|---|
| `live` | `● live` | ok |
| `degraded` | `▲ degraded` | warn |
| `offline` | `✗ offline` | error |
| `expiring` | `▲ token 4d` | warn — takes precedence over `live` |

---

## 6. The too-small fallback

Below 60 × 16 the frame is replaced entirely:

```
Terminal too small

Minimum   60 x 16
Current   44 x 12

Resize to continue.
```

**Rendered with no layout engine, no block registry, no theme** (C22 I8, C02 §Size). Plain text, no colour, no box drawing, positioned top-left. It must work in a terminal too small for the layout engine to produce a sane result, so it does not use one — and it uses `x` rather than `×` so it works with no Unicode either.

Session state survives. This is a render mode, not an error state: the frame returns on resize with the transcript, history and input buffer intact.

---

## 7. Interactions

S01 handles no keys. It reads `activeTarget` to choose a footer and renders the cursor where C17 says it is.

Focus order is C16's (A02 Seam 3). The gutter is drawn from `VisibleRange.live` (C14 I17) and is **frame chrome, not block content** — it enters no measurement and no theme token beyond a tone.

---

## 8. Commitments

1. Four regions with fixed vertical ownership; only the viewport flexes.
2. The frame never renders more than `rows` rows, asserted before output.
3. Every derived height is clamped at zero or greater.
4. The prompt caps at half the terminal and windows around the cursor beyond it.
5. The prompt gutter is `{first: 2, cont: 2}` and is passed to C17, never assumed by it.
6. Header and footer content is app-supplied; `tui-kit` owns only the structure.
7. Cluster and health never elide; header elision and footer hint-dropping are both fixed orders, tested rather than emergent, and `⏎ run` is never dropped.
8. Health has four states and is the header's only variable element.
9. The footer has exactly one context axis — shell keys versus row keys.
10. The gutter marker is chrome and enters no measurement.
11. The too-small fallback uses no layout engine, no registry, no theme, and no Unicode.
12. Session state survives the too-small state; it is a render mode, not an error.
13. The prompt draws the rows `editor.layout` returned rather than wrapping the buffer a second time.
14. The elision marker needs a row to sit beside; at a prompt cap of one the last row is shown and no marker is.
15. The prompt height the frame is composed with and the row count it is painted from are compared before output; a frame where they disagree draws the fallback.
16. **Layers are composited over the four regions and take no rows from them.** A layer's box is relative to the viewport region and the drawer adds that region's top; every cell of the box is written, background included; the top layer wins each cell (§3a).

---

## 9. Tests

Six tiers, plus golden frames at 80 / 100 / 120 / 160.

### Tier 1 — unit

- **T1.1**: height arithmetic for a one-row prompt at 24, 30 and 50 rows → the four regions sum to `rows` exactly.
- **T1.2**: a three-row prompt → the viewport shrinks by two, the sum still holds.
- **T1.3**: a prompt whose `displayRows` exceeds `floor(rows/2)` → capped; the viewport keeps at least the remainder.
- **T1.4**: at `rows = 16` with a 40-row prompt → prompt capped at 8, viewport 6, footer and header 1 each.
- **T1.5**: the windowed prompt shows the rows around `cursorCell.row`, with `⋯` on each elided edge.
- **T1.5b** (C14): a three-row prompt at a cap of one → the last row is rendered and no `⋯` appears.
- **T1.5c** (C15): a frame composed for a one-row prompt and painted from three rows → refused before output, and the fallback is drawn rather than a prompt windowed to nothing. The state cannot be reached from a session until input is accepted (C22 §4 step 8), so the divergence is closed by a comparison rather than by a test of the wiring.
- **T1.6**: each health state renders its documented glyph and tone — four cases.
- **T1.7**: `expiring` with a live cluster → `expiring` wins.
- **T1.8**: header elision at 100, 90, 89, 80, 79, 70 and 69 columns → the documented fields are present at the boundary and absent one cell below it.
- **T1.8b**: footer hints drop rightmost-first in the documented order; `⏎ run` survives at 60.
- **T1.9**: cluster and health survive at 60 columns.
- **T1.10**: `activeTarget === "liveBlock"` → row-key footer; anything else → shell-key footer.
- **T1.11**: the gutter is drawn beside exactly the entries whose `VisibleRange.live` is true.
- **T1.12** (§3a): a layer placed at `top: 0` in the region draws on the frame's second row, not its first — the header survives, and the one conversion where a region row and a terminal row differ by exactly the header's height is asserted at the anchor as well as at the frame. At the frame an off-by-one reads as a rounding choice; at the anchor it is a wrong number.
- **T1.12b** (§3a): a layer whose blocks produce no glyph for a cell inside its box still writes that cell — the prompt beneath does not show through. Asserted against a layer narrower and shorter than its box, because a full-bleed one passes whatever the loop does.
- **T1.12c** (§3a): two overlapping layers → the later-pushed one owns every shared cell, and the earlier one owns the rest of its own box.
- **T1.12d** (§3a): a pushed view fills the viewport region and leaves header, prompt and footer exactly as they were painted (C15 T4.4, from the frame's side).

### Tier 2 — contract / interface

- **T2.1** (C2): for a fuzz corpus of terminal sizes 60×16 to 400×200 × prompt heights 1 to 300, the rendered row count equals `rows`, never more.
- **T2.2** (C3): no computed height in that corpus is negative.
- **T2.3** (C10): measured transcript heights are identical with and without the gutter — it costs no rows.
- **T2.4** (C5): the gutter passed to C17 matches the prompt S01 renders, so `displayRows` equals the rendered height (C17 T2.1, from the frame's side).
- **T2.5** (C6): swapping the chrome hook changes the header and footer and nothing else.
- **T2.6** (C11): the fallback render calls neither the block registry nor the theme — asserted by spies.
- **T2.7**: every `SessionSnapshot` field consumed by the header has a documented format and elision point.
- **T2.8** (C13): the rows the prompt draws are the ones `layout` returned, asserted as identity rather than equality — a second wrap here cannot be written without the two coming apart (C17 I18).

### Tier 3 — edge cases

- **T3.1**: exactly 60 × 16 → the full frame, not the fallback.
- **T3.2**: 59 × 16 and 60 × 15 → fallback on each.
- **T3.3**: `rows = 3` (below minimum, but exercised) → fallback; no negative viewport.
- **T3.4**: an empty transcript → viewport renders blank rows, not a collapsed frame.
- **T3.5**: a transcript taller than the viewport → only the visible range renders.
- **T3.6**: identity absent (`null`) → the field is dropped, not rendered as `null` or `undefined`.
- **T3.7**: a cluster name longer than the header → truncated with the capability-correct marker; health still renders.
- **T3.8**: a 5,000-character single-line prompt at 80 columns → windowed, capped, cursor visible.
- **T3.9**: a 200-line pasted prompt → capped at half the terminal, cursor visible, viewport non-zero.
- **T3.10**: the cursor at the first and last row of a windowed prompt → visible in both, with the marker on the correct edge only.
- **T3.11**: under `unicode: "ascii"` → `^`, `|`, `*`, `-` substitutions, and the row count is unchanged from UTF-8.
- **T3.12**: at `colourDepth: 1` → every header state remains distinguishable by glyph.
- **T3.13**: a resize from 120 × 40 to 61 × 16 to 44 × 12 and back → full, full, fallback, full; state intact throughout.
- **T3.14**: ghost text longer than the remaining width → truncated, never wrapping the prompt onto an extra row.

### Tier 4 — integration

- **T4.1** (with C22): each health transition updates the header within one frame.
- **T4.2** (with C22, C17): the gutter S01 passes and the prompt it draws agree at every width.
- **T4.3** (with C14): `VisibleRange` renders top to bottom with `skipRows` honoured at both edges.
- **T4.4** (with C14, C13): the live entry gains the gutter; a frozen streaming entry does not.
- **T4.5** (with C16): moving focus into the live block switches the footer within one frame.
- **T4.6** (with C19): ghost text renders in `muted` after the cursor and never enters C17's buffer.
- **T4.7** (with C03): a header clock tick commits `"spinner"`, not `"input"` — the clock never pre-empts a keystroke.
- **T4.8** (with C10): a theme switch redraws the frame with identical geometry.
- **T4.9** (with C15): a pushed view occupies exactly the viewport region; header and footer are untouched.

### Tier 5 — e2e

- **T5.1**: golden frames at 80 / 100 / 120 / 160, in both themes, both unicode modes, and at all four colour depths.
- **T5.2**: golden frames for each of the eight §5 states.
- **T5.3**: a real session at 60 columns → every header field that survives is readable and nothing overlaps.
- **T5.4**: pasting 200 lines into a real 80 × 24 terminal → the frame holds, the viewport stays usable, submission works.
- **T5.5**: dragging the terminal edge continuously from 160 to 44 and back → no blank frame, no scroll, no corruption.
- **T5.6**: a session left idle for ten minutes → only the clock changes; no drift, no leak, no spurious repaint.

### Tier 6 — fail-on-revert

- **T6.1** (C2): an off-by-one making the frame `rows + 1` tall → T2.1 fails, and every frame scrolls the alternate screen.
- **T6.2** (C4): removing the prompt cap → T3.9 fails and a paste eats the viewport.
- **T6.3** (C5): letting C17 assume a gutter → T2.4 fails and the viewport is one row wrong on wrapped input.
- **T6.4** (C7): eliding cluster or health first → T1.9 fails.
- **T6.11** (C7): dropping `⏎ run` from the footer, or dropping hints in a different order → T1.8b fails.
- **T6.5** (C9): adding a second context axis to the footer → T1.10's exhaustive check fails.
- **T6.6** (C10): rendering the gutter inside a block → T2.3 fails and every live block measures one cell wider.
- **T6.7** (C13): wrapping the buffer here instead of drawing `layout`'s rows → T2.8 fails, and the prompt is one row off at a wrap boundary, a double-width glyph, or a line that exactly fills its row.
- **T6.7** (C11): using the block registry for the fallback → T2.6 fails, and the fallback breaks in exactly the terminals it exists for.
- **T6.8** (C11): using `×` in the fallback → T3.11's ASCII case fails on a non-UTF-8 terminal.
- **T6.9** (C12): discarding state on the too-small transition → T3.13 fails.
- **T6.10** (T4.7): committing the clock as `"input"` → keystroke latency regresses under an idle clock.
- **T6.12** (C15): removing the comparison → T1.5c admits a frame composed for one prompt row and painted from three, which is what the session shipped: a wrapped prompt drawn as a single `⋯`, invisible to the sum check because that check compares the frame with itself.
- **T6.14** (§3a): handing `layout()` the whole terminal instead of the viewport region → T1.12d fails, and a pushed view covers the header, the prompt and the footer. The failure is invisible to §3's sum, which holds at every width with every layer misplaced.
- **T6.15** (§3a): writing only the glyphs a layer's blocks produced → T1.12b fails, and the prompt shows through the gaps in a menu, which reads as a C09 defect.
- **T6.13** (C14): restoring the marker at a cap of one → T1.5b fails, and the prompt shows the marker and nothing else.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| What the welcome block contains | S02 |
| What any verb renders into the viewport | S03–S15 |
| Scroll position and virtualisation | C14 |
| The buffer, cursor and `displayRows` | C17 |
| Focus resolution | C16 |
| Overlay and pushed-view placement | C15 |
| Prism's specific header and footer content | `prism-tui`, via hook 5 |
