// C22 I75 · C23 I31 — a block id resolved inside an entry, and how deep the
// resolution goes.
//
// **One question in two components, which is why this run spans them.** C22's
// effects resolve *the block focus is inside*; C23's patch view resolves *the
// block an action names*. Both are `find a block by id within one entry`, both
// were written as `entry.doc.blocks.find(...)`, and `elementsIn` and `b.live`
// between them make the nested arrangement the ordinary one rather than an
// exotic document.
//
// **The two directions are both reverts and only one of them is a
// generalisation.** T6.21 already refuses *wider* — resolving against the whole
// transcript, which lets one entry's action draw another's data. T6.73 refuses
// *shallower*, and the sentence I31 used to carry — *the entry's blocks* — is
// satisfied by both. This run holds one mutation for each.
//
// **The control is the third row and it is not a resolution at all.** A run
// whose every mutation is *stop recursing* cannot tell a suite that sees the
// nesting from one that sees nothing: `pageBlock`'s direction is what T4.41
// asserts, and inverting it must fail or the frame rows here are inert.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/patch-view.test.ts test/integration/scroll-wiring.test.ts";
const CONSTRUCT = "src/shell/construct.ts";
const PATCHVIEW = "src/shell/patch-view.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: CONSTRUCT,
    from: "    stores.scrollOffsets.nudge(entryId, block.id, direction * Math.max(1, height - 1));",
    to: "    stores.scrollOffsets.nudge(entryId, block.id, -direction * Math.max(1, height - 1));",
    why: "T4.41 asserts paging moves the window and coming back returns it; a run where inverting the direction survives cannot see a frame",
  },
  mutations: [
    {
      // **C22's half, and the row is the shipped effect rather than the camera.**
      // `c22-camera` holds the same mutation against T4.17n, which is code
      // written this arc; this one is `pageBlock`, which has been in the tree
      // since C26 landed.
      name: "the focused block is resolved with a top-level find",
      file: CONSTRUCT,
      from:
        "      for (const child of descendants(top)) if (child.id === wanted) return { entryId, block: child };",
      to: "",
      expect: "T4.59",
    },
    {
      // **C23's half, at the open.** The refusal it produces is *false* rather
      // than absent — `no block \`p1\` in this entry` about a block that is in
      // the entry — which is what makes this worse than a silent no-op.
      name: "the view's target is resolved with a top-level find",
      file: PATCHVIEW,
      from: "      const found = blockIn(from, blockId);",
      to: "      const found = entry.doc.blocks.find((b: Block) => b.id === blockId) ?? null;",
      expect: "T3.60",
    },
    {
      // **C23's half, at the live re-read, and it is the one a partial fix
      // leaves behind.** `move` calls `live` on every motion, so the view opens
      // and then dismisses itself as `anchorEvicted` on the first keypress —
      // blaming an eviction that did not happen, which is the same false
      // sentence one layer along.
      name: "the live re-read is resolved with a top-level find",
      file: PATCHVIEW,
      from: "    const found = blockIn(at.entry, at.blockId);",
      to:
        "    const entry = deps.transcript.entries.find((e) => e.id === at.entry);\n" +
        "    const found = entry?.doc.blocks.find((b: Block) => b.id === at.blockId) ?? null;",
      expect: "T3.60",
    },
    {
      // **The other direction, and it is T6.21's.** Deeper and wider are not the
      // same generalisation: this one resolves against every entry, which is
      // what lets one entry's action fill the screen with another's data.
      name: "the view's target is resolved against the whole transcript",
      file: PATCHVIEW,
      from: "    const entry = deps.transcript.entries.find((e) => e.id === entryId);\n    if (entry === undefined) return null;\n    for (const top of entry.doc.blocks) {",
      to: "    for (const top of deps.transcript.entries.flatMap((e) => e.doc.blocks)) {",
      expect: "T3.20",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
