#!/usr/bin/env python3
"""Drive docker-tui in a real PTY and capture what the terminal received.

Two things this must not do, both learned the hard way in step 1.

**It must not send a command as one burst.** C16 has a paste window: bytes
arriving together are treated as pasted text, and a carriage return inside one
inserts a newline rather than submitting. `printf "/ps\\r"` therefore appears to
do nothing, and the defect is entirely in the harness — the shell is behaving
exactly as specified. Text and Enter go separately, with a gap between them.

**It must not be killed with SIGKILL.** A 24576-byte capture truncated at a
buffer boundary is indistinguishable from an application that stopped drawing.
SIGTERM, and the shell gets to flush.

Output is the raw byte stream, for `screen.py` to replay. A stripped capture is
not a frame.
"""

import os
import pty
import select
import signal
import sys
import time

APP = ["node", "--experimental-strip-types", "src/main.ts"]


def run(
    cols: int, rows: int, script: list[tuple[float, bytes]], out_path: str, hold: float = 3.0
) -> None:
    """`script` is (seconds-from-start, bytes-to-send); it is read in order."""
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.environ["COLUMNS"] = str(cols)
        os.environ["LINES"] = str(rows)
        os.execvp(APP[0], APP)

    # The size the child sees, set on the master before it draws anything.
    import fcntl
    import struct
    import termios

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    captured = bytearray()
    start = time.monotonic()
    pending = list(script)
    total = max(t for t, _ in script) + hold

    while time.monotonic() - start < total:
        now = time.monotonic() - start
        while pending and pending[0][0] <= now:
            _, data = pending.pop(0)
            os.write(fd, data)
        r, _, _ = select.select([fd], [], [], 0.05)
        if fd in r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            captured.extend(chunk)

    # The capture is split at the teardown: the live frame is everything up to
    # the signal, the exit sequence is written beside it.
    #
    # The reason is real but smaller than it first looked. The shell runs on the
    # alternate screen, so an exit that restored the primary one and cleared
    # would overwrite the frame under examination — and a replay ending on the
    # empty screen the user is handed back reads exactly like an application
    # that drew nothing. Measured, this shell's teardown is **38 bytes** and
    # erases nothing, so the split prevents a hazard rather than a defect.
    #
    # Kept anyway, and labelled honestly: it costs nothing, the hazard is real
    # for any shell that clears on exit, and it was briefly believed to be the
    # cause of a blank frame that had an entirely different one.
    live_bytes = bytes(captured)

    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        r, _, _ = select.select([fd], [], [], 0.1)
        if fd not in r:
            break
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        if not chunk:
            break
        captured.extend(chunk)
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass

    with open(out_path, "wb") as fh:
        fh.write(live_bytes)
    with open(out_path + ".teardown", "wb") as fh:
        fh.write(bytes(captured)[len(live_bytes):])
    print(
        f"{out_path}: {len(live_bytes)} bytes live "
        f"(+{len(captured) - len(live_bytes)} teardown) at {cols}x{rows}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    cols, rows, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    command = sys.argv[4].encode() if len(sys.argv) > 4 else b"/dashboard"
    # `hold` must outlast the far side, and generously: `docker stats
    # --no-stream` takes ~2s, the dashboard runs it *and* `docker ps -a`, and a
    # capture that ends mid-fetch shows an empty transcript — which reads
    # exactly like a command that produced nothing.
    hold = float(sys.argv[5]) if len(sys.argv) > 5 else 12.0
    # Typed, then Enter two seconds later — outside the paste window.
    run(cols, rows, [(1.5, command), (3.5, b"\r")], out, hold)
