// C22 I114 — the label's ground is a hue the application names.
//
// **The first build's defect is the first mutation, restored.** `resolveHueBand`
// handed the ground back on the `colour` channel, and `withBackground` reads
// `surface.background` — so the ground was silently dropped and the ink arrived
// correct. The frame read as *the hue is not wired at all* when one channel of
// two was wrong, which is the reading a row asserting only "is it tinted" would
// have taken at face value. T1.71 asserts both channels in the one SGR run.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/frame-rule-label.test.ts";
const R = "src/presentation/theme/resolve.ts";
const P = "src/shell/paint.ts";

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
    file: P,
    // The hue ignored entirely: every label paints `bgElev`, which is the frame
    // before this landed. A run where this survives is not reading the band.
    from: "  const band = label.hue === undefined ? null : resolveHueBand(deps.theme, label.hue, deps.capabilities);",
    to: "  const band = null;",
    why: "with the band never resolved every hue paints the untinted ground; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT, restored.** The ground on the foreground channel, where
      // `withBackground` cannot see it.
      name: "THE DEFECT: the ground handed back on the `colour` channel, and silently dropped",
      file: R,
      from: '    ground: Object.freeze({ background: { kind: "ansi256", index: g } as const }),',
      to: '    ground: Object.freeze({ colour: { kind: "ansi256", index: g } as const }),',
      expect: "T1.71",
    },
    {
      // The ink taken from the hue rather than from the band — a hue drawn on
      // itself, which is `R-THM-005`'s failure exactly: an ink chosen by
      // whoever was nearest rather than by the band it lands on. It reads as a
      // tidy simplification, and at 4.62 : 1 worst the two are far apart.
      name: "the label's ink taken from the hue's own ink, not from its band",
      file: R,
      from: '    ink: styleOf({ kind: "ansi256", index: i }),',
      to: '    ink: styleOf({ kind: "ansi256", index: g }),',
      expect: "T1.71",
    },
    {
      // An unknown hue name falling out rather than back. The name arrives from
      // a config file where a person typed it, so the reachable wrong input is
      // a misspelling — and a label that vanishes is a worse answer to a typo
      // than one that is simply not tinted.
      name: "an unknown hue sheds the label rather than painting it untinted",
      file: P,
      from: "  const ink = band === null ? tone(\"default\", deps.theme, deps.capabilities, \"bgElev\") : band.ink;",
      to: "  if (label.hue !== undefined && band === null) return null;\n  const ink = band === null ? tone(\"default\", deps.theme, deps.capabilities, \"bgElev\") : band.ink;",
      expect: "T1.71",
    },
    // ---- C22 I147, §6r: the unpainted rung (review batch 4, M13.6) --------
    {
      // T6.148 — the clause I147 amended, restored.
      name: "the label shed at 1-bit, as it was",
      file: P,
      from: "  const unpainted = deps.capabilities.colourDepth === 1;\n",
      to: "  if (deps.capabilities.colourDepth === 1) return null;\n  const unpainted = false;\n",
      expect: "T1.178",
    },
    {
      // T6.148 — the plan's form: two cells more, so the boundary moves to 95.
      name: "the unpainted rung padded as `[ name ]`",
      file: P,
      from: "unpainted ? `[${label.text}]` :",
      to: "unpainted ? `[ ${label.text} ]` :",
      expect: "T1.178",
    },
    {
      name: "the name drawn as plain text in the rule's voice at 1-bit",
      file: P,
      from: "unpainted ? `[${label.text}]` :",
      to: "false ? `[${label.text}]` :",
      expect: "T1.178",
    },
    {
      // The first build's defect: `muted` at 1-bit is dim, and the bare rule
      // there is plain text. A colour-only check passed it.
      name: "the dashes styled `muted` at 1-bit",
      file: P,
      from: "  if (unpainted) return [{ text: lead + \" \".repeat(pad) }, { text }, { text: glyph }];",
      to: "  if (unpainted) return [{ text: lead + \" \".repeat(pad), style: muted }, { text }, { text: glyph, style: muted }];",
      expect: "T1.178",
    },
    {
      name: "the unpainted rung taken at 4 bits too",
      file: P,
      from: "  const unpainted = deps.capabilities.colourDepth === 1;",
      to: "  const unpainted = deps.capabilities.colourDepth <= 4;",
      expect: "T1.178",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
