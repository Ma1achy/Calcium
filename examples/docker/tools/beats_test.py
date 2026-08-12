#!/usr/bin/env python3
"""`beats.py`, verified — group 9, and the cut is the whole claim.

    python3 examples/docker/tools/beats_test.py

**What this instrument claims**: that the bytes it hands to `screen.py` end on a
*settled* screen. Everything downstream rests on it — a beat read from a cut
made mid-redraw shows a container listed twice and a row with a broken UTF-8
sequence, and both are the cut rather than the application. That happened, and
it read as two application defects.

**What distinguishes a broken one**: it cuts at the timestamp it was asked for.
The rows below are indexed by the interaction between *the beat's nominal time*
and *where the pauses actually are* — the two rules that meet in this file — so
each one is a frame sequence where the asked-for answer and the settled answer
differ. A row where they agree is a restatement of the input.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _fixture import case, main  # noqa: E402
from beats import QUIET, beats_from_script, load, settled_before  # noqa: E402

# A burst at 1.0-1.2, quiet, a burst at 5.0-5.2, quiet, one frame at 9.0.
# Deliberately the shape a redraw makes: several reads in quick succession and
# then nothing.
BURSTS: list[tuple[float, bytes]] = [
    (1.00, b"a"),
    (1.10, b"b"),
    (1.20, b"c"),
    (5.00, b"d"),
    (5.10, b"e"),
    (5.20, b"f"),
    (9.00, b"g"),
]

# 1 — **the defect the instrument exists to prevent.** Asked for t=5.1, the
# naive answer is frame 4 — which is in the middle of a burst, so the screen is
# half redrawn. The settled answer is frame 2, the last one before a pause.
case(
    "walks back to the settled frame rather than cutting where it was asked",
    settled_before(BURSTS, 5.1),
    (2, 1.20),
)

# 1b — and the naive answer is genuinely different, so row 1 is about the walk
# rather than about the arithmetic agreeing with itself.
case(
    "…and the asked-for frame is a different one",
    max(i for i, (t, _) in enumerate(BURSTS) if t <= 5.1),
    4,
)

# 2 — asked *at* a settled frame, it is that frame. The boundary on the other
# side of row 1, and a walk that always stepped back would fail it.
case(
    "a frame that is itself settled is the answer",
    settled_before(BURSTS, 1.20),
    (2, 1.20),
)

# 3 — **the gap is a threshold and it is inclusive.** Two sequences differing in
# one number: the pause after frame 1 is exactly QUIET in the first and a hair
# under in the second, and the answers are different frames rather than
# different times.
JUST_OVER = [(0.0, b"x"), (1.0, b"y"), (1.0 + QUIET, b"z")]
JUST_UNDER = [(0.0, b"x"), (1.0, b"y"), (1.0 + QUIET - 0.01, b"z")]
case("a pause of exactly QUIET settles", settled_before(JUST_OVER, 1.2), (1, 1.0))
case("a hair under, and it walks back past it", settled_before(JUST_UNDER, 1.2), (0, 0.0))

# 4 — **nothing settles before the beat**, which is a real answer for a beat
# that is still drawing. The fallback is the last frame before `at`, and the
# caller reports the discrepancy — it does not silently move the beat.
# The fourth frame matters: the *last* frame of a recording is settled by
# construction (row 6), so a sequence that ends at the beat cannot exercise the
# fallback at all. It has to still be drawing afterwards.
STILL_DRAWING = [(0.0, b"x"), (0.1, b"y"), (0.2, b"z"), (0.3, b"w")]
case(
    "falls back to the last frame when the screen never settles",
    settled_before(STILL_DRAWING, 0.25),
    (2, 0.2),
)

# 5 — nothing at all before the beat. `-1` rather than an exception or frame 0:
# an empty prefix is not a screen, and writing one would produce a beat file
# that replays to a blank terminal and reads as an application drawing nothing.
case("nothing before the beat is -1, not frame zero", settled_before(BURSTS, 0.5), (-1, 0.0))

# 6 — **the last frame counts as settled**, because there is nothing after it to
# disturb the screen. Without the synthetic gap the final beat can never settle
# and every recording's last read is the fallback.
case("the final frame is settled by construction", settled_before(BURSTS, 9.5), (6, 9.0))

# 7 — the cast reader. A header line, then one `[t, "o", text]` per read; the
# payload comes back as bytes because `screen.py` replays bytes.
CAST = (
    '{"version": 2, "width": 80, "height": 24}\n'
    '[0.5, "o", "hello"]\n'
    '[1.25, "o", "\\u2502 box"]\n'
)
CASES_PATH = Path(__file__).resolve().parent / "_beats_fixture.cast"
CASES_PATH.write_text(CAST, encoding="utf8")
try:
    case(
        "reads a cast — the header is skipped and payloads come back as bytes",
        load(str(CASES_PATH)),
        [(0.5, b"hello"), (1.25, "│ box".encode("utf8"))],
    )
finally:
    CASES_PATH.unlink()

# 8 — **the beats are derived from the script, not written down beside it.**
# Hand-maintained timestamps went stale silently: shortening one beat by six
# seconds left every label after it naming a different moment, so the report
# said the deliberate scroll-to-top beat was not at the top and an ordinary one
# was. Nothing was wrong with the recording.
#
# The row asserts the derivation rather than the values — the values are the
# thing that is allowed to change.
from screencast import BEATS as SCRIPT  # noqa: E402

derived = beats_from_script()
case("every beat is derived from a gap in the script", len(derived) >= 2, True)
case(
    "the last beat is the script's last event plus the tail hold",
    round(derived[-1][1], 3),
    round(SCRIPT[-1][0] + 2.0, 3),
)
case(
    "and each earlier beat lands just before a gap the script actually has",
    all(
        any(abs((at + 0.2) - t) < 1e-6 for t, _ in SCRIPT) for _, at in derived[:-1]
    ),
    True,
)

if __name__ == "__main__":
    sys.exit(main("beats.py"))
