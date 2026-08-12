#!/usr/bin/env python3
"""`capture.py`, verified — group 9.

    python3 examples/docker/tools/capture_test.py

**What this instrument claims**: that the raw stream and the `.cast` beside it
are *one session seen two ways*, and that what it typed at the shell was typed
rather than pasted.

**What distinguishes a broken one**, and both halves have happened:

  - **A chunk decoded on its own.** `os.read` splits on bytes, so a 64 KiB read
    lands mid-sequence whenever the terminal is drawing box characters — which
    is most of the time here. Decoding each chunk with `errors="replace"` put
    U+FFFD in the middle of a panel border and the panel then wrapped: a
    corrupted frame in the recording with the raw stream beside it perfectly
    intact. Visible in the second frame anyone read.
  - **A command sent as one burst.** C16 calls that a paste and the carriage
    return inside it inserts a newline. `screencast_test.py` holds that half at
    the framework's own threshold; this file holds the schedule that produces it.

The PTY half — `run` — is not covered here and is not pretending to be: it forks,
execs the app and needs a docker socket. What is covered is everything that
decides *what the capture contains*, which is where both defects were.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _fixture import case, main  # noqa: E402

# The module itself, not only its names — the locale row swaps `APP`.
import capture  # noqa: E402
from capture import FIRST_KEY_AT, SUBMIT_AT, TYPE_AT, parse_tail, schedule, write_cast  # noqa: E402

OUT = Path(__file__).resolve().parent / "_capture_fixture.cast"


def cast_of(frames: list[tuple[float, bytes]]) -> tuple[dict, list]:
    # The unlink covers the raising path too — row 4b makes `write_cast` throw,
    # and a fixture that leaves a file behind on its refusal row is a fixture
    # that pollutes the tree every time it does its job.
    try:
        write_cast(str(OUT), 80, 24, frames)
        lines = OUT.read_text(encoding="utf8").splitlines()
    finally:
        OUT.unlink(missing_ok=True)
    return json.loads(lines[0]), [json.loads(ln) for ln in lines[1:]]

# ── the cast ────────────────────────────────────────────────────────────────

# 1 — **the measured defect.** `│` is three bytes; the read boundary falls after
# the first. Decoded independently the first chunk yields U+FFFD and the second
# two more; carried across, the character survives whole.
BOX = "│".encode("utf8")
SPLIT = [(0.1, b"a" + BOX[:1]), (0.2, BOX[1:] + b"b")]
header, events = cast_of(SPLIT)
case(
    "a character split across two reads survives the cast",
    "".join(e[2] for e in events),
    "a│b",
)
case(
    "…and no replacement character is written",
    "�" in "".join(e[2] for e in events),
    False,
)

# 1b — and the naive reading really is different, so row 1 is about the decoder
# rather than about the assertion agreeing with itself.
case(
    "the per-chunk decoding this replaced does corrupt it",
    (b"a" + BOX[:1]).decode("utf8", errors="replace"),
    "a�",
)

# 2 — **the split does not become a frame boundary either.** The first chunk
# decodes to `a` and nothing else, so it is one event and not two; a decoder that
# emitted an empty payload would put a zero-length write in the recording, and
# `agg` renders that as a beat where nothing happens.
case("a chunk that decodes to nothing writes no event", len(events), 2)
case("the timings are the reads', to the microsecond", [e[0] for e in events], [0.1, 0.2])
case("and every event is an output event", {e[1] for e in events}, {"o"})

# 3 — asciicast v2's header, which is what `agg` reads the geometry from. A
# recording whose header disagrees with the capture renders at the wrong size and
# every frame in it wraps.
case(
    "the header is asciicast v2 at the captured size",
    (header["version"], header["width"], header["height"]),
    (2, 80, 24),
)

# 4 — **a capture cut mid-character still produces a cast, and this row is why
# the file exists.** It did not: the final flush was strict, so a last read
# ending on half a box character raised — *after* the raw stream and the teardown
# had been written. The recording of the session was lost, the summary line never
# printed, and the caller saw a traceback from the tool rather than from the app.
# One U+FFFD at the very end is the honest residue. FINDINGS F143.
_, tail_events = cast_of([(0.1, b"ok" + BOX[:2])])
case("a capture ending mid-character still writes its cast", tail_events[0][2], "ok\ufffd")

# 4b — **and the strictness is kept where it earns its place.** An invalid byte
# in the *body* is not a boundary artefact and has nowhere honest to go, so it
# still raises. The two rows differ in one thing: whether the bad bytes are the
# last ones in the capture. Without 4b, row 4's fix reads as "stop being strict".
bad = False
try:
    cast_of([(0.1, b"\xff\xfe"), (0.2, b"ok")])
except UnicodeDecodeError:
    bad = True
case("an invalid byte mid-capture still refuses", bad, True)

# ── the schedule ────────────────────────────────────────────────────────────

# 5 — **text and Enter are separate writes.** The gap is seconds, not
# milliseconds; `screencast_test.py` asserts the threshold itself against the
# framework's constant, and this asserts the shape.
plan = schedule(b"/ps", b"")
case("the command, then the carriage return", [d for _, d in plan], [b"/ps", b"\r"])
case("with the submit after the typing", plan[1][0] > plan[0][0], True)
case("at the declared moments", [t for t, _ in plan], [TYPE_AT, SUBMIT_AT])

# 6 — **keys after the Enter, one per second, each its own write.** `n` twice in
# one write is the text `nn`; two writes are two keypresses. A pushed view's
# motions cannot be read from the frame the command produced, which is why they
# come after rather than before.
with_keys = schedule(b"/logs x", b"nn")
case("each key is its own write", [d for _, d in with_keys[2:]], [b"n", b"n"])
case(
    "one per second, after the submit",
    [t for t, _ in with_keys[2:]],
    [FIRST_KEY_AT, FIRST_KEY_AT + 1],
)
case("and they land after the Enter", with_keys[2][0] > SUBMIT_AT, True)

# ── the tail ────────────────────────────────────────────────────────────────

# 7 — **`KEY=VALUE` and keystrokes are told apart by the `=`.** The keystroke
# argument was here first, so a positional after it would have made the
# environment optional-in-the-middle.
case(
    "an override and a keystroke argument in either order",
    parse_tail(["LANG=en_GB.UTF-8", "nn"]),
    ({"LANG": "en_GB.UTF-8"}, b"nn"),
)
case("order does not matter", parse_tail(["nn", "LANG=C"]), ({"LANG": "C"}, b"nn"))

# 8 — **`KEY=` unsets rather than setting empty**, and the distinction is C02
# §3's: absent `COLORTERM` and empty `COLORTERM` are different inputs, and the
# 256-colour depth needs the first. The value survives as `""` to `run`, which
# pops the variable — so what this row pins is that the empty string is *carried*
# and not discarded here.
case("an empty value is carried, not dropped", parse_tail(["COLORTERM="]), ({"COLORTERM": ""}, b""))
case(
    "a value containing an `=` keeps it",
    parse_tail(["OPTS=a=b"]),
    ({"OPTS": "a=b"}, b""),
)
case("no tail at all is no overrides and no keys", parse_tail([]), ({}, b""))

# 9 — **A shot that names a locale gets that locale and nothing else** (F157).
#
# This is an end-to-end row rather than a parse row, because the defect it pins
# was invisible to every parse: the override reached the child exactly as
# written, and the child *also* held `LC_CTYPE=C.UTF-8` that nobody in this
# repository set. Python's PEP 538 locale coercion exports it at interpreter
# start, `pty.fork()` hands it on, and `LC_CTYPE` outranks `LANG` — so
# `depth-ascii` drew 1,233 box-drawing dashes in the one picture whose whole job
# is the ASCII fallback, for the life of the shot.
#
# What it asserts is the child's own report, from `env`, not our bookkeeping.
_saved_app = capture.APP
try:
    capture.APP = ["/usr/bin/env"]
    capture.run(80, 24, [(0.1, b"")], "/tmp/_capture_locale_row", 1.2, {"LANG": "C"})
    with open("/tmp/_capture_locale_row", "rb") as fh:
        seen = fh.read().decode("utf8", "replace")
    reported = {
        line.split("=", 1)[0]: line.split("=", 1)[1].strip()
        for line in seen.split("\n")
        if "=" in line and line.split("=", 1)[0] in ("LANG", "LC_ALL", "LC_CTYPE")
    }
    case("a locale shot gets the locale it named", reported.get("LANG"), "C")
    case("and no LC_CTYPE the harness coerced", "LC_CTYPE" in reported, False)
    case("and no LC_ALL it did not ask for", "LC_ALL" in reported, False)
finally:
    capture.APP = _saved_app
    os.remove("/tmp/_capture_locale_row")


if __name__ == "__main__":
    sys.exit(main("capture.py"))
