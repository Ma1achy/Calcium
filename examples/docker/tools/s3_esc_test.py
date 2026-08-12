#!/usr/bin/env python3
"""`s3_esc.py`, verified — group 9, and it is twenty-six lines of declaration.

    python3 examples/docker/tools/s3_esc_test.py

**What this instrument claims**: that if a part keeps ticking after its host
layer is dismissed, the capture will show it. That is the whole question the
plain frame-read cannot answer — `esc` pops the layer, and what must not happen
is a tick drawing against a host that has gone.

**What distinguishes a broken one**: a hold too short for the surviving tick to
draw. The capture then ends before the thing it was recorded to catch, and the
frame-read comes back clean — **a negative that is a property of the schedule**.
Nothing in the frame says so; the evidence looks like evidence.

So the rows are arithmetic, between this file's schedule and the application's
own `TICK_MS`, read out of `src/history.ts` rather than remembered. There is no
algorithm here to test and pretending otherwise would be the vacuous kind of
row: the schedule *is* the instrument.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _fixture import case, main  # noqa: E402

TOOL = Path(__file__).resolve().parent / "s3_esc.py"
HISTORY = Path(__file__).resolve().parents[1] / "src/history.ts"


def number(pattern: str, text: str, what: str) -> float:
    m = re.search(pattern, text, re.M)
    if m is None:
        raise SystemExit(
            f"s3_esc_test: {what} not found. The file this fixture reads has "
            "moved; the fixture is stale, not passing."
        )
    return float(m.group(1))


SRC = TOOL.read_text(encoding="utf8")
TICK_MS = number(r"^export const TICK_MS = (\d+);", HISTORY.read_text(encoding="utf8"), "TICK_MS")
TICK = TICK_MS / 1000

ESC_AT = number(r"\(([\d.]+), b\"\\x1b\"\)", SRC, "the Esc beat")
SUBMIT_AT = number(r"\(([\d.]+), b\"\\r\"\)", SRC, "the submit beat")
HOLD = number(r"hold=([\d.]+),", SRC, "the hold")

case("the app's tick interval was read", TICK_MS > 0, True)

# 1 — **the hold is at least two intervals**, which is the claim in the
# docstring — *holds well past two intervals afterwards, so a surviving tick has
# time to draw*. One interval would be a coin toss on where the Esc falls
# between ticks; two makes a survivor certain to draw at least once.
case("the hold outlasts two tick intervals", HOLD >= 2 * TICK, True)

# 2 — **and the Esc is inside the capture, not at its edge.** The hold runs from
# the *last* scripted beat, so an Esc that is itself the last beat still gets its
# hold — but a capture whose Esc lands after everything else has already stopped
# is measuring nothing. The part must have been ticking for several intervals
# before the pop, or there is no live tick to survive.
case("the part has ticked several times before the Esc", ESC_AT - SUBMIT_AT >= 3 * TICK, True)

# 3 — the Esc is on its own. C16's paste window means an Esc in the same burst as
# anything else is text rather than a key, and the layer would not pop at all —
# the capture would then show the plot still ticking with its host still there,
# which reads exactly like the defect being looked for.
others = [float(t) for t in re.findall(r"\(([\d.]+), b\"", SRC)]
case("no other beat shares the Esc's moment", [t for t in others if t == ESC_AT], [ESC_AT])
case("and it is the last thing sent", max(others), ESC_AT)

if __name__ == "__main__":
    sys.exit(main("s3_esc.py"))
