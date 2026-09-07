#!/usr/bin/env python3
"""Run the example in a real terminal and print what the terminal received.

**Deliberately smaller than `examples/docker/tools/capture.py`, and it is a
different job.** That one is the instrument every frame in this repository is
read with: it separates the live capture from the teardown, refuses to truncate,
and its output is replayed through a screen model because *a stripped capture is
not a frame*. Duplicating three hundred lines of it here would be the F14 shape —
a consumer re-implementing a module because it cannot reach it.

This answers one question instead: **did `createTui` open a shell, spawn the far
side, adapt its output and draw?** That is F7's question, and a PTY plus a byte
stream is enough to answer it. The limitation is real and stated in the test: a
byte that was written and then overwritten still appears here, so this is
evidence the chain ran, not evidence about what is on screen.

Two rules carry over because they are about the application, not the instrument:

- **Text and Enter go separately.** C16 has a paste window; bytes arriving
  together are pasted text, and a carriage return inside one burst inserts a
  newline instead of submitting.
- **SIGTERM, never SIGKILL.** The shell gets to flush.
- **Wait for the prompt, never for a clock.** This typed at a fixed 1.5 s and
  the package takes **3.3–4.4 s to import `dist`**, measured three times in the
  devcontainer — so both the command and its Enter were written into a terminal
  whose application had not started, and were gone. It passed on a quick machine
  and failed on a busy one, which is a fixture asserting the machine rather than
  the chain. The command now goes when the prompt appears.
"""

import os
import pty
import select
import signal
import sys
import time

COMMAND = b"/list"


def main(argv: list[str]) -> int:
    cols, rows = 92, 24
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

    # **The prompt is the signal, and the two writes still go separately.**
    # `PROMPT` is what the shell draws when it is ready to read; `SETTLE` is the
    # paste window C16 opens, so the Enter has to arrive after it or the burst
    # reads as pasted text carrying a newline.
    PROMPT = "\u276f".encode()
    SETTLE = 0.5
    captured = bytearray()
    ready: float | None = None
    sent = False
    enter_at: float | None = None
    done_at = 0.0
    start = time.monotonic()
    while time.monotonic() - start < 20.0:
        now = time.monotonic() - start
        if ready is None and PROMPT in captured:
            ready = now
        if ready is not None and not sent and now >= ready + SETTLE:
            os.write(fd, COMMAND)
            sent = True
            enter_at = now + SETTLE
        if sent and enter_at is not None and now >= enter_at:
            os.write(fd, b"\r")
            enter_at = None
            done_at = now + 4.0
        if enter_at is None and sent and now >= done_at:
            break
        r, _, _ = select.select([fd], [], [], 0.1)
        if fd in r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            captured.extend(chunk)

    os.kill(pid, signal.SIGTERM)
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass
    sys.stdout.buffer.write(bytes(captured))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or ["node", "main.ts"]))
