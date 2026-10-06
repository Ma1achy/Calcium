// C22 I150 — the completion footer names what each key does in the state the
// frame shows (ruling 96, F1486; T6.152), and offers `⏎ run` at rest (ruling 99).
//
// **Two sites, two directions.** The line decides in `chrome.ts` and the graph
// supplies the hint in `construct.ts`; each can fail by never saying *at rest*
// (F1486 itself) or by always saying it (a footer that offers `⇥ complete`
// over a menu that owns `⇥` as `menuNext`). And the rest arm can name the key
// the menu does not hold, or spell its own chord.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const CHROME = "src/shell/chrome.ts";
const CONSTRUCT = "src/shell/construct.ts";
const FILES = ["test/unit/session-paint.test.ts", "test/integration/session.test.ts"].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): the owner's word on the rest arm.
  file: CHROME,
  // Re-anchored (C19 I33): the keys are `completeKeys`' and the word is the arm's.
  from: "            { label: \"complete\", tone: \"accent\" },\n            ...completeKeys(",
  to: "            { label: \"completion\", tone: \"accent\" },\n            ...completeKeys(",
  why: "the rest line's first chip renamed — if this survives, no row reads the rest line",
};

const MUTATIONS = [
  {
    // **T6.152, F1486 itself**: the line reads no hint.
    name: "T6.152: the complete arm ignores promptUnderMenu",
    file: CHROME,
    from: "completeKeys(hints, hints.promptUnderMenu === true, caps)",
    to: "completeKeys(hints, hints.substate === undefined, caps)",
    expect: "T1.182",
  },
  {
    // **T6.152, the supplier**: the graph never says the menu is at rest.
    name: "T6.152: ownerHints never supplies promptUnderMenu",
    file: CONSTRUCT,
    from: "top.name === \"complete\" && promptUnderMenu() ? { promptUnderMenu: true } : {}),",
    to: "top.name === \"complete\" && false ? { promptUnderMenu: true } : {}),",
    expect: "T4.120",
  },
  {
    // **The other direction**: every completion panel reads as at rest, so
    // after `⇥` the line offers `⇥ complete` where `⇥` is `menuNext`.
    name: "ownerHints supplies promptUnderMenu whatever the selection",
    file: CONSTRUCT,
    from: "top.name === \"complete\" && promptUnderMenu() ? { promptUnderMenu: true } : {}),",
    to: "top.name === \"complete\" ? { promptUnderMenu: true } : {}),",
    expect: "T4.120",
  },
  {
    // **The rest arm offering the key the prompt holds**: `⏎ accept` kept.
    name: "the rest arm keeps ⏎ accept",
    file: CHROME,
    from: "      ...keyParts(hints, \"prompt\", [\"complete\"], \"complete\", caps),\n      ...keyParts(hints, \"panel\", [\"dismiss\"], \"close\", caps),",
    to: "      ...keyParts(hints, \"prompt\", [\"complete\"], \"complete\", caps),\n      ...keyParts(hints, \"panel\", [\"menuAccept\"], \"accept\", caps),\n      ...keyParts(hints, \"panel\", [\"dismiss\"], \"close\", caps),",
    expect: "T1.182",
  },
  {
    // **T6.152, ruling 99's amendment undone**: the rest line drops `⏎ run`.
    name: "T6.152: the rest arm drops ⏎ run",
    file: CHROME,
    from: "      ...keyParts(hints, \"prompt\", [\"submit\"], \"run\", caps),\n",
    to: "      // ⏎ run dropped\n",
    expect: "T4.120",
  },
  {
    // **`⏎ run` spelled literally** (C22 I133): a rebound `submit` is not named.
    name: "the rest arm spells ⏎ itself",
    file: CHROME,
    from: "      ...keyParts(hints, \"prompt\", [\"submit\"], \"run\", caps),\n",
    to: "      { keys: \"⏎\", does: \"run\" },\n",
    expect: "T1.182",
  },
  {
    // **A literal chord** (C22 I133): the chip stops following the keymap.
    name: "the rest arm spells ⇥ itself",
    file: CHROME,
    from: "      ...keyParts(hints, \"prompt\", [\"complete\"], \"complete\", caps),\n      ...keyParts(hints, \"panel\", [\"dismiss\"], \"close\", caps),",
    to: "      { keys: \"⇥\", does: \"complete\" },\n      ...keyParts(hints, \"panel\", [\"dismiss\"], \"close\", caps),",
    expect: "T1.182",
  },
];

const { read, write } = fsIo(ROOT);

/**
 * **Which rows failed, printed after every run** (F1472): the verdict is
 * judged from failure lines, and these are what a reader checks it against.
 */
const named = () => {
  const hit = [{ name: "control", ...CONTROL }, ...MUTATIONS].find((m) => read(m.file).includes(m.to));
  return hit === undefined ? "the clean tree" : hit.name;
};
const run = () => {
  const label = named();
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const both = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    out = e.killed === true ? `${both}\nTIMED OUT after 300000ms` : both;
  }
  const fails = [...new Set(strip(out).split("\n").filter((l) => /^\s*FAIL\s/u.test(l)).map((l) => l.trim()))];
  console.log(`── ${label}: ${String(fails.length)} FAIL line(s)`);
  for (const l of fails) console.log(`   ${l}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: CONTROL,
  mutations: MUTATIONS,
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
