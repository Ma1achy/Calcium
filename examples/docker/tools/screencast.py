#!/usr/bin/env python3
"""Record the demo — six beats, one session, one capture.

    python3 tools/screencast.py out/demo

Writes `demo` (the raw stream), `demo.cast` (asciicast v2) and `demo.teardown`.
Render with `agg demo.cast demo.gif`.

**Nine beats, and still not the five depths — STEP8_WALK §B6 is the reason.** The plan's seventh
was *the same view at five colour depths*. `capture.py` sets the environment once
at `pty.fork()`, because C02 reads `COLORTERM`, `TERM` and `LANG` when the shell
is constructed — so **a recording has one depth for its whole length**, and
splicing five together and calling it a session would assert a mechanism the
application does not have. The depths live in `DEGRADATION.md`, as frames, side
by side, which is the form that suits a comparison anyway: a reader holds two at
once rather than watching one replace another.

**Beat 3 is a typed verb, not `⏎` on a row**, and that is the app rather than the
plan. `DOCKER_TUI_SURFACES.md` corrected the notation once already — B03 §2 is
explicit that `⏎` on a row *appends* and that a push is reached by a verb, with a
row action filling the prompt in between. This app builds no row actions at all,
so the middle step does not exist and the verb is typed in full. Worth watching
rather than hiding: it is the demo showing what the app has.

**Every command is typed and then submitted separately.** C16 has a paste window;
bytes arriving together are pasted text and a carriage return inside one burst
inserts a newline instead of submitting. This is the single most common way to
record a screencast of an application appearing to ignore you.
"""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from capture import run  # noqa: E402

COLS, ROWS = 110, 34

# (at, keystrokes). Typing and Enter are separate rows on purpose.
#
# The gaps are not padding. A dashboard fetch runs `docker ps -a` and `docker
# stats --no-stream` and takes about three seconds; a capture that moves on
# before it lands shows an empty transcript, which reads exactly like a command
# that produced nothing (VERIFYING.md §8).
BEATS: list[tuple[float, bytes]] = [
    # 1 — launch. The banner and the landing dashboard, refreshing in place.
    (7.0, b"/ps"),
    (9.0, b"\r"),
    # 2 — the table.
    (15.0, b"/co"),
    (17.0, b"\t"),
    # 3 — completion, from the manifest and from no code. Dismissed rather than
    #     accepted, so the next beat starts from a clean prompt.
    (21.0, b"\x1b"),
    (23.0, b"/container stats dtui-load"),
    (26.0, b"\r"),
    # 4 — THE SHOT. One sample per tick at TICK_MS = 2000, so the plot needs
    #     real time to become a shape rather than three points.
    (44.0, b"\x1b"),
    # 5 — esc pops the view; the live entry underneath is still ticking.
    (47.0, b"/drift dtui-web"),
    (49.0, b"\r"),
    # 6 — the comparison at its best: two sources, one row per field.
    (59.0, b"/config dtui-cfg /etc/nginx/conf.d/default.conf"),
    (62.0, b"\r"),
    # 7 — a real unified patch. Ctrl-Home to the top, because the additions are
    #     in the first hunk and the frame after the command is the tail.
    (70.0, b"\x1b[1;5H"),
    # 8 — scrolling a transcript far taller than the screen. Each key its own
    #     write: two page-downs in one write are a paste, not two keys (C16).
    (74.0, b"\x1b[6~"),
    (75.5, b"\x1b[6~"),
    (77.0, b"\x1b[6~"),
    (78.5, b"\x1b[5~"),
    (80.0, b"\x1b[F"),
    # 9 — the log tail, streaming into a pushed view, and Ctrl-C out of it.
    (83.0, b"/logs dtui-web"),
    (85.0, b"\r"),
    (94.0, b"\x03"),
]


def warm_the_logs() -> None:
    """Give `dtui-web` something to have logged.

    An nginx that has served nothing has an empty access log, and beat 6 would
    then demonstrate the empty-block class rather than the log view. That is a
    real surface and it is `DEGRADATION.md`'s subject, not this one's.
    """
    for _ in range(4):
        subprocess.run(
            ["docker", "exec", "dtui-web", "wget", "-q", "-O", "-", "http://localhost/"],
            capture_output=True,
            check=False,
        )


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "out/demo"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    warm_the_logs()
    run(COLS, ROWS, BEATS, out, hold=6.0, env={"LANG": "en_GB.UTF-8", "COLORTERM": "truecolor"})
