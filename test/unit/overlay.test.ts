// C15 tier 1 — unit. The stack's shape, and the geometry of one layer.
//
// §6's transition table is covered cell by cell across tiers 1 and 3. What is
// here is the shape after each call; the rejections are tier 3's.
import { describe, expect, it } from "vitest";

import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import type { OverlayChange } from "../../src/viewport/overlay/index.js";
import { REGION, anchored, centred, peek, placeIn, registry, rows, view } from "../support/overlay.js";
import { OverlayError } from "../../src/viewport/overlay/index.js";

const manager = () => createOverlayManager({ registry });

describe("C15 unit — the stack", () => {
  it("T1.1: push(overlay) on empty → one layer, it is top, no view", () => {
    const m = manager();
    m.push(centred("a", 3));
    expect(m.stack.map((l) => l.id)).toEqual(["a"]);
    expect(m.top?.id).toBe("a");
    expect(m.hasView).toBe(false);
  });

  it("T1.23 (I21): a peek on empty → one layer and top is null; two peeks, still null", () => {
    const m = manager();
    m.push(peek("p1", 2, { row: 5, prefer: "below" }));
    expect(m.stack.map((l) => l.id)).toEqual(["p1"]);
    expect(m.top, "a peek is never top").toBeNull();
    m.push(peek("p2", 2, { row: 8, prefer: "below" }));
    expect(m.stack.map((l) => l.id)).toEqual(["p1", "p2"]);
    expect(m.top).toBeNull();
    expect(m.hasView).toBe(false);
  });

  it("T1.24 (I21, I23): a peek pushed after an overlay sits beneath it; after a view, above it; between the two, between them", () => {
    // Through `push`, in the order a real session produces: the confirm is up,
    // then focus moves and the peek opens. I2's sort was unreachable through
    // `push` (T2.8's reason); I23's is not, and that is why this row exists.
    const m = manager();
    m.push(anchored("confirm", 2, { row: 10, prefer: "above" }));
    m.push(peek("p", 2, { row: 5, prefer: "below" }));
    expect(m.top?.id, "the overlay keeps the keys").toBe("confirm");
    expect(m.stack.map((l) => l.id), "and the stack is sorted on the way in").toEqual(["p", "confirm"]);
    expect(m.layout(REGION).map((p) => p.layer.id), "placed bottom-first, peek beneath").toEqual(["p", "confirm"]);

    const v = manager();
    v.push(view("dash"));
    v.push(peek("p", 2, { row: 5, prefer: "below" }));
    expect(v.top?.id, "the view is still top").toBe("dash");
    expect(v.layout(REGION).map((p) => p.layer.id)).toEqual(["dash", "p"]);

    v.push(anchored("menu", 2, { row: 10, prefer: "above" }));
    expect(v.layout(REGION).map((p) => p.layer.id), "view, peek, overlay").toEqual(["dash", "p", "menu"]);
    expect(v.top?.id).toBe("menu");
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

  it("T1.26 (I22): a centred or fill peek is refused at push, and at update the layer is left as it was", () => {
    const m = manager();
    expect(() =>
      m.push({ id: "c", kind: "peek", placement: { kind: "centred" }, content: rows(1, "c"), dismissable: true, width: 20 }),
    ).toThrow(OverlayError);
    expect(() =>
      m.push({ id: "f", kind: "peek", placement: { kind: "fill" }, content: rows(1, "f"), dismissable: true }),
    ).toThrow(OverlayError);
    expect(m.stack, "neither landed").toEqual([]);

    const ok = peek("p", 1, { row: 5, prefer: "below" });
    m.push(ok);
    expect(() => m.update("p", { placement: { kind: "fill" } })).toThrow(OverlayError);
    expect(m.stack[0], "the survivor is exactly the pushed layer").toEqual(ok);
    // The control: the same update on an overlay is legal, so the refusal is the peek's.
    const o = manager();
    o.push(anchored("a", 1, { row: 5, prefer: "below" }));
    expect(o.update("a", { placement: { kind: "fill" } })).toBe(true);
  });

  it("T1.2: push(view) on empty → hasView", () => {
    const m = manager();
    m.push(view("dash"));
    expect(m.hasView).toBe(true);
    expect(m.top?.id).toBe("dash");
  });

  it("T1.3: two overlays → LIFO, the second is top", () => {
    const m = manager();
    m.push(centred("a", 3));
    m.push(centred("b", 3));
    expect(m.stack.map((l) => l.id)).toEqual(["a", "b"]);
    expect(m.top?.id).toBe("b");
  });

  it("T1.4 (I2): an overlay over a view is top", () => {
    const m = manager();
    m.push(view("dash"));
    m.push(centred("confirm", 3));
    expect(m.top?.id).toBe("confirm");
  });

  it("T1.5: pop with two overlays removes the top one only", () => {
    const m = manager();
    m.push(centred("a", 3));
    m.push(centred("b", 3));
    expect(m.pop()?.id).toBe("b");
    expect(m.stack.map((l) => l.id)).toEqual(["a"]);
  });

  it("T1.6: pop with only a view → empty", () => {
    const m = manager();
    m.push(view("dash"));
    expect(m.pop()?.id).toBe("dash");
    expect(m.stack).toEqual([]);
    expect(m.hasView).toBe(false);
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

  it("T1.8 (I2): pop with a view plus an overlay takes the overlay first", () => {
    const m = manager();
    m.push(view("dash"));
    m.push(centred("confirm", 3));
    expect(m.pop()?.id).toBe("confirm");
    expect(m.pop()?.id).toBe("dash");
  });

  it("T1.9 (I3): pop on a non-dismissable top → null, stack unchanged", () => {
    const m = manager();
    m.push(centred("menu", 3));
    m.push(centred("confirm", 3, { dismissable: false }));

    expect(m.pop()).toBeNull();
    expect(m.stack.map((l) => l.id)).toEqual(["menu", "confirm"]);
  });

  it("T1.9b (I3): pop does not search downwards past a non-dismissable top", () => {
    // The reading of "the topmost dismissable layer" that closes the menu
    // underneath an unanswered confirm. It is a one-word difference in the spec
    // and the whole of T6.11.
    const m = manager();
    m.push(centred("menu", 3));
    m.push(centred("confirm", 3, { dismissable: false }));

    m.pop();
    expect(m.stack.map((l) => l.id)).toContain("menu");
  });

  it("T1.10: dismiss removes a non-dismissable layer — explicit resolution always works", () => {
    const m = manager();
    m.push(centred("confirm", 3, { dismissable: false }));
    m.dismiss("confirm");
    expect(m.stack).toEqual([]);
  });
});

describe("C15 unit — one layer's geometry", () => {
  it("T1.11: a view fills the region", () => {
    const [p] = placeIn([view("dash")]);
    expect(p).toMatchObject({ top: 0, left: 0, height: REGION.height, width: REGION.width });
  });

  it("T1.12 (I14): update changes a layer and nothing about the stack", () => {
    const m = manager();
    m.push(view("dash"));
    m.push(centred("a", 3));
    m.push(centred("b", 3));

    const changes: OverlayChange[] = [];
    m.subscribe((c) => changes.push(c));

    const before = m.stack.map((l) => l.id);
    expect(m.update("a", { content: [] })).toBe(true);

    expect(m.stack.map((l) => l.id)).toEqual(before);
    expect(m.top?.id).toBe("b");
    expect(m.hasView).toBe(true);
    expect(changes).toEqual([{ kind: "content", id: "a" }]);
  });

  it("T1.13 (I14): LayerUpdate cannot carry dismissable", () => {
    const m = manager();
    m.push(centred("confirm", 3, { dismissable: false }));

    // @ts-expect-error — I14: escapability does not change mid-life, and the
    // only form that restriction can take is the type rejecting the field.
    m.update("confirm", { dismissable: true });

    expect(m.stack[0]?.dismissable).toBe(false);
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
    // layer is placed at `left` 0 across the whole region and is `fill` wearing
    // `centred`'s name. The control is the same layer with a width, read for a
    // `left` that differs from a filling layer's.
    const m = manager();
    expect(() =>
      m.push({
        id: "wide",
        kind: "overlay",
        placement: { kind: "centred" },
        content: rows(3, "wide"),
        dismissable: true,
      }),
    ).toThrow(/declares no width/);
    expect(m.stack, "and nothing reached the stack").toEqual([]);

    const [declared] = placeIn([centred("c", 3, { width: 40 })]);
    const [filling] = placeIn([
      { id: "f", kind: "overlay", placement: { kind: "fill" }, content: rows(3, "f"), dismissable: true },
    ]);
    expect(declared?.left, "the state I20 forbids is this one").not.toBe(filling?.left);
    expect(filling?.left).toBe(0);
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
