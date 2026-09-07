// C28 — profiler (docs/components/C28_profiler.md §10), tier 5.
//
// Spec-first rows. C28's spec landed alone, ahead of its code, so every
// invariant it declares is named here and nowhere else yet — SP9 is what makes
// that a requirement rather than a courtesy: an invariant no row names is a
// claim nothing was written against, and it reads exactly like one that is
// satisfied.
//
// Each row carries the explicit no-blocker marker rather than a "waits on C28"
// clause, and that is TD3's ruling rather than an omission: COMPONENT_SOURCES
// may not name a path before the path exists, because a missing path reads as
// "not implemented" forever and silently exempts every deferral pointing at it.
// C28 gains its entry on the commit that makes src/shell/profiling/recorder.ts
// real, and from then on these expire the way every other deferral does.
//
// Generated from the spec's own §10 rows, so the two cannot drift apart by
// transcription; a row edited here and not there is a diff a reader can see.
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("C28 — profiler, tier 5 spec-first rows", () => {
  it.todo("T5.1 (C28 I14): a recorded PTY session that types, submits, streams, scrolls and resizes → replayed, the frames are byte-identical to the recording's — not deferred on a component: the blocker is that no recording apparatus exists. ProfileOptions has no `record` or `replay` field and `grep -rn \"replay\" src/shell/\" is empty — every hit for `replay` in src/ is C06's fixture transport, which replays a captured *process invocation* and not a session's input. Grep: `grep -n \"record\\?:\\|replay\\?:\" src/shell/profiling/types.ts`");
  it.todo("T5.2 (C28 I14): the same recording replayed twice → the two runs' frames are identical to each other — not deferred on a component: the blocker is that no recording apparatus exists. ProfileOptions has no `record` or `replay` field and `grep -rn \"replay\" src/shell/\" is empty — every hit for `replay` in src/ is C06's fixture transport, which replays a captured *process invocation* and not a session's input. Grep: `grep -n \"record\\?:\\|replay\\?:\" src/shell/profiling/types.ts`");
  it("T5.3 (C28 I37, A01 Appendix B): make profile fills all six appendix rows against dist/", () => {
    // **Tier 5 because the subject is `dist/`.** `checkBudget` has tier-1 rows
    // over report literals; what those cannot ask is whether a session driven
    // through the built package's public surface produces a report the table can
    // read. A probe against a stale build gives a wrong negative and nothing
    // revisits a ruled-out candidate, which is why this runs where the build is.
    //
    // Small numbers: the appendix's rows are about a frame's shape, not its
    // size, and a 300-line document crosses the same thresholds a 10,000-line
    // one does while costing the suite a second instead of a minute.
    const out = execFileSync("node", ["tools/profile.mjs", "300", "6"], {
      encoding: "utf8",
      timeout: 120_000,
    });

    // The fixture is shown to respond before anything is read from it — the
    // tool's own guard, asserted here so a dead fixture is a red row rather than
    // a plausible table (`test/support/README.md`).
    expect(out, "the document reached the transcript").toContain("fixture live:");

    // **All six of A01's labels, verbatim.** The row said *three* until the
    // appendix was filled; a table that quietly drops the rows it cannot answer
    // is the plausible-zero failure one level up from a cell.
    for (const label of [
      "Bytes written per frame",
      "Median frame construction",
      "p95 frame construction",
      "Resize corruption count",
      "10k-line Page Down latency",
      "Streaming CPU",
    ]) {
      expect(out, `the appendix's row ${label}`).toContain(label);
    }

    // Four measured, two refused — and the two refused are named, because an
    // absence that prints nothing is indistinguishable from a zero.
    const refusals = out.match(/unanswerable:/g) ?? [];
    expect(refusals, "resize corruption and Page Down, and only those").toHaveLength(2);

    // A verdict, and never `closed` while two rows are blank.
    expect(out).toMatch(/M-T6: \*\*(justified|undecided)\*\*/);
    expect(out, "six rows and four answers cannot close the experiment").not.toContain(
      "M-T6: **closed**",
    );

    // The regime travels with the figures (C28 I13), and so does the split the
    // component exists for.
    expect(out, "the table names the machine it was measured on").toContain("Regime: node ");
    expect(out, "compute against draw, from PHASE_GROUP on the published face").toContain(
      "Where the frame went",
    );
  }, 120_000);
  it.todo("T5.4 (C28 I8): the T5.1 recording replayed → misses['nothing-changed'] is 0. On a replayed input the count is deterministic, which is the only regime in which asserting it is honest (D2) — not deferred on a component: the blocker is that no recording apparatus exists. ProfileOptions has no `record` or `replay` field and `grep -rn \"replay\" src/shell/\" is empty — every hit for `replay` in src/ is C06's fixture transport, which replays a captured *process invocation* and not a session's input. Grep: `grep -n \"record\\?:\\|replay\\?:\" src/shell/profiling/types.ts`. T5.1 is the recording it reads, so that row is the other half");
});
