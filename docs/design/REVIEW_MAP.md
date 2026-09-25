# Review map — the design-language reconciliation, M1–M16

**What this is for.** `design/m1-land-the-language` is 353 commits over `origin/main`
(`2a312147`). This file cuts them into the sixteen MRs of the plan, plus the eight
fixes that landed between M6 and M7, so a reviewer can read one MR as one diff:
`git diff <base>..<tip>`.

## How each column was derived

Every column is measured from the history, not recalled.

- **Range.** An MR's commits are contiguous. Boundaries were set from commit subjects,
  then checked against the seam each MR introduced: the first commit adding each
  symbol in `MILESTONES.md`'s landing record (`git log -S`) falls inside that MR's
  range. Two exceptions:
  - **M4's seam predates the branch.** `SPINNER_SETS` was already there, so M4's
    boundary rests on its subjects alone.
  - **So does M15's.** `AskOptions` was already in `src/shell/local/registry.ts`.
- **Later.** Commits outside the range that finished one of the MR's named
  deliverables. Found from the same landing record and the deliverable record.
- **Specs amended.** Every `docs/components/C*` and `docs/architecture/A*` file
  changed between base and tip (`git diff --name-only`).
- **Rules closed.** `current` registry rules first cited in `src/` or `test/` within
  the range, **and** marked `covered` in `docs/design/language/RULE_LEDGER.md` at
  `21546bd7`.
- **Cited, still open.** Rules first cited in the range whose ledger state is `unmet`
  or `parked`. This column matters as much as the previous one. A rule citation in a
  test is not a discharge: `R-COR-003`, for instance, is cited in M4 and still unmet.

The rules column is a proxy, and it has a known limit. It attributes a rule to the MR
that first cited it. A rule whose covering evidence arrived later is still credited
to the first citation. The ledger row is the authority on what covers a rule.

## The map

| MR | Range (`base..tip`) | Commits | Scope | Specs amended | Rules closed | Cited, still open |
|---|---|---|---|---|---|---|
| **M1** | `2a312147..3deab7e2` | 1 | The registry, its HTML projection, the builder and checker, and `design-check` wired into `make enforce` | — | — | — |
| **M2** | `3deab7e2..7da59813` | 5 | Ten themes and the ink ramps generated from the registry; one-shots timed per effect; curated tables pinned | C04 C10 | R-MOT-005 R-THM-001 R-THM-002 | R-MOT-012 |
| **M3** | `7da59813..92cd1bb5` | 18 | Focus and selection become bands; `focusGround` and the precedence stack; the reserved focus column; status gains its detail part; `empty` gets a form | C09 C10 C11 C16 | R-THM-004 | R-FOC-004 R-SEL-006 R-STA-002 R-STA-003 R-STA-004 |
| **M4** | `92cd1bb5..263a10cc` | 6 | Disclosure leaves the focus mark; the design's marks win; `live` retires; `reservedCells`; the head mark carries the call's state | A03 C04 C09 C11 | — | R-COR-003 R-GLY-003 R-KEY-004 |
| **M5** | `263a10cc..965169c0` | 2 | One ownership ladder: rungs, four verdicts, and the footer's owner line | A02 C16 C22 C26 | R-COR-002 R-OWN-002 | R-HON-004 R-INT-009 R-KEY-007 R-OWN-001 |
| **M6** | `965169c0..ab1fd66d` | 3 | The keymap gains a profile axis and answers to the registry in two profiles; fifteen reservations | C16 | R-CAP-001 R-KEY-005 | R-KEY-003 |
| **pre-M7** | `ab1fd66d..82977960` | 8 | Fixes to M5 and M6: reserved routes made total; `⌥↑` routed to the transcript; bit 8 is Meta without the protocol and Super with it, so `⌘↑` gets its route back; the keymap generated from the registry rather than hand-written beside a gate; the PTY capture ends on its sentinel | C16 | — | — |
| **M7** | `82977960..e133f418` | 2 | `ownerEpoch`: the press arms, the release commits, a question guards | C16 C22 | R-OWN-003 R-PTR-003 R-PTR-005 | R-INT-008 |
| **M8** | `e133f418..78abc481` | 2 | `blocking` and `dismissal` split; the `panel` layer; layer order is scroll order; the wheel takes the innermost scrollable (M8b, same commit) | C15 C16 | — | R-QST-001 R-SEL-012 |
| **M9** | `78abc481..4c68e9d5` | 8 | No pushed views: the surface becomes `ChildSurface`; a run's detail expands in place; the view route and `kind: "view"` are deleted; the profiler's deck becomes an entry | C04 C05 C15 C16 C22 C23 C24 C25 C28 | — | R-INT-007 |
| **M10** | `4c68e9d5..24a5cae4` | 21 | `copyMode` becomes `nativeSelection`; semantic copy mode; per-kind copy text; the held view; rectangles; gestures belong to where they started; drag autoscroll | A01 A02 C03 C09 C14 C15 C16 C17 C22 C26 | R-SEL-003 R-SEL-005 R-SEL-009 R-SEL-015 | R-SEL-004 R-SEL-007 (parked) R-SEL-008 R-SEL-010 R-SEL-011 R-SEL-013 R-SEL-014 |
| **M11** | `24a5cae4..63a1b68b` | 5 | Carriers made of marks; the contrast pairing over the values the generator dropped. **Later:** `db8891b8` (the declaration gate), `6e1c9a24` (the carrier table) | A03 C09 C10 | R-TAB-001 | — |
| **M12** | `63a1b68b..6b0b012b` | 2 | The trust boundary: untrusted text escaped, with a coverage sweep over every escape class | C09 | R-TRU-001 | — |
| **M13** | `6b0b012b..7d99e049` | 9 | The prompt rule's label; a chip is one painted word; the streaming trail as a band; the chip preview as a projection. **Later:** `854dac3c` (`ChipInsert`, accepting a candidate into a chip) | C04 C09 C17 C22 | R-COL-003 | — |
| **M14** | `7d99e049..29a904dc` | 12 | The scrollbar; the tape slides a window where a row of peers sheds; focus pulls the viewport by the minimum, and nothing writes focus back | C04 C09 C26 | — | R-MOT-002 |
| **M15** | `29a904dc..ee26609d` | 11 | Blocking and replacing independent; the typed reply borrows the line and gives it back exactly; an inspection suspends a question | C17 C23 | — | R-QST-002 R-QST-004 |
| **M16** | `ee26609d..2ee05094` | 14 | The design fixtures mapped onto the golden frames; surfaces framed; the bar table; the colour axis. **Later:** the fixture framings interleaved through `20291d35`…`ce2a99b7` (15 commits, subjects ending *framed*) | C04 C09 C10 C11 C12 | R-PRG-001 R-TBL-003 | R-COL-004 R-FOC-001 |

## After M16 — `2ee05094..21546bd7`, 224 commits

Not an MR of the plan. This is the conformance and rulings work that followed the
first pass:

- the rule ledger and its resolution passes (SS66, `tools/rule-status.mjs`);
- the parked questions and their rulings;
- the §105 primitives: tree, split, form and toast;
- configuration provenance, the semantic node, linear rendering and notifications;
- the fixture framings credited to M16 above.

| Specs amended | Rules closed | Cited, still open |
|---|---|---|
| A03 C01 C02 C04 C05 C09 C10 C11 C14 C15 C16 C17 C19 C22 C23 C24 C25 C26 | R-COL-002 R-DEG-002 R-FOC-002 R-FOC-003 R-HON-002 R-INT-002 R-INT-004 R-INT-005 R-KEY-002 R-MOT-010 R-QST-003 R-REF-002 R-REG-002 R-SPC-001 R-TBL-001 R-TBL-002 R-TBL-004 | R-ACC-001 R-COL-005 R-COL-006 (parked) R-HON-008 (parked) R-MOT-001 R-MOT-003 R-MOT-004 R-MOT-008 R-MOT-009 R-MOT-011 R-NTF-001 R-PRG-002 (parked) R-SEL-016 R-STA-001 R-TBL-005 R-THM-005 (parked) |

**One ledger row is behind the tree.** `R-NTF-001` reads *owed: the notification
mechanism and display*. `21546bd7` built the mechanism. The watch that fills it is
parked 50, since ruled: `/watch` becomes a reserved framework verb. The row moves when
that lands.

## Totals at `21546bd7`

`node tools/rule-status.mjs` reports the ledger's own totals:

    119 current rules — 0 cited, 66 covered, 46 unmet, 7 parked, 0 owed

Of the 66 covered rules, 37 appear in the columns above. None was cited in `src/` or
`test/` before the branch. The other 29 have never been cited there: the ledger covers
them by a mechanism with another name, and its `covered` state names that subject
rather than an R-ID. In all, 36 current rules are cited nowhere in `src/` or `test/` at
`21546bd7`, the 29 plus 7 that are unmet or parked.
