// §047 — a stale reading says when it was taken, and its content dims while its
// chrome does not (R-HON-002; C04 I127, C09 I109, C09 I110, C10 I59).
//
// ```
//   ┌ workers ────────────── updated 4m ago ─┐
//   │ build   running   2d 4h                │
//   └────────────────────────────────────────┘
// ```
//
// The figure's own markup: the border and the title in `muted`, the notice in
// `warn`, every content span in `dim` — `running` included.
import { describe, expect, it } from "vitest";

import { block, validateBlock } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { age } from "../../src/presentation/blocks/index.js";
import { tone } from "../../src/presentation/blocks/paint.js";
import { sgr } from "../../src/terminal/escapes.js";
import { defaultTheme, recede, resolve } from "../../src/presentation/theme/index.js";
import type { ResolvedTheme } from "../../src/presentation/theme/index.js";
import { displayCells } from "../../src/presentation/text.js";
import { DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, measurable, registry, visible } from "../support/render.js";

// `running` in `ok`, as the tree would draw a state — the tone T2.173 watches it lose.
const child: Block = block({
  kind: "raw",
  id: "w-c",
  text: "build   running   2d 4h",
  spans: [{ from: 8, to: 15, tone: "ok" }],
} as Block);
const workers = (staleForMs?: number, title = "workers"): Block =>
  block({
    kind: "panel",
    id: "w",
    title,
    ...(staleForMs === undefined ? {} : { staleForMs }),
    children: [child],
  } as Block);

describe("§047 — the stale reading", () => {
  it("T1.51 (C04 I127): staleForMs validates as a non-negative finite number", () => {
    for (const ok of [0, 240_000]) {
      expect(validateBlock(workers(ok)).ok, `${String(ok)} is an age`).toBe(true);
    }
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateBlock(workers(bad));
      expect(r.ok, `${String(bad)} is not an age`).toBe(false);
      expect(r.ok ? "" : r.error.join("\n"), "and the field is named").toContain('"staleForMs"');
    }
    expect(validateBlock(workers()).ok, "and absent is fresh").toBe(true);
  });

  it("T1.74 (C09 I109): age over the unit boundaries", () => {
    const table: readonly (readonly [number, string])[] = [
      [59_999, "59s"],
      [60_000, "1m"],
      [3_599_999, "59m"],
      [3_600_000, "1h0m"],
      [4_320_000, "1h12m"],
      [86_400_000, "1d 0h"],
      [187_200_000, "2d 4h"],
    ];
    expect(table.map(([ms]) => age(ms))).toEqual(table.map(([, s]) => s));
  });

  it("T2.172 (C09 I109, R-HON-002): §047's figure, and the title yields before the notice", () => {
    const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS });
    const stale = workers(240_000);
    const lines = kit.renderToLines(stale, 42);
    const top = visible(lines[0] ?? "");
    // **The notice at the inline end, one horizontal before the corner** — the
    // figure's `─ updated 4m ago ─┐`, not the title's `workers · 240s ago`.
    expect(top).toMatch(/^┌ workers ─+ updated 4m ago ─┐$/u);
    expect(displayCells(top), "the border closes at the width").toBe(42);
    const warn = sgr(tone("warn", DARK_THEME, FULL_CAPS));
    expect(lines[0], "the notice is painted in warn").toContain(`${warn}${" updated 4m ago "}`);

    // **Height is unchanged** (C04 I127): the notice rides in a row drawn anyway.
    expect(kit.measure(stale, 42)).toBe(kit.measure(workers(), 42));
    expect(lines).toHaveLength(kit.measure(stale, 42));
    expect(visible(kit.renderToLines(workers(), 42)[0] ?? ""), "a fresh panel draws no notice").not.toContain("ago");

    // **Short border: the title goes first.** At 24 the notice needs 16 + 1 of
    // 22 inner cells, which leaves the title too little room to say anything.
    const narrow = visible(kit.renderToLines(stale, 24)[0] ?? "");
    expect(narrow, "the notice is whole").toContain(" updated 4m ago ─┐");
    expect(narrow, "and the title yielded").not.toContain("workers");
    expect(displayCells(narrow)).toBe(24);
    // Control: the same width with a one-letter title keeps it, so the row
    // above is about room rather than about titles vanishing when stale.
    expect(visible(kit.renderToLines(workers(240_000, "w"), 24)[0] ?? "")).toMatch(/^┌ w ─+ updated 4m ago ─┐$/u);

    // **`width` counts the notice** (C09 I109): a panel asked its natural width
    // answers one wide enough to draw title, notice and furniture untruncated.
    const natural = registry().width(stale, 200);
    expect(visible(kit.renderToLines(stale, natural)[0] ?? "")).toMatch(/^┌ workers ─+ updated 4m ago ─┐$/u);
  });

  it("T2.173 (C09 I110): a stale panel's content dims and its border does not", () => {
    const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS });
    const ok = sgr(tone("ok", DARK_THEME, FULL_CAPS));
    const dim = sgr(tone("dim", DARK_THEME, FULL_CAPS));
    expect(ok, "the two tones differ, or the rows below prove nothing").not.toBe(dim);

    const fresh = kit.renderToLines(workers(), 42);
    expect(fresh[1], "fresh, the content keeps its tone").toContain(ok);

    const stale = kit.renderToLines(workers(240_000), 42);
    expect(stale[1], "stale, the content is dim").toContain(dim);
    expect(stale[1], "and not ok").not.toContain(ok);
    // **The chrome does not dim** — the border is painted as the fresh one is.
    expect(stale[2], "the bottom border is the fresh one's").toBe(fresh[2]);
    expect(stale[1]?.startsWith(fresh[1]?.slice(0, fresh[1].indexOf("│") + 1) ?? "∅"), "and so is the rail").toBe(true);
  });

  it("T1.50 (C10 I59): recede resolves every palette slot as tone.dim at every depth", () => {
    const themes: readonly ResolvedTheme[] = Object.values(defaultTheme).map((tokens) => ({
      name: tokens.name,
      variant: tokens.variant,
      tokens,
    }));
    expect(themes.length, "every shipped theme").toBeGreaterThanOrEqual(10);
    for (const theme of themes) {
      const r = recede(theme);
      expect(r.name, "its own name, or the memo serves the live theme").not.toBe(theme.name);
      expect(recede(r), "receding twice is the same theme").toBe(r);
      expect(recede(theme), "one object per theme").toBe(r);
      for (const depth of [1, 4, 8, 24] as const) {
        const caps = { ...FULL_CAPS, colourDepth: depth };
        const dim = resolve("tone.dim", theme, caps);
        for (const palette of ["tone", "syntax"] as const) {
          for (const slot of Object.keys(theme.tokens.palettes[palette]?.slots ?? {})) {
            expect(resolve(`${palette}.${slot}`, r, caps), `${theme.name} ${palette}.${slot} @${String(depth)}`).toEqual(dim);
          }
        }
        for (const surface of Object.keys(theme.tokens.surfaces)) {
          expect(resolve(`surface.${surface}`, r, caps), `${theme.name} surface.${surface} @${String(depth)}`).toEqual(
            resolve(`surface.${surface}`, theme, caps),
          );
        }
      }
    }
    // **The 1-bit carrier is the tone's own class** — `dim` collapses to its
    // typographic fallback, which is how the content still reads receded when
    // no colour is emitted.
    const mono = resolve("tone.ok", recede(DARK_THEME), MONO_UNICODE_CAPS);
    expect(mono).toEqual(resolve("tone.dim", DARK_THEME, MONO_UNICODE_CAPS));
  });
});
