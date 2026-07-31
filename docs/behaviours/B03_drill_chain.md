# B03 — The drill chain

| Field | Value |
|---|---|
| **Type** | Behaviour |
| **Components** | C13 C14 C15 C16 C23 · S01 S03 S04 S05 S06 S12 S13 |
| **Status** | Draft |

---

## 1. What this is

Nobody looks at one thing. They look at a list, pick a row, read the detail, tail its logs, come back, and pick a different row. That path crosses seven components and six surfaces, and **no single one of them knows it is a path** — each only knows its own step.

This document is the path. It restates nothing: focus is C16's, layers are C15's, live-versus-frozen is C13's, and each surface owns its own render.

What it owns is the set of properties that only hold *across* steps — that you end up where you expect, that what you left is still there, and that going back is never destructive.

---

## 2. The two ways down

There are exactly two, and confusing them is the mistake this document exists to prevent.

| | Append | Push |
|---|---|---|
| Used by | `⏎` on a row, every action `fill` | `--logs`, `/dashboard` |
| Effect | A new transcript entry; the previous one freezes | A layer over the viewport; the transcript is untouched |
| Coming back | Scroll — both are on screen | `esc` — the layer pops |
| Costs | Vertical space, forever | Nothing; it is transient |
| Owner | C23 §2 | C15 |

**A pop appends nothing, and a drill-in appends the command it ran.** The dashboard's one-line "trace" is not a trace at all — it is `/ps <uuid>`, an ordinary entry from an ordinary command — which is why it survives A01 D7 dropping the trace and the logs `esc` does not need one. The two look like the same thing and are one step of each column: `⏎` on a run row is an **Append** step that happens to pop a layer on its way; `esc` from the logs view is a **Push** step reversed, and reversing a push touches the transcript exactly as much as making one did.

That asymmetry is worth stating because the obvious reading is that both pops should record something, and the mechanism forbids it: a record is an entry, an entry freezes its predecessor, and the block a pop returns to is the one whose selection D7 preserves. **The cost is real and is not hidden here**: a logs excursion leaves no transcript record, because the push that opened it left none either.

**Append is the default and push is the exception**, because appending keeps both things. Drilling from `/ps` into a run detail leaves the list above it, frozen, with the row you came from still visible. You have not swapped one view for another; you have accumulated two.

Push exists only where the thing genuinely needs the whole screen and its own letter keys — logs and the dashboard, and nothing else (A01 D4).

---

## 3. The canonical path

```
/ps --mine                 append   list, live
  ↓ ↓ ↓                             focus into the block, row 3
  ⏎                        append   run detail, live; list freezes above
  ≡ logs                   fill     prompt now reads /ps a3f9b21 --logs
  ⏎                        push     logs view; transcript untouched
  esc                      pop      back to the detail, still live, focus intact
  ⌃↑                       —        focus returns to the prompt
  ↑ ↑ ⏎                    append   re-runs /ps --mine against fresh data
```

Seven steps and three mechanisms. The properties that make it work are all about what *survives*:

**Selection survives a push.** `esc` from the logs view returns to the detail with the same action focused. C16 stores focus as a location and resets it only on append (C16 I2) — a push preserves it, and the pop appends nothing, which is what A01 D7 requires and what makes `esc` feel like going back rather than starting over.

**The list survives the drill.** It is frozen, not replaced. Scrolling up shows it with the original row still rendered as it was.

**Coming back is a re-run, not a restore.** `↑↑⏎` re-executes against current data rather than reviving the frozen block. That is deliberate: the frozen one is minutes old and its actions are refused (C23 I18). Restoring stale state and letting people act on it is the failure D5 exists to prevent.

---

## 4. What does not happen

Four things a reader might expect, and why none of them do.

**There is no back key from an appended entry.** Nothing to pop; both are on screen. A back key would have to either delete the entry — losing work — or scroll, which the scroll keys already do.

**Views do not nest** (C15 I1). Drilling in from the dashboard *pops* it, appends `/ps <uuid>`, and leaves a one-line trace. Returning is `↑⏎` on `/dashboard`. One keystroke more than a back key, and no view stack to reason about.

**Frozen entries never regain focus.** `⌃↑` returns focus to the prompt, not to the previous block. C13 §2 makes frozen read-only, and an interface where old blocks are re-enterable would make "which one am I in" a question the user has to hold in their head.

**Nothing is ever replaced in place.** Every step either appends or layers. A surface that overwrote its own entry would break the transcript's only promise — that it is a record.

---

## 5. Failure modes

Rows where the chain itself can go wrong, as opposed to any one step.

| Failure | Surfaces at | Outcome |
|---|---|---|
| `⏎` with no row focused | S03, S05, S06 | No-op. No empty command is appended |
| `⏎` on a row whose entity has since been deleted | Any list | The command appends and the far side reports it is gone. **The list is not silently corrected** — a row vanishing under the cursor is worse than a clear error |
| Drilling from a frozen list | C23 I18 | Refused with a notice; the data is stale and so is the uuid's context |
| `esc` with no layer | C15 T3.1 | No-op |
| `esc` on a non-dismissable confirm | C15 I3 | No-op — a confirm is not escapable |
| A push while a view is already open | C15 I1 | Rejected as an orchestration bug, not silently reordered |
| The transcript hits its cap mid-chain | C13 §5 | The oldest entries evict; the chain's recent steps are never the ones dropped |
| An appended entry's verb fails | C23 §5 | An error document is appended. The chain continues from it — the previous entries are unaffected |
| Focus target changes between keydown and dispatch | C16 T3.17 | The second key goes to the new target; no stale routing |
| A push during a streaming append | C13 §2 | The stream keeps patching its frozen entry beneath the layer |

**The deleted-entity row is the one worth arguing about.** Silently removing the row would be tidier and is wrong: the user pressed `⏎` on something they could see, and an interface that edits itself out from under a keystroke teaches people not to trust what is on screen.

---

## 6. Commitments

1. Two mechanisms only — append and push — and they are never mixed for one step.
2. Append is the default; push is reserved for surfaces needing the whole screen and letter keys.
3. Selection survives a push and is restored on `esc`.
4. A drilled-from list survives as a frozen entry with its row intact.
5. Coming back is a re-run against fresh data, never a restore of stale state.
6. There is no back key from an appended entry, because both are on screen.
7. Views do not nest; drilling from a view pops it and leaves a trace.
8. Frozen entries never regain focus.
9. Nothing is ever replaced in place.
10. `⏎` on a stale row appends a command that fails clearly rather than the list correcting itself.
11. Every failure in §5 leaves the chain usable.

---

## 7. Tests

Integration and e2e, per A02 §7 — behaviour cross-cuts scope.

### Integration

- **B3.1**: `⏎` on a live row appends exactly one entry and freezes the previous.
- **B3.2**: a push leaves the transcript length unchanged.
- **B3.3**: focus location survives push and pop; the same action is focused afterwards.
- **B3.4**: `⌃↑` returns focus to the prompt, never to a frozen entry.
- **B3.5**: `⏎` from a frozen block is refused with a notice.
- **B3.6**: drilling from the dashboard pops it, appends, and leaves a one-line trace.
- **B3.7**: every row of §5 that fakes can simulate — eight of ten.
- **B3.8**: a streaming entry keeps patching while a view is pushed over it.

### End-to-end

- **B3.9**: the §3 canonical path, all seven steps, asserting the three survival properties at each.
- **B3.10**: the same at 60 and 160 columns — the chain does not depend on width.
- **B3.11**: drill five levels deep and scroll back to the first — every entry present and readable.
- **B3.12**: `⏎` on a row whose run has been deleted → a clear far-side error, the list unchanged.
- **B3.13**: transcript cap reached during a long chain → the oldest entries evict, the current chain intact.
- **B3.14**: `esc` from logs opened inside the dashboard's drill-in → returns to the detail, not the dashboard.

### Fail-on-revert

- **B3.15**: clearing focus on push → B3.3 fails, and `esc` lands you at the top of the block.
- **B3.16**: restoring a frozen entry to live on return → B3.5 fails, and stale actions become fireable.
- **B3.17**: silently removing a deleted row → B3.12 fails, and the display edits itself under the cursor.
- **B3.18**: allowing a view to push over a view → C15 I1 is violated and `esc` becomes ambiguous.

---

## 8. Out of scope

| Not here | Where |
|---|---|
| Focus resolution and the keymap | C16 |
| The layer stack | C15 |
| Live versus frozen | C13 |
| Each surface's own render | S03–S13 |
| Action dispatch | C23 §3a |
| Degradation | B04 |
