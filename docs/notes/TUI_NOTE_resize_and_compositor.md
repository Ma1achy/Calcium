# Note — resize, and the width hazard

| | |
|---|---|
| **Status** | Working note. Nothing committed. |
| **For** | M-T6, if a compositor is written. And one test worth adding regardless |
| **Prompted by** | "our custom layout stuff + rendering better be able to handle resizing" |

---

## Resize is already the best-specified path, and it sits above Ink

A compositor inherits this rather than reimplementing it. Every piece is above the
render layer:

| | |
|---|---|
| C01 | Handles `SIGWINCH`, emits `onResize` with a snapshot, **uncoalesced** (D31) — three signals in a tick give three repaints, so a continuous drag never shows a stale frame |
| C03 | `resize` is an immediate commit reason, 0 ms, and **cannot be made coalesced** (I2). Its own note gives the cell-diffing reason: *"a diff against the old frame is meaningless"* |
| C03 | Sets `contaminated` **eagerly at commit time**, even while deferring, so the next write is a full repaint |
| C14 | Drops the height cache and rebuilds the index **wholesale** on a width change, because a width change invalidates every height at once |
| S01 | Recomputes the four regions and asserts they sum to `rows` **before any output** |

So a compositor's resize story is the easy half: `contaminated` means discard the
front buffer and write everything. You never diff across a size change, and that is
already the specified behaviour rather than something to invent.

---

## The hazard: a frame composed at one width, written at another

**Nothing currently guards this, and it is the worst failure mode in the system.**

Compose a frame at 100 columns, have the terminal become 80 before the write lands,
and you write 100-cell lines into 80 columns. The terminal wraps them. Wrapping
scrolls the alternate screen. Everything below is desynchronised — and unlike a
wrong frame, this corrupts state the application can no longer see or correct.

S01 asserts the height sum equals `rows` before output. **There is no equivalent
assertion on width**, and width is the axis that wraps.

### The rule

**Read dimensions once per frame, at the top, and use that value everywhere
downstream. Never re-read mid-frame.**

Then a resize arriving during composition is the next frame's problem, which is
correct: C03 has already set `contaminated`, so the next frame is a full repaint.
A frame composed at a width that was true when it started is coherent even if stale;
a frame composed at two widths is not coherent at any.

Worth an invariant when the compositor is written:

> Every line written in one frame was composed against one width, read once at the
> start of that frame. A frame is internally consistent even when it is stale.

### A test worth adding now, whether or not a compositor is ever written

This hazard exists in the current Ink path too. Ink reads `stdout.columns` itself,
and it is not established that it reads it once per frame.

> Compose at 100, resize to 80 before the write completes, assert no written line
> exceeds the width actually in effect — and assert the scroll region and cursor
> position afterwards match a control run.

The second half is the one that matters: a too-long line is a wrong frame, but the
*scroll* it causes is unrecoverable, so the assertion should be on the terminal state
rather than on the string.

---

## Why the drag case is not the hard one

**MEASURED 2026-09-01, and this section reasoned about the half that is cheap** (F423,
F425). What it says about the *write* is right and stays: virtualisation means a repaint
writes the visible range, roughly forty rows, not the transcript. What it never mentions
is the **measure**. C14 selects visible rows, so the render is `O(visible)` — and the
index needs a height for every entry, so a width change re-measures `O(transcript)`.
**A width change is the one event whose cost scales with the whole transcript rather
than the screen, and virtualisation is what makes the two diverge.**

So *uncoalesced resize sounds expensive and is cheap* was the conclusion, and the
measurement is **544 ms of blocking work for a 30-event drag at a thousand entries** —
of which the Fenwick rebuild the roadmap later named is 0.07%. The reasoning is sound
about writes and the claim it licensed is about cost.

**What survives is the second sentence, and it is why the fix is a window and not a
debounce**: a debounced resize shows a stale frame for as long as the drag lasts, which
is the thing users notice. A fixed 16 ms deadline does not — it draws throughout, at
most one window behind. D31 is amended to say so, and C01 T5.4's continuous-drag case
exists for exactly the property the amendment preserves.
