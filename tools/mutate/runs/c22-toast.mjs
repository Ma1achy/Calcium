// C22 I116 — the toast (§6l.13, §105, §012): one string, one timer, no keys.
//
// **The timer is the subject, and it has two ways to be wrong that both draw a
// plausible footer.** An undisposed older timer clears a newer toast early,
// which reads as a short lifetime; an undisposed timer at stop commits a frame
// to a released terminal, which reads as nothing at all. Neither is visible in
// a frame taken at one moment.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SESSION = "src/shell/session.ts";
const CHROME = "src/shell/chrome.ts";
const KEYS = "src/shell/keys.ts";
const FRAME = "src/shell/frame.ts";
const FILES = "test/unit/toast.test.ts test/integration/toast.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change both rows can see** (F1254): the text the copy raises.
    file: KEYS,
    from: "deps.toast(`copied ${String(lines)} ${lines === 1 ? \"line\" : \"lines\"}`);",
    to: "deps.toast(`took ${String(lines)} ${lines === 1 ? \"line\" : \"lines\"}`);",
    why: "the footer reads `took 1 line`, so T4.95's `copied 1 line` fails at its first assertion",
  },
  mutations: [
    {
      // **THE DEFECT the walk found** (§6l.13 E2): the older timer left armed.
      name: "THE DEFECT: a newer toast does not dispose the older timer",
      file: SESSION,
      from: "    this.#toastTimer?.[Symbol.dispose]();\n    this.#toast = text;",
      to: "    this.#toast = text;",
      expect: "T4.95",
    },
    {
      // E3 — the timer outlives the session.
      name: "stopping leaves the toast's timer armed",
      file: SESSION,
      from: "    this.#toastTimer?.[Symbol.dispose]();\n    this.#toastTimer = null;\n    this.#toast = null;\n    this.#animation = NOTHING_ANIMATES;",
      to: "    this.#animation = NOTHING_ANIMATES;",
      expect: "T4.95",
    },
    {
      // E1 — the text clears and no frame says so.
      name: "the expiry commits no frame",
      file: SESSION,
      from: "      this.#toast = null;\n      graph.scheduler.commit(\"input\");\n    }, TOAST_MS);",
      to: "      this.#toast = null;\n    }, TOAST_MS);",
      expect: "T4.95",
    },
    {
      name: "the lifetime is one second",
      file: SESSION,
      from: "const TOAST_MS = 2000;",
      to: "const TOAST_MS = 1000;",
      expect: "T4.95",
    },
    {
      // K1 — the toast joins the tail rather than replacing it.
      name: "the toast sits beside the cwd",
      file: CHROME,
      from: "    ctx.toast === undefined\n      ? [{ label: foldHome(ctx.session.cwd, ctx.session.env[\"HOME\"]), tone: \"muted\" }]\n      : [",
      to: "    ctx.toast === undefined\n      ? [{ label: foldHome(ctx.session.cwd, ctx.session.env[\"HOME\"]), tone: \"muted\" }]\n      : [{ label: foldHome(ctx.session.cwd, ctx.session.env[\"HOME\"]), tone: \"muted\" },",
      expect: "T1.73",
    },
    {
      // K3 — tone alone carries it.
      name: "the toast has no mark",
      file: CHROME,
      from: "ctx.capabilities === undefined ? ctx.toast : `${glyphFor(\"ok\", ctx.capabilities)} ${ctx.toast}`",
      to: "ctx.toast",
      expect: "T1.73",
    },
    {
      name: "a copy says nothing",
      file: KEYS,
      from: "      deps.toast(`copied ${String(lines)} ${lines === 1 ? \"line\" : \"lines\"}`);",
      to: "      void lines;",
      expect: "T4.95",
    },
    {
      name: "compose drops the toast",
      file: FRAME,
      from: "    ...(toast === undefined ? {} : { toast }),\n",
      to: "",
      expect: "T4.95",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
