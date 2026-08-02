// C22 tier 4 — a real `Session`, a real frame, real bytes on the stream.
//
// **Distinct from `buildGraph`, which every other C22 row uses.** That harness
// stubs `render` with a counter, so the graph it builds never paints — and the
// one thing asserted here happens *inside* `Session#render` and nowhere else.
// A row about it written against `buildGraph` would measure the harness.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { displayCells } from "../../src/presentation/text.js";

const HOME_SEQ = "[H";
const HIDE_SEQ = "[?25l";

/**
 * The rows of the last frame written, escapes stripped.
 *
 * The same slice C03's T4.9 and `test/support/pty.ts` take: a frame is one
 * write, beginning hide + `HOME` and closing with the cursor's position, so the
 * rows are what sits between `HOME` and the next hide.
 */
function lastFrame(chunks: readonly string[]): readonly string[] {
  const framed = chunks.filter((c) => c.includes(HOME_SEQ));
  const last = framed[framed.length - 1];
  if (last === undefined) return [];
  const body = last.slice(last.indexOf(HOME_SEQ) + HOME_SEQ.length);
  const end = body.indexOf(HIDE_SEQ);
  return (end === -1 ? body : body.slice(0, end))
    .replaceAll(/\[[0-9;?]*[A-Za-z]/g, "")
    .split("\r\n");
}

describe("C22 integration — the frame's viewport", () => {
  it("T4.12 (I34, with C14): a document taller than the region stays pinned to its last row at every prompt height", async () => {
    // **`/help` is the tall document, and it needs no transport.** It is a local
    // route rendering the keymap (C23 I26), so this row exercises the height
    // without a far side, a fixture corpus or a spawn — the three things that
    // would put someone else's failure in this test.
    const stdin = fakeStdin();
    const { stdout } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 16 });

    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      // The read loop decodes on the microtask queue; one turn is enough for the
      // batch and its commit, and the scheduler is synchronous under the fake.
      await Promise.resolve();
      await Promise.resolve();
    };

    await type("/help\r");
    await Promise.resolve();

    // **The subject before the claim** — a session that failed to draw would
    // satisfy every assertion below with an empty frame.
    const settled = lastFrame(stdout.chunks);
    expect(settled, "a frame was written").toHaveLength(16);

    // Not the fallback. With the viewport sized to the terminal it selects three
    // rows more than the region has, `paint` refuses (I35) and `drawFallback`
    // draws `Terminal too small` — so this is the assertion that fails against
    // the defect, and it fails loudly rather than by one row.
    expect(settled.join("\n"), "a real frame, not the fallback").not.toContain("Terminal too small");

    // The transcript region: rows 1 … 12 − 1 footer − promptRows.
    const regionOf = (frame: readonly string[], promptRows: number): readonly string[] =>
      frame.slice(1, frame.length - 1 - promptRows);

    // **Following the tail pins the *bottom* of the document**, so the region's
    // last row is the document's last row — and it is the same row however tall
    // the prompt is. That is the whole claim, and it is what distinguishes the
    // two readings: with the height taken from the terminal, `maxTop` does not
    // move as the prompt grows, so the *top* is what stays put and the bottom
    // walks up the document. One prompt height cannot tell them apart.
    const bottoms: string[] = [];
    const heights: number[] = [];

    for (const typed of ["", "x".repeat(140), "x".repeat(320)]) {
      if (typed !== "") await type(typed.slice(-140));
      const frame = lastFrame(stdout.chunks);
      expect(frame, `${String(typed.length)}: a frame`).toHaveLength(16);
      expect(frame.join("\n"), `${String(typed.length)}: not the fallback`).not.toContain(
        "Terminal too small",
      );

      // The prompt is every row from the first one wearing the glyph down to the
      // footer — read from the frame rather than computed, so the arithmetic
      // under test is not also the arithmetic doing the reading.
      const first = frame.findIndex((r, i) => i > 0 && r.trimStart().startsWith("❯"));
      expect(first, `${String(typed.length)}: the prompt is on the frame`).toBeGreaterThan(0);
      const promptRows = frame.length - 1 - first;
      heights.push(promptRows);

      const region = regionOf(frame, promptRows);
      expect(region, `${String(typed.length)}: the region is what is left`).toHaveLength(
        16 - 2 - promptRows,
      );
      bottoms.push((region[region.length - 1] ?? "").trimEnd());
    }

    // The control: the three passes really did have different prompt heights.
    // Without it every assertion above holds against a prompt that never grew.
    expect(new Set(heights).size, `three prompt heights, got ${heights.join(", ")}`).toBe(3);

    // And the bottom of the document never moved.
    expect(new Set(bottoms).size, `the document's last row: ${bottoms.join(" | ")}`).toBe(1);
    expect(bottoms[0], "and it is content, not padding").not.toBe("");

    // Every row is still the frame's width — the other axis, asserted because a
    // region computed one way and painted another shows up here first.
    for (const row of lastFrame(stdout.chunks)) {
      expect(displayCells(row)).toBe(100);
    }
  });

  it("T4.9b (C16 I23): the scroll keys are in what /help renders", async () => {
    // **The row that says the ruling changed something a user can see.** Before
    // it, PageUp scrolled and `/help` could not mention it — the keys were read
    // out of an `InputEvent` in a `switch`, and help renders from the keymap —
    // while ⌃Home and ⌃End did not work at all. A row asserting the bindings
    // exist is T2.16b's; this asserts they reach the screen.
    //
    // Driven through a real session rather than by calling `bindings()`,
    // because the thunk agreeing with the keymap is not the claim: the claim is
    // that the help a user reads contains them.
    const stdin = fakeStdin();
    const { stdout } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 40 });

    stdin.emit("/help\r");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const frame = lastFrame(stdout.chunks);
    expect(frame, "a frame was written").toHaveLength(40);
    const text = frame.join("\n");

    // The control: help arrived at all. Without it every assertion below is
    // about an empty screen and the row passes when nothing rendered.
    expect(text, "the help document is on the frame").toContain("c+r");

    for (const shown of ["pageup", "pagedown", "c+home", "c+end"]) {
      expect(text, `/help shows ${shown}`).toContain(shown);
    }
  });
});
