// C02 I9 — ambiguous width, mutated.
//
// **Every mutation here leaves a capability that is detected, declared and
// wrong in one place.** That is the shape the finding had before it was found:
// `RAMP_UNICODE` shipped for months with a comment saying its glyphs were one
// cell wide, and every test agreed because every test ran narrow.
//
// **Eight anchors across four runs moved when C02 gained `sources`** (F1021).
// Every rule in `capabilities.ts` now returns `Answer<T> = [value, source]`
// instead of a bare value, so every `from:` on a `return` moved — and so did
// every `to:`, which is the half a sweep does not read (F279). A `to:` still
// returning a bare string is **not** a weaker mutation: `detectCapabilities`
// destructures the pair, so `"narrow"` yields value `"n"` and source `"a"`,
// and the run would measure a shape defect rather than the behaviour named.
// All eight are *the code moved and the mutation still has a subject*; none
// lost its subject and none moved its `expect:`.

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
    from: "  if (locale === undefined) return [\"narrow\", \"assumed\"];\n  const subtag",
    to: "  if (locale !== undefined) return [\"narrow\", \"assumed\"];\n  const subtag",
    expect: "T2.50",
  },
  {
    // A substring test where a subtag test belongs. `jam_JM` is Jamaican.
    name: "the locale is matched as a substring",
    file: CAPS,
    from: "  const subtag = locale.toLowerCase().split(/[_.@-]/u)[0] ?? \"\";\n  return [WIDE_AMBIGUOUS_LANGUAGES.includes(subtag) ? \"wide\" : \"narrow\", \"stated\"];",
    to: "  const lower = locale.toLowerCase();\n  return [WIDE_AMBIGUOUS_LANGUAGES.some((l) => lower.startsWith(l)) ? \"wide\" : \"narrow\", \"stated\"];",
    expect: "T2.50",
  },
  {
    // **The ramp measured and not replaced.** The tempting half-fix: `cells()`
    // now knows, so the padding is right — and the row is twice as wide as the
    // column that holds it.
    name: "the sparkline measures the wide ramp instead of swapping it",
    file: RAMP,
    // **Re-anchored after `ladderFor` landed, and it was stale for a commit
    // without the checker seeing it**: `anchors.mjs` matched only double-quoted
    // `from:` values, and this one is single-quoted. 108 of 465 anchors were in
    // that blind spot. Run again after re-anchoring rather than trusted — the
    // mutation kills T2.53 exactly as the old one did.
    from: "      : caps.ambiguousWidth === \"wide\"\n        ? HEIGHT_BRAILLE\n        : HEIGHT_UNICODE,",
    to: "      : HEIGHT_UNICODE,",
    expect: "T2.53",
  },
  {
    // The block-elements range dropped from the ambiguous table — which is the
    // one range the shipped defect lives in.
    //
    // **Re-anchored when the table was derived from its source, and the first
    // re-anchor was wrong** (F665). The range moved out of `isAmbiguous`'s body
    // into `DRAWN_AS_GEOMETRY`, so the obvious re-anchor is that list's row —
    // and deleting it changes nothing, because `AMBIGUOUS_RANGES` carries
    // U+2580..U+258F and U+2592..U+2595 from the property itself. Run rather
    // than typed, which is the only reason that was found: the deletion was
    // still a valid anchor and had stopped being a mutation. The guard below
    // is what the row's *name* claims, and it kills T2.52 as the original did.
    name: "block elements are not ambiguous",
    file: TEXT,
    from: "function isAmbiguous(cp: number): boolean {\n  return inRanges",
    to: "function isAmbiguous(cp: number): boolean {\n  if (cp >= 0x2580 && cp <= 0x259f) return false;\n  return inRanges",
    expect: "T2.52",
  },
  {
    // Ambiguous treated as wide regardless of the argument, which passes every
    // row that only ever asks for one of the two answers.
    name: "ambiguous is wide whatever the caller said",
    file: TEXT,
    // Re-anchored when `clusterCells` became a sum over the cluster (F978):
    // the same arm, now `cp` inside the loop, and the same mutation.
    from: "    else if (ambiguous === \"wide\" && isAmbiguous(cp)) total += 2;",
    to: "    else if (isAmbiguous(cp)) total += 2;",
    expect: "T2.52",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: TEXT,
    // Re-anchored with `clusterCells`'s sum (F978): the same arm, now `cp`.
    from: "    if (isWide(cp)) total += 2;",
    to: "    if (isWide(cp)) total += 1;",
    why:
      "a genuinely wide glyph measures one cell — if this survives, nothing here measures at " +
      "all and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
