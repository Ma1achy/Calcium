/**
 * Group 0 — the verdict, and the only card that must not page (C28 I52).
 *
 * **It reads `src/testing/profile.ts` rather than recomputing it** (C28 I55).
 * `checkBudget` already returns `closed` / `justified` / `undecided` and a
 * `marginal` flag for a crossing inside the histogram's own error, against
 * A01 Appendix B's thresholds quoted verbatim. A second expression for that
 * arithmetic is a second expression to keep in step, and the one that drifts is
 * always the one on screen.
 */
import { b } from "../../builders/index.js";
import type { Block, QuartileSummary, Series } from "../../../data/viewmodel/index.js";
import { BUDGET, checkBudget } from "../checks.js";
import { CARDS } from "./register.js";
import type { CardDraw } from "./kit.js";
import { card, cannotDraw, figureRows, ms, room } from "./kit.js";

/**
 * The budget, as a `bullet` — and the axis is the whole design decision.
 *
 * A01's six rows are in six units: bytes, milliseconds three times, a count and
 * a fraction of a core. **One figure cannot share a y axis across those**, so
 * every row is drawn as a fraction of its own threshold, the target band sits
 * at 1.0 on all six, and the footer says so. A bullet whose bands were the raw
 * figures would be arithmetically correct and would read as *bytes are the
 * problem* on every session, because bytes are the largest number.
 */
/** The panel's two rows, the verdict's three, and the contents' four. */
const VERDICT_RESERVE = 9;

const budgetFigure: CardDraw = (ctx, spec) => {
  const budget = checkBudget(ctx.report);
  const measured = budget.rows.filter((r) => r.state === "measured");
  if (measured.length === 0) {
    return [
      b.notice(
        "warn",
        `none of the six budget rows could be measured — ${budget.unanswered.join(", ")}. ` +
          `The verdict is \`${budget.verdict}\`, which is not the same claim as *nothing crossed*`,
        undefined,
        { id: "verdict-unanswerable" },
      ),
    ];
  }
  // **The reserve is the rest of the card, counted rather than hoped.** I52's
  // 23 rows at 80 columns are the panel's two, the verdict's three and the
  // contents' four — so the figure gets what is left and the card cannot page
  // by growing a row somewhere else.
  const G = { form: "bullet" as const, axes: true };
  if (!room(ctx, spec, G, VERDICT_RESERVE)) return cannotDraw(ctx, spec, VERDICT_RESERVE);

  // Each row's figure over its own threshold. `thresholdText` carries the
  // threshold in words and `value` the figure in the row's own unit; the ratio
  // is what makes six units one axis.
  const bands: QuartileSummary[] = measured.map(() => ({
    min: 0, q1: 0.5, median: 0.8, q3: 1, max: 1.4, centre: 1,
  }));
  // **The threshold comes from `BUDGET`, joined on `row`** — not from a regex
  // over `thresholdText`. The first cut parsed the prose, and *Sustained > 100
  // KB* yields 100 where the figure is 100 × 1024: every bar saturated at the
  // right edge and the card read *everything is over budget* on a session that
  // is not. Arithmetically self-consistent and about a different report, which
  // is the one thing only reading the frame catches.
  const values = measured.map((r) => {
    const threshold = BUDGET.find((x) => x.row === r.row)?.threshold ?? 1;
    return Number((threshold === 0 ? (r.value > 0 ? 2 : 0) : r.value / threshold).toFixed(3));
  });

  return [
    b.plot({
      id: "verdict-bullet",
      form: "bullet",
      axes: true,
      // **The bullet's height is its row count.** Six budget rows in a
      // twenty-one-row area is six bars and fifteen blanks, which reads as a
      // figure that failed rather than one that is small.
      height: figureRows(ctx, G, VERDICT_RESERVE, measured.length),
      categories: measured.map((r) => r.label),
      quartiles: bands,
      series: [{ values, label: "of its threshold" } satisfies Series],
      gapBefore: false,
    }),
    b.kv(
      {
        verdict: `${budget.verdict}${
          budget.crossed.length > 0 ? ` — ${budget.crossed.join(", ")}` : ""
        }`,
        // A crossing inside the histogram's own error is reported as a crossing
        // and believed as a maybe (C28 I13) — the flag exists because a p95 of
        // 16.1 against 16 is the bucketing, not the software.
        marginal: measured.filter((r) => r.marginal).map((r) => r.label).join(", ") || "none",
        regime: budget.regime,
      },
      { id: "verdict-kv", gapBefore: false },
    ),
  ];
};

/**
 * Card 0's second half: the deck, in one line a group.
 *
 * **A row per card was the first cut and it does not fit** — thirty-six rows
 * under a figure, in a card I52 says must not page, measured at 44 rows against
 * 23. The table was not shortened to make room; it was the wrong artefact. A
 * reader on the first screen wants to know *which way to walk*, and the answer
 * to that is the group and its size, not thirty-six questions they will read
 * one at a time anyway. The questions are on the cards, where they are being
 * asked.
 */
export const contents: CardDraw = (ctx) => {
  const groups = ["app", "framework"] as const;
  const listed = Object.fromEntries(
    groups.map((g) => {
      const cards = CARDS.filter((c) => c.group === g);
      return [
        `${g} (${String(cards.length)})`,
        cards.map((c) => c.id).join(ctx.sep),
      ];
    }),
  );
  return [
    b.kv(listed, { id: "verdict-contents", gapBefore: false }),
    b.notice(
      "info",
      `\`n\`/\`p\` walk the ${String(CARDS.length)} cards${ctx.sep}\`tab\`/\`shift-tab\` walk the groups${ctx.sep}\`esc\` closes`,
      undefined,
      { id: "verdict-keys" },
    ),
  ];
};

export const VERDICT_CARDS: Readonly<Record<string, CardDraw>> = Object.freeze({
  verdict: (ctx, spec) => [...budgetFigure(ctx, spec), ...contents(ctx, spec)],
});

export { card, ms };
export type { Block };
