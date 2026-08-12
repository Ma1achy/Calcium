export declare const MIN_ROWS: number;

export declare function liveness(
  rows: readonly string[],
  opts: Readonly<{ marker: string; kind: string; min?: number }>,
): Readonly<{ content: number; body: number; dead: boolean; line: string }>;

export declare function samplesLive(
  rows: readonly string[],
  ticks: number,
  expected?: number,
): Readonly<{ samples: readonly string[]; dead: boolean; line: string }>;
