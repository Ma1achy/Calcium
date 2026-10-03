// C19 I13, I15 — every way the line goes away ends its request (ruling 106 b,
// F1524; T6.30).
//
// **Seven sites in two files**, one per route in C19 §8c's classification
// table. Each is a single `cancel()` that reads as redundant beside the
// `closeMenu()` next to it, which is how six of them were missing: the menu
// closed, and the request that reopens it stayed live.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const KEYS = "src/shell/keys.ts";
const CONSTRUCT = "src/shell/construct.ts";
const FILES = ["test/integration/completion-as-you-type.test.ts", "test/integration/session.test.ts"].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): nothing reaches `cancel()` at all.
  file: KEYS,
  from: "  function abandonRequest(): void {\n    deps.completion.cancel();\n  }",
  to: "  function abandonRequest(): void {\n  }",
  why: "no route ends its request — if this survives, no row holds a request across the line going",
};

const MUTATIONS = [
  {
    // **F1524 itself**: `⇥⏎` in one read, and `› running` over the empty prompt.
    name: "T6.30: reset() does not invalidate",
    file: KEYS,
    from: "      abandonRequest();\n      closeMenu();\n      suppressedAt = null;\n      held = null;",
    to: "      closeMenu();\n      suppressedAt = null;\n      held = null;",
    expect: "T3.33",
  },
  {
    name: "T6.30: recall() does not invalidate",
    file: KEYS,
    from: "    abandonRequest();\n    deps.editor.setText(line);",
    to: "    deps.editor.setText(line);",
    expect: "T3.34",
  },
  {
    name: "T6.30: the recompute set's wrapper does not invalidate",
    file: KEYS,
    from: "              abandonRequest();\n              effect();",
    to: "              effect();",
    expect: "T3.34",
  },
  {
    name: "T6.30: dismiss does not invalidate",
    file: KEYS,
    from: "        abandonRequest();\n        closeMenu();\n        suppressedAt = at;",
    to: "        closeMenu();\n        suppressedAt = at;",
    expect: "T3.34",
  },
  {
    name: "T6.30: the router's popLayer pops the menu straight off the stack",
    file: CONSTRUCT,
    from: "    popLayer: () => void (stores.overlays.top?.id === MENU_ID ? dismissMenu() : stores.overlays.pop()),",
    to: "    popLayer: () => void stores.overlays.pop(),",
    expect: "T3.34",
  },
  {
    name: "T6.30: clearPrompt does not go through reset()",
    file: CONSTRUCT,
    from: "      lineGone();\n      stores.editor.setText(\"\");",
    to: "      stores.editor.setText(\"\");",
    expect: "T3.34",
  },
  {
    // **The other half of the token**: a printable cancels in the composition
    // root, and its superseded result closed the menu the key had opened.
    name: "T6.30: the continuation reads its own sequence and not superseded",
    file: KEYS,
    from: "if (mine !== seq || result.superseded) return;",
    to: "if (mine !== seq) return;",
    expect: "T3.35",
  },
];

const { read, write } = fsIo(ROOT);

/**
 * **Which rows failed, printed after every run** (F1472): the verdict is
 * judged from failure lines, and these are what a reader checks it against.
 */
const named = () => {
  // `from` gone **and** `to` present, mutations before the control: several
  // share a `from`, and the control's `to` is a substring of the clean tree.
  const hit = [...MUTATIONS, { name: "control", ...CONTROL }].find((m) => !read(m.file).includes(m.from) && read(m.file).includes(m.to));
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
