#!/usr/bin/env python3
"""Run the demo in a real terminal and print two captures, seconds apart.

**One thing `examples/minimal`'s driver cannot express**, and it is the whole
reason this exists rather than importing that one: minimal asks *did the chain
run* and prints the accumulated stream. This asks *does the live part still
advance three seconds later*, which is a question about two moments — and a
cumulative stream cannot answer it, because a byte written once is in it forever.

So the output is two captures with a marker between them, and the caller
compares. `examples/docker/tools/capture.py` is the instrument that reads frames
properly, through a screen model; duplicating it here would be the F14 shape.
What this needs is smaller and honestly stated: **the walk's own sample count is
visible in its x-axis labels**, so a text comparison of the two captures answers
the question without a screen model at all.

Two rules carry over because they are about the application, not the instrument:

- **Wait for the prompt, never for a clock.** The package takes seconds to
  import `dist`, and a fixed delay is a fixture asserting the machine.
- **SIGTERM, never SIGKILL.** The shell gets to flush.
"""

import os
import pty
import select
import signal
import sys
import time

MARKER = b"\n--- SECOND CAPTURE ---\n"
SETTLE = 1.5
GAP = 3.0


def main(argv: list[str]) -> int:
    cols, rows = 120, 48
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.environ["LANG"] = "en_GB.UTF-8"
        os.environ["COLUMNS"] = str(cols)
        os.environ["LINES"] = str(rows)
        os.execvp(argv[0], argv)

    import fcntl
    import struct
    import termios

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    PROMPT = "❯".encode()
    first = bytearray()
    second = bytearray()
    ready: float | None = None
    split_at: float | None = None
    start = time.monotonic()
    while time.monotonic() - start < 40.0:
        now = time.monotonic() - start
        if ready is None and PROMPT in first:
            ready = now
            # The greeting is not awaited, so the prompt can precede the figures.
            split_at = now + SETTLE
        if split_at is not None and now >= split_at + GAP:
            break
        r, _, _ = select.select([fd], [], [], 0.1)
        if fd in r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            if split_at is not None and now >= split_at:
                second.extend(chunk)
            else:
                first.extend(chunk)

    os.kill(pid, signal.SIGTERM)
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass
    sys.stdout.buffer.write(bytes(first))
    sys.stdout.buffer.write(MARKER)
    sys.stdout.buffer.write(bytes(second))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or ["node", "main.ts"]))
