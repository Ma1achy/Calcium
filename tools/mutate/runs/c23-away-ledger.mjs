// C23 I84–I86 — the away ledger, and its wiring in the composition root
// (ruling 51, R-BLK-314). Mutated (C23 T6.103).
//
// **One expected survivor, and it is the plan's own target.** Review batch 3's
// plan named *remove the "mark after append" order* as the mutation L6's row
// should catch. The walk's row L11 — an away mark already open when the child
// attaches — is why it cannot: no ordering of the attached mark's open reaches
// a mark that was open before the attach, so the exclusion by id is the
// mechanism for both, and with it in place the order changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/away.test.ts test/integration/away-ledger.test.ts " +
  "test/integration/notify.test.ts test/unit/support-screen.test.ts";
const AWAY = "src/shell/away.ts";
const CONSTRUCT = "src/shell/construct.ts";
const SCREEN = "test/support/screen.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    name: "NO-EXCLUSION: the child's entry is not excluded (C23 T6.103)",
    file: CONSTRUCT,
    from: "        ledger.exclude(entryId);\n",
    to: "",
    expect: "T4.86",
  },
  {
    name: "FORWARD-ONLY: the exclusion refuses later records and keeps the one already made",
    file: AWAY,
    from: "      for (const [kind, held] of marks) marks.set(kind, held.filter((s) => s.id !== id));\n",
    to: "",
    expect: "T4.86",
  },
  {
    name: "MARK-BEFORE-APPEND: the attached mark opens before the child's entry is appended",
    file: CONSTRUCT,
    from:
      "      append: (id, blocks) =>\n" +
      "        stores.transcript.append(\n" +
      "          compose({ command: childCommand(id), blocks: [childBlock(id, blocks)] }),\n" +
      "        ),",
    to:
      "      append: (id, blocks) => {\n" +
      '        ledger.open("attached");\n' +
      "        return stores.transcript.append(\n" +
      "          compose({ command: childCommand(id), blocks: [childBlock(id, blocks)] }),\n" +
      "        );\n" +
      "      },",
    expect: "T4.86",
  },
  {
    name: "EVERY-MARK: a close reports without dropping what it reported from the other marks (C23 T6.103)",
    file: AWAY,
    from: "      for (const [other, rest] of marks) marks.set(other, rest.filter((s) => !ids.has(s.id)));\n",
    to: "",
    expect: "T4.85",
  },
  {
    name: "SETTLE-ORDER: failures are not put first",
    file: AWAY,
    from: "      return [...held.filter((s) => s.failed), ...held.filter((s) => !s.failed)];",
    to: "      return [...held];",
    expect: "T4.83",
  },
  {
    name: "SESSION-SPEAKS: a session close appends its notice",
    file: CONSTRUCT,
    from: '        if (reason !== "session") sayLedger("attached", settlements);',
    to: '        sayLedger("attached", settlements);',
    expect: "T4.87",
  },
  {
    name: "UNASKED: a focus report opens a mark where no rung asked for reports",
    file: CONSTRUCT,
    from:
      "        if (notifier === null) return false;\n" +
      "        notifier.focus(e.focused);\n",
    to: "        notifier?.focus(e.focused);\n",
    expect: "T4.84",
  },
  {
    name: "NO-FRAME: the return appends its notice and commits no frame",
    file: CONSTRUCT,
    from: '      if (events.length === 0 && returned) scheduler.commit("input");\n',
    to: "",
    expect: "T4.84",
  },
  {
    name: "SHELL-COUNTED: a shell-origin notice is a command entry",
    file: AWAY,
    from: '  !entry.streaming && entry.doc.command !== "" && !excluded.has(entry.id);',
    to: "  !entry.streaming && !excluded.has(entry.id);",
    expect: "T4.86",
  },
  {
    name: "STREAM-COUNTED: an entry still streaming counts as settled",
    file: AWAY,
    from: '  !entry.streaming && entry.doc.command !== "" && !excluded.has(entry.id);',
    to: '  entry.doc.command !== "" && !excluded.has(entry.id);',
    expect: "T1.97",
  },
  {
    name: "SECOND-ABSENCE: a second ESC [ O restarts the away mark",
    file: AWAY,
    from: "      if (!marks.has(kind)) marks.set(kind, []);",
    to: "      marks.set(kind, []);",
    expect: "T1.97",
  },
  {
    name: "OSC-DRAWN: the screen model draws an OSC's payload again",
    file: SCREEN,
    from: "        if (osc !== null && osc.index === i) {",
    to: "        if (osc !== null && osc.index === i && false) {",
    expect: "T4.105",
  },
];

const EXPECTED_SURVIVORS = new Map([
  [
    "MARK-BEFORE-APPEND: the attached mark opens before the child's entry is appended",
    "equivalent under the retroactive exclusion, and that is the finding. The plan named the " +
      "order as L6's mechanism; the walk's L11 is an away mark already open at the attach, " +
      "which no ordering of the attached mark reaches, so the exclusion has to remove what a " +
      "mark recorded before the id was known — and once it does, it covers the attached mark " +
      "too. If this is ever caught, the exclusion has stopped being retroactive or the child " +
      "is no longer excluded by id, and T6.103's row wants re-reading.",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: AWAY,
    from: "  if (settlements.length === 0) return null;",
    to: "  return null;",
    why: "the ledger never says anything — every row that reads a notice fails, so if this survives no row reaches the ledger at all",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
