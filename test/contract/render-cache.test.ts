// C22 §6c — the render cache's two C13 arms, and why a render count cannot see
// them.
//
// **This row exists because the first version of it was inert.** It was written
// against a session, asserting that a cleared entry is not rendered again — and
// removing the `clear` arm entirely left it green, because an evicted or cleared
// entry is gone from the transcript and `visibleRows` never asks for it. The
// claim is about **memory**, and a render count cannot express memory.
//
// So the subject is `size`, on C14's precedent: `Viewport.stats` exposes
// `cacheSize` for exactly this reason, and C14 T2.3b asserts `size ≤
// entries.length` against it. A cache whose bound is *by construction* still
// needs the construction to be observable, or the claim is a comment.
//
// Against the real graph, so the **subscription in `construct.ts` is what is
// under test** rather than the class's own methods — a test that calls the
// mechanism misses the wiring.
import { describe, expect, it } from "vitest";

import { buildGraph } from "../support/session.js";
import { baselineOf } from "../../src/shell/cameras.js";
import { CAMERA_DEFAULT } from "../../src/data/viewmodel/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";

/** One key, as the decoder would deliver it (C22 I24 — events, never bytes). */
const press = (name: string): InputEvent => ({
  kind: "key",
  key: { name, ctrl: false, meta: false, shift: false, sequence: name },
});
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";

const doc = (id: string) => ({
  schema: "tui.view/1" as const,
  command: `/${id}`,
  status: "ok" as const,
  blocks: [{ kind: "notice" as const, id: `n-${id}`, tone: "info" as const, text: id }],
  meta: {
    verb: id,
    adapter: "test",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: [id],
    stderr: "",
    transport: "local" as const,
    origin: "user" as const,
  },
});

/** A plot with a camera, so the live entry has something focusable (C12 I85). */
const PLOT_DOC = {
  schema: "tui.view/1" as const,
  command: "/loss",
  status: "ok" as const,
  blocks: [
    {
      kind: "plot" as const,
      id: "p",
      form: "line" as const,
      height: 3,
      camera: { azimuth: 0 },
      series: [{ label: "s", values: [1, 2, 3] }],
    },
  ] as unknown[],
  meta: {
    verb: "loss",
    adapter: "test",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: ["loss"],
    stderr: "",
    transport: "local" as const,
    origin: "user" as const,
  },
};

describe("C22 §6c — the camera, and the two halves separated", () => {
  // **The pair has to be separable or neither half is asserted.** A camera
  // reaching a frame needs three things — a store that keys, a binding that
  // writes it, and `session.ts` composing the key into the slot — and an
  // end-to-end row dies to all three without saying which. These two rows each
  // hold exactly one; the third has one witness and T4.17g says so.
  it("T4.17e (C22 I71): the key alone — the store moved, no key pressed", async () => {
    // **Deliberately around the binding.** It nudges the store directly, so it
    // survives the binding being deleted and can only be about what the key
    // says.
    const { graph } = await buildGraph();
    const id = graph.transcript.append(PLOT_DOC as never);
    expect(graph.cameras.key(id), "an untouched entry keys as nothing").toBe("");

    graph.cameras.nudge(id, "p", { azimuth: 0 }, { azimuth: 0.5 });
    expect(graph.cameras.key(id), "a turned camera keys").not.toBe("");

    // **Baselines omitted, not zeros — the one rule this store could not inherit
    // from `ScrollOffsets`.** There zero *is* the absent state; here the absent
    // state is the block's own declared view, and `distance: 0` is a degenerate
    // camera rather than an absent one. A camera returned to its baseline renders
    // identically to one never touched, so keying them apart would give one
    // appearance two slots — a cache that misses on every frame while every
    // correctness assertion still passes (`focusKey`'s own warning).
    graph.cameras.nudge(id, "p", { azimuth: 0 }, { azimuth: -0.5 });
    expect(graph.cameras.key(id), "back to the baseline keys as untouched").toBe("");

    // And its control: **the baseline is not zero**. A camera sitting at
    // `azimuth: 0` with a *declared* azimuth of 0.5 has moved, and a key that
    // omitted zeros rather than baselines would call this untouched.
    const other = graph.transcript.append(PLOT_DOC as never);
    graph.cameras.nudge(other, "p", { azimuth: 0.5 }, { azimuth: -0.5 });
    expect(graph.cameras.key(other), "at zero, away from a non-zero baseline").not.toBe("");
  });

  it("T2.4c (C04 I75): the baseline is the block's declared view, completed", async () => {
    // **The member is the INITIAL view and the store is what makes that true.**
    // A block declaring nothing is drawn from `CAMERA_DEFAULT`; one declaring a
    // `Partial` is drawn from the default with those fields replaced — so a
    // partial and the full equivalent are **one view rather than two**, which is
    // what `Partial<Camera>` costs if it is four independent fallbacks instead
    // of one completion.
    expect(baselineOf(undefined)).toEqual(CAMERA_DEFAULT);
    expect(baselineOf({ elevation: 0.25 })).toEqual({ ...CAMERA_DEFAULT, elevation: 0.25 });
    expect(baselineOf({ ...CAMERA_DEFAULT, elevation: 0.25 })).toEqual(baselineOf({ elevation: 0.25 }));

    // **And the degenerate values are in the set on purpose.** `distance: 0` is
    // a camera at the target and `projection: "orthographic"` ignores distance
    // entirely; both are views a caller may declare, and neither is *absent*.
    // A completion that treated a falsy field as unstated would replace them.
    expect(baselineOf({ distance: 0 }).distance, "zero is a declaration").toBe(0);
    expect(baselineOf({ azimuth: 0 }).azimuth, "so is a zero azimuth").toBe(0);
  });

  it("T4.17f (C22 I71): the writer alone — a key pressed, nothing keyed", async () => {
    // **Asserted on `forEntry` and never on `key`**, so it survives the key
    // being emptied and can only be about whether a keystroke reaches the store.
    const { graph } = await buildGraph();
    graph.transcript.append(PLOT_DOC as never, { streaming: true });
    const id = graph.transcript.liveId as string;

    // **The element is asserted before the keystroke**, because a row that
    // pressed `[` and found nothing could be failing for either reason — the
    // binding, or a plot nothing can focus. C12 I85 is what puts an element
    // here at all, and it is the half this row would otherwise blame the
    // binding for.
    expect(graph.liveElements().map((e) => e.blockId), "the plot is focusable").toEqual(["p"]);

    // `↓` from the prompt past history's bottom enters the live block (C16 I22).
    graph.router.dispatch(press("down"));
    expect(graph.router.target, "focus is in the block").toBe("liveBlock");
    expect(graph.cameras.forEntry(id)["p"], "nothing has moved yet").toBeUndefined();

    graph.router.dispatch(press("["));
    const after = graph.cameras.forEntry(id)["p"];
    expect(after, "the binding reached the store").toBeDefined();
    expect(after?.azimuth, "one step left of the declared azimuth").toBeCloseTo(-Math.PI / 8, 10);
  });
});

describe("C22 §6c — the cache's C13 arms", () => {
  // **The `evict` arm is not drivable at this seam, and that is the finding
  // rather than a gap to paper over.** C13's cap is 100,000 blocks (C13 I17) and
  // `construct.ts` passes no cap at all — `createTranscriptStore` accepts one and
  // the only option threaded through is `retainPayloads`. So reaching an
  // eviction through the real graph would take 100,001 appends, and there is no
  // configuration that makes it cheaper.
  //
  // What is covered here is the **subscription**, through `clear`, which runs
  // the same callback in the same wiring; what is not covered is the `evict`
  // branch inside it. `delete` itself is exercised below at the class level.
  // Naming the half that is untested rather than letting a passing file imply
  // both — a citation reads as coverage.
  it("T4.18a (I58): the class deletes one slot and leaves its neighbours", async () => {
    const { graph } = await buildGraph();
    const a = graph.transcript.append(doc("one"));
    const b = graph.transcript.append(doc("two"));
    graph.rendered.set(a, 0, 80, "", "t", ["a"]);
    graph.rendered.set(b, 0, 80, "", "t", ["b"]);
    expect(graph.rendered.size, "two slots held").toBe(2);

    graph.rendered.delete(a);

    expect(graph.rendered.size, "one gone").toBe(1);
    expect(graph.rendered.get(a, 0, 80, "", "t"), "the deleted one").toBeUndefined();
    expect(graph.rendered.get(b, 0, 80, "", "t"), "and its neighbour stayed").toEqual(["b"]);
  });

  // **The fourth axis, and the audit that found it.** *A cache key is wrong
  // until you have listed everything the render reads.* Listed against
  // `visibleRows`: the registry (sealed), the blocks (`rev`), the width, the
  // window range, the theme, the focus — all keyed — and `capabilities`, which
  // is not. The file's own header refutes the argument that would have excused
  // it: *both are about height*, said of theme **and** capabilities, and only
  // theme was then added.
  //
  // The omission is safe, and for a fact the header did not state: the record is
  // built once at construction step 2 and nothing in `src/` reassigns it. That
  // is `ctx.tick`'s treatment one paragraph below — *the axis is absent and the
  // value is constant together, and threading either obliges the other* — and
  // these two rows are what stop it going quiet.
  it("T4.18c (I58): capabilities is an appearance axis, so its absence is load-bearing", async () => {
    const { graph } = await buildGraph();
    // **A `rule`, and the fixture was changed after it failed to respond.** The
    // first draft used the `notice` above and the two renderings were byte-identical:
    // it draws text and a tone, and neither moves with `unicode`. A fixture must be
    // shown to respond to the thing under test before it is asserted against
    // (`test/support/README.md`), and this is the third instance of that rule.
    // `rule` draws `g.horizontal` — `─` at full, `-` at ascii.
    const blocks = [{ kind: "rule" as const, id: "r", label: "one" }];
    const render = (capabilities: typeof graph.capabilities): readonly string[] =>
      renderSequenceToLines(graph.blocks, blocks, 80, {
        theme: graph.theme.current,
        capabilities,
        focus: null,
      });

    expect(
      render({ ...graph.capabilities, unicode: "ascii" }),
      "the same block draws differently under a different capability record",
    ).not.toEqual(render({ ...graph.capabilities, unicode: "full" }));
  });

  it("T4.18d (I58): and the record never moves, which is the whole of why the key may omit it", async () => {
    // **The premise asserted rather than described** (C26 §8b.8's shape). A
    // re-detect on resize, or a `/ascii` toggle, makes this row fail — and that
    // is the day the key needs the axis T4.18c says matters.
    //
    // **`ambiguousWidth` rides on this row** (C02 I9), and deliberately gets no
    // row of its own: it is a field of the record this asserts the identity of,
    // so a second assertion would be one rule expressed twice — the shape C02 I7
    // had to be allow-listed for. A verb that toggled it would invalidate every
    // measured height and C14's whole index, and this is where that fails.
    const { graph, resize } = await buildGraph();
    const before = graph.capabilities;
    let resized = 0;
    graph.lifecycle.onResize(() => { resized += 1; });

    graph.theme.setTheme("light");
    resize({ columns: 120, rows: 40 });

    // **Both events asserted to have happened**, or the row is an identity
    // check across nothing — a `setTheme` that silently no-opped and a resize
    // the fake swallowed would leave it green and vacuous.
    expect(graph.theme.current.name, "the theme moved").toBe("prism/light");
    expect(resized, "and the resize was delivered").toBeGreaterThan(0);

    expect(graph.capabilities, "the same record, not an equal one").toBe(before);
  });

  it("T4.18e (C04 I48): the offset key is canonical — one state, one string", async () => {
    // **Retitled, because the first name claimed the wiring and this row is
    // about the store.** *Scroll, read, scroll back, read* is
    // `test/integration/scroll-wiring.test.ts` T4.41, which pages a session and
    // reads the screen; deleting the offset from `session.ts`'s slot changes
    // nothing here. What this row does hold is real and is a defect it found:
    // an entry scrolled down and back held `box=0` where an untouched one held
    // nothing, so one appearance keyed two slots and the frame a reader returns
    // to was re-rendered rather than found. That is `focusKey`'s own warning
    // above — a cache that misses on every frame while every assertion about
    // correctness still passes — and it was surfaced by a mutation hunting
    // something else, so the assertion is written down here to keep it fixed.
    // **A single scroll passes with the key unchanged.** The first render fills
    // the slot; the second, at a new offset, misses on nothing else and is
    // served the frame it left — so a row that scrolled once and compared the
    // two would see a difference and agree with the defect. The state that
    // separates them is *back where you started*: with the offset in the key
    // the third read is a hit on the first slot and equals it; without it, the
    // second read already equalled the first and the assertion below is what
    // catches that.
    //
    // Third instance of focus's own story (C22 §6c) — a fact the render reads
    // that moves nothing in `(entry, rev, width, focus, theme)`.
    const { graph } = await buildGraph();
    const id = graph.transcript.append({
      ...doc("one"),
      blocks: [
        {
          kind: "scroll" as const,
          id: "box",
          height: 2,
          children: [
            { kind: "raw" as const, id: "a", text: "AAA" },
            { kind: "raw" as const, id: "b", text: "BBB" },
            { kind: "raw" as const, id: "c", text: "CCC" },
            { kind: "raw" as const, id: "d", text: "DDD" },
          ],
        },
      ],
    });

    const key = (): string => graph.scrollOffsets.key(id);
    const top = key();
    graph.scrollOffsets.nudge(id, "box", 2);
    const moved = key();
    graph.scrollOffsets.nudge(id, "box", -2);

    expect(moved, "the offset reaches the key at all").not.toBe(top);
    expect(key(), "and a round trip is byte-identical, not merely equivalent").toBe(top);
    expect(top, "which is empty for an entry nobody scrolled").toBe("");

    // Two containers, because a single one cannot show an ordering defect: a
    // Map's insertion order would key one state two ways, and the sort is what
    // stops it.
    graph.scrollOffsets.nudge(id, "z", 1);
    graph.scrollOffsets.nudge(id, "a", 1);
    const forward = key();
    graph.scrollOffsets.nudge(id, "z", 0);
    expect(key(), "and is stable under a later touch that changes nothing").toBe(forward);
    expect(forward, "sorted, not insertion-ordered").toBe("a=1,z=1");
  });

  it("T4.18f (C04 I48): the offsets drop on the same subscription as the rendered rows", async () => {
    // **One callback for both**, so a future eviction path cannot reach one and
    // miss the other. Driven through `clear`, which is the arm the real graph
    // can reach (T4.18a's note explains why `evict` is not drivable here).
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc("one"));
    graph.rendered.set(id, 0, 80, "", "t", ["row"]);
    graph.scrollOffsets.nudge(id, "box", 3);
    expect(graph.scrollOffsets.size, "one entry holding an offset").toBe(1);

    graph.transcript.clear();

    expect(graph.rendered.size, "the rows went").toBe(0);
    expect(graph.scrollOffsets.size, "and the offsets went with them").toBe(0);
  });

  it("T4.18b (I58): clear drops every slot", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc("one"));
    graph.rendered.set(id, 0, 80, "", "t", ["row"]);
    expect(graph.rendered.size, "one slot held").toBe(1);

    graph.transcript.clear();

    expect(graph.rendered.size, "and none after /clear").toBe(0);
  });
});
