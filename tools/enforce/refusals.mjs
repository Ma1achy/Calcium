// SS54 — the refusal register: a refusal whose premise is a negative-existence
// claim names the symbol, and the suite asserts the symbol is still absent.
//
// **Four prose refusals expired unnoticed in one campaign.** Italic had *no
// consumer* and gained one; thirty-five chart types had *no consumer* and one
// arrived; `graphLayout: "force"` was refused *until `shiftInward`*; `axesAt3`
// was refused on a premise about the axis count. Every one was written as a
// sentence in a table cell, and a sentence in a table cell is read by nobody
// after the day it is written. The 127 code-list refusals in this directory —
// `UNCONSUMED_MEMBERS`, `MARK_EXEMPTIONS`, `ACKNOWLEDGED_BACKLOG` — never expire
// unnoticed, because each has an equality arm. The prose ones had nothing.
//
// **The ruling divides refusals by what their premise is about.** A premise of
// the form *X does not exist*, *nothing sets X*, *no consumer of X* is a claim
// about the tree, and a claim about the tree can be resolved against it: the
// entry names the symbol and this asserts it is still absent — or, for a refusal
// resting on something the tree *does* have (an internal mechanism standing in
// for a package), still present. A premise of the form *a novelty*, *low value*,
// *not worth its supply chain* is a judgement, and no grep settles a judgement:
// the entry is marked `unverifiable` with the reason, and the count of those is
// **reported, not gated** — a number that grows is a register turning into a
// list of opinions.
//
// **Stated blind spot, and it is the register's whole shape**: this checks the
// symbol, not the reason. A refusal can be true and its reason irrelevant —
// MG24's scope was justified by a sentence that was true about satisfying a type
// and irrelevant to consuming a member (CLAUDE.md, *a correct sentence justifying
// the wrong decision*). `shiftInward` staying absent says the expiry has not
// arrived; it says nothing about whether `force` should still be refused when it
// does. And the 176 finding sections in `examples/docker/FINDINGS.md` that carry
// a refusal have no verdict field, so they are outside this by construction —
// the register holds what someone moved into it, and nothing sweeps prose for
// refusals it has not been told about.
//
// **A second, narrower limit**: a symbol is a literal substring bounded by
// non-identifier characters, matched against `src/` with comments stripped.
// `codec.ts` exports `DECODE_JPEG_IS_NOT_BUILT = "decodeJpeg"` so the deferral
// can be grepped — a string literal, which the comment strip keeps — so the
// entry names `decodeJpeg(`, the call form, rather than the bare name. A matcher
// that sees one encoding reports absence when the value changes form; the entry
// records which form it watches.
import { readFileSync, readdirSync, statSync } from "node:fs";

/**
 * The register. Each entry: where the refusal is written, its premise, and why.
 *
 * `premise` is exactly one of:
 *   - `{ absent: symbol }`  — the refusal holds while `symbol` is not in the tree
 *   - `{ present: symbol }` — the refusal holds while `symbol` is in the tree
 *   - `{ unverifiable: reason }` — a judgement; counted and never gated
 *
 * `in` narrows where the symbol is looked for: `"src"` (default, comments
 * stripped) or `"package.json"` (the dependency tables, where a refused package
 * would appear).
 */
export const REFUSALS = Object.freeze([
  // --- DEPENDENCIES.md § Not installed -------------------------------------
  { id: "R1", where: "DEPENDENCIES.md § Not installed · a grapheme splitter",
    premise: { present: "Intl.Segmenter" },
    why: "built into Node 18+; the refusal rests on the built-in being what C09 and C17 use" },
  { id: "R2", where: "DEPENDENCIES.md § Not installed · a grapheme splitter",
    premise: { absent: "grapheme-splitter", in: "package.json" },
    why: "the package the row refuses, by name" },
  { id: "R3", where: "DEPENDENCIES.md § Not installed · an East Asian width table",
    premise: { present: "function isWide(" },
    why: "~60 lines internal; the refusal rests on the internal table existing" },
  { id: "R4", where: "DEPENDENCIES.md § Not installed · a colour library",
    premise: { present: "nearestAnsi256" },
    why: "C10 defines the quantisation; the refusal rests on the internal arithmetic being the one the theme validates against" },
  { id: "R5", where: "DEPENDENCIES.md § Not installed · a date library",
    premise: { unverifiable: "names a class of package rather than one; the need is removed by SS1, which is the gate" },
    why: "the no-ambient-clock rule removes the need — SS1 already fails any clock read, so a second gate here would check nothing SS1 does not" },
  { id: "R6", where: "DEPENDENCIES.md § Not installed · a width/truncation library",
    premise: { present: "export function cells(" },
    why: "must be the measurer's own implementation (C09 I6); the refusal rests on `cells()` existing" },
  { id: "R7", where: "DEPENDENCIES.md § Not installed · a styling library (chalk)",
    premise: { absent: "chalk", in: "package.json" },
    why: "Ink owns styling; the package the row refuses, by name" },
  { id: "R8", where: "DEPENDENCIES.md § Not installed · an NDJSON parser",
    premise: { absent: "ndjson", in: "package.json" },
    why: "built in (C06). **The row's `Instead` column says `node:readline` and C06 splits on `indexOf(\"\\n\")` in `transport/ndjson.ts` — the refusal holds and its stated alternative is not the one in use** (Lane E finding)" },
  { id: "R9", where: "DEPENDENCIES.md § Not installed · a local registry (verdaccio)",
    premise: { absent: "verdaccio", in: "package.json" },
    why: "`make proof` reaches the same four things by packing the tarball; the named gap — a live publish — is recorded in the row" },
  { id: "R10", where: "DEPENDENCIES.md § Not installed · a chart library (simple-ascii-chart)",
    premise: { absent: "simple-ascii-chart", in: "package.json" },
    why: "a fit refusal: it emits SGR, hardcodes a narrow width model and reads `process.stdout.columns`" },
  { id: "R11", where: "DEPENDENCIES.md § Not installed · a TypeScript linter (typescript-eslint)",
    premise: { absent: "typescript-eslint", in: "package.json" },
    why: "decided 2026-09-03 by running it: 13 packages on top of this tree (not 87), 106 findings and 0 defects against `src/`, and `no-floating-promises` — the rule the question was held open for — fired zero times. The package the row refuses, by name" },
  { id: "R11b", where: "DEPENDENCIES.md § Not installed · a TypeScript linter (typescript-eslint)",
    premise: { present: "\"typescript\": \"7.", in: "package.json" },
    why: "the second premise: typescript-eslint 8.69.0's peer range is `typescript <6.1.0` and this tree compiles with 7.0.2, so it does not install without `--legacy-peer-deps`. Holds while the compiler is a 7.x. **Blind spot**: the range is the package's, not this tree's — typescript-eslint widening it to 7 is invisible here, and the row's other reopen condition (a floating promise in `src/`) is what SS54 cannot see by construction" },

  // --- C12 — refusals written as symbols ------------------------------------
  { id: "R12", where: "C12 I58 · §3ai",
    premise: { absent: "shiftInward" },
    why: "`graphLayout: \"force\"` is refused on the labels alone — 17.4% of label pairs overlap — and its expiry is written as a symbol: `shiftInward` and the label taxonomy. The day the symbol exists, the refusal is re-argued or removed" },
  { id: "R13", where: "C12 · `src/presentation/image/codec.ts` header",
    premise: { absent: "decodeJpeg(" },
    why: "`decodePng` refuses JPEG with a grep-able marker (`DECODE_JPEG_IS_NOT_BUILT`); the call form is watched because the marker is a string literal carrying the bare name" },
  { id: "R14", where: "C12 I71",
    premise: { present: "horizonFigure" },
    why: "I71's observable form is a signature — a figure function returning normalised marks with no `areaWidth`. **I71 names `contourFigure` and `horizonFigure`; the tree has `contourSegments` and `horizonFigure`** — the contour half of the sentence names a function that exists only in comments (Lane E finding)" },
  { id: "R15", where: "C12 I87 · §3am · `SVG_FAMILY.plot3d`",
    premise: { present: "plot3d: null" },
    why: "the SVG arm draws no 3D projection and the `origin` table has no fixed corner for one — a projected cloud's corner is a function of the camera. Two `null` seams, both watched" },

  // --- re-ruled 2026-09-03: refusals whose premise had expired ---------------
  //
  // Each of these was a sentence that stayed true in the document after the
  // tree moved under it. The new rows name the premise that actually holds.
  { id: "R18", where: "CALCIUM_ROADMAP.md § Already shipped · Video / GIF",
    premise: { present: "decodeGif(" },
    why: "**expired and converted 2026-09-04**: the cost refusal was paid — `decodeGif` in `src/presentation/image/gif.ts` (299 lines, LZW and compositing in-tree, no dependency row), `Frames` in `src/shell/frames.ts`, and the wake shared with the orbit. The row now says BUILT and rests on the decoder being in the tree; the day it is removed the roadmap entry is describing a decoder that does not exist" },
  { id: "R19", where: "CALCIUM_ROADMAP.md § Already shipped · Video / GIF",
    premise: { present: "ORBIT_RATE" },
    why: "the premise the ruling rested on and the one the build rides: a continuous redraw on C03's `stream` rung — the orbit, delta-timed in `session.ts` (C22 I74). The GIF's frame advance is on the **same** timer path (`#motionAt`, C22 I77), so if the orbit's wake goes, the frames' wake goes with it and the roadmap entry's *rides the orbit's wake* is false" },
  // R20 expired 2026-09-04 and is removed rather than re-argued: it watched
  // `sankeyArea(` absent, and the form is built (C12 §3ap). Its premise did
  // what a premise is for — the row failed the day the symbol appeared.
  { id: "R21", where: "C12 §3ap · sankey",
    premise: { present: "graphLayers" },
    why: "the fold premise, now the form's foundation: passes 1–5 are `graphLayers` and the sankey is a placement and a drawing over them. The ruling *a new form over the shared layering, not an option on `graph`* rests on the shared layering existing" },
  { id: "R22", where: "CALCIUM_ROADMAP.md § Session resume / history · Rewind",
    premise: { present: "UNDO_LIMIT" },
    why: "narrowed 2026-09-03 from *every mutation is reversible and nothing is* to *every transcript mutation*: the editor's are (C17 §6, two stacks, 200 units). The narrowed sentence rests on the editor's undo existing; the transcript half — `ViewPatch` has no delete, `evict` has no inverse — is a claim about absence that has no single symbol" },
  { id: "R23", where: "docs/notes/CALCIUM_MERMAID_THEMING.md § re-scoped: role → palette slot",
    premise: { absent: "AsciiTheme" },
    why: "owed, not refused: the note re-scoped node colouring to `beautiful-mermaid`'s eight `AsciiTheme` roles mapped onto C10 slots (~80 lines) and nothing in `src/` names the type yet. The day it does, the owed row is paid and this one is removed — a deferral with a symbol, so it cannot expire unnoticed" },
  { id: "R24", where: "docs/notes/CALCIUM_MERMAID_THEMING.md § re-scoped: role → palette slot",
    premise: { present: "beautiful-mermaid", in: "package.json" },
    why: "the re-scope rests on the library that exposes the roles; a `present` row on the package is the only form the register has for *in node_modules*, and it is the row the audit asked for" },

  // --- taste, marked and counted ---------------------------------------------
  { id: "R16", where: "docs/notes/CALCIUM_PLOT_PRIOR_ART.md · pie",
    premise: { unverifiable: "\"looks rough, low value\" is a judgement about a drawing" },
    why: "a circle approximation at cell resolution" },
  { id: "R17", where: "docs/notes/CALCIUM_PLOT_PRIOR_ART.md · 3D",
    premise: { unverifiable: "\"a novelty, and the roadmap already refuses it\" — and the roadmap has since built `plot3d` for the terminal arm, so the note's refusal is stale prose; R15 watches the SVG seam that still refuses" },
    why: "recorded as the taste refusal it was, beside the symbol refusal that replaced it" },
]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === "out") continue;
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/** Comments blanked; string literals kept — see the header on `decodeJpeg(`. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/(^|[^:])\/\/[^\n]*/gmu, "$1");
}

function escape(symbol) {
  return symbol.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * A symbol is bounded by non-identifier characters where it *has* an identifier
 * edge. `function isWide(` ends in `(`, and demanding a non-word character after
 * the paren would reject `function isWide(cp` — which is the first shape this
 * was run against, and it reported two present mechanisms as gone.
 */
function occurs(symbol, text) {
  const before = /^[\w$]/u.test(symbol) ? "(?<![\\w$])" : "";
  const after = /[\w$]$/u.test(symbol) ? "(?![\\w$])" : "";
  return new RegExp(`${before}${escape(symbol)}${after}`, "u").test(text);
}

/** The text a `src` premise resolves against: every file, comments stripped, joined. */
export function corpusOf(files = walk("src"), readFile = (f) => readFileSync(f, "utf8")) {
  return files.map((f) => stripComments(readFile(f))).join("\n");
}

/**
 * Resolve every entry. `corpus` is `corpusOf()` — the comment-stripped `src/`
 * text; `manifest` is `package.json`'s text. Both are injectable so a fabricated
 * register can be shown to fire (A03 commitment 14).
 */
export function resolveRefusals(
  register = REFUSALS,
  corpus = corpusOf(),
  manifest = readFileSync("package.json", "utf8"),
) {
  const rows = [];
  for (const entry of register) {
    const { premise } = entry;
    if ("unverifiable" in premise) {
      rows.push({ id: entry.id, kind: "unverifiable", holds: null });
      continue;
    }
    const text = premise.in === "package.json" ? manifest : corpus;
    const symbol = "absent" in premise ? premise.absent : premise.present;
    const found = occurs(symbol, text);
    const holds = "absent" in premise ? !found : found;
    rows.push({ id: entry.id, kind: "absent" in premise ? "absent" : "present", symbol, holds });
  }
  return rows;
}

export function checkRefusals(
  register = REFUSALS,
  corpus = undefined,
  manifest = undefined,
) {
  const violations = [];
  const ids = new Set();
  for (const entry of register) {
    if (ids.has(entry.id)) {
      violations.push({
        rule: "SS54",
        file: "tools/enforce/refusals.mjs",
        message: `refusal id ${entry.id} appears twice — two rows with one id are one row to every count`,
        spec: "A03 §4 SS54",
      });
    }
    ids.add(entry.id);
  }
  const byId = new Map(register.map((e) => [e.id, e]));
  for (const row of resolveRefusals(register, corpus, manifest)) {
    if (row.holds !== false) continue;
    const entry = byId.get(row.id);
    violations.push({
      rule: "SS54",
      file: "tools/enforce/refusals.mjs",
      message:
        row.kind === "absent"
          ? `${row.id} (${entry.where}) refuses on the premise that \`${row.symbol}\` does not exist, ` +
            `and it does. The refusal's expiry has arrived: re-argue it, or remove the row`
          : `${row.id} (${entry.where}) refuses on the premise that \`${row.symbol}\` exists, ` +
            `and it is gone. The refusal rests on nothing: re-argue it, or remove the row`,
      spec: "A03 §4 SS54",
    });
  }
  return violations;
}

/** The count the summary line reports: judgements the register holds and cannot check. */
export function unverifiableRefusals(register = REFUSALS) {
  return register.filter((e) => "unverifiable" in e.premise).map((e) => e.id);
}
