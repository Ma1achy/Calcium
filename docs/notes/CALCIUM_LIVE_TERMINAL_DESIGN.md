# The live terminal — design, measurements and both walks

**Status: design, 2026-09-06. Not yet spec'd.** The brief is `CALCIUM_LIVE_TERMINAL.md` (the
drop's copy, with the §4 attach correction already in it); the reconciliation against HEAD is
`CALCIUM_NOTE_AUDIT.md` §2, rows A1–A20, and this note builds on those verdicts rather than
re-deriving them. The brief's §9 step 1 — *measure `@xterm/headless`* — is §1 below, and it
settled the brief's §10: **the emulator is a dependency, not a project.** Branch
`feat/plot-arm-unification`, after ink ramps (`45487fab`).

**The arc.** A child process gets a screen of its own, the screen is interpreted into cells, and
the cells are a block in the transcript that measures, windows, degrades, caches and persists like
every other kind. Two halves already exist — `Scroll` is the container (A6, A14) and `pushedView`
is the attach target (A7) — and one is new: the emulator, which is a new L0 component (**C27**)
wrapping the measured dependency. **Round one is the brief's step 3 with steps 4, 5 and 7
folded in**: a live, scrollable, correctly coloured command block, resize, the settle ruling, and
the alt screen because the dependency handles it for nothing. Round two is attach (brief §4, A7–
A10), and it is deferred in §7 with the symbols that expire it.

**One consumer this round, and it is the one the brief did not name.** The shell route — `!cmd`,
`runShell` in `src/shell/execution.ts:614` — drains stdout and stderr to completion and appends
one `raw` block after the child exits (F843). It has no streaming, no cancel (F844), and it is
where every named consumer's *test run, build, training job* actually enters this tree today. Far-
side tools emit NDJSON and are not a consumer; `/tty` handoff (A4) stays what it is.

---

## 1 · Measurements

Each row names the test that would fail if it were false, on the rule that a design measurement
is a claim until a row runs (F838). Rows marked **spec** are written into the spec commit as
`it.todo`; rows marked **here** were run in the devcontainer on 2026-09-06 and their figures are
in the row.

| # | measured | figure | falsifying row |
|---|---|---|---|
| M1 | `@xterm/headless` weight | 6.0.0 · unpacked 1,957,834 B, of which source maps 1,580,638 B; **runtime 182,672 B** (CJS `lib-headless/xterm-headless.js`), 147,278 B ESM · **0 dependencies** · MIT · modified 2026-08-30, a 6.1 beta stream at `-beta.303` | here; `DEPENDENCIES.md` row, SS31 |
| M2 | the buffer API gives cells with attributes | `IBufferCell`: `getChars`, `getWidth` (2 for `漢`, then a `""` cell of width 0), fg/bg with mode — RGB (`isFgRGB`, value `0x0AC81E` for `38;2;10;200;30`), palette (`208` for `38;5;208`), 16-colour (`1` for `31`) — and `isBold/Dim/Italic/Underline/Inverse/Strikethrough/Invisible` | here; C27 T1.1–T1.3 re-run it |
| M3 | the alt-screen signal is an event | `buffer.onBufferChange` fired twice for `?1049h` … `?1049l`, handing the alternate then the normal buffer | here; C27 T1.5 |
| M4 | bell and title are events, not passthrough | `onBell` and `onTitleChange` fired; nothing else observes them, so **not subscribing absorbs both** | here; C27 T2.3 asserts the snapshot after `\x07` and `OSC 0` is unchanged |
| M5 | unknown sequences are dropped | a DCS and `CSI ?9999z` left the next line reading `after` | here; C27 T3.2 |
| M6 | resize reflows | `resize(20, 4)` on 40-column content: 7 lines → 9 | here; C27 T1.7 |
| M7 | modes are readable | `term.modes.mouseTrackingMode === "vt200"` after `?1000h`, `bracketedPasteMode` true after `?2004h` | here; the §7 deferral's symbol |
| M8 | load cost | import 30.8 ms; heap +2,494 KB for the module plus one 40×4 terminal | here; no row — a figure for the dependency record |
| M9 | the ESM entry is broken | `package.json` `module` names `lib/xterm.mjs`, **which the package does not contain**; `import { Terminal }` yields *not a constructor*; only the CJS `main` via default interop works — `import xh from "@xterm/headless"; xh.Terminal` (F841) | here; C27 T2.1 imports through the shipped shape |
| M10 | `node-pty` is not in the product | devDependency 1.1.0, **63 MB installed** with its build tree, prebuilds for darwin and win32 only, **zero importers in `src/`** (`test/support/pty.ts` is the one) — the brief's *already built* is true of the harness (F840) | here; A03 SS32's exception list is unchanged by this arc |
| M11 | `raw` cannot carry a child's bytes | `simple.ts:13` imports `stripControl` and every `raw` line passes through it; `TextSpan` carries `tone` and no literal colour (`types.ts:324–341`) | here; the `Terminal` kind is a type change, not a `raw` with spans |
| M12 | the shell route neither streams nor cancels | `runShell` awaits `drain(stdout)`/`drain(stderr)` then `exited`; `cancelInFlight` is assigned at `:906` and `:1241` (tool routes) and **nowhere between `:614` and `:700`**, so `⌃c` reaches nothing on `!sleep 100` | here for the read; **spec** C23 T3.62 constructs it |
| M13 | one snapshot per committed frame, not per chunk | — | **spec** C23 T1.51: 100 chunks inside one `stream` window → one `replace` |
| M14 | resize is not coalesced beyond C03's window | C03 I15: 16 ms fixed, not configurable; the brief's *coalesce on the frame scheduler's window* was A13's correction | here; no new mechanism |
| M15 | a scroll asks a child for a window | `BlockDefinition.window?` exists (`blocks/types.ts:429`); `logs` windows by line (C09 §4 row, C09 I25) | here; C09 T2.121 asserts `terminal` implements it and renders nothing outside the slice |

---

## 2 · Rulings

**Q1 — the PTY is injected, not depended on.** `node-pty` stays a devDependency. C21 declares a
structural port, `PtyFactory = { spawn(file, args, opts: { cols, rows, cwd, env }) → PtyProcess }`
with `PtyProcess = { onData, write, resize, kill, onExit, pid }` — the five members `node-pty`'s
`IPty` already has, named by our type so no import is needed — and `ProcessRunnerDeps.pty?` takes
one. The consumer that wants a real terminal passes `node-pty` in through `TuiConfig.pty`; one
that does not passes nothing and gets the fallback below. **This is the only ruling under which
R01 R4.4 survives**: a clean clone plus `npm install` on Linux cannot build a native module with
`--ignore-scripts` set (A04 §3), so a runtime `node-pty` would make the whole framework fail to
install for the consumer the requirement is written for. An `optionalDependency` was considered
and refused: it downloads 63 MB to try, and *inject what is unbuilt* is the pattern this tree
already uses for the clock, the environment and the filesystem.

**Q2 — the fallback is pipes into the same emulator.** With no `pty`, the shell route spawns as
today (`spawnShell`, C21 I1) and writes **both** streams into one emulator in arrival order. The
child sees no tty, so it behaves as it does under `| cat` — `pytest` prints plain dots, `npm`
prints no spinner — and its `\r`, `\x1b[K` and SGR still render correctly because the emulator
interprets them regardless. **C21 I3 is unaffected**: the handle's streams are still separate;
merging is the shell's choice about one block, and a terminal is one stream by nature. The
document says which arm it is on: the header's outcome slot is unchanged, and a settled block on
the fallback arm carries no marker — the difference is the child's, not the reader's.

**Q3 — the emulator is C27, in `src/data/emulator/`.** Bytes in, a `Terminal` block out; no
clock, no I/O, no host terminal. It is L0 `data/` on C07's argument — *adapters are pure: fixture
in, document out* — and it imports nothing from `terminal/`, which is what L0's two-halves rule
actually forbids. **The rule is about the host terminal.** A child's screen is a data structure
that happens to be called a terminal, and the one file allowed to import `@xterm/headless` is
`src/data/emulator/emulator.ts` (an MG rule, §8). The component owns the snapshot, the cap
count, the alt-screen flag and resize; it does not own the process (C21) or the patching (C23).

**Q4 — the block carries literal colours, and it is the one kind that may.** *A block names a
palette slot; C10 resolves it* is a rule about the app's colours. A child's `38;2;10;200;30` is
the child's data, as an image's pixels are — and `ColourValue` (`theme/types.ts:174`) already has
the three shapes it needs: `rgb`, `ansi256`, `ansi16`. The block's runs carry `fg?`/`bg?` as
`ColourValue` and C10 degrades them down its ladder: `rgb` → `nearestAnsi256` (exists) at 8-bit →
a new `nearestAnsi16` at 4-bit → dropped at 1-bit, where bold, dim, inverse and underline are
kept. `ansi16` passes straight through at every arm above 1-bit: the child asked for *the
terminal's red*, and the outer terminal's palette is the right answer. **A03's embedded-colour
scan is not weakened**: the emulator writes no hex literal — it formats the cell's integer.

**Q5 — the block's shape is lines of styled runs, not a cell matrix.**

```typescript
export type TerminalRun = Readonly<{
  from: number; to: number;                  // code-unit offsets, `TextSpan`'s convention (C04 I83)
  fg?: ColourValue; bg?: ColourValue;
  bold?: boolean; dim?: boolean; italic?: boolean;
  underline?: boolean; inverse?: boolean; strike?: boolean;
}>;
export type TerminalLine = Readonly<{
  text: string;                              // control-free (I-containment); wide clusters intact
  runs?: readonly TerminalRun[];
}>;
export type Terminal = Readonly<{
  kind: "terminal";
  id: string;
  cols: number;                              // the emulator's width when the snapshot was taken
  screen: "lines" | "grid";                  // normal buffer with scrollback · the alt screen
  lines: readonly TerminalLine[];            // `lines`: scrollback ++ screen · `grid`: exactly `rows`
  cursor?: Readonly<{ line: number; col: number }>;   // present while the child runs
  dropped?: number;                          // lines lost at the cap, when > 0
}> & Gap & Floor;
```

A cell matrix at 80 × 2,000 is 160,000 objects per snapshot; runs are proportional to colour
changes. Trailing default-styled blanks are trimmed; **a blank with a background is kept**,
because `vim`'s `~` rows and a bar chart drawn in reverse video are background. A wide cluster is
one code point sequence in `text` and the filler cell is omitted — `cells()` measures it at 2, so
C09 I5 holds with no width field on the run.

**Q6 — composition: a `scroll` with one `terminal` child.** `scroll({ height, follow: true,
children: [terminal] })`. The offset store, the residue row, `follow`, `collapsed` and the cache
axis are roadmap 46's, inherited unchanged (A6). The `terminal` definition implements `window`
(M15) so the scroll renders only the visible slice of a 2,000-line scrollback. **In `grid` mode
the content height equals the declared height by construction** — `lines.length === rows` — so
the residue row never draws and the offset is meaningless without a rule to say so.

**Q7 — cols and rows.** `cols` is the body's inner width at spawn (the frame's width less
`BODY_INDENT`, handed down from C01 through the shell — nothing here reads the terminal's
width); `rows` is the scroll's declared `height`, default 6 as `ToolCallSpec.output` already
defaults. On a width change the shell calls `pty.resize(cols, rows)` and `emulator.resize(cols,
rows)` in that order, and the emulator reflows (M6). Rows never change: the block's height is
declared (C04 I47) and a child that wants more rows is the attach case (§7).

**Q8 — the child's environment.** `TERM=xterm-256color` and `COLORTERM=truecolor`, set by the
shell route over the injected environment (C21 I14; A03 SS10 is untouched — the route reads no
`process.env`). The values describe **our emulator**, which is xterm-compatible and interprets
24-bit SGR, not the outer terminal: degradation happens at render, and a child told `TERM=dumb`
would strip the colour we can show. On the pipe fallback the same variables are set and mostly
ignored, which is the correct outcome of a child asking `isatty()`.

**Q9 — one snapshot per committed frame.** The route marks the emulator dirty on each chunk and
asks C03 for a `stream` commit; the snapshot is taken **when the frame is composed**, through the
same seam `refresh.readout` uses to re-render a header on a tick, so 100 chunks in a 50 ms
window are one `replace` (M13). A snapshot per chunk would be 2,000 lines × chunks per second
into C13's store, and C03 exists to stop exactly that.

**Q10 — settle.** On exit the route takes a final snapshot with `cursor` removed and settles.
`lines` mode keeps the scrollback ++ screen, windowed by the scroll, at the tail — what the
reader would have scrolled to. `grid` mode keeps the grid: the program left a screen, not a log.
The brief's §6 holds, and the alt-screen flag decides it (M3).

**Q11 — the cap, and where the count is drawn.** The emulator is constructed with `scrollback:
2000`. Lines lost beyond it are counted in C27 (`onLineFeed` minus buffer growth) and travel as
`dropped`. **The count is drawn inside the block as its first line** — `⋯ 12,481 lines dropped at
the cap`, muted, D40's marker shape — and never as the scroll's residue row, because C04 I104 fixes
that row's text to *N above, M below* and a second count there is two mechanisms for two facts
(A16). The scroll's residue counts rows the reader can reach; the block's marker counts rows
nobody can.

**Q12 — the cursor.** While the child runs, `cursor` is present and the renderer draws that cell
`inverse` — the reader sees where the child is, which is the one thing a static log cannot show.
On settle it is gone (Q10). It is **appearance, never geometry**: `measure` does not see it.

**Q13 — bell, title, mouse, unknown.** Bell and title: not subscribed (M4), so absorbed. Mouse
tracking and bracketed paste requests: absorbed into `modes` and nothing forwards them, since no
input reaches the child this round; the block says nothing about it until attach exists (§7).
Unknown sequences: dropped by the emulator (M5). **Containment is an invariant on the block, not
on the emulator**: `TerminalLine.text` contains no C0 or C1 control and `validateDocument`
refuses one that does, so a snapshot from any source — the far side included — cannot carry an
escape to the outer terminal. The renderer therefore does not strip; it trusts the gate.

**Q14 — cancel.** The route registers `cancelInFlight` like the tool routes do (M12). Rung 1
of the ladder sends `SIGINT` to the child's group (C21 I2, `handle.signal`); the card settles as
`cancelled` with the scrollback kept. `⌃c` in the transcript stops everything, unchanged; the
brief's §4b split is the attach round's.

**Q15 — persistence.** A settled `terminal` block persists as any block does. At 2,000 lines of
runs it is bounded by Q11, and that is the whole of the persistence question this round.

---

## 3 · Where each piece lives

| piece | component | file | new or changed |
|---|---|---|---|
| `Terminal`, `TerminalLine`, `TerminalRun`; the validate gate; `TERMINAL_KEYS` | C04 | `src/data/viewmodel/types.ts`, `validate.ts` | new kind |
| `PtyFactory`, `PtyProcess`, `ProcessRunnerDeps.pty`, `spawnPty` | C21 | `src/data/process/types.ts`, `runner.ts` | new port, new method |
| `createEmulator({ cols, rows, scrollback })`: `write`, `resize`, `snapshot`, `screen`, `dropped`, `dispose` | **C27** | `src/data/emulator/emulator.ts`, `types.ts`, `snapshot.ts` | new component |
| `terminalDefinition`: measure = `lines.length` (+1 when `dropped`), `window`, render, `copyTextOf` arm | C09 | `src/presentation/blocks/kinds/terminal.ts`, `defaults.ts`, `containers.ts` | new kind |
| `RAMP_EXTENT.terminal = "none"`, `ANIMATES.terminal = false` | C09 | `blocks/ramp.ts`, `blocks/animation.ts` | table rows |
| `nearestAnsi16`, `degradeColour(value, caps)` | C10 | `src/presentation/theme/colormap.ts`, `resolve.ts` | new helpers |
| `TuiConfig.pty?` | C22 / C24 | `src/shell/types.ts`, `src/index.ts` | public type |
| the route: emulator per entry, dirty → `stream` commit, snapshot on compose, cancel, settle | C23 | `src/shell/execution.ts` (`runShell`), `refresh.ts` | changed route |
| `b.terminal` builder | C22 | `src/shell/builders/index.ts` | MG27 |
| `@xterm/headless` row; the A04 §2 capability table | — | `DEPENDENCIES.md`, `A04` | dependency |

---

## 4 · The classification table — the block at rest

Indexed by rule interaction: each cell is where two rules both hold with no event between them.
A row governed by one rule restates it and is left out. Arms: 24-bit, 8-bit, 4-bit, 1-bit, ASCII.

| state | what the block holds | what the scroll shows | residue / marker | colour arms | interaction |
|---|---|---|---|---|---|
| `lines`, running, 40 lines, height 6 | 40 lines + `cursor` on line 39 | lines 34–39, following | `⋯ 34 above` | as written; cursor `inverse` at every arm including 1-bit | Q6 × Q12: the cursor is inside the window because `follow` keeps the tail and the cursor is on the tail — **a cursor above the window is not drawn and not scrolled to**, C14 I5's rule |
| `lines`, running, reader paged up | same | lines 10–15 | `⋯ 10 above, 24 below` | — | C04 T2/T3: appends do not move the window; the cursor is outside it and invisible until the reader returns to the tail |
| `lines`, settled | 40 lines, no `cursor` | lines 34–39 | `⋯ 34 above` | — | Q10 × C04 I48: the offset is view state and survives the settle; a frozen entry still scrolls |
| `grid`, running (`vim` in 6 rows) | exactly 6 lines, `cursor` | all 6 | **none** — content equals height | `~` rows with a background are kept (Q5) | Q6 × C04 I49: the residue rule has nothing to count; a cell where C04 I49's *cannot fit* and Q6's *equals by construction* meet, and the second wins by arithmetic rather than by a flag |
| `grid`, settled | 6 lines, no cursor | all 6 | none | — | Q10: the last screen, not a log |
| `lines`, capped (12,481 dropped) | 2,000 lines + `dropped` | the tail | scroll: `⋯ 1,994 above` · block line 0: `⋯ 12,481 lines dropped at the cap` | marker muted at every arm | Q11 × C04 I104: **two counts, two mechanisms, two places**; the scroll's residue counts the marker line as content, so *above* reads 1,994 not 1,995 — measure = `lines.length + 1` |
| `lines`, capped, reader at the top | same | marker line + lines 0–4 | `⋯ 1,995 below` | — | the marker is reachable by scrolling and the dropped lines are not, which is the distinction the two counts draw |
| wide cluster at the last column | `漢` written at col 39 of 40 wraps to the next line in the emulator (xterm's rule) | the next line begins `漢` | — | at ASCII the cluster is replaced by C09 I5's substitution, still 2 cells | Q5 × C09 I5: the emulator decides the wrap and the renderer decides the glyph; **neither re-measures the other** |
| pipe fallback, `pytest -q` | dots and a summary, no spinner | the tail | — | `31`/`32` as `ansi16`, straight through above 1-bit | Q2 × Q4: colours arrive only if the child colours a non-tty — `pytest` does not, `--color=yes` does |
| pipe fallback, child requests alt screen | `grid` mode still flips: `?1049h` is bytes, not a tty capability | the grid | none | — | Q2 × M3: the fallback loses input, not interpretation |
| resized narrower mid-run | reflowed lines (M6); `cols` updated | the tail | counts move | — | Q7 × C04 I48: the offset is rows and re-interprets after reflow (C04 §3c trace 4), which is the reason it is rows |
| zero output, child exits 0 | one empty line | one blank row | none | — | Q10 × outcome: the header carries `exit 0`; the body is not omitted, because an entry whose body vanishes on success and appears on failure is two layouts for one grammar (call-grammar rule 1) |
| `rgb` colour at 4-bit | `fg: { kind: "rgb" }` in the run | — | — | `nearestAnsi16` | Q4 × C10's ladder: the value is degraded at render and **the block is unchanged**, so a persisted document replays correctly on a better terminal |
| `inverse` at 1-bit | — | — | — | kept | Q4: attributes survive where colours do not, as C10 I31 already rules for tones |

---

## 5 · The sequence trace — event-mediated

| # | sequence | ruling |
|---|---|---|
| S1 | spawn → first chunk → frame | the entry is appended with the header and an **empty** `terminal` inside the scroll before the child writes; the first chunk marks dirty; the `stream` commit takes one snapshot (Q9). No frame shows a card with no body |
| S2 | `...\r\x1b[K....` in one chunk | one line, overwritten — the emulator's, not ours; the snapshot has one line and the reader sees a progress line that stays put |
| S3 | 100 chunks in one 50 ms window | one `replace` (M13, C23 T1.51). The mutation that patches per chunk fails this row |
| S4 | chunk → `?1049h` → chunk → `?1049l` | `screen` flips to `grid` and back in successive snapshots; the normal buffer's lines are intact after the round trip (xterm restores it), so a `less` that quits leaves the log it was paging |
| S5 | running → exit 0 | final snapshot without `cursor`; `finishCard("exit 0")`-shaped outcome via the existing header; settle. Cancel deregistered |
| S6 | running → exit 1 with stderr | same body — stderr is **in the emulator**, in order, not a second block (Q2); the header carries `exit 1`; `status: "error"` as today |
| S7 | running → `⌃c` | rung 1 → `signal("SIGINT")` → the child exits or does not; on exit the card settles `cancelled`; if the child ignores it the ladder's next rung is C06's escalation, unchanged. **The snapshot at cancel is kept** — a cancelled build's last 2,000 lines are the reason it was cancelled |
| S8 | running → resize → chunk | `pty.resize` then `emulator.resize` then the chunk; the reflow lands in the next snapshot. The reverse order sends the child a SIGWINCH for a size the emulator does not yet have, and the child's repaint lands on the old grid for one frame |
| S9 | running → cap crossed → settle | `dropped` appears in the snapshot after the 2,001st line and grows; the marker line appears with it; settle keeps both |
| S10 | running → the reader scrolls up → chunk | the window does not move (C04 T2); the cursor leaves the window; `follow` re-engages at the tail (C04 T3) |
| S11 | running → `⏎` on the head | `expand` toggles the scroll's `collapsed` (call-grammar collision 2); collapsed, the box draws `⋯ +N more` and the emulator keeps writing behind it; re-expand shows the tail |
| S12 | running → the reader opens a second entry (queue) | entry 33's queue, unchanged: the terminal keeps streaming in its own entry |
| S13 | no `pty` injected → spawn | `spawnShell`; both streams to one emulator (Q2); `TERM` set anyway (Q8); nothing else differs |
| S14 | `pty` injected → spawn fails (`posix_spawnp` ENOENT) | `PtyProcess.onExit` fires with the code; the card settles `failed` with the error in the body as a `status` box — the same shape as a spawn failure today. **No fallback to pipes**: an injected PTY that fails is a configuration error, and silently switching arms hides it |
| S15 | the child writes after exit (a grandchild holding the pty) | the emulator keeps interpreting while the pty is open; the card settled on the parent's exit and **later chunks are dropped**, as C21's exited state ignores writes (C21 §7). A row constructs it with `sh -c 'sleep 1 & echo hi'` |

---

## 6 · Rejection paths — what a throw leaves behind

| refusal | where | what is left |
|---|---|---|
| a `TerminalLine.text` with a C0/C1 control | `validateDocument`, the containment gate (Q13) | the document is refused whole; the transcript is untouched. Fabricated violation: a snapshot with `\x1b[31m` in `text` |
| `to < from`, or `to > text.length` on a run | validate | refused whole — `TextSpan`'s C04 I83 gate, same code |
| `screen: "grid"` with `lines.length ≠ rows` | **not refused** — the block does not carry `rows`; the scroll's height is the producer's. A grid shorter than the box draws short; the walk found no rule that needs a refusal here, and one that reached into the parent would be a cross-block invariant C04 has none of |
| `cols < 1` or non-integer | validate, C04 I47's shape | refused |
| `dropped` present and 0 | validate, C04 I98's convention (declare by presence) | refused: the marker line is drawn on presence, and a present zero would draw `⋯ 0 lines dropped` |
| `emulator.write` after `dispose` | C27 | throws; the route disposes only after settle, so the throw is a programming error and never a runtime path. The row exists so the mutation that removes the guard fails something |
| `spawnPty` with no `pty` injected | C21 | throws naming `TuiConfig.pty`; the route never calls it on that arm (S13). C21 I14's shape: the refusal names the missing injection, not the state it found |

---

## 7 · Deferred, each with the symbol that expires it

| deferred | why not now | the symbol |
|---|---|---|
| attach — a pushed view over the emulator, keys to `PtyProcess.write` | no input path this round; the pushed-view seam is `createDocumentView`, which pushes a `ViewDocument`, and a live emulator view is a second kind of pushed content | `ACTION_KINDS` gaining `"attach"` (A8 — a C04 spec change); `PtyProcess.write` acquiring a caller in `src/shell/` |
| the mouse-tracking notice — *this program wants the mouse; attach to give it one* | the message is about attach; an `Emulator` member nothing reads would be an export nothing consumes | `Emulator` gaining a `modes()` member, with the notice as its first reader |
| terminal queries answered — `CSI c`, `CSI 6 n`, DCS — so a `vim` does not wait a second for its `t_RV` reply | the answer is bytes to the child, and nothing writes to the child this round | the dependency's `onData` acquiring a subscriber in C27 that forwards to `PtyProcess.write` |
| the what-changed line on detach (brief §4a) | no detach | `TranscriptEntry` gaining a timestamp (A9) |
| `⌃c` to the child in the view (brief §4b) | no view | the attach entry |
| a border on the attached block (brief §6b) | no attached state; borderless is the only state | `plotFrame`'s generalisation (A18) |
| far-side tools streaming terminal bytes | far-side tools emit NDJSON; `ToolCallSpec.output` takes blocks | a far-side envelope carrying `kind: "terminal"` — the validator will admit it the day it arrives, which is the reason the containment gate is on the block |
| rows following a taller box, or a child asking for rows | height is declared (C04 I47) | the attach view, where rows are the frame's |

---

## 8 · Build order — spec commits alone, each before its code

**S0** — this note; findings F840–F844; `README_SUBSTRATE_ARC.md` row.

**S1 — C27** `docs/components/C27_terminal_emulator.md`, new: purpose, the port (`createEmulator`),
the snapshot contract (Q5, Q11, Q12, Q13's containment as C27's invariant too), resize order
(S8), the six tiers with M2–M7 as tier-1 rows; `DEPENDENCIES.md` row for `@xterm/headless` with
M1, M8, M9; A04 §2's capability table gains *Terminal emulation (C27)*; `docs/INDEX.md` row;
`COMPONENT_SOURCES.C27` in `tools/enforce/todo-expiry.mjs`; the module-graph rule that
`@xterm/headless` is imported by `src/data/emulator/emulator.ts` alone; `src/data/emulator/`
imports nothing from `terminal/` (L0's rule, MG1's existing check extended by directory).

**S2 — C04 · C09 · C10.** C04 §3h *the `terminal` kind* (Q4, Q5, Q6, Q11, Q13's gate; four
new invariants; `TERMINAL_KEYS`); C09 §4 row, §3 measure and `window` (M15), the marker line, the cursor
(Q12), `copyTextOf` (the text, never the runs), `RAMP_EXTENT`/`ANIMATES` rows (three new invariants); C10
§4i *a child's colours* — the ladder for a literal `ColourValue`, `nearestAnsi16` (one new invariant).

**S3 — C21 · C22 · C23 · C24.** C21 §2 `PtyFactory`, `spawnPty`, two new invariants (the port is
injected; `spawnPty` with none injected throws naming it); C22 `TuiConfig.pty`; C23 §3 the
`shell` route row rewritten — emulator per entry, `stream` commits, one snapshot per frame (Q9,
a new invariant), cancel (Q14, a second), settle (Q10), the pipe arm (Q2), `TERM` (Q8), §8f rows for the three
new states, §8a S1–S15; C24 the public type.

**C1 — C27 code** with M2–M7 as tests and the mutation run `c27-emulator.mjs` (control: the
containment gate stubbed to accept).
**C2 — C04/C09/C10 code**: kind, validate, definition, degrade helpers; goldens at five arms from
a deterministic byte script (A20 — the script is the fixture, and it must be shown to exercise
`\r`, SGR, a wide cluster and the alt screen before a frame from it is asserted).
**C3 — C21/C22/C23 code**: port, method, config, the route. Tier 5: a real `sh -c` under the
devcontainer's `node-pty` on the injected arm and with none on the pipe arm; the same script,
two arms, **read both frames**.
**C4** — frames as pictures at 24-bit, 8-bit, 4-bit, 1-bit, ASCII (`pytest`-shaped script, a
`cargo`-shaped multi-line progress script, a `vim`-shaped alt-screen script); the demo untouched
(docker-tui's `!` route is this route — regenerate per the memory only if the pictures move);
`FINDINGS`/`TRIAGE`; this note's status line; the README row.

**Risk order**: C1 first (everything cites it and it is where the dependency's shape is
learned), the kind second (the validate gate is what makes the containment invariant true), the
route last (the weakest part of the trace — Q9's seam has to be verified against `refresh.ts`
before it is cited, and M13 is the row that does it).
