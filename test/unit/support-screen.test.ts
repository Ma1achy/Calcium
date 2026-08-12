// The screen model, verified before anything is read through it.
//
// `test/support/README.md`'s rule: a fixture must be shown to respond to the
// thing under test before it is asserted against. This one stands between every
// frame assertion and the bytes, so a model that quietly returned blanks would
// turn six failing rows green and say nothing.
//
// The rows here are the two forms `composeFrame` writes (C22 §6b, I55) — a whole
// frame from HOME, and a difference addressed with CUP — plus the property that
// makes the whole exercise worth anything: **both must produce the same screen.**
import { describe, expect, it } from "vitest";

import { screenFrom } from "../support/screen.js";
import { CURSOR_HOME, SGR_RESET, cursorTo } from "../../src/terminal/escapes.js";

const SIZE = { columns: 10, rows: 4 };
const pad = (s: string): string => s.padEnd(SIZE.columns, " ");

describe("the screen model", () => {
  it("folds a whole-frame write from HOME", () => {
    const rows = ["alpha", "bravo", "charlie", "delta"].map(pad);
    const screen = screenFrom([`${CURSOR_HOME}${rows.join("\r\n")}`], SIZE);
    expect(screen.text).toEqual(["alpha", "bravo", "charlie", "delta"]);
  });

  it("folds a CUP-addressed difference onto what is already there", () => {
    const rows = ["alpha", "bravo", "charlie", "delta"].map(pad);
    const screen = screenFrom(
      [
        `${CURSOR_HOME}${rows.join("\r\n")}`,
        // Row 2 (0-based 1) replaced, and nothing else touched.
        `${cursorTo(1, 0)}${SGR_RESET}${pad("BRAVO!")}`,
      ],
      SIZE,
    );
    expect(screen.text).toEqual(["alpha", "BRAVO!", "charlie", "delta"]);
  });

  it("gives the same screen for a whole frame and for a difference reaching it", () => {
    // **The property the whole of stage 1 rests on.** If these two ever differ,
    // a diffed session and a repainted one are showing different things, and no
    // assertion about either alone can see it.
    const first = ["alpha", "bravo", "charlie", "delta"].map(pad);
    const second = ["alpha", "BRAVO!", "charlie", "DELTA?"].map(pad);

    const whole = screenFrom([`${CURSOR_HOME}${second.join("\r\n")}`], SIZE);
    const diffed = screenFrom(
      [
        `${CURSOR_HOME}${first.join("\r\n")}`,
        `${cursorTo(1, 0)}${SGR_RESET}${second[1] ?? ""}${cursorTo(3, 0)}${SGR_RESET}${second[3] ?? ""}`,
      ],
      SIZE,
    );
    expect(diffed.rows).toEqual(whole.rows);
  });

  it("responds to the thing under test — a wrong row is a wrong screen", () => {
    // The control. A model that ignored its input would pass every row above.
    const rows = ["alpha", "bravo", "charlie", "delta"].map(pad);
    const screen = screenFrom(
      [`${CURSOR_HOME}${rows.join("\r\n")}`, `${cursorTo(1, 0)}${pad("WRONG")}`],
      SIZE,
    );
    expect(screen.text[1]).toBe("WRONG");
    expect(screen.text[1]).not.toBe("bravo");
  });

  it("strips SGR and modes without consuming the text around them", () => {
    const screen = screenFrom(
      [`${CURSOR_HOME}\u001b[?25l\u001b[38;5;1mred\u001b[39m${" ".repeat(7)}`],
      SIZE,
    );
    expect(screen.text[0]).toBe("red");
  });

  it("starts blank, and a short write leaves the rest of the screen blank", () => {
    const screen = screenFrom([`${CURSOR_HOME}${pad("only")}`], SIZE);
    expect(screen.text).toEqual(["only", "", "", ""]);
  });
});
