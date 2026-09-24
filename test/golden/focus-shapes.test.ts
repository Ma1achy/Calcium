// §017, §018 — which shapes answer focus, measured over the whole corpus.
//
// **A census, not a frame, and the difference is the point.** §017's claim is
// that *the focus treatment follows the shape*: a RUN inverts, a BOX inverts
// whole, a FRAME takes its border or axes, a CONTROL washes. Nothing in the
// tree could say which kinds do that — `focusGround` resolves in every theme
// (it is in `theme-tokens.test.ts`'s table), and a slot existing is not a
// treatment reaching a renderer. The map's `built` column probed `focusGround`
// for both sections and answered *built* for both.
//
// So this renders every kind twice — once with `focus` naming it, once without
// — and compares. The kinds whose frames differ are the ones that answer; the
// rest draw a focused block exactly as they draw an unfocused one.
//
// **Compared by equality against a declared set**, which is what makes it a
// driven exemption rather than a note: the day a kind gains its treatment the
// row fails and the set is edited, and the day one silently loses it the row
// fails too. A `toContain` in either direction would let the set rot.
import { describe, expect, it } from "vitest";

import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { DARK_THEME, FULL_CAPS, measurable } from "../support/render.js";

/**
 * The kinds whose frame moves when the block is focused, today — **per focus
 * form**, because the two forms are not the same question.
 *
 * `FocusState.rowId` is `null` for *the block itself* and the block's own id
 * for *the block as its own element*, and the plot answers only the second.
 * That is F802's ruling and not an oversight: the null form is one the type
 * admits and no session produces, so it paints nothing deliberately, and the
 * plot reads `rowId === block.id`.
 *
 * **Two kinds of thirty-six, and both by accident of what they already paint.**
 * `scroll` moves because its bar takes `accent` while focus is inside the box
 * (C09 I92); `plot` because a focused frame takes its axes (C10 §4k.2 row 4,
 * `R-FOC-004`). Neither is §017's table arriving — they are two renderers that
 * happened to have somewhere to put it.
 *
 * Every other kind draws a focused block byte for byte as it draws an
 * unfocused one, in **both** forms: a `raw` run does not invert, a `pills` box
 * does not, a `panel` frame does not take its border, and `steps`, `table`,
 * `progress`, `code`, `status`, `notice` and the rest do nothing at all. So
 * §017's four rows are unbuilt for the RUN, the BOX and the FRAME alike.
 *
 * **The CONTROL row is built, and the sentence that stood here is now false**
 * (C09 I105, I106, §018). It read *there is no `button`, `slider`, `toggle`,
 * `checkbox` or `radio` kind*, which was a record of the day it was written
 * rather than a watch on the condition — the class this repository keeps
 * finding. `control` is §018's slider and it answers in both forms; the button
 * is a `notice` with an action and lands on the RUN row rather than here.
 *
 * **`choice` is absent from both sets and that is the instrument, not the
 * kind.** The sweep rewrites every sample's id to one name and focuses
 * `FOCUSED` — which reaches a kind whose rows are positional and cannot reach
 * one whose rows are named by its own data, because a choice's elements are its
 * options' ids. So a choice renders identically under a focus pointed at a row
 * it does not have, correctly. What covers it is C09 T1.72, which focuses each
 * option by name and reads the four cells; naming the hole here is what keeps
 * this row from being read as coverage it does not have.
 */
const ANSWERS: Readonly<Record<"self" | "block", readonly string[]>> = Object.freeze({
  /** `rowId === block.id` — the form a session writes. */
  self: Object.freeze(["control", "plot", "scroll"]),
  /** `rowId === null` — the form the plot deliberately ignores (F802). */
  block: Object.freeze(["control", "scroll"]),
});

describe("§017, §018 — which shapes answer focus", () => {
  const kit = (rowId: string | null | undefined) =>
    measurable({
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      definitions: [plotDefinition, tableDefinition] as never,
      ...(rowId === undefined ? {} : { focus: { blockId: "FOCUSED", rowId } }),
    });

  /**
   * The corpus, with each sample's id rewritten to one name.
   *
   * **The id is rewritten rather than the focus pointed at each sample's own**,
   * so one `FocusState` serves the whole sweep and a sample whose id the corpus
   * later changes cannot quietly stop being focused — which would make every
   * kind look like a non-answerer and read exactly like this finding.
   */
  const samples = Object.entries(ONE_PER_KIND).map(
    ([kind, sample]) => [kind, { ...sample, id: "FOCUSED" } as never] as const,
  );

  for (const form of ["self", "block"] as const) {
    it(`GC6${form === "self" ? "" : "b"} (§017, §018, R-FOC-001, R-FOC-004): the kinds answering focus as \`${form}\` are exactly the declared set`, () => {
      const rowId = form === "self" ? "FOCUSED" : null;
      const moved = samples
        .filter(([, b]) => JSON.stringify(kit(undefined).renderToLines(b, 60)) !== JSON.stringify(kit(rowId).renderToLines(b, 60)))
        .map(([kind]) => kind);
      expect([...moved].sort(), `kinds answering focus as ${form}`).toEqual([...ANSWERS[form]].sort());
    });
  }

  it("GC7 (§017, §018): the sweep responds — a control, so an empty answer is not a pass", () => {
    // **A census that measured nothing would agree with a tree where focus
    // reaches everything and with one where it reaches nothing.** The rows
    // above assert sets of two and one, which an empty sweep cannot satisfy —
    // but a sweep rendering *the same frame twice* would answer the empty set,
    // and the row would then be a claim that nothing answers, which is nearly
    // true and reads as correct. So the control is the other direction: each
    // declared kind must answer, asked one at a time, in its own form.
    for (const kind of ANSWERS.self) {
      const b = { ...(ONE_PER_KIND as Record<string, object>)[kind], id: "FOCUSED" } as never;
      expect(kit("FOCUSED").renderToLines(b, 60), `${kind} answers focus`).not.toEqual(
        kit(undefined).renderToLines(b, 60),
      );
    }
    // And the form that is *not* answered is asserted to be unanswered, on
    // F802's own ruling, so the null form silently gaining a treatment fails
    // here rather than being absorbed.
    const plot = { ...(ONE_PER_KIND as Record<string, object>)["plot"], id: "FOCUSED" } as never;
    expect(kit(null).renderToLines(plot, 60), "the null form paints nothing (F802)").toEqual(
      kit(undefined).renderToLines(plot, 60),
    );
  });
});
