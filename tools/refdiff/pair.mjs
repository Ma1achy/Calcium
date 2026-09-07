/**
 * `make refdiff` — every form beside its braille-rendered matplotlib twin.
 *
 * **A gate, not a procedure someone remembers.** The rule is that no form
 * counts as done until it has been compared against two references, and a rule
 * remembered per form lapses on the thirty-fifth. This is the half that can be
 * automated: the desktop reference, rendered to characters, on the same grid.
 *
 * **What makes the diff mean anything is that both sides are furniture-free.**
 * Calcium renders with `axes: false`, which is exactly the plot area and
 * nothing else; matplotlib renders into a full-bleed axes with `axis("off")`.
 * Both then occupy `COLS x ROWS` cells and the same cell means the same data
 * coordinate on both sides. Compared with furniture on, every form differs on
 * every row and the output says nothing.
 *
 * **The two containers are driven from the Makefile, not from here.** Each step
 * is a line with its own exit code — `make refdiff` fails on the one that broke
 * rather than on a pipeline's last status, which is the trap that once reported
 * green while 44 tier-5 rows failed.
 *
 * The braille half is a *coverage* mask — a cell is inked or not — so this
 * cannot check colour, and does not try. It answers one question: is the shape
 * in the right place. Run the first time, that separated our line curve (which
 * sat exactly where matplotlib's did) from the frame around it (which did not
 * exist), and those are different bug lists.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOGUE_FORMS } from "../catalogue-forms.js";
import { EXTRA_VARIANTS, UNISOLABLE } from "./export-fixtures.js";

const root = join(import.meta.dirname, "..", "..");
const work = join(root, ".refdiff");
const outDir = join(root, "docs", "refdiff");
/**
 * **The reference frames are committed, and this is the only copy the gate
 * reads.** `.refdiff/` is the throwaway work directory a second container
 * fills, and RD5 — *every form is compared or carries a stated reason* — used
 * to read matplotlib's output straight from it. So RD5 was green on a machine
 * that had run `make refdiff` and reported every form missing on one that had
 * not, which is every CI run from 2026-08-23. A comparison's reference is its
 * record, not its scratch: `make refdiff` refreshes this directory from the
 * work directory and the diff says which references moved.
 */
const referenceDir = join(outDir, "reference");

/** The extent profile — the rightmost end of each distinct left-anchored band.
 *
 * **Cell-by-cell ink is the wrong measure for a categorical form, and the bar
 * chart is what showed it.** Ours draws one row per category and leaves the
 * rest of the height blank; matplotlib gives each category a proportional band
 * filling the figure. Every bar length agreed to within a cell and the ink
 * measure still called it 55.9% different, because it was comparing *layout*.
 *
 * **The *leading* run, not the rightmost ink.** `barRow` appends a value
 * readout at the right edge, so the rightmost inked cell of every bar is its
 * label — five different bars all reported the same extent and the profile
 * collapsed to one entry. The readout is a number printed beside the geometry,
 * not part of it, and matplotlib's equivalent is off by default.
 *
 * A row not beginning with ink contributes nothing, and a form yielding fewer
 * than two bands is reported incomparable rather than compared. That is how a
 * centred form like `funnel` excludes itself without being named here.
 */
export function extentProfile(mask) {
  const ends = [];
  for (const row of mask) {
    if (row[0] !== "#") continue;
    const gap = row.indexOf(".");
    const end = gap < 0 ? row.length : gap;
    if (ends[ends.length - 1] !== end) ends.push(end);
  }
  const max = Math.max(1, ...ends);
  return ends.map((e) => e / max);
}

/**
 * Mean absolute difference of two extent profiles, or **why not**.
 *
 * **It reports `—` for every form it was written for, and always has.** The
 * measure exists because ink called `bar` 51% different while every bar length
 * agreed — and `bar`, `histogram`, `waffle`, `waterfall` and `bullet` have shown
 * a bare dash since the day it landed. A dash that does not say why reads as
 * *this form has no bands*, which is the opposite of the truth: they have bands
 * and the two sides count a different number of them, because matplotlib draws a
 * proportional band over several raster rows and the run-length collapse lands
 * on a boundary differently at each end.
 *
 * Returning the reason does not fix the comparison. It makes the next person's
 * first question answerable from the table instead of from the source, which is
 * the whole of what an instrument owes when it declines to measure.
 */
export function extentError(a, b) {
  const x = extentProfile(a), y = extentProfile(b);
  if (x.length < 2 || y.length < 2) {
    return { why: `fewer than two bands — ours ${x.length}, theirs ${y.length}` };
  }
  if (x.length !== y.length) {
    return { why: `${x.length} bands vs ${y.length}` };
  }
  return { value: x.reduce((n, v, i) => n + Math.abs(v - y[i]), 0) / x.length };
}

/** Fraction of cells where exactly one side has ink, over the form's own grid. */
export function disagreement(a, b, rows, cols) {
  let differ = 0, total = 0;
  for (let r = 0; r < rows; r++) {
    const x = a[r] ?? "", y = b[r] ?? "";
    for (let c = 0; c < cols; c++) {
      total++;
      if ((x[c] ?? ".") !== (y[c] ?? ".")) differ++;
    }
  }
  return total === 0 ? 1 : differ / total;
}

export function referenceRows(form) {
  const p = join(referenceDir, `${form}.txt`);
  if (!existsSync(p)) return undefined;
  return readFileSync(p, "utf8").replace(/\n$/, "").split("\n").map((r) => inkMask(r));
}

export function inkMask(row) {
  return [...row].map((ch) => (ch === " " || ch === "\u2800" ? "." : "#")).join("");
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const { cols: COLS, ours: OURS, grid: GRID } =
    JSON.parse(readFileSync(join(work, "ours.json"), "utf8"));
  mkdirSync(outDir, { recursive: true });
  // Refresh the committed references from the work directory before reading
  // them — clearing first, so a reference for a form that no longer renders
  // leaves a deletion in the diff (F275's rule, one directory along).
  mkdirSync(referenceDir, { recursive: true });
  for (const f of readdirSync(referenceDir)) if (f.endsWith(".txt")) rmSync(join(referenceDir, f));
  for (const f of readdirSync(join(work, "out"))) {
    if (f.endsWith(".txt")) copyFileSync(join(work, "out", f), join(referenceDir, f));
  }
  const report = [];
  let compared = 0, missing = 0;
  // **Keyed by `form` or `form.variant`**, because a *style* can only ever be a
  // variant and both halves used to take the first of each form (F183).
  for (const form of [...Object.keys(CATALOGUE_FORMS), ...EXTRA_VARIANTS]) {
    const why = UNISOLABLE.get(form.split(".")[0]);
    if (why !== undefined) { missing++; report.push({ form, skipped: why }); continue; }
    const ours = OURS[form];
    const theirs = referenceRows(form);
    if (ours === undefined || theirs === undefined) {
      missing++;
      report.push({ form, skipped: "no reference renderer — see reference.py SKIPPED" });
      continue;
    }
    const rows = GRID[form];
    const d = disagreement(ours, theirs, rows, COLS);
    const e = extentError(ours, theirs);
    compared++;
    report.push({ form, disagreement: d, extent: e, rows });

    const pane = [`── ${form} · calcium (left) vs matplotlib→braille (right) · ${COLS}x${rows}`,
      `   cells disagreeing: ${(d * 100).toFixed(1)}%`,
      `   extent profile:    ${e.value === undefined ? `incomparable — ${e.why}` : `${(e.value * 100).toFixed(1)}% mean error`}`,
      ""];
    for (let r = 0; r < rows; r++) {
      pane.push(`${(ours[r] ?? "").padEnd(COLS)} │ ${theirs[r] ?? ""}`);
    }
    writeFileSync(join(outDir, `${form}.txt`), `${pane.join("\n")}\n`);
  }

  report.sort((a, b) => (b.disagreement ?? -1) - (a.disagreement ?? -1));
  const lines = ["# refdiff — every form beside its matplotlib twin", "",
    "Generated by `make refdiff`. Both sides are furniture-free and on the same",
    "cell grid — **the grid our renderer produced**, per form, because a fixed one",
    "silently padded `sparkline`'s single row against sixteen of matplotlib's.", "",
    "**Two measures, because one of them is wrong for half the forms.**", "",
    "- **ink** — cells where exactly one side drew something. The geometry check,",
    "  right for the positional family, where both draw a curve into shared 2-D space.",
    "- **extent** — how far each left-anchored band reaches, normalised.",
    "  Layout-invariant.", "",
    "The bar chart is why the second exists: ours is one row per category and",
    "matplotlib's a proportional band, so **ink called it 55.9% different while every",
    "bar length agreed to within a cell**. A number that flags a correct form is worse",
    "than no number, because the next person tunes the form to it.", "",
    "Neither is pass/fail. They are a ranking, and a form that moves *up* after a",
    "change is the signal.", "",
    "**One variant per form, plus the named extras** — the first of each, which is",
    "what both halves independently took before F183 and is why a *style* was",
    `uncomparable: a candlestick is \`form: "line"\`. The extras are \`EXTRA_VARIANTS\``,
    "in `export-fixtures.ts`. So this table ranks",
    `**${String(Object.keys(CATALOGUE_FORMS).length + EXTRA_VARIANTS.length)} of ${String(Object.values(CATALOGUE_FORMS).reduce((n, v) => n + Object.keys(v).length, 0))} catalogue variants**, and the rest are unread rather than passing —`,
    "adding one means adding a reference renderer beside it.", "",
    "**The matplotlib frames are committed under `reference/`** — the record the",
    "gate compares against, refreshed by `make refdiff`. Only the side-by-side",
    "text beside this file is generated and ignored.", "",
    "| form | grid | ink | extent |", "|---|---|---|---|"];
  for (const r of report) {
    if (r.skipped !== undefined) { lines.push(`| ${r.form} | — | — | *${r.skipped}* |`); continue; }
    const ext = r.extent.value === undefined ? `— *${r.extent.why}*` : `${(r.extent.value * 100).toFixed(1)}%`;
    lines.push(`| ${r.form} | ${COLS}x${r.rows} | ${(r.disagreement * 100).toFixed(1)}% | ${ext} |`);
  }
  writeFileSync(join(outDir, "README.md"), `${lines.join("\n")}\n`);
  process.stdout.write(`refdiff — ${String(compared)}/${String(compared + missing)} rows compared -> docs/refdiff/\n`);
}
