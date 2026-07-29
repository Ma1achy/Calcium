# tui-kit

**A framework for building terminal user interfaces over CLIs that emit structured JSON.**

Point it at a binary, describe its verbs, and you get a fullscreen shell: scrollable
transcript, tab completion, history, themes, live views, and graceful degradation
down to a 60-column monochrome ASCII terminal.

You write a manifest and some adapters. You do not write a terminal.

---

## The idea in one line

**Your CLI already knows how to do things. It just renders them badly.**

Almost every serious CLI grew a `--json` flag, and almost none of them use it for
anything but scripting. That flag is a full description of what the command found —
types, relationships, states, timestamps — and it gets thrown away to print columns.

tui-kit is the layer that turns the first into the second, without the CLI changing
at all.

```
        you type                    tui-kit                        your CLI
   ┌──────────────┐         ┌────────────────────┐         ┌──────────────────┐
   │  /ps --mine  │ ──────► │  parse · validate  │ ──────► │   <cli> ps       │
   └──────────────┘         │   against manifest │  argv   │   --mine --json  │
                            └────────────────────┘         └──────────────────┘
                                      ▲                              │
                                      │                              │ JSON
   ┌──────────────┐         ┌─────────┴──────────┐                   │
   │   rendered   │ ◄────── │  adapter → blocks  │ ◄─────────────────┘
   └──────────────┘         └────────────────────┘
```

The adapter is a pure function. **JSON in, blocks out.** That is the whole extension
model — everything else is the framework's problem.

Nothing in the framework knows what your domain is. It knows there is a tool with
typed arguments that returns structured data, and every behaviour above is derived
from that.

---

## Where it fits

Anything that emits JSON and has more than a handful of verbs.

| | |
|---|---|
| **Container and cluster tooling** | `docker ps --format json`, `kubectl get -o json` |
| **Cloud CLIs** | `aws`, `gcloud`, `az` — all JSON-native, all rendered as walls of text |
| **CI and build systems** | job lists, log streams, artefact registries |
| **Package and infra tooling** | `terraform show -json`, `npm ls --json` |
| **Internal platform CLIs** | the case it was built for — a bespoke tool with thirty verbs and no interface |

The last one is the sharpest. Internal tools accumulate verbs faster than they
accumulate interface, and nobody has the budget to write a TUI for one. The whole
point is that the interface costs a manifest and a handful of adapters.

---

## What you write

Using a container CLI as the example, because everyone has one installed:

```ts
import { createTui, b, defaultTheme, type Adapter } from "@fmx/tui-kit";
import manifest from "./manifest.json" with { type: "json" };

const ps: Adapter = {
  schema: "tui.view/1",
  adapt: (raw, ctx) => doc(ctx, [
    b.rule(`containers · ${raw.stdout.length}`),
    b.table({
      columns: [
        b.col("name",  { priority: 95, min: 16, flex: true }),
        b.col("image", { priority: 60, min: 20 }),
        b.col("state", { priority: 85, min: 10 }),
      ],
      rows: raw.stdout.map(c => b.row(c.ID, {
        name:  c.Names.split(",")[0],
        image: c.Image,
        state: stateCell(c.State),
      }, {
        actions: [b.fill("≡ logs", `/logs ${c.ID.slice(0, 12)}`)],
      })),
      emptyMessage: "no containers running · try /ps --all",
    }),
  ]),
};

createTui({ name: "ctr", binary: "docker", manifest, theme: defaultTheme,
            adapters: { ps } });
```

That is a working shell. **Verbs with no adapter still render** through a fallback
that turns any JSON into something legible — so you add them one at a time rather
than all at once, and a verb shipping tomorrow is usable tomorrow.

### Real JSON is awkward, and that is what adapters are for

The example above is doing more than it looks. Real CLI output is rarely tidy:

```json
{"ID":"a3f9b21c8d2e","Names":"web,web-old","Image":"nginx:1.25",
 "State":"running","Status":"Up 3 hours","Ports":"0.0.0.0:8080->80/tcp"}
```

Capitalised keys. `Names` plural but usually singular. `Status` is *prose*
(`Up 3 hours`) while `State` is the machine-readable one — and using the wrong field
for the status glyph gives you a table that looks right and is wrong. Everything is a
string, including the numbers.

An adapter over tidy JSON teaches nothing. Absorbing an awkward far side **so it
never has to change for you** is the job, and it is why the adapter layer exists
rather than the framework consuming envelopes directly.

---

## What you get

### The frame

Four regions with fixed ownership. Only the viewport flexes.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▲ ctr  v1.0.0   prod-eu · you@example.com            ● live         14:23:07 │  header
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ✓ config validated                    22 rules · 0 errors · 587ms          │
│   next: /deploy …   /status …                                       587ms    │
│                                                                              │
│ ▌ ── ps · 4 of 11 · --mine · last 24h ───────────────────────────────────    │
│ ▌                                                                            │
│ ▌   all ×11    running ×9    stopped ×2                                      │  viewport
│ ▌   ● up ×1   ✓ healthy ×6   ✗ failed ×2   ○ pending ×1                      │
│ ▌                                                                            │
│ ▌     id       name      status     detail       cpu             age         │
│ ▌ ▸ ● a3f9b21  web       running    3 replicas   12% ▁▂▃▅▆       23m         │
│ ▌ ▸ ✓ 7c2d4e1  api       healthy                  4%             41m         │
│ ▌ ▸ ✗ 2e8a04c  worker    failed     OOM            —           1h 12m        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ❯ /restart a3f9b21                                                           │  prompt
├──────────────────────────────────────────────────────────────────────────────┤
│ ↑↓ rows   ⏎ drill in   ␣ expand   f filter   s sort   esc prompt              │  footer
└──────────────────────────────────────────────────────────────────────────────┘
```

The `▌` marks the **live block** — the newest result, navigable right now with the
arrow keys. Everything above it is a frozen record that scrolls.

### The transcript model

Three tiers, decided by one question: **does it need single-letter keybindings?**

| | Behaviour |
|---|---|
| **Transcript** | Read once, keep the record. Validation output, a deploy result |
| **Live block** | Newest result, navigable in place. Lists, detail views |
| **Pushed view** | Takes the screen, prompt goes away. Log tails, dashboards |

A live block keeps the prompt, so letters still type. A pushed view needs `l` to mean
"cycle log level" — so the prompt cannot coexist with it. That test is the whole rule.

---

## Sixteen block types

An adapter never draws. It returns blocks, and the framework renders them — themed,
measured, degradable, and identical across every app built on it.

```
rule       ── ps · 4 of 11 · --mine ──────────────────────────────

notice     ✓ deployed · a3f9b21

keyValue   name        web
           status      ● running · 3 replicas
           resources   2 CPU · 4Gi · node-04

steps      ✓ resolving image         nginx:1.25
           ✓ validating config       22 rules · 0 errors
           ◐ rolling out             …

progress   replica 7 / 10   ████████████████████░░░░░░░░  70%    eta 2m 10s

plot         982 │⠉⠲⢄
                 │    ⠑⠢⣀
             311 │        ⠉⠒⠤⢄⣀⡀
                 └────────────────────────────
                  30m ago        15m       now

diff       spec.replicas          2       →  3

pills      all ×11    running ×9    stopped ×2

logs       14:23:01.882  INFO   [server] request r-8f2a · 12ms
           14:23:02.551  WARN   [pool] slow query (87ms · 95p)

code       apiVersion: apps/v1
           kind: Deployment
           spec:
             replicas: 2

tip        next: /logs …   /status …
```

Plus `table`, `events`, `panel`, `group` and `raw` — the escape hatch that renders
anything, so the vocabulary never has to be complete for the tool to work.

---

## Things it does that are easy to underestimate

### Columns drop by priority — and nothing is lost

Each column declares a priority and a minimum width. When the terminal narrows, the
lowest survive last — and **everything dropped appears in the expanded row**, so no
field is ever unreachable.

```
  160 cols   id  kind  name  status  detail  cpu  age  owner  ref
  100 cols   id  kind  name  status  detail  cpu  age  owner
   80 cols   id        name  status  detail  cpu  age
   60 cols   id        name  status  detail
```

At 60 you can still identify a thing and know what happened to it. Everything else is
one keystroke away.

### Degradation is real, not aspirational

Four independent axes, and one rule across all of them: **no information is lost,
only convenience.**

```
   24-bit truecolour  ─────►  256  ─────►  16  ─────►  monochrome
   full Unicode       ─────────────────────────────►  ASCII
   200 columns        ─────────────────────────────►  60
   everything up      ─────────────────────────────►  nothing reachable
```

A dropped column reaches the expand row. A lost colour is carried by a glyph. A lost
glyph is carried by a word. An unreachable service says so rather than rendering
empty. There is no width, depth, locale or outage at which it shows something
*wrong* — only versions that take more keystrokes to read.

```
   ✓ succeeded          →  under ASCII  →   + succeeded
   ● running · 3/3      →               →   * running · 3/3
   ▲ degraded           →               →   ! degraded
```

Substitutions are 1:1 by cell count, so a `LANG=C` session measures identically to a
UTF-8 one and the column drop order is the same in both.

### Failure is contained to the smallest thing that can report it

```
┌ cluster ──────────────┐  ┌ metrics · unavailable ───────────────┐
│ nodes      12         │  │ metrics backend unreachable          │
│ cpu        71%  ██████│  │ retrying in 12s                      │
│ pods      342         │  │                                      │
└───────────────────────┘  └──────────────────────────────────────┘
┌ running · 3 ─────────────────────────────────────────────────────┐
│ ● a3f9b21  web                3 replicas  ████████░░░░  12%  23m │
└──────────────────────────────────────────────────────────────────┘
```

One panel's query dies; the others keep working. The metrics backend being down does
not stop you seeing what is running, and a whole-screen error would hide three working
panels behind one broken one.

You get that from one builder:

```ts
b.live({ id: "metrics", every: 30_000, fetch: () => api.metrics(),
         render: data => b.kv({ cpu: data.cpu, memory: data.memory }) })
```

Backoff, staleness marking, stagger offsets, teardown and the error rendering all come
free. **The behaviour is fixed and only the rendering is overridable** — a guarantee
you can switch off is not one.

### It works with no backend at all

Three transports behind one interface, chosen by an environment variable:

```
   emulated      a stateful, animated world      → npm run dev
   fixture       a recorded corpus, no clock     → npm test
   subprocess    your actual CLI                 → production
```

**Tests never run against the emulator.** An animated world serving tests becomes the
thing tests agree with, and drift then hides regressions silently. Fixtures are
*recorded* from the real CLI and replayed byte-for-byte, with provenance — authored
ones are marked, justified and counted.

Selection is **per verb**, so a verb can migrate from subprocess to native TypeScript
without anything else changing.

---

## The parts you do not write

Twenty-four components. **Eleven of them you never touch** — and that is the measure
of whether the layering worked.

```
   L5  app          your adapters, manifest, theme
   ──────────────────────────────────────────────────────────
   L4  shell        composition · execution pipeline
   L3  interaction  input · editor · parser · completion · history
   L2  viewport     transcript · scrolling · overlays
   L1  presentation blocks · theme · tables · plots
   L0  foundation   terminal | view model · transport · adapters
```

Imports go down only. L0's two halves never touch each other — which is what lets the
terminal and the data layers be built in parallel, and it is checked mechanically
rather than by discipline.

Your extension points are five: **manifest content, adapters, theme tokens, the
command prefix, and dynamic completion sources.** Everything else is the framework's.

---

## Some deliberate decisions

**`/` prefix required.** `/ps` is your app's; `ps` is Unix's. That one character
removed an entire class of collision, killed the need for an escape hatch, and let
the prompt shrink from `(app) ❯` to `❯`.

**Anything with a shell operator goes to your shell.** `/ps --json | jq '.x'` is
handed to `sh -c` whole, with `/ps` rewritten to the real command. So globbing, brace
expansion and quoting are all exactly right, because they are your actual shell doing
them — rather than a reimplementation that is wrong in ways you find one at a time.

**Actions fill the prompt; they do not run.** Clicking `↑ deploy` puts
`/deploy a3f9b21 --confirm` in the input for you to read before you press enter. Only
filter pills execute directly, because a filter is reversible.

**Frozen blocks are read-only.** Scroll back to a five-minute-old table and its
actions are refused — its data is stale, and acting on stale data is exactly the
mistake worth preventing.

**Blocks name palette slots, never colours.** That indirection is what makes theme
switching a swap and colour degradation mechanical, rather than something each
renderer reimplements badly.

**Measured height equals rendered height.** Every block reports its height as a pure
function of width, so the viewport can virtualise a hundred thousand blocks without
rendering them. It is the most load-bearing invariant in the system and the easiest to
violate silently.
