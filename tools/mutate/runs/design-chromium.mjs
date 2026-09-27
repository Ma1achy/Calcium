// AUTHORITY.md §Browser conformance — the pinned Chromium runner. Mutated
// against its own self-test: each refusal the runner makes, the digest check,
// and the route the query selects. The subject is the runner, so the command
// is the gate that runs it — `test/browser/`, which `make design-browser` runs.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run --dir test/browser";
const TOOL = "tools/design/chromium.mjs";

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
    from: "export const FLAGS = Object.freeze([\"carrierCheck\",",
    to: "export const FLAGS = Object.freeze([\"absentCheck\", \"carrierCheck\",",
    why: "a sixth flag no page sets — every load is refused, the clean control first",
  },
  mutations: [
    {
      name: "NO-CONSOLE: console.error is not collected",
      file: TOOL,
      from: "(m.params.type === \"error\" || m.params.type === \"assert\")",
      to: "(false)",
      expect: "self-test: a console.error is refused",
    },
    {
      name: "NO-THROW: an uncaught exception is not collected",
      file: TOOL,
      from: "      if (m.method === \"Runtime.exceptionThrown\") {",
      to: "      if (false) {",
      expect: "self-test: an uncaught throw is refused",
    },
    {
      name: "SUBSET: the flag set is not compared by equality",
      file: TOOL,
      from: "  if (JSON.stringify(have) !== JSON.stringify([...FLAGS])) {",
      to: "  if (false) {",
      expect: "self-test: an absent flag is refused",
    },
    {
      name: "PRESENCE: a flag's value is not read",
      file: TOOL,
      from: "  for (const [k, v] of Object.entries(flags)) if (v !== \"pass\") out.push(`${k} = ${v}`);",
      to: "",
      expect: "self-test: a flag reading fail is refused",
    },
    {
      name: "TRUST: the digest is not compared",
      file: TOOL,
      from: "  if (got !== pinned) {",
      to: "  if (false) {",
      expect: "self-test: a changed archive is refused and removed before unpacking",
    },
    {
      name: "ROUTE-BLIND: the resolver's answer on a route is not read",
      file: TOOL,
      from: "    if (report.body.glyphCapability !== route.capability) out.push(",
      to: "    if (false) out.push(",
      expect: "self-test: a page ignoring the query is refused on the ascii route",
    },
    {
      name: "PER-SET-BLIND: a spinner the auto route skipped is not counted",
      file: TOOL,
      from: "      if (report.applied !== report.spinners) out.push(",
      to: "      if (false) out.push(",
      expect: "self-test: a spinner the auto route skipped is refused",
    },
    {
      name: "NO-QUERY: every route loads the page without its query",
      file: TOOL,
      from: "pathToFileURL(resolve(page)).href + query",
      to: "pathToFileURL(resolve(page)).href",
      expect: "self-test: the routing page passes on every route (the control)",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
