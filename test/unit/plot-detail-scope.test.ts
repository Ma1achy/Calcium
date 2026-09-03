/**
 * PD1–PD3 — `plotDetail`'s scope, which it did not have (C12 I34, §3i · F220).
 *
 * **The whole defect was an absence of an error.** One reader in `src/`, three
 * call sites, no validator — so the member was accepted on 42 of 44 forms and
 * did nothing on them. Every frame was correct either way, which is why no
 * frame-read, golden or mutation could reach it: there was no wrong output, only
 * a refusal that never happened.
 *
 * **PD3 is the row that keeps it fixed.** `HAS_DETAIL_RUNGS` lives in `types.ts`
 * (L0) and `RUNGS` in `definition.ts` (L1), and L0 does not import upward — so
 * the two cannot be derived from one another and must agree. A `true` with no
 * ladder is a refusal that never fires; a `false` with one is a ladder no caller
 * can reach.
 */
import { describe, expect, it } from "vitest";
import { HAS_DETAIL_RUNGS, type PlotForm } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { b } from "../../src/shell/builders/index.js";
import { ONE_PER_FORM, ALL_FORMS } from "../support/plot-forms.js";

const errs = (form: PlotForm, plotDetail: string): readonly string[] => {
  const r = validateDocument({
    version: 1,
    blocks: [{ ...(ONE_PER_FORM[form] as object), id: "pd", plotDetail }],
  });
  return r.ok ? [] : r.error.filter((m) => /plotDetail/u.test(m));
};

describe("PD1 (C12 I34): a form with no ladder refuses the member", () => {
  it("every `false` form is refused, for all three values", () => {
    let refused = 0; // cells-ok — a form count
    for (const form of ALL_FORMS) {
      if (HAS_DETAIL_RUNGS[form]) continue;
      for (const v of ["auto", "compact", "full"] as const) {
        expect(errs(form, v).join(" "), `${form} ${v}`).toMatch(/no ladder of rungs/u);
      }
      refused += 1; // cells-ok — a form count
    }
    // The fixture responds: the record is not all-`true`, and the count is the
    // measurement rather than a restatement of the table.
    expect(refused).toBe(45); // cells-ok — a form count; 44 before `plot3d`
  });

  it("the builder refuses it too — both gates", () => {
    expect(() => b.plot({
      form: "line", height: 6, series: [{ values: [1, 2] }], plotDetail: "compact",
    } as never)).toThrow(/plotDetail/u);
  });

  it("an unknown value is refused on a form that does have a ladder", () => {
    expect(errs("boxplot", "medium").join(" ")).toMatch(/"auto", "compact" or "full"/u);
  });
});

describe("PD2 (C12 I34): the two forms with a ladder still take all three", () => {
  it("boxplot and violin accept every value", () => {
    for (const form of ["boxplot", "violin"] as const) {
      for (const v of ["auto", "compact", "full"] as const) {
        expect(errs(form, v), `${form} ${v}`).toEqual([]);
      }
    }
  });

  it("absent is accepted everywhere, which is why the defect was invisible", () => {
    for (const form of ALL_FORMS) {
      const r = validateDocument({
        version: 1, blocks: [{ ...(ONE_PER_FORM[form] as object), id: "pd" }],
      });
      expect((r.ok ? [] : r.error).filter((m) => /plotDetail/u.test(m)), form).toEqual([]);
    }
  });
});

describe("PD3 (C12 I34): the record and the ladder agree", () => {
  it("exactly the forms with a `RUNGS` entry answer `true`", async () => {
    // **Read from the renderer's own module**, not restated here — a second copy
    // of the list would agree with itself and with nothing else.
    const mod = await import("../../src/presentation/plot/definition.js");
    const ladders = (mod as unknown as { RUNG_FORMS?: readonly string[] }).RUNG_FORMS;
    expect(ladders, "definition.ts must publish RUNG_FORMS for this row").toBeDefined();
    const withLadder = new Set(ladders);
    for (const form of ALL_FORMS) {
      expect(HAS_DETAIL_RUNGS[form], form).toBe(withLadder.has(form));
    }
  });
});
