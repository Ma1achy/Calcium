/**
 * C22 §13a — the document view, and the interaction only it and the driver have.
 *
 * **Built against the real owner and a real `OverlayManager`, not the refresh
 * suite's `views` map.** That map is a flat `Map<string, Block[]>` standing in
 * for a layer's content, and it cannot represent the thing under test here: the
 * owner holds the *whole document* while the layer holds a *window* of it. A
 * fake that keeps one list has already decided that a block absent from the
 * layer is absent altogether, which is exactly the answer these rows exist to
 * check. A fake must not supply the behaviour.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { b } from "../../src/shell/builders/index.js";
import type { Block, ViewDocument } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { createRefreshDriver } from "../../src/shell/refresh.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import {
  createDocumentView,
  DOCUMENT_VIEW_ID,
  type DocumentView,
} from "../../src/shell/document-view.js";

const registry = createBlockRegistry();

/**
 * Every block here is three rows and a sequence separates them, so a region of
 * **eight** holds exactly two — not six.
 *
 * **The figure was six and it was the sum of the blocks.** `renderSequenceToLines`
 * puts a row between blocks, so two three-row blocks cost eight and the old
 * fixture asserted a window one block wider than the frame could hold. The
 * control below is what failed when the view stopped measuring a block at a
 * time, which is the whole reason it names the number instead of assuming it.
 */
const ROWS = 3;
const REGION = { width: 40, height: 8 };

const chunk = (id: string, text: string): Block =>
  b.panel(text, [b.raw(text, { id: `${id}-c` })], { id });

/** A block of exactly `rows` rows — C22 I47's subject, which `chunk` cannot be. */
const tall = (id: string, rows: number): Block =>
  b.raw(Array.from({ length: rows }, (_, i) => `line ${String(i)}`).join("\n"), { id });

const docOf = (blocks: readonly Block[]): ViewDocument => ({
  schema: "tui.view/1",
  command: "/watch api",
  status: "ok",
  blocks,
  meta: {
    verb: "watch",
    adapter: "test",
    exitCode: 0,
    durationMs: 1,
    truncated: false,
    argv: ["watch", "api"],
    stderr: "",
    transport: "subprocess",
    origin: "user",
  },
});

describe("C22 §13a — the document view", () => {
  let overlays: ReturnType<typeof createOverlayManager>;
  let view: DocumentView;
  let redraws: number;

  beforeEach(() => {
    overlays = createOverlayManager({ registry });
    redraws = 0;
    view = createDocumentView({
      overlays,
      measureSequence: (blocks, width) => registry.measureSequence(blocks, width),
      region: () => REGION,
      redraw: () => {
        redraws += 1;
      },
    });
  });

  const content = (): readonly Block[] => overlays.stack[0]?.content ?? [];
  const ids = (): readonly string[] => content().map((x) => x.id);

  it("T4.30 (C22 I45): the fixture measures what this file assumes it measures", () => {
    // **The control, and it is not ceremony.** Every row below is stated in
    // blocks-per-region, which is only meaningful if a block is three rows and
    // the region is six. Measured here so that a change to `b.panel`'s border or
    // to `b.raw` fails *this* row with a reason, rather than silently turning
    // every window assertion into a claim about a different number of blocks.
    expect(registry.measure(chunk("probe", "x"), REGION.width)).toBe(ROWS);
    // **Measured as a sequence, because that is what the view now asks and what
    // the frame draws.** Stating it as `height / ROWS` was the arithmetic the
    // code used rather than the one the terminal does, and the two differ by a
    // separator per block.
    const two = [chunk("p", "x"), chunk("q", "y")];
    expect(registry.measureSequence(two, REGION.width)).toBe(REGION.height);
    expect(
      registry.measureSequence([...two, chunk("r", "z")], REGION.width),
      "and a third does not fit",
    ).toBeGreaterThan(REGION.height);
  });

  it("T4.31 (C22 I45): open pushes a view before the document exists, and fill replaces it", () => {
    expect(view.open("/watch api")).toBeNull();
    // Step 3's slot: something is on screen before the transport is invoked.
    expect(overlays.stack).toHaveLength(1);
    expect(overlays.stack[0]?.kind).toBe("view");
    expect(overlays.stack[0]?.id).toBe(DOCUMENT_VIEW_ID);
    expect(ids(), "the waiting block, not the document").not.toContain("a");

    expect(view.fill(docOf([chunk("a", "one"), chunk("b", "two")]))).toBe(true);
    expect(ids()).toEqual(["a", "b"]);
    expect(view.openFor).toBe("/watch api");
  });

  it("T4.32 (C15 I1): a second open is refused, and the refusal names the command", () => {
    expect(view.open("/watch api")).toBeNull();
    const refusal = view.open("/watch db");
    expect(refusal, "a refusal, not a throw — C23 has to report it").toContain("/watch db");
    expect(overlays.stack, "and the first view is untouched").toHaveLength(1);
  });

  it("T4.33 (C22 I46): the window falls on block boundaries and move walks it", () => {
    view.open("/watch api");
    view.fill(docOf([chunk("a", "one"), chunk("b", "two"), chunk("c", "three")]));

    // Six rows of region, three-row blocks: two fit, and the third does not.
    expect(ids(), "the window, not the document").toEqual(["a", "b"]);

    expect(view.move("down")).toBe(true);
    expect(ids()).toEqual(["b", "c"]);
    expect(view.move("down"), "clamped at the last full window").toBe(false);
    expect(view.move("top")).toBe(true);
    expect(ids()).toEqual(["a", "b"]);
  });

  it("T4.34 (C22 I46): putBlock is total — an unknown id is false, never a throw", () => {
    view.open("/watch api");
    view.fill(docOf([chunk("a", "one")]));
    expect(() => view.putBlock("nosuch", chunk("nosuch", "x"))).not.toThrow();
    expect(view.putBlock("nosuch", chunk("nosuch", "x"))).toBe(false);
    expect(ids(), "and nothing was written").toEqual(["a"]);
  });

  it("T4.35 (C22 §13a): a block scrolled out of the window is still there to be patched", () => {
    // **The interaction this file exists for**, and it exists only because
    // block-boundary windowing and the refresh driver were put together. The
    // layer holds a window; the owner holds the document. A part scrolled out of
    // view is absent from `layer.content` and perfectly alive, so the seam has
    // to ask the owner — asking the layer would report a vanished host, the
    // driver would release the parts, and the reader would come back from a
    // scroll to a panel that had stopped refreshing.
    view.open("/watch api");
    view.fill(docOf([chunk("a", "one"), chunk("b", "two"), chunk("c", "three")]));

    view.move("down");
    view.move("down");
    expect(ids(), "`a` is out of the window").not.toContain("a");

    // The driver's two seams, against the block that is out of view.
    expect(view.blockAt("a"), "and still findable").not.toBeNull();
    expect(view.putBlock("a", chunk("a", "refreshed")), "and still patchable").toBe(true);

    view.move("top");
    const back = content()[0];
    expect(
      back?.kind === "panel" ? back.title : null,
      "the tick that landed while it was out of view is on screen when it returns",
    ).toBe("refreshed");
  });

  it("T4.40 (C22 I47): a block taller than the region is unscrollable, and says so", () => {
    // **The fixture is shown to be the trap before anything is asserted about
    // the remedy.** Without these two lines the row passes against a view that
    // scrolls perfectly well and happens to emit a notice — and it is the
    // *unscrollable* case I47 is about. `n` is refused, not unhelpful.
    view.open("/watch api");
    view.fill(docOf([tall("big", 12)]));
    expect(view.move("down"), "no second offset to move to — the motion is refused").toBe(false);
    expect(view.move("bottom"), "and `G` has nowhere to go either").toBe(false);

    // **The indicator is first, and that is not a stylistic choice.** The block
    // is taller than the region, so anything after it sits past the last row
    // and is the first thing C15 cuts — an indicator below would be truncated
    // by the truncation it reports.
    expect(ids()[0], "above the block it describes, or it is cut with it").toBe(
      "document-view-truncated",
    );
    expect(ids()).toEqual(["document-view-truncated", "big"]);
  });

  it("T4.41 (C22 I47): the count is what the reader cannot reach, wrap included", () => {
    view.open("/watch api");
    view.fill(docOf([tall("big", 12)]));

    const indicator = content()[0] as Block;
    const self = registry.measureSequence([indicator], REGION.width);
    // The notice wraps at 40 columns, which is the case the two passes exist
    // for: the indicator's own height is rows the block does not get, so a
    // hard-coded 1 would overstate what is on screen by exactly the wrap.
    expect(self, "the fixture wraps, or the two passes are untested here").toBeGreaterThan(1);

    // The block's cost is its own sequence height, which is what the view
    // compares against the region — reading `12` off the fixture would be
    // asserting the arithmetic rather than the frame.
    const block = content()[1] as Block;
    const rows = registry.measureSequence([block], REGION.width);
    const shown = REGION.height - self;
    expect(indicator.kind === "notice" ? indicator.text : "").toContain(String(rows - shown));
    // C04 I6 — a meaning tone needs a glyph, or the notice is colour alone.
    expect(indicator.kind === "notice" ? indicator.glyph : undefined).toBeDefined();
  });

  it("T4.42 (C22 I47): more blocks below is not truncation, and gets no indicator", () => {
    // The wolf-crying arm. `n` reaches these, so an indicator here would train
    // the reader to ignore the one case it matters for.
    view.open("/watch api");
    view.fill(docOf([chunk("a", "one"), chunk("b", "two"), chunk("c", "three")]));
    expect(ids()).toEqual(["a", "b"]);
    expect(view.move("down"), "and this one genuinely scrolls").toBe(true);
  });

  it("T4.36 (C22 I45): pop closes the view and leaves nothing behind", () => {
    view.open("/watch api");
    view.fill(docOf([chunk("a", "one")]));
    const before = redraws;
    expect(view.pop()).toBe(true);
    expect(overlays.stack, "the layer is gone").toHaveLength(0);
    expect(view.openFor, "and the owner holds nothing").toBeNull();
    expect(redraws, "a pop repaints").toBeGreaterThan(before);
    expect(view.pop(), "and popping nothing is false, not a throw").toBe(false);
    expect(view.putBlock("a", chunk("a", "x")), "a late tick finds no host").toBe(false);
  });
});

/**
 * Gap 7's core, with the real owner in the loop.
 *
 * F20 found that `RefreshHost`'s `view` arm ticks and has been tested since
 * C23 §3b, and that what did not exist was a **producer**. These rows drive the
 * producer: the driver's two seams are pointed at the document view exactly as
 * `execution.ts` points them, so a defect in the routing shows up here rather
 * than in a running shell.
 */
describe("C22 §13a — a live part hosted by a pushed view", () => {
  const SWEEP = 30_000;

  function wired() {
    const overlays = createOverlayManager({ registry });
    const transcript = createTranscriptStore();
    let now = 0;
    let fetches = 0;
    const timers: { fn: () => void; at: number; live: boolean }[] = [];

    const view = createDocumentView({
      overlays,
      measureSequence: (blks, width) => registry.measureSequence(blks, width),
      region: () => REGION,
      redraw: () => undefined,
    });

    const driver = createRefreshDriver({
      transcript,
      clock: () => now,
      schedule: (fn, ms) => {
        const t = { fn, at: now + ms, live: true };
        timers.push(t);
        return {
          [Symbol.dispose]: () => {
            t.live = false;
          },
        };
      },
      commit: () => undefined,
      append: () => undefined,
      stopping: () => false,
      // **The seams as `execution.ts` wires them** — through the owner, not the
      // layer. Copied deliberately rather than simplified: a test that pointed
      // them at `overlays` would be asserting about a wiring the shell does not
      // have.
      updateView: (id, blockId, next) =>
        id === DOCUMENT_VIEW_ID ? view.putBlock(blockId, next) : false,
      viewBlock: (id, blockId) => {
        const found = id === DOCUMENT_VIEW_ID ? view.blockAt(blockId) : null;
        return found !== null && found.kind === "panel" ? (found.children[0] ?? null) : null;
      },
    });

    return {
      view,
      driver,
      overlays,
      get fetches() {
        return fetches;
      },
      countFetch: () => {
        fetches += 1;
        return Promise.resolve(`tick ${String(fetches)}`);
      },
      async tick(ms = SWEEP): Promise<void> {
        now += ms;
        for (const t of timers.filter((x) => x.live && x.at <= now)) {
          t.live = false;
          t.fn();
        }
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      },
    };
  }

  const declare = (h: ReturnType<typeof wired>, id: string): void =>
    h.driver.declare({ kind: "view", id: DOCUMENT_VIEW_ID }, [
      {
        id,
        title: id,
        intervalMs: SWEEP,
        staleAfterMs: SWEEP * 2,
        fetch: h.countFetch,
        render: (data) => b.raw(String(data), { id: `${id}-c` }),
        renderError: (err) => b.raw(`err:${err.message}`, { id: `${id}-c` }),
      },
    ]);

  it("T4.37 (C24 I12, gap 7): a live part in a pushed view ticks, and the frame shows it", async () => {
    const h = wired();
    h.view.open("/watch api");
    h.view.fill(docOf([chunk("cpu", "loading"), chunk("b", "two")]));
    declare(h, "cpu");

    // **The instrument is proved able to go red before it is trusted.** This
    // row reduces to "did it tick", and three instruments lied in step 2 by
    // answering plausibly rather than truthfully — so the count is asserted to
    // be zero first, against the same expression that later asserts it moved.
    expect(h.fetches, "nothing has fetched before the first sweep").toBe(0);

    await h.tick();
    expect(h.fetches, "gap 7's core: the view host is driven").toBeGreaterThan(0);

    // Read off the frame rather than the counter, because a fetch that never
    // reaches the layer is a part that ticks and shows nothing.
    const panel = h.overlays.stack[0]?.content.find((x) => x.id === "cpu");
    const child = panel?.kind === "panel" ? panel.children[0] : null;
    expect(child?.kind === "raw" ? child.text : null).toBe("tick 1");
  });

  it("T4.38 (C22 I46): release at the pop stops the parts, before any later fetch would", async () => {
    const h = wired();
    h.view.open("/watch api");
    h.view.fill(docOf([chunk("cpu", "loading")]));
    declare(h, "cpu");
    await h.tick();
    const ticked = h.fetches;
    expect(ticked, "the control: it was running").toBeGreaterThan(0);

    // The order `keys.ts` uses: release, then dismiss.
    h.driver.release({ kind: "view", id: DOCUMENT_VIEW_ID });
    h.view.pop();

    for (let i = 0; i < 3; i += 1) await h.tick();
    expect(h.fetches, "and nothing survived the pop").toBe(ticked);
  });

  it("T4.39 (C22 §13a): a part scrolled out of the window keeps ticking", async () => {
    // T4.35 through the real driver. The layer holds two of three blocks, so
    // after two `down`s the part is off-window — and it must still be fetching,
    // because the seam asks the owner and the owner holds the document.
    const h = wired();
    h.view.open("/watch api");
    h.view.fill(docOf([chunk("cpu", "loading"), chunk("b", "two"), chunk("c", "three")]));
    declare(h, "cpu");
    await h.tick();
    const before = h.fetches;

    h.view.move("down");
    h.view.move("down");
    expect(
      h.overlays.stack[0]?.content.map((x) => x.id),
      "the part is genuinely out of the window",
    ).not.toContain("cpu");

    await h.tick();
    expect(h.fetches, "and it is still being driven").toBeGreaterThan(before);

    h.view.move("top");
    const panel = h.overlays.stack[0]?.content.find((x) => x.id === "cpu");
    const child = panel?.kind === "panel" ? panel.children[0] : null;
    expect(
      child?.kind === "raw" ? child.text : null,
      "and the tick that landed while it was hidden is on screen when it returns",
    ).toBe(`tick ${String(h.fetches)}`);
  });
});
