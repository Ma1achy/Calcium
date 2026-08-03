/**
 * Where the cursor is, and therefore what is being completed.
 *
 * C19 §2 — see spec. Pure: input and a cursor in, a `CompletionContext` out. No
 * source is consulted here, so every slot rule is testable as a table of strings
 * (T1.1).
 *
 * **Everything is in the tokeniser's coordinate system** (I5). `cursor` is a
 * code-unit offset, token spans are code-unit offsets, and the arithmetic below
 * never leaves that space. C17's grapheme cursor is converted at L4's seam, not
 * here — a component holding two coordinate systems eventually reads one in the
 * other's arithmetic.
 */

import {
  findTool,
  quote,
  tokenise,
  type FlagDef,
  type Manifest,
  type Token,
  type ToolDef,
} from "./deps.js";
import type { Acceptance, Candidate, CompletionContext, Slot } from "./types.js";

const NONE: Slot = Object.freeze({ kind: "none" });

/**
 * The word before this one, skipping nothing.
 *
 * Command position is the word at the start of the line or the word after an
 * operator (C18 §4). Asked of the token list rather than of the index, because
 * `ls | gre` puts the executable at index 2 and "the first token" answers
 * `positional` there — I14's executable half failing silently.
 */
function inCommandPosition(tokens: readonly Token[], index: number): boolean {
  const prev = tokens[index - 1];
  return prev === undefined || prev.kind === "operator";
}

/**
 * The unquoted text of a token's source between `start` and the cursor.
 *
 * Run through C18's tokeniser rather than sliced and stripped by hand (I5, SS30).
 * A half-typed quoted token is unterminated on its own, so the opening quote is
 * closed before re-tokenising — closing a quote to *read* it is not the silent
 * close C18 §3 refuses, which is about running a line the user did not type.
 */
function unquotedPrefix(input: string, start: number, cursor: number): string {
  const source = input.slice(start, cursor);
  const first = tokenise(source);
  if (first.ok) return first.value[0]?.text ?? "";

  // **Either quote, and it need not open the token** (§8b row 1). The first
  // version only retried when the token's *first* character was a quote, so
  // `--status="ru` — where the quote opens partway through — fell through to
  // the empty string, and an empty prefix means no slot and no candidates.
  // Completing inside a quoted flag value offered nothing at all.
  for (const closer of ["'", '"']) {
    const closed = tokenise(`${source}${closer}`);
    if (closed.ok) return closed.value[0]?.text ?? "";
  }
  return "";
}

/**
 * The first token of the command the cursor is in (§8b row 2).
 *
 * A line is several commands when it holds operators, and every question below
 * — which tool, which flag, which positional — is about *this* one. Asking the
 * whole token list makes `ls | /ps --st` resolve `findTool(["ls", "ps"])`,
 * which is nothing, so no flag after a pipe ever completed.
 */
function segmentStart(tokens: readonly Token[], index: number): number {
  for (let i = index - 1; i >= 0; i -= 1) {
    if ((tokens[i] as Token).kind === "operator") return i + 1;
  }
  return 0;
}

/** The token the cursor sits in or immediately after, and its index. */
function locate(
  tokens: readonly Token[],
  cursor: number,
): Readonly<{ token: Token | null; index: number }> {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i] as Token;
    if (cursor >= t.start && cursor <= t.end) return { token: t, index: i };
    if (cursor < t.start) return { token: null, index: i };
  }
  return { token: null, index: tokens.length };
}

/** The words of the current command, up to but excluding the one being typed. */
function segmentWords(tokens: readonly Token[], from: number, index: number): readonly string[] {
  const out: string[] = [];
  for (let i = from; i < index; i += 1) {
    const t = tokens[i] as Token;
    if (t.kind === "word") out.push(stripSlash(t.text));
  }
  return out;
}

function flagOf(tool: ToolDef | null, name: string): FlagDef | null {
  return tool?.flags.find((f) => f.name === name) ?? null;
}

function stripSlash(text: string): string {
  return text.startsWith("/") ? text.slice(1) : text;
}

/**
 * Build the context.
 *
 * `manifest` is `null` before C22 loads one; every manifest-backed slot then
 * resolves `tool` to null and the sources return nothing, which is the same path
 * a tool the manifest does not name already takes.
 */
export function contextAt(
  input: string,
  cursor: number,
  manifest: Manifest | null,
): CompletionContext {
  const empty = {
    input,
    cursor,
    tokens: Object.freeze([]) as readonly Token[],
    tokenIndex: 0,
    prefix: "",
    replace: Object.freeze({ start: cursor, end: cursor }),
    tool: null,
    slot: NONE,
  } as const;

  const result = tokenise(input);
  // Unbalanced quotes offer nothing rather than something wrong (T3.16). The
  // tokeniser is the only thing that decides this, so completion and execution
  // disagree about no input at all.
  if (!result.ok) return Object.freeze(empty);

  const tokens = result.value;
  const { token, index } = locate(tokens, cursor);

  const start = token === null ? cursor : token.start;
  const prefix = token === null ? "" : unquotedPrefix(input, start, cursor);

  // The ruling of §5: inside quotes the whole span goes, because there is no
  // tail in the shell's sense — the quotes are what make the run one value.
  const end = token !== null && token.quoted ? token.end : cursor;

  // Everything below is a question about *this* command, not the line (§8b
  // row 2). Asking the whole token list is why no flag after a pipe completed.
  const from = segmentStart(tokens, index);
  const command = inCommandPosition(tokens, index);
  const match =
    manifest === null ? null : findTool(manifest, segmentWords(tokens, from, index));
  const tool = match?.tool ?? null;

  const slot = slotAt({
    prefix,
    command,
    tokens,
    from,
    index,
    tool,
    consumed: match?.consumed ?? 0,
  });

  // **`--flag=value` is two things in one token, and `prefix` must be the
  // second.** A candidate for a flag-value slot is the *value*, so matching it
  // against `--status=ru` matches nothing — every candidate is filtered away
  // and the menu is empty however many the source returned. Acceptance has the
  // same problem from the other end: replacing the whole token would rewrite
  // the flag name it is not completing.
  //
  // **The `=` is found in the source, not in the unquoted text**, which is what
  // makes this work for `--status="ru"` as well. The first version indexed the
  // unquoted prefix and had to exclude quoted tokens to stay correct — and the
  // exclusion put quoted flag values straight back into the empty-menu case it
  // was fixing (§8b row 1).
  if (slot.kind === "flagValue" && token !== null) {
    const eq = input.indexOf("=", token.start);
    if (eq !== -1 && eq < cursor) {
      return Object.freeze({
        input,
        cursor,
        tokens,
        tokenIndex: index,
        prefix: unquotedPrefix(input, eq + 1, cursor),
        replace: Object.freeze({ start: eq + 1, end }),
        tool,
        slot,
      });
    }
  }

  return Object.freeze({
    input,
    cursor,
    tokens,
    tokenIndex: index,
    prefix,
    replace: Object.freeze({ start, end }),
    tool,
    slot,
  });
}

function slotAt(
  a: Readonly<{
    prefix: string;
    command: boolean;
    tokens: readonly Token[];
    from: number;
    index: number;
    tool: ToolDef | null;
    consumed: number;
  }>,
): Slot {
  const { prefix, command, tokens, from, index, tool, consumed } = a;

  // D25, and it is one character: `/` is the manifest's namespace and bare text
  // is the filesystem's, never both (I14).
  if (command) {
    return prefix.startsWith("/") ? Object.freeze({ kind: "verb" }) : Object.freeze({ kind: "executable" });
  }

  if (prefix.startsWith("--")) {
    const eq = prefix.indexOf("=");
    if (eq === -1) return Object.freeze({ kind: "flagName" });
    const flag = flagOf(tool, prefix.slice(2, eq));
    return flag === null ? NONE : Object.freeze({ kind: "flagValue", flag });
  }

  // `--flag value`, the space-separated form C05's gate also accepts. Only
  // within this command: `index - 1` may be an operator, and an operator's
  // `text` never starts with `--`, so the segment bound is belt to that brace.
  const previous = index > from ? tokens[index - 1] : undefined;
  if (previous !== undefined && previous.kind === "word" && previous.text.startsWith("--")) {
    const flag = flagOf(tool, previous.text.slice(2));
    if (flag !== null && flag.type !== "bool") return Object.freeze({ kind: "flagValue", flag });
  }

  if (tool !== null) {
    const n = countPositionals(tokens, from, index, tool, consumed);
    const arg = tool.args[n];
    if (arg !== undefined) {
      return arg.type === "path"
        ? Object.freeze({ kind: "path" })
        : Object.freeze({ kind: "positional", arg });
    }
    return NONE;
  }

  // A bare command line whose verb is nobody's: its arguments are paths.
  return Object.freeze({ kind: "path" });
}

/**
 * How many positionals sit between the tool's name and the cursor (§8b rows 3
 * and 4).
 *
 * Two things the first version got wrong, and both are structural interactions
 * that no sequence of events would have exposed.
 *
 * **`consumed`, not "the first token".** A tool name may be several words —
 * `serving scale` is one verb (C05 §2) — so counting from index 1 makes `scale`
 * the first positional and every argument resolves one slot late. `findTool`
 * already answers this and the answer was being thrown away.
 *
 * **A space-separated flag's value is not a positional.** C05's gate accepts
 * `--flag value` as well as `--flag=value`, so the word after a value-taking
 * flag belongs to that flag. Counted as a positional it shifts everything after
 * it, and on a tool with one argument the slot becomes `none` — the menu simply
 * stops appearing, with nothing to indicate why.
 */
function countPositionals(
  tokens: readonly Token[],
  from: number,
  index: number,
  tool: ToolDef,
  consumed: number,
): number {
  let n = 0;
  let seenWords = 0;
  let skipNext = false;

  for (let i = from; i < index; i += 1) {
    const t = tokens[i] as Token;
    if (t.kind !== "word") continue;
    seenWords += 1;
    if (seenWords <= consumed) continue; // still inside the tool's own name

    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (t.text.startsWith("--")) {
      const eq = t.text.indexOf("=");
      if (eq === -1) {
        const flag = flagOf(tool, t.text.slice(2));
        skipNext = flag !== null && flag.type !== "bool";
      }
      continue;
    }
    if (t.text.startsWith("-")) continue;
    n += 1;
  }
  return n;
}

/**
 * What accepting a candidate replaces, and with what (I16).
 *
 * One range and one string, so C17 applies it as a single edit and a single
 * `undo` reverts the whole insertion (I11). `whole` is false for a common
 * prefix, which is the asymmetry the second `Tab` depends on: an unfinished
 * token takes no delimiter, so pressing `Tab` again reaches the menu.
 */
export function accept(
  ctx: CompletionContext,
  candidate: Candidate,
  whole: boolean,
): Acceptance {
  const current = ctx.tokens[ctx.tokenIndex];
  const quoted = current !== undefined && current.quoted;
  const needsQuote = quoted || quote(candidate.value) !== candidate.value;

  const text = needsQuote ? quote(candidate.value) : candidate.value;
  const delimiter = whole ? (candidate.delimiter ?? " ") : "";

  return Object.freeze({
    start: ctx.replace.start,
    end: ctx.replace.end,
    text: `${text}${delimiter}`,
  });
}
