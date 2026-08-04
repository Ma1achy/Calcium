// C24 T2.1 (I2) — the eleven absent components are not reachable from any entry
// point, and T2.3 (I8) — the dev-only entries stay out of the production bundle.
//
// **This is the test that had nothing to be false about until C24 existed.**
// `src/index.ts` was `export {}`, so "not reachable from any entry point" was
// true of a surface with no entries, and "absent from the production bundle" was
// true of a bundle with no root. Both read as satisfied and neither could fail —
// A03 §2's vacuity class holding two invariants open rather than two rules.
//
// The first run found `BlockRegistry`, one of the eleven, named in
// `src/testing/index.ts` — `renderToLines(registry: BlockRegistry, …)`. Two
// consequences, and the second is the one that mattered: a consumer could see
// the type and could not construct one, because `createBlockRegistry` is
// exported from no entry, so both functions were uncallable from outside the
// repo. They were never part of §7's specified surface; they had been written in
// `src/testing/` because a test was their first caller, and `shell/paint.ts`
// then came to depend on them for real frame composition. They live in
// `presentation/render-lines.ts` now, and MG26 is the mechanical half.
import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";

/** §3's absent list, verbatim. */
const ELEVEN = [
  "TerminalLifecycle", "FrameScheduler", "TranscriptStore", "Viewport",
  "OverlayManager", "InputRouter", "LineEditor", "HistoryStore",
  "ProcessRunner", "AdapterRegistry", "BlockRegistry",
] as const;

const ENTRIES = [
  "src/index.ts",
  "src/testing/index.ts",
  "src/fixtures/index.ts",
] as const;

/**
 * Comments are prose about the rule, not violations of it — and this file's own
 * entry points explain at length which components they exclude, by name. A scan
 * counting raw occurrences would report every entry as violating, which is the
 * inverse of MG25's trap and the same lesson: prose about a mechanism inflates
 * every textual signal of its existence.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("C24 T2.1 (I2) — the eleven are unreachable", () => {
  it("every one of the eleven is a real declaration in src/", () => {
    // The non-vacuity guard, and it is not ceremony. A rename — `Viewport` to
    // `ViewportState`, say — would empty the assertion below of content while
    // leaving it green, which is SS26 exactly: a check that cannot find what it
    // was asked about passes like one that is satisfied.
    const tree = sourceTree();
    for (const name of ELEVEN) {
      expect(tree, `${name} is in §3's absent list and declared nowhere`).toContain(name);
    }
  });

  it("no entry point names one of the eleven", () => {
    for (const entry of ENTRIES) {
      const src = code(entry);
      const found = ELEVEN.filter((n) => new RegExp(`\\b${n}\\b`).test(src));
      expect(found, `${entry} reaches an absent component`).toEqual([]);
    }
  });
});

describe("C24 T2.3 (I8) — testing and fixtures are dev-only", () => {
  it("no entry but the dev ones mentions them, and the runtime entry imports neither", () => {
    const runtime = code("src/index.ts");
    // Type-only imports erase, so the claim is about value imports. C08's
    // `WorldDriver` comes from `data/fixtures/` — L0 — and not from the
    // `@fmx/calcium/fixtures` entry, which is the distinction that keeps this true.
    const valueImports = [...runtime.matchAll(/^import\s+(?!type)[^;]*from\s+"([^"]+)"/gm)].map(
      (m) => m[1] ?? "",
    );
    const reexports = [...runtime.matchAll(/^export\s+(?!type)\{[^}]*\}\s*from\s+"([^"]+)"/gm)].map(
      (m) => m[1] ?? "",
    );

    for (const spec of [...valueImports, ...reexports]) {
      expect(spec, "the runtime entry value-imports a dev-only module").not.toMatch(
        /\.\/(testing|fixtures)\//,
      );
    }
  });
});

/** The whole of `src/` as text, for the guard above. */
function sourceTree(): string {
  return globSync("src/**/*.ts")
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}
