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
  groupChildWidth,
  insetWidth,
  normaliseWidth,
  validateBlock,
  validateDocument,
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
} from "../support/measurement-conformance.js";
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
  "diff",
  "patch",
  "pills",
  "tip",
  "panel",
  "group",
  "raw",
] as const;
const _exhaustive: readonly BlockKind[] & { length: 17 } = EXPECTED_KINDS;
void _exhaustive;

describe("C04 contract", () => {
  it("T2.10: every member of the Block union is validated, and the corpus covers all 17", () => {
    // Seventeen kinds ship (commitment 2). The corpus is what T2.1 will run
    // over once C09 exists, so a kind missing from it is a kind the headline
    // test would silently never see.
    expect([...ALL_KINDS].sort()).toEqual([...EXPECTED_KINDS].sort());

    for (const kind of EXPECTED_KINDS) {
      const fixture = ONE_PER_KIND[kind];
      expect(fixture, `${kind} needs a fixture`).toBeDefined();
      expect(validateBlock(fixture).ok, `${kind} must validate`).toBe(true);
    }
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
    expect(groupChildWidth("column", 80, 4), "column children get the full width").toBe(80);

    // floor((80 - 2) / 3) = 26, with one cell of gutter between each pair.
    expect(groupChildWidth("row", 80, 3)).toBe(26);
    expect(groupChildWidth("row", 80, 1), "one child, no gutter").toBe(80);
    expect(groupChildWidth("row", 80, 2)).toBe(39);
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
