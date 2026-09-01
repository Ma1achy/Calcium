# C02 — Capability detection

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L0 terminal |
| **Depends on** | Nothing. Pure function over an environment record |
| **Consumed by** | C01 (what to acquire) · C03 (synchronised update) · C09 C10 C11 C12 (rendering fallbacks) · C17 (bracketed paste) · L4 (refuse-to-open decision) |
| **Source** | A01 D28, D29 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

C02 answers one question once, at startup: what can this terminal actually do? Everything downstream reads the answer rather than probing for itself, which is why a truecolour theme and a 16-colour theme are the same code path with a different resolution table.

**No component may probe the environment independently.** A block renderer checking `process.env.TERM` is the bug this component exists to prevent — it produces a UI that degrades inconsistently, where the table falls back to ASCII but the sparkline does not.

**C02 has no state machine.** It is a pure function producing an immutable record, so the completeness rule in A02 §7 does not apply.

---

## 2. Public interface

```typescript
type TerminalCapabilities = Readonly<{
  colourDepth:        1 | 4 | 8 | 24;
  unicode:            "full" | "bmp" | "ascii";
  ambiguousWidth:     "narrow" | "wide";
  backgroundPolarity: "dark" | "light" | "unknown";
  synchronisedUpdate: boolean;
  bracketedPaste:     boolean;
  mouse:              boolean;
  imageProtocol:      "none" | "iterm2" | "kitty" | "sixel";
  altScreen:          boolean;
}>;

function detectCapabilities(
  env: Readonly<NodeJS.ProcessEnv>,
  overrides?: Partial<TerminalCapabilities>,
): Readonly<{
  capabilities: TerminalCapabilities;
  warnings:     readonly string[];
}>;

function isUsable(caps: TerminalCapabilities): boolean;   // altScreen only
```

`env` is passed in rather than read from `process`. That is what makes every detection rule testable as a table of inputs, and it is the only reason this component needs no mocking framework.

**Warnings are returned, never emitted.** A rejected override (§3, T3.5) produces a warning string; C02 does not print it. Detection runs before the terminal is acquired and before C22 has a diagnostics path, and C22 §8 orders release before printing because that ordering is load-bearing. C22 surfaces the warnings on the restored primary screen along with every other diagnostic.

---

## 3. Detection

Environment-based. **C02 never queries the terminal and never awaits a reply.** Interrogative probes (`DA1`, `XTVERSION`) are more accurate and stall indefinitely on terminals that do not answer — several in common use. A startup hang is a worse failure than a wrong guess that can be overridden.

| Capability | Rule |
|---|---|
| `colourDepth` | Checked in order. `TERM` = `dumb` or absent → 1 — a dumb terminal renders no colour whatever `COLORTERM` claims; `COLORTERM` ∈ {`truecolor`, `24bit`} → 24; **the terminal is identified (below) and `TMUX` is unset → 24**; `TERM` contains `256color` → 8; otherwise → 4 |
| `unicode` | POSIX precedence: take the **first** of `LC_ALL`, `LC_CTYPE`, `LANG` that is set and read only that one — a set `LC_ALL` suppresses the others even when they name a UTF-8 locale. It contains `UTF-8` (case-insensitive, hyphen optional) → `full`; otherwise, and when none is set → `ascii`. `bmp` is reserved and never produced in v1 |
| `synchronisedUpdate` | The terminal is identified (below) → true. Every emulator this file can name implements it |
| `bracketedPaste` | `TERM` present and ≠ `dumb` |
| `mouse` | `TERM` present and ≠ `dumb`, **and** `TMUX` unset. Disabled inside tmux by default — sequence passthrough is unreliable and keyboard parity means nothing is lost (D34) |
| `synchronisedUpdate` | The terminal is identified **and** `TMUX` is unset. Measured: tmux consumes `ESC [ ? 2026 h` and it never reaches the emulator, so the claim was false inside a multiplexer and the frame was written unwrapped regardless (F432) |
| `imageProtocol` | From the identification, and `none` when `TMUX` is set. Measured: tmux consumes an unwrapped APC transmission. The DCS-wrapped form does reach the emulator at tmux's default, which is the fix — in `escapes.ts`, not here (F432) |
| `imageProtocol` | The identification's own column (below): iTerm2 → `iterm2`; kitty and Ghostty → `kitty`; WezTerm and Windows Terminal → `none`, **unmeasured rather than absent**; unidentified → `none` |
| `backgroundPolarity` | `COLORFGBG`'s **last** `;`-separated field: 0–6 or 8 → `dark`; 7 or 9–15 → `light`; absent, non-numeric or outside 0–15 → `unknown`. Not gated by `dumb` — the rule is derived from `COLORFGBG` and not from `TERM` |
| `altScreen` | `TERM` present and ≠ `dumb` |

### One identification, consulted by every capability

**Three capabilities in this file identified the same terminal three different ways.**
`synchronisedUpdate` knew Ghostty by `TERM_PROGRAM`, `imageProtocol` by `TERM` *or* `TERM_PROGRAM`,
and `colourDepth` by neither — and the section below diagnosed exactly that class while fixing one
member of it, which is *a citation reading as coverage*. The remedy is not a third list kept up to
date with the other two. It is that **the question is asked once**:

| terminal | identified by | `imageProtocol` |
|---|---|---|
| kitty | `TERM` = `xterm-kitty` | `kitty` |
| Ghostty | `TERM` = `xterm-ghostty` ∥ `TERM_PROGRAM` = ghostty | `kitty` |
| iTerm2 | `TERM_PROGRAM` = iTerm.app | `iterm2` |
| WezTerm | `TERM_PROGRAM` = WezTerm | `none` — unmeasured, see below |
| Windows Terminal | `TERM_PROGRAM` = WindowsTerminal | `none` |

**`synchronisedUpdate` is true for every row**, and there is no column for it because the table's
membership criterion *is* being an emulator modern enough to name. **`colourDepth` has no column for
the same reason**: every terminal here is 24-bit. A terminal added for which either is false needs
the column before it needs the row, and that is the expiry on both sentences — a column whose value
never varies carries no information and is the first thing to distrust.

**It was not a tidiness problem, and here is the frame it cost.** With `TERM=xterm-ghostty` alone —
which is exactly what `docker exec -e TERM` forwards, and what `ssh` forwards — the three answers
were:

```
                                             imageProtocol   synchronisedUpdate   colourDepth
TERM=xterm-ghostty                           kitty           false                4
TERM=xterm-ghostty  COLORTERM=truecolor      kitty           false                24
TERM=screen-256color  TERM_PROGRAM=ghostty   kitty           true                 8
TERM=xterm-kitty                             kitty           true                 4
```

**One terminal, two detectors, opposite answers**, in the environment this project runs its own demo
in. The image arm worked and the frame tore, every frame, because the two lists were consulted for
one question and only one of them had heard of `xterm-ghostty`.

**Why `colourDepth` consults the identification, which is the row that looks least necessary.** A
real Ghostty sets `COLORTERM=truecolor`, so the third column looks like an artefact of our own
harness stripping it — and it is not. **`ssh` allocates a pty and forwards `TERM`; it does not
forward `COLORTERM`.** A kitty or Ghostty user connecting to a machine that runs a Calcium app gets
24-bit images and 4-bit colour, from one terminal, on the strength of which variable happened to
survive. That is the case that earns the row.

**And identity is gated by `TMUX` where it outranks a direct statement.** `COLORTERM` is the
terminal speaking for itself; a name is us inferring. Inside a multiplexer we are not talking to the
emulator we identified, so the identification does not raise the depth there and the answer stays
what it is today. This is `mouse`'s rule (D34) reaching a second capability, and it is deliberately
**conservative**: outside tmux it fixes the measured defect, and inside it changes nothing.

### The axis none of the three stated, which was the fourth instance — measured and ruled

**Identification is not capability.** *Which emulator is this* and *does a sequence reach it* are
different questions, and for a long time only `mouse` asked the second. `imageProtocol` and
`synchronisedUpdate` were claimed from a name inside `tmux` exactly as outside it, and **nothing in
`src/` wraps an escape in tmux's passthrough form** — greppable, and the reason this was a real
question rather than a stylistic one.

**This section used to say the ruling needed a measurement this repository could not take**, and
that was wrong in an instructive way: it named the unknown as *what unwrapped APC does inside a
given tmux*, and the instrument as one `probe.py` run inside tmux on the same Ghostty. **The
unknown is tmux's, not the emulator's.** tmux's own output is what reaches the emulator, so if the
bytes never leave tmux there is nothing for an emulator to do — and that is measurable with a pty
and no emulator at all (F432).

Measured, tmux 3.5a, `-f /dev/null`, the sequence searched for in tmux's own output:

| | reaches the emulator |
|---|---|
| bare pty · unwrapped APC | **present** — the control, and a probe whose reader cannot see the thing reports every absence as a finding |
| tmux · unwrapped APC | **absent** |
| tmux · DCS-wrapped APC, tmux's default config | **present** |
| tmux · `ESC [ ? 2026 h` | **absent** |
| bare pty · `ESC [ ? 2026 h` | **present** — the second control |

**So both capabilities claimed from the identification are false inside tmux**, and neither is a
near miss: the bytes are consumed. An APC transmission is swallowed and C09 §4c's failure is a
placement addressing an image that never arrived, which draws *nothing*; a `BSU` is swallowed and
the frame is written unwrapped, which the degradation table already accepts.

**Ruled: the identification is gated by `TMUX` once, and every capability derived from it reads the
gated value.** `colourDepth` and `mouse` already asked the second question; `synchronisedUpdate` and
`imageProtocol` now read a `terminal` that is `null` inside a multiplexer, so there is one gate
rather than four sites remembering to apply it.

**And the remedy is a feature with a demonstrated mechanism rather than a hope.** The DCS-wrapped
form reaches the emulator at tmux's default — `allow-passthrough` is `on` in 3.5a, so wrapping
alone is sufficient there and no user setting is required. It belongs to whoever writes the escapes
(`terminal/escapes.ts`), not to detection, and it is what would let `imageProtocol` survive a
multiplexer instead of being switched off in one.

### Ghostty, and how the second list came to be kept up

**`synchronisedUpdate` has named ghostty since v1 and `imageProtocol` never did.** They are
two lists over one subject — *which emulator is this* — and only one was kept up. The
consequence is not a missing nicety: `TERM=xterm-ghostty` fell through to `none`, so **the whole
protocol arm was unreachable on Ghostty** — `transmitImage`, `placementRows`, the placeholder
encoding, every ruling in C09 §4c — and the first terminal it was ever run against drew the
dither instead. That is *a reimplemented rule keeping its birthday clauses*, in a table where
both copies are four lines apart.

**Added on a measurement rather than on a claim.** `tools/terminal-probe/probe.py` sends the
shipped encoder's own transmission to the terminal and reads the reply: Ghostty 1.3.1 answers
`OK` for four PNGs and `EINVAL: invalid data` for a corrupted control, so the protocol is present
and the failure path is distinguishable from the success path. Both `TERM` and `TERM_PROGRAM`
are matched because a `ghostty` inside `tmux` reports `TERM=screen-256color` while
`TERM_PROGRAM` survives.

**WezTerm and Konsole are owed and deliberately not claimed.** Both are widely said to implement
the protocol and **neither has been measured here**, and a false positive is worse than a false
negative: placeholders addressing an image the terminal never received draw *nothing*, which is
C09 §4c's loud failure arriving through a detection table. The expiry is cheap and named — run
`tools/terminal-probe/probe.py` in the terminal and read the verdict — so this is a deferral with
an instrument rather than a deferral with a hope.

**Which rules the `dumb` gate applies to.** `TERM = dumb` gates every rule derived from `TERM` — `colourDepth`, `bracketedPaste`, `mouse`, `altScreen`. It does **not** gate rules derived from `TERM_PROGRAM` — `synchronisedUpdate` and `imageProtocol` — or from `COLORFGBG` — `backgroundPolarity` — because those describe the emulator, and `TERM=dumb` is a statement about terminfo. The case that makes this matter is an override of `altScreen: true` under `TERM=dumb` (T1.9): the user has said detection is wrong about their terminal, and iTerm2 supports synchronised update whatever `TERM` claims. Gating it would give them an alt screen that tears.

`unicode` and `ambiguousWidth` are derived from the locale and are gated by neither.

**Absent `TERM` is treated as `dumb` throughout**, which is why three rows test presence rather than inequality alone. A record that has already concluded the shell cannot open has no business claiming bracketed paste. Absent `TERM` means nothing is known about the terminal, and the safe reading of nothing-known is nothing-supported. It is also what makes T3.1's "a complete record at minimum values" true as written rather than aspirational.

Overrides from `[terminal]` in app config are applied last and win unconditionally. Detection by allowlist will be wrong somewhere, and a dev on an unusual terminal should not wait for a release.

```toml
[terminal]
colour_depth = 24
synchronised_update = false
```

---

### Ambiguous width is detected from the locale and declared over the top

**`East_Asian_Width=Ambiguous` means the terminal decides** — one cell in a Western locale, two
in a CJK one — so it is a property of where a glyph is drawn, which is what a capability is.

**Detected, imperfectly, from the same variable `unicode` already parses.** The convention that
makes ambiguous glyphs wide is an East Asian locale, so a language subtag of `ja`, `zh` or `ko`
gives `wide` and everything else gives `narrow`, under the same POSIX precedence — `LC_ALL`,
then `LC_CTYPE`, then `LANG`, first one *set* winning.

**Detection is what makes the field a fix rather than a way to fix one.** A declared-only field
leaves a CJK user with today's broken measurement until they find the setting, because the
default would be narrow — so the field would ship and change nothing for the people it is for.
Imperfect detection with a declared override is the shape `TERM_PROGRAM` already has, and I4
means the override wins unconditionally.

**Session-constant, and that is what keeps it out of every cache.** The record is built once at
construction and nothing reassigns it (I1); C22's T4.18d already asserts reference identity
across a theme switch and a delivered resize. A verb that toggled this would invalidate every
measured height, every rendered block and C14's whole index — **so the refusal is the ruling and
not an omission**, and it is asserted rather than described.

---

### The background's polarity is read from `COLORFGBG`, and it stops at index 15

**One variable, and it is the only one that carries the fact.** `COLORFGBG` is `fg;bg` — written
by rxvt and urxvt, Konsole and mintty — and the background is **the field after the last `;`**,
because rxvt writes a three-field `fg;default;bg` when one colour is left at the terminal's own.
Taking the last field is right for both shapes; taking the second is right for one of them.

**0–6 and 8 are dark, 7 and 9–15 are light.** The ANSI sixteen split there: 0–6 are the dark half
of the base eight, 7 is light grey, 8 is bright black, and 9–15 are the bright half.

**Anything else is `unknown`, and the boundary is a layer rule rather than a judgement.** A
terminal may write a 256-colour index — `COLORFGBG=15;235` is a real value — and 16–255 *is*
knowable: the cube and the greyscale ramp have defined luminances, and C10 holds them and
validates its floors against them. C10 is L1 and this is L0-terminal, so reaching for them is an
import upward, and writing a second cube here is a second source of truth for that table. Neither
is worth a polarity, so the range where the answer is certain is the range that is answered.

**`unknown` is a third value and not a default.** *No `COLORFGBG`* and *a `COLORFGBG` that says
white* are different facts, and a two-valued field has to pick one of them to mean both. C22 is the
consumer and it acts on a detected polarity and must not act on an absent one (→ C22 I68), so the
distinction is the field's job rather than the reader's.

**Nothing is warned about when it says nothing.** C02 returns warnings for rejected *overrides*
(I8) and for nothing else — an absent `TERM_PROGRAM` does not warn either. A detection rule that
finds nothing has found nothing, and a notice about it would be the framework reporting on the
reader's terminal configuration.

**Inert at `TERM=dumb` rather than gated.** The gate boundary above is the reason it is not gated;
that it changes nothing there is a separate fact and worth stating so the untested combination is
not mistaken for an untaken one — at depth 1 nothing is coloured, and the two themes a polarity
chooses between resolve to the same typographic styles (C10 I26).

---

## 4. Degradation

Every capability has a defined fallback, and each is exercised by a test rather than merely written down.

The `Field` column names the record field each row covers, so this table and the
implementation can be checked against each other exactly rather than by eye
(T2.6). `colourDepth` appears twice — it degrades in two stages — and that is
fine; what cannot happen is a field with no row, or a row for no field.

| Absent | Field | Behaviour | Owner |
|---|---|---|---|
| Truecolour | `colourDepth` | Tones resolve to nearest 256- or 16-colour value; contrast floor preserved | C10 |
| All colour | `colourDepth` | Tone becomes typographic — bold, dim, inverse | C10 |
| Full Unicode | `unicode` | Box drawing → `+ - \|`; sparklines → `.:\|#`; braille plots → coarse block plot; badges lose glyphs | C09 C12 |
| Synchronised update | `synchronisedUpdate` | Frames written unwrapped; tearing possible under heavy repaint, accepted | C03 |
| Bracketed paste | `bracketedPaste` | Multi-line paste detected heuristically by inter-keystroke timing; a notice is committed on first use | C17 |
| Mouse | `mouse` | Every mouse affordance has a keyboard equivalent, so nothing is lost — only convenience | C11 C15 |
| Image protocol | `imageProtocol` | Nothing renders an image in v1, so its absence costs nothing; blocks that would carry one render their text form. Detected now so Phase 1B does not need a second detection pass | C09 |
| Ambiguous width | `ambiguousWidth` | Every `East_Asian_Width=Ambiguous` glyph is measured and drawn as **narrow**, which is the Western convention and today's behaviour; where a locale says otherwise the wide arm is used and the ramps and fills that would double in width are replaced by narrow ones | C09 C12 |
| Background polarity | `backgroundPolarity` | `unknown` keeps the app's own opening theme — the set's first key, or whatever the reader persisted. Nothing is painted differently and no notice is drawn: a terminal that does not say is a terminal the framework does not guess about | C22 |
| Alternate screen | `altScreen` | **The shell refuses to open**, prints help, exits 0 | L4 |

Alternate screen is the sole hard requirement (D28). A fullscreen application on the primary screen destroys the user's scrollback, which is worse than not running.

**No information is carried by colour alone** (D29). A failed row is `error`-toned *and* carries `✗`. This is a constraint C02 imposes on every renderer, not a theme preference — it is what makes the no-colour fallback lossless.

---

## 5. Invariants

- **I1** — The returned record is immutable and structurally complete. Every field is present; nothing is optional.
- **I2** — Detection is synchronous and never performs I/O. No terminal query, no file read, no await.
- **I3** — `detectCapabilities` is pure: same `env` and `overrides` produce a deeply equal record, always.
- **I4** — A *valid* override wins over detection, unconditionally, including for `altScreen`. A value outside a field's domain is not an override — it is rejected, the detected value stands, and a warning is returned (T3.5).
- **I5** — No component outside C02 reads `TERM`, `COLORTERM`, `TERM_PROGRAM`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMUX` or `COLORFGBG`. Lint-enforced — and **the rule is key-agnostic where this list is not**: A03 SS10 matches `process.env` and allows one file, so a variable added here joins the scan by being read rather than by being listed. The list is what a reader checks the code against, which is the only thing that makes its length worth keeping right (F214's class, one document along).
- **I6** — Every capability has a fallback owned by a named component (§4). A capability with no fallback cannot be added.
- **I7** — `isUsable` depends on `altScreen` alone. No other capability can prevent the shell opening. **The predicate had no caller and the rule had two expressions** — C01 asks `!capabilities.altScreen` inline, which is the refusal that reaches the user, so A03 §9's MG25 allow-listed `isUsable` as *a rule expressed twice, the second unreachable*. C22's gate 3b is now that caller (→ C22 I61), which disposes of the duplicate by consuming it rather than by exempting it: C01's inline test stays, because C01 is a component with its own consumers and must refuse whoever hands it an unusable record.
- **I8** — Warnings are returned, never emitted. C02 decides what is wrong, never when the user is told.
- **I9** — **`ambiguousWidth` is detected from the locale, overridable, and constant for the session.** `ja`, `zh` or `ko` as the language subtag of the first *set* variable of `LC_ALL` · `LC_CTYPE` · `LANG` gives `wide`; everything else, including an unset environment, gives `narrow`. **A declared-only field would ship without fixing anything** for the users it exists for, which is why detection is part of the invariant rather than a convenience. **Nothing may change it after construction** — every measured height, every rendered block and C14's index are computed against it, so a mid-session change is a frame that disagrees with the store it was built from (→ C22 I63, T4.18d's argument).

- **I10** — **`backgroundPolarity` is read from `COLORFGBG` alone, answers `unknown` wherever it is not certain, and chooses nothing.** The background is the field after the **last** `;`, which is right for `fg;bg` and for rxvt's `fg;default;bg` alike; 0–6 and 8 are `dark`, 7 and 9–15 are `light`, and everything else — absent, empty, non-numeric, or an index above 15 — is `unknown`. **The third value is the invariant's load-bearing half**: *nothing stated* and *stated light* are different facts, and a two-valued field makes them one, which is exactly the distinction its only consumer branches on. **C02 does not choose a theme**, on commitment 9's shape — a depth is reported and never interpreted, and a polarity is the same kind of fact: what it *means* for which theme opens is C22's, decided against a set C02 cannot see (→ C22 I68).

- **I11** — **The emulator is identified once, no capability matches an emulator name itself, and the identification is gated where the sequence does not reach it.** *Which emulator is this* and *does a sequence reach it* are two questions, and the second is asked **once**, on the identification, rather than by each capability that consults it — `TMUX` set means the value every reader sees is `null`, because inside a multiplexer we are not talking to the emulator we identified. Measured rather than assumed: tmux consumes an unwrapped APC transmission *and* `ESC [ ? 2026 h`, so both capabilities that read a name were false there (F432). One function takes `TERM` and `TERM_PROGRAM` and answers with a terminal or nothing; every rule that depends on *which emulator this is* reads that answer and never re-derives it. **Three rules derived it separately and two of them disagreed** — `TERM=xterm-ghostty` alone gave `imageProtocol: kitty` with `synchronisedUpdate: false`, one terminal answering opposite ways in the environment this project demos in. The invariant is not that the lists agree; it is that **there is one list**, because agreement between three copies is a property nothing checks and single-sourcing is a property a scan can (→ T1.12, T6.11).

---

## 6. Commitments

1. Capabilities are detected once, at startup, from the environment, and are immutable thereafter (I1).
2. Detection is synchronous and never queries the terminal (I2).
3. `env` is injected, not read from `process` (I3).
4. Every field is always present; there is no partial record (I1).
5. Config overrides win unconditionally (I4).
6. Only C02 reads terminal environment variables; lint-enforced (I5).
7. Every capability has a named fallback owner and a test exercising it (I6).
8. Alternate screen is the only capability whose absence prevents the shell opening (I7).
9. `colourDepth` is reported, never interpreted. What a depth *means* for legibility is D29's rule and it is enforced where colour is chosen, not where it is detected — C02 has no view of what any block carries (→ C10 I2, C09 I5).
10. `bmp` unicode and non-`none` image protocols are detected but unused in v1 (I1).
11. Warnings about rejected overrides are returned to the caller, never printed (I8).
12. **`ambiguousWidth` is detected from the locale, overridden by declaration, and constant for the session** — and `cells()` takes it as a parameter rather than reading it, because only L1 measures and L0's data half must not learn about terminals (I9). `cells()` is C09's and takes it as an argument.
13. **`backgroundPolarity` is detected from `COLORFGBG`, is three-valued, and is never acted on here** — the certain range is 0–15 because the range beyond it is C10's table and C10 is a layer up, and *not stated* keeps its own value because the consumer branches on it (I10). What a polarity *means* for which theme opens is decided against a set C02 cannot see (→ C22 I68).
14. **The emulator is identified once, every capability consults that identification, and the identification is gated by `TMUX` before any of them see it** — `synchronisedUpdate` and `imageProtocol` read it, and `colourDepth` reads it too but is outranked by `COLORTERM`, because that variable is the terminal speaking for itself where a name is us inferring (I11). **Identification is not capability**, and the second question — *does a sequence reach it* — is asked in one place rather than by each reader: measured, tmux consumes both an unwrapped APC and `ESC [ ? 2026 h`, and the wrapped form is what survives (§3, FINDINGS F432).

---

## 7. Tests

Six tiers. No state machine, so no transition table (A02 §7).

### Tier 1 — unit

A table of `env` fixtures. No mocks, no terminal.

- **T1.1**: colour depth — `COLORTERM=truecolor` → 24; `TERM=xterm-256color` → 8; `TERM=xterm` → 4; `TERM=dumb` → 1; empty env → 1; **`TERM=xterm-kitty` with no `COLORTERM` → 24**, which is the `ssh` case — a pty is allocated and `TERM` is forwarded where `COLORTERM` is not; **and `TERM=xterm-kitty` with `TMUX=/tmp/x` → 4**, because inside a multiplexer a name is not the terminal speaking for itself.
- **T1.2**: `COLORTERM=24bit` → 24 (the less common spelling).
- **T1.3**: unicode — `LANG=en_GB.UTF-8` → `full`; `LANG=C` → `ascii`; `LC_ALL` overrides `LANG`; `LC_CTYPE` overrides `LANG` but not `LC_ALL`.
- **T1.4**: unicode detection is case-insensitive — `utf-8`, `UTF8`, `UTF-8` all → `full`.
- **T1.5**: synchronised update — each of the four `TERM_PROGRAM` values → true; `TERM=xterm-kitty` → true; **`TERM=xterm-ghostty` alone → true**, which was `false` before the identification was single-sourced and is the row the defect lived in; `TERM_PROGRAM=Apple_Terminal` → false.
- **T1.6**: mouse — `TERM=xterm` → true; `TERM=dumb` → false; `TERM=xterm` with `TMUX=/tmp/x` → false.
- **T1.7**: image protocol — `TERM_PROGRAM=iTerm.app` → `iterm2`; `TERM=xterm-kitty` → `kitty`; `TERM=xterm-ghostty` → `kitty`; `TERM_PROGRAM=ghostty` with a `tmux` `TERM` → `kitty`; plain xterm → `none`; and `TERM_PROGRAM=WezTerm` → `none`, which is the **unmeasured** arm asserted as it stands rather than as it is assumed (FINDINGS F415).
- **T1.12** (I11): **the identification is one function and the capabilities are its readers.** A source scan over `terminal/capabilities.ts` finds every emulator name — `xterm-kitty`, `xterm-ghostty`, `iterm.app`, `ghostty`, `wezterm`, `windowsterminal` — inside the identifying function alone, and none in any `detect*` that answers a capability. **Asserted structurally rather than by comparing the three answers**, because three lists that happen to agree pass an agreement test and still are three lists (F84's shape: the property worth holding is the one a scan can see).
- **T1.8**: alt screen — `TERM=xterm` → true; `TERM=dumb` → false; `TERM` unset → false.
- **T1.9** (I4): every field can be overridden, including `altScreen: true` on `TERM=dumb`.
- **T1.10** (I7): `isUsable` is true iff `altScreen`, regardless of every other field being at its worst value.
- **T1.11** (I10): background polarity — `COLORFGBG=15;0` → `dark`; `0;15` → `light`; `0;default;15` → `light`, which is rxvt's three-field form and the row that decides *last field* against *second field*; `15;default` → `unknown`, because the background is the thing that is not a number; **`0;15x` and `0;15.5` → `unknown`**, which is the digit test rather than a parse and was **added by the mutation pass** — `parseInt` declines `default` and answers `15` for `15x`, so the two rules agree on every value a fixture happened to hold and the sentence naming the difference was in a comment with nothing asserting it; `COLORFGBG` absent → `unknown`; `15;235` → `unknown`, the 256-index case the rule declines rather than guesses at.

### Tier 2 — contract / interface

- **T2.1** (I1): the record has exactly the nine documented keys, all present, for every fixture in T1.
- **T2.2** (I1): the record is frozen — mutation attempts do not change it.
- **T2.3** (I3): called twice with the same input, results are deeply equal and not the same reference (no shared mutable state).
- **T2.4** (I2): no async boundary — the function's return value is not a promise, and a fake timer advanced zero ticks still yields a complete record.
- **T2.5** (I5): a source scan over `src/` finds no read of the environment outside `terminal/capabilities.ts` — of any variable, since SS10's subject is `process.env` and not a name list. This is A03 SS10, executed from the test suite against the same scan definition `make enforce` uses.
- **T2.6** (I6): every capability field appears in the §4 degradation table with a named owner, and the table names no field the record does not have — a bijection over §4's `Field` column, parsed at test time, so both adding a field without a fallback and leaving a stale row behind fail the build. Each row's owner must match the implementation's table for the field it names.
- **T2.8** (I1, I6): **§2's interface block and the record are a bijection too**, parsed at test time from the fenced TypeScript exactly as T2.6 parses §4's table. Separate from T2.6 because the two tables fail separately and one of them already had: `ambiguousWidth` shipped with a §3 subsection, a §4 row, an invariant and a commitment, and §2 declaring seven fields — T2.6 was green throughout, because the bijection it checks is the *other* table (F214). A field added to the record without being declared in §2 fails here.
- **T2.7** (I8): no warning is emitted. Across every T1 fixture and the T3.5 bad-override case, neither `stdout` nor `stderr` is written to; the rejected override appears in the returned `warnings` instead.

### Tier 3 — edge cases

- **T3.1**: entirely empty `env` → a complete record at minimum values, `isUsable` false. No throw.
- **T3.2**: `TERM` set to an unknown value (`foo-bar-256`) → `256color` substring still yields 8. Substring matching is intended.
- **T3.3**: contradictory env — `TERM=dumb` with `COLORTERM=truecolor` → `TERM=dumb` wins for `altScreen` and `mouse`; `colourDepth` is 1. Documents which rule dominates.
- **T3.4**: `overrides` containing an unknown key → ignored, no throw.
- **T3.5**: `overrides` containing an out-of-range value (`colourDepth: 12`) → rejected, detected value retained, a warning naming the field and the offending value returned in `warnings`. A bad config file never produces an invalid record.
- **T3.6**: `TMUX` set but empty string → treated as unset; mouse enabled.
- **T3.7**: `TERM_PROGRAM` with unexpected casing (`iterm.app`) → matched case-insensitively.
- **T3.8**: `LANG` present but `LC_ALL=C` → `ascii`. Precedence, not presence.
- **T3.9**: `env` containing prototype-polluting keys (`__proto__`) → ignored safely.
- **T3.11** (I10): `COLORFGBG` set to each of the sixteen indices as the background → exactly {0…6, 8} are `dark` and {7, 9…15} are `light`. The whole domain, because the split has two discontinuities and a sampled pair cannot tell a wrong boundary from a right one.
- **T3.12** (I10): `TERM=dumb` with `COLORFGBG=0;15` → `light`, `altScreen` false. T3.10's assertion for the other ungated rule, and the same argument: the gate is about terminfo and this variable is not.
- **T3.13** (I10): `COLORFGBG=""` → `unknown`, through `read`'s empty-string rule rather than through a second check — the same path T3.6 asserts for `TMUX`.
- **T3.10**: `TERM=dumb` with `TERM_PROGRAM=iTerm.app` → `synchronisedUpdate` true, `imageProtocol` `iterm2`, `altScreen` false. Asserts the §3 gate boundary as intent rather than oversight: `TERM_PROGRAM` describes the emulator and survives a dumb terminfo, which is what makes an `altScreen: true` override usable.

### Tier 4 — integration

- **T4.1** (with C01): a `TERM=dumb` record drives C01 to acquire nothing beyond what is supported — no mouse, no bracketed paste sequences emitted.
- **T4.2** (with C01): `mouse: false` from a tmux environment → no `1002`/`1006` bytes in acquisition or release.
- **T4.3** (with C10): `colourDepth: 4` → every tone resolves to a distinct 16-colour value with contrast preserved; `colourDepth: 1` → every tone resolves to a typographic style and no colour code is emitted.
- **T4.4** (with C09): `unicode: "ascii"` → a rendered table uses `+ - |` and a sparkline uses `.:|#`; no codepoint above U+007F appears in the output.
- **T4.5** (with C12): `unicode: "ascii"` → the braille plot degrades to a block plot rather than emitting braille codepoints.
- **T4.6** (with C03): `synchronisedUpdate: false` → frames carry no `2026` wrapper.
- **T4.7** (with L4): `altScreen: false` → the shell prints help and exits 0 without acquiring anything.

### Tier 5 — e2e

PTY harness with a controlled environment.

- **T5.1**: launched under `TERM=dumb` → no escape sequence reaches the PTY at all; help text on the primary screen; exit 0.
- **T5.2**: launched under `TERM=xterm` (16-colour) → the frame renders, is readable, and contains no 24-bit colour sequence.
- **T5.3**: launched under `LANG=C` → the frame contains only ASCII; no mojibake, no replacement characters.
- **T5.4**: launched inside tmux → no mouse sequences emitted; keyboard navigation of a table still works end to end.
- **T5.5**: a config override forcing `colour_depth = 24` under `TERM=xterm` → truecolour sequences appear, proving the override reaches the renderer and not just the record.

### Tier 6 — fail-on-revert

- **T6.1** (I2): adding an interactive probe with an await → T2.4 fails.
- **T6.2** (I5): reading `process.env.TERM` from a renderer → the source scan in T2.5 fails, naming the file.
- **T6.3** (I4): making detection win over overrides for any field → T1.9 fails.
- **T6.4** (I6): adding a capability without a §4 fallback row → T2.6 fails at build time.
- **T6.5** (I1): making any field optional → T2.1 fails.
- **T6.6** (D29): rendering a status using colour with no glyph → T4.3's `colourDepth: 1` case loses the distinction and fails.
- **T6.7** (I3): caching detection in module scope so a second call returns a shared reference → T2.3 fails.
- **T6.8** (I10): taking `COLORFGBG`'s **second** field rather than its last → T1.11 fails on the rxvt row alone. Every other row in the suite has two fields, where the two rules agree — so this is the row that exists to disagree with them.
- **T6.9** (I10): collapsing `unknown` into `dark` → T1.11 fails on the absent row, and **C22's T1.20c passes unchanged**. That asymmetry is the row's whole content: the two-valued field is wrong only where nothing is stated, and it is the reader's behaviour there that the third value exists to protect.
- **T6.11** (I11): re-deriving a capability from its own emulator list — `synchronisedUpdate: term === "xterm-kitty" || term === "xterm-ghostty" || […].includes(termProgram)` inline in `detect`, which answers **identically on every fixture in this file** — → **T1.12 fails alone; T1.1, T1.5 and T1.7 all pass.** Measured, and the first mutation written for this row did not have that property: hard-coding `xterm-kitty` into `detectColourDepth` also broke T1.1's tmux row, so it was a *disagreeing* second list and proved nothing about the invariant. **A second list that agrees is invisible to every assertion about answers**, which is the state this file shipped in for the life of the project and the whole content of the row.
- **T6.10** (I1): adding a field to the record without declaring it in §2 → **T2.8 fails and T2.6 does not**, which is the state `ambiguousWidth` shipped in.

---

## 8. Out of scope

| Not here | Where |
|---|---|
| Acquiring anything | C01 |
| The minimum-size threshold (60 × 16) | An app policy, not a terminal capability — L4 |
| Tone → colour resolution | C10 |
| The ASCII glyph substitutions themselves | C09, C12 |
| Interactive capability probes | Phase 1B — an opportunistic 50 ms `XTVERSION` that upgrades the record if it answers and is ignored if it does not |
| Using the image protocol | Phase 1B |
