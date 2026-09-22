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

import { checkAsciiParity, checkMeasurement, formatReport, uncoveredKinds } from "../../src/testing/measurement-conformance.js";
import { ADVERSARIAL, CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import {
  ASCII_CAPS,
  DARK_THEME,
  FULL_CAPS,
  LIGHT_THEME,
  MONO_UNICODE_CAPS,
  measurable,
  visible,
} from "../support/render.js";
import { rowContaining, styleAt, styledScreenFrom } from "../support/styled-screen.js";
import { CONTENT_LINE_CAP, statusRowsFor } from "../../src/presentation/blocks/kinds/status.js";
import { focusStyle, tone } from "../../src/presentation/blocks/paint.js";
import { block } from "../../src/data/viewmodel/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import { cells, hasEmojiForm, TEXT_PRESENTATION } from "../../src/presentation/text.js";
import { SPINNER_SETS } from "../../src/presentation/blocks/glyphs.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { fit, rows } from "../../src/presentation/blocks/paint.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { BlockDefinition, RenderContext } from "../../src/presentation/blocks/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import {
  GLYPH_SUBSTITUTIONS,
  GLYPH_TOKENS,
  glyphCells,
  glyphFor,
  FREE_WIDTH_SLOTS,
  glyphs,
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
 * composition-level test that asserts all eighteen are present.
 *
 * **All three exist now, and the set stays.** It is not a list of the unbuilt; it
 * is the list of kinds this file measures through the fallback *on purpose*,
 * because measuring `table` here would measure `raw` and look like coverage. Each
 * has its own tier-2 measurement against its own registry — C11 T2.1, C12 T2.1,
 * C25 T2.1 — and T2.6 below is where the eighteen are asserted together.
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

  it("T1.43 (C09 I68): `fit` pads at the convention it cut at, and the fixture is shown to respond first", () => {
    // **The character decides whether this row can fail.** `µ` (U+00B5) is not
    // in the Ambiguous class, so a fixture built on it measures the same at
    // both conventions and a mutation dropping the convention survives it. The
    // table is asserted before anything rests on it (F1042).
    const moves = ["°", "Δ", "±", "→", "α"];
    const still = ["µ", "a", "3", " "];
    for (const ch of moves) {
      expect([cells(ch, "narrow"), cells(ch, "wide")], `${ch} must move`).toEqual([1, 2]);
    }
    for (const ch of still) {
      expect([cells(ch, "narrow"), cells(ch, "wide")], `${ch} must not`).toEqual([1, 1]);
    }

    // **`fit` returns exactly `width` cells at the convention it was given.**
    // The narrow arm is the control: it was always right and must stay right.
    const texts = [
      "Δ drift 3°C above the ±threshold",
      "plain ascii with no ambiguity at all",
      "°",
      "",
      "µs only, which cannot move",
    ];
    for (const ambiguousWidth of ["narrow", "wide"] as const) {
      const caps = { ...FULL_CAPS, ambiguousWidth };
      for (const text of texts) {
        for (const width of [1, 4, 12, 20, 24, 30, 36, 40, 80]) {
          expect(
            cells(fit(text, width, caps), ambiguousWidth),
            `fit(${JSON.stringify(text)}, ${String(width)}, ${ambiguousWidth})`,
          ).toBe(width);
        }
      }
    }
  });

  it("T2.5 (I5): every substitution in §4 occupies the same slot at every rung", () => {
    // **Amended twice, and the second amendment narrowed the first.** One cell
    // against one cell was a way of guaranteeing that no column moves when the
    // alphabet changes; it was never the property itself. The design declares
    // `ellipsis` with `reservedCells: 3` and `ascii: "..."` (R-GLY-003, §096),
    // so the 1:1 form would refuse it — a rule blocking the design, and the rule
    // is what changed.
    //
    // The first amendment then over-reached: it padded the residue lead into a
    // three-cell slot at every rung. **`reservedCells` at every rung is a rule
    // about marks in FIXED COLUMNS** — a gutter, a row's lead, a frame's edge —
    // where content beside the mark aligns to the column and a mark that
    // changed width would move the alignment. A residue lead is followed only
    // by its own count (`⋯ 5 more`, `... 5 more`, §095 / R-BLK-867), so nothing
    // aligns to it and padding buys two cells of gap the design does not draw.
    // `FREE_WIDTH_SLOTS` is where the exception is declared, and this row is
    // what keeps the declaration honest.
    const uni = glyphs({ unicode: "full", ambiguousWidth: "narrow" });
    const asc = glyphs({ unicode: "ascii", ambiguousWidth: "narrow" });
    for (const name of Object.keys(uni) as (keyof typeof uni)[]) {
      const unicode = uni[name];
      const ascii = asc[name];
      if (FREE_WIDTH_SLOTS.has(name)) continue;
      expect(cells(ascii), `${unicode} → ${ascii}`).toBe(cells(unicode));
      expect(cells(unicode, "narrow"), `${unicode} is one cell narrow`).toBe(1);
    }

    // **The property the 1:1 rule protected, asserted directly**: a fixed-column
    // mark is the same number of cells at every rung, so the column beside it
    // does not move when the terminal changes alphabet. `glyphs()` hands back
    // the ASCII set wholesale at `wide` (C02 I9), so the three rungs are narrow
    // Unicode, wide, and ASCII.
    const rungs = [
      { unicode: "full", ambiguousWidth: "narrow" },
      { unicode: "full", ambiguousWidth: "wide" },
      { unicode: "ascii", ambiguousWidth: "narrow" },
    ] as const;
    for (const name of Object.keys(uni) as (keyof typeof uni)[]) {
      if (FREE_WIDTH_SLOTS.has(name)) continue;
      const widths = rungs.map((caps) => cells(glyphs(caps)[name], caps.ambiguousWidth));
      expect(new Set(widths).size, `${name} is one width at every rung — ${widths.join(", ")}`).toBe(1);
    }

    // **And the exemption is driven, not decorative** (the rule an allow-list
    // needs to survive): every member of `FREE_WIDTH_SLOTS` must actually vary
    // across the rungs. A member that stopped varying would be a dead entry
    // weakening the rule for everything it names, and this is what fails the day
    // one appears.
    for (const name of FREE_WIDTH_SLOTS) {
      const widths = rungs.map((caps) => cells(glyphs(caps)[name], caps.ambiguousWidth));
      expect(new Set(widths).size, `${name} is exempt because it varies — ${widths.join(", ")}`).toBeGreaterThan(1);
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

  it("T2.6 (I13): the nineteen ship here; the other three are registered elsewhere", () => {
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
        "image",
        "keyValue",
        "logs",
        "mosaic",
        "notice",
        "panel",
        "pills",
        "progress",
        "raw",
        "rule",
        "scroll",
        "status",
        "steps",
        "terminal",
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

  it("T2.6c (I13): all twenty-two kinds, and the three arrive through `register`", () => {
    // **The composition-level half, assertable for the first time.** It waited on
    // C25 because "every block kind" cannot be honest while one is unregistered,
    // and a test that named the fourteen would have read as covering the union.
    //
    // The nineteen are written out literally rather than derived from `kinds`,
    // for C05 T1.7c's reason: a list taken from the thing it checks agrees with
    // itself and passes on any addition. Adding a twentieth kind fails here,
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
      "image",
      "keyValue",
      "logs",
      "mosaic",
      "notice",
      "panel",
      "patch",
      "pills",
      "plot",
      "progress",
      "raw",
      "rule",
      "scroll",
      "status",
      "steps",
      "table",
      "terminal",
      "tip",
    ]);

    // And the three are not privileged: a default registry lacks exactly them, so
    // the twenty-one are eighteen plus three registrations rather than twenty-one
    // shipped and three of them documented as optional. **The split moved as
    // well as the total** when `scroll` joined the defaults, which is why every
    // one of these counts was read rather than swept: a sentence saying
    // *fourteen* beside a total saying seventeen moves by one in two places.
    const defaults = new Set(measurable().kinds);
    for (const kind of REGISTERED_ELSEWHERE) {
      expect(defaults.has(kind), `${kind} must not be a default`).toBe(false);
    }
  });

  it("T2.126 (I59, §6b): the kinds a bounded container cannot slice, compared by equality", () => {
    // **An exemption list held by equality, not by membership** — a kind that
    // gains a `window` has to move this list, and a new kind that cannot be
    // bounded has to fail here rather than join a subset quietly. The overrun
    // those kinds keep inside a `scroll` is recorded by I59 rather than asserted
    // correct: `plot` is atomic permanently (I27, C12 I1) and the rest simply
    // have no window yet.
    const kit = measurable({
      definitions: [
        tableDefinition as unknown as BlockDefinition<never>,
        plotDefinition as unknown as BlockDefinition<never>,
        patchDefinition as unknown as BlockDefinition<never>,
      ],
    });
    const atomic = [...kit.kinds]
      .filter((kind) => kit.registry.get(kind)?.window === undefined)
      .sort();

    expect(atomic).toEqual([
      "comparison",
      "events",
      "image",
      "mosaic",
      "notice",
      "panel",
      "pills",
      "plot",
      "progress",
      "rule",
      "scroll",
      "status",
      "steps",
      "tip",
    ]);

    const plot = { kind: "plot", id: "p", form: "curve", series: [], height: 30 } as unknown as Block;
    expect(kit.registry.windowChild(plot, 40, 0, 6), "and an atomic child gets no slice").toBeNull();
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

  it("T2.17 (I15, §3): the SGR edge is the only one, and no Ink colour prop exists", () => {
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

describe("C09 §4 — the call grammar's glyph rows", () => {
  const WIDE_CAPS = { ...FULL_CAPS, ambiguousWidth: "wide" as const };

  it("T2.112 (C09 I45): every emoji base drawn by a glyph table or a spinner set carries the text selector", () => {
    // **The check C09 §4 could not run when `step` was chosen** (F823): `cells()`
    // measured `⏺︎` at one cell under both conventions and it is a base of an
    // emoji variation sequence all the same.
    //
    // **The rule inverted under F854**: refusing the base cost eleven marks, and
    // U+FE0E says *draw the preceding character as text* — counted zero by
    // `cells()`, so the qualified mark is still one cell. A base is admitted
    // when it carries the selector and is a violation when it is bare.
    const offenders: string[] = [];
    const seen = (label: string, text: string): void => {
      const chars = [...text];
      for (const [i, c] of chars.entries()) {
        const cp = c.codePointAt(0) ?? 0;
        if (cp < 0x80 || !hasEmojiForm(cp)) continue;
        if (chars[i + 1] === TEXT_PRESENTATION) continue;
        offenders.push(`${label}: ${c} U+${cp.toString(16)} written bare`);
      }
    };
    for (const token of GLYPH_TOKENS) seen(`Glyph ${token}`, glyphFor(token, FULL_CAPS));
    for (const [slot, ch] of Object.entries(glyphs(FULL_CAPS))) seen(`GlyphSet ${slot}`, ch);
    for (const [name, set] of Object.entries(SPINNER_SETS)) for (const f of set.frames) seen(`spinner ${name}`, f);
    expect(offenders).toEqual([]);
    // **The controls, so an empty table cannot pass the row**: the two marks
    // the table found on its first run are in it, and the keycap base `*` —
    // `step`'s and `running`'s ASCII rung — is excluded by the row's own guard.
    expect(hasEmojiForm(0x23fa), "⏺︎ U+23FA, the mark F823 is about").toBe(true);
    expect(hasEmojiForm(0x2139), "ℹ U+2139, the mark F832 found").toBe(true);
    expect(hasEmojiForm(0x2b24), "⬤ U+2B24, which held the slot between F823 and F854").toBe(false);
    // **The arm that says the row can still fail**: the head mark without its
    // selector is what the rule refuses, and it is the shipped character.
    const bare: string[] = [];
    for (const c of ["\u23fa"]) {
      const cp = c.codePointAt(0) ?? 0;
      if (hasEmojiForm(cp)) bare.push(c);
    }
    expect(bare, "a bare base is still a violation — the remedy is the selector, not the exemption").toEqual(["\u23fa"]);
    expect(hasEmojiForm(0x2a), "* is a keycap base in the Unicode file and excluded by construction (F832)").toBe(false);
    expect(glyphFor("running", ASCII_CAPS), "so the ASCII rung is still *").toBe("*");
  });

  it("T2.115 (C09 I48): every `Glyph` is 1:1 by cell count at BOTH conventions, through `glyphFor`", () => {
    // T2.5b asserted the rule at `narrow` alone, and ten of seventeen members
    // broke it at `wide` while it was green (F825). The two named sets are
    // compared by equality so a member moving between them fails the row.
    const AMBIGUOUS = new Set(["warn", "info", "pending", "working", "running", "queued", "cancelled", "expand", "collapse", "focus", "bullet"]);
    const NEUTRAL = new Set(["ok", "error", "quote", "nested", "continuation"]);
    expect(new Set([...AMBIGUOUS, ...NEUTRAL])).toEqual(new Set(GLYPH_TOKENS));
    const tiered: string[] = [];
    const steady: string[] = [];
    for (const token of GLYPH_TOKENS) {
      const narrow = glyphFor(token, FULL_CAPS);
      const wide = glyphFor(token, WIDE_CAPS);
      const ascii = glyphFor(token, ASCII_CAPS);
      expect(cells(narrow, "narrow"), `${token} narrow`).toBe(1);
      expect(cells(wide, "wide"), `${token} at wide, through glyphFor`).toBe(1);
      expect(cells(ascii, "wide"), `${token} ascii`).toBe(1);
      if (wide === ascii && narrow !== ascii) {
        tiered.push(token);
      } else {
        steady.push(token);
        expect(cells(narrow, "wide"), `${token} is Neutral`).toBe(1);
      }
    }
    expect(new Set(tiered)).toEqual(AMBIGUOUS);
    expect(new Set(steady)).toEqual(NEUTRAL);
  });

  it("T2.116 (C09 I49): the separator slot is one cell at both arms and both alphabets", () => {
    // The head joined its fields with a literal `·` — non-ASCII at the ASCII arm
    // and two cells at wide — and the contract row asserted it under ASCII
    // (F828). A slot, so the composer resolves it where the capability is.
    expect(glyphs(FULL_CAPS).separator).toBe("·");
    expect(glyphs(ASCII_CAPS).separator).toBe(":");
    expect(glyphs(WIDE_CAPS).separator, "the internal set collapses at wide (C02 I9)").toBe(":");
    for (const caps of [FULL_CAPS, WIDE_CAPS, ASCII_CAPS]) {
      const sep = glyphs(caps).separator;
      expect(cells(sep, caps.ambiguousWidth), `separator at ${caps.unicode}/${caps.ambiguousWidth}`).toBe(1);
      // **Beside the spinner, not alone** (F834): the rung was `-`, which is the
      // turn set's first frame, and a dispatched head read `verb - -`. Against
      // every set, so a new pair carrying the separator fails here before it lands.
      for (const [name, set] of Object.entries(SPINNER_SETS)) {
        expect(set.ascii, `set ${name}'s ASCII frames must not carry the separator ${sep}`).not.toContain(sep);
        if (caps.unicode !== "ascii") expect(set.frames, `set ${name}'s frames`).not.toContain(sep);
      }
    }
    // **And no composer joins with the literal**: the slot exists so that
    // `src/shell/` never writes ` · ` into a head again. Comments stripped
    // first — the prose about the separator is exactly where the bytes appear.
    const offenders: string[] = [];
    // **Named, with why, rather than by narrowing the walk** (the allow-list
    // rule). `checks.ts` writes **Markdown** — `make profile`'s report, read in a
    // pager and committed to a file — and not a block head: nothing it produces
    // reaches C09's composer or is measured in cells, so the slot has no
    // capability to resolve against there. It came into this rule's scope by
    // moving from `src/testing/` into the shell under F1136, which is the rule
    // working: the walk covers the directory and the exception is a row.
    const WRITES_MARKDOWN = ["src/shell/profiling/checks.ts"];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const file = `${dir}/${entry}`;
        if (statSync(file).isDirectory()) walk(file);
        else if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
          const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
          if (WRITES_MARKDOWN.includes(file)) continue;
          if (/["'`][^"'`\n]*\s\u00b7\s[^"'`\n]*["'`]/u.test(code)) offenders.push(file);
        }
      }
    };
    walk("src/shell");
    expect(offenders, "a head joined with a literal `·` (F828)").toEqual([]);
    // **The exception is asserted to still be one**: a file named here that has
    // stopped writing the literal is an entry outliving its subject, and an
    // exemption list nobody drives is how a dead entry keeps its place.
    for (const file of WRITES_MARKDOWN) {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
      expect(/["'`][^"'`\n]*\s\u00b7\s[^"'`\n]*["'`]/u.test(code), `${file} still writes it`).toBe(true);
    }
  });
});

describe("C09 contract — the slice seam", () => {
  it("T2.123 (I58): windowChild reaches every definition, and it is the registry's own", () => {
    // **The same assertion `measureChild` and `renderChild` carry** (§2): the
    // registry overwrites all three unconditionally, so a caller cannot hand a
    // kind a windowing function of its own — which is why `RenderContextInput`
    // omits the three rather than making them optional (F85).
    const seen: RenderContext[] = [];
    const probe: BlockDefinition = {
      kind: "probe-ctx",
      measure: () => 1,
      render: (_block: Block, ctx: RenderContext) => {
        seen.push(ctx);
        return rows(["x"]);
      },
    } as unknown as BlockDefinition;
    const r = createBlockRegistry({ defaults: true });
    r.register(probe);

    renderToLines(r, { kind: "probe-ctx", id: "q" } as unknown as Block, 40, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
    });

    expect(seen.length, "the probe drew").toBe(1); // cells-ok
    expect(seen[0]?.windowChild, "and it is the registry's own function").toBe(r.windowChild);
  });

  it("T2.124 (I58): over every corpus block, windowChild is null exactly where the slice would cost the caller", () => {
    // **A sweep, because a single offset cannot see the residual** (B1's
    // argument): a row asserting one window against a constant passes against a
    // residual that is simply wrong. The predicate is the whole of I58 —
    // atomic kind, or non-zero `skipRows`/`dropRows` — and it is computed from
    // the definition rather than restated, so the two sides cannot drift.
    const kit = measurable({
      definitions: [
        tableDefinition as unknown as BlockDefinition<never>,
        plotDefinition as unknown as BlockDefinition<never>,
        patchDefinition as unknown as BlockDefinition<never>,
      ],
    });
    // **Three fixtures the corpus does not hold, and the mutation pass is what
    // said so each time.** Removing the floor guard and removing the cap guard
    // both survived: no corpus block carries `minHeight` or `capped`, so the
    // sweep could not see either. A corpus chosen for a property may not have it
    // — third instance in this change, after T3.75's and the atomic one, and
    // **fourth when padding arrived** (F1224): 51 corpus blocks, none padded.
    //
    // **And the padded one taught the row something else** (F277). It survived a
    // second time after the fixture existed, because the harness's `window` had
    // been given the seam's own `windowRefused` — so `direct` and `got` consulted
    // one predicate and agreed however wrong it was. A row about *which blocks
    // are refused* has to ask the definition directly and restate the rule, which
    // is what `windowDefinition` and the literal clauses below are for.
    //
    // Both extra rows are *sliceable kinds*, so the only thing stopping the
    // slice is the guard: a `logs` whose window is always exact, floored in one
    // and capped in the other.
    const lines = (id: string, n: number): Block =>
      ({
        kind: "logs",
        id,
        lines: Array.from({ length: n }, (_u, i) => ({ ts: "00:00:00", level: "info" as const, message: `l${String(i)}` })),
      }) as unknown as Block;
    const floored = { ...(lines("floored", 6) as object), minHeight: 12 } as unknown as Block;
    const capped = { ...(lines("capped", 6) as object), capped: { shown: 6, total: 900 } } as unknown as Block;
    // Padded on both axes, because the two edges are refused for different
    // reasons: `t`/`b` put rows outside anything the definition's window can
    // reach, and `l`/`r` mean it is asked at `w` and drawn at `w - l - r`.
    const paddedV = { ...(lines("padded-v", 6) as object), padding: { t: 1, b: 1 } } as unknown as Block;
    const paddedH = { ...(lines("padded-h", 6) as object), padding: { l: 2 } } as unknown as Block;

    const disagreed: string[] = [];
    let refused = 0;
    let sliced = 0;
    for (const blk of [...CORPUS, floored, capped, paddedV, paddedH]) {
      for (const width of [20, 40, 80]) {
        const total = kit.measure(blk, width);
        if (total < 2) continue;
        const from = Math.floor(total / 3);
        const to = Math.max(from + 1, total - 1);
        const direct = kit.windowDefinition(blk, width, from, to);
        // **The predicate is the whole of I58**, computed rather than restated:
        // atomic kind, a residual the container cannot pay, a floor whose
        // padding is drawn outside the definition, a cap whose marker is, or the
        // block's own padding, which is both (C09 I80).
        const pad = (blk as { padding?: Record<string, number | undefined> }).padding;
        const exact =
          direct !== undefined &&
          direct.skipRows === 0 &&
          direct.dropRows === 0 &&
          ((blk as { minHeight?: number }).minHeight ?? 0) === 0 &&
          (blk as { capped?: unknown }).capped === undefined &&
          (pad === undefined || ["l", "r", "t", "b"].every((e) => (pad[e] ?? 0) === 0));
        const got = kit.registry.windowChild(blk, width, from, to);
        if (exact) sliced += 1;
        else refused += 1;
        if (exact !== (got !== null)) disagreed.push(`${blk.kind} ${blk.id} @${String(width)}`);
      }
    }

    expect(disagreed, "the seam and the definition agree on every block").toEqual([]);
    expect(sliced, "and the corpus exercises both answers — some slices are taken").toBeGreaterThan(10); // cells-ok
    expect(refused, "and some are refused").toBeGreaterThan(10); // cells-ok
    // The two added blocks are refused for their own reason and not because
    // their kind cannot window: `logs` slices exactly at every offset.
    expect(kit.registry.windowChild(floored, 40, 2, 5), "a floored block is kept whole").toBeNull();
    expect(kit.registry.windowChild(capped, 40, 2, 5), "and so is a capped one").toBeNull();
    expect(kit.window(lines("plain", 6), 40, 2, 5)?.skipRows, "while the same kind, unfloored, slices").toBe(0);
    expect(kit.registry.windowChild(lines("plain", 6), 40, 2, 5), "and the seam takes it").not.toBeNull();
  });
});

/**
 * C09 I83 — the focus ground, owed at the spec commit.
 *
 * **Both rows are about what does *not* move.** The first form of I83 reserved
 * a gutter column here; the frame refused it — a `step` head shifted two cells
 * and the `\u23bf` body under it did not — and four fixtures put the mark in the
 * gutter of the block that has addressable rows (C11 §5b). So a notice takes
 * the ground and nothing else, and the assertion is the geometry.
 */
describe("C09 I83 — a notice takes the focus ground and no column", () => {
  const HEAD = block({ kind: "notice", id: "h", tone: "default", glyph: "running", state: "running", text: "ps · ok" } as never);
  const BODY = block({ kind: "notice", id: "b", tone: "muted", glyph: "continuation", text: "one row" } as never);
  const WIDTH = 40;
  const kitAt = (focus: RenderContext["focus"], caps = FULL_CAPS) =>
    measurable({ theme: DARK_THEME, capabilities: caps, ...(focus === null ? {} : { focus }) });
  const params = (style: ReturnType<typeof tone>): string =>
    sgr(style).replace(/^\u001b\[/u, "").replace(/m$/u, "");
  const cellFor = (lines: readonly string[], text: string) => {
    const row = rowContaining(styledScreenFrom([lines.join("\r\n")], { columns: WIDTH, rows: lines.length }), text);
    const cell = row === null ? null : styleAt(row, text);
    if (cell === null) throw new Error(`no cell holds ${text}`);
    return cell;
  };

  it("T2.148 (I83, R-SEL-006, C10 I47): a focused `step` notice takes the focus ground and its geometry does not move", () => {
    const none = kitAt(null);
    const lit = kitAt({ blockId: "h", rowId: "h" });
    const plain = none.renderSequence([HEAD, BODY], WIDTH);
    const focused = lit.renderSequence([HEAD, BODY], WIDTH);

    // **The instrument responds before it is trusted**: the two frames are not
    // the same bytes, so a row asserting they agree on text is asserting
    // something (`test/support/README.md`).
    expect(focused, "the ground is painted, so the bytes differ").not.toEqual(plain);
    // **Cell for cell, and that is the whole of I83's first form being wrong.**
    // The reservation shipped here for one commit; the head moved two cells and
    // the `⎿` body under it did not.
    expect(focused.map(visible), "the text does not move").toEqual(plain.map(visible));
    const bodyColumn = (lines: readonly string[]): number => {
      const line = lines.map(visible).find((l) => l.includes("one row"));
      if (line === undefined) throw new Error("no ⎿ body in the frame");
      return line.indexOf("\u23bf");
    };
    expect(bodyColumn(focused), "the ⎿ lands in the same column").toBe(bodyColumn(plain));
    expect(bodyColumn(plain), "and that column is the gutter's, not zero").toBe(2);

    // **The measurement invariant, in both frames** — `measure` never sees a
    // focus, so a ground that changed the height would be invisible to it.
    for (const [name, kit, frame] of [
      ["unfocused", none, plain],
      ["focused", lit, focused],
    ] as const) {
      const measured = kit.measure(HEAD, WIDTH) + kit.measure(BODY, WIDTH);
      expect(frame.length, `${name}: measure equals the rows rendered`).toBe(measured);
    }

    // The ground is on the head and nowhere else.
    expect(cellFor(focused, "ps · ok").bg, "the head takes focusGround").toBe(
      params(focusStyle(DARK_THEME, FULL_CAPS)),
    );
    expect(cellFor(focused, "one row").bg, "the body keeps the page").toBe("");
    expect(cellFor(plain, "ps · ok").bg, "and unfocused there is no ground").toBe("");
  });

  it("T2.149 (I83, C10 I47): the focused notice keeps its own tone over the focus ground, on every tone", () => {
    const ground = params(focusStyle(DARK_THEME, FULL_CAPS));
    // **Three tones, because one passes a mechanism that paints a constant.**
    // The form this replaces put `accent` on the selection ground, which could
    // not tell a focused `info` notice from an unfocused `accent` one.
    for (const name of ["info", "error", "warn"] as const) {
      const notice = block({ kind: "notice", id: "h", tone: name, glyph: "running", state: "running", text: `on ${name}` } as never);
      const lines = kitAt({ blockId: "h", rowId: "h" }).renderSequence([notice], WIDTH);
      // **The slot is the notice's; the hex is the ground's answer** (C10 I48).
      // `dark` composes a nearer `error` for `focusGround`, so a row asserting
      // the flat slot here would be asserting a value the painter does not emit
      // — which is F1240's own shape, in a test rather than in a gate.
      expect(cellFor(lines, `on ${name}`), `${name}: its own tone over the focus ground`).toEqual({
        fg: params(tone(name, DARK_THEME, FULL_CAPS, "focusGround")),
        bg: ground,
        attrs: [],
      });
    }
    // And at least one of the three is a value the page does not hold, so the
    // loop is not satisfied by a resolver that ignores its fourth argument.
    expect(
      params(tone("error", DARK_THEME, FULL_CAPS, "focusGround")),
      "the ground moves at least one of them",
    ).not.toBe(params(tone("error", DARK_THEME, FULL_CAPS)));

    // **At one bit the ground is gone and the tone's mono class is what is
    // left.** `focusStyle` has no inverse rung — inverse is selection's only
    // carrier — so what survives here is the notice's own ink, and `▸` is what
    // says *focus* (R-SEL-006). A second inverse rung would make a focused row
    // and a selected one one frame.
    const mono = kitAt({ blockId: "h", rowId: "h" }, MONO_UNICODE_CAPS).renderSequence([HEAD], WIDTH);
    const monoPlain = kitAt(null, MONO_UNICODE_CAPS).renderSequence([HEAD], WIDTH);
    expect(cellFor(mono, "ps · ok").attrs, "no inverse at 1-bit").not.toContain(7);
    expect(cellFor(mono, "ps · ok"), "the tone's mono class, focused or not").toEqual(cellFor(monoPlain, "ps · ok"));
  });
});

/**
 * C09 I84 and I85 — the status parts and the empty state, owed at the spec
 * commit (§3a-ter).
 *
 * **T2.150 is the row that binds**, and it is here rather than in the generic
 * suite because `status`'s `measure` is the declared height where every other
 * kind's is computed: T2.1's agreement for this kind says only that a number was
 * echoed back, so the property needs a corpus of its own.
 */
describe("C09 §3a-ter — the status parts and the empty state", () => {
  const WIDTHS = [12, 20, 30, 40, 60, 80, 120];
  const STATES = ["error", "retrying", "loading"] as const;
  /** Nine rows of message, past `CONTENT_LINE_CAP` on purpose. */
  const LONG = Array.from({ length: 9 }, (_u, i) => `message line ${String(i)} ${"y".repeat(28)}`).join(" ");
  /** Six lines of detail, past `DETAIL_LINE_CAP` on purpose. */
  const BIG = Array.from({ length: 6 }, (_u, i) => `at frame${String(i)} (src/some/file.ts:${String(100 + i)}:12)`).join("\n");
  const MESSAGES = ["decode failed", "plot failed to render: series 'loss' has 0 points after filtering", LONG];
  const DETAILS = [undefined, "", "at planColumns (plan.ts:118)", BIG];
  const statusAt = (over: Record<string, unknown>): Block =>
    block({ kind: "status", id: "s", state: "error", message: "decode failed", height: 4, ...over } as never) as Block;

  it("T2.150 (C09 I84, C09 I1, §3a-ter): measure equals the rows rendered, over the message × detail × width × state × height corpus", () => {
    // **Here rather than in T2.1, and the reason is this kind's `measure`.**
    // Every other kind computes its height from the block; `status` returns the
    // height the caller declared. So T2.1's agreement for `status` says only
    // that a number was echoed back — it cannot see an allocation that draws
    // more rows than it was granted, because the granted number is the answer.
    // The corpus is what makes the row about the parts.
    const disagreed: string[] = [];
    let drawn = 0;
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const kit = measurable({ capabilities: caps });
      for (const message of MESSAGES) {
        for (const detail of DETAILS) {
          for (const state of STATES) {
            // 1 is below the furniture at every rung, which is the case the
            // allocation has to survive rather than the case it is written for.
            for (const height of [1, 2, 3, 5, 8, 12]) {
              for (const width of WIDTHS) {
                const b = statusAt({
                  message,
                  state,
                  height,
                  retryInMs: 8000,
                  elapsedMs: 4000,
                  ...(detail === undefined ? {} : { detail }),
                });
                const measured = kit.measure(b, width);
                const rendered = kit.renderToLines(b, width).length;
                drawn += 1;
                if (measured !== rendered) {
                  disagreed.push(`${state} h=${String(height)} w=${String(width)} d=${String(detail?.length ?? -1)}: ${String(measured)} vs ${String(rendered)}`);
                }
              }
            }
          }
        }
      }
    }
    expect(disagreed, "measure equals the rows rendered").toEqual([]);
    // The corpus is a corpus. A filter excluding every case satisfies the line
    // above exactly (F855's class, and T3.95's own last clause).
    expect(drawn, "and the corpus was walked").toBe(2 * 3 * 4 * 3 * 6 * 7);
  });

  it("T2.151 (C09 I84, C04 I49): a cut detail carries a residue row naming its count, and one that fits carries none", () => {
    const kit = measurable({ capabilities: FULL_CAPS });
    const lines = (over: Record<string, unknown>): string =>
      kit.renderToLines(statusAt(over), 60).map(visible).join("\n");

    // Six lines into a box with room for three: two shown, and the third says
    // how many went. `⋯ +N more` is `scroll`'s text verbatim, so a reader who
    // has met it in a container is not taught the mark twice.
    const cut = lines({ height: 8, detail: BIG });
    expect(cut, "two frames survive").toContain("at frame1");
    expect(cut, "and the residue names the rest").toContain("⋯ +4 more");
    expect(cut, "the dropped ones are gone").not.toContain("at frame5");
    // **The count follows the room, which is what says it is computed.** One row
    // less and one more frame goes, and the residue says so — a constant would
    // read as correct on the row above and nowhere else.
    expect(lines({ height: 6, detail: BIG }), "one row less, one more dropped").toContain("⋯ +5 more");

    // **The asymmetry, which is the half that is easy to lose.** A detail that
    // fits carries no mark — one claiming a truncation that did not happen sends
    // a reader looking for text already on screen, which is worse than a silent
    // cut because it is confidently wrong (the argument `bodyOf` already makes).
    const fits = lines({ height: 6, detail: "at planColumns (plan.ts:118)\nat render (definition.ts:337)" });
    expect(fits, "both lines are there").toContain("at render");
    expect(fits, "and nothing claims otherwise").not.toContain("more");

    // And the mark is capability-resolved, like every other one this file draws.
    const ascii = measurable({ capabilities: ASCII_CAPS })
      .renderToLines(statusAt({ height: 6, detail: BIG }), 60)
      .map(visible)
      .join("\n");
    expect(ascii, "the ascii residue").toContain("... +5 more");
    expect(ascii).not.toContain("⋯");
  });

  it("T2.152 (C09 I84, F239, §3a-ter): with no detail the render is unchanged and only the request moves, upward", () => {
    // **The row about the part that already worked.** A suite asserting the new
    // part works says nothing about the old one, and this change's whole claim
    // to being additive rests on the no-detail case being untouched.
    const kit = measurable({ capabilities: FULL_CAPS });
    for (const message of MESSAGES) {
      for (const state of STATES) {
        for (const height of [1, 2, 3, 5, 8, 12]) {
          for (const width of WIDTHS) {
            const bare = statusAt({ message, state, height, retryInMs: 8000, elapsedMs: 4000 });
            const shrug = statusAt({ message, state, height, retryInMs: 8000, elapsedMs: 4000, detail: "" });
            expect(
              kit.renderToLines(shrug, width),
              `${state} h=${String(height)} w=${String(width)}: an empty detail changes no cell`,
            ).toEqual(kit.renderToLines(bare, width));
          }
        }
      }
    }

    // **The request, and it moves in one direction.** The cap was 4 on the
    // message and is 7 on the box, so a message that wrapped past four rows asks
    // for more than it used to and nothing asks for less.
    const asked = (message: string, width: number): number =>
      statusRowsFor(statusAt({ message, height: 1 }) as never, width, FULL_CAPS);
    expect(asked(LONG, 40), "a nine-row message used to be held to four").toBeGreaterThan(4);
    expect(asked(LONG, 40), "and is held by the box's cap instead").toBeLessThanOrEqual(CONTENT_LINE_CAP + 3);
    for (const width of WIDTHS) {
      expect(asked("decode failed", width), `w=${String(width)}: a short message is unmoved`).toBeLessThanOrEqual(5);
    }
  });

  it("T2.153 (C09 I85, §047, §096): an `empty` status has no banner, no mark and no error tone, and is centred on both axes", () => {
    const kit = measurable({ capabilities: FULL_CAPS });
    const at = (state: string) => kit.renderToLines(statusAt({ state, message: "No data.", height: 7 }), 40);
    const empty = at("empty");
    const error = at("error");
    const seen = empty.map(visible);

    // **Against `error` at the same height and width**, so each absence is a
    // difference and not a description — a row asserting only that the frame
    // lacks a banner passes on a box too narrow to draw one.
    expect(error.map(visible).join("\n"), "the control draws all three").toMatch(/ERROR/u);
    expect(seen.join("\n"), "no banner").not.toMatch(/ERROR/u);
    expect(seen.join(""), "no mark").not.toContain("▲");
    const tone24 = sgr(tone("error", DARK_THEME, FULL_CAPS));
    expect(error.join(""), "the control is painted in the error tone").toContain(tone24);
    expect(empty.join(""), "and this one is not").not.toContain(tone24);

    // **Centred on both.** Horizontally, the ink sits at the floor of the slack;
    // vertically, the rows above and below the content differ by at most one,
    // which is the group centring this state inherits rather than adds.
    const row = seen.findIndex((l) => l.includes("No data."));
    expect(row, "the content is drawn").toBeGreaterThan(0);
    const line = seen[row] ?? "";
    // **The border is stripped before the slack is measured, and the first form
    // of this was vacuous for exactly that reason.** A bordered row begins with
    // `│`, which is not whitespace, so `trimStart` removed nothing and both
    // margins came out at the same constant — the assertion held for a
    // left-ranged row as readily as a centred one, and the mutation that ranges
    // it left survived the pass. Containment is not correctness.
    const inner = line.slice(2, line.length - 2);
    const marginL = inner.length - inner.trimStart().length;
    const marginR = inner.length - inner.trimEnd().length;
    expect(marginL, "the ink is not against the left edge").toBeGreaterThan(0);
    expect(Math.abs(marginL - marginR), "centred horizontally, odd cell to the right").toBeLessThanOrEqual(1);
    const above = row - 1;
    const below = seen.length - row - 2;
    expect(Math.abs(above - below), "and vertically, odd row below").toBeLessThanOrEqual(1);
  });
});
