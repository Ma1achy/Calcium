# Scratchpad 4 — the docker reference app

| | |
|---|---|
| **Status** | Working document. Nothing committed. |
| **Purpose** | Decide what the reference app is and is not, before specifying it |
| **Decided already** | Q6 — wraps real docker via `SubprocessTransport`. No emulator |

---

## 1. What it is for

Three jobs, and they pull in different directions, which is the thing to get right before writing any of it.

**1. It proves the framework is reusable.** A02's whole reuse claim rests on a second consumer existing. Until one does, "20 of 21 components are generic" is an assertion about code nobody has tried to reuse.

**2. It is the worked example.** The README gets a stranger to a running shell; this is what they read to do it properly — a real manifest, real adapters, real degradation, real narrow-width behaviour.

**3. It is the regression harness for the public API.** C24 I1 says every export must be consumed by this or by `prism-tui`. If an export exists that neither uses, it comes out.

**Where they conflict:** job 1 wants it *minimal*, so that "the framework is easy" is demonstrated rather than hidden behind an app's own complexity. Job 2 wants it *complete*, covering the cases a consumer will hit. Job 3 wants it *broad*, touching as much surface as possible.

That tension is the design problem. My instinct is that **job 1 wins** — a reference app that is itself a large program proves the wrong thing. If it takes 800 lines, the framework is not easy and the app is hiding it.

**Target: under 300 lines of app code, excluding the manifest.**

---

## 2. Why docker is the right choice

| | |
|---|---|
| Real output | `docker ps --format json` emits one JSON object per line. Real NDJSON, free |
| Already installed | No auth, no cluster, no setup. A stranger can run it |
| Genuinely live | Containers start, stop, change state. Live views are exercised for real |
| Familiar | Everyone knows what `docker ps` should look like, so a bad rendering is obvious |
| Not Prism-shaped | Containers are not runs. Different nouns, so Prism-isms in the framework surface immediately |

**The last row is the point.** If the framework has quietly absorbed a Prism concept, docker is where it hurts — and it hurts visibly rather than silently.

---

## 3. What it covers

Deliberately not everything. Each verb earns its place by exercising something distinct.

| Verb | Exercises | Why this one |
|---|---|---|
| `/ps` | Table, column priority, live block, row actions, drill-in | The S03 shape, the most common thing a consumer builds |
| `/images` | A second table with different columns | Proves the first was not a special case |
| `/logs <id>` | Pushed view, streaming, follow-tail | The only way to exercise C12/S12's shape |
| `/stats` | `b.live`, per-part failure, refresh | The isolation primitive, which is otherwise untested by a consumer |
| `/inspect <id>` | `keyValue`, `code` block, drill-in target | Detail-view shape |

**Five verbs.** Not `docker run`, not `docker build`, not anything mutating — a reference app that can delete someone's containers is a reference app nobody runs twice.

### What it deliberately omits

- **No mutating verbs.** Read-only, so it is safe to run anywhere.
- **No emulator.** Q6 — real docker, which also proves `SubprocessTransport` independently of Prism.
- **No custom block kinds.** If the sixteen defaults are not enough for a second app, that is a finding worth having rather than papering over.
- **No custom theme.** Uses `defaultTheme`, which tests that the default is actually usable rather than a placeholder.
- **No custom command policy.** Default `/` prefix.

Those four omissions are each a **test of a framework default**. If the reference app needs to override something, the default is wrong.

---

## 4. The interesting part: docker's JSON is awkward

This matters more than it sounds. Docker's `--format json` is not clean:

```
{"ID":"a3f9b21","Names":"web","Status":"Up 3 hours","State":"running","Ports":"0.0.0.0:8080->80/tcp"}
```

- **Keys are capitalised** — `ID`, `Names`, not `id`, `names`
- **`Names` is plural but usually singular**, comma-joined when not
- **`Status` is prose**, not a value — `Up 3 hours`, `Exited (0) 2 days ago`
- **`State` is the machine-readable one**, and it is a different field
- **`Ports` is a formatted string**, not structured
- **No nesting at all** — everything is a flat string, including numbers

**This is exactly what adapters are for**, and it is far better as a reference case than a clean API would be. An adapter over tidy JSON teaches nothing; an adapter that has to parse `Up 3 hours` into an age and pick `State` over `Status` for the glyph is the real job.

It also proves C07's claim that adapters absorb an awkward far side rather than requiring it to change — because docker will never change for us.

---

## 5. Rough shape

```ts
import { createTui, b, defaultTheme, type Adapter } from "tui-kit";
import manifest from "./docker.manifest.json";

const adaptPs: Adapter = {
  schema: "tui.view/1",
  adapt: (raw, ctx) => {
    const rows = (raw.stdout as Container[]) ?? [];
    return doc(ctx, [
      b.rule(`containers · ${rows.length}`),
      b.table({
        columns: [
          b.col("id",     { priority: 90, min: 12 }),
          b.col("name",   { priority: 95, min: 16, flex: true }),
          b.col("image",  { priority: 60, min: 20 }),
          b.col("state",  { priority: 85, min: 10 }),
          b.col("status", { priority: 70, min: 18 }),
          b.col("ports",  { priority: 40, min: 20 }),
        ],
        rows: rows.map(c => b.row(c.ID, {
          id:     b.id(c.ID.slice(0, 12)),
          name:   c.Names.split(",")[0],
          image:  c.Image,
          state:  stateCell(c.State),
          status: c.Status,
          ports:  b.dim(c.Ports || "—"),
        }, {
          actions: [
            b.fill("≡ logs", `/logs ${c.ID.slice(0, 12)}`),
            b.fill("⚡ inspect", `/inspect ${c.ID.slice(0, 12)}`),
          ],
        })),
        emptyMessage: "no containers running · try /ps --all",
      }),
    ]);
  },
};

createTui({ name: "docker", binary: "docker", manifest, theme: defaultTheme,
            adapters: { ps: adaptPs, images: adaptImages, logs: adaptLogs,
                        stats: adaptStats, inspect: adaptInspect } });
```

Roughly 40 lines for the most complex verb. If it is materially more than that in reality, the builders are wrong and that is the finding.

---

## 6. What it should prove, as assertions

The reference app is not just an example — it is a test. Concretely:

| Claim | How the app proves it |
|---|---|
| The framework is reusable | It exists, in a different domain, under 300 lines |
| The defaults are usable | It overrides no theme, no policy, no block kinds |
| Adapters absorb an awkward far side | Docker's capitalised, prose-valued, flat JSON |
| `b.live` gives isolation for free | `/stats` with one part failing, siblings unaffected |
| The subprocess path works | It is the only transport it uses |
| Degradation is real | Golden frames at 60/80/120/160 × 2 themes × 2 unicode modes |
| The public surface is sufficient | It imports only from `tui-kit`, never a deep path |
| Every export is used | Together with `prism-tui`, it accounts for every export (C24 I1) |

**The last one needs care.** Docker will not touch `spectrum` (no art), `WorldDriver` (no emulator) or several manifest fields. So "every export is used" is a claim about the *union* of the two apps, not about either alone — and C24 I1 should say so.

---

## 7. Resolved

| | Decision |
|---|---|
| **Q1** | **Its own repo.** `tui-kit` is consumed as a published dependency, not a workspace sibling |
| **Q2** | Its own CI |
| **Q3** | Ships a recorded fixture corpus, so CI runs without docker and C08's recording tooling gets a second consumer |
| **Q4** | `/stats` **polls via `b.live`**. `/logs` already covers streaming; nothing else would cover the isolation primitive |
| **Q5** | The README's example is **independent**. No generation, no excerpt-sync. The app is proof of concept, not documentation infrastructure |

### What Q1 trades, stated plainly

Separate repo makes job 1 stronger and job 3 weaker, and the trade is worth taking.

**Stronger:** the app installs `tui-kit` the way a teammate would — from a registry, with a version, resolving its own dependency tree. An in-repo example builds against the working tree through a path alias and proves nothing about the package being a package. Half the ways a package can be broken — missing files in `files`, wrong `exports` map, a type declaration that does not resolve, a peer dependency that is really a hard one — are invisible from inside the workspace and immediately visible from outside it.

**Weaker:** changing an export no longer breaks the reference app's build in the same commit. You find out on version bump.

**But that is arguably the better signal.** In-repo, a broken export is a compile error and you fix it silently. Cross-repo, bumping `tui-kit` and finding the app needs changes *is the definition of a breaking change* — it tells you the severity, not just that something moved. The reference app becomes a semver check rather than a type check.

### Two consequences to record

**C24 I1 must weaken.** "Every export is consumed by the reference app or `prism-tui`" cannot be a build gate when one consumer is in another repo — `tui-kit`'s CI cannot scan it. It becomes: the unused-export scan runs against `prism-tui` and a **declared import manifest** the reference app publishes, refreshed on each bump. Honest, and still catches accretion.

It also needs restating for a second reason: docker touches no `spectrum` (no art), no `WorldDriver` (no emulator) and only part of the manifest schema. The claim is about the **union** of the two apps, never either alone.

**C24 T5.1 needs its own home.** The README's twenty-line example is no longer an excerpt of anything, so nothing keeps it compiling. It needs a test in `tui-kit` itself — the example lives in a fixture file, is compiled by CI, and the README includes it by reference. Otherwise the first documented example rots and that is the one a stranger types.

---

## 8. What is left undecided

Nothing blocking. The spec can be written.

Two things deliberately deferred to implementation: which registry `tui-kit` publishes to, and whether the reference app pins an exact version or a range. The second matters — a range means it breaks on someone else's release, which is a useful alarm and an annoying one.
