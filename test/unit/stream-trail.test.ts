// C04 §5c and C09 §7e — the trail's band at the head of a streaming run.
//
// **The band is what a terminal can afford.** §026 rules out a per-character
// fade over time and a glyph rising into its cell, both by cost; what is left
// is a fixed band whose cost is its width and not the reply's length.
import { describe, expect, it } from "vitest";

import { validateDocument, TRAIL_FORMS } from "../../src/data/viewmodel/index.js";
import type { Notice } from "../../src/data/viewmodel/index.js";
import { measurable, visible, FULL_CAPS } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import { capabilities } from "../support/fake-terminal.js";

const ESC = String.fromCharCode(27);

/** C09 §7e's band width, restated here so the row reads without the source. */
const TRAIL_CELLS = 3;

/**
 * The visible text of `bytes[0, i)`, with an incomplete escape trimmed off.
 *
 * **A byte-wise common prefix can stop inside a sequence**, and `visible`
 * strips only complete ones — so the leftover `38;2;2` read as text and the
 * empty case failed. Trimmed back to the escape only when the cut is inside
 * one, because cutting back at every escape would swallow the text before it.
 */
const safePrefix = (bytes: string, i: number): string => {
  const esc = bytes.lastIndexOf(ESC, i - 1);
  if (esc < 0) return visible(bytes.slice(0, i));
  const closed = /[a-zA-Z]/u.test(bytes.slice(esc, i));
  return visible(bytes.slice(0, closed ? i : esc));
};

const notice = (over: Partial<Notice> = {}): Notice =>
  ({ kind: "notice", id: "n", tone: "default", text: "the parser tracks quotes", ...over }) as Notice;

/** A complete envelope, so a legal block gives an empty list rather than nine. */
const doc = (b: unknown): unknown => ({
  schema: "tui.view/1",
  command: "x",
  status: "ok",
  meta: {
    verb: null,
    adapter: "test",
    stderr: "",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: [],
    transport: "local",
    origin: "user",
  },
  blocks: [b],
});
const errorsOf = (b: unknown): readonly string[] => {
  const r = validateDocument(doc(b) as never) as { ok: boolean; error?: readonly string[] };
  return r.ok ? [] : (r.error ?? []);
};

/** The rendered rows, with SGR kept — a trail is only visible in the bytes. */
const bytesOf = (b: Notice, width = 40, caps = FULL_CAPS): string =>
  measurable({ capabilities: caps }).renderToLines(b as never, width).join("\n");
const plainOf = (b: Notice, width = 40, caps = FULL_CAPS): string =>
  visible(bytesOf(b, width, caps));

describe("C04 §5c — the fact on the block", () => {
  it("T1.46 (C04 I122, §5c): `streaming` and `trail` pass the gate, and a wrong type does not", () => {
    expect(errorsOf(notice()), "the envelope itself is complete").toEqual([]);
    expect(errorsOf(notice({ streaming: true, trail: "hue" })), "the two fields are legal").toEqual([]);
    expect(
      errorsOf(notice({ streaming: "yes" as never })).some((e) => e.includes("C04 I122")),
      "a non-boolean `streaming` is refused",
    ).toBe(true);
  });

  it("T1.47 (C04 I123, §5c): `trail` with no `streaming` means nothing, and an unknown form is refused", () => {
    // **A settled block has no head**, so the pairing is legal and draws
    // nothing — asserted as the rendered rows, not only as validity.
    expect(errorsOf(notice({ trail: "ripple" })), "a trail with no stream is legal").toEqual([]);
    expect(bytesOf(notice({ trail: "ripple" })), "and it draws nothing").toBe(bytesOf(notice()));

    // **Refused rather than defaulted.** A misspelled form drawn as `hotEdge`
    // leaves the document saying one thing and the screen showing another, with
    // nothing reporting the disagreement.
    expect(
      errorsOf(notice({ streaming: true, trail: "hotedge" as never })).some((e) => e.includes("C04 I123")),
      "a misspelled form is refused, not defaulted",
    ).toBe(true);
    for (const form of TRAIL_FORMS) {
      expect(errorsOf(notice({ streaming: true, trail: form })), `${form} is in the union`).toEqual([]);
    }
  });
});

describe("C09 §7e — the band", () => {
  /**
   * Where the band begins, read as the text the two arms still agree on.
   *
   * **A row asserting only that the bytes differ cannot see the unit.** Counted
   * in characters rather than cells, the band is still a band and the bytes
   * still differ — a mutation swapping the two survived exactly that row. The
   * common byte prefix is where the styling first diverges, and its visible
   * text is the part of the line the band did **not** reach.
   */
  const untrailed = (b: Notice, width = 40): string => {
    const a = bytesOf(b, width);
    const bare = bytesOf({ ...b, streaming: false } as Notice, width);
    let i = 0;
    while (i < a.length && i < bare.length && a[i] === bare[i]) i += 1;
    return safePrefix(a, i);
  };

  it("T1.54 (C09 I90, §7e): the band is the last three cells, not the last three characters", () => {
    // **A line ending in wide clusters is what separates the two units**: three
    // cells reaches one `字` and a bit, so the band is the last cluster alone;
    // three *characters* would take all three and six cells with them.
    expect(untrailed(notice({ text: "ab 字字字", streaming: true })), "three cells, one wide cluster").toBe("ab 字字");

    // And on a narrow alphabet the two units coincide, which is why the row
    // above needs the wide one — this arm only shows the band is three of
    // something.
    expect(untrailed(notice({ text: "abcdefgh", streaming: true })), "three cells of narrow text").toBe("abcde");

    // A text shorter than the band takes all of it and reaches no further.
    const tiny = notice({ text: "ab", streaming: true });
    expect(plainOf(tiny), "the text is intact").toBe(plainOf(notice({ text: "ab" })));
    expect(untrailed(tiny), "the whole text is the band").toBe("");
  });

  it("T1.55 (C09 I90, §7e, R-BLK-198): chrome is never in the band, at any width", () => {
    // **A header has no position in the stream, so it exists complete or not at
    // all.** The band is derived over the wrapped *text* and the glyph is
    // prepended afterwards, so the mark's cells cannot be styled by the trail.
    //
    // **The case that separates it is a band covering the whole text**: with
    // two cells of text and a three-cell band there is nothing the band could
    // stop at, so a derivation measuring over the prefix would reach the mark.
    for (const [width, text] of [[40, "ab"], [40, "the parser tracks quotes"], [12, "ab"]] as const) {
      const marked = notice({ glyph: "running", state: "running", text, streaming: true });
      const bare = notice({ glyph: "running", state: "running", text });
      const a = bytesOf(marked, width);
      const b = bytesOf(bare, width);
      expect(visible(a), `the text at ${String(width)} is unchanged`).toBe(visible(b));
      // The mark is drawn, or the row is asserting nothing about it.
      expect(visible(b).trimStart().length, `the mark exists at ${String(width)}`).toBeGreaterThan(0);
      // **The agreed prefix covers the mark.** Where the styling first diverges
      // is inside the text, never at or before the glyph lead.
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
      const agreed = safePrefix(a, i);
      expect(agreed.length, `the band starts after the mark at ${String(width)}`).toBeGreaterThanOrEqual(2);

      // **And it starts exactly where the band's own width puts it**, which is
      // the half the bound above cannot say. A derivation that measures over
      // the glyph's cells as well as the text's still begins after the mark —
      // it begins *later*, with a band short by the lead — so a one-sided
      // assertion is satisfied by the defect it was written against. The tail
      // left over is the band, and it is `TRAIL_CELLS` wide or the whole text.
      const rest = visible(b).slice(agreed.length).trimEnd();
      expect(
        cells(rest, "narrow"),
        `the band is the text's last ${String(TRAIL_CELLS)} cells at ${String(width)}`,
      ).toBe(Math.min(TRAIL_CELLS, cells(text, "narrow")));
    }
  });

  it("T1.56 (C09 I90, C04 I123, §7e): the target is the run's own ink, not a fixed colour", () => {
    // **Two documents one field apart.** A fixed target passes any row that only
    // asks whether a ramp is present, so the arms differ by the run's tone
    // alone — `R-BLK-196`'s dim reasoning block, whose trail must cool to dim.
    const spans = [{ from: 0, to: 24, tone: "dim" as const }];
    const dim = notice({ text: "the parser tracks quotes", spans, streaming: true });
    const plain = notice({ text: "the parser tracks quotes", streaming: true });
    expect(bytesOf(dim), "a dim run's trail is not the body's").not.toBe(bytesOf(plain));

    // **`hue` cools to the body tone and `hotEdge` to the run's**, which is the
    // whole difference between them — they coincide when the run has no ink of
    // its own and separate the moment it does.
    expect(
      bytesOf(notice({ text: "x y", spans: [{ from: 0, to: 3, tone: "dim" }], streaming: true, trail: "hue" })),
      "hue and hotEdge differ on a run with its own ink",
    ).not.toBe(
      bytesOf(notice({ text: "x y", spans: [{ from: 0, to: 3, tone: "dim" }], streaming: true, trail: "hotEdge" })),
    );
  });

  it("T1.57 (C09 I90, §7e): a trail costs no rows", () => {
    // **The measurement invariant is the one carve-out the design does not
    // override**, so it is asserted rather than argued: appearance animates,
    // geometry never does.
    const kit = measurable();
    for (const width of [60, 40, 20, 10]) {
      for (const form of TRAIL_FORMS) {
        const b = notice({ text: "the parser tracks quotes with a single boolean", streaming: true, trail: form });
        const bare = notice({ text: "the parser tracks quotes with a single boolean" });
        expect(kit.measure(b as never, width), `${form} at ${String(width)} costs no rows`).toBe(
          kit.measure(bare as never, width),
        );
        expect(visible(kit.renderToLines(b as never, width).join("\n")), "and no cell moves").toBe(
          visible(kit.renderToLines(bare as never, width).join("\n")),
        );
      }
    }
  });

  it("T1.58 (C09 I91, §7e): at 1-bit `weight` is bold and the other four draw nothing at all", () => {
    const mono = capabilities({ colourDepth: 1 });
    const bare = bytesOf(notice({ text: "the parser tracks quotes" }), 40, mono);
    for (const form of TRAIL_FORMS) {
      const drawn = bytesOf(notice({ text: "the parser tracks quotes", streaming: true, trail: form }), 40, mono);
      if (form === "weight") {
        // Bold is SGR 1, and it is the only thing a 1-bit terminal has.
        expect(drawn, "weight is bold").toContain(`${ESC}[1m`);
        expect(drawn, "and it is a change").not.toBe(bare);
      } else {
        // **Byte-identical, which is what *nothing* means.** A row asserting
        // only "no colour" passes for a form that drew a mark instead.
        expect(drawn, `${form} draws nothing at 1-bit`).toBe(bare);
      }
    }
  });
});
