#!/usr/bin/env python3
"""The terminal read's machine half — what the terminal ANSWERS.

This cannot see a picture. It asks the terminal questions that have byte
answers, which covers exactly the checks that are about protocol conformance
rather than appearance:

  G7        does the terminal decode what our decoder refuses
  check 2   is a plane-16 placeholder one cell — C09 4c's stated blind spot
  check 9   is the cursor where the next write expects it

Everything else in the ten needs eyes.
"""
import os, sys, json, select, termios, tty, time

TTY = open("/dev/tty", "r+b", buffering=0)
FD = TTY.fileno()
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bytes")
OUT = []


def log(s=""):
    OUT.append(s)


def ask(seq, terminator, timeout=3.0):
    """Write a query, read until the terminator, return the raw reply."""
    old = termios.tcgetattr(FD)
    try:
        tty.setraw(FD)
        TTY.write(seq)
        acc = b""
        deadline = time.time() + timeout
        while time.time() < deadline:
            r, _, _ = select.select([FD], [], [], deadline - time.time())
            if not r:
                break
            chunk = os.read(FD, 4096)
            if not chunk:
                break
            acc += chunk
            if acc.endswith(terminator):
                break
        return acc
    finally:
        termios.tcsetattr(FD, termios.TCSADRAIN, old)


def cursor():
    """Row, column — 1-based, as the terminal reports them."""
    reply = ask(b"\x1b[6n", b"R", 2.0)
    try:
        body = reply.split(b"\x1b[")[-1].rstrip(b"R")
        row, col = body.split(b";")
        return int(row), int(col)
    except Exception:
        return None, None


def kitty_reply(raw):
    """OK, or the error the terminal names."""
    if b"\x1b_G" not in raw:
        return "NO RESPONSE"
    body = raw.split(b"\x1b_G")[-1].split(b"\x1b\\")[0]
    msg = body.split(b";", 1)[1] if b";" in body else body
    return msg.decode("ascii", "replace").strip() or "EMPTY"


log("=" * 72)
log("the terminal read — the machine half")
log("=" * 72)
log()
log(f"TERM             {os.environ.get('TERM', '?')}")
log(f"TERM_PROGRAM     {os.environ.get('TERM_PROGRAM', '?')} {os.environ.get('TERM_PROGRAM_VERSION', '')}")
sz = os.get_terminal_size()
log(f"size             {sz.columns} x {sz.lines} cells")
log()

# --- does this terminal speak the protocol at all -----------------------------
log("-- kitty graphics support ".ljust(72, "-"))
probe = b"\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\"
raw = ask(probe, b"\x1b\\", 3.0)
support = kitty_reply(raw)
log(f"  1x1 direct RGB query  ->  {support}")
if support != "OK":
    log("  ** the terminal did not answer OK; everything below is unreadable **")
log()

# --- G7: what the terminal decodes that we do not -----------------------------
log("-- G7 · what the terminal decodes ".ljust(72, "-"))
manifest = json.load(open(os.path.join(DIR, "manifest.json")))
verdicts = {}
for entry in manifest:
    name = entry["file"]
    with open(os.path.join(DIR, f"{name}.transmit"), "rb") as fh:
        seq = fh.read()
    raw = ask(seq, b"\x1b\\", 8.0)
    v = kitty_reply(raw)
    verdicts[name] = v
    log(f"  {name:<16} {entry['cols']:>3}x{entry['rows']:<3} {len(seq):>7}B  ->  {v}")
    log(f"  {'':<16} {entry['why']}")
log()

# --- check 2: the plane-16 guarantee, observed --------------------------------
log("-- check 2 · is a plane-16 placeholder ONE CELL ".ljust(72, "-"))
with open(os.path.join(DIR, "twenty-cells.txt"), "rb") as fh:
    twenty = fh.read()
old = termios.tcgetattr(FD)
try:
    tty.setraw(FD)
    TTY.write(b"\r\n")
    _, before = None, None
    reply = ask(b"\x1b[6n", b"R", 2.0)
    body = reply.split(b"\x1b[")[-1].rstrip(b"R")
    before = int(body.split(b";")[1])
    TTY.write(twenty)
    reply = ask(b"\x1b[6n", b"R", 2.0)
    body = reply.split(b"\x1b[")[-1].rstrip(b"R")
    after = int(body.split(b";")[1])
finally:
    termios.tcsetattr(FD, termios.TCSADRAIN, old)
consumed = after - before
log(f"  20 placeholder cells emitted")
log(f"  cursor column {before} -> {after}   consumed {consumed}")
log(f"  the claim is 20 (one cell each).  {'HOLDS' if consumed == 20 else 'DOES NOT HOLD'}")
if consumed != 20 and consumed > 0:
    log(f"  ** {consumed / 20:.2f} cells per placeholder — every image is that factor wide **")
log()

# --- check 2b: the same, for a placeholder of an image that WAS transmitted ---
#
# The measurement above used id 1, which nothing sent — so it measured the
# terminal's advance for a bare private-use glyph. An image cell may differ, and
# the geometry claim is about the cell.
log("-- check 2b · the same, for a placeholder of a TRANSMITTED image ".ljust(72, "-"))
entry2 = manifest[0]
with open(os.path.join(DIR, f"{entry2['file']}.place"), "rb") as fh:
    first_row = fh.read().split(b"\n")[0]
old_t = termios.tcgetattr(FD)
try:
    tty.setraw(FD)
    TTY.write(b"\r\n")
    reply = ask(b"\x1b[6n", b"R", 2.0)
    b0 = int(reply.split(b"\x1b[")[-1].rstrip(b"R").split(b";")[1])
    TTY.write(first_row)
    reply = ask(b"\x1b[6n", b"R", 2.0)
    b1 = int(reply.split(b"\x1b[")[-1].rstrip(b"R").split(b";")[1])
finally:
    termios.tcsetattr(FD, termios.TCSADRAIN, old_t)
log(f"  {entry2['file']}, one placement row of {entry2['cols']} cells")
log(f"  cursor column {b0} -> {b1}   consumed {b1 - b0}")
log(f"  the claim is {entry2['cols']}.  " +
    ("HOLDS" if (b1 - b0) == entry2["cols"] else "DOES NOT HOLD"))
log()

# --- check 9: the cursor after an image ---------------------------------------
log("-- check 9 · where the cursor lands after an image ".ljust(72, "-"))
entry = manifest[0]
with open(os.path.join(DIR, f"{entry['file']}.place"), "rb") as fh:
    rows = fh.read().split(b"\n")
old = termios.tcgetattr(FD)
try:
    tty.setraw(FD)
    TTY.write(b"\r\n")
    r0, c0 = None, None
    reply = ask(b"\x1b[6n", b"R", 2.0)
    body = reply.split(b"\x1b[")[-1].rstrip(b"R")
    r0, c0 = int(body.split(b";")[0]), int(body.split(b";")[1])
    for row in rows:
        TTY.write(row + b"\r\n")
    reply = ask(b"\x1b[6n", b"R", 2.0)
    body = reply.split(b"\x1b[")[-1].rstrip(b"R")
    r1, c1 = int(body.split(b";")[0]), int(body.split(b";")[1])
finally:
    termios.tcsetattr(FD, termios.TCSADRAIN, old)
log(f"  {entry['file']} placed at {entry['cols']}x{entry['rows']}")
log(f"  cursor row {r0} -> {r1}   advanced {r1 - r0} rows, column {c1}")
log(f"  expected {len(rows)} rows and column 1.  " +
    ("HOLDS" if (r1 - r0) == len(rows) and c1 == 1 else "DOES NOT HOLD"))
log()
log("=" * 72)

text = "\n".join(OUT)
with open(sys.argv[1], "w") as fh:
    fh.write(text + "\n")
sys.stdout.write("\x1b[0m\r\n" + text + "\r\n\r\nwritten. this window stays open 3s.\r\n")
sys.stdout.flush()
time.sleep(3)
