// Entry 16 step 2 — placement as a parameter, and C15 I20, mutated.
//
// **The first mutation here is the guard moved back to the caller**, which is
// where it lived: a comment in `shell/confirm.ts`, written after the defect had
// been found once. It reads as a tidy-up rather than as a regression, and the
// tree already held the second instance — `clearConfirmLayer` in C20 declared no
// width at all, and the rule is what found it rather than a reading.
//
// The state it forbids reads as correct at every width. An absent width resolves
// to the region's (C15 I16), so a centred layer is placed at `left` 0 across the
// whole region: `fill` wearing `centred`'s name, self-consistent in every number
// C15 reports about it.
//
// The rest attack the two joints step 2 created — the update route, and the
// pairing that must not move with the placement.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/overlay.test.ts test/integration/confirm.test.ts " +
  "test/integration/history.test.ts " +
  // **`test/integration/router.test.ts` for M8's C15 I28 mutation**, whose
  // subject is a layer surviving a question — a fact about the stack that only
  // a row holding both a keyed layer and a confirm can see, and C15's own file
  // holds none because I28 dismisses a panel on the arrival.
  //
  // **`test/unit/profile-view.test.ts` was in this list and is deleted**
  // (R-EXA-082, F1254): vitest drops a path that does not exist without a word,
  // so a run naming one is quietly executing less than it says. The rows it
  // contributed were the pushed view's, which is the same change.
  "test/integration/router.test.ts " +
  "test/unit/layout-engine.test.ts";
const MANAGER = "src/viewport/overlay/manager.ts";
const CONFIRM = "src/shell/confirm.ts";
const TYPES = "src/viewport/overlay/types.ts";
const PLACE = "src/viewport/overlay/place.ts";

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
  // **M8's three rulings, each mutated against the row that claims it**
  // (C15 I26, C15 I27, C15 I28). Every one below leaves a stack that reads correctly in
  // any session where the two fields happen to agree, which is the state the
  // single `dismissable` flag was right in for as long as it lasted.
  {
    // I26 — the conflation restored, in the direction that reads as removing a
    // redundant field. It is exactly T6.24's revert.
    name: "blocking derived from dismissal rather than declared",
    file: MANAGER,
    from: "    if (layer.blocking) {",
    to: '    if (layer.dismissal !== "escape") {',
    expect: "T1.32",
  },
  {
    // I27 — the triple stops being the kind's name and becomes a convention.
    // A panel free to vary them is a fourth kind wearing a third one's name.
    name: "a panel may declare any blocking and any dismissal",
    file: MANAGER,
    from: '    if (layer.blocking || layer.dismissal !== "escape") {',
    to: "    if (false) {",
    expect: "T1.31",
  },
  {
    // I28 — widened back to every escapable layer, which is the draft this MR
    // corrected. It closes a **view**: a confirm over a dashboard takes the
    // dashboard with it, and every row about panels still passes.
    name: "a blocking arrival closes every escape layer, views included",
    file: MANAGER,
    from: '        if (open.kind === "panel") this.dismiss(open.id);',
    to: '        if (open.dismissal === "escape") this.dismiss(open.id);',
    expect: "T4.2",
  },
  {
    // C15 I25, T6.23 — the removal reaches the owner a turn late. `pop()` has
    // returned and the ladder has moved on while the view still answers `pane`;
    // T1.28's *before `pop()` returned* is the clause that sees it.
    name: "pop emits its change on a microtask",
    file: MANAGER,
    from: '    this.#emit({ kind: "pop", id: top.id, layerKind: top.kind });\n',
    to: '    void Promise.resolve().then(() => this.#emit({ kind: "pop", id: top.id, layerKind: top.kind }));\n',
    expect: "T1.28",
  },
  {
    // C15 I25, T6.23 — no change at all for a `pop`, so an owner subscribed to
    // the stream never learns the ladder removed its layer (F944's shape back).
    name: "pop emits nothing",
    file: MANAGER,
    from: '    this.#emit({ kind: "pop", id: top.id, layerKind: top.kind });\n',
    to: "",
    expect: "T1.28",
  },
  {
    // **The guard back at the caller.** `confirm.ts` still declares its width,
    // so every confirm row passes; C20's second centred layer is the one that
    // stops being checked, and nothing about it looks wrong.
    name: "the rule is the caller's again — push checks nothing",
    file: MANAGER,
    from: "    assertPlaceable(layer);\n",
    to: "",
    expect: "T1.21",
  },
  {
    // **Push only, which is the reading that looks complete.** `LayerUpdate`
    // admits `placement`, so a layer pushed anchored and updated to centred
    // reaches the state by a route push cannot see — and every push-time row
    // agrees with this.
    name: "update is not checked, only push",
    file: MANAGER,
    from: "    assertPlaceable(updated);\n",
    to: "",
    expect: "T1.22",
  },
  {
    // **The check after the write.** The finding survives and the remedy is
    // wrong: a throw having already moved the stack leaves a layer neither
    // placed nor removed. C13's `settle(id, doc)` is the measured instance of
    // this class, two components from the ruling that produced it.
    name: "update checks after the stack has moved",
    file: MANAGER,
    from: "    assertPlaceable(updated);\n\n    const copy = [...this.#stack];\n    copy[i] = updated;\n    this.#stack = Object.freeze(copy);",
    to: "    const copy = [...this.#stack];\n    copy[i] = updated;\n    this.#stack = Object.freeze(copy);\n    assertPlaceable(updated);",
    expect: "T1.22",
  },
  {
    // **An invented default instead of a refusal.** The tempting fix, and it is
    // the one C15 cannot make: this component knows the region and nothing else
    // (I16), so any number here is a guess at content it cannot measure.
    name: "a centred layer with no width is given half the region",
    file: MANAGER,
    from: "  if (layer.placement.kind !== \"centred\" || layer.width !== undefined) return;\n  throw new OverlayError(",
    to: "  if (layer.placement.kind !== \"centred\" || layer.width !== undefined) return;\n  if (true) return;\n  throw new OverlayError(",
    expect: "T1.21",
  },
  {
    // **The anchored arm declares a width.** Every placement assertion still
    // passes — the box is where it should be — and a question anchored to the
    // prompt draws narrower than the line it belongs to, leaving whatever is
    // behind it visible on the same rows.
    name: "the anchored question declares CONFIRM_WIDTH too",
    file: CONFIRM,
    from: "  return { placement: { kind: \"anchored\", row: at.row, rows: at.rows, prefer: \"above\" } };",
    to: "  return { placement: { kind: \"anchored\", row: at.row, rows: at.rows, prefer: \"above\" }, width: CONFIRM_WIDTH };",
    expect: "T4.17",
  },
  {
    // **Escapability moving with the placement.** The pairing A6 names: an
    // anchored question that the router may pop resolves nothing, the layer
    // vanishes, and the awaiting handler stays pending forever. The symptom is
    // *the shell froze*, three components from here.
    name: "an anchored question becomes dismissable",
    file: CONFIRM,
    //
    // **Re-anchored three times.** F1118: `selected` became a thunk read at
    // render time, so the line above gained a call. M8: `dismissable` split
    // into `blocking` and `dismissal` (C15 I26), and escapability is the second
    // of the two — which is the field this mutation moves, unchanged in what it
    // means. M15: both fields stopped being literals and became §101's table's
    // answer (C23 I73), so the mutation moves what the table said rather than
    // what the file said — the same fact, one indirection on.
    from: "        blocking: routing.blocking,\n        dismissal: routing.dismissal,",
    to: "        blocking: routing.blocking,\n        dismissal: opts.placement === \"anchored\" ? \"escape\" : routing.dismissal,",
    expect: "T4.18",
  },
  {
    // **C29 I19's refusal arriving as a field.** A column beside `row` is
    // *silently inert* for any layer that declares no width: `resolveWidth`
    // gives such a layer the region and step 7's clamp returns its `left` to
    // zero. So no assertion about a placed result can see it, and only the
    // field set read by equality can — which is why T1.32 is written that way
    // (C29 §7d, walk A3, F1230).
    name: "the anchored arm gains a column",
    file: TYPES,
    from: '      prefer: "above" | "below";',
    to: '      col?: number;\n      prefer: "above" | "below";',
    expect: "T1.32",
  },
  {
    // The behavioural half of the same refusal: an anchored layer given a
    // column at all. Every height assertion in C15's suite still passes — the
    // box is the right size and in the right rows — and it is beside the thing
    // it points at rather than under it.
    name: "an anchored layer is centred horizontally",
    file: PLACE,
    from: "    } else {\n      const r = placeAnchored(layer.placement, height, region);",
    to: "    } else {\n      left = Math.floor((region.width - width) / 2);\n      const r = placeAnchored(layer.placement, height, region);",
    expect: "T1.32",
  },
  {
    // **The declared survivor, and it is a watch rather than a gap.** See
    // EXPECTED_SURVIVORS below.
    name: "step 7's horizontal clamp removed",
    file: PLACE,
    from: "    left = Math.max(0, Math.min(left, Math.max(0, region.width - width)));\n",
    to: "",
    expect: null,
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * Empty: every mutation above is expected to be caught. An entry would name a
 * mutation the suite cannot see and why that is acceptable — and the pass fails
 * if a listed mutation is caught after all, so an entry cannot outlive its
 * reason.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "step 7's horizontal clamp removed",
    "**unreachable by construction, and this entry is the watch on that** (C29 I19, F1230). " +
      "`resolveWidth` bounds the width by the region, an anchored layer takes `left = 0`, and a " +
      "centred one takes a column already inside `[0, region.width - width]` — so no input reaches " +
      "the clamp and removing it can fail nothing. It stays in the tree as a guard. The day a " +
      "placement can produce a column of its own the mutation starts being caught, and this pass " +
      "then fails as a stale exemption, which is the notice that C29 I19's refusal has been lifted " +
      "somewhere and the ruling is owed a re-reading",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: MANAGER,
    from: "function assertPlaceable(layer: Layer): void {",
    to: "function assertPlaceable(layer: Layer): void {\n  throw new OverlayError(`control ${layer.id}`);",
    why:
      "the guard refuses every layer — if this survives, nothing in the set reaches " +
      "`assertPlaceable` at all and every kill below is unearned. The first control here was " +
      "`push` refusing an empty id, which no row constructs: a control that cannot fire is the " +
      "blind harness it exists to detect, arriving in the detector",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
