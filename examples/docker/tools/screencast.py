#!/usr/bin/env python3
"""Record the demo — six beats, one session, one capture.

    python3 tools/screencast.py out/demo

Writes `demo` (the raw stream), `demo.cast` (asciicast v2) and `demo.teardown`.
Render with `agg demo.cast demo.gif`.

**Six beats, not seven, and STEP8_WALK §B6 is the reason.** The plan's seventh
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
    (16.0, b"/container stats dtui-load"),
    (19.0, b"\r"),
    # 3 — THE SHOT. One sample per tick at TICK_MS = 2000, so the plot needs
    #     real time to become a shape rather than three points. Sixteen seconds
    #     is eight ticks, and it cannot be shortened without showing less.
    (37.0, b"\x1b"),
    # 4 — esc pops the view; the live entry underneath is still ticking.
    (40.0, b"/drift dtui-web"),
    (42.0, b"\r"),
    # 5 — the comparison at its best.
    (52.0, b"/config dtui-cfg /etc/nginx/conf.d/default.conf"),
    (55.0, b"\r"),
    # 6 — a real unified diff, then the log tail and Ctrl-C out of it.
    (65.0, b"/logs dtui-web"),
    (67.0, b"\r"),
    (76.0, b"\x03"),
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
    run(COLS, ROWS, BEATS, out, hold=5.0, env={"LANG": "en_GB.UTF-8", "COLORTERM": "truecolor"})
