// C16 I78 — every focus target with keymap rows has a rung handler that
// consumes them, mutated (C16 T6.66; F1339, F765).
//
// **Each mutation is the defect as it shipped**: the composition root's
// registration at one target absent, so the router's own rung takes `⌃c` and
// every table row at the target resolves and is never consulted. `watchRow`
// and `nativeSelection` are the two measured instances; T2.17 is the row over
// `FOCUS_ORDER` that has to see both. The control is the prompt's registration
// removed, which T1.4h2 reads directly — a bound newline and typed text land
// nowhere.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run --maxWorkers=3 test/unit/session-keys.test.ts";
const CONSTRUCT = "src/shell/construct.ts";

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

/** One target's registration, the four-line shape both instances share. */
const registration = (target) =>
  `    router.register("${target}", (e) => {\n` +
  `      const effect = bound("${target}", e);\n` +
  "      if (effect === null) return false;\n" +
  "      effect();\n" +
  "      return true;\n" +
  "    });\n";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CONSTRUCT,
    from: '    router.register("prompt", promptKeys);\n',
    to: "",
    why: "T1.4h2 asserts a bound newline and typed text at the prompt; with no handler at the target neither lands",
  },
  mutations: [
    {
      name: "C16 T6.66: the composition root's `watchRow` registration removed (F1339)",
      file: CONSTRUCT,
      from: registration("watchRow"),
      to: "",
      expect: "T2.17",
    },
    {
      name: "C16 T6.66: the composition root's `nativeSelection` registration removed (F765)",
      file: CONSTRUCT,
      from: registration("nativeSelection"),
      to: "",
      expect: "T2.17",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
