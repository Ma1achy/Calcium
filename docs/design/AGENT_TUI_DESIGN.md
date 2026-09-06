# `agent-tui` — the design

Calcium's second example. Built after C26's policy work, and **not** a rewrite of the earlier
sketch — three of that sketch's premises have changed and one of its gaps has since been
built.

Its job is docker-tui's job in a different shape: **be a real consumer, find what the
framework's own tests cannot.** And it is the shape terminal UIs actually take now, so
someone evaluating Calcium is likely to be building something like it.

---

## 0 · What changed since the sketch, measured

**STEP 0 IS RUN — 2026-08-15, `docs/design/AGENT_TUI_STEP0.md`.** Reasoning and tool calls
were confirmed to arrive as typed parts, against `qwen3.5:9b` on ollama, from the devcontainer.
Four findings moved this document — the part shape and its id collision in §2, the
reasoning ratio in §6 and §14, the parser risk in §5 — and each is marked where it sits. **The one worth
carrying into every section below: reasoning is 90 stream parts against text's 22, and 44.7
seconds of a turn before anything else arrives.** Every drawing here was made against reasoning
as an aside.

**The question primitive is built.** `ctx.ask()` takes a choice list, resolves a promise, and
entry 16 generalised it — **but not into the shape this sentence used to claim.** Measured 2026-09-03: `AskOptions` (`src/shell/local/registry.ts:32-52`) carries `question`, `detail`, `choices` and `placement` only; `onSelect` occurs nowhere in `src/`; `dismissable` is a `Layer` field (`viewport/overlay/types.ts:51`) that the registry's own comment says is *deliberately absent* from `ask`; and `ask` resolves a choice key, so there is no `resolve(text)` and a free-text answer is still owed. **The sketch's highest-value gap — A3 — is now *use it*
rather than *find it*.**

**Markdown is half built.** Measured 2026-09-03: `markdownBlocks` (`src/data/viewmodel/markdown.ts`), exported from the barrel and reachable as `b.markdown` (`src/shell/builders/index.ts`), with `test/contract/markdown.test.ts` — roadmap #11 is PART, the block half landed and inline emphasis is entry 50. A6 can render prose as blocks today; only inline spans stay literal.

**And `b.live`'s `stream` arm was removed, not filled.** F78 deleted it — *a declared option
with no implementation is the disease; two throws guarding the choice was the symptom.* So the
sketch's *"a streaming reply is `stream`'s first consumer"* is void: **a streaming reply is a
`patch` through the transport**, which is what `/logs` already does.

### The far side, re-checked

**The AI SDK is still the loop**, and it has moved in the direction this needs. `streamText`
with tools and a step budget is the agent loop; `fullStream` is the typed part stream —
`text-delta`, `tool-call`, `tool-result`, `reasoning` — with discriminated event types and no
per-provider decoding.

**MLX is still the local path**, and the fragile part is confirmed rather than assumed:
**a model must be served with the right `--reasoning-parser` and `--tool-call-parser` or
reasoning and tool calls are not parsed correctly.** Those are the two part types this example
is about, so **step 0 verifies them against the chosen model before anything is designed
against them.**

Any non-empty API key works; the endpoint is OpenAI-compatible, so the SDK's
OpenAI-compatible provider points at `localhost` and everything upstream is unchanged.

---

## 1 · The three layers, and which one is ours

```
the loop      Vercel AI SDK      calls the model, dispatches tools, emits typed stream parts
the model     MLX on localhost   OpenAI-compatible, no key, no network
the renderer  CALCIUM            ours — the reason the example exists
```

**We use the SDK's plumbing, not its UI.** `@ai-sdk/tui` exists and renders the same loop; it
is the comparison point and not a dependency. **It proves the category and it sets the bar** —
prompt input, streamed responses, markdown, tool cards, reasoning sections, scrolling, tool
approval. **Parity on those is table stakes.**

**The differentiation is narrow and real.** `@ai-sdk/tui` is a fixed UI you configure — its
tool cards, four display modes. Calcium is a framework you build with, so a tool result renders
as **the block it actually is**: a table for `list_dir`, a patch for `apply_patch`, a logs
block for `run_command`, a code block for `read_file`. **A different model, not a better card.**

**And the adapter shape is docker-tui's exactly:**

```
docker-tui   docker --format json   →  adapter  →  Calcium blocks
agent-tui    AI SDK stream parts    →  adapter  →  Calcium blocks
```

---

## 2 · The part-to-block mapping — the whole architecture

```
text-delta      streaming prose         raw today, markdown when #11 lands
reasoning       the thinking treatment  muted, collapsible — a design question, see §4
tool-call       a live block            name, args, running
tool-result     THE BLOCK ITS RESULT IS  ← the differentiator
approval        ctx.ask()               ← BUILT, and it was the sketch's biggest gap
finish/usage    the footer, or a notice
error           a notice, with the failure named
```

**Seven lines.** Which is what makes `agent-tui` **an adapter, not an agent framework** — and
it makes the boundary enforce itself, because the loop is not ours.

**MEASURED (S0-1): fifteen part types, and the shape is not a switch.** Every content run
arrives bracketed `-start` → `-delta`… → `-end`, and each bracket carries an **`id`** —
`txt-0`, `reasoning-0`, `call_9nkphd3f`. That id is the block id, so the adapter is three verbs
over an id rather than a seven-way switch on a type: **start mints a live block, delta patches
it, end settles it** — which is C13's live-entry lifecycle exactly. A better fit than the table
above assumed, and the correction is worth taking before the switch gets written, because the
switch would have had to grow the id-keyed state back by hand.

**And the ids collide across steps (S0-4).** Two reasoning runs arrived in one turn, both under
`reasoning-0`. The id is unique within a *step*; the transcript is flatter than that. **This is
C26 §8b.6's defect in another component** — an address that is unique in its own scope used in a
wider one — and the remedy is the same shape: the address is `(step index, part id)`.

---

## 3 · The surfaces

Eight, and the last two are new — the activity region and the footer are things to build and
read a frame of, not decoration on the others.

### A1 — the conversation

**The first example to use Calcium's transcript model as designed.** Docker verbs produce one
entry each and settle; a conversation is turns.

```
❯ refactor the parser to handle nested quotes

▸ thinking · 4s · 312 tok

⬤ I'll look at the current implementation first.

⬤ read_file(src/interaction/parser/parse.ts)
  ⎿ 184 lines · 6.2 KB

⬤ The parser handles quotes with a single boolean. Nested quotes need a
  depth counter instead:

⬤ edit(src/interaction/parser/parse.ts)
  ⎿ ┌ parse.ts ────────────────────────────────
    │ 41 - let inQuote = false;
    │ 41 + let depth = 0;
    └───────────────────────────────────────────
```

**`⬤` is a step the model took; `⎿` is that step's result** — four marks total with `▸` for
collapsed reasoning and `❯` for the reader. `⎿` is a **prefix reserving its columns**, which
`noticeDoc` already does, so a multi-row result indents under its mark rather than sitting
below a lone character.

**The streaming reply is a `patch` through the transport**, not `b.live` — F78 removed that
arm, and `/logs` is the precedent.

### A2 — the tool-result gallery

**One tool per block kind**, so the gallery is a coverage argument as much as a feature. **The
frame is uniform and the content is whatever the result actually is** — which is the whole
differentiation against a fixed tool card.

```
⬤ list_dir(src/interaction/)
  ⎿ NAME          KIND    SIZE   MODIFIED
    completion/   dir            2h ago
    parser/       dir            18m ago

⬤ search("cursorCell")
  ⎿ FILE                       LINE  MATCH
    editor/layout.ts            134  export function cursorCell(
    shell/paint.ts              254  // until C17's cursorCell is threaded

⬤ run_command(npm test)
  ⎿ │ 118 passed, 2 todo
    exit 0 · 4.1s
```

Tools deliberately boring. **The tools are not the subject; their results are.**

### A3 — approvals, and it is now wiring

**`ctx.ask()` is built**, and entry 16 generalised it. **The approval, the question, the peek
and the completion menu are one layer** — §15.

```
⟩ Apply this change?
  ● no    ○ yes    ○ show the whole file
```

**Inherited from entry 16 rather than decided here**: the safe answer opens selected and `Esc`
resolves to it, `dismissable: false` because an owner awaits, and placement is a parameter —
**`centred` for a destructive tool, `anchored` for an ordinary one.**

**And the third choice is the overflow path, not decoration.** A 200-line patch does not fit,
and entry 16 measured that **the payload is replaced rather than marked** — so without it a
reader approves a change they cannot see.

**The walk owes one row**: an approval arriving while a previous reply is still streaming.

### A4 — interruption

`⌃c` mid-generation. **A half-streamed reply is a different case from `/logs`'s** — the entry
is mid-patch, not mid-subscription.

```
⬤ edit(src/interaction/parser/parse.ts)
  ⎿ ┌ parse.ts ────────────────────────────────
    │ 41 + let depth = 0;
    └───────────────────────────────────────────

▲ cancelled

⬤ updating the tests                              12s · 1.4k tok
⎿ todo  3/5  ·  ◻ update the tests
```

**A partial reply stays with a notice** — `/logs`'s A1 is the precedent: *the running thing is
the subject; losing the subject removes the answer.*

**And the activity region holds its last state with the spinner stopped**, because *cancelled
here, with two left* is the information and an empty region says nothing happened.

### A5 — the session, and the scroll anchor

**The first surface that genuinely fills the transcript.** Docker verbs produce a handful of
entries; a conversation produces hundreds. C13's cap, C14's virtualisation and the anchor all
meet a real consumer.

**The anchor is already built** — `#afterContent()` runs after every C13 change, so a new
entry does not move a scrolled-up reader (C14 I4/I5/I6, T5.3). **This is its first heavy
consumer, which is different from its first.**

**And the activity region is what makes scrolling back usable at all**: the transcript scrolls
and the region does not, so a reader can read history *while* a turn runs and still see what
it is doing.

### A6 — degradation

The same conversation at five depths.

```
truecolour   ⬤  ⎿  ▸  ✻      tones, a coloured context bar, syntax
1-bit        ⬤  ⎿  ▸  ✻      reverse video, the bar is a plain fill
ASCII        *  `  >  *      the bar is # and ., the crest is one glyph — the hook's rung is one character, not `-`, because a substitution keeps its cell count (C09 I5)
```

**Markdown is the interesting one** — bold and headings go typographic at 1-bit and syntax
highlighting has nowhere to go. **Waits on #11.**

### A7 — the activity region

**New, and the surface with the most rulings** — §17.

```
✻ editing the parser's quote handling            4s · 312 tok
⎿ todo  2/5
  ◼ read the current implementation
  ◼ find where quotes are tracked
  ✻ add a depth counter
  ◻ update the tests
  ◻ run the suite
```

**Present only in flight, gone when idle, held with the spinner stopped when cancelled.** It
is the prompt region's sibling — variable height, capped, does not scroll — and when it
exceeds the cap **it collapses to the summary and the current item** rather than windowing,
because a todo list's useful state is *where am I*.

### A8 — the footer

**Three lines, and it is a set of questions rather than a segment list** — §16.

```
» auto   ✦ qwen3-coder-next   effort high            localhost:8000   22:13
▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/50k   calls ▐▐▐▐░░░░░░ 4/10   28 tok/s
~/code/calcium   ⎇ feat/c26   +124/-18 ~1   ✎ 3           malachy   31m
```

**The same footer against a priced API drops the endpoint and shows `$0.23` where the local
one shows `28 tok/s`** — same slot, different provider. **Applicability resolves per session;
values change per frame.**

**Its own frame-read is the three far sides side by side**, because the segments that vanish
are the claim.

---

## 4 · What this needs that does not exist

| | why | roadmap |
|---|---|---|
| **markdown** | agent output is markdown; today it is `raw` | **#11, the only hard gate** |
| **a thinking treatment** | reasoning is neither prose nor a tool result. Muted? Collapsible? Its own kind? **A real design question with a real source** | not on the roadmap |
| auto-collapse by age | old tool calls at full height forever, or evicted — nothing between | in the nits |
| scrollable containers | a long tool result inside a conversation | #46, **BUILT** — `Scroll` kind, `src/shell/scroll-offsets.ts` (measured 2026-09-03; this row said *blocked on C26*) |

**The thinking treatment is the one worth designing rather than deferring.** It has a
mechanism now — `reasoning` is a first-class stream part with its own parser — and no block
expresses *this is the model's working, not its answer.* **A `Tone` will not carry it** (that
is F30/F49/F51's absent axis, and reasoning is a *kind* of content rather than a judgement of
it), so it is either collapsed-by-default prose or a block kind.

**And the discipline is docker-tui's: build against what Calcium exports today, let the gaps
be findings, do not fix Calcium mid-build.**

---

## 5 · The far side: three transports, and C06 I15's second real check

```
scripted fake   tests, CI, the screencast — deterministic, no network
MLX (default)   OpenAI-compatible on localhost, key "not-needed"
a real API      behind a flag, one line in the README
```

**MLX is the default because "clone it and run it" without a credit card is the difference
between an example people try and one they read about.** Ollama is the cross-platform
equivalent; the scripted fake is the always-works path.

**Step 0 verifies the parsers**, because *without them reasoning and tool-call output are not
parsed correctly* — and those are exactly the two part types this example is about. **Verify
against the chosen model on day one rather than discovering it in a frame.**

**MEASURED (S0-5), and it corrects the row above: that risk is MLX's specifically and is not a
property of "the local path".** Ollama parses server-side — a stock `qwen3.5:9b` pull emitted
both part kinds with no flags, no configuration and no model-specific setup. **So ollama is the
verified default and MLX is the alternative**, which inverts the table: the entry that has
actually been run was the footnote, and the one carrying the fragile step was the default on no
measurement. The generalisation from *MLX needs two flags* to *the local path is fragile* is the
compression class, caught by running it.

**And this is C06 I15's second real check.** docker-tui verified fixture/subprocess/emulated
substitutability once. Three far sides with different latency, streaming granularity and
failure modes is a different check — **a local model streams token-by-token where an API
chunks**, which stresses the patch path harder than anything docker-tui did.

---

## 6 · Build order

```
0  the far side          MLX up, the SDK talking to it, reasoning and tool-call parts
                         VERIFIED to arrive as parts. Nothing designed until they do
1  A1 minimal            text-delta → a streaming patch. Nothing else
2  A2 the gallery        one tool per block kind — the differentiator, built early because
                         it is the thing to show
3  A7 the activity       the region, before approvals — because A3's frame reads wrong
   region                without something saying what is running
4  A3 approvals          ctx.ask(), placement per tool. Wiring, not design
5  A4 interruption       ⌃c mid-generation, and the ruling on what it leaves — which needs
                         A7, since the held state IS the ruling
6  A8 the footer         three far sides side by side; the segments that vanish are the claim
7  A5 the session        hundreds of turns; the anchor's first heavy consumer
8  reasoning             the thinking treatment — ruled against a real stream rather than
                         in the abstract
9  the scripted fake     deterministic far side for tests and the screencast
—  A6 degradation        when #11 lands

**A7 moved ahead of A3 and A4** — both read wrong without it. An approval with nothing saying
what is running looks like the session hung, and A4's ruling *is* the held state.
```

**MEASURED (S0-3): A7 is load-bearing for step 1, not step 3.** The note above moves A7 ahead
of A3 and A4 because *an approval with nothing saying what is running looks like the session
hung.* **The same sentence is true of the first forty-five seconds of every turn** — that is the
measured figure, and it lands before any tool call or any text. So A1 minimal has A3's problem
and has it first, and step 1 is not *text-delta → a streaming patch, nothing else*; it is that
plus something on screen while nothing is arriving.

**Reasoning moves with it.** Step 8 rules the treatment against a real stream, which is still
right — but the collapsed header is on screen for most of a turn from step 1 onward, so what
step 1 owes is the header, and step 8 keeps the body.

**Step 0 first and separately.** docker-tui's step 1 proved a far side you have not run
invalidates the design — `docker ps --json` was `unknown flag`, and `--format json` on `top`
was handed to `ps` inside the container. **Run it, stream one reply, confirm reasoning and
tool parts arrive as parts, then plan against what you saw.**

---

## 7 · What it does not do

Not an agent framework. No tool-authoring API, no multi-agent, no memory, no MCP, no
sandboxing. **The subject is the terminal UI**, and every feature that is not about rendering
a conversation makes the example worse at being an example.

Named so their absence is a decision.

---

## 8 · Where it sits

**Alongside prism-tui, not before it.** prism is the actual point and the remote-far-side
consumer; `agent-tui` is the example that makes strangers want to use the framework. **Second
consumers of different kinds, and neither substitutes for the other.**

**And it is the better outside-reader proxy than docker-tui was** — same author, but a
different domain written against the *published* surface rather than alongside the framework.
Not a substitute for R4.4's actual stranger, and closer to it than anything else available.

---

## 9 · The interface, drawn

Everything below is drawn against blocks that exist. Where a block does not exist it is
marked and the surface falls back to what does — the same discipline docker-tui's drawings
got, and the reason eight of those were wrong is that they were drawn before the far side
was run.

### 9a · The frame, whole

**Five regions**, and only two of them are always there.

```
┌ header ─────────────────────────────────────────────────────────────────────┐
  agent-tui   ✦ qwen3-coder-next   effort high        localhost:8000   22:13
└─────────────────────────────────────────────────────────────────────────────┘
───────────────────────────────────────────────────────────────────────────────
┌ transcript · scrolls · what HAPPENED ───────────────────────────────────────┐

  ❯ refactor the parser to handle nested quotes

  ▸ thinking · 4s · 312 tok

  ⬤ I'll look at the current implementation first.

  ⬤ read_file(src/interaction/parser/parse.ts)
    ⎿ 184 lines · 6.2 KB

  ⬤ The parser handles quotes with a single boolean. Nested quotes need a
    depth counter instead:

  ⬤ edit(src/interaction/parser/parse.ts)
    ⎿ ┌ parse.ts ────────────────────────────────
      │ 41 - let inQuote = false;
      │ 41 + let depth = 0;
      │ 47 - if (ch === '"') inQuote = !inQuote;
      │ 47 + if (ch === '"') depth += depth > 0 ? -1 : 1;
      └───────────────────────────────────────────

└─────────────────────────────────────────────────────────────────────────────┘

┌ activity · does not scroll · what IS HAPPENING · GONE WHEN IDLE ────────────┐
  ✻ updating the tests                                     12s · 1.4k tok
  ⎿ todo  3/5
    ◼ read the current implementation
    ◼ find where quotes are tracked
    ◼ add a depth counter
    ✻ update the tests
    ◻ run the suite
└─────────────────────────────────────────────────────────────────────────────┘
───────────────────────────────────────────────────────────────────────────────
┌ prompt · does not scroll · variable height, capped at rows/2 ───────────────┐
  ❯ ▌
└─────────────────────────────────────────────────────────────────────────────┘
───────────────────────────────────────────────────────────────────────────────
┌ footer · three lines · what the SESSION is ─────────────────────────────────┐
  » auto   ✦ qwen3-coder-next   effort high            localhost:8000   22:13
  ▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/50k   calls ▐▐▐▐░░░░░░ 4/10   28 tok/s
  ~/code/calcium   ⎇ feat/c26   +124/-18 ~1   ✎ 3           malachy   31m
└─────────────────────────────────────────────────────────────────────────────┘
```

**The boxes are annotation, not chrome.** Only the two rules around the prompt are drawn.

> **Ruled the default, 2026-09-05** — C22 §6l, I81–I83. The two rules are on every frame of every Calcium app and nothing switches them off; the footer is as tall as the blocks it returns, zero to `MAX_FOOTER_ROWS`, one row by default; a card's body hangs under `⎿` at the header's text column, four cells in, as this drawing has it (C22 §6l.6, I84 — two cells and the hook under the mark until the frame was read against the drawing); one blank row closes every entry (I85); the header and footer are two clusters with the clock at the right edge (I86); a rule separates the header from the transcript, so the frame carries three (I87, §6l.7). The frame above is therefore not the agent surface's — it is Calcium's, and `docker-tui` draws it too.

### What each region is for, and the split that decides it

| region | scrolls | present | answers |
|---|---|---|---|
| header | no | optional | **what am I talking to** — and it never changes |
| transcript | **yes** | always | **what happened** — the record |
| activity | no | **only in flight** | **what is happening** — and it goes when it stops |
| prompt | no | always | what I am about to say |
| footer | no | optional | **what the session is** — budgets, posture, blast radius |

**Two of these are new against docker-tui**: the activity region, and a footer that is three
lines rather than one. **Both are the chrome-as-blocks question**, and the activity region is
the claimant a fixed row cannot satisfy at all.

**And the header and the footer overlap deliberately.** Model and endpoint appear in both —
the header because it is the first thing a reader wants and it never moves, the footer because
a reader watching the bars is looking down. **If the chrome budget forces a choice, the footer
wins and the header goes**, because the footer's line 1 already carries it.

### The same frame, idle

**The activity region and its rule are gone. Nothing is reserved.**

```
  agent-tui   ✦ qwen3-coder-next   effort high        localhost:8000   22:13

  ❯ refactor the parser to handle nested quotes

  ⬤ Done. The parser tracks depth now and the suite passes.
    ⎿ 118 passed, 2 todo · exit 0

───────────────────────────────────────────────────────────────────────────────
  ❯ ▌
───────────────────────────────────────────────────────────────────────────────
  » auto   ✦ qwen3-coder-next   effort high            localhost:8000   22:13
  ▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/50k   calls ▐▐▐▐░░░░░░ 4/10   28 tok/s
  ~/code/calcium   ⎇ feat/c26   +124/-18 ~1   ✎ 3           malachy   31m
```

### And stopped mid-task, which is the state a footer cannot express

**The spinner stops; the region stays.** *You cancelled it here, with two left* is the
information, and an empty region says nothing happened.

```
  ⬤ edit(src/interaction/parser/parse.ts)
    ⎿ ┌ parse.ts ────────────────────────────────
      │ 41 + let depth = 0;
      └───────────────────────────────────────────

  ▲ cancelled

⬤ updating the tests                                      12s · 1.4k tok
⎿ todo  3/5  ·  ◻ update the tests
───────────────────────────────────────────────────────────────────────────────
  ❯ ▌
```

**The `✻` became `⬤`** — motion stopping is the signal, which is the one place animation
carries information without colour, and it is safe because **stopping is the signal, not the
frames.**

### The two marks are two slots, and that is the ruling

**`⬤` marks a step the model took. `⎿` marks that step's result.** Every part in the stream is
one or the other, which is why the transcript reads without any other structure:

```
⬤   a text-delta run, or a tool-call        the model did something
⎿   the tool-result for the step above      here is what came back
▸   reasoning, collapsed                    the model's working, not its answer
⟩   an approval                             the app is asking
❯   the reader's own turn                   C22 §6's prompt gutter, unchanged
```

**Four marks, four meanings, and none of them is a character in source.** C09 §4: a glyph is
a slot and never a character, *because only the renderer can substitute* — and F122 is the
finding for authoring six marks verbatim. **Each gets an ASCII pair:**

```
⬤ → *      the step marker
⎿ → -      the result continuation
▸ ▾ → > v  collapsed / expanded
⟩ → ?      an open question
```

**`⎿` is a prefix, not a row.** `noticeDoc` already does this — a glyph plus `prefixCells`
reserving its columns for the whole block — so a multi-row result indents under its mark
rather than sitting below a lone character. **The patch above is a real `b.patch`, hunks and
gutters and all, indented by the mark's reserved cells.**

**And the tool call reads as a call**: `read_file(src/…)`, not `read_file  src/…`. The
arguments are the model's own JSON and the parentheses say so.

### 9b · Reasoning is visible and expandable

```
▸ thinking · 4s · 312 tokens                    ← collapsed, the default

▾ thinking · 4s · 312 tokens
  │ The parser tracks quotes with a boolean, so a nested quote flips it
  │ back and the run ends early. A depth counter fixes that, but I should
  │ check whether escaping is handled first — if a \" already decrements,
  │ the counter will go negative on the first escaped quote.
```

**Collapsed by default, expanded with the `expand` action, which exists.** The `▸`/`▾` pair is
the affordance and the muted tone is the treatment — **and the token count is the far side's**,
since the SDK's finish event reports reasoning tokens separately from output.

**Why collapsed by default and not hidden:** reasoning is the model's *working*, and a reader
scanning a conversation wants the answers. But *"the model thought for four seconds and 312
tokens"* is itself information — it says where the time went — so the header stays and the
body folds.

**The open question §4 names is still open**: whether this is prose with an expand affordance,
or its own block kind. **Drawn as prose because prose is what exists**, and the decision wants
a real reasoning stream in front of it.

### 9c · A tool call, three states

```
⬤ run_command(npm test)                        ← dispatched
⬤ run_command(npm test) · 4s                   ← running, elapsed
  ⎿ 118 passed, 2 todo · exit 0                ← settled, the result block
```

> **The settled state is every route's, 2026-09-05** — C23 I55/I56. The invoke route, its error
> arm and the local route settle the header over the result, so `⬤ ps(--all) · 0.4s · 3 rows` above an
> indented table is what a finished listing reads (the count since I59, 2026-09-06 — `ok` was the
> placeholder for *no count*). C23 had ruled the opposite for the shell's own
> verbs (*the card was the waiting and the document is the answer*); the reversal and its reason
> are recorded there.

**The elapsed time is entry 35's mechanism** — the refresh driver's tick, and what
distinguishes *slow* from *stuck*. **The step marker does not change**; the result appears
beneath it.

### What the frame changed about §9c — four captures beside the drawing

**Built as a composition and rendered at 80 and 40 columns, 24-bit and ASCII** (2026-09-05,
`toolCallDoc` in `src/shell/documents.ts`, T2.48 prints the frames). The card is a `notice`
carrying the new `step` glyph over either a `continuation` notice or a `scroll` that opens at
its tail (C04 I97); *+N more* is the scroll's own residue row on a `collapsed` scroll (C04
I98). Four things in the drawing were not what the frame draws, and the frame wins:

```
⬤ run_command(npm test) · 4s                   ← running: the body streams beneath it
line 10
line 11
line 12
⋯ 9 above, 0 below                             ← the hidden rows are ABOVE a following box

⬤ run_command(npm test) · 4s                   ← settled: a zero exit is no outcome (correction 9)
  ⎿ 118 passed, 2 todo                         ← the result under the hook, at the header's text column

⬤ run_command(npm test)                        ← folded: a collapsed scroll
⋯ 0 above, 392 below                           ← "+392 more" IS the residue row
```

1. **`exit 0` moved from the `⎿` line to the header.** The grammar is *⬤ name · elapsed ·
   outcome* over a body; the outcome is the step's verdict and the result line is the body's
   text. Drawn on one line here, they were two facts in one row.
2. **The count string is not `+392 more · ⏎ to attach`.** There is one count mechanism — the
   residue row *⋯ N above, M below* (C04 I49) — and a fourth string beside it would drift. A
   folded body reads *⋯ 0 above, 392 below*; a body that is streaming and followed reads *⋯
   392 above, 0 below*, because the hidden rows of a box showing its tail are above it, not
   below. The drawing had them below.
3. **`⏎ to attach` is not text on the row.** The affordance is `NavElement.activate` on every
   child of a folded scroll — the `expand` action, whose label the footer shows — so the row
   carries no key name (C16 I19's argument: a key named in a notice is a second keymap).
4. **At 40 columns nothing changes**, and under ASCII the marks are `*`, `` ` `` and `~`.
   The four frames are identical in shape; only the glyph slots move. (The head's rung read `@`
   until F824; §A6 had drawn `*` all along.)

**And four more, from the call grammar (§9e), 2026-09-06:**

5. **The mark is `⬤` U+2B24, not `⏺` U+23FA.** The width was measured and the presentation was
   not: U+23FA has an emoji variation sequence and draws two cells wherever a font prefers it.
   The check is derived from the Unicode file now and runs over both glyph tables (C09 I45, F823).
6. **The collapsed residue reads `⋯ +N more`, not `⋯ 0 above, 392 below`.** Correction 2's one
   mechanism stands; its collapsed text had a clause nothing could falsify — there is no *above*
   on a box showing no row. The open box keeps `⋯ N above, M below`. Still no key name (C04 I104).
7. **`⏎` on the head toggles the fold and never re-runs.** *`⏎` again re-runs* is an arming
   machine; `⇧⏎`/`⌥⏎` re-run, as they did (C26 I23).
8. **The running head carries the spinner where the duration will be** — `⬤ pytest · ⠋ 12s` —
   and the settled head an outcome that is a count, never `ok` (C23 I58, I59). The separator is a
   glyph slot resolved by the composer, because the frames above drew a literal `·` at the ASCII
   arm and nobody saw it (F828).
9. **A zero exit is no outcome, and the ASCII separator is `:`.** `exit 0` was `ok` with a number
   on it: the settled head reads `⬤ run_command(npm test) · 4s` and the tone carries success
   (C23 I59). The separator's first ASCII rung, `-`, was the turn spinner's first frame, and a
   dispatched head at that arm read `* verb - -`; read in the frame, ruled `:` (F834, C09 I49).

**What had no mechanism on 2026-09-05, and has one now** (C22 §6l.6, §6l.8): the `⎿` hook in
front of a *table* or a *logs* block, and the left rule beneath it, are drawn by the shell's
`entryLayout` in the gutter it reserves — not by C09 — so §9d's three cards are now drawn as
they read. The paragraph is kept because the reasoning is the record of why the mechanism lives
where it does. **Superseded:** the `⎿` hook in front of a *table* or a *logs*
block. `continuation` is a `notice` slot (C09 §4), so a body that is a table is drawn without
the hook and the header alone carries the frame. **§9d's three cards are therefore drawn
wrong by one column**: the mark before `NAME KIND SIZE` and before `FILE LINE MATCH` does not
exist, and putting it there would need a gutter mechanism on arbitrary blocks that C09 does
not have. Recorded here rather than redrawn, because the gallery's point — one frame, three
block kinds — survives without it.

**And one rule the walk found that the drawing could not show**: `expand` was refused from
every settled entry (C23 I18, *all five kinds*), and every past tool call is a settled entry.
*Expanded with the expand action, which exists* was true of the live entry only. `expand` is
now I18's one exception (C04 §3c S4).

### 9d · The gallery — one tool per block kind

```
⬤ list_dir(src/interaction/)
  ⎿ NAME          KIND    SIZE   MODIFIED
    completion/   dir            2h ago
    editor/       dir            2h ago
    parser/       dir            18m ago

⬤ search("cursorCell")
  ⎿ FILE                       LINE  MATCH
    editor/layout.ts            134  export function cursorCell(
    shell/paint.ts              254  // until C17's cursorCell is threaded

⬤ run_command(git status --short)
  ⎿ │ M src/interaction/parser/parse.ts
    │ ?? test/contract/nested-quotes.test.ts
    exit 0 · 0.2s
```

**Three kinds, three shapes, one mark.** The uniform `⬤`/`⎿` frame is what makes the *blocks*
the visible difference — a table, a table with a code cell, a logs block — rather than three
differently-drawn cards.

**That is the differentiator stated visually**: `@ai-sdk/tui` gives every tool the same card
with four display modes; here the frame is uniform and the content is whatever the result
actually is.

### 9e · The call grammar — what every tool call and command looks like

**One shape, everywhere.** A command the reader typed, a tool an agent invoked, a job the
platform ran — **they are the same object and they look the same.** The differences are what
they say, not how they are drawn. **The standard is Claude Code**, and the measurement behind
that is real: its transcript is skimmable because every call has a marked head, a gutter that
says *this belongs above*, and a body that is bounded rather than poured.

Written 2026-09-06 as the design of record; where a rule below was reversed by a walk against
the tree, the reversal is marked **Ruled** and the component that holds it is named. The
rulings: C09 I45–I49, C04 I104–I105, C22 I88–I90, C23 I58–I62, C26 I23, C15 I24.

#### 1 · The shape

```
⬤ pytest tests/unit
  ⎿ ============== test session starts ==============
  │ ............................................ [2%]
  │ ...............ssss..........................[4%]
  │ ⋯ +392 more
```

```
THE HEAD      ⬤ and what ran. One line, always present, always the same shape
THE GUTTER    ⎿ and a left rule — this belongs to the head above it
THE BODY      bounded, scrollable, with a residue row saying what is hidden
```

**Nothing else.** No box by default, no title bar, no separator, no blank line above or below
inside the call. **The gutter is the grouping and it costs one column.**

#### 2 · The head, in three fields

```
⬤ pytest tests/unit · 4.2s · 47 passed
  │       │            │      └── the OUTCOME, once known
  │       │            └── the DURATION, once known
  │       └── the ARGUMENT, truncated from the tail
  └── the VERB
```

**The verb is what was invoked** — a command name, a tool name, a job kind. Never a sentence,
never a gerund. `pytest`, not `Running pytest`. **The argument is the shortest thing that
distinguishes this call from the next one**, truncated from the tail with the ellipsis the glyph
table gives, because a cut head reads as a different word — `petal_leng…` is not a word (C09 I46,
C04 I105). **The duration appears when the call ends.** **The outcome is one clause and it is the
reader's summary, not the tool's exit code**: `47 passed`, `3 files changed`, `no matches`. A
number, not a status word — *succeeded* says nothing a green tone does not (C23 I59).

The running head: `⬤ pytest tests/unit · ⠋ 12s`. **The spinner sits where the duration will
be**, so nothing moves when the call finishes, and the elapsed counter is the number that matters
— a spinner at 47s says *this is wrong* (C23 I58). The separator between fields is a glyph slot,
resolved by the composer (C09 I49).

#### 3 · The gutter, and why it is not a box

`⎿` marks the first body row; the rest carry the left rule (C22 I88). One column, zero rows. **A
box costs two columns and two rows** — three calls on a 24-row terminal is six rows of chrome. The
border earns its place at exactly one moment: an attached session, where keystrokes are going
somewhere other than the prompt. Out of this round; no attach mechanism exists.

#### 4 · The body is bounded, always

A 400-line result is eight rows and a residue line, and the reader opens it if they care. **The
residue row is the existing one, not a third count string** — one mechanism for *what is hidden*
everywhere it appears. **Ruled**: the collapsed box reads `⋯ +N more` and the open box `⋯ N above,
M below`; no key name on either, because the footer already shows the `expand` label and a key
named in a notice is a second keymap (C04 I104, C16 I19). **Live output does not move the frame**:
streaming into a fixed-height block scrolls inside the block; tail-follow is on until the reader
pages up and back on at the bottom (C04 §3c).

#### 5 · States use the state kind, and nothing hand-rolls a notice

```
RUNNING      the head's spinner and elapsed; the body streams
WAITING      the head reads · ⠋ waiting; the decision is the overlay's (§8)
DONE         the head's duration and outcome; the body is bounded
FAILED       the status block — the ERROR rule, the mark, the message
RETRYING     the same, plus the countdown and the attempt
DENIED       the head reads · denied; nothing ran
```

**`status` is the kind and it is one implementation.** A surface that composes its own red line
of text is the defect this grammar exists to remove — and A03 SS56, widened to the builder call,
says so. **A failed call keeps its head**: `⬤ pytest · 4.2s · failed` above the error box, because
*what ran* is the first thing a reader needs (C23 I61).

#### 6 · Nesting, and the gutter is what carries it

```
⬤ make all · 67.7s · 4 of 4
  ⎿ ⬤ check · 8.1s
    ⬤ enforce · 12.4s · 324 files
    ⬤ test · 41.0s · 5127 rows
    ⬤ golden · 6.2s · 407 frames
```

**One column per level and no more.** Two levels is the working depth; three is a signal the
composition is wrong rather than a rendering to support (C22 I89). **A nested call's outcome rolls
up**: the parent's is derived from its children, never restated by hand (C23 I62).

#### 6b · Many calls at once, and subagents

**Sequential** calls happened one after another and the transcript's order is the whole answer.
**Concurrent** calls — parallel tools, a fan-out, N subagents — need a container, and the
container is the parent call's gutter. `⎿` is a corner, so a single child reads correctly and a set
does not: with N children the gutter is the tree's own vocabulary, from the same glyph table
(`glyphForMask`, C22 I89).

```
⬤ search · 3.1s · 41 matches
  ├─ ⬤ grep "elementsIn" · 6 files
  │  ⎿ construct.ts:1263
  │  │ keys.ts:863
  │  │ ⋯ +4 more
  ├─ ⬤ grep "focusedEntryId" · 18 files
  └─ ⬤ grep "liveId" · 17 files
```

```
⎿   one child, or a call's own body      the corner
├─  a child with siblings after it
└─  the last child
│   the parent's line, continued past a child's body; and the left rule
```

**The parent's outcome is derived** — `41 matches` is the sum — **and its duration is the wall
clock, not the total.** Three calls taking 2s each in parallel took 2s. The children's durations do
not add up to the parent's and are not made to. **While they run, the children do not each
stream**: one line per child, head only; a child's body appears when it settles, bounded, and only
the focused child expands. The parent's head carries `k of N`. **Children appear in the order they
were started and never reorder** — completion is carried by the head, not by position. Where one
child failed, the parent says `2 of 3 · 1 failed` and does not adopt the child's error.

**Subagents are a fan-out whose children are transcripts.** A subagent's own calls are not drawn
in the parent; the parent shows what it was asked and what came back. **Opening a subagent is a
pushed view, not an expansion** — a nested transcript is a different document (C15 §2b). Ruled and
deferred: no producer exists.

#### 7 · The reader can act on a call

**Every call is an element** (C09 I47).

```
⏎          expand or collapse the body
y          copy — the SOURCE, never the rendering: the head copies its invocation,
           ⌃a y the invocation with the output
⇧⏎ / ⌥⏎    re-run, where the entry knows its invocation and the far side permits it
⌃c         cancel, while running
```

**Ruled**: the draft had `⏎` again re-run. A key that toggles on one press and re-runs on the next
is an arming machine, and re-run already has its own key (C26 I23). Copy copies the invocation
with the output, because a result without its command is unattributable six months later.

#### 8 · Approval is a layer, not a body

**A call that needs a decision does not draw the decision in its own gutter.** It goes to the
overlay — the same surface that carries questions, image previews and pasted content — because
the reader is being asked, not shown.

```
⬤ rm -rf build/ · ⠋ waiting

    ┌────────────────────────────────────────┐
    │  rm -rf build/                         │
    │  ▲ this will delete 1,204 files        │
    │                                        │
    │  › approve                             │
    │    deny                                │
    │    always allow rm                     │
    └────────────────────────────────────────┘
```

The head says it is waiting, so the transcript still shows what is happening when the overlay is
dismissed or scrolled away from. The overlay carries the invocation, the consequence if supplied,
and the choices as the existing choice list — `always allow` is a row like any other. On resolve
the overlay closes and the head updates; **a denied call settles as denied and keeps its head**
(C15 I24, C23 I60).

#### 9 · What differs between a command and a tool call

**Almost nothing.** A command the reader typed, a tool an agent invoked, a job the platform ran:
same head, same gutter, same bounded body, same states, same actions. The only difference is
attribution, and the transcript already carries it.

#### 10 · Glyphs, and every one has an ASCII rung

```
⬤   the head mark          ASCII: *   — U+2B24, NOT U+23FA (emoji form; C09 I45)
⎿   the gutter mark        ASCII: `   — one character, because a substitution keeps its count
├─  a child, more follow   ASCII: +-  — from glyphForMask; the last-child distinction vanishes at ASCII
└─  the last child         ASCII: +-
│   the parent's line      ASCII: |
│   the left rule          ASCII: |
▲   the warning mark       ASCII: !   — ▲ in this tree, not ⚠
⠋   the spinner            ASCII: the set's own pair
…   the truncation mark    ASCII: ~
·   the separator          ASCII: :   — not `-`, which is the turn spinner's frame (F834)
```

**From the glyph table, never as literals**, and every one measured for ambiguous width *and*
emoji presentation before it ships (C09 I45, I48). Ten of the vocabulary's seventeen members were
two cells at `wide` on the day this was written (F825).

#### 11 · The rules, restated as rules

```
1   one head, one gutter, one bounded body — for every call, everywhere
2   the verb is a name, not a sentence
3   the outcome is a number, not a status word
4   the argument truncates from the tail
5   borderless by default; a border means "your keys go here now"
6   a bounded body and a residue row, always — never a poured result
7   live output scrolls inside the block and never moves the frame
8   states come from the status kind and nothing composes a notice by hand
9   a call is an element: focusable, copyable, actionable
10  copy takes the source with the invocation
11  two levels of nesting, and the parent's outcome is derived
12  every glyph from the table, with its ASCII rung
```

**The audit is reading frames.** A transcript where two calls read as different products is a
defect, **and no assertion in this repository can see it.**

---

## 10 · Commands

**Slash verbs are the framework's shape and prose is the exception** — which is the
prefix-*out* question (#32 — this used to say #27, which is syntax highlighting): a shell sends an unrecognised line to `sh`; an agent harness
sends it to the model. **That inversion is the one thing the manifest cannot express today**,
and it is this example's first framework finding rather than a surprise.

| verb | what it does |
|---|---|
| `/model` | list what the endpoint serves; `/model <name>` switches |
| `/tools` | the declared tools, their schemas, and which are approval-gated |
| `/context` | what is in the window — turns, tokens, what was dropped |
| `/clear` | new conversation, same session |
| `/retry` | re-run the last turn, optionally with an edited prompt |
| `/fork` | branch from a turn — the transcript already holds every one |
| `/save` `/load` | a conversation to disk, and back |
| `/cost` | tokens and, where the provider prices them, money |
| `/approve` | the standing policy: `ask` · `auto` · `never`, per tool |
| `/cancel` | what `⌃c` does, available as a verb for the same reason `/exit` is |

**`/retry` and `/fork` are the two that justify the transcript model.** A conversation is
turns, every turn is an entry, and an entry has an id — so branching is addressing one, and
nothing else in the app needs building for it. **That is a capability a fixed chat UI does not
have and it costs almost nothing here.**

**`/context` is the one a local model makes necessary.** A 32k window fills fast, and *what
was dropped* is the question a reader has when an answer forgets something. The SDK's message
list is the source; the app renders it.

### Keys

```
⏎          submit
⌃c         cancel the turn — not the session (the ladder's rung)
⌥h         help
⌥⏎         newline without submitting
⇧⇥         cycle approval policy for the pending call
y n        answer an approval, when one is open
⏎ on a     expand a collapsed reasoning block or tool result
  focused
  element
y          semantic copy — the code, the row, the diff
```

**`⌃c` cancels the turn and not the session**, which is C16's ladder doing what it was built
for: an in-flight verb is a rung above the session's exit.

---

## 11 · Features that follow from the transcript being structured

**These are the argument for building the example at all**, because each is a thing a fixed
chat UI cannot do and this one gets nearly free.

**Semantic copy.** `y` on a focused code block copies the code, on a table row copies the row,
on a patch copies the diff. **Built** — entry 15's step 4.

**Structured export.** `/save` writes the conversation; a table is rows and columns, a patch is
hunks, so *export this result as CSV* is a projection rather than a scrape.

**Re-run a tool call.** A tool call is an entry with its arguments recorded. `⏎` on one
re-dispatches it — which is `/retry` at a smaller scope and the same mechanism.

**Diff two answers.** `/fork` twice and the comparison block already exists. **The block
docker-tui built for `/drift` renders two model answers side by side with no new work.**

**And the paste chip.** A pasted file becomes `[#1 parse.ts · 184L]` in the prompt and reaches
the model as content rather than as a wall of text. **The prompt half is built** — `CHIP_LINES` in `src/shell/construct.ts` turns a paste of five or more lines into `[#n pasted · N lines]`; roadmap 30 is PART because the transcript half is not (measured 2026-09-03; this said *designed, unbuilt*) — and this is its most natural consumer.

---

## 12 · What the drawings owe

**Every field name and count above is a placeholder.** The far side has not been run.

**That is F11's class and it has cost eight drawings**: `docker ps --json` was `unknown flag`,
`--format json` on `top` was handed to `ps` inside the container, and the S6/S7 drawings
described a `Config` shape neither side had.

**So step 0 is not optional and it is not a setup task.** Run the model, stream one reply with
a tool call and a reasoning block, and **correct these drawings against what actually
arrives** before any of them is built to.

---

## 13 · The spinner, and the marks that animate

**`❯` is always the reader. `⬤` is always the agent.** That is the frame's whole grammar, and
it means the animated cell is beside the mark, in the head's duration slot (§9e §2, C23 I58) —
the mark itself never changes — **one cell,
reserved always, occupied whether the step is running or settled.** No reflow, which is the
same rule as the scrollbar gutter and the focus gutter.

### The width check, run before choosing anything

**Three of the six characters in the obvious sequence are unsafe**, and neither failure is
visible on the machine that picks them:

```
·  U+00B7  EA=Ambiguous      two cells in a CJK locale
✽  U+273D  EA=Ambiguous      two cells in a CJK locale
✳  U+2733  emoji variant     two cells wherever the font prefers emoji presentation
✴  U+2734  emoji variant
❄  U+2744  emoji variant
❇  U+2747  emoji variant
❈  U+2748  emoji variant
```

**A frame that is two cells wide where its neighbours are one reflows the row every tick.**
`cells()` counts one; the terminal draws two — **measurement and rendering disagree, and the
disagreement varies by locale and by font.** That is the tab-in-the-banner class, and it costs
nothing to avoid because the safe set is large:

```
safe (EA=Narrow, no emoji form)
❀ ❁ ❂ ❃ ❅ ❆ ✦ ✧ ✱ ✲ ✵ ✶ ✷ ✸ ✹ ✺ ✻ ✼ ✾ ✿ ✢
```

**Assert it rather than remembering it**: every spinner frame is one cell by `cells()` **and**
has no emoji presentation form. One row, and it is the row that stops the seventh frame
someone adds from being `❇`. **And derive the check rather than remembering the list** — the
row above was a seventeen-character list from memory, it opened with `·`, which is Ambiguous
and has no emoji form, and it never looked at the glyph tables, which is how `⏺` U+23FA shipped
as the head mark with a variation sequence in the very file the list was recalling (F823). C09
I45 reads `emoji-variation-sequences.txt` and runs over every table.

### They pulse, they do not rotate

These characters vary by **weight and spoke count**, not by angle — so a rotation built from
them reads as a flicker. **A bloom is the honest animation**, and it is also what a *thinking*
indicator should look like: breathing rather than spinning.

**A · the pulse — six frames, one family, weight only. Recommended.**

```
✢ ✲ ✱ ✻ ✱ ✲
```

Four thin teardrops → open centre → heavy asterisk → fat teardrops → back. **The spoke count
never changes**, so it reads as one shape breathing rather than a sequence of different marks.

**B · the bloom — eight frames, opens from nothing.**

```
✧ ✦ ✢ ✲ ✻ ✲ ✢ ✦
```

White four-point → black four-point → the spoke families → back. **More motion, and it draws
the eye harder** — better for a single long-running step, worse when several are on screen.

**At 120 ms a six-frame pulse is a 720 ms breath**, which reads as calm. 80 ms reads as urgent
and is right for nothing here. **The tick is the refresh driver's** — never a `setInterval` in
`paint.ts`, which is the constraint that survived the spinner's own premise expiring.

### ASCII, and the existing set stays

`spinnerFrames(caps)` already returns `["-", "\\", "|", "/"]` at ASCII. **Keep it.** A rotation
at ASCII and a pulse at unicode is fine — **degradation preserves meaning, not appearance**,
and the meaning is *something is happening*.

### State, and why colour cannot carry it

**Roadmap ruling: animation is decoration, never information.** So `⬤` may change colour with
state and **the state must be legible without it**:

```
running    animated, accent tone         and the step line says `· 4s`
ok         static ⬤, default tone        the result block is the evidence
failed     static ⬤, error tone          AND the result line names the failure
```

**F34's rule, applied to a marker**: a distinction must not be carried by colour alone. **The
result text carries it**; the tone reinforces. At 1-bit the tone is gone and the sentence is
still there.

**And a `⬤` that is still animating is itself a state** — it says *this step has not settled*,
which is information the animation genuinely carries without colour. That is the one case
where motion is not decoration, and it is safe because **stopping is the signal, not the
frames.**

---

## 14 · The thinking treatment — ruled

**Not a block kind.** Reasoning is prose in a collapsed panel with a gutter prefix, and what
is actually missing is **collapse on a panel** — which has three consumers, not one.

### The test, and it is what moved the answer

**What would a `reasoning` kind do that `panel` + `raw` cannot?**

Working through it: nothing about *rendering*. A collapsed header with an expandable body is
`panel` with a collapsed state. The metadata — `thinking · 4s · 312 tokens` — is a title
string. The muted treatment is a tone a producer sets. The `▸`/`▾` affordance is the `expand`
action, which exists.

**So the kind would exist to carry policy, not appearance** — *this is not the answer* — and
policy on a block kind is the wrong place for it. It is a flag on an entry at most, and
probably nothing at all until something needs to act on it.

### What is missing is general, which is the argument

**`panel` has no collapsed state.** And the moment it does, three things want it:

```
reasoning              collapsed by default, header carries duration and tokens
old tool calls         auto-collapse by age — the nits' §"agent harnesses" entry
a long tool result     a 400-line file read, collapsed to its header
```

**Three independent consumers is this project's threshold for naming a mechanism**, and it is
the same shape as F103's three tone tables: *a pattern with three implementations and no name
reads as three local decisions.* Building a `reasoning` kind would be the first of those three.

**Check before designing it**: whether `panel` can carry a collapsed state without changing
`measure(block, width)`'s shape. A collapsed panel is *shorter*, which is a height that
depends on state — and if that state lives on the block it is fine (a `rev` moves with it),
but if it lives on focus it is I17's forbidden case. **The collapse is content, not focus, so
it should be safe** — verify rather than assume.

### What step 0 changed about this section, and it is the weight rather than the ruling

**The ruling stands: nothing measured argues for a block kind.** What does not stand is the
premise underneath the whole section — that reasoning is an aside. It is **90 stream parts
against text's 22**, and **569 characters of working to produce the five-character answer
`ready`.** By time, 44.7 seconds of a turn before anything else arrived.

So *collapsed by default* is right and **the collapsed header is the primary surface**, not the
degenerate case. The tick of its token count is what the user watches, and it should be drawn
and read as the main thing on screen rather than as the state a block is in before it is
expanded. S0-3.

### The gutter is the 1-bit answer

Expanded, the body must read as *not the answer* without colour:

```
▾ thinking · 4s · 312 tokens
  │ The parser tracks quotes with a boolean, so a nested quote flips it
  │ back and the run ends early. A depth counter fixes that.
```

**The `│` prefix is `prefixCells`**, which `noticeDoc` already uses for its severity glyph —
a mark plus reserved columns for the whole block. **At 1-bit the muted tone is gone and the
gutter carries it**, which is F34's rule applied to a content class rather than a verdict.

### Three things that fall out, and the third is a real question

**Multiple reasoning blocks per turn.** The model reasons, calls a tool, reasons again — so
they are separate blocks separated by the call, not one merged block. **Separate is right**
because the tool call happened between them and merging would lie about the order.

**MEASURED, and the far side produced both halves of it.** Step 0's single turn emitted exactly
that sequence — reason, call, reason — which confirms the ruling. It also emitted **the same id
for both runs**, so an adapter keying on the part id merges them silently, which is the lie this
paragraph forbids arriving by a route the paragraph does not name. S0-4.

**It streams into a collapsed block.** The body grows while the header is what is on screen,
so the header's token count ticks and the body arrives unseen. **That is the pending entry's
mechanism** (§35) pointed at a block rather than an entry.

**And does semantic copy take it?** `y` on a collapsed reasoning block — the working, or
nothing? **Ruled: it copies the working**, because the alternative is a focusable thing that
refuses to copy, and *a block that can be focused and cannot be copied is a dead affordance.*
Whether `/save` includes reasoning is a different axis and belongs with `/save`.

### What this defers, deliberately

**Markdown.** Reasoning is prose, so it renders as `raw` until #11 lands and as markdown
after. **Neither changes this ruling** — the container is the panel either way.

---

## 15 · The popup is the app's whole interaction surface

**Five consumers in one app**, and that changes what the layer is. In docker-tui the popup was
one thing used twice; here **every moment where the flow stops and waits goes through it.**

```
approvals      the model wants to run a tool          resolve(key)  · blocks
questions      the model asks you something           resolve(key)  · blocks
free text      it wants an answer, not a choice       resolve(text) · blocks
peeks          a paste chip, an image, a long result  none          · does NOT block
completion     the menu, which was there first        insert        · does NOT block
```

**A mechanism built for two consumers turning out to be five is the difference between a
shared helper and a component**, and it is a stronger case for entry 16's unification than
entry 16 had.

### The axis entry 16 does not have: open, versus waiting

**`dismissable` says whether the router may pop the layer. Nothing says whether the world is
waiting**, and those five split on it:

- **An approval blocks.** The turn is suspended; the prompt must be unavailable, because
  typing into a session that is mid-question is how F125's `{ command: "" }` shipped.
- **A peek does not.** You are looking at something you pasted **while composing** — if the
  peek freezes the prompt, the chip is useless.

**This may already be right by construction**: the blocking three `await` a promise and the
other two do not, so the prompt's availability could fall out of the guard rather than out of
a flag. **Verify rather than assume** — it is exactly the kind of thing that reads as correct
until a peek freezes the prompt, and *nothing above the guard can see the difference.*

**If it does not fall out**, it is a fourth parameter and it is not `dismissable` widened: *the
router may not pop this* and *the reader may not type* are two claims and a layer can want
either without the other.

### The shapes, and A7's ruling already draws the line

`AskOptions` carries `detail: Block` alongside the choices:

```
detail + choices          an approval, or a destructive confirm
detail + no choices       a peek — a paste chip, an image, a long result
detail + free text        a question the model asks
```

**And A7's ruling already draws the line**: an empty choice list is a construction error
*exactly when* the list is the only path to the answer. `resolve(key)` has no other, so zero
choices throws; `none` is showing what is available, so zero choices is ordinary. **The peek
is the `none` arm and it is legal by that ruling rather than by an exception.**

**Three parameters, three consumers, one layer.** The approval is `resolve(key)` +
`dismissable: false` + `centred`. The peek is `none` + `dismissable: true` + `anchored`.
Nothing new is built.

### But the payload overflows, and that is agent-tui's problem specifically

**Entry 16 found and fixed this**: on an ordinary 24-row terminal a twenty-row payload cost
the confirm its choices — no `[y]`, no `[n]`, no bottom border, keys working and nothing on
screen saying so. **The payload is replaced when it does not fit, not marked**, because the
choices are load-bearing and a diff is not.

**For agent-tui that means approving a change you cannot see.** A 200-line patch is ordinary,
and the popup will show the question, some hunks, and the answers — with the rest gone.

**So the third choice is not decoration. It is the overflow path.**

```
⟩ Apply this change?
  ● no    ○ yes    ○ show the whole file
```

**`show the whole file` opens the patch in a pushed view** — C25's fullscreen patch view,
which exists and windows. **The popup shows what fits and the choice list carries the way to
see the rest**, which is the honest answer to a payload the layer cannot hold.

**Ruled: any approval whose detail can overflow declares a third choice that opens it.** Not
a framework rule — an app-side obligation, because only the app knows whether its detail is a
one-line summary or a diff.

### And it is the same overflow the peek has

A paste chip's peek shows three lines of a 47-line JSON blob; `⏎` opens it in C17's editor in
a pushed view. **Same shape: the popup shows what fits, and an action reaches the rest.**

**Entry 46 — scrollable containers — is the general answer** and it is BUILT (measured 2026-09-03; this said *blocked on C26*). Where it is not wired, *open it somewhere with room* is the escape, and it is a better one than scrolling
a popup would be: **a reader approving a change wants the whole diff, not four rows of it at
a time.**

### One consequence for images

The popup's `detail` is any `Block`, so an image chip's peek is the same layer with an image
block inside. **Not useful for an approval** — nothing here approves a picture — but it means
the popup does not need to know what it is showing, which is what makes one layer serve four
consumers.

---

## 16 · The footer, and what a harness can show that a statusline cannot

`claude-statusline` is the reference — three lines, truecolor gradient bars, half-blocks
sampled twice per character, git context, usage limits, opt-in whimsy. **Most of it
transfers. The interesting part is what does not, and why.**

### Three constraints differ, and each one opens something

| | claude-statusline | agent-tui |
|---|---|---|
| **repaint** | once per second, Claude Code's limit | **every frame** — Calcium owns the refresh driver |
| **data** | one pass of stdin JSON | **it is the harness** — the message array is in hand |
| **chrome** | three lines, its own | **one row each**, and five features already want it |

**The repaint difference is the small one** — the statusline's own note is that *the gradient
is smooth but motion steps per second*. Here the crest can actually travel.

**The data difference is the whole idea.** A statusline is handed a context percentage. A
harness holds the messages, so it knows **what** is filling the window, not just how much.

### The context composition bar — the thing only a harness can draw

**A percentage says 78% full. It does not say that one file read is 60% of it.**

```
ctx ▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░  78%   ⏎ breakdown
    └sys─┘└tools┘└──turns──┘└file┘
```

**Segment the bar by what the parts actually are** — system prompt, tool schemas,
conversation turns, tool results, pasted content — and a single `read_file` that swallowed
the window is visible at a glance instead of being an unexplained jump from 30% to 78%.

**And the segments are addressable.** `⏎` on the bar opens `/context`, which is the popup
again (§15) — the bar is the summary and the verb is the detail. **Same layer, sixth
consumer.**

**Better than an autocompact marker.** The statusline draws `┃` where compaction will bite;
a harness can say **which turns go next**, because it holds them. *You are at 78%* is a
warning; *these three turns drop when you send this* is a decision.

### The width claim, which is wrong in both projects' favour to know

`claude-statusline`'s README says *every glyph is width-1 (no emoji), so alignment is exact
across platforms and fonts.* **True about emoji, false about ambiguous width** — and the bar
is drawn with `▌`:

```
▌ █ ▀ ▄ ▒ ▓ │ ┃ ▁▂▃▄▅▆▇     EA=Ambiguous — two cells in a CJK locale
▐ ░                          ALSO Ambiguous — this row used to say narrow; see below
```

**So the gradient bar doubles in width wherever ambiguous is treated as wide**, and the
right-alignment the README promises breaks. **This section used to say `▐` is narrow and `▌` is not.** Measured 2026-09-03 against `src/presentation/blocks/glyphs.ts:685-690`: `▐ ░ ▬ ▪ ▫ ▮ ▯ ▰ ▱ ◼ ◻` are `East_Asian_Width=Ambiguous` every one, and **`braille` is the only width-stable unicode bar style** — so a bar built from `▐` and `░` doubles exactly where this paragraph said it would not, and the `narrowOnly` flag on those styles is what the renderer does about it.

**This is the class this project has now found a dozen times**: a correct narrower claim
standing in for a broader one, where only the broader one is what the code needs.

### The chrome budget is the real constraint

`frame.ts`: *Calcium owns the structure — one chrome row each, fixed, never scrolling.* And
that row now has **six claimants**:

```
NAV / EDIT          the navigation model
running · 4s        progress feedback
✳ 2 queued          queueing
a region separator  the frame's own boundaries
scroll position     a focused container
ctx 78% + segments  this
```

**Three lines is a statusline's luxury and a framework's decision.** So either the chrome
grows — costing transcript rows, which is what density was chosen against — or it composes,
which is the **chrome-as-blocks** option in the nits: if chrome is a block sequence, `b.row`
gives it horizontal layout and multi-row falls out for free.

**Decide it once, before six features each add a segment.** That is the nits' §9 with a sixth
claimant, and this design is the one that most wants the room.

> **Superseded the same day by C22 §6l** (I82): the footer is its content — `[]` is zero rows,
> the maximum is `MAX_FOOTER_ROWS` (derived: four then, three since §6l.7's header rule) — and `TuiConfig.chrome.footerRows` is removed.
> The three lines above are three blocks. The paragraph below is kept as the ruling it replaces.

**DECIDED 2026-09-05 — C22 §6k, and the footer grows; the chrome does not compose.** The
budget is `TuiConfig.chrome.footerRows`, declared once per session, default 1, an integer up
to `MAX_FOOTER_ROWS` — which is **derived** from the size gate as the largest footer that
leaves one transcript row at 16 rows with the prompt at its cap (six today), not chosen. The
three lines above are `footerRows: 3`, and a `ChromeFn` still returns blocks: the height is
the session's and never the function's, because a per-frame height makes the footer the
second thing beside the prompt that pushes the transcript (§6k.3). `b.row` already gives the
horizontal layout inside a row, so *chrome-as-blocks* was the half of the option this design
already had. **Measured for this section**: at 24 rows the three lines plus a one-row header
and a two-row prompt leave 18 for the transcript, which is the trade the drawing under
*The three lines* accepts; at 12 rows nothing composes — the size gate holds at 16 and the
fallback says so. **What it does not give this design is A7**: the activity region is
variable-height and *between* the transcript and the prompt, which is a fifth region and not
a footer, and §23's sentence that a fixed row cannot satisfy it still stands.

### What transfers unchanged

**Themes recolour everything**, which is C10's job here and already ruled — a theme declares
its background and the palette carries `carries: "meaning"` where a colour is load-bearing.

**Opt-in extras via config** rather than a fixed layout. The statusline's `SL_*` toggles are
`TuiConfig` fields here, and the same principle holds: *the default stays clean and you bolt
on exactly what you want.*

**And the segment vocabulary** — model, effort, cost, session age, git branch, burn rate — is
a good list because someone ran it for months. **Take the list; do not take the layout.**

### The segments, and the split that decides where each goes

**Header is identity — what am I talking to. Footer is state — what is happening.** Static
things go up, changing things go down, and the test is *does this move during a turn.*

| segment | where | why |
|---|---|---|
| model · endpoint | **header** | the first question a reader of a local agent has, and it never moves |
| **mode** — plan · manual · accept-edits · auto · skip | **footer, loud** | see below |
| context bar + composition | footer | moves every turn |
| step *n*/*max* | footer | see below |
| files touched · `+47 −12` | footer | the agent's blast radius |
| git branch · dirty state | footer | dirty moves, branch does not — show dirty, branch only when it changes |
| tokens/sec | footer, local only | the only thing that says a local model is alive rather than wedged |
| cost | footer, **conditional on the far side** | meaningless against a local endpoint; do not draw a `$0.00` |
| git email | **only when it matters** | if a commit tool exists — otherwise noise |
| open PRs | a verb, not the footer | a network call for ambient context, and it does not change during a turn |
| clock · usage limits · moon · pet | not by default | Claude Code's subscription model and its whimsy; opt-in at most |

### Four the list does not have, and two of them are safety

**The mode is the most important thing on screen, and it should be loud.** Plan · manual ·
accept-edits · auto · skip is the **permission posture** — it decides whether the next tool
call stops and asks. **In `auto` the agent is editing files without asking**, and that is not a
segment among segments: it wants the treatment F34's rule demands, a mark and not only a
colour, because a reader who missed it finds out from the diff.

**And it should be changeable from where it is shown.** `⇧⇥` cycles it — the footer states
the posture *and* is where you change it, rather than stating a thing you have to find a verb
to alter.

**Step *n*/*max* — nobody shows this and it is invisible until it bites.** The AI SDK's agent
loop runs to a step budget; when it exhausts, **the agent stops mid-task with no explanation.**
`step 4/10` makes that legible in advance, and `9/10` is a warning a reader can act on.

**Files touched · `+47 −12` is the blast radius**, and it is the thing you most want before
letting it keep going. The statusline has *last file*; a harness **dispatches the tools**, so
it holds the whole set — not the most recent one.

**And uncommitted-versus-committed.** An agent that has rewritten four files and committed
nothing is one `⌃c` from losing all of it. **A single mark saying the work exists only in the
working tree** is worth more than a branch name.

### What the harness knows that a statusline is guessing at

Every entry above where agent-tui does better has the same cause: **the statusline is handed a
snapshot; the harness dispatched the thing.** Last file versus every file. A percentage versus
its composition. A permission mode read from settings versus the policy that will actually
gate the next call.

**So the rule for adding a segment**: if it could be read from a file, it can wait for a verb.
**If it is a fact about the turn in flight, it belongs in the footer** — because that is the
only place a reader is looking while it happens.

### The layout — three lines, and the footer is a set of questions

**Not a fixed segment list.** Each line answers questions, and a question is filled by whatever
can answer it on this far side — which is what makes cost, tokens per second and an endpoint
the same slot rather than three.

```
what am I talking to?     model · endpoint · effort
what may it do?           mode
how full is it?           context bar
how long will it run?     the call budget
what is it costing?       $0.23  OR  28 tok/s  OR  nothing
what has it changed?      files · diff · dirty
where am I?               path · branch
how long have I been?     session age
```

#### The three lines

```
» auto   ✦ qwen3-coder-next   effort high                    localhost:8000   22:13
▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/50k      calls ▐▐▐▐░░░░░░ 4/10   28 tok/s
~/code/calcium   ⎇ feat/c26-focus   +124/-18 ~1   ✎ 3        malachy   $0.23   31m
```

**Line 1 — posture and identity.** Mode first, because it is the safety signal. The endpoint
earns its place against a local server, where *which model am I actually talking to* is the
first question a reader has.

**Line 2 — the two budgets.** Context on the left, **the call budget on the right**, which is
where the reference statusline puts its usage limits.

**Line 3 — the work.** Path, branch, diff, dirty, files touched; identity, cost, age.

#### `calls`, not `steps` — and why it is on screen at all

**One call is one round-trip to the model.** The SDK's loop runs until the model stops asking
for tools or the budget is spent:

```
call 1   you ask → the model calls read_file
call 2   result back → it calls edit
call 3   result back → it calls run_command
call 4   result back → it answers in prose
```

**When the budget is exhausted the loop stops and returns whatever it has** — a turn that ends
mid-task and reads as a bad answer rather than as a ceiling being hit. **`9/10` says the next
tool call is the last one, before it happens.**

**`step` is the wrong word** — it reads as a plan the model is working through, and the model
is not working through anything. `calls 4/10` says what it is.

#### The same footer, three far sides

```
local MLX
» auto   ✦ qwen3-coder-next   effort high              localhost:8000   22:13
▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/50k     calls ▐▐▐▐░░░░░░ 4/10   28 tok/s
~/code/calcium   ⎇ feat/c26   +124/-18 ~1   ✎ 3               malachy   31m

a priced API
» auto   ✦ claude-opus-4.8   effort high                              22:13
▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/200k    calls ▐▐▐▐░░░░░░ 4/10    $0.23
~/code/calcium   ⎇ feat/c26   +124/-18 ~1   ✎ 3               malachy   31m

no git · single call · no pricing
» manual   ✦ gemma-4-26b                               localhost:8000   22:13
▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/50k                       19 tok/s
~/tmp/scratch                                                          31m
```

**The endpoint vanishes on the API row** because it is the default and says nothing. **Effort
vanishes for a model without reasoning. The call bar vanishes when the budget is 1** — there
is no budget to show. **Line 3 nearly empties outside a repo**, which is correct rather than
sad.

#### The ruling that stops it flickering

> **Applicability is resolved per session. Values change per frame.**

Otherwise segments appear and disappear mid-session and the eye cannot track anything.

**With one exception that proves the rule — the diff slot.** In a repo it *exists* from the
start and reads `clean` until the agent writes, then `+124/-18`. **Not applicable → gone.
Applicable but empty → shows empty.** Same rule as the scrollbar's reserved column and the
focus gutter: **reserve if it could apply, fill when it does.**

#### The composition, and it costs a line or a colour

```
» auto   ✦ qwen3-coder-next   effort high                    localhost:8000   22:13
▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░░░░░  62%  31k/50k      calls ▐▐▐▐░░░░░░ 4/10   28 tok/s
└sys┘└tools┘└─turns──┘└─file─┘                                        ⏎ breakdown
~/code/calcium   ⎇ feat/c26-focus   +124/-18 ~1   ✎ 3        malachy   $0.23   31m
```

**Four lines with labels, or three with the segments coloured in place.** Colour costs no row
and **degrades to a plain bar at 1-bit, where `⏎ breakdown` carries it** — the composition is
an explanation rather than a safety signal, which is the animation rule's own test.

#### At 80 columns, and at ASCII

**Segments drop by priority within each line** — C11's column model applied to chrome:

```
80 columns
» auto   ✦ qwen3-coder-next                       localhost:8000   22:13
▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░  62%  31k/50k        calls 4/10        28 tok/s
~/code/calcium   ⎇ feat/c26   +124/-18            malachy   31m

ASCII and 1-bit
» auto   * qwen3-coder-next                       localhost:8000   22:13
##############......  62%  31k/50k         calls 4/10        28 tok/s
~/code/calcium   > feat/c26   +124/-18            malachy   31m
```

**Two never drop: the mode and the context percentage.** Everything else is a column with a
priority, and *the identifying end of a value is kept* — `calls 4/10` loses its label before
it loses its numbers.

#### Every glyph checked, and three of the obvious ones fail

```
★ ◆ ▲   ambiguous   the model crest — use ✦, which is narrow
▌ █ ▒ ▓  ambiguous   the gradient bar — use ▐ and ░, which are not
│ ┃      ambiguous   separators — use spaces
· ↑ ↓    ambiguous   the middle dot and the ahead/behind pair
⚡       WIDE        two cells on every conforming terminal, not just CJK
```

**`⚡` is the sharp one** because it is not locale-dependent: *Wide* means two cells
everywhere, so **the `auto` line is one column longer than every other mode** and the
right-alignment shifts whenever the mode changes.

**The mode glyph is ASCII by construction** — it is the one segment that must survive every
depth, so it does not get a slot and a fallback, it starts as ASCII:

```
~  plan            proposes, never executes
?  manual          asks before every tool
+  accept-edits    auto-approves edits, asks for the rest
»  auto            auto-approves everything
!! skip            bypasses permissions
```

**And the word stays beside it.** F34 twice over: not colour alone, and not a glyph alone —
`»` versus `+` is one character between *the agent asks before it writes* and *it does not*.

#### The chrome cost, stated

**Three lines is the reference statusline's luxury.** `frame.ts` rules *one chrome row each,
fixed* — so this design either grows the chrome, costing transcript rows, or **chrome becomes
blocks**, which is the nits' option and gives multi-row and horizontal layout from `b.row` for
free. **Six features now want that row; this is the one that most wants the space.**

### ~~The layout — one row~~ — superseded by the three-line layout above
### The layout — one row, priority-ordered

**One row, and segments drop by priority as the width falls.** That is C11's column model
applied to chrome, and it is the existing mechanism rather than a new one.

```
120  » auto    ctx ▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░ 62%    step 4/10    ✎ 3 files +47 -12    28 tok/s    4m

100  » auto    ctx ▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░ 62%    step 4/10    ✎ 3 +47 -12    28 tok/s

 80  » auto    ctx ▐▐▐▐▐▐▐▐░░░░ 62%    4/10    ✎ 3 +47 -12

 60  » auto    62%    4/10    ✎ 3
```

**Drop order, last to go first:**

```
1  mode              never drops — it is the safety signal
2  context %         never drops — the number, not the bar
3  step n/max        loses its label before it loses itself
4  files touched     loses "files" and the ~2 before the counts
5  the bar           the % survives it
6  tok/s             local only anyway
7  session age
8  cost              conditional on the far side — never draw $0.00
```

**Two never drop.** Everything else is a column with a priority, and *the identifying end of
a value is kept* — `step 4/10` becomes `4/10`, not `step 4`.

### The composition lives in the bar, not in a second row

**Colour the bar's segments by category** — system, tools, turns, results, pastes. **One row,
no extra cost**, and the composition is visible without spending a chrome row nobody has.

```
ctx ▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐░░░░░░░░ 62%     ⏎ breakdown
    └─sys─┘└tools┘└─turns──┘         (the braces are the explanation, not the chrome)
```

**At 1-bit the colours are gone and the bar is a plain fill.** That is honest rather than
lossy, because **the composition is an explanation and not a safety signal** — the animation
rule's own test — and `⏎` opens `/context` with the breakdown at every depth.

### The mode glyph is ASCII by construction

**It is the one segment that must survive every depth**, so it is not a slot with a fallback —
it is ASCII to begin with:

```
~  plan            proposes, never executes
?  manual          asks before every tool
+  accept-edits    auto-approves edits, asks for the rest
»  auto            auto-approves everything
!! skip            bypasses permissions
```

**And the word stays beside the glyph.** F34's rule: a distinction must not be carried by
colour alone — and here it must not be carried by a *glyph* alone either, because `»` versus
`+` is one character between *the agent asks before it writes* and *it does not*.

**`»` and `!!` also take the loud tone**, so at truecolour there are three carriers and at
1-bit there are still two.

### Two more findings for `claude-statusline`

Both in the same class as `▌`:

```
⚡  U+26A1  EA=Wide       the auto permission glyph — TWO CELLS EVERYWHERE, not just CJK
↑↓  U+2191/93  Ambiguous  the git ahead/behind pair in SL_GIT_EXTRA
```

**`⚡` is the sharper one** because it is not locale-dependent: East Asian Width *Wide* means
two cells on every conforming terminal, so **the `auto` line is one column longer than the
other two modes** and the right-alignment shifts whenever the mode changes.

**Safe replacements that need no other change**: `»` for `⚡`, and `^v` or `+2-1` for `↑2↓1`.

---

## 17 · The activity region — what is happening, above the prompt

**A region between the transcript and the prompt**, present only while a turn is in flight.

```
✻ editing the parser's quote handling            4s · 312 tok
⎿ todo  2/5
  ◼ read the current implementation
  ◼ find where quotes are tracked
  ✻ add a depth counter
  ◻ update the tests
  ◻ run the suite
──────────────────────────────────────────────────────────────
❯ ▌
──────────────────────────────────────────────────────────────
» auto   ✦ qwen3-coder-next                localhost:8000   22:13
```

**With no todo it is one line**, and that line is the whole point:

```
✻ editing the parser's quote handling            4s · 312 tok
──────────────────────────────────────────────────────────────
❯ ▌
```

**And when nothing is running it is gone entirely** — no reserved rows, because an empty
activity region is a lie about a session that is idle.

### This resolves the tension between §9 and §5

**The transcript records what happened. The activity region shows what is happening.** Both
were competing for the same job and now they are not:

```
during    ✻ editing the parser's quote handling   4s · 312 tok    ← the region
after     ⬤ edit(src/interaction/parser/parse.ts)                 ← the transcript
          ⎿ [the diff]
```

**The pending entry (§5, entry 35) stops needing content.** A blank entry is fine if something
else is saying *waiting* — and the region is better placed for it, because **the transcript
scrolls and the region does not.** Scroll up to re-read something mid-turn and the pending
entry goes with it; the activity region stays.

**In Calcium's own shell the pending entry *is* the §9c card, and the two rulings do not meet**
(C23 I54, 2026-09-05). A shell has no turn — one verb runs at a time and the transcript is the
only surface — so there is nothing for a region to say that the card under the command row does
not, and the entry was measured as `blocks: []` with no indicator at all before this. Here, with
a turn in flight, the region says *what is happening* and each tool call's card says *what
happened to this call*: the card is a record of one call and the region is the turn, which is
exactly the split the paragraph above draws. What C23 built is the card's producer — `toolCallDoc`
appended at step 3, `readout` for the figure, the outcome written where settlement keeps the
header — and it is the code this app's pending-entry route will call rather than a second one.

### The checkbox glyphs, and the obvious pair is the unsafe one

```
◻  U+25FB  WHITE MEDIUM SQUARE   AMBIGUOUS pending      ← this column said narrow
◼  U+25FC  BLACK MEDIUM SQUARE   AMBIGUOUS done
⋅  U+22C5  DOT OPERATOR          AMBIGUOUS did not happen
✻                                narrow    in progress — the spinner, in the box position
```

**The dot is right because ink means progress here.** `◻` is none and `◼` is full, so anything
with *more* ink than an empty box reads as *more done* — which is why `⊠` and `☒` are wrong:
a filled box with a mark in it is the same direction as done. **A failed item needs less ink,
not different ink**, and `⋅` is less than an empty box.

**One state, not two.** Failed and abandoned look identical to a reader deciding what to do
next — both mean *this did not get done* — and **the reason is in the transcript**, which is
where a reason belongs. A second glyph would split a distinction the reader cannot act on
differently.

**`·` is ambiguous width — and so is `⋅`.** This paragraph used to call the dot operator the narrow one. Measured 2026-09-03: `src/presentation/blocks/glyphs.ts:400-402` records U+22C5, U+2218 and U+25E6 as `East_Asian_Width=Ambiguous`, *exactly like the character they were chosen to replace*, and `glyphs.ts:685` measures `◼ ◻` the same. **The width claim in the table above is wrong in all three rows**, so the checkbox-glyph decision has to be re-taken with the terminal's `ambiguousWidth` in hand rather than assumed — which is the same trap the full ramp hit.

**Filled against outline, not a tick in a box.** `☑` puts a small check inside a frame, and at
terminal font sizes that is a fine distinction where **`◼` against `◻` is unmissable** — the
whole cell changes rather than a few pixels inside it.

**And it degrades better, which is the real argument.** At 1-bit and at ASCII the difference is
a *shape*, not a mark inside a shape — so it survives with no colour and no fine detail, which
is F34's rule arriving in a glyph choice.

**The pair anyone would reach for first fails**: `□ ■` (white and black square) are
**ambiguous**, and `⬜ ⬛ ◽ ◾` are **wide**. The *medium* squares are narrow and the plain ones
are not, which is Unicode's own inconsistency rather than a design decision.

**The spinner in the box position is the good part.** It says *which item* precisely, and it
means the top line's spinner can be dropped when a todo is present — **the active item already
carries the motion**, and two spinners in one region is more movement than the state deserves.

### The ASCII form is the app's, not the glyph table's

**`[x]` is three cells and `☑` is one**, so it cannot be a glyph substitution — C09 I5 wants
1:1 by cell count or the measurer and the composer disagree about the same row.

**So the app picks the whole form at document-build time from `ctx.capabilities`**, which is
**the banner's precedent exactly**: *capability substitution covers glyphs the framework picks,
not text an adapter supplies.*

```
unicode    ◼ read the current implementation
ascii      [x] read the current implementation
```

**Both are measured as built**, so nothing disagrees — and the ASCII form gets to be the more
readable `[x]` rather than a single character chosen to satisfy a rule that does not apply.

### It is the prompt region's sibling, not a new kind of thing

**The prompt already varies in height** — `promptRows`, capped at `floor(rows / 2)`, not
scrolling, at the bottom. **The activity region is the same shape with different content**, and
that is the precedent rather than a new region concept.

**So it inherits the prompt's rules:** a cap, a window when it exceeds it, and the transcript's
height is what is left.

**And the cap has a better answer than windowing.** A todo list's useful state is *where am I*,
not *the whole list* — so when it does not fit it **collapses to the summary and the current
item**:

```
✻ updating the tests                             12s · 1.4k tok
⎿ todo  3/12  ·  ✻ update the router's contract rows
```

**Windowing a todo list would show items 4–9 of 12**, which is the arithmetic answer and the
wrong one.

### It is the chrome-as-blocks question, arriving from a third direction

`frame.ts`: *Calcium owns the structure — one chrome row each, fixed, never scrolling.*

**This wants a variable-height chrome region.** Six features already want the fixed one. **If
chrome is a block sequence, both are the same mechanism** — multi-row falls out, `b.row` gives
horizontal layout, and the activity region is chrome the app supplies rather than a fifth
region the framework grows.

**That is the nits' §"chrome row budget" with a seventh claimant, and the strongest one**,
because it is the only claimant that cannot be satisfied by a fixed row at all.

**The seam is the chrome seam**: `TuiConfig.chrome` already takes a `ChromeFn`. An activity
region is one that returns blocks or nothing, above the prompt rather than below the footer.

### Three rulings the walk owes

**Does the todo survive the turn?** A turn that ends with 3 of 5 done is a fact worth keeping
on screen — **so the region persists while the todo has incomplete items**, and the spinner
stops. That is the difference between *working* and *stopped mid-task*, and it is the one state
a footer cannot express.

**Where does the flavour text come from?** The model, or the harness? **The model** — it is the
one that knows *editing the parser's quote handling* rather than `edit(parse.ts)`. So it is a
field on the todo tool, or a separate `status` tool, and **an app-side decision rather than a
framework one.**

**And what happens on `⌃c`?** The turn cancels; does the region clear or hold its last state?
**Hold, with the spinner stopped** — same argument as the todo surviving: *you cancelled it
here* is the information, and an empty region says nothing happened.

### The todo comes from a tool, which keeps this app-side

**The model calls a `todo` tool and the harness renders its state.** So the framework needs to
know a region exists, not what is in it — the same relationship chrome already has, which is
what makes the chrome seam the right one rather than a new interface.

---

## 18 · The tools are the manifest, and that is the example's best argument

**One declaration, two callers.** `ToolDef` already carries everything an SDK tool schema
needs — a name, a summary, typed arguments each with their own summary, and flags. **So the
model's tools and the app's verbs are the same list.**

```
/read_file src/interaction/parser/parse.ts     ← the reader calls it
⬤ read_file(src/interaction/parser/parse.ts)   ← the model calls it
  ⎿ [the same code block, through the same adapter]
```

**Which means, for free:**

- **completion works on tool names**, because C19 sources candidates from the manifest and does
  not know or care that a model also reads it
- `/tools` is `/help` — the same partition, already grouped
- **`verb --help` documents a model's tool**, and the same sentence has to be good for both
- **one adapter per tool**, rendering the same result whoever asked for it

**This is the framework's central claim paying off in a way docker-tui could not show.**
*The manifest describes your app* is an assertion when the manifest has one consumer. With
two, and one of them a language model, it is a demonstration.

### The mapping, and it is nearly total

```
ToolDef.name          → the tool name
ToolDef.summary       → the tool description the model reads
ArgDef.name/type      → the schema — `int` → number, `string` → string, enums → a union
ArgDef.required       → required vs optional
ArgDef.summary        → THE PER-ARGUMENT DESCRIPTION, which is the half that decides
                        whether the model fills it in correctly
FlagDef.shellOnly     → NOT offered to the model — it selects a rendering, not an invocation
```

**`shellOnly` earning a second meaning is the good part.** It already means *this flag does not
reach the far side*; here it also means *the model may not set it*, **and both follow from the
same fact** — a presentation flag is the reader's choice about their own screen.

### The pressure this creates is the useful kind

**A bad `summary` now has two readers, and the model is the harsher one.** A human skims
`--help` and infers; a model fills the argument wrong and the failure is a tool call that does
the wrong thing.

**So the example makes the framework's own documentation field load-bearing** — which is the
sort of thing a second consumer is supposed to find, and it is exactly what docker-tui did to
`meta`, to `flags` and to the block vocabulary.

### One thing to check rather than assume

**Whether every `ArgDef.type` has a schema equivalent.** `string` and `int` are obvious;
whatever else the manifest allows may not map, and **a type the model cannot be given a schema
for is a tool it cannot call.** Measure the set before building the bridge — this is the class
that has been wrong eight times.

---

## 19 · Errors, which is the code that runs least

**Step 4 of docker-tui found three error documents where two had shipped and none had ever
run**, with 91 rows agreeing with all three. **The failure arm is the code that runs least and
is tested least, and its job is to work when everything else does not.**

Five failures, and they are not the same shape:

```
a tool throws              the model asked for something that failed
a tool is not declared     the model hallucinated a name
the connection drops       mid-stream, halfway through a reply
the model stalls           no bytes for N seconds
the budget exhausts        the loop stops with the task unfinished
```

### Each one, and the ruling it needs

**A tool that throws is a result, not an error.** It renders as the result block with an error
tone, and **the model sees it too** — that is the loop working: the tool failed, the model
reads the failure and tries something else. **Do not intercept it.**

```
⬤ run_command(npm test)
  ⎿ │ 3 failed, 115 passed
    exit 1 · 4.1s
```

**A tool that is not declared is the app's error, not the model's.** The SDK will not call an
undeclared tool, so this is a schema mismatch — **and it is a construction-time question**, not
a runtime one, if the tools are the manifest.

**A dropped connection leaves a half-streamed reply**, which is A4's ruling exactly: *the
partial stays with a notice.* **The transcript keeps what arrived** because losing it removes
the only record of what the model was doing.

**A stall is C23 §3b's, and the mechanism exists** (C23 I25): the driver patches a muted notice
onto a stream that has been quiet past a threshold, and replaces it with a record of the gap when
output resumes — never removes it, because `ViewPatch` has no delete. `src/shell/refresh.ts`
holds it (`STALL_MS`, a per-entry watched map, a re-arming tick, `resolveStall`), `execution.ts`
wires `watch`/`sawPatch`/`settled`, and `tools/mutate/runs/c23-refresh.mjs` mutates it. **This
paragraph said the opposite for a few hours on 2026-09-03**, on a measurement that does not
reproduce — `grep -rni stall src/` returns fifteen hits — and the correction is recorded in
`docs/notes/CALCIUM_NOTE_AUDIT.md` §1f. **The one real residue is the threshold**: `STALL_MS` is a
constant of the framework's, not a setting of the far side's. **The local-model case is the one
worth tuning**: a 4-bit 30B model on a warm cache can be quiet for ten seconds legitimately, so
the threshold should be the far side's rather than the framework's — a roadmap item, not a
missing mechanism.

**And the budget exhausting must say so**, which is §16's whole argument for `calls n/max` on
screen. **The turn ends with a notice naming the budget**, not with silence that reads as a
bad answer.

### The rule that covers all five

**Every one of these produces a document, and every document goes through the validator with
its failure arm first** — `documents.test.ts`'s discipline, which is how docker-tui closed
that class. **Three shipped error documents with `status: "error"` and no `error` field is what
happens without it.**

---

## 20 · The empty state, which is the first thing anyone sees

**R01's rule: an empty state is an invitation, not an apology.**

```
  agent-tui   ✦ qwen3-coder-next   effort high        localhost:8000   22:13

  Ask it something, or try:

    ⬤ /tools              what it can do
    ⬤ /model              what else this endpoint serves
    ⬤ read the README and tell me what this project is

───────────────────────────────────────────────────────────────────────────────
  ❯ ▌
───────────────────────────────────────────────────────────────────────────────
  » manual   ✦ qwen3-coder-next   effort high         localhost:8000   22:13
  ▐░░░░░░░░░░░░░░░░░░░░░░░░░  2%  1.1k/50k                            0 tok/s
  ~/code/calcium   ⎇ feat/c26   clean                          malachy   0m
```

**The context bar is not empty at 2%** — the system prompt and the tool schemas are already in
there, **and showing that is the composition bar's first useful moment**: a reader learns what
those segments mean before anything else fills them.

**And the third suggestion is a prompt rather than a verb**, because the thing a stranger does
not know is *what kind of thing do I ask it* — which no list of commands answers.

---

## 21 · The approval policy, which the footer states and does not explain

**The mode is a default; the policy is per tool.** The footer says `» auto` — that is the
posture, and it is what a reader needs at a glance. **What it does not say is that `run_command`
still asks while `read_file` never did**, and that is the thing that actually gates a call.

### Three axes, and only one of them belongs in the footer

```
the MODE        plan · manual · accept-edits · auto · skip     the session default
the TOOL        each declares whether it MAY be auto-approved
the CALL        this one, once — "yes" versus "yes, and stop asking"
```

**A tool declares its own ceiling.** `read_file` is safe to auto-approve; `run_command` is
arbitrary code and **an app that lets `auto` cover it has made a decision the reader did not**.
So the manifest carries it — `ToolDef.approval: "never" | "once" | "session"` — and **the mode
cannot raise a tool above its own ceiling.**

**Which means `» auto` is honest**: it means *auto-approve everything that permits it*, and the
tools that do not permit it still ask. **Without the ceiling, `auto` would be a lie in the one
direction that matters.**

### The third choice on every approval

```
⟩ Run `npm test`?
  ● no    ○ yes    ○ yes, and stop asking for run_command
```

**The third is the policy change, taken at the moment it is relevant** rather than in a
settings verb nobody visits. And it is only offered for a tool whose ceiling is `session` —
**an approval that offers a choice the ceiling forbids is a lie the reader will act on.**

**`/approve` lists the current state and sets it**, which is the same information reachable
deliberately rather than only in passing.

### And the mode is changeable from the footer

`⇧⇥` cycles it, because **the footer states the posture and is where you change it** — a
posture you have to find a verb to alter is one people leave wrong.

---

## 22 · What the walk owes

**Every component in this project has had both artefacts run against it, and the walk has
found something every time.** This design has not had one, and these are the rows it must
reach.

### The classification table — rules that both hold at rest

```
mode × tool ceiling            auto against a `never` tool — the ceiling wins, and the
                               approval must still be drawn
approval × streaming           an approval arriving while a previous reply still streams
approval × payload overflow    a 200-line patch, where the choices are load-bearing
activity region × cap          a 12-item todo, which collapses rather than windows
todo state × turn end          incomplete items with the spinner stopped
footer slot × far side         cost against a local model, effort against a model with no
                               reasoning, the call bar with a budget of 1
tools as verbs × shellOnly     a presentation flag the model must not be offered
```

### The sequence trace — event-mediated

```
⌃c during an approval          the ladder's rung against the popup's own resolution
⌃c mid-stream                  the partial stays; the activity region holds
a tool result arriving after   the model already moved on, or the turn was cancelled
the budget exhausting          mid-tool-call, not between calls
the connection dropping        after a tool call and before its result
a todo update arriving         while the region is collapsed to its summary
the window filling             mid-turn, so compaction happens inside a reply
```

**That last one has no ruling anywhere** — what drops when the window fills mid-turn, and
whether the reader is told. **It is the one row here that is a design question rather than a
check**, and it belongs to whoever builds A5.

---

## 23 · The one prerequisite, and it is Calcium's

**A7 and A8 both need somewhere to live that `frame.ts` does not currently have.**

> *Calcium owns the structure — one chrome row each, fixed, never scrolling.*

**The activity region is variable-height and the footer is three lines.** Neither fits, and
**the activity region is the claimant a fixed row cannot satisfy at all.**

**So roadmap #29 — the chrome row budget — is this design's blocker** (this said #28, which is prompt cursor-following and BUILT), and the option it wants
is **chrome-as-blocks**: multi-row falls out, `b.row` gives horizontal layout, and both regions
become chrome the app supplies rather than regions the framework grows.

**The claimants are counted once, in roadmap 29, and not here.** This paragraph said seven where §16 said six and the roadmap said four, five and six in three places; reconciled 2026-09-03 to **four roadmap consumers plus this design's two regions** — see roadmap 29. The activity region is the one that most wants the room, and it is the only one that cannot be satisfied by winning the argument about a single row.

---

## Buildable, with two things named

**Everything else is decided.** Step 0 verifies the far side, A1 through A8 have drawings and
rulings, the tools are the manifest, the errors are ruled, and the empty state is drawn.

**The two open things are named rather than hidden:**

- **the chrome seam** — Calcium's, roadmap #29 (not #28), and it gates A7 and A8
- **compaction mid-turn** — a design question with no ruling, belonging to A5

**And the drawings owe what every drawing in this project has owed**: every field name, every
count, every part type in §2 is a placeholder until the far side has been run. **Eight
drawings have been wrong that way. Step 0 is not a setup task.**

---

## 24 · What the harness has that the design did not account for

**Checked against the SDK rather than remembered.** Four change something and one closes §22's
only un-ruled row.

### `prepareStep` answers compaction, and it answers it mid-turn

**§22 named *what drops when the window fills mid-turn* as the one row with no ruling
anywhere.** The SDK has the hook: `prepareStep` runs **before each step**, receives the
messages that will be sent, and **a `messages` override becomes the base for every later step.**
`pruneMessages` is the built-in strategy.

**So compaction is per-call, not per-turn**, which is exactly the case §22 said had no answer —
and it means **the context bar can move inside a single reply.**

**Two things follow, and both are surfaces:**

**The reader must be told.** A turn where three earlier turns silently left the window is a
turn whose answer may be worse for a reason nothing on screen explains. **A notice in the
transcript, not a footer change** — the footer says *how full*, the transcript says *what
happened*, and dropping three turns happened.

**And `/context`'s breakdown becomes a history rather than a snapshot.** *What is in the
window* and *what was dropped to make room* are different questions, and the second is the one
a reader asks after a bad answer.

### `stopWhen` is a predicate, so `calls n/max` is one case of it

**The budget is not a number** — `stopWhen: stepCountIs(20)` is the default and it is one
`stopWhen` among many. A custom predicate makes **`calls 4/10` a lie**, because there is no
`max`.

**So the footer slot is `stopWhen`-shaped**: it renders `4/10` when the condition is a step
count and **falls back to `call 4` when it is anything else.** That is the provider chain
(§16) with a fourth instance — *same slot, different answer, and the slot does not care.*

### Tool-call repair is a surface nobody has decided

`experimental_repairToolCall` fires when the model produces a malformed call. **The harness can
repair it silently, show it, or refuse.**

**Show it, and quietly.** A repaired call is a fact about the model's reliability, and hiding
it means a reader debugging a bad session cannot see that the model has been producing broken
JSON all along. **A dim line under the step, not a notice** — it succeeded, it is not an error,
and it is worth knowing.

    ⬤ edit(src/parser.ts)
      ⎿ repaired · the model's arguments did not parse
      ⎿ ┌ parse.ts ─────

### The abort bug is a live hazard for A4

**`vercel/ai` #15430, still open**: when the fetch body is cancelled mid-stream, **`abortSignal`
does not propagate** — `onStepFinish` never fires, and `result.text` and `result.steps` **stay
pending forever.**

**A4 is `⌃c` mid-generation.** So the design's cancellation path hits an SDK bug where the
promise never settles, and **the harness would hang with its ladder rung consumed.**

**The remedy is the harness's, not the SDK's**: race the awaited promises against the abort
signal, and treat *stream ended without a finish chunk* as a failure rather than waiting.
**A4's frame-read must include the hang**, or the row passes on the path that works.

**And it is worth stating as the general rule**: *a cancellation that leaves a promise pending
is indistinguishable from a slow far side*, which is F15's class arriving from a dependency.

### Two smaller ones

**`ToolLoopAgent` versus `streamText`.** The class handles the loop, defaults to
`stepCountIs(20)`, and takes the same settings. **Take the class** — the design's whole
argument is that the loop is not ours, and reimplementing it with `streamText` is the shape
this example exists to avoid.

**And `experimental_sandbox` interacts with the approval ceiling (§21).** A sandboxed
`run_command` is not the same tool as an unsandboxed one, and **a ceiling of `session` may be
right for the first and wrong for the second.** So the ceiling is a property of the tool *as
configured*, not of its name — worth one sentence before the ceilings are authored.
