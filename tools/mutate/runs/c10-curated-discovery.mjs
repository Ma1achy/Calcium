// C10 I44 — the curated tables are discovered by the type checker, and the
// pinned, derived and discovered sets are compared by equality.
// Mutated (C10 T6.117–T6.120): a table of each initialiser shape the regex
// could not see, the classifier's call-signature test, and canon's Set arm.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/curated.test.ts";
const CURATED = "test/support/curated.ts";
const DISCOVER = "test/support/exported-tables.ts";

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
    file: CURATED,
    from: "  defaultTheme: \"`REGISTRY_THEMES` by reference",
    to: "  defaultTheme_: \"`REGISTRY_THEMES` by reference",
    why: "a derived reason renamed away from its table — T2.40's equality names both halves",
  },
  mutations: [
    {
      name: "IDENTIFIER: a table initialised from an identifier, in colormap.ts (T6.117)",
      file: "src/presentation/theme/colormap.ts",
      from: "export const COLORMAPS: Readonly<Record<string, Colormap>> = COLORMAPS_WITH_REVERSED;",
      to: "export const COLORMAPS: Readonly<Record<string, Colormap>> = COLORMAPS_WITH_REVERSED;\nexport const EXTRA_TABLE: Readonly<Record<string, Colormap>> = COLORMAPS;",
      expect: "T2.40",
    },
    {
      name: "HELPER: a helper-initialised table, in a module the old list did not name (T6.118)",
      file: "src/presentation/theme/budget.ts",
      from: "export const TONE_SMELL = 5;",
      to: "export const TONE_SMELL = 5;\nexport const EXTRA_TABLE = entryTones([]);",
      expect: "T2.40",
    },
    {
      name: "CALLABLE: the classifier drops its call-signature test (T6.119)",
      file: DISCOVER,
      from: "        if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0) continue;\n",
      to: "",
      expect: "T2.40",
    },
    {
      name: "NO-SET-ARM: canon reads a Set through the record arm (T6.120)",
      file: CURATED,
      from: "  if (v instanceof Set) return [...v].map(canon).sort(",
      to: "  if (v instanceof Set && false) return [...v].map(canon).sort(",
      expect: "T2.40a",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
