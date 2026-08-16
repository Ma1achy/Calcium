// C13 I20 — the wiring, not the mechanism.
//
// **Every mutation here is a removal**, which is the argument for the tier: each
// one leaves the writer, the policy and the loader exactly as the unit rows
// assert them, and breaks the arc between. A seam-level row passes on the day
// nothing calls it, so what is mutated is the call site.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/transcript-persist.test.ts";
const CONSTRUCT = "src/shell/construct.ts";
const SHUTDOWN = "src/shell/shutdown.ts";

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
    // **The writer never reaches the exit path.** Nothing flushes at `stop`,
    // and the entry lost is the one the user just ran — which is the whole
    // reason `drain` is synchronous.
    name: "the transcript writer is not drained at exit",
    file: CONSTRUCT,
    from: "makeBeforeRelease(runner, stores.history, [stores.transcriptWriter])",
    to: "makeBeforeRelease(runner, stores.history)",
    expect: "T4.40a",
  },
  {
    // **The list ignored inside the shared function**, which is the same
    // failure one layer down: the call site is right and the callee drops it.
    // Both are here because either alone leaves the other expressible.
    name: "beforeRelease drains history and nothing else",
    file: SHUTDOWN,
    from: "    for (const d of also) d.drain();",
    to: "",
    expect: "T4.40a",
  },
  {
    // **The policy resolved before the manifest is loaded.** Every verb reads
    // as undeclared, the file is never written, and no error appears anywhere:
    // an app that declared persistence simply does not get it.
    name: "the policy is resolved from no manifest",
    file: CONSTRUCT,
    from: "    const policy = persistPolicy(built.manifest.manifest ?? null, config);",
    to: "    const policy = persistPolicy(null, config);",
    expect: "T4.37",
  },
  {
    // **The subscription registered before the resume loop**, so loading
    // rewrites what it read and the file doubles on every start. Silent,
    // because a session showing each entry twice reads as a session that ran
    // each command twice.
    name: "the resume loop runs after the subscription",
    file: CONSTRUCT,
    from: "      for (const doc of loaded.docs) transcript.append(doc);",
    to: "",
    expect: "T4.38",
  },
  {
    // The other direction of the same wiring: writing on `patch` as well, which
    // is §5b.2's whole finding — a row written before it stopped changing.
    name: "a patch writes a row as well as a settle",
    file: CONSTRUCT,
    from: '        if (change.kind !== "append" && change.kind !== "settle") return;',
    to: '        if (change.kind === "evict" || change.kind === "clear") return;',
    expect: "T4.38",
  },
  {
    // **The `.gitignore` dropped.** A persisted transcript in a project
    // directory is a file that can be committed, and the defence costs one line.
    name: "the state directory does not ignore itself",
    file: CONSTRUCT,
    from: '      await config.fs.writeFile(`${config.stateDir}/.gitignore`, "*\\n").catch(() => undefined);',
    to: "",
    expect: "T4.40",
  },
];

/** Survivors with a reason, and a staleness arm. */
const EXPECTED_SURVIVORS = new Map([
  [
    "a patch writes a row as well as a settle",
    "**no tier-4 fixture in this repository constructs a STREAMING entry**, so the `patch` arm " +
      "has no subject here and the mutation changes nothing observable. Streaming arrives through " +
      "an adapter declaring `streams: true`, which the session harness has no fixture for — the " +
      "local-handler route returns one document and settles at append. The ruling it protects is " +
      "C13 §5b.2's whole finding, so this is a **coverage gap named rather than a mutation " +
      "retired**: the day the harness gains a streaming fixture this becomes stale and the arm " +
      "below says so. Tier 5's `transcript.test.ts` T5.6 now runs the sequence over a real " +
      "streaming entry — append, patch, patch, settle, one row on disk — but it **restates** " +
      "the rule rather than calling the wired one, so a mutation here still does not reach " +
      "it. The ruling is covered and the wiring is not, which is the honest description and " +
      "the reason this stays listed",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: CONSTRUCT,
    from: "        transcriptWriter.write(entry.doc);",
    to: "        void entry;",
    why:
      "nothing is ever written by a session — if this survives, no row reaches the file through " +
      "the pipeline and every kill below is unearned",
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
