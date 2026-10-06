// C04 I127, C09 I109, C09 I110, C10 I59, C23 I78 — the stale reading, mutated
// (§047, R-HON-002).
//
// **Each half of the figure put back to what shipped, one at a time.** The age
// in the title, the content undimmed, the hung fetch skipped, the figure frozen
// at onset — every one of these was the tree's behaviour an hour before the
// landing, so each is a mutation the rows must be able to see.
//
// Anchors and expectations written with the landing, 2026-09-24.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/stale-reading.test.ts test/contract/refresh.test.ts";

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
    file: "src/shell/refresh.ts",
    from: "    const base = livePanel(part.spec.id, part.spec.title, child, staleAge(part));",
    to: "    const base = livePanel(part.spec.id, part.spec.title, child);",
    why: "the driver never hands the panel its age — the shape of the tree before C04 I127 minus the title suffix; T1.36 fails on its first stale read",
  },
  mutations: [
    {
      name: "the children draw in the live theme",
      file: "src/presentation/blocks/kinds/containers.ts",
      from: "    const childTheme = block.staleForMs === undefined ? undefined : recede(ctx.theme);",
      to: "    const childTheme = undefined;",
      expect: "T2.173",
    },
    {
      name: "the notice in accent, as the title age was",
      file: "src/presentation/blocks/kinds/containers.ts",
      from: '            { text: noticePart, style: tone("warn", ctx.theme, ctx.capabilities) },',
      to: '            { text: noticePart, style: tone("accent", ctx.theme, ctx.capabilities) },',
      expect: "T2.172",
    },
    {
      name: "the title takes its room before the notice",
      file: "src/presentation/blocks/kinds/containers.ts",
      from: "      inner - noticeRoom,\n",
      to: "      inner,\n",
      expect: "T2.172",
    },
    {
      name: "width forgets the notice",
      file: "src/presentation/blocks/kinds/containers.ts",
      from: "rail(block.title, block.live === true) + notice,",
      to: "rail(block.title, block.live === true),",
      expect: "T2.172",
    },
    {
      name: "a receded theme resolves as the live one",
      file: "src/presentation/theme/resolve.ts",
      from: '  if (theme.recedes !== undefined && split(ref)[0] !== "surface") {',
      to: "  if (false) {",
      expect: "T1.50",
    },
    {
      name: "a receded theme shares the live theme's name",
      file: "src/presentation/theme/resolve.ts",
      from: "name: `${theme.name}/receded`,",
      to: "name: theme.name,",
      expect: "T1.50",
    },
    {
      name: "staleness skips a fetch in flight again",
      file: "src/shell/refresh.ts",
      from: "    for (const src of sources.values()) {\n      if (src.done) continue;\n      for (const part of src.parts) {\n        if (!deps.visible(part.host)) continue;",
      to: "    for (const src of sources.values()) {\n      if (src.done || src.inFlight) continue;\n      for (const part of src.parts) {\n        if (!deps.visible(part.host)) continue;",
      expect: "T1.73",
    },
    {
      name: "the age is written once, at onset",
      file: "src/shell/refresh.ts",
      from: "        if (!part.stale && mono - part.lastOk < part.spec.staleAfterMs) continue;",
      to: "        if (part.stale || mono - part.lastOk < part.spec.staleAfterMs) continue;",
      expect: "T1.74",
    },
    {
      name: "every tick writes, whether the figure moved or not",
      file: "src/shell/refresh.ts",
      from: "        if (figure === part.staleFigure) continue;\n",
      to: "",
      expect: "T1.74",
    },
    {
      name: "nothing wakes the sweep for a stale reading",
      file: "src/shell/refresh.ts",
      from: "        soonest = Math.min(soonest, now + turns);",
      to: "        void turns;",
      expect: "T1.74",
    },
    {
      name: "a negative age validates",
      file: "src/data/viewmodel/validate.ts",
      from: "!Number.isFinite(stale) || stale < 0)) {",
      to: "!Number.isFinite(stale))) {",
      expect: "T1.51",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
