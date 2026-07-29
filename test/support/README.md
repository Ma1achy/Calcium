# test/support — the fakes and harnesses

Shared by every tier. Nothing here is a mock: each is a recording stand-in that
lets a test be a table of inputs and outputs rather than a script of
expectations, which is the same reason C02 takes its `env` by injection.

| File | What it provides |
|---|---|
| `fake-terminal.ts` | `ALL_CAPABILITIES`, `capabilities()`, `fakeStdout()`, `fakeStdin()`, `fakeDebug()`, and `MODES` — the mode numbers by name, so no test pastes an escape literal |
| `fake-scheduler.ts` | `fakeClock()`, `harness()`, `assertSeamNarrow()` for C03's tiers 1–3 |
| `pty.ts` | `runInPty()`, `interactivePty()`, `control()`, `trackDecset()` for tier 5 |
| `fixture.mjs` | The program tier 5 runs inside a PTY. Imports `dist/`, not `src/` |

---

## Two decisions made here that later components inherit

Both were forced by one component and will silently shape every test written
after it. They are recorded here because that is where someone will be standing
when the behaviour surprises them.

### `fakeClock` has turn semantics

One `advance()` is one turn. **A timer armed during an `advance()` waits for the
next call rather than firing within it.**

This matches reality — a real `setTimeout` armed inside a timer callback fires on
a later tick — but a chain of timers will not drain in a single `advance()`, and
a test that expects it to will fail in a way that looks like the component
dropping work.

C03's T3.20 forced it. A render callback that commits on every invocation
re-arms a zero-window timer inside the drain; without the barrier the *fake*
loops forever inside one `advance()`. That is not a hang in the component under
test, and it presents as an out-of-memory rather than as a failed assertion —
which is the worst way to learn about it.

### `interactivePty` exists because timing from inside proves nothing

`runInPty` starts a program and waits for it. C03's T5.2 needs to type while the
program runs, because the only honest input-to-frame latency is measured from
the moment a keystroke enters the PTY to the moment the frame it caused leaves
it. Timing the same thing inside the fixture would measure `commit()` calling
`render()` synchronously — zero by construction, and a passing test that
asserts nothing.

Any later component whose claim is about *latency* rather than about *ordering*
wants this one, for the same reason.
