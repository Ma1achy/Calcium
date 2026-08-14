// Entry 39, both halves — the declaration, the base, and the flag's reader.
//
// **The arm under test has never run**, which is what this pass is for. `dark`
// inherits and the shipped default paints nothing, so every frame this suite has
// ever drawn was drawn on the branch that emits no base — F55's class, with the
// skipped arm being the new one. A mutation that breaks painting has to fail
// something, and before these rows nothing would have.
//
// **Two of these cannot be seen by looking at a frame**: the 8-bit floor
// computed against the token rather than the quantised value passes every
// truecolour row, and `49` dropped from the repair set is a background that dies
// in the padding of a diff row and nowhere else.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **And a mutation that names a symbol the file no longer has is a false kill.**
// The variant row's replacement read `_argv` from before the parameter was used
// again for the usage message; it "caught" by throwing a ReferenceError, which is
// the instrument manufacturing its own evidence. Checked by reading the survivor
// count against the run before the rename rather than by trusting it went up.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/session-paint.test.ts test/unit/theme.test.ts " +
  "test/integration/theme.test.ts test/contract/theme.test.ts";
const PAINT = "src/shell/paint.ts";
const RESOLVE = "src/presentation/theme/resolve.ts";
const HANDLERS = "src/shell/local/handlers.ts";
const FRAMEWORK = "src/data/manifest/framework.ts";
const LIGHT = "src/presentation/theme/tokens-light.ts";
const ESCAPES = "src/terminal/escapes.ts";

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
    // **The painting arm dropped entirely** — a theme declaring `surface` with
    // no reader. The state before this entry, restored: every frame is drawn on
    // the inheriting branch and the light theme is dark-on-dark again.
    name: "a theme declaring `surface` paints nothing",
    file: RESOLVE,
    from: '  if (theme.tokens.background !== "surface") return NO_STYLE;',
    to: "  return NO_STYLE;",
    expect: "T1.17",
  },
  {
    // **The reset repaired back to the terminal's default rather than to base.**
    // The row still opens with the base, so the first cells are right and the
    // rest of the row is the terminal's — visible in a frame read and in
    // nothing else.
    name: "a reset returns to the terminal's default",
    file: PAINT,
    from: "    (line) => `${base}${line.replace(toTerminalDefault(), (seq) => `${seq}${base}`)}${SGR_RESET}`,",
    to: "    (line) => `${base}${line}${SGR_RESET}`,",
    expect: "T1.23",
  },
  {
    // **`49` dropped from the repair set**, which is the correction the code
    // made to the walk. The walk counted the sites that write `\x1b[0m`; L1
    // closes a background run with `\x1b[49m` — the terminal's default, not
    // ours — and a patch row ends with exactly that.
    name: "only a full reset is repaired, not a background close",
    file: ESCAPES,
    from: "export const toTerminalDefault = (): RegExp => /\\x1b\\[(?:0|49)m/gu;",
    to: "export const toTerminalDefault = (): RegExp => /\\x1b\\[0m/gu;",
    expect: "T1.23",
  },
  {
    // **The row left open.** The walk ruled a reset at `suspend()` and
    // `release()` for this; closing the row makes the state unreachable, and
    // this is the mutation that says so.
    name: "a painted row ends with the base live",
    file: PAINT,
    from: "(seq) => `${seq}${base}`)}${SGR_RESET}`,",
    to: "(seq) => `${seq}${base}`)}`,",
    expect: "T1.23b",
  },
  {
    // **The base applied whatever the flag says.** `--no-bg` parses, the state
    // is right, and the screen ignores it.
    name: "--no-bg is not read at paint",
    file: PAINT,
    from: "  if (deps.suppressBackground()) return \"\";",
    to: "",
    expect: "T1.23c",
  },
  {
    // **The 8-bit floor against the token rather than against the quantised
    // value.** Passes every 24-bit row, which is every row anyone writes.
    name: "the 8-bit floor is measured against the token",
    file: RESOLVE,
    from: "      const measured = ratio(value, painted);",
    to: "      const measured = ratio(value, bg);",
    expect: "T1.19",
  },
  {
    // **The recomputation gated on nothing**, so a theme that inherits is bound
    // to a floor against a colour it never paints.
    name: "the quantised floor applies to a theme that inherits",
    file: RESOLVE,
    from: '  if (tokens.background !== "surface") return Object.freeze([]);',
    to: "",
    expect: "T1.19",
  },
  {
    // **The variant read from `argv[0]` again**, which is the duplication the
    // widening closed. It passes for `/theme light` and fails for
    // `/theme --no-bg light` — the shape a positional read has whenever a flag
    // can precede it, and `shellOnly` is what makes the correct version work.
    name: "the variant is re-derived from argv",
    file: HANDLERS,
    from: '      const wanted = ctx.args["variant"];',
    to: "      const wanted = argv[0];",
    expect: "T4.28",
  },
  {
    // **Both halves at once**, which is the only lethal form and the finding
    // that produced this row: each mechanism is sufficient on its own, so a
    // mutation undoing either leaves the verb working. `no-bg` declared without
    // `shellOnly` travels into `argv`, and *then* a positional read takes the
    // flag for the variant.
    name: "the flag travels and the variant is positional",
    file: HANDLERS,
    from: '      const wanted = ctx.args["variant"];',
    to: '      const wanted = ["--no-bg", ...argv].filter((t) => !t.startsWith("@"))[0];',
    expect: "T4.28",
  },
  {
    // **The flag declared without `shellOnly`**, so it travels into the
    // handler's argv and a valid invocation answers with a usage error.
    name: "--no-bg is not shellOnly",
    file: FRAMEWORK,
    from: '        name: "no-bg",\n        type: "bool" as const,\n        shellOnly: true,',
    to: '        name: "no-bg",\n        type: "bool" as const,',
    expect: "T4.28",
  },
  {
    // **The warning fired whatever the theme declares.** A notice that always
    // appears reads exactly like one that is correct, from a passing suite.
    name: "the warning ignores whether anything was suppressed",
    file: HANDLERS,
    from: '        ctx.args["no-bg"] === true && deps.theme.current.tokens.background === "surface";',
    to: '        ctx.args["no-bg"] === true;',
    expect: "T4.29",
  },
  {
    // **The flag left set across invocations**, which is the sticky version the
    // ruling refuses: you switch themes later, get no background, and have
    // nothing on screen explaining why.
    name: "--no-bg is sticky",
    file: HANDLERS,
    from: '      deps.setSuppressBackground(ctx.args["no-bg"] === true);',
    to: '      if (ctx.args["no-bg"] === true) deps.setSuppressBackground(true);',
    expect: "T4.34",
  },
  {
    // **The light theme back to inheriting**, which is the shipped defect: it
    // sets dark foregrounds and emits nothing behind them.
    name: "the light theme inherits again",
    file: LIGHT,
    from: '  background: "surface",',
    to: '  background: "terminal",',
    expect: "T1.17",
  },
];

const EXPECTED_SURVIVORS = new Map([
  [
    "the variant is re-derived from argv",
    "**the two mechanisms are each sufficient, so neither can be tested alone.** `--no-bg` is " +
      "`shellOnly`, so `validation.transmitted` strips it and `argv[0]` *is* the variant — reading " +
      "it there gives the same answer as reading `ctx.args`, on every invocation the grammar can " +
      "produce. So this is a **duplication removed rather than a defect fixed**, and the row that " +
      "would catch it cannot exist while `shellOnly` holds. What is testable is the pair, which " +
      "the mutation below applies, and the mechanism, which T4.28 asserts on `meta.argv`. Recorded " +
      "rather than left as a silent pass: the day `--no-bg` stops being `shellOnly` this becomes a " +
      "live defect, and the exemption is where a reader finds that out",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: RESOLVE,
    from: "export function resolveBase(theme: ResolvedTheme, caps: Caps): Style {",
    to: "export function resolveBase(_theme: ResolvedTheme, _caps: Caps): Style {\n  throw new Error(`control`);\n}\nfunction unusedResolveBase(theme: ResolvedTheme, caps: Caps): Style {",
    why:
      "the base refuses to be produced at all — if this survives, nothing in the set reaches the " +
      "painting arm and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
