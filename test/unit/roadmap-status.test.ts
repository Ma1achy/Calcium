// `tools/roadmap-status.mjs` — the status column's own fixture.
//
// **The column is 45 rows of hand-maintained claims about the tree**, which is
// the population `UNCONSUMED_MEMBERS` and `BUILDER_OMISSIONS` compare by equality.
// The verifier earned its place before it existed: re-running the pass that wrote
// the column found row 17 citing `logs` in `blocks/kinds/simple.ts`, where its
// definition is not. **Without these rows that catch happens once.**
//
// Two arms carry the weight, and the second is the one that matters.
//
//   RS2 — a claim that no longer resolves. The wrong-file case, replayed.
//   RS4 — an entry in none of the three sets. The unchecked population is the one
//         that quietly grows, and *an OPEN nobody verified reads exactly like one
//         somebody did*. A verifier that only checked rows carrying a symbol would
//         certify whichever subset chose to carry one.
//
// RS6 is group 9's ruling applied to this instrument: scanning zero rows is very
// fast, exits 0, and prints `45 of 45 resolve` over an empty set. `scan-cost.mjs`
// needed the same row for the same reason.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROADMAP = readFileSync("CALCIUM_ROADMAP.md", "utf8");
const DIR = mkdtempSync(join(tmpdir(), "roadmap-status-"));

/** Run the instrument against a roadmap, real or fabricated. */
function run(text?: string): { ok: boolean; out: string } {
  let file = "CALCIUM_ROADMAP.md";
  if (text !== undefined) {
    file = join(DIR, "fixture.md");
    writeFileSync(file, text);
  }
  try {
    return { ok: true, out: execFileSync("node", ["tools/roadmap-status.mjs", "--file", file], {
      encoding: "utf8", stdio: "pipe",
    }) };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * The Order row of a confirmed-OPEN entry, **derived rather than quoted**.
 *
 * **Fourth anchor expiry in one session, and the third for RS8 alone.** It sat
 * on 46 until 46 shipped, then on 7 until 7 was ruled, then on 33 until 33 was
 * built — and each time the comment said *any literal from the list is a hostage
 * to the list changing* and the fix quoted a different literal. RS9b's fix is the
 * one that generalises: take the subject from the tool's own report and splice
 * positionally.
 *
 * The circularity is only in *which* entry is picked. What each row asserts —
 * that the arm fires, that it does not fire on a true claim — is independent of
 * which one the report named.
 */
function openRow(text: string): Readonly<{ at: number; end: number; line: string }> {
  // **Fifth expiry, and the previous fix carried the very hostage it named.**
  // It derived the id from the report's *blanket-claim* suffix — the subset of
  // confirmed-OPEN entries whose clause names no symbol — and this session
  // emptied that subset by giving 26, 32 and 37 clauses of their own. A
  // derivation from a list that is allowed to be empty is a literal by another
  // name. So the id comes from the population itself: the first entry the
  // confirmed-OPEN paragraph discusses. That set is non-empty by RS4's rule.
  const id = confirmedOpen(text)[0];
  expect(id, "the confirmed-OPEN paragraph discusses at least one entry").toBeTruthy();

  const from = text.indexOf("## Order\n\n```\n") + "## Order\n\n```\n".length;
  const block = text.slice(from, text.indexOf("\n```\n", from));
  const re = new RegExp(`^.{6}${String(id)} .*$`, "mu");
  const hit = re.exec(block);
  expect(hit, `entry ${String(id)} has an Order row`).not.toBeNull();

  const at = from + (hit?.index ?? 0);
  return { at, end: at + (hit?.[0].length ?? 0), line: hit?.[0] ?? "" };
}

const OPEN_HEADING = "**Checked and confirmed OPEN**";

/** The paragraph the sweep writes its evidence in, and the entries it discusses. */
function openParagraph(text: string): Readonly<{ at: number; body: string }> {
  const at = text.indexOf(OPEN_HEADING);
  expect(at, "the confirmed-OPEN paragraph").toBeGreaterThan(-1);
  return { at, body: text.slice(at, text.indexOf("\n\n", at)) };
}

function confirmedOpen(text: string): readonly string[] {
  return [...openParagraph(text).body.matchAll(/\*\*(\d+)\*\*/gu)].map((m) => m[1] ?? "");
}

/** A fabrication, asserted to have changed something. */
function mutate(from: string, to: string): string {
  expect(ROADMAP, `the anchor "${from}" is in the roadmap`).toContain(from);
  return ROADMAP.replace(from, to);
}

describe("roadmap-status — the Order column's verifier", () => {
  it("RS1: the roadmap as it stands resolves, over every entry it has", () => {
    const r = run();
    expect(r.ok).toBe(true);
    // **The counter, not only the status** — a run over 3 entries also exits 0.
    //
    // **Every figure here is a relation, and the pinned one was wrong within a
    // day.** This row read `45/45` as a literal and the list grew to 47 when the
    // nits were distributed — so a test whose whole subject is *a count in prose
    // is a snapshot with no mechanism* carried one. The corpus size is asserted
    // as a floor, and the identities are asserted against the run's own numbers.
    const m = /(\d+) entries · (\d+) marked, (\d+) resolving/u.exec(r.out);
    expect(m, "the counter line").not.toBeNull();
    const entries = Number(m?.[1]);
    expect(entries, "a real corpus, not three rows").toBeGreaterThan(40);
    expect(r.out, "every entry accounted for").toContain(
      `${String(entries)}/${String(entries)} entries accounted for`,
    );
    expect(Number(m?.[2]), "marked rows").toBeGreaterThan(0);
    expect(Number(m?.[3]), "every marked row resolves").toBe(Number(m?.[2]));
  });

  it("RS2: a claim naming the wrong file fails, and names the identifier", () => {
    // The measured case's shape, on the row that still has it: one cited file,
    // and the wrong one. It was row 17's `logs`, until that row grew to four
    // implementers citing three files — every one of which holds `logs` or is
    // cited beside one that does, so RS2c's limit masks any single repointing.
    // Row 18 cites `refresh.ts` alone for `Source` and `folds`; `folds` occurs
    // 0 times in `render-cache.ts`. A file-exists check passes here — both files
    // are real — so this is the row that distinguishes the two checks.
    const r = run(
      mutate(
        "| 18 | BUILT | `src/shell/refresh.ts` — `Source`, the `folds` memo",
        "| 18 | BUILT | `src/shell/render-cache.ts` — `Source`, the `folds` memo",
      ),
    );
    expect(r.ok, "a wrong-file citation must fail").toBe(false);
    expect(r.out).toContain("entry 18");
    expect(r.out).toMatch(/`folds` appears in none of/u);
  });

  it("RS2c: a sibling citation masks a wrong one — the limit, asserted", () => {
    // **The fixture found this rather than the tool's comment predicting it.**
    // An identifier resolves against any file its cell cites, so repointing row
    // 17's `logs` at `simple.ts` while its siblings stand beside it PASSES:
    // `keyValue`'s citation is the same `structured.ts`, and `logs` occurs once
    // in the patch definition besides.
    //
    // Asserted rather than described, because an unrecorded limit reads as
    // strength — and because the day the shape is tightened, this row is what
    // says so. The strict alternative is worse: row 17 legitimately names two
    // symbols and cites one file for each, so "every identifier in every file"
    // fails every correct multi-file row.
    const masked = run(
      mutate(
        "`logs` (`src/presentation/blocks/kinds/structured.ts:217`)",
        "`logs` (`src/presentation/blocks/kinds/simple.ts:1`)",
      ),
    );
    expect(masked.ok, "the known limit: a two-file row hides a wrong citation").toBe(true);
  });

  it("RS2b: a citation to a file that is gone, and to a line past its end", () => {
    expect(run(mutate("`src/shell/render-cache.ts`", "`src/shell/render-cache-old.ts`")).out)
      .toContain("src/shell/render-cache-old.ts does not exist");
    expect(run(mutate("`src/shell/paint.ts:303`", "`src/shell/paint.ts:99999`")).out)
      .toMatch(/src\/shell\/paint\.ts:99999 — the file has \d+ lines/u);
  });

  it("RS3: a row with a status and no evidence at all fails", () => {
    // The other half of "a claim that no longer resolves": not a wrong reference
    // but no reference. A status with nothing behind it is a memory, and it reads
    // identically to one that was checked.
    const r = run(mutate("| 13 | BUILT | `src/shell/render-cache.ts`,", "| 13 | BUILT | it is built,"));
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/entry 13: no file cited/u);
  });

  it("RS3b: a marked entry with no row in the evidence table at all fails", () => {
    const r = run(ROADMAP.replace(/^\| 18 \| BUILT \|.*$/mu, ""));
    expect(r.ok).toBe(false);
    expect(r.out).toContain("entry 18 is marked BUILT and has no evidence row");
  });

  it("RS4: an entry in none of the three sets fails — the arm that matters", () => {
    // 4 is in the unchecked list today. Dropping it there leaves it unmarked,
    // unconfirmed and unnamed — which is exactly what an entry silently added to
    // the Order list looks like, and it is indistinguishable from a verified OPEN
    // by reading.
    const r = run(mutate("2, 4. Two of", "2. Two of"));
    expect(r.ok).toBe(false);
    expect(r.out).toContain("entries in neither the column");
    expect(r.out).toContain("4");
    expect(r.out).toMatch(/reads exactly like one somebody did/u);
  });

  it("RS8: an OPEN row that says something is built fails — the vacuity arm", () => {
    // **The hole the other checks leave, and entry 7 is the measured case.** RS2
    // resolves a *marked* row's evidence; RS4 asks that no entry falls out of the
    // partition. Both watch rows that make a claim, and **a blank row makes none**
    // — so it resolves trivially and reads exactly like a row somebody verified.
    // Entry 7 stayed OPEN through three landed stages with its own description
    // reading *"stages 1–3 built"*, and its confirmed-OPEN evidence — *"has no
    // `src/interaction/navigation/`"* — was **true**, because the work landed in
    // `router/` and `shell/`. A citation that resolves while the sentence it
    // carries is false is the shape no resolution check reaches.
    //
    // The arm needs nothing outside the document, which is why it is cheap enough
    // to be exact: a row that claims something is built is PART at least.
    // **Second re-anchor in one session, and the class is worth naming.** It sat
    // on 46 until 46 shipped, then on 7 — *the instance that produced the rule* —
    // until 7 was ruled. Any anchor into a live document expires when its row
    // moves, and that is the cost of a fabricated violation being fabricated
    // *somewhere real*.
    //
    // **Deriving the row instead would be worse**, and that is why it is not
    // done: picking whichever PART row carries a built-word means reading the
    // roadmap with the instrument's own rule, so the fixture would agree with it
    // by construction and certify nothing. A fabricated violation has to be
    // independent of the thing it is testing.
    //
    // **Built the other way round now, and it stops expiring.** Blanking a PART
    // marker only reaches this arm if the entry is *also* in the confirmed-OPEN
    // list — 7 and 46 both were, which is why it worked twice and why it broke
    // twice. Anchoring on 27 instead failed for a different rule entirely: 27 is
    // in none of the three sets once blanked, so RS4 fires first and RS8 is never
    // asked. The convenient fixture is the one where two rules agree.
    //
    // So the state is constructed rather than found: take an entry that **is**
    // confirmed-OPEN and give its description a claim. That is RS8's subject
    // exactly — OPEN, listed, and saying something exists — and it depends on no
    // marker staying where it is.
    const row = openRow(ROADMAP);
    const r = run(`${ROADMAP.slice(0, row.end)} — it is built${ROADMAP.slice(row.end)}`);
    expect(r.ok, "an OPEN row claiming its subject exists").toBe(false);
    expect(r.out).toMatch(/entry \d+ is OPEN and its own description says/u);
  });

  it("RS8b: the built-word exemption table is empty, and an empty arm is stated", () => {
    // **The arm is vacuous today and this row is what says so.** Its two failure
    // modes — an exemption on a row that is no longer OPEN, and one quoting a
    // sentence the row no longer says — both need an entry in
    // `OPEN_BUILT_WORDS`, and the table is now empty: 15's went when 15 was
    // built, 3's went 2026-09-04 when 3 was marked PART. That is the equality
    // rule disposing of its own population twice, which is the arm working.
    //
    // **The fixture cannot fabricate a violation for it**, and that is a fact
    // about where the subject lives rather than a gap to be papered over: the
    // exemptions are code and this file only fabricates documents. A row that
    // pretended otherwise would be asserting a proxy. So it asserts the state,
    // and the day someone adds an exemption this goes red — which puts the
    // fabricated violation with the hand that adds it, where it can be written
    // against a real sentence.
    const tool = readFileSync("tools/roadmap-status.mjs", "utf8");
    const m = /const OPEN_BUILT_WORDS = Object\.freeze\((\{[\s\S]*?\})\);/u.exec(tool);
    expect(m, "the exemption table is declared where it always was").not.toBeNull();
    expect(
      (m?.[1] ?? "").replace(/\s+/gu, ""),
      "an exemption was added — write its fabricated violation here, quoting the row's own sentence",
    ).toBe("{}");
  });

  it("RS9: the grep-reach signal counts the sweep's own evidence, not the Order row", () => {
    // **The sixth sweep's finding, made countable.** Every earlier sweep claimed
    // *the symbols these entries name are absent from `src/`*, which is exact when
    // an entry names one. 40 and 41 name none — *"the trigger, not the engine"*,
    // *"typo detection — trivial, delightful"* — so the sweep passed over them and
    // recorded a confirmation it had not made. Both were built.
    //
    // **Reported and never gated**, because an entry is allowed to name no symbol
    // and demanding one would push rows into inventing a citation that means
    // nothing — the trap the optional `:line` already avoids.
    //
    // The row asserts the *source text*, which is where the first implementation
    // was wrong in both directions: measuring the Order row said 4 of 19, counting
    // 9 and 11 as unreachable when their titles (`mermaid`, `markdown`) are
    // perfectly greppable. The question is what the sweep wrote down.
    const r = run();
    expect(r.ok).toBe(true);
    const m = /grep reach · (\d+)\/(\d+) confirmed-OPEN/u.exec(r.out);
    expect(m, "the signal line").not.toBeNull();
    const [carried, total] = [Number(m?.[1]), Number(m?.[2])];
    // **The floor was 10 and the population reached 10 by entries landing.**
    // A bound pinned near today's count fails on success, which is the one
    // direction a roadmap assertion must not fail in — so it is set where the
    // ratio stops meaning anything rather than where the number happens to be.
    expect(total, "the confirmed-OPEN population is worth taking a ratio of").toBeGreaterThan(4);
    expect(carried, "some entries do carry their own symbol").toBeGreaterThan(0);
    // **The ratio inverted 2026-09-04 and the assertion had to invert with it.**
    // It read `carried < total` — *most rest on a blanket claim, that is the
    // finding* — which was true at 5/8 and is a pin on a defect, so it went red
    // on the session that fixed the defect. A bound that fails on success is the
    // one direction a roadmap assertion must not fail in (RS9's own note, two
    // lines up, about the floor). The relation asserted now is the one that
    // stays true in both regimes: the count is a subset of the population.
    expect(carried, "an entry cannot carry a symbol without being in the population")
      .toBeLessThanOrEqual(total);
  });

  it("RS9b: the reach count moves with the text — an entry losing its symbol", () => {
    // **The mutation, because a count that cannot move is not a measurement.** A
    // signal asserted only against itself passes whatever it reports, which is the
    // shape RS1 already had to be rewritten for.
    // **Third anchor, and it is derived now rather than moved again.** It sat on
    // 16's parenthetical, then on the bare run `**9** · **11** · **22**` — which
    // broke the moment 11 was given a symbol, the very event this row is about.
    // Any literal from the list is a hostage to the list changing.
    //
    // So the entry is chosen from the report: take the first id the signal says
    // rests on a blanket claim, give that one a symbol, assert the count rises.
    // The circularity is only in *which* entry is picked; the assertion — the
    // count moves by exactly one — is independent of what the tool said.
    // **Fifth anchor, and the direction is reversed because the population it
    // read is now empty.** It took the first entry the signal called a blanket
    // claim and gave it a symbol; this session gave all three of them clauses,
    // so there is no blanket entry left to promote and the row would have failed
    // on `id` being undefined. Adding one back would be fabricating the defect
    // the session removed.
    //
    // So the mutation runs the other way: take an entry that **does** carry a
    // symbol, strip the backticks out of its clause, and assert the count falls
    // by exactly one. It measures the same thing — that the number moves with
    // the text rather than being reported from nowhere — and its population is
    // the one RS9 has already asserted is non-empty.
    const first = run().out;
    const before = Number(/grep reach · (\d+)\//u.exec(first)?.[1]);
    const id = confirmedOpen(ROADMAP)[0];
    expect(id, "the paragraph discusses at least one entry").toBeTruthy();

    // **Fourth anchor, and this time nothing textual is left in it.** The third
    // derived the *entry* from the report and then hardcoded the separator after
    // it — ` ·` — which is a literal from the list by another name, and it broke
    // the day the first blanket entry became one followed by a comma. The
    // comment above it had already named the class and the fix stopped one word
    // short of applying it.
    //
    // So the edit is **positional**: find the paragraph, find the entry inside
    // it, splice there. `**9**` occurring earlier in the document — the hazard
    // the separator was carrying — cannot arise, because the offset is taken
    // from the paragraph rather than from the file.
    const { at: from, body: para } = openParagraph(ROADMAP);
    const at = para.indexOf(`**${String(id)}**`);
    const next = para.slice(at + 1).search(/\*\*\d+\*\*/u);
    const end = next === -1 ? para.length : at + 1 + next;
    const clause = para.slice(at, end);
    expect(clause, "the clause names a symbol to take away").toMatch(/`[^`]+`/u);

    const stripped =
      ROADMAP.slice(0, from + at) + clause.replaceAll("`", "") + ROADMAP.slice(from + end);
    const after = /grep reach · (\d+)\//u.exec(run(stripped).out)?.[1];
    expect(Number(after), `${String(id)} no longer carries its own symbol`).toBe(before - 1);
  });

  it("RS12: a declared gate whose symbol is present fails — the fabricated violation", () => {
    // **Check 5 named this as its own blind spot and then became its instance.**
    // Its header records: *a negative claim about a symbol is not covered —
    // entry 33's `no queue of any kind in src/shell/` is the uncovered instance
    // in the list today* — and 33's sentence went false in the same session.
    // Two more went false unread: 52's clause said `camera`, `azimuth`,
    // `elevation` and `halfBlockRows` occur zero times in
    // `src/presentation/plot/` and they occur 33, 7, 7 and 1; 3's said `tensor`
    // and `heatmap` occur zero times in `src/` and `heatmap` is a built form.
    //
    // The violation is fabricated rather than anchored on either, for RS8/RS10's
    // reason: this session is rewriting both sentences. It is spliced onto the
    // end of the confirmed-OPEN paragraph, and the symbol is one that certainly
    // exists in the scope the gate names — `documentView` has an implementation
    // file of its own under `src/shell/`.
    const { at, body } = openParagraph(ROADMAP);
    const gate = " **Gate**: `documentView` occurs zero times in `src/`.";
    const r = run(ROADMAP.slice(0, at + body.length) + gate + ROADMAP.slice(at + body.length));
    expect(r.ok, "a symbol declared absent and present in the tree").toBe(false);
    expect(r.out).toMatch(/a gate says `documentView` occurs zero times/u);
    // **The set is asserted, not the first file.** The first draft pinned
    // `document-view.ts` and went red because the arm named `construct.ts` —
    // which is where the walk happened to arrive first, an ordering the rule
    // never promised. The arm now reports every writer, sorted, so the row
    // asserts a member of the set (`execution.ts` calls `documentView.open`)
    // and survives any reorder of the tree.
    expect(r.out).toMatch(/\d+ files write it \(/u);
    expect(r.out).toContain("src/shell/execution.ts");
  });

  it("RS12b: the roadmap's own gates resolve, and a true one passes — the control", () => {
    // **Without this the arm is indistinguishable from one that fires on the
    // marker.** A rule failing every `**Gate**` would pass RS12 exactly as well,
    // and the document's live gates are the population it would break. They are
    // asserted through the report's own counter rather than by name, because a
    // gate is allowed to be retired and a literal here would be a hostage.
    const r = run();
    expect(r.ok, "the corpus as it stands").toBe(true);
    const m = /negative-symbol gates · (\d+) symbols declared absent/u.exec(r.out);
    expect(m, "the gate counter").not.toBeNull();
    expect(Number(m?.[1]), "at least one entry states its absence as a gate").toBeGreaterThan(0);

    const { at, body } = openParagraph(ROADMAP);
    const gate = " **Gate**: `queueEngineOfNoFile` occurs zero times in `src/`.";
    const ok = run(ROADMAP.slice(0, at + body.length) + gate + ROADMAP.slice(at + body.length));
    expect(ok.ok, "a symbol that genuinely is not there").toBe(true);
    expect(ok.out).not.toContain("queueEngineOfNoFile");
  });

  it("RS12c: a gate over an empty scope fails rather than reporting a clean resolve", () => {
    // **The control that has to fail when the corpus is stubbed**, without which
    // RS12b is vacuous: a resolver handed no files agrees with every negative
    // claim ever written, very quickly, and exits 0. It is group 9's ruling for
    // the third time in this file — RS6 for the entry list, RS7 for the
    // accounting paragraph, this for the scope a gate names.
    const { at, body } = openParagraph(ROADMAP);
    const gate = " **Gate**: `whatever` occurs zero times in `src/no-such-dir/`.";
    const r = run(ROADMAP.slice(0, at + body.length) + gate + ROADMAP.slice(at + body.length));
    expect(r.ok, "an empty scan is not a clean one").toBe(false);
    expect(r.out).toMatch(/holds no `\.ts` file/u);
  });

  it("RS12d: a symbol that occurs only in prose does not falsify its own gate", () => {
    // **Prose inflates a textual signal, and the worst case is a comment saying
    // why a thing is absent.** `src/shell/document-view.ts` names `transcript`
    // exactly once and the once is a comment explaining that the view does not
    // have one — so a gate counting raw matches would report the symbol present
    // on the strength of the sentence stating its absence.
    //
    // Asserted on `Konsole`, which `src/terminal/` discusses and never writes.
    // **The row asserts the premise too**: if the comment went, this would pass
    // for the wrong reason and certify nothing.
    const raw = readFileSync("src/terminal/capabilities.ts", "utf8");
    expect(raw, "the premise: the word is in the file at all").toContain("Konsole");
    expect(raw.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1"))
      .not.toContain("Konsole");

    const { at, body } = openParagraph(ROADMAP);
    const gate = " **Gate**: `Konsole` occurs zero times in `src/terminal/`.";
    const r = run(ROADMAP.slice(0, at + body.length) + gate + ROADMAP.slice(at + body.length));
    expect(r.ok, "comments are stripped before the symbol is resolved").toBe(true);
  });

  it("RS13 (F667, the other half): a blank column against a table status fails", () => {
    // **The agreement check ran over the marked rows and the hole was the
    // unmarked ones.** A blank column *means* OPEN — the parser says so in its
    // own comment — but the loop iterated `marked`, so an entry with a status in
    // the evidence table and nothing in the column was compared against nothing.
    // Entry 3 was the live instance on 2026-09-04: `| 3 | PART |` in the table,
    // blank in the column, listed as confirmed-OPEN, and the paragraph's own
    // prose saying *3 is PART in the table above … rather than open*. Three
    // records, all readable, and the tool printed *every claim resolves*.
    //
    // Constructed rather than anchored on 3, because 3 is what this session
    // repaired. The subject is any confirmed-OPEN entry given a table row: it is
    // OPEN by the column and PART by the table, and nothing else moves.
    const id = confirmedOpen(ROADMAP)[0];
    const anchorRow = "| 3 | PART |";
    expect(ROADMAP, "the evidence table is where it was").toContain(anchorRow);
    const row = `| ${String(id)} | PART | \`src/index.ts\` | — |\n`;
    const r = run(ROADMAP.replace(anchorRow, row + anchorRow));
    expect(r.ok, "two records of one status, one of them blank").toBe(false);
    expect(r.out).toContain(`entry ${String(id)}`);
    expect(r.out).toContain("the Order column says OPEN and the evidence table says PART");
  });

  it("RS5: an entry in two of the three sets fails", () => {
    // 13 is BUILT. Naming it in the unchecked list as well makes the document say
    // two things, and a partition that only checked coverage would pass.
    const r = run(mutate("2, 4. Two of", "2, 4, 13. Two of"));
    expect(r.ok).toBe(false);
    expect(r.out).toContain("in two of the three sets");
  });

  it("RS10: a row saying a file is absent fails when the file exists", () => {
    // **The direction check 1 cannot look.** It resolves a *marked* row's citations
    // and a negative claim inverts the verdict: *there is no `X`* passes hardest on
    // the day it becomes false, because `X` now resolves.
    //
    // The measured case is entry 3 — `fc5ff14` recorded that no
    // `CALCIUM_PLOT_PRIOR_ART.md` was in the repository and `6611f9f`, **the next
    // commit**, added it under `docs/notes/`. Nine commits went past it and the
    // satisfier-side sweep could not have caught it: 3 was in the unchecked
    // paragraph for naming `prism-tui`, so nothing resolved its row at all.
    //
    // **The fixture is constructed rather than anchored on entry 3**, for RS8's
    // reason: this session is rewriting that row, and an anchor into the sentence
    // under repair expires the moment the repair lands. 33 is confirmed-OPEN and
    // stays OPEN, and `session.ts` is a basename that exists — which is also what
    // the arm's own resolver is for, since `locate` looks at the root and `src/`
    // only and this claim is about the whole tree.
    const row = openRow(ROADMAP);
    const r = run(
      `${ROADMAP.slice(0, row.end)} there is NO \`session.ts\`${ROADMAP.slice(row.end)}`,
    );
    expect(r.ok, "a file the row says is absent and that exists").toBe(false);
    expect(r.out).toMatch(/entry \d+ says there is no `session\.ts`/u);
    expect(r.out).toContain("shell/session.ts` exists");
  });

  it("RS10b: a negative claim that is true passes — the control", () => {
    // **Without this row the arm is indistinguishable from one that fires on the
    // phrasing.** A check that failed every *there is no X* would pass RS10 exactly
    // as well, and the roadmap's legitimate absence claims are the population it
    // would break.
    const row = openRow(ROADMAP);
    const r = run(
      `${ROADMAP.slice(0, row.end)} there is NO \`queue-engine.ts\`${ROADMAP.slice(row.end)}`,
    );
    expect(r.ok, "the file genuinely is not there").toBe(true);
    expect(r.out).not.toContain("queue-engine.ts");
  });

  it("RS11 (F667): the two records of one entry's status must agree", () => {
    // **The rule that found two instances on its first run, one of them a day old.**
    // The Order column and the evidence table each carry a status per entry and the
    // parser has built both maps since this tool existed — nothing compared them,
    // so entry 11 shipped `PART` in the column against `BUILT` in the table and
    // this tool printed *every claim resolves* on that tree. Entry 7 had been
    // disagreeing (`RULED` against `PART`) for longer.
    const r = run(mutate("BUILT 11 markdown", "PART  11 markdown"));
    expect(r.ok, "a disagreement is a failure").toBe(false);
    expect(r.out).toContain("entry 11");
    expect(r.out).toContain("the Order column says PART and the evidence table says BUILT");
  });

  it("RS11b: agreement is not resolution — the control", () => {
    // **Without this row the check is indistinguishable from one that fires on any
    // edit to the column.** The real roadmap's 42 marked entries all agree, and the
    // rule must be silent on every one of them; what it does *not* check is whether
    // the pair is right, which is rule 1's job for the citations and nobody's for
    // the status itself.
    const r = run(ROADMAP);
    expect(r.ok, "the corpus as it stands").toBe(true);
    expect(r.out).not.toContain("two records of one fact");
  });

  it("RS6: an Order block with no entries fails rather than reporting a clean scan", () => {
    // Group 9's ruling, in the instrument written to check a list. An exit status
    // is one bit and it is the same bit for *every claim resolves* and for *there
    // were no claims*.
    const start = ROADMAP.indexOf("## Order\n\n```\n") + "## Order\n\n```\n".length;
    const end = ROADMAP.indexOf("\n```\n", start);
    const r = run(`${ROADMAP.slice(0, start)}nothing here${ROADMAP.slice(end)}`);
    expect(r.ok).toBe(false);
    expect(r.out).toContain("0 entries found");
    expect(r.out).toMatch(/An empty scan is not a clean one/u);
  });

  it("RS7: a missing accounting paragraph is a failure, not an empty set", () => {
    // The same trap one level up: `listed()` returns null rather than an empty
    // set, because a heading someone renamed would otherwise silently move every
    // entry into the unaccounted pile — or, if the partition were computed the
    // other way, out of it.
    const r = run(mutate("**Not checked, and named", "**Left for later"));
    expect(r.ok).toBe(false);
    expect(r.out).toContain("no `Not checked, and named` paragraph");
  });
});
