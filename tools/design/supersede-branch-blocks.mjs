// Supersedes the specimen blocks that draw the result branch with one blank
// after `⎿` (F1262; C09 I5, C22 I83, R-GLY-003).
//
//     node tools/design/supersede-branch-blocks.mjs [--dir <dir>]
//
// **Ruled 2026-09-27: correct them.** The design's fixtures drew the branch two
// ways — one blank after `⎿` and two — and §068, the one specimen drawing an
// exchange at three rungs, put the text a column left at 24-bit and 1-bit of
// where its ASCII rung puts it. R-GLY-003 is the rule: the registry's `branch`
// reserves two cells, and the renderer pads the selected representation to the
// reservation, so changing rung moves no column. So `  ⎿  ` — the form the tree
// draws (C22 I83) — and every one-blank block is superseded by a successor.
//
// **Successors, never an edit in place.** A section block is an immutable,
// content-addressed record: its `renderHtml` is its digest, and a released
// record's digest is sealed (`lint-immutable.mjs`). So each block gets a new
// id, the old record keeps its content and gains `supersededBy`, and the section
// projects the successor — R-BLK-929's shape over R-BLK-309, which is the one
// precedent in the file, followed key for key.
//
// **What moves in a block, and only that.** On a branch line — a line whose
// first mark is `⎿` followed by one blank and text — the blank becomes two. The
// lines after it that hang from the branch, every line indented at least to the
// old text column until one that is not, move one column right with it,
// because they align to the branch's text and the tree draws the whole body
// `BODY_INDENT` in (C22 I83). A line under a ground band gives back one blank of
// its trailing pad, so the band keeps its width. Nothing else is touched:
// `R-BLK-742`'s `● ⎿ ⟩ ▲` is a list of marks and not a branch, and an ASCII
// `` `- `` with its blank already takes three cells, the width `⎿  ` now takes.
//
// **Every lookup is asserted**, and the run refuses — having written nothing —
// if the set of blocks it would supersede is not the measured one, if a block
// already has a successor, or if the builder's own validator refuses the result.
// A second run on the corrected registry says so and exits 0 having written
// nothing. **It lands with `release.mjs 0.15`**, which seals the 28 successors:
// an unsealed record turns A03-DSN1's *seals exactly the one it was given* red.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blockContentDigest,
  nextBlockRuleId,
  ruleContentDigest,
  validateRegistry,
} from "../../docs/design/language/build-calcium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const dir = dirAt >= 0 ? resolve(args[dirAt + 1]) : resolve(here, "../../docs/design/language");
const registryPath = join(dir, "calcium-registry.json");

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
let failed = 0;
const fail = (m) => { console.error(`  ${m}`); failed += 1; };
const stop = () => { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); };

/**
 * The blocks, read one by one before this ran: 28 blocks and 31 branch lines —
 * `R-BLK-016`, `R-BLK-125` and `R-BLK-173` draw two each. F1262's *33 draw one*
 * counted lines in the generated fixtures, which repeat a few blocks.
 */
const EXPECTED = [
  "R-BLK-005", "R-BLK-007", "R-BLK-010", "R-BLK-016", "R-BLK-017", "R-BLK-032", "R-BLK-058",
  "R-BLK-074", "R-BLK-090", "R-BLK-125", "R-BLK-152", "R-BLK-173", "R-BLK-265", "R-BLK-311",
  "R-BLK-340", "R-BLK-341", "R-BLK-342", "R-BLK-421", "R-BLK-462", "R-BLK-472", "R-BLK-475",
  "R-BLK-484", "R-BLK-504", "R-BLK-654", "R-BLK-659", "R-BLK-672", "R-BLK-769", "R-BLK-934",
  "R-BLK-935",
].filter((id) => id !== "R-BLK-504"); // §068's ASCII rung: `` `- `` and its blank already take three cells
const EXPECTED_LINES = 31;
const BLOCK_GAP = "<span class=gap> </span>";
const HOOK = "⎿";

/** The builder's `plainBlockText`, for one line and without the block's trim — asserted equal below. */
const decode = (value) => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
  .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
  .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"').replaceAll("&#39;", "'");
const plainLine = (html) => decode(html.replace(/<[^>]*>/g, ""));
// Decoded **before** the tags are stripped, as the builder does: an escaped
// `&lt;…&gt;` in a specimen reads as a tag and goes with them (R-BLK-226).
const plainBlockText = (html) => decode(html).replace(/<[^>]*>/g, "").replace(/[ \t]+\n/g, "\n").trim();

/**
 * `html` with a blank inserted before the plain character at `column`.
 *
 * **An empty element holds a column the plain text cannot see**: a spinner is
 * `<span class="… sp sp-agent"></span>`, its frame drawn by CSS, so the plain
 * character at `column` is the one *after* it. A blank inserted there lands
 * behind the mark and moves it left of its siblings — `✦  update the tests`
 * under `◼ add a depth counter`. So when the tags between the previous
 * character and this one hold an empty element, the blank goes before it.
 */
function insertAt(html, column) {
  let seen = 0;
  let after = 0; // the html index just past the previous plain character
  for (let i = 0; i < html.length; i += 1) {
    if (html[i] === "<") { i = html.indexOf(">", i); continue; }
    if (seen === column) {
      const empty = html.slice(after, i).search(/<[^/>][^>]*><\/[^>]+>/u);
      const at = empty < 0 ? i : after + empty;
      return `${html.slice(0, at)} ${html.slice(at)}`;
    }
    if (html[i] === "&") i = html.indexOf(";", i);
    seen += 1;
    after = i + 1;
  }
  return null;
}

/** One blank taken from the trailing pad of a ground band, or `null` if the line has none. */
function giveBackPad(html) {
  const m = html.match(/<span class="[^"]*\bbg-[^"]*">([^<]*) <\/span>((?:<\/pre>)?)$/u);
  if (m === null) return null;
  return `${html.slice(0, m.index)}${m[0].replace(/ <\/span>((?:<\/pre>)?)$/u, "</span>$1")}`;
}

/** A block's html with its branch lines corrected, and the count of branches it held. */
function corrected(html) {
  const lines = html.split("\n");
  let hooks = 0;
  let column = null; // the old text column of the branch being hung from, or null
  const out = lines.map((line) => {
    const plain = plainLine(line);
    const hook = plain.match(new RegExp(`^( *)${HOOK} (\\S)`, "u"));
    let next = null;
    if (hook !== null) {
      column = hook[1].length + 2;
      hooks += 1;
      const at = line.indexOf(`${HOOK} `);
      if (at < 0 || line.indexOf(`${HOOK} `, at + 1) >= 0) { fail(`a branch line whose ${HOOK} is not once in its html: ${line}`); return line; }
      next = `${line.slice(0, at)}${HOOK}  ${line.slice(at + 2)}`;
    } else if (column !== null && plain.trim() !== "" && plain.length - plain.trimStart().length >= column) {
      next = insertAt(line, column);
      if (next === null) { fail(`no column ${String(column)} in ${line}`); return line; }
    } else {
      column = null;
      return line;
    }
    // Only a band that runs to the line's end gives a blank back: a ground on a
    // word — a find match, an error rule's label — is not a width to keep.
    if (/<span class="[^"]*\bbg-[^"]*">[^<]*<\/span>(?:<\/pre>)?$/u.test(next)) {
      const kept = giveBackPad(next);
      if (kept === null) fail(`a band to the line's end with no trailing pad to give back: ${next}`);
      else next = kept;
    }
    return next;
  });
  return { html: out.join("\n"), hooks };
}

// --- the checks, before anything is built ------------------------------------

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
const rulesById = new Map(registry.rules.map((r) => [r.id, r]));
for (const b of registry.sectionBlocks) {
  if (plainBlockText(b.renderHtml) !== b.text && b.text !== "Retained blank-cell specimen.") {
    fail(`${b.id}: this script's plainBlockText disagrees with the builder's record`);
  }
}
const template = { rule: rulesById.get("R-BLK-929"), block: registry.sectionBlocks.find((b) => b.id === "R-BLK-929") };
if (template.rule === undefined || template.block === undefined) fail("no R-BLK-929 to take the successor's shape from");
if (failed > 0) stop();

const targets = [];
let lines = 0;
for (const [index, block] of registry.sectionBlocks.entries()) {
  const { html, hooks } = corrected(block.renderHtml);
  if (hooks === 0) continue;
  targets.push({ index, block, html });
  lines += hooks;
}
const found = targets.map((t) => t.block.id).sort();
if (found.length === 0 && EXPECTED.every((id) => typeof rulesById.get(id)?.supersededBy === "string")) {
  console.log(`already superseded · all ${String(EXPECTED.length)} blocks have successors and no one-blank branch is projected, nothing written`);
  process.exit(0);
}
if (JSON.stringify(found) !== JSON.stringify([...EXPECTED].sort())) fail(`blocks to supersede ${JSON.stringify(found)}, not the measured ${JSON.stringify(EXPECTED)}`);
if (lines !== EXPECTED_LINES) fail(`${String(lines)} branch lines, not the measured ${String(EXPECTED_LINES)}`);
for (const { block } of targets) {
  const rule = rulesById.get(block.id);
  if (rule === undefined) fail(`${block.id} has no rule record`);
  else if (rule.supersededBy !== null && rule.supersededBy !== undefined) fail(`${block.id} already has a successor, ${rule.supersededBy}`);
}
const sectionsByKey = new Map(registry.sections.map((s) => [s.key, s]));
const sourceDigest = (section, blocks) =>
  createHash("sha256").update(section.blockIds.map((id) => blocks.get(id).renderHtml).join(BLOCK_GAP)).digest("hex");
const blocksNow = new Map(registry.sectionBlocks.map((b) => [b.id, b]));
for (const key of new Set(targets.map((t) => t.block.sectionKey))) {
  const section = sectionsByKey.get(key);
  if (section === undefined) { fail(`section ${key} missing`); continue; }
  if (sourceDigest(section, blocksNow) !== section.sourceDigest) fail(`${key}: this script's source digest disagrees with the record`);
}
if (failed > 0) stop();

// --- the successors --------------------------------------------------------------

const used = new Set([...registry.rules.map((r) => r.id), ...registry.sectionBlocks.map((b) => b.id)]);
const lastBlockRule = registry.rules.map((r) => r.id).filter((id) => id.startsWith("R-BLK-")).sort().at(-1);
let insertAfter = registry.rules.findIndex((r) => r.id === lastBlockRule);
const moved = [];
for (const { index, block, html } of targets) {
  const id = nextBlockRuleId(used);
  if (id <= lastBlockRule) { fail(`${id} is not after ${lastBlockRule} — the id space has a hole this would fill`); stop(); }
  const old = rulesById.get(block.id);
  const text = plainBlockText(html);
  const rule = {
    id,
    title: old.title,
    text,
    status: old.status,
    sectionKey: old.sectionKey,
    tags: old.tags,
    supersedes: [old.id],
    legacyIds: [],
    contentDigest: "",
  };
  rule.contentDigest = ruleContentDigest(rule);
  const successor = {
    id,
    sectionKey: block.sectionKey,
    position: block.position,
    renderHtml: html,
    contentDigest: blockContentDigest(html),
    text,
    status: block.status,
    classificationBasis: block.classificationBasis,
    ruleIds: [id],
    supersedes: [block.id],
  };
  if (JSON.stringify(Object.keys(rule)) !== JSON.stringify(Object.keys(template.rule))) fail(`${id}: rule keys differ from R-BLK-929's`);
  if (JSON.stringify(Object.keys(successor)) !== JSON.stringify(Object.keys(template.block))) fail(`${id}: block keys differ from R-BLK-929's`);
  old.supersededBy = id;
  registry.rules.splice(insertAfter + 1, 0, rule);
  insertAfter += 1;
  registry.sectionBlocks[index] = successor;
  const section = sectionsByKey.get(block.sectionKey);
  const at = section.blockIds.indexOf(block.id);
  if (at < 0 || section.blockIds.indexOf(block.id, at + 1) >= 0) fail(`${block.sectionKey} does not project ${block.id} exactly once`);
  section.blockIds[at] = id;
  moved.push(`${block.id} → ${id}`);
}
const blocksAfter = new Map(registry.sectionBlocks.map((b) => [b.id, b]));
for (const key of new Set(targets.map((t) => t.block.sectionKey))) {
  const section = sectionsByKey.get(key);
  section.sourceDigest = sourceDigest(section, blocksAfter);
}
if (failed > 0) stop();

// **The builder is the judge**: its own validator over the whole registry, before
// the write. A successor it refuses is refused here with nothing on disk.
try {
  validateRegistry(registry);
} catch (error) {
  console.error(`FAIL · the builder refuses the result, nothing written: ${error.message}`);
  process.exit(1);
}
const left = registry.sectionBlocks.filter((b) => corrected(b.renderHtml).hooks > 0).map((b) => b.id);
if (left.length > 0) { fail(`one-blank branches still projected: ${left.join(" ")}`); stop(); }

writeFileSync(registryPath, serialise(registry));
console.log(`superseded ${String(moved.length)} blocks, ${String(lines)} branch lines:`);
for (const m of moved) console.log(`  ${m}`);
