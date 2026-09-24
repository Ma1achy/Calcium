// C14 I48 — the drag gesture's ends, mutated.
//
// **`c14-drag` mutates the arithmetic; this mutates the lifecycle.** The bands,
// the container and the clamp are pure and unit-tested; what ends a gesture is
// three call sites in the session, and a ticker that outlives its gesture reads
// as a working autoscroll on every frame but the ones after the key.
//
// The control is esc as it shipped before I48: the mode changes and the drag
// lives on. Restored, the held pointer keeps scrolling past the key.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/copy-drag.test.ts";
const SESSION = "src/shell/session.ts";

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
    file: SESSION,
    from: "    // ticker as surely as the press that leaves.\n    this.#endDrag();\n",
    to: "    // ticker as surely as the press that leaves.\n",
    why: "esc as it shipped before C14 I48 — the gesture and its ticker outlive the key",
  },
  mutations: [
    {
      name: "⌃c leaves the mode and the ticker runs on",
      file: SESSION,
      from: "    // scroll the live transcript the mode just handed back.\n    this.#endDrag();\n",
      to: "    // scroll the live transcript the mode just handed back.\n",
      expect: "T4.37b",
    },
    {
      // `R-SEL-013`'s *stops on release*, the half that was built first.
      name: "a release leaves the ticker running",
      file: SESSION,
      from: "      // the gesture and not the mode.\n      this.#endDrag();\n",
      to: "      // the gesture and not the mode.\n",
      expect: "T4.37",
    },
    {
      // C14 I49 — the tick scrolls and selects nothing, as it shipped.
      name: "a tick scrolls without extending",
      file: SESSION,
      from: "      this.#extendToEdge(rect, step.rows);\n",
      to: "",
      expect: "T4.37c",
    },
    {
      // The wrong edge: scrolling down, the caret goes to the container's top.
      name: "a tick extends to the edge it is scrolling away from",
      file: SESSION,
      from: "    const caret = graph.semanticCaretAt(rows > 0 ? rect.to - 1 : rect.from, width);\n",
      to: "    const caret = graph.semanticCaretAt(rows > 0 ? rect.from : rect.to - 1, width);\n",
      expect: "T4.37c",
    },
    {
      // C14 I50 — the session stops clamping; the pure function is still right.
      name: "the drag extends to the raw caret",
      file: SESSION,
      from: "        clampToContainer(caret, this.#drag, graph.scrollBoxSpans(), order),\n",
      to: "        caret,\n",
      expect: "T4.37d",
    },
    {
      // C14 I51 — the element-less blocks lose their spans: prose unreachable.
      name: "a block with no element has no span",
      file: SESSION,
      from: "        spans.push(Object.freeze({ key: semantic.keyOf(entry.id, b.blockId), from: b.from, to: b.to }));\n",
      to: "",
      expect: "T4.37e",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
