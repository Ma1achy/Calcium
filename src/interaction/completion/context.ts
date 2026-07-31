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

  const opener = input[start];
  if (opener !== "'" && opener !== '"') return "";
  const closed = tokenise(`${source}${opener}`);
  return closed.ok ? (closed.value[0]?.text ?? "") : "";
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

function flagOf(manifest: Manifest, tokens: readonly Token[], name: string): FlagDef | null {
  const words = tokens.filter((t) => t.kind === "word").map((t) => t.text);
  const match = findTool(manifest, words.map(stripSlash));
  if (match === null) return null;
  return match.tool.flags.find((f) => f.name === name) ?? null;
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

  const words = tokens.filter((t) => t.kind === "word");
  const command = inCommandPosition(tokens, index);
  const tool =
    manifest === null ? null : (findTool(manifest, words.map((t) => stripSlash(t.text)))?.tool ?? null);

  return Object.freeze({
    input,
    cursor,
    tokens,
    tokenIndex: index,
    prefix,
    replace: Object.freeze({ start, end }),
    tool,
    slot: slotAt({ prefix, command, manifest, tokens, index, tool }),
  });
}

function slotAt(
  a: Readonly<{
    prefix: string;
    command: boolean;
    manifest: Manifest | null;
    tokens: readonly Token[];
    index: number;
    tool: ToolDef | null;
  }>,
): Slot {
  const { prefix, command, manifest, tokens, index, tool } = a;

  // D25, and it is one character: `/` is the manifest's namespace and bare text
  // is the filesystem's, never both (I14).
  if (command) {
    return prefix.startsWith("/") ? Object.freeze({ kind: "verb" }) : Object.freeze({ kind: "executable" });
  }

  if (prefix.startsWith("--")) {
    const eq = prefix.indexOf("=");
    if (eq === -1) return Object.freeze({ kind: "flagName" });
    if (manifest === null) return NONE;
    const flag = flagOf(manifest, tokens, prefix.slice(2, eq));
    return flag === null ? NONE : Object.freeze({ kind: "flagValue", flag });
  }

  // `--flag value`, the space-separated form C05's gate also accepts.
  const previous = tokens[index - 1];
  if (previous !== undefined && previous.kind === "word" && previous.text.startsWith("--")) {
    const name = previous.text.slice(2);
    const flag = manifest === null ? null : flagOf(manifest, tokens, name);
    if (flag !== null && flag.type !== "bool") return Object.freeze({ kind: "flagValue", flag });
  }

  if (tool !== null) {
    const consumed = countPositionals(tokens, index);
    const arg = tool.args[consumed];
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

/** How many positionals sit between the command and the cursor. */
function countPositionals(tokens: readonly Token[], index: number): number {
  let n = 0;
  let seenCommand = false;
  for (let i = 0; i < index; i += 1) {
    const t = tokens[i] as Token;
    if (t.kind === "operator") {
      seenCommand = false;
      n = 0;
      continue;
    }
    if (!seenCommand) {
      seenCommand = true;
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
