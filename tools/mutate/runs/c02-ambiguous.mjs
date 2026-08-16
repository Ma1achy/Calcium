// C02 I9 — ambiguous width, mutated.
//
// **Every mutation here leaves a capability that is detected, declared and
// wrong in one place.** That is the shape the finding had before it was found:
// `RAMP_UNICODE` shipped for months with a comment saying its glyphs were one
// cell wide, and every test agreed because every test ran narrow.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/ambiguous-width.test.ts";
const CAPS = "src/terminal/capabilities.ts";
const TEXT = "src/presentation/text.ts";
const RAMP = "src/presentation/plot/ramp.ts";

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
    // **Declared-only, which is the field this would have been without §3's
    // detection arm.** It ships, it is overridable, and it changes nothing for
    // the users it exists for — the failure the spec argues against in prose.
    name: "the capability is declared but never detected",
    file: CAPS,
    from: "  if (locale === undefined) return \"narrow\";\n  const subtag",
    to: "  if (locale !== undefined) return \"narrow\";\n  const subtag",
    expect: "T2.50",
  },
  {
    // A substring test where a subtag test belongs. `jam_JM` is Jamaican.
    name: "the locale is matched as a substring",
    file: CAPS,
    from: "  const subtag = locale.toLowerCase().split(/[_.@-]/u)[0] ?? \"\";\n  return WIDE_AMBIGUOUS_LANGUAGES.includes(subtag) ? \"wide\" : \"narrow\";",
    to: "  const lower = locale.toLowerCase();\n  return WIDE_AMBIGUOUS_LANGUAGES.some((l) => lower.startsWith(l)) ? \"wide\" : \"narrow\";",
    expect: "T2.50",
  },
  {
    // **The ramp measured and not replaced.** The tempting half-fix: `cells()`
    // now knows, so the padding is right — and the row is twice as wide as the
    // column that holds it.
    name: "the sparkline measures the wide ramp instead of swapping it",
    file: RAMP,
    from: '  return caps.ambiguousWidth === "wide" ? RAMP_BRAILLE : RAMP_UNICODE;',
    to: "  return RAMP_UNICODE;",
    expect: "T2.53",
  },
  {
    // The block-elements range dropped from the ambiguous table — which is the
    // one range the shipped defect lives in.
    name: "block elements are not ambiguous",
    file: TEXT,
    from: "    (cp >= 0x2580 && cp <= 0x259f) || // block elements — RAMP_UNICODE lives here\n",
    to: "",
    expect: "T2.52",
  },
  {
    // Ambiguous treated as wide regardless of the argument, which passes every
    // row that only ever asks for one of the two answers.
    name: "ambiguous is wide whatever the caller said",
    file: TEXT,
    from: '  return ambiguous === "wide" && isAmbiguous(base) ? 2 : 1;',
    to: "  return isAmbiguous(base) ? 2 : 1;",
    expect: "T2.52",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: TEXT,
    from: "  if (isWide(base)) return 2;",
    to: "  if (isWide(base)) return 1;",
    why:
      "a genuinely wide glyph measures one cell — if this survives, nothing here measures at " +
      "all and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
