/**
 * `expectDocument` — C24 §7's document assertions.
 *
 * The adapter story is "pure function, fixture in, document out". These are the
 * assertions that make that worth anything, and I13's argument for shipping
 * them is that otherwise each consumer reimplements them badly or not at all.
 *
 * **It constructs its own registry, and that is the point rather than a
 * convenience.** `BlockRegistry` is one of the eleven components §3 keeps
 * unreachable, so a consumer cannot build one — which is exactly why the raw
 * `renderToLines` was never a usable export and why it is not one now (§7).
 * `expectDocument` is the callable form: it holds the registry internally and a
 * consumer never sees the type.
 *
 * **Fluent and throwing, not runner-bound.** Every method returns `this` and
 * throws an `Error` on failure. No `expect`, no `it`, no vitest import — the
 * same rule the two conformance suites follow, for the same reason: C09's
 * tests, this module and a consumer's own suite all drive one implementation.
 *
 * **`matchesGolden` is specified and not built.** It needs a place to keep
 * frames and a policy for updating them, and §7 settles neither — the goldens
 * in this repo use vitest's snapshot mechanism, which is precisely the
 * runner-bound thing this module may not import. Inventing a directory
 * convention here would be a policy nobody asked for, so it waits for the first
 * consumer that wants it to say what it needs.
 */

import {
  validateDocument,
  type Block,
  type Tone,
  type ViewDocument,
} from "../data/viewmodel/index.js";
import {
  createBlockRegistry,
  type BlockDefinition,
  type BlockRegistry,
} from "../presentation/blocks/index.js";
import { tableDefinition } from "../presentation/table/index.js";
import { plotDefinition } from "../presentation/plot/index.js";
import { patchDefinition } from "../presentation/patch/index.js";
import { defaultTheme, loadTheme, type ResolvedTheme } from "../presentation/theme/index.js";
import { renderSequenceToLines, renderToLines } from "../presentation/render-lines.js";
import { displayCells } from "../presentation/text.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import { DEFAULT_WIDTHS, checkAsciiParity, checkMeasurement, formatReport } from "./measurement-conformance.js";

/**
 * The tones that *mean* something, as opposed to the ones that merely style.
 *
 * `dim`, `muted`, `meta` and `accent` are emphasis: losing them at one bit
 * loses nothing a reader needed. The five here carry state, and a reader who
 * cannot see colour must still be able to tell them apart — which is the whole
 * of D29.
 */
const MEANING_TONES: ReadonlySet<Tone> = new Set<Tone>([
  "ok",
  "warn",
  "error",
  "info",
  "identifier",
]);

const TRUECOLOUR: TerminalCapabilities = Object.freeze({
  colourDepth: 24,
  unicode: "full",
  synchronisedUpdate: true,
  bracketedPaste: true,
  mouse: true,
  imageProtocol: "none",
  altScreen: true,
});

const ONE_BIT: TerminalCapabilities = Object.freeze({ ...TRUECOLOUR, colourDepth: 1 });
const ASCII: TerminalCapabilities = Object.freeze({ ...TRUECOLOUR, unicode: "ascii" });

/**
 * Every kind a document can hold, including the three registered elsewhere.
 *
 * `table`, `plot` and `patch` are not defaults — C11, C12 and C25 register
 * them, which is what proves C09's extension path — so a registry that wants
 * them has to say so. A consumer's document holds all three routinely, and one
 * that fell back to `raw` would still produce rows, still measure, and quietly
 * assert nothing about the kind under test.
 */
function fullRegistry(): BlockRegistry {
  const r = createBlockRegistry({});
  for (const definition of [tableDefinition, plotDefinition, patchDefinition]) {
    r.register(definition as unknown as BlockDefinition);
  }
  return r;
}

function theme(): ResolvedTheme {
  const loaded = loadTheme(defaultTheme, "dark");
  if (!loaded.ok) {
    throw new Error(`the shipped theme does not load: ${JSON.stringify(loaded.error)}`);
  }
  return loaded.value.current;
}

/** SGR removed, so two renders differing only in colour compare equal. */
function plain(line: string): string {
  const esc = String.fromCharCode(27);
  return line
    .split(`${esc}[`)
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf("m") + 1)))
    .join("");
}

export interface DocumentAssertions {
  isValid(): this;
  measuresCorrectly(widths?: readonly number[]): this;
  rendersAt(widths: readonly number[]): this;
  degradesToAscii(): this;
  degradesTo1Bit(): this;
  hasNoColourOnlyDistinction(): this;
}

export function expectDocument(doc: ViewDocument): DocumentAssertions {
  const registry = fullRegistry();
  const resolved = theme();

  const rows = (caps: TerminalCapabilities, width: number): readonly string[] =>
    renderSequenceToLines(registry, doc.blocks, width, { theme: resolved, capabilities: caps });

  const assertions: DocumentAssertions = {
    isValid() {
      const validity = validateDocument(doc);
      if (!validity.ok) {
        throw new Error(`document is not valid:\n  ${validity.error.join("\n  ")}`);
      }
      return this;
    },

    measuresCorrectly(widths = DEFAULT_WIDTHS) {
      const report = checkMeasurement(
        { measure: registry.measure, renderToLines: (b, w) => oneBlock(b, w), kinds: registry.kinds },
        doc.blocks,
        { widths },
      );
      if (report.failures.length > 0) throw new Error(formatReport(report));
      return this;
    },

    rendersAt(widths) {
      for (const width of widths) {
        if (!Number.isInteger(width) || width < 1) {
          throw new Error(`rendersAt: ${String(width)} is not a usable width`);
        }
        const painted = rows(TRUECOLOUR, width);
        const over = painted.findIndex((line) => displayCells(plain(line)) > width);
        if (over !== -1) {
          throw new Error(
            `at width ${width}, row ${over} occupies ${String(displayCells(plain(painted[over] ?? "")))} ` +
              `cells — the terminal wraps it into a row nothing counted`,
          );
        }
      }
      return this;
    },

    degradesToAscii() {
      const report = checkAsciiParity(
        { measure: registry.measure, renderToLines: (b, w) => oneBlock(b, w), kinds: registry.kinds },
        {
          measure: registry.measure,
          renderToLines: (b, w) => oneBlockAscii(b, w),
          kinds: registry.kinds,
        },
        doc.blocks,
      );
      if (report.failures.length > 0) throw new Error(formatReport(report));

      // Parity of *height* is what the suite above checks. This is the other
      // half and the one a consumer trips: a fallback that is not 1:1 by column
      // count widens a row without changing its height (C09 commitment 14).
      for (const width of DEFAULT_WIDTHS) {
        const ascii = rows(ASCII, width);
        const over = ascii.findIndex((line) => displayCells(plain(line)) > width);
        if (over !== -1) {
          throw new Error(`under unicode: "ascii", row ${over} overflows width ${width}`);
        }
        for (const line of ascii) {
          for (const ch of plain(line)) {
            const cp = ch.codePointAt(0) ?? 0;
            if (cp > 0x7f) {
              throw new Error(
                `under unicode: "ascii" a non-ASCII character survived (U+${cp.toString(16)}): ` +
                  JSON.stringify(plain(line)),
              );
            }
          }
        }
      }
      return this;
    },

    /**
     * B04 B4.3 — the compliance sweep, and the method that earns this module (I13).
     *
     * **Two halves, and the first version of this had neither.** It compared a
     * truecolour frame with the colour stripped against the one-bit frame and
     * demanded they match. That is not the property, and probing it showed the
     * check was wrong in both directions at once:
     *
     *   - **It over-fired.** A two-series plot renders *differently* at
     *     `colourDepth: 1` — C12 lays it out as stacked strips, substituting
     *     structure for colour, which is D29 being obeyed rather than broken.
     *     The check called the compliant renderer a failure.
     *   - **It under-fired.** `b.notice.ok("nine running")` paints the same
     *     twelve characters at both depths; the ok-ness is carried by colour
     *     alone and nothing textual differs. That is the exact defect B04 B4.3
     *     exists for, and frame comparison cannot see it.
     *
     * So the mechanical claims are these. **Geometry is depth-independent**: a
     * document occupies the same rows at one bit as at twenty-four, because
     * C14 virtualises by measured height and a depth that moved geometry would
     * make the viewport drift. And **information is not carried by colour
     * alone**, which is the structural sweep below — a renderer is free to
     * change how it says something, and not free to stop saying it.
     */
    degradesTo1Bit() {
      for (const width of DEFAULT_WIDTHS) {
        const full = rows(TRUECOLOUR, width);
        const one = rows(ONE_BIT, width);
        if (full.length !== one.length) {
          throw new Error(
            `at width ${width} the document occupies ${String(full.length)} rows in truecolour ` +
              `and ${String(one.length)} at one bit — a depth change moved geometry, and C14 ` +
              `virtualises by measured height`,
          );
        }
      }
      return this.hasNoColourOnlyDistinction();
    },

    /**
     * D29 — a distinction carried by colour and nothing else.
     *
     * **The rule is uniform: a meaning tone with no glyph and no word.** An
     * element toned `ok` whose text reads `running` is compliant — the word
     * carries it and the colour emphasises it, which is what tone is for.
     *
     * **This first flagged every toned `keyValue` row and `pills` chip**, on
     * the grounds that neither kind has a `glyph` field, so D29 is
     * unsatisfiable for them. C04's constructor records exactly that and
     * declines to enforce it, calling it a gap in the vocabulary rather than a
     * rule — and encoding a *schema* gap as a *document* violation made this
     * method un-passable for any app that tones a pill. The first real consumer
     * tripped it on its first document with
     * `b.pills([{ label: "2 running", tone: "ok" }])`, which is compliant and
     * is also the most natural thing anyone would write.
     *
     * **What is left unchecked, and it is the interesting half.** Two chips
     * reading `web` and `db`, toned `ok` and `error`, put the whole meaning in
     * colour and pass — because "does this text carry the state" is not
     * decidable from the text. No widening of this method reaches it; closing
     * it means giving those two kinds a glyph field, which is a C04 spec change
     * and is recorded there as one.
     */
    hasNoColourOnlyDistinction() {
      const offences: string[] = [];

      /** A meaning tone with neither a glyph nor a word beside it. */
      const bare = (tone: Tone | undefined, glyph: string | undefined, text: string): boolean =>
        tone !== undefined && MEANING_TONES.has(tone) && (glyph ?? "") === "" && text.trim() === "";

      const visit = (block: Block): void => {
        switch (block.kind) {
          case "notice":
            if (bare(block.tone, block.glyph, block.text)) {
              offences.push(`notice "${block.id}" is toned ${block.tone} with no glyph and no text`);
            }
            break;
          case "keyValue":
            for (const r of block.rows) {
              if (bare(r.tone, undefined, r.value)) {
                offences.push(
                  `keyValue "${block.id}" row "${r.label}" is toned ${String(r.tone)} and its value ` +
                    `is empty — a keyValue row has no glyph field, so nothing else can carry it`,
                );
              }
            }
            break;
          case "pills":
            for (const c of block.chips) {
              if (bare(c.tone, undefined, c.label)) {
                offences.push(
                  `pills "${block.id}" has a chip toned ${String(c.tone)} with an empty label — ` +
                    `a chip has no glyph field, so nothing else can carry it`,
                );
              }
            }
            break;
          case "table":
            for (const r of block.rows) {
              for (const [key, cell] of Object.entries(r.cells)) {
                if (bare(cell.tone, cell.glyph, cell.text)) {
                  offences.push(
                    `table "${block.id}" row "${r.id}" cell "${key}" is toned ${String(cell.tone)} ` +
                      `with no glyph and no text`,
                  );
                }
              }
              for (const child of r.detail ?? []) visit(child);
            }
            break;
          case "panel":
          case "group":
            for (const child of block.children) visit(child);
            break;
          default:
            break;
        }
      };

      for (const block of doc.blocks) visit(block);

      if (offences.length > 0) {
        throw new Error(`colour carries meaning alone (D29):\n  ${offences.join("\n  ")}`);
      }
      return this;
    },
  };

  /**
   * One block's rows, for the two conformance suites' registry shape.
   *
   * **`renderToLines`, never `renderSequenceToLines`.** This wrapped the
   * sequence renderer first and 21 of 42 measurements failed instantly: a
   * sequence adds a blank row per block declaring `gapBefore`, and `measure`
   * counts none of them (C04 §3a, C04 I25). The suite compares `measure(block, w)`
   * against the row count, so handing it the sequence renderer makes every
   * gapped block look one row short — a disagreement about width and height
   * that is the exact class this suite exists to find, manufactured by the
   * wrapper meant to run it.
   */
  function oneBlock(block: Block, width: number): readonly string[] {
    return renderToLines(registry, block, width, {
      theme: resolved,
      capabilities: TRUECOLOUR,
    });
  }

  function oneBlockAscii(block: Block, width: number): readonly string[] {
    return renderToLines(registry, block, width, { theme: resolved, capabilities: ASCII });
  }

  return assertions;
}
