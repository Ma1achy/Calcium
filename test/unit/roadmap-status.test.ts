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
  it("RS1: the roadmap as it stands resolves, and over 45 entries", () => {
    const r = run();
    expect(r.out, "the real roadmap").toContain("45/45 entries accounted for");
    expect(r.ok).toBe(true);
    // The counter, not only the status — a run over 3 entries also exits 0.
    expect(r.out).toMatch(/45 entries · 18 marked, 18 resolving/u);
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
    // 41 is in the unchecked list today. Dropping it there leaves it unmarked,
    // unconfirmed and unnamed — which is exactly what an entry silently added to
    // the Order list looks like, and it is indistinguishable from a verified OPEN
    // by reading.
    const r = run(mutate("33, 36, 37, 41, 42", "33, 36, 37, 42"));
    expect(r.ok).toBe(false);
    expect(r.out).toContain("entries in neither the column");
    expect(r.out).toContain("41");
    expect(r.out).toMatch(/reads exactly like one somebody did/u);
  });

  it("RS5: an entry in two of the three sets fails", () => {
    // 13 is BUILT. Naming it in the unchecked list as well makes the document say
    // two things, and a partition that only checked coverage would pass.
    const r = run(mutate("33, 36, 37, 41, 42", "13, 33, 36, 37, 41, 42"));
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
    const r = run(mutate("**Not checked in this pass", "**Left for later"));
    expect(r.ok).toBe(false);
    expect(r.out).toContain("no `Not checked in this pass` paragraph");
  });
});
