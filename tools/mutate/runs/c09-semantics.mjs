// The semantic node — every block, every element (C09 §7h, I116–I118, §107).
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/semantics.test.ts";
const S = "src/presentation/blocks/semantics.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  { name: "an error notice is a note", file: S, from: '  if (block.kind === "notice" && block.tone === "error") return "alert";\n', to: "", expect: "T2.177" },
  { name: "an application kind is a group", file: S, from: ': "document";\n}', to: ': "group";\n}', expect: "T2.177" },
  { name: "a rule's name is empty", file: S, from: '    case "rule":\n', to: "", expect: "T2.178" },
  { name: "a panel is named by nothing", file: S, from: '    case "panel":\n      return block.title;\n', to: "", expect: "T2.178" },
  { name: "progress's valueText is a ratio", file: S, from: "valueText: `${String(block.current)} of ${String(block.total)}`", to: "valueText: `${String(block.current)}/${String(block.total)}`", expect: "T2.178" },
  { name: "a retrying status is not busy", file: S, from: '(block.state === "loading" || block.state === "retrying")', to: '(block.state === "loading")', expect: "T2.178" },
  { name: "an error status is busy", file: S, from: '(block.state === "loading" || block.state === "retrying")', to: '(block.state !== "empty")', expect: "T2.178" },
  { name: "a stale panel is not stale", file: S, from: '  if (block.kind === "panel" && block.staleForMs !== undefined) return ["stale"];\n', to: "", expect: "T2.178" },
  { name: "an activating element offers no confirm", file: S, from: '    ...(e.activate !== undefined || e.viewState === true ? ["confirm"] : []),\n', to: "", expect: "T2.179" },
  { name: "position counts from zero", file: S, from: "position: Object.freeze({ index: index + 1, of }),", to: "position: Object.freeze({ index, of }),", expect: "T2.179" },
  { name: "a copy is not an action", file: S, from: '    ...(e.copy !== undefined ? ["copy"] : []),\n', to: "", expect: "T2.179" },
  { name: "containers nest their elements, not their children", file: S, from: 'if (block.kind === "panel" || block.kind === "group" || block.kind === "scroll" || block.kind === "mosaic") {', to: 'if (block.kind === "panel" || block.kind === "scroll" || block.kind === "mosaic") {', expect: "T2.179" },
  { name: "the elements are taken at a fixed width", file: S, from: "  const elements = elementsOf(block, width);\n", to: "  const elements = elementsOf(block, 80);\n", expect: "T2.179" },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: every node's role is `document`.
    file: S,
    from: "  return isKnown(block.kind) ? SEMANTIC_ROLES[block.kind] : \"document\";",
    to: "  return \"document\";",
    why: "every block reads `document` — if this survives, nothing reads the role",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
