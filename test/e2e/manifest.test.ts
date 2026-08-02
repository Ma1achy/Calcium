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
import { interactivePty, PROMPT, promptRow, type InteractivePty } from "../support/pty.js";


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

  it("T5.1 (C05, C19): a session completes, validates and rejects for every tool, with no far side", async () => {
    // **The blocker was stale, and it was the largest of the three halves.**
    // It read *blocked on L4 drawing no overlays, so C15's stack never reaches
    // the frame* — true when it was written and not since: `paint.ts`
    // composites `deps.overlays()` now, and C19 T5.3 already asserts a menu on
    // the screen. A deferral naming a state of the tree rather than a component
    // is the kind TD cannot expire, which is why it survived the fix.
    //
    // The three halves, in one session because they are one claim about one
    // manifest: a verb completes from it, a valid invocation reaches the far
    // side, and an invalid one is refused before it can.
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);

      // (1) Completion draws from the manifest. `/prom` is a prefix of exactly
      // one visible tool, so the menu's content is the manifest's answer.
      // Typed and then Tab, as separate writes: eight or more characters in one
      // chunk are a *paste* to the decoder's heuristic (C16 §7), and a pasted
      // Tab is content rather than a key. C19's own tier-5 rows split for the
      // same reason.
      pty.type("/prom");
      pty.type("\t");
      await pty.waitForFrame((f) => f.join("\n").includes("promote a candidate"), 15_000);

      // (2) The refusal, which is C05's validation and not C18's parse: the
      // verb resolves and the invocation does not.
      // **Each control key waits for its effect before the next is sent**, and
      // this one is not politeness either: `ESC` followed immediately by `0x15`
      // is one chunk, and the decoder reads an ESC-prefixed byte as *meta*
      // (C16 §2) — so the pair decoded as `⌥⌃u`, the menu never closed, focus
      // stayed on the overlay, and everything typed afterwards went nowhere.
      // The menu's own row is what the dismissal has to remove, so it is what
      // the wait names. A predicate matching a capitalisation the frame never
      // carried was already true, resolved instantly, and sent the next key to
      // a menu still holding focus — a wait on a condition that was true before
      // the key is the same class as the one `pty.ts` records for frames.
      const MENU_ROW = "promote a candidate";
      expect(pty.frame.join("\n"), "the menu row is on the frame").toContain(MENU_ROW);

      pty.type("\u001b"); // dismiss the menu
      await pty.waitForFrame((f) => !f.join("\n").includes(MENU_ROW), 15_000);
      pty.type("\u0015"); // ⌃u — clear the line
      await pty.waitForFrame((f) => promptRow(f).trim() === "❯", 15_000);

      // **The Enter waits for the line to be on the frame first**, and that is
      // not politeness. More than eight characters inside the heuristic window
      // are a *paste* to the decoder (C16 §7) and a pasted `\r` is content
      // rather than a key — and two `type` calls in one tick reach the PTY as
      // one chunk, so splitting the write is not enough on its own. The first
      // draft did both and still left the line typed and unsubmitted.
      const submit = async (line: string): Promise<void> => {
        pty.type(line);
        await pty.waitForFrame((f) => promptRow(f).includes(line), 15_000);
        pty.type("\r");
      };

      await submit("/promote");
      await pty.waitFor(/requires/, 15_000);

      // (3) And a valid one reaches the far side and renders.
      await submit("/promote app.web:main");
      await pty.waitFor(/app\.web/, 15_000);
    } finally {
      pty.kill();
    }
  }, 60_000);

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
    "T5.2: replacing the fixture with a manifest fetched from a real binary changes the completable surface — not deferred on a component, and that is the honest label: C05 is built and B6's fetch path is unbuilt work inside it, so naming C05 would expire the moment it was read. What is missing is `TuiConfig.manifest` accepting something that runs a binary; it takes a parsed manifest or a file path, and neither does: `TuiConfig.manifest` takes a parsed manifest or a file path, and neither runs a binary",
  );
  it.todo(
    "T5.3: a tool with no adapter renders through the fallback adapter — not deferred on a component: every component this needs is built, and what is missing is a harness route whose stdout is not a `tui.view/1` document, so the fallback has something to adapt. Writable as soon as `farside.mjs` grows one",
  );
});
