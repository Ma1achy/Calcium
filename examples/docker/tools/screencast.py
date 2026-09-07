#!/usr/bin/env python3
"""Record the demo — eleven beats, one session, one capture.

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
from capture import forget_theme, run  # noqa: E402

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
    """Eleven beats, one session, and the screen is taken exactly once.

    **The bounce was structural, not a pacing problem.** `view: true` verbs —
    `/container stats`, `/inspect`, `/logs` — are fullscreen layers that append
    no transcript entry (A01 D7, C15 T5.5: *the transcript is untouched*). So a
    recording that used three of them went transcript → fullscreen → **the same
    transcript** → fullscreen → the same transcript, and every return read as a
    jump back to the dashboard. Measured from the frame after `Esc`: the
    transcript held the dashboard and `/ps` and nothing else, because nothing
    had been added to it.

    One dive is kept, because the live plot is the surface everything else was
    built around and it earns the single fullscreen moment. Beat 7 follows it
    immediately so the return lands on a transcript that then *grows* — a
    return to an unchanged frame is what read as a bounce.

    **`⌃Home` appears once, at the end, on purpose.** The previous script
    pressed it mid-recording to "reach the patch's first hunk", but `/config` is
    `local: true` — its output is a transcript entry, not a view — so `⌃Home`
    at `global` is `scrollTop` over the whole transcript and scrolled to the
    banner every time. Moving within a patch is `PageUp`.
    """
    b: list[Beat] = []

    # 1 — land, and let the dashboard tick before touching anything. A demo that
    #     starts typing immediately never shows that it was already live.
    t = 6.0

    # 2 — the table. The first thing to accumulate, and everything after it
    #     stacks below rather than replacing it.
    part, t = command(b"/ps", t); b += part
    t += 3.5

    # 3 — **row focus, the only smooth movement this shell has.** The transcript
    #     scrolls by page and by nothing else (C16 binds `pageup`, `pagedown`,
    #     `c+home`, `c+end` and no line step), so "scroll slowly" is not a thing
    #     to record. The live block's own cursor moving down its rows is, and it
    #     is the better feature to show.
    part, t = repeat(DOWN, t, 4, 0.55); b += part
    t += 1.0
    part, t = repeat(UP, t, 1, 0.5); b += part
    t += 1.2

    #     **`Esc` back to the prompt, and the beat after it was dead without.**
    #     `↓` moves focus *into* the live block (C16 I22) and a printable key
    #     arriving there does nothing — it does not leak into the prompt behind
    #     it, which is C16 working exactly as written. Every character of the
    #     completion beat was dropped for the whole life of the old recording,
    #     and nothing in the frame said so: an empty prompt is what a prompt
    #     looks like. FINDINGS F74.
    b.append((round(t, 3), ESC)); t += 1.2

    # 4 — **the menu opens unasked** (C19 I19). Two static candidates — `/images`
    #     and `/inspect` — so `/i` alone is the shot, and the pause is the beat
    #     rather than dead air. Then `Tab` on the argument, which is the app's
    #     own source answering: image repositories from `docker images`.
    part, t = typed(b"/i", t); b += part
    t += 2.2
    part, t = typed(b"mages ngi", t); b += part
    t += 0.7
    #     **`Tab` on a unique match inserts it whole** (C19 I16, §5 rule 3), so
    #     this beat is the *insertion* and beat 5 is the menu — two different
    #     completion behaviours rather than the same one twice.
    #
    #     It is also why the argument is typed as far as `ngi` first. `Tab` on
    #     the bare argument does open the repository menu, and it is real: this
    #     machine's is thirty-odd rows of devcontainer build images with hashes
    #     for names. Honest and unreadable, and the container menu below shows
    #     the same mechanism against names a viewer can take in.
    b.append((round(t, 3), TAB)); t += 1.6
    b.append((round(t, 3), ENTER)); t += 3.5

    # 5 — the second app source, and the one the original question asked for:
    #     real container names, each with its state as a tone and its status as
    #     the hint. Nine verbs declare a `container` argument and one source
    #     answers all of them.
    part, t = typed(b"/container stats dtui-", t); b += part
    t += 0.6
    b.append((round(t, 3), TAB)); t += 2.6
    part, t = typed(b"load", t); b += part
    t += 0.8
    b.append((round(t, 3), ENTER)); t += 0.9
    b.append((round(t, 3), ENTER)); t += 0.5

    # 6 — **THE DIVE, and the only time the screen is taken.** One sample per
    #     tick at 2 s, so the plot needs real time to become a shape. Nothing
    #     else happens while it fills.
    t += 16.0
    b.append((round(t, 3), b"\x03")); t += 1.6
    #     `⌃End` is insurance rather than a fix: the transcript was never moved
    #     (C15 T5.5) and the viewport is still following the tail, so this lands
    #     where it already is — but it reads as returning rather than appearing.
    b.append((round(t, 3), BOTTOM)); t += 1.4

    # 7 — immediately, so the return lands on a transcript that grows. A
    #     comparison block: two sources, one row per field, verdict-toned.
    part, t = command(b"/drift dtui-web", t); b += part
    t += 5.5

    # 8 — **the third app source, and the one that needs argument one to answer
    #     argument two.** `/etc/ng` completes to `/etc/nginx/` with no delimiter
    #     — a directory continues (C19 I16) — so the next `Tab` lists inside it.
    part, t = typed(b"/config dtui-cfg /etc/ng", t); b += part
    t += 0.6
    b.append((round(t, 3), TAB)); t += 1.6
    b.append((round(t, 3), TAB)); t += 2.4
    part, t = typed(b"conf", t); b += part
    t += 0.7
    b.append((round(t, 3), ENTER)); t += 1.0
    b.append((round(t, 3), TAB)); t += 1.4
    b.append((round(t, 3), ENTER)); t += 5.5
    #     **And no paging here at all.** The first draft moved within the patch
    #     with `PageUp` — right, against `⌃Home`, which is what the old script
    #     did and which scrolls the whole session — and `beats.py` still
    #     reported this beat **at the top**: two screens of transcript is one
    #     page, so a single `PageUp` reaches the banner anyway. The diff is on
    #     screen when it lands, which is the shot; scrolling is beat 10's, at
    #     the end, deliberately.

    # 9 — two short entries, so the tail keeps moving and the transcript is
    #     visibly longer than the screen by the time beat 10 asks about it.
    part, t = command(b"/port dtui-web", t); b += part
    t += 3.0
    part, t = command(b"/top dtui-web", t); b += part
    t += 3.5

    # 10 — **the whole session, reviewed.** Everything above has left the screen
    #      by now, so this is the only beat that shows it was kept — and it is
    #      the rendering system as much as the transcript: the banner, the
    #      dashboard and every block below them are still there to be drawn.
    b.append((round(t, 3), TOP)); t += 3.2
    part, t = repeat(PAGE_DOWN, t, 3, 1.1); b += part
    t += 1.0
    b.append((round(t, 3), BOTTOM)); t += 2.0

    # 11 — **the loop.** `/clear` empties the transcript and `/dashboard` puts
    #      the opening frame back, so the last second of the recording is the
    #      first one and the gif cycles without a cut.
    part, t = command(b"/clear", t); b += part
    t += 1.4
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
    forget_theme()  # F811 — a persisted `/theme light` recolours the whole recording
    run(COLS, ROWS, BEATS, out, hold=6.0, env={"LANG": "en_GB.UTF-8", "COLORTERM": "truecolor"})
