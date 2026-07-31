export declare function strip(output: string): string;
export declare function killed(output: string): boolean;

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
}>;

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
