/**
 * C09 §7h — the semantic node, for every block and every element (§107,
 * `R-ACC-001`, parked 29).
 *
 * *The cell grid is a projection. It is not the interface.* A node is what a
 * block **is** — its role, its name, its value — where the rows are what it
 * looks like at one width. So nothing here reads a painted row, a capability,
 * a theme or a clock: the node comes from the block's data and the elements it
 * already publishes, which is the declaration the pointer and the keyboard read
 * (C26 I8). Focus and selection are the renderer's and join the node there.
 */

import { childWidths, hasChildren, type Block, type KnownBlockKind } from "../../data/viewmodel/index.js";
import type { NavElement } from "./types.js";

/**
 * §107's roles, and ARIA's wherever §107 is silent (ruling 29) — a screen
 * reader speaks these names, and §107's own list is already mostly ARIA.
 */
export type SemanticRole =
  | "table"
  | "note"
  | "alert"
  | "status"
  | "progressbar"
  | "separator"
  | "log"
  | "list"
  | "radiogroup"
  | "slider"
  | "tablist"
  | "figure"
  | "group"
  | "document"
  | "tree"
  | "treeitem"
  | "row"
  | "cell";

/** What a block records about itself (I117). Focus and selection are the renderer's. */
export type SemanticState = "busy" | "stale";

/**
 * §107's nine fields, as far as a block can answer them (I117, I118).
 *
 * `description` and `relations` are absent: nothing a block holds today is a
 * description distinct from its name, and no kind declares an `owns`,
 * `describes` or `labelled-by`. They arrive with the first kind that does.
 */
export type SemanticNode = Readonly<{
  id: string;
  role: SemanticRole;
  name: string;
  value?: number;
  valueText?: string;
  state: readonly SemanticState[];
  position?: Readonly<{ index: number; of: number }>;
  /** The registry's own action ids — `confirm` and `copy` (§107: *the same ids the keymap resolves*). */
  actions: readonly string[];
  children: readonly SemanticNode[];
}>;

/**
 * The role table (I116), exhaustive over the known kinds, so a kind added
 * without a row does not compile.
 *
 * **Five rows the entry's table did not name**, ruled by its own rule —
 * ARIA's nearest: `keyValue` and `comparison` are label/value grids, `events`
 * is an append stream as `logs` is, `patch` is text as `code` is, `tip` is a
 * note as `notice` is.
 */
export const SEMANTIC_ROLES: Readonly<Record<KnownBlockKind, SemanticRole>> = Object.freeze({
  table: "table",
  keyValue: "table",
  comparison: "table",
  notice: "note",
  tip: "note",
  status: "status",
  progress: "progressbar",
  rule: "separator",
  logs: "log",
  events: "log",
  pills: "list",
  steps: "list",
  choice: "radiogroup",
  control: "slider",
  tape: "tablist",
  plot: "figure",
  mosaic: "figure",
  image: "figure",
  panel: "group",
  scroll: "group",
  group: "group",
  code: "document",
  raw: "document",
  terminal: "document",
  patch: "document",
  tree: "tree",
  // Two regions and the divider between them (C04 §3aq): a group of two, as
  // `panel` and `group` are — its children's nodes are its children.
  split: "group",
});

/** An application's own kind reads `document`, as its fallback draws `raw`. */
const isKnown = (kind: string): kind is KnownBlockKind => Object.hasOwn(SEMANTIC_ROLES, kind);

/** I116 — the role, with `notice`'s one exception: an error is an `alert`. */
export function roleOf(block: Block): SemanticRole {
  if (block.kind === "notice" && block.tone === "error") return "alert";
  return isKnown(block.kind) ? SEMANTIC_ROLES[block.kind] : "document";
}

/**
 * I117 — the kind's own label, or `""`. **Never derived from rows**: §107's
 * *without colour, position or punctuation* rules out a painted string, and an
 * empty name is ARIA's own answer for an unlabelled group.
 */
function nameOf(block: Block): string {
  switch (block.kind) {
    case "rule":
    case "progress":
    case "control":
      return block.label;
    case "choice":
      return block.label ?? "";
    case "notice":
    case "tip":
      return block.text;
    case "code":
      return block.language;
    case "patch":
      return block.path;
    case "panel":
      return block.title;
    case "status":
      return block.message;
    case "image":
      return block.alt;
    default:
      return "";
  }
}

/** I117 — the value and its human text, for the two kinds that hold one. */
function valueOf(block: Block): Readonly<{ value?: number; valueText?: string }> {
  if (block.kind === "progress") return { value: block.current, valueText: `${String(block.current)} of ${String(block.total)}` };
  if (block.kind === "control") return { value: block.at, valueText: block.value };
  return {};
}

/** I117 — what the block records about itself. */
function stateOf(block: Block): readonly SemanticState[] {
  if (block.kind === "status" && (block.state === "loading" || block.state === "retrying")) return ["busy"];
  if (block.kind === "notice" && block.streaming === true) return ["busy"];
  if (block.kind === "panel" && block.staleForMs !== undefined) return ["stale"];
  return [];
}

/** I118 — an element as a node: its level's role, its place, the registry's action ids. */
function elementNode(e: NavElement, index: number, of: number, parent: SemanticRole): SemanticNode {
  const actions = [
    ...(e.activate !== undefined || e.viewState === true ? ["confirm"] : []),
    ...(e.copy !== undefined ? ["copy"] : []),
  ];
  return Object.freeze({
    id: e.id,
    // **`treeitem` for a tree's rows** (I118): a screen reader announces depth
    // and expansion for a `treeitem` and nothing for a `row`.
    role: parent === "tree" ? "treeitem" : e.level === "cell" ? "cell" : "row",
    name: "",
    state: [],
    position: Object.freeze({ index: index + 1, of }),
    actions,
    children: [],
  });
}

/**
 * The node for `block` at `width` (I117, I118).
 *
 * **Containers nest their children's nodes, at the widths C04 gives them**
 * (`childWidths`, the measurement contract's own division), and every other
 * kind nests its elements. The one known limit: a `scroll` whose bar draws
 * renders its children one column narrower than `childWidths` says, so a child
 * that sheds at exactly that column is taken one column wide.
 */
export function semanticsOf(
  block: Block,
  width: number,
  elementsOf: (block: Block, width: number) => readonly NavElement[],
): SemanticNode {
  const base = { id: block.id, role: roleOf(block), name: nameOf(block), ...valueOf(block), state: stateOf(block), actions: [] };
  if (hasChildren(block)) {
    const widths = childWidths(block, width);
    return Object.freeze({
      ...base,
      children: Object.freeze(block.children.map((child, i) => semanticsOf(child, widths[i] ?? width, elementsOf))),
    });
  }
  const elements = elementsOf(block, width);
  return Object.freeze({
    ...base,
    children: Object.freeze(elements.map((e, i) => elementNode(e, i, elements.length, base.role))), // cells-ok — a count of elements
  });
}
