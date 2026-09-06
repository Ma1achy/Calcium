# A02 — Calcium internal architecture

| Field | Value |
|---|---|
| **Type** | Architecture |
| **Package** | `@fmx/calcium` |
| **Relationship to A01** | A01 is the **outward** contract — decisions, and what the far side must do. A02 is the **inward** one — how the kit is built |
| **Consumed by** | C01–C07, C09–C21; the composition root of any consuming app |
| **Status** | Draft |

---

## 1. Layering

Six layers. **A layer may import strictly downward. Never upward, never cyclically within a layer.** This is the rule that keeps 21 components from becoming a mesh, and it is lint-enforced, not merely stated.

```
L5  app            surfaces · adapters · manifest content · tokens · policies
L4  shell          composition root · session · execution pipeline
L3  interaction    input router · editor · parser · completion · history
L2  viewport       transcript store · viewport · overlay manager
L1  presentation   block library · theme · table engine · plot renderer
L0  foundation     terminal (C01 C02 C03)   ·   data (C04 C05 C06 C07 C21 C27)
```

**L0 has two halves that do not know about each other.** Terminal knows nothing of view models; data knows nothing of terminals. That independence is not incidental — it is what allows C04–C07 to be built in parallel with C01–C03, and it is the first thing a lint rule should protect.

### Where a shared type is declared

**A type belongs to the layer that consumes it structurally, not to the component with the most to say about it.**

This has come up twice in ten components, both times as a draft that put the type with its domain expert and produced an edge in the wrong direction:

- **`ColumnDef` → C04, not C11.** C11 has everything interesting to say about columns — priority, flex, drop order, planning. But `ColumnDef` is a field of `Table`, so C04 cannot declare `Table` without it, and the first draft's placement made L0 depend on L1. C11 keeps `PlannedColumns` and `planColumns`, which are genuinely plan rather than content (C04 §, C11 §).
- **`Fixture` → C06, not C08.** C08 owns provenance, recording, redaction and the authored ratio — all the rules. But `createFixtureTransport` reads `Fixture`, and it is expressed in C06's own `RawResult` and `RawPatch`, so declaring it in C08 would have put a cycle inside L0 data (C06 §2, C08 §1a).

The pattern in both: the component with the domain knowledge keeps the *rules*; the consumer holds the *shape*. C11's rejected alternative is worth remembering because it is the one that hides — a type-only import erases at build and so passes the module-graph check, which makes it worse than an edge `make enforce` catches.

The next likely instance is C13/C14 over transcript entries.


```mermaid
flowchart TD
  subgraph L5["L5 app · prism-tui"]
    direction LR
    A1[surfaces] ~~~ A2[adapters] ~~~ A3[manifest] ~~~ A4[tokens]
  end
  subgraph L4["L4 shell"]
    direction LR
    B1[composition root] ~~~ B2[session] ~~~ B3[execution pipeline]
  end
  subgraph L3["L3 interaction"]
    direction LR
    C16[C16 router] ~~~ C17[C17 editor] ~~~ C18[C18 parser] ~~~ C19[C19 completion] ~~~ C20[C20 history]
  end
  subgraph L2["L2 viewport"]
    direction LR
    C13[C13 transcript] ~~~ C14[C14 viewport] ~~~ C15[C15 overlays]
  end
  subgraph L1["L1 presentation"]
    direction LR
    C09[C09 blocks] ~~~ C10[C10 theme] ~~~ C11[C11 table] ~~~ C12[C12 plot]
  end
  subgraph L0T["L0 terminal"]
    direction LR
    C01[C01 lifecycle] ~~~ C02[C02 capabilities] ~~~ C03[C03 scheduler]
  end
  subgraph L0D["L0 data"]
    direction LR
    C04[C04 view model] ~~~ C05[C05 manifest] ~~~ C06[C06 transport] ~~~ C07[C07 adapters] ~~~ C21[C21 process]
  end
  L5 --> L4 --> L3 --> L2 --> L1
  L1 --> L0T
  L1 --> L0D
```

L0T and L0D have no edge between them. That absence is the point.

| Layer | Components |
|---|---|
| L0 terminal | C01 lifecycle · C02 capabilities · C03 frame scheduler |
| L0 data | C04 view model · C05 manifest · C06 transport · C07 adapters · C21 process runner · C27 terminal emulator |
| L1 | C09 blocks · C10 theme · C11 table · C12 plot |
| L2 | C13 transcript · C14 viewport · C15 overlays |
| L3 | C16 input router · C17 editor · C18 parser · C19 completion · C20 history |
| L4 | composition root · session · execution pipeline |

C11 and C12 sit beside C09 rather than under it: the table engine and plot renderer *are* block renderers, registered like any other.

### Whose claim is this

Every component spec carries a commitment list and an invariant list, and they must pair: **an invariant is what a test cites, so a commitment with no invariant is a promise nothing enforces.** Two rules decide the cases where they legitimately do not pair, and both answer the same question — whose claim is this.

**Structural invariants carry no commitment.** An invariant asserting the module graph rather than behaviour — "C13 imports nothing from `terminal/` or `presentation/`" — is enforced by A03 and consumed by no caller, so a commitment would restate a build rule as a promise to a reader who cannot act on it. Ten specs carry such an invariant and none commits to it; that is one decision, not ten omissions.

**A spec commits only to what it can enforce. A rule owned elsewhere is a cross-reference, not a commitment.** The test is whether the spec can *fail* when the rule is violated. C04 committed to capability substitution being width-preserving, which happens in C09's renderers: C04 cannot fail if it is broken, so C04's version was an overclaim, and C09 I5 is where the rule lives. C02 committed to D29 — no information carried by colour alone, anywhere — which C02 has no view of at all.

The failure mode is specific and worth naming: **a claim restated downstream is a claim made where it cannot be tested, and the duplication is what hides that neither copy is backed.** Three rules were each stated in two specs and asserted in neither.

**Both rules are mechanical, not advisory.** Every commitment carries one of three markers, and A03 SP1 fails the build without one:

```
3. …text… (I5)            backed by one invariant — the common case
7. …text… (I3, I4)        the readable form of several
6. …text… (→ C09 I5)      someone else's rule, cross-referenced
```

A commitment that fits none of the three is a § detail rather than a commitment, and belongs in the section that explains it. That is the demotion the audit applied to four of them: an exact column cap, a shell fallback, a layout breakpoint and a menu policy were §-level facts wearing contract clothes.

The markers are what make the check exact. A word-overlap heuristic cannot do this — a commitment is the readable form, so it deliberately shares few words with the invariant it summarises — and it is why the audit was worth doing by hand first. **The categories are what told us which markers the template needed.**

---

## 2. Interfaces

**The component specs are authoritative for every signature.** This section declares only the **seams** — the contracts that cross a layer boundary or encode an architectural decision. Restating twenty-one interfaces here would guarantee they drift, which is exactly what happened to the first draft of this section.

| Surface | Authoritative in |
|---|---|
| Terminal lifecycle, capabilities, frame scheduling | C01, C02, C03 |
| View model, manifest, transport, adapters, fixtures | C04, C05, C06, C07, C08 |
| Block registry, theme, table, plot | C09, C10, C11, C12 |
| Transcript, viewport, overlays | C13, C14, C15 |
| Input, editor, parser, completion, history | C16, C17, C18, C19, C20 |
| Process runner | C21 |
| Terminal emulator | C27 |

### Seam 1 — measurement injection

```typescript
type MeasureFn = (block: Block, width: number) => number;
type Measure<B extends Block = Block> =
  (block: B, width: number, measureChild: MeasureFn) => number;
```

Container kinds measure children whose kind they do not know. The registry passes **itself** as `measureChild`, so no kind imports the registry and measurement stays pure. C04 defines the contract; C09 owns the registry that satisfies it.

### Seam 2 — transport is an interface with two implementations

```typescript
interface VerbTransport {
  invoke(inv: Invocation): Promise<RawResult>;
  stream(inv: Invocation): AsyncIterable<RawPatch>;
}
```

All three implementations are fully substitutable in every test that does not concern spawning (C06 I15), and selection is **per verb** (D13) — which is what allows a verb to migrate from Python to native TypeScript without touching anything else.

### Seam 3 — focus priority

```typescript
type FocusTarget =
  | "overlay" | "copyMode" | "pushedView" | "prompt" | "liveBlock" | "global";
```

Array order **is** the priority. Focus is derived on every dispatch from what is on screen, plus exactly one stored bit (`prompt` vs `liveBlock`) owned by C16 and reset on every transcript append. C16 §3 owns the resolution rules.

**C26 replaces this union with a scope stack plus a mode, and the seam survives because the mode is a target.** A navigation model that consulted a mode *before* resolving a target would put a second priority list beside `FOCUS_ORDER`, and C16 §5's ladder — whose rungs are handlers registered on these targets precisely so it holds no order of its own — would acquire one again. That is the defect C16's own spec pass found, so C26 I2 forbids the shape rather than the symptom. `docs/components/C26_navigation.md` §2.

**And C26 adds one L1→L3 edge**, which is downward and therefore ordinary: `BlockDefinition.elements` declares what a block offers to keyboard and pointer, and C26 reads it. The precedent is already in the tree — C11's `focusableRowIds` is that edge at one scope level for one kind, and C11 I14's *focus is rendered by C11 and owned by C16* is why it points this way rather than the other. C16 → C26 is sideways inside L3, permitted by §1's acyclicity and enforced by MG1/MG22.

### Seam 4 — L4 orchestrates cross-layer effects

No component reaches sideways or upward to cause an effect in another. Where an effect must cross, **L4 sequences it**:

| Effect | Sequence | Owner |
|---|---|---|
| Child process needing a TTY | `lifecycle.suspend()` → `runner.handoff()` → `lifecycle.resume()` → `scheduler.invalidate()` | C23 |
| Theme switch | `theme.setVariant()` → `scheduler.invalidate()` | C23 |
| Scroll | `viewport.pageUp()` etc → `scheduler.commit("input")` — C14 moves, C22 commits (C14 I12) | C22 |
| Resize | C01's `onResize` snapshot → `viewport.resize()` → `scheduler.commit("resize")`; C14 captures its anchor before dropping the cache (C14 I8) | C22 |
| History recall | `history.previous()` → `editor.setText()` → **not** `history.resetNavigation()` (C20 I3) | C23 |
| Command submit | `parser.parse()` → `editor.clear()` → `transport` → `adapters` → `transcript.append()` → `router.resetFocus()` → `scheduler.commit()`, **then at settlement** `history.append(line, exitCode)` | C23 |
| Completion menu | `engine.menuLayer()` → `overlays.push()`, then `overlays.update(id, …)` per keystroke — never pop-and-repush (C19, C15 §2) | C23 |
| History search | `history.searchLayer()` → `overlays.push()` → `update` per keystroke → `searchEnd(action)` → `editor.setText()` | C23 |
| Patch fullscreen | the block's action → `overlays.push()` a view (C25 §3b) | C23 |
| Resume from `SIGCONT` | C01's `onResume` → `scheduler.invalidate()` — the same call an orchestrated `resume()` makes, because C01 sets no contamination flag (C01 §Signals) | C22 |
| Terminal too small | size gate → C22's layout-engine-free fallback → `onResize` → resume the normal frame, state intact (C22 §4) | C22 |
| Shutdown | `session.stopping = true` → `lifecycle.release()` (which runs `beforeRelease`) → diagnostics → exit (C22 §8) | C22 |
| Pop a pushed view | `overlays.pop()` → `commit`. **No append** — a trace would freeze the block the pop returns to and clear the selection A01 D7 preserves (C13 §4 step 2) | C23 |
| Stall detected | inject a notice patch → `commit("stream")` (C23 §3b, I25) | C23 |
| View refresh tick | `fetch()` → `render` → `replace` the part's panel on its host → `commit("stream")` (C23 §3b) | C23 |
| Refresh teardown | entry settles, view pops, entry evicted, transcript cleared, or `stopping` set → `release(host)` (C23 §3b, I33) | C23 |
| Identity notice | C22's identity loop signals → compose → `transcript.append` with `origin: "refresh"` → `commit` (C22 §7, C23 §3b) | C23 |
| `cd` / `export` | apply to `session` → `commit` | C23 |

This is the rule that keeps L0's two halves unaware of each other and keeps L1 and L2 unaware of the terminal. It has caught four attempted violations during specification — contamination, invalidation, scroll commits and handoff — and it is the first thing to check when a component wants a dependency that feels awkward.

**The owner column, and six rows that were missing.** The table listed five sequences when it was written, and every seam added since C15 landed went into the component spec that needed it and not into this table: `resetFocus()` on append (C16 I2), C19's menu push and `update`, C20's search layer and its three-way `searchEnd`, C20's suppressed `resetNavigation`, C25's fullscreen view, and C22's own three. Each is a real cross-layer effect and each was already specified somewhere; what was missing is the one place that says *all* of them are L4's, which is the only form in which the rule is checkable.

The owner column exists because "L4" now means two components. A row owned by C23 is not C22's to implement, and without the column the difference is a judgement each reader makes again.

**The submit row's order is `append → resetFocus → commit`, and it was wrong here until C23.** It read `append → commit → resetFocus`. C23 §4 and its T4.7b have the correct order and the reason: a reset issued *after* the commit paints one frame with focus in a block that has just been frozen, and a reset issued before the append is undone by nothing. The ordering is the whole content of that row, so the table was carrying a row that would have produced the defect it exists to prevent.

### Seam 4 has no owner, and that is the finding

This table has been wrong or incomplete at **every component that touched it**, in a different way each time:

| Found at | What was wrong |
|---|---|
| C15 → C20 | Six rows missing entirely — every seam added since C15 went into the component spec that needed it and not into this table |
| C16 | `resetFocus()` recorded as a subscription; it is a call |
| C22 | No owner column, so "L4 owns it" named two components |
| C23 | The submit row's order stale; `Scroll` listed with two owners; three C23-owned rows absent while C23 I13 claims the table holds all of them |

Six independent errors of six different kinds is not a run of bad luck. It is the signature of a **duplicated source of truth with no reconciliation**: every row exists twice, once here and once in the owning component's own orchestration section, and nothing compares the copies. The project already names this class in four places — C05 T1.7c's list derived from the thing it checks, C22's `STEPS` against a test carrying its own copy of the order, SS30's second implementation of a shared primitive, SS35's second `Result`. Seam 4 is the same shape and is the **only artefact several components write to and none owns**. Everything else shared has a mechanism: A03's rules have implementations, `COMPONENT_SOURCES` has TD3, invariants have SP1 and SP2.

So it is one structural problem, not six errors, and the fix is a mechanism rather than a seventh correction. **The shape is an equality check, both directions** — every row here names its sequence in its owner's spec, and every orchestrated sequence in a component's spec appears here. A subset check in either direction misses one of the two failures actually observed: C15–C20's rows were missing *from here*, and C23's three are missing *from there*. That is TD0's and commitment 14b's lesson — an exemption or an inventory compared by containment only ever grows.

The alternative considered was deriving this table from the component specs entirely. It removes the hand-maintained copy, which is better in principle, and it is rejected for now: this table sits inside an argument, and a generated table inside argued prose goes stale in the other direction — the paragraphs around it stop matching and nothing notices. Keeping both copies and comparing them by equality is the arrangement A03 already uses for every other shared thing.

**Writing the check found four more missing rows, in the direction a subset check would not look.** `Pop a pushed view`, `Stall detected`, `View refresh tick` and `cd` / `export` were all declared in C23 §4 and absent here — the second direction firing before the rule existed, which is the argument for equality made by the thing it was arguing about.

**And it found the asymmetry underneath.** C23 has a §4 that lists what it orchestrates; C22 had nothing equivalent, so five of this table's rows had no counterpart to compare against at all. Half a table cannot be checked against half a convention. C22 §3c now lists its five, keyed by the same Effect names, and that keying is itself a requirement: "Submit" here and "Command submit" there is drift no cheap check can see through.

The rule lands with its implementation, per A03 commitment 14b.

### Seam 5 — the five extension hooks

Manifest content, adapters, theme tokens, prefix policy, dynamic completion sources. Full shapes in §6.

### Seam 6 — profiling decorates the seams above; it does not instrument the units

C28 measures what a frame costs by **wrapping the functions the composition root already hands down** — the write, `composeFrame`, Seam 1's `measureChild`, the input decoder, Seam 2's `VerbTransport`, `LiveSpec.fetch` and `Ambient.schedule`. It is the same move Seam 1 makes for its own reason: the registry passes *itself*, so no kind imports the registry; here the root passes a wrapped function, so **no component imports the profiler**.

That is why C28 is L4 (`src/shell/profiling/`) rather than a directory of its own. A profiler reaching into L1's paint or L2's cache would need a clock there, and SS1 bans that across `src/` while SS4 bans it in `src/viewport/` with no exception at all. Under `src/shell/` MG1 already forbids every lower layer from importing it, so *nothing below L4 changes* is an enforced rule rather than an intention.

**Its stated blind spot is why the deep tier exists.** Decoration measures a unit from outside: it can say the plot block cost 8 ms and not which of `figure.ts`'s 3 747 lines did. What decoration cannot reach at all is a small, named set of **integers** — C03's coalescing count, and the hit and miss counts of the two caches that publish a `size` and no hit (F863). Those are counters on interfaces that already exist, carrying no clock and importing nothing.

Full shape in C28 §2 and §4; this seam records only that the mechanism is decoration and that the direction of the dependency is downward from L4.

## 3. Composition root

```typescript
type TuiConfig = {
  name:    string;
  binary:  string;
  manifest: Manifest | string;                        // object or path

  adapters?:          Record<string, Adapter>;        // hook 1
  theme:              ThemeSet;                       // hook 2
  commandPolicy?:     CommandPolicy;                  // hook 3
  completionSources?: CompletionSource[];             // hook 4
  chrome?:            { header: ChromeFn; footer: ChromeFn };  // hook 5

  blocks?:    Record<string, BlockDefinition>;        // extra block types, F1
  transport?: TransportRouter;                        // override; default subprocess
};

function createTui(config: TuiConfig): TuiInstance;
```

Every optional field has a working default. `createTui({ name, binary, manifest, theme })` produces a usable shell: fallback adapter, default `/` policy, manifest-derived completion, default chrome.

### Startup sequence

Order is load-bearing; three steps are not reorderable.

```
1  parse argv, TTY check                    → non-TTY: help, exit 0
2  load app config
3  detect capabilities                      C02
4  build registries (blocks, adapters, completion)
5  load manifest                            C05
6  register cleanup handlers                ← must precede 7
7  acquire terminal                         C01
8  first paint                              ← must follow 6
9  accept input
```

6 before 7 closes the window where terminal state is held with nothing to release it. 6 before 8 means a crash during first paint still restores. 3 before 4 because block definitions may vary by capability.

### Shutdown

One function, five callers — `/exit`, Ctrl-D confirm, double Ctrl-C, signal, fault. Set `stopping` → release the terminal → print diagnostics if any → exit with the caller's code. Release precedes printing so faults land in the real scrollback.

**Killing children and flushing history are inside `beforeRelease`, not steps of their own.** This line used to read "flush history → release terminal", which is the shape C22's earlier draft had and the reason it double-flushed: C01 runs `beforeRelease` once before the first release, so a flush written as a separate step runs beside it rather than instead of it, and a duplicated history entry is the result. C22 §8 is authoritative and this is the summary of it.

---

## 4. State ownership

Every piece of mutable state has exactly one owner. Nothing else writes it.

| State | Owner | Mutated by | Read by |
|---|---|---|---|
| Terminal acquired-state | C01 | C01 only | C03 |
| Capability record | C02 | nobody — immutable after probe | C09 C10 C11 C12 C17 |
| Pending-frame flag, contamination | C03 | C03; `invalidate()` called by the L4 shell after `lifecycle.resume()` | C03 |
| Transcript entries, live id | C13 | execution pipeline (L4) | C14 C15 |
| Scroll state | C14 | C14 via reducer | render |
| Wrap cache | C14 | C14; invalidated on width change | C14 |
| Overlay stack | C15 | C15 | C16 |
| Focus stack | C16 | `push`/dispose | C16 |
| Editor buffer, cursor | C17 | C17 | C18 C19 |
| Completion cache | C19 | C19, TTL-expired | C19 |
| History entries | C20 | C20 | C17 |
| `lastUuid` for `$_` | L4 session | execution pipeline | C18 |

**There is no global store.** State is owned by the component whose invariants depend on it, and passed down through React context at the composition root. A store would let anything write anything, which is what makes ownership tables like this one fiction.

---

## 5. Render pipeline

```
ViewDocument ─► TranscriptStore ─► Viewport ─► BlockRegistry ─► React ─► Ink ─► Yoga ─► terminal
                                (selects visible)   (render)              (layout)
```


```mermaid
flowchart TD
  K[keystroke] --> R["C16 router<br/>focus stack decides"]
  R --> P["C18 parser<br/>app · local · system"]
  P -->|app verb| T["C06 transport<br/>spawn argv array"]
  T <-->|argv out, JSON back| FS[far side]
  T --> AD["C07 adapters<br/>JSON to blocks"]
  AD --> VD["ViewDocument<br/>every path converges"]
  P -->|local · system| VD
  VD --> TR["C13 · C14<br/>transcript, visible range"]
  TR --> RN["C09 · C03<br/>render, coalesce, commit"]
  RN --> TERM[terminal]
```

**What is React:** block renderers, frame chrome, overlays, pushed views. Anything that re-renders when state changes.

**What is pure:** measurement, adapters, parsing, classification, capability detection, tone resolution, viewport maths, column planning, transport, history search, completion. No hooks, no context, no terminal.

The split is the testing strategy. Pure functions get fixture tests that run in milliseconds; React gets `ink-testing-library`; only C01–C03 need a PTY. **If a component is hard to test, it is probably React and should not be.**

Two paths bypass the pipeline, both deliberately: C21's `handoff()` suspends everything and gives the child the real terminal; C03's `invalidate()` discards the front buffer and repaints from blank.

---

## 6. Extension hooks

The five things an app supplies. Anything not listed is framework-internal.

| # | Hook | Shape | Default |
|---|---|---|---|
| 1 | Adapters | `Record<verb, Adapter>` | Fallback adapter renders any JSON |
| 2 | Theme | `ThemeSet` — tone → colour per variant | None; required |
| 3 | Command policy | `CommandPolicy.classify` | `/`-prefix, slash-after-0 is a path (D20, D23) |
| 4 | Completion sources | `CompletionSource[]` | Manifest-derived static sources only |
| 5 | Chrome | header and footer render functions | Name, binary, clock |

Plus `blocks` for extra block types (F1) and `transport` for per-verb overrides (D13).

**A hook is added when the reference app or Prism needs it. Never speculatively.**

---

## 7. Requirements

### Performance

| Budget | Target | Measured where, at HEAD |
|---|---|---|
| Keystroke → frame | < 16 ms p95 | **T5.2**, through a PTY |
| Command commit → frame | < 33 ms p95, excluding subprocess time | **nowhere** — no assertion exists |
| Page Down through 10,000 blocks | < 50 ms | **nowhere** — `test/e2e/viewport.test.ts:12` asserts the rows match at every screenful and reads no clock |
| Streaming at 1,000 lines/s | ≤ 30 frames/s, < 25% of one core | **T5.1**, both halves |
| Resize → correct frame | < 33 ms, zero corruption | **T5.4, the corruption half only** — one width per frame, the right height, not empty, not the fallback; never timed |
| Idle CPU | ~0% — no polling render loop | **T5.6** |

Measured in M-T3 and recorded in A01 Appendix B. **This column is the finding rather than the plan** (F862): three budgets hold, one holds in half, two are not asserted at all, and **every one that is measured is taken from outside, through a PTY, because the framework exposes no number of its own.** A01 Appendix B's six Layer A cells are all empty, and three of them — bytes per frame, and the median and p95 of frame construction — cannot be filled from outside at any effort. C28 is what closes those three; the other three are owed to diligence.

### Compatibility

Node ≥ 22 (Ink 7's floor). macOS Terminal, iTerm2, Ghostty, Kitty, WezTerm, Windows Terminal, VTE-based Linux terminals, plus tmux and SSH. Anything without alternate-screen support refuses to open (D28).

### Failure isolation

**No component failure takes down the session**, and more precisely: **failure is contained to the smallest part that can render its own failure.**

That unit is a **part** — anything that fails independently and can say so in place without disturbing its neighbours. A dashboard panel, a banner section, a block, a completion source, a table's data source. The pattern below is the same for all of them, and the specs that apply it cite it rather than re-deriving it.

#### The four rules

**1. A failed part renders in place, at its own size.** One line naming what failed, a countdown if it will retry, and nothing else on screen changes. A part that vanishes reads as a bug; a part that takes the screen with it is the thing this rule exists to prevent.

**2. Fetching retries; computing does not.** A failed fetch is transient — a network, a far side, a slow query. A failed render, measure, adapt or parse is deterministic: same input, same failure, so retrying burns cycles and flickers. This is the distinction that decides whether a part gets a retry loop at all.

**3. Retry applies to periodic parts only.** A part with a natural interval — a dashboard panel, a banner section, a live view's data — backs off and recovers on its own. A **one-shot** fetch does not retry: the user re-runs the command, and silently re-attempting something they asked for once is a surprise. A dead stream is reported and offered a manual reconnect, never reconnected silently, because the lines missed in between would go unmentioned.

**4. Escalation is a decision, never automatic.** A failing part never fails its parent. Where enough parts fail that the whole is meaningless, the **parent** says so explicitly — S13's "all five panels down → one notice rather than five" is a judgement it makes, not a cascade.

#### One backoff everywhere

Double from the part's natural interval, cap at **five minutes**, reset on success, show the countdown. Owned by C23 §3b for periodic parts; nothing else implements its own.

#### The exceptions, and why

| Failure | Containment | Why not the pattern |
|---|---|---|
| Block render throws | Error block in its place | Compute — no retry (rule 2) |
| Measurer throws | Height treated as 1, logged | Compute; a throw here would break scrolling, so it degrades rather than propagating |
| Adapter throws | Fallback adapter plus a muted notice | Compute — deterministic |
| Transport fails | An error `ViewDocument` | One-shot — the user re-runs (rule 3) |
| Completion source throws or times out | Dropped from the candidate set | One-shot per keypress; others still contribute |
| History write fails | In-memory history continues, retried next write | Periodic by accident — the next write is the retry |
| **Terminal acquire fails** | **Abort before first paint** | **The only fatal case in the system.** Nothing can render its failure in place when there is no place |

### Testability

Six tiers per component: unit, contract, edge, integration, e2e, fail-on-revert. Plus golden frames at 80 / 100 / 120 / 160 for anything with a table, and a PTY harness for C01–C03.

**Behaviour is not a seventh tier.** The tiers mix axes already — unit/integration/e2e are scope, edge is input coverage, contract is subject, fail-on-revert is purpose. Behaviour is a *kind* of assertion that cross-cuts scope: the same ordering property is tested at unit, integration and e2e scope depending on how many components it spans. A separate tier would duplicate those or drain unit to nothing for stateful components.

**State-machine completeness rule.** Any component owning a state machine enumerates its full transition table in its spec — every state × every operation, including the invalid combinations. Valid transitions are tested in tier 1 or tier 4 by scope; invalid transitions in tier 3. Components that are pure functions (C04 measurement, C10 resolution, C11 planning) have no state machine and skip it.

The rule earns its place by finding gaps: applied to C01 it surfaced four untested transitions and forced an undecided question — whether a released instance can be re-acquired.

**A fail-on-revert entry whose revert nothing catches is a signpost, not a gap.** The tier's usual form is *change X → test Y fails*, and some guards are structural rather than asserted: the change is possible, it breaks no test, and what prevents it is a shape in the code — an exhaustive union, a handler registration, a type that will not construct. C16 T6.4d is the first written this way, where reimplementing a ladder as an independent list would pass everything and merely be free to drift again.

Those entries **say which category they are in and name the structure that carries them**, because read cold they are indistinguishable from a test nobody finished. The alternative is worse: inventing an assertion that looks like a guard puts a green tick where the protection is not, which is A03 §2's family arriving in the one tier written to prevent it.

**The reference app is the acceptance signal for the framework**, not Prism.

---

## Commitments

1. Six layers; imports strictly downward; lint-enforced.
2. L0's two halves — terminal and data — do not import each other.
3. A02 declares seams; the component specs are authoritative for signatures. The architecture doc never restates a component's full interface.
4. Focus priority is overlay → copy mode → pushed view → prompt → live block → global; first consumer wins.
5. `createTui` requires four fields; every other field has a working default.
6. Startup order 6→7→8 is not reorderable: handlers, then acquire, then paint.
7. One shutdown function, five callers; release precedes printing.
8. Every piece of mutable state has exactly one owner. **There is no global store.**
9. React only where something re-renders; everything else is a pure function.
10. Five extension hooks, each with a default except theme. Hooks are added on demand, never speculatively.
11. Failure is contained to the smallest part that can render its own failure, in place, at its own size.
12. Fetching retries; computing does not. Retry applies to periodic parts only; one-shot failures are reported and re-run by the user.
13. Escalation is a parent's explicit decision, never a cascade.
14. One backoff rule everywhere — double from the interval, cap five minutes, reset on success — owned by C23.
15. A failed terminal acquire is the only fatal case, because it is the only failure with no place to render itself.
16. Performance budgets in §7 are measured in M-T3, not asserted.
17. Six test tiers, not seven. Behaviour cross-cuts scope and is carried by the existing tiers.
17a. A fail-on-revert entry with no failing test names itself as a structural guard and names the structure, rather than reading as an unfinished one.
18. Every stateful component enumerates its transition table; invalid transitions are tier-3 tests.
19. Cross-layer effects are sequenced by L4; no component reaches sideways or upward to cause one. Seam 4's table names **every** such sequence and which of the two L4 components owns it — a seam specified only in the component that needs it is not checkable as a rule.
20. **Every commitment cites an invariant, several, or another spec's.** §1's two rules for whose claim a commitment is are mechanical, not advisory: A03 SP1 fails the build on a commitment with no marker, on a citation naming an invariant its spec does not declare, and on a cross-reference that does not resolve. Self-referential deliberately — this is the document that states the rule, so it is the document that commits to it.
21. **Profiling is decoration at the seams this document already declares, and the dependency runs downward from L4.** No component below `src/shell/` imports C28; what decoration cannot reach is a named set of integers on interfaces that already exist. §7's table says where each budget is measured **including where it is not**, because a target with no column reads as a target that is met.
