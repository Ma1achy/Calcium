// The regional tone budget as a conformance suite — C10 I58, `R-COL-002`, §090.
//
// **A conformance helper rather than a constructor check, and the rule's own
// wording is the reason.** §090 says *an ordinary entry: three semantic tones.
// Five is a smell* — a smell is a judgement about a design, and C04 I6's kind
// of refusal would turn it into an error thrown at a surface that had a reason.
// So it returns findings as data and the caller decides, which is the shape
// `measurement-conformance.ts` already argues for: no `expect`, no `it`, one
// implementation and several callers.
//
// **Per entry, never per document.** §090 is explicit — *a full frame counting
// twelve tones is not breaking the rule — the rule was about one ENTRY, and it
// was stated globally* — so the suite takes entries and a caller that summed a
// screen would fail on correct output.
import { TONE_BUDGET, TONE_SMELL, entryTones } from "../presentation/theme/budget.js";
import type { Block, Tone } from "../data/viewmodel/index.js";

/**
 * One entry, named so a finding can say which.
 *
 * **Not exported, deliberately.** MG24 refuses a published member with no
 * consumer in `src/`, and every field here is consumed by a caller's assertion
 * rather than by this repository — so publishing the name would spend an
 * exemption to describe a shape structural typing already hands over. The
 * alternative the rule offers is an allow-list entry, and not publishing is the
 * cheaper truth.
 */
type ToneEntry = Readonly<{ name: string; blocks: readonly Block[] }>;

/** What one entry spent, and whether it is over. Unexported, as `ToneEntry` is. */
type ToneFinding = Readonly<{
  name: string;
  tones: readonly Tone[];
  /** Over `TONE_SMELL`, which is §090's threshold rather than its budget. */
  over: boolean;
  /** Above `TONE_BUDGET` but not yet over — the band the design calls ordinary. */
  above: boolean;
}>;

/**
 * Every entry's spend, in the order given.
 *
 * **Total and silent**: it reports on all of them rather than stopping at the
 * first, because the count is the useful output even where nothing is over —
 * a suite that returned only failures could not tell *inside the budget* from
 * *not counted*, which is the distinction this rule was missing to begin with.
 */
export function toneBudgetSuite(entries: readonly ToneEntry[]): readonly ToneFinding[] {
  return entries.map((entry) => {
    const tones = [...entryTones(entry.blocks)].sort();
    return Object.freeze({
      name: entry.name,
      tones: Object.freeze(tones),
      over: tones.length > TONE_SMELL,
      above: tones.length > TONE_BUDGET,
    });
  });
}

export { TONE_BUDGET, TONE_SMELL };
