# The product: an agent TUI that looks and works like the design

## Step 0: close out the current work cleanly

Do this once, before anything else, as its own PR. Nothing from the old process carries on.

1. **Stop everything running.** Kill every round-5 lane, queued gate chain and mutation run.
2. **Keep only what's finished.** A lane already green on the current batch 4 tip gets
   landed on `design/review-fixes-m10-m12`. Any other lane: push it as `archive/<lane>`
   and drop it. Don't rebase or re-gate anything further.
3. **Collapse the stack into one PR.** `design/review-fixes-m10-m12` contains everything in
   #61, #62, #63 and #66. Before merging:
   - remove committed junk if any is left (`captures/`, `out/`, `examples/docker/FINDINGS.md`
     and other agent logs, zips, scratch scripts, backup files);
   - archive the bookkeeping: move FINDINGS, TRIAGE, RULE_LEDGER, MILESTONES, REVIEW_MAP and
     similar records to `docs/archive/`. Keep `docs/design/PARKED_QUESTIONS.md` (the design
     rulings) where it is;
   - replace `CLAUDE.md` with `CLAUDE.lean.md` (the old one goes to
     `docs/archive/CLAUDE.v1.md`), add this brief as `docs/PRODUCT_BRIEF.md` and
     `flow-probe.py` as `tools/flow-probe.py`;
   - if the immutability lint would fail on unsealed rules, run the release seal once;
     otherwise skip it;
   - run the full suite **once**. Fix only genuine failures; don't chase load timeouts.
   Then tag the branch tip as `archive/design-language-history` (the full history stays
   available), open one PR from `design/review-fixes-m10-m12` into `main`, and
   **squash-merge** it so none of the old blobs reach main's history.
4. **Close the old PRs.** Close #61, #62, #63 and #66 with a one-line comment: "Included in
   the squash-merge of #NN." Close #64 (review instruments; obsolete). For #65, rebase it
   onto the new `main` and merge it if it's small and green, otherwise close it with a note.
5. **Clean up branches and worktrees.** Delete the review-fix branches, `backup/*` branches
   and `out/wt/*` worktrees made by the batch work. List any other unmerged branch (the old
   `feat/*`, `docs/*`, `gallery/*` ones) with a one-line description of each, and ask
   before deleting those.
6. **Set up the fast loop on the new `main`**: `make check-fast` (under two minutes), the
   full suite, goldens, e2e and design checks in GitHub Actions on push, and no pre-commit
   enforce hook.
7. **Report** the end state in one short table: what merged, what was archived, what was
   deleted, and the CI status of `main`.

## What we're building

`examples/agent`: a terminal app for working with an AI agent, built on Calcium, that looks
and behaves exactly like the design. Calcium (the framework) exists to make this app
possible. When the app can't produce something the design shows, the fix goes in the
framework, so every Calcium app gets it. Agent meaning (tools, approvals, the queue,
subagents, postures) lives in the app; everything generic lives in the framework.

The app runs against a **scripted fake agent**: scenario files that stream answers and
reasoning, call tools (succeed, fail, get cancelled, run long), spawn subagents, ask
questions (choices, inspect, typed reply), hit model errors, and get compacted —
deterministic, with no LLM. Every screen in the design must be reachable by a scenario.

## The design

Everything the app should look like and do is in `docs/design/language/`:

- **`calcium-design-language.html`**: the design. Open it in a browser and read all of it.
  Its 111 sections show the screens, states and interactions this app must reproduce.
  **The picture is the target**: where prose and pictures disagree, match the picture.
- **`calcium-registry.json`**: the same design as data — themes and colours, glyphs and
  their ASCII fallbacks, key bindings per terminal profile, spinners, bars and ramps. Code
  takes these values from the registry; never hand-copy them.
- **`fixtures/`**: the HTML's specimens as plain-text frames (110). Screen comparisons check
  against these. Regenerate them from the HTML if they're stale; never edit by hand.
- **`docs/design/PARKED_QUESTIONS.md`**: the design rulings already made (for example `⏎`
  always sends, the question guard's quiet window, chosen = mark plus bold, `⌥O` opens a
  chip). **These still stand.** Only the old process rules are gone.

Some sections apply everywhere rather than to one milestone: §1–2 (the contract and the
primitives), §6 (the mark vocabulary), §42 (widgets), §74 (weight), §91–93 (state tables
and the rules the design broke in its own examples), §110–111 (the records and the rules,
condensed). Read them before milestone 1. §87–88 are history and can be skimmed.

Before starting a milestone, list every HTML section and fixture it covers in the PR
description. That list is the milestone's definition of done.

## How it must feel

- **You always know where you are.** Wherever the keyboard goes, focus is drawn, and the
  footer shows that place's keys. Nothing moves focus invisibly.
- **Keys do what they say, every time.** No dead keys. `esc` backs out exactly one level.
  Everything works in a plain terminal; the kitty keyboard protocol only adds shortcuts.
- **The cursor shows where typing goes**: visible and blinking only where text goes,
  hidden everywhere else.
- **Nothing jumps.** Streaming, animation, arrivals and resizes never move what you're
  reading or lose your place. Scrolled back while a turn runs, you stay where you are.
- **It's honest.** Nothing silently does nothing: refused keys say why, failures say what
  failed, empty and stale states say so.
- **It looks like the design** at 24-bit, and degrades as the design shows at 8-bit,
  4-bit, 1-bit and ASCII.
- **It's light.** Idle means zero CPU and no redraws. Typing and scrolling feel instant.

## Targets

- **Terminals:** kitty, Ghostty, WezTerm, iTerm2, Apple Terminal, xterm, and inside tmux and
  over SSH. Every feature works on a plain terminal; the enhanced profile adds chords only.
- **Sizes:** from 40 columns (§23) up to very wide; height from 16 rows.
- **Capabilities:** 24-bit, 8-bit, 4-bit, 1-bit, ASCII, ambiguous-width narrow and wide,
  reduced motion, `NO_COLOR`, and linear mode for screen readers (§107).
- **Performance:** idle uses no CPU and draws no frames (motion off too); a keypress is
  drawn within one frame; streaming at speed doesn't stutter; a 5,000-entry transcript and
  a 10,000-line log stay smooth.
- **Trust:** model, tool, file and log text can never send terminal control sequences;
  controls and bidi characters are shown, not obeyed (§107, R-TRU-001). Copying never
  copies raw control bytes.

## How progress is proven

For every milestone:

1. **Flow tests**: run the app in a pseudo-terminal, press keys and click, and assert on the
   screen — where focus is drawn, what the footer says, where the cursor is and whether it's
   visible, what changed. At 24-bit and 1-bit, at 100×30 and 40×20. (`tools/flow-probe.py`
   is the pattern.)
2. **Screen comparisons**: drive a scenario to each state the milestone's sections show and
   compare with the fixture: text, glyphs, and which cells carry colour and ground. Any
   deliberate difference is listed with its reason.
3. **A recording** (asciinema or GIF) of the milestone's flows.

A milestone is done when all three exist and pass. Nothing else counts as done.

## Fix the spaghetti and the architecture as you go

The app layer is a mess: `src/shell/construct.ts` is 5,800 lines, about 4,800 of them one
closure holding keys, mouse, focus, footer and questions, and `src/` carries 13,000 spec and
finding citations and 430 "deferred / owed" comments. Every bug traced so far lives there.
Cleaning it up is **part of every milestone**, not a separate project.

**Where it should end up:**

- **One source of truth per concern.** Focus, ownership, the prompt, the transcript and
  open questions each live in one small store. Nothing keeps its own copy.
- **Everything visible is derived from state.** The footer's keys come from the keymap and
  the current focus target; focus is drawn in one place from the focus store; the cursor's
  position and visibility come from who owns typing. No renderer decides these for itself.
- **One keymap, generated from the registry**, with handlers looked up by action. No key
  literals scattered through the code.
- **Small modules with one job each**, under `src/app/` (shell, focus, footer, prompt,
  transcript, questions, selection, …), no file over about 400 lines. `construct.ts`
  ends as a thin file that plugs them together.
- **Layering holds**: lower layers never import upper ones.

**How to get there:**

- **Extract before you fix.** Before changing anything in `construct.ts`, `session.ts`,
  `chrome.ts` or `keys.ts`, move that piece into its own module, then fix it there.
- **Fix causes, not symptoms.** When a bug comes from the structure (state held twice,
  a decision made in two places, a special case papering over a gap), fix the structure,
  and say so in one line in the PR.
- **Delete what a fix replaces, in the same change**: duplicate paths, special cases a
  general fix covers, dead code, and every "deferred", "parked" or "owed" comment. If
  something isn't built, it isn't in the code.
- **Strip spec and finding citations** from any code you move. Comments explain a
  non-obvious *why* in a line or two, nothing more.
- **Report `construct.ts`'s line count before and after every milestone.** It must shrink.
- **Tests**: keep the ones that test behaviour; delete tests of code you removed; don't add
  tests of internals. Flow tests and comparisons are the gate.
- **The `plots` and `docker` examples keep building and running throughout** (CI checks
  it), even before they're restyled.

## Milestones, in order

Sections are the HTML's (§N). Each milestone builds on the one before; do one at a time.

1. **The shell** — §3–5, §15–19, §30, §69, §73, §89, §103.
   The five regions; the prompt between its labelled rule; the footer showing the current
   owner's keys; the cursor; visible focus wherever focus goes; the ownership ladder. Two
   root causes are already known from the code:
   - `⇧⇥` focuses a whole entry (`focusTranscript` → `enterLiveBlock(id, null)`) and
     nothing draws a whole-entry focus; focus is only painted inside individual block
     kinds, and twelve paint none. **Draw focus centrally**: one place draws the mark and
     ground for whatever is focused; kinds only report their elements' geometry.
   - The footer chooses keys by ownership rung, and the prompt and transcript share the
     "scope" rung. **Choose the footer's keys by the actual focus target.**

2. **The prompt** — §8, §11–12, §46, §64, §99, §101.
   Typing and editing, multi-line, undo, history (`↑`/`↓`, search, ghost text), `⇥`
   completion and its menu, `@` mentions, pasted content as chips with their preview, and
   a sent message in the transcript.

3. **Transcript navigation** — §16, §20–22, §53, §56–57, §60, §67, §82, §104.
   Into the transcript and back, between entries, into blocks and out, `esc` one level at a
   time, key repeat, page scroll from anywhere, the scrollbar, the help view, the mouse and
   its six rulings, `⌃C` in every context, resize, and staying put while scrolled back
   during a turn.

4. **A turn** — §24–26, §30–41, §50, §66, §102.
   Streaming with its trail, reasoning and thinking escalation, the agent's mark, spinners
   chosen by verb, tool calls running / succeeded / failed / cancelled with their branches,
   the tool-result gallery, expanding results in place, tool failures against model
   failures.

5. **Content rendering** — §43, §49, §54–55, §76–78, §94, §96, §100, §109.
   Markdown answers (headings, lists, quotes, code), syntax highlighting, diffs, tables,
   links, status blocks, wrapping and truncation, international text.

6. **Questions** — §28–29, §51–52, §61, §71, §98, §106.
   Approval replacing the prompt, completion, inspect without answering, a typed reply,
   the guard against keys already in flight, a second question waiting, expiry, permission
   postures, and the six composition cases.

7. **Selection and copy** — §44, §58–59.
   Semantic copy mode (caret over prose, blocks, rectangles), native selection, find, and
   copies reaching the system clipboard with a clear message either way.

8. **Progress, live content and the agent's world** — §7, §9, §13–14, §27, §33–36, §45,
   §65, §95, §97.
   Progress bars and meters, the context composition bar, live plots (3D controllable from
   the keyboard once inside), the live terminal block, subagents and the tape, the queue,
   review of what auto wrote, compaction, transient panels, and what happened while you
   were away.

9. **Settings, edges and degradation** — §10, §23, §47–48, §62–63, §68, §70, §72, §75,
   §79, §90, §105, §107–108.
   Startup and resume, `/colour`, `/config`, themes including both high-contrast ones, every
   edge state, latency, refusals, the palette, toasts, forms, trees and splits, linear
   mode, capability degradation, and 40 columns.

10. **Prism and the other examples** — §80–86.
    The Prism screens (`/ps`, submit, logs, the six-hour run, its plots) as
    `examples/prism`, then restyle `plots` and `docker` to match.

## Out of scope for now

A real LLM backend, real Prism integration, and publishing to npm. The fake agent and the
fixtures are the whole world until milestone 10.
