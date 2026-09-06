/**
 * T1 — **the terminal arm's full output, committed, before the pass touches it**
 * (`CALCIUM_ARM_UNIFICATION.md` §6b).
 *
 * The arm unification pass moves every decision above the shared coordinate out
 * of both renderers. §6b's constraint is that **the terminal arm is a refactor
 * and nothing else**: byte-identical at every capability rung, per commit. This
 * writes the thing that constraint is checked against.
 *
 * **Why not the catalogue, which already renders every form at every capability
 * set.** `docs/catalogue/` is in `.gitignore` (F257), so a frame that moved and a
 * frame that was never written look identical to git. `catalogue-hash.mjs` answers
 * *did anything move* and cannot answer *what* — and §6b's rule is that a moved
 * frame is **read** before anything else happens. A digest cannot be read. So the
 * frames themselves are tracked, and the diff names the form.
 *
 * **Why not the golden suite, which is tracked.** It is a subset: `ONE_PER_FORM`
 * at two widths and two capability sets, plus the vertical and candlestick
 * corpora — 377 rows against this corpus's 1780. It does not cross every form
 * against every rung, and F256 measured a gate passing against a deliberately
 * broken refactor because **no frame in either corpus took the branch it moved**.
 *
 * **Crossed on width as well as capability set, and that is the difference from
 * the catalogue.** The catalogue takes one width per capability set, which is
 * right for reading. But the truncation ladder, the `+N` notices and the label
 * allowance are **width** decisions — §6b lists them among the rungs where the
 * refactor will actually break — and a corpus that never constructs a truncation
 * cannot gate T4. Two widths per set is what makes those cases exist at all.
 *
 * **`.txt` and not `.plain`**: SGR included, because §6b says *every colour*.
 *
 * Run: npx tsx tools/terminal-baseline.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPS, FORMS, clearGenerated, everyFrame } from "./plot-catalogue.mjs";

/**
 * The baseline's width policy — **narrow and full, per capability set.**
 *
 * 40 is the narrow arm every truncation rung lives on; it is the same width the
 * golden suite's narrow half takes, so the two corpora are commensurable. The
 * full width is the catalogue's own: 60 for `wide`, because that arm draws every
 * ambiguous glyph two cells, and 80 for the rest.
 */
export const BASELINE_WIDTHS = (capsName) => [40, capsName === "wide" ? 60 : 80];

export const BASELINE_DIR = join(import.meta.dirname, "..", "test", "golden", "terminal-baseline");

/** The name a frame is committed under. **The width is in it**, or two widths collide. */
export function baselineName(f) {
  return `${f.formName}-${f.variantName}-${f.capsName}-${String(f.width)}w.txt`;
}

/**
 * Every frame the baseline holds, as `name → bytes`.
 *
 * **A map rather than a write**, so the gate can build the same thing in memory
 * and compare without a filesystem — and so *what the corpus is* has one
 * definition that both the writer and the checker read. A checker that walked the
 * committed directory alone would agree with a corpus that had silently shrunk.
 */
export function baselineFrames() {
  const out = new Map();
  for (const f of everyFrame(BASELINE_WIDTHS)) out.set(baselineName(f), f.frame + "\n");
  return out;
}

/**
 * How many frames the corpus should hold — **derived, never a literal.**
 *
 * The gate's job is *did every frame get compared*, and a hardcoded 1780 answers
 * that with a number written when the corpus was a different size. Adding a form
 * to `CATALOGUE_FORMS` must move this, or the gate reports full coverage of a
 * corpus it has stopped covering — F256's lesson stated as a count instead of a
 * branch.
 */
export function expectedCount() {
  let variants = 0;
  for (const vs of Object.values(FORMS)) variants += Object.keys(vs).length;
  let perVariant = 0;
  for (const { name } of CAPS) perVariant += BASELINE_WIDTHS(name).length;
  return variants * perVariant;
}

export function writeBaseline(dir = BASELINE_DIR) {
  mkdirSync(dir, { recursive: true });
  // **Cleared before writing**, which is `plot-catalogue.mjs`'s own correction:
  // a removed fixture leaves its frame behind, and a generator that only ever
  // writes cannot say what it did not write. Here the directory is tracked, so a
  // frame that should have vanished shows up as a deletion in the diff rather
  // than sitting in the corpus being compared against.
  const stale = clearGenerated(dir);
  const frames = baselineFrames();
  for (const [name, bytes] of frames) writeFileSync(join(dir, name), bytes);
  return { written: frames.size, stale };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const i = process.argv.indexOf("--dir");
  const dir = i === -1 ? BASELINE_DIR : process.argv[i + 1];
  const { written, stale } = writeBaseline(dir);
  console.log(`terminal baseline: ${String(written)} frames written (${String(stale)} stale cleared first)`);
}
