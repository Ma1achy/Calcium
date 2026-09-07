// C02 I10 · C22 I68 — the terminal's polarity, and the theme it opens.
//
// **The three-valued field is what most of these attack**, because two of its
// three values are indistinguishable from a defect in every frame the suite
// draws: a terminal that says nothing already gets the set's first theme, so
// collapsing `unknown` into `dark` changes no pixel and removes the only reason
// the answer is right. A03 §2's vacuity class arriving in a *value* rather than
// in a rule.
//
// **And two attack the fixture rather than the code.** The shipped theme set is
// exactly the set where *search by variant* and *search for the name `light`*
// agree, and a set with no light theme agrees with them too — so `by-name` is
// caught by one row in the suite and silent in the other five.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CAPS = "src/terminal/capabilities.ts";
const CONSTRUCT = "src/shell/construct.ts";
const SPEC = "docs/components/C02_capability_detection.md";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(
      "npx vitest run test/unit/capabilities.test.ts test/edge/capabilities.test.ts " +
        "test/contract/capabilities.test.ts test/revert/capabilities.test.ts " +
        "test/unit/session-construct.test.ts 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
    );
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CAPS,
    from: '    backgroundPolarity: detectBackgroundPolarity(read(env, "COLORFGBG")),',
    to: '    backgroundPolarity: "dark",',
    why:
      "the whole rule replaced by a constant: detection, the third value and every C22 row " +
      "that branches on it go at once, so a run that cannot see this can see none of the rest",
  },
  mutations: [
    {
      // **§3's last-field rule, reverted to the obvious one.** Every fixture
      // but one has two fields, where the two rules agree — so this is silent
      // in all of them and visible in `0;default;15`.
      name: "the background is COLORFGBG's second field",
      file: CAPS,
      from: "  const cut = colorfgbg.lastIndexOf(\";\");",
      to: "  const cut = colorfgbg.indexOf(\";\");",
      expect: "T6.8",
    },
    {
      // **The third value collapsed**, which is I10's load-bearing half. No
      // frame changes: a terminal that says nothing already opens the set's
      // first theme, so this removes the *reason* and keeps the answer.
      name: "an absent COLORFGBG reads as a dark terminal",
      file: CAPS,
      from: '  if (colorfgbg === undefined) return "unknown";',
      to: '  if (colorfgbg === undefined) return "dark";',
      expect: "T1.11",
    },
    {
      // The 0–15 ceiling, which is where the layer rule lives. A 256-index
      // background would be answered from a cube this layer does not have.
      name: "an index above 15 is answered anyway",
      file: CAPS,
      from: '  if (index > 15) return "unknown";',
      to: "",
      expect: "T1.11",
    },
    {
      // **The split's two discontinuities, flattened to one.** 8 is bright
      // black and belongs to the dark half; a single threshold puts it with the
      // brights, which is the boundary a sampled pair of fixtures cannot see.
      name: "the light half starts at 7 and runs to 15",
      file: CAPS,
      from: '  return index === 7 || index > 8 ? "light" : "dark";',
      to: '  return index >= 7 ? "light" : "dark";',
      expect: "T3.11",
    },
    {
      // A background that is not a number, read through `parseInt`'s tolerance:
      // `default` is NaN and declines, but `15abc` would answer 15.
      name: "the background is parsed rather than tested for digits",
      file: CAPS,
      from: "  if (!/^\\d+$/u.test(background)) return \"unknown\";\n  const index = Number(background);",
      to: "  const index = Number.parseInt(background, 10);\n  if (Number.isNaN(index)) return \"unknown\";",
      expect: "T1.11",
    },
    {
      // **§3's gate boundary.** `COLORFGBG` describes the emulator's colours and
      // `TERM=dumb` is a statement about terminfo — the same argument that keeps
      // `imageProtocol` ungated (T3.10).
      name: "the dumb gate reaches COLORFGBG",
      file: CAPS,
      from: '    backgroundPolarity: detectBackgroundPolarity(read(env, "COLORFGBG")),',
      to: '    backgroundPolarity: usable ? detectBackgroundPolarity(read(env, "COLORFGBG")) : "unknown",',
      expect: "T3.12",
    },
    {
      // The override path, which I4 says is unconditional for *every* field. A
      // missing validator drops the field from `FIELDS` entirely.
      name: "the new field has no override validator",
      file: CAPS,
      from: '    backgroundPolarity: oneOf("dark", "light", "unknown"),\n',
      to: "",
      expect: "T1.9",
    },
    {
      // I6 — a capability with no named fallback owner cannot be added.
      name: "the field has no degradation row",
      file: CAPS,
      from: `  backgroundPolarity: Object.freeze({
    behaviour:
      "\`unknown\` keeps the app's own opening theme — the set's first key, or whatever the reader persisted. Nothing is painted differently and no notice is drawn: a terminal that does not say is a terminal the framework does not guess about",
    owner: "C22",
  }),
`,
      to: "",
      expect: "T2.6",
    },
    {
      // **F214, measured rather than argued.** The field removed from §2's
      // interface block and left in §4: T2.8 fails and T2.6 does not, which is
      // exactly the state `ambiguousWidth` shipped in.
      name: "the field is declared in §4 and not in §2",
      file: SPEC,
      from: '  backgroundPolarity: "dark" | "light" | "unknown";\n',
      to: "",
      expect: "T2.8",
    },
    {
      // **§6h.2 row 1 inverted.** An inference outranking a statement, which is
      // the reading that makes `/theme` stop working the day a terminal states
      // its background.
      name: "the detected polarity outranks a stated preference",
      file: CONSTRUCT,
      from: "    if (!stated) {\n      const polarity = detection.capabilities.backgroundPolarity;",
      to: "    if (true) {\n      const polarity = detection.capabilities.backgroundPolarity;",
      expect: "T1.20d",
    },
    {
      // **§6h.2 row 6, the row the classification table was for.** *A file
      // exists, so a preference exists* — which leaves the reader holding a
      // notice saying their choice was ignored beside a theme neither they nor
      // their terminal picked.
      name: "an unusable preference blocks the polarity",
      file: CONSTRUCT,
      from: "    if (!stated) {\n      const polarity = detection.capabilities.backgroundPolarity;",
      to: "    if (persisted === null) {\n      const polarity = detection.capabilities.backgroundPolarity;",
      expect: "T1.20e",
    },
    {
      // **The fixture mutation.** Searching for the name rather than the
      // declared variant is correct on the shipped set and on any set whose
      // light theme is called `light` — one row in the suite can see it.
      name: "the opening theme is found by the name `light`",
      file: CONSTRUCT,
      from: "          : themed.value.names.find((n) => config.theme[n]?.variant === polarity);",
      to: "          : themed.value.names.find((n) => n === polarity);",
      expect: "T1.20g",
    },
    {
      // **§6h.3 row 1.** A written inference is indistinguishable from a
      // statement on the next read — and every frame this session draws is
      // correct, so nothing but the file says so.
      name: "the detected choice is persisted",
      file: CONSTRUCT,
      from: "      if (match !== undefined) themed.value.setTheme(match);",
      to:
        "      if (match !== undefined) {\n" +
        "        themed.value.setTheme(match);\n" +
        "        void config.fs.writeFile(themePath(config.stateDir), `${match}\\n`).catch(() => undefined);\n" +
        "      }",
      expect: "T1.20b",
    },
    {
      // **F215.** The literal pair that outlived C10 I27's fork, restored — on a
      // set holding `high-contrast` it names two of the three themes available
      // and calls the third a mistake.
      name: "the rejected preference is `not dark or light`",
      file: CONSTRUCT,
      from:
        "          `theme preference ignored: \\`${trimmed.slice(0, 40)}\\` is not ` +\n" +
        "            `${themed.value.names.join(\", \")}`,",
      to: "          `theme preference ignored: \\`${trimmed.slice(0, 40)}\\` is not dark or light`,",
      expect: "T1.20e",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
