// C17 I24 — the prompt's layout memo, mutated.
//
// **A memo passes a same-answer test by returning anything stale**, which is why
// every row here attacks the key rather than the walk. The walk was already
// covered; what is new is a decision about *when not to walk*, and a wrong
// answer to that is invisible to every assertion C17 had — each of them
// constructs an editor, asks once, and agrees.
//
// The control is the memo emptied: if a run where `layout` returns nothing still
// reports no kills, the corpus is not being reached and no survivor here means
// anything.
//
// **One change is deliberately not mutated, and the reason is recorded rather
// than left as a gap.** `displayRows` now reads `this.layout(...).length` instead
// of calling `layout.ts`'s own `displayRows`, which itself is `layout().length` —
// so the two spellings cannot disagree and no test can tell them apart. It is a
// change in who walks, not in what is answered. A mutation for it would survive,
// and a survivor whose reason is known before the run is a comment, not a row
// (A03 §2's vacuity class: a mutation with nothing to be wrong about).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/editor.test.ts";
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
    from: "    const rows = Object.freeze(layout(this.#text, width, gutter, this.drawAs));",
    to: "    const rows = Object.freeze([]);",
    why: "an empty layout fails every row that reads a prompt; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // The key term a fixture never exercises: one editor, one width, asked
      // twice. Every C17 row before T1.43 was that shape.
      name: "the width is dropped from the memo's key",
      file: EDITOR,
      from: "      hit.width === width &&\n",
      to: "",
      expect: "T1.43",
    },
    {
      // The stale-buffer serve. An edit lands, the memo answers for the buffer
      // before it, and the prompt on screen is the one the user has stopped
      // typing.
      name: "the buffer is dropped from the memo's key",
      file: EDITOR,
      from: "      hit.text === this.#text &&\n",
      to: "",
      expect: "T1.43",
    },
    {
      // The gutter changes the usable width at a fixed terminal width, so this
      // is the one that survives a corpus indexed by width alone.
      name: "the gutter's first column is dropped from the memo's key",
      file: EDITOR,
      from: "      hit.first === gutter.first &&\n",
      to: "",
      expect: "T1.43",
    },
    {
      // **The survivor that split the row.** Written as `{2,2}` against `{0,0}`,
      // T1.43's gutter row moved both figures at once, so `cont` caught this and
      // `first` was never tested alone — a row that reads as covering the key
      // and covers half of it. Each figure now moves by itself.
      name: "the continuation gutter is dropped from the memo's key",
      file: EDITOR,
      from: "      hit.cont === gutter.cont\n",
      to: "      true\n",
      expect: "T1.43",
    },
    {
      // The whole key, gone: a memo that is a first-answer cache. It is the
      // shape a reader skims past, because the `hit !== null` guard reads as the
      // check.
      name: "the memo compares nothing and serves its first answer for ever",
      file: EDITOR,
      from:
        "    if (\n      hit !== null &&\n      hit.text === this.#text &&\n" +
        "      hit.width === width &&\n      hit.first === gutter.first &&\n" +
        "      hit.cont === gutter.cont\n    ) {",
      to: "    if (hit !== null) {",
      expect: "T1.43",
    },
    {
      // The hazard the memo created rather than one it inherited: before it,
      // every call returned a fresh array.
      name: "the shared rows are not frozen",
      file: EDITOR,
      from: "    const rows = Object.freeze(layout(this.#text, width, gutter, this.drawAs));",
      to: "    const rows = layout(this.#text, width, gutter, this.drawAs);",
      expect: "T1.43",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
