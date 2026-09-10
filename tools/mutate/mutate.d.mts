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
  /** The run produced no summary line — the harness went blind mid-pass. */
  noSummary?: boolean;
  /** The suites did not load — the mutation did not compile, so nothing was measured. */
  unbuilt?: boolean;
  /** The run reported fewer tests than it collected — neither a kill nor a survivor. */
  indeterminate?: boolean;
  /** The figures behind `indeterminate`, so the row can say them. */
  tally?: { reported: number; collected: number } | null;
  /**
   * How many sites the mutation's own anchor matched. A survivor with more than
   * one is F219's disposition (extract the duplicate); a survivor with exactly
   * one may still be F277's (the anchor is perfect and its callers moved).
   */
  hits?: number;
}>;

/** How many places an anchor matches — `replace` takes the first (F219, F1037). */
export declare function hitsOf(src: string, from: string): number;

export declare function apply(
  src: string,
  mutation: Readonly<{ file: string; from: string; to: string }>,
): string;

export declare function runPass(opts: {
  mutations: readonly Mutation[];
  control: Control;
  read: (file: string) => string;
  write: (file: string, src: string) => void;
  run: () => string;
}): Outcome[];

export declare function report(results: readonly Outcome[]): string;
