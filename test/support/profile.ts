// The deck, read as text — the shape a row asserting *what a figure says* wants.
//
// **Every card, not a chosen one.** The rows that use this are about a sentence
// travelling with a figure (C28 I13, I25, I27), and the invariant is that it
// travels **wherever** the figure is drawn: a row naming one card goes green the
// day a second card starts drawing the same number bare, which is exactly when
// the invariant first has something to be wrong about. The panes this replaces
// were asserted over `PANES` for the same reason (F895).
import type { Block } from "../../src/data/viewmodel/index.js";
import { CARDS, profileCard } from "../../src/shell/profiling/panes/index.js";
import type { Region } from "../../src/shell/profiling/panes/index.js";
import type { ProfileReport } from "../../src/shell/profiling/types.js";

export const DECK_REGION: Region = { w: 80, rows: 24 };

/** One card's blocks, by id — a throw when the id is not a card's. */
export const cardBlocks = (
  report: ProfileReport,
  id: string,
  region: Region = DECK_REGION,
): readonly Block[] => {
  if (!CARDS.some((c) => c.id === id)) throw new Error(`no card \`${id}\``);
  return profileCard(report, id, region);
};

/** One card, as text. */
export const cardText = (report: ProfileReport, id: string, region: Region = DECK_REGION): string =>
  JSON.stringify(cardBlocks(report, id, region));

/** Every card, as text — the whole deck drawn at one region. */
export const deckText = (report: ProfileReport, region: Region = DECK_REGION): string =>
  JSON.stringify(CARDS.map((c) => profileCard(report, c.id, region)));
