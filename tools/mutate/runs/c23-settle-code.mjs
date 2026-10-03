// C23 I101, I102 and I98's stall clause — an entry settles with one code, and
// its document and C20 both carry it; a stall is said only of a live entry
// (ruling 100; F1508, F1509, F1510; T6.118, T6.119, T6.120).
//
// **One mutation per site, each what shipped or its nearest neighbour**: a
// stream's ending settled bare and recorded nowhere, a malformed patch at the
// card's 0, a denial settled bare beside a record of 126, the head's `exit N`
// read from the raw code, a throw recorded nowhere, the kept card settled
// without its code, the stall row kept in a cancel's document, and the stall
// watch outliving the settle.
//
// **The verdict is read from the FAIL lines** (F1472): only *caught by the named
// row* counts as the row seeing it.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const EXECUTION = "src/shell/execution.ts";
const REFRESH = "src/shell/refresh.ts";
const FILES = [
  "test/integration/settlement-code.test.ts",
  "test/integration/app-cancel.test.ts",
  "test/integration/process.test.ts",
  "test/integration/running-card.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (e.killed === true) out = `${out}\nTIMED OUT after 300000ms`;
  }
  const fails = out
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .filter((l) => /^\s*FAIL\s/.test(l));
  console.error(`  -- FAIL lines: ${fails.length === 0 ? "none" : `\n${fails.join("\n")}`}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): every never-started handoff says
    // something else.
    file: EXECUTION,
    from: "? `${label} did not start`",
    to: "? `${label} never ran`",
    why: "the handoff's never-started notice reads `never ran` — if this survives, T4.93 is not reading the notice",
  },
  mutations: [
    {
      // **What shipped** (F1508): the natural `end` settled bare, recorded nowhere.
      name: "T6.118: the stream end's settle put back to settle(id), with no record",
      file: EXECUTION,
      from: "          refresh.settled(id);\n          settleKept(code);",
      to: "          refresh.settled(id);\n          deps.transcript.settle(id);",
      expect: "T4.102",
    },
    {
      // The record kept and the code the card's own: a truncated stream as a success.
      name: "T6.118: the malformed patch's code put back to the card's 0",
      file: EXECUTION,
      from: "the child ended.\n          settleKept(1);",
      to: "the child ended.\n          settleKept(0);",
      expect: "T4.102",
    },
    {
      // **What shipped** (F1510): the card at 0 beside a record of 126.
      name: "T6.118: the denial settled with no document beside a record of 126",
      file: EXECUTION,
      from: "        else settleKept(126);",
      to: "        else {\n          deps.transcript.settle(pendingId);\n          deps.history.append(line, 126);\n        }",
      expect: "T4.102",
    },
    {
      // **What shipped**: `exit null` over `succeeded` for a killed stream.
      name: "T6.118: the head's exit N read from the raw exitCode again",
      file: EXECUTION,
      from: "          finishCard(code === 0 ? \"\" : `exit ${String(code)}`);",
      to: "          finishCard(patch.result.exitCode === 0 ? \"\" : `exit ${String(patch.result.exitCode)}`);",
      expect: "T4.102",
    },
    {
      // **What shipped** (F1508): the throw settled bare, recorded nowhere.
      name: "T6.118: the stream throw's settle put back to settle(id)",
      file: EXECUTION,
      // The throw arm's line, anchored short of its comment.
      from: "settleKept(1); /",
      to: "deps.transcript.settle(id); /",
      expect: "T4.102",
    },
    {
      // The record right and the document not: two writers again.
      name: "T6.118: the kept card settled without the code it records",
      file: EXECUTION,
      from: "      deps.transcript.settle(pendingId, doc === held ? undefined : doc);",
      to: "      deps.transcript.settle(pendingId);",
      expect: "T4.102",
    },
    {
      // **What shipped** (F1509): the stall row kept in the cancel's document.
      name: "T6.119: the stall row kept in the cancel's document",
      file: EXECUTION,
      from: "cancelledCard({ ...held, blocks: held.blocks.filter((blk) => blk.id !== STALL_BLOCK) });",
      to: "cancelledCard(held);",
      expect: "T4.103",
    },
    {
      // **What shipped**: only `refresh.settled` ended the watch.
      name: "T6.120: the stall watch no longer dropped on the settle change",
      file: REFRESH,
      from: "      watched.delete(change.id);\n    }",
      to: "    }",
      expect: "T4.104",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
