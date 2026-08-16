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
 * **Inline emphasis stays literal**: `**bold**` becomes the seven characters it
 * is. No span-level styling exists in this vocabulary — tone attaches to a
 * block, a `Cell`, a `keyValue` row or a pill and never to a run inside text —
 * so rendering emphasis is a new mechanism rather than a mapping. Keeping the
 * markers needs nothing, reads identically at every colour depth, and is
 * **reversible**: the day spans exist, the literal form is the thing they
 * replace. Rendering them by dropping the markers would not be.
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
 * ## Three residues, named because a silent one is the empty-block class
 *
 * - **Heading levels collapse.** `rule` carries one `label` and draws one form —
 *   `── label ────`. `##` and `###` cannot differ. The fix, when a consumer
 *   needs it, is a `level` field on `Rule`; that is a published type and it has
 *   no consumer, so it is filed rather than built.
 * - **Blockquotes have no gutter.** `prefixCells` draws one from a `Glyph`, and
 *   no slot means *quote*. `live` is `▌`, which looks exactly right and means
 *   something else — a homonym is how a shared mark acquires a fourth consumer
 *   that cannot take it (F161). So a quote is muted text.
 * - **Nesting caps at three levels**, two spaces each. Deeper items clamp rather
 *   than indenting further, because the indent comes out of the text's own width
 *   and an unbounded one is a paragraph nobody can read at 60 columns.
 */

import { block } from "./construct.js";
import type { Block, ColumnDef, TableRow } from "./types.js";

const FENCE = /^(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$/u;
const HEADING = /^#{1,6}\s+(.*)$/u;
const BULLET = /^(\s*)[-*+]\s+(.*)$/u;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/u;
const QUOTE = /^\s*>\s?(.*)$/u;
const DELIMITER = /^\s*\|?(\s*:?-{1,}:?\s*\|)+(\s*:?-{1,}:?\s*)\|?\s*$/u;

/** Two per level, capped — see the nesting residue above. */
const INDENT_CELLS = 2;
const MAX_DEPTH = 3;

function indentOf(raw: string): number {
  const level = Math.floor(raw.replace(/\t/gu, "  ").length / INDENT_CELLS); // cells-ok — spaces, not text
  return Math.min(level, MAX_DEPTH) * INDENT_CELLS;
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
    out.push(block({ kind: "raw", id: id(), text: paragraph.join("\n") }));
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
      // Every level maps to one form. The collapse is the first residue above.
      out.push(block({ kind: "rule", id: id(), label: (heading[1] ?? "").trim() }));
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
                columns.map((c, j) => [c.key, Object.freeze({ text: values[j] ?? "" })]),
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
      // Muted and unglyphed — the second residue.
      out.push(block({ kind: "notice", id: id(), tone: "muted", text: body.join("\n") }));
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
          glyph: "bullet",
          text: `${pad}${bullet[2] ?? ""}`,
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
          // **No glyph, and the number is text.** A digit is the same character
          // in both renderings, so it needs no slot and F6 does not apply — and
          // no slot could carry it, since a glyph is one fixed mark. The cost is
          // the hanging indent, which the gutter would have given.
          text: `${pad}${ordered[2] ?? ""}. ${ordered[3] ?? ""}`,
        }),
      );
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return Object.freeze(out);
}
