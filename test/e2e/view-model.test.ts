// C04 tier 5 — e2e. A real session, a real terminal, real widths.
//
// Every one of C04's tier-5 tests is a *drift* test: does the number the
// measurer returned match the rows the terminal actually shows? That needs a
// render tree, a viewport and a PTY. A registry measures a block, and only a
// viewport can drift.
//
// **What the drift is, read from outside.** In-process, C14 T5.1 compares the
// selected range against a rendered document and the two are the same
// arithmetic. From a PTY there is no document to compare against — only frames —
// so the claim is the one a user could make: paging from the top reaches the
// bottom, every screenful advances by exactly `height − 1` rows (C14 I17), no
// row is skipped and none is shown twice out of order, and the last screenful
// ends on the document's last row.
//
// That final clause is not decoration. The viewport was three rows taller than
// the region it draws into (C22 I34), so it stopped scrolling short by exactly
// the chrome and the document's last rows were unreachable by `End`, `PageDown`
// or `↓` — arithmetically self-consistent everywhere, and visible only here.
import { describe, expect, it } from "vitest";

import { interactivePty, PROMPT, promptRow, type InteractivePty } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs session subprocess";

// **`Home` and `End` are not here, and that is a finding rather than an
// omission.** `construct.ts`'s `scrollAmount` maps them to `scrollToTop` and
// `scrollToBottom`, and the keymap binds both to the *prompt* layer's cursor
// motions (`keymap.ts`) — which is dispatched first, at every moment the prompt
// has focus, which is nearly always. So those two arms are reachable by nothing
// and the operations behind them have no route from a keyboard. C14 §2 is not
// wrong: it says the keys that invoke its operations are C16's. What has no
// owner is the disagreement between C16's table and the shell's.
//
// The row uses the keys that do arrive. Asserting `End` here would have been a
// row that fails for a reason it is not about.
const KEY = {
  pageDown: "\u001b[6~",
  pageUp: "\u001b[5~",
} as const;

const COLS = 100;
const ROWS = 24;

const session = (cols = COLS, rows = ROWS): InteractivePty =>
  interactivePty(FIXTURE, { cols, rows });

/**
 * The transcript region of a frame: everything between the header and the
 * prompt, with the footer below it (S01 §3).
 *
 * Derived from where the prompt actually is rather than from `rows − 3`, so the
 * helper does not encode the arithmetic the rows are checking. `promptRow` takes
 * the **last** row wearing the glyph, because since C22 I33 the transcript draws
 * each entry with the command that produced it and the first one is that echo.
 */
function region(frame: readonly string[]): readonly string[] {
  const prompt = promptRow(frame);
  const at = frame.lastIndexOf(prompt);
  return frame.slice(1, at).map((r) => r.trimEnd());
}

describe("C04 e2e — the drift tests", () => {
  it("T5.1 (C22 I34, C14 I17): a tall transcript pages from top to bottom, and the last row is reachable", async () => {
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 20_000);

      // A document far taller than the region, from the real far side. 400 rows
      // against a 21-row region is nineteen screenfuls, which is enough for a
      // per-page off-by-one to accumulate into something unmistakable.
      pty.type("/ps --limit 400\r");
      await pty.waitForFrame((f) => region(f).some((r) => r.includes("0000399")), 30_000);

      // **Following the tail, so the settled frame already ends on the document's
      // last row.** That row is the subject of the whole test: it is what the
      // mis-sized viewport could not reach, and capturing it here rather than
      // computing it means the assertion does not depend on knowing the
      // document's height.
      const tail = region(pty.frame);
      const lastRow = tail[tail.length - 1] ?? "";
      expect(lastRow, "the tail is content, not padding").not.toBe("");

      // To the top by paging, since `Home` cannot get there (see `KEY`). Paged
      // rather than jumped, so the walk down below starts from a position this
      // test reached the same way a user would.
      for (let i = 0; i < 400; i += 1) {
        const before = region(pty.frame).join("\n");
        pty.type(KEY.pageUp);
        try {
          await pty.waitForFrame((f) => region(f).join("\n") !== before, 2_000);
        } catch {
          break; // the top: the frame stopped changing
        }
      }
      expect(region(pty.frame).at(-1), "at the top, not still at the tail").not.toBe(lastRow);

      const screens: (readonly string[])[] = [];
      let guard = 0;
      for (;;) {
        const here = region(pty.frame);
        screens.push(here);
        if (here[here.length - 1] === lastRow) break;
        if ((guard += 1) > 200) break;

        pty.type(KEY.pageDown);
        // The frame after the key, not the stream: the bytes for the previous
        // frame are already in `output` and a stream match would resolve before
        // the frame this key caused had been written.
        const before = here.join("\n");
        await pty.waitForFrame((f) => region(f).join("\n") !== before, 20_000);
      }

      expect(guard, "it reached the bottom rather than giving up").toBeLessThan(200);
      expect(screens.length, "a tall document is many screenfuls").toBeGreaterThan(10);

      // **The last screenful ends on the document's last row.** This is the
      // clause the height defect broke: `#maxTop()` was short by the chrome, so
      // paging stopped three rows early and `End` stopped at the same place.
      expect(screens[screens.length - 1]?.at(-1)).toBe(lastRow);

      // **Every page advances by exactly `height − 1`** (C14 I17). The overlap is
      // the point — a full-height page turn leaves a reader with no anchor in
      // what they just read — so the last row of one screen is the first row of
      // the next. Asserted between every consecutive pair rather than on the
      // total, because a compensating pair of errors sums correctly.
      //
      // The final pair is exempt: the bottom clamps, so the last page is short
      // by however much was left rather than a full page.
      for (let i = 1; i < screens.length - 1; i += 1) {
        const prev = screens[i - 1] ?? [];
        const here = screens[i] ?? [];
        expect(here[0], `screen ${String(i)} starts where screen ${String(i - 1)} ended`).toBe(
          prev[prev.length - 1],
        );
      }

      // And no screenful is short: the region is full at every step of a
      // document this tall, which is what makes the overlap check above a claim
      // about scrolling rather than about padding.
      const heights = new Set(screens.map((s) => s.length));
      expect(heights.size, `every screenful is the same height: ${[...heights].join(", ")}`).toBe(1);

      // **And paging past the bottom does not move it.** The clamp, from the
      // outside: a viewport that kept scrolling would show blank rows below the
      // document, which is what a `#maxTop()` computed from the wrong height
      // produces in the other direction.
      pty.type(KEY.pageDown);
      pty.type(KEY.pageDown);
      await new Promise((r) => setTimeout(r, 300));
      expect(region(pty.frame).at(-1), "the bottom is the bottom").toBe(lastRow);
    } finally {
      pty.kill();
    }
  }, 120_000);

  it.todo(
    "T5.2: the same, at four terminal widths, with a resize between passes — waits on L4",
  );
  it.todo(
    "T5.3: a --watch stream applying merge patches for sixty seconds — the viewport does not jump, and an expanded row stays expanded and stays put — waits on L4",
  );
});
