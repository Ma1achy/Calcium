# Commitment / invariant pairing audit

| Field | Value |
|---|---|
| **Type** | Audit record |
| **Covers** | C01–C25 — 355 invariants against 358 commitments |
| **Run** | 2026-07-29, after C08 |
| **Status** | Remediated. The findings below are the record; §Outcome says what was done |

> **The invariant ids in this document were renumbered on 2026-07-30, when SP2
> landed and twenty specs were renumbered into document order. The findings are
> unchanged; only the pointers moved.** This is a record of what was found on
> 2026-07-29 and it has not been revised — no verdict, count or diagnosis below
> has been touched. The ids were repointed so that a reader following one arrives
> at the invariant the sentence is about, which is the whole use of an audit
> nobody re-runs. `docs/archive/` was deliberately left as written, being
> superseded by construction; this document is not.

---

## Why

A spec's commitments and invariants must pair. **A commitment with no
corresponding invariant is a promise nothing enforces** — an invariant is what a
test cites, so a commitment without one is a claim that can diverge from the
implementation without anything going red. **An invariant with no commitment is a
rule nobody agreed to** — it constrains the build without appearing in the list
the spec presents as its contract.

C06 had the first kind, and it was load-bearing: commitments 12 and 13 (three
implementations; tests never run against the emulator) had no invariant while I15
named two of three. It had been that way since the initial import.

This pass reads both lists directly, spec by spec. No word-overlap heuristic — it
is too noisy across a corpus this size, and a partial answer is worse than a
stated scope.

---

## The headline

**The findings do not cluster by spec, by layer, or by age. They cluster by kind
of claim.** Four categories account for 71 of 103 findings, and each is a single
decision rather than a list of defects.

That is the useful result. A per-spec remediation pass would touch 24 documents
and fix the same thing 71 times. Four rulings — one per category — resolve most
of it, and the residue is 32 genuinely individual findings.

The second result is that **age does not predict quality**. C23, the largest spec
at 24/25, has two findings. C04, the second largest, has fourteen. C08, written
today with the pairing rule explicitly in mind, still has five. The discipline
does not apply itself.

---

## Counts

The per-spec counts recorded here were a working artefact of the 2026-07-29 pass
and are not maintained. The specs are authoritative for what they declare. What
this document records durably is the four categories, the two principles that came
out of them, and the citation findings below.

**Why the table went rather than being corrected.** It read as current, described a
tree that no longer existed, and nothing checked it — the class this project keeps
finding. The obvious remedy is the wrong one: "C13 declares eighteen invariants" is
a fact with no failure mode anyone would act on, so a checker would be a build gate
that fires on renumbering and means nothing when it does. A document that stops
making a checkable claim needs no checker, and that is cheaper than either
maintaining the table or enforcing it.

Roughly 84% of commitments and 87% of invariants paired cleanly at the time of the
pass. The audit is about the remainder.

**A01–A04 are excluded and should stay excluded.** They declare commitments and no
invariants by design: A03's SS and MG rules *are* the architecture's invariants,
in enforceable form, and A01's B1–B8 are the boundary's. Adding an invariant list
to an architecture document would duplicate A03. Recorded here so the next audit
does not read their zeroes as a finding.

---

## What a clean pairing looks like

Most pairs hold, and it is worth naming the shapes so the exceptions read as
exceptions.

**The commitment is the readable form of the invariant.** The common case, and the
one the two lists exist for: the invariant is precise enough to test, the
commitment is short enough to remember.

> C13 I3 "`EntryId`s are monotonic and never reused, including after eviction"
> ↔ C13 C5 "Ids are monotonic and never reused."

**One commitment summarises several invariants.** Legitimate and frequent — it is
the commitment list doing its job as a summary rather than a second copy.

> C01 C4 "`release()` is idempotent and emits the inverse of what was actually
> acquired, in reverse order" ↔ I2 (idempotence) + I6 (inverse, reverse order).
> C09 C9 ↔ I10 + I11. C22 C12 ↔ I4 + I5. C16 C4 ↔ I6 + I12.

**The commitment carries the reasoning; the invariant carries the rule.** The
healthiest shape, and what the best specs do consistently.

> C10 I6 states rank-order preservation over every pair; C10 C4 states it in four
> words. The paragraph explaining why neighbours are not enough lives in §, not in
> either list.

C20 and C23 are the models. C20 pairs 14 of 15; C23 pairs 24 of 25, across the
largest invariant set in the corpus.

---

## Category 1 — the module-graph invariant (10 findings)

Ten specs carry an invariant of the form "C*n* imports nothing from `terminal/`,
`presentation/` or above", and in **ten of them it has no commitment**.

> C04 I11 · C05 I15 · C07 I10 · C10 I12 · C13 I18 · C15 I12 · C18 I15 ·
> C19 I12 · C20 I15 · C21 I12

**Diagnosis: the invariant is right and the commitment is correctly absent — but
the silence should be deliberate and stated once.** These are enforced by `make
enforce` through A03's MG rules, not by anything a commitment could add. The
commitment list is about behaviour a consumer can rely on; the module graph is
structure the build enforces. A consumer does not care.

What is wrong is that this reads as ten accidental omissions rather than one
decision. **Recommended ruling: state in A02 that structural invariants are
enforced by A03 and carry no commitment, and leave all ten as they are.** One
sentence closes the whole category.

The alternative — adding ten commitments — produces ten lines nobody reads, in
ten documents, restating a rule already enforced mechanically.

---

## Category 2 — the naked threshold (11 findings)

A commitment names a constant, a timing or a limit; no invariant fixes it.

| Spec | Commitment | The number |
|---|---|---|
| C06 | C7 | `timeoutMs: 0` means unbounded |
| C07 | C7 | fallback tables capped at 8 columns, 2,000 rows |
| C13 | C6 | session cap 100,000 blocks |
| C14 | C2 | page movement is `viewportHeight − 1` |
| C16 | C9 | Ctrl-D at an empty prompt confirms exit |
| C19 | C4 | typing supersedes a pending request and clears the spinner |
| C19 | C7 | common-prefix acceptance; `Tab` twice always shows the menu |
| C21 | C3 | the shell is `$SHELL`, falling back to `/bin/sh` |
| C22 | C11 | identity refreshes every five minutes |
| C23 | C20 | a stream silent for 120 s gets a muted stall notice |
| C25 | C5 | unified below 100 columns, split above |

**Diagnosis: mixed, and the split is the finding.** Seven of these are behaviour a
test can assert and a change can silently break — C06 C7, C13 C6, C14 C2, C16 C9,
C19 C4, C22 C11, C23 C20. **The invariant is missing.** C22 C11 is the starkest:
five-minute identity refresh with expiry warning and inline re-login is
substantial behaviour with nothing asserting any of it.

Four are presentation or configuration detail that belongs in a § and not in
either list — C07 C7's exact column count, C21 C3's shell resolution, C25 C5's
breakpoint, C19 C7's menu policy. **These commitments overclaim slightly**: they
are §-level facts promoted to contract, and the fix is to demote them rather than
to invent an invariant.

Worth noting: **C03 C10 "the timer is injected, so no test sleeps" has no
invariant, while C06 I19 states exactly the same property for C06 and does.** Same
rule, two components, backed in one and not the other. C03 is the older spec.

---

## Category 3 — the borrowed claim (6 findings, 3 pairs)

A commitment restates a rule that belongs to another component, in a spec that has
no means to enforce it. **In every case found, the borrowing spec has no
invariant, and in two of three the owning spec does.**

**`/help` renders from the manifest, so documentation cannot drift.**
C16 C11 and C23 C13. Unbacked in both. Neither C16 nor C23 has an invariant for
it, and nothing else in the corpus does either — so a claim made twice is asserted
nowhere. *The invariant is missing, and it belongs to C23*, which is the component
that actually renders `/help`. C16's mention should become a cross-reference.

**`ErrorLike` needs only `message`.**
C04 C6 and C07 C6. Unbacked in both. C04 owns the type. *The invariant belongs to
C04*; C07 should cite it.

**Capability substitution is width-preserving / 1:1 by cell count.**
C04 C10 and C04 C14 — the same claim, twice, in one commitment list, with no C04
invariant. C09 I5 states it and C09 C5 commits to it. **This one is an overclaim,
and the clearest in the audit**: substitution happens in C09's renderers, C04
cannot enforce it, and C04 states it twice. *Both C04 commitments should narrow to
what C04 does own — that `Glyph` is a closed vocabulary, which is I6 — and cite
C09 I5 for the width property.*

The general shape is worth stating: a commitment restated downstream is a claim
made where it cannot be tested, and the duplication is what hides that neither
copy is backed.

---

## Category 4 — the decision-register orphan (7 findings)

A commitment restates an A01 §3 decision. The decision is authoritative; nothing
in the component asserts it.

| Spec | Commitment | Decision |
|---|---|---|
| C01 | C7 | `SIGCONT` re-acquires and reports; sets no flag | D53 |
| C01 | C18 | exit codes are 128 + signal: 130, 143, 129 | D54 |
| C02 | C9 | no information is carried by colour alone, anywhere | D29 |
| C04 | C17 | `meta` carries the invocation record | D49 |
| C04 | C20 | `patch` and `diff` are separate kinds | D50 |
| C10 | C12 | Prism's light variant is Atom One Light | A01 A.1 |
| C18 | C6 | app commands spawn as argv arrays | D18 |

**Diagnosis: two different things wearing one coat.**

D53, D54, D49 and D50 are behaviour of the component that states them, and **the
invariant is missing**. C01 C18's exit codes are the clearest — three specific
numbers, a deliberate rejection of a fixed 130, and nothing asserting any of it.
C04 C17 is the one this session already tripped over: `meta.argv` had no
invariant, which is part of why the transport divergence had nowhere to fail.

C02 C9, C10 C12 and C18 C6 are **overclaims**. D29 is a system-wide property C02
cannot enforce — C02 detects capabilities and has no view of what carries meaning;
the enforcement is C09's and C10's. C10 C12 is a palette-content decision A01
Appendix A already owns, and C10 restating it makes C10 the place someone would
change it. C18 C6 is C06 I3's rule. *These should become cross-references, not
invariants.*

---

## Category 5 — the unbacked invariant (46 findings)

The other direction. Grouped by what the invariant is about, since that is where
the pattern is.

**Structural (10)** — Category 1 above. Recommended: leave, and state the rule
once in A02.

**Purity and totality (9).** C05 I2 (`parseManifest` total), C09 I2 (`measure`
pure and total), C11 I7 (`planColumns` pure and total), C16 I15 (`activeTarget`
pure), C17 I2 (grapheme-aware throughout), C13 I11 (entries immutable), C05 I1
(manifest immutable), C14 I2 (`topRow` always in range), C15 I6 (no layer exceeds
its region).

*The commitment is missing, and these matter.* Purity is what makes half this
system testable, and a purity claim with no commitment is one a later change can
quietly cost. C09 I2 is the sharpest: `measure` being pure and total is what C14's
virtualisation rests on, and the commitment list does not mention it.

**Containment (5).** C12 I10 (a plot never emits outside its measured region),
C15 I6, C09 I18 (control characters stripped before measure and render), C25 I11
(expansion patches the document, never mutates external state), C22 I14 (C22 never
auto-logins).

*The commitment is missing.* C09 I18 is the one to look at first — it is the only
thing in the corpus preventing a tool's output from injecting escape sequences
into the frame, and it appears in no commitment list.

**The gapBefore pair (2).** C04 I25 and C09 I17 both state that `gapBefore` is
content applied by the sequence. **Neither has a commitment.** This is the residue
of `a333998`, which landed the rule as prose; invariants were added afterwards and
the commitment lists never caught up. *The commitment is missing on both sides.*

**Cross-spec restatement (4).** C08 I13 restates C06 I15; C25 I1 specialises C09
I1; C09 I8 (`measure` never reads `ctx.tick`) is committed to in **C24 C9**, not in
C09. *These are fine as invariants and the commitment correctly lives once — but
C09 I8 having its commitment in a different document is worth a cross-reference,
because C09 is where someone would look.*

**Genuinely missing (16).** The residue, listed per spec in the appendix. The two
worth naming here:

- **C08 I2 — recorded fixtures are replayed byte-for-byte.** C08's central
  mechanical claim, strengthened in this session's T2.7, and it appears in no
  commitment. *Missing.*
- **C19 I2 — completion never blocks input.** The responsiveness guarantee the
  whole async design exists for. *Missing.*

---

## Category 6 — the disagreement (1 finding)

**C17 C4 says newline has *three* bindings. C17 I12 says *at least two*.**

The only place in the corpus where a commitment and its invariant state different
numbers. §3 lists three. *The invariant is the weaker statement and should be
raised to three*, or the commitment softened — but they cannot both stand, and
today a test citing C17 I12 passes with two bindings while the commitment promises
three.

---

## The residue: individually-diagnosed findings

Findings not falling into a category above, with a per-finding reading.

| Spec | Finding | Reading |
|---|---|---|
| C01 C2 | "Capabilities are injected. C01 does not import C02." | Structural — Category 1's rule applies |
| C01 C10 | `SIGTSTP` releases, removes its handler, re-raises | **Invariant missing.** Real behaviour, tested nowhere by citation |
| C01 C11 | "C21 never calls C01; L4 orchestrates" | Structural, but *inverted* — C21 is not C01's to constrain. **Overclaim**; belongs to C21 or A02 Seam 4 |
| C01 C13 | `onFatal` is required, not optional | **Neither.** Enforced by the type; a third legitimate category, worth naming |
| C02 C10 | bmp unicode and image protocols detected but unused | Scope note, not a commitment. **Demote** |
| C03 C13 | C03 writes only sync-update markers | **Invariant missing.** It is the carve-out in C01 I1 and nothing states its other half |
| C04 C4 | View state that affects height lives in the block | **Invariant missing, and load-bearing** — `measure` purity depends on it |
| C04 C7 | `fill` is the default action; `exec` reserved | **Invariant missing.** D52's whole argument rests on it |
| C04 C11 | C04 owns the schema; every block variant declared here | **Invariant missing** |
| C04 C23 | `merge` never deletes a row; `replace` sheds one | **Invariant missing.** I9 covers merge's preservation, not deletion |
| C04 C24 | `replace` is wholesale; view state not carried across | **Invariant missing.** The exact complement of I9, which exists |
| C04 C26 | Container widths are declared per kind | **Invariant missing.** Measurement depends on it |
| C04 C29 | Constructors enforce shape invariants; C24's `b` delegates | Cites I1, but I1 is immutability, not construction. **Invariant missing** |
| C05 C10 | Version exposed, not enforced; missing tool degrades | **Invariant missing** |
| C05 C11 | `hidden` tools omitted from help and completion, still invocable | **Invariant missing** |
| C06 C14 | `cwd` read at spawn time | **Invariant missing.** C21 I10 states it for C21; C06 has no equivalent |
| C06 C15 | Emulated takes a handler closure; no app type referenced | **Invariant missing.** I1 covers C04 types only |
| C07 C6 | Category 3 | |
| C08 C7 | Mutating verbs mutate the world | **Invariant missing** |
| C08 C19 | §7's tests are tagged by half | Document-structure commitment. **Neither** — legitimate as-is |
| C09 C12 | Renderers emit SGR through `escapes.ts`; no Ink colour prop | **Invariant missing.** The first runtime L1 → L0-terminal edge, unasserted |
| C09 C13 | Ink's layout width must agree with `cells()` | **Invariant missing, and load-bearing for I1** |
| C10 C13 | Contrast validated against `bg` and `bgElev`, not `bgDeep` | **Invariant missing.** I3 says "at load", not against what |
| C10 C15 | Shipped tokens are A01 A.1's catalogue; T2.4 recomputes | **Invariant missing** |
| C11 C8 | Missing values sort last in both directions | **Invariant missing.** I8 covers stability, not null ordering |
| C11 C10 | Focus rendered here, owned by C16 | **Invariant missing** |
| C13 C10 | `clear()` empties transcript, leaves history alone | **Invariant missing.** A cross-store boundary with nothing asserting it |
| C15 C8 | No backdrop dimming | Design rationale. **Demote** |
| C16 C9 | Category 2 | |
| C17 C3 | Word motion uses three character classes | **Invariant missing** |
| C18 C4 | Delegated output is a `raw` block | **Invariant missing** |
| C18 C8 | Misses suggest at edit distance ≤ 2 | **Invariant missing.** A01 A.2 sets the cutoff; nothing asserts it |
| C22 C1 | Four required config fields | **Invariant missing.** C24 §8 has the severities; the arity is unstated |
| C22 C7 | Banner fetches non-blocking; input accepted first | **Invariant missing** |
| C24 C8 | `b.live` identical in transcript and pushed view | **Invariant missing** |
| C25 C9 | Unregistered language renders as plain text | **Invariant missing** |

---

## Appendix — unbacked invariants, per spec

C03 I9 · C04 I10, I11, I25 · C05 I1, I2, I4, I12, I15 · C06 I10 · C07 I10 ·
C08 I2, I10, I13 · C09 I2, I7, I8, I18, I17 · C10 I9, I12, I16, I24 ·
C11 I6, I7 · C12 I10, I13 · C13 I10, I11, I18 · C14 I2, I14 · C15 I6, I12 ·
C16 I15 · C17 I2 · C18 I15 · C19 I2, I12 · C20 I15 · C21 I12 · C22 I14 ·
C24 I10, I11 · C25 I1, I11

One worth flagging separately: **C10 I16** — `syntax` is consumed only by `code`
and `patch`, `spectrum` only by declared art, the list closed at two. It has no
commitment and it *is* lint-enforced, as A03 SS20 and SS21. A rule with
enforcement and no commitment is the mirror of the problem this audit is about,
and it suggests the enforcement suite should be read against the commitment lists
as a separate pass.

---

## Outcome

Five commits, one per category rather than one per spec — twenty-four documents
were not fixed the same way twenty-four times.

| | Ruling |
|---|---|
| **1** — module graph | Left as they are. One sentence in A02 §1: structural invariants carry no commitment, because they are enforced by A03 and consumed by no caller |
| **2** — naked threshold | Seven gained invariants, four demoted to § detail |
| **3 + 4** — borrowed and orphaned | One principle in A02 §1: **a spec commits only to what it can enforce**. Six borrowed claims and three register overclaims became cross-references; four own-behaviour claims gained invariants |
| **6** — the disagreement | C17 I12 now carries both halves: three bindings, at least two terminal-independent |
| **individuals** | C09 I18 (control characters) and C19 I2 (completion never blocks input) gained commitments |

**Category 5's residue was resolved by the structural fix rather than by a pass of
its own**, and that is the part worth recording. Requiring every commitment to
cite forced each of the 343 uncited ones to be read against its invariant list,
which surfaced the same gaps a per-finding pass would have — but exhaustively, and
with the failure visible rather than argued. Roughly thirty invariants were added
in the course of the annotation, each one a commitment that turned out to have
nothing to point at.

### The conclusion the audit turns on

**C03 commitment 10 and C06 I19 state the same property — that the timer is
injected, so no test sleeps — one as a commitment and one as an invariant, in two
specs, by the same author, within weeks.** Neither is wrong. Nothing decided which
it should be.

That is the best evidence in the corpus that the pairing was accidental rather
than designed, and it is why a remediation alone would not have been enough. The
two lists were parallel prose with nothing checking they agreed, so a commitment
could be added or an invariant deleted and no artefact noticed. Both specs now
carry the invariant and both commitments cite it.

### What stops it recurring

A03 **SP1**: every commitment cites an invariant `(I5)`, several `(I3, I4)`, or
another spec's `(→ C09 I5)`. A commitment with no marker fails `make enforce`; so
does a citation naming an invariant its spec does not declare, and so does a
cross-reference that does not resolve.

The check is exact because the audit produced categories and **the categories
became the markers**. A word-overlap heuristic could not have done this — a
commitment is the readable form, so it deliberately shares few words with the
invariant it summarises, and the noise floor sits above the signal. Doing the
reading by hand first is what told us which markers the template needed.

---

## Third pass — the enforcement suite against the citation graph

Run once the remediation above made the graph readable. **32 implemented rules,
both directions.** The second direction is clean: every rule id named in a spec is
implemented, except MG8, which C08 T2.6 already records as unfireable in a
single-package repo — documented, not silent.

**They do not cluster by rule kind.** Four of five MG trace, fifteen of
twenty-two SS, all three dependency rules, and the deferral rule. The MG/SS split
is even, so that hypothesis is dead.

**They cluster by subject: colour.** Six of the eight component-level gaps were
palette rules — SS17, SS20, SS21, SS36, SS37 and SS11's C10 half — pointing at
C09 I4, C10 I16, C10 I24 and C10 I12. That confirms the first audit from the
opposite side: C09 and C10 held the most unbacked invariants, five and four.
**The enforcement suite is densest exactly where the commitment lists are
thinnest**, and C10 alone had five rules aimed at it with three targeting
invariants no commitment named.

The likely reason generalises. Colour attracted lint rules *because* a violation
there is invisible at runtime — D29's whole point. The commitment lists were
written from the reader's view, where colour reads as implementation detail. The
enforcement went one way, the summary went the other, and nothing connected them
until the graph did.

### The two that were not missing commitments

**SS23 did not enforce what it claimed.** A03 declared it `C09 T2.9 · C17 T2.4`
while its scope was `src/presentation/blocks/` alone, so the editor's `.length`
was unpoliced and recorded as covered — SS26's failure one directory over. The fix
is **two rules, not a widened scope**: both forbid `.length` on display text and
the *remedies differ*, `cells()` in a block and a grapheme index in the editor.
A shared rule gives one of the two the wrong advice, and the advice is most of
what a scan is for. SS40 is C17's, with its own fabricated violations.

**SS35 enforced something nobody had agreed to.** One `Result` in the tree,
declared against two § references and no invariant. The rule is right — two shapes
under one name in one layer half compile and diverge quietly — so the fix is the
contract, not the rule. C04 I26, on the same footing as C01 owning "escape
literals live only in `escapes.ts`": C04 declares the type, so C04 owns its
exclusivity.

### A third kind of A03 defect

Not vacuous, not unimplemented — **pointing at the wrong invariant.** SS37
declared C09 I4 while its behaviour is C09 I15, and MG21 declared a § where an
invariant now exists. Both fire correctly and always did; both were mislabelled,
and every previous check read the label rather than the target. The citation graph
is the first thing that could tell the difference.

### Outcome

Ten remediated: four commitments for C09 I4 and C10 I12/I16/I24, one for C17 I2,
MG6's citation completed on C06 commitment 1, A03's two wrong declarations
corrected, SS23 split into SS23 and SS40, SS35 given C04 I26, and SP1 committed to
in A02 commitment 20 — the rule enforcing commitment-backing was not itself
commitment-backed.

All 32 rules now trace: 25 to a component commitment through an invariant, seven
to an architecture commitment (A02 1, 2, 20; A03 6, 15; A04 2, 3, 4).

---

## Fourth pass — citations that resolve against the wrong invariant

**Five known instances as of 2026-07-30.** Not found by a pass; accumulated by
people reading specs in order to implement against them.

| Where | Cites | Means |
|---|---|---|
| C22 §3, twice | C01 I17 | C01 I5 — `beforeRelease` runs once before the first release |
| C13 T1.7b, T6.11 | I14 | I13 — `rev` bumps on every applied patch |
| C13 T2.4 | I13 | I18 — C13 imports nothing from `terminal/` or `presentation/` |
| C14 I13 | C13 I13 | C13 I14 — the eviction marker is a real entry |

**This is the third pass's third kind of A03 defect, arriving from the other
side.** That pass found SS37 declaring C09 I4 for behaviour that is C09 I15, and
MG21 declaring a § where an invariant now exists — rules pointing at the wrong
invariant. These four rows are specs and tests doing the same thing. The class is
one class; only the citing document differs.

**A dangling reference is not inert — it arms itself when the number gets used.**
The C22 pair is the case with a date attached. C01 declared no I17 for months, so
both citations dangled and nothing looked; then the C25 commit added a real I17 —
the width rule — and the two silently became *resolving* citations pointing at an
unrelated invariant. A03 SP3 would have caught them on any day before that commit
and on no day after. What found them in the end was reading the renumber's diff.

**No mechanism, and one should not be built.** A citation resolving to the wrong
invariant is semantic. The only mechanical check available is word overlap between
the citing text and the invariant's — which is precisely the heuristic this audit
opens by rejecting, and for a reason that has not weakened: a commitment is the
*readable* form of an invariant, so it deliberately shares few words with it, and
the noise floor sits above the signal. Sixty false positives is the measured cost,
and it is paid to find a defect whose whole population is four rows.

**A qualified reference is immune.** `C01 I17` cannot silently become correct for a
different spec, because the spec is named. Bare ids are fine where a file's owner
is obvious from its path — `T3.7 (I5)` in `test/unit/capabilities.test.ts` is
unambiguous to a reader — and should be qualified wherever it is not. That is the
same conclusion A03 §3 reaches about SP3's boundary, approached from the other
side, and it is the only prevention either side offers.

**The detection method is the one this project keeps arriving at.** Both this class
and A03 §2's contradiction class surface when someone implements against the spec,
and by nothing else. Each has now been found that way three times or more. That is
an argument for the by-hand walk being a scheduled step in a component's plan
rather than a courtesy someone happens to extend — it is the only pass either
class gets.

---

## Confidence

Every finding was read directly from the two lists. Where a pairing is partial —
the commitment covers some of the invariant, or vice versa — I counted it as
paired and did not report it, so **the counts understate**. Judgement calls that
went that way include C02 C1/I1, C03 C11/I11, C05 C2/I15, C14 C7/I8, C23 C23/I23.

The categories are mine, not the specs'. Another reading might split Category 2
differently or fold Category 4 into Category 3. The per-finding diagnoses in the
residue table are the least certain part and should be argued with.
