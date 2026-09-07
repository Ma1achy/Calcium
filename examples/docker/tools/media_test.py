#!/usr/bin/env python3
"""`media.py`, verified — group 9.

    python3 examples/docker/tools/media_test.py

**What this instrument claims**: that every image in the READMEs is regenerable
evidence for the claim written beside it. A hand-cropped screenshot is right on
the day it is taken and silently wrong from the first change afterwards; these
come from one command, so a stale image is a diff rather than a discovery.

**What distinguishes a broken one.** Two kinds, and the second is the one that
has actually shipped a wrong picture:

  - **A torn frame.** The still is collapsed at a chosen timestamp rather than a
    settled one, so `agg` renders a screen mid-redraw. That is `beats.py`'s
    subject and `media.py` used to hold a second copy of the cut; the copy is
    gone and this file pins that it is.
  - **A frame the application never drew.** The shots are a declaration —
    geometry, hold, still — and three of the numbers in it were wrong in ways no
    image inspection caught: two shots below the shell's silent floor produced an
    empty picture with the pipeline reporting success (F67), and a still after the
    end of its own capture cannot settle.

So the rows are arithmetic over the table plus the collapse, and the floor is
read out of `src/shell/config.ts` rather than remembered.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _fixture import case, main  # noqa: E402
from beats import settled_before  # noqa: E402
from media import SHOTS, collapse, settle  # noqa: E402

CONFIG = Path(__file__).resolve().parents[3] / "src/shell/config.ts"


def floor(name: str) -> int:
    m = re.search(rf"^export const {name} = (\d+);", CONFIG.read_text(encoding="utf8"), re.M)
    if m is None:
        raise SystemExit(
            f"media_test: {name} not found in {CONFIG}. The floor this fixture is "
            "written against has moved; the fixture is stale, not passing."
        )
    return int(m.group(1))


MIN_ROWS, MIN_COLUMNS = floor("MIN_ROWS"), floor("MIN_COLUMNS")

case("the floor was read from the shell", (MIN_ROWS > 0, MIN_COLUMNS > 0), (True, True))

# 1 — **one cut, not two.** `media.settle` was eleven lines that restated
# `beats.settled_before`, differing only in returning the index alone. Two
# implementations of the rule every image and every beat-read rests on, with
# nothing comparing them.
FRAMES = [(1.0, b"a"), (1.1, b"b"), (5.0, b"c"), (5.1, b"d"), (9.0, b"e")]
case(
    "the cut is beats' cut, over a sequence where a naive one differs",
    [settle(FRAMES, t) for t in (1.05, 5.05, 9.5, 0.5)],
    [settled_before(FRAMES, t)[0] for t in (1.05, 5.05, 9.5, 0.5)],
)
case("…and it really does walk back", settle(FRAMES, 5.05), 1)

# 2 — **the collapse.** Everything up to the settled point becomes one instant,
# so `agg` renders a settled screen rather than a blank terminal followed by a
# redraw. Known bytes in, stated file out.
CAST = Path(__file__).resolve().parent / "_media_fixture.cast"
CAST.write_text(
    '{"version": 2, "width": 20, "height": 4}\n'
    '[1.0, "o", "one"]\n'
    '[1.1, "o", "two"]\n'
    '[5.0, "o", "three"]\n'
    # A fourth frame close behind the third, deliberately: the *last* frame of a
    # recording is settled by construction, so a three-frame cast collapses to
    # all of it whatever the algorithm does and the row would assert nothing.
    # The first draft was that cast, and it failed — the tool was right and the
    # expectation was not.
    '[5.1, "o", "four"]\n',
    encoding="utf8",
)
collapse(str(CAST), 5.05)
lines = CAST.read_text(encoding="utf8").splitlines()
CAST.unlink()
case("the header survives the rewrite", json.loads(lines[0])["width"], 20)
case("one event, at t=0", [json.loads(lines[1])[0], json.loads(lines[1])[1]], [0.0, "o"])
case(
    "carrying everything up to the settled frame and nothing after it",
    json.loads(lines[1])[2],
    "onetwo",
)
case("and only that one event", len(lines), 2)

# 3 — **nothing settled is a refusal, not a blank image.** The failure this
# guards is the pipeline reporting success over an empty picture, which is what
# F67 was: `SystemExit` reaches the caller, an empty frame does not.
EMPTY = Path(__file__).resolve().parent / "_media_empty.cast"
EMPTY.write_text('{"version": 2, "width": 20, "height": 4}\n[9.0, "o", "late"]\n', encoding="utf8")
refused = False
try:
    collapse(str(EMPTY), 1.0)
except SystemExit:
    refused = True
finally:
    EMPTY.unlink()
case("a still with nothing before it refuses rather than writing a blank", refused, True)

# 4 — **every shot is above the shell's silent floor.** Below it the application
# writes nothing at all, with no error, while the process stays alive: the image
# was empty and the pipeline reported success. Shrinking two shots for a compact
# README is exactly how it happened, and 14 rows is the number that did it.
small = [(n, c, r) for n, c, r, *_ in SHOTS if r < MIN_ROWS or c < MIN_COLUMNS]
case("no shot is below the size at which the app draws nothing", small, [])

# 5 — **a still is taken from inside its own capture.** A `still` at or after
# `hold`'s end has no frames after it to settle against, so the collapse takes
# the last frame whatever it is — the torn-frame failure arriving through the
# declaration rather than through the algorithm.
late = [(n, still, hold) for n, _, _, _, hold, _, still in SHOTS if still is not None and still >= hold]
case("no still is taken at or after the end of its capture", late, [])

# 6 — **absent is not empty, and one shot depends on it.** C02 §3 reads 8-bit
# colour from `COLORTERM` being *absent*; `capture.run` unsets on `""` and sets
# otherwise, so the depth-8 row is a picture of a different depth if the value
# is ever changed to something falsy-but-present.
depth8 = next((env for n, _, _, _, _, env, _ in SHOTS if n == "depth-8"), None)
case("the 8-bit shot unsets COLORTERM rather than emptying it", depth8.get("COLORTERM"), "")

# 7 — two shots writing one filename is one image silently overwritten by the
# other, and the pair would then differ in nothing.
names = [n for n, *_ in SHOTS]
case("every shot has its own name", len(names), len(set(names)))

# 8 — F811: the theme statement is cleared before *every* shot's `run`, in the
#     loop, not once at the top — a shot after `theme-light` is otherwise light.
#     Source order rather than a call: the helper is trivially right on its own
#     and the defect was that nothing called it.
_src = (Path(__file__).resolve().parent / "media.py").read_text(encoding="utf8")
_loop = _src[_src.index("for name, cols, rows, command, hold, env, still in SHOTS:"):]
case(
    "forget_theme() runs inside the shot loop, before run()",
    0 < _loop.find("forget_theme()") < _loop.find("run(cols, rows, script, raw, hold, env)"),
    True,
)

if __name__ == "__main__":
    sys.exit(main("media.py"))
