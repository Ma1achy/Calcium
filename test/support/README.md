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

**Two files left this directory for `src/testing/`** — `measurement-conformance.ts`
and `boundary-conformance.ts`. Both were written here under an explicit
`DESTINATION:` header because C24 §7 exports them to consumers and an export
nothing consumes is forbidden; C24 exists now, so they moved. They were written
runner-free and parameterised for exactly that day, and it cost their import
paths.

**One thing to take from how that went.** A file waiting to move is a file
outside the rules of the place it is going: two `src/`-scoped source scans fired
the moment `measurement-conformance.ts` arrived, on a local width function whose
own comment already said it must be replaced on arrival. The deferred instruction
and the scan that enforces it met on the same commit by luck. If something here
carries a `DESTINATION:` header, the scans at the destination are part of the
move.

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
- **A parameter that is missing and unwanted is recorded, not added.**
  `runInPty` hard-codes 80 × 24 and takes no size option, where `interactivePty`
  takes `cols` and `rows`. The asymmetry is real and no row needs it. Adding the
  option would create the exact thing this file's first rule is about — a
  parameter with no caller, and so no test that it takes effect — so it is written
  down here instead, where the next row that wants it will find it.
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

**A compile-level negative needs the annotation that gives its literal a
contextual type.** The third location of the same class, after the parameter and
the subject: here the inert thing is the type check itself.

```typescript
const layer = { …, content: [reactElement] };          // nothing is checked
const layer: Layer = { …, content: [reactElement] };   // now it is
```

An object literal assigned to an unannotated `const` has no contextual type, so
TypeScript checks nothing about it and the `@ts-expect-error` above the offending
field reports **an unused directive** rather than a caught error. C15's T2.3 was
written this way and asserted nothing about I4 — a test whose entire purpose is
"this does not compile" against a thing that was never compiled against anything.

**The check is that removing the directive produces an error.** `tsc` gives this
one free: an `@ts-expect-error` with nothing to suppress is itself an error
(`TS2578`), so a compile-level negative that has gone vacuous fails the build
rather than passing quietly. It is the only member of this family with a
mechanism, and it is worth using deliberately rather than discovering.

**The general form.** A fixture has a subject and the test has a variable. If
the subject does not move when the variable does, the assertion is about
nothing — and it looks exactly like an assertion about something, because the
numbers agree. Write the control first: it is one line, it goes above the
assertion it protects, and it is the difference between "the viewport did not
move the content" and "there was no content that could have moved."

---

## An exception annotation is a claim, not a suppression

`// cells-ok` and `// graphemes-ok` exempt a line from SS23 and SS40. Neither
means "the scan complained here". Each is an assertion about the expression it
sits on, and it is read as one by the next person to touch the line:

| Mark | What it claims |
|---|---|
| `// cells-ok` | this `.length` is not a display width — a count of rows, palette levels, children, errors |
| `// graphemes-ok` | this operates on a **grapheme array** or a non-text value, where index arithmetic is correct |

The distinction is most of what the annotation is worth. SS23's comment records
why sixteen `cells-ok` marks on colour arithmetic were refused in favour of one
allow-list entry: putting a claim about display width on lines that have nothing
to do with display width teaches the mark to mean "the scan complained", and
after that it silences a real violation without anyone noticing. SS40 is one
careless review from the same place, and it is the newer of the two.

So: if the honest comment would be "I know, but", the line is a violation and
the fix is the remedy the rule's `why` names — `cells()` for a width, a grapheme
index for a position. If the expression genuinely counts something else, the
mark states which, and a reviewer can check it.

This lives beside the fixture rules because both answer the same question —
what a test or a mark is allowed to assert about itself — and because SS40's
annotation is what an author reaches for while writing C17.

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

## The rule covers fakes, not only fixtures

A fixture must be shown to respond to the thing under test before it is asserted
against. **So must a fake**, and the inert class has migrated there.

Twice in one file: `test/unit/execution.test.ts` stubbed `editor: {} as never`
and an action test failed with `setText is not a function` — a finding about the
harness wearing the shape of a finding about actions. The same file's table
fixture was invalid, so `append` threw, the entry id was `undefined`, and every
action read as fired from a frozen entry.

Neither is a subtle failure once seen, and both cost a diagnosis each. A stub
that exists to satisfy a type is a stub that will be called eventually, and
`as never` is the shape that makes the call site look checked.

### The default is the real constructor

**Build a double from the component's own constructor unless there is a reason
you cannot.** Not "write a fake and prove it responds" — that is the fallback,
for the cases where a real collaborator would reach a network, a clock or a
disk. Where the constructor is pure and dependency-free, the object literal is
never the cheaper option; it is the one that fails silently later.

Six doubles in one session satisfied a type and could not do the thing they
stood in for:

| Double | What it could not do |
|---|---|
| `fakeStdin`'s `on` | returned the stream and discarded the callback, so it could never deliver a byte |
| `{ isRaw: false } as ReadStream` × 4 | had no `on` at all; ten tests failed the moment C01 called it |
| `{ setText, text }` editor × 2 | had no `clear`, which C23's submit path gained (C23 I28) |

None was bad luck. **The common factor is that all six were written to satisfy a
signature rather than to stand in for a component** — and a signature is exactly
what a later edit widens. `createEditor()` was available the whole time and takes
no arguments; the literal was easier to type and inert.

Inverting the default is cheaper as well as safer: a real double gains new
methods when its component does, so the failure mode becomes a compile error or
a loud call rather than a stub that quietly answers wrongly.

Where a real one genuinely will not do, the original rule stands: give the fake a
working implementation, or make the harness assert it is unused.

## A tier-4 fake is a tier-4 defect

The fixture rule generalises from an input to a **collaborator**.

**A tier-4 claim is that two components agree.** So a fake on either side tests
that the fake agrees with itself — which is not a weaker version of the claim, it
is a different claim that happens to pass.

`test/support/execution.ts` exists for that reason rather than for thoroughness:
it builds a C23 pipeline with a **real** transcript, a real theme and a real
session store. The unit harness in `test/unit/execution.test.ts` fakes
everything, which is correct — tier 1's claim is about one component, and a real
collaborator there would make a failure ambiguous about which side broke.

The two harnesses are not a duplication to be merged. They encode the difference
between the tiers, and merging them would mean one of the tiers stopped asserting
what it is for.
