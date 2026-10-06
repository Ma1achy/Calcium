// C22 I143 / §6q.4 ruling 10 — a run of arrows under one modifier set names the modifiers once
// (§101 `⌥⇧↑↓`, §016 `⇧↑↓ select`).
import { describe, expect, it } from "vitest";

import { keyHint } from "../../src/shell/chrome.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

describe("chord hints", () => {
  it("T1.187 (C22 I143): a pair of arrows under one modifier set names the modifiers once, at the Unicode rung", () => {
    expect(keyHint([{ name: "up", meta: true, shift: true }, { name: "down", meta: true, shift: true }], "scroll", FULL_CAPS)).toBe("⌥⇧↑↓ scroll");
    expect(keyHint([{ name: "up", shift: true }, { name: "down", shift: true }], "extend", FULL_CAPS)).toBe("⇧↑↓ extend");
    expect(
      keyHint(
        ["up", "down", "left", "right"].map((name) => ({ name, shift: true })),
        "extend",
        FULL_CAPS,
      ),
    ).toBe("⇧↑↓←→ extend");
  });

  it("T1.187 (C22 I143): bare arrows, unlike modifier sets and non-arrows join as they did", () => {
    expect(keyHint([{ name: "up" }, { name: "down" }], "move", FULL_CAPS)).toBe("↑↓ move");
    expect(keyHint([{ name: "up", meta: true }, { name: "down", shift: true }], "x", FULL_CAPS)).toBe("⌥↑⇧↓ x");
    // Each modifier alone is the difference, so the comparison of every one is driven.
    // **Against a shared base, not against nothing**: `⌃↑` beside a bare `↓` joins to
    // `⌃↑↓`, which reads as a collapse whether or not one happened, so the clause
    // under test would be equivalent. With `⌥` (or `⌃`) on both, a wrong collapse
    // is `⌥⌃↑↓` and the right join is `⌥⌃↑⌥↓`.
    for (const m of ["ctrl", "meta", "shift", "super"] as const) {
      const base = m === "meta" ? "ctrl" : "meta";
      expect(keyHint([{ name: "up", [base]: true, [m]: true }, { name: "down", [base]: true }], "x", FULL_CAPS)).not.toMatch(/^[⌃⌥⇧⌘]+↑↓/u);
    }
    expect(keyHint([{ name: "n", ctrl: true }, { name: "p", ctrl: true }], "x", FULL_CAPS)).toBe("⌃N⌃P x");
    expect(keyHint([{ name: "up", shift: true }], "x", FULL_CAPS)).toBe("⇧↑ x");
  });

  it("T1.187 (C22 I143): the ASCII rung spells every chord, so a collapse never hides a key a reader can press", () => {
    expect(keyHint([{ name: "up", shift: true }, { name: "down", shift: true }], "extend", ASCII_CAPS)).toBe("S-Up/S-Down extend");
  });
});
