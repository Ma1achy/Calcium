// C22 I131–I132, C09 I120 — one-shots stamped by the shell, timed on every
// carrier, and silent once they end. Mutated (C22 T6.125–T6.131, C09
// T6.135–T6.136).
//
// **Every row here was shaped by a survivor.** The first draft of T4.107 was
// met by a restamp on every poll, because a 20 ms poll pins the effect at frame
// 0 and frame 0 draws nothing new; then by an identity without the effect,
// because the tick advances only while something animates, so an inherited
// stamp still drew the sweep's last frames; the memo and the evict branch
// survived until T4.108 asked for them by name. So each mutation below is one
// that a plausible row passed, which is what the list is for.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/one-shots.test.ts test/integration/one-shots.test.ts";
const RAMP = "src/presentation/blocks/ramp.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const STORE = "src/shell/one-shots.ts";
const SESSION = "src/shell/session.ts";
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

const results = runPass({
  read,
  write,
  run,
  control: {
    file: RAMP,
    from: "const POP_TICKS = 6;",
    to: "const POP_TICKS = 600;",
    why: "a pop a hundred times as long never settles inside T4.106's window, and T2.181's bound moves with it",
  },
  mutations: [
    {
      name: "UNSTAMPED: the session lays out the producer's blocks, not the stamped ones",
      file: SESSION,
      from: "    const blocks = graph.oneShots.stamp(entry.id, entry.doc.blocks, tick);",
      to: "    const blocks = entry.doc.blocks;",
      expect: "T4.106",
    },
    {
      // A 20 ms poll re-stamps at the current tick and pins the effect at frame
      // 0 — which draws nothing new, so a *no replay* row passes it. T4.107
      // polls slower than the effect and reads *plays* after the first draw.
      name: "RESTAMPED: the store forgets a stamp, so every new array is stamped afresh",
      file: STORE,
      from: "        let held = stamps.get(key);",
      to: "        let held: { since: number } | undefined = undefined;",
      expect: "T4.107",
    },
    {
      name: "EFFECT-BLIND: the identity drops the effect, so a sweep inherits the wipe's stamp",
      file: STORE,
      from: "        const key = `${block.id}\\u0000${address}\\u0000${ramp.animate}`;",
      to: "        const key = `${block.id}\\u0000${address}`;",
      expect: "T4.107",
    },
    {
      name: "OVERWRITES: a producer's own since is stamped over",
      file: STORE,
      from: "if (ramp.since !== undefined || ramp.animate === undefined",
      to: "if (ramp.animate === undefined",
      expect: "T4.106",
    },
    {
      // No frame sees this: the store still remembers the stamp.
      name: "UNMEMOISED: a still document is re-stamped into a new array every frame",
      file: STORE,
      from: "    if (held !== undefined) return held;",
      to: "    if (held !== undefined && false) return held;",
      expect: "T4.108",
    },
    {
      name: "EVICT-KEEPS: the evict branch forgets the stamps",
      file: CONSTRUCT,
      from: "          oneShots.delete(id);\n",
      to: "",
      expect: "T4.108",
    },
    {
      name: "NO-TICK: the cadence is asked without the tick, so a finished one-shot keeps the ticker",
      file: SESSION,
      from: "animationIntervalOf(windowed.blocks, { tick, width }, graph.capabilities)",
      to: "animationIntervalOf(windowed.blocks, undefined, graph.capabilities)",
      expect: "T4.106",
    },
    {
      name: "BAR-UNSTAMPED: the bar calls animateT without the ramp's since",
      file: SIMPLE,
      from: "              ramp?.since,\n",
      to: "",
      expect: "T2.181",
    },
    {
      name: "NEVER-DONE: a one-shot never finishes",
      file: RAMP,
      from: "  return Math.max(0, Math.floor(tick)) - Math.floor(ramp.since) >= ticks;",
      to: "  return false;",
      expect: "T2.181",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
