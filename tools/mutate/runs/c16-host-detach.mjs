// C16 I75 — the host escape as a reserved route, mutated (review batch 3, M9
// item 4).
//
// **Each of these reads as a working escape when broken.** A detach that also
// fires on the release still detaches; a table row that says `handle` at the
// child still detaches wherever the host's handler happens to run first; a
// chord spelled in `interceptOf` still matches the default keymap. So each
// mutation names the row that sees the difference.
//
// The control is T6.63: the intercept's arm removed, which is the tree before
// C16 I75 less the composition root's handler — and restoring that handler
// changes nothing here, because T4.94 registers its consumer `first: true`,
// ahead of it, which is the order that swallowed the escape (§3e H2).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/router-dispatch.test.ts test/integration/host-detach.test.ts " +
  "test/contract/surface.test.ts";
const ROUTER = "src/interaction/router/router.ts";
const INTERCEPTS = "src/interaction/router/intercepts.ts";
const CONSTRUCT = "src/shell/construct.ts";

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
    file: INTERCEPTS,
    from: '  if (detaches?.(key) === true) return "host-detach";\n',
    to: "",
    why: "T6.63 — the escape read inside the ladder again: a handler registered ahead at `child` takes ⌃] and the surface stays attached",
  },
  mutations: [
    {
      // C16 I75, §3e H6 — the release detaches too.
      name: "the escape's release detaches",
      file: ROUTER,
      from: '          if (!(e.kind === "key" && e.event === "release")) deps.detachChild();\n',
      to: "          deps.detachChild();\n",
      expect: "T1.193",
    },
    {
      // C16 I75 — the child's row back to `handle`: the rung is offered the
      // chord, and the first handler registered decides.
      name: "the table hands the escape to the child's rung",
      file: INTERCEPTS,
      from: '  "host-detach": {\n    child: "global-intercept",\n',
      to: '  "host-detach": {\n    child: "handle",\n',
      expect: "T1.193",
    },
    {
      // C16 I75, §3e H7 — the escape reserved at the prompt too: nothing to
      // detach, and the rung is never offered the chord.
      name: "the escape is reserved where there is no child",
      file: INTERCEPTS,
      from: '    inside: "handle",\n    scope: "handle",\n    idle: "handle",\n    exception: "detach",\n',
      to: '    inside: "handle",\n    scope: "global-intercept",\n    idle: "handle",\n    exception: "detach",\n',
      expect: "T1.193",
    },
    {
      // C16 I75, §3e H3 — the chord spelled here rather than asked of the
      // keymap: a rebinding moves the border and `/help` and not the router.
      name: "interceptOf spells the chord",
      file: INTERCEPTS,
      from: '  if (detaches?.(key) === true) return "host-detach";\n',
      to: '  if (key.ctrl && key.name === "]") return "host-detach";\n',
      expect: "T1.194",
    },
    {
      // C16 I75 — the router asks the wrong rows.
      name: "the router asks the global rows for the escape",
      file: ROUTER,
      from: '(key) => keymap.resolve("child", key)?.action === "hostDetach"',
      to: '(key) => keymap.resolve("global", key)?.action === "hostDetach"',
      expect: "T1.193",
    },
    {
      // C16 I75 — L4 wires the detach to nothing.
      name: "the composition root's detach does nothing",
      file: CONSTRUCT,
      from: '          () => void surface.close("detach"),\n',
      to: "          () => undefined,\n",
      expect: "T4.94",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
