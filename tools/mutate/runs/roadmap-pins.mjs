// F1444 — the roadmap's line pins, mutated.
//
// **A gate that stops matching goes green**, and the pin arm is four
// conditions: a pinned line holding its text, a citation being pinned or
// recorded, a pin or record being cited, and `--repoint` rewriting what it
// moved. Each mutation leaves the real roadmap green — it holds every pin — so
// RS15's fabricated roadmaps are what see it.
//
// The control is the text comparison inverted at the one place a moved line is
// told from a held one, which fails the real roadmap itself (RS15).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/roadmap-status.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const FILE = "tools/roadmap-status.mjs";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FILE,
    from: "    if ((lines[at - 1] ?? \"\").trim() === pin.text) {\n",
    to: "    if ((lines[at - 1] ?? \"\").trim() !== pin.text) {\n",
    why: "the comparison inverted: every held pin reads as moved and the real roadmap fails",
  },
  mutations: [
    {
      name: "a moved line is not reported",
      file: FILE,
      from: "    fail.push(\n      `pins: \\`${key}\\` names a line that moved — ` +",
      to: "    if (false) fail.push(\n      `pins: \\`${key}\\` names a line that moved — ` +",
      expect: "RS15b",
    },
    {
      name: "an unpinned citation is not reported",
      file: FILE,
      from: "      fail.push(\n        `pins: \\`${key}\\` is cited and neither pinned nor recorded` +",
      to: "      if (false) fail.push(\n        `pins: \\`${key}\\` is cited and neither pinned nor recorded` +",
      expect: "RS15d",
    },
    {
      name: "a pin nothing cites stays",
      file: FILE,
      from: "    if (!cited.has(key)) fail.push(`pins: \\`${key}\\` is pinned and",
      to: "    if (false) fail.push(`pins: \\`${key}\\` is pinned and",
      expect: "RS15d",
    },
    {
      name: "a record nothing cites stays",
      file: FILE,
      from: "    if (!cited.has(key)) fail.push(`pins: \\`${key}\\` is recorded and",
      to: "    if (false) fail.push(`pins: \\`${key}\\` is recorded and",
      expect: "RS15d",
    },
    {
      name: "--repoint rewrites nothing in the roadmap",
      file: FILE,
      from: "      roadmap = roadmap.split(from).join(to);\n",
      to: "",
      expect: "RS15c",
    },
    {
      name: "--repoint moves a line whose text recurs",
      file: FILE,
      from: "    if (mode === \"repoint\" && where.length === 1) {",
      to: "    if (mode === \"repoint\" && where.length >= 1) {",
      expect: "RS15e",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
