/**
 * C04 — the gate half of §3am.1, I91, I92 and I93: the members the owed pass
 * admitted, refused where their rulings say and accepted where they say.
 *
 * The rendering half of each row lives with its renderer (C09, C25, C12); this
 * file is what lands with the type so the invariant is named the day it exists.
 */
import { describe, expect, it } from "vitest";
import { validateDocument, type Block } from "../../src/data/viewmodel/index.js";
import { ONE_PER_KIND, doc } from "../support/blocks.js";
import { measurable } from "../support/render.js";

const errorsOf = (blocks: readonly Block[]): string => {
  const r = validateDocument(doc({ blocks }));
  return r.ok ? "" : r.error.join("\n");
};

describe("C04 §3am.1 (C04 I89, C04 I90) — tone and value on a span", () => {
  it("T2.35 (C04 I89): a span's tone is one of TONES, and anything else is one error naming the span", () => {
    const ok = errorsOf([{ kind: "notice", id: "n", tone: "default", text: "let x = 1", spans: [{ from: 4, to: 5, tone: "identifier" }] } as Block]);
    expect(ok).toBe("");
    const bad = errorsOf([{ kind: "notice", id: "n", tone: "default", text: "let x = 1", spans: [{ from: 4, to: 5, tone: "purple" }] } as unknown as Block]);
    expect(bad).toContain("spans[0]");
    expect(bad).toContain("tone");
    expect(bad).toContain("I89");
  });

  it("T2.36 (C04 I90): a value is in [0, 1], and it needs the block's colormap", () => {
    const valued = (value: unknown, colormap?: string): string =>
      errorsOf([{ kind: "raw", id: "r", text: "alpha beta", ...(colormap === undefined ? {} : { colormap }), spans: [{ from: 0, to: 5, value }] } as unknown as Block]);
    expect(valued(0.5, "viridis")).toBe("");
    expect(valued(1.5, "viridis")).toContain("[0, 1]");
    expect(valued(Number.NaN, "viridis")).toContain("[0, 1]");
    expect(valued("0.5", "viridis")).toContain("[0, 1]");
    expect(valued(0.5)).toContain("colormap");
    expect(valued(0.5, "not-a-map")).toContain("colormap");
  });

  it("T2.36 (C04 I90): notice takes the same colormap and the same refusal", () => {
    const ok = errorsOf([{ kind: "notice", id: "n", tone: "default", text: "alpha beta", colormap: "magma", spans: [{ from: 6, to: 10, value: 0 }] } as unknown as Block]);
    expect(ok).toBe("");
    const none = errorsOf([{ kind: "notice", id: "n", tone: "default", text: "alpha beta", spans: [{ from: 6, to: 10, value: 0 }] } as unknown as Block]);
    expect(none).toContain("I90");
  });

  it("T2.36 (C04 I90): colormap on a rule is one gate error — a rule has no valued span", () => {
    const r = errorsOf([{ kind: "rule", id: "r", label: "x", colormap: "viridis" } as unknown as Block]);
    expect(r).toContain("colormap");
    expect(r).toContain("I90");
  });
});

describe("C04 I91 — a hunk line's spans are attributes only", () => {
  const patch = (spans: readonly Record<string, unknown>[]): Block =>
    ({
      kind: "patch", id: "p", path: "a.ts", language: "typescript",
      hunks: [{ header: "@@ -1 +1 @@", lines: [
        { kind: "remove", text: "const a = 1;", spans },
        { kind: "add", text: "const a = 2;", spans },
      ] }],
    }) as unknown as Block;

  it("T2.37 (C04 I91): underline spans on a hunk line validate, and tone or value on one is refused", () => {
    expect(errorsOf([patch([{ from: 10, to: 11, underline: true }])])).toBe("");
    const toned = errorsOf([patch([{ from: 10, to: 11, tone: "error" }])]);
    expect(toned).toContain("hunks[0].lines[0]");
    expect(toned).toContain("I91");
    const valued = errorsOf([patch([{ from: 10, to: 11, value: 0.5 }])]);
    expect(valued).toContain("I91");
    const past = errorsOf([patch([{ from: 10, to: 99, underline: true }])]);
    expect(past, "the ordinary span gate runs on a hunk line too").toContain("past the end");
  });
});

describe("C04 I92 — a weighted edge is a sankey's", () => {
  const flow = (form: "graph" | "sankey", edges: readonly Record<string, unknown>[]): Block =>
    ({ kind: "plot", id: "s", form, height: 6, series: [], graph: { nodes: [{ id: "a" }, { id: "x" }, { id: "y" }], edges } }) as unknown as Block;

  it("T2.38 (C04 I92): every sankey edge carries a positive finite weight and a graph edge carries none", () => {
    expect(errorsOf([flow("sankey", [{ from: "a", to: "x", weight: 3 }, { from: "a", to: "y", weight: 1 }])])).toBe("");
    expect(errorsOf([flow("sankey", [{ from: "a", to: "x", weight: 3 }, { from: "a", to: "y" }])])).toContain("edges[1]");
    expect(errorsOf([flow("sankey", [{ from: "a", to: "x", weight: 0 }])])).toContain("positive");
    expect(errorsOf([flow("sankey", [{ from: "a", to: "x", weight: Number.POSITIVE_INFINITY }])])).toContain("positive");
    expect(errorsOf([flow("graph", [{ from: "a", to: "x", weight: 3 }])])).toContain("I92");
    expect(errorsOf([flow("graph", [{ from: "a", to: "x" }])])).toBe("");
  });

  it("T2.38 (C04 I92): sankey takes `graph` on graph's own rule", () => {
    const bare = errorsOf([{ kind: "plot", id: "s", form: "sankey", height: 6, series: [] } as unknown as Block]);
    expect(bare).toContain('"sankey" with no "graph"');
    const both = errorsOf([{ ...(flow("sankey", [{ from: "a", to: "x", weight: 1 }]) as object), hierarchy: { label: "root" } } as unknown as Block]);
    expect(both).toContain("one data shape");
  });
});

describe("C04 I93 — the frame is view state, never geometry", () => {
  it("T2.39 (C04 I93): measure of a decodable image is its declared height at every width, whatever its identity", () => {
    // **The GIF half of this row is `test/edge/image-frames.test.ts`**, landing
    // with the decoder: measured before it existed, GIF bytes fell to the `alt`
    // fallback and measured 1 where the PNG measured 3 — so "never geometry"
    // is a claim about *decodable* bytes, and the decoder is what makes a GIF one.
    const r = measurable({});
    const still = ONE_PER_KIND.image;
    const other = { ...still, digest: "00000002" } as Block;
    for (const width of [1, 8, 40, 120]) {
      expect(r.measure(other, width)).toBe(r.measure(still, width));
    }
  });
});
