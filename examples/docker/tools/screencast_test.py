#!/usr/bin/env python3
"""`screencast.py`, verified — group 9, and the claim crosses a boundary.

    python3 examples/docker/tools/screencast_test.py

**What this instrument claims**: that the recording is a person using the shell
— every command typed one keystroke at a time, Enter submitting it, and nothing
arriving fast enough to be a paste.

**What distinguishes a broken one**: a burst. C16 coalesces input arriving inside
`HEURISTIC_WINDOW_MS` and calls more than `HEURISTIC_MIN_CHARS` of it a paste, so
a carriage return in the same burst as its command *inserts a newline* instead of
submitting. The recording then shows an application ignoring you, and the shell
is behaving exactly as specified. This is the single most common way to record a
screencast of a working application appearing broken, and the first version of
that file was written as bursts.

**The two constants are read out of `src/interaction/router/decode.ts`, not
copied here.** A fixture holding its own copy of a framework threshold passes
for ever after the framework moves — it would then be asserting that a
screencast obeys a rule nothing enforces. If the pattern stops matching, this
file fails rather than skipping.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _fixture import case, main  # noqa: E402
from screencast import BEATS, CPS, command, repeat, typed  # noqa: E402

DECODE = Path(__file__).resolve().parents[3] / "src/interaction/router/decode.ts"


def constant(name: str) -> int:
    """The framework's own value, or a failure that says which file moved."""
    src = DECODE.read_text(encoding="utf8")
    m = re.search(rf"^const {name} = (\d+);", src, re.M)
    if m is None:
        raise SystemExit(
            f"screencast_test: {name} not found in {DECODE}. The constant this "
            "fixture is written against has moved; the fixture is stale, not passing."
        )
    return int(m.group(1))


WINDOW_MS = constant("HEURISTIC_WINDOW_MS")
MIN_CHARS = constant("HEURISTIC_MIN_CHARS")

# 1 — the constants were read, and they are the ones the prose names. A row
# about the reader rather than about the recording: if this file silently found
# nothing, every row below would be asserting against zero and passing.
case("the paste window was read from the framework", (WINDOW_MS > 0, MIN_CHARS > 0), (True, True))

# 2 — **one keystroke per write.** `typed` returns one beat per byte, and the
# text is recoverable from them in order: a burst would be one beat carrying the
# lot, which is the shape that never touches C17's per-keystroke handling.
beats, end = typed(b"/ps", 10.0)
case("types one keystroke per write", [d for _, d in beats], [b"/", b"p", b"s"])
case("and returns the moment the last one lands", end > beats[-1][0], True)

# 3 — **every gap clears the paste window.** The rule the file exists to obey,
# asserted at the real threshold rather than at a remembered one. `1/CPS` is
# 77 ms against a 30 ms window; jitter is what makes this worth checking, since
# a negative one narrows the gap.
gaps = [round((b[0] - a[0]) * 1000, 3) for a, b in zip(beats, beats[1:])]
case(
    "every keystroke gap clears the paste window",
    all(g > WINDOW_MS for g in gaps),
    True,
)

# 4 — **the recording is deterministic.** The jitter is a fixed cycle rather
# than a random one, because a recording that differs run to run cannot be
# diffed against the last one.
case("the same input gives the same timeline", typed(b"/ps", 10.0), (beats, end))

# 5 — **Enter is its own beat, well clear of the last character.** The measured
# defect: a command and its `\r` in one burst inserts a newline. The pause is
# also the one a person makes before committing, so it is doing two jobs.
cmd, _ = command(b"/ps", 10.0)
case("the last beat is the carriage return", cmd[-1][1], b"\r")
case(
    "and it is clear of the character before it",
    (cmd[-1][0] - cmd[-2][0]) * 1000 > WINDOW_MS,
    True,
)

# 6 — a repeated key is N writes, not one. `n` twice in one write is the text
# `nn`; two writes are two keypresses, and only the second is a motion.
reps, _ = repeat(b"\x1b[B", 3.0, 3, 0.55)
case("a repeated key is one write each", [d for _, d in reps], [b"\x1b[B"] * 3)
case("spaced by the interval given", [round(t - 3.0, 3) for t, _ in reps], [0.0, 0.55, 1.1])

# 7 — **the whole timeline, and this is the row no single helper can fail.**
# `capture.run` pops the script in list order and sends whatever is due, so a
# beat written out of order is sent late and silently: the keystroke lands after
# the one that was meant to follow it, and the recording shows a command typed
# with its letters transposed. Nothing in any helper prevents it — `build`
# assembles from several of them and the ordering is a property of the assembly.
times = [t for t, _ in BEATS]
case("the assembled timeline is non-decreasing", times, sorted(times))

# 8 — and no two beats in it are inside the window. The same rule as row 3, over
# the real recording rather than over one helper's output: `build` glues
# fragments together, and the seam between two fragments is where a gap can
# close without either fragment being wrong.
seams = [round((b - a) * 1000, 3) for a, b in zip(times, times[1:])]
case(
    "no seam in the assembled timeline falls inside the paste window",
    [g for g in seams if g <= WINDOW_MS],
    [],
)

# 9 — **every beat is one keypress.** A key is a byte or a known escape
# sequence; anything longer is text arriving as a burst, and more than
# MIN_CHARS of it is a paste by C16's rule. This is the assertion that would
# have failed against the first version of the file.
longest = max(len(d) for _, d in BEATS)
case(
    "no beat carries more than a single keypress",
    (longest <= MIN_CHARS, max(len(d) for _, d in BEATS if not d.startswith(b"\x1b"))),
    (True, 1),
)

if __name__ == "__main__":
    sys.exit(main("screencast.py"))
