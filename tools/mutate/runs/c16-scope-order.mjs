// The keymap listing's scope order, mutated — §022's rule and its two halves.
//
// **The defect this covers was green under the design's own picture.** The
// first implementation sorted the remainder alphabetically, and §022's fixture
// agreed: it draws `global` before `transcript`, and `g` precedes `t`. A
// fixture that cannot discriminate between the rule and a coincidence is the
// reason the row is written against the prose — *preserves registry order for
// the remaining scopes* — on scopes where the two answers differ.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-keymap.test.ts";
const K = "src/interaction/router/keymap.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: K,
    from: 'const REGISTRY_SCOPE_ORDER: readonly string[] = Object.freeze(["global", "prompt", "transcript"]);',
    to: 'const REGISTRY_SCOPE_ORDER: readonly string[] = Object.freeze(["prompt", "global", "transcript"]);',
    why: "two of the registry's three scopes exchanged; a run where this survives is not comparing the order against the registry at all",
  },
  mutations: [
    {
      // **The defect, put back.** Alphabetical is what shipped for one commit
      // and what §022's picture cannot tell apart from the rule.
      name: "the remainder sorts alphabetically, as it did before §022 was read",
      file: K,
      from: "    a === here ? -1 : b === here ? 1 : rank(a) - rank(b),",
      to: "    a === here ? -1 : b === here ? 1 : a < b ? -1 : a > b ? 1 : 0,",
      expect: "T1.100",
    },
    {
      // **The registry's order dropped and the ladder left.** Every scope the
      // design names falls in among the ones it does not, which is the half
      // that puts `global` back behind six rungs.
      name: "the registry's order is ignored and FOCUS_ORDER carries everything",
      file: K,
      from: "    const reg = REGISTRY_SCOPE_ORDER.indexOf(t);\n    if (reg !== -1) return reg;",
      to: "    // the design's order, dropped",
      expect: "T1.100",
    },
    {
      // **And the other half: the ladder dropped.** The six scopes the registry
      // does not name become one rank and fall back on the sort's stability,
      // which is insertion order — an incidental order, which is the thing the
      // rule's actual content forbids.
      name: "the scopes the registry does not name are all one rank",
      file: K,
      from: "    return REGISTRY_SCOPE_ORDER.length + (focus === -1 ? FOCUS_ORDER.length : focus); // graphemes-ok — array lengths, not text",
      to: "    return REGISTRY_SCOPE_ORDER.length; // graphemes-ok — array lengths, not text",
      expect: "T1.100",
    },
    {
      // **The current scope stops leading**, which is R-KEY-005's first clause
      // and the one a reader notices before any other.
      name: "the reader's own rung is not rendered first",
      file: K,
      from: "    a === here ? -1 : b === here ? 1 : rank(a) - rank(b),",
      to: "    rank(a) - rank(b),",
      expect: "T1.100",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
