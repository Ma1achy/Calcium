// C25 tier 4 — integration. Through the registry, against C10, and the seam where
// two palettes meet on one row.
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { defaultTheme, diffPairs, floorFor, ratio } from "../../src/presentation/theme/index.js";
import { hunkOf, patchOf, THE_ILLUSTRATION } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import type { ResolvedTheme } from "../../src/presentation/theme/index.js";

const kit = (options: Parameters<typeof measurable>[0] = {}): ReturnType<typeof measurable> =>
  measurable({ ...options, definitions: [patchDefinition as unknown as BlockDefinition<never>] });

/** The SGR a row carries, styling included — `visible()` is the other half. */
const raw = (width = 80, caps: TerminalCapabilities = FULL_CAPS, theme: ResolvedTheme = DARK_THEME): readonly string[] =>
  kit({ capabilities: caps, theme }).renderToLines(patchOf({ hunks: [THE_ILLUSTRATION] }), width);

/** A background sequence, at any depth: `48;…`, or the 4-bit 40–47 / 100–107 set. */
const BACKGROUND = /\[[0-9;]*(?:48;|4[0-7]m|10[0-7]m)/;

describe("C25 integration", () => {
  it("T4.1 (with C09): patch measures and renders through the dispatcher", () => {
    const registry = createBlockRegistry({});
    registry.register(patchDefinition as unknown as BlockDefinition);
    const patch = patchOf();

    const lines = renderSequenceToLines(registry, [patch], 80, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
    });

    expect(lines).toHaveLength(registry.measureSequence([patch], 80));
  });

  it("T4.2 (with C10): at depth 1 the distinction survives as prefix, and no colour is emitted", () => {
    const mono = kit({ capabilities: { ...FULL_CAPS, colourDepth: 1 } }).renderToLines(
      patchOf({ hunks: [hunkOf(["-old: 1", "+new: 2"])] }),
      80,
    );

    for (const row of mono) {
      expect(BACKGROUND.test(row), "no background at one bit").toBe(false);
      expect(/\[[0-9;]*3[0-79];/.test(row), "no foreground colour at one bit").toBe(false);
    }

    const flat = mono.map(visible).join("\n");
    expect(flat).toContain("-");
    expect(flat).toContain("+");
  });

  it("T4.3 (with C10): the syntax palette resolves inside a patch line — I16 widened", () => {
    // The whole reason C10 I16's list is two rather than one. A YAML key inside a
    // changed line takes `syntax.key`, and that is a different style from the
    // gutter's tone on the same row.
    const changed = raw().filter((r) => visible(r).includes("app: volatility-estimator"));

    expect(changed.length).toBeGreaterThan(0);
    for (const row of changed) {
      const codes = [...row.matchAll(/\[([0-9;]+)m/g)].map((m) => m[1]);
      expect(new Set(codes).size, "a gutter tone and a syntax slot are two styles").toBeGreaterThan(1);
    }
  });

  it("T4.4 (with C09, ascii): the collapse marker is `...`, height unchanged, ASCII only", () => {
    const unicode = kit().renderToLines(patchOf(), 80);
    const ascii = kit({ capabilities: ASCII_CAPS }).renderToLines(patchOf(), 80);

    expect(ascii).toHaveLength(unicode.length); // cells-ok — a row count
    for (const row of ascii.map(visible)) {
      for (const ch of row) expect(ch.codePointAt(0), JSON.stringify(row)).toBeLessThan(0x80);
    }
  });

  it("T4.6 (with C04, C24): a constructed patch validates and renders, both ways in", async () => {
    // **Both constructors, and they must agree.** This asserted through
    // `block()` alone while C24's `b` did not exist, with a comment saying
    // `b.patch` would be an ergonomic wrapper over exactly this call. It exists
    // now, so the deferral is spent — and the assertion that earns the pairing
    // is that the two produce the same block, since a wrapper that quietly
    // shaped its output differently would render and pass everything written
    // about either one alone.
    const { block } = await import("../../src/data/viewmodel/index.js");
    const { b } = await import("../../src/shell/builders/index.js");

    const built = block({
      kind: "patch" as const,
      id: "built",
      path: "a.yaml",
      language: "yaml",
      hunks: [hunkOf([" a: 1", "+b: 2"])],
    });
    const viaBuilder = b.patch({
      id: "built",
      path: "a.yaml",
      language: "yaml",
      hunks: [hunkOf([" a: 1", "+b: 2"])],
      gapBefore: false,
    });

    expect(built.kind).toBe("patch");
    expect(Object.isFrozen(built), "constructed blocks are frozen (C04)").toBe(true);
    expect(Object.isFrozen(viaBuilder), "b never returns an unfrozen block (C24 I3)").toBe(true);
    expect(viaBuilder).toEqual(built);
    expect(() => kit().renderToLines(built, 80)).not.toThrow();
    expect(kit().renderToLines(viaBuilder, 80)).toEqual(kit().renderToLines(built, 80));
  });

  it("T4.7 (with C10, I13): the background walks the ladder, and one bit has none", () => {
    const has = (rows: readonly string[]): boolean => rows.some((r) => BACKGROUND.test(r));

    expect(has(raw(80, { ...FULL_CAPS, colourDepth: 24 })), "24-bit").toBe(true);
    expect(has(raw(80, { ...FULL_CAPS, colourDepth: 4 })), "4-bit").toBe(true);
    expect(has(raw(80, { ...FULL_CAPS, colourDepth: 1 })), "1-bit has none").toBe(false);

    // And the marker and the toned gutter are still there at one bit, which is what
    // makes losing the background lossless under D29.
    const mono = raw(80, { ...FULL_CAPS, colourDepth: 1 }).map(visible).join("\n");
    expect(mono).toContain("-");
    expect(mono).toContain("+");
  });

  it("T4.8 (with C10, I12): every slot on a diff background clears its floor", () => {
    // C10's check, asserted from the patch side because C25 is the consumer that
    // made those surfaces text-bearing in the first place.
    for (const variant of ["dark", "light"] as const) {
      const tokens = defaultTheme[variant];
      for (const [palette, slotName, surface, hex] of diffPairs(tokens)) {
        const value = tokens.palettes[palette]?.slots[slotName] as string;
        expect(ratio(value, hex), `${variant} ${palette}.${slotName} on ${surface}`).toBeGreaterThanOrEqual(
          floorFor(slotName),
        );
      }
    }
  });

  it("T4.9 (with C10): a changed row's background reaches the full width", () => {
    // A background that stopped where the text stopped would be ragged, and the row
    // is the unit a reader sees.
    const width = 80;
    const changed = raw(width).filter((r) => visible(r).includes("prism.fmx.io/family"));

    expect(changed).toHaveLength(1);
    expect(cells(visible(changed[0] as string)), "padded to the full width").toBe(width);
  });

  it("T4.10 (I12a): in split, a blank facing an addition carries no add background", () => {
    // **The defect a frame showed and no assertion did.** One background per row
    // painted the empty left half green, which asserts that the side with no line
    // gained one. The background belongs to a side.
    const unpaired = raw(120).find((r) => visible(r).includes("prism.fmx.io/family"));

    expect(unpaired).toBeDefined();
    const [leftHalf] = (unpaired as string).split("│");
    expect(BACKGROUND.test(leftHalf as string), "the blank side is unpainted").toBe(false);
  });

  it("T4.11: both variants render, and only the styling differs", () => {
    const dark = raw(80, FULL_CAPS, DARK_THEME);
    const light = raw(80, FULL_CAPS, LIGHT_THEME);

    expect(dark.join("\n")).not.toBe(light.join("\n"));
    expect(light.map(visible), "colour never changes geometry").toEqual(dark.map(visible));
  });
});
