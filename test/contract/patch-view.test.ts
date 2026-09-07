// C22 §3 / C25 §3c — the fullscreen patch view, the first producer of a
// `kind: "view"` layer.
//
// **Every row here comes from §3c's trace, and three of them exist because a
// single-motion test cannot see the defect.** `G` then `p` is the row that
// separates one cursor from two; a patch arriving under an open view is the row
// that separates a live window from a snapshot; an eviction is the row that
// separates watching from checking-on-the-next-keystroke. Each needs a
// *sequence*, and each passes trivially when driven one step at a time.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block, Hunk, Patch, ViewDocument } from "../../src/data/viewmodel/index.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createPatchView, PATCH_VIEW_ID } from "../../src/shell/patch-view.js";
import { registry } from "../support/overlay.js";

const REGION = { width: 80, height: 10 } as const;

const HUNK = (header: string, collapsedBefore?: number): Hunk => ({
  header,
  lines: [
    { kind: "context", text: "spec:" },
    { kind: "context", text: "  selector:" },
    { kind: "remove", text: "    app: old" },
    { kind: "add", text: "    app: new" },
    { kind: "context", text: "  replicas: 2" },
  ],
  ...(collapsedBefore === undefined ? {} : { collapsedBefore }),
});

const PATCH = (id: string): Patch =>
  block({
    kind: "patch",
    id,
    path: "serving/estimator.yaml",
    language: "yaml",
    hunks: [HUNK("@@ -18,4 +18,4 @@", 14), HUNK("@@ -60,4 +60,4 @@", 30), HUNK("@@ -90,4 +90,4 @@")],
    collapsedAfter: 170,
  } as Patch);

const docWith = (blocks: readonly Block[]): ViewDocument => ({
  schema: "tui.view/1",
  command: "diff",
  status: "ok",
  blocks,
  meta: {
    verb: "diff",
    adapter: "git",
    exitCode: 0,
    durationMs: 1,
    truncated: false,
    argv: ["git", "diff"],
    stderr: "",
    transport: "subprocess",
    origin: "user",
  },
});

function harness() {
  const overlays = createOverlayManager({ registry });
  const transcript = createTranscriptStore();
  let frames = 0;
  const view = createPatchView({
    overlays,
    transcript,
    region: () => REGION,
    redraw: () => {
      frames += 1;
    },
  });
  return { overlays, transcript, view, frames: () => frames };
}

/** The window currently on screen, as its first hunk's first line. */
const firstLine = (h: ReturnType<typeof harness>): string | undefined => {
  const layer = h.overlays.top;
  const content = layer?.content[0];
  if (content === undefined || content.kind !== "patch") return undefined;
  return content.hunks[0]?.lines[0]?.text;
};

const shownHeaders = (h: ReturnType<typeof harness>): readonly string[] => {
  const content = h.overlays.top?.content[0];
  if (content === undefined || content.kind !== "patch") return [];
  return content.hunks.map((x) => x.header);
};

describe("C22 §3 — the fullscreen patch view", () => {
  it("opens over a patch in its own entry, and the layer covers the region", () => {
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));

    expect(h.view.open(entry, "p1")).toBeNull();
    expect(h.overlays.top?.kind).toBe("view");
    expect(h.overlays.top?.id).toBe(PATCH_VIEW_ID);

    // **The window fits, and that is the assertion.** C15 reports `truncated`
    // when content outgrows its box (C15 §4), so a view that pushed the whole
    // block would report `true` — which is exactly what C15 T4.9 asserts today,
    // against an owner that did not exist.
    const placed = h.overlays.layout(REGION)[0];
    expect(placed?.top).toBe(0);
    expect(placed?.left).toBe(0);
    expect(placed?.truncated).toBe(false);
  });

  it("T3.60 (C23 I31): a patch inside a panel opens, and a motion still finds it", () => {
    // **The arrangement the framework itself produces** (F471). `b.live` builds
    // a panel and C23 I34 replaces every refreshed part with one, so a live
    // `git diff` part holding a patch is the documented output of the refresh
    // path — and every fixture in this file put the patch at the top level,
    // which is what a hand-written fixture does.
    //
    // **Two assertions because there are two resolutions.** `open` finds the
    // block once; `live` re-reads it behind every motion and dismisses the
    // layer as `anchorEvicted` when it cannot. So a fix applied to `open` alone
    // opens the view and closes it on the first keypress, blaming an eviction
    // that did not happen — and the first assertion alone would call that a
    // pass.
    const h = harness();
    const wrapped = block({
      kind: "panel",
      id: "wrap",
      title: "diff",
      children: [PATCH("p1")],
    } as Block);
    const entry = h.transcript.append(docWith([wrapped]));

    expect(h.view.open(entry, "p1"), "a patch inside a panel resolves").toBeNull();
    expect(h.overlays.top?.id).toBe(PATCH_VIEW_ID);

    h.view.move("pageDown");
    expect(h.overlays.top?.id, "and it survives a motion").toBe(PATCH_VIEW_ID);
    h.view.pop();
  });

  it("T3.60 control: the same patch at the top level, which passes either way", () => {
    // **The control says the row measures the nesting rather than the fixture.**
    // It passes on both sides of the change; if it ever fails, `PATCH` or the
    // harness moved and T3.60 above is reporting that instead.
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));
    expect(h.view.open(entry, "p1")).toBeNull();
    h.view.move("pageDown");
    expect(h.overlays.top?.id).toBe(PATCH_VIEW_ID);
    h.view.pop();
  });

  it("T3.20 (C23 I31): a target in another entry is refused, and the control opens", () => {
    const h = harness();
    const first = h.transcript.append(docWith([PATCH("p1")]));
    const second = h.transcript.append(docWith([PATCH("p2")]));

    // The control first: without it every assertion below passes for an owner
    // that refuses every view.
    expect(h.view.open(second, "p2")).toBeNull();
    h.view.pop();

    expect(h.view.open(second, "p1")).toMatch(/no block `p1` in this entry/);
    expect(h.overlays.top).toBeNull();
    // And the same id *does* resolve in the entry that owns it — so the refusal
    // is about scope rather than about the id being unknown anywhere.
    expect(h.view.open(first, "p1")).toBeNull();
  });

  it("T3.21 (C23 I31): a view over an open layer is refused, and no OverlayError escapes", () => {
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));
    h.overlays.push({
      id: "menu",
      kind: "overlay",
      // **Anchored, because a menu is** (C15 I20 made the placement a
      // decision rather than a default). This stands in for the completion
      // menu while the row is about routing; it was centred with no width,
      // which is neither what a menu is nor a placeable layer.
      placement: { kind: "anchored" as const, row: 0, prefer: "below" as const },
      content: [],
      dismissable: true,
    });

    // **Both halves.** C15 throws on a view over a non-empty stack (C15 I1) and
    // this runs inside a renderer's callback, so a dispatcher that swallowed the
    // throw would pass a `.not.toThrow()` alone while saying nothing to anyone.
    let refusal: string | null = "unset";
    expect(() => {
      refusal = h.view.open(entry, "p1");
    }).not.toThrow();
    expect(refusal).toMatch(/close what is open/);
    expect(h.overlays.top?.id).toBe("menu");
  });

  it("refuses a target that is not a patch, naming what it found", () => {
    const h = harness();
    const doc = {
      ...docWith([]),
      blocks: [block({ kind: "raw", id: "r1", text: "plain" })],
    } as ViewDocument;
    const entry = h.transcript.append(doc);
    expect(h.view.open(entry, "r1")).toMatch(/is a raw, not a patch/);
  });

  it("T3.30 (C22 I41): G then p goes to the hunk before the last, not before the first", () => {
    // **The row that separates one cursor from two.** An implementation holding
    // an offset *and* a hunk index passes every single-motion test: `n` steps
    // the index, `G` sets the offset, and only a sequence makes them disagree.
    // With two cursors, `G` leaves the index at hunk 0 and `p` answers about
    // hunk 0's predecessor — nothing — instead of about hunk 2's.
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));
    h.view.open(entry, "p1");

    h.view.move("bottom");
    const atBottom = h.overlays.top?.content[0];
    expect(shownHeaders(h)).toContain("@@ -90,4 +90,4 @@");

    h.view.move("prevHunk");
    const afterPrev = h.overlays.top?.content[0];
    // Hunk 1 in full, from its own first line: `p` landed on the hunk's start
    // rather than merely somewhere above where it was.
    expect(shownHeaders(h)[0]).toBe("@@ -60,4 +60,4 @@");
    expect(firstLine(h)).toBe("spec:");
    // And the window moved. **Compared as content, not as its first header**:
    // the bottom window already begins inside hunk 1, so a header comparison is
    // satisfied by a `p` that did nothing — which is what a stale hunk index
    // produces, and what this row exists to catch.
    expect(afterPrev).not.toEqual(atBottom);
  });

  it("nextHunk clamps at the last and prevHunk at the first — never wraps", () => {
    // Wrapping to the top of a diff loses the reader's place silently (§3c A3).
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));
    h.view.open(entry, "p1");

    h.view.move("top");
    const top = shownHeaders(h);
    h.view.move("prevHunk");
    expect(shownHeaders(h)).toEqual(top);

    h.view.move("bottom");
    const bottom = shownHeaders(h);
    h.view.move("nextHunk");
    expect(shownHeaders(h)).toEqual(bottom);
  });

  it("T3.31 (C22 I42): a patch arriving under an open view shows through", () => {
    // A snapshot taken at push time passes every motion test in this file. What
    // it cannot do is follow the entry — and `expand` produces exactly such a
    // patch one keystroke earlier.
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));
    h.view.open(entry, "p1");
    expect(firstLine(h)).toBe("spec:");

    const replaced = block({
      kind: "patch",
      id: "p1",
      path: "serving/estimator.yaml",
      language: "yaml",
      hunks: [{ header: "@@ -1,1 +1,1 @@", lines: [{ kind: "context", text: "REWRITTEN" }] }],
    } as Patch);
    const outcome = h.transcript.patch(entry, { op: "replace", blockId: "p1", block: replaced }, "shell");
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);

    expect(firstLine(h)).toBe("REWRITTEN");
  });

  it("T3.32 (C22 I42): evicting the entry dismisses the view, and Esc afterwards finds nothing", () => {
    // **Watched rather than checked on the next keystroke.** A lazy check leaves
    // a diff for a vanished entry on the screen until the reader presses
    // something — and if they press `Esc` first it pops and reads as having
    // worked. C15 declares `anchorEvicted` and cannot detect it (C15 I10).
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));
    h.view.open(entry, "p1");
    expect(h.overlays.top).not.toBeNull();

    const reasons: string[] = [];
    h.overlays.subscribe((c) => {
      if (c.kind === "dismiss") reasons.push(c.reason);
    });

    h.transcript.clear();
    expect(h.overlays.top).toBeNull();
    expect(reasons).toEqual(["anchorEvicted"]);
    // `pop` now has nothing to do, and says so rather than dismissing an id
    // that has gone.
    expect(h.view.pop()).toBe(false);
  });

  it("T5.6 (C15): Esc pops, the transcript is untouched, and a frame is composed", () => {
    const h = harness();
    const entry = h.transcript.append(docWith([PATCH("p1")]));
    const before = h.transcript.entries.length;
    h.view.open(entry, "p1");

    const framesBefore = h.frames();
    expect(h.view.pop()).toBe(true);
    expect(h.overlays.top).toBeNull();
    // Nothing appended — the half that makes A01 D7's preserved selection
    // possible, rather than an incidental detail beside it.
    expect(h.transcript.entries).toHaveLength(before);
    expect(h.frames()).toBeGreaterThan(framesBefore);
  });

  it("a motion with no view open is a no-op, not a throw", () => {
    const h = harness();
    expect(h.view.move("pageDown")).toBe(false);
    expect(h.view.pop()).toBe(false);
  });
});
