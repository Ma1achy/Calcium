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
// **C23's half moved out of the patch view in M9b** (C25 §3b, R-EXA-082). The
// view is deleted and `expand` took the `view` kind's subject, so the walk the
// rule is about is `actions.ts`' `reachable` — the same two directions over the
// same entry, read by T3.83. The mutations moved; the rule did not.
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
  "npx vitest run test/edge/view-model.test.ts test/integration/scroll-wiring.test.ts";
const CONSTRUCT = "src/shell/construct.ts";
const ACTIONS = "src/shell/actions.ts";

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
    // Re-anchored 2026-09-05 when the caller began passing the box (C04 I97,
    // F770); the mutation is the same inversion and was run rather than trusted.
    from: "    stores.scrollOffsets.nudge(entryId, block.id, direction * Math.max(1, height - 1), scrollBox(block));",
    to: "    stores.scrollOffsets.nudge(entryId, block.id, -direction * Math.max(1, height - 1), scrollBox(block));",
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
      // **C23's half, shallower.** The message it produces is *false* rather
      // than absent — `nothing to expand — no row or folded block` about a row
      // that is in the entry — which is what makes this worse than a no-op.
      name: "the action's target is resolved with a top-level find",
      file: ACTIONS,
      from: "          ...entry.doc.blocks.flatMap((b) => [...descendants(b)]),\n",
      to: "",
      expect: "T3.83",
    },
    {
      // **The other direction, and it took two goes to make it observable** —
      // which is the finding rather than a detail of the run (F1252). Widening
      // the *search* alone survives: the write names `from`, so a row found in
      // another entry is still patched into this one and the frame is right by
      // accident of where the patch is addressed. **C04 I34's *never wider* is
      // enforced by the write, not by the search**, and a mutation that only
      // widens the search is asserting about a line that cannot be wrong.
      //
      // So this widens both, which is the defect the invariant actually forbids:
      // the entry the block was found in becomes the entry patched.
      name: "the action's target is resolved against the whole transcript, and patched there",
      file: ACTIONS,
      from:
        "        const reachable: readonly Block[] = [\n" +
        "          ...entry.doc.blocks,\n" +
        "          ...entry.doc.blocks.flatMap((b) => [...descendants(b)]),\n" +
        "        ];\n\n" +
        "        for (const b of reachable) {\n" +
        "          if (b.kind !== \"table\") continue;\n" +
        "          const row = b.rows.find((r) => r.id === action.target);\n" +
        "          if (row === undefined) continue;\n\n" +
        "          const outcome = deps.transcript.patch(\n" +
        "            from,\n",
      to:
        "        const every = deps.transcript.entries.flatMap((e) =>\n" +
        "          [...e.doc.blocks, ...e.doc.blocks.flatMap((c) => [...descendants(c)])].map(\n" +
        "            (c) => [e.id, c] as const,\n" +
        "          ),\n" +
        "        );\n\n" +
        "        for (const [owner, b] of every) {\n" +
        "          if (b.kind !== \"table\") continue;\n" +
        "          const row = b.rows.find((r) => r.id === action.target);\n" +
        "          if (row === undefined) continue;\n\n" +
        "          const outcome = deps.transcript.patch(\n" +
        "            owner,\n",
      expect: "T3.83",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
