# C27 — Terminal emulator

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L0 data |
| **Depends on** | `@xterm/headless` 6.0.0, wrapped in one file · C04's `Terminal` type |
| **Consumed by** | L4 (C23's shell route) |
| **Source** | `docs/notes/CALCIUM_LIVE_TERMINAL_DESIGN.md` §1–§6 · A02 §1 · F840–F844 |
| **Status** | Spec'd 2026-09-06, unbuilt |

---

## 1. Purpose

C27 turns the bytes a child process writes to its terminal into a `Terminal` block. A child's
`\r`, `\x1b[K`, its colours, its cursor motion and its alternate screen are **interpreted into a
screen buffer and read back as cells**, and the cells are a block in the transcript that measures,
windows, degrades and persists like every other kind. Nothing the child writes ever reaches the
real terminal, and that is the whole reason the component exists: a block cannot pass the child's
bytes through without corrupting the frame around it.

It is **L0 `data/`**, on C07's argument — bytes in, a view-model value out, no clock, no I/O, no
host terminal. L0's two-halves rule (A02 §1) is about the *host* terminal: C27 imports nothing from
`terminal/` and knows nothing of C01's lifecycle. A child's screen is a data structure that happens
to share a word with it.

**The emulator is a dependency, not a project.** The design measured `@xterm/headless` before this
was written (design M1–M9): 183 KB of runtime, zero transitive dependencies, cells with attributes,
the alternate screen as an event, bell and title as events, unknown sequences dropped, resize with
reflow. Writing a parser was the alternative and it is a component-sized piece of work whose first
casualty would be any program drawing two progress lines — cursor-up is outside the constrained set
the brief proposed. The one file allowed to import the package is `src/data/emulator/emulator.ts`
(I11), and it imports through the shape the package actually ships (F841): the CJS `main` via
default interop, because the `module` field names a file the tarball does not contain.

C27 does not own the process (C21), the patching cadence (C23), the rendering (C09) or the block's
validation (C04). It owns the snapshot.

---

## 2. Interface

Declaration and behaviour are separate files, C21 §2's pattern: `src/data/emulator/types.ts` holds
the interface, `src/data/emulator/emulator.ts` holds the wrapper, `src/data/emulator/snapshot.ts`
holds the cell walk. `COMPONENT_SOURCES.C27` points at `emulator.ts`.

```typescript
function createEmulator(opts: EmulatorOptions): Emulator;

type EmulatorOptions = Readonly<{
  cols: number;          // ≥ 1, integer
  rows: number;          // ≥ 1, integer — the block's declared height (C04 I47), never derived from the child
  scrollback?: number;   // lines kept above the screen; default 2000 (design Q11)
}>;

interface Emulator {
  /** Interpret bytes. Resolves when they are in the buffer, so the next `snapshot` shows them (I3). */
  write(chunk: string | Uint8Array): Promise<void>;
  /** Reflow to a new size (I10). Rows are the caller's declared height; they change only if the caller's did. */
  resize(cols: number, rows: number): void;
  /** The block, as a value. `id` is the caller's — block ids are the shell's to choose. */
  snapshot(id: string): Terminal;
  /** Which buffer is active — `"grid"` while the child holds the alternate screen (I4). */
  readonly screen: "lines" | "grid";
  /** Lines lost above the cap since construction (I7). */
  readonly dropped: number;
  /** Release the buffer. Idempotent; `write` after it throws (I12). */
  dispose(): void;
}
```

`write` is asynchronous because the dependency's parser is: it yields between chunks so a flood
cannot starve the event loop, and it calls back when the bytes are interpreted. **The promise is
the contract, not a convenience** — a caller that snapshots before it resolves reads a consistent
screen that may not yet contain the chunk, and a test that writes then snapshots synchronously
asserts nothing (I3).

`snapshot` is synchronous and returns a **frozen value**: a later `write` does not change a
snapshot already taken. The route relies on this to hand one to C13 and keep writing.

Nothing here reads ambient state. There is no environment, no clock and no `stdout`; the emulator
answers terminal queries to nobody (§5) and emits no bytes anywhere (I1).

---

## 3. The snapshot

**`lines` mode** — the normal buffer. `lines` is the scrollback followed by the screen, **trimmed
to the later of the last non-empty line and the cursor's line**: after `line6\r\n` the cursor sits
on an empty seventh row and the snapshot has seven lines, not `rows` more. Trailing blank rows
below the cursor are the emulator's allocation, not the child's output.

**`grid` mode** — the alternate screen. `lines` has **exactly `rows` entries**, blank rows
included, because the program owns the whole screen and a `vim` that has drawn nothing on row 5
still owns row 5. There is no scrollback to have (design Q6, Q10).

`screen` follows the active buffer and flips on `?1049h`/`?1049l` (design M3). After the round
trip the normal buffer is intact — a `less` that quits leaves the log it was paging.

**Each line is text plus runs.** The text is built cell by cell: a wide cluster is one code-point
sequence and its zero-width filler cell is omitted, so `cells(text)` agrees with the column the
emulator painted to (I6). Trailing cells that are blank **and default-styled** are trimmed; **a
blank with a background or an attribute is kept**, because `vim`'s `~` rows and a bar drawn in
reverse video are background. A run covers a maximal range of adjacent cells sharing one style;
a default-styled cell is in no run (I5). Colours are carried as `ColourValue` — `rgb` with a
six-hex `hex`, `ansi256` with an index, `ansi16` with an index — formatted from the cell's integer
and never from a literal (design Q4). Attributes are the six booleans `bold`, `dim`, `italic`,
`underline`, `inverse`, `strike`; blink and invisible are dropped, the first because C09 has no
blink and the second because a cell the child hid is a cell the reader should not see.

**`cursor`** is present in every snapshot, as `{ line, col }` into `lines` (I4). Removing it on
settle is the route's (C23), by omission, not the emulator's.

**`dropped`** appears when at least one line has been lost above the cap and is absent otherwise
(I7): the marker row C09 draws for it is drawn on presence, and a present zero would draw *0 lines
dropped*.

**Containment** (I2). The dependency interprets C0 controls and never stores them as cells, and
the snapshot **re-checks every character** it emits: a C0 or C1 control that reaches the walk is
replaced by U+FFFD. C04's validator refuses a `Terminal` whose text carries one regardless, so a
snapshot from any source — this component, the far side, a persisted document — cannot carry an
escape to the outer terminal. Two gates for one property, because the property is the one that
corrupts state the application can no longer see.

---

## 4. Resize

`resize(cols, rows)` reflows: a 40-column buffer of seven lines resized to 20 columns has nine
(design M6). **No content is lost by a resize** — the same characters are present in the same
order, at different wrap points — and the cap is applied after the reflow, so a reflow that pushes
lines over `scrollback` counts them in `dropped` like any other overflow (I10, I7).

The order of operations at a width change is the shell's and is stated in C23: the child's PTY
is resized **before** the emulator, so the child's repaint lands on a buffer that already has the
new width (design S8). C27 only reflows; it does not know a child exists.

---

## 5. What is absorbed, and what is dropped

| the child writes | C27 does |
|---|---|
| `\x07` (bell) | nothing — `onBell` has no subscriber (I8) |
| `OSC 0 ; title` | nothing — `onTitleChange` has no subscriber (I8) |
| `?1000h` … (mouse tracking), `?2004h` (bracketed paste) | records the mode in the dependency; nothing reads it this round. The attach round reads it to say *this program wants the mouse* |
| `CSI c`, `CSI 6 n`, `DCS … ST` queries | **no answer**. The dependency would emit a response through `onData` and nothing subscribes, so a child that waits for one waits. `vim` waits about a second for its `t_RV` reply and then proceeds; the attach round wires `onData` to `PtyProcess.write` and the wait goes away. Recorded in design §7 as the deferral's fourth row |
| an unknown CSI, DCS or OSC | dropped, not stored (I9, design M5). **Passing an unknown sequence through is how a block corrupts the frame around it** — the tempting implementation is a passthrough default and it is wrong on the twentieth program |
| a C1 control in the text | replaced by U+FFFD at the walk (I2) |

---

## 6. State machine

Per emulator.

| From ↓ / event → | `write` | `resize` | `snapshot` | `dispose` |
|---|---|---|---|---|
| **live** | interpreted; resolves when in the buffer (T1.1) | reflowed (T1.7) | a frozen value (T1.9) | → disposed (T1.10) |
| **disposed** | throws naming `dispose` (T3.6) | throws | throws | no-op (T3.7) |

`snapshot` after `dispose` throws rather than returning the last value, because a caller holding a
disposed emulator and reading a screen from it has a bug the last value would hide. The route
takes its final snapshot **before** disposing (C23).

---

## 7. Invariants

- **I1** — C27 emits no bytes. It writes to no stream, subscribes to no `onData`, and has no reference to the real `process.stdout` or `process.stdin`.
- **I2** — Every `TerminalLine.text` in a snapshot is free of C0 and C1 controls. A control that reaches the cell walk is replaced by U+FFFD.
- **I3** — A `write` whose promise has resolved is visible in the next `snapshot`; a snapshot is a frozen value unaffected by later writes.
- **I4** — In `lines` mode `lines` is the scrollback then the screen, trimmed to the later of the last non-empty line and the cursor's line; in `grid` mode `lines` has exactly `rows` entries. `screen` names the active buffer and `cursor` indexes into `lines`.
- **I5** — A run covers a maximal range of adjacent cells with one style; a default-styled cell is in no run; colours are `ColourValue`s formatted from the cell's integer.
- **I6** — A wide cluster is one code-point sequence in `text` with no filler, and `cells(text)` equals the emulator's painted width for that line. Trailing default-styled blanks are trimmed; a styled blank is kept.
- **I7** — `lines.length ≤ scrollback + rows` always; `dropped` counts every line lost above the cap and is absent when none has been.
- **I8** — Bell and title have no observable effect on any snapshot.
- **I9** — An unrecognised sequence changes no cell and appears in no text.
- **I10** — `resize` reflows and loses no characters; the cap is applied after the reflow.
- **I11** — `src/data/emulator/` imports nothing from `terminal/`, reads no ambient global, and `@xterm/headless` is imported by `emulator.ts` alone.
- **I12** — After `dispose`, `write`, `resize` and `snapshot` throw naming `dispose`; `dispose` is idempotent.

---

## 8. Commitments

1. **Interpret, never pass through.** Every byte the child writes is interpreted into buffer state or dropped. (I1, I2, I9)
2. **The snapshot is a value.** Frozen, control-free, and complete for the mode it describes. (I2, I3, I4)
3. **Cells carry the child's colours as `ColourValue`.** Formatted, never literal; degraded by C10 at render, never here. (I5)
4. **Measurement agrees.** The text a line carries measures, by `cells()`, exactly the width the emulator painted. (I6)
5. **The cap is honest.** Never more than `scrollback + rows` lines, and the count of what was lost travels with the block. (I7, I10)
6. **Bell, title and queries go nowhere.** (I1, I8)
7. **L0 data, and only one importer.** No `terminal/`, no globals, one file touching the dependency. (I11)
8. **Disposal is final and safe.** (I12)

---

## 9. Tests

Six tiers. Tiers 1–3 drive the real dependency with byte strings; nothing is mocked, because the
value of this component is entirely in what the dependency does with the bytes. Tier 5 spawns a
real child under the devcontainer's `node-pty`. Every escape literal in these tests is a test-side
literal: `src/data/emulator/` writes none (A03's escape rule is about `src/`).

### Tier 1 — unit

- **T1.1** (I3): `write("hi")` then `snapshot` → one line `hi`; the snapshot taken before the promise resolved may be empty and the one after is not.
- **T1.2** (I5): `\x1b[38;2;10;200;30mrgb\x1b[38;5;208m256\x1b[31m16\x1b[0m` → three runs: `rgb` `{kind:"rgb", hex:"#0ac81e"}`, `ansi256` 208, `ansi16` 1; the text is `rgb25616`.
- **T1.3** (I5): `\x1b[1;3;4;7;9;2m` → one run with all six booleans true; `\x1b[5m` (blink) and `\x1b[8m` (invisible) produce no run.
- **T1.4** (I6): `wide 漢字 x` → text is that string, `cells(text)` is 10, and no line contains U+0000 or an empty filler.
- **T1.5** (I4): `?1049h` → `screen` is `"grid"` and `lines.length === rows`; `?1049l` → `"lines"` and the earlier lines are intact.
- **T1.6** (I7): `scrollback: 20, rows: 4`, 30 `\r\n`-terminated lines → `lines.length === 24`, `dropped === 6`; the first line kept is `line 7`. The two figures are asserted separately — a conservation total is satisfied by redistribution.
- **T1.7** (I10): 40 columns, seven lines including a 60-character one → `resize(20, 4)` → nine lines, the same characters in order when the texts are concatenated.
- **T1.8** (I4): `\r` overwrite — `...\x1b[K.....` → one line `.....`, five dots.
- **T1.9** (I3): a snapshot taken, then `write("more")` → the first snapshot is unchanged and `Object.isFrozen(first)`.
- **T1.10** (I12): `dispose(); dispose()` → no throw.
- **T1.11** (I4): `cursor` after `abc` is `{ line: 0, col: 3 }`; after `\r\n` it is `{ line: 1, col: 0 }`; in `grid` mode after `\x1b[3;5H` it is `{ line: 2, col: 4 }`.
- **T1.12** (I6): a line ending in `\x1b[41m   \x1b[0m` keeps its three background blanks with a run; a line ending in three plain blanks is trimmed.

### Tier 2 — contract / interface

- **T2.1** (I11): the module graph shows `src/data/emulator/` importing nothing from `src/terminal/`, and `@xterm/headless` imported by `emulator.ts` alone (MG rule, lands with the code).
- **T2.2** (I1): a source scan of `src/data/emulator/` finds no `process.stdout`, `process.stdin`, `console.`, `onData` or `process.env`.
- **T2.3** (I8): a snapshot after `\x07\x1b]0;renamed\x07text` equals the snapshot after `text`, deep.
- **T2.4** (I2): every character of every line of a snapshot taken after a corpus of 1,000 random byte strings is outside U+0000–U+001F, U+007F–U+009F. The corpus is seeded and the seed is in the failure message.
- **T2.5** (I5): a snapshot round-trips through `JSON.parse(JSON.stringify(...))` deep-equal, and `validateDocument` (C04) admits a document holding it.
- **T2.6** (I7): `dropped` is absent from the snapshot when `dropped === 0` and present otherwise — a `Terminal` never carries `dropped: 0`.

### Tier 3 — edge cases

- **T3.1** (I6): `漢` written at column 39 of 40 → it begins the next line; no line has `cells(text) > 40`.
- **T3.2** (I9): `\x1bPunknown\x1b\\` and `\x1b[?9999z` between two words → the text is the two words.
- **T3.3** (I4): a chunk split inside an escape — `\x1b[3` then `1mred` — → one run, `ansi16` 1, over `red`.
- **T3.4** (I4): a chunk split inside a wide cluster's bytes (UTF-8 `Uint8Array` halves) → one `漢`, not two replacement marks.
- **T3.5** (I7): `scrollback: 0` → `lines.length ≤ rows` always and `dropped` counts everything scrolled out.
- **T3.6** (I12): `write` after `dispose` throws and the message names `dispose`.
- **T3.7** (I12): `snapshot` after `dispose` throws; it does not return the last value.
- **T3.8** (I4): `grid` mode with nothing drawn → `rows` lines, each `text === ""`, no runs.
- **T3.9** (I10): `resize` to the same size → a deep-equal snapshot.
- **T3.10** (I3): 100 `write` calls without awaiting, then `await` the last → the snapshot holds all 100 lines in order.

### Tier 4 — integration

- **T4.1** (with C04, C09): a snapshot inside `scroll({ height: 6, follow: true, children: [terminal] })` renders six rows of the tail at 24-bit with the run's colours as `38;2;…` SGR, and the residue row reads `⋯ N above`.
- **T4.2** (with C09): the same document at 4-bit carries the `rgb` run as `nearestAnsi16`'s index, and at 1-bit carries no colour and keeps `inverse`.
- **T4.3** (with C04): a hand-built `Terminal` whose text carries `\x1b[31m` is refused by `validateDocument` naming the line — the second gate, independent of I2's first.

### Tier 5 — e2e

- **T5.1**: under the devcontainer's `node-pty`, `sh -c 'printf "a\\r\\033[Kb\\n"; printf "\\033[32mok\\033[0m\\n"'` piped into `write` → two lines, `b` and `ok`, the second with an `ansi16` 2 run. Real bytes from a real tty, not a string constant.
- **T5.2**: `sh -c 'seq 1 30'` at `scrollback: 20, rows: 4` → `dropped === 6`, matching T1.6 from a real child.

### Tier 6 — fail-on-revert

- **T6.1** (I2): removing the U+FFFD replacement from the walk → T2.4 fails on the first corpus string carrying a C1.
- **T6.2** (I3): resolving `write`'s promise before the parser callback → T1.1's second snapshot is empty on a slow parse.
- **T6.3** (I5): emitting a run for default-styled cells → T1.2's run count is four, not three.
- **T6.4** (I6): including the wide cluster's filler cell as an empty character → T1.4's no-empty-character assertion fails; `cells(text)` alone would still read 10, which is why T1.4 asserts both.
- **T6.5** (I7): counting `dropped` from `onLineFeed` instead of from scrolls at the cap → T1.6 reads 30, not 6.
- **T6.6** (I4): returning `rows` lines in `lines` mode → T1.1 has six lines for one write.
- **T6.7** (I8): subscribing `onTitleChange` and storing the title on the block → T2.3's deep-equal fails.
- **T6.8** (I12): `snapshot` after `dispose` returning the last value → T3.7 fails.
- **T6.9** (I11): importing `@xterm/headless` from `snapshot.ts` → T2.1 fails.
- **T6.10** (I10): applying the cap before the reflow → T1.7 loses a line when the reflow lands over the cap at `scrollback: 8`.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Spawning the child and giving it a PTY | C21 (`spawnPty`, the injected `PtyFactory`) |
| When a snapshot is taken and patched into the transcript | C23 (one per committed frame) |
| Drawing the block, its cursor, the marker row | C09 |
| Refusing a malformed `Terminal` from any source | C04 |
| Degrading a run's colour down the ladder | C10 |
| Answering terminal queries, forwarding input, the mouse | the attach round (design §7) |
| A parser of our own | Refused — measured against the dependency (design §1) |
