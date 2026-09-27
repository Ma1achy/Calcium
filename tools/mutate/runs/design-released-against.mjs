// AUTHORITY.md §Release 4 — the released baseline against another ref's copy.
// Mutated (A03-DSN3): each comparison the tool makes, the first-release arm,
// and the unresolved-ref arm that stops a shallow clone passing on nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/enforce-rules.test.ts -t A03-DSN3";
const TOOL = "tools/design/released-against.mjs";

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

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TOOL,
    from: "  : `OK · ${String(kept)} entries sealed on ${ref} kept, ${String(added)} added`);",
    to: "  : `OK · ${String(kept)} entries sealed on ${ref} kept, ${String(added + 1)} added`);",
    why: "the added count off by one — the clean row reads it",
  },
  mutations: [
    {
      name: "NO-DIGEST: a rewritten digest is not compared",
      file: TOOL,
      from: "  if (n.digest !== w.digest) fail(",
      to: "  if (false) fail(",
      expect: "a sealed digest rewritten",
    },
    {
      name: "NO-REMOVAL: a removed entry is skipped rather than reported",
      file: TOOL,
      from: "  if (n === undefined) { fail(`${id}: REMOVED — it is sealed on ${ref}`); continue; }",
      to: "  if (n === undefined) continue;",
      expect: "a removed entry",
    },
    {
      name: "NO-TRANSITION: a supersededBy link may change with no status move",
      file: TOOL,
      from: "  if (!same(n.supersededBy, w.supersededBy) && !linked) fail(",
      to: "  if (false && !linked) fail(",
      expect: "a removed entry, a changed supersedes, an illegal status and a redirected link",
    },
    {
      name: "STRICT: a supersession is refused like any other change",
      file: TOOL,
      from: "w.status !== \"superseded\" && n.status === \"superseded\";",
      to: "w.status !== \"superseded\" && n.status === \"superseded\" && false;",
      expect: "a supersession",
    },
    {
      name: "NO-BASELINE-FAILS: a ref with no baseline is treated as unresolved",
      file: TOOL,
      from: "  console.log(`OK · ${ref} holds no ${path} — nothing is released there yet`);\n  process.exit(0);",
      to: "  console.error(`FAIL · ${ref} holds no ${path}`);\n  process.exit(1);",
      expect: "a ref holding no baseline",
    },
    {
      name: "SHALLOW-PASSES: an unresolved ref passes on nothing",
      file: TOOL,
      from: "a check with nothing to compare is not a pass`);\n  process.exit(1);",
      to: "a check with nothing to compare is not a pass`);\n  process.exit(0);",
      expect: "a ref holding no baseline",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
