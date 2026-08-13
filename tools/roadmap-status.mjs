// The Order list's status column, resolved against the tree.
//
//     node tools/roadmap-status.mjs                  # the real roadmap
//     node tools/roadmap-status.mjs --file <path>    # a fixture's
//
// **45 rows of hand-maintained claims about the tree is the population
// `UNCONSUMED_MEMBERS` and `BUILDER_OMISSIONS` compare by equality**, and for the
// same reason: an entry outliving its reason is the failure mode, and a status is
// a claim like any other. F142's lesson — a count in prose is a snapshot with no
// mechanism — applies to the column written to fix it.
//
// **It earned this once already.** The pass that wrote the column re-ran its own
// checks and found row 17 citing `logs` in `blocks/kinds/simple.ts`, where its
// definition is not. A row can name a real mechanism and the wrong file and read
// as correct until something resolves the reference. Without a fixture that catch
// happens once.
//
// ## The two checks, and the second is the one that matters
//
// **1. Every claim resolves.** A cited `path:line` names a file that exists and a
// line that exists, and every identifier the evidence cell names appears in at
// least one file that cell cites. That last clause is what catches the wrong-file
// case: `logs` occurs zero times in `simple.ts` and eight times in
// `structured.ts`, so the reference fails where the file-exists check passes.
//
// **2. The three sets partition the entries, compared by equality.** Every entry
// is marked, or confirmed OPEN, or named as unchecked — exactly one of the three.
//
// A verifier that only checked rows carrying a symbol would certify whichever
// subset chose to carry one, and the unchecked population is the one that quietly
// grows: **an OPEN nobody verified reads exactly like one somebody did.** The
// column records that distinction and only this keeps it true. An entry added to
// the list, or dropped from the unchecked paragraph, fails here on the day it
// happens.
//
// ## Its blind spot, stated because an unrecorded limit reads as strength
//
// **An identifier is checked for presence, not for meaning.** `window` appearing
// in `structured.ts` does not prove `logs` declares one — it proves the reference
// is not pointing somewhere unrelated, which is the decay this population actually
// suffers. What it cannot see is a claim that was never true about a file that
// happens to contain the words.
//
// **And a row citing several files is checked more weakly than one citing a
// single file, which the fixture found rather than this comment predicting it.**
// An identifier resolves against *any* file the cell cites, so on a two-file row a
// sibling citation can satisfy it: repointing row 17's `logs` at `simple.ts`
// passes, because `logs` also occurs once in the `patch` definition beside it.
// RS2c asserts that masking rather than leaving it to be discovered.
//
// The alternative — every identifier in every cited file — is worse, and not
// marginally: row 17 legitimately names `logs` and `patch` while citing one file
// for each, so the strict rule fails every correct multi-file row in the table.
// The weakness is therefore in the shape of the check and not in its threshold,
// and it is bounded: it needs a row with two citations *and* a word common to
// both, which is what makes single-file rows the ones worth writing.
//
// The stronger check would need a needle per row, and a needle is a token added by
// the same hand that would otherwise fix the row — corrections.mjs's argument, and
// it holds here. What this buys over a hand-list is that a row written in the
// existing form is checked for free.

import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const ROOT = process.cwd();
const fileFlag = process.argv.indexOf("--file");
const ROADMAP = fileFlag === -1 ? "CALCIUM_ROADMAP.md" : (process.argv[fileFlag + 1] ?? "");

/** Entries the Order list is expected to run over. Derived, then compared. */
function parse(text) {
  const start = text.indexOf("## Order\n\n```\n");
  if (start === -1) throw new Error("no Order block");
  const from = start + "## Order\n\n```\n".length;
  const to = text.indexOf("\n```\n", from);
  const block = text.slice(from, to);

  /** number -> status. An unmarked row is OPEN, which is what it has always meant. */
  const marked = new Map();
  const all = new Set();
  for (const line of block.split("\n")) {
    // Six wide, because that is the field the status pass writes. Matching
    // `BUILT|PART|RULED` as alternatives silently missed every marked row —
    // "BUILT" is five characters and the field is six.
    const m = /^(.{6})(\d+|—) /.exec(line);
    if (m === null) continue;
    if (m[2] === "—") continue;
    all.add(m[2]);
    const status = m[1].trim();
    if (status !== "") marked.set(m[2], status);
  }

  // The evidence table: `| 17 | PART | … | … |`.
  const evidence = new Map();
  for (const line of text.split("\n")) {
    const m = /^\| (\d+) \| (BUILT|PART|RULED) \| (.*) \|$/.exec(line);
    if (m === null) continue;
    // The residue is the last cell and is a description of what is *not* done, so
    // its identifiers name absent things. Only the evidence cell is resolved.
    const cells = m[3].split(" | ");
    evidence.set(m[1], cells[0] ?? "");
  }

  /**
   * The entry numbers in a named paragraph.
   *
   * **Both forms, because the two paragraphs are written differently** — the
   * confirmed-OPEN list bolds each number as it discusses it, the unchecked list
   * is a bare enumeration. A parser that took only the bold form read the second
   * as empty, which is a silent pass on the population this check exists for.
   */
  const listed = (heading) => {
    const i = text.indexOf(heading);
    if (i === -1) return null;
    const para = text.slice(i, text.indexOf("\n\n", i));
    const bold = [...para.matchAll(/\*\*(\d+)\*\*/g)].map((x) => x[1]);
    return new Set(bold.length > 0 ? bold : [...para.matchAll(/\b(\d{1,2})\b/g)].map((x) => x[1]));
  };

  return {
    all,
    marked,
    evidence,
    confirmedOpen: listed("**Checked and confirmed OPEN**"),
    unchecked: listed("**Not checked in this pass"),
  };
}

/**
 * A cited file, with an optional line: `shell/paint.ts:241`, `presentation/text.ts`.
 *
 * **The line is optional and the path is not**, because the two carry different
 * claims. A row citing a whole file says *the mechanism lives here*, which the
 * identifier check below resolves; a row citing a line says *and it is at this
 * line*, which decays independently and is checked separately. Demanding a line
 * everywhere would push rows like 13 — where the file is the evidence — into
 * writing one that means nothing.
 *
 * Paths are written without the `src/` prefix throughout the table, so both forms
 * are tried; a `src/`-rooted path that also exists at the repository root would be
 * a genuine ambiguity and there is none.
 */
const CITE = /`([\w./-]+\.(?:ts|mjs|py|md|yml))(?::(\d+))?`/g;
/** A backticked identifier — not a path, not a flag, not prose with spaces. */
const IDENT = /`([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)`/g;

/**
 * Words that are backticked in these cells and are not symbols to resolve: block
 * kinds named as data, and file basenames used as prose. Counted rather than
 * excluded by a pattern — an exemption with no reason beside it outlives it.
 */
const NOT_SYMBOLS = new Set([
  "F134", "F157", "F158", "F150", "F154", "F156", "F151", "F152", "F153", "F21", "F15",
]);

/** The path as written, or under `src/`. `null` when neither exists. */
function locate(path) {
  for (const p of [path, join("src", path)]) {
    if (existsSync(join(ROOT, p))) return p;
  }
  return null;
}

function resolve(cell) {
  const cites = [...cell.matchAll(CITE)].map(([, path, line]) => ({
    path,
    line: line === undefined ? null : Number(line),
  }));
  const problems = [];
  const bodies = [];

  for (const c of cites) {
    const found = locate(c.path);
    if (found === null) {
      problems.push(`${c.path} does not exist`);
      continue;
    }
    const body = readFileSync(join(ROOT, found), "utf8");
    const lines = body.split("\n");
    if (c.line !== null) {
      if (c.line > lines.length) {
        problems.push(`${c.path}:${String(c.line)} — the file has ${String(lines.length)} lines`);
        continue;
      }
      if ((lines[c.line - 1] ?? "").trim() === "") {
        problems.push(`${c.path}:${String(c.line)} is blank`);
        continue;
      }
    }
    bodies.push({ path: c.path, body });
  }

  if (cites.length === 0) problems.push("no file cited — a status with no evidence is a memory");

  for (const [, ident] of cell.matchAll(IDENT)) {
    if (NOT_SYMBOLS.has(ident)) continue;
    // A member reference resolves on its last segment: `Style.background` is not a
    // string that appears anywhere, and `background` is.
    const needle = ident.split(".").pop() ?? ident;
    if (bodies.length > 0 && !bodies.some((b) => b.body.includes(needle))) {
      problems.push(
        `\`${ident}\` appears in none of ${bodies.map((b) => b.path).join(", ")}`,
      );
    }
  }
  return problems;
}

// `--file` takes an absolute path from the fixture and a relative one from the
// Makefile, so it is resolved rather than always joined.
const text = readFileSync(isAbsolute(ROADMAP) ? ROADMAP : join(ROOT, ROADMAP), "utf8");
const { all, marked, evidence, confirmedOpen, unchecked } = parse(text);

const fail = [];

// --- 1. every claim resolves ------------------------------------------------
let resolved = 0;
for (const [entry] of [...marked].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const cell = evidence.get(entry);
  if (cell === undefined) {
    fail.push(`entry ${entry} is marked ${marked.get(entry) ?? "?"} and has no evidence row`);
    continue;
  }
  const problems = resolve(cell);
  if (problems.length === 0) resolved += 1;
  for (const p of problems) fail.push(`entry ${entry}: ${p}`);
}

// --- 2. the partition, by equality ------------------------------------------
if (confirmedOpen === null) fail.push("no `Checked and confirmed OPEN` paragraph");
if (unchecked === null) fail.push("no `Not checked in this pass` paragraph");

if (confirmedOpen !== null && unchecked !== null) {
  const accounted = new Set([...marked.keys(), ...confirmedOpen, ...unchecked]);
  const missing = [...all].filter((e) => !accounted.has(e));
  const spurious = [...accounted].filter((e) => !all.has(e));
  const twice = [...all].filter(
    (e) =>
      [marked.has(e), confirmedOpen.has(e), unchecked.has(e)].filter(Boolean).length > 1,
  );
  const sorted = (xs) => xs.sort((a, b) => Number(a) - Number(b)).join(", ");
  if (missing.length > 0) {
    fail.push(
      `entries in neither the column, the confirmed-OPEN list nor the unchecked list: ${sorted(missing)}` +
        " — an OPEN nobody verified reads exactly like one somebody did",
    );
  }
  if (spurious.length > 0) fail.push(`accounted for and not in the list: ${sorted(spurious)}`);
  if (twice.length > 0) fail.push(`in two of the three sets: ${sorted(twice)}`);
}

// --- report -----------------------------------------------------------------
// **The counter, not the status.** Scanning zero rows is very fast and exits 0,
// and `45 of 45 resolve` over an empty set reads as a pass — the trap
// `scan-cost.mjs` needed a row for, in the instrument written to check a list.
const n = all.size;
if (n === 0) {
  console.error("roadmap-status — 0 entries found. An empty scan is not a clean one.");
  process.exit(1);
}

console.log(
  `roadmap-status — ${String(n)} entries · ${String(marked.size)} marked, ` +
    `${String(resolved)} resolving · ${String(confirmedOpen?.size ?? 0)} confirmed OPEN · ` +
    `${String(unchecked?.size ?? 0)} unchecked`,
);
for (const f of fail) console.error(`  ${f}`);
if (fail.length > 0) {
  console.error(`\n${String(fail.length)} problems.`);
  process.exit(1);
}
console.log(`  ${String(n)}/${String(n)} entries accounted for, every claim resolves`);
