# 00 · Authority

## The design language is normative for three domains

```
APPEARANCE    glyphs, marks, tones, grounds, spinners, bars, ramps, animation
INTERACTION   ownership, arming, activation, selection, copy, keys and chords
NAVIGATION    focus, scroll ownership, layers, dismissal, the tape
```

Its authoritative form is `docs/design/language/calcium-registry.json` (landed by
T00). The generated `calcium-design-language.html` is its projection. Rule IDs
(`R-XXX-NNN`) are stable forever; a superseded rule keeps its ID.

## Precedence

```
1  the registry, status: current            normative
2  the C-specs, AMENDED to agree with (1)    normative, and cite the R-IDs
3  the code                                   must agree with (2)
```

**Outside those three domains the repository is untouched by this kit.** Transport,
manifest, adapters, process runner, history, profiler — C04–C08, C18, C20, C21, C23,
C28 — keep their current authority.

## When the design contradicts itself — four tie-breaks

Ruled 2026-09-24. **These close a contradiction on the spot, without parking it.**
Each one supersedes the loser in the registry, or amends the C-spec that carried it,
and the entry that applied it names which tie-break it used.

1. **A structured registry record beats prose describing it.** Data outranks a
   sentence about the data, so the prose is superseded.
2. **A consistent picture beats a single rule that contradicts it.** When every
   fixture draws a thing the same way, the rule is superseded to match the figures.
3. **Where the repository ships something the registry does not record, record what
   ships.** This follows the six-spinners precedent.
4. **Carrier rules count carriers per FACT, not per effect.** This covers `R-COR-003`
   and `R-MOT-004`: an effect may sit on a single carrier when the fact it decorates
   has two elsewhere.

What stays with the person is anything these four do not decide, and any case where
two of them point opposite ways.

## The repository's own rule still governs HOW

CLAUDE.md: *"If the spec is wrong, change the spec first."* That is exactly the
mechanism. For every conflict:

```
1  amend the C-spec section: new commitment/invariant text, citing the R-ID
2  mark the replaced text superseded in place — do not silently delete it
3  change the code to the amended spec
4  tests cite BOTH the invariant and the rule:  T16.4 (I12, R-OWN-003): …
```

**A premise check is a check, not a veto** (CLAUDE.md). If a task's premise is wrong
against the current code, report the correction and build the corrected thing. If a
rule itself looks wrong, stop and ask — do not substitute a different design.

## What the registry does NOT override

- **Invariants about measurement.** `measure(block, width) == rows rendered` and the
  "appearance animates; geometry never does" rule stay absolute. The design language
  agrees with both; nothing here may weaken them.
- **The layering rules** (imports go down, L0 halves independent). Any task that needs
  an upward edge is routed through L4, per A02 Seam 4.
- **`make enforce`.** Every task leaves it green.

## Release — a rule is current only once it is released

**`released-baseline.json` seals every rule in the registry**: its content digest,
its status, and both supersession links. The registry's `meta.revision` names the
release, and the baseline's `registryRevision` equals it.

1. **Becoming current and being released are one commit.** `lint-immutable.mjs`
   fails when a `current` rule is absent from the baseline, so there is no window
   in which a normative rule can be rewritten under its own ID and every gate still
   passes.
2. **A release only adds.** A sealed entry is never removed, and its digest and
   links never change. Its status moves only along the legal transitions —
   `current` or `example` to `superseded`.
3. **A release bumps the revision.** `tools/design/release.mjs` is the one writer: it
   seals every rule the baseline lacks, refuses any edit to a sealed entry, and sets
   both revisions together. A registry edit that adds a rule is followed by a release
   in the same commit.
4. **The seal is outside the branch.** CI compares the baseline with `origin/main`'s
   copy (`tools/design/released-against.mjs`, `make released`): every entry sealed
   there is present, with the same digest and the same `supersedes`; its status moves
   only along clause 2's transitions, and its `supersededBy` only from empty, with
   the move to `superseded`. Entries may be added. A ref holding no baseline passes
   and says so; a ref that does not resolve fails, because a shallow clone that
   never fetched it would otherwise pass everywhere.

   **Why.** `lint-immutable.mjs` compares the registry with the baseline *in the
   same tree*, and its anchor is recomputable by the branch that edits both — the
   lint's own first line says *the anchor must be sealed externally*, and nothing
   did. Measured at `fda393d4`, in a copy: `R-SEL-005`'s digest set to zeros in both
   files and the anchor recomputed, and the lint printed *OK · 1287 released rules:
   content, status, LINKS, membership and revision intact* and exited 0.
   **Supersession is not a change in this sense**: it adds the successor and a
   link and removes nothing, and forbidding it would forbid clause 2's only way a
   released rule is ever replaced.

**Why, measured.** At revision 0.9 the baseline held 1 247 of 1 287 rules. The 40 it
lacked included 22 `current` rules — every `R-SEL-*`, `R-THM-002`, `R-THM-004`,
`R-THM-005`, `R-GLY-003` among them — because the gate only compared entries the
baseline already held. A reviewer rewrote `R-SEL-005`'s behaviour under the same ID
and every gate passed.

## Browser conformance — the page's own checks, executed

**The generated page carries its own conformance scripts, and a browser runs them.**
They set five flags on `<html>` — `specCheck`, `carrierCheck`,
`spinnerCapabilityCheck`, `cursorPhaseCheck`, `glyphGridCheck` — each to `pass` or
`fail`, measuring what only a layout engine knows: computed keyframes, `::after`
content, an animation's phase, a glyph's ink width. `make design-browser` loads the
page in the pinned headless Chromium (153.0.8010.12, `DEPENDENCIES.md` §Fetched outside
npm) and fails unless **every one of the five is present and reads `pass`, and the
page logged no console error and threw no uncaught exception**. The set of flags is
compared by equality, so a flag the page stops setting fails as surely as one that
reads `fail`.

**The runner proves it can see a failure before it is believed.** `--self-test`
loads fabricated pages through the same browser — one flag reading `fail`, one flag
absent, a `console.error`, an uncaught throw — and requires each to be refused, with
a clean page as the control.

**Text searches stay only where the subject is the page's own content.** A
`requireText` over a generated count, a claim, a rule id or a registry-derived
string checks what the page *says*, and stays in `check-calcium.mjs`. A search over
the conformance scripts' source — that a script contains `range.selectNodeContents`,
say — was standing in for running it, reads as coverage, and is removed now that
the script runs.

**Why, measured.** No browser had ever loaded the page. The first run, on
2026-09-27, found `glyphGridCheck` reading `fail` with an uncaught *work-unit ascii
overflows reservedCells: 67.734375px > 7.515625px*: the reservation probe wrote
`esc(glyph.ascii)` for a record whose ASCII half is state-resolved and holds no
character, so the one-cell slot held the nine characters of `undefined`. Every text
search passed, because the script's source was all present.

## Fixtures — derived from the page, never kept by hand

**`fixtures/` is a projection of the generated HTML, as the HTML is of the
registry.** `tools/design/fixtures.ts` writes it and `make design` runs it after
the builder. `make design-check` runs it with `--check`, which writes nothing and
fails on any difference: a fixture's contents, its file name, its recorded
dimensions or hash, a fixture missing, or a file present that the page does not
produce. `INDEX.json` is held to the same equality.

The derivation, measured against the page M1 landed:

1. **One fixture per section that has a terminal panel**, numbered by the
   section's position among all sections. A section with no `<pre class=term>`
   has none, and a section with two takes its first.
2. **The text is the panel's text.** Markup is removed and entities decoded.
   Each spinner slot — an empty `sp` span that CSS fills at runtime — is written
   as `✦`, because a fixture is a still. Trailing spaces are removed from every
   line, and trailing blank lines from the panel. The file ends with one newline.
3. **The file name** is the three-digit section number, a hyphen, and the first 46
   characters of the section's id.
4. **`INDEX.json`** records, per fixture: `file`, `section`, `id`, `title` (the
   heading's text), `cols` (the widest line, in cells, measured by `cells()`),
   `rows` (the line count), `sha` (the first 16 hex digits of the SHA-256 of the
   text without its final newline) and `ruleIds` (the section's `data-rule-ids`,
   then its `data-example-id`).

**Why, measured.** The 109 fixtures were committed once, at M1, and never
regenerated while the HTML was rebuilt thirteen times. Rebuilt by these rules from
M1's own page, 108 of 109 come back byte for byte; the 109th, the rule list, is 15
lines short, because M1 registered the `R-SEL-*` rules in the same commit. At
`c7158c22`, 11 fixtures no longer matched the page, among them the keys, the help
view and both rule lists.
