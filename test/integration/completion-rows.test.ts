// C19 I32, I33, I34 — the menu's rows, status row and ghost, read from the
// styled screen of a built session.
//
// **Tone is read against the frame's own chrome**, not against a hex value: the
// footer's `/help` is `muted` and the owner line's `complete` is `accent`, so a
// theme change moves both sides together.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { styledScreenFrom, textOf, rowContaining, styleAt } from "../support/styled-screen.js";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r));
};
const SIZE = { columns: 80, rows: 24 };

async function menu() {
  const stdin = fakeStdin();
  const { stdout } = await buildSession(
    { stdin: stdin as never, env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" } } as never,
    { ...SIZE },
  );
  await settle();
  stdin.emit("/c");
  await settle();
  const grid = () => styledScreenFrom(stdout.chunks, SIZE);
  const press = async (keys: string): Promise<void> => {
    stdin.emit(keys);
    await settle();
  };
  return { grid, press };
}

describe("C19 I32, I33, I34 — the menu on the screen", () => {
  it("T4.13 (C19 I32, I33, I34, C22 I150): the hints start in one column and are muted, the match is accent bold, the status row names the rest keys and then the selection's, and the prompt's ghost is the current's remainder", async () => {
    const { grid, press } = await menu();
    let g = grid();
    const muted = styleAt(rowContaining(g, "/help")!, "/help")!;
    // The owner line is the frame's last row, and its word is `accent`.
    const accent = styleAt(g.at(-1)!, "complete")!;

    // **The rows.** Three candidates, the hints in one column past the widest label.
    const caps = rowContaining(g, "/capabilities  ")!;
    const clear = rowContaining(g, "/clear")!;
    const config = rowContaining(g, "/config")!;
    const starts = [
      textOf(caps).indexOf("the rendering route"),
      textOf(clear).indexOf("empty the transcript"),
      textOf(config).indexOf("every setting"),
    ];
    expect(new Set(starts).size, `the hints start in one column: ${JSON.stringify(starts)}`).toBe(1);
    expect(starts[0], "and it is not the region's edge").toBeLessThan(40);
    expect(styleAt(clear, "empty the")?.fg, "the hint is muted").toBe(muted.fg);
    expect(styleAt(config, "every")?.fg).toBe(muted.fg);

    // **The match**: `/c` over the labels that are not current is accent and bold.
    const m = styleAt(clear, "/c")!;
    expect(m.fg, "the matched prefix is accent").toBe(accent.fg);
    expect(m.attrs, "and bold").toContain(1);
    const rest = clear.map((c) => c.ch).join("").indexOf("lear");
    expect(clear[rest]?.style.fg, "the rest of the label is not").not.toBe(accent.fg);

    // **The status row** closes the menu, directly above the prompt's rule.
    const text = g.map(textOf);
    const status = text.findIndex((l) => /^\s*3 of 3\b/u.test(l));
    expect(status, "the status row is drawn").toBeGreaterThan(0);
    expect(text[status]).toMatch(/^ {2}3 of 3 {3}⏎ run {3}⇥ complete {3}esc close$/u);
    expect(text[status + 1], "the prompt's rule is directly under it").toMatch(/^─{20,}/u);
    expect(styleAt(g[status]!, "3 of 3")?.fg, "the count is muted").toBe(muted.fg);
    expect(styleAt(g[status]!, "⏎")?.fg, "a chord is accent").toBe(accent.fg);
    expect(styleAt(g[status]!, "run")?.fg, "a word is muted").toBe(muted.fg);

    // **The ghost**: the current's remainder, muted, in the prompt.
    const prompt = rowContaining(g, "❯ /c")!;
    expect(textOf(prompt)).toBe("❯ /capabilities");
    expect(styleAt(prompt, "apabilities")?.fg, "the ghost is muted").toBe(muted.fg);
    expect(styleAt(prompt, "/c")?.fg, "and the typed text is not").not.toBe(muted.fg);

    // **After ⇥ and ↓** the keys are the selection's and the ghost follows the current.
    await press("\t");
    g = grid();
    expect(g.map(textOf).find((l) => /3 of 3/u.test(l))).toMatch(/^ {2}3 of 3 {3}↑↓ move {3}⏎ accept {3}esc close$/u);
    await press("\u001b[B");
    g = grid();
    expect(textOf(rowContaining(g, "❯ /c")!), "↓ moves the ghost to /clear's remainder").toBe("❯ /clear");

    // **`→` inserts what the prompt shows** (C19 I7, C19 I34).
    await press("\u001b[C");
    expect(textOf(rowContaining(grid(), "❯")!), "→ accepted the ghost").toMatch(/^❯ \/clear/u);
  });
});
