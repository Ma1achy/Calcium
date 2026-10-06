# Headless flow probe: runs a Calcium app in a real pseudo-terminal, sends keys, and dumps
# the screen (text, cursor, painted grounds) after each step. Needs: pip install pyte.
# Usage: STEPS='[["stab","into transcript"],["down","down"]]' python3 flow-probe.py <app dir> node --experimental-strip-types main.ts
import os, pty, sys, time, select, json, pyte
COLS, ROWS = int(os.environ.get("COLS",110)), int(os.environ.get("ROWS",34))
cwd, cmd = sys.argv[1], sys.argv[2:]
screen = pyte.Screen(COLS, ROWS); stream = pyte.ByteStream(screen)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    env = dict(os.environ, TERM="xterm-256color", COLUMNS=str(COLS), LINES=str(ROWS), COLORTERM="truecolor")
    os.execvpe(cmd[0], cmd, env)
import fcntl, termios, struct
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
raw = bytearray()
def pump(t):
    end = time.time()+t
    while time.time() < end:
        r,_,_ = select.select([fd],[],[],0.05)
        if r:
            try: b = os.read(fd, 65536)
            except OSError: return
            raw.extend(b); stream.feed(b)
def dump(label):
    print(f"===== {label} =====")
    for i,l in enumerate(screen.display):
        if l.strip(): print(f"{i:2}|{l.rstrip()}")
    print(f"   cursor=({screen.cursor.y},{screen.cursor.x}) hidden={screen.cursor.hidden}")
    bgs=[]
    for y in range(ROWS):
        row=screen.buffer[y]; xs=[x for x in range(COLS) if row[x].bg!='default' or row[x].reverse]
        if xs: bgs.append(f"r{y}:{min(xs)}-{max(xs)}({len(xs)}) bg={row[xs[0]].bg} rev={row[xs[0]].reverse}")
    print("   painted grounds:", bgs if bgs else "none")
KEYS = {"up":"\x1b[A","down":"\x1b[B","right":"\x1b[C","left":"\x1b[D","enter":"\r","esc":"\x1b","stab":"\x1b[Z","tab":"\t"}
pump(4); dump("start")
for step in json.loads(os.environ.get("STEPS","[]")):
    k, label = step
    for part in k.split(" "):
        os.write(fd, KEYS.get(part, part).encode()); pump(0.35)
    pump(0.8); dump(label)
os.write(fd, b"\x03"); pump(0.5)
open("/home/claude/drive/raw.bin","wb").write(raw)
