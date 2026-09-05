// C09 tier 3 — the edges, where every arithmetic mistake shows.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { BlockFault, BlockRegistry } from "../../src/presentation/blocks/index.js";
import { cells } from "../../src/presentation/text.js";
import { scrollDefinition } from "../../src/presentation/blocks/kinds/containers.js";
import { renderSequenceToLines, renderToLines } from "../../src/presentation/render-lines.js";
import { ONE_PER_KIND } from "../support/blocks.js";
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

// C04 §3 *Both axes* / C09 §2c rulings, committed spec-first (F814 for why an `it.todo`
// carries each row until the code commit replaces it).
describe("C09 §2c width — the answers", () => {
  it.todo(
    "T3.67 (C09 I43): over every block in the catalogue's corpus and widths 7…80, measure(b, width(b, w)) === measure(b, w), with the failing block and width in the message — not deferred on a component: the component exists, and the row is owed by this round's code commit, which replaces this `it.todo` with the test (A03 §7a, SP9 under a spec-first commit)",
  );
  it.todo(
    "T3.68 (C09 I42, C09 I44): a nine-cell notice answers 9 at 40 and 7 at 7; a raw of lines 3, 12 and 5 answers 12; a pills row of two chips answers the chips plus the gap; a keyValue with a bar answers the cell; a table with a flex column, or an action bar, or no rows answers the cell, and one with none of those answers its planned columns and gaps — not deferred on a component: the component exists, and the row is owed by this round's code commit, which replaces this `it.todo` with the test (A03 §7a, SP9 under a spec-first commit)",
  );
  it.todo(
    "T3.69 (C09 I44): a row group of a nine-cell notice and a twelve-cell raw with shares cells 9 and cells 12 at 40 answers 9 + 1 + 12 and under weights 1, 1 answers 40; a column group of the two answers 12 and with the raw aligned right answers 40; a panel around the column answers 14, and around a title of twenty cells answers 24 — not deferred on a component: the component exists, and the row is owed by this round's code commit, which replaces this `it.todo` with the test (A03 §7a, SP9 under a spec-first commit)",
  );
  it.todo(
    "T3.70 (C09 I42): a row group at a width that drops its second child answers only the first child's width — not deferred on a component: the component exists, and the row is owed by this round's code commit, which replaces this `it.todo` with the test (A03 §7a, SP9 under a spec-first commit)",
  );
});
