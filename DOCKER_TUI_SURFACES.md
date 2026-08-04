# docker-tui — surface designs

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
launch**: `b.live` parts composed with static panels, refreshing in place. Typing a
command freezes it into the transcript, exactly the transcript model.

```
  ┌─ docker-tui ──────────────────────────── engine 27.3 · 14 containers ─┐  ← panel, keyValue header
  │                                                                        │
  ▌ RUNNING (9)                                          CPU 34%  MEM 61%  │  ← b.live, whole panel refreshes
  ▌ ● api-gateway     ▂▄▆█ 84%   512M/2G    1.2M/3.4M    up 3d            │
  ▌ ● postgres        ▁▁▂▁  8%   1.1G/2G    880k/12M     up 12d           │  ● = running (ok tone)
  ▌ ● redis           ▁▁▁▁  2%   40M/512M   120k/4M      up 12d           │
  ▌ ● worker-1        ▃▅▃▄ 41%   256M/1G    2M/8M        up 3d            │
  ▌ ● worker-2        ▄▄▅▄ 38%   248M/1G    2M/8M        up 3d            │
  ▌   … 4 more running                                                    │  ← density: collapse the tail
  │                                                                        │
  │  STOPPED (5)   ○ migrate ○ seed ○ backup-cron ○ old-api ○ test-runner │  ← pills, exited (dim/error tone)
  │                                                                        │
  └────────────────────────────────────────────────────────────────────  ┘
     tab a container · ⏎ watch · l logs · d drift · / for a command          ← footer keymap
```

**Exercises in one frame:** panel, `b.live` (the running block), keyValue (the header
totals), pills with tone (stopped), sparkline bars, tone (running/stopped), the footer,
and the collapse-the-tail density decision. **The screencast's first five seconds**, doing
almost everything Calcium does at once.

`system info` = the engine version + container counts in the panel title, one line. A
welcome screen that is mostly chrome is the thing density is chosen against.

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
  │       └──────────────────────────────────────────  -60s ──── now      │
  │                                                                        │
  │  MEM   ████░░ 512M / 2G · 25%        NET   ↓1.2M ↑3.4M                 │  ← b.live part: bars + kv
  │  PIDS  24                            BLK   0 / 4.1M                     │
  │                                                                        │
  │  PORTS  80→8080 · 443→8443          MOUNTS  /data · /etc/nginx (ro)    │  ← static: does not tick
  │                                                                        │
  └─ n/p scroll · L logs · d drift · esc back ──────────── updated 1s ago ─┘
```

**How it is built:** the view is pushed once. The CPU plot and the MEM/NET block are each
`b.live` parts the refresh driver ticks; the ports/mounts block is static and does not
refresh. `esc` pops back to `ps`. The plot fills over a rolling window; the header shows
live uptime.

**This composes:** drill-in (C25 view push), `b.live` (part refresh), plot (C12), the
fullscreen view's scroll, tone, keyValue. Nothing else in the terminal-tool space does a
live focused dashboard inside a navigable shell. **Lead the screencast with clicking a
container and watching it breathe.**

### The seam this tests — gap 7, the important one

The part-refresh driver's host was ruled `entry | view` — both arms specified. **But the
driver shipped tested against an entry host.** A view host is the *other arm of the same
union*, which is exactly where Calcium found untested seams eighteen times.

S3 is the first thing to drive a `b.live` part **inside a pushed view**, and it will
answer, on first run:

- Does `driver.declare(host, parts)` accept a `view` host and tick it? (Spec says yes.)
- Does `release(host)` on **pop** stop the view's parts — or only entry teardown paths? A
  view popped while its parts tick is a subscription outliving its host, the class C14 and
  C15 both paid for.
- Does a refresh patching a block **while the view is scrolled** hold the viewport, or
  jump it? This is `rev`-moves-on-a-settled-entry from the last stretch, now inside a
  scrollable view — the offset must survive the patch.

If any is wrong, it is the seventeenth-gap shape one more time, found by the first
consumer to drill in. **The single most valuable thing docker-tui surfaces**, because it
is the one part of the last stretch exercised against only one of its two declared hosts.

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

`comparison` with a real before/after, differing rows carrying verdict tone. **The
comparison block's `/stats`** — the surface that demonstrates the feature at its peak, the
way S3 does for `b.live`. Source: `docker inspect` the container, `docker image inspect`
the image, diff the fields.

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

The three line kinds, context lines, lowlight over nginx-conf/JSON/Dockerfile. **The
unified-diff-with-context showcase** the C/A/D list could not be.

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
3. ★ **Value-colour vs tone-colour.** A CPU bar/plot colour encodes *load* (green→red),
   not a semantic slot (ok/warn/error). Calcium's palette is tone-slots. **A load gradient
   may have no home** — the first thing docker wants that the colour model may genuinely
   lack.
4. **The stop/start confirm.** S2's `⚡ stop` mutates state, needs the non-dismissable
   confirm with real y/n answering — the open item. The demo forces the ruling.
5. **`exitCode` null-means-signal.** `docker stop` is SIGTERM; the §8a finding lands.
6. **A frame a consumer can inspect** for `matchesGolden` — the demo's tests want it.
7. ★ **A `b.live` part hosted by a pushed view** (S3). The driver's `view` host arm,
   spec'd but shipped tested against an entry host only. Does it tick, does `release` on
   pop reach it, does a patch hold the scroll. **The most valuable thing the app
   surfaces**, the untested arm of a union the last stretch declared.

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
