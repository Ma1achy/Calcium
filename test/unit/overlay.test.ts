// C15 tier 1 — unit. The stack's shape, and the geometry of one layer.
//
// §6's transition table is covered cell by cell across tiers 1 and 3. What is
// here is the shape after each call; the rejections are tier 3's.
import { describe, expect, it } from "vitest";

import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import type { Layer, OverlayChange } from "../../src/viewport/overlay/index.js";
import { REGION, anchored, centred, covering, panel, peek, placeIn, registry, rows } from "../support/overlay.js";
import { OverlayError } from "../../src/viewport/overlay/index.js";

const manager = () => createOverlayManager({ registry });

describe("C15 unit — the stack", () => {
  it("T1.1: push(overlay) on empty → one layer, and it is top", () => {
    const m = manager();
    m.push(centred("a", 3));
    expect(m.stack.map((l) => l.id)).toEqual(["a"]);
    expect(m.top?.id).toBe("a");
  });

  it("T1.23 (I21): a peek on empty → one layer and top is null; two peeks, still null", () => {
    const m = manager();
    m.push(peek("p1", 2, { row: 5, prefer: "below" }));
    expect(m.stack.map((l) => l.id)).toEqual(["p1"]);
    expect(m.top, "a peek is never top").toBeNull();
    m.push(peek("p2", 2, { row: 8, prefer: "below" }));
    expect(m.stack.map((l) => l.id)).toEqual(["p1", "p2"]);
    expect(m.top).toBeNull();
  });

  it("T1.24 (I21, I23): a peek pushed after an overlay sits beneath it; after a panel, beneath that; between the two, beneath both", () => {
    // Through `push`, in the order a real session produces: the confirm is up,
    // then focus moves and the peek opens.
    //
    // **The view arms are gone and the peek keeps its floor** (R-EXA-082,
    // F1254). A peek used to sit *above* the view and below everything else,
    // which made it the middle band of four; with the view band deleted the
    // peek is the bottom of three and every arm here reads the same way.
    const m = manager();
    m.push(anchored("confirm", 2, { row: 10, prefer: "above" }));
    m.push(peek("p", 2, { row: 5, prefer: "below" }));
    expect(m.top?.id, "the overlay keeps the keys").toBe("confirm");
    expect(m.stack.map((l) => l.id), "and the stack is sorted on the way in").toEqual(["p", "confirm"]);
    expect(m.layout(REGION).map((p) => p.layer.id), "placed bottom-first, peek beneath").toEqual(["p", "confirm"]);

    const v = manager();
    v.push(panel("menu", 3, { row: 20, prefer: "above" }));
    v.push(peek("p", 2, { row: 5, prefer: "below" }));
    expect(v.top?.id, "the panel takes keys, so it is still top").toBe("menu");
    expect(v.layout(REGION).map((p) => p.layer.id), "peek beneath the panel").toEqual(["p", "menu"]);

    v.push(anchored("advisory", 2, { row: 10, prefer: "above" }));
    expect(v.layout(REGION).map((p) => p.layer.id), "peek, panel, overlay").toEqual(["p", "menu", "advisory"]);
    expect(v.top?.id).toBe("advisory");
  });

  it("T1.25 (I21, I3): pop never removes a peek; dismiss does, and emits dismiss rather than pop", () => {
    const m = manager();
    const changes: OverlayChange[] = [];
    m.subscribe((c) => changes.push(c));
    m.push(peek("p", 2, { row: 5, prefer: "below" }));
    m.push(centred("menu", 2, { width: 20 }));
    expect(m.pop()?.id, "the overlay goes").toBe("menu");
    expect(m.stack.map((l) => l.id), "the peek stays").toEqual(["p"]);
    expect(m.pop(), "nothing keyed to pop").toBeNull();
    expect(m.stack.map((l) => l.id), "and the peek still stays").toEqual(["p"]);
    m.dismiss("p");
    expect(m.stack).toEqual([]);
    expect(changes.filter((c) => c.kind === "pop").map((c) => c.id), "pop named the overlay only").toEqual(["menu"]);
    expect(changes.at(-1)).toEqual({ kind: "dismiss", id: "p", reason: "explicit" });
  });

  it("T1.26 (I22): a centred peek is refused at push, and at update the layer is left as it was", () => {
    const m = manager();
    expect(() =>
      m.push({ id: "c", kind: "peek", placement: { kind: "centred" }, content: rows(1, "c"), blocking: false, dismissal: "focus", width: 20 }),
    ).toThrow(OverlayError);
    expect(m.stack, "it did not land").toEqual([]);

    const ok = peek("p", 1, { row: 5, prefer: "below" });
    m.push(ok);
    // With a width, so the refusal is I22's and not I20's.
    expect(() => m.update("p", { placement: { kind: "centred" }, width: 20 })).toThrow(OverlayError);
    expect(m.stack[0], "the survivor is exactly the pushed layer").toEqual(ok);
    // The control: the same update on an overlay is legal, so the refusal is the peek's.
    const o = manager();
    o.push(anchored("a", 1, { row: 5, prefer: "below" }));
    expect(o.update("a", { placement: { kind: "centred" }, width: 20 })).toBe(true);
  });

  it("T1.2: an overlay on empty → one layer, it is top, and layout places it", () => {
    // **Re-aimed off `hasView`** (R-EXA-082, F1254), **then off `fill`**
    // (parked 3): what is left is the stack holding and exposing one layer.
    const m = manager();
    m.push(anchored("dash", 3, { row: 5, prefer: "below" }));
    expect(m.stack.map((l) => l.id)).toEqual(["dash"]);
    expect(m.top?.id).toBe("dash");
    expect(m.layout(REGION)[0]).toMatchObject({ top: 6, left: 0, height: 3, width: REGION.width });
  });

  it("T1.3: two overlays → LIFO, the second is top", () => {
    const m = manager();
    m.push(centred("a", 3));
    m.push(centred("b", 3));
    expect(m.stack.map((l) => l.id)).toEqual(["a", "b"]);
    expect(m.top?.id).toBe("b");
  });

  it("T1.4 (I23): an overlay over a panel is top, and the panel stays beneath it", () => {
    const m = manager();
    m.push(panel("menu", 3, { row: 20, prefer: "above" }));
    m.push(centred("confirm", 3));
    expect(m.top?.id).toBe("confirm");
    expect(m.layout(REGION).map((p) => p.layer.id), "bottom-first").toEqual(["menu", "confirm"]);
  });

  it("T1.5: pop with two overlays removes the top one only", () => {
    const m = manager();
    m.push(centred("a", 3));
    m.push(centred("b", 3));
    expect(m.pop()?.id).toBe("b");
    expect(m.stack.map((l) => l.id)).toEqual(["a"]);
  });

  it("T1.6: pop with only one overlay → empty", () => {
    const m = manager();
    m.push(covering("dash"));
    expect(m.pop()?.id).toBe("dash");
    expect(m.stack).toEqual([]);
  });

  it("T1.7 (I13): dismiss removes a layer at any depth, and so does the disposable", () => {
    const m = manager();
    const handle = m.push(centred("a", 3));
    m.push(centred("b", 3));
    m.push(centred("c", 3));

    m.dismiss("b");
    expect(m.stack.map((l) => l.id)).toEqual(["a", "c"]);

    handle[Symbol.dispose]();
    expect(m.stack.map((l) => l.id)).toEqual(["c"]);
  });

  it("T1.8 (I23): pop with a panel plus an overlay takes the overlay first", () => {
    const m = manager();
    m.push(panel("menu", 3, { row: 20, prefer: "above" }));
    m.push(centred("confirm", 3));
    expect(m.pop()?.id).toBe("confirm");
    expect(m.pop()?.id).toBe("menu");
  });

  it("T1.9 (I3): pop on a non-dismissable top → null, stack unchanged", () => {
    const m = manager();
    m.push(centred("menu", 3));
    m.push(centred("confirm", 3, { blocking: true, dismissal: "answer" }));

    expect(m.pop()).toBeNull();
    expect(m.stack.map((l) => l.id)).toEqual(["menu", "confirm"]);
  });

  it("T1.9b (I3): pop does not search downwards past a non-dismissable top", () => {
    // The reading of "the topmost dismissable layer" that closes the menu
    // underneath an unanswered confirm. It is a one-word difference in the spec
    // and the whole of T6.11.
    const m = manager();
    m.push(centred("menu", 3));
    m.push(centred("confirm", 3, { blocking: true, dismissal: "answer" }));

    m.pop();
    expect(m.stack.map((l) => l.id)).toContain("menu");
  });

  it("T1.10: dismiss removes a non-dismissable layer — explicit resolution always works", () => {
    const m = manager();
    m.push(centred("confirm", 3, { blocking: true, dismissal: "answer" }));
    m.dismiss("confirm");
    expect(m.stack).toEqual([]);
  });
});

describe("C15 unit — one layer's geometry", () => {
  it("T1.12 (I14): update changes a layer and nothing about the stack", () => {
    const m = manager();
    m.push(panel("menu", 3, { row: 20, prefer: "above" }));
    m.push(centred("a", 3));
    m.push(centred("b", 3));

    const changes: OverlayChange[] = [];
    m.subscribe((c) => changes.push(c));

    const before = m.stack.map((l) => l.id);
    expect(m.update("a", { content: [] })).toBe(true);

    expect(m.stack.map((l) => l.id)).toEqual(before);
    expect(m.top?.id).toBe("b");
    expect(changes).toEqual([{ kind: "content", id: "a" }]);
  });

  it("T1.13 (I14): LayerUpdate cannot carry dismissable", () => {
    const m = manager();
    m.push(centred("confirm", 3, { blocking: true, dismissal: "answer" }));

    // @ts-expect-error — I14: escapability does not change mid-life, and the
    // only form that restriction can take is the type rejecting the field.
    m.update("confirm", { dismissal: "escape" });

    expect(m.stack[0]?.dismissal).toBe("answer");
  });

  it("T1.14 (I16): content is measured at the resolved width, not the region's", () => {
    const narrow = 24;
    const layer = centred("wide", 0, { width: narrow });
    const wrapping = {
      ...layer,
      content: [
        {
          kind: "notice" as const,
          id: "wide-0",
          tone: "info" as const,
          text: "a line long enough to wrap at twenty-four columns and not at sixty",
        },
      ],
    };

    // The control: this fixture's height genuinely differs between the two
    // widths. Without it the assertion below passes against a block that
    // measures one row everywhere, and reports that width was honoured.
    expect(registry.measureSequence(wrapping.content, narrow)).toBeGreaterThan(
      registry.measureSequence(wrapping.content, REGION.width),
    );

    const [p] = placeIn([wrapping]);
    expect(p?.width).toBe(narrow);
    expect(p?.height).toBe(registry.measureSequence(wrapping.content, narrow));
  });

  it("T1.15 (I16, I6): a centred layer's left is the remainder halved", () => {
    const [p] = placeIn([centred("c", 4, { width: 40 })]);
    expect(p?.left).toBe(10);
    expect(p?.width).toBe(40);
  });

  it("T1.21 (I20): a centred layer with no width is refused, and the frame says why", () => {
    // **The throw and the state it prevents, in one row.** A row asserting only
    // the throw says nothing about why the state is wrong, and the reason is
    // not arithmetic — an absent width resolves to the region's (I16), so the
    // layer is placed at `left` 0 across the whole region and is an anchored
    // layer's column span wearing `centred`'s name. The control is the same
    // layer with a width, read for a `left` that differs from a region-width
    // anchored layer's.
    const m = manager();
    expect(() =>
      m.push({
        id: "wide",
        kind: "overlay",
        placement: { kind: "centred" },
        content: rows(3, "wide"),
        blocking: false,
        dismissal: "escape",
      }),
    ).toThrow(/declares no width/);
    expect(m.stack, "and nothing reached the stack").toEqual([]);

    const [declared] = placeIn([centred("c", 3, { width: 40 })]);
    const [spanning] = placeIn([anchored("f", 3, { row: 5, prefer: "below" })]);
    expect(declared?.left, "the state I20 forbids is this one").not.toBe(spanning?.left);
    expect(spanning?.left).toBe(0);
  });

  it("T1.22 (I20): an update to centred without a width is refused, and the layer survives", () => {
    // **The route the push-time check cannot see**, because `LayerUpdate`
    // admits `placement`. The assertion on the survivor is the half that
    // matters: a guard that throws having already written leaves a layer
    // neither placed nor removed.
    const m = manager();
    const before = anchored("a", 3, { row: 5, prefer: "below" });
    m.push(before);

    expect(() => m.update("a", { placement: { kind: "centred" } })).toThrow(/declares no width/);
    expect(m.top, "unchanged, not half-updated").toEqual(before);

    // The same update carrying a width is accepted, so the row is about the
    // width and not about `placement` being rejected wholesale.
    expect(m.update("a", { placement: { kind: "centred" }, width: 30 })).toBe(true);
    expect(m.top?.placement).toEqual({ kind: "centred" });
  });
});

describe("C15 §2b — approval is a layer, owed at the spec commit", () => {
  it.todo(
    "T1.27 (C15 I24, §2b): approvalPrompt's options through the confirm host produce an overlay whose blocks are the invocation notice, the warn consequence when supplied and none when not, and the host's 3-column choice table with always allow as an ordinary row; activeTarget answers overlay; deny pops it and the entry reads denied — not deferred on a component: approvalPrompt lands with C4 of the call grammar",
  );
});

describe("C15 §2c — blocking and dismissal are two fields (M8)", () => {
  it("T1.29 (I26, R-QST-001, R-BLK-822): the two fields are the layer's, and neither is the other", () => {
    // **The pair `dismissable` could not hold.** One flag answered *owns
    // input*, *is closed by esc* and *takes the keys first* at once, and it was
    // right only while those three agreed. These two layers are the case where
    // they do not: a full-region layer that owns nothing, and a one-row typed
    // reply that owns everything.
    const m = manager();

    const wide: Layer = covering("wide", REGION.height);
    m.push(wide);
    expect(m.top?.blocking, "large and owning nothing").toBe(false);

    // §101's typed reply: it blocks, it floats above a live prompt, and it is
    // still not escapable — the combination that proves the fields are two.
    const reply: Layer = {
      id: "reply",
      kind: "overlay",
      placement: { kind: "anchored", row: 20, rows: 1, prefer: "above" },
      content: rows(1, "reply"),
      blocking: true,
      dismissal: "answer",
    };
    m.push(reply);
    expect(m.top?.id).toBe("reply");
    expect(m.top?.blocking, "one row and owning input").toBe(true);
    expect(m.top?.dismissal).toBe("answer");
    // Anchored, so it is above the prompt rather than over it — floating and
    // blocking at once, which no single flag can say.
    expect(m.top?.placement.kind).toBe("anchored");

    // **Neither is derivable from the other, in both directions.** The routing
    // half — that C16's step 3 reads `blocking` and measures no box — is
    // T1.31 in `router-dispatch.test.ts`; this is the half about the record.
    expect(
      m.stack.map((l) => `${l.id}:${String(l.blocking)}:${l.dismissal}`),
      "four combinations would be expressible and two are used here",
    ).toEqual(["wide:false:escape", "reply:true:answer"]);
  });

  it("T1.30 (I3, I26): pop answers three ways, because dismissal has three values", () => {
    // The old row asserted two of the three because only two existed.
    const m = manager();
    m.push(peek("beside", 2, { row: 5, prefer: "below" }));
    m.push(centred("menu", 3));
    expect(m.pop()?.id, "escape: removed").toBe("menu");

    m.push(centred("question", 3, { blocking: true, dismissal: "answer" }));
    expect(m.pop(), "answer: left where it is").toBeNull();
    expect(m.stack.map((l) => l.id)).toEqual(["beside", "question"]);

    // And `focus`, which `pop` never reaches at all — a peek is not `top`
    // (I21), so the question above it is what `pop` inspected both times.
    m.dismiss("question");
    expect(m.top, "a peek is never top").toBeNull();
    expect(m.pop(), "focus: nothing for esc to take").toBeNull();
    expect(m.stack.map((l) => l.id)).toEqual(["beside"]);
  });

  it("T1.31 (I27, R-BLK-779): a panel is one triple, refused at both entry points", () => {
    const base = panel("p", 2, { row: 10, prefer: "above" });
    const m = manager();

    // The control first, so the three refusals below are not satisfied by a
    // guard that refuses every panel.
    m.push(base);
    expect(m.top?.id, "the anchored non-blocking escape one is accepted").toBe("p");
    m.dismiss("p");

    const refused: readonly Layer[] = [
      { ...base, placement: { kind: "centred" }, width: 30 },
      { ...base, blocking: true },
      { ...base, dismissal: "answer" },
    ];
    for (const layer of refused) {
      expect(
        () => m.push(layer),
        `${layer.placement.kind}/${String(layer.blocking)}/${layer.dismissal} is not a panel`,
      ).toThrow(OverlayError);
      expect(m.stack, "and nothing is left behind").toEqual([]);
    }

    // **`update` too, because `LayerUpdate` admits `placement`** (I20's own
    // argument, applied to the kind's triple). A panel pushed anchored and
    // updated to centred reaches the refused state by a route the push-time
    // check cannot see.
    m.push(base);
    expect(() => m.update("p", { placement: { kind: "centred" }, width: 30 })).toThrow(
      OverlayError,
    );
    expect(m.top?.placement.kind, "unchanged, not half-updated").toBe("anchored");
  });

  it("T1.32 (I28, R-BLK-873): a blocking arrival closes the panels first, each on its own change", () => {
    const m = manager();
    const seen: OverlayChange[] = [];

    m.push(peek("beside", 2, { row: 5, prefer: "below" }));
    m.push(panel("menu", 3, { row: 20, prefer: "above" }));
    using _sub = m.subscribe((c) => void seen.push(c));

    m.push(centred("question", 3, { blocking: true, dismissal: "answer" }));
    expect(m.stack.map((l) => l.id), "the peek stays; the panel is gone").toEqual([
      "beside",
      "question",
    ]);
    // **Before the push returned**, and each with its own id — an owner runs
    // its own teardown, and one collective change would name none of them.
    expect(seen).toEqual([
      { kind: "dismiss", id: "menu", reason: "explicit" },
      { kind: "push", id: "question", layerKind: "overlay" },
    ]);

    // **The control, and it is what scopes the rule.** A non-blocking arrival
    // leaves the panel alone — so the subject is the arriving layer's
    // `blocking`, not the presence of a panel.
    m.dismiss("question");
    seen.length = 0;
    m.push(panel("menu2", 3, { row: 20, prefer: "above" }));
    m.push(centred("advisory", 3));
    expect(m.stack.map((l) => l.id)).toEqual(["beside", "menu2", "advisory"]);
  });

  it("T1.28 (I25): every removal emits one change with the layer's id before the call returns, and a removal of nothing emits nothing", () => {
    // **Moved off C28's pushed view** (R-EXA-082, F1254). It was written there
    // because that owner's state was a raised profiler tier and a running
    // timer — the two things a stale owner costs the most — and there is no
    // such owner. What the row is about survives the move: the change arrives
    // **before the call returns**, so an owner that tears down from the stream
    // is already torn down when the non-owner who popped it reads the stack.
    //
    // The owner here keeps a flag and nothing else. A richer one would be a
    // better story and a worse row: the claim is about the ordering of an
    // emission against a return, and state that takes work to build invites
    // asserting the work instead.
    const m = manager();
    const changes: OverlayChange[] = [];
    let open = false;
    m.subscribe((c) => {
      changes.push(c);
      if ((c.kind === "pop" || c.kind === "dismiss") && c.id === "owned") open = false;
    });

    // A non-owner's `pop()`.
    m.push(centred("owned", 3));
    open = true;
    const n = changes.length;
    expect(m.pop()?.id).toBe("owned");
    expect(changes.slice(n)).toEqual([{ kind: "pop", id: "owned", layerKind: "overlay" }]);
    expect(open, "the owner had already torn down when `pop()` returned").toBe(false);

    // `dismiss(id)` on the same layer: one `dismiss`, with its reason.
    m.push(centred("owned", 3));
    open = true;
    const k = changes.length;
    m.dismiss("owned");
    expect(changes.slice(k)).toEqual([{ kind: "dismiss", id: "owned", reason: "explicit" }]);
    expect(open).toBe(false);

    // An id not on the stack: nothing at all.
    const j = changes.length;
    m.dismiss("never-pushed");
    expect(changes.slice(j)).toEqual([]);
  });

  it("T1.33 (I23, R-BLK-779): peek · panel · overlay, bottom-first, from every push order", () => {
    // *overlay › panel › peek › base*, read from the other end. Asserted as the
    // whole sequence rather than as a pair, because a partition that puts one
    // band in the right place and another in the wrong one satisfies every
    // pairwise check written about the band that moved.
    const build = (): readonly Layer[] => [
      peek("beside", 2, { row: 5, prefer: "below" }),
      panel("menu", 3, { row: 20, prefer: "above" }),
      // **Non-blocking, because I28 makes the other pair unconstructible.** A
      // blocking arrival closes the panels first, so *a panel beneath a
      // question* is a stack this component will not hold — and a row that
      // used one would be asserting the sort over three bands while claiming
      // four. The overlay band is exercised by an escapable advisory instead.
      centred("advisory", 3),
    ];
    // **Every permutation, because nothing is pinned to first any more.** The
    // view was, because `push` refused one onto a non-empty stack — so the old
    // sequences all began `0` and the sort was exercised over three free
    // members of four. With the kind gone (R-EXA-082, F1254) the three bands
    // arrive in any order a session produces, so the row walks all six.
    const order: readonly (readonly number[])[] = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    for (const seq of order) {
      const m = manager();
      const layers = build();
      for (const i of seq) m.push(layers[i] as Layer);
      expect(m.stack.map((l) => l.id), `pushed ${seq.join("")}`).toEqual([
        "beside",
        "menu",
        "advisory",
      ]);
    }
  });
});
