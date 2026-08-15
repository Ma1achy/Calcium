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
    // The measured case, replayed as it actually stood: one cited file, and the
    // wrong one. `logs` occurs 0 times in `simple.ts` and 8 in `structured.ts`.
    // A file-exists check passes here — both files are real — so this is the row
    // that distinguishes the two checks.
    const r = run(
      mutate(
        "`logs` — `src/presentation/blocks/kinds/structured.ts:123` — **and** `patch` — " +
          "`src/presentation/patch/definition.ts:211` — declare",
        "`logs` — `src/presentation/blocks/kinds/simple.ts:1` — declares",
      ),
    );
    expect(r.ok, "a wrong-file citation must fail").toBe(false);
    expect(r.out).toContain("entry 17");
    expect(r.out).toMatch(/`logs` appears in none of/u);
  });

  it("RS2c: a sibling citation masks a wrong one — the limit, asserted", () => {
    // **The fixture found this rather than the tool's comment predicting it.**
    // An identifier resolves against any file its cell cites, so repointing row
    // 17's `logs` at `simple.ts` while the `patch` citation stands beside it
    // PASSES: `logs` occurs once in the patch definition.
    //
    // Asserted rather than described, because an unrecorded limit reads as
    // strength — and because the day the shape is tightened, this row is what
    // says so. The strict alternative is worse: row 17 legitimately names two
    // symbols and cites one file for each, so "every identifier in every file"
    // fails every correct multi-file row.
    const masked = run(
      mutate(
        "`src/presentation/blocks/kinds/structured.ts:123`",
        "`src/presentation/blocks/kinds/simple.ts:1`",
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
    const staled = mutate(
      "      33 QUEUEING ★              submit while something runs",
      "      33 QUEUEING ★              the queue is built; submit while something runs",
    );
    const r = run(staled);
    expect(r.ok, "an OPEN row claiming its queue exists").toBe(false);
    expect(r.out).toContain("entry 33 is OPEN and its own description says");
  });

  it("RS8b: a built-word exemption that no longer matches its row fails", () => {
    // **The equality arm, which is what keeps the exemption honest.** The pattern
    // fired on four rows and two were real; 3 and 15 use a built-word without
    // asserting the entry's own subject exists. Narrowing the regex to exclude them
    // would also stop it seeing the next phrasing, so they are named exemptions
    // quoting the sentence. An exemption checked by membership alone is one that
    // outlives its reason, which is the failure every over-permissive list in this
    // repo has had.
    //
    // **And the arm has now caught an exemption whose reason was wrong rather than
    // stale, which is the case membership could never reach.** 3's old exemption
    // quoted *built with prism-tui as the consumer* and reasoned that prism-tui does
    // not exist in this tree — true, and it made the entry's gate the consumer's
    // absence. The row now quotes the phrase in order to rule that it is not a gate,
    // so the exemption had to be re-earned on the sentence that replaced it.
    const reworded = mutate(
      "says who validates the design, not who has to",
      "settles who validates the design, not who has to",
    );
    const r = run(reworded);
    expect(r.ok, "the quoted sentence is gone").toBe(false);
    expect(r.out).toContain("re-earn the exemption or drop it");
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
    expect(carried, "and most rest on a blanket claim — that is the finding").toBeLessThan(total);
  });

  it("RS9b: an entry given its own symbol moves the signal", () => {
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
    const first = run().out;
    const before = Number(/grep reach · (\d+)\//u.exec(first)?.[1]);
    const blanket = /blanket claim — ([\d, ]+)/u.exec(first)?.[1]?.split(",") ?? [];
    const id = blanket[0]?.trim();
    expect(id, "the signal names at least one blanket entry").toBeDefined();

    // **The separator is part of the anchor, and leaving it out cost a run.**
    // `**9**` occurs earlier in the document than the confirmed-OPEN list, so
    // the parenthetical landed somewhere the signal does not read and the count
    // did not move — a mutation that applied and asserted nothing, which is the
    // shape the harness reports apart from a survivor for a reason.
    const given = mutate(`**${String(id)}** ·`, `**${String(id)}** (no \`b.art\` in \`src/\`) ·`);
    const after = /grep reach · (\d+)\//u.exec(run(given).out)?.[1];
    expect(Number(after), `${String(id)} now carries its own symbol`).toBe(before + 1);
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
    const r = run(
      mutate(
        "      33 QUEUEING ★              submit while something runs",
        "      33 QUEUEING ★              there is NO `session.ts`; submit while something runs",
      ),
    );
    expect(r.ok, "a file the row says is absent and that exists").toBe(false);
    expect(r.out).toContain("entry 33 says there is no `session.ts`");
    expect(r.out).toContain("shell/session.ts` exists");
  });

  it("RS10b: a negative claim that is true passes — the control", () => {
    // **Without this row the arm is indistinguishable from one that fires on the
    // phrasing.** A check that failed every *there is no X* would pass RS10 exactly
    // as well, and the roadmap's legitimate absence claims are the population it
    // would break.
    const r = run(
      mutate(
        "      33 QUEUEING ★              submit while something runs",
        "      33 QUEUEING ★              there is NO `queue-engine.ts`; submit while something runs",
      ),
    );
    expect(r.ok, "the file genuinely is not there").toBe(true);
    expect(r.out).not.toContain("queue-engine.ts");
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
