// C15 §2a — the peek, mutated.
//
// **Every mutation here was run by hand before this file existed**, and each
// row records which test died. The first two are the measured cell: with a
// plain overlay standing in for the peek, `↓`, `⏎` and `Esc` were all taken by
// the layer (C15 §2a), so the two ways of putting a peek back in C16's sight —
// `top` answering any kind, or the emitter pushing an `overlay` — are the
// reverts that matter most and look most like a tidy-up.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/overlay.test.ts test/contract/overlay.test.ts test/edge/overlay.test.ts " +
  "test/integration/peek.test.ts test/unit/interaction-catalogue.test.ts";
const MANAGER = "src/viewport/overlay/manager.ts";
const PLACE = "src/viewport/overlay/place.ts";
const CONSTRUCT = "src/shell/construct.ts";
const TABLE = "src/presentation/table/definition.ts";

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
  // **The sentinel is a mutation the lane killed by hand.** The first control here
  // was vacuous — its `why` described a kill no row constructed — and the harness
  // refused to report (`BlindHarnessError`, F784). A control must be the kill that
  // is not in doubt, not the cleverest change.
  control: {
    file: CONSTRUCT,
    from: '      stores.overlays.push({ id: PEEK_ID, kind: "peek", placement, content, dismissable: true });',
    to: '      stores.overlays.push({ id: PEEK_ID, kind: "overlay", placement, content, dismissable: true });',
    why: "T4.10 asserts ↓ moves focus with the peek up; a peek pushed as an overlay steals the key (F780's measurement) — a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The measured cell** (C15 I21). `top` is what C16 reads, and a top that
      // can be a peek is an `overlay` to `activeTarget`: `↓` consumed, focus
      // unmoved. T4.10 is the graph-level row; T1.23 and T1.25 the unit ones.
      name: "top answers the topmost layer of any kind, peek included",
      file: MANAGER,
      from: '      if (layer.kind !== "peek") return layer as KeyedLayer;',
      to: "      return layer as KeyedLayer;",
      expect: "T4.10",
    },
    {
      // C15 I23 — the peek band collapses into the overlays, so a confirm raised
      // over a peek is drawn beneath it. Only reachable through `push`, which is
      // why T1.24 exists beside T2.8.
      name: "peeks sort with the overlays rather than beneath them",
      file: PLACE,
      from:
        '  const peeks = stack.filter((l) => l.kind === "peek");\n' +
        '  const overlays = stack.filter((l) => l.kind === "overlay");\n' +
        "  return Object.freeze([...views, ...peeks, ...overlays]);",
      to:
        '  const overlays = stack.filter((l) => l.kind !== "view");\n' +
        "  return Object.freeze([...views, ...overlays]);",
      expect: "T1.24",
    },
    {
      // C15 §2a's trace, second row: the peek is reconciled after the keys or it
      // is not reconciled at all — the viewport path fires on scroll and content,
      // never on a focus move.
      name: "the emitter is not run after the keys, so the peek does not follow focus",
      file: CONSTRUCT,
      from: "        syncPeek();\n        stampInput();",
      to: "        stampInput();",
      expect: "T4.11",
    },
    {
      // C15 I22 — the refusal at both entry points.
      name: "a centred or fill peek is accepted",
      file: MANAGER,
      from: '  if (layer.kind === "peek" && layer.placement.kind !== "anchored") {',
      to: '  if (layer.kind === "peek" && false) {',
      expect: "T1.26",
    },
    {
      // C26 §5 — the declarer's half. A row never declares a detail, so nothing
      // opens; the catalogue's peek scene throws (IC1) and every graph row loses
      // its subject.
      name: "a cut row declares no detail",
      file: TABLE,
      from: "  if (rows.length === 0) return null; // cells-ok — a row count, not a width",
      to: "  return null; // cells-ok — a row count, not a width",
      expect: "T4.10",
    },
    {
      // **The other half of the measured cell**: the emitter pushes the right
      // content with the wrong kind. Every number in `Placed` agrees and the keys
      // go to the layer.
      name: "the peek is pushed as an overlay and takes the keys",
      file: CONSTRUCT,
      from: '      stores.overlays.push({ id: PEEK_ID, kind: "peek", placement, content, dismissable: true });',
      to: '      stores.overlays.push({ id: PEEK_ID, kind: "overlay", placement, content, dismissable: true });',
      expect: "T4.10",
    },
    {
      // C15 §2a — `Esc` closes the peek because focus left, and this is the
      // clause that makes that true.
      name: "the peek is left on the stack when focus leaves the block",
      file: CONSTRUCT,
      from: "      if (have) stores.overlays.dismiss(PEEK_ID);\n      return;",
      to: "      return;",
      expect: "T4.11",
    },
  ],
});

// Printed and exited on, not merely computed (F768): a report built and dropped
// is exit 0 with no witness, the same bit as a clean pass.
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
