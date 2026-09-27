// C04 I141, C09 I45, C23 I81 — a call's state names its tone and its mark, and
// one reader answers what the state is. Mutated (review batch 2, M4 items 1–3).
//
// **Each mutation restores one of the shapes that shipped**: the constant
// `info`, the constant `●`, the second classifier, the outcome-read
// settledness, the unsettled spinner. The rows were written against each, and
// a survivor here is a reader the file does not ask.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/call-state.test.ts";
const TYPES = "src/data/viewmodel/types.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const CONSTRUCT = "src/data/viewmodel/construct.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const DOCUMENTS = "src/shell/documents.ts";
const BUILDERS = "src/shell/builders/index.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: TYPES,
    from: '  failed: "error",\n  cancelled: "muted",\n});',
    to: '  failed: "warn",\n  cancelled: "muted",\n});',
    why: "a failed head in warn — T1.76 reads the head's tone against the state's",
  },
  mutations: [
    {
      name: "the constant `info` callHead shipped",
      file: DOCUMENTS,
      from: "    tone: CALL_STATE_TONE[state],",
      to: '    tone: "info" as const,',
      expect: "T1.76",
    },
    {
      name: "the toned rung's mark constant `running`, as shipped (F1261)",
      file: GLYPHS,
      from: "  return toneCarries(caps, onBand) ? CALL_HEAD_GLYPH[state] : CALL_STATE_GLYPH[state];",
      to: '  return toneCarries(caps, onBand) ? "running" : CALL_STATE_GLYPH[state];',
      expect: "T2.187",
    },
    {
      name: "`exit N` unclassified — callState's half of the second classifier",
      file: DOCUMENTS,
      from: '  if (/^exit [1-9]/u.test(outcome)) return "failed";',
      to: "",
      expect: "T1.76",
    },
    {
      name: "the rollup reading the outcome and not the stated state",
      file: DOCUMENTS,
      from: "    const state = callState(child);\n    const said",
      to: "    const state = callState({ ...child, state: undefined });\n    const said",
      expect: "T1.76",
    },
    {
      name: "settledness read from the outcome beside the state",
      file: DOCUMENTS,
      from: '  return state !== "queued" && state !== "running";',
      to: '  return state !== "running" && (call.settled === true || (call.outcome !== undefined && call.outcome !== ""));',
      expect: "T1.76",
    },
    {
      name: "the spinner on every unsettled head, queued included (F1261)",
      file: DOCUMENTS,
      from: '  } else if (callState(call) === "running") {',
      to: '  } else if (callState(call) === "running" || callState(call) === "queued") {',
      expect: "T1.76",
    },
    {
      name: "the validator admitting any state",
      file: VALIDATE,
      from: "      if (!CALL_STATES.includes(state as never)) {",
      to: '      if (state === "\\u0000") {',
      expect: "T2.136",
    },
    {
      name: "the validator not asking the tone",
      file: VALIDATE,
      from: "        if (b[\"tone\"] !== CALL_STATE_TONE[st]) {",
      to: "        if (b[\"tone\"] === undefined) {",
      expect: "T2.136",
    },
    {
      name: "construction not asking the tone",
      file: CONSTRUCT,
      from: "  if (notice.tone !== CALL_STATE_TONE[state]) {",
      to: "  if (notice.tone === undefined) {",
      expect: "T2.137",
    },
    {
      name: "construction not asking the glyph",
      file: CONSTRUCT,
      from: "  if (notice.glyph !== CALL_HEAD_GLYPH[state]) {",
      to: "  if (notice.glyph === undefined) {",
      expect: "T2.137",
    },
    {
      name: "the builder picking the tone's glyph over the state's",
      file: BUILDERS,
      from: "opts?.state !== undefined && glyph === undefined ? CALL_HEAD_GLYPH[opts.state] : glyphFor(tone, glyph);",
      to: "glyphFor(tone, glyph);",
      expect: "T2.137",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
