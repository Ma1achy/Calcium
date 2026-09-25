// C22 §6n, C01 I23–I24, C02 I16–I17, C16 I61 — notifications (ruling 27).
//
// **Two halves, and the second is where a defect hides.** The earning half is
// §6n.2's table, and its defects read as a plausible policy: a failure that
// reports as `done`, a boundary a millisecond off, a watch that earns nothing.
// The reaching half is bytes a reader never sees on screen — a bell, a title,
// an OSC 9 — and its defects are silences or leftovers: a title pushed twice
// and popped once, a focus report that ends a question's guard, a rung that
// rings for a reader who never left.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const NOTIFY = "src/shell/notify.ts";
const CONSTRUCT = "src/shell/construct.ts";
const LIFECYCLE = "src/terminal/lifecycle.ts";
const ESCAPES = "src/terminal/escapes.ts";
const CAPS = "src/terminal/capabilities.ts";
const DECODE = "src/interaction/router/decode.ts";
const ROUTER = "src/interaction/router/router.ts";
const FILES = [
  "test/unit/notify.test.ts",
  "test/integration/notify.test.ts",
  "test/unit/lifecycle.test.ts",
  "test/unit/capabilities.test.ts",
  "test/unit/router-decode.test.ts",
  "test/unit/router-dispatch.test.ts",
].join(" ");

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
    // **A change every row can see** (F1254): nothing earns, so T1.76's first
    // row with a word parts at once.
    file: NOTIFY,
    from: '  if (fact.failed) return "failed";\n',
    to: "  return null;\n",
    why: "earns answers null for every fact, so T1.76's second row fails",
  },
  mutations: [
    {
      // I126 — the failure is the more specific row.
      name: "a watched failure reports as done",
      file: NOTIFY,
      from: '  if (fact.failed) return "failed";\n  if (fact.watched || fact.durationMs >= LONG_TURN_MS) return "done";',
      to: '  if (fact.watched || fact.durationMs >= LONG_TURN_MS) return "done";\n  if (fact.failed) return "failed";',
      expect: "T1.76",
    },
    {
      // I126, §6n.4 ruling 1 — the boundary is inclusive.
      name: "30 000 ms exactly is a short end",
      file: NOTIFY,
      from: "fact.durationMs >= LONG_TURN_MS",
      to: "fact.durationMs > LONG_TURN_MS",
      expect: "T1.76",
    },
    {
      // I126 — a watched end earns always.
      name: "a watch earns nothing of its own",
      file: NOTIFY,
      from: "  if (fact.watched || fact.durationMs",
      to: "  if (fact.durationMs",
      expect: "T1.76",
    },
    {
      // I127 — never reported is focused.
      name: "a session that has had no focus report is away",
      file: NOTIFY,
      from: "  let away = false;",
      to: "  let away = true;",
      expect: "T1.76",
    },
    {
      // I126 — a fact once, by id.
      name: "a second settle of one id reports again",
      file: NOTIFY,
      from: "entry.streaming || said.has(id)) return;",
      to: "entry.streaming) return;",
      expect: "T1.76",
    },
    // **Not here: "a watch outlives its settle".** The first pass ran it and it
    // survived — I126's once-per-id already stops a second earning, so the drop
    // has no observable until a watch row shows the watches (C22 I130, parked
    // 50). A mutation kept as an expected survivor would read as a watch on the
    // day the row lands, and it would be a record.
    {
      // I128 — bell, system, title.
      name: "the bell never rings",
      file: NOTIFY,
      from: '    if (opted.has("bell")) deps.bell();\n',
      to: "",
      expect: "T1.76",
    },
    {
      // I128, C02 I16 — system needs OSC 9.
      name: "system fires on a terminal that takes no OSC 9",
      file: NOTIFY,
      from: 'opted.has("system") && deps.system)',
      to: 'opted.has("system"))',
      expect: "T1.76",
    },
    {
      // C01 I24 — the title comes back with the reader.
      name: "returning restores nothing",
      file: NOTIFY,
      from: "      if (focused) deps.restoreTitle();\n",
      to: "",
      expect: "T1.76",
    },
    {
      // C01 I24 — one push per absence.
      name: "every title write pushes",
      file: LIFECYCLE,
      from: '    if (!held.has("title")) take("title");',
      to: '    take("title");',
      expect: "T1.31",
    },
    {
      // C01 I24 — the pop, once.
      name: "restoreTitle pops whether or not it pushed",
      file: LIFECYCLE,
      from: '    if (!held.has("title")) return;\n    emit(TITLE_STACK.leave);',
      to: "    emit(TITLE_STACK.leave);",
      expect: "T1.31",
    },
    {
      // C01 I23 — only when a rung is opted in.
      name: "focus reporting is always taken",
      file: LIFECYCLE,
      from: '      if (capabilities.notify.length > 0) take("focusReport"); // I23, C02 I17',
      to: '      take("focusReport"); // I23, C02 I17',
      expect: "T1.31",
    },
    {
      // C01 I24 — control-stripped.
      name: "an OSC payload keeps its controls",
      file: ESCAPES,
      from: 'const oscText = (text: string): string => text.replace(/[\\u0000-\\u001f\\u007f-\\u009f]/gu, "");',
      to: "const oscText = (text: string): string => text;",
      expect: "T1.31",
    },
    {
      // I128 — Ghostty's reserved shape.
      name: "a body may open with a number and a semicolon",
      file: ESCAPES,
      from: '.replace(/^(\\d+);/u, "$1 ;")',
      to: "",
      expect: "T1.76",
    },
    {
      // C02 I17 — canonical order.
      name: "the opt-in keeps the reader's order",
      file: CAPS,
      from: "  const asked = new Set(members(value));\n  return [Object.freeze(NOTIFY_RUNGS.filter((r) => asked.has(r))), \"stated\"];",
      to: "  const asked = new Set(members(value));\n  return [Object.freeze([...asked].filter((r) => (NOTIFY_RUNGS as readonly string[]).includes(r)) as NotifyRung[]), \"stated\"];",
      expect: "T1.17",
    },
    {
      // C02 I16 — by each terminal's documentation.
      name: "kitty is not known to take OSC 9",
      file: CAPS,
      from: '  kitty: "osc9",\n  ghostty: "osc9",',
      to: '  kitty: "none",\n  ghostty: "osc9",',
      expect: "T1.16",
    },
    {
      // C16 I61 — `I` is in, `O` is out.
      name: "focus in and out are swapped",
      file: DECODE,
      from: 'focused: final === "I" })',
      to: 'focused: final === "O" })',
      expect: "T1.160",
    },
    {
      // C16 I61 — never routed.
      name: "a focus report reaches the router's walk",
      file: ROUTER,
      from: '    if (e.kind === "focus") return false;\n',
      to: "",
      expect: "T1.160",
    },
    {
      // C22 I127 — the report reaches the notifier.
      name: "L4 drops the focus report without reading it",
      file: CONSTRUCT,
      from: "        notifier?.focus(e.focused);\n",
      to: "",
      expect: "T4.105",
    },
    {
      // C22 I126 — a question is waiting.
      name: "a question earns nothing",
      file: CONSTRUCT,
      from: "              notifier?.asked(questionLine(opts));\n",
      to: "",
      expect: "T4.105",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
