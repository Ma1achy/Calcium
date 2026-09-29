// C09 I126 — a nested child's width is the width it is drawn at (§7i, review
// batch 3 M8 item 4). Mutated at each joint (C09 T6.145–T6.149).
//
// **Two halves and each is mutated alone.** The library's half is a scroll's
// element rows and `childWidthsOf`'s three narrowing arms; the shell's half is
// every question a nested box is asked — its ceiling, its page, its elements
// for the pull and the wheel, a tape's start — put back at the region's width,
// which is what the tree did before. Each shell mutation is the old line, so a
// survivor would say the row does not reach the site it names.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";
const CONSTRUCT = "src/shell/construct.ts";

const FILES = "test/contract/nested-widths.test.ts test/integration/nested-widths.test.ts";

const REGION = "deps.frame.overlayRegion().width";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  // **Not the bar's own width, which was the first draft and survived.** A bar
  // two columns wide moves the renderer and `childWidthsOf` together, because
  // both read `barOf` — which is I126 holding, and C09 I115's rows are where
  // the bar's width is watched. A control must be a change this corpus can see.
  control: {
    file: REGISTRY,
    from: "      if (!hasChildren(block)) return [];\n      const w = contentWidth(block, normaliseWidth(width));\n",
    to: "      if (hasChildren(block)) return [];\n      const w = contentWidth(block, normaliseWidth(width));\n",
    why: "no container answers a child's width — blockWidthInEntry finds no nested block, and every T1.88 arrangement fails",
  },
  mutations: [
    {
      name: "a scroll's elements laid out at the box's width, not the bar's (C09 T6.145)",
      file: CONTAINERS,
      from: "      childRanges(block, laidAt, measureChild).map((r) =>",
      to: "      childRanges(block, w, measureChild).map((r) =>",
      expect: "T1.87",
    },
    {
      name: "a scroll's elements at the box's width — the click behind the bar (C09 T6.145)",
      file: CONTAINERS,
      from: "      childRanges(block, laidAt, measureChild).map((r) =>",
      to: "      childRanges(block, w, measureChild).map((r) =>",
      expect: "T4.60",
    },
    {
      name: "childWidthsOf's scroll arm answering C04's division (C09 T6.146)",
      file: REGISTRY,
      from: "          const at = barOf(block, w, this.#measureChild).contentWidth;\n",
      to: "          const at = share(0);\n",
      expect: "T1.88",
    },
    {
      name: "childWidthsOf's split arm answering the panes before their bar (C09 T6.147)",
      file: REGISTRY,
      from: "          return block.children.map((_c, i) => panes.find((p) => p.side === i)?.width ?? share(i));\n",
      to: "          return block.children.map((_c, i) => share(i) + 0 * panes.length);\n",
      expect: "T1.88",
    },
    {
      name: "childWidthsOf's group arm answering the share, not the aligned cell (C09 T6.147)",
      file: REGISTRY,
      from: "          return block.children.map((_c, i) => placements[i]?.width ?? share(i));\n",
      to: "          return block.children.map((_c, i) => share(i) + 0 * placements.length);\n",
      expect: "T1.88",
    },
    {
      name: "the shell's scroll box summing the children at the region's width — the wheel (C09 T6.148)",
      file: CONSTRUCT,
      from: "    const { content } = barOf(block, at.inner, built.blocks.measure);\n",
      to: `    const content = block.children.reduce((n, c) => n + built.blocks.measure(c, ${REGION}), 0);\n`,
      expect: "T4.60",
    },
    {
      name: "the shell's scroll box summing the children at the region's width — the page (C09 T6.148)",
      file: CONSTRUCT,
      from: "    const { content } = barOf(block, at.inner, built.blocks.measure);\n",
      to: `    const content = block.children.reduce((n, c) => n + built.blocks.measure(c, ${REGION}), 0);\n`,
      expect: "T4.61",
    },
    {
      name: "the pull re-asking the box's elements at the region's width (C09 T6.149)",
      file: CONSTRUCT,
      from: "    const local = built.blocks.elementsOf(box, drawn.outer).find(",
      to: `    const local = built.blocks.elementsOf(box, ${REGION}).find(`,
      expect: "T4.61",
    },
    {
      name: "the wheel asking the inner box's elements at the region's width (C09 T6.149)",
      file: CONSTRUCT,
      from: "      const els = built.blocks.elementsOf(child, drawn.outer);\n",
      to: `      const els = built.blocks.elementsOf(child, ${REGION});\n`,
      expect: "T4.62",
    },
    {
      name: "the tape's start taken at the region's width (C09 T6.149)",
      file: CONSTRUCT,
      from: "        const next = tapeStart(block, at.inner, detection.capabilities, held, focusedMemberOf(entry.id, block.id));\n",
      to: `        const next = tapeStart(block, ${REGION}, detection.capabilities, held, focusedMemberOf(entry.id, block.id));\n`,
      expect: "T4.63",
    },
    {
      name: "the page's height measured at the region's width (C09 I126)",
      file: CONSTRUCT,
      from: "    const height = built.blocks.measure(block, drawn.outer);\n",
      to: `    const height = built.blocks.measure(block, ${REGION});\n`,
      expect: "T4.61",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
