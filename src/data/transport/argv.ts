/**
 * `--json`, appended exactly once.
 *
 * C06 §3 — see spec. The user never types it (A01 D16); a user who does is asking
 * to see the contract, and C07 renders it raw — but that is C07's decision, and
 * C06 appends regardless so the payload is always machine-shaped.
 *
 * The dedupe is the whole of the module and T1.4 is what holds it: appending
 * unconditionally produces `["ps", "--json", "--json"]` for the one user who
 * typed it, and a far side that treats a repeated flag as an error fails a
 * command that was correct.
 */

const JSON_FLAG = "--json";

/** I3, I4 — an array in, an array out. No string is ever built here. */
export function withJson(argv: readonly string[]): readonly string[] {
  return argv.includes(JSON_FLAG) ? [...argv] : [...argv, JSON_FLAG];
}
