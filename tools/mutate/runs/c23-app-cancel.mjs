// C23 I98, I99 and C07 I24 — an app-route cancel settles `partial` through a
// document the shell writes, the far side's late answer changes nothing, a run
// releases only what it holds, and C07's cancelled notice is the same composer's
// (rulings 97; F1490, F1493; T6.114, T6.115, C07 T6.15).
//
// **One mutation per clause**, each leaving the others correct: the document
// dropped from the cancel's settle, the notice dropped from it, the code left at
// the card's 0, the withdrawal alone put back on `settle(id)`; each of the two
// aborted checks removed; the `finally` releasing the guard and the slot
// unconditionally; each of the two places the run gives up its hold forgotten;
// and the mark dropped from the one composer.
//
// **The verdict is read from the FAIL lines** (F1472): only *caught by the named
// row* counts as the row seeing it.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const EXECUTION = "src/shell/execution.ts";
const DOCS = "src/shell/documents.ts";
const MAPPING = "src/data/adapters/mapping.ts";
const FILES = [
  "test/integration/app-cancel.test.ts",
  "test/unit/adapter-registry.test.ts",
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
    // **A change the corpus can see** (F1254): the app route's notice says
    // something else, on every source.
    file: DOCS,
    from: 'blocks: [...held.blocks, cancelledNotice("Cancelled.", blockId("cancelled"))],',
    to: 'blocks: [...held.blocks, cancelledNotice("Stopped.", blockId("cancelled"))],',
    why: "the app route's cancel notice reads `Stopped.` — if this survives, T4.97 is not reading the notice `cancelledCard` builds",
  },
  mutations: [
    {
      // **What shipped** (F1490): the card settled with no document.
      name: "T6.114: the cancel's settle carries no document",
      file: EXECUTION,
      from: "else deps.transcript.settle(pendingId, cancelledCard(held));",
      to: "else deps.transcript.settle(pendingId);",
      expect: "T4.97",
    },
    {
      name: "T6.114: the notice dropped from cancelledCard",
      file: DOCS,
      from: 'blocks: [...held.blocks, cancelledNotice("Cancelled.", blockId("cancelled"))],',
      to: "blocks: [...held.blocks],",
      expect: "T4.97",
    },
    {
      // The status right and the code the card's own 0: the record disagrees.
      name: "T6.114: meta.exitCode left at the card's 0",
      file: DOCS,
      from: "meta: { ...held.meta, exitCode: 130 },",
      to: "meta: held.meta,",
      expect: "T4.97",
    },
    {
      // One source of three: the withdrawal is its own branch, not `cancelThis`.
      name: "T6.114: the withdrawn approval settles with no document",
      file: EXECUTION,
      from: 'if (answer.outcome === "cancelled") settleCancelled();\n        else deps.transcript.settle(pendingId);',
      to: "deps.transcript.settle(pendingId);",
      expect: "T4.97",
    },
    {
      // **What shipped** (§8a A6.8 row 4): the late answer ran the settle path.
      name: "T6.115: the invocation's aborted check removed",
      file: EXECUTION,
      from: "      if (controller.signal.aborted) return;\n      const doc = deps.adapters.adapt(raw, {",
      to: "      const doc = deps.adapters.adapt(raw, {",
      expect: "T4.98",
    },
    {
      // **What shipped** (row 5): the late `end` rewrote the head.
      name: "T6.115: the stream's aborted check removed",
      file: EXECUTION,
      from: "        if (cancelled.aborted) return;\n        if (patch.kind === \"end\") {",
      to: "        if (patch.kind === \"end\") {",
      expect: "T4.98",
    },
    {
      // **What shipped** (rows 6 and 7): `finally` released unconditionally.
      name: "T6.115: the finally releases the guard unconditionally",
      file: EXECUTION,
      from: "      if (holdsGuard) guard.release();",
      to: "      guard.release();",
      expect: "T4.99",
    },
    {
      // The other half of what shipped: the slot cleared under the next run.
      name: "T6.115: the finally clears the cancel slot unconditionally",
      file: EXECUTION,
      from: "      if (cancelInFlight === cancelThis) cancelInFlight = null;",
      to: "      cancelInFlight = null;",
      expect: "T4.99",
    },
    {
      // Row 6's hold: a cancel gives the guard up, `cancel()` releases it.
      name: "T6.115: a cancel forgets it gave up the guard",
      file: EXECUTION,
      from: "      controller.abort();\n      holdsGuard = false;",
      to: "      controller.abort();",
      expect: "T4.99",
    },
    {
      // Row 7's hold: a stream releases the guard before its loop (C23 I6).
      name: "T6.115: a stream forgets it released the guard",
      file: EXECUTION,
      from: "        holdsGuard = false;\n        guard.release();",
      to: "        guard.release();",
      expect: "T4.99",
    },
    {
      // **What shipped in C07** (F1493): `muted` with no glyph.
      name: "C07 T6.15: the mark dropped from cancelledNotice",
      file: MAPPING,
      from: 'tone: "muted", glyph: "cancelled", text });',
      to: 'tone: "muted", text });',
      expect: "T1.23",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
