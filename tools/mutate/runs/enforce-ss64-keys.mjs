// SS64 reads every key, and SS39's alternation is the vocabulary (A03 SS64,
// SS39; question 57).
//
// **Every mutation here leaves SS64 green on the tree.** That is the point:
// a key the parse cannot read is a mark the rule never compares, so the rule
// passes with one member fewer and no count it prints moves. `work-unit` is the
// first hyphenated token and is written quoted; the two `(\w+)` parses as they
// were drop it silently. What sees that is the suite's equality row, not the
// rule's own controls, which see a whole table vanish and not one key.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = 'npx vitest run --maxWorkers=3 test/unit/enforce-rules.test.ts -t "SS64|SS39"';
const SCANS = "tools/enforce/source-scans.mjs";
const GLYPHS = "src/presentation/blocks/glyphs.ts";

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
    // **The table's key parse as it was** — `(\w+)` — on both halves: the
    // quoted `"work-unit"` drops out, and SS64 compares seventeen marks.
    name: "GLYPH_TABLE's key parse reads a bare key only",
    file: SCANS,
    from: '      /^ {4}(?:"(?<quoted>[\\w-]+)"|(?<bare>\\w+)): \\["(?:[^"\\\\]|\\\\.)*", "((?:[^"\\\\]|\\\\.)*)"\\],/gmu),',
    to: '      /^ {4}(?<bare>\\w+): \\["(?:[^"\\\\]|\\\\.)*", "((?:[^"\\\\]|\\\\.)*)"\\],/gmu),',
    expect: "SS64 reads every key",
    also: [
      {
        file: SCANS,
        from: '      /^ {4}(?:"(?<quoted>[\\w-]+)"|(?<bare>\\w+)): \\["((?:[^"\\\\]|\\\\.)*)", "(?:[^"\\\\]|\\\\.)*"\\],/gmu),',
        to: '      /^ {4}(?<bare>\\w+): \\["((?:[^"\\\\]|\\\\.)*)", "(?:[^"\\\\]|\\\\.)*"\\],/gmu),',
      },
    ],
  },
  {
    // **The domain parse as it was**: the token keeps its marks and loses
    // its region, which SS64 would report as unclassified — if it read it.
    name: "GLYPH_DOMAINS' key parse reads a bare key only",
    file: SCANS,
    from: '  for (const m of source.slice(start, end).matchAll(/^ {2}(?:"(?<quoted>[\\w-]+)"|(?<bare>\\w+)): \\[([^\\]]*)\\],/gmu)) {',
    // `()?` holds the value at group 3, so the body reads it as it does today.
    to: '  for (const m of source.slice(start, end).matchAll(/^ {2}(?<bare>\\w+)()?: \\[([^\\]]*)\\],/gmu)) {',
    expect: "SS64 reads every key",
  },
  {
    // **The pair itself moved.** Keys still equal; the row's own response
    // arm — the hyphenated token's halves — is what sees it.
    name: "work-unit's ASCII half changes",
    file: GLYPHS,
    from: '    "work-unit": ["●", "*"],',
    to: '    "work-unit": ["●", "#"],',
    expect: "SS64 reads every key",
  },
  {
    // **SS39 keeps the retired slot** — the drift F661 records, one token.
    name: "SS39's alternation names running rather than work-unit",
    file: SCANS,
    from: "pending|working|work-unit|queued|cancelled|",
    to: "pending|working|running|queued|cancelled|",
    expect: "SS39's alternation",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): SS39 admits nothing,
    // so the alternation row fails on its own first assertion.
    file: SCANS,
    from: "(?!(?:question|current|ok|",
    to: "(?!(?:questionX|current|ok|",
    why:
      "the alternation no longer equals GLYPH_TOKENS, so SS39's row fails — if this " +
      "survives, the run's filter reaches neither row",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
