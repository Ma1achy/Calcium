// C09 tier 1 — the registry's state machine, and each kind's documented height.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/testing/index.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";

describe("C09 §6 — the registry's transition table", () => {
  it("T1.1: register in the open state → get returns it, kinds includes it", () => {
    const registry = createBlockRegistry({});
    registry.register({
      kind: "custom",
      measure: () => 3,
      render: () => {
        throw new Error("this test asserts registration, never rendering");
      },
    });

    expect(registry.get("custom")?.kind).toBe("custom");
    expect(registry.kinds).toContain("custom");
    expect(registry.sealed).toBe(false);
  });

  it("T1.2: seal → sealed is true, and existing kinds still resolve", () => {
    const registry = createBlockRegistry({});
    registry.seal();

    expect(registry.sealed).toBe(true);
    expect(registry.get("logs")?.kind).toBe("logs");
  });

  it("T1.3: measure and render work after seal", () => {
    const registry = createBlockRegistry({});
    registry.seal();

    expect(registry.measure(ONE_PER_KIND.logs, 80)).toBe(2);
    expect(
      renderToLines(registry, ONE_PER_KIND.logs, 80, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      }),
    ).toHaveLength(2);
  });

  it("T1.4: each of the fourteen kinds measures its documented height", () => {
    // §3's table, read back as assertions. The fixture is the canonical one, so
    // a change to a kind's height rule fails here with the kind named rather
    // than as one line of a conformance report.
    const kit = measurable();
    const documented: Readonly<Record<string, number>> = {
      rule: 1, // a rule is one row at any width
      notice: 1, // ceil(cells / w), floored at 1
      keyValue: 2, // rows
      steps: 3, // steps
      logs: 2, // lines, never wrapped
      events: 1, // events
      progress: 1, // label, bar, percentage
      code: 2, // lines
      diff: 2, // rows + header
      pills: 1, // one logical row
      tip: 1, // ceil(cells / w)
      panel: 4, // children + 2
      group: 1, // row: max of children
      raw: 2, // lines
    };

    for (const [kind, height] of Object.entries(documented)) {
      const fixture = ONE_PER_KIND[kind as "raw"];
      expect(kit.measure(fixture, 80), `${kind} at width 80`).toBe(height);
    }
  });
});

describe("C09 §6 — kinds", () => {
  it("T1.5: the keyValue key column caps at 20 cells, and values still align", () => {
    const kit = measurable();
    const long = block({
      kind: "keyValue",
      id: "kv-long",
      rows: [
        { label: "a-key-far-longer-than-twenty-cells", value: "one" },
        { label: "short", value: "two" },
      ],
    });

    const [first, second] = kit.renderToLines(long, 80).map(visible);
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // The value column starts at the same cell in both rows — which is the
    // point of a capped column rather than a longest-key column.
    expect(first?.indexOf("one")).toBe(second?.indexOf("two"));
    expect(first?.indexOf("one")).toBe(22); // 20 cells of key, two of gap
  });

  it("T1.6 (§3): a logs line longer than w is one row, ending in the marker", () => {
    const kit = measurable();
    const long = block({
      kind: "logs",
      id: "logs-long",
      lines: [{ ts: "12:00:01", level: "info", message: "x".repeat(500) }],
    });

    const lines = kit.renderToLines(long, 40);
    expect(lines, "never wrapped — predictable height is the point").toHaveLength(1);
    expect(visible(lines[0] ?? "").endsWith("…")).toBe(true);
    expect(kit.measure(long, 40)).toBe(1);
  });

  it("T1.6b (§3): code truncates by default and wraps when asked, both measured right", () => {
    const text = `${"y".repeat(200)}\nsecond`;
    const truncating = block({ kind: "code", id: "code-t", language: "yaml", text });
    const wrapping = block({ kind: "code", id: "code-w", language: "yaml", text, wrap: true });
    const kit = measurable();

    expect(kit.measure(truncating, 40), "two source lines, truncated").toBe(2);
    expect(kit.renderToLines(truncating, 40)).toHaveLength(2);

    expect(kit.measure(wrapping, 40), "200 cells over 40, plus one line").toBe(6);
    expect(kit.renderToLines(wrapping, 40)).toHaveLength(6);
  });

  it("T1.7: a notice longer than w wraps, and the measurement matches", () => {
    const kit = measurable();
    const notice = block({
      kind: "notice",
      id: "notice-long",
      tone: "info",
      text: "the resolver is not a walk, and the assignment had to be solved rather than walked",
    });

    for (const width of [20, 30, 40, 80]) {
      expect(kit.renderToLines(notice, width), `width ${width}`).toHaveLength(
        kit.measure(notice, width),
      );
    }
  });

  it("T1.7b: a notice's glyph comes out of the wrapping width, not out of nowhere", () => {
    // C04 §3's `ceil(len / w)` assumes the whole width is prose, and an `error`
    // notice always carries a glyph (C04 I6). Measuring at `w` while rendering
    // at `w - 2` is a row's difference at exactly the widths where it wraps.
    const kit = measurable();
    const text = "x".repeat(60);
    const bare = block({ kind: "notice", id: "n-bare", tone: "info", text });
    const glyphed = block({ kind: "notice", id: "n-glyph", tone: "error", glyph: "error", text });

    expect(kit.measure(bare, 30)).toBe(2);
    expect(kit.measure(glyphed, 30), "two fewer columns per row").toBe(3);
    expect(kit.renderToLines(glyphed, 30)).toHaveLength(3);
  });

  it("T1.8: panel measures its children at w - 2", () => {
    const kit = measurable();
    const text = "z".repeat(40);
    const panel = block({
      kind: "panel",
      id: "p",
      title: "Summary",
      children: [{ kind: "notice", id: "p-n", tone: "info", text }],
    });

    // At width 42 the child has 40 columns and fits on one row; at 41 it has 39
    // and takes two. A panel that passed `w` through would not move here.
    expect(kit.measure(panel, 42)).toBe(3);
    expect(kit.measure(panel, 41)).toBe(4);
    expect(kit.renderToLines(panel, 41)).toHaveLength(4);
  });

  it("T1.9: a column group sums its children; a row group takes the max", () => {
    const kit = measurable();
    const short = { kind: "raw", id: "g-a", text: "one" } as const;
    const tall = { kind: "raw", id: "g-b", text: "one\ntwo\nthree" } as const;

    const column = block({ kind: "group", id: "g-col", direction: "column", children: [short, tall] });
    const row = block({ kind: "group", id: "g-row", direction: "row", children: [short, tall] });

    expect(kit.measure(column, 80), "1 + 3").toBe(4);
    expect(kit.measure(row, 80), "max(1, 3)").toBe(3);
    expect(kit.renderToLines(column, 80)).toHaveLength(4);
    expect(kit.renderToLines(row, 80)).toHaveLength(3);
  });

  it("T1.10 (I10): an unknown kind renders through raw and never throws", () => {
    const kit = measurable();
    const foreign = { kind: "sparkline-3000", id: "x-1", values: [1, 2, 3] } as unknown as never;

    expect(() => kit.measure(foreign, 80)).not.toThrow();
    expect(kit.renderToLines(foreign, 80)).toHaveLength(kit.measure(foreign, 80));
    expect(
      visible(kit.renderToLines(foreign, 80)[0] ?? ""),
      "the content is visible, degraded rather than hidden",
    ).toContain("sparkline-3000");
  });

  it("T1.11 (I18): an injected escape sequence is stripped, not passed through", () => {
    const kit = measurable();
    const attack = `${String.fromCharCode(27)}[31mred`;
    const notice = block({ kind: "notice", id: "n-attack", tone: "info", text: attack });

    const line = kit.renderToLines(notice, 80)[0] ?? "";
    // The rendered row carries C10's styling and not the block's: the injected
    // sequence is gone, and the literal text that followed it remains.
    expect(visible(line)).toContain("[31mred");
    expect(cells(visible(line))).toBe(cells("[31mred"));
  });

  it("T1.12 (§2): steps show a spinner while active and a settled glyph after", () => {
    const steps = block({
      kind: "steps",
      id: "s",
      steps: [
        { label: "one", state: "done" },
        { label: "two", state: "active" },
        { label: "three", state: "failed" },
        { label: "four", state: "pending" },
      ],
    });

    const first = measurable({ tick: 0 }).renderToLines(steps, 40).map(visible);
    const later = measurable({ tick: 3 }).renderToLines(steps, 40).map(visible);

    expect(first[0]?.startsWith("✓")).toBe(true);
    expect(first[2]?.startsWith("✗")).toBe(true);
    expect(first[3]?.startsWith("◌")).toBe(true);

    // The spinner frame changes with the tick; the settled rows do not.
    expect(later[1]).not.toBe(first[1]);
    expect(later[0]).toBe(first[0]);
    expect(later, "and the height never changes").toHaveLength(first.length);
  });

  it("T1.12b (I5): under ASCII every glyph is one cell and the row count is unchanged", () => {
    const unicode = measurable();
    const ascii = measurable({ capabilities: ASCII_CAPS });
    const steps = ONE_PER_KIND.steps;

    const asciiLines = ascii.renderToLines(steps, 40).map(visible);
    expect(asciiLines).toHaveLength(unicode.renderToLines(steps, 40).length);
    expect(asciiLines[0]?.startsWith("+")).toBe(true);
    for (const line of asciiLines) {
      expect([...line].every((ch) => (ch.codePointAt(0) ?? 0) < 0x80), line).toBe(true);
    }
  });
});
