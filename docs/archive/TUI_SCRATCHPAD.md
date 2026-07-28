# Prism TUI — design scratchpad

| | |
|---|---|
| **Status** | **Superseded.** Retained as the reasoning archive. The decisions here are settled and live in A01's register; the specs derived from them are written. Where this and a spec disagree, the spec wins. |
| **Date** | 28 July 2026 |
| **Purpose** | Where the design was worked out. Kept because the *reasoning* behind several decisions is here and nowhere else — A01 records what was decided, this records why the alternatives were rejected. |
| **Scope rule** | Only things that affect **what gets built in the standalone package**. Anything that resolves to "and then Python needs to change" is one line in the boundary contract, not a problem we solve now. |

---

## 1. Settled

Each with the one-line reason, so any of them can be challenged on its reasoning rather than re-argued from scratch.

### Presentation model

| # | Decision | Why |
|---|---|---|
| S1 | Fullscreen alternate-screen app with an application-owned viewport | `dashboard` already needs alt-screen; Ink's append mode degrades past a few hundred lines; overlays (Ctrl-R, completion, modals) have nowhere to live on the primary screen |
| S2 | Cost accepted: we lose native scrollback and native text selection, and must implement both | Direct consequence of S1. Owned by the viewport journey |

### Runtime split

| # | Decision | Why |
|---|---|---|
| S3 | Python owns all verb logic. The TUI is presentation and input only | `j09`–`j21` already put it there; two implementations of `ps` is the failure mode |
| S4 | TUI owns a canonical view model; verbs' JSON is an input to it, not the contract | Lets the TUI be built against a stable shape while Python's envelopes are whatever they currently are |
| S5 | Per-verb adapters translate envelope → view model. Pure functions, fixture-tested, **disposable** | An adapter exists to absorb a gap. As Python converges it shrinks; deleting one is a success |
| S6 | A fallback adapter renders any JSON legibly | Without it, every new Python verb is blocked on TypeScript and "parallel" is a lie |

### The boundary

| # | Decision | Why |
|---|---|---|
| S7 | **argv in, JSON envelope out.** JSON travels one direction only | The command shown to the dev is the command actually run — history, replay, copy-to-bash all work with no translation layer |
| S8 | The TUI holds typed args internally and validates before spawning | Structure is local, argv is the wire. Schema validation without JSON on the wire |
| S9 | Spawn with an argv **array**, never a shell string | No quoting, no word splitting, no injection. The shell is never in the loop — this is what defuses the escaping argument for JSON-in |
| S10 | Transport is subprocess. Not a daemon, not FFI, not HTTP | Process isolation and exact bash parity, for 200–400 ms interpreter startup. A verb that segfaults kills a subprocess, not the session |

### What we assume on the far side of the boundary

Not our build. These are the assumptions the conformance suite asserts at wiring time — if they do not hold, the suite says which tool is wrong. Nothing here is work we do now.

| # | Assumption | Why |
|---|---|---|
| S11 | One core operation per verb, two front doors: human text and JSON envelope | The envelope is the contract, not a side output |
| S12 | Same code path both ways — the doors differ only in rendering | Two paths that must agree is the thing that drifts |

### Command surface

| # | Decision | Why |
|---|---|---|
| S13 | **`/` prefix required** for Prism commands — `/ps`, `/promote`, `/serving ps` | Kills the Unix `ps` collision permanently; Prism can add `/find`, `/top`, `/make` forever without shadowing |
| S14 | The `!` escape is **dropped** | It existed only to escape the collision S13 makes impossible |
| S15 | Bare text is a system command by default | The thing that looks like a shell command is one |
| S16 | Prism verbs and meta-commands share one flat `/` namespace | Shell-vs-platform was an implementation detail leaking into the interface |
| S17 | Token containing a slash after position 0 is a path, not a verb | Handles `/usr/bin/ls`. Prism verbs never contain slashes |
| S18 | Displayed form is `/verb`; spawned argv is `["prism", "verb", …]`; copy-out yanks the `prism`-prefixed form | Recovers the bash-reproducibility that S13 dents. One-token mapping |
| S19 | Tab after `/` completes the manifest; Tab on bare text completes PATH + filesystem | Cleaner than making one Tab guess which namespace it is in |

### Self-containment

| # | Decision | Why |
|---|---|---|
| S20 | Transport is an **interface** with two implementations | The package builds, runs and demos standalone with no Python, no cluster, no config |
| S21 | `FixtureTransport` serves an in-memory world; `SubprocessTransport` spawns Python; selected by env var | Wiring step becomes "flip the default" |
| S22 | The fixture world seeds from the HTML mockup's `STATE` + generators + background tick | Already written. Translation, not new work |
| S23 | The package ships a **conformance suite** — argv invocations and expected envelope shapes per tool | Turns "minimal wiring" from a hope into pass/fail. Same fixtures the standalone build uses |
| S24 | The integration contract is written down: host assumptions, exports, what must be true for subprocess transport | Otherwise "minimal wiring" is discovered rather than specified |

---

### Resolved from the open list

| # | Decision | Why |
|---|---|---|
| S25 | The TUI defines the **manifest schema** and ships a hand-written manifest as a fixture. Whether Python generates it later is a wiring-time question | In standalone mode there is no Python to generate it. The expensive half was never ours |
| S26 | The manifest is a **section in the transport journey**, not a journey of its own | Holds the set at 15. Completion reads it; transport owns the boundary it describes |
| S27 | Block caps: **10,000 per document, 100,000 per session**, FIFO eviction with a marker block recording what was dropped | Accepted as proposed |
| S28 | The compositor journey is written **after** M-T2, from measured numbers | It opens with a decision gate; inventing the baseline defeats the gate |
| S29 | **Mouse on by default.** `/mouse` toggles off | Click-to-fill and wheel scroll are worth it |
| S30 | Consequence of S29: **copy mode is mandatory** in the viewport journey, not optional. Shift-drag is documented as the native-selection bypass (xterm, iTerm2, GNOME Terminal, Windows Terminal) | S29 takes the terminal's own selection, which is how devs copy UUIDs today |

---

## 2. Open

### O1 — The decomposition *(soft-confirmed — "probably")*

15 journeys, five tiers:

```
tier 0  substrate     terminal substrate · view model + transport (+ manifest)
tier 1  frame         shell session · viewport · block library · themes
tier 2  interaction   input/editor · command pipeline · completion · history
tier 3  richness      interactive results · live views · pass-through
tier 4  composite     dashboard
tier 5  gated         compositor — written after M-T2 (S28)
```

Remaining sub-question: does **pass-through** survive as its own journey now that S15 makes bare text the default case rather than the exception. It may be thin enough to fold into the command pipeline.

---

## 3. Rejected — do not re-litigate without new information

| Rejected | Why |
|---|---|
| JSON args in as well as out | The command shown to the dev would differ from the command sent; history, replay and copy-to-bash each need separate machinery to fake |
| Scrollback-append model (`j22` as written) | See S1 |
| Daemon or persistent Python process | Lifecycle, socket, version skew, and a new way for the session to break |
| FFI binding | Couples Node to a Python ABI across three platforms |
| Per-verb renderers reaching for Ink directly | Every renderer independently reimplements the height contract and the tone discipline; nothing enforces either |
| Adapters shipping from Python | Puts presentation decisions where the TUI cannot iterate on them. They stay in TypeScript even when thin |
| `!` escape | S14 |
| Optional `/` prefix | Ambiguity returns, and with it the collision class |

---

## 4. Already drafted — treat as provisional

Three journeys were written before the decomposition was reviewed. **Not signed off.** They stand or fall with O2.

| File | State |
|---|---|
| `JOURNEY_T01_shell_session.md` | Needs S13/S14 patches — footer hint loses `!`, welcome's last line changes |
| `JOURNEY_T02_terminal_substrate.md` | Unaffected by anything since |
| `JOURNEY_T03_view_model_and_transport.md` | Needs S20–S24 (transport interface, integration contract) and possibly O1 |

Mockup detail not yet captured anywhere, and where it is destined to land: table shapes, badges, kv grids, log/event column grids, braille plots, sparklines, step progression, pipeline rows, diff tables, timing readout → **block library**. Palettes and both themes → **themes**. `data-fill`/`exec`/`href`/`expand`, pills, expandable rows, sort indicators, fill-flash → **interactive results**. Completion menu, reverse-i-search → **completion**. Dashboard cells and panel grid → **dashboard**.

The block library carries most of the "does it actually look right" risk and is the largest single chunk of the mockup.

---

## 5. Parking lot

- Warm subprocess pool to kill interpreter startup — measure first; do not build speculatively
- Terminal image protocols for real plots — detected in v1, unused
- Concurrent verb execution — one at a time for now; `$_` has no meaning if two commands return UUIDs
- Session persistence across restarts
- Multi-cluster sessions
- Agent-facing door: JSON args → serialise to argv → same operation. Additive; the argv boundary does not block it
