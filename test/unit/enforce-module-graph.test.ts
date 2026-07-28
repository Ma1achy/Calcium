// A03 MG1/MG3 — the layer rule itself. Fabricated modules at layer paths, with
// the reader injected, so no fixture touches src/.
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";

const check = (files: Record<string, string>) =>
  checkModuleGraph(Object.keys(files), (f) => files[f] ?? "");

describe("A03 module graph", () => {
  it("MG3: a type-only import across L0's halves is not an edge", () => {
    // C01 needs C02's TerminalCapabilities while genuinely not importing C02.
    // The same shape across the halves is what this asserts is permitted.
    expect(
      check({
        "src/terminal/lifecycle.ts": `import type { Row } from "../data/viewmodel/index.js";`,
      }),
    ).toEqual([]);

    expect(
      check({
        "src/terminal/lifecycle.ts": `export type { Row } from "../data/viewmodel/index.js";`,
      }),
    ).toEqual([]);
  });

  it("MG3: a value import of the same symbol is an edge, and fails", () => {
    const violations = check({
      "src/terminal/lifecycle.ts": `import { Row } from "../data/viewmodel/index.js";`,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("MG3");
    expect(violations[0]!.message).toContain("terminal → data");
  });

  it("MG3: an inline type import in a mixed statement still emits, so it is an edge", () => {
    // `import { type X, y }` keeps the statement at runtime — y is a real edge.
    const violations = check({
      "src/terminal/lifecycle.ts": `import { type Row, makeRow } from "../data/viewmodel/index.js";`,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("MG3");
  });

  it("MG1: an upward import fails; a downward one does not", () => {
    const up = check({
      "src/presentation/table.ts": `import { render } from "../viewport/viewport.js";`,
    });
    expect(up).toHaveLength(1);
    expect(up[0]!.rule).toBe("MG1");
    expect(up[0]!.message).toContain("L1 presentation → L2 viewport");

    expect(
      check({
        "src/viewport/viewport.ts": `import { render } from "../presentation/table.js";`,
      }),
    ).toEqual([]);
  });

  it("MG1: an upward type-only import is also not an edge", () => {
    expect(
      check({
        "src/presentation/table.ts": `import type { Viewport } from "../viewport/viewport.js";`,
      }),
    ).toEqual([]);
  });

  it("a bare side-effect import is still an edge", () => {
    const violations = check({
      "src/terminal/lifecycle.ts": `import "../data/transport.js";`,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("MG3");
  });
});
