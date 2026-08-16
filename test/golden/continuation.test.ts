// The continuation mark, in a frame — because its whole subject is a *column*.
//
// **This file exists because golden was unchanged when the mark landed**, and a
// green golden run reads as coverage. No frame in the suite carried one of these
// notices, so the mark's placement was asserted by nothing: it sat flush left in
// the prompt's own gutter, reading as the prompt's sibling rather than its
// child, and every row in `test/contract/continuation.test.ts` passed. A glyph
// that says *this line belongs to the one above it* is a claim about two rows,
// and no assertion about one block can see it.
//
// So the unit under test here is the **entry** — the command chrome C22 draws
// plus the document's blocks — rather than a block, which is the only framing in
// which the mark's column means anything. The `warn` row is beside it on
// purpose: it is the notice that shares every other property and takes no mark,
// so the two gutters differing is visible rather than described.
import { describe, expect, it } from "vitest";

import { ASCII_CAPS, DARK_THEME, FULL_CAPS, measurable } from "../support/render.js";
import { PROMPT_GUTTER } from "../../src/shell/config.js";
import { commandRows } from "../../src/shell/paint.js";
import { noticeDoc } from "../../src/shell/documents.js";

const WIDTHS = [40, 56] as const;

const VARIANTS = [
  { name: "unicode", capabilities: FULL_CAPS },
  { name: "ascii", capabilities: ASCII_CAPS },
] as const;

/** The four states an entry reports about itself, plus the one that cannot. */
const CASES = [
  ["queued", "muted", "queued behind /logs"],
  ["stalled", "muted", "no output for 2m"],
  ["wrapped", "muted", "a queued line long enough to wrap, so the hanging gutter is visible under the mark"],
  ["cancelled", "warn", "cancelled before it ran"],
] as const;

describe("the continuation mark, in an entry", () => {
  for (const variant of VARIANTS) {
    for (const width of WIDTHS) {
      it(`${variant.name} at ${width}`, () => {
        const kit = measurable({ theme: DARK_THEME, capabilities: variant.capabilities });
        const frame = CASES.map(([name, tone, text]) => {
          const doc = noticeDoc("/ps --all", text, tone, { origin: "user" });
          const chrome = commandRows(doc.command, width, variant.capabilities);
          const body = doc.blocks.flatMap((b) => kit.renderToLines(b, width));
          // Stripped of SGR: this file is about columns, and C10's golden
          // frames already own colour. A snapshot carrying both changes when
          // either does, and then neither is protected.
          return [`── ${name}`, ...chrome, ...body]
            .map((l) => l.replace(/\[[0-9;]*m/gu, ""))
            .join("\n");
        }).join("\n");

        expect(frame).toMatchSnapshot();
      });
    }
  }

  it("T2.99 (C09 §4): the mark lands under the command's first character, and the constant lives two layers away", () => {
    // **The coupling, asserted rather than described.** The indent is a literal
    // in `presentation/blocks/kinds/simple.ts` because `PROMPT_GUTTER` is L4 and
    // that file is L1 — a number written in one place and satisfied in another,
    // which is precisely the deferral shape this project keeps finding after the
    // fact. A test is the thing that can hold both halves.
    //
    // Asserted over the *rendered rows*, not over the two constants: what has
    // to be true is that the mark occupies the column the command's text starts
    // in, and comparing two numbers would still pass if the renderer stopped
    // consulting either of them.
    const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS });
    const doc = noticeDoc("/ps --all", "queued behind /logs", "muted", { origin: "user" });
    const strip = (l: string) => l.replace(/\[[0-9;]*m/gu, "");

    const command = strip(commandRows(doc.command, 56, FULL_CAPS)[0] ?? "");
    const notice = strip(kit.renderToLines(doc.blocks[0]!, 56)[0] ?? "");

    expect(command.indexOf("/"), "the command's text starts at the gutter").toBe(
      PROMPT_GUTTER.first,
    );
    expect(notice.indexOf("⎿"), "and the mark is in that column, not left of it").toBe(
      PROMPT_GUTTER.first,
    );
  });
});
