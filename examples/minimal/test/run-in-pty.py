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

    script = [(1.5, COMMAND), (3.5, b"\r")]
    captured = bytearray()
    start = time.monotonic()
    while time.monotonic() - start < 9.0:
        while script and time.monotonic() - start >= script[0][0]:
            os.write(fd, script.pop(0)[1])
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
