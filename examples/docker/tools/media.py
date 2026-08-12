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
from beats import load, settled_before  # noqa: E402
from capture import run  # noqa: E402

UTF8 = {"LANG": "en_GB.UTF-8"}
TRUE = {**UTF8, "COLORTERM": "truecolor"}

# **When each shot starts typing**, for the ones whose opening frame is slow to
# settle. Default 1.5 s; see the note at the call site (F158).
TYPE_AT: dict[str, float] = {
    # The comparison runs two `docker inspect`s and the greeting is still
    # landing at 1.5 s on a loaded host — measured, as a banner appended
    # underneath the table it was supposed to precede.
    "drift": 4.0,
}

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
    ("config-diff", 120, 40, b"/config dtui-cfg /etc/nginx/conf.d/default.conf", 16.0, TRUE, 13.0),

    # 5 — the comparison block: two sources, one row per field, verdict-toned.
    ("drift", 120, 34, b"/drift dtui-web", 12.0, TRUE, 10.0),

    # 6 — completion, which is the manifest's doing and no code's. The menu is
    #     an overlay (C15) drawn over the transcript, with each verb's summary
    #     from the same table `/help` and dispatch use — and it opens as the
    #     verb is typed rather than on `Tab` (C19 I19), which is what the shot
    #     shows. The rule under the last candidate is its bottom edge (I23): the
    #     menu spans the region and sits on the prompt, so without it `/clear`
    #     and `❯ /co` are adjacent rows of text and read as one path.
    ("completion", 120, 34, b"/co", 8.0, TRUE, 4.0),

    # 7 — the light variant, **rendered on a light terminal on purpose.**
    #     C10 paints no background: §4a's channel exists for diff rows, and the
    #     surface tones stop at 1-bit precisely because "background colours are
    #     the emulator's and a user may override them". So a variant is a set of
    #     foregrounds chosen to pair with a terminal, not a skin that repaints
    #     one — and showing `/theme light` on a dark terminal would be dark text
    #     on a dark background, which is a picture of the wrong thing.
    ("theme-light", 120, 34, b"/theme light", 10.0, TRUE, 8.0),

    # 8 — scrolling a transcript taller than the screen.
    ("scroll", 110, 30, b"/images", 14.0, TRUE, None),

    # 14 — **the log tail, and it is here because it left the overview.** The
    #      demo keeps one fullscreen view and `/logs` is not it, so without a
    #      shot of its own the streaming surface has no picture anywhere. Two
    #      seconds of nginx access lines arriving inside a pushed view is what
    #      it is for, and `view: true` **and** `streams: true` together is the
    #      combination C05 I20 permits and this is the only verb that uses.
    #
    #      No `still`: a tail that is not moving is a table.
    ("logs", 110, 30, b"/logs dtui-web", 16.0, TRUE, None),
]

# Rendered on a different terminal palette. See shot 7.
THEME = {"theme-light": "github-light"}

# Keys sent after the command's Enter, one per second — for surfaces that are
# only interesting once they are on screen.
AFTER: dict[str, bytes] = {
    "scroll": b"\x1b[5~\x1b[5~\x1b[6~",
    # Ctrl-Home — `global: scrollTop`. The diff is taller than the screen and
    # its additions are in the first hunk, so the frame that lands after the
    # command is the *tail* of the patch: thirty deleted lines and not one
    # added. The picture of a diff has to show both signs.
    "config-diff": b"\x1b[1;5H",
}

FONT = "13"

# Shots that need the transcript empty first. Sent as its own keystroke and its
# own Enter, two seconds apart, for the reason above.
PRE: dict[str, bytes] = {}


def settle(frames: list[tuple[float, bytes]], at: float) -> int:
    """The last frame at or before `at` that is followed by a pause.

    **`beats.settled_before`, not a second copy of it.** This was the same eleven
    lines written out again, differing only in returning the index alone — two
    implementations of the one rule every image and every beat-read depends on,
    free to drift apart with nothing comparing them. A03's MG25 is the framework
    rule for this; the instruments had no equivalent, which is group 9's whole
    subject.
    """
    return settled_before(frames, at)[0]


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
        # **The opening frame is async, so a fixed delay races it** (F158).
        #
        # The greeting asks docker for its version and the dashboard fetches
        # before either can be drawn, so *when the banner lands* is a property of
        # the daemon and the host, not of this script. At 1.5 s `drift` typed
        # into a session whose greeting had not arrived: the comparison appended
        # first and the banner appended **under** it, so the shot showed the
        # tail of a table with its `field / a / b` header scrolled off, beneath
        # nothing, above a welcome. An impossible-looking transcript, and the
        # numbers were all fine — 20 cast frames, right size, no error.
        #
        # `TYPE_AT` buys the slow openers more room. It is a delay rather than a
        # settle-detector because the capture is one-way: it writes on a clock
        # and reads afterwards, and teaching it to wait on content is a bigger
        # change than this row. **Recorded as the weaker fix it is** — a shot
        # whose opening is slower than its delay will drift the same way, and
        # the frame is what says so, which is why every shot is read.
        at = TYPE_AT.get(name, 1.5)
        script = (
            [(at, pre), (at + 1.5, b"\r"), (at + 3.5, command), (at + 5.0, b"\r")]
            if pre is not None
            else [(at, command), (at + 2.0, b"\r")]
        )
        # **Completion needs no key at all now.** The menu opens on two or more
        # static candidates as the verb is typed (C19 I19), so the command *is*
        # the shot and the Enter is what has to go.
        #
        # **The Tab is gone and so is the reason it was early.** That timing was
        # a workaround for F68 — "the overlay paints no background, so the
        # transcript reads through the gaps between its columns" — and F68 was
        # withdrawn: the box is columns 0 to 81 on every row, measured with and
        # without, and the passage that seemed to confirm it was the note
        # explaining why the implementation does not have the defect. A
        # justification the next person checks and cannot reproduce is one they
        # delete, so it is deleted here rather than left to be found.
        if name == "completion":
            script = [(1.5, command)]
        after = AFTER.get(name)
        if after:
            # Each key its own write, a second apart — two page-ups in one write
            # are a paste, not two keys (C16).
            keys = [b"\x1b" + k for k in after.split(b"\x1b") if k]
            script += [(8.0 + i * 1.5, k) for i, k in enumerate(keys)]
        run(cols, rows, script, raw, hold, env)
        cast = raw + ".cast"
        if still is not None:
            collapse(cast, still)
        gif = os.path.join(out, name + ".gif")
        subprocess.run(
            ["agg", "--font-size", FONT, "--theme", THEME.get(name, "asciinema"),
             *(["--last-frame-duration", "1"] if still is not None else ["--speed", "1.3"]),
             cast, gif],
            check=True, capture_output=True,
        )
        os.remove(raw)
        os.remove(raw + ".teardown")
        print(f"  -> {gif} ({os.path.getsize(gif) // 1024} KiB)")
