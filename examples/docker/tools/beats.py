#!/usr/bin/env python3
"""Cut a `.cast` into per-beat prefixes, at a quiet point rather than a chosen one.

    python3 tools/beats.py out/demo.cast out/beats

**A screencast is a frame-read with an audience, and this is what makes the
frame-read possible.** `screen.py` replays a byte stream; a recording is one long
stream; so reading beat four means replaying everything up to beat four and
looking at where the cursor stopped.

**Cutting at a chosen timestamp does not work, and the first attempt proved it.**
Slicing at "t = 8.0 seconds" lands wherever the terminal happened to be — the
first read of this recording showed a container listed twice and a row with a
broken UTF-8 sequence, both of which are the cut and neither of which is the
application. It is VERIFYING.md §8's hazard turned on the reading instrument: a
capture that ends mid-redraw is indistinguishable from an application that drew
the wrong thing.

So the cut is made at a **gap in the output** instead. A terminal application
redraws in a burst and then goes quiet, so the last frame before a pause of
`QUIET` seconds is a settled screen by construction. The beat's nominal time
selects *which* pause; the pause decides where the bytes stop.
"""

import json
import os
import sys

from screen import render

QUIET = 0.35


def load(path: str) -> list[tuple[float, bytes]]:
    frames: list[tuple[float, bytes]] = []
    with open(path, encoding="utf8") as fh:
        fh.readline()  # header
        for line in fh:
            at, _, data = json.loads(line)
            frames.append((at, data.encode("utf8", errors="replace")))
    return frames


def settled_before(frames: list[tuple[float, bytes]], at: float) -> tuple[int, float]:
    """The index of the last frame at or before `at` that is followed by a pause.

    Falls back to the last frame before `at` when nothing settles — which is a
    real answer for a beat that is still drawing, and the caller reports it.
    """
    candidates = [i for i, (t, _) in enumerate(frames) if t <= at]
    if not candidates:
        return -1, 0.0
    for i in reversed(candidates):
        following = frames[i + 1][0] if i + 1 < len(frames) else frames[i][0] + QUIET + 1
        if following - frames[i][0] >= QUIET:
            return i, frames[i][0]
    return candidates[-1], frames[candidates[-1]][0]


def beats_from_script() -> list[tuple[str, float]]:
    """The moments the recording pauses, taken from the script that made it.

    **Hand-maintained timestamps go stale silently**, and did: shortening one
    beat by six seconds left every label after it naming a different moment, so
    the report said the *deliberate* scroll-to-top beat was not at the top and
    an ordinary one was. Nothing was wrong with the recording.

    A settled frame is one followed by a pause, so the pauses in the script are
    exactly the frames worth reading — and reading them from `screencast` means
    the two cannot disagree.
    """
    from screencast import BEATS as SCRIPT

    out: list[tuple[str, float]] = []
    prev = 0.0
    for at, _ in SCRIPT:
        if at - prev > 1.2:
            out.append((f"{len(out) + 1:02d}-t{prev:.0f}", at - 0.2))
        prev = at
    out.append((f"{len(out) + 1:02d}-end", prev + 2.0))
    return out


BEATS: list[tuple[str, float]] = beats_from_script()

# The banner's first line, which is only on screen when the transcript is at its
# very top. It is the whole of the jump test: any beat but the first and the
# last two that answers `yes` has snapped back to the beginning.
BANNER = "## ## ##"

if __name__ == "__main__":
    cast = sys.argv[1] if len(sys.argv) > 1 else "out/demo.cast"
    outdir = sys.argv[2] if len(sys.argv) > 2 else "out/beats"
    os.makedirs(outdir, exist_ok=True)
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 110
    rows = int(sys.argv[4]) if len(sys.argv) > 4 else 34
    frames = load(cast)
    for name, at in BEATS:
        i, t = settled_before(frames, at)
        if i < 0:
            print(f"{name}: nothing before t={at}", file=sys.stderr)
            continue
        buf = b"".join(d for _, d in frames[: i + 1])
        path = os.path.join(outdir, name + ".raw")
        with open(path, "wb") as fh:
            fh.write(buf)
        # **Whether the frame jumped, answered by the tool.** A dominance table
        # showed the banner returning at three timestamps once and it was
        # explained away as a detector artefact; the bounce was in the numbers
        # the whole time. This asks the question directly, per beat, so it
        # cannot be read past.
        screen = render(buf.decode("utf8", errors="replace"), cols, rows).split("\n")
        first = next((r.strip() for r in screen if r.strip()), "")
        at_top = any(BANNER in r for r in screen)
        flag = "  ** AT THE TOP **" if at_top else ""
        print(
            f"{path}: {len(buf)} bytes, settled at t={t:.2f} (asked for {at})\n"
            f"    top row: {first[:64]!r}{flag}"
        )
