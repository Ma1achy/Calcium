# Verifying docker-tui

Three instruments and three rules. Every one of them exists because reading a result
wrongly cost more than getting the code wrong, and each names the occasion.

---

## Which container

Two, since A04 §4 stopped saying *one per repo*. Both mount the repository root at
`/workspaces/tui-kit`, so the paths below are the same in either — **what differs is
what is installed**, and the framework's has no docker socket by design.

| target | container | why |
|---|---|---|
| `make all` · `make enforce` · `make proof` | `calcium` | the framework's suite, including tier 5's PTY rows; needs `node-pty`, needs no daemon |
| the app's `npm test` | either | it runs against `test/corpus/`, which is why CI can run it without docker |
| `make fixtures` · `docker-tui` · `tools/capture.py` | `docker-tui` | the socket is only here |

**And the load is not only other containers — it is vitest's own parallelism.**
Measured in step 12: `npx vitest run --dir test` reported 5, then 7, then 8 failures on
three consecutive runs of identical code, **with a completely different set each time** and
never including anything the change had touched. Every one of those files passed when run
alone. The same tree with `--no-file-parallelism` reported **one** failure — **C03** `T5.6`
(*sixty seconds idle*), which measures wall-clock CPU and is a statement about the host; see
§0's sixth entry and the id-ambiguity note beside it.

So a rotating failure set is a diagnosis, not a mystery: when the failures differ run to
run and the union is the timing-sensitive files, the answer is contention. Re-run serially
before reading anything into it. It costs about four times the wall clock and it is the
difference between a report and a guess.

**A frame-read and a timing tier must not share a container run.** `make fixtures` brings
up a load container so the CPU plot has a shape to draw, and a busy container made tier 5's
`T5.3a` fail during step 4 — it passed alone, and `make all` went green once it was removed.
`make fixtures-down` first, then the suite. §7 below carries the full account.

---

## 0. An exit code read through a pipe is the pipe's

```sh
make all 2>&1 | tail -15; echo $?      # ← reports tail's status. NEVER.
```

```sh
make all > /tmp/makeall.log 2>&1; echo "MAKE_EXIT=$?"; tail -6 /tmp/makeall.log
```

**This produced two false reports in two steps.** Step 1 was declared green on the first
form while **44 of 101 tier-5 rows were failing** — the F7 fix made `createTui` parse both
manifest arms, and `test/support/fixture.mjs` still handed it an already-parsed `Manifest`,
which C05 §3 correctly refuses (F19). PR #14 merged on that report. In step 2 the same
construction was used again, and when the failures surfaced they were first blamed on
machine contention rather than on the report that had hidden them.

It has a second cost that is easy to miss: **with `| tail`, nothing reaches the output file
until the whole run ends**, so a hung suite and a slow one look identical. Twenty-five
minutes were spent watching an empty file before anyone checked `ps`.

The Makefile now sets `SHELL := bash` and `.SHELLFLAGS := -o pipefail -c`, which guards
pipelines *inside* recipes. It cannot guard the invocation, which is where the mistake
lives. **Redirect, read the code, then read the file — and when reporting a suite as
passing, quote the exit code and name the command that produced it.**

---

### The same class, three times in one session

The pipe is one instance of something more general: **a result read through a channel that
cannot express it.** All three passed as green.

| what was read | what it actually reported |
|---|---|
| `make all \| tail; echo $?` | `tail`'s exit status. Two false green reports, one merged |
| `@ts-expect-error` on `graph.manifest.manifest` | an error from the field being `Manifest \| null`, not from the type under test — so the row passed identically against the broken type |
| `results.every((r) => r.caught)` in a mutation runner | `undefined` on every result, because the harness sets `killed`. Exit 1 unconditionally, so a clean pass and a survivor were the same number |

None of the three is a hard problem. Each was invisible because the channel returned a
plausible value rather than an error, and each was found by **making the thing under test
wrong on purpose and watching the report not change**. That is the mutation pass applied to
the instrument instead of to the code, and it is the only method that has worked on any of
them.

### A fifth, and it is the shape none of the four has: a gate nobody reports

The four above are results read through a channel that garbles them. This one has no channel
at all.

**`make all` runs six targets. `make enforce` and `npm test` are the two run by habit, and the
pre-commit hook runs the first.** So `golden` and `e2e` are reported by nothing between
commits, and a target that starts failing is indistinguishable from one nobody has run.

Measured at `7241627`, before a session's work began:

| target | at session start |
|---|---|
| `check` · `enforce` · `audit` · `test` | pass |
| `golden` | **18 failed / 41 passed** — stale since row 4, four commits back |
| `e2e` | **44 failed / 50 passed / 7 todo**, 13 of 16 files |

**Neither was noticed, and neither was hidden.** No pipe swallowed an exit code and no
assertion returned a plausible value: nothing asked. The green that was quoted in four commit
messages was `enforce` and `npm test`, both true, and both silent about two thirds of what
`make all` covers.

**The remedy is not another rule.** It is to run `make all` and report the counters per
target — before, so the baseline is known, and after, so a delta is attributable. A verdict
without a verified baseline is a verdict about the harness.

**And the golden failure is the shape to expect after a narrowing.** Sixteen were stale
snapshots; two were assertions aimed at a value that *stopped being a document* when
`AdapterMeta` narrowed to the three keys an adapter owns. **A narrowing's blast radius is
every test that asserted the old shape, and the ones that fail are in whichever tier nobody
runs.**

### A fourth, and it is a different class: two instruments that disagreed

The three above are one instrument giving a wrong answer. This one is **two instruments
giving different answers, with only one of them consulted.**

`main`'s CI failed on **five consecutive merges** — #12, #13, #14, #15, #16 — while every
local `make all` on the same commits reported green, and each of those merges was made on
the strength of the local run. The failures were real tier-5 rows, not infrastructure:
C03's frame-rate, latency and idle-CPU thresholds on the first three, and C18 T5.5 on the
last two.

**The local suite is not the authority and had been treated as one.** Nothing in the
process compared the two, so a red `main` accumulated for five merges without anyone
holding a wrong belief — the question was never asked.

C18 T5.5 is the instructive half, because it is not a threshold that a shared runner
misses. It fails in CI and passes locally **deterministically**, for a reason neither
environment can see alone: the far side prints its `cwd=`, the notice wraps at a position
that depends on that string's length, and `/workspaces/tui-kit` and
`/home/runner/work/Calcium/Calcium` differ by fourteen characters. A test that is a
function of its environment's path length passes and fails for reasons no assertion
mentions.

**The rule this adds: after a merge, read CI's result, not the local one.** They are two
instruments, they disagree, and the one that gates nothing is the one that had been
believed.

### A sixth: the comparison's precondition was never stated

The remedy above — **run `make all` and report the counters per target, before and after** —
is the protocol every row in `CALCIUM_FIX_PLAN.md` closes against. **It is a check only on an
otherwise idle machine, and nothing said so.**

Tier 5 came back **45** against a baseline of **44**, with C03's `T5.6` (frame-scheduler's —
*sixty seconds idle*) the row that moved. It asserts a fraction of **wall-clock CPU**, so it
measures the host. An unrelated training job held the machine; idle, it is five for five
green and the suite is 44 with a failing row set *identical* to the baseline's.

**Compare the row set, not the count.** Two runs at 44 with different rows failing is not the
same result, and only the set says so. `comm` over the sorted `×` lines costs nothing.

**And the diagnostic error is worth more than the rule.** I attributed the move to a mutation
pass I *had* been running concurrently, removed it, re-measured, found the number **worse**,
and concluded contention was excluded. It was excluded as *my* contention. **Eliminating a
cause you control is not eliminating the cause, and quieter-yet-worse means the load is
somewhere you have not looked.**

The tell was in the first run's output: `writes === 0` passed while `cpuFraction < 0.01`
failed. **One of a pair failing while the other passes is a discriminator** — the behavioural
half said the frame path was silent, so the resource half could only be measuring the host.

**None of this was unknown.** `test/e2e/frame-scheduler.test.ts` opens with *"This file
measures wall-clock and must not share the machine"*, and the preamble above already says a
rotating failure set is contention. **The gap was a reader, not a record** — which is the
inverse of *ask where a claim was written down*, and wants the same question asked earlier:
before filing a finding, ask where this would already be written. FINDINGS F139.

### The failing set moves under load, and that is the discriminator

> **Most of this section was already written, in `test/support/budget.ts`**, and it was filed
> here as new. That file's header says it in one sentence — *"Three consecutive full runs each
> timed out a different subset of them, and every one passed on its own — which is worse than a
> slow suite"* — and goes on to give the per-file measured worst times, the 5× ratio the budget
> was sized at, and a standing instruction not to raise the numbers without re-measuring.
>
> **This is F139's own shape, a second time in one session.** F139 exists because the rule was
> in `frame-scheduler.test.ts`'s header and a finding was filed re-deriving it wrongly. The
> same thing happened again, on the same subject, four hours later — which says the instrument
> *ask where this would already be written* wants pointing at the **test support directory**
> specifically, because that is where a measurement's reason gets written and it is not a place
> a reader looks for a protocol.
>
> What survives as new is narrower and is kept below: the **composition** test, the **start and
> end** load readings, and why a *changed* set is more misleading than an identical one.

Two more instances since, and together they sharpen *compare the row set* into something that
identifies the cause rather than merely detecting a difference.

| run | load avg | failing set |
|---|---|---|
| baseline | quiet | — |
| after F8 | 20.81 | C17 T3.15 (a paste budget) |
| after F31 | 14.57 | C01 T2.9, C21 T2.7, C10 T2.8, C10 T2.9 (four source scans) |
| quiet re-run | 4.91 | — |

**A defect picks the same row every time. Contention picks a different one.** The F8 run and
the F31 run share no failing row, and neither set overlaps the other's subject — a paste
budget in C17 and four structural scans across C01, C10 and C21 have nothing in common except
a clock. That is a stronger signal than the count and stronger than the set alone, and it is
available at zero cost the moment two loaded runs exist.

**The second instance also names the mechanism, which the first did not.** All four rows
failed with *"Test timed out in 15000ms"* rather than an assertion — and the passing rows
beside them read **10.9 s, 12.9 s, 18.4 s and 22.5 s** for work that takes about a second
quiet. They are source scans over the whole tree, so they are I/O and CPU against a fixed
per-row timeout: a class that converts host load directly into failure with no assertion
involved. Worth knowing which rows those are, because *timed out* and *wrong answer* are the
same red tick in a summary.

**Gate the start and read the end, because the load moves during the run.** A third loaded
run began at **6.43** — under the threshold a waiter had been set to — and finished at
**33.98**, with **16** failures. Gating on the load at launch is not enough for a run that
takes minutes; the reading that invalidates the result is the one taken *after* it, and it
costs one command.

**That third set also settles the class without a re-run.** Fifteen of the sixteen were *Test
timed out* — thirteen at 15 s, one at 5 s, one at 20 s — and the sixteenth was the paste
budget. **Zero assertion failures.** A change that broke something produces at least one
assertion; a machine that ran out of time produces only deadlines. So the composition of the
set answers the question the set's identity only hints at, and it is readable from the summary
without running anything again.

**And each was diagnosed wrongly first.** F8's run was attributed to a graph leak these rows
had themselves introduced — a mechanism in hand is the most expensive kind of coincidence,
because it supplies the explanation before the measurement does. The check that settled both
costs one command: **run the failing rows alone.** C17 T3.15 passed 3/3; these four passed
40/40.

### Test ids are not unique across components

`T5.6` names **six** different tier-5 rows — C03's idle CPU, C06's standalone build, C18's
trailing `&`, C20's corrupt file, C22's piped shell, and history's corrupt file. This document
cites `T5.6` bare in two places meaning two different rows. **Always qualify: `C03 T5.6`.**

---

## 1. `tools/screen.py` — a stripped capture is not a frame

A terminal application redraws by moving the cursor and overwriting, so stripping escape
sequences concatenates every frame it ever drew and a redraw becomes indistinguishable
from nothing happening. `screen.py` replays a capture into a grid and prints the result.

```sh
python3 tools/screen.py /tmp/dash.raw 120 40
```

**Read the whole screen.** The transcript sits at the bottom of the window: at 120×40 the
dashboard occupies rows 24–39, and `| head -20` shows the chrome and nothing else. Both
`/ps` and `/dashboard` were diagnosed as rendering nothing on exactly that basis, and the
hour that followed went through the emulator, the paste window and local routing before
anyone printed the whole grid. Use `grep -n "."`.

**Replay prefixes to see change.** One frame cannot show that a line is stale. Rendering
the same capture at 70%, 85% and 100% is how F16 was found — the counts and totals were the
one line that never moved while every row beneath them ticked.

---

## 2. `tools/capture.py` — type and press Enter separately

```sh
python3 tools/capture.py <cols> <rows> <out.raw> "/dashboard" <hold-seconds>
```

- **Text and Enter go two seconds apart.** Bytes arriving together fall inside C16's paste
  window, where a carriage return inserts rather than submits. `printf "/ps\r"` appears to
  do nothing, and the shell is behaving exactly as specified — the harness suppresses the
  behaviour it exists to exercise.
- **SIGTERM, never SIGKILL.** A capture truncated at a buffer boundary looks like an
  application that stopped drawing.
- **`hold` must outlast the far side, generously.** `docker stats --no-stream` takes ~2s and
  the dashboard runs it alongside `docker ps -a`; a capture ending mid-fetch shows an empty
  transcript, which reads exactly like a command that produced nothing.
- The teardown is written to `<out>.raw.teardown` so a shell that cleared on exit could not
  overwrite the frame under examination. Measured, this shell's teardown is 38 bytes and
  erases nothing — the split prevents a hazard, not a defect.

---

## 3. The suites, and which of them covers what

| command | covers | does **not** cover |
|---|---|---|
| `make all` | Calcium: check, enforce, audit, tiers 1–4, golden, tier 5 | the example's own tests |
| `npx vitest run --dir test` in `examples/docker` | the app: seal, shim, `/ps`, dashboard | anything about the packaged artefact |
| `make proof` | pack, install the tarball clean, run the app against the **installed** package | that a publish to a live registry succeeds |
| `node tools/mutate/runs/docker-*.mjs` | whether the tests can see the defects they name | anything a mutation was not written for |

`npm test` at the root **excludes tier 5**. A green `npm test` says nothing about the PTY
suite, which is where F19 surfaced.

---

## 4. Read the frame, and do not trust the boundary list

The by-hand walk's boundary section is necessary and not sufficient. `DASHBOARD_WALK.md`
§C has a section devoted to *a consequence between two rulings, owned by neither* — it
listed four boundaries and got the CPU cell right. NAME still truncated, because the NAME
cell was not on the list. A boundary enters the table only once somebody has thought of it,
and the ones that bite are the ones nobody did.

**The frame is the only artefact that enumerates boundaries exhaustively, because it does
not have to know they exist to show them.** Frame-read is mandatory, at 120 and at 80, on
anything that composes blocks.

And: **assert the rendered output, never the arithmetic the code used.** An assertion
derived from the same computation as the code cannot see that computation being wrong. It
has now happened twice — `STATUS`'s `minWidth >= max(cells(Status))` in step 1, and the CPU
column compared against a string padded to the same constant in step 2, which survived its
own mutation.

## 5. `tools/measure-s3.mjs` — a probe on the framework's defaults is a different application

S3's height decides whether C22 I46's block-boundary windowing is visible at all, so the
figure is load-bearing rather than descriptive. Three attempts, three plausible wrong
answers:

| answer | measured against |
|---|---|
| **13** | a registry with no plot definition, and a malformed `b.kv` call |
| **21** | the drawing, before S3 existed — three blocks, two of which were never built |
| **17** | `createBlockRegistry()` alone, which still has no plot |
| **26 / 30** | the built document, through the registry the shell composes |

`table`, `plot` and `patch` register through the public mechanism rather than shipping with
the defaults (`registry.ts`, deliberately — it is what proves the extension point). The
shell does it at `construct.ts:297`; a probe that does not measures a plot through the
fallback and answers a number that looks entirely reasonable. **The same fault recurred
while correcting the passage the first instance of it had produced.**

26 is the declared document and 30 is what the terminal shows: the one-shot `details` part
is declared holding `loading…` and grows to four key-value rows. For a surface near the
region's height the safe figure is the larger, and neither is derivable from the other.

## 6. `tools/s3_esc.py` — the question a frame at the end cannot answer

`capture.py` ends at the teardown, so a capture that stops at the pop cannot tell a clean
release from a part still ticking against a layer that has gone. This one presses `Esc`
alone — never in the same burst as anything else, C16's paste window — and then holds for
several intervals, so a surviving tick has time to draw. It does not; the frame after the
pop is the dashboard, with no S3 panel and no transcript entry, which is B03 §2's push
semantics visible rather than argued.

## 7. A load generator is a fixture, and it perturbs the other instruments

S3's plot says nothing about an idle container, so the frame-reads ran against a busy-loop
container. With it running, tier-5's `T5.3a` failed on a timing assertion and passed alone;
removing the fixture made `make all` green. **Not flakiness discovered — load introduced.**
Worth writing down because the natural reading of a timing failure during a frame-read
session is that the change under test caused it.

**Re-measured in step 8, and it did not reproduce.** `make fixtures` brings up `dtui-load`
— the same shape of busy loop — and tier 5 ran green with it up: 94 passed, 7 todo,
`E2E_WITH_LOAD_EXIT=0` read from a redirect. Both measurements are real, and neither
cancels the other: C03's thresholds had no margin on a busy host in step 4 and have margin
on an idle one now.

**And then it reproduced, on the third measurement, by someone forgetting the rule.**
`dtui-load` was left up after a run of demo captures and tier 5 was run without thinking:

| | with `dtui-load` up | after `make load-down` |
|---|---|---|
| **C06** `T5.6` — a session with no far side installed | **timed out at 75s** | **898 ms** |

Eighty-three times, and the failure mode is a *hang* rather than a threshold — which is
worse than the original `T5.3a` finding, because a timeout reads as a deadlock in the code
under test rather than as contention. The first minutes of that investigation were spent
looking at a change to the paint path that had nothing to do with it, and the check that
ended it was stashing the change and watching the row fail identically without it.

**So the rule keeps its place on the asymmetry *and* now on the odds.** `make load-down`
costs a second. Not running it cost a 75-second timeout, a bisect against a stashed change,
and very nearly a wrong conclusion about which commit broke it. A precaution whose stated
justification is a failure nobody can reproduce gets deleted by the next person who checks;
this one carries three measurements, two of which are failures.

## 8. A capture that ends too early is indistinguishable from a command that did nothing

`/drift dtui-web` at `hold=8` replayed as a typed prompt and an empty transcript. At
`hold=16` the same command showed four blocks. **The two failures look identical in a
replay** — nothing rendered, either way — and the wrong reading is the interesting one,
because "the verb produced nothing" is a plausible defect that would have been chased.

`capture.py`'s own comment already warns that `hold` must outlast the far side. The gap it
does not cover is that `/drift` makes **two** dependent calls, so its floor is twice a single
`docker inspect`, and a surface's hold is a property of its call graph rather than of the
app. Read the same command at two holds before concluding a frame is empty.

That mistake was made twice in one session — once on `/drift dtui-web`, which was a short
hold, and once on `/drift no-such-container`, which was **not**: the transcript really was
empty, and F35 is the reason. Distinguishing them took the longer capture and then the
validator.

---

## 9. Never truncate your own frame output — the reader's cut is not the frame's edge

`screen.py` prints a grid. Piping it through `head -20`, or slicing `[:12]` in the little
python that numbers the rows, produces **exactly what a short frame produces**: rows, then
nothing. There is no marker distinguishing *the frame ended here* from *I stopped printing
here*, and the second reads as the first every time.

**Three diagnoses have now been wrong for this reason**, in three separate steps:

| step | the cut | what was actually there |
|---|---|---|
| 2 | `head -20` | the entry was at rows 29–39 |
| 5 | `[:12]` on `/config dtui-cfg` | the notice and the candidates at rows 12–15 |
| 5 | `[:16]` on a stopped container | the refusal at rows 26–27, below the dashboard |

The third is the sharpest, because the byte stream *contained* the text — `grep` found
`cannot read` at offset 26337 — and the replayed frame appeared not to. That combination
reads as **drawn and then overwritten**, which is a real and serious defect class, and two
minutes went into it before the cause turned out to be the `[:16]`.

**So: print every row, always.** A frame at 40 rows is 40 lines of output; there is no
budget being saved. If the output genuinely needs narrowing, narrow the *columns* — the
frame's height is the thing being read and the thing a cut destroys.

The general form, and the reason this sits beside the instruments rather than in
`FINDINGS.md`: **an instrument that silently discards evidence is indistinguishable from
evidence that was not there.** §0's pipe, §1's stripped capture and §8's short hold are the
same sentence about three different tools; this one is about the reader.
