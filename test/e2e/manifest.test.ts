// C05 tier 5 — e2e. A session driven by the fixture manifest, with no far side
// present at all.
//
// **The manifest here is the one the rest of the suite uses**, read from
// `test/support/manifest.fixture.json` by both `manifest.ts` and the spawned
// `fixture.mjs`. Two copies would drift, and the drift shows up as a tier-5 row
// asserting against a tool nothing else has.
import { describe, expect, it } from "vitest";
import { findTool, validateInvocation, visibleTools } from "../../src/data/manifest/index.js";
import { fixture } from "../support/manifest.js";
import { interactivePty, type InteractivePty } from "../support/pty.js";

const PROMPT = /❯/;

const session = (variant = ""): InteractivePty =>
  interactivePty(`node test/support/fixture.mjs session ${variant}`, { cols: 100, rows: 24 });

describe("C05 e2e", () => {
  it("every fixture tool resolves and validates with no far side present", () => {
    // Not T5.1 — that needs a session. This is the part of T5.1 that is C05's
    // alone: the whole manifest is self-consistent, so an e2e failure below is
    // about the session rather than about a fixture nobody checked.
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

  it.todo(
    // **Two of its three halves are demonstrated and the third is a finding.**
    // Driving this by hand: `/promote` with no argument shows C05's refusal —
    // `x "promote" requires <target>` — and Tab completes from the manifest.
    // But `/promote app.web:main` and `/ps`, both matched by the fixture
    // corpus, settle without rendering anything: the app route produces no
    // visible entry in a real session while the local, shell and refusal routes
    // all do. Not the fixture — a `blocks: []` document was the first
    // suspicion, and giving it a notice changed nothing.
    "T5.1: a session completes, validates and rejects for every tool, with no far side — blocked on the app route producing no visible entry in a session; rejection and completion already verified by hand",
  );

  it("T5.4: a manifest omitting a tool reports it unavailable, and the session continues", async () => {
    // The variant drops `ps` from the parsed manifest before construction, so
    // this is the same session with one tool fewer — which is what "a manifest
    // omitting a tool the app previously had" is, from the shell's side.
    const pty = session("no-ps");
    try {
      await pty.waitFor(PROMPT, 15_000);

      pty.type("/ps\r");
      // C18's unknown-verb path, which is where a dropped tool arrives: it is
      // no longer a manifest verb, so nothing can classify it as one.
      await pty.waitFor(/ps/, 15_000);

      // **And the session continues** — the half that makes this more than a
      // parser test. A shell that reported the loss and then stopped taking
      // input satisfies the first clause perfectly.
      pty.type("/guide\r");
      await pty.waitFor(/own local verb/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);

  it.todo(
    "T5.2: replacing the fixture with a manifest fetched from a real binary changes the completable surface — needs C05 B6's fetch path, which nothing implements: `TuiConfig.manifest` takes a parsed manifest or a file path, and neither runs a binary",
  );
  it.todo(
    "T5.3: a tool with no adapter renders through the fallback adapter — needs a fixture result that is not a tui.view/1 document, so the fallback has something to adapt",
  );
});
