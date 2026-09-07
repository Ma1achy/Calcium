// C22 I60, C09 I32 — the three wirings that make `RenderContext.tick` advance.
//
// **F227's measurement is the spec for the first mutation.** Link 2 was patched
// alone during the investigation and the frame did not move — still one distinct
// glyph across ten frames — because links 1 and 2 are each sufficient to freeze
// it. So the revert that stands against them **removes both**.
//
// **And the reason is fidelity, not redness — measured, so nobody simplifies it
// later.** Removing either half alone *also* kills: the row below that deletes
// only the arming is caught, and so is a supply-only removal. What a single-half
// row would restore is a state the tree never shipped in. The tier's own words,
// from C09 T6.21: *a revert row restoring a defect that happened rather than one
// imagined, which is the strongest form this tier takes.* Both halves were
// missing, so both come out.
//
// **The cache axis is separate because it fails differently.** With the pair
// wired and the axis missing a block animates on a cache miss and freezes on a
// hit — intermittent rather than frozen, which is the harder of the two to
// diagnose and the reason it does not ride along.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SESSION = "src/shell/session.ts";
const ANIM = "src/presentation/blocks/animation.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/integration/spinner-wiring.test.ts 2>&1", {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

/** The two halves of the pair, removed together — see the header. */
const COMMIT_FROM = '      this.#graph?.scheduler.commit("spinner");';
const SUPPLY_FROM = "        tick,\n        scrollOffsets: graph.scrollOffsets.forEntry(entry.id),";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: ANIM,
    from: "  status: true,\n  steps: true,",
    to: "  status: false,\n  steps: false,",
    why: "nothing is declared to animate, so no ticker is ever armed and T4.35 and T4.37 both go",
  },
  mutations: [
    {
      // **The state the tree shipped in, restored whole.** Neither half moves the
      // frame on its own, so this is the only honest form: `commit("spinner")`
      // called from nowhere in `src/`, and `visibleRows` supplying no counter.
      name: "the spinner commit and the counter supply are both removed",
      file: SESSION,
      from: COMMIT_FROM,
      to: "",
      also: [
        {
          file: SESSION,
          from: SUPPLY_FROM,
          to: "        scrollOffsets: graph.scrollOffsets.forEntry(entry.id),",
        },
      ],
      expect: "T4.35",
    },
    {
      // C22 I60's second half. The counter arrives and the slot ignores it, so
      // an animating entry is served its first frame on every hit.
      name: "the line cache has no tick axis",
      file: SESSION,
      from: 'const animated = cadence === null ? "" : `\\u0000${String(tick)}`;',
      to: 'const animated = "";',
      expect: "T4.36",
    },
    {
      // Without the arming there is a counter, an axis, and nothing to raise
      // either — link 1 alone, which is the one recorded nowhere.
      name: "the ticker is never armed after a frame",
      file: SESSION,
      from: "    this.#armSpinner();",
      to: "",
      expect: "T4.35",
    },
    {
      // C09 I32 — a kind that animates and is not declared arms no ticker, so
      // the block freezes while everything around it is correct.
      name: "`status` is not declared to animate",
      file: ANIM,
      from: "  status: true,",
      to: "  status: false,",
      expect: "T4.37",
    },
    {
      // The containers walk. A `steps` inside a `panel` inside a `group` is
      // exactly where a live part puts one, so a top-level-only scan answers
      // *nothing animates* for the arrangement the framework itself builds.
      name: "the animation scan does not descend into containers",
      file: ANIM,
      from: "    for (const child of childrenOf(block)) visit(child);",
      to: "",
      expect: "T4.35",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
