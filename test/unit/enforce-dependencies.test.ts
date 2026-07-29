// A03 SS31 — which sections of DEPENDENCIES.md count as a justification.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPhantomImports, justifiedIn } from "../../tools/enforce/dependencies.mjs";

const DOC = `# Dependencies

## Runtime — two

| Package | Why it cannot be internal | Owner |
|---|---|---|
| \`ink\` | The reconciler | — |

## Development

| Package | Why | Owner |
|---|---|---|
| \`vitest\` | Test runner | — |

## What is deliberately NOT a dependency

| Not installed | Instead | Because |
|---|---|---|
| \`typescript-eslint\` | \`tsc --strict\` | 87 packages |

## Adding one

| \`something-else\` | prose | — |
`;

describe("A03 SS31", () => {
  it("counts only the Runtime and Development tables", () => {
    expect(justifiedIn(DOC)).toEqual(new Set(["ink", "vitest"]));
  });

  it("a backticked package in the NOT table is not a justification", () => {
    // Scraping the whole document reported it as "justified but not installed —
    // stale entry", which is precisely backwards: that table is prose about
    // absence, and naming a package there must never imply it is installed.
    const justified = justifiedIn(DOC);
    expect(justified.has("typescript-eslint")).toBe(false);
    expect(justified.has("something-else")).toBe(false);
  });

  it("the real DEPENDENCIES.md names exactly the installed packages", () => {
    const justified = justifiedIn(readFileSync("DEPENDENCIES.md", "utf8"));
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    expect([...justified].sort()).toEqual([...installed].sort());
  });
});

describe("SS38 — phantom imports", () => {
  const manifest = JSON.stringify({
    dependencies: { ink: "7.1.1", lowlight: "3.3.0", react: "19.2.8" },
    devDependencies: { vitest: "4.1.10" },
  });

  it("fires on the case it was written for: highlight.js, imported and undeclared", () => {
    // The real history. `lowlight` depends on `highlight.js`, npm hoisted it,
    // `src/` imported it directly, and every gate passed — SS31 compares the
    // manifest against DEPENDENCIES.md and both were clean about a package that
    // appeared in neither.
    const violations = checkPhantomImports(["src/presentation/blocks/kinds/code.ts"], {
      readFile: (f: string) =>
        f === "package.json"
          ? manifest
          : 'import yaml from "highlight.js/lib/languages/yaml";',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("SS38");
    expect(violations[0]?.message).toContain("highlight.js");
    expect(violations[0]?.message, "and says why resolving is not the same as declared").toContain(
      "phantom",
    );
  });

  it("fires on a devDependency imported from src/", () => {
    // A consumer's install has no devDependencies, so this resolves in the repo
    // and fails on `npm install` — the same failure arriving through a
    // different door.
    const violations = checkPhantomImports(["src/shell/session.ts"], {
      readFile: (f: string) =>
        f === "package.json" ? manifest : 'import { expect } from "vitest";',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("devDependency");
  });

  it("permits a declared dependency, a deep path into one, and a node builtin", () => {
    // The half a fabricated violation cannot show. A rule that failed on
    // `node:fs` or on `ink/build/...` would be reverted within the hour.
    const violations = checkPhantomImports(["src/a.ts", "src/b.ts", "src/c.ts"], {
      readFile: (f: string) => {
        if (f === "package.json") return manifest;
        if (f === "src/a.ts") return 'import { Box } from "ink";';
        if (f === "src/b.ts") return 'import { readFileSync } from "node:fs";';
        return 'import { createLowlight } from "lowlight/lib/index.js";';
      },
    });

    expect(violations).toEqual([]);
  });

  it("ignores tests, which may import whatever they like", () => {
    const violations = checkPhantomImports(["test/unit/x.test.ts"], {
      readFile: (f: string) => (f === "package.json" ? manifest : 'import { it } from "vitest";'),
    });

    expect(violations).toEqual([]);
  });
});
