// C16 §6c — routes by profile, where a registry-global binding fires, the
// copy-mode switch, and a reserved row passing through to the application
// (review batch 2, M6 items 1–5; C22 I134, C24 I39).
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
  "test/unit/session-keys.test.ts test/unit/router-dispatch.test.ts test/integration/key-actions.test.ts " +
  "test/contract/public-api.test.ts test/contract/startup-validation.test.ts";
const KEYMAP = "src/interaction/router/keymap.ts";
const SESSION = "src/shell/session.ts";
const CONSTRUCT = "src/shell/construct.ts";
const CONFIG = "src/shell/config.ts";

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
  {
    // **T6.45 (C16 I38, C22 I134)** — the reservation as it was: `bound`
    // returns the table's no-op for a reserved row, handler or not. The key is
    // consumed, so every row that only asked "did something take it" stays green.
    name: "bound runs the reserved no-op regardless of a handler",
    file: CONSTRUCT,
    from: "    if (reserved !== undefined) return reservedEffect(reserved, binding);\n",
    to: "",
    expect: "T1.38 ",
  },
  {
    // **T6.49 (C16 I38, §6c table A)** — the typed reply asks the row again.
    // `queueDrop` is not in `REPLY_ACTIONS`, so I8 rejects `⌥⌫` in a reply.
    name: "the reply's check reads the row's own action",
    file: CONSTRUCT,
    from: "        const action = binding === null ? null : effectiveAction(binding);\n        // A key the reply does not own passes, and I8's reject answers it.\n",
    to: "        const action = binding === null ? null : binding.action;\n        // A key the reply does not own passes, and I8's reject answers it.\n",
    expect: "T4.88",
  },
  {
    // The same question asked by the field, which drops the key rather than
    // rejecting it — so the word stays and nothing says why.
    name: "the field's check reads the row's own action",
    file: CONSTRUCT,
    from: "      const action = binding === null ? null : effectiveAction(binding);\n      if (action !== null && FIELD_ACTIONS.has(action as KeyAction)) {\n",
    to: "      const action = binding === null ? null : binding.action;\n      if (action !== null && FIELD_ACTIONS.has(action as KeyAction)) {\n",
    expect: "T4.88",
  },
  {
    // **§6c S6** — an application's hook throwing into the read loop, which
    // has no `catch`.
    name: "a throwing handler is not contained",
    file: CONSTRUCT,
    from: "    } catch (cause) {\n      stores.transcript.append(",
    to: "    } catch (cause) {\n      if (cause !== undefined) throw cause;\n      stores.transcript.append(",
    expect: "T1.38c",
  },
  {
    // **C22 I134's `/help` half** — the listing names the row, so `⌥⌫` is
    // advertised as `queueDrop` on a session where it kills a word.
    name: "/help keys lists the row's action, not the effective one",
    file: CONSTRUCT,
    from: "            const does = effectiveAction(b);\n",
    to: "            const does: string | null = b.action;\n",
    expect: "T1.38 ",
  },
  {
    // **C24 I39** — an unknown id accepted, so a misspelt `queue_drop` is a
    // handler nothing will ever call.
    name: "an unknown keyActions id is accepted",
    file: CONFIG,
    from: "    if (unknown.length > 0) {\n",
    to: "    if (unknown.length < 0) {\n",
    expect: "T3.14",
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
