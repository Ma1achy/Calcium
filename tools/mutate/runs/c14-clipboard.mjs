// Where a copy goes, and what it says (C14 I61, C17 I31, ruling 72).
//
// **The order, the words and the one pending copy**: each mutation keeps a copy
// that lands somewhere and breaks what the reader is told about where.
//
// **And the offer** (the person's correction, 2026-09-29; §6e's classification
// table): a copy never writes a file, the file is offered only where no route
// took this text, and only the offer taken writes it.
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
    from: '            unrouted(text, Object.freeze({ kind: "silent", tool: name }));',
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
    // **§6e row 12, K15**: a failed file write claims it was saved.
    name: "a failed file write says saved",
    file: CLIP,
    from: "      () => done(false),",
    to: "      () => done(true),",
    expect: "T3.27 (C14 I61",
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
    from: "    graph.editor.copyText(text);\n",
    to: "",
    expect: "T4.43 (C14 I61",
  },
  {
    // **`R-SEL-011`'s *the mode states it***, lost at the session.
    name: "the session never offers the file",
    file: SESSION,
    from: "      ...(offer === null ? {} : { fileOffer: offerFact(offer) }),",
    to: "",
    expect: "T4.43 (C14 I61",
  },
  {
    name: "the key keeps its copy label",
    file: CHROME,
    from: '          semantic?.fileOffer === undefined ? "copy" : "to file",',
    to: '          "copy",',
    expect: "T4.43 (C14 I61",
  },
  {
    name: "no clipboard is never stated",
    file: CHROME,
    from: '        ...(semantic?.fileOffer === undefined ? [] : [{ label: semantic.fileOffer, tone: "warn" as const }]),',
    to: "",
    expect: "T4.43 (C14 I61",
  },
  {
    // **K13**: no route at all, and the footer offers nothing.
    name: "no route is never offered",
    file: CLIP,
    from: '      if (deps.clipboard === "none" && deps.tool === null) return Object.freeze({ kind: "no-clipboard" });',
    to: "",
    expect: "T1.82 (C14 I61",
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
  // --- the person's correction, 2026-09-29 -------------------------------
  {
    // **T6.39**: the automatic write after a failed or silent tool, restored.
    name: "AUTO-WRITE: a failed tool writes the file",
    file: CLIP,
    from: "    failed = Object.freeze({ text, why });\n",
    to: "    failed = Object.freeze({ text, why });\n    void deps.writeFile(deps.path, text);\n",
    expect: "T3.27 (C14 I61",
  },
  {
    // **T6.40**: the offer drawn while a route exists (K5, K6).
    name: "OFFER-WITH-ROUTE: a tool is offered a file",
    file: CLIP,
    from: "      if (deps.tool !== null) return null;",
    to: '      if (deps.tool !== null) return Object.freeze({ kind: "no-clipboard" });',
    expect: "T1.82 (C14 I61",
  },
  {
    // **T6.41**: OSC 52 recorded as the failed copy (K1).
    name: "OSC52-FAILED: a sent copy is offered a file",
    file: CLIP,
    from: '          deps.send(route.bytes);\n          deps.say(copyToast({ kind: "sent" }));',
    to: '          deps.send(route.bytes);\n          failed = Object.freeze({ text, why: Object.freeze({ kind: "no-clipboard" }) });\n          deps.say(copyToast({ kind: "sent" }));',
    expect: "T1.82 (C14 I61",
  },
  {
    // **K13**: `y` taken as the offer — a file the reader was not shown.
    name: "Y-SAVES: y takes the offer",
    file: SESSION,
    from: "    const save = leave && copier.fileOffer(() => text) !== null;",
    to: "    const save = copier.fileOffer(() => text) !== null;",
    expect: "T4.43 (C14 I61",
  },
  {
    // **K4, K9, K14**: the offer drawn and never taken — `⏎ to file` copies.
    name: "ENTER-IGNORES-OFFER: ⏎ never saves",
    file: SESSION,
    from: "    const save = leave && copier.fileOffer(() => text) !== null;",
    to: "    const save = leave && copier.fileOffer(() => text) === undefined;",
    expect: "T4.43 (C14 I61",
  },
  {
    // **K11**: a later copy leaves the earlier copy's offer standing.
    name: "OFFER-OUTLIVES-COPY: begin keeps the failure",
    file: CLIP,
    from: "    generation += 1;\n    failed = null;\n    return generation;",
    to: "    generation += 1;\n    return generation;",
    expect: "T1.82 (C14 I61",
  },
  {
    // **K10**: the offer for any text, not that copy's.
    name: "OFFER-ANY-TEXT: the failure matched without its text",
    file: CLIP,
    from: "      if (failed !== null && failed.text === text()) return failed.why;",
    to: "      if (failed !== null) return failed.why;",
    expect: "T1.82 (C14 I61",
  },
  {
    // **K16**: the relative default stated as it is.
    name: "RELATIVE-PATH: stateDir not resolved",
    file: CLIP,
    from: '  isAbsolute(stateDir) ? join(stateDir, "copy.txt") : join(cwd, stateDir, "copy.txt");',
    to: '  join(stateDir, "copy.txt");',
    expect: "T1.82 (C14 I61",
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
    from: "          return `no clipboard here — ${HELD}`;",
    to: "          return `nowhere — ${HELD}`;",
    why: "the no-clipboard toast is renamed, so T1.81, T4.43 and T4.40 fail — if this survives, nothing reads the sentence",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
