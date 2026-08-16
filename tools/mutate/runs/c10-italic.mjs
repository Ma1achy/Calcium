// Roadmap 50 — `Style.italic`, mutated.
//
// **One field, and the rows that matter are about where it is *not*.** The
// reversal of entry 11's ruling (c) turns on two claims that a green suite would
// hold either way: that italic is written as SGR 3 in a stable position, and
// that it is an attribute rather than a palette fallback — so no depth strips it
// and `MonoClass` does not gain a fourth member.
//
// The second is why ORDER is a mutation rather than a nicety: a row asserting
// only *the sequence contains 3* passes for an emitter that appends it last,
// and a frame diff would then change when nothing changed.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/sgr.test.ts";
const FILE = "src/terminal/escapes.ts";

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
    file: FILE,
    from: "  if (style.italic === true) params.push(3);",
    to: "",
    why: "T1.19 and T1.19b both assert the parameter; a run where removing it survives cannot see a kill",
  },
  mutations: [
    {
      // The parameter itself. 3 is italic; 23 turns it *off*, and an emitter
      // that opened with the closing code would style nothing while every
      // assertion about *a sequence was written* still held.
      name: "italic opens with its closing parameter",
      file: FILE,
      from: "  if (style.italic === true) params.push(3);",
      to: "  if (style.italic === true) params.push(23);",
      expect: "T1.19",
    },
    {
      // Order. Appended last it is still emitted, still correct on a terminal,
      // and still a frame that changes when nothing changed.
      name: "italic is appended last rather than in numeric order",
      file: FILE,
      from: "  if (style.italic === true) params.push(3);\n  if (style.underline === true) params.push(4);",
      to: "  if (style.underline === true) params.push(4);\n  if (style.italic === true) params.push(3);",
      expect: "T1.19",
    },
    {
      // **The 1-bit claim.** Gating italic on a colour being present is what a
      // reader who thinks of it as a palette fallback would write, and it is the
      // reading entry 11's ruling (c) rested on — *italic takes underline or
      // stays literal*. T1.19b is the row that says an attribute is not a
      // colour and has nothing to degrade to.
      name: "italic is treated as a colour and needs one to be present",
      file: FILE,
      from: "  if (style.italic === true) params.push(3);",
      to: "  if (style.italic === true && style.colour !== undefined) params.push(3);",
      expect: "T1.19b",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
