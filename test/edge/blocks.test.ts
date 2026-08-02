// C09 tier 3 — the edges, where every arithmetic mistake shows.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { cells } from "../../src/presentation/text.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";

describe("C09 §6 — the transition table's remaining cells", () => {
  it("T3.1: measure before seal works", () => {
    const registry = createBlockRegistry({});
    expect(registry.measure(ONE_PER_KIND.rule, 80)).toBe(1);
  });

  it("T3.2 (I12): register after seal throws", () => {
    // A kind registered mid-session would let a block measured before
    // registration differ from the same block measured after — drift that only
    // appears on scrollback (§6).
    const registry = createBlockRegistry({});
    registry.seal();

    expect(() =>
      registry.register({ kind: "late", measure: () => 1, render: () => ONE_PER_KIND.rule as never }),
    ).toThrow(/sealed/);
  });

  it("T3.3: sealing twice is a no-op", () => {
    const registry = createBlockRegistry({});
    registry.seal();

    expect(() => registry.seal()).not.toThrow();
    expect(registry.sealed).toBe(true);
  });

  it("T3.18: registering over a default kind is rejected, not silently accepted", () => {
    // An app that shadows `logs` by accident gets a frame that is subtly wrong
    // everywhere and no way to find out why.
    const registry = createBlockRegistry({});

    expect(() =>
      registry.register({ kind: "logs", measure: () => 1, render: () => ONE_PER_KIND.rule as never }),
    ).toThrow(/already registered/);
  });
});

describe("C09 tier 3 — widths", () => {
  it("T3.8: width 1 → every kind measures ≥ 1 and renders something", () => {
    const kit = measurable();

    for (const fixture of Object.values(ONE_PER_KIND)) {
      const measured = kit.measure(fixture, 1);
      expect(measured, `${fixture.kind} at width 1`).toBeGreaterThanOrEqual(1);
      expect(kit.renderToLines(fixture, 1), `${fixture.kind} at width 1`).toHaveLength(measured);
    }
  });

  it("T3.9: width 0 is treated as 1 — no division by zero, no infinite loop", () => {
    const kit = measurable();

    for (const fixture of Object.values(ONE_PER_KIND)) {
      expect(kit.measure(fixture, 0), `${fixture.kind}`).toBe(kit.measure(fixture, 1));
    }
  });

  it("T3.10: text of exactly w, w-1 and w+1 cells → 1, 1 and 2 rows for a wrapped kind", () => {
    const kit = measurable();
    const noticeOf = (n: number): Block =>
      block({ kind: "notice", id: `n-${n}`, tone: "info", text: "x".repeat(n) });

    expect(kit.measure(noticeOf(39), 40)).toBe(1);
    expect(kit.measure(noticeOf(40), 40)).toBe(1);
    expect(kit.measure(noticeOf(41), 40)).toBe(2);
    expect(kit.renderToLines(noticeOf(41), 40)).toHaveLength(2);
  });

  it("T3.11: panel at width 2 → children measured at 0, clamped to 1", () => {
    // No negative width reaches a child, and the panel still draws a frame.
    const kit = measurable();
    const panel = block({
      kind: "panel",
      id: "p-narrow",
      title: "t",
      children: [{ kind: "raw", id: "p-narrow-r", text: "content" }],
    });

    expect(() => kit.measure(panel, 2)).not.toThrow();
    expect(kit.measure(panel, 2)).toBe(3);
    expect(kit.renderToLines(panel, 2)).toHaveLength(3);
  });

  it("T3.12: a group nested five deep totals correctly and does not overflow the stack", () => {
    let inner: Block = { kind: "raw", id: "deep-leaf", text: "leaf" };
    for (let depth = 0; depth < 5; depth += 1) {
      inner = block({
        kind: "group",
        id: `deep-${depth}`,
        direction: "column",
        children: [inner, { kind: "raw", id: `deep-${depth}-sib`, text: "sibling" }],
      });
    }

    const kit = measurable();
    expect(kit.measure(inner, 80), "one leaf and five siblings").toBe(6);
    expect(kit.renderToLines(inner, 80)).toHaveLength(6);
  });

  it("T3.15: pills whose chips exceed w wrap, and the wrap count is measured", () => {
    const kit = measurable();
    const pills = block({
      kind: "pills",
      id: "pills-many",
      chips: Array.from({ length: 12 }, (_, i) => ({ label: `filter-${i}` })),
    });

    for (const width of [20, 40, 80]) {
      expect(kit.renderToLines(pills, width), `width ${width}`).toHaveLength(
        kit.measure(pills, width),
      );
    }
    expect(kit.measure(pills, 20)).toBeGreaterThan(1);
  });

  it("T3.16: code containing tabs expands them before measuring", () => {
    const kit = measurable();
    const tabbed = block({
      kind: "code",
      id: "code-tabs",
      language: "yaml",
      text: "a:\n\tb: 1",
      wrap: true,
    });

    // The tab is eight cells, so at width 8 the second line takes two rows.
    // Measured as one cell it would be one row, and the block would be a row
    // short at every narrow width.
    expect(kit.measure(tabbed, 8)).toBe(3);
    expect(kit.renderToLines(tabbed, 8)).toHaveLength(3);
  });

  it("T3.17: a notice of 10,000 characters at width 80 measures and renders alike", () => {
    const kit = measurable();
    const huge = block({
      kind: "notice",
      id: "n-huge",
      tone: "info",
      text: "x".repeat(10_000),
    });

    expect(kit.measure(huge, 80)).toBe(125);
    expect(kit.renderToLines(huge, 80)).toHaveLength(125);
  });

  it("T3.4 (I5, the classic): a truncated logs line under ASCII ends in `~`, same row count", () => {
    const long = block({
      kind: "logs",
      id: "logs-ascii",
      lines: [{ ts: "12:00:01", level: "warn", message: "y".repeat(300) }],
    });

    const unicode = measurable();
    const ascii = measurable({ capabilities: ASCII_CAPS });

    expect(visible(unicode.renderToLines(long, 40)[0] ?? "").endsWith("…")).toBe(true);
    expect(visible(ascii.renderToLines(long, 40)[0] ?? "").endsWith("~")).toBe(true);
    expect(ascii.measure(long, 40)).toBe(unicode.measure(long, 40));
    expect(cells(visible(ascii.renderToLines(long, 40)[0] ?? ""))).toBe(
      cells(visible(unicode.renderToLines(long, 40)[0] ?? "")),
    );
  });

  it("T3.5 / T3.6 (I9): a cut never splits a cluster or half-draws a double-width glyph", () => {
    const kit = measurable();
    const zwj = block({
      kind: "logs",
      id: "logs-zwj",
      lines: [
        { ts: "1", level: "info", message: "ab👨‍👩‍👧‍👦cd" },
        { ts: "1", level: "info", message: "日本語です" },
      ],
    });

    for (const width of [8, 9, 10, 11, 12]) {
      for (const line of kit.renderToLines(zwj, width)) {
        expect(cells(visible(line)), `width ${width}`).toBeLessThanOrEqual(width);
        expect(visible(line).includes("\u200d"), "no orphaned joiner").toBe(false);
      }
    }
  });
});

describe("C09 tier 3 — containment", () => {
  /** A definition that fails in one half only, so the other's containment is visible. */
  function broken(part: "measure" | "render") {
    return {
      kind: "broken",
      measure: (): number => {
        if (part === "measure") throw new Error("measurer exploded");
        return 2;
      },
      render: (): never => {
        throw new Error("renderer exploded");
      },
    };
  }

  it("T3.13 (I11): a throwing renderer is contained to its block", () => {
    const registry = createBlockRegistry({});
    registry.register(broken("render") as never);

    const document = block({
      kind: "group",
      id: "g",
      direction: "column",
      children: [
        { kind: "raw", id: "before", text: "before" },
        { kind: "broken", id: "bad" } as unknown as Block,
        { kind: "raw", id: "after", text: "after" },
      ],
    });

    const lines = renderToLines(registry, document, 60, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
    }).map(visible);

    expect(lines[0]).toContain("before");
    expect(lines[1], "the failure is stated, not hidden").toContain("failed to render");
    expect(lines[2], "siblings are unaffected").toContain("after");
  });

  it("T3.14 (I11): a throwing measurer is contained and the block treated as one row", () => {
    // This one protects virtualisation rather than the frame: C14 sums measured
    // heights without rendering, so a measurer that throws takes the viewport
    // with it.
    const registry = createBlockRegistry({});
    registry.register(broken("measure") as never);

    expect(() => registry.measure({ kind: "broken", id: "bad" } as unknown as Block, 80)).not.toThrow();
    expect(registry.measure({ kind: "broken", id: "bad" } as unknown as Block, 80)).toBe(1);
  });
});
