// C22 §3 — the construction order, and the cycle §3a found.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/unit/session-construct.test.ts",
  "test/integration/lifecycle.test.ts",
  "test/integration/viewport.test.ts",
].join(" ");

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${SUITE} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/construct.ts",
    from: '  "capabilities",\n  "registries",',
    to: '  "registries",\n  "capabilities",',
    why: "T1.1 compares the log against STEPS, so reordering STEPS cannot pass",
  },
  mutations: [
    {
      // Seam 4's C22 rows: the shell pushes, the component never reaches.
      name: "wire the resize after the router instead of at 8a",
      file: "src/shell/construct.ts",
      // **Anchored on the step's opening line alone.** The old anchor reached
      // through to `lifecycle.onResize` on the next line, and C28's recording
      // and width taps landed between the two — a mutation whose subject is
      // *where the step sits* should not be anchored on what the step's first
      // statement happens to be (F912 keyed the sweep that found it).
      from: '  at("resize", () => {',
      to: '  at("router", () => undefined);\n  at("resize", () => {',
      expect: "T1.1",
    },
    {
      // **Re-derived, and the direction inverted** (F1118). The old mutation
      // deleted `stores.viewport.resize(...)` from the resize handler; C03 I15
      // deleted it from the tree, because it was a **second writer** of a
      // quantity `render-frame.ts` already sets, whose only effect was to
      // re-measure the whole transcript per `SIGWINCH` rather than per frame —
      // 544 ms for a 30-event drag at a thousand entries (F423).
      //
      // T4.6's claim inverted with it, and its own comment says what the row
      // now stands against: *it is the one that fails if a second writer is ever
      // added back.* So the mutation adds one. The harness stubs `render` with a
      // counter, so no frame is ever composed — which is what makes a write from
      // anywhere else observable at all.
      name: "add the second writer of the viewport's size back to the resize handler",
      file: "src/shell/construct.ts",
      from: "      refreshAnchors();",
      to:
        "      const sigwinchSize = lifecycle.size();\n" +
        "      stores.viewport.resize({ width: sigwinchSize.columns, height: sigwinchSize.rows });\n" +
        "      refreshAnchors();",
      expect: "T4.6",
    },
    {
      // **Re-derived onto the loop** (F1118). The old anchor took the commit out
      // of the wheel handler, and C22 I27 took it out of every handler: one
      // commit per decoded batch, issued by `deliver`, and the handler's return
      // does not gate it. T4.8 was moved to drive the read loop for the same
      // reason — *this test asserted the handler's, which was the mechanism it
      // happened to find, and it passed unchanged while the handler and the loop
      // would both have committed.*
      //
      // So *C14 moves and nothing paints* is no longer constructible from a
      // handler, and the batch's commit is the whole of what makes a scroll
      // reach the screen.
      name: "the decoded batch moves the viewport and commits nothing",
      file: "src/shell/construct.ts",
      from: "        stampInput();\n        scheduler.commit(\"input\");",
      to: "        stampInput();",
      expect: "T4.8",
    },
    {
      // **The mutation the 9/10/11 split exists for.** Registration moves back
      // in with the router, as the spec had it, and the submit handler closes
      // over a `pipeline` that is still in its temporal dead zone.
      name: "register the submit handler at step 9, with the router",
      file: "src/shell/construct.ts",
      // **Re-anchored to the one line it needs** (F1109). The pair was
      // `at("register", …)` plus the `router.register` beneath it, and a doc
      // comment moved in between — so the anchor stopped matching while
      // `anchors.mjs` could not see it at all, because it is a template literal
      // and the reader knew two quote characters. `at("register", () => {` is
      // unique in the file, checked, so the second line bought nothing.
      from: '  at("register", () => {',
      to: "  ((): void => {",
      expect: "T1.4b",
    },
    {
      // **The one axis of T1.2 that is not held by the compiler** (F1110).
      //
      // The row reads `graph.log` for *stores and runner precede lifecycle*, and
      // three separate mechanisms already make the construction order
      // unmutatable. `Step` is a closed union, so a label cannot be changed or
      // invented — `at("runner-late", …)` is TS2345. `at` pushes the step itself,
      // so the record follows the call order mechanically. And `beforeRelease`
      // closes **eagerly** over `runner` and `stores`, inside a callback `at`
      // invokes at once, so a lifecycle constructed earlier is a TDZ error the
      // compiler refuses outright.
      //
      // What is left is the two steps `at` cannot wrap. `stores` and
      // `registries` are `await`ed async IIFEs, and `at` is synchronous — its
      // try/catch cannot reach an async rejection — so each hand-rolls the
      // `.catch` **and the `log.push`**. `at`'s guarantee is *the step is logged
      // iff `fn` completed*; these two reproduce it by hand, and nothing checks
      // that they keep doing so. Losing one in an edit type-checks and leaves a
      // log that silently under-reports.
      //
      // **The old `to` was `atLate("runner", …)` and `atLate` is in no file**
      // (F1107), so the row was caught by a `ReferenceError` rather than by the
      // ordering it names. Its author was reaching for a helper that would log
      // late — which is the right instinct and the wrong axis: the record is
      // where this row can be wrong, and only at the two places a human writes
      // it.
      name: "an async step's record is not written by hand (I1)",
      file: "src/shell/construct.ts",
      from: '  log.push("stores");',
      to: "",
      expect: "T1.2",
    },
    {
      name: "seal after registration (I3)",
      file: "src/shell/construct.ts",
      from: `  at("seal", () => {
    built.blocks.seal();`,
      to: `  queueMicrotask(() => {
    built.blocks.seal();`,
      expect: "T1.4",
    },
    {
      // Re-anchored (F1109): `detectCapabilities` gained `config.capabilities`
      // and the call wrapped onto three lines. The mutation is unchanged — the
      // step stops being logged — and only the text it names moved.
      name: "detect capabilities after the registries are built",
      file: "src/shell/construct.ts",
      from:
        '  const detection = at("capabilities", () =>\n' +
        "    detectCapabilities(config.env, config.capabilities),\n  );",
      to: "  const detection = detectCapabilities(config.env, config.capabilities);",
      expect: "T1.1",
    },
    {
      name: "give the viewport a placeholder size, corrected later",
      file: "src/shell/construct.ts",
      from: "  const size = terminalSize(config.stdout);",
      to: "  const size = { columns: 80, rows: 24 };",
      expect: "T1.14",
    },
    {
      name: "acquire the terminal during construction (I2)",
      file: "src/shell/construct.ts",
      from: '  const scheduler = at("scheduler", () =>',
      to: '  lifecycle.acquire();\n  const scheduler = at("scheduler", () =>',
      expect: "T1.3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
