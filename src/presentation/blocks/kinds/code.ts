/**
 * `code` — the one kind that names a palette other than `tone` (§4a).
 *
 * Three rules govern it, and each exists because of a different failure:
 *
 *   - **Tokenisation happens at render, never in the adapter.** Adapters are
 *     pure and must not do work proportional to content length (C07): most
 *     documents are never scrolled to, and highlighting a manifest on the way in
 *     pays for every one of them.
 *   - **Measurement ignores syntax entirely.** Tokens change appearance, never
 *     line count, so `measure` never tokenises (T2.13). A `code` block therefore
 *     measures identically whether or not its language is registered — a grammar
 *     shipping tomorrow does not reflow yesterday's transcript.
 *   - **An unregistered language renders as plain text, not an error** — the
 *     same principle as C07's fallback adapter.
 */
import type { ReactElement } from "react";
import { createLowlight } from "lowlight";
import type { LanguageFn } from "highlight.js";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Code } from "../../../data/viewmodel/index.js";
import { expandTabs, hardWrapCells, stripControl, truncateParts } from "../../text.js";
import { paint, rows, slot, tone, type Span } from "../paint.js";
import type { BlockDefinition, RenderContext } from "../types.js";

/**
 * The default set (§4a, I23), and the **rule** rather than a list, so the next
 * one is an argument instead of a taste: a grammar ships if a terminal user
 * plausibly reads it *in this window*.
 *
 * The formats a CLI emits — `json` `yaml` `xml` `ini` `diff` `markdown`. The
 * ones it is configured by — `dockerfile` `sql` `css`. The shell it is typed
 * into — `bash`. And the languages CLIs are written in, because a stack trace
 * lands in a transcript — `typescript` `javascript` `python` `go` `rust` `java`.
 *
 * **Measured: 121 KB against the package's 9.2 MB** (F93). DEPENDENCIES.md's
 * objection is to the 384 and survives intact — the full set is most of the
 * weight and none of the value. What changed is that *actually needed* had been
 * measured against two consumers, `docker inspect` and an nginx config, and two
 * grammars satisfied every test in the suite.
 */
const DEFAULT_GRAMMARS = {
  bash, css, diff, dockerfile, go, ini, java, javascript,
  json, markdown, python, rust, sql, typescript, xml, yaml,
};

/** The set, for the row that asserts every member of it colours something (T3.32). */
export const DEFAULT_LANGUAGES: readonly string[] = Object.freeze(
  Object.keys(DEFAULT_GRAMMARS).sort(),
);

const lowlight = createLowlight(DEFAULT_GRAMMARS);

/**
 * `hljs` class → palette slot, explicit rather than derived (§4a).
 *
 * A derived mapping changes silently when the upstream grammar does. This one
 * changes when someone edits it.
 */
const SLOTS: Readonly<Record<string, string>> = Object.freeze({
  "hljs-keyword": "keyword",
  "hljs-string": "string",
  "hljs-comment": "comment",
  "hljs-number": "number",
  "hljs-literal": "number",
  "hljs-attr": "key",
  "hljs-attribute": "key",
  "hljs-type": "type",
  "hljs-built_in": "type",
  "hljs-title": "function",
  "hljs-function": "function",
  "hljs-operator": "operator",
  "hljs-punctuation": "punctuation",

  // **Added with the default set, by rôle rather than by name** (I24, F93).
  // `SLOTS` was written for `json` and `yaml`; shipping fourteen more grammars
  // without extending it ships grammars that highlight nothing — `markdown`
  // emitted four runs and coloured none of them, which is indistinguishable
  // from not registering it at all.
  "hljs-section": "keyword", // a heading is the structural anchor a keyword is
  "hljs-bullet": "punctuation", // a list marker
  "hljs-code": "string", // inline code is a literal run
  "hljs-subst": "string", // and a template substitution is inside one
  "hljs-variable": "key", // a name being referenced; `key` is the name slot
  "hljs-name": "type", // an element name names a kind
  "hljs-selector-class": "type", // so does a selector
  "hljs-selector-tag": "type",
  "hljs-selector-id": "type",
  "hljs-meta": "keyword", // a decorator or a shebang
  "hljs-tag": "punctuation", // the angle brackets around the name
});

/**
 * The distinct slots `SLOTS` maps to — C10's manifest is checked against this.
 *
 * **Derived, not restated.** Fourteen `hljs-*` classes map onto nine slots, and
 * a fifteenth mapped to a tenth is a slot every theme would render uncoloured
 * with nothing saying so (C10 I30). The set is what a theme owes; the map is how
 * a grammar reaches it.
 */
export const SYNTAX_SLOTS: readonly string[] = Object.freeze([...new Set(Object.values(SLOTS))]);

/**
 * Classes the default set emits that deliberately have no slot (I24).
 *
 * Read by T3.32, so an omission that starts being mapped is a stale entry rather
 * than a silent pass — the bidirectional arm MG27 and SS47 both have.
 */
export const UNSLOTTED: Readonly<Record<string, string>> = Object.freeze({
  "hljs-params": "parameters are ordinary identifiers and are meant to be plain",
  "hljs-strong": "bold is appearance, not a rôle, and §4a maps rôles to palette slots",
  "hljs-emphasis": "italic is appearance, not a rôle, on the same terms as hljs-strong",
  "hljs-addition":
    "a change axis, and C04's ruling says a change is a marker and never a tone (F30, F81). " +
    "A real diff is C25's, where the marker column is",
  "hljs-deletion":
    "the other half of the change axis, refused a slot by the same ruling as hljs-addition",
});

/**
 * A run of source text and the slot it belongs to, or none for the default tone.
 *
 * Exported because C25 renders code inside a diff line and C25 §4 says it does not
 * tokenise: it calls this tokeniser and resolves the slots itself. That keeps the
 * memo in one place and keeps `measure` free of it on both sides.
 */
export type Token = Readonly<{ text: string; slot: string | null }>;

/**
 * Memoised on `(text, language)` (§4a) — what keeps a re-render of the same
 * block free. A transcript re-renders on every frame; tokenising it on every
 * frame would make scrolling a highlighted document cost more than producing it.
 */
const memo = new Map<string, readonly Token[]>();

/** Bounded, so a long session cannot grow the cache without limit. */
const MEMO_CAP = 256;

export function tokenise(text: string, language: string): readonly Token[] {
  // `\u0000` explicitly, and it is the right separator rather than an accident:
  // a NUL cannot occur in a language name, so no pair of (language, text) can
  // collide with another by straddling it. Written as an escape because it was a
  // literal NUL until SS43, where it read as a space to every reader and every
  // diff.
  const key = `${language}\u0000${text}`;
  const held = memo.get(key);
  if (held !== undefined) return held;

  const tokens = lowlight.registered(language)
    ? flatten(lowlight.highlight(language, text) as HastNode, null)
    : [{ text, slot: null }];

  if (memo.size >= MEMO_CAP) memo.clear();
  memo.set(key, tokens);
  return tokens;
}

/**
 * Register a grammar after construction (I23, C24 I22, F93).
 *
 * **The `memo.clear()` is half the invariant, not a tidy-up.** `tokenise` caches
 * the *fallback* under the same key, so without it a language registered after
 * anything has been rendered keeps returning plain text until the 256-entry cap
 * happens to evict — and §4a's *"highlighted whenever someone registers it"*
 * stays false with a registration path in place. Every assertion about this
 * function existing passes either way; the case that fails is the block that was
 * already on screen, which is the only reason the promise was worth making.
 *
 * Clearing the whole map rather than the affected keys: the key is
 * `language\u0000text` and finding one language's entries is a scan of up to 256
 * strings, against a re-tokenise of whatever is still visible. Registration
 * happens at composition, once.
 *
 * **Measurement is unaffected**, which is what makes this safe at any time: a
 * token changes appearance and never line count (I8), so nothing reflows.
 */
export function registerGrammar(language: string, grammar: LanguageFn): void {
  lowlight.register(language, grammar);
  memo.clear();
}

/** For the test that asserts measurement never tokenises (T2.13). */
export function tokenisationCount(): number {
  return memo.size;
}

/**
 * What this file needs from a hast tree, and nothing more.
 *
 * Structural rather than imported from `@types/hast`: the shape is three fields
 * deep, the types package is a transitive dependency of `lowlight` rather than
 * one this repo declares, and DEPENDENCIES.md's bar for declaring one is not
 * met by a node shape that fits in six lines.
 */
type HastNode = Readonly<{
  type: string;
  value?: string | undefined;
  properties?: Readonly<{ className?: readonly string[] | string | undefined }> | undefined;
  children?: readonly HastNode[] | undefined;
}>;

/**
 * A hast tree to a flat run of tokens.
 *
 * An unmapped class renders its text in the default tone and is **never
 * dropped** (§4a). The fallback is a fallback, not a filter: dropping is the
 * failure mode where a grammar update makes half a file invisible.
 */
function flatten(node: HastNode, inherited: string | null): readonly Token[] {
  if (node.type === "text") {
    return node.value === undefined || node.value === "" ? [] : [{ text: node.value, slot: inherited }];
  }

  const classes = node.properties?.className;
  const list = typeof classes === "string" ? [classes] : (classes ?? []);
  let here = inherited;
  for (const name of list) {
    const mapped = SLOTS[name];
    if (mapped !== undefined) here = mapped;
  }

  const out: Token[] = [];
  for (const child of node.children ?? []) out.push(...flatten(child, here));
  return out;
}

/**
 * A rendered row: which source line it came from, and the slice of that line it
 * shows. Both halves build the same list, so a `wrap` that changed the row count
 * without changing the measured height is not expressible.
 */
type Row = Readonly<{ line: number; start: number; text: string }>;

/**
 * The rows a code block occupies, laid out identically by both halves.
 *
 * Tabs are expanded first (T3.16): a terminal advances to the next multiple of
 * eight, so a tab measured as one cell and drawn as eight diverges by seven per
 * tab, per line.
 */
function codeRows(block: Code, width: number): readonly Row[] {
  const source = expandTabs(stripControl(block.text));

  // A trailing newline terminates the last line rather than starting a blank
  // one. `"a\n"` is one line of code, and counting two makes every fixture with
  // a tidy trailing newline a row too tall.
  const body = source.endsWith("\n") ? source.slice(0, -1) : source;
  const lines = body.split("\n");

  if (block.wrap !== true) {
    return lines.map((text, line) => ({ line, start: 0, text }));
  }

  const out: Row[] = [];
  lines.forEach((text, line) => {
    let start = 0;
    for (const segment of hardWrapCells(text, normaliseWidth(width))) {
      out.push({ line, start, text: segment });
      start += segment.length; // cells-ok
    }
  });
  return out;
}

export const codeDefinition: BlockDefinition<Code> = {
  kind: "code",

  // No tokenisation here, and none reachable from here (T2.13). The height of a
  // code block is a property of its text, not of anyone's grammar — which is
  // what lets a language ship tomorrow without reflowing yesterday's transcript.
  measure: (block: Code, width: number): number =>
    atLeastOne(codeRows(block, width).length), // cells-ok

  render(block: Code, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const source = expandTabs(stripControl(block.text));
    const perLine = tokenLines(tokenise(source, block.language));
    const defaultStyle = tone("default", ctx.theme, ctx.capabilities);

    return rows(
      codeRows(block, width).map((row) => {
        // Every rendered row is an exact slice of its source line, so the
        // tokens — which are offsets into that line — slice against it.
        const { kept, suffix } = truncateParts(row.text, width, ctx.capabilities);
        const tokens = sliceTokens(perLine[row.line] ?? [], row.start, kept.length); // cells-ok

        const spans: Span[] = tokens.map((token) => ({
          text: token.text,
          style:
            token.slot === null
              ? defaultStyle
              : slot(`syntax.${token.slot}`, ctx.theme, ctx.capabilities),
        }));
        if (suffix !== "") spans.push({ text: suffix, style: defaultStyle });

        return paint(spans);
      }),
    );
  },
};

/**
 * The token stream, cut into one list per source line.
 *
 * Tokens can span a newline — a block comment is one token across four lines —
 * so the split happens here rather than being assumed away.
 */
function tokenLines(tokens: readonly Token[]): readonly (readonly Token[])[] {
  const out: Token[][] = [[]];
  for (const token of tokens) {
    const pieces = token.text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) out.push([]);
      if (piece !== "") out[out.length - 1]?.push({ text: piece, slot: token.slot }); // cells-ok
    });
  }
  return out;
}

/**
 * The tokens covering `[start, start + length)` of one source line, in order.
 *
 * Exported for C25: a diff line truncates rather than wraps, so the tokens have to
 * be cut to the kept portion, and cutting them twice in two files is how the two
 * come to disagree about where a token ends.
 */
export function sliceTokens(
  tokens: readonly Token[],
  start: number,
  length: number,
): readonly Token[] {
  const out: Token[] = [];
  let at = 0;

  for (const token of tokens) {
    const size = token.text.length; // cells-ok
    const from = Math.max(start, at);
    const to = Math.min(start + length, at + size);
    if (to > from) out.push({ text: token.text.slice(from - at, to - at), slot: token.slot });
    at += size;
    if (at >= start + length) break;
  }

  return out;
}
