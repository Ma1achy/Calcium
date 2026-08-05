# R01 — Reference app: `docker-tui`

| Field | Value |
|---|---|
| **Type** | Reference application |
| **Package** | `docker-tui` at `Calcium/examples/docker/` — a monorepo example consuming `@fmx/calcium` as a packaged dependency (sealed `exports` + pack-and-install CI), not through `../../src` |
| **Depends on** | `@fmx/calcium` only, through its public entry points (C24) |
| **Consumed by** | Nothing. It is a proof, not a library |
| **Source** | Scratchpad 4 · A02 §6 forcing function · C24 |
| **Status** | Draft |

---

## 1. Purpose

Three jobs, and they pull against each other.

**It proves the framework is reusable.** A02's reuse claim rests entirely on a second consumer existing. Until one does, "20 of 24 components are generic" is an assertion about code nobody has tried to reuse.

**It is the worked example.** The README gets a stranger to a running shell; this is what they read to do it properly.

**It is a semver check on the public API.** Bumping Calcium and finding this needs changes *is* the definition of a breaking change.

Where they conflict, **minimality wins**. A reference app that is itself a large program proves the wrong thing — if it takes 800 lines, the framework is not easy and the app is hiding that.

**Budget: under 300 lines of app code**, excluding the manifest and fixtures. Exceeding it is a finding about Calcium, not a reason to raise the budget.

---

## 2. Why docker

| | |
|---|---|
| Real NDJSON | `docker ps --format json` emits one object per line |
| Already installed | No auth, no cluster, no setup |
| Genuinely live | Containers start and stop; live views are exercised for real |
| Familiar | Everyone knows what `docker ps` should look like, so a bad rendering is obvious |
| **Not Prism-shaped** | Containers are not runs. A Prism concept quietly absorbed into the framework surfaces here, visibly |

The last row is the point of choosing it.

---

## 3. Scope

Five verbs, each earning its place by exercising something distinct.

| Verb | Exercises |
|---|---|
| `/ps` | Table, column priority, live block, row actions, drill-in |
| `/images` | A second table with different columns — proves the first was not a special case |
| `/inspect <id>` | `keyValue` and `code`, the detail-view shape, a drill-in target |
| `/logs <id>` | Pushed view, streaming, follow-tail |
| `/stats` | `b.live`, per-part failure, refresh — the isolation primitive |

**Read-only.** No `run`, `build`, `rm` or `stop`. A reference app that can delete someone's containers is one nobody runs twice.

### Four deliberate omissions, each a test of a default

| Omitted | Tests |
|---|---|
| Custom theme | That `defaultTheme` is genuinely usable, not a placeholder |
| Custom block kinds | That the sixteen defaults suffice for a second domain |
| Custom command policy | That the `/` default is right outside Prism |
| Emulator | That `SubprocessTransport` works independently of Prism |

**If the app needs to override one, that default is wrong.** These are assertions, not conveniences.

---

## 4. Docker's JSON is awkward, and that is the point

```json
{"ID":"a3f9b21c8d2e","Names":"web","Image":"nginx:1.25","State":"running",
 "Status":"Up 3 hours","Ports":"0.0.0.0:8080->80/tcp","CreatedAt":"2026-07-28 09:14:02 +0000"}
```

Six problems, all real:

| Problem | What the adapter must do |
|---|---|
| Keys are capitalised | Map them; nothing infers |
| `Names` is plural, usually singular, comma-joined when not | Split, take the first, note the rest in the expand row |
| `Status` is **prose** — `Up 3 hours`, `Exited (0) 2 days ago` | Show it, but never parse it for meaning |
| `State` is the machine-readable one | Derive the glyph and tone from `State`, never from `Status` |
| `Ports` is a formatted string | Render as-is; a parser would be wrong within a release |
| Everything is a string, including numbers | Coerce explicitly at the boundary |
| `Platform` is an **object** — `{"architecture":"arm64","os":"linux"}` | The row above is no longer true of docker 29. The coercion boundary meets a shape it was not written for |
| Docker **pre-truncates**, with U+2026 — `"Mounts": "/host_mnt/User…"` | Do not truncate it again. `cells()` measures `…` as one cell, so a second pass double-elides a value the far side already shortened |
| `Image` can be 85 characters — `vsc-tui-kit-07d4a92…-features` | The mock drew `nginx:1.25` in an 18-wide column. Real generated names are five times that |

**Three of those six rows were added after running `docker ps` for the first time**, and
they are the argument for the whole exercise. The first three came from reading docker's
documentation; these came from its output. `Platform` falsifies the row directly above it,
which had been true when it was written and stopped being true without anything noticing —
"docker will never change for us" cuts both ways, and the spec is the side that went stale.

**An adapter over tidy JSON teaches nothing.** This is the real job, and it proves C07's claim that adapters absorb an awkward far side rather than requiring it to change — because docker will never change for us.

The `Status`/`State` split is the instructive one: the human-readable field and the machine-readable field are different, and using the wrong one for the glyph produces a table that looks right and is wrong.

---

## 5. `/ps`

```
▌ ── containers · 4 running ────────────────────────────────────────────────────
▌
▌     id            name         image           state     status          ports
▌ ▸ ● a3f9b21c8d2e  web          nginx:1.25      running   Up 3 hours      8080→80
▌ ▸ ● 7c2d4e1a9f03  api          node:20-alpine  running   Up 3 hours      3000→3000
▌ ▸ ▲ 2e8a04c11b7d  worker       node:20-alpine  restarting Restarting (1) —
▌ ▸ ✗ f410d99e3a2c  db-migrate   postgres:16     exited    Exited (0) 2d   —
▌
▌   ⏎ inspect   ␣ expand   ≡ logs
```

| Column | Priority | Min | Flex | From |
|---|---|---|---|---|
| expand · glyph | 100 | 1 · 1 | — | `State` |
| id | 90 | 12 | — | `ID`, 12 chars |
| name | 95 | 16 | yes | `Names`, first only |
| state | 85 | 10 | — | `State` |
| status | 70 | 18 | — | `Status`, verbatim |
| image | 60 | 20 | — | `Image` |
| ports | 40 | 20 | — | `Ports`, verbatim; whitespace only |

State glyphs follow the framework's vocabulary: `running` → `●` ok, `restarting` → `▲` warn, `paused` → `▪` warn, `exited` → `✗` error, `created` → `○` muted.

Empty state names the flag that would widen it: `no containers running · try /ps --all`.

---

## 6. `/stats` — the isolation primitive

Three `b.live` parts, deliberately independent so one failing proves the pattern:

```ts
b.group("column", [
  b.live({ id: "cpu",    every: 2000, fetch: () => stats("cpu"),    render: cpuTable }),
  b.live({ id: "memory", every: 2000, fetch: () => stats("memory"), render: memTable }),
  b.live({ id: "io",     every: 5000, fetch: () => stats("io"),     render: ioTable }),
])
```

`docker stats --no-stream --format json`, polled. **Polling rather than streaming is deliberate** — `/logs` already exercises C06's NDJSON path, and nothing else would exercise `b.live`.

Killing the docker daemon mid-session must degrade all three parts *independently*, each showing its own error and countdown, with the frame otherwise unchanged. That is A02 §7 demonstrated rather than asserted.

---

## 7. Fixtures

The app ships a recorded corpus (C08), which does three things:

- CI runs without docker
- C08's recording tooling gets a **second consumer**, which is the only way to know it works for anyone but Prism
- Golden frames become reproducible

Recorded via `@fmx/calcium/fixtures`, provenance-marked, with the authored ratio reported. Scenarios: `running`, `mixed`, `empty`, `daemon-down`.

---

## 8. Repository and CI

**Resolved for the monorepo, without losing the proof.** The original intent — "its own
repository, consuming the package as a published dependency" — existed to guarantee one
thing: the example builds against the *packaged* artefact, not the working tree. An in-repo
example that builds through a path alias into `src/` proves nothing, because missing files
in `files`, a wrong `exports` map, unresolvable type declarations, or a peer dependency
that is really a hard one are all invisible from inside the workspace.

That guarantee is preserved in a monorepo by two mechanisms rather than by separation:

**The seal (dev loop).** The example lives at `Calcium/examples/docker/` and depends on
`"@fmx/calcium": "file:../.."`. Calcium's `package.json` locks `exports` to the three
entry points and sets `"files": ["dist"]`. With that in place `import "@fmx/calcium/src/..."`
is a resolution error — the app can only see the public surface, enforced by npm. **Verify
the seal before writing app code**; if `exports` does not seal it, that is a real Calcium
finding (C24's surface is not sealed), fixed first.

**The proof (CI gate).** A job spins up a local registry (Verdaccio), `npm publish`es
Calcium to it, installs the *real tarball* into a clean checkout, and runs the example's
tests against the installed package. This is what a separate repo bought — the packing
bugs `file:` cannot catch — obtained without the separation.

| CI job | Runs |
|---|---|
| Verify `exports` seal (`import ".../src"` must fail) | Always, first |
| Type-check | Always |
| Golden frames against fixtures | Always |
| `expectDocument` assertions | Always |
| **Pack-and-install via local registry**, tests against the tarball | Always — the "it is a package" proof |
| Against real docker | Only where the runner has it; **the skip is recorded, not silent** |
| Import manifest | For C24 T2.2's unused-export scan |

---

## 9. What it proves

Each row is a claim the framework makes and this app tests.

| Claim | Proven by |
|---|---|
| The framework is reusable | It exists, in another domain, under 300 lines |
| The defaults are usable | It overrides no theme, policy or block kind |
| Adapters absorb an awkward far side | Docker's capitalised, prose-valued, flat JSON |
| `b.live` gives isolation free | `/stats` with one part failing |
| The subprocess path works | It is the only transport used |
| Degradation is real | Golden frames, 16 configurations |
| The public surface suffices | Imports only Calcium, never a deep path |
| The package is a package | It installs from a registry, not a path alias |

---

## 10. Commitments

1. Under 300 lines of app code; exceeding it is a finding about Calcium.
2. Five read-only verbs; nothing mutating.
3. No custom theme, block kind, command policy or emulator — each omission is a test of a default.
4. The glyph derives from `State`, never from the prose `Status`.
5. `Ports` and `Status` render verbatim; neither is parsed for meaning.
6. `/stats` polls via `b.live`; `/logs` covers streaming.
7. One `b.live` part failing leaves the others rendering.
8. A recorded fixture corpus ships, giving C08's tooling a second consumer.
9. A monorepo example at `examples/docker/` that consumes the packaged `@fmx/calcium` — sealed `exports` for the dev loop, a local-registry pack-and-install for the proof — never `../../src`.
10. Its own CI; a skipped real-docker run is recorded, never silent.
11. It imports only from Calcium's public entry points, never a deep path.
12. It publishes an import manifest on each release, for C24's unused-export scan.

---

## 11. Tests

### Unit

- **R1.1**: each of the five adapters produces a document passing `validateDocument`.
- **R1.2**: `State` drives the glyph — five states, five glyphs; a container whose `Status` says "Up" while `State` says `restarting` renders `▲`.
- **R1.3**: `Names` with three comma-joined values → first in the column, all three in the expand row.
- **R1.4**: `Ports` empty → `—`; populated → verbatim, condensed only by whitespace. Docker sends `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` — an IPv6 twin per IPv4 entry, forty characters for one published port. Dropping the twin is parsing, and so is the `80→8080` form S2 was drawn with.
- **R1.5**: numeric-looking strings are coerced explicitly; none reaches a block as a raw string where a number was intended.
- **R1.6**: the empty state names `--all`.

### Contract

- **R2.1**: every document passes `measuresCorrectly()` at seven widths.
- **R2.2**: every document passes `degradesToAscii()` and `degradesTo1Bit()`.
- **R2.3**: no source file imports a deep path — only `@fmx/calcium`, `@fmx/calcium/testing`, `@fmx/calcium/fixtures`.
- **R2.4**: app source under 300 lines, excluding manifest, fixtures and tests.
- **R2.5**: no emitted command is a mutating docker subcommand — scanned against a denylist.
- **R2.6**: the app registers no custom block kind, theme or command policy.

### Edge cases

- **R3.1**: zero containers → empty state, no table.
- **R3.2**: 500 containers → renders within budget; C14 virtualises.
- **R3.3**: a container name of 200 characters → truncated; state and status unaffected.
- **R3.4**: a `Ports` string of 300 characters → truncated **from the end**, keeping the host port. The direction was inverted here and in S2, both times because the rule was reasoned against `80→8080`, which docker does not emit. In `0.0.0.0:8080->80/tcp` the host port is on the **left**, so "truncated from the left, keeping the host port" is not a thing that can be done. The rule is that a column keeps the field's identifying end; for this field it is the head.
- **R3.5**: malformed JSON on one NDJSON line → that line degrades, the rest render (C06 §5).
- **R3.6**: docker not installed → a clear error naming the binary, not a stack trace.
- **R3.7**: the daemon down → all three `/stats` parts degrade independently, each with its own countdown.
- **R3.8**: one `/stats` part failing while two succeed → two render normally.
- **R3.9**: `/logs` on a container that exits mid-tail → buffer retained, `r` offered (S12 §7).
- **R3.10**: a container removed between `/ps` and `⏎ inspect` → a clear error; the list is not silently corrected (B03 §5).

### End-to-end

- **R4.1**: golden frames at 60 / 80 / 120 / 160 × both themes × both unicode modes — sixteen configurations, all five verbs.
- **R4.2**: against real docker: `/ps`, drill into `/inspect`, then `/logs`, then `esc` — the B03 chain in a second app.
- **R4.3**: `/stats` for two minutes with the daemon killed and restarted → parts degrade and recover independently.
- **R4.4**: a clean clone, `npm install`, `npm start` → a running shell with no further steps.
- **R4.5**: bump Calcium to a new minor → builds with no app changes. **Requiring changes means the bump was not minor.**

### Fail-on-revert

- **R5.1** (C4): deriving the glyph from `Status` → R1.2 fails, and a restarting container reads as healthy.
- **R5.2** (C5): parsing `Status` or `Ports` → breaks on the next docker release, which is why R1.4 asserts verbatim.
- **R5.3** (C3): adding a custom theme → R2.6 fails, and the default stops being tested.
- **R5.4** (C1): exceeding 300 lines → R2.4 fails, and the app starts hiding framework friction.
- **R5.5** (C2): adding a mutating verb → R2.5 fails.
- **R5.6** (C11): a deep import → R2.3 fails, and the public surface stops being the surface.
- **R5.7** (C7): a shared failure path across `b.live` parts → R3.8 fails, and the isolation claim is unproven.

---

## 12. Out of scope

| Not here | Where |
|---|---|
| The framework itself | Calcium, C01–C24 |
| Prism's app | `prism-tui` |
| The README's example | Calcium, as a compiled fixture (C24 T5.1) |
| Docker's own behaviour | Docker |
| Mutating operations | Deliberately absent |
| A second reference app | Only if a third domain reveals something these two do not |

---

## 13. The scorecard — what the app proved, and what it did not

Written after the application was finished, because a commitment nobody scores is
indistinguishable from a commitment satisfied. Twelve rows, and **four of them do not
hold.** Each figure below is measured rather than recalled.

| | commitment | verdict |
|---|---|---|
| 1 | under 300 lines of app code | **exceeded — 663** |
| 2 | five read-only verbs, nothing mutating | held, and widened |
| 3 | no custom theme, block kind, policy or emulator | **held** |
| 4 | the glyph derives from `State`, never the prose `Status` | held |
| 5 | `Ports` and `Status` render verbatim | held, and it took a correction |
| 6 | `/stats` polls via `b.live`; `/logs` covers streaming | half |
| 7 | one `b.live` part failing leaves the others rendering | held |
| 8 | a recorded fixture corpus, giving C08 a second consumer | **not proven** |
| 9 | a monorepo example consuming the packaged framework | held — and was silently broken |
| 10 | its own CI; a skipped real-docker run recorded, never silent | **not held** |
| 11 | imports only public entry points, never a deep path | held in `src/`, **broken in `test/`** |
| 12 | an import manifest published on each release | **not done** |

### 1 — 663, against 300, and the overage is the finding it said it would be

*"Under 300 lines of app code; exceeding it is a finding about Calcium."*

**Measured with comments stripped**, because half of this application is commentary and a
raw line count would report how much was explained rather than how much was written:

| | lines |
|---|---|
| raw `wc -l` across `src/` | 3853 |
| code, comments removed | 1895 |
| **R01's own four verbs plus their wiring** | **663** |
| comment share | 50% |

The 1895 is not the number to judge: `DOCKER_TUI_SURFACES.md` supersedes this spec's scope
and builds twelve surfaces rather than four. **663 is the honest comparison**, and it is
2.2× the bound.

**The commitment asked for exactly this to be treated as evidence, so here is where the
overage went.** Every one of these is a logged finding, and each is an app writing
something the framework holds:

| what the app wrote | why | finding |
|---|---|---|
| its own terminal-width read | `LocalContext` carries `command` and nothing else | F14 |
| its own capability detection | `detectCapabilities` is not exported | F43 |
| a boolean threaded through eight functions | the fact is needed at the leaves and enters at the root | F54 |
| its own block measurer, by deep import | no public measurer | F37 |
| its own document validation, by deep import | no public validator | F36 |
| five `?? 0` coercions, every one discarded | the adapter's return demands ten `meta` fields and the registry honours three | F58b |
| six hand-built empty notices | `emptyMessage` exists on `b.table` and on nothing else | roadmap 3 |

That is `docs/ROADMAP.md` entry 1 with a line count attached. **The commitment worked**: it
was set as a tripwire rather than a target, it tripped, and what it caught is the same
thing the triage independently ranked first.

### 6 — half, and the missing half has two causes

`/stats` polls via `b.live`, as specified. `/logs` streams — but through C07's fallback
rather than `b.live`'s `stream` arm, because `docker stats` streams by redrawing the screen
rather than by emitting records (F10). **`b.live`'s streaming arm has no consumer in this
application**, and neither does the `logs` block: the app builds `b.raw` per line, because
`docker logs` emits no level and R01 commitment 5's own argument forbids parsing one out
(F64).

Two block behaviours this app was expected to demonstrate and does not, in both cases
because the far side is not the shape the block assumes. That is worth more than a
demonstration would have been.

### 8 — not proven, and the corpus that exists is not the one promised

*"Recorded via `@fmx/calcium/fixtures`, provenance-marked, with the authored ratio
reported. Scenarios: `running`, `mixed`, `empty`, `daemon-down`."*

`test/corpus/` holds **twelve real captures** — `ps-real.ndjson`, `stats-real.ndjson`,
`diff-real.txt` and the rest — taken by hand from a live daemon and committed as text.
They do the job the commitment's *first* reason names: CI runs the app's suite with no
docker at all.

They are not C08 recordings. Nothing in this application imports
`@fmx/calcium/fixtures` — the only reference is `seal.test.ts`, which asserts the entry
point **exists** and imports nothing from it. **C08's tooling still has exactly one
consumer**, which was the commitment's second and more interesting reason.

Stated as unproven rather than quietly satisfied by the corpus that happens to exist.

### 10 and 12 — not held, and the first one cost something

CI runs `make test`, `make golden`, `make e2e` and a degraded matrix. It runs **no job for
this application at all**, and no `make proof`.

That is not merely an omission. `make proof` was **red from PR #20 through PR #21** —
two merged steps — because two test files reached into `../../../dist`, a path that exists
in this checkout and not in the clean tree the gate builds. Nothing noticed, because
nothing ran it (F60). A gate that is not wired is not a gate, and the cost was two merges
past a broken one.

No import manifest is published (commitment 12), so C24 T2.2's unused-export scan has
never had this consumer's data.

### 11 — held where it was written down, broken where it was not

No file under `src/` imports anything but `@fmx/calcium` and two `node:` builtins —
23 imports, checked. **`test/` reaches into `dist/` twice**, for the measurer and the
validator (F36, F37), and both are recorded with an `eslint-disable` naming the finding.

The commitment says *no source file*, and a test is not a source file by that reading. The
honest verdict is that **the letter holds and the spirit is the finding**: the app cannot
test what it builds without reaching past the boundary the commitment protects, and that is
a stronger statement about the public surface than a violation in `src/` would have been.
