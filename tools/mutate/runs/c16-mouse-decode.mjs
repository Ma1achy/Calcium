// C16 I30 — the SGR mouse arm carries every bit the terminal sent, mutated.
//
// **Two bits of eight was the tree's state**: `code >= 64 ? (code === 64 ?
// "wheelUp" : "wheelDown") : \`button${code & 3}\`` decided everything the event
// carried, so ctrl-wheel-up (80) scrolled down, shift-click was click and a
// mode-1002 drag was a stream of presses no consumer could tell from clicks
// (C16 §2's table). The control is the wheel line restored; the mutations are
// the modifiers masked back out and the motion bit dropped. Every row asserts
// the whole record, which is why a masked bit kills a row rather than passing
// one that only looked at `button`.
//
// Anchors and expectations are Lane M's, each run by hand on 2026-09-05:
// control → T1.3k and T1.3n die; mask → T1.3l (T1.3k, T1.3m collateral);
// motion → T1.3m alone.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-decode.test.ts";

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
    file: "src/interaction/router/decode.ts",
    from: "        ? WHEEL_DIRECTIONS[low as 0 | 1 | 2 | 3]\n",
    to: '        ? (code === 64 ? "wheelUp" : "wheelDown")\n',
    why: "`code === 64` restored as the only wheel-up — T1.3k fails on `CSI < 80` decoding as wheelDown; this is the shipped behaviour C16 I30 replaced, and a run that cannot see it restored cannot see the ruling",
  },
  mutations: [
    {
      name: "modifiers masked back out (the `& 3` of the shipped line)",
      file: "src/interaction/router/decode.ts",
      from: "        shift: (code & 4) !== 0,\n        meta: (code & 8) !== 0,\n        ctrl: (code & 16) !== 0,\n",
      to: "        shift: false,\n        meta: false,\n        ctrl: false,\n",
      expect: "T1.3l",
    },
    {
      name: "motion bit dropped — a drag is a stream of clicks again",
      file: "src/interaction/router/decode.ts",
      from: "        motion: (code & 32) !== 0,\n",
      to: "        motion: false,\n",
      expect: "T1.3m",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
