// C22 §4 gate 4 — a terminal too small (F67).
//
// **Both halves of this were unbuilt and each failed silently**, and neither
// could fail inside a unit test: the unit rows hand `drawFallback` their own
// spy sink, so a fallback written into C01's `debug` sink renders perfectly to
// them, and a fake lifecycle delivers a resize the real one dropped. So the
// suite here is tier 5, and the mutations restore exactly what shipped.
//
// `run` rebuilds, because tier 5 runs against `dist/`.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
// **Filtered to the rows under test, and that is not narrowing for
// convenience.** `test/e2e/lifecycle.test.ts` carries one pre-existing failure
// — C22 T5.6, piping the shell to `cat`, which waits on `❯` while this PTY has
// no `LANG` and so renders the ASCII prompt — and the harness rightly refuses
// to report against a suite that is already red. Excluded by name rather than
// by widening what counts as a kill.
const CMDS = [
  'npx vitest run test/e2e/lifecycle.test.ts --no-file-parallelism -t "T4.21"',
  'npx vitest run test/edge/lifecycle.test.ts -t "T3.18c"',
];

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    execSync("npm run build", { cwd: ROOT, stdio: "ignore" });
    return CMDS.map((c) => {
      try {
        return execSync(`${c} 2>&1`, { cwd: ROOT, encoding: "utf8" });
      } catch (e) {
        return `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
    }).join("\n");
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/fallback.ts",
    from: "  if (lines.length === 0) return;",
    to: "  if (lines.length >= 0) return;",
    why: "T4.21 waits on the fallback's text in a real PTY; a `drawFallback` that never writes cannot satisfy it, so a run where this survives is a run that cannot see a kill",
  },
  mutations: [
    {
      name: "the fallback goes back to `config.stdout`",
      file: "src/shell/session.ts",
      from: "drawFallback(size, (s) => void this.#graph?.lifecycle.writer.write(s));",
      to: "drawFallback(size, (s) => void this.config.stdout.write(s));",
      expect: "T4.21",
    },
    {
      name: "SIGWINCH is dropped outside `acquired` again",
      file: "src/terminal/lifecycle.ts",
      from: '    if (state === "suspended" || state === "released") return;',
      to: '    if (state !== "acquired") return;',
      expect: "T4.21b",
    },
    {
      name: "the fallback names neither the size it has nor the one it needs",
      file: "src/shell/fallback.ts",
      from: "    fitCells(`${String(size.columns)}x${String(size.rows)}`, size.columns),\n    fitCells(`Needs ${String(MIN_COLUMNS)}x${String(MIN_ROWS)}`, size.columns),",
      to: "    fitCells(`Resize the window`, size.columns),",
      expect: "T4.21",
    },
    {
      name: "the columns bound is dropped, so 30x16 opens",
      file: "src/shell/fallback.ts",
      from: "  return size.columns < MIN_COLUMNS || size.rows < MIN_ROWS;",
      to: "  return size.rows < MIN_ROWS;",
      expect: "T4.21",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
