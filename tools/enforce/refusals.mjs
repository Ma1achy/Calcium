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
    why: "87 packages against one rule with a measured catch (`no-floating-promises`); the row says *decide after C23 lands*, and C23 has landed — the decision is owed, and this entry is what notices if it is taken" },

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
