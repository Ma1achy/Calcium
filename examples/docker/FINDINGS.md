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

## Open, not yet reached

Recorded so their absence is a decision. Each gets an entry above when the surface that
needs it is built.

- **Gap 7 — a `b.live` part hosted by a pushed view** (S3). The driver's `view` host arm,
  specified and shipped tested against an entry host only. The most valuable thing this app
  can surface, and step 3 reaches it.
- **Gap 3 — value-colour vs tone-colour.** A CPU bar encodes load on a continuum; Calcium's
  palette is tone slots. Step 2.
- **Gap 1 — history across ticks.** `b.live` re-renders from the latest fetch; a sparkline
  needs the previous values. Adapter ring-buffer first.
- **The line budget.** R01 commitment 1 caps app code at 300 lines. Exceeding it is a
  finding *about Calcium* — it means the app had to write something generic itself — so if
  it goes over, the lines that pushed it over get named here rather than the budget raised.
