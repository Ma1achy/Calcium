export declare function strip(output: string): string;
export declare function killed(output: string): boolean;
/** Did the run reach a summary at all — pass or fail? A truncated run is not a survivor. */
export declare function ran(output: string): boolean;

/** The harness's own marker for *the suite did not return* — see mutate.mjs. */
export declare function timedOut(output: string): boolean;

/** What vitest's summary says it collected against what it reported — see mutate.mjs. */
export declare function tally(output: string): { reported: number; collected: number } | null;

/**
 * Did the run report every test it collected? A worker that dies mid-file takes
 * its remaining tests with it, and every other predicate here answers correctly
 * while the row reads SURVIVED (F897, F1018).
 */
export declare function incomplete(output: string): boolean;

/**
 * Did the run's suites load? `Test Files N failed` with no failing test — see
 * mutate.mjs for why the disagreement between the two summary lines is the
 * signal and the transform error above them is not (F922).
 */
export declare function unbuilt(output: string): boolean;

export declare class AnchorError extends Error {
  constructor(file: string, from: string);
}
/** An anchor matching more than once, refused rather than applied (F1113). */
export declare class AmbiguousAnchorError extends Error {
  constructor(file: string, from: string, hits: number);
  readonly hits: number;
}
export declare class BlindHarnessError extends Error {
  constructor(reason: string);
}

export type Mutation = Readonly<{
  name: string;
  file: string;
  from: string;
  to: string;
  expect: string;
}>;

/** A mutation whose kill is not in doubt, and why it cannot survive. */
export type Control = Readonly<{ file: string; from: string; to: string; why: string }>;

export type Outcome = Readonly<{
  name: string;
  expect: string;
  killed: boolean;
  byNamedTest?: boolean;
  anchorMissed?: boolean;
  /**
   * The anchor matched more than once and was refused — `replace()` would take
   * the first, so the row would measure a site nobody chose (F1113).
   */
  ambiguous?: boolean;
  /** The run produced no summary line — the harness went blind mid-pass. */
  noSummary?: boolean;
  /** The suites did not load — the mutation did not compile, so nothing was measured. */
  unbuilt?: boolean;
  /** The run reported fewer tests than it collected — neither a kill nor a survivor. */
  indeterminate?: boolean;
  /** The figures behind `indeterminate`, so the row can say them. */
  tally?: { reported: number; collected: number } | null;
  /**
   * The mutated tree did not type-check — the first `error TS…` line that is not
   * an unused binding. `unbuilt` covers a `to` that does not parse; this covers
   * one that parses and does not type-check, which runs a green suite and reads
   * exactly like a weak test (F1106). The `to` is not expressible against this
   * tree, which is evidence it was written against an older one.
   */
  untyped?: string;
  /**
   * How many sites the mutation's own anchor matched, set when `ambiguous`.
   *
   * It used to annotate a `SURVIVED` row, because the pass applied the mutation
   * to the first of several sites and the reader had to be told which of F219's
   * and F277's opposite repairs they were looking at. The pass refuses now
   * (F1113), so this rides the refusal and **a survivor is F277 by
   * construction**: its anchor is unique, present and textually correct.
   */
  hits?: number;
}>;

/** How many places an anchor matches — `replace` takes the first (F219, F1037). */
export declare function hitsOf(src: string, from: string): number;

export declare function apply(
  src: string,
  mutation: Readonly<{ file: string; from: string; to: string }>,
): string;

/**
 * Does the mutated tree type-check? `null` if it does, the first error line that
 * is not an unused binding if not — see mutate.mjs for what the signal is and
 * where it is blind (F1106).
 *
 * `root` is where `npx` resolves the compiler from; `project` is the tsconfig it
 * checks. Separate, because `npx` walks up from its `cwd` and a temporary
 * directory has nothing to walk to.
 */
export declare function tscTypecheck(root: string, project?: string): () => string | null;

export declare function runPass(opts: {
  mutations: readonly Mutation[];
  control: Control;
  read: (file: string) => string;
  write: (file: string, src: string) => void;
  run: () => string;
  /** Asked only of a survivor, and of the clean tree only when one fails. */
  typecheck?: () => string | null;
}): Outcome[];

export declare function report(results: readonly Outcome[]): string;
