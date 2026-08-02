// C09 tier 2 — the contract, and the headline.
//
// T2.1 is the most valuable test in the system, and until this file existed it
// had never been executed: C04 shipped the measurement *contract* and no
// measurers, so forty-seven documents asserted measure-equals-render and
// nothing demonstrated it.
//
// The suite is generic on purpose. It runs over **every registered kind**, so a
// consumer's custom block is held to the same contract as the defaults, and a
// kind joins by being in the registry rather than by anyone extending a list.
import { describe, expect, it, vi } from "vitest";
import { SCAN_BUDGET_MS } from "../support/budget.js";

import { checkAsciiParity, checkMeasurement, formatReport, uncoveredKinds } from "../support/measurement-conformance.js";
import { ADVERSARIAL, CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import {
  GLYPH_SUBSTITUTIONS,
  GLYPH_TOKENS,
  glyphCells,
  glyphFor,
  SUBSTITUTIONS,
} from "../../src/presentation/blocks/index.js";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";

// This file walks `src/`; `budget.ts` carries the measurement and why the 5 s
// default is not a margin. Re-measure before raising it.
vi.setConfig({ testTimeout: SCAN_BUDGET_MS });

/**
 * The three kinds C09 does not ship. They are in the corpus because C04's union
 * declares them, and they resolve through the `raw` fallback here — which is
 * I10 working, not coverage. C11, C12 and C25 register them, and T2.6 is the
 * composition-level test that asserts all seventeen are present.
 *
 * **All three exist now, and the set stays.** It is not a list of the unbuilt; it
 * is the list of kinds this file measures through the fallback *on purpose*,
 * because measuring `table` here would measure `raw` and look like coverage. Each
 * has its own tier-2 measurement against its own registry — C11 T2.1, C12 T2.1,
 * C25 T2.1 — and T2.6 below is where the seventeen are asserted together.
 */
const REGISTERED_ELSEWHERE = new Set(["table", "plot", "patch"]);

const ownKinds = CORPUS.filter((b) => !REGISTERED_ELSEWHERE.has(b.kind));

describe("C09 contract — measurement", () => {
  it("T2.1 (I1): measure equals rendered rows, for every kind × the corpus × seven widths", () => {
    // The headline. C14 virtualises on measured height without rendering, so a
    // disagreement here is not a wrong-looking block — it is a viewport that
    // drifts as the user scrolls, and it is violated silently.
    const kit = measurable();
    const report = checkMeasurement(kit, ownKinds);

    expect(report.failures, formatReport(report)).toEqual([]);
    expect(report.checked, "seven widths over the whole corpus").toBeGreaterThan(100);
  });

  it("T2.2 (I1): the same holds under unicode:'ascii'", () => {
    const kit = measurable({ capabilities: ASCII_CAPS });
    const report = checkMeasurement(kit, ownKinds);

    expect(report.failures, formatReport(report)).toEqual([]);
  });

  it("T2.2b (I5): a fixture measures the same in both unicode modes", () => {
    // The substitutions are 1:1 by cell count, so the *heights* cannot differ.
    // This is the assertion that catches a fallback glyph of the wrong width
    // before it reaches a user with a non-UTF-8 locale — and nobody else.
    const report = checkAsciiParity(measurable(), measurable({ capabilities: ASCII_CAPS }), ownKinds);

    expect(report.failures, formatReport(report)).toEqual([]);
  });

  it("T2.3 (I2): measure is pure — a hundred calls, one answer", () => {
    const kit = measurable();

    for (const block of ownKinds) {
      const first = kit.measure(block, 80);
      for (let i = 0; i < 100; i += 1) {
        expect(kit.measure(block, 80), `${block.kind} drifted on call ${i}`).toBe(first);
      }
    }
  });

  it("T2.4 (I2): measure is total over the adversarial corpus", () => {
    // Empty, zero-length, 10,000-character, double-width, ZWJ. Every one is a
    // legal block, and no input produces a throw — malformed content measures
    // as something, even if that something is 1.
    const kit = measurable();

    for (const block of ADVERSARIAL) {
      for (const width of [0, 1, 2, 3, 80, 10_000]) {
        expect(() => kit.measure(block, width), `${block.id} at ${width}`).not.toThrow();
        const measured = kit.measure(block, width);
        expect(Number.isInteger(measured), `${block.id} at ${width}`).toBe(true);
        expect(measured, `${block.id} at ${width}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("T2.5 (I5): every substitution in §4 is 1:1 by cell count", () => {
    for (const [unicode, ascii] of SUBSTITUTIONS) {
      expect(cells(ascii), `${unicode} → ${ascii}`).toBe(cells(unicode));
      expect(cells(unicode), `${unicode} is one cell`).toBe(1);
    }
  });

  it("T2.5b (I5, C04 §5): every `Glyph` is 1:1 by cell count, in both renderings", () => {
    // The rule C04 commitment 10 has always stated and could not keep while the
    // field was a free string: C09 substituted for the glyphs it owned and
    // emitted a block-supplied character verbatim. Now every glyph a block can
    // name is in this table, so the guarantee covers the whole field rather
    // than most of it.
    for (const [unicode, ascii] of GLYPH_SUBSTITUTIONS) {
      expect(cells(ascii), `${unicode} → ${ascii}`).toBe(cells(unicode));
      expect(cells(unicode), `${unicode} is one cell`).toBe(1);
    }
  });

  it("T2.5c: `glyphCells` agrees with both renderings, which is what lets measure skip capabilities", () => {
    // `measure` receives width and no capability record (C04 §5), so it can only
    // be right if the two renderings are the same width. This asserts the thing
    // the measurer actually relies on rather than the table it is derived from.
    for (const token of GLYPH_TOKENS) {
      expect(glyphCells(token)).toBe(cells(glyphFor(token, FULL_CAPS)));
      expect(glyphCells(token)).toBe(cells(glyphFor(token, ASCII_CAPS)));
    }
  });

  it("T2.5d: the vocabulary is complete — every `Glyph` resolves in both modes", () => {
    // A token added to C04's union without a row in C09's table would resolve
    // to `undefined` and render as the string "undefined". The `Record<Glyph,…>`
    // makes that a type error; this is the runtime half, for a token arriving
    // from a fixture.
    for (const token of GLYPH_TOKENS) {
      for (const caps of [FULL_CAPS, ASCII_CAPS]) {
        const drawn = glyphFor(token, caps);
        expect(drawn, `${token} has no rendering`).toBeTruthy();
        expect(drawn).not.toContain("undefined");
      }
    }
  });

  it("T2.12 (I8): measure returns the same value across a hundred ticks", () => {
    // `measure` does not receive `tick` — the type does not carry it — so this
    // asserts the consequence rather than the mechanism: a spinner animating
    // never moves the viewport (T6.12).
    for (const block of ownKinds) {
      const heights = new Set<number>();
      for (let tick = 0; tick < 100; tick += 1) {
        heights.add(measurable({ tick }).measure(block, 80));
      }
      expect(heights.size, `${block.kind} measured differently across ticks`).toBe(1);
    }
  });

  it("T2.1b (I1): no rendered row exceeds the width it was measured at", () => {
    // A measurer and a renderer can agree on the count while the renderer
    // overflows, and the terminal wraps the overflow into a row neither of them
    // counted. Checked at narrow widths, where every arithmetic mistake shows.
    const kit = measurable();

    for (const block of ownKinds) {
      for (const width of [1, 2, 3, 8, 13, 40]) {
        for (const line of kit.renderToLines(block, width)) {
          expect(cells(visible(line)), `${block.kind} at width ${width}: "${visible(line)}"`)
            .toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it("T2.6 (I13): the fourteen ship here; the other three are registered elsewhere", () => {
    // The composition-level half of I13 belongs with C11, C12 and C25. What is
    // assertable here is the split itself — and that the three absentees still
    // render, through `raw`, rather than throwing (I10).
    const kit = measurable();

    expect([...kit.kinds].sort()).toEqual(
      [
        "code",
        "comparison",
        "events",
        "group",
        "keyValue",
        "logs",
        "notice",
        "panel",
        "pills",
        "progress",
        "raw",
        "rule",
        "steps",
        "tip",
      ],
    );

    for (const kind of REGISTERED_ELSEWHERE) {
      const block = ONE_PER_KIND[kind as "table"];
      expect(() => kit.measure(block, 80), `${kind} must degrade, not throw`).not.toThrow();
      expect(kit.renderToLines(block, 80).length, `${kind} renders through raw`).toBe(
        kit.measure(block, 80),
      );
    }
  });

  it("T2.6b: every registered kind has a fixture in the corpus", () => {
    // A kind nobody wrote a fixture for is a kind T2.1 never ran against, and
    // the suite would report success over the gap.
    expect(uncoveredKinds(measurable(), CORPUS)).toEqual([]);
  });

  it("T2.6c (I13): all seventeen kinds, and the three arrive through `register`", () => {
    // **The composition-level half, assertable for the first time.** It waited on
    // C25 because "every block kind" cannot be honest while one is unregistered,
    // and a test that named the fourteen would have read as covering the union.
    //
    // The seventeen are written out literally rather than derived from `kinds`,
    // for C05 T1.7c's reason: a list taken from the thing it checks agrees with
    // itself and passes on any addition. Adding an eighteenth kind fails here,
    // which is where the decision should be visible.
    const kit = measurable({
      definitions: [
        tableDefinition as unknown as BlockDefinition<never>,
        plotDefinition as unknown as BlockDefinition<never>,
        patchDefinition as unknown as BlockDefinition<never>,
      ],
    });

    expect([...kit.kinds].sort()).toEqual([
      "code",
      "comparison",
      "events",
      "group",
      "keyValue",
      "logs",
      "notice",
      "panel",
      "patch",
      "pills",
      "plot",
      "progress",
      "raw",
      "rule",
      "steps",
      "table",
      "tip",
    ]);

    // And the three are not privileged: a default registry lacks exactly them, so
    // the seventeen are fourteen plus three registrations rather than seventeen
    // shipped and three of them documented as optional.
    const defaults = new Set(measurable().kinds);
    for (const kind of REGISTERED_ELSEWHERE) {
      expect(defaults.has(kind), `${kind} must not be a default`).toBe(false);
    }
  });
});

describe("C09 contract — the source rules", () => {
  const files = srcFiles("src/presentation");

  it("T2.7 (I3): no renderer reads the environment", () => {
    expect(checkSourceScans(files).filter((v) => v.rule === "SS11")).toEqual([]);
  });

  it("T2.8 (I4): no renderer carries a colour, and only `code` names a syntax slot", () => {
    const violations = checkSourceScans(files).filter(
      (v) => v.rule === "SS17" || v.rule === "SS36" || v.rule === "SS20",
    );
    expect(violations).toEqual([]);
  });

  it("T2.9 (I6): no width is computed outside cells()", () => {
    expect(checkSourceScans(files).filter((v) => v.rule === "SS23")).toEqual([]);
  });

  it("T2.11 (I7, MG9): no kind imports the registry", () => {
    // Seam 1's structural half. Container kinds resolve children solely through
    // the injected `measureChild` and `ctx.renderChild`; an import here would be
    // a cycle between the registry and the kinds registered into it.
    const kinds = srcFiles("src/presentation/blocks/kinds");
    expect(kinds, "the scan must have files to be wrong about").not.toEqual([]);

    for (const file of kinds) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} imports the registry`).not.toMatch(/from\s+["'].*registry\.js["']/);
      expect(source, `${file} imports the registry's index`).not.toMatch(
        /from\s+["']\.\.\/index\.js["']/,
      );
    }
  });

  it("T2.17 (§3): the SGR edge is the only one, and no Ink colour prop exists", () => {
    const violations = checkSourceScans(files).filter((v) => v.rule === "SS37");
    expect(violations, "an Ink colour prop discards the depth tag").toEqual([]);
    expect(checkModuleGraph(files).filter((v) => v.rule === "MG21")).toEqual([]);
  });
});

describe("C09 contract — themes do not change geometry", () => {
  it("T4.2 (with C10): the same block measures and renders identically in both themes", () => {
    // Colour never changes row count (C04 §5). This is the assertion that lets
    // C14 cache a measured height across a theme switch.
    for (const block of ownKinds) {
      for (const width of [40, 80, 120]) {
        const dark = measurable({ theme: DARK_THEME });
        const light = measurable({ theme: LIGHT_THEME });

        expect(light.measure(block, width), `${block.kind} at ${width}`).toBe(
          dark.measure(block, width),
        );
        expect(
          light.renderToLines(block, width).length,
          `${block.kind} at ${width}`,
        ).toBe(dark.renderToLines(block, width).length);
      }
    }
  });
});

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) srcFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}
