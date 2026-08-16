// Roadmap entry 23 — the selection wash, mutated.
//
// **The first mutation here is the wash at the wrong width**, and it is the one
// the whole test shape was built for: a wash that stops at a row's last cluster
// covers exactly the characters the region contains. Every assertion about
// `selectionSpans` — which cells, which rows, which text — agrees with it
// completely. It reads as *highlighted* rather than *selected*, and **only a
// frame-read distinguishes them.**
//
// The rest attack the joints: the window mapping, the geometry rule, and the
// 1-bit rung that stops the ladder falling from a background straight to a
// glyph.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/session-paint.test.ts test/unit/editor.test.ts";
const PAINT = "src/shell/paint.ts";
const LAYOUT = "src/interaction/editor/layout.ts";

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
    // **The wash at text width rather than full row.** An intermediate row
    // stops at its last cluster, so the newline or wrap the region covers is
    // not shown as covered. Correct about the characters, wrong about the
    // region — and invisible to anything that asserts characters.
    name: "an intermediate row is washed to its text, not to the full width",
    file: LAYOUT,
    from: "    const last = row === end.row ? end.col : width;",
    to: "    const last = row === end.row ? end.col : end.col;",
    expect: "T1.37",
  },
  {
    // **The other direction, and it looks correct on any single-row
    // selection.** Every row to the edge, including the one holding the head —
    // so a three-character selection washes eighty cells.
    name: "every row of the region is washed to the full width",
    file: LAYOUT,
    from: "    const last = row === end.row ? end.col : width;",
    to: "    const last = width;",
    expect: "T1.38",
  },
  {
    // **The wash applied before the row is squared off.** Same defect as the
    // first, arriving from the painter rather than from the geometry: there is
    // no padding yet, so `to: width` clamps to the text.
    name: "the wash is applied before the row is padded to width",
    file: PAINT,
    from: "    const squared = exact(gutter + body, width);\n    const span = spans.get(i);\n    out.push(span === undefined ? squared : washed(squared, span, deps));",
    to: "    const span = spans.get(i);\n    const inner = gutter + body;\n    out.push(exact(span === undefined ? inner : washed(inner, span, deps), width));",
    expect: "T4.23",
  },
  {
    // **The window ignored.** An editor row and a painted row are different
    // numbers whenever the prompt is windowed around its end, so the wash lands
    // on a row the reader did not select — and on an unwindowed prompt, which
    // is most of them, nothing looks wrong.
    name: "the span's editor row is used as the painted row",
    file: PAINT,
    from: "    const at = span.row - window.first + window.offset;",
    to: "    const at = span.row;",
    expect: "T4.26",
  },
  {
    // **Geometry.** Appending rather than styling in place is what a row of
    // chrome looks like from the inside, and I17 with I9 forbids it: a height
    // that moves without `rev` moving defeats C14's cache, and `measure` never
    // sees a selection at all.
    name: "the wash lengthens the row instead of styling it",
    file: PAINT,
    from: "  return `${before}${paintSpans([{ text: inside, style }])}${after}`;",
    to: "  return `${before}${paintSpans([{ text: inside, style }])}${after} `;",
    expect: "T4.22",
  },
  {
    // **The 1-bit rung removed.** At one bit `resolveBackground` answers
    // nothing, so the wash silently becomes no styling at all — the ladder
    // falls from a background straight to a glyph with nothing in between.
    name: "there is no reverse-video fallback at 1-bit",
    file: PAINT,
    from: "  return bg.background === undefined ? { inverse: true } : bg;",
    to: "  return bg;",
    expect: "T4.25",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * Empty: every mutation above is expected to be caught. An entry would name a
 * mutation the suite cannot see and why that is acceptable — and the pass fails
 * if a listed mutation is caught after all, so an entry cannot outlive its
 * reason.
 */
const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: LAYOUT,
    from: "  if (lo === hi) return Object.freeze([]);",
    to: "  return Object.freeze([]);",
    why:
      "no region ever produces a span — if this survives, nothing in the set reaches the wash " +
      "and every kill below is unearned",
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
