// C26 stage 1 — interaction as a focus target, mutated.
//
// **Trace 5's ruling is the subject and it is a structural one**, which is the
// hard kind to test: the claim is not *this key does that* but *the ladder has no
// order of its own*. So the mutations are shapes rather than values — the target
// removed from the order, the order changed, the gate dropped — and each names the
// row that must see it.
//
// **One mutation is expected to survive, and it is a finding rather than a gap.**
// C26 I13 rewires two call sites from `reset()` to `toPrompt()`; both produce
// `{at: "prompt"}` today, so no behavioural row can tell them apart. A mutation
// that fails nothing indicts an artefact, and here the artefact indicted is the
// *subject*: the fix is correct, required by focus memory, and unobservable until
// focus memory exists. Named in `EXPECTED_SURVIVORS` with its reason rather than
// hidden behind a proxy row that would assert something else and read as coverage.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-focus.test.ts";
const FOCUS = "src/interaction/router/focus.ts";
const KEYS = "src/shell/keys.ts";

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
    // **The mutation the whole stage exists to fail.** Removing the member from
    // FOCUS_ORDER leaves the union intact, the store intact and every
    // behavioural row passing — the ladder simply never registers the rung. That
    // is the state `pushedView` held for four components: a target
    // `activeTarget` could return with no handler beneath it.
    name: "interaction removed from FOCUS_ORDER, leaving the union whole",
    file: FOCUS,
    from: '  "interaction",\n  "prompt",',
    to: '  "prompt",',
    expect: "T2.5",
  },
  {
    // The copy-mode-above-overlay contradiction with a different subject: a
    // block being interacted with taking keys from a confirm that must be
    // answered. T2.5 compares FOCUS_ORDER to the reached set — which this
    // satisfies, both being the same seven — and then pins the first and last
    // positions, which is what catches it.
    name: "interaction placed above every layer",
    file: FOCUS,
    from: '  "overlay",\n  "copyMode",\n  "pushedView",',
    to: '  "interaction",\n  "overlay",\n  "copyMode",\n  "pushedView",',
    expect: "T2.5",
  },
  {
    // The *resolution* order rather than the declared one. These two can
    // disagree, which is why T1.3d asserts the comparison rather than the slot.
    name: "activeTarget answers interaction before it consults the layers",
    file: FOCUS,
    from: '  if (deps.overlayTop?.kind === "overlay") return "overlay";\n  if (deps.copyMode) return "copyMode";',
    to:
      '  if (deps.stored.at === "liveBlock" && deps.stored.mode === "interact") return "interaction";\n' +
      '  if (deps.overlayTop?.kind === "overlay") return "overlay";\n  if (deps.copyMode) return "copyMode";',
    expect: "T1.3d",
  },
  {
    // **Freezing is a mode exit nobody signals.** Drop the gate and a settled
    // entry keeps every keystroke: the prompt stops receiving input and the
    // block cannot act on it either.
    name: "the liveEntry gate dropped, so a frozen entry stays interactable",
    file: FOCUS,
    from: '&& deps.stored.mode === "interact" && deps.liveEntry !== null',
    to: '&& deps.stored.mode === "interact"',
    expect: "T1.3e",
  },
  {
    // Carrying the mode across a row move makes `↓` mean two different things
    // depending on how the reader arrived at the row.
    name: "focusRow carries the interaction mode to the next row",
    file: FOCUS,
    from: '      stored = Object.freeze({ at: "liveBlock", rowId, mode: "navigate" });\n    },\n    setMode(mode) {',
    to: '      stored = Object.freeze({ at: "liveBlock", rowId, mode: stored.mode });\n    },\n    setMode(mode) {',
    expect: "T1.3f",
  },
  {
    // **Expected to survive. See the header.**
    name: "C26 I13 reverted — focusPrompt calls reset() again",
    file: KEYS,
    from: "    focusPrompt: () => void deps.focus.toPrompt(),",
    to: "    focusPrompt: () => void deps.focus.reset(),",
    expect: "(none — expected to survive)",
  },
];

/**
 * **The exemption is named, not tolerated silently.** A survivor is a finding by
 * default and this run still fails on a new one; this single mutation is
 * exempted by name, which is the disposition `NOT_INSTRUMENTS` takes — count the
 * exemption, do not exclude it.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "C26 I13 reverted — focusPrompt calls reset() again",
    "`reset()` and `toPrompt()` both yield {at: 'prompt'} until focus memory exists, so no " +
      "behavioural row can separate them. The fix is required by C26 I13 and its subject " +
      "arrives with focus memory. An invariant is vacuous until its subject exists, and this " +
      "is that state named rather than papered over.",
  ],
]);

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FOCUS,
    from: '  if (deps.overlayTop?.kind === "overlay") return "overlay";',
    to: '  if (deps.overlayTop?.kind === "overlay") return "prompt";',
    why:
      "the highest row of A02 §2 answering with the wrong target — if this survives, the " +
      "suite is not reading activeTarget at all and every kill below is unearned",
  },
  mutations: MUTATIONS,
});

console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  // **A named survivor that started being caught is also a change worth
  // reporting** — it means the subject arrived and the exemption should come
  // off. An exemption that outlives its reason is the failure this whole session
  // has been about.
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length > 0 ? 1 : 0);
