// C09 I121 — a focusable shape with no focus mark keeps a non-colour carrier
// at every depth: the focus ground where it carries, whole-shape inversion
// where it does not (R-FOC-001, R-STA-003).
import { beforeAll, describe, expect, it } from "vitest";

import { block, type Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry, type BlockRegistry, type FocusShape } from "../../src/presentation/blocks/index.js";
import { groundSequence } from "../../src/presentation/blocks/paint.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { DARK_THEME, FULL_CAPS, MONO_CAPS, MONO_UNICODE_CAPS, measurable, visible } from "../support/render.js";
import { buildGraph } from "../support/session.js";
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

/**
 * The kinds C09 I121 reaches — the ones that read `focusShapeStyle` — **read
 * from the kinds' own declarations** (I137), never listed here. This was a
 * hand list of five, and `form` was missing from it: a `control` that read
 * `focusStyle` and differed at 1-bit only by losing weight. The defaults
 * registry is enough for the question, since every `box` and `control` kind is
 * C09's own; T2.228 holds the whole partition over the production registry.
 */
const SHAPES: ReadonlySet<string> = (() => {
  const reg = createBlockRegistry();
  return new Set(
    reg.kinds.filter((k) => {
      const shape = reg.get(k)?.focusShape;
      return shape === "box" || shape === "control";
    }),
  );
})();

describe("C09 I121 — the focus carrier at every depth", () => {
  it("T2.183 (C09 I121): at 1-bit every element's focused frame differs from its resting one, save {mosaic} by equality", () => {
    // Non-vacuity: the five shapes and the exemption are all reached.
    const kinds = new Set<string>(TARGETS.map((t) => t.blk.kind));
    expect([...SHAPES].sort(), "the declared box and control kinds (I137)").toEqual(["choice", "control", "form", "notice", "pills", "tape"]);
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

/**
 * §018 figure 5's subject: a mosaic of framed plots. The corpus's own mosaic
 * holds `raw` children, which C09 I100's region ground lights — the `frame` arm of
 * the pane rule (C09 I137) needs a child with furniture of its own.
 */
const FIG5 = block({
  kind: "mosaic",
  id: "fig5",
  height: 8,
  areas: "AB",
  children: [
    { ...(ONE_PER_KIND.plot as object), id: "fig5-a" },
    { ...(ONE_PER_KIND.plot as object), id: "fig5-b" },
  ],
} as never) as Block;

/** A `steps` whose details shed: the corpus's never does, at any width. */
const SHEDDING_STEPS = block({
  kind: "steps",
  id: "steps-shed",
  steps: [
    { label: "Resolve dependencies", state: "done", detail: "fetched forty-two packages" },
    { label: "Build", state: "active", detail: "layer 3 of 7 compiling" },
  ],
} as never) as Block;

/**
 * One subject per kind, plus the three the corpus cannot supply — an actionable
 * notice (the corpus's notice publishes nothing), the shedding `steps`, and
 * figure 5 in place of the `raw` mosaic.
 */
const DECLARED_SUBJECTS: readonly Block[] = [
  ...Object.values(ONE_PER_KIND).filter((b) => b.kind !== "mosaic"),
  block({ kind: "notice", id: "act-accent", tone: "accent", text: "Approve", action: { kind: "fill", label: "again", command: "/ps" } } as never) as Block,
  SHEDDING_STEPS,
  FIG5,
];

/** The first width, widest first, at which a block publishes an element. */
const WIDTHS = [80, 40, 24, 16, 12, 9, 8];

const params = (frame: string): readonly string[] =>
  [...frame.matchAll(/\u001b\[([0-9;]*)m/gu)].map((m) => m[1] ?? "");
const has7 = (frame: string): boolean => params(frame).some((p) => p.split(";").includes("7"));
const backgrounds = (frame: string): ReadonlySet<string> =>
  new Set(params(frame).filter((p) => p.startsWith("48;") || /^(4[0-7]|10[0-7])$/u.test(p)));

describe("C09 I137 — each kind declares its focus shape", () => {
  let production: BlockRegistry;
  beforeAll(async () => {
    production = (await buildGraph()).graph.blocks;
  });

  /** Every (subject, width, element) the production registry publishes, for a declaring kind. */
  const targets = (): readonly { blk: Block; width: number; blockId: string; rowId: string; shape: FocusShape }[] => {
    const out: { blk: Block; width: number; blockId: string; rowId: string; shape: FocusShape }[] = [];
    for (const blk of DECLARED_SUBJECTS) {
      const shape = production.get(blk.kind)?.focusShape;
      if (shape === undefined) continue;
      const width = WIDTHS.find((w) => production.elementsOf(blk, w).length > 0);
      if (width === undefined) continue;
      for (const el of production.elementsOf(blk, width)) {
        out.push({ blk, width, blockId: (el as { blockId?: string }).blockId ?? blk.id, rowId: el.id, shape });
      }
    }
    return out;
  };

  it("T2.228 (C09 I137): the kinds declaring elements equal the kinds declaring focusShape, over a constructed session's registry", () => {
    const kinds = measurable({ registry: production }).kinds;
    const withElements = kinds.filter((k) => production.get(k)?.elements !== undefined).sort();
    const withShape = kinds.filter((k) => production.get(k)?.focusShape !== undefined).sort();
    // **Equality, not a subset**: a kind gaining `elements` without a shape
    // fails, and so does a shape declared on a kind that offers nothing.
    expect(withShape, "the declaring kinds").toEqual(withElements);
    for (const k of withShape) {
      expect(["box", "control", "row", "frame"], `${k}'s shape is one of the four`).toContain(production.get(k)?.focusShape);
    }
    // Non-vacuity: every declaring kind is a subject T2.229 reaches.
    const reached = [...new Set(targets().map((t) => t.blk.kind))].sort();
    expect(reached, "every declaring kind is reached").toEqual(withShape);
  });

  it("T2.229 (C09 I137, I121, R-COL-005): each declared shape's signature holds over every element of every declaring kind", () => {
    const FOCUS_GROUND = (groundSequence("surface.focusGround", DARK_THEME, FULL_CAPS).match(/\u001b\[([0-9;]*)m/u) ?? [])[1];
    expect(FOCUS_GROUND, "the ground resolves at 24-bit").toMatch(/^48;/u);
    const frame = (t: ReturnType<typeof targets>[number], caps: TerminalCapabilities, focused: boolean): string =>
      measurable({ registry: production, capabilities: caps, focus: focused ? { blockId: t.blockId, rowId: t.rowId, selected: [] } : null } as never)
        .renderToLines(t.blk, t.width)
        .join("\n");
    const failures: string[] = [];
    const seen = new Set<FocusShape>();
    for (const t of targets()) {
      seen.add(t.shape);
      const at = `${t.blk.kind}/${t.rowId} (${t.shape}) w=${String(t.width)}`;
      const fullRest = frame(t, FULL_CAPS, false);
      const fullFocus = frame(t, FULL_CAPS, true);
      if (fullRest === fullFocus) failures.push(`${at}: identical at 24-bit`);
      const added = [...backgrounds(fullFocus)].filter((b) => !backgrounds(fullRest).has(b));
      for (const caps of [MONO_UNICODE_CAPS, MONO_CAPS]) {
        const rest = frame(t, caps, false);
        const focus = frame(t, caps, true);
        const rung = `${at} unicode=${String(caps.unicode)}`;
        if (t.shape === "box" || t.shape === "control") {
          if (!has7(focus)) failures.push(`${rung}: no inversion at 1-bit`);
          if (rest.split("\n").map(visible).join("\n") !== focus.split("\n").map(visible).join("\n")) failures.push(`${rung}: a cell moved`);
        } else {
          if (rest === focus) failures.push(`${rung}: identical at 1-bit`);
          if (has7(focus) && !has7(rest)) failures.push(`${rung}: inversion is selection's rung`);
        }
      }
      if (t.shape === "box" || t.shape === "control") {
        if (added.length === 0) failures.push(`${at}: no ground at 24-bit`);
        if (has7(fullFocus)) failures.push(`${at}: SGR 7 at 24-bit`);
      } else if (t.shape === "row") {
        if (!params(fullFocus).includes(FOCUS_GROUND!)) failures.push(`${at}: no focusGround at 24-bit`);
      } else if (added.length > 0) {
        failures.push(`${at}: a frame painted a ground (${added.join(" ")})`);
      }
    }
    expect([...seen].sort(), "all four shapes are reached").toEqual(["box", "control", "frame", "row"]);
    expect(failures).toEqual([]);
  });
});
