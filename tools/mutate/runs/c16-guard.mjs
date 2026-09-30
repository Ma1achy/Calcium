// C16 I69–I73 — the timed guard, its explanation, the captured arm, focus-out
// and the owner generation, mutated (review batch 3, M7).
//
// **Every one of these reads as a working guard when broken.** A guard that
// ends early still refuses the first key; a chip that stays `ready in a moment`
// is still a chip; a pointer arm that commits the focused row still commits a
// row. So each mutation names the row that sees the difference.
//
// The control is the tree before C16 I69: the guard ends on its first refusal
// where releases are not reported, and T1.181's second activation answers.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/router-dispatch.test.ts test/unit/session-mouse.test.ts " +
  "test/integration/owner-guard.test.ts test/integration/linear.test.ts";
const ROUTER = "src/interaction/router/router.ts";
const CONSTRUCT = "src/shell/construct.ts";
const CHROME = "src/shell/chrome.ts";

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
    file: ROUTER,
    from: "    guard.lastAt = now();\n    return true;\n",
    to: "    guard.lastAt = now();\n    if (!deps.keyReleasesReported()) guard = null;\n    return true;\n",
    why: "the tree before C16 I69 — the guard ends on its first refusal, and T1.181's second activation answers",
  },
  mutations: [
    {
      // T6.53 (C16 I69) — the gap is not restarted by a refusal.
      name: "a refusal does not extend the guard",
      file: ROUTER,
      from: "    guard.lastAt = now();\n    return true;\n",
      to: "    return true;\n",
      expect: "T1.181",
    },
    {
      // T6.54 (C16 I69) — ruling 52's first form: the gap from the arrival alone.
      name: "the arrival grace dropped",
      file: ROUTER,
      from: "const deadlineOf = (g: Guard): number => Math.max(g.arrivedAt + GUARD_GRACE_MS, g.lastAt + GUARD_GAP_MS);",
      to: "const deadlineOf = (g: Guard): number => g.lastAt + GUARD_GAP_MS;",
      expect: "T1.182",
    },
    {
      // C16 I70 — the latest refused key, not the first: the chip moves on every refusal.
      name: "ownerRefused follows the latest refusal",
      file: ROUTER,
      from: "    guard.refused ??= e.key;\n",
      to: "    guard.refused = e.key;\n",
      expect: "T1.185",
    },
    {
      // T6.57 (C16 I72) — the focus-out's clear deleted.
      name: "a focus-out leaves held keys and the arm",
      file: ROUTER,
      from: "        held.clear();\n        pointerArm = null;\n",
      to: "",
      expect: "T1.186",
    },
    {
      // C16 I72 — a guard waiting on a key-up survives the focus-out.
      name: "a focus-out leaves the held guard",
      file: ROUTER,
      from: '        if (guard?.arm === "held") guard = null;\n',
      to: "",
      expect: "T1.186",
    },
    {
      // T6.58 (C16 I73) — the generation dropped from the comparison.
      name: "the epoch reads the rung alone",
      file: ROUTER,
      from: "    if (rung === lastRung && generation === lastGeneration) return;\n",
      to: "    if (rung === lastRung) return;\n",
      expect: "T1.187",
    },
    {
      // C16 I73 — a question replaced by a question is not an arrival.
      name: "a generation change at the question rung guards nothing",
      file: ROUTER,
      from: '    const questionArrived = rung === "question" && (lastRung !== "question" || generation !== lastGeneration);\n',
      to: '    const questionArrived = rung === "question" && lastRung !== "question";\n',
      expect: "T1.188",
    },
    {
      // C16 I73 — a question gone leaves its guard.
      name: "the guard outlives its question",
      file: ROUTER,
      from: '    else if (rung !== "question") guard = null;\n',
      to: "",
      expect: "T1.99c",
    },
    {
      // T6.55 (C16 I71) — the arm resolves the activation at the release again.
      name: "the arm stores rowActivate",
      file: CONSTRUCT,
      from: "      const activation = keys.activationAt(hit.id, address);\n",
      to: "      const activation = keys.table.rowActivate;\n",
      expect: "T4.90",
    },
    {
      // T6.56 (C16 I71) — motion over the focused plot re-arms the legend.
      name: "motion returns the legend's arm",
      file: CONSTRUCT,
      from: "      if (onFocused && series !== null) return null;\n",
      to: "      if (onFocused && aim !== null) return aim;\n",
      expect: "T4.77",
    },
    {
      // T6.59 (C16 I70) — the chip does not name the refused key.
      name: "the chip stays `ready in a moment` after a refusal",
      file: CHROME,
      from: '      : { label: guardRefusal(refused, caps), tone: "warn" },\n',
      to: '      : { label: "ready in a moment", tone: "muted" },\n',
      expect: "T4.91",
    },
    {
      // C16 I70 — no wake for the guard: the mark outlives it until a key.
      name: "L4 does not schedule on the guard's deadline",
      file: CONSTRUCT,
      from: "      const guardAt = router.nextDeadline();\n",
      to: "      const guardAt = undefined as number | undefined;\n",
      expect: "T4.91",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
