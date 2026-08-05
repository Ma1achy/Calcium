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

# **The bin, not the module.** This used to be `node
# --experimental-strip-types src/main.ts`, which is the mechanism rather than
# the wiring: every frame in this repository was read against an entry point no
# user has. The `bin` entry was broken for the whole project — a `.ts` file,
# mode 0644, no shebang — and none of these captures could have shown it,
# because none of them went through it.
#
# Going through it now means the harness fails if the shebang, the mode bit or
# the launcher's import ever breaks, which is the one place that failure is
# cheap to notice.
APP = ["./bin/docker-tui.js"]


def run(
    cols: int,
    rows: int,
    script: list[tuple[float, bytes]],
    out_path: str,
    hold: float = 3.0,
    env: dict[str, str] | None = None,
) -> None:
    """`script` is (seconds-from-start, bytes-to-send); it is read in order.

    `env` overrides the child's environment, which is how S12 captures the same
    surface at five depths. `TERM` and `COLORTERM` are the two the depth is read
    from and `LANG` decides unicode — C02 §3 — and the app hands `process.env`
    straight to `createTui`, so setting them here is the whole mechanism.

    A value of `""` **unsets** the variable rather than setting it empty: absent
    `COLORTERM` and empty `COLORTERM` are different inputs to C02's rules, and
    the 256-colour row needs the first.
    """
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.environ["COLUMNS"] = str(cols)
        os.environ["LINES"] = str(rows)
        for key, value in (env or {}).items():
            if value == "":
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        os.execvp(APP[0], APP)

    # The size the child sees, set on the master before it draws anything.
    import fcntl
    import struct
    import termios

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    captured = bytearray()
    # **Timed, for the same bytes.** `frames` is `(seconds-from-start, chunk)`,
    # which is everything asciicast v2 needs and costs one tuple per read. The
    # raw stream and the timed one are the same capture seen two ways rather
    # than two captures — so a frame read from `screen.py` and a beat played in
    # the recording cannot disagree about what happened.
    frames: list[tuple[float, bytes]] = []
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
            frames.append((time.monotonic() - start, chunk))

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
    write_cast(out_path + ".cast", cols, rows, frames)
    print(
        f"{out_path}: {len(live_bytes)} bytes live "
        f"(+{len(captured) - len(live_bytes)} teardown) at {cols}x{rows}, "
        f"{len(frames)} cast frames",
        file=sys.stderr,
    )


def write_cast(
    path: str, cols: int, rows: int, frames: list[tuple[float, bytes]]
) -> None:
    """asciicast v2: a JSON header line, then one `[time, "o", text]` per read.

    **Written here rather than taken from a package**, and the argument is
    DEPENDENCIES.md's: the format is a header and a list, the writer is twenty
    lines, and `asciinema` would be a tool installed to produce a file this
    already has in memory. The recording and the frame-reads then come from *one*
    capture, which matters more than the twenty lines — a screencast recorded by
    a second run of the app is a different session from the one that was read.

    **Decoded incrementally, and the first version was not — which was visible
    in the second frame anyone read.** The format is JSON, so the payload must be
    text, and `os.read` splits on bytes: a 64 KiB read lands mid-sequence
    whenever the terminal is drawing box characters, which is most of the time
    here. Decoding each chunk independently with `errors="replace"` put U+FFFD
    in the middle of a panel border, and the panel then wrapped — a corrupted
    frame in the recording, with the raw stream beside it perfectly intact.

    `IncrementalDecoder` carries the partial sequence to the next chunk, which
    is what makes the cast and the raw capture the same session rather than two
    accounts of it. `errors` is left strict deliberately: there is nothing left
    for it to paper over, and a failure here would be a real one.
    """
    import codecs
    import json

    decoder = codecs.getincrementaldecoder("utf-8")()
    with open(path, "w", encoding="utf8") as fh:
        header = {"version": 2, "width": cols, "height": rows, "env": {"TERM": "xterm-256color"}}
        fh.write(json.dumps(header) + "\n")
        for i, (at, chunk) in enumerate(frames):
            text = decoder.decode(chunk, final=i == len(frames) - 1)
            if text:
                fh.write(json.dumps([round(at, 6), "o", text]) + "\n")


if __name__ == "__main__":
    cols, rows, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    command = sys.argv[4].encode() if len(sys.argv) > 4 else b"/dashboard"
    # `hold` must outlast the far side, and generously: `docker stats
    # --no-stream` takes ~2s, the dashboard runs it *and* `docker ps -a`, and a
    # capture that ends mid-fetch shows an empty transcript — which reads
    # exactly like a command that produced nothing.
    hold = float(sys.argv[5]) if len(sys.argv) > 5 else 12.0
    # Everything after the hold is either a `KEY=VALUE` environment override
    # (S12's five depths) or the keystrokes to send afterwards. They are told
    # apart by the `=`, because the keystroke argument was here first and adding
    # a positional after it would have made the environment optional-in-the-
    # middle. `KEY=` unsets rather than setting empty.
    tail = sys.argv[6:]
    overrides = dict(a.split("=", 1) for a in tail if "=" in a)
    rest = [a for a in tail if "=" not in a]
    # Typed, then Enter two seconds later — outside the paste window.
    #
    # **Keys after the Enter**, for a surface that is only interesting once it
    # is on screen: a pushed view's motions cannot be read from the frame the
    # command produced. Given as a sixth argument, one keypress per second, and
    # each one its own write for the same reason the command is not a burst —
    # bytes arriving together are a paste, and `n` twice in one write is text.
    keys = rest[0].encode() if rest else b""
    after = [(5.0 + i, bytes([k])) for i, k in enumerate(keys)]
    run(cols, rows, [(1.5, command), (3.5, b"\r"), *after], out, hold, overrides)
