// C09 tier 3 — the edges, where every arithmetic mistake shows.
import { describe, expect, it } from "vitest";
import { block, placeable, validateBlock } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { BlockFault, BlockRegistry } from "../../src/presentation/blocks/index.js";
import { cells } from "../../src/presentation/text.js";
import { scrollDefinition } from "../../src/presentation/blocks/kinds/containers.js";
import { renderSequenceToLines, renderToLines } from "../../src/presentation/render-lines.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { planColumns } from "../../src/presentation/table/plan.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LOUD, measurable, visible } from "../support/render.js";

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
  /**
   * A definition that fails in one half only, so the other's containment is
   * visible.
   *
   * **The height is a parameter and it did not used to be.** Fixed at 2, every
   * assertion below could be satisfied by a boundary that answers a constant —
   * which is what shipped, and what T3.13 read as correct (F223).
   */
  function broken(part: "measure" | "render", height = 2) {
    return {
      kind: "broken",
      measure: (): number => {
        if (part === "measure") throw new Error("measurer exploded");
        return height;
      },
      render: (): never => {
        throw new Error("renderer exploded");
      },
    };
  }

  /** A registry that records what its containments swallowed (I29). */
  function recording(definition: unknown, defaults = false) {
    const faults: BlockFault[] = [];
    const registry = createBlockRegistry({
      defaults,
      onError: (fault) => faults.push(fault),
    });
    if (definition !== null) registry.register(definition as never);
    return { registry, faults };
  }

  const paint = (registry: BlockRegistry, b: Block, width = 60): readonly string[] =>
    renderToLines(registry, b, width, { theme: DARK_THEME, capabilities: FULL_CAPS }).map(visible);

  it("T3.20 (I21): a rule with no label draws an unbroken line", () => {
    // **Found by reading a frame, and reachable by nothing else here.** The
    // block was present, `measure` said one row, and the row was exactly the
    // width — the only wrong thing about it was a two-cell gap where a label
    // would have gone, which is a heading's separator drawn into a boundary.
    // C19's menu edge (C19 I23) is the tree's first unlabelled rule.
    const registry = createBlockRegistry({ defaults: true });
    const render = (label: string): string =>
      renderToLines(registry, block({ kind: "rule", id: "r", label }), 40, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      }).map(visible)[0] ?? "";

    expect(render(""), "no gap at the left of a boundary").toMatch(/^─{40}$/u);
    // The control: a label still gets its spaces, which is what they are for.
    expect(render("hunk"), "and a labelled rule is unchanged").toMatch(/^── hunk ─+$/u);
  });

  it("T3.13 (I11): a throwing renderer is contained to its block, at the height it measured", () => {
    const { registry, faults } = recording(broken("render"), true);

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

    const lines = paint(registry, document);

    expect(lines[0]).toContain("before");
    expect(lines[1], "the failure is stated, not hidden").toContain("failed to render");
    expect(lines[1], "and it carries what was thrown").toContain("renderer exploded");
    // **`lines[3]`, and the reason is the fixture rather than the code.**
    // `broken("render")` measures 2, so the sibling sits at 3 the moment the
    // error block is the height it was measured at. `lines[2]` was the position
    // the frame took *because* the error block was one row — a number that read
    // as an assertion about containment and was an assertion about the defect.
    expect(lines[2]?.trim(), "the second committed row is blank, not borrowed").toBe("");
    expect(lines[3], "siblings are unaffected in position as well as content").toContain("after");

    expect(faults.map((f) => `${f.kind}.${f.member}`), "the swallow is reported").toEqual([
      "broken.render",
    ]);
  });

  it("T3.14 (I11, I29): a throwing measurer is contained at one row, and the render is replaced", () => {
    // This one protects virtualisation rather than the frame: C14 sums measured
    // heights without rendering, so a measurer that throws takes the viewport
    // with it.
    const { registry, faults } = recording(broken("measure"), true);
    const bad = { kind: "broken", id: "bad" } as unknown as Block;

    expect(() => registry.measure(bad, 80)).not.toThrow();
    expect(registry.measure(bad, 80)).toBe(1);

    // **The render is replaced rather than truncated to the fallback.** The
    // definition's own renderer throws here too, but the point is which message
    // arrives: a measurer that gave way is named as one, so a block showing a
    // fifth of a drawing with nothing saying so is not a state this can reach.
    const lines = paint(registry, bad);
    expect(lines, "exactly the contained height").toHaveLength(1);
    expect(lines[0]).toContain("failed to measure");

    expect(faults.map((f) => f.member), "reported, not merely survived").toContain("measure");
  });

  it("T3.33 (I11): the error block is exactly the height that was measured, at four of them", () => {
    // All four, because the defect answered 1 to all four: one height cannot
    // tell a bound from a constant.
    for (const height of [1, 2, 5, 20]) {
      const { registry } = recording(broken("render", height), true);
      const bad = { kind: "broken", id: "bad" } as unknown as Block;

      expect(registry.measure(bad, 60), `measure at ${String(height)}`).toBe(height);
      expect(paint(registry, bad), `render at ${String(height)}`).toHaveLength(height);
    }
  });

  it("T3.34 (I11): a sequence measures what it renders, and the frame is where it is read", () => {
    const { registry } = recording(broken("render", 20), true);
    const sequence: readonly Block[] = [
      block({ kind: "raw", id: "before", text: "BEFORE" }),
      { kind: "broken", id: "bad" } as unknown as Block,
      block({ kind: "raw", id: "after", text: "AFTER" }),
    ];

    const measured = registry.measureSequence(sequence, 60);
    const drawn = renderSequenceToLines(registry, sequence, 60, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
    }).map(visible);

    // Measured at 22 against 3 before the fix (F223).
    expect(measured, "the sequence's own arithmetic").toBe(22);
    expect(drawn, "and what it actually draws").toHaveLength(measured);
    // **The frame, not the count.** Every count agreed the whole time this was
    // wrong; only the row the trailing block lands on could disagree.
    expect(drawn[21], "the last block sits where the measurement put it").toContain("AFTER");
  });

  it("T3.35 (I29): a sink that throws makes a caught error fail the run", () => {
    const registry = createBlockRegistry({ defaults: true, onError: LOUD });
    registry.register(broken("render") as never);

    expect(() => paint(registry, { kind: "broken", id: "bad" } as unknown as Block)).toThrow(
      /containment swallowed/u,
    );

    // The control: the same registry, the same sink, a block that does not
    // throw. Without it this row asserts the harness rather than the boundary.
    expect(() => paint(registry, block({ kind: "raw", id: "ok", text: "fine" }))).not.toThrow();
  });

  it("T3.36 (I30, C26 I12): a leaf whose `elements` throws loses its own and no other", () => {
    const { registry, faults } = recording(null);
    for (const kind of ["good", "bad"]) {
      registry.register({
        kind,
        measure: (): number => 3,
        render: (): never => ONE_PER_KIND.rule as never,
        elements: (): unknown => {
          if (kind === "bad") throw new TypeError("elements exploded");
          return [{ id: `${kind}-e0`, rows: { from: 0, to: 1 }, cols: { from: 0, to: 1 }, level: "row" }];
        },
      } as never);
    }

    const found = registry.elementsIn(
      [
        { kind: "good", id: "g1" },
        { kind: "bad", id: "b" },
        { kind: "good", id: "g2" },
      ] as unknown as Block[],
      60,
    );

    expect(found.map((f) => f.blockId), "two of three answer").toEqual(["g1", "g2"]);
    expect(faults.map((f) => f.member)).toEqual(["elements"]);
  });

  it("T3.37 (I30): a container whose `elements` throws keeps its children reachable", () => {
    // **The control is the row.** Both arms must find the children: the defect
    // answered 0 against the control's 4, and an assertion on the throwing arm
    // alone passes at either number.
    const build = (throws: boolean) => {
      const { registry } = recording(null);
      registry.register({
        kind: "kv",
        measure: (): number => 2,
        render: (): never => ONE_PER_KIND.rule as never,
        elements: (): unknown => [
          { id: "e0", rows: { from: 0, to: 1 }, cols: { from: 0, to: 1 }, level: "row" },
          { id: "e1", rows: { from: 1, to: 2 }, cols: { from: 0, to: 1 }, level: "row" },
        ],
      } as never);
      registry.register({
        kind: "scroll",
        measure: (): number => 6,
        render: (): never => ONE_PER_KIND.rule as never,
        ...(throws
          ? {
              elements: (): unknown => {
                throw new TypeError("elements exploded");
              },
            }
          : {}),
      } as never);

      return registry.elementsIn(
        [
          {
            kind: "scroll",
            id: "s",
            children: [
              { kind: "kv", id: "kid-1" },
              { kind: "kv", id: "kid-2" },
            ],
          },
        ] as unknown as Block[],
        60,
      );
    };

    const control = build(false).map((f) => f.blockId);
    expect(control, "the control: a container declaring nothing is descended into").toEqual([
      "kid-1",
      "kid-1",
      "kid-2",
      "kid-2",
    ]);
    expect(
      build(true).map((f) => f.blockId),
      "and a container whose `elements` threw is not owned by a member that did not answer",
    ).toEqual(control);
  });
});

describe("C09 §3, I33 — C04's floor, applied by the registry", () => {
  const kit = measurable();
  const short = { kind: "notice", id: "n", tone: "info", text: "one" } as unknown as Block;
  const floored = (rows: number, over: Record<string, unknown> = {}): Block =>
    ({ ...short, ...over, minHeight: rows }) as unknown as Block;

  it("T3.53 (I33, C04 I67): `measure` is the maximum, and a taller block keeps its own", () => {
    expect(kit.measure(short, 40)).toBe(1);
    expect(kit.measure(floored(3), 40)).toBe(3);

    // **The arm a floor-always-wins implementation passes the other rows with.**
    // A `logs` of four lines measures four; a floor of two must not lower it.
    const logs = {
      kind: "logs",
      id: "l",
      lines: ["a", "b", "c", "d"].map((m) => ({ ts: "12:00", level: "info", message: m })),
    } as unknown as Block;
    const own = kit.measure(logs, 40);
    expect(own).toBeGreaterThan(2);
    expect(kit.measure({ ...logs, minHeight: 2 } as unknown as Block, 40)).toBe(own);
  });

  it("T3.54 (I33, I1): the render pads to the floor and never bounds it", () => {
    // The pair I1 is about: one number from one field, taken by both sides.
    expect(kit.renderToLines(floored(3), 40)).toHaveLength(3);
    expect(kit.measure(floored(3), 40)).toBe(3);

    // **The half that matters, and it is a measurement about Ink rather than
    // about us.** A box with a fixed `height` holding more rows than it declares
    // drops its **first** row — `1 2 3 4` in a `height: 3` box renders `2 3 4` —
    // and `overflowY: "hidden"` does not change it. So a bound here would
    // silently behead a block that grew, which is the truncation this mechanism
    // exists to stop, arriving through the mechanism.
    const logs = {
      kind: "logs",
      id: "l",
      lines: ["FIRST", "b", "c", "d"].map((m) => ({ ts: "12:00", level: "info", message: m })),
    } as unknown as Block;
    const drawn = kit.renderToLines({ ...logs, minHeight: 2 } as unknown as Block, 40);
    expect(drawn).toHaveLength(kit.measure(logs, 40));
    expect(drawn.join("\n"), "the first row is still there").toContain("FIRST");
  });

  it("T3.55 (I33, I2): no definition sees the floor", () => {
    // **`scroll` is the one to ask.** C04 §3c rules its residue row a function of
    // `(block, width)` and deliberately not of view state, because a box that
    // shrank as a reader scrolled would jitter — so a floor reaching the
    // definition would reopen an argument settled two components away.
    const scroll = {
      kind: "scroll",
      id: "s",
      height: 2,
      children: [short, { ...short, id: "n2" }, { ...short, id: "n3" }],
    } as unknown as Block;
    expect(scrollDefinition.measure(scroll as never, 40, kit.measure)).toBe(
      scrollDefinition.measure({ ...scroll, minHeight: 9 } as never, 40, kit.measure),
    );
  });

  it("T3.52 (C04 I68, I26): a block carrying a floor is not windowed", () => {
    // **The build sharpened the walk here.** The ruling was *a slice carries no
    // floor*, which is true and insufficient: `windowSequence` derives its `to`
    // from the **floored** height, so a `window` reaching only the definition's
    // own rows breaks I26's identity from outside the definition, where nothing
    // would look. Kept whole and paid out of `skipRows`, as a kind declaring no
    // `window` already is.
    const lines = Array.from({ length: 20 }, (_, i) => ({
      ts: "12:00",
      level: "info" as const,
      message: `line ${String(i)}`,
    }));
    const logs = { kind: "logs", id: "l", lines } as unknown as Block;
    const tall = { ...logs, minHeight: 30 } as unknown as Block;

    const plain = kit.registry.windowSequence([logs], 40, 5, 10);
    expect(plain.skipRows, "an unfloored block is windowed").toBe(0);
    expect(kit.measure(plain.blocks[0] as Block, 40)).toBeLessThan(kit.measure(logs, 40));

    const kept = kit.registry.windowSequence([tall], 40, 5, 10);
    expect(kept.blocks[0], "the floored block is the block").toBe(tall);
    expect(kept.skipRows, "and its rows are paid out of slack").toBe(5);
  });
});

describe("C09 §2c width — the answers (I42–I44)", () => {
  const kit = measurable({ definitions: [tableDefinition as never] });
  const w = (b: Block, at: number): number => kit.registry.width(b, at);

  it("T3.67 (C09 I43): a block is the same height at its content width, over the corpus and widths 7…80", () => {
    const corpus = CORPUS.filter((b) => !["plot", "patch"].includes(b.kind));
    const failures: string[] = [];
    for (const b of corpus) {
      for (let at = 7; at <= 80; at += 1) {
        const cw = w(b, at);
        if (cw < 1 || cw > at) failures.push(`${b.kind} ${b.id}: width ${String(cw)} at ${String(at)} is outside [1, ${String(at)}]`);
        if (kit.measure(b, cw) !== kit.measure(b, at)) {
          failures.push(`${b.kind} ${b.id}: ${String(kit.measure(b, cw))} rows at ${String(cw)}, ${String(kit.measure(b, at))} at ${String(at)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("T3.68 (C09 I42, C09 I44): the text kinds answer their edge and the residual-absorbing forms fill", () => {
    const notice = block({ kind: "notice", id: "n", tone: "info", text: "abcdefghi" });
    expect(w(notice, 40)).toBe(9);
    expect(w(notice, 7), "clamped to the cell when it wraps").toBe(7);
    expect(w(block({ kind: "raw", id: "r", text: "abc\nabcdefghijkl\nabcde" }), 40)).toBe(12);
    const pills = block({ kind: "pills", id: "p", chips: [{ id: "a", label: "one" }, { id: "b", label: "two" }] });
    expect(w(pills, 40), "two chips and the gap").toBe(3 + 2 + 3);
    const bar = block({
      kind: "keyValue", id: "kv",
      rows: [{ label: "cpu", value: "50%", bar: { value: 50, max: 100 }, barWidth: 10 }],
    });
    expect(w(bar, 40), "a bar absorbs the residual").toBe(40);
    const plain = block({ kind: "keyValue", id: "kv2", rows: [{ label: "cpu", value: "50%" }, { label: "memory", value: "1.2 GiB" }] });
    expect(w(plain, 40), "key column, gap, longest value").toBe(6 + 2 + 7);

    const column = { key: "name", label: "Name", align: "left", priority: 10, minWidth: 8, sortable: false } as const;
    const rows = [{ id: "r1", cells: { name: { text: "row 1" } } }];
    expect(w(block({ kind: "table", id: "tf", columns: [{ ...column, flex: true }], rows }), 40), "an uncapped flex column takes the residual").toBe(40);
    const capped = block({ kind: "table", id: "tc", columns: [{ ...column, flex: true, maxWidth: 12 }], rows });
    expect(w(capped, 40), "a capped flex column stops short, and the plan says where").toBe(12);
    expect(w(block({ kind: "table", id: "ta", columns: [column], rows, actionBar: true }), 40), "an action bar").toBe(40);
    expect(w(block({ kind: "table", id: "te", columns: [column], rows: [] }), 40), "no rows").toBe(40);
    const fixed = block({ kind: "table", id: "tn", columns: [column, { ...column, key: "size", label: "Size" }], rows: [
      { id: "r1", cells: { name: { text: "row 1" }, size: { text: "12" } } },
    ] });
    const plan = planColumns(fixed.columns, 40);
    const planned = plan.visible.reduce((t, c) => t + c.width, 0) + plan.gap * (plan.visible.length - 1);
    expect(w(fixed, 40), "the planned columns and gaps").toBe(planned);
    expect(planned).toBeLessThan(40);
  });

  it("T3.69 (C09 I44): containers answer only when their layout does not depend on the width", () => {
    const notice = block({ kind: "notice", id: "n", tone: "info", text: "abcdefghi" });
    const raw = block({ kind: "raw", id: "r", text: "abcdefghijkl" });
    const fixed = block({ kind: "group", id: "gf", direction: "row", children: [notice, raw], flex: [{ cells: 9 }, { cells: 12 }] });
    expect(w(fixed, 40), "fixed shares sum with the gutter").toBe(9 + 1 + 12);
    const weighted = block({ kind: "group", id: "gw", direction: "row", children: [notice, raw], flex: [1, 1] });
    expect(w(weighted, 40), "a weighted row fills").toBe(40);
    const column = block({ kind: "group", id: "gc", direction: "column", children: [notice, raw] });
    expect(w(column, 40), "the widest child").toBe(12);
    const aligned = block({ kind: "group", id: "ga", direction: "column", children: [notice, raw], align: ["left", "right"] });
    expect(w(aligned, 40), "a column with an aligned child fills").toBe(40);
    const panel = block({ kind: "panel", id: "p", title: "", children: [column] });
    expect(w(panel, 40), "the widest child plus the border").toBe(14);

    // **The children are measured at the inset width, not the panel's own.**
    // The two answers only differ where a wrap differs across those two
    // columns, which is why no corpus row reached it: this notice is one row of
    // 20 at width 20 and two rows of 10 at width 18, so measuring the child
    // outside the border answers 20 and measuring it inside answers 12. Both
    // satisfy C09 I43 — the height is 4 either way — so the number is the only
    // thing that sees it. A mutation dropping `insetWidth` survived the whole
    // suite on this cell.
    const straddle = block({ kind: "notice", id: "ns", tone: "info", text: "aaaaaaaaaa bbbbbbbbb" });
    expect(w(straddle, 18), "two rows of ten inside the border").toBe(10);
    expect(w(straddle, 20), "one row of twenty outside it").toBe(20);
    const inset = block({ kind: "panel", id: "pi", title: "", children: [straddle] });
    expect(w(inset, 20), "the child measured at the inset, plus the border").toBe(12);
    const titled = block({ kind: "panel", id: "pt", title: "abcdefghijklmnopqrst", children: [column] });
    const cw = w(titled, 40);
    // **The furniture is measured rather than counted**: the top border at the
    // answered width carries the whole title, and one cell narrower it does not.
    const border = (at: number): string => visible(kit.renderToLines(titled, at)[0] ?? "");
    expect(border(cw)).toContain("abcdefghijklmnopqrst");
    expect(border(cw - 1)).not.toContain("abcdefghijklmnopqrst");
    expect(cw).toBe(25);
  });

  it("T3.70 (C09 I42): a row at a width that drops its second child answers the first child's width alone", () => {
    const a = block({ kind: "raw", id: "a", text: "x" });
    const dropped = block({ kind: "group", id: "gd", direction: "row", children: [a, a], flex: [{ cells: 30 }, { cells: 30 }] });
    expect(w(dropped, 40)).toBe(30);
  });
});

describe("C09 §2 padding — the registry's one application", () => {
  /**
   * The four ladder kinds, with **one unmistakable character per part**.
   *
   * A frame is a string, so a row that asks *which parts are still drawn* needs
   * to be able to tell them apart after truncation has taken most of each one.
   * Every probe below is a character that appears in exactly one part of its
   * kind — `q` in the message, `l` in the field name, `3` and `2` in the two
   * values — so a part cut to two cells is still identifiable and a part that
   * went is unambiguously gone. A probe on a whole word would read a truncated
   * part as a shed one, which is the distinction the whole invariant is about.
   *
   * `shedOrder` is the kind's declared order, lowest rank first (C09 I81). The
   * part that never sheds is not in it.
   */
  const LADDERS = [
    {
      kind: "events",
      block: block({
        kind: "events",
        id: "ev",
        events: [{ ts: "22:13:20", type: "worker", message: "queued the batch" }],
      }),
      // **The probe is a letter and the `whole` form is the word**, which is
      // what separates *shed* from *cut* for a decoration part. Reading the
      // whole word as the probe made the two indistinguishable: a type
      // truncated to `wor…` reads as shed, the withholding agrees with it, and
      // every claim below passes on a frame the invariant forbids. The mutation
      // pass is what found that — `decoration` shrinking failed nothing.
      parts: { ts: /\d{1,2}:\d{2}/u, type: /w/u, message: /q/u },
      whole: { type: /worker/u },
      shedOrder: ["type", "ts"],
      bodyFrom: 0,
    },
    {
      kind: "keyValue",
      block: block({
        kind: "keyValue",
        id: "kv",
        rows: [{ label: "port", value: "ghcr.io/acme/api" }],
      }),
      // **Disjoint letters, checked**: `port` and `ghcr.io` share none, so a
      // probe cannot read one part's remains as the other's. The first fixture
      // here was `image`, whose `g` is the value's probe — and the row reported
      // a shed value as present, which is the kind of agreement a probe on a
      // whole word hides and a probe on a letter makes visible.
      parts: { key: /p/u, value: /g/u },
      whole: {},
      shedOrder: ["value"],
      bodyFrom: 0,
    },
    {
      kind: "comparison",
      block: block({
        kind: "comparison",
        id: "cmp",
        labels: ["one", "two"],
        rows: [{ field: "size", a: "warm", b: "cold", change: "changed", verdict: "better" }],
      }),
      parts: { change: /~/u, field: /s/u, a: /w/u, verdict: /✓/u, b: /c/u },
      whole: {},
      shedOrder: ["change", "verdict", "a", "b"],
      // The header carries `field`, whose `l` is the field probe — so the
      // probes read the body, which is where the parts are.
      bodyFrom: 1,
    },
    {
      kind: "steps",
      block: block({
        kind: "steps",
        id: "st",
        steps: [{ label: "resolve", state: "done", detail: "nine tools" }],
      }),
      parts: { label: /r/u, detail: /n/u },
      whole: {},
      shedOrder: ["detail"],
      bodyFrom: 0,
    },
  ] as const;

  const WIDTHS = Array.from({ length: 77 }, (_, i) => i + 4); // cells-ok — a width sweep, 4 to 80

  /** The lead and up to two digits — what a row needs before it can state one (C09 I81). */
  const MARK_ROOM = 3;

  it("T3.93 (C09 I81, F1228, F1233): comparison, keyValue, events and steps shed in the declared order and say so, swept from 4 to 80 columns and read as frames", () => {
    const kit = measurable();

    for (const ladder of LADDERS) {
      // **The set that went, per width, read out of the frame.** Held across
      // the sweep because two of the three claims are about the *sequence* of
      // sets and not about any one of them — a ladder can be correct at every
      // width taken alone and still put a part back as the terminal narrows.
      const went: string[][] = [];

      for (const width of WIDTHS) {
        const lines = kit.renderToLines(ladder.block, width).map((l) => visible(l));
        const body = lines.slice(ladder.bodyFrom);
        expect(body.length).toBeGreaterThan(0); // cells-ok — a row count
        const row = body[0]!;

        // No part may push the row past the terminal. A wrapped row scrolls the
        // alternate screen, which is the one failure the application cannot see.
        for (const line of lines) expect(cells(line)).toBeLessThanOrEqual(width);

        const absent = Object.entries(ladder.parts)
          .filter(([, probe]) => !probe.test(row))
          .map(([id]) => id);
        went.push(absent);

        // **1 · A withholding is stated rather than silent**, and its count is
        // the number of parts that went — not a smaller number, which is the
        // shape a mark appended after the widths are settled produces.
        const stated = /⋯(\d+)/u.exec(row);
        if (stated !== null) {
          expect(
            Number(stated[1]!), // cells-ok — a part count
            `${ladder.kind}@${String(width)} ${JSON.stringify(row)} absent=${absent.join(",")}`,
          ).toBe(absent.length); // cells-ok — a part count
        } else {
          // The mark is absent only where nothing went, or where the row is
          // down to **one part that still does not fit** — the clip C09 I81
          // hands to the container. Both arms are needed and the second was
          // too generous on its own: *the row has no room for the mark* is
          // satisfied by any full-width row, and the mutation pass showed what
          // that lets through — with the mark unbudgeted every withholding
          // vanished from the frame (`clampSpans` cuts the **last** span), the
          // rows stayed full width, and this claim passed on all of them.
          //
          // So the count of parts still drawn is the discriminator: a row
          // showing two parts and withholding a third had the room to say so
          // and chose the third part's cells instead. `keyValue` at five
          // columns is the boundary the second arm keeps — `port` stands in
          // four cells and `port ⋯1` needs seven.
          const drawn = Object.keys(ladder.parts).length - absent.length; // cells-ok — a part count
          expect(
            absent.length === 0 || (drawn <= 1 && cells(row) + MARK_ROOM > width), // cells-ok — a part count
            `${ladder.kind}@${String(width)} ${JSON.stringify(row)} absent=${absent.join(",")}`,
          ).toBe(true);
        }

        // **4 · A decoration part is drawn whole or not at all** (C09 I81).
        // Its minimum is a threshold rather than a floor, and the difference is
        // invisible to every claim above: a part cut to three cells is present
        // to a reader and absent to a probe that matches its whole word.
        for (const [id, word] of Object.entries(ladder.whole)) {
          if (!absent.includes(id)) {
            expect(
              word.test(row),
              `${ladder.kind}@${String(width)} ${JSON.stringify(row)} drew ${id} cut`,
            ).toBe(true);
          }
        }

        // **2 · The parts go in the declared order.** The set that went is
        // always a prefix of the kind's order, so a ladder that sheds the part
        // carrying the meaning before the part that decorates it fails here
        // whatever the widths come to.
        expect(absent.slice().sort()).toEqual(ladder.shedOrder.slice(0, absent.length).slice().sort());
      }

      // **3 · A part that went stays gone as the terminal narrows.** Read from
      // the widest end down, which is the direction a reader drags a window.
      for (let i = went.length - 1; i > 0; i -= 1) { // cells-ok — a width index
        // `WIDTHS` ascends, so `i` is the wider terminal and `i - 1` the
        // narrower: everything the wider one shed the narrower one has shed too.
        for (const id of went[i]!) expect(went[i - 1]!).toContain(id);
      }
    }
  });

  it("T3.94 (C09 I81, C26 §5, F1233): a kind at its narrowest rung draws the same items, and the same element ids, as at its widest", () => {
    const kit = measurable({ definitions: [tableDefinition as never] });

    for (const ladder of LADDERS) {
      // **Shed a part, never an item.** A kind that dropped a row would be
      // invisible to every assertion about widths above, and shows up only as a
      // focus on a block that no longer draws what it named — so the row count
      // is the assertion, and `measure` must agree with it at every width.
      const widest = kit.renderToLines(ladder.block, 80).length; // cells-ok — a row count
      for (const width of WIDTHS) {
        const drawn = kit.renderToLines(ladder.block, width).length; // cells-ok — a row count
        expect(drawn).toBe(widest);
        expect(kit.registry.measure(ladder.block, width)).toBe(widest);
      }
    }

    // **The element half needs a kind that emits elements, and none of the four
    // does** — so the id comparison would be `[] === []` over the ladders, which
    // is the vacuity this suite exists to refuse. `table` is the control: it is
    // the kind whose narrow ladder sheds *columns*, it emits one element per
    // row, and the ids are what C26 holds a focus by.
    const col = { align: "left", priority: 10, minWidth: 6, sortable: false } as const;
    const table = block({
      kind: "table",
      id: "tb",
      columns: [
        { ...col, key: "name", label: "Name" },
        { ...col, key: "state", label: "State", priority: 5 },
        { ...col, key: "size", label: "Size", priority: 1 },
      ],
      rows: [
        { id: "r1", cells: { name: { text: "alpha" }, state: { text: "one" }, size: { text: "1.0" } } },
        { id: "r2", cells: { name: { text: "beta" }, state: { text: "two" }, size: { text: "2.0" } } },
      ],
    });
    const idsAt = (width: number): readonly string[] =>
      kit.registry.elementsOf(table, width).map((e) => e.id);
    expect(idsAt(80).length).toBeGreaterThan(0); // cells-ok — an element count
    for (const width of WIDTHS) expect(idsAt(width)).toEqual(idsAt(80));
  });

  it("T3.91 (C09 I80, C04 I25): the registry insets and pads every kind once, on all four seams", () => {
    // **The row SP9 held open through 2a's spec commit, written now that 2a has
    // landed.** All four seams against one block, because the claim is that one
    // application answers for all of them: a definition that read `padding`
    // itself would satisfy any one of these and disagree with the other three.
    const kit = measurable();
    const r = kit.registry;
    const PAD = { l: 3, r: 1, t: 2, b: 1 };
    const inner = 40 - PAD.l - PAD.r;
    const text = "the quick brown fox jumps over the lazy dog and keeps on going past the edge";
    const bare = block({ kind: "notice", id: "n", tone: "info", text } as never);
    const padded = block({ kind: "notice", id: "n", tone: "info", text, padding: PAD } as never);

    // The control: the kind wraps differently at 40 and at the content width, so
    // every assertion below distinguishes "asked at `w`" from "asked at `w−l−r`".
    expect(r.measure(bare, 40), "the fixture responds to the inset").not.toBe(r.measure(bare, inner));

    // 1 · measure is `t + b` over the kind at the content width.
    expect(r.measure(padded, 40)).toBe(PAD.t + PAD.b + r.measure(bare, inner));

    // 2 · width is `l + r` over the kind's own answer at the content width.
    expect(r.width(padded, 40)).toBe(PAD.l + PAD.r + r.width(bare, inner));

    // 3 · render emits the blank rows and insets the rest, cut to the content
    // width — read as a frame, not only as a count.
    const rows = renderToLines(r, padded, 40, { theme: DARK_THEME, capabilities: FULL_CAPS, tick: 0 });
    expect(rows).toHaveLength(r.measure(padded, 40)); // cells-ok — a row count
    expect(rows.slice(0, PAD.t), "the top edge is blank rows").toEqual(["", ""]);
    expect(rows.slice(rows.length - PAD.b), "and the bottom edge").toEqual([""]);
    for (const row of rows.slice(PAD.t, rows.length - PAD.b)) {
      expect(visible(row).startsWith(" ".repeat(PAD.l)), `inset by l: ${visible(row)}`).toBe(true);
      expect(cells(visible(row)), `within l + inner: ${visible(row)}`).toBeLessThanOrEqual(PAD.l + inner);
    }

    // 4 · elements shift by `l` and `t`. A notice with an action declares one.
    const withAction = (pad: boolean): Block =>
      block({
        kind: "notice",
        id: "act",
        tone: "info",
        text: "short",
        action: { key: "⏎", label: "open", command: "x" },
        ...(pad ? { padding: PAD } : {}),
      } as never);
    const before = r.elementsIn([withAction(false)], inner);
    const after = r.elementsIn([withAction(true)], 40);
    expect(before, "the fixture declares an element to move").not.toEqual([]);
    expect(after).toHaveLength(before.length);
    for (const [i, e] of after.entries()) {
      const was = before[i]?.element;
      expect(e.element.rows.from - (was?.rows.from ?? 0), "rows shift by t").toBe(PAD.t);
      expect(e.element.cols.from - (was?.cols.from ?? 0), "cols shift by l").toBe(PAD.l);
    }

    // And no definition reads it: a sequence adds nothing, so the padded block
    // measures the same alone as it does among others (C09 I17).
    expect(r.measureSequence([bare, padded, bare], 40)).toBe(
      r.measure(bare, 40) * 2 + r.measure(padded, 40),
    );
  });

  it("T3.92 (C04 I121): a container spends max(0, placed - 1) x childGap on its own axis and nothing else", () => {
    const kit = measurable();
    const r = kit.registry;
    const cell = (id: string): Block => block({ kind: "raw", id, text: "x" } as never);
    const row = (gap: number | undefined, n: number): Block =>
      block({
        kind: "group",
        id: "g",
        direction: "row",
        ...(gap === undefined ? {} : { childGap: gap }),
        children: Array.from({ length: n }, (_u, i) => cell(`c${String(i)}`)),
        flex: Array.from({ length: n }, () => ({ cells: 10 })),
      } as never);

    // **The default is the old constant, which is what makes this a refactor.**
    // Three children at ten cells each need two gutters: 32 fits, 31 drops one.
    expect(placeable(row(undefined, 3) as never, 32)).toBe(3);
    expect(placeable(row(undefined, 3) as never, 31)).toBe(2);
    // Declaring the default explicitly is the same answer — the field and the
    // constant are one rule, not two that agree.
    expect(placeable(row(1, 3) as never, 31)).toBe(placeable(row(undefined, 3) as never, 31));

    // **No gutter at all**, which is the thing the field exists to make sayable
    // and which no surface could ask for before (F1226).
    expect(placeable(row(0, 3) as never, 30)).toBe(3);
    expect(placeable(row(undefined, 3) as never, 30)).toBe(2);
    // And a wider gap costs more: two gutters of three need 36.
    expect(placeable(row(3, 3) as never, 36)).toBe(3);
    expect(placeable(row(3, 3) as never, 35)).toBe(2);

    // **A column declares none by default**, so its height is the bare sum and
    // C09 I17 is untouched.
    const col = (gap: number | undefined): Block =>
      block({
        kind: "group",
        id: "col",
        direction: "column",
        ...(gap === undefined ? {} : { childGap: gap }),
        children: [cell("a"), cell("b"), cell("c")],
      } as never);
    expect(r.measure(col(undefined), 40)).toBe(3);
    expect(r.measure(col(0), 40)).toBe(3);

    // **One child or none spends nothing, whatever the field says** — the rule
    // is `max(0, n - 1)` rather than a clause guarding it.
    const one = block({ kind: "group", id: "one", direction: "column", childGap: 5, children: [cell("a")] } as never);
    expect(r.measure(one, 40)).toBe(1);
    const empty = block({ kind: "group", id: "none", direction: "row", childGap: 5, children: [] } as never);
    expect(r.measure(empty, 40)).toBeGreaterThanOrEqual(0);

    // **A document's top level has no childGap** (C09 I17): a sequence adds
    // nothing, so three blocks measure three whatever any container declares.
    expect(r.measureSequence([cell("a"), cell("b"), cell("c")], 40)).toBe(3);

    // **The element walk reads the same gap as the widths do.** Three readers of
    // one constant was the finding; a second answer here is the defect it names.
    // A `raw` block declares no element, so the children are notices with an
    // action — the control below is what caught that, on the fixture-responds
    // rule (`test/support/README.md`).
    const act = (id: string): Block =>
      block({
        kind: "notice",
        id,
        tone: "info",
        text: "x",
        action: { key: "⏎", label: "open", command: "c" },
      } as never);
    const actRow = (gap: number): Block =>
      block({
        kind: "group",
        id: "ga",
        direction: "row",
        childGap: gap,
        children: [act("c0"), act("c1")],
        flex: [{ cells: 10 }, { cells: 10 }],
      } as never);
    const gapped = r.elementsIn([actRow(3)], 40);
    const wide = r.elementsIn([actRow(9)], 40);
    expect(gapped.length, "the fixture declares elements to move").toBeGreaterThan(0);
    expect(wide.length).toBe(gapped.length);
    const second = (list: typeof gapped): number => list.filter((f) => f.blockId === "c1")[0]?.element.cols.from ?? -1;
    expect(second(wide) - second(gapped), "the second child moves by the extra gap").toBe(6);

    // **Refused a wrong value at the boundary**, and zero is not wrong.
    expect(validateBlock(row(0, 2)).ok).toBe(true);
    expect(validateBlock(row(-1, 2)).ok).toBe(false);
    expect(validateBlock(row(1.5, 2)).ok).toBe(false);
  });
  it("T3.95 (C09 I82, F1236): a column's header and the cells it names start at the same index", () => {
    const kit = measurable();

    // Two labels, two rows — **one carrying a verdict and one not** — because
    // the body's own agreement is half the claim and the first reading of this
    // finding got it wrong: `markFor` pads to the reserved width for a row with
    // no verdict, so both rows put their value in the same column, and the
    // header was the only thing out of line.
    const subject = block({
      kind: "comparison",
      id: "cmp",
      labels: ["Alpha", "Bravo"],
      rows: [
        { field: "latency", a: "AAA", b: "BBB", change: "changed", verdict: "better" },
        { field: "errors", a: "CCC", b: "DDD" },
      ],
    });

    // **Asked by index, never read from a frame.** Two cells is a shift a
    // reader counts by eye and gets wrong — the first reading of F1236 named
    // the body as the defect from exactly that — and every value here is a
    // distinct token so an index is unambiguous.
    let checked = 0;
    for (const width of WIDTHS) {
      const lines = kit.renderToLines(subject, width).map((l) => visible(l));
      if (lines.length < 3) continue; // cells-ok — a row count
      const [header, judged, plain] = lines as [string, string, string];

      // Only where the column survives at all: the shedding ladder takes the
      // values away at the narrow end (I81), and a row absent from the frame
      // has no index to agree with.
      if (!header.includes("Bravo") || !judged.includes("BBB") || !plain.includes("DDD")) continue;
      checked += 1;

      // **Both columns, because the block was already correct on one.** A row
      // asserting only the marked column passes against a header moved two
      // cells right of everything, which is the failure the fix could have
      // introduced.
      expect(header.indexOf("Bravo"), `w=${String(width)}: the b header names the b values`).toBe(
        judged.indexOf("BBB"),
      );
      expect(header.indexOf("Alpha"), `w=${String(width)}: and the a header the a values`).toBe(
        judged.indexOf("AAA"),
      );

      // And the body agrees with itself: the verdict's cells are reserved on
      // every row, so a row declaring none is not shifted by the ones that do.
      expect(plain.indexOf("DDD"), `w=${String(width)}: a row with no verdict sits in the same column`).toBe(
        judged.indexOf("BBB"),
      );
      expect(plain.indexOf("CCC"), `w=${String(width)}: on the unmarked column too`).toBe(judged.indexOf("AAA"));
    }

    // **The sweep must have had something to check.** A filter that excluded
    // every width would satisfy every assertion above and report nothing, which
    // is this suite's own vacuity class (A03 §2).
    expect(checked, "the sweep reached widths where the columns are drawn whole").toBeGreaterThan(20);
  });

});
