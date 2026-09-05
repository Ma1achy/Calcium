// C09 tier 6 — fail-on-revert.
//
// Each of these names the *change* that makes it fail, not just the assertion.
// A tier-6 test earns its place by being the thing that fires when someone
// makes the edit that looks harmless, and most of the edits below have been
// made by somebody, somewhere, in a terminal UI that shipped.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { cells, truncate, wrapCells } from "../../src/presentation/text.js";
import { SUBSTITUTIONS } from "../../src/presentation/blocks/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import { ASCII_CAPS, FULL_CAPS, QUIET, measurable, visible } from "../support/render.js";

const FULL = { unicode: "full" } as const;
const ASCII = { unicode: "ascii" } as const;

describe("C09 tier 6", () => {
  it("T6.1 (I1): a measurer that under-counts wrapped lines by one → T2.1 fails at the wrap width", () => {
    // The revert: `floor(cells / w)` in place of the wrap count, or a prefix
    // left out of the wrapping width. Both are one row short, and only at the
    // widths where the text actually wraps — which is why the assertion is over
    // a range rather than at 80.
    const notice = block({
      kind: "notice",
      id: "t6-1",
      tone: "error",
      glyph: "error",
      text: "x".repeat(97),
    });
    const kit = measurable();

    for (const width of [20, 30, 40, 50, 60]) {
      expect(kit.measure(notice, width), `width ${width}`).toBe(
        kit.renderToLines(notice, width).length,
      );
    }
    expect(kit.measure(notice, 30), "97 cells over 28 columns is four rows").toBe(4);
  });

  it("T6.2 (I5): changing the ASCII ellipsis to `...` → T2.5 and T3.4 fail", () => {
    // The classic. `…` is one column and `...` is three, so a three-cell marker
    // shifts every truncation point — for users with a non-UTF-8 locale, and
    // nobody else, which is why it survives review.
    expect(cells("…")).toBe(1);
    expect(cells("~")).toBe(1);
    expect(cells("...")).toBe(3);

    const line = "y".repeat(80);
    expect(cells(truncate(line, 20, ASCII))).toBe(20);
    expect(truncate(line, 20, ASCII).endsWith("~")).toBe(true);

    for (const [unicode, ascii] of SUBSTITUTIONS) {
      expect(cells(ascii), `${unicode} → ${ascii}`).toBe(cells(unicode));
    }
  });

  it("T6.3 (I6): using `.length` for display width → T2.9 fails, and CJK misaligns", () => {
    // The scan is the first half; the second is that the two answers actually
    // differ on real content, so the rule is not merely stylistic.
    expect(checkSourceScans(["src/presentation/blocks/paint.ts"]).filter((v) => v.rule === "SS23")).toEqual(
      [],
    );

    const cjk = "日本語";
    expect(cjk.length, "code units").toBe(3); // cells-ok
    expect(cells(cjk), "columns").toBe(6);
    expect(wrapCells(cjk, 4), "wrapping on cells, not on characters").toHaveLength(2);
  });

  it("T6.4 (I3): reading process.env in a renderer → T2.7 fails", () => {
    const fabricated = checkSourceScans(
      ["src/presentation/blocks/kinds/simple.ts"],
      () => 'const wide = process.env.COLUMNS;',
    ).filter((v) => v.rule === "SS11");

    expect(fabricated, "the rule must fire on the edit it forbids").toHaveLength(1);
    expect(checkSourceScans(["src/presentation/blocks/kinds/simple.ts"])).toEqual([]);
  });

  it("T6.5 (I4): emitting a colour directly → T2.8 fails", () => {
    const fabricated = checkSourceScans(
      ["src/presentation/blocks/kinds/simple.ts"],
      () => 'const style = { colour: "#7faecf" };',
    ).filter((v) => v.rule === "SS36" || v.rule === "SS17");

    expect(fabricated.length, "SS17 and SS36 both cover this edit").toBeGreaterThan(0);
  });

  it("T6.6 (I9): truncating by code unit → T3.5 and T3.6 fail", () => {
    // `slice` is the edit: it cuts by code unit, so it halves a CJK glyph and
    // splits a ZWJ cluster into its components.
    const family = "ab👨‍👩‍👧‍👦cd";
    expect(truncate(family, 4, FULL).includes("‍"), "no orphaned joiner").toBe(false);
    expect(cells(truncate("日本語です", 4, FULL)), "a straddling glyph is dropped, not halved").toBe(
      4,
    );
    // What `slice` does instead: it cuts by code unit, leaving a lone
    // surrogate — half a glyph, which a terminal draws as a replacement
    // character in a cell the measurer counted as content.
    const bySlice = family.slice(0, 3);
    const last = bySlice.charCodeAt(bySlice.length - 1); // cells-ok
    expect(last >= 0xd800 && last <= 0xdbff, "a dangling high surrogate").toBe(true);
  });

  /**
   * A definition that genuinely throws — **and it has to be registered**
   * (F226).
   *
   * For as long as these two rows existed, `explodes` was named and never
   * registered, so it resolved through `raw` (I10), rendered as its own JSON and
   * measured 1. Both rows passed with the containment deleted: they were named
   * for I11 and exercised I10. `not.toThrow()` cannot tell *contained* from
   * *never thrown*, and the two heights are the same number — the contained
   * fallback is 1 and a 29-character JSON string at width 80 is 1 — so T6.8's
   * assertion agreed with both readings.
   *
   * `QUIET` because the containment is the subject here; the harness is
   * otherwise `LOUD` (I29), which is what turned this up.
   */
  const explodes = {
    kind: "explodes",
    measure: (): number => {
      throw new Error("measurer exploded");
    },
    render: (): never => {
      throw new Error("renderer exploded");
    },
  };

  it("T6.7 (I11): letting a renderer's throw propagate → T3.13 fails and the frame dies", () => {
    const kit = measurable({ definitions: [explodes as never], onError: QUIET });
    const document = block({
      kind: "group",
      id: "t6-7",
      direction: "column",
      children: [
        { kind: "raw", id: "ok-1", text: "first" },
        { kind: "explodes", id: "bad" } as never,
        { kind: "raw", id: "ok-2", text: "third" },
      ],
    });

    expect(() => kit.renderToLines(document, 60)).not.toThrow();
    const lines = kit.renderToLines(document, 60).map(visible);
    // **The containment fired**, which is what the row is about. The absence of
    // a throw is satisfied by a block that never threw, and was.
    expect(lines.join("\n"), "the catch was reached").toMatch(/failed to (render|measure)/u);
    expect(lines.at(-1)).toContain("third");
  });

  it("T6.8 (I11): letting a measurer's throw propagate → T3.14 fails and scrolling breaks", () => {
    const kit = measurable({ definitions: [explodes as never], onError: QUIET });
    const bad = { kind: "explodes", id: "bad" } as never;

    expect(() => kit.measure(bad, 80)).not.toThrow();
    expect(kit.measure(bad, 80), "contained at one row").toBe(1);
    // The control that separates *contained* from *never thrown*: an
    // unregistered kind measures 1 too, so the number alone proves nothing.
    // What proves it is that the fallback would have rendered the block's JSON.
    expect(measurable().renderToLines(bad, 80).map(visible).join(""), "the fallback, for contrast")
      .toContain('"kind":"explodes"');
    expect(kit.renderToLines(bad, 80).map(visible).join(""), "and the containment instead")
      .toContain("failed to measure");
  });

  it("T6.10 (§3): wrapping `logs` instead of truncating → T2.1 fails at narrow widths", () => {
    // Wrapping makes a log block's height depend on its content, so a tail that
    // reflows is a tail nobody can read — and the viewport jumps on every line.
    const logs = block({
      kind: "logs",
      id: "t6-10",
      lines: Array.from({ length: 5 }, (_, i) => ({
        ts: "12:00:0" + String(i),
        level: "info",
        message: "z".repeat(400),
      })),
    });
    const kit = measurable();

    for (const width of [20, 40, 80, 200]) {
      expect(kit.measure(logs, width), `width ${width}: five lines, five rows`).toBe(5);
      expect(kit.renderToLines(logs, width)).toHaveLength(5);
    }
  });

  it("T6.12 (I8): reading `tick` inside a measurer → T2.12 fails and the spinner shifts the viewport", () => {
    // `Measure` does not receive the context at all, so this is unwritable
    // rather than forbidden. The assertion is the consequence.
    const steps = block({
      kind: "steps",
      id: "t6-12",
      steps: [{ label: "build", state: "active" }],
    });

    const heights = new Set(
      Array.from({ length: 50 }, (_, tick) => measurable({ tick }).measure(steps, 40)),
    );
    expect(heights, "one height across fifty frames").toEqual(new Set([1]));
  });

  it("T6.14 (§3): ignoring `wrap` on code → T1.6b fails and a YAML manifest renders truncated", () => {
    // A truncated manifest is a *different manifest* that someone will read as
    // the real one. Only the producer knows whether that is acceptable, which
    // is why `wrap` is a field rather than a policy.
    const text = "annotations: " + "a".repeat(100);
    const kit = measurable();
    const truncating = block({ kind: "code", id: "t6-14a", language: "yaml", text });
    const wrapping = block({ kind: "code", id: "t6-14b", language: "yaml", text, wrap: true });

    expect(kit.measure(truncating, 40)).toBe(1);
    expect(kit.measure(wrapping, 40)).toBe(3);
    expect(visible(kit.renderToLines(truncating, 40)[0] ?? "").endsWith("…")).toBe(true);
    expect(
      kit.renderToLines(wrapping, 40).map(visible).join(""),
      "wrapping loses nothing",
    ).toContain("a".repeat(100));
  });

  it("T6.15 (§3): setting an Ink colour prop → T2.17 fails and goldens render monochrome", () => {
    const fabricated = checkSourceScans(
      ["src/presentation/blocks/kinds/simple.ts"],
      () => "return <Text color={style}>{text}</Text>;",
    ).filter((v) => v.rule === "SS37");

    expect(fabricated, "the prop discards the depth tag C10 I24 carries").toHaveLength(1);

    // And the tag is doing work: the same colour at three depths is three
    // sequences, which is exactly what a format-sniffing consumer cannot do.
    const written = new Set([
      sgr({ colour: { kind: "rgb", hex: "#7faecf" } }),
      sgr({ colour: { kind: "ansi256", index: 110 } }),
      sgr({ colour: { kind: "ansi16", index: 12 } }),
    ]);
    expect(written.size).toBe(3);
  });

  it("T6.16 (§3): letting Ink wrap rather than pre-breaking → T2.1 fails at the wrapping widths", () => {
    // Ink's own wrapping chooses different break points and its truncation
    // marker is `…` unconditionally — so under ASCII the marker would be right
    // for nobody and the height right only by luck.
    const kit = measurable({ capabilities: ASCII_CAPS });
    const notice = block({
      kind: "notice",
      id: "t6-16",
      tone: "info",
      text: "the long way round is still the way round".repeat(3),
    });

    for (const width of [17, 23, 31, 44]) {
      expect(kit.measure(notice, width), `width ${width}`).toBe(
        kit.renderToLines(notice, width).length,
      );
    }
  });

  it("T6.17 (§3): a second import from terminal/ into presentation/ → MG21 fails", () => {
    const fabricated = checkModuleGraph(
      ["src/presentation/blocks/kinds/simple.ts"],
      () => 'import { detect } from "../../../terminal/capabilities.js";',
    ).filter((v) => v.rule === "MG21");

    expect(fabricated, "the SGR edge stays singular").toHaveLength(1);
  });

  it("T6.18 (I12): dropping the seal → a kind registered mid-session changes a measured height", () => {
    // The drift this prevents only appears on scrollback: a block measured
    // before registration and re-measured after would differ, and the viewport
    // would jump at the point in the transcript where the two meet.
    const kit = measurable();
    kit.registry.seal();

    expect(() =>
      kit.registry.register({ kind: "late", measure: () => 9, render: () => null as never }),
    ).toThrow();
  });

  it("T6.19 (§2): a renderer reading a clock for its spinner frame → golden frames flake", () => {
    // The frame index comes from `ctx.tick`, which C03 increments. A renderer
    // that read a clock would render differently on every run, and A03 SS1
    // catches the read itself.
    expect(
      checkSourceScans(["src/presentation/blocks/kinds/structured.ts"], () => "const at = Date.now();").filter(
        (v) => v.rule === "SS1",
      ),
      "no ambient clock, anywhere in src/",
    ).toHaveLength(1);

    const steps = block({
      kind: "steps",
      id: "t6-19",
      steps: [{ label: "build", state: "active" }],
    });
    const first = measurable({ tick: 7, capabilities: FULL_CAPS }).renderToLines(steps, 40);
    const again = measurable({ tick: 7, capabilities: FULL_CAPS }).renderToLines(steps, 40);
    expect(again, "same tick, same frame — that is what makes a golden possible").toEqual(first);
  });
});

// C04 §3 *Both axes* / C09 §2c rulings, committed spec-first (F814 for why an `it.todo`
// carries each row until the code commit replaces it).
describe("C09 §2c width — fail-on-revert", () => {
  it.todo(
    "T6.87 (C09 I43): making notice.width return the unwrapped cells → T3.67 fails on a wrapped notice — not deferred on a component: the component exists, and the row is owed by this round's code commit, which replaces this `it.todo` with the test (A03 §7a, SP9 under a spec-first commit)",
  );
  it.todo(
    "T6.88 (C09 I44): declaring width on rule returning w → T2.111 fails on the set while T2.110 still passes — not deferred on a component: the component exists, and the row is owed by this round's code commit, which replaces this `it.todo` with the test (A03 §7a, SP9 under a spec-first commit)",
  );
});
