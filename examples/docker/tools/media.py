#!/usr/bin/env python3
"""Record and render every image the READMEs embed.

    make fixtures && python3 tools/media.py ../../docs/media

**Everything here is generated from a `.cast`, and that is the rule rather than
a convenience.** A hand-cropped screenshot cannot be regenerated: it is right on
the day it is taken and silently wrong from the first change afterwards, with
nothing to compare it against. These regenerate from one command, so an image
that has gone stale is a diff rather than a discovery.

The casts are committed beside the images for the same reason the screencast's
is — a picture is not reproducible evidence, and the byte stream it came from is.

**Each image is chosen for what it proves**, not for what it looks like:

| image | the claim it is evidence for |
|---|---|
| `s3-live` | a structured block that refreshes itself inside a transcript |
| `ps-120` / `ps-80` | columns dropped by declared priority, at two widths |
| `depth-*` | the same information at five colour depths, nothing lost |
| `config-diff` | the block vocabulary is real — hunks, syntax, line numbers |

**Stills are single-instant casts, not stills.** Everything up to the chosen
moment is collapsed into one frame, so `agg` renders a settled screen rather than
a blank terminal followed by a redraw. The moment is picked the way
`tools/beats.py` picks one — at a gap in the output — because cutting at a chosen
timestamp lands mid-redraw and produces a torn frame that looks like a defect
(FINDINGS F63).
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from beats import QUIET, load  # noqa: E402
from capture import run  # noqa: E402

UTF8 = {"LANG": "en_GB.UTF-8"}
TRUE = {**UTF8, "COLORTERM": "truecolor"}

# name, cols, rows, command, hold, env, still-at (None = animate)
SHOTS: list[tuple[str, int, int, bytes, float, dict[str, str], float | None]] = [
    # 1 — the headline. Animated, and it has to run long enough for the plot to
    #     become a shape: one sample per tick at TICK_MS = 2000.
    ("s3-live", 120, 34, b"/container stats dtui-load", 26.0, TRUE, None),

    # 2 — the same table at two widths. Two images rather than one composite,
    #     because a 120-column capture squeezed into half a README is unreadable
    #     and the point of the pair is that the *content* differs, not the size.
    #
    #     **`/clear` first, and the first attempt did not.** The landing
    #     dashboard is a transcript entry, so at 120 columns it filled sixteen
    #     rows on its own and pushed the table below the fold: the image meant to
    #     show a table showed a dashboard. At 80 the same capture worked, because
    #     the dashboard is shorter there — **so the pair disagreed about what it
    #     was a picture of, and only one of the two looked wrong.**
    #
    #     Clearing leaves the table alone in both, which is also the better
    #     image: the only difference between them is then the thing being
    #     demonstrated.
    #
    #     **18 rows, not 14, and 14 is why F67 exists.** Shrinking these to make
    #     a compact image took them under the shell's silent floor: at 14 rows
    #     the application writes nothing at all, with no error, while the process
    #     stays alive. The image was empty and the pipeline reported success.
    #     **`/clear` was tried and abandoned, and the reason is C23 I9.** It
    #     would have left the table alone in frame — but the landing dashboard is
    #     a *live* entry, and clearing does not stop it: a frozen entry keeps
    #     receiving patches, which is the invariant S1's drawing was corrected
    #     against. So it came back on the next tick, at 120 columns and not at 80,
    #     and the pair stopped being a comparison. The mechanism is right and the
    #     use of it was wrong.
    #
    #     Both at 26 rows with the dashboard above, therefore: **the pair has to
    #     differ in one thing only, and consistency is worth more than a tidier
    #     frame.**
    ("ps-120", 120, 34, b"/ps", 13.0, TRUE, 11.0),
    ("ps-80", 80, 34, b"/ps", 13.0, TRUE, 11.0),

    # 3 — the five depths.
    #
    #     **30 rows, and it took two corrections to get there.** The first
    #     attempt used 20 and the second 26; both showed the CPU panel alone.
    #     `DEGRADATION.md` measured that the braille plot is the one element
    #     that does *not* change across depths — it never carried meaning in
    #     colour — so a five-image strip of it is five identical pictures
    #     arguing that nothing is lost by showing nothing changing. **The MEM
    #     bar has to be in frame**: it is where 1010 typographic sequences
    #     appear exactly as 1118 colour ones disappear.
    #
    #     The height was then measured rather than guessed a third time: MEM
    #     first appears at **30** rows and DETAILS at 34. Below 30 the panel is
    #     not clipped, it is absent — which is why the second attempt left
    #     blank space under the plot and looked like a rendering fault.
    #
    #     **34 everywhere in the end, and the short frames were a false economy.**
    #     They were chosen to keep the README's vertical space down, and it cost
    #     content twice: the bars cropped out of the axis they demonstrate, and
    #     the `/ps` table pushed below the fold in one image of a pair. A demo
    #     shot at a height nobody uses is arguing at a disadvantage the reader
    #     did not ask for. 34 rows is an ordinary terminal.
    #
    #     `COLORTERM` unset (not empty) for the 256 row: C02 §3 distinguishes
    #     absent from empty, and only the first gives 8-bit.
    ("depth-24", 100, 34, b"/container stats dtui-load", 14.0, TRUE, 12.0),
    ("depth-8", 100, 34, b"/container stats dtui-load", 14.0, {**UTF8, "COLORTERM": ""}, 12.0),
    ("depth-4", 100, 34, b"/container stats dtui-load", 14.0, {**UTF8, "COLORTERM": "", "TERM": "xterm"}, 12.0),
    ("depth-1", 100, 34, b"/container stats dtui-load", 14.0, {**UTF8, "DOCKER_TUI_DEPTH": "1"}, 12.0),
    ("depth-ascii", 100, 34, b"/container stats dtui-load", 14.0, {"LANG": "C", "DOCKER_TUI_DEPTH": "1"}, 12.0),

    # 4 — the block vocabulary, at its least table-like.
    ("config-diff", 120, 34, b"/config dtui-cfg /etc/nginx/conf.d/default.conf", 12.0, TRUE, 10.0),
]

FONT = "13"

# Shots that need the transcript empty first. Sent as its own keystroke and its
# own Enter, two seconds apart, for the reason above.
PRE: dict[str, bytes] = {}


def settle(frames: list[tuple[float, bytes]], at: float) -> int:
    """The last frame at or before `at` that is followed by a pause."""
    before = [i for i, (t, _) in enumerate(frames) if t <= at]
    if not before:
        return -1
    for i in reversed(before):
        nxt = frames[i + 1][0] if i + 1 < len(frames) else frames[i][0] + QUIET + 1
        if nxt - frames[i][0] >= QUIET:
            return i
    return before[-1]


def collapse(cast: str, at: float) -> None:
    """Rewrite `cast` so everything up to a settled point is one instant."""
    with open(cast, encoding="utf8") as fh:
        header = fh.readline()
    frames = load(cast)
    i = settle(frames, at)
    if i < 0:
        raise SystemExit(f"{cast}: nothing settled before t={at}")
    text = b"".join(d for _, d in frames[: i + 1]).decode("utf8", errors="strict")
    with open(cast, "w", encoding="utf8") as fh:
        fh.write(header)
        fh.write(json.dumps([0.0, "o", text]) + "\n")
    print(f"  collapsed to t={frames[i][0]:.2f}")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "../../docs/media"
    os.makedirs(out, exist_ok=True)
    only = sys.argv[2:] if len(sys.argv) > 2 else None

    for name, cols, rows, command, hold, env, still in SHOTS:
        if only and name not in only:
            continue
        print(f"{name} ({cols}x{rows})")
        raw = os.path.join(out, name)
        pre = PRE.get(name)
        script = (
            [(1.5, pre), (3.0, b"\r"), (5.0, command), (6.5, b"\r")]
            if pre is not None
            else [(1.5, command), (3.5, b"\r")]
        )
        run(cols, rows, script, raw, hold, env)
        cast = raw + ".cast"
        if still is not None:
            collapse(cast, still)
        gif = os.path.join(out, name + ".gif")
        subprocess.run(
            ["agg", "--font-size", FONT, "--theme", "asciinema",
             *(["--last-frame-duration", "1"] if still is not None else ["--speed", "1.3"]),
             cast, gif],
            check=True, capture_output=True,
        )
        os.remove(raw)
        os.remove(raw + ".teardown")
        print(f"  -> {gif} ({os.path.getsize(gif) // 1024} KiB)")
