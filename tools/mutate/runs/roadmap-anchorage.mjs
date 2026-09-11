// F1101 — the anchorage matcher's three spellings, mutated.
//
// **The silent half is the population, not the verdict.** `resolve` skips a cell
// with no idents before judging it, so a cell whose symbols are only ever
// written `foo()` or `#foo` had no citations in the signal at all — absent, not
// adrift. Widening the pattern took the count from 75 citations to 78 and every
// one of the three arrivals was real drift: `#afterContent` cited at 347 and
// declared at 387, `ghost()` cited at 303 and read at 444, `afterEdit()` cited
// at 441 and declared at 530. Nothing else in the repository reaches them — the
// line exists and is non-blank, and the symbol is somewhere in the file, which
// is the whole of both gated arms.
//
// The control is the pattern put back to one spelling, because a run that cannot
// see the old matcher restored cannot see what the widening did. The mutation is
// the hex exclusion removed, which turns a palette cell into a symbol the gated
// arm demands of a cited file.
//
// Anchors and expectations run by hand on 2026-09-11.
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
    from: "const IDENT = /`(#?[A-Za-z_][\\w$]*(?:\\.[A-Za-z_][\\w$]*)*)(?:\\(\\))?`/g;",
    to: "const IDENT = /`([A-Za-z_][\\w$]*(?:\\.[A-Za-z_][\\w$]*)*)`/g;",
    why: "the one-spelling matcher restored — RS14b fails on the population, and it fails from the informative side: rewriting `ghost()` to the bare form *adds* a cell, 68/75 becoming 69/76, which is the absence this finding is about seen from the other end",
  },
  mutations: [
    {
      // **The two HEX sites are not interchangeable, and the first draft of this
      // mutation picked the wrong one.** The `idents` filter feeds the anchorage
      // *signal*, which reports; the `problems` loop feeds the *gate*, which
      // exits 1. RS14b's colour arm asserts the run still passes, so it can only
      // see the second — removing the first survived a pass that the same change
      // by hand had killed, because by hand both came out together.
      name: "a colour is a symbol the gated arm demands of a cited file",
      file: FILE,
      from: "    if (NOT_SYMBOLS.has(ident) || HEX.test(ident)) continue;",
      to: "    if (NOT_SYMBOLS.has(ident)) continue;",
      expect: "RS14b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
