// C23 §3b — part refresh, stall detection and the teardown set.
//
// **The mechanism this file mutates was mutated into existence.** Two defects in
// shipped code were found by running a truthful clock against it — a timer armed
// once, and a notice whose block id was already taken — and a third by the row
// that asserts a stagger is *spent* rather than computed. Each has a mutation
// here, because the thing that found them once is what keeps them found.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/contract/refresh.test.ts",
  "test/unit/execution.test.ts",
  "test/contract/builders.test.ts",
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
    from: "          if (put(host, part, child)) deps.commit(\"stream\");",
    to: "          if (false) deps.commit(\"stream\");",
    why: "T1.35 asserts a successful fetch replaces the part's child",
  },
  mutations: [
    // --- the two defects that shipped ----------------------------------------
    {
      name: "stall: arm the timer once instead of re-arming",
      file: "src/shell/refresh.ts",
      from: "      deps.schedule(() => {\n        tick();\n        arm();\n      }, STALL_MS / 4),",
      to: "      deps.schedule(() => {\n        tick();\n      }, STALL_MS / 4),",
      expect: "T1.30",
    },
    {
      name: "stall: always append the notice, never replace",
      file: "src/shell/refresh.ts",
      from: "        state.hasNotice\n          ? { op: \"replace\", blockId: STALL_BLOCK, block: notice }\n          : { op: \"append\", block: notice },",
      to: "        { op: \"append\", block: notice },",
      expect: "T1.30",
    },
    // --- the stagger the loop could not spend --------------------------------
    {
      name: "parts: sweep on the stall timer instead of arming to the next due part",
      file: "src/shell/refresh.ts",
      from: "    partTimer = deps.schedule(() => {\n      sweepParts();\n      armParts();\n    }, Math.max(0, soonest - now));",
      to: "    partTimer = deps.schedule(() => {\n      sweepParts();\n      armParts();\n    }, STALL_MS / 4);",
      expect: "T1.31",
    },
    {
      name: "parts: assign every offset zero",
      file: "src/shell/refresh.ts",
      from: "  return parts.map((p, i) => ({ ...p, offsetMs: step * i }));",
      to: "  return parts.map((p) => ({ ...p, offsetMs: 0 }));",
      expect: "T1.31",
    },
    // --- A02 §7's rules ------------------------------------------------------
    {
      name: "rule 2: retry a render throw by counting it as a failure",
      file: "src/shell/refresh.ts",
      from: "            put(host, part, part.spec.renderError(shown, null));",
      to: "            part.failures += 1;\n            put(host, part, part.spec.renderError(shown, backoffOf(part.spec.intervalMs, part.failures)));",
      expect: "T1.33",
    },
    {
      name: "rule 3: let a one-shot part retry",
      file: "src/shell/refresh.ts",
      from: "    if (part.spec.intervalMs === 0) part.done = true;",
      to: "    if (false) part.done = true;",
      expect: "T1.34",
    },
    {
      name: "backoff: do not reset on success",
      file: "src/shell/refresh.ts",
      from: "          part.failures = 0;",
      to: "          part.failures = part.failures;",
      expect: "T1.32",
    },
    // --- the in-flight guard --------------------------------------------------
    {
      name: "overlap: start a tick while the previous fetch is in flight",
      file: "src/shell/refresh.ts",
      from: "        if (part.done || part.inFlight) continue;",
      to: "        if (part.done) continue;",
      expect: "T3.40",
    },
    // --- the teardown set (C23 I33) ----------------------------------------------
    {
      name: "teardown: ignore eviction and clear",
      file: "src/shell/refresh.ts",
      from: "    else if (change.kind === \"evict\") {",
      to: "    else if (change.kind === \"never\") {",
      expect: "T3.30b",
    },
    {
      name: "teardown: release on settle *and* on the arrival of a newer entry",
      file: "src/shell/refresh.ts",
      from: "    if (change.kind === \"settle\") release({ kind: \"entry\", id: change.id });",
      to: "    if (change.kind === \"settle\" || change.kind === \"append\") hosts.clear();",
      expect: "T2.21",
    },
    {
      // `dispose` stops three ways — the `stopped` flag, the part timer and the
      // host map — and any one suffices, so no single-line removal can die.
      // This leaves only `stopped`, which does not disarm a timer that is
      // already pending: one more sweep runs before anything notices.
      name: "teardown: dispose relies on the stopped flag alone",
      file: "src/shell/refresh.ts",
      from: "      hosts.clear();\n      partTimer?.[Symbol.dispose]();\n      partTimer = null;",
      to: "",
      expect: "T2.20",
    },
    // --- staleness (C23 I35) -----------------------------------------------------
    {
      name: "staleness: drop the marker",
      file: "src/shell/refresh.ts",
      from: "    if (!part.stale) return part.spec.title;",
      to: "    return part.spec.title;",
      expect: "T1.36",
    },
    {
      name: "staleness: call a part that has never succeeded stale",
      file: "src/shell/refresh.ts",
      from: "          part.lastOk !== null &&\n          now - part.lastOk >= part.spec.staleAfterMs",
      to: "          now - (part.lastOk ?? 0) >= part.spec.staleAfterMs",
      expect: "T1.36b",
    },
    {
      name: "staleness: stop refreshing once stale",
      file: "src/shell/refresh.ts",
      from: "          part.stale = true;",
      to: "          part.stale = true;\n          part.done = true;",
      expect: "T1.36",
    },
    {
      name: "rhythm: drop the declared block's gapBefore on the first patch",
      file: "src/shell/refresh.ts",
      from: "      existing?.gapBefore === true ? ({ ...base, gapBefore: true } as Block) : base;",
      to: "      base;",
      expect: "T1.35b",
    },
    // --- C23 I34, one block one patch --------------------------------------------
    {
      name: "atomicity: patch the child directly instead of the panel",
      file: "src/shell/refresh.ts",
      from: "    const base = livePanel(part.spec.id, titleOf(part), child);",
      to: "    const base = child as Panel;",
      expect: "T1.35",
    },
    // --- b.live's declaration errors -----------------------------------------
    {
      name: "b.live: accept a staleAfter below every",
      file: "src/shell/builders/index.ts",
      from: "  if (spec.every !== undefined && spec.staleAfter !== undefined && spec.staleAfter < spec.every) {",
      to: "  if (false) {",
      expect: "T3.6",
    },
    {
      name: "b.live: accept both fetch and stream",
      file: "src/shell/builders/index.ts",
      from: "  if (spec.fetch !== undefined && spec.stream !== undefined) {",
      to: "  if (false) {",
      expect: "T3.4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
