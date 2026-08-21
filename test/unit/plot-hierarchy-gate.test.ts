/**
 * HG1–HG5 — the shape `hierarchy` carries, at both gates (C04 I64 · F221).
 *
 * **`validate.ts` did not contain the word.** Six shapes measured through both
 * gates and the renderer: a node with no `value`, a `children` that is the
 * string `"nope"`, a child that is the number `42`, a node with no `label`,
 * `value: NaN`, and a well-formed chain 3200 deep — every one accepted. Two of
 * them reached `[plot failed to render]`, which is C09 I11's containment rather
 * than luck, and one wrote the nine letters `undefined` into the frame as a
 * tile's name.
 *
 * **HG5 is the row with teeth.** `HIERARCHY_ROLE` is a claim about which
 * renderers read the field, and a record asserted against a restatement of
 * itself asserts nothing — so the row renders every form twice, with and without
 * a hierarchy, and reads the **frames**: a `null` form must be unmoved by one
 * and a `"magnitude"` form must not be.
 */
import { describe, expect, it } from "vitest";
import { HIERARCHY_MAX_DEPTH, HIERARCHY_ROLE, type PlotForm } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { b } from "../../src/shell/builders/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { ALL_FORMS, ONE_PER_FORM } from "../support/plot-forms.js";

const kit = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

/** The validator's complaints about `hierarchy`, and nothing else's. */
function errs(form: string, hierarchy: unknown): readonly string[] {
  const r = validateDocument({
    version: 1,
    blocks: [{ kind: "plot", id: "hg", form, height: 6, series: [], hierarchy }],
  });
  return r.ok ? [] : r.error.filter((m) => /hierarchy/u.test(m));
}

/** What the constructor said, or `""` where it accepted. */
function thrown(form: PlotForm, hierarchy: unknown): string {
  try {
    b.plot({ id: "hg", form, height: 6, series: [], hierarchy: hierarchy as never });
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const good = { label: "root", value: 100, children: [{ label: "a", value: 40 }] };

/** The six shapes F221 measured, each named by the fault it should produce. */
const BROKEN: readonly (readonly [string, unknown, RegExp])[] = [
  ["a node with no value", { label: "root", children: [{ label: "a" }] }, /value/u],
  ["children is a string", { label: "root", value: 10, children: "nope" }, /children must be an array/u],
  ["a child is a number", { label: "root", value: 10, children: [42] }, /must be an object/u],
  ["a node with no label", { value: 10, children: [{ label: "a", value: 4 }] }, /label must be a string/u],
  ["value is NaN", { label: "root", value: Number.NaN }, /value/u],
  ["value is negative", { label: "root", value: -1 }, /value/u],
];

describe("HG1 (C04 I64): a malformed hierarchy is refused at both gates", () => {
  for (const [name, hierarchy, fault] of BROKEN) {
    it(`${name} — validator and constructor`, () => {
      const messages = errs("treemap", hierarchy);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(fault);
      expect(thrown("treemap", hierarchy)).toMatch(fault);
    });
  }

  it("names the path to the fault rather than the block", () => {
    // A fault two levels down, so a message naming only `hierarchy` fails this.
    const deep = {
      label: "root", value: 10,
      children: [{ label: "a", value: 4, children: [{ label: "b", value: "no" }] }],
    };
    expect(errs("treemap", deep)[0]).toMatch(/hierarchy\.children\[0\]\.children\[0\]\.value/u);
  });
});

describe("HG2 (C04 I64): a hierarchy on a form that reads none is refused", () => {
  it("every `null` form, at both gates, and the count is asserted", () => {
    const nulls = ALL_FORMS.filter((f) => HIERARCHY_ROLE[f] === null);
    // **41 of 44.** Asserted so the row cannot pass against a record that is
    // `null` everywhere — the shape of the defect it exists to prevent.
    expect(nulls).toHaveLength(41);
    for (const form of nulls) {
      expect(errs(form, good), form).toHaveLength(1);
      expect(errs(form, good)[0], form).toMatch(/draws a series, a matrix or a field/u);
      expect(thrown(form, good), form).toMatch(/draws a series, a matrix or a field/u);
    }
  });

  it("and the three that read one accept it", () => {
    const magnitude = ALL_FORMS.filter((f) => HIERARCHY_ROLE[f] === "magnitude");
    expect(magnitude).toEqual(["flame", "icicle", "treemap"]);
    for (const form of magnitude) {
      expect(errs(form, good), form).toEqual([]);
      expect(thrown(form, good), form).toBe("");
    }
  });

  it("absent is accepted everywhere but the one form with nothing else", () => {
    // **The row that records why the field went unchecked**, and the carve-out
    // is deliberate: `tree` is the only form whose whole subject is the shape,
    // so absence is refused there and ordinary on the other forty-four, two of
    // which fall back to their series and one to its empty message (C04 I65).
    for (const form of ALL_FORMS) {
      if (HIERARCHY_ROLE[form] === "structure") {
        expect(errs(form, undefined), form).toHaveLength(1);
        continue;
      }
      expect(errs(form, undefined), form).toEqual([]);
    }
  });
});

describe("HG3 (C04 I64): the depth bound is the walk's, not the data's", () => {
  const chain = (d: number): unknown => {
    let n: unknown = { label: "leaf", value: 1 };
    for (let i = 0; i < d; i += 1) n = { label: `n${String(i)}`, value: 1, children: [n] };
    return n;
  };

  it(`${String(HIERARCHY_MAX_DEPTH)} deep is accepted and one deeper is not`, () => {
    expect(errs("treemap", chain(HIERARCHY_MAX_DEPTH))).toEqual([]);
    expect(errs("treemap", chain(HIERARCHY_MAX_DEPTH + 1))[0]).toMatch(/nests deeper than 256/u);
  });

  it("a cycle terminates rather than exhausting the stack", () => {
    // A document cannot carry one; a builder call can, and the bound is what
    // stops the walk — which is the reason it exists, rather than any depth
    // anybody's data has.
    const loop: Record<string, unknown> = { label: "root", value: 1 };
    loop["children"] = [loop];
    expect(thrown("treemap", loop)).toMatch(/nests deeper than 256/u);
  });
});

describe("HG4 (C04 I64): the fault is the same one at both gates", () => {
  it("every broken shape produces the constructor's message inside the validator's", () => {
    // One walk read twice, asserted rather than assumed: the constructor's
    // message is the validator's with a `b.plot:` prefix and the same fault.
    for (const [name, hierarchy] of BROKEN) {
      const fromValidator = errs("treemap", hierarchy)[0] ?? "";
      const fault = thrown("treemap", hierarchy).replace(/^b\.plot: /u, "");
      expect(fault, name).not.toBe("");
      expect(fromValidator.endsWith(fault), `${name}: ${fromValidator} / ${fault}`).toBe(true);
    }
  });
});

describe("HG5 (C04 I64): the record agrees with the frames", () => {
  const rows = (blk: object): string =>
    kit.renderToLines(blk as never, 40).join("\n").replace(/\x1b\[[0-9;]*m/gu, "");

  it("a `null` form is unmoved by a hierarchy and a `magnitude` form is not", () => {
    // Rendered directly, which is the third path: a fixture reaches the
    // renderer without passing either gate (C12 I2). The gates refuse the
    // `null` cases, so this is the only place the claim can be measured.
    const moved: PlotForm[] = [];
    for (const form of ALL_FORMS) {
      const base = ONE_PER_FORM[form];
      const before = rows(base);
      const after = rows({ ...base, hierarchy: good });
      if (before !== after) moved.push(form);
    }
    expect(moved.sort()).toEqual(["flame", "icicle", "tree", "treemap"]);
  });
});
