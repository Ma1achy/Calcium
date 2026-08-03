# Note — immediate feedback as a stated principle

| | |
|---|---|
| **Status** | Decided, unscheduled. Working note |
| **When** | After C23 lands. C23 is the component that would violate it, so it is the right moment to state it and the wrong moment to be distracted by it |
| **Where** | A01's decision register, at the next free number |

---

## The problem

The principle is already the architecture's position and it is **stated in five places
as five separate rationales**. It has never been stated once as a rule.

A principle living in five components' prose gets weakened one component at a time.
Someone adds a hundred-millisecond debounce to a completion recompute; each individual
case reads as reasonable; nothing exists to say it is not.

## Where it already exists, implicitly

| | |
|---|---|
| **C23 §3** | The pending entry is appended at **step 3**, before the subprocess spawns at step 4. Its rationale, verbatim: *"without it, three hundred milliseconds of interpreter startup look like a dropped keystroke"* |
| **C03 §3** | `input`, `completion` and `resize` have a 0 ms window and **cannot be made coalesced**, so a keystroke's frame is never delayed by a stream |
| **C19 §7** | The 500 ms spinner threshold, per source call |
| **C06** | Stall detection at 120 s produces a muted notice rather than silence |
| **S11, S13** | `b.live` marks staleness rather than showing nothing |

## The decision to add

> **Every input produces observable feedback before any operation that could take
> longer than a frame.** A command appears in the transcript before its process spawns.
> A keystroke commits its frame before any stream. Where work outlives a threshold, the
> surface says so — a spinner at 500 ms, a stall notice at 120 s. **There is no state in
> which the application has accepted input and shows nothing.**

The last sentence is the checkable one, and it is what the decision is for. The rest is
the existing behaviour; that sentence is what a later change has to argue against.

---

## The one known hole, and it should be recorded with the decision

**C17's heuristic paste path delays every printable by up to 30 ms.** The window runs
from the first buffered character, which was forced rather than chosen — a gap-based
timer fails its own control case, since nine characters over 200 ms sit ~22 ms apart and
the run never closes.

A decision that depends on what arrives next cannot precede it, and nothing un-sends a
dispatched key. So on the `bracketedPaste: false` path, feedback is *fast enough* rather
than *immediate*.

Record it as the stated exception rather than leaving it as a paste consequence nobody
measured against the rule. 30 ms is under the ~50 ms perceptual threshold, so it reads
as instant; the honesty is in saying which of the two guarantees it meets.

---

## What it is not

**Not a latency budget.** No numbers beyond the two thresholds already specified. A
budget invites tuning; this is a statement about what must never happen.

**Not a promise the work is fast.** A verb that takes ninety seconds still takes ninety
seconds. The rule is that the ninety seconds are *visible* from the first frame.
