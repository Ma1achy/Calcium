// Roadmap 22 — a banner from a sparse set of variants.
//
// **The rows are the walk's table, one per cell.** §8a indexes the component by
// *rule interaction* rather than by input, so a row governed by one rule is a
// restatement of that rule and finds nothing: what is asserted here is the
// states where two correct statements overlap. Row 3 — a `blocks` variant this
// terminal can draw and is too narrow for — is the cell the entry's own sketch
// does not have, and T2.84c is it.
import { describe, expect, it } from "vitest";

import { art } from "../../src/presentation/art.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, measurable, visible } from "../support/render.js";

/** Three rows of block elements, 10 cells wide. */
const BLOCKS = ["▄▄▄▄▄▄▄▄▄▄", "█ Docker █", "▀▀▀▀▀▀▀▀▀▀"].join("\n");
/** Two rows of ASCII, 6 cells wide — narrower than BLOCKS on purpose. */
const ASCII = [" ____ ", "|Dock|"].join("\n");

const SPEC = { text: "Docker", variants: { blocks: BLOCKS, ascii: ASCII } };

/** The widest row of a block's text, however the block spells it. */
const drawnWidth = (b: { text?: string }): number =>
  (b.text ?? "").split("\n").reduce((n, l) => Math.max(n, cells(l)), 0);

describe("roadmap 22 — art, and the chain that ends at text", () => {
  it("T2.84a (§8a row 1): the tier excludes blocks and the lower rung answers", () => {
    // Both declared, both fit, and the terminal cannot draw block elements. A1
    // rules blocks out; A2 is what supplies an answer rather than nothing.
    const b = art(SPEC, ASCII_CAPS, 80);

    expect(b.kind).toBe("raw");
    expect((b as { text: string }).text).toBe(ASCII);
  });

  it("T2.84b (§8a row 2): tier wins when width does not decide", () => {
    // Both eligible, both fit. The two rules agree here, which is precisely why
    // this row alone would certify nothing — it is the control for T2.84c.
    const b = art(SPEC, FULL_CAPS, 80);

    expect((b as { text: string }).text).toBe(BLOCKS);
  });

  it("T2.84c (§8a row 3): a variant this terminal can draw and cannot fit falls through", () => {
    // **The cell the entry does not have.** `blocks` is tier-eligible and is 10
    // cells; the terminal is 8. Selecting by tier alone hands back art the
    // renderer then truncates — which is how docker-tui's fixed threshold drew
    // a lone whale on an 80-column terminal with room for the name beside it.
    //
    // The width is chosen to sit *between* the two variants, so the assertion
    // separates the rules rather than agreeing with both: 6 ≤ 8 < 10.
    expect(drawnWidth({ text: BLOCKS })).toBe(10);
    expect(drawnWidth({ text: ASCII })).toBe(6);

    const b = art(SPEC, FULL_CAPS, 8);

    expect(b.kind).toBe("raw");
    expect((b as { text: string }).text, "the next rung, not a truncated blocks").toBe(ASCII);
  });

  it("T2.84d (§8a row 5): a lone ASCII variant is used at a higher depth", () => {
    // The forgiving direction, and the middle rung's whole purpose: declare only
    // the ASCII art and it works everywhere. Neither this nor T2.84e is an error.
    const b = art({ text: "Docker", variants: { ascii: ASCII } }, FULL_CAPS, 80);

    expect((b as { text: string }).text).toBe(ASCII);
  });

  it("T2.84e (§8a row 4): a lone blocks variant on an ASCII terminal reaches the text", () => {
    // A2 has no lower rung to offer, so A3 answers. `notice` rather than `raw`,
    // because `raw` carries no style and *the text, styled* would otherwise name
    // an operation the layer below does not have.
    const b = art({ text: "Docker", variants: { blocks: BLOCKS } }, ASCII_CAPS, 80);

    expect(b.kind).toBe("notice");
    expect(b).toMatchObject({ text: "Docker", tone: "accent" });
    expect(b, "no glyph — a banner is not a message").not.toHaveProperty("glyph");
  });

  it("T2.84f (§8a row 6): the last rung is reached by width, not only by absence", () => {
    // Everything declared, everything eligible, nothing fits. The chain in the
    // entry says *nothing declared → the text*; this is the state where the
    // rung is reached with both variants declared, which it does not say.
    const b = art(SPEC, FULL_CAPS, 4);

    expect(b.kind).toBe("notice");
    expect((b as { text: string }).text).toBe("Docker");
  });

  it("T2.84g (§8a row 7): the text rung wraps rather than truncating", () => {
    // **Read the frame, not the shape.** The ruling is about what a reader sees
    // when the last rung is itself too wide, and `kind: "notice"` is a proxy for
    // it — `raw` would have gone through `fit` and lost the tail with nothing to
    // show it had. A4 does not reach this rung: there is nothing below to fall to.
    const b = art({ text: "Docker Desktop" }, FULL_CAPS, 8);
    const { renderToLines } = measurable({ capabilities: FULL_CAPS });
    const lines = renderToLines(b, 8).map(visible);

    expect(lines.length, "wrapped onto a second row").toBeGreaterThan(1);
    expect(lines.join("").replace(/\s+/gu, " ").trim()).toContain("Desktop");
  });

  it("T2.84h: the last rung is bold with no colour to spend", () => {
    // The mechanism the ruling rests on, asserted rather than cited. `accent`'s
    // mono class is `emphasised`, so *styled* survives a 1-bit terminal — which
    // is the whole claim `Docker` in bold beats no banner makes.
    const { renderToLines } = measurable({ capabilities: MONO_CAPS });
    const painted = renderToLines(art({ text: "Docker" }, MONO_CAPS, 40), 40).join("");
    // `String.fromCharCode(27)` rather than the character, for A03 SS14's reason
    // — the escape is written in `terminal/escapes.ts` and nowhere else.
    const esc = String.fromCharCode(27);

    expect(painted, "SGR bold on").toContain(`${esc}[1m`);
    expect(visible(painted), "and the name is what it wraps").toBe("Docker");
  });

  it("T2.84i (§8a row 9): a tab throws, and it throws for the variant nobody selected", () => {
    // **Two failures under one sentence.** *The fallback is a fallback, not a
    // filter* is about art that is missing; a tab is a programming error, and
    // letting it select the next rung would render correctly on the machine that
    // wrote it. A tab measures 1 to `cells` and draws to the terminal's next
    // stop, so measurement and rendering disagree by machine.
    expect(cells("a\tb"), "the disagreement, measured").toBe(3);

    expect(() => art({ text: "D", variants: { ascii: "a\tb" } }, FULL_CAPS, 80)).toThrow(
      /contains a tab/u,
    );

    // And on an ASCII terminal, where `blocks` is not eligible and would never
    // have been drawn: the check is about the declaration, not the selection,
    // so it fires on the machine that wrote the art rather than the one that
    // can draw it.
    expect(() => art({ text: "D", variants: { blocks: `${BLOCKS}\t` } }, ASCII_CAPS, 80)).toThrow(
      /contains a tab/u,
    );
  });

  it("T2.84j (§8a row 8): an empty fallback is a construction error", () => {
    // A declaration whose last rung is empty can produce nothing, which is what
    // the chain refuses. The variants being present does not rescue it — the
    // rung has to exist at every width.
    expect(() => art({ text: "", variants: { ascii: ASCII } }, FULL_CAPS, 80)).toThrow(
      /always-available fallback/u,
    );
  });

  it("T2.84k (§8a row 10): the throw leaves nothing behind", () => {
    // Asked rather than assumed, because C13's `settle` is the measured case
    // where a correct decision to throw created a state two components away that
    // C23 I9 forbids. `art` holds no store, so the same call after a throw is
    // the same answer — asserted against a *shared* spec object, which is the
    // only thing a throw here could have reached.
    const spec = { text: "Docker", variants: { ascii: `${ASCII}\t` } };

    expect(() => art(spec, FULL_CAPS, 80)).toThrow();
    expect(spec.variants.ascii, "the caller's declaration is untouched").toBe(`${ASCII}\t`);

    const good = art({ text: "Docker" }, FULL_CAPS, 80);
    expect(good.kind, "and the next call is unaffected").toBe("notice");
  });

  it("T2.84m (C02 I9, A03 SS50): a wide terminal is not a tier the blocks variant has", () => {
    // **The row the walk did not have, and A03's SS50 is what found it.** §8a's
    // table indexes tier against width and has no third axis, so `ambiguousWidth`
    // never appears in it — and `▄ ▀ █ ░ ▐ ▖` are `East_Asian_Width=Ambiguous`,
    // every one of them. A terminal that draws them two cells wide draws the
    // wordmark at double width, and a wordmark whose glyphs double is not a
    // wordmark. `mermaid.ts` makes the same ruling about box drawing; this is
    // the second consumer to need the same switch.
    //
    // **Width alone does not reach it**, which is why the tier is what refuses:
    // a doubled wordmark that still fits is drawn, twice as wide as its author
    // measured it, on a terminal nobody developing the art was using.
    expect(cells("▄", "narrow")).toBe(1);
    expect(cells("▄", "wide"), "ambiguous, and the convention decides").toBe(2);

    const wide = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    const b = art(SPEC, wide, 200);

    expect(b.kind, "not the blocks variant, however much room there is").toBe("raw");
    expect((b as { text: string }).text).toBe(ASCII);
  });

  it("T2.84n (A03 SS50): the measurement carries the convention even where the tier cannot", () => {
    // **The mutation pass wrote this row.** Removing the convention from
    // `widthOf` survived every other row, because the only ambiguous art in the
    // fixtures above is the `blocks` variant — and the tier arm already refuses
    // that at `wide`, so the two rules mask each other exactly. The ruling was
    // stated in a comment and constrained nothing, which is the vacuity class in
    // prose.
    //
    // The state that separates them: art an app declares under **`ascii`** and
    // draws with box characters, which are ambiguous too. The tier has no
    // objection — the app said ascii — so only the measurement can be wrong.
    const box = ["┌────┐", "└────┘"].join("\n");
    expect(cells("┌────┐", "narrow")).toBe(6);
    expect(cells("┌────┐", "wide"), "ambiguous, and drawn at double").toBe(12);

    const spec = { text: "Docker", variants: { ascii: box } };
    const narrow = { ...FULL_CAPS, ambiguousWidth: "narrow" as const };
    const wide = { ...FULL_CAPS, ambiguousWidth: "wide" as const };

    expect(art(spec, narrow, 8).kind, "6 cells in 8 columns").toBe("raw");
    expect(art(spec, wide, 8).kind, "12 cells in 8 columns is the text rung").toBe("notice");
  });

  it("T2.84l: measurement is `cells`, which is why a blocks variant can be chosen at all", () => {
    // `.length` and `cells` agree on the ASCII variant and disagree on the one
    // the measurement exists to choose. A row that used only ASCII art would
    // pass with either, which is the fixture agreeing with the defect.
    expect(BLOCKS.split("\n")[0]?.length).toBe(10);
    expect(cells(BLOCKS.split("\n")[0] ?? "")).toBe(10);

    // A wide variant: `.length` says 5 and the terminal spends 10.
    const wide = "日本語です！";
    expect(wide.length).toBe(6);
    expect(cells(wide)).toBe(12);

    const b = art({ text: "x", variants: { blocks: wide } }, FULL_CAPS, 10);
    expect(b.kind, "10 columns is not enough for 12 cells").toBe("notice");
    expect(art({ text: "x", variants: { blocks: wide } }, FULL_CAPS, 12).kind).toBe("raw");
  });
});
