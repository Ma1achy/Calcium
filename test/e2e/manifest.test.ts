// C05 tier 5 — e2e. A session driven by the fixture manifest, with no far side
// present at all.
//
// All four wait on C22: a session is what "started with the fixture manifest"
// means, and asserting the pieces separately here would be tier 1 wearing a
// tier 5 label. What C05 can hold to on its own is in tiers 1 to 3, and the
// deferrals name the component that makes each of these writable.
import { describe, expect, it } from "vitest";
import { findTool, validateInvocation, visibleTools } from "../../src/data/manifest/index.js";
import { fixture } from "../support/manifest.js";

describe("C05 e2e", () => {
  it("every fixture tool resolves and validates with no far side present", () => {
    // Not T5.1 — that needs a session. This is the part of T5.1 that is C05's
    // alone: the whole manifest is self-consistent, so when C22 lands the e2e
    // failure will be C22's rather than a fixture nobody checked.
    const m = fixture();

    for (const tool of m.tools) {
      const tokens = tool.name.split(" ");
      const match = findTool(m, tokens);
      expect(match?.tool.name, `${tool.name} must resolve by its own name`).toBe(tool.name);

      // A bare invocation either validates or fails for a stated reason. What
      // it must never do is throw.
      expect(() => validateInvocation(tool, [])).not.toThrow();
    }

    expect(visibleTools(m).length).toBe(m.tools.length - 1); // one hidden tool
  });

  it.todo("T5.1: a session completes, validates and rejects for every tool, with no far side — waits on C22");
  it.todo("T5.2: replacing the fixture with a manifest fetched from a real binary changes the surface — waits on C22 and C06");
  it.todo("T5.3: a tool with no adapter renders through the fallback adapter — waits on C07 and C22");
  it.todo("T5.4: a manifest omitting a previously-present tool reports it unavailable — waits on C22");
});
