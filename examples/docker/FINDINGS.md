# docker-tui — findings

**Triaged in [`TRIAGE.md`](TRIAGE.md)** — the same forty-four grouped by shape and ranked by
how many surfaces hit them. This file is the log, in the order things were found; that one
is the view a reader deciding what to do next needs. Past thirty entries, *filed* stops
telling anyone which are one change and which are forty.

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

**The object arm** throws at construction: *"the manifest is missing Calcium's own verbs
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

## F9 — startup step 7 named the effect and had no mechanism ★★ · **closed**

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

**And the entry above was wrong about the shape of the gap, which is worth keeping.** It
said no seam was specified. One was: **§4 step 7, *"fire banner fetches, non-blocking"***,
present since the document was written — with prose about its timing, and with T3.10 and
T3.11 testing it. Nothing in `src/` fired anything, `TuiConfig` had no field, and neither
T-row had ever been written, because there was nothing to write them against.

So the gap is not *unspecified* but **a step with a name and no mechanism** — and C22 §3a
already records that happening once, to step 12: *"accept input" was a step with a name and
no mechanism, and a session built from this document decoded nothing while every component
it needed was finished and tested.* Twice in one twelve-item list is a property of how the
list was written rather than two accidents: a step is a name until something calls it, and
nothing distinguishes the two by reading.

Finding it required looking for the *mechanism* rather than for the *field*. The first pass
grepped `TuiConfig` and the construction steps, found nothing, and concluded correctly from
incomplete evidence.

**Closed by C22 I44.** `config.greeting: () => ViewDocument | Promise<ViewDocument>`, fired
at step 7 and not awaited; C23 appends it, which is A02 Seam 4 and what makes a `b.live`
part inside it driven (C23 I33a). T3.10 and T3.11 are rewritten and written. The app's
launch frame is the dashboard, with nothing typed:

```
┌ docker-tui · engine 29.4.1 · 8 containers ───────────────────────────────┐
│┌ RUNNING ────────────────────────────────────────────────────────────────┐│
││3 running   CPU 1% · MEM 3%                                              ││
││● g2                      ░░░░░░░░ 0.9%  …    →  1.1% one capture later  ││
```

**The ordering was still right.** The seam was designed after the dashboard worked, and it
is why the seam has no freeze mechanism in it: building it first would have meant building
S1's drawn *freeze on first command*, which C23 I9 forbids. See F17a.

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

## F20 — gap 7's premise was false, and its answer is a reserved ruling ★★

| | |
|---|---|
| **Surface** | S3's drill-in, and the whole of what step 3 was pointed at |
| **Reached for** | a route by which an app's `b.live` part is hosted by a pushed view |
| **Verdict** | **a finding about the design documents**, and the ruling it uncovers is C22 §13's |

Gap 7 was filed as *"the driver's `view` host arm, specified and shipped tested against an
entry host only"* and called the most valuable thing this app surfaces. It is, and the
premise was wrong. Answered by reading, before a probe was built:

| gap 7 asks | answer |
|---|---|
| Does `declare` accept a `view` host and tick it? | **Yes, and has since C23 §3b landed.** `test/contract/refresh.test.ts:535` — T4.21, cited to C24 I12 — declares `{ kind: "view", id: "dash" }`, asserts the part patched through C15's seam, then that `release` stops it. T2.20 declares one host of each kind and asserts `dispose` stops both |
| Does `release` on **pop** reach it? | **No call site exists.** A popped view is torn down lazily, one tick late, when `put` returns false against a layer that has gone (`refresh.ts:317`, `:326`) |
| Does a refresh hold the **scroll**? | **The question has no subject.** C15 holds no offset *by design* — `overlay/manager.ts:10-15`: *"it does not know … where a view has scrolled. Each of those was written into the spec as a duty here and moved back to the owner"* — so the offset belongs to the producer, and there is no producer |

**What is missing is not coverage. It is a producer.** `declare` has exactly one call site
in all of `src/` (`execution.ts:938`) and hard-codes `{ kind: "entry", id }`. T4.21's own
comment says so: *"The host arm with no shell-level producer. Nothing in the tree pushes an
app-supplied view yet."*

All three questions therefore trace to one row, which names itself:

> **C22 §13** — **A verb whose result is a pushed view.** *Still undecided, and narrower
> than it was.* … What makes a **verb's result** a view rather than a transcript entry, who
> decides, and what `Esc` does to the entry it came from are all exactly as open as they
> were. … **Recorded this way because a partial producer is the most likely thing to be
> mistaken for a resolution.**

So gap 7 is not a defect to fix. It is a decision the framework deliberately left open,
with a written warning about the precise way it would be misread, waiting for a consumer
concrete enough to force it. That is the difference between this and F7, F17 and F19: those
were wrong. This was **reserved**.

**Five sites asserted the false premise** and are corrected in the same commit:
`DOCKER_TUI_SURFACES.md` §S3's seam section, `:268`, `:281`, `:560`, `FINDINGS.md`'s open
list, and `DOCKER_TUI_START_HERE.md:140`.

**And one test's assertion names a mechanism it does not exercise.** T4.21 closes with
`expect(calls, "and the pop stopped it")` while the test calls `release(host)` directly —
there is no pop, and release-on-pop is the thing that does not exist. The assertion is
correct and its message describes a route that has never run.

---

## F21 — the action model has no route from a keystroke ★★

| | |
|---|---|
| **Surface** | S3's drill-in gesture, and every row action every surface draws |
| **Reached for** | pressing a key on a focused row and having its action fire |
| **Verdict** | **a real Calcium finding**, and the one that was actually under gap 7 |

`src/shell/actions.ts` implements all five `Action` arms — `fill`, `exec`, `open`, `expand`,
`view` — and is wired into the pipeline at `execution.ts:837`. **`pipeline.onAction` is
called only from `test/unit/execution.test.ts`.** Nothing in `src/` invokes it. `paint.ts`
builds every render context with `theme` and `capabilities` alone (`:136-139`), so
`RenderContext.onAction` falls back to the no-op at `render-lines.ts:65`.

An app can build a `{ kind: "view", label, target }`, have C04 validate it and C09 render
its label into a row's action bar, and **no keystroke will ever reach the dispatcher**. This
is C24 I16's own subject — *"a consumer could declare a refreshing part, type-check, and
never be called"* — arriving on `Action` rather than on `ViewRefresh`.

Three things compound it, and each is separately true:

- `TuiConfig` has no keymap seam. `construct.ts:564` is `createKeymap(defaultKeymap)` with
  nothing merged in.
- The `liveBlock` target has three bindings — `escape`, `down`, `up` (`keymap.ts:276-278`).
  There is **no `enter`**, and no `rowActivate` in `KeyAction`, which is a closed union.
- `BlockKeymap` is exported and dead: no block field carries one, and `Keymap.mergeBlock` is
  called only from `test/unit/router-keymap.test.ts`.

So `/ps` renders a table you can move a cursor through and cannot act on.

**Gap 7 predicted the right place and the wrong mechanism.** It said the view arm was
untested; the view arm ticks fine, and what is missing is the route from a key to the action
that would push a view. Worth recording as a miss rather than a hit: the prediction was
**wrong about the mechanism and right that a gap was there**, which is F17's shape — the
answer was a third thing rather than either of the two offered. A prediction scored as
simply correct teaches nothing about how it was reached.

---

## F21b — the fork was drawn wrong, and the source corrected it ★★

| | |
|---|---|
| **Surface** | S3, and which ruling step 3 was about to settle |
| **Reached for** | a decision on whether S3's drill-in is an affordance or a verb's result |
| **Verdict** | **not a defect** — a design-authority ruling that failed review, caught by reading |

Gap 7's three answers were put as a fork: is S3's `⏎`-on-a-row an **affordance on a block**
(the C25 shape, which §13 says answers none of its question) or a **verb's result** (the
case §13 reserves)? The fork was framed, and ruled *affordance*, **before
`docs/behaviours/B03_drill_chain.md` §2 had been read.** §2 answers it outright:

> **There are exactly two, and confusing them is the mistake this document exists to
> prevent.**
>
> | | Append | Push |
> | Used by | **`⏎` on a row**, every action `fill` | `--logs`, `/dashboard` |

`⏎` on a row **appends**. An action never pushes — it `fill`s. B03's canonical path
(`:49-50`) shows the real gesture as two steps: `≡ logs` is a `fill` that writes
`/ps a3f9b21 --logs` into the prompt, and the *next* `⏎` submits it and pushes. S3's drawing
showing *"`⏎` on a `ps` row pushes a view"* is compressed notation for that, not a third
mechanism.

Had the affordance ruling stood, it would have installed precisely the confusion B03 exists
to prevent — and it would have been found after the producer was built, not before.

**Filed alongside F17a, and for the same reason.** F17a records an instruction that would
have re-introduced a deleted row; this records a fork drawn from incomplete evidence and
corrected by the source. A record that logs only the framework's errors is measuring one
side of the work.

**The general form is the one already in CLAUDE.md**: a correct conclusion from incomplete
evidence is still wrong. F9 grepped for a field when the seam was a step; this read §13 and
C25 without reading the behaviour document that governs both.

---

## F22 — `gapBefore` cannot be carried on the view arm

| | |
|---|---|
| **Surface** | S3, the first view that will hold more than one block |
| **Reached for** | nothing yet — found while reading `put` for gap 7 |
| **Verdict** | **a real Calcium finding**, dormant until its subject exists |

`put` carries a part's `gapBefore` across a refresh by reading the block currently in place
(`refresh.ts:254-258`), and the comment above it explains why — the declared panel has a gap,
a replacement built fresh does not, and *"the document's rhythm therefore changed on the
first tick, with the part's own content correct and every assertion about it passing"*. C04
I25 makes that the renderer disagreeing with the declaration. It was found by looking at a
frame.

**The fix reaches one arm of two.** `currentPanel` reads the real block on the entry arm —
`entry.doc.blocks.find(...)` — and on the view arm *reconstructs* one through `livePanel`
(`refresh.ts:367-375`), which sets no `gapBefore` (`:79`). So `existing?.gapBefore === true`
is structurally always false for a view host. C24 I12 says `b.live` *"behaves identically in
a transcript entry and in a pushed view"*, and here it cannot.

**Observability was established before this entry was written, not assumed.** A layer's
content goes through `measureSequence` (`overlay/place.ts:110`, `:128`) and
`renderSequenceToLines`, both of which honour `gapBefore` — *"the only thing in C04's
vocabulary that produces vertical space"*. But C24 I17 strips the **first** block's gap, and
the only view that has ever existed holds exactly one block (`patch-view.ts:95`,
`content: [windowPatch(...)]`).

So the branch has been dead for the whole life of the code and wakes the day a view holds
two blocks — which is S3, with its plot, its MEM/NET block and its static ports/mounts.
**An invariant is vacuous until its subject exists**, arriving on a fix rather than on a
rule.

---

## F23 — `view: true` on a local tool is accepted and does nothing

| | |
|---|---|
| **Surface** | S3, while choosing its route |
| **Reached for** | a local verb that pushes a view |
| **Verdict** | **a real Calcium finding**, filed rather than fixed |

`asView` is computed in `runApp` (`execution.ts:596`) and nowhere else. `runLocal` (`:408`)
never consults it, so a `local: true` tool declaring `view: true` parses, seals, validates,
runs — and appends a transcript entry, silently, exactly as if the field were absent.

C05 I20 refuses `view` with `interactive` and with `oneShot`, both because the flag would be
inert and A03 §2's vacuity class in a manifest is what I19 exists to prevent. `view` with
`local` is inert in the same way and is refused by nothing.

**Filed, not fixed, and the reason is not cost.** The repair is to extend the local route,
because `/dashboard` is local and S6/S7 will want views; refusing the combination would
foreclose them to close a hole. What this app can prove today is that the combination is
reachable and silent, and it proves it by having had to route around it.

---

## F24 — a live part re-renders with no width ★★

| | |
|---|---|
| **Surface** | S3's plot, whose window length is a display decision |
| **Reached for** | a sample count that suits the terminal |
| **Verdict** | **a real Calcium finding** |

`LiveSpec.render` is `(data: unknown) => Block` (`builders/types.ts:126`). Data, and nothing
else — no width, no context. So anything width-dependent inside a live part is fixed when
the document is built and cannot follow a resize.

S3's plot is the concrete case. `form: "line"` does no windowing, so the ring's length *is*
the window, and one sample per column is the density that neither downsamples nor stretches.
The cap is taken from `AdapterContext.width` when the view opens and is wrong from the first
resize afterwards: a view opened at 120 and read at 80 draws two samples per column.

**F14's shape, one layer over, and worth separating from it.** F14 is the *local* route
lacking width. This is the *refresh* route lacking it, and it bites the adapter route too —
`ctx.width` is available at build and gone by the first tick. The app cannot compensate: the
only other source is `process.stdout.columns`, which would be a second place the terminal's
width lives, and C01 I13 exists to prevent exactly that.

---

## F25 — the dashboard takes a width it never reads

`dashboard(snap, width, engine)` (`dashboard.ts:368`) accepts a width and uses it nowhere.
`createDashboardHandler` threads it in from `main.ts`'s `width()`, which is F14's workaround
reading `process.stdout.columns` — so the app pays F14's cost for a parameter no code
consumes. Found while looking for whether the width reached a live part at all (F24).

Small, and left in place rather than removed: the day a local handler is handed a width, the
parameter is the seam it arrives on. Recorded so its uselessness is a decision.

---

## F26 — `docker stats` streams by default, and a request/response transport cannot consume it

The same class as F1, and the second line the shim carries. `docker container stats` without
`--no-stream` redraws a region forever and never exits; C06 invokes and waits for the
process to end, so the verb would hang rather than fail. `bin/docker-json` supplies the flag
for that verb only.

**A translation, not a workaround, and the boundary matters.** The shim adds a flag docker
has; it does not rewrite a verb. The shim earning its keep on a second far-side mismatch is
evidence for F1's argument rather than against it — the framework's contract and the far
side's defaults disagree in more than one place, and an app is where they are reconciled.

One thing the shell found: `[ … ] && …` as the script's last command is a non-zero exit under
`set -e`, so the short form of the guard would have made the shim fail for every verb that is
not `stats`, after docker's output had already been written. Covered by S2.4.

---

## F27 — `b.plot` could not pin an axis or label one ★★ — **the pin is fixed**

| | |
|---|---|
| **Surface** | S3's CPU plot |
| **Reached for** | `yMin`, `yMax`, `xLabels` |
| **Verdict** | **a real Calcium finding**, and the frame is the evidence |

The `Plot` block carries `yMin`, `yMax`, `yFormat`, `xLabels` and `emptyMessage`. The builder
passes `series`, `height` and `axes` (`builders/index.ts:283`) and nothing else, so an app
using the public surface cannot reach any of them.

**The consequence is not cosmetic, and only the frame showed it.** A container pinned at 100%
CPU renders like this:

```
│100.21 │⠑⠢⢄⡀                                                    ⣀⠤⠒⠑⠢⢄⡀
│       │   ⠈⠑⠢⢄⡀                                            ⢀⡠⠔⠊      ⠈⠒⠤⣀
│100.02 │                          ⠈⠑⠒⠒⠒⠒⠒⠢⠤⠤⠤⠤⠤⠤⠤⠤⠤⢄⣀⣀⣀⡠⠔⠊⠁              ⠈⠑⠢⢄
```

The axis auto-ranges to the data, so **a 0.2% wobble is drawn as a mountain range**. A reader
sees a load swinging violently; the load is flat at 100%. `yMin: 0, yMax: 100` would say the
truth in one line and cannot be written. The block type has had the field the whole time.

Second half, smaller: with no `xLabels`, the horizontal unit has to be a separate notice
block — which is why S3's caption exists and why walk B1 had to rule on where it lives.

### Resolved in part, and the parts are not the same size

**`yMin` and `yMax` now pass through the builder** (C24 §4, spec-first), and S3 sets
`yMin: 0`. The frame before and after, same container held at 100%:

```
before   99.93 … 100.83     a 0.2% wobble drawn as a mountain range
after    0 … 50 … 101       a flat line at the top, which is the truth
```

A second-order gain nobody designed: the axis labels shortened from six cells to four, so the
plot itself got wider. **No `yMax` on S3**, deliberately — DASHBOARD_WALK A4 ruled `CPUPerc`
per-core-normalised, so 780% is ordinary on an eight-core host and C04 I29 clamps rather than
drops; a ceiling would render a busy container identically to a saturated one.

**The other three stay unexposed, each for its own reason**, written into C24 §4 rather than
left as an omission: `yFormat` is a trap in the shape a caller wants it (F31), `xLabels` is a
fixed three-tuple that cannot hold S3's caption sentence, and `emptyMessage` has no consumer.

**And the shape of this finding is worth keeping.** C12 implemented all five fields, its
tests were right, and every one of them passed — the mechanism was complete and *unreachable
from the public surface*. A green suite over a mechanism nobody can invoke, which is MG25's
class arriving from the consumer's side rather than the producer's.

---

## F28 — an app cannot reach the live parts it just declared

`b.live` records its `LiveSpec` in a `WeakMap` beside the document (`builders/live.ts:30`),
and neither the map nor `liveDeclarations` is exported. So an app that builds a document
holding live parts cannot get at the `fetch` or `render` it supplied — the declaration is
write-only from the app's side.

The cost is to testing, and it is the cost that matters here: a `fetch` can only be exercised
by running the whole refresh driver, which needs a shell, a transport and a clock. S3 works
around it by exporting `createCpuTick` so the tick has a seam, which is honest but is the app
building a testing affordance the framework withheld.

**And that shape is the one this branch already paid for.** Four defects in the previous
stretch survived a green suite because every row called a mechanism directly and nothing
called the wiring. A framework that makes the mechanism unreachable pushes every consumer
toward whole-stack tests or none.

---

## F29 — the framework's own default `renderError` could not be constructed ★★★

| | |
|---|---|
| **Surface** | S3, during an induced stall |
| **Reached for** | nothing — this is what runs when a live fetch fails |
| **Verdict** | **a real Calcium defect, fixed**, with this app as the consumer proving it |

`partOf` builds the default error notice with `block()` rather than `b.notice`
(`execution.ts:1030`), so it skipped `glyphFor` and produced `tone: "error"` with **no
glyph** — which C04 I6 refuses and `block()` enforces. The one thing that runs when a live
part's fetch fails could not be constructed at all:

```
BlockShapeError: notice "cpu-error": tone "error" requires a non-empty glyph (C04 I6, D29)
    at requireGlyph (dist/data/viewmodel/construct.js:64:11)
    at Object.renderError (dist/shell/execution.js:870:34)
    at dist/shell/refresh.js:197:43
```

Thrown out of a `.then` inside the refresh driver: **unhandled, one tick after any fetch
failure, on any part whose declarer did not override `renderError`.** The frame showed a view
frozen mid-tick with the exception on stderr behind it — and a frozen live panel is exactly
what a slow far side looks like, so nothing in the frame said *defect*.

**A03 §2's vacuity class, in a default.** Every existing test either succeeds or supplies its
own `renderError`, so the branch had never run — and a branch that has never run passes
exactly like one that works. Forty lines above, the *stream*-failure path constructs the same
notice **with** the glyph, so the pattern was known and missed in one place.

Fixed, with `T1.40` driving a rejecting fetch through the pipeline and asserting the notice
is rendered rather than thrown. Reverting the glyph kills that row and only that row.

**It took inducing a stall to find, which is the part worth keeping.** Two frame-reads of a
healthy container at two widths saw nothing — the path only runs when a fetch fails, and
nothing about a working view suggests it exists. `docker rm -f` on the watched container,
mid-capture, is what produced it.

---

## F30 — `Comparison` has no `added` or `removed` verdict

Its union is `same | better | worse | changed` (`viewmodel/types.ts:315`), and S7's own
drawing marks a row `▐ added`. The drawing showed a verdict the block has never had.

**Absorbed rather than filed as a blocker**: absence goes in the *data*, so a field present
on one side only renders `changed` with the absent side as `—`. Filed rather than fixed by
extending C04 because `same`/`changed` is a **change** axis and `better`/`worse` a
**judgement** axis — the union already mixes two, and a third pair wants a ruling about what
the field means rather than one more member.

---

## F31 — `yFormat: "percent"` expects a fraction, and the callers that want it do not have one

`formatValue` returns `${Math.round(v * 100)}%` (`plot/axes.ts:28`). So `percent` wants
`0.84`, and every far side that emits a field *called* a percentage emits `84`. Docker's
`CPUPerc` is `100.2%`, parsed to `100.2`; the obvious call renders **`10020%`**.

This is why `b.plot` exposes `yMin`/`yMax` and **not** `yFormat` (F27). The format is correct
for the loss curves C12 was written against and a trap in the shape a CLI-wrapping consumer
reaches for. Fixing it means a second format or a documented sentence at the call site, and
neither is a builder change.

---

## F32 — three passes on one sentence, each accurate about what it had measured ★★

Not a Calcium finding. A finding about **how this record gets written**, and it earns an
entry because otherwise a fourth reader measures a fourth pair.

| pass | claim | what it had measured |
|---|---|---|
| 1 | the image's `Config` carries `ExposedPorts` and `StopSignal`, the container's does not | one service-image pair |
| 2 | the shape varies by image, so no fixed key list works | two *images*, no container |
| 3 | **a container's `Config` is the image's inherited, then filled with runtime fields** | both sides of both pairs |

Pass 3, measured: **zero image-only keys and twelve container-only, on both pairs**, image ⊆
container. Pass 1 was true of `nginx:alpine` and false of `typescript-node:22`. Pass 2 was an
inference — image keys measured, container keys assumed — and the inference was reasonable
and wrong.

**The failure is not error. Every word of every pass was accurate; the scope was not.** A
true observation promoted to a general claim reads exactly like a general claim, and review
cannot separate them. The method that can: **a claim about how two things relate needs both
measured**, and *"I measured A and inferred B"* is the shape to distrust.

Pass 2 was written one message after the lesson from pass 1 was recorded. Knowing the failure
mode does not prevent it — from the inside a wrong generalisation is indistinguishable from a
right one. Same shape as F20 being filed against T4.21 and the identical test being written a
branch later.

**And it paid for itself**: measuring the second pair produced `nginx:alpine` as the drift
fixture, which carries every field kind and both tally arms in one container.

---

## F33 — `Comparison` cannot label its columns

The renderer hard-codes `field`, `a` and `b` (`blocks/kinds/structured.ts`), and the block
type carries no header fields. Both drawings show labelled columns — S6's
`FIELD | api-gateway | worker-1`, S7's `FIELD | image (nginx:1.25) | running` — and neither
is expressible.

What a reader sees:

```
field                    a                        b
ports 80/tcp             exposed                  → 8080
```

`a` and `b` are the type's field names leaking onto the screen. The renderer's own comment
defends them as *positional rather than directional*, which is right about the **type** and
does not follow for the **header**: a consumer that knows which side is which cannot say so.

Absorbed with a `keyValue` block above the comparison naming the two sides. That works and it
is not the same thing — the mapping is one block away from the columns it explains.

---

## F34 — a comparison's verdict is colour and nothing else ★★ — **the checker's blind spot is fixed**

`comparisonTone` maps `better → ok`, `worse → error`, `same → muted`, and everything else to
`default`. That tone styles the `b` cell. **There is no glyph, no mark, and no verdict
column** — the drawings show `▐ changed` and `▐ differ`, and neither exists.

So a `changed` row and a `same` row differ **only in colour**. C04 I6 makes exactly this
argument for notices and cells — *colour alone survives neither 1-bit nor a colour-blind
reader* — and `block()` enforces it there. The comparison block is where the framework does
not hold itself to it.

**Bounded honestly, and the bound moved once it was measured.** Two of the four verdicts are
recoverable and two are not:

- **`same` and `changed` survive without colour.** The two cells sit side by side and either
  read alike or do not — a reader derives the verdict from the row itself. So frame-read 2
  is safe, and so is the `/drift` surface as built.
- **`better` and `worse` do not.** `200ms` against `150ms` says nothing about which is
  wanted, and the tone on the `b` cell is the only thing that does. Nothing in `field`, `a`
  or `b` expresses a judgement, and `ComparisonRow` has no glyph field to put one in.

So the first write-up of this entry — *"a `changed` row and a `same` row are identical"* —
overstated it, in the same way F32's first pass did: accurate about the mechanism, wrong
about the consequence. Closing the half that is real means a glyph on `ComparisonRow`, a C04
spec change, recorded there.

### The checker had a blind spot, and that half is fixed

`expectDocument().degradesTo1Bit()` ends in `hasNoColourOnlyDistinction`, whose whole job is
finding meaning carried by colour alone. It switched on `block.kind` and ended
`default: break`:

| | kinds |
|---|---|
| checked | 4 — `notice`, `keyValue`, `pills`, `table` |
| traversed | 2 — `panel`, `group` |
| **passed in silence** | **11**, including `comparison` |

`validate.ts` has solved exactly this since T2.10 with `Record<BlockKind, KindCheck>` —
*"a new kind without a row here is a type error, not a silent pass"* — and the compliance
sweep, in the same package, had the opposite property. **A03 §2's vacuity class in the
checker**, found because a consumer built the one block kind it skipped.

Fixed: the default now asserts against an enumerated
`KINDS_WITH_NOTHING_TO_CHECK`, each entry carrying the fact that makes it nothing —
`logs` prints its level, `steps` selects a glyph from `state`, `plot` substitutes stacked
strips at one bit, and seven kinds carry no meaning-bearing field at all. `comparison` is
listed as a schema gap with its reason, the disposal `pills` and `keyValue` already had.

**T2.13** drives the corpus through it, so a kind added tomorrow and wired nowhere fails
there. **T2.13b** drives an *app-registered* kind, which is the property T2.13 cannot reach:
with every shipped kind accounted for, deleting the guard kills nothing, because its subject
is a kind that does not exist yet. A registry takes kinds the union has never seen — that is
what makes C09 §3's extension mechanism real — so the alien kind is the case an app hits
first, and before this the sweep reported it compliant without looking at it.

**One measurement in this entry was wrong twice before it was right.** The count above first
read *four of eleven carry a meaning-bearing field*; a regex reading the type declarations
ran past `}> & Gap;` and attributed a neighbour's `tone` and `glyph` to `Rule`. `Rule` is
`{ kind, id, label }`. The compiler is what said so, and the true count is **two** —
`steps` and `comparison`.

---

## F35 — an invalid document is discarded, and the command vanishes ★★★

| | |
|---|---|
| **Surface** | `/drift no-such-container` |
| **Reached for** | an error entry |
| **Verdict** | app-side defect ×3, on a framework path that reports nothing |

`transcript.append` validates and throws (C13 I10). `appendAndCommit` catches, discards the
outcome and commits the frame anyway — C23 §5's *one stage whose failure loses the outcome*,
documented and deliberate. **For an app author the effect is that a malformed document is
indistinguishable from a verb that did nothing**: prompt clears, transcript unchanged, no
notice, no stderr, nothing.

The frame that found it:

```
❯ /drift no-such-container
❯
```

The cause was mine and there were **three of them**: `/drift`'s error document, `/ps`'s
failure arm and `/container stats`'s, all setting `status: "error"` and omitting `error`,
which C04 I3 requires. Two had shipped. **None had ever run**, because no frame-read has yet
had docker fail on those verbs — and a suite of 91 rows agreed with all three.

Closed as a class rather than as three instances: `test/documents.test.ts` runs every
document the app can produce through `validateDocument`, failure arms first, with a control
proving the failure arms are failures and a control proving the validator refuses the
stripped shape.

**The framework side is not a defect and is worth stating anyway.** C23 §5's swallow is
argued and correct — an escaping failure would be worse. But the swallow has no diagnostic
channel at all, and the layer that knows exactly what was wrong with the document is the one
that throws it away.

---

## F36 — an app cannot validate a document it built

`validateDocument` is not exported (`src/index.ts`). An application therefore has no way to
check the one thing the layer below will silently refuse (F35), and the test that closes
F35's class reaches it by deep import — `../../../dist/data/viewmodel/index.js` — which is
not a thing an application may legitimately do.

The alternative is asserting C04 I3 by hand in the app, which encodes the rule in a second
place and would agree with a document the framework rejects. Same shape as F28: the
framework holds a check the consumer needs and does not offer it.

---

## F37 — no producer can see the region, and one cannot measure a block either ★★★

**The threshold a view's producer needs is unreachable from the only two places that build
a document.** `AdapterContext` carries `width` and no height (`data/adapters/types.ts`);
`LocalContext` carries `command` and nothing else; and reading the terminal is forbidden
outside `terminal/lifecycle.ts`. So an app deciding how to divide content for a **pushed
view** — whose whole bound is the region — has no legitimate way to know what it is
dividing against.

`INSPECT_WALK.md` B1 ruled *"split by keys while a block overflows the region, and measure
to decide"*, and the code falsified it within an hour. What is reachable is a **declared
floor**, and the asymmetry is what saves it from being the fixed constant the walk rejected:
over-splitting costs granularity, under-splitting strands rows a reader cannot reach, so a
floor is correct at every region above it and honest below. `SPLIT_FLOOR = 21` is a 24-row
terminal's region — measured, 114 blocks, **0 rows stranded at 40 rows and 3 at 24**,
against 208 stranded by no split at all.

**The second half is that the app cannot measure a block.** `createBlockRegistry` is not
public, so `codeRows` reimplements the measurer's arithmetic — exactly the drift CLAUDE.md
forbids. `cells` *is* public, which is the sanctioned half; the rest is pinned against the
real measurer by deep import (`test/inspect.test.ts` I1), and **it caught the arithmetic
being wrong on its first run**: 69 against 68, because a code block wraps at the full width
and the first version assumed a border inset.

Same family as F14 (a local handler has no width) and F36 (an app cannot validate). Three
instances now of *the framework holds a fact the consumer needs and does not offer it*, and
this is the first where the missing fact is the one the surface is defined by.

---

## F38 — a drawing's footer promises a key with no binding

S5 draws `r raw` in the view's footer. There is no plain `r` at the `pushedView` target —
`keymap.ts` has `Ctrl-R` at `prompt` and at `overlay`, and nothing else. A toggle is a C16
keymap change *and* a mode the view does not hold, so `--raw` is a flag in this step.

Fourth time a drawing has committed the framework to something unbuilt (F4, F11, F30's
verdict, this). Filed rather than fixed: a view that re-fills itself from a mode it holds is
a real feature, not a binding.

---

## F39 — a flag that selects a rendering is sent to the far side ★★★

**Every flag a `ToolDef` declares is transmitted.** C06 I4 sends argv over verbatim, which
is right for `--all` and wrong for `--raw`: `/inspect <c> --raw` ran
`docker inspect <c> --raw` and docker exited 125 with `unknown flag: --raw`. There is no way
to declare a flag that selects a **rendering** rather than an invocation.

**Found by reading the frame, and the suite could not have found it.** All twelve rows for
this verb passed, because they hand argv to the adapter directly and never spawn anything —
the tests cover the mechanism and this is the wiring. The recurrence CLAUDE.md names, in the
place it keeps happening.

Absorbed by the shim, which now strips `--raw` for `inspect` before `exec docker`. The
adapter still sees it, because `RawResult.argv` is what Calcium built rather than what
reached the binary. Third translation in that file and the first that is not about docker's
shape at all — `--json` and `--no-stream` are about the far side; this one is about the
framework having no place to put a presentation flag.

---

## F40 — the document view measured its window a block at a time ★★★ — **fixed**

A rendered sequence separates its blocks, so *n* blocks occupy *n* rows more than the sum of
their heights. `document-view.ts` projected by adding `measure(block)` one at a time, so it
packed nearly twice what the region holds and C15 cut the excess in silence. The registry
has `measureSequence` and C14 is already given it; the view was handed the per-block one.

**Invisible for the same reason S3's granularity was.** With four blocks the error is four
rows against a region with room to spare; with 103 it is 103. A defect proportional to a
count that every existing surface kept small reads as correct until one does not — and no
arithmetic finds it, because both sides of the comparison are the code's own.

Found by reading a frame and seeing a blank row between every block. Fixed, with the
contract test's fixture corrected from 6 to 8 rows — the control had stated the region as
`height / ROWS`, which was the arithmetic the code used rather than the one the terminal
does, and it failed the moment the view started measuring what is drawn.

---

## F41 — `b.patch` cannot say what it elided below the last hunk

`Patch.collapsedAfter` exists and is documented at length — *"one hunk at line 18 of a
200-line file elides 14 lines above and 170 below"* — and `b.patch` passes `path`,
`language`, `hunks` and `layout`, and not that. `Hunk.collapsedBefore` **is** reachable, so
a patch can state what it skipped above each hunk and never what it skipped below the last
one.

`/config` is the consumer: a 44-line file with one hunk near the top ends with about thirty
lines that simply stop. `test/config.test.ts` C4 asserts the gap rather than only filing it.

**F27's shape, third instance** — a complete mechanism on one side, unreachable from the
builder. F27's `yMin`/`yMax` closed the same way and this is one line.

---

## F42 — a drawing named a layout the framework chooses by width

S8 called itself *"the unified-diff-with-context showcase"*. `layoutFor` picks split at a
wide terminal and unified below, so the app pinning `layout: "unified"` would have discarded
a capability to satisfy a sentence. Frame-read at both: **split at 120, unified at 80, from
one verb and no flag.**

Not a defect in either — it is the fifth time a drawing has described the framework rather
than been checked against it (F4, F11, F30's verdict, F38, this), and the pattern is worth
the entry more than the instance is. Corrected in `DOCKER_TUI_SURFACES.md` in place.

---

## F43 — an app cannot ask what the terminal supports ★★★

`detectCapabilities` is not exported (`src/index.ts`), and `LocalContext` carries `command`
and nothing else. So the one route an app writes entirely itself cannot ask the framework
what the terminal can draw, and `main.ts` sniffs `TERM` and `LANG` itself — duplicating
`terminal/capabilities.ts` in the app, which is precisely what C02 exists to prevent.

**It is not avoidable by deferring to the framework**, and that is what makes it a gap
rather than a preference. Step 1's em-dash finding established that *capability
substitution covers glyphs the framework picks, not text an adapter supplies*: `▄ ▀ █` in a
`raw` block pass through untouched and draw as garbage on a terminal that cannot show them.
So the app **must** choose, and it must choose without being told.

Third instance of the family, and now the strongest: **F14** (a local handler has no width,
so `main.ts` reads `process.stdout.columns`), **F36** (an app cannot validate a document it
built), and this. All three are *the framework holds a fact the consumer needs and does not
offer it*, all three are worked around by the app duplicating framework code, and F14's
workaround is already documented as wrong across a resize.

---

## F44 — the banner's own document was wrong three times, and measuring caught each

Not a Calcium finding — an artefact one, filed because the *pattern* is the fourth of its
kind (F4, F11, F32, this) and the pattern is worth more than any instance.

`DOCKER_TUI_BANNER.md` stated the whale's per-row extents as `40, 31, 31, 33, 40, 28, 25, 22`;
measured, they are `31, 31, 31, 33, 40, 29, 26, 23` — **four of eight wrong**. It stated
`whale(40) + gap(4) + wordmark(60) = 103`, which comes to 104, because the wordmark's
content is 59 and its stored width 60. And its tier table gave fixed thresholds that are
right for the block wordmark and wrong for the ASCII one, which is 76 cells and fits the
tier the table reserved for the whale alone.

Every one was found by building the thing and measuring, and none by reading. All three
corrected in place.

The one claim that was **right and would have bitten if trusted as written**: the wordmark's
top pad is already in the document — 8 rows, first blank, 7 of content. The instruction said
*add one row*, which would have produced nine, and a build step that trimmed blank lines
would have silently undone a padding its author believed applied. `test/banner.test.ts` K3
holds it, and the whole art is pinned against the document's fenced blocks so the two cannot
drift.

---

## F45 — an app cannot render a stream that is not JSON ★★★

C07 rules that **an adapter with `adaptPatch` owns the `data` row and nothing else**
(`adapters/stream.ts:64`). The degradation rows are the transport's own reporting, and for a
JSON far side that is right: an unparseable line among good ones is noise, not content.

**For `docker logs` every line is unparseable**, so the app's `adaptPatch` is never
consulted and C07's fallback accumulates the whole follow into **one growing `raw` block**
(`REMAINDER_ID`, replaced per line). In a transcript entry that is fine — C14 windows an
entry by rows. In a **view** it is precisely the pathology C22 I47 was written for: the
window falls on block boundaries, so one block taller than the region is shown cut and
reachable by no key, and a follow makes it taller every second.

Two mechanisms, each correct, whose combination is not. **Measured in a frame**: the
indicator fired with *"81 more rows"* and the follow was unreadable.

**The app has no route at all** — it cannot see the lines, so it cannot choose a block per
line. Absorbed by the shim, which wraps each line as `{"line": "..."}` and thereby makes
`docker logs` into the JSON-emitting CLI this framework is for. That is an honest
translation rather than a workaround (R01's premise is a far side that speaks JSON, and this
verb does not) — and **the cost is `exec`**: a pipeline means the shim waits rather than
being replaced, so C21's SIGTERM arrives at the shell instead of at docker and a `trap`
forwards it.

The fix with a consumer behind it is narrower than *expose everything*: **an adapter that
declares `adaptPatch` should be offered `malformed` when the stream has degraded**, which is
the state in which those lines are content rather than noise.

---

## F46 — the stdout/stderr split is a JSON-CLI assumption, and a log verb inverts it

C06 streams stdout; stderr is diagnostics. That is the right split for a far side whose
stdout is data — and `docker logs` relays the *container's* two channels, so for most server
software the content is on stderr. nginx writes every `[notice]` and every request line
there.

**The first `/logs` frame showed the entrypoint's seven start-up lines and then nothing, for
ever** — which reads exactly like a container that has gone quiet, and is the most plausible
wrong reading available. Found by reading the frame and noticing which lines were missing
rather than that any were.

Absorbed by the shim (`2>&1` for `logs` only). Filed because the general form is real: a
verb whose output *is* the far side's stderr has no way to say so, and `Invocation` has no
field for it.

---

## F47 — a pushed view did not follow its own stream ★★★ — **fixed**

`/logs` on a container that stopped mid-follow showed twenty-six lines of start-up and no
sign that anything had happened since. The window sat at offset 0 while the document grew
beneath it, so **the output the reader asked to watch and the terminal notice above it were
both below the fold, permanently**.

**Neither walk artefact reaches it.** A rule about what a frame *contains* is invisible to a
table indexed by obligations and to a trace indexed by events — the fifth recorded blind
spot, third surface it has caught. And it is invisible to the suite for the same reason: the
route tests assert *the patch arrived in the document*, which was true throughout.

Fixed as C22 I48's last clause: **an append holds the window at the bottom when it was at
the bottom, and leaves it alone otherwise.** Both halves are the ruling — a window that
never moves shows its first screen for ever, and one that moves under a reader who has
scrolled up is the same fault reversed.

---

## Open, not yet reached

Recorded so their absence is a decision. Each gets an entry above when the surface that
needs it is built.

- **Gap 7 — resolved, and it was not what it said it was.** See F20. The `view` host arm
  ticks and has been tested since C23 §3b; what is absent is a *producer*, and the answer is
  C22 §13's reserved ruling rather than a defect. Step 3 settles it.
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
- **`b.live`'s `stream` arm.** F10 rules this app onto `fetch`, so `stream` is specified,
  implemented and unreached by any consumer. It was described here as holding the position
  `RefreshHost`'s `view` arm held; F20 corrects that — the `view` arm was *tested* and
  unreached, which is a weaker gap than `stream`'s and a different one.
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

---

## F48 — a builder narrower than its block, where the narrowing was never ruled ★★★ — **fixed**

`KeyValue.rows` is `readonly { label; value; tone? }[]`. `b.kv` took
`Record<string, string | KeyValueInput>`. So the block could always carry a repeated label
and the builder could not.

The consumer is `/port`. A published container port has one binding per address family:

```
$ docker port dtui-port
80/tcp -> 0.0.0.0:8080
80/tcp -> [::]:8080
443/tcp -> 127.0.0.1:9090
```

A record built by `reduce` keeps the second and loses the first, with nothing said. Three
mappings become two, and the frame shows a container publishing on IPv6 only.

**What makes this worth an invariant rather than a patch**: C24 had already ruled on a
narrowing here, and it is a different one — `KeyValueInput` against `CellInput`, because a
`KeyValue` row has nowhere to put a glyph. That ruling is sound and it is about the
*value*. The container went unremarked, through eleven builders and one whole application,
because the documented narrowing reads as covering the parameter.

**Fixed**: C24 I18 and commitment 16, `b.kv` gains an array arm, the record arm stays and
stays the one to reach for. `S11_WALK.md` A5.

---

## F49 — a change axis has no home in a health palette ★★★

S10 draws `/diff` with `+` added in **ok** tone, `-` deleted in **error**, `~` modified in
**warn**. `b.row` threw:

```
cell: tone "error" requires a non-empty glyph (C04 I6, D29)
      — colour alone does not survive 1-bit or a colour-blind reader
```

**The throw was right, twice over.** A deleted file is a fact about a container, not a
fault, and `error` is a health slot; and the marker `-` already carries the distinction
without colour, which is what I6 exists to guarantee. So the app carries the change axis in
the marker and the word, and takes its tones from the slots that claim no severity —
`ok`, `accent`, `muted`.

But the drawing was not being careless. It wanted **three colours meaning added, deleted
and modified**, which is a change axis, and `Tone` is a judgement axis with ten slots and
no room for one. That is **gap 3's shape on a surface with no numbers in it** — gap 3 was
filed about a CPU load gradient, and this is the same collision with a categorical axis
instead of a continuous one.

**And it is F30's other half.** F30 filed `Comparison`'s verdict union — `same | better |
worse | changed` — for mixing a change axis with a judgement axis in one type. This is the
same two axes colliding one block over, where the palette has only the judgement one. Two
blocks, two symptoms, one absent concept.

Filed, not fixed. Adding a change axis to `Tone` is a theme change across C10, every block
kind and both degradation paths, and the app has a correct rendering without it. What this
entry buys is that the next surface wanting *added versus deleted* finds the reason rather
than the workaround — and that F30 and this are read together, because separately they each
look like one block's oddity.

---

## F50 — a column with no `flex` is allocated its minimum and nothing more

Not a Calcium defect: `planColumns` does what C11 says. It is a **shape a consumer gets
wrong twice**, and both instances were invisible to the suite.

| surface | written | rendered at 120 |
|---|---|---|
| `/ps` NAME | `flex: true` | 54 spare columns absorbed by the name, PORTS truncated |
| `/diff` PATH | `flex: true` | `modified` at column 108, an empty row between it and its path |
| `/diff` PATH | no flex, `maxWidth: 72` | truncated to 20 cells with 80 empty beside it |
| `/top` all but CMD | `minWidth: 4` | `109…` for a PID, `sta…` for a user |

The rule underneath: **a non-flex column is allocated its `minWidth`, so a `minWidth` that
ignores the content is a truncation, and a `flex` column takes everything, so a fixed
column after one is pushed to the terminal's edge.**

`/diff`'s answer is the fixed column **first** and the flexible one second — the only
arrangement of two columns where both are read together. `/top`'s is that each column asks
its own content how wide it needs to be, through `cells` rather than `.length` (C24 I14),
because the columns are not known in advance and so the widths cannot be either.

**The `/ps` instance is documented in a comment three lines from where `/diff`'s was
written.** Having read it did not prevent writing it again, and the mutation for `/top`'s
half failed nothing — twenty-four rows green against every column truncated. Only the frame
showed either. `verbs.test.ts` T7 exists because of that mutation.

---

## F51 — `events` cannot say which of its events is bad, and `logs` can

Two block kinds of the same shape, and only one of them tones its rows.

| kind | row | what the renderer paints |
|---|---|---|
| `logs` | `{ ts, level, message }` | `level` in `levelTone(level)` — error, warn, dim, info |
| `events` | `{ ts, type, message }` | `type` in `accent`, always |

`/events` is the consumer. A container lifecycle stream is `create`, `start`, `die`,
`kill`, `oom` — and on screen a `die · exit 137` is the same colour as a `start`. The
surface the kind is *named for* is the one that cannot say which line the reader should be
looking at.

The remedy is not obviously "add a tone to `EventLine`". `logs` solved it with a **fixed
vocabulary the renderer knows**, which is why it needs no tone field, and docker's actions
are not that vocabulary. Either the kind takes a `tone`, which puts the choice in the
adapter and makes two kinds inconsistent in the other direction, or it takes a severity in
the vocabulary `logs` already uses, which asks every producer to map its own words onto
four levels.

Filed, not fixed, and it is **F49's neighbour rather than a separate thing**: F49 is a
change axis with no home in a health palette, and this is a health axis with no way onto a
block. Both were found the same week by two surfaces, and the pair is the argument for
looking at C10's model rather than at either block.

*Meanwhile*: the app puts the exit code in the message, so `die · exit 137` says what it
needs to in words. That is the same answer C04's `Glyph` comment gives — what the
vocabulary cannot say goes in the text — and it is why this is a finding rather than a
blocker.

---

## F52 — a parameter fully tested and unreachable at once ★★★ — **fixed**

`detectCapabilities(env, overrides)` has taken overrides since C02 was written. C02 I4
makes a valid one win unconditionally, including for `altScreen`; T1.9, T3.4 and T3.5 test
the rules; T5.5 asserts one reaching the wire. All of it passed while `construct.ts` called
the function with **one argument**, and the only other caller in the repository was
`test/support/fixture.mjs` — which reaches in by deep import and composes its own frame,
and whose comment says the wiring is C22's.

A03 §2's vacuity class arriving through a **parameter**. C24 I16 is written about exported
declarations and MG25 scans free functions and constants, so neither could see an argument
nothing supplies.

**S12 is the consumer, and it found it at the depth that matters most.** Four of the five
depths come from the environment. `colourDepth: 1` comes from none of them: the only rule
producing it is C02's `dumb` gate, and that gate also clears `altScreen`, which C02 I7
makes the one refusal that stops the shell. Measured:

```
$ TERM=dumb docker-tui
Error: alternate screen unsupported — the shell cannot open
```

**Fixed**: C22 I49 and commitment 23, `TuiConfig.capabilities`, three lines.

---

## F53 — `exactOptionalPropertyTypes` makes an optional field unsupplyable

A consumer computing an optional config value cannot pass it. Neither form compiles:

```ts
capabilities: maybeUndefined                                  // TS2379
...(maybe === undefined ? {} : { capabilities: maybe })       // TS2379 as well
```

Under the flag an optional property and a property that may be undefined are different
types, so `capabilities?: Partial<TerminalCapabilities>` accepts a value or *absence of the
key* — and a spread of a conditional produces `T | undefined`, which is the second thing.
Only a cast gets past.

**A consumer finds this and a producer cannot**: every internal caller passes a literal, so
nothing in `src/` or the test tree could ever have met it. Fifteen optional fields on
`TuiConfig` have the shape; **one of them has been wanted conditionally**, and that one now
carries `| undefined`. The rest are filed rather than changed, because a variance widened
for no consumer is a guess about the next one.

---

## F54 — the app drew five characters an ASCII terminal cannot show ★★★ — **fixed**

Capability substitution covers the glyphs C09 picks, **not text an adapter supplies** —
which is documented, correct, and had gone unpaid for four surfaces. At `LANG=C` the S3
frame kept `░░░░░░░░` beside a plot that had correctly become `.::-==++**##@@`.

| character | where | how it was found |
|---|---|---|
| `░` `█` | the CPU/MEM bar | reading the ASCII frame |
| `—` | the absent-value dash | fixing the bar, in the same function |
| `·` | three captions and a panel title | scanning the frame for codepoints > 127 |
| `…` | `loading…` — **the framework's**, not the app's | a test asserting a *range* rather than the three known characters |

**The fourth row is the finding inside the finding.** The first assertion listed `█ ░ —` —
a coverage set drawn from the defects already found, which covers exactly those and nothing
else. Changing it to *no codepoint above 127* found a fifth character immediately.

**Fixed** app-side by threading a flag from `main.ts` through `bar`, `rowOf`,
`livePanelBody`, `summaryLine`, `ioBlock`, `cpuBlock`, `axisCaption` and `containerView`.
The predicate was called `blockElements` and is now `unicodeText`: it was written for the
banner's `▄▀█`, and its second and third consumers wanted it for a `·` and an em-dash,
which are not block elements at all.

**That thread is the price of F43** — `AdapterContext` carries `width` and no capabilities,
so an adapter cannot ask, and every adapter emitting non-ASCII text must be constructed
with an app-computed flag. Eight functions for one boolean the framework already holds.

---

## F55 — the framework draws two characters it does not substitute ★★★

With the app's five fixed, the ASCII dashboard contains exactly one non-ASCII character:

```
U+276F '❯' x2    the prompt — `PROMPT = "❯ "`, src/shell/config.ts:32
U+2026 '…'       `loading…` — b.live's default renderLoading
```

Both are string constants concatenated into a frame with nothing between them and the
terminal. C09 §4's whole argument is that a glyph is a *slot* and never a character,
because *"C09 substitutes 1:1 by column count for the glyphs it owns, and emitted a
block-supplied one verbatim — the guarantee held for the box drawing and failed for
whatever an adapter wrote"*. These are neither: they are L4 text, outside the vocabulary
the argument is about.

**The prompt is the sharper half.** It is on every frame the shell ever draws, on the one
line the reader types into, and no application can replace it — `renderLoading` an app can
supply, and does. On a terminal that reports `unicode: ascii` the framework's own prompt is
the last thing left that cannot render.

Filed, not fixed. C22 §6 owns the prompt and gives it no capability-dependent form, so this
wants a ruling — a pair like C09's, or a `PROMPT` that takes the record — rather than a
character swapped in place.

---

## F56 — a `bin` entry is a claim about an executable, and nothing checks it ★★★ — **fixed**

`examples/docker/package.json` has declared

```json
"bin": { "docker-tui": "./src/main.ts" }
```

since the app's first commit. It could never have run, and the declaration was accepted at
every stage that could have refused it — install, pack, `npm publish --dry-run`, and `make
proof`, which installs the real tarball into a clean tree and runs the suite against it.

**Which of the two problems was fatal was measured, because the first version of this entry
guessed and guessed wrong.** It said npm links the path without looking at the mode or the
shebang. Half of that is false:

```
$ cat package.json               # bin: { "bt": "./cli.ts" }, cli.ts is mode 644
$ npm install file:../pkg
after install, source: 755       # npm chmods the bin target
after install, linked: 755
$ ./node_modules/.bin/bt
./node_modules/.bin/bt: 1: Syntax error: word unexpected (expecting ")")
```

**npm fixes the mode and cannot fix the shebang.** So the mode was never the barrier — it
explains an unrelated puzzle instead, which is why `src/main.ts` had quietly become `755`
in the working tree: npm had been chmodding it at every install for as long as the field
pointed there. The fatal half is the missing `#!`: the kernel hands the file to `sh`, which
parses TypeScript as shell and says so. That line is what a user would have got.

**The `.ts` extension is the second half and is independent.** With a shebang added, the
file would load — Node strips types by default from 22.18 — and fail with a syntax error on
22.0, which `engines: ">=22"` permits.

**The reason nothing noticed is the reason it is worth filing.** Three separate consumers
existed and all three reached around the entry point:

| consumer | what it ran |
|---|---|
| the test suite | the modules, imported directly |
| every session | `npm start`, which named `src/main.ts` itself |
| `tools/capture.py` | `node --experimental-strip-types src/main.ts` |

That is **F7's shape exactly** — `createTui` unusable from the public surface and invisible
because every internal caller reached around it — reproduced one level out, in a manifest
field rather than an export. And it is **F52's vacuity shape**: a declaration with a
documented purpose, a value, and no producer. F52 was a parameter with a spec, a precedence
rule, four unit rows and a tier-5 row, all green, and no consumer; this is the mirror.

**The app's own help had been advertising the broken command for four steps.** Run without
a TTY it prints `docker-tui  open the interactive shell`, which is a sentence about a
command that did not exist.

Fixed: `bin/docker-tui.js`, a shebanged launcher, mode `0755`, with `package.json`
repointed. **`tools/capture.py` now spawns the bin rather than the module**, so every frame
this repository reads goes through the entry point a user has — which is where a broken
launcher becomes cheap to notice.

`test/bin.test.ts` covers it in four rows, resolving the path *through the manifest field*
so that repointing the field moves the test with it. Mutations, each run inside the
container:

| mutation | rows killed |
|---|---|
| `bin` back to `./src/main.ts` | 4 of 4 |
| the execute bit removed | 2 — the mode row, and the spawn with `EACCES` |
| the shebang removed | 2 — the shebang row, and the spawn |
| the launcher imports nothing | 1 — the spawn |

**And the mutation pass produced a finding about itself.** Run from the host, `chmod 644`
left the container reading `755` — measured: Docker Desktop's bind mount does not propagate
the mode. A mutation applied on the host never reached the file the test opens, and it did
not fail cleanly either; it produced a *partial* result, which reads as a weak assertion
rather than as a broken experiment. The rule is the fixture rule pointed at the harness:
**mutate in the same filesystem view the test reads**, and the row now records the limit
beside itself rather than leaving it to be rediscovered.

---

## F57 — a comparison frame that varied two axes, in the document arguing for frames ★

`DEGRADATION.md`'s banner pair was captioned *"at both ends of the unicode axis"* and was
not. The block-element wordmark is **103 cells** wide and the ASCII one is **76**; the five
depth frames beside it were captured at **100**, where the block variant cannot fit and the
app falls back for a reason that has nothing to do with the locale. Either the pair was
taken at a width it never stated, or it was taken at 100 and the frames disagree with the
caption. Both frames were also **cut mid-line** — the one rule the document exists to
argue for.

Re-captured at 120, where both variants fit, with the width stated and the frames whole.
The claim survives: same terminal, same width, `LANG=en_GB.UTF-8` against `LANG=C`.

**The general form is not "state the width".** It is that a fallback ladder has as many
axes as it has guards, and `bannerLines` has two — `if (v.blocks && !blocks) continue` and
`if (widthOf(v.lines) <= width) return`. A comparison that varies one of them while the
other silently decides the answer is a frame-read that cannot be wrong, which is A03 §2's
vacuity class arriving as a demonstration. **Read the ladder before choosing the pair.**

---

## F58 — the only way to satisfy the compiler is to assert something false ★★★

`RawResult.exitCode` is `number | null`. `DocumentMeta.exitCode` is `number`. So
the obvious line does not type-check:

```
meta: { exitCode: raw.exitCode, … }
  Type 'number | null' is not assignable to type 'number'.
```

**Every adapter in this repository writes `result.exitCode ?? 0`** — `ps.ts:176`,
`logs.ts:106`, `verbs.ts:46`, `container.ts:367`, `inspect.ts:216`. `RawResult`
carries `signal` beside it and `DocumentMeta` has no field for it, so the
information is available at the coercion and has nowhere to go.

**Found by the second consumer, which is the whole argument for having one.**
Nobody writing the sixth adapter in an existing file questions a line the five
above it already contain. `examples/minimal` is forty lines written from the
public surface with no house style to copy, and it hit the same wall on its first
compile — which is the evidence that this is the API's shape rather than a habit.

### Corrected 2026-08-05, measured — right about the wall, wrong about the damage

Step 9 went to build on this and went looking for the record first. Two claims
were carried, neither measured, and **both are false**:

| carried claim | measured |
|---|---|
| `?? 0` reports signal-death as a clean success | an adapter returning `exitCode: 999` yields **`0`**; a `SIGTERM` death yields **`143`** |
| `docker stop` produces a null exit code | `docker stop` exits **`0`**; the container's `137` is a field in the payload |

`authoritativeMeta` (`registry.ts:84`) is applied on **every** route and sets
`exitCode: exitCodeOf(raw)` unconditionally, ignoring what the adapter supplied.
`exitCodeOf` maps `SIGTERM → 143` and never-started → `-1`, which is C07 §85's
table working exactly as written. So `meta.exitCode` was comparable across apps
the whole time, and the five coercions never reached a document.

The second claim was a conflation of two different exit codes. `RawResult.exitCode`
is the **docker binary's**; the 137 a stopped container reports is the
**container's**, and it is data in the JSON envelope. They were being read as one
number. Nothing in the mutation family produces a null `RawResult.exitCode` at
all — that path belongs to cancellation and timeout, which C07 §4 already maps.

**Wrong in both directions, which is the shape to watch for.** The field was not
broken for the reason given, and there *is* a defect nobody had stated — see F58b,
which is what is left of this once the false half is removed. `DocumentMeta` is
**not** widened to `number | null`: the ruling C24 §8a and ROADMAP F58 were both
waiting for would have been taken on a premise that measurement falsifies.

Twenty minutes to check, against a change to a public type that is expensive to
reverse after publication. This is CLAUDE.md's sixth blind spot: the claim was
re-stated across four documents and never held a measurement, and re-stating is
what made it feel settled.

---

## F58b — the type demands ten fields and the registry honours three ★★★

What is left of F58 once the falsified half is removed, and it is the reason the
five dead coercions exist.

`Adapter.adapt` returns a `ViewDocument`, so the compiler requires a complete
`meta` — ten fields. `authoritativeMeta` then keeps exactly **three** of them
(`resultId`, `adapter`, `truncated`, per C07 §3's "the three the registry cannot
know") and overwrites the other seven from the `RawResult` and the context.

So an adapter author is **required to compute seven values that are discarded**,
with no signal that they are. That is the whole of F58's real content: the
compiler does not merely force a false line, it forces a false line *and throws it
away*, which is why nobody noticed the value was wrong — nothing downstream ever
showed it.

Measured: an adapter returning `exitCode: 999` produces a document reading `0`.

**The count is five and they are one consumer only in the sense that one
repository contains them** — the same argument F58 made and the same one that
holds here. Every adapter that will ever be written hits this, because the type
requires it.

The fix is a type rather than a field: the adapter's return wants a `meta` narrowed
to the three honoured keys, so that supplying `exitCode` does not compile instead
of not mattering. That is a C07 and C24 surface change, it belongs before the
freeze, and it is **not** taken here — step 9 is the consumer that found it, not
the step that rules on it.

---

## F59 — a published example that does not compile, and the reason it does not ★★

The root README's `b.live` snippet, unchanged since it was written and shipped in
every tarball (`files` includes `README.md`):

```ts
b.live({ id: "metrics", every: 30_000, fetch: () => api.metrics(),
         render: data => b.kv({ cpu: data.cpu, memory: data.memory }) })
```

Type-checked for the first time in step 8. Three errors:

| | |
|---|---|
| `title` is missing | it is required on `LiveSpec`, and the example never had it |
| `data.cpu` | `render` is `(data: unknown) => Block` |
| `data.memory` | the same |

**The second is the finding and the first is the symptom.** `fetch` returns
`Promise<unknown>` — honestly, because the far side's shape is not Calcium's to
know — so `render` receives `unknown` and every real call site narrows it:
`render: (data) => ioBlock(data as Row | null, unicode)`. The README advertised
an ergonomics the builder does not have, and it read as correct because the
shape is exactly what a reader expects.

Corrected in place, with the cast shown and named rather than tidied away. The
generalisation is F27's, one level out: **an example is a claim about an API, and
an unchecked one is a claim nothing can refute.** The marked block in the README
is now quoted from `examples/minimal/main.ts` and checked by a row; this snippet
is not, and that limit is recorded beside the row rather than left implicit.

---

## F60 — the proof gate had been red for two PRs, and it is the one CI does not run ★★★ — **fixed**

`make proof` fails on `main`. Two of the app's test files import
`../../../dist/…` — F36's missing validator and F37's missing measurer, both
recorded — and **that path is relative to this checkout.** The gate copies the
example into a tree that has never seen the repository, where `../../../dist`
resolves to nothing, so both files fail at import before a single assertion runs:

```
Error: Cannot find module '../../../dist/data/viewmodel/index.js'
       imported from /tmp/tmp.hfOh8ELsp0/docker/test/documents.test.ts
Test Files  2 failed | 12 passed (14)
```

`inspect.test.ts` landed in PR #20. **The gate has been broken since, and nothing
noticed, because `make proof` is the one target CI does not run** — which
`docs/ROADMAP.md` already listed as an outstanding item. This is what the item
cost: two merges past a red gate, and the roadmap's own entry sitting one line
above the reason it mattered.

**Three findings stacked, and only the third is new.** F36 and F37 are why the
reach exists. This is that the reach was aimed at a *repository*, so the
workaround for a missing export silently excluded itself from the check that
exists to test the package. **A workaround that cannot survive the boundary it
works around is a second defect wearing the first one's clothes.**

Fixed in `test/deep.ts`: `dist/` is inside the tarball, so the same modules
resolve from the package root — the repository in the dev loop,
`node_modules/@fmx/calcium` under the gate. One expression, both worlds, and it
is still a deep import and still F36/F37.

`make proof` now runs both examples and passes: `PROOF_EXIT=0`, 233 and 3.

---

## F61 — `/logs` had never worked, and no assertion could have said so ★★★ — **fixed**

`/logs dtui-web` opens a pushed view and renders **an empty screen**. Reproduced
in isolation, then narrowed to the shim, then to one word of it.

`bin/docker-json` wraps each log line as `{"line":"…"}` — F45's translation,
because `docker logs` emits no JSON — and it did the wrapping with `awk`.
**mawk, which is `/usr/bin/awk` on Debian and therefore in this container,
block-buffers its input.** `fflush()` governs output and has nothing to say about
that. Measured:

| | |
|---|---|
| `docker logs --follow ... \| cat`, 4s | **150 lines** |
| `docker logs --follow ... \| awk '{print NR; fflush()}'`, 4s | **0 lines** |
| the same with 11 KB of log already present | still 0 |
| a slow generator into `sed -u` or `while read` | every line, immediately |

A stream that *ends* is fine: mawk hits EOF, processes the remainder, everything
appears. A `--follow` never ends. So the defect is invisible to every finite
test and visible in every real use.

**Why nothing caught it, and this is the part worth keeping.** `test/shim.test.ts`
had twenty rows and every one asserts **argv** — what the shim hands docker.
There was no row asserting a line comes back out, and the fake `docker` the rows
use *prints and exits*, which is exactly the shape that hides it. A test that
calls the mechanism and never the wiring, with the fake supplying the very
property under test.

It is also the empty-block class arriving through the instrument rather than the
data: *nothing on screen* and *nothing to show* are the same picture, and a
pushed view removes the prompt, so there was not even a cursor to suggest the app
was alive.

Fixed with `sed -u`, which is line-buffered by request. Its output was diffed
against the awk program's on every escape case — plain, quote, backslash, tab,
CR — **before** the replacement was written, so the repair could not quietly
change the format while fixing the buffering.

Two rows added, and they are about **arrival**, not about which program wraps:
a second fake that writes three lines slowly and then does not exit, and
`timeout` rather than `head`, because closing the pipe ends the stream and hands
back the buffered-flush behaviour being ruled out. Reverting the shim to `awk`
kills both and nothing else.

---

## F62 — the headline shot was a flat line ★★

`make fixtures` ran `dtui-load` as `while :; do :; done`, which is what you reach
for when you want load. Read back off the recording, the live single-container
view — the composition the whole demo was built around — was **a flat line at
100% across the full width of the plot.**

Correct, honest, and the least interesting figure C12 can draw.

**Nothing in any suite could have said so.** The plot's height, its axis labels,
its sample count and its bounds were all exactly right; `degradesTo1Bit` passed;
the arithmetic was perfect. A constant is a valid series. Only looking at it
says that a demo of a plot should have a shape.

Bursts of differing length instead — `5 3 7 2 6 4` seconds busy, three idle
between — measured at 108%, 0%, 65%, 109%, 0%, 68% across six samples. The
recording now shows a curve rising and falling.

**The class is "correct for the fixtures is a property of the fixtures".** It has
appeared before as a defect proportional to a small count; this is its other
face, where the fixture is not too small but too *uniform*, and no assertion
about the code can reach it.

---

## F63 — the recording and the frames disagreed, and the recording was wrong ★★

`tools/capture.py`'s new asciicast writer decoded each read independently with
`errors="replace"`. `os.read` splits on **bytes**, so a 64 KiB read lands
mid-UTF-8-sequence whenever the terminal is drawing box characters — which is
continuously, here. The result was U+FFFD in the middle of a panel border, and
the panel then wrapped: a corrupted frame in the recording with the raw capture
beside it perfectly intact.

Found by reading a beat, not by reading the writer. The raw stream and the cast
come from **one** capture on purpose — so that a frame-read and a played beat
cannot disagree about what happened — and this was the two disagreeing.

Fixed with an incremental decoder, which carries a partial sequence into the next
chunk. `errors` is left strict: there is now nothing for it to paper over, and a
failure would be a real one. Zero U+FFFD in the re-recorded cast, against 1 per
beat before.

**And the cut had the same shape as the corruption.** The first frame-read of the
recording sliced the stream at chosen timestamps — "beat one is t=8.0" — and
showed a container listed twice and a row with a broken sequence. Both were the
cut landing mid-redraw. `tools/beats.py` cuts at a **gap in the output** instead:
a terminal redraws in a burst and then goes quiet, so the last frame before a
pause is a settled screen by construction. VERIFYING.md §8's hazard, pointed at
the reading instrument rather than at the capture.

---

## F64 — the app never built the block the surface was written for ★★

S9's drawing shows a pushed logs view with a titled panel, a `following · 342 lines`
header, key hints along the bottom, and `▐` tone on a `WARN` line. Its **Exercises**
line claims *tone on individual lines (WARN/ERROR coloured)*.

`src/logs.ts` builds `b.raw(text)`. One block per line, no timestamp, no level, no tone.

**Every step of the chain removes the information the drawing needed**, and each step is
correct on its own:

- `docker logs` emits plain text, so there is nothing structured to read (F46 already
  found that half of it goes to stderr);
- the shim wraps each line as `{"line":"…"}` because C07's fallback would otherwise
  accumulate the whole follow into one growing `raw` block (F45);
- so the adapter receives one opaque string per line, and `b.logs` wants `{ts, level,
  message}`.

**`b.logs` therefore has no consumer in this application at all**, which is the same
shape as F10 — `b.live`'s streaming arm, unexercised for a different reason. Two block
behaviours the reference app was expected to demonstrate and does not, and in both cases
because the far side is not the shape the block assumes.

Filed rather than fixed. Parsing a level out of arbitrary container output is the thing
R01 commitment 5 forbids for `Ports` and forbids here for the same reason: *a parser would
be wrong within a release*, and nginx, postgres and a shell script agree on nothing.

**What it costs is a claim, not a feature.** The surfaces document says this app exercises
tone on log lines. It does not, and until this entry nothing said so.

---

## F65 — a drawing wrong about itself, which no measurement could catch ★

S10's tally:

```
   ~ /var/log/nginx           modified
   + /var/log/nginx/access.log added
   + /tmp/cache               added
   - /etc/nginx/default.conf  deleted

   3 added · 1 modified · 1 deleted
```

Four rows above; five in the tally. Two `+`, not three.

**Every other instance of the drawing-was-wrong class is a drawing wrong about the
world** — what docker sends, what the framework does. Running docker a thousand times
would not have found this one, because it is not a claim about docker. It is the picture
disagreeing with its own caption.

That is the class the by-hand walk reaches and nothing else does: a classification table
indexed by rule interaction reads a drawing **against itself**, which is exactly the
operation no test performs. And it is the same shape as the tally rows in `/drift` that
DRIFT_WALK insisted on — a summary that a reader can check against the thing it summarises
is worth having *because* a reader can check it, and this one has been unchecked since it
was written.

Corrected in the index rather than in the drawing, with the tone mapping beside it: S10 is
the surface where the drawing was wrong twice, once about the framework (F49 — `b.row`
throws, because C04 I6 requires a glyph for `error`) and once about arithmetic.

---

## F66 — an impossibility asserted, never measured, and wrong about its own reason ★★

Frame-read #5 of step 4 — *`/drift` on a container whose image is gone* — was carried
from step to step as **impossible**: *docker refuses to remove an image a running
container references and it cannot be forced.* It was listed as a stated impossibility
rather than a skipped read, which is the right way to record one.

It was never run, and it was never written down either. Step 8 went looking for the
record, found none, and measured it instead. Both halves of the claim are wrong:

```
docker tag alpine dtui-probe:latest
docker run -d --name c dtui-probe:latest sleep 300
docker rmi dtui-probe:latest      -> Untagged: dtui-probe:latest      # succeeded, no -f
docker rmi -f dtui-probe:latest   -> Error: No such image             # already gone
docker image inspect dtui-probe:latest -> fails: the name is gone
```

**`rmi` does not refuse. It untags, without `-f`, while the container runs** — the blob
survives because the container references it, and the *tag* does not. So a container whose
`Config.Image` names something unresolvable is trivially constructible, and the read was
available the whole time.

> **Amended 2026-08-06, step 10 — the sentence above is true of the case it measured and
> too general by one word.** `rmi` *does* refuse; what decides it is whether the tag being
> removed is the image's **last** reference:
>
> | `rmi` target, container running | exit | says |
> |---|---|---|
> | a non-last tag (`dtui-probe-tag:v1`) | 0 | `Untagged: …` |
> | the last tag (`alpine:latest`) | 1 | `conflict: … (must be forced) - container … is using its referenced image` |
>
> The original claim — *docker refuses and it cannot be forced* — remains wrong on both
> counts, and the probe's setup made the distinction invisible because it had tagged the
> image twice and removed the second tag. So the correction was right about the read being
> available and generalised one measurement into a rule about `rmi`.
>
> **This is the finding's own lesson arriving a second time, in the correction rather than
> in the claim.** F66 exists because nobody measured the case that would falsify the
> belief; the amendment exists because the measurement that falsified it was not itself
> falsified. Measure the case that would break your own counter-example — the second tag is
> exactly the variable the probe happened to set and never varied.

**The read was then run, and `/drift` worked.** It printed `IMAGE alpine:latest` against a
container created from a tag that no longer exists — because the app resolves the image
from the container's top-level `Image`, which is `sha256:…`, and asks the daemon for the
**digest**. RepoTags on the answer supplies a display name.

So the impossibility is real and the reason given was not:

> **A container pins its image blob by digest for as long as it exists, and the app looks
> it up by digest. The reference cannot dangle while there is a container to drift.**

That is a structural statement about the far side's model, and it is worth having where
the old one was not: the old one would have been falsified by any docker release that
changed `rmi`'s behaviour, and this one is falsified only by a container outliving its
own image, which docker's storage model forbids.

**The consequence is a live branch with no reachable input.** DRIFT_WALK A1 ruled that a
failed image lookup must keep the block — the container's own facts are still good, and
the thing reporting the absence must not replace the thing that would have explained it.
That ruling is correct, implemented, and covered by `drift.test.ts` through the injected
`Lookup` seam. **The real far side cannot produce the input.**

Which is the honest shape of it, and the reason this is filed rather than deleted: the
branch is not vacuous — a different far side, a pruned image store, or a `Lookup` pointed
somewhere else all reach it — but *this* far side does not, and a defensive path whose
only caller is a test should be labelled as one. The walk was right about what to do and
the frame-read could never have confirmed it.

**The rule this leaves**: an impossibility is a claim, and a claim carried across four
steps without a measurement is exactly the thing this project files findings about. It
cost twenty minutes to check and it was wrong in both directions — the case was reachable,
and the reason it is uninteresting is better than the reason given.

---

## F67 — below a certain terminal size the shell draws nothing, says nothing, and stays alive ★★★

Found while shrinking a capture to make a compact README image. At **14 rows** the
application produced an empty picture and the pipeline reported success.

Measured, with the terminal size set on the PTY master before the child draws:

| size | bytes to stdout | bytes to stderr | process |
|---|---|---|---|
| 100 × 12 | **0** | **0** | still running |
| 100 × 15 | **0** | **0** | still running |
| 30 × 16 | **0** | **0** | still running |
| 100 × 16 | 11287 | 0 | still running |

**It is not a crash and it is not a refusal.** There is no exception, no message on
either channel, and no exit — the shell acquires the terminal and then draws nothing at
all, for ever. A user on a short window gets a blank screen and a process they have to
kill.

**And the floor is two-dimensional**: 30 × 16 is as blank as 100 × 12, so it is not a row
count but some minimum region that both axes feed. `frame.ts` computes
`rows − HEADER_ROWS − FOOTER_ROWS − promptRows` and clamps at zero
(`Math.max(0, …)`), and **nothing anywhere refuses a region too small to use.** C02 I7 is
the framework's one hard refusal and it is about `altScreen`; there is no equivalent for
size.

**This is C02 I7's argument with a different subject.** That invariant exists because a
terminal that cannot open the alternate screen must be told so on the primary screen
rather than left dark — *"help on the primary screen and a clean exit, and nothing is
constructed"*. A terminal that is too small to draw into is the same situation reached by
a different route, and it gets the opposite treatment.

Not isolated to the framework or to the app: `createTui` is all this application calls, so
the fault is on that path, but which component owns the floor is not established here.
Filed with what was measured.

**The instrument found it and no assertion could have.** Golden frames are rendered at
60 / 80 / 120 / 160 columns and a fixed height; the height axis has no equivalent sweep,
and a document that renders to zero visible rows produces a frame that is *correct* — it
is what was asked for. It took someone wanting a smaller picture.

---

## F68 — WITHDRAWN. The overlay is correct; the finding was not ★★★ — **retracted**

**Filed, published in two READMEs, and wrong.** It claimed that the completion
menu paints no background and that the transcript reads through the gaps between
its columns. The second half is what a reader sees; the first half is not why,
and there is no defect.

### What was filed

The menu photographed like this, and the line was quoted as the evidence:

```
/compare                                              Two containers, side by sidequiet  frosty_hodgkin
/config        A config file as the container has it, against the image's original──────────────────────
```

Two texts on one line. Supported by a real measurement — `/config`'s diff emits
**72** `48;2;` background sequences and the completion capture emits **zero** —
and by C10 §4a, which added `background` to `Style` as a requirement. The
conclusion drawn was that the overlay does not use the channel the diff does.

### What going to fix it found

`src/shell/composite.ts` is not only correct, it is **written against this exact
symptom.** I29's own words:

> Every cell of a box is written, background included. The prompt or the
> transcript beneath has already painted those cells, so a loop writing only the
> glyphs a layer's blocks produced leaves the old content showing in the gaps —
> **and the symptom is text bleeding through a menu, which reads as a C09 defect
> rather than a compositing one.**

`layerRows` pads every row with `exact(lines[i] ?? "", p.width)`; `spliceRow`
writes `head + body + tail`. Every cell of the box is written.

**Measured, rather than read.** The same session captured twice — one with the
Tab, one without — and the frames diffed row by row:

| row | columns that differ |
|---|---|
| 29 | 0 – 11 |
| 30 | 0 – 81 |
| 31 | 0 – 81 |

**The box is columns 0–81 on every row of it.** Row 29 differs only to column 11
because its content is short *and the cells it padded were already blank* — the
padding is written, it simply matches. Everything past column 82 is the
transcript, correctly untouched, on all three rows.

So the menu is an 82-cell box composited exactly as specified, over a 110-cell
screen. **What I photographed is what an overlay looks like.**

### The picture that settles it

![The completion menu drawn over a coloured unified diff: the menu's three rows punch a clean black rectangle out of the red and green diff backgrounds, with a perfectly vertical edge at the same column on every row, and the diff's colour resuming beyond it](../../docs/media/menu-over-diff.gif)

**The menu drawn over a surface that is coloured to its right edge.** If cells
went unwritten, the diff's red and green would show through the gaps *inside* the
box — between `/compare` and `Two containers, side by side` most obviously. They
do not: that gap is black, the box's edge is a straight vertical line at one
column on all three rows, and the colour resumes beyond it.

Asked for an image proving the bug was fixed, this is the image, and it proves
there was nothing to fix. It was captured against the coloured diff **because**
the original photograph was taken over a dark transcript, where a written black
cell and an unwritten one look identical. **The first picture could not have
distinguished the two states, and I read a conclusion off it anyway.**

### What is actually true, and it is much weaker

The completion menu has **no border and no background tint**, so its right edge is
not visible: a narrow box over text reads as text overlapping text. That is a
legibility observation about one surface's chrome, not an invariant violation —
and C10's refusal to paint a background is a deliberate decision with its reason
written down (*"background colours are the emulator's and a user may override
them"*), not an omission.

Whether the menu should carry a border is a design question worth asking. It is
not a bug, and filing it as one was wrong.

### Why it got through, which is the part worth keeping

**The measurement was real and the inference was not.** Zero background sequences
is a true fact about the capture; it does not imply cells go unwritten, because a
space written in the default colours *is* a written cell and emits no background
sequence at all. I had a number, and a specification paragraph that mentioned the
exact symptom, and I stopped — **the spec passage that seemed to confirm the
finding was in fact the note explaining why the implementation does not have it.**

The rule this leaves: **a symptom named in a spec is evidence the authors thought
about it, not evidence they got it wrong.** The paragraph that made the diagnosis
feel certain should have been the first thing to check the code against.

And it is the sixth blind spot pointed at myself one step later. F66 was a claim
carried across four steps without a record. This is a claim published within the
hour of being formed, from a measurement that was accurate about the wrong thing.
The check that catches both is the same: *go and look at the mechanism.*


---

## F69 — a tier-5 timing row that passes and fails on identical code ★★

`T5.3a` — *a live stream appending above a detached viewport does not move it* —
failed CI on `feat/more-surfaces`:

```
AssertionError: the stream advanced past 3 unseen: expected 4 to be greater than 6
```

**The same commit, merged, passed on `main` minutes later.** Two runs of identical
code on the same runner class, one red and one green. It also passes locally on
every run: `make all` reports 94 tier-5 rows green.

The row detaches the viewport, sends sixty page-downs, and asserts the stream has
advanced by more than three in the meantime. On a contended runner it advanced by
one. **The assertion is about a race it does not control**: how far a background
stream gets while sixty keystrokes are processed is a function of the machine, and
the invariant under test — *appending above a detached viewport does not move it* —
is not.

**This is VERIFYING §7's class arriving without a load generator.** That entry
records a busy container making this exact row fail, and step 8 re-measured it and
could not reproduce the failure — the conclusion drawn there was that C03's
thresholds have margin on an idle host and none on a busy one. This is the same
thing with the contention supplied by whoever else was on the runner, and it is
the evidence the re-measurement lacked: **the row is nondeterministic, and the
load generator was one way of showing it rather than the cause.**

Filed rather than fixed. The repair is to make the row wait for the stream to
advance rather than assert how far it got in a fixed window — a `waitForFrame` on
the count instead of a threshold — which is a change to a tier-5 row and wants its
own pass over the neighbouring rows, several of which are the same shape.

**And it is why `make load-down` keeps its place** on the asymmetry rather than
the odds: a row that fails under contention will fail eventually whether or not
anyone introduced the contention deliberately.

**Reproduced, immediately afterwards, by forgetting the rule.** `dtui-load` was
left running after a batch of demo captures and tier 5 was run without a thought:

| | with `dtui-load` up | after `make load-down` |
|---|---|---|
| `T5.6` — a session with no far side installed | **timed out at 75 s** | **898 ms** |

**And `make all` reproduces it with no load generator at all**, which is better
evidence than either measurement above and was found by running the pipeline four
times on one commit:

| what ran before tier 5 | tier 5 duration | `T5.6` |
|---|---|---|
| nothing (`npm run e2e`) | 219 s | **passed** |
| `golden` | 225 s | **passed** |
| `test`, `golden` | 219 s | **passed** |
| `check`, `enforce`, `audit` | 214 s | **passed** |
| all six (`make all`) | **291–301 s** | **failed, three times for three** |

No subset reproduces it and the whole does, every time. The suite is 35% slower
in the failing runs with identical rows, which is what says this is the machine
rather than an ordering defect: `make all` is simply the largest load this
container ever carries, and `T5.6` is the row that goes first under one.

**Its failure is a bare timeout on `pty.done()`**, with no frame printed, because
that wait is unbounded — so the repair is a different one from the rest of F69's:
a bounded wait on exit, which would fail with the last frame attached instead of
with a stack pointing at the `it`.

**Ruled out along the way, and worth recording so it is not re-checked:** the
as-you-type menu (C19 I19) costs **0.15 ms per keystroke** where a keystroke that
opens nothing costs 0.014 ms — eleven times, and four orders of magnitude below
anything that could produce a 75-second timeout. Measured with 200 keystrokes
through a constructed graph, `/h` against `xy`.

**Eighty-three times, and it hangs rather than missing a threshold** — which is the
worse failure mode, because a timeout reads as a deadlock in the code under test.
The investigation opened on a change to the paint path that had nothing to do with
it, and what ended it was stashing that change and watching the row fail
identically without it.

So the class is settled: **these rows are contention-sensitive, the load generator
is a reliable way to demonstrate it, and step 8's "it did not reproduce" was a
statement about that afternoon's machine.** Three measurements now, two of them
failures, and the one that matters is the pair taken four minutes apart on the
same commit.


---

## F70 — a completion source cannot be tested by the app that writes it

`TuiConfig.completionSources` invites an application to answer for a slot. The
answer is a function of a `CompletionContext`, and **nothing outside the package
could build one**: `contextAt` derives a context and lived behind the boundary,
and the `Manifest` it takes had no reachable parser either, since an app hands
`createTui` an unparsed document. So a source's `complete()` was callable only by
the shell that owns it.

Found by writing `test/completion.test.ts` — the first thing anyone does after
implementing a hook is try to run it — and the alternatives are each worse than
the export. A hand-built context is a literal that agrees with the test rather
than with the derivation, which is the class C19 §8b's rows exist to catch; a
deep import is F7.

Closed in Calcium: `contextAt` and `parseManifest` are on the public surface
(C24 I19, §8b). **The fifth mechanism this month found complete on one side of a
seam and unreachable from the other**, after C02's capability overrides, the
ghost's compositing, `commonPrefix`'s missing caller, and the menu's remainder
argument.

---

## F71 — the second Tab into a subdirectory draws nothing

Read from a frame: `/config dtui-cfg /etc/ngin`, `Tab` — which completes to
`/etc/nginx/` correctly — then `Tab` again, and **no menu appears at all**.

C19's cache is keyed on the slot's identity and deliberately not on the prefix:
a UUID list does not change between `a` and `ab`, and keying on what has been
typed makes every keystroke after a `Tab` a fresh fetch. That premise is stated
as *a dynamic source answers for the slot and the engine filters by prefix* —
and it is **false for a path**, whose answer is a function of the directory part
of the prefix. So the second `Tab` was served the first's listing of `/etc/`,
filtered by `/etc/nginx/` to exactly one entry, which rule 3 then inserted
without changing the buffer.

**The framework's own `pathSource` has the same shape and had carried this since
C19 landed.** No test reached it: completing one directory is enough for every
row that existed. The app's source is what put a second directory in a frame.

Closed in Calcium: a source may declare `cacheKey(ctx)` (C19 I25), and both path
sources return the directory. A hook rather than a rule on the key, because only
the source knows which part of a prefix it interpreted.

---

## F72 — `ls -p` does not mark a symlinked directory

`/etc/nginx/modules` on the fixture container is a symlink to
`/usr/lib/nginx/modules`. `ls -1p` appends `/` to real directories only, so the
path source offered `modules` as a **finished word with a trailing space** — and
the one thing a user wants to do with a directory, descend into it, is the thing
that prevents.

Measured out of the corpus rather than reasoned about: the listing was captured
from a real container and read before it was asserted against. `ls -1pL`
dereferences, and the corpus carries the marked form.

Nothing about the candidate looks wrong. It is the delimiter, which is invisible
until it is typed past — the same class as F68's withdrawal in reverse: there,
the frame said a defect existed and the mechanism said otherwise; here the block
list said nothing and only the trailing character did.

---

## F73 — contention fails the scan tests too, not only tier 5

F69 records `dtui-load` making a tier-5 row time out. The same hazard was
measured against **tier 2** while a build, a capture and a suite ran together:
six rows failed, every one of them a source scan — SS10, SS19, SS44, C12's fuzz
corpus — each timing out at 15 s having taken 24 s.

| | load average 5.2 | quiet |
|---|---|---|
| `npm test` | **6 failed** | 2521 passed |

**A third victim shape, measured on the branch after this one:** C17 T3.15 is a
*ratio* rather than a timeout — a 1 MB paste against a 0.5 MB one, asserting the
work is not four times the text. Under load it read 6.0 against a limit of 3, and
three consecutive runs on a quiet box passed. So the class is not "slow rows time
out": it is anything whose assertion is about time, and a ratio fails in a way
that reads as an algorithmic regression rather than as a busy machine.

The rows are unchanged between the two runs. It is worth recording because the
failure names an *enforcement rule* — "SS10 finds no terminal env read outside
capabilities.ts" — which reads as a real violation and sends a reader to look for
one. The scans walk 174 files, and they are the slowest rows in tiers 1 to 4.


---

## F74 — the demo's completion beat never worked

Beat 4 of `demo.cast` types `/co` and shows the menu. Read back frame by frame,
**the prompt is empty for the whole beat** — and it has been since the beat was
written, through every version of the gif that has shipped.

Beat 3 walks the `/ps` table's rows with `↓`, which moves focus *into* the live
block (C16 I22). A printable key arriving there does nothing: C16 §"unconsumed
keys" says in as many words that it must not leak into the prompt behind it. So
every character of the next beat was dropped, correctly, by a rule written to
prevent exactly the thing that would have made the beat work by accident.

`Esc` returns focus to the prompt and the beat now runs. What is worth recording
is why it survived: **an empty prompt is what a prompt looks like.** There is no
frame to compare against, no assertion that could have failed, and the beat is
one of ten in a ninety-second recording. It took reading the beat at a settled
point and asking where the menu was.

The instrument that found it is the one `README.md` already names — a screencast
is a frame-read with an audience — and it is now four for four on that recording.


---

## F75 — a view leaves nothing behind, and three of them made the demo bounce

The overview gif jumped back to the banner every few commands. Two rounds of
pacing changes did not fix it, because the cause was not in the script.

**Measured from the frame after `Esc` leaves `/container stats`:** the transcript
held the dashboard and `/ps` and nothing else. `view: true` verbs — `/container
stats`, `/inspect`, `/logs` — are fullscreen layers that append no entry (A01
D7), and C15 T5.5 states it as *the transcript is untouched*. So the recording
went transcript → fullscreen → **the same transcript** → fullscreen → the same
transcript, and each return was a frame the viewer had already seen.

**Correct behaviour, wrong material.** Nothing on the pop path touches the
viewport — the position was never moved; the transcript was simply short enough
to fit, so its first entry was at the top. A recording that wants to read as one
session has to be built from verbs that append, and the demo now uses one view
rather than three.

**A second jump was scripted rather than structural**, and it is the more
embarrassing half: a beat pressed `⌃Home` to "reach the patch's first hunk", but
`/config` is `local: true` — a transcript entry, not a view — so `⌃Home` at
`global` is `scrollTop` over the whole session. It scrolled to the banner every
time it ran.

**And `PageUp` was not the fix either.** Replacing it, `beats.py` still reported
that beat at the top: two screens of transcript is one page, so a single `PageUp`
reaches the banner anyway. The diff is on screen when it lands, and scrolling
belongs to the closing beat where it is the point.

## F76 — the reading tool answers the question now

The bounce was in a measurement taken before any of this: a per-beat table showed
the banner returning at three timestamps, and it was explained away as a
detector artefact instead of looked at. The numbers were right and the reading
was not.

`tools/beats.py` prints, per beat, the transcript's top row and **whether the
banner is on screen** — so "did it jump" is answered by the tool rather than by
eye, and cannot be read past.

**Its beat list is derived from `screencast.BEATS` rather than hand-written**,
which is the other half. Hand-maintained timestamps went stale the first time a
beat was shortened: every label after it named a different moment, and the report
said the deliberate scroll-to-top beat was *not* at the top while an ordinary one
was. Nothing was wrong with the recording. A settled frame is one followed by a
pause, so the pauses in the script are exactly the frames worth reading, and
taking them from the script means the two cannot disagree.

---

## F77 — a verb that asks a question cannot be an adapter ★★★

`ctx.ask` is on `LocalContext` (C23 I36) and nowhere else. An adapter is handed
one `RawResult` and returns one document; it has no way to suspend, so **any verb
that confirms must be a local handler**.

Five of step 9's eight verbs confirm, and every one of them would otherwise have
been an adapted verb of about fifteen lines. Instead the family is 185 lines of
local handler, and the difference is not the confirm itself — it is everything an
adapter gets for free and a local handler must do by hand: `meta` (F13), the
failure arm, the invocation record, and the spawn.

**This is the third distinct reason this application has reached for `local`**,
and the first two were about state rather than input:

| surface | why local |
|---|---|
| the dashboard | a ring that has to outlive a fetch |
| the events window | the same |
| the mutation family | `ctx.ask` is not on `AdapterContext` |

Three different needs, one escape hatch, and the escape hatch costs the whole of
C07 each time. The pattern F14, F36 and F43 describe from the other side — a fact
the consumer needs and is not offered — with the consequence made structural: it
is not that a local handler is missing something, it is that **asking anything at
all forces a route change**.

Filed rather than fixed, because the fix is a ruling and not a field. An adapter
that could ask would need a suspension point in C07's contract, which is a much
larger thing than it looks and may well be the wrong shape — an adapter is
specified as a pure mapping from result to document, and that is worth keeping.
The alternative is to say plainly that interaction belongs to L4 and that the
local route is where it lives, which is what the code already says three times.

**What is not in doubt is that the count is now three.** Two instances is the
threshold for noticing; the third is where a workaround stops being a workaround.

---

## F78 — `b.live`'s `stream` arm is declared, validated, and never driven ★★★

`LiveSpec` offers two ways to feed a live part:

```ts
fetch?:  () => Promise<unknown>;
stream?: () => AsyncIterable<unknown>;
```

`b.live` **validates the pair**: it throws with *"b.live needs a `fetch` or a
`stream`"* when both are absent, and throws again when both are present because
*"they are exclusive"*. Two throws that exist only to police a choice between two
alternatives.

**One of the two alternatives does nothing.** `partOf` (`src/shell/execution.ts`)
builds the driver's part with:

```ts
fetch: spec.fetch ?? ((): Promise<unknown> => Promise.resolve(null)),
```

and never reads `spec.stream`. Nothing in `refresh.ts` reads it either. So a part
declared with `stream` is registered, driven once with a `fetch` that resolves
`null`, rendered as `render(null)`, and the generator **is never invoked**.

Measured: the built block carries no reference to the stream at all — only the
`loading…` notice — and no site in `src/` mentions `spec.stream`.

**The validation is what makes this expensive.** An unimplemented field that
nobody mentions is a field nobody uses. A field the constructor *insists* on —
"supply one of these two" — reads as a decision the author is being asked to
make, so choosing the unimplemented one is the natural outcome of following the
API. Step 11 chose it first, for `docker build`, which is exactly the case it
looks written for.

**And it fails silently in the worst direction**: `render(null)` produces a
plausible empty panel rather than an error, so a build that streams nothing looks
like a build that produced nothing.

The workaround is the one three other surfaces here already use: `fetch` plus
`every`, polling a buffer the process fills. That is the dashboard's ring (gap 1)
and the events window's, arriving a fourth time — see F77, which is the same
shape one layer down.

Filed rather than fixed: implementing it is C23 §3b's, and the ruling is whether
a streamed part's ticks are patches like a fetched part's or something else. What
should not survive either way is the pair of throws policing a choice where one
option is inert — **that is A03 §2's vacuity class expressed as an API**.

---

## F79 — the frame-read instrument mis-renders a 256-colour sequence ★★

Step 11's build frame showed a step named `38;5; RUN sleep 2 && echo two > /two`.
The `[3/3]` prefix was gone and an SGR fragment stood in its place, exactly six
cells wide where `[3/3] ` is six cells wide.

**The application is correct.** The raw capture holds:

```
\x1b[38;5;188m[3/3] RUN sleep 2 && echo two > /two
```

— a well-formed CSI followed by the right name. `tools/screen.py` renders it
wrongly. Its `CSI` pattern (`\x1b\[([0-9;?]*)([a-zA-Z])`) matches this sequence,
so the fault is elsewhere in the replay — the `OSC` substitution runs first over
the whole stream and an unterminated `\x1b]` anywhere will consume an arbitrary
span, which is the shape that produces a localised corruption like this one.

**Why it is worth ★★ rather than a note: it is the instrument.** Every frame-read
in steps 9, 10 and 11 went through `screen.py`, and this is the first time its
output has been checked against the bytes it was replaying. A capture tool that
silently mangles one cell is a tool that can also silently mangle the cell an
assertion is about — and a frame-read exists precisely because it is the thing
that sees what assertions cannot.

The practice that caught it generalises: **when a frame shows something
surprising, read the raw bytes before believing the render.** It was noticed only
because `38;5;` is obviously not something this application would print. A subtler
corruption — a digit, a truncation mark — would have read as an app defect and
been "fixed" in the app.

Not repaired here: it is a tool in `examples/docker/tools/`, the app's output is
verified correct by the bytes, and repairing a replay parser mid-step is how a
step stops being about its subject. Filed with the reproducer above.

---

## F80 — `interactive` is a property of the verb, and `docker run` is not ★★

`ToolDef.interactive` declares that a verb takes the terminal (C05 I19), and C23
§4 routes on it: `suspend` → `handoff` → `resume` → `invalidate`. The flag is on
the **tool**, and `FlagDef` has no equivalent.

`docker run` attaches by default and detaches with `-d`. Same verb, two terminal
contracts, chosen per invocation:

```
/run -it alpine sh      needs the terminal
/run -d nginx           must not take it
```

C05's own comment argues the declaration belongs to the app author because
*"whether a child wants a TTY is not knowable before running it"* — and that is
right about detection. **For this verb the author cannot know either**, because
it is not a property of the verb. The declaration has one slot and the verb has
two behaviours.

**Declared `interactive: true` here, which is the safe direction of a choice with
no right answer.** Wrong that way, `/run -d nginx` suspends and resumes around a
call that returns at once — a flicker on a detached run. Wrong the other way,
`/run -it alpine sh` spawns a shell with no terminal and the session waits on a
child nothing can answer. One is cosmetic and one is a hung session.

`exec` and `attach` are unambiguous and take the flag honestly; `create` never
touches the terminal. **`run` is the only verb in this family the type cannot
describe**, which is what makes it a finding rather than a preference.

The fix is not obviously a per-flag `interactive` — that would let two flags
disagree, and C05 already rejects that shape for `view`. More likely the
declaration wants to be a predicate over the invocation, which is a larger change
than it looks and is C05's to rule on. Filed with the consumer that needed it.

---

## F81 — a cache hit is a kind and `Tone` is a grade, found a fourth time ★★★

`docker build --progress=rawjson` reports `vertexes[].cached === true`. A step that
was cached and a step that ran are **different kinds of thing**, and `Tone` is a
goodness axis — `ok`, `warn`, `error`. Reaching for it would say a cache hit is
*better* than work, which is not what a reader wants to know; they want to know
which steps ran.

So `renderBuild` carries the distinction in a **column, in words** (`HOW`:
`cached` / `ran` / `…`), and leaves `Tone` alone.

**This is F30/F49/F51's absent concept reached a fourth time, by a surface built in
a different step for a different reason** — which is the threshold the triage ranks
on. F30 wanted `added`/`removed` on a comparison, F49 wanted `+ - ~` to mean change
kind, F51 wanted a lifecycle event to say which event is bad. None of the three
knew about the others, and none of them is a build.

**The surface found the axis boundary by hand, and the boundary is the useful
part.** The same block *does* take a tone, on the same row, for the neighbouring
column:

```ts
step: s.error !== undefined
  ? { text: s.name, tone: "error", glyph: "error" }
  : s.name,
how:  s.cached ? "cached" : s.completed !== undefined ? "ran" : "…",
```

**Failure is a goodness axis and caching is not**, so one cell takes a tone and the
one beside it cannot — in a single row, built by a single expression. That is the
sharpest statement of the gap in the repository: not *this block needs a colour it
does not have*, but *this row needs two axes and the model has one*, demonstrated
by a cell of each sitting side by side. C04 I6 then required a glyph for the
`error` tone, correctly, and there is no equivalent obligation available for the
axis that has no home.

### Why it is filed now and not in step 11

**It was written down and it was written down in the wrong place.** The reasoning
above existed the whole time as a comment at `src/progress.ts:31` and again at
`:160`, and the first of them ends:

> This is F30/F49/F51's fourth consumer, **filed rather than worked around**.

It was not filed. The comment is a claim about a record, and there was no record —
so the strongest group on the triage's list looked like three consumers rather than
four for a whole step, and a reader of `FINDINGS.md` had no way to know otherwise.

**That is the sixth blind spot in its cheapest form.** F58 was a claim restated
across four documents that never held a measurement; F66 was one carried across four
steps that was never written down at all. This is the inverse of both: the *content*
was correct, complete, and measured — and it sat somewhere no mechanism reads. SP5
checks that every citation resolves to a finding that exists. **Nothing checks the
other direction: whether something that should have been a finding is one.**

The generalisation is not "grep comments for findings", which would be noise. It is
that **a comment is the natural place to explain a decision and the wrong place to
record a gap**, because the two read identically at the point of writing. The
decision — *use a column, not a tone* — belongs exactly where it is. The gap it was
taken in response to belongs here, and only the author, at that moment, can tell
which they have just written.

---

## F82 — the counter added because the rule shipped vacuous twice, shipped vacuous ★★★ — **fixed**

SP5 returns `scanned` and `citations` beside its violations, and `findings.d.mts`
says why in as many words:

> A count is the only thing that tells "clean" from "did not run", so it is part
> of the return rather than something a caller could forget to ask for.

`citations` was incremented **inside the violation branch**, after the
`if (known.has(id)) continue` that skips every citation which resolves. So it
counted failures, which is what `violations.length` already counts, and the two
were equal on every input SP5 has ever seen.

Measured on the tree at F81:

| | |
|---|---|
| `citations`, as reported | **0** |
| resolving citations actually walked past | **412, across 66 files** |

**Zero is what it reports on a clean tree, and zero is what it would report if the
regex matched nothing, if `CITED_FROM` excluded every citing file, or if the walk
returned an empty list.** Those are the exact two failures SP5 had already shipped,
and the field existed to tell them apart. It could not: a clean run and a dead run
were the same number, which is the property it was built to destroy.

**Third time, inside the instrument built after the second.** The rule was vacuous
once by scope (`walk("src")` holds none of the files that cite this ledger) and once
by range (a guard that skipped every number past the maximum, on a gapless ledger).
The counter was the response to both — and it was written in a way that could not
report either.

### The test agreed, in a way that is worth reading twice

```ts
expect(v).toHaveLength(0);
expect(v.citations, "it looked at the citation and accepted it").toBe(0);
```

**The message states the intent and the number asserts the opposite.** If it looked
at a citation and accepted it, `citations` is 1. Both halves were written in one
sitting, from the same understanding, and neither was checked against the other —
which is F65's shape, an artefact wrong about itself, arriving in a test rather than
in a drawing. Nothing in a review distinguishes the two: a message and an assertion
that disagree read exactly like a message and an assertion that agree.

**And the corpus row asserted the wrong count.** It checked
`scanned > 50` — *files opened* — which stays high when the regex matches nothing and
when the scope holds the wrong files entirely. `scanned` proves the walk ran;
**only `citations` proves the regex and the scope work together**, and that pair is
what failed both earlier times.

### How it was found, which is not by looking for it

Verifying the F81 triage's own claim — *"`make enforce` resolves every `Fnn` cited
above"* — by running the rule and reading its counters rather than its exit status.
`enforce` was green, as it has been through all three vacuities. The number beside
the green is what disagreed with the tree.

**That is the frame-read applied to an enforcement rule**: the exit status is the
assertion, and the counters are the frame. Three vacuities in one rule, none of them
visible from a passing run, is the strongest case in this repository for the habit —
and `citations: 0` is a fact a reader can check against a tree in one command, which
is what makes it worth returning at all.

Fixed: `citations` is incremented before the resolution check, so it counts every
citation walked past. The corpus row now asserts `citations > 200` — a floor well
under 412 so that filing findings does not move it — and the row above asserts `1`
under its original message.

**Mutation**, reverting the increment to the violation branch:

| row | killed |
|---|---|
| the corpus row (`citations > 200`) | ✓ — *expected 0 to be greater than 200* |
| a live number passes (`citations === 1`) | ✓ — *expected +0 to be 1* |
| SP5 fires: past the end of the ledger | unaffected, correctly |
| SP5 fires: a gap in the middle | unaffected, correctly |

The two `fires` rows are untouched because they never depended on the counter, which
is why four green rows and a broken field coexisted for as long as they did.

### The second half, which the first half found within a minute

**A working counter is a number you can check against a tree, and the first thing
it said was that the scope was wrong again.** `415` looked low, so it was compared
against what the repository actually holds:

| | scanned | citations |
|---|---|---|
| the scope as written | `src`, `docs`, `examples/docker/src`, `examples/docker/test`, the ledger, `CLAUDE.md` | **415** |
| what it was missing | **13 top-level documents under `examples/docker/`** | **250** |
| `TRIAGE.md` alone | — | **175** |

**The most-cited artefact after the ledger was outside the rule's scope**, and it is
the one whose entire job is to cite. So were `VERIFYING.md`, `README.md`, and every
`*_WALK.md` — the by-hand walks, which cite findings constantly because that is what
a walk produces.

**That is this rule's first vacuity repeating**, three instances of one class now: a
scope naming the directories thought to matter rather than covering the directory and
naming its exceptions. Fixed by walking `examples/docker` and letting `CITED_FROM`
filter, which is the shape that stops it recurring — a new document is covered on the
day it is written rather than on the day someone remembers the rule exists.

**No violation was hidden.** All 250 resolve; the gap was in what could have been
caught, not in what was. That is worth stating plainly rather than implying a near
miss: the cost was a guarantee nobody had, not a defect nobody saw.

**And the dedupe was caught by arithmetic, not by a test.** Widening the walk put the
ledger in scope twice — once walked, once named — so it was scanned twice and its 116
self-citations counted twice. `415 + 250 = 665` and the run reported **781**. The
difference is exactly 116. A counter that can be checked against a sum is a counter
that catches its own double-count, which is the second argument this finding makes for
returning numbers rather than a boolean.

Final: **306 files, 665 citations, 0 violations.**

---

## F83 — MG24 counts the implementing module as a consumer ★★★

MG24 asks whether an `export interface` member is *"named somewhere else under
`src/`"*. An interface declared in `types.ts` and implemented in `store.ts` is two
files, so **every member of it has a consumer by construction** — the implementation.

Measured over 280 interface members:

| | |
|---|---|
| MG24 sees a consumer for | **265** |
| ...of which **no** consumer outside the declaring component | **28** |

Two of the 28 are real and neither is allow-listed:

```
HistoryStore.rerun     types.ts:65 declares it, store.ts:136 implements it, nothing calls it
TransportRouter.busy   types.ts:74 declares it, router.ts:71 implements it, nothing reads it
```

**`busy` is the sharper one, because the tree says so out loud.** `router.ts:64`
comments that a guard *"replaced `busy` and `shellChild`"*, and `construct.ts:1024`
counts *"seventeen until `busy` and…"*. The member survived its own removal, and
MG24 could not see it because `router.ts` implements the interface `types.ts`
declares.

**This is the class MG24 exists for, hiding inside MG24's own definition of a
consumer.** A02 Seam 4 is about a component complete on its own side with nothing on
the other — and the *implementation* is the same side. The file boundary was taken as
a proxy for the seam, and within a component it is not one.

The fix is a boundary rather than a rule: count a consumer only outside the declaring
component. 28 candidates is a reviewable number, and the remainder disposes the same
way `UNCONSUMED_MEMBERS` already does — an entry with a reason, and the equality arm
that stops it outliving that reason.

---

## F84 — MG24 walks `export interface`; this codebase publishes with `export type` ★★★

MG24's member walk is anchored on `export\s+interface`. Every object type published
as `export type X = Readonly<{…}>` is outside it, and that is how most of this
codebase declares a contract:

| | members | inspected by any rule |
|---|---|---|
| `export interface` | 280 | **yes** — MG24 |
| `export type` object types (163 of them) | **798** | **no** |

`AdapterContext`, `LocalContext`, `RenderContext`, `ToolDef`, `Layer`, `ThemeTokens`
and `GlyphSet` are all in the unwatched 798. **Nearly three times as many published
members are unwatched as watched.**

**The current yield is low, and saying so is the finding's other half.** Measured
both ways:

- **no use anywhere in `src/` at all: 0.** The literal version of the gap is empty.
- **never named outside the declaring component: 67**, and they are dominated by
  deferrals already recorded — `ToolDef.oneShot` has three paragraphs in C22 §4
  explaining that it has no subject because `createTui` takes no argv, and
  `ThemeTokens.palettes` is `ThemeStore.applyOverrides`' known gap seen from the
  other side. **A documented deferral is the correct disposal and not a finding**,
  which is C04's `status: "proposed"` model.

**What is left after that filter is small and real:** `GlyphSet.teeLeft`,
`GlyphSet.teeRight` and `GlyphSet.hollow` are declared glyph slots with **zero uses
outside `glyphs.ts`** — three characters in a vocabulary with a degradation path and
no drawer.

So the scope hole is large and its present contents are not. **That is worth filing
precisely because the two are usually confused**: a rule whose scope excludes 74% of
its subject is a rule whose clean result means much less than it reads, whatever it
happens to contain today. F82 is the same sentence about a counter.

**And the measurement itself needed correcting mid-flight**, which is recorded because
it is the same trap: the first version inherited MG24's *skip the declaring file* rule
and reported `EngineOptions.onSourceError`, `FrameSchedulerOptions.windows` and
`ViewRefresh.offsetMs` as dead. All three are used in the file that declares them.
MG24's skip is right for interfaces, which live apart from their implementations, and
wrong for `export type` objects, which are usually declared beside their use. **A
filter carried from one shape to another produces confident false positives**, and
the only thing that caught it was opening the three files.

---

## F85 — a context requires two fields whose supplier cannot supply them ★★★

`RenderContext` has eight fields. Every construction site supplies all eight, so the
partial-context pass reports it clean. Two of them are ceremonial, and the code says
so:

```ts
// The registry replaces both of these with itself; they are here because
// the type requires them, and a caller should not have to know that.
measureChild: registry.measure,
renderChild: () => {
  throw new Error("renderChild is supplied by the registry");
},
```

`render-lines.ts` builds a `RenderContext` at two sites and both write a `renderChild`
that **throws if it is ever called**, because `BlockRegistry.render` overwrites it
before any renderer sees it (`registry.ts:157`).

**This is F58b's class, reached independently by a second component.** There, an
adapter must compute ten `meta` fields and `authoritativeMeta` honours three. Here, a
caller must supply eight context fields and the registry honours six. Both times the
compiler demands a value, the consumer discards it, and the only way to satisfy the
type is to write something untrue — a `?? 0` in one case, a throwing stub in the other.

**A throwing stub is the more honest of the two and the more dangerous.** F58b's
false value was silently discarded and nothing downstream ever showed it; this one
is a live landmine that is correct only because the overwrite is unconditional. The
comment is the whole of the guarantee.

**The fix is the same shape and it is a narrower type**: the fields the registry owns
do not belong in what a caller constructs. `Omit<RenderContext, "measureChild" |
"renderChild">` at the construction boundary makes supplying them fail to compile
rather than fail to matter — which is exactly F58b's disposition, and the second
instance is what says it generalises beyond the adapter surface.

Two independent consumers is this project's threshold for a shape being real.

---

## F86 — F79 named a mechanism it did not measure ★★

F79 recorded that `tools/screen.py` mis-rendered a build step, quoting the raw bytes,
and proposed a cause:

> the `OSC` substitution runs first over the whole stream and an unterminated `\x1b]`
> anywhere will consume an arbitrary span

**Measured against the tool, which is unchanged since before F79 was filed:**

| input | rendered |
|---|---|
| the exact quoted bytes, alone | **correctly** — `[3/3] RUN sleep 2 && echo two > /two` |
| an unterminated `\x1b]0;docker-tui` earlier in the stream | the SGR line **still correct**; the OSC leaks as visible text |

```python
OSC = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")
```

**The pattern is anchored to a terminator, so an unterminated OSC matches nothing and
consumes nothing** — the opposite of the proposed mechanism. `[^\x07\x1b]*` cannot
cross an ESC either, so the span it can eat is bounded by the next escape in any case.

**Two results, and they point in different directions:**

1. **F79's symptom is not reproducible at HEAD** from the bytes it recorded. It was
   real — the bytes are quoted and the frame was read — but the cause is unestablished
   and the reproducer in the finding does not reproduce it.
2. **A different, real `screen.py` defect exists**: an unterminated OSC is printed as
   text rather than consumed, so a title-set sequence appears in a frame as
   `0;docker-tui`. That is a corruption of exactly the kind F79 argues about, arrived
   at from the other end.

**This is the sixth blind spot inside the finding that founded the instrument group.**
F79's own text says *"when a frame shows something surprising, read the raw bytes
before believing the render"* — and then names a mechanism without running it. A
hypothesis in a finding reads exactly like a measurement in a finding, which is the
whole of F58 and F66 restated.

**It also prices the group's disposition.** *Every instrument gets a fixture it must
reproduce* is not a tidying exercise: the two commands above are the entire cost, and
they turn one unreproducible anecdote into one falsified mechanism and one reproducible
defect. Neither was available while the tool had no fixture.

---

## F87 — the triage's partition is claimed, and the count that checks it cannot see the claim ★★

`TRIAGE.md` §*How this file was checked* states the property and the check in one
breath:

> The inventory is derived, not hand-copied. `grep '^## F' FINDINGS.md` yields 89 ids
> and every one appears in **exactly one** group above — 10 + 12 + … = 89.

**The sum is right and the property is false.** F30 is a bolded key in group 4 (a
change axis) *and* in group 7 (an artefact wrong about the framework). Measured:

| | |
|---|---|
| ids in the ledger | 89 |
| distinct ids keyed in the triage's groups | **89** |
| ids keyed in **two** groups | **1** — F30 |
| ids group 7's rows name | **15** |
| ids group 7's heading claims | **14** |

**The two errors cancel exactly.** Group 7 declares 14 because it silently excludes
the id already counted under group 4, so `10 + 12 + 6 + 4 + 6 + 2 + 14 + 8 + 7 + 5 +
6 + 2 + 1 + 6` reaches 89 whether the partition holds or not.

**The count is a proxy and it agrees with itself.** A sum over group sizes tests that
the sizes add up; it cannot test that the groups are disjoint, because a duplicate
placed once and counted once is arithmetically invisible. The check was built against
the F55 version's failure — a heading reading *5 surfaces* over six rows — and it
catches that shape and only that shape.

**F30's placement is not the defect.** It genuinely is both: a verdict the union
lacks, and a drawing that asserted one. **The sentence claiming a strict partition is
the defect**, and the remedy is to state that groups may overlap and to mark the
second appearance as a cross-reference — not to move the finding.

This is F65 arriving in the document written to sort F65, and *assert the artefact,
not a proxy* is the rule it fails: a disjointness claim wants a duplicate check, which
is one `sort | uniq -d` and was never run.

---

## F88 — `CALCIUM_ROADMAP.md`'s own cross-references point at the wrong entries ★★

The roadmap's body refers to Order entries by number — *"the same mechanism as
selection's full-row background (#22)"*, *"see #16, which supersedes an earlier
draft"*. Every such reference was resolved against the Order list:

| | first count | **amended** |
|---|---|---|
| `#NN` references in the body | 31 | **32** |
| resolving to the entry the sentence means | 17 | 17 |
| **resolving to a different entry** | 12 | **13** |
| ambiguous (a section, not an entry) | 2 | 2 |

**The first count was one low, and how it was missed is the useful part.** Line 2152
is `#31` *inside Order entry 25* — *"Design with as-you-type (#31)"* — and as-you-type
is entry 40; 31 is completion ranking. The roadmap's own body says the right thing
forty lines above it. Thirty references were resolved against the Order list and
**that one was waved through as "inside the Order block"**, because its position made
it look like bookkeeping rather than a claim.

**A count that agrees with its own rows and is one short of the tree — in the finding
written about a count that agreed with its own rows.** F87's shape, in the document
about it, produced by the same move: a category exempted rather than resolved. **An
exemption is where the next instance hides**, and this one exempted by position.

Not near-misses. A sample, each checked by reading both the sentence and the entry it
lands on:

| written | means | lands on |
|---|---|---|
| `#20` — *"appears in `/theme --help` for free once #20 lands"* | 21, `--help` per verb | off-screen live parts |
| `#16` — *"see #16, which supersedes an earlier draft"* | 18, shared pollers | one popup |
| `#24` — *"With ranking (#24), 'best' becomes meaningful"* | 31, completion ranking | more default themes |
| `#26` — *"it pairs with `b.row` (#26)"* | 38, horizontal composition | view trace in transcript |
| `#25` — *"worth doing with the scroll-anchor rule (#25's neighbourhood)"* | 8, the scroll-anchor rule | ghost text |
| `#32` — *"a theme declares the background it assumes (#32's ruling)"* | 39, theme background | prefix-out |

**The cause is a renumbering that did not propagate**, and it is the edit-script
discipline stated in `CLAUDE.md` — *an edit script asserts every replacement matched* —
failing in the direction that leaves no trace: the Order list was reordered, every
`#NN` in 2,000 lines of body kept its old target, and each one still resolves to a
real entry. **A dangling reference would have been visible; a wrong one is not.**

**Why it matters beyond tidiness.** Several of these are dependency statements — *do
ranking before ghosting*, *build the wash with the background* — so a reader following
them builds in the wrong order. `#20` and `#16` are the sharpest: both are read as
prerequisites, and both name an unrelated entry.

**The general form is worth more than the fix, and the disposition is *not* a rule.**
A reference into a numbered list is checkable exactly as `Fnn` citations are, and the
tempting fix is an SP-class rule resolving `#NN` against the Order list. **That would
make a fragile scheme checkable rather than removing the fragility.**

**Ruled: anchors, not numbers.** A `#NN` encodes a *position*; an anchor encodes the
*thing*, and a renumber cannot invalidate it. That is *make the wrong state
unbuildable rather than corrected* — the trade this project has now taken five times,
after the TDZ `const`, `Exclude<ParseResult, {kind:"empty"}>`, glyphs-as-tokens and
`origin` over `viewState`. **Enforcement is for classes that cannot be designed away,
and this one can.**

**The Order list keeps its numbers**, because a sequence is what they are good for.
Numbers for the list, anchors for references — only the reference use was ever
harmful. Inside the list's own code fence, where a link cannot render, a cross-entry
reference becomes the entry's *name*.

**Fixed at `80bd50b`+**: 32 references converted, 18 anchors added, and **each of the
13 resolved by reading the sentence rather than retargeting the number** — a stale
reference lands *somewhere*, so a mechanical retarget preserves the defect in a new
form. Several were dependency statements, and a dependency pointing confidently at the
wrong entry is worse than one pointing nowhere.

---

## F89 — an Order entry carries a claim its own document records as corrected ★★

`CALCIUM_ROADMAP.md`'s Order list, entry 32:

> `32 prefix-out / defaultRoute` — **CommandPolicy is exported and unreachable — a
> config field.** And prefix-OUT (prose by default) is a separate ruling that
> `agent-tui` needs

The body of the same document, forty lines apart, says both things:

| | |
|---|---|
| *"~~The command prefix is unreachable~~ — **CORRECTED: it is wired**"* | `TuiConfig` has `commandPolicy?`, threaded `config.ts:108 → construct.ts:673 → execution.ts:174 → parse` |
| *"~~superseded~~"* (struck heading, live body) | *"`TuiConfig` has no policy field… there is no way to get one into a session — the eleventh instance of exported-and-unreachable"* |

**Measured at HEAD, and the correction is the true one:**

```
src/shell/types.ts:318      commandPolicy?: CommandPolicy;     ← the field exists
src/shell/config.ts:108     commandPolicy: config.commandPolicy ?? slashPolicy
src/shell/construct.ts:699  commandPolicy: config.commandPolicy
src/shell/execution.ts:174  policy: deps.commandPolicy
src/interaction/parser/parse.ts:51   const policy = ctx.policy ?? slashPolicy
```

An app can supply its own prefix today. **The struck section's body was never amended
and the Order list was drawn from it**, so the summary a reader acts on carries the
falsified half while the correction sits above it in the same file.

**The surviving half is real and different.** Prefix-*out* — prose by default, verbs
by exception — is genuinely inexpressible: `prefixPolicy("")` makes every token a verb.
That is a live gap with a named consumer, and it is not *"a config field"*; it is a
ruling about whether the default route belongs inside `CommandPolicy` or beside it.

**So the entry does not earn its stated place, and the reason is F66's shape one
document out.** A claim was corrected in place and the correction did not reach the
summary that cites it. Repetition inside a single document is not corroboration either:
the strikethrough marks the *heading* as superseded and the body reads as current,
which is exactly enough ambiguity for a summariser to take the wrong half.

**What a triage cannot see, stated plainly**: this was not reachable from `FINDINGS.md`
at all. It came from resolving the Order list's summary against its own body, which is
*going to find where the claim was written down* pointed at a roadmap.

---

## F90 — the frame is recomputed and rewritten whole, and the four fixes are one chain ★★★

**Filed as one finding because they are not independently actionable.** Each stage
pays off only once the one before it lands, and landing them out of order converts
continuous lag into a single long stall rather than fixing it. Four ids would invite
exactly that.

**Measured in the source, not profiled.** Two multiplicative costs on one keystroke:

| | |
|---|---|
| `shell/session.ts:368` | `write(`${hide}${HOME}${lines.join("\r\n")}${cursor}`)` — **no comparison against the previous frame.** On 200×50 that is ~10,000 cells of styled output to change one character |
| `shell/paint.ts:152` | `renderSequenceToLines(...)` per visible entry **per frame**, and nothing caches rendered lines. Only `measure` is cached — C14, on `(entryId, rev, width)` |

**`region()` is the sharper statement**, and it is three lines below the call:

```ts
const lines = renderSequenceToLines(deps.registry, blocks, width, {...});
const out: string[] = [];
for (let i = 0; i < n; i += 1) out.push(exact(lines[i] ?? "", width));
```

**Every line past `n` is computed and discarded.** A 5,000-line patch renders 5,000
lines, keeps thirty, and with highlighting `lowlight` tokenises all 5,000 first — per
keystroke. The virtualisation is at *entry* granularity; C14 selects which entries are
visible and the renderer then renders each one whole.

### The chain, and the order is the finding

| | stage | why it cannot move |
|---|---|---|
| **1** | **output diffing** — keep the last frame as rows, write only those that differ | Cuts every frame regardless of block size. Smallest, contained to one file, and **the invalidation story already exists**: `contaminated` forces a full repaint when the screen's contents are unknown |
| **2** | **render caching** on `(entryId, rev, width)` | The frame *after* the first becomes free. **Alone it is not enough** — the first frame still renders 50,000 lines, so this converts continuous lag into one long stall |
| **3** | **window the block** — reduce a block to a valid smaller block of the same kind | The one that actually fixes it. `windowPatch` proves the pattern at `shell/patch-view.ts:97`, but **only inside a pushed view** — the transcript has no equivalent. Per divisible kind: `patch` `table` `keyValue` `logs` `code`. The plot does not divide, and that is permanent (C12 I1) |
| **4** | **cap with a visible marker** | Even windowed, `measure` walks the whole block once to know its height. `MAX_ROWS = 2_000` at `data/adapters/fallback.ts:39` is **the fallback adapter's own limit** and D40's cap bounds *blocks per document*, not rows within one — so an app adapter has no bound at all |

**Stage 4's marker is what keeps it honest.** `fallback.ts:251` already writes
*"Showing the first 2,000 rows; N more were not rendered"* for its own cap; a silent
truncation is the empty-block class, and D40's eviction carries a marker for the same
reason.

**Anticipated in a comment and never built.** `terminal/frame-scheduler.ts:175` reasons
about *"diffing against a screen whose contents nobody knows"* — a sentence that only
means something if diffing is the normal case. **Specified in prose, absent in code**,
which is this project's most-instantiated shape and the reason stage 1 is first.

**Independent confirmation of the diagnosis, from the other side.** `code.ts:69` memoises
tokenisation because *"a transcript re-renders on every frame; tokenising it on every
frame…"* — **someone already knew rendering repeats and mitigated its most expensive
part** rather than the repetition. The memo stays correct after stage 2 and stops being
load-bearing.

**Why it was never filed.** It is not a docker-tui finding: no surface *failed*, and the
app's own documents are small. It was found by reading `session.ts` and `paint.ts`
against each other, which is the instrument no triage contains.

**The acceptance test is a frame-read, not a benchmark** — type into a 5,000-line diff
and watch. A microbenchmark that improves while the frame still stutters has measured
something other than what a reader experiences.

---

## F91 — every `b.live` part owns its own fetch, and two views of one source disagree ★★★

**The optimisation is the weaker half.** The landing dashboard, `/stats` and a
single-container panel each spawn `docker stats --no-stream` on their own interval —
three subprocesses, one endpoint, no coordination.

**The correctness half is the finding.** Two parts polling the same source at different
moments **hold different data**: one plot and one sparkline each keep their own history
and the two diverge on screen. Two renderings of one fact showing different numbers is a
defect, not a cost — and it is the two-records-of-one-fact class, which this project has
now found in a type, in a document and here in a clock.

**The split that fixes it, and it is a design rather than a cache:**

```
SOURCE       fetch, shared, versioned            one poll per tick
DERIVATION   pure, shared, memoised              the ring buffer · the parse · averages
PART         view state + render, per instance   one expanded, one collapsed
```

> **Per-part state is view state only. Anything that accumulates belongs in a derivation.**

That rule is what makes the rest safe. Expanded/collapsed and which-tab do not need
updating while nobody is looking; a ring buffer does — so **a paused part cannot fall
behind, because it holds nothing that could.**

**`assignOffsets` and `backoffOf` are the existing seam** (`shell/refresh.ts:93,108`).
They stagger *parts*; with shared sources there are far fewer things to stagger and parts
sharing one are aligned by construction rather than by arithmetic. The stagger gets
simpler and has less to do.

**Its second consumer is already written down and depends on it.** `refresh.ts` holds
**no visibility check of any kind** — its only `viewport/` import is `TranscriptStore`,
and the two occurrences of *"visible"* in the file are comments about something else. So
a part ticks whether or not its entry is on screen: scroll past a `/stats` entry and it
**keeps spawning `docker stats` every two seconds for a panel nobody can see.** Unlike
the render cost, this one spawns processes and hits the far side.

**I9 is not violated by pausing, and the distinction is the ruling.** I9 protects a
*frozen* entry — a newer entry appeared, the thing is still running, patches keep
arriving. **Scrolled-off is a different state**: nobody is looking now, and the data must
be fresh when they look. Pause and catch up on re-entry; with a shared source, one visible
part keeps the source polling for everything sharing it, so returning is frequently free.

**Where to stop: two levels, not a reactive graph.** `source → derivation → part` covers
every case here. That is the same call as `b.row` being a container rather than a layout
engine, and windowing being block-boundary rather than mid-row — **three rulings with one
shape**, which is the evidence it is the right one.

---

## F92 — `usageBlocks` renders per-verb help and only an exit code can ask for it ★★

**The claim this was filed from was wrong and the correction is the finding's shape.**
`CALCIUM_ROADMAP.md` states *"`usageBlocks(tool, id)` is built, exported, and has no
caller in `src/`"* and its Order entry compresses that to *"built, exported, and
uncallable"*. **Measured:**

```
src/data/adapters/mapping.ts:159   export function usageBlocks(tool, id): readonly Block[]
src/data/adapters/mapping.ts:237     ...usageBlocks(ctx.tool, id("usage-block"))   ← inside `if (raw.exitCode === 2)`
```

**It has a caller and it is not uncallable.** The roadmap's own body says as much two
paragraphs later — *"it exists as the far side's usage-error path"* — so the summary
overstates a body that is correct, which is F89's shape in a second entry of the same
document.

**The true gap is narrower and still real: the only thing that can ask for it is the far
side exiting 2.** A reader who wants to know what a verb takes cannot get this document.
`/ps --help` reaches the far side instead, because **every declared flag is transmitted**
— which is F39, and `--help` is now its **second independent consumer**.

**Its own comment argues for a trigger it does not have:**

> *Exit 2 is an invocation problem, so the document says what a correct invocation looks
> like — generated from the manifest, because a hardcoded usage string is wrong the first
> time a flag is added and nobody notices until someone reads it.*

**Two rulings when it is built.** Reserve `--help` framework-side rather than making apps
declare it — C05 already appends the framework's six verbs to every parsed manifest, and a
per-app discipline means one app forgetting it is a verb with no help. And it **shrinks**
`/help`: verbs with summaries at the top level, detail behind `/verb --help`, so the
fifty-verb wall becomes two levels and the second one is already written.

**Blocked on F39.** Filing it separately is the point — F39 was one consumer and a shim
absorbed it; it is now two, and the second is the framework's own.

---

## F93 — C09 §4a promises a registration path that was never built ★★★

`src/presentation/blocks/kinds/code.ts:31` is `createLowlight({ json, yaml })`. Everything
else renders flat: TypeScript, Python, a stack trace, a diff, SQL.

**This is a regression against a stated design, not a scoping choice.** The file's own
header commits to languages *arriving*:

> *"measures identically whether or not its language is registered — a grammar shipping
> tomorrow does not reflow yesterday's transcript"*
>
> *"An unregistered language renders as plain text, not an error"* — readable today and
> **highlighted whenever someone registers it**
>
> *"The fallback is a fallback, not a filter."*

**Every one of those sentences is pointless under a fixed two-language set.** `measure`
ignores tokenisation *so that* adding a grammar later is safe; unregistered renders as text
*so that* it is readable until someone registers it. Then the constructor shipped with **no
registration path**, so *"whenever someone registers it"* has no someone. The spec's own
promise is unreachable.

**The recorded objection does not survive measurement.** Grammars import individually —
`diff` 1.2 KB, `python` 9 KB, `typescript` 21 KB — and **24 mainstream grammars total
180 KB**. The 9.3 MB figure is the whole package: 384 grammars, minified duplicates and CSS
themes, none of which is pulled in. For a Node CLI that is noise, and a highlighter that
flattens the language you actually use reads as broken rather than as economical.

**Why nothing caught it, and this is the part worth keeping.** C09 was built when the only
consumers were `docker inspect` (JSON) and an nginx config (YAML). **Two grammars satisfied
every test, and nothing in the suite could distinguish *we ship two* from *we ship two for
now*** — §4a's promises about future languages are prose, and no rule checks prose against
behaviour. That is the standing gap named by both coverage audits and by the step-3a
partition, arriving with a consumer.

**Two changes, and the second is the one the spec obliges.** Ship the mainstream set, and
**expose registration** — which matters more at 24 than at 2, because a mainstream set never
covers a consumer's own domain. Exported block kinds with unexported grammars is the same
asymmetry as a factory you can import and cannot install.

**Amend the comment rather than deleting it.** Its principle holds — the full 384 *is* most
of the weight and none of the value. What changed is that *"actually needed"* was measured
against two consumers and now has more.

---

## F94 — `export interface` does not mark a seam, and MG24's premise rests on it ★★★

**One level past F83.** F83 said MG24's definition of a *consumer* was too weak.
This says its definition of a *seam* is wrong, and it is the reason F83's fix could
not be applied as written.

MG24's header states the premise outright: *"A member of a published interface is
the discriminator, and it is not a convenience: the interface **is** the seam."*
Measured over 280 members with three definitions of consumed:

| consumer is… | unconsumed |
|---|---|
| a bare name in another **file** — the rule before F83 | 15 |
| a **call** in another file | 39 |
| a **call** in another **component** — A02 Seam 4 read literally | **76** |

**76 of 280 is 27% of the published surface**, and a rule whose violation describes a
quarter of the tree is describing the architecture rather than a defect.

**Re-measured after F95 removed the four phantom members: 73 of 276**, and the
conclusion is unchanged. The figures above are recorded at the parser that produced
them, because a table silently restated at a later measurement is how a document stops
being checkable — and `componentSeamSignal` now prints the live number on every
`make enforce`, so it is the summary line and not this paragraph that goes stale. Categorising
the 38 that the component-scoped form produced says why:

| | | |
|---|---|---|
| **2** | no call anywhere | the class MG24 exists for |
| **24** | called inside their own component | an **internal contract**, not a seam |
| **11** | called only by a test | a **diagnostic surface**, not a seam |
| **1** | called by the reference app | an out-of-tree consumer (C24 I11's category) |

**Three kinds of interface wear one keyword, and no textual rule separates them**,
because `export` is per *module* and a component spans modules. An interface shared
between two files of one component **must** be exported for TypeScript to permit it,
so exporting is not evidence of anything.

**A component barrel was tried as the discriminator and does not work either.** 21
components have an `index.ts`; L4 has none, because nothing imports from the top —
so every C22 and C23 interface would be exempted for the wrong reason.

**Ruled: gate on the narrow half, report the wide half.** A consumer is a *call*
outside the declaring file — which is F83's real defect, since the implementing file
was counted as a consumer — and that produces **22 violations**, a list small enough
to read, containing both of F83's own instances. The component-scoped measurement
becomes a reported signal rather than a build gate, which is the line **C24 I11
already draws** for the unused-export scan: *a reported signal rather than a build
gate*. Reusing that disposal rather than inventing one is the point.

**What this costs, stated rather than hidden:** the wide reading is the one A02 Seam
4 actually describes, and it is not enforced. A member consumed only inside its own
component still satisfies MG24. That is the same trade C24 I11 made and it should be
re-read when a component's public surface becomes expressible.

---

## F95 — MG24 counted method parameters as interface members ★★

`interfaceMembers` matched its member pattern against every line of an interface
body, and a parameter inside a multi-line method signature is such a line:

```ts
take(
  sourceId: string,        // ← matched as CompletionCache.sourceId
  key: string,             // ← CompletionCache.key
  ttlMs: number | undefined,
  run: () => Promise<…>,
): …
```

**Four of 280 in this tree, all from one signature, and two reached the violation
list** — where they read exactly like an unwired seam, because no such member exists
and therefore nothing can consume it. **A phantom is the worst shape a violation can
take**: it cannot be fixed by wiring, it cannot be fixed by deleting, and the only
resolution is an allow-list entry giving a reason for something that is not there.

**Found by opening the file a violation named**, not by any assertion — the fix's own
list was short enough to read, which is the argument for keeping it short.

The fix is a nesting-depth counter: a member sits at depth 0 in the interface body.
Four phantoms disappeared and the violation count went 24 → 22.

**Its general form is the one to keep.** A line-oriented pattern over a nested
structure is right about the line and wrong about the structure, and it fails
*inward* — matching more than it should, never less — so it can only ever be found by
reading what it produced. The same shape as the comment-stripping trap MG24's header
records, and the third parsing defect in one rule.

---

## F96 — history persistence never creates its directory, and the member that would is uncalled ★★★

**`FileSystem.mkdir` and `FileSystem.exists` are declared, implemented and never
called.** Nothing anywhere in `src/` creates a directory:

```
src/shell/types.ts:100    mkdir(path: string): Promise<void>;     ← declared
src/shell/session.ts:66   mkdir: async (path) => void (await mkdir(path, { recursive: true }))
```

That second line is the **implementation supplied into the seam**, and it is the only
`mkdir` in the tree. There is no `mkdirSync`, no `recursive: true` anywhere else, and
C20's writer uses exactly four members — `readFile`, `writeFile`, `appendFile`,
`appendFileSync`.

**So on any machine where the history directory does not already exist, history never
persists.** `persist.ts:91` appends to `paths.commands`, the write fails ENOENT, and
the catch at :94 does the right thing:

```ts
issued = from;                       // rewound, not dropped
warn("history could not be written", err);
```

**It is not silent — it is permanent.** The rewind means the next append retries the
same rows, and no code path ever creates the directory, so the retry fails identically
forever. C20's error handling is correct and cannot help: it is built for a transient
write failure, and this one never becomes transient.

**Why no test catches it.** Every history test injects a fake `HistoryFs` whose writes
succeed, which is right for testing the rewind and blind to the directory. **The fake
supplies the behaviour** — the precondition the real filesystem imposes is exactly what
a fake removes.

**The fix is a call, not a feature**: ensure the directory before the first write. It
belongs to **C22, not C20** — `HistoryFs` deliberately omits `mkdir`, and its own
declaration says a wider type would let a later edit reach for something the component
never needed. Widening it would trade this defect for F58b's and F85's shape. C22 owns
`FileSystem` and owns `stateDir`.

**It has a second consumer, and the fixture found it rather than the reasoning.** Once
`fakeFs` modelled directories, removing the `mkdir` call turned **T4.5 — `/theme light`
persists and survives a restart** — red, not a history row. Theme persistence writes to
the same directory and was equally broken on a fresh machine; the test had passed since
it was written because the double allowed it. **So the defect was never about history**:
it was *nothing in the shell creates the directory every persisted thing writes into*,
and history was simply where it was noticed.

**`FileSystem.exists` was removed rather than wired.** It was declared, implemented over
`fs.access`, supplied by both fakes and called by nothing, and there was nothing to wire
it to — `mkdir` is `recursive: true`, so a prior existence check is a call whose answer
changes nothing. MG24's disposition is *wire it or remove it*, and narrowing a public
type is cheap now and a breaking change after the freeze.

---

## F97 — reverse search opens and cannot be typed into ★★★

**`HistoryStore.searchType` and `searchBackspace` are declared, implemented,
revert-tested, and never called from `src/`.**

```
src/interaction/history/types.ts:69   searchType(text: string): void;
src/interaction/history/types.ts:70   searchBackspace(): void;
src/interaction/history/store.ts:155  searchType(text) { … }        ← implemented
test/revert/history.test.ts:107       store.searchType("ps");        ← the only callers
```

**The shell reaches ten of C20's members and not these two.** Measured over
`src/shell/` and `src/interaction/router/`: `append` `drain` `entries` `next`
`previous` `searchEnd` `searchLayer` `searchOlder` `searchOpen` `searchState`.

And the overlay keymap has no printable-key row — `tab`, `down`, `up`, `enter`,
`escape`, `⌃r`, and nothing else. **So `⌃r` opens a reverse search whose query can
never become non-empty**, and `⌃r` again steps older through an unfiltered list.

**This is MG24's founding class, arriving again.** C22 I38 was *C19 answered
`spinning` and `src/shell` never read it*; this is the same shape with a keystroke on
the end. And it is invisible in the way that class always is: **the producer is
covered at revert tier**, which is the strongest protection this suite offers, so
`searchType` is guarded against removal while nothing reaches it.

**A revert test is the most misleading place for an unwired member to be covered.**
Its whole promise is *removing this breaks a named test* — which is true, and says
nothing about whether anything calls it. The protection reads as evidence of use.

**Both defects together are the fixed rule's yield**, and it is worth stating as a
number: MG24 over 276 real members produced **two user-visible defects**, F96 and
this. Neither was reachable by any test in either suite.

---

## F98 — the suite leaves eleven sessions' process handlers attached ★★

`npm test` prints, twice per worker:

```
MaxListenersExceededWarning: 11 uncaughtException listeners added to [process]
MaxListenersExceededWarning: 11 unhandledRejection listeners added to [process]
… and the same for SIGINT · SIGTERM · SIGHUP · SIGWINCH · SIGTSTP · SIGCONT
```

**Measured before assuming, and it inverted the guess.** The pairing in `src/` is
correct and the asymmetry is *specified*:

```
lifecycle.ts:561   register()          ← at CONSTRUCTION, all eight events
lifecycle.ts:374   disposeHandlers()   ← only inside release()
```

> **C01 I3** — handlers exist before `acquire()` is reachable. **Construction has side
> effects deliberately**: a two-call API invites the ordering bug it exists to prevent.

So this is not a lifecycle gap. **`buildGraph()` never calls `release()`**, and neither
does any session test — so every constructed lifecycle leaves eight process-global
handlers attached, and a vitest worker running many files accumulates them until Node
complains at eleven.

**The consequence is not the warning.** `SIGWINCH` on an abandoned session is latent,
because the suite sends no real signals. **`uncaughtException` and `unhandledRejection`
are not latent**: they fire on any unhandled error anywhere in the worker, so a single
stray rejection in one test would be routed into eleven dead sessions' fatal paths, each
running `fault()` against a fake stdout and an `onFatal` whose test finished. The failure
would surface in whichever test was unlucky, attributed to it, with the cause eleven
files away.

**Node's warning is the whole of the detection**, and it is a warning about a count —
the same shape as reading a green gate's counters. Nothing asserts it, so raising
`MaxListeners` would silence the only signal there is.

**What is unmeasured, stated rather than guessed:** whether the harness should call
`release()` or dispose explicitly. `release()` does more than drop handlers — it unwinds
the terminal, and a fake terminal's unwind may assert. That is the question a fix has to
answer, and it is why this is filed rather than patched.

**Filed because it was a real observation living in a report.** It surfaced while reading
the F96 and F97 suite output, was set aside as harness noise, and *harness noise* is what
F62 and F79 also looked like. **F81 is the measured cost of the alternative**: a finding
that stayed a comment for a whole step, so the strongest group on the triage read as three
consumers rather than four.

---

## F99 — eleven published members no rule could see, and six of them are one shape ★★★

**F84's widening, landed and measured.** MG24 now walks `export type X = Readonly<{ … }>`
as well as `export interface`: **276 members → 1055**. Of the 41 violations that
produced, **eleven are named nowhere at all** — not in `src/`, not in `test/`, not in
`tools/`, not in the reference app:

| | |
|---|---|
| `GlyphSet.teeLeft` `teeRight` `hollow` `blocked` `warning` `bar` | **six declared glyph slots with no drawer** |
| `VerbRatio.derived` `authored` `ratio` | C08 provenance — three of a five-field record; `recorded` and `flagged` are read |
| `EngineOptions.cache` · `Grid.dots` · `Failure.actual` | one each |

**The coverage audit predicted three of these** (`teeLeft`, `teeRight`, `hollow`) and
stopped there, because it filtered by hand. The rule found six in the same record — and
the three it added are the ones that matter more: `warning` and `blocked` are *semantic*
slots, not box-drawing, so a theme declaring them gets nothing and the absence looks like
a theme error rather than a missing renderer.

**`VerbRatio` is the sharper instance.** Two of its five fields are read and three are
not, in one record, computed together — so the arithmetic that produces `ratio` runs on
every call and the answer is discarded. **A partially-consumed record is invisible to
every rule that asks about a type**: the type is used, the file is imported, and the
member is dead. That is the class F84 was filed for, and it needed the widening plus a
consumer definition that fits how records are actually used.

**The consumer test differs by keyword now, and that is F94 applied.** An `interface` is
implemented and *called into*, so a property access is its consumer. A record is *built*,
so `{ placed: …, popLayer: … }` names the member with no dot. **Measured: dot-access
alone reported 82 over the widened walk**, mostly deps records supplied by object literal;
using both tests everywhere made four allow-listed interface members read as consumed,
which the equality arm caught in the same run. One test each, matched to the keyword.

**The other thirty are the diagnostics category** — conformance reports and fixture-diff
records whose consumer is a suite, which is what a reporting type looks like from inside
the package that publishes it.

**Disposition: wire or delete, and the glyphs are the ones to rule on first.** Six slots
a theme can declare and nothing draws is the same shape as a spec promising registration
with no registrar — the reader's evidence that the feature exists is the declaration.

---

## F100 — narrowing the adapter's return exposed three things the wide type hid ★★★

**F58b landed**, and the interesting part is not the fix. `authoritativeMeta` honours
`adapter`, `truncated` and `resultId` and overwrites the other seven on every route, so
`AdapterMeta` now carries three keys and types the seven `never`.

**Three defects surfaced that the wide type had been holding up.**

### 1 · `Pick` alone does not narrow anything a helper returns

The first version was `Partial<Pick<DocumentMeta, …>>`, and **the app compiled unchanged.**
TypeScript's excess-property check fires only on a *fresh object literal*; a helper
returning a full `DocumentMeta` is structurally assignable to a `Pick` of it. The app's
`metaOf()` — **nine fields, duplicated verbatim in two files** — kept computing the
discarded seven and kept type-checking.

Typing the seven `never` is what forced it: `readonly string[]` is not assignable to
`never` whether it arrives by literal or by helper. **A narrowing that only catches
literals catches the easy half**, and the helper is where the duplication lives.

### 2 · An app cannot obtain a document to test against

`createAdapterRegistry` was not exported, so *"every document this app produces is valid"*
— the app's own F35 closure — could only reach `adapter.adapt()`, which is no longer a
document. **The suite failed the moment the narrowing landed**, which is C24 I19's
`contextAt` argument arriving on the adapter surface: a producer the framework can test
and a consumer cannot is one whose app-side tests assert against something the user never
sees. Now exported.

### 3 · A mechanical rewrite matched fourteen sites and seven were wrong

The nine-field `meta:` block is uniform, so one regex rewrote every occurrence — and
**half of them were not adapter returns**: `transcript/cap.ts`, four test-support
fixtures, two app *local* handlers, and two far-side documents that arrive on stdout
already complete. Every replacement matched. `tsc` stayed clean through the first pass and
**166 tests failed at runtime**, because a document missing seven `meta` fields still
satisfies a `Partial` type and fails validation.

**Reverted by asking which files contain an `adapt`** — and the first version of that check
was wrong too, grepping `adapt:` when the app uses method shorthand, so it reported *all
seven real adapters as non-adapters*. Two bad filters in one repair.

### And the fixture that had been lying

`documents.test.ts` built its `AdapterContext` with `as never` and omitted `tool`, a
**required** field. `usageBlocks` guards `tool === null`, `undefined !== null`, so routing
through the registry reached the exit-2 branch and threw on `tool.args`. The rows had
called adapters directly and never reached it. **`as never` is the mechanism**: a fixture
narrower than the interface it stands for cannot fail on the difference, and the cast
removes the compiler that would have said so.

---

## F101 — `stderr` and `exitCode` on a route with no far side ★★

**Measured while fixing F13**, which asked which of the seven `meta` fields the
framework can compute on the local route. Five are straightforward — `verb`, `argv`,
`durationMs`, `transport`, `origin`. Two are not, and they fail differently.

### `stderr` has no source, and the app used it as a second error channel

A local handler spawns nothing, so there is no standard error stream to report. Three of
the four helpers wrote `stderr: ""` — an invented constant. The fourth passed the failure
message, and **the same string appears three times in one document**:

```ts
error: { message, stage: "local" },     // C04 I3 — required when status is "error"
blocks: [b.notice.error(message)],
meta: meta(argv, 1, message),           // ← and again, as stderr
```

**So nothing is lost by emptying it**, and something is gained: `meta.stderr` meant *what
the far side printed* on one route and *what the handler decided to say* on the other,
which makes it incomparable between entries in exactly the way F58 wrongly claimed
`exitCode` was.

**The residue, and it is a type question rather than a bug**: `stderr: ""` is still
written, so the field is a constant on one of two routes. Removing it from
`DocumentMeta` is not available — the spawn route needs it — so the honest options are a
route-tagged union or leaving it empty and saying why. **Left empty with the reason
recorded**, because a union here changes a public type for a field nothing currently
misreads, and the freeze argument cuts the other way: making it a union later is additive.

### `exitCode` is derivable, and carrying both is two records of one fact

Every local document in the reference app pairs `status: "error"` with `exitCode: 1` and
`status: "ok"` with `0` — **eight sites, no exceptions**, checked rather than assumed. So
the handler was choosing a number that its own `status` already determined, and the two
could disagree with nothing to notice.

`runLocal` now derives it. **The disagreement was reachable**: a handler returning
`status: "ok"` with `exitCode: 1` produced a document C13 accepts, and `$?`-style
consumers would have read the two differently.

**And the diff-read caught one thing the suite could not.** Removing the four helpers
removed `adapter: "destructive"` with them, so every local verb's `meta.adapter` fell back
to `completeLocal`'s `"local"` default — eight handlers that used to name themselves,
anonymous. **Both suites stayed green**: `meta.adapter` is asserted three times and all
three are on the adapter route, so nothing on the local route could see it.

`adapter` is one of the three keys a producer owns, so each builder names itself again.
The catch is the argument for the read: the last mechanical rewrite was caught by 166
runtime failures, and this one had none to be caught by.

---

## F102 — D29's sweep exempts a *kind*, and the guard against that catches only a new kind ★★★

`expectDocument().hasNoColourOnlyDistinction()` ends in a `default` arm that calls
`assertNothingToCheck`, and its comment is the strongest self-description in the file:

> `default: break` accepted a new kind in silence, and silence in a compliance checker is
> indistinguishable from compliance. A03 §2's vacuity class in the checker.

That repair is real and it closed the case it named. **It does not close the neighbouring
one.** `KINDS_WITH_NOTHING_TO_CHECK` is a `Set<BlockKind>`, so membership is earned once,
by the fields a kind had on the day it was listed, and nothing re-reads it when the fields
change. A new *kind* is a compile error; a new meaning-bearing *field* on an exempted kind
is silence.

**Verified by fabricated violation**, because a claim about a hole is worth nothing
asserted:

```ts
// `events` is exempt. F51's remedy is a tone on EventLine. Land it and sweep:
{ kind: "events", id: "e", events: [{ ts: "12:00", type: "", message: "", tone: "error" }] }
expect(() => expectDocument(d).hasNoColourOnlyDistinction()).not.toThrow();  // passes
```

A bare `error` tone with no glyph and no text — the exact shape the `notice`, `keyValue`,
`pills` and `table` arms each throw on — passes, because the kind carrying it was exempted
before it could carry one. **Four arms enforce the rule and the fifth kind is outside its
subject**, and the difference is invisible from a green run.

**The class, and it is why this is three stars rather than one.** A03 §2 says a rule with
nothing to be wrong about passes like a rule that is satisfied. The repair above understood
that and built a guard — and the guard has the same property one axis over. **An exemption
is a claim about what the excluded set contains, and it is never re-checked, because the
whole point of exempting was to stop looking.** That is the count-an-exemption rule arriving
in a compliance checker rather than in a grep.

**The fix is not a wider sweep.** Keying the set on the fields rather than the name — a
kind is exempt while it declares no `tone`, no `glyph` and no other meaning-bearing slot —
makes the exemption expire when its premise does. C04 I37.

**And it did not fire on the change-axis ruling, which is the useful negative.** I35 forbids
a producer supplying a colour for a categorical axis, so the case D29 would have to catch is
unbuildable and the sweep needs no new arm. The hole is real and this ruling does not widen
it; those are two findings and only one of them is a bug.

---

## F103 — three renderers implement one pattern and none of them names it ★★

`patch`'s `TONES`/`MARKERS`/`SURFACES`, `structured.ts`'s `levelTone`, and the same file's
`comparisonTone` are the same construction: a frozen map from a domain vocabulary to a
palette slot, owned by the renderer, with the distinction carried in text or a marker so
that losing the colour loses nothing.

**Three instances in one layer, two of them in one file, and no shared name** — so when a
fourth surface needed it, it was not found. F30, F49, F51 and F81 are four independent
reports of *the model has one axis and needs two*, filed across four steps by surfaces that
knew nothing of each other, and the answer was in `src/presentation/` the whole time.

**What the absence cost is measurable and it is not code.** Each of the four solved it
correctly by hand — the app's `+`/`-`/`~`, the `HOW` column, the exit code in the message —
so nothing shipped wrong. What it cost was **four findings, one of which sat open for four
steps as a ranked gap in the triage**, and a plan entry reading *a change axis distinct from
`Tone`, 4 consumers, ⚠ C04 · C09 · C10* for work that turns out to be one type split and a
sentence.

**The pattern is now C04 I35 and the ruling is the deliverable**, but the finding is about
how it stayed invisible: **a pattern with three implementations and no name reads as three
local decisions**, and a fourth surface has nothing to search for. `levelTone` and
`comparisonTone` sit forty lines apart.

---

## F104 — `block()` is transparent to excess properties, so every C04 narrowing lands unenforced ★★★

C04 commitment 29: *"C04's constructors enforce the shape invariants and C24's `b` delegates
to them. One enforcement point."* The signature is

```ts
export function block<B extends Block>(spec: B): B
```

and **`B` is inferred from the argument**, so the literal's own type *becomes* `B`. There is
no fresh-literal check against `Block`, because nothing is ever checked against `Block` — the
constraint is satisfied structurally by a type that already has the extra keys.

**Verified by fabricated violation:**

```ts
block({ kind: "rule", id: "r", label: "x", utterGarbage: 42, anotherOne: { deeply: "wrong" } });
// tsc --noEmit: zero errors
```

**How it was found, and it is the more useful half.** Splitting `Comparison`'s verdict union
(F30) removed the field `comparison` from the type. `tsc` came back clean across `src`,
`test` and `tools` — 175 files — with **eleven fixtures still supplying `comparison: "same"`**.
A narrowing that removes a field from a public type should break every producer of it, and it
broke none, because all eleven go through `block()`.

**This is F85 and F58b's class arriving in the framework's own constructor**, and it is worse
than either: those were single boundaries with a stub or an overwrite behind them, and this is
the boundary *every* block passes through. Both suites were green either side, because a
fixture carrying a dead key renders identically to one that does not.

**The remedy has a precedent in the tree.** `ProducedMeta` makes forbidden keys unbuildable
with `Partial<Record<Exclude<keyof T, K>, never>>`; the same idiom distributed over the union
by `kind` would give `block()` the check its commitment claims. **Not attempted here** — the
blast radius is every block literal in the tree and it is not this item's scope. Filed with
the fabricated violation so the next narrowing does not repeat the measurement.

**What this means for the three narrowings already landed, and it has to be said here.**
F85, F58b and F13 all narrowed a type at a construction boundary, and every producer they
constrain reaches that boundary through `block()` or through a builder that delegates to it.
So **those three are correct by inspection and not by the compiler**: they were verified by
reading each call site and by the suites, which is weaker than what the diff appears to
promise. Nothing about them is known to be wrong — but a reader who assumes the type is now
enforcing them is assuming something this finding says is false, and the next narrowing
should not be planned as though the check exists.

**The generalisation, which is the fourth instance of one rule.** *A type narrowing needs
something to bite on* — and the thing that removes the bite has now been, in order: a stub
that throws, an unconditional overwrite, `as never` in a fixture, and **a generic constructor
that infers its constraint instead of checking against it.** The first three were call sites.
This one is shipped framework code sitting under all of them.

---

## F105 — MG24 matches member names globally, and a frozen marker table flipped two unrelated members ★★

`CHANGE_MARKERS` in C09 was added with the keys `unchanged`, `changed`, `added`, `removed`.
MG24's record arm counts `(?:^|[{,(\s])name\s*:` as a consumer, so `CorpusDiff.changed` and
`CorpusDiff.removed` — dead members of C08's corpus diff, two layers away — read as consumed,
and the bidirectional equality arm failed the build.

**The arm was right and the consumer test was wrong**, which is the good half: an exemption
that stops being true is exactly what that arm exists to catch, and it caught one within
minutes of an unrelated table being added.

**The obvious remedy was measured and is worse.** Scoping the shorthand match to files that
also name the owning type — a file building a `CorpusDiff` surely writes `CorpusDiff` — was
implemented and produced **19 new violations**, and they share one shape:

```
ConstructDeps.repaint · KeyDeps.anchor · RefreshDeps.viewBlock · ActionDeps.pushView
```

A `*Deps` record is built inline at a call site whose type comes from the callee's signature
and **is never written down**. That is the dominant legitimate use of the record arm, so the
scoping trades one false consumer for nineteen false violations. Reverted, and the figure is
recorded in the rule so the next person does not re-derive it.

**What was done instead**: the two `CorpusDiff` entries left `UNCONSUMED_MEMBERS` with the
reason in a comment. They are still genuinely unconsumed; if the collision ever goes, MG24
fires again and they come back — the entry re-earning its place rather than outliving its
reason.

**The residue, stated rather than left implied.** MG24's subject is a *name*, not an
`owner.name`, and no regex over stripped source can close that. F94 already says the rule is
textual; this is the first measured instance of the collision, and it went in the direction
nobody expected — a false *consumer*, silently weakening the rule, surfaced only because a
second arm disagreed with the first.

---

## F37 confirmed at a cost — an app cannot read the frame of a block it just built

Not a new finding; a measurement against an existing one. The change axis' first consumer is
`/drift`, and reading its rendered block from the app took **four attempts, each blocked by a
different unexported symbol**: `renderToLines`, `block`, `resolveTheme`, then the theme store's
shape. Abandoned, and the marker column was read from the framework's own harness instead.

`test/verbs.test.ts` already records the workaround as a decision — *"what a `Table` row
carries is a complete description of what will be drawn"* — and for a table that is true. It
is **not** true for the change axis, whose whole content is a marker the renderer derives: the
rows say `added` and only the frame says `+`. So F37's cost has risen from ergonomic to
evidential, and the app's own drift tests now assert a value whose rendering they cannot see.

---

## F106 — the block-expressiveness group is three findings and one visitor, and F34 was not half-answered ★★

The triage ranked F33, F34, F18 and F50 as one item: *a block cannot express what the surface
needs*, four consumers. Measured before ruling, as the change axis was:

| | wants | is it expressiveness? |
|---|---|---|
| F33 | `Comparison` to label its columns | **yes** — no field exists |
| F34 | a comparison's verdict to survive without colour | **yes** — nothing to derive a mark from |
| F18 | a live panel to look live | **yes** — a slot exists and no field names it |
| F50 | a non-flex column not to be truncated | **no** — its own text says *not a Calcium defect* |

**F50 is a visitor.** `planColumns` does exactly what C11 says; the finding is that `flex` and
`minWidth` are a shape a consumer gets wrong twice, and the block expresses the intent
perfectly. It belongs with the group-7 artefact findings, not here. Three of four.

**And F34 was not half-answered by the change axis, which is the correction worth recording.**
The marker column carries `unchanged`/`changed`/`added`/`removed`. F34's own measured bound
says `same` and `changed` were *already* recoverable — the two cells sit side by side — and
that `better` and `worse` are not. So the marker closed the half that was never at risk.

Frame-read, before the fix:

```
|field             a               b             |
|p99               200ms           150ms         |     ← better
|auprc             0.912           0.930         |     ← worse
|loss              0.03            0.04          |     ← no verdict
```

**Three verdicts, one appearance, at every colour depth.** The split made it sharper rather
than smaller: after I36, `verdict` is a standalone field whose only rendering is a tone —
`ok` and `error` with no glyph, which is the shape C04 I6 forbids for `Cell` and `Notice` by
name and cannot reach here because `ComparisonRow` is neither.

**The ruling that came out of the measurement is narrower than the item.** Seven shapes carry
a tone and **two carry a glyph slot**. The five without do not divide by "needs a field": for
`ComparisonRow` the fact was already named and the renderer simply never used it, and for
`KeyValue` rows, `Pills` chips, `Events` lines and `Series` there is genuinely nothing to
derive from. So *where a shape names a categorical fact the renderer derives the mark; where
it names only a tone a glyph slot is the remedy, and it waits for a surface.* C04 I38.

**The four that wait are held back by an instrument, not a preference.** MG24 refuses a
published member nothing consumes, so four speculative glyph slots arrive as four violations
and four allow-list entries — the rule correctly declining to let a schema grow ahead of a
surface. That is the second time in two items that MG24 has priced a design decision.

## F107 — the wiring survived the mutation pass again, and the fixture is why

`livePanel` is the one place in the tree that knows a region refreshes. Removing `live: true`
from it — F18 unfixed, the whole point of the change — **failed nothing across unit, contract
and integration.** `T1.4g` renders a panel with the flag and asserts the `▌`, so it tests the
mechanism; nothing tested that the shell sets it.

**The fixture is the sharp part.** `refresh.test.ts` builds its own `panel()` helper:

```ts
const panel = (id, title, child) => block({ kind: "panel", id, title, children: [child] });
```

— a panel **without** the flag, standing in for what the driver emits. So the suite that owns
this seam holds a fixture that disagrees with the code it covers, and no assertion could have
caught the regression by accident. *A fixture must be shown to respond to the thing under
test*, and a stand-in written before the field existed cannot.

Third instance of *a test that calls the mechanism verifies the mechanism, never the wiring*,
and the second in two items — F51's tone reached the type, the builder and the D29 sweep with
nothing asserting the paint. **Both were found by mutation and neither by review.**

---

## F108 — `FlagDef.view` has been usable on local verbs only, and its own comment says why ★★

`FlagDef.view` declares that an invocation is a pushed view. Its comment records, correctly,
that the example it was written for cannot be built:

> **S3 was named here too, as `ps <uuid> --watch`, and cannot be built that way.** `docker ps`
> takes no positional argument, `--watch` is not a docker flag, and **C06 I4 sends argv to the
> far side verbatim** — so the declaration would have put a flag docker rejects on a verb that
> rejects the id.

**Two reasons are given and only one is about docker.** The positional argument is a fact
about `docker ps`. *Argv goes over verbatim* is a fact about **Calcium**, and it applies to
every `view` flag on every spawned verb, not to that example — so the arm has been usable only
on `local: true` tools since it was written, and nothing anywhere says so. The comment ends
*"no consumer outside a test fixture reaches this arm yet"*, which is true and reads as
caution about an untested feature rather than as a bound on which verbs can use it.

**This is F39 with the finding already written down beside the mechanism.** F39 was filed from
`--raw` on `/inspect` and reads as one verb's problem; the same sentence sits in `types.ts`
describing the same defect for a different field, and the two were never connected because one
is a finding and the other is a comment.

**Closed by the same change.** `shellOnly` gives a `view` flag on a spawned verb somewhere to
go: declare both, and the flag decides the tier without reaching the binary. The arm is now as
wide as its type — and the entry stays because *the reason a feature is narrow should be in
the invariant, not in a parenthesis about the example that revealed it*.

## F109 — a proxy that stopped measuring its property, caught by the property still being true

C18's `T2.9 (I19): validateInvocation runs exactly once per parse` counts reads of
`tool.flags` through a `Proxy`, with a control establishing reads-per-call first — *"a fixture
must be shown to respond to the thing under test"*, which that test does better than most.

The first version of this change derived the transmitted argv in C18 by reading `tool.flags`,
and T2.9 failed: **4 reads against 3**. Validation still ran exactly once. The invariant held
and the proxy for it did not.

**The fix was the design, not the test.** A second reader of `tool.flags` in the parser was
also a second copy of the flag grammar — where a value is inline or the next token, where `--`
terminates — which is the drift a shared implementation prevents. Moving the split into
`validateInvocation`, which already walks those tokens, made T2.9 pass **unchanged** and
removed the duplication at the same time.

**Worth an entry because the failure was informative in a way a stricter test would not have
been.** A row asserting `perCall + 1` would have absorbed the change silently and kept the
duplicate grammar. The proxy's fragility is what asked the question — and the answer was that
the extra read should not exist, not that the count should be updated.

---

## F110 — `as never` in a fixture, fourth instance, and this time the count is exact ★★

`inspect.test.ts` declared its adapter context as

```ts
const ctx = { command: "/inspect x", verb: "inspect", transport: "subprocess",
              origin: "user", width: 120 } as never;
```

Five fields of an eight-field type, and `as never` satisfies every parameter, so the fixture
had stopped tracking the type it stands for — `userRequestedJson` and `tool` were already
missing and nothing said so.

Adding `AdapterContext.flags` surfaced it as **three runtime failures instead of one compile
error**, and the framework's own fixtures — which are typed — surfaced it as **nine compile
errors that were fixed in one pass before a test ever ran.** Same change, same day, both sides
of one repository: that is the cast's cost measured rather than argued.

**Fourth instance of the class and the first with a control.** The earlier three were each a
cast hiding a gap; this one had a typed cohort going through the identical narrowing at the
same moment, so the comparison is not a judgement about how much the cast costs — it is nine
against three, compile against runtime.

Replaced with `ctxWith(flags)`, typed. The remaining two `as never` casts in that file are
`registry`, which is a different question and already tsc-flagged (three pre-existing errors,
unrelated).

## F111 — a test named for a workaround outlives the workaround, and passes

`shim.test.ts` carried `describe("F39: the shim strips a flag that selects a rendering")` with
two rows asserting the strip. The strip was correct while F39 was open and is wrong now: C05
I21 removes `--raw` before the transport is invoked, so a shim that strips it is **a second
answer to a settled question**, and two mechanisms answering one question is how they drift.

**The test would have kept the workaround alive.** Deleting the shim's `case inspect)` made
`S4.1` fail — which is the suite working — but the obvious repair is to restore the strip,
because the row's *name* says the strip is the feature. Nothing in the test says it is a
workaround for a framework gap, even though its own file comment cites F39.

Rewritten to assert the opposite and to name why: the shim passes `--raw` through untouched
because it never arrives, and the declaration is what does the work. **A row asserting a
workaround should name the finding it is waiting on in its title**, not only in a comment
above it — the title is what a reader sees when it fails.

Companion to F92's shape. There, a summary kept a body's claim and dropped its condition; here
a test kept a mechanism and dropped the reason it existed.

---

## F112 — F21's four claims all held, and the fix was a tenth the size the report implied ★★

Measured at HEAD before building, because the report's three compounding facts read as a
design problem and two of them are not.

| claim | at HEAD |
|---|---|
| `paint.ts` builds contexts without `onAction` | **holds** — `capabilities` and `theme` only |
| `liveBlock` has three bindings and no `enter` | **holds** — `escape`, `down`, `up` |
| `KeyAction` is a closed union with no `rowActivate` | **holds** |
| `TuiConfig` has no keymap seam | **holds** — `createKeymap(defaultKeymap)`, nothing merged |

**And then the thing the report did not say.** A focus model already exists and works:
`focus.current.at === "liveBlock"`, `focus.rowId`, `focusRow`, and `liveRows()` walking the
live entry's tables through C11's `focusableRowIds`. `TableRow.actions` exists. `actions.ts`
exists. **Every piece of the route was built and one link was missing** — `enter` had no
`KeyAction` to resolve to.

So the fix is a union member, a binding, an effect, and a lookup beside the one that already
answers *which rows are focusable*. **Not the navigation model, and not the render context.**
The render-context half is the mouse route, which is a second path with its own question —
cell→element resolution — and it stays open.

**Why the report read bigger than it was.** Its three compounding facts are each true and
they are not the same size: no `enter` binding is one line, no keymap seam is a feature, and
`BlockKeymap` being dead is a third thing again. Listed together under one finding they read
as one problem, and the smallest of them was the one blocking the other two consumers.
*Compounding facts are not a difficulty estimate*, and the one that is load-bearing is worth
separating from the ones that merely also hold.

## F113 — a one-action fixture cannot falsify a first-action rule

C23 I37 rules that `enter` fires a row's **first** action. The test drove real bytes through a
real session and read the frame, which is the right shape — and the row it built had **one**
action, so *first* and *last* are the same element and the mutation taking the wrong one
survived the pass.

Two of five mutations mattered here and this is the second: the other four died immediately
because they break the route outright. This one is about a *choice inside* the route, and the
fixture had made the choice unobservable.

**Same class as the fifth-victim shapes and F73's ratio**: a setup where two readings agree is
a setup that tests neither. Fixed by giving the row a second action and asserting the first
fires *and the second does not* — the negative half is what has teeth, because a version that
fired both would satisfy the positive one.

**And the general form is worth stating, because the walk artefacts do not reach it.** A
ruling of the form *the Nth of a collection* needs a fixture with at least two members and an
assertion about the ones not chosen. Neither a sequence trace nor a classification table
indexes that: it is not two rules meeting, it is one rule with a degenerate input.

---

## F114 — the builder-coverage rule already existed, correctly stated, with nothing reading it ★★★

The audit was scoped as *four fields added one at a time closes four findings and leaves the
fifth to be discovered*, and the rule was to be the deliverable. **The rule turned out to be
already written, twice, and to have been true and unread for as long as it had existed.**

C24 I18, in the tree before this pass:

> A builder narrower than its block is **either a ruling with a reason written down or a
> defect; there is no third state**, and the reason is what tells them apart.

And commitment 16 says the same thing. Both correct, both general, both stating exactly the
rule this item was asked to produce — and underneath them:

| kind | field | disposition |
|---|---|---|
| `patch` | `collapsedAfter` | filed as F41 by a consumer who wanted it |
| `patch` | `actions` | **absent and unnoticed** |
| `table` | `sort` | **absent and unnoticed** |
| `plot` | `yFormat`, `xLabels`, `emptyMessage` | deliberately not, reason recorded — the model working |

**Two of six were the third column**, which is what an audit produces and four fixes cannot.
Both had been walked past: `patch` was audited by hand when `collapsedAfter` was filed, and
`table` is the most-used builder in the tree.

**`table.sort` is the instructive one.** `ColumnDef.sortable` is reachable from `b.col`, so a
surface can mark a column sortable and cannot say which one the data arrived sorted on. **The
pair reads as covered because half of it is** — a reader checking *can this table express
sorting* finds `sortable` and stops.

**So the deliverable is the mechanism, and the finding is that the prose was never the gap.**
MG27 compares every block type's fields against the builder that constructs it, with reasons
in `BUILDER_OMISSIONS` keyed `Kind.field` and the bidirectional arm `UNCONSUMED_MEMBERS` has.
It fired three violations on the run that created it.

**This is C09 §4a's lesson arriving in the document that states the lesson.** A rule with
nothing reading it passes exactly like a rule that is satisfied — A03 §2's vacuity class,
applied not to a rule with no subject but to a *correct* rule with no reader. The instrument
that finds the first kind is `make enforce`; the instrument that finds this one is asking
**which mechanism reads this sentence**, and the answer had been *none* for twenty-four
components.

**Two parsing corrections before the rule was trustworthy**, both of which produced false rows
on the first run and both worth recording because a rule that over-reports is not a rule
anyone keeps. `Hunk.lines[].kind` is `"add" | "remove" | "context"`, so scanning for a
`kind: "x"` literal invented three block kinds that do not exist — the `Block` union is the
authority. And `export type Rule = Readonly<{ … }> & Gap;` is one line, which a body regex
written for the multi-line form read straight past, attributing `Notice`'s fields to `Rule`.
The first run reported 28 unreachable fields across 16 kinds; the true figure is **6 across 3**.

---

## F115 — the coverage rule was blind to its own findings regressing, and had documented why ★★★

MG27's blind spots were written into A03 before the mutation pass ran, and the first of them
reads:

> It matches a field **name** in the builder's text, so a builder that mentions a field
> without setting it counts as covering it.

True, recorded, and its consequence not followed through. **A builder's text names a field
three times** — in the spec parameter's type annotation, in the destructure, and in the
constructed literal — and only the third sets anything. So deleting
`...(sort === undefined ? {} : { sort })` left two mentions standing, and **MG27 stayed green
on precisely the defect it had been written to find.**

The rule would have reported its three gaps once, on the run that created it, and then gone
blind to all three regressing. **A rule that fires once is indistinguishable from a rule that
works**, and this one had a green run and three closed findings as its evidence.

Fixed by scoping the search to the text from `finish<` onward — the annotation and the
destructure are both above it, so the split needs no parser.

**Recording a limit is not the same as following it through**, and that is the finding. The
blind-spot list is written to satisfy *state a rule's blind spot*, and it did: the sentence is
accurate. What it does not do is ask **what that limit means for the rule's own subject**, and
here it meant the rule could not defend its own fixes. The instrument that asked was the
mutation pass, and nothing else would have.

## F116 — a mutation surviving located the guard, not a hole

M20 and M21 — deleting `collapsedAfter` and `sort` from their builders — survived a `vitest`
run and died under `make enforce`. Both readings were available and only one is right: the
suite has no hole, MG27 is the guard, and **its only reader was a Makefile target.**

That is worth a row rather than a shrug. `npm test` excludes tier 5 already, and a rule whose
sole reader is `make enforce` is one a test-script refactor silences without failing anything.
Every other MG rule with a real-tree arm has one in the suite — `MG19` in `process.test.ts`,
`MG23` in `enforce-module-graph.test.ts` — and MG27 did not, because it was written straight
into `checkModuleGraph` and inherited its wiring.

Added, with the counters read rather than the exit status: the row asserts the violation list
is empty **and** that both subject files are in the walked set, because a rule handed a file
list missing `builders/index.ts` returns `[]` and passes.

**The general form**: when a mutation survives, ask *which mechanism was supposed to catch
this* before concluding the tests are thin. Three of this session's surviving mutations were
missing assertions; this one was a correctly-guarded mechanism whose guard ran somewhere the
mutation script did not look.

## F117 — a blanket rename hit a rule id that was already taken, twice

`MG26` was taken by the dev-only-entry-point rule and `C16 I24` by an existing invariant;
both were chosen by writing *the next number after the one I had just read* rather than by
reading the high-water mark. SP2 and A03's inventory caught both, which is those rules working.

**The repair is where the finding is.** Renaming MG26 → MG27 with a blanket replace of
`rule: "MG26"` also rewrote **the dev-entry rule's own emission**, so that rule started
reporting itself as MG27 and its two fabricated violations failed with *"MG26 matched
nothing — it would pass on a real violation"*. The rename fixing my rule broke a rule I had
not touched.

Same shape as this pass's own audit script, which invented three block kinds from a `kind:`
literal before the `Block` union was made the authority: **a textual rewrite over a shared
vocabulary hits every user of the token, and the ones you did not write are the ones you do
not check.** The fabricated-violation rows are what found it, which is the third thing in this
session that A03 commitment 14 has caught.
