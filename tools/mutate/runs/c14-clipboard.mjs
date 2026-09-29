// Where a copy goes, and what it says (C14 I61, C17 I31, ruling 72).
//
// **The order, the words and the one pending copy**: each mutation keeps a copy
// that lands somewhere and breaks what the reader is told about where.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/copy-clipboard.test.ts test/integration/copy-clipboard.test.ts test/integration/copy-keys.test.ts";
const CLIP = "src/shell/clipboard.ts";
const SESSION = "src/shell/session.ts";
const CHROME = "src/shell/chrome.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **Ruling 72's substance**: OSC 52 claims a copy nothing reported.
    name: "OSC 52 worded copied",
    file: CLIP,
    from: '      return "sent to the terminal\'s clipboard";',
    to: '      return "copied to the terminal\'s clipboard";',
    expect: "T1.81 (C14 I61",
  },
  {
    // **C21 W2**: the cap's null read as a refusal of the copy.
    name: "past the cap skips the tool",
    file: CLIP,
    from: '  if (tool !== null) return Object.freeze({ kind: "tool", tool });',
    to: '  if (tool !== null && clipboard === "none") return Object.freeze({ kind: "tool", tool });',
    expect: "T1.81 (C14 I61",
  },
  {
    // **§6e row 7**: the deadline fires and says nothing.
    name: "the deadline does nothing",
    file: CLIP,
    from: '            toFile(mine, text, Object.freeze({ kind: "silent", tool: name }));',
    to: "            void 0;",
    expect: "T3.26 (C14 I61",
  },
  {
    // **§6e row 9**: a superseded copy's answer speaks over the latest.
    name: "a superseded answer speaks",
    file: CLIP,
    from: "          void deps.write(route.tool, text).then((answer) => {\n            if (settled || mine !== generation) return;",
    to: "          void deps.write(route.tool, text).then((answer) => {\n            if (settled) return;",
    expect: "T3.26 (C14 I61",
  },
  {
    // **§6e row 12**: a failed file write claims it was saved.
    name: "a failed file write says saved",
    file: CLIP,
    from: "      () => done(false),",
    to: "      () => done(true),",
    expect: "T3.26 (C14 I61",
  },
  {
    name: "the OSC 52 bytes never sent",
    file: CLIP,
    from: "          deps.send(route.bytes);",
    to: "          void route.bytes;",
    expect: "T4.43 (C14 I61",
  },
  {
    // **C17 I31**: two paste targets and one paste key.
    name: "the kill buffer skipped",
    file: SESSION,
    from: "    graph.editor.copyText(text);\n    if (leave) this.#exitSemanticSelection();\n    this.#copierOf(graph).copy(text);",
    to: "    if (leave) this.#exitSemanticSelection();\n    this.#copierOf(graph).copy(text);",
    expect: "T4.43 (C14 I61",
  },
  {
    // **`R-SEL-011`'s *the mode states it***, lost at the session.
    name: "the session never offers the file",
    file: SESSION,
    from: "      offersFile: !this.#copierOf(graph).hasClipboard,",
    to: "      offersFile: false,",
    expect: "T4.43 (C14 I61",
  },
  {
    name: "the key keeps its copy label",
    file: CHROME,
    from: '          semantic?.offersFile === true ? "to file" : "copy",',
    to: '          "copy",',
    expect: "T4.43 (C14 I61",
  },
  {
    name: "no clipboard is never stated",
    file: CHROME,
    from: '        ...(semantic?.offersFile === true ? [{ label: "no clipboard", tone: "warn" as const }] : []),',
    to: "",
    expect: "T4.43 (C14 I61",
  },
  {
    name: "hasClipboard always true",
    file: CLIP,
    from: '    hasClipboard: deps.clipboard === "osc52" || deps.tool !== null,',
    to: "    hasClipboard: true,",
    expect: "T3.26 (C14 I61",
  },
  {
    // **The session's half of `dispose`** (T4.44): T3.26 disposes the copier
    // itself and cannot see whether the session ever does. Removed, a pending
    // copy's deadline outlives the stop and writes `copy.txt` for a session
    // that has gone.
    name: "the session never disposes the copier",
    file: SESSION,
    from: "    this.#copier?.[Symbol.dispose]();\n    this.#tickAt = null;",
    to: "    this.#tickAt = null;",
    expect: "T4.44 (C14 I61",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): the file's sentence,
    // which the unit table, T4.43 and T4.40 all read.
    file: CLIP,
    from: "          return `no clipboard here — ${where}`;",
    to: "          return `nowhere — ${where}`;",
    why: "the no-clipboard toast is renamed, so T1.81, T4.43 and T4.40 fail — if this survives, nothing reads the sentence",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
