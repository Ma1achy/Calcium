// A03 MG1/MG3 — the layer rule itself. Fabricated modules at layer paths, with
// the reader injected, so no fixture touches src/.
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { checkMarks, MARK_EXEMPTIONS } from "../../tools/enforce/source-scans.mjs";
import {
  checkModuleGraph,
  checkBuilderCoverage,
  BUILDER_OMISSIONS,
  checkOneStorePerComponent,
  STORE_SYMBOLS,
  storeNamesAreReal,
} from "../../tools/enforce/module-graph.mjs";

const check = (files: Record<string, string>) =>
  checkModuleGraph(Object.keys(files), (f) => files[f] ?? "");

describe("A03 module graph", () => {
  it("MG3: a type-only import across L0's halves IS an edge, and the reason it was not is the finding", () => {
    // **This row asserted the opposite for the life of the table, and its
    // justification was true.** It read:
    //
    //   > C01 needs C02's TerminalCapabilities while genuinely not importing
    //   > C02. The same shape across the halves is what this asserts is
    //   > permitted.
    //
    // The first sentence is correct. The second generalises it to a case where
    // the argument does not hold: C01 → C02 is `terminal/` → `terminal/`, where
    // no independence claim exists to break, and erasure settles it. **L0's
    // halves are a different claim** — A02 §1 protects each half type-checking
    // with the other absent, and a type-only edge is exactly what removes that.
    //
    // A true observation promoted to a general claim, and the third instance of
    // a correct sentence justifying a scope it does not reach (F84, F125, F127).
    // It is also why `make enforce` was green over the edge A03 §262 calls
    // hardest to undo: the rule worked, half its subject was invisible, and the
    // suite said so on purpose.
    const both = [
      `import type { Row } from "../data/viewmodel/index.js";`,
      `export type { Row } from "../data/viewmodel/index.js";`,
    ];
    for (const source of both) {
      const violations = check({ "src/terminal/lifecycle.ts": source });
      expect(violations, source).toHaveLength(1);
      expect(violations[0]!.rule).toBe("MG3");
      expect(violations[0]!.message).toContain("type-only");
    }
  });

  it("MG3: type-only *within* a half is still not an edge, which is the distinction", () => {
    // The control, and the half of the old row that was right. C01 naming C02's
    // capability record is `terminal/` → `terminal/`: MG3 has no business in it,
    // and a rule that fired here would be the arm firing on correct code.
    expect(
      check({
        "src/terminal/lifecycle.ts": `import type { TerminalCapabilities } from "./capabilities.js";`,
      }),
    ).toEqual([]);
    expect(
      check({
        "src/data/adapters/types.ts": `import type { RawResult } from "../transport/types.js";`,
      }),
    ).toEqual([]);
  });

  it("MG3: a value import of the same symbol is an edge, and fails", () => {
    const violations = check({
      "src/terminal/lifecycle.ts": `import { Row } from "../data/viewmodel/index.js";`,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("MG3");
    expect(violations[0]!.message).toContain("terminal → data");
  });

  it("MG3: an inline type import in a mixed statement still emits, so it is an edge", () => {
    // `import { type X, y }` keeps the statement at runtime — y is a real edge.
    const violations = check({
      "src/terminal/lifecycle.ts": `import { type Row, makeRow } from "../data/viewmodel/index.js";`,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("MG3");
  });

  it("MG1: an upward import fails; a downward one does not", () => {
    const up = check({
      "src/presentation/table.ts": `import { render } from "../viewport/viewport.js";`,
    });
    expect(up).toHaveLength(1);
    expect(up[0]!.rule).toBe("MG1");
    expect(up[0]!.message).toContain("L1 presentation → L2 viewport");

    expect(
      check({
        "src/viewport/viewport.ts": `import { render } from "../presentation/table.js";`,
      }),
    ).toEqual([]);
  });

  it("MG1: an upward type-only import is also not an edge", () => {
    expect(
      check({
        "src/presentation/table.ts": `import type { Viewport } from "../viewport/viewport.js";`,
      }),
    ).toEqual([]);
  });

  it("a bare side-effect import is still an edge", () => {
    const violations = check({
      "src/terminal/lifecycle.ts": `import "../data/transport.js";`,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe("MG3");
  });
});

describe("A03 MG23 — one store per component, above L0", () => {
  const stores = (files: Record<string, string>) =>
    checkOneStorePerComponent(Object.keys(files), (f) => files[f] ?? "");

  const srcFiles = (): string[] => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = `${dir}/${name}`;
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
      });
    return walk("src");
  };

  it("SS47: the real tree is clean, and every exemption still has a subject", () => {
    // **F116's row.** A rule whose only reader is a Makefile target is a rule a
    // `npm test` refactor can silence, and every other real-tree guard in this
    // file exists because that happened once already.
    //
    // The counter is read rather than the exit status: zero violations is the
    // same number for *clean* and for *the scan matched nothing*, so the second
    // assertion is what tells them apart — ten exemptions, each of which must
    // still find a mark or the bidirectional arm reports it.
    const files = srcFiles();
    expect(checkMarks(files), "run `make enforce` for the detail").toEqual([]);
    expect(Object.keys(MARK_EXEMPTIONS).length).toBeGreaterThan(0);
    for (const f of Object.keys(MARK_EXEMPTIONS)) {
      expect(files, `${f} is excused and must be in scope`).toContain(f);
    }
  });

  it("MG27: the real tree is clean, and the rule can see it", () => {
    // **The row the mutation pass asked for.** Deleting
    // `...(sort === undefined ? {} : { sort })` from `b.table` is caught by
    // `make enforce` and by nothing in the suite, so the mutation survived a
    // vitest run — which is a finding about where the guard lives, not about
    // the guard. A rule whose only reader is a Makefile target is a rule a
    // `npm test` refactor can silence.
    //
    // The counter is read, not the exit status: a rule matching nothing passes
    // exactly like a rule that is satisfied (A03 §2), and this is the arm that
    // tells them apart.
    const files = srcFiles();
    const violations = checkBuilderCoverage(files);
    expect(violations, "run `make enforce` for the detail").toEqual([]);

    // The subject exists, or the row above holds trivially. Both files must be
    // in `SOURCES` for the rule to have anything to compare.
    expect(files).toContain("src/data/viewmodel/types.ts");
    expect(files).toContain("src/shell/builders/index.ts");

    // And the reason list is non-empty, so the excusing arm is exercised by the
    // real tree rather than only by the fabrication.
    expect(Object.keys(BUILDER_OMISSIONS).length).toBeGreaterThan(0);
  });

  it("MG23: the real tree is clean, and the rule can see it", () => {
    // Corpus before cleanliness, for SP2's reason: a rule whose scopes stopped
    // matching reports no violations because it looked at nothing.
    const files = srcFiles().filter((f) =>
      /^src\/(presentation|viewport|interaction)\//.test(f),
    );
    expect(files.length, "L1–L3 files in scope").toBeGreaterThan(20);
    expect(checkOneStorePerComponent(srcFiles()).map((v) => v.message)).toEqual([]);
  });

  it("MG23's store names are all symbols the tree exports", () => {
    // **The rule's own vacuity, closed** — `modeOwnersAreReal`'s precedent. A
    // symbol nobody exports can never be imported, so a typo in `STORE_SYMBOLS`
    // is a row that reports compliance because it cannot find what it was asked
    // about. A03 §2's third clause, in the rule that cites it.
    expect(storeNamesAreReal(srcFiles())).toEqual([]);
    expect(Object.keys(STORE_SYMBOLS).length, "and it is a list, not an empty one")
      .toBeGreaterThan(8);
  });

  it("MG23: a component's own store is not a reach", () => {
    // **The false positive that gets a rule deleted**, and the first run's only
    // finding: `viewport.ts` declaring `Viewport` is C14 naming its own handle,
    // not C14 reaching for someone else's.
    expect(
      stores({
        "src/viewport/viewport/viewport.ts": [
          'import type { Viewport } from "./types.js";',
          'import type { TranscriptView } from "../transcript/index.js";',
        ].join("\n"),
      }),
      "its own plus one other is one reach",
    ).toEqual([]);
  });

  it("MG23 fires: two stores, neither of them the file's own", () => {
    const found = stores({
      "src/viewport/overlay/manager.ts": [
        'import type { TranscriptView } from "../transcript/index.js";',
        'import { createBlockRegistry } from "../../presentation/blocks/index.js";',
      ].join("\n"),
    });

    expect(found).toHaveLength(1);
    expect(found[0]?.rule).toBe("MG23");
    expect(found[0]?.message).toContain("C13");
    expect(found[0]?.message).toContain("C09");
  });

  it("MG23 counts a type-only import, because a reference is a reach", () => {
    // MG6 and MG19 both record this: a type-only import erases at build and so
    // passes every graph check that reads emitted edges. Holding two stores is a
    // fact about the component's design, not about its output.
    expect(
      stores({
        "src/interaction/completion/engine.ts": [
          'import type { TranscriptView } from "../../viewport/transcript/index.js";',
          'import type { ThemeStore } from "../../presentation/theme/index.js";',
        ].join("\n"),
      }),
    ).toHaveLength(1);
  });

  it("MG23 ignores a symbol that is not a store", () => {
    // C11 and C12 import C09's paint helpers and C10's tones, which CLAUDE.md
    // records as required rather than tolerated. Neither is a store, and a rule
    // that fired here would be one people route around.
    expect(
      stores({
        "src/presentation/table/render.ts": [
          'import { paintCell } from "../blocks/paint.js";',
          'import { toneOf } from "../theme/tones.js";',
        ].join("\n"),
      }),
    ).toEqual([]);
  });

  it("MG23 is out of scope below L1", () => {
    // "Above L0" qualifies the *component*, not the store: C06 reaching C05 is
    // L0 business with no component above it involved.
    expect(
      stores({
        "src/data/transport/factory.ts": [
          'import type { ManifestStore } from "../manifest/index.js";',
          'import type { AdapterRegistry } from "../adapters/index.js";',
        ].join("\n"),
      }),
    ).toEqual([]);
  });
});
