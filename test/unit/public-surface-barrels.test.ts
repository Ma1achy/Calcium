// F1000 (for F625) — who consumes a line on a component's barrel.
//
// **The subject is the re-export, not the symbol**, and that distinction is the
// whole of why MG25 could not answer. MG25 asks whether an exported function is
// named elsewhere under `src/` with comments stripped; `decodePng` is called by
// `decodeImage` one screen below in the file that declares it, so the function
// has a consumer and the *line in `index.ts`* was never the thing being counted.
//
// F625 recorded that line as consumed only by `codec.ts` and by tests. Measured
// here it is not: `examples/plots/tools/fixtures.mjs` imports it through this
// barrel, out of `dist/`, to gate an eight-file PNG corpus — six that must read
// and two that must refuse — and `decodeImage` cannot stand in for it, because a
// PNG-specific refusal reported by the dispatching front door is a dispatch.
//
// **And it was not the line worth the finding.** Three names on this barrel have
// no consumer anywhere through any route, and none of the three is reachable by
// MG25 at all: it walks `export function` and `export class`, so two constants
// and a type alias are outside its *subject* rather than inside its blind spot.
// Recorded here by equality rather than deleted, because the declarations they
// re-export live in files this change does not own.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const BARREL = "src/presentation/image/index.ts";

/** Prose about a seam is not a use of it — MG25's own correction (A03 §3). */
const code = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");

function tree(dir: string, keep: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    if (e === "node_modules" || e === "dist") return [];
    return statSync(p).isDirectory() ? tree(p, keep) : keep(p) ? [p] : [];
  });
}

/** Every name the barrel re-exports, in declaration order. */
function barrelNames(text: string): string[] {
  const out: string[] = [];
  for (const m of code(text).matchAll(/export\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/gu)) {
    for (const part of (m[1] ?? "").split(",")) {
      const n = part.trim().replace(/^type\s+/u, "").split(/\s+as\s+/u).pop()?.trim();
      if (n !== undefined && n !== "") out.push(n);
    }
  }
  return out;
}

/**
 * The files that import a name **through the barrel**, static or dynamic.
 *
 * A direct import from `./codec.js` keeps the function alive and says nothing
 * about the re-export, so it does not count here — which is the difference
 * between this row and MG25 stated as code.
 */
function importersOf(name: string, files: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  const through = (spec: string): boolean => /image\/index\.js$/u.test(spec);
  for (const [f, text] of files) {
    if (f === BARREL) continue;
    for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gu)) {
      if (!through(m[2] ?? "")) continue;
      for (const part of (m[1] ?? "").split(",")) {
        if (part.trim().replace(/^type\s+/u, "").split(/\s+as\s+/u)[0]?.trim() === name) out.push(f);
      }
    }
    for (const m of text.matchAll(/\{([^}]*)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']/gu)) {
      if (!through(m[2] ?? "")) continue;
      for (const part of (m[1] ?? "").split(",")) {
        if (part.trim().split(":")[0]?.trim() === name) out.push(f);
      }
    }
  }
  return [...new Set(out)];
}

/** Read once and stripped once — nineteen names over the same tree otherwise. */
const POPULATION: ReadonlyMap<string, string> = new Map(
  [
    ...tree("src", (f) => f.endsWith(".ts")),
    ...tree("test", (f) => f.endsWith(".ts")),
    ...tree("tools", (f) => f.endsWith(".ts") || f.endsWith(".mjs")),
    ...tree("examples/plots", (f) => f.endsWith(".ts") || f.endsWith(".mjs")),
    ...tree("examples/docker", (f) => f.endsWith(".ts") || f.endsWith(".mjs")),
  ].map((f) => [f, code(readFileSync(f, "utf8"))]),
);

/**
 * Named on the barrel and imported through it by nobody, **compared by
 * equality**. A name that gains a consumer, or loses its declaration, fails here
 * until someone rules on it — the arm every too-permissive list in this
 * repository was missing.
 */
const NO_IMPORTER: readonly string[] = [
  // `codec.ts` exports the marker so `tools/enforce/refusals.mjs` can grep for
  // the *call form*; the register watches the string `"decodeJpeg"` and never
  // the symbol, so the re-export excuses nothing and the register stays green
  // without it.
  "DECODE_JPEG_IS_NOT_BUILT",
  // `halfblock.ts`'s lower half-block. `HALF_BLOCK` has five importers; this one
  // has none, and the pair is what makes it visible — a set named for its first
  // member, checked at member two.
  "HALF_BLOCK_LOWER",
  // Used inside `halfblock.ts`'s own signature and nowhere else. A type alias is
  // outside MG25's subject entirely.
  "HalfCell",
];

describe("F1000 (for F625) — a barrel line's consumers", () => {
  const names = barrelNames(readFileSync(BARREL, "utf8"));

  // **This row is what watches the barrel, and it was measured rather than
  // assumed.** Deleting `decodePng` from `index.ts` and running this file fails
  // *here* and not in the row below it: `importersOf` reads what the consumers
  // wrote, and a consumer's `import { decodePng } from ".../image/index.js"` is
  // unchanged by the export going away. The row below asks who wants the line;
  // this one asks whether the line is there.
  it("the barrel is read and the population is not empty", () => {
    // SS26: a resolver that finds nothing passes exactly like a clean tree, and
    // every assertion below is over a set this one has to produce first.
    expect(names.length, "the barrel re-exports nothing — the scan is broken").toBeGreaterThan(10);
    expect(names, "decodePng is on the barrel, which is what F625 is about").toContain("decodePng");
    expect(POPULATION.size, "no files scanned").toBeGreaterThan(100);
  });

  it("decodePng's barrel line has a non-test consumer, and it is the fixture generator", () => {
    const importers = importersOf("decodePng", POPULATION);
    const outside = importers.filter((f) => !f.startsWith("test/"));

    expect(
      outside,
      "F625 said `codec.ts` and tests; the generator that gates the PNG corpus is neither",
    ).toEqual(["examples/plots/tools/fixtures.mjs"]);

    // The tests are the rest of the line's load, and they want the *specific*
    // decoder: `image-frames` asserts `decodePng(gif).ok === false` while the
    // front door dispatches the same bytes to `decodeGif` and succeeds.
    expect(importers.length, "five test files and the generator").toBe(6);
  });

  it("the generator uses it for a PNG-specific refusal the front door cannot report", () => {
    const gen = readFileSync("examples/plots/tools/fixtures.mjs", "utf8");
    expect(gen, "imported through the barrel rather than from codec.js").toContain(
      'await import("../../../dist/presentation/image/index.js")',
    );
    // The two fixtures whose whole purpose is a refusal. A generator that only
    // ever decoded readable files would be satisfied by `decodeImage`.
    expect(gen).toContain('"interlaced.png": "refuses"');
    expect(gen).toContain('"depth16.png": "refuses"');
  });

  it("the residue is three names, compared by equality", () => {
    const orphans = names.filter((n) => importersOf(n, POPULATION).length === 0);
    expect(
      orphans.sort(),
      "a barrel line nobody imports — wire it, drop it, or rule on it here",
    ).toEqual([...NO_IMPORTER].sort());
  });

  it("MG25 cannot reach any of the three, by its subject and not by its blind spot", () => {
    const rule = readFileSync("tools/enforce/module-graph.mjs", "utf8");
    // The declaration pattern MG25 walks, read from the rule rather than
    // restated — a fixture holding its own copy agrees with itself forever.
    expect(rule, "MG25 walks functions and classes").toContain(
      "/^export (?:function\\*? |async function |class )([A-Za-z_$][\\w$]*)/gm",
    );

    const decls = [
      readFileSync("src/presentation/image/codec.ts", "utf8"),
      readFileSync("src/presentation/image/halfblock.ts", "utf8"),
    ].join("\n");
    for (const name of NO_IMPORTER) {
      expect(
        new RegExp(`^export (?:function\\*? |async function |class )${name}\\b`, "mu").test(decls),
        `${name} would be MG25's subject — the residue would not need recording here`,
      ).toBe(false);
      expect(
        new RegExp(`^export (?:const|type) ${name}\\b`, "mu").test(decls),
        `${name} is declared as a const or a type alias, which MG25 does not walk`,
      ).toBe(true);
    }
  });
});
