// Roadmap 30 — the paste chip's seam, mutated.
//
// **The first row is not a hypothetical.** `clusterWidth(shown)` is the defect
// that actually happened while this was built: `clusterWidth` measures a cluster
// **by its base code point**, which is right about clusters and wrong about a
// substituted string, so `[#1 parse.ts · 184L]` counted as `[`. It is the
// natural function to reach for on that line and it is true about its own
// subject — so the mutation is the code as it was, and the two frame rows are
// what killed it.
//
// Every other row here passed while it was broken. Motion, deletion, word jumps
// and the anchor all see one character either way, which is the whole shape of
// the risk: **only a frame can fail.**
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/editor.test.ts";
const LAYOUT = "src/interaction/editor/layout.ts";
const EDITOR = "src/interaction/editor/editor.ts";

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
    file: EDITOR,
    from: "    this.#chips.get(cluster)?.label;",
    to: "    undefined;",
    why: "with no label the frame draws the sentinel; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The measured defect, restored.** Not a fabrication — this is the line
      // as it was written, and it took a frame-read to find.
      name: "THE DEFECT: the label is measured with `clusterWidth`, by its base code point",
      file: LAYOUT,
      from: "      const w = widthOf(shown);",
      to: "      const w = clusterWidth(shown);",
      expect: "T2.40",
    },
    {
      // The other half of the same line: drawn as the sentinel, measured as the
      // label. Arithmetically consistent everywhere and wrong in the frame.
      name: "the sentinel is drawn while the label is measured",
      file: LAYOUT,
      from: "      row += shown;",
      to: "      row += cluster;",
      expect: "T2.40",
    },
    // **`session.ts:549`'s wiring is NOT mutated here, and the gap is named
    // rather than left.** Blanking `graph.editor.drawAs` at that call site
    // survived this run, because `T2.45` calls `selectionSpans` directly with
    // the seam — it asserts the *mechanism* and nothing asserts the *wiring*.
    // That is the recorded class: a seam-level row passes on the day nothing
    // calls it. Covering it needs a shell-level frame-read, which is a row this
    // entry owes and does not have.
    {
      // The refused getter, implemented. Every index assertion still passes and
      // `contextAt` receives a longer string with the same offset.
      name: "`text` resolves chips — the obvious implementation, and the refused one",
      file: EDITOR,
      from: "  get text(): string {\n    return this.#text;\n  }",
      to: "  get text(): string {\n    return this.resolved;\n  }",
      expect: "T2.42",
    },
    {
      // Resolution at the wrong end: a sentinel reaching C23, C18 and C20's file.
      name: "`resolved` hands back the raw buffer",
      file: EDITOR,
      from: "    for (const ch of this.#text) out += this.#chips.get(ch)?.content ?? ch;",
      to: "    for (const ch of this.#text) out += ch;",
      expect: "T2.43",
    },
    {
      // One sentinel for every chip — U+FFFC's shape, where two chips in one
      // buffer are indistinguishable and the side map cannot be keyed.
      name: "every chip gets the same sentinel",
      file: EDITOR,
      from: "    this.#nextChip += 1;",
      to: "",
      expect: "T2.47",
    },
    {
      // A chip that is not atomic to the buffer: inserted as its label, so it is
      // twenty characters to motion and deletion.
      name: "the chip is inserted as its label rather than as one grapheme",
      file: EDITOR,
      from: "    this.insert(sentinel, { atomic: true });",
      to: "    this.insert(chip.label, { atomic: true });",
      expect: "T2.41",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
