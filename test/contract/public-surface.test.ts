// C24 T2.21 (I34) — a consumer does not index a published type to recover a
// name `src/` already declares.
//
// **The population is the consumers' index expressions, not the surface's member
// list**, and that is the ruling rather than a convenience. Fifty named types sit
// in the type position of a published member and are not published themselves;
// most are a property of the single owner that names them, where `Owner["member"]`
// is the right spelling and a second name would be a second record. The two that
// were wrong were the two an app *reached for* — `Plot["form"]` for `PlotForm` and
// `NonNullable<Plot["camera"]>` for `Camera` — and nothing but the app could say
// so, because inside this package every caller imports the declaration from
// `data/viewmodel` directly (F999, C24 §8e).
//
// Both spellings compile, which is the direction that makes this silent: an index
// expression is a correct way to *spell* a type and a wrong way to *name* one.
// `PlotForm` came back into an app file under the framework's own name, beside a
// comment describing the framework's declaration — the drift `LocalContext` was
// published to prevent, reached through an index instead of by hand.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Prose about a rule is not a violation of it (MG25's trap, T2.1's `code`). */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

function tree(dir: string, keep: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    if (e === "node_modules" || e === "dist") return [];
    return statSync(p).isDirectory() ? tree(p, keep) : keep(p) ? [p] : [];
  });
}

/**
 * The entry points, **read from `package.json`** for T2.1's reason: a second
 * record of a set drifts, and always in the direction *the new one is missing*.
 */
const ENTRIES: readonly string[] = (() => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    exports: Record<string, { default: string }>;
  };
  return Object.values(manifest.exports).map((e) =>
    e.default.replace(/^\.\/dist\//u, "src/").replace(/\.js$/u, ".ts"),
  );
})();

const SRC = tree("src", (f) => f.endsWith(".ts"));
const SOURCE = new Map(SRC.map((f) => [f, code(readFileSync(f, "utf8"))]));

/** Every name any entry point publishes, whether as a type or as a value. */
function publishedNames(read: (f: string) => string, entries: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    for (const m of read(entry).matchAll(/export\s+(?:type\s*)?\{([^}]*)\}/gu)) {
      for (const part of (m[1] ?? "").split(",")) {
        const n = part.trim().replace(/^type\s+/u, "").split(/\s+as\s+/u).pop()?.trim();
        if (n !== undefined && n !== "") out.add(n);
      }
    }
  }
  return out;
}

/**
 * The utility constructors a member's type wraps its own type in. Skipped rather
 * than reported, because `Partial<Camera>` is a statement about `Camera` — and
 * taking the first capitalised token was this resolver's first defect, which
 * would have answered `Partial` for the finding's own instance.
 */
const WRAPPER =
  /^(Readonly|ReadonlyArray|ReadonlyMap|ReadonlySet|Partial|Required|Pick|Omit|Exclude|Extract|NonNullable|Record|Map|Set|Array|Promise|Awaited|string|number|boolean|null|undefined|void|unknown|never|any)$/u;

/**
 * `Owner.member`'s declared type name, or `undefined` when the member's type is
 * an inline union `src/` never named — the second of the two ways a candidate
 * clears, and the one `TerminalCapabilities["imageProtocol"]` takes.
 */
function declaredTypeOf(
  owner: string,
  member: string,
  sources: ReadonlyMap<string, string>,
): string | undefined {
  for (const text of sources.values()) {
    const at = new RegExp(`export\\s+(?:type|interface)\\s+${owner}\\b`, "u").exec(text);
    if (at === null) continue;
    const rest = text.slice((at.index ?? 0) + 1);
    const end = rest.search(/^export\s/mu);
    const body = end === -1 ? rest : rest.slice(0, end);
    // **The delimiter is `^`, `{`, `;` or `,` and not `^` alone**, which was this
    // resolver's second defect: every type in `src/` spans lines, so a line-start
    // anchor resolves the whole tree and cannot see a one-line declaration — and
    // the fabricated violation is exactly a one-line declaration. A rule that
    // works on the corpus and not on its own fabrication is a rule whose
    // fabrication is vacuous.
    const at2 = new RegExp(`(?:^|[{;,])\\s*(?:readonly\\s+)?${member}\\??:\\s*([^;\\n]+)`, "mu").exec(body);
    if (at2 === null) continue;
    for (const named of (at2[1] ?? "").matchAll(/\b([A-Z]\w*)\b/gu)) {
      if (!WRAPPER.test(named[1] ?? "")) return named[1];
    }
    return undefined;
  }
  return undefined;
}

/** Every `Owner["member"]` an app wrote, published owners only. */
function indexExpressions(
  appFiles: readonly string[],
  read: (f: string) => string,
  published: ReadonlySet<string>,
): { file: string; owner: string; member: string }[] {
  const out: { file: string; owner: string; member: string }[] = [];
  for (const file of appFiles) {
    for (const m of code(read(file)).matchAll(/\b([A-Z]\w*)\s*\[\s*"(\w+)"\s*\]/gu)) {
      const [, owner = "", member = ""] = m;
      if (published.has(owner)) out.push({ file, owner, member });
    }
  }
  return out;
}

const APPS = ["examples/docker", "examples/plots"].flatMap((d) =>
  tree(d, (f) => f.endsWith(".ts") && !f.endsWith(".d.ts")),
);

describe("C24 T2.21 (I34) — a consumer does not index for a name src/ declares", () => {
  const published = publishedNames((f) => SOURCE.get(f) ?? "", ENTRIES);
  const found = indexExpressions(APPS, (f) => readFileSync(f, "utf8"), published);

  it("the scan finds index expressions at all", () => {
    // **SS26's guard, and it is not ceremony here.** The subject is a *residue*,
    // so an app rewritten without a single index expression empties the
    // population and every assertion below passes by finding nothing — the same
    // green as a tree that is clean.
    expect(found.length, "no app indexes a published type — the population is empty").toBeGreaterThan(0);
    expect(
      new Set(APPS.map((f) => f.split("/")[1])),
      "both apps are in the population",
    ).toEqual(new Set(["docker", "plots"]));
  });

  // **This row is the residue and the next one is the watch, measured rather than
  // assumed.** Removing `Camera` and `PlotForm` from `src/index.ts` and running
  // this file leaves *this* row green and fails only the resolution row below:
  // the fix deleted the app's index expressions, so the population this row scans
  // is empty of them and stays empty whatever the surface does. It under-reports
  // by construction and can only ever be re-armed by an app indexing again —
  // which is the right shape for a residue and the wrong one for a gate, and is
  // why the two names below are asserted against the published set directly.
  it("every indexed member's declared type is published, or src/ never named it", () => {
    const unnameable = found
      .map((e) => ({ ...e, type: declaredTypeOf(e.owner, e.member, SOURCE) }))
      .filter((e) => e.type !== undefined && !published.has(e.type))
      .map((e) => `${e.file}: ${e.owner}["${e.member}"] → ${String(e.type)}`);

    expect(
      unnameable.sort(),
      "an app indexed a published type to recover a name src/ declares and no entry publishes",
    ).toEqual([]);
  });

  it("the two clearances are two arms, and neither is a special case", () => {
    // `Series["tone"]` clears because `Tone` **is** published; the resolver has
    // to reach the name for that to mean anything.
    expect(declaredTypeOf("Series", "tone", SOURCE), "Series.tone resolves").toBe("Tone");
    expect(published.has("Tone"), "and Tone is published").toBe(true);

    // `TerminalCapabilities["imageProtocol"]` clears because the member's type is
    // an inline union with no name — nothing to publish, so nothing to fix.
    expect(
      declaredTypeOf("TerminalCapabilities", "imageProtocol", SOURCE),
      "imageProtocol is an inline union src/ never named",
    ).toBeUndefined();

    // **The finding's own two, resolved rather than restated** — a row that
    // asserted the names would agree with itself whatever the tree said.
    expect(declaredTypeOf("Plot", "form", SOURCE), "Plot.form resolves").toBe("PlotForm");
    expect(declaredTypeOf("Plot", "camera", SOURCE), "Plot.camera resolves past Partial<>").toBe("Camera");
    expect(published.has("PlotForm") && published.has("Camera"), "and both are published (F999)").toBe(true);
  });

  it("fires against a fabricated surface", () => {
    // The fabricated violation: an app indexing a published owner for a member
    // whose declared type is interior. Nothing here touches the real tree, so a
    // green suite over a clean repository is not what is being read.
    const files: Record<string, string> = {
      "src/index.ts": 'export type { Plot } from "./a.js";\n',
      "src/a.ts": "export type Plot = Readonly<{ form: PlotForm; label: string }>;\nexport type PlotForm = \"line\" | \"bar\";\n",
      "app/main.ts": 'type F = Plot["form"];\nconst t: Plot["label"] = "x";\n',
    };
    const read = (f: string): string => files[f] ?? "";
    const sources = new Map([["src/a.ts", code(files["src/a.ts"] ?? "")]]);
    const pub = publishedNames(read, ["src/index.ts"]);

    const hits = indexExpressions(["app/main.ts"], read, pub);
    expect(hits.map((h) => h.member).sort(), "both indexes are seen").toEqual(["form", "label"]);

    const bad = hits
      .map((h) => declaredTypeOf(h.owner, h.member, sources))
      .filter((t) => t !== undefined && !pub.has(t));
    expect(bad, "`form` fires and `label` clears — a string has no name to publish").toEqual([
      "PlotForm",
    ]);
  });
});
