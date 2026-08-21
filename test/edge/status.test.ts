// C09 §3a — the `status` box, its two ladders, and its spinner.
//
// **Both ladders are read from the frame rather than from a count.** Every rung
// is arithmetically self-consistent — the row totals agree at every width and
// every height — so a frame that draws the wrong figure passes every assertion
// a number can make. Reading one is what found the width ladder never reaching
// the border, at which point `measure` said six and `render` drew ten.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import { spinnerFrames } from "../../src/presentation/blocks/index.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
const plain = (line: string): string => line.replace(SGR, "");

const MESSAGE = "connection refused by the upstream host";

type Over = Readonly<Record<string, unknown>>;

const status = (over: Over = {}): never =>
  block({
    kind: "status",
    id: "s",
    state: "error",
    message: MESSAGE,
    height: 7,
    ...over,
  } as never) as never;

const draw = (over: Over, width: number, opts: Over = {}): readonly string[] =>
  measurable({ capabilities: FULL_CAPS, ...opts })
    .renderToLines(status(over), width)
    .map(plain);

describe("C09 §3a — the box occupies what measure committed", () => {
  it("T3.38 (C09 I31): seven heights, three states, and the row count is the measurement", () => {
    // **All seven, because the ladder has six rungs.** One height cannot tell a
    // bound from a constant — the same argument T3.33 makes about the error path
    // this box replaces, and the defect it was written against answered 1 to
    // every input.
    const kit = measurable({ capabilities: FULL_CAPS });
    for (const state of ["error", "retrying", "loading"] as const) {
      for (const height of [1, 2, 3, 4, 5, 6, 20]) {
        const b = status({ height, state, retryInMs: 8000, elapsedMs: 4000 });
        expect(kit.measure(b, 50), `${state} at ${String(height)} measures`).toBe(height);
        expect(
          kit.renderToLines(b, 50).length,
          `${state} at ${String(height)} draws what it measured`,
        ).toBe(height);
      }
    }
  });

  it("T3.39 (C09 I31): the height ladder's six rungs draw what §3a says", () => {
    const bordered = (rows: readonly string[]): boolean =>
      rows[0]?.startsWith("┌") === true && rows[rows.length - 1]?.startsWith("└") === true;
    const tagged = (rows: readonly string[]): boolean => rows.some((r) => r.includes("[ERROR]"));
    const padded = (rows: readonly string[]): boolean => rows[1]?.trim() === "││".slice(0, 0);

    const at = (h: number): readonly string[] => draw({ height: h }, 50);

    // Six: the full figure — border, blank, tag, content, blank, border.
    expect(bordered(at(6)), "6 is bordered").toBe(true);
    expect(tagged(at(6)), "6 is tagged").toBe(true);
    expect(at(6)[1]?.replace(/[│]/gu, "").trim(), "6 has a blank below the border").toBe("");

    // Five: the blanks go, together — one and not the other reads as an
    // off-by-one rather than as a decision.
    expect(tagged(at(5)), "5 keeps the tag").toBe(true);
    expect(at(5)[1]?.includes("[ERROR]"), "5 puts the tag directly under the border").toBe(true);

    // Four: one content row.
    expect(tagged(at(4)), "4 keeps the tag").toBe(true);
    expect(at(4)).toHaveLength(4);

    // Three: the tag row goes, and with it the only thing naming the box.
    expect(tagged(at(3)), "3 drops the tag").toBe(false);
    expect(bordered(at(3)), "3 is still bordered").toBe(true);

    // Two and one: no border, and therefore no evidence the height was honoured
    // — which is stated in §3a rather than left to be noticed.
    expect(bordered(at(2)), "2 drops the border").toBe(false);
    expect(bordered(at(1)), "1 drops the border").toBe(false);
    expect(padded(at(1))).toBe(false);
  });

  it("T3.40 (C09 I31): the width ladder's rungs, and the row count moves through none of them", () => {
    // **The row count is the half a width assertion does not reach on its own.**
    // Dropping the padding removes two rows and dropping the border two more, so
    // a ladder that only chose furniture drew four rows against a measured six.
    // Every count in the renderer agreed the whole time.
    const kit = measurable({ capabilities: FULL_CAPS });
    for (const width of [30, 13, 12, 11, 9, 8, 5, 3, 2, 1]) {
      expect(
        kit.renderToLines(status({ height: 6 }), width).length,
        `width ${String(width)} draws six rows`,
      ).toBe(6);
    }

    const tagOf = (w: number): string => {
      const rows = draw({ height: 6 }, w);
      const row = rows.find((r) => r.includes("[ERROR]"));
      if (row === undefined) return "none";
      return row.includes("─") ? "rule" : "bare";
    };

    expect(tagOf(30), "wide enough for a rule").toBe("rule");
    expect(tagOf(13), "13 is the narrowest rule").toBe("rule");
    expect(tagOf(12), "12 loses the rule").toBe("bare");
    expect(tagOf(11), "11 holds a bare tag padded").toBe("bare");
    // Dropping the padding buys two cells, which is what saves the tag here.
    expect(tagOf(9), "9 drops the padding to keep the tag").toBe("bare");
    expect(tagOf(8), "8 cannot hold it at all").toBe("none");
    expect(tagOf(3), "3 is border and one cell").toBe("none");
  });

  it("T3.41 (C09 I31): a dropped tag row becomes content, never a blank", () => {
    // Asserted on a message long enough to need the row, so it is not filled for
    // a second reason.
    const message = "alpha bravo charlie delta echo foxtrot";
    // **The tag row is excluded, and leaving it in is what made this proxy
    // agree with itself.** Counting every non-blank row moved both sides
    // together — the wide box loses a content row and gains the tag, the narrow
    // one the reverse — so the totals matched at 2 and 2 while the thing under
    // test was the difference between them.
    const messageRows = (w: number): number =>
      draw({ height: 6, message }, w)
        .map((r) => r.replace(/[│┌┐└┘─]/gu, "").trim())
        .filter((r) => r !== "" && !r.includes("[ERROR]")).length;

    // **The comparison is the assertion, not the count.** At width 30 the tag
    // row is drawn and at 8 it is not, so the narrow box must carry exactly one
    // more row of text — the row the ladder gave back rather than blanked.
    expect(draw({ height: 6, message }, 8), "still six").toHaveLength(6);
    expect(messageRows(8), "the dropped tag row became content").toBe(messageRows(30) + 1);
  });

  it("T3.42 (C09 I31): retrying keeps its line at two rows and loses it at one", () => {
    // **The dropped line is the assertion, not the kept one.** A countdown
    // without its cause is a number nobody can act on.
    const two = draw({ height: 2, state: "retrying", retryInMs: 8000, attempt: 2 }, 40);
    expect(two.some((r) => r.includes("retrying in 8s")), "two rows hold both").toBe(true);

    const one = draw({ height: 1, state: "retrying", retryInMs: 8000, attempt: 2 }, 40);
    expect(one, "one row").toHaveLength(1);
    expect(one[0]?.includes("retrying"), "and it is not the countdown").toBe(false);
    expect(one[0]?.includes("connection refused"), "it is the cause").toBe(true);
  });
});

describe("C09 §3a — the spinner", () => {
  it("T3.43 (C09 I32): ten ticks give ten frames, in all three states", () => {
    // **`error` included, which is what says the kind animates unconditionally
    // rather than by state.** `retrying` is the error box plus a spinner line,
    // so a rule excluding `error` breaks the state composed out of it.
    for (const state of ["error", "retrying", "loading"] as const) {
      const seen = new Set(
        Array.from({ length: 10 }, (_, tick) =>
          draw({ height: 7, state, retryInMs: 8000, elapsedMs: 4000 }, 46, { tick })
            .join("\n")
            .replace(/[^⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/gu, ""),
        ),
      );
      // **`error` has no activity line and therefore no spinner cell**, so its
      // frames are identical — a consequence of its content rather than a rule
      // (C09 I32). The kind animates; this state has nothing to animate, and
      // that is exactly why the still frame costs no mechanism.
      //
      // Height 7 rather than 6: at 6 the tag row leaves one content row and the
      // message takes it, because the message wins wherever the two compete.
      const expected = state === "error" ? 1 : 10;
      expect(seen.size, `${state} across ten ticks`).toBe(expected);
    }
  });

  it("T3.44 (C09 I32): the default is what `steps` resolves to, and the set owns its interval", () => {
    // Asserted against `spinnerFrames(caps)` rather than against a literal, so a
    // change to the default moves both consumers or fails here.
    const frames = spinnerFrames(FULL_CAPS);
    const first = draw({ height: 6, state: "loading", elapsedMs: 4000 }, 46, { tick: 0 });
    expect(first.some((r) => r.includes(frames[0] ?? " ")), "frame 0 is the set's").toBe(true);

    // A named set uses its own frames.
    const named = draw(
      { height: 6, state: "loading", elapsedMs: 4000, spinner: "boxBounce" },
      46,
      { tick: 0 },
    );
    const box = spinnerFrames(FULL_CAPS, "boxBounce");
    expect(named.some((r) => r.includes(box[0] ?? " ")), "a named set is honoured").toBe(true);

    // An unknown name is the default rather than a throw: a spinner is
    // decoration, and a session that will not start because a set was misspelt
    // is worse than one that spins the wrong way.
    const unknown = draw(
      { height: 6, state: "loading", elapsedMs: 4000, spinner: "no-such-set" },
      46,
      { tick: 0 },
    );
    expect(unknown.some((r) => r.includes(frames[0] ?? " ")), "unknown falls back").toBe(true);
  });

  it("T3.45 (C09 I32): the default is width-stable, and a narrow-only set takes its ASCII pair", () => {
    // **Both routes to the ASCII pair**, because a set reaches it by width or by
    // `unicode: "ascii"` and one assertion cannot tell which fired.
    const wide = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    expect(spinnerFrames(wide), "braille is stable on both conventions").toEqual(
      spinnerFrames(FULL_CAPS),
    );
    expect(spinnerFrames(wide, "boxBounce"), "a narrow-only set falls at wide").toEqual(
      spinnerFrames(ASCII_CAPS, "boxBounce"),
    );
  });
});

describe("C09 §3a — paint and degradation", () => {
  it("T3.46 (C09 I31, C09 §3a): no background at any depth, and one bit keeps two channels", () => {
    for (const colourDepth of [24, 8, 4, 1] as const) {
      const caps = { ...FULL_CAPS, colourDepth };
      const raw = measurable({ capabilities: caps as never })
        .renderToLines(status({ height: 6 }), 46)
        .join("\n");
      // `48;` is the background introducer, and `resolveBackground` admits one
      // only from a `surface.*` ref — of which there is no error slot (C10 I21).
      expect(raw.includes("48;"), `depth ${String(colourDepth)} paints no background`).toBe(false);
    }

    // At one bit the tone is `{ bold: true }` and carries no colour at all, so
    // the mark is the second channel rather than `inverse` — which C10 answered
    // differently and which is written nowhere in the tree.
    const mono = measurable({ capabilities: { ...FULL_CAPS, colourDepth: 1 } as never })
      .renderToLines(status({ height: 6 }), 46)
      .map(plain);
    expect(mono.some((r) => r.includes("▲")), "the mark survives one bit").toBe(true);
    expect(mono.some((r) => r.includes("[ERROR]")), "and so do the brackets").toBe(true);
  });

  it("T3.47 (C09 I31, C09 §3a): the ascii arm draws + - | and !, and no box drawing anywhere", () => {
    // **Over the whole frame rather than over the corners**, because a border is
    // four glyphs and a mistake is usually one of them.
    const rows = measurable({ capabilities: ASCII_CAPS })
      .renderToLines(status({ height: 6, message: "boom" }), 30)
      .map(plain);
    const all = rows.join("\n");
    expect(all.includes("+"), "corners").toBe(true);
    expect(all.includes("!"), "the mark").toBe(true);
    expect(/[┌┐└┘─│▲]/u.test(all), "no box drawing and no unicode mark").toBe(false);
  });
});

describe("C09 §3a — the kind's shape", () => {
  it("T3.48 (C09 I31): `status` declares no window and stays whole through a sequence", () => {
    // `plot`'s and `scroll`'s case, and the same assertion: a bounded box has
    // its border at both ends and cannot measure less without becoming a
    // different box.
    const kit = measurable({ capabilities: FULL_CAPS });
    const windowed = kit.registry.windowSequence([status({ height: 6 })], 46, 2, 5);
    expect(windowed.blocks, "one block, unchanged").toHaveLength(1);
    expect(windowed.skipRows, "and the slack is paid out of skipRows").toBe(2);
  });
});
