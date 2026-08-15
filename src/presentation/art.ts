/**
 * ASCII art and banners — sparse variants, and a fallback that ends at text
 * (roadmap 22, walked in that entry's §8a–§8c).
 *
 * **Art cannot be degraded automatically, and that is the premise.** A table
 * drops columns; a plot becomes stacked strips. Art has no structure to degrade
 * *from* — a block-element wordmark and an ASCII one are two designs, not one
 * design at two fidelities. So what lives here is **the shape of the
 * declaration and what happens when a variant is missing**, and never a
 * transformation.
 *
 * **A builder rather than a block kind**, on `mermaidCode`'s precedent and for
 * the same reason: art is pre-composed text, nothing about it needs a renderer,
 * and a seventeenth kind in the published vocabulary before the freeze — with
 * one consumer — is the disposal roadmap 50 got.
 */

import { block } from "../data/viewmodel/index.js";
import { BlockShapeError } from "../data/viewmodel/index.js";
import type { Block } from "../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import { cells } from "./text.js";
import type { AmbiguousWidth } from "./text.js";

/**
 * A variant declares **its tier, not its capability requirements**.
 *
 * `ascii` and `blocks` is how an app already thinks about its own art; mapping
 * a tier to capabilities is a lookup this module owns, and it keeps the
 * declaration from restating what the framework knows.
 */
export type ArtTier = "blocks" | "ascii";

export type ArtSpec = Readonly<{
  /** The always-available fallback. Non-empty — see §8a row 8. */
  text: string;
  /** Sparse. One variant is a complete banner, and neither is required. */
  variants?: Readonly<Partial<Record<ArtTier, string>>>;
  id?: string;
}>;

/**
 * The chain, in preference order, and **each rung is tier-eligible *and* fits**.
 *
 * §8a row 3 is why the second conjunct is there. *A variant declares its tier*
 * and *the tier threshold is each variant's own measured width* are both
 * correct, and they overlap in one state: a `blocks` variant the terminal can
 * draw and the terminal is too narrow for. Selecting by tier alone draws it
 * truncated; docker-tui measured the same cell from the other side, where a
 * fixed threshold showed a lone whale on an 80-column terminal with room for
 * the name beside it.
 */
const ORDER: readonly ArtTier[] = ["blocks", "ascii"];

/**
 * **Two facts exclude a `blocks` variant, and the walk had only one.**
 *
 * The tier is the obvious half: block elements are BMP, so an ASCII-only
 * terminal cannot draw them. The other arrived from A03's SS50 rather than from
 * §8a's table — `▄ ▀ █ ░ ▐ ▖` are `East_Asian_Width=Ambiguous`, every one of
 * them, so a terminal declaring `ambiguousWidth: "wide"` draws a wordmark at
 * double width. **A wordmark whose glyphs double is not a wordmark**, which is
 * the sentence `mermaid.ts` already makes about box drawing: `useAscii` is the
 * wide arm as well as the ASCII one, and this is the same switch in the second
 * consumer to need it.
 *
 * Width alone would not have caught it. A doubled wordmark that still *fits*
 * is drawn, twice as wide as its author measured it, on a terminal nobody
 * developing the art was using — which is the entry's own failure class.
 */
function eligible(
  tier: ArtTier,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): boolean {
  return tier === "ascii" || (caps.unicode !== "ascii" && caps.ambiguousWidth !== "wide");
}

/**
 * The widest row, in display cells.
 *
 * `cells()` and never `.length` — a block-element wordmark is outside ASCII by
 * definition, so the two disagree on exactly the variant this measurement
 * exists to choose.
 *
 * **And it carries the convention (C02 I9, A03 SS50).** An app is free to
 * declare art made of box drawing under `ascii`, and box drawing is ambiguous
 * too; measuring it under one convention and drawing it under the other is the
 * defect the tier exists to prevent.
 */
function widthOf(art: string, ambiguousWidth: AmbiguousWidth): number {
  return art.split("\n").reduce((n, line) => Math.max(n, cells(line, ambiguousWidth)), 0);
}

/**
 * A declared variant that cannot be drawn predictably is a **programming
 * error**, not a missing rung (§8a row 9).
 *
 * *The fallback is a fallback, not a filter* is about art that is absent.
 * Reading it as covering a malformed variant would mean a tab silently
 * selecting the next rung — and rendering correctly on the machine that wrote
 * it, which is the failure class this entry exists for.
 *
 * **Only the tab check survives of the four the entry listed**, and it is
 * measured rather than assumed: `stripControl` keeps a tab *by design*, `cells`
 * reads it as one, and the terminal advances to its next stop — eight columns,
 * or whatever it is set to. So measurement and rendering disagree *and the
 * disagreement varies by machine*. Uniform line width and row-count alignment
 * were both closed by roadmap 38 — `fit` pads every row of a `raw` block to its
 * column, and `Group.align` carries the vertical half — and *report measured
 * cells* is `widthOf` above, used rather than reported.
 *
 * The throw leaves nothing behind: this module holds no store and mutates
 * nothing (§8a row 10).
 */
function validate(tier: ArtTier, art: string): void {
  if (art.includes("\t")) {
    throw new BlockShapeError(
      `art: the \`${tier}\` variant contains a tab — it measures 1 cell and draws to the ` +
        `terminal's next stop, so the art renders differently on different machines`,
    );
  }
}

/**
 * The banner for this terminal at this width.
 *
 * **It never returns nothing.** Deciding there is no room for a banner at all
 * stays the app's — a floor is a design judgement about a surface, not about
 * art — and the last rung is the text, which is always available.
 *
 * The last rung is a `notice` and not a `raw`, and the mechanism was checked
 * before the ruling was written down: `raw` carries no style, so *the text,
 * styled* named an operation the layer below does not have. `accent` resolves
 * to the `emphasised` mono class, so the rung is bold where there is no colour
 * and coloured where there is — and a notice **wraps** where `raw` would
 * truncate, which is the right answer for a name (§8a row 7).
 */
export function art(
  spec: ArtSpec,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  width: number,
): Block {
  const id = spec.id ?? "art";
  const variants = spec.variants ?? {};

  if (spec.text === "") {
    throw new BlockShapeError(
      "art: `text` is the always-available fallback and is empty — a declaration that can " +
        "produce nothing is what the fallback chain refuses",
    );
  }

  for (const tier of ORDER) {
    const declared = variants[tier];
    if (declared === undefined) continue;
    // Validated whether or not it is selected: a tab in the variant this
    // terminal cannot draw is still a tab, and it is found on the machine that
    // wrote it rather than on the one that can draw it.
    validate(tier, declared);
  }

  for (const tier of ORDER) {
    const declared = variants[tier];
    if (declared === undefined || !eligible(tier, caps)) continue;
    if (widthOf(declared, caps.ambiguousWidth) <= width) {
      return block({ kind: "raw", id, text: declared });
    }
  }

  return block({ kind: "notice", id, tone: "accent", text: spec.text });
}
