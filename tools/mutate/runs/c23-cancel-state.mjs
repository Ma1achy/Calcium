// C23 I96, I97, I95 and C22 I134 — a cancel is the `cancelled` call state on
// every route, a handoff's code reaches history, and a failure says so
// (rulings 92, 93 and 94; F1479–F1482; T6.111–T6.113).
//
// **One mutation per rule that meets in A6.7's table**, each a change to one
// field that leaves the others correct: the shell route's box put back with
// its status kept, the status dropped with the notice kept, the mark dropped
// from the composer, the cleared queue composed as the warning it was, the
// cancel document's status, the handoff's code dropped and then read as
// `code ?? 1`, the no-status text, and the key action's tone. A row reading
// fields one at a time passes the half it does not read, so the rows are one
// string each and every mutation here should land on one of them.
//
// **The verdict is read from the FAIL lines** (F1472): every mutation's failing
// rows are printed, and only *caught by the named row* counts as the row
// seeing it.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const EXECUTION = "src/shell/execution.ts";
const DOCS = "src/shell/documents.ts";
// The composer moved to C07 (C07 I24, F1493): one place for the mark, below both users.
const MAPPING = "src/data/adapters/mapping.ts";
const CONSTRUCT = "src/shell/construct.ts";
const FILES = [
  "test/integration/process.test.ts",
  "test/integration/key-actions.test.ts",
  "test/contract/continuation.test.ts",
  "test/edge/emulator.test.ts",
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
    // **A change the corpus can see** (F1254): every cancel's words change, on
    // all three routes that compose one.
    file: MAPPING,
    from: 'return block({ kind: "notice", id, tone: "muted", glyph: "cancelled", text });',
    to: 'return block({ kind: "notice", id, tone: "muted", glyph: "cancelled", text: text.toUpperCase() });',
    why:
      "every cancel notice's text is upper-cased — if this survives, T4.93, T4.94 and T4.95 are "
      + "not reading the notice `cancelledNotice` builds",
  },
  mutations: [
    {
      // **What shipped on the shell route** (F1479), half of it: the error box
      // back, the status left `partial`.
      name: "T6.111: the shell route's cancel is the error box again",
      file: EXECUTION,
      from: 'cancelled\n              ? [cancelledNotice("Cancelled.", blockId("shell-cancelled")), settled]',
      to: 'cancelled\n              ? [callStatus("error", "Cancelled.", { id: blockId("shell-cancelled") }), settled]',
      expect: "T4.94",
    },
    {
      // The other half: the notice kept, the status the route's `ok`.
      name: "T6.111: the shell route's cancel loses its `partial`",
      file: EXECUTION,
      from: 'status: cancelled ? "partial" : failed ? "error" : "ok",',
      to: 'status: failed ? "error" : "ok",',
      expect: "T4.94",
    },
    {
      // **What shipped in the queue** (F1479): a warning, ▲, on `ok`.
      name: "T6.111: the cleared queue's notice put back to warn",
      file: EXECUTION,
      from: 'cancelledDoc(item.line, "cancelled before it ran", { origin: "user", exitCode: -1 })',
      to: 'noticeDoc(item.line, "cancelled before it ran", "warn", { origin: "user" })',
      expect: "T4.95",
    },
    {
      // The composer's mark, which every route shares: `muted` obliges none, so
      // the block is still valid and draws no ⊘ anywhere.
      name: "T6.111: the mark dropped from cancelledNotice",
      file: MAPPING,
      from: 'tone: "muted", glyph: "cancelled", text });',
      to: 'tone: "muted", text });',
      expect: "T4.94",
    },
    {
      // The composer's status: every cancel document on `ok`, against C23 I10.
      name: "T6.111: cancelledDoc settles on ok",
      file: DOCS,
      from: '    status: "partial",\n    blocks: [cancelledNotice(text, blockId("notice"))],',
      to: '    status: "ok",\n    blocks: [cancelledNotice(text, blockId("notice"))],',
      expect: "T4.95",
    },
    {
      // **What shipped** (F1480): `meta()` defaults the code to 0.
      name: "T6.112: the handoff's exitCode dropped from its meta",
      file: EXECUTION,
      from: 'const metaSpec = { origin: "user", exitCode: exitCodeOf({ exitCode: exit.code, signal: exit.signal }) } as const;',
      to: 'const metaSpec = { origin: "user" } as const;',
      expect: "T4.96",
    },
    {
      // The code carried and computed by hand: a signal becomes 1, and a child
      // with neither becomes 1 — C07 I14's table written a second time, wrongly.
      name: "T6.112: the handoff's code read as code ?? 1",
      file: EXECUTION,
      from: 'exitCode: exitCodeOf({ exitCode: exit.code, signal: exit.signal }) } as const;',
      to: "exitCode: exit.code ?? 1 } as const;",
      expect: "T4.96",
    },
    {
      // **What shipped** (F1482): an exit the child never returned.
      name: "T6.113: the no-status text put back to exited 1",
      file: EXECUTION,
      from: "? `${label} did not start`",
      to: "? `${label} exited 1`",
      expect: "T4.93",
    },
    {
      // **What shipped** (F1481): a warning with ▲ on an `ok` document.
      name: "ruling 93: the key action's notice put back to warn on ok",
      file: CONSTRUCT,
      from: '          "error",\n          { origin: "refresh" },\n          "error",\n        ),',
      to: '          "warn",\n          { origin: "refresh" },\n        ),',
      expect: "T1.38c",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
