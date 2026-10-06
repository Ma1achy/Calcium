// C22 §6l.13 — the toast (§105, §012): transient status, never an owner.
//
// The footer's own blocks, walked for their chip labels, so the row reads what
// the default chrome says rather than what a painted frame happens to contain.
import { describe, expect, it } from "vitest";

import { makeDefaultChrome } from "../../src/shell/chrome.js";
import { glyphFor } from "../../src/presentation/blocks/glyphs.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const chrome = makeDefaultChrome("calcium", "calcium");

/** Every chip label on the footer's first row — the `chrome.footer` cluster. */
const tail = (caps: TerminalCapabilities, toast?: string): readonly string[] => {
  const out: string[] = [];
  const walk = (b: Block): void => {
    if (b.kind === "pills") out.push(...b.chips.map((c) => c.label));
    if (b.kind === "group") b.children.forEach(walk);
  };
  const [first] = chrome.footer({
    session: { cwd: "/work/calcium", env: {}, lastUuid: null, identity: null, cluster: "c", health: "live", version: "1", retained: null, stopping: false },
    now: 0,
    columns: 80,
    owner: null,
    capabilities: caps,
    ...(toast === undefined ? {} : { toast }),
  });
  if (first !== undefined) walk(first);
  return out;
};

describe("C22 §6l.13 — the toast", () => {
  it("T1.73 (C22 I116): the default footer draws the toast in place of its tail", () => {
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      // The control: no toast, and the tail is the working directory.
      expect(tail(caps), "the tail with no toast").toContain("/work/calcium");

      const live = tail(caps, "copied 3 lines");
      expect(live, "the toast, marked with ok's glyph").toContain(`${glyphFor("ok", caps)} copied 3 lines`);
      expect(live, "and the cwd it displaced is gone from the row").not.toContain("/work/calcium");
    }
    // K3 — the mark differs by rung and is the ok glyph at both, never a literal.
    expect(glyphFor("ok", ASCII_CAPS)).not.toBe(glyphFor("ok", FULL_CAPS));
  });
});
