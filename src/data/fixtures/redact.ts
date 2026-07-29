/**
 * Scrubbing on the way in. Values, never structure.
 *
 * C08 §2, I8, commitment 9 — see spec. Redaction runs at capture, so a secret
 * never reaches disk rather than being removed from disk later. I2 is untouched
 * by it: byte-for-byte is a promise about *replay*, and what replay emits is
 * what capture stored.
 *
 * **The rule that carries the weight is that structure is untouched.** A
 * redaction that dropped the key holding a token would change the shape every
 * adapter is then tested against — the corpus would describe a far side emitting
 * one fewer field than the real one, and the adapter written to satisfy it would
 * be wrong in production in exactly the way fixtures exist to prevent. So: same
 * key set, same types, same array lengths, same line count. T3.13 asserts it and
 * T6.14 is what breaks.
 *
 * **It operates on the text, and the parsed value is derived from it.** That is
 * not a shortcut. `stdoutRaw` is what the corpus file stores and `stdout` is
 * parsed from it at load (§2), so redacting the text is the only way the two
 * cannot disagree. Redacting the parsed tree and re-serialising would produce a
 * `stdoutRaw` that is no longer what the far side wrote — key order, whitespace
 * and number formatting all move — and I2 would be a claim about our serialiser
 * rather than about the recording.
 *
 * Substring replacement, not whole-value: `{"token":"ghp_…"}` becomes
 * `{"token":"«redacted»"}`, which is still the same JSON document with the same
 * shape. Replacing the line would leave the corpus holding something no parser
 * accepts.
 */

/** What a redacted value becomes. Recognisable in a diff, and still a string. */
export const REDACTED = "«redacted»";

type Pattern = Readonly<{ id: string; re: RegExp; why: string }>;

/**
 * Shapes we can recognise.
 *
 * A token has no universal shape — `ghp_…` and `xoxb-…` do; an opaque 40-char
 * base64 string does not. A rule matching every long string would redact UUIDs,
 * image digests and commit SHAs, which are most of what a recording is made of,
 * and a corpus of `«redacted»` exercises nothing. So: shapes, plus the key-name
 * axis below for credentials whose only reliable signal is what they are called.
 *
 * Every pattern is global — `replace` needs it, and `test` on a global regex
 * carries `lastIndex` between calls, which is why nothing here calls `test`.
 */
const VALUE_PATTERNS: readonly Pattern[] = Object.freeze([
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, why: "GitHub token" },
  { id: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, why: "Slack token" },
  { id: "aws-key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, why: "AWS access key id" },
  {
    id: "private-key",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    why: "PEM private key",
  },
  {
    id: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    why: "JWT",
  },
  { id: "bearer", re: /\bBearer\s+[A-Za-z0-9._-]{16,}/gi, why: "bearer credential" },
  {
    id: "url-credentials",
    re: /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@"]+:[^/\s@"]+@/gi,
    why: "credentials in a URL",
  },
]);

/**
 * `"api_key": "anything"` → redacted regardless of the value's shape.
 *
 * Applied to the text because that is where redaction lives, which means it is
 * a regex over JSON rather than a tree walk. The trade is deliberate: it matches
 * a key-value pair in serialised form and nothing else, so a secret sitting in
 * an array of bare strings is caught by shape or not at all. A tree walk would
 * catch more and would force the re-serialisation the header rejects.
 *
 * **The lookahead makes redaction idempotent**, and that is not a tidiness
 * point. Unlike the shape patterns, this one matches on the *key*, so a
 * already-redacted `"token":"«redacted»"` still looks like a secret to it —
 * which would make `findSecrets` report a correctly scrubbed corpus as dirty,
 * and T2.5 fail on the very corpora it exists to bless.
 */
const SECRET_PAIR =
  /("(?:[A-Za-z0-9_]*_)?(?:secret|token|password|passwd|credential|api_?key|access_?key|private_?key|auth)"\s*:\s*)(?!"«redacted»")"(?:[^"\\]|\\.)*"/gi;

/**
 * `/home/alice/…`, `/Users/alice/…`, `C:\Users\alice\…` → a placeholder home.
 *
 * The path *shape* survives. A fixture whose paths all became `«redacted»` would
 * stop exercising the path handling it was recorded to exercise; only the
 * identifying segment moves.
 */
const HOME_PATTERNS: readonly Readonly<{ id: string; re: RegExp; to: string; why: string }>[] =
  Object.freeze([
    { id: "home-path", re: /\/(?:home|Users)\/[^/\s"'\\]+/g, to: "/home/«user»", why: "home path" },
    {
      id: "home-path",
      // `\\\\` in the class: a JSON-escaped backslash is two characters, and a
      // Windows path inside a JSON string is written that way.
      re: /[A-Za-z]:\\{1,2}Users\\{1,2}[^\s"'\\]+/g,
      to: "C:\\\\Users\\\\«user»",
      why: "home path",
    },
  ]);

export type Redaction = Readonly<{ rule: string; why: string; count: number }>;

/**
 * The one implementation. `redactText` returns the text; `findSecrets` returns
 * what would have been rewritten and throws the text away.
 */
function scrub(input: string): Readonly<{ text: string; found: readonly Redaction[] }> {
  const found: Redaction[] = [];
  let text = input;

  const apply = (re: RegExp, rule: string, why: string, to: string): void => {
    let count = 0;
    re.lastIndex = 0;
    text = text.replace(re, (...args) => {
      count += 1;
      // A capture group means the pattern keeps a prefix — the scheme of a URL,
      // the key half of a pair. `$1` in a string replacement would not work
      // here because `to` is a plain string, so the group is spliced by hand.
      const first = typeof args[1] === "string" ? args[1] : "";
      return first + to;
    });
    if (count > 0) found.push({ rule, why, count });
  };

  apply(SECRET_PAIR, "secret-key", "the field name names a credential", `"${REDACTED}"`);
  for (const p of VALUE_PATTERNS) apply(p.re, p.id, p.why, REDACTED);
  for (const p of HOME_PATTERNS) apply(p.re, p.id, p.why, p.to);

  return { text, found };
}

/**
 * Redact a raw stream — `stdoutRaw`, `stderr`.
 *
 * Line count is preserved, with one deliberate exception: a PEM block is one
 * secret that spans lines, and it is replaced whole. It is also not a thing that
 * appears inside a JSON document — inside one the newlines are escaped and the
 * key is a single line — so no structure is lost when it collapses.
 */
export function redactText(input: string): string {
  return scrub(input).text;
}

/** What redaction would rewrite. Drives T2.5 over a stored corpus. */
export function findSecrets(input: string): readonly Redaction[] {
  return scrub(input).found;
}
