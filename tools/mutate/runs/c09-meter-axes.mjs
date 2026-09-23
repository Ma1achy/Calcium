// §035's three axes, mutated — and the mutations are about **independence**.
//
// **A preset enum wearing three field names passes every row about the two
// presets**, which is `R-BLK-237`'s own warning — *BUDGET and OPERATION are
// named PRESETS, not the only possible types* — so the mutations below couple
// the axes to each other and to the thing each is meant to be outranked by.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const FILES = "test/contract/blocks.test.ts test/golden/design-surfaces.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
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
    // The readout is the share whatever the quantity, so the one axis that
    // moves a colourless frame moves nothing.
    file: SIMPLE,
    from: "      block.quantity === \"capacity\" ? `${share}  ${pair}`",
    to: "      false ? `${share}  ${pair}`",
    why: "a capacity reads as a progress, so the readout stops distinguishing the quantities",
  },
  mutations: [
    {
      // **`style` stops outranking granularity**, which is the registry's own
      // deferral inverted: *use only when its texture is declared by the
      // component* means a declared texture wins. Every bar that names no style
      // is unmoved, so only the outranking arm can see it.
      name: "granularity outranks a declared style",
      file: SIMPLE,
      from: "      block.style ?? (block.granularity === \"segmented\" ? \"slant\"",
      to: "      (block.granularity === \"segmented\" ? \"slant\"",
      expect: "T2.162",
    },
    {
      // **The two granularities collapse onto one alphabet.** The bar still
      // draws, still measures one row, and still reads its share — and §035's
      // first claim, that the alphabet follows granularity, is gone.
      name: "segmented and continuous draw the same alphabet",
      file: SIMPLE,
      from: "block.granularity === \"segmented\" ? \"slant\"",
      to: "block.granularity === \"segmented\" ? \"block\"",
      expect: "T2.162",
    },
    {
      // **A count keeps its percentage**, which §035 rules against by naming
      // the reason: *the unit is what tells you whether 44% is nearly done or
      // nowhere near*. The pair is still drawn, so a row asserting the units
      // are present passes.
      name: "a count reads a share as well as its units",
      file: SIMPLE,
      from: "      : block.quantity === \"count\" ? `${String(block.current)} of ${String(block.total)}`",
      to: "      : block.quantity === \"count\" ? `${share}  ${String(block.current)} of ${String(block.total)}`",
      expect: "T2.162",
    },
    {
      // **Liveness fabricates a ramp**, which is the one thing I97 says it must
      // not: a bar with no ink has nothing to animate, and choosing a `fill`
      // would be choosing a value the design never names. Every bar that
      // declares a ramp is unmoved.
      name: "liveness animates a bar that declared no ramp",
      file: SIMPLE,
      // **The first form of this mutation survived and the row was innocent.**
      // It moved a ramp-less bar into the sampled branch, where `rampStyle` is
      // never called and adjacent one-cell spans coalesce — byte-identical
      // output, a mutation that could not change anything. `ramp` is read once
      // now, so the rule has a site.
      from: "    const ramp = block.ramp;",
      to: '    const ramp = block.ramp ?? (block.liveness === undefined ? undefined : { fill: "gradient" });',
      expect: "T2.162",
    },
    {
      // **A declared `animate` stops outranking liveness.** The two happen to
      // agree whenever the block declares `shimmer`, so only a block declaring
      // a third animation beside an `active` liveness can tell them apart.
      name: "liveness outranks a declared animate",
      file: SIMPLE,
      from: "      ramp?.animate ??\n      (block.liveness === \"active\" ? \"shimmer\"",
      to: "      (block.liveness === \"active\" ? \"shimmer\"",
      expect: "T2.162",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
