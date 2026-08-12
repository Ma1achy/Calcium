// The corrections index — F11's class, derived rather than counted by hand.
//
// **F11 is the most-instantiated class in this project and its count was
// uncountable.** The ruling was *keep the drawings, add a corrections
// appendix*: a surface drawing that turned out wrong is corrected **in place**,
// because a drawing replaced silently is a drawing nobody can check, and the
// record of what changed is worth more than the wrong picture. Ten-odd sites
// did the first half. Nothing did the second.
//
// **Derived, because a count in prose is a snapshot with no mechanism** — F87's
// lesson and F142's, and this session's own README said *sixty-nine entries*
// against a ledger of 159. So the appendix is generated from the documents, and
// regenerating it is how it stays true.
//
//     node examples/docker/tools/corrections.mjs           # print the index
//     node examples/docker/tools/corrections.mjs --write   # write the appendix
//
// ## Its blind spot, stated because an unrecorded limit reads as strength
//
// **There is no marker to match, so this matches a vocabulary.** The corrections
// are prose and were written ten different ways — *corrected here*, *the figure
// is corrected above*, *this ruling was wrong and the frame corrected it*, *the
// earlier one was drawn by hand*. A regex over that vocabulary finds what has
// been written so far and **cannot find a correction phrased in a way nobody has
// used yet.**
//
// That is a real limit and it is the same shape as SP5's: a rule scoped to the
// places thought to matter. The alternative — a machine-readable token at every
// site — was considered and is worse *here*, because the token would have to be
// added by the same hand that would otherwise add the index row, so a correction
// written without one is invisible either way. What this buys over a hand-list
// is that a correction using the **existing** vocabulary is picked up for free,
// which is the case that actually recurs.
//
// The count is therefore a floor, and it is reported as one.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The tree to scan. Its own location by default, `--root` to point it elsewhere.
 *
 * **The override exists because its fixture could not otherwise exist.** The
 * row that matters is *a fabricated correction in a new document is found* —
 * without it, every other row passes on a tool that prints a hard-coded index,
 * which is the failure mode a derived index is supposed to remove. Resolving
 * the root from `import.meta.url` alone made that row unwritable, so the
 * untestable shape was the finding rather than the fixture being awkward.
 */
const rootFlag = process.argv.indexOf("--root");
const ROOT =
  rootFlag === -1
    ? new URL("../../../", import.meta.url).pathname
    : (process.argv[rootFlag + 1] ?? ".");

/**
 * Where a drawing lives. The surface specs and the app's own walk documents —
 * the two places a figure is drawn before the thing it describes exists.
 *
 * **The directory, and the exceptions named** — an allow-list over the place
 * rather than a glob at the files thought to matter, which is the shape SP5
 * needed three attempts to reach.
 */
const SOURCES = [
  { dir: "docs/surfaces", match: (f) => f.endsWith(".md") },
  { dir: "examples/docker", match: (f) => f.endsWith("_WALK.md") },
];

/**
 * The vocabulary. Each entry is a phrasing that has actually been used; adding
 * one is how this rule learns, and the comment above says why there is no token.
 */
const PHRASINGS = [
  /\bis corrected (?:here|above|below)\b/iu,
  /\bcorrected (?:here|above|below|in place|rather than)\b/iu,
  /\bthe earlier (?:one|figure|drawing) was drawn\b/iu,
  /\bthis (?:ruling|drawing|figure) was wrong\b/iu,
  /\bwas wrong (?:and|in) \w+/iu,
  /\bbefore being corrected\b/iu,
  /\bthree corrections\b/iu,
  /\bthe figure (?:is|was) corrected\b/iu,
  /\bnot a drawing\b/iu,
  /\bdrawn and unlisted\b/iu,
];

/** A heading the line sits under, for the index to point at. */
function sectionOf(lines, i) {
  for (let j = i; j >= 0; j--) {
    const m = /^#{1,4}\s+(.*)$/u.exec(lines[j] ?? "");
    if (m) return m[1].trim();
  }
  return "(top)";
}

function scan() {
  const found = [];
  for (const src of SOURCES) {
    let entries;
    try {
      entries = readdirSync(join(ROOT, src.dir));
    } catch {
      continue;
    }
    for (const f of entries.filter(src.match).sort()) {
      const rel = `${src.dir}/${f}`;
      const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
      lines.forEach((line, i) => {
        const hit = PHRASINGS.find((p) => p.test(line));
        if (hit === undefined) return;
        found.push({
          file: rel,
          line: i + 1,
          section: sectionOf(lines, i),
          // The sentence, trimmed of markdown noise, as the index entry.
          text: line.replace(/^\s*[-|*]\s*/u, "").replace(/\*\*/gu, "").trim().slice(0, 200),
        });
      });
    }
  }
  return found;
}

const found = scan();
const byFile = new Map();
for (const c of found) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);

const out = [];
out.push("## Appendix — the corrections index");
out.push("");
out.push(
  "**Derived by `tools/corrections.mjs`, not hand-listed.** F11's ruling was *keep the",
);
out.push(
  "drawings, add a corrections appendix*: a figure that turned out wrong is corrected in",
);
out.push(
  "place, because a drawing replaced silently is one nobody can check. The first half was",
);
out.push("done at every site below and the second half was never written.");
out.push("");
out.push(
  `**${String(found.length)} corrections across ${String(byFile.size)} documents**, and the number is a **floor**:`,
);
out.push(
  "the corrections are prose with no marker, so this matches a vocabulary of phrasings that",
);
out.push(
  "have actually been used and cannot see one phrased a new way. The limit is stated in the",
);
out.push("tool rather than left to be discovered.");
out.push("");
for (const [file, cs] of [...byFile.entries()].sort()) {
  out.push(`### \`${file}\` — ${String(cs.length)}`);
  out.push("");
  out.push("| line | section | what was corrected |");
  out.push("|---|---|---|");
  for (const c of cs) {
    out.push(`| ${String(c.line)} | ${c.section.replace(/\|/gu, "\\|")} | ${c.text.replace(/\|/gu, "\\|")} |`);
  }
  out.push("");
}

const text = out.join("\n");

if (process.argv.includes("--write")) {
  const P = join(ROOT, "examples/docker/CORRECTIONS.md");
  writeFileSync(P, `${text}\n`);
  console.log(`wrote ${P} — ${String(found.length)} corrections across ${String(byFile.size)} documents`);
} else {
  console.log(text);
}
