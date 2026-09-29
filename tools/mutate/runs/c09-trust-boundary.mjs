// C09 I89, §7d — the trust boundary, over the registry rather than the call sites.
//
// **The subject is a scope, so the mutations attack reach rather than the
// filter.** `stripControl` is correct and was never in doubt; what was never
// established is whether every kind reaches it, and a rule phrased over the
// nineteen modules that call it cannot answer that.
//
// **And one kind is exempt, so the exemption is a subject here too.**
// `terminal` emits its text unstripped (I56) because a child's colour crosses
// as `runs`; the exemption is paid for by `C04 I110`'s gate. The sweep reported
// that kind as leaking on its first run and the sweep was what was wrong — it
// builds blocks directly and never passes the boundary. A skipped kind and a
// gated kind read identically in a green run, so the mutations break the gate
// and require the skip to notice.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DATA_TEXT = "src/data/text.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const FILES =
  "test/unit/trust-boundary.test.ts test/revert/trust-boundary.test.ts test/integration/trust-writer.test.ts";

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
    // **A change the run's own corpus can see** (F1254): with the neutraliser
    // a no-op, every kind in the sweep leaks and the fabricated-violation row
    // is untouched. If this survives, nothing below reaches the boundary at all
    // and every kill is unearned.
    //
    // **Retargeted on review batch 4 (ruling 71).** The control was
    // `stripControl` returning its input; the registry now neutralises every
    // field at `#resolve` before any definition's own `stripControl` sees it,
    // so a no-op filter there changes nothing a frame shows.
    file: DATA_TEXT,
    from: "export function neutraliseControl(text: string): string {",
    to: "export function neutraliseControl(text: string): string {\n  if (text.length >= 0) return text;",
    why:
      "the neutraliser returns its input, so every kind in the registry sweep leaks — "
      + "if this survives, the sweep is not reading the frames it thinks it is",
  },
  mutations: [
    {
      // **The registry hands the definition the raw block** (C09 §7d, T6.150):
      // the class that leaked `patch`'s path, hunk header and line text.
      name: "#resolve hands a registered kind the block un-neutralised",
      file: "src/presentation/blocks/registry.ts",
      from: "    if (held !== undefined) return { definition: held, block: neutralBlock(block) };",
      to: "    if (held !== undefined) return { definition: held, block };",
      expect: "T2.195",
    },
    {
      // **The isolates dropped from the bidi arm** (T6.151): added to Unicode
      // after the embeddings, so a range written from memory reads complete.
      name: "the bidi arm loses U+2066–U+2069",
      file: DATA_TEXT,
      from: "(cp >= 0x2066 && cp <= 0x2069)",
      to: "(cp >= 0x2066 && cp <= 0x2065)",
      expect: "T1.89",
    },
    {
      // **The neutraliser keeps ESC**, the plausible loosening one layer up
      // from the filter's own: ESC carries a child's colour.
      name: "the neutraliser shows ESC as itself",
      file: DATA_TEXT,
      from: "  if (unit === 0x09 || unit === 0x0a) return null; // tab, newline",
      to: "  if (unit === 0x09 || unit === 0x0a || unit === 0x1b) return null; // tab, newline",
      expect: "T2.156",
    },
    {
      // **C1 passes the neutraliser**: `0x9b` is a single-byte CSI introducer.
      name: "the neutraliser covers C0 only, so a C1 introducer passes",
      file: DATA_TEXT,
      from: "  if (unit >= 0x80 && unit <= 0x9f) return ",
      to: "  if (false) return ",
      expect: "T2.156",
    },
    {
      // **A span left on the old offsets** (C04 I83): the text grew, so the
      // span colours the wrong characters.
      name: "a span is not re-based onto the neutralised text",
      file: "src/presentation/blocks/neutral.ts",
      from: '    out["spans"] = rebased(spans, raw);',
      to: '    out["spans"] = spans;',
      expect: "T1.89",
    },
    {
      // **The sweep back on a bare registry** (T6.152): `table`, `plot` and
      // `patch` fall to `raw`, and the three-site leak is invisible again.
      name: "the sweep runs on a bare registry",
      file: "test/unit/trust-boundary.test.ts",
      from: "  production = (await buildGraph()).graph.blocks;",
      to: "  production = measurable().registry;",
      expect: "T2.194",
    },
    {
      // **A thrown message drawn raw** — the error box is a block the registry
      // builds itself, from text a definition's exception carried.
      name: "the error status carries the thrown message un-neutralised",
      file: "src/presentation/blocks/registry.ts",
      from: "message: neutraliseControl(text), height }",
      to: "message: text, height }",
      // **First written against T4.107, and it survived**: that row's error is
      // a handler's, which C23 draws. No row made a definition throw, so T2.195
      // gained the clause.
      expect: "T2.195",
    },
    {
      // **THE DEFECT: the exemption stops being paid for.** With the gate's
      // control check gone, `C04 I110` accepts a `TerminalLine.text` carrying
      // an escape — and every row in the sweep stays green, because the sweep
      // skips that kind. This is the mutation the second half of I89 exists
      // for: an exemption asserted by being skipped is asserted by nothing.
      name: "THE DEFECT: the exempt kind's gate stops refusing controls",
      file: VALIDATE,
      from: "    if (unit < 0x20 || (unit >= 0x7f && unit <= 0x9f)) {",
      to: "    if (false) {",
      expect: "T2.156d",
    },
    {
      // **The gate narrowed to C0**, which is the same loosening the filter's
      // own mutation makes one layer up and is the plausible one: `0x9b` is a
      // single-byte CSI introducer, and a range written as *the control
      // characters* reads complete while covering half of them.
      name: "the gate covers C0 only, so a C1 introducer is accepted",
      file: VALIDATE,
      from: "    if (unit < 0x20 || (unit >= 0x7f && unit <= 0x9f)) {",
      to: "    if (unit < 0x20) {",
      expect: "T2.156d",
    },
    // **Two mutations were written and removed, and both were about a fix that
    // should not have been made.** The sweep reported `terminal` leaking; a
    // strip was added at the span seam in `spansOf` and reverted once the gate
    // was measured. The mutations aimed at it went with it. What caught the
    // mistake was `T3.73` — a row asserting `terminal.ts` contains no call to
    // `stripControl`, watching a claim that really was written down.
    // **Two mutations removed on review batch 4, and they indict their subject.**
    // `stripControl` letting ESC through, and covering C0 only, both survived:
    // `#resolve` now neutralises every field before a definition's own
    // `stripControl` sees it, so the filter receives no control from a field
    // and no row can see it change. The neutraliser's own two mutations above
    // replace them. Whether the definitions' remaining `stripControl` calls are
    // still load-bearing anywhere is a question for C07's ingress follow-up.
    {
      // **The corpus stops carrying the payload**, which is the state the
      // session probe was in on its first run: every frame clean, and the sweep
      // reporting *no control bytes* about text that was never there.
      //
      // **Aimed at the corpus rather than at the control, because a control
      // cannot die by being deleted.** The first version of this mutation
      // removed the residue count and survived, correctly: with the tree
      // right, an unconditional count and a measured one agree. What the
      // control is for is the corpus going wrong, so that is what is broken.
      name: "the sweep's corpus stops carrying the payload",
      file: "test/unit/trust-boundary.test.ts",
      // Re-anchored on review batch 4: the corpus is built by `poisonWith`, so
      // one suffix serves the control payload and the bidi one.
      from: "const poison = poisonWith(PAYLOAD);",
      to: "const poison = poisonWith(\"\");",
      expect: "T2.156"
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
