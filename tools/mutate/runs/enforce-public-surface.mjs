// Roadmap 48's signal — the public surface by use, A03 §9.
//
// **A signal has no exit status, so the vacuity class arrives differently.** A
// gate that stops matching goes green; a signal that stops matching prints a
// smaller number, and a smaller residue reads as *the surface got tighter*. Every
// mutation below makes the printed line shorter and none of them makes it wrong
// on its face — which is the argument for the rows rather than for the summary.
//
// The founding claim is the one to attack hardest: **a collision can only clear,
// so the list under-reports and cannot over-report.** Two mutations aim at it
// from opposite ends.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/enforce-rules.test.ts";
const GRAPH = "tools/enforce/module-graph.mjs";

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
  {
    // **The third bucket folded into the first**, which is the reading that
    // looks most reasonable: a test is app code, so let it clear. It sends the
    // residue past every member an example's suite is holding and nothing else
    // is.
    name: "a member named only in an example's tests clears",
    file: GRAPH,
    from: "    if (uses(tests, m)) {\n      testOnly += 1;\n      continue;\n    }",
    to: "    if (uses(tests, m)) {\n      cleared += 1;\n      continue;\n    }",
    expect: "48",
  },
  {
    // **MG24's keyword split restored**, which is the defect the build found:
    // `CompletionSource` is an interface an app *builds*, so testing it by
    // dot-access alone put four supplied members into the residue. The row that
    // catches this is the only one that distinguishes a declaration from a
    // handle, and both are published under both keywords.
    name: "an interface member is tested by dot-access alone, as MG24 tests it",
    file: GRAPH,
    from:
      "  const uses = (src, { name }) =>\n" +
      '    new RegExp(`[.?]\\\\s*${name}\\\\b|(?:^|[{,(\\\\s])${name}\\\\s*:`, "m").test(src);',
    to:
      "  const uses = (src, { name, record }) =>\n" +
      "    (record\n" +
      '      ? new RegExp(`[.?]\\\\s*${name}\\\\b|(?:^|[{,(\\\\s])${name}\\\\s*:`, "m")\n' +
      "      : new RegExp(`[.?]\\\\s*${name}\\\\b`)\n" +
      "    ).test(src);",
    expect: "48",
  },
  {
    // **The population widened to every published type in `src/`.** The number
    // grows and reads as a more thorough instrument; what it actually does is
    // answer MG24's question again, from the side the freeze does not protect.
    name: "the population is every exported type, not the entry point's",
    file: GRAPH,
    from: '.filter((m) =>\n    published.has(m.owner),\n  );',
    to: ";",
    expect: "48",
  },
  {
    // **The founding claim inverted**: ambiguity counted on the listed side.
    // The number still prints, still moves with the tree, and now measures the
    // one thing a collision cannot do — so the line would report a blind spot
    // the instrument does not have while the real one goes unstated.
    name: "ambiguity is counted over the residue rather than over the clearings",
    file: GRAPH,
    from: "      if ((owners.get(m.name)?.size ?? 1) > 1) ambiguous += 1;\n      continue;\n    }\n    if (uses(tests, m)) {",
    to: "      continue;\n    }\n    if ((owners.get(m.name)?.size ?? 1) > 1) ambiguous += 1;\n    if (uses(tests, m)) {",
    expect: "48",
  },
  {
    // **The owner dropped from the key**, so two published types sharing a
    // member name are one row. It shortens the residue silently and it is
    // exactly the looseness F160 recorded, arriving in the instrument written
    // to work around it.
    name: "members are deduplicated by name rather than by owner and name",
    file: GRAPH,
    from: "    const key = `${m.owner}.${m.name}`;\n    if (seen.has(key)) continue;",
    to: "    const key = m.name;\n    if (seen.has(key)) continue;",
    expect: "48",
  },
];

/** Survivors with a reason, and a staleness arm. */
const EXPECTED_SURVIVORS = new Map();

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: GRAPH,
    from: "    candidates.push(key);",
    to: "    void key;",
    why:
      "nothing is ever a candidate — if this survives, no row reads the residue at all and " +
      "every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
