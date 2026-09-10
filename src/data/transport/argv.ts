/**
 * The JSON tokens, appended exactly once.
 *
 * C06 §3 — see spec. The user never types them (A01 D16); a user who does is
 * asking to see the contract, and C07 renders it raw — but that is C07's
 * decision, and C06 appends regardless so the payload is always machine-shaped.
 *
 * **Which tokens is the far side's business** (C06 I25, C05 I26, F1). `--json`
 * was appended unconditionally and is a convention rather than a fact: the
 * framework's own demo target spells it `--format json`, so Calcium could not
 * drive `docker` without a shim. The caller resolves the verb's declaration
 * against the manifest's and puts the answer on the `Invocation`; C06 never
 * reads C05.
 *
 * The dedupe is the whole of the module and T1.4 is what holds it: appending
 * unconditionally produces `["ps", "--json", "--json"]` for the one user who
 * typed it, and a far side that treats a repeated flag as an error fails a
 * command that was correct.
 */

/** What a far side is asked with when nothing says otherwise. */
export const DEFAULT_JSON_FLAG: readonly string[] = Object.freeze(["--json"]);

/**
 * I3, I4 — an array in, an array out. No string is ever built here.
 *
 * **The dedupe reads the first token, not the sequence** (C05 §8c row 5). For
 * `["-o","json"]` against a user who typed `-o yaml`, matching the whole
 * sequence would append `-o json` after it and silently override what the user
 * asked for — last-wins on most far sides — where matching the first token
 * appends nothing and leaves both I4's argument and D16's intact. A
 * single-token flag has only a first token, so nothing about the original
 * behaviour moves.
 *
 * `[]` appends nothing: a verb that already emits JSON says so that way, and it
 * is the state `undefined` cannot express because `undefined` inherits.
 */
export function withJson(argv: readonly string[], flag?: readonly string[]): readonly string[] {
  const tokens = flag ?? DEFAULT_JSON_FLAG;
  const first = tokens[0];
  if (first === undefined) return [...argv];
  return argv.includes(first) ? [...argv] : [...argv, ...tokens];
}
