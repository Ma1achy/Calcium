#!/usr/bin/env python3
"""Render a PTY capture into the screen a human would have seen.

**Stripping escape sequences is not reading a frame.** A terminal application
redraws by moving the cursor and overwriting, so a stripped capture concatenates
every frame it ever drew and a redraw is indistinguishable from nothing having
happened. That ambiguity cost an afternoon: `/ps` and `/help` both appeared to
render nothing, and the evidence could not tell "no entry was produced" from "the
final frame overwrote the line I was looking at".

So this replays the capture into a grid, the way the terminal does, and prints
the last state. Only the sequences Calcium actually emits are handled — the point
is to read frames, not to be a terminal.
"""

import re
import sys

CSI = re.compile(r"\x1b\[([0-9;?]*)([a-zA-Z])")
OSC = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")


class Screen:
    def __init__(self, cols: int, rows: int) -> None:
        self.cols, self.rows = cols, rows
        self.grid = [[" "] * cols for _ in range(rows)]
        self.r = self.c = 0

    def newline(self) -> None:
        """Advance a row, scrolling when there is nowhere to advance to.

        This was `min(self.r + 1, self.rows - 1)`, which pins the cursor to the
        last row and overwrites it forever — wrong, because Ink redraws by
        moving *up* a computed number of lines, and an emulator whose row has
        stopped tracking the real one erases the wrong rows from then on.

        **It fixed nothing, and that is worth writing down rather than hiding.**
        It was changed while `/ps` and `/dashboard` both appeared to render an
        empty transcript, and the replay is byte-identical before and after: the
        frames were never lost. They were at rows 29–39 of a 40-row screen and
        the output was being read through `head -20`.

        So the diagnosis was wrong and the change is still right — those are
        independent, and the tempting move is to keep the fix and the story it
        came with. A correct change that alters nothing observable is a signal
        that the cause is still out there, which is what it turned out to be.
        The real lesson is one line long: **read the whole screen.** An emulator
        exists so a frame can be looked at, and looking at half of it
        reintroduces exactly the ambiguity it was built to remove.
        """
        if self.r + 1 < self.rows:
            self.r += 1
        else:
            self.grid.pop(0)
            self.grid.append([" "] * self.cols)

    def put(self, ch: str) -> None:
        if ch == "\n":
            self.newline()
            self.c = 0
        elif ch == "\r":
            self.c = 0
        elif ch == "\t":
            self.c = min(self.c + 8 - (self.c % 8), self.cols - 1)
        elif ch >= " ":
            if self.c >= self.cols:
                self.newline()
                self.c = 0
            self.grid[self.r][self.c] = ch
            self.c += 1

    def csi(self, params: str, final: str) -> None:
        nums = [int(p) for p in params.split(";") if p.isdigit()]
        n = nums[0] if nums else 0
        if final == "H":  # cursor position, 1-based
            self.r = max(0, min((nums[0] if nums else 1) - 1, self.rows - 1))
            self.c = max(0, min((nums[1] if len(nums) > 1 else 1) - 1, self.cols - 1))
        elif final == "A":
            self.r = max(0, self.r - max(1, n))
        elif final == "B":
            self.r = min(self.rows - 1, self.r + max(1, n))
        elif final == "C":
            self.c = min(self.cols - 1, self.c + max(1, n))
        elif final == "D":
            self.c = max(0, self.c - max(1, n))
        elif final == "G":
            self.c = max(0, min((n or 1) - 1, self.cols - 1))
        elif final == "J":  # erase display
            if n == 2:
                self.grid = [[" "] * self.cols for _ in range(self.rows)]
                self.r = self.c = 0
            elif n == 0:
                for cc in range(self.c, self.cols):
                    self.grid[self.r][cc] = " "
                for rr in range(self.r + 1, self.rows):
                    self.grid[rr] = [" "] * self.cols
        elif final == "K":  # erase line
            if n == 0:
                for cc in range(self.c, self.cols):
                    self.grid[self.r][cc] = " "
            elif n == 2:
                self.grid[self.r] = [" "] * self.cols

    def text(self) -> str:
        return "\n".join("".join(row).rstrip() for row in self.grid)


def render(raw: str, cols: int, rows: int) -> str:
    raw = OSC.sub("", raw)
    scr = Screen(cols, rows)
    i = 0
    while i < len(raw):
        m = CSI.match(raw, i)
        if m:
            scr.csi(m.group(1), m.group(2))
            i = m.end()
            continue
        if raw[i] == "\x1b":
            i += 2  # a two-byte escape we do not model
            continue
        scr.put(raw[i])
        i += 1
    return scr.text()


if __name__ == "__main__":
    path, cols, rows = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    with open(path, "rb") as fh:
        data = fh.read().decode("utf8", "replace")
    # `script` writes a header line before the session proper.
    data = data.split("\n", 1)[1] if data.startswith("Script started") else data
    out = render(data, cols, rows)
    print("\n".join(line for line in out.split("\n")))
