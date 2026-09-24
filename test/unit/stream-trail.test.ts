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
import { spinnerFrames } from "../../src/presentation/blocks/glyphs.js";
import { tickIntervalOf } from "../../src/presentation/blocks/index.js";
import { styledScreenFrom } from "../support/styled-screen.js";

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

/**
 * A visible line with the agent's head mark taken off the end (C09 I101).
 *
 * **The rows below compare a streaming block against a settled one**, and the
 * mark is a second difference between the two — so without this they fail for
 * the mark rather than for the band, which is a different claim. Stripping it
 * keeps each row on its own subject. It refuses to strip anything that is not a
 * frame of the set, so a row cannot quietly lose a character of text.
 */
const withoutMark = (line: string, caps = FULL_CAPS): string => {
  const trimmed = line.replace(/\s+$/u, "");
  const tail = trimmed.slice(-1);
  if (!spinnerFrames(caps, "agent").includes(tail)) return line;
  return trimmed.slice(0, -1).replace(/\s+$/u, ""); // cells-ok — a code-unit slice
};

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
    // **The mark is stripped, not ignored** (C09 I101): a streaming block carries
    // one and this row is about the band, so the difference is removed by name
    // rather than by loosening the comparison.
    expect(withoutMark(plainOf(tiny)), "the text is intact").toBe(plainOf(notice({ text: "ab" })).trimEnd());
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
      expect(withoutMark(visible(a)), `the text at ${String(width)} is unchanged`).toBe(visible(b).trimEnd());
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

  it("T1.57 (C09 I90, I101, §7e): a trail costs no rows, and the render is what measure said", () => {
    // **The settled block is no longer the control, and I101 is why.** A
    // streaming block reserves the mark's two cells, so it wraps where a settled
    // one does not — the old row compared two different wraps and the *no cell
    // moves* half would now be asserting that the reservation did not happen.
    //
    // What it was holding is the measurement invariant, the one carve-out the
    // design does not override, and that is asserted directly against the
    // render. *The trail costs nothing* is the five forms agreeing with each
    // other, which is the claim I90 actually makes.
    const kit = measurable();
    const text = "the parser tracks quotes with a single boolean";
    for (const width of [60, 40, 20, 10]) {
      const counts = TRAIL_FORMS.map((form) => {
        const b = notice({ text, streaming: true, trail: form });
        const drawn = kit.renderToLines(b as never, width);
        // Geometry never moves with appearance: what `measure` promised is what
        // the frame took.
        expect(kit.measure(b as never, width), `${form} at ${String(width)}: measure is the render`).toBe(
          drawn.length,
        );
        return kit.measure(b as never, width);
      });
      expect(new Set(counts).size, `at ${String(width)} the five forms cost the same`).toBe(1);
    }
  });

  it("T1.58 (C09 I91, I101, §7e): at 1-bit `weight` is bold, the other four draw nothing, and the mark survives", () => {
    const mono = capabilities({ colourDepth: 1 });
    const text = "the parser tracks quotes";
    const drawn = new Map(
      TRAIL_FORMS.map((form) => [form, bytesOf(notice({ text, streaming: true, trail: form }), 40, mono)]),
    );

    // **The four compared to each other, which is what *nothing* means here.**
    // The settled block stopped being the reference when the mark landed — it
    // survives 1-bit (C09 I101) and so does its reservation — so a row against it
    // would fail for the mark rather than for the trail.
    const quiet = TRAIL_FORMS.filter((f) => f !== "weight");
    const first = drawn.get(quiet[0]!);
    for (const form of quiet) {
      expect(drawn.get(form), `${form} draws nothing at 1-bit`).toBe(first);
    }
    // Bold is SGR 1, and it is the only thing a 1-bit terminal has.
    expect(drawn.get("weight"), "weight is bold").toContain(`${ESC}[1m`);
    expect(drawn.get("weight"), "and it is a change").not.toBe(first);

    // **The other half, separated rather than standing in for the first**: at
    // 1-bit a streaming block differs from a settled one, and it differs by the
    // mark. Both halves would be one assertion under the old reference.
    const bare = bytesOf(notice({ text }), 40, mono);
    expect(first, "the mark survives 1-bit").not.toBe(bare);
    const marks = spinnerFrames(mono, "agent");
    expect(marks.includes(visible(first ?? "").trimEnd().slice(-1)), "and the difference is a frame of it").toBe(true);
  });
});

describe("C09 §7e / §026 — the mark at the head", () => {
  const MARK_TEXT = "the parser tracks quotes with a single boolean, which is why";

  /**
   * The rendered rows as a styled grid, so a cell can be asked for its colour.
   *
   * **A substring search answers neither half of the claim.** The mark is a
   * colour at a position, and `indexOf` gives a code-unit offset into a string
   * that is mostly escapes — it says nothing about which column the frame
   * landed in and nothing about the tone it took.
   */
  const gridOf = (b: Notice, width = 40, caps = FULL_CAPS, tick?: number) => {
    const kit = measurable({ capabilities: caps, ...(tick === undefined ? {} : { tick }) });
    const lines = kit.renderToLines(b as never, width);
    return styledScreenFrom(lines.map((l, i) => (i === 0 ? l : `\r\n${l}`)), {
      columns: width,
      rows: lines.length,
    });
  };

  it("T1.63 (C09 I101, §026 R-BLK-182): the mark is a frame of the agent set, one space past the head, in accent", () => {
    const b = notice({ text: MARK_TEXT, streaming: true });
    const grid = gridOf(b);
    const last = grid[grid.length - 1]!;
    const plain = last.map((c) => c.ch).join("");
    const head = plain.trimEnd().length - 1; // cells-ok — a column index

    const frames = spinnerFrames(FULL_CAPS, "agent");
    const mark = last[head]!;
    expect(frames.includes(mark.ch), `cell ${String(head)} holds ${JSON.stringify(mark.ch)}, an agent frame`).toBe(
      true,
    );
    // **One space, not zero and not two**: the cell before the mark is blank and
    // the one before that is the last character that arrived.
    expect(last[head - 1]!.ch, "one space between the text and the mark").toBe(" ");
    expect(last[head - 2]!.ch, "and the character before it is the head of the stream").not.toBe(" ");

    // **The tone, read against a reference rather than against a literal.** An
    // `accent` notice's own text is what accent looks like in this theme, so a
    // theme change moves both sides together.
    const ref = gridOf(notice({ text: "x", tone: "accent" }));
    expect(mark.style.fg, "the mark is accent").toBe(ref[0]![0]!.style.fg);

    // The control: settled, and the cell holds nothing.
    const settled = gridOf(notice({ text: MARK_TEXT }));
    const tail = settled[settled.length - 1]!.map((c) => c.ch).join("").trimEnd();
    expect(frames.includes(tail.slice(-1)), "a settled notice draws no mark").toBe(false);

    // **The frame advances and the column does not** — which is the whole of
    // *appearance animates, geometry never does* at this seam.
    const moved = gridOf(b, 40, FULL_CAPS, 7);
    const movedLast = moved[moved.length - 1]!;
    expect(movedLast[head]!.ch, "the tick moved the frame").not.toBe(mark.ch);
    expect(frames.includes(movedLast[head]!.ch), "and it is still a frame of the same set").toBe(true);
    expect(movedLast[head - 1]!.ch, "and the column did not move").toBe(" ");
  });

  it("T1.64 (C09 I101, C04 I122, R-BLK-188): the cells are reserved, and a settled notice reserves nothing", () => {
    const kit = measurable();
    for (let width = 8; width <= 60; width += 1) { // cells-ok — a width sweep
      const b = notice({ text: MARK_TEXT, streaming: true });
      const drawn = kit.renderToLines(b as never, width);
      expect(kit.measure(b as never, width), `streaming at ${String(width)}: measure is the render`).toBe(
        drawn.length,
      );
      // **The width is the half that fires first**, because a row over the frame
      // is what the compositor wraps and the row count is what `measure` then
      // gets wrong. Asserted per row, not on the total.
      for (const line of drawn) {
        expect(cells(visible(line)), `no row overruns ${String(width)}`).toBeLessThanOrEqual(width);
      }
      const settled = notice({ text: MARK_TEXT });
      expect(kit.measure(settled as never, width), `settled at ${String(width)}: measure is the render`).toBe(
        kit.renderToLines(settled as never, width).length,
      );
    }
  });

  it("T1.65 (C09 I101, C03 I8): a streaming notice asks for the agent set's cadence, and a settled one for nothing", () => {
    const b = notice({ text: MARK_TEXT, streaming: true });
    const settled = notice({ text: MARK_TEXT });
    // **The premise, asserted rather than assumed.** `notice` is `false` in
    // `ANIMATES`, so a row checking only *some interval* would have passed on
    // the day neither carrier ticked — which is the day this clause repaired.
    expect(tickIntervalOf(settled as never), "a settled notice does not animate").toBeNull();
    expect(tickIntervalOf(b as never), "a streaming one does").not.toBeNull();
  });
});

describe("C09 §073 — the button's three rungs", () => {
  // **Spec-first, so these are `it.todo` and carry the reason** (TD6). The
  // invariants land this commit and the renderer follows in the next; a row
  // that ran today would be asserting against a button that draws bare text,
  // which is the measurement I102 is written from rather than a test.
  it.todo(
    "T1.66 (C09 I102, §073, C10 I51): resting takes bgElev padded, focused takes pick/pickInk bold with › inside the ground, and no ground resolving gives brackets — not deferred on a component; the spec landed this commit and the renderer follows in the next",
  );
  it.todo(
    "T1.67 (C09 I102, C04 I122, §073): the chrome is reserved at every width, and the two rungs' widths differ — two cells of padding against four of brackets — not deferred on a component; the spec landed this commit and the renderer follows in the next",
  );
  it.todo(
    "T1.68 (C09 I102, I47, §073): a call head is not a button — `declaresElement` is true for both, so the predicate is `action` — not deferred on a component; the spec landed this commit and the renderer follows in the next",
  );
});
