// C28 §3c — the profiler's view, mutated (C28 I49, I50, I51, I52; C15 I25; C24 I33).
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
// The deck's own two suites are in the corpus because the register and the kit
// are now part of what this run mutates: a row expecting `T1.114` against a
// command that does not run it reports a survivor for a reason that has nothing
// to do with the mutation. **The comment is here rather than between the string
// parts**: `anchors.mjs` collapses `" +` concatenation with a regex that allows
// whitespace and not a comment, so a line break with a `//` in it hides every
// path after it from the sweep.
const CMD =
  "npx vitest run test/unit/profile-view.test.ts test/unit/profiler.test.ts " +
  "test/integration/profiler.test.ts test/unit/local-profile.test.ts " +
  "test/unit/profile-register.test.ts test/unit/profile-deck.test.ts";

const VIEW = "src/shell/profile-view.ts";
const DECK = "src/shell/profiling/panes/index.ts";
const REGISTER = "src/shell/profiling/panes/register.ts";
const KIT = "src/shell/profiling/panes/kit.ts";
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
    from: "        deps.overlays.push(layerFor(contentFor(report, at)));\n",
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
        "      deps.overlays.update(PROFILE_VIEW_ID, { content: contentFor(report, at) });\n" +
        "      deps.redraw(reason);\n" +
        "    });",
      to:
        "    deps.overlays.update(PROFILE_VIEW_ID, { content: contentFor(report, at) });\n" +
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
      from: '      render(profiler, at, "stream", report);',
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
      // **The group boundary moved** — the plan's named control. The verdict
      // joins group A, so the first section is empty, `/profile` opens on a
      // section with no card, and the deck's contiguity — which is what gives
      // the section gesture a section to name — is gone.
      // Hand pass 2026-09-12: T1.114 first, then T1.101.
      name: "the verdict card joins the app's group",
      file: REGISTER,
      from: '    id: "verdict",\n    group: "verdict",',
      to: '    id: "verdict",\n    group: "app",',
      expect: "T1.114",
    },
    {
      // **The per-frame index off by one** — a card resolved against the frame
      // *after* the one its header names. Every figure is a real frame's and
      // none is the frame the reader is being shown, which is F1128's defect
      // with the address corrected and the resolution wrong.
      // Hand pass 2026-09-12: T1.110.
      name: "a per-frame card resolves the frame after the one it names",
      file: KIT,
      from: "  return r.worst.find((f) => f.seq === seq) ?? null;",
      to: "  return r.worst[r.worst.findIndex((f) => f.seq === seq) + 1] ?? null;",
      expect: "T1.110",
    },
    {
      // **The footer qualifier detached from its figure** — the population
      // clause gone, so a `dotplot` of a span's p50 and a `boxplot` of the same
      // span's quartiles disagree with nothing on either card saying why
      // (F1127). The figures are unchanged and every plot assertion passes.
      // Hand pass 2026-09-12: T1.109.
      name: "a card states no population",
      file: DECK,
      from: '  if (spec.site === "frame") parts.push(`frame-site spans${ctx.sep}${populationFooter(r, "ring")}`);',
      to: '  if (false) parts.push(`frame-site spans${ctx.sep}${populationFooter(r, "ring")}`);',
      expect: "T1.109",
    },
    {
      // C28 I52 — the header's gap back: a blank first row on every page of
      // every pane, which is the builder's default and reads as deliberate.
      // T1.98's one-row region is the arm that sees it, before the walked
      // figures do.
      // Hand pass 2026-09-09: T1.98 and T1.100 — the one-row region, then the
      // four totals each one high.
      name: "the view's header carries its gap again",
      file: VIEW,
      from:
        "        id: HEADER_ID,\n" +
        "        // One row, not two: the builder's default gap is a blank row above the\n" +
        "        // first thing on the screen (C28 I52).\n" +
        "        gapBefore: false,\n",
      to: "        id: HEADER_ID,\n",
      expect: "T1.98",
    },
    {
      // C28 I51, C09 I49, F828 — `profileCard`'s ASCII default on a terminal that
      // has capabilities of its own. Three rows on the hand pass, T4.9 through
      // the graph's resolved record.
      name: "the card takes the deck's default caps",
      file: VIEW,
      from: "    return profileDeck(report, at.section, at.index, { w: width, rows: height - 1 }, deps.capabilities);",
      to: "    return profileDeck(report, at.section, at.index, { w: width, rows: height - 1 });",
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
      from: "    profile: profileHandler(deps.profileView, deps.profileReport, deps.profileCapture),\n",
      to: "",
      expect: "T4.66",
    },
    {
      // C23 T1.67 — the L0 copy of C28's `SECTIONS` drifts by one member. C05
      // then rejects `/profile framework` before the handler sees it, and
      // nothing else in the tree compares the two lists.
      name: "the manifest's section values lose a member",
      file: FRAMEWORK,
      from: '        values: Object.freeze(["verdict", "app", "framework", "snapshot", "live", "capture"]),',
      to: '        values: Object.freeze(["verdict", "app", "snapshot", "live", "capture"]),',
      expect: "T1.67",
    },
  ],
});

// `report` **returns** the lines; a bare call discards them, and the exit code
// is then one bit — the same bit for *survived* and *printed nothing* (F768).
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
