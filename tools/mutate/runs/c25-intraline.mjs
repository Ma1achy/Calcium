// C25 I10 / C04 I91 — the intra-line diff and the second run stream. Mutated.
//
// **What this run exists to catch is a diff that is right and painted wrong, or
// painted right from the wrong pair.** The spans are offsets; every way of
// getting them wrong keeps the row count, the gutter and the syntax colours
// exactly as they were, so C25 I1, T2.1 and every golden pass. Only a reader of
// the underline — `underlinedRuns`, which parses SGR state cell by cell — can
// see any of the mutations below, which is why the named tests are all rows that
// read the frame or the offsets and none that count spans.
//
// The three rulings the walk produced (whitespace is a token, an unrelated pair
// gets nothing, the cap is per pair) each get a mutation, because each is a
// sentence that reads as obeyed whether or not the code does it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/patch-intraline.test.ts test/contract/patch-intraline.test.ts " +
  "test/edge/patch-intraline.test.ts test/integration/patch.test.ts test/revert/patch.test.ts";
const DIFF = "src/data/viewmodel/intraline.ts";
const LINES = "src/presentation/patch/lines.ts";
const DEF = "src/presentation/patch/definition.ts";
const BUILDER = "src/shell/builders/index.ts";
const WINDOW = "src/presentation/patch/window.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
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
    file: DIFF,
    from: "  return { removed: spansOf(a, changed.a), added: spansOf(b, changed.b) };",
    to: "  return NONE;",
    why: "no spans at all is what every offset row and every frame row asserts against; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The unrelated ruling.** Without it `foo bar` / `baz qux` underlines
      // every token on both sides — the line background restated. Every row that
      // counts spans, or reads the frame of a *related* pair, passes.
      name: "UNRELATED-UNDERLINED: the shared-token check is dropped",
      file: DIFF,
      from: "  if (!related) return NONE;",
      to: "",
      expect: "T1.13",
    },
    {
      // **The whitespace ruling.** Whitespace dropped from the token rule makes a
      // re-indent a pair with no visible change, and every word-level row passes.
      name: "WHITESPACE-DROPPED: whitespace is not a token",
      file: DIFF,
      from: "const TOKEN = /[\\p{L}\\p{N}\\p{M}_]+|\\s+|[^\\p{L}\\p{N}\\p{M}_\\s]/gu;",
      to: "const TOKEN = /[\\p{L}\\p{N}\\p{M}_]+|[^\\p{L}\\p{N}\\p{M}_\\s]/gu;",
      expect: "T1.12",
    },
    {
      // **The cap.** Removed, a 201-token pair is diffed; the only row that sees
      // it is the one built at the boundary.
      name: "CAP-IGNORED: the token cap is not read",
      file: DIFF,
      from: "  if (a.length > INTRALINE_TOKEN_CAP || b.length > INTRALINE_TOKEN_CAP) return NONE; // cells-ok — token counts",
      to: "",
      expect: "T1.11",
    },
    {
      // **The cap, the other way.** A cap that is off by one — `>=` — refuses the
      // pair at exactly 200, and a row asserting "over the cap is refused" passes.
      name: "CAP-EXCLUSIVE: exactly the cap is refused",
      file: DIFF,
      from: "  if (a.length > INTRALINE_TOKEN_CAP || b.length > INTRALINE_TOKEN_CAP) return NONE; // cells-ok — token counts",
      to: "  if (a.length >= INTRALINE_TOKEN_CAP || b.length >= INTRALINE_TOKEN_CAP) return NONE; // cells-ok — token counts",
      expect: "T1.11",
    },
    {
      // **A second pairing.** The *n*th remove against the *n*+1th add: the
      // underline on the left of a split row describes another row's change. The
      // renderer's grouping is untouched, so every geometry row passes.
      name: "PAIRING-SHIFTED: the builder pairs the nth remove with the n+1th add",
      file: DIFF,
      from: "      const right = group.adds[i];",
      to: "      const right = group.adds[i + 1] ?? group.adds[i];",
      expect: "T2.7",
    },
    {
      // **The caller's spans overwritten.** One writer over another's work; the
      // diff runs anyway and the caller's `bold` is gone.
      name: "CALLER-OVERWRITTEN: a line the caller gave spans is diffed anyway",
      file: DIFF,
      from: "      if (left.spans !== undefined || right.spans !== undefined) continue;",
      to: "",
      expect: "T1.14",
    },
    {
      // **Merging dropped.** Each changed token its own span: the same cells are
      // underlined, so every frame row passes, and only the offset row sees two
      // spans where one was promised.
      name: "SPANS-UNMERGED: adjacent changed tokens are not merged",
      file: DIFF,
      from: "    if (open !== null && open.to === token.from) open.to = token.to;\n    else {",
      to: "    if (false) open.to = token.to;\n    else {",
      expect: "T1.10",
    },
    {
      // **The renderer ignores the spans** — the unified call site. The block
      // carries them, the gate accepts them, the frame shows nothing.
      name: "SPANS-DROPPED-UNIFIED: unifiedRow does not pass the line's spans",
      file: DEF,
      from: "    [...gutterSpans(item, layout, ctx), ...textSpans(item.text, block.language, layout.text, ctx, item.spans)],",
      to: "    [...gutterSpans(item, layout, ctx), ...textSpans(item.text, block.language, layout.text, ctx)],",
      expect: "T4.12",
    },
    {
      // **The renderer ignores the spans** — one half of split. The other half
      // still underlines, so a row asserting "the split row has an underline"
      // passes; T2.7 asserts one run per half.
      name: "SPANS-DROPPED-SPLIT-LEFT: the removed side of a split row loses its spans",
      file: DEF,
      from: "        : [...gutterSpans(left, layout, ctx, \"old\"), ...textSpans(left.text, block.language, layout.text, ctx, left.spans)];",
      to: "        : [...gutterSpans(left, layout, ctx, \"old\"), ...textSpans(left.text, block.language, layout.text, ctx)];",
      expect: "T2.7",
    },
    {
      // **The marker inherits the run.** The suffix is appended inside the loop's
      // last style rather than in the fallback, and a truncated underlined word
      // underlines its own ellipsis.
      name: "MARKER-UNDERLINED: the truncation marker takes the last run's attributes",
      file: LINES,
      from: "  if (suffix !== \"\") spans.push({ text: suffix, style: fallback });",
      to: "  if (suffix !== \"\") spans.push({ text: suffix, style: spans[spans.length - 1]?.style ?? fallback });",
      expect: "T3.17",
    },
    {
      // **The builder does not call the writer.** Types, gate and renderer all in
      // place, and `b.patch` passes the hunks through — the class MG24 exists for,
      // one call site wide.
      name: "WRITER-UNCALLED: b.patch passes hunks through unchanged",
      file: BUILDER,
      from: "      hunks: hunks.map((hunk) => ({ ...hunk, lines: intralineLines(hunk.lines) })),",
      to: "      hunks: hunks.map((hunk) => ({ ...hunk, lines: hunk.lines.map((l) => l) })),",
      expect: "T4.12",
    },
    {
      // **A window rebuilds its lines without spans.** The slice is by line
      // object today; a window that copied the four named members would drop
      // the fifth and every geometry row would agree with it.
      name: "WINDOW-DROPS-SPANS: windowRows copies lines member by member",
      file: WINDOW,
      from: "    if (start >= b0 && end <= b1) {\n      out.push(...lines);",
      to: "    if (start >= b0 && end <= b1) {\n      out.push(...lines.map((l) => ({ kind: l.kind, text: l.text, ...(l.oldNo === undefined ? {} : { oldNo: l.oldNo }), ...(l.newNo === undefined ? {} : { newNo: l.newNo }) })));",
      expect: "T3.19",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
