# prism-tui — a redesign pass is owed, and this is why

**Not scheduled. A note so the reason survives**, because the reason is that the framework
under it has changed shape since prism-tui was designed.

---

## What changed underneath it

**prism-tui's design predates most of Calcium's current surface.** Everything below landed
after it, and several of them would have changed its shape rather than added to it:

```
b.group weights · fixed cells · valign     side-by-side layout, and the banner proved it
scrollable containers (#46)                a bounded region that scrolls its own content
the activity region                        what is happening, above the prompt, not scrolling
the three-line footer                      budgets, posture, and a segmented bar
the popup, unified                         approvals · questions · peeks · completion, one layer
selection and semantic copy                y on a focused thing copies what it IS
the navigation model (C26)                 scopes, modes, elements, and a real focus story
themes and the background ruling           a painted surface, a high-contrast theme
persistence (44)                           a session that resumes
the plot family (#3)                       and the survey behind it
```

**Two of those are structural rather than additive.** The activity region and the popup change
*where things go*, not what is available — so a design that predates them puts the same
information somewhere else and reads as correct.

---

## The three questions the pass owes

### 1 · Is prism-tui a shell, a dashboard, or both?

**docker-tui answered *shell* and agent-tui answers *shell with a live region above the
prompt*.** `sys-tui` would answer *shell whose main verb shows a dashboard*.

**prism-tui has never had to choose**, and the choice decides everything else — whether a
training run is a verb that streams into the transcript, or a view you push into and live in.

### 2 · What is the transcript FOR, when the subject runs for six hours?

**This is prism's own problem and no other example has it.** docker verbs settle in seconds; an
agent turn takes a minute. **A training run takes a day**, and the transcript model assumes
entries settle.

**The activity region is part of the answer** and probably not all of it: *what is happening*
is one line, and a run has a loss curve, a step count, a queue position and four live plots.

### 3 · Which of the plot family does it actually need?

**The survey lists ~40 types and names consumers for a dozen.** prism-tui is the consumer the
ML package was justified by, **so it is the app that decides which dozen** — and a chart it does
not need is a chart nobody needs.

---

## Two things the pass should not re-derive

**It is the remote far-side consumer.** C06 I15's substitutability was verified against
fixture, subprocess and emulated; **prism is HTTP against a platform**, and that was always its
distinguishing contribution rather than the plots.

**And `b.live`'s `stream` arm was removed, not filled** (F78). A streaming reply is a `patch`
through the transport — `/logs`'s shape — so any design that says *stream* means *patch*.

---

## When

**After the roadmap.** Every feature listed above is either built or planned, and **a redesign
against a moving surface is a redesign done twice** — which is the lesson the last three
entries kept producing in miniature.

**And the same discipline applies as everywhere else**: read what its claims resolve to at HEAD
before trusting any of them. **prism-tui's design is old enough that most of its blockers have
landed with nothing watching**, which is the class that has now been found four times in one
session.

---

## The agent in prism-cli — and it is a client, not `@prism.agent`

**Two different things, and conflating them is what made this look blocked.**

```
@prism.agent      a DEPLOYED model dispatching tools inside Prism's execution
                  environment, reaching Vault-backed credentials. Deferred until an
                  authorisation story exists — correctly
an agent in the   a CLIENT on your laptop, holding YOUR token, calling prism verbs.
CLI               NO privilege boundary is crossed — it can do exactly what you could
                  do by typing, and nothing more
```

**The governance is already server-side.** `prism promote` hits the API with your token and the
platform decides. **An agent typing it gets the same 403 you would** — the server does not care
whether a human or a model composed the command.

**So the approval ceiling stops being a security mechanism** and becomes what it should be: a
UX guard against a model doing something surprising. **Which is what it is in `agent-tui` too**,
and the design says so.

**And the far side is whatever you point it at** — Ollama, an API, MCP. Step 0 of the
`agent-tui` design already covers verifying it.

### It is nearly free, because the manifest is the tool schema

**§18's finding**: `ToolDef` carries a name, a summary, typed arguments each with their own
summary, and flags. **So `/compare`, `/drift`, `/ps` and `/promote` are already tools** — no
tool authoring at all, and the CLI's verbs are the agent's tools by construction.

**And `shellOnly` already means *the model may not set this***, which is the same fact from the
same field.

### The part that makes it worth doing rather than a gimmick

**The results render as blocks, not prose.**

```
❯ which of these runs diverged and when?

⏺ /compare run-a run-b run-c --metric val_loss
  ⎿ ╭─╮      ╭╮
   ╭╯ ╰─╮  ╭─╯╰──╮   ╭──╮
  ╭╯    ╰──╯     ╰───╯  ╰──

⏺ run-c diverges at epoch 7 — the others stay under 0.05.
```

**A model that can call `/compare` gets a chart back rather than a table it has to describe.**
That is the thing no chat interface can do, and it falls straight out of tools-are-the-manifest.

**And the day-to-day value is the read side.** *Which runs diverged* · *compare the last five
sweeps* · *what changed between the promoted model and this candidate* — **constant, all reads,
all producing charts.** *Deploy xyz* is rare and deliberate; the analyst is what gets used.

### Which makes `agent-tui` worth building well

**It is not a demo that gets thrown away — it is the implementation prism-cli reuses.** The
part-to-block mapping, the activity region, the approval popup, the footer's context bar, the
`⏺`/`⎿` grammar: **all of it is the same code with a different manifest.**

**So the example's build order matters more than an example's normally would**, and the seven
sections of `AGENT_TUI_DESIGN.md` that are rulings rather than drawings are the ones prism
inherits.
