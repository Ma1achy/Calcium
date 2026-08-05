# docker-tui — surface designs

> **This is the design, not a description of what was built.** It was written before any
> of it existed, and the app is complete: `examples/docker/README.md` describes what runs.
> The drawings here are kept **as drawn**, corrections marked in place, because
> **being wrong about a drawing is the most-instantiated finding in the project** and a
> document rewritten to agree with the code destroys the evidence for it.
>
> **[The corrections index](#appendix--the-corrections-index) is at the bottom, and it is
> the reason to read this file.** Nineteen corrections across twelve surfaces, each one a
> claim that looked right until something was measured — and four of them are still owed,
> because the finding landed after this document was last touched.

The complete, self-contained design. Twelve surfaces, every frame drawn in place, the
reasoning for each choice, the build order, and the seven predicted gaps. This supersedes
the earlier sketch and drafts — read only this.

Grounded in three decisions: **dense rows** (many containers fit), a **composed landing
dashboard** (shown before any command), and **real tool that demos well** (density over
decoration, every frame useful).

Local resolution: `"@fmx/calcium": "file:../calcium"` in `docker-tui/package.json`,
imported from the three entry points as the probe was. R01-honest — a built package, not
the source tree. Real docker, subprocess transport; `docker … --format json` is the far
side and the adapter turns it into blocks.

---

## Full feature coverage

Every Calcium block and mechanism, and the surface that shows it. `✓✓` = shown at its best.

```
table + drop        S2  /ps                       ✓✓  CP6 shown live — no other tool has this
b.live in a view    S3  ⏎ drill-in (HEADLINE)      ✓✓  the composition the framework built toward
b.live in an entry  S4  /stats · S1 landing        ✓✓  the tested host, the stable baseline
plot (C12)          S3 · S4 --graph                ✓✓
comparison (a/b)    S6  /compare · S7 /drift        ✓✓  two-column before/after
patch (real hunks)  S8  /config                     ✓✓  hunks + context + syntax
code + syntax       S5  /inspect --raw              ✓   lowlight over real JSON
pushed view         S3 · S9 /logs                   ✓✓
pills + tone        S1 landing · S2 /ps             ✓✓
keyValue            /port · headers                 ✓
completion          used: /inspect <tab>            ✓   shown by using the shell
reverse search      used: ⌃r                         ✓
history             used: ↑                           ✓
the confirm         S2 stop/start                   ~   forces the open ruling
```

---

## S1 — the landing dashboard (no command)

The home screen and the opening shot. **Not** a pushed view — it is the **live block on
launch**: `b.live` parts composed with static panels, refreshing in place. It is an
ordinary transcript entry, so `/clear` removes it and it scrolls away as the session fills.

**It does not stop refreshing when a command is typed, and the earlier drawing said it
did.** *"Typing a command freezes it into the transcript"* was a claim about a mechanism
that does not exist and must not: C23 I9 is that a frozen entry keeps receiving patches
until settled, I33 lists five teardown triggers **and not freeze**, and C24 §5 records its
own *teardown on freeze* row being deleted against I9 — *"freezing is not stopping; a
`--watch` scrolled out of view is still running, which is the whole of what I9 protects."*

Freezing in C13's sense (I2) is a **display** property: the newest entry is `live`, and
appending a later one makes the previous one not-live. That is what the transcript model
says and all it says. A landing block you can scroll back to and find still current is the
better behaviour anyway; the cost is that it polls until eviction, and that cost is the
price I9 knowingly pays.

**F11's class, fifth instance** — a drawing asserting behaviour, this time contradicting a
settled invariant rather than the far side's output. It was caught because the fix it
implied was checked against I9 *before* being built; building it would have re-introduced a
row that had already been deleted for cause. FINDINGS F17.

**This is a real frame now**, captured from the running application at 120 columns and
replayed through a terminal emulator — not a drawing. It is kept in preference to the
sketch that was here because three of the sketch's claims were things Calcium does not do,
and the differences are listed underneath.

```
┌ docker-tui · engine 29.4.1 · 14 containers ──────────────────────────────────────────┐
│┌ RUNNING ───────────────────────────────────────────────────────────────────────────┐│
││7 running · 1 paused   CPU 101% · MEM 4%                                            ││
││                                                                                    ││
││NAME                      CPU                MEM                USAGE               ││
││● dtui-api                ░░░░░░░░ 0.0%      ░░░░░░░░ 0.1%      9.434MiB / 7.75GiB  ││
││◌ dtui-busy               ░░░░░░░░ 0.0%      ░░░░░░░░ 0.1%      9.438MiB / 7.75GiB  ││
││● dtui-cache              ░░░░░░░░ 0.3%      ░░░░░░░░ 0.2%      17.43MiB / 7.75GiB  ││
││● dtui-extra3             ▲ ████████ 100.5%  ░░░░░░░░ 0.1%      9.293MiB / 7.75GiB  ││
││● reverent_proskuriakova  ░░░░░░░░ 0.2%      ░░░░░░░░ 3.0%      216.5MiB / 7.75GiB  ││
││… 3 more                                                                            ││
│└────────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                      │
│beautiful_booth  condescending_cohen  dazzling_wozniak  distracted_davinci  dtui-gone │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

At 80, `USAGE` drops and the pills wrap; `NAME`, `CPU` and `MEM` hold.

**Four differences from the sketch, each a finding rather than a compromise.**

1. **There is no `▌`.** `b.live` returns a panel and the driver rebuilds it as a panel, so
   a live region is a box with a title — visually identical to a static one until it
   changes. C09's glyph table has a `live` slot (`▌` / `|`) and nothing renders it, and the
   app must not write the character itself or it will not degrade. FINDINGS F18.
2. **The counts and totals are in the body, not the title.** A live part's title is
   captured once at declaration and never re-rendered, so anything that varies freezes
   there while the rows tick. F16.
3. **The panel nests, costing two borders.** The live part is a panel inside the outer
   panel; the sketch drew one box with a gutter.
4. **Everything that ticks is a poll**, not a stream, and the app runs `docker` itself:
   `b.live`'s `fetch` has no adapter or transport between it and the far side. F10.

**Exercises in one frame:** panel, `b.live` (the running block), the summary line, pills
with tone (stopped), value bars, tone and glyph (running/paused/hot), and the
collapse-the-tail density decision. **The screencast's first five seconds**, doing almost
everything Calcium does at once.

`system info` = the engine version + container counts in the outer panel's title, one
line — and that title is static, which is the only reason it may hold them. A welcome
screen that is mostly chrome is the thing density is chosen against.

**And the collapse chooses by load, not by name.** Showing the first five of a
name-ordered list hid the busiest container on the machine behind `… 3 more`. Selection is
by significance; display order is alphabetical so rows do not move between ticks. Two jobs,
two orders — conflating them is invisible until a frame has an outlier in it.

**`no command` is real now.** The frame above is what launch draws with nothing typed —
`config.greeting` fired at C22 §4 step 7, appended by C23 like any other document, so
`/clear` removes it and it scrolls away. F9, closed.

The part **ticks until the entry is evicted or the transcript is cleared**, not until the
first command. An app that wants launch cheap omits `every` and gets a one-shot; that is
the app's decision rather than a lifecycle the framework implements, and the alternative is
the row C24 §5 deleted against C23 I9.

### What the far side actually supplies, and the two corrections it forced

Checked before the rulings rather than after — F4's lesson applied forward, and it changed
the drawing twice.

**The header's CPU total is a sum, not a utilisation.** `CPU 34%` read as *the machine is a
third busy*, and docker cannot say that. `stats` gives `CPUPerc` per container,
per-core-normalised, so a single busy container on an 8-core host reports `780%` and the
sum has no ceiling. `MemPerc` is a genuine fraction of host memory and does total to
something meaningful. So the drawing now shows `CPU 340%`, which looks wrong and is right,
and the two figures are **not** the same kind of number despite sitting side by side. Naming
that here is cheaper than a reader inferring a denominator that does not exist.

**The panel joins two sources.** `docker stats --no-stream` reports **running containers
only**; the stopped pills come from `docker ps -a`. Naming a stopped container explicitly
returns a row of zeros rather than nothing, which is worse than an omission — absent and
zero are different, and only one of them is a fact about the container. So RUNNING is
`stats`, STOPPED is `ps -a`, and the count in the header is the sum of two calls.

**And the live block polls; it does not stream.** `docker stats --format json` without
`--no-stream` interleaves `ESC[H` / `ESC[K` / `ESC[J` with the JSON and redraws a region —
a presentation of data, not data. Consuming it would put a terminal emulator inside an
adapter. `b.live`'s `fetch` arm on an interval, against `--no-stream`. FINDINGS F10.

---

## S2 — `/ps` (the table, the drop showcase)

The full table, and where responsive columns are shown. A bare table entry — the table
*is* the content.

```
❯ /ps

  NAME          IMAGE              STATUS        PORTS                   CPU     MEM
  api-gateway   nginx:1.25         ● Up 3 days   0.0.0.0:8080->80/tcp,…  84%    512M
  postgres      postgres:16        ● Up 12 days  0.0.0.0:5432->5432/tcp  8%     1.1G
  redis         redis:7-alpine     ● Up 12 days  6379/tcp                2%     40M
  worker-1      myco/worker:v4     ● Up 3 days   —                       41%    256M
  migrate       myco/migrate:v4    ○ Exited (0)  —                       —      —

  9 running · 5 stopped · /ps -a shown
```

**The `PORTS` column above is what docker emits, not a tidied version of it**, and the
earlier drawing here was the tidied version. It showed `80→8080, 443→8443`; docker sends
`0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` — forty characters for one published port, with
an IPv6 twin for every IPv4 entry. Reaching the old drawing from the real string means
parsing it, which R01 commitment 5, R1.4 and R5.2 forbid outright: *a parser would be
wrong within a release*, and R5.2 is the fail-on-revert test that says so.

A drawing is a claim about output, and this one was a claim no adapter obeying R01 could
satisfy. It is corrected rather than annotated, because the next reader builds against the
picture.
**At 80 columns:** `PORTS` drops first (low priority), then `MEM`, then `CPU`; `NAME` and
`STATUS` never drop. Narrow the terminal live and the columns shed in priority order.
**CP6 shown rather than tested** — the single clearest demonstration of a Calcium
capability no other tool has.

`STATUS` never truncates (a half-word reads as a different word); `PORTS` truncates from
the **end**; `→` is the ASCII-degradable arrow.

### The `PORTS` ruling, and the thing it got wrong first

**The rule is: a column keeps the field's identifying end**, and which end that is belongs
to the field rather than to the table. `ColumnDef.truncateFrom` is named for the operation for
exactly this reason (C04 I30) — `"end"` and `"start"` say which side characters are
*removed* from, so every column answers separately. For a name the head identifies and the
tail is a hash; for a path the leaf does.

**For `PORTS` the identifying end is the head, and establishing that took two attempts.**

The first ruling said *start*, reasoning that a mapping is `80→8080` and the host port is
the tail — the thing a reader would act on. Every step of that is sound and the premise is
false: `80→8080` is a drawing in this document, not a string docker emits. Docker sends
`0.0.0.0:8080->80/tcp`, where the host port sits near the **left**, and R01 forbids
reformatting it. Under verbatim rendering `truncate: "end"` yields `0.0.0.0:8080…` and
keeps the host port; `"start"` yields `…80->80/tcp` and loses it.

R01 R3.4 makes the same mistake from the other direction — *"truncated from the left,
keeping the host port"* is not satisfiable against this format, because the host port is
what is on the left. It is corrected there too.

**This is the class where an artefact is correct about the interaction it found and wrong
about a mechanism it assumed existed.** The interaction was real — two specs disagreeing
about one column — and the remedy rested on a format nobody had checked the far side
against. The finding survived; only the answer changed. It is also the reason a
classification table is written against **captured output** rather than against the
drawings in the spec it is testing: the row `Ports` long meets `truncate` cannot be
decided from a document that shows a string the far side never sends.

Row actions (focused row) — the **drill-in surface** into S3:

```
⏎ watch    → the live single-container view (S3)   ← the headline
l logs     → pushed streaming view (S9)
d drift    → what changed from the image (S7)
⚡ stop / start   → exec + confirm (open item)
```

---

## S3 — ⏎ on a container: the live single-container view **(HEADLINE)**

The demo's centre of gravity and the strongest composition in it. `⏎` on a `ps` row
pushes a view that **refreshes in place** — the prism `--watch` equivalent, built from
drill-in + `b.live` + plot + the fullscreen view at once.

```
  ┌─ api-gateway ──────────────────────── ● running · up 3d · nginx:1.25 ─┐
  │                                                                        │
  │  CPU %                                              ▂▄▆█████ 84%       │  ← b.live part: plot, ticks
  │   100 ┤                          ╭╮                                    │
  │    75 ┤                    ╭╮ ╭──╯╰╮                                   │
  │    50 ┤          ╭─╮   ╭───╯╰─╯    ╰──                                 │
  │    25 ┤────╮ ╭───╯ ╰───╯                                              │
  │     0 ┼────╰─╯                                                        │
  │       └───────────────  60 ticks · 2s each · 2 returned nothing        │
  │                                                                        │
  │  MEM   ████░░ 512M / 2G · 25%        NET   ↓1.2M ↑3.4M                 │  ← b.live part: bars + kv
  │  PIDS  24                            BLK   0 / 4.1M                     │
  │                                                                        │
  │  PORTS  80→8080 · 443→8443          MOUNTS  /data · /etc/nginx (ro)    │  ← static: does not tick
  │                                                                        │
  └─ n/p scroll · L logs · d drift · esc back ──────────── updated 1s ago ─┘
```

**The axis says ticks, not seconds, and the drawing used to say `-60s ──── now`.** There is
no clock on this path — docker emits an instant with no timestamp and `AdapterContext`
carries none (C07 I1) — so the ring is keyed by tick index, and a duration label would be a
claim it cannot support. It is true while the driver ticks on schedule and quietly wrong
across a stall, which is the exact period someone opens this view to look at. So the caption
reports the tick count **and** how many returned nothing, and the reader does the
multiplication knowing what it rests on. `S3_WALK.md` A2.

**How it is built:** the view is pushed once. The CPU plot and the MEM/NET block are each
`b.live` parts the refresh driver ticks; the ports/mounts block is static and does not
refresh. `esc` pops back to `ps`. The plot fills over a rolling window; the header shows
live uptime.

**The `⏎` above is compressed notation, and reading it literally was a mistake — F11's
sixth instance, and the first about the framework's own model rather than the far side.**
`B03_drill_chain.md` §2 is explicit that there are exactly two ways down and that confusing
them is what it exists to prevent: **`⏎` on a row appends**, and push is reached by a verb.
Its canonical path shows the real gesture in two steps — an action `fill`s the prompt with
`/container stats <uuid>`, and the *next* `⏎` submits it and pushes. S3 is reached exactly
as the logs view is.

**And the verb is not `ps <uuid> --watch`, which is what this said and what C05's own doc
comment said.** `docker ps` takes no positional argument, `--watch` is not a docker flag,
and C06 I4 sends argv to the far side verbatim — three facts that make the drawing's verb
unspawnable, none of which was checked when it was written. `docker container stats <id>`
is real, takes the id, and leaves `/stats` free for S4, which S02 reserves for a **transcript
entry**: a tool-level `view` on `stats` would have pushed S4 as well. Corrected in place
rather than noted, because the next reader builds against the picture. What S3 does have is A01 D4's qualification for *being* a pushed view: it
needs the whole screen and its own letter keys (`n`/`p`, `L`, `d`), so the prompt must go.
FINDINGS F21b.

**This composes:** drill-in (C25 view push), `b.live` (part refresh), plot (C12), the
fullscreen view's scroll, tone, keyValue. Nothing else in the terminal-tool space does a
live focused dashboard inside a navigable shell. **Lead the screencast with clicking a
container and watching it breathe.**

### The seam this tests — gap 7, answered before it was probed

**This section used to say the driver shipped tested against an entry host only. It did
not.** FINDINGS F20 has the evidence and the corrected answers:

- **Does `declare` accept a `view` host and tick it?** Yes, and has since C23 §3b —
  `test/contract/refresh.test.ts:535`, T4.21, cited to C24 I12.
- **Does `release` on pop reach it?** No call site exists. A popped view is torn down one
  tick late, when `put` returns false against a layer that has gone.
- **Does a refresh hold the scroll?** The question has no subject. C15 holds no offset by
  design and the producer owns it; there is no producer.

What is absent is a **producer**, not coverage: `declare`'s single call site in `src/`
hard-codes an entry host. So all three trace to **C22 §13's reserved ruling** — *a verb
whose result is a pushed view* — which S3 is the first concrete case to force, and which
step 3 settles rather than files.

**The single most valuable thing docker-tui surfaces**, and for a better reason than the
one first given: not an untested arm, but the largest decision the framework deliberately
left open for a consumer to force.

---

## S4 — `/stats` (the dense live table)

The standalone version — the "one row each" dashboard, many containers at once,
refreshing. `b.live` in a **transcript entry** (the tested host), so it is the stable
baseline S3 is the ambitious sibling of.

```
❯ /stats

  ▌ CONTAINER      CPU              MEM %        NET I/O        BLOCK I/O    PIDS
  ▌ api-gateway    ▂▄▆█████ 84%     ████░░ 25%   1.2M / 3.4M    0 / 4.1M     24
  ▌ postgres       ▁▁▂▁     8%      ██████ 55%   880k / 12M     8.2M / 45M   18
  ▌ redis          ▁▁▁▁     2%      █░░░░░  8%    120k / 4M      0 / 1.2M      6
  ▌ worker-1       ▃▅▃▄    41%      ████░░ 25%   2M / 8M        1M / 22M     12
  ▌ worker-2       ▄▄▅▄    38%      ████░░ 25%   2M / 8M        1M / 20M     12
                                                              updated 2s ago
```

`b.live`, refreshes on interval, the driver patches the block, `▌` marks it live, the
title carries the age. **CPU is a sparkline** (accumulates history — gap 1); **MEM % is a
bar** (single value, no history). Both degrade: at 1-bit the sparkline stays (already
glyph-height), the bar stays, colour goes.

Add `--graph <c>` to promote one container's CPU to a full plot (S3's plot, standalone).

**The history is the app's, and its axis is ticks rather than seconds.** Docker emits an
instant with no timestamp, so both the sparkline here and S3's plot accumulate app-side —
gap 1, as predicted. What was not predicted is that `AdapterContext` carries no clock
either, deliberately (C07 I1: adapters read no clock). So the ring buffer is keyed by
**tick index**, and S3's `-60s ──── now` axis is `ticks × interval` — a label computed from
the interval the app chose, not a duration anything measured. True while the driver ticks
on schedule and quietly wrong across a stall, which is worth saying on the axis rather than
discovering in a screencast. FINDINGS F11.

---

## S5 — `/inspect <c>` (fullscreen view, structured + raw)

The C25 fullscreen view over deep JSON — the first real use of the view against real,
awkward, deeply nested data. **Two modes, toggled** — where syntax highlighting arrives.

**Structured** (default): a keyValue/patch block, the readable summary.

```
  ═══ api-gateway · inspect ══════════════════════════════════════════════════
   Id            7f3a2c14b9e0…
   State         ● running   started 3 days ago   pid 4471
   Image         nginx:1.25   sha256:a1b2…
   Mounts        /data → /var/lib/nginx  (rw)
                 /etc/nginx/conf.d → …    (ro)
   Network       bridge   172.17.0.4   gateway 172.17.0.1
   Ports         80/tcp → 0.0.0.0:8080
                 443/tcp → 0.0.0.0:8443
   Env           NODE_ENV=production
                 LOG_LEVEL=info   (+ 6 more)
  ─── n/p · g/G · r raw · esc back ────────────────────────────────────────────
```

**`--raw` or the `r` toggle**: the literal `docker inspect` JSON as a **syntax-highlighted
code block** — lowlight over real JSON, scrolled `n`/`p`/`g`/`G`. "Structured when you want
to read it, raw when you want to grep it." The nested structure (mounts, ports, env)
exercises the view's scroll over a single tall block, and the toggle is the only place the
code block and syntax highlighting appear.

---

## S6 — `/compare A B` (comparison block, two-column)

The comparison block doing its actual job — `a`/`b` side by side, differing rows marked.
`docker inspect A` vs `docker inspect B`:

```
❯ /compare api-gateway worker-1

  FIELD            api-gateway          worker-1
  image            nginx:1.25           myco/worker:v4
  cpu %            84%                  41%
  mem              512M / 2G            256M / 1G
  restart policy   always               on-failure          ▐ differ
  network          bridge               host                ▐ differ
  status           ● up 3d              ● up 3d
```

`a`/`b` positional (the ruling), the `verdict` column toning the rows that differ. The
two-column comparison the thin `docker diff` never showed.

**Two of those rows are not in `inspect`.** `cpu %` and `mem` come from `docker stats`, and
the drawing shows them beside five fields that come from `docker inspect` without saying
so. So `/compare` joins two sources per container — the same join S1's panel makes, reached
from the other direction, which is the argument for building S1 first. The other five rows
diff cleanly: two containers give two objects of the same shape. FINDINGS F11.

**Ruled in, not dropped.** `docker stats --no-stream A B` takes both containers in one call,
so the join costs one invocation rather than two, and S1 already makes exactly this join —
the code that reads `CPUPerc` and `MemPerc` is written and tested. Dropping the rows would
also drop the reason the surface is interesting: `docker diff` never showed a live figure
beside a configured one. What the drawing owed and never paid is *saying* it joins two
sources, and this paragraph is that debt settled.

**`/compare` uses the container path on both sides**, so the `derived` field kind — where
the two sides come from different paths, which is `ports` — collapses to a single path here.
That is the whole of why `/compare` is cheap once `/drift`'s field map exists, and it is
also why `/drift` is the harder surface despite looking like the simpler one.

---

## S7 — `/drift <c>` (comparison, image vs running) **(the comparison showcase)**

The strongest use of `comparison`, and the surface that shows the block at its best — a
genuine **before/after**: what has this running container changed from the image it was
built from. `a` = image default, `b` = live container.

```
❯ /drift api-gateway

  FIELD            image (nginx:1.25)   running
  ports            80                   80→8080, 443→8443    ▐ changed
  mounts           —                    /data, /etc/nginx    ▐ added
  env LOG_LEVEL    warn                 info                 ▐ changed
  user             root                 root
  entrypoint       nginx -g daemon off  nginx -g daemon off
```

**The `▐ added` above is a verdict `Comparison` cannot express.** Its union is
`"same" | "better" | "worse" | "changed"` (`viewmodel/types.ts`), with no `added` and no
`removed` — the drawing showed a mark the block has never had. So **absence goes in the
data, not in the verdict**: a field present on one side only renders `changed` with the
absent side as `—`, which is expressible today and says the same thing to a reader. Filed
rather than worked around by extending C04's union, because `same`/`changed` is a change
axis and `better`/`worse` a judgement axis — the union already mixes two, and adding a
third pair wants a ruling rather than a patch. FINDINGS F30.

**And `env` is a keyed set, which the drawing implies and never states.** `env LOG_LEVEL` is
one row for one variable; a container inherits every variable its image declares and adds a
few. So a keyed field yields **one row per key that differs or exists on one side only, plus
one muted `N identical` row** — the structural diff that is wrong at the top level is right
*inside* a field, where both sides genuinely have the same shape. That distinction is the
ruling; the row count follows from it.

The tally row is not decoration. Without it a container identical to its image renders as an
empty block, which is indistinguishable from a drift that failed — the same class as S3's
*"no details — the container has gone"*, predicted here rather than found in a frame.

`comparison` with a real before/after, differing rows carrying verdict tone. **The
comparison block's `/stats`** — the surface that demonstrates the feature at its peak, the
way S3 does for `b.live`.

### "Diff the fields" is the one thing this cannot do

The source line used to read *`docker inspect` the container, `docker image inspect` the
image, **diff the fields***. The two objects do not have the same fields, and the drawing's
own headline row proves it.

A key-union diff invents a `changed` row for every key on one side only, which is most of
them, and each would render as drift the container does not have.

**That was first written as *the image's `Config` carries `ExposedPorts` and `StopSignal`,
the container's does not* — a true observation promoted to a general claim.** It is true of
a *service* image and false of a *base* image, and the second measurement is what separates
the two:

| image | `ExposedPorts` | `StopSignal` | `Config` keys |
|---|---|---|---|
| `nginx:alpine` | `{"80/tcp":{}}` | `SIGQUIT` | 7 |
| `mcr.microsoft.com/devcontainers/typescript-node:22` | absent | absent | 5 |

**And the correction above was itself an inference from one measurement.** It read *the
asymmetry is one-sided here and two-sided against nginx* — inferred from the image key
counts without measuring nginx's **container** side. Measured, both pairs answer the same:

| pair | image-only keys | container-only keys | image ⊆ container |
|---|---|---|---|
| `dtui-web` / `nginx:alpine` | **0** | 12 | yes |
| devcontainer / `typescript-node:22` | **0** | 12 | yes |

**A container's `Config` is the image's inherited, then filled with runtime fields.** That
is the durable statement, and it is stronger than *the shape varies*: there are no
image-only rows to worry about at all, and a key-union diff invents exactly the twelve
daemon-filled ones — `Hostname`, `Domainname`, the three `Attach*`, `Image`, `StopTimeout`,
`Tty`, `OpenStdin`, `StdinOnce`, `Volumes`, `User`.

`ExposedPorts` proves it rather than contradicting it: `nginx:alpine` declares `80/tcp` and
the container carries the *same* `80/tcp`, inherited and identical. **So the ports drift is
not in `Config` at all** — it is `HostConfig.PortBindings`, which is why the row needs two
paths and why no walk of `Config` reaches it however thorough.

**Three passes on one sentence, and each pass was accurate about what it had measured.**
That is the failure worth naming: not error, but a true observation written at the scope of
a general claim. The rule that catches it is to measure the case that would falsify your own
falsification — applied here, it caught the second pass one iteration after the first was
corrected. FINDINGS F32.

The `ports` row is the clearest case. `80` comes from the image's `Config.ExposedPorts`;
`80→8080` comes from the container's `HostConfig.PortBindings` and `NetworkSettings.Ports`.
**Two different paths**, so no structural comparison reaches it however the objects are
walked.

So `/drift` is a **hand-written list of semantic field pairs** — a table of *(label, path
on the image, path on the container)* — and the comparison block renders it. That is a
smaller and more honest thing than a diff, and it is what the drawing was always showing;
the word "diff" was doing work the picture never supported. FINDINGS F11.

---

## S8 — `/config <c>` (real unified patch, hunks + syntax)

The patch block doing its *actual* job — hunks, context lines, syntax highlighting — not
`docker diff`'s change list. Source: a config file the image ships and a mount/edit
overrides; `docker exec cat` the running one, pull the image's original, diff.

```
❯ /config api-gateway

  /etc/nginx/conf.d/default.conf
   ┌──────────────────────────────────────
   │   server {
   │       listen 80;
   │ -     root /usr/share/nginx/html;          ← removed, syntax-highlighted
   │ +     root /var/www/app;                    ← added
   │ +     client_max_body_size 50M;             ← added
   │       location / {
   │           proxy_pass http://backend;
   └──────────────────────────────────────
   1 hunk · +2 -1
```

The three line kinds, context lines, lowlight over nginx-conf/JSON/Dockerfile — the diff
showcase the C/A/D list could not be.

**Corrected in place, and the drawing was wrong three times over** (F11's precedent, ninth
instance). Measured against `dtui-cfg`, an `nginx:alpine` container with a bind-mounted
`default.conf`:

- **It is not the *unified* showcase.** `layoutFor` chooses by width — split at a wide
  terminal, unified below — so one verb draws both, which is more showcase than the drawing
  asked for. Frame-read at 120 (split, two columns) and 80 (unified). The app does **not**
  pin `layout`; taking the adaptive default is the point.
- **The pair does not exist by default.** `nginx:alpine` ships a 44-line `default.conf` and
  a plain container has it byte-identical. A container whose config differs from its image's
  is one somebody set up that way, so the fixture is part of the surface.
- **`/config <c>` cannot discover the file.** `.Mounts` gives `Type: "bind"` for a file and
  for a directory with no distinguishing field, so the bare form offers the bind
  destinations as candidates rather than guessing. `/config <c> <path>` is the verb.

And the drawing never said it joins two sources: the running file is `docker exec <c> cat`,
the image's needs `docker run --rm <image> cat` — **442ms, measured**, a container created,
started, read and removed. That makes this verb an order of magnitude slower than `/drift`
and the cost is named here rather than discovered.

---

## S9 — `/logs <c>` (pushed streaming view)

`docker logs -f` is a stream with no natural end. A **pushed view** over the transcript,
the log streaming into it, `esc` pops back.

```
  ┌─ api-gateway logs ─────────────────────────────── following · 342 lines ─┐
  │ 14:22:01 GET /health 200 2ms                                             │
  │ 14:22:03 GET /api/users 200 41ms                                         │
  │ 14:22:04 POST /api/orders 201 88ms                                       │
  │ 14:22:04 GET /api/orders/018f2 200 12ms                                  │
  │ ▐ 14:22:05 WARN rate limit near for 10.0.0.4                             │  ← tone on a log line
  │                                                                          │
  └─ n/p scroll · g/G ends · f follow · esc back ────────────────────────────┘
```

**Exercises:** the pushed view, streaming into it, tone on individual lines (WARN/ERROR
coloured), the follow toggle. The transport streaming path handles `-f`.

---

## S10 — `/diff <c>` (the filesystem change list)

`docker diff`'s `C`/`A`/`D` — the *list* of filesystem changes, not the patch. A toned
list; the real unified diff is S8, this is the "what files changed" summary. Both exist;
they show different blocks.

```
❯ /diff api-gateway

   ~ /var/log/nginx           modified
   + /var/log/nginx/access.log added
   + /tmp/cache               added
   - /etc/nginx/default.conf  deleted

   3 added · 1 modified · 1 deleted
```

`+` added (ok tone), `-` deleted (error tone), `~` modified (warn) — mapped to docker's
three change types exactly.

---

## S11 — the smaller verbs

- **`/images`** — table: Repository, Tag, ID, Size, Age. Size formatting.
- **`/top <c>`** — table, no wrapping (PID/CMD).
- **`/port <c>`** — keyValue, each mapping a row.
- **`/events`** — `b.live` streaming: container lifecycle events, newest on top. The
  surface that *appends* over time — gap 2.

---

## S12 — the degradation showcase (scripted)

The same **S3 live view** at five depths — the plot and bars degrade more visibly than a
table, which is why S3 rather than S4 is the subject.

```
truecolour  plot line + bars in graduated green→red
256         quantised
16          basic ANSI colour
1-bit       plot line stays (glyph), bars → ░▒▓█ height, no colour
ASCII       plot → .:-= , bars → #### , → becomes ->
```

`degradesTo1Bit` / `degradesToAscii` shown, not asserted: *the same information, five
terminals, nothing lost — only how it is said changes.* The strongest single argument for
Calcium's design, demonstrated. The plot degrading is the strongest single frame of it.

---

## Interaction features — shown by use, no surface

Not blocks — the shell itself, shown by being used rather than by a dedicated surface.

- **Completion**: `/inspect api<tab>` → `api-gateway`, from a dynamic manifest source —
  the real far-side completion path (`frameworkSources` + a dynamic source).
- **Reverse search**: `⌃r` `stats` recalls `/stats worker-1`.
- **History**: `↑` through prior commands.

The screencast shows these incidentally — tab-completing a container, `⌃r`-ing a command —
the "it is a real shell" texture. No dedicated surface; that is the point.

---

## The gaps this design predicts — filed, to confirm

The two starred are the ones only *this app drawing these surfaces* would surface —
neither the probe nor any Calcium test could reach them.

1. **Sparkline / plot history.** S3 and S4 want values across ticks; `b.live` re-renders
   from the latest fetch. Adapter ring-buffer first; if awkward, a finding. The plot (S3)
   and the sparkline share this source — build the buffer once, both work.
2. **A live table that appends.** S11 `/events` grows over time — between "one live block
   that refreshes" and "a new entry per event."

   **Answered — and it does not survive as
   filed.** The premise underneath it is that the far side produces only deltas, and
   `docker events --since 10m --until 0s --format json` exits 0 with a **window**: both
   bounds take relative durations, so the app reads no clock it does not have (C07 I1). A
   window is a snapshot, which is what `b.live` is for, and the adapter accumulates into
   the ring gap 1 already built. No Calcium change.

   > Before asking for an append primitive, ask whether the far side can be asked for a
   > window.

   The limit, stated: this holds for a source with a bounded historical query and **fails
   for one without**. `docker logs` has no `--until` that leaves the follow running, which
   is why S9 went the view+streams route (C22 I48). So both halves have an answer and
   neither is an append primitive. `examples/docker/S11_WALK.md` §8b carries the ruling
   and the eight-row trace; F51 is what `/events` found instead."
3. ★ **Value-colour vs tone-colour.** A CPU bar/plot colour encodes *load* (green→red),
   not a semantic slot (ok/warn/error). Calcium's palette is tone-slots. **A load gradient
   may have no home** — the first thing docker wants that the colour model may genuinely
   lack.
4. **The stop/start confirm.** S2's `⚡ stop` mutates state, needs the non-dismissable
   confirm with real y/n answering — the open item. The demo forces the ruling.
5. **`exitCode` null-means-signal.** `docker stop` is SIGTERM; the §8a finding lands.
6. **A frame a consumer can inspect** for `matchesGolden` — the demo's tests want it.
7. ★ **A `b.live` part hosted by a pushed view** (S3). **Answered — see FINDINGS F20,
   and the premise below was wrong.** The `view` arm ticks and has been tested since
   C23 §3b (T4.21). What is absent is a *producer*: `declare`'s one call site hard-codes an
   entry host, `release` has no pop trigger, and the scroll question has no subject because
   C15 holds no offset and the owner does not exist. All three are **C22 §13's reserved
   ruling** — *a verb whose result is a pushed view* — which S3 forces. Still the most
   valuable thing the app surfaces; the reason changed. Original wording: *"spec'd but
   shipped tested against an entry host only … the untested arm of a union"*.

Record each gap the way Calcium recorded its own: the surface that needed it, what was
reached for, whether it is adapter-side work or a real Calcium finding. **Do not fix
Calcium mid-build** — file it, keep building; the framework change comes later with a
consumer proving it is needed.

---

## Build order

```
1. file: resolution + manifest + /ps against real docker        (S2)
2. landing dashboard                                            (S1) — first b.live, entry host
3. ⏎ live single-container view                                 (S3) — HEADLINE, gap 7, the plot
   └ the plot needs gap 1's history buffer — build it here
4. /drift, then /compare                                        (S7, S6) — comparison at its best
5. /config, then /inspect --raw                                 (S8, S5) — real patch, syntax
6. /logs, /diff, the smaller verbs                              (S9-S11)
7. degradation showcase — the S3 view at five depths            (S12)
8. whatever gaps 1-7 turned out to be, each with a consumer
```

Step 1 is the smallest thing that runs against real containers. Steps 3 (gap 7, the
headline) and 4 (the comparison block at its best) are where the demo earns its keep —
the composition the framework built toward and the block that was thinnest, both central.
Nothing added to Calcium before step 1.

---

# Appendix — the corrections index

**Nineteen corrections across twelve surfaces**, and the count is the point. Filed one at
a time they read as ordinary revision; collected, they are the project's most-instantiated
finding — *a drawing describes the framework or the far side rather than being checked
against either* — and the reason the drawings above are kept as drawn rather than tidied.

The index exists because the corrections were **unclaimable while they were scattered.**
Each one is marked in place, in the surface it belongs to, which is right for a reader
working through that surface and useless for anyone asking *how often does this happen*.
Fifteen of them had to be found by reading all seven hundred lines. Four more were never
folded in at all — nobody re-reads a design document after the surface it describes ships.

**Who was wrong** is the column that earns its place. Three answers, and they are not
equally common:

| | count | what it means |
|---|---|---|
| **the far side** | 6 | docker sends something other than the drawing assumed |
| **the framework** | 7 | Calcium's model cannot express, or does not do, what the drawing showed |
| **the drawing itself** | 6 | internally inconsistent, or a claim about nothing measurable |

The middle row is the uncomfortable one: **a design document written by someone holding
the framework's specs still got the framework wrong seven times.** Reading a spec and
checking against it are different acts, and only the second one is a test.

---

## A · Corrected in place, above

| | surface | what was drawn | what was found | who was wrong | finding |
|---|---|---|---|---|---|
| A1 | S1 | *typing a command freezes the dashboard into the transcript* | freezing is not stopping — C23 I9, and I33's five teardown triggers do not include it | framework | F17a |
| A2 | S1 | `CPU 34%` as a utilisation | `CPUPerc` is per-core-normalised, so the sum has no ceiling; the drawing now reads `CPU 340%` | far side | — |
| A3 | S2 | `PORTS` as `80→8080, 443→8443` | docker sends `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` — forty characters and an IPv6 twin per entry, and R01 forbids parsing it | far side | F4 |
| A4 | S2 | `truncateFrom: "start"` on `Ports` | the host port is on the **left** of the real string, so `"start"` loses the thing a reader wants. R01 R3.4 makes the same error from the other side | drawing | — |
| A5 | S3 | the axis `-60s ──── now` | there is no clock on this path (C07 I1), so the ordinate is a tick index and a duration label claims what it cannot support | framework | F11 |
| A6 | S3 | `⏎` read as pushing a view | B03 §2: `⏎` on a row **appends**; a push comes from a verb, with an action filling the prompt between | framework | F11 |
| A7 | S3 | the verb `ps <uuid> --watch` | `docker ps` takes no positional and `--watch` is not a flag — three facts making the verb unspawnable, none checked | far side | — |
| A8 | gap 7 | *the driver ships tested against an entry host only* | it does not: the `view` arm has been tested since C23 §3b (T4.21). What is absent is a **producer** | framework | F20 |
| A9 | S6 | five `/compare` rows drawn as one source | `cpu %` and `mem` come from `docker stats`, so the surface joins two sources and never said so | drawing | F11 |
| A10 | S7 | the verdict `▐ added` | `Comparison`'s union is `same/better/worse/changed` — a mark the block has never had | framework | F30 |
| A11 | S7 | `env LOG_LEVEL` as one row | `env` is a keyed set; the drawing implies it and never states the rule | drawing | — |
| A12 | S7 | *`docker inspect` the container, the image, **diff the fields*** | the two objects do not have the same fields, so a key-union diff invents drift that does not exist | far side | F11 |
| A13 | S7 | *the image's `Config` carries `ExposedPorts` and `StopSignal`* | true of a service image, false of a base image — **a correction that was itself corrected**, by measuring the case that would falsify the falsification | far side | F32 |
| A14 | S8 | *the unified showcase* | `layoutFor` chooses by width, so one verb draws split **and** unified — more showcase than was asked for | framework | F11 |
| A15 | S8 | the two sources unnamed | the image's copy costs `docker run --rm <image> cat` — **442ms measured**, a container created, started, read and removed | far side | — |

## B · Still owed — the finding landed after this document was last touched

**These four are the more interesting half**, because nothing brought them back here. A
design document is read while the surface is being built and never afterwards, so a
correction found during a *later* step has no path home. That is the failure this index
is meant to close, and it is why the table exists rather than four more edits in place.

| | surface | what is still drawn | what was found | finding |
|---|---|---|---|---|
| B1 | S10 | `+` added *(ok tone)*, `-` deleted *(error tone)*, `~` modified *(warn)* | `b.row` **throws**: C04 I6 requires a glyph for `error` and `warn`, and correctly — a deleted file is not a fault. The markers carry the axis as **text**, in `ok`/`muted`/`accent` | F49 |
| B2 | S10 | `3 added · 1 modified · 1 deleted` under a list of **four** rows | the tally counts five. **The drawing disagrees with itself**, and no amount of measuring the far side would have caught it | F65 |
| B3 | S9 | a panel with `following · 342 lines`, key hints, and `▐` tone on a `WARN` line | the app builds `b.raw` per line. `docker logs` emits no level, the shim wraps each line as `{"line":"…"}`, and **`b.logs` has no consumer in this application at all** | F64 |
| B4 | S11 | `/events` — *`b.live` streaming … gap 2* | ruled the other way in step 6: an adapter accumulates into a ring, because `--until` makes `docker events` terminate and both bounds take relative durations. Gap 2 downgraded from *Calcium needs an append primitive* | — |

---

## What the index says that the corrections do not

**Six of the nineteen are the drawing wrong about itself** — internally inconsistent, or
asserting something with no measurable content. Those are the ones no amount of running
docker would have caught, and they are the argument for the by-hand walk: a classification
table indexed by rule interaction reads the drawing *against itself*, which is the only
instrument that reaches them.

**Two are corrections to corrections** (A13, and A4's second ruling). Both were sound
reasoning from a false premise, and in both cases the premise was *a picture in this
document* rather than a measurement. **A drawing used as evidence for the next drawing is
how a single unchecked claim propagates**, and it is why R01 R3.4 carries A4's mistake too.

**And the score is 7–6–6 between the framework, the far side, and the drawing.** The far
side being surprising is expected and is what an adapter absorbs. The framework being
misdescribed *by a document written with its specs open* is the finding worth taking
somewhere else: it is the same shape as A03 §2's vacuity class, one level up. A sentence
about a mechanism reads exactly like a sentence that was checked against one.
