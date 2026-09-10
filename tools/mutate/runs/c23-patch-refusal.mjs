// C23 I70 / §8h — what a refused patch means, and which release drops a readout.
//
// **The subject was one boolean.** `put` returned `outcome.ok`, so three reasons
// had one disposition and the caller released a live host on the one that means
// *the shell built something this document cannot take* — taking the part's
// siblings and the entry's running card with it, and discarding the sentence
// that explained any of it (F1002). Every mutation below is one of the four
// answers collapsed back into another.
//
// The last three are the row the ruling's own test found: a housekeeping release
// and an I33 teardown share one name, and only the second means the entry is over.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/contract/refresh.test.ts",
  "test/contract/document-view.test.ts",
  "test/integration/refresh-refusal.test.ts",
].join(" ");

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${SUITE} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/refresh.ts",
    from: '      case "ok":\n        return true;',
    to: '      case "ok":\n        return false;',
    why: "nothing would ever count as landed, so T1.35's commit and every figure below it stop",
  },
  mutations: [
    // --- the shipped defect, in the line it lived on --------------------------
    {
      name: "collapse: every refusal is the host being gone (the shipped behaviour)",
      file: "src/shell/refresh.ts",
      from: '    if (outcome.reason !== "patch") return { kind: "hostGone" };',
      to: "    return { kind: \"hostGone\" };",
      expect: "T3.65",
    },
    {
      name: "collapse: release the host on a refusal rather than stopping the part",
      file: "src/shell/refresh.ts",
      from: '      case "refused":',
      to: '      case "refused":\n        release(part.host);',
      expect: "T3.65",
    },
    // --- the report ------------------------------------------------------------
    {
      name: "report: drop the fault, keep the stop (the silent half of F1002)",
      file: "src/shell/refresh.ts",
      from: '        deps.fault(`live part "${part.spec.id}"`, result.error.message);',
      to: "",
      expect: "T3.65",
    },
    {
      name: "report: a part whose block has gone is reported too",
      file: "src/shell/refresh.ts",
      from: '      case "partGone":\n        stopPart(part);',
      to: '      case "partGone":\n        stopPart(part);\n        deps.fault(`live part "${part.spec.id}"`, "gone");',
      expect: "T3.66",
    },
    // --- the discriminator ------------------------------------------------------
    {
      name: "axis: every refusal is a defect, whether or not the block is there",
      file: "src/shell/refresh.ts",
      from: "    return entryHolds(host.id, part.spec.id)",
      to: "    return true",
      expect: "T3.66",
    },
    {
      name: "axis: no refusal is a defect, so nothing is ever reported",
      file: "src/shell/refresh.ts",
      from: "    return entryHolds(host.id, part.spec.id)",
      to: "    return false",
      expect: "T3.65",
    },
    // --- stopping ---------------------------------------------------------------
    {
      name: "stop: leave a refused part polling against a document that refuses it",
      file: "src/shell/refresh.ts",
      // The anchor is the two statements and not the comment above them: a
      // mutation quoting a citation puts a bare invariant number in a file the
      // reference scan cannot resolve one in (SP3).
      from: "        stopPart(part);\n        deps.fault(",
      to: "        deps.fault(",
      expect: "T3.65",
    },
    {
      name: "stop: stopPart detaches but leaves the live source in place",
      file: "src/shell/refresh.ts",
      from: "    part.source = { ...deadSource(part.source.key, part.spec), parts: new Set<Part>() };",
      to: "",
      expect: "T3.71",
    },
    // --- the host really going ----------------------------------------------------
    {
      // **Expected survivor, and the reason is §8h H2's own sentence.** By the
      // time a part's patch answers `unknown`, C13's change has already released
      // the host in the same synchronous turn — and if it had not, the sweep's
      // housekeeping release reaches the same state one wake later, because a
      // part stopped this way has a dead source too. So the arm is a belt to two
      // braces and there is no state in which the choice is observable. It stays
      // because the alternative leaves the host in the map until a sweep, and a
      // leak with no symptom is what this file has been bitten by twice.
      expectedSurvivor: true,
      name: "over-correction: a host that has gone stops one part and leaves its siblings",
      file: "src/shell/refresh.ts",
      from: '      case "hostGone":\n        release(part.host);',
      to: '      case "hostGone":\n        stopPart(part);',
      expect: "T3.67",
    },
    // --- which release drops the readout (§8h H8) -----------------------------------
    {
      name: "readout: housekeeping releases a host whose card is still running",
      file: "src/shell/refresh.ts",
      from: "  const finished = (entry: { host: RefreshHost; parts: Part[] }): boolean =>\n    entry.parts.every((p) => p.source.done) &&\n    !(entry.host.kind === \"entry\" && readouts.has(entry.host.id));",
      to: "  const finished = (entry: { host: RefreshHost; parts: Part[] }): boolean =>\n    entry.parts.every((p) => p.source.done);",
      expect: "T3.70",
    },
    {
      name: "readout: the wake and the sweep disagree, which is a zero-delay spin",
      file: "src/shell/refresh.ts",
      from: "      [...hosts.values()].some((e) => finished(e));",
      to: "      [...hosts.values()].some((e) => e.parts.every((p) => p.source.done));",
      expect: "T3.70",
    },
    // --- the wiring, which no driver-level row can see --------------------------------
    {
      name: "wiring: the pipeline builds the driver with a sink that reports nowhere",
      file: "src/shell/execution.ts",
      from: "    fault: contain,",
      to: "    fault: () => undefined,",
      expect: "T4.69",
    },
  ],
});

console.log(report(results));
/**
 * **The expected survivor is named rather than dropped**, and it still runs: a
 * mutation nobody applies is a claim nobody re-measures, and the day this arm
 * becomes observable is the day the run should go red for the opposite reason.
 * Its own comment above carries the argument; this is only the gate.
 */
const EXPECTED = new Set([
  "over-correction: a host that has gone stops one part and leaves its siblings",
]);
const unexpected = results.filter((r) => !r.killed && !EXPECTED.has(r.name));
for (const r of results) {
  if (r.killed && EXPECTED.has(r.name)) {
    console.log(`NOTE: "${r.name}" was expected to survive and did not — the arm is observable now`);
  }
}
process.exit(unexpected.length > 0 ? 1 : 0);
