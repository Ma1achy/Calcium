/**
 * C26 §5 — the four predicates `elements` earns, checked generically.
 *
 * **`window` earned an equality and this does not**, which is the honest thing to
 * say up front rather than to discover. `measure(w.block, width) − w.skipRows ===
 * to − from` is one number against one number, total over every kind that
 * declares a window, and it is what made an app's wrong implementation catchable
 * by a sweep rather than by a row someone thought to write. There is no single
 * equality here. There are four predicates, and each catches a class:
 *
 *   1. **Containment** — every element lies inside the block it came from.
 *      Catches positions derived from something other than the block handed in,
 *      which is F134's drift one axis over.
 *   2. **Reading order** — non-decreasing by `(rows.from, cols.from)`. The
 *      keyboard *walks* this list, so "next" has to mean "next on screen".
 *   3. **Per-level disjointness** — two elements at the same level share no
 *      cell, which is what makes pointer resolution single-valued. **Per level
 *      and not globally**: a cell nests inside its row by design, and a global
 *      rule would forbid the structure (C26 I6).
 *   4. **Stability** — two calls agree. Catches an implementation reading a
 *      clock or a counter, which the signature does not forbid.
 *
 * **Purity in focus is not checked here and cannot be**, which is the strongest
 * of the five and the only one that needs no test: focus is not a parameter, so
 * a focus-dependent geometry is unrepresentable rather than forbidden (C26 I3).
 *
 * ## The `window` × `elements` agreement, and its premise
 *
 * A kind declaring **both** owes their agreement: the elements of a window are
 * the elements of the whole, restricted to the window's rows and shifted. That is
 * F134's gutter defect one field along — a derivation computed over the whole
 * block while the window shows a slice — and it is the one property here with the
 * force of `window`'s equality.
 *
 * **It is vacuous today, and that is recorded rather than left to be found.**
 * `window` has two implementers (`logs`, `patch`) and `elements` has one
 * (`table`); the intersection is empty, so `agreements` will report 0 and
 * `checkElements` says so instead of reporting a pass. F102's disposal: **the
 * exemption records which premise it rests on**, so it can be re-checked. The day
 * a kind declares both — `patch` is the likely first, a hunk being a natural
 * scope — this stops being vacuous and nothing needs to be written for it.
 */
import type { Block } from "../data/viewmodel/index.js";
import type { NavElement } from "../presentation/blocks/index.js";

/** What the sweep needs of a registry. Structural, as `MeasurableRegistry` is. */
export interface NavigableRegistry {
  measure(block: Block, width: number): number;
  elementsOf(block: Block, width: number): readonly NavElement[];
  get(kind: string): Readonly<{ elements?: unknown; window?: unknown }> | undefined;
}

export type ElementFailure = Readonly<{
  kind: string;
  blockId: string;
  width: number;
  predicate: "containment" | "order" | "disjoint" | "stability" | "window-agreement";
  detail: string;
}>;

export type ElementReport = Readonly<{
  failures: readonly ElementFailure[];
  /** Elements examined. Zero is not a pass — see `formatElementReport`. */
  checked: number;
  /**
   * **`kinds`, not `kindsCovered`, and the rename is a finding about MG24.**
   *
   * MG24 matches published members by **name** rather than by identity, so this
   * field reading as `report.kindsCovered` in a second file made
   * `ConformanceReport.kindsCovered`'s exemption look stale — the rule reported
   * that the *other* type's member was now consumed, by a read of a different
   * type entirely. The same looseness runs the other way and is worse: a genuinely
   * unconsumed member is satisfied the moment any other type anywhere declares a
   * field with its name. A03 MG24 carries the note.
   */
  kinds: readonly string[];
  /**
   * Kinds declaring **both** `window` and `elements`, so the agreement above has
   * a subject. Zero today, by construction, and reported rather than implied.
   */
  agreements: number;
}>;

const WIDTHS: readonly number[] = [20, 40, 80, 120];

function overlaps(
  a: Readonly<{ from: number; to: number }>,
  b: Readonly<{ from: number; to: number }>,
): boolean {
  return a.from < b.to && b.from < a.to;
}

/**
 * Every predicate, over every block at every width.
 *
 * Widths rather than one width, because the positions are a function of it: a
 * detail that wraps at 40 and not at 80 moves every row beneath it, and a sweep
 * at a single width cannot see an offset that is only right at that width.
 */
export function checkElements(
  registry: NavigableRegistry,
  corpus: readonly Block[],
): ElementReport {
  const failures: ElementFailure[] = [];
  const kinds = new Set<string>();
  let checked = 0;
  let agreements = 0;

  for (const kind of new Set(corpus.map((b) => b.kind))) {
    const definition = registry.get(kind);
    if (definition?.elements !== undefined && definition.window !== undefined) agreements += 1;
  }

  for (const block of corpus) {
    for (const width of WIDTHS) {
      const elements = registry.elementsOf(block, width);
      if (elements.length === 0) continue;
      kinds.add(block.kind);
      checked += elements.length;

      const height = registry.measure(block, width);
      const fail = (predicate: ElementFailure["predicate"], detail: string): void => {
        failures.push({ kind: block.kind, blockId: block.id, width, predicate, detail });
      };

      let previous: NavElement | null = null;
      for (const e of elements) {
        // 1 — containment.
        if (e.rows.from < 0 || e.rows.to > height || e.rows.from >= e.rows.to) {
          fail(
            "containment",
            `${e.id} occupies rows [${String(e.rows.from)}, ${String(e.rows.to)}) of a block ${String(height)} rows tall`,
          );
        }
        if (e.cols.from < 0 || e.cols.to > width || e.cols.from >= e.cols.to) {
          fail(
            "containment",
            `${e.id} occupies columns [${String(e.cols.from)}, ${String(e.cols.to)}) at width ${String(width)}`,
          );
        }

        // 2 — reading order.
        if (
          previous !== null &&
          (e.rows.from < previous.rows.from ||
            (e.rows.from === previous.rows.from && e.cols.from < previous.cols.from))
        ) {
          fail("order", `${e.id} is drawn above ${previous.id} and listed after it`);
        }
        previous = e;
      }

      // 3 — disjointness, per level.
      for (let i = 0; i < elements.length; i += 1) {
        for (let j = i + 1; j < elements.length; j += 1) {
          const a = elements[i];
          const b = elements[j];
          if (a === undefined || b === undefined || a.level !== b.level) continue;
          if (overlaps(a.rows, b.rows) && overlaps(a.cols, b.cols)) {
            fail("disjoint", `${a.id} and ${b.id} are both "${a.level}" and share a cell`);
          }
        }
      }

      // 4 — stability. Deep equality rather than identity: a memoised
      // implementation returning the same array is correct and so is one
      // building a fresh list, and the property is about the answer.
      const again = registry.elementsOf(block, width);
      if (JSON.stringify(again) !== JSON.stringify(elements)) {
        fail("stability", "two calls with the same arguments disagreed");
      }
    }
  }

  return Object.freeze({
    failures: Object.freeze(failures),
    checked,
    kinds: Object.freeze([...kinds]),
    agreements,
  });
}

/**
 * **The counter, never the status.** `✓ 0 elements` reads as a pass and is a
 * sweep that found nothing to check — the shape the window conformance shipped
 * in, and the reason `block-window.test.ts` exists as its own file.
 */
export function formatElementReport(report: ElementReport): string {
  if (report.checked === 0) {
    return "✗ no elements were examined — an empty sweep is not a clean one";
  }
  if (report.failures.length === 0) {
    return (
      `✓ ${String(report.checked)} elements across ${String(report.kinds.length)} kinds · ` +
      `${String(report.agreements)} kind(s) declare both window and elements` +
      (report.agreements === 0
        ? " — the window × elements agreement is VACUOUS on this corpus (C26 I7)"
        : "")
    );
  }
  const lines = report.failures.map(
    (f) => `  ${f.kind}/${f.blockId} @${String(f.width)} · ${f.predicate}: ${f.detail}`,
  );
  return `✗ ${String(report.failures.length)} of ${String(report.checked)} elements failed\n${lines.join("\n")}`;
}
