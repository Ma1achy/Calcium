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
const FILES = "test/unit/trust-boundary.test.ts";

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
    // **A change the run's own corpus can see** (F1254): with the filter a
    // no-op, every kind in the sweep leaks and the fabricated-violation row is
    // untouched. If this survives, nothing below reaches the boundary at all
    // and every kill is unearned.
    file: DATA_TEXT,
    from: "export function stripControl(text: string): string {",
    to: "export function stripControl(text: string): string {\n  if (text.length >= 0) return text;",
    why:
      "the filter returns its input, so every kind in the registry sweep leaks — "
      + "if this survives, the sweep is not reading the frames it thinks it is",
  },
  mutations: [
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
    {
      // **The filter keeps the ESC byte**, which is the single most plausible
      // loosening: ESC is what carries a terminal's own colour, so letting it
      // through reads as *preserving the child's styling* and is exactly the
      // thing `runs` exists to do properly.
      name: "the filter lets the ESC byte through, to preserve a child's colour",
      file: DATA_TEXT,
      from: "  if (cp === 0x09 || cp === 0x0a) return false; // tab, newline",
      to: "  if (cp === 0x09 || cp === 0x0a || cp === 0x1b) return false; // tab, newline, escape",
      expect: "T2.156",
    },
    {
      // **The C1 range dropped from the filter.** `0x9b` is a single-byte CSI
      // introducer, so a payload written in C1 form passes a filter that only
      // knows C0 — and nothing in the frame looks different until something
      // interprets it.
      name: "the filter covers C0 only, so a C1 introducer passes",
      file: DATA_TEXT,
      from: "  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);",
      to: "  return cp < 0x20;",
      expect: "T2.156",
    },
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
      from: "  if (typeof value === \"string\") return value + PAYLOAD;",
      to: "  if (typeof value === \"string\") return value;",
      expect: "T2.156"
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
