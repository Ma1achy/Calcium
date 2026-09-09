// C28 §3c — the profiler's view, mutated (C28 I49, I50, I51; C15 I25; C24 I33).
//
// **Every mutation here was applied by hand on the day the rows landed, and
// the counts below are from that pass, not estimated.** Two rows were rewritten
// on the evidence: T1.92 and T4.4 asserted the bracket around `open` alone, and
// removing the bracket around the shared redraw (`render`) failed nothing but
// T1.95 — so both gained a redraw-in-place step. T3.13 opened at `spans`, where
// *dispose leaves the tier* has nothing to leave, and now opens at `counters`.
//
// **What this run is for.** The view holds two things that outlive its layer —
// a raised tier and an armed timer — and every mutation is one of the ways they
// could outlive it wrongly: a restore on the wrong condition, a teardown that
// answers for a menu's removal, a timer that survives `pop()`, a dispose that
// restores what the report has already been taken from. The control removes the
// push, so a survivor set that includes the control is a run that did not
// execute the suites at all.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/profile-view.test.ts test/unit/profiler.test.ts " +
  "test/integration/profiler.test.ts test/unit/local-profile.test.ts";

const VIEW = "src/shell/profile-view.ts";
const FRAMEWORK = "src/data/manifest/framework.ts";
const HANDLERS = "src/shell/local/handlers.ts";

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
    file: VIEW,
    from: "        deps.overlays.push(layerFor(project(at.blocks, 0)));\n",
    to: "",
    why: "a view that pushes nothing fails twelve of the thirty rows outright; a run where this survives is not executing the view's suites at all",
  },
  mutations: [
    {
      // C28 I49 — the redraw outside the bracket. `open` has a bracket of its own,
      // so a row that stops at the open passes this; T1.92's tick and T4.4's
      // `switchPane` are what catch it (three rows on the hand pass).
      name: "the redraw in place is not bracketed",
      file: VIEW,
      from:
        "    profiler.own(() => {\n" +
        "      deps.overlays.update(PROFILE_VIEW_ID, { content: project(at.blocks, at.offset) });\n" +
        "      deps.redraw(reason);\n" +
        "    });",
      to:
        "    deps.overlays.update(PROFILE_VIEW_ID, { content: project(at.blocks, at.offset) });\n" +
        "    deps.redraw(reason);",
      expect: "T1.92",
    },
    {
      // C28 I50, §9b B2 — restore whatever was remembered, leaning on the recorder's
      // short-circuit for an unchanged tier. Green on the tier; the spy on
      // `setTier` is the only thing that sees the call (one row on the hand pass).
      name: "the close restores on every path",
      file: VIEW,
      from: "if (profiler !== null && at.before !== null) profiler.setTier(at.before);",
      to: 'if (profiler !== null) profiler.setTier(at.before ?? "spans");',
      expect: "T1.93",
    },
    {
      // C28 I50 — restore to `counters` rather than to the tier found. T1.16d opens
      // at `counters` and cannot see it; `off` is the arm that disagrees.
      name: "the close restores to counters",
      file: VIEW,
      from: "if (profiler !== null && at.before !== null) profiler.setTier(at.before);",
      to: 'if (profiler !== null && at.before !== null) profiler.setTier("counters");',
      expect: "T3.12",
    },
    {
      // C28 I50 — no raise at all. Seven rows on the hand pass, T1.16d first.
      name: "opening never raises the tier",
      file: VIEW,
      from: '      if (raise) profiler.setTier("spans");\n',
      to: "",
      expect: "T1.16d",
    },
    {
      // C28 I50, §9b S7 — a second `open` forgets the first: the state is dropped,
      // the stack check refuses, and the tier is never restored.
      name: "a second open forgets the first",
      file: VIEW,
      from: 'if (state !== null) return "close the profiler view before opening it again";',
      to: "if (state !== null) state = null;",
      expect: "T1.99",
    },
    {
      // C28 I50, C15 I25, §9b S11 — the teardown runs on any removal, so a menu
      // popped above the view closes the view under it. T1.94's control.
      name: "the teardown answers every removal",
      file: VIEW,
      from: 'if ((change.kind === "pop" || change.kind === "dismiss") && change.id === PROFILE_VIEW_ID) {',
      to: 'if (change.kind === "pop" || change.kind === "dismiss") {',
      expect: "T1.94",
    },
    {
      // C28 I50, C15 I25, §9b S4 — no subscription: the ⌃c ladder's `pop()` leaves
      // the tier raised for the session (F944). Three rows on the hand pass,
      // T4.6 through the decoder and the router.
      name: "no owner listens to the change stream",
      file: VIEW,
      from: 'if ((change.kind === "pop" || change.kind === "dismiss") && change.id === PROFILE_VIEW_ID) {',
      to: "if (false as boolean) {",
      expect: "T4.6",
    },
    {
      // C28 I51, §9b S6 — the timer outlives the close. A tick then fires into an
      // `update` that returns `false`; T1.95 counts the disposal.
      name: "the timer survives the teardown",
      file: VIEW,
      from:
        "    state = null;\n" +
        "    timer?.[Symbol.dispose]();\n" +
        "    timer = null;\n" +
        "    const profiler = deps.profiler;",
      to: "    state = null;\n    const profiler = deps.profiler;",
      expect: "T1.95",
    },
    {
      // C28 I51 — the tick commits as `input`, so C03 serves it on a keypress's
      // terms rather than a stream's.
      name: "the tick is served as input",
      file: VIEW,
      from: '      render(profiler, at, "stream");',
      to: '      render(profiler, at, "input");',
      expect: "T3.14",
    },
    {
      // C28 I51, C15 I8, F947 — no window: the whole pane is handed to C15, which
      // clips it in silence.
      name: "the pane is not windowed",
      file: VIEW,
      from: "    const from = Math.max(0, Math.min(offset, blocks.length - 1));",
      to: "    return blocks;\n    const from = Math.max(0, Math.min(offset, blocks.length - 1));",
      expect: "T1.98",
    },
    {
      // C28 I51, C09 I49, F828 — `profilePane`'s ASCII default on a terminal that
      // has capabilities of its own. Three rows on the hand pass, T4.9 through
      // the graph's resolved record.
      name: "the pane takes profilePane's default caps",
      file: VIEW,
      from: "      ...profilePane(profiler.report(), pane, deps.capabilities),",
      to: "      ...profilePane(profiler.report(), pane),",
      expect: "T1.96",
    },
    {
      // C28 I50, §9b S5 — `dispose()` restores the tier, resetting a ring the
      // report was taken from moments before. T3.13 at the view, T4.8 through
      // `release()`.
      name: "dispose restores the tier",
      file: VIEW,
      from: "      subscription[Symbol.dispose]();\n      state = null;",
      to: "      subscription[Symbol.dispose]();\n      closed();",
      expect: "T3.13",
    },
    {
      // C23 I27 — the handler without its row. `seal()` refuses at startup, so
      // the harness throws while constructing and every T4 row in the file is
      // red; T4.66 is the one named because it is the row that landed with it.
      name: "the manifest has no profile row",
      file: FRAMEWORK,
      from: '    name: "profile",\n    local: true,',
      to: '    name: "profile-x",\n    local: true,',
      expect: "T4.66",
    },
    {
      // C23 I27, the other half — the row without its handler.
      name: "shippedHandlers drops the profile handler",
      file: HANDLERS,
      from: "    profile: profileHandler(deps.profileView),\n",
      to: "",
      expect: "T4.66",
    },
    {
      // C23 T1.67 — the L0 copy of C28's `PANES` drifts by one member. C05 then
      // rejects `/profile memory` before the handler sees it, and nothing else
      // in the tree compares the two lists.
      name: "the manifest's pane values lose a member",
      file: FRAMEWORK,
      from: '        values: Object.freeze(["overview", "frame", "distribution", "memory"]),',
      to: '        values: Object.freeze(["overview", "frame", "distribution"]),',
      expect: "T1.67",
    },
  ],
});

// `report` **returns** the lines; a bare call discards them, and the exit code
// is then one bit — the same bit for *survived* and *printed nothing* (F768).
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
