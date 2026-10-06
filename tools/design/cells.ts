/**
 * The design's figures and the framework's frames as **cell grids in one
 * vocabulary** — the comparison M16's mark set could not make (b5-fixcolour).
 *
 * `figures.ts` compares the set of non-ASCII marks each side draws, and says
 * what that cannot see: tone, ground, weight, position, and every section
 * classed `app`. The design-check of 2026-10-03 found fifteen divergences in
 * exactly those channels, and every one of them passed M16. This module is the
 * substrate for the comparison that sees them:
 *
 *   - **the design side** is the registry's own projection, not the plain-text
 *     fixture: `sectionBlocks[].renderHtml` carries each figure as `<span
 *     class="c-muted bg-bgElev bold">`, so a cell's tone, ground and weight are
 *     data rather than something a reader infers from a picture;
 *   - **the frame side** is the framework's SGR, folded to cells, with every
 *     colour **named back into the registry's tokens** through the registry's
 *     own `themeRules` — so both sides are in the registry's vocabulary, and a
 *     theme whose hex drifted from the registry reads as an unnamed `#hex`
 *     rather than as a match.
 *
 * **What a cell carries**: the grapheme, its column (`cells()`, never
 * `.length`), the fg token, the bg token, and bold / dim / underline. The page
 * ground (`bg-bg`, `.term`'s background) is folded to *no ground* on both
 * sides, because a frame that paints the base and one that leaves it to the
 * terminal draw the same picture.
 *
 * **What the registry cannot carry**, measured rather than assumed: the design
 * never draws SGR dim — `c-dim` is a colour (`#8a8a8a` in `dark`), so `dim` is
 * a frame-side property only, and a frame that dims is compared as a weight the
 * figure has no word for. Italic is in the figures (`ital`, five spans) and is
 * compared. Motion is not: a spinner slot is an empty span CSS fills, drawn as
 * `✦` exactly as `fixtures.ts` draws it, so a frame's spinner frame reads as a
 * different glyph.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cells, graphemes } from "../../src/presentation/text.js";

export const REGISTRY = "docs/design/language/calcium-registry.json";

export type Cell = Readonly<{
  ch: string;
  col: number;
  /** A registry token (`muted`, `syn-keyword`), `default`, or an unnamed `#rrggbb`. */
  fg: string;
  /** A registry ground (`bgElev`), `""` for none, or an unnamed `#rrggbb`. */
  bg: string;
  bold: boolean;
  dim: boolean;
  ul: boolean;
}>;

export type Grid = readonly (readonly Cell[])[];

type SectionBlock = Readonly<{ id: string; sectionKey: string; position: number; renderHtml: string }>;
type ThemeRule = Readonly<{ selector: string; declarations: string; status: string }>;
type Registry = Readonly<{ sectionBlocks: readonly SectionBlock[]; themeRules: readonly ThemeRule[] }>;

const loaded = new Map<string, Registry>();
function registry(root: string): Registry {
  const held = loaded.get(root);
  if (held !== undefined) return held;
  const r = JSON.parse(readFileSync(join(root, REGISTRY), "utf8")) as Registry;
  loaded.set(root, r);
  return r;
}

/** The section number a block's key ends in — `…-activity-present-003` is §3. */
const sectionOf = (key: string): number => Number(/(\d{3})$/u.exec(key)?.[1] ?? Number.NaN);

/** The five named entities and every numeric reference, as `fixtures.ts` decodes them. */
function decode(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return named[body.toLowerCase()] ?? whole;
  });
}

/**
 * Whether a token is drawn bold by the registry's own declarations.
 *
 * **Derived, not listed**: `c-pickInk`, `c-linkInk`, `c-chosenInk` and every
 * `c-hi-*` declare `font-weight:600` in `themeRules`, so a cell in one of them
 * is bold in the figure without a `bold` class — a hand list would be the
 * fourth copy of a fact the registry already holds.
 */
function weightedTokens(root: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const t of registry(root).themeRules) {
    if (t.status !== "current" || !/font-weight:\s*(600|700|bold)/u.test(t.declarations)) continue;
    for (const m of t.selector.matchAll(/\.c-([\w-]+)/gu)) out.add(m[1]!);
  }
  return out;
}

/**
 * A section's figure as a cell grid — the section's one `<pre class=term>`.
 *
 * Classes accumulate down the span stack and the innermost wins per channel,
 * which is how the cascade resolves them on the page. An empty spinner span is
 * drawn `✦`, as `fixtures.ts` draws it.
 */
export function designGrid(section: number, root = "."): Grid {
  // **A figure is its section's blocks joined in position order, from the
  // first `<pre class=term>` to its close** — the span `fixtures.ts` takes from
  // the page. The `<pre>` opens in one block and closes in a later one, each
  // block between a run of its lines, so the first draft, which took the block
  // opening with `<pre`, read §081 as its one-line caption.
  const joined = registry(root)
    .sectionBlocks.filter((b) => sectionOf(b.sectionKey) === section)
    .sort((a, b) => a.position - b.position)
    .map((b) => b.renderHtml)
    .join("");
  const pre = /<pre class=term>([\s\S]*?)<\/pre>/u.exec(joined);
  if (pre === null) throw new Error(`§${String(section)} has no figure in the registry`);
  const bold = weightedTokens(root);
  const html = pre[1]!
    .replace(/(<span class="[^"]*\bsp\b[^"]*"[^>]*>)(<\/span>)/gu, "$1✦$2");
  const stack: (readonly string[])[] = [];
  const rows: Cell[][] = [[]];
  let col = 0;
  for (const m of html.matchAll(/<span(?:\s+class="?([^">]*)"?)?[^>]*>|<\/span>|<[^>]+>|([^<]+)/gu)) {
    if (m[0].startsWith("<span")) {
      stack.push((m[1] ?? "").split(/\s+/u).filter((c) => c !== ""));
      continue;
    }
    if (m[0] === "</span>") {
      stack.pop();
      continue;
    }
    if (m[2] === undefined) continue;
    const classes = stack.flat();
    let fg = "default";
    let bg = "";
    for (const c of classes) {
      if (c.startsWith("bg-")) bg = c.slice(3) === "bg" ? "" : c.slice(3);
      else if (c.startsWith("c-")) fg = c.slice(2);
      else if (c.startsWith("syn-") || c.startsWith("cat-")) fg = c;
    }
    const style = {
      fg,
      bg,
      bold: classes.includes("bold") || bold.has(fg),
      dim: false,
      ul: classes.includes("ul") || classes.includes("uldot"),
    };
    for (const g of graphemes(decode(m[2]))) {
      if (g === "\n") {
        rows.push([]);
        col = 0;
        continue;
      }
      rows[rows.length - 1]!.push(Object.freeze({ ch: g, col, ...style }));
      col += cells(g);
    }
  }
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.ch === " " && c.bg === "")) rows.pop();
  return rows;
}

/**
 * The registry's `dark` declarations, inverted: a hex names the token it is.
 *
 * **Contextual rules name their base token** — `.bg-focusGround .c-muted` is
 * muted lifted for its ground, and a frame painting `#969696` on `focusGround`
 * is drawing `muted`. Where two tokens share a hex the name is both, joined by
 * `|`, and `sameToken` reads the overlap.
 */
export function tokenNames(theme = "dark", root = "."): Readonly<{ fg: ReadonlyMap<string, string>; bg: ReadonlyMap<string, string> }> {
  const fg = new Map<string, Set<string>>();
  const bg = new Map<string, Set<string>>();
  const add = (into: Map<string, Set<string>>, hex: string, name: string): void => {
    const key = expand(hex);
    (into.get(key) ?? into.set(key, new Set()).get(key)!).add(name);
  };
  for (const t of registry(root).themeRules) {
    if (t.status !== "current" || !t.selector.includes(`"${theme}"`)) continue;
    const colour = /(?:^|;)\s*color:\s*(#[0-9a-f]{3,6})/iu.exec(t.declarations)?.[1];
    const ground = /(?:^|;)\s*background:\s*(#[0-9a-f]{3,6})/iu.exec(t.declarations)?.[1];
    if (colour !== undefined) {
      const named = [...t.selector.matchAll(/\.(c-[\w-]+|syn-[\w-]+|cat-[\w-]+)/gu)].map((m) => m[1]!);
      const last = named[named.length - 1];
      if (last !== undefined) add(fg, colour, last.startsWith("c-") ? last.slice(2) : last);
    }
    if (ground !== undefined) {
      const named = [...t.selector.matchAll(/\.bg-([\w-]+)/gu)].map((m) => m[1]!);
      const last = named[named.length - 1];
      if (last !== undefined) add(bg, ground, last === "bg" ? "" : last);
      else if (/\.term\b/u.test(t.selector)) add(bg, ground, "");
    }
  }
  const flat = (m: Map<string, Set<string>>): ReadonlyMap<string, string> =>
    new Map([...m].map(([k, v]) => [k, [...v].sort().join("|")]));
  return { fg: flat(fg), bg: flat(bg) };
}

const expand = (hex: string): string => {
  const h = hex.toLowerCase().replace(/^#/u, "");
  return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`;
};

/** Whether two token readings name one token — `a|b` against `b` does. */
export const sameToken = (a: string, b: string): boolean => {
  if (a === b) return true;
  const right = new Set(b.split("|"));
  return a.split("|").some((t) => right.has(t));
};

const hexOf = (params: readonly number[]): string | null =>
  params[1] === 2 ? `#${params.slice(2, 5).map((n) => n.toString(16).padStart(2, "0")).join("")}` : null;

/**
 * Rows of SGR as a cell grid, colours named through `tokenNames`.
 *
 * The fold is `styled-screen.ts`'s channel model — `0` clears, `39`/`49` one
 * channel, `22 24` their attributes — over graphemes placed by `cells()`, so a
 * wide glyph takes two columns as it does on a terminal. A 256- or 16-colour
 * value is kept as its parameters: the comparison runs at 24 bits, where every
 * shipped token is a hex, and a frame at another depth is not the figure's rung.
 */
export function frameGrid(lines: readonly string[], theme = "dark", root = "."): Grid {
  const names = tokenNames(theme, root);
  return lines.map((line) => {
    const out: Cell[] = [];
    let fg = "default";
    let bg = "";
    let bold = false;
    let dim = false;
    let ul = false;
    let col = 0;
    for (const m of line.matchAll(/\u001b\[([0-9;]*)m|\u001b\[[0-9;?]*[A-Za-z]|([^\u001b]+)/gu)) {
      if (m[2] !== undefined) {
        for (const g of graphemes(m[2])) {
          out.push(Object.freeze({ ch: g, col, fg, bg, bold, dim, ul }));
          col += cells(g);
        }
        continue;
      }
      if (m[1] === undefined) continue;
      const ps = m[1] === "" ? [0] : m[1].split(";").map(Number);
      for (let i = 0; i < ps.length; i += 1) {
        const p = ps[i]!;
        if (p === 0) {
          fg = "default";
          bg = "";
          bold = dim = ul = false;
        } else if (p === 38 || p === 48) {
          const take = ps[i + 1] === 2 ? 5 : ps[i + 1] === 5 ? 3 : 1;
          const hex = hexOf(ps.slice(i, i + take));
          const value = hex === null ? ps.slice(i, i + take).join(";") : hex;
          if (p === 38) fg = hex === null ? value : (names.fg.get(hex) ?? hex);
          else bg = hex === null ? value : (names.bg.get(hex) ?? hex);
          i += take - 1;
        } else if (p === 39) fg = "default";
        else if (p === 49) bg = "";
        else if (p === 1) bold = true;
        else if (p === 2) dim = true;
        else if (p === 4) ul = true;
        else if (p === 22) bold = dim = false;
        else if (p === 24) ul = false;
        else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) fg = String(p);
        else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) bg = String(p);
      }
    }
    return out.map(settle);
  });
}

/**
 * The ground a `*Ink` or `hi-*` token is declared against — `pickInk` on
 * `pick`, `errorInk` on `errorGround`, `hi-cyan` on `h-cyan`.
 */
const partnerOf = (ink: string): string | null =>
  ink.endsWith("Ink") ? ink.slice(0, -3) : ink.startsWith("hi-") ? `h-${ink.slice(3)}` : null;

/**
 * One cell's names, settled. **The default ink is the page's**: `.c-default`
 * is what the figure draws with no class, so a frame naming it explicitly and
 * one leaving it to the terminal draw the same cell.
 *
 * **An ink shared by twelve tokens is named by its ground.** `#000000` is
 * `pickInk`, `linkInk`, `chosenInk` and nine `hi-*` in `dark`, and which one a
 * cell means is said by what it is drawn on — the registry declares each ink
 * for one ground. Where the ground does not settle it the name stays joined.
 */
function settle(c: Cell): Cell {
  if (c.fg === "default" || sameToken(c.fg, "default")) return { ...c, fg: "default" };
  if (!c.fg.includes("|") || c.bg === "") return c;
  const onGround = c.fg.split("|").filter((ink) => {
    const partner = partnerOf(ink);
    return partner !== null && (c.bg === partner || c.bg.split("|").some((g) => g === partner || g === `${partner}Ground`));
  });
  return onGround.length === 1 ? { ...c, fg: onGround[0]! } : c;
}

/**
 * A styled screen (`styled-screen.ts`'s fold of a session's writes) as a cell
 * grid in the registry's vocabulary.
 *
 * That fold keeps a colour as its SGR parameters — `38;2;r;g;b` — and places
 * one JavaScript character per cell; this names each colour as `frameGrid`
 * does and keeps the fold's columns, so a session frame and a block frame are
 * read by one comparison.
 */
export function screenGrid(
  screen: readonly (readonly Readonly<{ ch: string; style: Readonly<{ fg: string; bg: string; attrs: readonly number[] }> }>[])[],
  theme = "dark",
  root = ".",
): Grid {
  const names = tokenNames(theme, root);
  const name = (value: string, into: ReadonlyMap<string, string>): string => {
    const hex = hexOf(value.split(";").map(Number));
    return hex === null ? value : (into.get(hex) ?? hex);
  };
  return screen.map((row) =>
    row.map((c, col) => {
      return Object.freeze(
        settle({
          ch: c.ch,
          col,
          fg: c.style.fg === "" ? "default" : name(c.style.fg, names.fg),
          bg: c.style.bg === "" ? "" : name(c.style.bg, names.bg),
          bold: c.style.attrs.includes(1),
          dim: c.style.attrs.includes(2),
          ul: c.style.attrs.includes(4),
        }),
      );
    }),
  );
}

/** A cell's style, as one comparable string — `fg=muted bg=bgElev bold`. */
export const styleOf = (c: Cell): string =>
  [`fg=${c.fg}`, `bg=${c.bg === "" ? "—" : c.bg}`, ...(c.bold ? ["bold"] : []), ...(c.dim ? ["dim"] : []), ...(c.ul ? ["ul"] : [])].join(" ");

/** A row's text, trailing blanks dropped. */
export const rowText = (row: readonly Cell[]): string => row.map((c) => c.ch).join("").trimEnd();

/** The distinct styles over some cells, sorted — what a subject is drawn in. */
export const stylesOf = (cs: readonly Cell[]): readonly string[] => [...new Set(cs.map(styleOf))].sort();
