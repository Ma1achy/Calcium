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
  type BlockKind,
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
/**
 * The kinds this sweep has nothing to check, each with the fact that makes
 * it nothing — **the enumeration a `default: break` used to hide**.
 *
 * Four kinds were checked and eleven passed silently, four of those eleven
 * carrying a meaning-bearing field. A consumer's `comparison` block is what
 * surfaced it: a verdict rendered as a tone on one cell, in a checker whose
 * job is finding meaning carried by colour alone.
 *
 * Two of the eleven are checkable and are now checked (`rule`), or are a
 * schema gap recorded as one (`comparison`). The rest are here:
 *
 * | kind | why nothing |
 * |---|---|
 * | `logs` | `level` is **printed**, padded to `LEVEL_WIDTH` — the word carries it |
 * | `steps` | `state` selects a **glyph**; the mark is structural, not colour |
 * | `plot` | C12 substitutes stacked strips at one bit (§5), which is D29 obeyed |
 * | `rule`, `progress`, `code`, `patch`, `tip`, `raw` | no meaning-bearing field at all |
 *
 * **`events` was in the last row and is now swept.** It gained a `tone` (F51)
 * and the exemption did not notice, because the set was keyed by kind. That is
 * F102, and the premise is now recorded per kind and checked.
 *
 * **`rule` is in the last row because it was measured twice.** The first pass
 * put it in the checkable column — a regex reading the type ran past
 * `}> & Gap;` and attributed a neighbour's `tone` and `glyph` to it. `Rule` is
 * `{ kind, id, label }`; the compiler is what said so. Two of eleven kinds
 * carry a meaning-bearing field, not four.
 */
/**
 * **Which premise an exemption rests on, because only one of them expires
 * mechanically** (C04 I37, FINDINGS F102).
 *
 * The set this replaced was keyed by kind, so membership was earned once, by
 * the fields a kind had on the day it was listed, and nothing re-read it when
 * the fields changed. A new *kind* was a compile error; a new meaning-bearing
 * *field* on an exempt kind was silence — and `events` gaining a `tone` (F51)
 * is exactly that, verified by fabricated violation before this was written.
 *
 * `no-field` is checkable: the premise is *this kind carries no tone*, and a
 * tone appearing anywhere in the block falsifies it, whatever it is called and
 * however deeply it is nested. `by-rendering` is not, and says so — `plot`'s
 * exemption is C12's stacked strips at one bit, which no walk of the document
 * can see.
 */
type Exemption = Readonly<{ premise: "no-field" | "by-rendering"; why: string }>;

const KINDS_WITH_NOTHING_TO_CHECK: ReadonlyMap<BlockKind, Exemption> = new Map<
  BlockKind,
  Exemption
>([
  ["logs", { premise: "by-rendering", why: "`level` is printed, padded to LEVEL_WIDTH" }],
  ["steps", { premise: "by-rendering", why: "`state` selects a glyph; the mark is structural" }],
  ["plot", { premise: "by-rendering", why: "C12 substitutes stacked strips at one bit (C12 §5)" }],
  ["rule", { premise: "no-field", why: "`{ kind, id, label, meta }` — measured, see below" }],
  ["progress", { premise: "no-field", why: "a fraction and a label" }],
  ["code", { premise: "no-field", why: "syntax is its own palette, not the tone one" }],
  ["patch", { premise: "no-field", why: "the +/- marker carries the change axis (C04 I35)" }],
  ["tip", { premise: "no-field", why: "text only" }],
  ["raw", { premise: "no-field", why: "opaque by definition; the app owns what it renders" }],
  [
    "scroll",
    {
      premise: "no-field",
      why:
        "a box and a residue row whose meaning is in its numbers, and the children are swept " +
        "as blocks in their own right",
    },
  ],
]);

/** Any `tone` anywhere in a block, at any depth. The premise, falsifiable. */
function carriesATone(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(carriesATone);
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record["tone"] === "string") return true;
  return Object.values(record).some(carriesATone);
}

/**
 * The compile-time half. A kind that is neither checked above nor listed as
 * having nothing to check makes this a type error, which is the whole point:
 * `default: break` accepted a new kind in silence, and silence in a compliance
 * checker is indistinguishable from compliance.
 *
 * **And the runtime half, which is the one the compiler cannot do**: an
 * exemption claiming the kind has no tone-bearing field, on a block that has
 * one. F102 — the guard against a new kind was blind to a new field.
 */
function assertNothingToCheck(block: Block): void {
  const exemption = KINDS_WITH_NOTHING_TO_CHECK.get(block.kind);
  if (exemption === undefined) {
    throw new Error(
      `expectDocument: block kind "${block.kind}" is neither swept for colour-only meaning ` +
        `nor listed in KINDS_WITH_NOTHING_TO_CHECK with a reason (D29, A03 §2)`,
    );
  }
  if (exemption.premise === "no-field" && carriesATone(block)) {
    throw new Error(
      `expectDocument: block kind "${block.kind}" is exempt from the D29 sweep on the premise ` +
        `that it carries no meaning-bearing field (${exemption.why}), and this one carries a ` +
        `tone — the premise has expired and the kind needs an arm, not an entry (C04 I37, F102)`,
    );
  }
}

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
export function fullRegistry(): BlockRegistry {
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

export type RenderOpts = Readonly<{
  /** Defaults to the truecolour, full-unicode record. */
  capabilities?: TerminalCapabilities;
  /** Keep SGR. Defaults to `false`, because a frame read by eye is a frame without escapes. */
  colour?: boolean;
}>;

export interface DocumentAssertions {
  isValid(): this;
  measuresCorrectly(widths?: readonly number[]): this;
  rendersAt(widths: readonly number[]): this;
  degradesToAscii(): this;
  degradesTo1Bit(): this;
  hasNoColourOnlyDistinction(): this;
  /**
   * The rows this document draws — **the frame, not a property of it** (C24 I23).
   *
   * Every other method here measures or asserts, and a property of a document is
   * not a picture of one. The reference app documents its workaround as *"a row
   * is a complete description of what will be drawn"*, which is true of a table
   * and false of the change axis: the rows say `added` and only the frame says
   * `+`. So the app asserted a value whose rendering it could not see, and this
   * surface could not have caught the class that produced.
   *
   * **The production renderer, not a second one.** It returns what
   * `renderSequenceToLines` produced instead of asserting about it — the same
   * call `measuresCorrectly` and `degradesToAscii` already make, through the
   * registry this object already holds. That is why it is publishable where the
   * raw `renderToLines` was not: `BlockRegistry` stays unreachable (C24 §3), and
   * a parallel renderer here would be the fifth instance of a suite building its
   * own version of the thing under test.
   *
   * **Not `this`.** Every other method chains because it asserts; this one is
   * the value, and returning `this` would make the frame unreachable from the
   * one method whose whole point is to hand it over.
   */
  lines(width: number, opts?: RenderOpts): readonly string[];
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
    lines(width, opts = {}) {
      const caps = opts.capabilities ?? TRUECOLOUR;
      const drawn = renderSequenceToLines(registry, doc.blocks, width, {
        theme: resolved,
        capabilities: caps,
      });
      return opts.colour === true ? drawn : drawn.map(plain);
    },

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
          case "comparison":
            /**
             * **A schema gap, recorded rather than enforced** — the same
             * disposal `pills` and `keyValue` get above, and for the same
             * reason: `ComparisonRow` has no glyph field, so D29 is
             * unsatisfiable for it and flagging every use would make this
             * method un-passable for any app that compares anything.
             *
             * **The two halves of the verdict are not alike.** `same` and
             * `changed` are recoverable by a reader — the two cells are on
             * screen side by side and either read alike or do not. `better` and
             * `worse` are not: `200ms` against `150ms` says nothing about which
             * is wanted, and the tone on the `b` cell is the only thing that
             * does. That half is carried by colour alone and cannot be fixed
             * from a document.
             *
             * Closing it means a glyph on `ComparisonRow`, which is a C04 spec
             * change. FINDINGS F34.
             */
            break;
          case "events":
            /**
             * **Left the exemption when it gained a `tone`** (F51, F102). The
             * `type` word is always printed, so a toned event with a word
             * beside it is compliant — the same disposal `logs` gets, arrived
             * at by the field rather than by the kind's name.
             */
            for (const e of block.events) {
              if (bare(e.tone, undefined, e.type)) {
                offences.push(
                  `events "${block.id}" has an event toned ${String(e.tone)} with an empty type — ` +
                    `an event has no glyph field, so the type word is the only other carrier`,
                );
              }
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
          /**
           * **Every remaining kind is named, and `default` is gone** — a
           * consumer's `comparison` block is what forced it.
           *
           * The switch ended `default: break`, so **four kinds were checked and
           * eleven passed in silence**, four of them carrying a meaning-bearing
           * field. `validate.ts` solves exactly this with
           * `Record<BlockKind, KindCheck>` — *"a new kind without a row here is a
           * type error, not a silent pass (T2.10)"* — and the compliance sweep,
           * whose entire job is finding what a document fails to say, had the
           * opposite property. A03 §2's vacuity class in the checker.
           *
           * Enumerated with `KINDS_WITH_NOTHING_TO_CHECK` below rather than
           * folded back into a default, so adding a block kind is a compile
           * error here and its reason has to be written down.
           */
          default:
            assertNothingToCheck(block);
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
