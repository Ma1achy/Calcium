/**
 * `tree` — the twisty is content, the guides are decoration.
 *
 * C04 §3ap, C04 I129, C04 I130, C04 I131, §105. One row per visible node; the
 * ladder moves cells and never rows, so `measure` is the visible count at every
 * width.
 */
import type { Tree, TreeNode } from "../../../data/viewmodel/index.js";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate } from "../../text.js";
import { glyphFor, glyphs } from "../glyphs.js";
import { clampSpans, focusStyle, paint, rows, selectionStyle, tone, type Span } from "../paint.js";
import type { BlockDefinition, NavElement, RenderContext, Rendered } from "../types.js";

/** A guide column and its two spaces — §105's step with guides drawn. */
const GUIDED_STEP = 3;

/** The step once the guides have gone (C04 I130's second rung). */
const BARE_STEP = 2;

/** The twisty slot: the mark and a space, or two blanks for a leaf. */
const TWISTY_CELLS = 2;

/** At least this much between a name and its aside, as `TAPE_GAP` between members. */
const ASIDE_GAP = 2;

/** A node that is drawn, and where. */
type Row = Readonly<{ node: TreeNode; depth: number }>;

/**
 * The visible nodes in pre-order (C04 I129): a node is drawn exactly when every
 * ancestor is expanded. A collapsed node's descendants keep their own flags —
 * they are skipped here, never rewritten (§3ap L8).
 */
function visibleRows(nodes: readonly TreeNode[], depth = 0, out: Row[] = []): Row[] {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children !== undefined && node.expanded === true) visibleRows(node.children, depth + 1, out);
  }
  return out;
}

/** `children` present, even empty, is a node with a twisty (§3ap L6, L7). */
const hasTwisty = (node: TreeNode): boolean => node.children !== undefined;

/** One rung of C04 I130's ladder. */
type Rung = Readonly<{ guides: boolean; step: number; asides: boolean; cap: number }>;

/**
 * The rung at `width` — four in one order, first that fits (C04 I130).
 *
 * **Guides, then asides, then the indent**: decoration goes first (§094), the
 * asides go as one group because a column of sizes with a hole says that file
 * has none (L3), and only then is depth capped — **by one number for the
 * block**, the widest visible name, because a per-row cap draws a deep short
 * name right of its shallow long parent (L4, commitment 114).
 */
function rungAt(list: readonly Row[], width: number, measure: (t: string) => number): Rung {
  const w = normaliseWidth(width);
  const label = (r: Row): number => measure(stripControl(r.node.label));
  const aside = (r: Row): number =>
    r.node.aside === undefined || r.node.aside === "" ? 0 : ASIDE_GAP + measure(stripControl(r.node.aside));
  const fits = (step: number, asides: boolean): boolean =>
    list.every((r) => step * r.depth + TWISTY_CELLS + label(r) + (asides ? aside(r) : 0) <= w);

  if (fits(GUIDED_STEP, true)) return { guides: true, step: GUIDED_STEP, asides: true, cap: Infinity };
  if (fits(BARE_STEP, true)) return { guides: false, step: BARE_STEP, asides: true, cap: Infinity };
  if (fits(BARE_STEP, false)) return { guides: false, step: BARE_STEP, asides: false, cap: Infinity };
  const widest = list.reduce((m, r) => Math.max(m, label(r)), 0);
  return { guides: false, step: BARE_STEP, asides: false, cap: Math.max(0, w - TWISTY_CELLS - widest) };
}

function treeElements(block: Tree, width: number): readonly NavElement[] {
  // **One `row` per visible node, at every width** (C04 I129, C04 I130): the ladder
  // moves cells, so the element set is a function of the flags alone.
  const w = normaliseWidth(width);
  return Object.freeze(
    visibleRows(block.nodes).map((r, i) =>
      Object.freeze({
        id: r.node.id,
        level: "row" as const,
        rows: Object.freeze({ from: i, to: i + 1 }),
        cols: Object.freeze({ from: 0, to: w }),
        ...(hasTwisty(r.node)
          ? {
              activate: Object.freeze({
                kind: "expand" as const,
                label: r.node.expanded === true ? "collapse" : "expand",
                target: r.node.id,
              }),
            }
          : {}),
        copy: stripControl(r.node.label),
      }),
    ),
  );
}

export const treeDefinition: BlockDefinition<Tree> = {
  kind: "tree",

  // §7a — the visible names, one per line and indented by depth, which is what
  // a reader sees and what pastes as a tree.
  copy: (block) =>
    visibleRows(block.nodes)
      .map((r) => `${" ".repeat(BARE_STEP * r.depth)}${stripControl(r.node.label)}`)
      .join("\n"),

  // One row per visible node, at every width (C04 I130), and I17's one row for
  // a tree with nothing in it.
  measure: (block: Tree): number => atLeastOne(visibleRows(block.nodes).length), // cells-ok — a row count

  // The first rung's widest row (C09 I44) — what the tree would like, guides
  // and every aside included.
  width: (block: Tree, width: number): number => {
    const w = normaliseWidth(width);
    const need = visibleRows(block.nodes).reduce((m, r) => {
      const aside = r.node.aside === undefined || r.node.aside === "" ? 0 : ASIDE_GAP + cells(stripControl(r.node.aside), "narrow"); // narrow-ok — `width` is pure in (block, width) as `measure` is (C09 I42)
      return Math.max(m, GUIDED_STEP * r.depth + TWISTY_CELLS + cells(stripControl(r.node.label), "narrow") + aside); // narrow-ok — as above
    }, 0);
    return Math.max(1, Math.min(w, need));
  },

  elements: treeElements,

  render(block: Tree, ctx: RenderContext): Rendered {
    const w = normaliseWidth(ctx.width);
    const caps = ctx.capabilities;
    const measure = (t: string): number => cells(t, caps.ambiguousWidth);
    const list = visibleRows(block.nodes);
    // The input is the visible rows, not the roots: a collapsed tree of 2000
    // nodes draws one row and costs one (C28 I45).
    ctx.probe?.gauge("tree.rows", list.length); // cells-ok — a count of rows
    const rung = rungAt(list, w, measure);
    const guide = glyphs(caps).vertical;
    const muted = tone("muted", ctx.theme, caps);
    const held = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus.rowId : null;
    const selected = new Set(
      (ctx.focus?.selected ?? []).filter((s) => s.blockId === block.id).map((s) => s.rowId),
    );

    return rows(
      list.map((r) => {
        const id = r.node.id;
        const on = id === held && !selected.has(id) ? "focusGround" : selected.has(id) ? "selection" : undefined;
        const ground =
          on === undefined ? {} : (selected.has(id) ? selectionStyle : focusStyle)(ctx.theme, caps);
        const ink = (name: "default" | "muted" | "accent"): NonNullable<Span["style"]> =>
          on === undefined ? tone(name, ctx.theme, caps) : { ...tone(name, ctx.theme, caps, on), ...ground };

        const indent = Math.min(rung.step * r.depth, rung.cap);
        const spans: Span[] = [];
        if (rung.guides) {
          // A guide at every ancestor's twisty column (§3ap's figure) — §105
          // draws no elbows, so a row needs nothing but its own depth.
          for (let k = 0; k < r.depth; k += 1) spans.push({ text: `${guide}${" ".repeat(GUIDED_STEP - 1)}`, style: muted });
        } else if (indent > 0) {
          spans.push({ text: " ".repeat(indent), ...(on === undefined ? {} : { style: ground }) });
        }
        // **The disclosure pair, never focus** (C04 I131): a row can be focused
        // and collapsed at once, and one slot cannot say both.
        const mark = hasTwisty(r.node) ? glyphFor(r.node.expanded === true ? "collapse" : "expand", caps) : "";
        spans.push({ text: mark + " ".repeat(Math.max(0, TWISTY_CELLS - measure(mark))), style: ink("muted") });

        const room = Math.max(0, w - indent - TWISTY_CELLS);
        const name = truncate(stripControl(r.node.label), room, caps);
        spans.push({ text: name, style: ink(id === held ? "accent" : "default") });

        const aside = rung.asides && r.node.aside !== undefined ? stripControl(r.node.aside) : "";
        if (aside !== "") {
          const gap = room - measure(name) - measure(aside);
          spans.push({ text: " ".repeat(Math.max(ASIDE_GAP, gap)), ...(on === undefined ? {} : { style: ground }) });
          spans.push({ text: aside, style: ink("muted") });
        }
        return paint(clampSpans(spans, w, caps));
      }),
    );
  },
};
