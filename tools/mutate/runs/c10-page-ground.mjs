// C10 I34, §4f — the page a renderer paints on, and the exclusion whose
// conditional had fired.
//
// **The subject is a surface's membership, not a colour.** §4 excludes `bgDeep`
// from every floor and states the trigger that would revisit it — *if a surface
// ever paints text on it, that surface is wrong or the exclusion is*. The SVG
// plot arm was that surface from the day it was written: page, sankey halo,
// tile-label ink and separator stroke all read one constant, and every tick,
// title, legend row, callout, notice and node label lands on it. Nothing
// watched the trigger, so both halves of the conditional went unacted-on — a
// sentence that names a trigger and no watcher is satisfied by nobody looking,
// which is A03 §2's vacuity class arriving in prose.
//
// **So the mutations attack the property and not the hex.** A row asserting
// `#1a1a1a` would pass a revert on any theme whose `bgDeep` happened to equal
// its `bg`, and would fail on a theme change that was correct. T2.27 asks
// whether the page is a member of `textSurfaces`, which is the class; T2.28 asks
// whether the four sites are still one colour, which is the halo staying a hole
// rather than becoming a rim.
//
// **The two rows answer different questions and the pass is what shows it**:
// reverting the ground kills T2.27 and leaves T2.28 green, because all four
// sites move together. A run in which one mutation killed both would mean one of
// them is a restatement of the other.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SVG = "src/presentation/plot/svg.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";

// **`test/contract/theme.test.ts` carries both rows and `test/unit/theme.test.ts`
// carries the measurement they rest on.** The plot suites are in the set because
// the arm's own rows name the page's slot, and a mutation that moved the ground
// while they stayed green would be a finding about them.
const FILES = "test/contract/theme.test.ts test/unit/theme.test.ts test/edge/theme.test.ts"
  + " test/unit/plot-svg-colour.test.ts test/unit/plot-svg-path.test.ts";

// **Atomic, per F237** — a kill mid-write leaves a prefix, and `runPass` restores
// with whatever `write` it is handed.
const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SVG,
    from: 'const GROUND: ColourRef = "surface.bg";',
    to: 'const GROUND: ColourRef = "tone.error";',
    why: "the page painted in a tone is not a surface at all, so both rows and the arm's own colour rows go together",
  },
  mutations: [
    {
      // **The revert itself** (T6.86). It is the state the tree shipped in, and
      // the row that catches it does so on the property rather than the value:
      // `bgDeep` is not in `textSurfaces` whatever hex the theme makes it.
      name: "the page goes back to `surface.bgDeep`",
      file: SVG,
      from: 'const GROUND: ColourRef = "surface.bg";',
      to: 'const GROUND: ColourRef = "surface.bgDeep";',
      expect: "T2.27",
    },
    {
      // **The halo given a slot of its own** (T6.87). The page stays right and
      // the label acquires a rim — a difference a byte-compare golden records
      // faithfully and cannot object to, which is why the row is an equality
      // across the four sites rather than four comparisons against a literal.
      //
      // **`RULE` and not a hex**, so the mutation is killed by the row it names
      // rather than by the source scan that forbids a colour literal in this
      // file — a mutation killed for the wrong reason is a survivor wearing a
      // kill's clothes.
      name: "the sankey halo stops being the page",
      file: SVG,
      from: '      : ` stroke="${ground}" stroke-width="${n(HALO)}"',
      to: '      : ` stroke="${inkOf(RULE, theme) ?? ground}" stroke-width="${n(HALO)}"',
      expect: "T2.28",
    },
    {
      // **`bgDeep` admitted to the check instead**, which is the arm this
      // ruling declined. It costs twelve light slots — `tone.muted` at 2.44
      // under its own 2.5 — so the shipped light theme stops loading, and the
      // row that says so is the one asserting a leaning `bgDeep` still loads.
      name: "`bgDeep` joins the text surfaces",
      file: CONTRAST,
      from: '    ["bgElev", tokens.surfaces.bgElev],\n  ];',
      to: '    ["bgElev", tokens.surfaces.bgElev],\n    ["bgDeep", tokens.surfaces.bgDeep],\n  ];',
      expect: "T3.34",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
