// C12 I118, I119 — the radar's category labels and the x axis's captions
// through the one writer, the line arm's read as cells, and SS61, the rule
// that keeps a code-point index off a cell row (F982, F984, F985).
//
// **The control is the writer writing nothing**: every frame row this run
// reads asserts a name in a row, so a harness that cannot see every label
// vanish can see nothing below.
//
// **Each restored loop is the line as it shipped**, so a call site that
// quietly stopped going through the writer is caught by the row that reads
// that form. The tick-label writer is restored too and is expected to survive:
// no formatted number carries a cluster of more than one code point, so the
// row that could see it has no input to see it with. It goes through the
// writer to close the class rather than because a frame showed it, and the
// survivor is the record of that.
//
// **The rule is mutated from three sides**, the `quadratic-cursor.mjs` shape:
// its index arm narrowed to SS60's `[0]`, its `forEach` arm dropped, and its
// citation retargeted — each caught by the fabrication that copies the
// shipped line, which is what the fabrication is for. The row is an
// `it.each` and vitest quotes the interpolated id (`'SS61' fires on a
// fabricated violation`) where the file holds the template (`$rule fires on a
// fabricated violation`), and the anchors sweep reads the file — so, as
// `quadratic-cursor.mjs` does, the expectation is the template's tail. The
// first pass read three CAUGHT ELSEWHERE for the two quotes.
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CHARGRID = "src/presentation/plot/chargrid.ts";
const CIRCLE = "src/presentation/plot/circle.ts";
const AXES = "src/presentation/plot/axes.ts";
const SCANS = "tools/enforce/source-scans.mjs";

const FILES =
  "test/unit/plot-radar-labels.test.ts test/unit/plot-x-axis.test.ts " +
  "test/unit/enforce-rules.test.ts test/revert/plot.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const EXPECTED_SURVIVORS = new Map([
  [
    "the tick labels are written one code point per cell",
    "F985 — a formatted number is ASCII: no tick label carries a cluster of more than one " +
      "code point, so no row has an input that separates the two writers. The writer is " +
      "shared to close the class, and this survivor is the record that the frame cannot show it.",
  ],
]);

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CHARGRID,
    from: "    row[col] = cluster;\n",
    to: "",
    why: "the writer writes nothing, so every name in every frame this run reads is gone",
  },
  mutations: [
    {
      // **The radar's private loop restored**: placed by `cells()`, written
      // one code point per slot. A family overruns its reservation by three.
      name: "the radar's category labels are written one code point per slot",
      file: CIRCLE,
      from: "    write(slots[row]!, start, text, ambiguous);\n",
      to: "    [...text].forEach((ch, k) => { if (slots[row]?.[start + k] !== undefined) slots[row]![start + k] = ch; });\n",
      expect: "T1.139",
    },
    {
      // **The line arm's read restored**: the joined row by code point.
      name: "the line arm reads its label row by code point",
      file: CIRCLE,
      from: "    const labelCells = rowCells(labels[cy] ?? \"\", ambiguous);\n",
      to: "    const labelCells = [...(labels[cy] ?? \"\")];\n",
      expect: "T1.140",
    },
    {
      // **The continuation treated as unnamed**: the cell behind 図 gets a
      // quadrant glyph of its own and the row runs one cell over.
      name: "a wide name's continuation cell is not the name's",
      file: CIRCLE,
      from: "      const named = label !== undefined && label !== \" \";\n",
      to: "      const named = label !== undefined && label !== \" \" && label !== \"\";\n",
      expect: "T1.140",
    },
    {
      // **The captions' private loop restored.**
      name: "the captions are written one code point per cell",
      file: AXES,
      from:
        "    // sat three cells left or two right of the ticks placed for them (F985).\n" +
        "    write(row, start, text, caps.ambiguousWidth);\n",
      to:
        "    // sat three cells left or two right of the ticks placed for them (F985).\n" +
        "    [...text].forEach((ch, i) => { row[start + i] = ch; });\n",
      expect: "T1.141",
    },
    {
      // **The tick labels' private loop restored** — the expected survivor.
      name: "the tick labels are written one code point per cell",
      file: AXES,
      from:
        "    // ASCII today, and the row it goes into is a cell row like any other.\n" +
        "    write(row, start, text, caps.ambiguousWidth);\n",
      to:
        "    // ASCII today, and the row it goes into is a cell row like any other.\n" +
        "    [...text].forEach((ch, i) => { row[start + i] = ch; });\n",
      expect: "T1.141",
    },
    {
      // **RULE-BLIND**: the index arm narrowed to SS60's own `[0]`, so the
      // radar's shipped line no longer fires.
      name: "RULE-BLIND: SS61 asks only for the first element",
      file: SCANS,
      from: "\\s*(?:\\[(?!0\\])|\\.at\\((?!0\\))|",
      to: "\\s*(?:\\[0\\]|\\.at\\((?!0\\))|",
      expect: "fires on a fabricated violation",
    },
    {
      // **RULE-NARROW**: the writer's `forEach` arm dropped.
      name: "RULE-NARROW: SS61 forgets forEach",
      file: SCANS,
      from: "|\\.(?:forEach|map)\\(\\s*\\(\\s*\\w+\\s*,\\s*\\w+)/,",
      to: "|\\.(?:map)\\(\\s*\\(\\s*\\w+\\s*,\\s*\\w+)/,",
      expect: "fires on a fabricated violation",
    },
    {
      // **RULE-RETARGET**: the citation moved to the writer's invariant.
      name: "RULE-RETARGET: SS61 declares C12 I118",
      file: SCANS,
      from: "  { id: \"SS61\", spec: \"C12 I119 · C12 T1.140\",",
      to: "  { id: \"SS61\", spec: \"C12 I118 · C12 T1.140\",",
      expect: "fires on a fabricated violation",
    },
  ],
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
