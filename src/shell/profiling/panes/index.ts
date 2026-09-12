/**
 * The deck — a card resolved by id, framed, footed and drawn.
 *
 * **One pure function from a value and a region to blocks**, which is what keeps
 * C28 out of the render path and what makes every card testable without a
 * session: the deck is a composition (C22) over a report, and the report is
 * produced by decoration at seams the root already owns.
 *
 * **The footer is generated rather than written per card** (C28 I57, I11, I12).
 * A card that had to remember to state its population is a card that will
 * forget, and the two figures that disagree about one span name are both right
 * and unreadable without it (F1127). So the footer comes off the register: the
 * population from `site`, the exclusions from the report's own regime, and the
 * frame from `seq` where a card shows one.
 */
import { b } from "../../builders/index.js";
import type { Block } from "../../../data/viewmodel/index.js";
import type { GlyphCaps } from "../../../presentation/blocks/index.js";
import type { ProfileReport } from "../types.js";
import { CARDS, CARD_GROUPS } from "./register.js";
import type { CardGroup, CardSpec } from "./register.js";
import { APP_CARDS } from "./app.js";
import { FRAMEWORK_CARDS } from "./framework.js";
import { VERDICT_CARDS } from "./verdict.js";
import type { CardDraw, CardContext, Region } from "./kit.js";
import { ASCII_CAPS, card, contextFor, ms, populationFooter, resolveFrame, spanning } from "./kit.js";

/** Every card's drawing, by id — the three group modules unioned. */
const DRAW: Readonly<Record<string, CardDraw>> = Object.freeze({
  ...VERDICT_CARDS, ...APP_CARDS, ...FRAMEWORK_CARDS,
});

/**
 * Every card the register declares has a drawing, and nothing draws a card the
 * register does not declare.
 *
 * Compared **by equality**, at module load, because a deck with a card nobody
 * wrote is a card that throws on the day someone presses `n` to it — and a
 * drawing for a card that has been removed is dead code that reads as coverage.
 * The register is the authority and this is the wiring's answer to it.
 */
export const DRAWN_CARD_IDS: readonly string[] = Object.freeze(Object.keys(DRAW).sort());

export const REGISTERED_CARD_IDS: readonly string[] = Object.freeze(
  CARDS.map((c) => c.id).sort(),
);

export type ProfileSection = CardGroup;

export const SECTIONS: readonly ProfileSection[] = CARD_GROUPS;

/** The cards of one section, in deck order. */
export const cardsOf = (section: ProfileSection): readonly CardSpec[] =>
  CARDS.filter((c) => c.group === section);

export const specOf = (id: string): CardSpec | undefined => CARDS.find((c) => c.id === id);

/** The title in the panel's top border — the card, its group and its frame. */
const titleOf = (spec: CardSpec, ctx: CardContext): string => {
  const base = `${spec.group}${ctx.sep}${spec.id}`;
  if (spec.perFrame !== true) return base;
  const f = resolveFrame(ctx.report, ctx.seq);
  // **The `seq`, not the position** (C28 I58). `worst` is recomputed on every
  // `report()` and the view refreshes every second, so *the third worst frame*
  // names a different frame at the next tick; the heading has to carry the
  // identity the card resolved, or a reader watching one frame is shown another
  // with nothing on screen changing but the numbers.
  return f === null
    ? `${base}${ctx.sep}no retained frame`
    : `${base}${ctx.sep}seq ${String(f.seq)}${ctx.sep}${ms(f.work)} ms`;
};

/**
 * What the figure above it does not say.
 *
 * Four clauses, each a rule that would otherwise be invisible: the population
 * (I57), the self-time convention (I40), the frames this figure was never
 * allowed to see (I12), and the bucket error every percentile carries (I10).
 */
const footerOf = (spec: CardSpec, ctx: CardContext): string => {
  const r = ctx.report;
  const parts: string[] = [];
  // **The tier, and what to do about it, on every card rather than on the two
  // that happened to reach for a duration** (C28 I11, I23). Two of thirty-seven
  // drawings carried the sentence, because a card that has no durations usually
  // has no data either and says *that* instead — so a reader at `counters` was
  // told the ring was empty and never told why, which is the one thing they can
  // act on. Generated, for the reason the population clause is: a card that has
  // to remember will forget.
  if (!spanning(r)) {
    parts.push(
      `tier \`${r.regime.tier}\`${ctx.sep}raise the tier to \`spans\` to record durations`,
    );
  }
  if (spec.site === "frame") parts.push(`frame-site spans${ctx.sep}${populationFooter(r, "ring")}`);
  else if (spec.site === "session") parts.push(`session-site spans${ctx.sep}${populationFooter(r, "session")}`);
  // **A card over no span still has a population, and it is a different one.**
  // The resource ring holds 64 samples at the sampler's cadence, so the memory
  // and loop cards cover the last minute or so and not the session — a bound
  // as easy to read past as the frame ring's, and with nothing else on the card
  // to state it.
  else if (spec.draws.includes("samples")) {
    parts.push(
      `${String(r.samples.length)} resource samples` +
        (r.dropped.samples > 0 ? `, ${String(r.dropped.samples)} dropped past the ring` : ""),
    );
    // **A suspended sample breaks the series and the picture cannot say so**
    // (C28 I27). An idle machine and a paused one draw the same flat run, and
    // one of them is a reading — `suspended` was on `ResourceSample` from the
    // start with no consumer reading it (F900), and the four cards over the ring
    // would have lost it again when the panes became a deck.
    const asleep = r.samples.filter((x) => x.suspended).length;
    if (asleep > 0) {
      parts.push(
        `${String(asleep)} of ${String(r.samples.length)} suspended${ctx.sep}the series is not continuous`,
      );
    }
  } else parts.push(`the session so far${ctx.sep}${ms(r.regime.durationMs)} ms`);
  // **The resolution travels beside the figure** (C28 I13). A p50 of 0.00 ms at
  // a 10 ms resolution is a floor and not a reading, and the two are compared
  // across runs by a reader who has no way to know they cannot be. The newest
  // sample's, because the probe's resolution is a property of the run rather
  // than of a sample, and a report with none has no delay figure to qualify.
  // **The count is drawn and what it cannot say is drawn with it** (C28 I25).
  // `timingEntries` is how many `PerformanceEntry` objects exist in the process;
  // the profiler raises none of them and knows whose none of them are. Forty-two
  // entries with no attribution is a canary, and forty-two rendered as though
  // the profiler knew whose they were is a claim it cannot make.
  if (spec.draws.includes("marks")) {
    const entries = r.samples.at(-1)?.timingEntries;
    if (entries !== undefined) {
      parts.push(
        `${String(entries)} timing entries in the process${ctx.sep}` +
          `unattributed — the profiler raises no marks of its own`,
      );
    }
  }
  if (spec.loopDelay === true) {
    const newest = r.samples.at(-1);
    // **A count, not a value, separates a floor from an absence** (F1005). Zero
    // windows and a genuine sub-floor reading are the same three numbers, and
    // the sentence written for the second was printed over the first until
    // `loopDelaySamples` existed to tell them apart. A resolution qualifies a
    // figure that was measured and fell under the floor; it cannot qualify one
    // that was never measured.
    const windows = r.samples.reduce((n, x) => n + x.loopDelaySamples, 0);
    if (newest !== undefined) {
      parts.push(
        windows === 0
          ? `loop delay${ctx.sep}no window sampled yet`
          // **The resolution is a knob and not a measurement**, so it is printed
          // as it is set: `ms()` renders the 10 the probe is configured with as
          // `10.0`, which reads as a reading of something.
          : `loop delay at resolution ${String(newest.loopDelayResolutionMs)} ms${ctx.sep}` +
            `a figure under it is a floor, not a reading`,
      );
    }
  }
  if (spec.draws.includes("spans") || spec.draws.includes("worst")) parts.push("self time, not total");
  if (r.excluded.selfInflicted > 0) parts.push(`${String(r.excluded.selfInflicted)} self-inflicted frames excluded`);
  if (r.excluded.fallback > 0) parts.push(`${String(r.excluded.fallback)} fallback frames excluded`);
  if (spec.draws.includes("latency") || spec.draws.includes("spans")) {
    parts.push(`+/-${(r.regime.histogramError * 100).toFixed(1)}% bucket error`);
  }
  return parts.join(ctx.sep);
};

/**
 * One card, drawn.
 *
 * Unknown ids fall to the verdict rather than to nothing — the rule the panes
 * this replaces had, for the same reason: a view that renders empty
 * on a typo is indistinguishable from one whose timer has stopped.
 */
export function profileCard(
  report: ProfileReport,
  id: string,
  region: Region,
  caps: GlyphCaps = ASCII_CAPS,
  seq?: number,
): readonly Block[] {
  const spec = specOf(id) ?? CARDS[0];
  if (spec === undefined) return [];
  const ctx = contextFor(report, region, caps, seq);
  const draw = DRAW[spec.id];
  if (draw === undefined) {
    // Unreachable while `T1.115` holds the two lists equal; the branch exists
    // because the alternative to a notice here is a throw inside a render path
    // with no catch, which is exactly F1130.
    return [b.notice("warn", `no drawing is registered for the card \`${spec.id}\``, undefined, { id: `${spec.id}-missing` })];
  }
  return [card(`card-${spec.id}`, titleOf(spec, ctx), draw(ctx, spec), footerOf(spec, ctx))];
}


/**
 * One addressable entry of a section — a card, and the frame it is showing.
 *
 * **The deck's length is a function of the report** (C28 I58, §9b B18). The
 * per-frame cards hold one entry per retained frame, `worst` is recomputed on
 * every `report()`, and the view refreshes every second — so a *global* ordinal
 * changes under a reader who has pressed nothing. The address is therefore
 * `(section, index-within-section)` and the entry carries the `seq` it resolved
 * to, never the position it came from.
 *
 * A per-frame card over an empty `worst` is **one entry and not none**: a
 * section that silently loses three cards on an empty ring is a deck whose
 * length disagrees with its own contents table, and the card itself already
 * draws the *no retained frame* notice (I23).
 */
export type DeckEntry = Readonly<{ spec: CardSpec; seq?: number }>;

export const deckOf = (report: ProfileReport, section: ProfileSection): readonly DeckEntry[] =>
  cardsOf(section).flatMap((spec): readonly DeckEntry[] => {
    if (spec.perFrame !== true) return [{ spec }];
    const worst = report.worst;
    if (worst.length === 0) return [{ spec }];
    return worst.map((f) => ({ spec, seq: f.seq }));
  });

/**
 * The view's seam — an address in, one card's blocks out.
 *
 * The index is **clamped rather than refused**: the deck shortens when a frame
 * leaves `worst`, and a reader sitting on the last per-frame card of a section
 * would otherwise be shown nothing between one tick and the next keypress. A
 * clamp moves them one card and says which frame it is; an empty answer is
 * indistinguishable from a timer that has stopped (F1130's reading).
 */
export function profileDeck(
  report: ProfileReport,
  section: ProfileSection,
  index: number,
  region: Region,
  caps: GlyphCaps = ASCII_CAPS,
): readonly Block[] {
  const deck = deckOf(report, section);
  const entry = deck[Math.max(0, Math.min(index, deck.length - 1))];
  if (entry === undefined) return [];
  return profileCard(report, entry.spec.id, region, caps, entry.seq);
}

export { CARDS, CARD_GROUPS } from "./register.js";
export type { CardSpec, CardGroup, Region };
