# Calcium — coverage audit

**A pass over the specs against the implementation**, looking for the class this project has
found eleven times: *specified, agreed, structurally absent*. Run against `main` at
`645c043`, 25 component specs, 174 source files.

**The method, because it is reusable.** Six of the last ten instances of this class were
found by someone asking a question rather than by a test — which is not a discovery method
that scales. So: four mechanical passes over things that *enumerate*, where absence is
checkable rather than noticed.

```
pass 1   every spec sentence promising what an app may supply → is there a path?
pass 2   every optional parameter → does any non-test caller supply it?
pass 3   every union member, capability and enum → does anything produce it?
pass 4   the enforcement allow-lists → are they stale?
```

---

## Result

**Two findings, one correction to my own earlier claims, and a large clean result that is
worth as much as the findings.**

| | |
|---|---|
| **F-A** ★ | `copyMode` is a focus target whose only producer is `() => false` |
| **F-B** ★ | `imageProtocol` is detected every session and read by nothing |
| **F-C** ★ | ghost text is computed and acceptable by `→`, and **no layer draws it** |
| **correction** | `CommandPolicy` and `capabilities` are **both wired**. I claimed otherwise twice; I was wrong both times |
| **clean** | every `TuiConfig` field · every `Action` kind · every `Tone` · palettes · the allow-lists |

---

## F-A ★ — `copyMode`: routed, ordered, unreachable

```
src/interaction/router/types.ts:25     "copyMode" in FocusTarget
src/interaction/router/focus.ts:63     if (deps.copyMode) return "copyMode"
src/interaction/router/router.ts:192   register("copyMode", …)
src/shell/construct.ts:161             copyMode: () => boolean
src/shell/session.ts:409               copyMode: () => false        ← the only producer
```

A focus target with a place in the ladder, a registered handler, a dependency threaded
through construction — **and one producer that returns `false` unconditionally.** Nothing can
enter it.

**This is the eleventh instance of the class and the most deliberate**: the target was named,
ordered against the others, and given a handler. Everything was built except the thing that
turns it on.

**It matters because the problem it exists for is real.** In the alternate screen with mouse
tracking on, the terminal's own selection is disabled — a reader cannot drag-select and copy
the way they can in every other terminal program. `copyMode` is the answer, and it has never
been reachable.

## F-B ★ — `imageProtocol`: detected, never read

C02 computes `imageProtocol: "iterm2" | "kitty" | "sixel" | "none"` on every session start.
**Zero readers in `src/`.**

Honest in one sense — the image block is designed (`TUI_NOTE_images.md`) and unbuilt, so
there is nothing to consume it yet. **But a capability detected and never read is work done
every session for nobody**, and it is indistinguishable from a capability whose consumer was
lost.

**Disposal: record it as awaiting its consumer**, with the image block named. That converts
it from a silent absence into a stated deferral — which is the whole point of the
distinction.

---

## F-C ★ — ghost text: computed, acceptable, never drawn

Found after the four passes, from a question about rendering — **which is itself the point**:
the passes look at what enumerates, and ghost text is a *function result*, not a union member.

```
engine.ts:149   ghost(ctx) → the completion string
keys.ts:232     the ACCEPT path — editor.insert(ghost) on →
paint.ts        no reference
frame.ts        no reference
```

**`→` inserts a suggestion that was never displayed.** The editor's comment says rendering is
deliberately outside it, and no layer picked it up.

**Sharper than the other two**, because `copyMode` and `imageProtocol` are unreachable and
inert — ghost text is *reachable and half-built*, so a user can trip over it: press `→` at a
prompt and text appears from nowhere.

**A fifth pass this suggests**, and it is mechanical: **every method on a published interface,
checked for a consumer outside its own module.** MG24 does this for interface *members* and
MG25 for exported *functions* — `ghost()` is a method on the completion engine's returned
object, which is neither. That is a real hole between two rules that each thought the other
covered it.

## Correction — I was wrong about `CommandPolicy` and `capabilities`

**Both are on `TuiConfig` and both are threaded.** I told you otherwise, twice.

```
commandPolicy?: CommandPolicy      config.ts:108 → construct.ts:673 → execution.ts:174 → parse
capabilities?: Partial<…>          construct.ts:286  detectCapabilities(config.env, config.capabilities)
```

The `capabilities` one was closed by C22 I49 in step 7 — the audit's own finding about
`detectCapabilities(env, overrides)` having no caller led to the fix, and I carried the
pre-fix state forward. **The `CommandPolicy` claim was simply wrong**: I checked `config.ts`
for the word "policy", found a comment about size policy, and concluded from a miss.

**A correct conclusion from incomplete evidence is still wrong** — the rule this project
recorded when F9 grepped for a field and the seam was a step. Same shape, mine this time.

---

## Pass 1 — spec promises about what an app may supply

Every *"an app may/can/registers/supplies"* sentence across 25 specs, checked for a path.

| the promise | verdict |
|---|---|
| C04/C09 — *"an app registers additional kinds through C09"* | **wired** — `TuiConfig.blocks`, `config.ts:111` |
| C10 — *"an app may register its own [palette]"* | **wired** — `ThemeTokens.palettes`, resolved at `resolve.ts:350`, `PaletteSpec` exported |
| C22 — *"the app's handlers into the pipeline"* | **wired** — `localHandlers`, registered before `seal()`. This was F7 and it is fixed |
| C23 — *"an app registers its own alongside them"* | **wired**, same path |
| C09 §4a — *"highlighted whenever someone registers it"* | ★ **NO SOMEONE** — see below |

### The one that fails is the grammar registration, and it is a regression

C09 §4a builds the `code` block around languages *being added*:

> *"`measure` never tokenises… **a language shipping tomorrow does not reflow yesterday's
> transcript**"* · *"readable today and **highlighted whenever someone registers it**"* ·
> *"the fallback is a fallback, **not a filter**"*

Those sentences are pointless under a fixed set. Then `createLowlight({ json, yaml })`
shipped with **no registration path**, so *"whenever someone registers it"* has no someone.

Already recorded in the roadmap at #16 with the measurement (24 mainstream grammars = 180 KB,
so the weight objection does not survive). **Noted here because the audit found it
independently**, which is the pass working.

---

## Pass 2 — optional parameters with no non-test supplier

The `detectCapabilities(env, overrides)` shape: an argument position, which MG25 cannot see
because it scans exports rather than call sites.

Seven candidates across `src/`. Six are supplied by a real caller. **One is not:**

```
createBlockRegistry(opts?: { defaults?: boolean })
    src callers supplying it:   0
    test callers supplying it:  4
```

**Not a finding.** `{ defaults: false }` is a test-only escape hatch for building an empty
registry, and it is internal — no spec promises it and no consumer needs it. **Recorded as
checked-and-clear** so nobody re-derives it.

**The pass is worth keeping in the toolkit regardless**, because it is the only one that
looks at argument positions, and that is where the capabilities-override gap lived for
twenty-two components.

---

## Pass 3 — unions, enums and capabilities

| set | result |
|---|---|
| `FocusTarget` (6) | ★ `copyMode` — see F-A. The other five have real producers |
| `Action` kinds (5) | **all five dispatched** — `fill` `exec` `open` `expand` `view`, one arm each in `actions.ts` |
| `Tone` (6) | **all six produced** in real code, `accent` the thinnest at 4 sites |
| capabilities (7) | ★ `imageProtocol` — see F-B. `usable` is a local feeding three fields, not a capability |
| `bracketedPaste` | **exists and is set** — which answers the open question from the paste design: chip-on-paste can distinguish a paste from fast typing |

### Two reserved-and-honest, not gaps

- **C04 I12** — `status: "proposed"` is *"reserved for the agent path; unused in v1"*
- **C04** — `origin: "agent"` is *"reserved"*

**Both declared as reserved in the spec.** That is the correct disposal for something
deliberately unbuilt, and it is exactly what the eleven gaps did *not* do. Worth naming as
the model: **a reserved thing that says it is reserved is not a finding.**

---

## Pass 4 — the enforcement allow-lists

`UNCONSUMED_MEMBERS`, `UNCONSUMED_FUNCTIONS`, `ACKNOWLEDGED_BACKLOG`, `UNRESOLVED`.

**All four are in good order.** Each entry carries a per-entry reason rather than a bare
name, and `UNCONSUMED_MEMBERS` fails in *both* directions — it complains if a listed member
stops being unconsumed (`"UNCONSUMED_MEMBERS names X, which is no longer an unconsumed
published member"`), which is the arm that stops a list outliving its reasons.

**That bidirectional check is the thing worth copying** anywhere else a list is maintained by
hand — it is what CP6's `SURFACES` list lacked when it silently stopped seeing new
declarations.

---

## What the clean results are worth

**Every `TuiConfig` field has a reader.** All twenty-six, checked individually. The public
config surface has no dead fields — which given that this project found `pipeline`
undefaulted in production, and `localHandlers` unreachable, is not a foregone conclusion.

**Every `Action` kind dispatches. Every `Tone` is produced. Palettes are registerable.**

**Recorded with the date**, because a checked assumption that held is worth not checking
twice — the same disposal as C14's no-settled-fast-path result and the highlighting memo.

---

## What this audit cannot see

Stated so the clean result is not read as broader than it is. **Three of the eleven known
gaps would have survived every pass above:**

- **The async continuation** — `complete` is fire-and-forget, its continuation lands after
  the batch commits. The call site exists and is correct. **Found by looking for `.then`,
  `schedule` and subscriptions that change displayed state.**
- **The partial context** — `RenderContext` built with two of three fields. Every reference
  exists. **Found by checking every optional field of a context object at its one
  construction site.**
- **The suppressing guard** — the read loop's empty-batch return above `arm()`. The call
  exists; an early return skips it. **Found by reading what each early return asserts is
  absent, and whether the thing it skips had other work to do.**

**Those three are a fifth pass** and it is not mechanical — it is three targeted reads. Worth
doing, and worth doing separately, because each has a different signature.

**And nothing here checks prose against behaviour.** `/help`'s README claim, C09 §4a's
promise, F58's four documents with no measurement — all of that is spec text that no rule
reads. **The single highest-yield instrument in this project remains "go and find where the
claim was written down"**, and it has now caught three things (F66, F58, and the grammar
regression). It cannot be automated; it can be scheduled.
