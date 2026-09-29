// C09 I121 — a focusable shape with no focus mark keeps a non-colour carrier
// at every depth: the focus ground where it carries, whole-shape inversion
// where it does not (R-FOC-001, R-STA-003).
import { describe, expect, it } from "vitest";

import { block, type Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { CORPUS } from "../support/blocks.js";
import { FULL_CAPS, MONO_CAPS, MONO_UNICODE_CAPS, measurable, visible } from "../support/render.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

/**
 * The corpus, children included, **plus two actionable notices** — the corpus
 * holds none, and the notice is one of the review's two named subjects. The
 * `accent` one is the hard case: its resting ink is bold at 1-bit, so a carrier
 * that is only weight cannot move it.
 */
const SUBJECTS: readonly Block[] = (() => {
  const out: Block[] = [];
  const walk = (b: Block): void => {
    out.push(b);
    for (const c of (b as { children?: readonly Block[] }).children ?? []) walk(c);
  };
  for (const b of CORPUS) walk(b);
  out.push(block({ kind: "notice", id: "act-accent", tone: "accent", text: "Approve", action: { kind: "fill", label: "again", command: "/ps" } } as never) as Block);
  out.push(block({ kind: "notice", id: "act-error", tone: "error", glyph: "error", text: "pull failed", action: { kind: "fill", label: "retry", command: "/pull" } } as never) as Block);
  return out;
})();

/** Every (block, element) pair the registry publishes at 80 columns. */
const TARGETS = (() => {
  const reg = createBlockRegistry();
  const out: { blk: Block; blockId: string; rowId: string }[] = [];
  for (const blk of SUBJECTS) {
    for (const el of reg.elementsOf(blk, 80)) {
      out.push({ blk, blockId: (el as { blockId?: string }).blockId ?? blk.id, rowId: el.id });
    }
  }
  return out;
})();

const frame = (blk: Block, caps: TerminalCapabilities, focus: { blockId: string; rowId: string } | null, width = 80): readonly string[] =>
  measurable({ capabilities: caps, focus: focus === null ? null : { ...focus, selected: [] } } as never).renderToLines(blk, width);

/** The five shapes C09 I121 names — the ones that read `focusShapeStyle`. */
const SHAPES = new Set(["notice", "pills", "choice", "control", "tape"]);

describe("C09 I121 — the focus carrier at every depth", () => {
  it("T2.183 (C09 I121): at 1-bit every element's focused frame differs from its resting one, save {mosaic} by equality", () => {
    // Non-vacuity: the five shapes and the exemption are all reached.
    const kinds = new Set<string>(TARGETS.map((t) => t.blk.kind));
    for (const k of [...SHAPES, "mosaic"]) expect(kinds.has(k), `${k} is in the census`).toBe(true);
    // The tape's *current* member is the case the first census missed: it
    // sampled two elements per block, and the current one is already bold.
    expect(TARGETS.some((t) => t.blk.kind === "tape" && t.rowId === "count"), "the current member is a target").toBe(true);
    expect(TARGETS.some((t) => t.blk.id === "act-accent"), "the accent notice publishes its element").toBe(true);

    for (const caps of [MONO_UNICODE_CAPS, MONO_CAPS]) {
      const identical = new Set<string>();
      for (const { blk, blockId, rowId } of TARGETS) {
        const rest = frame(blk, caps, null).join("\n");
        const focused = frame(blk, caps, { blockId, rowId }).join("\n");
        if (rest === focused) identical.add(blk.kind);
      }
      // **By equality**: a sixth identical kind fails, and so does a fixed
      // mosaic until its exemption is removed (R-FOC-004 — a pane holds data).
      expect([...identical].sort(), `unicode=${caps.unicode}`).toEqual(["mosaic"]);
    }
  });

  it("T2.184 (C09 I121, C26 §7): at 1-bit the focused frame has the resting frame's visible text", () => {
    for (const { blk, blockId, rowId } of TARGETS.filter((t) => SHAPES.has(t.blk.kind))) {
      for (const width of [7, 20, 40, 80]) {
        const rest = frame(blk, MONO_UNICODE_CAPS, null, width).map(visible);
        const focused = frame(blk, MONO_UNICODE_CAPS, { blockId, rowId }, width).map(visible);
        expect(focused, `${blk.kind}/${rowId} w=${String(width)}: no cell moves`).toEqual(rest);
      }
    }
  });

  it("T2.185 (C09 I121): at 24-bit no focused frame of the five shapes carries SGR 7", () => {
    // The ground carries at 24-bit, so inversion is not the rung there — and
    // the control is 1-bit, where the same frames must carry it.
    const REVERSE = "\u001b[7m";
    for (const { blk, blockId, rowId } of TARGETS.filter((t) => SHAPES.has(t.blk.kind))) {
      const full = frame(blk, FULL_CAPS, { blockId, rowId }).join("\n");
      expect(full.includes(REVERSE), `${blk.kind}/${rowId} at 24-bit`).toBe(false);
      const mono = frame(blk, MONO_UNICODE_CAPS, { blockId, rowId }).join("\n");
      expect(mono.includes(REVERSE), `${blk.kind}/${rowId} at 1-bit`).toBe(true);
    }
  });
});

describe("C09 I137 — each kind declares its focus shape", () => {
  it.todo("T2.228 (C09 I137): the kinds declaring elements equal the kinds declaring focusShape, by equality, over a constructed session's registry — not deferred on a component: it lands with I137\'s code in review batch 4 M16.5");
  it.todo("T2.229 (C09 I137, I121, R-COL-005): each declared shape's signature holds over every element of every declaring kind — not deferred on a component: it lands with I137\'s code in review batch 4 M16.5");
});
