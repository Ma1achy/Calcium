# What this drop is

Eight files from a design session. **Nothing here is scheduled and nothing here is a
commitment.** Each is either a design against a future entry, research feeding a planning pass,
or a holding pen.

**Unpack into `docs/design/`, `docs/notes/` and `tools/`** as the directory structure gives
them.

---

## The files

| file | what it is | status |
|---|---|---|
| `design/AGENT_TUI_DESIGN.md` | the agent harness example — 8 surfaces, 12 rulings | designed, unbuilt |
| `design/CALCIUM_MONITOR_EXAMPLE.md` | `sys-tui`, a resource monitor as a third example | a sketch |
| `design/PRISM_TUI_REDESIGN_NOTE.md` | why prism-tui owes a pass, and the three questions it owes | a note |
| `notes/CALCIUM_PLOT_PRIOR_ART.md` | eight terminal plotters surveyed, ~40 chart types | **RESEARCH, NOT A PLAN** |
| `notes/CALCIUM_BARS.md` | bar styles, and `ambiguousWidth` as a capability | proposal |
| `notes/CALCIUM_SPINNERS.md` | 24 spinner sets with intervals, 8 refused with reasons | proposal |
| `notes/CALCIUM_NITS_AND_IDEAS.md` | 11 items that are not entries yet | a holding pen |
| `tools/spinner.js` | a terminal playground for the spinner sets | runnable |

---

## Read these three warnings before acting on any of it

**Every drawing is a placeholder.** No far side has been run for any of it. **Eight drawings in
`DOCKER_TUI_SURFACES.md` were wrong that way**, and these are drawn under the same conditions.

**Two claims in these files were invented by the reviewer and do not exist**, both F161's shape —
*a mechanism named with a definite article and planned against*:

```
the `⎿` slot's four consumers    two at most, and neither buildable
the "selection readout"          does not exist in any file in the repository
```

**Both are corrected in place. Assume there are more**, and run the where-is-this-written check
before building against any named mechanism in here.

**And `CALCIUM_PLOT_PRIOR_ART.md` lists ~40 chart types and names consumers for about a
dozen.** **A chart with no consumer is F21's shape**, and that entry could produce forty of
them. Its header says plan-it-first; that is the load-bearing sentence in the file.

---

## What is deliberately NOT in this drop

**`CALCIUM_ROADMAP.md`.** The reviewer's copy is stale — it does not have this session's status
column, the F169 citation repairs, the RS8/RS9b anchors, or any entry corrected since. **Dropping
it would clobber all of that.**

**Three roadmap edits are owed instead, as edits:**

**Entry 38's status.** `height: "fill"` is no longer blocked — row 2's producer-context ruling
granted height, bounded, non-null exactly when `isViewInvocation` is true. **And `b.group`
already ships the container** with equal shares only, which the entry is written as though it
does not.

**A new entry — motion and measure sets.** Spinners, bar styles, and **a categorical palette,
which is a third axis beside `Tone` and the change axis**: *n distinct things, no order, no
judgement.* `Tone` structurally cannot carry it. **The palette is the freeze-relevant half**;
the sets are additive. `CALCIUM_SPINNERS.md` and `CALCIUM_BARS.md` are its content.

**And the heatmap's degradation is unsafe.** The plots section plans `colour → ░▒▓█ at 1-bit`
and **`▒ ▓ █` are all EA=Ambiguous** — so the degradation designed for the highest-value plot
doubles in width wherever ambiguous is treated as wide. **The braille density ramp is the
replacement and it is better**: `⠀ ⠄ ⠆ ⠖ ⠶ ⠷ ⠿ ⣿` — eight levels against four, every one narrow.

---

## The finding that runs through all of it

**Ambiguous width is a capability, not a refusal.**

`East_Asian_Width=Ambiguous` means **the terminal decides** — one cell in a Western locale, two
in a CJK one. **So it is a property of where a glyph is drawn, which is what a capability is**,
and `TerminalCapabilities` has no field for it.

**It has now bitten four places, one of them shipped:**

```
RAMP_UNICODE ▁▂▃▄▅▆▇█    ambiguous in ALL EIGHT, in `sparkline`, which C11 calls for a
                          TABLE CELL — so a table's columns stop aligning, not a chart
                          looking odd. `sparkline.ts` says "every ramp glyph is one cell wide"
the heatmap's ░▒▓█        planned, three of four ambiguous
every ASCII chart library ┼ ─ ╰ ╭ — box drawing is ambiguous throughout
`▌` and `⚡`              in `claude-statusline`, and `⚡` is WIDE rather than ambiguous,
                          so it is two cells on every conforming terminal
```

**`ambiguousWidth: "narrow" | "wide"`, declared rather than detected** — no probe C02 would
allow, and **it is a setting the user already has** in tmux, iTerm2, Konsole and WezTerm.

**It unlocks most of what has been refused**: the eighth-blocks and sub-cell fill, the
eight-level vertical ramp, the shade ramp, and **box drawing — which means connected line charts
with proper joins.** Braille becomes the fallback rather than the ceiling.

**It is freeze-relevant**, so it belongs before publication and it belongs in the same ruling as
the categorical palette.
