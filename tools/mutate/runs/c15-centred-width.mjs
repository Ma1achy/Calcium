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
  "test/integration/history.test.ts";
const MANAGER = "src/viewport/overlay/manager.ts";
const CONFIRM = "src/shell/confirm.ts";

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
    from: "        content: render(opts, selected),\n        dismissable: false,",
    to: "        content: render(opts, selected),\n        dismissable: opts.placement === \"anchored\",",
    expect: "T4.18",
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
const EXPECTED_SURVIVORS = new Map([]);

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
