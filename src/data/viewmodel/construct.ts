/**
 * The constructors. The one place a block's shape invariants are enforced.
 *
 * C04 §4b — see spec. These take a **complete** block and return a frozen one.
 * C24's `b` is the ergonomic layer over them — generated ids, bare strings as
 * cells, action helpers — and it never freezes or validates directly. If it did,
 * I1 would have two enforcement points, and the one that drifts is always the
 * one with fewer tests: a block frozen twice is indistinguishable from a block
 * frozen once, right up until one of the two paths stops doing it.
 *
 * Three invariants live here, all at construction rather than at render:
 *
 *   I1  deep freeze, at every nesting depth
 *   I6  a glyph on `error` and `warn` tones
 *   §3  `height` present for `form: "line"`
 *
 * They throw rather than returning a result, and that is not in tension with
 * I15. `applyPatch` is fallible because it runs on every stream tick against
 * data from the far side; a constructor runs against a literal an adapter
 * author wrote, and the failure is a bug in that source rather than a condition
 * to handle. The distinction is who can fix it.
 */

import {
  GLYPH_REQUIRED_TONES,
  type Block,
  type Cell,
  type Glyph,
  type Notice,
  type Plot,
  type PlotForm,
  type Tone,
  type ViewDocument,
} from "./types.js";
import { childBlocks } from "./tree.js";

/**
 * I1 — freeze at every nesting depth. A shallow `Object.freeze` on a document
 * leaves `blocks[0].rows[2]` mutable, and a T1.1 that only probes the top level
 * passes anyway. That is the failure this function exists to make impossible.
 *
 * Cycles are tolerated here rather than refused: `seen` keeps the walk finite,
 * and refusal is `validateDocument`'s job (I27). A constructor that hung on a
 * cyclic literal would fail worse than one that freezes it and lets validation
 * name the problem.
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object") return value;
  const obj = value as unknown as object;
  if (seen.has(obj)) return value;
  seen.add(obj);

  for (const key of Object.getOwnPropertyNames(obj)) {
    deepFreeze((obj as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

/** Thrown by a constructor. A bug in the calling adapter, not a runtime condition. */
export class BlockShapeError extends Error {
  override readonly name = "BlockShapeError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * I6 — a tone that means "something is wrong" carries a glyph, so the meaning
 * survives 1-bit, monochrome and colour-blind rendering (D29). Checked at
 * construction rather than at the renderer, which is where D29 says the
 * constraint belongs: the renderer has no way to invent one.
 */
function requireGlyph(tone: Tone | undefined, glyph: Glyph | undefined, where: string): void {
  if (tone === undefined || !GLYPH_REQUIRED_TONES.has(tone)) return;
  if (glyph !== undefined && glyph.length > 0) return;
  throw new BlockShapeError(
    `${where}: tone "${tone}" requires a non-empty glyph (C04 I6, D29) — ` +
      `colour alone does not survive 1-bit or a colour-blind reader`,
  );
}

/**
 * §3 — `form: "line"` requires `height`. No default: a plot's height is a
 * layout decision the surface must make, and a magic default produces silently
 * wrong-sized plots that nobody notices are wrong. `sparkline` is always 1 and
 * must not carry one.
 */
/**
 * Which forms declare a height. **A `Record` and not a condition on one member**:
 * `form === "line"` was the check, so a third member needed no height and got
 * `?? 1` — a one-row matrix, silently.
 */
const DECLARES_HEIGHT: Readonly<Record<PlotForm, boolean>> = {
  sparkline: false,
  line: true,
  // A matrix's row count is data, so its height must come from the block or I1
  // fails through the data path (C12 §6a B1).
  heatmap: true,
};

function checkPlotHeight(plot: Plot): void {
  if (DECLARES_HEIGHT[plot.form] && plot.height === undefined) {
    throw new BlockShapeError(
      `plot "${plot.id}": form "${plot.form}" requires an explicit height (C04 §3, C12) — ` +
        `there is no default, because a defaulted height is wrong silently`,
    );
  }
}

/**
 * A heatmap's three refusals (I50b, C12 §6a).
 *
 * **Refused rather than ignored, and that is the ruling.** A member that means
 * nothing in one arm is indistinguishable from one not yet implemented, and the
 * reader who finds it cannot tell which.
 */
function checkHeatmap(plot: Plot): void {
  if (plot.form !== "heatmap") return;

  if (plot.axes === false) {
    throw new BlockShapeError(
      `plot "${plot.id}": a heatmap cannot set "axes: false" (C04 I50b) — ` +
        `the scale legend is the only thing that says what a cell means, so a ` +
        `heatmap without one is unreadable rather than plain`,
    );
  }

  const toned = plot.series.findIndex((s) => s.tone !== undefined);
  if (toned !== -1) {
    throw new BlockShapeError(
      `plot "${plot.id}": series[${String(toned)}] sets a tone and a heatmap draws none ` +
        `(C04 I50b) — magnitude owns the cell, so a per-row tone is a second colour ` +
        `channel fighting the first`,
    );
  }

  // **The one an app hits by accident**: rings of different ages give rows of
  // different lengths, and the picture that produces is self-consistent and
  // wrong — the renderer stretches a short row to the common width, so column k
  // means a different instant in every row. Padding is the fix and only the app
  // knows which end is old.
  const first = plot.series[0];
  if (first === undefined) return;
  const ragged = plot.series.findIndex((s) => s.values.length !== first.values.length);
  if (ragged !== -1) {
    throw new BlockShapeError(
      `plot "${plot.id}": series[${String(ragged)}] has ` +
        `${String(plot.series[ragged]?.values.length ?? 0)} values and series[0] has ` +
        `${String(first.values.length)} (C04 I50b) — a matrix's columns are one ordinate, ` +
        `so a short row is stretched and column k means a different position in every row. ` +
        `Pad it: the renderer cannot know which end is old`,
    );
  }
}

/**
 * I41 — an unknown `yFormat` is an error, not a silent fall-through to `number`.
 *
 * **Both here and in the validator**, which is §3's standing reason rather than
 * duplication: a document can arrive from a fixture without passing through a
 * constructor, and a constructed block never reaches the validator. A check in
 * one of them covers half the ways a plot is built.
 *
 * The arm the rename produces is `percentage` — what a reader guesses when
 * `fraction` and `percent` are the two on offer — and it used to render plain
 * numbers in silence.
 */
const Y_FORMATS: ReadonlySet<string> = new Set([
  "number",
  "fraction",
  "percent",
  "bytes",
  "duration",
]);

function checkPlotFormat(plot: Plot): void {
  const format: unknown = plot.yFormat;
  if (format !== undefined && !(typeof format === "string" && Y_FORMATS.has(format))) {
    throw new BlockShapeError(
      `plot "${plot.id}": "yFormat" must be one of ${[...Y_FORMATS].join(", ")} (C04 I41) — ` +
        `an unknown arm used to render plain numbers and say nothing`,
    );
  }
}

/** Every shape check that applies to a block, by kind. */
function checkShape(block: Block): void {
  switch (block.kind) {
    case "notice":
      requireGlyph(block.tone, (block as Notice).glyph, `notice "${block.id}"`);
      break;
    case "plot":
      checkHeatmap(block);
      checkPlotHeight(block);
      checkPlotFormat(block);
      break;
    case "table":
      for (const row of block.rows) {
        for (const [key, cell] of Object.entries(row.cells)) {
          requireGlyph(cell.tone, cell.glyph, `table "${block.id}" row "${row.id}" cell "${key}"`);
        }
      }
      break;
    default:
      // I6 names `Notice` and `Cell`, and this implements exactly that.
      //
      // Worth recording rather than widening: `keyValue` rows and `pills` chips
      // carry a `tone` and have no `glyph` field, so a row toned `error` cannot
      // satisfy D29 on any renderer. That is a gap in the vocabulary, not a
      // rule to enforce here — closing it means either adding a glyph field to
      // those kinds or narrowing their tone type, and both are spec changes.
      break;
  }
}

/**
 * Keys the literal has and its kind does not, typed `never` (F104).
 *
 * **`B extends Block` was satisfied structurally by a type that already had the
 * extra keys.** `B` is inferred *from the argument*, so the literal's own type
 * becomes `B`, and nothing was ever checked against `Block` — commitment 29
 * says *"C04's constructors enforce the shape invariants"* and the compiler was
 * enforcing nothing. Verified by fabricated violation:
 * `block({ kind: "rule", id: "r", label: "x", utterGarbage: 42 })` compiled.
 *
 * How it surfaced is the more useful half: splitting `Comparison`'s verdict
 * union removed a field from a public type, `tsc` came back clean across 175
 * files, and **eleven fixtures were still supplying it**. A narrowing that
 * removes a field should break every producer and it broke none, because they
 * all reach the type through here.
 *
 * The idiom is `ProducedMeta`'s, one component over, distributed over the union
 * by `kind`: the forbidden keys are `never` rather than merely absent, because
 * TypeScript's excess-property check only fires on a *fresh object literal* and
 * a helper returning a wider object would otherwise still slip through.
 *
 * **Its blind spot, stated because an unrecorded limit reads as strength.** A
 * nested literal — `panel.children`, a table row's `detail` — is checked
 * against `Block` itself, and excess-property checking against a *union* admits
 * any key present in any member. So `{ kind: "rule", id, label, rows: [] }`
 * nested inside a panel is still accepted. Catching that needs the child
 * positions to take this type too, which is a wider change than this row.
 */
type ExcessKeys<B extends Block> = Exclude<keyof B, keyof Extract<Block, { kind: B["kind"] }>>;

/**
 * **A rest-tuple guard, and the shape is forced rather than chosen.**
 *
 * The obvious form is `spec: B & Partial<Record<ExcessKeys<B>, never>>`, the
 * `ProducedMeta` idiom transcribed. Measured, it does not work here: `keyof B`
 * inside the parameter's own type feeds constraint resolution, `B` degrades to
 * `Block`, and two call sites lost the literal they had inferred — `kind`
 * widened to `string` in a nested literal, and `b.children` stopped existing on
 * a panel. `NoInfer` recovered the first and not the second.
 *
 * A guard in a *separate* parameter leaves `spec: B` alone, so inference is
 * exactly what it was, and an excess key makes the tuple non-empty — a required
 * argument that cannot be supplied. The message is the key's own name.
 */
type ExcessGuard<B extends Block> = [ExcessKeys<B>] extends [never]
  ? []
  : [excess: `not a key of this block kind: ${Extract<ExcessKeys<B>, string>}`];

/**
 * The single constructor. Every kind goes through it, including the three
 * registered elsewhere (`table`, `plot`, `patch`) — C04 owns every shape, so it
 * enforces every shape, and C11, C12 and C25 own only the engines.
 */
export function block<B extends Block>(spec: B, ..._excess: ExcessGuard<B>): B {
  return rebuild(spec);
}

/**
 * The same checks, without the literal guard — for a value already typed as a
 * block rather than written as one (F104).
 *
 * **Two callers, both rebuilding rather than authoring**: `finish` re-emits a
 * spec with `gapBefore` resolved, and `withoutGap` re-emits one with it dropped.
 * Their input is a caller's `B extends Block`, so the compiler cannot prove the
 * guard's tuple is empty and would reject a call that is correct by
 * construction — the literal it came from was checked where it was written.
 *
 * Named and exported rather than reached by a cast at each site, because a cast
 * is a claim with nowhere to put the reason. This is the reason.
 */
export function rebuild<B extends Block>(spec: B): B {
  checkShape(spec);
  for (const child of descendants(spec)) checkShape(child);
  return deepFreeze(spec);
}

/**
 * Every nested block, transitively, so a nested block's shape is checked at
 * construction too.
 *
 * `seen` is path-scoped and keeps the walk finite on a cyclic literal, matching
 * `deepFreeze` and for the same reason: a constructor that hangs fails worse
 * than one that completes and lets `validateDocument` name the cycle (I27).
 *
 * **Exported because C13 counts blocks against the session cap (C13 I17), and a
 * second copy of this walk would miss the next container kind added here** —
 * silently, in the component that decides what to evict. C04 §5 makes the same
 * argument `cells()` makes: one implementation, or the two answers drift.
 *
 * That comment was right about the hazard and wrong about its shape: there was
 * no second copy, and `scroll` was missed by six *independent* enumerations.
 * Which blocks hold blocks is `tree.ts`'s question now, and it is compiler-
 * checked — see that file for why a `Record` and not a `Set`.
 *
 * It yields blocks and never rows. A table's rows are not blocks; a row's
 * `detail` is. What to *count* is the caller's decision, not this walk's.
 */
export function* descendants(b: Block, seen: WeakSet<object> = new WeakSet()): Generator<Block> {
  if (seen.has(b)) return;
  seen.add(b);

  for (const child of childBlocks(b)) {
    yield child;
    yield* descendants(child, seen);
  }
}

/**
 * I13 — `meta.origin` has no default here. C23 sets it on every append, and a
 * constructor that supplied one would be the path by which "always present"
 * quietly becomes "usually present".
 */
export function document(spec: ViewDocument): ViewDocument {
  for (const b of spec.blocks) {
    checkShape(b);
    for (const child of descendants(b)) checkShape(child);
  }
  return deepFreeze(spec);
}

/** A cell, checked for I6 in isolation — used by C24's `b` when building rows. */
export function cell(spec: Cell): Cell {
  requireGlyph(spec.tone, spec.glyph, "cell");
  return deepFreeze(spec);
}
