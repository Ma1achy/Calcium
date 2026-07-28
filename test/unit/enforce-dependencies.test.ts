// A03 SS31 — which sections of DEPENDENCIES.md count as a justification.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { justifiedIn } from "../../tools/enforce/dependencies.mjs";

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
