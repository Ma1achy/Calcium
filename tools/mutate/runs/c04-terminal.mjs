// C04 I110–I113 — the `terminal` kind's gate, mutated.
//
// **The second of two gates, and the reason it exists is the reason these
// mutations are not hypothetical.** C27 I2 replaces control characters at the
// cell walk, so a terminal this framework built cannot carry one — which makes
// every rule here look redundant from inside. A `terminal` arrives from a far
// side that never ran C27, and a terminal line is emitted *without stripping*:
// an escape that reaches the block leaves it and colours the rest of the
// session's screen. Every mutation below is a rule someone would delete on the
// strength of the emulator already doing the job.
//
// The cursor pair is the other shape: `measure` reading an input that moves on
// every keystroke. It is not a wrong height — it is a frame that reflows while
// the user types, which reads as a rendering bug three components away.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/emulator.test.ts test/contract/emulator.test.ts test/edge/emulator.test.ts test/integration/emulator.test.ts test/revert/emulator.test.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const KIND = "src/presentation/blocks/kinds/terminal.ts";

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
  control: {
    file: KIND,
    from: "    atLeastOne(block.lines.length + (block.dropped === undefined ? 0 : 1)), // cells-ok",
    to: "    atLeastOne(0), // cells-ok",
    why: "every terminal one row tall fails the height rows; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // The rule that reads as C27's job. It is not: this gate is the one that
      // holds for a document the emulator never touched.
      name: "the control check is dropped — C27 I2 already replaces them",
      file: VALIDATE,
      from: "    if (unit < 0x20 || (unit >= 0x7f && unit <= 0x9f)) {",
      to: "    if (false) {",
      expect: "T1.31",
    },
    {
      // A lone surrogate survives a JSON round trip, so a far side that sliced
      // its buffer by code unit sends one and every measurer disagrees.
      name: "the unpaired-surrogate check is dropped",
      file: VALIDATE,
      from: "    if (unit >= 0xd800 && unit <= 0xdbff) {",
      to: "    if (false) {",
      expect: "T3.79",
    },
    {
      // Reads as tidying. Costs diff stability: an unchanged screen snapshotted
      // twice compares unequal, so every frame redraws.
      name: "adjacent equal-styled runs are admitted",
      file: VALIDATE,
      from: "    if (previous !== null && from === previousEnd && sameRunStyle(previous, run)) {",
      to: "    if (false) {",
      expect: "T1.32",
    },
    {
      // `dropped < 0` is the natural bound for a count and the wrong one for a
      // field declared by presence: zero draws *0 lines dropped at the cap*.
      name: "`dropped: 0` is admitted",
      file: VALIDATE,
      from: '      if (typeof dropped !== "number" || !Number.isInteger(dropped) || dropped < 1) {',
      to: '      if (typeof dropped !== "number" || !Number.isInteger(dropped) || dropped < 0) {',
      expect: "T1.33",
    },
    {
      // **The one that is not a validator rule.** A cursor is appearance, and a
      // height that moved with it reflows the frame on every keystroke.
      name: "`measure` reads the cursor",
      file: KIND,
      from: "    atLeastOne(block.lines.length + (block.dropped === undefined ? 0 : 1)), // cells-ok",
      to: "    atLeastOne(block.lines.length + (block.dropped === undefined ? 0 : 1) + (block.cursor === undefined ? 0 : 1)), // cells-ok",
      expect: "T3.78",
    },
    {
      // **The ladder skipped.** The block names a colour and C10 resolves it —
      // passing the run's own colour straight through is correct at 24-bit and
      // emits a truecolour SGR into a sixteen-colour terminal at every rung
      // below, where it is either ignored or drawn as something else entirely.
      name: "the run's colour bypasses the ladder",
      file: KIND,
      from: "  const fg = run.fg === undefined ? undefined : degradeColour(run.fg, ctx.capabilities);",
      to: "  const fg = run.fg;",
      expect: "T4.2",
    },
    {
      // C09 I56 — the cursor is the one thing drawn `inverse` at *every* arm,
      // because at 1-bit it is the only channel left to say where it is.
      // Re-anchored when the cursor went by cluster (C09 I64, F970): the cell
      // past the text is the `out.push` and the cell on a cluster is the
      // `marked.push`, and both are unmarked here — T4.1's cursor sits past an
      // empty line, so a mutation of the cluster branch alone would survive it.
      name: "the cursor is not marked at 1-bit",
      file: KIND,
      from: '    out.push({ text: " ", style: { inverse: true } });',
      to: '    out.push({ text: " ", style: {} });',
      also: [
        {
          file: KIND,
          from: "    marked.push({ text: within, style: { ...(span.style ?? {}), inverse: true } });",
          to: "    marked.push({ text: within, style: { ...(span.style ?? {}) } });",
        },
      ],
      expect: "T4.1",
    },
    {
      // The off-by-one a bounds check invites: a caret one cell beyond the
      // painted width, which every position but the last agrees with.
      name: "the cursor's column bound admits `col === cols`",
      file: VALIDATE,
      from: '(typeof cols === "number" && col >= cols)',
      to: '(typeof cols === "number" && col > cols)',
      expect: "T3.78",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
