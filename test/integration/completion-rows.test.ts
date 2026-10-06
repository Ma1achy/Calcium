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
const ENV = { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" };

/** Fourteen verbs, `prof00` to `prof13`: `/prof0` leaves ten, which 80 × 24 cuts to six. */
const TOOLS = Array.from({ length: 14 }, (_, i) => ({
  name: `prof${String(i).padStart(2, "0")}`,
  local: false,
  summary: `summary number ${String(i)}`,
  args: [],
  flags: [],
}));

async function menu(typed: string, tools = TOOLS) {
  const stdin = fakeStdin();
  const { stdout } = await buildSession(
    { stdin: stdin as never, env: ENV, manifest: { schema: "tui.manifest/1", binary: "prism", version: "1.0.0", tools } } as never,
    { ...SIZE },
  );
  await settle();
  stdin.emit(typed);
  await settle();
  const grid = () => styledScreenFrom(stdout.chunks, SIZE);
  const press = async (keys: string): Promise<void> => {
    stdin.emit(keys);
    await settle();
  };
  return { grid, press };
}

describe("C19 I32, I33, I34 — the menu on the screen", () => {
  it("T4.13 (C19 I32, I33, I34, C22 I150): over a cut menu the hints start in one column and are muted, the match is accent bold, the status row names the rest keys and then the selection's, and the prompt's ghost is the current's remainder", async () => {
    const { grid, press } = await menu("/prof0");
    let g = grid();
    const muted = styleAt(rowContaining(g, "/help")!, "/help")!;
    // The owner line is the frame's last row, and its word is `accent`.
    const accent = styleAt(g.at(-1)!, "complete")!;

    // **The rows.** Hints in one column past the widest label, not at the edge.
    const one = rowContaining(g, "/prof01")!;
    const two = rowContaining(g, "/prof02")!;
    const starts = [textOf(one).indexOf("summary number 1"), textOf(two).indexOf("summary number 2")];
    expect(new Set(starts).size, `the hints start in one column: ${JSON.stringify(starts)}`).toBe(1);
    expect(starts[0], "and it is not the region's edge").toBeLessThan(40);
    expect(styleAt(one, "summary")?.fg, "the hint is muted").toBe(muted.fg);

    // **The match**: `/prof0` over a label that is not current is accent and bold.
    const m = styleAt(one, "/prof0")!;
    expect(m.fg, "the matched prefix is accent").toBe(accent.fg);
    expect(m.attrs, "and bold").toContain(1);
    const rest = one.map((c) => c.ch).join("").indexOf("/prof01") + "/prof0".length;
    expect(one[rest]?.style.fg, "the rest of the label is not").not.toBe(accent.fg);

    // **The status row** closes the menu, directly above the prompt's rule.
    const text = g.map(textOf);
    const status = text.findIndex((l) => /^\s*6 of 10\b/u.test(l));
    expect(status, "the status row is drawn over a cut menu").toBeGreaterThan(0);
    expect(text[status]).toMatch(/^ {2}6 of 10 {3}⏎ run {3}⇥ complete {3}esc close$/u);
    expect(text[status + 1], "the prompt's rule is directly under it").toMatch(/^─{20,}/u);
    expect(styleAt(g[status]!, "6 of 10")?.fg, "the count is muted").toBe(muted.fg);
    expect(styleAt(g[status]!, "⏎")?.fg, "a chord is accent").toBe(accent.fg);
    expect(styleAt(g[status]!, "run")?.fg, "a word is muted").toBe(muted.fg);

    // **The ghost**: the current's remainder, muted, in the prompt.
    const prompt = rowContaining(g, "❯ /prof0")!;
    expect(textOf(prompt)).toBe("❯ /prof00");
    expect(prompt[prompt.map((c) => c.ch).join("").indexOf("/prof00") + "/prof0".length]?.style.fg, "the ghost is muted").toBe(muted.fg);

    // **After ⇥ and ↓** the keys are the selection's and the ghost follows the current.
    await press("\t");
    g = grid();
    expect(g.map(textOf).find((l) => /6 of 10/u.test(l))).toMatch(/^ {2}6 of 10 {3}↑↓ move {3}⏎ accept {3}esc close$/u);
    await press("\u001b[B");
    g = grid();
    expect(textOf(rowContaining(g, "❯ /prof0")!), "↓ moves the ghost to /prof01's remainder").toBe("❯ /prof01");

    // **`→` inserts what the prompt shows** (C19 I7, C19 I34).
    await press("\u001b[C");
    expect(textOf(rowContaining(grid(), "❯")!), "→ accepted the ghost").toMatch(/^❯ \/prof01/u);
  });

  it("T4.13 (C19 I33, control): a menu that shows everything it holds draws no status row, and its last row is a candidate", async () => {
    const { grid } = await menu("/c", []);
    const text = grid().map(textOf);
    const prompt = text.findIndex((l) => l.startsWith("❯"));
    expect(text.some((l) => /^\s*\d+ of \d+\b/u.test(l)), "no count anywhere").toBe(false);
    expect(text[prompt - 1], "the prompt's rule").toMatch(/^─{20,}/u);
    expect(text[prompt - 2], "directly under the last candidate").toMatch(/^\s+\/config\b/u);
  });
});
