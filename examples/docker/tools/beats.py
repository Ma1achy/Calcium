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


BEATS = [
    ("1-launch", 8.0),
    ("2-ps", 15.0),
    ("3-live", 36.0),
    ("4-drift", 51.0),
    ("5-config", 64.0),
    ("6-logs", 75.0),
    ("7-after-ctrl-c", 79.0),
]

if __name__ == "__main__":
    cast = sys.argv[1] if len(sys.argv) > 1 else "out/demo.cast"
    outdir = sys.argv[2] if len(sys.argv) > 2 else "out/beats"
    os.makedirs(outdir, exist_ok=True)
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
        print(f"{path}: {len(buf)} bytes, settled at t={t:.2f} (asked for {at})")
