# Verifying docker-tui

Three instruments and three rules. Every one of them exists because reading a result
wrongly cost more than getting the code wrong, and each names the occasion.

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
