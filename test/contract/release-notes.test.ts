// C24 T2.35 (I44) — what the release notes say about the published surface is
// true of it (F1504).
//
// **The notes were the one record of the surface nothing read.** C24 owns the
// surface and `make proof` installs the tarball, and neither opens CHANGELOG or
// MIGRATION: a lane proposed lines for four names no entry reaches, and the
// lines beside them already said `WatchItem` and `WatchRowState` *are exported*
// when no entry re-exports either. MIGRATION §2, *changes the compiler finds*,
// named `ChromeContext`, `Verdict`, `RouterDeps` and `CallState` — types a
// consumer's compiler cannot report by name, because the consumer cannot write
// them.
//
// **A test and not an A03 scan, because the subject is the built declarations.**
// The published set is what `package.json`'s `exports` resolve to, which is
// `dist/`, and `make test` builds `dist/` before it runs; `make enforce` runs
// ahead of the build in the gate chain and in the pre-commit hook, so a scan
// would read whatever `dist/` the last build left.
//
// **What this does not see**, stated so it does not read as more than it is:
// - prose naming a symbol without one of the three phrases — *refused by
//   `validateDocument`*, *`menuBlocks`' second parameter* — is outside the
//   population, and `validateDocument` is on no entry;
// - `Type.field` is checked at `Type`: a removed or misspelt member passes;
// - a name with no capital is not read as a name (`b`, `cells`), because the
//   notes' lowercase words are values (`live`, `quote`) that `dist/` also declares;
// - a name `dist/` no longer declares at all (`profileDeck`) cannot be told from
//   a word that was never a name (`work-unit`), so it passes;
// - a structural route is not checked. Which §2 rows a consumer can *hit* was
//   measured once, per row, by compiling a consumer against packed tarballs
//   before and after the change (F1504); this keeps the names honest after it.
import { describe, expect, it } from "vitest";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Prose about a declaration is not a declaration of it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

/**
 * Every name the `exports` entries publish, **read from `dist/`** — the `types`
 * target a consumer's compiler resolves, not the `src/` file it was built from.
 */
function publishedNames(read: (f: string) => string, entries: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    for (const m of code(read(entry)).matchAll(/export\s+(?:type\s*)?\{([^}]*)\}/gu)) {
      for (const part of (m[1] ?? "").split(",")) {
        const n = part.trim().replace(/^type\s+/u, "").split(/\s+as\s+/u).pop()?.trim();
        if (n !== undefined && n !== "") out.add(n);
      }
    }
  }
  return out;
}

/** Every name a declaration file declares at its top level, exported from that file or not. */
function declaredNames(texts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) {
    const decl = /(?:^|\n)(?:export\s+)?(?:declare\s+)?(?:type|interface|function|const|class|enum)\s+([A-Za-z_$][\w$]*)/gu;
    for (const m of code(t).matchAll(decl)) out.add(m[1] ?? "");
  }
  return out;
}

/**
 * The identifier a backticked token starts with — `Glyph` of `Glyph`,
 * `TerminalCapabilities` of `TerminalCapabilities.clipboard` — **when it carries a
 * capital**. An all-lowercase word is a value far more often than a name here
 * (`live`, `quote`, `handle`), and `dist/` declares both of those first two as
 * functions, so reading them as names reported the glyph row against itself.
 */
const head = (token: string): string | undefined => {
  const n = /^([A-Za-z_$][\w$]*)/u.exec(token)?.[1];
  return n !== undefined && /[A-Z]/u.test(n) ? n : undefined;
};

const ticks = (text: string): string[] => [...text.matchAll(/`([^`]+)`/gu)].map((m) => m[1] ?? "");

type Claim = Readonly<{ name: string; published: boolean; clause: string }>;

/**
 * The subjects of the notes' three phrases in `## Unreleased`. A subject is the
 * run of backticked tokens joined by commas and *and* that ends at the phrase —
 * `` `AskAnswer` and `QuestionOutcome` are exported ``.
 */
function changelogClaims(changelog: string): Claim[] {
  // The heading, anchored: the preamble names `## Unreleased` in prose first, and
  // slicing from that mention read the preamble and nothing else (the guard below
  // is what caught it).
  const start = changelog.search(/^## Unreleased/mu);
  const rest = changelog.slice(start + 1);
  const next = rest.search(/^## /mu);
  const unreleased = next === -1 ? rest : rest.slice(0, next);
  const subject = String.raw`((?:\x60[^\x60]+\x60(?:,\s*|\s+and\s+))*\x60[^\x60]+\x60)\s+`;
  const phrases: readonly [RegExp, boolean][] = [
    [new RegExp(subject + String.raw`(?:is|are)\s+exported\b`, "gu"), true],
    [new RegExp(subject + String.raw`(?:is|are)\s+not\s+on\s+a\s+package\s+entry\s+point\b`, "gu"), false],
    [new RegExp(subject + String.raw`(?:is|are)\s+removed\s+from\s+the\s+public\s+API\b`, "gu"), false],
  ];
  const out: Claim[] = [];
  for (const [re, published] of phrases) {
    for (const m of unreleased.replace(/\*\*/gu, "").replace(/\s+/gu, " ").matchAll(re)) {
      for (const t of ticks(m[1] ?? "")) {
        const n = head(t);
        if (n !== undefined) out.push({ name: n, published, clause: m[0] });
      }
    }
  }
  return out;
}

/** MIGRATION §2's table rows, each as the backticked heads it names. */
function migrationRows(migration: string): { row: string; names: string[] }[] {
  const start = migration.search(/^## 2\. /mu);
  const rest = migration.slice(start + 1);
  const section = rest.slice(0, rest.search(/^## /mu));
  return section
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*-/u.test(l) && !/^\|\s*change\s*\|/u.test(l))
    // A table's escaped pipe (`handle \| reject`) needs no unescaping: only a
    // token's leading identifier is read. The unescape this once did survived its
    // mutation, which is how it was found to do nothing.
    .map((row) => ({ row, names: ticks(row).flatMap((t) => head(t) ?? []) }));
}

/** Each violation as one line: what the notes say, and what the surface says. */
function violations(
  claims: readonly Claim[],
  rows: readonly { row: string; names: string[] }[],
  published: ReadonlySet<string>,
  declared: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const c of claims) {
    if (published.has(c.name) !== c.published) {
      out.push(`CHANGELOG: ${c.name} — the notes say ${c.published ? "published" : "not published"}, the entries say ${published.has(c.name) ? "published" : "not"} («${c.clause}»)`);
    }
  }
  for (const r of rows) {
    for (const n of r.names) {
      if (declared.has(n) && !published.has(n)) out.push(`MIGRATION §2: ${n} is declared in dist/ and on no entry («${r.row}»)`);
    }
  }
  return out;
}

function tree(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    if (e === "bundle") return [];
    return statSync(p).isDirectory() ? tree(p) : p.endsWith(".d.ts") ? [p] : [];
  });
}

const ENTRIES: readonly string[] = (() => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    exports: Record<string, { types: string }>;
  };
  return Object.values(manifest.exports).map((e) => e.types.replace(/^\.\//u, ""));
})();

describe("C24 T2.35 (I44) — the release notes' claims about the surface resolve against it", () => {
  const built = ENTRIES.every((f) => existsSync(f));
  const published = built ? publishedNames((f) => readFileSync(f, "utf8"), ENTRIES) : new Set<string>();
  const declared = built ? declaredNames(tree("dist").map((f) => readFileSync(f, "utf8"))) : new Set<string>();
  const claims = changelogClaims(readFileSync("CHANGELOG.md", "utf8"));
  const rows = migrationRows(readFileSync("MIGRATION.md", "utf8"));

  it("dist/ is built and every population is non-empty", () => {
    // The row reads the declarations, so an unbuilt tree would empty `published`
    // and `declared` together and turn the §2 clause vacuous; `make test` builds.
    expect(ENTRIES.filter((f) => !existsSync(f)), "entries with no built declaration — run `npm run build`").toEqual([]);
    expect(published.size, "the entries publish nothing").toBeGreaterThan(100);
    // **SS26's guard.** Each population is a residue of prose, and prose rewritten
    // without the phrase is the same green as prose that is true.
    expect(claims.filter((c) => c.published).length, "no *is exported* clause was read").toBeGreaterThan(0);
    expect(claims.filter((c) => !c.published).length, "no *not on a package entry point* clause was read").toBeGreaterThan(0);
    expect(rows.length, "MIGRATION §2's table was not found").toBeGreaterThan(0);
    // A row whose every name is undeclared escapes the check entirely: `profileDeck`
    // removed and nothing else would be read as nothing.
    expect(
      rows.filter((r) => !r.names.some((n) => declared.has(n))).map((r) => r.row),
      "a §2 row names nothing dist/ declares, so nothing in it is checked",
    ).toEqual([]);
  });

  it("every name the notes call exported is published, every name they call unpublished is not, and §2 names only published types", () => {
    expect(violations(claims, rows, published, declared)).toEqual([]);
  });

  it("fires against fabricated notes, one violation for each clause", () => {
    // Nothing here reads the real tree. `Hidden` is declared and on no entry, as
    // `WatchItem` was; `Shown` is published.
    const pub = new Set(["Shown", "Glyph"]);
    const decl = new Set(["Shown", "Glyph", "Hidden"]);
    const changelog = [
      "# Changelog",
      "## Unreleased",
      "- **Things** (abc). `Shown` and `Hidden` are exported.",
      "- `Shown` is not on a package entry point. It is listed because …",
      "- **`gone` is removed from the public API** (def).",
      "## 0.0.1",
      "- `Hidden` is exported.",
    ].join("\n");
    const migration = [
      "## 2. Changes the compiler finds",
      "",
      "| change | what to do |",
      "|---|---|",
      "| `Glyph` `live` removed | Drop it. |",
      "| `Hidden.field` removed | Read `Shown.other`. |",
      "",
      "## 3. Next",
      "| `Hidden` | outside §2 |",
    ].join("\n");
    const found = violations(changelogClaims(changelog), migrationRows(migration), pub, decl);
    expect(found.map((v) => v.split(" — ")[0]?.split(" is declared")[0])).toEqual([
      "CHANGELOG: Hidden",
      "CHANGELOG: Shown",
      "MIGRATION §2: Hidden",
    ]);
  });
});
