// The measurement conformance suite (C04 T2.1).
//
// **Arrived.** It was written in `test/support/` under a `DESTINATION:
// src/testing/` header, waiting on C24 §7 to have somewhere to export it from —
// an export nothing consumes being the thing CLAUDE.md forbids. C24 exists now,
// `expectDocument().measuresCorrectly(widths)` wraps this, and it moved rather
// than being rewritten — runner-free and parameterised from the start, so no
// second implementation of the suite was ever needed.
//
// **One change beyond the import paths, and the file asked for it itself.** It
// carried a local width function, with a note saying it must use the real one
// once it moved here or "the suite and the measurer it audits would disagree
// about width — the exact class of bug it exists to find". Two source scans
// fired the moment it arrived, because they are scoped to `src/` and could not
// see it under `test/`. That is worth naming: **a file waiting to move is a file
// outside the rules of the place it is going**, and the deferred instruction and
// the scan that enforces it met on the same commit by luck rather than design.
//
// Two consequences for how it is written, both deliberate:
//
//   - **No test runner.** No `expect`, no `it`, no vitest import. It returns
//     failures as data and the caller asserts. C24 wraps it, C09's T4.2 drives
//     it, the reference app runs it — one implementation, three callers, and the
//     one that would have had to be rewritten is the public one.
//   - **Parameterised over registry and corpus.** A consumer's custom kind joins
//     the suite by being in the registry, not by anyone extending a list.
//
// T2.1 is the single most valuable test in the system: `measure(block, w)` must
// equal the number of terminal rows rendering actually occupies. C14 virtualises
// by measured height without rendering, so a disagreement makes the viewport
// drift, scroll positions land wrong, and content jump — and it is violated
// silently, which is why this is a suite rather than an assertion.
import type { Block, MeasureFn } from "../data/viewmodel/index.js";
import { displayCells } from "../presentation/text.js";

/** C04 §8 T2.1's widths. */
export const DEFAULT_WIDTHS: readonly number[] = [40, 60, 80, 100, 120, 160, 200];

/**
 * What the suite needs from C09's registry, and nothing more.
 *
 * Declared structurally, and the reason changed with the move rather than went
 * away. It used to be *this file cannot import C09*; now it can, and it still
 * must not — **a consumer's registry is not C09's.** C24 §7 ships this for an
 * app to run against its own registered kinds, and a parameter typed as C09's
 * concrete registry would accept only ours. The structural shape is the
 * parameterisation, not a workaround for a layering problem that no longer
 * exists.
 *
 * `renderToLines` here is a *member of that shape*, not the function of the
 * same name in `./index.ts`, which takes a registry and has four parameters.
 * The collision is why MG25 reads that function as consumed — see its note.
 */
export interface MeasurableRegistry {
  measure: MeasureFn;
  /** Rendered output at `width`, as the lines it actually occupies. */
  renderToLines(block: Block, width: number): readonly string[];
  readonly kinds: readonly string[];
}

export type Failure = Readonly<{
  check: string;
  blockId: string;
  kind: string;
  width: number;
  expected: number | string;
  actual: number | string;
  detail?: string;
}>;

export type ConformanceReport = Readonly<{
  failures: readonly Failure[];
  checked: number;
  kindsCovered: readonly string[];
}>;

type Options = Readonly<{
  widths?: readonly number[];
  /** Skip the render comparison — for a caller that has measurers but no renderer. */
  measureOnly?: boolean;
}>;

/**
 * Run every measurement property in C04 §5 over a corpus.
 *
 * Returns a report. It never throws, and it never asserts: a caller that wants
 * an assertion writes one over `report.failures`.
 */
export function checkMeasurement(
  registry: MeasurableRegistry,
  corpus: readonly Block[],
  options: Options = {},
): ConformanceReport {
  const widths = options.widths ?? DEFAULT_WIDTHS;
  const failures: Failure[] = [];
  const kinds = new Set<string>();
  let checked = 0;

  for (const block of corpus) {
    kinds.add(block.kind);
    for (const width of widths) {
      checked += 1;
      const at = { blockId: block.id, kind: block.kind, width };

      let measured: number;
      try {
        measured = registry.measure(block, width);
      } catch (err) {
        // T2.3 — total. A measurer that throws has already failed; record it
        // and carry on, so one bad kind does not hide the rest.
        failures.push({
          ...at,
          check: "total",
          expected: "a number",
          actual: "threw",
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (!Number.isInteger(measured) || measured < 0) {
        // T2.5 — never negative, never fractional, at any width including 1.
        failures.push({
          ...at,
          check: "integer-non-negative",
          expected: "a non-negative integer",
          actual: measured,
        });
      }

      // T2.2 — pure. A hundred repeats is the spec's number; the cheap check
      // here is that repetition is stable, which is what C14's cache assumes.
      const again = safeMeasure(registry, block, width);
      if (again !== measured) {
        failures.push({ ...at, check: "pure", expected: measured, actual: again ?? "threw" });
      }

      if (options.measureOnly === true) continue;

      let rendered: readonly string[];
      try {
        rendered = registry.renderToLines(block, width);
      } catch (err) {
        failures.push({
          ...at,
          check: "renders",
          expected: "lines",
          actual: "threw",
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // T2.1, the headline. Everything else in this file is a precondition for
      // this line meaning what it says.
      if (rendered.length !== measured) {
        failures.push({
          ...at,
          check: "measure-equals-render",
          expected: measured,
          actual: rendered.length,
          detail: `measured ${measured} rows, rendered ${rendered.length}`,
        });
      }

      // I10 — no line may exceed the width it was measured at. A measurer and a
      // renderer can agree on row count while the renderer overflows, and the
      // overflow is what the terminal wraps, silently adding a row on screen
      // that neither of them counted.
      const over = rendered.findIndex((line) => displayCells(line) > width);
      if (over !== -1) {
        failures.push({
          ...at,
          check: "within-width",
          expected: `≤ ${width} cells`,
          actual: displayCells(rendered[over] ?? ""),
          detail: `line ${over} overflows; the terminal will wrap it into a row nobody counted`,
        });
      }
    }

    // T2.4 — monotone in content. Adding to a collection never decreases height.
    const grown = withOneMoreItem(block);
    if (grown !== null) {
      const w = widths[0] ?? 80;
      const before = safeMeasure(registry, block, w);
      const after = safeMeasure(registry, grown, w);
      if (before !== null && after !== null && after < before) {
        failures.push({
          check: "monotone",
          blockId: block.id,
          kind: block.kind,
          width: w,
          expected: `≥ ${before}`,
          actual: after,
          detail: "adding a row decreased the measured height",
        });
      }
    }
  }

  return Object.freeze({
    failures: Object.freeze(failures),
    checked,
    kindsCovered: Object.freeze([...kinds]),
  });
}

/**
 * T2.6 — under `unicode: "ascii"` every fixture measures exactly as it does
 * under `unicode: "full"`. Capability-driven substitution is 1:1 by column count
 * (commitment 14), so a fallback glyph occupies the columns of the one it
 * replaces. The ellipsis is the case that catches people: `…` is one column and
 * `...` is three, so the ASCII truncation marker is a single `~`.
 */
export function checkAsciiParity(
  full: MeasurableRegistry,
  ascii: MeasurableRegistry,
  corpus: readonly Block[],
  widths: readonly number[] = DEFAULT_WIDTHS,
): ConformanceReport {
  const failures: Failure[] = [];
  let checked = 0;

  for (const block of corpus) {
    for (const width of widths) {
      checked += 1;
      const a = safeMeasure(full, block, width);
      const b = safeMeasure(ascii, block, width);
      if (a !== b) {
        failures.push({
          check: "ascii-parity",
          blockId: block.id,
          kind: block.kind,
          width,
          expected: a ?? "threw",
          actual: b ?? "threw",
          detail: "a substitution changed the column count; every fallback must be 1:1",
        });
      }
    }
  }

  return Object.freeze({
    failures: Object.freeze(failures),
    checked,
    kindsCovered: Object.freeze([...new Set(corpus.map((b) => b.kind))]),
  });
}

/**
 * Every registered kind appears in the corpus. Registry completeness proper is
 * C09's test, since C09 owns the registry; this is the corpus side of it —
 * a kind nobody wrote a fixture for is a kind T2.1 never ran against, and the
 * suite would report success over the gap.
 */
export function uncoveredKinds(
  registry: MeasurableRegistry,
  corpus: readonly Block[],
): readonly string[] {
  // `string`, not `BlockKind`: a registry holds app-registered kinds too (F1),
  // and narrowing here would exclude exactly the ones most likely to be missing
  // a fixture.
  const covered = new Set<string>(corpus.map((b) => b.kind));
  return registry.kinds.filter((k) => !covered.has(k));
}

/** A human-readable report, for a caller that wants to print rather than assert. */
export function formatReport(report: ConformanceReport): string {
  if (report.failures.length === 0) {
    return `✓ ${report.checked} measurements across ${report.kindsCovered.length} kinds`;
  }
  const lines = report.failures.map(
    (f) =>
      `  ${f.check}  ${f.kind} "${f.blockId}" at width ${f.width}: ` +
      `expected ${f.expected}, got ${f.actual}${f.detail === undefined ? "" : ` — ${f.detail}`}`,
  );
  return `✗ ${report.failures.length} of ${report.checked} measurements failed\n${lines.join("\n")}`;
}

// --- internals ------------------------------------------------------------

function safeMeasure(r: MeasurableRegistry, block: Block, width: number): number | null {
  try {
    return r.measure(block, width);
  } catch {
    return null;
  }
}

/**
 * Grow a collection block by one item, for the monotonicity check. Returns null
 * for kinds with no collection to grow — there is nothing to assert about them.
 */
function withOneMoreItem(b: Block): Block | null {
  switch (b.kind) {
    case "keyValue":
      return { ...b, rows: [...b.rows, { label: "extra", value: "1" }] };
    case "logs":
      return { ...b, lines: [...b.lines, { ts: "00:00:00", level: "info", message: "extra" }] };
    case "events":
      return { ...b, events: [...b.events, { ts: "00:00:00", type: "extra", message: "extra" }] };
    case "steps":
      return { ...b, steps: [...b.steps, { label: "extra", state: "pending" }] };
    case "comparison":
      return { ...b, rows: [...b.rows, { field: "extra", a: "1", b: "2" }] };
    case "table":
      return { ...b, rows: [...b.rows, { id: `${b.id}-extra`, cells: {} }] };
    case "panel":
    case "group":
      return { ...b, children: [...b.children, { kind: "raw", id: `${b.id}-extra`, text: "x" }] };
    default:
      return null;
  }
}

/**
 * **The single width implementation, as this file's own comment scheduled.**
 *
 * It carried a local width function with its own SGR regex and its own
 * combining and wide-character tables, and said in as many words: *this file
 * must use `cells()` once it moves to `src/testing/`, or the suite and the
 * measurer it audits would disagree about width — which is the exact class of
 * bug it exists to find.* The move is the trigger, and two source scans fired
 * on arrival, because a scan scoped to `src/` had never been able to see this
 * file while it lived under `test/`.
 *
 * `displayCells` rather than `cells`: this measures rendered output, which
 * already carries SGR, and `cells` strips the ESC byte as a control character
 * and then counts `[38;5` as four visible cells (C09 §5a). The local version
 * was right about that and it is one more thing that had to stay right in two
 * places.
 */
