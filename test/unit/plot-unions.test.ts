/**
 * C04 I118 — every string-literal union `Plot` declares is checked at the
 * document gate, and the table is the mechanism rather than a list beside one
 * (F213, F1076).
 *
 * **The rows are driven by `PLOT_UNIONS` itself**, so a member added to the
 * table is covered on the day it lands rather than on the day someone
 * remembers. MG31 is the other half: it compares the table to `Plot`'s own
 * declaration by equality, in both directions, so a member the table has never
 * heard of cannot reach these rows and pass by being absent from both.
 */
import { describe, expect, it } from "vitest";
import { validateDocument } from "../../src/data/viewmodel/index.js";
// Imported from the module that owns it rather than from the barrel: the table
// is the gate's mechanism and not part of the published surface (C24 I31).
import { PLOT_UNIONS } from "../../src/data/viewmodel/validate.js";

/** The errors a plot carrying `extra` produces, narrowed to one member's. */
const errsFor = (member: string, extra: object, form = "line"): readonly string[] => {
  const r = validateDocument({
    version: 1,
    blocks: [{ kind: "plot", id: "p", form, height: 5, series: [{ values: [1, 2, 3] }], ...extra }],
  });
  return r.ok ? [] : r.error.filter((m) => m.includes(`"${member}" must be`));
};

describe("C04 I118 — Plot's string-literal unions", () => {
  it("T1.35 (C04 I118, F213): every union member refuses a value outside it, and the refusal names the member", () => {
    // **The corpus, before anything is asserted over it.** A loop that found
    // nothing satisfies every expectation inside it, and this one is the whole
    // row: 25 members, which is the number the enumeration in C04's `colormap`
    // clause put at five.
    //
    // **24 until `xFormat` arrived, and it arrived from the other side of the
    // gate** (F1085). `Plot` declares 24 unions as literals and a 25th by
    // reference — `xFormat?: Plot["yFormat"]` — which MG31's parse could not see
    // and whose comment asserted the form was absent from `Plot`. The two
    // numbers are different things and both are held: 24 inline members, 25
    // table entries.
    expect(Object.keys(PLOT_UNIONS), "the class is 25").toHaveLength(25);
    const unchecked: string[] = [];
    for (const member of Object.keys(PLOT_UNIONS)) {
      // A value no union admits, and not a near-miss: `"vertial"` is the case
      // that produced a message about an arm the caller never asked for.
      if (errsFor(member, { [member]: "no-such-value" }).length === 0) unchecked.push(member);
    }
    expect(unchecked, "every union member is refused at the gate").toEqual([]);
  });

  it("T1.36 (C04 I118): the control — every union's own values are accepted, `false` included", () => {
    // **Without this, T1.35 passes on a gate that refuses everything**, which is
    // the same green and the opposite defect. `false` is carried by three of the
    // unions and a reader that quoted it would refuse all three while looking
    // correct, so it is exercised rather than assumed.
    const refused: string[] = [];
    let sawFalse = 0;
    for (const [member, values] of Object.entries(PLOT_UNIONS)) {
      for (const value of values) {
        if (value === false) sawFalse += 1;
        if (errsFor(member, { [member]: value }).length > 0) refused.push(`${member}=${String(value)}`);
      }
    }
    expect(sawFalse, "three unions admit `false`").toBe(3);
    expect(refused, "a member's own value is never a membership error").toEqual([]);
  });

  it("T1.37 (C04 I118, F213, F1076): the eight that no rule reached, named rather than looped", () => {
    // **The finding's own list is the corpus here on purpose.** T1.35 loops the
    // table, so it would stay green if an entry were deleted; these eight are
    // what was measured unchecked, and three of them are the three still open
    // from C04's list of five while five appear in no document at all.
    for (const member of ["plotFrame", "legend", "orientation", "layout", "binning", "box3", "axes3", "colourBy"]) {
      expect(errsFor(member, { [member]: "no-such-value" }), `${member} was unchecked before I118`).toHaveLength(1);
    }
  });

  it("T1.37 (C04 I118, F213) — the second half: `orientation` is refused for its value, not for a vertical arm the caller never asked for", () => {
    // **The one of the eight that produced an error, and it named the wrong
    // thing.** `checkOrientation` returns early only for `undefined` and
    // `"horizontal"`, so a `pie` carrying `"vertial"` was told the form has no
    // vertical arm — a message about a value the document does not contain.
    const r = validateDocument({
      version: 1,
      blocks: [{ kind: "plot", id: "p", form: "pie", height: 5, series: [{ values: [1, 2] }], orientation: "vertial" }],
    });
    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.error;
    expect(errors.join(" "), "the value is what is wrong").toContain('"orientation" must be "horizontal" or "vertical"');
  });

  it("T1.38 (C04 I118): a form rule stays silent about a value the document does not contain", () => {
    // The membership error is pushed once and the form rule below asks
    // `isKnownPlotValue` before it speaks, so a bad value on the wrong form is
    // one fault rather than two — and the second would have described a value
    // the caller never wrote.
    const r = validateDocument({
      version: 1,
      blocks: [{ kind: "plot", id: "p", form: "line", height: 5, series: [{ values: [1] }], treeLayout: "radial" }],
    });
    expect(r.ok).toBe(false);
    const about = r.ok ? [] : r.error.filter((m) => m.includes("treeLayout"));
    expect(about, "one fault, and it is the value's").toHaveLength(1);
    expect(about[0]).toContain('must be "auto", "topDown", "leftRight" or "outline"');
  });
});
