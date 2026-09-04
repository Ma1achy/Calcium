// The builders' text options — `TextOpts` split so a `colormap` cannot reach a
// block with nowhere to put it (C04 I90, F207).
//
// **The refusal is at compile time**, which is why the first assertion is a
// `@ts-expect-error`: `tsc --noEmit -p .` covers `test/`, so the day `b.rule`
// accepts a `colormap` again this directive is unused and the typecheck fails.
// The runtime assertions beside it are what a reader sees; the directive is
// what the gate sees.
import { describe, expect, it } from "vitest";
import { b } from "../../src/shell/builders/index.js";

describe("C24 §4 — TextOpts and ValuedTextOpts", () => {
  it("(C04 I90, F207) b.rule refuses a colormap at the type, and b.raw and b.notice carry one", () => {
    // @ts-expect-error — `Rule` has no `colormap`; the option lives on `ValuedTextOpts`, which `rule` does not take.
    const rule = b.rule("h", undefined, { colormap: "viridis" });
    expect(rule, "and the builder writes none even when handed one").not.toHaveProperty("colormap");
    expect(b.rule("h", undefined, { spans: [{ from: 0, to: 1, tone: "identifier" }] })).toMatchObject({ spans: [{ from: 0, to: 1, tone: "identifier" }] });

    expect(b.raw("alpha", { colormap: "viridis", spans: [{ from: 0, to: 5, value: 0.5 }] })).toMatchObject({ colormap: "viridis" });
    expect(b.notice.ok("alpha", { colormap: "magma", spans: [{ from: 0, to: 5, value: 1 }] })).toMatchObject({ colormap: "magma" });
    expect(b.notice("info", "alpha", undefined, { colormap: "plasma" })).toMatchObject({ colormap: "plasma" });
    expect(b.raw("alpha")).not.toHaveProperty("colormap");
  });
});
