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
import { tableDefinition } from "../../src/presentation/table/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/types.js";
import { ALIGN_ENTRIES, block as blockOf } from "../../src/data/viewmodel/index.js";
import type { Block as AnyBlock } from "../../src/data/viewmodel/index.js";

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
  "terminal",
] as const;
const _exhaustive: readonly BlockKind[] & { length: 22 } = EXPECTED_KINDS;
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

  it("T2.10: every member of the Block union is validated, and the corpus covers all 22", () => {
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

  it("T2.11b (C04 §3, arc 6 §5): a notice's one `action` is checked by the rule a tip's are — kind, label, and the kind's field", () => {
    const notice = (action?: unknown): unknown => ({
      kind: "notice",
      id: "n1",
      tone: "error",
      glyph: "error",
      text: "pull failed",
      ...(action === undefined ? {} : { action }),
    });
    expect(validateBlock(notice()).ok, "absent is the notice it always was").toBe(true);
    expect(validateBlock(notice({ kind: "fill", label: "retry", command: "pull" })).ok).toBe(true);
    expect(validateBlock(notice({ kind: "open", label: "log", url: "file:///var/log/x" })).ok).toBe(true);

    const unknownKind = validateBlock(notice({ kind: "retry", label: "retry", command: "pull" }));
    expect(unknownKind.ok).toBe(false);
    expect(unknownKind.ok ? "" : unknownKind.error.join(" ")).toMatch(/\.action: "kind" must be one of/);
    const noField = validateBlock(notice({ kind: "fill", label: "retry" }));
    expect(noField.ok).toBe(false);
    expect(noField.ok ? "" : noField.error.join(" ")).toMatch(/\.action: "command" must be a string/);
    const notObject = validateBlock(notice("retry"));
    expect(notObject.ok).toBe(false);
    expect(notObject.ok ? "" : notObject.error.join(" ")).toMatch(/\.action: must be an object/);
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

describe("C04 §3 both axes — construction (I100, I102)", () => {
  const raws = (n: number): AnyBlock[] =>
    Array.from({ length: n }, (_, i) => ({ kind: "raw", id: `c${String(i)}`, text: "x\ny" }) as AnyBlock);
  const errors = (over: Record<string, unknown>): string => {
    const outcome = validateBlock({ kind: "group", id: "g", direction: "row", children: raws(3), ...over });
    return outcome.ok ? "" : outcome.error.join(" ");
  };

  it("T2.110 (C04 I100): both axes construct, vertical first, one entry per child", () => {
    expect(errors({ align: ["bottom-right", "centre", "top"] })).toBe("");
    // **Vertical first, as the type reads** (table row 14): a typo that parsed
    // either way round would be a layout nobody asked for.
    const swapped = errors({ align: ["right-bottom", "top", "top"] });
    expect(swapped).toContain("align[0]");
    expect(swapped).toContain("bottom-right");
    const short = errors({ align: ["left", "top"] });
    expect(short).toContain("2 entries for 3 children");
  });

  it("T2.111 (C04 I102): minRows is a positive whole number, and the group measures it", () => {
    expect(errors({ minRows: 6 })).toBe("");
    const kit = measurable();
    const floored = blockOf({ kind: "group", id: "g", direction: "row", children: raws(2), minRows: 6 });
    expect(kit.measure(floored, 40), "two-row children under a floor of six").toBe(6);
    for (const bad of [0, -1, 2.5, "6"]) {
      expect(errors({ minRows: bad }), JSON.stringify(bad)).toContain("minRows");
    }
  });

  it("T2.112 (C04 I100, C04 I45): every one of the fifteen entries constructs and none moves a height", () => {
    expect(ALIGN_ENTRIES, "the vocabulary").toHaveLength(15);
    const kit = measurable();
    const plain = blockOf({ kind: "group", id: "g", direction: "row", children: raws(1) });
    for (const entry of ALIGN_ENTRIES) {
      const aligned = blockOf({ kind: "group", id: "g", direction: "row", children: raws(1), align: [entry] });
      for (const width of [7, 40, 120]) {
        expect(kit.measure(aligned, width), `${entry} at ${String(width)}`).toBe(kit.measure(plain, width));
      }
    }
  });
});

describe("C04 §7 — the update model and the view state, checked rather than cited", () => {
  const kit = measurable({
    definitions: [tableDefinition, patchDefinition as unknown as BlockDefinition<never>],
  });

  const tableWith = (over: Record<string, unknown> = {}): AnyBlock =>
    ({
      kind: "table",
      id: "t",
      columns: [{ key: "a", label: "A", role: "expand" }, { key: "b", label: "B" }],
      rows: [
        {
          id: "r1",
          cells: { a: { text: "one" }, b: { text: "1" } },
          detail: [{ kind: "tip", id: "d", text: "detail line" }],
          ...over,
        },
        { id: "r2", cells: { a: { text: "two" }, b: { text: "2" } } },
      ],
    }) as never;

  const docOf = (blocks: readonly unknown[]): never =>
    ({
      schema: "tui.view/1",
      command: "x",
      status: "ok",
      meta: {
        verb: null, adapter: "shell", stderr: "", exitCode: 0, durationMs: 1,
        truncated: false, argv: ["x"], transport: "subprocess", origin: "user",
      },
      blocks,
    }) as never;

  it("T2.119 (I18): every view-state field that moves a height is a field of the block, and the set is closed", () => {
    /**
     * **Enumerated and compared by equality**, because I18's claim is about the
     * *set*: any view state that affects height is a field of the block. A row
     * asserting that `expanded` moves a height says nothing about the fifth one
     * arriving somewhere else, and a fifth arriving somewhere else is the only
     * way this invariant can be false.
     */
    const MOVES: readonly [string, AnyBlock, AnyBlock, number, number][] = [
      ["TableRow.expanded", tableWith({ expanded: false }), tableWith({ expanded: true }), 3, 4],
      [
        "Scroll.collapsed",
        { kind: "scroll", id: "s", height: 4, children: [{ kind: "tip", id: "x", text: "a\nb\nc\nd\ne" }] } as never,
        { kind: "scroll", id: "s", height: 4, collapsed: true, children: [{ kind: "tip", id: "x", text: "a\nb\nc\nd\ne" }] } as never,
        5, 1,
      ],
      [
        "Floor.minHeight",
        { kind: "tip", id: "x", text: "a" } as never,
        { kind: "tip", id: "x", text: "a", minHeight: 7 } as never,
        1, 7,
      ],
      [
        "Patch.collapsedAfter",
        { kind: "patch", id: "p", path: "f", language: "ts", hunks: [{ id: "h", header: "@@", lines: [{ kind: "add", text: "x" }, { kind: "add", text: "y" }] }] } as never,
        { kind: "patch", id: "p", path: "f", language: "ts", collapsedAfter: 1, hunks: [{ id: "h", header: "@@", lines: [{ kind: "add", text: "x" }, { kind: "add", text: "y" }] }] } as never,
        4, 5,
      ],
    ];

    const moved: string[] = [];
    for (const [name, before, after, wasRows, isRows] of MOVES) {
      expect(kit.measure(before, 60), `${name}: off`).toBe(wasRows);
      expect(kit.measure(after, 60), `${name}: on`).toBe(isRows);
      moved.push(name);
    }
    expect(moved, "the whole set, so a fifth fails here").toEqual([
      "TableRow.expanded", "Scroll.collapsed", "Floor.minHeight", "Patch.collapsedAfter",
    ]);

    // **`gapBefore` is deliberately absent, and measuring it is what makes the
    // list a measurement.** It is composition's field, not a height's: `measure`
    // answers 1 either way, and a list of *optional fields* would have caught it.
    expect(kit.measure({ kind: "tip", id: "x", text: "a", gapBefore: false } as never, 60)).toBe(1);
    expect(kit.measure({ kind: "tip", id: "x", text: "a", gapBefore: true } as never, 60)).toBe(1);

    // The complement, measured rather than argued: nothing accumulates outside
    // the block, so the same block measures the same after an unrelated one.
    const held = tableWith({ expanded: true });
    const first = kit.measure(held, 60);
    kit.measure({ kind: "tip", id: "z", text: "unrelated" } as never, 60);
    expect(kit.measure(held, 60), "measure is a pure function of block and width (I7)").toBe(first);
  });

  it("T2.120 (I20): a pills block is one block whose breaks the width chooses, and the height is the packing", () => {
    const chips = (n: number, len: number) =>
      Array.from({ length: n }, (_, i) => ({ label: "c".repeat(len - 1) + String(i % 10) }));
    const pills = (n: number, len: number): AnyBlock =>
      ({ kind: "pills", id: "p", chips: chips(n, len) }) as never;

    /**
     * **Asserted against the packing, not against `ceil(totalWidth / w)`**
     * (F928). This document carried that formula in §3 and an invariant saying
     * the height *stays declared rather than emerging from how many pills
     * happened to fit* — and it is exactly what it does. Six 10-wide chips:
     */
    expect(kit.measure(pills(6, 10), 40), "three per row at 40").toBe(2);
    expect(kit.measure(pills(6, 10), 20), "one per row at 20").toBe(6);
    expect(Math.ceil(60 / 20), "and the formula says three").toBe(3);

    // **A chip is never split, which is the observable difference between a
    // packing and a wrap.** Two 30-wide chips at 20 are two rows, not three.
    expect(kit.measure(pills(2, 30), 20), "a chip wider than the width keeps its own row").toBe(2);

    // The frame, read beside the number so the two cannot drift — and so the
    // reader can see that "one logical row" is about authorship: the chips are
    // one sequence and the width decided where it broke.
    expect(kit.renderToLines(pills(6, 10), 40).map((l) => l.replace(/\u001b\[[0-9;]*m/gu, ""))).toEqual([
      "ccccccccc0  ccccccccc1  ccccccccc2",
      "ccccccccc3  ccccccccc4  ccccccccc5",
    ]);
  });

  it("T2.121 (I21): a merge never deletes a row, and no shape of MergeRow could", () => {
    const before = docOf([tableWith()]);
    const after = applyPatch(before, {
      op: "merge",
      blockId: "t",
      rows: [{ id: "r1", cells: { a: { text: "ONE" }, b: { text: "9" } } }],
    } as never);
    expect(after.ok, "the merge lands").toBe(true);
    if (!after.ok) return;

    const rowsOf = (d: unknown): readonly { id: string }[] =>
      ((d as { blocks: { rows: { id: string }[] }[] }).blocks[0]?.rows ?? []);
    expect(rowsOf(after.doc).map((r) => r.id), "the unmentioned row is still there").toEqual(["r1", "r2"]);

    // **Reference-identical**, which is the half a deep comparison cannot see:
    // an untouched row that was rebuilt equal is a row the merge did touch, and
    // C13's identity checks would then re-render a table that had not changed.
    expect(rowsOf(after.doc)[1], "and it is the same object (T1.6)").toBe(rowsOf(before)[1]);

    /**
     * **And the structural half, which makes it a rule rather than a sample.**
     * `MergeRow = Omit<TableRow, "expanded">` — there is no delete marker to
     * send, so a payload *cannot* express deletion however it is shaped. A
     * marker would make a dropped row and an unmentioned row indistinguishable,
     * and shedding a row is `replace`'s job because the adapter decides which
     * it meant.
     */
    const types = readFileSync("src/data/viewmodel/types.ts", "utf8");
    expect(types, "no arm of the payload removes a row").toContain(
      'export type MergeRow = Omit<TableRow, "expanded">;',
    );
  });

  it("T2.122 (I22, I9): replace is wholesale and merge preserves — the pair is the whole update model", () => {
    const before = docOf([tableWith({ expanded: true })]);
    const expandedOf = (d: unknown): boolean | undefined =>
      (d as { blocks: { rows: { expanded?: boolean }[] }[] }).blocks[0]?.rows[0]?.expanded;
    expect(expandedOf(before), "the row is open to begin with").toBe(true);

    const replaced = applyPatch(before, { op: "replace", blockId: "t", block: tableWith() } as never);
    expect(replaced.ok).toBe(true);
    if (replaced.ok) {
      expect(expandedOf(replaced.doc), "replace carries no view state across").toBeUndefined();
    }

    const merged = applyPatch(before, {
      op: "merge",
      blockId: "t",
      rows: [{ id: "r1", cells: { a: { text: "ONE" }, b: { text: "9" } } }],
    } as never);
    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(expandedOf(merged.doc), "and merge keeps it").toBe(true);
    }

    // **The payload cannot forge it either**, which is the arm that makes I9 a
    // protection rather than a default: `stripViewState` removes `expanded`
    // from an incoming row, so view state survives only where it already was.
    const forged = applyPatch(docOf([tableWith()]), {
      op: "merge",
      blockId: "t",
      rows: [{ id: "r1", cells: { a: { text: "ONE" }, b: { text: "9" } }, expanded: true }],
    } as never);
    expect(forged.ok).toBe(true);
    if (forged.ok) {
      expect(expandedOf(forged.doc), "a far side cannot open a row by sending a flag").toBeUndefined();
    }
  });

  it("T2.123 (I24): form \"line\" requires an explicit height, and says which field", () => {
    const linePlot = (over: Record<string, unknown>): unknown =>
      validateBlock({
        kind: "plot", id: "pl", form: "line",
        series: [{ kind: "line", id: "s", points: [[0, 0], [1, 1]] }],
        ...over,
      });

    const bare = linePlot({}) as { ok: boolean; error?: readonly string[] };
    expect(bare.ok, "no default, because the one kind whose height is not derivable cannot have one").toBe(false);
    expect(bare.error?.join(" "), "naming the field").toMatch(/"height"/u);

    // The non-vacuity guard: a validator refusing both would satisfy the row
    // above and tell a reader nothing.
    expect((linePlot({ height: 6 }) as { ok: boolean }).ok, "and an explicit one validates").toBe(true);
  });

  it("T2.124 (I32): ColumnDef.role is schema — merge carries it and I9 does not protect it", () => {
    const types = readFileSync("src/data/viewmodel/types.ts", "utf8");
    const rowType = types.slice(types.indexOf("export type TableRow"), types.indexOf("export type MergeRow"));
    expect(rowType.replace(/\/\*[\s\S]*?\*\//gu, ""), "no row declares a role").not.toMatch(/^\s+(?:readonly )?role\??:/mu);
    expect(types, "the column does").toContain('role?: "expand";');

    const before = docOf([tableWith()]);
    const merged = applyPatch(before, {
      op: "merge",
      blockId: "t",
      rows: [{ id: "r1", cells: { a: { text: "ONE" }, b: { text: "9" } } }],
    } as never);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;

    const columnsOf = (d: unknown): unknown =>
      (d as { blocks: { columns: unknown }[] }).blocks[0]?.columns;
    // **Identity, not deep equality.** A rebuilt-but-equal column array is a
    // second record of the schema, and the day the two diverge nothing says so.
    expect(columnsOf(merged.doc), "the schema travels untouched through a merge").toBe(columnsOf(before));
  });

  it("T2.125 (I33): patch and comparison are distinct kinds — neither validates as the other", () => {
    const asPatch = validateBlock({
      kind: "comparison", id: "c", path: "f", language: "ts", hunks: [],
    }) as { ok: boolean; error?: readonly string[] };
    expect(asPatch.ok, "a comparison carrying a patch's fields").toBe(false);
    expect(asPatch.error?.join(" "), "wants its own rows").toMatch(/"rows"/u);

    const asComparison = validateBlock({
      kind: "patch", id: "p",
      rows: [{ id: "r", label: "L", before: "a", after: "b", verdict: "changed" }],
    }) as { ok: boolean; error?: readonly string[] };
    expect(asComparison.ok, "and a patch carrying a comparison's").toBe(false);
    expect(asComparison.error?.join(" "), "wants all three of its own").toMatch(/"path".*"language".*"hunks"/su);

    // The required sets are disjoint, which is what *never merge* means at the
    // type level: a merged kind's height would depend on which mode it was in,
    // and I7 — measured height equals rendered height — cannot bend (D50).
    expect(ALL_KINDS, "and both are members in their own right").toEqual(
      expect.arrayContaining(["patch", "comparison"] as unknown as BlockKind[]),
    );
  });

  it("T2.126 (I66): status carries its three numbers, and no tick derives one", () => {
    const status = (over: Record<string, unknown>): { ok: boolean; error?: readonly string[] } =>
      validateBlock({
        kind: "status", id: "st", state: "error", message: "the fetch failed", height: 3, ...over,
      }) as never;

    expect(status({}).ok, "the shape a builder produces").toBe(true);
    for (const [why, over, field] of [
      ["an empty message", { message: "" }, /"message"/u],
      ["a non-positive height", { height: 0 }, /"height"/u],
      ["an absent height", { height: undefined }, /"height"/u],
    ] as const) {
      const bad = status(over);
      expect(bad.ok, why).toBe(false);
      expect(bad.error?.join(" "), `${why}: naming its field (I57)`).toMatch(field);
    }

    /**
     * **Supplied rather than derived, measured rather than scanned.** `tick`
     * *is* read in `status.ts` — for the spinner frame, which is appearance —
     * so a source scan saying `tick` never appears would be false and a scan
     * saying it does would say nothing. What I66 forbids is a *number* computed
     * from it, and the frame is where that shows: four ticks, one moving cell.
     */
    const spinning = {
      kind: "status", id: "st", state: "loading", message: "fetching containers",
      height: 4, retryInMs: 4200, attempt: 3, elapsedMs: 9100,
    } as never;
    const frames = [0, 1, 7, 40].map((tick) =>
      measurable({ definitions: [], tick })
        .renderToLines(spinning, 60)
        .map((l) => l.replace(/\u001b\[[0-9;]*m/gu, "")),
    );
    const marks = frames.map((f) => f[2]?.slice(1, 2) ?? "");
    expect(new Set(marks).size, "the spinner does move, so the tick reached the renderer").toBeGreaterThan(1);
    for (const f of frames) {
      expect(f.map((l) => l.replace(/[\u2800-\u28ff]/gu, "·")), "and nothing else does").toEqual(
        frames[0]!.map((l) => l.replace(/[\u2800-\u28ff]/gu, "·")),
      );
    }
  });
});
