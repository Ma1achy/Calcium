// C22 §6l.12 — where a chip previews (§101, `R-BLK-823`, `R-BLK-824`).
//
// **A projection, not a mode.** §101 puts a chip's preview in two places and
// names focus as what chooses; the registry names no binding that opens one, so
// the panel is recomputed from the caret exactly as the transcript's peek is
// recomputed from focus. These rows drive the real input path — a bracketed
// paste through stdin — because the projection lives between the router and the
// frame, and a test calling the mechanism directly would miss the wiring.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

/** Written as a code point rather than a literal, so no control byte is in the file. */
const ESC = String.fromCharCode(27);

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r));
};

/** Above `CHIP_LINES`, so the paste becomes a chip rather than text. */
const pasteOf = (n: number, word: string): string =>
  Array.from({ length: n }, (_, i) => `${word} ${String(i)}`).join("\n");

type Session = Readonly<{
  rows: () => Promise<readonly string[]>;
  send: (bytes: string) => void;
  paste: (text: string) => void;
}>;

const session = async (): Promise<Session> => {
  const stdin = fakeStdin();
  const { screen } = await buildSession({ stdin: stdin as never } as never);
  await settle();
  const send = (bytes: string): void => {
    stdin.emit(bytes);
  };
  return {
    send,
    paste: (text) => send(`${ESC}[200~${text}${ESC}[201~`),
    rows: async () => {
      await settle();
      return screen().rows;
    },
  };
};

/**
 * Whether any row holds the text, once the screen has folded the SGR away.
 *
 * **Asked about the chip's *content*, never about its label**, and the first
 * draft asked about the label. The prompt draws the label inline — that is what
 * §6l.11 paints — so `#1 pasted` is on the screen whether a panel exists or
 * not, and every negative arm read as a preview that would not go away. The
 * content is in the panel and nowhere else, which makes it the one string that
 * distinguishes the two.
 */
const shows = (rows: readonly string[], text: string): boolean =>
  rows.some((r) => r.includes(text));

/**
 * How many rows hold the text.
 *
 * **The label needs a count and not a presence**, which is the same conflation
 * read from the third side: the prompt draws the chip's label inline, so *the
 * panel is titled with it* is satisfied by the prompt's row alone — a mutation
 * putting a literal in the title survived exactly that. Two rows carry it when
 * the panel is titled properly, and one when it is not.
 */
const count = (rows: readonly string[], text: string): number =>
  rows.filter((r) => r.includes(text)).length;

describe("C22 §6l.12 — a chip previews above the prompt", () => {
  it("T1.69 (C22 I113, §6l.12, §101): the panel follows the caret, and there is none without a chip", async () => {
    const s = await session();

    // **The control first.** A paste below the chip threshold is text, so the
    // caret is on no chip and nothing is pushed — without this row, *a panel is
    // present* is satisfied by a projection that pushes one for every buffer.
    //
    // **Asked about the label here and about the content everywhere else**,
    // which is the same conflation read from the other side: a text paste puts
    // its own words in the prompt, so `short 0` is on the screen either way,
    // and what cannot be there without a chip is a chip's label.
    s.paste(pasteOf(2, "short"));
    const plain = await s.rows();
    expect(shows(plain, "#1 pasted"), "two lines are text, not a chip").toBe(false);

    // A chip, and the caret is left past it by `insertChip` — so this is the
    // backwards arm, which is the one a reader arrives at by pasting.
    s.paste(pasteOf(6, "alpha"));
    const one = await s.rows();
    expect(shows(one, "alpha 0"), "the chip's content is the panel's body").toBe(true);
    expect(count(one, "#1 pasted"), "the prompt's chip and the panel's title").toBe(2);

    // **Typing moves the caret off it and the panel goes**, which is what makes
    // this a projection rather than a layer that was opened. Asserted as the
    // label's absence, since the body could be scrolled out of a panel that is
    // still there.
    s.send("xy");
    expect(shows(await s.rows(), "alpha 0"), "the caret has left the chip").toBe(false);

    // **A second chip, and the caret moves between them** — §101's `←→ other
    // chips` with no binding behind it. Walking left off the second chip's own
    // cell and the two characters typed puts the caret past the first again.
    s.paste(pasteOf(9, "beta"));
    expect(shows(await s.rows(), "beta 0"), "the second chip previews").toBe(true);
    s.send(`${ESC}[D${ESC}[D${ESC}[D`);
    const back = await s.rows();
    expect(shows(back, "alpha 0"), "the caret walked back to the first").toBe(true);
    expect(shows(back, "beta 0"), "and only one chip previews at a time").toBe(false);
  });

  it("T1.70 (C22 I113, §6l.12, C15 §2c): nothing is pushed while another layer holds the region", async () => {
    // **A reverse search, because it opens on one byte and holds the region.**
    // The first draft typed `/` to open a completion menu and opened nothing —
    // the harness's manifest carries no tools, so there were no candidates —
    // and the arm passed because typing the character had moved the caret off
    // the chip. A layer that does not exist and a guard that works read the
    // same from the frame, which is the vacuity the control below answers.
    const CTRL_R = String.fromCharCode(18);

    // The dismissal arm: a preview is up, and something the reader is in the
    // middle of takes the region.
    const a = await session();
    a.paste(pasteOf(6, "gamma"));
    expect(shows(await a.rows(), "gamma 0"), "the preview is up").toBe(true);
    a.send(CTRL_R);
    const searching = await a.rows();
    expect(shows(searching, "reverse-i-search"), "the search took the region").toBe(true);
    expect(shows(searching, "gamma 0"), "and the preview gave way whole").toBe(false);

    // **The push arm, and it is the half a dismissal cannot cover.** C15's
    // manager dismisses a panel when another opens, so the arm above is
    // satisfied by a projection with no guard at all — it would be dismissed
    // by the search and push itself straight back on the next key. Here the
    // layer is up *first* and the chip arrives under it.
    const b = await session();
    b.send(CTRL_R);
    b.paste(pasteOf(6, "delta"));
    const under = await b.rows();
    expect(shows(under, "reverse-i-search"), "the search still holds it").toBe(true);
    expect(shows(under, "delta 0"), "nothing is pushed beneath it").toBe(false);
  });
});
