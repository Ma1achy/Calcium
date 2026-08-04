# docker-tui — findings

What the first consumer found, in the shape Calcium recorded its own: **the surface that
needed it**, **what was reached for**, and **whether it is adapter-side work or a real
Calcium finding**.

Nothing here is fixed in Calcium by this app. R01's premise is that a framework change
arrives with a consumer proving it was needed — so the app absorbs what it can, records
what it absorbed, and the framework moves later with this file as the argument.

---

## F1 — Calcium assumes the far side accepts `--json`, and docker does not ★

| | |
|---|---|
| **Surface** | S2 `/ps` — the first invocation of anything |
| **Reached for** | any way to say what the far side's JSON flag is called |
| **Verdict** | **a real Calcium finding**, absorbed app-side for now |
| **Absorbed by** | `bin/docker-json`, and `binary` pointing at it |

`src/data/transport/argv.ts` appends `--json` unconditionally:

```
$ docker ps --json
unknown flag: --json
```

Docker wants `docker ps --format json`.

**It is a premise, not a line.** `withJson` is imported by the subprocess, emulated and
fixture transports; C23 reads `argv.includes("--json")` to decide `userRequestedJson`;
C06 §3 and C07 §4 both document the flag as the contract. *The far side speaks `--json`*
is something the framework is built on rather than something it configures.

R01 §2 chose docker because containers are **not Prism-shaped** — "a Prism concept quietly
absorbed into the framework surfaces here, visibly". This is that row paying off on the
first contact with a real far side, before a line of app code.

**What a fix would look like**, when one is argued: the flag belongs beside `binary` on
`TuiConfig`, because it is a property of the far side the app author is the only party who
can know — the same reasoning C05 uses for `ToolDef.interactive`. Detection is not
available and a list of known CLIs would fail silently for every wrapper.

**How it closes:** `bin/docker-json` is deleted and `binary` goes back to `"docker"`. The
file is the finding; its deletion is the finding closing.

---

## F2 — Calcium was not a publishable package, and CI had a job that proved nothing

| | |
|---|---|
| **Surface** | the proof gate (R01 §8), before it could be written |
| **Reached for** | `npm publish` into a local registry |
| **Verdict** | **a real Calcium finding** — fixed in Calcium, because the app cannot absorb it |

`package.json` carried `"private": true`, and `npm publish` refuses a private package
outright. R01 commitment 9 rests the whole monorepo arrangement on a pack-and-install gate,
and that gate could never have run.

**The sharper half:** `ci.yml` already had a `publish` job. It is tag-gated, so it had never
executed, and it could not have succeeded if it had. A release path that has never run reads
exactly like one that works — A03 §2's vacuity class arriving in CI rather than in a rule.

Fixed by `chore/package-identity` (PR #13) rather than absorbed, because there is no app-side
version of "the package can be published".

**And one that would have bitten the gate:** `publishConfig.registry` beats a `--registry`
flag. A dry run pointed at `localhost:4873` published to `npm.pkg.github.com` regardless. The
Verdaccio step must override `publishConfig`, not merely pass a registry.

---

## F3 — R01's own premise about docker has expired

| | |
|---|---|
| **Surface** | S2 `/ps` — the adapter's coercion boundary |
| **Reached for** | R01 §4's table of what docker emits |
| **Verdict** | **adapter-side work**, plus a small R01 correction |

R01 §4 says *"Everything is a string, including numbers"*. Docker 29.4.1 does not agree:

```json
"Platform": {"architecture": "arm64", "os": "linux"}
```

A nested object, in the middle of an otherwise flat record.

**And docker pre-truncates its own fields**, with U+2026:

```json
"Mounts": "/host_mnt/User…"
```

That one is the hazard rather than the curiosity. `cells()` measures `…` as one cell, so a
field docker has already shortened, rendered into a column narrower than it, is truncated
**twice** and shows two ellipses. It is the class where *a value belongs to the far side and
the code assumes it owns it* — invisible until a real far side that pre-truncates arrives,
which is the first thing this app did.

R01 §4's row wants rewording: docker's values are strings *except where they are not*, and
the far side changed under the spec, which is the argument R01 makes about docker made
against R01.

---

## F4 — a surface drawn before anyone ran the far side encodes the mock's assumptions ★

| | |
|---|---|
| **Surface** | S2 `/ps`, the `PORTS` and `IMAGE` columns |
| **Reached for** | the drawn frame, as the source for a truncation ruling |
| **Verdict** | **a finding about the design documents**, not about Calcium or the adapter |

S2 draws `PORTS` as `80→8080, 443→8443` and `IMAGE` as `nginx:1.25` in an 18-wide column.
Docker emits `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` — forty characters for one published
port, with an IPv6 twin per IPv4 entry — and image names up to **85 characters**
(`vsc-tui-kit-07d4a92ac4a68f…-features`). `Status` reaches 22 (`Exited (0) 5 weeks ago`)
against a drawing that assumed thirteen.

**It cost a wrong ruling, which is how it was found.** S2 and R01 R3.4 disagreed about
which end `PORTS` truncates from. The disagreement was real and worth ruling on, and the
ruling — *keep the field's identifying end; for a mapping that is the tail* — was reasoned
from `80→8080`, where the host port **is** the tail. In the string docker actually sends
the host port is on the **left**, so the ruling inverted the answer, and R01 R3.4's own
wording ("truncated from the left, keeping the host port") is not satisfiable at all.

The generalisation survived; only which end identifies flipped. But nothing in either
document could have caught it, because both were describing the same imagined string.

**Two things follow.**

1. **A classification table is written against captured far-side output, never against the
   drawings in the spec it is testing.** The row *`Ports` long meets `truncate`* cannot be
   decided from a document that shows a string the far side never sends. This is the rule
   the walk needed and did not have.
2. **The remaining speculative surfaces are suspect in the same way** — S3's plot, S6's
   comparison, S7's drift were all drawn before anything ran. Each should be checked
   against real output before its ruling, not after. Knowing the pattern now is the
   cheapest it will ever be.

This is one level worse than Calcium's own *a figure encoding unstated intent*: there, the
figure was drawn from something real and the intent went unwritten. Here the figure was
drawn from nothing, so it encoded intent that was **wrong**, and it read exactly as
authoritative.

**And a second argument for verbatim, beyond the fail-on-revert.** Condensing
`0.0.0.0:8080->80/tcp` to `8080→80` discards the bind address, and `0.0.0.0` versus
`127.0.0.1` is the difference between a port exposed to the network and one that is not.
A parser decides in advance which information nobody will need, and it decided wrong here
while looking tidier.

---

## F5 — "never drops" is a sentence Calcium has no way to express

| | |
|---|---|
| **Surface** | S2 `/ps` — "`NAME` and `STATUS` never drop" |
| **Reached for** | a `ColumnDef` field meaning *required* |
| **Verdict** | **open** — arguably a real Calcium finding, absorbed as arithmetic for now |

S2 and R01 §5 both state that some columns never drop. `planColumns` has no such concept:
it admits by priority until the next column will not fit and then stops
(`src/presentation/table/plan.ts:126`). Only the single highest-priority column is forced,
and that is the degenerate `overflowed` path for a terminal narrower than one column.

So "never drops" is not a guarantee the engine offers — it is an **outcome** of priority
and arithmetic, true at the widths where the sums work and false below them. With the step-1
columns it holds to roughly 66 columns and fails beneath.

**Absorbed rather than fixed**: the app picks priorities and `minWidth`s that make the
claim true across the range that matters, and the walk states it as arithmetic instead of
as a guarantee.

**Why it may be a real finding.** A `required: true` on `ColumnDef` would be a different
kind of promise — one the planner could refuse to break, dropping a *lower*-priority column
or accepting `overflowed` rather than losing an identifying column. Whether that is worth a
field is genuinely open: priority may be the right primitive and "never drops" may simply be
imprecise prose in two app-level specs. What is not open is that **two documents claim a
behaviour the layer beneath cannot express**, which is the shape that reads as satisfied
and is not.

Deferred to a surface that can settle it. S4's dense live table has more columns and less
room, and will meet the boundary properly.

---

## F6 — R01 names a glyph the vocabulary does not have

| | |
|---|---|
| **Surface** | S2 `/ps` — the `paused` state |
| **Reached for** | `▪`, as R01 §5 specifies |
| **Verdict** | **adapter-side**, plus an R01 correction |

R01 §5: *"State glyphs follow the framework's vocabulary: `running` → `●` ok, `restarting`
→ `▲` warn, `paused` → `▪` warn, `exited` → `✗` error, `created` → `○` muted."*

Four of the five exist. `▪` is not in C09's `GLYPH_TABLE`, and the sentence claims to be
following the vocabulary while naming a character outside it — which is the tell: the
vocabulary is **slots**, not characters (C04 I6, and CLAUDE.md's *a block names a palette
slot*). Writing the character down at all is how the mismatch got in.

**Ruled:** `paused` → `pending` (`◌`), tone `warn`. Suspended, not progressing, and visibly
distinct from `restarting`'s `▲`. The unknown-state arm takes `bullet` (`•`) rather than
`queued` (`○`), so an unrecognised state does not render identically to `created` — a real
state wearing an unknown one's mark is worse than an unknown one looking unfamiliar.

Small, and the same class as F4 one size down: a spec written in the far side's terms, or in
a drawing's terms, rather than in the terms of the layer that has to satisfy it.

---

## F7 — `createTui` could not be called from the public surface at all ★★

| | |
|---|---|
| **Surface** | S2 `/ps` — starting the application |
| **Reached for** | `createTui({ manifest })`, either arm |
| **Verdict** | **a real Calcium finding, and a blocking one.** Fixed in Calcium, with this app as the consumer proving it |

`TuiConfig.manifest` is typed `Manifest | string`. **Neither arm worked.**

**The object arm** throws at construction: *"the manifest is missing tui-kit's own verbs
(help, clear, theme, history, debug, exit) — pass the raw document, or the result of
parseManifest, rather than a hand-built Manifest"*. `parseManifest` is the only thing that
appends them — `construct.ts:261` says so in a comment — and it was exported from **none**
of the three entry points. So the advice in the error names a function the reader cannot
reach.

**The string arm** is a file path. `FileSystem.readFile` returns a `string`;
`parseManifest(raw: unknown)` rejects anything that is not a record; `construct.ts:257`
passed one directly to the other with **no `JSON.parse` between them**. Every call took
`"a manifest must be an object"`. That arm had never run.

**Why nothing caught it, which is the finding under the finding.** Calcium's own harnesses
build a session like this:

```ts
// test/support/session.ts:16
import { parseManifest } from "../../src/data/manifest/index.js";
// test/support/fixture.mjs:534
const { parseManifest } = await import("../../dist/data/manifest/index.js");
```

Both **reach through the package boundary** and hand `createTui` an already-parsed object.
Every test of construction therefore exercises a path no consumer has. This is the
producer testing itself, and it is precisely the thing R01 exists to detect — the
`exports` seal is what makes the deep import visible, and the seal only bites on a
consumer, because a package cannot reach through its own boundary and notice.

C24 §1 states the test the component serves: *"Phase 1 is done when someone who is not its
author builds a working TUI from the README without asking a question."* It has never been
satisfiable. The README carries no runnable `createTui` example, so nothing was there to
fail either.

**Fixed rather than absorbed**, because there is no app-side version of "the entry point
works". The alternative was fabricating six framework `ToolDef`s in app code — inventing
summaries and flags the app cannot know, against a reconciliation (C23 I27) that compares
them with the real handlers — which would have hidden the finding behind something that
looked like ordinary app code, and made the reference app a liar about what Calcium can do.

**The ruling, and it is about the axis rather than the arm.** The object arm's real defect
is that it *requires the output of a function the author cannot reach*. Two remedies were
available — export `parseManifest` and tell the author to call it, or have construction
append the framework's verbs itself — and the second is right for the same reason C05
appends them during parse: **the framework's own verbs are the framework's to add, not the
author's to know.** Exporting `parseManifest` would leave `TuiConfig.manifest: Manifest`
still misleading, because a bare `Manifest` would remain the one thing that does not work.
So the object arm now accepts what an author can actually write — their own tools — and
the string arm gains the missing `JSON.parse`, with a malformed document reported as a
manifest error rather than thrown.

**And the seal test is what would have caught it.** R2.3 was written first, before any app
code, on the argument that a source scan tests the app's habits while only a real
resolution tests the boundary. F7 is the payment: the surface the harnesses reached around
turns out not to work, and it could only be discovered by something that respected the
boundary. A package cannot reach through its own edge and notice.

---

## F8 — omitting `env` does not degrade the shell, it stops it opening

| | |
|---|---|
| **Surface** | S2 `/ps` — starting the application, immediately after F7 |
| **Reached for** | nothing. `env` is optional and was left out |
| **Verdict** | **adapter-side** (the app passes `process.env`), plus a false sentence in C22 |

`TuiConfig.env` is optional, and its own documentation says:

> Omitted, it defaults to `{}`, and the shell degrades to ASCII with no colour: the safe
> direction, and the alternative is a fifth required field.

**It does not degrade.** `detectCapabilities(config.env)` reads `TERM` from that record;
with `{}` there is no `TERM`, so `usable` is false, so `altScreen` is false — and
`acquire()` treats a missing alternate screen as **fatal**: *"alternate screen unsupported
— the shell cannot open"*. The safe direction turns out to be no direction at all.

The app supplies `env: process.env`, which is what C22 I20 intends — no file under `src/`
reads the environment, deliberately. So this is app-side work and the finding is the
sentence: it describes a graceful degradation that does not exist, and it reads as
reassurance while being the opposite. A03 §2's class arriving in prose, one document over
from where C19's `--flag=value` sentence did.

**The same shape as F7, and found one minute after it.** An optional field whose default
makes the framework unusable, invisible because every harness passes a real environment.
Two in a row is not a coincidence: **the defaults have never been exercised together**, and
the thing that exercises them is a consumer that supplies only what it was told to.

---

## F9 — the session's first entry cannot be appended ★★

| | |
|---|---|
| **Surface** | S1, the landing dashboard — *the live block on launch* |
| **Reached for** | a way to put a `ViewDocument` into the transcript at startup |
| **Verdict** | **a real Calcium finding**, F7's shape exactly |

`docs/surfaces/S02_the_welcome.md` specifies a first entry and is unambiguous about what it
is:

> **It is an ordinary `ViewDocument`, not a screen.** It is appended to the transcript like
> any command's output, which means `/clear` removes it, it scrolls away as the session
> fills, and its action buttons work through C23's normal `fill` path. There is no banner
> renderer.

Its `Source` row cites **C22 §4 step 7**. C22 §4 step 7 is the terminal lifecycle. Nothing
in C22's twelve construction steps or eight startup steps appends anything, `TuiConfig` has
no landing or greeting field, and `TuiInstance` is `start` / `stop` / `session` — three
members, none of which can carry a document. **The surface is specified, agreed, and
structurally impossible**, which is F7's sentence with a different subject.

**C22 already wrote down the day this would arrive.** §8a, on why `I7` (history flushes on
every path) and `I5` (cleanup lives only in `beforeRelease`) do not conflict:

> nothing can be appended to history before input is accepted, which is startup step 8 …
> **If anything ever appends earlier — a startup notice, a restored session — that is the
> day I7 and I5 genuinely conflict**, and this paragraph is what makes it visible then
> rather than a silent empty file.

It was written as a hypothetical because nothing could produce one. S1 produces one.

**And there is a precedent in the same document.** C22 line 96 records the local-handler
gap: C23 §2 said an app registers its own handlers, C23 I27 failed construction when a
`local` verb had none, and *nothing carried the app's handlers into the pipeline* — so the
framework refused a configuration it gave no way to complete. Same shape, same file, found
the same way: by a consumer trying to use what the spec promised.

**Not fixed here, and the ordering is deliberate.** S1's claim is not "append a first
document" — it is *live block on launch, frozen into the transcript by the first command*.
So the first entry is a **live** entry, and the seam is "append a first document that may
be live, and freeze it on first submit like any other". Designing that against S02's
drawing would repeat F4 on a permanent, fail-on-revert-protected seam. The dashboard is
built behind a local handler first, and the seam is designed against a body that works.

---

## F10 — `docker stats --format json` is a screen redraw, not a stream of JSON

| | |
|---|---|
| **Surface** | S1's running panel, and S4's dense live table |
| **Reached for** | `docker stats --format json` as the `b.live` `stream` source |
| **Verdict** | **adapter-side**, and an S1/S4 correction |

The dashboard's whole premise is that stats streams. It does not stream *data*. With
`--format json` and no `--no-stream` it emits **ANSI cursor control interleaved with the
JSON**, redrawing a fixed region of the terminal:

```
^[[H{"BlockIO":"44.3MB / 234MB","CPUPerc":"0.31%",…,"PIDs":"6"}^[[K
^[[K
^[[J^[[H{"BlockIO":"44.3MB / 234MB","CPUPerc":"0.31%",…,"PIDs":"6"}^[[K
```

`ESC[H` home, `ESC[K` erase-line, `ESC[J` erase-display — and **each interval written
twice**. Ninety-eight lines in seven seconds, of which zero parse as JSON.

Consuming it means writing a terminal emulator inside an adapter. This app already has one
(`tools/screen.py`) and building it was the right call — for **reading frames the
application drew**. Putting one on the far-side boundary is the same code in the wrong
place: the adapter would be interpreting a presentation of data rather than data.

**Ruled: the dashboard polls `docker stats --no-stream --format json` on each tick,
through `b.live`'s `fetch` arm.** `--no-stream` is clean NDJSON — no escapes, one object
per container — and `fetch` is the arm the entry host is tested against.

**Two consequences worth naming.** `b.live`'s `stream` arm goes unexercised by this app, so
it stays in the same position `RefreshHost`'s `view` arm was in before step 3 — specified,
implemented, and unreached by any consumer. And "stats streams" was an assumption nobody
had run, which is F4's class again: this one just happened to be checked before it cost a
ruling rather than after.

Four smaller facts from the same probe, each of which changes a design:

| probe | result | consequence |
|---|---|---|
| `--no-stream` default scope | everything `docker ps` shows — **running *and paused*** | the stopped pills come from `ps -a`; **the panel joins two sources** |
| a stopped container named explicitly | a zero row, not an omission | absent and zero are different, and only one of them is a fact |
| an unknown container | `exit=1`, message on stderr | `/ps`'s error path transfers unchanged (R3.6) |
| a timestamp field | **none** | history is stamped app-side, and `AdapterContext` carries no clock (gap 1) |
| row order across five ticks | stable, matching `ps` | stable **in observation**, guaranteed nowhere — see below |

**The scope row is a correction to this entry, made the day after it was written**, and the
way it happened is worth more than the fact. The first probe ran against a machine with one
container running and none paused, and "running only" is a perfectly good reading of that
output — it is also what the docker docs imply. It is wrong: `stats` shows what `docker ps`
shows, which includes **paused**. The moment there was a paused container the panel headed
`RUNNING (n)` had a paused one in it.

A rule inferred from a single observation had been tested against nothing, and it went into
a findings entry as a fact with a table row of its own. That is the same shape as *two
instances fitting a rule is not evidence for the rule* one instance further down, and the
cost of finding it here was a second probe.

**Row order is the other thing the multi-container probe made askable.** Five consecutive
ticks returned the same order, matching `docker ps`. That is an observation and not a
contract: `stats` fans out per container, nothing documents an ordering, and a **live**
block re-rendering in daemon order would let rows swap places under the reader between
ticks — a defect that cannot exist in a static table and so has never been met. The panel
sorts explicitly. A stable order that nothing promises is the most expensive kind to rely
on, because it is right in every test.

---

## F11 — three more surfaces drawn before the far side was run

| | |
|---|---|
| **Surface** | S1's header, S3/S4's history, S6 `/compare`, S7 `/drift` |
| **Reached for** | nothing yet — checked ahead of their rulings, which is the point |
| **Verdict** | **findings about the design documents**, F4's class, four instances |

F4 ended with *"the remaining speculative surfaces are suspect in the same way … each
should be checked against real output before its ruling, not after"*. This is that check,
run two steps early. Three of the four drawings are wrong.

**S7 `/drift` — the two objects do not line up.** The drawing diffs `docker inspect <c>`
against `docker image inspect <img>` field by field. Their `Config` objects share only part
of a shape: the image's has `ExposedPorts` and `StopSignal`; the container's has
`Hostname`, `Domainname`, `Attach*`, `Image`, `StopTimeout`, and `ExposedPorts: null`. A
key-union diff invents a `changed` row for every key present on one side only — which is
most of them, and each one would read as drift.

Worse, the drawing's own headline row cannot be produced structurally at all. `ports: 80`
versus `80→8080` reads `Config.ExposedPorts` on the image and `HostConfig.PortBindings` /
`NetworkSettings.Ports` on the container — **two different paths**. So `/drift` is a
hand-written list of semantic field pairs, not a diff of two objects, and the drawing
implies the opposite.

**S6 `/compare` — two of the rows have no source.** The objects are the same shape here, so
a structural diff does work. But the drawn rows include `cpu %` and `mem`, which are not in
`inspect` at all; they are `stats`. The surface needs two sources joined and says nothing
about it — the same join S1 now has to make, arrived at from the other direction.

**S3's plot and S4's sparkline — there is no history to plot.** Docker emits an instant and
no timestamp. Gap 1 predicted the ring buffer; the new part is that `AdapterContext` has no
clock either, so history is keyed by tick rather than by time, and "60 seconds" on S3's
axis is `ticks × interval` rather than anything measured.

**S1's own header — `CPU 34%` is not a quantity docker can supply.** Summing `MemPerc` is
meaningful: each is a fraction of total host memory. Summing `CPUPerc` is not — it is
per-core-normalised and exceeds 100% routinely on a multi-core host, so the sum has no
ceiling and reads as a percentage of something. The drawing shows a system utilisation
figure that its source cannot express.

**What this run of the check is worth.** F4 cost a wrong ruling that had to be reversed
across three documents. These four cost one afternoon of probes and no rulings at all,
because none had been written yet. That difference is the entire argument for the practice.

---

## F12 — `npm publish --registry` is accepted and ignored

| | |
|---|---|
| **Surface** | the proof gate itself, owed since step 1 |
| **Reached for** | `npm publish --registry=<local>`, to publish somewhere other than the configured host |
| **Verdict** | **a fact about npm**, and the reason the gate asserts a line of output rather than trusting a flag |

`package.json` carries `publishConfig.registry: "https://npm.pkg.github.com/"`. It beats
the flag, silently:

```
$ npm publish --dry-run --registry=http://localhost:4873
npm notice Publishing to https://npm.pkg.github.com/ with tag latest and default access
```

No warning, no error, exit 0. `npm_config_registry` in the environment behaves the same
way. The flag that does win is the **scoped** one:

```
$ npm publish --dry-run --@fmx:registry=http://localhost:4873
npm notice Publishing to http://localhost:4873 with tag latest and default access
```

**Why this is worth an entry rather than a code comment.** The obvious way to wire a local
registry into a proof gate is `--registry`, and it would have aimed every publish at the
real host. In CI that is an authentication failure that reads as a problem with the local
registry — the operator debugs the thing that was working. It is the vacuity class in a
command-line flag: accepted, plausible, and doing nothing.

The gate therefore **asserts npm's own `Publishing to …` line** rather than passing a flag
and assuming. Mutating that assertion back to `--registry` turns the gate red with the
message naming where it would really have gone, which is the only reason the assertion is
worth having.

---

## F13 — a local handler must hand-write nine `meta` fields, seven of them fiction

| | |
|---|---|
| **Surface** | S1's `/dashboard`, the first local handler this app writes |
| **Reached for** | a way to build a `ViewDocument` |
| **Verdict** | **a real Calcium finding**, small but structural |

`LocalHandler` returns a `ViewDocument`, whose `meta` is required and has nine members:
`verb`, `adapter`, `exitCode`, `durationMs`, `truncated`, `argv`, `stderr`, `transport`,
`origin`. On the adapter route the registry overwrites six of them (C07 I13) precisely
because *a provenance an app author supplies once per verb is a provenance that is wrong
somewhere*. On the local route **nothing overwrites anything but `command`**.

So an app author writing a local handler declares an `exitCode` for a process that never
ran, a `durationMs` of a subprocess that does not exist, an empty `stderr`, and an `argv`
they have to invent. `compose()` exists inside `shell/documents.ts` and fills exactly these
defaults — and it is not exported.

The same argument C07 I13 makes applies here unchanged: the framework knows the route is
local, knows nothing ran, and knows the origin. The author knows none of it better.

---

## F14 — a local handler cannot find out how wide the terminal is

| | |
|---|---|
| **Surface** | S1's panel title and column plan |
| **Reached for** | the width, to decide what the header can hold |
| **Verdict** | **a real Calcium finding**, and the app's workaround is the thing CLAUDE.md forbids |

`AdapterContext` carries `width`, with the comment *"some adapters choose column sets by
width"*. `LocalContext` is `Readonly<{ command: string }>`.

So the one route an app writes entirely itself is the one that cannot know the width, and
the app ends up calling `process.stdout.columns` — which is C01's job, done a second time,
in the one place C01 I13 exists to prevent. It is also **wrong across a resize**, because it
is read once per command rather than handed down, and nothing tells a local handler the
terminal changed.

Two records of one number, and the app's copy is the stale one. The asymmetry looks like an
oversight rather than a decision: nothing in C23 §2 argues that a local verb needs less
context than an adapted one.

---

## F15 — a rejected document produces no entry, no error, and no clue ★★

| | |
|---|---|
| **Surface** | S1's `/dashboard`, on its first run |
| **Reached for** | nothing. The document was invalid and the shell said nothing at all |
| **Verdict** | **a real Calcium finding** — the diagnostic exists and is discarded |

`/dashboard` rendered an empty transcript. The prompt cleared, so the line was submitted;
no entry appeared, no error, nothing on stderr. `/ps` and `/help` worked, so routing worked.

The document had two blocks with the id `running` — the live panel and the table inside it —
which C04 I14 forbids because `ViewPatch` addresses blocks by id. That is my bug, and C13
raises it with a sentence that says exactly what is wrong:

```
blocks: id "running" appears 2 times (C04 I14) — ViewPatch addresses blocks
by id, so a duplicate has no correct target
```

**`appendAndCommit` catches it and throws it away.**

```ts
} catch {
  deps.scheduler.commit("input");
  return null;
}
```

A bare `catch` with no binding, then a frame committed as though nothing happened. C23 I1 —
*every submission produces exactly one outcome* — names this as its second exception, so the
behaviour is deliberate and the invariant is honest about it. What is not deliberate is that
**the reason is destroyed**. There is a `TranscriptError` in hand, carrying the precise
violation, and it is discarded rather than appended as the error entry every other
containment path in C23 produces.

The cost is not theoretical: this took a long time to find, and the route was suspicion of
the PTY harness, then of `screen.py`, then of the paste window, then of local routing —
four wrong turns against a framework that had the answer in one sentence the whole time.

**And it is the exact class C23's own history records.** `documents.ts` carries a comment
about every containment path building a `warn` notice with no glyph, throwing inside
`appendAndCommit`, and producing no entry — *"C23 I1 says every submission produces exactly
one outcome, and the paths that exist to guarantee it produced none"*. That was found and
fixed at the call sites. The swallow that made it invisible is still here, waiting for the
next invalid document, which for a framework means waiting for its first app author.

The fix is small and does not touch I1's exception: append a notice naming the validation
error, or at minimum let it reach the fault handler. A silent no-op is the one outcome that
teaches the author nothing.

---

## F16 — a live part's title cannot carry live data

| | |
|---|---|
| **Surface** | S1's panel header — `RUNNING (9) · CPU 34% MEM 61%` |
| **Reached for** | a title recomputed each tick, as S1 draws it |
| **Verdict** | **adapter-side** (the summary moved into the body), plus an S1 correction |

`LiveSpec.title` is a string captured at declaration. The driver's `titleOf(part)` returns
`part.spec.title`, plus its own `· 14s ago` when stale; `render` returns the part's **child**
and nothing else. So the title is fixed for the life of the part.

S1 puts the counts and the totals in the title, which is where they belong visually. They
froze at the first fetch and stayed there while every row beneath them ticked — a header
describing a moment that had passed, which is worse than no header at all.

**Invisible in a frame, and invisible in the tests.** One frame cannot show that a line is
stale; the tests asserted the title was *right*, which it was, once. It was found by
replaying prefixes of a single capture and noticing the one line that never moved.

Adapter-side, because C23 I34 and I35 have a good reason to own the title — it is where
staleness and failure are said, and a title the app rewrote each tick would race with them.
The finding is that **nothing says so**, and `b.live`'s own field is called `title` with no
hint that it is the one part of a live block that is not live.

---

## F17 — an adapter's `b.live` is never driven ★★

| | |
|---|---|
| **Surface** | S1's running panel, and every live part S3 and S4 will want |
| **Reached for** | `b.live` from an adapter, as `b.live` from a local handler already worked |
| **Verdict** | **a real Calcium finding**, fixed — C23 I33a, T1.38, T6.38 |

**Measured before it was written up, and the measurement is the entry.** A probe declaring
the same one-field live part on each route, run against the real shell and replayed through
the terminal emulator, twelve seconds at a one-second interval:

| | 55% | 70% | 85% | 100% |
|---|---|---|---|---|
| adapter route | `tick 0` | `tick 0` | `tick 0` | `tick 0` |
| local route | `tick 4` | `tick 7` | `tick 9` | `tick 13` |

`declareLive` was reached only inside `appendAndCommit`. The app route appends a **pending**
entry and reaches the transcript through `settle(id, doc)`, so the document carrying the
blocks arrived at a call that did not register anything. An adapter's live part rendered its
loading state and stayed there for the life of the session, with nothing anywhere reporting
a fault.

**The comment was the tell.** *"Called from the one place a document reaches the transcript,
so a part declared on any route is driven and no route has to remember to."* There are two
such places. A sentence claiming total coverage of a set it had miscounted — and no test in
the repository could contradict it, because none of them declared a live part from an
adapter. Fixed by making the sentence true rather than softer: **declared on any route is
driven; stopped on settle, pop, eviction, clear or shutdown, never on freeze.**

After the fix, the same probe: `tick 3 · tick 6 · tick 9 · tick 12`.

**It gates step 3, which is why it was fixed before it.** S4's `/stats` is adapter-driven
and would have refreshed never; S3 puts a part in a pushed *view*, and gap 7's answer would
have been contaminated by an entry-route defect leaking into it.

---

## F17a — the half that is not a defect, and the instruction that would have broken it ★★

| | |
|---|---|
| **Surface** | S1's *"typing a command freezes it into the transcript"* |
| **Reached for** | a release trigger on `append`, so a landing dashboard stops polling |
| **Verdict** | **not a defect** — the specs considered this and ruled against it |

The app's measurement was real: a `/dashboard` entry keeps ticking after `/ps` renders
below it, and two dashboards tick independently and out of step — so every dashboard ever
opened polls docker until eviction. From the consumer's side that reads exactly like the
other half of F17.

It is not. Three documents already settle it:

- **C23 I9** — *a frozen entry keeps receiving patches until settled.*
- **C23 I33** — a refresh stops on five triggers, *"and **not on freeze**"*.
- **C24 §5** — its own *teardown on freeze* row was **deleted** against I9: *"freezing is
  not stopping — a `--watch` scrolled out of view is still running, which is the whole of
  what I9 protects."*

So "wire release to append" would have re-introduced a row removed for cause, and broken
the case it was removed for: a long-running `--watch` would die the moment the user typed
anything.

**The finding is that the instruction to build it came from the design authority and was
wrong, and that checking it against the invariant before building is what caught it.**
That is the by-hand walk applied to a kickoff rather than to a component — *when a ruling
names an operation, check the operation exists before the ruling is written down*, with
"exists" reading here as "is not already forbidden". The cost of the check was one grep;
the cost of skipping it would have been a spec commit, a code commit, a fail-on-revert row
and a regression in the behaviour I9 exists to protect.

**What changes instead is S1.** The drawing claimed a mechanism that contradicts a settled
invariant, which is F11's class one step further in: not a drawing wrong about the far
side's output, but a drawing wrong about the framework's own rules. `DOCKER_TUI_SURFACES.md`
now says the landing block ticks until evicted or cleared, and the launch seam declares its
part one-shot if launch cheapness matters more than a live landing screen.

---

## F18 — a live part looks exactly like a static one

| | |
|---|---|
| **Surface** | S1's `▌` gutter, drawn on the running panel |
| **Reached for** | any mark distinguishing the refreshing panel from the static chrome |
| **Verdict** | **a real Calcium finding**, small, and the app must not work around it |

S1 and S13 both draw `▌` down the side of the live region, and C09's glyph table has a
`live` slot for exactly that (`▌` unicode, `|` ascii). The driver's `livePanel` builds
`{ kind: "panel", id, title, children }` — a plain panel. Nothing renders the slot, so in a
frame the live panel is a box with a title, indistinguishable from the static one wrapping
it until something happens to change.

The app cannot fix it. `Panel` has no glyph field, and putting `▌` in the title means writing
a character instead of naming a slot — which is F6's mistake made deliberately, and it would
not degrade to `|` on an ASCII terminal.

So the vocabulary has the slot, two surfaces draw it, and nothing connects them: a slot
reserved and unreachable, which is A03 §2's class in the glyph table.

---

## F19 — `ManifestDocument` accepts the one value construction refuses ★★

| | |
|---|---|
| **Surface** | none of this app's. Found by tier 5, three weeks of commits after F7 |
| **Reached for** | nothing — the type said yes and the runtime said no |
| **Verdict** | **a real Calcium finding**, and the reason F7's fix shipped broken |

F7's fix made `createTui` run both arms of `TuiConfig.manifest` through `parseManifest`,
so the framework appends its own six verbs rather than demanding the author know them.
C05 §3 also *refuses* a document that already declares `help`, `clear`, `theme`,
`history`, `debug` or `exit` — an app must not shadow verbs it does not own. Both correct.

Together they mean **an already-parsed `Manifest` is now exactly what construction
rejects**, and step 1 wrote a test asserting that (C22 T1.4l). What step 1 did not do was
check whether the *type* still permitted it:

```ts
export type ManifestDocument = Omit<Manifest, "appTools">;
```

`Manifest` has every member of `ManifestDocument` and one more, so it is structurally
assignable to it. `const d: ManifestDocument = parsedManifest` compiles clean. The field's
type says a parsed manifest is welcome; the constructor throws on it.

**And that is not hypothetical, because it is what happened.** `test/support/fixture.mjs`
— tier 5's only session harness — passed `parsed.value` to `createTui`, with a comment
explaining that this was required. It compiled. **Forty-four of a hundred and one tier-5
rows failed**, and the branch merged.

Three harnesses were converted with the F7 fix and this was the fourth. It was invisible to
the search that found the others because it is `.mjs` importing from `dist/`, so no grep for
a deep TypeScript import could see it, and `npm test` excludes tier 5 by design.

**The type is the fix.** A nominal marker — a branded `Manifest`, or a `parsed: true`
witness — makes the mistake a compile error at every call site at once, which is the only
scale at which it can be caught: the value is produced in one place and consumed in
another, and nothing in between is wrong. This is the *consumer finds variance a producer
cannot* shape with the arrow reversed — here the producer's own test suite was the
consumer, and the boundary it crossed was `.ts` to `.mjs`.

**A note on how it was reported, because that is half the finding.** Step 1 was declared
green on `make all 2>&1 | tail -15; echo $?`, which reports **`tail`'s** exit status. The
suite had failed. The same construction was used twice more this session before it was
noticed, and the second time the symptom was blamed on machine contention. An exit code
read through a pipe is the pipe's.

---

## Open, not yet reached

Recorded so their absence is a decision. Each gets an entry above when the surface that
needs it is built.

- **Gap 7 — a `b.live` part hosted by a pushed view** (S3). The driver's `view` host arm,
  specified and shipped tested against an entry host only. The most valuable thing this app
  can surface, and step 3 reaches it.
- **Gap 3 — value-colour vs tone-colour.** A CPU bar encodes load on a continuum; Calcium's
  palette is tone slots. Step 2.
- **Gap 1 — history across ticks.** `b.live` re-renders from the latest fetch; a sparkline
  needs the previous values. Adapter ring-buffer first, and keyed by tick rather than by
  time — F10 found that neither docker nor `AdapterContext` supplies a clock.
- **Does a `b.live` entry freeze on the next command?** S1's claim is that the launch entry
  freezes into the transcript when something is typed. Asked against the working
  `/dashboard` before F9's seam is designed, because if freezing a live entry has its own
  gap the seam has to know. This is C22 §8a's I7/I5 conflict made concrete: a live first
  entry is exactly the *restored session* the paragraph anticipated.
- **`b.live`'s `stream` arm.** F10 rules this app onto `fetch`, so `stream` stays in the
  position `RefreshHost`'s `view` arm held before step 3 — specified, implemented, unreached
  by any consumer.
- **The line budget — over, at 354 of 300** (comments and blanks stripped; `src/*.ts` plus
  `bin/docker-json`). R01 commitment 1's rule is that exceeding it is a finding about
  Calcium rather than app bloat, so here are the lines that did it:

  | lines | what | why it is generic |
  |---|---|---|
  | 22 | `src/ndjson.ts` | C06 parses the whole of stdout as one document and hands adapters the raw string when that fails. Every `--format json` far side is NDJSON. DEPENDENCIES.md already argues an NDJSON parser is not a dependency because `node:readline` exists — true, and neither is reachable from an adapter |
  | 11 | the `meta` block in `createDashboardHandler` | F13. `compose()` fills all nine fields and is not exported; seven of them describe a subprocess that never ran |
  | 9 | `bar()` and its width arithmetic | Gap 3. A value-coloured bar with a reserved glyph slot, because tones are severity and `b.progress` is a labelled progress bar |
  | 6 | the collapse-the-tail decision | *Show N, then say how many are hidden* is a density decision every live list makes, and each one will get the `N = 1` boundary wrong on its own |
  | 2 | `width()` in `main.ts` | F14. C01 already knows this number and a local handler is not told it |
  | **50** | | |

  **As a prioritised list of what the consumer surface lacks**, which is what the budget is
  a proxy for. Ordered by what a second app would hit first, not by line count:

  | # | the affordance | who needs it | shape of the fix |
  |---|---|---|---|
  | 1 | **an NDJSON-aware transport** | every far side that speaks `--format json`, which is most modern CLIs | C06 already retains `stdoutRaw` when the whole-document parse fails (I6). One step further — a per-line parse behind a flag on the tool, or an exported helper — and no adapter writes this again. It is also 22 of the 50 lines |
  | 2 | **`compose` on the public surface** (F13) | every local handler, which is every app-owned verb | Export it, or overwrite `meta` on the local route as C07 I13 already does on the adapter route. The argument is C07 I13's own: *a provenance an app author supplies once per verb is a provenance that is wrong somewhere* |
  | 3 | **a value bar** (gap 3) | anything rendering a quantity — CPU, disk, progress toward a limit | `b.progress` is a labelled progress bar and tones are severity slots, so a load bar borrows `warn`/`error` and means neither. Needs either a value-scale primitive or a documented ruling that severity is the only axis |
  | 4 | **width for a local handler** (F14) | every app-owned verb that lays anything out | Two lines in the app and wrong across a resize. `AdapterContext` already carries `width`; `LocalContext` carries `command` and nothing else, and nothing argues a local verb needs less |
  | 5 | **a density helper** | any live list longer than the panel | *Show N, then say how many are hidden*, with the `N = 1` boundary decided once. Six lines here, and every app will get that boundary wrong independently |

  354 − 50 = **304**, against a budget of 300. That is close enough to the line that the
  arithmetic should not be leaned on — the point is not that the budget is exactly right,
  it is that **every line of the overrun has a name and an owner**, and none of them is
  docker. R01's claim was that an app over 300 lines has been made to write something
  generic; five things, and the largest is a parser for the format the framework's own
  transport could not read.
