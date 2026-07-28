# C02 — Capability detection

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
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
| `colourDepth` | Checked in order. `TERM` = `dumb` or absent → 1 — a dumb terminal renders no colour whatever `COLORTERM` claims; `COLORTERM` ∈ {`truecolor`, `24bit`} → 24; `TERM` contains `256color` → 8; otherwise → 4 |
| `unicode` | POSIX precedence: take the **first** of `LC_ALL`, `LC_CTYPE`, `LANG` that is set and read only that one — a set `LC_ALL` suppresses the others even when they name a UTF-8 locale. It contains `UTF-8` (case-insensitive, hyphen optional) → `full`; otherwise, and when none is set → `ascii`. `bmp` is reserved and never produced in v1 |
| `synchronisedUpdate` | `TERM_PROGRAM` ∈ {iTerm.app, WezTerm, ghostty, WindowsTerminal} ∥ `TERM` = `xterm-kitty` → true |
| `bracketedPaste` | `TERM` present and ≠ `dumb` |
| `mouse` | `TERM` present and ≠ `dumb`, **and** `TMUX` unset. Disabled inside tmux by default — sequence passthrough is unreliable and keyboard parity means nothing is lost (D34) |
| `imageProtocol` | `TERM_PROGRAM` = iTerm.app → `iterm2`; `TERM` = `xterm-kitty` → `kitty`; otherwise `none`. Detected in v1, unused until Phase 1B |
| `altScreen` | `TERM` present and ≠ `dumb` |

**Which rules the `dumb` gate applies to.** `TERM = dumb` gates every rule derived from `TERM` — `colourDepth`, `bracketedPaste`, `mouse`, `altScreen`. It does **not** gate rules derived from `TERM_PROGRAM` — `synchronisedUpdate` and `imageProtocol` — because those describe the emulator, and `TERM=dumb` is a statement about terminfo. The case that makes this matter is an override of `altScreen: true` under `TERM=dumb` (T1.9): the user has said detection is wrong about their terminal, and iTerm2 supports synchronised update whatever `TERM` claims. Gating it would give them an alt screen that tears.

`unicode` is derived from the locale and is gated by neither.

**Absent `TERM` is treated as `dumb` throughout**, which is why three rows test presence rather than inequality alone. A record that has already concluded the shell cannot open has no business claiming bracketed paste. Absent `TERM` means nothing is known about the terminal, and the safe reading of nothing-known is nothing-supported. It is also what makes T3.1's "a complete record at minimum values" true as written rather than aspirational.

Overrides from `[terminal]` in app config are applied last and win unconditionally. Detection by allowlist will be wrong somewhere, and a dev on an unusual terminal should not wait for a release.

```toml
[terminal]
colour_depth = 24
synchronised_update = false
```

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
| Alternate screen | `altScreen` | **The shell refuses to open**, prints help, exits 0 | L4 |

Alternate screen is the sole hard requirement (D28). A fullscreen application on the primary screen destroys the user's scrollback, which is worse than not running.

**No information is carried by colour alone** (D29). A failed row is `error`-toned *and* carries `✗`. This is a constraint C02 imposes on every renderer, not a theme preference — it is what makes the no-colour fallback lossless.

---

## 5. Invariants

- **I1** — The returned record is immutable and structurally complete. Every field is present; nothing is optional.
- **I2** — Detection is synchronous and never performs I/O. No terminal query, no file read, no await.
- **I3** — `detectCapabilities` is pure: same `env` and `overrides` produce a deeply equal record, always.
- **I4** — A *valid* override wins over detection, unconditionally, including for `altScreen`. A value outside a field's domain is not an override — it is rejected, the detected value stands, and a warning is returned (T3.5).
- **I5** — No component outside C02 reads `TERM`, `COLORTERM`, `TERM_PROGRAM`, `LANG`, `LC_ALL`, `LC_CTYPE` or `TMUX`. Lint-enforced.
- **I6** — Every capability has a fallback owned by a named component (§4). A capability with no fallback cannot be added.
- **I7** — `isUsable` depends on `altScreen` alone. No other capability can prevent the shell opening.
- **I8** — Warnings are returned, never emitted. C02 decides what is wrong, never when the user is told.

---

## 6. Commitments

1. Capabilities are detected once, at startup, from the environment, and are immutable thereafter.
2. Detection is synchronous and never queries the terminal.
3. `env` is injected, not read from `process`.
4. Every field is always present; there is no partial record.
5. Config overrides win unconditionally.
6. Only C02 reads terminal environment variables; lint-enforced.
7. Every capability has a named fallback owner and a test exercising it.
8. Alternate screen is the only capability whose absence prevents the shell opening.
9. No information is carried by colour alone, anywhere in the system.
10. `bmp` unicode and non-`none` image protocols are detected but unused in v1.
11. Warnings about rejected overrides are returned to the caller, never printed.

---

## 7. Tests

Six tiers. No state machine, so no transition table (A02 §7).

### Tier 1 — unit

A table of `env` fixtures. No mocks, no terminal.

- **T1.1**: colour depth — `COLORTERM=truecolor` → 24; `TERM=xterm-256color` → 8; `TERM=xterm` → 4; `TERM=dumb` → 1; empty env → 1.
- **T1.2**: `COLORTERM=24bit` → 24 (the less common spelling).
- **T1.3**: unicode — `LANG=en_GB.UTF-8` → `full`; `LANG=C` → `ascii`; `LC_ALL` overrides `LANG`; `LC_CTYPE` overrides `LANG` but not `LC_ALL`.
- **T1.4**: unicode detection is case-insensitive — `utf-8`, `UTF8`, `UTF-8` all → `full`.
- **T1.5**: synchronised update — each of the four `TERM_PROGRAM` values → true; `TERM=xterm-kitty` → true; `TERM_PROGRAM=Apple_Terminal` → false.
- **T1.6**: mouse — `TERM=xterm` → true; `TERM=dumb` → false; `TERM=xterm` with `TMUX=/tmp/x` → false.
- **T1.7**: image protocol — `TERM_PROGRAM=iTerm.app` → `iterm2`; `TERM=xterm-kitty` → `kitty`; plain xterm → `none`.
- **T1.8**: alt screen — `TERM=xterm` → true; `TERM=dumb` → false; `TERM` unset → false.
- **T1.9** (I4): every field can be overridden, including `altScreen: true` on `TERM=dumb`.
- **T1.10** (I7): `isUsable` is true iff `altScreen`, regardless of every other field being at its worst value.

### Tier 2 — contract / interface

- **T2.1** (I1): the record has exactly the seven documented keys, all present, for every fixture in T1.
- **T2.2** (I1): the record is frozen — mutation attempts do not change it.
- **T2.3** (I3): called twice with the same input, results are deeply equal and not the same reference (no shared mutable state).
- **T2.4** (I2): no async boundary — the function's return value is not a promise, and a fake timer advanced zero ticks still yields a complete record.
- **T2.5** (I5): a source scan over `src/` finds no read of the seven environment variables outside `terminal/capabilities.ts`. This is A03 SS10, executed from the test suite against the same scan definition `make enforce` uses.
- **T2.6** (I6): every capability field appears in the §4 degradation table with a named owner, and the table names no field the record does not have — a bijection over §4's `Field` column, parsed at test time, so both adding a field without a fallback and leaving a stale row behind fail the build. Each row's owner must match the implementation's table for the field it names.
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
