// C26 §5c — the selection's extent, one home, mutated.
//
// **The subject is a helper that replaced two copies**, so every mutation here
// is checked for killing rows on *both* sides — `session-navigation`'s `y`
// rows read `copyElement`, `render-focus`'s wash rows read `focusFor` — because
// one function dying in two places is the whole point of having one. Written
// with anchors and measured by hand in the lane that wrote it (arc5 Lane E);
// the harness itself was not run there (arc2 rule). Hand figures: M1 killed
// T3.40, T3.46, T3.49, T3.50, T4.8, T4.61; M2 (the control) T3.46, T3.48,
// T3.50, T3.51, T4.8, T4.61; M3 nine rows in `session-navigation` and none in
// `render-focus` (see M3); M4 T1.4, T1.6b, T1.7, T1.11, T1.30, T2.40.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/session-navigation.test.ts test/unit/render-focus.test.ts test/unit/viewport.test.ts test/contract/scroll-follow.test.ts";
const FOCUS = "src/interaction/router/focus.ts";
const TAIL = "src/viewport/viewport/tail.ts";

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
    // **The defect the rule was written against (F764), restored.** A stale
    // anchor taken through `resolveFocus` falls to the block's first element,
    // and `y` after `↓ ↓ ⇧↓` with the anchor's row gone copied `alpha-1`, which
    // was never selected. T3.50's second `select` is that measurement.
    //
    // **And T4.8 dies with it, at the collapse** — measured: after `↓` to delta
    // `focusRow` writes `anchor: null`, `null` has no exact match either, and
    // `resolveFocus(null)` answers the block's first element, so alpha..delta
    // came back washed (`48;5;237` on alpha). One anchor, two readers, one
    // mutation killing rows on both sides — which is the point of one copy.
    name: "a stale anchor falls through resolveFocus to the block's first element",
    file: FOCUS,
    from: "  const anchor = exact === -1 ? head : exact;",
    to: "  const anchor = exact === -1 ? (resolveFocus(anchorAt, elements) ?? head) : exact;",
    expect: "T3.50",
  },
  {
    // The far end excluded. T3.46 copies every source in order and gets one
    // short. **No `render-focus` row dies on this one** — measured — because
    // T4.8 asserts alpha and bravo washed with the head on charlie, and the
    // dropped end is the head, which is painted accent from `head` and not
    // from the slice. The wash rows cannot see the slice's last element; the
    // copy rows can. Recorded rather than fixed: a wash row for it would
    // assert the head's membership of a set every reader treats as implied.
    name: "the extent stops one short of its far end",
    file: FOCUS,
    from: "Math.max(anchor, head) + 1)),",
    to: "Math.max(anchor, head))),",
    expect: "T3.46",
  },
  {
    // **The comparison the fold exists to make singular.** `>` in place of `>=`
    // is the drift `shell/tail.ts`'s header names — a box that stops following
    // one row early. One anchor, and the dead rows are in two layers: C14's
    // T1.6b (I5, position not direction) and the shell's T1.30 / T2.40 (C04
    // I97), which is the measurement that there is one copy.
    name: "atTail is > and not >=",
    file: TAIL,
    from: "  return offset >= last;",
    to: "  return offset > last;",
    expect: "T1.6b",
  },
];

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FOCUS,
    from: "  const anchor = exact === -1 ? head : exact;",
    to: "  const anchor = head;",
    why: "T4.8 asserts alpha and bravo washed after ↓ ⇧↓ ⇧↓; an extent that is the head alone washes nothing, so a run where this survives cannot see the selection at all",
  },
  mutations: MUTATIONS,
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
