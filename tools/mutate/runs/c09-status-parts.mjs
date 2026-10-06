// C09 I84, I85, §3a-ter — the three parts, the caps, and the state that is not
// a failure.
//
// **The subject is an allocation, and an allocation is invisible to a row count.**
// `measure` for this kind is the height the caller declared, so every rearrangement
// of the interior draws exactly as many rows as it was granted and T2.1 agrees
// whatever the parts do. What the parts can be wrong about is *which* rows, and
// the only instrument that asks is a mutation that moves one clause and leaves
// the other two alone.
//
// **Three clauses, three mutations, and that is the argument for the shape.**
// Written as one expression the allocation would have one mutation and the pass
// would report it caught — a run whose mutations all die to one row is telling
// you the row is coarse, not that the mechanism is covered. Each clause is taken
// out on its own and each must take a different row down.
//
// **What the control has to be.** Not a cap — a cap is a number and every number
// could move for a reason. The control removes the *detail part* from the render,
// which is the mechanism: every box with a detail loses its rows, the residue
// disappears, and both the edge suite and the contract corpus go with it.
//
// **Anchors checked for uniqueness before the pass** (F219), and anchored on what
// changes plus the least context that makes it unique.
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const STATUS = "src/presentation/blocks/kinds/status.ts";

// The edge suite carries T3.96 and T3.97, the contract suite T2.150–T2.153, and
// the generic measurement corpus is in the same file as the property — so a
// clause that draws past its grant is caught where the invariant lives.
const FILES = "test/edge/status.test.ts test/contract/blocks.test.ts";

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
    file: STATUS,
    from: "    for (const row of detail) out.push(boxed(row, false));",
    to: "",
    why: "with the detail never drawn every box carrying one loses its rows, the residue goes with them, and both suites fail on the part and on the count",
  },
  mutations: [
    {
      // **Clause 1 alone.** Without the reservation the message takes the whole
      // interior and the detail draws nothing — the part vanishes with no mark,
      // which is F230's silent slice one part along from where it was closed.
      name: "a present detail reserves no row",
      file: STATUS,
      from: "    const reserved = wants > 0 && content > 1 ? 1 : 0; // cells-ok — a row count",
      to: "    const reserved = 0; // cells-ok — a row count",
      expect: "T3.96",
    },
    {
      // **Clause 3 alone.** The detail takes its cap rather than what the
      // message left, so a long message and a long detail together ask for more
      // rows than the box has — which `measure` cannot see, because `measure`
      // is the declared height.
      name: "the detail takes its cap rather than the rows the message left",
      file: STATUS,
      from: "    const forDetail = Math.min(wants, Math.max(0, content - body.length)); // cells-ok — a row count",
      to: "    const forDetail = wants; // cells-ok — a row count",
      expect: "T2.150",
    },
    {
      // The residue gone: a cut list that says nothing about being cut. The
      // silent slice again, and this time in the part whose whole contract is
      // that it truncates *and says so*.
      name: "a cut detail is sliced without its residue row",
      file: STATUS,
      from: "  if (lines.length <= forDetail) return lines.map(cut); // cells-ok — a row count, not a width",
      to: "  return lines.slice(0, forDetail).map(cut); // cells-ok — a row count, not a width",
      expect: "T2.151",
    },
    {
      // The residue on a list that fits — the confidently-wrong direction, which
      // `bodyOf` documents as worse than the silent cut. It sends a reader to
      // the sink for text already on screen.
      name: "a detail that fits carries a residue anyway",
      file: STATUS,
      from: "  if (lines.length <= forDetail) return lines.map(cut); // cells-ok — a row count, not a width",
      to: "  if (lines.length < forDetail) return lines.map(cut); // cells-ok — a row count, not a width",
      expect: "T2.151",
    },
    {
      // **`empty` keeps the banner.** One absence of the three, so the row that
      // catches it is the one asserting them separately — a frame with a banner
      // and no mark and no red still reads as deliberate.
      name: "an empty block draws the banner",
      file: STATUS,
      from: '    const tagRows = frame.tag && tagFit !== "none" && block.state !== "empty" ? 1 : 0;',
      to: '    const tagRows = frame.tag && tagFit !== "none" ? 1 : 0;',
      expect: "T2.153",
    },
    {
      // **`empty` keeps the error tone**, which is §047's sentence exactly: a
      // refusal is not an error and never red.
      name: "an empty block is painted in the error tone",
      file: STATUS,
      from: '    const failed = block.state !== "loading" && block.state !== "empty";',
      to: '    const failed = block.state !== "loading";',
      expect: "T2.153",
    },
    {
      // Centred on one axis. The vertical half is inherited, so this is the half
      // the state actually adds, and a frame centred vertically and ranged left
      // is the one a reader would accept without looking twice.
      name: "an empty block is centred on one axis only",
      file: STATUS,
      from: '      if (block.state !== "empty" || text === "") return text;',
      to: "      return text;",
      expect: "T2.153",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
