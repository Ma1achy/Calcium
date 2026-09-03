// C04 tier 2 — contract. The vocabulary C07, C09, C13 and every surface is
// written against.
//
// The generic suite is measurement, and **C04 ships no measurers**: `render`
// needs theme and capabilities, so the registry lives in C09 (§1). T2.1–T2.6 and
// T2.8 therefore wait on it, and say so rather than passing vacuously over an
// empty registry — which is the failure mode A03 §2 exists to name.
//
// What C04 can hold to now is the part that is C04's: exhaustiveness, the module
// graph, the source scan, and the width arithmetic every measurer must share.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import {
  applyPatch,
  childWidths,
  groupChildWidths,
  type Share,
  insetWidth,
  normaliseWidth,
  ACTION_KINDS,
  validateBlock,
  validateDocument,
  type Action,
  type Block,
  type BlockKind,
  type Group,
  type Panel,
} from "../../src/data/viewmodel/index.js";
import { ADVERSARIAL, ALL_KINDS, CORPUS, doc, ONE_PER_KIND } from "../support/blocks.js";
import {
  checkAsciiParity,
  checkMeasurement,
  DEFAULT_WIDTHS,
  formatReport,
} from "../../src/testing/measurement-conformance.js";
import { ASCII_CAPS, measurable } from "../support/render.js";

/**
 * Every member of the union, listed. The annotation is the assertion: adding a
 * kind without adding it here stops compiling, and adding one without a
 * validator entry stops compiling in `KIND_CHECKS` (T2.10).
 */
const EXPECTED_KINDS = [
  "rule",
  "notice",
  "keyValue",
  "table",
  "steps",
  "logs",
  "events",
  "plot",
  "progress",
  "code",
  "comparison",
  "patch",
  "pills",
  "tip",
  "panel",
  "group",
  "raw",
  "mosaic",
  "image",
  "scroll",
  "status",
] as const;
const _exhaustive: readonly BlockKind[] & { length: 21 } = EXPECTED_KINDS;
void _exhaustive;

/**
 * A `row`/`column` group of `n` trivial children — the shape `groupChildWidths`
 * takes, since the width rule now reads the block's own weights (C04 I42).
 */
function rowOf(n: number, direction: "row" | "column", flex?: readonly Share[]): Group {
  return {
    kind: "group",
    id: "g",
    direction,
    children: Array.from({ length: n }, (_, i) => ({ kind: "raw", id: `r${String(i)}`, text: "x" }) as Block),
    ...(flex === undefined ? {} : { flex }),
  } as Group;
}

describe("C04 contract", () => {
  it("T2.11 (C04 I34): the five action kinds are exhaustive, and each is checked for its own field", () => {
    // **`ACTION_KINDS` is derived from the union and `ACTION_FIELD` is a total
    // `Record` over it**, so a sixth kind added without validation does not
    // compile. This test asserts the half a type cannot: that the check runs at
    // all. Until it existed, actions were never validated — an adapter could
    // emit any object at all and every check passed.
    expect([...ACTION_KINDS].sort()).toEqual(["exec", "expand", "fill", "open", "view"]);

    const patchWith = (actions: readonly unknown[]): unknown => ({
      kind: "patch",
      id: "p1",
      path: "a.yaml",
      language: "yaml",
      hunks: [],
      actions,
    });

    const good: Action = { kind: "view", label: "fullscreen", target: "p1" };
    expect(validateBlock(patchWith([good])).ok).toBe(true);

    // The failing directions, one per way an action can be wrong. Asserted
    // separately because a single "invalid" case passes for a check that only
    // ever looks at `kind`.
    const unknownKind = validateBlock(patchWith([{ kind: "viev", label: "x", target: "p1" }]));
    expect(unknownKind.ok).toBe(false);
    expect(unknownKind.ok ? [] : unknownKind.error.join(" ")).toMatch(/"kind" must be one of/);

    const noTarget = validateBlock(patchWith([{ kind: "view", label: "fullscreen" }]));
    expect(noTarget.ok).toBe(false);
    expect(noTarget.ok ? [] : noTarget.error.join(" ")).toMatch(/"target" must be a string/);

    const noLabel = validateBlock(patchWith([{ kind: "view", target: "p1" }]));
    expect(noLabel.ok).toBe(false);
    expect(noLabel.ok ? [] : noLabel.error.join(" ")).toMatch(/"label" must be a string/);

    // `open` carries `url` and not `target` — the row that shows the field is
    // the kind's rather than one name shared by all five.
    const openWrongField = validateBlock(patchWith([{ kind: "open", label: "docs", target: "p1" }]));
    expect(openWrongField.ok).toBe(false);
    expect(openWrongField.ok ? [] : openWrongField.error.join(" ")).toMatch(/"url" must be a string/);

    // Absent is legal, which is the control: without it every assertion above
    // passes for a validator that rejects any patch carrying the field.
    expect(validateBlock({ kind: "patch", id: "p2", path: "a", language: "", hunks: [] }).ok).toBe(true);
  });

  it("T2.10: every member of the Block union is validated, and the corpus covers all 21", () => {
    // The kinds ship (commitment 2; the union is 21 at HEAD, nineteen when this
    // was written). The corpus is what C09's T2.1 runs over (C09 is built; this
    // said *once C09 exists* until 2026-09-03), so a kind missing from it is a kind the headline
    // test would silently never see.
    expect([...ALL_KINDS].sort()).toEqual([...EXPECTED_KINDS].sort());

    for (const kind of EXPECTED_KINDS) {
      const fixture = ONE_PER_KIND[kind];
      expect(fixture, `${kind} needs a fixture`).toBeDefined();
      expect(validateBlock(fixture).ok, `${kind} must validate`).toBe(true);
    }
  });

  it("T2.18 (I46, §5a): every fixture survives a JSON round trip unchanged", () => {
    // **The property persistence rests on** (F166, roadmap 44). The block union
    // holds no function, `Map`, `Set` or `Date`, so `JSON.stringify` is the
    // serialiser and `validateDocument` is the parser — and nothing asserted it
    // until this row, which is why the two defects T2.19 covers were reachable.
    //
    // `toEqual` rather than `toStrictEqual` is §5a rows 3 and 4: it treats `-0`
    // and `0` as equal and ignores a key whose value is `undefined`, which are
    // exactly the two inequalities the spec tolerates and names. T3.24 asserts
    // both directly rather than leaving them to a comparison's defaults.
    let ran = 0;
    for (const b of CORPUS) {
      const d = doc({ blocks: [b] });
      const round = validateDocument(JSON.parse(JSON.stringify(d)) as unknown);
      expect(round.ok, `${b.kind} "${b.id}" must revalidate: ${round.ok ? "" : round.error.join("; ")}`).toBe(true);
      if (round.ok) expect(round.value, `${b.kind} "${b.id}" round trip`).toEqual(d);
      ran += 1;
    }

    // **An exit status is one bit and it is the same bit for clean and for
    // did-not-run.** A sweep over an empty corpus is the same green as one that
    // passed, and three instruments in this repository have reported a
    // completion they never observed.
    expect(ran, "the sweep ran over every fixture").toBe(CORPUS.length);
    expect(ran).toBeGreaterThan(ALL_KINDS.length);
  });

  it("T2.19 (I46, §5a): what JSON cannot carry is refused, and it was accepted twice", () => {
    // **The fabricated failures, and they did not need fabricating.** Without
    // these the sweep above is vacuous — a property no input can violate passes
    // exactly like one that is satisfied (A03 §2).
    //
    // The measured state before the fix, and the reason it is the bad kind of
    // silent: `validateBlock` accepted `[1, NaN]`, `JSON.stringify` wrote it as
    // `[1, null]`, and `validateBlock` accepted **that** too. A persisted plot
    // reloaded as a different plot and the validator agreed both times.
    const plotWith = (values: readonly unknown[]): unknown => ({
      kind: "plot",
      id: "p",
      form: "line",
      height: 8,
      series: [{ values, label: "rps" }],
    });

    expect(validateBlock(plotWith([1, Number.NaN])).ok, "NaN is not a JSON number").toBe(false);
    expect(validateBlock(plotWith([1, Number.POSITIVE_INFINITY])).ok, "nor is Infinity").toBe(false);

    // **The wider half, and the one that has nothing to do with round trips**:
    // the elements were never checked at all — `requireArray` established the
    // array and stopped — so an untrusted document could put anything in a
    // numeric array. A string is what a far side produces.
    //
    // **`null` moved sides, and the rule did not** (I46a). It used to be refused
    // as *what NaN becomes*, which made absence unrepresentable in a document
    // while C12 I4 rendered it — two correct invariants whose overlap was a hole.
    // What the rule always said is *a numeric array holds what JSON can carry*,
    // and `null` round-trips into itself where `NaN` round-trips into something
    // else. That distinction is the whole of the change and it is asserted here
    // rather than described.
    expect(validateBlock(plotWith([1, null])).ok, "null is the gap (I46a)").toBe(true);
    expect(
      JSON.parse(JSON.stringify([1, null])),
      "and it survives the trip `NaN` does not",
    ).toEqual([1, null]);
    expect(validateBlock(plotWith(["12"])).ok, "a numeric string is not a number").toBe(false);

    // The second numeric array, which no round trip would have surfaced: a
    // sparkline inside a table cell.
    const tableWithSpark = (spark: unknown): unknown => ({
      kind: "table",
      id: "t",
      columns: [{ key: "a", label: "A" }],
      rows: [{ id: "r1", cells: { a: { text: "x", spark } } }],
    });
    expect(validateBlock(tableWithSpark(["1", "2"])).ok, "Cell.spark holds numbers").toBe(false);
    expect(validateBlock(tableWithSpark([1, 2])).ok, "and a real one is accepted").toBe(true);

    // The control: the same shapes, well formed. Without it every assertion
    // above passes for a validator that refuses any plot at all.
    expect(validateBlock(plotWith([1, 2, 3])).ok, "a finite series is accepted").toBe(true);
  });

  it("T3.24 (I46, §5a): the two inequalities the property tolerates, asserted rather than assumed", () => {
    // §5a rows 3 and 4. Both are real differences and neither is worth
    // narrowing the type for — but a difference nobody wrote down is a defect
    // waiting to be rediscovered, so the rows exist to say which two they are.
    const minusZero = doc({
      blocks: [{ kind: "progress", id: "g", label: "x", current: -0, total: 10 }],
    });
    const backAgain = validateDocument(JSON.parse(JSON.stringify(minusZero)) as unknown);
    expect(backAgain.ok, "`-0` is a finite number and stays valid").toBe(true);
    // `Object.is` is the comparison that can see it; `toEqual` cannot, which is
    // why the sweep above is silent about this case and this row is not.
    const roundedCurrent = JSON.parse(JSON.stringify(minusZero)).blocks[0].current as number;
    expect(Object.is(roundedCurrent, -0), "and JSON writes it as `0`").toBe(false);
    expect(roundedCurrent).toBe(0);

    // An explicit `undefined` loses its key. Unreachable through the framework —
    // `exactOptionalPropertyTypes` makes `{gapBefore: undefined}` a different
    // type from `{}`, and every constructor spreads-if-present — so this is a
    // hand-written document, which is exactly what a persisted one is.
    const explicit = { kind: "raw", id: "r", text: "a", gapBefore: undefined };
    const parsed = JSON.parse(JSON.stringify(explicit)) as Record<string, unknown>;
    expect("gapBefore" in explicit, "the key is there before").toBe(true);
    expect("gapBefore" in parsed, "and gone after").toBe(false);
  });

  it("T2.10b: the validator rejects a malformed instance of every kind", () => {
    // Exhaustiveness is only worth something if each entry does work. A table
    // of no-op validators is exhaustive and checks nothing.
    for (const kind of EXPECTED_KINDS) {
      const broken = { kind, id: "x" } as unknown as Block;
      const r = validateBlock(broken);
      expect(r.ok, `${kind}: a block with only kind and id must not validate`).toBe(false);
    }
  });

  it("T2.10c: an unregistered kind is not an error — the union is open (F1)", () => {
    // An app registers kinds through C09. C04 cannot validate what it does not
    // declare, and refusing it would close a union the spec says is open.
    const custom = { kind: "sankey", id: "s1", nodes: [] } as unknown as Block;
    expect(validateBlock(custom).ok).toBe(true);

    // The id rule still applies, because ViewPatch addresses by it.
    expect(validateBlock({ kind: "sankey" } as unknown as Block).ok).toBe(false);
  });

  it("T2.7 (I5): the source scan for colour in viewmodel/ is real and scoped to files", () => {
    const scan = SCANS.find((s) => s.id === "SS16");
    expect(scan, "SS16 must exist").toBeDefined();

    // SS26's lesson: a scope matching no files reports compliance forever. This
    // asserts the rule has something to be wrong about.
    const files = [
      "src/data/viewmodel/types.ts",
      "src/data/viewmodel/patch.ts",
      "src/data/viewmodel/validate.ts",
      "src/data/viewmodel/construct.ts",
      "src/data/viewmodel/measure.ts",
      "src/data/viewmodel/index.ts",
    ];
    for (const f of files) {
      expect(f.startsWith(scan!.scope), `${f} must be inside SS16's scope`).toBe(true);
    }

    // Clean today...
    expect(checkSourceScans(files)).toEqual([]);

    // ...and it fires when it should.
    const fabricated = checkSourceScans(["src/data/viewmodel/types.ts"], () => 'const fg = "#c0ffee";');
    expect(fabricated.map((v) => v.rule)).toContain("SS16");
  });

  it("T2.9 (I11, MG4): C04 imports nothing from terminal/, presentation/ or above", () => {
    const files = [
      "src/data/viewmodel/index.ts",
      "src/data/viewmodel/types.ts",
      "src/data/viewmodel/patch.ts",
      "src/data/viewmodel/validate.ts",
      "src/data/viewmodel/construct.ts",
      "src/data/viewmodel/measure.ts",
    ];
    expect(checkModuleGraph(files)).toEqual([]);

    // And the pass is for the right reason. A type-only import from L1 erases
    // at build and slips past the module graph, which is exactly why ColumnDef
    // was moved into C04 rather than imported from C11 — this asserts the
    // import is genuinely absent, not merely invisible to the graph.
    const source = files.map((f) => readIfPresent(f)).join("\n");
    expect(source, "no reference to presentation/ at all, type-only or otherwise").not.toMatch(
      /from\s+["'][^"']*presentation/,
    );
    expect(source).not.toMatch(/from\s+["'][^"']*terminal/);
  });

  it("T2.11 (I4): validateDocument and validateBlock are total over hostile input", () => {
    const hostile: unknown[] = [
      undefined,
      null,
      0,
      "",
      "a string",
      [],
      {},
      { kind: 42 },
      { blocks: null },
      new Map(),
      Symbol("x"),
      () => undefined,
      { schema: "tui.view/1", blocks: "not an array" },
    ];

    for (const input of hostile) {
      expect(() => validateDocument(input), `validateDocument(${String(input)})`).not.toThrow();
      expect(() => validateBlock(input), `validateBlock(${String(input)})`).not.toThrow();
      expect(validateDocument(input).ok).toBe(false);
    }
  });

  it("T2.12 (I15): applyPatch is total over every op against a hostile document", () => {
    const base = doc({ blocks: [ONE_PER_KIND.rule] });
    const patches: Parameters<typeof applyPatch>[1][] = [
      { op: "append", block: ONE_PER_KIND.raw },
      { op: "replace", blockId: "", block: ONE_PER_KIND.raw },
      { op: "merge", blockId: "", rows: [] },
      { op: "status", status: "proposed" },
    ];

    for (const p of patches) {
      expect(() => applyPatch(base, p), p.op).not.toThrow();
      const r = applyPatch(base, p);
      expect(typeof r.ok, `${p.op} returns a discriminated result`).toBe("boolean");
    }
  });

  it("T2.13 (I8): applyPatch is pure — the same input twice is deeply equal", () => {
    const base = doc({ blocks: [ONE_PER_KIND.rule] });
    const patch = { op: "append", block: ONE_PER_KIND.raw } as const;

    const a = applyPatch(base, patch);
    const b = applyPatch(base, patch);

    expect(a.ok && b.ok && a.doc).toEqual(b.ok ? b.doc : undefined);
    expect(base.blocks, "and the input never moves").toHaveLength(1);
  });
});

describe("C04 measurement arithmetic (§3)", () => {
  // C04 ships no measurers, but it does ship the widths every measurer must
  // agree on. C11 already inset its detail by 2 while nothing said so; two
  // components reading the same paragraph and writing `w - 1` and `w - 2` is a
  // drift T2.1 would find only at whichever width a child happens to wrap.

  it("T2.14: width 0 and negative widths normalise to 1, never to a division by zero", () => {
    for (const w of [0, -1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normaliseWidth(w), `width ${w}`).toBe(1);
    }
    expect(normaliseWidth(80.7), "fractional widths floor").toBe(80);
  });

  it("T2.15: panel and table detail inset by exactly 2, and never below 1", () => {
    expect(insetWidth(80)).toBe(78);
    expect(insetWidth(3)).toBe(1);
    expect(insetWidth(2), "a panel narrower than its own borders still measures").toBe(1);
    expect(insetWidth(1)).toBe(1);
  });

  it("T2.16: a column group passes the full width; a row group splits equally", () => {
    expect(groupChildWidths(rowOf(4, "column"), 80)[0], "column children get the full width").toBe(80);

    // floor((80 - 2) / 3) = 26, with one cell of gutter between each pair.
    expect(groupChildWidths(rowOf(3, "row"), 80)[0]).toBe(26);
    expect(groupChildWidths(rowOf(1, "row"), 80)[0], "one child, no gutter").toBe(80);
    expect(groupChildWidths(rowOf(2, "row"), 80)[0]).toBe(39);
  });

  it("T2.17: childWidths agrees with the per-kind rules, for both containers", () => {
    const panel = ONE_PER_KIND.panel as Panel;
    expect(childWidths(panel, 80)).toEqual(panel.children.map(() => 78));

    const group = ONE_PER_KIND.group as Group;
    expect(childWidths(group, 80)).toEqual(group.children.map(() => 39));
  });
});

describe("C04 measurement contract", () => {
  it("T2.0: the conformance suite is written and runs, against a stub as well as a registry", () => {
    // The suite is real code, not a plan. Driving it against a stub keeps that
    // demonstrable now that a real registry exists: the suite is parameterised
    // over the registry, so a consumer runs it against theirs (C09 T4.2).
    const stub = {
      measure: (b: Block) => (b.kind === "group" ? 0 : 1),
      renderToLines: () => ["one line"],
      kinds: [...ALL_KINDS],
    };

    const report = checkMeasurement(stub, CORPUS.slice(0, 3), { widths: [80] });

    expect(report.checked).toBe(3);
    expect(typeof report.failures.length).toBe("number");
    expect(DEFAULT_WIDTHS, "C04 §8's seven widths").toEqual([40, 60, 80, 100, 120, 160, 200]);
  });

  /**
   * The registry is C09's, and these are C04's assertions about it: the
   * contract belongs to the component that declared it, and it is only
   * checkable now that something satisfies it. `table`, `plot` and `patch`
   * are excluded because C11, C12 and C25 register them — they resolve through
   * the `raw` fallback here, which measures the fallback rather than the kind.
   */
  const measured = CORPUS.filter((b) => !["table", "plot", "patch"].includes(b.kind));

  it("T2.1: for every registered kind × the corpus × seven widths, measure equals rendered line count", () => {
    // The headline, executed for the first time. Everything above L1 depends on
    // it and nothing else can enforce it: C14 virtualises on measured heights
    // without rendering, so the two coming apart is a viewport that drifts
    // rather than a block that looks wrong.
    const report = checkMeasurement(measurable(), measured);

    expect(report.failures, formatReport(report)).toEqual([]);
  });

  it("T2.2: measure is pure — a hundred repeat calls, no I/O", () => {
    const kit = measurable();

    for (const b of measured) {
      const first = kit.measure(b, 80);
      const answers = new Set(Array.from({ length: 100 }, () => kit.measure(b, 80)));
      expect(answers, `${b.id} is not pure`).toEqual(new Set([first]));
    }
  });

  it("T2.3: measure is total over the adversarial corpus — empty, zero-length, 10,000-character", () => {
    const kit = measurable();

    for (const b of ADVERSARIAL) {
      for (const width of [0, 1, 80, 10_000]) {
        expect(() => kit.measure(b, width), `${b.id} at ${width}`).not.toThrow();
      }
    }
  });

  it("T2.4: measure is monotone — appending a row never decreases height", () => {
    // Not enforceable generically, so it is a property per kind: the
    // conformance suite grows each collection block by one item and compares.
    const report = checkMeasurement(measurable(), measured, { widths: [80] });

    expect(report.failures.filter((f) => f.check === "monotone")).toEqual([]);
  });

  it("T2.5: measure never returns a negative or non-integer, at any width including 1", () => {
    const kit = measurable();

    for (const b of CORPUS) {
      for (const width of [1, 2, 3, 40, 200]) {
        const height = kit.measure(b, width);
        expect(Number.isInteger(height), `${b.id} at ${width}: ${height}`).toBe(true);
        expect(height, `${b.id} at ${width}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("T2.6: under unicode:'ascii' measure equals its value under unicode:'full' for every fixture", () => {
    // Every capability substitution is 1:1 by column count (C04 §5), so the
    // heights are identical rather than merely similar. The ellipsis is the
    // case that catches people: `…` is one column and `...` is three.
    const report = checkAsciiParity(
      measurable(),
      measurable({ capabilities: ASCII_CAPS }),
      measured,
    );

    expect(report.failures, formatReport(report)).toEqual([]);
  });
});

function readIfPresent(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
