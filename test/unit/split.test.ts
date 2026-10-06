// C04 §3aq — the split (§105): two peer panes, and the divider is a control.
//
// **The expected frames are literals, worked by hand before the assertion.**
// §105's figure is drawn back cell for cell: the divider at 18, the left pane
// scrolled so §021's arithmetic puts a one-row thumb on its third row, which is
// the `┃` the figure draws.
import { describe, expect, it } from "vitest";

import { block, splitPaneKey, validateDocument } from "../../src/data/viewmodel/index.js";
import type { Block, Split } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { groundSequence, paint, tone } from "../../src/presentation/blocks/paint.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import type { FocusState } from "../../src/presentation/blocks/types.js";
import { doc, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS } from "../support/render.js";

const registry = createBlockRegistry({ defaults: true });
const SGR = /\x1b\[[0-9;]*m/gu;

const raw = (id: string, lines: readonly string[]): Block => block({ kind: "raw", id, text: lines.join("\n") });
const split = (height: number, left: Block, right: Block, divider?: number): Split =>
  block({ kind: "split", id: "s", height, children: [left, right], ...(divider === undefined ? {} : { divider }) }) as Split;

const painted = (
  b: Block,
  width: number,
  offsets: Readonly<Record<string, number>> = {},
  focus: FocusState | null = null,
  caps = FULL_CAPS,
): readonly string[] =>
  renderSequenceToLines(registry, [b], width, { theme: DARK_THEME, capabilities: caps, focus, scrollOffsets: offsets });
const frame = (...args: Parameters<typeof painted>): readonly string[] =>
  painted(...args).map((l) => l.replace(SGR, "").trimEnd());

const errorsOf = (b: unknown): string => {
  const r = validateDocument(doc({ blocks: [b as Block] }));
  return r.ok ? "" : r.error.join("\n");
};

/** §105's two panes: twelve names on the left, four lines of code on the right. */
const FILES = ["a/", "b/", "c/", "d/", "e/", "f/", "src/", "  interaction/", "  data/", "README.md", "g/", "h/"];
const CODE = ["export function layout(b, w, h) {", "  b = chooseRep(b, w);", "  solveW(b, w);", "  return b;"];

describe("C04 §3aq — split", () => {
  it("T1.56 (C04 I132): two children, a height and a divider", () => {
    const ok = split(4, raw("l", ["x"]), raw("r", ["y"]));
    expect(errorsOf(ok), "§105's split validates").toBe("");
    const one = { kind: "split", id: "s", height: 4, children: [raw("l", ["x"])] };
    const three = { ...one, children: [raw("a", ["x"]), raw("b", ["y"]), raw("c", ["z"])] };
    expect(errorsOf(one)).toMatch(/exactly two children \(C04 I132\) — got 1/u);
    expect(errorsOf(three)).toMatch(/exactly two children \(C04 I132\) — got 3/u);
    expect(errorsOf({ ...ok, height: 0 })).toMatch(/"height" must be a positive integer \(C04 I132\)/u);
    expect(errorsOf({ ...ok, divider: 0 })).toMatch(/"divider" must be a positive integer when present \(C04 I132\)/u);
    expect(errorsOf({ ...ok, divider: 1.5 })).toMatch(/"divider" must be a positive integer when present/u);
    // No residue row: the bars say where, so the box is its height at every width.
    const tall = split(4, raw("l", FILES), raw("r", CODE));
    for (const w of [3, 4, 40, 120]) {
      expect(registry.measure(tall, w), `measure at ${String(w)}`).toBe(4);
      expect(frame(tall, w), `rows at ${String(w)}`).toHaveLength(4);
    }
  });

  it("T1.57 (C04 I133, §3aq S1–S5, §105): §105's figure, and the divider is the left pane's bar", () => {
    // §105 exactly — the left pane holds rows 6..9 of twelve, and §021's
    // arithmetic at four rows puts the thumb on the third.
    const figure = split(4, raw("l", FILES), raw("r", CODE), 18);
    expect(frame(figure, 54, { [splitPaneKey("s", 0)]: 6 })).toEqual([
      "src/              │ export function layout(b, w, h) {",
      "  interaction/    │   b = chooseRep(b, w);",
      "  data/           ┃   solveW(b, w);",
      "README.md         │   return b;",
    ]);

    // S1 — both fit: bare track, and the default divider is half of `w − 2`.
    expect(frame(split(2, raw("l", ["a", "b"]), raw("r", ["c"])), 20)).toEqual(["a        │ c", "b        │"]);
    // S3 — the right overflows: its content narrows by one and its bar is the
    // split's last column. The divider stays bare track: the left fits.
    expect(frame(split(2, raw("l", ["a", "b"]), raw("r", ["c1", "c2", "c3"])), 20)).toEqual([
      "a        │ c1      ┃",
      "b        │ c2      │",
    ]);
    // S4 — clamped at read: 99 is `w − 3`, and 1 is kept.
    expect(frame(split(1, raw("l", ["a"]), raw("r", ["c"]), 99), 20)).toEqual(["a                │ c"]);
    expect(frame(split(1, raw("l", ["a"]), raw("r", ["c"]), 1), 20)).toEqual(["a│ c"]);
    // S5 — below four columns the left draws alone.
    expect(frame(split(2, raw("l", ["a", "b"]), raw("r", ["c"])), 3)).toEqual(["a", "b"]);

    // **One column between the panes at every width** — the divider, then the
    // blank. A separate bar column beside the divider fails here.
    for (const w of [4, 7, 20, 41, 80]) {
      const d = Math.floor((w - 2) / 2);
      const X = "x".repeat(46);
      for (const row of frame(split(3, raw("l", FILES), raw("r", [X, X, X])), w)) {
        expect(row.slice(0, d), `width ${String(w)}: the left pane is its own ${String(d)} cells`).not.toMatch(/[│┃╽╿]/u);
        expect(row[d], `width ${String(w)}: the divider is column ${String(d)}`).toMatch(/[│┃╽╿]/u);
        expect(row[d + 1], `width ${String(w)}: then one blank`).toBe(" ");
        // A one-cell right pane (width 4) holds the truncation mark, not a letter.
        expect(row[d + 2], `width ${String(w)}: then the right pane's text`).toBe(w === 4 ? "…" : "x");
      }
    }
    // ASCII — the same column at the ASCII rung, whole rows only (§021).
    expect(frame(figure, 54, { [splitPaneKey("s", 0)]: 6 }, null, ASCII_CAPS).map((r) => r[18])).toEqual(["|", "|", "#", "|"]);
  });

  it("T1.58 (C04 I134, §3aq S6, S7): each pane's elements, and the divider's accent", () => {
    const tree = ONE_PER_KIND.tree;
    const codeBlock = block({ kind: "code", id: "c", language: "typescript", text: [...CODE, "}"].join("\n") });
    const s = split(4, tree, codeBlock);
    const placed = registry.elementsIn([s], 40);
    // At 40 the left pane is 19; the tree's six visible rows, then the code
    // pane's one element — addressed to the split, starting two past the
    // divider, one cell short of the edge because five lines overflow four.
    expect(placed.map((p) => [p.blockId, p.element.id, p.pane?.side])).toEqual([
      ["tree-1", "src", 0],
      ["tree-1", "interaction", 0],
      ["tree-1", "parser", 0],
      ["tree-1", "frame", 0],
      ["tree-1", "data", 0],
      ["tree-1", "package", 0],
      ["s", "c", 1],
    ]);
    expect(placed.every((p) => p.pane?.split === "s")).toBe(true);
    const pane = placed.at(-1)?.element;
    expect(pane?.level).toBe("block");
    expect(pane?.cols).toEqual({ from: 21, to: 39 });
    expect(pane?.rows).toEqual({ from: 0, to: 5 });

    // S6 — the pane focused is lit behind every row of its extent; unfocused it
    // is not, and the text is the same either way.
    const ground = groundSequence("surface.focusGround", DARK_THEME, FULL_CAPS);
    expect(ground).not.toBe("");
    const lit = painted(s, 40, {}, { blockId: "s", rowId: "c" } as FocusState);
    const unlit = painted(s, 40);
    for (const row of lit) expect(row.slice(row.indexOf("│") + 1), "the code pane's rows carry the ground").toContain(ground);
    for (const row of unlit) expect(row).not.toContain(ground);
    expect(lit.map((r) => r.replace(SGR, "").trimEnd())).toEqual(unlit.map((r) => r.replace(SGR, "").trimEnd()));

    // S7 — the divider in accent with focus in the left pane, muted otherwise.
    // The opening sequence and the glyph: the row is normalised (C09 I72), so
    // the reset after the glyph is re-emitted in the row's own form.
    const track = (ink: "accent" | "muted"): string =>
      paint([{ text: "│", style: tone(ink, DARK_THEME, FULL_CAPS) }]).replace(/\x1b\[0m$/u, "");
    const small = split(2, tree, raw("r", ["y"]));
    const inLeft = painted(small, 40, {}, { blockId: "tree-1", rowId: "src" } as FocusState);
    const inRight = painted(small, 40, {}, { blockId: "s", rowId: "r" } as FocusState);
    expect(inLeft[1]).toContain(track("accent"));
    expect(inRight[1]).toContain(track("muted"));
    expect(painted(small, 40)[1]).toContain(track("muted"));
    expect(track("accent")).not.toBe(track("muted"));
  });
});
