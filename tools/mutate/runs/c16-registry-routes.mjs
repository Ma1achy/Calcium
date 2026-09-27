// C16 §6c — routes by profile, where a registry-global binding fires, and the
// copy-mode switch (review batch 2, M6 items 2–5).
//
// **Every mutation here leaves a keymap that constructs and a session that
// runs.** A chord still resolves somewhere, `?` still opens help somewhere, and
// both copy modes still enter. What changes is *which owners* a key reaches,
// *which profile* a route fires under, and whether two modes can be up at once —
// none of which a row asking "does the key do its thing" can see from the one
// owner it happens to press it at.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/router-keymap.test.ts test/integration/registry-global.test.ts " +
  "test/unit/session-keys.test.ts test/unit/router-dispatch.test.ts";
const KEYMAP = "src/interaction/router/keymap.ts";
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

const MUTATIONS = [
  {
    // **T6.46 (C16 I66)** — `?` back where it was: one owner of the five that have
    // no line. The block still answers it, which is the owner every earlier
    // row pressed it at.
    name: "`?` bound at liveBlock alone",
    file: KEYMAP,
    from: '  { target: "global", ...fromRegistry("help.question"), action: "helpKeymap" },',
    to: '  { target: "liveBlock", ...fromRegistry("help.question"), action: "helpKeymap" },',
    expect: "T4.85",
  },
  {
    // **T6.47 (C16 I42, C16 I35)** — the profile ignored. Every row is live on every
    // terminal, so `⌘1` resolves under the default profile — a chord that
    // terminal can never send, listed and bound as though it could.
    name: "createKeymap ignores the profile",
    file: KEYMAP,
    from: "  const inProfile = bindings.filter((b) => b.profile === undefined || b.profile === profile);",
    to: "  const inProfile = bindings.filter(() => true);",
    expect: "T1.37 ",
  },
  {
    // **T6.50 (C16 I66)** — the focused block loses its copy. `y` still copies
    // there, so every row that copied with `y` stays green.
    name: "the liveBlock copy row deleted",
    file: KEYMAP,
    from: '  { target: "liveBlock", ...fromRegistry("copy"), action: "copyElement" },\n',
    to: "",
    expect: "T4.86",
  },
  {
    // **T6.52 (C16 I66, §6c S11)** — native entered beside semantic. The header
    // says NATIVE either way, since `#copyState` answers native first; the
    // semantic mode is found on the way out.
    name: "entering native selection no longer leaves semantic copy",
    file: SESSION,
    from: "    if (on) this.#exitSemanticSelection();\n",
    to: "",
    expect: "T4.89",
  },
  {
    // **T6.52's other direction** — semantic entered under a frozen native
    // selection. The scheduler stays suspended, so the frame that would show
    // `COPY` is never written.
    name: "entering semantic copy no longer leaves native selection",
    file: SESSION,
    from: "    this.#setNativeSelection(false);\n    const stored = graph.focus.current;\n",
    to: "    const stored = graph.focus.current;\n",
    expect: "T4.89",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: the global `selection.native` row gone,
    // so `⌥⇧C` reaches no owner anywhere. T4.89, T1.37 and T1.173 each read it.
    // If this survives, nothing in the set dispatches a registry-global key and
    // every kill below is unearned.
    file: KEYMAP,
    from: '  { target: "global", ...fromRegistry("selection.native"), action: "enterNativeSelection" },\n',
    to: "",
    why:
      "⌥⇧C bound nowhere — if this survives, no row in the set reaches a registry-global " +
      "binding and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
