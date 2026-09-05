// C23 I54 — the pending entry is the running card, mutated at the wiring.
//
// **T3.61 (`refresh-readout.mjs`) proves the mechanism; these rows prove the
// route calls it.** Every mutation here is a shape `execution.ts` shipped in or
// could have: the bare `compose({ blocks: [] })` the tree carried until
// 2026-09-05, a readout never registered, the verdict written *after* the settle
// (the natural order, and the one persistence cannot see), the queued notice left
// in place at the route, and the resume record's two defects in `refresh.ts`.
//
// **One survivor is recorded rather than hidden**: dropping `readouts.delete(id)`
// from `settled` survives every row in `running-card.test.ts`, because the
// `settle` change also releases the entry host and release drops the readout
// (`refresh.ts`, I33) — two mechanisms, one observable. It dies in T3.61, where
// `settled` is driven without a transcript settle, so it lives in
// `refresh-readout.mjs` and not here. Lane P, 2026-09-05, all eight verified by
// hand before this file was written; the harness has not yet run it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/running-card.test.ts test/contract/notice-family.test.ts";
const EX = "src/shell/execution.ts";
const RF = "src/shell/refresh.ts";
const DOC = "src/shell/documents.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  // The kill not in doubt: with no readout registered the header is composed
  // once and T4.40's second assertion (`· 4s`) cannot be met.
  control: {
    file: EX,
    from: "    refresh.readout(pendingId, call.id, (ms) => header(ms));",
    to: "    // refresh.readout(pendingId, call.id, (ms) => header(ms));",
    why: "T4.40 asserts the header reads · 4s after four wakes; nothing registered means nothing moves — F771 at the route",
  },
  mutations: [
    {
      // F795 as it shipped: `ps()` for a bare verb.
      name: "the header keeps its parentheses with no arguments",
      file: DOC,
      from: "  const parts = [call.args === \"\" ? call.name : `${call.name}(${call.args})`];",
      to: "  const parts = [`${call.name}(${call.args})`];",
      expect: "T4.46",
    },
    {
      // The tree's state until 2026-09-05: a pending entry with no blocks.
      name: "step 3 appends compose({ blocks: [] }) — the old pending entry",
      file: EX,
      from: '        toolCallDoc(displayed, call, { origin: "user", verb, transport: "subprocess", argv: [...result.argv] }),',
      to: '        compose({ command: displayed, blocks: [], meta: { origin: "user", verb, transport: "subprocess", argv: [...result.argv] } }),',
      expect: "T4.40",
    },
    {
      name: "the readout is never registered",
      file: EX,
      from: "    refresh.readout(pendingId, call.id, (ms) => header(ms));",
      to: "    // refresh.readout(pendingId, call.id, (ms) => header(ms));",
      expect: "T4.40",
    },
    {
      // Finish, then annotate — the order a first draft writes. A "shell" patch
      // lands on a settled entry (C13 §6), so the final state is identical; only
      // the document carried by the `settle` change — what persistence writes —
      // lacks the verdict. T4.40's fourth assertion reads exactly that.
      name: "the verdict is written after the settle",
      file: EX,
      from: "          finishCard(`exit ${String(patch.result.exitCode)}`);\n          // C23 I8 — settlement flushes at `\"completion\"`. §8a A4: settling\n          // clears the stall state, so a notice does not outlive its condition.\n          refresh.settled(id);\n          deps.transcript.settle(id);",
      to: "          refresh.settled(id);\n          deps.transcript.settle(id);\n          finishCard(`exit ${String(patch.result.exitCode)}`);",
      expect: "T4.40",
    },
    {
      // §8f P2 — the defect the table found: a deferred line running while it
      // still says *queued behind*.
      name: "the queued notice is left in place at the route",
      file: EX,
      from: "      if (waiting !== undefined) {",
      to: "      if (false && waiting !== undefined) {",
      expect: "T4.41",
    },
    {
      // The tree's state: `1m` under a notice that said `2m`.
      name: "the resume record measures from the notice, not the last patch",
      file: RF,
      from: "    const gap = Math.max(1, Math.round((deps.clock() - state.last) / 60_000));",
      to: "    const gap = Math.max(1, Math.round((deps.clock() - state.stalledAt) / 60_000));",
      expect: "T4.44",
    },
    {
      // The tree's state: the row changed column on resumption. Caught by the
      // notice family's bytes, not by any store-level assertion.
      name: "the resumed row drops its hook",
      file: RF,
      from: '        block: b.notice("muted", `resumed after ${String(gap)}m`, "continuation", { id: STALL_BLOCK }),',
      to: '        block: b.notice("muted", `resumed after ${String(gap)}m`, undefined, { id: STALL_BLOCK }),',
      expect: "N8",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
