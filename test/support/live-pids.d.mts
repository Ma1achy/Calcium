/**
 * Types for `live-pids.mjs`, which is `.mjs` because `fixture.mjs` runs inside
 * the PTY as a plain node process and cannot import TypeScript. The declaration
 * is what lets the harness's TypeScript side share the one reader rather than
 * keeping a second copy of the parse.
 */
export function livePids(psOutput: string): readonly number[];
export function psGroupArgv(pgid: number): readonly string[];
