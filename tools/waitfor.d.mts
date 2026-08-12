export declare const DEFAULT_SENTINEL: string;

export declare function reading(
  text: string,
  sentinel?: string,
): Readonly<{ done: boolean; line: string | null; code: number | null }>;

export declare function waitFor(opts: {
  read: () => string;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  sentinel?: string;
  timeoutMs?: number;
  everyMs?: number;
}): Promise<
  Readonly<{
    done: boolean;
    line: string | null;
    code: number | null;
    timedOut: boolean;
    waitedMs: number;
  }>
>;
