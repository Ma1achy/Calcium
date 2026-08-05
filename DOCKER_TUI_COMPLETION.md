# docker-tui — completing the wrapper

Steps 9–13. The app today covers twelve read-only surfaces; this takes it to a complete
docker client.

**Two reasons, and either alone is sufficient:**

- **Findings.** Docker-tui is entirely read-only. Mutation, destructive operations,
  progress streams and `exec` are four classes it has never touched, and three open items
  have been deferred since step 2 for want of a consumer that forces them.
- **The pitch.** *"A complete docker client in under 5,000 lines"* is a dramatically better
  README line than *"a demo of twelve surfaces"* — a number that makes the framework's case
  by itself.

**Scope boundary, decided: plain docker, not compose.** Compose is arguably its own app —
a different config model, multi-container lifecycle, its own state — and including it
roughly doubles the remaining work. Say so in the README rather than half-covering it.

---

## The shape of the work

**~40 verbs, but only three genuinely new shapes.** The cost is in the pattern, not the
verb: once `stop` works, `start`/`restart`/`kill`/`pause` are a table entry each; once one
`ls` works, seven more are ~60 lines apiece.

| pattern | verbs | cost |
|---|---|---|
| **mutation** | `start` `stop` `restart` `kill` `pause` `unpause` `rename` `update` | **high first, near-free after** — the confirm primitive |
| **destructive** | `rm` `rmi` `prune` `volume prune` `network prune` `system prune` | medium — reuses confirm, adds weight semantics |
| **progress stream** | `pull` `push` `build` | medium — a new shape |
| **list** | `network ls` `volume ls` `context ls` `image history` `system df` `builder ls` | **low** — `ps.ts` again ×7 |
| **inspect** | `network inspect` `volume inspect` `image inspect` | low — `inspect.ts` again |
| **file I/O** | `cp` `commit` `export` `save` `load` `import` | low — mostly boring |
| **complex** | `run` `create` `exec` `attach` | **high** — `exec` is the `/tty` handoff |

Ending around **4,500–5,000 lines**, from 1,896 today.

---

## Step 9 — the mutation family ★ the expensive one, and the one with the findings

`start` `stop` `restart` `kill` `pause` `unpause` `rename` `update`

**This is where the findings are, and it is front-loaded deliberately.** Three things open
since step 2 have no consumer forcing them, and every one of them is forced here.

### 9.1 The confirm primitive — the blocker, and it must be built

`raiseExitConfirm` still calls `stop()` directly. **The blocker has always been the
*answering*, not the drawing** — C15 places a confirm layer fine; nothing routes `y`/`n`
back to a waiting caller.

A `⚡ stop` that actually stops a container **cannot ship without it**, so this forces the
ruling rather than filing it. It was gap 4's prediction in the original surfaces document
and it has never been tested.

It is the same primitive `agent-tui`'s A3 needs (the question / blocking input), so **build
it here and A3 inherits it.** Two consumers, one mechanism.

Touches C23's execution model: a verb that suspends pending an answer, and a ruling on
Ctrl-C during it.

### 9.2 What does a state change leave in the transcript? ★ a genuinely open ruling

**Every verb so far *reports*. A mutation *acts*** — and then the thing it acted on is stale
in three entries above it. Does a `/ps` from ten minutes ago still show `running`?

No precedent anywhere in Calcium. The candidates:

- **nothing** — the transcript is a record of what was true when it was drawn, and staleness
  is inherent to a log. Simplest, and defensible.
- **a marker** — prior entries mentioning the container gain a staleness indicator. Requires
  the transcript to know what an entry is *about*, which it does not.
- **the mutation's own entry carries the before/after** — cheapest, and it is the
  comparison block again.

**The first is probably right and the ruling should say why**, because the second is the one
a reader assumes and it is much larger than it looks.

### 9.3 `exitCode` null-means-signal — filed since step 4, consumer arrives here

`docker stop` sends SIGTERM. `RawResult.exitCode` is `number | null`; `DocumentMeta.exitCode`
is `number`; every adapter invents a number, and `?? -1` versus `?? 137` makes `meta.exitCode`
incomparable across apps in the one case where comparison matters.

**This is that finding's consumer.** C04 and C07 own it jointly.

### Frame-reads, unhappy first

A container that is already stopped · a container that refuses to stop (`--time 0` on
something ignoring SIGTERM) · Ctrl-C **during** the confirm · a stop that succeeds while an
older `/ps` sits above it in the transcript.

---

## Step 10 — destructive operations

`rm` `rmi` `prune` `volume prune` `network prune` `system prune`

Cheap, because it reuses step 9's confirm. **One new concept: weight.**

`docker stop` is reversible. `docker system prune` is not, and it can delete a great deal.
So a confirm that is the same for both is wrong — **a destructive confirm should state what
it will destroy**, which means a dry-run first (`--dry-run` where docker offers it, or a
count from the corresponding `ls`).

That is a real design question about the confirm primitive: **does it carry a payload?** A
yes/no box is one thing; a yes/no box *containing a table of what will be deleted* is
another, and it is the shape prune needs.

Frame-reads: a prune with nothing to remove, a prune with twenty things, and a refusal.

---

## Step 11 — progress streams

`pull` `push` `build`

**A new shape, and it exercises blocks nothing else has.** `docker pull --format json` emits
per-layer progress; `build` emits step-by-step output with cache hits.

- `progress` and `steps` blocks under **real** load, for the first time
- **many concurrent progress rows** — a pull is N layers advancing independently, which is
  closer to S4's dense live table than to anything else, but the rows *complete* rather than
  merely change
- **build's cache-hit distinction** — a step that ran and a step that was cached are
  different facts, and that is the change-axis question (F30/F49/F51) with a fourth consumer

**Check the far side first**, per every previous step: run `docker pull --format json` and
`docker build --progress=rawjson` and see what they actually emit before designing against
the drawing.

---

## Step 12 — the list and inspect tail ★ do this LAST

`network ls` `volume ls` `context ls` `image history` `system df` `builder ls` ·
`network inspect` `volume inspect` `image inspect` · `cp` `commit` `export` `save` `load`
`import`

**The cheapest step and the lowest-yield for findings** — it is `ps.ts` and `inspect.ts`
again, twelve times. Expect almost nothing new.

**It goes last, not first**, and that ordering matters: the novel shapes in steps 9–11 are
where framework changes come from, and you do not want forty verbs written against a
surface that is about to change.

It is also where the "complete" claim comes from, so it is not optional — just deferred.

---

## Step 13 — run, create, exec, attach

**`exec` is the reason this step exists.** The `/tty` handoff has been built since step 1 —
`interactive: true` on a `ToolDef`, `suspend → handoff → resume → invalidate` — and **no
consumer has ever used it.** `docker exec -it <c> sh` is that consumer.

`run` and `create` raise their own question: **a verb that creates something the transcript
should then track.** Every verb so far describes existing state; `run` produces a container
that the dashboard's live block should pick up on its next tick. Whether that is automatic
(it polls, so yes) or wants an explicit acknowledgement is a small ruling.

`attach` is the same handoff family as `exec`.

---

## Expected findings, honestly

Front-loaded, and the tail is thin.

```
step  9   5-10   the confirm ruling · the staleness ruling · exitCode null · Ctrl-C
                 during a confirm
step 10   2-4    the confirm's payload question · destructive weight
step 11   3-5    progress/steps under load · concurrent rows · cache-hit as a change axis
step 12   0-2    the seventh table finds little — and that is fine
step 13   3-5    the /tty handoff's first consumer · what run leaves behind
```

**Steps 9 and 13 are where the value is.** Step 12 is where the pitch is. Both are worth
doing; do not confuse them.

---

## Carried, unchanged

The discipline that produced sixty-six findings, and none of it relaxes because the verbs
are more numerous:

- **Check the far side before designing against the drawing.** `docker ps --json` was
  `unknown flag`; `--format json` on `top` was handed to `ps` inside the container. Every
  step has had a premise fail.
- **Frame-reads, unhappy paths first.** Four of five reads found things the suite could not,
  every step.
- Exit code from a redirect, never a pipe · assert rendered output, never the arithmetic the
  code used · a fixture shown to respond before it is asserted against · a test that calls
  the mechanism verifies the mechanism, never the wiring · the walk rules the shape, the
  implementation is the first thing that can falsify it.
- **Nothing fixed in Calcium unless this app is the consumer proving it** — with the
  exception step 9 makes explicit: the confirm primitive is a total blocker with two
  consumers (this and `agent-tui`'s A3), which is the F7/F17/F19 standard, not convenience.
- Every document through `documents.test.ts`, **failure arms first**. Mutations have more
  failure arms than reads do.

## Where this sits

**After the roadmap's phase 1**, alongside `agent-tui` and `prism-tui` — all three are
second-consumer work and all three belong before the freeze, because every finding after
publication is a breaking change with users attached.

**But step 9 could come earlier if the confirm primitive is wanted sooner**, since
`agent-tui`'s A3 is blocked on the same mechanism and A3 is the highest-value thing that
example produces.

---
---

# Part II — the rulings and the exemplars

**Everything below is decided so the build does not stop to ask.** Four rulings taken, four
exemplar surfaces drawn, a mapping table for the tail, and a standing list of *"do not stop
for this"*.

Only **one** thing in steps 9–13 is left open, and it is named at the end.

---

## Ruling A — the confirm primitive

The total blocker. Design it once; it serves step 9, step 10, and `agent-tui`'s A3.

### It is a choice list, not a yes/no box

**Ruled general, because two consumers need different shapes.** A binary confirm is the
two-choice case; `agent-tui` needs single-select, multi-select and free text. One mechanism.

```ts
const answer = await ctx.ask({
  question: "Stop api-gateway?",
  detail?: Block,                    // optional payload — step 10 needs this
  choices: [
    { key: "y", label: "yes" },
    { key: "n", label: "no", default: true },
  ],
});
// answer is the chosen key, or null if declined
```

- **A promise the verb awaits.** The verb suspends; the frame keeps drawing; the prompt is
  unavailable while a question is open.
- **Single-character accelerators are part of a choice**, so `y`/`n` work and so do arrows +
  Enter. Both, always — the keyboard-equivalent rule already in C02's mouse comment.
- **`default` marks the safe option**, and Enter with nothing selected takes it. For any
  destructive verb the default is *no*.

### Ctrl-C and Esc both mean the default choice

**Not "cancel the verb" — they are the same outcome.** Declining a confirm and cancelling
the verb both result in nothing happening, so collapsing them removes a distinction with no
observable difference. `esc` and `⌃c` both resolve with the default.

That also keeps the Ctrl-C ladder unchanged: the question layer is a modal rung, newest
first, exactly like the existing overlay rungs.

### The layer is dismissable but does not fall through

`esc` dismisses (to the default). But `PgUp` must **not** scroll the transcript behind it —
that is step 3's coverage guard, and the question layer covers its region for the same
reason a view does. Reuse the guard rather than adding a second condition.

> **Ruled 2026-08-06, during step 9: `dismissable` is two words.** This section could not be
> implemented as written. C16's guard is `!top.dismissable || coversRegion(top.id)`, and a
> confirm that is `dismissable: true` fails the first clause while a **centred** box fails the
> second — so `PgUp` fell through to `global` and scrolled the transcript behind an open
> question. Making it `fill` to satisfy `coversRegion` contradicts C15 §`Placed`, whose
> `left` field exists *because* a centred confirm has horizontal extent worth recovering.
>
> Ruling A's *dismissable* means **the user can escape it**. C15's `dismissable` flag means
> **the router may pop this layer without telling its owner**. The layer wants `true` to the
> first and `false` to the second, and the flag only answers the second — so the flag is
> `false`, the placement stays `centred`, and `Esc`/`⌃c` are resolved by the answer handler
> rather than by the router's pop. User-visible behaviour is exactly what this section
> describes. C23 I36, C16 I25.
>
> **A second contradiction fell out of the first.** The signature above comments *"answer is
> the chosen key, or null if declined"*, and the section below rules that `Esc` and `⌃c`
> resolve with the **default choice**. After that collapse there is no path that produces
> null — declining *is* a choice. `ask` returns `Promise<string>`. The `null` was vestigial
> from before the collapse was ruled, and it would have made every caller handle a case
> nothing could reach.

### A question from a route that cannot suspend is a construction error

Not a runtime surprise. If a verb declares it may ask and its route has no suspension path,
that fails at construction with the route named — the same standard as C23 I27's handler
reconciliation.

---

## Ruling B — a state change leaves the transcript alone

**Ruled: nothing.** A prior `/ps` showing `running` after a `stop` is correct — it is a
record of what was true when it was drawn.

Three reasons, and the third is the one that settles it:

- **The transcript is already a log.** Entries freeze when a newer one appends; that is the
  model, and staleness is inherent to it.
- **Marking prior entries would require the transcript to know what an entry is *about*** —
  a semantic index over documents, which C13 does not have and should not grow.
- **The live block already answers "what is true now".** The landing dashboard polls, so the
  current state is always visible at the bottom of the session. *History is history; the
  live block is now.* A reader does not need history to lie less; they need to know where to
  look.

**Write that reasoning into the ruling**, because "mark the stale entries" is what a reader
assumes and it is much larger than it looks.

---

## Ruling C — a destructive confirm carries what it will destroy

Step 10's payload question. **Yes: the `detail` Block, populated from a dry-run or the
corresponding `ls`.**

`docker stop` is reversible; `docker system prune` is not, and it can delete a great deal. A
confirm that is identical for both is wrong.

**And the zero case is a separate ruling: with nothing to remove, do not ask at all.** Report
*"nothing to prune"* and settle. A confirm for an operation with no effect trains people to
answer without reading, which is the failure mode confirms exist to prevent.

---

## Ruling D — the shim's standing instruction

**Do not stop to ask when a docker verb does not emit JSON.** Three already do not, and the
shim already carries four translations with its blind spot written in the file.

The standing rule: **absorb it in the shim, file it as a finding with the verb that needed
it, carry on.** Only stop if the translation would require the shim to *parse* rather than
*rewrite* — a command mapper is a second manifest in a bash script, and that is the line.

---

## Exemplar 1 — mutation (`/stop`), and the confirm in a frame

```
❯ /stop api-gateway

  ⟩ Stop api-gateway?
    ● no      ○ yes                                    ← default is the safe one
      esc/⌃c · n     y

── after y ────────────────────────────────────────────

❯ /stop api-gateway

  ✓ api-gateway stopped                     SIGTERM · 1.2s
```

Every mutation verb in step 9 is this shape with a different question and a different
success notice. **The exit code line is where `exitCode` null-means-signal lands** — the
notice says *SIGTERM*, not *exited 137*, because the app knows which it was and the meta
currently cannot say.

Failure arm — and it runs least, so write it first:

```
❯ /stop api-gateway

  ▲ could not stop api-gateway
    Error response from daemon: No such container: api-gateway
```

---

## Exemplar 2 — destructive (`/prune`), the payload confirm

```
❯ /prune

  ⟩ Remove 6 stopped containers and 2 unused networks?
    This cannot be undone.

    NAME              IMAGE              STATUS
    dtui-quiet        alpine             Exited (0) 2 days ago
    old-api           myco/api:v3        Exited (137) 5 days ago
    …4 more                                                        ← the detail Block

    ● no      ○ yes

── with nothing to remove ─────────────────────────────

❯ /prune

  nothing to prune
```

The detail is a real table from the corresponding `ls`. **The zero case does not ask.**

---

## Exemplar 3 — progress stream (`/pull`)

The new shape, and the one to check against the far side first — `docker pull --format
json` per-layer, `docker build --progress=rawjson`.

```
❯ /pull nginx:alpine

  ▌ nginx:alpine
  ▌ ████████████████████  a1b2c3  pull complete
  ▌ ████████████░░░░░░░░  d4e5f6  downloading   4.2MB / 7.1MB
  ▌ ██░░░░░░░░░░░░░░░░░░  789abc  extracting
  ▌ ░░░░░░░░░░░░░░░░░░░░  def012  waiting
  ▌
  ▌ 4 layers · 12.4MB / 31.2MB                            ← b.live, ticking

── settled ────────────────────────────────────────────

  ✓ nginx:alpine  pulled   31.2MB · 8.4s
```

**Rows complete rather than merely change**, which is the difference from S4's dense live
table — a finished layer stops moving but stays. And `build`'s cache-hit distinction
(`CACHED` versus ran) is **the change-axis question with a fourth consumer** — file it
against F30/F49/F51 rather than reaching for `Tone`.

---

## Exemplar 4 — `exec`, the `/tty` handoff's first consumer

Built since step 1, never used by a consumer.

```
❯ /exec api-gateway sh

  ⟩ handing over the terminal…
  [ the frame is torn down · sh runs · you exit ]

  ✓ exec exited 0                                        ← the frame repaints
```

The manifest declares `interactive: true`. Everything else already exists —
`suspend → handoff → resume → invalidate`. **The finding will be whatever the first real
handoff exposes**, and there is a recorded hazard: C21's raw-stdin guard rejecting
mid-sequence abandons a suspended terminal.

---

## The tail — a mapping table, not drawings

**No drawings for these on purpose.** They are `ps.ts` and `inspect.ts` again, and a drawing
made without running the command is an F11 instance waiting to happen. **Run the command,
then follow the exemplar.**

| verb | follows | columns / notes |
|---|---|---|
| `network ls` | `ps.ts` | NAME · DRIVER · SCOPE · created |
| `volume ls` | `ps.ts` | NAME · DRIVER · mountpoint (truncate from the end) |
| `context ls` | `ps.ts` | NAME · DESCRIPTION · endpoint · current ● |
| `image history` | `ps.ts` | ID · CREATED · SIZE · created-by (the wide one) |
| `system df` | `ps.ts` | TYPE · TOTAL · ACTIVE · SIZE · reclaimable |
| `builder ls` | `ps.ts` | NAME · DRIVER · STATUS · platforms |
| `network/volume/image inspect` | `inspect.ts` | the same structured + `--raw` toggle |
| `cp` `commit` `export` `save` `load` `import` | notice + progress | mostly a result line; `save`/`load` may stream |

**Priorities per table are the app's to choose**, following S2's rule: the identifying column
never drops, and the identifying *end* of a value is kept (the head for a name, the tail for
a mapping).

---

## Standing rulings — do not stop for these

```
a docker verb does not emit JSON        → shim it, file it, carry on (Ruling D)
a drawing disagrees with real output    → correct the drawing in place with the reason,
                                          file as F11's class, carry on
a Calcium gap that has a workaround     → file it with the surface that needed it,
                                          work around it app-side, carry on
a Calcium gap that is a TOTAL BLOCKER   → fix it spec-first with this app as the consumer.
                                          The confirm primitive is the only one predicted
a test goes green on first write        → mutate it hardest; three wiring-vs-mechanism
                                          instances came from exactly this
a mutation fails nothing                → ask which is indicted — test, spec, mutation, or
                                          check — before rewriting anything
a frame looks wrong                     → it is a finding until proven otherwise; four of
                                          five unhappy reads found something every step
```

---

## The one thing left open

**`run` and `create`: what a verb that creates something leaves behind.** Every verb so far
describes existing state. `run` produces a container the dashboard's live block should pick
up on its next tick — which it will, because it polls.

**So the likely answer is "nothing special, the live block catches it"**, and that matches
Ruling B. But it is worth one deliberate frame-read at step 13 rather than an assumption:
run a container, watch the dashboard, confirm it appears without being told to.

If it does not, that is a finding about the live block's refresh and it is worth having.

---
---

# Part III — the frames

**What is safe to draw and what is not.** Eight F11 instances were drawings wrong about what
docker *emits*. So: layout and composition are drawn here and are safe, because they are
Calcium blocks and Calcium is known. **Field lists are marked `CHECK` and must be run
before they are trusted.**

## A correction to Exemplar 1 — the confirm is a layer, not an entry

Part II drew the question inline in the transcript. **That is wrong.** C15 *places* a confirm
layer, and `raiseExitConfirm` was always meant to raise one — so the question is drawn
**over** the frame and vanishes when answered.

Which raises a ruling Part II did not take:

### Ruling E — the question is not recorded; the answer is implied by the outcome

The confirm layer disappears. The transcript shows the command and its result, never the
question. **A confirm that was declined settles as a refusal notice**, so the record is
complete without recording the dialogue:

```
❯ /stop api-gateway          →  ✓ api-gateway stopped
❯ /stop api-gateway          →  ✗ not stopped                  (declined)
```

*"You were asked and said yes"* adds a row that the outcome already implies.

---

## Frame 1 — the confirm, as a layer over a live frame

```
┌ docker-tui ───────────────────────── engine 27.3 · 14 containers ─┐
│ ▌ RUNNING (9)                                  CPU 34%  MEM 61%   │
│ ▌ ● api-gateway    ▂▄▆█ 84%   512M/2G   1.2M/3.4M   up 3d         │
│ ▌ ● postgres       ▁▁▂▁  8%   1.1G/2G   880k/12M    up 12d        │
│ │                                                                 │
│ │   ┌─────────────────────────────────────────────┐               │  ← the layer
│ │   │  Stop api-gateway?                          │               │
│ │   │                                             │               │
│ │   │    ● no        ○ yes                        │               │
│ │   │    esc · n     y                            │               │
│ │   └─────────────────────────────────────────────┘               │
│ │                                                                 │
└───────────────────────────────────────────────────────────────────┘
  ⟩                                                    ← prompt unavailable
```

**The live block keeps ticking underneath.** The question does not freeze the session — it
suspends *the verb*. Worth asserting: a dashboard that stops refreshing while a confirm is
open would be the guard held across a suspension, which C23 I6 forbids for streams and the
same reasoning applies.

---

## Frame 2 — `/start`: no confirm at all

**A ruling drawn.** Starting is safe and reversible, so it does not ask. Only destructive or
disruptive verbs confirm.

```
❯ /start dtui-quiet

  ✓ dtui-quiet started                                          0.9s
```

The set that confirms: `stop` `kill` `restart` `rm` `rmi` `prune` `update`.
The set that does not: `start` `unpause` `rename` `cp` `commit` `save` `export`.

`pause` is the interesting one — reversible, but it *disrupts* something running. **Ruled:
it confirms**, on the same grounds as `stop`.

---

## Frame 3 — `/kill`: a stronger question for a stronger verb

Same primitive, different weight in the wording. `stop` is SIGTERM and graceful; `kill` is
SIGKILL and is not.

```
   ┌─────────────────────────────────────────────┐
   │  Kill api-gateway?                          │
   │  SIGKILL — the process gets no chance to    │
   │  shut down cleanly.                         │
   │                                             │
   │    ● no        ○ yes                        │
   └─────────────────────────────────────────────┘
```

**The `detail` field carries the consequence**, which is the same slot `/prune` uses for its
table. One mechanism, two weights.

---

## Frame 4 — `/rm` on a running container: the refusal that teaches

Docker refuses, and the refusal names the remedy. **The app should pass that through rather
than inventing its own wording** — the far side's error is more likely to be right.

```
❯ /rm api-gateway

  ▲ cannot remove api-gateway
    You cannot remove a running container. Stop the container
    before attempting removal, or force remove with --force.

    ⟩ /rm api-gateway --force                                   ← a fill action
```

**The suggested command is a `fill` action** — it writes the corrected line into the prompt
and the reader presses Enter. That is B03's canonical `fill` path, and this is its first
consumer in the app.

---

## Frame 5 — `/build`: genuinely different from `/pull`

`CHECK`: run `docker build --progress=rawjson` before trusting the field names. The *shape*
below is the layout decision and is safe.

```
❯ /build -t myco/api:v5 .

  ▌ myco/api:v5
  ▌ ✓ [1/6]  FROM node:22-alpine                          CACHED
  ▌ ✓ [2/6]  WORKDIR /app                                 CACHED
  ▌ ✓ [3/6]  COPY package*.json ./                        CACHED
  ▌ ✓ [4/6]  RUN npm ci                                    24.1s
  ▌ ⟩ [5/6]  COPY . .                                      running
  ▌   [6/6]  RUN npm run build
  ▌
  ▌ 4 of 6 · 31.4s                                        ← b.live, ticking

── settled ────────────────────────────────────────────────────────

  ✓ myco/api:v5  built    6 steps · 3 cached · 48.2s
```

**`CACHED` versus a duration is the change axis, not a tone.** A cached step is not "good"
and a run step is not "bad" — they are different *kinds of thing that happened*, which is
exactly F30/F49/F51's absent concept with a fourth consumer. **File it there; do not reach
for `Tone`.**

The `steps` block is the natural fit and has never been exercised under real load.

---

## Frame 6 — `/run`: the open question, drawn as the likely answer

```
❯ /run -d --name web -p 8080:80 nginx:alpine

  ✓ web started                    7f3a2c14b9e0 · nginx:alpine

── the dashboard's next tick, unprompted ──────────────────────────

  ▌ RUNNING (10)                                CPU 36%  MEM 62%
  ▌ ● web             ▁▁▁▁  1%   12M/2G    0 / 0      up 2s      ← appeared
  ▌ ● api-gateway     ▂▄▆█ 84%   512M/2G   1.2M/3.4M  up 3d
```

**Ruled B's consequence:** nothing special happens to the transcript, and the live block
catches it because it polls. **One deliberate frame-read confirms it** — run a container,
watch the dashboard, see it appear without being told to. If it does not, that is a finding
about the live block's refresh and it is worth having.

---

## Frame 7 — `/exec`, the three states of a handoff

The handoff is the only place the frame *goes away*, so it is worth drawing all three.

```
── before ─────────────────────────────────────────────────────────
❯ /exec api-gateway sh

── during: the frame is torn down, sh owns the terminal ───────────
/ # ls
bin  dev  etc  usr  var
/ # exit

── after: the frame repaints whole ────────────────────────────────
❯ /exec api-gateway sh

  ✓ exec exited 0                                              12.4s
```

**The repaint is the thing to read.** C03's `contaminated` full repaint runs on resume, and
a partial repaint after a child has written over the screen is the defect this exercises.
Read the frame *after* rather than the call order.

---

## Frame 8 — the empty and error arms, which run least

Written first, per step 4's lesson: three error documents, two shipped, none ever run,
91 rows agreeing with all three.

```
❯ /network ls                    (nothing but the defaults)

  NAME      DRIVER    SCOPE
  bridge    bridge    local
  host      host      local
  none      null      local

  3 networks · none user-defined

❯ /volume ls                     (genuinely empty)

  no volumes

❯ /pull nonexistent:latest

  ▲ pull failed
    Error response from daemon: pull access denied for nonexistent,
    repository does not exist or may require 'docker login'
```

**`no volumes` is a notice, not an empty table.** The empty-block class, fifth instance —
absence of output is the same picture as failure to produce output, so say which.

---

## What is drawn and what must be checked

| | status |
|---|---|
| the confirm layer, its keys, where it sits | **drawn — safe.** Calcium blocks, known |
| which verbs confirm and which do not | **drawn — ruled.** Frame 2 |
| the progress and steps layouts | **drawn — safe.** The composition is a layout decision |
| the handoff's three states | **drawn — safe.** The mechanism exists |
| every field name and column | **`CHECK`.** Run the command first — eight F11 instances say so |
| `--format json` availability per verb | **`CHECK`.** Three already do not emit it |

---
---

# Part IV — the operational things

Four practical matters that will otherwise interrupt the build. The first bites in the
first hour of step 9.

---

## 1 — Destructive verbs eat their fixtures ★

**A test that stops a container cannot run twice.** `make fixtures` brings up four
containers; step 9 stops them, step 10 removes them, and every subsequent run of the suite
is testing against a daemon in a different state than the last one.

This is new. Everything up to step 8 was **read-only** — the fixtures survived, so a fixture
set created once served every test.

**Ruled: destructive tests create their own subjects, per test, with a unique name.**

```
dtui-fixture-*     the read-only set — long-lived, made by `make fixtures`, never mutated
dtui-throwaway-*   created by the test that will destroy it, removed in the same test
```

Three consequences worth stating rather than discovering:

- **The teardown must survive a failing test.** A test that creates a container and asserts
  before removing it leaks one on every failure. Removal goes in the equivalent of a
  `finally`, and the fixture script gains a sweep for orphans matching the prefix.
- **Parallel tests must not share a name.** A timestamp or a counter in the name, or two
  tests racing to remove the same container produce a flake that reads as a product defect.
- **`prune` is the hard one** — it is global. A `system prune` in a test removes *everything*
  unused, including another test's fixture. **Ruled: `prune` tests run against explicit
  filters or not at all** (`--filter label=dtui-test`), and a bare `system prune` is exercised
  by hand in a frame-read, never by the suite.

**And the read-only set must be re-creatable mid-suite**, because a mutation test that
misfires will eventually take one. `make fixtures` should be idempotent — create what is
missing, leave what exists.

---

## 2 — The manifest at fifty verbs

`manifest.ts` is 140 lines for twelve verbs. Forty more is ~500, and one file of five
hundred lines of declaration is where a wrong flag hides.

**Sub-verbs already work**: `name: "container stats"` — *"spaces mean sub-verbs"* — and
docker-tui uses one. So `/network ls`, `/volume prune`, `/image history` need **no new
mechanism**, which is one fewer thing to design.

**Ruled: split the manifest by family, one file each, composed in `manifest.ts`.**

```
manifest/read.ts        ps · stats · inspect · logs · diff · top · port
manifest/lifecycle.ts   start · stop · restart · kill · pause · unpause · rename · update
manifest/destructive.ts rm · rmi · prune · * prune
manifest/registry.ts    pull · push · build · images · image *
manifest/resources.ts   network * · volume * · context * · system *
manifest/exec.ts        run · create · exec · attach
manifest.ts             composes them, and is the only file that exports
```

The families match the steps, so each step touches one file.

**Shared flags are a constant, not a repetition.** `--force`, `--all`, `--quiet` recur across
many verbs; declare each once as a `FlagDef` constant and spread it. A hand-copied flag that
drifts in one verb is the two-records-of-one-fact class, and forty verbs is forty chances.

---

## 3 — `/help` at fifty verbs stops working

It renders every verb with its summary. That is a readable list at twelve and **a wall at
fifty** — and `/help` is the framework's own front door, so a demo where it is unusable
argues against Calcium rather than for it.

**Three options, and the ruling is worth taking now rather than at step 12 when it breaks:**

- **Group by family**, with the family name as a rule or a panel title. The families already
  exist for the manifest split, so the grouping is free.
- **Two levels** — `/help` lists families, `/help lifecycle` lists that family's verbs.
  Cleaner at fifty, and it makes `/help` a verb with an argument, which the manifest can
  already express.
- **Leave it flat and let it scroll.** Honest, and it is the option that makes the surface
  worse the more the app can do.

**Take the first**: grouping costs the manifest split you are doing anyway, keeps `/help` a
single answer, and the panel-per-family is a composition Calcium renders well.

**And it interacts with the open `/help` finding** — the bucketing question from the theme
investigation. Resolve that first, since a grouping built over a broken bucket inherits it.

---

## 4 — Reporting cadence, and the line budget

**Report per step, not per verb.** Five steps, and each has a natural close: step 9 when a
container actually stops with a confirm, step 10 when a prune shows what it will delete,
step 11 when a build streams, step 12 when the tail is green, step 13 when `exec` hands over
and comes back.

**Stop and ask only for the standing list's exceptions** — a total blocker, or a translation
that would need the shim to parse rather than rewrite. Everything else is ruled in Part II.

**And the line budget: restate it or retire it.** R01's 300 lines was set for a four-verb
proof and the app is at 1,896 for twelve surfaces. At fifty verbs it will be near 5,000, and
a budget exceeded sixteen-fold is not a signal any more — it is a number people learn to
ignore.

**Ruled: retire the total, keep the ratio.** The useful measure was never the absolute — it
was *how many lines are generic things Calcium should have provided*, which is what produced
the fifty-line list in step 2 and `metaOf` as a sixth entry. **Report that per step**: of
the lines added, how many are docker's shape, how many are the app's logic, and how many
would not exist if the framework provided something. The last number is the finding.

---

## The last word

Sixty-six findings came out of twelve surfaces, and **not one came from a test written to
look for it** — four from frame-reads, three from writing forty lines as a second consumer,
two from mutation, one from a diff read because an untouched file appeared in it, and one
from going to check a claim and finding it had never been written down.

**Forty more verbs will not repeat that rate**, and expecting them to is the wrong bar.
Steps 9, 11 and 13 have novel shapes and should each find several. Step 12 will find almost
nothing, and that is fine — it is where the sentence *"a complete docker client in under
5,000 lines"* comes from, and that sentence is worth a step on its own.
