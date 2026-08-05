# Step 8, walked by hand

Two artefacts, because step 8 has both kinds of rule interaction and taking one
shape is how the other half goes unexamined. §A is a **classification table** —
rules that hold at rest, indexed by which two of them overlap. §B is a **sequence
trace** — rules that meet because something happened in between.

**Step 8 has no component**, so this is proportionate rather than full: it indexes
the interactions, not the inputs.

---

## 0 — The finding this walk starts with is about its own position

The plan scheduled this artefact at step 2, **after** the play environment it was
meant to govern. Two of its rows were therefore answered by the implementation
rather than by the walk, and both were the kind a walk exists to catch:

| row | what the walk would have asked | what the implementation did instead |
|---|---|---|
| where the second devcontainer lives | *a config in a subdirectory makes that subdirectory the workspace* meets *the app depends on `file:../..`* | the container could not install the example; found by writing it |
| a bind mount's source path | *`make fixtures` runs in the container* meets *the daemon is on the host* | `mounts denied`, found by running it |

Neither cost much, because both fail loudly. **That is luck rather than design** —
the same two rules meeting one step further along produce an empty mount instead
of a refusal, and an empty mount is the empty-block class: it looks like a
container with no configuration.

The rows below are the ones still ahead, and they are the ones where the failure
is quiet.

---

## A — Classification table: which consumer resolves what, and what each can prove

The structural interaction is that **four different things import `@fmx/calcium`
and no two of them resolve it the same way.** Every row is a pair of rules that
both hold at rest.

| | consumer | how it resolves | can prove | cannot prove |
|---|---|---|---|---|
| **A1** | the app's `src/`, in the workspace | npm workspace symlink: `node_modules/@fmx/calcium -> ../..` | the API is usable | anything about the package |
| **A2** | `make proof`'s clean tree | the packed tarball, asserted not to be a symlink | `files`, `exports`, type resolution | — |
| **A3** | the linked `docker-tui` bin | the same symlink as A1, reached through a global link | the command runs | the same blind spot as A1 |
| **A4** | the README's minimal example | **undecided — this is the row** | | |

### A1 × A2 — the seal is enforced, the build is not

**The symlink means `dist/` must already exist**, and nothing says so at the point
of failure. `require.resolve` lands on `/workspaces/tui-kit/dist/index.js`; with
no build the app fails on an unresolvable import, which reads as a broken install.
The example's container `postCreate` therefore runs `npm run build` **before**
`npm install` in the example, and the ordering is a rule rather than a habit.

### A4 — the minimal example, and the row that decides it

Two rules that both hold and have never met:

- **`files` is `["dist", "README.md", "LICENSE"]`.** Nothing under `examples/`
  ships in the Calcium tarball.
- **`proof.sh` copies exactly one directory into the clean tree**: `tar -C
  "$ROOT/examples/docker"`.

So a minimal example at `examples/minimal/` is **invisible to `make proof` in two
independent ways**, and would be verified — if at all — from the workspace, which
is A1: the resolution that cannot see a packaging bug. R01's own test is *someone
who is not its author builds a working TUI from the README*, and a workspace-run
example tests the author's machine.

**Ruling: extend `proof.sh` to copy `examples/minimal` as a second tree and run
it there.** Not "move it under `examples/docker/`", which would make it resolve
through the app's `node_modules` and quietly re-enter A1's blind spot by a
different door.

### A5 — what "runs" means for the minimal example, and it is the sharp row

*The example must run* meets *`createTui` opens an alternate screen*.

`docker-tui` without a TTY prints a refusal and exits 0 — measured. A minimal
example verified the same way proves the module loaded and nothing more. And the
tempting alternative is worse: **an example that builds a `ViewDocument` and
asserts its blocks does not call `createTui` at all**, which is precisely the
surface F7 was about. F7 was `createTui` unusable from the public surface,
invisible because every internal caller reached around it — an example that
reaches around it is the fifth such caller.

**Ruling: the minimal example is run under a PTY**, the way every frame in this
repository is read, and the assertion is on the frame. `tools/capture.py` already
does this and is not Calcium's, so the harness moves or is duplicated — that cost
is real and is the price of the row being meaningful.

### A6 — the root README ships, and is therefore a published surface

`README.md` is in `files`. Whatever it claims is installed alongside the package
and read by consumers who never see this repository. A code block in it is not
covered by anything, which is the same shape as A5 one level out: **a fence
satisfies a reader and executes nothing.**

**Ruling: the README quotes the file rather than restating it**, and a row asserts
the two agree. A quoted block that has drifted is worse than no example, because
it fails on the reader's machine and not on ours.

---

## B — Sequence trace: the screencast

The event-mediated interaction is that **the recording is one process and the
surfaces are not all reachable from one process.**

| | sequence | interaction | outcome |
|---|---|---|---|
| **B1** | launch → wait → `/ps` | the dashboard keeps refreshing (C23 I9) while a command is typed | correct and worth showing; the transcript grows under a live entry |
| **B2** | `/ps` → resize narrower | C11 drops columns by priority | the drop is the point; the resize must happen *after* the table is on screen |
| **B3** | ⏎ → wait for the plot | one sample per tick at `TICK_MS = 2000` | **a real duration.** Six ticks is twelve seconds of recording where nothing else happens, and it cannot be shortened without showing a plot with three points |
| **B4** | B3 → `esc` → `/drift` | the pushed view pops; the live entry beneath is still ticking | the frame after `esc` must be read, not assumed — step 3 found the pop leaves state |
| **B5** | `/logs` → `⌃c` | C16's ladder; the stream stops and the view stays | the rung order matters and is C16's walk, already done |
| **B6** | any beat → the five depths | **the depth is read from the environment at startup** | **cannot happen in one session** — see below |
| **B7** | the whole recording × `dtui-quiet` | it exits two seconds after `make fixtures` | by the time any beat runs it is long stopped, which is what S2 wants. A beat that wanted to show it *dying* would have to start it mid-recording |
| **B8** | the whole recording × `dtui-load` | it is up for the plot to have a shape | and it must come down before any timing tier — the Makefile has `load-down` for exactly this |

### B6 is the finding

`capture.py` sets the environment **once, at `pty.fork()`**, because C02 reads
`COLORTERM`, `TERM` and `LANG` when the shell is constructed. A single recording
therefore has one colour depth and one unicode mode for its whole length.

So the seventh beat is **not a beat**. It is five recordings, and presenting them
as a continuous session would be a claim about the application that is false —
the same class as S1's drawing asserting a freeze mechanism that does not exist.

**Ruling: the screencast ends at beat 6.** The five depths are already
demonstrated by `DEGRADATION.md`, as frames, side by side, which is the form that
suits them: a reader compares depths by looking at two frames at once, not by
watching one replace another. Pointing the README at that document is both
honest and better.

---

## What this walk changed before any of it was built

- `proof.sh` gains a second tree; the minimal example does **not** move under
  `examples/docker/`.
- The minimal example is exercised through a PTY, not by asserting a document.
- The README quotes a file that a row checks.
- The screencast has six beats, not seven.
