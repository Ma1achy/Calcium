# B01 — Session lifecycle

| Field | Value |
|---|---|
| **Type** | Behaviour |
| **Components** | C22 (owner) · C01 C02 C03 C13 C20 C21 C23 · S01 S02 |
| **Status** | Draft |

---

## 1. What this is, and is not

A session's arc crosses eight components and two surfaces. Each owns its piece and none owns the whole, which is what a behaviour spec is for.

**It restates nothing.** The frame is S01, the welcome is S02, construction and shutdown are C22 §3 and §8, terminal restoration is C01, identity is C22 §7. An earlier draft of this document described all of them — written before any of them existed — and by the time they did, it was five documents' worth of stale duplication. That is the same drift that removed A02's interface section and dropped B02 entirely.

What survives is the arc and the failure table. The failure table is the reason it survives at all: it is the only place the whole picture exists, and it is what you read when a session misbehaves and you do not yet know which layer is at fault.

---

## 2. The arc

**Before anything is drawn**, three gates run in order: is stdout a TTY, is there a config with a context, is the terminal at least 60 × 16. Each has a different outcome, and only the third defers rather than diverts (C22 §4).

**The graph is built and the terminal is taken**, in an order where three steps are load-bearing and the rest are incidental — stores and runner before the lifecycle, the lifecycle before any acquire, registries sealed before input. Each closes a window in which a crash would leave the terminal broken with nothing registered to fix it.

**The first second is visibly incomplete.** Static chrome and the logo paint immediately; identity, outstanding MRs and recent activity land as they resolve, each independently, each degrading alone. Input is accepted before any of them finish — a dev can type over a half-drawn banner, and does.

**Then it is a shell**, for minutes or hours. Commands append entries, the newest is live, older ones freeze. A `--watch` keeps updating in the scrollback while focus moves on. Identity refreshes every five minutes; the header changes and nothing else does.

**Ending is the part that must not go wrong.** Five triggers, one path: `session.stopping` is set so late submissions are refused, the terminal is released — running `beforeRelease` on the way, which kills children and flushes history — and only then is anything printed, because a stack written onto the alternate screen is discarded the moment the screen is released.

The property that holds across all five: **the terminal is byte-identical to how it was found.**

---

## 3. Sequence

Who owns each beat. A reference, not a restatement — every cell is a pointer.

| Beat | Owner |
|---|---|
| TTY, config and size gates | C22 §4 |
| Capability probe | C02 |
| Registry construction and sealing | C05, C07, C09, C19 |
| Store construction | C13, C14, C15, C17, C20 |
| Lifecycle construction, handler registration | C01 |
| Terminal acquisition | C01 |
| First paint | S01 |
| Banner fetches | S02 |
| Input accepted | C16 |
| Command execution | C23 |
| Identity refresh | C22 §7 |
| Shutdown, all five triggers | C22 §8 |
| Terminal restoration | C01 |

---

## 4. Failure modes

The table that justifies this document. Every row crosses a component boundary.

| Failure | Surfaces at | Outcome |
|---|---|---|
| Not a TTY | Gate 1 | Help printed, exit 0. No escape sequence emitted |
| No config, or no context | Gate 2 | Dispatched to `config init`; the shell opens after |
| Config corrupt | Config load | Notice to stderr, `config init` offered, shell does not open |
| Terminal below 60 × 16 at launch | Gate 3 | Fallback drawn; the graph is still built; a resize continues |
| Shrunk below minimum mid-session | Resize | Fallback replaces the frame; scrollback, history and buffer survive |
| Alternate screen unsupported | Capability probe | Refuses to open, prints help. Nothing overwrites the scrollback |
| Crash between construction and handler registration | ~1 ms window | Nothing acquired yet; clean exit |
| Crash after acquisition | `uncaughtException` | Terminal released, then the stack printed to the real scrollback |
| `SIGKILL` | Untrappable | Terminal corrupt. Documented recovery is `reset`. Unavoidable |
| Platform unreachable at startup | `whoami` | Header `offline`; banner identity degrades; verbs error clearly; system commands still work |
| GitLab unreachable | Outstanding fetch | That row reads `GitLab unreachable`; the runs half still renders |
| A banner fetch never resolves | 3 s timeout | That section shows its failure form; a late result is discarded, not applied |
| Token expires mid-session | Next verb | C23 appends a notice with inline re-login; C22 retains the command for retry. Never auto-logins |
| Home directory read-only | First history write | In-memory history works all session; one warning, not one per command |
| Disk full at shutdown flush | `beforeRelease` | Warning logged; the flush is best-effort and never blocks the release |
| A child process outlives a verb | Shutdown | `killAll` sends `SIGKILL` to every group inside `beforeRelease` |
| A pass-through child holds the terminal at `SIGTERM` | Shutdown | Child killed first, then the terminal released — never the reverse |
| Two sessions writing history | Concurrent flush | Last writer wins; entries can be lost. Documented, not solved |
| Adapter or renderer throws mid-session | Execution | Contained to its block; the session continues (A02 §7) |
| Terminal acquisition itself fails | Startup | The only fatal case in the system. Aborts before first paint |

**Two rows are worth reading together.** A crash *before* handler registration is clean because nothing was acquired; a crash *after* is clean because handlers exist. The window between is roughly a millisecond, and it is why C22's construction order is fixed rather than convenient.

---

## 5. Commitments

1. Three entry gates in order — TTY, config, size — of which only size defers rather than diverts.
2. The banner is visibly incomplete for the first second, and input is accepted throughout.
3. Every banner section degrades independently.
4. Five exit triggers, one path, and the terminal is byte-identical afterwards on all five.
5. Cleanup runs inside `beforeRelease`, so it cannot run twice or be skipped on a signal path.
6. Release precedes diagnostics, so a crash trace lands in the real scrollback.
7. A child holding the terminal is killed before the terminal is released.
8. `SIGKILL` is unrecoverable and documented as such rather than worked around.
9. Only a failed terminal acquisition is fatal; every other failure degrades.
10. This document restates no other. §3 is pointers; §4 is the only content it owns.

---

## 6. Tests

Behaviour is proven at integration and e2e scope; unit-level assertions belong to the components (A02 §7 — behaviour cross-cuts scope rather than forming a tier of its own).

### Integration

- **B1.1**: each of the three gates, passed and failed — six paths, asserted on an event log.
- **B1.2**: construction order — stores and runner before lifecycle, lifecycle before acquire, registries sealed before input.
- **B1.3**: each of the five exit triggers runs the same shutdown function, asserted by identity.
- **B1.4**: `beforeRelease` runs exactly once per session, on every trigger.
- **B1.5**: every row of §4 that can be simulated with fakes — sixteen of the twenty.

### End-to-end

PTY harness.

- **B1.6**: for all five exit triggers, the terminal matches a control run of `true` on termios flags, DECSET modes, active buffer and scroll region.
- **B1.7**: a crash mid-session leaves its stack readable in the primary-screen scrollback.
- **B1.8**: launch, type over a still-loading banner, submit, exit — the keystrokes land and the banner still completes.
- **B1.9**: launch offline → degraded banner, working system commands, clear verb errors.
- **B1.10**: launch at 44 × 12, resize to 120 × 40, use the session, resize back → fallback, working, fallback, state intact throughout.
- **B1.11**: exit with two children and a pass-through child running → all reaped, terminal restored, nothing orphaned.
- **B1.12**: fifty launch/exit cycles → no descriptor leak, no handler leak, terminal clean each time.

### Fail-on-revert

- **B1.13**: reordering construction so acquisition precedes handler registration → B1.2 fails.
- **B1.14**: printing before releasing → B1.7 fails and crash traces vanish.
- **B1.15**: releasing the terminal before killing a pass-through child → B1.11 fails.
- **B1.16**: a second shutdown path → B1.3 fails.

---

## 7. Out of scope

| Not here | Where |
|---|---|
| The frame's regions and chrome | S01 |
| The welcome's sections and fetches | S02 |
| Construction order, session state, shutdown steps | C22 |
| Terminal state and restoration | C01 |
| Capability degradation | C02 |
| Command execution | C23 |
| The drill chain | B03 |
| Degradation as a cross-cutting behaviour | B04 |
