/**
 * The design's figures against the golden frames that claim to draw them
 * (`DESIGN_FIXTURES.md` §The figure, review batch 4 M16.1).
 *
 *     npx tsx tools/design/figures.ts            # print every difference; exit 1 if the file disagrees
 *     npx tsx tools/design/figures.ts --write    # re-derive design-differences.json, keeping each reason
 *
 * **What this compares, and why marks rather than lines.** A figure draws the
 * design's specimen content — `seams`, `parse.ts`, `qwen3-coder-next` — and a
 * golden draws the repository's own, so a comparison by line differs in every
 * row and says nothing a reader could act on. What the two must share is the
 * design language itself: the glyphs, the box-drawing, the bar alphabets, the
 * separators. So the difference is **the marks each side draws that the other
 * does not**, a mark being any grapheme with a code point outside ASCII that is
 * not a letter or a number. `R-SEC-099` is the authority for leaving the words
 * out: *specimen values and sample content remain examples*.
 *
 * **Where a frame is found.** A golden that is indexed by the design's sections
 * heads each surface `── §N · …` (`design-surfaces.test.ts`), and that heading
 * is the locator: the frame is every line under it, in the target's snapshot,
 * at the `dark-unicode` rung — the rung the fixtures are drawn at — and at the
 * narrowest golden width not narrower than the figure. **Width is `cells()`**,
 * the measurer's own implementation, so a figure with a wide glyph picks the
 * rung a terminal would need. A target indexed by kind, by state or by scene
 * has no such heading, and its row is **unlocated**: that is a difference too,
 * because *this file draws it* is then a claim nothing can compare.
 *
 * **The file of allowed differences is compared by equality**, in both
 * directions, so a stale entry fails as surely as a missing one; `--write` is
 * the one command that re-derives it, and it carries a reason across only while
 * the entry keeps its kind — a row that became locatable, or stopped being, has
 * a reason about the other state and must be read again.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cells, graphemes } from "../../src/presentation/text.js";

export const MAP = "test/golden/DESIGN_FIXTURES.md";
export const FIXTURES = "docs/design/language/fixtures";
export const SNAPSHOTS = "test/golden/__snapshots__";
export const DIFFERENCES = "test/golden/design-differences.json";
/** The rung a figure is compared at: Unicode, colour stripped, which is what the fixtures draw. */
export const RUNG = "dark-unicode";

export type Row = Readonly<{
  section: number;
  cls: string;
  built: string;
  target: string;
  figure: string;
}>;

/**
 * The table, parsed — `| § | class | built | target | figure | why |`.
 *
 * **A cell may hold an escaped pipe**, because a probe is an alternation and
 * the `built` column carries it. `[^|]+` stops at the byte whatever markdown
 * means by the backslash, and it silently dropped the two rows whose probe had
 * one — caught by the membership row, which is what it is for.
 */
export function rows(root = "."): readonly Row[] {
  const doc = readFileSync(join(root, MAP), "utf8");
  const body = doc.slice(doc.indexOf("## The table"), doc.indexOf("## The two with no fixture"));
  const cell = String.raw`(?:[^|\\]|\\.)+`;
  const re = new RegExp(
    String.raw`^\| (\d+) \| (\w+) \| (${cell}) \| (${cell}) \| (${cell}) \|`,
    "gmu",
  );
  return [...body.matchAll(re)].map((m) => ({
    section: Number(m[1]),
    cls: m[2]!,
    built: m[3]!.trim(),
    target: m[4]!.trim(),
    figure: m[5]!.trim(),
  }));
}

/**
 * **A row is framed when a golden draws a surface that exists** — the class is
 * `surface`, the probe is not `no`, and a target is named. `built: no` with a
 * target is a frame of something the tree does not have, which is a census or
 * an absence and not the fixture's picture (M16.1).
 */
export const framed = (r: Row): boolean => r.cls === "surface" && r.built !== "no" && r.target !== "—";

/** `3-11, 14-15` → `[[3, 11], [14, 15]]`; `null` when the cell is not that shape. */
export function ranges(figure: string): readonly (readonly [number, number])[] | null {
  const parts = figure.split(",").map((p) => p.trim());
  const out: [number, number][] = [];
  for (const p of parts) {
    const m = /^(\d+)(?:-(\d+))?$/u.exec(p);
    if (m === null) return null;
    out.push([Number(m[1]), Number(m[2] ?? m[1])]);
  }
  return out;
}

/** The fixture file for a section — `INDEX.json`'s record, not a guessed name. */
function fixtureFile(root: string, section: number): string | undefined {
  const index = JSON.parse(readFileSync(join(root, FIXTURES, "INDEX.json"), "utf8")) as {
    section: number;
    file: string;
  }[];
  return index.find((f) => f.section === section)?.file;
}

/** The figure's lines, by its ranges. */
export function figureLines(root: string, r: Row): readonly string[] {
  const file = fixtureFile(root, r.section);
  const spans = ranges(r.figure);
  if (file === undefined || spans === null) return [];
  const lines = readFileSync(join(root, FIXTURES, file), "utf8").split("\n");
  return spans.flatMap(([a, b]) => lines.slice(a - 1, b));
}

/**
 * A mark: a grapheme carrying a code point outside ASCII that is not a letter or
 * a number. `graphemes()` is the measurer's segmentation, so a mark with a
 * variation selector is one mark, as it is one cell run on screen.
 */
export function marks(lines: readonly string[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const line of lines) {
    for (const g of graphemes(line)) {
      if (/^[\x00-\x7f]*$/u.test(g)) continue;
      if (/^[\p{L}\p{N}\p{M}]+$/u.test(g)) continue;
      out.add(g);
    }
  }
  return out;
}

/** Snapshot entries, keyed, with vitest's template-literal escaping undone. */
function snapshotEntries(path: string): ReadonlyMap<string, string> {
  const src = readFileSync(path, "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^exports\[`((?:[^`\\]|\\.)*)`\] = `\n?([\s\S]*?)`;$/gmu)) {
    const body = m[2]!
      .replaceAll("\\`", "`")
      .replaceAll("\\${", "${")
      .replaceAll("\\\\", "\\")
      .replace(/^"/u, "")
      .replace(/"\n?$/u, "");
    out.set(m[1]!, body);
  }
  return out;
}

/** The target's golden, the rung's frames by width: `{ 40 → text, 80 → text }`. */
function rungFrames(root: string, target: string): ReadonlyMap<number, string> {
  const name = `${target.replaceAll("`", "")}.snap`;
  const files = readdirSync(join(root, SNAPSHOTS));
  const out = new Map<number, string>();
  if (!files.includes(name)) return out;
  for (const [key, body] of snapshotEntries(join(root, SNAPSHOTS, name))) {
    const m = new RegExp(`> ${RUNG} at (\\d+) 1$`, "u").exec(key);
    if (m !== null) out.set(Number(m[1]), body);
  }
  return out;
}

/**
 * Every line under a `── §N ·` heading, up to the next heading; a section drawn
 * twice is both. **A caption is not the frame**: `design-surfaces` opens each
 * pass with a line beginning `· ` that says what the pass shows, in the
 * repository's words, and its `—` and its `▸` would otherwise count as marks the
 * frame draws.
 */
function underHeading(frame: string, section: number): readonly string[] | null {
  const lines = frame.split("\n");
  const out: string[] = [];
  let inside = false;
  let found = false;
  for (const line of lines) {
    const head = /^── §(\d+) · /u.exec(line);
    if (head !== null) {
      inside = Number(head[1]) === section;
      found ||= inside;
      continue;
    }
    if (inside && !line.startsWith("· ")) out.push(line);
  }
  return found ? out : null;
}

/** A figure's width: its widest line in **cells**, so a wide glyph counts two, as a terminal draws it. */
export function figureWidth(lines: readonly string[]): number {
  return Math.max(0, ...lines.map((l) => cells(l)));
}

/** The narrowest golden width not narrower than the figure, or the widest there is. */
export function rungWidth(widths: readonly number[], figureCells: number): number | undefined {
  const sortedWidths = [...widths].sort((a, b) => a - b);
  return sortedWidths.find((w) => w >= figureCells) ?? sortedWidths.at(-1);
}

export type Difference =
  | Readonly<{
      section: number;
      target: string;
      width: number;
      figureCells: number;
      figureOnly: readonly string[];
      frameOnly: readonly string[];
      reason: string;
    }>
  | Readonly<{ section: number; target: string; unlocated: true; reason: string }>;

/**
 * A set of marks as the file records it: each mark beside its code points,
 * because `—` and `―`, or `─` and `━`, are different marks that a reader of a
 * diff cannot tell apart — and a collision is a dropped input.
 */
const listed = (s: ReadonlySet<string>): readonly string[] =>
  [...s]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((g) => `${g} ${[...g].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ")}`);

/**
 * Every framed row's difference, in section order, with an empty reason — the
 * reasons are the file's, and only a person writes one.
 */
export function differences(root = "."): readonly Difference[] {
  const out: Difference[] = [];
  // **Each golden parsed once**, not once per row: twenty-odd rows share one
  // four-thousand-line snapshot, and a source walk repeated per row is what
  // made T1.5 the row a loaded lane timed out.
  const byTarget = new Map<string, ReadonlyMap<number, string>>();
  for (const r of rows(root).filter(framed)) {
    const target = r.target.replaceAll("`", "");
    if (!byTarget.has(target)) byTarget.set(target, rungFrames(root, target));
    const frames = byTarget.get(target)!;
    const figure = figureLines(root, r);
    const figureCells = figureWidth(figure);
    const width = rungWidth([...frames.keys()], figureCells);
    const drawn = width === undefined ? null : underHeading(frames.get(width)!, r.section);
    if (width === undefined || drawn === null) {
      out.push({ section: r.section, target, unlocated: true, reason: "" });
      continue;
    }
    const want = marks(figure);
    const have = marks(drawn);
    const figureOnly = new Set([...want].filter((g) => !have.has(g)));
    const frameOnly = new Set([...have].filter((g) => !want.has(g)));
    if (figureOnly.size === 0 && frameOnly.size === 0) continue;
    out.push({
      section: r.section,
      target,
      width,
      figureCells,
      figureOnly: listed(figureOnly),
      frameOnly: listed(frameOnly),
      reason: "",
    });
  }
  return out;
}

/** The checked-in file's entries. */
export function allowed(root = "."): readonly Difference[] {
  return (JSON.parse(readFileSync(join(root, DIFFERENCES), "utf8")) as { differences: Difference[] })
    .differences;
}

/** An entry without its reason — the part the tree decides, and the part compared by equality. */
export function measured(d: Difference): Omit<Difference, "reason"> {
  const { reason: _reason, ...rest } = d;
  return rest;
}

const kind = (d: Difference): string => ("unlocated" in d ? "unlocated" : "located");

/**
 * The derived list, each entry keeping the reason the file gives its section
 * **while it keeps its kind**; a new entry, or one that changed kind, has an
 * empty reason, and T1.8 refuses an empty reason.
 */
export function rederive(root = "."): readonly Difference[] {
  let prior: readonly Difference[] = [];
  try {
    prior = allowed(root);
  } catch {
    prior = [];
  }
  return carry(prior, differences(root));
}

/** `rederive`'s rule alone, over two lists, so a row can hold it without a tree to derive from. */
export function carry(prior: readonly Difference[], now: readonly Difference[]): readonly Difference[] {
  const was = new Map(prior.map((d) => [d.section, d]));
  return now.map((d) => {
    const old = was.get(d.section);
    return old !== undefined && kind(old) === kind(d) ? { ...d, reason: old.reason } : d;
  });
}

/** The marks alone, for a line of output; `(none)` rather than a dash, which is itself a mark. */
const short = (l: readonly string[]): string => (l.length === 0 ? "(none)" : l.map((m) => m.split(" ")[0]).join(" "));

function main(): void {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  if (process.argv.includes("--write")) {
    const next = rederive(root);
    const doc = {
      about:
        "The differences between each framed fixture's figure and its golden frame that are allowed, "
        + "each with its reason. Compared by equality in both directions by design-fixtures T1.7 and "
        + "T1.8; re-derived by `npx tsx tools/design/figures.ts --write`, which keeps a reason only "
        + "while its entry keeps its kind. See DESIGN_FIXTURES.md §The figure.",
      rung: RUNG,
      differences: next,
    };
    writeFileSync(join(root, DIFFERENCES), `${JSON.stringify(doc, null, 1)}\n`);
    const blank = next.filter((d) => d.reason === "").map((d) => `§${String(d.section)}`);
    console.log(`figures · ${String(next.length)} differences written`);
    if (blank.length > 0) console.log(`  owed a reason: ${blank.join(" ")}`);
    return;
  }
  const now = differences(root).map(measured);
  const file = allowed(root).map(measured);
  const same = JSON.stringify(now) === JSON.stringify(file);
  for (const d of differences(root)) {
    console.log(
      "unlocated" in d
        ? `§${String(d.section)}  unlocated in ${d.target}`
        : `§${String(d.section)}  at ${String(d.width)} (figure ${String(d.figureCells)} cells)  figure only: ${short(d.figureOnly)}  frame only: ${short(d.frameOnly)}`,
    );
  }
  console.log(same ? "figures · the file agrees" : "figures · FAIL — the file disagrees; run with --write");
  process.exitCode = same ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
