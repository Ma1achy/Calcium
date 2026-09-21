#!/usr/bin/env python3
"""Record every image the plots and root READMEs embed.

    python3 tools/media.py ../../docs/media

**The same rule as `examples/docker/tools/media.py`, and this exists because the
rule was not being kept here.** That file's opening paragraph says everything is
generated from a `.cast` — *a hand-cropped screenshot is right on the day it is
taken and silently wrong from the first change afterwards, with nothing to
compare it against.* The plots example shipped `frame.png` and `bars.png`, which
are exactly that: two pictures with no byte stream behind them, no command that
remakes them, and no way to tell whether they still show what they claim.

**The harness is imported, not copied.** `capture.py` is the only implementation
in the repository of *do not paste a command, do not SIGKILL the shell, unset
rather than blank a locale variable*, and `beats.py` the only one of *settle
before you cut*. A second copy under this directory would be two things to keep
true and free to drift — MG25's argument, one directory over. `capture.APP` is a
module constant the docker suite's own tests already swap this way.

**What each image is evidence for**, which is the choosing rule rather than a
caption:

| image | the claim it is evidence for |
|---|---|
| `plot-gallery` | six forms at once, each labelled by what it says, in one frame |
| `plot-live` | a plot that advances without the transcript moving under it |
| `plot-compare` | the same block through two renderers, and the fallback is a decision |
| `plot-mosaic` | a named layout — the engine's grid, holes and all |
| `profile-verdict` | the framework measuring itself and answering yes or no |
| `profile-frame` | where a frame's time went, per site, self time |
| `profile-memory` | the heap over the session, sampled |
| `profile-view` | `/profile` as a pushed view, walked card by card |

**`probe.py` beside this file is how every still below was chosen.** It drives
one verb and prints the frame a reader would have seen, which is the step that
has to happen before a `still` is honest: four of these eight were re-shot after
reading one — `plot-mosaic` was cutting through the middle of a figure, and
`/report frame` turned out to be drawing `verdict` because `frame` is a block id
inside a card and not a card.

**The panes are named `verdict`, `app` and `framework` and the cards are 38.**
`overview`, `frame` and `distribution` are in none of them — the manifest's
summary named three cards that do not exist and `/report` fell back to `verdict`
for each, silently and correctly. Fixed in `src/manifest.ts` in the same commit
as this file; the card ids here are read off `CARDS`.
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "..", "docker", "tools")))

import capture  # noqa: E402
from media import collapse  # noqa: E402

capture.APP = ["./bin/plots-tui.js"]

UTF8 = {"LANG": "en_GB.UTF-8"}
TRUE = {**UTF8, "COLORTERM": "truecolor"}

PAGE_UP = b"\x1b[5~"

# **When the command is typed.** The greeting here is a *document* — 48 forms in
# six figures — and it is built locally rather than fetched, so it does not race
# a daemon the way docker-tui's does (F158). Two seconds is enough for it to
# land; the frame is what says so, and every shot below was read before its
# still was chosen.
TYPE_AT = 3.0

# name, cols, rows, command, hold, env, still-at (None = animate), keys-after, pre
#
# The keys are a **list of keystrokes**, never one byte string. A page-up is
# four bytes and a letter is one, so anything that splits a blob has to know
# which is which — and the version of this that tried counted `\x1b[5~` as
# three. C16 wants them sent one write apart anyway, so the list is both the
# correct spelling and the one the harness already needs.
SHOTS: list[tuple[str, int, int, bytes, float, dict[str, str], float | None, list[bytes], bytes | None]] = [
    # 1 — the headline, and it replaces `frame.png`. The greeting document is
    #     the gallery: six forms, each captioned by what it says rather than by
    #     what it is called.
    #
    #     **44 rows and two page-ups, both measured rather than chosen.** The
    #     document is taller than any ordinary terminal, so the frame that lands
    #     after it is drawn is its *tail* — read at 120x40 and the top two
    #     figures with their captions were off the screen. Paging up from the
    #     tail reaches the head from the other end and does not depend on how
    #     tall the entries above it are, which is `config-diff`'s correction
    #     arrived at independently and for the same reason.
    ("plot-gallery", 120, 44, b"", 14.0, TRUE, 12.0, [PAGE_UP, PAGE_UP], None),

    # 2 — one form, advancing. No `still`: a plot that is not moving is a
    #     picture of a plot, and the claim here is that it moves without the
    #     transcript moving under it.
    ("plot-live", 100, 30, b"/live line", 16.0, TRUE, None, [], None),

    # 3 — the two renderers side by side. **This terminal reports no graphics
    #     protocol**, so the right pane is the SVG spent on half blocks — which
    #     is the interesting half of the picture and not a degraded one.
    ("plot-compare", 110, 34, b"/compare bar", 12.0, TRUE, 10.0, [], None),

    # 4 — the layout engine, named as a picture. `/mosaic` draws areas from a
    #     string — `".A./BBB/.C."` — so the figure *is* the grid, holes and all,
    #     which is the one surface where the engine is the subject rather than
    #     the means.
    ("plot-mosaic", 120, 44, b"/mosaic", 17.0, TRUE, 15.0, [PAGE_UP, PAGE_UP], b"/clear"),

    # 5-7 — three cards of the thirty-eight, chosen to be three different
    #       questions rather than three drawings: does the frame budget hold,
    #       where did the time go, what is the heap doing.
    ("profile-verdict", 100, 36, b"/report verdict", 12.0, TRUE, 10.0, [], None),
    ("profile-frame", 100, 36, b"/report where-the-frame-went", 12.0, TRUE, 10.0, [], None),
    ("profile-memory", 100, 36, b"/report memory", 12.0, TRUE, 10.0, [], None),

    # 8 — `/profile`, the framework's own seventh verb, as a pushed view rather
    #     than an entry. Animated, because the card walk is the surface: `n`
    #     steps a card and `tab` steps a group, and a still of one card is a
    #     picture of `/report`.
    #
    #     **Four `n` and no `tab`, which keeps the walk inside `app`.** With a
    #     `tab` in it the last frame was `framework · composition` — a chart
    #     mirrored about zero, correct and unreadable as a thumbnail to anyone
    #     who has not met it, under the window's own *this block is taller than
    #     the screen* notice. The walk is the claim; the card it stops on is
    #     what a reader sees first, and those are two decisions rather than one.
    ("profile-view", 100, 34, b"/profile", 18.0, TRUE, None, [b"n", b"n", b"n", b"n"], None),
]

FONT = "13"


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "../../docs/media"
    os.makedirs(out, exist_ok=True)
    only = sys.argv[2:] if len(sys.argv) > 2 else None

    for name, cols, rows, command, hold, env, still, keys, pre in SHOTS:
        if only and name not in only:
            continue
        print(f"{name} ({cols}x{rows})")
        raw = os.path.join(out, name)
        # An empty command is the greeting on its own — nothing is typed and
        # nothing is submitted, so the shot is whatever the session opens with.
        #
        # **`pre` is `/clear`, and unlike docker-tui's it is kept.** That tool
        # tried the same thing and abandoned it because its landing dashboard is
        # a *live* entry: clearing does not stop it and the next tick put it
        # back, so a pair of shots stopped being a comparison (C23 I9). This
        # greeting is a document built once and never patched, so clearing it
        # leaves the entry alone in the transcript for good — which is what
        # makes a page-up land on the entry's head rather than somewhere in the
        # greeting above it. Measured: from the tail, two page-ups reach the
        # figure's caption and four run past it into the greeting, and which of
        # those it is depends on how tall the greeting rendered.
        at = TYPE_AT
        script = []
        if pre is not None:
            script += [(at, pre), (at + 1.5, b"\r")]
            at += 3.0
        if command != b"":
            script += [(at, command), (at + 2.0, b"\r")]
        at += 4.0
        # Each key its own write, a second and a half apart — several in one
        # write are a paste and not several keys (C16).
        script += [(at + i * 1.5, k) for i, k in enumerate(keys)]
        capture.forget_theme()
        capture.run(cols, rows, script, raw, hold, env)
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
