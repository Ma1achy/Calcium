#!/usr/bin/env python3
"""Record the demo — ten beats, one session, one capture.

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
# ── The timeline, built rather than written out ──────────────────────────────
#
# **Every command is typed one character at a time**, and the first version of
# this file wrote each one as a single burst. That is not slow-motion realism —
# it is a different code path. C16 has a paste window: bytes arriving together
# are *pasted text*, so a burst never touched the editor's per-keystroke
# handling, and on screen a whole command appeared between one frame and the
# next. It read as a machine because it was one.
#
# `CPS` is a human rate. The jitter is deterministic — a fixed cycle rather than
# a random one — because a recording that differs run to run cannot be diffed
# against the last one.
CPS = 13.0
JITTER = (0.0, 0.035, -0.02, 0.05, 0.01, -0.01, 0.04, 0.0)

Beat = tuple[float, bytes]


def typed(text: bytes, at: float) -> tuple[list[Beat], float]:
    """`text`, one keystroke at a time, and the moment the last one lands."""
    out: list[Beat] = []
    t = at
    for i, ch in enumerate(text):
        out.append((round(t, 3), bytes([ch])))
        t += 1.0 / CPS + JITTER[i % len(JITTER)]
    return out, t


def command(text: bytes, at: float, think: float = 0.45) -> tuple[list[Beat], float]:
    """Type it, pause the way a person does before committing, then Enter."""
    out, t = typed(text, at)
    t += think
    out.append((round(t, 3), b"\r"))
    return out, t


def repeat(key: bytes, at: float, times: int, every: float) -> tuple[list[Beat], float]:
    """One key, several times, each its own write (C16: a burst is a paste)."""
    return [(round(at + i * every, 3), key) for i in range(times)], at + times * every


DOWN, UP, ESC, TAB, ENTER = b"\x1b[B", b"\x1b[A", b"\x1b", b"\t", b"\r"
PAGE_DOWN, PAGE_UP = b"\x1b[6~", b"\x1b[5~"
TOP, BOTTOM = b"\x1b[1;5H", b"\x1b[1;5F"


def build() -> list[Beat]:
    b: list[Beat] = []
    # 1 — land, and let the dashboard tick before touching anything. A demo that
    #     starts typing immediately never shows that it was already live.
    t = 5.5

    # 2 — the table.
    part, t = command(b"/ps", t); b += part
    t += 3.0

    # 3 — **row focus, which is the only smooth movement this shell has.**
    #     The transcript scrolls by page and by nothing else — C16 binds
    #     `pageup`, `pagedown`, `c+home`, `c+end` at `global` and no line step —
    #     so "scroll slowly" is not a thing to record. What *is* smooth is the
    #     live block's own cursor moving down its rows, which is a different
    #     feature and the better one to show.
    part, t = repeat(DOWN, t, 5, 0.5); b += part
    t += 1.2
    part, t = repeat(UP, t, 2, 0.5); b += part
    t += 1.5

    #     **`Esc` back to the prompt, and without it the next beat is dead.**
    #     `↓` moves focus *into* the live block (C16 I22), and a printable key
    #     arriving there does nothing — it does not leak into the prompt behind
    #     it, which is C16 §"unconsumed keys" working exactly as written. So
    #     every character of beat 4 was dropped, and the recording has been
    #     showing an empty prompt where the completion menu is meant to be since
    #     the beat was written. Nothing in the frame says so: an empty prompt is
    #     what a prompt looks like.
    b.append((round(t, 3), ESC)); t += 1.0

    # 4 — **completion, and the menu is not asked for.** Two static candidates
    #     open it as you type (C19 I19), so `/co` alone is the shot — no Tab,
    #     and the pause afterwards is the point of the beat rather than dead
    #     air. Then Tab, which still means Tab: it runs the dynamic sources and
    #     takes the selection.
    part, t = typed(b"/co", t); b += part
    t += 2.0
    b.append((round(t, 3), TAB)); t += 1.6
    part, t = repeat(TAB, t, 2, 1.1); b += part
    t += 1.4
    b.append((round(t, 3), ESC)); t += 1.2

    # 5 — THE SHOT. One sample per tick at 2s, so the plot needs real time to
    #     become a shape. Nothing else happens while it fills, on purpose.
    part, t = command(b"/container stats dtui-load", t); b += part
    t += 17.0
    b.append((round(t, 3), ESC)); t += 2.0

    # 6 — the comparison.
    part, t = command(b"/drift dtui-web", t); b += part
    t += 6.0

    # 7 — the patch, then to its first hunk, then a page back down. Additions
    #     are in the first hunk and the frame after the command is the tail.
    part, t = command(b"/config dtui-cfg /etc/nginx/conf.d/default.conf", t); b += part
    t += 4.0
    b.append((round(t, 3), TOP)); t += 3.5
    part, t = repeat(PAGE_DOWN, t, 2, 2.0); b += part
    t += 1.5

    # 8 — the log tail in a pushed view, and Ctrl-C out of it.
    #
    #     **Typed as far as the argument, then Tab**, because that argument is
    #     where the app's own completion sources live: `container` is declared
    #     by nine verbs and answered by `docker ps -a`, so the menu here is real
    #     container names with their states rather than manifest verbs. It is
    #     the only beat that shows a candidate the framework could not have
    #     produced.
    part, t = typed(b"/logs dtui-", t); b += part
    t += 0.6
    b.append((round(t, 3), TAB)); t += 2.2
    part, t = typed(b"web", t); b += part
    t += 0.5
    b.append((round(t, 3), ENTER)); t += 0.0
    t += 7.0
    b.append((round(t, 3), b"\x03")); t += 2.5

    # 9 — **the whole transcript, from the top.** Everything above has scrolled
    #     out of view by now — measured at thirteen dashboard rows of thirty-four
    #     on landing and none at all by the fifth beat — so the accumulated
    #     session is real and invisible. `⌃Home` goes to the document's first
    #     row and `⌃End` comes back, which is the one gesture that shows both
    #     that the transcript is kept and that it is rendered rather than
    #     scrolled back through as text.
    b.append((round(t, 3), TOP)); t += 3.0
    part, t = repeat(PAGE_DOWN, t, 3, 1.1); b += part
    t += 1.0
    b.append((round(t, 3), BOTTOM)); t += 2.0

    # 10 — **the loop.** `/clear` empties the transcript and `/dashboard` puts
    #     the opening frame back, so the last second of the recording is the
    #     first one and the gif cycles without a cut.
    part, t = command(b"/clear", t); b += part
    t += 1.2
    part, t = command(b"/dashboard", t); b += part
    return b


BEATS: list[Beat] = build()


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
