# S10 and S11 — the walk

`/diff`, `/images`, `/top`, `/port` and `/events`, walked before any of them was built.

**Two artefacts, because the five verbs are not one shape.** Four of them are one call
and one document: no state, all structure, so the classification table carries them
(§8a). `/events` has a tick, a buffer and a window, so it gets the sequence trace (§8b).
Taking one artefact because five verbs arrived in one step is how the structural half
goes unexamined — CLAUDE.md's ruling, and the reason C19's `--flag=value` defect
survived a trace with plenty of rows.

**The premise check came first and it is the headline.** Step 6's brief calls these four
"mechanical … the risk is low and the value is coverage". Measured against the real
daemon, **three of the four far-side verbs do not emit JSON at all**, and one of the three
fails in a way that blames the container rather than the flag.

| verb | `--format json`? | what comes back |
|---|---|---|
| `docker images` | **yes** | NDJSON, one object per image |
| `docker diff` | **no such flag** | `C /run` · `A /run/nginx.pid` · `D /x` |
| `docker top` | flag exists, **means ps options** | column-aligned text; `--format json` → `ps: error: unknown user-defined format specifier "json"` |
| `docker port` | **no such flag** | `80/tcp -> 0.0.0.0:8080` |
| `docker events` | **yes** | NDJSON |

So `/images` is the only one of the four that reuses the `/ps` machinery as the brief
predicts. The other three are the same wall `/logs` hit, met three more times before any
of them ran — which is the argument for measuring the far side before calling a batch
mechanical.

---

## §8a — the classification table

Rows are cells where **two correct statements overlap**. A row governed by one rule is
that rule restated and finds nothing.

### A1 — Calcium's `--json` meets a verb with no `--format` flag

*Calcium appends `--json` to every invocation* (C06 I4, `transport/argv.ts`) meets *the
shim translates it into docker's `--format json`* (F1). Both hold. Their overlap is
`docker diff <c> --format json` → `unknown flag: --format`, exit 125, and the same for
`port`.

**Ruling: the shim gains a list of verbs that have no `--format`, checked before the
translation runs.** Not a fourth per-verb `case`: `logs` already strips the pair by hand
further down, so the general form *replaces* code rather than adding it. `diff`, `top`,
`port` and `logs` are the list; every other verb translates as before.

The blind spot, stated: **the list is a fact about docker's CLI and nothing checks it.**
A docker release that gives `diff` a `--format` flag leaves this stripping something that
would now work. It is a shim, it is deleted whole when F1 closes, and a stale entry costs
one verb's JSON rather than correctness — but it is the second list in this file that is
true of one docker version.

### A2 — `docker top`'s `--format` is not a format flag

*A docker verb takes `--format json`* meets *`docker top CONTAINER [ps OPTIONS]` passes
its tail to `ps` inside the container*. The two rules are indistinguishable at the call
site and the overlap is the interesting cell: `--format json` is **accepted** by docker,
handed to `ps`, and rejected by `ps` — exit 1, stderr
`ps: error: unknown user-defined format specifier "json"`.

**This is the row that would have cost an afternoon.** The other two say `unknown flag`
and name the shim in the first sentence. This one names `ps`, and a reader with an error
about a user-defined format specifier goes looking at the container's userland. Same
remedy as A1, and it is recorded as a finding because the remedy is not what is
interesting about it.

### A3 — empty output meets exit 0

*A failed invocation is an error document, not an empty table* (ADAPTER_WALK A3) meets
*`docker diff` on a container that has written nothing prints nothing and exits 0*
(measured: `dtui-quiet`, an `alpine sleep`, zero lines, rc 0).

Fourth instance of the empty-block class — after `/drift`'s all-identical frame, `/config`'s
two sides agreeing, and `/logs`' container with no output. **Ruling: an empty result
renders a muted notice saying so in words, never an empty block.** `b.table`'s
`emptyMessage` carries it for `/images` and `/top`; `/diff` and `/port` build the notice
themselves, because neither uses a table.

### A4 — `/port` empty means two different things, and neither is a failure

A3's shape with a twist that no previous instance had. Measured:

| container | `docker port` | exit |
|---|---|---|
| publishing nothing | *(empty)* | 0 |
| **stopped**, published `-p 8080:80` when it ran | *(empty)* | 0 |
| running, `-p 8080:80 -p 127.0.0.1:9090:443` | 3 lines | 0 |

Every previous empty-block row was *empty* against *failed*. This one is **two successful
worlds with one rendering**, and the verb cannot tell them apart: an adapter is handed one
result, and distinguishing them needs `docker inspect`, which is a different verb.

**Ruling: the empty notice names both worlds rather than picking one.** *"no published
ports — a stopped container reports none either"*. Saying only "no published ports" is a
claim about the container's configuration that the verb has not established, and it is
false for exactly the container a reader is most likely to be asking about.

### A5 — `b.kv`'s `Record` meets a port with two bindings

*S11 draws `/port` as keyValue, each mapping a row* meets *a published container port has
one binding per address family*. Measured on `-p 8080:80`:

```
80/tcp -> 0.0.0.0:8080
80/tcp -> [::]:8080
```

`KeyValue.rows` is `readonly { label; value; tone? }[]` — an **array**, duplicates
expressible. `b.kv` takes `Record<string, string | KeyValueInput>` — duplicates **not**
expressible, and a record built by `reduce` drops the first silently.

C24 §5 does document a narrowing here, and it is a different one: `KeyValueInput` is
narrower than `CellInput` because `KeyValue` rows have nowhere to put a glyph. *That*
narrowing is a ruling. The `Record` container is unremarked, and it is strictly narrower
than the block it builds.

**Ruling: a Calcium fix, spec first, with this verb as the consumer proving it** — the
F27 standard, and the same shape as F27 exactly: the block implements it, the builder is
the only thing in the way. `b.kv` gains an array arm; the record arm stays, because it is
the right call for the twenty-odd sites that have unique labels.

The alternative was a two-column table, and it is worse for a stated reason: it abandons
the drawn surface because of a builder limitation, and the next consumer meets the
limitation again with nothing written down.

### A6 — `docker top`'s columns meet a command line containing spaces

*Split a column-aligned row on whitespace* meets *`CMD` is a command line*. Measured, the
devcontainer's PID 1:

```
root 28124 28101 0 Aug04 ? 00:01:16 /bin/sh -c echo Container started trap "exit 0" 15 …
```

**Ruling: split at most `n - 1` times, where `n` is the number of headings on the header
row** — read from the output, never a constant. The header is data: `docker top` prints
whatever `ps` printed, and a hard-coded eight is a claim about a `ps` implementation
inside somebody else's image.

### A7 — `<none>` meets *render what docker sends verbatim*

*Docker's strings are not ours to normalise* (the `Ports` ruling, R01 §4) meets
*`<none>` is docker's word for absent, not a repository name*. Measured against an
untagged image: `"Repository":"<none>"`, `"Tag":"<none>"`.

**Ruling: `<none>` renders as `—` muted, in both columns**, which is what `/ps` already
does for a container with no ports. The verbatim rule is about *values*, and `<none>` is
docker's null. A dangling image's identity is then its `ID`, which is on the row —
**assert identity, not position** applies to the test as well as the reader.

### A8 — `Size` is already formatted, and the drawing asks for formatting

S11 says *"Size formatting"*. Docker sends `3.37GB`, `92.8MB`, `13.5MB` — already
human. The overlap with *do not parse the far side's display strings* is the `Ports`
lesson again, one verb over.

**Ruling: verbatim, and the `SIZE` column is not `sortable`.** Sorting is what would force
a parse, and a lexicographic sort over `3.37GB` and `92.8MB` puts the megabyte first while
looking like it worked. A column that sorts wrongly is worse than one that does not sort.

### A9 — `docker diff`'s `C` on a parent directory

*Map docker's three change types exactly* (S10) meets *a directory shows as changed
because a child was added*. Measured on nginx:

```
C /var/cache/nginx
A /var/cache/nginx/client_temp
```

So `1 modified` counts a directory whose own content did not change.

**Ruling: count verbatim, prune nothing.** Pruning would be the app inventing a model the
far side does not have, and the reader who runs `docker diff` sees the same list. S10's
own drawing shows `~ /var/log/nginx modified` directly above
`+ /var/log/nginx/access.log added`, so the drawing is already honest about it — which is
worth recording, because the instinct on first reading the real output is that it is
noise.

### A10 — `+ - ~` meet the glyph vocabulary

S10 draws `+` added, `-` deleted, `~` modified. C04's `Glyph` union has thirteen slots and
none of them means *added*.

This is F6's shape a third time (`▪` for paused, and S5's footer key). **And here the
type answers it in its own doc comment**: *"Anything outside this vocabulary goes in the
block's text"*. So `+`/`-`/`~` are text on the cell, the tone carries `ok`/`error`/`warn`,
and nothing is filed — the framework already ruled this and said where such a character
goes. Recorded because *checking whether it was already ruled* is the step that was
missing the first two times.

---

## §8b — the sequence trace, `/events`

### The decision, and the measurement that changed its shape

Step 6 offers three shapes. **The ruling is (a) — the adapter accumulates — and one
measurement makes it stronger than "try it first and see".**

(b)'s premise is *`docker events --format json` IS a stream*. True, and **optional**:

```
$ docker events --since 10m --until 0s --format json
… 82 objects, exit 0
```

`--until` terminates it, and **both bounds take relative durations**, so the app reads no
clock — which matters, because the app has no clock to read (C07 I1; `history.ts` counts
tick indices for the same reason). With the lifecycle filters the window is small:
`--filter type=container` plus the ten lifecycle actions gives **20 events and 10 KB over
two hours**, against 82 events and ~330 KB unfiltered — the unfiltered bulk being
`exec_create`/`exec_start`/`exec_die` from this very session, which is noise on a surface
titled *container lifecycle*.

So `/events` is a **request/response verb that returns a window**, not a stream that must
be followed. (b) is a choice rather than a constraint, and (a) is available with no
awkwardness at all: `b.live`'s `fetch` is app-supplied, and the ring buffer that S3 built
for gap 1 is the second half.

**What this does to gap 2, which is the finding rather than the verb.** Gap 2 was filed as
*a live table that appends* — between "one live block that refreshes" and "a new entry per
event", and named as the thing that might need a Calcium primitive. The premise underneath
it is that the far side produces only deltas. It does not:

> **Before asking for an append primitive, ask whether the far side can be asked for a
> window.** A window is a snapshot, and a snapshot is what `b.live` is for.

The limit, stated rather than left for someone else to find: this holds for a source with
a bounded historical query and **fails for one without**. `docker logs` has no `--until`
that leaves the follow running, which is exactly why S9 went the view+streams route. So
gap 2 does not survive as filed — **both halves have an answer and neither is an append
primitive**: a source with history is a window through `b.live`, and a source without one
is C22 I48's route.

Second instance of an adapter accumulating, after S3's ring. Two instances are the minimum
for noticing a rule and not evidence for it (CLAUDE.md), so the general form above is
written as a question to ask, not as a classification to apply.

### The trace

Ticks are `T`, each `fetch` a window `[now-10m, now]` deduped into a ring capped at `CAP`.

| # | sequence | what must happen | why it is a row |
|---|---|---|---|
| E1 | T1 → T2, no new events | the block is identical; no flicker | *fetch replaces* meets *the ring accumulates*: the window returns the same 20 objects and the ring must not grow |
| E2 | T1 returns e₁; T2's window still contains e₁ | one row, not two | a rolling window re-fetched every tick re-delivers almost everything it delivered last tick, so the dedupe is the mechanism rather than a guard — E8 covers what the key has to be |
| E3 | an event ages out of the 10m window, still in the ring | it stays on screen | *the window is the fetch* meets *the ring is the record*. Getting this backwards makes the list silently forget at ten minutes, and nothing on screen would say so |
| E4 | the ring fills | oldest dropped, newest kept | newest-on-top is the surface's order, so the drop is off the *bottom* — the opposite end from the one the reader is watching |
| E5 | a tick's `docker events` rejects | the ring is unchanged and the previous events still render | S3's stall lesson: a failed fetch must not read as "nothing happened" |
| E6 | the daemon has produced no lifecycle events at all | a muted notice, not an empty block | A3's class inside a live block. `eventsDefinition.measure` is `atLeastOne(length)`, so zero events still occupies a row and draws **blank** — the exact frame that reads as a broken fetch |
| E7 | the first frame, before the first tick | the events in hand, not `loading…` | the dashboard's `renderLoading` ruling, and the handler holds a window already |
| E8 | two events at the same `timeNano` | both kept | nanosecond collisions are not impossible across two daemon goroutines; the key is `timeNano` + action + actor id, so a genuine pair survives and a re-fetch of one event does not double |

### The block

`b.events` — `{ ts, type, message }` per line, a kind with **no consumer anywhere in the
tree until now**. `ts` is formatted from the event's own `time`, so no clock is read;
`type` is the action (`start`, `die`, `kill`); `message` is the container name and, where
docker gives one, the exit code.

`b.live`'s `render` returns `readonly Block[]`, so the tick returns **one `b.events` block
built from the whole ring**. A replace of an N-row block by an N+1-row block is what an
append looks like on screen, which is the whole of gap 2 in one sentence.

---

## §3a — what the implementation returned

*The walk rules the shape; the code is the first thing that can falsify it.* Every line
below was written after the thing it describes ran.

**A10 was wrong, and the framework is what said so.** The ruling was *the marker is text
and the tone carries the colour*, with S10's `ok` / `error` / `warn`. `b.row` threw: C04 I6
requires a glyph on `error` and `warn`, because *colour alone does not survive 1-bit or a
colour-blind reader*. The throw was right twice — a deleted file is a fact about a
container and not a fault, and the marker already carries the distinction without colour.
So the tones are now the slots that claim no severity, and the finding underneath is that
**a change axis has no home in a health palette**: gap 3's shape on a surface with no
numbers in it, and F30's other half one block over. F49.

**A9's ordering claim was positional and docker's order is not stable.** The test named
`client_temp` at index 3 and the next capture returned `proxy_temp`. What holds every time
is that the parent `C` precedes the children that caused it, which is the claim A9 was
actually making.

**Two things only the frame could say, and both are the same defect.** A column with no
`flex` is allocated its `minWidth` and nothing more.

- `/diff` drawn as S10 draws it — path, then the word — put `modified` at column 108 with
  an empty row between it and its path. Moving the slack to the word column truncated the
  path to twenty cells with eighty empty beside it. The fixed column goes first and the
  flexible one second, which is the only arrangement of two where both are read together.
  `/ps`'s NAME column carries this lesson in a comment in this repository; having read it
  did not prevent writing it again.
- `/top` with a flat `minWidth: 4` rendered `109…` for a PID and `sta…` for a user. The
  columns are not known in advance (A6), so their widths cannot be either — each asks its
  own content, through `cells` rather than `.length` (C24 I14). **The mutation for this
  failed nothing**, which indicted the tests rather than the code: T7 exists because of it.

**A5 landed as ruled.** `b.kv`'s array arm is C24 I18, and `/port dtui-port` shows `80/tcp`
twice on screen — once for `0.0.0.0` and once for `[::]`. The mutation that routes the
array back through a record turns three mappings into two.

**A7 landed as ruled**, and the frame is where it is visible: an untagged image renders
`—  —  dfaaf8991346`, its ID the only identity it has.
