/**
 * A named subset of markdown, translated into blocks (roadmap 11).
 *
 * **The subset is the scope, and writing it down is what keeps CommonMark out.**
 * An agent CLI emits a narrow dialect and this is it, exhaustively:
 *
 *     ATX headings        `#` … `######`
 *     fenced code         ``` or ~~~, with an optional info string
 *     pipe tables         a header row, a delimiter row, body rows
 *     bullet lists        `-` `*` `+`, nested by two-space indent
 *     ordered lists       `1.` `2.` …
 *     blockquotes         `>`
 *     paragraphs          everything else, blank-line separated
 *
 * Nothing else is markdown here. Setext headings, reference links, HTML blocks,
 * list tightness, lazy continuation and entity handling are **out by name**, not
 * by omission — a reader who finds one of them unhandled is looking at a
 * decision rather than at a gap. That is the whole reason there is no
 * dependency: `lowlight` was taken because a lexer per language is a large
 * domain where rendering is incidental, and this subset is neither large nor
 * open.
 *
 * **Inline emphasis is spans** (roadmap 50, C04 §3am): `**bold**` becomes the
 * four characters `bold` and a `TextSpan` over them; `*em*` and `_em_` become
 * italic. The literal form this replaces was kept until spans existed because
 * keeping markers is reversible and dropping them is not — and that day is
 * this one. **Inline code is a `tone: "identifier"` span** (C04 I89, C09 §5):
 * `` `x` `` becomes `x` with a span naming the slot the tree already uses for a
 * name one refers back to — a flag, a path, a symbol, a command — where `meta`
 * is the slot for timestamps and secondary detail. It was literal until the
 * span had a `tone` to carry (the deferral symbol was `TextSpan.tone`, and this
 * is the consumer that expired it). An **unclosed** backtick makes the rest of
 * the line literal, and an **empty** pair is two characters, exactly as an
 * unpaired `*` is one. Escapes (`\*`) are out by name with the rest of
 * CommonMark; an **unpaired** marker is literal, so `2 * 3` and `a_b` keep
 * their characters.
 *
 * Offsets are into the **emitted** text — the string with the markers gone —
 * because that is the member they decorate (C04 I84). Nested emphasis is
 * emitted as adjacent spans with combined attributes, since the type is sorted
 * and disjoint rather than nested (§3am cell 12).
 *
 * **Indexed capture groups, not named ones, and that is a finding rather than a
 * style.** The first version used `(?<text>…)` and read `m.groups?.["text"]` —
 * which made `make enforce` fail on an unrelated exemption: MG24 matches
 * published members **by name**, and `Identity.groups` in `UNCONSUMED_MEMBERS`
 * looked wired the moment any expression in `src/` said `.groups`. Fourth
 * measured instance of F105/F160's blind spot and the first where the thing
 * satisfying a member was not a member at all. Changing the exemption would
 * have been the other fix and is the wrong one: the member is still unconsumed,
 * and the census is worth more than the syntax.
 *
 * ## The three residues, closed (C04 §3an, I94, I95, I96)
 *
 * - **Heading levels reach three tiers.** `Rule.level` is `1 | 2 | 3` and the
 *   fill is the axis — heavy, light, blank. `#` → 1, `##` → 2, and `###`
 *   through `######` → 3: **four levels onto one form, stated here**, against
 *   six onto one in silence. The type says three because a terminal tells three
 *   apart, so a fourth tier fails to compile rather than being drawn as a third.
 * - **A blockquote has a rail.** `Glyph.quote` is drawn on **every** row of the
 *   notice rather than on the first (C09 I41), in the columns `prefixCells`
 *   already reserves — so it costs no geometry. Not `live`'s `▌`: F161's
 *   argument about a shared mark, and a measurement the argument does not reach
 *   — `▌` is Ambiguous and draws two cells on a terminal that says wide, where
 *   C09's rendering is Neutral. The tone is the block's, since a second tone on
 *   the gutter is a colour distinction and colour is gone at 1-bit.
 * - **Nesting caps at three levels and the cap is marked.** Two cells each, and
 *   an item past the cap takes `Glyph.nested` rather than `bullet` — so depth 3
 *   and depth 4 are not one frame. **The cap's reason is the measured one and
 *   not the recorded one**: uncapped at width 40 an item past about depth 15
 *   does not draw a wide indent, it draws *none* — the leading spaces are the
 *   wrapper's break, the first row is the mark alone, and the item reads as
 *   depth 0 having spent a row saying nothing.
 *
 * ## A blockquote's body is prose, out by name
 *
 * `> # Heading` is the six characters `# Head…` inside the rail, and `> - a`
 * keeps its `-`. Not an omission and not a deferral: the quote is **one**
 * `notice` and one notice has **one** `glyph`, so re-parsing the body would want
 * a rail on a `rule`, a `code` and a `table` — and none of the three has a slot
 * to hold one. It is unexpressible in the block vocabulary rather than unbuilt,
 * which is the difference between a residue and a gap (C04 I95).
 */

import { block } from "./construct.js";
import type { Block, ColumnDef, Glyph, HeadingLevel, TableRow, TextSpan } from "./types.js";

/** The inline pass's answer: the text with markers removed, and the spans over it. */
export type Inline = Readonly<{ text: string; spans?: readonly TextSpan[] }>;

/**
 * `**strong**`, `*em*`, `_em_` → attribute spans; `` `code` `` → a tone span;
 * unpaired markers literal.
 *
 * **A toggle per marker kind, after unpaired markers are struck.** Counting
 * each kind first is what makes a lone `*` a character rather than an emphasis
 * that runs to the end of the line: the last occurrence of any kind with an odd
 * count is treated as text. Inside a backtick run nothing toggles, and a code
 * run inside an emphasis is one span carrying the attribute and the tone
 * (C04 §3am cell 12 — adjacent and disjoint, never nested).
 */
export function inline(source: string): Inline {
  // Pass one: find the markers, skipping code runs, and note which are unpaired.
  type Mark = Readonly<{ at: number; kind: "**" | "*" | "_" }>;
  const marks: Mark[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (ch === "`") {
      const close = source.indexOf("`", i + 1);
      i = close === -1 ? source.length : close + 1;
      continue;
    }
    if (ch === "*" && source[i + 1] === "*") {
      marks.push({ at: i, kind: "**" });
      i += 2;
      continue;
    }
    if (ch === "*" || ch === "_") {
      marks.push({ at: i, kind: ch });
      i += 1;
      continue;
    }
    i += 1;
  }
  const literal = new Set<number>();
  for (const kind of ["**", "*", "_"] as const) {
    const ofKind = marks.filter((m) => m.kind === kind);
    if (ofKind.length % 2 === 1) literal.add(ofKind[ofKind.length - 1]?.at ?? -1);
  }

  // Pass two: emit, toggling at each paired marker and closing a span whenever
  // the attribute set changes.
  let text = "";
  const spans: TextSpan[] = [];
  let bold = false;
  let italic = false;
  let code = false;
  let segStart = 0;
  const flush = (): void => {
    if (text.length > segStart && (bold || italic || code)) {
      spans.push(
        Object.freeze({
          from: segStart,
          to: text.length,
          ...(bold ? { bold: true } : {}),
          ...(italic ? { italic: true } : {}),
          ...(code ? { tone: CODE_TONE } : {}),
        }),
      );
    }
    segStart = text.length;
  };

  let m = 0;
  let pos = 0;
  while (pos < source.length) {
    const mark = marks[m];
    if (mark !== undefined && mark.at === pos) {
      m += 1;
      if (literal.has(mark.at)) {
        text += mark.kind;
      } else {
        flush();
        if (mark.kind === "**") bold = !bold;
        else italic = !italic;
      }
      pos += mark.kind.length;
      continue;
    }
    const ch = source[pos] ?? "";
    if (ch === "`") {
      const close = source.indexOf("`", pos + 1);
      if (close === -1) {
        // Unclosed: the rest of the line is literal, as pass one assumed.
        text += source.slice(pos);
        pos = source.length;
        continue;
      }
      if (close === pos + 1) {
        // An empty pair is two characters — a span cannot be empty (C04 I84).
        text += "``";
        pos += 2;
        continue;
      }
      flush();
      code = true;
      text += source.slice(pos + 1, close);
      flush();
      code = false;
      pos = close + 1;
      continue;
    }
    text += ch;
    pos += 1;
  }
  flush();
  return spans.length === 0 ? { text } : { text, spans: Object.freeze(spans) };
}

/** The slot an inline code run names (C04 I89, C09 §5) — a name one refers back to. */
const CODE_TONE = "identifier" as const;

const FENCE = /^(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$/u;
const HEADING = /^(#{1,6})\s+(.*)$/u;
const BULLET = /^(\s*)[-*+]\s+(.*)$/u;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/u;
const QUOTE = /^\s*>\s?(.*)$/u;
/**
 * A delimiter row: one or more dash cells, **and a pipe somewhere** (roadmap 11).
 *
 * One cell is enough — `| h |` over `|---|` is a one-column table — but the
 * lookahead keeps the pipe mandatory, because without it a line of dashes under
 * a paragraph containing `|` would turn the paragraph into a table (T2.48).
 */
const DELIMITER = /^(?=.*\|)\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/u;

/** Two per level, capped — see the nesting residue above (C04 I96). */
const INDENT_CELLS = 2;
const MAX_DEPTH = 3;

/** The tiers a heading reaches; `######` is the third, and so is `###` (C04 I94). */
const MAX_TIER = 3;

/** The source's own nesting level, before the cap — the number the mark reads. */
function depthOf(raw: string): number {
  return Math.floor(raw.replace(/\t/gu, "  ").length / INDENT_CELLS); // cells-ok — spaces, not text
}

function indentOf(raw: string): number {
  return Math.min(depthOf(raw), MAX_DEPTH) * INDENT_CELLS;
}

/**
 * The mark an item at this depth carries (C04 I96).
 *
 * **The cap is a bounded region and a bounded region carries its mark.** Past
 * `MAX_DEPTH` every item takes the same indent, so `bullet` alone would draw
 * depth 3 and depth 4 as one frame — a document that means two things. Beyond
 * the bound the frame says *at least this deep* and no more, which is all a
 * residue marker ever says.
 */
function markOf(raw: string): Glyph {
  return depthOf(raw) > MAX_DEPTH ? "nested" : "bullet";
}

/** A pipe row split into its cells, outer pipes discarded. */
function cellsOf(line: string): readonly string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((c) => c.trim());
}

function columnsOf(headers: readonly string[]): readonly ColumnDef[] {
  return headers.map((label, i) =>
    Object.freeze({
      // The key is positional. A header's text is a label and may repeat, and a
      // duplicate key would silently drop a column.
      key: `c${String(i)}`,
      label,
      align: "left" as const,
      priority: 50,
      minWidth: 4,
      sortable: false,
    }),
  );
}

/**
 * The subset, as blocks.
 *
 * Total: any string yields blocks, and a line this does not recognise is a
 * paragraph. There is no failure mode, which is what makes it safe to point at
 * whatever a far side emitted (C04 I4's direction, one layer up).
 */
export function markdownBlocks(source: string, idPrefix = "md"): readonly Block[] {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const out: Block[] = [];
  let n = 0;
  const id = (): string => `${idPrefix}-${String(n++)}`;

  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length === 0) return;
    out.push(block({ kind: "raw", id: id(), ...inline(paragraph.join("\n")) }));
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";

    // --- fenced code, first, because everything inside it is literal --------
    const fence = FENCE.exec(line);
    if (fence !== null) {
      flush();
      const mark = fence[1] ?? "```";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith(mark)) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      const info = fence[2] ?? "";
      out.push(
        block({
          kind: "code",
          id: id(),
          // **The language is not resolved here.** C09's `code` block owns the
          // registry and falls back for a name it does not know, so a second
          // list of language names would be the drift `cells()` exists against.
          language: info === "" ? "text" : info,
          text: body.join("\n"),
        }),
      );
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    // --- ATX heading -------------------------------------------------------
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flush();
      // **The collapse is here rather than in the type** (C04 I94): three tiers
      // are drawn, so `###` through `######` take the third — four levels onto
      // one form, in the one place a reader can see it happen.
      const level = Math.min((heading[1] ?? "#").length, MAX_TIER) as HeadingLevel;
      const { text: label, spans } = inline((heading[2] ?? "").trim());
      out.push(block({ kind: "rule", id: id(), label, level, ...(spans === undefined ? {} : { spans }) }));
      continue;
    }

    // --- table: a header row is only a header if a delimiter follows --------
    if (line.includes("|") && DELIMITER.test(lines[i + 1] ?? "")) {
      flush();
      const columns = columnsOf(cellsOf(line));
      const rows: TableRow[] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        const values = cellsOf(lines[i] ?? "");
        rows.push(
          Object.freeze({
            id: `${idPrefix}-r${String(rows.length)}`,
            cells: Object.freeze(
              Object.fromEntries(
                columns.map((c, j) => [c.key, Object.freeze(inline(values[j] ?? ""))]),
              ),
            ),
          }),
        );
        i += 1;
      }
      i -= 1;
      out.push(block({ kind: "table", id: id(), columns, rows }));
      continue;
    }

    // --- blockquote --------------------------------------------------------
    const quote = QUOTE.exec(line);
    if (quote !== null) {
      flush();
      const body: string[] = [quote[1] ?? ""];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1] ?? "")) {
        i += 1;
        body.push(QUOTE.exec(lines[i] ?? "")?.[1] ?? "");
      }
      // **Muted, and railed** (C04 I95). The gutter is a `Glyph` slot like
      // every other mark, and it is the first token C09 draws on every row
      // rather than on the first — which is what a quotation's gutter is and a
      // status mark is not.
      out.push(block({ kind: "notice", id: id(), tone: "muted", glyph: "quote", ...inline(body.join("\n")) }));
      continue;
    }

    // --- lists -------------------------------------------------------------
    const bullet = BULLET.exec(line);
    if (bullet !== null) {
      flush();
      const pad = " ".repeat(indentOf(bullet[1] ?? ""));
      out.push(
        block({
          kind: "notice",
          id: id(),
          tone: "default",
          // **The marker is a glyph slot and never a literal** (F6). `bullet` is
          // `•` / `-`, and `notice`'s gutter is the hanging indent `prefixCells`
          // already draws — which is why a list item is a `notice` and not a
          // `raw` carrying a character this layer chose.
          glyph: markOf(bullet[1] ?? ""),
          ...inline(`${pad}${bullet[2] ?? ""}`),
        }),
      );
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered !== null) {
      flush();
      const pad = " ".repeat(indentOf(ordered[1] ?? ""));
      out.push(
        block({
          kind: "notice",
          id: id(),
          tone: "default",
          // **No glyph while the item is inside the cap, and the number is
          // text.** A digit is the same character in both renderings, so it
          // needs no slot and F6 does not apply — and no slot could carry it,
          // since a glyph is one fixed mark. The cost is the hanging indent,
          // which the gutter would have given.
          //
          // **Past the cap it takes the mark anyway** (C04 I96): a number says
          // *which* item and never *how deep*, so this is the arm where depth 3
          // and depth 4 would otherwise be one frame with nothing at all to tell
          // them apart.
          ...(depthOf(ordered[1] ?? "") > MAX_DEPTH ? { glyph: "nested" as const } : {}),
          ...inline(`${pad}${ordered[2] ?? ""}. ${ordered[3] ?? ""}`),
        }),
      );
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return Object.freeze(out);
}
