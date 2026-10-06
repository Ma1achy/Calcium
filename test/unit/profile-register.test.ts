// C28 §3c's register — the three totality gates, tier 1
// (docs/components/C28_profiler.md §10).
//
// **Written before the cards they are about**, which is the only reason they
// found anything: a gate added after a deck is a gate the deck already
// satisfies. These three ran against declarations alone and named one key and
// three forms — `byEntry` with no figure (C28 I61, F1129), `bubble` with no
// disposition (I59, F1132), and two cards whose question had no time axis in
// the report at all (F1131).
//
// **Each asks a question no card can answer about itself.** A card knows its own
// form and its own keys; only the register knows whether the set of them covers
// anything. That is the shape of every instrument in this repository that has
// found something — a way of looking, rather than a property asserted.
import { describe, expect, it } from "vitest";

import {
  CARDS,
  CARD_GROUPS,
  FORM_DISPOSITION,
  REPORT_KEYS,
  UNDRAWN,
} from "../../src/shell/profiling/panes/register.js";
import type { CardSpec, Disposition } from "../../src/shell/profiling/panes/register.js";

/** Every form a card draws, primary and conditional alike. */
const formsOf = (c: CardSpec): readonly string[] => [
  ...(c.form === null ? [] : [c.form]),
  ...(c.also ?? []),
];

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

describe("C28 §3c — the deck's registers", () => {
  it("T1.111 (C28 I59): every PlotForm is a card or a recorded refusal, compared both ways", () => {
    // The compile-time half is `FORM_DISPOSITION`'s own
    // `satisfies Readonly<Record<PlotForm, Disposition>>`, which the `Record`
    // makes total and `satisfies` makes exact — a form added to C12 fails the
    // build here, and an entry for a form C12 no longer has fails too.
    //
    // What the type cannot check is whether the *disposition* is true, and both
    // directions of that are a real failure: a form marked `card` that no card
    // draws is a picture claimed and not built, and a form drawn by a card while
    // marked `refused` is a refusal that outlived its reason unread.
    const drawn = sorted(CARDS.flatMap(formsOf));
    const claimed = sorted(
      Object.entries(FORM_DISPOSITION)
        .filter(([, d]) => (d as Disposition) === "card")
        .map(([f]) => f),
    );
    expect(drawn, "the cards' forms and the forms marked `card`").toEqual(claimed);

    // And the residue is accounted for rather than merely absent: every form
    // that is not a card has one of the three other dispositions, and the three
    // are all populated — a register where `deferred` had emptied itself would
    // pass a subset check and be the defect.
    const rest = Object.entries(FORM_DISPOSITION).filter(([, d]) => (d as Disposition) !== "card");
    expect(new Set(rest.map(([, d]) => d))).toEqual(new Set(["inline", "refused", "deferred"]));
    expect(rest.length + claimed.length).toBe(Object.keys(FORM_DISPOSITION).length);
  });

  it("T1.113 (C28 I61): every ProfileReport key is a card's or the undrawn register's, both ways", () => {
    // `REPORT_KEYS` is exhaustive against `keyof ProfileReport` at compile time
    // — `EVERY_REPORT_KEY` is `never extends never` exactly when it is — so
    // this row cannot be satisfied by a list that forgot a member. A
    // hand-written corpus checked against a hand-written corpus is a tally over
    // two populations that agree by being wrong together (F1119's shape).
    const read = sorted(CARDS.flatMap((c) => c.draws));
    const undrawn = sorted(Object.keys(UNDRAWN));

    // Equality in both directions, not containment: a key reaching no card
    // fails, and an undrawn entry for a key some card now draws fails with it.
    expect(sorted([...read, ...undrawn]), "cards plus undrawn against the type").toEqual(
      sorted(REPORT_KEYS),
    );
    expect(read.filter((k) => undrawn.includes(k)), "no key is both").toEqual([]);

    // Every undrawn entry carries a reason, and a reason that names its blocker
    // as a symbol — a deferral whose condition is prose is one nothing can watch.
    for (const [key, why] of Object.entries(UNDRAWN)) {
      expect(why.length, `${key}'s reason is written`).toBeGreaterThan(80);
      expect(why, `${key} names a finding`).toMatch(/F\d+/u);
    }
  });

  it("T1.109b (C28 I57, C28 I41): every card declares the population its spans came from", () => {
    // Two spans with one name are two populations (F888, F1127), and the site
    // is the only thing that distinguishes them. A card drawing a span with no
    // declared site is the defect this exists to make impossible to write.
    const spanKeys = new Set(["spans", "timeline", "worst", "nodes", "byKind", "latency"]);
    for (const c of CARDS) {
      const readsSpans = c.draws.some((k) => spanKeys.has(k));
      if (readsSpans) {
        expect(c.site, `${c.id} reads span data and must name its population`).not.toBe("none");
      } else {
        expect(c.site, `${c.id} reads no span data`).toBe("none");
      }
    }

    // **The control, before the absence**: both populations are actually in the
    // deck. A register where every card said `frame` would satisfy every
    // assertion above and would mean the session-site half was never drawn —
    // which is the state §3c was in before F1131 recut the `gantt`, and it is
    // the state a reader could not see.
    const sites = new Set(CARDS.map((c) => c.site));
    expect(sites, "both populations are drawn, and so are the cards that draw neither").toEqual(
      new Set(["frame", "session", "none"]),
    );
  });

  it("T1.114 (C28 I58, C28 I52): the deck's own shape — ids unique, groups contiguous, per-frame declared", () => {
    const ids = CARDS.map((c) => c.id);
    expect(sorted(ids).length, "every id is distinct").toBe(ids.length);
    for (const id of ids) expect(id, `${id} is an address, not a title`).toMatch(/^[a-z][a-z0-9-]*$/u);

    // Contiguous and in the declared order, because `n`/`p` walk the deck
    // straight through and `tab` leaves a group: a group whose cards are split
    // across the array is a section the section gesture cannot name.
    const order = CARDS.map((c) => CARD_GROUPS.indexOf(c.group));
    expect(order, "the groups do not interleave").toEqual([...order].sort((a, z) => a - z));
    expect(new Set(CARDS.map((c) => c.group)), "every group has cards").toEqual(
      new Set(CARD_GROUPS),
    );

    // The verdict is one card and it is first — C28 I52's subject, and the only
    // card the region has to hold whole.
    expect(CARDS.filter((c) => c.group === "verdict").map((c) => c.id)).toEqual(["verdict"]);
    expect(CARDS[0]?.id).toBe("verdict");

    // A per-frame card is addressed by a `seq` and therefore reads `worst`;
    // one that did not would be claiming a frame it has no way to resolve (C28 I58).
    for (const c of CARDS.filter((x) => x.perFrame === true)) {
      expect(c.draws, `${c.id} resolves its seq against worst`).toContain("worst");
    }
    expect(CARDS.some((c) => c.perFrame === true), "the deck has per-frame cards").toBe(true);

    // Every card declares a floor above zero (C28 I60). The figures are asserted
    // against `b.plot` by T1.112; this is the weaker claim that none is missing,
    // and it is the one that can be made before the cards are built.
    for (const c of CARDS) expect(c.floor, `${c.id} declares a floor`).toBeGreaterThan(0);
  });
});
