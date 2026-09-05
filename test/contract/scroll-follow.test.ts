// C04 §3c — the tail, and the collapsed form (C04 I97, I98).
//
// **Every row is one of the walk's, indexed by rule interaction.** T1 is the
// row the arc names — *live output does not move the frame* — and it is asked
// of the rows **above** the box rather than of the prompt, because the frame
// puts the prompt below a fixed-height region (`paint.ts`: header 1 + region +
// prompt + footer) and the prompt's row therefore cannot move whatever any
// block does. A row asserting it would be vacuous; the thing that moves when an
// unbounded block streams is everything above it, and that is what the control
// shows.
import { describe, expect, it } from "vitest";

import { validateDocument } from "../../src/data/viewmodel/index.js";
import type { Block, Scroll, ViewDocument } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { scrollDefinition } from "../../src/presentation/blocks/kinds/containers.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { ScrollOffsets } from "../../src/shell/scroll-offsets.js";
import { atTail, followTail, TAIL } from "../../src/shell/tail.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, visible } from "../support/render.js";

const registry = createBlockRegistry({ defaults: true });
const measureChild = (block: Block, width: number): number => registry.measure(block, width);
/** Through the registry, which is the caller every kind's `elements` actually has. */
const elementsOf = (block: Block, width: number) => registry.elementsOf(block, width);

/** One row at every width, so the arithmetic is the container's. */
const flat = (id: string): Block => ({ kind: "raw", id, text: id });
const rows = (n: number, from = 1): Block[] =>
  Array.from({ length: n }, (_u, i) => flat(`r${String(from + i)}`));

const box = (children: readonly Block[], extra: Partial<Scroll> = {}): Scroll =>
  ({ kind: "scroll", id: "s", height: 2, children, ...extra }) as Scroll;

const lines = (
  blocks: readonly Block[],
  width: number,
  scrollOffsets?: Readonly<Record<string, number>>,
  capabilities = FULL_CAPS,
): readonly string[] =>
  renderSequenceToLines(registry, blocks, width, {
    theme: DARK_THEME,
    capabilities,
    ...(scrollOffsets === undefined ? {} : { scrollOffsets }),
  }).map((l) => visible(l).trimEnd());

const docWith = (block: unknown): ViewDocument =>
  ({
    schema: "tui.view/1",
    command: "x",
    status: "ok",
    blocks: [block],
    meta: {
      verb: null,
      adapter: "none",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: [],
      stderr: "",
      transport: "local",
      origin: "user",
    },
  }) as unknown as ViewDocument;

describe("shell/tail — one comparison, written once", () => {
  it("T1.30 (C04 I97): `atTail` is `>=`, and `followTail` moves only a reader who had the bottom", () => {
    expect(atTail(3, 3), "at the last offset is the tail").toBe(true);
    expect(atTail(9, 3), "past it is the tail too — a value the caller left past the end").toBe(true);
    expect(atTail(2, 3)).toBe(false);
    expect(followTail(3, 3, 7), "had the bottom → the new bottom").toBe(7);
    expect(followTail(1, 3, 7), "was reading → stays").toBe(1);
    expect(atTail(TAIL, 1_000_000), "TAIL is past every ceiling").toBe(true);
  });
});

describe("C04 I97 — the field says *start following*", () => {
  it("T2.37 (C04 I97, §3c T6): a follow box nobody touched opens at its tail, and the residue is above", () => {
    const following = lines([box(rows(5), { follow: true })], 40);
    expect(following).toEqual(["r4", "r5", "⋯ 3 above, 0 below"]);

    // The control: without the field the same box opens at its head.
    const plain = lines([box(rows(5))], 40);
    expect(plain).toEqual(["r1", "r2", "⋯ 0 above, 3 below"]);
  });

  it("T2.38 (C04 I97, §3c T1): live output does not move the rows above the box, and nothing is written", () => {
    const before = flat("before");
    const first = lines([before, box(rows(5), { follow: true })], 40, {});
    const second = lines([before, box(rows(8), { follow: true })], 40, {});

    expect(first.indexOf("before"), "the row above the box").toBe(0);
    expect(second.indexOf("before"), "is where it was").toBe(0);
    expect(second.length, "and the frame is the same height").toBe(first.length);
    expect(second.slice(1), "while the box shows the new tail").toEqual(["r7", "r8", "⋯ 6 above, 0 below"]);
    // `measure` never saw `follow`: the box is `height` (+ residue) either way.
    expect(scrollDefinition.measure(box(rows(5), { follow: true }), 40, measureChild)).toBe(3);
    expect(scrollDefinition.measure(box(rows(8), { follow: true }), 40, measureChild)).toBe(3);

    // **The control that shows what follow buys**: the same output in an
    // unbounded block grows the frame by exactly the rows it adds.
    const grow = (n: number): number =>
      lines([before, { kind: "raw", id: "u", text: rows(n).map((r) => r.id).join("\n") }], 40).length;
    expect(grow(8) - grow(5)).toBe(3);
  });

  it("T2.39 (C04 I97, §3c T2 T3): ⇞ inside the box stops the follow, ⇟ to the bottom resumes it", () => {
    const store = new ScrollOffsets();
    const five = box(rows(5), { follow: true });
    const ceiling = (b: Scroll): number =>
      b.children.reduce((n, c) => n + measureChild(c, 40), 0) - b.height;
    expect(ceiling(five)).toBe(3);

    // **From an untouched follow box**, which holds nothing: the page starts at
    // the tail the field implies, not at the `0` an absent entry reads as.
    store.nudge("e", "s", -1, { ceiling: ceiling(five), follow: true });
    expect(store.get("e", "s")).toBe(2);
    expect(lines([five], 40, store.forEntry("e"))).toEqual(["r3", "r4", "⋯ 2 above, 1 below"]);

    // A child arrives. The reader is reading, and the window does not move.
    const six = box(rows(6), { follow: true });
    expect(lines([six], 40, store.forEntry("e"))).toEqual(["r3", "r4", "⋯ 2 above, 2 below"]);

    // ⇟ past the end lands at the bottom, so the box follows again — derived
    // from where it ended up (C14 I5), and written as `TAIL`.
    store.nudge("e", "s", 5, { ceiling: ceiling(six), follow: true });
    expect(store.get("e", "s")).toBe(TAIL);
    expect(lines([six], 40, store.forEntry("e"))).toEqual(["r5", "r6", "⋯ 4 above, 0 below"]);

    // And the next child arrives with **nothing written**: the clamp at read
    // is the follow.
    const seven = box(rows(7), { follow: true });
    expect(lines([seven], 40, store.forEntry("e"))).toEqual(["r6", "r7", "⋯ 5 above, 0 below"]);
    expect(store.get("e", "s")).toBe(TAIL);
    // §3c T8, recorded: the key carries it as a non-zero.
    expect(store.key("e")).toBe("s=Infinity");
  });

  it("T2.40 (C04 §3c T3, T7): a box that never declared `follow` follows once paged to its bottom; no ceiling leaves TAIL alone", () => {
    const store = new ScrollOffsets();
    store.nudge("e", "s", 10, { ceiling: 3 });
    expect(store.get("e", "s"), "at the bottom → following, field or no field").toBe(TAIL);
    // The two shipped callers pass no box yet: `∞ + δ` is still `∞`, so the
    // degradation is *still following* and never a wrong position.
    store.nudge("e", "s", -1);
    expect(store.get("e", "s")).toBe(TAIL);
    // And a box whose content fits: ceiling 0, every landing is the bottom.
    store.nudge("e", "t", -3, { ceiling: 0 });
    expect(store.get("e", "t")).toBe(TAIL);
  });

  it("T2.41 (C04 I97): a follow box in a settled document reads the same every frame", () => {
    // T4 of the trace: nothing appends, so the tail resolves to one ceiling.
    const b = box(rows(4), { follow: true });
    expect(lines([b], 40)).toEqual(lines([b], 40));
    expect(lines([b], 40, { s: TAIL })).toEqual(lines([b], 40));
  });
});

describe("C04 I98 — the collapsed form is the residue row and nothing else", () => {
  it("T2.42 (C04 I98, §3c S1 S2): collapsed, the box measures 1 and draws *⋯ 0 above, N below* at every width", () => {
    const folded = box(rows(5), { follow: true, collapsed: true });
    for (const width of [80, 40]) {
      expect(scrollDefinition.measure(folded, width, measureChild)).toBe(1);
      expect(lines([folded], width)).toEqual(["⋯ 0 above, 5 below"]);
    }
    expect(lines([folded], 40, undefined, ASCII_CAPS)).toEqual(["~ 0 above, 5 below"]);
    // S2: a held offset does not move a fold — the residue is the fold's statement.
    expect(lines([folded], 40, { s: 3 })).toEqual(["⋯ 0 above, 5 below"]);
    // Expanded again it is an ordinary follow box.
    const open = box(rows(5), { follow: true, collapsed: false });
    expect(scrollDefinition.measure(open, 40, measureChild)).toBe(3);
    expect(lines([open], 40)).toEqual(["r4", "r5", "⋯ 3 above, 0 below"]);
  });

  it("T2.43 (C04 I98, §3c S3): every element of a declared fold carries the toggle; an undeclared one carries none", () => {
    const folded = elementsOf(box(rows(3), { collapsed: true }), 40);
    expect(folded.map((e) => e.id)).toEqual(["r1", "r2", "r3"]);
    for (const e of folded) {
      expect(e.activate).toEqual({ kind: "expand", label: "expand", target: "s" });
    }
    const open = elementsOf(box(rows(3), { collapsed: false }), 40);
    expect(open.every((e) => e.activate?.kind === "expand" && e.activate.label === "collapse")).toBe(true);
    const plain = elementsOf(box(rows(3)), 40);
    expect(plain.every((e) => e.activate === undefined), "no field, no fold, no affordance").toBe(true);
  });

  it("T2.44 (C04 I97, I98): the two flags are refused unless boolean, and accepted when they are", () => {
    const bad = validateDocument(docWith({ kind: "scroll", id: "s", height: 2, children: rows(2), follow: "yes" }));
    expect(bad.ok).toBe(false);
    expect(bad.ok ? "" : bad.error.join(" ")).toMatch(/"follow" must be a boolean.*I97/u);
    const worse = validateDocument(docWith({ kind: "scroll", id: "s", height: 2, children: rows(2), collapsed: 1 }));
    expect(worse.ok).toBe(false);
    expect(worse.ok ? "" : worse.error.join(" ")).toMatch(/"collapsed" must be a boolean.*I98/u);
    const good = validateDocument(
      docWith({ kind: "scroll", id: "s", height: 2, children: rows(2), follow: true, collapsed: false }),
    );
    expect(good.ok).toBe(true);
  });
});
