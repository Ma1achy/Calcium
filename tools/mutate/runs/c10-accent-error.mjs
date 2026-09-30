// C10 I65 (R-THM-006) — accent and error stay apart wherever colour carries.
// Mutated (C10 T6.121, T6.122) on the path a cell takes: the resolver's memo.
// The token-level collapse is the control, because C10 commitment 14 / C10 I17 refuse it
// at load — the row fails through `loadTheme`, which is certain and says nothing
// about the row's own assertions.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/theme-accent-error.test.ts";
const RESOLVE = "src/presentation/theme/resolve.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/presentation/theme/tokens.generated.ts",
    from: '          "accent": "#f0f0f0",\n',
    to: '          "accent": "#ffffff",\n',
    why: "mono's accent back on error's white — refused at load by C10 I17, so the row cannot open mono",
  },
  mutations: [
    {
      name: "MEMO-NO-REF: accent and error answer with whichever was asked first (T6.121)",
      file: RESOLVE,
      from: "  const key = `${ref}|${theme.name}|${caps.colourDepth}|${on ?? \"\"}`;",
      to: "  const key = `${theme.name}|${caps.colourDepth}|${on ?? \"\"}`;",
      expect: "T2.70",
    },
    {
      name: "MEMO-NO-DEPTH: a colour resolved at 24 bits answers at 1 (T6.122)",
      file: RESOLVE,
      from: "  const key = `${ref}|${theme.name}|${caps.colourDepth}|${on ?? \"\"}`;",
      to: "  const key = `${ref}|${theme.name}|${on ?? \"\"}`;",
      expect: "T2.70",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
