// **A REPO test, not a package test — and `test/repo/` is what says so.**
//
// This file reaches into `../../../../test/support/render.ts` for `measurable`,
// because comparing the container's rows against the hand-composed banner needs
// a block rendered to lines, and **the published package has no way to do
// that**: `@fmx/calcium` exports `createTui` and the builders, and rendering a
// block outside a session is a capability only the framework's own test support
// has.
//
// So the import is not sloppiness — it is a real gap in the public surface,
// reached from the one direction that finds those. What it is not is a test of
// the *package*, and `make proof` copies this example to a temp directory and
// runs it against the installed tarball, where the path does not exist. The
// gate was right: it says "the example is testing the repo, not the package",
// and this file was.
//
// `test/repo/` is excluded from `npm run test:package`, which is what proof
// runs. `npm test` still runs it, so the coverage is not lost — it is labelled.

/**
 * S1's banner. Every row holds a claim from `DOCKER_TUI_BANNER.md`.
 *
 * **The art is pinned against the document rather than transcribed from it.**
 * A banner is eight rows of whitespace-sensitive text, and a re-indent, a
 * trailing-space strip or an editor's "trim on save" changes it invisibly —
 * so the constants are compared to the fenced blocks in the artefact, and the
 * two cannot drift without a named failure.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cells } from "@fmx/calcium";
import type { Raw } from "@fmx/calcium";
import { FLOOR, WHALE_ROWS, WORDMARK_ROWS, banner, bannerLines, bannerRow, variants } from "../../src/banner.ts";
import { measurable } from "../../../../test/support/render.ts";
import { b, type Block } from "@fmx/calcium";

const DOC = readFileSync(new URL("../../DOCKER_TUI_BANNER.md", import.meta.url), "utf8");
const fenced = [...DOC.matchAll(/```[a-z]*\n([\s\S]*?)```/gu)].map((m) =>
  (m[1] as string).replace(/\n$/u, "").split("\n"),
);
/**
 * The four fenced blocks, in document order, and **asserted to be there**.
 *
 * A destructure of a `matchAll` is four possibly-undefined values, and reaching
 * past the end would make every row below a claim about `undefined` that the
 * assertions happily agree with. If the document loses a block, this line is
 * what says so.
 */
const at = (i: number, name: string): readonly string[] => {
  const found = fenced[i];
  if (found === undefined) throw new Error(`DOCKER_TUI_BANNER.md has no ${name} block at ${String(i)}`);
  return found;
};
const WHALE_DOC = at(0, "whale");
const WORDMARK_DOC = at(1, "wordmark");
const ASCII_DOC = at(2, "ASCII wordmark");
const COMPOSED_DOC = at(3, "composed");

const text = (bl: unknown): string => (bl as Raw).text;
const rowsOf = (bl: unknown): readonly string[] => text(bl).split("\n");

describe("K5: the row container draws the banner the hand-composition drew", () => {
  it("the frame is identical, and it is roadmap 38's acceptance test", () => {
    // **This is the whole argument for the entry, measured rather than
    // asserted.** Everything the composition does by hand — padding the whale to
    // a uniform width, holding two arts side by side, keeping the wordmark's
    // start column constant — is what a row container does, and a *proportion*
    // could not do it: `40 : 61` gives the whale 41 columns at 105 and 47 at
    // 120, so the gap widens with the terminal. `{cells: 43}` is 40 plus this
    // file's 4-column gap, less the container's one cell of gutter.
    //
    // Rendered through C09 rather than read off a `raw` block's text, because
    // the container's output *is* the claim.
    const row = bannerRow(120, true);
    expect(row, "a group at a width the composed variant fits").not.toBeNull();

    const kit = measurable({});
    const drawn = kit.renderToLines(row as Block, 120).map((l) => l.replace(/\s+$/u, ""));

    expect(drawn, "the container draws what the hand-composition drew").toEqual(
      COMPOSED_DOC.map((l) => l.replace(/\s+$/u, "")),
    );
  });
});

describe("K6: the blank first row is vertical alignment, hand-written into the art", () => {
  it("a bottom-aligned seven-row wordmark draws what the eight-row one draws", () => {
    // **The banner's second hand-written layout, and the container can express
    // it** (C04 I45). `DOCKER_TUI_BANNER.md` says the top pad *is already in the
    // document* — eight rows, the first blank — which puts the wordmark's
    // baseline on the whale's hull rather than its spout. That is a vertical
    // alignment, and a row already computes the height it would align within.
    //
    // **The art is not changed here**, and that is deliberate: K1–K4 assert the
    // document's art against the doc's own fenced blocks, so editing it would
    // fail those rows for a reason that has nothing to do with alignment. What
    // this shows is that the *container* reproduces what the blank row does.
    const kit = measurable({});
    const whale = b.raw(WHALE_ROWS.join("\n"));
    const padded = b.raw(WORDMARK_ROWS.join("\n"));
    const unpadded = b.raw(WORDMARK_ROWS.slice(1).join("\n"));

    const byHand = kit.renderToLines(
      b.group("row", [whale, padded], { flex: [{ cells: 43 }, 1] }),
      120,
    );
    const byContainer = kit.renderToLines(
      b.group("row", [whale, unpadded], {
        flex: [{ cells: 43 }, 1],
        align: ["top", "bottom"],
      }),
      120,
    );

    expect(unpadded, "the fixture is genuinely a row shorter").not.toEqual(padded);
    expect(byContainer.map((l) => l.replace(/\s+$/u, ""))).toEqual(
      byHand.map((l) => l.replace(/\s+$/u, "")),
    );

    // **The control**: without the alignment the shorter art sits at the top,
    // which is the rendering the blank row exists to prevent — so the row above
    // is about the alignment rather than about the two arts happening to match.
    const unaligned = kit.renderToLines(
      b.group("row", [whale, unpadded], { flex: [{ cells: 43 }, 1] }),
      120,
    );
    expect(unaligned.map((l) => l.replace(/\s+$/u, ""))).not.toEqual(
      byHand.map((l) => l.replace(/\s+$/u, "")),
    );
  });
});

describe("K11: the container aligns, and the ASCII arm was wrong before it did", () => {
  it("both wordmarks sit on the whale's hull, not its spout", () => {
    // **K6 proved the equivalence and nothing acted on it** — the app went on
    // hand-writing the blank row and its own comment said a row group has no
    // opinion, while `Valign`'s declaration named this banner as its consumer.
    // Both correct about their own half, and the proof was already in this file.
    //
    // **The ASCII arm was never right here, and only the frame said so.** Five
    // rows against the whale's eight, bottom-aligned by `compose`'s
    // `alignBottom` on the hand path and top-aligned by the container on this
    // one — so it drew against the spout. The row count is eight either way,
    // which is why no arithmetic could have caught it.
    const kit = measurable({});

    for (const [label, blocks, mark] of [
      ["blocks", true, /[▄▀█]/u],
      ["ascii", false, /[_|\\/]/u],
    ] as const) {
      const drawn = kit
        .renderToLines(bannerRow(120, blocks) as Block, 120)
        // Past the whale's column — `WHALE_CELLS` plus this file's gap — so
        // what is left is the wordmark's own rows and nothing else.
        .map((l) => l.slice(44).replace(/\s+$/u, ""));

      expect(drawn, `${label}: eight rows`).toHaveLength(8);
      expect(drawn[0], `${label}: nothing beside the spout`).toBe("");
      expect(drawn[7], `${label}: the last row carries art`).toMatch(mark);
    }
  });
});

describe("the three build-time claims", () => {
  it("K1: no tab characters anywhere — in the art, or in the document that holds it", () => {
    // **A real hazard, not tidiness.** A tab is one cell to `cells()` and eight
    // columns to the terminal, so measurement and rendering disagree and the
    // disagreement varies by machine. Asserted on both sides: the document is
    // where somebody will paste new art.
    expect(DOC).not.toContain("\t");
    for (const b of [banner(120, true), banner(120, false), banner(80, false)]) {
      expect(text(b), "the built banner").not.toContain("\t");
    }
  });

  it("K2: the whale is trimmed AND padded to a uniform 40 — two operations", () => {
    // **The fixture is shown to contain the trap.** The document's whale is
    // ragged in content *and* carries trailing whitespace past its widest row,
    // so padding alone leaves three rows wider than the rest and the wordmark
    // starts at a different column on each. Without these two lines the
    // assertion below passes against art that was already uniform.
    const extents = WHALE_DOC.map((l) => cells(l.replace(/\s+$/u, "")));
    expect(new Set(extents).size, "ragged as written").toBeGreaterThan(1);
    expect(Math.max(...WHALE_DOC.map((l) => cells(l))), "and padded past its content").toBe(43);
    expect(Math.max(...extents), "whose content runs to exactly 40").toBe(40);

    // Every composed row starts the wordmark at the same column.
    const composed = rowsOf(banner(120, true)).filter((l) => l.includes("█"));
    const starts = composed.map((l) => l.indexOf("█"));
    expect(new Set(starts).size, "one column, on every row that has one").toBe(1);
  });

  it("K3: the wordmark's top pad is already in the document and is not stripped", () => {
    // **The claim that would have bitten.** The spec said "top-pad the wordmark
    // by one row"; the document already has it — 8 entries, the first blank,
    // 7 of content. Adding one produces nine, and a build step that trimmed
    // blank lines would silently undo a padding its author believed applied.
    expect(WORDMARK_DOC).toHaveLength(8);
    expect(WORDMARK_DOC[0]?.trim(), "the first row is blank, and deliberately").toBe("");
    expect(WORDMARK_DOC.filter((l) => l.trim() !== ""), "seven of content").toHaveLength(7);

    // It survives into the built banner: the first composed row carries the
    // whale's spout and no wordmark.
    const rows = rowsOf(banner(120, true));
    expect(rows).toHaveLength(8);
    const BLOCK = /[▄▀█]/u;
    expect(rows[0], "the spout row has no wordmark beside it").not.toMatch(BLOCK);
    expect(rows[1], "and the row below does").toMatch(BLOCK);
  });
});

describe("the art matches the document", () => {
  it("K4: the composed banner is the document's composed block", () => {
    // The pin. Right-trimmed on both sides, because trailing space is exactly
    // what an editor changes and is exactly what does not show.
    const trim = (ls: readonly string[]): readonly string[] => ls.map((l) => l.replace(/\s+$/u, ""));
    expect(trim(rowsOf(banner(120, true)))).toEqual(trim(COMPOSED_DOC));
  });

  it("K5: the ASCII variant is the document's, and pairs with the same whale", () => {
    const rows = rowsOf(banner(120, false));
    const joined = rows.join("\n");
    for (const line of ASCII_DOC) {
      if (line.trim() === "") continue;
      expect(joined, "every row of the ASCII wordmark appears").toContain(line.trimEnd());
    }
    expect(joined, "and no block elements survive").not.toMatch(/[▄▀█]/u);
  });
});

describe("the tiers", () => {
  it("K6: 103 by 8, as measured — the figure the tier table rests on", () => {
    const wide = variants().find((v) => v.name === "wide-blocks");
    expect(wide?.width).toBe(103);
    expect(wide?.rows).toBe(8);
  });

  it("K7: the threshold is each variant's own width, not a constant", () => {
    // **Found while building it.** The document's table reserves 80–102 for the
    // whale alone, which is right for the block wordmark and wrong for the
    // ASCII one: whale + ASCII wordmark is 76 cells and fits with room to
    // spare. A fixed 103 would show a lone whale on an 80-column ASCII
    // terminal with the name's space empty beside it.
    const ascii = variants().find((v) => v.name === "wide-ascii");
    expect(ascii?.width, "narrower than the tier the table reserves").toBeLessThan(80);

    expect(bannerLines(120, true)?.join("\n"), "blocks at 120").toContain("█");
    expect(bannerLines(90, true)?.join("\n"), "blocks do not fit at 90").not.toContain("█");
    expect(bannerLines(90, false)?.join("\n"), "but the ASCII wordmark does").toContain("_");
    expect(bannerLines(60, false)?.join("\n"), "at 60 the whale is alone").not.toContain("|");
  });

  it("K8: below the floor there is no art at all", () => {
    expect(banner(FLOOR - 1, true)).toBeNull();
    expect(banner(39, false)).toBeNull();
    expect(banner(40, false), "and at the floor exactly, the whale").not.toBeNull();
  });

  it("K9: the four the document names are three renderings, and that is worth saying", () => {
    // (wide | narrow) × (blocks | ASCII) is four selections; the whale is
    // already ASCII, so narrow×blocks and narrow×ASCII are the same picture.
    // Recorded rather than left as an off-by-one in the count.
    expect(variants()).toHaveLength(3);
    expect(bannerLines(60, true)).toEqual(bannerLines(60, false));
  });
});

describe("it is chrome", () => {
  it("K10: it costs eight rows at most, at every width it draws at", () => {
    // The frame-read checks that the dashboard keeps its rows; this checks the
    // number the frame-read is reading against, so a regression names itself.
    for (const width of [200, 120, 103, 102, 90, 80, 76, 60, 40]) {
      for (const blocks of [true, false]) {
        const lines = bannerLines(width, blocks);
        if (lines === null) continue;
        expect(lines.length, `${String(width)}/${String(blocks)}`).toBeLessThanOrEqual(8);
        expect(
          Math.max(...lines.map((l) => cells(l))),
          `${String(width)}/${String(blocks)} must not overflow`,
        ).toBeLessThanOrEqual(width);
      }
    }
  });
});
