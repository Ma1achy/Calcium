// A03 SS47 judges a literal's decoded value, not its spelling (F1326).
//
// **Each mutation restores one way the rule could read a spelling rather than
// a value.** The first is the rule as it shipped: the source characters,
// under which `"│"` is six ASCII characters. The second decodes with a
// bare `\u` pattern and so reads `"\\u2502"` — a backslash and six ASCII
// characters — as `│`, which is the grammar SS57's own copy had. The third
// forgets `\xNN`. The rows that must see them are A03 SS47's fabricated
// violation in `enforce-rules.test.ts` and its real-tree equality row in
// `enforce-module-graph.test.ts`.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run --maxWorkers=3 test/unit/enforce-rules.test.ts test/unit/enforce-module-graph.test.ts -t SS47";
const SCANS = "tools/enforce/source-scans.mjs";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **F1326 itself**: the spelling judged. The escaped fixtures stop firing,
    // and on the tree eight excused files carry no mark the rule can see.
    name: "SS47 judges the source characters",
    file: SCANS,
    from: "const marks = [...decodeLiteral(body)].filter(",
    to: "const marks = [...body].filter(",
    expect: "SS47 judges a literal's value",
  },
  {
    // **A decoder that does not consume `\\` first**: the escaped backslash
    // decodes as `│`. Only the fabricated row's `\\u2502` fixture can see it —
    // the tree has no such literal.
    name: "decodeLiteral matches \\u after an escaped backslash",
    file: SCANS,
    from: "|x([0-9a-fA-F]{2})|[\\s\\S])/gu, (all, braced, plain, byte) =>",
    to: "|x([0-9a-fA-F]{2}))/gu, (all, braced, plain, byte) =>",
    expect: "SS47 judges a literal's value",
  },
  {
    // **`\xNN` forgotten**: `\xb6` stays ASCII, and on the tree `rows.ts`'s
    // `\x9c` stops firing, so its entry outlives its reason.
    name: "decodeLiteral forgets \\xNN",
    file: SCANS,
    from: "    : byte !== undefined ? String.fromCharCode(Number.parseInt(byte, 16))\n",
    to: "    : byte !== undefined ? `\\\\x${byte}`\n",
    expect: "SS47 judges a literal's value",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's corpus can see**: `│` admitted as prose. The
    // fabricated row's literal control stops firing, and on the tree the
    // files whose only mark is `│` stop firing too.
    file: SCANS,
    from: 'const PROSE_MARKS = new Set("—§·×≤≥→«»⚠");',
    to: 'const PROSE_MARKS = new Set("—§·×≤≥→«»⚠│");',
    why: "│ passing as prose fails SS47's literal control — if this survives, the -t filter reaches no SS47 row",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
