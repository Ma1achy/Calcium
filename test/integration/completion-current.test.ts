// C19 §6 — the menu in a built session (I29, I23; rulings 89 and 90).
//
// Read from the screen, because both rulings are about the frame: which row
// carries the mark, and which rule the menu closes on. A row that asked the
// block list could agree with a menu drawing two stacked rules.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r));
};

/** A rule row: the horizontal glyph, and nothing but it and an optional label. */
const RULE = /^─{6,}/u;

const menuAt = async (label: string | null) => {
  const stdin = fakeStdin();
  const { screen } = await buildSession(
    {
      stdin: stdin as never,
      ...(label === null ? {} : { chrome: { header: () => [], footer: () => [], label: () => label } }),
    } as never,
    { columns: 80, rows: 24 },
  );
  await settle();
  stdin.emit("/c");
  await settle();
  const read = () => {
    const rows = screen().rows;
    const prompt = rows.findIndex((r) => r.startsWith("❯"));
    // The menu's top edge: the last region-wide rule above the prompt.
    let top = -1;
    rows.slice(0, prompt).forEach((r, i) => {
      if (r.trimEnd().length === 79 && RULE.test(r)) top = i;
    });
    return { rows, prompt, top };
  };
  return { stdin, read };
};

describe("C19 I29, I23 — the menu on the screen", () => {
  it("T4.11 (C19 I29, I23, C22 I81, I111): at rest the first candidate reads › and the labels start in one column, the menu closes on the prompt's upper rule, Tab changes no menu row, and a label stays on that rule", async () => {
    const { stdin, read } = await menuAt(null);
    const { rows, prompt, top } = read();
    expect(top, "the menu is open, under its top rule").toBeGreaterThanOrEqual(0);

    // **Ruling 89 — the mark at rest.** Nothing has been chosen (C19 I20), and
    // the first candidate is the current one.
    const menu = rows.slice(top + 1, prompt - 1);
    expect(menu.map((r) => r.slice(0, 17).trimEnd()), "the three candidates, and nothing else").toEqual([
      "  › /capabilities",
      "    /clear",
      "    /config",
    ]);
    const starts = menu.map((r) => r.indexOf("/"));
    expect(new Set(starts).size, `the labels start in one column: ${JSON.stringify(starts)}`).toBe(1);

    // **Ruling 90 — one rule under the menu, and it is the prompt's.** The row
    // under the last candidate is the full width of the terminal, where the
    // menu's own rules are the region's; and between the top edge and `❯`
    // there is exactly one more rule.
    expect(rows[prompt - 1]?.trimEnd().length, "the prompt's rule is the terminal's width").toBe(80);
    expect(RULE.test(rows[prompt - 1] ?? ""), "and it is directly under the last candidate").toBe(true);
    expect(RULE.test(rows[prompt - 2] ?? ""), `the row above it is a candidate: ${JSON.stringify(rows[prompt - 2])}`).toBe(false);
    const between = rows.slice(top + 1, prompt).filter((r) => RULE.test(r));
    expect(between, "one rule between the menu's top edge and the prompt").toHaveLength(1);

    // **Tab enters the menu and draws nothing new in it**: the current was the
    // first candidate already.
    stdin.emit("\t");
    await settle();
    const after = read();
    expect(after.rows.slice(after.top + 1, after.prompt - 1), "Tab changed no menu row").toEqual(menu);

    // **The label stays on the rule the menu closes on** (C22 I111).
    const labelled = (await menuAt("calcium")).read();
    const rule = labelled.rows[labelled.prompt - 1] ?? "";
    expect(rule.trimEnd().endsWith(" calcium ─"), `the labelled rule: ${JSON.stringify(rule.slice(-16))}`).toBe(true);
    expect(RULE.test(labelled.rows[labelled.prompt - 2] ?? ""), "and the menu sits on it").toBe(false);
  });
});
