// A chord has one spelling per rung, and the owner line asks for it (C16 I58).
//
// **The ASCII rung is the subject**, and each mutation leaves the Unicode frame
// byte-identical — which is how the line's own table drifted three ways while
// every Unicode row stayed green.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-keymap.test.ts test/unit/session-paint.test.ts test/unit/chord-hint.test.ts";
const KEYMAP = "src/interaction/router/keymap.ts";
const CHROME = "src/shell/chrome.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // The parked arm back: the ASCII rung is the slot's shorthand, `s+enter`.
    name: "the ASCII rung spells the slot",
    file: KEYMAP,
    from: "  if (!unicode) return chordName(key);",
    to: "  if (!unicode) return keySlot(key);",
    expect: "T1.110",
  },
  {
    // A capital letter spelled with its shift as well: `M-S-C` for `⌥⇧C`,
    // which reads as a different chord — Emacs spells the shift in the case.
    name: "a capital letter also carries S-",
    file: KEYMAP,
    from: '(shifted && !letter ? "S-" : "")',
    to: '(shifted ? "S-" : "")',
    expect: "T1.110",
  },
  {
    // The list stopped at `Backspace` again: `C-home` beside `C-Left`.
    name: "the names past Backspace fall through",
    file: KEYMAP,
    from: '  home: "Home",\n',
    to: "",
    expect: "T1.110",
  },
  {
    // The line ignores the rung: Unicode chords on an ASCII terminal.
    name: "the owner line asks for the Unicode spelling at every rung",
    file: CHROME,
    from: '  const unicode = caps.unicode !== "ascii";\n  if (!unicode) return',
    to: '  const unicode = true;\n  if (!unicode) return',
    expect: "T1.111",
  },
  {
    // One pair rule for the line: `/` between two keys at Unicode as well.
    name: "a pair joins with / at Unicode",
    file: CHROME,
    from: "  return `${sharedModifiers(keys)} ${does}`;",
    to: '  return `${keys.map((k) => chordText(k)).join("/")} ${does}`;',
    // T1.111's pair loop reads `↑/↓` as an unknown head and skips it, so the row
    // that holds this is T1.187's (a bare pair joins with nothing).
    expect: "T1.187",
  },
  {
    // C22 I143 (§101, §016) — the collapse of a shared modifier set on arrows.
    name: "an arrow pair collapses whatever its second member's shift",
    file: CHROME,
    from: "        (k.shift === true) === (first.shift === true) &&\n",
    to: "",
    expect: "T1.187",
  },
  {
    name: "a non-arrow pair collapses too",
    file: CHROME,
    from: "        ARROW_NAMES.has(k.name) &&\n",
    to: "",
    expect: "T1.187",
  },
  {
    // The ASCII rung spells every chord, so a collapse never hides a key.
    name: "the ASCII rung collapses a shared modifier",
    file: CHROME,
    from: '  if (!unicode) return `${keys.map((k) => chordText(k, false)).join("/")} ${does}`;\n',
    to: "",
    expect: "T1.187",
  },
  {
    // The exit found by the Unicode spelling: at ASCII the way out sheds.
    name: "the ladder finds the exit by a literal `esc`",
    file: CHROME,
    from: "c.label.startsWith(esc) ||",
    to: 'c.label.startsWith("esc ") ||',
    expect: "T1.46e",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: every chip loses its chord.
    file: CHROME,
    from: "  return `${sharedModifiers(keys)} ${does}`;",
    to: "  return does;",
    why: "the owner line draws no chord — if this survives, nothing reads the line",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
