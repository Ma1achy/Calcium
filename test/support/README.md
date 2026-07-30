# test/support — the fakes and harnesses

Shared by every tier. Nothing here is a mock: each is a recording stand-in that
lets a test be a table of inputs and outputs rather than a script of
expectations, which is the same reason C02 takes its `env` by injection.

| File | What it provides |
|---|---|
| `fake-terminal.ts` | `ALL_CAPABILITIES`, `capabilities()`, `fakeStdout()`, `fakeStdin()`, `fakeDebug()`, and `MODES` — the mode numbers by name, so no test pastes an escape literal |
| `fake-scheduler.ts` | `fakeClock()`, `harness()`, `assertSeamNarrow()` for C03's tiers 1–3 |
| `transport.ts` | `fakeRunner()`, `fakeChild()`, `clockOf()`, `invocation()`, `recorded()`, `drain()` for C06's tiers 1–3, and `transportCases()` — the three-transport shared suite I15 asserts. The runner is faked against C21 §2 rather than invented, so a drift from that interface fails here rather than on the day C21 lands |
| `pty.ts` | `runInPty()`, `interactivePty()`, `control()`, `trackDecset()` for tier 5 |
| `process.ts` | `groupMembers()`, `waitForGroupEmpty()`, `openDescriptorCount()`, `run()`, `collect()` and `scripts` — the real-process harness for C21. Nothing here is a fake: C21's value is in its interaction with the OS, and a test that mocks the process has moved to tier 3 without saying so |
| `fixture.mjs` | The program tier 5 runs inside a PTY. Imports `dist/`, not `src/` |

| `world.ts` | `fakeWorld()`, `worldResult()`, `steppableClock()` — a constant `WorldDriver` double for C08's resolver, which is not "the world" for I14's purposes |
| `boundary-conformance.ts` | A01 §6's B1–B8 suite, parameterised over a transport or a corpus |

---

## Every parameter is asserted to take effect

**A helper parameter that shapes the environment under test carries a test that
fails if the parameter is ignored.** Not "the helper works" — that the *option*
reaches the thing it names. `test/unit/support-harness.test.ts` holds the
non-PTY ones and `test/e2e/harness.test.ts` the two PTY runners.

The rule exists because `runInPty` failed it. It accepted an `env` record and
passed `name: "xterm-256color"` to node-pty unconditionally — and `name` *is* the
child's TERM, winning over the env — so `env: { TERM: "dumb" }` was inert.
C02's tier 5 found it by being the first caller ever to pass `env`, long after
the parameter was written. `interactivePty` carried the identical defect and had
no caller passing `env` either, so the fix applied only where it was found would
have left the second one live.

**A helper that silently discards an option is worse than one that lacks it.** A
caller writes a test that reads as covering a case it never ran, and it passes.
That is A03 §2's vacuity class one layer out: those rules are mechanisms that
cannot fail, and this is a mechanism that cannot be *seen* to have worked.

Two things follow for anyone adding a helper here.

- **A default must differ from the value the test asks for.** `fakeStdout({
  columns: 132 })` asserts 132 *and* that the default is 80; otherwise a helper
  ignoring its argument passes.
- **A helper can also be vacuous in its answer, not only in its parameters.**
  `groupMembers` is the case: `ps` exits 1 both for a group with no members and
  for a `ps` that could not run, so reading the status alone returns `[]` from an
  image with no `procps` — and T3.1, whose whole assertion is that a process
  group is empty, passes having seen nothing. It throws on any shape that is not
  clearly one or the other, and a positive control asserts a group *known* to
  hold a process is seen. An observation helper needs the second test; without
  it, every assertion resting on it rests on an unchecked empty.
- **Assert on evidence a failure could not produce.** `child.killed` says a
  signal was sent, not survived, so a test using it to prove a child ignored
  `SIGTERM` passes identically when the child died. `scripts.ignoring` announces
  each caught signal on stdout instead: a line written after delivery cannot come
  from a dead process.
- **A parameter with no observable effect is a finding, not a gap to skip.** It
  may mean the parameter should not exist yet. `measurable({ tick })` is
  observable through exactly one block kind — `steps` with an `active` step is
  the only renderer that reads `ctx.tick` — and a test written against a
  `progress` bar would have passed whatever `tick` did, because a determinate bar
  looks animated and is not.

---

## The fixture's *subject* is asserted to respond

The rule above is about a parameter that never reaches the thing it names. This
is the other half, and it is not the same defect: **the parameter arrived, the
helper honoured it, and the subject it was applied to does not vary with the
thing under test.** Nothing is discarded and nothing is ignored. The fixture is
simply inert with respect to the assertion, and every test built on it passes
without exercising anything.

**Before asserting that X changes when Y changes, assert that the fixture's own
X differs across Y.** That is the `groupMembers` positive control in its general
form — an observation resting on an unchecked empty — moved from the helper's
answer to the helper's subject.

Two instances, both from C14 and both caught by their own tests failing to fail
rather than by review:

- **A `raw` block measures one row at every width.** It is the escape hatch and
  carries its text verbatim, so it never wraps. A resize fixture built from
  `raw` blocks *resized nothing*: heights were identical before and after, the
  viewport correctly reported no change, and the test asserting that a width
  change invalidates and remeasures passed having changed no width that mattered.
  The control is one line — `expect(measureSequence(blocks, 20)).toBeGreaterThan(
  measureSequence(blocks, 200))` — and it fails immediately on `raw`.
- **`table`, `plot` and `patch` are not default kinds.** C11, C12 and C25
  register them, which is what proves C09 §3's extension path — and an
  unregistered kind still *renders*, as `raw`, one row. So a fixture using
  `tableOf` against a bare `measurable()` produces a one-row block whose height
  does not change when a row is expanded, and the test asserting that expansion
  shifts everything below it passes against a table that was never a table.
  `test/support/render.ts` already warns that `definitions` is "the option that
  could have been inert"; this is the same option inert from the caller's side.

**The general form.** A fixture has a subject and the test has a variable. If
the subject does not move when the variable does, the assertion is about
nothing — and it looks exactly like an assertion about something, because the
numbers agree. Write the control first: it is one line, it goes above the
assertion it protects, and it is the difference between "the viewport did not
move the content" and "there was no content that could have moved."

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
