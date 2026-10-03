// C13 I22 — settling ends the stream in the document too (review batch 4 M13.3).
//
// **Every clause here reads as tidy when it is missing.** A settle that leaves
// the blocks as given is the obvious implementation; a strip that stops at the
// top level passes every fixture that is flat; and a strip that always builds a
// new document is correct about the flags and wrong about `rev`, which is the
// one number C14's cache is keyed on.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const STORE = "src/viewport/transcript/store.ts";
const STRIP = "src/data/viewmodel/construct.ts";
const FILES = "test/unit/transcript.test.ts test/revert/transcript.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every row of the trace can see**: settle reports a `rev` no
    // entry holds, so row 3a's outcome and every later one disagree.
    file: STORE,
    from: "    return { ok: true, rev: next.rev };",
    to: "    return { ok: true, rev: -1 };",
    why: "every settle reports a rev of -1, so each of T1.41's outcome rows fails",
  },
  mutations: [
    {
      // **THE DEFECT** (the one this invariant closes): the entry's flag flips and the document
      // is kept as given, so a settled notice draws the agent's mark for ever.
      name: "THE DEFECT: settle keeps the document's streaming blocks",
      file: STORE,
      from: "    const ended = withoutStreaming(settled === undefined ? entry.doc : settled.value);",
      to: "    const ended = settled === undefined ? entry.doc : settled.value;",
      expect: "T1.41",
    },
    {
      // **The strip stops at the top level** — right for every flat fixture and
      // wrong for a notice in a scroll, which is where a live panel puts one.
      name: "the strip does not descend into a container's children",
      file: STRIP,
      from: "      const children = container.children.map(strip);",
      to: "      const children = container.children;",
      expect: "T1.41",
    },
    {
      // **A table row's detail is the second arm** — `rewrite`'s own history is
      // a patch into a detail block answering `ok` and changing nothing.
      name: "the strip skips a table row's detail",
      file: STRIP,
      from: "        const detail = row.detail.map(strip);",
      to: "        const detail = row.detail;",
      expect: "T1.41",
    },
    {
      // **`rev` does not move on a bare settle that stripped something**, so
      // C14's `(id, rev, width)` slot keeps the height with the mark's cells.
      name: "a bare settle keeps its rev even when the strip changed the document",
      file: STORE,
      from: "      settled === undefined && ended === entry.doc",
      to: "      settled === undefined",
      expect: "T1.41",
    },
    {
      // **Identity lost**: a new document every time, so a bare settle over a
      // quiet document moves `rev` and invalidates a height that was right.
      name: "the strip builds a new document when nothing streams",
      file: STRIP,
      from: "  if (blocks.every((b, i) => b === doc.blocks[i])) return doc;",
      to: "",
      expect: "T1.41",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
