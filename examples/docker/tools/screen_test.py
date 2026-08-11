#!/usr/bin/env python3
"""The screen model, verified before anything is read through it.

**This is a port, not a design.** `test/unit/support-screen.test.ts` is the same
six rows against `test/support/screen.ts`, whose header calls this file *"the
PTY-side equivalent"* — and only the TypeScript twin had them. So the instrument
every frame-read in steps 9 through 13 actually went through was the one with no
fixture, which is FINDINGS F79's whole point: `screen.py` was trusted for three
steps and checked once, by accident, because `38;5;` is obviously not something
this application prints. A subtler corruption — a digit, a truncation mark —
would have read as an application defect and been "fixed" in the application.

`test/support/README.md`'s rule is the one being applied: *a fixture must be
shown to respond to the thing under test before it is asserted against.* This
model stands between every frame assertion and the bytes, so one that quietly
returned blanks would turn six failing rows green and say nothing.

**Group 9's disposition is one fixture per instrument and this is 1 of 11.** The
row does not close on it.

    python3 examples/docker/tools/screen_test.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from screen import render  # noqa: E402

COLS, ROWS = 10, 4
HOME = "\x1b[H"
RESET = "\x1b[0m"


def cursor_to(row: int, col: int) -> str:
    """0-based, as the TypeScript `cursorTo` is. CUP itself is 1-based."""
    return f"\x1b[{row + 1};{col + 1}H"


def pad(s: str) -> str:
    return s.ljust(COLS)


def screen(*writes: str) -> list[str]:
    """The rows, trailing blanks dropped — the TypeScript model's `text`."""
    return render("".join(writes), COLS, ROWS).split("\n")


def rows_of(*writes: str) -> list[str]:
    """Every row padded — the TypeScript model's `rows`, for whole comparisons."""
    return [r.ljust(COLS) for r in screen(*writes)]


FRAME = [pad(s) for s in ("alpha", "bravo", "charlie", "delta")]

CASES: list[tuple[str, object, object]] = []


def case(name: str, got: object, want: object) -> None:
    CASES.append((name, got, want))


# 1 — a whole frame written from HOME.
case(
    "folds a whole-frame write from HOME",
    screen(HOME + "\r\n".join(FRAME)),
    ["alpha", "bravo", "charlie", "delta"],
)

# 2 — a CUP-addressed difference folded onto what is already there.
case(
    "folds a CUP-addressed difference onto what is already there",
    screen(HOME + "\r\n".join(FRAME), cursor_to(1, 0) + RESET + pad("BRAVO!")),
    ["alpha", "BRAVO!", "charlie", "delta"],
)

# 3 — **the property the whole exercise rests on.** If a repainted screen and a
# diffed one ever differ, a capture read either way is showing something the
# terminal never held, and no assertion about one alone can see it.
SECOND = [pad(s) for s in ("alpha", "BRAVO!", "charlie", "DELTA?")]
case(
    "gives the same screen for a whole frame and for a difference reaching it",
    rows_of(
        HOME + "\r\n".join(FRAME),
        cursor_to(1, 0) + RESET + SECOND[1] + cursor_to(3, 0) + RESET + SECOND[3],
    ),
    rows_of(HOME + "\r\n".join(SECOND)),
)

# 4 — the control. A model that ignored its input passes every row above.
case(
    "responds to the thing under test — a wrong row is a wrong screen",
    screen(HOME + "\r\n".join(FRAME), cursor_to(1, 0) + pad("WRONG"))[1],
    "WRONG",
)

# 5 — **F79's subject.** A 256-colour SGR rendered as `38;5;` where a six-cell
# step number belonged. It does not reproduce and F86 established why; this row
# is what keeps it from returning silently.
case(
    "strips SGR and modes without consuming the text around them",
    screen(HOME + "\x1b[?25l\x1b[38;5;1mred\x1b[39m" + " " * 7)[0],
    "red",
)

# 5b — **F86's subject, and the defect this port repaired.** An unterminated OSC
# used to match nothing, so the render loop skipped its two escape bytes and
# wrote `0;docker-tui` into the grid as text. Four forms, because the fix has to
# discard the title *without* eating the sequence that follows it — the failure
# a single row would miss is a lookahead that swallows the CSI.
case(
    # **The payload is nine cells and the screen is ten, deliberately.** The
    # first draft used F79's full line, which is seventeen — so it wrapped, the
    # row read `[3/3] RUN` against an expectation of the whole line, and the
    # fixture failed on its own arithmetic rather than on the tool. Caught by
    # running it, which is the argument for the file.
    "discards an unterminated OSC and keeps the sequence after it (F86)",
    screen("\x1b]0;docker-tui\x1b[38;5;188m[3/3] RUN\n")[0],
    "[3/3] RUN",
)
case(
    "discards a BEL-terminated OSC",
    screen("\x1b]0;t\x07\x1b[38;5;188m[3/3] RUN\n")[0],
    "[3/3] RUN",
)
case(
    "discards an ST-terminated OSC",
    screen("\x1b]0;t\x1b\\\x1b[38;5;188m[3/3] RUN\n")[0],
    "[3/3] RUN",
)
case(
    "discards an OSC running to the end of the capture",
    screen("hello\x1b]0;trailing")[0],
    "hello",
)

# 7 — **the arms the TypeScript twin has no reason to have.** This is where the
# port stops being a port: `test/support/screen.ts` models what `composeFrame`
# writes, which is HOME, CUP at column 0, and `\r\n`. This file replays a *real
# capture* — Ink's redraws, docker's own output, anything the far side prints —
# so its input domain is strictly larger and the six rows do not cover it.
#
# **Found by mutation, not by reading.** Making CUP ignore its column entirely
# left the ported rows at 10/10, because every one of them addresses column 0.
# Each row below kills a mutation the six could not.
case(
    "CUP addresses a column, not only a row",
    screen(HOME + "\r\n".join(FRAME), cursor_to(1, 3) + "XX")[1],
    "braXX",
)
case(
    "CUF moves the cursor forward without writing",
    screen(HOME + "abc" + "\x1b[2C" + "Z")[0],
    "abc  Z",
)
case(
    "EL erases to the end of the line and leaves the head",
    screen(HOME + "\r\n".join(FRAME), cursor_to(2, 4) + "\x1b[K")[2],
    "char",
)
case(
    "ED clears the screen and homes the cursor",
    screen(HOME + "\r\n".join(FRAME), "\x1b[2J" + "after"),
    ["after", "", "", ""],
)
case(
    "CUU moves up, so a redraw overwrites the row it meant",
    screen(HOME + "one\r\ntwo\r\nthree", "\x1b[2A\rTWO"),
    ["TWO", "two", "three", ""],
)

# 8 — blank where nothing was written, which is the assertion a model returning
# blanks would satisfy everywhere. It is last on purpose: rows 1 to 5 are what
# make it mean anything.
case(
    "starts blank, and a short write leaves the rest of the screen blank",
    screen(HOME + pad("only")),
    ["only", "", "", ""],
)


def main() -> int:
    failed = 0
    for name, got, want in CASES:
        if got == want:
            print(f"  ok    {name}")
        else:
            failed += 1
            print(f"  FAIL  {name}\n          got  {got!r}\n          want {want!r}")
    total = len(CASES)
    print(f"\nscreen.py — {total - failed}/{total} rows")
    # **The count is printed whatever happens**, on `checkFindings`' precedent: an
    # exit status is one bit and it is the same bit for "clean" and for "the case
    # list was empty". Three instruments reported completion they never observed
    # in the session this file was written.
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
