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

    // **Derived from `hidden`, not from a count.** The literal was `- 1` and
    // went stale the day `FRAMEWORK_TOOLS` added a second hidden tool; a count
    // cannot say which tool moved, and this cannot go stale at all.
    expect(visibleTools(m).map((t) => t.name)).toEqual(
      m.tools.filter((t) => t.hidden !== true).map((t) => t.name),
    );
    expect(m.tools.filter((t) => t.hidden === true).length, "and there are some").toBeGreaterThan(0);
  });

  it.todo("T5.1: a session completes, validates and rejects for every tool, with no far side — waits on C23 — rejection is an invocation outcome, so it needs the pipeline that invokes");
  it.todo("T5.2: replacing the fixture with a manifest fetched from a real binary changes the surface — waits on C23 — C22 fetches the manifest, but the surface it changes is `/help`, which is a local handler");
  // **This deferral was exempt from the day it was written** and TD3 is what
  // surfaced it: C07 was mapped to `src/data/adapters.ts`, a path that has never
  // existed, so "waits on C07" could never expire. C07 landed long ago; the
  // blocker is C22, which owns the session this asserts end to end.
  it.todo("T5.3: a tool with no adapter renders through the fallback adapter — waits on C23 — adaptation happens on the app route, which is C23's");
  it.todo("T5.4: a manifest omitting a previously-present tool reports it unavailable — waits on C23 — the report is an invocation outcome");
});
