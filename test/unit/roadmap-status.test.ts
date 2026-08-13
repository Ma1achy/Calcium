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
    const r = run(mutate("2, 3, 4. Three of", "2, 3. Three of"));
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
    const staled = mutate(
      "PART  46 SCROLLABLE CONTAINERS",
      "      46 SCROLLABLE CONTAINERS",
    );
    const r = run(staled);
    expect(r.ok, "an OPEN row asserting `elements` is built").toBe(false);
    expect(r.out).toContain("entry 46 is OPEN and its own description says");
  });

  it("RS8b: a built-word exemption that no longer matches its row fails", () => {
    // **The equality arm, which is what keeps the two exemptions honest.** The
    // pattern fired on four rows and two were real; 3 and 15 use a built-word
    // without asserting anything exists — *built with prism-tui as the consumer*
    // and *is built three times*. Narrowing the regex to exclude them would also
    // stop it seeing the next phrasing, so they are named exemptions quoting the
    // sentence. An exemption checked by membership alone is one that outlives its
    // reason, which is the failure every over-permissive list in this repo has had.
    const reworded = mutate(
      "tensors, heatmaps — built with prism-tui as the consumer",
      "tensors, heatmaps — made together with prism-tui as the consumer",
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
    expect(total, "the confirmed-OPEN population").toBeGreaterThan(10);
    expect(carried, "some entries do carry their own symbol").toBeGreaterThan(0);
    expect(carried, "and most rest on a blanket claim — that is the finding").toBeLessThan(total);
  });

  it("RS9b: an entry given its own symbol moves the signal", () => {
    // **The mutation, because a count that cannot move is not a measurement.** A
    // signal asserted only against itself passes whatever it reports, which is the
    // shape RS1 already had to be rewritten for.
    const before = /grep reach · (\d+)\//u.exec(run().out)?.[1];
    // The anchor moved when 16 left the confirmed-OPEN list and took its
    // parenthetical with it. Anchored on the bare id run now, which is the form
    // an entry has *before* anyone gives it a symbol — the state under test.
    const given = mutate("**9** · **11** · **22**", "**9** · **11** · **22** (no `b.art` in `src/`)");
    const after = /grep reach · (\d+)\//u.exec(run(given).out)?.[1];
    expect(Number(after), "22 now carries its own symbol").toBe(Number(before) + 1);
  });

  it("RS5: an entry in two of the three sets fails", () => {
    // 13 is BUILT. Naming it in the unchecked list as well makes the document say
    // two things, and a partition that only checked coverage would pass.
    const r = run(mutate("2, 3, 4. Three of", "2, 3, 4, 13. Three of"));
    expect(r.ok).toBe(false);
    expect(r.out).toContain("in two of the three sets");
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
