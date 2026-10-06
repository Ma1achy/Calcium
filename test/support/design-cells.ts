// The design-check's items as **readings of two cell grids** — the comparison
// M16's mark set could not make (b5-fixcolour; `tools/design/cells.ts`).
//
// **A probe is an item, a figure, a frame and some readings.** A reading is one
// function applied to both grids, so the figure and the frame are asked the
// same question by the same code: *what style is the `●` on the call head*,
// *which grounds does the echo row carry*, *is the plot boxed*. The answer is a
// string and the comparison is equality, so a difference reads as two values a
// person can check against the picture, not as a score.
//
// **Why readings rather than a whole-grid diff.** A figure draws the design's
// specimen content — `ps --mine`, `a3f9b21` — and a frame draws the tree's, so
// a cell-for-cell comparison differs in every row and says nothing anyone could
// act on (`figures.ts` says the same about lines). What the two must share is
// where each *role* sits and how it is drawn: the mark, the verb, the gutter,
// the wash, the label. A reading locates a role by its structure — the row
// opening `●`, the row under the prompt's upper rule — which is what lets
// `● ps` and `● help` be compared at all.
//
// **The blind spot, stated rather than discovered.** A reading sees only the
// role it locates. A defect in a role no reading names passes, exactly as a
// mark outside M16's alphabet did; the readings are the design-check's fifteen
// items and not a census of the design. And a locator that finds nothing on
// both sides reads `absent` twice and agrees — so every probe's test also
// asserts that each reading found its subject in the figure (`located`), which
// is the half that keeps a vacuous agreement from passing as a match.
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/types.js";
import {
  designGrid,
  frameGrid,
  rowText,
  screenGrid,
  styleOf,
  stylesOf,
  type Cell,
  type Grid,
} from "../../tools/design/cells.js";
import { readStyledScreen } from "./frame-golden.js";
import { atEscapeBoundary, painter } from "./pty.js";
import { DARK_THEME, FULL_CAPS, measurable } from "./render.js";
import { ONE_PER_KIND } from "./blocks.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";

/** What a reading answers when its subject is not in the grid. */
export const ABSENT = "absent";

export type Reading = (g: Grid) => string;

export type Probe = Readonly<{
  /** The design-check report's id (`out/design-check-report.md`, 2026-10-03). */
  item: string;
  /** The section whose figure is the target. */
  section: number;
  /** The figure's rows the readings look at, `[from, to]` inclusive and 0-based — a section can draw several pictures. */
  rows?: readonly [number, number];
  /** What the design specifies, in the report's words. */
  claim: string;
  frame: () => Grid | Promise<Grid>;
  readings: Readonly<Record<string, Reading>>;
}>;

// ── Locators ────────────────────────────────────────────────────────────────

const RULE = /^─{8,}/u;
const isRule = (row: readonly Cell[]): boolean => RULE.test(rowText(row).trim());
const lead = (row: readonly Cell[]): number => row.findIndex((c) => c.ch !== " ");

/** The live prompt: the last row opening `❯` that sits directly under a rule. */
function promptAt(g: Grid): number {
  for (let i = g.length - 1; i > 0; i -= 1) {
    if (/^❯/u.test(rowText(g[i]!).trimStart()) && isRule(g[i - 1]!)) return i;
  }
  return -1;
}

/** The submitted command's echo: the first row opening `❯` that is not the prompt. */
function echoAt(g: Grid): number {
  const prompt = promptAt(g);
  return g.findIndex((row, i) => i !== prompt && /^❯ /u.test(rowText(row).trimStart()));
}

/** The first call head — a row opening `●`. */
const headAt = (g: Grid): number => g.findIndex((row) => /^● /u.test(rowText(row).trimStart()));

const style = (c: Cell | undefined): string => (c === undefined ? ABSENT : styleOf(c));

// ── Readings ────────────────────────────────────────────────────────────────

/** The style of the head's `●`. */
const headMark: Reading = (g) => {
  const at = headAt(g);
  return at < 0 ? ABSENT : style(g[at]![lead(g[at]!)]);
};

/** The style of the head's verb — the word after `●`, up to a space or `(`. */
const headVerb: Reading = (g) => {
  const at = headAt(g);
  if (at < 0) return ABSENT;
  const row = g[at]!;
  const from = lead(row) + 2;
  const verb: Cell[] = [];
  for (let i = from; i < row.length && row[i]!.ch !== " " && row[i]!.ch !== "("; i += 1) verb.push(row[i]!);
  return verb.length === 0 ? ABSENT : stylesOf(verb).join(" + ");
};

/**
 * The head's duration: present, its style, and whether it is fine-grained.
 *
 * **The format is read as a shape, not a value** — `0.3s` and `4.2s` both
 * read `fractional`, because R-BLK-224's claim is *a minimum, not a threshold*:
 * a settled call always says how long it took, to a tenth or finer. A frame
 * that draws `1s`, or nothing under a second, reads `whole` or `absent`.
 */
const headDuration: Reading = (g) => {
  const at = headAt(g);
  if (at < 0) return ABSENT;
  const row = g[at]!;
  const text = row.map((c) => c.ch).join("");
  const m = /(?:^|\s)(\d+(?:\.\d+)?(?:ms|s))(?=\s|$)/u.exec(text);
  if (m === null) return ABSENT;
  const start = text.indexOf(m[1]!, m.index);
  return `${stylesOf(row.slice(start, start + m[1]!.length)).join(" + ")} · ${m[1]!.includes(".") ? "fractional" : "whole"}`;
};

/** The separators on the head row, `·`, as styles. */
const headSeparator: Reading = (g) => {
  const at = headAt(g);
  if (at < 0) return ABSENT;
  const dots = g[at]!.filter((c) => c.ch === "·");
  return dots.length === 0 ? ABSENT : stylesOf(dots).join(" + ");
};

/**
 * What is drawn in the `⎿` column on the entry's body rows — every row after
 * the `⎿` row up to the first blank row or rule. The registry's figures draw
 * the column blank on all 58 body rows; the ruling is that it is blank.
 */
const bodyGutter: Reading = (g) => {
  const at = g.findIndex((row) => row.some((c) => c.ch === "⎿"));
  if (at < 0) return ABSENT;
  const col = g[at]!.find((c) => c.ch === "⎿")!.col;
  const seen = new Set<string>();
  for (let i = at + 1; i < g.length && rowText(g[i]!).trim() !== "" && !isRule(g[i]!); i += 1) {
    seen.add(g[i]!.find((c) => c.col === col)?.ch ?? " ");
  }
  return seen.size === 0 ? ABSENT : [...seen].map((ch) => JSON.stringify(ch)).sort().join(" ");
};

/**
 * The echo row's grounds, every cell but the last column.
 *
 * **The last column is excluded on both sides** because content stops one
 * column before the right edge (C22 I109, `APPEARANCE.md` §15 rule 8) and a
 * figure is drawn narrower than a frame — so a wash that reaches the margin
 * and one that reaches the figure's edge read alike, and a wash that stops at
 * the text reads as two grounds.
 */
const echoGround: Reading = (g) => {
  const at = echoAt(g);
  if (at < 0) return ABSENT;
  const row = g[at]!;
  return [...new Set(row.slice(0, -1).map((c) => (c.bg === "" ? "—" : c.bg)))].sort().join(" + ");
};

const echoMark: Reading = (g) => {
  const at = echoAt(g);
  return at < 0 ? ABSENT : style(g[at]!.find((c) => c.ch === "❯"));
};

const promptMark: Reading = (g) => {
  const at = promptAt(g);
  return at < 0 ? ABSENT : style(g[at]!.find((c) => c.ch === "❯"));
};

/**
 * The label on the prompt's upper rule — its style and how many rule glyphs
 * follow it. `absent` for a bare rule.
 */
const ruleLabel: Reading = (g) => {
  const at = promptAt(g);
  if (at < 1) return ABSENT;
  const row = g[at - 1]!;
  const label = row.filter((c) => c.ch !== "─" && (c.ch !== " " || c.bg !== ""));
  if (label.length === 0) return ABSENT;
  const end = row.indexOf(label[label.length - 1]!);
  const trailing = row.slice(end + 1).filter((c) => c.ch === "─").length;
  return `${stylesOf(label.filter((c) => c.ch !== " ")).join(" + ")} · ${String(trailing)} after`;
};

/** A table's header — the first row naming `status` — over its drawn span, sort marks aside. */
const SORT = new Set(["▾", "▴", "↑", "↓", "▼", "▲"]);
const headerAt = (g: Grid): number => g.findIndex((row) => /\bname\b/u.test(rowText(row)) && /\bstatus\b/u.test(rowText(row)));
const headerGround: Reading = (g) => {
  const at = headerAt(g);
  if (at < 0) return ABSENT;
  const row = g[at]!;
  const from = lead(row);
  const to = row.length - [...row].reverse().findIndex((c) => c.ch !== " ");
  return stylesOf(row.slice(from, to).filter((c) => !SORT.has(c.ch) && c.ch !== " ")).join(" + ");
};

/** The sort mark on the first header row that carries one: glyph and style. */
const headerSort: Reading = (g) => {
  for (const row of g) {
    if (!/\bstatus\b/u.test(rowText(row))) continue;
    const mark = row.find((c) => SORT.has(c.ch));
    if (mark !== undefined) return `${mark.ch} ${styleOf(mark)}`;
  }
  return ABSENT;
};

/** Whether a grid's drawing is boxed: any of the four corners, either weight. */
const CORNERS = /[┌┐└┘╭╮╰╯]/u;
const boxed: Reading = (g) => (g.some((row) => CORNERS.test(rowText(row))) ? "boxed" : "open");

/**
 * A panel's rails: the style of every `│` at the first and last drawn column of
 * the rows strictly between the top and bottom borders.
 */
const panelRail: Reading = (g) => {
  const top = g.findIndex((row) => /^[┌╭]/u.test(rowText(row).trimStart()));
  const bottom = g.findIndex((row, i) => i > top && /^[└╰]/u.test(rowText(row).trimStart()));
  if (top < 0 || bottom < 0) return ABSENT;
  const rails: Cell[] = [];
  for (let i = top + 1; i < bottom; i += 1) {
    const row = g[i]!.filter((c) => c.ch !== " ");
    for (const c of [row[0], row[row.length - 1]]) if (c?.ch === "│") rails.push(c);
  }
  return rails.length === 0 ? ABSENT : stylesOf(rails).join(" + ");
};

/** The completion menu's rows: below the first rule after the header, above the prompt's upper rule. */
function menuRows(g: Grid): readonly (readonly Cell[])[] {
  const prompt = promptAt(g);
  if (prompt < 1) return [];
  let top = prompt - 2;
  while (top > 0 && !isRule(g[top]!)) top -= 1;
  return g.slice(top + 1, prompt - 1).filter((row) => /^[›/ ]/u.test(rowText(row).trimStart()) && rowText(row).includes("/"));
}
const selectedRow = (g: Grid): readonly Cell[] | undefined => menuRows(g).find((row) => rowText(row).trimStart().startsWith("›"));
const otherRows = (g: Grid): readonly (readonly Cell[])[] => menuRows(g).filter((row) => !rowText(row).trimStart().startsWith("›"));

/** Where a menu row's description begins — the first word after a run of two or more spaces past the candidate. */
const descriptionOf = (row: readonly Cell[]): readonly Cell[] => {
  const text = row.map((c) => c.ch).join("");
  const m = /\/\S+(?: \S+)?\s{2,}(\S)/u.exec(text);
  if (m === null) return [];
  const from = m.index + m[0].length - 1;
  const to = text.trimEnd().length;
  return row.slice(from, to);
};

const menuSelected: Reading = (g) => {
  const row = selectedRow(g);
  if (row === undefined) return ABSENT;
  const at = row.findIndex((c) => c.ch === "/");
  return style(row[at]);
};
const menuDescription: Reading = (g) => {
  const ds = otherRows(g).flatMap((row) => descriptionOf(row).filter((c) => c.ch !== " "));
  return ds.length === 0 ? ABSENT : stylesOf(ds).join(" + ");
};
const menuPrefix: Reading = (g) => {
  const row = otherRows(g)[0];
  if (row === undefined) return ABSENT;
  return style(row.find((c) => c.ch === "/"));
};
/** `flush` when every description ends on one column (right-aligned), `ragged` when they do not. */
const menuAlign: Reading = (g) => {
  const ends = menuRows(g).map((row) => {
    const d = descriptionOf(row);
    return d.length === 0 ? -1 : d[d.length - 1]!.col;
  });
  if (ends.length < 2 || ends.includes(-1)) return ABSENT;
  return new Set(ends).size === 1 ? "flush" : "ragged";
};
const menuStatus: Reading = (g) => (g.some((row) => /^\s*\d+ of \d+\s/u.test(rowText(row))) ? "present" : ABSENT);

/** An entry's first drawn glyph — `●` for a call — and whether it is boxed. */
const entryLead: Reading = (g) => {
  const row = g.find((r) => rowText(r).trim() !== "");
  return row === undefined ? ABSENT : row[lead(row)]!.ch;
};

// ── Frames ──────────────────────────────────────────────────────────────────

const ARM = { theme: "dark", caps: { colourDepth: 24 as const } };

/** A built session after `/help`: an echo, a settled call head, a body and the prompt — I2 to I7. */
let transcript: Promise<Grid> | null = null;
const transcriptFrame = (): Promise<Grid> =>
  (transcript ??= readStyledScreen({ columns: 80, rows: 24, drive: ["/help\r"] }, ARM).then((s) => screenGrid(s)));

/** The completion menu open on `/c` — I9. */
let menu: Promise<Grid> | null = null;
const menuFrame = (): Promise<Grid> =>
  (menu ??= readStyledScreen({ columns: 80, rows: 24, drive: ["/c"] }, ARM).then((s) => screenGrid(s)));

/**
 * A block drawn at 24 bits on `dark`. **`table` and `plot` are not default
 * kinds** — C11 and C12 register them — so they are passed, or the kind falls
 * through to `raw` and draws its JSON: the first draft read I8's header as
 * absent from exactly that frame (`render.ts`'s `definitions` says why).
 */
const drawn = (b: Block, width = 78): Grid =>
  frameGrid(
    measurable({
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      definitions: [tableDefinition, plotDefinition] as never,
    }).renderToLines(b, width),
  );

/** §078's first table, its rows and columns, sorted by metric as §078's last figure is. */
const TABLE = block({
  kind: "table",
  id: "t",
  sort: { key: "metric", direction: "desc" },
  columns: [
    { key: "name", label: "name", align: "left", priority: 10, minWidth: 8, sortable: true },
    { key: "status", label: "status", align: "left", priority: 9, minWidth: 6, sortable: true },
    // **Ten, not six**: at six the label and its sort mark do not fit, and the
    // mark is what the cut drops — `metri…` with no arrow — so I8's second
    // reading would read the mark absent for a reason that is not I8's.
    { key: "metric", label: "metric", align: "decimal", priority: 8, minWidth: 10, sortable: true },
    { key: "rows", label: "rows", align: "right", priority: 7, minWidth: 4, sortable: true },
    { key: "age", label: "age", align: "right", priority: 6, minWidth: 3, sortable: true },
  ],
  rows: [
    { id: "a", cells: { name: { text: "parse.ts" }, status: { text: "edited" }, metric: { text: "0.0372" }, rows: { text: "184" }, age: { text: "2m" } } },
    { id: "b", cells: { name: { text: "tokens.ts" }, status: { text: "edited" }, metric: { text: "0.0089" }, rows: { text: "88" }, age: { text: "41m" } } },
    { id: "c", cells: { name: { text: "lexer.ts" }, status: { text: "failed" }, metric: { text: "—" }, rows: { text: "120" }, age: { text: "—" } } },
  ],
});

/**
 * docker-tui under the demo world, through its own recorder (`examples/docker/
 * tools/record.ts`) and folded by `pty.ts`'s painter — the fixture world the
 * media are recorded in, not a second harness.
 *
 * **Imported by a computed specifier**, because the example is its own package
 * with its own `tsconfig.json` (`allowImportingTsExtensions`); a literal import
 * would have the framework's type-check read the example's tree under rules it
 * is not written to. The recorder reads `calcium-tui`, which is `dist/` — the
 * same build the example's own suite reads.
 */
type Recorder = (
  cols: number,
  rows: number,
  script: readonly (readonly [number, Uint8Array])[],
  hold: number,
  env: Readonly<Record<string, string>>,
) => Promise<readonly (readonly [number, Uint8Array])[]>;
const DOCKER_ENV = { COLORTERM: "truecolor", LANG: "C.UTF-8", TERM: "xterm-256color" } as const;
async function dockerFrame(typed: string | null, rows = 34): Promise<Grid> {
  const specifier: string = new URL("../../examples/docker/tools/record.ts", import.meta.url).href;
  const { recordSession } = (await import(specifier)) as { recordSession: Recorder };
  const script = typed === null ? [] : [[4, new TextEncoder().encode(typed)] as const];
  const frames = await recordSession(80, rows, script, 4, DOCKER_ENV);
  const p = painter(80, rows);
  let partial = "";
  for (const [, bytes] of frames) {
    const r = atEscapeBoundary(partial + Buffer.from(bytes).toString("utf8"));
    partial = r.partial;
    if (r.ready) p.apply(r.ready);
  }
  return frameGrid(p.styled());
}

/**
 * A region's rows **without the transcript's last column**, which is the
 * scrollbar's (§021) — the first draft read E13's entry as opening `│`, the
 * track beside an empty row, rather than the entry's own first glyph.
 */
const withoutScrollbar = (rows: Grid): Grid => {
  const width = Math.max(0, ...rows.map((r) => (r.length === 0 ? 0 : r[r.length - 1]!.col + 1)));
  return rows.map((r) => r.filter((c) => c.col < width - 1));
};

/** The rows of a frame between the header rule and the prompt's upper rule — the transcript. */
const transcriptOf = (g: Grid): Grid => {
  const prompt = promptAt(g);
  return withoutScrollbar(g.slice(2, prompt < 1 ? g.length : prompt - 1));
};

/** The entry a command produced: from its echo to the prompt's upper rule, echo excluded. */
const entryOf = (g: Grid): Grid => {
  const echo = echoAt(g);
  const prompt = promptAt(g);
  return withoutScrollbar(g.slice(echo + 1, prompt < 1 ? g.length : prompt - 1));
};

// ── The probes ──────────────────────────────────────────────────────────────

export const PROBES: readonly Probe[] = Object.freeze([
  {
    item: "I1",
    section: 96,
    rows: [11, 14],
    claim: "every panel rail cell is in the frame tone",
    frame: () => drawn(ONE_PER_KIND.panel, 48),
    readings: { "panel.rail": panelRail },
  },
  {
    item: "I2",
    section: 81,
    claim: "a call head is toned per token — the mark in the state tone, the verb in default ink",
    frame: transcriptFrame,
    readings: { "head.mark": headMark, "head.verb": headVerb },
  },
  {
    item: "I3",
    section: 81,
    claim: "a settled duration is always present and fine-grained, muted, between muted separators",
    frame: transcriptFrame,
    readings: { "head.duration": headDuration, "head.separator": headSeparator },
  },
  {
    item: "I4",
    section: 81,
    claim: "the gutter under ⎿ is blank on every body row",
    frame: transcriptFrame,
    readings: { "body.gutter": bodyGutter },
  },
  {
    item: "I5",
    section: 81,
    claim: "the sent command's echo is washed in bgElev across the row, its ❯ in default ink on the wash",
    frame: transcriptFrame,
    readings: { "echo.ground": echoGround, "echo.mark": echoMark },
  },
  {
    item: "I6",
    section: 81,
    claim: "the prompt's ❯ is muted",
    frame: transcriptFrame,
    readings: { "prompt.mark": promptMark },
  },
  {
    item: "I7",
    section: 69,
    rows: [2, 4],
    claim: "the prompt's upper rule carries the app's name by default, on bgElev, one rule glyph after it",
    frame: transcriptFrame,
    readings: { "rule.label": ruleLabel },
  },
  {
    item: "I8",
    section: 78,
    claim: "the table header is muted bold on bgElev, and the sort mark is ▾ in accent bold",
    frame: () => drawn(TABLE, 60),
    readings: { "header.ground": headerGround, "header.sort": headerSort },
  },
  {
    item: "I9",
    section: 29,
    claim: "the completion menu: descriptions muted in a left column, the prefix accent bold, a status row",
    frame: menuFrame,
    readings: {
      "menu.selected": menuSelected,
      "menu.description": menuDescription,
      "menu.prefix": menuPrefix,
      "menu.align": menuAlign,
      "menu.status": menuStatus,
    },
  },
  {
    item: "I10",
    section: 49,
    rows: [1, 7],
    claim: "a plot is framed by its axes; the box is opt-in",
    frame: () => drawn(ONE_PER_KIND.plot, 48),
    readings: { "plot.frame": boxed },
  },
  {
    item: "E13",
    section: 80,
    rows: [12, 17],
    claim: "docker-tui's startup is a call and rows, not framed panels",
    frame: async () => transcriptOf(await dockerFrame(null)),
    readings: { "entry.lead": entryLead, "entry.frame": boxed },
  },
  {
    item: "E14",
    section: 85,
    rows: [38, 43],
    claim: "/container stats is a few rows under a call head, not framed panels",
    frame: async () => entryOf(await dockerFrame("/container stats worker\r", 60)),
    readings: { "entry.lead": entryLead, "entry.frame": boxed },
  },
]);

/**
 * The report's items no reading can take, each with what the registry lacks.
 *
 * **Measured, not assumed** — each was looked for in the registry before it
 * was put here, and the reason names what was found.
 */
export const UNSUPPORTED: Readonly<Record<string, string>> = Object.freeze({
  I11:
    "no figure draws a namespaced verb: every call head in the registry's sectionBlocks names a one-word verb (`ps`, `submit`, `logs`, `read_file`), so `container stats(worker)` against `container stats(stats worker)` has no design-side cell to compare. F1430 holds it with b5-shell's row",
  I12:
    "the defect is a binding, not an appearance: the profiler card's hint names `n`/`p`, which no keymap entry binds. The registry carries bindings, but the card has no figure, so the comparison has no cell to read; R-INT-002 is a rule over the keymap and b5-dshell's class check is its gate",
  E15:
    "a media recipe (`examples/plots/tools/media.py`) sends `n` four times to a pushed view M9 retired; it draws nothing the registry has a figure of",
});

/** The design-check report's items, in its order (`out/design-check-report.md`, 2026-10-03). */
export const REPORT_ITEMS: readonly string[] = Object.freeze([
  "I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9", "I10", "I11", "I12", "E13", "E14", "E15",
]);

/** The figure a probe reads: its section's grid, cut to `rows` when it names some. */
export function figureOf(p: Probe, root = "."): Grid {
  const g = designGrid(p.section, root);
  return p.rows === undefined ? g : g.slice(p.rows[0], p.rows[1] + 1);
}
