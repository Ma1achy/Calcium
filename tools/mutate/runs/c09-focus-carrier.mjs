// C09 I121 — a focusable shape with no focus mark inverts where the focus
// ground cannot carry, through one function. Mutated (C09 T6.139–T6.140).
//
// **Each site mutation is the bare ground, not `focusStyle` by name.** The
// sites no longer import `focusStyle`, so naming it would fail every row on a
// ReferenceError — caught, and for a reason that says nothing about focus.
// `BARE` is `focusShapeStyle` with its inverse rung removed, which is exactly
// what a site reading `focusStyle` again would draw.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/focus-carrier.test.ts";
const PAINT = "src/presentation/blocks/paint.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const CONTROLS = "src/presentation/blocks/kinds/controls.ts";
const TAPE = "src/presentation/blocks/kinds/tape.ts";
const BARE = "(focusShapeStyle(ctx.theme, ctx.capabilities).inverse === true ? {} : focusShapeStyle(ctx.theme, ctx.capabilities))";
const BARE_FN = "((t, c) => (focusShapeStyle(t, c).inverse === true ? {} : focusShapeStyle(t, c)))";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: PAINT,
    from: "  return ground.background === undefined ? { inverse: true } : ground;",
    to: "  return { ...ground, inverse: true };",
    why: "inversion at every depth — T2.185 reads SGR 7 in a 24-bit focused frame",
  },
  mutations: [
    {
      name: "NO-RUNG: focusShapeStyle answers the bare ground (T6.139)",
      file: PAINT,
      from: "  return ground.background === undefined ? { inverse: true } : ground;",
      to: "  return ground;",
      expect: "T2.183",
    },
    {
      name: "NOTICE-BARE: the notice reads the bare ground (T6.140)",
      file: SIMPLE,
      from: '"focusGround"), ...focusShapeStyle(ctx.theme, ctx.capabilities) }\n      : tone(block.tone',
      to: `"focusGround"), ...${BARE} }\n      : tone(block.tone`,
      expect: "T2.183",
    },
    {
      name: "PILLS-BARE: the pills head reads the bare ground (T6.140)",
      file: SIMPLE,
      from: "              ...(selected.has(id) ? selectionStyle : focusShapeStyle)(ctx.theme, ctx.capabilities),",
      to: `              ...(selected.has(id) ? selectionStyle : ${BARE_FN})(ctx.theme, ctx.capabilities),`,
      expect: "T2.183",
    },
    {
      name: "CHOICE-BARE: a choice option reads the bare ground (T6.140)",
      file: CONTROLS,
      from: '        ? { ...tone("default", ctx.theme, ctx.capabilities, "focusGround"), ...focusShapeStyle(ctx.theme, ctx.capabilities) }',
      to: `        ? { ...tone("default", ctx.theme, ctx.capabilities, "focusGround"), ...${BARE} }`,
      expect: "T2.183",
    },
    {
      name: "CONTROL-BARE: a control's wash reads the bare ground (T6.140)",
      file: CONTROLS,
      from: "      ? spans.map((s) => ({ ...s, style: { ...s.style, ...focusShapeStyle(ctx.theme, ctx.capabilities) } }))",
      to: `      ? spans.map((s) => ({ ...s, style: { ...s.style, ...${BARE} } }))`,
      expect: "T2.183",
    },
    {
      name: "TAPE-BARE: a tape member reads the bare ground (T6.140)",
      file: TAPE,
      from: "              ...(selected.has(id) ? selectionStyle : focusShapeStyle)(ctx.theme, ctx.capabilities),",
      to: `              ...(selected.has(id) ? selectionStyle : ${BARE_FN})(ctx.theme, ctx.capabilities),`,
      expect: "T2.183",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
