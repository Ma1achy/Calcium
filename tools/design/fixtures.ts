/**
 * The design fixtures, derived from the generated page (AUTHORITY.md §Fixtures).
 *
 *     npx tsx tools/design/fixtures.ts                 # write fixtures/ and INDEX.json
 *     npx tsx tools/design/fixtures.ts --check         # write nothing; fail on any difference
 *     npx tsx tools/design/fixtures.ts --html <page> --out <dir>
 *
 * **A projection, like the page it reads.** The fixtures were committed once and
 * went stale while the page was rebuilt around them, because nothing derived
 * them and nothing compared them. This does both, and `--check` is what
 * `make design-check` runs.
 *
 * **The rules were measured, not designed.** Each one reproduces the corpus M1
 * committed from M1's own page — 108 of 109 byte for byte, and the 109th differs
 * by exactly the rules M1 itself added — so a rule changed here is a change to
 * what a fixture is, and belongs in AUTHORITY.md first.
 *
 * **Width is `cells()`**, the measurer's own implementation (CLAUDE.md: never
 * `.length` for display width). `cols` counts a wide emoji as two, which is what
 * the corpus recorded and what a terminal draws.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cells } from "../../src/presentation/text.js";

const here = dirname(fileURLToPath(import.meta.url));
const language = resolve(here, "../../docs/design/language");
const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const check = args.includes("--check");
const htmlPath = resolve(option("--html") ?? join(language, "calcium-design-language.html"));
const out = resolve(option("--out") ?? join(language, "fixtures"));

export type IndexEntry = Readonly<{
  file: string;
  section: number;
  id: string;
  title: string;
  cols: number;
  rows: number;
  sha: string;
  ruleIds: readonly string[];
}>;

/** The five named entities and every numeric reference — what the builder's `esc` and the kit's markup produce. */
function decode(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return named[body.toLowerCase()] ?? whole;
  });
}

/** An empty spinner slot, whatever else its tag carries — CSS fills it at runtime, and a fixture is a still. */
const SPINNER_SLOT = /<span class="[^"]*\bsp\b[^"]*"[^>]*><\/span>/gu;

/** A panel's text: markup removed, entities decoded, each line right-trimmed, trailing blank lines dropped. */
export function panelText(pre: string): string {
  const text = decode(pre.replace(SPINNER_SLOT, "✦").replace(/<[^>]+>/gu, ""));
  return text.split("\n").map((line) => line.trimEnd()).join("\n").replace(/\n+$/u, "");
}

/** Every fixture the page produces, in section order, with the text each file holds. */
export function derive(html: string): readonly Readonly<{ entry: IndexEntry; text: string }>[] {
  const sections = [...html.matchAll(/<section id="([^"]+)"([^>]*)>([\s\S]*?)<\/section>/gu)];
  const fixtures: { entry: IndexEntry; text: string }[] = [];
  sections.forEach(([, id, attrs, body], at) => {
    const pre = /<pre class=term>([\s\S]*?)<\/pre>/u.exec(body!);
    if (pre === null) return;
    const text = panelText(pre[1]!);
    const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/u.exec(body!);
    const attr = (name: string): readonly string[] =>
      (new RegExp(`\\b${name}="([^"]*)"`, "u").exec(attrs!)?.[1] ?? "").split(/\s+/u).filter((s) => s !== "");
    const lines = text.split("\n");
    const section = at + 1;
    fixtures.push({
      entry: {
        file: `${String(section).padStart(3, "0")}-${id!.slice(0, 46)}.txt`,
        section,
        id: id!,
        title: heading === null ? "" : decode(heading[1]!.replace(/<[^>]+>/gu, "")),
        cols: Math.max(...lines.map((line) => cells(line))),
        rows: lines.length,
        sha: createHash("sha256").update(text).digest("hex").slice(0, 16),
        ruleIds: [...attr("data-rule-ids"), ...attr("data-example-id")],
      },
      text,
    });
  });
  return fixtures;
}

const fixtures = derive(readFileSync(htmlPath, "utf8"));
const files = new Map<string, string>(fixtures.map(({ entry, text }) => [entry.file, `${text}\n`]));
files.set("INDEX.json", JSON.stringify(fixtures.map(({ entry }) => entry), null, 1));

if (check) {
  const problems: string[] = [];
  const present = existsSync(out) ? readdirSync(out) : [];
  for (const [name, content] of files) {
    const path = join(out, name);
    if (!existsSync(path)) problems.push(`${name}: missing — the page produces it`);
    else if (readFileSync(path, "utf8") !== content) problems.push(`${name}: differs from the page`);
  }
  for (const name of present) if (!files.has(name)) problems.push(`${name}: unexpected — the page does not produce it`);
  for (const p of problems) console.error(`  ${p}`);
  if (problems.length > 0) {
    console.error(`FAIL · ${problems.length} fixtures disagree with the page — run \`make design\``);
    process.exit(1);
  }
  console.log(`fixtures · ${fixtures.length} derived from the page, all equal, nothing unexpected`);
} else {
  // Written whole: a stale file the page no longer produces is removed, so the
  // directory is exactly the derivation rather than the derivation plus history.
  mkdirSync(out, { recursive: true });
  for (const name of readdirSync(out)) if (!files.has(name)) rmSync(join(out, name));
  for (const [name, content] of files) writeFileSync(join(out, name), content);
  console.log(`fixtures · ${fixtures.length} written from ${htmlPath}`);
}
