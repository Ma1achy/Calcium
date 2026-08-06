# Paste chips — the design, drawn

Pasted content becomes **a file on disk plus a chip in the prompt**. The file makes
`$EDITOR` and external tools work for free; the chip keeps the prompt legible and makes the
content addressable.

**And it unifies two things that looked separate:** a pasted blob and a dragged file are
both *a path with a kind*, so an image and a JSON dump take the same path through the
system.

---

## 1 — Storage

`stateDir` is already injected (C22 uses it for history, and theme persistence is assigned
to it), so there is a home already.

```
$stateDir/pastes/
    01-a3f9c2.json          written on paste, extension from the detected kind
    02-b7e1d4.png           a dragged file — REFERENCED, not copied
    index.json              id → { kind, bytes, created, origin, path }
```

**Two origins, and they must be distinguished:**

| origin | the file | if it disappears |
|---|---|---|
| `pasted` | **we wrote it** — ours to keep, ours to sweep | cannot; we own it |
| `dropped` | **the user's own path**, referenced not copied | the chip goes stale and must say so |

Copying a dropped file would duplicate a 4 MB screenshot for no reason and detach it from
the thing the user is actually editing. Referencing is right, and **a stale reference is a
state the chip has to render** — the empty-block rule again: a missing file must not look
like an empty one.

**Lifecycle: persistent, swept by age and count**, exactly as C20's history is. Session-only
would lose a paste the moment you reopened, and the whole point of a file is that it
outlives the moment.

---

## 2 — The chip in the prompt

```
❯ explain this error [#1 json · 47L] and compare with [#2 nginx.conf · 44L]
```

One private-use codepoint per chip, treated as **a single grapheme** by the editor and
expanded by the renderer — the same trick the image block's Kitty placeholders use, where
*the terminal sees ordinary text in its grid* and the meaning lives elsewhere.

So: the cursor steps over a chip atomically, backspace removes it whole, and `cells()`
reports its rendered width.

**Degradation is free** because the chip is text:

```
truecolour   [#1 json · 47L]        toned by kind
1-bit        [#1 json · 47L]        no colour, unchanged
ASCII        [#1 json 47L]          the middle dot goes
```

---

## 3 — Peek: focus a chip, see what it is

Cheapest tier, and **the peek's height is per kind, not a constant** — three lines is right
for text and useless for an image.

### Text and code — highlighted, because the highlighter is already there

```
   [#1] json · 47 lines · ~/.calcium/pastes/01-a3f9c2.json
   ┌
   │ {
   │   "Id": "7f3a2c14b9e0",              ← keys, strings and numbers toned
   │   "State": { "Status": "running", "Pid": 4471 },
   └ 44 more · ⏎ edit · e $EDITOR · x inline · ⌫ remove

❯ explain this error [#1 json · 47L] and compare with [#2 nginx.conf · 44L]
```

**Highlighting is nearly free here.** The peek *is* a `code` block showing its first lines,
so it uses the renderer that exists — and `code.ts` already **memoises on `(text, language)`**,
so peeking, editing and viewing the same chip tokenise once between them.

**And the language is already known**, because kind detection ran at paste time to choose the
file extension. Detection and highlighting want the same answer, so compute it once and store
it in the index.

### ★ Two grammars is not enough, and the objection does not survive measurement

`code.ts:31` is `createLowlight({ json, yaml })`, with the reasoning recorded:

> *Only the grammars actually needed: highlight.js's full set is most of the package's weight
> and none of its value here.*

**Correct when the consumers were `docker inspect` and an nginx config. Paste breaks it** —
someone pastes TypeScript, a stack trace, Python, SQL, and it renders flat while the chip
cheerfully says `ts`.

**Measured, because the objection is about weight and nobody had weighed it:**

```
highlight.js, whole package        9.3 MB    ← the headline, and misleading
its ES-module language dir         2.6 MB    ← 384 grammars, what actually gets imported
diff                               1.2 KB
python                             9.0 KB
typescript                        21.0 KB
24 MAINSTREAM GRAMMARS             180 KB
```

**180 KB.** For a package whose consumer is a Node CLI rather than a browser bundle, that is
noise — and grammars are imported individually, so nothing pulls the 9.3 MB in.

**Ruled: ship the mainstream set.** `json` `yaml` `diff` `bash` `typescript` `javascript`
`python` `go` `rust` `java` `c` `cpp` `csharp` `ruby` `php` `sql` `html` `xml` `css`
`markdown` `toml` `ini` `dockerfile` `nginx`. That is what people paste into a terminal, and
**a highlighter that flattens the language you actually use reads as broken**, not as
economical.

**And amend the comment rather than deleting it**, because its principle is still right — the
*full* 384-grammar set is genuinely most of the weight and none of the value. What changed is
that "actually needed" was measured against two consumers and now has more.

**Still expose registration**, and it matters more now rather than less: 24 covers the
mainstream and never covers a consumer's domain — Prism will want its own DSLs, and an
`agent-tui` user pastes whatever they work in. **Exported block kinds, unexported grammars**
is the same asymmetry as `CommandPolicy` being pluggable and unreachable, and it is what keeps
the shipped set honest — the weight of anything beyond mainstream becomes the *consumer's*
decision, which is what the original reasoning was really protecting.

**And this is a regression against a stated design, not a scoping choice.** C09 §4a builds
the whole `code` block around languages *being added*:

> *"Measurement ignores syntax entirely… a `code` block measures identically whether or not
> its language is registered, so **a language shipping tomorrow does not reflow yesterday's
> transcript**."*
>
> *"An unregistered language renders as plain text, not an error… readable today and
> **highlighted whenever someone registers it**."*
>
> *"The fallback is a fallback, **not a filter**."*

Those sentences are pointless under a fixed two-language set. `measure` ignores tokenisation
**so that** adding a grammar later is safe; unregistered renders as text **so that** it is
readable until someone registers it. **The design assumed more would arrive.**

Then `createLowlight({ yaml, json })` shipped with no registration path, so *"whenever
someone registers it"* has **no someone**. The spec's own promise is unreachable.

**Why it happened:** C09 was built when the only consumers were `docker inspect` (JSON) and
an nginx config (YAML). Two grammars satisfied every test, and **nothing in the suite could
distinguish "we ship two" from "we ship two for now"** — §4a's promises about future
languages are prose, which no rule checks. The same class as `/help`'s README claim and
F58's four documents with no measurement behind them.

**So this is phase-1-shaped, not a feature.** The spec commits to registration; the
implementation shipped without it, and a stated extension point that does not exist is the
gap this project has now found eleven times.

### Images — peek them, do not just describe them

**A three-line strip is useless for an image and a ten-row one is not.** A terminal cell is
roughly 1:2, so a 16:9 screenshot at three rows is about twelve columns wide — too small to
recognise. At ten rows it is legible enough to answer *"did I paste the right one"*, which is
the entire question a peek exists to answer.

```
   [#2] screenshot.png · 1440×900 · 284 KB
   ┌──────────────────────────────────────────────┐
   │                                              │
   │        the image, aspect-preserved,          │
   │        capped at ~10 rows                    │
   │                                              │
   └──── ⏎ full view · o open externally · ⌫ remove

❯ what is wrong with this [#2 screenshot.png · 1440×900]
```

**Kitty placeholders make this the same mechanism as the full view**, only smaller — the
placeholder grid *is* rows of ordinary characters, so a ten-row peek measures as ten rows and
nothing special happens.

**Without an image protocol** the peek renders the metadata and says so, exactly as the full
view does. Same degradation, one rule.

**The prompt still does not grow.** That is why the peek exists rather than expanding in
place: an inline expansion hits the prompt cap, the window shows the tail, and everything you
were typing scrolls off. **You would have made the prompt into a bad document viewer.**

## 4 — Edit: `⏎` opens C17 in a pushed view

**Nothing new is built.** C17 is already a full multi-line editor with readline bindings; it
is merely constrained to the prompt region. Put the same editor in a pushed view and it has
the whole screen.

```
┌ #1 · json · 47 lines ────────────────────── ~/.calcium/pastes/01-a3f9c2.json ┐
│ {                                                                            │
│   "Id": "7f3a2c14b9e0",                                                       │
│   "Created": "2026-08-01T14:22:01Z",                                          │
│   "State": {                                                                  │
│     "Status": "running",                                                      │
│     "Pid": 4471,                     ← the cursor, C17's own                  │
│     "ExitCode": 0                                                             │
│   },                                                                          │
│   "Config": {                                                                 │
│                                                                               │
└ esc save & back · ⌃c discard · e $EDITOR · ⌃s save ──────────── 6/47 · line 6 ┘
```

Same keys you already know — `⌃a`, `⌃e`, `⌃w`, `⌥b`, undo, redo — because **it is the same
editor**. `esc` writes the file and returns you to exactly where you were typing.

### And `e` hands off to `$EDITOR`, which is nearly free

The content is **already a file**, and the `/tty` handoff has been built since step 1 with no
consumer. So: suspend, run `$EDITOR <path>`, resume, re-read. That is how `git commit` and
`fc` have always worked, and it is three lines here.

**This is the answer for real work.** The in-TUI editor is for a quick fix; nobody wants to
restructure 400 lines of YAML in a pushed view when nvim is one keystroke away.

---

## 5 — Images: dragged in, viewed in place

**Terminals do not paste image bytes — they paste a path.** Dragging a file into a terminal
types its path, which arrives as an ordinary paste. So image support needs **no new input
channel**: detect a path, check the extension, make it an image chip.

```
❯ what is wrong with this [#2 screenshot.png · 1440×900]
```

`⏎` opens it, and the image block is **already designed** — `TUI_NOTE_images.md`, Kitty
Unicode placeholders, where measurement and scrolling come free because the placeholder grid
*is* rows of ordinary characters.

```
┌ #2 · screenshot.png · 1440×900 · 284 KB ─────────────────────────────────────┐
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐     │
│   │                                                                    │     │
│   │            the image, drawn by the terminal                        │     │
│   │            via Kitty placeholders                                  │     │
│   │                                                                    │     │
│   └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└ esc back · o open externally · ⌫ remove ─────────────────────────────────────┘
```

**Where the protocol is absent**, the same view renders the metadata and says so — *"no image
protocol; `o` opens it externally"* — which is B04's degradation applied to a capability
rather than to a colour.

**A thumbnail strip in the prompt is possible** (placeholders occupy grid cells, so 2–3 rows
would work) and it is **capability-gated fanciness**, not the default: it costs prompt rows
and only works on some terminals.

---

## 6 — The idea that makes chips worth more than a display trick

**Number them, and let verbs take them as arguments.**

```
❯ /config web [#2]
❯ /explain [#1]
```

`$_` already exists as a reference to the last *result*. **Chips are the same idea for
input** — and once they are numbered, they can come from anywhere, not just a paste:

```
[#3 ← /ps output]        a block already on screen
[#4 ← ~/nginx.conf]      a file, dragged
[#5 ← entry 12]          a previous result
```

**The prompt becomes a place where you compose from what is visible**, which no terminal
tool does. And because a chip references a *block*, a verb receives structured content
rather than a string — so the transcript can render what was sent as *what it is*.

---

## 7 — The rulings this needs

| | ruling |
|---|---|
| **Backspace** | deletes the whole chip. Atomic matches how the buffer sees it, and `⌃z` makes it recoverable |
| **Inline it** | `x` turns the chip back into text in the prompt. The honest escape hatch — no half-editable mode |
| **The record** | the entry stores `[#1 json · 47L]`, not 47 lines of JSON. **Better than today**, where `displayed` records the whole typed line |
| **A stale reference** | a dropped file that has moved renders as stale and says so. Missing must not look like empty |
| **Bracketed paste** | **check whether it is detected before designing the trigger** — chip-on-paste needs to know a paste was a paste rather than fast typing |

---

## 8 — What it costs, honestly

**Mostly assembly.** The pieces exist: `stateDir`, C17's editor, the pushed-view producer,
the `/tty` handoff, the image block's design, the `expand` action, the completion menu's
detail row.

**Genuinely new:**

- the sentinel-grapheme chip in C17's buffer, and the editor treating it atomically
- kind detection on paste (one parse attempt per candidate kind), **stored in the index so
  detection and highlighting share one answer**
- **the mainstream grammar set (180 KB, measured) plus exposed registration** — two grammars
  is a real constraint on this feature and its objection did not survive being weighed
- the store and its sweep
- chips as verb arguments, which is a manifest/parser question rather than an editor one

**The last is the one worth building even if the rest is cut.** Everything above makes the
prompt nicer; *chips as arguments* makes it something a terminal has not had.
