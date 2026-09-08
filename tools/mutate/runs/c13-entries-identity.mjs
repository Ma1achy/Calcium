// C13 I21 — the entries array's identity, mutated.
//
// **The property nothing asserted until a consumer depended on it.** Every other
// row in `transcript.test.ts` reads the entries and asserts what is *in* them, so
// a mutation that produced an equal-but-new array and one that wrote through the
// array already handed out are indistinguishable to all of them. L4 now keys a
// `WeakMap` on that array and answers `entryById` from it (F914), which turns an
// implementation detail into a contract — and a contract nobody was checking.
//
// Both mutations here are correct programs. The first is the natural way to write
// an in-place patch and is faster; the second is the defensive getter a reviewer
// asks for. Neither breaks a single assertion about content, and each breaks the
// index in a different direction: the first serves an entry the store has
// replaced, the second misses on every lookup and buys nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/transcript.test.ts";
const STORE = "src/viewport/transcript/store.ts";

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
    file: STORE,
    from: "  get entries(): readonly TranscriptEntry[] {\n    return this.#entries;\n  }",
    to: "  get entries(): readonly TranscriptEntry[] {\n    return [];\n  }",
    why: "an empty transcript fails nearly every row here; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // The stale-index direction. The store is right about its content and the
      // reader is holding an entry it no longer has.
      name: "`patch` writes the replacement through the array it already handed out",
      file: STORE,
      from: "    const evicted = this.#commit(this.#entries.map((e) => (e.id === id ? next : e)));",
      to:
        "    const inPlace = this.#entries as TranscriptEntry[];\n" +
        "    for (let i = 0; i < inPlace.length; i += 1) if (inPlace[i]?.id === id) inPlace[i] = next;\n" +
        "    const evicted = this.#commit(inPlace);",
      expect: "T1.40",
    },
    {
      // The other direction, and the one no row looked for before T1.40: a read
      // that copies is correct, and it makes the key miss every time.
      name: "the getter hands back a copy, so a read is indistinguishable from a mutation",
      file: STORE,
      from: "  get entries(): readonly TranscriptEntry[] {\n    return this.#entries;\n  }",
      to: "  get entries(): readonly TranscriptEntry[] {\n    return [...this.#entries];\n  }",
      expect: "T1.40",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
