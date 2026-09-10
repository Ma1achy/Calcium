#!/usr/bin/env python3
"""The terminal read's machine half — what the terminal ANSWERS.

    python3 probe.py              # -> results/<terminal>.txt, the read corpus
    python3 probe.py <path>       # -> <path>, unchanged since this was written

**The bare form is the one that closes the loop** (F1060): `results/` is read
back by `test/unit/terminal-probe.test.ts`, which fails when a recorded verdict
disagrees with `src/terminal/capabilities.ts`'s image-protocol table. Before it
existed the table's expiry was *run the probe there and read the verdict* with
nothing reading the verdict, and one output path meant the second terminal's run
overwrote the first's. See `report_path` for why the argument kept its meaning.

This cannot see a picture. It asks the terminal questions that have byte
answers, which covers exactly the checks that are about protocol conformance
rather than appearance:

  G7        does the terminal decode what our decoder refuses
  check 2   is a plane-16 placeholder one cell — C09 4c's stated blind spot
  check 9   is the cursor where the next write expects it

Everything else in the ten needs eyes.
"""
import os, re, sys, json, select, termios, tty, time

TTY = open("/dev/tty", "r+b", buffering=0)
FD = TTY.fileno()
HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "bytes")
RESULTS = os.path.join(HERE, "results")
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


def xtversion():
    """What the terminal calls *itself* — `CSI > 0 q`, answered `DCS > | name ST`.

    **Asked because two of the three terminals measured so far put no version in
    the environment at all.** kitty and XTerm set neither `TERM_PROGRAM` nor
    `TERM_PROGRAM_VERSION`, so a record identified from the environment says
    `xterm-kitty` and nothing more — and a results *file* named from that is
    overwritten by the next kitty release, which is the same defect the per
    terminal directory exists to fix, one level down. Ghostty's record predates
    this line and is identified by `TERM_PROGRAM` instead, so the reader treats
    it as optional rather than required.
    """
    raw = ask(b"\x1b[>0q", b"\x1b\\", 2.0)
    if b"\x1bP>|" not in raw:
        return "?"
    body = raw.split(b"\x1bP>|")[-1].split(b"\x1b\\")[0]
    return body.decode("ascii", "replace").strip() or "?"


def report_path(argv, env, emulator):
    """Where the report goes. **The contract, decided rather than inherited.**

    `probe.py <path>` writes to `<path>` and means exactly what it has always
    meant — a file name is a public surface for anyone who has ever run this,
    and the alternative considered was redefining the argument to name the
    results *directory*. That was refused: an invocation whose shape does not
    change and whose meaning does is the worst kind of break, and it would put a
    directory where the caller expected a file with nothing reporting a conflict.

    **With no argument the report goes to `results/<terminal>.txt`**, which is
    the corpus `test/unit/terminal-probe.test.ts` reads back. The new behaviour
    is the default rather than the argument because the person who has an
    invocation memorised keeps their file, and the person who runs it bare — who
    is the one who has not read this — gets the loop. Bare was previously an
    `IndexError` raised *after* the whole terminal read had finished and before
    a line of it was printed, so the reading was lost; measured, not recalled.

    **The name is for a human and the record's own header is what the reader
    parses.** Renaming a file therefore breaks nothing, and two records for one
    terminal are read as two records rather than silently merged. Two runs of the
    same terminal at the same version overwrite each other, which is intended:
    the newest reading of `kitty 0.41.1` *is* the reading of `kitty 0.41.1`.
    """
    if len(argv) > 1:
        return argv[1]
    # **Three sources in one order, and the order is the argument.**
    # `TERM_PROGRAM` first because it is what C02 itself identifies a terminal
    # by, and because it arrives with a version beside it. The terminal's own
    # `XTVERSION` answer second, because it is present in exactly the case the
    # environment is silent — kitty and XTerm set no `TERM_PROGRAM` at all, so
    # without this arm both would be named for their terminfo entry and every
    # release would overwrite the last. `TERM` last: it names a terminfo entry
    # rather than an emulator, and `xterm` is the name half the world claims.
    program = env.get("TERM_PROGRAM", "").strip()
    if program:
        stem = f"{program} {env.get('TERM_PROGRAM_VERSION', '').strip()}"
    elif emulator and emulator != "?":
        stem = emulator
    else:
        stem = env.get("TERM", "") or "unknown"
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-.").lower()
    os.makedirs(RESULTS, exist_ok=True)
    return os.path.join(RESULTS, (slug or "unknown") + ".txt")


log("=" * 72)
log("the terminal read — the machine half")
log("=" * 72)
log()
log(f"TERM             {os.environ.get('TERM', '?')}")
log(f"TERM_PROGRAM     {os.environ.get('TERM_PROGRAM', '?')} {os.environ.get('TERM_PROGRAM_VERSION', '')}")
EMULATOR = xtversion()
log(f"EMULATOR         {EMULATOR}")
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
path = report_path(sys.argv, os.environ, EMULATOR)
with open(path, "w") as fh:
    fh.write(text + "\n")
sys.stdout.write("\x1b[0m\r\n" + text + f"\r\n\r\nwritten to {path}\r\nthis window stays open 3s.\r\n")
sys.stdout.flush()
time.sleep(3)
