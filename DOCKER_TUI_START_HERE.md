# docker-tui — start here

You are building **docker-tui**, the reference application for **Calcium** (a terminal-UI
framework, formerly Calcium). It lives in the Calcium monorepo at `examples/docker/` and
consumes Calcium as a packaged dependency — see "Setup" below for why that distinction is
load-bearing.

docker-tui lives **in the Calcium repo** at `Calcium/examples/docker/` — a monorepo
example, not a separate repository. But it consumes Calcium as a *packaged* dependency,
not by reaching into `../../src`. The distinction is the whole point (see "Setup" below).

This file orients you. Read it, then the files in the order below.

---

## The one thing to understand first

**Calcium is complete and you are not changing it.** 25 components, built and tested,
`github.com/Ma1achy/Calcium`. Your job is to build an *app on top of it* against real
docker, and — this is the point — **to let the app find the gaps a framework's own tests
could not.** Four of Calcium's eighteen structural gaps were things only a consumer found.
docker-tui is the consumer.

So: **build against what Calcium exports today. When the app needs something Calcium
cannot express, that is a finding — record it with the surface that needed it, do not
reach into Calcium to add it mid-build.** The findings are the deliverable as much as the
app is. This is the same discipline Calcium was built with, one level up.

---

## Two reference-app specs, and which governs

There are two, and they do not conflict — one is the *minimal proof*, the other is the
*full demo*.

- **`R01_reference_app_docker.md`** — the original, minimal spec: four verbs (`ps`,
  `stats`, `logs`, `inspect`), written to prove specific framework properties (that
  `b.live` gives failure isolation, that awkward JSON adapts, that the export surface is
  usable). It is the **contract for what the app must prove**, and its four deliberate
  omissions are each a test of a Calcium default. Treat it as the floor.

- **`DOCKER_TUI_SURFACES.md`** — this session's full design: twelve surfaces, the live
  single-container drill-in as headline, plus the verbs that exercise every block type
  (comparison, real patch, plot, syntax highlighting). This is the **demo you are
  building** — the screencast-and-daily-driver scope, self-contained with every frame
  drawn in place.

**When they differ, `DOCKER_TUI_SURFACES.md` is the design and R01 is the set of
properties that design must still prove.** Build the surfaces; make sure R01's
commitments hold within them.

---

## Reading order

1. **This file.**
2. **`AGENTS.md`** — how Calcium is worked on. It points at `CLAUDE.md` in the Calcium
   repo, which is the working contract: the layer rule, the by-hand walk, the mutation
   pass, the fixture and double rules. **The walk and the mutation pass apply to
   docker-tui too** — every discipline that built Calcium builds its app.
3. **`DOCKER_TUI_SURFACES.md`** — the twelve surfaces, the build order, and the seven
   predicted gaps. This is your spec.
4. **`R01_reference_app_docker.md`** — the properties the app must prove, and the
   fixture/CI shape.
5. **`C24_public_api.md`** — Calcium's public surface. This is the only Calcium spec you
   strictly need, because it is what you import from. The three entry points, `b` (the
   block builders), `expectDocument` (the test helper), the manifest and adapter types.
6. **As needed, when a surface uses a block**: the component spec for that block —
   `C11_table_engine.md` (tables/drop), `C12_plot_renderer.md` (plots), `C04_view_model.md`
   (block shapes incl. `comparison`, `patch`, `b.live`), `C09_block_library.md`
   (rendering), `B04_degradation.md` (the 1-bit/ASCII showcase). Read these lazily — pull
   the one the surface in front of you needs, do not front-load all of them.

---

## Setup — a monorepo example that is still a real consumer

The app lives at `Calcium/examples/docker/`. Convenient, versioned with the framework —
**but it must consume Calcium as a package, through its public exports, never by importing
`../../src`.** R01's whole point is proving Calcium is a package a separate consumer
installs; an example that reaches into the source tree proves nothing.

This is enforced two ways: a sealed export surface for the dev loop, and a real
pack-and-install for CI.

### Step 0 — verify the surface is sealed (do this before any app code)

Calcium's `package.json` must have:

```json
"exports": {
  ".":         { "types": "./dist/index.d.ts",   "default": "./dist/index.js" },
  "./testing": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" },
  "./<third>": { ... }
},
"files": ["dist"]
```

With `exports` locked to the three entry points, `import "@fmx/calcium/src/data/..."` is
a **resolution error** — the package boundary is enforced by npm, not by discipline. The
app can only see what `exports` exposes.

**Verify this first.** If `exports` is missing or permissive, that is the first task —
and it is a real Calcium finding (C24's package surface is not sealed), which is on-theme:
the app finds the gap before writing a line. Confirm `import "@fmx/calcium/src/..."` fails
before proceeding.

### The dev loop — workspace + `file:`

```
Calcium/package.json          →  "workspaces": ["examples/docker"]
examples/docker/package.json  →  "dependencies": { "@fmx/calcium": "file:../.." }
```

`npm install` at the root links `@fmx/calcium` to the built package. The app imports
`import { b } from "@fmx/calcium"`, resolving to `dist/` **through the exports map**, not
to `src/`. Fast loop, no publish step, boundary still enforced. Rebuild Calcium
(`npm run build`) when its `dist/` needs refreshing.

### The proof — a local registry, in CI

The dev loop resolves to `dist/` directly, which does not exercise *packing*. R01's "it is
a publishable package" claim is proven by a CI step that installs the real tarball:

```
npx verdaccio &                                          # local registry, localhost:4873
cd calcium && npm publish --registry http://localhost:4873
cd $(mktemp -d) && npm init -y   && npm i @fmx/calcium --registry http://localhost:4873  # the real, packed artefact
# run the example's tests against the INSTALLED package
```

This catches what `file:` cannot: a file missing from `files`, a `dist/` not built before
pack, a broken `exports` path, an undeclared dependency. **`file:` for the inner loop, a
real pack-and-install for the release gate** — how well-run monorepos do it. Wire it as a
make target or CI script from the first commit; do not leave it until later.

Real docker, subprocess transport. `docker … --format json` is the far side; the adapter
turns it into blocks.

---

## The two findings most likely to be real, watch for them

From the gap list in the surfaces doc, these two are the ones only this app drawing these surfaces would
surface — neither the probe nor any Calcium test could reach them:

- **Gap 7 — a `b.live` part hosted by a pushed view (surface S3).** **Answered, and the
  premise was wrong — FINDINGS F20.** The `view` arm was tested from the day it shipped
  (T4.21); what is missing is a *producer*, and the answer is C22 §13's reserved ruling.
  The original wording, kept because the miss is the useful part: *"the part-refresh
  driver's host was ruled `entry | view`, but shipped tested against an entry host only."*
  S3 (the live single-container drill-in) is the first thing to host a live part in a
  *view*. Does the driver tick it, does teardown-on-pop reach it, does a refresh hold the
  scroll. This is the untested arm of a union — the exact shape Calcium found eighteen
  times. **Most valuable thing the app surfaces.**

- **Gap 3 — value-colour vs tone-colour.** A CPU bar's colour encodes *load* (green→red),
  not a semantic tone (ok/warn/error). Calcium's palette is tone-slots by design. A
  continuous load gradient may have no home. First thing docker wants that the colour
  model may genuinely lack.

Record each gap the way Calcium recorded its own: the surface that needed it, what was
reached for, and whether it is adapter-side work or a real Calcium finding. Do not fix
Calcium mid-build — file it, keep building, and the framework change comes later with a
consumer proving it is needed.

---

## Build order (from the surfaces doc, condensed)

```
1. file: resolution + manifest + /ps against real docker        (S2)
2. landing dashboard                                            (S1) — first b.live, entry host
3. ⏎ live single-container view                                 (S3) — HEADLINE, gap 7, the plot
4. /drift, then /compare                                        (S7, S6) — comparison at its best
5. /config, then /inspect --raw                                 (S8, S5) — real patch, syntax
6. /logs, /diff, the smaller verbs                              (S9-S11)
7. degradation showcase — the S3 view at five depths            (S12)
8. whatever gaps 1-7 turned out to be, each with a consumer
```

Step 1 is the smallest thing that runs against real containers. Steps 3 and 4 are where
the demo earns its keep. Nothing added to Calcium before step 1.

Plan in the usual shape — a kickoff, a plan back for go/no-go, then build. Start with
step 1.
