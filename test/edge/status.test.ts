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
import { MESSAGE_LINE_CAP, statusRowsFor } from "../../src/presentation/blocks/kinds/status.js";

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
    const tagged = (rows: readonly string[]): boolean => rows.some((r) => r.includes(" ERROR "));
    const padded = (rows: readonly string[]): boolean => rows[1]?.trim() === "││".slice(0, 0);

    const at = (h: number): readonly string[] => draw({ height: h }, 50);

    // Six: the full figure — border, blank, tag, content, blank, border.
    expect(bordered(at(6)), "6 is bordered").toBe(true);
    expect(tagged(at(6)), "6 is tagged").toBe(true);
    expect(at(6)[1]?.replace(/[│]/gu, "").trim(), "6 has a blank below the border").toBe("");

    // Five: the blanks go, together — one and not the other reads as an
    // off-by-one rather than as a decision.
    expect(tagged(at(5)), "5 keeps the tag").toBe(true);
    expect(at(5)[1]?.includes(" ERROR "), "5 puts the tag directly under the border").toBe(true);

    // Four: one content row, and **no gutter** — the horizontal padding is the
    // only thing the six-row rung still decides once the group is centred, so it
    // is what this rung has to be asserted on. Without it the boundary between
    // 6 and 5 constrains nothing.
    expect(tagged(at(4)), "4 keeps the tag").toBe(true);
    expect(at(4)).toHaveLength(4);
    expect(at(4)[1]?.startsWith("│─"), "4 has no gutter").toBe(true);
    expect(at(6)[2]?.startsWith("│ ─"), "6 has one").toBe(true);

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
      const row = rows.find((r) => r.includes(" ERROR "));
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
        .filter((r) => r !== "" && !r.includes(" ERROR ")).length;

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
    expect(first.some((r) => r.includes(frames[0] ?? "\u0000")), "frame 0 is the set's").toBe(true);

    // A named set uses its own frames.
    const named = draw(
      { height: 6, state: "loading", elapsedMs: 4000, spinner: "boxBounce" },
      46,
      { tick: 0 },
    );
    const box = spinnerFrames(FULL_CAPS, "boxBounce");
    expect(named.some((r) => r.includes(box[0] ?? "\u0000")), "a named set is honoured").toBe(true);

    // An unknown name is the default rather than a throw: a spinner is
    // decoration, and a session that will not start because a set was misspelt
    // is worse than one that spins the wrong way.
    const unknown = draw(
      { height: 6, state: "loading", elapsedMs: 4000, spinner: "no-such-set" },
      46,
      { tick: 0 },
    );
    expect(unknown.some((r) => r.includes(frames[0] ?? "\u0000")), "unknown falls back").toBe(true);
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
  it("T3.46 (C09 I31, C09 §3a): one painted run, and the pair degrades together", () => {
    // **The tag is the only painted thing in the figure** — the word and its two
    // spaces, white on red. The rule, the mark, the message, the border and the
    // blanks carry the error tone as foreground and no ground at all.
    const raw = (depth: 24 | 8 | 4 | 1): string =>
      measurable({ capabilities: { ...FULL_CAPS, colourDepth: depth } as never })
        .renderToLines(status({ height: 6 }), 46)
        .join("\n");

    // Exactly one background introducer in the whole frame, at the depths that
    // have one. More than one would mean something else got painted.
    for (const depth of [24, 8] as const) {
      const grounds = [...raw(depth).matchAll(/\u001b\[48;/gu)];
      expect(grounds.length, `depth ${String(depth)} paints exactly one run`).toBe(1);
    }

    // **Below 8-bit the pair degrades together**, which is the half a
    // ground-only assertion would miss: an ink left behind on a ground that
    // vanished is a foreground nothing measured, and C10 I21's rule read from
    // the other direction. At 4 and 1 the tag carries no styling at all and is
    // distinguishable by being the one run that does not — non-bold between two
    // bold rules at one bit.
    for (const depth of [4, 1] as const) {
      expect(raw(depth).includes("\u001b[48;"), `depth ${String(depth)} paints no ground`).toBe(
        false,
      );
      expect(
        raw(depth).includes("255;255;255"),
        `depth ${String(depth)} leaves no ink behind either`,
      ).toBe(false);
    }

    // At one bit the tone is `{ bold: true }` and carries no colour, so the mark
    // and the word are what tell the states apart.
    const mono = measurable({ capabilities: { ...FULL_CAPS, colourDepth: 1 } as never })
      .renderToLines(status({ height: 6 }), 46)
      .map(plain);
    expect(mono.some((r) => r.includes("▲")), "the mark survives one bit").toBe(true);
    expect(mono.some((r) => r.includes(" ERROR ")), "and the word in its gap").toBe(true);
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

describe("C09 I31 — the one-row rung, and the state it was not reasoned about", () => {
  // **The ladder's last rung reads *at one row the message wins*, and that
  // sentence is about `error` and `retrying`** — the message is the failure and
  // the countdown is secondary, so a number without its cause is unactionable.
  // `loading` has no cause. Its message is a label the panel above already
  // carries, and the whole of what a waiting box says is that it is still
  // waiting (F235).
  //
  // **Wired up at two rows it drew `loading` over `⠋ loading`** — the word
  // twice, `measure` saying 2 and `render` drawing 2, and no assertion about
  // heights, wrapping or precedence able to fail. Only the frame showed it.
  const at = (state: "loading" | "retrying", height: number, message: string): readonly string[] =>
    draw(
      { state, message, height, ...(state === "retrying" ? { retryInMs: 8000 } : { elapsedMs: 4000 }) },
      30,
      { tick: 3 },
    );

  it("T3.42a (C09 I31, F235): `loading` at one row is the activity line, not the message", () => {
    const rows = at("loading", 1, "SENTINEL");
    // **The count is asserted beside the contents, because the defect had the
    // right count.** A row assertion alone passes on the frame this stands
    // against, and a contents assertion alone would pass on a two-row box.
    expect(rows).toHaveLength(1);
    expect((rows[0] ?? ""), "the line that moves is what a waiting box says").toContain(
      "loading (4s)",
    );
    expect(
      (rows[0] ?? ""),
      "and the message is dropped — asserted on a sentinel the row would show if it were kept",
    ).not.toContain("SENTINEL");
  });

  it("T3.42b (C09 I31): `retrying` at one row keeps the message, which is the half that was right", () => {
    const rows = at("retrying", 1, "connection refused");
    expect(rows).toHaveLength(1);
    expect((rows[0] ?? "")).toContain("connection refused");
    // The dropped line is the assertion, not the kept one (T3.42's rule).
    expect((rows[0] ?? "")).not.toContain("retrying in");
  });

  it("T3.42c (C09 I31, F235): the message loses by rule and not by truncation", () => {
    // **The rung's own note records this defect being fixed once already**: with
    // the activity line unconditional the row count still came out right,
    // because the final `slice(0, height)` cut it — so the message won by
    // truncation and a mutation removing the precedence changed nothing. The
    // floor here is zero rather than one for the same reason, in the other
    // direction: a floor of one puts the message back and lets the clamp decide.
    //
    // A message long enough to wrap several times, so a clamp and a rule give
    // the same row count and only the contents part company.
    const rows = at("loading", 1, "a message long enough to wrap over several rows at this width");
    expect(rows).toHaveLength(1);
    expect((rows[0] ?? "")).toContain("loading (4s)");
    expect((rows[0] ?? ""), "no fragment of the message survives").not.toContain("a message");
  });
});


describe("C09 I34 — the height fits the message and the width does not", () => {
  // **Read from the frame, because every count agrees either way.** A request
  // that under-wraps — at `width` rather than `width - 4` — produces a plausible
  // number, `measure` and `render` still agree on it, and the only thing that
  // says otherwise is the last line of the message being absent. That is the
  // class this component keeps producing (F235, and the width ladder before it).
  const CAP = MESSAGE_LINE_CAP;
  const errStatus = (message: string, height: number): never =>
    block({ kind: "status", id: "s", state: "error", message, height } as never) as never;

  const framed = (message: string, w: number, caps = FULL_CAPS): readonly string[] => {
    const rows = statusRowsFor(errStatus(message, 1), w, caps);
    return measurable({ capabilities: caps }).renderToLines(errStatus(message, rows), w).map(plain);
  };

  it("T3.60 (C09 I34): the box grows to hold the message, and the tag survives", () => {
    // 40 columns is where it binds: a typical message is three lines there and
    // one at 120, so the width that needs the growth most is the one with least
    // room (F238).
    const msg = "plot failed to render: Cannot read properties of undefined (reading 'series')";
    const narrow = framed(msg, 40);
    const wide = framed(msg, 80);

    // **The whole message, at both widths** — the assertion the old constant
    // failed: at three rows this ended at "Cannot read" with nothing to say so.
    //
    // On the **last token** rather than a phrase, because a phrase spans a wrap
    // boundary and a border sits between its halves — the first draft asserted
    // `(reading 'series')` and failed on a frame that showed every character of
    // it, which is a fixture wrong about the thing it was watching.
    expect(narrow.join(" "), "the tail of the message reached the frame").toContain("'series')");
    expect(wide.join(" ")).toContain("'series')");
    // And the figure it grew into, not merely more rows.
    expect(narrow.some((r) => r.includes("ERROR")), "the tag is affordable now").toBe(true);
    expect(narrow[0]).toContain("┌");
    expect(narrow.at(-1)).toContain("└");
    // Narrower wraps to more lines, so it is taller. The direction is the rule.
    expect(narrow.length).toBeGreaterThan(wide.length);

    // **Thirty columns, and the width is the assertion.** A fitter that wrapped
    // at `width` rather than the top rung's `width - 4` is self-consistent
    // almost everywhere: below six rows the rung has no gutter, so `width - 2`
    // *is* the content width and the two agree. It parts company only where the
    // under-estimate still lands in the padded rung — here it asks for six,
    // the real wrap at 26 cells is four lines, three fit, and the fourth is cut.
    // **Every count agrees and the frame does not**, which is why this row reads
    // the text rather than the number (F235's class, and the width ladder's).
    const thirty = framed(msg, 30);
    expect(thirty.join(" "), "the last line survives at the width that discriminates").toContain(
      "'series')",
    );
    expect(thirty.join(""), "and nothing was cut, so nothing claims to be").not.toContain("…");
  });

  it("T3.61 (C09 I34, C09 I1): `statusRowsFor` and `render` agree at the granted height", () => {
    // **I1's pair asserted directly.** The request is a promise about what
    // `render` will draw; if the two disagree the shell floors a block to a
    // height the box does not fill, and the trim below deletes whatever follows.
    const r = measurable({ capabilities: FULL_CAPS });
    for (const w of [12, 20, 40, 80, 120]) {
      for (const msg of ["ENOENT", "a message that needs a second line at eighty columns and several at twelve", "x\ny\nz\nq\nw"]) {
        const asked = statusRowsFor(errStatus(msg, 1), w, FULL_CAPS);
        const drawn = r.renderToLines(errStatus(msg, asked), w).length;
        expect(drawn, `w=${w} asked ${asked} for ${JSON.stringify(msg.slice(0, 24))}`).toBe(asked);
      }
    }
  });

  it("T3.62 (C09 I34, C09 I22): a cut carries its mark, and it is capability-resolved", () => {
    const long = Array.from({ length: CAP + 4 }, (_u, i) => `line number ${String(i)}`).join("\n");
    const uni = framed(long, 40).join("");
    const asc = framed(long, 40, ASCII_CAPS).join("");
    expect(uni, "the unicode marker").toContain("…");
    expect(asc, "and the ascii one, because the mark is drawn by the framework").toContain("~");
    expect(asc, "which cannot be the codepoint").not.toContain("…");
  });

  it("T3.63 (C09 I34): a message of exactly the cap carries no mark", () => {
    // **The off-by-one that is worse than the silent cut it replaces.** A mark on
    // a complete message claims a truncation that did not happen and sends the
    // reader to the sink for text already on screen — confidently wrong rather
    // than quietly incomplete.
    //
    // Newlines survive the wrap, so the fixture is exact rather than tuned: `CAP`
    // lines wrap to `CAP` rows at any width that holds one of them.
    //
    // **Each line nearly fills the row, and the first fixture did not.** With
    // short lines the overflow *joins* into the last kept row and fits — so
    // nothing is lost and correctly nothing is marked, and the row asserting a
    // mark failed for the right reason. A fixture has to be shown to respond to
    // the thing it watches.
    const wide = (i: number): string => `line ${String(i)} ${"x".repeat(24)}`;
    const exact = Array.from({ length: CAP }, (_u, i) => wide(i)).join("\n");
    const drawn = framed(exact, 40);
    expect(drawn.join(" "), "every line is there").toContain(`line ${String(CAP - 1)}`);
    expect(drawn.join(""), "and nothing claims otherwise").not.toContain("…");

    // The neighbour on the other side, so the row is a boundary and not a point.
    const over = `${exact}\n${wide(CAP)}`;
    expect(framed(over, 40).join(""), "one more line and the mark appears").toContain("…");
  });

  it("T3.64 (C09 I34): the request follows the width ladder rather than assuming a tag", () => {
    // At a width that cannot hold ` ERROR ` and a rule, `widthRung` drops the tag
    // — so the sum must drop it too, or the box asks for a row it will not draw.
    const msg = "ENOENT";
    expect(statusRowsFor(errStatus(msg, 1), 40, FULL_CAPS), "border, tag, one message row").toBe(4);

    // **The property is that the tag is not *counted*, not that the box is
    // shorter.** The first draft asserted the height shrinks and it grows: at
    // eight columns the content is four cells wide, so `ENOENT` wraps to two
    // rows and the wrap costs more than the dropped tag saves. A number moving
    // the way you expected is not evidence about the rule you meant.
    const narrow = statusRowsFor(errStatus(msg, 1), 8, FULL_CAPS);
    const drawn = framed(msg, 8);
    expect(drawn, "and the frame is the height that was asked for").toHaveLength(narrow);
    expect(drawn.some((r) => r.includes("ERROR")), "no tag at this width").toBe(false);

    // **The number, and three other assertions were tried first.** A row count
    // cannot see this: `measure` and `render` still agree, because the box takes
    // the uncounted row as a blank. Nor can the blank count — at eight columns
    // the extra row turns the padding on, which narrows the content to four
    // cells and the wrap grows to eat it. Nor can a fit boundary, because two
    // rows below the granted height removes the *border*, which is furniture
    // rather than slack, and the message still shows.
    //
    // So the assertion is the figure, recorded:
    //
    //     ┌──────┐        the tag is unaffordable at eight columns, so it is
    //     │▲     │        not counted, and the content is six cells wide
    //     │ENOENT│
    //     │      │
    //     └──────┘        five rows
    //
    // Counting it gives six, which turns the gutter on, narrows the content to
    // four, and splits `ENOENT` across two rows to pay for a tag that is never
    // drawn.
    expect(statusRowsFor(errStatus(msg, 1), 8, FULL_CAPS), "border and two wrapped rows").toBe(5);

    // And the half that is a property rather than a figure: the granted height
    // shows the whole message at every width.
    const r = measurable({ capabilities: FULL_CAPS });
    for (const w of [8, 12, 20, 40, 80]) {
      const asked = statusRowsFor(errStatus(msg, 1), w, FULL_CAPS);
      expect(
        r.renderToLines(errStatus(msg, asked), w).map(plain).join(""),
        `w=${w}: the granted height shows it all`,
      ).not.toContain("…");
    }
  });
});
