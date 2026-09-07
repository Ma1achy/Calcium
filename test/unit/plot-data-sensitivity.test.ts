/**
 * DS1–DS4 — **a claimed form's frame is a function of its data** (C12 I66, §3ak.8).
 *
 * `G7b` asks whether a claimed form puts ink on the page, which `ecdf` passes:
 * it draws a staircase, framed, gridded and labelled. **The next rung is
 * whether the ink moves when the data does**, and it is the rung no instrument
 * this component has could reach — a golden frame records whatever is drawn, the
 * disagreement matrix compares labels and furniture, and a mutation on dead code
 * fails nothing by construction.
 *
 * **The exemption split is not bookkeeping — it is 15 of the 16.** Run without
 * asking how many numbers each perturbation actually changed, the sweep reports
 * sixteen insensitive frames; fifteen of those are fixtures with **no number to
 * perturb**, so their rows prove nothing and read exactly like passes. That is
 * `test/support/README.md`'s rule arriving inside the instrument that needs it
 * most: *a fixture must be shown to respond to the thing under test before it is
 * asserted against.*
 */
import { describe, expect, it } from "vitest";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number, id?: string) => readonly string[];
const FULL = caps.find((c) => c.name === "24bit")!.caps;
const WIDTH = 60;

/**
 * The keys that are not data. `form` picks the renderer; the rest are geometry
 * the reader asked for, and perturbing them tests the layout rather than the
 * figure.
 */
const NOT_DATA: ReadonlySet<string> = new Set(["form", "height", "width", "id", "kind"]);

/**
 * Every finite number under a data-bearing key, scaled by a factor that varies
 * with position — **so a form that sorts, bins or sums still sees a different
 * answer.** A uniform scale would leave a normalised figure identical and read
 * as insensitivity; reversing the order would leave a histogram identical and
 * read as the same thing, legitimately. Neither is a defect and both would be
 * reported as one.
 */
function perturb(v: unknown, count: { n: number }): unknown {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return v;
    count.n += 1;
    return v * (1 + (count.n % 7) * 0.37) + (count.n % 3);
  }
  if (Array.isArray(v)) return v.map((x) => perturb(x, count));
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, NOT_DATA.has(k) ? x : perturb(x, count)]),
    );
  }
  return v;
}

type Verdict = Readonly<{ id: string; changed: number; moved: boolean }>;

/** Every catalogue fixture, rendered twice — as given, and with its numbers moved. */
function sweep(): readonly Verdict[] {
  const out: Verdict[] = [];
  for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
    for (const [variant, spec] of Object.entries(variants)) {
      const count = { n: 0 };
      const before = frame(spec, FULL, WIDTH).join("\n");
      const after = frame(perturb(spec, count), FULL, WIDTH).join("\n");
      out.push({ id: `${form}/${variant}`, changed: count.n, moved: before !== after });
    }
  }
  return out;
}

/**
 * **Fixtures with no number to perturb**, listed rather than filtered (A03 §3).
 *
 * Eight `empty` variants — a fixture whose whole subject is having no data — and
 * the tree and graph fixtures, whose data is *structure*: labels and edges, with
 * `value` ignored by design on a tree (C12 I57, T1.122). An entry here is a
 * statement that this fixture cannot answer the question, **not** that the form
 * is exempt from it: the same form's other variants are swept normally.
 */
const NOTHING_TO_PERTURB: readonly string[] = [
  "line/empty", "line/empty-message", "sparkline/empty", "scatter/empty", "step/empty", "ecdf/empty",
  "heatmap/empty", "bar/empty",
  "graph/default", "graph/crowded",
  "tree/default", "tree/left-right", "tree/outline",
  "tree/overflow-top-down", "tree/overflow-left-right", "tree/overflow-outline",
];

/**
 * **The one form whose data reaches the renderer and changes nothing** (F269).
 *
 * `ecdfSeries` returns `(i + 1) / n` for every index, so it is a function of
 * `values.length` alone — its `sort` feeds a variable read only for `.length`.
 * The terminal draws the same staircase for every dataset of five samples, and
 * `[5, 1, 4, 2, 3]` and `[1, 1, 1, 1, 100]` are byte-identical frames.
 *
 * **Not fixed here.** §6b freezes the terminal arm for the unification pass, and
 * the repair is a form's figure rather than a defect — the empirical CDF wants
 * `densitySeries`' own mechanism, evaluated on a uniform grid over the data
 * range. Listed by **equality**, so the day `ecdf` starts responding this row
 * fails and the entry is removed rather than outliving its reason.
 */
const KNOWN_CONSTANT: readonly string[] = ["ecdf/default"];

describe("DS — a claimed form's frame is a function of its data (C12 I66, §3ak.8)", () => {
  const verdicts = sweep();

  it("DS1 (C12 I66): every fixture with data to change draws a different frame when it changes", () => {
    const answerable = verdicts.filter((v) => v.changed > 0);
    const constant = answerable.filter((v) => !v.moved).map((v) => v.id);
    // Equality both ways, on `BUILDER_OMISSIONS`' precedent: a subset check lets
    // a repaired form keep its exemption unread.
    expect([...constant].sort(), "the forms whose frame ignores their data").toEqual([...KNOWN_CONSTANT].sort());
    // **The count, because an exit status is one bit and it is the same bit for
    // *clean* and for *did not run*.**
    expect(answerable.length, "fixtures the sweep could actually ask").toBeGreaterThanOrEqual(160);
  });

  it("DS2 (C12 I66): the exempt rows are exempt because nothing could be perturbed, and that is measured", () => {
    // **This row is 15 of the 16 and it is why DS1's number means anything.**
    // Without it the sweep reports sixteen insensitive forms, fifteen of which
    // were never asked a question.
    const silent = verdicts.filter((v) => v.changed === 0).map((v) => v.id);
    expect([...silent].sort(), "fixtures with no finite number under a data key").toEqual([...NOTHING_TO_PERTURB].sort());
    for (const id of KNOWN_CONSTANT) {
      const v = verdicts.find((x) => x.id === id)!;
      expect(v.changed, `${id} is a real answer, not an unasked question`).toBeGreaterThan(0);
    }
  });

  it("DS3 (C12 I66): the comparison can see sameness — the fabricated violation", () => {
    // **A sweep certified only by its own record agrees with itself whatever it
    // does** (AD5's argument, one instrument along). Rendering the same spec
    // twice must land in the *constant* bucket, or DS1 is a row that cannot
    // fail: a comparison that never reports equality reports 163 movers on any
    // corpus, including one where nothing works.
    const spec = CATALOGUE_FORMS.line.default;
    const twice = frame(spec, FULL, WIDTH).join("\n") === frame(spec, FULL, WIDTH).join("\n");
    expect(twice, "identical input, identical frame").toBe(true);
    const count = { n: 0 };
    const moved = frame(spec, FULL, WIDTH).join("\n") !== frame(perturb(spec, count), FULL, WIDTH).join("\n");
    expect(count.n, "and the control had numbers to move").toBeGreaterThan(0);
    expect(moved, "a form that works moves").toBe(true);
  });

  it("DS4 (C12 I66, F269): `ecdf` is a function of its sample count and of nothing else", () => {
    // The mechanism, named rather than left to the sweep — so a repair that
    // makes the frame move for the *wrong* reason still has to face this.
    const of = (values: readonly number[]): string =>
      frame({ form: "ecdf", height: 8, axes: true, series: [{ values }] }, FULL, 44).join("\n");
    expect(of([5, 1, 4, 2, 3]), "reordered").toBe(of([1, 2, 3, 4, 5]));
    expect(of([5, 1, 4, 2, 3]), "and rescaled beyond recognition").toBe(of([1, 1, 1, 1, 100]));
    expect(of([1, 2, 3]), "only the count changes it").not.toBe(of([1, 2, 3, 4]));
  });
});
