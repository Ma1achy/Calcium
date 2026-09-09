// C12 I119, §3u — a layer meets the merge as cells, and the gridlines are the
// merge's own pass (F977, F981).
//
// **The control is the merge reading no cells at all.** `rowCells` answering
// nothing for every row blanks every layer of every frame this run reads — a
// harness that cannot see every curve and every name vanish can see nothing
// below.
//
// **One survivor is expected, and it is named.** `field.ts`'s merge hoisted its
// spread for the cost alone: no text reaches it (F976), so putting the
// per-column spread back draws every field form exactly as before, and nothing
// in this set measures cost. It sits in `EXPECTED_SURVIVORS` with that reason,
// and the pass fails the day it is caught — an exemption that outlives its
// reason is what the equality arm below is for (`c19-menu-window.mjs`'s form).
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEF = "src/presentation/plot/definition.ts";
const FIELD = "src/presentation/plot/field.ts";
const TEXT = "src/presentation/text.ts";

const FILES =
  "test/unit/plot-label-merge.test.ts test/unit/text.test.ts test/unit/plot-point-labels.test.ts " +
  "test/unit/plot-field.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    // T1.135 compares whole rows cell by cell at two widths and five shapes,
    // and a mutation that shifts every one reports at length: the buffer is
    // set rather than left at `execSync`'s default (`mutate.mjs`, `ran`).
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const MUTATIONS = [
  {
    // **The shipped defect, exactly.** The label's row read by code point —
    // five columns for a family, two for `図表` — so every cell after a name
    // drifts, three left or two right, and the row comes out short or clamped.
    name: "the label layer is indexed by code point",
    file: DEF,
    from: '  const rows = layers.map((l) => rowCells(l.glyphRows[rowIndex] ?? "", ctx.capabilities.ambiguousWidth));',
    to: '  const rows = layers.map((l) => [...(l.glyphRows[rowIndex] ?? "")]);',
    expect: "T1.135",
  },
  {
    // **The continuation rule removed.** `isBlank("")` is true in `curve.ts`,
    // so the cell behind a wide glyph is a blank to the merge: the curve shows
    // through it or a gridline lands in it, and the glyph draws over its own
    // second half — four cells in three columns (T6.99).
    name: "the continuation cell is treated as blank",
    file: DEF,
    from: '      if (candidate === "") {',
    to: '      if (candidate === "\\u0000") {',
    expect: "T1.136",
  },
  {
    // **The grid substitution dropped.** Every blank cell stays blank: the
    // frame has no gridlines on a data row and the muted runs never form.
    name: "a blank cell keeps its blank rather than taking the gridline",
    file: DEF,
    from: "      cell = under;\n",
    to: "",
    expect: "T1.136",
  },
  {
    // **The muted styling dropped.** A wholly blank run that took a gridline
    // is emitted unstyled — the dashes in the page's foreground, the *over*
    // that *behind, never over* exists to refuse.
    name: "a wholly blank run that took a gridline is not muted",
    file: DEF,
    from: "        ? gridded && muted !== null ? { text: run, style: muted } : { text: run }",
    to: "        ? { text: run }",
    expect: "T1.136",
  },
  {
    // **`field.ts`'s hoist reverted** — the per-column spread put back. Every
    // field row is one glyph per cell by construction, so the frame is the
    // same and only the cost moves. Expected to survive; see the head.
    name: "the field merge spreads every layer's row per column",
    file: FIELD,
    from: '      const candidate = rows[i]![x] ?? " ";',
    to: '      const candidate = [...(layers[i]!.glyphRows[row] ?? "")][x] ?? " ";',
    expect: "LY1",
  },
  {
    // **The fast set widened to a wide code point.** A row of `日` is split
    // one unit per cell — one cell where the terminal draws two — and T1.40's
    // check over the set's members is what refuses it (T6.100).
    name: "the fast set admits a wide code point",
    file: TEXT,
    from: "  0x2190, 0x21ff, 0x2500, 0x259f, 0x2800, 0x28ff, 0x1fb00, 0x1fbff,",
    to: "  0x2190, 0x21ff, 0x2500, 0x259f, 0x2800, 0x28ff, 0x65e5, 0x65e5, 0x1fb00, 0x1fbff,",
    expect: "T1.40",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * One entry: the field merge's hoist is a cost and not a behaviour, and this
 * set measures no cost. The pass fails if the listed mutation is caught after
 * all, so the entry cannot outlive its reason.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "the field merge spreads every layer's row per column",
    "no text reaches `field.ts`'s merge — every field form refuses `pointLabels` (F976) — so the " +
      "per-column spread draws every field row exactly as the hoist does, and nothing in this set " +
      "measures cost. The hoist retires the width squared from the second merge and changes no " +
      "frame; the instrument that sees it is F981's bench, which is not a test",
  ],
]);

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TEXT,
    from: '  if (text === "") return [];\n  const out: string[] = [];\n  if (cellPerUnit(text, ambiguous)) {',
    to: '  if (text === "") return [];\n  const out: string[] = [];\n  if (text !== "") return out;\n  if (cellPerUnit(text, ambiguous)) {',
    why:
      "every layer's row is no cells at all, so every frame this run reads is blank and every name " +
      "is gone — a harness that cannot see that can see nothing below",
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
