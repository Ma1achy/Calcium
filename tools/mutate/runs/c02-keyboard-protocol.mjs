// C02 I12 — the keyboard protocol as the tenth capability, and the ladder that
// keeps it optional. Written with anchors and **not yet run**: the lane that
// landed it was told not to run the harness. Run it before re-anchoring anything
// here (CLAUDE.md § mutation runs rot unwatched).
//
// **The row this run exists for is `GATE-PER-READER`**, the same shape as
// `c02-tmux-gate.mjs`'s: a tenth column that forgot the identification's gate
// answers correctly outside tmux and wrongly inside it, and every row naming the
// column alone passes.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/capabilities.test.ts test/unit/lifecycle.test.ts " +
  "test/unit/router-decode.test.ts";
const CAPS = "src/terminal/capabilities.ts";
const LIFECYCLE = "src/terminal/lifecycle.ts";
const ESCAPES = "src/terminal/escapes.ts";
const DECODE = "src/interaction/router/decode.ts";

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
    file: CAPS,
    from: '  wezterm: "kitty",\n  foot: "kitty",',
    to: '  wezterm: "none",\n  foot: "kitty",',
    why: "WezTerm's protocol arm is asserted directly in T1.13; a run where flipping it survives cannot see a kill",
  },
  mutations: [
    {
      name: "GATE-PER-READER: the tenth column reads the ungated identification",
      file: CAPS,
      from: '    keyboardProtocol: terminal === null ? "none" : KEYBOARD_PROTOCOL[terminal],',
      to: '    keyboardProtocol: identified === null ? "none" : KEYBOARD_PROTOCOL[identified],',
      expect: "T1.13",
    },
    {
      name: "RESET-NOT-POP: the leave is `CSI = 0 u`, which overwrites the terminal's prior flags",
      file: ESCAPES,
      from: 'export const KITTY_KEYBOARD = mode("\\x1b[>3u", "\\x1b[<u");',
      to: 'export const KITTY_KEYBOARD = mode("\\x1b[>3u", "\\x1b[=0u");',
      expect: "T1.28",
    },
    {
      name: "UNCONDITIONAL-PUSH: the protocol is pushed whatever the record says (C01 I10)",
      file: LIFECYCLE,
      from: '      if (capabilities.keyboardProtocol === "kitty") take("keyboardProtocol"); // I10, C02 I12',
      to: '      take("keyboardProtocol"); // I10, C02 I12',
      expect: "T1.28",
    },
    {
      name: "PUSHED-BEFORE-MOUSE: step 7 taken before step 6, so it is not released first",
      file: LIFECYCLE,
      from:
        '      if (capabilities.mouse) take("mouse"); // I10\n' +
        '      if (capabilities.keyboardProtocol === "kitty") take("keyboardProtocol"); // I10, C02 I12',
      to:
        '      if (capabilities.keyboardProtocol === "kitty") take("keyboardProtocol"); // I10, C02 I12\n' +
        '      if (capabilities.mouse) take("mouse"); // I10',
      expect: "T1.1",
    },
    {
      name: "EVENT-DROPPED: the sub-parameter is read whole again, so `2:3` is NaN and every modifier is lost on release",
      file: DECODE,
      from: '      const [modParam, eventParam] = (params[1] ?? "").split(":");',
      to: '      const [modParam, eventParam] = [params[1], undefined];',
      expect: "T1.3p",
    },
    {
      name: "SUPER-AS-META: bit 8 folded into meta in the kitty arm, so ⌘a is Alt-a",
      file: DECODE,
      from: "    meta: (bits & 2) === 2 || (bits & 32) === 32,",
      to: "    meta: (bits & 2) === 2 || (bits & 8) === 8 || (bits & 32) === 32,",
      expect: "T1.3q",
    },
    {
      name: "MODIFIER-KEYS-AS-TEXT: a lone shift arrives as U+E061",
      file: DECODE,
      from: "      const name = KITTY_MODIFIER_KEYS[code] ?? otherKeyName(codeParam);",
      to: "      const name = otherKeyName(codeParam);",
      expect: "T1.3r",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
