# Scratchpad 3 — the `tui-kit` public API

| | |
|---|---|
| **Status** | Working document. Nothing committed. |
| **Purpose** | Decide what a consumer imports, before C24 specifies it and before the reference app is built against it |
| **Test** | Phase 1 is done when someone who is not its author builds a TUI from the README without asking a question |

---

## 1. What a consumer actually does

Five things, in the order they hit them. Everything the API needs falls out of this list.

```
1  createTui({ name, binary, manifest, theme })      → a working shell, fallback rendering
2  write a manifest                                   → completion, validation, help
3  write an adapter                                    → one verb renders properly
4  test the adapter                                    → a fixture in, assertions out
5  theme it                                            → tokens
```

Steps 1 and 2 are configuration. **Step 3 is the one they do a hundred times**, and it is where the API is either pleasant or grim. Steps 4 and 5 are done once each.

An adapter is a function from JSON to blocks. That is the whole extension model, so the API's quality is mostly the quality of *constructing blocks*.

---

## 2. The block-construction problem

Every block needs an `id` — C04 requires it because `ViewPatch` addresses blocks by it. So the honest hand-written form is:

```ts
{ kind: "table", id: "ps-table", columns: [...], rows: rows.map(r => ({
    id: r.uuid, cells: { uuid: { text: r.uuid.slice(0,7), tone: "identifier" }, … }
})) }
```

Four problems, and they compound:

- **Ids are invented by hand.** Two blocks sharing one breaks patching in a way that only shows up under `--watch`.
- **`{ text, tone }` for every cell** is noise around the one thing that matters.
- **Nothing guides the shape.** `columns` needs priority and minWidth; nothing prompts for them and forgetting them is silent.
- **Every adapter reimplements the same mapping.** Rows to cells is the same five lines everywhere.

### What builders should look like

```ts
import { b } from "tui-kit";

b.rule("ps · 4 of 11 · --mine")
b.notice.ok("submitted")
b.kv({ family: "digit-classifier", status: "running" })
b.table({
  columns: [
    b.col("uuid",   { priority: 90, min: 7 }),
    b.col("family", { priority: 85, min: 12, flex: true }),
  ],
  rows: runs.map(r => b.row(r.uuid, {
    uuid:   b.id(r.uuid),
    family: r.family,
  })),
})
```

Ids generated unless given. A bare string is a cell with default tone. `b.id`, `b.ok`, `b.warn`, `b.dim` are cell shorthands. The mapping is still explicit — nothing is inferred from field names, because that is the kind of magic that works for four verbs and then fails silently on the fifth.

**Open question:** do builders return frozen blocks directly, or a lightweight description that `createTui` freezes? Direct is simpler; deferred allows validation at document assembly with better error messages. Leaning direct — the validator already runs on the whole document.

---

## 3. What is exported, and what is not

The test for the public surface: **could a consumer do their job without it?** If yes, it stays internal — every export is a compatibility obligation.

### Certainly public

| | Why |
|---|---|
| `createTui`, `TuiConfig` | The entry point |
| `b` (builders) | Step 3, a hundred times |
| Block types, `Tone`, `Action`, `ErrorLike` | Adapter return types |
| `Adapter`, `AdapterContext`, `RawResult`, `RawPatch` | Adapter signature |
| `Manifest`, `ToolDef`, `FlagDef`, `ArgDef` | Written by hand |
| `ThemeTokens`, `PaletteSpec`, `defaultTheme` | Theming |
| `CompletionSource`, `CompletionContext`, `Candidate` | Hook 4 |
| `CommandPolicy`, `Classification` | Hook 3 |
| `ChromeFn`, `SessionSnapshot` | Hook 5 |
| `BlockDefinition`, `Measure` | Custom block kinds (F1) |
| `WorldDriver`, `Fixture` | Emulator and corpus |

### Certainly internal

C01, C03, C13, C14, C15, C16, C17, C18, C19, C20, C21 — every one of them. A consumer never touches the terminal, the transcript, the viewport, the editor or the process runner. That eleven of twenty-three components are invisible is the point.

### Genuinely uncertain

- **`cells()`** — a consumer writing a custom block kind needs it to measure. Public.
- **`applyPatch`, `validateDocument`** — needed to *test* adapters. Belongs in `tui-kit/testing`, not the main entry.
- **`planColumns`** — internal, unless someone writes a custom table-like kind. Leaning internal until asked.
- **`TranscriptStore`** — a consumer might want to append programmatically. But that is a command's job, not an app's. Internal.

---

## 4. Entry points

Three, and the split matters for what ships to production.

```
tui-kit            runtime — createTui, builders, types, defaultTheme
tui-kit/testing    adapter harness, block assertions, golden frames, fake clock/fs
tui-kit/fixtures   the recording tooling and the Fixture model
```

`testing` and `fixtures` are dev-only. The alternative — one entry with everything — drags a golden-frame differ into a production install for nothing.

### What `tui-kit/testing` has to provide

This is the part most likely to be underestimated. The specs' assertions are worth nothing if every consumer reimplements them.

```ts
expectDocument(doc)
  .isValid()                    // C04 validateDocument
  .measuresCorrectly()          // C09 T2.1 at seven widths
  .rendersAt([60, 80, 120])     // no overflow, no negative widths
  .degradesTo1Bit()             // B04 B4.3 — every distinction by glyph or word
  .degradesToAscii()            // C09 T2.2 — same heights
  .hasNoColourOnlyDistinction() // D29

adaptFixture("ps/list-mine")    // load a recorded fixture, run the adapter
fakeClock(), fakeFs(), fakeTerminal()
```

`degradesTo1Bit` is the one that earns its place — it is B04's compliance sweep, and no consumer would write it themselves.

---

## 5. Naming

Small, but it is the first thing anyone sees.

- **`b` for builders.** Short because it appears on every line of every adapter. `blocks.table(...)` reads better once and worse a thousand times.
- **`createTui`** over `createApp` or `defineConfig` — says what it makes.
- **Kit name still open.** `tui-kit` is the placeholder from the spec map; it is what a teammate types into `package.json`, so it should be neutral and not Prism-shaped.

---

## 6. The live part — making the pattern a primitive

A02 §7 specifies failure isolation precisely. Building one currently means assembling five things by hand: a refresh interval, backoff, a staleness marker, an error rendering, and teardown on freeze or pop. Nobody does that five times correctly, so the isolation would end up specified and not shipped.

**So it should be one builder.**

```ts
b.live({
  id:    "activity",
  every: 30_000,
  fetch: () => api.activity(),
  render: (data) => b.kv({
    submissions: data.submissions,
    promotions:  data.promotions,
  }),
})
```

That is the whole consumer-facing surface. Everything in A02 §7 comes free:

| Given free | From |
|---|---|
| Independent failure — siblings unaffected | A02 §7 rule 1 |
| Error rendered in place, at the part's own size | rule 1 |
| Backoff doubling from `every`, capped at 5 min | one backoff rule |
| Staleness marker past 2× `every` | C23 §3b |
| Stagger offset so no two parts tick together | C23 I20 |
| Teardown on freeze, settle or pop | C23 §3b |
| Muted placeholder while first loading | S02's pattern |

Overridable where a consumer wants more: `renderError`, `renderLoading`, `staleAfter`. Defaults cover every case in the spec set.

**Omitting `every` makes it one-shot** — fetches once, never retries, per rule 3. That is S02's Recent section. Supplying `stream` instead of `fetch` makes it a streaming part with stall detection, which is S11.

### What this unifies

Three things currently specified separately turn out to be the same primitive:

| Currently | Becomes |
|---|---|
| S13's five panels, each with its own cadence | five `b.live` parts |
| S02's banner sections, refreshed on C22's identity cadence | four `b.live` parts, one-shot or periodic |
| S11's stall detection on a streaming block | a `b.live` part with `stream` |

**And it exposes a gap.** C23 §3b drives refresh for *pushed views*. S02's sections live in a **transcript entry** and are currently refreshed by C22's identity loop — a second mechanism for the same job. If `b.live` works anywhere a block does, C23 drives all of them and C22's loop is only about identity, not about the banner.

That is a real simplification of something currently split, and it is the kind of thing that only becomes visible when you try to give the pattern one name.

---

## 7. Animation

Different problem, and it must not be solved the same way.

A block is **data at every instant** (C04 I1). A consumer callback returning frames would break that, and with it patching, measurement caching and golden frames.

So animation lives in **block kinds, not consumer callbacks.** A kind's `render` may read `ctx.tick`; its `measure` may not (C09 I14) — appearance animates, geometry never does.

```ts
b.spinner("resolving image")      // animates via ctx.tick
b.progress({ current: 7, total: 10 })
b.steps([...])                     // active step spins
```

A consumer wanting a custom animated kind registers a `BlockDefinition` whose `render` reads `tick` and whose `measure` ignores it. The type should make that hard to get wrong — `measure` simply not receiving `tick` is enough, and it already does not.

**`b.live` and animation are orthogonal.** A live part re-fetches; an animated block re-draws. A spinner inside a live part animates at C03's spinner cadence while its data refreshes at `every`, and neither knows about the other.

---

## 8. The customisation surface

Worth stating what is deliberately *not* a hook, because an unstated non-hook reads as an oversight.

| Customisable | How |
|---|---|
| Rendering of any verb | Adapters |
| New block kinds | `BlockDefinition` + registry (F1) |
| Colours, themes, palettes | `ThemeTokens`; extra palettes with declared semantics |
| Header and footer content | Chrome hook |
| Command prefix and classification | `CommandPolicy` |
| Dynamic completion | `CompletionSource` |
| Per-verb transport | `TransportRouter` |
| Emulated backend | `WorldDriver` |

| **Deliberately not** | Why |
|---|---|
| The frame's four regions | Header, viewport, prompt, footer is the shell's identity. A configurable layout is a layout nobody has designed, and every surface's narrow-width behaviour assumes this one |
| Keybindings | Phase 1B. The keymap is already data (C16), so it is a config-loading job rather than a redesign |
| Scroll, focus and input semantics | Consistency across apps is the point; an app that scrolls differently is a different app |
| Which verbs are local | The manifest declares it; an override would let an app shadow `/help` |
| The failure-isolation pattern | It is `b.live`'s defaults. Making it configurable would make it optional |

**The last row is the important one.** If a consumer can turn off backoff or override the isolation, the guarantee stops being a guarantee. Overriding the *rendering* of a failure is fine; overriding the *behaviour* is not.

---

---

## 9. Resolved

| | Decision |
|---|---|
| **Q1** | **Direct builders.** `b.table()` returns a frozen block. Deferred buys call-site error messages at the cost of a second type family every consumer must learn, and the error messages are recoverable later via a source hint on the validator. Ids matter only for blocks you patch — supply one explicitly if you will address it, otherwise take a generated one. Row ids come from data; ids are never rendered, so golden frames do not see them |
| **Q2** | `planColumns` is **public**. A custom table-like kind needs it, and it is pure |
| **Q3** | `ViewRefresh` is **public**. A consumer building a live view needs it, and `b.live` is its ergonomic front |
| **Q4** | **README is the five steps of §1 plus one complete working example**; the reference app is the worked case. The Phase-1 test is that a stranger gets a *running shell* from the README alone; docker is what they read to do it well |
| **Q5** | **Warn** on an adapter registered for a verb absent from the manifest. Dead code and a probable typo, but not worth refusing a build over |
| **Q6** | **The reference app wraps real docker via `SubprocessTransport`. No emulator.** It proves the subprocess path independently of Prism and proves the framework works with no emulated backend at all |
| **Q7** | **C23 drives live parts in transcript entries as well as views.** Two refresh mechanisms would make S02's sections and S13's panels behave differently for no explicable reason; this puts every timer behind one injected clock |
| **Q8** | **Fixed behaviour, overridable rendering.** `renderError` and `renderLoading` are replaceable; backoff, isolation and teardown are not |

### What Q6 costs, stated plainly

The emulator (`EmulatedTransport`, C08's `WorldDriver`) then has exactly **one** consumer — Prism. A02 §6's discipline says a hook earns its place when a real consumer needs it, and by that rule the emulator is on notice: if Prism's own development ends up preferring recorded fixtures, the emulator is machinery with no user and should go.

Worth watching rather than acting on. Prism genuinely needs animated state to develop live views against, and docker's real output is animated for free — which is exactly why docker is the better reference app.

### What Q7 changes

C23 §3b currently drives refresh for pushed views. Extending it to transcript entries means:

- `b.live` works identically wherever it is placed
- C22's identity loop goes back to being about identity, not about the banner
- S02's four sections become four `b.live` parts driven by the same code as S13's five panels

That is one mechanism replacing two, and it should be recorded against C22, C23 and S02 when C24 is written.

