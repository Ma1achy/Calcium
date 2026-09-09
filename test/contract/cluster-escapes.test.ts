// C09 T2.127–T2.132 — no frame the framework paints carries an escape inside a
// grapheme cluster (C09 I64, §5a).
//
// The styled walk in `text.ts` has one corner it does not resolve as the
// measurer does: an SGR inside a cluster (F957's eight cases). §5a rules that
// the walk will not resolve it, because the layer above promises never to paint
// one — and a promise the walk rests on is checked here rather than restated:
// over every frame the framework ships (T2.127), with the instrument shown to
// respond (T2.127b) and shown to stay quiet at a boundary (T2.127c), and then at
// six cluster shapes on every painter that styles far-side text. Three of those
// painters were splitting a cluster when this file was first run — a token
// boundary, a cursor cell, a 3-D label — and T2.130–T2.132 are the rows that
// failed before each fix and pass after it (F970).
//
// **Two things the corpus row cannot see, stated.** Ink drops a zero-width
// code point that opens a span, so a base and its mark split by an SGR reach a
// frame as a base *without* its mark rather than as a hit — the painter rows
// therefore read bytes before Ink where a painter offers them (T2.128, T2.132)
// and compare the visible row to its source where it does not (T2.130,
// T2.131). And four label writers keep no cluster whole at all (F969), so
// their no-hit answer in T2.129 is a record and not a claim.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { block, type Block, type TextSpan } from "../../src/data/viewmodel/index.js";
import { DEFAULT_LANGUAGES } from "../../src/presentation/blocks/index.js";
import { paint, paintRuns } from "../../src/presentation/blocks/paint.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { plot3dRows } from "../../src/presentation/plot/scatter3.js";
import { runsOf } from "../../src/presentation/runs.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { cells, graphemes } from "../../src/presentation/text.js";
import { NO_STYLE } from "../../src/presentation/theme/index.js";
import { csiCount, escapesInsideClusters } from "../support/cluster-escapes.js";
import { ONE_PER_FORM } from "../support/plot-forms.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, QUIET, measurable } from "../support/render.js";

/** Built rather than written, as T1.14 builds its ESC: a literal here is a byte no reader sees. */
const ESC = String.fromCharCode(27);
const RED = `${ESC}[31m`;
const RESET = `${ESC}[0m`;

// **The six shapes, each spelled in escapes** so an editor's normalisation
// cannot compose the decomposed one back into a single code point unread.
const NFD = "cafe\u0301"; // a base and its combining mark
const KEYCAP = "1\ufe0f\u20e3"; // a digit, a selector and an enclosing mark
const FLAG = "\u{1F1EC}\u{1F1E7}"; // two regional indicators
const FAMILY = "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}"; // pictographs joined
const PREPEND = "\u06001"; // U+0600 and the digit GB9b joins it to
const SPACING = "a\u0903"; // a base and a spacing mark
const SHAPES: Readonly<Record<string, string>> = { NFD, KEYCAP, FLAG, FAMILY, PREPEND, SPACING };
const MIX = `${NFD} ${KEYCAP} ${FLAG} ${FAMILY} ${PREPEND} ${SPACING} end`;

const WIDE_CAPS = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
const ARMS = { full: FULL_CAPS, ascii: ASCII_CAPS, mono: MONO_UNICODE_CAPS, wide: WIDE_CAPS } as const;

const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/gu;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const visible = (row: string): string => row.replace(CSI, "");

/** A row's hits, rendered readably for a failure message. */
const report = (row: string): string =>
  `${JSON.stringify(row).replace(/\\u001b/gu, "ESC")} -> ${JSON.stringify(escapesInsideClusters(row))}`;

/** Every row of a block at `width` under `caps`, with the three non-default kinds registered. */
function frame(b: Block, width: number, caps: typeof FULL_CAPS): readonly string[] {
  const kit = measurable({
    theme: DARK_THEME,
    capabilities: caps,
    definitions: [plotDefinition, tableDefinition, patchDefinition],
    onError: QUIET,
  });
  return kit.renderToLines(b, width);
}

function expectNoHit(rows: readonly string[], where: string): void {
  for (const row of rows) {
    expect(escapesInsideClusters(row), `${where}: ${report(row)}`).toEqual([]);
  }
}

describe("C09 §5a — the promise the walk rests on, checked over the corpus (C09 I64)", () => {
  it("T2.127 (C09 I64): no shipped frame carries an escape inside a grapheme cluster, and the row states what it read", () => {
    // **The golden snapshots**, parsed as vitest writes them: one template
    // literal per frame, backticks, `${` and backslashes escaped.
    const snapDir = fileURLToPath(new URL("../golden/__snapshots__/", import.meta.url));
    let snapLines = 0;
    let snapEscapes = 0;
    let snapFiles = 0;
    for (const f of readdirSync(snapDir)) {
      if (!f.endsWith(".snap")) continue;
      snapFiles += 1;
      const src = readFileSync(`${snapDir}${f}`, "utf8");
      const declared = (src.match(/^exports\[/gmu) ?? []).length;
      let frames = 0;
      for (const m of src.matchAll(/^exports\[`[^\n]*`\] = `\n?([\s\S]*?)`;\n/gmu)) {
        frames += 1;
        const body = (m[1] ?? "").replace(/\\`/gu, "`").replace(/\\\$\{/gu, "${").replace(/\\\\/gu, "\\");
        for (const row of body.split("\n")) {
          snapLines += 1;
          snapEscapes += csiCount(row);
          expect(escapesInsideClusters(row), `${f}: ${report(row)}`).toEqual([]);
        }
      }
      // A parser matching nothing reads nothing and passes: the frame count is
      // held to the file's own declaration count.
      expect(frames, `${f}: frames parsed against \`exports[\` declared`).toBe(declared);
      expect(frames, `${f}: an empty snapshot file`).toBeGreaterThan(0);
    }
    expect(snapFiles, "snapshot files read").toBeGreaterThanOrEqual(10);
    expect(snapLines, `snapshot lines read (8,728 when written): ${String(snapLines)}`).toBeGreaterThanOrEqual(5_000);
    expect(snapEscapes, `escapes met in the snapshots (33,954 when written): ${String(snapEscapes)}`).toBeGreaterThanOrEqual(10_000);

    // **The terminal baseline** — every plot form at every capability rung and
    // two widths, SGR included (`tools/terminal-baseline.mjs`).
    const baseDir = fileURLToPath(new URL("../golden/terminal-baseline/", import.meta.url));
    let files = 0;
    let lines = 0;
    let escapes = 0;
    for (const f of readdirSync(baseDir)) {
      if (!f.endsWith(".txt")) continue;
      files += 1;
      for (const row of readFileSync(`${baseDir}${f}`, "utf8").split("\n")) {
        lines += 1;
        escapes += csiCount(row);
        expect(escapesInsideClusters(row), `${f}: ${report(row)}`).toEqual([]);
      }
    }
    expect(files, `baseline frames read (2,440 when written): ${String(files)}`).toBeGreaterThanOrEqual(2_000);
    expect(lines, `baseline lines read (31,100 when written): ${String(lines)}`).toBeGreaterThanOrEqual(20_000);
    expect(escapes, `escapes met in the baseline (167,150 when written): ${String(escapes)}`).toBeGreaterThanOrEqual(100_000);
  });

  it("T2.127b (C09 I64): the fabricated violation — an escape inside each shape is reported at its index with its cluster", () => {
    // Shown to respond before anything is asserted against it
    // (`test/support/README.md`): every shape, with the SGR at the one place
    // the walk's corner is about.
    expect(escapesInsideClusters(`cafe${RED}\u0301x`)).toEqual([{ at: 4, cluster: "e\u0301" }]);
    expect(escapesInsideClusters(`\u{1F1EC}${RED}\u{1F1E7}x`)).toEqual([{ at: 2, cluster: FLAG }]);
    expect(escapesInsideClusters(`\ud83c${RED}\uddecx`), "between a surrogate pair's halves").toEqual([{ at: 1, cluster: "\u{1F1EC}" }]);
    expect(escapesInsideClusters(`\u0600${RED}1x`), "after a Prepend").toEqual([{ at: 1, cluster: PREPEND }]);
    expect(escapesInsideClusters(`\u{1F468}${RED}\u200d\u{1F469}`), "between a pictograph and its joiner").toEqual([{ at: 2, cluster: "\u{1F468}\u200d\u{1F469}" }]);
    expect(escapesInsideClusters(`1${RED}\ufe0f\u20e3`), "before U+FE0F").toEqual([{ at: 1, cluster: KEYCAP }]);
    expect(escapesInsideClusters(`a${RED}\u0903`), "before a spacing mark").toEqual([{ at: 1, cluster: SPACING }]);
    // Two escapes inside one cluster are two reports, and the index is in the
    // stripped row — the second sits at 2 whatever the first cost in bytes.
    expect(escapesInsideClusters(`\u{1F468}${RED}\u200d${RESET}\u{1F469}`)).toEqual([
      { at: 2, cluster: "\u{1F468}\u200d\u{1F469}" },
      { at: 3, cluster: "\u{1F468}\u200d\u{1F469}" },
    ]);
    // A non-SGR CSI sequence is an escape too.
    expect(escapesInsideClusters(`e${ESC}[2K\u0301`), "an erase inside a cluster").toEqual([{ at: 1, cluster: "e\u0301" }]);
  });

  it("T2.127c (C09 I64): the control — an escape at a cluster boundary is not reported, and a row without one counts zero", () => {
    expect(escapesInsideClusters(`${RED}e\u0301`), "before a base").toEqual([]);
    expect(escapesInsideClusters(`e\u0301${RED}x`), "after a mark").toEqual([]);
    expect(escapesInsideClusters(`${KEYCAP}${RED}${FLAG}${RESET}${FAMILY}`), "between clusters").toEqual([]);
    expect(escapesInsideClusters(`${RED}${MIX}${RESET}`), "at the row's start and end").toEqual([]);
    expect(escapesInsideClusters(MIX), "no escape at all").toEqual([]);
    expect(csiCount(MIX)).toBe(0);
    expect(csiCount(`${RED}${MIX}${RESET}`)).toBe(2);
    // A bare ESC that opens no CSI sequence is a control character: UAX #29
    // breaks a cluster on both sides of one (GB4, GB5), so it neither hides
    // inside a cluster nor manufactures one.
    expect(escapesInsideClusters(`e${ESC}\u0301`), "a bare escape").toEqual([]);
    expect(csiCount(`e${ESC}\u0301`)).toBe(0);
  });
});

describe("C09 §5a — the painters keep the promise (C09 I64)", () => {
  const ctx = { theme: DARK_THEME, capabilities: FULL_CAPS };

  it("T2.128 (C09 I64, C04 I84): a span boundary at every code unit, a gradient, and a tone opened inside a keycap all paint by cluster", () => {
    const text = `x ${MIX}`;
    for (let i = 1; i < text.length; i += 1) { // cells-ok — a code-unit boundary
      const spans: TextSpan[] = [{ from: 0, to: i, bold: true }, { from: i, to: text.length, italic: true }]; // cells-ok — code-unit offsets
      const row = paint(paintRuns(runsOf(text, spans), NO_STYLE, ctx));
      expect(escapesInsideClusters(row), `boundary at ${String(i)}: ${report(row)}`).toEqual([]);
      expect(visible(row), `boundary at ${String(i)}`).toBe(text);
    }
    // A gradient is one span per cluster, none inside one.
    const ramp: TextSpan = { from: 0, to: text.length, ramp: { fill: "gradient", from: "default", to: "accent" } }; // cells-ok — code-unit offsets
    const ramped = paintRuns(runsOf(text, [ramp]), NO_STYLE, ctx);
    expect(ramped.map((s) => s.text)).toEqual(graphemes(text));
    expect(escapesInsideClusters(paint(ramped))).toEqual([]);
    // A tone opened one unit into the keycap and closed one unit into the flag
    // takes both whole.
    const from = text.indexOf(KEYCAP) + 1;
    const to = text.indexOf(FLAG) + 2;
    const toned = paintRuns(runsOf(text, [{ from, to, tone: "accent" }]), NO_STYLE, ctx);
    expect(toned.map((s) => s.text)).toContain(`${KEYCAP} ${FLAG}`);
    expect(escapesInsideClusters(paint(toned))).toEqual([]);
  });

  it("T2.129 (C09 I64): every kind that styles far-side text, at six shapes, four arms and two widths — no escape inside a cluster, and each shape reaches the frame whole", () => {
    const spansOver = (t: string): TextSpan[] => {
      const out: TextSpan[] = [];
      for (let i = 0; i + 1 < t.length; i += 2) out.push({ from: i, to: i + 1, bold: true }); // cells-ok — code-unit offsets
      return out;
    };
    const gradient = (t: string): TextSpan[] => [{ from: 0, to: t.length, ramp: { fill: "gradient", from: "default", to: "accent" } }]; // cells-ok — code-unit offsets
    const P = ONE_PER_FORM;
    const cases: Readonly<Record<string, unknown>> = {
      notice: { kind: "notice", id: "n", tone: "info", text: MIX },
      "notice-spans": { kind: "notice", id: "n", tone: "info", text: MIX, spans: spansOver(MIX) },
      "notice-ramp": { kind: "notice", id: "n", tone: "info", text: MIX, spans: gradient(MIX) },
      raw: { kind: "raw", id: "r", text: MIX },
      "raw-spans": { kind: "raw", id: "r", text: MIX, spans: spansOver(MIX) },
      rule: { kind: "rule", id: "r", label: MIX, meta: NFD },
      keyValue: { kind: "keyValue", id: "k", rows: [{ label: NFD, value: MIX }, { label: KEYCAP, value: FLAG }] },
      steps: { kind: "steps", id: "s", steps: [{ label: MIX, state: "done" }, { label: NFD, state: "active", detail: MIX }, { label: KEYCAP, state: "pending" }] },
      logs: { kind: "logs", id: "l", lines: [{ ts: "12:00:01", level: "info", message: MIX }, { ts: NFD, level: "warn", message: KEYCAP }] },
      events: { kind: "events", id: "e", events: [{ ts: "12:00:00", type: NFD, message: MIX }] },
      progress: { kind: "progress", id: "p", label: MIX, current: 3, total: 10 },
      "progress-ramp": { kind: "progress", id: "p", label: MIX, current: 3, total: 10, ramp: { fill: "gradient", from: "default", to: "accent" } },
      comparison: { kind: "comparison", id: "c", rows: [{ field: MIX, a: NFD, b: KEYCAP, verdict: "better" }] },
      pills: { kind: "pills", id: "p", chips: [{ label: MIX, active: true }, { label: NFD, tone: "muted" }] },
      tip: { kind: "tip", id: "t", text: MIX, actions: [{ kind: "fill", label: NFD, command: "x" }] },
      panel: { kind: "panel", id: "p", title: MIX, children: [{ kind: "raw", id: "pr", text: MIX }] },
      status: { kind: "status", id: "s", state: "retrying", message: MIX, height: 7, retryInMs: 8000, attempt: 2 },
      table: {
        kind: "table", id: "t",
        columns: [
          // Wide enough for the label: a column with no `flex` gets its minimum
          // and nothing more (F50), and a shape truncated away is not one lost.
          { key: "name", label: MIX, align: "left", priority: 10, minWidth: 30, sortable: true },
          { key: "state", label: NFD, align: "left", priority: 5, minWidth: 6, sortable: false },
        ],
        rows: [
          { id: "r1", cells: { name: { text: MIX, spans: spansOver(MIX) }, state: { text: KEYCAP, tone: "ok" } } },
          { id: "r2", cells: { name: { text: NFD, spans: gradient(NFD) }, state: { text: FLAG, tone: "muted" } } },
        ],
      },
      "plot-line": { ...P.line, xLabels: [NFD, KEYCAP, FLAG], xTitle: MIX, series: [{ values: [1, 3, 2, 5, 4], label: MIX, pointLabels: [NFD, KEYCAP, FLAG, FAMILY, PREPEND] }] },
      "plot-bar": { ...P.bar, categories: [NFD, KEYCAP, FLAG, FAMILY, PREPEND, SPACING], series: [{ values: [10, 25, 15, 30, 20, 5], label: MIX }] },
      "plot-radar": { ...P.radar, categories: [NFD, KEYCAP, FLAG, FAMILY, PREPEND] },
      "plot-pie": { ...P.pie, segments: [{ label: NFD, value: 65 }, { label: KEYCAP, value: 15 }, { label: FLAG, value: 12 }, { label: FAMILY, value: 8 }] },
      "plot-waffle": { ...P.waffle, segments: [{ label: NFD, value: 65 }, { label: KEYCAP, value: 25 }, { label: FLAG, value: 10 }] },
      "plot-heatmap": { ...P.heatmap, series: [{ values: [1, 2, 3, 4], label: NFD }, { values: [4, 3, 2, 1], label: KEYCAP }, { values: [2, 2, 3, 3], label: FAMILY }], xLabels: [NFD, KEYCAP, FLAG] },
      "plot-flame": { ...P.flame, categories: [NFD, KEYCAP, FLAG, FAMILY] },
      "plot-treemap": { ...P.treemap, hierarchy: { label: NFD, value: 100, children: [{ label: KEYCAP, value: 55, children: [{ label: FLAG, value: 30 }, { label: FAMILY, value: 25 }] }, { label: MIX, value: 30 }, { label: PREPEND, value: 15 }] } },
      "plot-tree": { ...P.tree, hierarchy: { label: NFD, children: [{ label: KEYCAP, children: [{ label: FLAG }, { label: FAMILY }] }, { label: MIX }] } },
      "plot-graph": { ...P.graph, graph: { nodes: [{ id: NFD }, { id: KEYCAP }, { id: FLAG }, { id: FAMILY }], edges: [{ from: NFD, to: KEYCAP }, { from: KEYCAP, to: FLAG }, { from: FLAG, to: FAMILY }, { from: NFD, to: FAMILY }] } },
      "plot-sankey": { ...P.sankey, graph: { nodes: [{ id: NFD }, { id: KEYCAP }, { id: FLAG }, { id: FAMILY }], edges: [{ from: NFD, to: FLAG, weight: 5 }, { from: KEYCAP, to: FAMILY, weight: 3 }, { from: NFD, to: FAMILY, weight: 2 }] } },
    };
    // **The shapes that do not arrive whole, by kind** (F969): treemap, tree,
    // graph and sankey write one code point per cell and drop the zero-width
    // ones, so a family arrives as three faces, a keycap as a bare digit, and
    // in the treemap `café` as `cafe`. They paint no escape inside a cluster
    // because no cluster survives to be split, and that is a record, not a
    // claim. Compared by equality, so a writer fixed must leave this list and
    // a new one must join it.
    const NOT_WHOLE: Readonly<Record<string, readonly string[]>> = {
      "plot-treemap": ["NFD", "KEYCAP", "FAMILY"],
      "plot-tree": ["KEYCAP", "FAMILY"],
      "plot-graph": ["KEYCAP", "FAMILY"],
      "plot-sankey": ["KEYCAP", "FAMILY"],
    };
    const missing: Record<string, readonly string[]> = {};

    for (const [name, spec] of Object.entries(cases)) {
      const b = block(spec as never);
      const carried = Object.entries(SHAPES).filter(([, shape]) => JSON.stringify(spec).includes(shape));
      expect(carried.length, `${name} carries at least one shape`).toBeGreaterThan(0);
      for (const [arm, caps] of Object.entries(ARMS)) {
        for (const width of [40, 80]) {
          expectNoHit(frame(b, width, caps), `${name} ${arm} at ${String(width)}`);
        }
      }
      // The fixture is shown to respond: each shape the block carries reaches
      // the 80-cell frame whole under full capabilities. **Compared in NFC**,
      // because Ink composes a row it wraps — `wrap-ansi` normalises before it
      // cuts — and composing a cluster is not splitting one; a dropped mark or
      // joiner fails the comparison in either form. Ink wraps `raw` here at
      // all because `aः` measures 1 to `cells()` and 2 to `string-width`, so
      // a row padded to the width is one cell over by Ink's measure (F969,
      // open — a width finding, not a boundary one).
      const shown = frame(b, 80, FULL_CAPS).map(visible).join("\n").normalize("NFC");
      const lost = carried.filter(([, shape]) => !shown.includes(shape.normalize("NFC"))).map(([label]) => label);
      if (lost.length > 0) missing[name] = lost;
    }
    expect(missing, "the shapes that do not reach the frame whole, by kind").toEqual(NOT_WHOLE);
  });

  it("T2.130 (C09 I64): the syntax painters — every default grammar and the patch — take a token boundary to the cluster's end", () => {
    // `؀1` is the case the grammars split: `1` is a `number` token to every
    // grammar that has one, and U+0600 before it is a Prepend the segmenter
    // joins to it (GB9b). The rest are the shapes a token regex could end
    // inside and did not, kept so the row says so.
    const source = [
      `name: ${NFD}`,
      `${NFD}: ${KEYCAP} ${FLAG}`,
      `const ${NFD} = "${MIX}"; // ${MIX}`,
      `${FAMILY}=${PREPEND}`,
      `<${NFD} x="${KEYCAP}">${FLAG}</${NFD}>`,
    ];
    expect(DEFAULT_LANGUAGES.length, "grammars").toBeGreaterThanOrEqual(10); // cells-ok — a grammar count
    for (const language of DEFAULT_LANGUAGES) {
      const b = block({ kind: "code", id: "c", language, text: `${source.join("\n")}\n` } as never);
      for (const [arm, caps] of Object.entries(ARMS)) {
        const rows = frame(b, 80, caps);
        expectNoHit(rows, `code-${language} ${arm}`);
        // Nothing dropped: each visible row is its source line, which is how a
        // split Ink would hide — by dropping the zero-width piece — is seen.
        expect(rows.map(visible), `code-${language} ${arm}: the rows are the source`).toEqual(source);
      }
      const wrapped = block({ kind: "code", id: "c", language, wrap: true, text: `const ${NFD} = "${MIX}"; // ${MIX} ${MIX}\n` } as never);
      for (const width of [20, 40]) expectNoHit(frame(wrapped, width, FULL_CAPS), `code-wrap-${language} at ${String(width)}`);
    }

    const hunks = [{
      header: "@@ -1,4 +1,4 @@",
      lines: [
        { kind: "context", text: `const ${NFD} = 1;`, oldNo: 1, newNo: 1 },
        { kind: "remove", text: `let x = "cafe ${KEYCAP} ${FLAG}";`, oldNo: 2 },
        { kind: "add", text: `let x = "${NFD} ${KEYCAP} ${FAMILY}";`, newNo: 2 },
        { kind: "remove", text: `${FAMILY} ${PREPEND}`, oldNo: 3 },
        { kind: "add", text: `${FAMILY}x ${PREPEND}y`, newNo: 3 },
      ],
    }];
    for (const language of ["typescript", "yaml"]) {
      const b = block({ kind: "patch", id: "p", path: `x.${language}`, language, hunks } as never);
      for (const [arm, caps] of Object.entries(ARMS)) {
        const rows = frame(b, 80, caps);
        expectNoHit(rows, `patch-${language} ${arm}`);
        const shown = rows.map(visible).join("\n");
        for (const line of hunks[0]?.lines ?? []) expect(shown, `patch-${language} ${arm}: ${line.text}`).toContain(line.text);
      }
    }
  });

  it("T2.131 (C09 I64, I56): the terminal cursor's cell is the cluster covering its column, and the mark survives", () => {
    const texts = { nfd: `${NFD}x`, keycap: `${KEYCAP}x`, flag: `${FLAG}x`, cjk: "\u65e5x", family: `${FAMILY}x` };
    for (const [name, text] of Object.entries(texts)) {
      for (let col = 0; col <= 5; col += 1) {
        // The reference: the cluster whose cells cover `col`, by the measurer's
        // own walk, or a space `col − cells(text)` cells past the end.
        let at = 0;
        let expected: { cell: string; from: number } | null = null;
        for (const cluster of graphemes(text)) {
          const w = cells(cluster);
          if (at + w > col) { expected = { cell: cluster, from: at }; break; }
          at += w;
        }
        const want = expected ?? { cell: " ", from: col };

        const b = block({ kind: "terminal", id: "t", cols: 40, screen: "lines", lines: [{ text }], cursor: { line: 0, col } } as never);
        for (const [arm, caps] of Object.entries(ARMS)) {
          const rows = frame(b, 40, caps);
          const row = rows[0] ?? "";
          const where = `${name} col ${String(col)} ${arm}: ${report(row)}`;
          expect(escapesInsideClusters(row), where).toEqual([]);
          expect(LONE_SURROGATE.test(row), `${where} holds a lone surrogate`).toBe(false);
          // The mark survives Ink, and the row is the line's text padded.
          expect(visible(row).replace(/ +$/u, ""), where).toBe(text);
          // The inverse cell is the cluster covering the column, at its cell.
          const m = /\x1b\[7m([^\x1b]*)\x1b\[/u.exec(row);
          expect(m, `${where}: an inverse cell`).not.toBeNull();
          expect(m?.[1], `${where}: the inverse cell`).toBe(want.cell);
          const before = visible(row.slice(0, m?.index ?? 0));
          expect(cells(before), `${where}: the inverse cell's column`).toBe(want.from);
        }
      }
    }
  });

  it("T2.132 (C09 I64, C12 I92): a 3-D axis name with a tone is painted cluster by cluster, read before Ink", () => {
    const b = block({
      ...ONE_PER_FORM.plot3d,
      height: 14,
      axisStyle3: { x: { label: NFD, tone: "accent" }, y: { label: KEYCAP, tone: "ok" }, z: { label: FAMILY, tone: "warn" } },
    } as never);
    const ctx = { theme: DARK_THEME, capabilities: FULL_CAPS, width: 100, tick: 0, focus: null, scratch: undefined, cameras: undefined } as never;
    for (const width of [60, 100]) {
      const rows = plot3dRows(b as never, width, ctx);
      expectNoHit(rows, `plot3d at ${String(width)}`);
      const shown = rows.map(visible).join("\n");
      // The fixture responds: every name reaches the rows whole, with its ink.
      for (const [label, shape] of [["NFD", NFD], ["KEYCAP", KEYCAP], ["FAMILY", FAMILY]] as const) {
        expect(shown.includes(shape), `plot3d at ${String(width)}: ${label} whole`).toBe(true);
      }
      expect(rows.some((r) => new RegExp(`\\x1b\\[[0-9;]*m${FAMILY}\\x1b`, "u").test(r)), `plot3d at ${String(width)}: the family is one styled span`).toBe(true);
    }
  });
});
