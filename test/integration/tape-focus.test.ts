// C26 I31 through a built session — the window follows focus, and a press
// reaches the member drawn under it (review batch 4, M14.1, M14.2; ruling 80).
//
// **Read off the screen**, because the frame is where the three readers of the
// anchor meet: the render draws the window, the pull persists it and the
// pointer is told where each member is. A screen has no attributes here, so
// where focus is gets read the way the reader would — `→` from it, and which
// member the window then has to show.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const ESC = "\u001b";
const DOWN = `${ESC}[B`;
const RIGHT = `${ESC}[C`;
const LEFT = `${ESC}[D`;
const press = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}M`;
const release = (col: number, row: number): string => `${ESC}[<0;${String(col)};${String(row)}m`;

const NAMES = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL"];

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "strip", local: true, summary: "a tape of eight and a row below it", args: [], flags: [] }],
};

/** The tape's `current`, which `drive` sets before the session starts. */
let currentNow = "BRAVO";

const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  strip: (() => ({
    schema: "tui.view/1",
    command: "strip",
    status: "ok",
    blocks: [
      { kind: "tape", id: "strip", members: NAMES.map((n) => ({ id: n, label: `${n}-stage`, state: "succeeded" })), current: currentNow },
      { kind: "pills", id: "below", chips: [{ label: "below" }] },
    ],
  })) as never,
};

const drive = async (current = "BRAVO") => {
  currentNow = current;
  const stdin = fakeStdin();
  const session = await buildSession(
    { manifest: MANIFEST, localHandlers: handlers, stdin: stdin as unknown as NodeJS.ReadStream },
    { columns: 60, rows: 20 },
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };
  /** The tape's row and its index on the screen — the row holding `»` or `«`. */
  const tape = (): Readonly<{ row: string; at: number }> => {
    const rows = session.screen().rows;
    const at = rows.findIndex((r) => NAMES.filter((n) => r.includes(n)).length >= 2);
    return { row: rows[at] ?? "", at };
  };
  const drawn = (): readonly string[] => NAMES.filter((n) => tape().row.includes(n));
  return { type, tape, drawn, stop: () => session.tui.stop("exit") };
};

describe("C26 I31 — a tape under the keys and the pointer", () => {
  it("C26 T4.34 (I31): → past the window slides it, ↓ out brings the current back, and a press focuses the member under it", async () => {
    const { type, tape, drawn, stop } = await drive();
    await type("/strip\r");
    expect(tape().row, "the current is drawn, with its lead").toContain("› BRAVO");
    expect(drawn(), "and the tape does not fit").not.toContain("HOTEL");

    await type(DOWN); // the card's head (C09 I47)
    await type(DOWN); // the tape's first member
    for (let i = 1; i < NAMES.length; i += 1) await type(RIGHT);
    // **The window followed focus to the last member** (ruling 80), and the
    // current's lead went off with the window's head.
    expect(drawn(), "the focused member is on screen").toContain("HOTEL");
    expect(tape().row, "and the current is not").not.toContain("› BRAVO");
    expect(tape().row, "the residue says so").toContain("«");
    // **The window moves only when the focused member leaves it** (C04 I125,
    // C26 I25): one `←` from the tail keeps the tail drawn. A start persisted
    // at `current`'s anchor instead is re-slid from the head every frame, and
    // `←` then puts GOLF at the right edge with HOTEL gone.
    await type(LEFT);
    expect(drawn(), "one step back leaves the window where it was").toContain("HOTEL");
    await type(RIGHT);

    // **Leaving the tape gives the window back to `current`** — by the
    // minimum from where it stood, so the current is drawn again.
    await type(DOWN);
    expect(tape().row, "the current is back").toContain("› BRAVO");
    expect(drawn(), "and the tail is off again").not.toContain("HOTEL");

    // **A press on a drawn member focuses that member** (M14.2). The last
    // drawn one is the discriminator: `→` from it must slide the window to
    // the next, where a press that focused member 0 would step inside the head.
    const last = drawn().at(-1) ?? "";
    const next = NAMES[NAMES.indexOf(last) + 1] ?? "";
    expect(next, "a member lies past the window").not.toBe("");
    const { row, at } = tape();
    const col = row.indexOf(last) + 1;
    await type(press(col + 1, at + 1));
    await type(release(col + 1, at + 1));
    await type(RIGHT);
    expect(drawn(), `→ from ${last} slides to ${next}`).toContain(next);

    // **A press on the residue mark is nobody's.** Focus stays on `next`, so
    // `→` reaches the one after it; a press that fell to member 0 would pull
    // the window back to the head.
    const after = NAMES[NAMES.indexOf(next) + 1] ?? "";
    const marked = tape();
    expect(marked.row, "the window has slid, so `«` is drawn").toContain("«");
    await type(press(marked.row.indexOf("«") + 1, marked.at + 1));
    await type(release(marked.row.indexOf("«") + 1, marked.at + 1));
    await type(RIGHT);
    expect(drawn(), `focus stayed on ${next}, so → reached ${after}`).toContain(after);
    expect(drawn(), "and the head was not pulled back").not.toContain("ALPHA");

    // **A press on a member while focus is in the tape** — the window slid off
    // the current, so the columns must be the focused anchor's. The first drawn
    // member is pressed, then `←`: the window slides by one to the member before
    // it, and the pressed one stays drawn. Columns taken at `current`'s anchor
    // place a different member under that cell.
    const slid = tape();
    const head = drawn()[0] ?? "";
    const before = NAMES[NAMES.indexOf(head) - 1] ?? "";
    expect(before, "a member lies before the window").not.toBe("");
    await type(press(slid.row.indexOf(head) + 2, slid.at + 1));
    await type(release(slid.row.indexOf(head) + 2, slid.at + 1));
    await type(LEFT);
    // **By exactly one**: the window now starts at `before`. Columns at
    // `current`'s anchor land the press a member or two earlier, and `←` from
    // there slides further — the same two members drawn, a different start.
    expect(drawn()[0], `← from ${head} brings ${before} in, and no further`).toBe(before);
    expect(drawn(), `and ${head} is still drawn`).toContain(head);
    await stop();
  });

  it("C26 T4.38 (I30, I31, I24, §8c.6, F1448): ↑ back into a tape the window has slid enters on a member it shows", async () => {
    const { type, tape, drawn, stop } = await drive();
    await type("/strip\r");
    await type(DOWN); // the card's head (C09 I47)
    await type(DOWN); // the tape's first member
    for (let i = 1; i < NAMES.length; i += 1) await type(RIGHT);
    await type(DOWN); // out, onto the row below
    // **The fixture responds**: the window came back to the current by the
    // minimum, so the head is off screen and member 0 is not a member it shows.
    const before = drawn();
    expect(tape().row, "the current is drawn").toContain("› BRAVO");
    expect(before, "and member 0 is not").not.toContain("ALPHA");

    await type(`${ESC}[A`); // ↑ back in
    // **Entering moves no window** (C26 I24): focus is on a member the window
    // shows. On member 0 the window followed focus back to the head.
    expect(drawn(), "the same members are drawn").toEqual(before);
    expect(tape().row, "and the current's lead with them").toContain("› BRAVO");
    // **Which member focus is on**, read the way a reader would: `←` from the
    // first drawn member brings the one before it in. From any later member it
    // would step inside the window and ALPHA would stay off.
    await type(LEFT);
    expect(drawn(), "focus was on the first drawn member").toContain("ALPHA");
    await stop();
  });

  it("C26 T4.39 (I30, §8c.6, F1448): ↓ from a card's head into a tape slid off its head enters on the first drawn member", async () => {
    const { type, tape, drawn, stop } = await drive("GOLF");
    await type("/strip\r");
    const before = drawn();
    expect(tape().row, "the current is drawn").toContain("› GOLF");
    expect(before, "and the tape's head is not").not.toContain("ALPHA");
    await type(DOWN); // the card's head, which spans the row
    await type(DOWN); // into the tape, from column 0
    expect(drawn(), "the window did not move").toEqual(before);
    await type(LEFT);
    const first = NAMES.indexOf(before[0] ?? "");
    expect(drawn(), "and focus is on the first drawn member").toContain(NAMES[first - 1]);
    await stop();
  });
});
